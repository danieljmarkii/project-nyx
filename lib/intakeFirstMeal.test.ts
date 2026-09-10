// The intake door's pre-fill (CUL-870 / N-3b; spec §4.5).
//
// Every case here is a RULE rather than a mechanic, and the two that matter most are
// the ones that decline to answer: §4.5's named hazard is the wedge user rating
// *Refused* against a topper during an elimination trial, so an uncertain pre-fill has
// to become the food step rather than the newest food.

const mockGetRecentFoods = jest.fn();
const mockGetPickerFoodById = jest.fn();
jest.mock('./db', () => ({
  getRecentFoods: (...a: unknown[]) => mockGetRecentFoods(...a),
  getPickerFoodById: (...a: unknown[]) => mockGetPickerFoodById(...a),
}));

const mockLoadTrialAllowedSet = jest.fn();
jest.mock('./trialAllowedSet', () => {
  const actual = jest.requireActual('./trialAllowedSet');
  return { ...actual, loadTrialAllowedSet: (...a: unknown[]) => mockLoadTrialAllowedSet(...a) };
});

import { buildTrialContext, type AllowedFood, type TrialFoodRole } from './dietTrial';
import type { PickerFood } from './db';
import type { TrialAllowedSet } from './trialAllowedSet';
import {
  PREFILL_SCAN_LIMIT,
  decideIntakePrefill,
  loadIntakeDoor,
  loadIntakePrefill,
  pickedFoodSource,
} from './intakeFirstMeal';

