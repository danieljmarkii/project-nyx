import { getDb } from './db';
import {
  isSignalCacheStale,
  LANDED_READ_RACE_MS,
  readSignalCacheOrLast,
  readSignalRecordGaps,
  type SignalCacheRow,
} from './signal';
import { hasPendingReadFor, readNearBuild } from './readCopy';
import { useSyncStore } from '../store/syncStore';
import { hasLiveWarning } from './vetContactAfter';

// Vet contacts PR-05 (CUL-2767, spec §4.4, mock C4/C5): is anything OPEN for the pets a call,
// text or email was about? The saved moment shows its check only when the answer is a sure no.
//
// "In the cached Signal" (§4.4) is true only of a CURRENT cache, so every way the cache can be
// behind the record counts as open (adversarial pass 1, B2: a cat rated None at breakfast and
// dinner, the call logged a minute later, the rebuild not landed, and the check showed):
//   • no row, or the read threw and nothing answered before (C-12: unread is not empty);
//   • the row is the last one this process answered, not a fresh read (`fromLast`);
//   • the row is past its TTL (`isSignalCacheStale`);
//   • a rebuild for the pet is in flight (`signalAcknowledging`);
//   • the pet's record moved after the row was generated: an event or a meal written later, so
//     the engine has not read it yet. The row's time is the instant the build started reading
//     (CUL-2844), on the SERVER's clock, and the write's is the phone's, so a write inside
//     `LANDED_READ_RACE_MS` before the build counts too (pass 2);
//   • a row on this phone the server has not seen (unsent or refused): the build read an
//     incomplete record (pass 2; the gap read `generate-signal` itself is told about);
//   • a per-incident read that landed after (or just before) the build, or one still pending:
//     a red flag the row cannot hold yet (pass 2; the Signal's own `readNearBuild`).
// And EVERY pet the contact was about (B3: *Also about Juniper*, whose intake card is live, must
// not get a check because Nyx's cache is quiet). Read only: no engine read, no write.

/** An instant from SQLite's `datetime('now')` ('YYYY-MM-DD HH:MM:SS', UTC) or an ISO string. */
function instantMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(' ', 'T')}Z` : value;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/** The newest write to the pet's record, as an instant, or null when there is none. Parsed, never
 *  compared as text (C-40: two spellings of one instant do not sort). */
// The ORDER BY normalises the two spellings to one fixed width (C-40 allows ordering on the
// first 19 chars); the comparison against the cache is on parsed instants.
async function newestRecordWriteMs(petId: string): Promise<number | null> {
  const db = getDb();
  const rows = await Promise.all([
    db.getAllAsync<{ updated_at: string | null; created_at: string | null }>(
      `SELECT updated_at, created_at FROM events WHERE pet_id = ?
        ORDER BY max(replace(substr(coalesce(updated_at, ''), 1, 19), 'T', ' '), replace(substr(coalesce(created_at, ''), 1, 19), 'T', ' ')) DESC LIMIT 1`,
      [petId],
    ),
    db.getAllAsync<{ updated_at: string | null; created_at: string | null }>(
      `SELECT updated_at, created_at FROM meals WHERE pet_id = ?
        ORDER BY max(replace(substr(coalesce(updated_at, ''), 1, 19), 'T', ' '), replace(substr(coalesce(created_at, ''), 1, 19), 'T', ' ')) DESC LIMIT 1`,
      [petId],
    ),
  ]);
  let newest: number | null = null;
  for (const r of rows.flat()) {
    for (const v of [r.updated_at, r.created_at]) {
      const ms = instantMs(v);
      if (ms !== null && (newest === null || ms > newest)) newest = ms;
    }
  }
  return newest;
}

/** One pet: true unless a current cache answered and holds no safety card. */
export async function petHasOpenWarning(petId: string, nowMs: number = Date.now()): Promise<boolean> {
  let row: SignalCacheRow | null;
  let fromLast: boolean;
  try {
    ({ row, fromLast } = await readSignalCacheOrLast(petId));
  } catch (e) {
    console.warn('[vetContactMoment] signal read failed:', e);
    return true;
  }
  if (!row || fromLast || isSignalCacheStale(row, nowMs)) return true;
  if (useSyncStore.getState().signalAcknowledging[petId]) return true;
  if (hasLiveWarning(row)) return true;
  const generated = instantMs(row.generatedAt);
  if (generated === null || !row.generatedAt) return true;
  // The gap read fails closed on its own (an unreadable count is "unsent").
  if ((await readSignalRecordGaps()).unsentRows) return true;
  try {
    const newest = await newestRecordWriteMs(petId);
    if (newest !== null && newest >= generated - LANDED_READ_RACE_MS) return true;
    if (await readNearBuild(petId, row.generatedAt, LANDED_READ_RACE_MS)) return true;
    return await hasPendingReadFor(petId);
  } catch (e) {
    console.warn('[vetContactMoment] record read failed:', e);
    return true;
  }
}

/** Every pet the contact was about: open when any one is. */
export async function contactHasOpenWarning(petIds: readonly string[], nowMs: number = Date.now()): Promise<boolean> {
  if (petIds.length === 0) return true;
  const answers = await Promise.all(petIds.map((id) => petHasOpenWarning(id, nowMs)));
  return answers.some(Boolean);
}
