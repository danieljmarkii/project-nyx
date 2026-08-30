// Single owner of the weight-check write side-effects (B-186 PR 2) — the weight
// analog of lib/meals.ts (insertMeal) and lib/medicationDose.ts. Kept OUT of
// lib/db.ts for the same reason those are: it imports from lib/sync.ts (the
// push), and lib/db.ts must stay sync-free to avoid a db↔sync import cycle.
//
// A weight check is the meal/dose pattern exactly: a parent `events` row
// (event_type='weight_check') + a 1:1 `weight_checks` child carrying the
// measured value (migration 024). This helper owns both local writes and the
// fire-and-forget push so any future entry point physically cannot write one
// without the other.
//
// NOT fired here (deliberately): the AI-Signal regen. Like a medication dose, a
// weight reading has no Signal consumer yet (Trend zone = symptoms; the engine
// has no weight lane). Firing a regen would recompute an identical signal and
// falsely imply weight→signal wiring exists. When a weight lane is built, add
// triggerSignalRegenDebounced(petId) here.
//
// CLINICAL GUARDRAIL inherited by every consumer (carried from migration 024): a
// weight TREND must never reassure. A stable or rising weight is NOT wellness (a
// rising line can be fluid/edema); weight LOSS is the danger signal. Nothing in
// this file renders a verdict — it only stores the number — but the rule travels
// with the data so the trend/report surfaces (PR 3+) honour it.

import { getDb } from './db';
import { supabase } from './supabase';
import { syncPendingEvents, syncPendingWeightChecks } from './sync';
import { uuid } from './utils';
import { LATEST_WEIGHT_KG_QUERY } from './weightQueries';
import { usePetStore } from '../store/petStore';

// ── Unit conversion ─────────────────────────────────────────────────────────
// Owners enter and read pounds; kilograms is the canonical storage unit
// (pets.weight_kg + weight_checks.weight_kg). Extracted here from EditPetModal
// (its original home) so the log step and the profile edit share one rounding
// rule and can't drift. kgToLbs returns a display STRING rounded to 0.1 lb (the
// pre-fill value); lbsToKg returns a NUMBER rounded to 2 dp (the stored value,
// matching NUMERIC(5,2)).
export function kgToLbs(kg: number): string {
  return String(kgToLbsNum(kg));
}

// Numeric sibling of kgToLbs — the display value as a NUMBER (rounded to 0.1 lb),
// for trend math where we need to subtract/compare readings rather than show one.
// Sharing the one rounding rule means the sparkline points, the big number, and the
// "x lbs since y" delta are all derived from the same rounded value — so the delta
// the owner reads is exactly latest − earliest of the numbers drawn (no off-by-0.1
// mismatch between the chart and the caption).
export function kgToLbsNum(kg: number): number {
  return Math.round(kg * 2.20462 * 10) / 10;
}

export function lbsToKg(lbs: number): number {
  return Math.round((lbs / 2.20462) * 100) / 100;
}

// Largest plausible pet weight, in pounds. A guard against a fat-fingered entry
// ("9999") — not a clinical limit. Two reasons it matters: (1) it stops an absurd
// value from polluting the trend line, and (2) it keeps the local write from
// out-running the server: weight_checks.weight_kg is NUMERIC(5,2) (max 999.99 kg
// ≈ 2204 lb), so a value above that would write locally, then 23514 on the
// upsert and sit in the sync queue forever (synced=0) with nothing surfaced to
// the owner. 500 lb clears any domestic species (the heaviest dogs reach ~120 kg
// ≈ 265 lb) while staying well under the column's ceiling.
export const MAX_WEIGHT_LBS = 500;

