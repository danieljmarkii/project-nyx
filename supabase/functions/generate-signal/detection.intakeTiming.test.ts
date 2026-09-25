// The timing lane reads the intake rating (CUL-1122, built in HV-2 / CUL-1159).
//
// `lib/mealTiming.ts` is the ONE predicate for "how long since she last ate", and detectors ⑤
// (post-prandial), L1 (empty-stomach) and the A2 trial-timing rows all classify through it. CUL-1122
// found it treated every bowl put down as eating, so a vomit five minutes after a REFUSED bowl read
// "5 min after eating". The ruling (Dr. Chen lens, recorded on CUL-1122): a feeding anchors when food
// went in. Refused never anchors; Picked at, Some, Most, All and an unrated bowl do, and the rule reads
// the rating, never the food type.
//
// This file holds two kinds of test, and the split is the point:
//
//   1. THE BEFORE-AND-AFTER PINS (the issue's acceptance: "detector 5 is unchanged on a record with no
//      refusals"). Two records carry every rating EXCEPT Refused, on meals and treats, with legacy NULL
//      confidences mixed in. The expected findings below were captured from the PRE-CHANGE engine and
//      committed before `lib/mealTiming.ts` was touched, so they are the "before"; the same assertions
//      passing on the changed engine is the "after". A seeded differential then shows the same thing
//      across 300 random records: any rating other than Refused is inert.
//   2. THE REFUSAL CASES, which move exactly the episodes a refused bowl used to anchor.
//
// Every instant is a UTC literal or an offset from one and every input pins `timezone: 'UTC'` where a
// local day is read, so nothing here depends on the runner's zone (B-514).

import { strict as assert } from 'node:assert'
import {
  detectPostprandialTiming,
  detectEmptyStomachTiming,
  detectSignals,
  type DetectionInput,
  type IntakeRating,
  type MealEvent,
  type OccurredAtConfidence,
  type PetContext,
  type SymptomEvent,
} from './detection.ts'

// ── Fixture helpers ───────────────────────────────────────────────────────────

let idSeq = 0
const nextId = () => `it-${++idSeq}`

/** ISO-8601 UTC for a day/hour/min in May 2026 (the detection.test.ts calendar). */
const at = (day: number, hour = 8, min = 0): string =>
  `2026-05-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00.000Z`

const NOW = at(30, 12)
const cat: PetContext = { name: 'Pixel', species: 'cat', dietTrialActive: false }

const input = (over: Partial<DetectionInput>): DetectionInput => ({
  pet: cat,
  symptomEvents: [],
  mealEvents: [],
  now: NOW,
  timezone: 'UTC',
  ...over,
})

/** A witnessed vomit (the only onset the lane times). */
const wVomit = (day: number, hour = 12, min = 0): SymptomEvent => ({
  id: nextId(),
  type: 'vomit',
  occurredAt: at(day, hour, min),
  occurredAtConfidence: 'witnessed',
})

/** A feeding with an explicit rating, type and (optionally NULL) confidence. */
const feed = (
  day: number,
  hour: number,
  min: number,
  intakeRating: IntakeRating | null,
  foodType: 'meal' | 'treat' = 'meal',
  occurredAtConfidence: OccurredAtConfidence | null = 'witnessed',
): MealEvent => ({
  id: nextId(),
  occurredAt: at(day, hour, min),
  foodItemId: null,
  primaryProtein: 'x',
  intakeRating,
  foodType,
  foodLabel: foodType === 'treat' ? 'Acme Treat' : 'Acme Kibble',
  occurredAtConfidence,
})

/** Every rating except Refused, cycled — the no-refusal record's vocabulary. */
const NON_REFUSED: readonly (IntakeRating | null)[] = ['picked', 'some', null, 'all', 'most']
const rated = (i: number): IntakeRating | null => NON_REFUSED[i % NON_REFUSED.length]

/**
 * The ⑤ record with no refusals: detection.test.ts's golden shape (12 witnessed vomits May 16–27,
 * the last 4 rapid, ~8 feedings a day so the grazing guard is exercised at its bar), with every
 * feeding given a rating from NON_REFUSED, meals and treats mixed, and some legacy NULL confidences.
 * The four rapid anchors are Picked at, Some, unrated and All in that order, so a rule that dropped
 * any of them would move a rapid episode to the long band and change the finding.
 */
