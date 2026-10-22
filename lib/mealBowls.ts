// The app's one read of a mixed bowl (Mixed meals row 4, CUL-2053; spec
// docs/nyx-mixed-meals-requirements.md §3, §4, §5 and §8).
//
// A mixed bowl is ONE meal event with N `meal_components` rows (T1), and
// `lib/mealComposition.ts` is the only place that decides which rows are the bowl (the
// generations rule). This module is the phone's door to it, the twin of the server's
// `supabase/functions/_shared/mealBowl.ts`: one read every app reader calls, and one
// resolved shape. A plain meal comes back as nothing, so every reader keeps reading it
// exactly as it did before mixed meals existed. No reader falls back to
// `meals.food_item_id` for a mix (T2): it is NULL there, and the dominant food is for
// display only.
//
// It stays OUT of the C-26 shared boundary on purpose: it reads SQLite. The pure half
// (`bowlFromRows`, `bowlFoodType`, the label) imports nothing that touches a device.

import { getDb } from './db';
import {
  componentFoodKey,
  compositionKey,
  readMealComposition,
  type MealComponentRow,
  type MealCompositionStatus,
  type MealParent,
} from './mealComposition';
import { proteinsFromCacheText } from './protein';

/** One component's own food row, from `food_items_cache`; null once purged or unsynced. */
export interface BowlFood {
  brand: string | null;
  productName: string | null;
  foodType: string | null;
  format: string | null;
  primaryProtein: string | null;
  /** `food_items.proteins` decoded; [] when unknown or empty. */
  proteins: string[];
}

export interface AppBowlComponent {
  position: number;
  foodItemId: string | null;
  /** The snapshot name written with the component: survives a purged food. */
  foodLabel: string;
  food: BowlFood | null;
  /** The owner's share as entered, and over the bowl (null when the ratio is unknown). */
  share: number | null;
  normalizedShare: number | null;
  shareSource: string;
  amountValue: number | null;
  amountUnit: string | null;
  /** The component's food identity (Class A key): id, else its folded snapshot name. */
  foodKey: string;
}

export interface AppBowl {
  /** `mix`: two or more live components. `incomplete`: the parent or the rows say a mix
   *  and the live set is smaller: never one food, never a full mix (§3). */
  status: Exclude<MealCompositionStatus, 'single'>;
  consistent: boolean;
  /** Live components in position order. */
  components: AppBowlComponent[];
  /** The sorted set of food keys: one mix's identity, whatever its ratio. */
  compositionKey: string;
  /** The same with each food's share: a ratio step is a different key (§7.2). */
  compositionKeyWithRatio: string;
  /** No component is live and these are the foods as last recorded (CUL-2096); the
   *  bowl is then always `incomplete`. */
  lastRecorded: boolean;
}

/** A `meal_components` row with its parent's fields and its food's, as the loader reads it. */
export interface BowlRow extends MealComponentRow {
  event_id: string;
  parent_food_item_id: string | null;
  component_count: number | null;
  brand: string | null;
  product_name: string | null;
  food_type: string | null;
  format: string | null;
  primary_protein: string | null;
  proteins: string | null;
  /** Set when the cache row joined; distinguishes "no food row" from a blank one. */
  food_row_id: string | null;
}

/** What one meal is, from its parent and every component row it has. Null for a plain
 *  meal. Pure: the same rule the server's `bowlOf` applies. */
export function bowlFromRows(
  parent: MealParent,
  rows: readonly (MealComponentRow & { food?: BowlFood | null })[],
): AppBowl | null {
  const composition = readMealComposition(parent, rows);
  if (composition.status === 'single') return null;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const components: AppBowlComponent[] = composition.components.map((c) => ({
    position: c.position,
    foodItemId: c.foodItemId,
    foodLabel: c.foodLabel,
    food: byId.get(c.id)?.food ?? null,
    share: c.share,
    normalizedShare: c.normalizedShare,
    shareSource: c.shareSource,
    amountValue: c.amountValue,
    amountUnit: c.amountUnit,
    foodKey: componentFoodKey(c),
  }));
  return {
    status: composition.status,
    consistent: composition.consistent,
    components,
    compositionKey: compositionKey(composition.components),
    compositionKeyWithRatio: compositionKey(composition.components, { withRatio: true }),
    lastRecorded: composition.lastRecorded,
  };
}