// Parse a free-text lbs input into a stored kg value, or null if it isn't a
// usable weight. A weight check is the ONE event where the value IS the entry
// (Principle 1's confirm-don't-enter can't apply — there's no value to confirm),
// so the number is mandatory and must be real: reject empty, non-numeric, zero,
// negative, or implausibly-large input rather than storing a value that would
// corrupt a trend line or wedge the sync queue (the DB CHECK (weight_kg > 0) +
// NUMERIC(5,2) range are the server backstops; this is the client gate that keeps
// the Log button honest). Returns kg, ready for the write.
export function parseWeightLbsToKg(input: string): number | null {
  const lbs = parseFloat(input.trim());
  if (!isFinite(lbs) || lbs <= 0 || lbs > MAX_WEIGHT_LBS) return null;
  return lbsToKg(lbs);
}

export interface InsertWeightCheckParams {
  petId: string;
  // The measured weight in KILOGRAMS (already converted from the owner's lbs
  // input via parseWeightLbsToKg). Must be > 0 — the caller validates before
  // calling; the DB CHECK is the backstop.
  weightKg: number;
  // When the pet was weighed. Defaults to now() on the one-tap path, but a
  // back-dated reading (e.g. a number from a recent vet visit) is supported via
  // the time picker — occurred_at lives on the parent event, like every event.
  occurredAt: Date;
  // Provenance of occurredAt for the audit trail ('now' = auto-stamped, 'manual'
  // = the owner touched the time picker). EXIF never applies — a weight isn't a
  // photo — but the column is shared with the other paths, so keep the union.
  occurredAtSource: 'manual' | 'exif' | 'now';
  // Optional owner note. Written to the parent events.notes (where it renders),
  // not the weight_checks child — see the INSERT comment below.
  notes?: string | null;
}

export interface InsertWeightCheckResult {
  eventId: string;
  weightCheckId: string;
  // ISO occurred_at written to the event row — use for prependEvent so the store
  // mirrors the DB exactly.
  occurredAtIso: string;
  // ISO created_at/updated_at written to both rows.
  now: string;
}

// Write a weight check (its parent event + the weight_checks child) and push it
// to Supabase. Throws if a local write fails so the caller's guard can react;
// the sync push is fire-and-forget and never blocks or throws into the caller.
export async function insertWeightCheck(
  params: InsertWeightCheckParams,
): Promise<InsertWeightCheckResult> {
  const { petId, weightKg, occurredAt, occurredAtSource, notes = null } = params;
  const db = getDb();
  const now = new Date().toISOString();
  const occurredAtIso = occurredAt.toISOString();
  const eventId = uuid();
  const weightCheckId = uuid();

  // Both rows in ONE transaction so the check is atomic: a weight check is an
  // event + its 1:1 child, and a half-write (event lands, child INSERT throws)
  // would sync an orphaned event_type='weight_check' row with no value — a
  // silently-dirty server state. withTransactionAsync rolls both back on any
  // throw (the same tightening insertMedicationDose applies to a dose).
  await db.withTransactionAsync(async () => {
    // Event row. A weight check is inherently witnessed — you read the scale — so
    // confidence is always 'witnessed' with no window bounds (the B-010 "found"
    // path never applies, exactly like a meal/dose). The owner's optional note
    // lands on the EVENT (events.notes), not the child: that's where every
    // existing reader (History row, event-detail screen) already shows a note, so
    // the note renders today with zero special-casing. weight_checks.notes stays
    // NULL — it's a forward-compatible column for a future per-reading annotation,
    // not the owner's free-text note here.
    await db.runAsync(
      `INSERT INTO events
         (id, pet_id, event_type, occurred_at, severity, notes, source, occurred_at_source,
          occurred_at_confidence, occurred_at_earliest, occurred_at_latest,
          created_at, updated_at, synced)
       VALUES (?, ?, 'weight_check', ?, NULL, ?, 'manual', ?, 'witnessed', NULL, NULL, ?, ?, 0)`,
      [eventId, petId, occurredAtIso, notes, occurredAtSource, now, now],
    );

    // Weight child. updated_at is stamped ISO (not SQLite's local-time
    // datetime()) so cross-device last-write-wins compares correctly (B-055).
    await db.runAsync(
      `INSERT INTO weight_checks
         (id, event_id, pet_id, weight_kg, notes, created_at, updated_at, synced)
       VALUES (?, ?, ?, ?, NULL, ?, ?, 0)`,
      [weightCheckId, eventId, petId, weightKg, now, now],
    );
  });

  // Push immediately: events before weight_checks (the child FK→events.id), so
  // the reading reaches Supabase without waiting for the next foreground.
  // Fire-and-forget.
  syncPendingEvents()
    .then(() => syncPendingWeightChecks())
    .catch((e) => console.error('[insertWeightCheck] sync push failed:', e));

  return { eventId, weightCheckId, occurredAtIso, now };
}

