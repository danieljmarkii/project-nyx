// CUL-2289 (VR2-9) — the v2 predicates: the band and R-11, the lead, the thin record, the record
// edge, the gap lines, and "Changes in this window" (PM ruling (a) on CUL-2323).
//
// Run with:  deno test --allow-read=supabase/functions supabase/functions/generate-report/v2Predicates.test.ts
//
// Every snapshot here comes out of `assembleReport` over a record production could hold
// (`v2Fixtures.testutil.ts`, the sample cases the cold read uses). A test that needs a state the
// engine will not produce on demand (a lent tier, a second flag on the sign) edits ONE field of an
// assembled snapshot, so each R-11 condition is broken alone against an otherwise exempt flag.
import assert from 'node:assert/strict'
import { assembleReport, type ReportInput, type ReportSnapshot, type SafetyFlag } from './report.ts'
import {
  bandMembersOf,
  changesInWindowOf,
  isZeroSignSheet,
  CHANGES_MEALS_NOT_FINISHED_MIN_DAYS,
  CHANGES_NOTICED_MIN_DAYS,
  CHANGES_WEIGHT_STALE_DAYS,
  GAP_LINE_MAX,
  GAP_WEIGHT_STALE_DAYS,
  gapLinesOf,
  LEAD_REASON_LINE,
  leadSignOf,
  r11ConditionsOf,
  r11Holds,
  recordEdgeLinesOf,
  RECORD_BEGINS_MAX_DAYS,
  SKIN_TRIAL_SIGNS,
  THIN_RECORD_DAYS,
  thinRecordLineOf,
} from './v2Predicates.ts'
import { at, baseInput, dailyMeals, dayKey, itchingSkinTrial, juniper, meal, olive, skinTrial, steadyInstants, symptom, symptomAt, V2_NOW, wobblingSkinTrial } from './v2Fixtures.testutil.ts'
import { sampleCases } from '../../../scripts/render-trial-report-sample.deno.ts'

type Chronicity = Extract<SafetyFlag, { kind: 'chronicity' }>

const snap = (i: ReportInput): ReportSnapshot => assembleReport(i)
const steady = (): ReportSnapshot => snap(itchingSkinTrial({ jump: false }))
const itchFlag = (s: ReportSnapshot): Chronicity => {
  const f = s.safetyFlags.find((x): x is Chronicity => x.kind === 'chronicity' && x.symptomType === 'itch')
  assert.ok(f, 'the fixture fires an itch chronicity flag')
  return f
}
const withFlags = (s: ReportSnapshot, flags: SafetyFlag[]): ReportSnapshot => ({ ...s, safetyFlags: flags })
const sample = (name: string): ReportInput => {
  const c = sampleCases().find(([n]) => n === name)
  if (!c) throw new Error(`no sample ${name}`)
  return c[1]
}
const weightLoss = (over: Partial<Extract<SafetyFlag, { kind: 'weight_loss' }>> = {}): SafetyFlag => ({
  kind: 'weight_loss',
  asOf: 'now',
  latest: { kg: 27, source: 'home_scale' as never, single: true, day: dayKey(20) },
  highBefore: { kg: 30, source: 'home_scale' as never, single: true, day: dayKey(80) },
  tier: 'firm' as never,
  planned: false,
  mixedInstruments: false,
  windowDays: 90,
  ...over,
})

// ── R-11: the skin trial's own sign ─────────────────────────────────────────

Deno.test('R-11 — a steady chronic itch on a skin trial leaves the band and leads, still flagged', () => {
  const s = steady()
  const f = itchFlag(s)
  assert.deepEqual(r11ConditionsOf(s, f), { skinTrial: true, skinSign: true, noFoldedWorsening: true, tierFromSpan: true, onlyFlagOnSign: true })
  const m = bandMembersOf(s)
  assert.equal(m.leadFlag, f, 'the exempt flag is carried as the lead flag, never dropped')
  assert.deepEqual(m.band, [], 'and leaves the band')
  assert.deepEqual(leadSignOf(s), { sign: 'itch', reason: 'flag', line: LEAD_REASON_LINE.flag })
})

