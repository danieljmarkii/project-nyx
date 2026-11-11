// CUL-2704 — a food capture's photos taken offline upload on their own once there is a
// connection, and nothing names them until they have.
//
// Drives the production drain (lib/sync.ts syncPendingFoodPhotos, the same drain the
// medicine label queue runs) and the capture's queue write (lib/captureUploads.ts) over
// the runtime schema in node:sqlite, against an emulated server: `food_items` takes the
// ignoreDuplicates pre-sync and the drain's compare-and-set photo_paths update, Storage is
// the mocked uploadPhoto, and the sign-out wipe is the real clearLocalData.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

type Row = Record<string, unknown>;

const mockLocal = { db: null as InstanceType<typeof DatabaseSync> | null };

const mockServer = {
  items: new Map<string, Row>(),
  /** Food ids the server's RLS hides from this account: an update matches no row. */
  hidden: new Set<string>(),
  /** Food ids the server lets this account read but refuses to update. */
  refused: new Set<string>(),
  updates: [] as { id: string; patch: Row; expected: unknown }[],
};

// PostgREST's text[] literal, as the drain sends it, parsed back to an array.
function parseLiteral(lit: string): string[] {
  const inner = lit.slice(1, -1);
  if (inner === '') return [];
  return inner.split(',').map((e) => JSON.parse(e) as string);
}

function mockServerFrom(table: string) {
  if (table !== 'food_items') throw new Error(`unexpected table ${table}`);
  return {
    upsert: async (payload: Row[], opts: { ignoreDuplicates?: boolean }) => {
      for (const row of payload) {
        const id = String(row.id);
        if (mockServer.items.has(id) && opts.ignoreDuplicates) continue;
        mockServer.items.set(id, { photo_paths: [], ...row });
      }
      return { error: null };
    },
    select: () => ({
      eq: (_col: string, id: string) => ({
        maybeSingle: async () => {
          const row = mockServer.items.get(id);
          if (!row || mockServer.hidden.has(id)) return { data: null, error: null };
          return { data: { photo_paths: row.photo_paths }, error: null };
        },
      }),
    }),
    update: (patch: Row) => {
      const filters: [string, unknown][] = [];
      const chain = {
        eq: (col: string, value: unknown) => { filters.push([col, value]); return chain; },
        select: async () => {
          const id = String(filters.find(([c]) => c === 'id')?.[1]);
          const expected = filters.find(([c]) => c === 'photo_paths')?.[1];
          mockServer.updates.push({ id, patch, expected });
          const row = mockServer.items.get(id);
          if (!row || mockServer.hidden.has(id) || mockServer.refused.has(id)) return { data: [], error: null };
          if (typeof expected === 'string'
            && JSON.stringify(parseLiteral(expected)) !== JSON.stringify(row.photo_paths)) {
            return { data: [], error: null };
          }
          Object.assign(row, patch);
          return { data: [{ id }], error: null };
        },
      };
      return chain;
    },
  };
}

function mockAdapter() {
  const db = () => {
    if (!mockLocal.db) throw new Error('no local database');
    return mockLocal.db;
  };
  return {
    runAsync: async (sql: string, params: unknown[] = []) => {
      const r = db().prepare(sql).run(...(params as never[]));
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    getAllAsync: async (sql: string, params: unknown[] = []) => db().prepare(sql).all(...(params as never[])),
    getFirstAsync: async (sql: string, params: unknown[] = []) =>
      db().prepare(sql).get(...(params as never[])) ?? null,
    execAsync: async (sql: string) => {
      db().exec(sql);
    },
  };
}

const mockUploadPhoto = jest.fn();
const mockCompress = jest.fn();
const mockRemove = jest.fn(async (_paths: string[]) => ({ error: null }));

jest.mock('expo-sqlite', () => ({ openDatabaseSync: () => mockAdapter() }));
jest.mock('./supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
    from: (table: string) => mockServerFrom(table),
    storage: { from: () => ({ remove: (paths: string[]) => mockRemove(paths) }) },
  },
}));
jest.mock('./storage', () => ({
  ...jest.requireActual('./storage'),
  uploadPhoto: (...args: unknown[]) => mockUploadPhoto(...args),
  compressForUpload: (...args: unknown[]) => mockCompress(...args),
  // The durable copy is a filesystem move; here it keeps the name it was given.
  persistCapture: (uri: string) => uri,
}));

