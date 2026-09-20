// The chart family's MODELS (Design v2 — the whole day, D2-1 · CUL-1064).
//
// Design authority: `docs/culprit-design-v4-mockups.html` §03 (the Signal's screen), §04
// (the month, the weight) and §05 — the standard as a table, which is this module's
// acceptance criteria. Every chart the redesign draws answers the five columns at once:
// a mark per fact · a count on every mark · the denominator in view · the uncounted
// disclosed · the window named. The shipped "Vomiting, timed from meals" lane
// (`lib/patternsTiming.ts` + `components/dashboard/TimingDistribution.tsx`) is the bar,
// and the PM ruled that bar the standard ("ensure that all data vis brings this level of
// information").
//
// ── WHY ONE MODULE ───────────────────────────────────────────────────────────
// The Home card, the Signal's own screen and the month all draw weekly bars over the same
// record. Three renderers deriving three week grids is the diet-trial §5.3 drift written
// in advance (CLAUDE.md C-4: two counts over one population partition it), so the grid,
// the coverage states and the count are computed HERE and the components only draw.
// Nothing here reads the database, the clock, or a store: every input is a value the
// caller already holds, so a fixture in a test is the same shape production hands over
// (C-35).
//
// ── DAY KEYS, NOT INSTANTS (C-29) ────────────────────────────────────────────
// Every day-scoped input is a LOCAL day key (`YYYY-MM-DD`, the app's one day key —
// `toLocalDayKey`, `looks.local_day`). A key is already a calendar day, so it is indexed
// zone-independently (`localDayIndexOf`'s key branch) and the weekday is arithmetic on
// that index. The caller's key is the ONLY zone decision in the pipeline; this module
// cannot shift a day across midnight because it never sees an instant. The one exception
// is `weightBand`, whose x axis is by DATE and takes ISO instants — parsed to ms on both
// sides (C-40), never compared as text.
//
// ── COVERAGE IS NEVER GATED ON THE THING COUNTED (C-3) ───────────────────────
// `loggedDays` and `episodeDays` are separate inputs. A week's seven ticks come from the
// first; its count comes from the second; the model never infers "logged" from "had an
// episode", and never infers "unlogged" from "no episode". A week with two episodes on
// three logged days must READ thin — that is the ticks' whole job.

import { dayKeyFromIndex, localDayIndexOf } from './utils';
import {
  assignJitterRows,
  patternsTimingAxis,
  patternsTimingPos,
  type TimingAxisTick,
} from './patternsTiming';
import {
  classifyGapMinutes,
  DEFAULT_MEAL_TIMING_CONFIG,
  type MealTimingConfig,
  type TimingBand,
} from './mealTiming';

// ── Day-key arithmetic ────────────────────────────────────────────────────────

/** Epoch-day index 0 (1970-01-01) was a Thursday; Sunday is weekday 0. */
const EPOCH_DAY_WEEKDAY = 4;

/** Sunday-start weekday (0 = Sunday … 6 = Saturday) of an epoch-day index. */
export function weekdayOfIndex(index: number): number {
  return (((index + EPOCH_DAY_WEEKDAY) % 7) + 7) % 7;
}