Deno.test('R-11 — Dr. Chen’s counterexample: itching jumps to 5 in the last 7 days, the flag stays in the band', () => {
  const s = snap(itchingSkinTrial({ jump: true }))
  const f = itchFlag(s)
  assert.equal(s.v2.chronicity.find((c) => c.symptomType === 'itch')?.worsening, 'rising', 'detection reports the folded rise')
  assert.equal(
    s.safetyFlags.some((x) => x.kind === 'symptom_worsening' && x.symptomType === 'itch'),
    false,
    'the composed set no longer holds the ④ card: only the export can see the rise',
  )
  assert.equal(r11ConditionsOf(s, f).noFoldedWorsening, false)
  const m = bandMembersOf(s)
  assert.equal(m.leadFlag, null)
  assert.deepEqual(m.band, [f])
})

Deno.test('R-11 condition 1 — any indication but exactly skin keeps the flag in the band', () => {
  for (const indication of ['gi', 'other'] as const) {
    const s = snap(itchingSkinTrial({ jump: false, indication }))
    assert.equal(r11ConditionsOf(s, itchFlag(s)).skinTrial, false, indication)
    assert.equal(bandMembersOf(s).leadFlag, null, indication)
    assert.equal(bandMembersOf(s).band.length, 1, indication)
  }
  const noTrial = steady()
  const s = { ...noTrial, trial: null }
  assert.equal(bandMembersOf(s).leadFlag, null, 'no trial: no exemption')
})

Deno.test('R-11 condition 2 — a sign off the closed skin list never leaves the band', () => {
  assert.deepEqual([...SKIN_TRIAL_SIGNS], ['itch', 'scratch', 'skin_reaction'])
  const s = steady()
  const f = itchFlag(s)
  for (const sign of ['vomit', 'diarrhea', 'cough', 'lethargy'] as const) {
    const moved: Chronicity = { ...f, symptomType: sign as never }
    const t: ReportSnapshot = {
      ...withFlags(s, [moved]),
      v2: { ...s.v2, chronicity: [{ ...s.v2.chronicity[0], symptomType: sign as never }] },
    }
    assert.equal(r11ConditionsOf(t, moved).skinSign, false, sign)
    assert.equal(bandMembersOf(t).leadFlag, null, `${sign} chronicity always stays in the band`)
  }
})

Deno.test('R-11 condition 3 — a rise that could not be measured is not "no rise"', () => {
  const s = steady()
  for (const worsening of ['rising', 'not_measured'] as const) {
    const t = { ...s, v2: { ...s.v2, chronicity: [{ ...s.v2.chronicity[0], worsening }] } }
    assert.equal(r11ConditionsOf(t, itchFlag(t)).noFoldedWorsening, false, worsening)
    assert.equal(bandMembersOf(t).leadFlag, null, worsening)
  }
  // A snapshot with no fact row for the flag fails closed.
  const bare = { ...s, v2: { ...s.v2, chronicity: [] } }
  assert.equal(bandMembersOf(bare).leadFlag, null, 'silence keeps the flag in the band')
})

Deno.test('R-11 condition 3 — a dark prior week reads not_measured, end to end', () => {
  // Same itching, but meals and entries stop for the 8 days before the last week: ④ cannot compare.
  const base = itchingSkinTrial({ jump: true })
  const events = base.events.filter((e) => {
    const daysAgo = Math.round((Date.parse('2026-10-16T12:00:00Z') - Date.parse(e.occurredAt.slice(0, 10) + 'T12:00:00Z')) / 86_400_000)
    return daysAgo < 7 || daysAgo > 14
  })
  const s = snap({ ...base, events })
  const fact = s.v2.chronicity.find((c) => c.symptomType === 'itch')
  assert.ok(fact, 'the course still fires: the dark week does not end it')
  // Today's comparison is dark. A replayed day whose two weeks straddle the gap may still see the
  // jump ('rising'); either way the answer is never "not rising".
  assert.notEqual(fact.worsening, 'not_rising', 'an unmeasurable week is never reported as no rise')
  assert.equal(bandMembersOf(s).leadFlag, null)
})

Deno.test('R-11 condition 4 — a tier lent by the composition layer keeps the flag in the band', () => {
  const s = steady()
  const f = itchFlag(s)
  const lent: ReportSnapshot = { ...s, v2: { ...s.v2, chronicity: [{ ...s.v2.chronicity[0], spanTier: f.tier === 'firm' ? 'standard' : 'firm' }] } }
  assert.equal(r11ConditionsOf(lent, f).tierFromSpan, false)
  assert.equal(bandMembersOf(lent).leadFlag, null)
})

