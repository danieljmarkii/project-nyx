// Analytics aggregate layer — unit tests (B-023 PR 1, DoD: a lib/ util ⇒ tests).
//
// Strategy mirrors detection.test.ts: the load-bearing logic lives in PURE cores, so
// most assertions are fixture-driven calls to those cores (no DB). A small set of
// mocked-DB tests prove the thin `get*` wrappers wire the SQLite read + the free-fed
// exclusion set into the core. `./protein` is intentionally NOT mocked, so the client
// port of canonicalizeProtein is genuinely exercised here.
//
// jest hoists jest.mock() above imports, so any closed-over variable is `mock`-prefixed.

const mockGetAllAsync = jest.fn().mockResolvedValue([]);
jest.mock('./db', () => ({ getDb: () => ({ getAllAsync: mockGetAllAsync }) }));

const mockGetActiveArrangementsForPet = jest.fn().mockResolvedValue([]);
jest.mock('./feedingArrangements', () => ({
  getActiveArrangementsForPet: (...a: unknown[]) => mockGetActiveArrangementsForPet(...a),
}));

import {
  calendarWindow,
  computeSymptomCounts,
  computeSymptomFrequencyByDay,
  computeTopFoods,
  computeTopProteins,
  computeIntakeRate,
  computeMealTreatComposition,
  getDietTrialProgress,
  detectIntakeDecline,
  getIntakeRate,
  getSymptomCounts,
  isNotEnoughData,
  ANALYTICS_FLOORS,
  type AnalyticsMeal,
  type AnalyticsSymptom,
  type IntakeDeclineResult,
} from './analytics';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const NOW = Date.parse('2026-06-14T12:00:00.000Z');
const TODAY_IDX = Math.floor(NOW / DAY);

/** ms at `hour:00` UTC on the day `dayOffset` days before today (0 = today). */
function at(dayOffset: number, hour = 12): number {
  return (TODAY_IDX - dayOffset) * DAY + hour * HOUR;
}

function sym(type: string, dayOffset: number, hour = 12): AnalyticsSymptom {
  return { type, ms: at(dayOffset, hour) };
}

function meal(p: Partial<AnalyticsMeal> & { ms: number }): AnalyticsMeal {
  return {
    ms: p.ms,
    foodItemId: p.foodItemId ?? 'f1',
    foodLabel: p.foodLabel ?? 'Acme Dinner',
    // `=== undefined` (not `??`) so an EXPLICIT null foodType stays null
    // (the "unclassified" composition case) rather than coalescing to 'meal'.
    foodType: p.foodType === undefined ? 'meal' : p.foodType,
    primaryProtein: p.primaryProtein ?? null,
    intakeRating: p.intakeRating ?? null,
  };
}

beforeEach(() => {
  mockGetAllAsync.mockReset().mockResolvedValue([]);
  mockGetActiveArrangementsForPet.mockReset().mockResolvedValue([]);
});

// ── Windows (the B-084 lesson) ──────────────────────────────────────────────────

describe('calendarWindow', () => {
  it('is a trailing, day-aligned window of exactly windowDays days', () => {
    const r = calendarWindow('week', NOW);
    expect(r.windowDays).toBe(7);
    expect(r.currentStartMs % DAY).toBe(0); // day-aligned, not a raw ms span
    expect(r.currentEndMs - r.currentStartMs).toBe(7 * DAY);
    expect(r.priorEndMs).toBe(r.currentStartMs); // prior abuts current, no gap/overlap
    expect(r.currentStartMs - r.priorStartMs).toBe(7 * DAY);
    expect(r.currentEndMs).toBe((r.todayIndex + 1) * DAY); // includes all of today
  });

  it('places boundary events on the correct side', () => {
    const r = calendarWindow('week', NOW);
    const rows: AnalyticsSymptom[] = [
      { type: 'vomit', ms: r.currentStartMs }, // first instant of current → current
      { type: 'vomit', ms: r.currentStartMs - 1 }, // last instant of prior → prior
      { type: 'vomit', ms: NOW }, // now → current
    ];
    const counts = computeSymptomCounts(rows, r);
    expect(counts).toEqual([{ symptomType: 'vomit', current: 2, prior: 1, delta: 1 }]);
  });

  it('month and 3month are trailing 30 / 90 days', () => {
    expect(calendarWindow('month', NOW).windowDays).toBe(30);
    expect(calendarWindow('3month', NOW).windowDays).toBe(90);
  });
});

