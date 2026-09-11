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
  type CalendarCard,
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
import type { NoticedCardModel } from './lookPatterns';

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
    // B-310: current-month intake-decline buckets. Default empty → no "Meals" lens unless a
    // test supplies a day with an unfinished meal.
    intakeDeclineMonthBuckets: [] as DayFrequencyBucket[],
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

  it('adds ONE calendar card with a lens per ACTIVE symptom, dominant first (B-310)', () => {
    const cards = buildDashboardCards(
      baseInput({
        symptomCounts: [sc('vomit', 4, 0), sc('diarrhea', 1, 0)],
        frequencyBuckets: buckets([0, 2, 2]),
      }),
    );
    const cal = cards.filter((c) => c.kind === 'calendar');
    expect(cal).toHaveLength(1);
    const card = cal[0] as CalendarCard;
    // BOTH active symptoms are viewable now (the fix for the invisible-second-symptom gap),
    // dominant (higher current) first — views[0] is the default lens.
    expect(card.views.map((v) => v.symptomType)).toEqual(['vomit', 'diarrhea']);
    expect(card.views.every((v) => v.kind === 'symptom')).toBe(true);
  });

  it('a RESOLVED symptom (current 0) gets its count card but NO calendar lens', () => {
    const cards = buildDashboardCards(
      baseInput({ symptomCounts: [sc('vomit', 3, 0), sc('diarrhea', 0, 4)] }),
    );
    const card = cards.find((c) => c.kind === 'calendar') as CalendarCard;
    expect(card.views.map((v) => v.symptomType)).toEqual(['vomit']); // diarrhea is resolved → no lens
  });

  it('adds NO calendar when every symptom is resolved AND there is no intake decline', () => {
    const cards = buildDashboardCards(baseInput({ symptomCounts: [sc('vomit', 0, 3)] }));
    expect(cards.some((c) => c.kind === 'calendar')).toBe(false);
  });

  // ── B-310: the intake ("Meals") lens ────────────────────────────────────────────
  it('adds a "Meals" (intake) lens AFTER the symptom lenses when the month has a decline', () => {
    const cards = buildDashboardCards(
      baseInput({
        symptomCounts: [sc('vomit', 3, 0)],
        intakeDeclineMonthBuckets: buckets([0, 1, 0]), // one unfinished-meal day this month
      }),
    );
    const card = cards.find((c) => c.kind === 'calendar') as CalendarCard;
    expect(card.views.map((v) => v.kind)).toEqual(['symptom', 'intake']);
    // The intake lens carries the seeded intake buckets for a flash-free first paint.
    expect(card.intakeDeclineMonthBuckets).toHaveLength(3);
  });

  it('emits a calendar with ONLY the intake lens for a pet with a decline but no active symptom (Sam)', () => {
    const cards = buildDashboardCards(
      baseInput({ intakeDeclineMonthBuckets: buckets([0, 2]) }), // grazing cat, meals left, no vomiting
    );
    const card = cards.find((c) => c.kind === 'calendar') as CalendarCard;
    expect(card).toBeTruthy();
    expect(card.views).toEqual([{ key: 'intake', kind: 'intake' }]);
  });

  it('does NOT add the intake lens when the current month is clean (never a reassuring empty field)', () => {
    const cards = buildDashboardCards(
      baseInput({
        symptomCounts: [sc('vomit', 3, 0)],
        intakeDeclineMonthBuckets: buckets([0, 0, 0]), // meals all finished this month
      }),
    );
    const card = cards.find((c) => c.kind === 'calendar') as CalendarCard;
    expect(card.views.some((v) => v.kind === 'intake')).toBe(false);
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
    // After every symptom card (counts + the calendar)…
    expect(weightAt).toBeGreaterThan(kinds.lastIndexOf('symptomCount'));
    expect(weightAt).toBeGreaterThan(kinds.indexOf('calendar'));
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


// ── Noticed: *What you noticed* (CUL-874 / N-5) ───────────────────────────────────
//
// The card's own model is tested in lib/lookPatterns.test.ts; these are the two things
// only the BUILDER can be wrong about — where the card lands, and whether Patterns off
// the flag is byte-identical.

describe('buildDashboardCards — the Noticed card', () => {
  const model: NoticedCardModel = {
    coverageLine: 'Counted across the 24 of the last 28 days you answered.',
    rows: [],
    withheldLine: null,
    calibrationLine: null,
    empty: true,
    pairing: null,
    wordDaysInWindow: new Map(),
  };

  it('lands after the intake card and above every descriptive one', () => {
    const cards = buildDashboardCards(baseInput({ symptomCounts: [sc('vomit', 3, 1)], noticed: model }));
    const keys = cards.map((c) => c.key);
    expect(keys.indexOf('whatYouNoticed')).toBeGreaterThan(keys.indexOf('intakeRate'));
    expect(keys.indexOf('whatYouNoticed')).toBeLessThan(keys.indexOf('topFood'));
    expect(keys.indexOf('whatYouNoticed')).toBeLessThan(keys.indexOf('composition'));
  });

  it('never leads a symptom count card — it must not sit over the evidence it can seem to argue with', () => {
    const cards = buildDashboardCards(baseInput({ symptomCounts: [sc('vomit', 3, 1)], noticed: model }));
    const keys = cards.map((c) => c.key);
    expect(keys.indexOf('symptom:vomit')).toBeLessThan(keys.indexOf('whatYouNoticed'));
  });

  it('is emitted in its EMPTY state too — §7 draws the room behind the door on purpose', () => {
    const cards = buildDashboardCards(baseInput({ noticed: model }));
    expect(cards.some((c) => c.kind === 'whatYouNoticed')).toBe(true);
  });

  it('FLAG OFF: the card is absent and every other card is byte-identical', () => {
    const off = buildDashboardCards(baseInput({ symptomCounts: [sc('vomit', 3, 1), sc('itch', 0, 4)] }));
    const withNull = buildDashboardCards(
      baseInput({ symptomCounts: [sc('vomit', 3, 1), sc('itch', 0, 4)], noticed: null }),
    );
    expect(off.some((c) => c.kind === 'whatYouNoticed')).toBe(false);
    // The rank shift (descriptive 2 → 3) reorders nothing, because the ordering is a
    // stable sort on RELATIVE rank and there is no rank-2 card to slot between them.
    expect(withNull).toEqual(off);
    expect(off.map((c) => c.key)).toEqual([
      'symptom:vomit', 'symptom:itch', 'calendar', 'intakeRate',
      'weightTrend', 'topFood', 'topProtein', 'composition',
    ]);
  });
});

describe('buildDashboardCards — CUL-845 gate 2, the zero-count audit', () => {
  function noticedWith(words: [string, number][]): NoticedCardModel {
    return {
      coverageLine: null,
      rows: [],
      withheldLine: null,
      calibrationLine: null,
      empty: false,
      pairing: null,
      wordDaysInWindow: new Map(words),
    };
  }

  it('30 days of Scratching more and no itch rows renders NO itch card — not even at zero', () => {
    const cards = buildDashboardCards(
      baseInput({
        symptomCounts: [sc('vomit', 2, 1), sc('itch', 0, 5)],
        noticed: noticedWith([['scratching_more', 30]]),
      }),
    );
    expect(cards.some((c) => c.key === 'symptom:itch')).toBe(false);
    // And nothing else moved: the honest cards are all still there.
    expect(cards.some((c) => c.key === 'symptom:vomit')).toBe(true);
  });

  it('a NON-zero itch count stands beside the word — the disagreement is said, not hidden', () => {
    const cards = buildDashboardCards(
      baseInput({
        symptomCounts: [sc('itch', 2, 5)],
        noticed: noticedWith([['scratching_more', 30]]),
      }),
    );
    expect(cards.some((c) => c.key === 'symptom:itch')).toBe(true);
  });

  it('a zero with NO contradicting word still renders — an honest zero is not suppressed', () => {
    const cards = buildDashboardCards(
      baseInput({ symptomCounts: [sc('itch', 0, 5)], noticed: noticedWith([['lip_licking', 9]]) }),
    );
    expect(cards.some((c) => c.key === 'symptom:itch')).toBe(true);
  });

  it('lethargy is suppressed by EITHER of its two words', () => {
    for (const word of ['subdued', 'sleeping_more']) {
      const cards = buildDashboardCards(
        baseInput({ symptomCounts: [sc('lethargy', 0, 3)], noticed: noticedWith([[word, 6]]) }),
      );
      expect(cards.some((c) => c.key === 'symptom:lethargy')).toBe(false);
    }
  });

  it('a suppressed leaf also loses its CALENDAR lens — a lens needs current > 0 anyway', () => {
    const cards = buildDashboardCards(
      baseInput({ symptomCounts: [sc('itch', 0, 5)], noticed: noticedWith([['scratching_more', 30]]) }),
    );
    const calendar = cards.find((c) => c.kind === 'calendar') as CalendarCard | undefined;
    expect(calendar?.views.some((v) => v.symptomType === 'itch')).not.toBe(true);
  });

  it('OFF THE FLAG the zero renders as it always did — no suppression without a look record', () => {
    const cards = buildDashboardCards(baseInput({ symptomCounts: [sc('itch', 0, 5)] }));
    expect(cards.some((c) => c.key === 'symptom:itch')).toBe(true);
  });
});