// The most-recent weight reading for a pet, in kg, or null if none — read from
// the local mirror (joins weight_checks→events for occurred_at + the soft-delete
// filter, since deletedness lives on the parent event). Used to keep the
// pets.weight_kg snapshot pointed at the latest reading: ordering by occurred_at
// (not insertion order) means a back-dated entry never wrongly overwrites a newer
// reading's snapshot.
export async function getLatestWeightKg(petId: string): Promise<number | null> {
  const db = getDb();
  const row = await db.getFirstAsync<{ weight_kg: number }>(LATEST_WEIGHT_KG_QUERY, [petId]);
  return row?.weight_kg ?? null;
}

// ── Edit side (B-197) ─────────────────────────────────────────────────────────

// Read the stored weight (kg) for a weight_check event's child, or null when the
// event has no child (a non-weight event, or a row not yet hydrated). Lets the
// edit screen pre-fill the field with the current value so an edit is an
// adjustment, not a from-scratch re-entry (the same reasoning as the log step's
// snapshot pre-fill).
export async function getWeightKgForEvent(eventId: string): Promise<number | null> {
  const db = getDb();
  const row = await db.getFirstAsync<{ weight_kg: number }>(
    `SELECT weight_kg FROM weight_checks WHERE event_id = ?`,
    [eventId],
  );
  return row?.weight_kg ?? null;
}

// Update a weight check's measured value — the edit-side twin of insertWeightCheck
// (B-197: the value was un-editable; the edit screen could change time/notes but
// not the number). The event's time/notes are edited through the shared updateEvent
// path (like a meal's parent fields); this owns ONLY the child value + the
// denormalized snapshot, mirroring how insertWeightCheck splits the write.
//
// Steps: bump the child (weight_kg + updated_at, synced=0 so it re-pushes under
// last-write-wins — updated_at is ISO for cross-device LWW, B-055), then re-point
// the pets.weight_kg snapshot at the LATEST reading by occurred_at. Re-pointing
// after every edit is correct both ways: editing the newest reading changes the
// snapshot, editing an older one leaves it (getLatestWeightKg still returns the
// newest). Returns { petId, snapshotKg } so the caller can sync the in-memory pet
// store (screens own store writes, as log.tsx does); null when the event has no
// weight child (nothing was written — the caller should treat that as a failure).
//
// Does NOT push the child to Supabase — the CALLER must, AFTER its event push
// (the child's sync gate requires the parent event synced=1). This matches the
// meal-edit path (updateMealFood/Intake also don't self-sync; edit-event batches
// one ordered push at the end). The snapshot write is best-effort (never throws).
export async function updateWeightCheck(
  eventId: string,
  weightKg: number,
): Promise<{ petId: string; snapshotKg: number | null } | null> {
  const db = getDb();
  const now = new Date().toISOString();
  const row = await db.getFirstAsync<{ pet_id: string }>(
    `SELECT pet_id FROM weight_checks WHERE event_id = ?`,
    [eventId],
  );
  if (!row) return null;

  await db.runAsync(
    `UPDATE weight_checks SET weight_kg = ?, updated_at = ?, synced = 0, sync_attempts = 0, sync_error = NULL WHERE event_id = ?`,
    [weightKg, now, eventId],
  );

  // Re-point the denormalized snapshot at the latest reading (best-effort: a
  // snapshot-sync failure never blocks the edit — same non-fatal treatment the
  // log path uses).
  const snapshotKg = await getLatestWeightKg(row.pet_id);
  if (snapshotKg != null) {
    const { error } = await supabase.from('pets').update({ weight_kg: snapshotKg }).eq('id', row.pet_id);
    if (error) console.warn('[updateWeightCheck] snapshot update failed:', error.message);
  }

  // No sync push here (deliberate). The caller's updateEvent just marked this
  // event synced=0, and syncPendingWeightChecks only flushes a child whose PARENT
  // is already synced=1 (lib/sync.ts) — so a push fired now would deterministically
  // no-op and the edit would sit unsynced until the next full cycle. Instead the
  // edit screen batches ONE ordered push at the end of the save (events → then
  // meals + weight_checks), exactly as it already does for a meal edit; that
  // ordering is what lets the child land right after its re-synced parent.
  return { petId: row.pet_id, snapshotKg };
}

