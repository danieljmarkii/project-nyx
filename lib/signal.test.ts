import { readSignalsAndRefresh, isSignalCacheStale, type SignalCacheRow } from './signal';
import { supabase } from './supabase';
import { syncPendingEvents, syncPendingMeals } from './sync';

// signal.ts imports the real supabase client (fail-fast env check) and the sync
// queue. Replace both before signal.ts resolves them — same pattern as
// lib/profile.test.ts (from-chain stand-in) + lib/account.test.ts (thin invoke).
// These pin readSignalsAndRefresh's load-bearing properties: per-pet ISOLATION
// (one pet's cache failure must not suppress another pet's banner) and the
// stale-only, OFF-PATH freshness regen (multi-pet §4).
jest.mock('./supabase', () => ({
  supabase: { from: jest.fn(), functions: { invoke: jest.fn() } },
}));
jest.mock('./sync', () => ({
  syncPendingEvents: jest.fn().mockResolvedValue(undefined),
  syncPendingMeals: jest.fn().mockResolvedValue(undefined),
}));

const mockedFrom = supabase.from as jest.Mock;
const mockedInvoke = supabase.functions.invoke as jest.Mock;

type SignalSelectRow = {
  signal_text: string | null;
  is_building: boolean;
  findings: unknown;
  coverage: unknown;
  expires_at: string;
};
type CacheResult = { data: SignalSelectRow | null; error: { message: string } | null };

// A minimal safety finding shaped like the cached contract (lib/signal CachedFinding).
const safetyFinding = (rank = 0) => ({
  rank,
  text: 'placeholder',
  finding: {
    type: 'intake_decline',
    priorityClass: 'safety',
    trigger: 'consecutive_low',
    species: 'cat',
    daysBelowBaseline: 2,
    refusedFoodLabel: null,
    ratedMealsConsidered: 9,
  },
});

const row = (over: Partial<SignalSelectRow> = {}): SignalSelectRow => ({
  signal_text: 'x',
  is_building: false,
  findings: [safetyFinding()],
  coverage: [],
  expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // fresh by default
  ...over,
});

// Drive readSignalCache's chain (.select().eq('pet_id', id).order().limit().maybeSingle())
// per pet, keyed off the id passed to .eq.
function installCaches(byPet: Record<string, CacheResult>) {
  mockedFrom.mockImplementation(() => {
    let petId = '';
    const maybeSingle = () =>
      Promise.resolve(byPet[petId] ?? { data: null, error: null });
    const limit = () => ({ maybeSingle });
    const order = () => ({ limit });
    const eq = (_col: string, val: string) => {
      petId = val;
      return { order };
    };
    const select = () => ({ eq });
    return { select };
  });
}

// Let the fire-and-forget regen chain (syncPendingEvents → syncPendingMeals →
// functions.invoke) drain before asserting on it.
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  jest.clearAllMocks();
  mockedInvoke.mockResolvedValue({ error: null });
  (syncPendingEvents as jest.Mock).mockResolvedValue(undefined);
  (syncPendingMeals as jest.Mock).mockResolvedValue(undefined);
});

describe('isSignalCacheStale', () => {
  const base: SignalCacheRow = {
    signalText: 'x',
    isBuilding: false,
    findings: [],
    coverage: [],
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  it('treats a missing row as stale (a regen is due)', () => {
    expect(isSignalCacheStale(null)).toBe(true);
  });
  it('is fresh before expiry, stale at/after it', () => {
    expect(isSignalCacheStale(base)).toBe(false);
    expect(isSignalCacheStale({ ...base, expiresAt: new Date(Date.now() - 1).toISOString() })).toBe(true);
  });
  it('treats an unparseable expiry as stale (never trusts a bad timestamp)', () => {
    expect(isSignalCacheStale({ ...base, expiresAt: 'not-a-date' })).toBe(true);
  });
});

describe('readSignalsAndRefresh', () => {
  it('returns each pet\'s findings keyed by id', async () => {
    installCaches({
      A: { data: row({ findings: [safetyFinding(0)] }), error: null },
      B: { data: row({ findings: [] }), error: null },
    });
    const byPet = await readSignalsAndRefresh(['A', 'B']);
    expect(byPet.get('A')).toHaveLength(1);
    expect(byPet.get('B')).toEqual([]);
  });

  it('isolates a per-pet read failure — one pet erroring never drops another', async () => {
    // readSignalCache throws when the row carries an error; readSignalsAndRefresh
    // must catch PER pet so B's real finding still surfaces.
    installCaches({
      A: { data: null, error: { message: 'boom' } },
      B: { data: row({ findings: [safetyFinding(0)] }), error: null },
    });
    const byPet = await readSignalsAndRefresh(['A', 'B']);
    expect(byPet.get('A')).toEqual([]); // failed read → empty, not a throw
    expect(byPet.get('B')).toHaveLength(1); // unaffected
  });

  it('kicks an off-path regen only for a stale/missing cache, not a fresh one', async () => {
    installCaches({
      fresh: { data: row({ expires_at: new Date(Date.now() + 3_600_000).toISOString() }), error: null },
      stale: { data: row({ expires_at: new Date(Date.now() - 1_000).toISOString() }), error: null },
      missing: { data: null, error: null },
    });
    await readSignalsAndRefresh(['fresh', 'stale', 'missing']);
    await flush(); // let the fire-and-forget regens drain
    const regenned = mockedInvoke.mock.calls.map((c) => (c[1] as { body: { petId: string } }).body.petId);
    expect(regenned).toContain('stale');
    expect(regenned).toContain('missing');
    expect(regenned).not.toContain('fresh');
  });

  it('never throws and returns an entry for every pet even when all reads fail', async () => {
    installCaches({}); // every pet → {data:null,error:null} → [] (no throw)
    const byPet = await readSignalsAndRefresh(['A', 'B', 'C']);
    expect([...byPet.keys()].sort()).toEqual(['A', 'B', 'C']);
    expect(byPet.get('A')).toEqual([]);
  });
});
