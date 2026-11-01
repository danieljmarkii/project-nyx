// The composer's outline (VR2-16, CUL-2296).
// Run with:  deno test --allow-read=supabase/functions supabase/functions/generate-report/composer.test.ts
//
// Every snapshot comes out of `assembleReport` over a record production could hold (C-35), so a
// count asserted here is the report's own count, and every default window is the one `resolveScope`
// itself resolves.
import assert from 'node:assert/strict'
import { assembleReport, resolveScope, type ReportInput, type ReportSnapshot } from './report.ts'
import {
  addDays,
  afterOf,
  composerWindowsOf,
  countsOf,
  daysInclusive,
  LAST_DAYS,
  LIVE_FLAG_DAYS,
  liveOf,
  liveWindowOf,
  localDayOf,
  parseComposerRequest,
  validWindow,
} from './composer.ts'
import { baseInput, dayKey, meal, skinTrial, symptom, V2_NOW } from './v2Fixtures.testutil.ts'

const snap = (i: ReportInput): ReportSnapshot => assembleReport(i)
const TODAY = dayKey(0)
const visit = (daysAgo: number) => ({ visitedAt: dayKey(daysAgo), clinicName: null, vetName: null, reason: null })

type WindowsIn = Omit<Parameters<typeof composerWindowsOf>[0], 'defaultScope'>
/** The composer's windows with the cascade resolved exactly as the shell resolves it. */
const windowsOf = (i: WindowsIn) =>
  composerWindowsOf({
    ...i,
    defaultScope: resolveScope({
      now: V2_NOW,
      timezone: i.timezone,
      requestedWindow: null,
      dietTrials: [...i.dietTrials],
      vetVisits: [...i.vetVisits],
    }),
  })
const kinds = (ws: ReturnType<typeof windowsOf>) => ws.map((w) => `${w.kind}${w.isDefault ? '*' : ''}`)

// ── The windows offered ──────────────────────────────────────────────────────

Deno.test('windows: the cascade’s own window leads, marked default; a visit, a trial and the last 30 days follow', () => {
  const w = windowsOf({ today: TODAY, timezone: 'UTC', vetVisits: [visit(45), visit(120)], dietTrials: [skinTrial()], firstEntryDate: dayKey(200) })
  // Rung 1 is the visit: the default IS "since the last visit", offered once.
  assert.deepEqual(kinds(w), ['since_visit*', 'diet_trial', 'last_30'])
  assert.deepEqual(w[0], { kind: 'since_visit', startDate: dayKey(45), endDate: TODAY, days: 46, isDefault: true })
  assert.deepEqual(w[1], { kind: 'diet_trial', startDate: dayKey(60), endDate: TODAY, days: 61, isDefault: false })
  assert.deepEqual(w[2], { kind: 'last_30', startDate: dayKey(LAST_DAYS - 1), endDate: TODAY, days: LAST_DAYS, isDefault: false })
})

Deno.test('windows: no visit and no trial → the cascade’s 90 days lead (no regression from the pre-composer default, F2)', () => {
  const w = windowsOf({ today: TODAY, timezone: 'UTC', vetVisits: [], dietTrials: [], firstEntryDate: dayKey(200) })
  assert.deepEqual(kinds(w), ['last_90*', 'last_30'])
  assert.equal(w[0].days, 90)
})

Deno.test('windows: a trial started today is offered as the cascade floors it, not as a one-day window (B-423, F6)', () => {
  const today = { ...skinTrial(), startedAt: TODAY }
  const w = windowsOf({ today: TODAY, timezone: 'UTC', vetVisits: [], dietTrials: [today], firstEntryDate: dayKey(200) })
  assert.equal(w[0].kind, 'diet_trial')
  assert.equal(w[0].isDefault, true)
  assert.ok(w[0].days > 1, `the default trial window is floored, got ${w[0].days} days`)
})

Deno.test('windows: the running trial outranks a later-started abandoned one (B-613’s input, F6)', () => {
  const running = { ...skinTrial(), id: 'run', startedAt: dayKey(120) }
  const abandoned = { ...skinTrial(), id: 'ab', startedAt: dayKey(40), status: 'abandoned', endedAt: `${dayKey(32)}T12:00:00Z` }
  const w = windowsOf({ today: TODAY, timezone: 'UTC', vetVisits: [visit(10)], dietTrials: [abandoned, running], firstEntryDate: dayKey(200) })
  const trial = w.find((x) => x.kind === 'diet_trial')
  assert.equal(trial?.startDate, dayKey(120))
  assert.equal(trial?.endDate, TODAY)
})

