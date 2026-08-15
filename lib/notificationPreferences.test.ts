// B-661 PR 2 — the testable halves of the notification-preferences local-mirror
// plumbing:
//
//   1. NOTIFICATION_SCHEMA_SQL — the EXACT production local DDL lib/db.ts initDb
//      runs — exercised against an in-memory node:sqlite (the same harness as
//      dietTrialMirror.test.ts / medications.test.ts). The expo-sqlite jest mock
//      never runs the DDL, so the load-bearing behaviours — the boolean/integer
//      round trip, the wall-clock text left untouched, the deliberately-absent
//      local unique on the natural key — are otherwise unverified until on-device.
//   2. NOTIFICATION_PREFERENCE_PUSH_QUEUE_SQL — the quarantine filter.
//   3. The pure row → Supabase-payload mapper, including the user_id stamp and the
//      boolean coercion the account-scoped sync round trip lives on.

import {
  NOTIFICATION_SCHEMA_SQL,
  NOTIFICATION_PREFERENCE_PUSH_QUEUE_SQL,
  notificationPreferenceRowToRemote,
  type LocalNotificationPreference,
} from './notificationPreferences';
import { COLUMN_UPGRADES } from './localSchema';

// node:sqlite is Node ≥ 22 core; require() keeps it off the babel/jest-expo path
// (same loader trick as lib/dietTrialMirror.test.ts).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

type Row = Record<string, unknown>;

function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(NOTIFICATION_SCHEMA_SQL);
  return db;
}

function insertPref(db: ReturnType<typeof freshDb>, overrides: Record<string, string> = {}) {
  const v: Record<string, string> = {
    id: 'pref-1',
    category: 'daily_summary',
    ...overrides,
  };
  const cols = Object.keys(v);
  const placeholders = cols.map((c) => `'${v[c]}'`).join(', ');
  db.exec(`INSERT INTO notification_preferences (${cols.join(', ')}) VALUES (${placeholders})`);
}

describe('NOTIFICATION_SCHEMA_SQL — production local DDL', () => {
  it('round-trips a preference, defaulting to off / neutral / 9pm / unsynced / no error (G6)', () => {
    const db = freshDb();
    insertPref(db);
    const p = db.prepare('SELECT * FROM notification_preferences WHERE id = ?').get('pref-1') as Row;
    expect(p.enabled).toBe(0);          // G6 — everything defaults OFF
    expect(p.use_pet_name).toBe(0);     // DR-6 — neutral by default (T&S; involuntary-public)
    expect(p.fire_local_time).toBe('21:00'); // the fixed v1 time
    expect(p.pet_id).toBeNull();        // account-wide (the v1 shape)
    expect(p.synced).toBe(0);           // queued for push
    expect(p.sync_error).toBeNull();    // nothing has failed yet
    db.close();
  });

  it('stores use_pet_name as an INTEGER 0/1 (the DR-6 warmth opt-in)', () => {
    const db = freshDb();
    insertPref(db, { id: 'named', use_pet_name: '1' });
    const p = db.prepare('SELECT use_pet_name FROM notification_preferences WHERE id = ?').get('named') as Row;
    expect(p.use_pet_name).toBe(1);
    expect(typeof p.use_pet_name).toBe('number');
    db.close();
  });

  it('stores enabled as an INTEGER 0/1 (SQLite has no boolean)', () => {
    const db = freshDb();
    insertPref(db, { id: 'on', enabled: '1' });
    const p = db.prepare('SELECT enabled FROM notification_preferences WHERE id = ?').get('on') as Row;
    expect(p.enabled).toBe(1);
    expect(typeof p.enabled).toBe('number');
    db.close();
  });

  it('keeps fire_local_time as verbatim wall-clock text (never coerced to a timestamp)', () => {
    // The one documented exception to all-timestamps-UTC. A custom time round-trips
    // as the exact string it was written as — no parsing, no normalization.
    const db = freshDb();
    insertPref(db, { id: 'custom', fire_local_time: '08:30' });
    const p = db.prepare('SELECT fire_local_time FROM notification_preferences WHERE id = ?').get('custom') as Row;
    expect(p.fire_local_time).toBe('08:30');
    db.close();
  });

  it('stores no user_id column — the mirror is single-account (stamped at push)', () => {
    const db = freshDb();
    const columns = db
      .prepare(`SELECT name FROM pragma_table_info('notification_preferences')`)
      .all()
      .map((r: { name: string }) => r.name);
    expect(columns).not.toContain('user_id');
    // The columns the push SELECT * reads back, and the sync round trip carries.
    expect(columns).toEqual(
      expect.arrayContaining([
        'id', 'pet_id', 'category', 'enabled', 'use_pet_name', 'fire_local_time',
        'created_at', 'updated_at', 'synced', 'sync_attempts', 'sync_error',
      ]),
    );
    db.close();
  });

  it('does NOT enforce the natural key locally (the cross-device duplicate must be representable)', () => {
    // Server-side this is a partial UNIQUE (user_id, category) WHERE pet_id IS NULL
    // (migration 050). Locally it must NOT be: a device that lost the server's
    // 23505 race holds its own unsynced row AND must still be able to hydrate the
    // winner. A local UNIQUE would make that hydrate throw, leaving the loser in
    // place and unfixable — the diet-trial active-index lesson, applied here.
    const db = freshDb();
    insertPref(db, { id: 'mine', category: 'daily_summary' });
    expect(() => insertPref(db, { id: 'theirs', category: 'daily_summary' })).not.toThrow();
    const n = db.prepare(
      `SELECT COUNT(*) AS c FROM notification_preferences WHERE category = 'daily_summary' AND pet_id IS NULL`,
    ).get() as Row;
    expect(n.c).toBe(2);
    db.close();
  });

  it('declares no SQLite foreign key — it is account-scoped with no local parent', () => {
    // Unlike the pet-scoped mirrors, there is no local table to reference (the
    // server FKs to auth.users/pets have no local analog). A row with any pet_id
    // inserts cleanly.
    const db = freshDb();
    insertPref(db, { id: 'p', pet_id: 'no-such-pet' });
    const p = db.prepare('SELECT pet_id, synced FROM notification_preferences WHERE id = ?').get('p') as Row;
    expect(p.pet_id).toBe('no-such-pet');
    expect(p.synced).toBe(0);
    db.close();
  });
});