// Anchored to the RUNNING clock rather than a fixed calendar date, so the fixture
// cannot fail on a boundary instead of on a change (C-29, the time axis). The trial
// starts ten days back, which is more than the ±1 local day any zone can shift.
const NOW = Date.now();
const dayKey = (offsetDays: number) => {
  const d = new Date(NOW + offsetDays * 24 * 60 * 60 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function food(over: Partial<PickerFood> & { id: string }): PickerFood {
  return {
    brand: 'Royal Canin',
    product_name: 'HP',
    format: 'dry',
    food_type: 'meal',
    photo_path: null,
    ...over,
  };
}

function allowed(over: Partial<AllowedFood> & { foodItemId: string }): AllowedFood {
  return {
    foodKey: null,
    label: 'Royal Canin HP',
    role: 'primary_diet' as TrialFoodRole,
    allowedFrom: dayKey(-10),
    allowedUntil: null,
    primaryProtein: null,
    proteins: [],
    ...over,
  };
}

function readySet(foods: AllowedFood[]): TrialAllowedSet {
  const spec = { id: 't1', startedAt: dayKey(-10), endedAt: null, targetDurationDays: 56 };
  return {
    status: 'ready',
    trial: { ...spec, endedAt: null },
    ctx: buildTrialContext(spec, foods),
    foods,
  };
}

const NO_TRIAL: TrialAllowedSet = { status: 'no_trial' };
const UNKNOWN: TrialAllowedSet = { status: 'unknown' };

describe('with no trial running', () => {
  it('offers the most recent MEAL-type food', () => {
    const recents = [food({ id: 'f1' }), food({ id: 'f2' })];
    expect(decideIntakePrefill(recents, NO_TRIAL, NOW)).toEqual({
      kind: 'food',
      food: recents[0],
      source: 'recent_meal',
    });
  });

  it('SKIPS a treat, even when it is the newest thing logged', () => {
    // §4.5: "a treat is never the pre-fill". Sam's cat had a Dreamies at 4pm and her
    // actual dinner at 6am; the bowl the door is about is the dinner.
    const treat = food({ id: 'treat', food_type: 'treat', brand: 'Dreamies', product_name: 'Salmon' });
    const meal = food({ id: 'meal' });
    const decision = decideIntakePrefill([treat, meal], NO_TRIAL, NOW);
    expect(decision).toEqual({ kind: 'food', food: meal, source: 'recent_meal' });
  });

  it('skips an unclassified or `other` food too', () => {
    // Not the same rule as the treat rule, and worth its own case: a refusal attributed
    // to a supplement is a refusal the intake detectors cannot use, and they read
    // non-treat MEALS. `'meal'` is the whole eligible set, so everything else asks.
    const rows = [food({ id: 'a', food_type: null }), food({ id: 'b', food_type: 'other' })];
    expect(decideIntakePrefill(rows, NO_TRIAL, NOW)).toEqual({ kind: 'none' });
  });

  it('a pet with no meals ever opens at the food step', () => {
    expect(decideIntakePrefill([], NO_TRIAL, NOW)).toEqual({ kind: 'none' });
  });
});

describe('under a running trial', () => {
  it('offers the TRIAL DIET rather than the newest food', () => {
    // The contamination case, executed. The topper was logged more recently than the
    // prescribed diet; pre-filling it would put *Refused* against a topper on the exact
    // owner an elimination trial is for.
    const topper = food({ id: 'topper', brand: 'Tesco', product_name: 'Chicken' });
    const diet = food({ id: 'diet' });
    const set = readySet([allowed({ foodItemId: 'diet' })]);
    const decision = decideIntakePrefill([topper, diet], set, NOW);
    expect(decision).toEqual({ kind: 'food', food: diet, source: 'trial_diet' });
  });

  it('falls back to the trial diet the pet has not eaten yet — day one', () => {
    const topper = food({ id: 'topper' });
    const set = readySet([allowed({ foodItemId: 'never-eaten' })]);
    expect(decideIntakePrefill([topper], set, NOW)).toEqual({
      kind: 'trial_food',
      foodItemId: 'never-eaten',
    });
  });

  it('ignores a permitted TREAT on the trial list — it is not the diet', () => {
    // `permitted_treat` is permitted, not prescribed. Offering it would name a treat as
    // the trial diet on a card whose whole job is to say which bowl she left.
    const set = readySet([allowed({ foodItemId: 'chew', role: 'permitted_treat' })]);
    expect(decideIntakePrefill([food({ id: 'chew' })], set, NOW)).toEqual({ kind: 'none' });
  });

  it('ignores `permitted_other` — the role this build could not read', () => {
    // `narrowTrialFoodRole` puts an unrecognised role here (B-556). Pre-filling one
    // would name a food as the trial diet on the strength of not understanding it.
    const set = readySet([allowed({ foodItemId: 'x', role: 'permitted_other' })]);
    expect(decideIntakePrefill([food({ id: 'x' })], set, NOW)).toEqual({ kind: 'none' });
  });

  it('does not offer a trial food the pet ate as a TREAT-typed row', () => {
    // Both filters have to hold at once. The membership arm alone would let a
    // `primary_diet` row whose cache entry is treat-typed through.
    const set = readySet([allowed({ foodItemId: 'diet' })]);
    const asTreat = food({ id: 'diet', food_type: 'treat' });
    expect(decideIntakePrefill([asTreat], set, NOW)).toEqual({
      kind: 'trial_food',
      foodItemId: 'diet',
    });
  });
});

describe('the uncertain answers — all of them are the food step', () => {
  it('an unhydrated allowed set does NOT read as "no trial"', () => {
    // `unknown` is a live state on a fresh install or a re-login: `diet_trials` has
    // hydrated and `diet_trial_foods` has not. Treating it as "no trial" is precisely
    // how a topper becomes the pre-fill on a trial pet.
    expect(decideIntakePrefill([food({ id: 'topper' })], UNKNOWN, NOW)).toEqual({ kind: 'none' });
  });

  it('a running trial with no primary diet in force today asks instead of guessing', () => {
    const set = readySet([allowed({ foodItemId: 'x', role: 'supplement' })]);
    expect(decideIntakePrefill([food({ id: 'other' })], set, NOW)).toEqual({ kind: 'none' });
  });

  it('a membership that has not started yet is not in force', () => {
    // Dated membership, asked through the shipped predicate. A food allowed FROM
    // tomorrow is not today's diet.
    const set = readySet([allowed({ foodItemId: 'future', allowedFrom: dayKey(3) })]);
    expect(decideIntakePrefill([food({ id: 'future' })], set, NOW)).toEqual({ kind: 'none' });
  });
});

describe('the loader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRecentFoods.mockResolvedValue([]);
    mockLoadTrialAllowedSet.mockResolvedValue(NO_TRIAL);
    mockGetPickerFoodById.mockResolvedValue(null);
  });

  it('reads the UNBOUNDED shelf, not the picker’s time-bounded recents', async () => {
    // §4.5 names the difference explicitly. A time bound would drop the food of a pet
    // whose owner logs sporadically — which is most owners, most weeks.
    await loadIntakePrefill('p1', NOW);
    expect(mockGetRecentFoods).toHaveBeenCalledWith('p1', null, PREFILL_SCAN_LIMIT);
  });

  it('resolves the trial-diet fallback through the food cache', async () => {
    mockLoadTrialAllowedSet.mockResolvedValue(readySet([allowed({ foodItemId: 'diet' })]));
    const row = food({ id: 'diet' });
    mockGetPickerFoodById.mockResolvedValue(row);
    await expect(loadIntakePrefill('p1', NOW)).resolves.toEqual({
      food: row,
      source: 'trial_diet',
    });
    expect(mockGetPickerFoodById).toHaveBeenCalledWith('diet');
  });

  it('returns null when the trial diet’s food row is missing or archived', async () => {
    mockLoadTrialAllowedSet.mockResolvedValue(readySet([allowed({ foodItemId: 'diet' })]));
    mockGetPickerFoodById.mockResolvedValue(null);
    await expect(loadIntakePrefill('p1', NOW)).resolves.toBeNull();
  });

  it.each(['treat', null, 'other'] as const)(
    'applies the food-type filter to the TRIAL FALLBACK too — %s',
    async (foodType) => {
      // The adversarial pass's break, and the reason this case lives at the LOADER: the
      // decision layer never sees a `food_type` for the fallback (`AllowedFood` carries
      // none), so the sibling case up in `under a running trial` asserted a rule this
      // function was quietly dropping. `food_items.food_type` is nullable with no default
      // (migration 010 — "legacy rows, or user skipped"), and nothing scopes a
      // `primary_diet` pick, so an unclassified prescription diet is an ordinary state.
      //
      // What it costs if it slips through: the refusal she records is invisible to
      // `intake_decline`, to the report and to analytics (all filter `foodType ===
      // 'meal'`), AND the completion card renders no intake row for an unclassified food
      // — so there is no correction affordance and no cue anything went wrong.
      mockLoadTrialAllowedSet.mockResolvedValue(readySet([allowed({ foodItemId: 'diet' })]));
      mockGetPickerFoodById.mockResolvedValue(food({ id: 'diet', food_type: foodType }));
      await expect(loadIntakePrefill('p1', NOW)).resolves.toBeNull();
    },
  );

  it('still offers a `meal`-typed trial diet through the fallback', async () => {
    // The other direction, so the filter above cannot be satisfied by refusing everything.
    mockLoadTrialAllowedSet.mockResolvedValue(readySet([allowed({ foodItemId: 'diet' })]));
    const row = food({ id: 'diet', food_type: 'meal' });
    mockGetPickerFoodById.mockResolvedValue(row);
    await expect(loadIntakePrefill('p1', NOW)).resolves.toEqual({
      food: row,
      source: 'trial_diet',
    });
  });

  it('carries the trial set out, so a food picked LATER can still be named', async () => {
    const set = readySet([allowed({ foodItemId: 'diet' })]);
    mockLoadTrialAllowedSet.mockResolvedValue(set);
    await expect(loadIntakeDoor('p1', NOW)).resolves.toEqual({ prefill: null, trial: set });
  });
});