// ── Delete side (CUL-641) ────────────────────────────────────────────────────
//
// The write side re-points `pets.weight_kg` at the latest reading (app/log.tsx's
// handleConfirmWeight) and so does the edit side (updateWeightCheck above). No
// DELETE path had a counterpart, and `reconcilePetWeightSnapshot` (lib/sync.ts)
// could not stand in for one: it fires only from syncPendingWeightChecks, over
// `weight_checks` rows with `synced = 0`, and a soft delete writes its tombstone
// on the PARENT event — so no weight row is ever queued, the reconcile never
// runs, and the snapshot sits on the deleted reading indefinitely.
//
// What that costs is worst on UNDO, which is the affordance §5 built to catch a
// mis-typed weight: the owner types 12.4 as 124, reads "Weight · 124 lbs" on the
// card, taps Undo — and the Profile chip, the next weigh-in's pre-fill and
// EditPetModal all go on offering 124 for good. The reading itself drops out of
// every soft-delete-filtered read correctly, so the chip ends up contradicting
// WeightTrendCard on the same screen, whose own prop comment says the two agree
// by construction.
//
// ── THE RULE, IN ONE SENTENCE ────────────────────────────────────────────────
// A delete may only ever undo the snapshot write THIS reading made. So: if the
// snapshot is not this reading's value, leave it entirely alone; if it is, it
// becomes the latest REMAINING reading, else the value this reading displaced if
// the caller knows it, else null.
//
// ── WHY THE GATE, AND WHY THE FIRST DRAFT WITHOUT IT WAS WRONG ───────────────
// The first version had no gate: it re-pointed at the latest remaining reading
// whenever one existed, and otherwise "left the snapshot alone" — justified as
// protecting the owner's onboarding / Edit-profile weight, which also lives in
// this column and has no other home. The adversarial pass falsified BOTH halves.
//
//   · "Leaving it loses nothing" was FALSE on the ordinary path. Onboarding 5.0
//     kg, then a first-ever weigh-in of 4.2 — the WRITE side already destroyed
//     the 5.0 at log time. Remove that reading from History an hour later and
//     "leave it alone" preserves 4.2: the deleted reading itself, not a profile
//     weight. `WeightTrendCard` then renders it captioned "From {pet}'s
//     profile." — an affirmative, false provenance claim about a weigh-in the
//     owner removed — and `EditPetModal` pre-fills it and writes it back on
//     Save, laundering the corpse into a genuine owner-entered profile weight,
//     permanently indistinguishable.
//   · And re-pointing UNCONDITIONALLY introduced a new destruction vector for
//     the very value the rule claimed to protect: type a vet-measured 18.0 into
//     Edit profile, then remove some unrelated OLDER weigh-in, and the snapshot
//     is re-pointed to the latest reading — the owner's 18.0 gone, destroyed by
//     a delete of a different row.
//
// One gate closes both, because both are the same mistake: acting on a snapshot
// this reading did not set. Comparing the deleted reading's own `weight_kg` to
// the snapshot tells "this number is the corpse" from "this number is the
// owner's" at zero schema cost.
//
// STATED LIMIT, because identity-by-value is not identity: a snapshot that merely
// EQUALS this reading passes the gate. A pet re-weighed at the same 12.0 lb months
// apart, whose owner then types that same 12.0 into Edit profile, has an
// owner-entered value the gate cannot tell from the corpse — deleting the older
// reading re-points it. Ordinary enough to name, rare enough not to buy a schema
// column for; CUL-694 is where storing the displaced value exactly lives.
//
// Nulling a corpse is then not data loss: the value it displaced was already
// destroyed at write time, so "—" and the card's designed empty state are the
// honest reading of a record that now holds no weigh-in. It also matters at the
// PRE-FILL (app/log.tsx `seedWeightPrefill`): Principle 2 has trained this owner
// to confirm rather than type, so a stale-high phantom sitting in the field is
// one tap from being confirmed into `weight_checks` as a real reading — biased
// toward the older, heavier value, which is the direction that masks loss. A
// blank field asks for a real number.
//
// ── WHY ONE HELPER, CALLED UNCONDITIONALLY ───────────────────────────────────
// It decides FOR ITSELF whether the event was a weigh-in, so a delete site never
// has to know what it just removed. Four hand-rolled "was this a weight check?"
// checks is precisely the shape that produced this bug — three delete paths each
// silently missing a side-effect the write path performs.

