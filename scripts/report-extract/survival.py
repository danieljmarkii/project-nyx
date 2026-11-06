"""The print-survival test (CUL-2291, row VR2-11; v2 spec §7): a sent report gets printed,
photocopied and scanned, and the marks that carry its facts have to come out the other side.

THE COPY. Each sheet 1 that survival.mjs printed is rasterised at 200 dpi in grey, then degraded the
way a copier degrades a page: a Gaussian blur of BLUR_PX (0.75 px at 200 dpi, about 0.1 mm: the
optics' spread), then a hard threshold at half grey to pure black and white. On that page:
  1. LABELS. Every chart label drawn at 7pt or more (the row labels, the dates and part-column
     labels under the axis, the flag's bracket), the QR's caption and the colophon ("not a
     diagnosis", the date, the report id, the sheet count) read back through OCR (tesseract). No
     chart text is drawn under 7pt.
     BLIND SPOT, stated so it never reads as coverage: the counts over the bars ("4 of 12",
     "1 in 6 d", "2") are not OCR'd. They print crisply on the copy, but tesseract misreads bold 8pt
     figures with tight word spacing at any enlargement (measured: "4o0f 12", "1inéd"). Every count
     is also printed in body type in the text twin under the chart, which the extraction test holds.
  2. FILLED vs HOLLOW. A filled bar stays solid ink inside; a hollow ("so far") bar keeps its outline
     and paper inside it, so the two never merge. A solid course line stays unbroken; a hollow
     (dashed) one keeps its gaps.
  3. HATCH. "Nothing logged" stays a hatch: visibly inked, and visibly not a solid fill.
  4. THE QR decodes (zxing-cpp) to exactly the URL the report names, with no query string or
     fragment, its modules at least 0.5 mm on the raster. The caption sits on one line (measured
     in the browser by survival.mjs).

WHERE EACH MARK IS. survival.mjs printed the sheet again with each mark class hidden; the pixels the
two clean rasters disagree on are that class's footprint, split into one instance per connected blob.
Nothing is located by hand, and a mark that moves is still found. A class the sheet draws but the
raster does not show fails, and a run where no fixture draws a class fails (no vacuous green).

The chart's page is found the same way (the one page where hiding its labels changes the raster), and
the QR closes sheet 1, so its code and caption are read on the last page.

Usage: python3 -I scripts/report-extract/survival.py <dir> [--keep]   (--keep saves the degraded pages)
"""
import difflib
import json
import os
import pathlib
import re
import subprocess
import sys
import tempfile
import unicodedata

import numpy as np
import zxingcpp
from PIL import Image, ImageFilter

DPI = 200
BLUR_PX = 0.75
THRESHOLD = 128
MODULE_MM_MIN = 0.5
# One thread: tesseract's OpenMP workers spin against each other on a busy runner, and a one-second
# read was measured taking minutes.
TESSERACT_ENV = {**os.environ, "OMP_THREAD_LIMIT": "1"}
MARKS = ("filled", "hollow", "solid", "dashed", "hatch", "qr")
# The pieces of one mark that the footprint can split (a dashed line's dashes, a hatched cell's
# strokes, a QR's modules) are joined by growing each pixel this far before counting blobs.
JOIN = {"hatch": 8, "dashed": 5, "solid": 5}  # the hatch's strokes run 11px apart at 200 dpi


def page_count(pdf: pathlib.Path) -> int:
    info = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True, check=True).stdout
    return int(re.search(r"^Pages:\s+(\d+)", info, re.M).group(1))


def raster(pdf: pathlib.Path, tmp: pathlib.Path, page: int, dpi: int = DPI) -> np.ndarray:
    """One page of the PDF as a grey array (0 ink, 255 paper); page -1 is the last. PGM, not PNG:
    nothing is encoded that is read straight back."""
    if page == -1:
        page = page_count(pdf)
    out = tmp / f"{pdf.stem}-p"
    subprocess.run(["pdftoppm", "-r", str(dpi), "-gray", "-singlefile", "-f", str(page), "-l", str(page), str(pdf), str(out)], check=True)
    pgm = out.parent / f"{out.name}.pgm"
    a = np.array(Image.open(pgm).convert("L"))
    pgm.unlink()
    return a


