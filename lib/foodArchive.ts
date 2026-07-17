// Food-library archive / restore write logic (B-005 PR 2).
//
// Replaces app/food/[id].tsx's old destructive delete cascade (hard-delete the
// food + soft-delete every referencing meal — "kills all records") with a
// REVERSIBLE archive: flip food_items.archived_at (server) + its food_items_cache
// mirror (local). PR 1 (#385) already filters archived_at at the picker / library
// reads ONLY, so a flipped row simply drops out of the pantry while every logged
// meal, diet trial, feeding arrangement, and the vet report stay untouched — the
// B-005 load-bearing invariant: archive tidies the pantry, never the record.
//
// A single library tile can front several food_items rows: food-capture mints a
// fresh uuid per capture and the library GROUP BYs them (LIBRARY_FOODS_QUERY /
// getLibraryFoods collapse by brand+product). So archiving must cover the whole
// visible group, or the tile lingers with a still-active duplicate behind it —
// the exact group-collapse the old delete handled (by brand+product+format). We
// keep that same grouping for drop-in parity; the archived_at stamp then lets
// Undo reverse precisely the rows this call flipped, and nothing else.
//
// Per-account catalog (B-354): RLS scopes every food_items read/write to the
// caller's own rows, so these updates can only ever touch this account's foods.
// This screen fetches the row from the server first (app/food/[id].tsx), so a row
// reaching archiveFood is server-resident — the update below always finds it, and
// a 0-row result is a genuine RLS block, not an offline-only row.

import { supabase } from './supabase';
import { getDb } from './db';

// The identifying fields of the tapped food — enough to recompute the library
// group (brand+product+format) on both the server and the local cache.
export interface FoodDescriptor {
  id: string;
  brand: string;
  product_name: string;
  format: string;
}

export interface ArchiveResult {
  // Every server-side food_items id this call flipped to archived (the dedup
  // group). Passed back to restoreFood so Undo reverses exactly this set.
  foodIds: string[];
  // The archived_at stamp written to the whole group. restoreFood scopes its
  // revert to rows still carrying this exact stamp, so a later re-archive of a
  // still-active duplicate can never be un-done by a stale Undo.
  archivedAt: string;
  // Carried so restoreFood can re-select the same cache group without the caller
  // re-deriving it.
  descriptor: FoodDescriptor;
}

// Archive a food (and its duplicate captures): set archived_at on the server and
// mirror it into the local cache so the tile drops out of the picker/library at
// once. Throws on a Supabase error or a silent RLS block. Never touches events,
// meals, diet_trials, or feeding_arrangements — the archive is a pantry filter,
// not a history mutation.
export async function archiveFood(row: FoodDescriptor): Promise<ArchiveResult> {
  const archivedAt = new Date().toISOString();

  // 1. Collect every server-side food_items row in the same library group, so a
  //    duplicate capture behind the tile is archived too (else the tile lingers).
  const { data: dupFoods, error: dupErr } = await supabase
    .from('food_items')
    .select('id')
    .eq('brand', row.brand)
    .eq('product_name', row.product_name)
    .eq('format', row.format);
  if (dupErr) throw dupErr;
  const allFoodIds = Array.from(
    new Set([row.id, ...(dupFoods ?? []).map((f) => f.id as string)]),
  );

  // 2. Flip archived_at on the group. .select() so a silent RLS block (supabase-js
  //    returns success with 0 rows affected when a policy denies the write)
  //    surfaces as an error instead of a no-op that looks like success — the same
  //    guard the old delete used.
  const { data: updated, error: updErr } = await supabase
    .from('food_items')
    .update({ archived_at: archivedAt })
    .in('id', allFoodIds)
    .select('id');
  if (updErr) throw updErr;
  if (!updated || updated.length === 0) {
    throw new Error('Server rejected the change (permission denied).');
  }
  const flippedIds = updated.map((f) => f.id as string);

  // 3. Mirror into the local cache by the same group descriptor so the picker /
  //    library (which read the cache) hide the tile immediately — including a
  //    capture that hasn't round-tripped through the server yet. Stamp the same
  //    archivedAt so restore's stamp-match is exact.
  const db = getDb();
  await db.runAsync(
    `UPDATE food_items_cache
        SET archived_at = ?
      WHERE LOWER(brand) = LOWER(?)
        AND LOWER(product_name) = LOWER(?)
        AND format = ?`,
    [archivedAt, row.brand, row.product_name, row.format],
  );

  return { foodIds: flippedIds, archivedAt, descriptor: row };
}

// Restore an archived food: clear archived_at on the server and cache. Reverses
// exactly the rows a prior archiveFood stamped — matched on the returned ids +
// the archived_at stamp — so an Undo can never un-archive a row that a later
// action re-archived. Shared by the Undo snackbar (PR 2) and the future
// Archived-section Restore (PR 3), which passes the same ArchiveResult shape.
export async function restoreFood(result: ArchiveResult): Promise<void> {
  const { foodIds, archivedAt, descriptor } = result;

  const { error: updErr } = await supabase
    .from('food_items')
    .update({ archived_at: null })
    .in('id', foodIds)
    .eq('archived_at', archivedAt)
    .select('id');
  if (updErr) throw updErr;

  const db = getDb();
  await db.runAsync(
    `UPDATE food_items_cache
        SET archived_at = NULL
      WHERE LOWER(brand) = LOWER(?)
        AND LOWER(product_name) = LOWER(?)
        AND format = ?
        AND archived_at = ?`,
    [descriptor.brand, descriptor.product_name, descriptor.format, archivedAt],
  );
}