import { BASE_SCHEMA_SQL, applyColumnUpgrades } from './localSchema';
import { MEDICATION_SCHEMA_SQL } from './medications';
import { DIET_TRIAL_SCHEMA_SQL } from './dietTrialMirror';
import { NOTIFICATION_SCHEMA_SQL } from './notificationPreferences';
import { MAX_SYNC_ATTEMPTS } from './syncQueue';
import { FOOD_PHOTOS_BUCKET } from './storage';
import { queuedFoodPhotoPath, type FoodPhotoSlot } from './captureUploads';
import { queueFoodPhotoUpload } from './foodPhotoQueue';
import { LOCAL_WIPE_TABLES } from './hydration';
import { notifySignedOut, pgTextArrayLiteral, syncPendingFoodPhotos } from './sync';

const FOOD = 'food-1';
const NOW = '2026-11-11T15:00:00.000Z';
const PATHS: Record<FoodPhotoSlot, string> = {
  front: queuedFoodPhotoPath(FOOD, 'front', 'aaaa1111'),
  ingredients: queuedFoodPhotoPath(FOOD, 'ingredients', 'bbbb2222'),
  barcode: queuedFoodPhotoPath(FOOD, 'barcode', 'cccc3333'),
};
// What the food page's replace writes: the slot's fixed key.
const REPLACED_FRONT = `${FOOD}/0-front.jpg`;

// storage-js's real error shapes (lib/syncQueue.ts classifyUploadFailure).
const OFFLINE = { __isStorageError: true, name: 'StorageUnknownError', message: 'Network request failed' };
const TOO_LARGE = { __isStorageError: true, name: 'StorageApiError', status: 413, message: 'Payload too large' };

const queueRow = (slot: FoodPhotoSlot) =>
  mockLocal.db!.prepare('SELECT * FROM food_photo_uploads WHERE food_item_id = ? AND slot = ?').get(FOOD, slot) as Row;
const cachePhoto = () =>
  (mockLocal.db!.prepare('SELECT photo_path FROM food_items_cache WHERE id = ?').get(FOOD) as Row).photo_path;
const serverPaths = () => mockServer.items.get(FOOD)?.photo_paths;

/** What capture's save leaves behind offline: the food in the cache with no photo, and
 *  each photo in the queue. */
async function captureSavedOffline(
  slots: FoodPhotoSlot[] = ['front', 'ingredients', 'barcode'],
  owner = 'user-1',
): Promise<void> {
  mockLocal.db!.prepare(
    `INSERT INTO food_items_cache (id, brand, product_name, format, food_type, photo_path, cached_at)
     VALUES (?, 'Weruva', 'Duck Stew', 'wet_canned', 'meal', NULL, ?)`,
  ).run(FOOD, NOW);
  for (const slot of slots) {
    await queueFoodPhotoUpload(
      { runAsync: (sql, params) => mockAdapter().runAsync(sql, params) },
      {
        id: `q-${slot}`,
        foodItemId: FOOD,
        slot,
        ownerUserId: owner,
        localUri: `file:///cache/${slot}.jpg`,
        storagePath: PATHS[slot],
      },
      NOW,
    );
  }
}

