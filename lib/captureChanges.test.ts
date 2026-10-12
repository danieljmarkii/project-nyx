// FAB PR-29 (CUL-1656): the capture_changes mirror and its push, against a REAL
// database (node:sqlite over the app's own schema constants, C-35).
//
// Pinned here: the client's keys equal 091's CHECK; the local UNIQUE lets a writer
// write once per pet per change; the push calls 093's record_capture_change with
// exactly 091's writer columns (FAB PR-29d, CUL-1701), marks what landed, waits on a
// transient failure (PGRST202 before 093 is applied included), spends an attempt on a
// refusal, quarantines a 23505 (under the function it never means the fact is there),
// and marks nothing once a sign-out has moved the epoch.

import { readFileSync } from 'fs';
import { join } from 'path';

const { DatabaseSync } = require('node:sqlite');

interface RawDb {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number };
    all(...params: unknown[]): Record<string, unknown>[];
    get(...params: unknown[]): Record<string, unknown> | undefined;
  };
  close(): void;
}

let mockDb: RawDb;
jest.mock('./db', () => ({
  getDb: () => ({
    runAsync: jest.fn(async (sql: string, params: unknown[] = []) => mockDb.prepare(sql).run(...(params as never[]))),
    getAllAsync: jest.fn(async (sql: string, params: unknown[] = []) => mockDb.prepare(sql).all(...(params as never[]))),
    getFirstAsync: jest.fn(async (sql: string, params: unknown[] = []) => mockDb.prepare(sql).get(...(params as never[])) ?? null),
  }),
  getWatermark: jest.fn(),
  setWatermark: jest.fn(),
}));

// The server, at the one call the drain makes. Every call's arguments are recorded.
const mockInserts: Record<string, unknown>[] = [];
let mockAnswer: (args: Record<string, unknown>) => { data: unknown; error: unknown } = () => ({
  data: null,
  error: null,
});
let mockDuringInsert: () => void = () => undefined;
jest.mock('./supabase', () => ({
  supabase: {
    auth: { getSession: jest.fn(async () => ({ data: { session: { user: { id: 'u1' } } } })) },
    // The push never writes the table directly: a plain insert keeps the first row to
    // arrive, not the earliest date (CUL-1701).
    from: jest.fn((table: string) => {
      throw new Error(`unexpected table ${table}`);
    }),
    rpc: jest.fn(async (fn: string, args: Record<string, unknown>) => {
      if (fn !== 'record_capture_change') throw new Error(`unexpected function ${fn}`);
      mockInserts.push(args);
      mockDuringInsert();
      return mockAnswer(args);
    }),
  },
}));
jest.mock('./signal', () => ({ triggerSignalRegenDebounced: jest.fn() }));

import { BASE_SCHEMA_SQL, applyColumnUpgrades } from './localSchema';
import { CAPTURE_CHANGE_KEYS, recordCaptureChange } from './captureChanges';
import { syncPendingCaptureChanges, notifySignedOut } from './sync';
import { MAX_SYNC_ATTEMPTS } from './syncQueue';

const write = (id: string, petId: string, key = 'fab_stool_split', at = '2026-10-09T08:00:00.000Z') =>
  mockDb
    .prepare(`INSERT OR IGNORE INTO capture_changes (id, pet_id, change_key, first_seen_at) VALUES (?, ?, ?, ?)`)
    .run(id, petId, key, at);
const row = (id: string) => mockDb.prepare('SELECT * FROM capture_changes WHERE id = ?').get(id) as Record<string, unknown>;

beforeEach(async () => {
  mockDb = new DatabaseSync(':memory:');
  mockDb.exec(BASE_SCHEMA_SQL);
  await applyColumnUpgrades(async (sql: string) => mockDb.exec(sql));
  mockInserts.length = 0;
  mockAnswer = () => ({ data: null, error: null });
  mockDuringInsert = () => undefined;
});

afterEach(() => mockDb.close());

