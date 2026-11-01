// The phone reflow (CUL-2295, row VR2-15): held to the print renderer's block order (spec §3.4),
// the Dynamic Type route and print isolation (§6.3), the 11pt floor (§6.2) and the keep-together
// rule (PM ruling (a) on CUL-2320, option 1 on CUL-2295). What only a layout engine can see
// (clipping, the band in the first frame, the unit against real frames, the PDF at scale 3.1) is
// `scripts/report-phone/guard.mjs`; this suite holds what the HTML and CSS themselves say.
import assert from 'node:assert/strict'
import { buildDocumentV2, h, type DocumentV2, type DocumentV2Options } from './documentV2.ts'
import { blockIdsOf, renderPrintV2 } from './renderPrintV2.ts'
import { BODY_PX, COMPACT_SCALE, PLOT_W, VERDICT_MAX_PX, renderPhoneV2, STYLE_PHONE, SVG_TEXT_MIN } from './renderPhoneV2.ts'
import { textOf } from './documentV2.ts'
import { v2DocFixtures } from '../../../scripts/report-phone/fixtures.deno.ts'
import { nyxLiveSnapshot } from './nyxLive.testutil.ts'

const OPTS: DocumentV2Options = { owner: { firstName: 'Ada', lastName: null }, shortId: null, questions: ['Is the itching worse at night?'] }
const docs = (): Array<[string, DocumentV2]> => {
  const out = v2DocFixtures().map(([n, s]): [string, DocumentV2] => [n, buildDocumentV2(s, OPTS)])
  // A floor, so no suite below can pass over an empty list.
  assert.ok(out.length >= 10, `only ${out.length} fixtures`)
  return out
}

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

Deno.test('parity — every block says the PDF’s words; the phone adds only its fold label, line numbers and chart drawing', () => {
  const texts = (html: string): Map<string, string> => {
    const out = new Map<string, string>()
    const re = /<(\w+) [^>]*data-block="([^"]+)">/g
    for (const m of html.matchAll(re)) {
      const start = m.index! + m[0].length
      const close = html.indexOf(`</${m[1]}>`, start)
      out.set(m[2], html.slice(start, close))
    }
    return out
  }
  for (const [name, d] of docs()) {
    const print = texts(renderPrintV2(d))
    const phone = texts(renderPhoneV2(d))
    for (const b of d.blocks) {
      let p = phone.get(b.id) ?? ''
      let q = print.get(b.id) ?? ''
      if (b.kind === 'masthead') p = p.replace(/<p class="brief">[^<]*<\/p><button class="more"[^>]*>[^<]*<\/button>/, '')
      if (b.kind === 'record_lines' || b.kind === 'questions') p = p.replace(/<span class="ln">\d+\.<\/span> /g, '')
      if (b.kind === 'lead_chart') {
        // The drawing differs by design (HTML labels and an HTML axis); the words around it may not.
        p = p.replace(/<p class="verdict"[^>]*>[^<]*<\/p>/, '').replace(/<div class="chart"[\s\S]*?<\/div>(?=<p class="twin">)/, '')
        q = q.replace(/<svg class="chart"[\s\S]*?<\/svg>/, '')
      }
      assert.equal(textOf(p), textOf(q), `${name}: block ${b.id}`)
    }
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
  assert.doesNotMatch(html, /<(ul|ol)(?![^>]*role="list")[^>]*>/, 'every list keeps role=list')
  const lines = d.blocks.find((b) => b.kind === 'record_lines')
  assert.ok(lines && lines.kind === 'record_lines' && lines.lines.length > 0)
  lines.lines.forEach((l, i) => assert.ok(html.includes(`data-item="${l.id}"><span class="ln">${i + 1}.</span> `), `line ${i + 1} carries its number as text`))
  assert.ok(html.includes('<span class="ln">1.</span> <span class="q">Is the itching worse at night?</span>'), 'question numbers are text')
})