// Are these the same stored weight? An exact `===` would be reading two DOUBLES as if
// they were the decimal they represent. Both sides are 2 dp by construction
// (`lbsToKg` rounds, the column is NUMERIC(5,2)) but they arrive by different routes —
// the snapshot through PostgREST as a NUMERIC string, the reading out of SQLite REAL —
// and the whole gate turns on the comparison, so it is made at the precision the data
// actually has: half of the last stored digit.
const STORED_WEIGHT_EPSILON_KG = 0.005;

function isSameStoredWeight(a: number, b: number): boolean {
  return Math.abs(a - b) < STORED_WEIGHT_EPSILON_KG;
}

/**
 * Re-point `pets.weight_kg` after an event has been soft-deleted. A no-op for
 * every event that is not a weight check.
 *
 * PRECONDITION: the parent event is ALREADY soft-deleted. The latest-reading read
 * is soft-delete filtered, so calling this first would just re-select the row
 * being removed and change nothing.
 *
 * `restore` is presence-distinguished on purpose: `{ restoreToKg: null }` is a
 * meaningful instruction (put the snapshot back to "no weight on file", which is
 * the correct outcome for a first-ever weigh-in on a pet with no profile weight),
 * and it must not be confusable with "the caller doesn't know".
 *
 * Best-effort by contract — it never throws, mirroring the inline snapshot writes
 * it completes. The LOCAL half (resolve + patch the pet store) is awaited, because
 * that is what the owner sees on this device; the SERVER write is fired without
 * awaiting so an Undo tap never waits on a network round trip to show its removal
 * line — a flaky connection would otherwise leave the card frozen on the state the
 * owner just reversed. `syncPendingEvents` picks the server half back up on
 * reconnect (see the tombstone reconcile in lib/sync.ts).
 *
 * RETURNS the value the snapshot is INTENDED to take, never a report of what it
 * now holds — hence `intendedSnapshotKg` rather than `snapshotKg` (CUL-699). Both
 * gates below may refuse and this still returns a number, which is the honest shape
 * rather than a looser one: the server gate's verdict is a row count on a write this
 * function deliberately does not await, so "did anything change?" is not knowable by
 * the time it answers. Returning null on the LOCAL gate's refusal alone would be a
 * different false claim in the other direction — the two gates are independent by
 * design, and a refused store patch says nothing about the server write beside it.
 * A caller that needs the value must therefore treat it as an intent.
 */
