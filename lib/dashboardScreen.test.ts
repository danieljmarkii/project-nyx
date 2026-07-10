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
  type SymptomCountCard,
  type IntakeRateCard,
} from './dashboardScreen';
import {
  notEnoughData,
  type SymptomCount,
  type DayFrequencyBucket,
  type IntakeRate,
  type RankedFood,
  type RankedProtein,
  type MealTreatComposition,
} from './analytics';
import type { WeightTrend } from './weight';

// ── Fixtures ─────────────────────────────────────────────────────────────────────

function sc(symptomType: string, current: number, prior: number): SymptomCount {
  return { symptomType, current, prior, delta: current - prior };
}

function emptyComposition(): MealTreatComposition {
  return { meal: 0, treat: 0, other: 0, unclassified: 0, total: 0 };
}

function emptyWeightTrend(): WeightTrend {
  return {
    readingCount: 0, seriesLbs: [], latestLbs: null,
    latestOccurredAt: null, earliestOccurredAt: null, deltaLbs: null, direction: null,
  };
}

function populatedWeightTrend(): WeightTrend {
  return {
    readingCount: 3, seriesLbs: [10.4, 9.9, 9.5], latestLbs: 9.5,
    latestOccurredAt: '2026-06-20T08:00:00.000Z',
    earliestOccurredAt: '2026-06-01T08:00:00.000Z',
    deltaLbs: -0.9, direction: 'down',
  };
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
    symptomCounts: [],
    frequencyBuckets: [],
    // Calendar v3 N5b — the frequency card's month-paging inputs. Defaults suffice for
    // these ordering/gating tests (they assert on symptomType/presence, not the calendar).
    monthBuckets: [],
    currentMonth: { year: 2026, month: 4 }, // May 2026 (0-indexed month)
    earliestMonth: null,
    intakeRate: notEnoughData(0, 4) as IntakeRate | ReturnType<typeof notEnoughData>,
    intakeRatePrior: notEnoughData(0, 4) as IntakeRate | ReturnType<typeof notEnoughData>,
    topFoods: NO_FOODS as RankedFood[] | ReturnType<typeof notEnoughData>,
    topProteins: NO_PROTEINS as RankedProtein[] | ReturnType<typeof notEnoughData>,
    composition: emptyComposition(),
    weightTrend: emptyWeightTrend(),
    ...over,
  };
}

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

// ── buildDashboardCards — the adversarial fix: n=1 never earns a verdict colour ────

describe('buildDashboardCards — n=1 establishment gate (PR-2 INSUFFICIENT note)', () => {
  it('a single observation (1 vs 0) is NOT established → its count card stays neutral', () => {
    const cards = buildDashboardCards(baseInput({ symptomCounts: [sc('vomit', 1, 0)] }));
    const card = cards.find((c) => c.kind === 'symptomCount') as SymptomCountCard;
    expect(card.established).toBe(false);
  });

  it('a single PRIOR observation (0 vs 1) is also NOT established', () => {
    const cards = buildDashboardCards(baseInput({ symptomCounts: [sc('vomit', 0, 1)] }));
    const card = cards.find((c) => c.kind === 'symptomCount') as SymptomCountCard;
    expect(card.established).toBe(false);
  });

  it('two or more in either window IS established (a real trend can colour)', () => {
    const rising = buildDashboardCards(baseInput({ symptomCounts: [sc('vomit', 2, 0)] }));
    const falling = buildDashboardCards(baseInput({ symptomCounts: [sc('vomit', 0, 3)] }));
    expect((rising.find((c) => c.kind === 'symptomCount') as SymptomCountCard).established).toBe(true);
    expect((falling.find((c) => c.kind === 'symptomCount') as SymptomCountCard).established).toBe(true);
  });

  it('a RATE below the floor is the notEnoughData sentinel → NOT established, calibrating', () => {
    const cards = buildDashboardCards(baseInput({ intakeRate: notEnoughData(2, 4) }));
    const card = cards.find((c) => c.kind === 'intakeRate') as IntakeRateCard;
    expect(card.established).toBe(false);
    expect(card.state.kind).toBe('calibrating');
  });

  it('a RATE at/above the floor is established and populated', () => {
    const rate: IntakeRate = {
      rate: 0.8,
      finishedMeals: 8,
      ratedMeals: 10,
      freeFedExcluded: 0,
      intakeNotDirectlyObserved: false,
    };
    const cards = buildDashboardCards(baseInput({ intakeRate: rate }));
    const card = cards.find((c) => c.kind === 'intakeRate') as IntakeRateCard;
    expect(card.established).toBe(true);
    expect(card.state.kind).toBe('populated');
  });

  it('carries the prior-window rate through for the "vs last month" delta (B-098)', () => {
    const rate: IntakeRate = {
      rate: 0.29,
      finishedMeals: 2,
      ratedMeals: 7,
      freeFedExcluded: 0,
      intakeNotDirectlyObserved: false,
    };
    const prior: IntakeRate = {
      rate: 0.41,
      finishedMeals: 7,
      ratedMeals: 17,
      freeFedExcluded: 0,
      intakeNotDirectlyObserved: false,
    };
    const cards = buildDashboardCards(baseInput({ intakeRate: rate, intakeRatePrior: prior }));
    const card = cards.find((c) => c.kind === 'intakeRate') as IntakeRateCard;
    expect(card.prior).toBe(prior);
  });
});

