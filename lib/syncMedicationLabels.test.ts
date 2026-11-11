// CUL-1920 — a medicine label photographed offline uploads on its own once there is a
// connection, and nothing names it until it has.
//
// Drives the production drain (lib/sync.ts syncPendingMedicationLabels) and the capture's
// queue write (lib/medicationLabelQueue.ts) over the runtime schema in node:sqlite, against
// an emulated server: `medication_items` takes the dose push's ignoreDuplicates pre-sync and
// the drain's targeted photo_paths update, and Storage is the mocked uploadPhoto.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

type Row = Record<string, unknown>;

const mockLocal = { db: null as InstanceType<typeof DatabaseSync> | null };

const mockServer = {
  items: new Map<string, Row>(),
  /** Item ids the server's RLS hides from this account: an update matches no row. */
  hidden: new Set<string>(),
  updates: [] as { id: string; patch: Row }[],
};

function mockServerFrom(table: string) {
  if (table !== 'medication_items') throw new Error(`unexpected table ${table}`);
  return {
    // presyncMedicationItems: awaited directly, ignoreDuplicates.
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
    // The drain's update: `.eq('id', id)`, optionally `.eq('photo_paths', '{}')`.
    update: (patch: Row) => {
      const filters: [string, unknown][] = [];
      const chain = {
        eq: (col: string, value: unknown) => { filters.push([col, value]); return chain; },
        select: async () => {
          const id = String(filters.find(([c]) => c === 'id')?.[1]);
          mockServer.updates.push({ id, patch });
          const row = mockServer.items.get(id);
          if (!row || mockServer.hidden.has(id)) return { data: [], error: null };
          const onlyEmpty = filters.some(([c, v]) => c === 'photo_paths' && v === '{}');
          if (onlyEmpty && (row.photo_paths as string[]).length > 0) return { data: [], error: null };
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
import { buildMedicationPhotoPath, MEDICATION_PHOTOS_BUCKET } from './storage';
import { queueMedicationLabelUpload } from './medicationLabelQueue';
import { notifySignedOut, syncPendingMedicationLabels } from './sync';

const ITEM = 'item-1';
// A queued label has its own key (capture builds `0-label-<id>`); the detail screen's
// replace writes the slot's fixed key.
const PATH = buildMedicationPhotoPath('user-1', ITEM, '0-label-q1');
const REPLACED = buildMedicationPhotoPath('user-1', ITEM, '0-label');
const NOW = '2026-11-11T15:00:00.000Z';

// storage-js's real error shapes (lib/syncQueue.ts classifyUploadFailure).
const OFFLINE = { __isStorageError: true, name: 'StorageUnknownError', message: 'Network request failed' };
const TOO_LARGE = { __isStorageError: true, name: 'StorageApiError', status: 413, message: 'Payload too large' };

const queueRow = (id = ITEM) =>
  mockLocal.db!.prepare('SELECT * FROM medication_label_uploads WHERE id = ?').get(id) as Row;
const cachePhoto = (id = ITEM) =>
  (mockLocal.db!.prepare('SELECT photo_path FROM medication_items_cache WHERE id = ?').get(id) as Row).photo_path;

/** What capture's save leaves behind for an offline label: the drug in the cache with no
 *  photo, and the label in the queue. */
async function captureSavedOffline(id = ITEM, storagePath = PATH): Promise<void> {
  mockLocal.db!.prepare(
    `INSERT INTO medication_items_cache (id, generic_name, is_prescription, is_critical, photo_path, cached_at)
     VALUES (?, 'Prednisolone', 1, 0, NULL, ?)`,
  ).run(id, NOW);
  await queueMedicationLabelUpload(
    { runAsync: (sql, params) => mockAdapter().runAsync(sql, params) },
    { medicationItemId: id, localUri: `file:///docs/${id}-label.jpg`, storagePath },
    NOW,
  );
}

beforeEach(async () => {
  mockLocal.db = new DatabaseSync(':memory:');
  for (const sql of [BASE_SCHEMA_SQL, MEDICATION_SCHEMA_SQL, DIET_TRIAL_SCHEMA_SQL, NOTIFICATION_SCHEMA_SQL]) {
    mockLocal.db.exec(sql);
  }
  await applyColumnUpgrades(async (sql) => mockLocal.db!.exec(sql));
  mockServer.items.clear();
  mockServer.hidden.clear();
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

describe('an offline label, then a connection', () => {
  it('waits for free while offline, then uploads with no owner action and only then is named', async () => {
    await captureSavedOffline();
    expect(queueRow()).toMatchObject({ local_uri: `file:///docs/${ITEM}-label.jpg`, storage_path: PATH, synced: 0 });

    // Still offline when the sync cycle runs: the upload throws a network error.
    mockUploadPhoto.mockRejectedValue(OFFLINE);
    await syncPendingMedicationLabels();
    expect(queueRow()).toMatchObject({ synced: 0, sync_attempts: 0, sync_error: null });
    expect(mockServer.updates).toHaveLength(0);
    expect(mockServer.items.get(ITEM)?.photo_paths).toEqual([]);
    expect(cachePhoto()).toBeNull();

    // The connection is back; the next cycle (reconnect or foreground) runs the drain.
    mockUploadPhoto.mockReset();
    mockUploadPhoto.mockResolvedValue(undefined);
    await syncPendingMedicationLabels();

    expect(mockUploadPhoto).toHaveBeenCalledWith(
      MEDICATION_PHOTOS_BUCKET, PATH, 'file:///compressed.jpg', 'image/jpeg');
    expect(mockServer.items.get(ITEM)?.photo_paths).toEqual([PATH]);
    expect(cachePhoto()).toBe(PATH);
    expect(queueRow()).toMatchObject({ synced: 1, sync_error: null });

    // A landed label is not sent again.
    mockUploadPhoto.mockClear();
    await syncPendingMedicationLabels();
    expect(mockUploadPhoto).not.toHaveBeenCalled();
  });

  it('pre-syncs the drug row itself, so a label whose save never reached the server still lands', async () => {
    await captureSavedOffline();
    mockUploadPhoto.mockResolvedValue(undefined);
    expect(mockServer.items.has(ITEM)).toBe(false);
    await syncPendingMedicationLabels();
    expect(mockServer.items.get(ITEM)).toMatchObject({ id: ITEM, generic_name: 'Prednisolone', photo_paths: [PATH] });
  });

  it('never overwrites the owner-confirmed fields: only photo_paths is sent', async () => {
    await captureSavedOffline();
    mockServer.items.set(ITEM, { id: ITEM, generic_name: 'Prednisolone', strength: '5 mg', photo_paths: [] });
    mockUploadPhoto.mockResolvedValue(undefined);
    await syncPendingMedicationLabels();
    expect(mockServer.updates).toEqual([{ id: ITEM, patch: { photo_paths: [PATH] } }]);
    expect(mockServer.items.get(ITEM)?.strength).toBe('5 mg');
  });
});

describe('what the queue never claims', () => {
  it('an update that matched no row (RLS-hidden or missing) is not marked, and costs an attempt', async () => {
    await captureSavedOffline();
    mockServer.hidden.add(ITEM);
    mockUploadPhoto.mockResolvedValue(undefined);
    await syncPendingMedicationLabels();
    expect(queueRow()).toMatchObject({ synced: 0, sync_attempts: 1 });
    expect(cachePhoto()).toBeNull();
  });

  it('a permanent upload failure quarantines instead of retrying for ever', async () => {
    await captureSavedOffline();
    mockUploadPhoto.mockRejectedValue(TOO_LARGE);
    await syncPendingMedicationLabels();
    const row = queueRow();
    expect(row.synced).toBe(0);
    expect(String(row.sync_error)).toMatch(/^upload-413/);
    expect(cachePhoto()).toBeNull();
  });

  it('a label under another account\'s prefix is never sent', async () => {
    const foreign = buildMedicationPhotoPath('user-2', 'item-2', '0-label');
    await captureSavedOffline('item-2', foreign);
    mockUploadPhoto.mockResolvedValue(undefined);
    await syncPendingMedicationLabels();
    expect(mockUploadPhoto).not.toHaveBeenCalled();
    expect(mockServer.updates).toHaveLength(0);
    expect(queueRow('item-2')).toMatchObject({ synced: 0, sync_error: 'label belongs to another account' });
  });

  it('a rejected update spends the budget and parks after the last attempt', async () => {
    await captureSavedOffline();
    mockServer.hidden.add(ITEM);
    mockUploadPhoto.mockResolvedValue(undefined);
    for (let i = 0; i < MAX_SYNC_ATTEMPTS; i += 1) await syncPendingMedicationLabels();
    const row = queueRow();
    expect(row.synced).toBe(0);
    expect(row.sync_error).not.toBeNull();
  });

  it('a label the server already holds wins: the queued one is retired unsent', async () => {
    // The owner replaced the label on the detail screen (here or on another phone)
    // before the queue drained. Same key, same column: sending the queued photo would
    // put the older capture back over the owner's choice.
    await captureSavedOffline();
    mockServer.items.set(ITEM, { id: ITEM, generic_name: 'Prednisolone', photo_paths: [REPLACED] });
    mockUploadPhoto.mockResolvedValue(undefined);
    await syncPendingMedicationLabels();
    expect(mockUploadPhoto).not.toHaveBeenCalled();
    expect(mockServer.updates).toHaveLength(0);
    expect(queueRow()).toMatchObject({ synced: 1 });
  });

  it('a label that cannot be re-encoded is never sent as the original (EXIF), and spends the budget', async () => {
    await captureSavedOffline();
    mockCompress.mockRejectedValue(new Error('could not decode image'));
    mockUploadPhoto.mockResolvedValue(undefined);
    await syncPendingMedicationLabels();
    expect(mockUploadPhoto).not.toHaveBeenCalled();
    expect(queueRow()).toMatchObject({ synced: 0, sync_attempts: 1 });
  });

  it('a second save of the same drug keeps one queued label, the newest', async () => {
    await captureSavedOffline();
    await queueMedicationLabelUpload(
      { runAsync: (sql, params) => mockAdapter().runAsync(sql, params) },
      { medicationItemId: ITEM, localUri: 'file:///docs/retake.jpg', storagePath: PATH },
      NOW,
    );
    const rows = mockLocal.db!.prepare('SELECT local_uri FROM medication_label_uploads').all() as Row[];
    expect(rows).toEqual([{ local_uri: 'file:///docs/retake.jpg' }]);
  });

  it('a sign-out during the upload stops the pass before anything else is written', async () => {
    await captureSavedOffline();
    mockUploadPhoto.mockImplementation(async () => { notifySignedOut(); });
    await syncPendingMedicationLabels();
    expect(mockServer.updates).toHaveLength(0);
    expect(cachePhoto()).toBeNull();
    expect(queueRow()).toMatchObject({ synced: 0, sync_attempts: 0 });
  });

  it('a replace that lands DURING the upload still wins, and the queued object is taken back', async () => {
    // The drain read an empty slot; the owner replaced the label while the queued
    // upload was in flight. The queued upload has its own key, so it overwrote
    // nothing, and the update applies only to an empty slot, so it changes nothing.
    await captureSavedOffline();
    mockServer.items.set(ITEM, { id: ITEM, generic_name: 'Prednisolone', photo_paths: [] });
    mockUploadPhoto.mockImplementation(async (_bucket: string, key: string) => {
      expect(key).not.toBe(REPLACED);
      mockServer.items.get(ITEM)!.photo_paths = [REPLACED];
    });
    await syncPendingMedicationLabels();
    expect(mockServer.items.get(ITEM)?.photo_paths).toEqual([REPLACED]);
    expect(mockRemove).toHaveBeenCalledWith([PATH]);
    expect(queueRow()).toMatchObject({ synced: 1, sync_attempts: 0 });
    expect(cachePhoto()).toBeNull();
  });
});