export async function reconcileWeightSnapshotAfterDelete(
  eventId: string,
  restore?: { restoreToKg: number | null },
): Promise<{ petId: string; intendedSnapshotKg: number | null } | null> {
  try {
    const db = getDb();
    // The PARENT carries the type; the child carries the value. Reading both is what
    // tells "not a weigh-in" apart from "a weigh-in whose child has not hydrated yet"
    // — on the PULL path `hydrateEvents` completes before `hydrateWeightChecks`, so on
    // a fresh install a weigh-in renders in History with no local child, and a bare
    // child lookup scored it as "this wasn't a weigh-in". That is a logging gap read as
    // an absence, which is the one inference this codebase does not allow itself to
    // make. (The PUSH path has no such window: `insertWeightCheck` writes parent and
    // child in one transaction.)
    const row = await db.getFirstAsync<{
      event_type: string;
      pet_id: string;
      weight_kg: number | null;
    }>(
      `SELECT e.event_type AS event_type, e.pet_id AS pet_id, wc.weight_kg AS weight_kg
         FROM events e
         LEFT JOIN weight_checks wc ON wc.event_id = e.id
        WHERE e.id = ?`,
      [eventId],
    );
    // Not a weigh-in — the common case, since every other event type calls here too.
    if (!row || row.event_type !== 'weight_check') return null;
    if (row.weight_kg == null) {
      // A weigh-in we cannot evaluate, NOT a non-weigh-in. Say so: the snapshot is
      // left as it is, which is the safe direction, but silence here would be the
      // partial-hydration window passing itself off as the common case.
      console.warn(
        '[weight] weight_check %s has no local child row (partial hydration?) — snapshot left as is',
        eventId,
      );
      return null;
    }

    // KNOWN LIMIT (CUL-699/CUL-745), and the mirror image of the child read above:
    // this one reads the LOCAL mirror, where null is ambiguous in a way the deleted
    // reading's own value is not. `hydrateEvents` runs eleven steps ahead of
    // `hydrateWeightChecks` and a failed page skips that table until the next
    // foreground, so on a reinstall or a second device "no reading remains" can mean
    // "this device has not pulled them yet" — and the snapshot is then cleared over a
    // record the server knows is not empty. CUL-575's rule (a read that has not
    // answered is never an empty record) reaching the sync layer. Stated rather than
    // fixed here because app/log.tsx's write path and lib/sync.ts's retry share the
    // same read, so the discrimination belongs in one place across all three; CUL-694
    // largely absorbs it by giving the null a stored displaced value to fall through to.
    const latestKg = await getLatestWeightKg(row.pet_id);
    // What the snapshot becomes IF the gates below agree this reading owns it — the
    // INTENT, which is all this function ever returns. The null is honest rather than
    // lossy: the displaced value was already gone before this delete began (header).
    const intendedSnapshotKg = latestKg ?? (restore ? restore.restoreToKg : null);

    // ── TWO GATES, because there are two copies of the snapshot ──────────────
    // The identity question — "is the snapshot THIS reading's value?" — has to be
    // asked separately of the local copy and the server row, because they are allowed
    // to disagree and the app knows it: `app/log.tsx` patches the store only when its
    // server write SUCCEEDED and the pet is still active, and nothing re-reads `pets`
    // except `usePet`'s `[user]` effect. Asking the store and then acting on the
    // server — which is what the first version of this gate did — gets it wrong in
    // both directions, and the adversarial pass found both:
    //
    //   · a stale store REFUSES a correction the server needs, and when no reading
    //     remains nothing ever heals it (an offline weigh-in synced later, then
    //     removed; or an Undo after a pet switch skipped the store patch) — the
    //     headline defect of this very issue, reproduced through its own fix;
    //   · a stale store PERMITS a write the server must not take — a shared-credential
    //     household where the other device typed a profile weight this one has not
    //     seen yet.

    // Gate 1, the LOCAL view: patch the in-memory pet so the chip / pre-fill /
    // EditPetModal are right on this device immediately, including offline. The store
    // is the right oracle for the store. If it is stale the local patch is simply
    // skipped or slightly wrong, and the next `usePet` fetch settles it — a cosmetic
    // cost, never a destroyed value.
    //
    // BY ID, not `updatePet`: that one can only patch the ACTIVE pet, and a record
    // screen is reached by id for ANY pet (the day-summary spine pushes `/event/[id]`
    // for every pet's rows — CUL-574). Guarding on "is it active?" silently skipped
    // the pet the record belonged to, and `selectPet` never refetches, so switching to
    // that pet re-showed the number the owner had just removed.
    const pet = usePetStore.getState().pets.find((p) => p.id === row.pet_id);
    if (pet?.weight_kg != null && isSameStoredWeight(pet.weight_kg, row.weight_kg)) {
      usePetStore.getState().patchPetById(row.pet_id, { weight_kg: intendedSnapshotKg });
    }

    // Gate 2, the SERVER row: `.eq('weight_kg', …)` makes the database itself answer
    // the identity question, against the authoritative value, atomically, in the write
    // that depends on it. No extra round trip, no oracle to go stale, and no window
    // between deciding and acting. A snapshot that is somebody else's value — an
    // owner-typed profile weight, or a newer reading this delete does not concern —
    // simply matches zero rows and is left exactly as it is.
    //
    // This is the shape the sync-side retry uses too (lib/sync.ts), which is the point:
    // the rule cannot be enforced in one layer and skipped in the other.
    void supabase
      .from('pets')
      .update({ weight_kg: intendedSnapshotKg })
      .eq('id', row.pet_id)
      .eq('weight_kg', row.weight_kg)
      .then(
        ({ error }: { error: { message: string } | null }) => {
          if (error) console.warn('[weight] snapshot reconcile after delete failed:', error.message);
        },
        // A REJECTION, not a returned `{ error }` — a transport-layer throw. Handled
        // rather than left to the platform because this function's contract is that it
        // never throws, and an un-caught rejection from a fire-and-forget cosmetic
        // write is exactly the kind of noise that gets a real one ignored.
        (e: unknown) => console.warn('[weight] snapshot reconcile after delete threw:', e),
      );

    return { petId: row.pet_id, intendedSnapshotKg };
  } catch (e) {
    console.warn('[weight] snapshot reconcile after delete error:', e);
    return null;
  }
}

