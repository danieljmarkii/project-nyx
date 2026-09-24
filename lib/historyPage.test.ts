// History's scoped read against the REAL `getTimeline` SQL on node:sqlite (the
// `timelinePaging.test.ts` harness), for the two things only the real query can show
// (CUL-1073):
//
//   • C-40 — the SQL compares `occurred_at` as text, so a synced row (`…+00:00`) at a
//     day's exact edge is misplaced by an exact bound. The page must still place it.
//   • The month's door lands on the month's day — History's local-day scope and the
//     month's own day read (`readDayRows`), both driven for real over one table, return
//     the same rows, on a record that straddles UTC midnight and local midnight.
//
// The fixtures are built from LOCAL components (B-514), so the non-UTC CI job decides
// which side of UTC midnight each row lands on; the expected sets are the rows' local day
// keys, never a literal.

jest.mock('expo-file-system', () => ({ File: class {} }));
// monthReads reaches lib/supabase (an import-time env guard) through feedingArrangements
// and sync; nothing here makes a network call.
jest.mock('./supabase', () => ({ supabase: {} }));
jest.mock('./sync', () => ({
  syncPendingFeedingArrangements: jest.fn(),
  syncPendingEvents: jest.fn(),
  ensureEventAttachmentsSynced: jest.fn(),
}));

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
import { readDayRows } from './monthReads';
import { readHistoryPage } from './historyPage';
import { effectiveRange, PREFILTER_SLACK_MS, type DayScope } from './historyDateFilter';
import { toLocalDayKey } from './utils';

const PET = 'pet-1';
const DAY = '2026-09-16';
const local = (key: string): DayScope => ({ key, basis: 'local' });
const utc = (key: string): DayScope => ({ key, basis: 'utc' });

beforeEach(async () => {
  mockRaw = new DatabaseSync(':memory:');
  mockRaw.exec(BASE_SCHEMA_SQL);
  mockRaw.exec(MEDICATION_SCHEMA_SQL);
  await applyColumnUpgrades(async (sql: string) => {
    try { mockRaw.exec(sql); } catch { /* per-table upgrade */ }
  });
});

function insertEvent(id: string, occurredAt: string, type = 'meal') {
  mockRaw.prepare(
    `INSERT INTO events (id, pet_id, event_type, occurred_at, occurred_at_confidence,
                         source, created_at, updated_at, deleted_at, synced)
     VALUES (?, ?, ?, ?, 'witnessed', 'manual', ?, ?, NULL, 1)`,
  ).run(id, PET, type, occurredAt, occurredAt, occurredAt);
}

/** An instant as a hydrated row spells it (PostgREST's `+00:00`, no millis). */
const hydrated = (d: Date): string => d.toISOString().replace(/\.000Z$/, '+00:00');

/** Local wall-clock on DAY (B-514: from components, never a UTC literal). */
const localAt = (dayOffset: number, h: number, m = 0, s = 0) => new Date(2026, 8, 16 + dayOffset, h, m, s);

// A record straddling both midnights. Each row's local day is its truth.
const FIXTURE: { id: string; at: string }[] = [
  { id: 'midnight-synced', at: hydrated(localAt(0, 0)) },
  { id: 'midnight-local', at: localAt(0, 0).toISOString() },
  { id: 'second-before', at: hydrated(localAt(-1, 23, 59, 59)) },
  { id: 'noon', at: localAt(0, 12).toISOString() },
  { id: 'last-second-synced', at: hydrated(localAt(0, 23, 59, 59)) },
  { id: 'next-midnight-synced', at: hydrated(localAt(1, 0)) },
  // UTC midnight of DAY and of the next day: inside or outside the local day depending
  // on the zone running the suite — exactly the rows the old UTC reading misplaced.
  { id: 'utc-midnight', at: `${DAY}T00:00:00.000Z` },
  { id: 'utc-next-midnight-less-1s', at: '2026-09-16T23:59:59+00:00' },
];

const localDayOf = (iso: string) => toLocalDayKey(new Date(Date.parse(iso)));
const idsOn = (key: string) => FIXTURE.filter((r) => localDayOf(r.at) === key).map((r) => r.id).sort();
const sortedIds = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