describe('naming a food the owner picked herself', () => {
  it('keeps the TRIAL naming when she picks the trial diet back', () => {
    // §4.5 installs the naming so a rating against a topper is a deliberate act. The one
    // moment it does any work is *Change food ›* — so it has to survive it.
    const set = readySet([allowed({ foodItemId: 'diet' })]);
    expect(pickedFoodSource(set, food({ id: 'diet' }), NOW)).toBe('trial_diet');
  });

  it('claims NOTHING about a food she picked that is not the trial diet', () => {
    // The first cut hardcoded `'recent_meal'`, which printed "her most recent food" under
    // a bag `getRecentFoods` was never asked about and the pet may never have eaten.
    const set = readySet([allowed({ foodItemId: 'diet' })]);
    expect(pickedFoodSource(set, food({ id: 'topper' }), NOW)).toBe('picked');
    expect(pickedFoodSource(NO_TRIAL, food({ id: 'anything' }), NOW)).toBe('picked');
  });

  it('makes no trial claim while the trial set is unknown', () => {
    expect(pickedFoodSource(UNKNOWN, food({ id: 'diet' }), NOW)).toBe('picked');
  });

  it('does not call a permitted TREAT on the list the trial diet', () => {
    const set = readySet([allowed({ foodItemId: 'chew', role: 'permitted_treat' })]);
    expect(pickedFoodSource(set, food({ id: 'chew' }), NOW)).toBe('picked');
  });

  it('never throws — a failed read is the food step, which is a working screen', async () => {
    mockGetRecentFoods.mockRejectedValue(new Error('db not open'));
    await expect(loadIntakePrefill('p1', NOW)).resolves.toBeNull();
  });
});
