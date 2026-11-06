"""Builds the vet report v2's embedded faces (CUL-2291, row VR2-11; v2 spec §7).

Writes supabase/functions/generate-report/reportFontsV2.generated.ts: a Latin-subset WOFF2 of Geist
at the three weights the print stylesheet draws (400, 600, 700) and the one Newsreader sentence face
(400), each as base64, with their sizes and hashes.

WHY THE FIGURES ARE FROZEN. A PDF's text layer maps each drawn glyph back to a character through
the font's cmap. `font-variant-numeric: tabular-nums` draws Geist's tnum alternates, which no cmap
entry reaches, so extractors dropped them (CUL-2385: a flag line lost its 2). Here the tnum single
substitutions are written into the default cmap before subsetting, so the plain digit IS the tabular
glyph: the figures align with no CSS feature at all, and every digit keeps its character. Every
GSUB feature is then dropped (only GPOS kerning stays), so no contextual or ligature alternate can
reach a glyph outside the cmap either (CUL-2386 was Inter's `calt`).

Newsreader's default figures are already one width; the same freeze runs on it and is a no-op.

Usage: python3 -I scripts/report-fonts/build.py <repo root>   (needs fonttools and brotli)
The source TTFs are the app's own (@expo-google-fonts/geist 0.4.2, newsreader 0.4.1, SIL OFL 1.1,
no Reserved Font Name). Re-run after a bump; reportFonts.test.ts holds the byte budget, and the
print-survival job (scripts/report-extract/fonts.py) re-reads each face and checks the freeze.
"""
import base64
import hashlib
import io
import pathlib
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

# Latin-1, Latin Extended-A's common letters, and the punctuation, arrows and signs the report
# prints (measured over every v2 fixture: · × – — ’ “ ” † … ⅓ ⅔ → ≈ ≥ ▲ ○ ●). A character outside
# this set falls back down the stylesheet's family list; it never goes missing.
UNICODES = (
    list(range(0x20, 0x7F))
    + list(range(0xA0, 0x100))
    + list(range(0x100, 0x180))
    + [0x131, 0x2C6, 0x2DA, 0x2DC]
    + list(range(0x2010, 0x2028))
    + [0x2030, 0x2032, 0x2033, 0x2039, 0x203A, 0x2044, 0x20AC, 0x2122]
    + [0x2153, 0x2154, 0x2190, 0x2191, 0x2192, 0x2193, 0x2212, 0x2248, 0x2260, 0x2264, 0x2265]
    + [0x25B2, 0x25B3, 0x25BC, 0x25BD, 0x25CB, 0x25CF]
)

FACES = [
    # (family, weight, source relative to node_modules/@expo-google-fonts)
    ("Geist", 400, "geist/400Regular/Geist_400Regular.ttf"),
    ("Geist", 600, "geist/600SemiBold/Geist_600SemiBold.ttf"),
    ("Geist", 700, "geist/700Bold/Geist_700Bold.ttf"),
    ("Newsreader", 400, "newsreader/400Regular/Newsreader_400Regular.ttf"),
]

DIGITS = "0123456789"


def tnum_map(font: TTFont) -> dict:
    """Every single substitution the font's `tnum` feature makes, glyph name to glyph name."""
    out: dict = {}
    if "GSUB" not in font:
        return out
    table = font["GSUB"].table
    indices = {i for fr in table.FeatureList.FeatureRecord if fr.FeatureTag == "tnum" for i in fr.Feature.LookupListIndex}
    for i in sorted(indices):
        lookup = table.LookupList.Lookup[i]
        for st in lookup.SubTable:
            if lookup.LookupType == 7:  # extension
                st = st.ExtSubTable
            if not hasattr(st, "mapping"):
                raise SystemExit(f"tnum lookup {i} is not a single substitution; freeze it by hand")
            out.update(st.mapping)
    return out


def freeze_tnum(font: TTFont) -> int:
    """Points every cmap entry that `tnum` would substitute at its tabular glyph. Returns the count."""
    sub = tnum_map(font)
    n = 0
    for table in font["cmap"].tables:
        if not table.isUnicode():
            continue
        for cp, glyph in list(table.cmap.items()):
            if glyph in sub:
                table.cmap[cp] = sub[glyph]
                n += 1
    return n


