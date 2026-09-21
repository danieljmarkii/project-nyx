// The Signal's one window predicate (D2-3 · CUL-1065): the card's bars and its line read
// the same weeks (C-4, property-tested), the compare's windows are equal and never
// overlap, the lanes carry every episode timed or not, and the trial mark sits on its day.
//
// Every fixture is a DAY KEY (C-29): no instant is built anywhere here, so the three CI
// zones (UTC+14 / +12:45 / −10) see the same calendar. The one clock read in the suite
// is the rolling-window property, anchored to `Date.now()` on purpose (C-29's time-axis
// half): a fixture pinned to an absolute date would fail on a calendar boundary rather
// than on a change.

import {
  DEFAULT_WINDOW_DAYS,
  MAX_COMPARE_DAYS,
  MAX_WEEKS,
  MIN_COMPARE_DAYS,
  MIN_WEEKS,
  signalCompare,
  signalCompareSpec,
  signalLaneSpec,
  signalLanes,
  signalSymptomOf,
  signalWeekCount,
  signalWeeks,
  signalWindowDays,
  trialTooYoungToCompare,
  weekLine,
  weekLineNumbers,
  type SignalTrialWindow,
} from './signalWindows';
import type {
  CorrelationFinding,
  IntakeDeclineFinding,
  SignalFinding,
  SymptomChronicityFinding,
  SymptomWorseningFinding,
  TrialResponseFinding,
} from './signal';
import { MIN_INTERPRETABLE_DAYS } from './dietTrial';
import { dayKeyFromIndex, localDayIndexOf, toLocalDayKey } from './utils';

const idx = (key: string): number => {
  const i = localDayIndexOf(key);
  if (i == null) throw new Error(key);
  return i;
};
const shift = (key: string, days: number): string => dayKeyFromIndex(idx(key) + days);

/** Deterministic LCG so the property tests are reproducible without a new dependency. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// 2026-09-20 is a Sunday; the mock's day is Thursday the 17th.
const SUNDAY = '2026-09-20';
const THURSDAY = '2026-09-17';

const chronicity = (over: Partial<SymptomChronicityFinding> = {}): SymptomChronicityFinding => ({
  type: 'symptom_chronicity',
  priorityClass: 'safety',
  symptomType: 'vomit',
  episodeCount: 14,
  spanDays: 40,
  activeWeeks: 5,
  symptomDays: 12,
  daysSinceLastEpisode: 1,
  firstOnsetIso: '2026-08-01T00:00:00Z',
  tier: 'standard',
  windowDays: 56,
  ...over,
});

const worsening = (over: Partial<SymptomWorseningFinding> = {}): SymptomWorseningFinding => ({
  type: 'symptom_worsening',
  priorityClass: 'safety',
  symptomType: 'vomit',
  currentCount: 5,
  priorCount: 2,
  currentDays: 4,
  priorDays: 2,
  trigger: 'more_episodes',
  tier: 'standard',
  windowDays: 14,
  ...over,
});

const correlation = (): CorrelationFinding => ({
  type: 'food_symptom_correlation',
  priorityClass: 'insight',
  tier: 'early',
  symptomType: 'vomit',
  protein: 'chicken',
  matchedPairs: 4,
  symptomEventCount: 4,
  correlationWindowHours: 12,
});

const trialResponse = (): TrialResponseFinding => ({
  type: 'trial_response',
  priorityClass: 'insight',
  trialDayNumber: 55,
  targetDurationDays: 56,
  trialLoggedDays: 51,
  baselineLoggedDays: 44,
  baselineWindowDays: 55,
  pooledTrialCount: 21,
  pooledBaselineCount: 19,
  rapid: { trial: 7, baseline: 6 },
  long: { trial: 0, baseline: 0 },
  rapidWindowMinutes: 30,
  longGapHours: 6,
  treatShare: { trial: null, baseline: null },
  mealsPerDay: { trial: null, baseline: null },
  comparisonDirection: 'more_during_trial',
  trialWindowDays: 55,
});

const intake = (): IntakeDeclineFinding => ({
  type: 'intake_decline',
  priorityClass: 'safety',
  trigger: 'consecutive_low',
  species: 'cat',
  daysBelowBaseline: 3,
  refusedFoodLabel: null,
  ratedMealsConsidered: 9,
});

/** The mock's trial: started 55 days before the Thursday, so the Thursday is day 55. */
const trialFor = (today: string, dayCounter = 55, targetDays = 56): SignalTrialWindow => ({
  startDay: shift(today, -(dayCounter - 1)),
  identity: 'Rabbit trial',
  dayCounter,
  targetDays,
  foodLabel: 'Royal Canin Selected Protein PR',
});