describe('CAPTURE_CHANGE_KEYS', () => {
  it('equals 091’s change_key CHECK, so no writer queues a row the server refuses', () => {
    const sql = readFileSync(join(__dirname, '..', 'supabase/migrations/091_capture_changes.sql'), 'utf8');
    const m = /change_key\s+TEXT\s+NOT NULL CHECK \(change_key IN \(([^)]*)\)\)/.exec(sql);
    expect(m).not.toBeNull();
    const checked = (m as RegExpExecArray)[1].split(',').map((x) => x.trim().replace(/'/g, ''));
    expect([...CAPTURE_CHANGE_KEYS].sort()).toEqual(checked.sort());
  });
});

describe('the local mirror', () => {
  it('keeps ONE row per pet per change, so a second write is a no-op and the first date stands', () => {
    expect(write('a', 'pet-a', 'fab_stool_split', '2026-10-09T08:00:00.000Z').changes).toBe(1);
    expect(write('b', 'pet-a', 'fab_stool_split', '2026-10-10T08:00:00.000Z').changes).toBe(0);
    expect(write('c', 'pet-b').changes).toBe(1);
    expect(mockDb.prepare('SELECT id, first_seen_at FROM capture_changes WHERE pet_id = ?').all('pet-a'))
      .toEqual([{ id: 'a', first_seen_at: '2026-10-09T08:00:00.000Z' }]);
  });
});

describe('syncPendingCaptureChanges', () => {
  it('calls record_capture_change with exactly 091’s writer columns and marks the row landed', async () => {
    write('a', 'pet-a');
    await syncPendingCaptureChanges();
    // Never created_at: the server's clock stamps it, and the function never takes it.
    expect(mockInserts).toEqual([
      { p_id: 'a', p_pet_id: 'pet-a', p_change_key: 'fab_stool_split', p_first_seen_at: '2026-10-09T08:00:00.000Z' },
    ]);
    expect(row('a').synced).toBe(1);
    await syncPendingCaptureChanges();
    expect(mockInserts).toHaveLength(1);
  });

  it('names the function 093 creates, with the parameters it declares', () => {
    const sql = readFileSync(join(__dirname, '..', 'supabase/migrations/093_capture_changes_keep_earliest.sql'), 'utf8');
    const m = /CREATE FUNCTION public\.record_capture_change\(([^)]*)\)/.exec(sql);
    expect(m).not.toBeNull();
    const params = (m as RegExpExecArray)[1].split(',').map((x) => x.trim().split(/\s+/)[0]);
    expect(params).toEqual(['p_id', 'p_pet_id', 'p_change_key', 'p_first_seen_at']);
  });

  it('never counts a 23505 as landed: under the function it is an id collision, so it quarantines (terminal)', async () => {
    write('a', 'pet-a');
    mockAnswer = () => ({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "capture_changes_pkey"' } });
    await syncPendingCaptureChanges();
    expect(row('a').synced).toBe(0);
    expect(row('a').sync_error).toMatch(/^23505/);
  });

  it('leaves the row queued, attempt unspent, on a transient failure', async () => {
    write('a', 'pet-a');
    mockAnswer = () => ({ data: null, error: { code: '', message: 'Network request failed' } });
    await syncPendingCaptureChanges();
    expect(row('a')).toMatchObject({ synced: 0, sync_attempts: 0, sync_error: null });
  });

  it('waits, attempt unspent, while 093 is not applied (PGRST202, no such function)', async () => {
    write('a', 'pet-a');
    mockAnswer = () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.record_capture_change' } });
    await syncPendingCaptureChanges();
    expect(row('a')).toMatchObject({ synced: 0, sync_attempts: 0, sync_error: null });
  });

  it('spends an attempt on a refusal, and quarantines at the cap', async () => {
    write('a', 'pet-a');
    mockAnswer = () => ({ data: null, error: { code: '42501', message: 'capture change refused: pet not owned by caller' } });
    await syncPendingCaptureChanges();
    expect(row('a')).toMatchObject({ synced: 0, sync_attempts: 1 });
    for (let i = 1; i < MAX_SYNC_ATTEMPTS; i++) await syncPendingCaptureChanges();
    expect(row('a').sync_error).not.toBeNull();
    const sent = mockInserts.length;
    await syncPendingCaptureChanges();
    expect(mockInserts).toHaveLength(sent);
  });

  it('a refusal on one row does not hold the next', async () => {
    write('a', 'pet-a');
    write('b', 'pet-b');
    mockAnswer = (args) => (args.p_id === 'a'
      ? { data: null, error: { code: '42501', message: 'capture change refused: pet not owned by caller' } }
      : { data: null, error: null });
    await syncPendingCaptureChanges();
    expect(row('a')).toMatchObject({ synced: 0, sync_attempts: 1 });
    expect(row('b').synced).toBe(1);
  });

  it('marks nothing once a sign-out lands while the request is in the air', async () => {
    write('a', 'pet-a');
    write('b', 'pet-b');
    mockDuringInsert = () => notifySignedOut();
    await syncPendingCaptureChanges();
    expect(mockInserts).toHaveLength(1);
    expect(row('a').synced).toBe(0);
    expect(row('b').synced).toBe(0);
  });
});

// FAB PR-29b (CUL-1657): the writer, against PR-29's contract on CUL-1657.
describe('recordCaptureChange', () => {
  const at = new Date('2026-10-09T15:00:00.000Z');
  const rows = () => mockDb.prepare('SELECT * FROM capture_changes ORDER BY pet_id').all() as Record<string, unknown>[];
  // The push is fire-and-forget; let it settle before reading what it sent.
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it('writes one row per pet of the account, each with its OWN id, dated the phone clock', async () => {
    expect(await recordCaptureChange('fab_stool_split', ['pet-a', 'pet-b', 'pet-c'], at)).toBe(3);
    const written = rows();
    expect(written.map((r) => r.pet_id)).toEqual(['pet-a', 'pet-b', 'pet-c']);
    // A shared id would let the push's 23505-as-landed mark a pet's row synced unsent.
    expect(new Set(written.map((r) => r.id)).size).toBe(3);
    for (const r of written) expect(r).toMatchObject({ change_key: 'fab_stool_split', first_seen_at: '2026-10-09T15:00:00.000Z' });
  });

  it('never rewrites a pet that has its row: the first date stands, and only the missing pet is written', async () => {
    await recordCaptureChange('fab_stool_split', ['pet-a'], at);
    const later = new Date('2026-10-20T09:00:00.000Z');
    expect(await recordCaptureChange('fab_stool_split', ['pet-a', 'pet-new'], later)).toBe(1);
    expect(rows().map((r) => [r.pet_id, r.first_seen_at])).toEqual([
      ['pet-a', '2026-10-09T15:00:00.000Z'],
      ['pet-new', '2026-10-20T09:00:00.000Z'],
    ]);
    expect(await recordCaptureChange('fab_stool_split', ['pet-a', 'pet-new'], later)).toBe(0);
  });

  it('writes nothing for an empty account and a pet named twice once', async () => {
    expect(await recordCaptureChange('fab_stool_split', [], at)).toBe(0);
    expect(await recordCaptureChange('fab_stool_split', ['pet-a', 'pet-a'], at)).toBe(1);
    expect(rows()).toHaveLength(1);
  });

  it('pushes what it wrote, and pushes nothing when it wrote nothing', async () => {
    await recordCaptureChange('fab_stool_split', ['pet-a', 'pet-b'], at);
    await settle();
    expect(mockInserts.map((r) => r.p_pet_id).sort()).toEqual(['pet-a', 'pet-b']);
    expect(rows().every((r) => r.synced === 1)).toBe(true);
    mockInserts.length = 0;
    await recordCaptureChange('fab_stool_split', ['pet-a', 'pet-b'], at);
    await settle();
    expect(mockInserts).toHaveLength(0);
  });
});