beforeEach(async () => {
  mockLocal.db = new DatabaseSync(':memory:');
  for (const sql of [BASE_SCHEMA_SQL, MEDICATION_SCHEMA_SQL, DIET_TRIAL_SCHEMA_SQL, NOTIFICATION_SCHEMA_SQL]) {
    mockLocal.db.exec(sql);
  }
  await applyColumnUpgrades(async (sql) => mockLocal.db!.exec(sql));
  mockServer.items.clear();
  mockServer.hidden.clear();
  mockServer.refused.clear();
  mockServer.updates.length = 0;
  mockUploadPhoto.mockReset();
  mockCompress.mockReset();
  mockRemove.mockClear();
  mockCompress.mockResolvedValue('file:///compressed.jpg');
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  mockLocal.db?.close();
  mockLocal.db = null;
});

describe('an offline food capture, then a connection', () => {
  it('waits for free while offline, then uploads every photo and fills photo_paths front first', async () => {
    await captureSavedOffline();
    expect(queueRow('front')).toMatchObject({
      local_uri: 'file:///cache/front.jpg', storage_path: PATHS.front, owner_user_id: 'user-1', synced: 0,
    });

    // Still offline when the sync cycle runs: every upload throws a network error.
    mockUploadPhoto.mockRejectedValue(OFFLINE);
    await syncPendingFoodPhotos();
    for (const slot of ['front', 'ingredients', 'barcode'] as const) {
      expect(queueRow(slot)).toMatchObject({ synced: 0, sync_attempts: 0, sync_error: null });
    }
    expect(mockServer.updates).toHaveLength(0);
    expect(serverPaths()).toEqual([]);
    expect(cachePhoto()).toBeNull();

    // The connection is back; the next cycle runs the drain.
    mockUploadPhoto.mockReset();
    mockUploadPhoto.mockResolvedValue(undefined);
    await syncPendingFoodPhotos();

    for (const slot of ['front', 'ingredients', 'barcode'] as const) {
      expect(mockUploadPhoto).toHaveBeenCalledWith(
        FOOD_PHOTOS_BUCKET, PATHS[slot], 'file:///compressed.jpg', 'image/jpeg');
      expect(queueRow(slot)).toMatchObject({ synced: 1, sync_error: null });
    }
    // Re-encoded from the queued copy, never uploaded as the original.
    expect(mockCompress).toHaveBeenCalledWith('file:///cache/front.jpg');
    expect(serverPaths()).toEqual([PATHS.front, PATHS.ingredients, PATHS.barcode]);
    expect(cachePhoto()).toBe(PATHS.front);

    // Landed photos are not sent again.
    mockUploadPhoto.mockClear();
    await syncPendingFoodPhotos();
    expect(mockUploadPhoto).not.toHaveBeenCalled();
  });

  it('keeps the front first when it lands after another slot', async () => {
    await captureSavedOffline(['ingredients']);
    await queueFoodPhotoUpload(
      { runAsync: (sql, params) => mockAdapter().runAsync(sql, params) },
      { id: 'q-front-late', foodItemId: FOOD, slot: 'front', ownerUserId: 'user-1',
        localUri: 'file:///cache/front.jpg', storagePath: PATHS.front },
      '2026-11-11T16:00:00.000Z',
    );
    mockUploadPhoto.mockResolvedValue(undefined);
    await syncPendingFoodPhotos();
    expect(serverPaths()).toEqual([PATHS.front, PATHS.ingredients]);
    expect(cachePhoto()).toBe(PATHS.front);
  });

  it('adds to what the row already lists rather than replacing it', async () => {
    // The capture's own photo_paths write listed the front that did upload.
    const uploadedFront = `${FOOD}/0-front.jpg`;
    await captureSavedOffline(['ingredients']);
    mockServer.items.set(FOOD, { id: FOOD, brand: 'Weruva', photo_paths: [uploadedFront] });
    mockUploadPhoto.mockResolvedValue(undefined);
    await syncPendingFoodPhotos();
    expect(serverPaths()).toEqual([uploadedFront, PATHS.ingredients]);
    // The write was a compare-and-set on the list it read.
    expect(mockServer.updates[0].expected).toBe(pgTextArrayLiteral([uploadedFront]));
  });

  it('pre-syncs the food row itself, so photos whose save never reached the server still land', async () => {
    await captureSavedOffline(['front']);
    mockUploadPhoto.mockResolvedValue(undefined);
    expect(mockServer.items.has(FOOD)).toBe(false);
    await syncPendingFoodPhotos();
    expect(mockServer.items.get(FOOD)).toMatchObject({ id: FOOD, brand: 'Weruva', photo_paths: [PATHS.front] });
  });

  it('never overwrites the owner-confirmed fields: only photo_paths is sent', async () => {
    await captureSavedOffline(['front']);
    mockServer.items.set(FOOD, { id: FOOD, brand: 'Weruva', product_name: 'Duck Stew', photo_paths: [] });
    mockUploadPhoto.mockResolvedValue(undefined);
    await syncPendingFoodPhotos();
    expect(mockServer.updates.map((u) => u.patch)).toEqual([{ photo_paths: [PATHS.front] }]);
    expect(mockServer.items.get(FOOD)?.product_name).toBe('Duck Stew');
  });
});

