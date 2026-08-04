// B-117 PR 2 — the two testable halves of the medication local-mirror plumbing:
//
//   1. The pure row→Supabase-payload mappers, where the INTEGER↔BOOLEAN / null /
//      enum coercion of the sync round trip lives (the bug-prone half).
//   2. MEDICATION_SCHEMA_SQL — the EXACT production DDL lib/db.ts initDb runs —
//      exercised against an in-memory node:sqlite, the same harness as
//      lib/foodQueries.test.ts. The expo-sqlite jest mock never runs the DDL, so
//      the load-bearing local-FK behaviours (UNIQUE(event_id), ON DELETE CASCADE
//      from the parent event, and crucially that a SOFT delete LEAVES the dose
//      child — the PR 2 cross-device-delete AC) are otherwise unverified until
//      on-device.

import {
  medicationItemRowToRemote,
  medicationRowToRemote,
  administrationRowToRemote,
  initialStrengthConfirmed,
  canSaveMedicationCapture,
  buildMedicationItemUpdate,
  hasMedicationItemChanges,
  canSaveMedicationItemEdit,
  computeRegimenCompliance,
  dosesTowardTarget,
  doseCourseProgress,
  regimenDaysElapsed,
  attributeDosesToRegimens,
  attributeDoses,
  mapDoseRowsToAttributable,
  tallyDoses,
  emptyTally,
  regimenComplianceLine,
  regimenFlagLine,
  buildRegimenPayload,
  canSaveRegimen,
  resolveDurationColumns,
  doubleDoseWindowHours,
  detectDoubleDose,
  formatDoseGap,
  doubleDoseNote,
  DEFAULT_DOUBLE_DOSE_WINDOW_HOURS,
  DOUBLE_DOSE_WINDOW_CAP_HOURS,
  DOUBLE_DOSE_WINDOW_FLOOR_HOURS,
  MEDICATION_SCHEMA_SQL,
  MEDICATION_VEHICLE_OPTIONS,
  vehicleLabel,
  formatDrugLabel,
  asDoseVehicle,
  inferDoseVehicleFromFoodType,
  isVehicleNotFinished,
  initialComboDoseAdherence,
  isComboDoseInDoubt,
  doseAdherencePrompt,
  drugDisplayName,
  isGivenAssumed,
  comboInDoubtReason,
  comboConfirmHeadsUp,
  doseInDoubtNote,
  DOSE_IN_DOUBT_TAG,
  pairedVehicleLinkLabel,
  pairedDoseLinkLabel,
  COMMON_MEDICATIONS,
  commonMedicationsForSpecies,
  type CommonMedication,
  type DoseVehicle,
  type LocalMedicationItem,
  type LocalMedication,
  type LocalMedicationAdministration,
  type MedicationItemEdit,
  type AdherenceTally,
  type RegimenWindow,
  type AttributableDose,
  type RegimenFormValues,
  type NearbyDose,
} from './medications';

// No-flag tally helper — every dose cleanly given unless a test says otherwise.
function tally(over: Partial<AdherenceTally> = {}): AdherenceTally {
  return { given: 0, partial: 0, missed: 0, refused: 0, unrated: 0, ...over };
}

describe('medicationItemRowToRemote — FK pre-sync payload (Pattern 6)', () => {
  const base: LocalMedicationItem = {
    id: 'item-1',
    generic_name: 'prednisolone',
    brand_name: 'Apoquel',
    strength: '5 mg',
    form: 'tablet',
    default_route: 'oral',
    is_prescription: 1,
    is_critical: 0,
  };

  it('coerces the SQLite INTEGER booleans to real booleans for the Postgres BOOLEAN columns', () => {
    const out = medicationItemRowToRemote(base, 'user-1');
    expect(out.is_prescription).toBe(true);
    expect(out.is_critical).toBe(false);
    const inverse = medicationItemRowToRemote({ ...base, is_prescription: 0, is_critical: 1 }, 'user-1');
    expect(inverse.is_prescription).toBe(false);
    expect(inverse.is_critical).toBe(true);
  });

  it('stamps created_by_user_id for the creator-locked RLS insert', () => {
    expect(medicationItemRowToRemote(base, 'user-9').created_by_user_id).toBe('user-9');
  });

  it('forwards exactly the columns it owns — no synced/cached_at/photo_paths leak (B-057 drift guard)', () => {
    // A stray local-only key would error against the medication_items schema.
    // ignoreDuplicates means we deliberately do NOT push photo_paths /
    // ai_extraction_* — the capture path owns those.
    expect(Object.keys(medicationItemRowToRemote(base, 'user-1')).sort()).toEqual(
      [
        'brand_name', 'created_by_user_id', 'default_route', 'form', 'generic_name',
        'id', 'is_critical', 'is_prescription', 'strength',
      ].sort(),
    );
  });
});

describe('medicationRowToRemote — regimen upsert payload', () => {
  const reg: LocalMedication = {
    id: 'med-1',
    pet_id: 'pet-1',
    medication_item_id: 'item-1',
    drug_name: 'prednisolone',
    dose_amount: '5 mg',
    route: 'oral',
    doses_per_day: 2,
    schedule_notes: '8am & 8pm',
    indication: 'allergic dermatitis',
    prescribed_by: 'Dr. Chen',
    started_at: '2026-06-01',
    target_duration_days: 7,
    target_duration_doses: null, // B-618 — days-denominated, so doses is null
    status: 'active',
    ended_at: null,
    notes: null,
    created_at: '2026-06-01T10:00:00.000Z',
    updated_at: '2026-06-01T10:00:00.000Z',
  };

  it('forwards every server column and drops the local-only synced flag', () => {
    expect(Object.keys(medicationRowToRemote(reg)).sort()).toEqual(
      [
        'created_at', 'dose_amount', 'doses_per_day', 'drug_name', 'ended_at', 'id',
        'indication', 'medication_item_id', 'notes', 'pet_id', 'prescribed_by', 'route',
        'schedule_notes', 'started_at', 'status', 'target_duration_days',
        'target_duration_doses', 'updated_at',
      ].sort(),
    );
  });

  it('passes a PRN regimen (null doses_per_day) and an ad-hoc null item through unchanged', () => {
    const prn = medicationRowToRemote({ ...reg, doses_per_day: null, medication_item_id: null });
    expect(prn.doses_per_day).toBeNull();
    expect(prn.medication_item_id).toBeNull();
    expect(prn.drug_name).toBe('prednisolone'); // denormalized name still carried
  });

  it('forwards a doses-denominated course verbatim, days null (B-618)', () => {
    // A fixed course dispensed as "#28, until gone": the mapper carries the doses
    // target up unchanged and leaves days null — the DB's one-denomination CHECK is
    // never violated because the two are already mutually exclusive on the row.
    const doses = medicationRowToRemote({
      ...reg, target_duration_days: null, target_duration_doses: 28,
    });
    expect(doses.target_duration_doses).toBe(28);
    expect(doses.target_duration_days).toBeNull();
  });
});

describe('administrationRowToRemote — dose-event child payload', () => {
  const dose: LocalMedicationAdministration = {
    id: 'adm-1',
    event_id: 'evt-1',
    pet_id: 'pet-1',
    medication_id: 'med-1',
    medication_item_id: 'item-1',
    adherence: 'given',
    dose_amount: '5 mg',
    how_given: 'in_treat',
    paired_event_id: null,
    logged_via: 'app', // B-289 — provenance rides the push (W3)
    notes: null,
    created_at: '2026-06-01T10:00:00.000Z',
    updated_at: '2026-06-01T10:00:00.000Z',
  };

  it('forwards every server column and carries NO deleted_at (soft-delete rides the parent event)', () => {
    // B-057 drift guard: the key set IS the column contract. how_given (Slice B) and
    // paired_event_id (Slice C, PR B2) are now part of it; a stray local-only key would
    // error against the Postgres schema, and a MISSING one would silently desync.
    const keys = Object.keys(administrationRowToRemote(dose));
    expect(keys).not.toContain('deleted_at');
    expect(keys).not.toContain('synced');
    expect(keys.sort()).toEqual(
      [
        'adherence', 'created_at', 'dose_amount', 'event_id', 'how_given', 'id',
        'logged_via', 'medication_id', 'medication_item_id', 'notes', 'paired_event_id',
        'pet_id', 'updated_at',
      ].sort(),
    );
  });

  it('keeps an unrated dose NULL on the wire — never defaults to given (n=1 §6)', () => {
    // A dose logged before the owner taps a chip is adherence=NULL; sending it as
    // 'given' would read as a confirmed dose the owner never confirmed.
    expect(administrationRowToRemote({ ...dose, adherence: null }).adherence).toBeNull();
  });

  it('passes an ad-hoc one-off dose (null medication_id = no regimen) through', () => {
    expect(administrationRowToRemote({ ...dose, medication_id: null }).medication_id).toBeNull();
  });

  it('forwards how_given AS-IS for the round trip (B-156 Slice B)', () => {
    // The vehicle is a descriptive fact carried verbatim device→Supabase; the wire
    // must not rewrite it. Every enum member passes through untouched.
    for (const vehicle of ['direct', 'in_food', 'in_treat', 'in_pill_pocket', 'other']) {
      expect(administrationRowToRemote({ ...dose, how_given: vehicle }).how_given).toBe(vehicle);
    }
  });

  it('keeps an unset how_given NULL on the wire — never coerced to a default (renders clean)', () => {
    // A dose logged without recording the vehicle (the one-tap path) is how_given=NULL
    // and must stay NULL — never fabricated to 'direct'. An absent vehicle is simply
    // absent; it carries no safety meaning, so there is nothing to default it to.
    expect(administrationRowToRemote({ ...dose, how_given: null }).how_given).toBeNull();
  });

  it('forwards paired_event_id AS-IS for the round trip (B-156 Slice C)', () => {
    // The combo link is a plain UUID carried verbatim device→Supabase; the wire must
    // not rewrite it. Validation of WHICH event it may point at (same pet) is the
    // server-side migration-023 trigger's job, not this mapper's — the mapper only
    // guarantees the value travels unchanged.
    const linked = administrationRowToRemote({ ...dose, paired_event_id: 'evt-meal-42' });
    expect(linked.paired_event_id).toBe('evt-meal-42');
  });

  it('keeps an unlinked dose paired_event_id NULL on the wire — never fabricated (B-156 Slice C)', () => {
    // The ~99% standalone dose (one-tap / "Log a dose" / quick-log) has no co-logged
    // food, so paired_event_id is NULL and must stay NULL. There is nothing to default
    // a non-combo dose's link to — an absent link is simply absent.
    expect(administrationRowToRemote({ ...dose, paired_event_id: null }).paired_event_id).toBeNull();
  });
});

// ── Real-DDL schema behaviours (in-memory node:sqlite) ───────────────────────
// node:sqlite is Node ≥ 22 core; require() keeps it off the babel/jest-expo path
// (same loader trick as lib/foodQueries.test.ts).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  // Minimal parent events table (the FK target). Only the columns the dose child
  // and the soft-delete check touch — the full production events DDL is exercised
  // on-device. medication_administrations.event_id REFERENCES events(id).
  db.exec(`CREATE TABLE events (
    id TEXT PRIMARY KEY, event_type TEXT, occurred_at TEXT, deleted_at TEXT
  );`);
  db.exec(MEDICATION_SCHEMA_SQL);
  return db;
}

