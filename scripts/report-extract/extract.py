"""Pulls the text out of every printed v2 report the way a clinic's AI summarizer does (CUL-2292).

Two extractors, because summarizers differ in which one they sit on: pypdf (content-stream order)
and pdfminer.six (layout analysis). Writes <dir>/<name>.<paper>.<tool>.txt beside each PDF.

It also refuses a PDF printed in any face but the report's own. Since VR2-11 (CUL-2291) the print
render embeds its faces (Geist, and Newsreader for the one serif sentence, tabular figures frozen
into each cmap), so every face Chromium embeds must be one of those, Geist-Regular among them: a
fallback face means a glyph left the subset or a face never loaded, and the PDF measured is not the
one an owner sends. The face is read from the PDF itself, where Chromium names what it embedded.

`--face inter` is run.sh's canary: the embedded faces are cut out, the sans falls to Inter
(fonts.conf), the face CUL-2385 and CUL-2386 were measured in, and tabular-nums is planted. The
check must go red there, or it measures nothing.
Usage: python3 -I scripts/report-extract/extract.py <dir>
"""
import json
import logging
import pathlib
import sys

from pdfminer.high_level import extract_text as pdfminer_text
from pypdf import PdfReader


# An allowlist, not a denylist: pass 2 of CUL-2292 printed the regular weight in FreeSans with the
# bold still in the expected face, and a list of known fallbacks let it through.
FACES = {
    "embedded": (("Geist", "Newsreader"), "Geist-Regular"),
    "inter": (("Inter", "LiberationSerif"), "Inter-Regular"),
}


def face_problem(fonts: set, mode: str = "embedded") -> str | None:
    allowed, body = FACES[mode]
    if body not in fonts:
        return f"no {body} (the body face)"
    stray = sorted(f for f in fonts if not f.startswith(allowed))
    return f"faces outside {' and '.join(allowed)}: {stray}" if stray else None


def embedded_fonts(reader: PdfReader) -> set:
    names = set()
    for page in reader.pages:
        fonts = (page.get("/Resources") or {}).get("/Font") or {}
        for ref in fonts.values():
            font = ref.get_object()
            name = font.get("/BaseFont")
            desc = font.get("/FontDescriptor")
            if name is None and desc is not None:
                name = desc.get_object().get("/FontName")
            if name is not None:
                names.add(str(name).split("+", 1)[-1].lstrip("/"))
    return names


def main() -> int:
    # pdfminer warns once per glyph run about Chromium's Type 3 font descriptors; the text is unaffected.
    logging.getLogger("pdfminer").setLevel(logging.ERROR)
    d = pathlib.Path(sys.argv[1])
    mode = sys.argv[3] if len(sys.argv) > 3 and sys.argv[2] == "--face" else "embedded"
    names = json.loads((d / "fixtures.json").read_text())
    n = 0
    for name in names:
        for paper in ("A4", "Letter"):
            pdf = d / f"{name}.{paper}.pdf"
            if not pdf.exists():
                print(f"missing {pdf}", file=sys.stderr)
                return 1
            reader = PdfReader(str(pdf))
            fonts = embedded_fonts(reader)
            problem = face_problem(fonts, mode)
            if problem:
                print(f"{pdf.name}: {problem} (embedded: {sorted(fonts)}); see printAssetsV2.ts and fonts.conf", file=sys.stderr)
                return 1
            pages = [p.extract_text() or "" for p in reader.pages]
            (d / f"{name}.{paper}.pypdf.txt").write_text("\f".join(pages))
            (d / f"{name}.{paper}.pdfminer.txt").write_text(pdfminer_text(str(pdf)))
            n += 1
    print(f"extracted {n} PDFs with pypdf and pdfminer")
    return 0


if __name__ == "__main__":
    sys.exit(main())
