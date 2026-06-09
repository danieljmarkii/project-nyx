// Feeding arrangements — pet↔food standing-fact domain types (B-040 R1).
//
// A feeding_arrangement is a STANDING FACT ("{pet} always has access to
// {food}"), set once — not a per-nibble log. See
// docs/nyx-free-feeding-requirements.md §4 (schema) + §3 (the two
// confidence axes) for the model these types mirror.
//
// This module is types-only in PR 1 (schema slice). PR 2 adds the local
// SQLite + sync-queue + query logic alongside these definitions; the row
// shape here is the contract that food-detail capture, History rendering
// (PR 3), and engine ingestion (PR 4) all build against.
//
// Mirrors supabase/migrations/018_feeding_arrangements.sql. Hand-authored
// to match the repo's co-located-domain-type convention (cf. `Pet` in
// store/petStore.ts, the finding types in lib/signal.ts) — the project
// does not use a generated database.types.ts.

// `free_choice` is the R1 capture target (always-available / grazing).
// `meal_fed` is reserved so the vet report can render a complete
// feeding-method picture; R1 does not capture it via UX (§4 / §7).
export type FeedingMethod = 'free_choice' | 'meal_fed';

// One row of feeding_arrangements. Dates are ISO strings (DATE columns);
// timestamps are ISO strings (TIMESTAMPTZ, stored UTC, converted at the
// app layer per the Eng hard constraint).
export interface FeedingArrangement {
  id: string;
  pet_id: string;
  food_item_id: string;
  method: FeedingMethod;
  // Active window. active_until === null means CURRENTLY ACTIVE (the bowl
  // is still down). The window edges are the real lifecycle events
  // History renders as boundary markers.
  active_from: string | null;
  active_until: string | null;
  // Multi-pet shared-bowl hook. INERT in R1 — always false (the capture UX
  // never sets it true). Reserved so the multi-pet attribution sprint is
  // additive.
  is_shared: boolean;
  notes: string | null;
  // Soft delete only — a discontinued arrangement stays for historical
  // correlation context. null === active/not-deleted.
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

// Fields the client supplies when creating an arrangement. The server
// defaults id/method/is_shared/timestamps; PR 2's capture flow sets the
// rest. `method` defaults to 'free_choice' server-side but is accepted
// here for the vet-report-completeness path.
export interface NewFeedingArrangement {
  pet_id: string;
  food_item_id: string;
  method?: FeedingMethod;
  active_from?: string | null;
  active_until?: string | null;
  is_shared?: boolean;
  notes?: string | null;
}

// ── PR 2: local SQLite + sync-queue query/write logic ────────────────────────
//
// The set-once standing-fact capture path. These functions own the local-first
// writes (synced=0 + fire-and-forget push) and the reads the food-detail toggle
// and the food-library "Always available" section build against. The push and
// hydrate live in lib/sync.ts (syncPendingFeedingArrangements /
// hydrateFeedingArrangements); these helpers just write the local row and kick a
// push. Following the supabase-sync skill: every local mutation sets synced=0,
// LWW timestamps are ISO/UTC, and we never INSERT OR REPLACE.

import { getDb } from './db';
import { syncPendingFeedingArrangements } from './sync';
import { uuid } from './utils';

// One currently-active free-choice arrangement joined with its food's display
// fields — what the library "Always available" section renders. A view shape
// (not the raw FeedingArrangement row) because the consumer only needs identity +
// what to show; is_shared/notes/window internals stay in the table.
export interface ActiveArrangementView {
  id: string;
  food_item_id: string;
  active_from: string | null;
  brand: string;
  product_name: string;
  format: string;
}

// Local calendar date 'YYYY-MM-DD' for the active_from/active_until DATE columns.
// Uses the DEVICE-LOCAL day (not UTC) so "since {date}" reads as the day the
// owner actually put the bowl down, not a UTC-rollover off-by-one. Exported for
// the unit test. (created_at/updated_at stay ISO/UTC — only the calendar-day
// window edges use this.)
export function localDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Is this food currently free-fed for this pet? (active = not ended, not
// soft-deleted). Drives the food-detail toggle's on/off state.
export async function isFreeChoiceActive(petId: string, foodItemId: string): Promise<boolean> {
  const db = getDb();
  const row = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM feeding_arrangements
     WHERE pet_id = ? AND food_item_id = ?
       AND method = 'free_choice'
       AND active_until IS NULL
       AND deleted_at IS NULL
     LIMIT 1`,
    [petId, foodItemId],
  );
  return !!row;
}

// All currently-active free-choice arrangements for a pet, with the food's
// display fields, newest-set first. JOINs the global food cache so a food not yet
// in the cache simply doesn't surface (it re-appears after the next sync).
export async function getActiveArrangementsForPet(petId: string): Promise<ActiveArrangementView[]> {
  const db = getDb();
  return db.getAllAsync<ActiveArrangementView>(
    `SELECT fa.id, fa.food_item_id, fa.active_from,
            f.brand, f.product_name, f.format
     FROM feeding_arrangements fa
     JOIN food_items_cache f ON f.id = fa.food_item_id
     WHERE fa.pet_id = ?
       AND fa.method = 'free_choice'
       AND fa.active_until IS NULL
       AND fa.deleted_at IS NULL
     ORDER BY fa.active_from DESC, f.brand COLLATE NOCASE ASC`,
    [petId],
  );
}

// Toggle ON — start a free-choice standing fact for this (pet, food). Idempotent:
// if one is already active we no-op rather than write a duplicate standing fact.
export async function startFreeChoice(petId: string, foodItemId: string): Promise<void> {
  const db = getDb();
  if (await isFreeChoiceActive(petId, foodItemId)) return;
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO feeding_arrangements
       (id, pet_id, food_item_id, method, active_from, active_until, is_shared, notes,
        deleted_at, created_at, updated_at, synced)
     VALUES (?, ?, ?, 'free_choice', ?, NULL, 0, NULL, NULL, ?, ?, 0)`,
    [uuid(), petId, foodItemId, localDateString(), now, now],
  );
  pushArrangements();
}

// Toggle OFF — end the active standing fact. Stamps active_until = today (the
// "stopped" lifecycle boundary History renders in PR 3) and KEEPS the row for
// correlation history; never hard-deletes. No-op if nothing is active.
export async function endFreeChoice(petId: string, foodItemId: string): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE feeding_arrangements
       SET active_until = ?, updated_at = ?, synced = 0
     WHERE pet_id = ? AND food_item_id = ?
       AND method = 'free_choice'
       AND active_until IS NULL
       AND deleted_at IS NULL`,
    [localDateString(), now, petId, foodItemId],
  );
  pushArrangements();
}

// Fire-and-forget push so a toggle reaches Supabase without waiting for the next
// foreground/reconnect — and never throws into the caller's UI handler.
function pushArrangements(): void {
  syncPendingFeedingArrangements().catch((e) =>
    console.error('[feedingArrangements] sync push failed:', e),
  );
}
