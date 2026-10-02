// CUL-1086 — the intake lane reads the phone's meals: a rating logged while its food's bowl was
// down never reaches detector ② or the rate_meals diagnostic (§11 #6). BY DATE, through the one
// predicate both surfaces import (`lib/freeFedIntake.ts`; PM ruling 2026-09-28).
//
// Each case asserts BOTH halves: what the engine did without the bowl (so the fixture is proven
// to reach the exclusion) and what it does with it. The phone-vs-server agreement over generated
// records lives in `lib/intakeDeclineParity.test.ts` (jest drives both real detectors); this file
// holds the server-only consequences, the by-date cases the adversarial pass broke the by-food
// rule with, and the Signal entry point's half of the caller contract.

import { strict as assert } from 'node:assert'
import {
  detectCoverage,
  detectIntakeDecline,
  type DetectionInput,
  type FeedingArrangement,
  type IntakeRating,
  type MealEvent,
  type Species,
} from './detection.ts'
import { mapArrangementRows } from './pipeline.ts'

const NOW = '2026-07-10T20:00:00.000Z'
const WET = 'f-wet'
const KIBBLE = 'f-kibble'

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

/** A kibble bowl down from `createdAt` until `endedAt` (the toggle-off instant, migration 076),
 *  or still down. `activeUntil` is the local date the app writes beside the instant. */
function bowl(createdAt: string, endedAt: string | null = null, activeUntil: string | null = endedAt?.slice(0, 10) ?? null): FeedingArrangement {
  return {
    id: `a-${createdAt}`,
    primaryProtein: 'chicken',
    activeFrom: createdAt.slice(0, 10),
    activeUntil,
    foodItemId: KIBBLE,
    createdAt,
    endedAt,
  }
}
/** Down since long before any meal in these fixtures. */
const DOWN_ALL_ALONG = bowl('2026-06-01T00:00:00.000Z')

function input(species: Species, mealEvents: MealEvent[], feedingArrangements: FeedingArrangement[] = []): DetectionInput {
  return {
    pet: { name: 'Nyx', species, dietTrialActive: false },
    symptomEvents: [],
    mealEvents,
    feedingArrangements,
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

  const fixed = detectIntakeDecline(input('cat', meals, [DOWN_ALL_ALONG]))
  assert.equal(fixed.length, 1)
  assert.equal(fixed[0].trigger, 'consecutive_low')
  assert.equal(fixed[0].baselineScore, 4)
  assert.equal(fixed[0].recentScore, 1)
  // Nine wet meals before the recent cutoff; not a single kibble rating among them.
  assert.equal(fixed[0].ratedMealsConsidered, 9)
})

Deno.test('CUL-1086 — a free-fed bowl\'s rating no longer fires a decline the phone would never raise', () => {
  const meals: MealEvent[] = []
  for (let d = 4; d <= 9; d++) meals.push(meal(d, 8, WET, 'all'), meal(d, 12, KIBBLE, 'all'))
  meals.push(meal(10, 8, WET, 'all'), meal(10, 12, KIBBLE, 'refused'))

  const before = detectIntakeDecline(input('dog', meals))
  assert.equal(before.length, 1, 'the fixture fires on the bowl without the arrangement')
  assert.equal(before[0].trigger, 'refused_normal_food')
  assert.equal(before[0].refusedFoodLabel, 'Free-fed kibble')

  assert.deepEqual(detectIntakeDecline(input('dog', meals, [DOWN_ALL_ALONG])), [])
})

Deno.test('CUL-1086 by date — refusals logged BEFORE the owner leaves that food down still fire', () => {
  // The adversarial pass's case that broke the by-food rule: meal-fed kibble eaten fully for six
  // days, refused three times this morning, and the owner reacts by leaving it down at 14:00.
  const meals: MealEvent[] = []
  for (let d = 4; d <= 9; d++) meals.push(meal(d, 8, KIBBLE, 'all'))
  meals.push(meal(10, 7, KIBBLE, 'refused'), meal(10, 9, KIBBLE, 'refused'), meal(10, 11, KIBBLE, 'refused'))

  const leftDown = detectIntakeDecline(input('cat', meals, [bowl('2026-07-10T14:00:00.000Z')]))
  assert.deepEqual(leftDown.map((f) => f.trigger).sort(), ['consecutive_low', 'refused_normal_food'])

  // By food (every rating of a food free-fed today) the same record went silent. A bowl written
  // before the first refusal is that rule's reach: it takes the refusals, as it should.
  const beforeRefusals = detectIntakeDecline(input('cat', meals, [bowl('2026-07-10T06:00:00.000Z')]))
  assert.deepEqual(beforeRefusals, [])

  // And rate_meals does not nudge the owner to rate what she already rated.
  const rate = detectCoverage(input('cat', meals, [bowl('2026-07-10T14:00:00.000Z')])).find((d) => d.type === 'rate_meals')
  assert.equal(rate, undefined)
})

