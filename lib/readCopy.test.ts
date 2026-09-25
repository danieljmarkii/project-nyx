// The read's copy on the phone (History v2 §5.3, HV-5 / CUL-1162), on a REAL SQLite
// engine built from the production DDL (`BASE_SCHEMA_SQL`), because every promise this
// module makes lives in SQL: the four-column table, the upsert whose WHERE decides last
// write wins on parsed instants (C-40), and the pull whose watermark only moves when a
// count proves it complete (C-42). A mocked database would pass all of them over a typo.
// node:sqlite, require()'d to stay off the babel/jest-expo path (the monthReads
// precedent).

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

interface Db {
  exec(sql: string): void;
  prepare(sql: string): {
    all(...a: unknown[]): Record<string, unknown>[];
    get(...a: unknown[]): Record<string, unknown> | undefined;
    run(...a: unknown[]): unknown;
  };
}

let mockDb: Db;
const mockAdapter = {
  getAllAsync: async <T,>(sql: string, params: unknown[] = []) => mockDb.prepare(sql).all(...params) as T[],
  getFirstAsync: async <T,>(sql: string, params: unknown[] = []) => (mockDb.prepare(sql).get(...params) ?? null) as T | null,
  runAsync: async (sql: string, params: unknown[] = []) => mockDb.prepare(sql).run(...params),
};
jest.mock('./db', () => ({
  getDb: () => mockAdapter,
  // The two watermark helpers, over the same table the production pair writes. Re-typed
  // because `lib/db.ts` imports expo-sqlite, which jest cannot load; neither is under test.
  getWatermark: async (table: string) =>
    (mockDb.prepare('SELECT watermark FROM sync_watermarks WHERE table_name = ?').get(table) as { watermark: string } | undefined)
      ?.watermark ?? null,
  setWatermark: async (table: string, value: string) => {
    mockDb
      .prepare(
        `INSERT INTO sync_watermarks (table_name, watermark) VALUES (?, ?)
         ON CONFLICT(table_name) DO UPDATE SET watermark = excluded.watermark`,
      )
      .run(table, value);
  },
}));

// ── A fake PostgREST over `event_ai_analysis` ─────────────────────────────────
// It honours exactly the calls the module makes (select with an exact head count, gte,
// order, range, eq, maybeSingle), PROJECTS each row onto the columns asked for, and can
// cap a page below the size asked (the server's `max-rows`), fail a call, or hold a page
// until a test releases it.
interface ServerRow {
  event_id: string;
  status: string;
  recommendation: string | null;
  updated_at: string;
  read_text?: string | null;
  dismissed_at?: string | null;
}
interface Query {
  cols: string;
  head: boolean;
  gte: string | null;
  eq: string | null;
  range: [number, number] | null;
}
let mockServer: ServerRow[] = [];
let mockMaxRows = Number.POSITIVE_INFINITY;
let mockFail: (q: Query) => string | null = () => null;
let mockHold: ((q: Query) => Promise<void> | null) | null = null;
/** The Nth paged request (1-based) answers `[]` with no error, however many rows remain:
 *  the "data:[] under load" answer `reconcileDeletedMeals` documents. */
let mockEmptyPage: number | null = null;
let mockPagesServed = 0;
const mockQueries: Query[] = [];

function mockAnswer(q: Query): { data: unknown; error: { message: string } | null; count?: number | null } {
  const failure = mockFail(q);
  if (failure) return { data: null, error: { message: failure }, count: null };
  let rows = mockServer.filter((r) => (q.gte ? Date.parse(r.updated_at) >= Date.parse(q.gte) : true));
  if (q.eq) rows = rows.filter((r) => r.event_id === q.eq);
  if (q.head) return { data: null, error: null, count: rows.length };
  if (q.range && ++mockPagesServed === mockEmptyPage) return { data: [], error: null };
  rows = [...rows].sort((a, b) => (a.event_id < b.event_id ? -1 : a.event_id > b.event_id ? 1 : 0));
  if (q.range) rows = rows.slice(q.range[0], q.range[1] + 1).slice(0, mockMaxRows);
  const cols = q.cols.split(',').map((c) => c.trim());
  const projected = rows.map((r) => Object.fromEntries(cols.map((c) => [c, (r as unknown as Record<string, unknown>)[c]])));
  return { data: projected, error: null };
}