def check(font: TTFont, label: str) -> None:
    """The properties the report relies on, asserted on the subset itself."""
    cmap = font.getBestCmap()
    advances = {font["hmtx"][cmap[ord(d)]][0] for d in DIGITS}
    if len(advances) != 1:
        raise SystemExit(f"{label}: the digits are not one width after the freeze: {sorted(advances)}")
    if "GSUB" in font:
        raise SystemExit(f"{label}: a GSUB table survived the subset")
    missing = [chr(c) for c in UNICODES if c not in cmap and chr(c).isdigit()]
    if missing:
        raise SystemExit(f"{label}: digits missing from the cmap: {missing}")


def build(root: pathlib.Path) -> list:
    src = root / "node_modules" / "@expo-google-fonts"
    out = []
    for family, weight, rel in FACES:
        font = TTFont(str(src / rel))
        frozen = freeze_tnum(font)
        opts = subset.Options()
        opts.flavor = "woff2"
        opts.layout_features = ["kern"]  # GPOS kerning only: no GSUB alternate can reach a glyph
        # Hinting KEPT. Stripped, Chromium 153 (Playwright 1.63, the extraction job's) printed Geist with
        # glyph positions the PDF's widths did not predict, and pdfminer and pypdf read a space after
        # every o, a, s and J ("o wner", "windo w"): measured on CI 2026-11-06, gone with hints kept.
        opts.hinting = True
        opts.desubroutinize = True
        opts.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]  # family, style, version, PostScript name, licence
        opts.notdef_outline = True
        opts.drop_tables += ["GSUB"]  # dropped whole: an empty table still reads as "has substitutions"

        sub = subset.Subsetter(opts)
        sub.populate(unicodes=UNICODES)
        sub.subset(font)
        buf = io.BytesIO()
        font.flavor = "woff2"
        font.recalcTimestamp = False  # the head date stays the source's, so a re-run is byte-identical
        font.save(buf)
        data = buf.getvalue()
        check(TTFont(io.BytesIO(data)), f"{family} {weight}")
        out.append((family, weight, frozen, data))
        print(f"{family} {weight}: {frozen} cmap entries frozen to tnum, {len(data)} bytes woff2", file=sys.stderr)
    return out


def emit(faces: list) -> str:
    lines = [
        "// GENERATED by scripts/report-fonts/build.py (CUL-2291, row VR2-11). Do not edit by hand: re-run the script.",
        "// Latin-subset WOFF2 faces for the vet report v2 print render, tabular figures frozen into the",
        "// default cmap and every GSUB feature dropped (see the script's header for why). SIL OFL 1.1:",
        "// Geist (c) 2024 The Geist Project Authors; Newsreader (c) 2020 The Newsreader Project Authors.",
        "",
        "export interface ReportFontFace {",
        "  family: 'Geist' | 'Newsreader'",
        "  weight: 400 | 600 | 700",
        "  /** How many cmap entries the build pointed at a tabular glyph (0 where the default was already tabular). */",
        "  frozenTnum: number",
        "  bytes: number",
        "  sha256: string",
        "  woff2Base64: string",
        "}",
        "",
        "export const REPORT_FONT_FACES: readonly ReportFontFace[] = [",
    ]
    for family, weight, frozen, data in faces:
        b64 = base64.b64encode(data).decode("ascii")
        digest = hashlib.sha256(data).hexdigest()
        lines.append(
            f"  {{ family: '{family}', weight: {weight}, frozenTnum: {frozen}, bytes: {len(data)}, sha256: '{digest}', woff2Base64: '{b64}' }},"
        )
    lines.append("]")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    faces = build(root)
    target = root / "supabase" / "functions" / "generate-report" / "reportFontsV2.generated.ts"
    target.write_text(emit(faces))
    print(f"wrote {target.relative_to(root)} ({sum(len(d) for *_, d in faces)} bytes of woff2)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
