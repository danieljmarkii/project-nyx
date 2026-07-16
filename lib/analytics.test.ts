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
const mockGetFirstAsync = jest.fn().mockResolvedValue(null);
jest.mock('./db', () => ({
  getDb: () => ({ getAllAsync: mockGetAllAsync, getFirstAsync: mockGetFirstAsync }),
}));

const mockGetActiveArrangementsForPet = jest.fn().mockResolvedValue([]);
jest.mock('./feedingArrangements', () => ({
  getActiveArrangementsForPet: (...a: unknown[]) => mockGetActiveArrangementsForPet(...a),
}));

import {
  calendarWindow,
  computeSymptomCounts,
  computeSymptomFrequencyByDay,
  computeSymptomFrequencyForMonth,
  computeIntakeDeclineFrequencyForMonth,
  getIntakeDeclineByMonth,
  INTAKE_DECLINE_TYPE,
  calendarMonthRange,
  utcMonthOf,
  addCalendarMonths,
  compareCalendarMonth,
  getEarliestEventMonth,
  computeTopFoods,
  computeTopProteins,
  computeIntakeRate,
  computeMealTreatComposition,
  getDietTrialProgress,
  detectIntakeDecline,
  getIntakeRate,
  getIntakeRateWithPrior,
  getMealTreatComposition,
  getSymptomCounts,
  getTopFoods,
  isNotEnoughData,
  ANALYTICS_FLOORS,
  type AnalyticsMeal,
  type AnalyticsSymptom,
  type CalendarMonth,
  type IntakeDeclineResult,
  type RankedFood,
  type RankedProtein,
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
  mockGetFirstAsync.mockReset().mockResolvedValue(null);
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

// ── Calendar-month math (the paginated calendar — B-309 / Calendar v3 N5b) ────────
// NOW = 2026-06-14T12:00Z, so June is the current (clamped) month and May is a full past
// month. All UTC — the point of UTC month math is that it is DST-immune (AC-N5 "paging
// works across month boundaries incl. DST months").

const JUNE: CalendarMonth = { year: 2026, month: 5 }; // current month (0-indexed)
const MAY: CalendarMonth = { year: 2026, month: 4 };
const MARCH: CalendarMonth = { year: 2026, month: 2 }; // spans the US DST spring-forward
const daysInMonth = (m: CalendarMonth) => new Date(Date.UTC(m.year, m.month + 1, 0)).getUTCDate();

describe('utcMonthOf / addCalendarMonths / compareCalendarMonth', () => {
  it('utcMonthOf reads the UTC month of an instant', () => {
    expect(utcMonthOf(Date.UTC(2026, 5, 14, 12))).toEqual(JUNE);
    expect(utcMonthOf(Date.UTC(2026, 0, 1, 0))).toEqual({ year: 2026, month: 0 });
  });

  it('addCalendarMonths rolls the year over both directions', () => {
    expect(addCalendarMonths({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 }); // Dec→Jan
    expect(addCalendarMonths({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 }); // Jan→Dec
    expect(addCalendarMonths(JUNE, -3)).toEqual(MARCH);
    expect(addCalendarMonths(MARCH, 15)).toEqual({ year: 2027, month: 5 });
  });

  it('compareCalendarMonth orders chronologically', () => {
    expect(compareCalendarMonth(MAY, JUNE)).toBeLessThan(0);
    expect(compareCalendarMonth(JUNE, MAY)).toBeGreaterThan(0);
    expect(compareCalendarMonth(JUNE, JUNE)).toBe(0);
    expect(compareCalendarMonth({ year: 2025, month: 11 }, { year: 2026, month: 0 })).toBeLessThan(0);
  });
});

describe('calendarMonthRange', () => {
  it('spans a full past month (1st → last day), contiguous day indices', () => {
    const r = calendarMonthRange(MAY, NOW);
    expect(r.startMs).toBe(Date.UTC(2026, 4, 1));
    expect(r.endMs).toBe(Date.UTC(2026, 5, 1)); // not clamped — May is entirely in the past
    expect(r.lastDayIndex - r.firstDayIndex + 1).toBe(31); // May has 31 days
  });

  it('clamps the CURRENT month to end-of-today (no future cells)', () => {
    const r = calendarMonthRange(JUNE, NOW);
    expect(r.startMs).toBe(Date.UTC(2026, 5, 1));
    expect(r.endMs).toBe((TODAY_IDX + 1) * DAY); // stops at end of today, not Jun 30
    expect(r.lastDayIndex).toBe(TODAY_IDX); // today is the last cell
    expect(r.lastDayIndex - r.firstDayIndex + 1).toBe(14); // Jun 1..Jun 14
  });

  it('a fully-future month is empty (lastDayIndex < firstDayIndex)', () => {
    const r = calendarMonthRange({ year: 2026, month: 7 }, NOW); // August, after June
    expect(r.lastDayIndex).toBeLessThan(r.firstDayIndex);
  });

  it('a DST-transition month (March) still spans exactly 31 UTC days', () => {
    // UTC month math is unperturbed by the local DST shift — the AC-N5 guarantee.
    const r = calendarMonthRange(MARCH, NOW);
    expect(r.lastDayIndex - r.firstDayIndex + 1).toBe(31);
    expect(daysInMonth(MARCH)).toBe(31);
  });
});

describe('computeSymptomFrequencyForMonth', () => {
  const onMay = (day: number, type = 'vomit', hour = 12): AnalyticsSymptom => ({
    type,
    ms: Date.UTC(2026, 4, day, hour),
  });

  it('one bucket per calendar day, events landing on their UTC day', () => {
    const rows = [onMay(3), onMay(3, 'vomit', 20), onMay(17, 'diarrhea'), onMay(24)];
    const buckets = computeSymptomFrequencyForMonth(rows, MAY, NOW);
    expect(buckets).toHaveLength(31);
    expect(buckets[0].date).toBe('2026-05-01');
    expect(buckets[30].date).toBe('2026-05-31');
    expect(buckets[2]).toMatchObject({ date: '2026-05-03', total: 2, byType: { vomit: 2 } });
    expect(buckets[16]).toMatchObject({ date: '2026-05-17', total: 1, byType: { diarrhea: 1 } });
    expect(buckets.reduce((s, b) => s + b.total, 0)).toBe(4);
  });

  it('the current month stops at today (no future buckets)', () => {
    const buckets = computeSymptomFrequencyForMonth([], JUNE, NOW);
    expect(buckets).toHaveLength(14); // Jun 1..Jun 14 (NOW), not all 30
    expect(buckets[buckets.length - 1].date).toBe('2026-06-14');
  });

  it('excludes events outside the month and returns [] for a future month', () => {
    const rows = [onMay(3), { type: 'vomit', ms: Date.UTC(2026, 5, 2, 12) }]; // one in June
    const buckets = computeSymptomFrequencyForMonth(rows, MAY, NOW);
    expect(buckets.reduce((s, b) => s + b.total, 0)).toBe(1); // the June event excluded
    expect(computeSymptomFrequencyForMonth(rows, { year: 2026, month: 7 }, NOW)).toEqual([]);
  });
});

describe('computeIntakeDeclineFrequencyForMonth (the "Meals" calendar — B-310)', () => {
  const emptyFF = new Set<string>();
  // A meal on May `day` at noon UTC, with the given rating + overrides.
  const onMayMeal = (day: number, rating: string | null, over: Partial<AnalyticsMeal> = {}): AnalyticsMeal =>
    meal({ ms: Date.UTC(2026, 4, day, 12), intakeRating: rating, ...over });

  it('one bucket per calendar day; counts ONLY unfinished (refused/picked/some) qualifying meals', () => {
    const rows = [
      onMayMeal(3, 'refused'), // unfinished → counts
      onMayMeal(3, 'some'), // unfinished, same day → 2 on the 3rd
      onMayMeal(10, 'picked'), // unfinished
      onMayMeal(17, 'most'), // FINISHED → excluded
      onMayMeal(17, 'all'), // FINISHED → excluded
    ];
    const buckets = computeIntakeDeclineFrequencyForMonth(rows, emptyFF, MAY, NOW);
    expect(buckets).toHaveLength(31);
    expect(buckets[2]).toMatchObject({ date: '2026-05-03', total: 2, byType: { [INTAKE_DECLINE_TYPE]: 2 } });
    expect(buckets[9]).toMatchObject({ date: '2026-05-10', total: 1 });
    expect(buckets[16].total).toBe(0); // the 17th's two finished meals contribute nothing
    expect(buckets.reduce((s, b) => s + b.total, 0)).toBe(3);
  });

  it('excludes treats (§11 #1), free-fed (§11 #6), and unrated meals — the finished-rate denominator', () => {
    const rows = [
      onMayMeal(5, 'refused', { foodType: 'treat' }), // treat refusal → not an intake-quality decline
      onMayMeal(5, 'refused', { foodItemId: 'free-1' }), // free-fed → intake not observed
      onMayMeal(5, null), // unrated → not a decline (a logging gap, not a refusal)
      onMayMeal(5, 'refused'), // the ONE real qualifying decline
    ];
    const buckets = computeIntakeDeclineFrequencyForMonth(rows, new Set(['free-1']), MAY, NOW);
    expect(buckets[4]).toMatchObject({ date: '2026-05-05', total: 1 });
    expect(buckets.reduce((s, b) => s + b.total, 0)).toBe(1);
  });

  it('is NOT floored — a single refused meal is an honest fact worth a cell (§11 #2, descriptive)', () => {
    const buckets = computeIntakeDeclineFrequencyForMonth([onMayMeal(9, 'refused')], emptyFF, MAY, NOW);
    expect(buckets[8]).toMatchObject({ date: '2026-05-09', total: 1 });
  });

  it('the current month stops at today, and a future month is empty', () => {
    const clean = computeIntakeDeclineFrequencyForMonth([], emptyFF, JUNE, NOW);
    expect(clean).toHaveLength(14); // Jun 1..Jun 14 (NOW), no future cells
    expect(computeIntakeDeclineFrequencyForMonth([], emptyFF, { year: 2026, month: 7 }, NOW)).toEqual([]);
  });
});

describe('getIntakeDeclineByMonth (wrapper wiring)', () => {
  it('reads meals joined to the food cache and applies the free-fed exclusion', async () => {
    mockGetAllAsync.mockResolvedValueOnce([
      { food_item_id: 'f1', intake_rating: 'refused', occurred_at: '2026-05-03T12:00:00.000Z',
        food_type: 'meal', primary_protein: null, brand: 'Acme', product_name: 'Dinner' },
      { food_item_id: 'f1', intake_rating: 'all', occurred_at: '2026-05-04T12:00:00.000Z',
        food_type: 'meal', primary_protein: null, brand: 'Acme', product_name: 'Dinner' },
    ]);
    const buckets = await getIntakeDeclineByMonth('p1', MAY, NOW);
    expect(buckets.reduce((s, b) => s + b.total, 0)).toBe(1); // only the refusal, not the finished meal
    expect(buckets[2]).toMatchObject({ date: '2026-05-03', total: 1 });
  });

  it('returns [] for a future month without querying', async () => {
    expect(await getIntakeDeclineByMonth('p1', { year: 2026, month: 7 }, NOW)).toEqual([]);
    expect(mockGetAllAsync).not.toHaveBeenCalled();
  });
});

describe('getEarliestEventMonth (wrapper wiring)', () => {
  it('returns the UTC month of the earliest event row', async () => {
    mockGetFirstAsync.mockResolvedValueOnce({ occurred_at: '2026-03-09T04:30:00.000Z' });
    expect(await getEarliestEventMonth('p1')).toEqual(MARCH);
  });

  it('returns null when the pet has no events', async () => {
    mockGetFirstAsync.mockResolvedValueOnce(null);
    expect(await getEarliestEventMonth('p1')).toBeNull();
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
    // No meals are rated in this fixture → finishedRate null (below the per-item floor).
    expect(computeTopFoods(rows)).toEqual([
      { foodItemId: 'A', label: 'Acme A', foodType: 'meal', count: 3, shareOfDiet: 0.6, finishedRate: null, ratedMeals: 0, isTreat: false },
      { foodItemId: 'B', label: 'Bravo B', foodType: 'meal', count: 2, shareOfDiet: 0.4, finishedRate: null, ratedMeals: 0, isTreat: false },
    ]);
  });

  it('includes treats but flags them via isTreat (a treat can top the list honestly)', () => {
    const rows: AnalyticsMeal[] = [
      meal({ ms: at(0), foodItemId: 'T', foodLabel: 'Temptations', foodType: 'treat' }),
      meal({ ms: at(1), foodItemId: 'T', foodLabel: 'Temptations', foodType: 'treat' }),
      meal({ ms: at(2), foodItemId: 'T', foodLabel: 'Temptations', foodType: 'treat' }),
      meal({ ms: at(3), foodItemId: 'M', foodLabel: 'Meal M', foodType: 'meal' }),
    ];
    const top = computeTopFoods(rows);
    expect(isNotEnoughData(top)).toBe(false);
    expect((top as Exclude<typeof top, { status: string }>)[0]).toEqual({
      foodItemId: 'T', label: 'Temptations', foodType: 'treat', count: 3, shareOfDiet: 0.75, finishedRate: null, ratedMeals: 0, isTreat: true,
    });
  });

  it('computes a per-food finished-rate over rated, non-free-fed meals, floored (§11 #1/#5/#6)', () => {
    const rows: AnalyticsMeal[] = [
      // Food A (NOT free-fed): 5 rated meals, 3 finished (all/most/all) → 0.6.
      meal({ ms: at(0), foodItemId: 'A', foodLabel: 'Acme A', intakeRating: 'all' }),
      meal({ ms: at(1), foodItemId: 'A', foodLabel: 'Acme A', intakeRating: 'most' }),
      meal({ ms: at(2), foodItemId: 'A', foodLabel: 'Acme A', intakeRating: 'all' }),
      meal({ ms: at(3), foodItemId: 'A', foodLabel: 'Acme A', intakeRating: 'some' }),
      meal({ ms: at(4), foodItemId: 'A', foodLabel: 'Acme A', intakeRating: 'refused' }),
      // Food C (FREE-FED): 4 rated 'all' — but intake isn't observed → finishedRate null (§11 #6).
      meal({ ms: at(5), foodItemId: 'C', foodLabel: 'Free C', intakeRating: 'all' }),
      meal({ ms: at(6), foodItemId: 'C', foodLabel: 'Free C', intakeRating: 'all' }),
      meal({ ms: at(7), foodItemId: 'C', foodLabel: 'Free C', intakeRating: 'all' }),
      meal({ ms: at(8), foodItemId: 'C', foodLabel: 'Free C', intakeRating: 'all' }),
      // Food B (NOT free-fed): only 2 rated meals → below the per-item floor → null.
      meal({ ms: at(9), foodItemId: 'B', foodLabel: 'Bravo B', intakeRating: 'all' }),
      meal({ ms: at(10), foodItemId: 'B', foodLabel: 'Bravo B', intakeRating: 'refused' }),
    ];
    const top = computeTopFoods(rows, { freeFedFoodIds: new Set(['C']) }) as RankedFood[];
    const a = top.find((f) => f.foodItemId === 'A')!;
    const b = top.find((f) => f.foodItemId === 'B')!;
    const c = top.find((f) => f.foodItemId === 'C')!;
    // A: 5 rated, 3 finished → 0.6.
    expect(a.finishedRate).toBeCloseTo(0.6, 5);
    expect(a.ratedMeals).toBe(5);
    // B: 2 rated < floor 4 → null (never a confident rate off 2 meals).
    expect(b.finishedRate).toBeNull();
    expect(b.ratedMeals).toBe(2);
    // C: free-fed → every meal excluded → null, NOT a fake 100% (intake not observed).
    expect(c.finishedRate).toBeNull();
    expect(c.ratedMeals).toBe(0);
  });

  it('a classified treat carries NO finish-rate, even well-eaten (ceiling nulled at source, §11 #1)', () => {
    const rows: AnalyticsMeal[] = [
      // A treat eaten well 4× → its rate would be a 100% ceiling → must be null at the source.
      meal({ ms: at(0), foodItemId: 'T', foodLabel: 'Temptations', foodType: 'treat', intakeRating: 'all' }),
      meal({ ms: at(1), foodItemId: 'T', foodLabel: 'Temptations', foodType: 'treat', intakeRating: 'all' }),
      meal({ ms: at(2), foodItemId: 'T', foodLabel: 'Temptations', foodType: 'treat', intakeRating: 'most' }),
      meal({ ms: at(3), foodItemId: 'T', foodLabel: 'Temptations', foodType: 'treat', intakeRating: 'all' }),
      // A food id with a MIXED-classification row set → treat-if-any (order-independent).
      meal({ ms: at(4), foodItemId: 'M', foodLabel: 'Mixed', foodType: 'meal', intakeRating: 'all' }),
      meal({ ms: at(5), foodItemId: 'M', foodLabel: 'Mixed', foodType: 'treat', intakeRating: 'all' }),
      meal({ ms: at(6), foodItemId: 'M', foodLabel: 'Mixed', foodType: 'meal', intakeRating: 'all' }),
      meal({ ms: at(7), foodItemId: 'M', foodLabel: 'Mixed', foodType: 'meal', intakeRating: 'all' }),
    ];
    const top = computeTopFoods(rows) as RankedFood[];
    const t = top.find((f) => f.foodItemId === 'T')!;
    const m = top.find((f) => f.foodItemId === 'M')!;
    expect(t.isTreat).toBe(true);
    expect(t.finishedRate).toBeNull(); // never renders "100% finished" for a treat
    // Any treat-classified row flips the food treat-safe, regardless of DB row order.
    expect(m.isTreat).toBe(true);
    expect(m.finishedRate).toBeNull();
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
      { protein: 'chicken', count: 3, shareOfDiet: 0.75, finishedRate: null, ratedMeals: 0, isTreat: false },
      { protein: 'salmon', count: 1, shareOfDiet: 0.25, finishedRate: null, ratedMeals: 0, isTreat: false },
    ]);
  });

  it('floors on identified feedings (junk/null do not count toward the floor)', () => {
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

  it('INCLUDES treats as protein exposure, flagged isTreat — the #1 diet-trial confounder made visible (B-111)', () => {
    // A novel-protein (duck) elimination trial sabotaged by chicken treats: duck is the meal
    // protein; chicken reaches the pet ONLY via treats. Pre-B-111 the chicken exposure vanished
    // from this card entirely — exactly the confounder a vet needs to see. Now it surfaces, flagged.
    const rows: AnalyticsMeal[] = [
      meal({ ms: at(0), primaryProtein: 'duck', foodType: 'meal' }),
      meal({ ms: at(1), primaryProtein: 'duck', foodType: 'meal' }),
      meal({ ms: at(2), primaryProtein: 'duck', foodType: 'meal' }),
      meal({ ms: at(3), primaryProtein: 'duck', foodType: 'meal' }),
      meal({ ms: at(4), primaryProtein: 'chicken', foodType: 'treat' }),
      meal({ ms: at(5), primaryProtein: 'chicken', foodType: 'treat' }),
      meal({ ms: at(6), primaryProtein: 'chicken', foodType: 'treat' }),
    ];
    // 7 protein exposures total. chicken (3, treat-sourced) is VISIBLE + flagged; duck (4, meal).
    expect(computeTopProteins(rows)).toEqual([
      { protein: 'duck', count: 4, shareOfDiet: 4 / 7, finishedRate: null, ratedMeals: 0, isTreat: false },
      { protein: 'chicken', count: 3, shareOfDiet: 3 / 7, finishedRate: null, ratedMeals: 0, isTreat: true },
    ]);
  });

  it('a MIXED protein (meals + treats) is a MEAL protein: not flagged, finish-rate over meals only (§11 #1)', () => {
    // 'chicken' from 4 rated meals (3 finished → 0.75) PLUS 2 chicken treats eaten to a ceiling.
    // The treats count as exposure but must NOT inflate the finish-rate (else 5/6, masking the
    // 'some' meal) — the load-bearing §11 #1 guard for this card.
    const rows: AnalyticsMeal[] = [
      meal({ ms: at(0), primaryProtein: 'chicken', foodType: 'meal', intakeRating: 'all' }),
      meal({ ms: at(1), primaryProtein: 'chicken', foodType: 'meal', intakeRating: 'most' }),
      meal({ ms: at(2), primaryProtein: 'chicken', foodType: 'meal', intakeRating: 'all' }),
      meal({ ms: at(3), primaryProtein: 'chicken', foodType: 'meal', intakeRating: 'some' }), // not finished
      meal({ ms: at(4), primaryProtein: 'chicken', foodType: 'treat', intakeRating: 'all' }), // ceiling — excluded
      meal({ ms: at(5), primaryProtein: 'chicken', foodType: 'treat', intakeRating: 'all' }),
    ];
    const out = computeTopProteins(rows) as RankedProtein[];
    expect(out).toHaveLength(1);
    const chicken = out[0];
    expect(chicken.isTreat).toBe(false); // has real meal exposure → a meal protein, not treat-sourced
    expect(chicken.count).toBe(6); // exposure includes the 2 treats
    expect(chicken.ratedMeals).toBe(4); // ONLY the 4 meals are rated for the rate
    expect(chicken.finishedRate).toBeCloseTo(0.75, 5); // 3/4 meals — the treats' ceiling is excluded
  });

  it('excludes free-fed meals from a protein finish-rate (§11 #6 still holds post-B-111)', () => {
    // 'chicken' from 5 rated meals, but food 'ff' is free-fed → its intake is not observed.
    const rows: AnalyticsMeal[] = [
      meal({ ms: at(0), primaryProtein: 'chicken', foodItemId: 'a', intakeRating: 'all' }),
      meal({ ms: at(1), primaryProtein: 'chicken', foodItemId: 'a', intakeRating: 'all' }),
      meal({ ms: at(2), primaryProtein: 'chicken', foodItemId: 'a', intakeRating: 'most' }),
      meal({ ms: at(3), primaryProtein: 'chicken', foodItemId: 'a', intakeRating: 'some' }),
      meal({ ms: at(4), primaryProtein: 'chicken', foodItemId: 'ff', intakeRating: 'all' }), // free-fed
    ];
    const out = computeTopProteins(rows, { freeFedFoodIds: new Set(['ff']) }) as RankedProtein[];
    expect(out[0].count).toBe(5); // exposure counts all 5 feedings
    expect(out[0].ratedMeals).toBe(4); // the free-fed meal is excluded from the rate denominator
    expect(out[0].finishedRate).toBeCloseTo(0.75, 5); // 3 finished / 4 observed
  });

  it('treats DO count toward the ranking floor — they are protein exposure (B-111)', () => {
    // 2 beef meals + 2 turkey treats = 4 protein exposures → AT the floor → ranks. Pre-B-111
    // this was a sentinel (only 2 MEALS counted), which kept a treat-heavy logger's confounder
    // invisible — the opposite of the goal.
    const rows: AnalyticsMeal[] = [
      meal({ ms: at(0), primaryProtein: 'beef', foodType: 'meal' }),
      meal({ ms: at(1), primaryProtein: 'beef', foodType: 'meal' }),
      meal({ ms: at(2), primaryProtein: 'turkey', foodType: 'treat' }),
      meal({ ms: at(3), primaryProtein: 'turkey', foodType: 'treat' }),
    ];
    expect(computeTopProteins(rows)).toEqual([
      { protein: 'beef', count: 2, shareOfDiet: 0.5, finishedRate: null, ratedMeals: 0, isTreat: false },
      { protein: 'turkey', count: 2, shareOfDiet: 0.5, finishedRate: null, ratedMeals: 0, isTreat: true },
    ]);
  });
});

// ── B-115: exact-timestamp same-food TREAT re-log collapse ───────────────────────
//
// A "multi-piece handful logged per-piece" (one treat-giving entered as N identical rows)
// must not inflate a treat's protein/food EXPOSURE — the count/share/rank/floor that bridges
// to the vet-report diet-confounder line. Collapse is TREAT-only + EXACT-ms + non-null
// foodItemId: the narrowest safe scope — it never over-collapses a genuine exposure (which
// would HIDE a confounder the vet needs to see) and never touches the meals-only finished-rate.

describe('B-115 — exact-timestamp treat re-log collapse', () => {
  it('collapses a same-treat handful so it cannot push a treat protein over the staple (the CE-H counterexample)', () => {
    // duck = the real meal protein (4 meals). A SINGLE handful of chicken treats is logged
    // per-piece — 5 rows at the SAME instant + SAME treat food. Raw count would rank chicken
    // 5 > duck 4 → a treat confounder wrongly #1. Collapsed, the handful is ONE chicken
    // exposure (share over the collapsed 5-feeding set) and duck stays the headline.
    const handfulMs = at(2);
    const rows: AnalyticsMeal[] = [
      meal({ ms: at(0), primaryProtein: 'duck', foodType: 'meal', foodItemId: 'd' }),
      meal({ ms: at(1), primaryProtein: 'duck', foodType: 'meal', foodItemId: 'd' }),
      meal({ ms: at(3), primaryProtein: 'duck', foodType: 'meal', foodItemId: 'd' }),
      meal({ ms: at(4), primaryProtein: 'duck', foodType: 'meal', foodItemId: 'd' }),
      ...Array.from({ length: 5 }, () =>
        meal({ ms: handfulMs, primaryProtein: 'chicken', foodType: 'treat', foodItemId: 'temptation' }),
      ),
    ];
    expect(computeTopProteins(rows)).toEqual([
      { protein: 'duck', count: 4, shareOfDiet: 4 / 5, finishedRate: null, ratedMeals: 0, isTreat: false },
      { protein: 'chicken', count: 1, shareOfDiet: 1 / 5, finishedRate: null, ratedMeals: 0, isTreat: true },
    ]);
  });

  it('collapses a same-treat handful in Top Foods too (count/share over the collapsed set)', () => {
    const handfulMs = at(1);
    const rows: AnalyticsMeal[] = [
      meal({ ms: at(0), foodItemId: 'M', foodLabel: 'Meal M', foodType: 'meal' }),
      meal({ ms: at(2), foodItemId: 'M', foodLabel: 'Meal M', foodType: 'meal' }),
      meal({ ms: at(3), foodItemId: 'M', foodLabel: 'Meal M', foodType: 'meal' }),
      ...Array.from({ length: 4 }, () =>
        meal({ ms: handfulMs, foodItemId: 'T', foodLabel: 'Temptations', foodType: 'treat' }),
      ),
    ];
    expect(computeTopFoods(rows)).toEqual([
      { foodItemId: 'M', label: 'Meal M', foodType: 'meal', count: 3, shareOfDiet: 0.75, finishedRate: null, ratedMeals: 0, isTreat: false },
      { foodItemId: 'T', label: 'Temptations', foodType: 'treat', count: 1, shareOfDiet: 0.25, finishedRate: null, ratedMeals: 0, isTreat: true },
    ]);
  });

  it('does NOT collapse genuinely-separate treat givings at different timestamps (preserve real exposure)', () => {
    // A daily chicken treat over 5 days — 5 DISTINCT timestamps = 5 REAL exposures. Only an
    // EXACT-ms re-log collapses; a time-window merge would erase real exposures and could hide
    // a diet-trial confounder (the never-over-collapse rule).
    const rows: AnalyticsMeal[] = [0, 1, 2, 3, 4].map((d) =>
      meal({ ms: at(d), primaryProtein: 'chicken', foodType: 'treat', foodItemId: 'temptation' }),
    );
    expect(computeTopProteins(rows)).toEqual([
      { protein: 'chicken', count: 5, shareOfDiet: 1, finishedRate: null, ratedMeals: 0, isTreat: true },
    ]);
  });

  it('does NOT collapse two DIFFERENT treat foods sharing an instant (distinct product exposures)', () => {
    // A jerky AND a Temptation given together: same ms, both beef, but different foodItemId →
    // two genuine product exposures, not one food re-logged.
    const sameMs = at(0);
    const rows: AnalyticsMeal[] = [
      meal({ ms: sameMs, primaryProtein: 'beef', foodType: 'treat', foodItemId: 'jerky' }),
      meal({ ms: sameMs, primaryProtein: 'beef', foodType: 'treat', foodItemId: 'temptation' }),
      meal({ ms: at(1), primaryProtein: 'beef', foodType: 'treat', foodItemId: 'jerky' }),
      meal({ ms: at(2), primaryProtein: 'beef', foodType: 'treat', foodItemId: 'jerky' }),
    ];
    expect((computeTopProteins(rows) as RankedProtein[])[0].count).toBe(4);
  });

  it('does NOT collapse treat re-logs with a null foodItemId (cannot identify the same food)', () => {
    // Built literally: the `meal()` helper coalesces a null foodItemId to 'f1', so the null
    // case must bypass it. Without a foodItemId we can't tell "same treat re-logged" from
    // "two foods" → leave them (preserve exposure rather than risk merging distinct feedings).
    const t = (ms: number): AnalyticsMeal => ({
      ms, foodItemId: null, foodLabel: 'Mystery treat', foodType: 'treat',
      primaryProtein: 'chicken', intakeRating: null,
    });
    const rows: AnalyticsMeal[] = [t(at(0)), t(at(0)), t(at(1)), t(at(2))];
    expect((computeTopProteins(rows) as RankedProtein[])[0].count).toBe(4);
  });

  it('does NOT collapse meals sharing an instant — only treats — so the meals-only finished-rate cannot regress (§11 #1)', () => {
    // Two MEAL rows of one food at the exact same instant stay TWO rated meals: B-115 is
    // treat-scoped, keeping it entirely off the clinical intake/decline lane.
    const sameMs = at(0);
    const rows: AnalyticsMeal[] = [
      meal({ ms: sameMs, primaryProtein: 'chicken', foodItemId: 'a', foodType: 'meal', intakeRating: 'refused' }),
      meal({ ms: sameMs, primaryProtein: 'chicken', foodItemId: 'a', foodType: 'meal', intakeRating: 'refused' }),
      meal({ ms: at(1), primaryProtein: 'chicken', foodItemId: 'a', foodType: 'meal', intakeRating: 'most' }),
      meal({ ms: at(2), primaryProtein: 'chicken', foodItemId: 'a', foodType: 'meal', intakeRating: 'most' }),
    ];
    const out = computeTopProteins(rows) as RankedProtein[];
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(4); // all 4 meals preserved (no treat collapse)
    expect(out[0].ratedMeals).toBe(4); // finished-rate denominator intact
    expect(out[0].finishedRate).toBeCloseTo(0.5, 5); // 2 of 4 finished (2 refused, 2 most)
  });

  it('a collapsed handful does not lift a thin dataset over the ranking floor (the floor is on REAL exposures)', () => {
    // 1 real beef meal + a 5-piece chicken-treat handful at one instant. Raw count 6 > floor,
    // but there are only 2 real feedings, so the honest reading is BELOW the floor → the
    // notEnoughData sentinel, never a fabricated treat rank.
    const handfulMs = at(1);
    const rows: AnalyticsMeal[] = [
      meal({ ms: at(0), primaryProtein: 'beef', foodType: 'meal', foodItemId: 'm' }),
      ...Array.from({ length: 5 }, () =>
        meal({ ms: handfulMs, primaryProtein: 'chicken', foodType: 'treat', foodItemId: 't' }),
      ),
    ];
    expect(computeTopProteins(rows)).toEqual({
      status: 'not_enough_data', samples: 2, needed: ANALYTICS_FLOORS.minMealsForRanking,
    });
  });

  it('a genuine single treat exposure still ranks, flagged isTreat (B-111 invariant preserved)', () => {
    // The collapse must not regress B-111: one chicken treat is still one chicken exposure.
    const rows: AnalyticsMeal[] = [
      meal({ ms: at(0), primaryProtein: 'beef', foodType: 'meal', foodItemId: 'm' }),
      meal({ ms: at(1), primaryProtein: 'beef', foodType: 'meal', foodItemId: 'm' }),
      meal({ ms: at(2), primaryProtein: 'beef', foodType: 'meal', foodItemId: 'm' }),
      meal({ ms: at(3), primaryProtein: 'chicken', foodType: 'treat', foodItemId: 'temptation' }),
    ];
    expect(computeTopProteins(rows)).toEqual([
      { protein: 'beef', count: 3, shareOfDiet: 0.75, finishedRate: null, ratedMeals: 0, isTreat: false },
      { protein: 'chicken', count: 1, shareOfDiet: 0.25, finishedRate: null, ratedMeals: 0, isTreat: true },
    ]);
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

  it('fires no matter HOW MANY times a normally-eaten food is refused in one day (adversarial regression)', () => {
    // The adversarial review broke this: same-day re-logged refusals polluted `prior`,
    // dragging priorMean below the floor, so refusing HARDER (3x) went SILENT while 1x
    // fired. The watch must fire for any N>=1 — more refusal can never mean less concern.
    const priorDays: AnalyticsMeal[] = [
      meal({ ms: at(7), foodItemId: 'f1', foodLabel: 'Acme Dinner', intakeRating: 'all' }),
      meal({ ms: at(6), foodItemId: 'f1', foodLabel: 'Acme Dinner', intakeRating: 'all' }),
      meal({ ms: at(5), foodItemId: 'f1', foodLabel: 'Acme Dinner', intakeRating: 'all' }),
    ];
    const refusalsToday = (n: number): AnalyticsMeal[] =>
      Array.from({ length: n }, (_, i) =>
        meal({ ms: at(0, 2 + i * 2), foodItemId: 'f1', foodLabel: 'Acme Dinner', intakeRating: 'refused' }),
      );
    for (const n of [1, 2, 3, 5]) {
      const out = detectIntakeDecline({
        species: 'dog', nowMs: NOW, meals: [...priorDays, ...refusalsToday(n)], freeFedFoodIds: new Set(),
      });
      expect(out.status).toBe('watch'); // monotonic: never silent for a larger n
      if (out.status === 'watch') {
        expect(out.flags.some((f) => f.trigger === 'refused_normal_food')).toBe(true);
      }
    }
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

describe('getIntakeRateWithPrior (wrapper wiring)', () => {
  it('reads BOTH windows, applies the current free-fed exclusion to each, returns the two rates', async () => {
    mockGetAllAsync.mockReset();
    mockGetAllAsync
      // current window read: 2 of 4 finished → 0.5; one free-fed meal excluded
      .mockResolvedValueOnce([
        { food_item_id: 'a', intake_rating: 'most', occurred_at: '2026-06-14T08:00:00Z', food_type: 'meal', primary_protein: null, brand: 'Acme', product_name: 'A' },
        { food_item_id: 'b', intake_rating: 'all', occurred_at: '2026-06-13T08:00:00Z', food_type: 'meal', primary_protein: null, brand: 'Acme', product_name: 'B' },
        { food_item_id: 'c', intake_rating: 'some', occurred_at: '2026-06-12T08:00:00Z', food_type: 'meal', primary_protein: null, brand: 'Acme', product_name: 'C' },
        { food_item_id: 'd', intake_rating: 'refused', occurred_at: '2026-06-11T08:00:00Z', food_type: 'meal', primary_protein: null, brand: 'Acme', product_name: 'D' },
        { food_item_id: 'free-1', intake_rating: 'all', occurred_at: '2026-06-14T09:00:00Z', food_type: 'meal', primary_protein: null, brand: 'Acme', product_name: 'Free' },
      ])
      // prior window read: 1 of 4 finished → 0.25
      .mockResolvedValueOnce([
        { food_item_id: 'a', intake_rating: 'most', occurred_at: '2026-05-20T08:00:00Z', food_type: 'meal', primary_protein: null, brand: 'Acme', product_name: 'A' },
        { food_item_id: 'b', intake_rating: 'refused', occurred_at: '2026-05-19T08:00:00Z', food_type: 'meal', primary_protein: null, brand: 'Acme', product_name: 'B' },
        { food_item_id: 'c', intake_rating: 'refused', occurred_at: '2026-05-18T08:00:00Z', food_type: 'meal', primary_protein: null, brand: 'Acme', product_name: 'C' },
        { food_item_id: 'd', intake_rating: 'some', occurred_at: '2026-05-17T08:00:00Z', food_type: 'meal', primary_protein: null, brand: 'Acme', product_name: 'D' },
      ]);
    mockGetActiveArrangementsForPet.mockResolvedValue([
      { id: 'arr-1', food_item_id: 'free-1', active_from: null, updated_at: '', brand: '', product_name: '', format: 'dry' },
    ]);

    const out = await getIntakeRateWithPrior('pet-1', 'month', NOW);
    expect(mockGetActiveArrangementsForPet).toHaveBeenCalledWith('pet-1');
    expect(out.current).toEqual({ rate: 0.5, finishedMeals: 2, ratedMeals: 4, freeFedExcluded: 1, intakeNotDirectlyObserved: true });
    expect(out.prior).toEqual({ rate: 0.25, finishedMeals: 1, ratedMeals: 4, freeFedExcluded: 0, intakeNotDirectlyObserved: false });
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

// ── B-102 PR 4: "Human food" format parity (routes by food_type, never format) ────
//
// "Human food" (deli meat, Costco rotisserie chicken) is a `food_format` value
// (B-102 PR 1, migration 019) — but the dashboard groups by `food_type` (meal/treat)
// + food_item and NEVER reads `format`: readMealRows doesn't even SELECT it, and the
// AnalyticsMeal shape the pure cores consume carries no format field. So a human_food
// item logged as a treat already flows through top-foods + meals/treats composition
// exactly like any other treat — PR 4 is verify-and-lock, not new grouping code
// (requirements §5 / §11 PR-4 / §12). This regression test pins that: a future change
// that taught the dashboard to enumerate formats and dropped `human_food` would fail
// here. Run at the DB-wrapper level on purpose — it's the only layer where `format`
// exists in the data, so it's the only place "format is inert" can be proven.
describe('B-102 — human_food format parity (routes by food_type, never format)', () => {
  it('a human_food/treat item flows through top-foods + composition; its format is inert', async () => {
    const isoAt = (dayOffset: number, hour = 8) => new Date(at(dayOffset, hour)).toISOString();
    // The joined food_items_cache row carries format='human_food' (Costco rotisserie
    // chicken, logged as a treat). The analytics read path ignores `format` and routes
    // by `food_type`. Four kibble meals clear the ranking floor so the treat is ranked
    // alongside a real food rather than swallowed by notEnoughData.
    mockGetAllAsync.mockResolvedValue([
      { food_item_id: 'hf', intake_rating: 'all', occurred_at: isoAt(0), food_type: 'treat', primary_protein: null, brand: 'Costco', product_name: 'Rotisserie Chicken', format: 'human_food' },
      { food_item_id: 'kib', intake_rating: 'all', occurred_at: isoAt(1), food_type: 'meal', primary_protein: 'chicken', brand: 'Acme', product_name: 'Dinner', format: 'dry_kibble' },
      { food_item_id: 'kib', intake_rating: 'most', occurred_at: isoAt(2), food_type: 'meal', primary_protein: 'chicken', brand: 'Acme', product_name: 'Dinner', format: 'dry_kibble' },
      { food_item_id: 'kib', intake_rating: 'all', occurred_at: isoAt(3), food_type: 'meal', primary_protein: 'chicken', brand: 'Acme', product_name: 'Dinner', format: 'dry_kibble' },
      { food_item_id: 'kib', intake_rating: 'all', occurred_at: isoAt(4), food_type: 'meal', primary_protein: 'chicken', brand: 'Acme', product_name: 'Dinner', format: 'dry_kibble' },
    ]);

    // Top foods: the human_food row is RANKED, tagged a treat (food_type), and its
    // ceiling finish-rate is nulled (§11 #1) — not dropped or mis-bucketed because its
    // FORMAT is the new human_food value.
    const top = (await getTopFoods('pet-1', 'month', NOW)) as RankedFood[];
    expect(isNotEnoughData(top)).toBe(false);
    expect(top.find((f) => f.foodItemId === 'hf')).toMatchObject({
      foodItemId: 'hf', label: 'Costco Rotisserie Chicken', foodType: 'treat', count: 1, isTreat: true, finishedRate: null,
    });
    // The ordinary kibble meal is untouched by the human_food row's presence.
    expect(top.find((f) => f.foodItemId === 'kib')).toMatchObject({ foodType: 'meal', count: 4, isTreat: false });

    // Meals & treats composition: the human_food row is counted as a TREAT (via
    // food_type), separately from the four meals — never folded into the meal count.
    expect(await getMealTreatComposition('pet-1', 'month', NOW)).toEqual({
      meal: 4, treat: 1, other: 0, unclassified: 0, total: 5,
    });
  });
});
