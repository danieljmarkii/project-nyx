// What the record's floor words read from the phone: the event, the pet's vomit logs
// around it, and the courses on board (Engines v3 PR-27b, CUL-1510).
//
// SEPARATE FROM `lib/incidentFloorWords.ts` ON PURPOSE (the `lookEmergencyFacts` split):
// that module is the copy and is pure, so the clause test can feed it rows without a
// database; this one is the read, and nothing else.
//
// The window is the floor's own (`FLOOR_READ_HOURS` either side of the event), so the words
// see what the server's floor would see. The SQL bound is padded by a day and the exact
// window applied on parsed instants: a local write spells an instant `…Z` and a hydrated row
// `…+00:00`, and those do not compare as text (C-40).

import { getDb } from './db';
import { FLOOR_READ_HOURS, type FloorVomit } from './incidentFloor';

export interface IncidentFloorFacts {
  /** The event this read is about, or null when the phone has no copy of it. */
  anchor: FloorVomit | null;
  /** Live vomit logs of the pet within the floor's read window, the anchor included. */
  vomits: FloorVomit[];
  /** Courses on board at the event, by the names the owner entered. */
  courses: string[];
}

const HOUR = 3_600_000;

/**
 * A course on board at `atMs`, said to a vet by name. Started by then, and either ended
 * after it or still running. `status` is the lifecycle authority (lib/medications.ts) and
 * `ended_at` is owner-set, so a course that is no longer active with no end date cannot be
 * placed in time: it is left out, because naming a drug the pet may have stopped is a
 * claim the record cannot back. Every comparison is on parsed instants (C-40).
 */
export function onBoardAt(m: { status: string; started_at: string; ended_at: string | null }, atMs: number): boolean {
  const start = Date.parse(m.started_at);
  if (!Number.isFinite(start) || start > atMs) return false;
  if (m.ended_at) {
    // A bare date is the owner's last day: on board through the end of it, locally. Parsed
    // as written it would be UTC midnight and drop the course on its last day.
    const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(m.ended_at);
    const end = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]) + 1).getTime() : Date.parse(m.ended_at);
    return Number.isFinite(end) && end > atMs;
  }
  return m.status === 'active';
}

const PAD_MS = 24 * HOUR;

/**
 * Returns null on a failed read, said out loud: the lines this feeds are additive, so a
 * missing read draws none of them rather than a list built over rows nobody read.
 */
export async function loadIncidentFloorFacts(eventId: string, petId: string): Promise<IncidentFloorFacts | null> {
  try {
    const db = getDb();
    const own = await db.getFirstAsync<{ occurred_at: string; occurred_at_confidence: string | null }>(
      'SELECT occurred_at, occurred_at_confidence FROM events WHERE id = ? AND pet_id = ?',
      [eventId, petId],
    );
    if (!own) return { anchor: null, vomits: [], courses: [] };
    const a = Date.parse(own.occurred_at);
    if (!Number.isFinite(a)) return { anchor: null, vomits: [], courses: [] };
    const reach = FLOOR_READ_HOURS * HOUR;
    const rows = await db.getAllAsync<{ occurred_at: string; occurred_at_confidence: string | null }>(
      `SELECT occurred_at, occurred_at_confidence
         FROM events
        WHERE pet_id = ?
          AND deleted_at IS NULL
          AND event_type = 'vomit'
          AND occurred_at >= ?
          AND occurred_at <= ?`,
      [petId, new Date(a - reach - PAD_MS).toISOString(), new Date(a + reach + PAD_MS).toISOString()],
    );
    const inWindow = (iso: string) => {
      const t = Date.parse(iso);
      return Number.isFinite(t) && Math.abs(t - a) <= reach;
    };
    const vomits = rows
      .filter((r) => inWindow(r.occurred_at))
      .map((r) => ({ at: r.occurred_at, confidence: r.occurred_at_confidence }));

    const meds = await db.getAllAsync<{ drug_name: string; status: string; started_at: string; ended_at: string | null }>(
      'SELECT drug_name, status, started_at, ended_at FROM medications WHERE pet_id = ?',
      [petId],
    );
    const courses = [...new Set(meds.filter((m) => onBoardAt(m, a)).map((m) => m.drug_name.trim()).filter((n) => n.length > 0))];

    return {
      anchor: { at: own.occurred_at, confidence: own.occurred_at_confidence },
      vomits,
      courses,
    };
  } catch (e) {
    console.warn('[incidentFloorFacts] read failed:', e);
    return null;
  }
}
