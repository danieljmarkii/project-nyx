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
jest.mock('./db', () => ({ getDb: () => ({ getAllAsync: jest.fn(), getFirstAsync: jest.fn() }) }));
jest.mock('./feedingArrangements', () => ({ getActiveArrangementsForPet: jest.fn() }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AnalyticsMeal } from './analytics';
import {
  LOOK_REFUSAL_RECENCY_DAYS,
  LOOK_WITHHELD_STORAGE_KEY,
  clearLookWithheld,
  intakeArm,
  lookWithheld,
  lookWithheldState,
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

// ── The cadence table (Data) ─────────────────────────────────────────────────
//
// "2 of the last 3 within 2 days" is a threshold on a ROW COUNT read through a TIME
// window, so its reachability depends entirely on how often an owner rates. The loader
// bounds the rows by `LOOK_REFUSAL_RECENCY_DAYS` first and the arm takes the last three
// of what survives — so this table is what the arm can and cannot see, per feeder.
describe('cadence — the arm’s reachability by feeding frequency', () => {
  /** Meals every `perDay` times a day, going back `days`, all with one rating. */
  function cadence(perDay: number, days: number, rating: string): AnalyticsMeal[] {
    const out: AnalyticsMeal[] = [];
    const gap = 24 / perDay;
    for (let i = 0; i < perDay * days; i += 1) out.push(meal(i * gap + 1, rating));
    return out;
  }

  /** What the loader would hand the arm: only rows inside the recency bound. */
  function inBound(meals: AnalyticsMeal[]): AnalyticsMeal[] {
    return meals.filter((m) => m.ms >= NOW - LOOK_REFUSAL_RECENCY_DAYS * MS_PER_DAY);
  }

  it.each([
    // perDay, refusals reachable inside the 2-day bound, arm fires on all-refused
    [3, 6, true],
    [2, 4, true],
    [1, 2, true],
  ])('a %ix-a-day feeder has %i qualifying meals in the bound → fires: %s', (perDay, expected, fires) => {
    const rows = inBound(cadence(perDay, 7, 'refused'));
    expect(rows).toHaveLength(expected);
    expect(intakeArm(rows)).toBe(fires);
  });

  it('a once-a-day dog reaches the threshold on two refused dinners', () => {
    // Two of two, not two of three — the threshold is on the numerator; "the last three"
    // is a cap on how far back the arm looks, never a minimum sample. A dog who refused
    // both of his last two dinners is exactly the animal this arm exists for.
    const rows = inBound(cadence(1, 7, 'refused'));
    expect(rows).toHaveLength(2);
    expect(intakeArm(rows)).toBe(true);
  });

  it('a once-a-WEEK rater can never reach it — a gap is not a fact', () => {
    // The fourth adversarial pass's own counterexample: without the time bound this dog
    // would carry a September concern into December.
    const weekly = [meal(24 * 6, 'refused'), meal(24 * 13, 'refused'), meal(24 * 20, 'refused')];
    expect(inBound(weekly)).toHaveLength(0);
    expect(intakeArm(inBound(weekly))).toBe(false);
    // Unbounded, the same three rows fire — which is the whole point of bounding them.
    expect(intakeArm(weekly)).toBe(true);
  });

  it('a once-a-day dog whose ONE meal in the bound was refused does not fire', () => {
    const rows = [meal(3, 'refused')];
    expect(intakeArm(rows)).toBe(false);
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