describe('signalWindowDays / signalSymptomOf', () => {
  it('reads the finding’s own lookback and falls back to the engine’s 56 days', () => {
    expect(signalWindowDays(chronicity())).toBe(56);
    expect(signalWindowDays(worsening())).toBe(14);
    expect(signalWindowDays(correlation())).toBe(DEFAULT_WINDOW_DAYS);
    expect(signalWindowDays(trialResponse())).toBe(55);
    expect(signalWindowDays(intake())).toBe(DEFAULT_WINDOW_DAYS);
    expect(signalWindowDays(chronicity({ windowDays: 0 }))).toBe(DEFAULT_WINDOW_DAYS);
    expect(signalWindowDays(chronicity({ windowDays: Number.NaN }))).toBe(DEFAULT_WINDOW_DAYS);
  });

  it('names the symptom a finding counts, and null for the types that count none', () => {
    expect(signalSymptomOf(chronicity({ symptomType: 'cough' }))).toBe('cough');
    expect(signalSymptomOf(correlation())).toBe('vomit');
    expect(signalSymptomOf(trialResponse())).toBe('vomit');
    expect(signalSymptomOf(intake())).toBeNull();
  });
});

describe('signalWeekCount — enough weeks for the lookback, the trial, never past the cap', () => {
  it('draws every Sunday-start week the lookback touches: 56 days on a Thursday is 9, 14 days is 3', () => {
    // The mock's chart: Jul 19 through the partial week of Sep 13 — nine bars.
    expect(signalWeekCount(chronicity(), THURSDAY, null)).toBe(9);
    expect(signalWeeks({ finding: chronicity(), today: THURSDAY, trial: null, episodeDays: [], loggedDays: [] }).firstKey).toBe('2026-07-19');
    expect(signalWeekCount(worsening(), THURSDAY, null)).toBe(3);
    // A one-week lookback on a Sunday is one week — the floor holds it at two; so is a
    // one-DAY lookback (the floor's own case, pinned so the floor is not decorative).
    expect(signalWeekCount(worsening({ windowDays: 7 }), SUNDAY, null)).toBe(MIN_WEEKS);
    expect(signalWeekCount(worsening({ windowDays: 1 }), THURSDAY, null)).toBe(MIN_WEEKS);
    expect(MIN_WEEKS).toBe(2);
  });

  it('a young pet: days before the record are not "unlogged" on the ticks (recordStart, C-3)', () => {
    const m = signalWeeks({
      finding: worsening(),
      today: THURSDAY,
      trial: null,
      episodeDays: [],
      loggedDays: [THURSDAY],
      recordStart: shift(THURSDAY, -2),
    });
    const flat = m.weeks.flatMap((w) => w.days);
    expect(flat.filter((d) => d === 'before_record').length).toBeGreaterThan(0);
    expect(flat.filter((d) => d === 'unlogged')).toHaveLength(2);
    expect(flat.filter((d) => d === 'logged')).toHaveLength(1);
  });

  it('widens to a trial longer than the lookback, so the mark is on the chart', () => {
    // A two-week finding on day 55 of a trial: the trial's nine weeks, the mark inside them
    // at the mock's 6/7 (a Saturday start).
    const trial = trialFor(THURSDAY);
    expect(signalWeekCount(worsening(), THURSDAY, trial)).toBe(9);
    const m = signalWeeks({ finding: worsening(), today: THURSDAY, trial, episodeDays: [], loggedDays: [] });
    expect(m.mark?.outside).toBeNull();
    expect(m.mark?.day).toBe(trial.startDay);
    expect(m.mark?.slot).toBeCloseTo(6 / 7, 6);
  });

  it('caps at MAX_WEEKS; a longer trial’s mark is placed in words, never dropped (C-37)', () => {
    const trial = trialFor(THURSDAY, 200, 56);
    expect(signalWeekCount(chronicity(), THURSDAY, trial)).toBe(MAX_WEEKS);
    const m = signalWeeks({ finding: chronicity(), today: THURSDAY, trial, episodeDays: [], loggedDays: [] });
    expect(m.mark?.outside).toBe('before');
    expect(m.mark?.label).toBe('rabbit trial started');
  });
});

