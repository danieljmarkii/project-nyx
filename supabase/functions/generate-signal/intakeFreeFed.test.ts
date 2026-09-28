// CUL-1086 — the intake lane reads the phone's meals: a currently free-fed food's ratings
// never reach detector ② or the rate_meals diagnostic (§11 #6, "a free-fed bowl's rating is
// unreliable and its absence is not a refusal").
//
// Each case asserts BOTH halves: what the engine did without the set (the defect, so the
// fixture is proven to exercise the filter) and what it does with it. The phone-vs-server
// agreement over generated meals lives in `lib/intakeDeclineParity.test.ts` (jest drives both
// real detectors); this file holds the server-only consequences and the caller contract.

import { strict as assert } from 'node:assert'
import {
  detectCoverage,
  detectIntakeDecline,
  type DetectionInput,
  type IntakeRating,
  type MealEvent,
  type Species,
} from './detection.ts'

const NOW = '2026-07-10T20:00:00.000Z'
const WET = 'f-wet'
const KIBBLE = 'f-kibble'
const FREE_FED: ReadonlySet<string> = new Set([KIBBLE])

let seq = 0
function meal(day: number, hour: number, foodItemId: string, rating: IntakeRating | null): MealEvent {
  seq += 1
  const dd = String(day).padStart(2, '0')
  const hh = String(hour).padStart(2, '0')
  return {
    id: `m${seq}`,
    occurredAt: `2026-07-${dd}T${hh}:00:00.000Z`,
    foodItemId,
    primaryProtein: foodItemId === WET ? 'duck' : 'chicken',
    intakeRating: rating,
    foodType: 'meal',
    foodLabel: foodItemId === WET ? 'Trial wet food' : 'Free-fed kibble',
  }
}

function input(species: Species, mealEvents: MealEvent[], freeFedFoodIds?: ReadonlySet<string>): DetectionInput {
  return {
    pet: { name: 'Nyx', species, dietTrialActive: false },
    symptomEvents: [],
    mealEvents,
    freeFedFoodIds,
    now: NOW,
  }
}

Deno.test('CUL-1086 — a free-fed bowl rated "ate it all" no longer hides a cat\'s real drop', () => {
  // The wet food she is actually watched eating: "all" for nine days, "picked" today. The
  // kibble bowl is down all day and rated "all" every day, today included.
  const meals: MealEvent[] = []
  for (let d = 1; d <= 9; d++) meals.push(meal(d, 8, WET, 'all'), meal(d, 12, KIBBLE, 'all'))
  meals.push(meal(10, 8, WET, 'picked'), meal(10, 12, KIBBLE, 'all'))

  // The defect: today's mean is (1 + 4) / 2 = 2.5, above the cat's single-day ceiling (2).
  assert.deepEqual(detectIntakeDecline(input('cat', meals)), [], 'the bowl held the drop off Home')

  const fixed = detectIntakeDecline(input('cat', meals, FREE_FED))
  assert.equal(fixed.length, 1)
  assert.equal(fixed[0].trigger, 'consecutive_low')
  assert.equal(fixed[0].baselineScore, 4)
  assert.equal(fixed[0].recentScore, 1)
  // Nine wet meals before the recent cutoff; not a single kibble rating among them.
  assert.equal(fixed[0].ratedMealsConsidered, 9)
})

Deno.test('CUL-1086 — a free-fed bowl\'s rating no longer fires a decline the phone would never raise', () => {
  // A dog eating its wet food fully; the free-fed kibble, usually rated "all", rated
  // "refused" today. The phone never reads the bowl; the server used to.
  const meals: MealEvent[] = []
  for (let d = 4; d <= 9; d++) meals.push(meal(d, 8, WET, 'all'), meal(d, 12, KIBBLE, 'all'))
  meals.push(meal(10, 8, WET, 'all'), meal(10, 12, KIBBLE, 'refused'))

  const before = detectIntakeDecline(input('dog', meals))
  assert.equal(before.length, 1, 'the fixture fires on the bowl without the set')
  assert.equal(before[0].trigger, 'refused_normal_food')
  assert.equal(before[0].refusedFoodLabel, 'Free-fed kibble')

  assert.deepEqual(detectIntakeDecline(input('dog', meals, FREE_FED)), [])
})

