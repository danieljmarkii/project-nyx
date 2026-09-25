// The read's copy on the phone (History v2 §5.3, HV-5 / CUL-1162), on a REAL SQLite
// engine built from the production DDL (`BASE_SCHEMA_SQL`), because every promise this
// module makes lives in SQL: the four-column table, the upsert whose WHERE decides last
// write wins on parsed instants (C-40), and the pull whose watermark only moves when a
// count proves it complete (C-42). A mocked database would pass all of them over a typo.
// The pull's own promise, that no row it misses can sort behind the watermark, is driven
// against a table that CHANGES between pages (the reviews on #912).
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
  runAsync: async (sql: string, params: unknown[] = []) => ({
    changes: Number((mockDb.prepare(sql).run(...params) as { changes: number | bigint }).changes),
  }),
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
// It honours the calls a pull can make (select with an exact head count, gte, gt, eq,
// the keyset `or`, order, limit, range, maybeSingle), compares instants to the
// MICROSECOND as Postgres does (a JS Date stops at the millisecond), PROJECTS each row
// onto the columns asked for, and can cap a page below the size asked (the server's
// `max-rows`), fail a call, hold a page until a test releases it, change the table
// between pages, or ignore the cursor. It still speaks offsets (`range`) on purpose: the
// offset pull this module replaced can be run against these tests, and fails them.
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
  gt: [string, string][];
  eq: string | null;
  or: string | null;
  order: string[];
  limit: number | null;
  range: [number, number] | null;
}
let mockServer: ServerRow[] = [];
let mockMaxRows = Number.POSITIVE_INFINITY;
let mockFail: (q: Query) => string | null = () => null;
let mockHold: ((q: Query) => Promise<void> | null) | null = null;
/** Runs before the Nth list request (1-based) is answered: the table changing between
 *  pages, while the app sat suspended or another device wrote. */
let mockBeforePage: ((n: number) => void) | null = null;
/** The Nth list request answers `[]` with no error, however many rows remain: the
 *  "data:[] under load" answer `reconcileDeletedMeals` documents. */
let mockEmptyPage: number | null = null;
/** A server that drops the keyset filter and answers from the top again. */
let mockIgnoreCursor = false;
let mockPagesServed = 0;
const mockQueries: Query[] = [];

/** A list read: what the pull pages through (not the count, not a read by id). */
const isPage = (q: Query) => !q.head && q.eq === null;

/** An instant in microseconds since the epoch: exact in a double until the year 2255. */
function mockMicros(ts: string): number {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(ts);
  if (!m) throw new Error(`fake PostgREST: not a timestamptz: ${ts}`);
  return Date.parse(`${m[1]}${m[3]}`) * 1000 + Number((m[2] ?? '').padEnd(6, '0'));
}
const KEYSET = /^updated_at\.gt\.([^,()]+),and\(updated_at\.eq\.([^,()]+),event_id\.gt\.([^,()]+)\)$/;
function mockAfterCursor(filter: string): (r: ServerRow) => boolean {
  const m = KEYSET.exec(filter);
  if (!m || m[1] !== m[2]) throw new Error(`fake PostgREST: unexpected or() filter: ${filter}`);
  const at = mockMicros(m[1]);
  const id = m[3];
  return (r) => mockMicros(r.updated_at) > at || (mockMicros(r.updated_at) === at && r.event_id > id);
}
function mockCompare(a: ServerRow, b: ServerRow, order: string[]): number {
  for (const col of order) {
    const c =
      col === 'updated_at'
        ? mockMicros(a.updated_at) - mockMicros(b.updated_at)
        : a.event_id < b.event_id
          ? -1
          : a.event_id > b.event_id
            ? 1
            : 0;
    if (c !== 0) return c;
  }
  return 0;
}

function mockAnswer(q: Query, pageNo: number | null): { data: unknown; error: { message: string } | null; count?: number | null } {
  const failure = mockFail(q);
  if (failure) return { data: null, error: { message: failure }, count: null };
  let rows = mockServer.filter((r) => (q.gte ? mockMicros(r.updated_at) >= mockMicros(q.gte) : true));
  for (const [col, v] of q.gt) {
    rows = rows.filter((r) => (col === 'updated_at' ? mockMicros(r.updated_at) > mockMicros(v) : r.event_id > v));
  }
  if (q.eq) rows = rows.filter((r) => r.event_id === q.eq);
  if (q.head) return { data: null, error: null, count: rows.length };
  if (pageNo !== null && pageNo === mockEmptyPage) return { data: [], error: null };
  if (q.or && !mockIgnoreCursor) rows = rows.filter(mockAfterCursor(q.or));
  rows = [...rows].sort((a, b) => mockCompare(a, b, q.order));
  if (q.range) rows = rows.slice(q.range[0], q.range[1] + 1);
  if (q.limit !== null) rows = rows.slice(0, q.limit);
  if (pageNo !== null) rows = rows.slice(0, mockMaxRows);
  const cols = q.cols.split(',').map((c) => c.trim());
  const projected = rows.map((r) => Object.fromEntries(cols.map((c) => [c, (r as unknown as Record<string, unknown>)[c]])));
  return { data: projected, error: null };
}