def degrade(grey: np.ndarray) -> np.ndarray:
    """Blur, then threshold: True where the copy has ink."""
    blurred = Image.fromarray(grey).filter(ImageFilter.GaussianBlur(BLUR_PX))
    return np.array(blurred) < THRESHOLD


def grow(m: np.ndarray, n: int, ny: int | None = None) -> np.ndarray:
    """Grows the mask by n pixels sideways and ny (default n) up and down."""
    ny = n if ny is None else ny
    for i in range(max(n, ny)):
        g = m.copy()
        if i < ny:
            g[1:, :] |= m[:-1, :]
            g[:-1, :] |= m[1:, :]
        if i < n:
            g[:, 1:] |= m[:, :-1]
            g[:, :-1] |= m[:, 1:]
        m = g
    return m


def blobs(mask: np.ndarray, join: int = 0, join_y: int | None = None) -> list:
    """Bounding boxes (y0, x0, y1, x1; end exclusive) of the mask's 4-connected blobs, after growing
    it by `join` sideways and `join_y` (default `join`) up and down, so the pieces of one mark (a
    dashed line's dashes, a hatched cell's strokes, a label's letters) count as one. Run-length
    labelling with union-find: each row's runs join the overlapping runs of the row above."""
    ys, xs = np.nonzero(mask)
    if len(ys) == 0:
        return []
    jy = join if join_y is None else join_y
    pad = max(join, jy) + 1
    oy, ox = max(0, ys.min() - pad), max(0, xs.min() - pad)
    sub = grow(mask[oy : ys.max() + pad + 1, ox : xs.max() + pad + 1], join, jy)
    parent: list = []
    box: list = []

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    prev: list = []
    for y in range(sub.shape[0]):
        row = np.concatenate(([0], sub[y].astype(np.int8), [0]))
        edges = np.flatnonzero(np.diff(row))
        cur = []
        for x0, x1 in zip(edges[::2], edges[1::2]):
            i = len(parent)
            parent.append(i)
            box.append([y, x0, y + 1, x1])
            for (px0, px1, j) in prev:
                if px0 < x1 and x0 < px1:
                    a, b = find(i), find(j)
                    if a != b:
                        parent[b] = a
            cur.append((x0, x1, i))
        prev = cur
    merged: dict = {}
    for i, (y0, x0, y1, x1) in enumerate(box):
        r = find(i)
        m = merged.setdefault(r, [y0, x0, y1, x1])
        m[0], m[1], m[2], m[3] = min(m[0], y0), min(m[1], x0), max(m[2], y1), max(m[3], x1)
    out = []
    for (y0, x0, y1, x1) in merged.values():
        y0, x0, y1, x1 = y0 + jy, x0 + join, y1 - jy, x1 - join
        if y1 > y0 and x1 > x0:
            out.append((oy + y0, ox + x0, oy + y1, ox + x1))
    return out


def footprint(base: np.ndarray, hidden: np.ndarray) -> np.ndarray:
    if base.shape != hidden.shape:
        raise SystemExit("hiding a mark changed the page size")
    return np.abs(base.astype(int) - hidden.astype(int)) > 24


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9%]", "", s.lower())


