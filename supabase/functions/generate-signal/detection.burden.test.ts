// Engines v3 PR-14d (CUL-1410; CUL-1311 scope 2, the critique's GAP-5): the burden card.
// Run with: deno test --allow-read=supabase/functions supabase/functions/generate-signal/detection.burden.test.ts
//
// The card that needs no earlier week. Its two arms (4+ vomits in 7 days; a vomit on 3+ consecutive
// LOCAL days), its two asks ('today' while the run is still going, 'soon' otherwise), the Home
// pipeline's one-card-per-week rule, and the phrasing screen that holds a model sentence to the
// ask and the numbers. The corpus-level counterexample (with and without a photo) lives in
// _shared/engineCorpus/signalPipeline.corpus.ts; the chance rate on PR-15's null pets in
// _shared/engineCorpus/trajectory/burdenChance.test.ts.

import { strict as assert } from 'node:assert'
import {
  DEFAULT_CONFIG,
  detectBurden,
  detectReflections,
  detectSignals,
  detectWorsening,
  detectChronicity,
  type DetectionConfig,
  type DetectionInput,
  type Finding,
  type IncidentAnalysisInput,
  type MealEvent,
  type SymptomBurdenFinding,
  type SymptomEvent,
  type SymptomType,
} from './detection.ts'
import { suppressWorseningUnderBurden } from './pipeline.ts'
import { templateBurden, templateCarried, validatePhrasing } from './phrasing.ts'

const HOUR = 3_600_000
const DAY = 86_400_000
// Thursday 2026-09-10, 05:00 in Los Angeles (PDT, UTC-7).
const NOW = '2026-09-10T12:00:00.000Z'
const NOW_MS = Date.parse(NOW)
const LA = 'America/Los_Angeles'

let seq = 0
/** An instant `days` before NOW, at `utcHour`:`min` UTC on that day. */
const ago = (days: number, utcHour = 15, min = 0): string => {
  const d = new Date(NOW_MS - days * DAY)
  d.setUTCHours(utcHour, min, 0, 0)
  return d.toISOString()
}
const vomit = (occurredAt: string, over: Partial<SymptomEvent> = {}): SymptomEvent => ({
  id: `v-${++seq}`,
  type: 'vomit',
  occurredAt,
  ...over,
})
const sign = (type: SymptomType, occurredAt: string): SymptomEvent => ({ id: `s-${++seq}`, type, occurredAt })
const meal = (occurredAt: string): MealEvent => ({
  id: `m-${++seq}`,
  occurredAt,
  foodItemId: 'food-1',
  primaryProtein: 'chicken',
  intakeRating: 'all',
  foodType: 'meal',
  foodLabel: 'Acme Chicken',
})
/** A meal at 08:00 LA (15:00 UTC) on each of the last `days` days: a logged, quiet record. */
const mealsDaily = (days: number): MealEvent[] => Array.from({ length: days }, (_, d) => meal(ago(d, 15)))

const input = (symptomEvents: SymptomEvent[], over: Partial<DetectionInput> = {}): DetectionInput => ({
  pet: { name: 'Miso', species: 'cat', dietTrialActive: false },
  symptomEvents,
  mealEvents: mealsDaily(20),
  timezone: LA,
  now: NOW,
  ...over,
})
const only = (i: DetectionInput, config: DetectionConfig = DEFAULT_CONFIG): SymptomBurdenFinding => {
  const out = detectBurden(i, config)
  assert.equal(out.length, 1, `expected one burden card, got ${JSON.stringify(out)}`)
  return out[0]
}
// Monday, Tuesday, Wednesday at 08:00 LA.
const MON_TUE_WED = [3, 2, 1].map((d) => vomit(ago(d, 15)))

// ── The counterexample (GAP-5) ─────────────────────────────────────────────────

Deno.test('GAP-5: a quiet cat vomits Monday, Tuesday and Wednesday, no photos → a safety card that asks for a call today', () => {
  const f = only(input(MON_TUE_WED))
  assert.equal(f.priorityClass, 'safety')
  assert.equal(f.count, 3)
  assert.equal(f.runDays, 3)
  assert.equal(f.countArm, false, 'three is below the count arm: the persistence rung is what fires')
  assert.equal(f.persistenceArm, true)
  assert.equal(f.daysSinceRunEnd, 1)
  assert.equal(f.tier, 'today')
  // And it leads Home's safety band.
  assert.equal(detectSignals(input(MON_TUE_WED))[0].finding.type, 'symptom_burden')
})