// ── Symptom counts + delta ──────────────────────────────────────────────────────

describe('computeSymptomCounts', () => {
  it('counts per type with a prior-period delta, ranked by current desc', () => {
    const range = calendarWindow('week', NOW);
    const rows: AnalyticsSymptom[] = [
      sym('vomit', 0), sym('vomit', 2), sym('vomit', 5), // 3 current
      sym('vomit', 8), sym('vomit', 10), // 2 prior
      sym('diarrhea', 1), // 1 current, 0 prior
    ];
    expect(computeSymptomCounts(rows, range)).toEqual([
      { symptomType: 'vomit', current: 3, prior: 2, delta: 1 },
      { symptomType: 'diarrhea', current: 1, prior: 0, delta: 1 },
    ]);
  });

  it('ignores non-adverse / non-symptom event types (meal, stool_normal)', () => {
    const range = calendarWindow('week', NOW);
    const rows: AnalyticsSymptom[] = [sym('meal', 0), sym('stool_normal', 0), sym('weight_check', 0)];
    expect(computeSymptomCounts(rows, range)).toEqual([]);
  });
});

// ── Symptom frequency by day (heat-grid) — the B-084 regression ──────────────────

describe('computeSymptomFrequencyByDay', () => {
  it('returns exactly windowDays buckets (7 for a week, not 8) oldest-first', () => {
    const range = calendarWindow('week', NOW);
    const buckets = computeSymptomFrequencyByDay([], range);
    expect(buckets).toHaveLength(7); // B-084: a raw ms span would straddle 8 days
    for (let i = 1; i < buckets.length; i++) {
      expect(buckets[i].date > buckets[i - 1].date).toBe(true); // oldest first
    }
    expect(buckets.every((b) => b.total === 0)).toBe(true);
  });

  it('buckets events into their UTC day with a per-type breakdown', () => {
    const range = calendarWindow('week', NOW);
    const rows: AnalyticsSymptom[] = [
      sym('vomit', 0, 8), sym('vomit', 0, 20), // 2 today
      sym('diarrhea', 2), // 1 two days ago
      sym('vomit', 8), // outside the week window → ignored
    ];
    const buckets = computeSymptomFrequencyByDay(rows, range);
    const today = buckets[buckets.length - 1];
    expect(today.total).toBe(2);
    expect(today.byType).toEqual({ vomit: 2 });
    const twoAgo = buckets[buckets.length - 3];
    expect(twoAgo.total).toBe(1);
    expect(twoAgo.byType).toEqual({ diarrhea: 1 });
    expect(buckets.reduce((s, b) => s + b.total, 0)).toBe(3); // the out-of-window vomit excluded
  });
});

// ── Top foods ───────────────────────────────────────────────────────────────────