jest.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table !== 'event_ai_analysis') throw new Error(`unexpected table ${table}`);
      const q: Query = { cols: '', head: false, gte: null, eq: null, range: null };
      const run = async () => {
        // Snapshot the answer when the request is MADE, then hold it if asked: the
        // interleaving test needs a page that left the server before a newer write.
        const answer = mockAnswer(q);
        mockQueries.push({ ...q });
        const held = mockHold?.(q);
        if (held) await held;
        return answer;
      };
      const b: Record<string, unknown> = {
        select: (cols: string, opts?: { count?: string; head?: boolean }) => {
          q.cols = cols;
          q.head = !!opts?.head && opts?.count === 'exact';
          return b;
        },
        gte: (_c: string, v: string) => ((q.gte = v), b),
        order: () => b,
        range: (f: number, t: number) => ((q.range = [f, t]), b),
        eq: (_c: string, v: string) => ((q.eq = v), b),
        maybeSingle: async () => {
          const res = await run();
          const data = Array.isArray(res.data) ? (res.data[0] ?? null) : null;
          return { data: res.error ? null : data, error: res.error };
        },
        then: (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) => run().then(onOk, onErr),
      };
      return b;
    },
  },
}));

import { BASE_SCHEMA_SQL } from './localSchema';
import { HYDRATE_WATERMARK_OVERLAP_MS } from './hydration';
import {
  READ_COPY_COLUMNS,
  READ_COPY_PAGE,
  pullReadCopies,
  pullReadCopyFor,
  readCopies,
  writeCopies,
} from './readCopy';

const never = () => false;

function copyRows(): Record<string, unknown>[] {
  return mockDb.prepare('SELECT event_id, status, recommendation, updated_at FROM event_ai_verdicts ORDER BY event_id').all();
}
function copyOf(id: string): Record<string, unknown> | undefined {
  return mockDb.prepare('SELECT event_id, status, recommendation, updated_at FROM event_ai_verdicts WHERE event_id = ?').get(id);
}
function watermark(): string | null {
  return (
    (mockDb.prepare("SELECT watermark FROM sync_watermarks WHERE table_name = 'event_ai_verdicts'").get() as
      | { watermark: string }
      | undefined)?.watermark ?? null
  );
}
const row = (event_id: string, updated_at: string, recommendation: string | null = 'monitor', status = 'completed'): ServerRow => ({
  event_id,
  status,
  recommendation,
  updated_at,
  // What the server row also holds, and the copy must never take.
  read_text: 'Streaks of red in tonight’s photo are worth a call.',
  dismissed_at: '2026-09-20T08:00:00+00:00',
});

beforeEach(() => {
  mockDb = new DatabaseSync(':memory:') as Db;
  mockDb.exec(BASE_SCHEMA_SQL);
  mockServer = [];
  mockMaxRows = Number.POSITIVE_INFINITY;
  mockFail = () => null;
  mockHold = null;
  mockEmptyPage = null;
  mockPagesServed = 0;
  mockQueries.length = 0;
});

