import { getDb } from './db';
import { uuid } from './utils';

// CUL-2846: "this phone owes the pet's Signal a rebuild", kept on disk so it outlives the app.
//
// Home's backstops used to decide that from TIME: a write newer than the cached Signal's
// `generated_at` is one the build never read. But a write's time is the phone's clock and the
// Signal's is the server's, and the server only re-stamps `updated_at` on an UPDATE (never an
// INSERT), so on a phone running five minutes slow a correction made after the build sorted
// before it. Killed before its own rebuild, the app reopened on a stale "with your vet".
//
// This answers the same question with no clock at all:
//   · SET (a fresh token) by every write that arms a rebuild (`triggerSignalRegenDebounced`);
//   · SET IF ABSENT just before a drain pushes a row, so a kill between the write and the
//     first marker cannot leave a landed row nobody owes a rebuild for;
//   · CLEARED only by a rebuild that succeeded, only for the token it captured before it
//     flushed the queue (a write made mid-rebuild sets a new token and survives), and only
//     while nothing for the pet is still unsent (the build could not have read it).
// A failed write of the marker falls back to the time checks it sits beside (warned, never
// thrown); a failed READ of it answers "owed", the louder reading.
//
// Account state: wiped on sign-out (LOCAL_WIPE_TABLES). Local only, never synced.

/** A write armed a rebuild for the pet: owe it, under a token no earlier rebuild holds. */
export async function markSignalUnseen(petId: string): Promise<void> {
  await getDb().runAsync(
    `INSERT INTO signal_unseen_writes (pet_id, token) VALUES (?, ?)
       ON CONFLICT(pet_id) DO UPDATE SET token = excluded.token`,
    [petId, uuid()],
  );
}

/** A drain is about to push rows for these pets: owe a rebuild unless one is already owed.
 *  Keeps an existing token, so a rebuild that captured it (and flushes these very rows) still
 *  clears it. */
export async function markSignalUnseenIfAbsent(petIds: readonly string[]): Promise<void> {
  const pets = [...new Set(petIds.filter((p) => typeof p === 'string' && p.length > 0))];
  for (const petId of pets) {
    await getDb().runAsync(
      `INSERT OR IGNORE INTO signal_unseen_writes (pet_id, token) VALUES (?, ?)`,
      [petId, uuid()],
    );
  }
}

/** The token owed for the pet, or null when no rebuild is owed. Throws on a local read failure. */
export async function readSignalUnseenToken(petId: string): Promise<string | null> {
  const rows = await getDb().getAllAsync<{ token: string }>(
    `SELECT token FROM signal_unseen_writes WHERE pet_id = ? LIMIT 1`,
    [petId],
  );
  return rows[0]?.token ?? null;
}

/** A rebuild that captured `token` succeeded: settle it, unless a row for the pet is still
 *  unsent (the build read the server, which does not hold it yet). */
export async function clearSignalUnseen(petId: string, token: string): Promise<void> {
  await getDb().runAsync(
    // visit-read: anyContact — only whether ANY row for the pet is still unsent; a visit of any channel the build has not read keeps the debt.
    `DELETE FROM signal_unseen_writes
      WHERE pet_id = ? AND token = ?
        AND NOT EXISTS (SELECT 1 FROM events WHERE pet_id = ? AND synced = 0)
        AND NOT EXISTS (SELECT 1 FROM meals WHERE pet_id = ? AND synced = 0)
        AND NOT EXISTS (SELECT 1 FROM vet_visits WHERE pet_id = ? AND synced = 0)`,
    [petId, token, petId, petId, petId],
  );
}
