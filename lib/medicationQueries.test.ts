// Exercises the REAL medication-picker queries against an in-memory SQLite. The
// lib/db.ts jest harness mocks getAllAsync, so the SQL (the join shape, the dedup,
// the recency ordering, the deleted-dose exclusion, the window, the pet scope) is
// otherwise unexercised. node:sqlite (Node ≥ 22) runs the production strings
// against fixtures — the same harness as foodQueries.test.ts / medications.test.ts.
//
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');
import { ACTIVE_REGIMEN_FOR_DRUG_QUERY, LIBRARY_MEDICATIONS_QUERY, recentMedicationsQuery, PAIRED_DOSE_REVERSE_JOIN } from './medicationQueries';

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

describe('ACTIVE_REGIMEN_FOR_DRUG_QUERY (B-153 dose→regimen link)', () => {
  // [id, pet_id, medication_item_id, dose_amount, started_at, status]
  type RegFixture = [string, string, string | null, string | null, string, string];
  function freshRegDb() {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE medications (
      id TEXT PRIMARY KEY, pet_id TEXT, medication_item_id TEXT, dose_amount TEXT,
      started_at TEXT, status TEXT
    );`);
    return db;
  }
  function seedRegs(db: ReturnType<typeof freshRegDb>, regs: RegFixture[]) {
    const ins = db.prepare(
      `INSERT INTO medications (id, pet_id, medication_item_id, dose_amount, started_at, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const r of regs) ins.run(...r);
  }
  type RegRow = { id: string; medication_item_id: string | null; dose_amount: string | null };

  it('returns the active regimen for the pet+drug, with its dose_amount to inherit', () => {
    const db = freshRegDb();
    seedRegs(db, [['r1', 'p1', 'item-pred', '5 mg', '2026-06-10', 'active']]);
    const row = db.prepare(ACTIVE_REGIMEN_FOR_DRUG_QUERY).get('p1', 'item-pred') as unknown as RegRow;
    db.close();
    expect(row).toMatchObject({ id: 'r1', medication_item_id: 'item-pred', dose_amount: '5 mg' });
  });

  it('ignores completed/stopped regimens (only an active one links)', () => {
    const db = freshRegDb();
    seedRegs(db, [['r1', 'p1', 'item-pred', '5 mg', '2026-06-10', 'completed']]);
    const row = db.prepare(ACTIVE_REGIMEN_FOR_DRUG_QUERY).get('p1', 'item-pred');
    db.close();
    expect(row).toBeUndefined();
  });

  it('scopes to the requested pet and drug', () => {
    const db = freshRegDb();
    seedRegs(db, [
      ['r1', 'p2', 'item-pred', '5 mg', '2026-06-10', 'active'], // other pet
      ['r2', 'p1', 'item-amox', '250 mg', '2026-06-10', 'active'], // other drug
    ]);
    const row = db.prepare(ACTIVE_REGIMEN_FOR_DRUG_QUERY).get('p1', 'item-pred');
    db.close();
    expect(row).toBeUndefined();
  });

  it('picks the most-recently-started active regimen when a drug has more than one', () => {
    const db = freshRegDb();
    seedRegs(db, [
      ['old', 'p1', 'item-pred', '2.5 mg', '2026-06-01', 'active'],
      ['new', 'p1', 'item-pred', '5 mg', '2026-06-12', 'active'],
    ]);
    const row = db.prepare(ACTIVE_REGIMEN_FOR_DRUG_QUERY).get('p1', 'item-pred') as unknown as RegRow;
    db.close();
    expect(row.id).toBe('new');
    expect(row.dose_amount).toBe('5 mg'); // inherits the current regimen's dose
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

describe('PAIRED_DOSE_REVERSE_JOIN (B-156 PR B4 vehicle → dose cross-link)', () => {
  // The reverse join is spliced into the timeline SELECT; this wrapper mirrors exactly
  // how getTimeline / getEventById splice + select it, so the real production fragment
  // is exercised end-to-end (the GROUP BY no-multiplication + the soft-delete drop — the
  // AC — are otherwise verified only on-device).
  const REVERSE_WRAPPER = `
    SELECT e.id,
           COALESCE(pd.dose_count, 0) AS paired_dose_count,
           pd.rep_event_id AS paired_dose_event_id,
           pdmi.generic_name AS paired_dose_drug_name
    FROM events e
    ${PAIRED_DOSE_REVERSE_JOIN}
    WHERE e.id = ?`;

  interface ReverseRow {
    id: string;
    paired_dose_count: number;
    paired_dose_event_id: string | null;
    paired_dose_drug_name: string | null;
  }

  function reverseDb() {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE events (id TEXT PRIMARY KEY, occurred_at TEXT, deleted_at TEXT);`);
    db.exec(`CREATE TABLE medication_items_cache (
      id TEXT PRIMARY KEY, generic_name TEXT, brand_name TEXT, strength TEXT, form TEXT, default_route TEXT
    );`);
    // paired_event_id is the only addition over the picker harness's dose table.
    db.exec(`CREATE TABLE medication_administrations (
      id TEXT PRIMARY KEY, event_id TEXT, pet_id TEXT, medication_item_id TEXT, paired_event_id TEXT
    );`);
    return db;
  }

  it('resolves a meal with one paired dose → count 1, the dose event id, the drug name', () => {
    const db = reverseDb();
    db.prepare(`INSERT INTO medication_items_cache (id, generic_name) VALUES (?, ?)`).run('item-cet', 'Cetirizine');
    db.prepare(`INSERT INTO events (id, occurred_at, deleted_at) VALUES (?, ?, ?)`).run('meal-1', '2026-06-23T16:00:00.000Z', null);
    db.prepare(`INSERT INTO events (id, occurred_at, deleted_at) VALUES (?, ?, ?)`).run('dose-1', '2026-06-23T16:01:00.000Z', null);
    db.prepare(
      `INSERT INTO medication_administrations (id, event_id, pet_id, medication_item_id, paired_event_id)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('adm-1', 'dose-1', 'p1', 'item-cet', 'meal-1');

    const row = db.prepare(REVERSE_WRAPPER).get('meal-1') as unknown as ReverseRow;
    db.close();
    expect(row).toMatchObject({
      paired_dose_count: 1,
      paired_dose_event_id: 'dose-1',
      paired_dose_drug_name: 'Cetirizine',
    });
  });

  it('drops a soft-deleted dose from the count — the meal link disappears (the AC)', () => {
    const db = reverseDb();
    db.prepare(`INSERT INTO medication_items_cache (id, generic_name) VALUES (?, ?)`).run('item-cet', 'Cetirizine');
    db.prepare(`INSERT INTO events (id, occurred_at, deleted_at) VALUES (?, ?, ?)`).run('meal-1', '2026-06-23T16:00:00.000Z', null);
    // The dose's parent event is soft-deleted (deletedness rides the parent event).
    db.prepare(`INSERT INTO events (id, occurred_at, deleted_at) VALUES (?, ?, ?)`).run('dose-1', '2026-06-23T16:01:00.000Z', '2026-06-23T17:00:00.000Z');
    db.prepare(
      `INSERT INTO medication_administrations (id, event_id, pet_id, medication_item_id, paired_event_id)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('adm-1', 'dose-1', 'p1', 'item-cet', 'meal-1');

    const row = db.prepare(REVERSE_WRAPPER).get('meal-1') as unknown as ReverseRow;
    db.close();
    // count 0 + null target → pairedDoseLinkLabel returns null → no link rendered.
    expect(row).toMatchObject({ paired_dose_count: 0, paired_dose_event_id: null, paired_dose_drug_name: null });
  });

  it('counts N doses in one vehicle as ONE timeline row (GROUP BY — no multiplication)', () => {
    const db = reverseDb();
    db.prepare(`INSERT INTO medication_items_cache (id, generic_name) VALUES (?, ?)`).run('item-cet', 'Cetirizine');
    db.prepare(`INSERT INTO events (id, occurred_at, deleted_at) VALUES (?, ?, ?)`).run('meal-1', '2026-06-23T16:00:00.000Z', null);
    db.prepare(`INSERT INTO events (id, occurred_at, deleted_at) VALUES (?, ?, ?)`).run('dose-a', '2026-06-23T16:01:00.000Z', null);
    db.prepare(`INSERT INTO events (id, occurred_at, deleted_at) VALUES (?, ?, ?)`).run('dose-b', '2026-06-23T16:02:00.000Z', null);
    const insDose = db.prepare(
      `INSERT INTO medication_administrations (id, event_id, pet_id, medication_item_id, paired_event_id)
       VALUES (?, ?, ?, ?, ?)`,
    );
    insDose.run('adm-a', 'dose-a', 'p1', 'item-cet', 'meal-1');
    insDose.run('adm-b', 'dose-b', 'p1', 'item-cet', 'meal-1');

    const rows = db.prepare(REVERSE_WRAPPER).all('meal-1') as unknown as ReverseRow[];
    db.close();
    expect(rows).toHaveLength(1); // the meal is never duplicated by its 2 paired doses
    expect(rows[0].paired_dose_count).toBe(2);
    // The representative (nav target) is deterministic — MIN(event_id) = 'dose-a'.
    expect(rows[0].paired_dose_event_id).toBe('dose-a');
  });

  it('reads a clean 0 for a standalone meal and for a (dose / symptom) event nothing points at', () => {
    const db = reverseDb();
    db.prepare(`INSERT INTO events (id, occurred_at, deleted_at) VALUES (?, ?, ?)`).run('meal-solo', '2026-06-23T16:00:00.000Z', null);
    db.prepare(`INSERT INTO events (id, occurred_at, deleted_at) VALUES (?, ?, ?)`).run('vomit-1', '2026-06-23T18:00:00.000Z', null);

    const meal = db.prepare(REVERSE_WRAPPER).get('meal-solo') as unknown as ReverseRow;
    const vomit = db.prepare(REVERSE_WRAPPER).get('vomit-1') as unknown as ReverseRow;
    db.close();
    expect(meal).toMatchObject({ paired_dose_count: 0, paired_dose_event_id: null });
    expect(vomit).toMatchObject({ paired_dose_count: 0, paired_dose_event_id: null });
  });

  it('returns count 1 with a NULL drug name when the dose has no library item (→ "+ a dose")', () => {
    const db = reverseDb();
    db.prepare(`INSERT INTO events (id, occurred_at, deleted_at) VALUES (?, ?, ?)`).run('meal-1', '2026-06-23T16:00:00.000Z', null);
    db.prepare(`INSERT INTO events (id, occurred_at, deleted_at) VALUES (?, ?, ?)`).run('dose-1', '2026-06-23T16:01:00.000Z', null);
    // Free-text/ad-hoc dose: medication_item_id NULL → the re-join finds no drug name.
    db.prepare(
      `INSERT INTO medication_administrations (id, event_id, pet_id, medication_item_id, paired_event_id)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('adm-1', 'dose-1', 'p1', null, 'meal-1');

    const row = db.prepare(REVERSE_WRAPPER).get('meal-1') as unknown as ReverseRow;
    db.close();
    expect(row).toMatchObject({ paired_dose_count: 1, paired_dose_event_id: 'dose-1', paired_dose_drug_name: null });
  });
});
