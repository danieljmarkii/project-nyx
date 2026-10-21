// The one writer of a mixed bowl's foods (Mixed meals row 2, CUL-2051; spec §4).
//
// `setMealComponents` is the only path that adds, changes or removes a component. The
// rule for which rows ARE the bowl lives in `lib/mealComposition.ts` (generations); this
// file is its local-first half: one transaction over `meal_components` and the parent
// `meals` row, then a push. No caller yet: the writer and its UI are row 5, after every
// clinical reader is mix-aware (T9).
//
// Spec §4's side effects: the trial heads-up re-runs over the new bowl (row 4, CUL-2053,
// below). FAB recency is derived at read from the meal log and lands with its reader in
// row 5.

import { getDb } from './db';
import {
  planComponentWrite,
  MealComponentInputError,
  type ComponentInput,
  type MealComponentRow,
  type MealParent,
} from './mealComposition';

/**
 * The bowl under `eventId` becomes `components`, in position order (position 0 = the food
 * logged first). Two or more foods make a mix (`food_item_id` NULL, `component_count` N);
 * one food leaves a plain meal, indistinguishable from one never mixed; none is refused.
 * Only `food_type = 'meal'` foods that are not toppers can be in a bowl (R1). Returns the
 * parent's new food and count. Throws, writing nothing, on any refusal.
 */
export async function setMealComponents(
  eventId: string,
  components: readonly ComponentInput[],
  now: Date = new Date(),
): Promise<MealParent> {
  const db = getDb();

  // R1: treats, human food and toppers stay their own logs. Read before the transaction;
  // an unknown food (not in this phone's cache) is refused rather than assumed a meal.
  for (const id of new Set(components.map((c) => c.foodItemId))) {
    const food = await db.getFirstAsync<{ food_type: string | null; format: string | null }>(
      'SELECT food_type, format FROM food_items_cache WHERE id = ?',
      [id],
    );
    if (!food || food.food_type !== 'meal' || food.format === 'topper') {
      throw new MealComponentInputError('Only a meal food can be mixed into a bowl');
    }
  }

  const at = now.toISOString();
  let parent: MealParent = { food_item_id: null, component_count: null };
  await db.withTransactionAsync(async () => {
    const meal = await db.getFirstAsync<{ pet_id: string; food_item_id: string | null; component_count: number | null }>(
      'SELECT pet_id, food_item_id, component_count FROM meals WHERE event_id = ?',
      [eventId],
    );
    if (!meal) throw new Error(`No meal row for event ${eventId}`);
    const existing = await db.getAllAsync<MealComponentRow>(
      `SELECT id, position, food_item_id, food_label, share, share_source, amount_value, amount_unit,
              updated_at, deleted_at
         FROM meal_components WHERE event_id = ?`,
      [eventId],
    );
    const plan = planComponentWrite({ existing, components, nowMs: now.getTime() });

    for (const id of plan.tombstoneIds) {
      await db.runAsync(
        `UPDATE meal_components SET deleted_at = ?, updated_at = ?, synced = 0, sync_attempts = 0, sync_error = NULL
          WHERE id = ? AND deleted_at IS NULL`,
        [at, at, id],
      );
    }
    for (const r of plan.inserts) {
      await db.runAsync(
        `INSERT INTO meal_components
          (id, pet_id, event_id, position, food_item_id, food_label, share, share_source,
           amount_value, amount_unit, created_at, updated_at, synced)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0)`,
        [r.id, meal.pet_id, eventId, r.position, r.food_item_id, r.food_label, r.share, r.share_source,
          r.amount_value, r.amount_unit, at, at],
      );
    }

    // The parent is rewritten only when the bowl becomes a mix, stops being one, or changes
    // its number of foods: a ratio edit writes components alone (spec §3), which keeps the
    // whole-row hazard over another phone's intake_rating to those moments.
    parent = plan.parent;
    if (meal.food_item_id !== parent.food_item_id || (meal.component_count ?? null) !== parent.component_count) {
      const res = await db.runAsync(
        `UPDATE meals SET food_item_id = ?, component_count = ?, updated_at = ?, synced = 0, sync_attempts = 0, sync_error = NULL
          WHERE event_id = ?`,
        [parent.food_item_id, parent.component_count, at, eventId],
      );
      // C-39: a zero-row UPDATE is a failure, never a silent success.
      if (!res || res.changes === 0) throw new Error(`No meal row for event ${eventId}`);
    }
  });

  // Lazy: lib/sync.ts sits under the modules this one imports. Fire-and-forget; the queue
  // keeps the rows until they land.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { syncPendingMeals } = require('./sync') as typeof import('./sync');
  syncPendingMeals().catch((e: unknown) => console.warn('[meal components] push failed (queued):', e));
  void rerunTrialHeadsUp(eventId, components, parent);
  return parent;
}

/**
 * Spec §4: the writer re-runs the trial heads-up over the bowl it just wrote, so a food
 * mixed into a meal after the fact is evaluated like one logged with it (§5.2: every
 * component, the offending one named). Fire-and-forget, after the write has landed; it
 * lands only on this meal's card while that card is up (`applyMealTrialFlag`'s gates),
 * and never throws into the save.
 */
async function rerunTrialHeadsUp(
  eventId: string,
  components: readonly ComponentInput[],
  parent: MealParent,
): Promise<void> {
  try {
    const event = await getDb().getFirstAsync<{ pet_id: string; occurred_at: string }>(
      'SELECT pet_id, occurred_at FROM events WHERE id = ?',
      [eventId],
    );
    if (!event) return;
    // Lazy, as above: the heads-up module reaches the card store.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { applyMealTrialFlag } = require('./mealTrialFlag') as typeof import('./mealTrialFlag');
    await applyMealTrialFlag({
      eventId,
      petId: event.pet_id,
      occurredAt: event.occurred_at,
      foodId: parent.food_item_id,
      components:
        parent.component_count !== null
          ? components.map((c) => ({ foodId: c.foodItemId, foodLabel: c.foodLabel }))
          : undefined,
    });
  } catch (e) {
    console.warn('[meal components] trial heads-up re-run failed:', e);
  }
}
