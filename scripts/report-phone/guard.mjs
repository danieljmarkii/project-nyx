// The phone reflow's browser guard (CUL-2295, row VR2-15; v2 spec §6.2, §6.3; PM ruling (a) on
// CUL-2320 and option 1 on CUL-2295). What only a layout engine can see:
//
//   1. at 320pt, 390pt and the largest Dynamic Type step (scale 3.1, iOS AX5), and at 1.0 and
//      2.35: no text clipped or pushed past the screen's edge, and no label drawn under 11pt
//      (HTML by its computed size, SVG by its size times the plot's on-screen scale);
//   2. the band inside the first frame at 1.0 and 2.35;
//   3. the keep-together rule: walking the page frame by frame (one screen height each), no
//      frame shows the lead chart's bars without its confounder line or the line's opening
//      sentence, and a unit that fits a frame never straddles a boundary;
//   4. every fixture's PDF, print and phone documents both, at scale 1.0 and 3.1: the same page
//      count, the same text layer, the same sheet 1 word count.
//
// Dynamic Type is simulated the way iOS applies it: the root's resolved size changes and nothing
// else does. The phone sheet's `html{font-size:17px;font:-apple-system-body}` keeps its 17px in
// Chromium (which does not know the system font), so the guard rewrites that fallback.
//
// Usage:
//   deno run --allow-read --allow-write --allow-env scripts/report-phone/dump.deno.ts <dir>
//   node scripts/report-phone/guard.mjs <dir> [--shots <dir>]
// Needs Playwright's Chromium and Python's pypdf (the text layer). Exits 1 on any failure.
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const dir = process.argv[2]
if (!dir) throw new Error('usage: guard.mjs <dir> [--shots <dir>]')
const shotsAt = process.argv.indexOf('--shots')
const shots = shotsAt > 0 ? process.argv[shotsAt + 1] : null
if (shots) fs.mkdirSync(shots, { recursive: true })

const BODY_PX = 17
const SIZES = [
  { name: '320pt', width: 320, height: 568 },
  { name: '390pt', width: 390, height: 844 },
]
const SCALES = [1, 2.35, 3.1]
const BAND_SCALES = [1, 2.35]
const MIN_PX = 11

const fixtures = JSON.parse(fs.readFileSync(path.join(dir, 'fixtures.json'), 'utf8'))
const failures = []
const seenCounts = { fixtures: 0, bandChecked: 0, units: 0, unitsWithConf: 0, repeatShown: 0, repeatHidden: 0 }
const fail = (where, what) => failures.push(`${where}: ${what}`)

/** Dynamic Type as iOS applies it: the root's resolved size, and nothing else. */
function atScale(html, s) {
  const from = `html{font-size:${BODY_PX}px;`
  if (s !== 1 && !html.includes(from)) throw new Error('the phone sheet lost its root fallback; the guard cannot simulate Dynamic Type')
  return html.replace(from, `html{font-size:${(BODY_PX * s).toFixed(2)}px;`)
}

/** The print document under a scaled root: whatever the root says, print sizes are pt. */
function printAtScale(html, s) {
  if (html.includes(`html{font-size:${BODY_PX}px;`)) return atScale(html, s)
  return html.replace('<style>', `<style>html{font-size:${(16 * s).toFixed(2)}px;}`)
}

async function screenChecks(page, where, s, size) {
  const r = await page.evaluate(
    ({ MIN_PX, checkBand }) => {
      const out = { overflow: [], small: [], band: null }
      const W = window.innerWidth
      const H = window.innerHeight
      if (document.documentElement.scrollWidth > W + 0.5) out.overflow.push(`page scrolls sideways (${document.documentElement.scrollWidth} > ${W})`)
      for (const el of document.querySelectorAll('main *')) {
        const cs = getComputedStyle(el)
        if (cs.display === 'none' || cs.visibility === 'hidden') continue
        const rect = el.getBoundingClientRect()
        if (rect.width === 0 && rect.height === 0) continue
        if (rect.right > W + 0.5 || rect.left < -0.5) out.overflow.push(`${el.tagName.toLowerCase()}.${el.className?.baseVal ?? el.className} spans ${rect.left.toFixed(1)}..${rect.right.toFixed(1)}`)
        if (cs.overflow !== 'visible' && el.scrollWidth > el.clientWidth + 1 && el.tagName !== 'svg') out.overflow.push(`${el.tagName.toLowerCase()} clips its text`)
        const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() !== '')
        if (!hasText) continue
        if (el instanceof SVGTextElement) {
          const px = parseFloat(cs.fontSize) * el.getScreenCTM().a
          if (px < MIN_PX - 0.05) out.small.push(`svg "${el.textContent}" at ${px.toFixed(2)}px`)
        } else {
          const px = parseFloat(cs.fontSize)
          if (px < MIN_PX - 0.05) out.small.push(`"${el.textContent.trim().slice(0, 30)}" at ${px.toFixed(2)}px`)
        }
      }
      if (checkBand) {
        const h2 = document.querySelector('[data-block="band"] h2')
        if (h2) out.band = { bottom: h2.getBoundingClientRect().bottom, H }
      }
      return out
    },
    { MIN_PX, checkBand: BAND_SCALES.includes(s) },
  )
  for (const o of r.overflow.slice(0, 5)) fail(where, `clipped: ${o}`)
  for (const o of r.small.slice(0, 5)) fail(where, `under 11pt: ${o}`)
  if (r.band) seenCounts.bandChecked++
  if (r.band && r.band.bottom > r.band.H) fail(where, `the band's heading ends at ${r.band.bottom.toFixed(0)}pt, past the first frame (${r.band.H}pt)`)
  return r
}

