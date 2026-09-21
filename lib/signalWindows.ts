// The Signal's ONE window predicate (Design v2 — the whole day, D2-3 · CUL-1065;
// design authority `docs/culprit-design-v4-mockups.html` §01 / §03 / §06).
//
// Round 3 drew the card's bars over one set of weeks and its line over another, and the
// data read caught it: "the card's bars and its line read two different windows". So the
// weeks the card's bars draw, the numbers its line states, the two windows the screen
// compares and the lanes the screen lays are all derived HERE, from one `today` and one
// finding, and the components only draw what they are handed. Adding the bars yields the
// line's numbers by construction (C-4: two counts over one population partition it), and
// the property test in `signalWindows.test.ts` says so over random records.
//
// DAY KEYS, NEVER INSTANTS (C-29, D2-1's contract). Every input here is a local day key
// (`YYYY-MM-DD`); a caller with instants goes through `episodeDaysOf` first, which is also
// where a re-logged bout collapses to one episode. This module never reads a clock, a
// store or the database.
//
// THE WEEKS. Sunday-start weeks ending with the week that holds `today` — enough of them
// to cover the finding's own lookback (`windowDays`), and the running trial when it is
// longer, capped so a long overrun still draws a readable chart (the mark then says
// "before these weeks", C-37, never drops). The last bucket is "this week", the one before
// it "last week": the line reads those two buckets and nothing else.
//
// THE COMPARE. Two windows of EQUAL length that never overlap. On a running trial they are
// the trial's own days (day 1 through today — the day counter) and the same number of
// days immediately before it; without a trial, the two halves of the finding's lookback,
// ending today. No word about whether the two are comparable lives here or anywhere
// downstream — the strips under the bars carry the logged days, and the reader decides.
//
// THE LANES. The same two windows as the compare on a trial (before it · in it); one lane
// over the lookback otherwise. A lane takes one entry per episode with `null` where the
// episode could not be timed, so the untimed line is the array's own shape (D2-1's rule).

import {
  compareWindows,
  laneDots,
  timingLanesAxis,
  weeklyBuckets,
  weekStartIndex,
  type CompareWindowsModel,
  type LaneAxis,
  type LaneInput,
  type LaneModel,
  type WeeklyBucketsModel,
} from './chartModels';
import type { SignalFinding, SignalSymptomType } from './signal';
import { MIN_INTERPRETABLE_DAYS } from './dietTrial';
import { dayKeyFromIndex, localDayIndexOf } from './utils';

/** The engine's default lookback, for the finding types whose payload carries none
 *  (`food_symptom_correlation` reads the same 56-day window `symptom_chronicity` states). */
export const DEFAULT_WINDOW_DAYS = 56;
/** The most weeks the chart draws; a longer trial's mark is placed in words (C-37). */
export const MAX_WEEKS = 12;
/** The fewest: a two-week finding still gets "this week · last week". */
export const MIN_WEEKS = 2;
/**
 * The compare's floor on a trial: below this many days on the diet there is no
 * before-and-during compare and no two-lane split — a day-one trial drawing "1 day
 * before: 1 · the trial's 1 day: 0" is the n=1 picture the never-reassure invariant
 * forbids (adversarial pass, B1). MIRRORED from the diet-trial spec's own floor
 * (`MIN_INTERPRETABLE_DAYS`, `lib/dietTrial.ts`): same value, same question — "is the
 * trial old enough for a reading" (C-34).
 */
export const MIN_COMPARE_DAYS = MIN_INTERPRETABLE_DAYS;
/**
 * The longest compare window, each side: the chart's own cap in days. A 400-day trial
 * compared whole is two 400-day strips and dose dates a year apart with no year on them
 * (C-19); capped, the two windows together are under a year, so a year-less date inside
 * them is always the last twelve months' (adversarial pass, B7).
 */
export const MAX_COMPARE_DAYS = MAX_WEEKS * 7;

/** The running (or graced) trial, as the Signal's surfaces need it — a value the screen's
 *  loader builds from `loadTrialPredicateFacts` + `getDietTrialProgress`, never a store read. */
export interface SignalTrialWindow {
  /** The trial's first local day. */
  startDay: string;
  /** "Rabbit trial" / "Diet trial" — `trialIdentityLabel`. */
  identity: string;
  /** Day 1 is the start day (B-421); today is day `dayCounter`. */
  dayCounter: number;
  /** `target_duration_days` — the only authority on the trial's length. */
  targetDays: number;
  /** The trial diet's label, for the diet line; null when unnamed. */
  foodLabel: string | null;
}

/** One episode of the finding's symptom, keyed by its local day, with the minutes since
 *  the preceding logged meal where the engine could time it (`classifyEpisodeSet`) and
 *  `null` where it could not. */
export interface SignalEpisodeDay {
  dayKey: string;
  minutesSinceMeal: number | null;
}

