// Exercises the REAL medication-picker queries against an in-memory SQLite. The
// lib/db.ts jest harness mocks getAllAsync, so the SQL (the join shape, the dedup,
// the recency ordering, the deleted-dose exclusion, the window, the pet scope) is
// otherwise unexercised. node:sqlite (Node ≥ 22) runs the production strings
// against fixtures — the same harness as foodQueries.test.ts / medications.test.ts.
//
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');
import { LIBRARY_MEDICATIONS_QUERY, recentMedicationsQuery } from './medicationQueries';

interface PickRow {
  id: string;
  generic_name: string;
  brand_name: string | null;
  strength: string | null;
  form: string | null;
  default_route: string | null;
}

// [id, generic_name, brand_name, strength, form, default_route]
type ItemFixture = [string, string, string | null, string | null, string | null, string | null];
// [id, event_id, pet_id, medication_item_id]
type DoseFixture = [string, string, string, string | null];
// [id, occurred_at, deleted_at]
type EventFixture = [string, string, string | null];

function freshDb() {
  const db = new DatabaseSync(':memory:');
  // Minimal mirror of the columns the picker queries read.
  db.exec(`CREATE TABLE events (id TEXT PRIMARY KEY, occurred_at TEXT, deleted_at TEXT);`);
  db.exec(`CREATE TABLE medication_items_cache (
    id TEXT PRIMARY KEY, generic_name TEXT, brand_name TEXT, strength TEXT,
    form TEXT, default_route TEXT
  );`);
  db.exec(`CREATE TABLE medication_administrations (
    id TEXT PRIMARY KEY, event_id TEXT, pet_id TEXT, medication_item_id TEXT
  );`);
  return db;
}

