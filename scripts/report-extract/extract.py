"""Pulls the text out of every printed v2 report the way a clinic's AI summarizer does (CUL-2292).

Two extractors, because summarizers differ in which one they sit on: pypdf (content-stream order)
and pdfminer.six (layout analysis). Writes <dir>/<name>.<paper>.<tool>.txt beside each PDF.
Usage: python3 -I scripts/report-extract/extract.py <dir>
"""
import json
import logging
import pathlib
import sys

from pdfminer.high_level import extract_text as pdfminer_text
from pypdf import PdfReader


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
            pages = [p.extract_text() or "" for p in PdfReader(str(pdf)).pages]
            (d / f"{name}.{paper}.pypdf.txt").write_text("\f".join(pages))
            (d / f"{name}.{paper}.pdfminer.txt").write_text(pdfminer_text(str(pdf)))
            n += 1
    print(f"extracted {n} PDFs with pypdf and pdfminer")
    return 0


if __name__ == "__main__":
    sys.exit(main())
