// The phone reflow (CUL-2295, row VR2-15): held to the print renderer's block order (spec §3.4),
// the Dynamic Type route and print isolation (§6.3), the 11pt floor (§6.2) and the keep-together
// rule (PM ruling (a) on CUL-2320, option 1 on CUL-2295). What only a layout engine can see
// (clipping, the band in the first frame, the unit against real frames, the PDF at scale 3.1) is
// `scripts/report-phone/guard.mjs`; this suite holds what the HTML and CSS themselves say.
import assert from 'node:assert/strict'
import { buildDocumentV2, h, type DocumentV2, type DocumentV2Options } from './documentV2.ts'
import { blockIdsOf, renderPrintV2 } from './renderPrintV2.ts'
import { BODY_PX, PLOT_W, renderPhoneV2, STYLE_PHONE, SVG_TEXT_MIN, verdictOf } from './renderPhoneV2.ts'
import { v2DocFixtures } from './v2DocFixtures.testutil.ts'
import { nyxLiveSnapshot } from './nyxLive.testutil.ts'

const OPTS: DocumentV2Options = { owner: { firstName: 'Ada', lastName: null }, shortId: null, questions: ['Is the itching worse at night?'] }
const docs = (): Array<[string, DocumentV2]> => v2DocFixtures().map(([n, s]) => [n, buildDocumentV2(s, OPTS)])

/** The CSS split at its one `@media print` block. */
function cssParts(): { screen: string; print: string } {
  const at = STYLE_PHONE.indexOf('@media print{')
  assert.ok(at > 0, 'the phone sheet has a print block')
  return { screen: STYLE_PHONE.slice(0, at), print: STYLE_PHONE.slice(at) }
}

/** The HTML inside the keep-together unit, up to its closing tag (the unit holds no nested div
 *  of its own kind, so the match closes on the unit's own `</div>` after the last block). */
function unitOf(html: string): string {
  const open = html.indexOf('<div class="keep" data-keep="lead">')
  assert.ok(open >= 0, 'the lead unit is drawn')
  const rest = html.slice(open)
  const close = rest.indexOf('</div>\n')
  return rest.slice(0, close)
}

// ── Parity (spec §3.4, AC 1) ────────────────────────────────────────────────

Deno.test('parity — the phone emits the print renderer’s block ids, in the same order, on every fixture', () => {
  for (const [name, d] of docs()) {
    const phone = blockIdsOf(renderPhoneV2(d))
    assert.deepEqual(phone, blockIdsOf(renderPrintV2(d)), name)
    assert.deepEqual(phone, d.blocks.map((b) => b.id), name)
  }
})

Deno.test('parity — the phone prints no flag the PDF does not (BRK-1)', () => {
  for (const [name, d] of docs()) {
    const flagsOf = (html: string) => [...html.matchAll(/<b>Flag: [^<]*<\/b>/g)].map((m) => m[0])
    assert.deepEqual(flagsOf(renderPhoneV2(d)), flagsOf(renderPrintV2(d)), name)
  }
})

// ── Reading order and structure (spec §6.3, GAP-39, GAP-40) ─────────────────

Deno.test('order — the band is the first h2 after the masthead, wherever a band prints', () => {
  let seen = 0
  for (const [name, d] of docs()) {
    if (!d.blocks.some((b) => b.kind === 'band')) continue
    seen++
    const html = renderPhoneV2(d)
    const firstH2 = html.indexOf('<h2')
    assert.ok(firstH2 > html.indexOf('data-block="masthead"'), name)
    assert.ok(firstH2 > html.indexOf('data-block="band"'), name)
    assert.ok(firstH2 < html.indexOf('</section>', html.indexOf('data-block="band"')), `${name}: the band’s h2 is the first h2`)
  }
  assert.ok(seen >= 3, 'the band is exercised on more than one fixture')
})

