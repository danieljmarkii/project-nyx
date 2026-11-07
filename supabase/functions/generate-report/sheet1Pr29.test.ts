// Vet report v2 sheet 1, PR-29: what v1's page 1 carries on the trial (CUL-2514), the zero-sign
// sheet's serif sentence (CUL-2361 ruling (a)), the band's order and its trial-food list (CUL-2381
// ruling (a)), and the lead chart's open courses, day placement, short last week and frame (CUL-2360).
//
// Every fixture is one a production caller can hand over: built through `assembleReport`, or
// nyx-live's real record. Where a test edits a snapshot it edits one field a real record can hold.
import assert from 'node:assert/strict'
import { assembleReport, type ReportSnapshot, type SafetyFlag } from './report.ts'
import { ABSENCE_SENTENCE, bandFlagOf, buildDocumentV2, dayPos, textOf, type BlockV2, type DocumentV2, type LeadChart } from './documentV2.ts'
import { renderPrintV2 } from './renderPrintV2.ts'
import { renderPhoneV2 } from './renderPhoneV2.ts'
import { dietTrialSection } from './render.ts'
import { trialReadingOf, trialRowsOf } from './backSheetsV2.ts'
import { PARTLY_PRINT } from './renderBackV2.ts'
import { BAND_LEAD_KINDS, BAND_PRESENT_KINDS, bandMembersOf, bandOrder, isZeroSignSheet, leadSignOf } from './v2Predicates.ts'
import { cooperInput } from './cooperDemo.testutil.ts'
import { nyxLiveSnapshot } from './nyxLive.testutil.ts'
import { v2DocFixtures } from '../../../scripts/report-phone/fixtures.deno.ts'

const OPTS = { owner: { firstName: 'Ada', lastName: null }, shortId: null, questions: [] as string[] }
const docOf = (s: ReportSnapshot): DocumentV2 => buildDocumentV2(s, OPTS)
const block = <K extends BlockV2['kind']>(d: DocumentV2, kind: K): Extract<BlockV2, { kind: K }> | undefined =>
  d.blocks.find((b): b is Extract<BlockV2, { kind: K }> => b.kind === kind)
const chartOf = (d: DocumentV2): LeadChart => {
  const c = block(d, 'lead_chart')
  assert.ok(c)
  return c.chart
}
const cooper = (): ReportSnapshot => assembleReport({ ...cooperInput(), audience: { kind: 'owner', includeLookNotes: false } })
/** Sheet 1 of a print render: everything before the first back sheet. */
const sheet1 = (html: string): string => html.slice(0, html.indexOf('</main>'))

// ── CUL-2514: sheet 1 carries v1 page 1's trial facts ───────────────────────

Deno.test('CUL-2514 — Nyx’s sheet 1 states the off-diet feedings with their days, the doses by mouth and the unread panels, in print and on the phone', () => {
  const d = docOf(nyxLiveSnapshot())
  const r = block(d, 'trial_reading')
  assert.ok(r, 'the trial reading prints on sheet 1')
  for (const html of [sheet1(renderPrintV2(d)), renderPhoneV2(d)]) {
    const t = textOf(html)
    assert.match(t, /The trial diet was not fed exclusively: 11 of 167 feedings in the 35 trial days this report covers did not match it on Oct 18, Oct 19 and Oct 20, 2026/)
    assert.match(t, /18 doses by mouth in the 35 trial days this report covers may carry a protein/)
    assert.match(t, /The ingredient panels of 5 of the 6 trial-diet foods/)
    assert.match(t, /so this record shows an elimination that was broken, not a clean one/)
  }
})

Deno.test('CUL-2514 — Cooper’s sheet 1 states the beef jerky days and the timing signal (beef before 4 of 4 vomits)', () => {
  const t = textOf(sheet1(renderPrintV2(docOf(cooper()))))
  assert.match(t, /4 of 42 feedings during the trial did not match it on Sep 30, Oct 4, Oct 8 and Oct 13, 2026/)
  assert.match(t, /Beef was in the 12 h before 4 of 4 vomiting episodes \(an early signal, not confirmed\)/)
})

