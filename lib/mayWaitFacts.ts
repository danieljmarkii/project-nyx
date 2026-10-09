// What call today's wait line reads from the phone and, for the photo set, from the server
// (Engines v3 PR-27f, CUL-1629). The read only: the gates are `lib/mayWaitLine.ts`, which is pure,
// so its test feeds it rows without a database (the `incidentFloorFacts` split).
//
// THE PHONE'S OWN ROWS, UNSYNCED INCLUDED. The point of the read is the rows the server's fact has
// not seen: a vomit or a lethargy logged a minute ago offline, a rating given since, a photo still
// in the upload queue. So every query reads `events` / `meals` / `event_attachments` as the phone
// holds them, and a separate query asks whether any of them is still waiting to be pushed
// (deleted rows included: an undone vomit the server still holds is a change it has not seen).
//
// The windows are the server's own (`incidentMayWaitEvidence.ts`): incidents twice the reach either
// side, so the floor re-run on a neighbour reads a window either side of IT; lethargy from a day
// before the run up to now; a cat's meals from a week before the run up to now. SQL bounds are
// padded by a day and every comparison after that is on parsed instants (C-40).
//
// Null on ANY failed read, said out loud: the line this feeds can only take leave away, so an
// unanswered read keeps the louder line rather than a wait built over rows nobody read (C-12).

import { getDb } from './db';
import type { MayWaitFacts, MayWaitMeal } from './mayWaitLine';
import { MAY_WAIT_INTAKE_BASELINE_HOURS, MAY_WAIT_LETHARGY_HOURS, MAY_WAIT_REACH_HOURS } from './mayWaitLine';
import { supabase } from './supabase';

const HOUR = 3_600_000;
const PAD_MS = 24 * HOUR;

/** The server's incident types (`MAY_WAIT_INCIDENT_TYPES`): the reads a may-wait run is made of. */
export const MAY_WAIT_STOOL_TYPES = ['stool_normal', 'diarrhea'] as const;
const INCIDENT_TYPES = ['vomit', ...MAY_WAIT_STOOL_TYPES];
/** Every event type a may-wait decision reads: an unsynced one of these is a fact it never saw. */
const READ_TYPES = [...INCIDENT_TYPES, 'lethargy', 'meal'];

const placeholders = (n: number) => Array.from({ length: n }, () => '?').join(', ');

/** The server's attachment ids for the event, read fresh; null on a failed read. */
export async function readServerAttachmentIds(eventId: string): Promise<string[] | null> {
  try {
    const { data, error } = await supabase.from('event_attachments').select('id').eq('event_id', eventId);
    if (error || !data) {
      console.warn('[mayWaitFacts] server photo read failed:', error?.message ?? 'no data');
      return null;
    }
    return (data as { id: unknown }[]).map((r) => String(r.id));
  } catch (e) {
    console.warn('[mayWaitFacts] server photo read failed:', e);
    return null;
  }
}

export async function loadMayWaitFacts(eventId: string, petId: string, nowMs: number): Promise<MayWaitFacts | null> {
  try {
    const db = getDb();
    const own = await db.getFirstAsync<{ occurred_at: string }>(
      'SELECT occurred_at FROM events WHERE id = ? AND pet_id = ? AND deleted_at IS NULL',
      [eventId, petId],
    );
    if (!own) return null;
    const a = Date.parse(own.occurred_at);
    if (!Number.isFinite(a)) return null;
    const reach = MAY_WAIT_REACH_HOURS * HOUR;
    const iso = (ms: number) => new Date(ms).toISOString();
    const from = a - 2 * reach - MAY_WAIT_INTAKE_BASELINE_HOURS * HOUR - PAD_MS;
    const to = Math.max(a + 2 * reach, nowMs) + PAD_MS;

    const rows = await db.getAllAsync<{
      id: string;
      event_type: string;
      occurred_at: string;
      occurred_at_confidence: string | null;
      deleted_at: string | null;
      synced: number;
      meal_rating: string | null;
      meal_synced: number | null;
    }>(
      `SELECT e.id, e.event_type, e.occurred_at, e.occurred_at_confidence, e.deleted_at, e.synced,
              m.intake_rating AS meal_rating, m.synced AS meal_synced
         FROM events e
         LEFT JOIN meals m ON m.event_id = e.id
        WHERE e.pet_id = ?
          AND e.event_type IN (${placeholders(READ_TYPES.length)})
          AND e.occurred_at >= ?
          AND e.occurred_at <= ?`,
      [petId, ...READ_TYPES, iso(from), iso(to)],
    );
    const attachments = await db.getAllAsync<{ id: string; event_id: string; synced: number }>(
      'SELECT id, event_id, synced FROM event_attachments WHERE event_id = ?',
      [eventId],
    );
    const serverIds = await readServerAttachmentIds(eventId);
    if (serverIds === null) return null;

    const live = rows.filter((r) => r.deleted_at === null);
    const at = (r: { occurred_at: string }) => Date.parse(r.occurred_at);
    const within = (r: { occurred_at: string }, lo: number, hi: number) => {
      const t = at(r);
      return Number.isFinite(t) && t >= lo && t <= hi;
    };

    const vomits = live
      .filter((r) => r.event_type === 'vomit' && within(r, a - 2 * reach, a + 2 * reach))
      .map((r) => ({ at: r.occurred_at, confidence: r.occurred_at_confidence }));
    const stoolAt = live
      .filter((r) => (MAY_WAIT_STOOL_TYPES as readonly string[]).includes(r.event_type) && within(r, a - reach, a + reach))
      .map((r) => r.occurred_at);
    const lethargyAt = live
      .filter((r) => r.event_type === 'lethargy' && within(r, a - reach - MAY_WAIT_LETHARGY_HOURS * HOUR, Math.max(a + reach + MAY_WAIT_LETHARGY_HOURS * HOUR, nowMs)))
      .map((r) => r.occurred_at);
    const meals: MayWaitMeal[] = live
      .filter((r) => r.event_type === 'meal')
      .map((r) => ({ at: r.occurred_at, rating: r.meal_rating }));

    // Deleted rows count here: an undo the server has not heard of is still a change.
    const unsynced =
      rows.some((r) => r.synced === 0 || (r.event_type === 'meal' && r.meal_synced === 0)) ||
      attachments.some((t) => t.synced === 0);

    return {
      anchorAt: own.occurred_at,
      serverAttachmentIds: serverIds,
      localAttachmentIds: attachments.map((t) => t.id),
      unsynced,
      vomits,
      stoolAt,
      lethargyAt,
      meals,
    };
  } catch (e) {
    console.warn('[mayWaitFacts] read failed:', e);
    return null;
  }
}
