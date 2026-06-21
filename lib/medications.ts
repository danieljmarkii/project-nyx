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
// display key; strengthConfirmed is the §6.5 gate. The gate applies whenever a
// strength is PRESENT — AI-extracted OR hand-typed — because a transposed dose
// (5 mg → 50 mg) is a 10× error regardless of who keyed it, so the owner must
// deliberately confirm their own entry too, not just the AI's. An empty strength
// has nothing to confirm, so it never blocks save.
export function canSaveMedicationCapture(params: {
  genericName: string;
  strength: string;
  strengthConfirmed: boolean;
}): boolean {
  const hasStrength = params.strength.trim().length > 0;
  return params.genericName.trim().length > 0 && (!hasStrength || params.strengthConfirmed);
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

// ── PR 7 regimen compliance (pet-profile "Current medications" card, §5.4) ─────
// The medication analog of the diet-trial compliance % in app/(tabs)/profile.tsx,
// extracted here as PURE, clock-free logic because it is CLINICALLY LOAD-BEARING:
// an adherence read feeds the owner's sense of whether their pet is being treated,
// and the §6 invariants forbid it from ever reassuring on absence. Pinning it in a
// unit test (not a screen) is the clinical-guardrails Pattern 8 stance — the
// never-reassure / never-"fussy" rules are assertions, not comments.
//
// Two safety decisions are baked in here, NOT in the spec's loose "doses logged ÷
// expected" phrasing (which, read literally, would count a logged *missed* dose as
// adherence and violate §6.1):
//
//   1. The numerator is ADMINISTERED doses (adherence='given') ONLY — never the
//      raw count of logged rows. A 'missed'/'refused'/'partial'/unrated dose is
//      NOT adherence. This makes the % under-read when an owner gives but doesn't
//      log a dose — the SAFE direction (§6.1: absence of a logged dose ≠ wellness;
//      we never assume an unlogged dose was given, and never over-reassure).
//   2. The denominator is EXPECTED doses (doses_per_day × elapsed days, §5.4), so a
//      scheduled regimen with zero logged doses is "not tracked" (percent=null),
//      never "0% = compliant" and never "100% = all good".
//
// PRN/as-needed regimens (doses_per_day = NULL) have no adherence target, so they
// report a dose COUNT and never a %.

export type DoseAdherence = 'given' | 'partial' | 'missed' | 'refused';

// Per-regimen counts of its dose-event children, bucketed by adherence. `unrated`
// is a logged dose with NULL adherence (rare — the one-tap path defaults 'given' —
// but a real state the wire mapper preserves; it counts as logged, never as given).
export interface AdherenceTally {
  given: number;
  partial: number;
  missed: number;
  refused: number;
  unrated: number;
}

export interface RegimenComplianceInput {
  // medications.doses_per_day — NULL = PRN/as-needed (no compliance target).
  dosesPerDay: number | null;
  // Whole days the regimen has been running, ≥1 (caller derives from started_at,
  // mirroring the diet-trial card). Kept as a number so this stays clock-free.
  daysElapsed: number;
  tally: AdherenceTally;
}

export interface RegimenCompliance {
  isPrn: boolean;
  expectedDoses: number;     // doses_per_day × daysElapsed; 0 when PRN
  administeredDoses: number; // adherence='given' only (the conservative numerator)
  flaggedDoses: number;      // partial + missed + refused (the §6.2 attention bucket)
  loggedDoses: number;       // every administration considered (given+flagged+unrated)
  // null = not computable as a %: PRN, OR a scheduled regimen with nothing logged
  // yet. A null percent must render as "not tracked", NEVER as "compliant" (§6.1).
  percent: number | null;
}

export function computeRegimenCompliance(input: RegimenComplianceInput): RegimenCompliance {
  const { dosesPerDay, daysElapsed, tally } = input;
  const isPrn = dosesPerDay == null;

  const administeredDoses = tally.given;
  const flaggedDoses = tally.partial + tally.missed + tally.refused;
  const loggedDoses = administeredDoses + flaggedDoses + tally.unrated;

  const safeDays = Math.max(1, Math.floor(daysElapsed));
  const expectedDoses = isPrn ? 0 : Math.round((dosesPerDay as number) * safeDays);

  let percent: number | null = null;
  // Only a scheduled regimen with at least one logged dose gets a %. Zero logged
  // doses → null → "not tracked" (never "0% = compliant"); PRN → null → show a count.
  if (!isPrn && expectedDoses > 0 && loggedDoses > 0) {
    percent = Math.round((administeredDoses / expectedDoses) * 100);
    // Clamp: an owner can log more 'given' doses than the elapsed-days estimate
    // expects (extra doses, same-day catch-up); a >100% adherence reads as nonsense.
    percent = Math.max(0, Math.min(100, percent));
  }

  return { isPrn, expectedDoses, administeredDoses, flaggedDoses, loggedDoses, percent };
}

// Headline adherence line for a regimen card. FACTUAL only — counts and a plain
// "given", never an evaluation ("great", "on track", "doing well"): a wellness
// verdict on adherence is the forbidden n=1 reassurance (§6.1). nyx-voice: no
// exclamation marks, specific over generic.
export function regimenComplianceLine(c: RegimenCompliance): string {
  if (c.isPrn) {
    if (c.loggedDoses === 0) return 'No doses logged yet';
    return c.loggedDoses === 1 ? '1 dose logged' : `${c.loggedDoses} doses logged`;
  }
  if (c.percent == null) {
    // Scheduled regimen, nothing logged. "Not tracked", never "compliant"/"0% fine".
    return 'No doses logged yet';
  }
  // Over-logged (more given doses than the elapsed-days estimate expects — extra
  // taps, same-day catch-up, or a genuine double-dose): "5 of 2 doses" reads broken,
  // so drop the "of N". This is NOT a double-dose flag — detecting that needs
  // per-dose interval timing this card's count-only tally doesn't carry (spec §6.4,
  // deferred to a timestamp-bearing PR). The clamp keeps percent at 100, never 250.
  if (c.administeredDoses > c.expectedDoses) {
    const n = c.administeredDoses;
    return `${c.percent}% given · ${n} ${n === 1 ? 'dose' : 'doses'} logged`;
  }
  return `${c.percent}% given · ${c.administeredDoses} of ${c.expectedDoses} doses`;
}

// The attention line when doses were logged as anything other than cleanly given.
// Returns null when there is nothing to flag. Splits the two clinically-distinct
// buckets per §6.2: refused/partial is a possible DISEASE signal (a pet too
// nauseated or in too much pain to take a pill) → it points to the vet and is NEVER
// softened to "fussy"/"picky"/"stubborn"; a pure owner-skip ('missed') is an
// adherence gap, surfaced plainly without escalation (critical-drug escalation is
// PR 9's curated-match job, not this card's). One calm line, clinical-guardrails.
export function regimenFlagLine(tally: AdherenceTally): string | null {
  const notTaken = tally.refused + tally.partial; // pet didn't (fully) take it
  const missed = tally.missed;                    // owner skipped
  const parts: string[] = [];
  if (notTaken > 0) {
    parts.push(`${notTaken} ${notTaken === 1 ? 'dose' : 'doses'} not fully taken`);
  }
  if (missed > 0) {
    parts.push(`${missed} missed`);
  }
  if (parts.length === 0) return null;
  // refused/partial leans on a health signal → route to the vet, never to "fussy".
  const tail = notTaken > 0 ? ' — worth a word with your vet' : '';
  return parts.join(', ') + tail;
}

// ── PR 7 regimen-setup payload (AddMedicationModal → medications insert/update) ──
// Pure builder + validity check for the regimen write, mirroring the food-model's
// "configure the structured fields ONCE" stance (§3). Extracted so the trimming /
// null-coercion of the many optional fields is testable and one screen can't drift
// from another. NOTE: this builds the COLUMN payload only; pet_id is added by the
// caller from the ACTIVE pet (never from free input) and the write is RLS-gated by
// medications_owner (B-123 — caller-ownership is re-validated by RLS on every
// INSERT/UPDATE; PR 7 has no service-role write path to confuse).

export interface RegimenFormValues {
  drugName: string;
  medicationItemId: string | null; // linked library drug, or null for free-text
  doseAmount: string;
  route: string | null;
  dosesPerDay: number | null;      // null = PRN/as-needed
  scheduleNotes: string;
  indication: string;
  prescribedBy: string;
  startedAt: string;               // 'YYYY-MM-DD'
  targetDurationDays: number | null;
}

// The medications columns a regimen write sets. Deliberately omits status/ended_at
// (lifecycle, set by the create default 'active' and the End action) and the
// server-managed id/created_at/updated_at.
export interface RegimenWritePayload {
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
}

export function buildRegimenPayload(v: RegimenFormValues): RegimenWritePayload {
  return {
    // medication_item_id only when the typed name still matches the linked library
    // drug (the modal unlinks on edit), so a free-text name never carries a stale id.
    medication_item_id: v.medicationItemId,
    drug_name: v.drugName.trim(),
    dose_amount: trimOrNull(v.doseAmount),
    route: v.route,
    doses_per_day: v.dosesPerDay,
    schedule_notes: trimOrNull(v.scheduleNotes),
    indication: trimOrNull(v.indication),
    prescribed_by: trimOrNull(v.prescribedBy),
    started_at: v.startedAt,
    target_duration_days: v.targetDurationDays,
  };
}

// drug_name is the required display/report key (medications.drug_name is NOT NULL,
// and the vet report §7 must always name the drug). Everything else is optional.
export function canSaveRegimen(v: { drugName: string }): boolean {
  return v.drugName.trim().length > 0;
}

// ── PR 8 double-dose detection (§6.4 "a double-dose is a flag, not normalized") ──
// B-135. The PR 7 compliance card counts adherence BUCKETS only (AdherenceTally, no
// per-dose times), so it structurally can't see two doses landing too close together;
// PR 8 is the first surface with the per-dose events.occurred_at this needs. Pure and
// clock-free so the safety invariant ("never silently normalize a double dose") is
// pinned by a unit test, not by which screen happens to compute it (the
// clinical-guardrails Pattern 8 stance — the invariant is a test, not a comment).
//
// Two design decisions, both clinically load-bearing:
//   1. The match key is the DRUG (medication_item_id), NOT the regimen. One-tap doses
//      are ad-hoc (medication_id NULL) today, so same-drug is the only reliable group —
//      and two given doses of the same drug close together is the real concern whether
//      or not a regimen was ever set up. (Regimen-keyed matching is a PR 9 refinement,
//      once dose-logging links a regimen.)
//   2. Only two 'given' doses count. A missed/refused/partial/unrated dose near a given
//      one is NOT an over-dose, and downgrading the focal dose on the detail screen must
//      clear the flag — so the focal dose must be 'given' for the check to fire.

// Conservative bounds on the window. The adversarial review of the first cut
// (half-the-interval, uncapped) BROKE it on over-firing: real owners cluster q8h/q12h
// doses into waking hours (a "with breakfast / with dinner" BID pair is often 5–7h
// apart, not 12h), so a legitimate, on-schedule early dose lands inside half the
// interval and trips the flag — the alarm-fatigue failure that trains owners to
// ignore the very signal it exists to raise. The reviewer's recommended shape is
// schedule-relative with a clinical CAP and FLOOR, applied here:
//   • CAP (2h) sits below the tightest legitimately-early scheduled gap we saw
//     (~3h on a compressed q6h day), so a normal early dose never fires.
//   • FLOOR (1h) keeps an ultra-dense (>q6h) schedule from narrowing so far it
//     misses a clear repeat.
// The deliberate, DOCUMENTED tradeoff: a wide-gap double on a SPARSE schedule (a
// once-daily drug given twice ~6h apart) is NOT flagged — catching it needs a window
// wide enough to re-introduce the over-fire on tighter schedules, which requires
// reliable per-regimen schedule data (PR 9's regimen-linked doses + a Dr. Chen
// window-shape call; logged on B-135). Under-firing is the SAFE direction here: it is
// silence, never a false "all clear" (§6.1 — absence of a flag is never reassurance).
export const DOUBLE_DOSE_WINDOW_CAP_HOURS = 2;
export const DOUBLE_DOSE_WINDOW_FLOOR_HOURS = 1;
// The window with no schedule to derive one from (PRN, or no active regimen hydrated
// locally yet) — the conservative cap. A named constant so Dr. Chen / the PM can tune
// it without hunting through the detector.
export const DEFAULT_DOUBLE_DOSE_WINDOW_HOURS = DOUBLE_DOSE_WINDOW_CAP_HOURS;

// Derive the "too close" window (hours) from a regimen's doses_per_day: HALF the
// scheduled interval (24/dpd), clamped to [FLOOR, CAP] (see above). For common
// schedules the cap binds (q24h/q12h/q8h/q6h → 2h); only an ultra-dense schedule
// narrows it (q3h → 1.5h, q2h → 1h). PRN / unknown / non-positive dpd → the default.
export function doubleDoseWindowHours(dosesPerDay: number | null | undefined): number {
  if (dosesPerDay == null || dosesPerDay <= 0) return DEFAULT_DOUBLE_DOSE_WINDOW_HOURS;
  const halfInterval = 24 / dosesPerDay / 2;
  return Math.min(DOUBLE_DOSE_WINDOW_CAP_HOURS, Math.max(DOUBLE_DOSE_WINDOW_FLOOR_HOURS, halfInterval));
}

// One nearby same-drug dose, as fed to detectDoubleDose. The caller's query already
// scopes these to same-drug / same-pet / non-deleted / focal-excluded; adherence is
// carried so the given-only rule is enforced (and testable) in the pure function.
export interface NearbyDose {
  eventId: string;
  occurredAt: string; // ISO/UTC
  adherence: string | null;
}

export interface DoubleDoseResult {
  conflict: boolean;
  // The CLOSEST conflicting other given-dose (for an optional "view it" link), and
  // the absolute gap to it — both null when there is no conflict.
  otherEventId: string | null;
  gapMinutes: number | null;
}

const NO_DOUBLE_DOSE: DoubleDoseResult = { conflict: false, otherEventId: null, gapMinutes: null };

// Is the focal dose part of a same-drug given/given pair within windowHours? Fires
// only when the FOCAL dose is 'given' and at least one OTHER dose is 'given' within
// the window; returns the closest such dose. The boundary is inclusive (gap == window
// counts). `others` should already be same-drug / non-deleted / focal-excluded; the
// adherence re-check here is the defensive backstop and the testable "a nearby missed
// dose is not a double" guarantee.
export function detectDoubleDose(params: {
  focalOccurredAt: string;
  focalAdherence: string | null;
  others: NearbyDose[];
  windowHours: number;
}): DoubleDoseResult {
  const { focalOccurredAt, focalAdherence, others, windowHours } = params;
  if (focalAdherence !== 'given') return NO_DOUBLE_DOSE;
  const focalMs = new Date(focalOccurredAt).getTime();
  if (Number.isNaN(focalMs)) return NO_DOUBLE_DOSE;
  const windowMs = windowHours * 60 * 60 * 1000;

  let closest: { eventId: string; gapMs: number } | null = null;
  for (const o of others) {
    if (o.adherence !== 'given') continue;
    const oMs = new Date(o.occurredAt).getTime();
    if (Number.isNaN(oMs)) continue;
    const gapMs = Math.abs(oMs - focalMs);
    if (gapMs > windowMs) continue;
    if (!closest || gapMs < closest.gapMs) closest = { eventId: o.eventId, gapMs };
  }
  if (!closest) return NO_DOUBLE_DOSE;
  return { conflict: true, otherEventId: closest.eventId, gapMinutes: Math.round(closest.gapMs / 60000) };
}

// Human, approximate gap for the double-dose note — "about 2 hours", never false
// precision. nyx-voice: plain words, no exclamation.
export function formatDoseGap(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 1) return 'a moment';
  if (m < 60) return m === 1 ? 'a minute' : `${m} minutes`;
  const hours = Math.round(m / 60);
  return hours === 1 ? 'about an hour' : `about ${hours} hours`;
}

// The calm double-dose check copy (§6.4: a flag, never an alarm). Specific (the gap
// + the drug), warm, no exclamation, never accusatory ("you over-dosed!"): it points
// the owner to look, and the detail screen's own adherence-edit + Remove actions are
// how they fix a mistaken log. clinical-guardrails + nyx-voice.
export function doubleDoseNote(params: { drugName: string | null; gapMinutes: number }): string {
  const gap = formatDoseGap(params.gapMinutes);
  const drug = (params.drugName ?? '').trim();
  const other = drug.length > 0 ? `another ${drug} dose` : 'another dose';
  return `Logged within ${gap} of ${other} — worth double-checking it wasn't a repeat.`;
}
