// FAB PR-29 (CUL-1656): the capture_changes mirror and its push, against a REAL
// database (node:sqlite over the app's own schema constants, C-35).
//
// Pinned here: the client's keys equal 091's CHECK; the local UNIQUE lets a writer
// write once per pet per change; the push sends exactly 091's granted columns, marks
// what landed, counts a 23505 as landed (our own id, or another phone's row for the
// pet), waits on a transient failure, spends an attempt on a refusal, and marks
// nothing once a sign-out has moved the epoch.

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

// The server, at the one call the drain makes. Every insert is recorded.
const mockInserts: Record<string, unknown>[] = [];
let mockAnswer: (row: Record<string, unknown>) => { data: unknown; error: unknown } = (row) => ({
  data: [{ id: row.id }],
  error: null,
});
let mockDuringInsert: () => void = () => undefined;
jest.mock('./supabase', () => ({
  supabase: {
    auth: { getSession: jest.fn(async () => ({ data: { session: { user: { id: 'u1' } } } })) },
    from: jest.fn((table: string) => ({
      insert: (row: Record<string, unknown>) => ({
        select: async () => {
          if (table !== 'capture_changes') throw new Error(`unexpected table ${table}`);
          mockInserts.push(row);
          mockDuringInsert();
          return mockAnswer(row);
        },
      }),
    })),
  },
}));
jest.mock('./signal', () => ({ triggerSignalRegenDebounced: jest.fn() }));

import { BASE_SCHEMA_SQL, applyColumnUpgrades } from './localSchema';
import { CAPTURE_CHANGE_KEYS } from './captureChanges';
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
  mockAnswer = (r) => ({ data: [{ id: r.id }], error: null });
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
  it('sends exactly 091’s granted columns and marks the row landed', async () => {
    write('a', 'pet-a');
    await syncPendingCaptureChanges();
    // Never created_at: the server's clock stamps it, and 091 grants no INSERT on it.
    expect(mockInserts).toEqual([
      { id: 'a', pet_id: 'pet-a', change_key: 'fab_stool_split', first_seen_at: '2026-10-09T08:00:00.000Z' },
    ]);
    expect(row('a').synced).toBe(1);
    await syncPendingCaptureChanges();
    expect(mockInserts).toHaveLength(1);
  });

  it('counts a 23505 as landed: the pet’s row is already on the server (another phone, or before a wipe)', async () => {
    write('a', 'pet-a');
    mockAnswer = () => ({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "capture_changes_one_per_pet_change"' } });
    await syncPendingCaptureChanges();
    expect(row('a')).toMatchObject({ synced: 1, sync_error: null });
  });

  it('leaves the row queued, attempt unspent, on a transient failure', async () => {
    write('a', 'pet-a');
    mockAnswer = () => ({ data: null, error: { code: '', message: 'Network request failed' } });
    await syncPendingCaptureChanges();
    expect(row('a')).toMatchObject({ synced: 0, sync_attempts: 0, sync_error: null });
  });

  it('spends an attempt on a refusal, and quarantines at the cap', async () => {
    write('a', 'pet-a');
    mockAnswer = () => ({ data: null, error: { code: '42501', message: 'new row violates row-level security policy' } });
    await syncPendingCaptureChanges();
    expect(row('a')).toMatchObject({ synced: 0, sync_attempts: 1 });
    for (let i = 1; i < MAX_SYNC_ATTEMPTS; i++) await syncPendingCaptureChanges();
    expect(row('a').sync_error).not.toBeNull();
    const sent = mockInserts.length;
    await syncPendingCaptureChanges();
    expect(mockInserts).toHaveLength(sent);
  });

  it('treats an empty answer as RLS-filtered, never as landed', async () => {
    write('a', 'pet-a');
    mockAnswer = () => ({ data: [], error: null });
    await syncPendingCaptureChanges();
    expect(row('a')).toMatchObject({ synced: 0, sync_attempts: 1 });
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
