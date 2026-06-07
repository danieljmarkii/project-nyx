// Single owner of the meal-write side-effects (B-059).
//
// A meal can be logged from three entry points — the full log flow
// (app/log.tsx), the quick-log FAB (components/log/FAB.tsx), and the photo
// capture flow (app/food-capture.tsx). Each used to hand-write the same
// event+meal INSERTs, the food_items_cache touch, the sync push, AND remember
// to fire the AI-Signal regen. They drifted: only app/log.tsx fired the regen,
// so meals logged from the FAB or photo paths left the home Signal stale until
// the 24h cache expiry (the bug that made a B-052 deploy verification look like
// a no-op). This helper owns all of those side-effects so a new entry point
// physically cannot forget one.
//
// Scope (deliberate): the durable writes + the two fire-and-forget freshness
// side-effects. The in-memory store update (prependEvent) and the post-log
// toast stay with the caller — they are UI concerns that legitimately differ
// per surface, and keeping them out keeps lib/ free of a store dependency. Each
// caller still calls prependEvent with the ids this helper returns.

import { getDb } from './db';
import { syncPendingEvents, syncPendingMeals } from './sync';
import { triggerSignalRegenDebounced } from './signal';
import { uuid } from './utils';

export interface InsertMealParams {
  petId: string;
  foodId: string;
  // The meal's occurrence time (seeded from EXIF, the time picker, or now()).
  occurredAt: Date;
  // Provenance of occurredAt for the audit/attribution trail.
  occurredAtSource: 'manual' | 'exif' | 'now';
}

export interface InsertMealResult {
  eventId: string;
  mealId: string;
  // ISO occurred_at written to the row — use this for prependEvent/toast so the
  // store mirrors the DB exactly.
  occurredAtIso: string;
  // ISO created_at/updated_at written to the rows.
  now: string;
}

// Write a meal (its parent event + the meal row), touch the food's recency,
// push it to Supabase, and refresh the AI Signal. Throws if a local write
// fails so the caller's existing guard (try/catch or finally) can react; the
// sync push + regen are fire-and-forget and never block or throw into the
// caller.
export async function insertMeal(params: InsertMealParams): Promise<InsertMealResult> {
  const { petId, foodId, occurredAt, occurredAtSource } = params;
  const db = getDb();
  const now = new Date().toISOString();
  const occurredAtIso = occurredAt.toISOString();
  const eventId = uuid();
  const mealId = uuid();

  // Event row. Meals are inherently witnessed — you see yourself put the bowl
  // down, so the B-010 "found" path never applies. confidence is therefore
  // always 'witnessed' with no window bounds. Previously only app/log.tsx set
  // this; the FAB + photo paths left occurred_at_confidence NULL — owning it
  // here makes every meal entry point write the same honest confidence.
  await db.runAsync(
    `INSERT INTO events
       (id, pet_id, event_type, occurred_at, severity, notes, source, occurred_at_source,
        occurred_at_confidence, occurred_at_earliest, occurred_at_latest,
        created_at, updated_at, synced)
     VALUES (?, ?, 'meal', ?, NULL, NULL, 'manual', ?, 'witnessed', NULL, NULL, ?, ?, 0)`,
    [eventId, petId, occurredAtIso, occurredAtSource, now, now],
  );

  // Meal row. updated_at is stamped ISO (not SQLite's local-time datetime())
  // so cross-device last-write-wins compares correctly (B-055).
  await db.runAsync(
    `INSERT INTO meals (id, event_id, pet_id, food_item_id, quantity, created_at, updated_at, synced)
     VALUES (?, ?, ?, ?, 'unknown', ?, ?, 0)`,
    [mealId, eventId, petId, foodId, now, now],
  );

  await db.runAsync(
    `UPDATE food_items_cache SET last_used_at = ? WHERE id = ?`,
    [now, foodId],
  );

  // Push immediately (events before meals — meals FK → events.id) so the meal
  // reaches Supabase without waiting for the next foreground/reconnect.
  // Fire-and-forget.
  syncPendingEvents()
    .then(() => syncPendingMeals())
    .catch((e) => console.error('[insertMeal] sync push failed:', e));

  // Freshness (§2): a new meal can change the cached insight set, so refresh
  // the AI Signal. Debounced so a meal + a symptom logged in one sitting
  // collapse into a single regen. Fire-and-forget — home re-reads cache on focus.
  triggerSignalRegenDebounced(petId);

  return { eventId, mealId, occurredAtIso, now };
}