Deno.test('R-11 condition 5 — any other flag on the sign keeps the flag in the band', () => {
  const s = steady()
  const f = itchFlag(s)
  const others: SafetyFlag[] = [
    { kind: 'symptom_burden', symptomType: 'itch', count: 9, days: 5, runDays: 3, windowDays: 7, tier: 'standard' as never },
    { kind: 'symptom_worsening', symptomType: 'itch', currentCount: 5, priorCount: 1, currentDays: 5, priorDays: 1, trigger: 'delta' as never, tier: 'standard' as never, windowDays: 7 },
  ]
  for (const o of others) {
    const t = withFlags(s, [f, o])
    assert.equal(r11ConditionsOf(t, f).onlyFlagOnSign, false, o.kind)
    const m = bandMembersOf(t)
    assert.equal(m.leadFlag, null, o.kind)
    assert.deepEqual(m.band, [f, o], `${o.kind}: both print in the band`)
  }
})

Deno.test('R-11 — an exempt flag that cannot lead stays in the band; a flag with no sign does not block it', () => {
  const s = steady()
  const f = itchFlag(s)
  // A vomiting chronicity flag outranks itch at §4 step 1: exempting itch would print it nowhere.
  const vomit: SafetyFlag = { ...f, symptomType: 'vomit' }
  const t1 = withFlags(s, [vomit, f])
  assert.equal(r11Holds(r11ConditionsOf(t1, f)), true, 'all five conditions hold')
  assert.equal(bandMembersOf(t1).leadFlag, null, 'yet the flag stays in the band')
  assert.deepEqual(bandMembersOf(t1).band, [vomit, f])
  assert.equal(leadSignOf(t1)?.sign, 'vomit')
  // A weight flag names no lead-eligible sign, so itch still leads and the weight flag is the band.
  const w = weightLoss()
  const t2 = withFlags(s, [w, f])
  assert.equal(bandMembersOf(t2).leadFlag, f)
  assert.deepEqual(bandMembersOf(t2).band, [w])
})

Deno.test('band — two flags of one kind are two items, the caveat on the leading one', () => {
  const s = steady()
  const f = itchFlag(s)
  const vomit: Chronicity = { ...f, symptomType: 'vomit', coughVomitAdjacent: true }
  const cough: Chronicity = { ...f, symptomType: 'cough' }
  const t = { ...withFlags(s, [vomit, cough]), trial: null }
  assert.deepEqual(bandMembersOf(t).band, [vomit, cough])
})

Deno.test('band — every v1 flag is a member, in the snapshot’s order, on every sample', () => {
  for (const [name, i] of sampleCases()) {
    const s = snap(i)
    const m = bandMembersOf(s)
    const printed = m.leadFlag ? [...m.band, m.leadFlag] : m.band
    assert.equal(printed.length, s.safetyFlags.length, `${name}: no flag is lost (superset)`)
    assert.deepEqual(m.band, s.safetyFlags.filter((x) => x !== m.leadFlag), `${name}: order kept`)
  }
})

// ── The lead (§4) ───────────────────────────────────────────────────────────

Deno.test('lead — the ladder: band flag, trial sign, rising, most days', () => {
  const s = steady()
  // Step 1: a band flag leads.
  assert.equal(leadSignOf(s)?.reason, 'flag')
  // Step 2: no flag, a skin trial: the skin sign with entries leads, over vomiting with more days.
  const noFlags = withFlags(s, [])
  const withVomit: ReportSnapshot = {
    ...noFlags,
    symptoms: [...noFlags.symptoms, { ...noFlags.symptoms[0], type: 'vomit', count: 20, symptomDays: 20 }],
  }
  assert.deepEqual(leadSignOf(withVomit), { sign: 'itch', reason: 'trial_sign', line: LEAD_REASON_LINE.trial_sign })
  // Step 3: no trial, a rise the engine measured below the card floor.
  const noTrial: ReportSnapshot = {
    ...withVomit,
    trial: null,
    safetyChecks: [{ kind: 'worsening', symptomType: 'itch', windowDays: 7, state: 'below_card_floor', minEpisodes: 2, currentLoggingDays: 7, priorLoggingDays: 7, minLoggingDays: 3 } as never],
  }
  assert.deepEqual(leadSignOf(noTrial), { sign: 'itch', reason: 'rising', line: LEAD_REASON_LINE.rising })
  // Step 4: nothing else, the most days with an entry.
  const plain: ReportSnapshot = { ...noTrial, safetyChecks: [] }
  assert.deepEqual(leadSignOf(plain), { sign: 'vomit', reason: 'most_days', line: LEAD_REASON_LINE.most_days })
})