def ocr_lines(ink: np.ndarray, region: np.ndarray, tmp: pathlib.Path, keep: pathlib.Path | None = None) -> list:
    """OCR of the copy, one label to a line: the region's footprint is split into lines of text
    (pixels joined sideways across a word space, never across a line), each cropped to the label's
    own pixels (a bar or a tick beside it is not the label), and the crops are stacked, left-aligned
    with white between them, for one read as a block. A read of the whole chart guesses a layout
    around the marks and drops labels a person reads at a glance; stacked, it reads what is printed."""
    crops = []
    near = grow(region, 3)
    for (y0, x0, y1, x1) in sorted(blobs(region, 9, 1)):
        if (y1 - y0) < 6:
            continue
        y0, y1 = max(0, y0 - 4), min(ink.shape[0], y1 + 4)
        x0, x1 = max(0, x0 - 4), min(ink.shape[1], x1 + 4)
        crops.append(np.where(ink[y0:y1, x0:x1] & near[y0:y1, x0:x1], 0, 255).astype(np.uint8))
    if not crops:
        return []
    w = max(c.shape[1] for c in crops) + 40
    sheet = np.vstack([np.pad(c, ((14, 14), (20, w - c.shape[1] - 20)), constant_values=255) for c in crops])
    img = tmp / "ocr.png"
    # Read enlarged, twice and three times: tesseract's glyph models want more pixels than a 7.5pt
    # label has at 200 dpi, and each scale misreads different glyphs ("Jun 8" as "Jung" at one).
    # The copy's damage is already in the pixels; enlarging adds none back, so the union of the two
    # reads forgives a misread and never a loss.
    if keep is not None:
        Image.fromarray(sheet).save(keep)
    out = []
    for k in (2, 3):
        Image.fromarray(sheet).resize((sheet.shape[1] * k, sheet.shape[0] * k), Image.LANCZOS).save(img, dpi=(DPI * k, DPI * k))
        res = subprocess.run(["tesseract", str(img), "-", "--psm", "6", "--dpi", str(DPI * k)], capture_output=True, text=True, check=True, env=TESSERACT_ENV)
        out += [l for l in res.stdout.splitlines() if l.strip()]
    return out


# Glyphs OCR confuses with a figure in a geometric sans at this size (Geist's 1 has no foot).
CONFUSED = {"0": set("0o"), "1": set("1il|")}


def same_glyph(w: str, g: str) -> bool:
    return w == g or g in CONFUSED.get(w, ()) or w in CONFUSED.get(g, ())


def reads_back(label: str, lines: list) -> bool:
    """A label reads back when some OCR'd line holds it, aligned character by character (spaces
    dropped: OCR fuses "Jun 12" into "Juni2" where the face sets the space narrow). It forgives a
    misread glyph and never a loss:
      • every figure aligns with the same figure, or a glyph OCR confuses with it (0 and o; 1, i, l);
      • no edit drops or rewrites more than ONE character of the label, so a lost word fails
        ("Meals finished" for "Meals not finished", "On" for "Off");
      • nothing figure-like is added beside a figure ("Oct l1" for "Oct 1"), and no figure anywhere;
      • the whole matches at 85% or better, after the glyph fold.
    Adversarial pass 1 on PR-11 broke the first version with a dropped "not"."""
    want = norm(label)
    fold = str.maketrans({"o": "0", "i": "1", "l": "1", "|": "1"})
    figure_like = set("0123456789oil|")
    for line in lines:
        got = norm(unicodedata.normalize("NFKD", line))
        if want == got:
            return True
        if difflib.SequenceMatcher(None, want.translate(fold), got.translate(fold), autojunk=False).ratio() < 0.85:
            continue
        ok = True
        for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, want, got, autojunk=False).get_opcodes():
            w, g = want[i1:i2], got[j1:j2]
            if op == "equal":
                continue
            if op == "insert":
                beside = want[i1 - 1 : i1] + want[i1 : i1 + 1]
                ok = not any(c.isdigit() for c in g) and not (any(c.isdigit() for c in beside) and any(c in figure_like for c in g))
            elif op == "delete":
                ok = len(w) == 1 and not w.isdigit()
            elif len(w) != 1 or len(g) > 2:  # replace: one character of the label, never a word
                ok = False
            elif w.isdigit():  # a figure stays that figure, or the one glyph OCR confuses with it
                ok = len(g) == 1 and same_glyph(w, g)
            else:  # a misread letter, but never one read as a figure it is not
                ok = not any(c.isdigit() and not same_glyph(w, c) for c in g)
            if not ok:
                break
        if ok:
            return True
    return False


