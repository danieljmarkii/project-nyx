// The FAB's recent pills, plain foods AND mixes (Mixed meals row 5, CUL-2054; spec §7.1,
// §7.4, §7.5).
//
// A mix lives as a thing you can repeat in exactly two places, and the FAB is one (§7.4):
// one pill per SET of foods, never per ratio, so a transition's ten days of moving splits
// are one pill, and that pill logs the LATEST split in one press. It reads
// "⅓ Chicken Pâté + ⅔ Rabbit Pâté" and is otherwise an ordinary recent-food pill (§7.5:
// no gold, no new motion). It ages out of the same window as a food: when the mix stops
// being logged, the pill goes (no "transition in progress" state, §7.1).
//
// The window and the order are `fabRecentFoods.ts`'s, unchanged: recency as of today's
// local midnight, so nothing logged today moves a pill (CUL-1647). A food fed only inside
// mixes has no plain pill of its own, because `getRecentFoods` reads a meal's own food and
// a mix names none (T2).
//
// A mix is offered only when it can be logged again exactly: every food still in the
// library (not archived, still a meal food) and the bowl complete on this phone. Anything
// else is left out, which costs one trip through the picker, never a wrong bowl.

import { getDb, getRecentFoods, getRotationFoods, type PickerFood } from './db';
import type { RecentFoodsBounds } from './foodQueries';
import { AMOUNT_UNITS, readMealComposition, type AmountUnit, type MealComponentRow, type ShareSource } from './mealComposition';
import { shareGlyph } from './mealBowlLabel';
import { mixFoodOf } from './mixCard';
import type { ComponentInput } from './mealComposition';

export interface FabMixFood {
  food: PickerFood;
  rowName: string;
  /** This food's share in the latest bowl, normalised (the pill's words). */
  share: number;
  /** The latest bowl's row as written, so a repeat writes the same bowl: its share, how
   *  the owner entered it, and any amounts measured. */
  written: Pick<ComponentInput, 'share' | 'shareSource' | 'amountValue' | 'amountUnit'>;
}

export interface FabMix {
  /** The set of foods, sorted: the pill's identity. */
  key: string;
  foods: FabMixFood[];
}

/** One pill. A mix is carried in the food's own shape so the fan lays it out, deals it
 *  and flies it exactly as a food: `id` is `mix:<key>`, and `mix` says what to write. */
export type FabRecentItem = PickerFood & { mix?: FabMix };

export const MIX_ITEM_PREFIX = 'mix:';

/** The pill's words: "⅓ Chicken Pâté + ⅔ Rabbit Pâté", in the bowl's own order. */
export function fabMixLabel(mix: FabMix): string {
  return mix.foods.map((f) => `${shareGlyph(f.share) ?? ''} ${f.rowName}`.trim()).join(' + ');
}

/** The bowl a mix pill writes: the latest bowl again, exactly as it was entered (a preset
 *  stays a preset, measured amounts stay measured). */
export function fabMixComponents(mix: FabMix): ComponentInput[] {
  return mix.foods.map((f) => {
    const m = mixFoodOf(f.food);
    return { foodItemId: m.foodItemId, foodLabel: m.foodLabel, ...f.written };
  });
}

/** A stored source as the writer takes it; one this build cannot read is the owner's
 *  own estimate, which is what a share with no known stop is. */
function writtenSource(raw: string): Exclude<ShareSource, 'unknown'> {
  return raw === 'preset' || raw === 'amounts' ? raw : 'custom';
}

interface MixMealRow {
  event_id: string;
  occurred_at: string;
  food_item_id: string | null;
  component_count: number | null;
}

/** The recent mixes, newest first, one per set of foods, at most `limit`. */
export async function getRecentMixes(petId: string, bounds: RecentFoodsBounds, limit: number): Promise<{ mix: FabMix; at: string }[]> {
  const db = getDb();
  // Every meal in the window that may be a mix: a parent naming no food, or carrying a
  // count. The composition helper decides; this only narrows the read.
  const meals = await db.getAllAsync<MixMealRow>(
    `SELECT m.event_id, e.occurred_at, m.food_item_id, m.component_count
       FROM meals m
       JOIN events e ON e.id = m.event_id
      WHERE m.pet_id = ?
        AND e.deleted_at IS NULL
        AND (m.food_item_id IS NULL OR m.component_count IS NOT NULL)
        AND julianday(e.occurred_at) >= julianday(?) AND julianday(e.occurred_at) < julianday(?)
      ORDER BY e.occurred_at DESC`,
    [petId, bounds.after, bounds.before],
  );
  const out: { mix: FabMix; at: string }[] = [];
  const seen = new Set<string>();
  for (const meal of meals) {
    if (out.length >= limit) break;
    const rows = await db.getAllAsync<MealComponentRow>(
      `SELECT id, position, food_item_id, food_label, share, share_source, amount_value, amount_unit,
              updated_at, deleted_at
         FROM meal_components WHERE event_id = ?`,
      [meal.event_id],
    );
    const read = readMealComposition({ food_item_id: meal.food_item_id, component_count: meal.component_count }, rows);
    if (read.status !== 'mix') continue;
    if (read.components.some((c) => !c.foodItemId || c.normalizedShare === null)) continue;
    const ids = read.components.map((c) => c.foodItemId as string);
    const key = [...ids].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const foods: FabMixFood[] = [];
    for (const c of read.components) {
      const food = await db.getFirstAsync<PickerFood & { archived_at: string | null }>(
        `SELECT id, brand, product_name, format, food_type, photo_path, archived_at
           FROM food_items_cache WHERE id = ?`,
        [c.foodItemId],
      );
      if (!food || food.archived_at !== null || food.food_type !== 'meal' || food.format === 'topper') break;
      const { archived_at: _a, ...picker } = food;
      foods.push({
        food: picker,
        rowName: mixFoodOf(picker).rowName,
        share: c.normalizedShare as number,
        written: {
          share: c.share as number,
          shareSource: writtenSource(c.shareSource),
          amountValue: c.amountValue,
          amountUnit: (AMOUNT_UNITS as readonly string[]).includes(c.amountUnit ?? '') ? (c.amountUnit as AmountUnit) : null,
        },
      });
    }
    if (foods.length !== read.components.length) continue;
    out.push({ mix: { key, foods }, at: meal.occurred_at });
  }
  return out;
}

