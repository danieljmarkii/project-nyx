// Single owner of the medication-dose write side-effects (B-117 PR 3) — the
// medication analog of lib/meals.ts (insertMeal). Kept OUT of lib/db.ts for the
// same reason insertMeal is: it imports from lib/sync.ts (the push), and lib/db.ts
// must stay sync-free to avoid a db↔sync import cycle.
//
// A dose is the meal pattern exactly: a parent `events` row (event_type='medication')
// + a 1:1 `medication_administrations` child (the meals + intake_rating shape). This
// helper owns both local writes and the fire-and-forget push so any future entry
// point physically cannot write one without the other (the drift insertMeal was
// created to prevent).
//
// NOT fired here (deliberately): the AI-Signal regen. Unlike a meal or symptom, a
// medication dose has no Signal consumer yet — the detection engine gains its
// `medicationWindows` confounder pass in PR 9 (spec §8). Firing a regen now would
// recompute an identical signal and falsely imply med→signal wiring already exists.
// When PR 9 lands, add triggerSignalRegenDebounced(petId) here.

import { getDb, getDoubleDoseFlag } from './db';
import { syncPendingEvents, syncPendingMedicationAdministrations } from './sync';
import { uuid } from './utils';
import type { DoseVehicle } from './medications';
import { useMomentStore, whenMedicationCardVisible } from '../store/momentStore';
import type { DoseAdherence } from '../components/log/AdherenceChipRow';

export interface InsertMedicationDoseParams {
  petId: string;
  // The drug product being administered (medication_items_cache.id), or NULL for a
  // dose logged against a FREE-TEXT regimen (B-154) — a regimen with no library item,
  // so there is no medication_item_id to carry. Such a dose is attributed by its
  // medicationId link below; it simply won't appear in the Recent picker (which inner-
  // joins the library), which is correct — there is no library tile to re-pick.
  medicationItemId: string | null;
  // The active regimen this dose belongs to, if any. Populated by the one-tap path's
  // active-regimen resolver (B-153, getActiveRegimenForDrug) and the "Log a dose"
  // card affordance (B-154); NULL only when no active regimen exists for the drug — a
  // genuine ad-hoc one-off dose. Schema-valid: the dose's medication_id is nullable.
  // Carrying it is what lets a regimen (free-text ones especially) accumulate doses.
  medicationId?: string | null;
  // Adherence at log time. The one-tap path passes 'given' (the owner's
  // affirmative tap = "I gave this dose"); the completion card can downgrade it.
  // Nullable for forward-compatibility, but never auto-defaulted to 'given' on a
  // null (the n=1 never-reassures invariant lives in the wire mapper, spec §6).
  adherence: 'given' | 'partial' | 'missed' | 'refused' | null;
  // Actual administered amount, inherited from the active regimen's dose_amount when
  // the dose is logged against one (B-153/B-154). NULL when there is no regimen to
  // default from — and a drug's per-unit strength is NOT the dose, so we never
  // fabricate one. Honest-null over a guessed value.
  doseAmount?: string | null;
  // B-156 Slice B — the vehicle the dose was given in. Optional, defaults to NULL:
  // the one-tap path doesn't ask, so an unset vehicle is a clean NULL, never a
  // fabricated 'direct'. A descriptive fact only — it carries no adherence/safety
  // meaning on its own (the intake→adherence coupling is the gated combo, Phase B),
  // so a null is simply "not recorded", exactly like a null dose_amount. The capture
  // chip that sets it is PR A3; this param is the write path it threads through.
  // Typed as the closed DoseVehicle enum (the dose_route_vehicle members, defined
  // once in lib/medications.ts) — like `adherence` above, the caller-facing write
  // param is a literal union so a stray value is a compile error before it reaches
  // the server enum (which would reject the upsert). The loose sync row-shapes keep
  // `how_given: string | null` to mirror the DB exactly, the same split `adherence`
  // uses (tight on the param, plain TEXT on the row).
  howGiven?: DoseVehicle | null;
  // B-156 Slice C — the co-logged meal/treat event this dose was given INSIDE (the
  // "with food" combo). Optional, defaults to NULL: the standalone-dose paths (one-tap,
  // "Log a dose", the medication quick-log) never set it, so an unlinked dose is a clean
  // NULL, exactly like a null dose_amount. A plain UUID (the meal event's id); the FK +
  // same-pet integrity live server-side (migration 023). THE CALLER MUST PASS AN EVENT
  // FOR THE SAME PET — the combo entry point (a later PR) passes the just-logged meal's
  // id, which is the same pet by construction; the server-side same-pet trigger is the
  // defense-at-rest backstop if a wrong id ever reaches the wire (it rejects the upsert,
  // it never silently mis-links). This is the write-path half of the link; no caller
  // sets a non-null value yet (B2 is the plumbing the combo UI threads through).
  pairedEventId?: string | null;
  // Administration time. The one-tap path passes now() — a dose is witnessed
  // (you see yourself give it), so confidence is always 'witnessed' with no window.
  occurredAt: Date;
}

export interface InsertMedicationDoseResult {
  eventId: string;
  administrationId: string;
  // ISO occurred_at written to the event row — use for prependEvent/card so the
  // store mirrors the DB exactly.
  occurredAtIso: string;
  // ISO created_at/updated_at written to both rows.
  now: string;
}