async function keepChecks(page, where) {
  const unit = await page.evaluate(() => {
    const u = document.querySelector('[data-keep="lead"]')
    if (!u) return null
    const r = u.getBoundingClientRect()
    const rep = u.querySelector('[data-part="confounder-verdict"]')
    return {
      top: r.top + window.scrollY,
      height: r.height,
      hasConf: !!u.querySelector('[data-block="confounder"]'),
      repShown: rep ? getComputedStyle(rep).display !== 'none' : null,
      docH: document.documentElement.scrollHeight,
      H: window.innerHeight,
    }
  })
  if (!unit) return null
  const { H } = unit
  if (unit.height <= H) {
    const k = Math.floor(unit.top / H)
    if (unit.top + unit.height > (k + 1) * H + 0.5) fail(where, `the unit fits a frame (${unit.height.toFixed(0)}pt) but straddles the boundary at ${(k + 1) * H}pt`)
    if (unit.repShown) fail(where, 'the unit fits, yet the opening sentence still repeats')
  } else if (unit.hasConf && unit.repShown === false) {
    fail(where, `the unit is taller than a frame (${unit.height.toFixed(0)} > ${H}) and the opening sentence is hidden`)
  }
  if (!unit.hasConf) return unit
  // Walk the frames a screen-step scroll lands on (VoiceOver, a keyboard's page key): each step is
  // one screen less the page's scroll padding, which the layout sets to the pinned repeat's height.
  const pad = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0)
  // Scroll positions land on whole pixels; a fractional step would open sub-pixel gaps no reader sees.
  const step = Math.max(1, Math.floor(H - pad))
  const end = unit.top + unit.height
  // Each frame's uncovered band of the page, in page coordinates; every chart element's span must
  // lie inside their union. (A row split across two screens is ordinary paging; a row that falls
  // under the pin in one frame and above the screen in the next is the skip this exists to catch.)
  const bands = []
  let elements = []
  for (let k = 0, y = 0; y < end; k++, y = k * step) {
    const seen = await page.evaluate((y) => {
      window.scrollTo(0, y)
      const H = window.innerHeight
      const lc = document.querySelector('[data-keep="lead"] [data-block="lead-chart"]')
      const rep = document.querySelector('[data-part="confounder-verdict"]')
      const repR = rep && getComputedStyle(rep).display !== 'none' ? rep.getBoundingClientRect() : null
      // What sits under the pin is not seen: the pin is opaque.
      const pinned = !!repR && repR.top <= 0.5
      const floor = pinned ? repR.bottom : 0
      const els = [...lc.querySelectorAll('.crow .rl, svg.marks rect.bar, svg.marks rect.hatch, svg.marks rect.cov, svg.marks line.span, svg.marks text')]
      const spans = []
      let bars = false
      els.forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.width === 0 && r.height === 0) return
        spans.push([r.top + window.scrollY, r.bottom + window.scrollY, el.textContent?.trim().slice(0, 24) || el.tagName])
        const isMark = el.matches('rect.bar, rect.hatch, rect.cov, line.span')
        if (isMark && Math.min(r.bottom, H) - Math.max(r.top, floor) >= 2) bars = true
      })
      const repSeen = !!repR && repR.top >= -0.5 && repR.bottom <= H + 0.5
      const conf = document.querySelector('[data-keep="lead"] [data-block="confounder"]')
      const cr = conf.getBoundingClientRect()
      const line = parseFloat(getComputedStyle(conf).lineHeight) || parseFloat(getComputedStyle(conf).fontSize) * 1.4
      const confSeen = cr.top >= floor - 0.5 && cr.top + line <= H + 0.5
      return { bars, repSeen, confSeen, spans, band: [window.scrollY + floor, window.scrollY + H], scrollY: window.scrollY }
    }, y)
    elements = seen.spans
    bands.push(seen.band)
    if (Math.abs(seen.scrollY - y) > 1) fail(where, `could not reach frame ${k}`)
    if (seen.bars && !seen.repSeen && !seen.confSeen) fail(where, `frame ${k} shows bars without the confounder line or its lead sentence`)
  }
  // Every label and mark of the chart is seen whole, uncovered, in at least one frame: the pin
  // never makes a row (a steroid course, a cough bar) skip from one screen to the next.
  bands.sort((a, b) => a[0] - b[0])
  const merged = []
  for (const b of bands) {
    const last = merged[merged.length - 1]
    if (last && b[0] <= last[1] + 1) last[1] = Math.max(last[1], b[1])
    else merged.push([...b])
  }
  const missed = elements.filter(([t, b]) => !merged.some(([s, e]) => t >= s - 0.5 && b <= e + 0.5))
  if (missed.length > 0) fail(where, `${missed.length} chart label(s) or mark(s) never seen uncovered (e.g. "${missed[0][2]}"; pad ${pad.toFixed(0)}pt)`)
  await page.evaluate(() => window.scrollTo(0, 0))
  return unit
}

