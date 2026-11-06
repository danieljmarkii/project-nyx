// The v2 print render's embedded faces and its QR (CUL-2291, row VR2-11; v2 spec §5.10, §7).
//
// FACES. `reportFontsV2.generated.ts` holds a Latin-subset WOFF2 of Geist (400, 600, 700) and the
// one Newsreader sentence face, tabular figures frozen into each default cmap and every GSUB feature
// dropped (scripts/report-fonts/build.py). So the figures align with no `font-variant-numeric` at
// all, and every drawn digit maps back to its character in the PDF's text layer (CUL-2385, CUL-2386).
// `font-display: swap`: were a print ever to run before a face decodes, the fallback stack prints the
// words; `block` would print nothing in their place.
//
// THE BUDGET. Every report carries the faces inline, so they are held to a byte budget
// (reportFonts.test.ts): a re-subset that pulls in a script's worth of glyphs fails there, not in a
// slow send.
//
// THE QR. Tokenless: the URL names the product, never a pet, a report or an owner (no query string,
// no fragment; reportQrV2.test.ts). It points at the consumer landing until getculprit.app/vets
// (CUL-282) is live; repointing is scripts/report-qr/gen.mjs, which writes the URL and the matrix
// together. Drawn black on white with modules of QR_MODULE_MM (at least 0.5 mm) inside a 4-module
// quiet zone, its caption on one line. Print only: the phone reflow never draws it.
import { REPORT_FONT_FACES } from './reportFontsV2.generated.ts'
import { REPORT_QR_MATRIX, REPORT_QR_URL } from './reportQrV2.generated.ts'
import { h } from './documentV2.ts'

export { REPORT_FONT_FACES, REPORT_QR_MATRIX, REPORT_QR_URL }

/** WOFF2 bytes, before base64 (which adds a third). Measured 2026-11-06: 11.8 / 12.2 / 12.2 / 25.8 KB. */
export const FONT_BYTE_BUDGET = { perFace: 30_000, total: 72_000 } as const

/** The `@font-face` rules for every embedded face. */
export function reportFontFaceCss(): string {
  return REPORT_FONT_FACES.map(
    (f) =>
      `@font-face{font-family:"${f.family}";font-style:normal;font-weight:${f.weight};font-display:swap;src:url(data:font/woff2;base64,${f.woff2Base64}) format("woff2");}`,
  ).join('\n')
}

/** One module's side on paper. The spec's floor is 0.5 mm; 0.6 leaves room for a copier's spread. */
export const QR_MODULE_MM = 0.6
/** The quiet zone, in modules, on every side (ISO/IEC 18004 asks for 4). */
export const QR_QUIET_MODULES = 4

/** What the caption prints: the URL as a person types it, so it repoints with the QR. */
export function qrCaption(url: string = REPORT_QR_URL): string {
  return url.replace(/^https:\/\//, '').replace(/\/$/, '')
}

/** The QR as inline SVG at its printed size, in millimetres, runs of dark modules merged. */
export function qrSvgV2(matrix: readonly string[] = REPORT_QR_MATRIX, url: string = REPORT_QR_URL): string {
  const n = matrix.length
  const dim = n + QR_QUIET_MODULES * 2
  const mm = (dim * QR_MODULE_MM).toFixed(2)
  let rects = ''
  for (let y = 0; y < n; y++) {
    const row = matrix[y]
    let x = 0
    while (x < n) {
      if (row[x] !== '1') {
        x++
        continue
      }
      let run = 1
      while (x + run < n && row[x + run] === '1') run++
      rects += `<rect x="${x + QR_QUIET_MODULES}" y="${y + QR_QUIET_MODULES}" width="${run}" height="1"/>`
      x += run
    }
  }
  return (
    `<svg class="qr" width="${mm}mm" height="${mm}mm" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges" role="img" aria-label="QR code linking to ${h(qrCaption(url))}">` +
    `<rect width="${dim}" height="${dim}" fill="#ffffff"/><g fill="#000000">${rects}</g></svg>`
  )
}

/** The colophon's QR block: the code over its one-line caption. */
export function qrBlockV2(): string {
  return `<div class="qrblock" data-qr="${h(REPORT_QR_URL)}">${qrSvgV2()}<span class="qrcap">${h(qrCaption())}</span></div>`
}

/** The styles the faces and the QR need (the print stylesheet appends them). */
export const PRINT_ASSET_STYLE = `
.colo.withqr{display:flex;justify-content:space-between;align-items:flex-end;gap:12pt;}
.colo .colotext{flex:1 1 auto;min-width:0;}
.qrblock{flex:none;display:flex;flex-direction:column;align-items:center;gap:1.5pt;break-inside:avoid;}
svg.qr{display:block;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.qrcap{font-size:7.5pt;line-height:1.2;color:var(--ink);white-space:nowrap;}`