Deno.test('CUL-2514 — the reading is v1’s page-1 callout word for word, only its pointers moved to v2’s sheets', () => {
  // Every pointer either side, reduced to one token: what is left must be the same words.
  const DIET = 'the sheet headed “Diet history and food exposure”'
  const norm = (x: string): string =>
    textOf(x)
      .replaceAll(`on ${DIET}`, '@')
      .replaceAll(DIET, '@')
      .replace(/(?:in|on) appendix [A-G]|appendix [A-G]/g, '@')
      .replace(/in the flags above|\babove\b/g, '@')
  let compared = 0
  for (const [name, s] of v2DocFixtures()) {
    const html = trialReadingOf(s)
    const v1 = /<div class="callout"><span class="k">Interpreting this record<\/span>([\s\S]*?)<\/div>/.exec(dietTrialSection(s))
    assert.equal(html === null, v1 === null, `${name}: a reading exactly when v1 prints a callout`)
    if (html === null || v1 === null) continue
    assert.equal(norm(html), norm(v1[1]), `${name}: v1’s words`)
    assert.doesNotMatch(textOf(html), /\bappendix\b/i, `${name}: no appendix pointer`)
    // CUL-2551: the callout follows its own rows on sheet 1, so v1's "(above)" is true as written.
    compared++
  }
  assert.ok(compared >= 5, `compared ${compared}`)
})

Deno.test('CUL-2514 — every trial fixture with a v1 callout prints it on sheet 1 (mutation: dropping the block reds this)', () => {
  let seen = 0
  for (const [name, s] of v2DocFixtures()) {
    if (trialReadingOf(s) === null) continue
    const d = docOf(s)
    assert.ok(block(d, 'trial_reading'), `${name}: the reading is a sheet 1 block`)
    assert.ok(sheet1(renderPrintV2(d)).includes('data-block="trial-reading"'), `${name}: print renders it`)
    assert.ok(renderPhoneV2(d).includes('data-block="trial-reading"'), `${name}: phone renders it`)
    seen++
  }
  assert.ok(seen >= 5, `the fixtures exercise the reading (${seen})`)
})

Deno.test('CUL-2514 — the chart ticks each off-diet feeding day and the twin names the days', () => {
  const c = chartOf(docOf(nyxLiveSnapshot()))
  const row = c.rows.find((r) => r.kind === 'span' && r.tickKind === 'off_diet')
  assert.ok(row && row.kind === 'span' && row.doseCols)
  assert.equal(row.doseCols.length, 3)
  assert.ok(c.marks.includes('off_diet_ticks'))
  assert.match(c.twin, /Ticks, one per day a feeding off the trial diet was logged: on Oct 18, Oct 19, Oct 20 \(a floor, not a total\)/)
  const k = chartOf(docOf(cooper()))
  assert.match(k.twin, /off the trial diet was logged: on Sep 30, Oct 4, Oct 8, Oct 13/)
})

// ── CUL-2361: ruling (a) ─────────────────────────────────────────────────────

Deno.test('CUL-2361 — Olive: the serif sentence is the first change; the absence sentence prints verbatim as a body line', () => {
  const s = v2DocFixtures().find(([n]) => n === 'looks-only')![1]
  assert.ok(isZeroSignSheet(s))
  const d = docOf(s)
  const ch = block(d, 'changes')
  assert.ok(ch && ch.serifLead)
  const lede = block(d, 'lead_sentence')
  assert.ok(lede)
  assert.equal(lede.serif, false)
  assert.equal(lede.text, '42 of 42 days logged.')
  const lines = block(d, 'record_lines')?.lines ?? []
  assert.equal(lines[0]?.id, 'absence')
  assert.equal(lines[0].text, ABSENCE_SENTENCE)
  for (const html of [sheet1(renderPrintV2(d)), renderPhoneV2(d)]) {
    assert.match(html, /<p class="lede serif" data-item="noticed_concern">Marked sleeping more on 6 of 42 days answered, first Oct 6, last Oct 16 \(the day of this report\)\.<\/p>/)
  }
})

Deno.test('CUL-2361 — on every fixture sheet 1 has exactly one serif sentence, and it is never the absence sentence', () => {
  for (const [name, s] of v2DocFixtures()) {
    const d = docOf(s)
    for (const html of [sheet1(renderPrintV2(d)), renderPhoneV2(d).split('data-sheet="2"')[0]]) {
      const serif = [...html.matchAll(/<p class="lede serif"[^>]*>([\s\S]*?)<\/p>/g)].map((m) => textOf(m[1]))
      assert.equal(serif.length, 1, `${name}: one serif sentence (${serif.length})`)
      assert.ok(!serif[0].includes('No symptom events were logged'), `${name}: the serif sentence is not the absence sentence`)
    }
  }
})