describe('what the queue never claims', () => {
  it('an update that matched no row (RLS-hidden or missing) is not marked, and costs an attempt', async () => {
    await captureSavedOffline(['front']);
    mockServer.hidden.add(FOOD);
    mockUploadPhoto.mockResolvedValue(undefined);
    await syncPendingFoodPhotos();
    expect(queueRow('front')).toMatchObject({ synced: 0, sync_attempts: 1 });
    expect(cachePhoto()).toBeNull();
  });

  it('an update refused on a visible row, with the list unchanged, costs an attempt and parks', async () => {
    // The row reads fine but the write never takes: without a cost this would re-upload
    // on every sync for ever.
    await captureSavedOffline(['front']);
    mockServer.items.set(FOOD, { id: FOOD, brand: 'Weruva', photo_paths: [] });
    mockServer.refused.add(FOOD);
    mockUploadPhoto.mockResolvedValue(undefined);
    await syncPendingFoodPhotos();
    expect(queueRow('front')).toMatchObject({ synced: 0, sync_attempts: 1 });
    for (let i = 1; i < MAX_SYNC_ATTEMPTS; i += 1) await syncPendingFoodPhotos();
    expect(queueRow('front').sync_error).not.toBeNull();
    expect(cachePhoto()).toBeNull();
  });

  it('a rejected update spends the budget and parks after the last attempt', async () => {
    await captureSavedOffline(['front']);
    mockServer.hidden.add(FOOD);
    mockUploadPhoto.mockResolvedValue(undefined);
    for (let i = 0; i < MAX_SYNC_ATTEMPTS; i += 1) await syncPendingFoodPhotos();
    expect(queueRow('front').synced).toBe(0);
    expect(queueRow('front').sync_error).not.toBeNull();
  });

  it('a permanent upload failure quarantines instead of retrying for ever', async () => {
    await captureSavedOffline(['front']);
    mockUploadPhoto.mockRejectedValue(TOO_LARGE);
    await syncPendingFoodPhotos();
    expect(queueRow('front').synced).toBe(0);
    expect(String(queueRow('front').sync_error)).toMatch(/^upload-413/);
  });

  it('a photo another account queued is never sent', async () => {
    await captureSavedOffline(['front'], 'user-2');
    mockUploadPhoto.mockResolvedValue(undefined);
    await syncPendingFoodPhotos();
    expect(mockUploadPhoto).not.toHaveBeenCalled();
    expect(mockServer.updates).toHaveLength(0);
    expect(queueRow('front')).toMatchObject({ synced: 0, sync_error: 'photo belongs to another account' });
  });

  it('a photo that cannot be re-encoded is never sent as the original (EXIF), and spends the budget', async () => {
    await captureSavedOffline(['front']);
    mockCompress.mockRejectedValue(new Error('could not decode image'));
    mockUploadPhoto.mockResolvedValue(undefined);
    await syncPendingFoodPhotos();
    expect(mockUploadPhoto).not.toHaveBeenCalled();
    expect(queueRow('front')).toMatchObject({ synced: 0, sync_attempts: 1 });
  });

  it('a slot the server already fills wins: the queued photo is retired unsent', async () => {
    // The owner replaced the front on the food page before the queue drained.
    await captureSavedOffline(['front', 'ingredients']);
    mockServer.items.set(FOOD, { id: FOOD, brand: 'Weruva', photo_paths: [REPLACED_FRONT] });
    mockUploadPhoto.mockResolvedValue(undefined);
    await syncPendingFoodPhotos();
    expect(mockUploadPhoto).not.toHaveBeenCalledWith(FOOD_PHOTOS_BUCKET, PATHS.front, expect.anything(), expect.anything());
    expect(queueRow('front')).toMatchObject({ synced: 1 });
    // The other slot still fills.
    expect(serverPaths()).toEqual([REPLACED_FRONT, PATHS.ingredients]);
  });

  // nyx-food-photos grants no owner DELETE (046), and Storage refuses a remove there with
  // no error, so the drain never asks for one: it would only claim a removal that did
  // not happen. The lost photo stays in the owner's own prefix, named by no row.
  it('a replace that lands DURING the upload still wins, and the drain claims no removal', async () => {
    await captureSavedOffline(['front']);
    mockServer.items.set(FOOD, { id: FOOD, brand: 'Weruva', photo_paths: [] });
    mockUploadPhoto.mockImplementation(async (_bucket: string, key: string) => {
      expect(key).not.toBe(REPLACED_FRONT);
      mockServer.items.get(FOOD)!.photo_paths = [REPLACED_FRONT];
    });
    await syncPendingFoodPhotos();
    expect(serverPaths()).toEqual([REPLACED_FRONT]);
    expect(mockRemove).not.toHaveBeenCalled();
    expect(queueRow('front')).toMatchObject({ synced: 1, sync_attempts: 0 });
    expect(cachePhoto()).toBeNull();
  });

  it('a list that changed some other way during the upload costs nothing, and the next pass fills the slot', async () => {
    await captureSavedOffline(['front']);
    const added = `${FOOD}/3-additional.jpg`;
    mockServer.items.set(FOOD, { id: FOOD, brand: 'Weruva', photo_paths: [] });
    mockUploadPhoto.mockImplementationOnce(async () => {
      mockServer.items.get(FOOD)!.photo_paths = [added];
    });
    await syncPendingFoodPhotos();
    expect(queueRow('front')).toMatchObject({ synced: 0, sync_attempts: 0, sync_error: null });
    expect(mockRemove).not.toHaveBeenCalled();

    mockUploadPhoto.mockResolvedValue(undefined);
    await syncPendingFoodPhotos();
    expect(serverPaths()).toEqual([PATHS.front, added]);
    expect(queueRow('front')).toMatchObject({ synced: 1 });
  });

  it('a sign-out during the upload stops the pass before anything else is written', async () => {
    await captureSavedOffline(['front']);
    mockUploadPhoto.mockImplementation(async () => { notifySignedOut(); });
    await syncPendingFoodPhotos();
    expect(mockServer.updates).toHaveLength(0);
    expect(cachePhoto()).toBeNull();
    expect(queueRow('front')).toMatchObject({ synced: 0, sync_attempts: 0 });
  });

  it('a NULL inside the server\'s list never aborts the pass, and the row parks rather than loops', async () => {
    await captureSavedOffline(['front']);
    mockServer.items.set(FOOD, { id: FOOD, brand: 'Weruva', photo_paths: [null] });
    mockUploadPhoto.mockResolvedValue(undefined);
    await expect(syncPendingFoodPhotos()).resolves.toBeUndefined();
    expect(queueRow('front')).toMatchObject({ synced: 0, sync_attempts: 1 });
  });

  it('the sign-out wipe takes the queue with it', () => {
    expect(LOCAL_WIPE_TABLES).toContain('food_photo_uploads');
  });
});
