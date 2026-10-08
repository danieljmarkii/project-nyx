// The call tier this phone has shown for a read (Engines v3 PR-28b, CUL-1436;
// docs/nyx-incident-tiers-requirements.md §8.7, GAP-33). The one module that reads or
// writes `incident_tier_shown`.
//
// WHAT IT IS FOR. One arrival per bout: a re-check that raises several reads announces one,
// and a stored tier arrives only ABOVE what this phone already said, so a tier the phone
// worked out offline is not announced a second time when the server writes the same thing.
//
// RAISE-ONLY. A row moves only to a louder call; a quieter write is a no-op, decided in SQL
// so two writers racing cannot step it down. It records what was SAID, and what was said
// stays said. Only the two call tiers are ever written: nothing calm is announced (n=1
// never reassures), so there is nothing calm to remember.
//
// LOCAL ONLY. Never pushed, wiped at sign-out (LOCAL_WIPE_TABLES). The server's record of
// what was shown, and the owner's own lowering act, are CUL-1437's log.

import { getDb } from './db';
import type { FloorTier } from './incidentFloor';

export type ShownSource = 'device' | 'server';

const RANK_SQL = (col: string) => `CASE ${col} WHEN 'call_now' THEN 2 WHEN 'call_today' THEN 1 ELSE 0 END`;

/** The tier shown for each of these reads; a read never shown is absent. Throws on a local
 *  read failure, which each caller handles on its own terms. */
export async function readShownTiers(eventIds: readonly string[]): Promise<Map<string, FloorTier>> {
  const out = new Map<string, FloorTier>();
  const ids = [...new Set(eventIds)];
  if (ids.length === 0) return out;
  const rows = await getDb().getAllAsync<{ event_id: string; tier: string }>(
    `SELECT event_id, tier FROM incident_tier_shown WHERE event_id IN (${ids.map(() => '?').join(', ')})`,
    ids,
  );
  for (const r of rows) {
    if (r.tier === 'call_now' || r.tier === 'call_today') out.set(r.event_id, r.tier);
  }
  return out;
}

export interface ShownWrite {
  eventId: string;
  petId: string;
  tier: FloorTier;
  source: ShownSource;
}

/** Record what was said. Best-effort: a failure here can only cost a repeated announcement
 *  later, never a missing one, so it is logged and swallowed. */
export async function recordShownTiers(writes: readonly ShownWrite[], nowIso = new Date().toISOString()): Promise<void> {
  if (writes.length === 0) return;
  try {
    const db = getDb();
    for (const w of writes) {
      await db.runAsync(
        `INSERT INTO incident_tier_shown (event_id, pet_id, tier, shown_at, source)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(event_id) DO UPDATE SET
           tier = excluded.tier, shown_at = excluded.shown_at, source = excluded.source
         WHERE ${RANK_SQL('excluded.tier')} > ${RANK_SQL('incident_tier_shown.tier')}`,
        [w.eventId, w.petId, w.tier, nowIso, w.source],
      );
    }
  } catch (e) {
    console.warn('[floor] shown tier not recorded:', e);
  }
}