describe('computeTopFoods', () => {
  it('ranks by meal count desc and matches a hand-built fixture', () => {
    const rows: AnalyticsMeal[] = [
      meal({ ms: at(0), foodItemId: 'A', foodLabel: 'Acme A' }),
      meal({ ms: at(1), foodItemId: 'A', foodLabel: 'Acme A' }),
      meal({ ms: at(2), foodItemId: 'A', foodLabel: 'Acme A' }),
      meal({ ms: at(3), foodItemId: 'B', foodLabel: 'Bravo B' }),
      meal({ ms: at(4), foodItemId: 'B', foodLabel: 'Bravo B' }),
    ];
    expect(computeTopFoods(rows)).toEqual([
      { foodItemId: 'A', label: 'Acme A', foodType: 'meal', count: 3 },
      { foodItemId: 'B', label: 'Bravo B', foodType: 'meal', count: 2 },
    ]);
  });

  it('includes treats but tags them via foodType (a treat can top the list honestly)', () => {
    const rows: AnalyticsMeal[] = [
      meal({ ms: at(0), foodItemId: 'T', foodLabel: 'Temptations', foodType: 'treat' }),
      meal({ ms: at(1), foodItemId: 'T', foodLabel: 'Temptations', foodType: 'treat' }),
      meal({ ms: at(2), foodItemId: 'T', foodLabel: 'Temptations', foodType: 'treat' }),
      meal({ ms: at(3), foodItemId: 'M', foodLabel: 'Meal M', foodType: 'meal' }),
    ];
    const top = computeTopFoods(rows);
    expect(isNotEnoughData(top)).toBe(false);
    expect((top as Exclude<typeof top, { status: string }>)[0]).toEqual({
      foodItemId: 'T', label: 'Temptations', foodType: 'treat', count: 3,
    });
  });

  it('below the ranking floor → notEnoughData (no rank invented)', () => {
    const rows: AnalyticsMeal[] = [
      meal({ ms: at(0), foodItemId: 'A', foodLabel: 'Acme A' }),
      meal({ ms: at(1), foodItemId: 'A', foodLabel: 'Acme A' }),
      meal({ ms: at(2), foodItemId: 'B', foodLabel: 'Bravo B' }),
    ];
    const out = computeTopFoods(rows);
    expect(isNotEnoughData(out)).toBe(true);
    expect(out).toEqual({ status: 'not_enough_data', samples: 3, needed: ANALYTICS_FLOORS.minMealsForRanking });
  });

  it('respects the limit option (independent of the floor)', () => {
    const rows: AnalyticsMeal[] = ['A', 'B', 'C', 'D', 'E'].map((id, i) =>
      meal({ ms: at(i), foodItemId: id, foodLabel: `Food ${id}` }),
    );
    const top = computeTopFoods(rows, { limit: 2 });
    expect((top as { count: number }[]).length).toBe(2);
  });
});

// ── Top proteins (canonicalization before ranking) ──────────────────────────────

describe('computeTopProteins', () => {
  it('canonicalizes before ranking so chicken variants pool into one key', () => {
    const rows: AnalyticsMeal[] = [
      meal({ ms: at(0), primaryProtein: 'Chicken' }),
      meal({ ms: at(1), primaryProtein: 'chicken by-product meal' }),
      meal({ ms: at(2), primaryProtein: 'Chicken By-Product Meal' }),
      meal({ ms: at(3), primaryProtein: 'Salmon' }),
      meal({ ms: at(4), primaryProtein: 'null' }), // junk → dropped
      meal({ ms: at(5), primaryProtein: null }), // unidentified → dropped
    ];
    expect(computeTopProteins(rows)).toEqual([
      { protein: 'chicken', count: 3 },
      { protein: 'salmon', count: 1 },
    ]);
  });

  it('floors on identified meals (junk/null do not count toward the floor)', () => {
    const rows: AnalyticsMeal[] = [
      meal({ ms: at(0), primaryProtein: 'beef' }),
      meal({ ms: at(1), primaryProtein: 'beef' }),
      meal({ ms: at(2), primaryProtein: 'null' }),
      meal({ ms: at(3), primaryProtein: null }),
    ];
    expect(computeTopProteins(rows)).toEqual({
      status: 'not_enough_data', samples: 2, needed: ANALYTICS_FLOORS.minMealsForRanking,
    });
  });
});

// ── Intake / finished-rate (MEALS ONLY) ─────────────────────────────────────────

