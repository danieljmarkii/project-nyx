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
  // A recognizable stand-in for the real pure resolver (covered in
  // notifications.test.ts) so we can assert reconcileFromPreferences threads the
  // right (usePetName × petName) content without importing expo-notifications.
  resolveDailySummaryContent: jest.fn(
    (opts: { usePetName: boolean; petName: string | null }) =>
      opts.usePetName && opts.petName
        ? { title: `named:${opts.petName}`, body: `named-body:${opts.petName}` }
        : { title: 'neutral', body: 'neutral-body' },
  ),
  ALL_NOTIFICATION_CATEGORIES: ['daily_summary'],
}));
// The pet store the reconcile reads to resolve the single-pet name (DR-6). Default:
// no pets → neutral. Individual tests override getState for the single-pet path.
jest.mock('../store/petStore', () => ({
  usePetStore: { getState: jest.fn(() => ({ pets: [] as { id: string; name: string }[] })) },
}));

import {
  CATEGORY_PREFERENCE_READ_SQL,
  CATEGORY_PREFERENCE_UPDATE_SQL,
  CATEGORY_PREFERENCE_INSERT_SQL,
  USE_PET_NAME_UPDATE_SQL,
  USE_PET_NAME_INSERT_SQL,
  setCategoryEnabled,
  applyCategoryPreference,
  reconcileFromPreferences,
  readCategoryEnabled,
  readUsePetName,
  setUsePetName,
  applyUsePetName,
} from './notificationSettings';
import { NOTIFICATION_SCHEMA_SQL } from './notificationPreferences';
import { getDb } from './db';
import { reconcileSchedules } from './notifications';
import { syncPendingNotificationPreferences } from './sync';
import { usePetStore } from '../store/petStore';

const mockGetDb = getDb as jest.Mock;
const mockReconcile = reconcileSchedules as jest.Mock;
const mockPush = syncPendingNotificationPreferences as jest.Mock;
const mockGetState = (usePetStore as unknown as { getState: jest.Mock }).getState;

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

// ── The orchestration functions (getDb wired to a controllable fake) ──────────
// The SQL-constant tests above prove the CONTRACT; these prove setCategoryEnabled
// picks INSERT vs UPDATE correctly and threads params in order, and that
// applyCategoryPreference persists-then-reconciles — the feedingArrangements /
// dietTrialSetup precedent the SQL-only tests otherwise skip.
type FakeDb = { getFirstAsync: jest.Mock; runAsync: jest.Mock };
function fakeDb(existing: unknown): FakeDb {
  return {
    getFirstAsync: jest.fn().mockResolvedValue(existing),
    runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
  };
}

describe('setCategoryEnabled — get-or-create + quarantine-clear', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPush.mockResolvedValue(undefined);
  });

  it('INSERTs a fresh row (relying on schema defaults) when none exists, then pushes', async () => {
    const db = fakeDb(null);
    mockGetDb.mockReturnValue(db);
    await setCategoryEnabled('daily_summary', true);
    expect(db.runAsync).toHaveBeenCalledTimes(1);
    const [sql, params] = db.runAsync.mock.calls[0];
    expect(sql).toContain('INSERT INTO notification_preferences');
    // params: [uuid, category, enabled, created_at, updated_at]
    expect(params[1]).toBe('daily_summary');
    expect(params[2]).toBe(1);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('UPDATEs the found row (no duplicate) and threads its id last', async () => {
    const db = fakeDb({ id: 'existing-1', enabled: 1 });
    mockGetDb.mockReturnValue(db);
    await setCategoryEnabled('daily_summary', false);
    const [sql, params] = db.runAsync.mock.calls[0];
    expect(sql).toContain('UPDATE notification_preferences');
    // params: [enabled, updated_at, id]
    expect(params[0]).toBe(0);
    expect(params[2]).toBe('existing-1');
    expect(mockPush).toHaveBeenCalledTimes(1);
  });
});