describe('what the phone keeps: four columns, never the words, never the hide', () => {
  it('the real DDL builds exactly the four columns', () => {
    const cols = (mockDb.prepare('PRAGMA table_info(event_ai_verdicts)').all() as { name: string }[]).map((c) => c.name);
    expect(cols).toEqual(['event_id', 'status', 'recommendation', 'updated_at']);
  });

  it('the module asks the server for exactly those four, in every request it makes', async () => {
    expect(READ_COPY_COLUMNS.split(',').map((c) => c.trim())).toEqual(['event_id', 'status', 'recommendation', 'updated_at']);
    mockServer = [row('a', '2026-09-24T10:00:00+00:00')];
    await pullReadCopies(mockAdapter, never);
    await pullReadCopyFor(mockAdapter, 'a', never);
    const rowReads = mockQueries.filter((q) => !q.head);
    expect(rowReads.length).toBeGreaterThanOrEqual(2);
    for (const q of rowReads) expect(q.cols).toBe(READ_COPY_COLUMNS);
    // The count asks for the key alone.
    for (const q of mockQueries.filter((x) => x.head)) expect(q.cols).toBe('event_id');
  });

  it('a server row carrying the words and the hide lands as the four columns only', async () => {
    mockServer = [row('a', '2026-09-24T10:00:00+00:00', 'worth_a_call')];
    await pullReadCopies(mockAdapter, never);
    expect(copyRows()).toEqual([
      { event_id: 'a', status: 'completed', recommendation: 'worth_a_call', updated_at: '2026-09-24T10:00:00+00:00' },
    ]);
  });
});

describe('readCopies — local only', () => {
  it('returns the rows asked for, by id; an id with no row is absent', async () => {
    await writeCopies(mockAdapter, [row('a', '2026-09-24T10:00:00+00:00', 'worth_a_call'), row('b', '2026-09-24T10:00:00+00:00')], never);
    const got = await readCopies(['a', 'missing']);
    expect([...got.keys()]).toEqual(['a']);
    expect(got.get('a')).toMatchObject({ status: 'completed', recommendation: 'worth_a_call' });
  });

  it('reads past SQLite’s parameter budget in chunks, and asks nothing for nothing', async () => {
    const ids = Array.from({ length: 950 }, (_, i) => `e${String(i).padStart(4, '0')}`);
    await writeCopies(mockAdapter, ids.map((id) => row(id, '2026-09-24T10:00:00+00:00')), never);
    expect((await readCopies(ids)).size).toBe(950);
    expect((await readCopies([])).size).toBe(0);
  });
});