function postprandialNoRefusals(): { symptomEvents: SymptomEvent[]; mealEvents: MealEvent[] } {
  const symptomEvents: SymptomEvent[] = []
  const mealEvents: MealEvent[] = []
  for (let i = 0; i < 12; i++) {
    const day = 16 + i
    symptomEvents.push(wVomit(day, 12, 0))
    if (i >= 8) mealEvents.push(feed(day, 11, 40, (['picked', 'some', null, 'all'] as const)[i - 8], i % 2 ? 'treat' : 'meal'))
    else mealEvents.push(feed(day, 7, 0, rated(i), 'meal', i % 3 === 0 ? null : 'witnessed'))
    for (let h = 0; h < 7; h++) mealEvents.push(feed(day, h, 0, rated(i + h), h % 2 ? 'treat' : 'meal'))
  }
  return { symptomEvents, mealEvents }
}

/**
 * The L1 record with no refusals: detection.test.ts's twice-daily golden (feedings 02:00 and 14:00,
 * a mid vomit then seven long ones at 13:00), every feeding rated from NON_REFUSED. The long vomits
 * are timed from the 02:00 feeding, so a rule that dropped one of those would re-time its episode
 * from the previous day's 14:00 and move the median.
 */
function emptyStomachNoRefusals(): { symptomEvents: SymptomEvent[]; mealEvents: MealEvent[] } {
  const mealEvents: MealEvent[] = []
  for (let d = 10; d <= 27; d++) {
    mealEvents.push(feed(d, 2, 0, rated(d)))
    mealEvents.push(feed(d, 14, 0, rated(d + 2), d % 4 === 0 ? 'treat' : 'meal'))
  }
  const symptomEvents = [wVomit(17, 5, 0), ...[18, 19, 20, 21, 22, 23, 24].map((d) => wVomit(d, 13, 0))]
  return { symptomEvents, mealEvents }
}

// ── 1. The before-and-after pins ─────────────────────────────────────────────
//
// Captured from the pre-change engine (the lane at #905, before CUL-1122) and committed on their own
// before the lane changed. Every number here is what the shipped detectors printed for these records.

const ONSET = (day: number, hour: number) => Date.parse(at(day, hour))

Deno.test('CUL-1122 pin — ⑤ on a record with every rating except Refused is byte-identical to the pre-change engine', () => {
  const findings = detectPostprandialTiming(input(postprandialNoRefusals()))
  assert.deepEqual(findings, [
    {
      type: 'postprandial_timing',
      priorityClass: 'insight',
      symptomType: 'vomit',
      rapidCount: 4,
      eligibleCount: 12,
      totalEpisodes: 12,
      rapidWindowMinutes: 30,
      lastTwoEligibleRapid: true,
      medianMinutesSinceFeeding: 20,
      feedingFormsInEvidence: ['Acme Kibble', 'Acme Treat'],
      rapidEpisodeOnsets: [ONSET(24, 12), ONSET(25, 12), ONSET(26, 12), ONSET(27, 12)],
      associationalOnly: true,
      windowDays: 60,
    },
  ])
})

Deno.test('CUL-1122 pin — L1 on a record with every rating except Refused is byte-identical to the pre-change engine', () => {
  const findings = detectEmptyStomachTiming(input(emptyStomachNoRefusals()))
  assert.deepEqual(findings, [
    {
      type: 'empty_stomach_timing',
      priorityClass: 'insight',
      symptomType: 'vomit',
      longCount: 7,
      eligibleCount: 8,
      bandCounts: { rapid: 0, mid: 1, long: 7 },
      totalEpisodes: 8,
      longGapHours: 6,
      lastTwoEligibleLong: true,
      medianHoursSinceFeeding: 11,
      feedingFormsInEvidence: ['Acme Kibble'],
      clockBand: { startLocalHour: 13, windowHours: 4 },
      clockCount: 7,
      longEpisodeOnsets: [18, 19, 20, 21, 22, 23, 24].map((d) => ONSET(d, 13)),
      associationalOnly: true,
      windowDays: 60,
    },
  ])
})

Deno.test('CUL-1122 pin — the ranked Signal over both records keeps its pre-change findings (⑥ still suppressed or kept the same way)', () => {
  assert.deepEqual(
    detectSignals(input(postprandialNoRefusals())).map((r) => r.finding.type),
    ['postprandial_timing', 'timeofday_clustering', 'reflection'],
  )
  assert.deepEqual(
    detectSignals(input(emptyStomachNoRefusals())).map((r) => r.finding.type),
    ['empty_stomach_timing', 'reflection'],
  )
})

/** Seeded PRNG (mulberry32), the detection suites' own — a property failure must be re-runnable. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let x = Math.imul(a ^ (a >>> 15), 1 | a)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A random record built to FIRE: 1–4 feedings a day for 30–45 days, and on a random share of days a
 * witnessed vomit placed either soon after a feeding (5–40 min) or long after one (6–10 h), so ⑤ and
 * L1 both fire on a good fraction of records and the comparison below is over real findings rather
 * than two empty lists. Every feeding draws a rating from NON_REFUSED, never Refused.
 */
