// Mixed meals row 3 (CUL-2052): Ask reads a bowl.
//
// Spec docs/nyx-mixed-meals-requirements.md §5.4 and §8: a bowl's one rating is a fact
// about the pet, never an acceptance claim about either food, so mixed bowls stay out of
// every per-food and per-protein finished rate; a food fed mixed still counts as fed.
import { strict as assert } from 'node:assert'
import { topFoods, topProteins, type AskMealRow, type RankedFoodEntry, type RankedProteinEntry } from './tools.ts'

const NOW_MS = Date.parse('2026-07-15T12:00:00Z')
const day = (d: number, h = 8) => `2026-07-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00Z`

function plain(d: number, id: string, label: string, protein: string, rating: string | null): AskMealRow {
  return {
    id: `p-${d}-${id}`, occurredAt: day(d), foodItemId: id, foodLabel: label, foodType: 'meal',
    primaryProtein: protein, proteins: [protein], intakeRating: rating, deletedAt: null,
  }
}

function mix(d: number, rating: string | null): AskMealRow {
  return {
    id: `m-${d}`, occurredAt: day(d, 18), foodItemId: null, foodLabel: 'Rabbit + Chicken, mixed', foodType: 'meal',
    primaryProtein: null, proteins: ['rabbit', 'chicken'], intakeRating: rating, deletedAt: null,
    bowl: {
      status: 'mix',
      components: [
        { foodItemId: 'rab', foodLabel: 'Rabbit', foodType: 'meal' },
        { foodItemId: 'chk', foodLabel: 'Chicken', foodType: 'meal' },
      ],
    },
  }
}

// Chicken eaten well on its own four times; refused in every one of six mixed bowls.
const MEALS: AskMealRow[] = [
  ...[2, 3, 4, 5].map((d) => plain(d, 'chk', 'Chicken', 'chicken', 'all')),
  ...[6, 7, 8, 9, 10, 11].map((d) => mix(d, 'refused')),
]

Deno.test('a food fed in mixed bowls counts as fed, and its finished rate reads its plain meals only', () => {
  const r = topFoods(MEALS, { window: '30d', nowMs: NOW_MS })
  assert.ok('foods' in r)
  const foods = (r as { foods: RankedFoodEntry[] }).foods
  const chicken = foods.find((f) => f.foodItemId === 'chk')!
  const rabbit = foods.find((f) => f.foodItemId === 'rab')!
  assert.equal(chicken.count, 10)
  assert.equal(chicken.inMixedBowls, 6)
  assert.equal(chicken.finishedRate, 1, 'four plain meals finished; the bowls rate neither food')
  assert.equal(chicken.ratedMeals, 4)
  assert.equal(rabbit.count, 6)
  assert.equal(rabbit.finishedRate, null, 'no plain rabbit meal: no rate, never "refused rabbit"')
})

Deno.test('a mixed bowl is an exposure to every protein in it and a rating of none', () => {
  const r = topProteins(MEALS, { window: '30d', nowMs: NOW_MS })
  const proteins = (r as { proteins: RankedProteinEntry[] }).proteins
  const chicken = proteins.find((p) => p.protein === 'chicken')!
  const rabbit = proteins.find((p) => p.protein === 'rabbit')!
  assert.equal(chicken.count, 10)
  assert.equal(rabbit.count, 6)
  assert.equal(chicken.ratedMeals, 4)
  assert.equal(rabbit.finishedRate, null)
})