Deno.test('structure — the drawing is aria-hidden and the twin carries the facts', () => {
  for (const [name, d] of docs()) {
    const html = renderPhoneV2(d)
    assert.match(html, /<div class="chart" aria-hidden="true">/, name)
    const lc = d.blocks.find((b) => b.kind === 'lead_chart')
    assert.ok(lc && lc.kind === 'lead_chart')
    assert.ok(lc.chart.twin.length > 0, name)
    assert.ok(html.includes(`<p class="twin">${h(lc.chart.twin)}</p>`), `${name}: the twin prints whole`)
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
    if (sel === '.verdict') {
      assert.equal(v, `min(1rem, ${VERDICT_MAX_PX}px)`, 'the pinned repeat grows with the text up to 1.25×')
      continue
    }
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
  assert.doesNotMatch(print, /\d(rem|em|vw|vh)\b|\d%/, 'no relative unit reaches print')
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

Deno.test('keep — the line’s lead sentence sits between the heading and the bars, and is never hidden in the HTML', () => {
  for (const [name, d] of docs()) {
    const html = renderPhoneV2(d)
    const conf = d.blocks.find((b) => b.kind === 'confounder')
    const rep = html.match(/<p class="verdict" data-part="confounder-verdict"([^>]*)>([^<]*)<\/p>/)
    if (!conf || conf.kind !== 'confounder') {
      assert.equal(rep, null, `${name}: no confounder, no repeat`)
      continue
    }
    assert.ok(rep, `${name}: the repeat is drawn`)
    assert.doesNotMatch(rep[1], /(^|\s)hidden(\s|=|$)/, `${name}: shown (the script never hides it)`)
    assert.match(rep[1], /aria-hidden="true"/, `${name}: a screen reader hears the confounder once, in its place`)
    assert.equal(rep[2], h(conf.lead), name)
    assert.ok(conf.lead.length > 0 && conf.text.includes(conf.lead), `${name}: the repeat is the line’s own words`)
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

Deno.test('keep — the lead is the line’s warning: the overlap verdict, or the bowl when no medication overlaps (cold read, Mira)', () => {
  let meds = 0
  let bowlOnly = 0
  for (const [name, d] of docs()) {
    const conf = d.blocks.find((b) => b.kind === 'confounder')
    if (!conf || conf.kind !== 'confounder') continue
    if (conf.text.startsWith('Not a test of the diet alone.')) {
      meds++
      assert.equal(conf.lead, 'Not a test of the diet alone.', name)
    } else if (conf.text.includes('A free-fed bowl was down')) {
      bowlOnly++
      // A fixed sentence: no owner-entered label can lengthen what is pinned (adversarial pass 2).
      assert.equal(conf.lead, 'A free-fed bowl was down in this window; the trial cannot exclude it.', name)
    } else {
      assert.equal(conf.lead, conf.text, `${name}: a one-sentence line leads with itself`)
    }
  }
  assert.ok(meds >= 1, 'an overlapping course is exercised')
  assert.ok(bowlOnly >= 1, 'a bowl with no overlapping course is exercised (Mira)')
})

Deno.test('keep — the layout script never hides the repeat, pads page steps below it, and re-lays on a text-size change', () => {
  const html = renderPhoneV2(buildDocumentV2(nyxLiveSnapshot(), OPTS))
  const script = html.slice(html.indexOf('<script>'))
  // Free scroll has no frames: hiding the repeat on a measured fit left bars without the warning
  // at resting positions (adversarial pass on CUL-2295). Nothing in the script may set it hidden.
  assert.match(script, /if \(rep\) rep\.hidden = false;/)
  assert.doesNotMatch(script, /rep\.hidden = (true|fits|!)/, 'the repeat is never hidden')
  assert.match(script, /if \(rep\) root\.style\.scrollPaddingTop = rep\.getBoundingClientRect\(\)\.height \+ 'px';/, 'a page-step scroll lands below the pin')
  assert.match(script, /new ResizeObserver\(/, 'a Dynamic Type change with no resize event re-lays the page')
  assert.match(script, /ro\.observe\(probe\)/)
  // The spacer pushes only a unit that fits a frame.
  assert.match(script, /var fits = unit\.getBoundingClientRect\(\)\.height <= frame;\s*if \(!fits\) return;/)
  assert.match(script, /if \(scale\(\) >= 1\.6\) root\.setAttribute\('data-compact', ''\)/)
})

Deno.test('compact — at scale 1.6 the details fold behind one line; species, sex, age, weight and the last entry never fold', () => {
  assert.equal(COMPACT_SCALE, 1.6)
  assert.equal(VERDICT_MAX_PX, Math.round(BODY_PX * 1.25))
  const { screen, print } = cssParts()
  const compact = screen.slice(screen.indexOf('@media screen{'))
  assert.ok(compact.length > 0, 'compaction lives in a screen-only block')
  assert.match(compact, /\[data-compact\] \.mast:not\(\[data-open\]\) \.fold\{display:none;\}/)
  assert.doesNotMatch(compact, /\.last\{[^}]*display:none/, 'the last entry never folds')
  for (const m of compact.matchAll(/([^{}]*)\.brief\{display:none;\}/g)) assert.match(m[1], /\[data-open\]|\[data-tight\]/, 'the brief steps aside only for the full signalment or the band')
  assert.match(compact, /\[data-compact\] \.mast \.brief\{display:block;\}/)
  // Only where the band would leave the first frame does the brief fold too (the band is the warning).
  assert.match(compact, /\[data-compact\]\[data-tight\] \.mast \.brief\{display:none;\}/)
  const script = renderPhoneV2(buildDocumentV2(nyxLiveSnapshot(), OPTS))
  assert.match(script, /bandH\.getBoundingClientRect\(\)\.bottom \+ window\.pageYOffset > window\.innerHeight\) \{\s*root\.setAttribute\('data-tight', ''\);/)
  assert.match(script, /if \(bandH\.getBoundingClientRect\(\)\.bottom \+ window\.pageYOffset > window\.innerHeight\) root\.removeAttribute\('data-tight'\);/, 'no fold that does not bring the band in')
  assert.doesNotMatch(print, /data-compact/, 'compaction never reaches print')
  assert.doesNotMatch(screen.slice(0, screen.indexOf('@media screen{')), /data-compact/, 'no compact rule outside the screen block')
  const html = renderPhoneV2(buildDocumentV2(nyxLiveSnapshot(), OPTS))
  assert.match(html, /<h1>Nyx<\/h1><p class="brief">Cat · female · 3 y · 3\.73 kg \(8\.2 lb\)<\/p><button class="more" type="button" aria-expanded="false" aria-controls="v2more">More details<\/button><div class="fold" id="v2more"><p class="sig">/)
  assert.match(screen, /\.more::after\{content:" ›" \/ "";\}/, 'the glyph is not part of the button’s name')
  assert.match(screen, /\[data-compact\] \.mast \.more\{display:block;min-height:44px;/, 'the fold line is a 44pt target')
})
