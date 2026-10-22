// CUL-2096: a bowl read as its last recorded foods (no component live) hands the engine no
// protein, exactly as the all-tombstone bowl did before the fallback. Adversarial passes 1
// and 2 found its stale proteins grew the Bonferroni family (F1) and split a collinear
// cluster (Q2), each dropping beef, an unrelated finding, from established to early.
import { assertEquals, assertNotEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { DEFAULT_CONFIG, detectCorrelations, type MealEvent, type SymptomType } from './detection.ts'
import { mapMealRows, type MealEventRow } from './pipeline.ts'

const day0 = Date.UTC(2026, 3, 1)
const t = (n: number, h: number) => new Date(day0 + n * 86_400_000 + h * 3_600_000).toISOString()
let id = 0
const meal = (n: number, h: number, proteins: string[]): MealEvent => ({
  id: `m${++id}`, occurredAt: t(n, h), foodItemId: proteins.join('+'), primaryProtein: proteins[0], proteins,
  intakeRating: 'all', foodType: 'meal', foodLabel: proteins.join('+'),
})
const VOMIT_DAYS = [4, 8, 12, 16, 20, 24, 28, 32]

/** Chicken twice daily for 35 days, beef on six vomit days, lamb twice, plus `extra`. */
function tiers(extra: MealEvent[]): Record<string, string> {
  const meals: MealEvent[] = []
  for (let n = 0; n <= 34; n++) meals.push(meal(n, 8, ['chicken']), meal(n, 18, ['chicken']))
  for (const n of VOMIT_DAYS.slice(0, 6)) meals.push(meal(n, 8, ['beef']))
  for (const n of [1, 13]) meals.push(meal(n, 8, ['lamb']))
  const findings = detectCorrelations({
    pet: { name: 'Mochi', species: 'dog', dietTrialActive: false },
    symptomEvents: VOMIT_DAYS.map((n) => ({
      id: `v${n}`, type: 'vomit' as SymptomType, occurredAt: t(n, 10), occurredAtConfidence: 'witnessed' as const,
    })),
    mealEvents: [...meals, ...extra],
    now: t(35, 12),
  }, DEFAULT_CONFIG)
  return Object.fromEntries(findings.map((f) => [f.protein, f.tier]))
}

const genId = (ms: number, tail: string) => {
  const h = ms.toString(16).padStart(12, '0')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-7001-8000-${tail.padStart(12, '0')}`
}
const food = (protein: string) => ({
  primary_protein: protein, proteins: [protein], food_type: 'meal', format: 'wet', brand: 'B', product_name: protein,
})

/** One two-food bowl on `day` at 08:00, through the real mapper: live, or every row tombstoned. */
function bowl(day: number, proteins: [string, string], lastRecorded: boolean): MealEvent {
  const at = t(day, 8)
  const ms = Date.parse(at)
  const row: MealEventRow = {
    id: `b${++id}`, occurred_at: at, occurred_at_confidence: 'witnessed',
    meals: { food_item_id: null, intake_rating: 'all', component_count: 2, food_items: null },
    meal_components: proteins.map((p, i) => ({
      id: genId(ms, String(i + 1)), position: i, food_item_id: p, food_label: p, share: '0.500', share_source: 'preset',
      amount_value: null, amount_unit: null, updated_at: at, deleted_at: lastRecorded ? t(day, 9) : null, food_items: food(p),
    })),
  }
  return mapMealRows([row], new Set())[0]
}

Deno.test('a last recorded bowl maps to no protein, still incomplete and still naming its foods', () => {
  const stale = bowl(2, ['kangaroo', 'chicken'], true)
  assertEquals(stale.proteins, [])
  assertEquals(stale.bowl?.status, 'incomplete')
  assertEquals(stale.bowl?.components.map((c) => c.foodItemId), ['kangaroo', 'chicken'])
  assertEquals([...(bowl(2, ['kangaroo', 'chicken'], false).proteins ?? [])].sort(), ['chicken', 'kangaroo'])
})

Deno.test('F1: a stale novel protein adds no comparison: beef keeps its tier, on a vomit day or a clean one', () => {
  const baseline = tiers([])
  assertEquals(baseline.beef, 'established')
  for (const day of [20, 2]) assertEquals(tiers([bowl(day, ['kangaroo', 'chicken'], true)]).beef, baseline.beef)
  // Non-vacuity: the same bowl, live, does widen the family.
  assertNotEquals(tiers([bowl(2, ['kangaroo', 'chicken'], false)]).beef, baseline.beef)
})

Deno.test('Q2: a stale exposure never splits a collinear pair: beef keeps its tier', () => {
  // Lamb meals declare duck too, so duck and lamb cluster as one candidate.
  const duckLamb = [12, 16].map((n) => meal(n, 8, ['lamb', 'duck']))
  const baseline = tiers(duckLamb)
  assertEquals(baseline.beef, 'established')
  assertEquals(tiers([...duckLamb, bowl(20, ['duck', 'chicken'], true)]), baseline)
  // Non-vacuity: the same bowl, live, splits the pair and drops beef.
  assertNotEquals(tiers([...duckLamb, bowl(20, ['duck', 'chicken'], false)]).beef, baseline.beef)
})
