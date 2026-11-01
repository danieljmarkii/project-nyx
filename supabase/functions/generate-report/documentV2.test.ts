// Vet report v2 sheet 1 (CUL-2290): the document model and the print renderer, held to spec v2
// §3.4 (parity), §5.4 (the mark lexicon), §5.7 (ruling B's word budget) and §12 (the superset
// invariant), and to PM ruling (a) on CUL-2323 and CUL-2340 (the "Changes in this window" line).
//
// Every fixture here is one a production caller can hand over: built through `assembleReport`
// from a `ReportInput`, or (nyx-live) the real snapshot, with the facts it predates filled as
// `nyxLive.testutil.ts` documents.
import assert from 'node:assert/strict'
import { assembleReport, type ReportInput, type ReportSnapshot } from './report.ts'
import { renderReport } from './render.ts'
import {
  buildDocumentV2,
  flagRowOf,
  SHEET1_CUTTABLE_BUDGET,
  textOf,
  wordCountOf,
  type BlockV2,
  type DocumentV2,
  type DocumentV2Options,
  type LeadChart,
} from './documentV2.ts'
import { blockIdsOf, COUNT_AXIS_MIN_MAX, renderPrintV2 } from './renderPrintV2.ts'
import { bandMembersOf, isZeroSignSheet } from './v2Predicates.ts'
import { cooperInput } from './cooperDemo.testutil.ts'
import { nyxLiveSnapshot } from './nyxLive.testutil.ts'
import { itchingSkinTrial, juniper, olive, symptom, wobblingSkinTrial } from './v2Fixtures.testutil.ts'
import { sampleCases } from '../../../scripts/render-trial-report-sample.deno.ts'

const OPTS: DocumentV2Options = { owner: { firstName: 'Ada', lastName: null }, shortId: null, questions: [] }

/** Every fixture the sheet is held to, by its canonical id where it has one. */
function fixtures(): Array<[string, ReportSnapshot]> {
  const out: Array<[string, ReportSnapshot]> = [
    ['nyx-live', nyxLiveSnapshot()],
    ['cooper', assembleReport({ ...cooperInput(), audience: { kind: 'owner', includeLookNotes: false } })],
    ['r11-steady', assembleReport(itchingSkinTrial({ jump: false }))],
    ['r11-jump', assembleReport(itchingSkinTrial({ jump: true }))],
    ['r11-wobble', assembleReport(wobblingSkinTrial())],
    ['new-account-4-days', assembleReport(juniper())],
    ['looks-only', assembleReport(olive())],
  ]
  for (const [name, input] of sampleCases()) out.push([name === 'trial-report-refused.html' ? 'mira' : name, assembleReport(input)])
  return out
}

const docOf = (s: ReportSnapshot, o: DocumentV2Options = OPTS): DocumentV2 => buildDocumentV2(s, o)
const block = <K extends BlockV2['kind']>(d: DocumentV2, kind: K): Extract<BlockV2, { kind: K }> | undefined =>
  d.blocks.find((b): b is Extract<BlockV2, { kind: K }> => b.kind === kind)
const chartOf = (d: DocumentV2): LeadChart => {
  const c = block(d, 'lead_chart')
  assert.ok(c, 'every sheet draws a lead chart')
  return c.chart
}

/** Spec §5's order, top to bottom. Every sheet's ids are a subsequence of it. */
const ORDER = [
  'masthead',
  'disclosure',
  'band',
  'checks',
  'scope-line',
  'changes@slot',
  'record-edge',
  'lead-sentence',
  'lead-chart',
  'changes@under',
  'confounder',
  'record-lines',
  'gap-lines',
  'questions',
  'colophon',
]

function orderKey(b: BlockV2): string {
  return b.kind === 'changes' ? `changes@${b.placement === 'band_slot' ? 'slot' : 'under'}` : b.id
}

// ── Parity and order (spec §3.4, §5) ─────────────────────────────────────────

