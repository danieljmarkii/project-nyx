// B-661 PR 3 — the testable halves of lib/notificationSettings.ts: the two
// load-bearing SQL statements (the split-brain-safe read and the get-or-create
// write) exercised against an in-memory node:sqlite built from the EXACT
// production local DDL, the same harness as notificationPreferences.test.ts /
// dietTrialMirror.test.ts. The orchestration (applyCategoryPreference /
// reconcileFromPreferences) is thin delegation to the scheduling primitive already
// covered by notifications.test.ts, and to getDb/sync which the on-device path
// owns — so the value here is proving the SQL contract the source-scan and the
// split-brain caveat both hinge on.

// The module's I/O deps are mocked (the dietTrialSetup.test.ts pattern) ONLY so
// importing its exported SQL-string constants doesn't drag in lib/supabase.ts
// (which fail-fast throws without env) or expo-notifications. The constants
// themselves are the real exports, run against a genuine node:sqlite below.
jest.mock('./sync', () => ({ syncPendingNotificationPreferences: jest.fn() }));
jest.mock('./db', () => ({ getDb: jest.fn() }));
jest.mock('./notifications', () => ({
  reconcileSchedules: jest.fn(),
  ALL_NOTIFICATION_CATEGORIES: ['daily_summary'],
}));

import {
  CATEGORY_PREFERENCE_READ_SQL,
  CATEGORY_PREFERENCE_UPDATE_SQL,
  CATEGORY_PREFERENCE_INSERT_SQL,
} from './notificationSettings';
import { NOTIFICATION_SCHEMA_SQL } from './notificationPreferences';

// node:sqlite is Node ≥ 22 core; require() keeps it off the babel/jest-expo path
// (the loader trick lib/notificationPreferences.test.ts uses).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

type Row = Record<string, unknown>;

function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(NOTIFICATION_SCHEMA_SQL);
  return db;
}

// Seed a raw row with explicit control over the split-brain-relevant columns.
function seed(
  db: ReturnType<typeof freshDb>,
  o: {
    id: string;
    pet_id?: string | null;
    category?: string;
    enabled?: number;
    updated_at?: string;
    synced?: number;
    sync_error?: string | null;
  },
) {
  db.prepare(
    `INSERT INTO notification_preferences
       (id, pet_id, category, enabled, fire_local_time, created_at, updated_at, synced, sync_attempts, sync_error)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    o.id,
    o.pet_id ?? null,
    o.category ?? 'daily_summary',
    o.enabled ?? 0,
    '21:00',
    '2026-08-01T00:00:00.000Z',
    o.updated_at ?? '2026-08-01T00:00:00.000Z',
    o.synced ?? 0,
    0,
    o.sync_error ?? null,
  );
}

const readWinner = (db: ReturnType<typeof freshDb>, category = 'daily_summary') =>
  db.prepare(CATEGORY_PREFERENCE_READ_SQL).get(category) as Row | undefined;

describe('CATEGORY_PREFERENCE_READ_SQL — split-brain resolution (§4 mirror carry-forward)', () => {
  it('returns nothing when no row exists (absence = off, G6)', () => {
    const db = freshDb();
    expect(readWinner(db)).toBeUndefined();
  });

  it('prefers the SYNCED row over a quarantined loser regardless of recency', () => {
    const db = freshDb();
    // The stale quarantined loser is NEWER — recency alone would pick it, which is
    // exactly the bug the ORDER BY exists to prevent.
    seed(db, {
      id: 'loser',
      enabled: 1,
      synced: 0,
      sync_error: '23505',
      updated_at: '2026-08-02T00:00:00.000Z',
    });
    seed(db, {
      id: 'winner',
      enabled: 0,
      synced: 1,
      updated_at: '2026-08-01T00:00:00.000Z',
    });
    expect(readWinner(db)?.id).toBe('winner');
  });

  it('among synced rows, prefers the newest edit', () => {
    const db = freshDb();
    seed(db, { id: 'old', enabled: 0, synced: 1, updated_at: '2026-08-01T00:00:00.000Z' });
    seed(db, { id: 'new', enabled: 1, synced: 1, updated_at: '2026-08-02T00:00:00.000Z' });
    expect(readWinner(db)?.id).toBe('new');
  });

  it('never surfaces a per-pet row for the account-wide read (pet_id IS NULL only)', () => {
    const db = freshDb();
    // A future per-pet preference must not shadow the account-wide (v1) one.
    seed(db, { id: 'per-pet', pet_id: 'pet-123', enabled: 1, synced: 1 });
    expect(readWinner(db)).toBeUndefined();
  });
});

describe('the get-or-create write path (as the setCategoryEnabled SQL runs it)', () => {
  it('INSERT defaults synced=0, sync_attempts=0, sync_error=NULL (the quarantine trio)', () => {
    const db = freshDb();
    db.prepare(CATEGORY_PREFERENCE_INSERT_SQL).run(
      'pref-1', 'daily_summary', 1, '2026-08-02T09:00:00.000Z', '2026-08-02T09:00:00.000Z',
    );
    const row = db
      .prepare('SELECT enabled, fire_local_time, synced, sync_attempts, sync_error FROM notification_preferences')
      .get() as Row;
    // A brand-new opt-in is unsynced (queued to push) but NOT quarantined.
    expect(row).toEqual({
      enabled: 1,
      fire_local_time: '21:00',
      synced: 0,
      sync_attempts: 0,
      sync_error: null,
    });
  });

  it('UPDATE flips enabled and re-queues the row, clearing any prior quarantine', () => {
    const db = freshDb();
    // A previously-synced, enabled row that later hit a sync error.
    seed(db, { id: 'pref-1', enabled: 1, synced: 1, sync_error: 'stale-error' });
    db.prepare(CATEGORY_PREFERENCE_UPDATE_SQL).run(0, '2026-08-02T21:00:00.000Z', 'pref-1');
    const row = db
      .prepare('SELECT enabled, updated_at, synced, sync_attempts, sync_error FROM notification_preferences WHERE id = ?')
      .get('pref-1') as Row;
    expect(row).toEqual({
      enabled: 0,
      updated_at: '2026-08-02T21:00:00.000Z',
      synced: 0, // re-queued for push
      sync_attempts: 0,
      sync_error: null, // quarantine cleared — a toggle is a fresh attempt
    });
  });

  it('read → INSERT → read → UPDATE is a coherent toggle round trip', () => {
    const db = freshDb();
    // 1. read: nothing → the caller INSERTs (enable).
    expect(readWinner(db)).toBeUndefined();
    db.prepare(CATEGORY_PREFERENCE_INSERT_SQL).run(
      'pref-1', 'daily_summary', 1, '2026-08-02T09:00:00.000Z', '2026-08-02T09:00:00.000Z',
    );
    // 2. read: the winning row is now enabled.
    let winner = readWinner(db);
    expect(winner?.id).toBe('pref-1');
    expect(winner?.enabled).toBe(1);
    // 3. toggle off: the caller UPDATEs the found id — no duplicate row is created.
    db.prepare(CATEGORY_PREFERENCE_UPDATE_SQL).run(0, '2026-08-02T21:00:00.000Z', 'pref-1');
    const count = (db.prepare('SELECT count(*) AS n FROM notification_preferences').get() as Row).n;
    expect(count).toBe(1);
    winner = readWinner(db);
    expect(winner?.enabled).toBe(0);
  });
});
