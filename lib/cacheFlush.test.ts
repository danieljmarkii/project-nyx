// Exercises the REAL flushLegacyCatalogCachesIfNeeded (lib/db.ts) against an
// in-memory SQLite. The lib/db.ts jest harness mocks the expo-sqlite handle, so
// the flush's actual behaviour — read PRAGMA user_version, truncate BOTH catalog
// caches when it lags, bump the version, and no-op forever after — is otherwise
// unexercised. This is the load-bearing new logic of B-354 PR 2 (FR-5): the
// one-time drop of pre-per-account foreign rows that RLS filtering alone can never
// remove from SQLite.
//
// node:sqlite (Node ≥ 22) gives a real engine. Its API is synchronous, so a thin
// adapter wraps it in the small async surface the production function declares
// (CacheFlushDb) — the function under test is the real one, not a copy.
//
// db.ts imports expo-sqlite / expo-file-system at module load; those native
// modules don't resolve under jest-expo's node runner. The function under test
// operates on an injected async adapter (CacheFlushDb), never the real handle, so
// stubbing the native imports to satisfy the import graph is sufficient — the
// production code path is untouched.
jest.mock('expo-sqlite', () => ({ openDatabaseSync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: class {} }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');
import { flushLegacyCatalogCachesIfNeeded, CACHE_SCHEMA_VERSION } from './db';

type RawDb = InstanceType<typeof DatabaseSync>;

// Adapt node:sqlite's sync API to the async CacheFlushDb surface the production
// flush declares. getFirstAsync must return null for a no-row result (PRAGMA
// user_version always yields a row, but the ?? guard is what the code relies on).
function asyncAdapter(db: RawDb) {
  return {
    async getFirstAsync<T>(sql: string): Promise<T | null> {
      return (db.prepare(sql).get() as T) ?? null;
    },
    async execAsync(sql: string): Promise<void> {
      db.exec(sql);
    },
  };
}

function freshDb(): RawDb {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE food_items_cache (id TEXT PRIMARY KEY, brand TEXT);`);
  db.exec(`CREATE TABLE medication_items_cache (id TEXT PRIMARY KEY, generic_name TEXT);`);
  // The queues the flush consults so it never orphans an offline-captured row's
  // pending FK pre-sync. Minimal mirrors of the columns the WHERE-guards read.
  db.exec(`CREATE TABLE meals (id TEXT PRIMARY KEY, food_item_id TEXT, synced INTEGER);`);
  db.exec(`CREATE TABLE feeding_arrangements (id TEXT PRIMARY KEY, food_item_id TEXT, synced INTEGER);`);
  db.exec(`CREATE TABLE medications (id TEXT PRIMARY KEY, medication_item_id TEXT, synced INTEGER);`);
  db.exec(`CREATE TABLE medication_administrations (id TEXT PRIMARY KEY, medication_item_id TEXT, synced INTEGER);`);
  return db;
}

function seed(db: RawDb) {
  db.exec(`INSERT INTO food_items_cache (id, brand) VALUES ('f1', 'Blue Buffalo'), ('f2', 'Tiki Cat');`);
  db.exec(`INSERT INTO medication_items_cache (id, generic_name) VALUES ('m1', 'gabapentin');`);
}

function userVersion(db: RawDb): number {
  return (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
}

function counts(db: RawDb): { foods: number; meds: number } {
  const foods = (db.prepare('SELECT COUNT(*) AS n FROM food_items_cache').get() as { n: number }).n;
  const meds = (db.prepare('SELECT COUNT(*) AS n FROM medication_items_cache').get() as { n: number }).n;
  return { foods, meds };
}

describe('flushLegacyCatalogCachesIfNeeded (B-354 PR 2 — one-time per-account cache flush)', () => {
  it('flushes both catalog caches and bumps the version when user_version lags', async () => {
    const db = freshDb();
    seed(db);
    expect(userVersion(db)).toBe(0); // every existing install starts at 0
    expect(counts(db)).toEqual({ foods: 2, meds: 1 });

    const flushed = await flushLegacyCatalogCachesIfNeeded(asyncAdapter(db));

    expect(flushed).toBe(true);
    expect(counts(db)).toEqual({ foods: 0, meds: 0 }); // foreign rows dropped
    expect(userVersion(db)).toBe(CACHE_SCHEMA_VERSION);
    db.close();
  });

  it('is idempotent — a second call after the bump no-ops and never re-truncates', async () => {
    const db = freshDb();
    await flushLegacyCatalogCachesIfNeeded(asyncAdapter(db)); // first flush → version bumped
    // Simulate refresh*Cache repopulating with THIS account's rows post-flush.
    seed(db);
    expect(counts(db)).toEqual({ foods: 2, meds: 1 });

    const flushedAgain = await flushLegacyCatalogCachesIfNeeded(asyncAdapter(db));

    expect(flushedAgain).toBe(false);
    expect(counts(db)).toEqual({ foods: 2, meds: 1 }); // account's own rows survive
    expect(userVersion(db)).toBe(CACHE_SCHEMA_VERSION);
    db.close();
  });

  it('does not flush when the local version already meets the target', async () => {
    const db = freshDb();
    db.exec(`PRAGMA user_version = ${CACHE_SCHEMA_VERSION};`);
    seed(db);

    const flushed = await flushLegacyCatalogCachesIfNeeded(asyncAdapter(db));

    expect(flushed).toBe(false);
    expect(counts(db)).toEqual({ foods: 2, meds: 1 });
    db.close();
  });

  it('flushes when the device is behind a higher future target (version-bump re-fire)', async () => {
    const db = freshDb();
    db.exec(`PRAGMA user_version = 1;`);
    seed(db);

    const flushed = await flushLegacyCatalogCachesIfNeeded(asyncAdapter(db), 2);

    expect(flushed).toBe(true);
    expect(counts(db)).toEqual({ foods: 0, meds: 0 });
    expect(userVersion(db)).toBe(2);
    db.close();
  });

  it('preserves a food/drug still referenced by an UNSYNCED write (never orphans a queued FK pre-sync)', async () => {
    const db = freshDb();
    // f1 / m1 = captured offline, still queued (synced=0) → must survive the flush.
    // f2 / m2 = foreign or already-synced catalog rows → must be dropped.
    db.exec(`INSERT INTO food_items_cache (id, brand) VALUES ('f1', 'Own Offline'), ('f2', 'Stranger');`);
    db.exec(`INSERT INTO medication_items_cache (id, generic_name) VALUES ('m1', 'own-offline'), ('m2', 'stranger');`);
    db.exec(`INSERT INTO meals (id, food_item_id, synced) VALUES ('meal1', 'f1', 0);`);
    db.exec(`INSERT INTO medication_administrations (id, medication_item_id, synced) VALUES ('dose1', 'm1', 0);`);

    const flushed = await flushLegacyCatalogCachesIfNeeded(asyncAdapter(db));

    expect(flushed).toBe(true);
    const foodIds = (db.prepare('SELECT id FROM food_items_cache ORDER BY id').all() as { id: string }[]).map((r) => r.id);
    const medIds = (db.prepare('SELECT id FROM medication_items_cache ORDER BY id').all() as { id: string }[]).map((r) => r.id);
    expect(foodIds).toEqual(['f1']); // pending-referenced own row survives; stranger dropped
    expect(medIds).toEqual(['m1']);
    db.close();
  });

  it('does NOT preserve a row referenced only by an already-SYNCED write (server re-supplies it)', async () => {
    const db = freshDb();
    db.exec(`INSERT INTO food_items_cache (id, brand) VALUES ('f1', 'Own Synced');`);
    // synced=1 → the food is already on the server, so the flush may drop it; the
    // next refreshFoodCache re-pulls it (it's account-owned, passes the .eq filter).
    db.exec(`INSERT INTO meals (id, food_item_id, synced) VALUES ('meal1', 'f1', 1);`);

    await flushLegacyCatalogCachesIfNeeded(asyncAdapter(db));

    expect(counts(db).foods).toBe(0);
    db.close();
  });

  it('also honours a pending feeding_arrangement / medication regimen reference', async () => {
    const db = freshDb();
    db.exec(`INSERT INTO food_items_cache (id, brand) VALUES ('f1', 'Arrangement Food');`);
    db.exec(`INSERT INTO medication_items_cache (id, generic_name) VALUES ('m1', 'regimen-drug');`);
    db.exec(`INSERT INTO feeding_arrangements (id, food_item_id, synced) VALUES ('arr1', 'f1', 0);`);
    db.exec(`INSERT INTO medications (id, medication_item_id, synced) VALUES ('reg1', 'm1', 0);`);

    await flushLegacyCatalogCachesIfNeeded(asyncAdapter(db));

    expect(counts(db)).toEqual({ foods: 1, meds: 1 });
    db.close();
  });
});