describe('readHistoryPage — the real query, bounds parsed (C-40, CUL-1073)', () => {
  beforeEach(() => FIXTURE.forEach((r) => insertEvent(r.id, r.at)));

  it('a local day holds exactly its own rows, both spellings, at both edges', async () => {
    const { rows } = await readHistoryPage(PET, 50, 0, null, effectiveRange(null, local(DAY)));
    const expected = idsOn(DAY);
    expect(sortedIds(rows)).toEqual(expected);
    // The edges the parse decides, named so the expectation cannot be vacuous.
    expect(expected).toEqual(expect.arrayContaining(['midnight-synced', 'midnight-local', 'last-second-synced']));
    expect(expected).not.toContain('second-before');
    expect(expected).not.toContain('next-midnight-synced');
  });

  it('the exact bound through the same SQL misplaces the synced edges: the prefilter is load-bearing', async () => {
    const range = effectiveRange(null, local(DAY));
    const textBound = sortedIds(await getTimeline(PET, 50, 0, null, range.after, range.before));
    expect(textBound).not.toContain('midnight-synced'); // dropped from its own day
    expect(textBound).toContain('next-midnight-synced'); // pulled in from the next
  });

  it('the month\'s door lands on the month\'s day: History and readDayRows return the same rows', async () => {
    for (const key of [DAY, '2026-09-15', '2026-09-17']) {
      const { rows } = await readHistoryPage(PET, 50, 0, null, effectiveRange(null, local(key)));
      const month = await readDayRows(PET, key);
      expect(sortedIds(rows)).toEqual(sortedIds(month));
      expect(sortedIds(rows)).toEqual(idsOn(key));
    }
  });

  it('a UTC day is the flag-off calendar\'s day: a different set wherever local is not UTC', async () => {
    const { rows: utcRows } = await readHistoryPage(PET, 50, 0, null, effectiveRange(null, utc(DAY)));
    const utcExpected = FIXTURE.filter((r) => new Date(Date.parse(r.at)).toISOString().slice(0, 10) === DAY)
      .map((r) => r.id).sort();
    expect(sortedIds(utcRows)).toEqual(utcExpected);
    const { rows: localRows } = await readHistoryPage(PET, 50, 0, null, effectiveRange(null, local(DAY)));
    if (localAt(0, 12).getTimezoneOffset() === 0) {
      expect(sortedIds(utcRows)).toEqual(sortedIds(localRows));
    } else {
      // The non-UTC CI job: the two clocks cut the record in different places.
      expect(sortedIds(utcRows)).not.toEqual(sortedIds(localRows));
    }
  });

  it('the Today preset keeps a synced row at local midnight (the preset is parsed too)', async () => {
    const now = localAt(0, 18);
    const { rows } = await readHistoryPage(PET, 50, 0, null, effectiveRange('today', null, now));
    expect(sortedIds(rows)).toEqual(expect.arrayContaining(['midnight-synced', 'midnight-local']));
    expect(sortedIds(rows)).not.toContain('second-before');
  });
});

describe('readHistoryPage — paging counts the query, not the list', () => {
  it('a slack row is fetched and dropped, and still counts toward the page', async () => {
    const range = effectiveRange(null, local(DAY));
    const inside = new Date(Date.parse(range.before!) - 60_000);
    const slack = new Date(Date.parse(range.before!) + PREFILTER_SLACK_MS / 2);
    insertEvent('inside', inside.toISOString());
    insertEvent('slack', slack.toISOString());

    const { rows, fetched } = await readHistoryPage(PET, 50, 0, null, range);
    expect(sortedIds(rows)).toEqual(['inside']);
    // OFFSET is a position in the query's order: the dropped row took a place there.
    expect(fetched).toBe(2);
  });

  it('pages of the query partition the day: nothing twice, nothing lost', async () => {
    for (let i = 0; i < 7; i++) insertEvent(`m${i}`, localAt(0, 8 + i).toISOString());
    insertEvent('slack-before', new Date(localAt(0, 0).getTime() - 30_000).toISOString());
    const range = effectiveRange(null, local(DAY));
    const seen: string[] = [];
    let offset = 0;
    for (;;) {
      const { rows, fetched } = await readHistoryPage(PET, 3, offset, null, range);
      seen.push(...rows.map((r) => r.id));
      offset += fetched;
      if (fetched < 3) break;
    }
    expect(seen.sort()).toEqual(['m0', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6']);
  });
});