/** The epoch-day index of the Sunday on or before `index`. */
export function weekStartIndex(index: number): number {
  return index - weekdayOfIndex(index);
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** A day key's epoch-day index. The SHAPE is checked here, before `localDayIndexOf`,
 *  because that helper also accepts an instant and indexes it by the device clock — the
 *  one path by which a zone could reach this module. An instant is a caller bug and is
 *  refused, never bucketed. */
function indexOfKey(key: string, what: string): number {
  const i = DAY_KEY.test(key) ? localDayIndexOf(key) : null;
  if (i == null) throw new Error(`chartModels: ${what} is not a YYYY-MM-DD day key: ${key}`);
  return i;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}

// ── Weekly bars ───────────────────────────────────────────────────────────────

/** One of a week's seven days: logged (a filled tick), unlogged (a hollow tick), or
 *  not yet arrived (no tick — the partial week's remainder). */
export type DayCoverage = 'logged' | 'unlogged' | 'ahead';

export interface WeekBucket {
  /** The week's Sunday, as a day key. */
  startKey: string;
  /** The week's Saturday, as a day key. */
  endKey: string;
  /** Episodes whose day fell in this week. Always a number — a zero is a fact. */
  count: number;
  /** Sunday → Saturday. */
  days: [DayCoverage, DayCoverage, DayCoverage, DayCoverage, DayCoverage, DayCoverage, DayCoverage];
  /** Some of the week's days have not arrived. */
  partial: boolean;
  /** Days that HAVE arrived (1–7). On a full week, 7. */
  daysSoFar: number;
  /** Logged days among those that have arrived. */
  loggedCount: number;
}

export interface WeeklyMark {
  /** The mark's position in week slots — `weekIndex + weekday / 7`, so a Saturday mark
   *  sits at the right edge of its week's slot and a Sunday at its left. */
  slot: number;
  /** The mark's own words ("trial · Jul 25"). */
  label: string;
  /** The day key it stands on. */
  day: string;
}

export interface WeeklyBucketsInput {
  /** One entry PER EPISODE (a day with two episodes appears twice). */
  episodeDays: readonly string[];
  /** The days with any logging at all — the coverage denominator. Duplicates are fine. */
  loggedDays: readonly string[];
  /** The last week drawn is the one containing this day. */
  weeksEnding: string;
  /** Days after this one are `ahead`. Usually `weeksEnding`; separate so a chart can be
   *  drawn for a past month (every day arrived) without pretending today moved. */
  today: string;
  /** How many weeks to draw, ending with `weeksEnding`'s week. */
  weeks: number;
  /** An optional dated mark (a trial's start). Outside the drawn weeks → `mark: null`. */
  mark?: { day: string; label: string };
}

export interface WeeklyBucketsModel {
  weeks: WeekBucket[];
  /** The sum of every bar. */
  total: number;
  /** Episodes BEFORE the first drawn week — disclosed, never silently dropped. */
  before: number;
  /** Episodes AFTER the last drawn week (a future-dated row). Disclosed likewise. */
  after: number;
  /** The tallest bar, for the renderer's scale (≥ 1 so a chart of zeros still has a scale). */
  max: number;
  mark: WeeklyMark | null;
  /** The first drawn week's Sunday and the last one's — the window, named. */
  firstKey: string;
  lastKey: string;
}

/**
 * Sunday-start weekly buckets ending with the week that holds `weeksEnding`.
 *
 * The seven ticks under a bar are the week's days in coverage terms; the bar is the
 * week's episode count; the two come from different inputs and never from each other.
 * A day after `today` is `ahead` (no tick, not "unlogged": a day that has not happened
 * is not a day nobody logged), and a week holding any such day is `partial`, with the
 * days that HAVE arrived counted for its "N days so far".
 */
export function weeklyBuckets(input: WeeklyBucketsInput): WeeklyBucketsModel {
  const weeks = Math.max(1, Math.floor(input.weeks));
  const endIdx = indexOfKey(input.weeksEnding, 'weeksEnding');
  const todayIdx = indexOfKey(input.today, 'today');
  const lastStart = weekStartIndex(endIdx);
  const firstStart = lastStart - 7 * (weeks - 1);

  const loggedSet = new Set<number>();
  for (const key of input.loggedDays) loggedSet.add(indexOfKey(key, 'loggedDays[]'));

  const counts = new Array<number>(weeks).fill(0);
  let before = 0;
  let after = 0;
  for (const key of input.episodeDays) {
    const idx = indexOfKey(key, 'episodeDays[]');
    const w = Math.floor((idx - firstStart) / 7);
    if (w < 0) before += 1;
    else if (w >= weeks) after += 1;
    else counts[w] += 1;
  }

  const out: WeekBucket[] = [];
  for (let w = 0; w < weeks; w++) {
    const start = firstStart + 7 * w;
    const days: DayCoverage[] = [];
    let daysSoFar = 0;
    let loggedCount = 0;
    for (let d = 0; d < 7; d++) {
      const idx = start + d;
      if (idx > todayIdx) {
        days.push('ahead');
        continue;
      }
      daysSoFar += 1;
      if (loggedSet.has(idx)) {
        days.push('logged');
        loggedCount += 1;
      } else {
        days.push('unlogged');
      }
    }
    out.push({
      startKey: dayKeyFromIndex(start),
      endKey: dayKeyFromIndex(start + 6),
      count: counts[w],
      days: days as WeekBucket['days'],
      partial: daysSoFar < 7,
      daysSoFar,
      loggedCount,
    });
  }

  let mark: WeeklyMark | null = null;
  if (input.mark) {
    const idx = indexOfKey(input.mark.day, 'mark.day');
    const slot = (idx - firstStart) / 7;
    if (slot >= 0 && slot < weeks) mark = { slot, label: input.mark.label, day: input.mark.day };
  }

  const total = counts.reduce((a, b) => a + b, 0);
  return {
    weeks: out,
    total,
    before,
    after,
    max: Math.max(1, ...counts),
    mark,
    firstKey: dayKeyFromIndex(firstStart),
    lastKey: dayKeyFromIndex(lastStart + 6),
  };
}

/** "5 days so far" — the partial week's own words (§05: the uncounted disclosed). */
export function daysSoFarLabel(week: WeekBucket): string | null {
  if (!week.partial) return null;
  return `${week.daysSoFar} ${plural(week.daysSoFar, 'day')} so far`;
}

// ── The compare ───────────────────────────────────────────────────────────────

export type StripDay = 'logged' | 'unlogged';

export interface CompareWindowInput {
  /** The window's name, as the reader meets it ("The 55 days before", "The trial's 55 days"). */
  label: string;
  /** The window's first day. The window is `[startDay, startDay + days)`. */
  startDay: string;
  /** The window's length in days — the M in "logged N of M days". */
  days: number;
  /** One entry PER EPISODE. */
  episodeDays: readonly string[];
  loggedDays: readonly string[];
}

export interface CompareWindow {
  label: string;
  days: number;
  /** Episodes inside the window. A zero is rendered as a zero. */
  count: number;
  loggedCount: number;
  /** The window's days in order, filled or hollow. */
  strip: StripDay[];
  /** "logged 44 of 55 days" — coverage stated, never judged. */
  coverageLine: string;
  /** Episodes that fell outside the window's `days` — for the caller's disclosure. */
  outside: number;
}

export interface CompareWindowsModel {
  windows: [CompareWindow, CompareWindow];
  /** The taller count, for the renderer's scale (≥ 1). */
  max: number;
}

function compareWindow(input: CompareWindowInput): CompareWindow {
  const days = Math.max(0, Math.floor(input.days));
  const start = indexOfKey(input.startDay, 'startDay');
  const loggedSet = new Set<number>();
  for (const key of input.loggedDays) loggedSet.add(indexOfKey(key, 'loggedDays[]'));
  let count = 0;
  let outside = 0;
  for (const key of input.episodeDays) {
    const idx = indexOfKey(key, 'episodeDays[]');
    if (idx >= start && idx < start + days) count += 1;
    else outside += 1;
  }
  const strip: StripDay[] = [];
  let loggedCount = 0;
  for (let d = 0; d < days; d++) {
    const logged = loggedSet.has(start + d);
    strip.push(logged ? 'logged' : 'unlogged');
    if (logged) loggedCount += 1;
  }
  return {
    label: input.label,
    days,
    count,
    loggedCount,
    strip,
    coverageLine: `logged ${loggedCount} of ${days} ${plural(days, 'day')}`,
    outside,
  };
}

/**
 * Two windows, each with its count and its own coverage strip. The model carries no
 * word about whether the two are comparable — that is the reader's call from the strips,
 * and the §05 table lists "fairly" as exactly the word round 3 got wrong.
 */
export function compareWindows(before: CompareWindowInput, during: CompareWindowInput): CompareWindowsModel {
  const a = compareWindow(before);
  const b = compareWindow(during);
  return { windows: [a, b], max: Math.max(1, a.count, b.count) };
}

// ── The timing lanes ──────────────────────────────────────────────────────────

export interface LaneDot {
  /** Lane fraction 0..1 — `patternsTimingPos`, the shipped panel's, never re-derived. */
  pos: number;
  /** Signed jitter row (0 centred) — `assignJitterRows`, the shipped panel's. */
  jitterRow: number;
  band: TimingBand;
  /** The true minutes, kept so a label can print the number the dot stands for. */
  minutes: number;
}

export interface LaneInput {
  /** The lane's window, named ("Before the trial", "In the trial"). */
  label: string;
  /** Minutes-since-eating for every episode that COULD be timed. */
  timedMinutes: readonly number[];
  /** Every episode in the window, timed or not — the denominator. */
  total: number;
}

export interface LaneModel {
  label: string;
  /** Ascending by position. */
  dots: LaneDot[];
  /** rapid · mid · long — the three counts under the lane, in that order. */
  bucketCounts: [number, number, number];
  timedCount: number;
  total: number;
  /** `total − timed`, floored at zero. Rendered by the component unconditionally. */
  untimedCount: number;
  /** "13 timed of 19". */
  timedLine: string;
}

export interface LaneAxis {
  axis: TimingAxisTick[];
  /** The shaded head's right edge and the shaded tail's left edge, as lane fractions. */
  rapidBandEnd: number;
  longBandStart: number;
  config: MealTimingConfig;
}

/** The axis the lanes share. One call per chart, never per lane. */
export function timingLanesAxis(config: MealTimingConfig = DEFAULT_MEAL_TIMING_CONFIG): LaneAxis {
  return {
    axis: patternsTimingAxis(config),
    rapidBandEnd: patternsTimingPos(config.rapidWindowMinutes, config),
    longBandStart: patternsTimingPos(config.longGapHours * 60, config),
    config,
  };
}

/**
 * One lane's dots and counts. A `total` below the timed count is a caller error and is
 * raised to the timed count rather than printing a negative disclosure.
 */
export function laneDots(input: LaneInput, config: MealTimingConfig = DEFAULT_MEAL_TIMING_CONFIG): LaneModel {
  const minutes = input.timedMinutes
    .filter((m) => Number.isFinite(m))
    .map((m) => Math.max(0, m))
    .sort((a, b) => a - b);
  const positions = minutes.map((m) => patternsTimingPos(m, config));
  const rows = assignJitterRows(positions);
  const bucketCounts: [number, number, number] = [0, 0, 0];
  const dots: LaneDot[] = minutes.map((m, i) => {
    const band = classifyGapMinutes(m, config);
    bucketCounts[band === 'rapid' ? 0 : band === 'mid' ? 1 : 2] += 1;
    return { pos: positions[i], jitterRow: rows[i], band, minutes: m };
  });
  const timedCount = dots.length;
  const total = Math.max(Math.floor(input.total), timedCount);
  return {
    label: input.label,
    dots,
    bucketCounts,
    timedCount,
    total,
    untimedCount: total - timedCount,
    timedLine: `${timedCount} timed of ${total}`,
  };
}

/**
 * The untimed line for a SET of lanes — "6 + 14 episodes couldn't be timed against a
 * meal — they aren't on the lanes." One line for the chart, the per-lane counts joined
 * with `+`, so a reader sees which lane is missing what. Always a string: at zero it
 * says so, because "nothing to disclose" is itself a disclosure.
 */
export function lanesUntimedLine(lanes: readonly LaneModel[]): string {
  const counts = lanes.map((l) => l.untimedCount);
  const sum = counts.reduce((a, b) => a + b, 0);
  if (sum === 0) {
    return lanes.length > 1
      ? 'Every episode on both lanes could be timed against a meal.'
      : 'Every episode could be timed against a meal.';
  }
  const joined = lanes.length > 1 ? counts.join(' + ') : String(sum);
  const noun = plural(sum, 'episode');
  const verb = lanes.length > 1 ? "they aren't on the lanes" : sum === 1 ? "it isn't on the lane" : "they aren't on the lane";
  return `${joined} ${noun} couldn't be timed against a meal — ${verb}.`;
}

// ── Weight, dots by date ──────────────────────────────────────────────────────

/** The band is ±this fraction of the FIRST reading, and it never moves. */
export const WEIGHT_BAND_FRAC = 0.1;

export interface WeightBandReading {
  value: number;
  /** ISO instant (the parent event's `occurred_at`). The value is in whatever unit the
   *  caller displays (the app shows lbs over a kg column); the band is a ratio. */
  occurredAt: string;
}

export interface WeightPoint {
  /** 0..1 by DATE across the readings' span — not by index. */
  x: number;
  /** 0..1 within the band (0 = −10 %, 1 = +10 %), clamped. */
  y: number;
  value: number;
  occurredAt: string;
  ms: number;
  /** The reading lies outside the band and was drawn at its edge; the number still prints. */
  clipped: boolean;
}

/** `empty` nothing to draw · `number` one reading is a number and its date · `pair` two
 *  readings on the band · `chart` three or more. */
export type WeightBandState = 'empty' | 'number' | 'pair' | 'chart';

export interface WeightBandModel {
  state: WeightBandState;
  /** Ascending by date. */
  points: WeightPoint[];
  /** The band around the first reading; null when empty. */
  band: { ref: number; lo: number; hi: number } | null;
  first: WeightPoint | null;
  last: WeightPoint | null;
  /** last − first, in the caller's unit, or null below two readings. The caller SPEAKS the delta. */
  deltaKg: number | null;
  /** last − first as a fraction of the first reading, or null below two readings. */
  deltaFrac: number | null;
  /** Whole days between the first and last reading, or null below two. */
  spanDays: number | null;
}

/**
 * Dots by date on a fixed ±10 % band around the first reading. Readings are sorted by
 * instant (parsed, C-40). With a zero-width span (every reading at one instant) every
 * point sits at x = 0.5 rather than dividing by zero.
 */
export function weightBand(readings: readonly WeightBandReading[]): WeightBandModel {
  const parsed = readings
    .map((r) => ({ ...r, ms: Date.parse(r.occurredAt) }))
    .filter((r) => Number.isFinite(r.ms) && Number.isFinite(r.value))
    .sort((a, b) => a.ms - b.ms);
  if (parsed.length === 0) {
    return { state: 'empty', points: [], band: null, first: null, last: null, deltaKg: null, deltaFrac: null, spanDays: null };
  }
  const ref = parsed[0].value;
  const lo = ref * (1 - WEIGHT_BAND_FRAC);
  const hi = ref * (1 + WEIGHT_BAND_FRAC);
  const t0 = parsed[0].ms;
  const span = parsed[parsed.length - 1].ms - t0;
  const points: WeightPoint[] = parsed.map((r) => {
    const rawY = hi === lo ? 0.5 : (r.value - lo) / (hi - lo);
    const y = Math.max(0, Math.min(1, rawY));
    return {
      x: span > 0 ? (r.ms - t0) / span : 0.5,
      y,
      value: r.value,
      occurredAt: r.occurredAt,
      ms: r.ms,
      clipped: rawY !== y,
    };
  });
  const first = points[0];
  const last = points[points.length - 1];
  const n = points.length;
  const state: WeightBandState = n === 1 ? 'number' : n === 2 ? 'pair' : 'chart';
  return {
    state,
    points,
    band: { ref, lo, hi },
    first,
    last,
    deltaKg: n >= 2 ? last.value - first.value : null,
    deltaFrac: n >= 2 && ref !== 0 ? (last.value - first.value) / ref : null,
    spanDays: n >= 2 ? Math.round(span / 86_400_000) : null,
  };
}
