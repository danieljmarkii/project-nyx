// CUL-639 — a removed log's photo is deleted, not orphaned (PM ruling (a), 2026-10-12).
//
// The rule rests on SQL more than on control flow: the queue's purge selects "an
// UNSYNCED photo whose event is deleted", the push selects only a live log's photo,
// and the synced mark is ONE statement that refuses a removed log. A mock that
// pattern-matched those strings would be green over a JOIN that never matches, so
// this suite runs them against a real SQLite built from the shipped schema
// constants, and mocks only the network.

import { DatabaseSync } from 'node:sqlite';
import { BASE_SCHEMA_SQL } from './localSchema';

let mockSqlite: DatabaseSync;
type Param = string | number | null;
const mockAdapter = {
  getAllAsync: async (sql: string, params: Param[] = []) => mockSqlite.prepare(sql).all(...params),
  getFirstAsync: async (sql: string, params: Param[] = []) => mockSqlite.prepare(sql).get(...params) ?? null,
  runAsync: async (sql: string, params: Param[] = []) => {
    const r = mockSqlite.prepare(sql).run(...params);
    return { changes: Number(r.changes) };
  },
};
jest.mock('./db', () => ({
  getDb: () => mockAdapter,
  getWatermark: jest.fn(),
  setWatermark: jest.fn(),
  // The real one also deletes the on-device file; the row is what this suite reads.
  deleteEventAttachmentLocal: async (id: string) => {
    mockSqlite.prepare('DELETE FROM event_attachments WHERE id = ?').run(id);
  },
}));

const mockUpload = jest.fn();
jest.mock('./storage', () => ({
  uploadPhoto: (...a: unknown[]) => mockUpload(...a),
  compressForUpload: jest.fn(async (uri: string) => uri),
}));

// The server, as far as this suite needs one: which objects and rows exist.
const mockObjects = new Set<string>();
const mockRemoteRows = new Set<string>();
let mockStorageRemoveError: { message: string } | null = null;
let mockRowDeleteError: { message: string } | null = null;
// A hook a test sets to act (remove the log) at the moment the row goes up.
let mockOnUpsert: (() => void) | null = null;
jest.mock('./supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) },
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          if (mockStorageRemoveError) return { data: null, error: mockStorageRemoveError };
          paths.forEach((p) => mockObjects.delete(p));
          return { data: [], error: null };
        },
      }),
    },
    from: () => ({
      upsert: async (row: { id: string }) => {
        mockRemoteRows.add(row.id);
        mockOnUpsert?.();
        return { error: null };
      },
      delete: () => ({
        eq: async (_col: string, id: string) => {
          if (mockRowDeleteError) return { error: mockRowDeleteError };
          mockRemoteRows.delete(id);
          return { error: null };
        },
      }),
    }),
  },
}));

import { syncPendingAttachments, ensureEventAttachmentsSynced } from './sync';
import {
  attachmentStillWanted,
  markAttachmentSyncedIfLive,
  queueRemovedLogPhotosForPurge,
  withUploadInFlight,
} from './attachments';

const PATH = 'p1/e1/a1.jpg';

function seed({ deleted = false, synced = 0, syncError = null as string | null } = {}) {
  mockSqlite.prepare(
    `INSERT INTO events (id, pet_id, event_type, occurred_at, deleted_at)
     VALUES ('e1', 'p1', 'vomit', '2026-10-13T10:00:00.000Z', ?)`,
  ).run(deleted ? '2026-10-13T10:00:04.000Z' : null);
  mockSqlite.prepare(
    `INSERT INTO event_attachments (id, event_id, pet_id, local_uri, storage_path, synced, sync_error)
     VALUES ('a1', 'e1', 'p1', 'file:///a1.jpg', ?, ?, ?)`,
  ).run(PATH, synced, syncError);
}
const removeLog = () =>
  mockSqlite.prepare("UPDATE events SET deleted_at = '2026-10-13T10:00:04.000Z' WHERE id = 'e1'").run();