describe('MEDICATION_SCHEMA_SQL — production local DDL', () => {
  it('round-trips a regimen and a dose child, defaulting both to unsynced + active', () => {
    const db = freshDb();
    db.exec(`INSERT INTO events (id, event_type) VALUES ('evt-1', 'medication');`);
    db.exec(`INSERT INTO medications (id, pet_id, drug_name, started_at) VALUES ('med-1', 'pet-1', 'prednisolone', '2026-06-01');`);
    db.exec(`INSERT INTO medication_administrations (id, event_id, pet_id, medication_id, adherence)
             VALUES ('adm-1', 'evt-1', 'pet-1', 'med-1', 'given');`);

    const med = db.prepare('SELECT * FROM medications WHERE id = ?').get('med-1') as Record<string, unknown>;
    expect(med.status).toBe('active'); // server default mirrored
    expect(med.synced).toBe(0); // queued for push

    const adm = db.prepare('SELECT * FROM medication_administrations WHERE id = ?').get('adm-1') as Record<string, unknown>;
    expect(adm.event_id).toBe('evt-1');
    expect(adm.synced).toBe(0);
    db.close();
  });

  it('round-trips target_duration_doses through the local mirror; NULL for a days/ongoing course (B-618)', () => {
    // The B-618 §3 local mirror column. A doses-denominated course must survive a
    // write→read against the EXACT production DDL, and a days/ongoing course must
    // read back NULL — not 0, not an empty string — the honest "no doses target"
    // value the count predicate depends on. (Local SQLite carries no CHECK, so this
    // only proves the column exists and round-trips; the mutual-exclusion invariant
    // is the server's, migration 049.)
    const db = freshDb();
    db.exec(`INSERT INTO medications (id, pet_id, drug_name, started_at, target_duration_doses)
             VALUES ('med-doses', 'pet-1', 'metronidazole', '2026-06-01', 28);`);
    db.exec(`INSERT INTO medications (id, pet_id, drug_name, started_at, target_duration_days)
             VALUES ('med-days', 'pet-1', 'prednisolone', '2026-06-01', 7);`);
    const doses = db.prepare('SELECT target_duration_doses, target_duration_days FROM medications WHERE id = ?').get('med-doses') as Record<string, unknown>;
    expect(doses.target_duration_doses).toBe(28);
    expect(doses.target_duration_days).toBeNull();
    const days = db.prepare('SELECT target_duration_doses FROM medications WHERE id = ?').get('med-days') as Record<string, unknown>;
    expect(days.target_duration_doses).toBeNull();
    db.close();
  });

  it('round-trips a dose how_given value through the local mirror (B-156 Slice B)', () => {
    // The vehicle column the write path (insertMedicationDose) and the hydration pull
    // both populate. A set value must survive a write→read against the EXACT production
    // DDL — proving the column exists and the local round-trip half of the AC holds.
    const db = freshDb();
    db.exec(`INSERT INTO events (id, event_type) VALUES ('evt-1', 'medication');`);
    db.exec(`INSERT INTO medication_administrations (id, event_id, pet_id, adherence, how_given)
             VALUES ('adm-1', 'evt-1', 'pet-1', 'given', 'in_treat');`);
    const adm = db.prepare('SELECT how_given FROM medication_administrations WHERE id = ?').get('adm-1') as Record<string, unknown>;
    expect(adm.how_given).toBe('in_treat');
    db.close();
  });

  it('defaults how_given to NULL when a dose is logged without one (renders clean)', () => {
    // The one-tap path doesn't record a vehicle; the column must read back NULL — not
    // an empty string or a fabricated default — the same clean-absence rule as adherence.
    const db = freshDb();
    db.exec(`INSERT INTO events (id, event_type) VALUES ('evt-1', 'medication');`);
    db.exec(`INSERT INTO medication_administrations (id, event_id, pet_id, adherence)
             VALUES ('adm-1', 'evt-1', 'pet-1', 'given');`);
    const adm = db.prepare('SELECT how_given FROM medication_administrations WHERE id = ?').get('adm-1') as Record<string, unknown>;
    expect(adm.how_given).toBeNull();
    db.close();
  });

  it('round-trips a dose paired_event_id through the local mirror (B-156 Slice C)', () => {
    // The combo-link column the write path (insertMedicationDose) and the hydration pull
    // both populate. A set value must survive a write→read against the EXACT production
    // DDL — proving the column exists locally and the device-side round-trip half of the
    // AC holds (the cross-pet integrity guard is server-side, migration 023, not local).
    const db = freshDb();
    db.exec(`INSERT INTO events (id, event_type) VALUES ('evt-meal', 'meal');`);
    db.exec(`INSERT INTO events (id, event_type) VALUES ('evt-dose', 'medication');`);
    db.exec(`INSERT INTO medication_administrations (id, event_id, pet_id, adherence, paired_event_id)
             VALUES ('adm-1', 'evt-dose', 'pet-1', 'given', 'evt-meal');`);
    const adm = db.prepare('SELECT paired_event_id FROM medication_administrations WHERE id = ?').get('adm-1') as Record<string, unknown>;
    expect(adm.paired_event_id).toBe('evt-meal');
    db.close();
  });

  it('defaults paired_event_id to NULL for a standalone dose (renders clean)', () => {
    // The standalone dose (no co-logged food) doesn't set the link; the column must read
    // back NULL — not an empty string or a fabricated default — the same clean-absence
    // rule as adherence/how_given. ~99% of doses are standalone, so this is the norm.
    const db = freshDb();
    db.exec(`INSERT INTO events (id, event_type) VALUES ('evt-1', 'medication');`);
    db.exec(`INSERT INTO medication_administrations (id, event_id, pet_id, adherence)
             VALUES ('adm-1', 'evt-1', 'pet-1', 'given');`);
    const adm = db.prepare('SELECT paired_event_id FROM medication_administrations WHERE id = ?').get('adm-1') as Record<string, unknown>;
    expect(adm.paired_event_id).toBeNull();
    db.close();
  });

  it('enforces UNIQUE(event_id) — one dose child per event (the 1:1 meal pattern)', () => {
    const db = freshDb();
    db.exec(`INSERT INTO events (id) VALUES ('evt-1');`);
    db.exec(`INSERT INTO medication_administrations (id, event_id, pet_id) VALUES ('adm-1', 'evt-1', 'pet-1');`);
    expect(() =>
      db.exec(`INSERT INTO medication_administrations (id, event_id, pet_id) VALUES ('adm-2', 'evt-1', 'pet-1');`),
    ).toThrow();
    db.close();
  });

  it('rejects a dose child whose parent event does not exist (FK enforced)', () => {
    const db = freshDb();
    expect(() =>
      db.exec(`INSERT INTO medication_administrations (id, event_id, pet_id) VALUES ('adm-x', 'missing', 'pet-1');`),
    ).toThrow();
    db.close();
  });

  it('CASCADE-deletes the dose child when its parent event is HARD-deleted', () => {
    const db = freshDb();
    db.exec(`INSERT INTO events (id) VALUES ('evt-1');`);
    db.exec(`INSERT INTO medication_administrations (id, event_id, pet_id) VALUES ('adm-1', 'evt-1', 'pet-1');`);
    db.exec(`DELETE FROM events WHERE id = 'evt-1';`);
    expect(db.prepare('SELECT * FROM medication_administrations').all()).toHaveLength(0);
    db.close();
  });

  it('SOFT-deleting the parent event LEAVES the dose child (deletedness read through the event)', () => {
    // The PR 2 cross-device AC path: a soft delete is an UPDATE of events.deleted_at,
    // NOT a row delete — so the dose child stays and reads hide it by joining the
    // event's deleted_at filter. This is exactly why medication_administrations has
    // no own deleted_at column.
    const db = freshDb();
    db.exec(`INSERT INTO events (id, deleted_at) VALUES ('evt-1', NULL);`);
    db.exec(`INSERT INTO medication_administrations (id, event_id, pet_id) VALUES ('adm-1', 'evt-1', 'pet-1');`);
    db.exec(`UPDATE events SET deleted_at = '2026-06-02T00:00:00.000Z' WHERE id = 'evt-1';`);
    expect(db.prepare('SELECT * FROM medication_administrations').all()).toHaveLength(1);
    db.close();
  });

  it('indexes the unsynced queue scan on all three queued tables', () => {
    // Pattern 7: a partial index on synced=0 keeps the push sweep bounded.
    const db = freshDb();
    const names = (db.prepare(`SELECT name FROM sqlite_master WHERE type='index'`).all() as { name: string }[])
      .map((r) => r.name);
    expect(names).toContain('idx_medications_unsynced');
    expect(names).toContain('idx_medication_administrations_unsynced');
    expect(names).toContain('idx_medications_active');
    db.close();
  });
});

// The §6.5 dose-confirm gate as a TEST, not just component wiring (clinical-
// guardrails Pattern 8). These two predicates are the whole safety contract:
// an AI-extracted strength cannot reach a saved medication without the owner
// verifying it against the label.
describe('initialStrengthConfirmed — gate seed (§6.5)', () => {
  it('starts CLOSED for a present AI strength (must be verified)', () => {
    expect(initialStrengthConfirmed('5 mg')).toBe(false);
    expect(initialStrengthConfirmed('0.5 mg')).toBe(false);
    expect(initialStrengthConfirmed('16 mg/mL')).toBe(false);
  });

  it('starts OPEN when there is no AI strength to mistrust', () => {
    // A missing strength is the explicitly-safe state (§6.5) — nothing to verify.
    expect(initialStrengthConfirmed('')).toBe(true);
    expect(initialStrengthConfirmed('   ')).toBe(true);
    expect(initialStrengthConfirmed(null)).toBe(true);
    expect(initialStrengthConfirmed(undefined)).toBe(true);
  });
});

describe('canSaveMedicationCapture — the gate (§6.5)', () => {
  it('blocks save while a PRESENT strength is unverified — AI OR hand-typed, on EVERY screen', () => {
    // The load-bearing assertion: no path (confirm OR edit) can save until a
    // present strength is confirmed. A future confirm→edit route cannot smuggle one
    // past, and a hand-typed strength is gated exactly like an AI one — a transposed
    // 5 mg → 50 mg is a 10× dosing error regardless of who keyed it.
    expect(canSaveMedicationCapture({ genericName: 'prednisolone', strength: '5 mg', strengthConfirmed: false })).toBe(false);
  });

  it('allows save once a present strength is verified (ticked)', () => {
    expect(canSaveMedicationCapture({ genericName: 'prednisolone', strength: '5 mg', strengthConfirmed: true })).toBe(true);
  });

  it('does not gate an empty strength — nothing to confirm, so it never blocks save', () => {
    // No strength = nothing to mistrust. The unconfirmed gate must NOT block an
    // otherwise-valid save, or a no-strength manual entry would be unsaveable.
    expect(canSaveMedicationCapture({ genericName: 'prednisolone', strength: '', strengthConfirmed: false })).toBe(true);
    expect(canSaveMedicationCapture({ genericName: 'prednisolone', strength: '   ', strengthConfirmed: false })).toBe(true);
  });

  it('requires a non-empty medication name regardless of the gate', () => {
    expect(canSaveMedicationCapture({ genericName: '', strength: '5 mg', strengthConfirmed: true })).toBe(false);
    expect(canSaveMedicationCapture({ genericName: '   ', strength: '', strengthConfirmed: true })).toBe(false);
  });
});

// ── PR 6 detail/edit allow-list (app/medication/[id].tsx) ──────────────────────
// The B-131 / B-122 / §10 boundary as a TEST, not a comment: the UPDATE payload
// the detail screen sends can NEVER carry an ownership field, the globally-readable
// `notes` sink, or the clinical is_critical flag — by construction of the builder.
describe('buildMedicationItemUpdate — owner-editable allow-list', () => {
  const edit: MedicationItemEdit = {
    generic_name: '  Prednisolone  ',
    brand_name: '  Apoquel ',
    strength: ' 5 mg ',
    form: 'tablet',
    default_route: 'oral',
    is_prescription: true,
  };

  it('exposes EXACTLY the six owner-editable columns', () => {
    expect(Object.keys(buildMedicationItemUpdate(edit)).sort()).toEqual(
      ['brand_name', 'default_route', 'form', 'generic_name', 'is_prescription', 'strength'].sort(),
    );
  });

  // The load-bearing guard. medication_items_update has USING but no WITH CHECK
  // (migration 020), so the client never sending these keys is the ONLY thing
  // that keeps a row from being given away (created_by_user_id, B-131), keeps
  // pet/owner PII out of the world-readable catalog (notes, B-122), and keeps the
  // clinical critical flag out of owner hands (is_critical, §10/S2).
  it.each([
    'created_by_user_id',
    'id',
    'notes',
    'is_critical',
    'photo_paths',
    'ai_extraction_status',
    'ai_extraction_error',
    'ai_extraction_confidence',
    'pet_id',
    'created_at',
    'updated_at',
  ])('never includes the forbidden key %s', (key) => {
    expect(Object.keys(buildMedicationItemUpdate(edit))).not.toContain(key);
  });

  it('trims the required generic name and nulls blank optional fields', () => {
    const out = buildMedicationItemUpdate({ ...edit, brand_name: '   ', strength: '' });
    expect(out.generic_name).toBe('Prednisolone');
    expect(out.brand_name).toBeNull();
    expect(out.strength).toBeNull();
  });

  it('preserves trimmed optional values and the form/route/Rx selections', () => {
    const out = buildMedicationItemUpdate(edit);
    expect(out.brand_name).toBe('Apoquel');
    expect(out.strength).toBe('5 mg');
    expect(out.form).toBe('tablet');
    expect(out.default_route).toBe('oral');
    expect(out.is_prescription).toBe(true);
  });

  it('carries a null form/route through (unset is a legitimate state)', () => {
    const out = buildMedicationItemUpdate({ ...edit, form: null, default_route: null });
    expect(out.form).toBeNull();
    expect(out.default_route).toBeNull();
  });
});

describe('hasMedicationItemChanges — Save short-circuit', () => {
  const base: MedicationItemEdit = {
    generic_name: 'Prednisolone', brand_name: 'Apoquel', strength: '5 mg',
    form: 'tablet', default_route: 'oral', is_prescription: true,
  };

  it('returns false when nothing changed', () => {
    expect(hasMedicationItemChanges(base, { ...base })).toBe(false);
  });

  it('ignores whitespace-only differences (normalized compare)', () => {
    expect(hasMedicationItemChanges(base, { ...base, strength: ' 5 mg ', generic_name: 'Prednisolone ' })).toBe(false);
  });

  it('treats a blanked optional and a null optional as the same (no spurious write)', () => {
    expect(hasMedicationItemChanges({ ...base, brand_name: null }, { ...base, brand_name: '   ' })).toBe(false);
  });

  it('detects a real change in any editable field', () => {
    expect(hasMedicationItemChanges(base, { ...base, strength: '10 mg' })).toBe(true);
    expect(hasMedicationItemChanges(base, { ...base, is_prescription: false })).toBe(true);
    expect(hasMedicationItemChanges(base, { ...base, form: 'liquid' })).toBe(true);
    expect(hasMedicationItemChanges(base, { ...base, default_route: 'topical' })).toBe(true);
    expect(hasMedicationItemChanges(base, { ...base, brand_name: 'Atopica' })).toBe(true);
  });
});

describe('canSaveMedicationItemEdit', () => {
  it('requires a non-empty generic name (the display key)', () => {
    expect(canSaveMedicationItemEdit({ generic_name: 'Pred' })).toBe(true);
    expect(canSaveMedicationItemEdit({ generic_name: '' })).toBe(false);
    expect(canSaveMedicationItemEdit({ generic_name: '   ' })).toBe(false);
  });
});

// ── PR 7 regimen compliance — the clinically load-bearing adherence read (§5.4/§6) ─
// These assertions ARE the safety contract (clinical-guardrails Pattern 8): the %
// never counts a missed/refused dose as adherence, and an empty regimen never reads
// as "compliant".
describe('attributeDosesToRegimens — dose→regimen counting (B-135 item+window match)', () => {
  const reg = (over: Partial<RegimenWindow> = {}): RegimenWindow => ({
    id: 'reg-1', medication_item_id: 'item-pred', started_at: '2026-06-10', ended_at: null, ...over,
  });
  const dose = (over: Partial<AttributableDose> = {}): AttributableDose => ({
    medication_id: null, medication_item_id: 'item-pred', adherence: 'given', deleted_at: null,
    occurred_at: '2026-06-12T08:00:00+00:00', ...over,
  });

  it('counts doses by medication_item_id even when medication_id is NULL (the bug)', () => {
    // The whole point: one-tap doses are regimen-unlinked (medication_id NULL); the
    // helper never looks at medication_id, so they still count toward the regimen.
    const t = attributeDosesToRegimens([reg()], [dose(), dose(), dose({ adherence: 'refused' })]);
    expect(t.get('reg-1')).toEqual({ given: 2, partial: 0, missed: 0, refused: 1, unrated: 0 });
  });

  it('does not count a dose before the regimen started or after it ended', () => {
    const ended = reg({ id: 'r', started_at: '2026-06-10', ended_at: '2026-06-15' });
    const t = attributeDosesToRegimens([ended], [
      dose({ occurred_at: '2026-06-09T23:00:00+00:00' }), // before start
      dose({ occurred_at: '2026-06-12T08:00:00+00:00' }), // in window
      dose({ occurred_at: '2026-06-16T08:00:00+00:00' }), // after end
    ]);
    expect(t.get('r')?.given).toBe(1);
  });

  it('counts a dose logged on the start date (date vs timestamp boundary)', () => {
    const t = attributeDosesToRegimens(
      [reg({ id: 'r', started_at: '2026-06-12' })],
      [dose({ occurred_at: '2026-06-12T08:00:00+00:00' })],
    );
    expect(t.get('r')?.given).toBe(1);
  });

  it('ignores soft-deleted doses and ad-hoc doses with no item id', () => {
    const t = attributeDosesToRegimens([reg()], [
      dose({ deleted_at: '2026-06-12T09:00:00+00:00' }),
      dose({ medication_item_id: null }),
    ]);
    expect(t.get('reg-1')).toEqual({ given: 0, partial: 0, missed: 0, refused: 0, unrated: 0 });
  });

  it('attributes a shared-drug dose to the most-recently-started in-window regimen (no double-count)', () => {
    const older = reg({ id: 'old', started_at: '2026-06-01', ended_at: '2026-06-10' });
    const active = reg({ id: 'new', started_at: '2026-06-11', ended_at: null });
    const t = attributeDosesToRegimens([older, active], [dose({ occurred_at: '2026-06-12T08:00:00+00:00' })]);
    expect(t.get('new')?.given).toBe(1);
    expect(t.get('old')?.given).toBe(0);
  });

  it('leaves a free-text regimen (no item id) with an empty tally', () => {
    const freeText = reg({ id: 'ft', medication_item_id: null });
    const t = attributeDosesToRegimens([freeText], [dose({ medication_item_id: null })]);
    expect(t.get('ft')).toEqual({ given: 0, partial: 0, missed: 0, refused: 0, unrated: 0 });
  });

  it('buckets every adherence value, defaulting NULL to unrated', () => {
    const t = attributeDosesToRegimens([reg()], [
      dose({ adherence: 'given' }), dose({ adherence: 'partial' }), dose({ adherence: 'missed' }),
      dose({ adherence: 'refused' }), dose({ adherence: null }),
    ]);
    expect(t.get('reg-1')).toEqual({ given: 1, partial: 1, missed: 1, refused: 1, unrated: 1 });
  });
});