/**
 * A bowl's food type, the server's ONE rule (`_shared/mealBowl.ts` `bowlFoodType`,
 * parity-pinned in `mealBowls.test.ts`): a treat only when EVERY component is one; a
 * meal when any component is; else the first other known type; else null (a type nobody
 * recorded is never assumed a treat, §5.1).
 */
export function bowlFoodType(types: readonly (string | null | undefined)[]): string | null {
  if (types.length > 0 && types.every((t) => t === 'treat')) return 'treat';
  if (types.includes('meal')) return 'meal';
  return types.find((t): t is string => !!t && t !== 'treat') ?? null;
}

/** A component's display name: its live food row's brand and product, else the
 *  snapshot name written with it (the server's `componentName`). */
export function componentDisplayName(c: Pick<AppBowlComponent, 'food' | 'foodLabel'>): string {
  const live = `${c.food?.brand ?? ''} ${c.food?.productName ?? ''}`.trim();
  return live || c.foodLabel;
}

/** The union of every component's proteins, primary first per component, deduped. Raw
 *  (not canonicalised): each reader canonicalises inside its own core, as before. */
export function bowlProteins(bowl: AppBowl): string[] {
  const out: string[] = [];
  for (const c of bowl.components) {
    for (const p of [...(c.food?.primaryProtein ? [c.food.primaryProtein] : []), ...(c.food?.proteins ?? [])]) {
      if (!out.includes(p)) out.push(p);
    }
  }
  return out;
}

const COMPONENT_SELECT = `SELECT m.event_id, m.food_item_id AS parent_food_item_id, m.component_count,
       mc.id, mc.position, mc.food_item_id, mc.food_label, mc.share, mc.share_source,
       mc.amount_value, mc.amount_unit, mc.updated_at, mc.deleted_at,
       f.id AS food_row_id, f.brand, f.product_name, f.food_type, f.format,
       f.primary_protein, f.proteins
  FROM meals m
  LEFT JOIN meal_components mc ON mc.event_id = m.event_id
  LEFT JOIN food_items_cache f ON f.id = mc.food_item_id
 WHERE (m.component_count IS NOT NULL OR mc.id IS NOT NULL)
   AND m.event_id IN `;

/** EXPORTED for the real-SQLite test: the production string, run over the app's own
 *  schema constants. Every component row comes back, tombstones included, because the
 *  read rule needs them to find the newest generation. */
export function mealBowlsQuery(n: number): string {
  return `${COMPONENT_SELECT}(${Array.from({ length: n }, () => '?').join(',')})`;
}

const CHUNK = 400;

/**
 * Every MIXED (or incomplete) bowl among `eventIds`, keyed by event id. A plain meal, or
 * an id that is not a meal, is absent from the map. Throws on a failed read: each caller
 * decides what an unread bowl means on its surface (the trial card degrades to null,
 * never to "every meal was one food").
 */
export async function loadMealBowls(
  eventIds: readonly string[],
  db: Pick<ReturnType<typeof getDb>, 'getAllAsync'> = getDb(),
): Promise<Map<string, AppBowl>> {
  const out = new Map<string, AppBowl>();
  const ids = [...new Set(eventIds)];
  if (ids.length === 0) return out;
  const byEvent = new Map<string, { parent: MealParent; rows: (MealComponentRow & { food: BowlFood | null })[] }>();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const rows = (await db.getAllAsync<BowlRow>(mealBowlsQuery(chunk.length), chunk)) ?? [];
    for (const r of rows) {
      let entry = byEvent.get(r.event_id);
      if (!entry) {
        entry = {
          parent: { food_item_id: r.parent_food_item_id ?? null, component_count: r.component_count ?? null },
          rows: [],
        };
        byEvent.set(r.event_id, entry);
      }
      if (r.id === null || r.id === undefined) continue; // a count with no component rows yet
      entry.rows.push({
        id: r.id,
        position: r.position,
        food_item_id: r.food_item_id,
        food_label: r.food_label,
        share: r.share,
        share_source: r.share_source,
        amount_value: r.amount_value,
        amount_unit: r.amount_unit,
        updated_at: r.updated_at,
        deleted_at: r.deleted_at,
        food: r.food_row_id
          ? {
              brand: r.brand,
              productName: r.product_name,
              foodType: r.food_type,
              format: r.format,
              primaryProtein: r.primary_protein,
              proteins: proteinsFromCacheText(r.proteins),
            }
          : null,
      });
    }
  }
  for (const [eventId, { parent, rows }] of byEvent) {
    const bowl = bowlFromRows(parent, rows);
    if (bowl) out.set(eventId, bowl);
  }
  return out;
}
