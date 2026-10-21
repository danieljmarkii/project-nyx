// The server's one read of a mixed bowl (Mixed meals row 3, CUL-2052).
import { assertEquals, assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { bowlOf, MEAL_BOWL_SELECT, type MealComponentJoin } from './mealBowl.ts'

interface Food { food_type: string | null }

/** A generation-stamped id (UUIDv7 layout): `ms`, then the shared 12 bits `a`. */
function genId(ms: number, a: number, tail: string): string {
  const t = ms.toString(16).padStart(12, '0')
  return `${t.slice(0, 8)}-${t.slice(8, 12)}-7${a.toString(16).padStart(3, '0')}-8000-${tail.padStart(12, '0')}`
}

function row(over: Partial<MealComponentJoin<Food>> & Pick<MealComponentJoin<Food>, 'id' | 'position'>): MealComponentJoin<Food> {
  return {
    food_item_id: `food-${over.position}`,
    food_label: `Food ${over.position}`,
    share: '0.500',
    share_source: 'preset',
    amount_value: null,
    amount_unit: null,
    updated_at: '2026-10-21T08:00:00+00:00',
    deleted_at: null,
    food_items: { food_type: 'meal' },
    ...over,
  }
}

const MS = Date.UTC(2026, 9, 21, 8)

// Pass 1, break 3: device A takes a food out offline while device B edits the ratio;
// the merge leaves a NULL count over two live components. Live components win.
Deno.test('pass 1: a NULL count over two live components reads as a mix', () => {
  const b = bowlOf(
    { food_item_id: null, component_count: null },
    [row({ id: genId(MS, 1, '1'), position: 0 }), row({ id: genId(MS, 1, '2'), position: 1 })],
  )
  assertStrictEquals(b?.status, 'mix')
  assertStrictEquals(b?.consistent, false)
  assertEquals(b?.components.map((c) => c.foodItemId), ['food-0', 'food-1'])
})

Deno.test('a plain meal is not a bowl', () => {
  assertStrictEquals(bowlOf({ food_item_id: 'f', component_count: null }, []), null)
  assertStrictEquals(bowlOf({ food_item_id: 'f' }, undefined), null)
})

Deno.test('a count of 2 over one live component is incomplete, never one food', () => {
  const b = bowlOf({ food_item_id: null, component_count: 2 }, [row({ id: genId(MS, 1, '1'), position: 0 })])
  assertStrictEquals(b?.status, 'incomplete')
})

Deno.test('the newest whole generation wins; an older set never unions in', () => {
  const b = bowlOf({ food_item_id: null, component_count: 2 }, [
    row({ id: genId(MS, 1, 'a'), position: 0, food_item_id: 'old-0' }),
    row({ id: genId(MS, 1, 'b'), position: 1, food_item_id: 'old-1' }),
    row({ id: genId(MS, 1, 'c'), position: 2, food_item_id: 'old-2' }),
    row({ id: genId(MS + 5, 2, 'd'), position: 0, food_item_id: 'new-0' }),
    row({ id: genId(MS + 5, 2, 'e'), position: 1, food_item_id: 'new-1' }),
  ])
  assertEquals(b?.components.map((c) => c.foodItemId), ['new-0', 'new-1'])
  assertStrictEquals(b?.writtenAtMs, MS + 5)
})

Deno.test('the composition key is order-free and the ratio key separates a step', () => {
  const a = bowlOf({ food_item_id: null, component_count: 2 }, [
    row({ id: genId(MS, 1, '1'), position: 0, food_item_id: 'rabbit', share: '0.667' }),
    row({ id: genId(MS, 1, '2'), position: 1, food_item_id: 'chicken', share: '0.333' }),
  ])!
  const b = bowlOf({ food_item_id: null, component_count: 2 }, [
    row({ id: genId(MS, 1, '1'), position: 0, food_item_id: 'chicken', share: '0.25' }),
    row({ id: genId(MS, 1, '2'), position: 1, food_item_id: 'rabbit', share: '0.75' }),
  ])!
  assertStrictEquals(a.compositionKey, b.compositionKey)
  assertStrictEquals(a.compositionKeyWithRatio === b.compositionKeyWithRatio, false)
})

Deno.test('a purged component keeps its snapshot label and no food row', () => {
  const b = bowlOf({ food_item_id: null, component_count: 2 }, [
    row({ id: genId(MS, 1, '1'), position: 0, food_item_id: null, food_label: 'Old Chicken', food_items: null }),
    row({ id: genId(MS, 1, '2'), position: 1 }),
  ])!
  assertStrictEquals(b.components[0].foodLabel, 'Old Chicken')
  assertStrictEquals(b.components[0].food, null)
  assertStrictEquals(b.components[0].foodKey, 'label:old chicken')
})

Deno.test('the select names every column the read rule needs', () => {
  for (const col of ['id', 'position', 'food_item_id', 'food_label', 'share', 'updated_at', 'deleted_at']) {
    assertStrictEquals(MEAL_BOWL_SELECT('food_type').includes(col), true, col)
  }
})
