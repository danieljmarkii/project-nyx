// The chart family's models against the §05 table (CUL-1064), one block per chart.
//
// Fixtures are day KEYS built from local components (C-29): the CI non-UTC job runs this
// file under Kiritimati / Chatham / Honolulu, and a key built from `toLocalDayKey` on an
// instant near midnight lands on a different weekday per zone — the model must follow the
// KEY, which is the zone decision the caller already made.

import {
  compareWindows,
  daysSoFarLabel,
  episodeDaysOf,
  laneDots,
  lanesUntimedLine,
  timingLanesAxis,
  weekdayOfIndex,
  weekStartIndex,
  weeklyBuckets,
  weightBand,
  WEIGHT_BAND_FRAC,
} from './chartModels';
import { dayKeyFromIndex, localDayIndexOf, toLocalDayKey } from './utils';
import { assignJitterRows, patternsTimingAxis, patternsTimingPos } from './patternsTiming';
import { classifyGapMinutes, DEFAULT_MEAL_TIMING_CONFIG } from './mealTiming';

const laneOf = (label: string, timed: number[], total: number) => ({ label, episodeMinutes: [...timed, ...Array<null>(Math.max(0, total - timed.length)).fill(null)] });

/** Deterministic LCG so the property tests are reproducible without a new dependency. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const idx = (key: string): number => {
  const i = localDayIndexOf(key);
  if (i == null) throw new Error(key);
  return i;
};
const shift = (key: string, days: number): string => dayKeyFromIndex(idx(key) + days);

// 2026-09-20 is a Sunday.
const SUNDAY = '2026-09-20';

describe('day-key arithmetic', () => {
  it('reads Sunday as weekday 0 on a known Sunday, and the week starts there', () => {
    expect(weekdayOfIndex(idx(SUNDAY))).toBe(0);
    expect(weekdayOfIndex(idx(shift(SUNDAY, 6)))).toBe(6);
    expect(dayKeyFromIndex(weekStartIndex(idx(shift(SUNDAY, 3))))).toBe(SUNDAY);
    expect(dayKeyFromIndex(weekStartIndex(idx(shift(SUNDAY, -1))))).toBe(shift(SUNDAY, -7));
  });

  it('is zone-free: the same key indexes the same weekday whatever the runner clock', () => {
    // No instant anywhere in this path — a key is a calendar day (C-29).
    expect(weekdayOfIndex(idx('2026-07-19'))).toBe(0); // the mock's first week, a Sunday
    expect(weekdayOfIndex(idx('2026-07-25'))).toBe(6); // trial mark, a Saturday
  });
});

describe('weeklyBuckets — Sunday-start weeks ending with a chosen week', () => {
  const base = {
    weeksEnding: shift(SUNDAY, 2), // a Tuesday; today
    today: shift(SUNDAY, 2),
    weeks: 3,
  };

  it('a mark per week, a count on every bar, a zero included', () => {
    const m = weeklyBuckets({
      ...base,
      episodeDays: [shift(SUNDAY, -13), shift(SUNDAY, -13), shift(SUNDAY, 1)],
      loggedDays: [],
    });
    expect(m.weeks).toHaveLength(3);
    expect(m.weeks.map((w) => w.count)).toEqual([2, 0, 1]);
    expect(m.total).toBe(3);
    expect(m.firstKey).toBe(shift(SUNDAY, -14));
    expect(m.lastKey).toBe(shift(SUNDAY, 6));
    expect(m.weeks[0].startKey).toBe(shift(SUNDAY, -14));
    expect(m.weeks[2].startKey).toBe(SUNDAY);
    expect(weekdayOfIndex(idx(m.weeks[1].startKey))).toBe(0);
  });

  it('seven coverage ticks per week from loggedDays — never from the episodes (C-3)', () => {
    const m = weeklyBuckets({
      ...base,
      // Two episodes on two days, but only three days of the week logged: reads THIN.
      episodeDays: [shift(SUNDAY, -7), shift(SUNDAY, -6)],
      loggedDays: [shift(SUNDAY, -7), shift(SUNDAY, -6), shift(SUNDAY, -3)],
    });
    const w = m.weeks[1];
    expect(w.count).toBe(2);
    expect(w.days).toEqual(['logged', 'logged', 'unlogged', 'unlogged', 'logged', 'unlogged', 'unlogged']);
    expect(w.loggedCount).toBe(3);
    expect(w.partial).toBe(false);
    expect(daysSoFarLabel(w)).toBeNull();
  });

  it('an episode day that was not in loggedDays is still unlogged on the ticks', () => {
    // The model must not infer coverage from the thing it counts.
    const m = weeklyBuckets({ ...base, episodeDays: [shift(SUNDAY, -7)], loggedDays: [] });
    expect(m.weeks[1].count).toBe(1);
    expect(m.weeks[1].days[0]).toBe('unlogged');
  });

  it('the partial week: days ahead carry no tick, and it says "N days so far"', () => {
    const m = weeklyBuckets({ ...base, episodeDays: [], loggedDays: [SUNDAY, shift(SUNDAY, 2)] });
    const w = m.weeks[2];
    expect(w.partial).toBe(true);
    expect(w.daysSoFar).toBe(3);
    expect(w.days).toEqual(['logged', 'unlogged', 'logged', 'ahead', 'ahead', 'ahead', 'ahead']);
    expect(daysSoFarLabel(w)).toBe('3 days so far');
    const sundayOnly = weeklyBuckets({ ...base, today: SUNDAY, episodeDays: [], loggedDays: [] });
    expect(daysSoFarLabel(sundayOnly.weeks[2])).toBe('1 day so far');
  });

  it('a past window (today after the last week) has no partial week', () => {
    const m = weeklyBuckets({ ...base, today: shift(SUNDAY, 30), episodeDays: [], loggedDays: [] });
    expect(m.weeks.every((w) => !w.partial && w.daysSoFar === 7)).toBe(true);
  });

  it('the mark sits at its day\'s fractional slot, dated; outside the weeks it is KEPT and placed in words (B3)', () => {
    const m = weeklyBuckets({
      ...base,
      episodeDays: [],
      loggedDays: [],
      mark: { day: shift(SUNDAY, -8), label: 'trial · Sep 12' },
    });
    // Week 1 is [SUNDAY−7 … SUNDAY−1]; SUNDAY−8 is the Saturday of week 0 → slot 6/7.
    expect(m.mark).toEqual({ slot: 6 / 7, outside: null, label: 'trial · Sep 12', day: shift(SUNDAY, -8) });
    const before = weeklyBuckets({ ...base, episodeDays: [], loggedDays: [], mark: { day: shift(SUNDAY, -40), label: 'x' } });
    expect(before.mark).toEqual({ slot: null, outside: 'before', label: 'x', day: shift(SUNDAY, -40) });
    const after = weeklyBuckets({ ...base, episodeDays: [], loggedDays: [], mark: { day: shift(SUNDAY, 40), label: 'x' } });
    expect(after.mark).toEqual({ slot: null, outside: 'after', label: 'x', day: shift(SUNDAY, 40) });
  });

  it('B1: today BEFORE the last week — no bar over days that have not arrived, and "so far" on the week holding today', () => {
    // A trial drawn to its target end: weeksEnding is the trial's last day, today is
    // mid-way. Episodes dated after today are disclosed as `after`, never a bar over a
    // coverage of nothing; the wholly-ahead week is not "partial"; the one holding today is.
    const m = weeklyBuckets({
      episodeDays: [shift(SUNDAY, -3), shift(SUNDAY, 2), shift(SUNDAY, 9)],
      loggedDays: [shift(SUNDAY, -3), shift(SUNDAY, 1)],
      weeksEnding: shift(SUNDAY, 13),
      today: shift(SUNDAY, 1),
      weeks: 3,
    });
    expect(m.weeks.map((w) => w.count)).toEqual([1, 0, 0]);
    expect(m.after).toBe(2);
    expect(m.total).toBe(1);
    expect(m.weeks.map((w) => w.partial)).toEqual([false, true, false]);
    expect(m.weeks[1].daysSoFar).toBe(2);
    expect(daysSoFarLabel(m.weeks[1])).toBe('2 days so far');
    expect(m.weeks[2].daysSoFar).toBe(0);
    expect(m.weeks[2].days.every((d) => d === 'ahead')).toBe(true);
    expect(daysSoFarLabel(m.weeks[2])).toBeNull();
    expect(m.weeks.filter((w) => w.partial)).toHaveLength(1);
  });

  it('B4: days before the record began are neither hollow nor in the denominator', () => {
    const m = weeklyBuckets({
      episodeDays: [shift(SUNDAY, -1)],
      loggedDays: [shift(SUNDAY, -2), shift(SUNDAY, -1)],
      weeksEnding: shift(SUNDAY, -1),
      today: shift(SUNDAY, 30),
      weeks: 2,
      recordStart: shift(SUNDAY, -2),
    });
    expect(m.weeks[0].days.every((d) => d === 'before_record')).toBe(true);
    expect(m.weeks[0].daysSoFar).toBe(0);
    expect(m.weeks[0].loggedCount).toBe(0);
    expect(m.weeks[0].partial).toBe(false);
    expect(m.weeks[1].days).toEqual(['before_record', 'before_record', 'before_record', 'before_record', 'before_record', 'logged', 'logged']);
    expect(m.weeks[1].daysSoFar).toBe(2);
    expect(m.weeks[1].loggedCount).toBe(2);
    // The count is untouched by the record's start: an episode is a fact wherever it falls.
    expect(m.weeks[1].count).toBe(1);
  });

  it('B10: a non-finite week count is refused by name, not a bare RangeError', () => {
    expect(() => weeklyBuckets({ episodeDays: [], loggedDays: [], weeksEnding: SUNDAY, today: SUNDAY, weeks: Number.NaN })).toThrow(/weeks must be a finite number/);
    expect(() => weeklyBuckets({ episodeDays: [], loggedDays: [], weeksEnding: SUNDAY, today: SUNDAY, weeks: Infinity })).toThrow(/weeks must be a finite number/);
  });

  it('discloses episodes before the first week and after the last, never dropping them silently', () => {
    const m = weeklyBuckets({
      ...base,
      episodeDays: [shift(SUNDAY, -40), shift(SUNDAY, 20), shift(SUNDAY, -1)],
      loggedDays: [],
    });
    expect(m.total).toBe(1);
    expect(m.before).toBe(1);
    expect(m.after).toBe(1);
  });

  it('max is at least 1 so a chart of zeros still has a scale', () => {
    const m = weeklyBuckets({ ...base, episodeDays: [], loggedDays: [] });
    expect(m.max).toBe(1);
  });

  it('property: the bars sum to the total, and total + before + after is every episode (random records)', () => {
    const rnd = lcg(20260920);
    for (let trial = 0; trial < 200; trial++) {
      const weeks = 1 + Math.floor(rnd() * 12);
      const n = Math.floor(rnd() * 60);
      const episodeDays = Array.from({ length: n }, () => shift(SUNDAY, Math.floor(rnd() * 200) - 120));
      const loggedDays = Array.from({ length: Math.floor(rnd() * 80) }, () => shift(SUNDAY, Math.floor(rnd() * 200) - 120));
      const weeksEnding = shift(SUNDAY, Math.floor(rnd() * 14) - 7);
      const m = weeklyBuckets({ episodeDays, loggedDays, weeksEnding, today: weeksEnding, weeks });
      const sum = m.weeks.reduce((a, w) => a + w.count, 0);
      expect(sum).toBe(m.total);
      expect(m.total + m.before + m.after).toBe(n);
      expect(m.weeks).toHaveLength(weeks);
      for (const w of m.weeks) {
        expect(weekdayOfIndex(idx(w.startKey))).toBe(0);
        expect(idx(w.endKey) - idx(w.startKey)).toBe(6);
        expect(w.days).toHaveLength(7);
        expect(w.daysSoFar).toBe(w.days.filter((d) => d !== 'ahead').length);
        expect(w.loggedCount).toBe(w.days.filter((d) => d === 'logged').length);
        expect(w.partial).toBe(w.daysSoFar < 7);
      }
      // Consecutive weeks tile the window with no gap and no overlap.
      for (let i = 1; i < m.weeks.length; i++) {
        expect(idx(m.weeks[i].startKey) - idx(m.weeks[i - 1].startKey)).toBe(7);
      }
    }
  });

  it('C-29: a key from local components follows the runner zone, and the week follows the key', () => {
    // 2026-09-20T09:30:00Z is Sunday Sep 20 in UTC, still Saturday Sep 19 in Honolulu,
    // and already Sunday in Kiritimati. The caller keys it locally; the model must put
    // it in the week of THAT weekday. Expected is derived from the local getters, never
    // from a literal, so this assertion is true in every CI zone.
    const instant = new Date(Date.UTC(2026, 8, 20, 9, 30));
    const key = toLocalDayKey(instant);
    const localWeekday = instant.getDay();
    const m = weeklyBuckets({ episodeDays: [key], loggedDays: [key], weeksEnding: key, today: key, weeks: 2 });
    const last = m.weeks[1];
    expect(last.count).toBe(1);
    expect(last.days[localWeekday]).toBe('logged');
    expect(last.days.filter((d) => d === 'logged')).toHaveLength(1);
    expect(last.daysSoFar).toBe(localWeekday + 1);
    // And the two spellings of one instant disagree as text while agreeing as a day,
    // which is what makes the key (not the ISO string) the right input.
    expect(instant.toISOString().slice(0, 10) === key).toBe(instant.getUTCDate() === instant.getDate());
  });

  it('rejects a non-key day rather than guessing', () => {
    expect(() => weeklyBuckets({ episodeDays: ['2026-09-20T09:30:00Z'], loggedDays: [], weeksEnding: SUNDAY, today: SUNDAY, weeks: 1 })).toThrow(
      /day key/,
    );
  });
});

describe('compareWindows — two windows, the counts, the strips, no adjudication', () => {
  const before = {
    label: 'The 10 days before',
    startDay: shift(SUNDAY, -20),
    days: 10,
    episodeDays: [shift(SUNDAY, -20), shift(SUNDAY, -15), shift(SUNDAY, -11)],
    loggedDays: [shift(SUNDAY, -20), shift(SUNDAY, -19), shift(SUNDAY, -15), shift(SUNDAY, -11)],
  };
  const during = {
    label: "The trial's 10 days",
    startDay: shift(SUNDAY, -10),
    days: 10,
    episodeDays: [shift(SUNDAY, -9)],
    loggedDays: Array.from({ length: 10 }, (_, i) => shift(SUNDAY, -10 + i)),
  };

  it('one count per window, the M-day strip beneath, "logged N of M days"', () => {
    const m = compareWindows(before, during);
    expect(m.windows[0].count).toBe(3);
    expect(m.windows[1].count).toBe(1);
    expect(m.windows[0].strip).toHaveLength(10);
    expect(m.windows[0].strip.filter((d) => d === 'logged')).toHaveLength(4);
    expect(m.windows[0].coverageLine).toBe('logged 4 of 10 days');
    expect(m.windows[1].coverageLine).toBe('logged 10 of 10 days');
    expect(m.max).toBe(3);
  });

  it('a window with zero episodes renders a zero, not nothing', () => {
    const m = compareWindows(before, { ...during, episodeDays: [] });
    expect(m.windows[1].count).toBe(0);
    expect(typeof m.windows[1].count).toBe('number');
  });

  it('the window boundary is half-open: day M is outside, day 0 inside', () => {
    const m = compareWindows(
      { ...before, episodeDays: [shift(SUNDAY, -20), shift(SUNDAY, -10)] },
      during,
    );
    expect(m.windows[0].count).toBe(1);
    expect(m.windows[0].outside).toBe(1);
  });

  it('carries no adjudicating word in anything it produces', () => {
    const m = compareWindows(before, during);
    const text = JSON.stringify(m).toLowerCase();
    for (const word of ['fair', 'better', 'worse', 'improv', 'only', 'just', 'good', 'bad']) {
      expect(text).not.toContain(word);
    }
  });

  it('B8: overlapping windows are refused — an episode would be counted in both', () => {
    expect(() => compareWindows(before, { ...during, startDay: shift(SUNDAY, -15) })).toThrow(/overlap by 5 days/);
    // Adjacent windows (end == start) are fine: the boundary is half-open.
    expect(() => compareWindows(before, { ...during, startDay: shift(SUNDAY, -10) })).not.toThrow();
  });

  it('B4: window days before the record began are on the strip as such, out of the count, and said', () => {
    const m = compareWindows({ ...before, recordStart: shift(SUNDAY, -17) }, during);
    expect(m.windows[0].strip.slice(0, 3).every((d) => d === 'before_record')).toBe(true);
    expect(m.windows[0].beforeRecord).toBe(3);
    // Sep 6 was logged but predates the record start → not a logged day here.
    expect(m.windows[0].loggedCount).toBe(2);
    expect(m.windows[0].coverageLine).toBe('logged 2 of 10 days · 3 before the record began');
  });

  it('B10: a non-finite window length is refused by name', () => {
    expect(() => compareWindows({ ...before, days: Number.NaN }, during)).toThrow(/days must be a finite number/);
  });

  it('a day logged in one window and not the other shows on each strip independently', () => {
    const m = compareWindows({ ...before, loggedDays: [] }, during);
    expect(m.windows[0].loggedCount).toBe(0);
    expect(m.windows[0].strip.every((d) => d === 'unlogged')).toBe(true);
    expect(m.windows[1].loggedCount).toBe(10);
  });
});

describe('laneDots — the shipped panel\'s geometry, per lane', () => {
  it('positions equal patternsTimingPos for the same minutes, ascending', () => {
    const minutes = [240, 8, 95, 14, 420, 26];
    const lane = laneDots(laneOf('In the trial', minutes, 6));
    const sorted = [...minutes].sort((a, b) => a - b);
    expect(lane.dots.map((d) => d.minutes)).toEqual(sorted);
    expect(lane.dots.map((d) => d.pos)).toEqual(sorted.map((m) => patternsTimingPos(m)));
    expect(lane.dots.map((d) => d.jitterRow)).toEqual(assignJitterRows(sorted.map((m) => patternsTimingPos(m))));
  });

  it('the three bucket counts partition the timed episodes via classifyGapMinutes', () => {
    const minutes = [5, 30, 31, 200, 359, 360, 480, 900];
    const lane = laneDots(laneOf('x', minutes, 8));
    const expected: [number, number, number] = [0, 0, 0];
    for (const m of minutes) {
      const b = classifyGapMinutes(m, DEFAULT_MEAL_TIMING_CONFIG);
      expected[b === 'rapid' ? 0 : b === 'mid' ? 1 : 2] += 1;
    }
    expect(lane.bucketCounts).toEqual(expected);
    expect(lane.bucketCounts[0] + lane.bucketCounts[1] + lane.bucketCounts[2]).toBe(lane.timedCount);
  });

  it('"N timed of M" and the untimed count come from the same two numbers', () => {
    const lane = laneDots(laneOf('Before the trial', Array(13).fill(20), 19));
    expect(lane.timedLine).toBe('13 timed of 19');
    expect(lane.untimedCount).toBe(6);
  });

  it('Dr. Chen: seven of seven in-trial under 30 minutes with fourteen untimed still says fourteen are missing', () => {
    const lane = laneDots(laneOf('In the trial', [3, 5, 9, 12, 16, 21, 24], 21));
    expect(lane.bucketCounts).toEqual([7, 0, 0]);
    expect(lane.timedLine).toBe('7 timed of 21');
    expect(lane.untimedCount).toBe(14);
    const before = laneDots(laneOf('Before the trial', [8, 14, 19, 22, 26, 29, 45, 70, 95, 130, 180, 240, 420], 19));
    expect(lanesUntimedLine([before, lane])).toBe("6 + 14 episodes couldn't be timed against a meal — they aren't on the lanes.");
  });

  it('the denominator is the array\'s own length: a caller cannot hand over only the timed episodes', () => {
    // One entry per episode, null where it could not be timed — "3 timed of 3" needs
    // three non-null entries and nothing else, so under-counting the untimed means
    // omitting rows, never a smaller second number (the adversarial pass, B5).
    const lane = laneDots({ label: 'x', episodeMinutes: [1, 2, 3] });
    expect(lane.total).toBe(3);
    expect(lane.untimedCount).toBe(0);
    const honest = laneDots({ label: 'x', episodeMinutes: [1, null, 2, null, null, 3] });
    expect(honest.total).toBe(6);
    expect(honest.timedCount).toBe(3);
    expect(honest.untimedCount).toBe(3);
  });

  it('a negative minute is an impossible value and is UNTIMED, never a dot at 0 in the rapid bucket (B11)', () => {
    const lane = laneDots({ label: 'x', episodeMinutes: [-90, 12] });
    expect(lane.dots).toHaveLength(1);
    expect(lane.dots[0].minutes).toBe(12);
    expect(lane.bucketCounts).toEqual([1, 0, 0]);
    expect(lane.untimedCount).toBe(1);
    expect(lane.total).toBe(2);
  });

  it('a minute past the axis pins to the lane end and keeps its true band and value', () => {
    const lane = laneDots({ label: 'x', episodeMinutes: [1439] });
    expect(lane.dots[0].pos).toBe(1);
    expect(lane.dots[0].band).toBe('long');
    expect(lane.dots[0].minutes).toBe(1439);
  });

  it('the untimed line is always a string — at zero it says so', () => {
    const a = laneDots(laneOf('a', [10], 1));
    expect(lanesUntimedLine([a])).toBe('Every episode could be timed against a meal.');
    expect(lanesUntimedLine([a, a])).toBe('Every episode on both lanes could be timed against a meal.');
    const one = laneDots(laneOf('b', [], 1));
    expect(lanesUntimedLine([one])).toBe("1 episode couldn't be timed against a meal — it isn't on the lane.");
    // Two lanes summing to one: the verb follows the sum (B14).
    expect(lanesUntimedLine([a, one])).toBe("0 + 1 episode couldn't be timed against a meal — it isn't on the lanes.");
  });

  it('the axis is the shipped one, with the band edges at the config boundaries', () => {
    const ax = timingLanesAxis();
    expect(ax.axis).toEqual(patternsTimingAxis());
    expect(ax.axis.map((t) => t.label)).toEqual(['ate', '30m', '1h', '2h', '4h', '8h+']);
    expect(ax.rapidBandEnd).toBe(patternsTimingPos(30));
    expect(ax.longBandStart).toBe(patternsTimingPos(360));
  });

  it('drops a non-finite minute rather than plotting NaN', () => {
    const lane = laneDots(laneOf('x', [Number.NaN, 12], 2));
    expect(lane.dots).toHaveLength(1);
    expect(lane.untimedCount).toBe(1);
  });
});

describe('episodeDaysOf — one entry per EPISODE, through the engine\'s own collapse (B6)', () => {
  const keyOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  it('four rows of one bout twenty minutes apart are one episode day', () => {
    const t0 = Date.UTC(2026, 8, 18, 12, 0);
    const rows = [0, 20, 40, 60].map((m) => ({ ms: t0 + m * 60_000 }));
    expect(episodeDaysOf(rows, keyOf)).toEqual(['2026-09-18']);
  });
  it('two bouts past the gap are two, and a non-finite instant is dropped', () => {
    const t0 = Date.UTC(2026, 8, 18, 12, 0);
    const rows = [{ ms: t0 }, { ms: t0 + 4 * 3_600_000 }, { ms: Number.NaN }];
    expect(episodeDaysOf(rows, keyOf)).toEqual(['2026-09-18', '2026-09-18']);
  });
});

describe('weightBand — dots by date on a fixed ±10 % band', () => {
  const r = (value: number, iso: string) => ({ value, occurredAt: iso });

  it('x is by DATE, not index: uneven dates give unequal spacing', () => {
    const m = weightBand([r(4.6, '2026-07-03T08:00:00Z'), r(4.6, '2026-07-04T08:00:00Z'), r(4.4, '2026-09-12T08:00:00Z')]);
    expect(m.state).toBe('chart');
    const [a, b, c] = m.points.map((p) => p.x);
    expect(a).toBe(0);
    expect(c).toBe(1);
    expect(b - a).toBeLessThan(c - b);
    expect(b).toBeCloseTo(1 / 71, 6);
  });

  it('the band is fixed on the FIRST reading and never moves with later ones', () => {
    const m = weightBand([r(4.6, '2026-07-03T08:00:00Z'), r(3.0, '2026-08-03T08:00:00Z')]);
    expect(m.band).toEqual({ ref: 4.6, lo: 4.6 * (1 - WEIGHT_BAND_FRAC), hi: 4.6 * (1 + WEIGHT_BAND_FRAC) });
    expect(m.points[1].clipped).toBe(true);
    expect(m.points[1].y).toBe(0);
    expect(m.points[1].value).toBe(3.0); // the number still prints; only the dot is at the edge
  });

  it('n = 1 → the number; n = 2 → the pair; n = 0 → empty', () => {
    expect(weightBand([]).state).toBe('empty');
    const one = weightBand([r(4.6, '2026-09-12T08:00:00Z')]);
    expect(one.state).toBe('number');
    expect(one.delta).toBeNull();
    expect(one.points[0].x).toBe(0.5);
    const two = weightBand([r(4.6, '2026-08-26T08:00:00Z'), r(4.5, '2026-09-12T08:00:00Z')]);
    expect(two.state).toBe('pair');
    expect(two.delta).toBeCloseTo(-0.1, 9);
    expect(two.deltaFrac).toBeCloseTo(-0.1 / 4.6, 9);
    expect(two.spanDays).toBe(17);
  });

  it('sorts by parsed instant, so two ISO spellings of one instant do not reorder (C-40)', () => {
    const m = weightBand([r(4.5, '2026-09-12T08:00:00+00:00'), r(4.6, '2026-08-26T08:00:00.000Z')]);
    expect(m.points.map((p) => p.value)).toEqual([4.6, 4.5]);
    expect(m.first?.value).toBe(4.6);
  });

  it('y is the reading\'s place in the band: the first reading sits at the centre', () => {
    const m = weightBand([r(5, '2026-07-03T08:00:00Z'), r(5.25, '2026-07-10T08:00:00Z')]);
    expect(m.points[0].y).toBeCloseTo(0.5, 9);
    expect(m.points[1].y).toBeCloseTo(0.75, 9);
    expect(m.points[1].clipped).toBe(false);
  });

  it('drops an unparseable date rather than plotting it at NaN', () => {
    const m = weightBand([r(4.6, 'not a date'), r(4.5, '2026-09-12T08:00:00Z')]);
    expect(m.state).toBe('number');
  });

  it('B2: two readings at one instant order the same whatever the caller\'s array order — the delta cannot flip sign', () => {
    const a = [r(4.6, '2026-07-01T08:00:00Z'), r(3.9, '2026-07-01T08:00:00Z'), r(4.2, '2026-09-01T08:00:00Z')];
    const b = [a[1], a[0], a[2]];
    const ma = weightBand(a);
    const mb = weightBand(b);
    expect(ma.band).toEqual(mb.band);
    expect(ma.delta).toBe(mb.delta);
    expect(ma.points.map((p) => p.value)).toEqual(mb.points.map((p) => p.value));
    expect(ma.points.map((p) => p.clipped)).toEqual(mb.points.map((p) => p.clipped));
    // The written-down tie-break: the smaller value first.
    expect(ma.first?.value).toBe(3.9);
  });

  it('B12: spanDays is ROUNDED and pinned — 20 hours is 1, 11 hours is 0', () => {
    expect(weightBand([r(5, '2026-07-01T00:00:00Z'), r(5, '2026-07-01T20:00:00Z')]).spanDays).toBe(1);
    expect(weightBand([r(5, '2026-07-01T00:00:00Z'), r(5, '2026-07-01T11:00:00Z')]).spanDays).toBe(0);
    expect(weightBand([r(5, '2026-08-26T08:00:00Z'), r(5, '2026-09-12T08:00:00Z')]).spanDays).toBe(17);
  });

  it('B13: a zero first reading yields no fraction (defence in depth — the write path forbids it)', () => {
    const m = weightBand([r(0, '2026-07-01T08:00:00Z'), r(4.5, '2026-09-01T08:00:00Z')]);
    expect(m.deltaFrac).toBeNull();
    expect(m.delta).toBe(4.5);
  });
});
