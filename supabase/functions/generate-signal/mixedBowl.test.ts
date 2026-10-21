// Mixed meals row 3 (CUL-2052): the Signal reads a bowl.
//
// Spec docs/nyx-mixed-meals-requirements.md §5.3 (exposure is the union of component
// proteins), §5.4 (Trigger B keeps two histories: each food's single-food meals, and each
// composition key's mixes) and §10. The "pass 1" test was committed failing first.
import { strict as assert } from 'node:assert'
import {
  detectIntakeDecline,
  type DetectionInput,
  type IntakeRating,
  type MealEvent,
  type PetContext,
} from './detection.ts'
import { mapMealRows, MEAL_EVENTS_SELECT, type MealEventRow } from './pipeline.ts'

const at = (day: number, hour = 8): string =>
  `2026-05-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00.000Z`
const NOW = at(30, 12)
const dog: PetContext = { name: 'Mochi', species: 'dog', dietTrialActive: false }

let seq = 0
const plain = (day: number, rating: IntakeRating, foodItemId: string, foodLabel: string, hour = 8): MealEvent => ({
  id: `m${++seq}`,
  occurredAt: at(day, hour),
  foodItemId,
  primaryProtein: null,
  intakeRating: rating,
  foodType: 'meal',
  foodLabel,
})

/** A mixed bowl: no single food id (T2), the composition carried on `bowl`. */
const mix = (day: number, rating: IntakeRating, hour = 8): MealEvent => ({
  id: `m${++seq}`,
  occurredAt: at(day, hour),
  foodItemId: null,
  primaryProtein: null,
  proteins: ['rabbit', 'chicken'],
  intakeRating: rating,
  foodType: 'meal',
  foodLabel: 'Rabbit Pâté mixed with Chicken Pâté',
  bowl: {
    status: 'mix',
    compositionKey: 'id:chicken+id:rabbit',
    components: [
      { foodItemId: 'rabbit', foodLabel: 'Rabbit Pâté' },
      { foodItemId: 'chicken', foodLabel: 'Chicken Pâté' },
    ],
  },
})

const input = (mealEvents: MealEvent[]): DetectionInput => ({
  pet: dog,
  symptomEvents: [],
  mealEvents,
  now: NOW,
})

// Pass 1, break 2: about 12 days of mixes drain every single-food baseline (14 days, 3
// samples), so a Trigger B keyed on single foods alone goes silent for the whole switch.
Deno.test('pass 1: 14 days of mixes only, then a refused mix, fires Trigger B on the composition key', () => {
  const meals: MealEvent[] = []
  for (let d = 16; d <= 29; d++) meals.push(mix(d, 'all'))
  meals.push(mix(30, 'refused'))
  const findings = detectIntakeDecline(input(meals))
  const b = findings.find((f) => f.trigger === 'refused_normal_food')
  assert.ok(b, 'Trigger B fires on the mix history')
  assert.equal(b!.refusedFoodLabel, 'Rabbit Pâté mixed with Chicken Pâté')
})

Deno.test('a refused mix trips Trigger B for a component with a solid single-food history', () => {
  const meals: MealEvent[] = [
    plain(18, 'all', 'chicken', 'Chicken Pâté'),
    plain(20, 'all', 'chicken', 'Chicken Pâté'),
    plain(22, 'most', 'chicken', 'Chicken Pâté'),
    mix(30, 'refused'),
  ]
  const b = detectIntakeDecline(input(meals)).find((f) => f.trigger === 'refused_normal_food')
  assert.ok(b, 'the component history fires')
  // Labelled as the bowl, never as "her usual Chicken".
  assert.equal(b!.refusedFoodLabel, 'Rabbit Pâté mixed with Chicken Pâté')
})

Deno.test('a component eaten well on its own AFTER the refused mix stands the component down', () => {
  const meals: MealEvent[] = [
    plain(18, 'all', 'chicken', 'Chicken Pâté'),
    plain(20, 'all', 'chicken', 'Chicken Pâté'),
    plain(22, 'all', 'chicken', 'Chicken Pâté'),
    mix(30, 'refused', 7),
    plain(30, 'all', 'chicken', 'Chicken Pâté', 10),
  ]
  const b = detectIntakeDecline(input(meals)).find((f) => f.trigger === 'refused_normal_food')
  assert.equal(b, undefined)
})

Deno.test('an incomplete bowl never feeds a per-food or per-mix history', () => {
  const meals: MealEvent[] = []
  for (let d = 16; d <= 29; d++) {
    meals.push({ ...mix(d, 'all'), bowl: { status: 'incomplete', compositionKey: 'id:rabbit', components: [{ foodItemId: 'rabbit', foodLabel: 'Rabbit Pâté' }] } })
  }
  meals.push({ ...mix(30, 'refused'), bowl: { status: 'incomplete', compositionKey: 'id:rabbit', components: [{ foodItemId: 'rabbit', foodLabel: 'Rabbit Pâté' }] } })
  const b = detectIntakeDecline(input(meals)).find((f) => f.trigger === 'refused_normal_food')
  assert.equal(b, undefined)
})