Deno.test('CUL-2361 — a zero-sign sheet with no change leads with the coverage count, in serif', () => {
  const s = structuredClone(v2DocFixtures().find(([n]) => n === 'looks-only')![1])
  // A record with no change line: nothing marked on the daily look, every meal finished, and a
  // three-year-old, so a weight from Sep 1 is not a stale senior weight.
  s.noticed = null
  s.v2 = { ...s.v2, mealNotFinishedDays: 0 }
  s.signalment = { ...s.signalment, ageYears: 3 }
  const d = docOf(s)
  assert.equal(block(d, 'changes'), undefined, 'no change line holds')
  const lede = block(d, 'lead_sentence')
  assert.ok(lede && lede.serif)
  assert.match(lede.text, /^\d+ of \d+ days logged\.$/)
})

// ── CUL-2381: the band's order (ruling (a)) and its short trial-food list ───

Deno.test('CUL-2627 ruling (a) — Nyx’s band leads with the foreign-material flag, then burden and weight, then v1’s order', () => {
  const d = docOf(nyxLiveSnapshot())
  const band = block(d, 'band')
  assert.ok(band)
  assert.deepEqual(band.items.map((i) => i.tag), ['Foreign material', 'Burden', 'Weight', 'Diet not eaten', 'Chronicity', 'Chronicity'])
  // The same order on the phone and the print, which read the same model.
  for (const html of [renderPhoneV2(d), renderPrintV2(d)]) {
    const at = (s: string) => html.indexOf(s)
    assert.ok(at('Flag: foreign material') >= 0 && at('Flag: foreign material') < at('Flag: burden'))
    assert.ok(at('Flag: burden') < at('Flag: weight'))
  }
})

Deno.test('CUL-2627 + CUL-2381 — bandOrder: present blood, present foreign, then burden, weight loss, intake decline, then the rest; stable, and moves no member', () => {
  const s = nyxLiveSnapshot()
  const blood: SafetyFlag = { kind: 'present_blood', source: 'vomit', incidents: [{ eventId: 'vb', occurredAt: '2026-10-20T14:00:00Z', kind: 'fresh_red' }] } as SafetyFlag
  // Blood placed last in the snapshot, so its lead is the order's doing, not the input's.
  const flags = [...s.safetyFlags, blood]
  const ordered = bandOrder(flags)
  assert.equal(ordered.length, flags.length)
  assert.deepEqual(new Set(ordered), new Set(flags))
  const order = [...BAND_PRESENT_KINDS, ...BAND_LEAD_KINDS]
  const ranked = flags.filter((f) => order.includes(f.kind))
  const head = ordered.slice(0, ranked.length)
  assert.deepEqual(head.map((f) => f.kind), ['present_blood', 'present_foreign', 'symptom_burden', 'weight_loss'])
  for (let i = 1; i < head.length; i++) assert.ok(order.indexOf(head[i - 1].kind) <= order.indexOf(head[i].kind))
  assert.deepEqual(ordered.slice(ranked.length), flags.filter((f) => !order.includes(f.kind)), 'the rest keep the snapshot’s order')
})

Deno.test('CUL-2627 — on every fixture, a present flag opens the band, and "These lead the flags for review above" prints only when one does', () => {
  let present = 0
  let lead = 0
  for (const [name, s] of [...v2DocFixtures(), ['nyx-live-real', nyxLiveSnapshot()] as const]) {
    const d = docOf(s as ReportSnapshot)
    const band = block(d, 'band')
    const hasPresent = (s as ReportSnapshot).safetyFlags.some((f) => BAND_PRESENT_KINDS.includes(f.kind))
    if (hasPresent) {
      present++
      assert.ok(band, `${name}: a present flag with no band`)
      assert.ok(/^Possible blood|^Blood|^Foreign material/.test(band.items[0].tag) || BAND_PRESENT_KINDS.some((k) => band.items[0].id.includes(k)), `${name}: band opens with ${band.items[0].id}`)
    }
    const html = renderPrintV2(d)
    const at = html.indexOf('These lead the flags for review above')
    if (at >= 0) {
      lead++
      assert.ok(band && BAND_PRESENT_KINDS.some((k) => band.items[0].id.includes(k)), `${name}: "these lead" with the band opened by ${band?.items[0].id}`)
      assert.ok(html.indexOf('data-block="band"') < at, `${name}: the band is above the line that says it leads`)
    }
  }
  assert.ok(present >= 2 && lead >= 1, `present ${present}, lead lines ${lead}`)
})