Deno.test('lead — ties go to GI, then intake; a band flag with no sign falls through; nothing logged leads nothing', () => {
  const s = withFlags({ ...steady(), trial: null }, [])
  const tie: ReportSnapshot = {
    ...s,
    symptoms: [
      { ...s.symptoms[0], type: 'itch', count: 4, symptomDays: 4 },
      { ...s.symptoms[0], type: 'cough', count: 4, symptomDays: 4 },
      { ...s.symptoms[0], type: 'diarrhea', count: 4, symptomDays: 4 },
    ],
  }
  assert.equal(leadSignOf(tie)?.sign, 'diarrhea')
  const intakeTie: ReportSnapshot = { ...tie, symptoms: tie.symptoms.filter((x) => x.type !== 'diarrhea'), v2: { ...tie.v2, mealNotFinishedDays: 4 } }
  assert.equal(leadSignOf(intakeTie)?.sign, 'intake')
  const weightOnly = withFlags(tie, [weightLoss()])
  assert.equal(leadSignOf(weightOnly)?.reason, 'most_days', 'a weight flag never leads the chart')
  const empty: ReportSnapshot = { ...s, symptoms: [], v2: { ...s.v2, mealNotFinishedDays: 0 } }
  assert.equal(leadSignOf(empty), null)
})

Deno.test('lead — Noticed looks never lead; intake leads Olive’s zero-sign sheet by its unfinished days', () => {
  const s = snap(olive())
  assert.deepEqual(leadSignOf(s), { sign: 'intake', reason: 'most_days', line: LEAD_REASON_LINE.most_days })
  const noMeals = snap(olive({ unfinishedDays: 0 }))
  assert.equal(leadSignOf(noMeals), null, 'six days of "sleeping more" never make a look the lead')
})

// ── The thin record (ruling T) ──────────────────────────────────────────────

Deno.test('thin record — Juniper, four days: one scope line naming what could not run, never a result', () => {
  const s = snap(juniper())
  const t = thinRecordLineOf(s)
  assert.deepEqual(t, { reason: 'few_days', loggedDays: 4, windowDays: s.atAGlance.windowDays, text: '4 days logged: too few for the checks that compare weeks.' })
  assert.ok(!/flag|trigger|clear|normal|no sign/i.test(t!.text), 'nothing that reads as a result')
})

Deno.test('thin record — the 14-day constant is the boundary, both sides', () => {
  assert.equal(THIN_RECORD_DAYS, 14)
  const s = steady()
  const at13 = { ...s, atAGlance: { ...s.atAGlance, loggedDays: THIN_RECORD_DAYS - 1 } }
  const at14 = { ...s, atAGlance: { ...s.atAGlance, loggedDays: THIN_RECORD_DAYS } }
  assert.equal(thinRecordLineOf(at13)?.text, '13 days logged: too few for the checks that compare weeks.')
  assert.equal(thinRecordLineOf(at14), null)
  assert.equal(thinRecordLineOf({ ...s, atAGlance: { ...s.atAGlance, loggedDays: 1 } })?.text, '1 day logged: too few for the checks that compare weeks.')
  assert.equal(thinRecordLineOf({ ...s, atAGlance: { ...s.atAGlance, loggedDays: 0 } })?.text, 'No days logged: too few for the checks that compare weeks.')
})

// ── The record edge (§5.3) ──────────────────────────────────────────────────

Deno.test('record edge — Mira: the record ends 13 days before the report', () => {
  const s = snap(sample('trial-report-refused.html'))
  const lines = recordEdgeLinesOf(s)
  assert.deepEqual(lines.map((l) => l.text), ['Record ends Jun 19, 13 days before this report.'])
})

Deno.test('record edge — Juniper: the record begins 3 days before the report', () => {
  assert.deepEqual(recordEdgeLinesOf(snap(juniper())).map((l) => l.text), ['Record begins Oct 13, 3 days before this report.'])
})

