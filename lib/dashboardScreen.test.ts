// dashboardScreen imports ./dashboardCards → ./analytics → ./db (expo-sqlite) +
// ./feedingArrangements. Nothing here touches the DB — stub them so the native module
// chain isn't loaded under jest (the dashboardCards.test.ts / analytics.test.ts pattern).
jest.mock('./db', () => ({ getDb: () => ({}) }));
jest.mock('./feedingArrangements', () => ({ getActiveArrangementsForPet: jest.fn() }));

import {
  orderDashboardCards,
  buildDashboardCards,
  selectDashboardState,
  sparkFromBuckets,
  type DashboardCardPriority,
  type TopFoodCard,
  type TopProteinCard,
} from './dashboardScreen';
import {
  notEnoughData,
  type SymptomCount,
  type DayFrequencyBucket,
  type RankedFood,
  type RankedProtein,
  type MealTreatComposition,
} from './analytics';
import type { NoticedCardModel } from './lookPatterns';

// ── Fixtures ─────────────────────────────────────────────────────────────────────

function sc(symptomType: string, current: number, prior: number): SymptomCount {
  return { symptomType, current, prior, delta: current - prior };
}

function emptyComposition(): MealTreatComposition {
  return { meal: 0, treat: 0, other: 0, unclassified: 0, total: 0 };
}

function buckets(perDay: number[], type = 'vomit'): DayFrequencyBucket[] {
  return perDay.map((n, i) => ({
    date: `2026-05-${String(i + 1).padStart(2, '0')}`,
    total: n,
    byType: n > 0 ? { [type]: n } : {},
  }));
}

const NO_FOODS = notEnoughData(0, 4);
const NO_PROTEINS = notEnoughData(0, 4);

function baseInput(over: Partial<Parameters<typeof buildDashboardCards>[0]> = {}) {
  return {
    topFoods: NO_FOODS as RankedFood[] | ReturnType<typeof notEnoughData>,
    topProteins: NO_PROTEINS as RankedProtein[] | ReturnType<typeof notEnoughData>,
    composition: emptyComposition(),
    ...over,
  };
}

const FOOD: RankedFood = {
  foodItemId: 'food-1',
  label: 'Salmon kibble',
  foodType: 'meal',
  count: 6,
  shareOfDiet: 0.75,
  finishedRate: 0.8,
  ratedMeals: 5,
  isTreat: false,
};

const PROTEIN: RankedProtein = {
  protein: 'salmon',
  count: 6,
  shareOfDiet: 0.75,
  finishedRate: 0.8,
  ratedMeals: 5,
  isTreat: false,
};

// ── orderDashboardCards — safety leads (Principle 3 / §6) ─────────────────────────

describe('orderDashboardCards — safety leads, stable within class', () => {
  it('moves safety ahead of intake ahead of descriptive regardless of input order', () => {
    const input: { key: string; priority: DashboardCardPriority }[] = [
      { key: 'food', priority: 'descriptive' },
      { key: 'intake', priority: 'intake' },
      { key: 'symptom', priority: 'safety' },
      { key: 'protein', priority: 'descriptive' },
    ];
    expect(orderDashboardCards(input).map((c) => c.key)).toEqual([
      'symptom',
      'intake',
      'food',
      'protein',
    ]);
  });

  it('the observation class sits AFTER intake and BEFORE descriptive (CUL-874 / E-13)', () => {
    const input: { key: string; priority: DashboardCardPriority }[] = [
      { key: 'food', priority: 'descriptive' },
      { key: 'noticed', priority: 'observation' },
      { key: 'intake', priority: 'intake' },
      { key: 'symptom', priority: 'safety' },
    ];
    expect(orderDashboardCards(input).map((c) => c.key)).toEqual([
      'symptom',
      'intake',
      'noticed',
      'food',
    ]);
  });

  it('is a stable sort — within-class input order (analytics ranking) is preserved', () => {
    const input: { key: string; priority: DashboardCardPriority }[] = [
      { key: 'vomit', priority: 'safety' },
      { key: 'diarrhea', priority: 'safety' },
      { key: 'lethargy', priority: 'safety' },
    ];
    expect(orderDashboardCards(input).map((c) => c.key)).toEqual(['vomit', 'diarrhea', 'lethargy']);
  });

  it('does not mutate the input array', () => {
    const input = [{ priority: 'descriptive' as const }, { priority: 'safety' as const }];
    const snapshot = [...input];
    orderDashboardCards(input);
    expect(input).toEqual(snapshot);
  });
});

// ── buildDashboardCards — the descriptive set (Design v2; CUL-1071) ──────────────────
//
// The KPI column (symptom counts, calendar, Meals finished, the old weight card) retired
// with the flag; the month and the v2 weight card read on their own. What the builder
// still owns is the three descriptive cards and their honestly derived display state.

