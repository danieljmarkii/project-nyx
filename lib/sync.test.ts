// Tests for prepareAttachmentUpload — the sync/ensure re-upload compression guard.
//
// Why this exists: ensureEventAttachmentsSynced force-re-uploads local_uri (the
// ORIGINAL, uncompressed capture) with upsert:true on every AI-analysis trigger.
// That path skipped compression, so it silently clobbered the compressed storage
// object with the multi-MB original — which then OOM'd analyze-vomit (a 546 memory
// kill) and left the AI read stuck on "Not enough to say… Try analysis". This guard
// compresses images before (re)upload while leaving non-images and already-remote
// rows untouched, and never blocks an upload on a compression failure.
//
// The same guard now also fronts the vet-attachment sync re-upload
// (syncPendingVetVisits), so the re-encode that strips a photo's EXIF/GPS metadata
// covers vet attachments too — the privacy-hardening sweep's shared-utility path.
// The vet case is the image/jpeg row asserted below (compressed + mime forced to jpeg).
//
// sync.ts pulls a heavy native import graph (supabase / expo-sqlite / expo), and
// ./supabase fail-fasts on missing env, so we stub every sibling module. The
// function under test only depends on compressForUpload. jest hoists jest.mock()
// above imports, so the control fn the factory closes over is mock-prefixed.

const mockCompress = jest.fn();
const mockGetSession = jest.fn();
const mockFrom = jest.fn();
const mockRunAsync = jest.fn();