Deno.test('a plain refusal still fires exactly as before (no bowl anywhere)', () => {
  const meals: MealEvent[] = [
    plain(18, 'all', 'F1', 'the turkey pâté'),
    plain(20, 'all', 'F1', 'the turkey pâté'),
    plain(22, 'most', 'F1', 'the turkey pâté'),
    plain(30, 'refused', 'F1', 'the turkey pâté'),
    plain(29, 'all', 'F2', 'the chicken can'),
    plain(30, 'all', 'F2', 'the chicken can'),
  ]
  const b = detectIntakeDecline(input(meals)).find((f) => f.trigger === 'refused_normal_food')
  assert.equal(b?.refusedFoodLabel, 'the turkey pâté')
})

// ── The read: mapMealRows goes through the one bowl adapter ────────────────────

const genId = (ms: number, tail: string) => {
  const t = ms.toString(16).padStart(12, '0')
  return `${t.slice(0, 8)}-${t.slice(8, 12)}-7001-8000-${tail.padStart(12, '0')}`
}
const food = (protein: string, food_type = 'meal') => ({
  primary_protein: protein, proteins: [protein], food_type, format: 'wet', brand: 'B', product_name: protein,
})

Deno.test('a mix maps to the UNION of component proteins and never to the parent food', () => {
  const ms = Date.UTC(2026, 4, 20, 8)
  const row: MealEventRow = {
    id: 'e1',
    occurred_at: at(20),
    occurred_at_confidence: 'witnessed',
    // A stale parent food (an older build's edit) must not stand for the bowl (T2, §8).
    meals: { food_item_id: 'stale', intake_rating: 'all', component_count: 2, food_items: food('beef') },
    meal_components: [
      { id: genId(ms, '1'), position: 0, food_item_id: 'r', food_label: 'Rabbit', share: '0.75', share_source: 'preset', amount_value: null, amount_unit: null, updated_at: at(20), deleted_at: null, food_items: food('rabbit') },
      { id: genId(ms, '2'), position: 1, food_item_id: 'c', food_label: 'Chicken', share: '0.25', share_source: 'preset', amount_value: null, amount_unit: null, updated_at: at(20), deleted_at: null, food_items: food('chicken') },
    ],
  }
  const [m] = mapMealRows([row], new Set())
  assert.equal(m.foodItemId, null)
  assert.equal(m.primaryProtein, null)
  assert.deepEqual([...(m.proteins ?? [])].sort(), ['chicken', 'rabbit'])
  assert.equal(m.bowl?.status, 'mix')
  assert.equal(m.foodLabel, 'B rabbit mixed with B chicken')
})

Deno.test('a plain meal maps exactly as before', () => {
  const row: MealEventRow = {
    id: 'e2', occurred_at: at(20), occurred_at_confidence: null,
    meals: { food_item_id: 'f', intake_rating: null, food_items: food('duck') },
    meal_components: [],
  }
  const [m] = mapMealRows([row], new Set())
  assert.equal(m.foodItemId, 'f')
  assert.equal(m.bowl, undefined)
})

Deno.test('the meals pull selects the components and the count', () => {
  assert.ok(MEAL_EVENTS_SELECT.includes('component_count'))
  assert.ok(MEAL_EVENTS_SELECT.includes('meal_components('))
})

// ── Adversarial pass 2 (build time) ───────────────────────────────────────────

Deno.test('break 2: two plain and two mixed meals eaten well, then a refused mix, fires for the component', () => {
  const meals: MealEvent[] = [
    plain(18, 'all', 'chicken', 'Chicken Pâté'),
    plain(20, 'all', 'chicken', 'Chicken Pâté'),
    mix(22, 'all'),
    mix(24, 'all'),
    mix(30, 'refused'),
  ]
  const b = detectIntakeDecline(input(meals)).find((f) => f.trigger === 'refused_normal_food')
  assert.ok(b, 'one food\'s record is not split under the floor')
  assert.equal(b!.refusedFoodLabel, 'Rabbit Pâté mixed with Chicken Pâté')
})

Deno.test('break 4: a refused incomplete bowl still trips the food we can see in it', () => {
  const meals: MealEvent[] = [
    plain(18, 'all', 'chicken', 'Chicken Pâté'),
    plain(20, 'all', 'chicken', 'Chicken Pâté'),
    plain(22, 'all', 'chicken', 'Chicken Pâté'),
    plain(24, 'all', 'chicken', 'Chicken Pâté'),
    { ...mix(30, 'refused'), bowl: { status: 'incomplete', compositionKey: 'id:chicken', components: [{ foodItemId: 'chicken', foodLabel: 'Chicken Pâté' }] } },
  ]
  assert.ok(detectIntakeDecline(input(meals)).find((f) => f.trigger === 'refused_normal_food'))
})