describe('the week line reads the buckets the bars draw (C-4)', () => {
  it('“2 this week so far · 3 last week” on the mock’s Thursday', () => {
    const m = signalWeeks({
      finding: chronicity(),
      today: THURSDAY,
      trial: null,
      episodeDays: [shift(THURSDAY, -1), THURSDAY, shift(THURSDAY, -6), shift(THURSDAY, -7), shift(THURSDAY, -8)],
      loggedDays: [],
    });
    // The Thursday's week starts Sunday the 13th; last week the 6th.
    expect(m.weeks[m.weeks.length - 1].startKey).toBe('2026-09-13');
    expect(weekLine(m)).toBe('2 this week so far · 3 last week');
  });

  it('drops “so far” once the week is over (a Saturday), and “last week” with a single bucket', () => {
    const saturday = shift(SUNDAY, 6);
    const m = signalWeeks({ finding: chronicity(), today: saturday, trial: null, episodeDays: [saturday], loggedDays: [] });
    expect(weekLine(m)).toBe('1 this week · 0 last week');
  });

  it('PROPERTY: the line’s two numbers are exactly the last two bars, over random records', () => {
    const rnd = lcg(0xd23);
    for (let trial = 0; trial < 200; trial++) {
      const today = shift(SUNDAY, Math.floor(rnd() * 400) - 200);
      const finding = rnd() < 0.5 ? chronicity({ windowDays: 7 * (1 + Math.floor(rnd() * 12)) }) : worsening();
      const runningTrial = rnd() < 0.4 ? trialFor(today, 1 + Math.floor(rnd() * 90), 56) : null;
      const episodeDays: string[] = [];
      const n = Math.floor(rnd() * 40);
      for (let i = 0; i < n; i++) episodeDays.push(shift(today, -Math.floor(rnd() * 100)));
      const loggedDays = episodeDays.filter(() => rnd() < 0.7);
      const m = signalWeeks({ finding, today, trial: runningTrial, episodeDays, loggedDays });
      const { thisWeek, lastWeek, soFar } = weekLineNumbers(m);
      const last = m.weeks[m.weeks.length - 1];
      const prev = m.weeks[m.weeks.length - 2];
      // Summing the bars: the last bar IS "this week", the one before IS "last week".
      expect(thisWeek).toBe(last.count);
      expect(lastWeek).toBe(prev.count);
      expect(soFar).toBe(last.partial);
      expect(weekLine(m)).toBe(`${last.count} this week${last.partial ? ' so far' : ''} · ${prev.count} last week`);
      // And the bars hold every episode inside the drawn weeks: total = Σ counts.
      expect(m.total).toBe(m.weeks.reduce((a, w) => a + w.count, 0));
      expect(m.total + m.before + m.after).toBe(episodeDays.length);
    }
  });

  it('is anchored to the real clock: today’s key is always the last week’s bucket', () => {
    const today = toLocalDayKey(new Date(Date.now()));
    const m = signalWeeks({ finding: chronicity(), today, trial: null, episodeDays: [today], loggedDays: [today] });
    const last = m.weeks[m.weeks.length - 1];
    expect(idx(last.startKey)).toBeLessThanOrEqual(idx(today));
    expect(idx(last.endKey)).toBeGreaterThanOrEqual(idx(today));
    expect(weekLineNumbers(m).thisWeek).toBe(1);
  });
});