Deno.test('GAP-5: the same cat with a clean photo read on every vomit still gets the card', () => {
  const analyses: IncidentAnalysisInput[] = MON_TUE_WED.map((v) => ({
    eventId: v.id,
    incidentType: 'vomit',
    occurredAt: v.occurredAt,
    bloodPresent: 'none_visible',
    stoolBloodPresent: null,
    foreignMaterialPresent: 'no',
  }))
  const withPhotos = input(MON_TUE_WED, { incidentAnalyses: analyses })
  assert.deepEqual(detectBurden(withPhotos), detectBurden(input(MON_TUE_WED)))
  const types = detectSignals(withPhotos).map((r) => r.finding.type)
  assert.ok(types.includes('symptom_burden'))
  assert.ok(!types.includes('incident_red_flag'), 'a clean read raises no red flag of its own')
})

Deno.test('GAP-5: a brand-new account (nothing logged before Monday) gets it too, where ④ is structurally silent', () => {
  const fresh = input(MON_TUE_WED, { mealEvents: [] })
  assert.deepEqual(detectWorsening(fresh), [], '④ needs a logged prior week')
  assert.equal(only(fresh).tier, 'today')
})

// ── 6 then 5: the calm card never shows, and now a safety card does ────────────

Deno.test('6 then 5 a week, not chronic: no reflection card, and the burden card speaks instead', () => {
  // Two vomits a day on alternate days, so no run of three: this week 5 (days 1, 1, 3, 3, 5),
  // last week 6 (days 8, 8, 10, 10, 12, 12). Hours apart enough to be separate logs.
  const events = [
    ...[1, 3].flatMap((d) => [vomit(ago(d, 15)), vomit(ago(d, 20))]),
    vomit(ago(5, 15)),
    ...[8, 10, 12].flatMap((d) => [vomit(ago(d, 15)), vomit(ago(d, 20))]),
  ]
  const i = input(events)
  assert.deepEqual(detectWorsening(i), [], 'not worsening: 5 vomits on 3 days against 6 on 3 days')
  assert.deepEqual(detectChronicity(i), [], 'not chronic (two weeks of history)')
  assert.deepEqual(detectReflections(i), [], 'the valve keeps the calm "down from 6" off')
  const f = only(i)
  assert.equal(f.count, 5)
  assert.equal(f.countArm, true)
  assert.equal(f.persistenceArm, false)
  assert.equal(f.tier, 'soon')
  const types = detectSignals(i).map((r) => r.finding.type)
  assert.deepEqual(types, ['symptom_burden'])
})

// ── The count arm ─────────────────────────────────────────────────────────────

Deno.test('count arm: 3 vomits on separate days is silent, a 4th fires it', () => {
  const three = [1, 3, 5].map((d) => vomit(ago(d, 15)))
  assert.deepEqual(detectBurden(input(three)), [])
  const f = only(input([...three, vomit(ago(6, 15))]))
  assert.equal(f.countArm, true)
  assert.equal(f.count, 4)
})

Deno.test('count arm: a re-log inside 60 s is one vomit; vomits 2.5 h apart are not (the 3h chain does not collapse them)', () => {
  const relogged = [vomit(ago(1, 15)), vomit(ago(1, 15, 0).replace(':00.000Z', ':30.000Z')), vomit(ago(3, 15)), vomit(ago(5, 15))]
  assert.deepEqual(detectBurden(input(relogged)), [], 'four rows, three vomits')
  // Four vomits 2.5 h apart on one day: one 3h episode, four vomits. The count arm counts vomits.
  const t0 = Date.parse(ago(2, 13))
  const drip = [0, 1, 2, 3].map((k) => vomit(new Date(t0 + k * 2.5 * HOUR).toISOString()))
  assert.equal(only(input(drip)).count, 4)
})

Deno.test('count arm: a found pile counts like a witnessed vomit', () => {
  const events = [1, 3, 5].map((d) => vomit(ago(d, 15))).concat(vomit(ago(6, 15), { occurredAtConfidence: 'window' }))
  assert.equal(only(input(events)).count, 4)
})