describe('readCategoryEnabled / applyCategoryPreference / reconcileFromPreferences', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPush.mockResolvedValue(undefined);
    mockReconcile.mockResolvedValue({ toSchedule: [], toCancel: [] });
    mockGetState.mockReturnValue({ pets: [] }); // default: no single pet → neutral
  });

  it('readCategoryEnabled coerces the SQLite integer to a boolean', async () => {
    mockGetDb.mockReturnValue(fakeDb({ id: 'x', enabled: 1 }));
    expect(await readCategoryEnabled('daily_summary')).toBe(true);
    mockGetDb.mockReturnValue(fakeDb({ id: 'x', enabled: 0 }));
    expect(await readCategoryEnabled('daily_summary')).toBe(false);
    mockGetDb.mockReturnValue(fakeDb(null)); // absent = off (G6)
    expect(await readCategoryEnabled('daily_summary')).toBe(false);
  });

  it('applyCategoryPreference persists the pref THEN reconciles the schedule', async () => {
    const db = fakeDb(null);
    mockGetDb.mockReturnValue(db);
    await applyCategoryPreference('daily_summary', true);
    expect(db.runAsync).toHaveBeenCalled(); // wrote the pref
    expect(mockReconcile).toHaveBeenCalledTimes(1); // then reconciled
  });

  it('reconcileFromPreferences passes only enabled categories as desired (with content)', async () => {
    mockGetDb.mockReturnValue(fakeDb({ id: 'x', enabled: 1 })); // daily_summary on
    await reconcileFromPreferences();
    expect(mockReconcile).toHaveBeenCalledWith(['daily_summary'], expect.anything());
  });

  it('reconcileFromPreferences passes an empty desired set when nothing is enabled', async () => {
    mockGetDb.mockReturnValue(fakeDb(null)); // nothing on
    await reconcileFromPreferences();
    expect(mockReconcile).toHaveBeenCalledWith([], expect.anything());
  });

  it('threads the NAMED daily-summary content on a single-pet opted-in account (DR-6)', async () => {
    // use_pet_name = 1 on the read row, and exactly one pet in the store.
    mockGetDb.mockReturnValue(fakeDb({ id: 'x', enabled: 1, use_pet_name: 1 }));
    mockGetState.mockReturnValue({ pets: [{ id: 'p1', name: 'Biscuit' }] });
    await reconcileFromPreferences();
    expect(mockReconcile).toHaveBeenCalledWith(['daily_summary'], {
      daily_summary: { title: 'named:Biscuit', body: 'named-body:Biscuit' },
    });
  });

  it('stays neutral for a MULTI-pet account even when opted in (by construction)', async () => {
    mockGetDb.mockReturnValue(fakeDb({ id: 'x', enabled: 1, use_pet_name: 1 }));
    mockGetState.mockReturnValue({ pets: [{ id: 'p1', name: 'Biscuit' }, { id: 'p2', name: 'Gus' }] });
    await reconcileFromPreferences();
    expect(mockReconcile).toHaveBeenCalledWith(['daily_summary'], {
      daily_summary: { title: 'neutral', body: 'neutral-body' },
    });
  });

  it('stays neutral for a single pet when the opt-in is OFF', async () => {
    mockGetDb.mockReturnValue(fakeDb({ id: 'x', enabled: 1, use_pet_name: 0 }));
    mockGetState.mockReturnValue({ pets: [{ id: 'p1', name: 'Biscuit' }] });
    await reconcileFromPreferences();
    expect(mockReconcile).toHaveBeenCalledWith(['daily_summary'], {
      daily_summary: { title: 'neutral', body: 'neutral-body' },
    });
  });
});