describe('the compare — two equal windows, adjacent, never overlapping', () => {
  it('on a trial: the trial’s N days and the N days before them, N = the day counter', () => {
    const [before, during] = signalCompareSpec(chronicity(), THURSDAY, trialFor(THURSDAY));
    expect(during).toEqual({ label: "The trial's 55 days", startDay: shift(THURSDAY, -54), days: 55 });
    expect(before).toEqual({ label: 'The 55 days before', startDay: shift(THURSDAY, -109), days: 55 });
    expect(idx(before.startDay) + before.days).toBe(idx(during.startDay));
  });

  it('without a trial: the two halves of the lookback, ending today', () => {
    const [before, during] = signalCompareSpec(chronicity(), THURSDAY, null);
    expect(during).toEqual({ label: 'The recent 28 days', startDay: shift(THURSDAY, -27), days: 28 });
    expect(before).toEqual({ label: 'The 28 days before', startDay: shift(THURSDAY, -55), days: 28 });
  });

  it('a trial under the floor draws NO trial compare — a day-one trial is the n=1 picture (the floor mirrors the diet-trial spec)', () => {
    expect(MIN_COMPARE_DAYS).toBe(MIN_INTERPRETABLE_DAYS);
    for (const day of [1, 2, MIN_COMPARE_DAYS - 1]) {
      const trial = trialFor(THURSDAY, day);
      expect(trialTooYoungToCompare(trial)).toBe(true);
      // The no-trial shape: the halves of the lookback, ending today — the trial inside
      // them undivided, and the lanes one lane.
      const [before, during] = signalCompareSpec(chronicity(), THURSDAY, trial);
      expect(during.label).toBe('The recent 28 days');
      expect(before.label).toBe('The 28 days before');
      expect(signalLaneSpec(chronicity(), THURSDAY, trial).map((l) => l.label)).toEqual(['The last 56 days']);
    }
    const atFloor = trialFor(THURSDAY, MIN_COMPARE_DAYS);
    expect(trialTooYoungToCompare(atFloor)).toBe(false);
    expect(signalCompareSpec(chronicity(), THURSDAY, atFloor)[1].label).toBe(`The trial's ${MIN_COMPARE_DAYS} days`);
    expect(trialTooYoungToCompare(null)).toBe(false);
  });

  it('the trial’s window is the DAY COUNTER the title states, ending today — never re-derived from the start day', () => {
    // The two are equal by construction in production; here they are made to disagree so
    // the test can see which one the compare follows (a fixture that cannot disagree
    // measures nothing, C-35).
    const trial: SignalTrialWindow = { ...trialFor(THURSDAY, 55), startDay: shift(THURSDAY, -30) };
    const [before, during] = signalCompareSpec(chronicity(), THURSDAY, trial);
    expect(during.days).toBe(55);
    expect(during.startDay).toBe(shift(THURSDAY, -54));
    expect(before.startDay).toBe(shift(THURSDAY, -109));
  });

  it('past the cap: the trial’s LAST 84 days against the 84 before the trial, a gap between them, both named', () => {
    const trial = trialFor(THURSDAY, 200);
    const [before, during] = signalCompareSpec(chronicity(), THURSDAY, trial);
    expect(MAX_COMPARE_DAYS).toBe(84);
    expect(during).toEqual({ label: "The trial's last 84 days", startDay: shift(THURSDAY, -83), days: 84 });
    expect(before).toEqual({ label: 'The 84 days before the trial', startDay: shift(THURSDAY, -199 - 84), days: 84 });
    // Two windows together are under a year, so a year-less date inside them is always
    // the last twelve months' (C-19).
    expect(2 * MAX_COMPARE_DAYS + 1).toBeLessThan(365);
    const lanes = signalLaneSpec(chronicity(), THURSDAY, trial);
    expect(lanes[1]).toEqual({ label: 'In the trial', startDay: shift(THURSDAY, -83), endDay: THURSDAY });
  });

  it('an odd lookback splits by the floor: 15 days is two windows of 7, ending today', () => {
    const [before, during] = signalCompareSpec(chronicity({ windowDays: 15 }), THURSDAY, null);
    expect(during).toEqual({ label: 'The recent 7 days', startDay: shift(THURSDAY, -6), days: 7 });
    expect(before).toEqual({ label: 'The 7 days before', startDay: shift(THURSDAY, -13), days: 7 });
  });

  it('a compare reaching before the record’s first day says so, and counts none of those days as unlogged', () => {
    const m = signalCompare({
      finding: chronicity(),
      today: THURSDAY,
      trial: trialFor(THURSDAY, 55),
      episodeDays: [THURSDAY],
      loggedDays: [THURSDAY],
      recordStart: shift(THURSDAY, -60),
    });
    expect(m.windows[0].coverageLine).toBe('logged 0 of 55 days · 49 before the record began');
    expect(m.windows[0].strip.filter((d) => d === 'before_record')).toHaveLength(49);
  });

  it('PROPERTY: equal length, disjoint, ending today; adjacent unless capped; the model accepts them', () => {
    const rnd = lcg(0xc0de);
    for (let t = 0; t < 200; t++) {
      const today = shift(SUNDAY, Math.floor(rnd() * 400) - 200);
      const finding = chronicity({ windowDays: 1 + Math.floor(rnd() * 120) });
      const trial = rnd() < 0.5 ? trialFor(today, 1 + Math.floor(rnd() * 240)) : null;
      const [before, during] = signalCompareSpec(finding, today, trial);
      expect(before.days).toBe(during.days);
      expect(before.days).toBeGreaterThan(0);
      expect(before.days).toBeLessThanOrEqual(MAX_COMPARE_DAYS);
      const capped = trial != null && !trialTooYoungToCompare(trial) && trial.dayCounter > MAX_COMPARE_DAYS;
      if (capped) expect(idx(before.startDay) + before.days).toBeLessThan(idx(during.startDay));
      else expect(idx(before.startDay) + before.days).toBe(idx(during.startDay));
      expect(idx(during.startDay) + during.days - 1).toBe(idx(today));
      const m = signalCompare({ finding, today, trial, episodeDays: [today, shift(today, -3)], loggedDays: [today] });
      expect(m.windows[0].days).toBe(before.days);
      expect(m.windows[1].coverageLine).toMatch(/^logged \d+ of \d+ days?$/);
    }
  });

  it('carries no adjudicating word anywhere in its labels', () => {
    for (const trial of [null, trialFor(THURSDAY)]) {
      const m = signalCompare({ finding: chronicity(), today: THURSDAY, trial, episodeDays: [], loggedDays: [] });
      for (const w of m.windows) {
        expect(`${w.label} ${w.coverageLine}`).not.toMatch(/\b(?:fair|fairly|comparable|even|equal|enough)\b/i);
      }
    }
  });
});

