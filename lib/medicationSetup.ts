// Regimen setup — the LOCAL-FIRST write path for `medications` (CUL-901 / VV-3).
//
// WHY THIS MODULE EXISTS. `AddMedicationModal` wrote a regimen straight to
// PostgREST and showed "Could not save" when the phone had no signal — the one
// remote-first write left in a local-first app, and the bug Jordan named from the
// Pet tab. The after-visit screen (VV-4) makes it untenable: its whole job is
// turning a vet's plan into records in a clinic car park, and spec §0.2 makes
// "every row that screen creates is a local `synced = 0` write" the Dir. of
// Engineering's and QA's condition on the track.
//
// `lib/dietTrialSetup.ts` is the shape this follows deliberately rather than
// inventing a second one: the local write, the id returned, the value-moment
// offer fired from the write path, the fire-and-forget queue push. The push
// queue it feeds has existed since B-117 (`syncPendingMedications`,
// `lib/sync.ts`) — nothing was missing but a writer that used it.
//
// WHY NOT IN `lib/medications.ts`. Two reasons, and the second is the binding
// one. It is already past 1,500 lines; and it is DIRECTLY in the Edge Function
// shipping closure (`supabase/functions/*/…/../../../lib/medications.ts`, which
// `generate-report` pulls through `lib/medicationHistory.ts`). A module importing
// `getDb` cannot be bundled under Deno, and editing that file at all reds
// `guards/edgeFunctionDeploy.test.ts` and owes the ledger a `hold` entry on the
// CUL-19 chain for code no function reads — C-26's "move the code, never bump the
// ledger". The visit link therefore rides `StartRegimenInput` here rather than
// `RegimenWritePayload` there, which is also the truer home: `buildRegimenPayload`
// maps FORM fields, and a visit link is provenance the caller supplies.
//
// ALL THREE WRITE PATHS, NOT JUST THE CREATE. Moving the create alone would have
// SHIPPED a defect rather than fixed one: a regimen that exists locally but has
// not yet pushed is invisible to `.eq('id', …)` server-side, and the modal's edit
// branch used `.maybeSingle()`, which answers a zero-row match with `null` and NO
// error — the modal closes, the owner's correction is silently discarded, and
// nothing anywhere says so. `handleEndRegimen` failed loudly on the same row.
// One table, one queue, one write path (PM-ruled, 2026-09-11).
import { getDb } from './db';
import { syncPendingMedications } from './sync';
import { useSyncStore } from '../store/syncStore';
import { uuid } from './utils';
import { surfaceOfferForValueMoment } from './dailyRecapOffer';
import type { RegimenWritePayload } from './medications';

/** Every regimen write below ends with this — `notifyTrialChanged`'s twin, and here
 *  it is load-bearing rather than tidy. The Home medication strip and the widget
 *  snapshot read the LOCAL `medications` mirror (`hooks/useMedStrips.ts` re-reads on
 *  `hydrationTick`), so under the old remote-first write a new course reached Home
 *  only when hydration happened to pull it back down — and never at all offline.
 *  A local write is a hydration as far as those readers are concerned. It lives in
 *  the write path, not at the call sites: VV-4's plan row will not know the strip
 *  exists. */
function notifyMedicationsChanged(): void {
  try {
    useSyncStore.getState().bumpHydrationTick();
  } catch (e) {
    // The write itself succeeded; a refresh-signal failure must not fail it.
    console.warn('[medicationSetup] hydration tick failed:', e);
  }
}

/** Queue the flush. Fire-and-forget by design: offline the row simply stays at
 *  `synced = 0` and the next cycle picks it up, which is the entire point of
 *  writing locally first. `syncPendingMedications` is already
 *  `serializeQueuePush('medications', …)` (CUL-622), so two writes in quick
 *  succession cannot open two concurrent drains over one queue. */
function flushMedications(context: string): void {
  syncPendingMedications().catch((err) =>
    console.warn(`[medicationSetup] ${context} sync failed (queued):`, err),
  );
}

export interface StartRegimenInput {
  /** The ACTIVE pet's id, or the appointment's (VV-4) — never free input. RLS
   *  re-validates ownership on the eventual push (B-123, medications_owner). */
  petId: string;
  /** The column payload from `buildRegimenPayload` — the form's fields only. */
  payload: RegimenWritePayload;
  /** CUL-899/CUL-901 — PROVENANCE: the visit this course came from, written in the
   *  SAME INSERT, never a follow-up UPDATE a crash between the two could lose
   *  (spec §5.1). It never moves a number: `started_at`, the dose counts and the
   *  course's own dates stay its own (CUL-746, TG-5). Absent on the Pet-tab path. */
  vetVisitId?: string | null;
}

