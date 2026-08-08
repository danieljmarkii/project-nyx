// The medication-history loader's SQL, run against a REAL engine (B-140 extended, PR 3).
//
// The `lib/db.ts` jest harness mocks `getAllAsync`, so the two strings in
// `medicationHistoryFacts.ts` are otherwise unexercised until a device — and their
// load-bearing parts ARE the SQL: NO `status = 'active'` filter (the amnesia this whole
// track undoes — a regression that re-adds it is exactly what must fail here), the
// soft-delete filter read THROUGH the parent event, and the pet scope. So `getDb` is
// backed by `node:sqlite` (Node ≥ 22) and `loadMedicationCourses` runs the production
// strings through the real derivation, end to end. Same instrument as
// `medStripFacts.test.ts` / `medicationQueries.test.ts`.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

interface TestDb {
  exec(sql: string): void;
  prepare(sql: string): { all(...a: unknown[]): Record<string, unknown>[]; run(...a: unknown[]): unknown };
  close(): void;
}

// The current DB the mocked `getDb` reads. A `let` so each test swaps in its own fixture
// engine, and one test can leave it null to force the throw contract.
let testDb: TestDb | null = null;
const mockGetDb = jest.fn(() => {
  if (!testDb) throw new Error('no db');
  const db = testDb;
  return {
    getAllAsync: (sql: string, params: unknown[]) =>
      Promise.resolve(db.prepare(sql).all(...((params ?? []) as unknown[]))),
  };
});
jest.mock('./db', () => ({ getDb: () => mockGetDb() }));

import {
  ALL_REGIMENS_FOR_HISTORY_SQL,
  ALL_DOSES_FOR_HISTORY_SQL,
  loadMedicationCourses,
} from './medicationHistoryFacts';

const PET = 'pet-1';
const OTHER = 'pet-2';

/** Just enough of the migration-020 shape (+ the events row a dose hangs off) to run
 *  the real SQL, and no more. */