const localRow = () =>
  mockSqlite.prepare("SELECT synced FROM event_attachments WHERE id = 'a1'").get() as { synced: number } | undefined;

beforeEach(() => {
  mockSqlite = new DatabaseSync(':memory:');
  mockSqlite.exec(BASE_SCHEMA_SQL);
  mockObjects.clear();
  mockRemoteRows.clear();
  mockStorageRemoveError = null;
  mockRowDeleteError = null;
  mockOnUpsert = null;
  mockUpload.mockReset().mockImplementation(async (_b: string, path: string) => { mockObjects.add(path); });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  mockSqlite.close();
  jest.restoreAllMocks();
});

describe('the synced mark refuses a removed log, in one statement', () => {
  it('marks a live log’s photo', async () => {
    seed();
    expect(await markAttachmentSyncedIfLive(mockAdapter as never, 'a1')).toBe(true);
    expect(localRow()?.synced).toBe(1);
  });

  it('does not mark a removed log’s photo, and says so', async () => {
    seed({ deleted: true });
    expect(await markAttachmentSyncedIfLive(mockAdapter as never, 'a1')).toBe(false);
    expect(localRow()?.synced).toBe(0);
  });
});

describe('attachmentStillWanted', () => {
  it('is true for a live log, false once removed, false once the row is gone', async () => {
    seed();
    expect(await attachmentStillWanted('a1')).toBe(true);
    removeLog();
    expect(await attachmentStillWanted('a1')).toBe(false);
    expect(await attachmentStillWanted('missing')).toBe(false);
  });

  it('a read that throws answers true: a guess must never delete a live log\u2019s photo', async () => {
    seed();
    mockSqlite.close(); // every statement now throws
    expect(await attachmentStillWanted('a1')).toBe(true);
    mockSqlite = new DatabaseSync(':memory:'); // for afterEach's close
  });
});

describe('the photo queue (drainEventAttachmentsQueue)', () => {
  it('pushes a live log’s photo exactly as before', async () => {
    seed();
    await syncPendingAttachments();
    expect(mockObjects.has(PATH)).toBe(true);
    expect(mockRemoteRows.has('a1')).toBe(true);
    expect(localRow()?.synced).toBe(1);
  });

  it('never uploads a removed log’s photo, and deletes it from the phone', async () => {
    // The offline case from the issue: logged and removed with no network, then
    // reconnect. Before CUL-639 this pushed the photo after the tombstone.
    seed({ deleted: true });
    await syncPendingAttachments();
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockObjects.size).toBe(0);
    expect(mockRemoteRows.size).toBe(0);
    expect(localRow()).toBeUndefined();
  });

  it('purges a quarantined photo of a removed log too: removal is owed regardless', async () => {
    seed({ deleted: true, syncError: 'upload-413: too large' });
    mockObjects.add(PATH); // an earlier upload landed before its row failed
    await syncPendingAttachments();
    expect(mockObjects.size).toBe(0);
    expect(localRow()).toBeUndefined();
  });

  it('offline purge keeps the local row, so the next cycle tries again', async () => {
    seed({ deleted: true });
    mockObjects.add(PATH);
    mockStorageRemoveError = { message: 'Network request failed' };
    await syncPendingAttachments();
    expect(localRow()).toBeDefined();
    expect(mockObjects.has(PATH)).toBe(true);
    // The row the purge could not finish is still unsynced, and the push must not
    // take it for a live log's photo: the push's own filter is what holds here.
    expect(mockUpload).not.toHaveBeenCalled();

    mockStorageRemoveError = null;
    await syncPendingAttachments();
    expect(mockObjects.size).toBe(0);
    expect(localRow()).toBeUndefined();
  });

  it('a failed remote row delete also keeps the local row for the retry', async () => {
    seed({ deleted: true });
    mockRemoteRows.add('a1');
    mockRowDeleteError = { message: 'Network request failed' };
    await syncPendingAttachments();
    expect(localRow()).toBeDefined();
    expect(mockRemoteRows.has('a1')).toBe(true);
  });

  it('a log removed while its row went up: takes back down what it put up', async () => {
    // The race the one-statement mark exists for: the push selected a live log,
    // and the owner removed it between the upload and the mark.
    seed();
    mockOnUpsert = removeLog;
    await syncPendingAttachments();
    expect(mockObjects.size).toBe(0);
    expect(mockRemoteRows.size).toBe(0);
    expect(localRow()).toBeUndefined();
  });

  it('leaves an uploaded photo of a log removed from the event screen alone', async () => {
    // Ruling (a): only Undo and in-flight uploads delete. A synced photo whose log
    // was removed elsewhere stays, so Recently deleted (CUL-707) can restore it.
    seed({ deleted: true, synced: 1 });
    mockObjects.add(PATH);
    mockRemoteRows.add('a1');
    await syncPendingAttachments();
    expect(mockObjects.has(PATH)).toBe(true);
    expect(mockRemoteRows.has('a1')).toBe(true);
    expect(localRow()?.synced).toBe(1);
  });
});