describe('buildDashboardCards — ordering & frequency lead', () => {
  it('emits safety cards before intake before descriptive', () => {
    const cards = buildDashboardCards(
      baseInput({
        symptomCounts: [sc('vomit', 3, 1), sc('diarrhea', 2, 2)],
        frequencyBuckets: buckets([0, 1, 2]),
      }),
    );
    const priorities = cards.map((c) => c.priority);
    const firstIntake = priorities.indexOf('intake');
    const firstDescriptive = priorities.indexOf('descriptive');
    const lastSafety = priorities.lastIndexOf('safety');
    expect(lastSafety).toBeLessThan(firstIntake);
    expect(firstIntake).toBeLessThan(firstDescriptive);
  });

  it('adds ONE frequency calendar, for the dominant active symptom only', () => {
    const cards = buildDashboardCards(
      baseInput({
        symptomCounts: [sc('vomit', 4, 0), sc('diarrhea', 1, 0)],
        frequencyBuckets: buckets([0, 2, 2]),
      }),
    );
    const freq = cards.filter((c) => c.kind === 'symptomFrequency');
    expect(freq).toHaveLength(1);
    expect(freq[0].kind === 'symptomFrequency' && freq[0].symptomType).toBe('vomit');
  });

  it('adds NO frequency calendar when every symptom is resolved (current 0)', () => {
    const cards = buildDashboardCards(baseInput({ symptomCounts: [sc('vomit', 0, 3)] }));
    expect(cards.some((c) => c.kind === 'symptomFrequency')).toBe(false);
  });

  it('always emits the intake + descriptive cards (the seeded set)', () => {
    const kinds = buildDashboardCards(baseInput()).map((c) => c.kind);
    expect(kinds).toEqual(
      expect.arrayContaining(['intakeRate', 'topFood', 'topProtein', 'composition']),
    );
  });

  it('always emits the weight card (a populated trend OR the empty logging nudge)', () => {
    expect(buildDashboardCards(baseInput()).some((c) => c.kind === 'weightTrend')).toBe(true);
    expect(
      buildDashboardCards(baseInput({ weightTrend: populatedWeightTrend() })).some(
        (c) => c.kind === 'weightTrend',
      ),
    ).toBe(true);
  });

  it('a POPULATED weight trend leads the safety cluster — after the symptom cards, above intake/food', () => {
    const cards = buildDashboardCards(
      baseInput({
        symptomCounts: [sc('vomit', 3, 1), sc('diarrhea', 2, 2)],
        frequencyBuckets: buckets([0, 1, 2]),
        weightTrend: populatedWeightTrend(),
      }),
    );
    const weight = cards.find((c) => c.kind === 'weightTrend');
    expect(weight?.priority).toBe('safety');
    const kinds = cards.map((c) => c.kind);
    const weightAt = kinds.indexOf('weightTrend');
    // After every symptom card (counts + the frequency calendar)…
    expect(weightAt).toBeGreaterThan(kinds.lastIndexOf('symptomCount'));
    expect(weightAt).toBeGreaterThan(kinds.indexOf('symptomFrequency'));
    // …and above intake + the descriptive food cards.
    expect(weightAt).toBeLessThan(kinds.indexOf('intakeRate'));
    expect(weightAt).toBeLessThan(kinds.indexOf('topFood'));
  });

  it('an EMPTY weight card is a nudge — it heads the descriptive cluster, never the safety slot', () => {
    const cards = buildDashboardCards(
      baseInput({
        symptomCounts: [sc('vomit', 3, 1)],
        frequencyBuckets: buckets([0, 1, 2]),
        weightTrend: emptyWeightTrend(),
      }),
    );
    const weight = cards.find((c) => c.kind === 'weightTrend');
    expect(weight?.priority).toBe('descriptive');
    const kinds = cards.map((c) => c.kind);
    const weightAt = kinds.indexOf('weightTrend');
    // Below the live safety + intake answers it would otherwise crowd…
    expect(weightAt).toBeGreaterThan(kinds.lastIndexOf('symptomCount'));
    expect(weightAt).toBeGreaterThan(kinds.indexOf('intakeRate'));
    // …but leading the descriptive cards (still present + discoverable).
    expect(weightAt).toBeLessThan(kinds.indexOf('topFood'));
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