function freshDb(): TestDb {
  const db: TestDb = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE events (
      id TEXT PRIMARY KEY, pet_id TEXT NOT NULL, occurred_at TEXT NOT NULL, deleted_at TEXT
    );
    CREATE TABLE medications (
      id TEXT PRIMARY KEY, pet_id TEXT NOT NULL, medication_item_id TEXT,
      drug_name TEXT NOT NULL, dose_amount TEXT, route TEXT, doses_per_day REAL,
      schedule_notes TEXT, started_at TEXT NOT NULL, target_duration_days INTEGER,
      target_duration_doses INTEGER, status TEXT NOT NULL DEFAULT 'active', ended_at TEXT
    );
    CREATE TABLE medication_administrations (
      id TEXT PRIMARY KEY, event_id TEXT NOT NULL, pet_id TEXT NOT NULL,
      medication_id TEXT, medication_item_id TEXT, adherence TEXT
    );
  `);
  return db;
}

function insertRegimen(db: TestDb, over: Partial<Record<string, unknown>> = {}) {
  const r = {
    id: 'reg-1', pet_id: PET, medication_item_id: 'item-metro', drug_name: 'Metronidazole',
    dose_amount: '250 mg', route: 'oral', doses_per_day: 2, schedule_notes: 'with food',
    started_at: '2026-03-03', target_duration_days: 14, target_duration_doses: null,
    status: 'active', ended_at: null, ...over,
  };
  db.prepare(
    `INSERT INTO medications (id, pet_id, medication_item_id, drug_name, dose_amount, route,
       doses_per_day, schedule_notes, started_at, target_duration_days, target_duration_doses,
       status, ended_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(r.id, r.pet_id, r.medication_item_id, r.drug_name, r.dose_amount, r.route,
        r.doses_per_day, r.schedule_notes, r.started_at, r.target_duration_days,
        r.target_duration_doses, r.status, r.ended_at);
}

// A dose = an events row + its 1:1 medication_administrations child.
function insertDose(db: TestDb, id: string, over: Partial<Record<string, unknown>> = {}) {
  const d = {
    pet_id: PET, occurred_at: '2026-03-05T08:00:00.000Z', deleted_at: null,
    medication_id: null, medication_item_id: 'item-metro', adherence: 'given', ...over,
  };
  const eventId = `evt-${id}`;
  db.prepare(`INSERT INTO events (id, pet_id, occurred_at, deleted_at) VALUES (?, ?, ?, ?)`)
    .run(eventId, d.pet_id, d.occurred_at, d.deleted_at);
  db.prepare(
    `INSERT INTO medication_administrations (id, event_id, pet_id, medication_id, medication_item_id, adherence)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, eventId, d.pet_id, d.medication_id, d.medication_item_id, d.adherence);
}

// ── The SQL strings, against node:sqlite ────────────────────────────────────────────

describe('ALL_REGIMENS_FOR_HISTORY_SQL', () => {
  let db: TestDb;
  beforeEach(() => { db = freshDb(); });
  afterEach(() => db.close());

  it('returns regimens of EVERY status — the whole point of the feature', () => {
    insertRegimen(db, { id: 'active-1', status: 'active' });
    insertRegimen(db, { id: 'completed-1', status: 'completed', ended_at: '2026-03-16' });
    insertRegimen(db, { id: 'stopped-1', status: 'stopped', ended_at: '2026-03-10' });
    const rows = db.prepare(ALL_REGIMENS_FOR_HISTORY_SQL).all(PET);
    // If a `WHERE status = 'active'` ever creeps back in, this drops to length 1 and fails.
    expect(rows.map((r) => r.id).sort()).toEqual(['active-1', 'completed-1', 'stopped-1']);
  });

  it('scopes to the given pet', () => {
    insertRegimen(db, { id: 'mine', pet_id: PET });
    insertRegimen(db, { id: 'theirs', pet_id: OTHER });
    expect(db.prepare(ALL_REGIMENS_FOR_HISTORY_SQL).all(PET).map((r) => r.id)).toEqual(['mine']);
  });

  it('selects exactly the MedicationHistoryRegimen columns', () => {
    insertRegimen(db, { id: 'r' });
    const row = db.prepare(ALL_REGIMENS_FOR_HISTORY_SQL).all(PET)[0];
    expect(Object.keys(row).sort()).toEqual(
      ['dose_amount', 'doses_per_day', 'drug_name', 'ended_at', 'id', 'medication_item_id',
        'route', 'schedule_notes', 'started_at', 'status', 'target_duration_days',
        'target_duration_doses'].sort(),
    );
  });
});

describe('ALL_DOSES_FOR_HISTORY_SQL', () => {
  let db: TestDb;
  beforeEach(() => { db = freshDb(); });
  afterEach(() => db.close());

  it('excludes a soft-deleted dose (read through the parent event)', () => {
    insertDose(db, 'kept');
    insertDose(db, 'gone', { deleted_at: '2026-03-06T09:00:00.000Z' });
    const rows = db.prepare(ALL_DOSES_FOR_HISTORY_SQL).all(PET, PET);
    expect(rows).toHaveLength(1);
    expect(rows[0].deleted_at).toBeNull();
  });

  it('scopes to the given pet and selects the AttributableDose columns', () => {
    insertDose(db, 'mine');
    insertDose(db, 'theirs', { pet_id: OTHER });
    // The events row for the other pet's dose must also be OTHER, or the e.pet_id filter
    // would not exclude it — insertDose sets both from `pet_id`.
    const rows = db.prepare(ALL_DOSES_FOR_HISTORY_SQL).all(PET, PET);
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).sort()).toEqual(
      ['adherence', 'deleted_at', 'medication_id', 'medication_item_id', 'occurred_at'].sort(),
    );
  });
});

// ── loadMedicationCourses — the real string through the real derivation ──────────────

describe('loadMedicationCourses', () => {
  afterEach(() => { if (testDb) { testDb.close(); testDb = null; } });

  it('surfaces an ended regimen that active-only surfaces would have hidden', async () => {
    testDb = freshDb();
    insertRegimen(testDb, {
      id: 'metro', status: 'completed', ended_at: '2026-03-16',
      started_at: '2026-03-03', doses_per_day: 2, target_duration_days: 14,
    });
    // 3 linked given doses against the ended regimen.
    insertDose(testDb, 'd1', { medication_id: 'metro', occurred_at: '2026-03-04T08:00:00.000Z' });
    insertDose(testDb, 'd2', { medication_id: 'metro', occurred_at: '2026-03-05T08:00:00.000Z' });
    insertDose(testDb, 'd3', { medication_id: 'metro', occurred_at: '2026-03-06T08:00:00.000Z' });

    const courses = await loadMedicationCourses(PET, 'UTC');
    expect(courses).not.toBeNull();
    expect(courses).toHaveLength(1);
    const c = courses![0];
    expect(c.key).toBe('metro');
    expect(c.isActive).toBe(false);
    expect(c.end).toEqual({ kind: 'ended', status: 'completed', endedAt: '2026-03-16' });
    expect(c.dosesLogged).toBe(3);
    expect(c.plannedDoses).toBe(28);
    expect(c.runDays).toBe(14);
  });

  it('derives a dose-derived (orphan) course for ad-hoc doses with no regimen', async () => {
    testDb = freshDb();
    insertDose(testDb, 'z1', { medication_item_id: 'item-zyrtec', occurred_at: '2026-06-02T13:00:00.000Z' });
    insertDose(testDb, 'z2', { medication_item_id: 'item-zyrtec', occurred_at: '2026-06-09T13:00:00.000Z' });

    const courses = await loadMedicationCourses(PET, 'UTC');
    expect(courses).toHaveLength(1);
    const c = courses![0];
    expect(c.source).toBe('doses');
    expect(c.key).toBe('item:item-zyrtec');
    expect(c.end.kind).toBe('none');
    expect(c.dosesLogged).toBe(2);
    expect(c.firstDoseDay).toBe('2026-06-02');
    expect(c.lastDoseDay).toBe('2026-06-09');
  });

  it('a soft-deleted dose does not count toward its course', async () => {
    testDb = freshDb();
    insertRegimen(testDb, { id: 'r', status: 'active' });
    insertDose(testDb, 'kept', { medication_id: 'r', occurred_at: '2026-03-05T08:00:00.000Z' });
    insertDose(testDb, 'gone', { medication_id: 'r', occurred_at: '2026-03-06T08:00:00.000Z', deleted_at: '2026-03-06T09:00:00.000Z' });

    const courses = await loadMedicationCourses(PET, 'UTC');
    expect(courses![0].dosesLogged).toBe(1);
  });

  it('resolves to null when getDb throws (contract — the surface renders no history)', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    testDb = null; // the mock throws
    await expect(loadMedicationCourses(PET)).resolves.toBeNull();
    expect(spy).toHaveBeenCalled(); // the failure is logged, not swallowed silently
    spy.mockRestore();
  });

  it('resolves to null when a read rejects, never rejects', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    testDb = {
      exec() {},
      prepare() { throw new Error('offline'); },
      close() {},
    };
    await expect(loadMedicationCourses(PET)).resolves.toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