describe('computeIntakeRate', () => {
  const emptyFreeFed = new Set<string>();

  it('is the share of rated meals finished (most/all)', () => {
    const rows: AnalyticsMeal[] = [
      meal({ ms: at(0), foodItemId: 'a', intakeRating: 'most' }), // finished
      meal({ ms: at(1), foodItemId: 'b', intakeRating: 'all' }), // finished
      meal({ ms: at(2), foodItemId: 'c', intakeRating: 'some' }),
      meal({ ms: at(3), foodItemId: 'd', intakeRating: 'refused' }),
    ];
    expect(computeIntakeRate(rows, { freeFedFoodIds: emptyFreeFed })).toEqual({
      rate: 0.5, finishedMeals: 2, ratedMeals: 4, freeFedExcluded: 0, intakeNotDirectlyObserved: false,
    });
  });

  it('EXCLUDES treats from the denominator (a ceiling-finished treat cannot inflate the rate)', () => {
    const rows: AnalyticsMeal[] = [
      meal({ ms: at(0), foodItemId: 'a', intakeRating: 'most' }),
      meal({ ms: at(1), foodItemId: 'b', intakeRating: 'all' }),
      meal({ ms: at(2), foodItemId: 'c', intakeRating: 'some' }),
      meal({ ms: at(3), foodItemId: 'd', intakeRating: 'refused' }),
      meal({ ms: at(0, 9), foodItemId: 't', intakeRating: 'all', foodType: 'treat' }), // excluded
    ];
    const out = computeIntakeRate(rows, { freeFedFoodIds: emptyFreeFed });
    // 2/4 = 0.5, NOT 3/5 = 0.6 — the treat is excluded.
    expect(out).toMatchObject({ rate: 0.5, ratedMeals: 4, finishedMeals: 2 });
  });

  it('EXCLUDES free-fed foods and flags intake-not-directly-observed (§11 #6)', () => {
    const rows: AnalyticsMeal[] = [
      meal({ ms: at(0), foodItemId: 'a', intakeRating: 'most' }),
      meal({ ms: at(1), foodItemId: 'b', intakeRating: 'all' }),
      meal({ ms: at(2), foodItemId: 'c', intakeRating: 'some' }),
      meal({ ms: at(3), foodItemId: 'd', intakeRating: 'refused' }),
      meal({ ms: at(0, 9), foodItemId: 'free-1', intakeRating: 'all' }), // free-fed → excluded
    ];
    const out = computeIntakeRate(rows, { freeFedFoodIds: new Set(['free-1']) });
    expect(out).toEqual({
      rate: 0.5, finishedMeals: 2, ratedMeals: 4, freeFedExcluded: 1, intakeNotDirectlyObserved: true,
    });
  });

  it('below the rated-meal floor → notEnoughData', () => {
    const rows: AnalyticsMeal[] = [
      meal({ ms: at(0), foodItemId: 'a', intakeRating: 'most' }),
      meal({ ms: at(1), foodItemId: 'b', intakeRating: 'all' }),
      meal({ ms: at(2), foodItemId: 'c', intakeRating: 'some' }),
    ];
    expect(computeIntakeRate(rows, { freeFedFoodIds: emptyFreeFed })).toEqual({
      status: 'not_enough_data', samples: 3, needed: ANALYTICS_FLOORS.minRatedMealsForIntakeRate,
    });
  });
});

// ── Meal vs treat composition ────────────────────────────────────────────────────

describe('computeMealTreatComposition', () => {
  it('counts treats SEPARATELY, never folded into the meal count (§11 #1)', () => {
    const rows: AnalyticsMeal[] = [
      meal({ ms: at(0), foodType: 'meal' }),
      meal({ ms: at(1), foodType: 'meal' }),
      meal({ ms: at(2), foodType: 'meal' }),
      meal({ ms: at(3), foodType: 'treat' }),
      meal({ ms: at(4), foodType: 'treat' }),
      meal({ ms: at(5), foodType: 'other' }),
      meal({ ms: at(6), foodType: null }),
    ];
    expect(computeMealTreatComposition(rows)).toEqual({
      meal: 3, treat: 2, other: 1, unclassified: 1, total: 7,
    });
  });
});