describe('attributeDosesToRegimens — explicit regimen link (B-153/B-154) wins', () => {
  const reg = (over: Partial<RegimenWindow> = {}): RegimenWindow => ({
    id: 'reg-1', medication_item_id: 'item-pred', started_at: '2026-06-10', ended_at: null, ...over,
  });
  const dose = (over: Partial<AttributableDose> = {}): AttributableDose => ({
    medication_id: null, medication_item_id: 'item-pred', adherence: 'given', deleted_at: null,
    occurred_at: '2026-06-12T08:00:00+00:00', ...over,
  });

  it('attributes a linked dose to its regimen by medication_id', () => {
    const t = attributeDosesToRegimens([reg()], [dose({ medication_id: 'reg-1' })]);
    expect(t.get('reg-1')?.given).toBe(1);
  });

  it('lets a FREE-TEXT regimen (no item id) accumulate linked doses — the B-153 fix', () => {
    // The whole point: a free-text regimen has no medication_item_id, so the
    // item+window fallback can NEVER see its doses ("No doses logged yet" forever).
    // A dose logged from the card carries medication_id (and has no item id), so the
    // explicit link is the only thing that attributes it.
    const freeText = reg({ id: 'ft', medication_item_id: null });
    const t = attributeDosesToRegimens([freeText], [
      dose({ medication_id: 'ft', medication_item_id: null, adherence: 'given' }),
      dose({ medication_id: 'ft', medication_item_id: null, adherence: 'missed' }),
    ]);
    expect(t.get('ft')).toEqual({ given: 1, partial: 0, missed: 1, refused: 0, unrated: 0 });
  });

  it('honors the link even when the dose falls outside the regimen window', () => {
    // The owner explicitly logged this dose against the regimen — the link is
    // authoritative and is NOT re-checked against started_at/ended_at.
    const t = attributeDosesToRegimens(
      [reg({ started_at: '2026-06-10', ended_at: '2026-06-15' })],
      [dose({ medication_id: 'reg-1', occurred_at: '2026-06-20T08:00:00+00:00' })],
    );
    expect(t.get('reg-1')?.given).toBe(1);
  });

  it('does not double-count: a linked dose is never also item+window matched', () => {
    // Both the link and the drug/window could match reg-1; it must count exactly once.
    const t = attributeDosesToRegimens([reg()], [
      dose({ medication_id: 'reg-1', medication_item_id: 'item-pred' }),
    ]);
    expect(t.get('reg-1')?.given).toBe(1);
  });

  it('counts a dose linked to a regimen not in the set toward nothing (no reassignment)', () => {
    // A dose linked to an ended/other regimen is NOT silently reassigned to a
    // different active regimen of the same drug — it simply isn't counted here.
    const active = reg({ id: 'active', medication_item_id: 'item-pred' });
    const t = attributeDosesToRegimens([active], [
      dose({ medication_id: 'ended-regimen', medication_item_id: 'item-pred' }),
    ]);
    expect(t.get('active')).toEqual({ given: 0, partial: 0, missed: 0, refused: 0, unrated: 0 });
  });

  it('still ignores a soft-deleted linked dose', () => {
    const t = attributeDosesToRegimens([reg()], [
      dose({ medication_id: 'reg-1', deleted_at: '2026-06-12T09:00:00+00:00' }),
    ]);
    expect(t.get('reg-1')?.given).toBe(0);
  });

  it('mixes linked and unlinked doses on the same regimen', () => {
    // A free-text-era regimen that later gets logged both ways: a legacy unlinked
    // one-tap dose (item+window) plus new linked doses all roll up together.
    const t = attributeDosesToRegimens([reg()], [
      dose({ medication_id: null, adherence: 'given' }),          // legacy, item+window
      dose({ medication_id: 'reg-1', adherence: 'given' }),       // linked
      dose({ medication_id: 'reg-1', adherence: 'refused' }),     // linked
    ]);
    expect(t.get('reg-1')).toEqual({ given: 2, partial: 0, missed: 0, refused: 1, unrated: 0 });
  });
});

describe('computeRegimenCompliance', () => {
  it('computes given ÷ expected for a clean scheduled regimen', () => {
    // 2×/day for 7 days = 14 expected; 14 given → 100%.
    const c = computeRegimenCompliance({ dosesPerDay: 2, daysElapsed: 7, tally: tally({ given: 14 }) });
    expect(c.expectedDoses).toBe(14);
    expect(c.administeredDoses).toBe(14);
    expect(c.percent).toBe(100);
    expect(c.flaggedDoses).toBe(0);
  });

  it('NEVER counts missed/refused/partial as administered (the §6.1 guard)', () => {
    // 6 expected; owner logged 3 missed + 1 refused + 0 given. Administered=0 → 0%,
    // NOT 4/6=67%. A logged non-administration is not adherence.
    const c = computeRegimenCompliance({
      dosesPerDay: 2, daysElapsed: 3, tally: tally({ missed: 3, refused: 1 }),
    });
    expect(c.expectedDoses).toBe(6);
    expect(c.administeredDoses).toBe(0);
    expect(c.flaggedDoses).toBe(4);
    expect(c.percent).toBe(0);
  });

  it('returns percent=null for a scheduled regimen with NOTHING logged (not "0%/compliant")', () => {
    const c = computeRegimenCompliance({ dosesPerDay: 1, daysElapsed: 4, tally: tally() });
    expect(c.loggedDoses).toBe(0);
    expect(c.percent).toBeNull(); // renders "No doses logged yet", never reassurance
  });

  it('treats a PRN regimen (null doses_per_day) as a count, never a %', () => {
    const c = computeRegimenCompliance({ dosesPerDay: null, daysElapsed: 10, tally: tally({ given: 3 }) });
    expect(c.isPrn).toBe(true);
    expect(c.expectedDoses).toBe(0);
    expect(c.percent).toBeNull();
    expect(c.loggedDoses).toBe(3);
  });

  it('does not count an unrated (NULL adherence) dose as given', () => {
    // 1 given + 2 unrated of 6 expected → administered=1 → 17%, the safe under-read.
    const c = computeRegimenCompliance({ dosesPerDay: 2, daysElapsed: 3, tally: tally({ given: 1, unrated: 2 }) });
    expect(c.administeredDoses).toBe(1);
    expect(c.loggedDoses).toBe(3);
    expect(c.percent).toBe(17);
  });

  it('clamps an over-logged regimen to 100% (extra doses can exceed the elapsed estimate)', () => {
    const c = computeRegimenCompliance({ dosesPerDay: 1, daysElapsed: 2, tally: tally({ given: 5 }) });
    expect(c.expectedDoses).toBe(2);
    expect(c.percent).toBe(100); // not 250%
  });

  it('floors fractional elapsed days and never divides by zero', () => {
    const c = computeRegimenCompliance({ dosesPerDay: 1, daysElapsed: 0, tally: tally({ given: 1 }) });
    expect(c.expectedDoses).toBe(1); // daysElapsed floored to ≥1
    expect(c.percent).toBe(100);
  });

  it('supports a fractional schedule (every-other-day = 0.5/day)', () => {
    const c = computeRegimenCompliance({ dosesPerDay: 0.5, daysElapsed: 8, tally: tally({ given: 4 }) });
    expect(c.expectedDoses).toBe(4); // 0.5 × 8
    expect(c.percent).toBe(100);
  });
});

// ── B-618 — dose-denominated compliance denominator (the reported completion bug) ──
// A dose course measures adherence against its DISPENSED TOTAL (target_duration_doses),
// not the calendar pace (doses_per_day × daysElapsed). The pace denominator climbs past
// the prescription, so an owner who had given all 28 prescribed doses saw "28 of 36 ·
// 78%" — behind — on the same card the dose counter (dosesTowardTarget) calls complete.
// Re-basing to the total makes the two lines agree and keeps the % off the D3-punted
// "pace" framing (it is "% of the course delivered", not "% of what you should have
// given by now"). The numerator stays given-only (D1) — unchanged from the pace path.
describe('computeRegimenCompliance — dose-denominated course (B-618, targetDoses)', () => {
  it('THE BUG: a 28-of-28 course reads against the dispensed total, not the calendar', () => {
    // Motozol: #28 dispensed, 2×/day, on calendar day 18 (pace would expect 36), all 28
    // given. Pace denominator = 36 → "78% given · 28 of 36" (behind). Target denominator
    // = 28 → 100%, agreeing with "Dose 28 of 28".
    const c = computeRegimenCompliance({
      dosesPerDay: 2, daysElapsed: 18, tally: tally({ given: 28 }), targetDoses: 28,
    });
    expect(c.expectedDoses).toBe(28); // NOT 2 × 18 = 36
    expect(c.administeredDoses).toBe(28);
    expect(c.percent).toBe(100); // NOT round(28/36) = 78
    expect(c.isPrn).toBe(false);
  });

  it('mid-course: measures delivered against the total, not the pace', () => {
    // 20 given of a 28-dose course, day 18 (pace expects 36). Target → 20/28 = 71%;
    // pace would have read 20/36 = 56%. The honest figure is "% of the course delivered".
    const c = computeRegimenCompliance({
      dosesPerDay: 2, daysElapsed: 18, tally: tally({ given: 20 }), targetDoses: 28,
    });
    expect(c.expectedDoses).toBe(28);
    expect(c.percent).toBe(71);
  });

  it('past target: extra administrations clamp the % to 100 (never > 100)', () => {
    // 30 given on a 28-dose course — 2 past the bottle. administered(30) > expected(28),
    // so the % clamps to 100 and regimenComplianceLine drops the "of N".
    const c = computeRegimenCompliance({
      dosesPerDay: 2, daysElapsed: 20, tally: tally({ given: 30 }), targetDoses: 28,
    });
    expect(c.expectedDoses).toBe(28);
    expect(c.administeredDoses).toBe(30);
    expect(c.percent).toBe(100);
  });

  it('a dose target with NO daily cadence is still a %, never a PRN count', () => {
    // "#30, give as directed" (doses_per_day null) has a real denominator — the total —
    // so it is NOT PRN for compliance: 12 given → "40% given · 12 of 30".
    const c = computeRegimenCompliance({
      dosesPerDay: null, daysElapsed: 9, tally: tally({ given: 12 }), targetDoses: 30,
    });
    expect(c.isPrn).toBe(false);
    expect(c.expectedDoses).toBe(30);
    expect(c.percent).toBe(40);
  });

  it('the numerator stays given-only (D1) — a partial advances the counter, NOT this %', () => {
    // 26 given + 2 partial on a 28-dose course. dosesTowardTarget = 28 ("Dose 28 of 28"),
    // but administered here = 26 (given-only), so the % is 26/28 = 93 and the 2 partials
    // surface on the flag line — the deliberate two-definitions gap (D1), preserved on the
    // dose path exactly as on the pace path.
    const c = computeRegimenCompliance({
      dosesPerDay: 2, daysElapsed: 14, tally: tally({ given: 26, partial: 2 }), targetDoses: 28,
    });
    expect(c.administeredDoses).toBe(26);
    expect(c.expectedDoses).toBe(28);
    expect(c.percent).toBe(93);
    expect(dosesTowardTarget(tally({ given: 26, partial: 2 }))).toBe(28); // counter says done
  });

  it('nothing logged on a dose course → percent null ("not tracked"), never 0%', () => {
    const c = computeRegimenCompliance({
      dosesPerDay: 2, daysElapsed: 3, tally: tally(), targetDoses: 28,
    });
    expect(c.loggedDoses).toBe(0);
    expect(c.percent).toBeNull();
  });

  it('a corrupt/legacy 0 target falls back to the calendar pace, never a 0 denominator', () => {
    // The local SQLite mirror does not enforce the server CHECK (target > 0); a 0 must not
    // become the denominator. It falls back to doses_per_day × daysElapsed = 2 × 5 = 10.
    const c = computeRegimenCompliance({
      dosesPerDay: 2, daysElapsed: 5, tally: tally({ given: 5 }), targetDoses: 0,
    });
    expect(c.expectedDoses).toBe(10); // pace path, not 0
    expect(c.percent).toBe(50);
  });

  it('is opt-in: omitting targetDoses leaves the pace path byte-for-byte unchanged', () => {
    const withUndef = computeRegimenCompliance({ dosesPerDay: 2, daysElapsed: 7, tally: tally({ given: 14 }) });
    const withNull = computeRegimenCompliance({ dosesPerDay: 2, daysElapsed: 7, tally: tally({ given: 14 }), targetDoses: null });
    expect(withUndef).toEqual(withNull);
    expect(withUndef.expectedDoses).toBe(14); // 2 × 7 — the pace denominator, unchanged
  });
});

