// CUL-2489: the SyncBanner's row counts from ONE statement, over the REAL local schema. Two reads
// (pending, then refused) let a drain that re-arms a refused row between them make both answer
// zero; one statement reads one SQLite snapshot. This pins that the joined statement answers
// exactly what the two queries answer apart, on every queue the schema declares.
const { DatabaseSync } = require('node:sqlite');

const mockLocal = { db: null as InstanceType<typeof DatabaseSync> | null };

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: () => ({
    getFirstAsync: async (sql: string, params: unknown[] = []) =>
      mockLocal.db!.prepare(sql).get(...(params as never[])) ?? null,
  }),
}));
jest.mock('expo-file-system', () => ({ File: class {}, Directory: class {}, Paths: {} }));

import { BASE_SCHEMA_SQL, applyColumnUpgrades } from './localSchema';
import { MEDICATION_SCHEMA_SQL } from './medications';
import { DIET_TRIAL_SCHEMA_SQL } from './dietTrialMirror';
import { NOTIFICATION_SCHEMA_SQL } from './notificationPreferences';
import { getSyncStatus, syncStatusSql } from './db';
import { pendingStatusSql, quarantineCountSql } from './syncQueue';

const T1 = '2026-07-01T08:00:00.000Z';
const T2 = '2026-07-05T08:00:00.000Z';

beforeEach(async () => {
  const db = new DatabaseSync(':memory:');
  for (const sql of [BASE_SCHEMA_SQL, MEDICATION_SCHEMA_SQL, DIET_TRIAL_SCHEMA_SQL, NOTIFICATION_SCHEMA_SQL]) {
    db.exec(sql);
  }
  await applyColumnUpgrades(async (sql) => db.exec(sql));
  mockLocal.db = db;
});

function seedEvent(id: string, at: string, synced: number, error: string | null = null): void {
  mockLocal.db!
    .prepare(
      `INSERT INTO events (id, pet_id, event_type, occurred_at, created_at, updated_at, synced, sync_error)
       VALUES (?, 'p1', 'vomit', ?, ?, ?, ?, ?)`,
    )
    .run(id, at, at, at, synced, error);
}

function seedMeal(id: string, at: string, error: string | null = null): void {
  seedEvent(`evt-${id}`, at, 1);
  mockLocal.db!
    .prepare(
      `INSERT INTO meals (id, event_id, pet_id, created_at, updated_at, synced, sync_error)
       VALUES (?, ?, 'p1', ?, ?, 0, ?)`,
    )
    .run(id, `evt-${id}`, at, at, error);
}

it('runs on an empty store: nothing pending, nothing refused', async () => {
  await expect(getSyncStatus()).resolves.toEqual({ pendingCount: 0, oldestPendingAt: null, quarantinedCount: 0 });
});

it('counts pending and refused across queues from one statement, keeping the oldest pending time', async () => {
  seedEvent('e1', T2, 0);
  seedMeal('m1', T1);
  seedEvent('e2', T1, 0, '23505: duplicate key value');
  seedEvent('e3', T1, 1); // landed: counts nowhere
  await expect(getSyncStatus()).resolves.toEqual({ pendingCount: 2, oldestPendingAt: T1, quarantinedCount: 1 });
});

it('answers exactly what the two queries answer apart', async () => {
  seedEvent('e1', T2, 0);
  seedMeal('m1', T1, '23514: check constraint');
  const db = mockLocal.db!;
  const p = db.prepare(pendingStatusSql()).get() as { count: number; oldest: string | null };
  const q = db.prepare(quarantineCountSql()).get() as { count: number };
  expect(db.prepare(syncStatusSql()).get()).toEqual({ count: p.count, oldest: p.oldest, quarantined: q.count });
});

it('is one statement, so one snapshot (no second read for a drain to slip between)', () => {
  // A single SELECT: no statement separator outside the parenthesised derived tables.
  expect(syncStatusSql().trim().startsWith('SELECT')).toBe(true);
  expect(syncStatusSql()).not.toContain(';');
});