function seedItems(db: ReturnType<typeof freshDb>, items: ItemFixture[]) {
  const ins = db.prepare(
    `INSERT INTO medication_items_cache (id, generic_name, brand_name, strength, form, default_route)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const r of items) ins.run(...r);
}

function seedEventsAndDoses(db: ReturnType<typeof freshDb>, events: EventFixture[], doses: DoseFixture[]) {
  const ie = db.prepare(`INSERT INTO events (id, occurred_at, deleted_at) VALUES (?, ?, ?)`);
  for (const e of events) ie.run(...e);
  const id = db.prepare(
    `INSERT INTO medication_administrations (id, event_id, pet_id, medication_item_id) VALUES (?, ?, ?, ?)`,
  );
  for (const d of doses) id.run(...d);
}

describe('LIBRARY_MEDICATIONS_QUERY', () => {
  it('returns every library row, alpha by drug then brand (case-insensitive)', () => {
    const db = freshDb();
    seedItems(db, [
      ['1', 'zidovudine', 'Z-Brand', null, null, null],
      ['2', 'Amoxicillin', 'Clavamox', '250 mg', 'tablet', 'oral'],
      ['3', 'amoxicillin', 'Amoxi-Tabs', '100 mg', 'tablet', 'oral'],
    ]);
    const rows = db.prepare(LIBRARY_MEDICATIONS_QUERY).all() as unknown as PickRow[];
    db.close();
    // amoxicillin (case-folded) sorts before zidovudine; within it, Amoxi-Tabs
    // before Clavamox by brand.
    expect(rows.map((r) => `${r.generic_name}/${r.brand_name}`)).toEqual([
      'amoxicillin/Amoxi-Tabs', 'Amoxicillin/Clavamox', 'zidovudine/Z-Brand',
    ]);
    expect(rows[0]).toMatchObject({ id: '3', strength: '100 mg', form: 'tablet', default_route: 'oral' });
  });

  it('does NOT dedup same-name rows — the organic library keeps each add (D2)', () => {
    // Unlike the food library, two explicit adds of the same drug both show (no
    // photo-recapture dup to collapse; canonicalization is the future refactor).
    const db = freshDb();
    seedItems(db, [
      ['a', 'prednisolone', 'Generic', '5 mg', 'tablet', 'oral'],
      ['b', 'prednisolone', 'Generic', '5 mg', 'tablet', 'oral'],
    ]);
    const rows = db.prepare(LIBRARY_MEDICATIONS_QUERY).all() as unknown as PickRow[];
    db.close();
    expect(rows).toHaveLength(2);
  });
});

describe('recentMedicationsQuery', () => {
  it('returns this pet\'s distinct recent drugs, newest dose first', () => {
    const db = freshDb();
    seedItems(db, [
      ['itemA', 'drugA', null, null, null, null],
      ['itemB', 'drugB', null, null, null, null],
    ]);
    seedEventsAndDoses(
      db,
      [['e1', '2026-06-01T10:00:00.000Z', null], ['e2', '2026-06-05T10:00:00.000Z', null]],
      [['d1', 'e1', 'p1', 'itemA'], ['d2', 'e2', 'p1', 'itemB']],
    );
    const rows = db.prepare(recentMedicationsQuery(false)).all('p1', 10) as unknown as PickRow[];
    db.close();
    expect(rows.map((r) => r.id)).toEqual(['itemB', 'itemA']); // newest first
  });

  it('dedups a drug given multiple times into one row, ordered by its latest dose', () => {
    const db = freshDb();
    seedItems(db, [['itemA', 'drugA', null, null, null, null], ['itemB', 'drugB', null, null, null, null]]);
    seedEventsAndDoses(
      db,
      [
        ['e1', '2026-06-01T10:00:00.000Z', null],
        ['e2', '2026-06-02T10:00:00.000Z', null], // drugB, older than A's latest
        ['e3', '2026-06-09T10:00:00.000Z', null], // drugA again, newest overall
      ],
      [['d1', 'e1', 'p1', 'itemA'], ['d2', 'e2', 'p1', 'itemB'], ['d3', 'e3', 'p1', 'itemA']],
    );
    const rows = db.prepare(recentMedicationsQuery(false)).all('p1', 10) as unknown as PickRow[];
    db.close();
    // One row per drug; drugA wins the top slot via its MAX(occurred_at) = e3.
    expect(rows.map((r) => r.id)).toEqual(['itemA', 'itemB']);
  });

  it('excludes soft-deleted doses (deletedness rides the parent event)', () => {
    const db = freshDb();
    seedItems(db, [['itemA', 'drugA', null, null, null, null]]);
    seedEventsAndDoses(
      db,
      [['e1', '2026-06-01T10:00:00.000Z', '2026-06-02T00:00:00.000Z']], // soft-deleted
      [['d1', 'e1', 'p1', 'itemA']],
    );
    const rows = db.prepare(recentMedicationsQuery(false)).all('p1', 10) as unknown as PickRow[];
    db.close();
    expect(rows).toHaveLength(0);
  });

  it('drops an ad-hoc dose with a NULL medication_item_id (no re-pickable tile)', () => {
    const db = freshDb();
    seedItems(db, [['itemA', 'drugA', null, null, null, null]]);
    seedEventsAndDoses(
      db,
      [['e1', '2026-06-01T10:00:00.000Z', null], ['e2', '2026-06-02T10:00:00.000Z', null]],
      [['d1', 'e1', 'p1', 'itemA'], ['d2', 'e2', 'p1', null]], // d2 is ad-hoc
    );
    const rows = db.prepare(recentMedicationsQuery(false)).all('p1', 10) as unknown as PickRow[];
    db.close();
    expect(rows.map((r) => r.id)).toEqual(['itemA']);
  });

  it('scopes to the requested pet only', () => {
    const db = freshDb();
    seedItems(db, [['itemA', 'drugA', null, null, null, null], ['itemB', 'drugB', null, null, null, null]]);
    seedEventsAndDoses(
      db,
      [['e1', '2026-06-01T10:00:00.000Z', null], ['e2', '2026-06-02T10:00:00.000Z', null]],
      [['d1', 'e1', 'p1', 'itemA'], ['d2', 'e2', 'p2', 'itemB']], // d2 belongs to p2
    );
    const rows = db.prepare(recentMedicationsQuery(false)).all('p1', 10) as unknown as PickRow[];
    db.close();
    expect(rows.map((r) => r.id)).toEqual(['itemA']);
  });

  it('honors the recency window when hasWindow=true', () => {
    const db = freshDb();
    seedItems(db, [['itemA', 'drugA', null, null, null, null], ['itemB', 'drugB', null, null, null, null]]);
    seedEventsAndDoses(
      db,
      [['e1', '2026-05-01T10:00:00.000Z', null], ['e2', '2026-06-10T10:00:00.000Z', null]],
      [['d1', 'e1', 'p1', 'itemA'], ['d2', 'e2', 'p1', 'itemB']],
    );
    // Cutoff excludes the May dose (itemA), keeps the June one (itemB).
    const rows = db.prepare(recentMedicationsQuery(true)).all('p1', '2026-06-01T00:00:00.000Z', 10) as unknown as PickRow[];
    db.close();
    expect(rows.map((r) => r.id)).toEqual(['itemB']);
  });

  it('honors the LIMIT', () => {
    const db = freshDb();
    seedItems(db, [
      ['itemA', 'drugA', null, null, null, null],
      ['itemB', 'drugB', null, null, null, null],
      ['itemC', 'drugC', null, null, null, null],
    ]);
    seedEventsAndDoses(
      db,
      [
        ['e1', '2026-06-01T10:00:00.000Z', null],
        ['e2', '2026-06-02T10:00:00.000Z', null],
        ['e3', '2026-06-03T10:00:00.000Z', null],
      ],
      [['d1', 'e1', 'p1', 'itemA'], ['d2', 'e2', 'p1', 'itemB'], ['d3', 'e3', 'p1', 'itemC']],
    );
    const rows = db.prepare(recentMedicationsQuery(false)).all('p1', 2) as unknown as PickRow[];
    db.close();
    expect(rows.map((r) => r.id)).toEqual(['itemC', 'itemB']); // newest 2
  });
});
