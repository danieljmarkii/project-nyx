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
const mockGetAllAsync = jest.fn();

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
  getDb: () => ({
    runAsync: (...args: unknown[]) => mockRunAsync(...args),
    getAllAsync: (...args: unknown[]) => mockGetAllAsync(...args),
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

import {
  markSynced,
  prepareAttachmentUpload,
  refreshFoodCache,
  refreshMedicationCache,
  syncPendingDietTrials,
  syncPendingDietTrialFoods,
  syncPendingFeedingArrangements,
  syncPendingMeals,
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
    expect(sql).toBe('UPDATE meals SET synced = 1 WHERE id IN (?,?,?)');
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
    db.exec('CREATE TABLE meals (id TEXT PRIMARY KEY, synced INTEGER NOT NULL DEFAULT 0)');
    for (const id of ['m1', 'm2', 'm3']) {
      db.prepare('INSERT INTO meals (id, synced) VALUES (?, 0)').run(id);
    }

    // Run the real SQL + params markSynced emits (captured from the mock, so a
    // change to the production statement is exercised — not a copy of it).
    await markSynced(fakeDb, 'meals', ['m1', 'm3']);
    const [sql, params] = mockRunAsync.mock.calls[0] as [string, string[]];
    db.prepare(sql).run(...params);

    const rows = db.prepare('SELECT id, synced FROM meals ORDER BY id').all() as {
      id: string; synced: number;
    }[];
    expect(rows).toEqual([
      { id: 'm1', synced: 1 },
      { id: 'm2', synced: 0 },
      { id: 'm3', synced: 1 },
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
    // pushDietTrialRows does NOT throw on a transient error (a flap, a 503, a
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

  it('marks nothing at all when the whole batch is silently blocked', async () => {
    queueReturns([TRIAL]);
    selectSpy.mockResolvedValue({ data: [], error: null });
    await syncPendingDietTrials();
    expect(mockRunAsync).not.toHaveBeenCalled();
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

  it('does NOT isolate or quarantine on a non-terminal failure — one retry next cycle', async () => {
    // 23503 means the parent simply has not landed yet: the expected mid-cycle
    // state. Re-sending N single-row requests would be strictly worse, and
    // parking the row would strand a perfectly good trial.
    queueReturns([TRIAL, { ...TRIAL, id: 't2' }]);
    selectSpy.mockResolvedValue({ data: null, error: { code: '23503', message: 'fk' } });

    await syncPendingDietTrials();

    expect(selectSpy).toHaveBeenCalledTimes(1); // the batch only — no isolation pass
    expect(mockRunAsync).not.toHaveBeenCalled(); // nothing marked, nothing parked
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('diet_trials'), 'fk');
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