/** The symptom a finding counts, or null for the types that count no symptom episodes. */
export function signalSymptomOf(finding: SignalFinding): SignalSymptomType | null {
  switch (finding.type) {
    case 'symptom_chronicity':
    case 'symptom_worsening':
    case 'reflection':
    case 'postprandial_timing':
    case 'empty_stomach_timing':
    case 'timing_story':
    case 'timeofday_clustering':
    case 'food_symptom_correlation':
      return finding.symptomType;
    case 'stood_down':
      return finding.symptomType;
    case 'trial_response':
      // The trial card counts vomiting (the lane's symptom) — `pooledTrialCount` is vomit.
      return 'vomit';
    default:
      return null;
  }
}

/** The finding's own lookback in days — the window its sentence counted over. */
export function signalWindowDays(finding: SignalFinding): number {
  switch (finding.type) {
    case 'symptom_chronicity':
    case 'symptom_worsening':
    case 'reflection':
    case 'postprandial_timing':
    case 'empty_stomach_timing':
    case 'timing_story':
    case 'timeofday_clustering':
    case 'incident_red_flag':
      return positiveOr(finding.windowDays, DEFAULT_WINDOW_DAYS);
    case 'trial_response':
      return positiveOr(finding.trialWindowDays, DEFAULT_WINDOW_DAYS);
    default:
      return DEFAULT_WINDOW_DAYS;
  }
}

function positiveOr(n: number | undefined, fallback: number): number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function indexOf(key: string, what: string): number {
  const i = /^\d{4}-\d{2}-\d{2}$/.test(key) ? localDayIndexOf(key) : null;
  if (i == null) throw new Error(`signalWindows: ${what} is not a YYYY-MM-DD day key: ${key}`);
  return i;
}

/**
 * The number of weeks the card and the screen draw for this finding on this day: every
 * Sunday-start week the lookback touches, through the week holding today — and the
 * running trial's first week when it began earlier. A 56-day lookback on a Thursday is
 * nine weeks (eight whole ones and the partial), the mock's own count; a longer run is
 * capped, and the mark then says so in words (C-37).
 */
export function signalWeekCount(finding: SignalFinding, today: string, trial: SignalTrialWindow | null): number {
  const todayIdx = indexOf(today, 'today');
  let earliest = todayIdx - signalWindowDays(finding) + 1;
  if (trial) earliest = Math.min(earliest, indexOf(trial.startDay, 'trial.startDay'));
  const weeks = (weekStartIndex(todayIdx) - weekStartIndex(earliest)) / 7 + 1;
  return Math.min(MAX_WEEKS, Math.max(MIN_WEEKS, weeks));
}

export interface SignalWeeksInput {
  finding: SignalFinding;
  /** The device's local day key for now — the caller's one zone decision. */
  today: string;
  trial: SignalTrialWindow | null;
  /** One key per EPISODE (after `episodeDaysOf`). */
  episodeDays: readonly string[];
  /** Every local day with any log at all — never derived from the episodes (C-3). */
  loggedDays: readonly string[];
  /** The pet's first logged day, so days before it are not "unlogged". */
  recordStart?: string | null;
}

/** The weekly bars: the card's and the screen's are the same call. */
export function signalWeeks(input: SignalWeeksInput): WeeklyBucketsModel {
  const weeks = signalWeekCount(input.finding, input.today, input.trial);
  return weeklyBuckets({
    episodeDays: input.episodeDays,
    loggedDays: input.loggedDays,
    weeksEnding: input.today,
    today: input.today,
    weeks,
    mark: input.trial ? { day: input.trial.startDay, label: `${lowerFirst(input.trial.identity)} started` } : undefined,
    recordStart: input.recordStart ?? undefined,
  });
}

/** The two numbers the card's line states, read off the buckets the bars draw. */
export function weekLineNumbers(model: WeeklyBucketsModel): { thisWeek: number; lastWeek: number | null; soFar: boolean } {
  const n = model.weeks.length;
  const last = model.weeks[n - 1];
  const prev = n >= 2 ? model.weeks[n - 2] : null;
  return { thisWeek: last.count, lastWeek: prev ? prev.count : null, soFar: last.partial };
}

/** "2 this week so far · 3 last week" — the card's one line. "So far" only while the week
 *  is not over; a count, never a direction word. */
export function weekLine(model: WeeklyBucketsModel): string {
  const { thisWeek, lastWeek, soFar } = weekLineNumbers(model);
  const head = `${thisWeek} this week${soFar ? ' so far' : ''}`;
  return lastWeek == null ? head : `${head} · ${lastWeek} last week`;
}

/** One compare window, before its episodes are counted. */
export interface SignalWindowSpec {
  label: string;
  startDay: string;
  days: number;
}

/** True when the trial is too young for a compare (`MIN_COMPARE_DAYS`); the screen then
 *  draws no compare, one lane, and says why in *Why this is a Signal*. */
export function trialTooYoungToCompare(trial: SignalTrialWindow | null): boolean {
  return trial != null && trial.dayCounter < MIN_COMPARE_DAYS;
}