// ── B-618 §4 — the dose-count predicate (dosesTowardTarget) ──────────────────
// "Dose {n} of {target}" where n = dosesTowardTarget(tally). D1: therapy delivered
// (given + partial). The last test is load-bearing: it PINS the deliberate exact-
// `partial` gap between this count and computeRegimenCompliance's given-only rate, so
// a future "make these consistent" edit trips a red test and reads the two-definitions
// comment before touching either. Do not "fix" that test — it exists to fail on that.
describe('dosesTowardTarget — therapy delivered = given + partial (§4, D1)', () => {
  it('is 0 for an empty tally (honest "Dose 0 of N" before the first administration)', () => {
    expect(dosesTowardTarget(tally())).toBe(0);
  });

  it('never advances on refused / missed / unrated (unconfirmed) — only given + partial', () => {
    // Every non-therapy bucket, alone, advances the count by nothing: a refused tail
    // can never let a course read as complete (D1). unrated is where a derived
    // "unconfirmed" dose lands, so this covers it too.
    expect(dosesTowardTarget(tally({ refused: 3 }))).toBe(0);
    expect(dosesTowardTarget(tally({ missed: 4 }))).toBe(0);
    expect(dosesTowardTarget(tally({ unrated: 5 }))).toBe(0);
    expect(dosesTowardTarget(tally({ refused: 3, missed: 4, unrated: 5 }))).toBe(0);
    // Mixed: only the two therapy buckets count, the noise around them does not.
    expect(dosesTowardTarget(tally({ given: 2, partial: 1, refused: 5, missed: 3, unrated: 4 }))).toBe(3);
  });

  it('a partial dose advances the count (therapy delivered) even though it is disclosed as a flag', () => {
    // The D1 "advances AND stays disclosed" fact: a partial is counted here but is not
    // clean adherence — regimenFlagLine still surfaces it (asserted in its own suite).
    expect(dosesTowardTarget(tally({ given: 27, partial: 1 }))).toBe(28);
  });

  it('property: dosesTowardTarget(t) ≤ every logged dose, over the bucket cross-product', () => {
    // Deterministic enumeration (no Math.random → no flake): the count can never
    // exceed the number of doses actually logged. loggedDoses is the sum of all
    // buckets — the same value computeRegimenCompliance.loggedDoses reports — so the
    // bar can never render "Dose 30 of 28" from more given+partial than were logged.
    for (let given = 0; given <= 3; given++)
      for (let partial = 0; partial <= 3; partial++)
        for (let missed = 0; missed <= 3; missed++)
          for (let refused = 0; refused <= 3; refused++)
            for (let unrated = 0; unrated <= 3; unrated++) {
              const t = tally({ given, partial, missed, refused, unrated });
              const logged = given + partial + missed + refused + unrated;
              const n = dosesTowardTarget(t);
              expect(n).toBeLessThanOrEqual(logged);
              // Tie the property to the actual RegimenCompliance field, not just the
              // hand-summed total, so a change to how loggedDoses is derived is caught.
              const c = computeRegimenCompliance({ dosesPerDay: 2, daysElapsed: 7, tally: t });
              expect(n).toBeLessThanOrEqual(c.loggedDoses);
            }
  });

  it('DELIBERATELY disagrees with computeRegimenCompliance.administeredDoses by exactly tally.partial', () => {
    // THE PIN. dosesTowardTarget = given + partial (therapy delivered, D1); the
    // compliance numerator = given only (a stricter rate statistic, D1). The two are
    // two different questions and MUST stay unreconciled — the gap is exactly the
    // number of partial doses, always. A "consistency fix" that makes them agree
    // trips this test and must read lib/medications.ts:dosesTowardTarget before changing
    // either definition.
    const cases: AdherenceTally[] = [
      tally(),                                             // 0 partial → agree (gap 0)
      tally({ given: 5 }),                                 // 0 partial → agree
      tally({ given: 5, partial: 2 }),                     // gap 2
      tally({ given: 0, partial: 3 }),                     // gap 3, given 0
      tally({ given: 4, partial: 1, missed: 2, refused: 1, unrated: 3 }), // noise doesn't move the gap
    ];
    for (const t of cases) {
      const compliance = computeRegimenCompliance({ dosesPerDay: 1, daysElapsed: 10, tally: t });
      expect(dosesTowardTarget(t) - compliance.administeredDoses).toBe(t.partial);
    }
  });

  it('follows the record: a soft-deleted dose falls out of the tally, so the count decrements (§4)', () => {
    // The count follows the record — attributeDosesToRegimens skips a dose whose parent
    // event is soft-deleted, so deleting a mislogged dose correctly lowers the count.
    // This is a property of how the tally is built, asserted end-to-end here.
    const regimen: RegimenWindow = {
      id: 'reg-1', medication_item_id: 'item-1', started_at: '2026-06-01', ended_at: null,
    };
    const doses: AttributableDose[] = [
      { medication_id: 'reg-1', medication_item_id: 'item-1', adherence: 'given', deleted_at: null, occurred_at: '2026-06-02T09:00:00Z' },
      { medication_id: 'reg-1', medication_item_id: 'item-1', adherence: 'given', deleted_at: null, occurred_at: '2026-06-02T21:00:00Z' },
      // A mislogged dose, later soft-deleted — its event's deleted_at is set.
      { medication_id: 'reg-1', medication_item_id: 'item-1', adherence: 'given', deleted_at: '2026-06-03T00:00:00Z', occurred_at: '2026-06-03T09:00:00Z' },
    ];
    const withDeleted = attributeDosesToRegimens([regimen], doses).get('reg-1')!;
    expect(dosesTowardTarget(withDeleted)).toBe(2); // the soft-deleted dose does not count

    // Undelete-equivalent: the same three doses all live → 3. Confirms the decrement
    // is the deletion's doing, not a fixed cap.
    const allLive = attributeDosesToRegimens(
      [regimen],
      doses.map((d) => ({ ...d, deleted_at: null })),
    ).get('reg-1')!;
    expect(dosesTowardTarget(allLive)).toBe(3);
  });
});

// ── B-618 §6 — the profile card's dose-course line + bar (doseCourseProgress) ─────
// The line and the bar must state the SAME n (the diet-trial bar lesson), n reads the
// D6 predicate (never re-derived), and — non-negotiable, D7 — reaching or passing the
// target must render no completion/stop language. The §8 QA matrix rows 1/3/5 live here.
describe('doseCourseProgress — "Dose {n} of {target}" line + bar (§6, D7)', () => {
  const NO_COMPLETION = /complete|done|finish|stop|✓|✔|check|over\b|ended/i;

  it('zero-state: "Dose 0 of 28" with an empty bar before the first administration', () => {
    const p = doseCourseProgress(tally(), 28);
    expect(p.line).toBe('Dose 0 of 28');
    expect(p.count).toBe(0);
    expect(p.barFraction).toBe(0);
    expect(p.pastTarget).toBe(false);
  });

  it('§8.1 in-range: a given dose reads "Dose 1 of 28"; the bar fraction equals n/target', () => {
    const p = doseCourseProgress(tally({ given: 1 }), 28);
    expect(p.line).toBe('Dose 1 of 28');
    expect(p.barFraction).toBeCloseTo(1 / 28);
    // The line's number and the bar's number are the same n — never one labelled with
    // the other (the whole point of computing both here).
    expect(p.count).toBe(1);
  });

  it('§8.3 a partial advances the count line (therapy delivered) — "Dose 5 of 28"', () => {
    // 4 given + 1 partial = 5 toward the bottle (D1), even though the partial is also
    // disclosed by regimenFlagLine. The count line and the compliance line disagree by
    // the partial ON PURPOSE — that gap is pinned in the dosesTowardTarget suite.
    const p = doseCourseProgress(tally({ given: 4, partial: 1 }), 28);
    expect(p.line).toBe('Dose 5 of 28');
    expect(p.count).toBe(5);
  });

  it('at exactly the target: "Dose 28 of 28", full bar, and NO completion word (D7)', () => {
    const p = doseCourseProgress(tally({ given: 27, partial: 1 }), 28);
    expect(p.line).toBe('Dose 28 of 28');
    expect(p.barFraction).toBe(1);
    expect(p.pastTarget).toBe(false);
    // D7 is the reason this feature is careful: hitting the target is not "done".
    expect(p.line).not.toMatch(NO_COMPLETION);
  });

  it('§8.5 past target: bar capped, extras disclosed, no error, no "complete"', () => {
    // 29th administration on a 28-dose course. cap-the-bar / disclose-the-extras /
    // render-no-error: the line stays TRUE ("28 of 28"), never "Dose 29 of 28", never
    // "Day 30 of 7"-style nonsense, never a completion state.
    const p = doseCourseProgress(tally({ given: 29 }), 28);
    expect(p.line).toBe('28 of 28 doses · 1 more logged');
    expect(p.pastTarget).toBe(true);
    expect(p.barFraction).toBe(1); // capped, never 29/28
    expect(p.line).not.toMatch(NO_COMPLETION);

    const p2 = doseCourseProgress(tally({ given: 28, partial: 2 }), 28);
    expect(p2.line).toBe('28 of 28 doses · 2 more logged');
    expect(p2.count).toBe(30);
  });

  it('past target on a single-dose course reads "1 of 1 dose" (singular, not "doses")', () => {
    // A one-time dose (e.g. a single dewormer) logged twice: the unit word inflects on
    // the target, so a 1-dose course never reads the ungrammatical "1 of 1 doses".
    const p = doseCourseProgress(tally({ given: 2 }), 1);
    expect(p.line).toBe('1 of 1 dose · 1 more logged');
    expect(p.barFraction).toBe(1);
    expect(p.line).not.toMatch(NO_COMPLETION);
  });

  it('refused / missed / unrated never move the count line off "Dose 0 of N" (§8.2)', () => {
    // A refused tail can never let a course read as complete — the count is 0, the bar
    // is empty, and the refusals surface through regimenFlagLine, not this line.
    const p = doseCourseProgress(tally({ refused: 3, missed: 2, unrated: 1 }), 14);
    expect(p.line).toBe('Dose 0 of 14');
    expect(p.barFraction).toBe(0);
  });

  it('property: barFraction is always in [0, 1] and the line never emits a completion word', () => {
    for (const target of [1, 7, 14, 28]) {
      for (let given = 0; given <= target + 3; given++) {
        for (const partial of [0, 1, 2]) {
          const p = doseCourseProgress(tally({ given, partial }), target);
          expect(p.barFraction).toBeGreaterThanOrEqual(0);
          expect(p.barFraction).toBeLessThanOrEqual(1);
          expect(p.line).not.toMatch(NO_COMPLETION);
          // The bar can never claim more progress than the count justifies.
          expect(p.barFraction).toBeCloseTo(Math.min((given + partial) / target, 1));
        }
      }
    }
  });
});

describe('regimenComplianceLine — copy never reassures on absence (§6.1)', () => {
  const FORBIDDEN = /great|good|well|perfect|all set|on track|healthy|fine|compliant/i;

  it('reads "No doses logged yet" for an empty scheduled regimen — never "compliant"', () => {
    const c = computeRegimenCompliance({ dosesPerDay: 2, daysElapsed: 5, tally: tally() });
    const line = regimenComplianceLine(c);
    expect(line).toBe('No doses logged yet');
    expect(line).not.toMatch(FORBIDDEN);
  });

  it('reads a factual %/count line for a logged regimen, with no evaluation', () => {
    const c = computeRegimenCompliance({ dosesPerDay: 2, daysElapsed: 7, tally: tally({ given: 14 }) });
    expect(regimenComplianceLine(c)).toBe('100% given · 14 of 14 doses');
    expect(regimenComplianceLine(c)).not.toMatch(FORBIDDEN);
  });

  it('drops the "of N" when over-logged so it never reads "5 of 2 doses" (CX-D display)', () => {
    // 5 given of 2 expected → 100% (clamped) but "5 of 2" reads broken; show a
    // plain count instead. NOT a double-dose flag (that needs interval timing, §6.4).
    const c = computeRegimenCompliance({ dosesPerDay: 1, daysElapsed: 2, tally: tally({ given: 5 }) });
    expect(c.percent).toBe(100);
    expect(regimenComplianceLine(c)).toBe('100% given · 5 doses logged');
  });

  it('a completed dose course reads "100% given · 28 of 28 doses" (B-618, agrees with the counter)', () => {
    // The reported bug rendered "78% given · 28 of 36 doses" here; re-based to the total it
    // reads 100% of 28 and no longer contradicts the "Dose 28 of 28" line above it.
    const c = computeRegimenCompliance({ dosesPerDay: 2, daysElapsed: 18, tally: tally({ given: 28 }), targetDoses: 28 });
    expect(regimenComplianceLine(c)).toBe('100% given · 28 of 28 doses');
    expect(regimenComplianceLine(c)).not.toMatch(FORBIDDEN);
  });

  it('a dose course logged past its total drops the "of N" ("100% given · 30 doses logged")', () => {
    const c = computeRegimenCompliance({ dosesPerDay: 2, daysElapsed: 20, tally: tally({ given: 30 }), targetDoses: 28 });
    expect(regimenComplianceLine(c)).toBe('100% given · 30 doses logged');
  });

  it('reads a plain dose count for PRN, singular and plural', () => {
    expect(regimenComplianceLine(computeRegimenCompliance({ dosesPerDay: null, daysElapsed: 3, tally: tally({ given: 1 }) })))
      .toBe('1 dose logged');
    expect(regimenComplianceLine(computeRegimenCompliance({ dosesPerDay: null, daysElapsed: 3, tally: tally({ given: 4 }) })))
      .toBe('4 doses logged');
    expect(regimenComplianceLine(computeRegimenCompliance({ dosesPerDay: null, daysElapsed: 3, tally: tally() })))
      .toBe('No doses logged yet');
  });

  it('never emits an exclamation mark (nyx-voice)', () => {
    const samples = [
      computeRegimenCompliance({ dosesPerDay: 2, daysElapsed: 7, tally: tally({ given: 14 }) }),
      computeRegimenCompliance({ dosesPerDay: 1, daysElapsed: 4, tally: tally() }),
      computeRegimenCompliance({ dosesPerDay: null, daysElapsed: 3, tally: tally({ given: 2 }) }),
    ];
    samples.forEach((c) => expect(regimenComplianceLine(c)).not.toContain('!'));
  });
});

describe('regimenFlagLine — refusal is a health signal, never "fussy" (§6.2)', () => {
  const FUSSY = /fussy|picky|stubborn|naughty|lazy|difficult/i;

  it('returns null when every dose was cleanly given', () => {
    expect(regimenFlagLine(tally({ given: 10 }))).toBeNull();
  });

  it('points a refused dose to the vet and never softens it to "fussy"', () => {
    const line = regimenFlagLine(tally({ refused: 1 }))!;
    expect(line).toMatch(/not fully taken/);
    expect(line).toMatch(/vet/);
    expect(line).not.toMatch(FUSSY);
    expect(line).not.toContain('!');
  });

  it('treats partial like refused (a disease-leaning signal), routed to the vet', () => {
    const line = regimenFlagLine(tally({ partial: 2 }))!;
    expect(line).toMatch(/2 doses not fully taken/);
    expect(line).toMatch(/vet/);
  });

  it('surfaces a pure owner-skip ("missed") plainly, WITHOUT vet escalation', () => {
    const line = regimenFlagLine(tally({ missed: 3 }))!;
    expect(line).toBe('3 missed');
    expect(line).not.toMatch(/vet/); // a missed dose is an adherence gap, not a disease signal
  });

  it('combines both buckets and keeps the vet tail for the health-signal half', () => {
    const line = regimenFlagLine(tally({ refused: 1, missed: 2 }))!;
    expect(line).toMatch(/1 dose not fully taken/);
    expect(line).toMatch(/2 missed/);
    expect(line).toMatch(/worth a word with your vet/);
    expect(line).not.toMatch(FUSSY);
  });
});

describe('buildRegimenPayload / canSaveRegimen — regimen-setup write', () => {
  const form: RegimenFormValues = {
    drugName: '  Prednisolone ',
    medicationItemId: 'item-1',
    doseAmount: ' 1 tablet ',
    route: 'oral',
    dosesPerDay: 2,
    scheduleNotes: '  8am & 8pm ',
    indication: ' Allergies ',
    prescribedBy: '  Dr. Chen ',
    startedAt: '2026-06-19',
    targetDurationDays: 7,
    targetDurationDoses: null, // B-618 — days-denominated form; doses null
  };

  it('trims the required name and nulls blank optionals; never carries pet_id/status/id', () => {
    const out = buildRegimenPayload(form);
    expect(out.drug_name).toBe('Prednisolone');
    expect(out.dose_amount).toBe('1 tablet');
    expect(out.schedule_notes).toBe('8am & 8pm');
    expect(out.indication).toBe('Allergies');
    expect(out.prescribed_by).toBe('Dr. Chen');
    // The caller adds pet_id from the ACTIVE pet (never free input) and the create
    // default sets status — the payload itself must not smuggle them.
    const keys = Object.keys(out);
    ['pet_id', 'status', 'ended_at', 'id', 'created_at', 'updated_at'].forEach((k) =>
      expect(keys).not.toContain(k),
    );
  });

  it('nulls blank optional fields rather than writing empty strings', () => {
    const out = buildRegimenPayload({
      ...form, doseAmount: '   ', scheduleNotes: '', indication: '', prescribedBy: '  ',
    });
    expect(out.dose_amount).toBeNull();
    expect(out.schedule_notes).toBeNull();
    expect(out.indication).toBeNull();
    expect(out.prescribed_by).toBeNull();
  });

  it('passes a PRN (null doses_per_day), ongoing (null duration), free-text (null item) regimen through', () => {
    const out = buildRegimenPayload({
      ...form, medicationItemId: null, dosesPerDay: null, targetDurationDays: null, route: null,
    });
    expect(out.medication_item_id).toBeNull();
    expect(out.doses_per_day).toBeNull();
    expect(out.target_duration_days).toBeNull();
    expect(out.target_duration_doses).toBeNull(); // B-618 — ongoing course: neither denomination set
    expect(out.route).toBeNull();
    expect(out.drug_name).toBe('Prednisolone'); // denormalized name always present
  });

  it('forwards a doses-denominated course, days null (B-618 — one denomination on the wire)', () => {
    // The entry form (PR 3) sets exactly one unit; this builder forwards both
    // verbatim. A doses course must reach the write with days null so the DB's
    // medications_one_duration_denomination CHECK is satisfied by construction.
    const out = buildRegimenPayload({ ...form, targetDurationDays: null, targetDurationDoses: 28 });
    expect(out.target_duration_doses).toBe(28);
    expect(out.target_duration_days).toBeNull();
  });

  it('requires a non-empty drug name (medications.drug_name is NOT NULL)', () => {
    expect(canSaveRegimen({ drugName: 'Apoquel' })).toBe(true);
    expect(canSaveRegimen({ drugName: '' })).toBe(false);
    expect(canSaveRegimen({ drugName: '   ' })).toBe(false);
  });
});

