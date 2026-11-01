// The composer's outline (VR2-16, CUL-2296).
// Run with:  deno test --allow-read=supabase/functions supabase/functions/generate-report/composer.test.ts
//
// Every snapshot comes out of `assembleReport` over a record production could hold (C-35), so a
// count asserted here is the report's own count.
import assert from 'node:assert/strict'
import { assembleReport, type ReportInput, type ReportSnapshot } from './report.ts'
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
import { baseInput, dayKey, skinTrial, symptom } from './v2Fixtures.testutil.ts'

const snap = (i: ReportInput): ReportSnapshot => assembleReport(i)
const TODAY = dayKey(0)
const visit = (daysAgo: number) => ({ visitedAt: dayKey(daysAgo), clinicName: null, vetName: null, reason: null })

// ── The windows offered ──────────────────────────────────────────────────────

Deno.test('windows: a visit, a running trial and an older record offer all three, the visit first', () => {
  const w = composerWindowsOf({
    today: TODAY,
    timezone: 'UTC',
    vetVisits: [visit(45), visit(120)],
    dietTrials: [skinTrial()],
    firstEntryDate: dayKey(200),
  })
  assert.deepEqual(w.map((x) => x.kind), ['since_visit', 'diet_trial', 'last_30'])
  assert.deepEqual(w[0], { kind: 'since_visit', startDate: dayKey(45), endDate: TODAY, days: 46 })
  assert.deepEqual(w[1], { kind: 'diet_trial', startDate: dayKey(60), endDate: TODAY, days: 61 })
  assert.deepEqual(w[2], { kind: 'last_30', startDate: dayKey(LAST_DAYS - 1), endDate: TODAY, days: LAST_DAYS })
})

Deno.test('windows: a visit dated today is not "the last visit" (the §6 cascade reads strictly before today)', () => {
  const w = composerWindowsOf({ today: TODAY, timezone: 'UTC', vetVisits: [visit(0)], dietTrials: [], firstEntryDate: dayKey(90) })
  assert.deepEqual(w.map((x) => x.kind), ['last_30'])
})

Deno.test('windows: an ended trial runs to its end, not to today', () => {
  const ended = { ...skinTrial(), status: 'completed', endedAt: `${dayKey(12)}T15:00:00Z` }
  const w = composerWindowsOf({ today: TODAY, timezone: 'UTC', vetVisits: [], dietTrials: [ended], firstEntryDate: dayKey(90) })
  assert.deepEqual(w[0], { kind: 'diet_trial', startDate: dayKey(60), endDate: dayKey(12), days: 49 })
})

Deno.test('windows: a record that began inside the last 30 days offers "since the first entry" instead', () => {
  const w = composerWindowsOf({ today: TODAY, timezone: 'UTC', vetVisits: [], dietTrials: [], firstEntryDate: dayKey(3) })
  assert.deepEqual(w, [{ kind: 'since_first', startDate: dayKey(3), endDate: TODAY, days: 4 }])
  // The boundary is the shipped constant: a record exactly LAST_DAYS long gets the rolling window.
  const edge = composerWindowsOf({ today: TODAY, timezone: 'UTC', vetVisits: [], dietTrials: [], firstEntryDate: dayKey(LAST_DAYS - 1) })
  assert.deepEqual(edge.map((x) => x.kind), ['last_30'])
})

Deno.test('windows: an empty record still offers the last 30 days', () => {
  const w = composerWindowsOf({ today: TODAY, timezone: 'UTC', vetVisits: [], dietTrials: [], firstEntryDate: null })
  assert.deepEqual(w.map((x) => x.kind), ['last_30'])
})

Deno.test('windows: a window identical to an earlier one is offered once', () => {
  const w = composerWindowsOf({ today: TODAY, timezone: 'UTC', vetVisits: [visit(LAST_DAYS - 1)], dietTrials: [], firstEntryDate: dayKey(90) })
  assert.deepEqual(w.map((x) => x.kind), ['since_visit'])
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
})

Deno.test('counts: the days after a window partition the record with the window (C-4)', () => {
  const events = [symptom('vomit', 1), symptom('vomit', 3), symptom('cough', 4), symptom('vomit', 15), symptom('sneeze', 30)]
  const whole = snap(baseInput({ requestedWindow: { startDate: dayKey(40), endDate: TODAY }, events }))
  const inWindow = snap(baseInput({ requestedWindow: { startDate: dayKey(40), endDate: dayKey(10) }, events }))
  const after = snap(baseInput({ requestedWindow: { startDate: dayKey(9), endDate: TODAY }, events }))
  const a = afterOf(after)
  assert.equal(countsOf(inWindow).symptomEntries + a.symptomEntries, countsOf(whole).symptomEntries)
  assert.deepEqual(a.byType, [{ type: 'vomit', count: 2 }, { type: 'cough', count: 1 }])
  assert.equal(a.symptomEntries, 3)
})

// ── The live-flag set ────────────────────────────────────────────────────────

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

Deno.test('live: a window that ends before the flag still leaves the flag on the card', () => {
  // The owner picks dates that stop before the bad week. The window's own snapshot has no flag;
  // the 56-day set the card reads still does (b4: "The flags above still print").
  const events = [...flaggedRecord(), symptom('vomit', 40)]
  const cropped = snap(baseInput({ requestedWindow: { startDate: dayKey(50), endDate: dayKey(20) }, events }))
  assert.equal(cropped.safetyFlags.length, 0)
  const live = liveOf(snap(baseInput({ requestedWindow: liveWindowOf(TODAY), events })))
  assert.equal(live.state, 'flags')
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