// ── Trend read (B-186 PR 3) ──────────────────────────────────────────────────
// One weight reading: the measured value + when it was taken. occurred_at lives on
// the parent event (a weight check is an event + its 1:1 child), so the trend is
// ordered by the EVENT's occurred_at — a back-dated reading sorts into its true
// place on the line, not where it happened to be entered.
export interface WeightReading {
  weightKg: number;
  occurredAt: string; // ISO, from the parent event
}

// The most-recent `limit` weight readings for a pet, returned OLDEST-FIRST (the order
// the sparkline draws). Read from the local mirror (joins weight_checks→events for
// occurred_at + the soft-delete filter, since deletedness lives on the parent), so it
// works offline and reflects a just-logged reading immediately. The query takes the
// most-recent N (ORDER BY … DESC LIMIT) then reverses to chronological — so a long
// history shows its latest window, never an ancient prefix.
export async function getWeightHistory(petId: string, limit = 12): Promise<WeightReading[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{ weight_kg: number; occurred_at: string }>(
    `SELECT wc.weight_kg AS weight_kg, e.occurred_at AS occurred_at
       FROM weight_checks wc
       JOIN events e ON e.id = wc.event_id
      WHERE wc.pet_id = ? AND e.deleted_at IS NULL
      ORDER BY e.occurred_at DESC
      LIMIT ?`,
    [petId, limit],
  );
  return (rows ?? [])
    .map((r) => ({ weightKg: r.weight_kg, occurredAt: r.occurred_at }))
    .reverse();
}