describe('the lanes — before the trial · in it, or one lane over the lookback', () => {
  it('two lanes on a trial, the same windows as the compare', () => {
    const specs = signalLaneSpec(chronicity(), THURSDAY, trialFor(THURSDAY));
    expect(specs.map((s) => s.label)).toEqual(['Before the trial', 'In the trial']);
    expect(specs[1]).toEqual({ label: 'In the trial', startDay: shift(THURSDAY, -54), endDay: THURSDAY });
    expect(specs[0].endDay).toBe(shift(THURSDAY, -55));
  });

  it('one lane without a trial, named by the lookback', () => {
    const specs = signalLaneSpec(worsening(), THURSDAY, null);
    expect(specs).toEqual([{ label: 'The last 14 days', startDay: shift(THURSDAY, -13), endDay: THURSDAY }]);
  });

  it('every episode in a window is on its lane, timed or not — the untimed line is the array’s shape', () => {
    const trial = trialFor(THURSDAY);
    const m = signalLanes({
      finding: chronicity(),
      today: THURSDAY,
      trial,
      episodes: [
        { dayKey: THURSDAY, minutesSinceMeal: 3 },
        { dayKey: shift(THURSDAY, -2), minutesSinceMeal: null },
        { dayKey: shift(THURSDAY, -60), minutesSinceMeal: 400 },
        { dayKey: shift(THURSDAY, -61), minutesSinceMeal: null },
        { dayKey: shift(THURSDAY, -200), minutesSinceMeal: 5 }, // outside both windows
      ],
    });
    expect(m.lanes[0].total).toBe(2);
    expect(m.lanes[0].timedCount).toBe(1);
    expect(m.lanes[1].total).toBe(2);
    expect(m.lanes[1].untimedCount).toBe(1);
    expect(m.lanes[1].timedLine).toBe('1 timed of 2');
    expect(m.axis.config.rapidWindowMinutes).toBe(30);
  });

  it('a trial mark mid-week sits at its fractional slot (a Wednesday is 3/7)', () => {
    // The mock's Thursday; the trial starting the Wednesday before it.
    const trial: SignalTrialWindow = { ...trialFor(THURSDAY, 2), startDay: shift(THURSDAY, -1) };
    const m = signalWeeks({ finding: worsening(), today: THURSDAY, trial, episodeDays: [], loggedDays: [] });
    const weeks = m.weeks.length;
    expect(m.mark?.slot).toBeCloseTo(weeks - 1 + 3 / 7, 6);
  });
});

describe('what the caller owes', () => {
  it('refuses an instant where a day key is expected, rather than bucketing by the runner clock', () => {
    const f: SignalFinding = chronicity();
    expect(() => signalWeeks({ finding: f, today: '2026-09-17T12:00:00Z', trial: null, episodeDays: [], loggedDays: [] })).toThrow(
      /day key/,
    );
    // The compare never reads `startDay` (the day counter is its authority); the mark does.
    expect(() => signalWeeks({ finding: f, today: THURSDAY, trial: { ...trialFor(THURSDAY), startDay: 'not-a-day' }, episodeDays: [], loggedDays: [] })).toThrow(
      /day key/,
    );
  });
});
