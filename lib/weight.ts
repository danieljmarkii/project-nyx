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
import { syncPendingEvents, syncPendingWeightChecks } from './sync';
import { uuid } from './utils';

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
  const row = await db.getFirstAsync<{ weight_kg: number }>(
    `SELECT wc.weight_kg AS weight_kg
       FROM weight_checks wc
       JOIN events e ON e.id = wc.event_id
      WHERE wc.pet_id = ? AND e.deleted_at IS NULL
      ORDER BY e.occurred_at DESC
      LIMIT 1`,
    [petId],
  );
  return row?.weight_kg ?? null;
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