function randomNoRefusalRecord(rng: () => number): { symptomEvents: SymptomEvent[]; mealEvents: MealEvent[] } {
  const mealEvents: MealEvent[] = []
  const symptomEvents: SymptomEvent[] = []
  const days = 30 + Math.floor(rng() * 16)
  const vomitShare = 0.2 + rng() * 0.5
  const rapidShare = rng()
  const endMs = Date.parse(NOW) - 3_600_000
  for (let d = days; d >= 1; d--) {
    const dayStart = endMs - d * 86_400_000
    const perDay = 1 + Math.floor(rng() * 4)
    const dayFeedings: number[] = []
    for (let k = 0; k < perDay; k++) {
      const ms = dayStart + Math.floor(rng() * 20) * 3_600_000 + Math.floor(rng() * 60) * 60_000
      dayFeedings.push(ms)
      const rating = NON_REFUSED[Math.floor(rng() * NON_REFUSED.length)]
      const conf: OccurredAtConfidence | null = rng() < 0.2 ? null : rng() < 0.05 ? 'estimated' : 'witnessed'
      mealEvents.push({
        id: nextId(),
        occurredAt: new Date(ms).toISOString(),
        foodItemId: null,
        primaryProtein: 'x',
        intakeRating: rating,
        foodType: rng() < 0.3 ? 'treat' : 'meal',
        foodLabel: 'Acme',
        occurredAtConfidence: conf,
      })
    }
    if (rng() < vomitShare) {
      const anchor = dayFeedings[Math.floor(rng() * dayFeedings.length)]
      const offset = rng() < rapidShare
        ? (5 + Math.floor(rng() * 36)) * 60_000
        : (6 * 60 + Math.floor(rng() * 240)) * 60_000
      symptomEvents.push({
        id: nextId(),
        type: 'vomit',
        occurredAt: new Date(anchor + offset).toISOString(),
        occurredAtConfidence: rng() < 0.85 ? 'witnessed' : 'estimated',
      })
    }
  }
  return { symptomEvents, mealEvents }
}

Deno.test('CUL-1122 differential — across 300 seeded records with no refusal, ⑤ and L1 are identical with every rating erased', () => {
  const rng = mulberry32(0x1122)
  let fired = 0
  let pickedFeedings = 0
  for (let trial = 0; trial < 300; trial++) {
    const record = randomNoRefusalRecord(rng)
    pickedFeedings += record.mealEvents.filter((m) => m.intakeRating === 'picked').length
    const erased = { ...record, mealEvents: record.mealEvents.map((m) => ({ ...m, intakeRating: null })) }
    const withRatings = [
      ...detectPostprandialTiming(input(record)),
      ...detectEmptyStomachTiming(input(record)),
    ]
    const withoutRatings = [
      ...detectPostprandialTiming(input(erased)),
      ...detectEmptyStomachTiming(input(erased)),
    ]
    assert.deepEqual(withRatings, withoutRatings, `record ${trial}: a rating other than Refused moved a timing finding`)
    if (withRatings.length > 0) fired++
  }
  // Non-vacuity (C-36): the comparison is over findings that exist, and Picked at is well represented.
  // Measured at seed 0x1122: 204 of 300 records fire, 5,610 feedings rated Picked at.
  assert.ok(fired >= 150, `only ${fired} of 300 records fired ⑤ or L1; the differential would be comparing empty lists`)
  assert.ok(pickedFeedings >= 4000, `only ${pickedFeedings} Picked at feedings drawn`)
})

// ── 2. The refusal cases ──────────────────────────────────────────────────────

/**
 * Pixel's pattern, as a record: breakfast at 08:00 every day, dinner at 22:00 every day, and on eight
 * nights the dinner is REFUSED and a witnessed vomit follows at 22:05. Before CUL-1122 each of those
 * vomits was "5 min after eating", eight of eight rapid, and ⑤ printed its eating-too-fast card for a
 * cat that had not eaten since breakfast.
 */
function pixelRefusalNights(): { symptomEvents: SymptomEvent[]; mealEvents: MealEvent[] } {
  const mealEvents: MealEvent[] = []
  const symptomEvents: SymptomEvent[] = []
  const refusalNights = new Set([18, 19, 21, 22, 24, 25, 27, 28])
  for (let d = 5; d <= 29; d++) {
    mealEvents.push(feed(d, 8, 0, null))
    mealEvents.push(feed(d, 22, 0, refusalNights.has(d) ? 'refused' : 'all'))
    if (refusalNights.has(d)) symptomEvents.push(wVomit(d, 22, 5))
  }
  return { symptomEvents, mealEvents }
}

