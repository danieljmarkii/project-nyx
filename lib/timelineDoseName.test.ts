// CUL-1124 — the timeline read carries a dose's second name: the course (the
// `medications` regimen) it was logged against, for a course typed in by hand, which has
// no item. Run against the REAL `getTimeline` / `getEventById` SQL on node:sqlite (the
// `timelinePaging.test.ts` harness), because the join is the whole change and a mocked
// `getAllAsync` would pass over any SQL at all.
//
// No row on the real record has this shape (every live dose names its item, 94 of 94 on
// 2026-09-24), so each fixture is built for its case (C-35).

jest.mock('expo-file-system', () => ({ File: class {} }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

let mockRaw: InstanceType<typeof DatabaseSync>;

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: () => ({
    getAllAsync: async (sql: string, params: unknown[] = []) =>
      mockRaw.prepare(sql).all(...(params as never[])),
    getFirstAsync: async (sql: string, params: unknown[] = []) =>
      mockRaw.prepare(sql).get(...(params as never[])) ?? null,
    runAsync: async (sql: string, params: unknown[] = []) =>
      mockRaw.prepare(sql).run(...(params as never[])),
  }),
}));

import { getEventById, getTimeline } from './db';
import { BASE_SCHEMA_SQL, applyColumnUpgrades } from './localSchema';
import { MEDICATION_SCHEMA_SQL } from './medications';

const CAT = 'pet-cat';
const DOG = 'pet-dog';

beforeEach(async () => {
  mockRaw = new DatabaseSync(':memory:');
  mockRaw.exec(BASE_SCHEMA_SQL);
  mockRaw.exec(MEDICATION_SCHEMA_SQL);
  await applyColumnUpgrades(async (sql: string) => {
    try { mockRaw.exec(sql); } catch { /* per-table upgrade */ }
  });
});

function insertEvent(id: string, petId: string, eventType: string, occurredAt: string) {
  mockRaw.prepare(
    `INSERT INTO events (id, pet_id, event_type, occurred_at, occurred_at_confidence,
                         source, created_at, updated_at, deleted_at, synced)
     VALUES (?, ?, ?, ?, 'witnessed', 'manual', ?, ?, NULL, 1)`,
  ).run(id, petId, eventType, occurredAt, occurredAt, occurredAt);
}

function insertCourse(id: string, petId: string, drugName: string, itemId: string | null = null) {
  mockRaw.prepare(
    `INSERT INTO medications (id, pet_id, medication_item_id, drug_name, started_at, status)
     VALUES (?, ?, ?, ?, '2026-09-01T00:00:00.000Z', 'active')`,
  ).run(id, petId, itemId, drugName);
}

function insertItem(id: string, generic: string, brand: string | null) {
  mockRaw.prepare(
    'INSERT INTO medication_items_cache (id, generic_name, brand_name) VALUES (?, ?, ?)',
  ).run(id, generic, brand);
}