def check_mark(mark: str, region: np.ndarray, where: str, facts: dict) -> list:
    h, w = region.shape
    if mark == "filled":
        inner = region[1:-1, 1:-1] if h > 2 and w > 2 else region
        share = inner.mean()
        return [] if share >= 0.9 else [f"{where}: a filled bar is {share:.0%} ink inside after the copy; it reads as hollow"]
    if mark == "hollow":
        # Inset past the outline (1.2pt, about 3px at 200 dpi) and the blur's spread.
        if h < 12 or w < 12:
            return [f"{where}: a hollow bar is too small to keep paper inside ({w}×{h}px)"]
        inner = region[5:-5, 5:-5]
        rim = np.concatenate([region[0, :], region[-1, :], region[:, 0], region[:, -1]])
        out = []
        if inner.mean() > 0.1:
            out.append(f"{where}: a hollow bar is {inner.mean():.0%} ink inside after the copy; it reads as filled")
        if rim.mean() < 0.6:
            out.append(f"{where}: a hollow bar's outline is {rim.mean():.0%} ink after the copy; it disappears")
        return out
    if mark in ("solid", "dashed"):
        # Along the line (its end ticks joined in): the columns that hold any ink. A course shorter
        # than its own tick is still checked (adversarial pass 1 drew a 6pt hollow course solid).
        profile = region.any(axis=0)
        trimmed = profile[2:-2] if len(profile) > 6 else profile
        gaps = sum(1 for i in range(1, len(trimmed)) if trimmed[i - 1] and not trimmed[i])
        if mark == "solid" and not trimmed.all():
            return [f"{where}: a solid course line breaks into {gaps + 1} pieces after the copy; it reads as dashed"]
        # Dashes repeat every 5pt (14px at 200 dpi): a line of 16px must show a gap, one of 40px two.
        need = 2 if w > 40 else 1 if w >= 16 else 0
        if mark == "dashed" and gaps < need:
            return [f"{where}: a dashed (hollow) course line keeps {gaps} gap(s) after the copy; it reads as solid"]
        return []
    if mark == "hatch":
        share = region.mean()
        if share < 0.08:
            return [f"{where}: hatch is {share:.0%} ink after the copy; it reads as paper"]
        if share > 0.7:
            return [f"{where}: hatch is {share:.0%} ink after the copy; it reads as a solid fill"]
        return []
    return []