/**
 * The two windows the screen compares. Equal length, never overlapping: on a running
 * trial the trial's own days — the DAY COUNTER the title states, ending today, so the
 * two can never disagree — and the same count immediately before the trial; past the cap,
 * the trial's LAST N days and the N before the trial (a gap between them, named);
 * otherwise the two halves of the finding's lookback, ending today. A trial under the
 * floor takes the no-trial shape: the halves, ending today, with the trial inside them
 * undivided (the caller says so).
 */
export function signalCompareSpec(
  finding: SignalFinding,
  today: string,
  trial: SignalTrialWindow | null,
): [SignalWindowSpec, SignalWindowSpec] {
  const todayIdx = indexOf(today, 'today');
  if (trial && !trialTooYoungToCompare(trial)) {
    const run = Math.max(1, Math.floor(trial.dayCounter));
    const days = Math.min(run, MAX_COMPARE_DAYS);
    const capped = days < run;
    // The trial's window ends today and is `days` long — anchored on today and the day
    // counter, never re-derived from `startDay` (one authority for "day N").
    const duringStart = todayIdx - days + 1;
    // The days before the TRIAL, not before the window: when capped the two are apart.
    const trialStart = todayIdx - run + 1;
    return [
      {
        label: capped ? `The ${days} days before the trial` : `The ${days} ${plural(days, 'day')} before`,
        startDay: dayKeyFromIndex(trialStart - days),
        days,
      },
      {
        label: capped ? `The trial's last ${days} days` : `The trial's ${days} ${plural(days, 'day')}`,
        startDay: dayKeyFromIndex(duringStart),
        days,
      },
    ];
  }
  const half = Math.max(1, Math.floor(signalWindowDays(finding) / 2));
  const duringStart = todayIdx - half + 1;
  return [
    { label: `The ${half} ${plural(half, 'day')} before`, startDay: dayKeyFromIndex(duringStart - half), days: half },
    { label: `The recent ${half} ${plural(half, 'day')}`, startDay: dayKeyFromIndex(duringStart), days: half },
  ];
}

export interface SignalCompareInput extends SignalWeeksInput {}

/** The compare bars' model — logged days shown, no adjudication (the chart's own rule). */
export function signalCompare(input: SignalCompareInput): CompareWindowsModel {
  const [before, during] = signalCompareSpec(input.finding, input.today, input.trial);
  const shared = { episodeDays: input.episodeDays, loggedDays: input.loggedDays, recordStart: input.recordStart ?? undefined };
  return compareWindows({ ...before, ...shared }, { ...during, ...shared });
}

/** One lane's window, before its episodes are laid. */
export interface SignalLaneSpec {
  label: string;
  /** Inclusive. */
  startDay: string;
  /** Inclusive. */
  endDay: string;
}

/** Before the trial · in the trial, or one lane over the lookback (a trial under the
 *  compare floor takes the one lane too — no two-lane split over a day or two). */
export function signalLaneSpec(finding: SignalFinding, today: string, trial: SignalTrialWindow | null): SignalLaneSpec[] {
  const [before, during] = signalCompareSpec(finding, today, trial);
  const endOf = (w: SignalWindowSpec) => dayKeyFromIndex(indexOf(w.startDay, 'startDay') + w.days - 1);
  if (trial && !trialTooYoungToCompare(trial)) {
    return [
      { label: 'Before the trial', startDay: before.startDay, endDay: endOf(before) },
      { label: 'In the trial', startDay: during.startDay, endDay: endOf(during) },
    ];
  }
  const days = signalWindowDays(finding);
  const todayIdx = indexOf(today, 'today');
  return [{ label: `The last ${days} ${plural(days, 'day')}`, startDay: dayKeyFromIndex(todayIdx - days + 1), endDay: today }];
}

export interface SignalLanesInput {
  finding: SignalFinding;
  today: string;
  trial: SignalTrialWindow | null;
  /** One entry per episode, timed or not. */
  episodes: readonly SignalEpisodeDay[];
}

export interface SignalLanesModel {
  lanes: LaneModel[];
  axis: LaneAxis;
}

/** The timing lanes, laid with the shipped panel's own geometry (`laneDots`). */
export function signalLanes(input: SignalLanesInput): SignalLanesModel {
  const specs = signalLaneSpec(input.finding, input.today, input.trial);
  const lanes = specs.map((spec) => {
    const start = indexOf(spec.startDay, 'lane.startDay');
    const end = indexOf(spec.endDay, 'lane.endDay');
    const laneInput: LaneInput = {
      label: spec.label,
      episodeMinutes: input.episodes
        .filter((e) => {
          const idx = indexOf(e.dayKey, 'episodes[].dayKey');
          return idx >= start && idx <= end;
        })
        .map((e) => e.minutesSinceMeal),
    };
    return laneDots(laneInput);
  });
  return { lanes, axis: timingLanesAxis() };
}

function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}

function lowerFirst(s: string): string {
  return s.length === 0 ? s : s[0].toLowerCase() + s.slice(1);
}