Deno.test('CUL-2381 — the lead sign keeps the snapshot’s order: an intake decline moved up the band does not take the chart', () => {
  const s = structuredClone(nyxLiveSnapshot())
  const decline: SafetyFlag = {
    kind: 'intake_decline',
    trigger: 'relative' as never,
    species: 'cat' as never,
    baselineScore: 1,
    recentScore: 0.5,
    daysBelowBaseline: 3,
    refusedFoodLabel: null,
    ratedMealsConsidered: 6,
    lastFullMealIso: null,
    hoursSinceLastFullMeal: null,
  }
  s.safetyFlags = [...s.safetyFlags, decline]
  assert.equal(bandMembersOf(s).band[3].kind, 'intake_decline', 'it follows the present flag, burden and weight (CUL-2627, CUL-2381)')
  assert.equal(leadSignOf(s)?.sign, 'vomit', 'the chart still leads with the sign the snapshot’s first flag names')
})

Deno.test('CUL-2381 — a refusal row past two trial foods names the first and counts the rest; the full list stays on the diet sheet', () => {
  const s = nyxLiveSnapshot()
  const f = s.safetyFlags.find((x) => x.kind === 'trial_diet_refusal')
  assert.ok(f && f.kind === 'trial_diet_refusal' && f.trialDietLabels.length === 6)
  const short = bandFlagOf(f)
  assert.ok(short.kind === 'trial_diet_refusal')
  assert.deepEqual(short.trialDietLabels, [`${f.trialDietLabels[0]} + 5 other trial items`])
  const html = renderPrintV2(docOf(s))
  const band = textOf(html.slice(html.indexOf('data-block="band"'), html.indexOf('</section>', html.indexOf('data-block="band"'))))
  assert.match(band, /Trial diet: Royal Canin Selected Protein PR, Dry \+ 5 other trial items\./)
  for (const l of f.trialDietLabels.slice(1)) assert.ok(!band.includes(l), `“${l}” is not in the band`)
  // Two foods or fewer print whole.
  const two = { ...f, trialDietLabels: f.trialDietLabels.slice(0, 2) }
  assert.equal(bandFlagOf(two), two)
})

// ── CUL-2360: the chart ──────────────────────────────────────────────────────

Deno.test('CUL-2360 — a course with no recorded end runs dotted past its last logged dose, and the twin says so', () => {
  const s = structuredClone(nyxLiveSnapshot())
  const pred = s.concurrentChanges.find((c) => c.label === 'Prednisolone')
  assert.ok(pred && pred.endIsDeclared)
  pred.endIsDeclared = false
  const d = docOf(s)
  const c = chartOf(d)
  const row = c.rows.find((r) => r.kind === 'span' && r.label === 'Prednisolone')
  assert.ok(row && row.kind === 'span' && row.openCourse)
  assert.ok(c.marks.includes('open_end'))
  assert.match(c.twin, /Dotted after the last logged dose, no end recorded: Prednisolone/)
  assert.match(renderPrintV2(d), /class="span open"/)
  assert.match(renderPhoneV2(d), /class="span open"/)
  // Declared, it carries its end bracket and no dotted line.
  const closed = chartOf(docOf(nyxLiveSnapshot()))
  const r2 = closed.rows.find((r) => r.kind === 'span' && r.label === 'Prednisolone')
  assert.ok(r2 && r2.kind === 'span' && !r2.openCourse)
  assert.ok(!closed.marks.includes('open_end'))
})

Deno.test('CUL-2360 — spans sit on their days, never a column’s centre (Prednisolone from Sep 21, a Monday in the week from Sep 16)', () => {
  const c = chartOf(docOf(nyxLiveSnapshot()))
  const row = c.rows.find((r) => r.kind === 'span' && r.label === 'Prednisolone')
  assert.ok(row && row.kind === 'span')
  assert.equal(c.columns[0].start, '2026-09-16')
  // Sep 21 is day 6 of the week from Sep 16: (5 + 0.5) / 7 of the first column, not 0.5.
  assert.ok(Math.abs(row.fromPos - 5.5 / 7) < 1e-9, `from ${row.fromPos}`)
  assert.ok(Math.abs(row.toPos - dayPos(c.columns, '2026-10-11')) < 1e-9)
  // Oct 11 is day 5 of the week from Oct 7.
  assert.ok(Math.abs(row.toPos - (3 + 4.5 / 7)) < 1e-9, `to ${row.toPos}`)
})

