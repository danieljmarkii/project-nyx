// Medication history — the on-device course loader (B-140 extended, PR 3).
//
// The `*Facts` I/O sibling of the PURE `lib/medicationHistory.deriveMedicationCourses`
// (PR 1), exactly as `medStripFacts` loads for the pure `resolveMedStrips` and
// `dietTrialFacts` for the trial card. It turns the LOCAL mirror into the
// `MedicationHistoryInput` the derivation consumes, so every JUDGEMENT (the course
// shape, the two end registers, the one count predicate) stays in the pure module and
// this file owns only the reads + the pass-through mapping.
//
// ── WHY THE LOCAL MIRROR, NOT SUPABASE ────────────────────────────────────────────
// The med-detail screen's catalog row is read straight from Supabase (it needs
// columns the local cache doesn't carry — photo_paths, created_by_user_id), but the
// COURSE HISTORY reads the local mirror the sync layer keeps (migration 020's tables):
// it works in airplane mode, and it is the same offline read the rundown block (PR 4)
// will make. The same choice the med strip and the trial card made.
//
// ── WHY ALL STATUSES ──────────────────────────────────────────────────────────────
// This feature EXISTS because every other medication surface filters to
// `status = 'active'`, so a course vanishes the moment it ends (spec §1). So the
// regimen read is deliberately UNFILTERED by status — the derivation's whole job is to
// summarise the ended and the never-had-a-regimen courses too. A future edit that
// re-adds a `WHERE status = 'active'` here would silently reinstate the amnesia this
// track removes; `medicationHistoryFacts.test.ts` runs the real string against
// `node:sqlite` and asserts an ended/stopped regimen still loads, so it fails first.
//
// ── FAILURE POSTURE ────────────────────────────────────────────────────────────────
// A read failure resolves to `null` and the surface renders no history section (rather
// than a fabricated-empty one). The caller keeps its prior state on `null`, so a
// transient failure never flashes the section away.
import { getDb } from './db';
import { deriveMedicationCourses, type MedicationCourse } from './medicationHistory';
import type { AttributableDose } from './medications';
import type { MedicationHistoryRegimen } from './medicationHistory';

// ── The reads (exported so a real `node:sqlite` runs the production strings) ────────
// The `lib/db.ts` jest harness mocks `getAllAsync`, so these two strings are otherwise
// unexercised until a device — and the load-bearing parts ARE the SQL: NO status
// filter (the amnesia this track undoes), and the soft-delete filter read THROUGH the
// parent event (a dose carries no own `deleted_at` — migration 020).

// Every regimen for one pet, ALL statuses — the `MedicationHistoryRegimen` columns and
// nothing else. Ordering is left to the derivation (active-first, then last-dose
// recency), so this read is unordered on purpose.
export const ALL_REGIMENS_FOR_HISTORY_SQL = `
  SELECT id, medication_item_id, drug_name, dose_amount, route, doses_per_day,
         schedule_notes, started_at, target_duration_days, target_duration_doses,
         status, ended_at
    FROM medications
   WHERE pet_id = ?
`;

// Every dose for one pet, all time, in `AttributableDose` shape. Soft-delete is read
// THROUGH the parent event (`e.deleted_at`) — both filtered here (cheap for a
// years-long chronic-med record) AND selected, so the derivation's own
// `if (d.deleted_at) continue` guard has the column it re-checks. Both `ma.pet_id` and
// `e.pet_id` are constrained: equal by the migration-023 same-pet trigger, so this is
// which index the planner may use (`idx_events_pet_time`), not a semantic change.
export const ALL_DOSES_FOR_HISTORY_SQL = `
  SELECT ma.medication_id, ma.medication_item_id, ma.adherence,
         e.occurred_at, e.deleted_at
    FROM medication_administrations ma
    JOIN events e ON e.id = ma.event_id
   WHERE ma.pet_id = ? AND e.pet_id = ? AND e.deleted_at IS NULL
`;

/**
 * Load one pet's medication courses from the local mirror, or `null` when the record
 * could not be read (the surface then renders no history section — see the failure
 * posture note). Pure derivation, so the shape/count/end-register decisions are
 * identical to every other B-140 surface.
 *
 * `timeZone` is OMITTED on-device — the device zone IS the owner's midnight (the B-514
 * convention); it exists so `generate-report` (PR 5) can pass the pet's profile zone.
 */
export async function loadMedicationCourses(
  petId: string,
  timeZone?: string,
): Promise<MedicationCourse[] | null> {
  let regimens: MedicationHistoryRegimen[];
  let doses: AttributableDose[];
  try {
    const db = getDb();
    [regimens, doses] = await Promise.all([
      db.getAllAsync<MedicationHistoryRegimen>(ALL_REGIMENS_FOR_HISTORY_SQL, [petId]),
      db.getAllAsync<AttributableDose>(ALL_DOSES_FOR_HISTORY_SQL, [petId, petId]),
    ]);
  } catch (e) {
    console.error('[medHistory] load failed:', e);
    return null;
  }

  return deriveMedicationCourses({ regimens, doses, timeZone });
}