// The upgrade path (DR-6) — CREATE TABLE IF NOT EXISTS can't add a column to a
// table that already exists (migration 050 shipped notification_preferences long
// before use_pet_name), so an already-installed device gets the column only via
// COLUMN_UPGRADES. Without it, CATEGORY_PREFERENCE_READ_SQL's SELECT of use_pet_name
// throws on every read/write of the (already-shipped) Daily Summary toggle.
describe('use_pet_name upgrade path (pre-058 devices)', () => {
  it('COLUMN_UPGRADES carries the notification_preferences.use_pet_name add', () => {
    const entry = COLUMN_UPGRADES.find(
      (u) => u.table === 'notification_preferences' && u.column === 'use_pet_name',
    );
    expect(entry).toBeDefined();
    // Constant default (SQLite allows it on ADD COLUMN) — 0 = neutral, mirroring
    // migration 058's server DEFAULT false.
    expect(entry?.type).toBe('INTEGER NOT NULL DEFAULT 0');
  });

  it('applying it to a PRE-058 table adds the column (default 0) and unblocks the read', () => {
    const db = new DatabaseSync(':memory:');
    // The pre-DR-6 shape — migration 050's notification_preferences WITHOUT
    // use_pet_name (what an upgrading device actually holds).
    db.exec(`CREATE TABLE notification_preferences (
      id TEXT PRIMARY KEY, pet_id TEXT, category TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0, fire_local_time TEXT NOT NULL DEFAULT '21:00',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      synced INTEGER NOT NULL DEFAULT 0, sync_attempts INTEGER NOT NULL DEFAULT 0, sync_error TEXT
    );`);
    db.exec(
      `INSERT INTO notification_preferences (id, category, enabled) VALUES ('old', 'daily_summary', 1)`,
    );
    // The regression the upgrade prevents: the DR-6 read throws before the column exists.
    expect(() =>
      db.prepare('SELECT use_pet_name FROM notification_preferences').get(),
    ).toThrow(/use_pet_name/);

    const entry = COLUMN_UPGRADES.find(
      (u) => u.table === 'notification_preferences' && u.column === 'use_pet_name',
    )!;
    db.exec(`ALTER TABLE notification_preferences ADD COLUMN ${entry.column} ${entry.type}`);

    const row = db
      .prepare('SELECT enabled, use_pet_name FROM notification_preferences WHERE id = ?')
      .get('old') as Row;
    expect(row.enabled).toBe(1); // the pre-existing Daily Summary toggle survives untouched
    expect(row.use_pet_name).toBe(0); // backfilled neutral — the honest pre-opt-in value
    db.close();
  });
});