/**
 * Start a medication course. Writes ONE local row at `synced = 0` and returns its
 * id, then queues the push.
 *
 * No transaction, and the difference from `startDietTrial` is the reason: that one
 * wraps its INSERT because a trial and its allowed-food set are a single fact split
 * across a parent and N children, and a throw mid-loop leaves an active trial whose
 * partial diet mis-scores every meal. A regimen is one row. A single SQLite
 * statement is already atomic, so a transaction here would assert a guarantee it is
 * not providing.
 */
export async function startRegimen(input: StartRegimenInput): Promise<{ id: string }> {
  const db = getDb();
  const id = uuid();
  // ISO/UTC TEXT, like every other mirror timestamp, so LWW compares these on one
  // clock (`parseTs`). NOT a day key: started_at/ended_at are DATE columns and are
  // keyed from LOCAL components by the caller (B-441); these two are instants.
  const now = new Date().toISOString();
  const p = input.payload;

  await db.runAsync(
    `INSERT INTO medications
       (id, pet_id, medication_item_id, drug_name, dose_amount, route, doses_per_day,
        schedule_notes, indication, prescribed_by, started_at,
        target_duration_days, target_duration_doses,
        status, ended_at, notes, vet_visit_id,
        created_at, updated_at, synced, sync_attempts, sync_error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NULL, NULL, ?, ?, ?, 0, 0, NULL)`,
    [
      id, input.petId, p.medication_item_id, p.drug_name, p.dose_amount, p.route,
      p.doses_per_day, p.schedule_notes, p.indication, p.prescribed_by, p.started_at,
      p.target_duration_days, p.target_duration_doses,
      input.vetVisitId ?? null,
      now, now,
    ],
  );

  notifyMedicationsChanged();

  // DR-3 (§4): starting a med course is a value moment — re-surface the Daily Recap
  // offer once, ever. Moved here from the modal on the `startDietTrial` precedent,
  // so VV-4's plan row need not know the offer exists. Fire-and-forget, internally
  // best-effort, and a no-op once the moment is spent.
  void surfaceOfferForValueMoment('med_course');

  flushMedications('regimen');
  return { id };
}

/**
 * Edit a course's fields. Local UPDATE, re-queued.
 *
 * `updated_at` MOVES on every re-queue and the quarantine pair is cleared in the
 * SAME statement — the first is what keeps CUL-691's version-marking a real guard
 * (`markSynced` matches `WHERE id = ? AND updated_at IS ?`, so a stale push whose
 * version still matched would be waved through), the second is what lets an
 * owner-visible correction re-arm a row a server refusal had parked. Both are
 * scanned by `lib/syncQueue.test.ts`.
 *
 * Lifecycle columns are deliberately absent: `status`/`ended_at` belong to
 * `endRegimen`, exactly as the payload type has always excluded them.
 */
export async function updateRegimen(id: string, payload: RegimenWritePayload): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  const p = payload;

  await db.runAsync(
    `UPDATE medications
        SET medication_item_id = ?, drug_name = ?, dose_amount = ?, route = ?,
            doses_per_day = ?, schedule_notes = ?, indication = ?, prescribed_by = ?,
            started_at = ?, target_duration_days = ?, target_duration_doses = ?,
            updated_at = ?, synced = 0, sync_attempts = 0, sync_error = NULL
      WHERE id = ?`,
    [
      p.medication_item_id, p.drug_name, p.dose_amount, p.route, p.doses_per_day,
      p.schedule_notes, p.indication, p.prescribed_by, p.started_at,
      p.target_duration_days, p.target_duration_doses,
      now, id,
    ],
  );

  notifyMedicationsChanged();
  flushMedications('regimen edit');
}

/**
 * End a course. A regimen is ENDED via `status`/`ended_at`, never deleted and never
 * soft-deleted (migration 020) — the course has to survive its own ending or the
 * medication history has nothing to show (B-140).
 *
 * `endedAt` is passed in, not derived here: it is a DATE column, whose day key must
 * come from the owner's LOCAL calendar components (B-441 — `toISOString()` yields
 * the UTC day, so an owner behind UTC ending a course in the evening stored
 * TOMORROW), and the caller is what knows which day it means. This module writes no
 * date it did not receive.
 */
export async function endRegimen(id: string, endedAt: string): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();

  await db.runAsync(
    `UPDATE medications
        SET status = 'completed', ended_at = ?,
            updated_at = ?, synced = 0, sync_attempts = 0, sync_error = NULL
      WHERE id = ?`,
    [endedAt, now, id],
  );

  notifyMedicationsChanged();
  flushMedications('regimen end');
}
