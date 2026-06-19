// Medication local-mirror plumbing (B-117 PR 2).
//
// This module is deliberately FREE of expo-sqlite / supabase imports so its two
// load-bearing, bug-prone pieces are unit-testable in plain jest without the
// native stack — the same pure-split rationale as lib/hydration.ts (reconcile
// logic) and lib/foodQueries.ts (the extracted SQL string):
//
//   1. MEDICATION_SCHEMA_SQL — the EXACT local DDL lib/db.ts initDb runs, so the
//      FK CASCADE / UNIQUE(event_id) / soft-delete-via-parent behaviours can be
//      exercised against an in-memory node:sqlite (see medications.test.ts).
//   2. The local-row → Supabase-upsert payload mappers, where the INTEGER↔BOOLEAN
//      / null / enum coercion of the sync round trip lives.
//
// Everything mirrors the food model 1:1 (spec §3, migration 020):
//   food_items_cache → medication_items_cache  (global catalog cache)
//   diet_trials      → medications             (pet-scoped regimen)
//   meals            → medication_administrations (1:1 dose-event child)

// ── Local schema (mirrors supabase/migrations/020_medication_logging.sql) ─────
//
// Extracted as a string (not inlined in initDb like events/meals) ONLY so the
// production DDL itself is testable — initDb runs this verbatim. Enums are plain
// TEXT locally exactly as events.event_type is; timestamps are ISO/UTC TEXT so
// LWW (parseTs) compares them on one clock. medication_items_cache mirrors
// food_items_cache: no `synced`/`pet_id` (it's a globally-shared read-through
// cache, pull-refreshed by refreshMedicationCache, pushed only as an FK pre-sync).
// medications carries `synced` + a `status` lifecycle (a regimen is "ended", never
// soft-deleted — migration 020). medication_administrations is the meal pattern:
// 1:1 child of an event via UNIQUE event_id, `synced`, and NO own deleted_at — a
// dose's deletedness is read through its parent event's deleted_at.
export const MEDICATION_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS medication_items_cache (
    id              TEXT PRIMARY KEY,
    generic_name    TEXT NOT NULL,
    brand_name      TEXT,
    strength        TEXT,
    form            TEXT,
    default_route   TEXT,
    is_prescription INTEGER NOT NULL DEFAULT 1,
    is_critical     INTEGER NOT NULL DEFAULT 0,
    photo_path      TEXT,
    notes           TEXT,
    cached_at       TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS medications (
    id                   TEXT PRIMARY KEY,
    pet_id               TEXT NOT NULL,
    medication_item_id   TEXT,
    drug_name            TEXT NOT NULL,
    dose_amount          TEXT,
    route                TEXT,
    doses_per_day        REAL,
    schedule_notes       TEXT,
    indication           TEXT,
    prescribed_by        TEXT,
    started_at           TEXT NOT NULL,
    target_duration_days INTEGER,
    status               TEXT NOT NULL DEFAULT 'active',
    ended_at             TEXT,
    notes                TEXT,
    created_at           TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at           TEXT NOT NULL DEFAULT (datetime('now')),
    synced               INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_medications_unsynced
    ON medications(synced)
    WHERE synced = 0;

  CREATE INDEX IF NOT EXISTS idx_medications_active
    ON medications(pet_id, status)
    WHERE status = 'active';

  -- Only event_id is a local FK (mirrors meals: a dose dies with its event).
  -- medication_id / medication_item_id are plain TEXT, NOT local FKs, on purpose —
  -- a dose can hydrate before its regimen / library row does, and a SQLite FK would
  -- reject that insert; the server holds the real (SET NULL) FKs.
  CREATE TABLE IF NOT EXISTS medication_administrations (
    id                  TEXT PRIMARY KEY,
    event_id            TEXT NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
    pet_id              TEXT NOT NULL,
    medication_id       TEXT,
    medication_item_id  TEXT,
    adherence           TEXT,
    dose_amount         TEXT,
    notes               TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
    synced              INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_medication_administrations_unsynced
    ON medication_administrations(synced)
    WHERE synced = 0;
`;

// ── Local row shapes (the columns the sync push reads via SELECT) ─────────────
// Booleans are SQLite INTEGER 0/1; timestamps/dates are TEXT. `synced` is omitted
// from these read-shapes — the mappers below intentionally never forward it.

export interface LocalMedicationItem {
  id: string;
  generic_name: string;
  brand_name: string | null;
  strength: string | null;
  form: string | null;
  default_route: string | null;
  is_prescription: number; // INTEGER 0/1
  is_critical: number; // INTEGER 0/1
}

export interface LocalMedication {
  id: string;
  pet_id: string;
  medication_item_id: string | null;
  drug_name: string;
  dose_amount: string | null;
  route: string | null;
  doses_per_day: number | null;
  schedule_notes: string | null;
  indication: string | null;
  prescribed_by: string | null;
  started_at: string;
  target_duration_days: number | null;
  status: string;
  ended_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LocalMedicationAdministration {
  id: string;
  event_id: string;
  pet_id: string;
  medication_id: string | null;
  medication_item_id: string | null;
  adherence: string | null;
  dose_amount: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ── Supabase upsert payloads (pure mappers) ───────────────────────────────────

export interface RemoteMedicationItemUpsert {
  id: string;
  generic_name: string;
  brand_name: string | null;
  strength: string | null;
  form: string | null;
  default_route: string | null;
  is_prescription: boolean;
  is_critical: boolean;
  created_by_user_id: string;
}

// FK pre-sync payload (supabase-sync Pattern 6): guarantees the medication_items
// row exists server-side before a medications / medication_administrations upsert
// references it. Coerces the two SQLite-INTEGER booleans to real booleans for the
// Postgres BOOLEAN columns (the Boolean(0/1) trap the food pre-sync handles too).
// Used with { ignoreDuplicates: true } so it never clobbers a richer server row
// (photo_paths / ai_extraction_*) written by the PR 5 capture path — which is why
// those columns are deliberately NOT forwarded here.
export function medicationItemRowToRemote(
  row: LocalMedicationItem,
  userId: string,
): RemoteMedicationItemUpsert {
  return {
    id: row.id,
    generic_name: row.generic_name,
    brand_name: row.brand_name,
    strength: row.strength,
    form: row.form,
    default_route: row.default_route,
    is_prescription: Boolean(row.is_prescription),
    is_critical: Boolean(row.is_critical),
    created_by_user_id: userId,
  };
}

export interface RemoteMedicationUpsert {
  id: string;
  pet_id: string;
  medication_item_id: string | null;
  drug_name: string;
  dose_amount: string | null;
  route: string | null;
  doses_per_day: number | null;
  schedule_notes: string | null;
  indication: string | null;
  prescribed_by: string | null;
  started_at: string;
  target_duration_days: number | null;
  status: string;
  ended_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// Regimen → upsert payload (LWW, onConflict id). No booleans; the guard this
// mapper encodes is COMPLETENESS — it forwards every server column and drops the
// local-only `synced` flag, so no column silently desyncs (the B-057
// placeholder/param-drift class, asserted by the key-set test). The server
// set_updated_at trigger rewrites updated_at on the conflict-update branch
// (server-time LWW — see lib/hydration.ts header), so the value we send is
// authoritative only for a brand-new INSERT.
export function medicationRowToRemote(row: LocalMedication): RemoteMedicationUpsert {
  return {
    id: row.id,
    pet_id: row.pet_id,
    medication_item_id: row.medication_item_id,
    drug_name: row.drug_name,
    dose_amount: row.dose_amount,
    route: row.route,
    doses_per_day: row.doses_per_day,
    schedule_notes: row.schedule_notes,
    indication: row.indication,
    prescribed_by: row.prescribed_by,
    started_at: row.started_at,
    target_duration_days: row.target_duration_days,
    status: row.status,
    ended_at: row.ended_at,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export interface RemoteMedicationAdministrationUpsert {
  id: string;
  event_id: string;
  pet_id: string;
  medication_id: string | null;
  medication_item_id: string | null;
  adherence: string | null;
  dose_amount: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// Dose-event child → upsert payload. adherence is nullable like meals.intake_rating
// and is forwarded AS-IS: a dose logged before the owner taps a chip is NULL and
// must stay NULL on the wire — it must never default to 'given', or an unrated dose
// would read as a confirmed-given one (the n=1 never-reassures invariant, spec §6).
// Carries NO deleted_at: a dose's soft-delete rides its parent event's deleted_at
// (migration 020), so there is nothing to send here.
export function administrationRowToRemote(
  row: LocalMedicationAdministration,
): RemoteMedicationAdministrationUpsert {
  return {
    id: row.id,
    event_id: row.event_id,
    pet_id: row.pet_id,
    medication_id: row.medication_id,
    medication_item_id: row.medication_item_id,
    adherence: row.adherence,
    dose_amount: row.dose_amount,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