// Write a dose (its parent event + the administration child) and push it to
// Supabase. Throws if a local write fails so the caller's guard can react; the
// sync push is fire-and-forget and never blocks or throws into the caller.
export async function insertMedicationDose(
  params: InsertMedicationDoseParams,
): Promise<InsertMedicationDoseResult> {
  const { petId, medicationItemId, medicationId = null, adherence, doseAmount = null, howGiven = null, pairedEventId = null, occurredAt } = params;
  const db = getDb();
  const now = new Date().toISOString();
  const occurredAtIso = occurredAt.toISOString();
  const eventId = uuid();
  const administrationId = uuid();

  // Both rows in ONE transaction so the dose is atomic: a dose is an event +
  // its 1:1 child, and a half-write (event row lands, child INSERT throws) would
  // sync an orphaned event_type='medication' row to Supabase with no
  // administration child — a silently-dirty server state with no adherence/dose
  // data. withTransactionAsync rolls both back on any throw. (The meals path has
  // the same latent gap; tightened here because an orphaned medication event is
  // clinically worse than an orphaned meal.)
  await db.withTransactionAsync(async () => {
    // Event row. A dose is inherently witnessed — you see yourself give the pill —
    // so confidence is always 'witnessed' with no window bounds, exactly like a
    // meal (the B-010 "found" path never applies). occurred_at_source 'now' marks
    // the auto-stamped one-tap time.
    await db.runAsync(
      `INSERT INTO events
         (id, pet_id, event_type, occurred_at, severity, notes, source, occurred_at_source,
          occurred_at_confidence, occurred_at_earliest, occurred_at_latest,
          created_at, updated_at, synced)
       VALUES (?, ?, 'medication', ?, NULL, NULL, 'manual', 'now', 'witnessed', NULL, NULL, ?, ?, 0)`,
      [eventId, petId, occurredAtIso, now, now],
    );

    // Dose child. updated_at is stamped ISO (not SQLite's local-time datetime())
    // so cross-device last-write-wins compares correctly (B-055). adherence is
    // written as-passed — never coerced.
    await db.runAsync(
      `INSERT INTO medication_administrations
         (id, event_id, pet_id, medication_id, medication_item_id, adherence, dose_amount,
          how_given, paired_event_id, notes, created_at, updated_at, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 0)`,
      [administrationId, eventId, petId, medicationId, medicationItemId, adherence, doseAmount, howGiven, pairedEventId, now, now],
    );
  });

  // Push immediately: events before administrations (the dose child FK→events.id),
  // and presyncMedicationItems (inside syncPendingMedicationAdministrations) pushes
  // the referenced library item first so its FK can't reject the row. Fire-and-forget.
  syncPendingEvents()
    .then(() => syncPendingMedicationAdministrations())
    .catch((e) => console.error('[insertMedicationDose] sync push failed:', e));

  return { eventId, administrationId, occurredAtIso, now };
}


// ── B-157 (CUL-284): the log-time double-dose note ──────────────────────────────
// The §6.4 check (B-135) shipped correct but reachable from ONE place — the second
// dose's own detail screen. An owner who taps twice and then scans History never sees
// it, which is a discoverability hole in a safety flag, not a detector bug. This puts
// the SAME note (same predicate, same copy) on the medication completion card at the
// moment the second dose is logged.
//
// Deliberately NOT folded into insertMedicationDose, even though that module owns the
// dose write: two of the four dose-write paths (MedStrip's Home one-tap and
// medication-capture's first-dose) show no completion card at all, so a check fired
// from the write would have nowhere to land. It lives here, next to the write, so the
// pairing is greppable — and so a future card-showing path finds it.
//
// Fire-and-forget by design (Principle 1): the dose is already on disk and the card is
// already up before this runs. Every failure mode degrades to SILENCE, which is safe
// here only because silence is not an all-clear on any Nyx surface — the detector
// already under-fires by construction, and the dose detail screen recomputes the check
// on every focus, so a note dropped at log time is never a note lost from the record.
export async function applyLogTimeDoubleDoseCheck(params: {
  eventId: string;
  petId: string;
  medicationItemId: string | null;
  occurredAt: string;
  // Narrower than getDoubleDoseFlag's own `string | null` on purpose: this value is
  // also the store-side precondition (see the patchDoubleDose call below), so it has to
  // be comparable to the card's adherence rather than any stored TEXT.
  adherence: DoseAdherence | null;
}): Promise<void> {
  let flag;
  try {
    flag = await getDoubleDoseFlag(params);
  } catch (e) {
    // A check failure must never surface as a log failure — the dose is saved and the
    // card is showing. Warn and leave the note off; the detail screen still has it.
    console.warn('[medication-dose] log-time double-dose check failed:', e);
    return;
  }
  // No conflict → nothing to say. Note what is NOT done here: there is no "no repeat
  // found" state to render (§6.1 — absence of a flag is never reassurance).
  if (!flag.conflict) return;
  // Wait for the card to actually be on screen before patching. The picker path defers
  // its reveal by ~450ms while this local read resolves in single-digit ms, so a bare
  // patch would land on a not-yet-revealed card and drop the note. `false` means a
  // newer dose superseded this card — skip, rather than decorate the wrong dose.
  if (!(await whenMedicationCardVisible(params.eventId))) return;
  // The third argument is the precondition: this result was computed against the
  // adherence the dose was WRITTEN with, and the store drops it if the owner has since
  // changed it on the card. That tap fired its own recheck, which carries the truth.
  useMomentStore.getState().patchDoubleDose(params.eventId, flag, params.adherence);
}
