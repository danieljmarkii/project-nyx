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
  attributeDosesToRegimens,
  regimenComplianceLine,
  regimenFlagLine,
  buildRegimenPayload,
  canSaveRegimen,
  doubleDoseWindowHours,
  detectDoubleDose,
  formatDoseGap,
  doubleDoseNote,
  DEFAULT_DOUBLE_DOSE_WINDOW_HOURS,
  DOUBLE_DOSE_WINDOW_CAP_HOURS,
  DOUBLE_DOSE_WINDOW_FLOOR_HOURS,
  MEDICATION_SCHEMA_SQL,
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
        'schedule_notes', 'started_at', 'status', 'target_duration_days', 'updated_at',
      ].sort(),
    );
  });

  it('passes a PRN regimen (null doses_per_day) and an ad-hoc null item through unchanged', () => {
    const prn = medicationRowToRemote({ ...reg, doses_per_day: null, medication_item_id: null });
    expect(prn.doses_per_day).toBeNull();
    expect(prn.medication_item_id).toBeNull();
    expect(prn.drug_name).toBe('prednisolone'); // denormalized name still carried
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
    notes: null,
    created_at: '2026-06-01T10:00:00.000Z',
    updated_at: '2026-06-01T10:00:00.000Z',
  };

  it('forwards every server column and carries NO deleted_at (soft-delete rides the parent event)', () => {
    // B-057 drift guard: the key set IS the column contract. how_given (B-156) is
    // now part of it; a stray local-only key would error against the Postgres schema.
    const keys = Object.keys(administrationRowToRemote(dose));
    expect(keys).not.toContain('deleted_at');
    expect(keys).not.toContain('synced');
    expect(keys.sort()).toEqual(
      [
        'adherence', 'created_at', 'dose_amount', 'event_id', 'how_given', 'id',
        'medication_id', 'medication_item_id', 'notes', 'pet_id', 'updated_at',
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
    medication_item_id: 'item-pred', adherence: 'given', deleted_at: null,
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
    expect(out.route).toBeNull();
    expect(out.drug_name).toBe('Prednisolone'); // denormalized name always present
  });

  it('requires a non-empty drug name (medications.drug_name is NOT NULL)', () => {
    expect(canSaveRegimen({ drugName: 'Apoquel' })).toBe(true);
    expect(canSaveRegimen({ drugName: '' })).toBe(false);
    expect(canSaveRegimen({ drugName: '   ' })).toBe(false);
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
