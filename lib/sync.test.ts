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
const mockUploadPhoto = jest.fn();
const mockGetSession = jest.fn();
const mockFrom = jest.fn();
const mockRunAsync = jest.fn();
const mockGetAllAsync = jest.fn();
const mockGetFirstAsync = jest.fn();

jest.mock('./storage', () => ({
  uploadPhoto: (...args: unknown[]) => mockUploadPhoto(...args),
  compressForUpload: (...args: unknown[]) => mockCompress(...args),
}));
jest.mock('./supabase', () => ({
  supabase: {
    auth: { getSession: (...args: unknown[]) => mockGetSession(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));
jest.mock('./db', () => ({
  getDb: () => ({
    runAsync: (...args: unknown[]) => mockRunAsync(...args),
    getAllAsync: (...args: unknown[]) => mockGetAllAsync(...args),
    getFirstAsync: (...args: unknown[]) => mockGetFirstAsync(...args),
  }),
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

import { MAX_SYNC_ATTEMPTS } from './syncQueue';
import {
  markSynced,
  prepareAttachmentUpload,
  reapStalePendingFoods,
  reconcilePetWeightSnapshot,
  refreshFoodCache,
  refreshMedicationCache,
  syncPendingAttachments,
  syncPendingDietTrials,
  syncPendingDietTrialFoods,
  syncPendingEvents,
  syncPendingFeedingArrangements,
  syncPendingMeals,
  syncPendingVetDocuments,
  syncPendingVetVisits,
  syncPendingWeightChecks,
} from './sync';

// B-125 — the post-push `synced = 1` sweep every writer shares.
//
// The bug class this closes is structural rather than live: the seven writers
// each interpolated their own id list into `WHERE id IN (…)`, which is safe only
// because device-minted UUIDs cannot carry a quote. The tests below pin the two
// properties that make the query correct regardless of what the ids are — the
// ids travel as BOUND params, and the statement never grows past SQLite's
// variable ceiling — plus one real-SQLite execution so "bound" means the row
// actually updates, not just that the string looks right.
describe('markSynced (B-125)', () => {
  const fakeDb = { runAsync: (...args: unknown[]) => mockRunAsync(...args) } as never;

  beforeEach(() => {
    mockRunAsync.mockReset();
    mockRunAsync.mockResolvedValue(undefined);
  });

  it('binds the ids as params — no id is ever interpolated into the SQL', async () => {
    // A hostile id alongside two ordinary ones: the whole point of binding is
    // that the quote/`--` cannot reach the statement, so an id that WOULD break
    // the old interpolated form is the honest case to assert on.
    const ids = ['9f3b-0001', "9f3b'); DROP TABLE meals; --", '9f3b-0002'];
    await markSynced(fakeDb, 'meals', ids);

    expect(mockRunAsync).toHaveBeenCalledTimes(1);
    const [sql, params] = mockRunAsync.mock.calls[0] as [string, unknown[]];
    expect(sql.replace(/\s+/g, ' ')).toBe(
      'UPDATE meals SET synced = 1, sync_attempts = 0, sync_error = NULL WHERE id IN (?,?,?)',
    );
    expect(params).toEqual(ids);
    // The property that matters: no id fragment reaches the SQL at all.
    expect(sql).not.toMatch(/9f3b|DROP/);
  });

  it('chunks past SQLite\'s variable limit instead of emitting one huge statement', async () => {
    const ids = Array.from({ length: 950 }, (_, i) => `id-${i}`);
    await markSynced(fakeDb, 'events', ids);

    // 950 ids at a 400 chunk → 400 / 400 / 150, and every chunk stays under the
    // 999-variable ceiling an older SQLite build compiles with.
    const calls = mockRunAsync.mock.calls as [string, unknown[]][];
    expect(calls.map(([, p]) => p.length)).toEqual([400, 400, 150]);
    for (const [sql, params] of calls) {
      expect((sql.match(/\?/g) ?? []).length).toBe(params.length);
      expect(params.length).toBeLessThan(999);
    }
    // Every id is covered exactly once — chunking must not drop or duplicate a
    // row, or a pushed row stays queued forever (or a queued row is lost).
    expect(calls.flatMap(([, p]) => p as string[])).toEqual(ids);
  });

  it('is a no-op on an empty id list — never emits a `WHERE id IN ()`', async () => {
    await markSynced(fakeDb, 'vet_visits', []);
    expect(mockRunAsync).not.toHaveBeenCalled();
  });

  it('actually flips only the named rows, against a real SQLite', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE meals (
      id TEXT PRIMARY KEY,
      synced INTEGER NOT NULL DEFAULT 0,
      sync_attempts INTEGER NOT NULL DEFAULT 0,
      sync_error TEXT
    )`);
    // m1 carries a spent budget and a parked reason (B-398): a row that lands
    // must come back to a CLEAN slate, or a later single failure on an edited row
    // would quarantine it on the strength of history it already outlived.
    db.prepare(
      "INSERT INTO meals (id, synced, sync_attempts, sync_error) VALUES ('m1', 0, 24, '23503: parent missing')",
    ).run();
    for (const id of ['m2', 'm3']) {
      db.prepare('INSERT INTO meals (id, synced) VALUES (?, 0)').run(id);
    }

    // Run the real SQL + params markSynced emits (captured from the mock, so a
    // change to the production statement is exercised — not a copy of it).
    await markSynced(fakeDb, 'meals', ['m1', 'm3']);
    const [sql, params] = mockRunAsync.mock.calls[0] as [string, string[]];
    db.prepare(sql).run(...params);

    const rows = db
      .prepare('SELECT id, synced, sync_attempts, sync_error FROM meals ORDER BY id')
      .all() as { id: string; synced: number; sync_attempts: number; sync_error: string | null }[];
    expect(rows).toEqual([
      { id: 'm1', synced: 1, sync_attempts: 0, sync_error: null },
      { id: 'm2', synced: 0, sync_attempts: 0, sync_error: null },
      { id: 'm3', synced: 1, sync_attempts: 0, sync_error: null },
    ]);
    db.close();
  });
});

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
      last_used_at TEXT, archived_at TEXT,
      -- B-351 slice 4: the two D10 completeness arms the cache now mirrors.
      ingredients_notes TEXT, ai_extraction_confidence TEXT, cached_at TEXT
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

// ── B-451 — the shared food_items FK pre-sync (Pattern 6) ────────────────────
//
// Four writers push rows that FK to food_items, and every one of them has to
// guarantee the referenced food exists server-side first (the food may have been
// captured offline, so the FK target can live only in food_items_cache). They
// used to inline four copies of that block, and the drift was not hypothetical:
// B-351 had to add `proteins` carriage to each copy separately, and a copy that
// missed it silently flattens an offline-captured food's protein set to the
// server's '{}' default — invisible until an exposure query reads it back.
//
// So the assertion that matters is not "the helper works" but "all four callers
// emit the SAME payload". These tests drive each writer end-to-end through the
// real supabase call chain and compare the food_items upsert they produce.
describe('presyncFoodItems — one payload across all four callers (B-451)', () => {
  // The cache row as SQLite actually hands it back: booleans are INTEGER, the
  // protein set is JSON text. Both need transforming on the way to Postgres.
  const CACHE_ROW = {
    id: 'food-1', brand: 'Royal Canin', product_name: 'Hypoallergenic HP',
    format: 'dry_kibble', food_type: 'meal', primary_protein: 'hydrolysed soy',
    proteins: '["hydrolysed soy","chicken"]',
    is_novel_protein: 1, is_grain_free: 0, is_prescription: 1,
  };

  // What every caller must put on the wire for CACHE_ROW.
  const EXPECTED_PAYLOAD = {
    id: 'food-1', brand: 'Royal Canin', product_name: 'Hypoallergenic HP',
    format: 'dry_kibble', food_type: 'meal', primary_protein: 'hydrolysed soy',
    // The B-351 carriage — the column that drifted once already.
    proteins: ['hydrolysed soy', 'chicken'],
    is_novel_protein: true, is_grain_free: false, is_prescription: true,
    created_by_user_id: 'user-A',
  };

  const MEAL = {
    id: 'm1', event_id: 'e1', pet_id: 'p1', food_item_id: 'food-1',
    quantity: '1 cup', is_full_portion: 1, notes: null,
    created_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-01T00:00:00.000Z',
    intake_rating: 'finished', logged_via: 'app',
  };
  const ARRANGEMENT = {
    id: 'a1', pet_id: 'p1', food_item_id: 'food-1', method: 'free_fed',
    active_from: '2026-07-01', active_until: null, is_shared: 0, notes: null,
    deleted_at: null,
    created_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-01T00:00:00.000Z',
  };
  const TRIAL_ROW = {
    id: 't1', pet_id: 'p1', food_item_id: 'food-1', started_at: '2026-07-01',
    target_duration_days: 56, status: 'active', completed_at: null,
    vet_name: null, notes: null, food_label: 'RC HP', indication: 'skin',
    phase: 'elimination', outcome: null, outcome_notes: null, stopped_reason: null,
    ended_at: null, transition_started_at: null,
    created_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-01T00:00:00.000Z',
    synced: 0, sync_error: null,
  };
  const TRIAL_FOOD_ROW = {
    id: 'df1', diet_trial_id: 't1', pet_id: 'p1', food_item_id: 'food-1',
    role: 'primary_diet', food_label: 'RC HP dry', allowed_from: '2026-07-01',
    allowed_until: null, deleted_at: null,
    created_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-01T00:00:00.000Z',
    synced: 0, sync_error: null,
  };

  let foodUpsert: jest.Mock;
  let dependentUpsert: jest.Mock;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  // The dependent writers differ in call shape — meals/arrangements await the
  // upsert directly, the diet-trial pair chains .select('id') — so the stub is a
  // thenable that also carries .select. Real chain, both shapes, one stub.
  function dependentResult() {
    const p = Promise.resolve({ data: [], error: null }) as Promise<unknown> & {
      select: jest.Mock;
    };
    p.select = jest.fn().mockResolvedValue({ data: [], error: null });
    return p;
  }

  // The cache read is the only query that mentions food_items_cache; everything
  // else the writer asks for is its own push queue.
  function queueReturns(rows: unknown[], cache: unknown[] = [CACHE_ROW]) {
    mockGetAllAsync.mockImplementation((sql: string) =>
      Promise.resolve(String(sql).includes('food_items_cache') ? cache : rows),
    );
  }

  beforeEach(() => {
    mockGetSession.mockReset();
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-A' } } } });
    mockFrom.mockReset();
    mockRunAsync.mockReset();
    mockGetAllAsync.mockReset();
    foodUpsert = jest.fn().mockResolvedValue({ error: null });
    dependentUpsert = jest.fn().mockImplementation(() => dependentResult());
    mockFrom.mockImplementation((table: string) =>
      table === 'food_items' ? { upsert: foodUpsert } : { upsert: dependentUpsert },
    );
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  const CALLERS: [string, unknown[], () => Promise<void>][] = [
    ['syncPendingMeals', [MEAL], syncPendingMeals],
    ['syncPendingFeedingArrangements', [ARRANGEMENT], syncPendingFeedingArrangements],
    ['syncPendingDietTrials', [TRIAL_ROW], syncPendingDietTrials],
    ['syncPendingDietTrialFoods', [TRIAL_FOOD_ROW], syncPendingDietTrialFoods],
  ];

  it.each(CALLERS)(
    '%s pre-syncs food_items with the full payload — proteins carried, INTEGERs coerced',
    async (_name, rows, run) => {
      queueReturns(rows);
      await run();

      expect(mockFrom).toHaveBeenCalledWith('food_items');
      expect(foodUpsert).toHaveBeenCalledTimes(1);
      const [payload, opts] = foodUpsert.mock.calls[0] as [Record<string, unknown>[], unknown];
      expect(payload).toEqual([EXPECTED_PAYLOAD]);
      // ignoreDuplicates is load-bearing: the server row may be RICHER than the
      // cache (photo_paths / ai_extraction_* written by the capture path), so the
      // pre-sync must fill a gap, never clobber.
      expect(opts).toEqual({ onConflict: 'id', ignoreDuplicates: true });
      // Local-only cache columns must never reach the wire.
      expect(payload[0]).not.toHaveProperty('last_used_at');
      expect(payload[0]).not.toHaveProperty('cached_at');
    },
  );

  it.each(CALLERS)(
    '%s pre-syncs BEFORE the dependent upsert — the FK target lands first',
    async (_name, rows, run) => {
      const order: string[] = [];
      foodUpsert.mockImplementation(() => {
        order.push('food_items');
        return Promise.resolve({ error: null });
      });
      dependentUpsert.mockImplementation(() => {
        order.push('dependent');
        return dependentResult();
      });
      queueReturns(rows);
      await run();

      expect(order[0]).toBe('food_items');
      expect(order).toContain('dependent');
    },
  );

  it.each(CALLERS)(
    '%s still attempts the dependent upsert when the pre-sync fails (best-effort)',
    async (_name, rows, run) => {
      // A pre-sync failure is logged, not thrown. If the food genuinely is not
      // there the dependent upsert fails its own FK check (23503, non-terminal)
      // and stays queued — but if it IS there, a transient pre-sync blip must not
      // strand a perfectly pushable row for the cycle.
      foodUpsert.mockResolvedValue({ error: { message: 'network blip' } });
      queueReturns(rows);
      await run();

      expect(dependentUpsert).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('food_items pre-sync'),
        'network blip',
      );
    },
  );

  it.each(CALLERS)(
    '%s does not touch food_items when the cache has no matching row',
    async (_name, rows, run) => {
      // An id in the queue with nothing cached for it: emitting an empty upsert
      // would be a pointless round-trip on every cycle.
      queueReturns(rows, []);
      await run();
      expect(foodUpsert).not.toHaveBeenCalled();
      expect(dependentUpsert).toHaveBeenCalled();
    },
  );

  it('skips the pre-sync entirely for a meal with no food_item_id', async () => {
    // A quick-logged meal can carry a null food. The empty-id early return means
    // no cache read and no upsert at all — not a `WHERE id IN ()`.
    queueReturns([{ ...MEAL, food_item_id: null }]);
    await syncPendingMeals();

    expect(foodUpsert).not.toHaveBeenCalled();
    const cacheReads = mockGetAllAsync.mock.calls.filter(([sql]) =>
      String(sql).includes('food_items_cache'),
    );
    expect(cacheReads).toHaveLength(0);
  });

  it('de-duplicates food ids and binds them as params, never interpolated', async () => {
    // Three meals on the same food is the ordinary case (breakfast/lunch/dinner);
    // sending the id three times would be a wasted payload. And the id reaches
    // SQLite as a bound param — the markSynced (B-125) property, here too.
    queueReturns([MEAL, { ...MEAL, id: 'm2' }, { ...MEAL, id: 'm3' }]);
    await syncPendingMeals();

    const [sql, params] = mockGetAllAsync.mock.calls.find(([s]) =>
      String(s).includes('food_items_cache'),
    ) as [string, string[]];
    expect(sql).toContain('WHERE id IN (?)');
    expect(params).toEqual(['food-1']);
    expect(sql).not.toContain('food-1');
  });

  it('decodes an unhydrated NULL protein cache to [] — matching the column default', async () => {
    // Legacy rows cached before B-351 have proteins = NULL. Sending NULL would
    // violate the NOT NULL column; [] is what the server would have defaulted to.
    queueReturns([MEAL], [{ ...CACHE_ROW, proteins: null }]);
    await syncPendingMeals();

    const [payload] = foodUpsert.mock.calls[0] as [Record<string, unknown>[]];
    expect(payload[0].proteins).toEqual([]);
  });

  it.each(CALLERS)('%s never pre-syncs without a session (Pattern 4)', async (_name, rows, run) => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    queueReturns(rows);
    await run();
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

// ── B-417 PR 2 — the diet-trial push writers ─────────────────────────────────
//
// These two writers are the first in this repo to depart from the shared
// syncPending* shape, and both departures are behavioural, not stylistic:
//
//   • a landed-id SET COMPARISON instead of "no error ⟹ all rows landed" (an
//     RLS-blocked write returns SUCCESS WITH ZERO ROWS — the 009 trap), and
//   • a TERMINAL branch with per-row isolation, because migration 040's UNIQUE
//     active-trial index made a permanent push failure reachable for the first
//     time and the old shape would retry a doomed insert forever.
//
// Both are asserted here against the real mappers (lib/dietTrialMirror.ts is
// pure, so it is imported, not stubbed) and the real supabase call chain shape:
// supabase.from(t).upsert(rows, opts).select('id').
describe('syncPendingDietTrials / syncPendingDietTrialFoods (B-417 PR 2)', () => {
  let upsertSpy: jest.Mock;
  let selectSpy: jest.Mock;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  const TRIAL = {
    id: 't1', pet_id: 'p1', food_item_id: 'food-1', started_at: '2026-07-01',
    target_duration_days: 56, status: 'active', completed_at: null,
    vet_name: null, notes: null, food_label: 'RC HP', indication: 'skin',
    phase: 'elimination', outcome: null, outcome_notes: null, stopped_reason: null,
    ended_at: null, transition_started_at: null,
    created_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-01T00:00:00.000Z',
    synced: 0, sync_error: null,
  };

  const FOOD_ROW = {
    id: 'df1', diet_trial_id: 't1', pet_id: 'p1', food_item_id: 'food-1',
    role: 'primary_diet', food_label: 'RC HP dry', allowed_from: '2026-07-01',
    allowed_until: null, deleted_at: null,
    created_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-01T00:00:00.000Z',
    synced: 0, sync_error: null,
  };

  // The food_items pre-sync (Pattern 6) reads food_items_cache first; every test
  // returns [] for it so the pre-sync no-ops, then the queue rows.
  function queueReturns(rows: unknown[]) {
    mockGetAllAsync.mockImplementation((sql: string) =>
      Promise.resolve(sql.includes('food_items_cache') ? [] : rows),
    );
  }

  beforeEach(() => {
    mockGetSession.mockReset();
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-A' } } } });
    mockFrom.mockReset();
    mockRunAsync.mockReset();
    mockGetAllAsync.mockReset();
    selectSpy = jest.fn().mockResolvedValue({ data: [], error: null });
    upsertSpy = jest.fn().mockReturnValue({ select: selectSpy });
    mockFrom.mockReturnValue({ upsert: upsertSpy });
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('marks only the ids the server actually returned (RLS returns success-with-0-rows)', async () => {
    // The 009 trap: a write RLS silently filters comes back { data: [], error: null }.
    // Reading that as success is how a row gets flagged synced while absent
    // server-side, which is invisible until something downstream reads it back.
    queueReturns([TRIAL, { ...TRIAL, id: 't2' }]);
    selectSpy.mockResolvedValue({ data: [{ id: 't1' }], error: null });

    await syncPendingDietTrials();

    const marks = mockRunAsync.mock.calls.filter(([sql]) => String(sql).includes('synced = 1'));
    expect(marks).toHaveLength(1);
    expect(marks[0][1]).toEqual(['t1']); // t2 stays queued — it never landed
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('RLS-blocked'));
  });

  // ── B-417 PR 3: the ordered two-pass push ─────────────────────────────────
  //
  // Migration 040's UNIQUE partial index on diet_trials(pet_id) WHERE status =
  // 'active' means an ending trial and a starting one cannot both be active
  // server-side. A 23505 is TERMINAL here, so getting the order wrong does not
  // cost a retry — it permanently quarantines the trial the owner just created and
  // leaves them holding the one they just ended.

  const ENDED = {
    ...TRIAL, id: 't0', status: 'abandoned', ended_at: '2026-07-26',
    stopped_reason: 'refused',
  };

  it('pushes the ENDING trial before the starting one, in separate batches', async () => {
    queueReturns([TRIAL, ENDED]); // deliberately queued starting-first
    selectSpy.mockImplementation(() => Promise.resolve({ data: [{ id: 't0' }, { id: 't1' }], error: null }));

    await syncPendingDietTrials();

    // Two upserts on diet_trials, not one — and the ending row is in the first.
    const trialUpserts = upsertSpy.mock.calls.map(([rows]) => (rows as { id: string }[]).map((r) => r.id));
    expect(trialUpserts).toEqual([['t0'], ['t1']]);
  });

  it('HOLDS the starting trial when the ending one did not land', async () => {
    // The failure the ordering itself creates if the passes are not gated:
    // pushRows does NOT throw on a transient error (a flap, a 503, a
    // PGRST301 — none carry a terminal code), so an unconditional second pass
    // would send the new trial into a server where the old one is still active and
    // earn it a permanent 23505.
    queueReturns([TRIAL, ENDED]);
    selectSpy.mockResolvedValue({ data: [], error: { code: 'PGRST301', message: 'JWT expired' } });

    await syncPendingDietTrials();

    const trialUpserts = upsertSpy.mock.calls.map(([rows]) => (rows as { id: string }[]).map((r) => r.id));
    expect(trialUpserts).toEqual([['t0']]); // the starting row never went out
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('holding the starting rows'));
  });

  it('does not hold anything when there is no ending trial in the batch', async () => {
    queueReturns([TRIAL]);
    selectSpy.mockResolvedValue({ data: [{ id: 't1' }], error: null });
    await syncPendingDietTrials();
    expect(upsertSpy).toHaveBeenCalledTimes(1);
  });

  it('marks nothing synced when the whole batch is silently blocked — and spends an attempt', async () => {
    // Success-with-zero-rows: PostgREST returns { error: null } when a policy
    // filters the statement. The row is NOT on the server, so flagging it synced
    // would lose it silently (the 009 trap). B-398 adds the second half: the row
    // also spends one attempt, so a write that can never land stops being re-sent
    // for the life of the install instead of only "staying honestly queued".
    queueReturns([TRIAL]);
    selectSpy.mockResolvedValue({ data: [], error: null });
    await syncPendingDietTrials();

    expect(mockRunAsync.mock.calls.some(([sql]) => String(sql).includes('synced = 1'))).toBe(false);
    const bump = mockRunAsync.mock.calls.find(([sql]) =>
      String(sql).includes('sync_attempts = sync_attempts + 1'));
    expect(bump).toBeDefined();
    expect(bump![1]).toEqual([MAX_SYNC_ATTEMPTS, expect.stringContaining('42501'), 't1']);
  });

  it('quarantines a 23505 row instead of retrying it forever — and never flags it synced', async () => {
    // Two devices started a trial offline; this one lost the UNIQUE active-trial
    // race and can NEVER land. Stopping the retry is the point; lying about the
    // row's state would be the easy wrong fix.
    queueReturns([TRIAL]);
    selectSpy
      .mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'duplicate key value' } })
      .mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'duplicate key value' } });

    await syncPendingDietTrials();

    const quarantine = mockRunAsync.mock.calls.find(([sql]) => String(sql).includes('SET sync_error'));
    expect(quarantine).toBeDefined();
    expect(quarantine![1]).toEqual(['23505: duplicate key value', 't1']);
    // Never flagged synced — the row genuinely is not on the server.
    expect(mockRunAsync.mock.calls.some(([sql]) => String(sql).includes('synced = 1'))).toBe(false);
  });

  it('isolates a terminal batch so one doomed row cannot block the others', async () => {
    // The larger of the two harms: the batch is ONE upsert, so without isolation
    // a single un-landable trial keeps every other trial row queued forever.
    queueReturns([TRIAL, { ...TRIAL, id: 't2' }]);
    selectSpy
      .mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'dup' } }) // batch
      .mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'dup' } }) // t1 alone
      .mockResolvedValueOnce({ data: [{ id: 't2' }], error: null }); // t2 alone — lands

    await syncPendingDietTrials();

    expect(mockRunAsync).toHaveBeenCalledWith(
      expect.stringContaining('SET sync_error'),
      ['23505: dup', 't1'],
    );
    expect(mockRunAsync).toHaveBeenCalledWith(
      expect.stringContaining('synced = 1'),
      ['t2'],
    );
  });

  it('isolates on a non-terminal ROW rejection too, but never quarantines on the first', async () => {
    // CONTRACT CHANGE (B-398). This used to assert "no isolation on 23503" on the
    // grounds that an FK parent resolves next cycle anyway. That reasoning missed
    // the mixed batch, which is the common one: if t1's parent has landed and t2's
    // has not, the single upsert fails wholesale and t1 is blocked behind t2 —
    // every cycle, indefinitely, since the queue re-selects the same rows. So a
    // row-level rejection now isolates, and the cost is bounded: the rows that land
    // leave the queue, so the fan-out shrinks rather than repeating at scale.
    //
    // What must NOT change is that 23503 stays NON-terminal: it costs one attempt,
    // not a quarantine. Parking a trial on the first FK miss would strand a
    // perfectly good row for a reason that resolves on its own.
    queueReturns([TRIAL, { ...TRIAL, id: 't2' }]);
    selectSpy.mockResolvedValue({ data: null, error: { code: '23503', message: 'fk' } });

    await syncPendingDietTrials();

    expect(selectSpy).toHaveBeenCalledTimes(3); // the batch, then t1 and t2 alone
    // Both rows spent one attempt; NEITHER was parked outright.
    const bumps = mockRunAsync.mock.calls.filter(([sql]) =>
      String(sql).includes('sync_attempts = sync_attempts + 1'));
    expect(bumps.map(([, p]) => (p as unknown[])[2])).toEqual(['t1', 't2']);
    expect(
      mockRunAsync.mock.calls.some(
        ([sql]) => String(sql).includes('SET sync_error = ?') && !String(sql).includes('CASE'),
      ),
    ).toBe(false);
    expect(mockRunAsync.mock.calls.some(([sql]) => String(sql).includes('synced = 1'))).toBe(false);
  });

  it('does NOT isolate on a request-level failure — an expired JWT is not one row\'s fault', async () => {
    // PGRST301 is not a SQLSTATE: the request never reached row evaluation, so
    // every row failed for one reason that belongs to none of them. Isolating would
    // fire N single-row requests guaranteed to fail identically, and spending each
    // row an attempt would punish the innocent for the session's problem.
    queueReturns([TRIAL, { ...TRIAL, id: 't2' }]);
    selectSpy.mockResolvedValue({ data: null, error: { code: 'PGRST301', message: 'JWT expired' } });

    await syncPendingDietTrials();

    expect(selectSpy).toHaveBeenCalledTimes(1); // the batch only
    expect(mockRunAsync).not.toHaveBeenCalled(); // nothing marked, nothing spent
  });

  it('skips entirely with no session (Pattern 4) — never writes on a dead JWT', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    await syncPendingDietTrials();
    await syncPendingDietTrialFoods();
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockGetAllAsync).not.toHaveBeenCalled();
  });

  it('pushes a removal as a soft delete on the upsert payload, never a DELETE', async () => {
    // The cross-device acceptance criterion: a food removed on device A stops
    // being permitted on device B. That only works if deleted_at TRAVELS.
    queueReturns([{ ...FOOD_ROW, deleted_at: '2026-07-14T09:00:00.000Z' }]);
    selectSpy.mockResolvedValue({ data: [{ id: 'df1' }], error: null });

    await syncPendingDietTrialFoods();

    expect(mockFrom).toHaveBeenCalledWith('diet_trial_foods');
    const [payload, opts] = upsertSpy.mock.calls[0] as [Record<string, unknown>[], unknown];
    expect(payload[0].deleted_at).toBe('2026-07-14T09:00:00.000Z');
    expect(opts).toEqual({ onConflict: 'id' });
    // No local-only columns on the wire.
    expect(payload[0]).not.toHaveProperty('synced');
    expect(payload[0]).not.toHaveProperty('sync_error');
  });

  it('quarantines a same-day re-add collision on the allowed set (23505 again)', async () => {
    // UNIQUE (diet_trial_id, food_item_id, role, allowed_from). The local mirror
    // replicates it so this normally fails at the action — but a row that reached
    // the queue anyway must not be retried for the life of the install.
    queueReturns([FOOD_ROW]);
    selectSpy.mockResolvedValue({ data: null, error: { code: '23505', message: 'dup membership' } });

    await syncPendingDietTrialFoods();

    expect(mockRunAsync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE diet_trial_foods SET sync_error'),
      ['23505: dup membership', 'df1'],
    );
  });
});

// ── B-398 — the poison-pill wedge, on a batch writer that is not diet trials ──
//
// pushRows is now shared by every writer, so these assertions are about the
// PRIMITIVE rather than about events specifically; syncPendingEvents is simply the
// thinnest caller (no pre-sync, no parent gate) and therefore the clearest lens.
//
// The bug being closed: the old shape was `if (error) { log; return; }`, so ONE
// row the server refuses failed the whole upsert and marked nothing synced. The
// queue read is `LIMIT 100`, so the poison row stays permanently in the window and
// every row behind it is blocked for the life of the install — silently, because
// getSyncStatus counted only unsynced `events` and the banner keys off that.
describe('pushRows — poison-pill isolation and the retry budget (B-398)', () => {
  let upsertSpy: jest.Mock;
  let selectSpy: jest.Mock;
  let warnSpy: jest.SpyInstance;

  const evt = (id: string) => ({
    id, pet_id: 'p1', event_type: 'vomit', occurred_at: '2026-07-01T08:00:00.000Z',
    severity: null, notes: null, source: 'manual', occurred_at_source: 'manual',
    occurred_at_confidence: null, occurred_at_earliest: null, occurred_at_latest: null,
    deleted_at: null, created_at: '2026-07-01T08:00:00.000Z',
    updated_at: '2026-07-01T08:00:00.000Z', logged_via: 'app',
  });

  const marks = () => mockRunAsync.mock.calls.filter(([sql]) => String(sql).includes('synced = 1'));
  const bumps = () =>
    mockRunAsync.mock.calls.filter(([sql]) =>
      String(sql).includes('sync_attempts = sync_attempts + 1'));
  const parks = () =>
    mockRunAsync.mock.calls.filter(
      ([sql]) => String(sql).includes('SET sync_error = ?') && !String(sql).includes('CASE'));

  beforeEach(() => {
    mockGetSession.mockReset();
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-A' } } } });
    mockFrom.mockReset();
    mockRunAsync.mockReset();
    mockGetAllAsync.mockReset();
    selectSpy = jest.fn().mockResolvedValue({ data: [], error: null });
    upsertSpy = jest.fn().mockReturnValue({ select: selectSpy });
    mockFrom.mockReturnValue({ upsert: upsertSpy });
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('reads the queue with the quarantine filter — a parked row is skipped, not retried', async () => {
    mockGetAllAsync.mockResolvedValue([]);
    await syncPendingEvents();
    expect(String(mockGetAllAsync.mock.calls[0][0])).toContain('sync_error IS NULL');
  });

  it('THE WEDGE: one refused row no longer blocks the other 99', async () => {
    mockGetAllAsync.mockResolvedValue([evt('e1'), evt('e2'), evt('e3')]);
    selectSpy
      // The batch: the server refuses it because of e2.
      .mockResolvedValueOnce({ data: null, error: { code: '22P02', message: 'bad enum' } })
      // Isolation: e1 lands, e2 is refused again, e3 lands.
      .mockResolvedValueOnce({ data: [{ id: 'e1' }], error: null })
      .mockResolvedValueOnce({ data: null, error: { code: '22P02', message: 'bad enum' } })
      .mockResolvedValueOnce({ data: [{ id: 'e3' }], error: null });

    await syncPendingEvents();

    // Before B-398 this expectation was [] — nothing at all was marked, forever.
    expect(marks().flatMap(([, p]) => p as string[]).sort()).toEqual(['e1', 'e3']);
    // And the poison row is parked with its reason rather than re-sent every cycle.
    expect(parks()).toHaveLength(1);
    expect(parks()[0][1]).toEqual(['22P02: bad enum', 'e2']);
  });

  it('never flags a refused row synced — quarantine records, it does not lie', async () => {
    mockGetAllAsync.mockResolvedValue([evt('e1')]);
    selectSpy.mockResolvedValue({ data: null, error: { code: '23505', message: 'dup' } });

    await syncPendingEvents();

    expect(marks()).toHaveLength(0);
    expect(parks()[0][1]).toEqual(['23505: dup', 'e1']);
    // A terminal failure spends no budget — there is nothing to wait for.
    expect(bumps()).toHaveLength(0);
  });

  it('SPENDS NOTHING on an offline device — the fortnight-in-a-basement case', async () => {
    // The single most destructive way to get this wrong: if a codeless network
    // failure counted toward the budget, an owner offline for two weeks would come
    // back to find every queued meal quarantined by a server that never saw one.
    mockGetAllAsync.mockResolvedValue([evt('e1'), evt('e2')]);
    selectSpy.mockResolvedValue({ data: null, error: { message: 'Network request failed' } });

    await syncPendingEvents();

    expect(upsertSpy).toHaveBeenCalledTimes(1); // no isolation into a dead network
    expect(mockRunAsync).not.toHaveBeenCalled(); // nothing marked, nothing spent
  });

  it('charges exactly one attempt per row per cycle on a row-level rejection', async () => {
    mockGetAllAsync.mockResolvedValue([evt('e1'), evt('e2')]);
    selectSpy.mockResolvedValue({ data: null, error: { code: '23503', message: 'fk' } });

    await syncPendingEvents();

    expect(bumps().map(([, p]) => (p as unknown[])[2])).toEqual(['e1', 'e2']);
    expect(parks()).toHaveLength(0); // one FK miss is not a give-up
  });

  it('treats a silently-filtered write as unsent AND spends an attempt', async () => {
    // { error: null } with fewer rows back than sent. Marking these synced is the
    // 009 trap; leaving them queued forever with no counter was the B-398 half.
    mockGetAllAsync.mockResolvedValue([evt('e1'), evt('e2')]);
    selectSpy.mockResolvedValue({ data: [{ id: 'e1' }], error: null });

    await syncPendingEvents();

    expect(marks()[0][1]).toEqual(['e1']);
    expect(bumps().map(([, p]) => (p as unknown[])[2])).toEqual(['e2']);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('RLS-blocked'));
  });

  it('marks the whole batch when it lands, and resets the quarantine state', async () => {
    mockGetAllAsync.mockResolvedValue([evt('e1'), evt('e2')]);
    selectSpy.mockResolvedValue({ data: [{ id: 'e1' }, { id: 'e2' }], error: null });

    await syncPendingEvents();

    expect(upsertSpy).toHaveBeenCalledTimes(1); // no isolation on the happy path
    const [sql, params] = marks()[0] as [string, string[]];
    expect(params.sort()).toEqual(['e1', 'e2']);
    expect(sql).toContain('sync_attempts = 0');
    expect(sql).toContain('sync_error = NULL');
  });

  it('quarantines at the cap and NOT before, against a real SQLite', async () => {
    // The boundary is expressed as one CASE inside the UPDATE (SQLite reads the
    // pre-update value on both sides), so an off-by-one here is either a row parked
    // a cycle early or one that never parks at all. Executed rather than asserted
    // on the string, using the real statement the production code emitted.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE events (
      id TEXT PRIMARY KEY, synced INTEGER NOT NULL DEFAULT 0,
      sync_attempts INTEGER NOT NULL DEFAULT 0, sync_error TEXT)`);
    db.prepare("INSERT INTO events (id, sync_attempts) VALUES ('e1', 0)").run();

    mockGetAllAsync.mockResolvedValue([evt('e1')]);
    selectSpy.mockResolvedValue({ data: null, error: { code: '23503', message: 'fk' } });

    const readError = () =>
      (db.prepare("SELECT sync_error FROM events WHERE id = 'e1'").get() as {
        sync_error: string | null;
      }).sync_error;

    for (let cycle = 1; cycle <= MAX_SYNC_ATTEMPTS; cycle++) {
      mockRunAsync.mockClear();
      await syncPendingEvents();
      const [sql, params] = bumps()[0] as [string, unknown[]];
      db.prepare(sql).run(...(params as (string | number | null)[]));
      if (cycle < MAX_SYNC_ATTEMPTS) {
        expect({ cycle, parked: readError() }).toEqual({ cycle, parked: null });
      }
    }
    expect(readError()).toContain('23503');
    expect(readError()).toContain(String(MAX_SYNC_ATTEMPTS));
    // Still honestly unsynced — giving up is not a claim that the row landed.
    expect((db.prepare("SELECT synced FROM events WHERE id = 'e1'").get() as { synced: number }).synced)
      .toBe(0);
    db.close();
  });
});

// ── B-586 — a THROWN upload failure gets the retry budget too ─────────────────
//
// B-398 gave every queue a budget, but recordPushFailure keys off a Postgres error
// OBJECT. The object-upload half of the three file-bearing writers fails by
// THROWING (uploadPhoto re-throws the Storage error; prepareVetDocumentUpload and
// the bytes read throw), and a throw has no SQLSTATE — so before this fix every one
// re-uploaded forever, permanently occupying an oldest-first slot. These assertions
// prove the WIRING: each writer routes its catch through recordUploadFailure, and
// the classifier's three outcomes reach the row.
describe('file-bearing writers charge a thrown upload failure (B-586)', () => {
  // storage-js's real error shapes: StorageApiError carries a numeric status,
  // StorageUnknownError (a wrapped network failure) carries the flag but none.
  const apiError = (status: number, message = 'boom') => ({
    __isStorageError: true, name: 'StorageApiError', status, statusCode: String(status), message,
  });
  const networkError = { __isStorageError: true, name: 'StorageUnknownError', message: 'Network request failed' };

  const parks = () =>
    mockRunAsync.mock.calls.filter(
      ([sql]) => String(sql).includes('SET sync_error = ?') && !String(sql).includes('CASE'));
  const bumps = () =>
    mockRunAsync.mock.calls.filter(([sql]) => String(sql).includes('sync_attempts = sync_attempts + 1'));
  const marks = () => mockRunAsync.mock.calls.filter(([sql]) => String(sql).includes('synced = 1'));

  const EVENT_ATT = {
    id: 'a1', event_id: 'e1', pet_id: 'p1', local_uri: 'file:///a.jpg',
    storage_path: 'k/a.jpg', mime_type: 'image/jpeg', taken_at: null,
  };
  const VISIT_ATT = {
    id: 'va1', vet_visit_id: 'v1', pet_id: 'p1', local_uri: 'file:///v.jpg',
    storage_path: 'k/v.jpg', mime_type: 'image/jpeg', taken_at: null,
  };
  const VET_DOC = {
    id: 'd1', pet_id: 'p1', vet_visit_id: null, document_group_id: 'g1', kind: 'lab_result',
    title: null, document_date: null, notes: null, source: 'camera', source_filename: null,
    local_uri: 'file:///d.jpg', storage_path: 'p1/d1.jpg', mime_type: 'image/jpeg',
    file_size_bytes: 1234, page_index: 0, deleted_at: null,
    created_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-01T00:00:00.000Z', synced: 0,
  };

  beforeEach(() => {
    mockGetSession.mockReset();
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-A' } } } });
    mockFrom.mockReset();
    // A benign upsert chain: the row-write half never runs when the upload throws
    // first, but syncPendingVetDocuments references supabase.from unconditionally.
    mockFrom.mockReturnValue({
      upsert: jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue({ data: [], error: null }) }),
    });
    mockRunAsync.mockReset();
    mockRunAsync.mockResolvedValue(undefined);
    mockGetAllAsync.mockReset();
    mockCompress.mockReset();
    mockCompress.mockResolvedValue('file:///compressed.jpg');
    mockUploadPhoto.mockReset();
    mockUploadPhoto.mockResolvedValue(undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('event attachment: a 413 on the object quarantines (terminal), never marks synced', async () => {
    mockGetAllAsync.mockResolvedValue([EVENT_ATT]);
    mockUploadPhoto.mockRejectedValue(apiError(413, 'Payload too large'));

    await syncPendingAttachments();

    expect(parks()).toHaveLength(1);
    expect(String(parks()[0][0])).toContain('UPDATE event_attachments SET sync_error = ?');
    expect(parks()[0][1]).toEqual(['upload-413: Payload too large', 'a1']);
    expect(bumps()).toHaveLength(0); // a terminal failure waits for nothing
    expect(marks()).toHaveLength(0);
  });

  it('vet-visit attachment: a NETWORK throw records NOTHING — the offline case', async () => {
    // The single most destructive way to get this wrong: charging the offline owner.
    mockGetAllAsync.mockImplementation((sql: string) =>
      Promise.resolve(String(sql).includes('vet_visit_attachments') ? [VISIT_ATT] : []));
    mockUploadPhoto.mockRejectedValue(networkError);

    await syncPendingVetVisits();

    expect(mockRunAsync).not.toHaveBeenCalled(); // nothing parked, nothing bumped, nothing marked
  });

  it('vet document: a 413 on an oversize object quarantines (terminal)', async () => {
    mockGetAllAsync.mockResolvedValue([VET_DOC]);
    mockUploadPhoto.mockRejectedValue(apiError(413, 'Payload too large'));

    await syncPendingVetDocuments();

    expect(parks()).toHaveLength(1);
    expect(String(parks()[0][0])).toContain('UPDATE vet_documents SET sync_error = ?');
    expect(parks()[0][1]).toEqual(['upload-413: Payload too large', 'd1']);
    expect(marks()).toHaveLength(0);
  });

  it('vet document: an undecodable image spends the budget (rejected), not an immediate park', async () => {
    // prepareVetDocumentUpload has NO original-fallback (§6.2: no GPS-intact upload
    // on a vet doc), so the compress throw propagates and is classified as a local
    // failure — charged, but with the full run of grace before it quarantines.
    mockGetAllAsync.mockResolvedValue([VET_DOC]);
    mockCompress.mockRejectedValue(new Error('manipulator: could not decode image'));

    await syncPendingVetDocuments();

    expect(bumps()).toHaveLength(1);
    expect(bumps()[0][1]).toEqual([MAX_SYNC_ATTEMPTS, expect.stringContaining('upload:'), 'd1']);
    expect(parks()).toHaveLength(0);
    expect(marks()).toHaveLength(0);
    expect(mockUploadPhoto).not.toHaveBeenCalled(); // the throw was before the upload
  });
});

// ── B-369 — reap orphaned in-progress food captures ──────────────────────────
//
// food-capture inserts the owner-locked food_items row BEFORE uploading its photos
// (B-358, an RLS requirement), so an app death in that window strands a
// 'pending'/'Extracting…' phantom in the library. The reaper deletes the account's
// stale pending rows and drops them from the cache so the phantom disappears.
describe('reapStalePendingFoods (B-369)', () => {
  let selectFinal: jest.Mock;
  let ltFn: jest.Mock;
  let eq2: jest.Mock;
  let eq1: jest.Mock;
  let deleteFn: jest.Mock;

  beforeEach(() => {
    mockGetSession.mockReset();
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-A' } } } });
    mockFrom.mockReset();
    mockRunAsync.mockReset();
    mockRunAsync.mockResolvedValue(undefined);
    // supabase.from('food_items').delete().eq().eq().lt().select('id')
    selectFinal = jest.fn().mockResolvedValue({ data: [], error: null });
    ltFn = jest.fn().mockReturnValue({ select: selectFinal });
    eq2 = jest.fn().mockReturnValue({ lt: ltFn });
    eq1 = jest.fn().mockReturnValue({ eq: eq2 });
    deleteFn = jest.fn().mockReturnValue({ eq: eq1 });
    mockFrom.mockReturnValue({ delete: deleteFn });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('deletes ONLY this account\'s stale pending rows — scoped, status-gated, aged', async () => {
    await reapStalePendingFoods();

    expect(mockFrom).toHaveBeenCalledWith('food_items');
    expect(deleteFn).toHaveBeenCalled();
    expect(eq1).toHaveBeenCalledWith('created_by_user_id', 'user-A'); // account scope (belt-and-braces w/ RLS)
    expect(eq2).toHaveBeenCalledWith('ai_extraction_status', 'pending'); // only in-progress captures
    const [col, cutoff] = ltFn.mock.calls[0] as [string, string];
    expect(col).toBe('created_at');
    expect(new Date(cutoff).getTime()).toBeLessThan(Date.now()); // a past cutoff (now - 30 min)
    expect(selectFinal).toHaveBeenCalledWith('id');
  });

  it('purges the reaped rows from the local cache so the phantom tile disappears now', async () => {
    selectFinal.mockResolvedValue({ data: [{ id: 'f1' }, { id: 'f2' }], error: null });

    await reapStalePendingFoods();

    const cacheDelete = mockRunAsync.mock.calls.find(([sql]) => String(sql).includes('food_items_cache'));
    expect(cacheDelete).toBeDefined();
    expect(String(cacheDelete![0])).toContain('DELETE FROM food_items_cache WHERE id IN (?,?)');
    expect(cacheDelete![1]).toEqual(['f1', 'f2']);
  });

  it('touches the cache for nothing when there is nothing stale to reap', async () => {
    selectFinal.mockResolvedValue({ data: [], error: null });
    await reapStalePendingFoods();
    expect(mockRunAsync).not.toHaveBeenCalled();
  });

  it('never deletes without a session (Pattern 4)', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    await reapStalePendingFoods();
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRunAsync).not.toHaveBeenCalled();
  });

  it('logs and leaves the cache alone on a delete error — no silent failure', async () => {
    selectFinal.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await reapStalePendingFoods();
    expect(mockRunAsync).not.toHaveBeenCalled();
  });
});

// CUL-293 — the pets.weight_kg snapshot is a denormalized convenience written inline at
// log/edit time by a best-effort direct supabase update that is silently skipped
// offline, so the server snapshot drifts from the reliably-synced weight_checks.
// reconcilePetWeightSnapshot re-points pets.weight_kg at the pet's latest local reading,
// and syncPendingWeightChecks calls it for every pet whose weight row actually landed.
describe('reconcilePetWeightSnapshot (CUL-293)', () => {
  beforeEach(() => {
    mockGetFirstAsync.mockReset();
    mockFrom.mockReset();
  });

  it("writes the pet's latest local weight to the pets.weight_kg snapshot", async () => {
    mockGetFirstAsync.mockResolvedValue({ weight_kg: 5.4 });
    const eq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn().mockReturnValue({ eq });
    mockFrom.mockReturnValue({ update });

    await reconcilePetWeightSnapshot('pet-A');

    expect(mockFrom).toHaveBeenCalledWith('pets');
    expect(update).toHaveBeenCalledWith({ weight_kg: 5.4 });
    expect(eq).toHaveBeenCalledWith('id', 'pet-A');
  });

  it('writes nothing when the pet has no readings (latest is null)', async () => {
    mockGetFirstAsync.mockResolvedValue(null);
    const update = jest.fn();
    mockFrom.mockReturnValue({ update });

    await reconcilePetWeightSnapshot('pet-A');

    expect(update).not.toHaveBeenCalled();
  });

  it('swallows a snapshot-write failure — best-effort, never throws into the sync loop', async () => {
    mockGetFirstAsync.mockResolvedValue({ weight_kg: 5.4 });
    const eq = jest.fn().mockResolvedValue({ error: { message: 'network down' } });
    mockFrom.mockReturnValue({ update: jest.fn().mockReturnValue({ eq }) });

    await expect(reconcilePetWeightSnapshot('pet-A')).resolves.toBeUndefined();
  });
});

describe('syncPendingWeightChecks — snapshot reconcile wiring (CUL-293)', () => {
  beforeEach(() => {
    mockGetSession.mockReset().mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    mockGetAllAsync.mockReset();
    mockGetFirstAsync.mockReset();
    mockRunAsync.mockReset().mockResolvedValue(undefined);
    mockFrom.mockReset();
  });

  it('reconciles pets.weight_kg after a reading lands', async () => {
    mockGetAllAsync.mockResolvedValue([
      { id: 'w1', event_id: 'e1', pet_id: 'pet-A', weight_kg: 5.2, notes: null, created_at: 't', updated_at: 't' },
    ]);
    // The post-push latest-by-occurred_at read: a newer (back-dated) reading wins.
    mockGetFirstAsync.mockResolvedValue({ weight_kg: 5.4 });

    const petEq = jest.fn().mockResolvedValue({ error: null });
    const petUpdate = jest.fn().mockReturnValue({ eq: petEq });
    const wcSelect = jest.fn().mockResolvedValue({ data: [{ id: 'w1' }], error: null });
    const wcUpsert = jest.fn().mockReturnValue({ select: wcSelect });
    mockFrom.mockImplementation((table: string) =>
      table === 'pets' ? { update: petUpdate } : { upsert: wcUpsert },
    );

    await syncPendingWeightChecks();

    expect(petUpdate).toHaveBeenCalledWith({ weight_kg: 5.4 });
    expect(petEq).toHaveBeenCalledWith('id', 'pet-A');
  });

  it('does NOT reconcile a pet whose weight row failed to land (RLS-blocked / not returned)', async () => {
    mockGetAllAsync.mockResolvedValue([
      { id: 'w1', event_id: 'e1', pet_id: 'pet-A', weight_kg: 5.2, notes: null, created_at: 't', updated_at: 't' },
    ]);
    const petUpdate = jest.fn();
    // Success-with-0-rows: pushRows treats a returned-no-id row as RLS-blocked and leaves
    // it OUT of `landed`, so its pet is never reconciled — the snapshot must not be written
    // for a reading the server never accepted.
    const wcSelect = jest.fn().mockResolvedValue({ data: [], error: null });
    const wcUpsert = jest.fn().mockReturnValue({ select: wcSelect });
    mockFrom.mockImplementation((table: string) =>
      table === 'pets' ? { update: petUpdate } : { upsert: wcUpsert },
    );

    await syncPendingWeightChecks();

    expect(petUpdate).not.toHaveBeenCalled();
    expect(mockGetFirstAsync).not.toHaveBeenCalled();
  });

  it('is a no-op with nothing queued — never touches the pets snapshot', async () => {
    mockGetAllAsync.mockResolvedValue([]);
    const petUpdate = jest.fn();
    mockFrom.mockImplementation((table: string) =>
      table === 'pets' ? { update: petUpdate } : { upsert: jest.fn() },
    );

    await syncPendingWeightChecks();

    expect(petUpdate).not.toHaveBeenCalled();
    expect(mockGetFirstAsync).not.toHaveBeenCalled();
  });
});

// CUL-641 — the RETRY half of the delete-side snapshot reconcile. Removing a weigh-in
// re-points pets.weight_kg through a direct write that simply cannot land offline, and
// the CUL-293 loop above never covers it: that one fires on a landed weight_checks ROW,
// and a soft delete writes its tombstone on the parent EVENT, so no weight row is ever
// queued. This is the hook that lets the server snapshot self-heal on reconnect.
describe('syncPendingEvents — weight tombstone reconcile (CUL-641)', () => {
  const TOMBSTONE = {
    id: 'e1', pet_id: 'pet-A', event_type: 'weight_check', occurred_at: 't',
    severity: null, notes: null, source: 'manual', occurred_at_source: 'manual',
    occurred_at_confidence: null, occurred_at_earliest: null, occurred_at_latest: null,
    deleted_at: '2026-08-28T00:00:00.000Z', created_at: 't', updated_at: 't', logged_via: 'app',
  };

  function wire() {
    const petEq = jest.fn().mockResolvedValue({ error: null });
    const petUpdate = jest.fn().mockReturnValue({ eq: petEq });
    const evSelect = jest.fn().mockResolvedValue({ data: [{ id: 'e1' }], error: null });
    const evUpsert = jest.fn().mockReturnValue({ select: evSelect });
    mockFrom.mockImplementation((table: string) =>
      table === 'pets' ? { update: petUpdate } : { upsert: evUpsert },
    );
    return { petUpdate, evSelect };
  }

  beforeEach(() => {
    mockGetSession.mockReset().mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    mockGetAllAsync.mockReset();
    mockGetFirstAsync.mockReset();
    mockRunAsync.mockReset().mockResolvedValue(undefined);
    mockFrom.mockReset();
  });

  it('re-points the snapshot once a weight_check tombstone lands', async () => {
    mockGetAllAsync.mockResolvedValue([TOMBSTONE]);
    mockGetFirstAsync.mockResolvedValue({ weight_kg: 5.4 });
    const { petUpdate } = wire();

    await syncPendingEvents();

    expect(petUpdate).toHaveBeenCalledWith({ weight_kg: 5.4 });
  });

  it('ignores a weight_check event that is not a tombstone', async () => {
    // An ordinary weigh-in syncing for the first time is the CUL-293 path's business,
    // reached from its own landed ROW. Reconciling here too would fire a second
    // redundant pets write on every single weigh-in.
    mockGetAllAsync.mockResolvedValue([{ ...TOMBSTONE, deleted_at: null }]);
    const { petUpdate } = wire();

    await syncPendingEvents();

    expect(petUpdate).not.toHaveBeenCalled();
    expect(mockGetFirstAsync).not.toHaveBeenCalled();
  });

  it('ignores a tombstone for any other event type', async () => {
    mockGetAllAsync.mockResolvedValue([{ ...TOMBSTONE, event_type: 'vomit' }]);
    const { petUpdate } = wire();

    await syncPendingEvents();

    expect(petUpdate).not.toHaveBeenCalled();
  });

  it('does NOT reconcile when the tombstone itself failed to land', async () => {
    // Success-with-0-rows: pushRows leaves an RLS-blocked row out of `landed`. The
    // server still holds the event as live, so re-pointing its pet's snapshot would
    // assert a removal the server never accepted.
    mockGetAllAsync.mockResolvedValue([TOMBSTONE]);
    mockFrom.mockImplementation((table: string) =>
      table === 'pets'
        ? { update: jest.fn() }
        : { upsert: jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue({ data: [], error: null }) }) },
    );

    await syncPendingEvents();

    expect(mockGetFirstAsync).not.toHaveBeenCalled();
  });

  it('reconciles each affected pet once, not once per tombstone', async () => {
    // A multi-pet household clearing several bad readings in one offline session
    // flushes them together; the snapshot is per pet, so the writes are deduped.
    mockGetAllAsync.mockResolvedValue([
      TOMBSTONE,
      { ...TOMBSTONE, id: 'e2' },
      { ...TOMBSTONE, id: 'e3', pet_id: 'pet-B' },
    ]);
    mockGetFirstAsync.mockResolvedValue({ weight_kg: 5.4 });
    const petEq = jest.fn().mockResolvedValue({ error: null });
    const petUpdate = jest.fn().mockReturnValue({ eq: petEq });
    mockFrom.mockImplementation((table: string) =>
      table === 'pets'
        ? { update: petUpdate }
        : {
            upsert: jest.fn().mockReturnValue({
              select: jest.fn().mockResolvedValue({
                data: [{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }], error: null,
              }),
            }),
          },
    );

    await syncPendingEvents();

    expect(petUpdate).toHaveBeenCalledTimes(2);
    expect(petEq.mock.calls.map((c) => c[1])).toEqual(['pet-A', 'pet-B']);
  });
});
