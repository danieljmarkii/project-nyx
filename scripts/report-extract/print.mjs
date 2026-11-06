// Prints every dumped v2 report to PDF in Chromium, on A4 and on Letter (CUL-2292). The same
// engine family `lib/pdf.ts`'s WebView prints with on Android; iOS prints in WebKit, which this job
// does not cover (the on-device digit probe, CUL-1771, does).
// Usage: node scripts/report-extract/print.mjs <dir>   (reads <dir>/fixtures.json, writes <dir>/<name>.<paper>.pdf)
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const dir = process.argv[2]
if (!dir) throw new Error('usage: print.mjs <dir>')
const names = JSON.parse(fs.readFileSync(path.join(dir, 'fixtures.json'), 'utf8'))
if (!Array.isArray(names) || names.length === 0) throw new Error('fixtures.json lists no fixtures')

const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  for (const name of names) {
    await page.goto('file://' + path.resolve(dir, `${name}.html`), { waitUntil: 'load' })
    // The embedded faces (VR2-11) decode after load; print only once they have, so the PDF measured
    // is the one the faces draw, never the fallback stack's.
    await page.evaluate(() => document.fonts.ready)
    for (const paper of ['A4', 'Letter']) {
      await page.pdf({ path: path.join(dir, `${name}.${paper}.pdf`), format: paper, printBackground: true, preferCSSPageSize: false })
    }
  }
  console.log(`printed ${names.length} fixtures × 2 papers`)
} finally {
  await browser.close()
}