Deno.test('order — every fixture prints its blocks in spec §5 order, each id once, masthead first and colophon last', () => {
  for (const [name, s] of fixtures()) {
    const d = docOf(s)
    const keys = d.blocks.map(orderKey)
    assert.equal(new Set(keys).size, keys.length, `${name}: no block twice`)
    const idx = keys.map((k) => ORDER.indexOf(k))
    assert.ok(idx.every((i) => i >= 0), `${name}: only known blocks (${keys})`)
    assert.deepEqual(idx, [...idx].sort((a, b) => a - b), `${name}: spec order (${keys})`)
    assert.equal(keys[0], 'masthead', name)
    assert.equal(keys[keys.length - 1], 'colophon', name)
  }
})

Deno.test('parity — the print render emits exactly the model’s block ids, in the model’s order', () => {
  for (const [name, s] of fixtures()) {
    const d = docOf(s)
    assert.deepEqual(blockIdsOf(renderPrintV2(d)), d.blocks.map((b) => b.id), name)
  }
})

Deno.test('band — the first heading after the masthead, "Flag:" written as text on every item (GAP-39)', () => {
  const d = docOf(nyxLiveSnapshot())
  const html = renderPrintV2(d)
  const firstH2 = html.indexOf('<h2')
  assert.ok(firstH2 > html.indexOf('data-block="masthead"'))
  assert.ok(html.slice(firstH2).startsWith('<h2>Flags for the vet · 6</h2>'), 'the band’s h2 is the first h2')
  const band = block(d, 'band')
  assert.ok(band)
  for (const i of band.items) assert.match(html, new RegExp(`data-item="${i.id}"><b>Flag: `))
})

// ── The superset invariant (spec §12, AC 2) ─────────────────────────────────

Deno.test('superset — every v1 page-1 band finding prints on v2 sheet 1, word for word, on every fixture', () => {
  let flags = 0
  for (const [name, s] of fixtures()) {
    const html = renderPrintV2(docOf(s))
    for (const f of s.safetyFlags) {
      const row = flagRowOf(f, s)
      assert.ok(html.includes(row.html), `${name}: the ${f.kind} finding prints on sheet 1`)
      flags++
    }
  }
  assert.ok(flags >= 10, `the fixtures carry real findings (${flags})`)
})

Deno.test('superset — v1 page 1 still carries the same rows (the band body v2 reuses is v1’s own)', () => {
  // The containment above proves nothing if `flagRowOf` stopped being v1's row. v1's page 1 must
  // hold the same body for every flag, so the two documents cannot word a finding differently.
  // nyx-live is left out: its capture predates fields v1's renderer reads (`nyxLive.testutil.ts`).
  for (const [name, s] of fixtures().filter(([n]) => n !== 'nyx-live')) {
    const v1 = renderReport({ ...s, incidentPhotos: [] })
    for (const f of s.safetyFlags) assert.ok(v1.includes(flagRowOf(f, s).html), `${name}: ${f.kind} is v1’s row`)
  }
})

Deno.test('superset — mutation: dropping one band item from the render reds the invariant', () => {
  const s = nyxLiveSnapshot()
  const d = docOf(s)
  const band = block(d, 'band')
  assert.ok(band && band.items.length > 1)
  const cut = { ...d, blocks: d.blocks.map((b) => (b.kind === 'band' ? { ...b, items: b.items.slice(1) } : b)) }
  const html = renderPrintV2(cut)
  assert.ok(s.safetyFlags.some((f) => !html.includes(flagRowOf(f, s).html)), 'a lost finding is caught')
})

// ── R-11 (spec §5.2) ────────────────────────────────────────────────────────