// ── The warmth opt-in write path (DR-6) as its SQL runs against real SQLite ───
describe('USE_PET_NAME SQL — writes only use_pet_name, preserving enabled', () => {
  it('UPDATE flips use_pet_name and re-queues, leaving enabled untouched', () => {
    const db = freshDb();
    // A previously-synced, ENABLED daily_summary row that later hit a sync error.
    seed(db, { id: 'pref-1', enabled: 1, synced: 1, sync_error: 'stale-error' });
    db.prepare(USE_PET_NAME_UPDATE_SQL).run(1, '2026-08-15T21:00:00.000Z', 'pref-1');
    const row = db
      .prepare('SELECT enabled, use_pet_name, updated_at, synced, sync_attempts, sync_error FROM notification_preferences WHERE id = ?')
      .get('pref-1') as Row;
    expect(row).toEqual({
      enabled: 1, // PRESERVED — the name pref never touches the summary's on-state
      use_pet_name: 1,
      updated_at: '2026-08-15T21:00:00.000Z',
      synced: 0, // re-queued for push
      sync_attempts: 0,
      sync_error: null, // quarantine cleared (B-398 contract)
    });
  });

  it('INSERT creates the daily_summary row with the name pref and enabled = 0 (G6)', () => {
    const db = freshDb();
    db.prepare(USE_PET_NAME_INSERT_SQL).run(
      'pref-1', 1, '2026-08-15T09:00:00.000Z', '2026-08-15T09:00:00.000Z',
    );
    const row = db
      .prepare('SELECT category, enabled, use_pet_name, pet_id, synced, sync_error FROM notification_preferences')
      .get() as Row;
    expect(row).toEqual({
      category: 'daily_summary',
      enabled: 0, // storing a name pref must never turn the summary on
      use_pet_name: 1,
      pet_id: null, // account-wide (the v1 shape)
      synced: 0,
      sync_error: null,
    });
  });
});

describe('readUsePetName / setUsePetName / applyUsePetName (DR-6 orchestration)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPush.mockResolvedValue(undefined);
    mockReconcile.mockResolvedValue({ toSchedule: [], toCancel: [] });
    mockGetState.mockReturnValue({ pets: [] });
  });

  it('readUsePetName coerces the SQLite integer to a boolean, absent = off', async () => {
    mockGetDb.mockReturnValue(fakeDb({ id: 'x', use_pet_name: 1 }));
    expect(await readUsePetName()).toBe(true);
    mockGetDb.mockReturnValue(fakeDb({ id: 'x', use_pet_name: 0 }));
    expect(await readUsePetName()).toBe(false);
    mockGetDb.mockReturnValue(fakeDb(null)); // no row = neutral (G6)
    expect(await readUsePetName()).toBe(false);
  });

  it('setUsePetName UPDATEs the found row (no duplicate) and threads its id last, then pushes', async () => {
    const db = fakeDb({ id: 'existing-1', enabled: 1, use_pet_name: 0 });
    mockGetDb.mockReturnValue(db);
    await setUsePetName(true);
    const [sql, params] = db.runAsync.mock.calls[0];
    expect(sql).toContain('UPDATE notification_preferences');
    // params: [use_pet_name, updated_at, id]
    expect(params[0]).toBe(1);
    expect(params[2]).toBe('existing-1');
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('setUsePetName INSERTs a daily_summary row when none exists (defensive get-or-create)', async () => {
    const db = fakeDb(null);
    mockGetDb.mockReturnValue(db);
    await setUsePetName(true);
    const [sql, params] = db.runAsync.mock.calls[0];
    expect(sql).toContain('INSERT INTO notification_preferences');
    // params: [uuid, use_pet_name, created_at, updated_at]
    expect(params[1]).toBe(1);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('applyUsePetName persists the opt-in THEN reconciles (refreshing the schedule body)', async () => {
    const db = fakeDb({ id: 'x', enabled: 1, use_pet_name: 0 });
    mockGetDb.mockReturnValue(db);
    await applyUsePetName(true);
    expect(db.runAsync).toHaveBeenCalled(); // wrote the pref
    expect(mockReconcile).toHaveBeenCalledTimes(1); // then reconciled
  });
});