Deno.test('CUL-2360 — the short last week draws outlines, and the burden flag’s window is bracketed under the axis', () => {
  const d = docOf(nyxLiveSnapshot())
  const c = chartOf(d)
  assert.equal(c.columns[c.columns.length - 1].days, 4)
  assert.match(c.twin, /week 7 4-day week, so far, its bars drawn as outlines and labelled with its days, not a full week/)
  const html = renderPrintV2(d)
  const lead = [...html.matchAll(/<rect class="(bar lead[^"]*)"/g)].map((m) => m[1])
  assert.equal(lead[lead.length - 1], 'bar lead sofar', 'the last bar is an outline')
  assert.ok(lead.slice(0, -1).every((x) => x === 'bar lead'), 'the full weeks stay filled')
  assert.deepEqual(c.recentBracket?.label, 'the last 7 days, 6 vomiting entries, as the burden flag counts them')
  assert.ok(c.marks.includes('recent_bracket'))
  assert.match(html, /class="bracket"/)
  assert.match(renderPhoneV2(d), /class="bracket"/)
})

Deno.test('CUL-2360 N9 — no mark or label on any fixture’s chart runs past the plot’s right edge', () => {
  const RIGHT = 118 + 392
  for (const [name, s] of v2DocFixtures()) {
    const html = renderPrintV2(docOf(s))
    const svg = /<svg class="chart"[\s\S]*?<\/svg>/.exec(html)?.[0] ?? ''
    for (const m of svg.matchAll(/\b(x|x1|x2)="([\d.]+)"/g)) assert.ok(Number(m[2]) <= RIGHT + 0.05, `${name}: ${m[1]}=${m[2]}`)
    for (const m of svg.matchAll(/<rect [^>]*x="([\d.]+)"[^>]*width="([\d.]+)"/g)) assert.ok(Number(m[1]) + Number(m[2]) <= RIGHT + 0.05, `${name}: a rect ends at ${Number(m[1]) + Number(m[2])}`)
    // A label anchored at its start can only begin left of the last column's start.
    for (const m of svg.matchAll(/<text class="ax part" x="([\d.]+)"[^>]*>([^<]*)</g)) {
      const anchoredEnd = new RegExp(`x="${m[1]}"[^>]*text-anchor="end"`).test(m[0])
      if (!anchoredEnd) assert.ok(Number(m[1]) + m[2].length * 3.6 <= RIGHT + 1, `${name}: “${m[2]}” at ${m[1]} runs past the frame`)
    }
  }
})

// ── Adversarial pass 1 on PR-29 ──────────────────────────────────────────────

Deno.test('pass 1 — an owner-typed name with "above" in it builds, prints verbatim, and is never taken for a pointer', () => {
  for (const name of ['Cerenia (dose above)', 'Metronidazole (see above)', 'same as above']) {
    const s = structuredClone(nyxLiveSnapshot())
    assert.ok(s.trial && s.trial.medicationOverlap.length > 0)
    s.trial.medicationOverlap[0] = { ...s.trial.medicationOverlap[0], drugName: name }
    const d = docOf(s) // threw before the fix: the whole v2 report failed
    const r = block(d, 'trial_reading')
    assert.ok(r)
    assert.ok(textOf(r.html ?? '').includes(name), `“${name}” prints as the owner typed it`)
  }
})

Deno.test('pass 1 — the intake row’s short last column stays filled: a share of meals rated is not shortened by fewer days (Cooper 4 of 12)', () => {
  const d = docOf(cooper())
  const c = chartOf(d)
  assert.equal(c.columns[c.columns.length - 1].days, 6)
  for (const html of [renderPrintV2(d), renderPhoneV2(d)]) {
    const chart = html.slice(html.indexOf('data-block="lead-chart"'))
    assert.ok(/class="bar partly" /.test(chart), 'the newest intake column is drawn filled')
    assert.ok(!/class="bar partly sofar"/.test(chart), 'no intake bar is hollowed')
  }
  // The vomiting row (not the lead here) in that column still draws its outline, and the twin says so.
  assert.match(renderPrintV2(d), /class="bar sofar"/)
  assert.match(c.twin, /so far, its bars drawn as outlines/)
})

// ── Cold read at 7025c6d: v1 page 1's trial rows that name the breaks ───────