jest.mock('./storage', () => ({
  uploadPhoto: jest.fn(),
  compressForUpload: (...args: unknown[]) => mockCompress(...args),
}));
jest.mock('./supabase', () => ({
  supabase: {
    auth: { getSession: (...args: unknown[]) => mockGetSession(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));
jest.mock('./db', () => ({
  getDb: () => ({ runAsync: (...args: unknown[]) => mockRunAsync(...args) }),
  getWatermark: jest.fn(),
  setWatermark: jest.fn(),
}));
jest.mock('./hydration', () => ({
  reconcileBatch: jest.fn(),
  advanceWatermark: jest.fn(),
  watermarkQueryFloor: jest.fn(),
  mealsToDeleteByAbsence: jest.fn(),
}));
jest.mock('./medications', () => ({
  medicationItemRowToRemote: jest.fn(),
  medicationRowToRemote: jest.fn(),
  administrationRowToRemote: jest.fn(),
}));

import { prepareAttachmentUpload, refreshFoodCache, refreshMedicationCache } from './sync';

describe('prepareAttachmentUpload (attachment re-upload compression guard)', () => {
  let warnSpy: jest.SpyInstance;
  beforeEach(() => {
    mockCompress.mockReset();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warnSpy.mockRestore());

  it('compresses a local image file and forces the mime to image/jpeg', async () => {
    mockCompress.mockResolvedValue('file:///compressed.jpg');
    const out = await prepareAttachmentUpload('file:///orig.jpg', 'image/jpeg');
    expect(mockCompress).toHaveBeenCalledWith('file:///orig.jpg');
    expect(out).toEqual({ uri: 'file:///compressed.jpg', mimeType: 'image/jpeg' });
  });

  it('passes a non-image (e.g. a vet-visit PDF) through untouched — never runs image ops', async () => {
    const out = await prepareAttachmentUpload('file:///scan.pdf', 'application/pdf');
    expect(mockCompress).not.toHaveBeenCalled();
    expect(out).toEqual({ uri: 'file:///scan.pdf', mimeType: 'application/pdf' });
  });

  it('passes an already-remote row (empty local_uri sentinel) through untouched', async () => {
    const out = await prepareAttachmentUpload('', 'image/jpeg');
    expect(mockCompress).not.toHaveBeenCalled();
    expect(out).toEqual({ uri: '', mimeType: 'image/jpeg' });
  });

  it('does not compress a non-file uri (e.g. content://) — manipulateAsync needs a file', async () => {
    const out = await prepareAttachmentUpload('content://media/123', 'image/jpeg');
    expect(mockCompress).not.toHaveBeenCalled();
    expect(out.uri).toBe('content://media/123');
  });

  it('falls back to the original when compression throws — a re-upload is never blocked', async () => {
    mockCompress.mockRejectedValue(new Error('manipulator failed'));
    const out = await prepareAttachmentUpload('file:///orig.jpg', 'image/jpeg');
    expect(out).toEqual({ uri: 'file:///orig.jpg', mimeType: 'image/jpeg' });
    expect(warnSpy).toHaveBeenCalled();
  });
});

// B-354 PR 2 (FR-5) — the catalog caches are pulled scoped to the account. Belt-
// and-braces with the per-account RLS: the SELECT must carry an explicit
// created_by_user_id filter so a client can never re-cache the whole catalog, and
// a missing session short-circuits the pull entirely.
describe('refreshFoodCache / refreshMedicationCache — per-account scoping (FR-5)', () => {
  let eqSpy: jest.Mock;
  let selectSpy: jest.Mock;

  beforeEach(() => {
    mockGetSession.mockReset();
    mockFrom.mockReset();
    mockRunAsync.mockReset();
    // supabase.from(t).select(cols).eq(col, val) — .eq is the awaited terminal.
    eqSpy = jest.fn().mockResolvedValue({ data: [], error: null });
    selectSpy = jest.fn().mockReturnValue({ eq: eqSpy });
    mockFrom.mockReturnValue({ select: selectSpy });
  });

  it('refreshFoodCache scopes the pull to the signed-in account', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-A' } } } });
    await refreshFoodCache();
    expect(mockFrom).toHaveBeenCalledWith('food_items');
    expect(eqSpy).toHaveBeenCalledWith('created_by_user_id', 'user-A');
    // B-005: archived_at must be pulled so archived rows stay cached (for the
    // future Archived section) and a Restore round-trips archived_at -> NULL.
    expect(selectSpy).toHaveBeenCalledWith(expect.stringContaining('archived_at'));
    // B-351: the multi-protein set must be pulled so the cache mirrors the full
    // exposure, not just the derived primary_protein.
    expect(selectSpy).toHaveBeenCalledWith(expect.stringContaining('proteins'));
  });

  it('refreshMedicationCache scopes the pull to the signed-in account', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-A' } } } });
    await refreshMedicationCache();
    expect(mockFrom).toHaveBeenCalledWith('medication_items');
    expect(eqSpy).toHaveBeenCalledWith('created_by_user_id', 'user-A');
  });

  it('both short-circuit with no session — never pull, never write', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    await refreshFoodCache();
    await refreshMedicationCache();
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRunAsync).not.toHaveBeenCalled();
  });

  // B-005 regression: the refreshFoodCache upsert gained `archived_at` in its
  // ON CONFLICT SET list. lib/sync.ts:520 documents the EXACT footgun this class of
  // change risks — an INSERT OR REPLACE (or a stray column in the SET) silently
  // nulls the LOCAL-ONLY `last_used_at`, resetting the recent-foods ordering with no
  // server column to re-hydrate it. This test runs the REAL SQL string + params
  // refreshFoodCache emits (captured from the mock, so a change to the production
  // upsert is exercised, not a copy) against a real SQLite: `archived_at` must be
  // written from the server value while `last_used_at` survives untouched.
  it('refreshFoodCache upsert writes archived_at but preserves the local-only last_used_at', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DatabaseSync } = require('node:sqlite');
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-A' } } } });
    eqSpy.mockResolvedValueOnce({
      data: [{
        id: 'f1', brand: 'Blue Buffalo', product_name: 'Wilderness',
        format: 'dry_kibble', food_type: 'meal', primary_protein: 'chicken',
        // B-351: the server's TEXT[] arrives as a JS array from PostgREST; the
        // upsert must encode it to the cache's JSON-text column, order intact.
        proteins: ['chicken', 'salmon'],
        is_novel_protein: false, is_grain_free: true, is_prescription: false,
        photo_paths: ['f1/0-front.jpg'], archived_at: '2026-07-17T00:00:00Z',
      }],
      error: null,
    });

    await refreshFoodCache();

    // The single upsert refreshFoodCache emitted for the row above.
    expect(mockRunAsync).toHaveBeenCalledTimes(1);
    const [sql, params] = mockRunAsync.mock.calls[0] as [string, unknown[]];

    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE food_items_cache (
      id TEXT PRIMARY KEY, brand TEXT, product_name TEXT, format TEXT,
      food_type TEXT, primary_protein TEXT, proteins TEXT, is_novel_protein INTEGER,
      is_grain_free INTEGER, is_prescription INTEGER, photo_path TEXT,
      last_used_at TEXT, archived_at TEXT, cached_at TEXT
    );`);
    // Pre-existing cached row: the user fed this food recently (last_used_at set),
    // it is NOT archived yet, and its metadata is stale — the state a sync must
    // reconcile without stomping the local recency stamp.
    db.exec(`INSERT INTO food_items_cache
      (id, brand, product_name, format, last_used_at, archived_at, cached_at)
      VALUES ('f1', 'Old Brand', 'Old Name', 'dry_kibble',
              '2026-01-01T00:00:00Z', NULL, '2026-01-01T00:00:00Z');`);

    db.prepare(sql).run(...(params as (string | number | null)[]));

    const row = db.prepare('SELECT * FROM food_items_cache WHERE id = ?').get('f1') as Record<string, unknown>;
    db.close();

    // archived_at pulled from the server (the food is now archived) …
    expect(row.archived_at).toBe('2026-07-17T00:00:00Z');
    // … the server-owned metadata refreshed …
    expect(row.brand).toBe('Blue Buffalo');
    expect(row.product_name).toBe('Wilderness');
    // … the B-351 protein set written as JSON text, order intact …
    expect(row.proteins).toBe('["chicken","salmon"]');
    // … and the LOCAL-ONLY last_used_at untouched (the footgun that must not regress).
    expect(row.last_used_at).toBe('2026-01-01T00:00:00Z');
  });
});