// ── B-618 §5 — the entry form's course-length → the two denomination columns ─────
// The two load-bearing rules the entry UI (PR 3) leans on: AT MOST ONE denomination
// is ever set (unrepresentable-to-set-both, the client half of the DB CHECK), and a
// blank/zero/ongoing field fakes no course. Pinned here so a future edit to the modal
// can't quietly reintroduce a both-set write or a zero-length course.
describe('resolveDurationColumns — one denomination, never a faked course (§5)', () => {
  it('writes days only when the unit is days (doses column stays null)', () => {
    expect(resolveDurationColumns({ mode: 'fixed', unit: 'days', value: '14' })).toEqual({
      target_duration_days: 14,
      target_duration_doses: null,
    });
  });

  it('writes doses only when the unit is doses (days column stays null)', () => {
    expect(resolveDurationColumns({ mode: 'fixed', unit: 'doses', value: '28' })).toEqual({
      target_duration_days: null,
      target_duration_doses: 28,
    });
  });

  it('an ongoing course writes BOTH null regardless of a lingering unit/value', () => {
    // The mode gates everything: even if the field still holds a number from before the
    // owner flipped back to Ongoing, no course is written.
    expect(resolveDurationColumns({ mode: 'ongoing', unit: 'doses', value: '28' })).toEqual({
      target_duration_days: null,
      target_duration_doses: null,
    });
  });

  it('a blank / zero / non-positive field never fakes a course (both null)', () => {
    for (const value of ['', '0', '00']) {
      expect(resolveDurationColumns({ mode: 'fixed', unit: 'days', value })).toEqual({
        target_duration_days: null,
        target_duration_doses: null,
      });
      expect(resolveDurationColumns({ mode: 'fixed', unit: 'doses', value })).toEqual({
        target_duration_days: null,
        target_duration_doses: null,
      });
    }
  });

  it('parses a leading-zero value as its positive integer (field is digit-stripped upstream)', () => {
    expect(resolveDurationColumns({ mode: 'fixed', unit: 'doses', value: '028' }).target_duration_doses).toBe(28);
  });

  it('NEVER returns both denominations set, across the mode × unit × value cross-product', () => {
    // The construction guarantee the DB CHECK backstops: both columns branch on the
    // same `unit`, so no combination of inputs can set both. This is the test that
    // fails first if a refactor ever writes the two columns independently.
    const modes: ('ongoing' | 'fixed')[] = ['ongoing', 'fixed'];
    const units: ('days' | 'doses')[] = ['days', 'doses'];
    const values = ['', '0', '1', '14', '28', '365'];
    for (const mode of modes) {
      for (const unit of units) {
        for (const value of values) {
          const out = resolveDurationColumns({ mode, unit, value });
          expect(out.target_duration_days != null && out.target_duration_doses != null).toBe(false);
        }
      }
    }
  });
});

// ── B-135 double-dose detection (§6.4) ───────────────────────────────────────
// The safety invariant ("two given doses too close together is a flag, never
// silently normalized") lives here as assertions, not as a comment on a screen.

describe('doubleDoseWindowHours — schedule-relative, CAPPED + FLOORED (adversarial fix)', () => {
  it('caps common frequencies at the clinical CAP (a normal early scheduled dose must not fire)', () => {
    // Half the interval would be 12/6/4/3h — all over-fire on compressed dosing.
    // The cap pins them to 2h, below the tightest legitimately-early gap (~3h).
    expect(doubleDoseWindowHours(1)).toBe(DOUBLE_DOSE_WINDOW_CAP_HOURS); // q24h: half 12h → 2h
    expect(doubleDoseWindowHours(2)).toBe(DOUBLE_DOSE_WINDOW_CAP_HOURS); // q12h: half 6h  → 2h
    expect(doubleDoseWindowHours(3)).toBe(DOUBLE_DOSE_WINDOW_CAP_HOURS); // q8h:  half 4h  → 2h
    expect(doubleDoseWindowHours(4)).toBe(DOUBLE_DOSE_WINDOW_CAP_HOURS); // q6h:  half 3h  → 2h
  });

  it('only narrows below the cap for ultra-dense schedules, and never below the floor', () => {
    expect(doubleDoseWindowHours(8)).toBe(1.5);                          // q3h: half 1.5h (cap doesn't bind)
    expect(doubleDoseWindowHours(12)).toBe(DOUBLE_DOSE_WINDOW_FLOOR_HOURS); // q2h: half 1h = floor
    expect(doubleDoseWindowHours(48)).toBe(DOUBLE_DOSE_WINDOW_FLOOR_HOURS); // absurd: half 0.25h → floored to 1h
  });

  it('falls back to the default (the cap) when there is no schedule to derive one from', () => {
    expect(DEFAULT_DOUBLE_DOSE_WINDOW_HOURS).toBe(DOUBLE_DOSE_WINDOW_CAP_HOURS);
    expect(doubleDoseWindowHours(null)).toBe(DEFAULT_DOUBLE_DOSE_WINDOW_HOURS);      // PRN
    expect(doubleDoseWindowHours(undefined)).toBe(DEFAULT_DOUBLE_DOSE_WINDOW_HOURS); // no regimen
    expect(doubleDoseWindowHours(0)).toBe(DEFAULT_DOUBLE_DOSE_WINDOW_HOURS);         // nonsense
    expect(doubleDoseWindowHours(-2)).toBe(DEFAULT_DOUBLE_DOSE_WINDOW_HOURS);        // nonsense
  });

  // Regression for the adversarial over-fire counterexamples: a legitimate, on-schedule
  // early dose on a compressed day must NOT flag with the capped window.
  it('does NOT flag a compressed-but-legitimate scheduled dose (the alarm-fatigue fix)', () => {
    const focal = '2026-06-20T08:00:00.000Z';
    // q8h front-loaded to 8:00am then 11:30am = 3.5h apart; window now 2h → no flag.
    expect(detectDoubleDose({
      focalOccurredAt: focal, focalAdherence: 'given', windowHours: doubleDoseWindowHours(3),
      others: [{ eventId: 'tid', occurredAt: '2026-06-20T11:30:00.000Z', adherence: 'given' }],
    }).conflict).toBe(false);
    // q12h "with breakfast / with lunch on a disrupted day" 8:00am + 1:30pm = 5.5h; no flag.
    expect(detectDoubleDose({
      focalOccurredAt: focal, focalAdherence: 'given', windowHours: doubleDoseWindowHours(2),
      others: [{ eventId: 'bid', occurredAt: '2026-06-20T13:30:00.000Z', adherence: 'given' }],
    }).conflict).toBe(false);
  });

  it('still flags an obvious close repeat on any schedule (the signal it must keep)', () => {
    const focal = '2026-06-20T08:00:00.000Z';
    // Same q12h drug, but a real repeat 45 min later → inside the 2h window → flag.
    expect(detectDoubleDose({
      focalOccurredAt: focal, focalAdherence: 'given', windowHours: doubleDoseWindowHours(2),
      others: [{ eventId: 'repeat', occurredAt: '2026-06-20T08:45:00.000Z', adherence: 'given' }],
    }).conflict).toBe(true);
  });
});

describe('detectDoubleDose — two given doses of the same drug within the window', () => {
  const focal = '2026-06-20T08:00:00.000Z';

  it('flags a given dose logged inside the window and reports the gap', () => {
    const others: NearbyDose[] = [
      { eventId: 'repeat', occurredAt: '2026-06-20T09:00:00.000Z', adherence: 'given' }, // +1h
    ];
    const r = detectDoubleDose({ focalOccurredAt: focal, focalAdherence: 'given', others, windowHours: 6 });
    expect(r.conflict).toBe(true);
    expect(r.otherEventId).toBe('repeat');
    expect(r.gapMinutes).toBe(60);
  });

  it('does NOT flag a dose outside the window', () => {
    const others: NearbyDose[] = [
      { eventId: 'far', occurredAt: '2026-06-20T15:00:00.000Z', adherence: 'given' }, // +7h, window 6h
    ];
    expect(detectDoubleDose({ focalOccurredAt: focal, focalAdherence: 'given', others, windowHours: 6 }).conflict).toBe(false);
  });

  it('is inclusive at the window boundary', () => {
    const others: NearbyDose[] = [
      { eventId: 'edge', occurredAt: '2026-06-20T14:00:00.000Z', adherence: 'given' }, // exactly +6h
    ];
    expect(detectDoubleDose({ focalOccurredAt: focal, focalAdherence: 'given', others, windowHours: 6 }).conflict).toBe(true);
  });

  it('only fires when the FOCAL dose is given (downgrading it must clear the flag)', () => {
    const others: NearbyDose[] = [
      { eventId: 'repeat', occurredAt: '2026-06-20T09:00:00.000Z', adherence: 'given' },
    ];
    for (const focalAdherence of ['missed', 'refused', 'partial', null]) {
      expect(detectDoubleDose({ focalOccurredAt: focal, focalAdherence, others, windowHours: 6 }).conflict).toBe(false);
    }
  });

  it('ignores nearby non-given doses (a missed/refused dose is not an over-dose)', () => {
    const others: NearbyDose[] = [
      { eventId: 'missed', occurredAt: '2026-06-20T08:30:00.000Z', adherence: 'missed' },
      { eventId: 'refused', occurredAt: '2026-06-20T09:00:00.000Z', adherence: 'refused' },
      { eventId: 'unrated', occurredAt: '2026-06-20T09:30:00.000Z', adherence: null },
    ];
    expect(detectDoubleDose({ focalOccurredAt: focal, focalAdherence: 'given', others, windowHours: 6 }).conflict).toBe(false);
  });

  it('returns the CLOSEST conflicting given dose when several are in range', () => {
    const others: NearbyDose[] = [
      { eventId: 'three-hours', occurredAt: '2026-06-20T11:00:00.000Z', adherence: 'given' }, // +3h
      { eventId: 'thirty-min', occurredAt: '2026-06-20T08:30:00.000Z', adherence: 'given' },  // +30m (closest)
      { eventId: 'two-hours', occurredAt: '2026-06-20T06:00:00.000Z', adherence: 'given' },    // -2h
    ];
    const r = detectDoubleDose({ focalOccurredAt: focal, focalAdherence: 'given', others, windowHours: 6 });
    expect(r.otherEventId).toBe('thirty-min');
    expect(r.gapMinutes).toBe(30);
  });

  it('handles an empty neighbour set and malformed timestamps without throwing', () => {
    expect(detectDoubleDose({ focalOccurredAt: focal, focalAdherence: 'given', others: [], windowHours: 6 }).conflict).toBe(false);
    const bad: NearbyDose[] = [{ eventId: 'bad', occurredAt: 'not-a-date', adherence: 'given' }];
    expect(detectDoubleDose({ focalOccurredAt: focal, focalAdherence: 'given', others: bad, windowHours: 6 }).conflict).toBe(false);
    expect(detectDoubleDose({ focalOccurredAt: 'not-a-date', focalAdherence: 'given', others: [], windowHours: 6 }).conflict).toBe(false);
  });
});

describe('formatDoseGap + doubleDoseNote — calm, specific, no alarm (nyx-voice)', () => {
  it('formats the gap approximately and in plain words', () => {
    expect(formatDoseGap(0)).toBe('a moment');
    expect(formatDoseGap(1)).toBe('a minute');
    expect(formatDoseGap(45)).toBe('45 minutes');
    expect(formatDoseGap(60)).toBe('about an hour');
    expect(formatDoseGap(180)).toBe('about 3 hours');
  });

  it('builds a specific, non-accusatory note that names the gap and the drug', () => {
    const note = doubleDoseNote({ drugName: 'prednisolone', gapMinutes: 120 });
    expect(note).toContain('about 2 hours');
    expect(note).toContain('prednisolone');
    expect(note).not.toContain('!'); // never an alarm (§6.4 / Principle 4)
  });

  it('degrades gracefully when the drug name is unknown', () => {
    const note = doubleDoseNote({ drugName: null, gapMinutes: 30 });
    expect(note).toContain('another dose');
    expect(note).not.toContain('!');
  });
});

// ── B-156 Slice B — dose vehicle options + label (PR A3) ─────────────────────
// The vehicle list is the ONE source of truth shared by the capture chip, the
// dose-edit screen, the History read display, and the write params — so the test
// that matters is the DRIFT GUARD: its values must equal the server dose_route_
// vehicle enum members exactly (migration 022), or a chip would write a value the
// server upsert rejects. vehicleLabel must also read clean (null, never a raw
// token) for an unset/legacy value — the A3 "reads clean when unset" AC.
describe('MEDICATION_VEHICLE_OPTIONS + vehicleLabel (B-156 Slice B)', () => {
  // The exact dose_route_vehicle enum members, in their migration-022 order. If a
  // member is added/renamed server-side, this assertion forces the list to follow.
  const ENUM_MEMBERS: DoseVehicle[] = ['direct', 'in_food', 'in_treat', 'in_pill_pocket', 'other'];

  it('lists exactly the server enum members, in order (drift guard)', () => {
    expect(MEDICATION_VEHICLE_OPTIONS.map((o) => o.value)).toEqual(ENUM_MEMBERS);
  });

  it('gives every option a non-empty, distinct owner-facing label', () => {
    const labels = MEDICATION_VEHICLE_OPTIONS.map((o) => o.label);
    labels.forEach((l) => expect(l.trim().length).toBeGreaterThan(0));
    expect(new Set(labels).size).toBe(labels.length); // no duplicate labels
  });

  it('uses warm, plain, jargon-free copy with no exclamation (nyx-voice)', () => {
    MEDICATION_VEHICLE_OPTIONS.forEach((o) => {
      expect(o.label).not.toContain('!');
      // No clinical jargon ("vehicle", "route", "PO") leaking into owner copy.
      expect(o.label.toLowerCase()).not.toMatch(/vehicle|route|\bpo\b|per os/);
    });
  });

  it('vehicleLabel returns the matching label for every enum member', () => {
    MEDICATION_VEHICLE_OPTIONS.forEach((o) => {
      expect(vehicleLabel(o.value)).toBe(o.label);
    });
  });

  it('vehicleLabel reads clean (null) for an unset value — never a raw token', () => {
    expect(vehicleLabel(null)).toBeNull();
    expect(vehicleLabel(undefined)).toBeNull();
    expect(vehicleLabel('')).toBeNull();
  });

  it('vehicleLabel returns null for an unrecognized/legacy value (renders nothing)', () => {
    expect(vehicleLabel('in_water')).toBeNull();
    expect(vehicleLabel('DIRECT')).toBeNull(); // case-sensitive: only exact enum members
  });

  it('asDoseVehicle narrows every enum member to itself (the single read-coercion site)', () => {
    MEDICATION_VEHICLE_OPTIONS.forEach((o) => {
      expect(asDoseVehicle(o.value)).toBe(o.value);
    });
  });

  it('asDoseVehicle returns null for unset / unrecognized values (never trusts a token)', () => {
    expect(asDoseVehicle(null)).toBeNull();
    expect(asDoseVehicle(undefined)).toBeNull();
    expect(asDoseVehicle('')).toBeNull();
    expect(asDoseVehicle('in_water')).toBeNull();
    expect(asDoseVehicle('DIRECT')).toBeNull();
  });
});