Deno.test('CUL-1086 by date — a bowl taken up yesterday is never the last full meal today', () => {
  // The kibble bowl was down Jul 1–8 and rated "all" daily; it came up at 20:00 on Jul 8. The
  // wet food is "all" through Jul 4, "some" after, and "picked" today (a cat).
  const meals: MealEvent[] = []
  for (let d = 1; d <= 8; d++) meals.push(meal(d, 12, KIBBLE, 'all'))
  for (let d = 1; d <= 4; d++) meals.push(meal(d, 8, WET, 'all'))
  for (let d = 5; d <= 9; d++) meals.push(meal(d, 8, WET, 'some'))
  meals.push(meal(10, 8, WET, 'picked'))
  const takenUp = bowl('2026-07-01T00:00:00.000Z', '2026-07-08T20:00:00.000Z')

  const byDate = detectIntakeDecline(input('cat', meals, [takenUp]))
  assert.ok(byDate.length > 0)
  // The watched last full meal: Jul 4. By food, an ended bowl excluded nothing and its Jul 8
  // "all" became the anchor, two days calmer inside the feline 48–72 h window.
  assert.equal(byDate[0].lastFullMealIso, '2026-07-04T08:00:00.000Z')
  const noBowl = detectIntakeDecline(input('cat', meals))
  assert.equal(noBowl[0]?.lastFullMealIso, '2026-07-08T12:00:00.000Z', 'the fixture reaches the anchor without the span')

  // After the bowl came up, a meal-fed kibble rating counts again.
  const after = [...meals, meal(9, 12, KIBBLE, 'all')]
  assert.equal(detectIntakeDecline(input('cat', after, [takenUp]))[0]?.lastFullMealIso, '2026-07-09T12:00:00.000Z')
})

Deno.test('CUL-1086 by instant — refusals after the bowl comes up count, the bowl before it does not', () => {
  // Round 2 probe 1: the bowl comes up at 07:00 so the owner can watch her meals, as a vet would
  // ask; she refuses the kibble at 08:00 and 18:00. With the toggle-off instant recorded (076)
  // there is nothing to infer: a rating after it is a watched meal.
  const meals: MealEvent[] = []
  for (let d = 4; d <= 9; d++) meals.push(meal(d, 8, WET, 'all'))
  meals.push(meal(10, 8, KIBBLE, 'refused'), meal(10, 18, KIBBLE, 'refused'))
  const upToday = bowl('2026-07-01T00:00:00.000Z', '2026-07-10T07:00:00.000Z')
  const out = detectIntakeDecline(input('cat', meals, [upToday]))
  assert.deepEqual(out.map((f) => f.trigger), ['consecutive_low'])

  // Round 3 probes A–C: low BOWL ratings from before the take-up never enter the baseline, and a
  // "some" day after it is a concern day like any other. The bowl's picks on Jul 8–9 must not
  // drag the baseline down under a watched drop to "some" on Jul 10.
  const r3: MealEvent[] = []
  for (let d = 3; d <= 7; d++) r3.push(meal(d, 8, WET, 'all'))
  r3.push(meal(8, 12, KIBBLE, 'picked'), meal(8, 20, KIBBLE, 'picked'), meal(9, 4, KIBBLE, 'picked'))
  r3.push(meal(10, 8, KIBBLE, 'some'), meal(10, 12, KIBBLE, 'some'))
  const upJul9 = bowl('2026-07-01T00:00:00.000Z', '2026-07-09T06:00:00.000Z')
  assert.deepEqual(detectIntakeDecline(input('cat', r3, [upJul9])).map((f) => f.trigger), ['consecutive_low'])
  // Without the bowl the picks sit in the baseline and the drop is silenced: the fixture reaches it.
  assert.deepEqual(detectIntakeDecline(input('cat', r3)), [])
  // Probe B (a dog): the bowl's picks must not spoil the food's normally-eaten history either.
  const b: MealEvent[] = [meal(7, 12, KIBBLE, 'picked'), meal(7, 20, KIBBLE, 'picked')]
  b.push(meal(8, 8, KIBBLE, 'all'), meal(9, 8, KIBBLE, 'all'), meal(9, 18, KIBBLE, 'all'), meal(10, 8, KIBBLE, 'refused'))
  const upJul8 = bowl('2026-07-01T00:00:00.000Z', '2026-07-08T06:00:00.000Z')
  assert.deepEqual(detectIntakeDecline(input('dog', b, [upJul8])).map((f) => f.trigger), ['refused_normal_food'])
  assert.deepEqual(detectIntakeDecline(input('dog', b)), [], 'the fixture reaches the history: without the bowl it goes silent')
})