describe('the privacy review’s findings (CUL-639 F1, F3)', () => {
  it('F3: a photo whose upload chain is running is left to the chain, and retried after', async () => {
    // Purging it mid-upload would delete the local row, leaving the chain's own
    // clean-up of the object it is about to land one try with nothing to retry from.
    seed({ deleted: true });
    await withUploadInFlight('a1', async () => {
      await syncPendingAttachments();
      expect(localRow()).toBeDefined();
    });
    // The chain is over and the row is still here (its purge failed, say): the
    // next cycle finishes it.
    await syncPendingAttachments();
    expect(localRow()).toBeUndefined();
  });
});

describe('Undo re-queues its photo, and the queue deletes it', () => {
  it('an uploaded photo of an undone log is deleted from the server and the phone', async () => {
    seed({ synced: 1 });
    mockObjects.add(PATH);
    mockRemoteRows.add('a1');
    removeLog(); // the reversal's soft delete runs first
    await queueRemovedLogPhotosForPurge('e1');
    await syncPendingAttachments();
    expect(mockObjects.size).toBe(0);
    expect(mockRemoteRows.size).toBe(0);
    expect(localRow()).toBeUndefined();
  });

  it('re-queues with a cleared quarantine, so the purge is not mistaken for a stuck push', async () => {
    seed({ synced: 1, syncError: 'old' });
    await queueRemovedLogPhotosForPurge('e1');
    const row = mockSqlite.prepare("SELECT synced, sync_error, sync_attempts FROM event_attachments WHERE id = 'a1'").get();
    expect(row).toEqual({ synced: 0, sync_error: null, sync_attempts: 0 });
  });
});

describe('ensureEventAttachmentsSynced (ahead of every per-incident read)', () => {
  it('does not re-upload a removed log’s photo', async () => {
    seed({ deleted: true, synced: 1 });
    await ensureEventAttachmentsSynced('e1');
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockRemoteRows.size).toBe(0);
  });

  it('F1: a log removed from the event screen during a read keeps its uploaded photo', async () => {
    // An old, synced photo is re-uploaded only because a read was asked for. The
    // owner removes the log meanwhile; ruling (a) keeps that photo for Recently
    // deleted (CUL-707), so the refused mark must not purge it.
    seed({ synced: 1 });
    mockObjects.add(PATH);
    mockRemoteRows.add('a1');
    mockOnUpsert = removeLog;
    await ensureEventAttachmentsSynced('e1');
    expect(mockObjects.has(PATH)).toBe(true);
    expect(mockRemoteRows.has('a1')).toBe(true);
    expect(localRow()).toBeDefined();
  });

  it('still re-uploads a live log’s photo', async () => {
    seed({ synced: 1 });
    await ensureEventAttachmentsSynced('e1');
    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockRemoteRows.has('a1')).toBe(true);
  });
});
