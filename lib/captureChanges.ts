import { getDb } from './db';
import { syncPendingCaptureChanges } from './sync';
import { uuid } from './utils';

/**
 * Capture changes (FAB PR-29, CUL-1656; migration 091): the day each pet's capture
 * surface first offered a change, so the vet report can disclose it beside the counts
 * the change affects (CUL-1655, PM ruling D6).
 *
 * The keys mirror 091's CHECK on `capture_changes.change_key`, pinned by
 * captureChanges.test.ts, so a writer can never queue a row the server refuses with a
 * terminal 23514. A new change adds its key here AND in a migration, in that PR.
 */
export const CAPTURE_CHANGE_KEYS = [
  // The fan's stool pill split into Normal and Loose (PR-29b).
  'fab_stool_split',
] as const;

export type CaptureChangeKey = (typeof CAPTURE_CHANGE_KEYS)[number];

/**
 * Write `key`'s row for every pet in `petIds` that lacks one on this phone, dated `at`,
 * then push (FAB PR-29b, CUL-1657). Returns how many rows it wrote.
 *
 * The caller passes every pet of the account, because the surface it changed is the
 * same for all of them (the fan offers whichever pet is active): the day it first shows,
 * every pet's surface changed. A pet that arrives later (a new one, or an archived one
 * brought back) gets its row the next time the surface shows, which is still no later
 * than the first tap it can take there.
 *
 * PR-29's contract (its comment on CUL-1657):
 * - A FRESH id for every row. The push counts any 23505 as landed, so one id shared by
 *   two pets would mark the second pet's row synced without it ever reaching the server.
 * - Only pets already on the server. Pets are written remote-first, so every id in the
 *   pet store is one the server holds; a pet it has not seen would earn a terminal 42501.
 * - INSERT OR IGNORE on the local UNIQUE (pet_id, change_key), so the first date stands
 *   on this phone; a phone that writes again after a sign-out wipe meets the server's
 *   23505, which keeps the server's first date.
 * - `first_seen_at` is the phone's ISO clock. PR-29c reads LEAST(first_seen_at, created_at).
 *
 * The push is fire-and-forget: the row is queued locally first, so a failed push is
 * retried by the next sync like every other queue, and its failure is logged, never lost.
 */
export async function recordCaptureChange(
  key: CaptureChangeKey,
  petIds: readonly string[],
  at: Date = new Date(),
): Promise<number> {
  const unique = [...new Set(petIds)];
  if (unique.length === 0) return 0;
  const db = getDb();
  const marks = unique.map(() => '?').join(', ');
  const have = await db.getAllAsync<{ pet_id: string }>(
    `SELECT pet_id FROM capture_changes WHERE change_key = ? AND pet_id IN (${marks})`,
    [key, ...unique],
  );
  const written = new Set(have.map((r) => r.pet_id));
  const firstSeenAt = at.toISOString();
  let wrote = 0;
  for (const petId of unique) {
    if (written.has(petId)) continue;
    const { changes } = await db.runAsync(
      `INSERT OR IGNORE INTO capture_changes (id, pet_id, change_key, first_seen_at) VALUES (?, ?, ?, ?)`,
      [uuid(), petId, key, firstSeenAt],
    );
    wrote += changes;
  }
  if (wrote > 0) {
    syncPendingCaptureChanges().catch((err) => {
      console.warn('[captureChanges] push failed; the row stays queued for the next sync', err);
    });
  }
  return wrote;
}
