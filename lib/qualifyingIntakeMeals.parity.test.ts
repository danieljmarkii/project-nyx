// The qualifying-set PARITY test (CUL-873 / N-4b, the daily-look spec's E-5).
//
// WHAT IT PROTECTS. `qualifyingIntakeMeals` is the ONE definition of a meal the intake
// detectors are willing to speak about: rated, non-treat, non-free-fed (§11 #1 treats
// finish at a ceiling and would mask a refusal; §11 #6 a free-fed food's intake is not
// directly observed). Before this PR the finished-rate CALLED it and the decline calendar
// carried a hand-written inverse of it in a loop guard. Both were correct on the day they
// were written, and nothing made them stay correct.
//
// WHY IT MATTERS MORE NOW. T-20 puts a THIRD reader on that definition — the daily look's
// record-local withheld arm, which decides whether Home may draw *nothing unusual* under a
// pet whose eating needs attention. N-4a already measured what happens when a surface
// reads the same COLUMN instead of the same PREDICATE: a refused pill-pocket treat printed
// *Call your vet today.* So this test asserts the equivalence itself over a cross-product
// of meal shapes, not the fact that one function currently calls another — a re-inlined
// copy that drifts reds here even though the types still line up.
//
// It is a PROPERTY test over the cross-product, not an example list — C's Class-A lesson
// ("an example list is what let B-414 ship a `chicken -` key under a docstring claiming
// idempotence"), applied to a filter instead of a canonicalizer.

// `lib/analytics` reaches `lib/supabase` through `feedingArrangements` → `sync`, which
// throws at import when the env is unset. The two pure filters under test never touch
// either, so both are stubbed at the module boundary — the same shape `analytics.test.ts`
// uses, and for the same reason.
jest.mock('./db', () => ({ getDb: () => ({ getAllAsync: jest.fn(), getFirstAsync: jest.fn() }) }));
jest.mock('./feedingArrangements', () => ({ getActiveArrangementsForPet: jest.fn() }));

import {
  qualifyingIntakeMeals,
  isRefusedOrPickedMeal,
  computeIntakeDeclineFrequencyForMonth,
  type AnalyticsMeal,
} from './analytics';

const MS_PER_DAY = 86_400_000;

/** Every shape the filter is allowed to care about, crossed. */
const FOOD_TYPES: (string | null)[] = ['meal', 'treat', 'other', null];
const RATINGS: (string | null)[] = ['refused', 'picked', 'some', 'most', 'all', null, 'bogus'];
const FOOD_IDS: (string | null)[] = ['f-normal', 'f-freefed', null];
const FREE_FED = new Set(['f-freefed']);

function cross(): AnalyticsMeal[] {
  const out: AnalyticsMeal[] = [];
  let i = 0;
  for (const foodType of FOOD_TYPES) {
    for (const intakeRating of RATINGS) {
      for (const foodItemId of FOOD_IDS) {
        out.push({
          // Spread across one UTC day so every row lands in the month grid below.
          ms: Date.UTC(2026, 6, 15, 6) + i * 1000,
          foodItemId,
          foodLabel: null,
          foodType,
          primaryProtein: null,
          intakeRating,
        });
        i += 1;
      }
    }
  }
  return out;
}

/** The rule, written out longhand — independently of the implementation under test. */
function qualifiesByHand(m: AnalyticsMeal): boolean {
  const freeFed = m.foodItemId !== null && FREE_FED.has(m.foodItemId);
  return m.foodType !== 'treat' && m.intakeRating !== null && m.intakeRating !== undefined && !freeFed;
}

