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
import { BAND_LEAD_KINDS, bandMembersOf, bandOrder, isZeroSignSheet, leadSignOf } from './v2Predicates.ts'
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
  const DIET = 'the sheet headed “Diet, weight and food exposure”'
  const norm = (x: string): string =>
    textOf(x)
      .replaceAll(`on ${DIET}`, '@')
      .replaceAll(DIET, '@')
      .replace(/in the flags above|\babove\b|appendix C/g, '@')
  let compared = 0
  for (const [name, s] of v2DocFixtures()) {
    const html = trialReadingOf(s)
    const v1 = /<div class="callout"><span class="k">Interpreting this record<\/span>([\s\S]*?)<\/div>/.exec(dietTrialSection(s))
    assert.equal(html === null, v1 === null, `${name}: a reading exactly when v1 prints a callout`)
    if (html === null || v1 === null) continue
    assert.equal(norm(html), norm(v1[1]), `${name}: v1’s words`)
    assert.doesNotMatch(textOf(html), /\bappendix\b/i, `${name}: no appendix pointer`)
    assert.doesNotMatch(textOf(html).replace(/in the flags above/g, ''), /\babove\b/, `${name}: no “above” sheet 1 cannot honour`)
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
    assert.match(html, /<p class="lede serif" data-item="noticed_concern">Marked sleeping more on 6 of 42 days answered\.<\/p>/)
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

Deno.test('CUL-2381 — Nyx’s band leads with the burden and weight flags, then v1’s order', () => {
  const d = docOf(nyxLiveSnapshot())
  const band = block(d, 'band')
  assert.ok(band)
  assert.deepEqual(band.items.slice(0, 2).map((i) => i.tag), ['Burden', 'Weight'])
  // The same order on the phone, which reads the same model.
  const phone = renderPhoneV2(d)
  assert.ok(phone.indexOf('Flag: burden') < phone.indexOf('Flag: foreign material'))
})

Deno.test('CUL-2381 — bandOrder puts burden, weight loss and intake decline first, stable, and moves no member', () => {
  const s = nyxLiveSnapshot()
  const flags = s.safetyFlags
  const ordered = bandOrder(flags)
  assert.equal(ordered.length, flags.length)
  assert.deepEqual(new Set(ordered), new Set(flags))
  const leadCount = flags.filter((f) => BAND_LEAD_KINDS.includes(f.kind)).length
  assert.ok(ordered.slice(0, leadCount).every((f) => BAND_LEAD_KINDS.includes(f.kind)))
  const rest = ordered.slice(leadCount)
  assert.deepEqual(rest, flags.filter((f) => !BAND_LEAD_KINDS.includes(f.kind)), 'the rest keep the snapshot’s order')
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
  assert.equal(bandMembersOf(s).band[2].kind, 'intake_decline', 'it leads the band after burden and weight')
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
  assert.match(c.twin, /week 7 4-day week, so far, its bars drawn as outlines, not a full week/)
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
    assert.match(t, /Antigen exposure: Chicken ×11\. Proteins fed in the 35 trial days this report covers that the trial diet does not contain/)
    assert.match(t, /trial days this report covers: 18 doses by mouth were logged as given inside a food off the allowed list or not identified \(Prednisolone, Zyrtec\)/)
    assert.match(t, /so these exposures are not in the antigen tally above/)
    assert.match(t, /Off-list foods after the trial: Applaws Chicken Breast in broth: 12 feedings on 8 days after the trial, Oct 21 – Oct 28/)
    assert.match(t, /Vomiting ×6/)
  }
  assert.match(squash(sheet1(renderPrintV2(docOf(cooper())))), /Antigen exposure: Beef ×4\./)
})

Deno.test('cold read — the rows are v1’s words, only pointers moved; nothing on sheet 1 points up or down at a v1 neighbour', () => {
  const DIET = 'the sheet headed “Diet, weight and food exposure”'
  let rows = 0
  for (const [name, s] of v2DocFixtures()) {
    for (const r of trialRowsOf(s)) {
      const t = textOf(r.html)
      assert.doesNotMatch(t, /\bappendix\b|\bpage 1\b/i, `${name}: ${textOf(r.labelHtml)}`)
      assert.doesNotMatch(t.replace(/the antigen tally above/g, ''), /\b(above|below)\b/, `${name}: ${textOf(r.labelHtml)}: “${t}”`)
      assert.ok(!t.includes(`the antigen tally ${DIET}`) || !trialRowsOf(s).some((x) => /^Antigen exposure/.test(textOf(x.labelHtml))), `${name}: the tally points up only when it prints above`)
      // v1's own words: the section still holds this row with the same text but its pointers.
      const v1 = textOf(dietTrialSection(s))
      const core = t.replace(/\s*\((?:on |dated )?[^()]*sheet headed “[^”]+”\)/g, '').slice(0, 60)
      assert.ok(v1.includes(core.slice(0, 40)), `${name}: “${core}” is v1’s`)
      rows++
    }
  }
  assert.ok(rows >= 6, `rows exercised (${rows})`)
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