describe('writeCopies — the one statement, last write wins on parsed instants (C-40)', () => {
  it('inserts a row the copy does not hold', async () => {
    await writeCopies(mockAdapter, [row('a', '2026-09-24T10:00:00+00:00', 'worth_a_call')], never);
    expect(copyOf('a')).toMatchObject({ recommendation: 'worth_a_call' });
  });

  it('a strictly newer row replaces, across the two spellings of an instant', async () => {
    await writeCopies(mockAdapter, [row('a', '2026-09-24T10:00:00.000Z', 'monitor')], never);
    await writeCopies(mockAdapter, [row('a', '2026-09-24T10:00:01+00:00', 'worth_a_call')], never);
    expect(copyOf('a')).toMatchObject({ recommendation: 'worth_a_call', updated_at: '2026-09-24T10:00:01+00:00' });
  });

  it('an older row never replaces a newer one', async () => {
    await writeCopies(mockAdapter, [row('a', '2026-09-24T10:00:00+00:00', 'worth_a_call')], never);
    await writeCopies(mockAdapter, [row('a', '2026-09-24T09:59:59.999999+00:00', 'monitor', 'failed')], never);
    expect(copyOf('a')).toMatchObject({ recommendation: 'worth_a_call', status: 'completed' });
  });

  it('the same instant spelled the other way is a no-op, where a text compare would rewrite', async () => {
    // As TEXT, '…00.000Z' sorts after '…00+00:00' ('.' 0x2E after '+' 0x2B), so a lexical
    // `>` would call the incoming row newer and replace a row with itself-but-different.
    await writeCopies(mockAdapter, [row('a', '2026-09-24T10:00:00+00:00', 'worth_a_call')], never);
    await writeCopies(mockAdapter, [row('a', '2026-09-24T10:00:00.000Z', 'monitor')], never);
    expect(copyOf('a')).toMatchObject({ recommendation: 'worth_a_call' });
  });

  it('decides by instant where the text order says the opposite', async () => {
    // 12:00+02:00 is 10:00Z; 11:00Z is an hour LATER, though it sorts earlier as text.
    await writeCopies(mockAdapter, [row('a', '2026-09-24T12:00:00+02:00', 'monitor')], never);
    await writeCopies(mockAdapter, [row('a', '2026-09-24T11:00:00Z', 'worth_a_call')], never);
    expect(copyOf('a')).toMatchObject({ recommendation: 'worth_a_call' });
  });

  it('an undated incoming row never replaces; an undated stored row is replaced by a dated one', async () => {
    await writeCopies(mockAdapter, [row('a', '2026-09-24T10:00:00+00:00', 'worth_a_call')], never);
    await writeCopies(mockAdapter, [row('a', 'not-a-date', 'monitor')], never);
    expect(copyOf('a')).toMatchObject({ recommendation: 'worth_a_call' });
    mockDb.prepare("UPDATE event_ai_verdicts SET updated_at = 'garbage' WHERE event_id = 'a'").run();
    await writeCopies(mockAdapter, [row('a', '2026-09-24T09:00:00+00:00', 'monitor')], never);
    expect(copyOf('a')).toMatchObject({ recommendation: 'monitor' });
  });

  it('checks the sign-out epoch before EVERY row, not once before the loop (FR-9)', async () => {
    let calls = 0;
    const staleAfterFirst = () => calls++ >= 1;
    await writeCopies(mockAdapter, [row('a', '2026-09-24T10:00:00+00:00'), row('b', '2026-09-24T10:00:00+00:00')], staleAfterFirst);
    expect(copyRows().map((r) => r.event_id)).toEqual(['a']);
  });

  it('skips a row it cannot key and writes the rest', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await writeCopies(
        mockAdapter,
        [{ status: 'completed', recommendation: 'worth_a_call', updated_at: '2026-09-24T10:00:00+00:00' }, row('b', '2026-09-24T10:00:00+00:00')],
        never,
      );
      expect(copyRows().map((r) => r.event_id)).toEqual(['b']);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

describe('pullReadCopies — the hydrate step', () => {
  it('a cold start pulls every row through pages a server cap makes short, and sets the watermark', async () => {
    mockServer = Array.from({ length: 7 }, (_, i) => row(`e${i}`, `2026-09-2${i}T10:00:00+00:00`));
    mockMaxRows = 3; // every page comes back short of READ_COPY_PAGE while rows remain
    await pullReadCopies(mockAdapter, never);
    expect(copyRows()).toHaveLength(7);
    expect(watermark()).toBe('2026-09-26T10:00:00+00:00');
    // Advanced by rows RECEIVED (0, 3, 6, 7), and ended on an EMPTY page, not a short one.
    expect(mockQueries.filter((q) => !q.head).map((q) => q.range?.[0])).toEqual([0, 3, 6, 7]);
    expect(READ_COPY_PAGE).toBeGreaterThan(3);
  });

  it('an incremental pull asks from the watermark less the commit-skew overlap', async () => {
    mockServer = [row('a', '2026-09-24T10:00:00+00:00')];
    await pullReadCopies(mockAdapter, never);
    mockQueries.length = 0;
    mockServer.push(row('b', '2026-09-25T10:00:00+00:00', 'worth_a_call'));
    await pullReadCopies(mockAdapter, never);
    const floor = new Date(Date.parse('2026-09-24T10:00:00+00:00') - HYDRATE_WATERMARK_OVERLAP_MS).toISOString();
    expect(mockQueries.every((q) => q.gte === floor)).toBe(true);
    expect(copyOf('b')).toMatchObject({ recommendation: 'worth_a_call' });
    expect(watermark()).toBe('2026-09-25T10:00:00+00:00');
  });

  it('a pull the count cannot vouch for writes what it has and HOLDS the watermark', async () => {
    mockServer = Array.from({ length: 5 }, (_, i) => row(`e${i}`, `2026-09-2${i}T10:00:00+00:00`));
    mockMaxRows = 2;
    // The second page comes back empty with rows remaining: a spurious end.
    mockEmptyPage = 2;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await pullReadCopies(mockAdapter, never);
      expect(copyRows()).toHaveLength(2);
      // Advancing to the newest row SEEN would skip the three never received: ordered on
      // the immutable key, the first page is not the oldest-changed one.
      expect(watermark()).toBeNull();
      expect(warn).toHaveBeenCalledWith('[read-copy] pull incomplete, holding the watermark for the next cycle');
      // The next cycle, answered in full, completes and advances.
      mockEmptyPage = null;
      await pullReadCopies(mockAdapter, never);
      expect(copyRows()).toHaveLength(5);
      expect(watermark()).toBe('2026-09-24T10:00:00+00:00');
    } finally {
      warn.mockRestore();
    }
  });

  it('a failed count or a failed page writes nothing and moves nothing', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      mockServer = [row('a', '2026-09-24T10:00:00+00:00', 'worth_a_call')];
      mockFail = (q) => (q.head ? 'count timed out' : null);
      await pullReadCopies(mockAdapter, never);
      expect(copyRows()).toEqual([]);
      mockFail = (q) => (q.head ? null : 'page failed');
      await pullReadCopies(mockAdapter, never);
      expect(copyRows()).toEqual([]);
      expect(watermark()).toBeNull();
    } finally {
      warn.mockRestore();
    }
  });

  it('a sign-out during the fetch writes nothing and moves nothing (FR-9)', async () => {
    mockServer = [row('a', '2026-09-24T10:00:00+00:00', 'worth_a_call')];
    let signedOut = false;
    mockHold = (q) => (q.head ? null : Promise.resolve().then(() => void (signedOut = true)));
    await pullReadCopies(mockAdapter, () => signedOut);
    expect(copyRows()).toEqual([]);
    expect(watermark()).toBeNull();
  });

  it('nothing changed since the watermark: no page is asked for', async () => {
    mockServer = [row('a', '2026-09-24T10:00:00+00:00')];
    await pullReadCopies(mockAdapter, never);
    mockServer = [];
    mockQueries.length = 0;
    await pullReadCopies(mockAdapter, never);
    expect(mockQueries.filter((q) => !q.head)).toEqual([]);
  });
});

