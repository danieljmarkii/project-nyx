// CUL-2096: a bowl read as its last recorded foods (no component live) is exposure, never a
// candidate of its own. Adversarial pass 1, F1: a protein seen only in that stale set grew
// the Bonferroni family and dropped beef, an unrelated finding, from established to early.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { DEFAULT_CONFIG, detectCorrelations, type MealEvent, type SymptomType } from './detection.ts'

const day0 = Date.UTC(2026, 3, 1)
const t = (n: number, h: number) => new Date(day0 + n * 86_400_000 + h * 3_600_000).toISOString()
let id = 0
const meal = (n: number, h: number, protein: string, over: Partial<MealEvent> = {}): MealEvent => ({
  id: `m${++id}`, occurredAt: t(n, h), foodItemId: protein, primaryProtein: protein, proteins: [protein],
  intakeRating: 'all', foodType: 'meal', foodLabel: protein, ...over,
})
const VOMIT_DAYS = [4, 8, 12, 16, 20, 24, 28, 32]

/** Chicken twice daily for 35 days, beef on six vomit days, lamb twice, plus `extra`. */
function tiers(extra: MealEvent[]): Record<string, string> {
  const meals: MealEvent[] = []
  for (let n = 0; n <= 34; n++) meals.push(meal(n, 8, 'chicken'), meal(n, 18, 'chicken'))
  for (const n of VOMIT_DAYS.slice(0, 6)) meals.push(meal(n, 8, 'beef'))
  for (const n of [1, 13]) meals.push(meal(n, 8, 'lamb'))
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

/** One bowl of kangaroo + chicken on `day`, live or as last recorded. */
function bowl(day: number, lastRecorded: boolean): MealEvent {
  return meal(day, 8, 'x', {
    foodItemId: null, primaryProtein: null, proteins: ['kangaroo', 'chicken'], foodType: 'meal',
    bowl: {
      status: lastRecorded ? 'incomplete' : 'mix', compositionKey: 'id:c+id:k', lastRecorded,
      components: [{ foodItemId: 'k', foodLabel: 'Kangaroo' }, { foodItemId: 'c', foodLabel: 'Chicken' }],
    },
  })
}

Deno.test('a last recorded bowl adds no comparison: beef keeps its tier, on a vomit day or a clean one', () => {
  const baseline = tiers([])
  for (const day of [20, 2]) assertEquals(tiers([bowl(day, true)]).beef, baseline.beef)
})

Deno.test('the same bowl, live, still widens the family (the guard is scoped to the stale set)', () => {
  // Non-vacuity: without the scoping, the stale bowl would read like this one.
  const baseline = tiers([])
  assertEquals(baseline.beef !== tiers([bowl(2, false)]).beef, true)
})