// ── Diet-trial progress ──────────────────────────────────────────────────────────

describe('getDietTrialProgress', () => {
  it('day-counts inclusively from started_at (day 1 = the start day)', () => {
    const out = getDietTrialProgress({ startedAt: '2026-06-10', targetDurationDays: 14 }, NOW);
    expect(out).toEqual({ dayCounter: 5, targetDays: 14, daysRemaining: 9, fraction: 5 / 14, complete: false });
  });

  it('clamps a reached target to complete + fraction 1', () => {
    const out = getDietTrialProgress({ startedAt: '2026-05-01', targetDurationDays: 14 }, NOW);
    expect(out?.complete).toBe(true);
    expect(out?.fraction).toBe(1);
    expect(out?.daysRemaining).toBe(0);
  });

  it('returns null for an unparseable start date', () => {
    expect(getDietTrialProgress({ startedAt: 'not-a-date', targetDurationDays: 14 }, NOW)).toBeNull();
  });
});

// ── detectIntakeDecline — the clinically load-bearing detector ───────────────────

describe('detectIntakeDecline', () => {
  const noFreeFed = new Set<string>();

  function declined(species: 'dog' | 'cat' = 'dog'): IntakeDeclineResult {
    // Well-eaten baseline older than the recent window, then two low recent days.
    const meals: AnalyticsMeal[] = [
      meal({ ms: at(6), intakeRating: 'all' }),
      meal({ ms: at(5), intakeRating: 'all' }),
      meal({ ms: at(4), intakeRating: 'all' }),
      meal({ ms: at(3), intakeRating: 'all' }),
      meal({ ms: at(1), intakeRating: 'some' }),
      meal({ ms: at(0), intakeRating: 'some' }),
    ];
    return detectIntakeDecline({ species, nowMs: NOW, meals, freeFedFoodIds: noFreeFed });
  }

  it('routes a declining trend to a HEALTH WATCH (consecutive_low)', () => {
    const out = declined('dog');
    expect(out.status).toBe('watch');
    if (out.status !== 'watch') throw new Error('unreachable');
    expect(out.flags.some((f) => f.trigger === 'consecutive_low')).toBe(true);
    expect(out.flags.every((f) => f.class === 'health_watch')).toBe(true);
  });

  it('NEVER emits a "preference"/"picky"/"fussy" framing — intake is not preference', () => {
    const out = declined('dog');
    expect(out.status).toBe('watch');
    // The whole serialized result must be free of any preference framing.
    expect(JSON.stringify(out)).not.toMatch(/pick|prefer|fussy|finicky/i);
  });

  it('fires a cat on a SINGLE genuinely-low day (48h hepatic-lipidosis window)', () => {
    const meals: AnalyticsMeal[] = [
      meal({ ms: at(5), intakeRating: 'all' }),
      meal({ ms: at(4), intakeRating: 'all' }),
      meal({ ms: at(3), intakeRating: 'all' }),
      meal({ ms: at(2), intakeRating: 'all' }),
      meal({ ms: at(0), intakeRating: 'some' }), // score 2 ≤ singleDayConcernCeiling
    ];
    const out = detectIntakeDecline({ species: 'cat', nowMs: NOW, meals, freeFedFoodIds: noFreeFed });
    expect(out.status).toBe('watch');
  });

  it('does NOT cry wolf on a cat one notch down (all→most)', () => {
    const meals: AnalyticsMeal[] = [
      meal({ ms: at(5), intakeRating: 'all' }),
      meal({ ms: at(4), intakeRating: 'all' }),
      meal({ ms: at(3), intakeRating: 'all' }),
      meal({ ms: at(2), intakeRating: 'all' }),
      meal({ ms: at(0), intakeRating: 'most' }), // score 3 > ceiling 2
    ];
    const out = detectIntakeDecline({ species: 'cat', nowMs: NOW, meals, freeFedFoodIds: noFreeFed });
    expect(out.status).toBe('none');
  });

  it('fires refused_normal_food when a well-eaten food is just refused', () => {
    const meals: AnalyticsMeal[] = [
      meal({ ms: at(7), foodItemId: 'f1', foodLabel: 'Acme Dinner', intakeRating: 'all' }),
      meal({ ms: at(6), foodItemId: 'f1', foodLabel: 'Acme Dinner', intakeRating: 'all' }),
      meal({ ms: at(5), foodItemId: 'f1', foodLabel: 'Acme Dinner', intakeRating: 'all' }),
      meal({ ms: at(0), foodItemId: 'f1', foodLabel: 'Acme Dinner', intakeRating: 'refused' }),
    ];
    const out = detectIntakeDecline({ species: 'dog', nowMs: NOW, meals, freeFedFoodIds: noFreeFed });
    expect(out.status).toBe('watch');
    if (out.status !== 'watch') throw new Error('unreachable');
    const refusal = out.flags.find((f) => f.trigger === 'refused_normal_food');
    expect(refusal?.refusedFoodLabel).toBe('Acme Dinner');
    expect(refusal?.class).toBe('health_watch');
  });

  it('a logging GAP is never read as a decline (skips days with no rated meal)', () => {
    // Baseline well-eaten; only one of the two recent days has a meal → no flag.
    const meals: AnalyticsMeal[] = [
      meal({ ms: at(6), intakeRating: 'all' }),
      meal({ ms: at(5), intakeRating: 'all' }),
      meal({ ms: at(4), intakeRating: 'all' }),
      meal({ ms: at(3), intakeRating: 'all' }),
      meal({ ms: at(1), intakeRating: 'some' }), // yesterday only; nothing logged today
    ];
    const out = detectIntakeDecline({ species: 'dog', nowMs: NOW, meals, freeFedFoodIds: noFreeFed });
    expect(out.status).toBe('none');
  });

  it('excludes FREE-FED meals from the rated set (a free-fed bowl is not a refusal — §11 #6)', () => {
    // The exact refused_normal_food fixture, but the food is free-fed → all its
    // meals drop out → below the coverage floor → notEnoughData, never a false watch.
    const meals: AnalyticsMeal[] = [
      meal({ ms: at(7), foodItemId: 'f1', intakeRating: 'all' }),
      meal({ ms: at(6), foodItemId: 'f1', intakeRating: 'all' }),
      meal({ ms: at(5), foodItemId: 'f1', intakeRating: 'all' }),
      meal({ ms: at(0), foodItemId: 'f1', intakeRating: 'refused' }),
    ];
    const out = detectIntakeDecline({ species: 'dog', nowMs: NOW, meals, freeFedFoodIds: new Set(['f1']) });
    expect(isNotEnoughData(out)).toBe(true);
  });

  it('below the coverage floor → notEnoughData (silence is not an all-clear)', () => {
    const meals: AnalyticsMeal[] = [
      meal({ ms: at(0), intakeRating: 'all' }),
      meal({ ms: at(1), intakeRating: 'all' }),
      meal({ ms: at(2), intakeRating: 'all' }),
    ];
    expect(isNotEnoughData(detectIntakeDecline({ species: 'dog', nowMs: NOW, meals, freeFedFoodIds: noFreeFed }))).toBe(true);
  });

  it('enough data, steady intake → none (no false flag)', () => {
    const meals: AnalyticsMeal[] = [0, 1, 2, 3, 4].map((d) => meal({ ms: at(d), intakeRating: 'all' }));
    expect(detectIntakeDecline({ species: 'dog', nowMs: NOW, meals, freeFedFoodIds: noFreeFed }).status).toBe('none');
  });

  it('ignores unrated rows and treats (a logging gap / treat can never look like a decline)', () => {
    const meals: AnalyticsMeal[] = [
      meal({ ms: at(6), intakeRating: 'all' }),
      meal({ ms: at(5), intakeRating: 'all' }),
      meal({ ms: at(4), intakeRating: 'all' }),
      meal({ ms: at(3), intakeRating: 'all' }),
      meal({ ms: at(0), intakeRating: null }), // unrated → ignored
      meal({ ms: at(0, 9), foodType: 'treat', intakeRating: 'refused' }), // treat → ignored
    ];
    // No rated meal in the recent window → no decline.
    expect(detectIntakeDecline({ species: 'dog', nowMs: NOW, meals, freeFedFoodIds: noFreeFed }).status).toBe('none');
  });
});