Deno.test('record edge — the boundaries: ends at 2 days, begins under 14, today reads "the day of"', () => {
  const s = steady()
  const edge = (lastDays: number, first: string) => ({
    ...s,
    atAGlance: { ...s.atAGlance, recordEdge: { ...s.atAGlance.recordEdge, lastEntryDate: dayKey(lastDays), lastEntryDaysBeforeReport: lastDays } },
    v2: { ...s.v2, firstEntryDate: first },
  })
  assert.deepEqual(recordEdgeLinesOf(edge(1, dayKey(60))), [], 'one day of silence is today not yet logged')
  assert.equal(recordEdgeLinesOf(edge(2, dayKey(60)))[0].text, 'Record ends Oct 14, 2 days before this report.')
  assert.equal(RECORD_BEGINS_MAX_DAYS, 14)
  assert.deepEqual(recordEdgeLinesOf(edge(0, dayKey(14))), [])
  assert.equal(recordEdgeLinesOf(edge(0, dayKey(13)))[0].text, 'Record begins Oct 3, 13 days before this report.')
  assert.equal(recordEdgeLinesOf(edge(0, dayKey(0)))[0].text, 'Record begins Oct 16, the day of this report.')
  assert.deepEqual(recordEdgeLinesOf(edge(3, dayKey(10))).map((l) => l.kind), ['ends', 'begins'], 'both print, the end first')
})

// ── Gap lines (R-5b) ────────────────────────────────────────────────────────

Deno.test('gap lines — a weight flag over an old weigh-in asks for a newer weight (the live Nyx render)', () => {
  const s = steady()
  const old = { ...withFlags(s, [weightLoss()]), signalment: { ...s.signalment, latestWeight: { kg: 27, lbs: 59.5, date: dayKey(45) } } }
  assert.deepEqual(gapLinesOf(old).map((g) => [g.id, g.text]), [['weight_after', 'A weight after Sep 1']])
  const fresh = { ...old, signalment: { ...old.signalment, latestWeight: { kg: 27, lbs: 59.5, date: dayKey(GAP_WEIGHT_STALE_DAYS - 1) } } }
  assert.deepEqual(gapLinesOf(fresh), [], 'a recent weigh-in asks for nothing')
  const atFloor = { ...old, signalment: { ...old.signalment, latestWeight: { kg: 27, lbs: 59.5, date: dayKey(GAP_WEIGHT_STALE_DAYS) } } }
  assert.deepEqual(gapLinesOf(atFloor).map((g) => g.id), ['weight_after'], 'two weeks old asks for a newer one')
  const noFlag = { ...old, safetyFlags: [] }
  assert.deepEqual(gapLinesOf(noFlag), [], 'no weight flag, no weight line')
  const lastYear = { ...old, signalment: { ...old.signalment, latestWeight: { kg: 27, lbs: 59.5, date: '2025-12-20' } } }
  assert.equal(gapLinesOf(lastYear)[0].text, 'A weight after Dec 20, 2025', 'a date outside the year names it')
})

Deno.test('gap lines — the shared bowl and the unrated meals, from a real assembly', () => {
  const base = itchingSkinTrial({ jump: false })
  const events = base.events.map((e) => (e.meal && Date.parse(e.occurredAt) > Date.parse(at(10, 23)) ? { ...e, meal: { ...e.meal, intakeRating: null } } : e))
  const s = snap({ ...base, events })
  assert.equal(s.v2.loggedMeals - s.v2.ratedMeals, 10)
  assert.deepEqual(gapLinesOf(s).map((g) => g.text), ['How much was eaten at 10 of 56 logged meals'])
  const shared = { ...s, diet: { ...s.diet, freeFed: [{ foodLabel: 'Kibble', primaryProtein: null, activeFrom: null, activeUntil: null, proteinSet: null as never, isShared: true }] } }
  assert.deepEqual(gapLinesOf(shared).map((g) => g.id), ['shared_bowl', 'meals_unrated'], 'intake lines in order')
  const unshared = { ...s, diet: { ...s.diet, freeFed: [{ ...shared.diet.freeFed[0], isShared: false }] } }
  assert.deepEqual(gapLinesOf(unshared).map((g) => g.id), ['meals_unrated'], 'a bowl only this pet eats from asks nothing here')
})