Deno.test('R-11 — the exempt itch flag leaves the band, leads as the chart, its h2 opens "Flag:" and v1’s row prints under it', () => {
  const s = assembleReport(itchingSkinTrial({ jump: false }))
  const { leadFlag } = bandMembersOf(s)
  assert.ok(leadFlag, 'the fixture is exempt')
  const d = docOf(s)
  assert.equal(block(d, 'band'), undefined, 'no band: its only flag leads')
  const c = chartOf(d)
  assert.match(c.heading, /^Flag: itching over at least \d+ days, the trial’s own sign$/)
  assert.equal(c.flagHtml, flagRowOf(leadFlag, s).html)
  const html = renderPrintV2(d)
  assert.ok(html.indexOf('class="flagh"') < html.indexOf('<svg'), 'the flag heading sits above the chart')
})

Deno.test('R-11 — a rise keeps the flag in the band, and the chart heading is plain', () => {
  const d = docOf(assembleReport(itchingSkinTrial({ jump: true })))
  assert.ok(block(d, 'band'))
  assert.doesNotMatch(chartOf(d).heading, /^Flag:/)
})

// ── Changes in this window (CUL-2323, CUL-2340) ─────────────────────────────

Deno.test('changes — Olive’s zero-sign sheet: the line sits in the band’s slot, unframed, never called a flag', () => {
  const s = assembleReport(olive())
  assert.ok(isZeroSignSheet(s))
  const d = docOf(s)
  const ch = block(d, 'changes')
  assert.ok(ch, 'the line prints')
  assert.equal(ch.placement, 'band_slot')
  const keys = d.blocks.map((b) => b.id)
  assert.ok(keys.indexOf('changes') < keys.indexOf('lead-chart'), 'above the chart, where the band would sit')
  const html = renderPrintV2(d)
  const section = html.slice(html.indexOf('data-block="changes"'), html.indexOf('</section>', html.indexOf('data-block="changes"')))
  assert.doesNotMatch(section, /flag/i, 'never called a flag')
  assert.doesNotMatch(section, /class="[^"]*band/, 'never framed like the band')
})

Deno.test('changes — CUL-2340: one sneeze does not remove the line; it moves under the lead chart', () => {
  const input = olive()
  const s = assembleReport({ ...input, events: [...input.events, symptom('sneeze', 10)] })
  assert.ok(!isZeroSignSheet(s))
  const d = docOf(s)
  const ch = block(d, 'changes')
  assert.ok(ch, 'the line still prints on a sheet with a sign')
  assert.equal(ch.placement, 'under_chart')
  const keys = d.blocks.map((b) => b.id)
  assert.equal(keys.indexOf('changes'), keys.indexOf('lead-chart') + 1, 'directly under the lead chart')
  const zero = block(docOf(assembleReport(olive())), 'changes')
  assert.deepEqual(ch.lines.map((l) => l.id), zero?.lines.map((l) => l.id), 'the same entries, whatever the placement')
})

Deno.test('changes — no entry holds, no line, on either kind of sheet', () => {
  const young = assembleReport(olive({ sleepingDays: 0, unfinishedDays: 0, dateOfBirth: '2022-01-01' }))
  assert.equal(block(docOf(young), 'changes'), undefined)
})

// ── The mark lexicon (spec §5.4, AC 4 and 5) ────────────────────────────────

const TWIN_WORDS: Record<LeadChart['marks'][number], RegExp> = {
  bar: /\d|carr(y|ies) an entry/,
  empty: /\bnone\b/,
  hatch: /nothing logged/,
  partial: /logged \d+ of \d+|\d+-day (week|bin)/,
  span: /Bracketed line/,
  hollow_span: /Hollow dashed/,
  intake_refused: /refused/,
  intake_partly: /partly eaten/,
}

Deno.test('twin — names every mark kind its chart draws, on every fixture', () => {
  for (const [name, s] of fixtures()) {
    const c = chartOf(docOf(s))
    for (const m of c.marks) assert.match(c.twin, TWIN_WORDS[m], `${name}: the twin names ${m}`)
  }
})