Deno.test('windows: a visit dated today is not "the last visit" (the cascade reads strictly before today)', () => {
  const w = windowsOf({ today: TODAY, timezone: 'UTC', vetVisits: [visit(0)], dietTrials: [], firstEntryDate: dayKey(200) })
  assert.ok(!w.some((x) => x.kind === 'since_visit'))
})

Deno.test('windows: an ended trial runs to its end, not to today', () => {
  const ended = { ...skinTrial(), status: 'completed', endedAt: `${dayKey(12)}T15:00:00Z` }
  const w = windowsOf({ today: TODAY, timezone: 'UTC', vetVisits: [visit(5)], dietTrials: [ended], firstEntryDate: dayKey(200) })
  assert.deepEqual(w.find((x) => x.kind === 'diet_trial'), { kind: 'diet_trial', startDate: dayKey(60), endDate: dayKey(12), days: 49, isDefault: false })
})

Deno.test('windows: a record that began inside the last 30 days also offers "since the first entry"', () => {
  const w = windowsOf({ today: TODAY, timezone: 'UTC', vetVisits: [], dietTrials: [], firstEntryDate: dayKey(3) })
  assert.deepEqual(kinds(w), ['last_90*', 'since_first'])
  assert.deepEqual(w[1], { kind: 'since_first', startDate: dayKey(3), endDate: TODAY, days: 4, isDefault: false })
  // The boundary is the shipped constant: a record exactly LAST_DAYS long gets the rolling window.
  const edge = windowsOf({ today: TODAY, timezone: 'UTC', vetVisits: [], dietTrials: [], firstEntryDate: dayKey(LAST_DAYS - 1) })
  assert.deepEqual(kinds(edge), ['last_90*', 'last_30'])
})

Deno.test('windows: a window identical to an earlier one is offered once', () => {
  const w = windowsOf({ today: TODAY, timezone: 'UTC', vetVisits: [visit(LAST_DAYS - 1)], dietTrials: [], firstEntryDate: dayKey(200) })
  assert.deepEqual(kinds(w), ['since_visit*'])
})

// ── Counts ───────────────────────────────────────────────────────────────────

Deno.test('counts: read off the window snapshot, the logged days list agreeing with the count', () => {
  const s = snap(baseInput({
    requestedWindow: { startDate: dayKey(20), endDate: TODAY },
    events: [symptom('vomit', 2), symptom('vomit', 5), symptom('cough', 5), symptom('vomit', 30)],
  }))
  const c = countsOf(s)
  assert.equal(c.symptomEntries, s.atAGlance.totalSymptomIncidents)
  assert.equal(c.symptomEntries, 3)
  assert.equal(c.loggedDays, 2)
  assert.deepEqual(c.loggedDayKeys, [dayKey(5), dayKey(2)])
  assert.equal(c.windowDays, 21)
  assert.equal(c.weighIns, 0)
  assert.equal(c.latestWeighIn, null)
  assert.equal(c.lead?.sign, 'vomit')
  assert.deepEqual(c.flags, [])
})

Deno.test('counts: the days after a window partition the record with the window (C-4)', () => {
  const events = [symptom('vomit', 1), symptom('vomit', 3), symptom('cough', 4), symptom('vomit', 15), symptom('sneeze', 30)]
  const whole = snap(baseInput({ requestedWindow: { startDate: dayKey(40), endDate: TODAY }, events }))
  const inWindow = snap(baseInput({ requestedWindow: { startDate: dayKey(40), endDate: dayKey(10) }, events }))
  const after = snap(baseInput({ requestedWindow: { startDate: dayKey(9), endDate: TODAY }, events }))
  const a = afterOf(after, inWindow)
  assert.equal(countsOf(inWindow).symptomEntries + a.symptomEntries, countsOf(whole).symptomEntries)
  assert.deepEqual(a.byType, [{ type: 'vomit', count: 2 }, { type: 'cough', count: 1 }])
  assert.equal(a.symptomEntries, 3)
  assert.equal(a.incomplete, false)
})

Deno.test('counts: refused meals after the window are named, not only symptoms (F4)', () => {
  const events = [meal(3, 'refused'), meal(2, 'refused'), meal(1, 'refused'), meal(20, 'all')]
  const inWindow = snap(baseInput({ requestedWindow: { startDate: dayKey(40), endDate: dayKey(4) }, events }))
  const after = snap(baseInput({ requestedWindow: { startDate: dayKey(3), endDate: TODAY }, events }))
  const a = afterOf(after, inWindow)
  assert.equal(a.symptomEntries, 0)
  assert.equal(a.mealsRefused, 3)
})

// ── The live-flag set, and what a window's report prints ─────────────────────

/** Six vomits in the last 7 days: the burden flag the round 5 mock leads with. */
const flaggedRecord = () => [0, 1, 2, 2, 4, 6].map((d) => symptom('vomit', d))