function insertDose(
  eventId: string,
  petId: string,
  over: { courseId?: string | null; itemId?: string | null; adherence?: string | null } = {},
) {
  mockRaw.prepare(
    `INSERT INTO medication_administrations (id, event_id, pet_id, medication_id, medication_item_id, adherence)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(`ma-${eventId}`, eventId, petId, over.courseId ?? null, over.itemId ?? null, over.adherence ?? null);
}

const AT = '2026-09-21T12:02:00.000Z';

async function onlyRow(petId = CAT) {
  const rows = await getTimeline(petId, 10, 0, null, null);
  expect(rows).toHaveLength(1);
  return rows[0];
}

describe('the timeline names a dose by its course when it has no item (CUL-1124)', () => {
  it('a dose of a course typed in by hand carries the course\'s name', async () => {
    insertCourse('rx-1', CAT, 'Metronidazole');
    insertEvent('dose-1', CAT, 'medication', AT);
    insertDose('dose-1', CAT, { courseId: 'rx-1', adherence: 'refused' });

    const row = await onlyRow();
    expect(row.regimen_drug_name).toBe('Metronidazole');
    expect(row.drug_generic_name).toBeNull();
    expect(row.adherence).toBe('refused');
  });

  it('a dose with an item and a course carries both, and the item\'s name is untouched', async () => {
    insertItem('item-1', 'Cetirizine HCl', 'Zyrtec');
    insertCourse('rx-1', CAT, 'Cetirizine', 'item-1');
    insertEvent('dose-1', CAT, 'medication', AT);
    insertDose('dose-1', CAT, { courseId: 'rx-1', itemId: 'item-1', adherence: 'given' });

    const row = await onlyRow();
    expect(row.drug_generic_name).toBe('Cetirizine HCl');
    expect(row.drug_brand_name).toBe('Zyrtec');
    expect(row.regimen_drug_name).toBe('Cetirizine');
  });

  it('an ended course still names its doses: the name is the record\'s, not the status\'s', async () => {
    insertCourse('rx-1', CAT, 'Metronidazole');
    mockRaw.prepare(`UPDATE medications SET status = 'completed', ended_at = ? WHERE id = 'rx-1'`).run(AT);
    insertEvent('dose-1', CAT, 'medication', AT);
    insertDose('dose-1', CAT, { courseId: 'rx-1' });

    expect((await onlyRow()).regimen_drug_name).toBe('Metronidazole');
  });

  it('a course that has not reached this device names nothing, and the row still comes back', async () => {
    insertEvent('dose-1', CAT, 'medication', AT);
    insertDose('dose-1', CAT, { courseId: 'rx-not-here', adherence: 'missed' });

    const row = await onlyRow();
    expect(row.regimen_drug_name).toBeNull();
    expect(row.adherence).toBe('missed');
  });

  it('never borrows a name from another pet\'s course', async () => {
    // A cross-pet link the server does not forbid (there is no same-pet trigger on a
    // dose's course, unlike its vehicle's), so the read refuses it itself: a dose with no
    // name reads "Medication", which is true; the dog's drug on the cat's dose is not.
    insertCourse('rx-dog', DOG, 'Carprofen');
    insertEvent('dose-1', CAT, 'medication', AT);
    insertDose('dose-1', CAT, { courseId: 'rx-dog', adherence: 'given' });

    expect((await onlyRow()).regimen_drug_name).toBeNull();
  });

  it('a row that is not a dose carries no course name', async () => {
    insertCourse('rx-1', CAT, 'Metronidazole');
    insertEvent('meal-1', CAT, 'meal', AT);

    expect((await onlyRow()).regimen_drug_name).toBeNull();
  });

  it('the join adds a column, never a row: one course, many doses, one row each', async () => {
    insertCourse('rx-1', CAT, 'Metronidazole');
    for (let i = 0; i < 4; i += 1) {
      const at = new Date(Date.UTC(2026, 8, 21, 8 + i)).toISOString();
      insertEvent(`dose-${i}`, CAT, 'medication', at);
      insertDose(`dose-${i}`, CAT, { courseId: 'rx-1', adherence: 'given' });
    }

    const rows = await getTimeline(CAT, 10, 0, null, null);
    expect(rows.map((r) => r.id)).toEqual(['dose-3', 'dose-2', 'dose-1', 'dose-0']);
    expect(new Set(rows.map((r) => r.regimen_drug_name))).toEqual(new Set(['Metronidazole']));
  });

  it('the record read carries the same name as the list, from the same join', async () => {
    insertCourse('rx-1', CAT, 'Metronidazole');
    insertEvent('dose-1', CAT, 'medication', AT);
    insertDose('dose-1', CAT, { courseId: 'rx-1' });

    const record = await getEventById('dose-1');
    expect(record?.regimen_drug_name).toBe('Metronidazole');
  });

  // Its own case because the two queries carry their own copy of the join: the
  // adversarial pass deleted this read's pet condition and every test stayed green.
  it('the record read never borrows a name from another pet\'s course either', async () => {
    insertCourse('rx-dog', DOG, 'Carprofen');
    insertEvent('dose-1', CAT, 'medication', AT);
    insertDose('dose-1', CAT, { courseId: 'rx-dog', adherence: 'given' });

    const record = await getEventById('dose-1');
    expect(record?.id).toBe('dose-1');
    expect(record?.regimen_drug_name).toBeNull();
  });
});