Deno.test('count arm reads the valve\'s own count: wherever it holds, the reflection lane is silent (vomit)', () => {
  // Property: over random vomit-only records, a burden card's count arm ⇒ no reflection card. The
  // two read one number (SymptomStat.currentLogs) against one knob, so this can never drift.
  let rnd = 0x1410
  const next = () => ((rnd = (rnd * 1103515245 + 12345) >>> 0) / 2 ** 32)
  let armed = 0
  let calm = 0
  for (let trial = 0; trial < 400; trial++) {
    const events: SymptomEvent[] = []
    for (let d = 0; d < 14; d++) {
      const n = next() < 0.3 ? (next() < 0.3 ? 2 : 1) : 0
      for (let k = 0; k < n; k++) events.push(vomit(ago(d, 9 + k * 6)))
    }
    const i = input(events)
    const b = detectBurden(i)[0]
    const r = detectReflections(i)
    if (b?.countArm) {
      armed++
      assert.deepEqual(r, [], `trial ${trial}: a calm card beside a count-armed burden card`)
    }
    if (r.length > 0) calm++
  }
  assert.ok(armed >= 20 && calm >= 20, `the property ran over both halves (armed ${armed}, calm ${calm})`)
})

// ── The persistence arm (EN-4's rung) ─────────────────────────────────────────

Deno.test('persistence arm: two days running is silent at the provisional 3, fires at 2 (the CUL-583 question)', () => {
  const two = [2, 1].map((d) => vomit(ago(d, 15)))
  assert.deepEqual(detectBurden(input(two)), [])
  const at2: DetectionConfig = { ...DEFAULT_CONFIG, burden: { ...DEFAULT_CONFIG.burden, persistenceMinDays: 2 } }
  const f = only(input(two), at2)
  assert.equal(f.runDays, 2)
  assert.equal(f.tier, 'today')
})

Deno.test('persistence arm counts the OWNER\'s days: three local days that are not three UTC days', () => {
  // Monday 23:00, Tuesday 01:00 and Wednesday 23:00 in Los Angeles are Tuesday 06:00, Tuesday 08:00
  // and Thursday 06:00 UTC. Three local days running; two UTC days, not consecutive.
  const events = [vomit(ago(2, 6)), vomit(ago(2, 8)), vomit(ago(0, 6))]
  const local = only(input(events))
  assert.equal(local.runDays, 3)
  assert.equal(local.persistenceArm, true)
  assert.deepEqual(detectBurden(input(events, { timezone: 'UTC' })), [], 'a UTC calendar: two days, no run')
})

Deno.test('no usable zone: a run is claimed only if it holds wherever the owner is', () => {
  // Every whole-hour offset is read and the QUIETEST reading is stated (the second adversarial
  // pass: the loudest offset invented runs). Each case below is checked under null, empty and
  // invalid zones alike.
  for (const timezone of [undefined, '', 'Not/AZone']) {
    const z = String(timezone)
    // Monday, Tuesday and Wednesday mornings in LA (15:00 UTC): consecutive days in every zone.
    const morning = only(input(MON_TUE_WED, { timezone }))
    assert.equal(morning.persistenceArm, true, z)
    assert.equal(morning.runDays, 3, z)
    // Three vomits inside 26 hours: three days only in a zone whose midnight falls in the right
    // two hours. Never "3 days in a row".
    const tight = [vomit(ago(1, 10)), vomit(ago(1, 23)), vomit(ago(0, 11))]
    assert.deepEqual(detectBurden(input(tight, { timezone, now: ago(0, 11, 30) })), [], `26 hours, ${z}`)
    // A run that ended two UTC days ago is never pulled forward to "yesterday".
    const old = [4, 3, 2].map((d) => vomit(ago(d, 20)))
    const f = only(input(old, { timezone, now: ago(0, 5) }))
    assert.equal(f.tier, 'soon', `old run, ${z}`)
    // The priced residual: Monday 17:30, Tuesday 16:00, Wednesday 08:00 PDT is three local days in
    // LA and two in UTC, so with no zone the persistence arm stays quiet. Stated, so it reads as
    // a decision, not coverage.
    const evening = [vomit(ago(2, 0, 30)), vomit(ago(2, 23)), vomit(ago(1, 15))]
    assert.deepEqual(detectBurden(input(evening, { timezone })), [], `evening residual, ${z}`)
  }
  // With the zone, the evening cat gets its card.
  const evening = [vomit(ago(2, 0, 30)), vomit(ago(2, 23)), vomit(ago(1, 15))]
  assert.equal(only(input(evening)).tier, 'today')
  assert.deepEqual(detectBurden(input(evening, { timezone: 'UTC' })), [], 'a UTC calendar sees two days')
})