// ── B-156 Slice C (the combo) — vehicle inferred from the co-logged food (PR B2b) ──
// When a med is logged WITH a meal/treat from the completion card, the dose's vehicle
// is inferred from the food's type: a meal → in_food, a treat → in_treat. This is the
// only place the combo write derives how_given, so a wrong mapping would mislabel
// every combo dose's vehicle on the vet report's "with food" note. Anything other than
// the two mapped types returns null — an absent/unexpected type NEVER fabricates a
// vehicle (the same never-coerce stance as the wire mapper and asDoseVehicle).
describe('inferDoseVehicleFromFoodType — combo vehicle inference (B-156 PR B2b)', () => {
  it('maps a meal to in_food and a treat to in_treat', () => {
    expect(inferDoseVehicleFromFoodType('meal')).toBe('in_food');
    expect(inferDoseVehicleFromFoodType('treat')).toBe('in_treat');
  });

  it("returns null for 'other' and for an absent type — never fabricates a vehicle", () => {
    // The combo line is gated to meal/treat, so these don't arise in a real combo;
    // the helper still must refuse to invent a vehicle (clean NULL = "not recorded").
    expect(inferDoseVehicleFromFoodType('other')).toBeNull();
    expect(inferDoseVehicleFromFoodType(null)).toBeNull();
    expect(inferDoseVehicleFromFoodType(undefined)).toBeNull();
    expect(inferDoseVehicleFromFoodType('')).toBeNull();
  });

  it('returns null for an unrecognized/garbage type rather than a raw token', () => {
    expect(inferDoseVehicleFromFoodType('snack')).toBeNull();
    expect(inferDoseVehicleFromFoodType('MEAL')).toBeNull(); // case-sensitive, like asDoseVehicle
  });

  it('only ever returns a value the vehicle enum recognizes (no drift)', () => {
    // Whatever it returns must be a real dose_route_vehicle member, so a combo write
    // can never push a value the server enum rejects.
    for (const t of ['meal', 'treat', 'other', null, undefined, 'snack']) {
      const v = inferDoseVehicleFromFoodType(t as string | null | undefined);
      if (v !== null) {
        expect(MEDICATION_VEHICLE_OPTIONS.some((o) => o.value === v)).toBe(true);
      }
    }
  });
});

// ── B-156 Slice C (PR B3) — intake → adherence safety coupling ──────────────────
// The clinically load-bearing half of the combo. These tests ARE the never-reassure
// invariant (clinical-guardrails Pattern 8: the rule is a test, not a comment) — they
// pin that a not-finished vehicle has NO path to a clean 'given' by construction.

describe('isVehicleNotFinished — the refused/picked boundary', () => {
  it('is true ONLY for refused and picked', () => {
    expect(isVehicleNotFinished('refused')).toBe(true);
    expect(isVehicleNotFinished('picked')).toBe(true);
  });

  it("is false for the 'ate enough to carry a pill' ratings", () => {
    expect(isVehicleNotFinished('some')).toBe(false);
    expect(isVehicleNotFinished('most')).toBe(false);
    expect(isVehicleNotFinished('all')).toBe(false);
  });

  it('is false for an unrated/absent vehicle (no owner-reported failure signal)', () => {
    expect(isVehicleNotFinished(null)).toBe(false);
    expect(isVehicleNotFinished(undefined)).toBe(false);
    expect(isVehicleNotFinished('')).toBe(false);
  });

  it('is false for a garbage/legacy token, never a raw match', () => {
    expect(isVehicleNotFinished('REFUSED')).toBe(false); // case-sensitive, like the enum narrowers
    expect(isVehicleNotFinished('skipped')).toBe(false);
  });
});

describe('initialComboDoseAdherence — a not-finished vehicle never auto-defaults to given', () => {
  it('starts UNCONFIRMED (null) when the vehicle was refused or picked', () => {
    // THE load-bearing rule: no path to 'given' by construction for a not-finished
    // vehicle. An unanswered card therefore records null, never a false 'given'.
    expect(initialComboDoseAdherence('refused')).toBeNull();
    expect(initialComboDoseAdherence('picked')).toBeNull();
  });

  it("keeps the affirmative 'given' default for a finished vehicle", () => {
    expect(initialComboDoseAdherence('some')).toBe('given');
    expect(initialComboDoseAdherence('most')).toBe('given');
    expect(initialComboDoseAdherence('all')).toBe('given');
  });

  it("keeps 'given' for an unrated vehicle (the owner's combo tap is the basis, like a standalone dose)", () => {
    expect(initialComboDoseAdherence(null)).toBe('given');
    expect(initialComboDoseAdherence(undefined)).toBe('given');
  });

  it("only ever returns 'given' or null — never partial/missed/refused as an inference", () => {
    for (const intake of ['refused', 'picked', 'some', 'most', 'all', null, undefined, 'garbage']) {
      const a = initialComboDoseAdherence(intake as string | null | undefined);
      expect(a === 'given' || a === null).toBe(true);
    }
  });
});

describe('isComboDoseInDoubt — the derived unconfirmed state (resurface + card sharpen)', () => {
  it('is true for a combo dose with a not-finished vehicle and NO explicit adherence', () => {
    expect(isComboDoseInDoubt({ isCombo: true, vehicleIntake: 'refused', adherence: null })).toBe(true);
    expect(isComboDoseInDoubt({ isCombo: true, vehicleIntake: 'picked', adherence: null })).toBe(true);
  });

  it("is FALSE once the owner answers — including 'given' (they may have pilled directly; never re-nag an explicit answer)", () => {
    // The whole point of honoring the explicit answer: an owner who taps 'given' on the
    // "still get it?" prompt is asserting it got in. We do not re-open or auto-flip it.
    expect(isComboDoseInDoubt({ isCombo: true, vehicleIntake: 'refused', adherence: 'given' })).toBe(false);
    expect(isComboDoseInDoubt({ isCombo: true, vehicleIntake: 'refused', adherence: 'missed' })).toBe(false);
    expect(isComboDoseInDoubt({ isCombo: true, vehicleIntake: 'refused', adherence: 'partial' })).toBe(false);
    expect(isComboDoseInDoubt({ isCombo: true, vehicleIntake: 'picked', adherence: 'refused' })).toBe(false);
  });

  it('is false when the vehicle was finished, even with a null adherence (no failure signal to resurface)', () => {
    expect(isComboDoseInDoubt({ isCombo: true, vehicleIntake: 'all', adherence: null })).toBe(false);
    expect(isComboDoseInDoubt({ isCombo: true, vehicleIntake: 'some', adherence: null })).toBe(false);
  });

  it('is false for an unrated vehicle (unconfirmed ≠ in-doubt: no reported not-finished signal)', () => {
    expect(isComboDoseInDoubt({ isCombo: true, vehicleIntake: null, adherence: null })).toBe(false);
  });

  it('is false for a STANDALONE dose — no vehicle to be in doubt about', () => {
    // A standalone unrated dose is just "unrated", never "in-doubt" — the resurface is
    // strictly a combo concern (there is no co-logged vehicle).
    expect(isComboDoseInDoubt({ isCombo: false, vehicleIntake: 'refused', adherence: null })).toBe(false);
    expect(isComboDoseInDoubt({ isCombo: false, vehicleIntake: null, adherence: null })).toBe(false);
  });
});