Deno.test('CUL-1086 — a bowl ended before migration 076 (no ended_at) counts every rating from its date on', () => {
  // The fallback when the instant is missing: the bowl is down only until the local date could
  // have begun anywhere (UTC+14), so a take-up-day refusal counts. Counting is the safe error.
  const meals: MealEvent[] = []
  for (let d = 4; d <= 9; d++) meals.push(meal(d, 8, WET, 'all'))
  meals.push(meal(10, 8, KIBBLE, 'refused'))
  const legacy = bowl('2026-07-01T00:00:00.000Z', null, '2026-07-10')
  assert.deepEqual(detectIntakeDecline(input('cat', meals, [legacy])).map((f) => f.trigger), ['consecutive_low'])
})

Deno.test('CUL-1086 — rate_meals counts the floor the detector counts, and never asks to rate a free-fed bowl', () => {
  const meals: MealEvent[] = [
    meal(6, 8, WET, 'all'),
    meal(7, 8, WET, 'most'),
    meal(8, 8, WET, null),
  ]
  for (let d = 5; d <= 9; d++) meals.push(meal(d, 12, KIBBLE, 'all'))

  const rateOf = (i: DetectionInput) => detectCoverage(i).find((d) => d.type === 'rate_meals')
  assert.equal(rateOf(input('cat', meals)), undefined)
  const fixed = rateOf(input('cat', meals, [DOWN_ALL_ALONG]))
  assert.ok(fixed && fixed.type === 'rate_meals')
  assert.equal(fixed.ratedMeals, 2, 'the same two meals detectIntakeDecline sees')

  const bowlOnly: MealEvent[] = []
  for (let d = 1; d <= 3; d++) bowlOnly.push(meal(d, 12, KIBBLE, d === 1 ? 'all' : null))
  assert.ok(rateOf(input('cat', bowlOnly)), 'the fixture nudges without the arrangement')
  assert.equal(rateOf(input('cat', bowlOnly, [DOWN_ALL_ALONG])), undefined)
})

Deno.test('CUL-1086 — an arrangement without a food or a creation instant excludes nothing extra', () => {
  const meals: MealEvent[] = []
  for (let d = 1; d <= 9; d++) meals.push(meal(d, 8, WET, 'all'), meal(d, 12, KIBBLE, 'all'))
  meals.push(meal(10, 8, WET, 'refused'), meal(10, 12, KIBBLE, 'picked'))
  const none = detectIntakeDecline(input('cat', meals))
  assert.ok(none.length > 0)
  // The correlation lanes' shape (no foodItemId): byte-identical to no arrangement at all.
  const { foodItemId: _f, createdAt: _c, ...legacy } = DOWN_ALL_ALONG
  assert.deepEqual(detectIntakeDecline(input('cat', meals, [legacy])), none)
  // No created_at: the span opens once active_from has ended everywhere (the documented
  // fallback); a bowl down since June covers the July meals either way.
  const fallback = { ...DOWN_ALL_ALONG, createdAt: null }
  assert.deepEqual(detectIntakeDecline(input('cat', meals, [fallback])), detectIntakeDecline(input('cat', meals, [DOWN_ALL_ALONG])))
  // A null food on a meal never matches a bowl.
  const unidentified = meals.map((m) => ({ ...m, foodItemId: null }))
  assert.deepEqual(detectIntakeDecline(input('cat', unidentified, [DOWN_ALL_ALONG])), detectIntakeDecline(input('cat', unidentified)))
})

Deno.test('CUL-1086 — the Signal\'s entry point hands the engine each bowl\'s food and both instants', () => {
  // Driven, not scanned: the mapper (moved to pipeline.ts by PR-11b) turns rows into arrangements.
  const [a] = mapArrangementRows([{
    id: 'a1', food_item_id: KIBBLE, created_at: '2026-07-10T14:00:00.000Z', is_shared: false,
    active_from: '2026-07-10', active_until: '2026-07-12', ended_at: '2026-07-12T09:30:00.000Z',
    food_items: { primary_protein: 'chicken', proteins: ['chicken'] },
  }])
  assert.equal(a.foodItemId, KIBBLE)
  assert.equal(a.createdAt, '2026-07-10T14:00:00.000Z')
  assert.equal(a.endedAt, '2026-07-12T09:30:00.000Z')
  // The one thing a test cannot drive is the query, so its column list is pinned: without the
  // two instants every span falls back to its dates (a source scan, stated as one).
  const src = Deno.readTextFileSync(new URL('./index.ts', import.meta.url))
  // The column list only, so the paged form's `{ count: 'exact' }` argument (CUL-989) matches too.
  const select = src.match(/\.from\('feeding_arrangements'\)\s*\.select\(\s*'([^']*)'/)
  assert.ok(select, 'the arrangements query is where this pin expects it')
  assert.match(select[1], /\bcreated_at\b/)
  assert.match(select[1], /\bended_at\b/)
})