Deno.test('"today" is the owner\'s today: an evening run in Los Angeles is still going after UTC midnight', () => {
  // NOW moved to 18:00 PDT Thursday (01:00 UTC Friday). The run ended Wednesday: one local day ago
  // ('today'), two UTC days ago ('soon' if today were read in UTC).
  const f = only(input(MON_TUE_WED, { now: '2026-09-11T01:00:00.000Z' }))
  assert.equal(f.daysSinceRunEnd, 1)
  assert.equal(f.tier, 'today')
})

Deno.test('persistence arm: the ask follows the run — today while it is going, soon once a whole day has passed', () => {
  // Run ending today (a vomit this morning, 04:00 LA = 11:00 UTC, before NOW).
  assert.equal(only(input([2, 1, 0].map((d) => vomit(ago(d, 11))))).tier, 'today')
  // Run ending yesterday.
  assert.equal(only(input(MON_TUE_WED)).tier, 'today')
  // Run ending two days ago: still this week, no longer "call today".
  const older = only(input([4, 3, 2].map((d) => vomit(ago(d, 15)))))
  assert.equal(older.daysSinceRunEnd, 2)
  assert.equal(older.tier, 'soon')
})

Deno.test('persistence arm: a LONGER earlier run in the week never quiets a run ending today', () => {
  // Days 7, 6, 5 and 4 (a run of four; day 7 at 06:00 LA is an hour inside the window), a gap on
  // day 3, then 2, 1 and 0 (a run of three ending today). The most recent qualifying run decides
  // the ask; taking the longest would have said "book a visit soon" about a run still going.
  const events = [7, 6, 5, 4, 2, 1].map((d) => vomit(ago(d, 13))).concat(vomit(ago(0, 11)))
  const f = only(input(events))
  assert.equal(f.runDays, 3)
  assert.equal(f.daysSinceRunEnd, 0)
  assert.equal(f.tier, 'today')
  assert.equal(f.countArm, true, 'seven vomits: the count arm holds too, and the copy says so')
})

// ── Silence ────────────────────────────────────────────────────────────────────

Deno.test('silence is silence: no vomit, a vomit outside the week, or another sign alone → no card', () => {
  assert.deepEqual(detectBurden(input([])), [])
  assert.deepEqual(detectBurden(input([8, 9, 10, 11, 12].map((d) => vomit(ago(d, 15))))), [], 'last week, not this one')
  assert.deepEqual(detectBurden(input([3, 2, 1, 0].map((d) => sign('diarrhea', ago(d, 11))))), [], 'vomit only (a CUL-583 residual)')
  assert.deepEqual(detectBurden(input(MON_TUE_WED, { now: 'not a date' })), [])
})

// ── The Home pipeline: one card per sign per week ──────────────────────────────

Deno.test('Home drops a same-sign ④ under the burden card, and nothing else', () => {
  const burden = only(input(MON_TUE_WED))
  const worseningVomit = { type: 'symptom_worsening', priorityClass: 'safety', symptomType: 'vomit', tier: 'standard' } as unknown as Finding
  const worseningDiarrhea = { type: 'symptom_worsening', priorityClass: 'safety', symptomType: 'diarrhea', tier: 'standard' } as unknown as Finding
  const chronic = { type: 'symptom_chronicity', priorityClass: 'safety', symptomType: 'vomit', tier: 'standard' } as unknown as Finding
  const ranked = [burden, chronic, worseningVomit, worseningDiarrhea].map((finding, rank) => ({ rank, finding }))
  const out = suppressWorseningUnderBurden(ranked)
  assert.deepEqual(out.map((r) => [r.finding.type, (r.finding as { symptomType: string }).symptomType]), [
    ['symptom_burden', 'vomit'],
    ['symptom_chronicity', 'vomit'],
    ['symptom_worsening', 'diarrhea'],
  ])
  assert.deepEqual(out.map((r) => r.rank), [0, 1, 2], 'ranks renumbered')
  // No burden card: untouched.
  assert.deepEqual(suppressWorseningUnderBurden(ranked.slice(1)), ranked.slice(1))
})

Deno.test('the burden card never asks for less than the ④ card it replaces', () => {
  // ④'s loudest ask is firm: "worth booking a vet visit soon". The burden card's quietest is the same.
  for (const events of [MON_TUE_WED, [1, 3, 5, 6].map((d) => vomit(ago(d, 15))), [6, 5, 4].map((d) => vomit(ago(d, 15)))]) {
    const text = templateBurden(only(input(events)), 'Miso')
    assert.ok(/worth a call to your vet today|worth booking a vet visit soon/.test(text), text)
  }
})