describe('combo safety copy — never reassures, never softens to fussy, no exclamation', () => {
  // Pattern 8 (clinical-guardrails): the never-reassure / never-"picky" invariant is a
  // scan ASSERTION over every owner-facing string this PR can emit, not a comment.
  const REASSURE = /\b(fine|okay|ok|healthy|all clear|no concern|nothing to worry|probably|don't worry|should be)\b/i;
  const SOFTEN = /\b(fussy|picky|stubborn|naughty|just being)\b/i;

  const prompts = [
    doseAdherencePrompt({ petName: 'Pixel', inDoubt: true }),
    doseAdherencePrompt({ petName: 'Pixel', inDoubt: false }),
    // B-172 — every confirm-to-correct restatement is in the same scan.
    doseAdherencePrompt({ petName: 'Pixel', inDoubt: false, adherence: 'given' }),
    doseAdherencePrompt({ petName: 'Pixel', inDoubt: false, adherence: 'partial' }),
    doseAdherencePrompt({ petName: 'Pixel', inDoubt: false, adherence: 'missed' }),
    doseAdherencePrompt({ petName: 'Pixel', inDoubt: false, adherence: 'refused' }),
    comboInDoubtReason({ petName: 'Pixel' }),
    // B-325 — the retroactive confirm sheet's heads-up line.
    comboConfirmHeadsUp({ petName: 'Pixel', foodName: 'Churu' }),
    comboConfirmHeadsUp({ petName: 'Pixel', foodName: null }),
    comboConfirmHeadsUp({ petName: 'Pixel', foodName: '' }),
  ];
  const notes = [
    doseInDoubtNote({ petName: 'Pixel', foodName: 'Churu' }),
    doseInDoubtNote({ petName: 'Pixel', foodName: null }),
    doseInDoubtNote({ petName: 'Pixel', foodName: '' }),
  ];

  it('the in-doubt prompt sharpens to "still get it?" and an unset dose stays "take it?"', () => {
    expect(doseAdherencePrompt({ petName: 'Pixel', inDoubt: true })).toBe('Did Pixel still get it?');
    expect(doseAdherencePrompt({ petName: 'Pixel', inDoubt: false })).toBe('Did Pixel take it?');
    expect(doseAdherencePrompt({ petName: 'Pixel', inDoubt: false, adherence: null }))
      .toBe('Did Pixel take it?');
  });

  // ── B-172 — confirm-to-correct ────────────────────────────────────────────────
  it('restates a pre-lit state and names the correction instead of asking again', () => {
    expect(doseAdherencePrompt({ petName: 'Pixel', inDoubt: false, adherence: 'given' }))
      .toBe('Pixel took it — tap to change.');
    expect(doseAdherencePrompt({ petName: 'Pixel', inDoubt: false, adherence: 'partial' }))
      .toBe('Pixel took part of it — tap to change.');
    expect(doseAdherencePrompt({ petName: 'Pixel', inDoubt: false, adherence: 'refused' }))
      .toBe('Pixel refused it — tap to change.');
  });

  it('never blames the pet for the owner-driven "missed" state', () => {
    // AdherenceChipRow splits pet-driven (refused/partial) from owner-driven (missed);
    // the copy has to honour that split or it blames a cat for a forgotten dose.
    const missed = doseAdherencePrompt({ petName: 'Pixel', inDoubt: false, adherence: 'missed' });
    expect(missed).toBe('This dose was missed — tap to change.');
    expect(missed).not.toContain('Pixel');
  });

  it('every restatement names the correction affordance (the B-172 catch)', () => {
    // The downgrade being easy to miss is the defect; the line must always say so.
    for (const a of ['given', 'partial', 'missed', 'refused'] as const) {
      expect(doseAdherencePrompt({ petName: 'Pixel', inDoubt: false, adherence: a }))
        .toContain('tap to change');
    }
  });

  // ── The adversarial-review catch: an ASSUMED given is not an owner assertion ──────
  it('a combo whose vehicle is not yet rated still ASKS — the given is an app default', () => {
    // The canonical Sam flow: the intake chips and "+ Add a med given with this" sit on
    // the same meal card, so a pill-in-food combo is logged at SERVING time, before the
    // bowl is touched. initialComboDoseAdherence(null) returns 'given' (correctly — there
    // is no evidence the vehicle FAILED either), but "nothing to go on" is not "the owner
    // said so", and administration != consumption in a combo. So it must not restate.
    expect(isGivenAssumed({ isCombo: true, vehicleIntake: null, adherence: 'given' })).toBe(true);
    expect(doseAdherencePrompt({
      petName: 'Pixel', inDoubt: false, adherence: 'given', givenIsAssumed: true,
    })).toBe('Did Pixel take it?');
  });

  it('a standalone dose is never "assumed" — its given IS the owner\'s one-tap log', () => {
    expect(isGivenAssumed({ isCombo: false, vehicleIntake: null, adherence: 'given' })).toBe(false);
  });

  it('a rated vehicle licenses the restatement, including after an in-doubt answer', () => {
    // Finished vehicle → the owner said the food went down.
    for (const v of ['some', 'most', 'all']) {
      expect(isGivenAssumed({ isCombo: true, vehicleIntake: v, adherence: 'given' })).toBe(false);
    }
    // Refused/picked with an EXPLICIT given → the owner answered the sharpened in-doubt
    // prompt, the strongest assertion on this surface. Re-asking here would resurrect the
    // exact "asks twice" defect B-172 exists to fix.
    for (const v of ['refused', 'picked']) {
      expect(isGivenAssumed({ isCombo: true, vehicleIntake: v, adherence: 'given' })).toBe(false);
    }
  });

  it('only `given` can be assumed — a downgrade is always the owner\'s own tap', () => {
    for (const a of ['partial', 'missed', 'refused', null] as const) {
      expect(isGivenAssumed({ isCombo: true, vehicleIntake: null, adherence: a })).toBe(false);
    }
  });

  it('in-doubt ASKS regardless of a stale adherence — the safety branch always wins', () => {
    // isComboDoseInDoubt already requires adherence==null, so this is belt-and-braces:
    // no argument combination may turn the in-doubt prompt into an assertion.
    for (const a of ['given', 'partial', 'missed', 'refused', null] as const) {
      expect(doseAdherencePrompt({ petName: 'Pixel', inDoubt: true, adherence: a }))
        .toBe('Did Pixel still get it?');
    }
  });

  it('follows the chips through a downgrade rather than contradicting them', () => {
    // The 1500ms confirm hold keeps the card open after a chip tap; a line pinned to
    // "Pixel took it" would sit over a lit "Missed" chip for that whole beat.
    const given = doseAdherencePrompt({ petName: 'Pixel', inDoubt: false, adherence: 'given' });
    const missed = doseAdherencePrompt({ petName: 'Pixel', inDoubt: false, adherence: 'missed' });
    expect(given).not.toBe(missed);
    expect(missed).not.toContain('took it');
  });

  it('the card reason states the fact plainly and names the pet', () => {
    expect(comboInDoubtReason({ petName: 'Pixel' })).toBe("Pixel didn't finish the food.");
  });

  it('the retroactive heads-up names the specific food and falls back to "the food" (B-325)', () => {
    expect(comboConfirmHeadsUp({ petName: 'Pixel', foodName: 'Churu' })).toBe(
      "Pixel didn't finish Churu.",
    );
    expect(comboConfirmHeadsUp({ petName: 'Pixel', foodName: null })).toBe(
      "Pixel didn't finish the food.",
    );
    expect(comboConfirmHeadsUp({ petName: 'Pixel', foodName: '   ' })).toBe(
      "Pixel didn't finish the food.",
    );
  });

  it('the detail note names the food, falls back to "the food", and asks (never asserts)', () => {
    // Exact strings so a grammar regression (a dropped relative pronoun) fails here, not
    // just a loose toContain — the note is owner-visible on the dose detail screen.
    expect(doseInDoubtNote({ petName: 'Pixel', foodName: 'Churu' })).toBe(
      "This dose was given in Churu, which Pixel didn't finish — confirm above whether it still got in.",
    );
    expect(doseInDoubtNote({ petName: 'Pixel', foodName: null })).toBe(
      "This dose was given in the food, which Pixel didn't finish — confirm above whether it still got in.",
    );
    expect(doseInDoubtNote({ petName: 'Pixel', foodName: '' })).toContain('the food');
    // Names the pet (nyx-voice Pattern 1) and points to the resolve affordance above.
    for (const n of notes) {
      expect(n).toContain('Pixel');
      expect(n.toLowerCase()).toContain('confirm');
    }
  });

  it('never reassures and never softens a refusal to "fussy"/"picky", and never shouts', () => {
    for (const s of [...prompts, ...notes, DOSE_IN_DOUBT_TAG]) {
      expect(REASSURE.test(s)).toBe(false);
      expect(SOFTEN.test(s)).toBe(false);
      expect(s.includes('!')).toBe(false);
    }
  });
});

describe('combo cross-link labels (B-156 PR B4) — legible without merging, drop cleanly', () => {
  describe('pairedVehicleLinkLabel — dose → vehicle', () => {
    it('names the vehicle the dose was given with', () => {
      expect(pairedVehicleLinkLabel('Churu')).toBe('Given with Churu');
      expect(pairedVehicleLinkLabel('Delectables Lickable')).toBe('Given with Delectables Lickable');
    });

    it('returns null when the food name is absent — the soft-deleted-vehicle drop (the AC)', () => {
      // getTimeline nulls paired_food_name when the paired event is soft-deleted (the join
      // filters deleted_at IS NULL). A null label → the surface renders no link → the combo
      // link drops cleanly, never pointing at a meal gone from History.
      expect(pairedVehicleLinkLabel(null)).toBeNull();
      expect(pairedVehicleLinkLabel(undefined)).toBeNull();
      expect(pairedVehicleLinkLabel('')).toBeNull();
      expect(pairedVehicleLinkLabel('   ')).toBeNull();
    });
  });

  describe('pairedDoseLinkLabel — vehicle → dose', () => {
    it('names the single drug when exactly one dose is paired, mirroring "Given with …"', () => {
      // Symmetric with pairedVehicleLinkLabel ("Given with …") so the two sides read as one
      // relationship, and no leading "+" (which would collide with B2b's create affordance).
      expect(pairedDoseLinkLabel({ count: 1, drugName: 'Cetirizine' })).toBe('Given with a Cetirizine dose');
    });

    it('falls back to "Given with a dose" when the single dose\'s drug name has not hydrated', () => {
      expect(pairedDoseLinkLabel({ count: 1, drugName: null })).toBe('Given with a dose');
      expect(pairedDoseLinkLabel({ count: 1, drugName: undefined })).toBe('Given with a dose');
      expect(pairedDoseLinkLabel({ count: 1, drugName: '  ' })).toBe('Given with a dose');
    });

    it('summarizes as a count for N doses in one vehicle (B1 allows N — no uniqueness)', () => {
      expect(pairedDoseLinkLabel({ count: 2, drugName: 'Cetirizine' })).toBe('Given with 2 doses');
      expect(pairedDoseLinkLabel({ count: 3 })).toBe('Given with 3 doses');
    });

    it('returns null when no dose is paired — the soft-deleted-dose drop (the AC)', () => {
      // The reverse join excludes a soft-deleted dose → count 0 → null label → the meal's
      // link drops cleanly. Defensive on a negative too (never reachable, never renders).
      expect(pairedDoseLinkLabel({ count: 0, drugName: 'Cetirizine' })).toBeNull();
      expect(pairedDoseLinkLabel({ count: -1 })).toBeNull();
    });
  });

  it('neither cross-link ever shouts (nyx-voice — no exclamation)', () => {
    const strings = [
      pairedVehicleLinkLabel('Churu'),
      pairedDoseLinkLabel({ count: 1, drugName: 'Cetirizine' }),
      pairedDoseLinkLabel({ count: 1, drugName: null }),
      pairedDoseLinkLabel({ count: 2 }),
    ].filter((s): s is string => s != null);
    for (const s of strings) {
      expect(s.includes('!')).toBe(false);
    }
  });
});

// Wire-path reinforcement: an in-doubt dose (null adherence) MUST round-trip to the
// server as null — the medication never-coerce rule, now load-bearing for the combo
// safety story (a coerced 'given' would be exactly the false-adherence record B3 exists
// to prevent). administrationRowToRemote is tested broadly elsewhere; this pins the
// combo case explicitly so a future "default the null" edit fails here first.
describe('administrationRowToRemote — an unconfirmed combo dose stays null on the wire', () => {
  it('forwards a null adherence as null even with a paired_event_id set (never coerced to given)', () => {
    const row: LocalMedicationAdministration = {
      id: 'dose-indoubt',
      event_id: 'evt-dose',
      pet_id: 'pet-1',
      medication_id: null,
      medication_item_id: 'item-1',
      adherence: null, // unconfirmed — the not-finished-vehicle combo case
      dose_amount: null,
      how_given: 'in_treat',
      paired_event_id: 'evt-meal', // the refused/picked vehicle
      logged_via: 'app', // B-289
      notes: null,
      created_at: '2026-06-23T10:00:00.000Z',
      updated_at: '2026-06-23T10:00:00.000Z',
    };
    const out = administrationRowToRemote(row);
    expect(out.adherence).toBeNull();
    expect(out.paired_event_id).toBe('evt-meal');
    expect(out.how_given).toBe('in_treat');
  });
});

// ── B-171 — the owner-facing drug NAME (the completion card's one-glance word) ──────
// PM ruling (option b): brand when present, generic otherwise. The card confirms with
// the word the owner uses, not the one the catalog stores.
describe('drugDisplayName — the owner-facing drug name (B-171)', () => {
  it('prefers the brand when both names are present', () => {
    expect(drugDisplayName('cetirizine', 'Zyrtec')).toBe('Zyrtec');
  });

  it('falls back to the generic when there is no brand', () => {
    expect(drugDisplayName('gabapentin', null)).toBe('gabapentin');
    expect(drugDisplayName('gabapentin', undefined)).toBe('gabapentin');
    expect(drugDisplayName('gabapentin', '')).toBe('gabapentin');
    // Whitespace-only is not a name — it must not beat a real generic.
    expect(drugDisplayName('gabapentin', '   ')).toBe('gabapentin');
  });

  it('uses the brand when the generic is missing', () => {
    expect(drugDisplayName(null, 'Apoquel')).toBe('Apoquel');
    expect(drugDisplayName('', 'Apoquel')).toBe('Apoquel');
  });

  it('returns null when neither name is known (renders nothing)', () => {
    expect(drugDisplayName(null, null)).toBeNull();
    expect(drugDisplayName(undefined, undefined)).toBeNull();
    expect(drugDisplayName('', '')).toBeNull();
    expect(drugDisplayName('  ', '  ')).toBeNull();
  });
});

// ── B-161 — the shared owner-facing drug label (History row + Home "Today" strip) ──
// One source so the two surfaces can't drift on how a dose names its drug; the whole
// point is distinguishing two "Medication" rows for a multi-med pet. Deliberately still
// GENERIC-FIRST after B-171 took the card brand-first — reordering the row was tried and
// reverted (it drifts at call sites this rule doesn't reach, and the shared leading
// generic is the only cue that two library items are the same active ingredient, which
// getDoubleDoseFlag can't catch). That reorder is B-522, a clinical call.
describe('formatDrugLabel — dose drug name (B-161)', () => {
  it('joins generic · brand when both are present', () => {
    expect(formatDrugLabel('cetirizine', 'Zyrtec')).toBe('cetirizine · Zyrtec');
  });

  it('returns the generic alone when there is no brand', () => {
    expect(formatDrugLabel('gabapentin', null)).toBe('gabapentin');
    expect(formatDrugLabel('gabapentin', undefined)).toBe('gabapentin');
    expect(formatDrugLabel('gabapentin', '')).toBe('gabapentin');
  });

  it('falls back to the brand when the generic is missing', () => {
    expect(formatDrugLabel(null, 'Apoquel')).toBe('Apoquel');
    expect(formatDrugLabel('', 'Apoquel')).toBe('Apoquel');
  });

  it('never doubles a name when brand and generic are the same string', () => {
    expect(formatDrugLabel('Zyrtec', 'Zyrtec')).toBe('Zyrtec');
    expect(formatDrugLabel(' Zyrtec ', 'Zyrtec')).toBe('Zyrtec');
  });

  it('returns null when neither name is known (renders no subline)', () => {
    expect(formatDrugLabel(null, null)).toBeNull();
    expect(formatDrugLabel(undefined, undefined)).toBeNull();
    expect(formatDrugLabel('', '')).toBeNull();
  });

  it('keeps the generic as the leading token — the B-522 guard', () => {
    // Load-bearing, not cosmetic: two library items for the same active ingredient (one
    // captured brand-forward, one entered generic) are invisible to getDoubleDoseFlag,
    // which keys on medication_item_id. The shared leading generic is the only thing that
    // puts them next to each other in a History scan, and every consumer truncates at
    // numberOfLines={1}. Flipping this is a clinical call (B-522), so it fails loudly here.
    expect(formatDrugLabel('cetirizine', 'Zyrtec')!.startsWith('cetirizine')).toBe(true);
    expect(formatDrugLabel('cetirizine', null)!.startsWith('cetirizine')).toBe(true);
  });
});

// ── B-160 — common-medication NAME suggestions (curated-list contract) ──────────
// COMMON_MEDICATIONS is a shared lib/ data source consumed by the name-chip row, so
// the DoD requires it pinned by a test. The contract that matters: it stays a small
// CURATED list (no dupes, real names), and commonMedicationsForSpecies orders it
// per the active pet's species WITHOUT ever hiding a 'both' drug (the §9 union AC).
describe('COMMON_MEDICATIONS — curated data contract', () => {
  it('has no duplicate names (a duplicate would render two identical chips)', () => {
    const names = COMMON_MEDICATIONS.map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('stays curated, not a formulary (≤16, the S1 cap)', () => {
    expect(COMMON_MEDICATIONS.length).toBeGreaterThan(0);
    expect(COMMON_MEDICATIONS.length).toBeLessThanOrEqual(16);
  });

  it('gives every entry a non-empty, trimmed name and a valid species', () => {
    COMMON_MEDICATIONS.forEach((m) => {
      expect(m.name.trim()).toBe(m.name);
      expect(m.name.length).toBeGreaterThan(0);
      expect(['dog', 'cat', 'both']).toContain(m.species);
    });
  });

  it('names never shout (nyx-voice — no exclamation; this is setup copy, same bar)', () => {
    COMMON_MEDICATIONS.forEach((m) => expect(m.name).not.toContain('!'));
  });

  it('flags exactly the life-critical drugs `critical` (forward-looking PR 9 reuse, §7)', () => {
    // Not rendered — but the curated `critical` set is the asset PR 9 consumes for the
    // missed-critical-dose escalation. Pin it so a future edit can't silently drop a
    // critical drug (insulin/cardiac/anti-seizure) or over-mark a routine one.
    const critical = COMMON_MEDICATIONS.filter((m) => m.critical).map((m) => m.name).sort();
    expect(critical).toEqual(['Furosemide', 'Insulin', 'Levetiracetam', 'Pimobendan'].sort());
    // A routine allergy/itch drug must NOT be flagged critical.
    expect(COMMON_MEDICATIONS.find((m) => m.name === 'Apoquel')?.critical).toBeFalsy();
  });
});

describe('commonMedicationsForSpecies — species-first ordering, never a filter (§4.1 / §9)', () => {
  // The group a drug belongs to for a given species: 0 = species-specific (leads),
  // 1 = 'both' (cross-species, never hidden), 2 = the opposite species (tail).
  const groupOf = (m: CommonMedication, species: 'dog' | 'cat'): number =>
    m.species === species ? 0 : m.species === 'both' ? 1 : 2;

  it('returns EVERY drug for any species — a union, never a filter (never hides a `both`)', () => {
    // The load-bearing §9 AC: all entries always present, so no 'both' (or any) drug
    // is ever dropped. Same multiset in, same multiset out, just reordered.
    for (const sp of ['dog', 'cat', 'other', null, undefined] as const) {
      const out = commonMedicationsForSpecies(sp);
      expect(out.length).toBe(COMMON_MEDICATIONS.length);
      expect(out.map((m) => m.name).sort()).toEqual(COMMON_MEDICATIONS.map((m) => m.name).sort());
    }
    // Explicitly: every 'both' drug survives every species ordering.
    const bothNames = COMMON_MEDICATIONS.filter((m) => m.species === 'both').map((m) => m.name);
    for (const sp of ['dog', 'cat', 'other'] as const) {
      const outNames = commonMedicationsForSpecies(sp).map((m) => m.name);
      bothNames.forEach((n) => expect(outNames).toContain(n));
    }
  });

  it('leads a cat with the cat-specific drugs (methimazole/mirtazapine surface)', () => {
    const cat = commonMedicationsForSpecies('cat');
    // The two feline drugs lead, in stable COMMON_MEDICATIONS order (Mirtazapine row
    // precedes Methimazole), ahead of any 'both' or dog drug.
    expect(cat.slice(0, 2).map((m) => m.name)).toEqual(['Mirtazapine', 'Methimazole']);
    // And the group sequence is non-decreasing — [cat…, both…, dog…], no interleave.
    const groups = cat.map((m) => groupOf(m, 'cat'));
    expect(groups).toEqual([...groups].sort((a, b) => a - b));
  });

  it('leads a dog with the dog-specific drugs (carprofen/pimobendan surface)', () => {
    const dog = commonMedicationsForSpecies('dog');
    expect(dog.slice(0, 3).map((m) => m.name)).toEqual(['Carprofen', 'Trazodone', 'Pimobendan']);
    expect(dog.slice(0, 3).map((m) => m.name)).toEqual(expect.arrayContaining(['Carprofen', 'Pimobendan']));
    const groups = dog.map((m) => groupOf(m, 'dog'));
    expect(groups).toEqual([...groups].sort((a, b) => a - b));
  });

  it("orders an 'other'/unknown pet with 'both' first, then the species drugs (nothing matches)", () => {
    // No drug is species 'other', so the matches group is empty → 'both' leads (the
    // broadly-applicable set), then the dog+cat drugs in stable order.
    for (const sp of ['other', null, undefined] as const) {
      const out = commonMedicationsForSpecies(sp);
      const firstSpecific = out.findIndex((m) => m.species !== 'both');
      const lastBoth = out.map((m) => m.species).lastIndexOf('both');
      expect(lastBoth).toBeLessThan(firstSpecific); // every 'both' precedes every specific
    }
  });

  it('preserves stable COMMON_MEDICATIONS order WITHIN each group', () => {
    // Stability matters: rough owner-frequency order is the within-group ranking.
    const cat = commonMedicationsForSpecies('cat');
    const both = cat.filter((m) => m.species === 'both').map((m) => m.name);
    const originalBoth = COMMON_MEDICATIONS.filter((m) => m.species === 'both').map((m) => m.name);
    expect(both).toEqual(originalBoth);
  });
});

// ── B-441 — the regimen day counter ───────────────────────────────────────────
// Mirrors the diet-trial oracle in lib/analytics.test.ts ("timezone honesty",
// B-421) case for case, because this counter carried the identical flaw and the
// two must not drift: the same instants, the same zones, the same expected day.
describe('regimenDaysElapsed (B-441)', () => {
  const MINUS_7 = 'Etc/GMT+7'; // UTC−7
  const PLUS_11 = 'Etc/GMT-11'; // UTC+11
  const STARTED = '2026-06-10';

  // Four instants that are all "14 Jun, local" for their respective owner. Day 1 is
  // 10 Jun, so every one is day 5 — whatever UTC date the instant happens to carry.
  const CASES = [
    { label: 'UTC−7 @ 00:30 local', zone: MINUS_7, nowIso: '2026-06-14T07:30:00.000Z', utcDate: '2026-06-14' },
    { label: 'UTC−7 @ 23:30 local', zone: MINUS_7, nowIso: '2026-06-15T06:30:00.000Z', utcDate: '2026-06-15' },
    { label: 'UTC+11 @ 00:30 local', zone: PLUS_11, nowIso: '2026-06-13T13:30:00.000Z', utcDate: '2026-06-13' },
    { label: 'UTC+11 @ 23:30 local', zone: PLUS_11, nowIso: '2026-06-14T12:30:00.000Z', utcDate: '2026-06-14' },
  ];

  it.each(CASES)('reads day 5 at $label', ({ zone, nowIso }) => {
    expect(regimenDaysElapsed(STARTED, Date.parse(nowIso), zone)).toBe(5);
  });

  it('all four readings agree — one local day, one day N', () => {
    const counts = CASES.map(({ zone, nowIso }) => regimenDaysElapsed(STARTED, Date.parse(nowIso), zone));
    expect(counts).toEqual([5, 5, 5, 5]);
    expect(new Set(counts).size).toBe(1);
  });

  it('the shipped-before-B-441 arithmetic disagreed with itself across these instants', () => {
    // Not a test of shipped code — it pins WHAT THIS COST, so a refactor back to
    // `new Date(started_at)` + a ms-span divide fails against a test that says why.
    // This is the exact old body, with the device zone stood in for by the UTC date
    // the instant carries (which is what a UTC-parsed DATE effectively floors to).
    const old = CASES.map(
      ({ utcDate }) =>
        Math.max(1, Math.floor(
          (Date.parse(`${utcDate}T00:00:00Z`) - Date.parse('2026-06-10T00:00:00Z')) / (1000 * 60 * 60 * 24),
        ) + 1),
    );
    expect(old).toEqual([5, 6, 4, 5]);
    expect(Math.max(...old) - Math.min(...old)).toBe(2);
  });

  it('a course that started "yesterday" local reads day 2 on both sides of the date line', () => {
    // The discrepancy owners actually hit: the course started yesterday where they
    // live, but the UTC clock has already rolled past midnight (or has not reached it).
    expect(regimenDaysElapsed('2026-06-13', Date.parse('2026-06-15T06:30:00.000Z'), MINUS_7)).toBe(2);
    expect(regimenDaysElapsed('2026-06-13', Date.parse('2026-06-13T13:30:00.000Z'), PLUS_11)).toBe(2);
  });

  it('a course that started today reads day 1, not day 0', () => {
    expect(regimenDaysElapsed('2026-06-14', Date.parse('2026-06-14T07:30:00.000Z'), MINUS_7)).toBe(1);
  });

  it('a future start date floors at day 1 rather than going negative', () => {
    // An owner back-filling a prescription that begins tomorrow.
    expect(regimenDaysElapsed('2026-06-20', Date.parse('2026-06-14T07:30:00.000Z'), MINUS_7)).toBe(1);
  });

  it('every local day advances the count by exactly one across a DST spring-forward', () => {
    // 2026-03-08 is the US spring-forward. Differencing midnights in milliseconds
    // makes that local day 23h long and loses a day; calendar indexing cannot.
    const zone = 'America/Los_Angeles';
    const counts = [
      regimenDaysElapsed('2026-03-06', Date.parse('2026-03-07T20:00:00.000Z'), zone), // 7 Mar local
      regimenDaysElapsed('2026-03-06', Date.parse('2026-03-08T20:00:00.000Z'), zone), // 8 Mar local
      regimenDaysElapsed('2026-03-06', Date.parse('2026-03-09T20:00:00.000Z'), zone), // 9 Mar local
    ];
    expect(counts).toEqual([2, 3, 4]);
  });

  it('returns null for an unparseable start date rather than a guessed day', () => {
    // The honest-null contract localDayIndexOf states. The old body returned NaN
    // here, which flowed into the compliance denominator unchecked.
    expect(regimenDaysElapsed('not-a-date', Date.parse('2026-06-14T07:30:00.000Z'))).toBeNull();
    expect(regimenDaysElapsed('2026-02-30', Date.parse('2026-06-14T07:30:00.000Z'))).toBeNull();
  });

  it('returns null for a non-finite nowMs rather than NaN', () => {
    // NaN is strictly worse than a wrong number: the profile card's render guard is
    // `daysElapsed != null`, and `NaN != null` is TRUE — so a NaN sails past the very
    // check added to stop "Day null of 14" and prints "Day NaN of 14" instead.
    // Today's only caller takes the Date.now() default; B-614's Home strip will pass
    // an explicit instant, which is why this is guarded now rather than when it bites.
    expect(regimenDaysElapsed('2026-06-10', NaN)).toBeNull();
    expect(regimenDaysElapsed('2026-06-10', Date.parse('nonsense'))).toBeNull();
    expect(regimenDaysElapsed('2026-06-10', Infinity)).toBeNull();
  });

  it('a null day count yields a dose COUNT, never an inflated percent', () => {
    // The profile card's degradation (B-441): with no denominator the regimen
    // reports PRN-shaped output. Guessing `daysElapsed = 1` instead would report
    // "100% given" over 3 doses of a twice-daily course — the reassuring direction.
    const days = regimenDaysElapsed('not-a-date');
    const c = computeRegimenCompliance({
      dosesPerDay: days === null ? null : 2,
      daysElapsed: days ?? 1,
      tally: tally({ given: 3 }),
    });
    expect(c.isPrn).toBe(true);
    expect(c.percent).toBeNull();
    expect(c.loggedDoses).toBe(3);

    const guessed = computeRegimenCompliance({ dosesPerDay: 2, daysElapsed: 1, tally: tally({ given: 3 }) });
    expect(guessed.percent).toBe(100); // what the guess would have claimed
  });
});

// ── B-140 PR 1 — attributeDoses (the full attribution partition) + tallyDoses ─────
// attributeDoses is the primitive attributeDosesToRegimens now delegates to; it exposes
// the SAME single decision as three fields so lib/medicationHistory can read orphans and
// per-regimen doses without a rival attribution. The load-bearing guarantees: the tallies
// are byte-for-byte what attributeDosesToRegimens always returned, and every live dose is
// partitioned exactly once across grouped ∪ unattributed (nothing double-counted, nothing
// dropped).
describe('attributeDoses — the full partition behind attributeDosesToRegimens (B-140)', () => {
  const reg = (over: Partial<RegimenWindow> = {}): RegimenWindow => ({
    id: 'reg-1', medication_item_id: 'item-pred', started_at: '2026-06-10', ended_at: null, ...over,
  });
  const dose = (over: Partial<AttributableDose> = {}): AttributableDose => ({
    medication_id: null, medication_item_id: 'item-pred', adherence: 'given', deleted_at: null,
    occurred_at: '2026-06-12T08:00:00+00:00', ...over,
  });

  it('its tallies equal attributeDosesToRegimens byte-for-byte, across mixed scenarios', () => {
    // The delegation contract: adding grouped/unattributed must not perturb the tally
    // any existing caller (the profile card, the med strip) already reads.
    const scenarios: { regs: RegimenWindow[]; doses: AttributableDose[] }[] = [
      { regs: [reg()], doses: [dose(), dose({ adherence: 'refused' }), dose({ medication_id: 'reg-1' })] },
      { regs: [reg({ id: 'a', started_at: '2026-06-01', ended_at: '2026-06-10' }), reg({ id: 'b', started_at: '2026-06-11' })],
        doses: [dose({ occurred_at: '2026-06-12T08:00:00+00:00' }), dose({ occurred_at: '2026-06-05T08:00:00+00:00' })] },
      { regs: [reg({ medication_item_id: null, id: 'ft' })],
        doses: [dose({ medication_id: 'ft', medication_item_id: null }), dose({ medication_item_id: null })] },
      { regs: [], doses: [dose(), dose({ medication_id: 'ghost' })] },
    ];
    for (const s of scenarios) {
      const viaDelegate = attributeDosesToRegimens(s.regs, s.doses);
      const viaPrimitive = attributeDoses(s.regs, s.doses).tallies;
      expect([...viaPrimitive.entries()]).toEqual([...viaDelegate.entries()]);
    }
  });

  it('partitions every LIVE dose exactly once (grouped ∪ unattributed = live; disjoint)', () => {
    const doses: AttributableDose[] = [
      dose({ medication_id: 'reg-1' }),                                   // linked → grouped
      dose({ medication_item_id: 'item-pred' }),                         // item+window → grouped
      dose({ medication_item_id: 'item-other' }),                        // no regimen for drug → unattributed
      dose({ medication_id: null, medication_item_id: null }),           // ad-hoc → unattributed
      dose({ medication_id: 'ghost' }),                                  // linked to absent regimen → unattributed
      dose({ deleted_at: '2026-06-12T09:00:00Z' }),                      // soft-deleted → neither
    ];
    const { grouped, unattributed } = attributeDoses([reg()], doses);
    const groupedCount = [...grouped.values()].reduce((n, arr) => n + arr.length, 0);
    expect(groupedCount).toBe(2);
    expect(unattributed.length).toBe(3);
    // 5 live doses, split with none dropped and none counted twice (the deleted one is in neither).
    expect(groupedCount + unattributed.length).toBe(5);
  });

  it('surfaces a dose linked to a regimen ABSENT from the set as unattributed, never dropped', () => {
    // The report's §3.8 stance: nothing logged is silently lost. It counts toward no
    // tally (no reassignment) but is available to a course-grain reader.
    const { tallies, unattributed } = attributeDoses([reg({ id: 'active' })], [
      dose({ medication_id: 'ended-regimen' }),
    ]);
    expect(tallies.get('active')).toEqual(emptyTally());
    expect(unattributed).toHaveLength(1);
    expect(unattributed[0].medication_id).toBe('ended-regimen');
  });

  it('grouped holds the actual attributed doses, so first/last can be read from it', () => {
    const { grouped } = attributeDoses([reg()], [
      dose({ occurred_at: '2026-06-12T08:00:00Z' }),
      dose({ occurred_at: '2026-06-14T20:00:00Z' }),
    ]);
    const rows = grouped.get('reg-1')!;
    expect(rows).toHaveLength(2);
    expect(rows.map((d) => d.occurred_at)).toEqual(['2026-06-12T08:00:00Z', '2026-06-14T20:00:00Z']);
  });
});

describe('tallyDoses — shared adherence bucketer (B-140)', () => {
  it('buckets a bare dose list identically to the attribution pass', () => {
    const doses = [
      { adherence: 'given' }, { adherence: 'partial' }, { adherence: 'missed' },
      { adherence: 'refused' }, { adherence: null }, { adherence: 'given' },
    ];
    expect(tallyDoses(doses)).toEqual({ given: 2, partial: 1, missed: 1, refused: 1, unrated: 1 });
  });

  it('an empty list is an empty tally (never undefined)', () => {
    expect(tallyDoses([])).toEqual(emptyTally());
  });

  it('agrees with attributeDoses for the same doses under one regimen (one bucketer)', () => {
    const doses: AttributableDose[] = [
      { medication_id: 'r', medication_item_id: 'i', adherence: 'given', deleted_at: null, occurred_at: '2026-06-12T08:00:00Z' },
      { medication_id: 'r', medication_item_id: 'i', adherence: 'partial', deleted_at: null, occurred_at: '2026-06-12T20:00:00Z' },
    ];
    const viaAttribution = attributeDoses(
      [{ id: 'r', medication_item_id: 'i', started_at: '2026-06-10', ended_at: null }],
      doses,
    ).tallies.get('r');
    expect(tallyDoses(doses)).toEqual(viaAttribution);
  });
});

// The shared embed-shape mapper both profile medication loaders read (B-140 PR 2). The
// B-196 subtlety it exists to own: supabase-js surfaces a to-one embed as EITHER an
// object OR a 1-element array, and the parent event's soft-delete + timestamp must lift
// onto the dose either way.
describe('mapDoseRowsToAttributable — dose embed → AttributableDose', () => {
  const ev = { deleted_at: null, occurred_at: '2026-03-05T08:00:00Z' };

  it('flattens an OBJECT embed onto the dose', () => {
    const [d] = mapDoseRowsToAttributable([
      { medication_id: 'r', medication_item_id: 'i', adherence: 'given', events: ev },
    ]);
    expect(d).toEqual({
      medication_id: 'r', medication_item_id: 'i', adherence: 'given',
      deleted_at: null, occurred_at: '2026-03-05T08:00:00Z',
    });
  });

  it('flattens a 1-ELEMENT ARRAY embed identically (the B-196 shape)', () => {
    const [d] = mapDoseRowsToAttributable([
      { medication_id: null, medication_item_id: 'i', adherence: null, events: [ev] },
    ]);
    expect(d.occurred_at).toBe('2026-03-05T08:00:00Z');
    expect(d.deleted_at).toBeNull();
  });

  it('carries a soft-deleted parent event through (so attribution can skip it)', () => {
    const [d] = mapDoseRowsToAttributable([
      { medication_id: 'r', medication_item_id: 'i', adherence: 'given', events: { deleted_at: '2026-03-06T09:00:00Z', occurred_at: '2026-03-06T08:00:00Z' } },
    ]);
    expect(d.deleted_at).toBe('2026-03-06T09:00:00Z');
  });

  it('a missing embed yields occurred_at "" (ordered out, never a throw); null/undefined rows → []', () => {
    const [d] = mapDoseRowsToAttributable([
      { medication_id: 'r', medication_item_id: 'i', adherence: 'given', events: null },
    ]);
    expect(d.occurred_at).toBe('');
    expect(d.deleted_at).toBeNull();
    expect(mapDoseRowsToAttributable(null)).toEqual([]);
    expect(mapDoseRowsToAttributable(undefined)).toEqual([]);
  });
});
