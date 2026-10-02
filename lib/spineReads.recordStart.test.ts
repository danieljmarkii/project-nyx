// Real-SQLite coverage for `readRecordStart` (CUL-1221): where the coverage door's window
// opens. Run against the PRODUCTION DDL (the spineReads.feedings.test.ts harness), because
// the three facts it must get right — soft deletes, other pets, and the look — are the
// kind a hand-made schema gets wrong silently.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

interface Db {
  exec(sql: string): void;
  prepare(sql: string): {
    all(...a: unknown[]): Record<string, unknown>[];
    run(...a: unknown[]): unknown;
  };
}

let mockDb: Db;
jest.mock('./db', () => ({
  getDb: () => ({
    getAllAsync: async (sql: string, params: unknown[] = []) => mockDb.prepare(sql).all(...params),
  }),
}));
jest.mock('./supabase', () => ({ supabase: { from: jest.fn() } }));

import { BASE_SCHEMA_SQL, COLUMN_UPGRADES } from './localSchema';
import { eventTintCategory } from './dayEvents';
import { readRecordStart, RECORD_START_EXCLUDED_TYPE } from './spineReads';

const PET = 'pet-1';

function ev(id: string, type: string, occurredAt: string, opts: { pet?: string; deleted?: boolean } = {}) {
  mockDb
    .prepare(
      `INSERT INTO events (id, pet_id, event_type, occurred_at, occurred_at_confidence, source, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, 'witnessed', 'app', ?, ?, ?)`,
    )
    .run(id, opts.pet ?? PET, type, occurredAt, occurredAt, occurredAt, opts.deleted ? occurredAt : null);
}

beforeEach(() => {
  mockDb = new DatabaseSync(':memory:') as Db;
  mockDb.exec(BASE_SCHEMA_SQL);
  // The columns a device gains by upgrade: the list `initDb` applies.
  for (const c of COLUMN_UPGRADES) {
    const cols = mockDb.prepare(`PRAGMA table_info(${c.table})`).all() as { name: string }[];
    if (cols.length === 0 || cols.some((col) => col.name === c.column)) continue;
    mockDb.exec(`ALTER TABLE ${c.table} ADD COLUMN ${c.column} ${c.type}`);
  }
});

describe('readRecordStart', () => {
  it('is the earliest surviving non-look event of THIS pet, over the whole record', async () => {
    ev('look', 'check_in', '2026-05-01T08:00:00.000Z'); // a look is not where a record begins
    ev('gone', 'meal', '2026-05-02T08:00:00.000Z', { deleted: true }); // soft-deleted
    ev('other', 'meal', '2026-05-03T08:00:00.000Z', { pet: 'pet-2' }); // another pet
    ev('first', 'vomit', '2026-06-10T08:00:00+00:00'); // PostgREST's spelling
    ev('later', 'meal', '2026-09-20T08:00:00.000Z');
    expect(await readRecordStart(PET)).toBe('2026-06-10T08:00:00+00:00');
  });

  it('orders a mix of the two ISO spellings by instant across seconds (C-40: an order, never a bound)', async () => {
    // A text sort agrees with the instant through the seconds, so a mixed record orders
    // correctly; the one place the spellings disagree is inside one second, where the day
    // cannot differ. The day itself is decided on the parsed instant by monthCoverage.
    ev('b', 'meal', '2026-06-10T08:00:05.000Z');
    ev('a', 'meal', '2026-06-10T08:00:04+00:00');
    ev('c', 'meal', '2026-06-09T23:59:59.999Z');
    expect(await readRecordStart(PET)).toBe('2026-06-09T23:59:59.999Z');
  });

  it('the one place the spellings disagree — a tie inside one second — cannot move the day', async () => {
    // The same instant, both spellings: whichever the text sort returns, it is the same
    // instant, so the local day monthCoverage keys from it is the same.
    ev('local', 'meal', '2026-06-10T23:59:59.000Z');
    ev('hydrated', 'meal', '2026-06-10T23:59:59+00:00');
    const got = await readRecordStart(PET);
    expect(got).not.toBeNull();
    expect(Date.parse(got!)).toBe(Date.parse('2026-06-10T23:59:59Z'));
  });

  it('is null for a record of looks alone, or no record at all — the door invites', async () => {
    expect(await readRecordStart(PET)).toBeNull();
    ev('look', 'check_in', '2026-09-01T08:00:00.000Z');
    expect(await readRecordStart(PET)).toBeNull();
  });

  it('skips an unparseable instant rather than reading it as "no record"', async () => {
    ev('bad', 'meal', '0000-garbage');
    ev('good', 'meal', '2026-07-01T08:00:00.000Z');
    expect(await readRecordStart(PET)).toBe('2026-07-01T08:00:00.000Z');
  });

  it('excludes exactly the type the model calls a look (one rule, two spellings, pinned)', () => {
    expect(eventTintCategory(RECORD_START_EXCLUDED_TYPE)).toBe('look');
  });
});
