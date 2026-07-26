// B-417 PR 5 — `loadTrialProteinContext` over a MULTI-FOOD trial (closes B-453).
//
// Why this needs its own suite: trialContaminant.test.ts deliberately stubs both
// `./db` (throws) and `./supabase` ({}) so the pure layer can be tested without
// either. This half is the I/O — and it is the one thing in that half that is a
// SAFETY decision rather than assembly, so it gets a harness.
//
// WHAT THIS FILE USED TO PIN, AND WHY IT NO LONGER DOES. B-351 slice 4 derived
// the trial diet from the single `diet_trials.food_item_id` column. §4.1 has
// since ruled that column display-only legacy — the trial diet is N
// `diet_trial_foods` rows — so on a two-food trial (a wet and a dry of the same
// diet: the NORMAL case) the old derivation computed the sanctioned set from ONE
// food and flagged the other, legitimately-allowed trial food as a contaminant.
// PR 3 shipped a STOPGAP for that: go silent unless the `primary_diet` count is
// exactly 1. B-453 said to delete the stopgap at this re-base, and it is deleted
// — the multi-food case is now handled rather than muted, and these tests assert
// the handling.
//
// The read is also LOCAL now. PR 2 (#453) gave both tables a mirror precisely so
// the wedge surface survives airplane mode; the Supabase read this used to mock
// is gone, so there is no `./supabase` stub here at all.

interface TrialRow { id: string; started_at: string; ended_at: string | null }
interface AllowedRow {
  food_item_id: string;
  role: string;
  food_label: string;
  allowed_from: string;
  allowed_until: string | null;
  brand: string | null;
  product_name: string | null;
  primary_protein: string | null;
  proteins: string | null;
  ingredients_notes: string | null;
  ai_extraction_confidence: string | null;
}

const state: { trial: TrialRow | null; allowed: AllowedRow[]; throws: boolean } = {
  trial: null,
  allowed: [],
  throws: false,
};

jest.mock('./db', () => ({
  getDb: () => ({
    getFirstAsync: () => {
      if (state.throws) throw new Error('db unavailable');
      return Promise.resolve(state.trial);
    },
    getAllAsync: () => {
      if (state.throws) throw new Error('db unavailable');
      return Promise.resolve(state.allowed);
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

import {
  clearTrialContextCache,
  foodContaminantFlag,
  loadTrialProteinContext,
  sanctionedProteinsForTrial,
} from './trialContaminant';

const DRY: AllowedRow = {
  food_item_id: 'food-dry',
  role: 'primary_diet',
  food_label: 'Zignature Kangaroo Dry',
  allowed_from: '2020-01-01',
  allowed_until: null,
  brand: 'Zignature',
  product_name: 'Kangaroo Formula',
  primary_protein: 'kangaroo',
  proteins: JSON.stringify(['kangaroo']),
  ingredients_notes: 'kangaroo, chickpeas',
  ai_extraction_confidence: null,
};

const WET: AllowedRow = {
  ...DRY,
  food_item_id: 'food-wet',
  food_label: 'Zignature Kangaroo Wet',
  product_name: 'Kangaroo Wet',
};

beforeEach(() => {
  clearTrialContextCache();
  state.trial = { id: 't-1', started_at: '2020-01-01', ended_at: null };
  state.allowed = [DRY];
  state.throws = false;
});

it('resolves the context on a single-food trial', async () => {
  const ctx = await loadTrialProteinContext('pet-1');
  expect(ctx?.trialId).toBe('t-1');
  expect(ctx?.primaryCount).toBe(1);
  expect(sanctionedProteinsForTrial(ctx!)).toEqual(['kangaroo']);
});

it('RESOLVES a two-food trial rather than going silent (B-453 deleted)', async () => {
  state.allowed = [DRY, WET];
  const ctx = await loadTrialProteinContext('pet-1');
  expect(ctx).not.toBeNull();
  expect(ctx?.primaryCount).toBe(2);
  // …and neither trial food flags against the other, which is the whole point.
  expect(foodContaminantFlag(ctx!, 'food-wet', ['kangaroo'])).toBeNull();
  expect(foodContaminantFlag(ctx!, 'food-dry', ['kangaroo'])).toBeNull();
});

it('unions the proteins of every primary_diet food', async () => {
  state.allowed = [DRY, { ...WET, primary_protein: 'kangaroo', proteins: JSON.stringify(['kangaroo', 'pork']) }];
  const ctx = await loadTrialProteinContext('pet-1');
  expect(sanctionedProteinsForTrial(ctx!).sort()).toEqual(['kangaroo', 'pork']);
});

it('a permitted extra is in the allowed set but NOT in the sanctioned proteins', async () => {
  state.allowed = [
    DRY,
    { ...DRY, food_item_id: 'jerky', role: 'permitted_treat', brand: 'Brand', product_name: 'Rabbit Jerky', primary_protein: 'rabbit', proteins: JSON.stringify(['rabbit', 'chicken']) },
  ];
  const ctx = await loadTrialProteinContext('pet-1');
  expect(sanctionedProteinsForTrial(ctx!)).toEqual(['kangaroo']);
  // Permitted → silent at log time (§6.9); a different chicken food → flagged.
  expect(foodContaminantFlag(ctx!, 'jerky', ['rabbit', 'chicken'])).toBeNull();
  expect(foodContaminantFlag(ctx!, 'other', ['chicken'])?.proteins).toEqual(['chicken']);
});

it('does NOT cache an empty allowed set — it simply has not hydrated yet', async () => {
  // `diet_trials` and `diet_trial_foods` are separate pulls, so a fresh install
  // can hold the trial without its set. Caching that for five minutes would
  // silently disable the check for the whole window.
  state.allowed = [];
  expect((await loadTrialProteinContext('pet-1'))?.primaryCount).toBe(0);
  state.allowed = [DRY];
  expect(sanctionedProteinsForTrial((await loadTrialProteinContext('pet-1'))!)).toEqual(['kangaroo']);
});

it('does NOT cache an unhydrated food row — same transient, same rule', async () => {
  state.allowed = [{ ...DRY, brand: null, product_name: null, primary_protein: null, proteins: null }];
  const cold = await loadTrialProteinContext('pet-1');
  expect(cold?.primaryResolved).toBe(0);
  state.allowed = [DRY];
  expect(sanctionedProteinsForTrial((await loadTrialProteinContext('pet-1'))!)).toEqual(['kangaroo']);
});

it('the D10 completeness gate is over EVERY primary food, not the first', async () => {
  // One read panel and one unread one means "anything else in it is still
  // unknown" is TRUE of the trial. Claiming completeness off the read half is
  // the all-clear-on-an-unread-record D10 forbids.
  state.allowed = [DRY, { ...WET, ingredients_notes: null }];
  const ctx = await loadTrialProteinContext('pet-1');
  expect(ctx?.trialFoodCompleteness.complete).toBe(false);
});

it('treats a failed local read as unknown, and does not cache it', async () => {
  state.throws = true;
  expect(await loadTrialProteinContext('pet-1')).toBeNull();
  state.throws = false;
  expect((await loadTrialProteinContext('pet-1'))?.trialId).toBe('t-1');
});

it('still returns null when there is no active trial at all', async () => {
  state.trial = null;
  expect(await loadTrialProteinContext('pet-1')).toBeNull();
});