Deno.test('gap lines — doses not logged, keyed to the empty days: one logged dose never removes the line', () => {
  const s = steady()
  const course = (over: Record<string, unknown>) => ({
    regimenId: 'r1',
    drugName: 'Apoquel',
    isSupplement: false,
    overlapsWindow: true,
    courseDays: { given: 0, loggedNotGiven: 0, nothingLogged: 46, outsideCourseGiven: 0, outsideCourseNotGiven: 0, outsideCourseGivenDays: [], outsideCourseNotGivenDays: [] },
    ...over,
  }) as never
  const none = { ...s, medications: [course({})] }
  assert.deepEqual(gapLinesOf(none).map((g) => g.text), ['Doses of Apoquel on 46 of 46 days not logged'])
  const oneDose = { ...s, medications: [course({ courseDays: { ...(course({}) as { courseDays: object }).courseDays, given: 1, nothingLogged: 45 } })] }
  assert.deepEqual(gapLinesOf(oneDose).map((g) => g.text), ['Doses of Apoquel on 45 of 46 days not logged'])
  const all = { ...s, medications: [course({ courseDays: { ...(course({}) as { courseDays: object }).courseDays, given: 46, nothingLogged: 0 } })] }
  assert.deepEqual(gapLinesOf(all), [], 'every day logged: no line')
  const outside = { ...s, medications: [course({ overlapsWindow: false })] }
  assert.deepEqual(gapLinesOf(outside), [], 'a course outside the window: no line')
})

Deno.test('gap lines — at most 3, safety then intake then coverage, a printed fact never restated', () => {
  const s = steady()
  const many = {
    ...withFlags(s, [weightLoss()]),
    signalment: { ...s.signalment, latestWeight: { kg: 27, lbs: 59.5, date: dayKey(45) } },
    diet: { ...s.diet, freeFed: [{ foodLabel: null, primaryProtein: null, activeFrom: null, activeUntil: null, proteinSet: null as never, isShared: true }] },
    v2: { ...s.v2, loggedMeals: 56, ratedMeals: 40 },
    medications: [{ regimenId: 'r1', drugName: 'Apoquel', isSupplement: false, overlapsWindow: true, courseDays: { given: 30, loggedNotGiven: 0, nothingLogged: 12, outsideCourseGiven: 0, outsideCourseNotGiven: 0, outsideCourseGivenDays: [], outsideCourseNotGivenDays: [] } }] as never,
  }
  const lines = gapLinesOf(many)
  assert.equal(GAP_LINE_MAX, 3)
  assert.deepEqual(lines.map((g) => g.id), ['weight_after', 'shared_bowl', 'meals_unrated'])
  const printed = gapLinesOf(many, new Set(['weight.latest', 'diet.freeFed.shared']))
  assert.deepEqual(printed.map((g) => g.id), ['meals_unrated', 'doses_not_logged'], 'printed facts drop and the next lines rise')
  for (const g of gapLinesOf(many, new Set())) {
    assert.ok(!/^Unknown:/.test(g.text) && !/\b(you|owner) (did not|didn’t|forgot)/i.test(g.text), 'a measurement, never an owner act')
  }
})

// ── Changes in this window (CUL-2323 ruling (a)) ────────────────────────────

Deno.test('changes — Olive: 11, "sleeping more" on 6 days, 3 meals not finished, weighed 45 days ago: the line prints', () => {
  const s = snap(olive())
  assert.equal(s.symptoms.every((x) => x.count === 0), true, 'a zero-sign sheet')
  assert.deepEqual(changesInWindowOf(s), [
    { id: 'noticed_concern', text: 'Marked sleeping more on 6 of 42 days answered' },
    { id: 'meals_not_finished', text: 'Meals not finished on 3 days (3 of 42 rated meals)' },
    { id: 'weight_stale_senior', text: 'No weight since Sep 1, 45 days before this report' },
  ])
  assert.equal(bandMembersOf(s).band.length, 0, 'never a band member')
  for (const c of changesInWindowOf(s)!) assert.ok(!/flag/i.test(c.text), 'never called a flag')
})