describe('the push queue skips quarantined rows', () => {
  it('excludes a row carrying a sync_error, and includes it again once cleared', () => {
    // The quarantine's whole purpose: a row that can never land (the cross-device
    // 23505) stops being re-sent every cycle — WITHOUT being flagged synced, which
    // would be a lie.
    const db = freshDb();
    insertPref(db);
    expect((db.prepare(NOTIFICATION_PREFERENCE_PUSH_QUEUE_SQL).all() as Row[]).length).toBe(1);

    db.exec(`UPDATE notification_preferences SET sync_error = '23505: duplicate key' WHERE id = 'pref-1'`);
    expect((db.prepare(NOTIFICATION_PREFERENCE_PUSH_QUEUE_SQL).all() as Row[]).length).toBe(0);
    // Still honestly unsynced — the quarantine never claims otherwise.
    const p = db.prepare('SELECT synced FROM notification_preferences WHERE id = ?').get('pref-1') as Row;
    expect(p.synced).toBe(0);

    // The write-path contract: synced = 0, sync_error = NULL re-queues it.
    db.exec(`UPDATE notification_preferences SET synced = 0, sync_error = NULL WHERE id = 'pref-1'`);
    expect((db.prepare(NOTIFICATION_PREFERENCE_PUSH_QUEUE_SQL).all() as Row[]).length).toBe(1);
    db.close();
  });
});

describe('notificationPreferenceRowToRemote', () => {
  const base: LocalNotificationPreference = {
    id: 'pref-1',
    pet_id: null,
    category: 'daily_summary',
    enabled: 0,
    use_pet_name: 0,
    fire_local_time: '21:00',
    created_at: '2026-08-02T00:00:00.000Z',
    updated_at: '2026-08-02T00:00:00.000Z',
  };

  it('forwards every server column plus the stamped user_id (the B-057 drift guard)', () => {
    // Completeness, asserted on the KEY SET: a column silently dropped here desyncs
    // forever and nothing else in the stack would notice.
    expect(Object.keys(notificationPreferenceRowToRemote(base, 'user-abc')).sort()).toEqual(
      [
        'id', 'user_id', 'pet_id', 'category', 'enabled', 'use_pet_name',
        'fire_local_time', 'created_at', 'updated_at',
      ].sort(),
    );
  });

  it('coerces the INTEGER use_pet_name to a real boolean for the server column (DR-6)', () => {
    expect(notificationPreferenceRowToRemote({ ...base, use_pet_name: 1 }, 'u').use_pet_name).toBe(true);
    expect(notificationPreferenceRowToRemote({ ...base, use_pet_name: 0 }, 'u').use_pet_name).toBe(false);
  });

  it('stamps user_id from the caller (the mirror stores no owner; RLS requires it)', () => {
    expect(notificationPreferenceRowToRemote(base, 'user-abc').user_id).toBe('user-abc');
  });

  it('coerces the INTEGER enabled to a real boolean for the server column', () => {
    expect(notificationPreferenceRowToRemote({ ...base, enabled: 1 }, 'u').enabled).toBe(true);
    expect(notificationPreferenceRowToRemote({ ...base, enabled: 0 }, 'u').enabled).toBe(false);
  });

  it('forwards fire_local_time verbatim (wall-clock text, never a timestamp)', () => {
    expect(notificationPreferenceRowToRemote({ ...base, fire_local_time: '08:30' }, 'u').fire_local_time)
      .toBe('08:30');
  });

  it('carries a set pet_id, and preserves account-wide NULL rather than defaulting it', () => {
    expect(notificationPreferenceRowToRemote({ ...base, pet_id: 'pet-9' }, 'u').pet_id).toBe('pet-9');
    expect(notificationPreferenceRowToRemote(base, 'u').pet_id).toBeNull();
  });

  it('never forwards the local-only synced / sync_error columns', () => {
    const payload = notificationPreferenceRowToRemote(
      {
        ...base,
        // Deliberately shaped like a row read by SELECT *, which DOES carry both.
        ...({ synced: 0, sync_error: '23505: dup' } as unknown as Partial<LocalNotificationPreference>),
      },
      'u',
    );
    expect(payload).not.toHaveProperty('synced');
    expect(payload).not.toHaveProperty('sync_error');
    expect(payload).not.toHaveProperty('sync_attempts');
  });
});