Deno.test('hatch — drawn only on a column with nothing logged, once per drawn row, never elsewhere', () => {
  for (const [name, s] of fixtures()) {
    const c = chartOf(docOf(s))
    const html = renderPrintV2(docOf(s))
    const hatches = (html.match(/class="hatch"/g) ?? []).length
    const empty = c.columns.filter((col) => col.loggedDays === 0).length
    const dataRows = c.rows.filter((r) => r.kind !== 'span').length
    assert.equal(hatches, empty * dataRows, `${name}: ${empty} unlogged columns × ${dataRows} rows`)
  }
})

Deno.test('svg — aria-hidden, no aria-label and no title: the twin is the only carrier', () => {
  for (const [name, s] of fixtures()) {
    const html = renderPrintV2(docOf(s))
    const svgs = html.match(/<svg[\s\S]*?<\/svg>/g) ?? []
    assert.ok(svgs.length >= 1, name)
    for (const svg of svgs) {
      assert.match(svg, /^<svg[^>]*aria-hidden="true"/, name)
      assert.doesNotMatch(svg, /aria-label|<title/, name)
    }
  }
})

Deno.test('event-only signs — no 0 printed over a sign row, and the twin says "none", never 0', () => {
  for (const [name, s] of fixtures()) {
    const d = docOf(s)
    const html = renderPrintV2(d)
    assert.doesNotMatch(html, /class="cnt halo"[^>]*>0</, `${name}: no 0 over a mark`)
    const c = chartOf(d)
    for (const r of c.rows) {
      if (r.kind !== 'sign') continue
      const part = c.twin.split('; ').find((p) => p.toLowerCase().startsWith(r.label.toLowerCase()) || p.includes(` ${r.label.toLowerCase()} `))
      if (part) assert.doesNotMatch(part, /(^|, |\s)0(,|$|;)/, `${name}: ${r.label}`)
    }
  }
})

Deno.test('scale — one count scale across stacked rows, with a floor so one entry never draws full height', () => {
  const html = renderPrintV2(docOf(assembleReport(juniper())))
  const heights = [...html.matchAll(/class="bar lead"[^>]*height="([\d.]+)"/g)].map((m) => Number(m[1]))
  assert.ok(heights.length > 0)
  assert.ok(Math.max(...heights) < 26, `2 entries draw under full height on a ${COUNT_AXIS_MIN_MAX}-count floor`)
  const svg = html.match(/<svg[\s\S]*?<\/svg>/)?.[0] ?? ''
  assert.doesNotMatch(svg, /\bscale\b/i, 'the word never appears on the axis')
})

Deno.test('day row — four days logged draw a day row from the first entry, never 90 days of hatch (ruling T)', () => {
  const c = chartOf(docOf(assembleReport(juniper())))
  assert.equal(c.unit, 'day')
  assert.ok(c.columns.length <= 4, `${c.columns.length} columns`)
  assert.match(c.twin, /the first day with an entry in this window/)
})

Deno.test('thin record — Juniper prints the scope line where the band sits, and no band', () => {
  const d = docOf(assembleReport(juniper()))
  assert.ok(block(d, 'scope_line'))
  assert.equal(block(d, 'band'), undefined)
})

// ── Masthead and colophon (spec §5.7, §5.8, §5.10) ──────────────────────────

Deno.test('masthead — weight in kg at 2 dp with lb at 0.1, never toFixed(1) on a kilogram', () => {
  const m = block(docOf(nyxLiveSnapshot()), 'masthead')
  assert.ok(m)
  assert.match(m.signalment, /3\.73 kg \(8\.2 lb\)/)
})