Deno.test('changes — each catalogue entry fires at its threshold and not one under it', () => {
  assert.equal(CHANGES_NOTICED_MIN_DAYS, 3)
  assert.equal(CHANGES_MEALS_NOT_FINISHED_MIN_DAYS, 3)
  assert.equal(CHANGES_WEIGHT_STALE_DAYS, 30)
  const ids = (i: ReportInput) => (changesInWindowOf(snap(i)) ?? []).map((c) => c.id)
  // Noticed: 3 days fires, 2 does not.
  assert.ok(ids(olive({ sleepingDays: 3, unfinishedDays: 0, weighedDaysAgo: 1 })).includes('noticed_concern'))
  assert.deepEqual(ids(olive({ sleepingDays: 2, unfinishedDays: 0, weighedDaysAgo: 1 })), [])
  // Meals: 3 days fires, 2 does not.
  assert.deepEqual(ids(olive({ sleepingDays: 0, unfinishedDays: 3, weighedDaysAgo: 1 })), ['meals_not_finished'])
  assert.deepEqual(ids(olive({ sleepingDays: 0, unfinishedDays: 2, weighedDaysAgo: 1 })), [])
  // Weight: 30 days fires, 29 does not; none on record fires; a pet of 10 years exactly does not.
  assert.deepEqual(ids(olive({ sleepingDays: 0, unfinishedDays: 0, weighedDaysAgo: 30 })), ['weight_stale_senior'])
  assert.deepEqual(ids(olive({ sleepingDays: 0, unfinishedDays: 0, weighedDaysAgo: 29 })), [])
  assert.deepEqual(ids(olive({ sleepingDays: 0, unfinishedDays: 0, weighedDaysAgo: null })), ['weight_stale_senior'])
  assert.deepEqual(ids(olive({ sleepingDays: 0, unfinishedDays: 0, weighedDaysAgo: 45, dateOfBirth: '2016-10-16' })), [], 'ten years exactly is not over ten')
  assert.deepEqual(ids(olive({ sleepingDays: 0, unfinishedDays: 0, weighedDaysAgo: 45, dateOfBirth: '2016-04-16' })), ['weight_stale_senior'], 'ten and a half is')
})

Deno.test('changes — one sneeze never erases the lines; the zero-sign scope is the render’s, via isZeroSignSheet', () => {
  const i = olive()
  const withSneeze = snap({ ...i, events: [...i.events, symptom('sneeze', 5)] })
  assert.equal(isZeroSignSheet(withSneeze), false, 'the sheet is no longer zero-sign')
  assert.deepEqual((changesInWindowOf(withSneeze) ?? []).map((c) => c.id), ['noticed_concern', 'meals_not_finished', 'weight_stale_senior'], 'the predicate still answers')
  assert.equal(isZeroSignSheet(snap(i)), true)
  assert.equal(changesInWindowOf(snap(olive({ sleepingDays: 0, unfinishedDays: 0, weighedDaysAgo: 1 }))), null)
  const young = baseInput({ events: [...dailyMeals(30, 0), meal(2, 'some')] })
  assert.equal(changesInWindowOf(snap(young)), null)
})

// ── Adversarial pass 1: each finding, reproduced end to end ─────────────────

Deno.test('pass 1, findings 1 and 2 — Cooper as an owner logs him (weekly counts wobbling) keeps the flag in the band', () => {
  const s = snap(wobblingSkinTrial())
  const f = itchFlag(s)
  assert.equal(s.v2.chronicity.find((c) => c.symptomType === 'itch')?.worsening, 'rising')
  assert.equal(bandMembersOf(s).leadFlag, null)
  assert.deepEqual(bandMembersOf(s).band, [f])
})

Deno.test('pass 1, finding 3 — a 14-day window over a 52-day vomiting course prints the scope line', () => {
  const events = [...dailyMeals(55, 0)]
  for (let d = 52; d >= 1; d -= 3) events.push(symptom('vomit', d))
  const s = snap(baseInput({ events, requestedWindow: { startDate: dayKey(13), endDate: dayKey(0) } }))
  assert.equal(s.atAGlance.loggedDays, 14, 'every window day is logged, so the day count alone says nothing')
  assert.ok(s.safetyChecks.some((c) => c.kind === 'ongoing' && c.state === 'window_short'))
  assert.deepEqual(thinRecordLineOf(s), { reason: 'short_window', loggedDays: 14, windowDays: 14, text: 'A 14-day window: too short for the checks that compare weeks.' })
})

