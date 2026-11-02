"""Pulls the text out of every printed v2 report the way a clinic's AI summarizer does (CUL-2292).

Two extractors, because summarizers differ in which one they sit on: pypdf (content-stream order)
and pdfminer.six (layout analysis). Writes <dir>/<name>.<paper>.<tool>.txt beside each PDF.

It also refuses a PDF whose sans is not Inter. The digit and punctuation losses this test exists
for (CUL-2385, CUL-2386) are a property of the face: under the runner's stock DejaVu, re-adding
tabular-nums stayed green (adversarial pass 1). So the face is asserted from the PDF itself, where
Chromium names what it embedded, not from fontconfig's answer about what it would pick.
Usage: python3 -I scripts/report-extract/extract.py <dir>
"""
import json
import logging
import pathlib
import sys

from pdfminer.high_level import extract_text as pdfminer_text
from pypdf import PdfReader


SANS_FALLBACKS = ("DejaVuSans", "LiberationSans", "Arimo", "Helvetica", "Arial", "Roboto", "Geist")


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
            if not any(f.startswith("Inter") for f in fonts) or any(f.startswith(SANS_FALLBACKS) for f in fonts):
                print(f"{pdf.name}: the sans is not Inter (embedded: {sorted(fonts)}); see fonts.conf", file=sys.stderr)
                return 1
            pages = [p.extract_text() or "" for p in reader.pages]
            (d / f"{name}.{paper}.pypdf.txt").write_text("\f".join(pages))
            (d / f"{name}.{paper}.pdfminer.txt").write_text(pdfminer_text(str(pdf)))
            n += 1
    print(f"extracted {n} PDFs with pypdf and pdfminer")
    return 0


if __name__ == "__main__":
    sys.exit(main())