Deno.test('cold read — sheet 1 names the off-diet protein, the doses given in food with their drugs, and the off-list foods after the trial (Nyx)', () => {
  const d = docOf(nyxLiveSnapshot())
  // textOf spaces out v1's number spans ("Chicken × 11 ."); read it as printed.
  const squash = (x: string): string => textOf(x).replace(/×\s+/g, '×').replace(/\s+([.,;:)])/g, '$1').replace(/\(\s+/g, '(')
  for (const html of [sheet1(renderPrintV2(d)), renderPhoneV2(d)]) {
    const t = squash(html)
    assert.match(t, /Antigen exposure Chicken ×11\. Proteins fed in the 35 trial days this report covers that the trial diet does not contain/)
    assert.match(t, /trial days this report covers 18 doses by mouth were logged as given inside a food off the allowed list or not identified \(Prednisolone, Zyrtec\)/)
    assert.match(t, /so these exposures are not in the antigen tally above/)
    assert.match(t, /Off-list foods after the trial Applaws Chicken Breast in broth: 12 feedings on 8 days after the trial, Oct 21 – Oct 28/)
    assert.match(t, /Vomiting ×6/)
  }
  assert.match(squash(sheet1(renderPrintV2(docOf(cooper())))), /Antigen exposure Beef ×4\./)
})

Deno.test('cold read, CUL-2551 — the rows are every v1 trial row, v1’s words in v1’s order, only appendix and page pointers moved', () => {
  // CUL-2551 (brief 2a) moves the whole trial section to sheet 1 in v1's order, so v1's own "above"
  // and "below" stay true where v1 wrote them (the tally, the counts that follow); only appendix and
  // page pointers move.
  let rows = 0
  for (const [name, s] of v2DocFixtures()) {
    const v1 = [...dietTrialSection(s).matchAll(/<div class="kv"><span class="k">([\s\S]*?)<\/span><span>/g)].map((m) => textOf(m[1]))
    const got = trialRowsOf(s)
    assert.deepEqual(got.map((r) => textOf(r.labelHtml)), v1, `${name}: every row, in v1’s order`)
    for (const r of got) {
      const t = textOf(r.html)
      assert.doesNotMatch(t, /\bappendix\b|\bpage 1\b/i, `${name}: ${textOf(r.labelHtml)}`)
      rows++
    }
  }
  assert.ok(rows >= 60, `rows exercised (${rows})`)
})

Deno.test('cold read — inside a short last column a day keeps a full week’s width, and the window ends inside the column, not past it', () => {
  const c = chartOf(docOf(nyxLiveSnapshot()))
  assert.equal(c.columns.length, 7)
  assert.equal(c.columns[6].days, 4)
  assert.ok(Math.abs(c.endPos - (6 + 4 / 7)) < 1e-9, `end ${c.endPos}`)
  assert.ok(c.recentBracket && Math.abs(c.recentBracket.toPos - c.endPos) < 1e-9, 'the bracket stops at Oct 31')
  for (const r of c.rows) if (r.kind === 'span') assert.ok(r.toPos <= c.endPos + 1e-9 && (r.doseCols ?? []).every((p) => p <= c.endPos + 1e-9), `${r.label} stays inside the window`)
  // Cooper's Oct 13 off-diet tick sits in his 6-day last week at a seventh of a column per day,
  // never a sixth.
  const k = chartOf(docOf(cooper()))
  const off = k.rows.find((r) => r.kind === 'span' && r.tickKind === 'off_diet')
  assert.ok(off && off.kind === 'span' && off.doseCols)
  const last = k.columns.length - 1
  const within = (Date.parse('2026-10-13') - Date.parse(k.columns[last].start)) / 86_400_000
  assert.ok(Math.abs(off.doseCols[off.doseCols.length - 1] - (last + (within + 0.5) / 7)) < 1e-9)
})

// ── CUL-2627 instance 2: a past window's end warning sits under the header ───

Deno.test('CUL-2627 ruling (a) — a past window’s end warning prints once, under the masthead, above the checks line it limits (Tama)', () => {
  const byName = new Map(v2DocFixtures())
  const s = byName.get('trial-report-past-window')
  assert.ok(s)
  const d = docOf(s)
  const ids = d.blocks.map((b) => b.id)
  const disclosure = block(d, 'disclosure')
  assert.ok(disclosure && disclosure.html.includes('Window ends before this report.'), 'the disclosure block carries it')
  assert.equal(ids.indexOf('disclosure'), ids.indexOf('masthead') + 1, ids.join(' '))
  const checksAt = Math.max(ids.indexOf('checks'), ids.indexOf('band'))
  assert.ok(checksAt > ids.indexOf('disclosure'), `the checks line follows it: ${ids.join(' ')}`)
  for (const html of [renderPrintV2(d), renderPhoneV2(d)]) {
    const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'))
    const sheet1 = main.slice(0, main.indexOf('data-sheet="2"') < 0 ? undefined : main.indexOf('data-sheet="2"'))
    assert.equal(sheet1.split('Window ends before this report.').length - 1, 1, 'printed once')
    assert.ok(sheet1.indexOf('Window ends before this report.') < sheet1.indexOf('Ran and did not trigger'))
    assert.ok(sheet1.indexOf('Nothing after May 20 is counted or flagged') < sheet1.indexOf('Ran and did not trigger'))
  }
})