Deno.test('CUL-1086 — the last-full-meal anchor never lands on a free-fed "all"', () => {
  // Wet food "all" through Jul 7, then low; the kibble is rated "all" on Jul 9, later than
  // any wet "all". The anchor may only get OLDER from the exclusion, never newer.
  const meals: MealEvent[] = []
  for (let d = 1; d <= 7; d++) meals.push(meal(d, 8, WET, 'all'))
  meals.push(meal(8, 8, WET, 'some'), meal(9, 8, WET, 'some'), meal(9, 12, KIBBLE, 'all'))
  meals.push(meal(10, 8, WET, 'picked'))

  const without = detectIntakeDecline(input('cat', meals))
  const withSet = detectIntakeDecline(input('cat', meals, FREE_FED))
  assert.ok(without.length > 0 && withSet.length > 0)
  assert.equal(without[0].lastFullMealIso, '2026-07-09T12:00:00.000Z', 'the defect: the bowl was the anchor')
  assert.equal(withSet[0].lastFullMealIso, '2026-07-07T08:00:00.000Z')
})

Deno.test('CUL-1086 — rate_meals counts the floor the detector counts, and never asks to rate a free-fed bowl', () => {
  // Two rated wet meals, one unrated wet meal, five rated kibble meals.
  const meals: MealEvent[] = [
    meal(6, 8, WET, 'all'),
    meal(7, 8, WET, 'most'),
    meal(8, 8, WET, null),
  ]
  for (let d = 5; d <= 9; d++) meals.push(meal(d, 12, KIBBLE, 'all'))

  const rateOf = (i: DetectionInput) => detectCoverage(i).find((d) => d.type === 'rate_meals')
  // The defect: seven "rated meals" cleared the floor of four, so ② looked merely quiet.
  assert.equal(rateOf(input('cat', meals)), undefined)
  const fixed = rateOf(input('cat', meals, FREE_FED))
  assert.ok(fixed && fixed.type === 'rate_meals')
  assert.equal(fixed.ratedMeals, 2, 'the same two meals detectIntakeDecline sees')

  // A pet fed ONLY from the bowl: rating would never wake the lane, so no nudge.
  const bowlOnly: MealEvent[] = []
  for (let d = 1; d <= 3; d++) bowlOnly.push(meal(d, 12, KIBBLE, d === 1 ? 'all' : null))
  assert.ok(rateOf(input('cat', bowlOnly)), 'the fixture nudges without the set')
  assert.equal(rateOf(input('cat', bowlOnly, FREE_FED)), undefined)
})

Deno.test('CUL-1086 — absent and empty sets are today\'s engine, byte for byte', () => {
  const meals: MealEvent[] = []
  for (let d = 1; d <= 9; d++) meals.push(meal(d, 8, WET, 'all'), meal(d, 12, KIBBLE, 'all'))
  meals.push(meal(10, 8, WET, 'refused'), meal(10, 12, KIBBLE, 'picked'))
  const absent = detectIntakeDecline(input('cat', meals))
  assert.ok(absent.length > 0)
  assert.deepEqual(detectIntakeDecline(input('cat', meals, new Set())), absent)
  // A null food id never matches the set (the phone's `foodItemId !== null` guard).
  const unidentified = meals.map((m) => ({ ...m, foodItemId: null }))
  assert.deepEqual(
    detectIntakeDecline(input('cat', unidentified, new Set(['']))),
    detectIntakeDecline(input('cat', unidentified)),
  )
})

Deno.test('CUL-1086 — the Signal\'s entry point hands the engine its free-fed set', () => {
  // The field is optional for the fixtures' sake, so a caller that forgets it compiles and
  // silently reverts to the disagreement. Pin the one line in the entry point that passes it,
  // and that the set it passes is the phone's definition (active: no end date). The report's
  // caller is driven for real in generate-report/report.test.ts.
  //
  // A SOURCE SCAN, stated as one, with its blind spots: it cannot see a set that is built right
  // in text but empty at runtime, and the second regex pins formatting as well as meaning. The
  // slice ends at the literal's first `\n    }\n`, so a nested block at that indent would cut it
  // early (it fails red, with a misleading message). PR-11b extracts this pipeline out of
  // index.ts; when it lands, this test follows the literal to its new home or drives it.
  const src = Deno.readTextFileSync(new URL('./index.ts', import.meta.url))
  const literal = src.slice(src.indexOf('const input: DetectionInput = {'))
  const body = literal.slice(0, literal.indexOf('\n    }\n'))
  assert.match(body, /^\s+freeFedFoodIds,/m, 'index.ts passes freeFedFoodIds into DetectionInput')
  assert.match(
    src,
    /const freeFedFoodIds = new Set<string>\(\s*arrangementRows\.filter\(\(r\) => r\.active_until === null && r\.food_item_id\)/,
    'the set is the currently-active arrangements, as the phone reads them',
  )
})