Deno.test('live: a flagged record reads as flags, in the snapshot safety order, with its sign', () => {
  const s = snap(baseInput({ requestedWindow: liveWindowOf(TODAY), events: flaggedRecord() }))
  const live = liveOf(s)
  assert.equal(live.state, 'flags')
  assert.ok(live.flags.length > 0)
  assert.deepEqual(live.flags.map((f) => f.kind), s.safetyFlags.map((f) => f.kind))
  assert.ok(live.flags.some((f) => f.sign === 'vomit'))
})

Deno.test('a window that ends before the flag: the card keeps it, and the window’s own flags show it is not printed (F1)', () => {
  const events = [...flaggedRecord(), symptom('vomit', 40)]
  const cropped = countsOf(snap(baseInput({ requestedWindow: { startDate: dayKey(50), endDate: dayKey(20) }, events })))
  const live = liveOf(snap(baseInput({ requestedWindow: liveWindowOf(TODAY), events })))
  assert.equal(live.state, 'flags')
  // The composer compares these two lists; a live flag missing from the window's is warned about.
  assert.deepEqual(cropped.flags, [])
  assert.ok(live.flags.length > 0)
})

Deno.test('a window that ends today but is too short to carry a flag: its own flags say so (F2)', () => {
  // Weekly vomits over 44 days: a chronicity flag on the 56-day set, none on a 7-day window.
  const events = [3, 9, 16, 23, 30, 37, 44].map((d) => symptom('vomit', d))
  const live = liveOf(snap(baseInput({ requestedWindow: liveWindowOf(TODAY), events })))
  const short = countsOf(snap(baseInput({ requestedWindow: { startDate: dayKey(6), endDate: TODAY }, events })))
  const liveKinds = live.flags.map((f) => `${f.kind}:${f.sign}`)
  const shortKinds = short.flags.map((f) => `${f.kind}:${f.sign}`)
  assert.ok(liveKinds.some((k) => !shortKinds.includes(k)), `live ${liveKinds} vs window ${shortKinds}`)
})

Deno.test('an intake flag carries its trigger, so the card can say refusing when it was', () => {
  const events = [...[10, 9, 8, 7, 6, 5, 4].map((d) => meal(d, 'all')), meal(1, 'refused'), meal(0, 'refused')]
  const live = liveOf(snap(baseInput({ requestedWindow: liveWindowOf(TODAY), events })))
  for (const f of live.flags) {
    if (f.kind === 'intake_decline') assert.equal(typeof f.trigger, 'string')
    else assert.equal(f.trigger, null)
  }
})

Deno.test('live: a quiet record reads none; a short pull with no flag reads incomplete, never none', () => {
  const quiet = snap(baseInput({ requestedWindow: liveWindowOf(TODAY), events: [symptom('cough', 20)] }))
  assert.equal(liveOf(quiet).state, 'none')
  const short = { ...quiet, incompletePulls: ['events'] }
  assert.equal(liveOf(short).state, 'incomplete')
})

// ── Small parts ──────────────────────────────────────────────────────────────

Deno.test('the live window is LIVE_FLAG_DAYS long and ends today', () => {
  const w = liveWindowOf(TODAY)
  assert.equal(w.endDate, TODAY)
  assert.equal(daysInclusive(w.startDate, w.endDate), LIVE_FLAG_DAYS)
})

Deno.test('day helpers', () => {
  assert.equal(addDays('2026-02-28', 1), '2026-03-01')
  assert.equal(addDays('2026-03-01', -1), '2026-02-28')
  assert.equal(localDayOf('2026-10-16', 'America/Los_Angeles'), '2026-10-16')
  assert.equal(localDayOf('2026-10-16T03:00:00Z', 'America/Los_Angeles'), '2026-10-15')
  assert.equal(localDayOf('2026-10-16T03:00:00Z', null), '2026-10-16')
})

Deno.test('request parsing: only mode "composer" is a composer request; part defaults to open', () => {
  assert.equal(parseComposerRequest({}), null)
  assert.equal(parseComposerRequest({ mode: 'report' }), null)
  assert.deepEqual(parseComposerRequest({ mode: 'composer' }), { part: 'open' })
  assert.deepEqual(parseComposerRequest({ mode: 'composer', part: 'window' }), { part: 'window' })
  assert.equal(validWindow({ startDate: '2026-10-02', endDate: '2026-10-01' }), false)
  assert.equal(validWindow({ startDate: '2026-10-01', endDate: '2026-10-01' }), true)
  assert.equal(validWindow({ startDate: 'Oct 1', endDate: '2026-10-01' }), false)
  assert.equal(validWindow(null), false)
})