describe('qualifyingIntakeMeals — the one definition, over the whole cross-product', () => {
  const rows = cross();

  it('covers every combination of food type × rating × free-fed', () => {
    expect(rows).toHaveLength(FOOD_TYPES.length * RATINGS.length * FOOD_IDS.length);
  });

  it('matches the rule written longhand, row for row', () => {
    const got = new Set(qualifyingIntakeMeals(rows, FREE_FED));
    for (const row of rows) {
      expect([row.foodType, row.intakeRating, row.foodItemId, got.has(row)]).toEqual([
        row.foodType,
        row.intakeRating,
        row.foodItemId,
        qualifiesByHand(row),
      ]);
    }
  });

  it('drops every treat, however it was rated — the pill-pocket case', () => {
    const treats = rows.filter((r) => r.foodType === 'treat');
    expect(treats.length).toBeGreaterThan(0);
    const kept = new Set(qualifyingIntakeMeals(rows, FREE_FED));
    for (const t of treats) expect(kept.has(t)).toBe(false);
  });

  it('drops every free-fed row — a free-fed absence is never "didn’t eat"', () => {
    const kept = qualifyingIntakeMeals(rows, FREE_FED);
    expect(kept.every((m) => m.foodItemId !== 'f-freefed')).toBe(true);
  });

  it('drops every unrated row — a logging gap is not anorexia', () => {
    const kept = qualifyingIntakeMeals(rows, FREE_FED);
    expect(kept.every((m) => m.intakeRating != null)).toBe(true);
  });
});

describe('the decline calendar counts exactly the qualifying, unfinished meals', () => {
  const rows = cross();

  // The calendar's own arithmetic, derived from the SHARED filter rather than from the
  // loop under test: a divergence in either direction fails.
  function expectedUnfinished(): number {
    return qualifyingIntakeMeals(rows, FREE_FED).filter(
      (m) => m.intakeRating !== 'most' && m.intakeRating !== 'all',
    ).length;
  }

  it('the month bucket total equals the shared filter minus the finished meals', () => {
    const buckets = computeIntakeDeclineFrequencyForMonth(
      rows,
      FREE_FED,
      { year: 2026, month: 6 },
      Date.UTC(2026, 6, 20, 12),
    );
    const total = buckets.reduce((n, b) => n + b.total, 0);
    expect(total).toBe(expectedUnfinished());
    // And it is not vacuously zero — the cross-product really does reach the counter.
    expect(total).toBeGreaterThan(0);
  });

  it('a treat refusal is counted by neither the filter nor the calendar', () => {
    const treatRefusal: AnalyticsMeal = {
      ms: Date.UTC(2026, 6, 15, 7),
      foodItemId: 'f-treat',
      foodLabel: null,
      foodType: 'treat',
      primaryProtein: null,
      intakeRating: 'refused',
    };
    expect(qualifyingIntakeMeals([treatRefusal], FREE_FED)).toHaveLength(0);
    const buckets = computeIntakeDeclineFrequencyForMonth(
      [treatRefusal],
      FREE_FED,
      { year: 2026, month: 6 },
      Date.UTC(2026, 6, 20, 12),
    );
    expect(buckets.reduce((n, b) => n + b.total, 0)).toBe(0);
    // …and it is a refusal by the SCALE, which is exactly why the qualifying filter has
    // to run first: the rating half says yes and the food-type half says no.
    expect(isRefusedOrPickedMeal(treatRefusal)).toBe(true);
  });
});

describe('isRefusedOrPickedMeal — the positive intake fact, on the WSAVA scale', () => {
  const meal = (intakeRating: string | null): AnalyticsMeal => ({
    ms: 0,
    foodItemId: null,
    foodLabel: null,
    foodType: 'meal',
    primaryProtein: null,
    intakeRating,
  });

  it.each([
    ['refused', true],
    ['picked', true],
    ['some', false],
    ['most', false],
    ['all', false],
  ] as const)('%s → %s', (rating, expected) => {
    expect(isRefusedOrPickedMeal(meal(rating))).toBe(expected);
  });

  it('an unrated meal is NEVER a refusal (the struck second arm)', () => {
    expect(isRefusedOrPickedMeal(meal(null))).toBe(false);
  });

  it('an unknown rating string is never a refusal either', () => {
    expect(isRefusedOrPickedMeal(meal('devoured'))).toBe(false);
  });

  it('is not the inverse of "finished" — `some` is neither', () => {
    // The mistake this pins: `!isFinishedMeal` would fold `some` in, and a cat who ate
    // half her dinner is not a cat whose eating needs attention.
    expect(isRefusedOrPickedMeal(meal('some'))).toBe(false);
  });
});
