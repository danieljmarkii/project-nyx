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

// ── PR 5 capture confirm gate (§6.5 — never silently trust an AI-extracted dose) ─
// Pure predicates behind app/medication-capture.tsx's dose-confirm-required gate.
// Extracted here ON PURPOSE so the safety invariant is pinned by a unit test
// (clinical-guardrails Pattern 8 — "the invariant is a test, not a comment"),
// not by which setStep() the navigation happens to call. The screen wires these
// into applyExtraction (the seed) and BOTH the confirm and edit screens' canSave,
// so no screen can save an unverified AI strength and a future confirm→edit route
// can't silently smuggle one past the gate.

// The seed for `strengthConfirmed` when an AI extraction arrives. A PRESENT
// (non-empty) AI strength must be verified by the owner before save, so the gate
// starts CLOSED (false). No AI strength = nothing to mistrust = gate OPEN (true);
// a missing strength is safe, a wrong one is not (spec §6.5).
export function initialStrengthConfirmed(aiStrength: string | null | undefined): boolean {
  return (aiStrength ?? '').trim().length === 0;
}

// Whether a captured medication may be saved. generic name is the required
// display key; strengthConfirmed is the §6.5 gate — an unverified AI strength
// blocks save on EVERY screen, by construction.
export function canSaveMedicationCapture(params: {
  genericName: string;
  strengthConfirmed: boolean;
}): boolean {
  return params.genericName.trim().length > 0 && params.strengthConfirmed;
}

// ── Shared form/route option lists (the medication_form / medication_route enum
// members, migration 020) ─────────────────────────────────────────────────────
// Single source of truth for both the capture confirm screen (app/medication-
// capture.tsx) and the PR 6 detail/edit screen (app/medication/[id].tsx). Kept
// here — not duplicated per screen — because the VALUES must match the DB enums
// exactly; one list can't drift from the other. Plain {value,label} data, no
// imports, so lib/medications.ts stays I/O-free and unit-testable.
export const MEDICATION_FORM_OPTIONS: { value: string; label: string }[] = [
  { value: 'tablet',      label: 'Tablet' },
  { value: 'capsule',     label: 'Capsule' },
  { value: 'liquid',      label: 'Liquid' },
  { value: 'chewable',    label: 'Chewable' },
  { value: 'transdermal', label: 'Transdermal' },
  { value: 'injection',   label: 'Injection' },
  { value: 'drops',       label: 'Drops' },
  { value: 'ointment',    label: 'Ointment' },
  { value: 'powder',      label: 'Powder' },
  { value: 'other',       label: 'Other' },
];

export const MEDICATION_ROUTE_OPTIONS: { value: string; label: string }[] = [
  { value: 'oral',       label: 'Oral' },
  { value: 'topical',    label: 'Topical' },
  { value: 'otic',       label: 'Ear' },
  { value: 'ophthalmic', label: 'Eye' },
  { value: 'injectable', label: 'Injectable' },
  { value: 'inhaled',    label: 'Inhaled' },
  { value: 'rectal',     label: 'Rectal' },
  { value: 'other',      label: 'Other' },
];

// ── PR 6 detail/edit allow-list (app/medication/[id].tsx) ──────────────────────
// The medication_items columns the owner may edit on the detail screen, and the
// pure builder for the UPDATE payload. Extracted here — NOT inlined in the screen
// — so the ownership / privacy boundary is a TEST, not a comment (the same
// "invariant is a test" stance as initialStrengthConfirmed above, and
// clinical-guardrails Pattern 8). The builder's key set IS the allow-list:
//
//  • B-131 — `created_by_user_id` (and any ownership field) is NEVER writable.
//    migration 020's medication_items_update is `USING (auth.uid() =
//    created_by_user_id)` with NO `WITH CHECK`, so Postgres does not constrain the
//    post-update row — the ONLY thing preventing a row from being "given away" by
//    rewriting created_by_user_id is that the client never sends it. This builder
//    is that guarantee (pinned by medications.test.ts).
//  • B-122 — `notes` is globally-readable catalog free-text that outlives a B-039
//    hard delete, so it is deliberately NOT editable here (no pet/owner identity
//    into the shared catalog; identifying notes belong on the pet-scoped,
//    RLS-protected medications/medication_administrations rows).
//  • is_critical — owner-set critical classification is OUT OF SCOPE for v1 (spec
//    §10 / open sub-decision S2): it is a clinical, curated-match judgement that
//    gates the §6.3 missed-critical-dose escalation, derived at PR 9, never an
//    owner toggle. Omitted from the allow-list on purpose.
//  • photo_paths / ai_extraction_* — capture-path provenance; the photo is
//    replaced through a separate, explicit write, never this descriptive update.
export interface MedicationItemEdit {
  generic_name: string;
  brand_name: string | null;
  strength: string | null;
  form: string | null;
  default_route: string | null;
  is_prescription: boolean;
}

function trimOrNull(s: string | null): string | null {
  const t = (s ?? '').trim();
  return t.length > 0 ? t : null;
}

export function buildMedicationItemUpdate(edit: MedicationItemEdit): MedicationItemEdit {
  return {
    generic_name: edit.generic_name.trim(),
    brand_name: trimOrNull(edit.brand_name),
    strength: trimOrNull(edit.strength),
    form: edit.form,
    default_route: edit.default_route,
    is_prescription: edit.is_prescription,
  };
}

// Did anything the detail screen can edit actually change? Lets Save short-circuit
// to a plain back-navigation when nothing did (no needless write — mirrors
// food/[id].tsx). Compares the NORMALIZED payloads so a whitespace-only edit
// correctly reads as no change.
export function hasMedicationItemChanges(a: MedicationItemEdit, b: MedicationItemEdit): boolean {
  const na = buildMedicationItemUpdate(a);
  const nb = buildMedicationItemUpdate(b);
  return (
    na.generic_name !== nb.generic_name ||
    na.brand_name !== nb.brand_name ||
    na.strength !== nb.strength ||
    na.form !== nb.form ||
    na.default_route !== nb.default_route ||
    na.is_prescription !== nb.is_prescription
  );
}

// Save-button enabled state for the detail edit. generic_name is the required
// display key; strength needs NO confirm gate here (unlike capture §6.5) — a
// human typing a value on the edit screen IS the verification, and the detail
// screen has no AI re-extraction path that could smuggle an unverified strength
// past it.
export function canSaveMedicationItemEdit(edit: { generic_name: string }): boolean {
  return edit.generic_name.trim().length > 0;
}
