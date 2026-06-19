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
  MEDICATION_SCHEMA_SQL,
  type LocalMedicationItem,
  type LocalMedication,
  type LocalMedicationAdministration,
} from './medications';

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
    notes: null,
    created_at: '2026-06-01T10:00:00.000Z',
    updated_at: '2026-06-01T10:00:00.000Z',
  };

  it('forwards every server column and carries NO deleted_at (soft-delete rides the parent event)', () => {
    const keys = Object.keys(administrationRowToRemote(dose));
    expect(keys).not.toContain('deleted_at');
    expect(keys.sort()).toEqual(
      [
        'adherence', 'created_at', 'dose_amount', 'event_id', 'id', 'medication_id',
        'medication_item_id', 'notes', 'pet_id', 'updated_at',
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