Deno.test('pass 1, finding 3 — 17 days logged at two a week over eight weeks prints the scope line', () => {
  // The reviewer's probe D2: meals two days a week, three recent vomits; both checks too_few_days.
  const events = []
  for (let w = 0; w < 8; w++) events.push(meal(w * 7 + 1, 'all'), meal(w * 7 + 4, 'all'))
  events.push(meal(0, 'all'), symptom('vomit', 1, 9), symptom('vomit', 4, 9), symptom('vomit', 4, 15))
  const s = snap(baseInput({ events }))
  assert.equal(s.safetyFlags.length, 0, 'no flag: without this line the band slot is empty')
  assert.ok(s.atAGlance.loggedDays >= THIN_RECORD_DAYS, `logged ${s.atAGlance.loggedDays} days`)
  const t = thinRecordLineOf(s)
  assert.equal(t?.reason, 'sparse_days')
  assert.equal(t?.text, `${s.atAGlance.loggedDays} of ${s.atAGlance.windowDays} days logged: too few for the checks that compare weeks.`)
})

Deno.test('pass 1, finding 4 — one zero-sign definition: Olive is zero-sign though intake leads her sheet', () => {
  const s = snap(olive())
  assert.equal(isZeroSignSheet(s), true)
  assert.equal(leadSignOf(s)?.sign, 'intake', 'leadSignOf is not the zero-sign test')
  assert.ok(changesInWindowOf(s))
})

Deno.test('pass 1, finding 5 — a meal whose child row has not synced counts as an unrated meal', () => {
  const base = itchingSkinTrial({ jump: false })
  const unsynced = { ...meal(2, null), meal: null }
  const s = snap({ ...base, events: [...base.events, unsynced] })
  assert.equal(s.v2.loggedMeals, 57)
  assert.equal(s.v2.ratedMeals, 56)
  assert.deepEqual(gapLinesOf(s).map((g) => g.text), ['How much was eaten at 1 of 57 logged meals'])
})

// ── Adversarial pass 2: each finding, reproduced end to end ─────────────────

Deno.test('pass 2, finding A — a rise across a logging gap is never read as steady', () => {
  // Itch twice a week, a 13-day holiday with nothing logged, five entries within 32 hours of return,
  // the same five a week later. Today compares 5 with 5; every day that could have seen the jump
  // against what came before is dark.
  const D = 86_400_000
  const H = 3_600_000
  const now = Date.parse(V2_NOW)
  const events = [...dailyMeals(55, 28), ...dailyMeals(14, 0)]
  for (const ms of steadyInstants(52, 28)) events.push(symptomAt('itch', ms))
  for (const h of [1, 6, 12, 26, 32]) {
    events.push(symptomAt('itch', now - 14 * D + h * H), symptomAt('itch', now - 7 * D + h * H))
  }
  const s = snap(baseInput({ events, dietTrials: [skinTrial('skin')] }))
  const fact = s.v2.chronicity.find((c) => c.symptomType === 'itch')
  assert.ok(fact, 'the course fires')
  assert.notEqual(fact.worsening, 'not_rising')
  assert.equal(bandMembersOf(s).leadFlag, null, 'the flag stays in the band')
})

Deno.test('pass 2, finding B — a sparse record with no symptom entry still prints the scope line', () => {
  const events = []
  for (let w = 0; w < 8; w++) events.push(meal(w * 7 + 1, 'all'), meal(w * 7 + 4, 'all'))
  events.push(meal(0, 'all'))
  const s = snap(baseInput({ events }))
  assert.equal(s.safetyChecks.length, 0, 'no per-sign check exists to say so')
  assert.equal(s.atAGlance.loggedDays, 17)
  assert.equal(thinRecordLineOf(s)?.reason, 'sparse_days')
  // The same with only signs outside the engine's lanes.
  const lethargy = snap(baseInput({ events: [...events, symptom('lethargy', 1), symptom('lethargy', 4), symptom('sneeze', 8)] }))
  assert.equal(thinRecordLineOf(lethargy)?.reason, 'sparse_days')
})

Deno.test('pass 2, finding B — a 20-day window with no symptom entry prints the scope line', () => {
  const s = snap(baseInput({ events: dailyMeals(19, 0), requestedWindow: { startDate: dayKey(19), endDate: dayKey(0) } }))
  assert.equal(s.atAGlance.loggedDays, 20)
  assert.deepEqual(thinRecordLineOf(s), { reason: 'short_window', loggedDays: 20, windowDays: 20, text: 'A 20-day window: too short for the checks that compare weeks.' })
  // A dense 56-day record with no symptom entry prints nothing: the checks could run.
  assert.equal(thinRecordLineOf(snap(baseInput({ events: dailyMeals(55, 0) }))), null)
})
