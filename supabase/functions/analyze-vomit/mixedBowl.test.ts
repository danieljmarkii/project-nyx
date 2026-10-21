// Mixed meals row 3 (CUL-2052): the vomit read's intake arm reads a bowl.
//
// Spec docs/nyx-mixed-meals-requirements.md §8: "the vomit treat test must use any
// non-treat component". A treat finishes at a ceiling and would mask a refusal (the pill
// pocket), so an all-treat bowl must stay out of the Noticed predicate, and a bowl with a
// meal in it must stay in.
import { strict as assert } from 'node:assert'
import { EN5_CONTEXT_STEP, type MealIntakeEventRow } from './context.ts'

const VOMIT = '2026-10-20T12:00:00.000Z'
const hoursBefore = (h: number) => new Date(Date.parse(VOMIT) - h * 3_600_000).toISOString()
const genId = (ms: number, tail: string) => {
  const t = ms.toString(16).padStart(12, '0')
  return `${t.slice(0, 8)}-${t.slice(8, 12)}-7001-8000-${tail.padStart(12, '0')}`
}

function plainMeal(at: string, rating: string): MealIntakeEventRow {
  return { occurred_at: at, meals: { intake_rating: rating, food_item_id: 'f-meal', food_items: { food_type: 'meal' } } }
}

function mixRow(at: string, rating: string, types: [string, string]): MealIntakeEventRow {
  const ms = Date.parse(at)
  return {
    occurred_at: at,
    // A mix names no food (T2): an older select would read it as an unknown food.
    meals: { intake_rating: rating, food_item_id: null, component_count: 2, food_items: null },
    meal_components: types.map((t, i) => ({
      id: genId(ms, String(i + 1)), position: i, food_item_id: `f-${i}`, food_label: `Food ${i}`,
      share: '0.5', share_source: 'preset', amount_value: null, amount_unit: null,
      updated_at: at, deleted_at: null, food_items: { food_type: t },
    })),
  }
}

function fires(meals: MealIntakeEventRow[]): boolean {
  const out = EN5_CONTEXT_STEP({} as never, {
    rows: { vomits: [], lethargy: [], meals },
    thisEventOccurredAt: VOMIT,
    species: 'cat',
    nowMs: Date.parse(VOMIT) + 3_600_000,
    engineFlags: { on: ['engines_v3_en5'], readOk: true } as never,
  })
  return out.en5IntakeFires === true
}

Deno.test('an all-treat mixed bowl eaten well does not push two refusals out of the Noticed three', () => {
  assert.equal(fires([
    plainMeal(hoursBefore(60), 'refused'),
    plainMeal(hoursBefore(50), 'refused'),
    mixRow(hoursBefore(40), 'all', ['treat', 'treat']),
    mixRow(hoursBefore(30), 'all', ['treat', 'treat']),
  ]), true)
})

Deno.test('a mixed bowl with any non-treat component is a qualifying meal', () => {
  // Two meal-bowls eaten well after the refusals: the Noticed three now hold one refusal.
  assert.equal(fires([
    plainMeal(hoursBefore(60), 'refused'),
    plainMeal(hoursBefore(50), 'refused'),
    mixRow(hoursBefore(40), 'all', ['treat', 'meal']),
    mixRow(hoursBefore(30), 'all', ['meal', 'meal']),
  ]), false)
})