Deno.test('colophon — the surname only from last_name, never the email; no id is ever made up', () => {
  const s = nyxLiveSnapshot()
  const withEmail = { ...s, signalment: { ...s.signalment, ownerName: 'owner@example.com' } }
  const none = block(docOf(withEmail, { owner: null, shortId: null, questions: [] }), 'colophon')
  assert.ok(none)
  assert.match(none.text, /^Kept by the owner · /)
  assert.doesNotMatch(none.text, /@|report [0-9A-Z]{4}/)
  const named = block(docOf(s, { owner: { firstName: 'Zoë', lastName: 'Müller-Ñúñez' }, shortId: 'N3XR', questions: [] }), 'colophon')
  assert.ok(named)
  assert.equal(named.text, 'Kept by Zoë Müller-Ñúñez · owner-reported, not a diagnosis · generated Oct 31, 2026 · report N3XR · sheet 1 of 1')
})

Deno.test('questions — verbatim, at most 5, each at most 200 characters, pointing at the band when one prints', () => {
  const qs = ['Is the cough related?', ...Array.from({ length: 6 }, (_, i) => `Q${i} ${'x'.repeat(250)}`)]
  const d = docOf(nyxLiveSnapshot(), { ...OPTS, questions: qs })
  const q = block(d, 'questions')
  assert.ok(q)
  assert.equal(q.items.length, 5)
  assert.equal(q.items[0].text, 'Is the cough related?')
  assert.ok(q.items.every((i) => i.text.length <= 200))
  assert.ok(q.items.every((i) => i.pointer.includes('flags')))
  assert.equal(block(docOf(nyxLiveSnapshot()), 'questions'), undefined, 'no questions, no section')
})

// ── The word budget (ruling B, spec §5.7, AC 6) ─────────────────────────────

/**
 * THE RATCHET. Each fixture's cuttable count as of this PR; a change that grows one reds here and
 * must lower something else or argue the new number in its PR. Lower a number when a change
 * shrinks it. Never raise one to go green. The fixed parts are reported beside, never budgeted.
 */
const CUTTABLE_RATCHET: Record<string, number> = {
  'nyx-live': 200,
  'cooper': 59,
  'r11-steady': 52,
  'r11-jump': 52,
  'r11-wobble': 52,
  'new-account-4-days': 23,
  'looks-only': 48,
  'trial-report-clean.html': 127,
  'mira': 74,
  'trial-report-completed.html': 100,
  'trial-report-truncated.html': 69,
  'trial-report-past-window.html': 82,
  'trial-report-extended.html': 53,
  'trial-report-extended-late.html': 53,
  'trial-report-ended-early.html': 62,
}

Deno.test('word budget — the cuttable prose stays within its ratchet and about 200 words on every fixture', () => {
  const report: string[] = []
  for (const [name, s] of fixtures()) {
    const w = wordCountOf(docOf(s))
    const cap = CUTTABLE_RATCHET[name]
    report.push(`${name}: cuttable ${w.cuttable} · outside ${JSON.stringify(w.fixed)}`)
    assert.ok(cap !== undefined, `${name} has a ratchet row`)
    assert.ok(w.cuttable <= cap, `${name}: ${w.cuttable} cuttable words, ratchet ${cap}`)
    assert.ok(w.cuttable <= SHEET1_CUTTABLE_BUDGET, `${name}: ${w.cuttable} over the ${SHEET1_CUTTABLE_BUDGET}-word budget`)
  }
  console.log(`sheet 1 words (ruling B)\n${report.join('\n')}`)
})

Deno.test('word budget — counts the lead sentence once, and never the band, twin or masthead', () => {
  const d = docOf(nyxLiveSnapshot())
  const w = wordCountOf(d)
  const lede = block(d, 'lead_sentence')
  assert.ok(lede)
  const without = wordCountOf({ ...d, blocks: d.blocks.filter((b) => b.kind !== 'band' && b.kind !== 'masthead' && b.kind !== 'lead_chart') })
  assert.equal(without.cuttable, w.cuttable, 'the fixed parts are outside the count')
  assert.ok(w.fixed.band > 0 && w.fixed.twin > 0 && w.fixed.masthead > 0, 'and reported beside it')
  assert.equal(textOf('a&nbsp;<b>b</b>&mdash;c'), 'a b —c')
})
