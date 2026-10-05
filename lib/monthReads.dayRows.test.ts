// The month's day read (`readDayRows`) against the REAL `getTimeline` SQL on node:sqlite (the
// `timelinePaging.test.ts` harness), for the one thing only the real query can show
// (CUL-1073, C-40): the SQL compares `occurred_at` as text, so a synced row (`…+00:00`) at
// a day's exact edge is misplaced by an exact bound. The read must still place it. Its
// sibling read, v1 History's page, retired at History v2's GA (HV-14 / CUL-1175); the
// day's door now lands on History v2, whose own local-day reads are `lib/historyQueries.ts`.
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
import { effectiveRange, type DayScope } from './historyDateFilter';
import { toLocalDayKey } from './utils';

const PET = 'pet-1';
const DAY = '2026-09-16';
const local = (key: string): DayScope => ({ key, basis: 'local' });

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

describe('readDayRows — the real query, bounds parsed (C-40, CUL-1073)', () => {
  beforeEach(() => FIXTURE.forEach((r) => insertEvent(r.id, r.at)));

  it('a local day holds exactly its own rows, both spellings, at both edges', async () => {
    const expected = idsOn(DAY);
    expect(sortedIds(await readDayRows(PET, DAY))).toEqual(expected);
    // The edges the parse decides, named so the expectation cannot be vacuous.
    expect(expected).toEqual(expect.arrayContaining(['midnight-synced', 'midnight-local', 'last-second-synced']));
    expect(expected).not.toContain('second-before');
    expect(expected).not.toContain('next-midnight-synced');
  });

  it('the neighbouring days hold exactly theirs', async () => {
    for (const key of ['2026-09-15', '2026-09-17']) {
      expect(sortedIds(await readDayRows(PET, key))).toEqual(idsOn(key));
    }
  });

  it('the exact bound through the same SQL misplaces the synced edges: the prefilter is load-bearing', async () => {
    const range = effectiveRange(null, local(DAY));
    const textBound = sortedIds(await getTimeline(PET, 50, 0, null, range.after, range.before));
    expect(textBound).not.toContain('midnight-synced'); // dropped from its own day
    expect(textBound).toContain('next-midnight-synced'); // pulled in from the next
  });
});
