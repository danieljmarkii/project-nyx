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
//   · SET IF ABSENT just before the events or meals drain pushes a row, so a kill between
//     the write and the first marker cannot leave a landed row nobody owes a rebuild for;
//   · the visits drain does the same, and while it is pushing NO rebuild may settle a debt
//     (`visitPushInFlight`): no rebuild flushes visits, so one could otherwise read before a
//     visit landed and settle the token after (adversarial passes 1 and 2, B1). It writes a
//     fresh token once a correction lands, before the rebuild it arms;
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
 *  Keeps an existing token, so a rebuild that captured it (and flushes these very rows, as
 *  `runRegen` does for events and meals) still clears it, and a push that keeps failing mints
 *  nothing new to rebuild for (CUL-2845's class). Returns the pets it newly owed: nothing armed
 *  a rebuild for those (the write's own mark was lost to a kill), so the caller nudges Home to
 *  re-read once the rows land. The visits drain calls it inside `beginVisitPush`, since no
 *  rebuild flushes visits. */
export async function markSignalUnseenIfAbsent(petIds: readonly string[]): Promise<string[]> {
  const pets = [...new Set(petIds.filter((p) => typeof p === 'string' && p.length > 0))];
  const owed: string[] = [];
  for (const petId of pets) {
    const res = await getDb().runAsync(
      `INSERT OR IGNORE INTO signal_unseen_writes (pet_id, token) VALUES (?, ?)`,
      [petId, uuid()],
    );
    if ((res as { changes?: number } | undefined)?.changes) owed.push(petId);
  }
  return owed;
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
 *  unsent (the build read the server, which does not hold it yet). A row the server REFUSED
 *  for good (`sync_error` set) does not hold it: no rebuild will ever read that row, the build
 *  was told of it (`refusedRows`, the short expiry and no reassurance), and the saved moment
 *  still reads it as open (`readSignalRecordGaps`). Held, it would rebuild on every launch. */
export async function clearSignalUnseen(petId: string, token: string): Promise<void> {
  await getDb().runAsync(
    // visit-read: anyContact — only whether ANY row for the pet is still unsent; a visit of any channel the build has not read keeps the debt.
    `DELETE FROM signal_unseen_writes
      WHERE pet_id = ? AND token = ?
        AND NOT EXISTS (SELECT 1 FROM events WHERE pet_id = ? AND synced = 0 AND sync_error IS NULL)
        AND NOT EXISTS (SELECT 1 FROM meals WHERE pet_id = ? AND synced = 0 AND sync_error IS NULL)
        AND NOT EXISTS (SELECT 1 FROM vet_visits WHERE pet_id = ? AND synced = 0 AND sync_error IS NULL)`,
    [petId, token, petId, petId, petId],
  );
}

// ── A visits push in progress (adversarial pass 2, B1) ──────────────────────────────────
// `runRegen` flushes events and meals, never visits. So a rebuild that read the server before a
// visit landed could settle the pet's debt after it landed, and a kill before the drain wrote
// its post-landing token would lose the correction. While any visits push runs, no rebuild
// settles a debt; the drain ends by owing a fresh token (a correction landed) or nudging Home
// (one landed and armed nothing), so the cost is at most one extra rebuild. Memory only: a
// killed app has no push in progress, and the debt stays on disk.
let visitPushesInFlight = 0;

/** A visits push starts; call the returned function once it ends (it is idempotent). */
export function beginVisitPush(): () => void {
  visitPushesInFlight += 1;
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    visitPushesInFlight -= 1;
  };
}

/** True while a visits push is running in this process. */
export function visitPushInFlight(): boolean {
  return visitPushesInFlight > 0;
}