// The trend card's view model — derived purely from a pet's readings.
//
// CLINICAL GUARDRAIL (carried from migration 024 / this file's header): this holds
// only NUMBERS and a DIRECTION, never a verdict. Weight LOSS is the danger signal,
// and a rising or flat line is NOT wellness (rising can be fluid/edema). So `direction`
// is descriptive, never valenced — the card that renders this must stay neutral (no
// wellness colour, no "improving", no reassurance). v1 deliberately ships no loss
// flag; that's a separate spec with a mandatory adversarial pass.
export interface WeightTrend {
  readingCount: number;
  seriesLbs: number[]; // oldest-first, rounded 0.1 — the sparkline + delta basis
  latestLbs: number | null;
  latestOccurredAt: string | null;
  earliestOccurredAt: string | null; // first reading in the shown series (the span anchor)
  deltaLbs: number | null; // latestLbs − seriesLbs[0]; null with <2 readings (no trend yet)
  direction: 'up' | 'down' | 'flat' | null;
}

// Reduce a pet's readings into the trend view model. Works in POUNDS (the display
// unit) so the delta equals latest − earliest of the numbers actually drawn — no
// rounding mismatch between the chart points and the caption. Defensive sort: the
// query returns chronological, but a pure fn shouldn't trust its caller.
export function computeWeightTrend(readings: WeightReading[]): WeightTrend {
  const sorted = [...readings].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const seriesLbs = sorted.map((r) => kgToLbsNum(r.weightKg));
  const count = seriesLbs.length;

  if (count === 0) {
    return {
      readingCount: 0, seriesLbs: [], latestLbs: null, latestOccurredAt: null,
      earliestOccurredAt: null, deltaLbs: null, direction: null,
    };
  }

  const latestLbs = seriesLbs[count - 1];
  const latestOccurredAt = sorted[count - 1].occurredAt;
  const earliestOccurredAt = sorted[0].occurredAt;

  // A single reading is a point, not a trend — no delta, no direction (n=1 says
  // nothing about movement). The card shows the value and invites another reading.
  if (count === 1) {
    return {
      readingCount: 1, seriesLbs, latestLbs, latestOccurredAt,
      earliestOccurredAt, deltaLbs: null, direction: null,
    };
  }

  const deltaLbs = Math.round((latestLbs - seriesLbs[0]) * 10) / 10;
  const direction = deltaLbs > 0 ? 'up' : deltaLbs < 0 ? 'down' : 'flat';
  return { readingCount: count, seriesLbs, latestLbs, latestOccurredAt, earliestOccurredAt, deltaLbs, direction };
}

// ── Trend copy (shared by every weight surface) ──────────────────────────────
// These render the trend's owner-facing strings. They live here, pure and tested,
// so the Profile card and the Patterns-dashboard card phrase a trend IDENTICALLY
// and the clinical guardrail can't drift between the two surfaces:
//
//   CLINICAL GUARDRAIL — a weight trend NEVER reassures. The delta line is purely
//   factual ("Down 0.4 lbs since …" / "Up …" / "No change since …"). It must never
//   say "improving", "stable", "steady", "holding", or any word that frames a
//   direction as good — a falling line can be wasting and a rising one can be
//   fluid/edema, so direction stays neutral and the words carry no verdict. The
//   colour/arrow neutrality is the card's job; the WORDS are this function's.

// "Mon D", plus the year when it isn't the current one (an older reading shouldn't
// read as this year's). Local time — occurred_at is converted at the app layer.
export function formatWeightDate(iso: string): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString([], sameYear
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' });
}

// The factual period-delta phrase, or null with fewer than two readings (no trend
// yet — the card shows the value and invites another reading rather than a delta).
// Direction comes from the card (it owns the arrow icon); this owns the WORDS, which
// stay neutral by construction — see the guardrail above.
export function describeWeightDelta(trend: WeightTrend): string | null {
  if (trend.deltaLbs == null || trend.direction == null || !trend.earliestOccurredAt) return null;
  const since = formatWeightDate(trend.earliestOccurredAt);
  const abs = Math.abs(trend.deltaLbs);
  if (trend.direction === 'up') return `Up ${abs} lbs since ${since}`;
  if (trend.direction === 'down') return `Down ${abs} lbs since ${since}`;
  return `No change since ${since}`;
}