function pdfFacts(file) {
  const py = `
import sys, pypdf
r = pypdf.PdfReader(sys.argv[1])
pages = [p.extract_text() or '' for p in r.pages]
import json
print(json.dumps({"pages": len(pages), "text": "\\n".join(pages), "sheet1": len(pages[0].split()) if pages else 0}))
`
  return JSON.parse(execFileSync('python3', ['-c', py, file], { encoding: 'utf8' }))
}

const browser = await chromium.launch()
const summary = []
try {
  for (const name of fixtures) {
    seenCounts.fixtures++
    const phone = fs.readFileSync(path.join(dir, `${name}.phone.html`), 'utf8')
    for (const size of SIZES) {
      for (const s of SCALES) {
        const where = `${name} @ ${size.name} × ${s}`
        const page = await browser.newPage({ viewport: { width: size.width, height: size.height } })
        await page.setContent(atScale(phone, s), { waitUntil: 'load' })
        // Room past the last block so every frame can be scrolled to its top.
        await page.addStyleTag({ content: 'body{padding-bottom:100vh}' })
        await page.evaluate(() => window.__nyxV2Layout && window.__nyxV2Layout())
        await screenChecks(page, where, s, size)
        const unit = await keepChecks(page, where)
        if (unit) {
          seenCounts.units++
          if (unit.hasConf) seenCounts.unitsWithConf++
          if (unit.repShown === true) seenCounts.repeatShown++
          if (unit.repShown === false) seenCounts.repeatHidden++
        }
        if (unit) summary.push(`${where}: unit ${unit.height.toFixed(0)}pt vs frame ${unit.H}pt, repeat ${unit.repShown === null ? 'n/a' : unit.repShown ? 'shown' : 'hidden'}`)
        if (shots && (name === 'nyx-live' || name === 'mira') && (s === 1 || s === 3.1)) {
          await page.screenshot({ path: path.join(shots, `${name}-${size.name}-x${s}.png`), fullPage: false })
          await page.screenshot({ path: path.join(shots, `${name}-${size.name}-x${s}-full.png`), fullPage: true })
        }
        await page.close()
      }
    }
    for (const kind of ['print', 'phone']) {
      const html = fs.readFileSync(path.join(dir, `${name}.${kind}.html`), 'utf8')
      const facts = []
      for (const s of [1, 3.1]) {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
        await page.setContent(printAtScale(html, s), { waitUntil: 'load' })
        await page.emulateMedia({ media: 'print' })
        const file = path.join(dir, `${name}.${kind}.x${s}.pdf`)
        await page.pdf({ path: file, format: 'Letter', printBackground: true })
        facts.push(pdfFacts(file))
        await page.close()
      }
      const [a, b] = facts
      const where = `${name} ${kind} PDF`
      if (a.pages !== b.pages) fail(where, `${a.pages} pages at 1.0, ${b.pages} at 3.1`)
      if (a.text !== b.text) fail(where, 'the text layer differs between 1.0 and 3.1')
      if (a.sheet1 !== b.sheet1) fail(where, `sheet 1 has ${a.sheet1} words at 1.0, ${b.sheet1} at 3.1`)
      summary.push(`${where}: ${a.pages} pages, sheet 1 ${a.sheet1} words at both scales`)
    }
  }
} finally {
  await browser.close()
}

// Non-vacuity floors: a guard that checked nothing is red, not green.
if (seenCounts.fixtures < 10) fail('guard', `only ${seenCounts.fixtures} fixtures ran`)
if (seenCounts.bandChecked < 1) fail('guard', 'no band was checked against the first frame')
if (seenCounts.unitsWithConf < 1) fail('guard', 'no keep-together unit with a confounder was walked')
if (seenCounts.repeatShown < 1 || seenCounts.repeatHidden < 1) fail('guard', `the repeat was not seen both shown (${seenCounts.repeatShown}) and hidden (${seenCounts.repeatHidden})`)
console.log(summary.join('\n'))
console.log(JSON.stringify(seenCounts))
if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s):\n${failures.join('\n')}`)
  process.exit(1)
}
console.log(`\nphone guard: ${fixtures.length} fixtures × ${SIZES.length} widths × ${SCALES.length} scales, and both PDFs at 1.0 and 3.1: all clear`)
