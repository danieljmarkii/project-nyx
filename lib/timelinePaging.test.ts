// History pages the timeline by OFFSET (CUL-1078), so the sort under the pages has to
// be TOTAL: `occurred_at` alone is not unique, and a wet + dry pair served at one
// minute is an ordinary record.
//
// Run against the REAL `getTimeline` SQL on node:sqlite, the `looksTimeline.test.ts`
// harness. The seam case needs the rows' physical order to change between two page
// reads, because on a fixed layout SQLite happens to return ties in the same order on
// both pages. SQL promises nothing about that order, and the layout is not ours to
// hold still (a VACUUM may renumber rowids, and a row deleted and written back takes a
// new one), so the test moves one row the plainest way and asks whether the two pages
// still partition the record.

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

import { getTimeline } from './db';
import { BASE_SCHEMA_SQL, applyColumnUpgrades } from './localSchema';
import { MEDICATION_SCHEMA_SQL } from './medications';

const PET = 'pet-1';

beforeEach(async () => {
  mockRaw = new DatabaseSync(':memory:');
  mockRaw.exec(BASE_SCHEMA_SQL);
  mockRaw.exec(MEDICATION_SCHEMA_SQL);
  await applyColumnUpgrades(async (sql: string) => {
    try { mockRaw.exec(sql); } catch { /* per-table upgrade */ }
  });
});

function insertEvent(id: string, occurredAt: string) {
  mockRaw.prepare(
    `INSERT INTO events (id, pet_id, event_type, occurred_at, occurred_at_confidence,
                         source, created_at, updated_at, deleted_at, synced)
     VALUES (?, ?, 'meal', ?, 'witnessed', 'manual', ?, ?, NULL, 1)`,
  ).run(id, PET, occurredAt, occurredAt, occurredAt);
}

/** The same row, written back: identical columns, a new place in the table. */
function rewrite(id: string, occurredAt: string) {
  mockRaw.prepare('DELETE FROM events WHERE id = ?').run(id);
  insertEvent(id, occurredAt);
}

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe('getTimeline pages on a total order (CUL-1078)', () => {
  const NEWER = '2026-09-14T20:30:00.000Z';
  const PAIR = '2026-09-14T20:00:00.000Z';

  it('a page seam through a same-instant pair returns each row once, whatever the layout', async () => {
    insertEvent('newest', NEWER);
    insertEvent('wet', PAIR);
    insertEvent('dry', PAIR);

    const page1 = await getTimeline(PET, 2, 0, null, null);
    expect(page1).toHaveLength(2);

    // The row on the far side of the seam is written back between the two reads.
    const [firstOfPair] = ids(page1).filter((id) => id !== 'newest');
    rewrite(firstOfPair, PAIR);

    const page2 = await getTimeline(PET, 2, 2, null, null);
    const seen = [...ids(page1), ...ids(page2)];
    // Pre-fix: the pair swaps places, page 2 repeats one of them and the other is
    // never returned — the dedupe on append hides the repeat, nothing shows the loss.
    expect(seen.sort()).toEqual(['dry', 'newest', 'wet']);
  });

  it('breaks the tie by id, newest-first on the key the C-42 pulls use', async () => {
    insertEvent('a-id', PAIR);
    insertEvent('b-id', PAIR);
    insertEvent('c-id', PAIR);

    expect(ids(await getTimeline(PET, 10, 0, null, null))).toEqual(['c-id', 'b-id', 'a-id']);
  });
});
