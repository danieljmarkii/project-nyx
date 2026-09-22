// hydrateDietTrialFoods writes the allowed set as ONE unit (CUL-305 / B-454).
//
// The defect: the per-row loop let a reader observe a half-hydrated allowed set.
// `loadTrialProteinContext` reads the `primary_diet` row count from the local mirror
// and, at exactly 1, runs the single-food derivation; a meal of trial food #2 logged
// in that window earned a false contaminant heads-up, and `noteTrialFlagShown` then
// spent that food's one-per-trial budget for good. Wrapping the loop in
// `withTransactionAsync` means a concurrent reader sees the set before or after,
// never between.
//
// How this proves it: `hydrateFromCloud` is driven end to end over a fake db whose
// `withTransactionAsync` flips an `inTx` flag around the callback and whose
// `runAsync` records that flag beside every statement. The assertion is that EVERY
// diet_trial_foods write ran with the flag up, inside exactly one transaction — and
// a non-vacuity floor first, so a pull that wrote nothing cannot pass by silence.
// Deleting the wrap in lib/sync.ts turns every `inTx` false and reds this file
// (proven by mutation before it was trusted).
//
// The sibling hydrators run in the same cycle over the same fakes; each pulls an
// empty page and returns before writing, and any that throws is contained by
// runHydrationStep (whose warn is asserted NOT to name this table).

// `mock`-prefixed so jest's out-of-scope check lets the lazily-called factories
// below read them (they are read at CALL time, never at factory time).
const mockRunLog: Array<{ sql: string; inTx: boolean }> = [];
const mockTx = { inTx: false, count: 0 };

const FOOD_ROWS = [
  {
    id: 'df-wet', diet_trial_id: 't1', pet_id: 'p1', food_item_id: 'f-wet', role: 'primary_diet',
    food_label: 'Wet · rabbit', allowed_from: '2026-09-01', allowed_until: null, deleted_at: null,
    created_at: '2026-09-01T08:00:00.000Z', updated_at: '2026-09-01T08:00:00.000Z',
  },
  {
    id: 'df-dry', diet_trial_id: 't1', pet_id: 'p1', food_item_id: 'f-dry', role: 'primary_diet',
    food_label: 'Dry · rabbit', allowed_from: '2026-09-01', allowed_until: null, deleted_at: null,
    created_at: '2026-09-01T08:00:01.000Z', updated_at: '2026-09-01T08:00:01.000Z',
  },
];

// fetchAllRows builds `.from(t).select().order().range()[.gte()]` then awaits the
// builder, so the fake is a self-returning chain that is also thenable.
function mockQueryFor(table: string): unknown {
  const rows = table === 'diet_trial_foods' ? FOOD_ROWS : [];
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'order', 'range', 'gte', 'eq', 'is', 'in', 'not', 'lte', 'limit']) q[m] = () => q;
  q.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve({ data: rows, error: null }).then(res, rej);
  return q;
}

jest.mock('./storage', () => ({ uploadPhoto: jest.fn(), compressForUpload: jest.fn() }));
jest.mock('./supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) },
    from: (table: string) => mockQueryFor(table),
    storage: { from: () => ({ download: async () => ({ data: null, error: { message: 'n/a' } }) }) },
  },
}));
jest.mock('./db', () => ({
  getDb: () => ({
    runAsync: async (sql: string) => { mockRunLog.push({ sql, inTx: mockTx.inTx }); return { changes: 1 }; },
    getAllAsync: async () => [],
    getFirstAsync: async () => null,
    execAsync: async () => undefined,
    withTransactionAsync: async (cb: () => Promise<void>) => {
      mockTx.count += 1;
      mockTx.inTx = true;
      try { await cb(); } finally { mockTx.inTx = false; }
    },
  }),
  getWatermark: async () => null,
  setWatermark: async () => undefined,
}));
jest.mock('./hydration', () => ({
  reconcileBatch: (rows: unknown[]) => ({ toWrite: rows, toDelete: [] }),
  advanceWatermark: () => null,
  watermarkQueryFloor: () => null,
  mealsToDeleteByAbsence: () => [],
}));
jest.mock('./medications', () => ({
  medicationItemRowToRemote: jest.fn(),
  medicationRowToRemote: jest.fn(),
  administrationRowToRemote: jest.fn(),
}));

import { hydrateFromCloud } from './sync';

describe('hydrateDietTrialFoods — the allowed set arrives atomically (CUL-305)', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    mockRunLog.length = 0;
    mockTx.inTx = false;
    mockTx.count = 0;
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it('writes every allowed-set row inside ONE transaction, none outside it', async () => {
    await hydrateFromCloud();

    const writes = mockRunLog.filter((r) => /diet_trial_foods/i.test(r.sql));
    // Non-vacuity floor: two rows → two collision-resolution statements + two upserts.
    // A cycle that wrote nothing must fail here, not pass the `every` below over [].
    expect(writes.filter((w) => /INSERT INTO diet_trial_foods/i.test(w.sql))).toHaveLength(FOOD_ROWS.length);
    expect(writes.filter((w) => /DELETE FROM diet_trial_foods/i.test(w.sql))).toHaveLength(FOOD_ROWS.length);

    expect(writes.every((w) => w.inTx)).toBe(true);
    expect(mockTx.count).toBe(1);

    // The step itself completed — a throw inside the transaction would be swallowed
    // by runHydrationStep and reported here, not by the assertions above.
    const stepFailed = warn.mock.calls.some((c) => String(c[0]).includes('diet_trial_foods step failed'));
    expect(stepFailed).toBe(false);
  });
});