/**
 * The FAB's recent pills for one pet: plain foods and mixes in one recency order, newest
 * first, at most `limit`. Foods keep `getRecentFoods`' own order and read; a mix slots in
 * by when it was last logged.
 */
export async function getFabRecentItems(petId: string, bounds: RecentFoodsBounds, limit: number): Promise<FabRecentItem[]> {
  return withRecentMixes(petId, await getRecentFoods(petId, null, limit, bounds), bounds, limit);
}

/**
 * Add the recent mixes to an answered food read. A mix read that fails leaves the foods
 * exactly as read: a missing mix pill costs one trip through the picker, while a failed
 * read that blanked the fan would cost every pill.
 */
export async function withRecentMixes(
  petId: string,
  foods: PickerFood[],
  bounds: RecentFoodsBounds,
  limit: number,
): Promise<FabRecentItem[]> {
  try {
    return await mergeRecentMixes(petId, foods, bounds, limit);
  } catch (e) {
    console.warn('[fab] recent mixes read failed; foods only:', e);
    return foods;
  }
}

/** A mix in the food's own shape, so a fan or a shelf lays it out as a food. */
function mixItem(mix: FabMix): FabRecentItem {
  return {
    id: `${MIX_ITEM_PREFIX}${mix.key}`,
    brand: '',
    product_name: fabMixLabel(mix),
    format: '',
    food_type: 'meal',
    photo_path: null,
    mix,
  };
}

async function mergeRecentMixes(
  petId: string,
  foods: PickerFood[],
  bounds: RecentFoodsBounds,
  limit: number,
): Promise<FabRecentItem[]> {
  const mixes = await getRecentMixes(petId, bounds, limit);
  if (mixes.length === 0) return foods;
  const db = getDb();
  const lastAt = new Map<string, string>();
  for (const f of foods) {
    const row = await db.getFirstAsync<{ at: string | null }>(
      `SELECT MAX(e.occurred_at) AS at
         FROM meals m JOIN events e ON e.id = m.event_id
        WHERE m.pet_id = ? AND m.food_item_id = ? AND e.deleted_at IS NULL
          AND julianday(e.occurred_at) >= julianday(?) AND julianday(e.occurred_at) < julianday(?)`,
      [petId, f.id, bounds.after, bounds.before],
    );
    lastAt.set(f.id, row?.at ?? '');
  }
  const items: { item: FabRecentItem; at: number }[] = [
    ...foods.map((f) => ({ item: f as FabRecentItem, at: new Date(lastAt.get(f.id) ?? 0).getTime() || 0 })),
    ...mixes.map(({ mix, at }) => ({ item: mixItem(mix), at: new Date(at).getTime() })),
  ];
  // Parse both sides (C-40): a hydrated and a local timestamp spell one instant two ways.
  items.sort((a, b) => b.at - a.at);
  return items.slice(0, limit).map((x) => x.item);
}

/** A Julian day as epoch milliseconds (SQLite's julianday(), the rotation read's clock). */
function julianToMs(jd: number): number {
  return (jd - 2440587.5) * 86400000;
}

/**
 * The picker's "{Pet}'s rotation" shelf (CUL-2090; spec §7.4): the second place a mix
 * lives as a thing you can repeat. The foods this pet was fed in the last `daysBack` days,
 * mixed bowls included (`rotationFoodsQuery`), and the recent mixes as items of their own,
 * one per set of foods, logging the latest split, by the FAB's own read and rules. One
 * recency order, newest first, at most `limit`. A mix read that fails leaves the foods.
 */
export async function getPickerRotationItems(
  petId: string,
  daysBack: number,
  limit: number,
  nowMs: number = Date.now(),
): Promise<FabRecentItem[]> {
  const foods = await getRotationFoods(petId, daysBack, limit);
  const strip = (f: (typeof foods)[number]): PickerFood => {
    const { last_fed_jd: _jd, ...picker } = f;
    return picker;
  };
  let mixes: { mix: FabMix; at: string }[] = [];
  try {
    // The shelf is "fed lately", so the span runs to now (a bowl logged this morning
    // counts), unlike the FAB's fixed day order. The upper bound is a day ahead so a
    // phone clock a little behind the write never drops it.
    mixes = await getRecentMixes(
      petId,
      { after: new Date(nowMs - daysBack * 86400000).toISOString(), before: new Date(nowMs + 86400000).toISOString() },
      limit,
    );
  } catch (e) {
    console.warn('[picker] recent mixes read failed; foods only:', e);
  }
  if (mixes.length === 0) return foods.map(strip);
  const items: { item: FabRecentItem; at: number }[] = [
    ...foods.map((f) => ({ item: strip(f) as FabRecentItem, at: julianToMs(f.last_fed_jd) })),
    ...mixes.map(({ mix, at }) => ({ item: mixItem(mix), at: new Date(at).getTime() })),
  ];
  items.sort((a, b) => b.at - a.at);
  return items.slice(0, limit).map((x) => x.item);
}