// ── DB wrappers (prove the SQLite read + free-fed wiring) ────────────────────────

describe('getIntakeRate (wrapper wiring)', () => {
  it('reads the free-fed set and passes it to the core so free-fed meals are excluded', async () => {
    mockGetAllAsync.mockResolvedValue([
      { food_item_id: 'a', intake_rating: 'most', occurred_at: '2026-06-14T08:00:00Z', food_type: 'meal', primary_protein: null, brand: 'Acme', product_name: 'A' },
      { food_item_id: 'b', intake_rating: 'all', occurred_at: '2026-06-13T08:00:00Z', food_type: 'meal', primary_protein: null, brand: 'Acme', product_name: 'B' },
      { food_item_id: 'c', intake_rating: 'some', occurred_at: '2026-06-12T08:00:00Z', food_type: 'meal', primary_protein: null, brand: 'Acme', product_name: 'C' },
      { food_item_id: 'd', intake_rating: 'refused', occurred_at: '2026-06-11T08:00:00Z', food_type: 'meal', primary_protein: null, brand: 'Acme', product_name: 'D' },
      { food_item_id: 'free-1', intake_rating: 'all', occurred_at: '2026-06-14T09:00:00Z', food_type: 'meal', primary_protein: null, brand: 'Acme', product_name: 'Free' },
      { food_item_id: 't', intake_rating: 'all', occurred_at: '2026-06-14T10:00:00Z', food_type: 'treat', primary_protein: null, brand: 'Acme', product_name: 'Treat' },
    ]);
    mockGetActiveArrangementsForPet.mockResolvedValue([
      { id: 'arr-1', food_item_id: 'free-1', active_from: null, updated_at: '', brand: '', product_name: '', format: 'dry' },
    ]);

    const out = await getIntakeRate('pet-1', 'month', NOW);
    expect(mockGetActiveArrangementsForPet).toHaveBeenCalledWith('pet-1');
    // 4 normal rated meals; treat + free-fed both excluded → 2/4 finished.
    expect(out).toEqual({
      rate: 0.5, finishedMeals: 2, ratedMeals: 4, freeFedExcluded: 1, intakeNotDirectlyObserved: true,
    });
  });
});

describe('getSymptomCounts (wrapper wiring)', () => {
  it('reads events over the prior→current span and returns core counts', async () => {
    mockGetAllAsync.mockResolvedValue([
      { event_type: 'vomit', occurred_at: new Date(at(0)).toISOString() },
      { event_type: 'vomit', occurred_at: new Date(at(9)).toISOString() }, // prior week
    ]);
    const out = await getSymptomCounts('pet-1', 'week', NOW);
    expect(out).toEqual([{ symptomType: 'vomit', current: 1, prior: 1, delta: 0 }]);
    // The read is bounded by the prior-window start .. current-window end (ISO).
    const [, params] = mockGetAllAsync.mock.calls[0];
    expect(params[0]).toBe('pet-1');
    expect(typeof params[1]).toBe('string');
    expect(typeof params[2]).toBe('string');
  });
});
