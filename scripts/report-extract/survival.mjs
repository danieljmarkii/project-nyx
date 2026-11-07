// The print-survival test's print pass (CUL-2291, row VR2-11; v2 spec §7). For each dumped v2
// sheet 1 (`<name>.s1.html`) it prints, on A4 and Letter:
//   • `<name>.<paper>.base.pdf`, the sheet as an owner sends it;
//   • one `<name>.<paper>.<mark>.pdf` per mark class, with only that class hidden
//     (`visibility: hidden` keeps the layout, so the two PDFs differ by exactly that mark's pixels;
//     survival.py rasterises both and takes the difference as the mark's footprint, so no
//     coordinate is ever mapped from CSS to the page by hand).
// It also writes `<name>.<paper>.survival.json`: the chart labels the sheet draws at 7pt or more
// (what OCR must read back), whether the QR caption sits on one line, and which marks are present.
// Usage: node scripts/report-extract/survival.mjs <dir>   (reads <dir>/fixtures.json)
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

/** Each mark the survival test reads, and the selector that is hidden to find it. */
export const MARKS = {
  filled: 'svg.chart rect.bar:not(.sofar)',
  hollow: 'svg.chart rect.bar.sofar',
  solid: 'svg.chart line.span:not(.hollow):not(.dose):not(.open)',
  dashed: 'svg.chart line.span.hollow',
  hatch: 'svg.chart .hatch',
  qr: 'svg.qr',
  // Not marks: the regions OCR reads (every chart label, and the QR's caption).
  labels: 'svg.chart text',
  caption: '.qrcap',
  colophon: '.colo .colotext',
}

const dir = process.argv[2]
if (!dir) throw new Error('usage: survival.mjs <dir>')
const names = JSON.parse(fs.readFileSync(path.join(dir, 'fixtures.json'), 'utf8')).filter((n) => n.endsWith('.s1'))
if (names.length === 0) throw new Error('fixtures.json lists no sheet 1 fixtures')

const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  for (const name of names) {
    const html = fs.readFileSync(path.join(dir, `${name}.html`), 'utf8')
    for (const paper of ['A4', 'Letter']) {
      const stem = path.join(dir, `${name.replace(/\.s1$/, '')}.${paper}`)
      await page.setContent(html, { waitUntil: 'load' })
      await page.evaluate(() => document.fonts.ready)
      await page.emulateMedia({ media: 'print' })
      const facts = await page.evaluate((marks) => {
        const ptPerPx = 0.75
        const labels = []
        for (const svg of document.querySelectorAll('svg.chart')) {
          const vb = svg.viewBox.baseVal
          const scale = svg.getBoundingClientRect().width / vb.width
          for (const t of svg.querySelectorAll('text')) {
            const size = parseFloat(getComputedStyle(t).fontSize) * scale * ptPerPx
            const text = (t.textContent ?? '').trim()
            if (text !== '') labels.push({ text, pt: Math.round(size * 100) / 100, cls: t.getAttribute('class') ?? '' })
          }
        }
        const cap = document.querySelector('.qrcap')
        let caption = null
        if (cap) {
          const range = document.createRange()
          range.selectNodeContents(cap)
          const lineTops = new Set([...range.getClientRects()].map((r) => Math.round(r.top)))
          caption = { text: cap.textContent, lines: lineTops.size, pt: parseFloat(getComputedStyle(cap).fontSize) * ptPerPx }
        }
        const present = Object.fromEntries(Object.entries(marks).map(([k, sel]) => [k, document.querySelectorAll(sel).length]))
        const colo = document.querySelector('.colo .colotext')
        const colophon = colo ? { text: colo.textContent.trim(), pt: parseFloat(getComputedStyle(colo).fontSize) * ptPerPx } : null
        const qr = document.querySelector('.qrblock')
        const qrSvg = document.querySelector('svg.qr')
        // The symbol's own modules: the viewBox less the 4-module quiet zone on each side.
        const qrModules = qrSvg ? qrSvg.viewBox.baseVal.width - 8 : null
        return { labels, caption, colophon, present, qrUrl: qr ? qr.getAttribute('data-qr') : null, qrModules }
      }, MARKS)
      await page.emulateMedia({ media: null })
      fs.writeFileSync(`${stem}.survival.json`, JSON.stringify(facts, null, 1))
      await page.pdf({ path: `${stem}.base.pdf`, format: paper, printBackground: true })
      for (const [mark, sel] of Object.entries(MARKS)) {
        if (facts.present[mark] === 0) continue
        const hidden = html.replace('</style>', `${sel}{visibility:hidden !important;}</style>`)
        await page.setContent(hidden, { waitUntil: 'load' })
        await page.evaluate(() => document.fonts.ready)
        await page.pdf({ path: `${stem}.${mark}.pdf`, format: paper, printBackground: true })
      }
    }
  }
  console.log(`survival: printed ${names.length} sheets × 2 papers, with each mark class hidden in turn`)
} finally {
  await browser.close()
}