describe('pullReadCopyFor — a read landing on this device', () => {
  it('copies the one row, and moves no watermark', async () => {
    mockServer = [row('a', '2026-09-24T10:00:00+00:00', 'worth_a_call', 'completed')];
    await pullReadCopyFor(mockAdapter, 'a', never);
    expect(copyOf('a')).toMatchObject({ recommendation: 'worth_a_call' });
    expect(watermark()).toBeNull();
  });

  it('writes nothing when the server errs, holds no row, or the account signed out', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      mockServer = [row('a', '2026-09-24T10:00:00+00:00', 'worth_a_call')];
      mockFail = () => 'network';
      await pullReadCopyFor(mockAdapter, 'a', never);
      mockFail = () => null;
      await pullReadCopyFor(mockAdapter, 'nothing-here', never);
      await pullReadCopyFor(mockAdapter, 'a', () => true);
      expect(copyRows()).toEqual([]);
    } finally {
      warn.mockRestore();
    }
  });

  it('a landing and a sync pull interleave, and the newer verdict survives either order', async () => {
    // The pull's page leaves the server holding the OLD verdict, and is held in flight.
    mockServer = [row('a', '2026-09-24T10:00:00+00:00', 'monitor')];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    mockHold = (q) => (!q.head && q.range ? gate : null);
    const pulling = pullReadCopies(mockAdapter, never);
    await new Promise((r) => setTimeout(r, 0));
    // Meanwhile the re-read lands: a newer escalation, copied at once.
    mockHold = null;
    mockServer = [row('a', '2026-09-24T10:05:00+00:00', 'worth_a_call')];
    await pullReadCopyFor(mockAdapter, 'a', never);
    // Now the stale page arrives and is written. It must lose.
    release();
    await pulling;
    expect(copyOf('a')).toMatchObject({ recommendation: 'worth_a_call', updated_at: '2026-09-24T10:05:00+00:00' });
  });
});
