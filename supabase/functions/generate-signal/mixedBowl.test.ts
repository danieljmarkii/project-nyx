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