Deno.test('CUL-1122 — Pixel: vomits 5 min after REFUSED dinners no longer make ⑤’s soon-after-eating card', () => {
  const record = pixelRefusalNights()
  assert.deepEqual(detectPostprandialTiming(input(record)), [])
  // The same nights with the dinner EATEN are the real pattern, and ⑤ still sees it: the refusal is
  // the only thing that moved.
  const eaten = { ...record, mealEvents: record.mealEvents.map((m) => ({ ...m, intakeRating: null })) }
  const f = detectPostprandialTiming(input(eaten))
  assert.equal(f.length, 1)
  assert.equal(f[0].rapidCount, 8)
  assert.equal(f[0].eligibleCount, 8)
})

Deno.test('CUL-1122 — Pixel: each vomit is timed from breakfast (14 h), so no timing card claims a short gap', () => {
  const record = pixelRefusalNights()
  // No meal-relative card fires: ⑤ is silent (above), and L1's schedule guard holds it too — a cat
  // whose dinners are refused is a long way from her last meal most of the day, so eight long
  // episodes are what her own schedule predicts. The refusals themselves belong to the intake lane,
  // which this change does not touch.
  assert.deepEqual(detectEmptyStomachTiming(input(record)), [])
  const types: string[] = detectSignals(input(record)).map((r) => r.finding.type)
  for (const t of ['postprandial_timing', 'empty_stomach_timing', 'timing_story']) {
    assert.ok(!types.includes(t), `${t} must not fire: ${types.join(', ')}`)
  }
  // What remains is true: every vomit fell at 22:05, and ⑥'s clock card — suppressed while ⑤ claimed
  // these episodes as rapid — now says so.
  assert.ok(types.includes('timeofday_clustering'), `⑥ states the clock fact: ${types.join(', ')}`)
})

Deno.test('CUL-1122 — a refused anchor moves only its own episode: ⑤’s golden with one rapid bowl refused', () => {
  // The golden's four rapid anchors (11:40) and its eight slow ones (07:00); refuse the LAST rapid
  // anchor. That episode re-times from the 06:00 feeding (6 h → long), the other three stay rapid,
  // and 3 of 12 no longer clears the grazing guard's bar at ~8 feedings a day, so ⑤ goes quiet.
  const record = postprandialNoRefusals()
  const lastRapid = record.mealEvents.find((m) => m.occurredAt === at(27, 11, 40))!
  const refusedOne = {
    ...record,
    mealEvents: record.mealEvents.map((m) => (m === lastRapid ? { ...m, intakeRating: 'refused' as const } : m)),
  }
  assert.deepEqual(detectPostprandialTiming(input(refusedOne)), [])
  // Rated Picked at instead, the same bowl anchors and ⑤ is exactly the pinned finding.
  const pickedOne = {
    ...record,
    mealEvents: record.mealEvents.map((m) => (m === lastRapid ? { ...m, intakeRating: 'picked' as const } : m)),
  }
  assert.equal(detectPostprandialTiming(input(pickedOne))[0]?.rapidCount, 4)
})

Deno.test('CUL-1122 — a refused TREAT is not eating either; the rule reads the rating, never the food type', () => {
  const record = postprandialNoRefusals()
  const rapidAnchors = record.mealEvents.filter((m) => m.occurredAt.includes('T11:40'))
  assert.equal(rapidAnchors.length, 4)
  const asRefusedTreats = {
    ...record,
    mealEvents: record.mealEvents.map((m) =>
      rapidAnchors.includes(m) ? { ...m, foodType: 'treat' as const, intakeRating: 'refused' as const } : m,
    ),
  }
  assert.deepEqual(detectPostprandialTiming(input(asRefusedTreats)), [])
})

Deno.test('CUL-1122 — the grazing guard counts eating, not bowls: refused bowls leave the feeding rate', () => {
  // ⑤'s golden fires 4 rapid of 12 at ~8 feedings a day, exactly at the guard's bar. Add six refused
  // bowls a day on top: they are not eating, so the rate the guard reads is unchanged and ⑤ still
  // fires with the golden's numbers. Counted as feedings, they would push the chance-expected rapid
  // count above 4 and silence a real pattern.
  const record = postprandialNoRefusals()
  const extra: MealEvent[] = []
  for (let day = 16; day <= 27; day++) {
    for (const h of [13, 15, 17, 19, 21, 23]) extra.push(feed(day, h, 0, 'refused'))
  }
  const findings = detectPostprandialTiming(input({ ...record, mealEvents: [...record.mealEvents, ...extra] }))
  assert.equal(findings.length, 1)
  assert.equal(findings[0].rapidCount, 4)
  assert.equal(findings[0].eligibleCount, 12)
})