Deno.test('CUL-2627 — no v1 disclosure line prints twice on sheet 1, on any fixture', () => {
  let seen = 0
  for (const [name, s] of [...v2DocFixtures(), ['nyx-live-real', nyxLiveSnapshot()] as const]) {
    const d = docOf(s as ReportSnapshot)
    assert.ok(!d.blocks.some((b) => b.kind === 'carried' && b.html.includes('class="cherry"')), `${name}: a v1 disclosure carried a second time`)
    const disclosure = block(d, 'disclosure')
    if (disclosure) seen++
  }
  assert.ok(seen >= 1, `${seen} fixtures with a disclosure`)
})

// ── CUL-2614 ruling (a): the partly-eaten tone on paper, and the twin's words ──

/** Rec. 601 grey, the conversion pdftoppm -gray applies before survival.py's threshold. */
const grey = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return 0.299 * r + 0.587 * g + 0.114 * b
}

Deno.test('CUL-2614 — every printed document draws partly eaten in PARTLY_PRINT: dark enough for the copier, not the concern crimson', () => {
  // survival.py thresholds at 128 after a 0.75px blur; a bar's interior keeps its grey.
  assert.ok(grey(PARTLY_PRINT) < 128 - 10, `grey ${grey(PARTLY_PRINT).toFixed(0)}`)
  assert.notEqual(PARTLY_PRINT.toLowerCase(), '#9f1239')
  assert.notEqual(PARTLY_PRINT.toLowerCase(), '#a34d64', 'the stopgap tone that read as refused in colour')
  const d = docOf(nyxLiveSnapshot())
  const print = renderPrintV2(d)
  assert.ok(print.includes(`--partly:${PARTLY_PRINT};`), 'the print sheet')
  const phone = renderPhoneV2(d)
  const media = phone.slice(phone.lastIndexOf('@media print{'))
  assert.ok(media.includes(`--partly:${PARTLY_PRINT};`), 'the phone document’s own print, which kept the pale #d9a3b0')
  assert.ok(phone.slice(0, phone.indexOf('@media print{')).includes('--partly:#d9a3b0;'), 'the phone screen keeps its light tone')
  // The ledger's partly cell is dark on paper, so its count prints in paper, as the refused cell's does.
  for (const css of [print, media]) assert.ok(css.includes('.back .lg td.lg-sign.lg-partly{color:var(--paper);}'))
})

Deno.test('CUL-2614 — the twin says what a copy shows: partly eaten in a paler tone, printed solid on a black-and-white copy', () => {
  let seen = 0
  for (const [name, s] of v2DocFixtures()) {
    const html = renderPrintV2(docOf(s))
    assert.ok(!html.includes('drawn light'), `${name}: the old wording`)
    if (html.includes('partly eaten in a paler tone, which a black-and-white copy prints solid')) seen++
  }
  assert.ok(seen >= 1, 'a fixture draws a partly-eaten share')
})

Deno.test('CUL-2614 (adversarial pass 1) — a thin share is drawn: 1 partly-eaten meal of 28 rated keeps a bar a copier can hold', () => {
  for (const [name, snap] of v2DocFixtures()) {
    const d = docOf(snap)
    const chart = d.blocks.find((b) => b.kind === 'lead_chart')
    if (!chart || chart.kind !== 'lead_chart') continue
    const row = chart.chart.rows.find((r) => r.kind === 'intake')
    if (!row || row.kind !== 'intake') continue
    // The thinnest share a record can hold: 1 of 28, partly eaten, nothing refused, in every column.
    const thin: DocumentV2 = {
      ...d,
      blocks: d.blocks.map((b) =>
        b === chart ? { ...chart, chart: { ...chart.chart, rows: chart.chart.rows.map((r) => (r === row ? { ...row, cells: row.cells.map(() => ({ rated: 28, notFinished: 1, refused: 0 })) } : r)) } } : b,
      ),
    }
    for (const html of [renderPrintV2(thin), renderPhoneV2(thin)]) {
      const bars = [...html.matchAll(/<rect class="bar partly"[^>]*height="([\d.]+)"/g)].map((m) => Number(m[1]))
      assert.ok(bars.length > 0, `${name}: a partly bar`)
      for (const hgt of bars) assert.ok(hgt >= 2, `${name}: a 1-of-28 share drawn ${hgt} high`)
    }
    return
  }
  throw new Error('no fixture draws an intake row')
})

