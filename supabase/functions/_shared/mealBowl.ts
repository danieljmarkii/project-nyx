// The server's one read of a mixed bowl (Mixed meals row 3, CUL-2052; spec
// docs/nyx-mixed-meals-requirements.md §3, §4 and §8).
//
// A mixed bowl is ONE meal event with N `meal_components` rows (T1), and
// `lib/mealComposition.ts` is the only place that decides which rows are the bowl (the
// generations rule, PM 2026-10-21). This module is the server's door to it: one select
// fragment every reader embeds, and one adapter every reader calls. No reader queries a
// component by position, and none falls back to `meals.food_item_id` for a mix (T2).
//
// `meal_components.event_id` references `events`, not `meals`, so the embed sits on the
// EVENT row beside `meals(...)`, and `meals` must also select `component_count`.

import {
  componentFoodKey,
  compositionKey,
  generationMs,
  readMealComposition,
  type MealComponentRow,
  type MealCompositionStatus,
} from '../../../lib/mealComposition.ts'

const COMPONENT_COLUMNS =
  'id, position, food_item_id, food_label, share, share_source, amount_value, amount_unit, updated_at, deleted_at'

/** The `meal_components(...)` embed for an `events` select, with each component's own
 *  food row (`foodColumns` is the reader's usual `food_items` column list). Every row,
 *  tombstones included: the read rule needs them to pick the newest generation. */
export function MEAL_BOWL_SELECT(foodColumns: string): string {
  return `meal_components(${COMPONENT_COLUMNS}, food_items(${foodColumns}))`
}

/** One `meal_components` row as PostgREST returns it, with its embedded food. */
export interface MealComponentJoin<F> extends MealComponentRow {
  food_items?: F | F[] | null
}

export interface BowlComponent<F> {
  position: number
  foodItemId: string | null
  /** The snapshot name: survives a purged food (`food_item_id` SET NULL). */
  foodLabel: string
  /** The component's own food row; null once purged. */
  food: F | null
  /** The owner's share as entered, and normalised over the bowl (null when unknown). */
  share: number | null
  normalizedShare: number | null
  shareSource: string
  amountValue: number | null
  amountUnit: string | null
  /** The component's food identity (Class A key): id, else its folded snapshot name. */
  foodKey: string
}

export interface MealBowl<F> {
  /** `mix`: two or more live components. `incomplete`: the parent or the rows say a
   *  mix and the live set is smaller: never one food, unclassifiable in every reader. */
  status: Exclude<MealCompositionStatus, 'single'>
  consistent: boolean
  components: BowlComponent<F>[]
  /** The sorted set of food keys: the identity of "this mix" for grouping and dedupe. */
  compositionKey: string
  /** The same, with each food's share: a ratio step is a different key (§7.2). */
  compositionKeyWithRatio: string
  /** When the bowl's current set was written (its generation's millisecond); null for
   *  a set no generation stamps. Read for the report's "edited {date}" (§7.3). */
  writtenAtMs: number | null
  /** No component is live and these are the foods as last recorded (CUL-2096); the
   *  bowl is then always `incomplete`. */
  lastRecorded: boolean
}

function firstOf<T>(v: T | T[] | null | undefined): T | null {
  if (v === null || v === undefined) return null
  return Array.isArray(v) ? v[0] ?? null : v
}

/**
 * What this meal is. Null for a plain meal (no live components and no count), which
 * every reader then reads exactly as it did before mixed meals existed. A meal row
 * from a select that did not ask for `component_count` reads the count as NULL, so the
 * components alone decide, which is the rule anyway (§3: live components win).
 */
export function bowlOf<F>(
  meal: { food_item_id?: string | null; component_count?: number | null } | null,
  rows: readonly MealComponentJoin<F>[] | null | undefined,
): MealBowl<F> | null {
  const all = rows ?? []
  const parent = { food_item_id: meal?.food_item_id ?? null, component_count: meal?.component_count ?? null }
  const composition = readMealComposition(parent, all)
  if (composition.status === 'single') return null
  const byId = new Map(all.map((r) => [r.id, r]))
  const components: BowlComponent<F>[] = composition.components.map((c) => ({
    position: c.position,
    foodItemId: c.foodItemId,
    foodLabel: c.foodLabel,
    food: firstOf(byId.get(c.id)?.food_items),
    share: c.share,
    normalizedShare: c.normalizedShare,
    shareSource: c.shareSource,
    amountValue: c.amountValue,
    amountUnit: c.amountUnit,
    foodKey: componentFoodKey(c),
  }))
  return {
    status: composition.status,
    consistent: composition.consistent,
    components,
    compositionKey: compositionKey(composition.components),
    compositionKeyWithRatio: compositionKey(composition.components, { withRatio: true }),
    writtenAtMs: composition.components.length > 0 ? generationMs(composition.components[0].id) : null,
    lastRecorded: composition.lastRecorded,
  }
}

/**
 * A bowl's food type, ONE rule for every reader (code review, CUL-2052): a treat only when
 * EVERY component is one; a meal when any component is; else the first other known type;
 * else null (a type nobody recorded is never assumed a treat, §5.1).
 */
export function bowlFoodType(types: readonly (string | null | undefined)[]): string | null {
  if (types.length > 0 && types.every((t) => t === 'treat')) return 'treat'
  if (types.includes('meal')) return 'meal'
  return types.find((t): t is string => !!t && t !== 'treat') ?? null
}