describe('buildDashboardCards — the descriptive cards', () => {
  it('always emits top food, top protein and composition, in that order', () => {
    expect(buildDashboardCards(baseInput()).map((c) => c.key)).toEqual([
      'topFood',
      'topProtein',
      'composition',
    ]);
    expect(buildDashboardCards(baseInput()).every((c) => c.priority === 'descriptive')).toBe(true);
  });

  it('a ranking below its floor is the notEnoughData sentinel → calibrating, with what remains', () => {
    const cards = buildDashboardCards(
      baseInput({ topFoods: notEnoughData(1, 4), topProteins: notEnoughData(3, 4) }),
    );
    const food = cards.find((c) => c.kind === 'topFood') as TopFoodCard;
    const protein = cards.find((c) => c.kind === 'topProtein') as TopProteinCard;
    expect(food.state).toEqual({ kind: 'calibrating', samples: 1, needed: 4, remaining: 3 });
    expect(protein.state).toEqual({ kind: 'calibrating', samples: 3, needed: 4, remaining: 1 });
  });

  it('a ranking at/above its floor is populated and carries the result through untouched', () => {
    const foods = [FOOD];
    const proteins = [PROTEIN];
    const cards = buildDashboardCards(baseInput({ topFoods: foods, topProteins: proteins }));
    const food = cards.find((c) => c.kind === 'topFood') as TopFoodCard;
    const protein = cards.find((c) => c.kind === 'topProtein') as TopProteinCard;
    expect(food.state.kind).toBe('populated');
    expect(food.result).toBe(foods);
    expect(protein.state.kind).toBe('populated');
    expect(protein.result).toBe(proteins);
  });

  it('carries the composition through as given', () => {
    const composition: MealTreatComposition = { meal: 5, treat: 1, other: 0, unclassified: 0, total: 6 };
    const card = buildDashboardCards(baseInput({ composition })).find((c) => c.kind === 'composition');
    expect(card).toEqual({ kind: 'composition', key: 'composition', priority: 'descriptive', composition });
  });
});

// ── selectDashboardState — cold-start gate (§10) ──────────────────────────────────

describe('selectDashboardState — cold-start vs ready (§10)', () => {
  it('empty when there are no symptoms AND no feedings AND no weight', () => {
    expect(
      selectDashboardState({ symptomCounts: [], composition: emptyComposition(), weightReadingCount: 0 }),
    ).toBe('empty');
  });

  it('ready when there is any symptom history', () => {
    expect(
      selectDashboardState({
        symptomCounts: [sc('vomit', 1, 0)],
        composition: emptyComposition(),
        weightReadingCount: 0,
      }),
    ).toBe('ready');
  });

  it('ready when there are logged feedings even with no symptoms', () => {
    const composition: MealTreatComposition = { meal: 5, treat: 1, other: 0, unclassified: 0, total: 6 };
    expect(selectDashboardState({ symptomCounts: [], composition, weightReadingCount: 0 })).toBe('ready');
  });

  it('ready when there are only weight readings (a pet you have only ever weighed)', () => {
    expect(
      selectDashboardState({ symptomCounts: [], composition: emptyComposition(), weightReadingCount: 2 }),
    ).toBe('ready');
  });
});

// ── sparkFromBuckets ───────────────────────────────────────────────────────────

describe('sparkFromBuckets', () => {
  it('maps each day to that symptom type\'s count (0 for a clean day)', () => {
    const b = buckets([0, 2, 0, 1], 'vomit');
    expect(sparkFromBuckets(b, 'vomit')).toEqual([0, 2, 0, 1]);
  });

  it('returns all zeros for a symptom type that never occurs in the window', () => {
    const b = buckets([0, 2, 1], 'vomit');
    expect(sparkFromBuckets(b, 'lethargy')).toEqual([0, 0, 0]);
  });
});


// ── Noticed: *What you noticed* (CUL-874 / N-5) ───────────────────────────────────
//
// The card's own model is tested in lib/lookPatterns.test.ts; these are the things only
// the BUILDER can be wrong about — whether the card is emitted, and where it lands.

describe('buildDashboardCards — the Noticed card', () => {
  const model: NoticedCardModel = {
    coverageLine: 'Counted across the 24 of the last 28 days you answered.',
    rows: [],
    withheldLine: null,
    withheldSpanLine: null,
    calibrationLine: null,
    multiSelectNote: null,
    empty: true,
    pairing: null,
    wordDaysInWindow: new Map(),
  };

  it('lands above every descriptive card (the observation class, E-13)', () => {
    const cards = buildDashboardCards(baseInput({ topFoods: [FOOD], noticed: model }));
    const keys = cards.map((c) => c.key);
    expect(keys).toEqual(['whatYouNoticed', 'topFood', 'topProtein', 'composition']);
    expect(cards[0].priority).toBe('observation');
  });

  it('is emitted in its EMPTY state too — §7 draws the room behind the door on purpose', () => {
    const cards = buildDashboardCards(baseInput({ noticed: model }));
    const card = cards.find((c) => c.kind === 'whatYouNoticed');
    expect(card).toEqual({ kind: 'whatYouNoticed', key: 'whatYouNoticed', priority: 'observation', model });
  });

  it('absent or null model (Noticed not live for this pet): no card, and the rest is identical', () => {
    const absent = buildDashboardCards(baseInput());
    const withNull = buildDashboardCards(baseInput({ noticed: null }));
    expect(absent.some((c) => c.kind === 'whatYouNoticed')).toBe(false);
    expect(withNull).toEqual(absent);
    const withCard = buildDashboardCards(baseInput({ noticed: model }));
    expect(withCard.filter((c) => c.kind !== 'whatYouNoticed')).toEqual(absent);
  });
});