def check_sheet(d: pathlib.Path, name: str, paper: str, tmp: pathlib.Path, keep: bool) -> tuple:
    stem = f"{name}.{paper}"
    at = f"{name} · {paper}"
    facts = json.loads((d / f"{stem}.survival.json").read_text())
    fails, stats = [], {"labels": 0, "marks": {m: 0 for m in MARKS}}
    # The chart's page: wherever hiding its labels changes the raster (a long band pushes it to page 2).
    pages = page_count(d / f"{stem}.base.pdf")
    chart = 1
    if facts["present"].get("labels", 0) > 0:
        # A coarse pass is enough to tell the pages apart.
        hits = [p for p in range(1, pages + 1) if footprint(raster(d / f"{stem}.base.pdf", tmp, p, 40), raster(d / f"{stem}.labels.pdf", tmp, p, 40)).any()]
        if len(hits) != 1:
            return [f"{at}: the chart's labels were found on pages {hits}, not one page"], stats
        chart = hits[0]
    clean = {chart: raster(d / f"{stem}.base.pdf", tmp, chart), -1: raster(d / f"{stem}.base.pdf", tmp, -1)}
    ink = {p: degrade(g) for p, g in clean.items()}
    if keep:
        for p, a in ink.items():
            Image.fromarray(np.where(a, 0, 255).astype(np.uint8)).save(d / f"{stem}.degraded-{'last' if p == -1 else p}.png")

    def region(cls: str, page: int):
        if facts["present"].get(cls, 0) == 0:
            return None
        return footprint(clean[page], raster(d / f"{stem}.{cls}.pdf", tmp, page))

    # 1. Labels.
    for l in facts["labels"]:
        if l["pt"] < 7:  # counts included: none may be drawn smaller
            fails.append(f"{at}: a chart label is drawn under 7pt ({l['pt']}pt): \"{l['text']}\"")
    lines = []
    labels_at = region("labels", chart)
    if labels_at is not None:
        lines += ocr_lines(ink[chart], labels_at, tmp, d / f"{stem}.ocr-labels.png" if keep else None)
    caption_at = region("caption", -1)
    if caption_at is not None:
        lines += ocr_lines(ink[-1], caption_at, tmp)
    colophon_at = region("colophon", -1)
    if colophon_at is not None:
        lines += ocr_lines(ink[-1], colophon_at, tmp, d / f"{stem}.ocr-colophon.png" if keep else None)
    wanted = [l["text"] for l in facts["labels"] if l["pt"] >= 7 and not l["cls"].startswith("cnt")]
    if facts["caption"]:
        wanted.append(facts["caption"]["text"])
        if facts["caption"]["lines"] != 1:
            fails.append(f"{at}: the QR caption wraps onto {facts['caption']['lines']} lines")
    if facts.get("colophon"):
        wanted.append(facts["colophon"]["text"])
    for label in wanted:
        stats["labels"] += 1
        if not reads_back(label, lines):
            fails.append(f"{at}: the label \"{label}\" did not OCR after the copy")

    # 2–3. The chart's marks, on the chart's page.
    for mark in ("filled", "hollow", "solid", "dashed", "hatch"):
        fp = region(mark, chart)
        if fp is None:
            continue
        for (y0, x0, y1, x1) in blobs(fp, JOIN.get(mark, 0)):
            if (y1 - y0) * (x1 - x0) < 6:
                continue  # an anti-aliased edge, not a mark
            stats["marks"][mark] += 1
            fails += check_mark(mark, ink[chart][y0:y1, x0:x1], f"{at} ({x0},{y0} {x1 - x0}×{y1 - y0}px)", facts)
        if stats["marks"][mark] == 0:
            fails.append(f"{at}: the sheet draws {facts['present'][mark]} {mark} mark(s); none was found on page {chart}'s raster")

    # 4. The QR, on the last page.
    fp = region("qr", -1)
    if fp is not None:
        stats["marks"]["qr"] += 1
        ys, xs = np.nonzero(fp)
        if len(xs) == 0:
            fails.append(f"{at}: the QR was not found on the last page")
        else:
            mm = ((xs.max() + 1 - xs.min()) / facts["qrModules"]) * 25.4 / DPI
            if mm < MODULE_MM_MIN:
                fails.append(f"{at}: QR modules print at {mm:.2f} mm, under {MODULE_MM_MIN} mm")
        img = Image.fromarray(np.where(ink[-1], 0, 255).astype(np.uint8))
        found = [r.text for r in zxingcpp.read_barcodes(img) if r.format == zxingcpp.BarcodeFormat.QRCode]
        url = facts["qrUrl"]
        if found != [url]:
            fails.append(f"{at}: the QR decoded to {found} after the copy, not [{url!r}]")
        if url is None or "?" in url or "#" in url:
            fails.append(f"{at}: the QR's URL carries a query string or a fragment: {url}")
    return fails, stats


def main() -> int:
    d = pathlib.Path(sys.argv[1])
    keep = "--keep" in sys.argv
    names = [n[: -len(".s1")] for n in json.loads((d / "fixtures.json").read_text()) if n.endswith(".s1")]
    fails, labels, marks = [], 0, {m: 0 for m in MARKS}
    with tempfile.TemporaryDirectory() as t:
        tmp = pathlib.Path(t)
        for name in names:
            for paper in ("A4", "Letter"):
                f, s = check_sheet(d, name, paper, tmp, keep)
                fails += f
                labels += s["labels"]
                for m in MARKS:
                    marks[m] += s["marks"][m]
    for m in MARKS:
        if marks[m] == 0:
            fails.append(f"no fixture drew a {m} mark: the survival test checks nothing for it")
    if labels == 0:
        fails.append("no label was checked")
    summary = ", ".join(f"{marks[m]} {m}" for m in MARKS)
    if fails:
        print(f"{len(fails)} print-survival failures ({labels} labels, {summary}):", file=sys.stderr)
        for f in fails:
            print(f"  ✗ {f}", file=sys.stderr)
        return 1
    print(f"print survival green: {len(names)} sheets × 2 papers at {DPI} dpi, blur {BLUR_PX}px, threshold {THRESHOLD}: {labels} labels read, {summary}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
