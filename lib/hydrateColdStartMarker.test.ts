// CUL-1214 — `hydrateFromCloud` records that this device has READ the record, so the
// cold-start wait is decided from the watermark rather than a row count.
//
// The counterexample: an owner with a pet and nothing logged. Both record tables answer
// empty, `advanceWatermark` keeps a null prior on an empty batch, so no per-table
// watermark is ever written and a row count stays at zero: the old gate put up the wait
// on every launch. The marker is the trace of the read. It must be written when both
// record pulls answered (empty included), and never when either could not be read
// (offline), or an unread device would skip the wait over a blank Home.
//
// Driven end to end over a fake Supabase and a fake watermark store, the shape
// hydrateDietTrialFoods.test.ts uses.
const mockWatermarks = new Map<string, string>();
const mockFailing = new Set<string>();

function mockQueryFor(table: string): unknown {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'order', 'range', 'gte', 'eq', 'is', 'in', 'not', 'lte', 'limit']) q[m] = () => q;
  q.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(
      mockFailing.has(table) ? { data: null, error: { message: 'Network request failed' } } : { data: [], error: null },
    ).then(res, rej);
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
    runAsync: async () => ({ changes: 1 }),
    getAllAsync: async () => [],
    getFirstAsync: async () => null,
    execAsync: async () => undefined,
    withTransactionAsync: async (cb: () => Promise<void>) => cb(),
  }),
  getWatermark: async (table: string) => mockWatermarks.get(table) ?? null,
  setWatermark: async (table: string, value: string) => {
    mockWatermarks.set(table, value);
  },
}));
jest.mock('./medications', () => ({
  medicationItemRowToRemote: jest.fn(),
  medicationRowToRemote: jest.fn(),
  administrationRowToRemote: jest.fn(),
}));

import { COLD_START_HYDRATED_KEY, hasHydratedRecord } from './coldStart';
import { hydrateFromCloud } from './sync';

describe('hydrateFromCloud writes the cold-start marker only after reading the record', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    mockWatermarks.clear();
    mockFailing.clear();
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it('an account with nothing logged: both pulls answer empty, the marker is written', async () => {
    expect(await hasHydratedRecord()).toBe(false);
    await hydrateFromCloud();
    // No per-table watermark: the empty batch keeps the null prior. The marker is the read.
    expect(mockWatermarks.get('events')).toBeUndefined();
    expect(mockWatermarks.get('vet_visits')).toBeUndefined();
    expect(mockWatermarks.has(COLD_START_HYDRATED_KEY)).toBe(true);
    expect(await hasHydratedRecord()).toBe(true);
  });

  it.each(['events', 'vet_visits'])('offline (%s unreadable): no marker, the next online launch still waits', async (table) => {
    mockFailing.add(table);
    await hydrateFromCloud();
    expect(mockWatermarks.has(COLD_START_HYDRATED_KEY)).toBe(false);
    expect(await hasHydratedRecord()).toBe(false);
  });
});