Deno.test('structure — headings are real h2, lists keep role=list, line numbers are real text', () => {
  const d = buildDocumentV2(nyxLiveSnapshot(), OPTS)
  const html = renderPhoneV2(d)
  assert.match(html, /data-block="lead-chart"><h2 class="(flagh|charth)">/)
  assert.doesNotMatch(html, /<ul(?![^>]*role="list")[^>]*>/, 'every ul keeps role=list')
  const lines = d.blocks.find((b) => b.kind === 'record_lines')
  assert.ok(lines && lines.kind === 'record_lines' && lines.lines.length > 0)
  lines.lines.forEach((l, i) => assert.ok(html.includes(`data-item="${l.id}"><span class="ln">${i + 1}.</span> `), `line ${i + 1} carries its number as text`))
  assert.ok(html.includes('<span class="ln">1.</span> <span class="q">Is the itching worse at night?</span>'), 'question numbers are text')
})

Deno.test('structure — the drawing is aria-hidden and the twin carries the facts', () => {
  for (const [name, d] of docs()) {
    const html = renderPhoneV2(d)
    assert.match(html, /<div class="chart" aria-hidden="true">/, name)
    assert.doesNotMatch(html, /aria-label="[^"]*\d/, `${name}: no digit in an aria-label`)
    const lc = d.blocks.find((b) => b.kind === 'lead_chart')
    assert.ok(lc && lc.kind === 'lead_chart')
    assert.ok(html.includes(`<p class="twin">`), name)
  }
})

// ── Dynamic Type and print isolation (spec §6.3) ────────────────────────────

Deno.test('type — the root follows -apple-system-body over a 17px fallback; every screen size is a rem', () => {
  const { screen } = cssParts()
  assert.match(screen, new RegExp(`html\\{font-size:${BODY_PX}px;font:-apple-system-body;`), 'the fallback comes first, so the system font wins where it is known')
  const sizes = [...screen.matchAll(/([^{}]+)\{[^}]*?font-size:([^;}]+)/g)].map((m) => ({ sel: m[1].trim(), v: m[2].trim() }))
  assert.ok(sizes.length > 10)
  for (const { sel, v } of sizes) {
    if (sel === 'html') continue // the fallback, overridden by -apple-system-body
    if (sel === 'svg .cnt') {
      assert.equal(v, `${SVG_TEXT_MIN}px`, 'counts are viewBox units, scaled with the plot, never below 1:1')
      continue
    }
    assert.match(v, /^[\d.]+rem$/, `${sel}: ${v} is not a rem`)
  }
})

Deno.test('type — every size inside @media print is an absolute pt', () => {
  const { print } = cssParts()
  const sizes = [...print.matchAll(/font-size:([^;}]+)/g)].map((m) => m[1].trim())
  assert.ok(sizes.length >= 8)
  for (const v of sizes) assert.match(v, /^[\d.]+pt$/, `${v} in print is not pt`)
  assert.doesNotMatch(print, /\d(rem|em|vw|vh|%)\b/, 'no relative unit reaches print')
})

Deno.test('type — no screen label is set under 11pt at the default text size', () => {
  const { screen } = cssParts()
  for (const m of screen.matchAll(/font-size:([\d.]+)rem/g)) {
    assert.ok(Number(m[1]) * BODY_PX >= 11, `${m[1]}rem is ${Number(m[1]) * BODY_PX}px`)
  }
})

// ── The 11pt floor in the SVG (spec §6.2) ───────────────────────────────────

Deno.test('marks — every SVG text is a count at the floor, on a PLOT_W viewBox; labels and dates are HTML', () => {
  for (const [name, d] of docs()) {
    const html = renderPhoneV2(d)
    for (const m of html.matchAll(/<svg class="marks"[^>]*viewBox="0 0 (\d+) [\d.]+"/g)) assert.equal(Number(m[1]), PLOT_W, name)
    for (const m of html.matchAll(/<text class="([^"]+)"/g)) assert.match(m[1], /^cnt( nr)? halo$/, `${name}: only counts are SVG text`)
    assert.doesNotMatch(html, /<text[^>]*font-size/, `${name}: no inline size undercuts the floor`)
    assert.match(html, /<div class="axis">/, `${name}: the dates are HTML`)
  }
})

// ── The keep-together rule (CUL-2320 ruling (a), CUL-2295 option 1) ─────────

