// The med-strip loader's SQL, run against a REAL engine (B-614 PR M2).
//
// The `lib/db.ts` jest harness mocks `getAllAsync`, so the three queries in
// `medStripFacts.ts` are otherwise unexercised until a device — and their
// load-bearing parts ARE the SQL: the `status = 'active'` regimen filter, the
// soft-delete filter read THROUGH the parent event, the vehicle join that carries
// the paired meal's intake so the resolver can derive the in-doubt state, the
// window lower bound, and the pet scope. A JS-level test could not catch a
// regression in any of them.
//
// Same instrument and reasoning as `dietTrialFacts.test.ts`: `node:sqlite`
// (Node ≥ 22) gives a real engine for the production strings; `require()`'d to
// keep it off the babel/jest-expo import path. The module pulls `lib/analytics`,
// whose graph reaches `lib/supabase`'s fail-fast env check, so stub the edge of
// the graph exactly as the sibling suite does.
jest.mock('./feedingArrangements', () => ({
  getActiveArrangementsForPet: jest.fn().mockResolvedValue([]),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');
import {
  ACTIVE_REGIMENS_FOR_STRIP_SQL,
  ITEMS_FOR_STRIP_SQL,
  RECENT_DOSES_FOR_STRIP_SQL,
} from './medStripFacts';

const PET = 'pet-1';
const OTHER = 'pet-2';

interface Db {
  exec(sql: string): void;
  prepare(sql: string): { all(...a: unknown[]): Record<string, unknown>[]; run(...a: unknown[]): unknown };
  close(): void;
}

/** Just enough of the real shape (migration 020 + the events/meals ALTERs) to run
 *  the real SQL, and no more. */
function freshDb(): Db {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE events (
      id TEXT PRIMARY KEY, pet_id TEXT NOT NULL, occurred_at TEXT NOT NULL, deleted_at TEXT
    );
    CREATE TABLE meals (
      id TEXT PRIMARY KEY, event_id TEXT NOT NULL, pet_id TEXT, intake_rating TEXT
    );
    CREATE TABLE medications (
      id TEXT PRIMARY KEY, pet_id TEXT NOT NULL, medication_item_id TEXT,
      drug_name TEXT NOT NULL, dose_amount TEXT, doses_per_day REAL,
      started_at TEXT NOT NULL, target_duration_days INTEGER,
      status TEXT NOT NULL DEFAULT 'active'
    );
    CREATE TABLE medication_administrations (
      id TEXT PRIMARY KEY, event_id TEXT NOT NULL, pet_id TEXT NOT NULL,
      medication_id TEXT, medication_item_id TEXT, adherence TEXT, dose_amount TEXT,
      paired_event_id TEXT
    );
    CREATE TABLE medication_items_cache (
      id TEXT PRIMARY KEY, generic_name TEXT NOT NULL, brand_name TEXT
    );
  `);
  return db;
}

function insertRegimen(db: Db, over: Partial<Record<string, unknown>> = {}) {
  const r = {
    id: 'reg-1', pet_id: PET, medication_item_id: 'item-amox', drug_name: 'Amoxicillin',
    dose_amount: '250 mg', doses_per_day: 2, started_at: '2026-07-27',
    target_duration_days: 14, status: 'active', ...over,
  };
  db.prepare(
    `INSERT INTO medications (id, pet_id, medication_item_id, drug_name, dose_amount,
       doses_per_day, started_at, target_duration_days, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(r.id, r.pet_id, r.medication_item_id, r.drug_name, r.dose_amount,
        r.doses_per_day, r.started_at, r.target_duration_days, r.status);
}

// Insert a dose = an events row + its 1:1 child. `vehicleIntake` (when given)
// also inserts a paired meal so the vehicle join has something to resolve.
function insertDose(
  db: Db,
  id: string,
  over: Partial<Record<string, unknown>> = {},
  vehicleIntake?: string,
) {
  const d = {
    pet_id: PET, occurred_at: '2026-07-31T09:00:00.000Z', deleted_at: null,
    medication_id: null, medication_item_id: 'item-amox', adherence: 'given',
    dose_amount: '250 mg', paired_event_id: null, ...over,
  };
  const eventId = `evt-${id}`;
  db.prepare(`INSERT INTO events (id, pet_id, occurred_at, deleted_at) VALUES (?, ?, ?, ?)`)
    .run(eventId, d.pet_id, d.occurred_at, d.deleted_at);
  let pairedEventId = d.paired_event_id as string | null;
  if (vehicleIntake !== undefined) {
    const mealEventId = `meal-evt-${id}`;
    db.prepare(`INSERT INTO events (id, pet_id, occurred_at, deleted_at) VALUES (?, ?, ?, ?)`)
      .run(mealEventId, d.pet_id, d.occurred_at, null);
    db.prepare(`INSERT INTO meals (id, event_id, pet_id, intake_rating) VALUES (?, ?, ?, ?)`)
      .run(`meal-${id}`, mealEventId, d.pet_id, vehicleIntake);
    pairedEventId = mealEventId;
  }
  db.prepare(
    `INSERT INTO medication_administrations (id, event_id, pet_id, medication_id,
       medication_item_id, adherence, dose_amount, paired_event_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, eventId, d.pet_id, d.medication_id, d.medication_item_id, d.adherence,
        d.dose_amount, pairedEventId);
}

const WINDOW_LOWER = '2026-07-16T18:00:00.000Z'; // ~15 days before NOW, the loader's bound

describe('ACTIVE_REGIMENS_FOR_STRIP_SQL', () => {
  let db: Db;
  beforeEach(() => { db = freshDb(); });
  afterEach(() => db.close());

  it('returns only active regimens for the given pet', () => {
    insertRegimen(db, { id: 'active-1' });
    insertRegimen(db, { id: 'ended-1', status: 'ended' });
    insertRegimen(db, { id: 'other-pet', pet_id: OTHER });
    const rows = db.prepare(ACTIVE_REGIMENS_FOR_STRIP_SQL).all(PET);
    expect(rows.map((r) => r.id)).toEqual(['active-1']);
  });

  it('selects exactly the columns the resolver reads', () => {
    insertRegimen(db, { id: 'active-1' });
    const row = db.prepare(ACTIVE_REGIMENS_FOR_STRIP_SQL).all(PET)[0];
    expect(Object.keys(row).sort()).toEqual(
      ['dose_amount', 'doses_per_day', 'drug_name', 'id', 'medication_item_id',
        'started_at', 'target_duration_days'].sort(),
    );
  });
});

describe('RECENT_DOSES_FOR_STRIP_SQL', () => {
  let db: Db;
  beforeEach(() => { db = freshDb(); });
  afterEach(() => db.close());

  it('scopes to the pet and excludes soft-deleted doses (AC #10)', () => {
    insertDose(db, 'live');
    insertDose(db, 'deleted', { deleted_at: '2026-07-31T12:00:00.000Z' });
    insertDose(db, 'other', { pet_id: OTHER });
    const rows = db.prepare(RECENT_DOSES_FOR_STRIP_SQL).all(PET, PET, WINDOW_LOWER);
    // Row identity is via the parent event's occurred_at; assert by count + that the
    // deleted/other-pet rows are gone (they share the same occurred_at otherwise).
    expect(rows).toHaveLength(1);
    expect(rows[0].deleted_at).toBeNull();
  });

  it('honours the window lower bound', () => {
    insertDose(db, 'in-window', { occurred_at: '2026-07-25T09:00:00.000Z' });
    insertDose(db, 'too-old', { occurred_at: '2026-07-01T09:00:00.000Z' });
    const rows = db.prepare(RECENT_DOSES_FOR_STRIP_SQL).all(PET, PET, WINDOW_LOWER);
    expect(rows).toHaveLength(1);
    expect(rows[0].occurred_at).toBe('2026-07-25T09:00:00.000Z');
  });

  it('carries the paired vehicle intake through the join (in-doubt derivation)', () => {
    insertDose(db, 'combo', { adherence: null }, 'refused');
    const rows = db.prepare(RECENT_DOSES_FOR_STRIP_SQL).all(PET, PET, WINDOW_LOWER);
    expect(rows).toHaveLength(1);
    expect(rows[0].paired_vehicle_intake).toBe('refused');
    expect(rows[0].paired_event_id).toBe('meal-evt-combo');
  });

  it('a standalone dose has a null vehicle intake', () => {
    insertDose(db, 'standalone');
    const rows = db.prepare(RECENT_DOSES_FOR_STRIP_SQL).all(PET, PET, WINDOW_LOWER);
    expect(rows[0].paired_vehicle_intake).toBeNull();
  });

  it('selects exactly the columns MedStripDoseRow carries', () => {
    insertDose(db, 'live');
    const row = db.prepare(RECENT_DOSES_FOR_STRIP_SQL).all(PET, PET, WINDOW_LOWER)[0];
    expect(Object.keys(row).sort()).toEqual(
      ['adherence', 'deleted_at', 'dose_amount', 'medication_id', 'medication_item_id',
        'occurred_at', 'paired_event_id', 'paired_vehicle_intake'].sort(),
    );
  });
});

describe('ITEMS_FOR_STRIP_SQL', () => {
  it('returns the id + both name columns for the cache', () => {
    const db = freshDb();
    db.prepare(`INSERT INTO medication_items_cache (id, generic_name, brand_name) VALUES (?, ?, ?)`)
      .run('item-amox', 'Amoxicillin', null);
    const rows = db.prepare(ITEMS_FOR_STRIP_SQL).all();
    expect(rows).toEqual([{ id: 'item-amox', generic_name: 'Amoxicillin', brand_name: null }]);
    db.close();
  });
});
