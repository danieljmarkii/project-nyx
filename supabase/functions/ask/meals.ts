// Ask's meal read: the select and the row mapping, out of `index.ts` so a test can drive
// the real mapper (CUL-2052 code review). A MIXED BOWL goes through the server's one bowl
// read (`_shared/mealBowl.ts`): every food named, the union of their proteins, and no
// single food id (T2). The tools keep it out of every per-food and per-protein finished
// rate (spec §5.4).
import { bowlFoodType, bowlOf, MEAL_BOWL_SELECT, type MealComponentJoin } from '../_shared/mealBowl.ts'
import type { AskMealRow } from './tools.ts'

const FOOD_COLUMNS = 'primary_protein, proteins, food_type, brand, product_name'

/** Meal events with their food/protein/intake join, and a mixed bowl's components. */
export const ASK_MEALS_SELECT =
  `id, occurred_at, occurred_at_confidence, event_attachments(id), meals(food_item_id, intake_rating, component_count, food_items(${FOOD_COLUMNS})), ` +
  MEAL_BOWL_SELECT(FOOD_COLUMNS)

export type AskFoodItemDb = {
  primary_protein: string | null
  proteins: string[] | null
  food_type: string | null
  brand: string | null
  product_name: string | null
}
type MealJoinDb = {
  food_item_id: string | null
  intake_rating: string | null
  component_count?: number | null
  food_items: AskFoodItemDb | AskFoodItemDb[] | null
}
export type AskMealRowDb = {
  id: string
  occurred_at: string
  occurred_at_confidence: string | null
  event_attachments: { id: string }[] | null
  meals: MealJoinDb | MealJoinDb[] | null
  meal_components?: MealComponentJoin<AskFoodItemDb>[] | null
}

function first<T>(v: T | T[] | null | undefined): T | null {
  if (v === null || v === undefined) return null
  return Array.isArray(v) ? v[0] ?? null : v
}

function foodLabelOf(fi: AskFoodItemDb | null): string | null {
  return fi ? `${fi.brand ?? ''} ${fi.product_name ?? ''}`.trim() || null : null
}

export function mapAskMealRows(rows: readonly AskMealRowDb[]): AskMealRow[] {
  return rows.map((r): AskMealRow => {
    const meal = first(r.meals)
    const hasPhoto = Array.isArray(r.event_attachments) && r.event_attachments.length > 0
    const occurredAtConfidence = (r.occurred_at_confidence ?? null) as AskMealRow['occurredAtConfidence']
    const bowl = bowlOf(meal, r.meal_components)
    if (bowl) {
      const parts = bowl.components.map((c) => ({
        foodItemId: c.foodItemId,
        foodLabel: foodLabelOf(c.food) ?? c.foodLabel,
        foodType: c.food?.food_type ?? null,
        primaryProtein: c.food?.primary_protein ?? null,
        proteins: c.food?.proteins ?? null,
      }))
      return {
        id: r.id,
        occurredAt: r.occurred_at,
        occurredAtConfidence,
        foodItemId: null,
        foodLabel: `${parts.map((p) => p.foodLabel).join(' + ')}, mixed`,
        foodType: bowlFoodType(parts.map((p) => p.foodType)),
        primaryProtein: null,
        proteins: [...new Set(parts.flatMap((p) => [...(p.primaryProtein ? [p.primaryProtein] : []), ...(p.proteins ?? [])]))],
        intakeRating: meal?.intake_rating ?? null,
        note: null,
        hasPhoto,
        deletedAt: null,
        bowl: { status: bowl.status, components: parts.map(({ foodItemId, foodLabel, foodType }) => ({ foodItemId, foodLabel, foodType })) },
      }
    }
    const fi = first(meal?.food_items)
    return {
      id: r.id,
      occurredAt: r.occurred_at,
      occurredAtConfidence,
      foodItemId: meal?.food_item_id ?? null,
      foodLabel: foodLabelOf(fi),
      foodType: fi?.food_type ?? null,
      primaryProtein: fi?.primary_protein ?? null,
      // B-467: the full captured protein set rides beside the primary so topProteins pools
      // hidden secondaries — read through readProteinSet inside the tool, never here.
      proteins: fi?.proteins ?? null,
      intakeRating: meal?.intake_rating ?? null,
      note: null, // aggregates carry no note (scoped-retrieval §6.1); event notes ride recall
      hasPhoto,
      deletedAt: null,
    }
  })
}