Deno.test('CUL-2614 (adversarial pass 2) — at equal rated, the bar and its crimson never fall as refusals or unfinished meals rise, and never pass the full bar', () => {
  const s = [...v2DocFixtures()].find(([, snap]) => {
    const c = docOf(snap).blocks.find((b) => b.kind === 'lead_chart')
    return c && c.kind === 'lead_chart' && c.chart.rows.some((r) => r.kind === 'intake')
  })
  assert.ok(s, 'a fixture draws an intake row')
  const d = docOf(s[1])
  const chart = d.blocks.find((b) => b.kind === 'lead_chart')
  assert.ok(chart && chart.kind === 'lead_chart')
  const row = chart.chart.rows.find((r) => r.kind === 'intake')
  assert.ok(row && row.kind === 'intake')
  const rated = 28
  // Every (refused, notFinished) pair at 28 rated, one per column, read back from each renderer.
  const pairs: Array<[number, number]> = []
  for (let nf = 0; nf <= rated; nf++) for (let r = 0; r <= nf; r++) pairs.push([r, nf])
  for (const render of [renderPrintV2, renderPhoneV2]) {
    const at = (r: number, nf: number) => {
      const one: DocumentV2 = {
        ...d,
        // The intake row alone, so every bar read back is an intake bar, never a sign row's.
        blocks: d.blocks.map((b) => (b === chart ? { ...chart, chart: { ...chart.chart, rows: [{ ...row, cells: row.cells.map(() => ({ rated, notFinished: nf, refused: r })) }] } } : b)),
      }
      const html = render(one)
      const h = (cls: string) => Number(new RegExp(`<rect class="bar ${cls}"[^>]*height="([\\d.]+)"`).exec(html)?.[1] ?? 0)
      return { crimson: h('lead'), total: h('lead') + h('partly') }
    }
    const v = new Map(pairs.map(([r, nf]) => [`${r}/${nf}`, at(r, nf)]))
    // Each height prints to 0.1, so a two-segment sum can read up to 0.1 high: two roundings' slack.
    const eps = 0.11
    const full = at(rated, rated).total
    for (const [r, nf] of pairs) {
      const here = v.get(`${r}/${nf}`)!
      assert.ok(here.total <= full + eps, `${r}/${nf} passes the full bar`)
      if (nf > 0) assert.ok(here.total >= 2 - eps, `${r}/${nf}: under the copier floor`)
      const more = v.get(`${r}/${nf + 1}`)
      if (more) assert.ok(more.total >= here.total - eps, `${r}/${nf} → ${r}/${nf + 1}: the bar fell`)
      const worse = v.get(`${r + 1}/${nf}`) ?? v.get(`${r + 1}/${nf + 1}`)
      if (worse) assert.ok(worse.crimson >= here.crimson - eps && worse.total >= here.total - eps, `${r}/${nf} → more refused: the bar or its crimson fell`)
    }
  }
})

Deno.test('CUL-2627 (adversarial pass 1) — a record read short prints "Partial record" on sheet 1, under the masthead, once', () => {
  const s = structuredClone(nyxLiveSnapshot())
  s.incompletePulls = ['events']
  const d = docOf(s)
  const disclosure = block(d, 'disclosure')
  assert.ok(disclosure && disclosure.html.includes('Partial record.'))
  const ids = d.blocks.map((b) => b.id)
  assert.equal(ids.indexOf('disclosure'), ids.indexOf('masthead') + 1)
  for (const html of [renderPrintV2(d), renderPhoneV2(d)]) {
    const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'))
    const sheet1 = main.slice(0, main.indexOf('data-sheet="2"'))
    assert.equal(sheet1.split('Partial record.').length - 1, 1)
    assert.ok(sheet1.indexOf('Partial record.') < sheet1.indexOf('data-block="band"'))
  }
})
