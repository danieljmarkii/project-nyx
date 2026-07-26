// B-417 PR 3 — the multi-food guard on `loadTrialProteinContext`.
//
// Why this needs its own suite: trialContaminant.test.ts deliberately stubs both
// `./db` (throws) and `./supabase` ({}) so the pure predicate layer can be tested
// without either. The guard lives in the I/O half, and it is the one thing in that
// half that is a SAFETY decision rather than assembly — so it gets a harness.
//
// What it protects: B-351 slice 4 derives the trial diet from the single
// `diet_trials.food_item_id` column. §4.1 has since ruled that column display-only
// legacy — the trial diet is N `diet_trial_foods` rows — and PR 3 is what makes N
// > 1 possible for the first time. Until PR 5 re-bases the derivation, a two-food
// trial (a wet and a dry of the same diet: the NORMAL case) would compute the
// sanctioned protein set from one food and flag the other, legitimately-allowed
// trial food as a contaminant. That is the alarm-fatigue failure C2 exists to
// prevent, aimed at a food the owner cannot stop feeding.
//
// The guard's answer is SILENCE — never an all-clear (B-351 D10).

const mockTrialRows: { data: unknown; error: unknown } = { data: [], error: null };
jest.mock('./supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ limit: () => Promise.resolve(mockTrialRows) }),
        }),
      }),
    }),
  },
}));

let mockPrimaryCount: number | null = 1;
let mockCountThrows = false;
const mockFoodRow = {
  brand: 'Zignature',
  product_name: 'Kangaroo Formula',
  primary_protein: 'kangaroo',
  proteins: JSON.stringify(['kangaroo']),
  ingredients_notes: 'kangaroo, chickpeas',
  ai_extraction_confidence: null,
};
jest.mock('./db', () => ({
  getDb: () => ({
    getFirstAsync: (sql: string) => {
      if (sql.includes('COUNT(*)')) {
        if (mockCountThrows) throw new Error('db unavailable');
        return Promise.resolve(mockPrimaryCount === null ? null : { n: mockPrimaryCount });
      }
      return Promise.resolve(mockFoodRow);
    },
  }),
}));

const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
    removeItem: jest.fn(async (k: string) => { mockStore.delete(k); }),
  },
}));

import { clearTrialContextCache, loadTrialProteinContext } from './trialContaminant';

const ACTIVE_TRIAL = [{ id: 't-1', started_at: '2026-07-03', food_item_id: 'food-dry' }];

beforeEach(() => {
  clearTrialContextCache();
  mockTrialRows.data = ACTIVE_TRIAL;
  mockTrialRows.error = null;
  mockPrimaryCount = 1;
  mockCountThrows = false;
});

it('resolves the context normally on a single-food trial', async () => {
  const ctx = await loadTrialProteinContext('pet-1');
  expect(ctx?.trialId).toBe('t-1');
  expect(ctx?.targetProtein).toBe('kangaroo');
});

it('goes SILENT on a two-food trial rather than flagging the second food', async () => {
  mockPrimaryCount = 2;
  expect(await loadTrialProteinContext('pet-1')).toBeNull();
});

it('caches the multi-food answer — it is a settled fact, not a race', async () => {
  mockPrimaryCount = 2;
  expect(await loadTrialProteinContext('pet-1')).toBeNull();
  // A settled null is cached, so flipping the underlying count does not resurrect
  // the derivation inside the TTL.
  mockPrimaryCount = 1;
  expect(await loadTrialProteinContext('pet-1')).toBeNull();
  expect(await loadTrialProteinContext('pet-1', { force: true })).not.toBeNull();
});

it('does NOT cache a zero count — the allowed set simply has not hydrated yet', async () => {
  // `diet_trials` and `diet_trial_foods` are separate pulls, so a fresh install can
  // hold the trial without its set. Caching that for five minutes would silently
  // disable the check for the whole window — the same reasoning the trial-food
  // resolution check already applies.
  mockPrimaryCount = 0;
  expect(await loadTrialProteinContext('pet-1')).toBeNull();
  mockPrimaryCount = 1;
  expect((await loadTrialProteinContext('pet-1'))?.trialId).toBe('t-1');
});

it('treats a failed count as unknown, not as a single-food trial', async () => {
  mockCountThrows = true;
  expect(await loadTrialProteinContext('pet-1')).toBeNull();
});

it('still returns null when there is no active trial at all', async () => {
  mockTrialRows.data = [];
  expect(await loadTrialProteinContext('pet-1')).toBeNull();
});