Deno.test('keep — the lead chart, the lines under it and the confounder are one unit, and nothing else is', () => {
  let withConf = 0
  for (const [name, d] of docs()) {
    const html = renderPhoneV2(d)
    const unit = unitOf(html)
    const ids = blockIdsOf(unit)
    const lead = d.blocks.findIndex((b) => b.kind === 'lead_chart')
    const conf = d.blocks.findIndex((b) => b.kind === 'confounder')
    const want = d.blocks.slice(lead, (conf > lead ? conf : lead) + 1).map((b) => b.id)
    assert.deepEqual(ids, want, name)
    assert.ok(html.indexOf('<div class="keep-push" aria-hidden="true"></div><div class="keep"') >= 0, `${name}: the spacer sits before the unit`)
    if (conf >= 0) withConf++
  }
  assert.ok(withConf >= 2, 'the confounder is exercised')
})

Deno.test('keep — the confounder’s opening sentence sits between the heading and the bars, shown unless measured to fit', () => {
  for (const [name, d] of docs()) {
    const html = renderPhoneV2(d)
    const conf = d.blocks.find((b) => b.kind === 'confounder')
    const rep = html.match(/<p class="verdict" data-part="confounder-verdict"([^>]*)>([^<]*)<\/p>/)
    if (!conf || conf.kind !== 'confounder') {
      assert.equal(rep, null, `${name}: no confounder, no repeat`)
      continue
    }
    assert.ok(rep, `${name}: the repeat is drawn`)
    assert.doesNotMatch(rep[1], /(^|\s)hidden(\s|=|$)/, `${name}: shown by default (the script may hide it once it fits)`)
    assert.match(rep[1], /aria-hidden="true"/, `${name}: a screen reader hears the confounder once, in its place`)
    assert.equal(rep[2], h(verdictOf(conf.text)), name)
    assert.ok(conf.text.startsWith(verdictOf(conf.text)), `${name}: the repeat is the line’s own words`)
    const unit = unitOf(html)
    const h2 = unit.indexOf('</h2>')
    const at = unit.indexOf('data-part="confounder-verdict"')
    const chart = unit.indexOf('<div class="chart"')
    assert.ok(h2 < at && at < chart, `${name}: heading, then the repeat, then the bars`)
    assert.ok(blockIdsOf(unit).includes('confounder'), `${name}: the full line stays in the unit`)
  }
})

Deno.test('keep — the repeat is pinned while the bars scroll, and never prints', () => {
  const { screen, print } = cssParts()
  assert.match(screen, /\.verdict\{position:sticky;top:0;/)
  assert.match(print, /\.verdict\{display:none;\}/)
  assert.match(print, /\.keep,\.leadchart\{break-inside:avoid;\}/)
})

Deno.test('keep — verdictOf takes the first sentence and never cuts inside one', () => {
  assert.equal(verdictOf('Not a test of the diet alone. Overlapping the trial: Motozol, Sep 21 to Sep 27.'), 'Not a test of the diet alone.')
  assert.equal(
    verdictOf('No medication or supplement is recorded as overlapping the trial in this window, not checked with the owner. A free-fed bowl was down.'),
    'No medication or supplement is recorded as overlapping the trial in this window, not checked with the owner.',
  )
  assert.equal(verdictOf('No end mark'), 'No end mark')
  assert.equal(verdictOf('Cetirizine 2.5mg overlaps. More.'), 'Cetirizine 2.5mg overlaps.')
})

Deno.test('keep — the layout script hides the repeat only after measuring a fit, and pushes only a unit that fits', () => {
  const html = renderPhoneV2(buildDocumentV2(nyxLiveSnapshot(), OPTS))
  const script = html.slice(html.indexOf('<script>'))
  // Loud on every path the script cannot measure: no frame height → shown.
  assert.match(script, /if \(!frame\) \{ if \(rep\) rep\.hidden = false; return; \}/)
  assert.match(script, /var fits = unit\.getBoundingClientRect\(\)\.height <= frame;\s*if \(rep\) rep\.hidden = fits;\s*if \(!fits\) return;/)
  assert.match(script, /if \(scale\(\) >= 1\.6\) root\.setAttribute\('data-compact', ''\)/)
})