// ── Copy and the phrasing screen ───────────────────────────────────────────────

Deno.test('templates: each arm and tier, and the floor over an incomplete read', () => {
  assert.equal(
    templateBurden(only(input(MON_TUE_WED)), 'Miso'),
    'Miso has vomited on 3 days in a row — worth a call to your vet today.',
  )
  assert.equal(
    templateBurden(only(input([1, 3, 5, 6].map((d) => vomit(ago(d, 15))))), 'Miso'),
    'Miso has vomited 4 times in the last 7 days — worth booking a vet visit soon.',
  )
  assert.equal(
    templateBurden(only(input([4, 3, 2].map((d) => vomit(ago(d, 15))))), 'Miso'),
    'Miso vomited on 3 days in a row this week — worth booking a vet visit soon.',
  )
  const both = only(input([6, 5, 4, 2, 1, 0].map((d) => vomit(ago(d, 11)))))
  assert.equal(templateBurden(both, 'Miso'), 'Miso has vomited 6 times this week, on 3 days in a row — worth a call to your vet today.')
  assert.equal(
    templateBurden({ ...both, countIsFloor: true }, 'Miso'),
    'Miso has vomited at least 6 times this week, on at least 3 days in a row — worth a call to your vet today.',
  )
})

Deno.test('validatePhrasing: no model sentence is ever accepted for this card, the template included; the carried line passes', () => {
  // index.ts's model path is validatePhrasing's one runtime caller: refusing every sentence makes
  // the card render templateBurden, the fallback, always. A screen over free text did not hold:
  // review got "probably something she ate" past a keyword list, and "Not urgent but Miso has
  // vomited on 3 days in a row — worth a call to your vet today." past a template-tail rule.
  const cards = [
    only(input(MON_TUE_WED)),
    only(input([1, 3, 5, 6].map((d) => vomit(ago(d, 15))))),
    only(input([4, 3, 2].map((d) => vomit(ago(d, 15))))),
  ]
  const today = cards[0]
  for (const t of [
    templateBurden(today, 'Miso'),
    'Not urgent but Miso has vomited on 3 days in a row — worth a call to your vet today.',
    'Probably something she ate so Miso has vomited on 3 days in a row — worth a call to your vet today.',
    'Since the food switch Miso has vomited on 3 days in a row — worth a call to your vet today.',
    'Miso has vomited on 3 days in a row — worth keeping an eye on.',
  ]) assert.equal(validatePhrasing(t, today), false, t)
  for (const f of cards) {
    const carriedFrom = new Date(NOW_MS - 2 * DAY).toISOString()
    const carried = { ...f, carriedFrom }
    const line = templateCarried(carried, 'Miso', carriedFrom)
    assert.ok(validatePhrasing(line, carried), line)
    assert.equal(validatePhrasing(line.replace('worth', 'probably nothing, but worth'), carried), false)
  }
})

Deno.test('a today tier held over an incomplete read never states a run the read does not show', () => {
  // pipeline.ts holdPriorTier keeps a prior 'today' on a floored read. If what loaded holds only
  // the count arm, the card states the count with the held ask, never "1 days in a row".
  const held: SymptomBurdenFinding = {
    ...only(input([1, 3, 5, 6, 6].map((d, i) => vomit(ago(d, 9 + i))))),
    tier: 'today',
    countIsFloor: true,
  }
  assert.equal(held.persistenceArm, false)
  assert.equal(templateBurden(held, 'Miso'), 'Miso has vomited at least 5 times this week — worth a call to your vet today.')
})

Deno.test('the card carries no cause, no mechanism and no alarm word, in any arm', () => {
  const banned = /\b(cause|because|due to|food|diet|allerg|intoleran|regurgitat|bilious|severe|emergency|urgent|immediately|worse|serious)\w*/i
  for (const events of [MON_TUE_WED, [1, 3, 5, 6].map((d) => vomit(ago(d, 15))), [4, 3, 2].map((d) => vomit(ago(d, 15)))]) {
    const f = only(input(events))
    for (const text of [templateBurden(f, 'Miso'), templateBurden({ ...f, countIsFloor: true }, 'Miso')]) {
      assert.ok(!banned.test(text), text)
      assert.ok(!text.includes('!'), text)
    }
  }
})