jest.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table !== 'event_ai_analysis') throw new Error(`unexpected table ${table}`);
      const q: Query = { cols: '', head: false, gte: null, gt: [], eq: null, or: null, order: [], limit: null, range: null };
      const run = async () => {
        const pageNo = isPage(q) ? ++mockPagesServed : null;
        if (pageNo !== null) mockBeforePage?.(pageNo);
        // Snapshot the answer when the request is MADE, then hold it if asked: the
        // interleaving test needs a page that left the server before a newer write.
        const answer = mockAnswer(q, pageNo);
        mockQueries.push({ ...q, gt: [...q.gt], order: [...q.order] });
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
        gt: (c: string, v: string) => (q.gt.push([c, v]), b),
        or: (f: string) => ((q.or = f), b),
        order: (c: string, opts?: { ascending?: boolean }) => {
          if (opts?.ascending === false) throw new Error('fake PostgREST: the pull never reads descending');
          q.order.push(c);
          return b;
        },
        limit: (n: number) => ((q.limit = n), b),
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
  keysetAfter,
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
  mockBeforePage = null;
  mockEmptyPage = null;
  mockIgnoreCursor = false;
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

  it('says how many rows it changed: an insert and a newer row count, a refused row does not', async () => {
    expect(await writeCopies(mockAdapter, [row('a', '2026-09-24T10:00:00+00:00', 'monitor')], never)).toBe(1);
    // Older, and the same instant spelled the other way: both refused, neither counted.
    expect(await writeCopies(mockAdapter, [row('a', '2026-09-24T09:00:00+00:00', 'worth_a_call')], never)).toBe(0);
    expect(await writeCopies(mockAdapter, [row('a', '2026-09-24T10:00:00.000Z', 'worth_a_call')], never)).toBe(0);
    expect(
      await writeCopies(mockAdapter, [row('a', '2026-09-24T11:00:00+00:00', 'worth_a_call'), row('b', '2026-09-24T11:00:00+00:00')], never),
    ).toBe(2);
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
    // Each page after the first asks from the last row RECEIVED, in one order, and the
    // pull ends on an EMPTY page, not a short one.
    const pages = mockQueries.filter(isPage);
    expect(pages.map((q) => q.or)).toEqual([
      null,
      keysetAfter({ updated_at: '2026-09-22T10:00:00+00:00', event_id: 'e2' }),
      keysetAfter({ updated_at: '2026-09-25T10:00:00+00:00', event_id: 'e5' }),
      keysetAfter({ updated_at: '2026-09-26T10:00:00+00:00', event_id: 'e6' }),
    ]);
    for (const q of pages) {
      expect(q.order).toEqual(['updated_at', 'event_id']);
      expect(q.range).toBeNull();
    }
    expect(READ_COPY_PAGE).toBeGreaterThan(3);
  });

  it('an incremental pull asks from the watermark less the commit-skew overlap, then from the cursor', async () => {
    mockServer = [row('a', '2026-09-24T10:00:00+00:00')];
    await pullReadCopies(mockAdapter, never);
    mockQueries.length = 0;
    mockServer.push(row('b', '2026-09-25T10:00:00+00:00', 'worth_a_call'));
    await pullReadCopies(mockAdapter, never);
    const floor = new Date(Date.parse('2026-09-24T10:00:00+00:00') - HYDRATE_WATERMARK_OVERLAP_MS).toISOString();
    const [count, first, ...later] = mockQueries;
    expect(count).toMatchObject({ head: true, gte: floor });
    expect(first).toMatchObject({ head: false, gte: floor, or: null });
    expect(later.length).toBeGreaterThan(0);
    for (const q of later) expect(q).toMatchObject({ gte: null, or: keysetAfter({ updated_at: '2026-09-25T10:00:00+00:00', event_id: 'b' }) });
    expect(copyOf('b')).toMatchObject({ recommendation: 'worth_a_call' });
    expect(watermark()).toBe('2026-09-25T10:00:00+00:00');
  });

  it('a tie wider than a page is read to its end before the pull moves on', async () => {
    // One instant for seven rows: a server backfill, or one transaction's rows (NOW() is
    // the transaction's start). A cursor on the instant alone would skip t4 to t7.
    const at = '2026-09-24T10:00:00.123456+00:00';
    mockServer = [
      ...['t1', 't2', 't3', 't4', 't5', 't6', 't7'].map((id) => row(id, at)),
      row('u1', '2026-09-24T11:00:00+00:00', 'worth_a_call'),
    ];
    mockMaxRows = 3;
    await pullReadCopies(mockAdapter, never);
    expect(copyRows()).toHaveLength(8);
    expect(copyOf('u1')).toMatchObject({ recommendation: 'worth_a_call' });
    expect(watermark()).toBe('2026-09-24T11:00:00+00:00');
    // The cursor inside the tie is the server's own string, microseconds and offset
    // intact: re-spelled through a JS Date it would sit before its own row.
    expect(mockQueries.filter(isPage)[1].or).toBe(keysetAfter({ updated_at: at, event_id: 't3' }));
  });

  it('a row deleted behind the cursor and one inserted ahead of it cost the pull nothing', async () => {
    // The code review's trace on #912: under the offset pull this shifted `c` out of view
    // while `f` made the count look whole, and the watermark moved past `c`.
    mockServer = ['a', 'b', 'c', 'd', 'e'].map((id, i) => row(id, `2026-09-24T10:0${i}:00+00:00`));
    mockMaxRows = 2;
    mockBeforePage = (n) => {
      if (n !== 2) return;
      mockServer = mockServer.filter((r) => r.event_id !== 'a'); // its event's cascade
      mockServer.push(row('f', '2026-09-24T10:30:00+00:00', 'worth_a_call')); // a new read lands
    };
    await pullReadCopies(mockAdapter, never);
    for (const id of ['b', 'c', 'd', 'e', 'f']) expect(copyOf(id)).toBeDefined();
    expect(watermark()).toBe('2026-09-24T10:30:00+00:00');
  });

  it('a row the pull already passed, re-read while the app sat suspended, still arrives', async () => {
    // The adversarial pass's F5: `a` is received as monitor, the app is backgrounded,
    // `a` is re-read to worth_a_call at 09:20 and `e` changes at 09:23, then the pull
    // resumes. The offset pull never came back for `a`, and the watermark it set (09:23,
    // less two minutes) put `a`'s new verdict behind every later pull too.
    mockServer = ['a', 'b', 'c', 'd', 'e'].map((id, i) => row(id, `2026-09-24T09:0${i}:00+00:00`, 'monitor'));
    mockMaxRows = 2;
    mockBeforePage = (n) => {
      if (n !== 2) return;
      mockServer = mockServer.map((r) =>
        r.event_id === 'a'
          ? row('a', '2026-09-24T09:20:00+00:00', 'worth_a_call')
          : r.event_id === 'e'
            ? row('e', '2026-09-24T09:23:00+00:00', 'monitor')
            : r,
      );
    };
    await pullReadCopies(mockAdapter, never);
    expect(copyOf('a')).toMatchObject({ recommendation: 'worth_a_call', updated_at: '2026-09-24T09:20:00+00:00' });
    expect(watermark()).toBe('2026-09-24T09:23:00+00:00');
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
      // The rows it missed all sort after its cursor, so the next pull would reach them
      // from there as well; the count still decides, and it says the pull fell short.
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

  it('a server that ignores the cursor cannot keep the pull going', async () => {
    mockServer = [row('a', '2026-09-24T10:00:00+00:00'), row('b', '2026-09-24T10:01:00+00:00')];
    mockIgnoreCursor = true;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await pullReadCopies(mockAdapter, never);
      expect(mockQueries.filter(isPage)).toHaveLength(2);
      expect(copyRows()).toHaveLength(2);
      expect(watermark()).toBeNull();
      expect(warn).toHaveBeenCalledWith('[read-copy] a page repeated rows already received; stopping the pull');
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

  it('a sign-out after the writes, before the watermark, leaves no watermark behind (FR-9)', async () => {
    // A watermark written after the wipe would outlive it, and the next account's first
    // pull would start from the previous account's place and never see its older reads.
    mockServer = [row('a', '2026-09-24T10:00:00+00:00', 'worth_a_call')];
    let signedOut = false;
    const signsOutAfterWriting = {
      getAllAsync: mockAdapter.getAllAsync,
      runAsync: async (sql: string, params: (string | number | null)[]) => {
        const result = await mockAdapter.runAsync(sql, params);
        signedOut = true;
        return result;
      },
    };
    await pullReadCopies(signsOutAfterWriting, () => signedOut);
    expect(watermark()).toBeNull();
  });

  it('nothing changed since the watermark: no page is asked for', async () => {
    mockServer = [row('a', '2026-09-24T10:00:00+00:00')];
    await pullReadCopies(mockAdapter, never);
    mockServer = [];
    mockQueries.length = 0;
    await pullReadCopies(mockAdapter, never);
    expect(mockQueries.filter(isPage)).toEqual([]);
  });
});

describe('pullReadCopyFor — a read landing on this device', () => {
  it('copies the one row, says it changed the copy, and moves no watermark', async () => {
    mockServer = [row('a', '2026-09-24T10:00:00+00:00', 'worth_a_call', 'completed')];
    await expect(pullReadCopyFor(mockAdapter, 'a', never)).resolves.toBe(1);
    expect(copyOf('a')).toMatchObject({ recommendation: 'worth_a_call' });
    expect(watermark()).toBeNull();
    // The same row again changes nothing, and says so.
    await expect(pullReadCopyFor(mockAdapter, 'a', never)).resolves.toBe(0);
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
    mockHold = (q) => (isPage(q) ? gate : null);
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
