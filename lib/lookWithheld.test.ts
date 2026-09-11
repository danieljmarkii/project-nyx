// The withheld predicate (CUL-873 / N-4b) — spec §2 item 12, §3.3, T-20.
//
// The fixtures the acceptance criteria name, plus the CADENCE TABLE Data owes before the
// "2 of 3 within 2 days" threshold is trusted: the arm's reachability across once-,
// twice- and three-times-a-day feeders, and the once-a-week rater the fourth adversarial
// pass broke the first draft with.

jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => store[k] ?? null),
      setItem: jest.fn(async (k: string, v: string) => {
        store[k] = v;
      }),
      removeItem: jest.fn(async (k: string) => {
        delete store[k];
      }),
      __reset: () => {
        store = {};
      },
      __raw: () => store,
    },
  };
});
// A stub that honours the WINDOW the loader asks for, because the window is what is under
// test: `readMealRows` does its filtering in SQL, so a stub that ignored the bounds would
// make the bound untestable — which is exactly the gap the adversarial pass found.
const mockMealRows: { occurred_at: string; food_type: string | null; intake_rating: string | null }[] = [];
const mockGetAllAsync = jest.fn(async (_sql: string, params: unknown[]) => {
  const [, startIso, endIso] = params as [string, string, string];
  return mockMealRows.filter((r) => r.occurred_at >= startIso && r.occurred_at < endIso).map((r) => ({
    food_item_id: 'f-1',
    intake_rating: r.intake_rating,
    occurred_at: r.occurred_at,
    food_type: r.food_type,
    primary_protein: null,
    proteins: null,
    brand: 'Brand',
    product_name: 'Chicken',
  }));
});
jest.mock('./db', () => ({
  getDb: () => ({ getAllAsync: (...a: unknown[]) => mockGetAllAsync(...(a as [string, unknown[]])), getFirstAsync: jest.fn() }),
}));
jest.mock('./feedingArrangements', () => ({ getActiveArrangementsForPet: jest.fn(async () => []) }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AnalyticsMeal } from './analytics';
import {
  LOOK_REFUSAL_RECENCY_DAYS,
  LOOK_WITHHELD_STORAGE_KEY,
  clearLookWithheld,
  intakeArm,
  lookWithheld,
  lookWithheldState,
  loadRecentQualifyingMeals,
  markWithheldToday,
  readLastWithheldDay,
  type LookWithheldFacts,
} from './lookWithheld';

const MS_PER_DAY = 86_400_000;
const PET = { id: 'pet-1' };
// C-29 / CUL-831 — anchored to the real clock, never to a calendar literal, because the
// window under test is a rolling one judged against `Date.now()`.
const NOW = Date.now();

function meal(hoursAgo: number, intakeRating: string | null, over: Partial<AnalyticsMeal> = {}): AnalyticsMeal {
  return {
    ms: NOW - hoursAgo * 3_600_000,
    foodItemId: 'f-1',
    foodLabel: 'Brand Chicken',
    foodType: 'meal',
    primaryProtein: 'chicken',
    intakeRating,
    ...over,
  };
}

/** Facts with every arm answered and quiet, so a fixture states only what it changes. */
function facts(over: Partial<LookWithheldFacts> = {}): LookWithheldFacts {
  return {
    petId: PET.id,
    serverIntakeDecline: false,
    trialNotEating: false,
    recentQualifyingMeals: [],
    ...over,
  };
}

describe('the three arms — each a POSITIVE fact (T-20)', () => {
  it('the trial register alone withholds', () => {
    expect(lookWithheld(PET, facts({ trialNotEating: true }))).toBe(true);
    expect(lookWithheldState(PET, facts({ trialNotEating: true }))).toBe('withheld');
  });

  it('the server intake_decline finding alone withholds', () => {
    expect(lookWithheldState(PET, facts({ serverIntakeDecline: true }))).toBe('withheld');
  });

  it('the record-local arm at 2 of the last 3 within the bound withholds', () => {
    const meals = [meal(2, 'refused'), meal(10, 'picked'), meal(20, 'all')];
    expect(lookWithheldState(PET, facts({ recentQualifyingMeals: meals }))).toBe('withheld');
  });

  it('ONE refusal followed by a full bowl does NOT withhold', () => {
    // N-4a's second counterexample, applied to this predicate: a refused breakfast and a
    // finished dinner is not a pet whose eating needs attention.
    const meals = [meal(2, 'all'), meal(10, 'refused'), meal(20, 'all')];
    expect(lookWithheldState(PET, facts({ recentQualifyingMeals: meals }))).toBe('open');
  });

  it('a cat who PICKED at every bowl withholds — the fact is "refused OR picked"', () => {
    // N-4a's first counterexample. `picked` was invisible to the door's first cut.
    const meals = [meal(1, 'picked'), meal(9, 'picked'), meal(18, 'picked')];
    expect(lookWithheldState(PET, facts({ recentQualifyingMeals: meals }))).toBe('withheld');
  });

  it('two `some` ratings do not withhold — half a dinner is not a refusal', () => {
    const meals = [meal(1, 'some'), meal(9, 'some'), meal(18, 'some')];
    expect(lookWithheldState(PET, facts({ recentQualifyingMeals: meals }))).toBe('open');
  });

  it('only the last three are read — a fourth refusal further back does not carry', () => {
    const meals = [meal(1, 'all'), meal(6, 'all'), meal(12, 'all'), meal(20, 'refused'), meal(30, 'refused')];
    expect(intakeArm(meals)).toBe(false);
  });
});

describe('what the arm must NOT fire on', () => {
  it('a treat refusal never reaches the arm — the qualifying set dropped it', () => {
    // The pill-pocket case. `loadRecentQualifyingMeals` filters through
    // `qualifyingIntakeMeals`, so a treat row cannot be in this list at all; the fixture
    // asserts the shape the loader produces, which is an EMPTY list, not a refusal.
    expect(lookWithheldState(PET, facts({ recentQualifyingMeals: [] }))).toBe('open');
    // And stated the other way: were a treat ever handed to the arm directly, it reads as
    // a refusal by the scale — which is exactly why the filter runs first, and why this
    // module never re-derives one.
    expect(intakeArm([meal(1, 'refused', { foodType: 'treat' }), meal(2, 'refused', { foodType: 'treat' })])).toBe(true);
  });

  it('a free-fed cat with NO meal rows is not withheld (the struck second arm)', () => {
    // The fixture the acceptance criteria name by hand. A record that is merely blind is
    // not a record that says she stopped eating.
    expect(lookWithheldState(PET, facts({ recentQualifyingMeals: [] }))).toBe('open');
    expect(lookWithheld(PET, facts({ recentQualifyingMeals: [] }))).toBe(false);
  });

  it('unloaded facts withhold — fail closed, one arm at a time', () => {
    expect(lookWithheld(PET, null)).toBe(true);
    expect(lookWithheld(PET, facts({ recentQualifyingMeals: null }))).toBe(true);
    expect(lookWithheld(PET, facts({ trialNotEating: null }))).toBe(true);
    expect(lookWithheld(PET, facts({ serverIntakeDecline: null }))).toBe(true);
    // …and they are UNKNOWN, not withheld — the distinction the card renders a skeleton on.
    expect(lookWithheldState(PET, facts({ trialNotEating: null }))).toBe('unknown');
  });

  it('a positive arm settles it even while a sibling arm is still loading', () => {
    // A known refusal is not made less known by a pending read, and the protection must
    // not wait for the slowest fact.
    expect(lookWithheldState(PET, facts({ trialNotEating: true, recentQualifyingMeals: null }))).toBe('withheld');
  });

  it("facts for ANOTHER pet never answer for this one (C-9)", () => {
    expect(lookWithheldState({ id: 'pet-2' }, facts())).toBe('unknown');
    expect(lookWithheld({ id: 'pet-2' }, facts())).toBe(true);
  });
});

// ── The cadence table (Data), and the bound itself ──────────────────────────
//
// "2 of the last 3 within N days" is a threshold on a ROW COUNT read through a TIME
// window, so its reachability depends entirely on how often an owner rates. The loader
// bounds the rows by `LOOK_REFUSAL_RECENCY_DAYS` FIRST and the arm takes the last three of
// what survives — so this table is what the arm can and cannot see, per feeder.
//
// EVERY EXPECTATION IS DERIVED FROM THE CONSTANT, never typed. The first version of this
// block re-implemented the bound as a local `inBound()` helper, and the adversarial pass
// showed what that bought: DELETING the bound from `loadRecentQualifyingMeals` left
// 7,576 of 7,577 tests green. A test that re-implements the thing it is testing proves a
// property of itself (C-18: a mutation that does not change behaviour has not tested the
// guard). The loader-driven tests below are the repair.
describe('cadence — the arm’s reachability by feeding frequency', () => {
  /** Meals every `perDay` times a day, going back `days`, all with one rating. */
  function cadence(perDay: number, days: number, rating: string): AnalyticsMeal[] {
    const out: AnalyticsMeal[] = [];
    const gap = 24 / perDay;
    for (let i = 0; i < perDay * days; i += 1) out.push(meal(i * gap + 1, rating));
    return out;
  }

  /** What the LOADER would hand the arm, derived from the shipped constant. */
  function inBound(meals: AnalyticsMeal[]): AnalyticsMeal[] {
    return meals.filter((m) => m.ms >= NOW - LOOK_REFUSAL_RECENCY_DAYS * MS_PER_DAY);
  }

  it.each([[3], [2], [1]])('a %ix-a-day feeder reaches the threshold on refused meals', (perDay) => {
    const rows = inBound(cadence(perDay, 7, 'refused'));
    // Derived: `perDay` meals a day inside the bound, minus the one-hour offset.
    expect(rows.length).toBeGreaterThanOrEqual(Math.min(2, perDay * LOOK_REFUSAL_RECENCY_DAYS));
    expect(intakeArm(rows)).toBe(true);
  });

  it('a once-a-day dog reaches it on two refused dinners', () => {
    // Two of two, not two of three — the threshold is on the numerator; "the last three"
    // is a cap on how far back the arm looks, never a minimum sample. A dog who refused
    // both of his last two dinners is exactly the animal this arm exists for.
    const rows = inBound(cadence(1, 7, 'refused')).slice(0, 2);
    expect(intakeArm(rows)).toBe(true);
  });

  it('a once-a-WEEK rater can never reach it — a gap is not a fact', () => {
    const weekly = [meal(24 * 6, 'refused'), meal(24 * 13, 'refused'), meal(24 * 20, 'refused')];
    expect(inBound(weekly)).toHaveLength(0);
    expect(intakeArm(inBound(weekly))).toBe(false);
    // Unbounded, the same three rows fire — which is the whole point of bounding them.
    expect(intakeArm(weekly)).toBe(true);
  });

  it('a once-a-day dog whose ONE meal in the bound was refused does not fire', () => {
    expect(intakeArm([meal(3, 'refused')])).toBe(false);
  });
});

describe('the recency bound is applied by the LOADER, not by a test helper', () => {
  const HOUR = 3_600_000;
  const BOUND_H = LOOK_REFUSAL_RECENCY_DAYS * 24;

  function row(hoursAgo: number, rating: string | null, foodType: string | null = 'meal') {
    return {
      occurred_at: new Date(NOW - hoursAgo * HOUR).toISOString(),
      intake_rating: rating,
      food_type: foodType,
    };
  }

  beforeEach(() => {
    mockMealRows.length = 0;
    mockGetAllAsync.mockClear();
  });

  it('keeps a meal just INSIDE the bound and drops one just outside', async () => {
    // The mutation that used to survive the whole suite: replace the loader's `start` with
    // 0 and every one of these rows comes back. Both sides are derived from the constant,
    // so retuning it moves the fixture with it.
    mockMealRows.push(row(BOUND_H - 1, 'refused'), row(BOUND_H + 1, 'refused'));
    const got = await loadRecentQualifyingMeals(PET.id, NOW);
    expect(got).toHaveLength(1);
    expect(got?.[0].ms).toBeGreaterThan(NOW - LOOK_REFUSAL_RECENCY_DAYS * MS_PER_DAY);
  });

  it('the once-a-week rater is unreachable THROUGH THE LOADER', async () => {
    mockMealRows.push(row(24 * 6, 'refused'), row(24 * 13, 'refused'), row(24 * 20, 'refused'));
    const got = await loadRecentQualifyingMeals(PET.id, NOW);
    expect(got).toEqual([]);
    expect(intakeArm(got ?? [])).toBe(false);
  });

  it('the cat whose owner stopped offering is STILL withheld at 49 hours', async () => {
    // THE COUNTEREXAMPLE THE GATE BROKE THE 2-DAY BOUND WITH. Three refusals in a row, then
    // silence, because a reasonable owner stops putting food down for an animal that has
    // stopped eating. At two days the gate flipped open here with no intervening evidence
    // of any kind, and Home drew *Nothing unusual* over a cat three days into a hunger
    // strike.
    mockMealRows.push(row(49, 'refused'), row(58, 'refused'), row(66, 'refused'));
    const got = await loadRecentQualifyingMeals(PET.id, NOW);
    expect(intakeArm(got ?? [])).toBe(true);
    expect(lookWithheldState(PET, facts({ recentQualifyingMeals: got }))).toBe('withheld');
  });

  it('a treat is dropped by the qualifying set before the arm sees it', async () => {
    mockMealRows.push(row(2, 'refused', 'treat'), row(5, 'refused', 'treat'));
    expect(await loadRecentQualifyingMeals(PET.id, NOW)).toEqual([]);
  });

  it('an unrated meal is dropped too — a logging gap is not anorexia', async () => {
    mockMealRows.push(row(2, null), row(5, null));
    expect(await loadRecentQualifyingMeals(PET.id, NOW)).toEqual([]);
  });

  it('returns newest first, so "the last three" means the last three', async () => {
    mockMealRows.push(row(20, 'all'), row(2, 'refused'), row(11, 'picked'));
    const got = await loadRecentQualifyingMeals(PET.id, NOW);
    expect(got?.map((m) => m.intakeRating)).toEqual(['refused', 'picked', 'all']);
  });

  it('a failed read is null, never an empty record', async () => {
    mockGetAllAsync.mockRejectedValueOnce(new Error('disk'));
    expect(await loadRecentQualifyingMeals(PET.id, NOW)).toBeNull();
  });
});

describe('the withheld-day mark', () => {
  const storage = AsyncStorage as unknown as { __reset: () => void; __raw: () => Record<string, string> };
  beforeEach(() => storage.__reset());

  it('records today and reads it back', async () => {
    await markWithheldToday(PET.id, NOW);
    const day = await readLastWithheldDay(PET.id);
    expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('is null for a pet with no mark, and per pet', async () => {
    await markWithheldToday(PET.id, NOW);
    expect(await readLastWithheldDay('pet-2')).toBeNull();
  });

  it('never moves the mark backwards', async () => {
    await markWithheldToday(PET.id, NOW);
    const today = await readLastWithheldDay(PET.id);
    await markWithheldToday(PET.id, NOW - 5 * MS_PER_DAY);
    expect(await readLastWithheldDay(PET.id)).toBe(today);
  });

  it('a same-day repeat writes nothing', async () => {
    await markWithheldToday(PET.id, NOW);
    const setItem = (AsyncStorage.setItem as jest.Mock);
    const before = setItem.mock.calls.length;
    await markWithheldToday(PET.id, NOW);
    expect(setItem.mock.calls.length).toBe(before);
  });

  it('sign-out clears it by name', async () => {
    await markWithheldToday(PET.id, NOW);
    await clearLookWithheld();
    expect(storage.__raw()[LOOK_WITHHELD_STORAGE_KEY]).toBeUndefined();
    expect(await readLastWithheldDay(PET.id)).toBeNull();
  });

  it('a garbage blob reads as empty rather than throwing', async () => {
    storage.__raw()[LOOK_WITHHELD_STORAGE_KEY] = '{not json';
    expect(await readLastWithheldDay(PET.id)).toBeNull();
  });

  it('a mark that is not a day key is discarded', async () => {
    storage.__raw()[LOOK_WITHHELD_STORAGE_KEY] = JSON.stringify({ [PET.id]: 'yesterday' });
    expect(await readLastWithheldDay(PET.id)).toBeNull();
  });

  it('storage that does not answer is UNDEFINED, not "no mark"', async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('nope'));
    expect(await readLastWithheldDay(PET.id)).toBeUndefined();
  });
});

describe('entryWithholdsWords — the asymmetry inside the withheld state', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { entryWithholdsWords } = require('./lookWithheld') as typeof import('./lookWithheld');

  it('the observed absence is withheld — it is the row the state exists to stop', () => {
    expect(entryWithholdsWords([], 'cat')).toBe(true);
  });

  it('an activity-only entry is withheld — a run of positives is the reassuring half', () => {
    expect(entryWithholdsWords(['lively', 'played'], 'cat')).toBe(true);
  });

  it('a concern word RENDERS — it can only raise', () => {
    expect(entryWithholdsWords(['subdued'], 'dog')).toBe(false);
    expect(entryWithholdsWords(['not_herself'], 'dog')).toBe(false);
  });

  it('a mixed entry renders — it is not a run of anything', () => {
    expect(entryWithholdsWords(['lively', 'limping'], 'dog')).toBe(false);
  });

  it('a key this build cannot name is not a concern, so it withholds', () => {
    // The safe direction: an unnameable key must not be able to unlock the words.
    expect(entryWithholdsWords(['from_a_future_vocabulary'], 'cat')).toBe(true);
  });
});
