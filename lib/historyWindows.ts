// History's windows: one table, in local days (BRK-5, BRK-17, H-10, H-11; CUL-1160;
// docs/nyx-history-v2-requirements.md §3.9, §5.2, §11).
//
//   All time                  the pet's first record → today
//   Today                     today
//   Last 7 / 14 / 30 days     today − 6 / 13 / 29 → today
//   Since the trial started   the trial's `exposureRange` start → today, while the trial
//                             runs and that range reaches today
//   Since the last vet visit  the latest visit strictly before today, including its day →
//                             today (`lib/visitWindow.ts`, the report's bound)
//   A month                   its first → last day
//
// Every window is then clipped to the pet's record: it never starts before the first
// record (GAP-24) and never runs past today. What comes out is `WindowBounds`, two local
// day keys, both inclusive, and that is all the data layer takes.
//
// ── LOCAL DAYS, NEVER N × 24 HOURS ─────────────────────────────────────────────
//
// v1's "Last 7 days" was `now − 7 × 24h` (`lib/historyDateFilter.ts`), which is not seven
// days at all: it starts mid-afternoon a week ago, and across a DST change it lands an
// hour into the wrong day. Here every bound is day-key arithmetic on whole-day indices,
// so "Last 7 days" is the seven local days ending today, on every clock and in every
// zone. The caller derives `today` once (`toLocalDayKey(new Date())`); nothing here reads
// a clock. Every field of `WindowFacts` must be derived for that same `today`: a screen
// left open across midnight recomputes all of them together (a trial read the night
// before reads as not offered until it is recomputed).
//
// ── THE WINDOW IS AN IDENTITY; ITS DATES ARE RESOLVED ──────────────────────────
//
// `HistoryWindowKey` names a window and never carries a date: "since the trial" is
// resolved against the pet's own trial every time. So the store and a link hold only the
// identity, and no window can carry one pet's trial or visit date to another (GAP-27).
//
// ── THE TRIAL WINDOW: BELIEF DECIDES IF, EVIDENCE DECIDES WHEN ─────────────────
//
// §11: v1 offers the trial window "only while the trial runs", and "is this trial running
// today" has exactly one answer in this app, `isTrialRunning` (belief, B-422). Its DATES
// come from `TrialFacts.exposureRange` (evidence), never `range`: the diet-trial spec's
// hardest-won rule (§5, the B-494 lineage) is that `range` is the COVERAGE window, clipped
// at both ends for the denominator's sake, and bounding rows by it deletes logged
// exposures. Both are read by `windowTrialOf`, the one way to build a `WindowTrial`, so
// neither can be passed without the other, and the belief is read for the table's own
// `today` (evidence computed the night before fails the evidence check, below).
//
// The first cut offered the window whenever `exposureRange` reached today, and the
// adversarial pass (CUL-1160) priced it: a 56-day trial nobody closed was still offered as
// *Since the trial started* a year later, so vomits after the owner went back to the old
// food would read as a failed trial. `exposureRange` reaches today on every un-ended trial
// because the evidence does; belief is what ends. A trial completed or abandoned today is
// no longer running, so its window goes the same day.
//
// ── WHAT THE COUNT LINE SAYS BESIDE A WINDOW (CUL-1189, PM-ruled 2026-09-25) ────
//
// Two facts ride out on `ResolvedWindow`, and the spec's §3.2 holds the words:
//
//   • `recordStartsLater`: an ANCHORED window (the trial, the visit) whose anchor is
//     before the pet's first record keeps its bounds at the record (GAP-24) and names
//     where the record starts: *Since the last vet visit, Jul 26 · record from Aug 3*.
//     The unwatched days are named, never counted as gaps. Only the two anchored windows
//     carry it: a rolling window or a month on a young record stays quiet, as GAP-24
//     ruled (a month already says *from May 14* on the sheet), so this is null there
//     and the count line has nothing to decide.
//   • `trialPastTarget`: the trial window, offered inside B-422's grace after the trial's
//     planned end, says so: *Since the trial started, Jul 26 · past its planned end*.
//
// The table exposes the facts; the count line (HV-7) owns the words.
//
// ── BLIND SPOTS, STATED (C-38) ─────────────────────────────────────────────────
//
// A row dated after today (a device clock that was set forward when it was logged) sits
// outside every window, All time included, because every window ends today (§3.9). And a
// first record dated after today puts nothing before today in any window.

import {
  isTrialRunning,
  trialTargetEndDayIndex,
  type TrialFacts,
} from './dietTrial';
import { recordDay, recordDayIndex, recordMonth, recordMonthUnderYear } from './recordDates';
import { dayKeyFromIndex, localDayIndexOf } from './utils';
import type { SinceVisitDay } from './visitWindow';

/** The rolling windows, in days. */
export const LAST_DAYS = [7, 14, 30] as const;
export type LastDays = (typeof LAST_DAYS)[number];

/** A window's identity: what the store holds and a link sends. Never its dates. */
export type HistoryWindowKey =
  | { kind: 'all' }
  | { kind: 'today' }
  | { kind: 'last'; days: LastDays }
  | { kind: 'trial' }
  | { kind: 'visit' }
  /** `month` is a month key, 'YYYY-MM'. */
  | { kind: 'month'; month: string };

export const ALL_TIME: HistoryWindowKey = { kind: 'all' };

/** A window's bounds: local day keys ('YYYY-MM-DD'), both INCLUSIVE. */
export interface WindowBounds {
  fromDay: string;
  toDay: string;
}

/**
 * The trial as the window table takes it. Mint it with `windowTrialOf` only (the brand
 * says so): that is what keeps the belief and the evidence on the shared predicates.
 */
export interface WindowTrial {
  readonly __brand: 'WindowTrial';
  /** The trial's own first day ('YYYY-MM-DD'), the window's anchor, or null when its
   *  start cannot be placed. */
  readonly startDay: string | null;
  /** `TrialFacts.exposureRange` (evidence), from facts computed with NO scope. */
  readonly exposureRange: TrialFacts['exposureRange'];
  /** `isTrialRunning` for the `today` it was built with (belief): whether the window is
   *  offered at all. */
  readonly running: boolean;
  /** That day is past the trial's planned last day, inside B-422's grace (CUL-1189). */
  readonly pastTargetEnd: boolean;
}

/** What a window is resolved against: one pet's record, as of today. */
export interface WindowFacts {
  /** The pet these facts were read for. A screen drops facts read for another pet the
   *  way it drops rows (AC 12); `ResolvedWindow` carries it into the read key. */
  petId: string | null;
  /** The owner's local day, 'YYYY-MM-DD' (`toLocalDayKey(new Date())`). */
  today: string;
  /**
   * The pet's first record: its local day key, or its INSTANT (what `MIN(occurred_at)`
   * returns), read as its local day on this device. Null for a pet with nothing logged.
   * The data layer decides what counts as the record; a visit never does
   * (`guards/visitReaders.test.ts`). Anything else throws: an unreadable start must
   * never read as an empty record, which would hide every earlier row.
   */
  firstRecordDay: string | null;
  /** The pet's trial, from `windowTrialOf`, or null for no trial. */
  trial: WindowTrial | null;
  /** "Since the last vet visit": minted only by `lib/visitWindow.ts` (H-11). */
  sinceVisit: SinceVisitDay | null;
}

/** How a window reads (§3.9). "One long and one short name per window" (BRK-17). */
export interface WindowLabel {
  /** The count line: *Last 7 days*, *Since the trial started*, *September 2025*. */
  long: string;
  /** The pill: *Last 7 days*, *Since Jul 26*, *September*. */
  short: string;
  /**
   * The date an anchored window keeps everywhere (*Jul 26*), or null. The count line
   * reads *Since the trial started, Jul 26*; the sheet shows it under the row; the pill
   * already carries it.
   */
  anchor: string | null;
  /** The window sheet's row title. A month is bare there, under its year's subhead. */
  sheetTitle: string;
  /** The small line under the sheet row: *since May 14* on All time, the anchor on the
   *  trial and visit rows, *from May 14* on a month the record starts inside. */
  sheetSub: string | null;
}

/** A window as the screen uses it: the identity that applies, its bounds, its names, and
 *  the facts its count line may need to state. */
export interface ResolvedWindow {
  key: HistoryWindowKey;
  bounds: WindowBounds;
  label: WindowLabel;
  /**
   * The window asked for is not offered for this pet today (no trial running, no visit
   * before today, a month outside the record), so All time applies. The screen shows the
   * window that applies and does NOT write it back to the store: the owner's choice
   * stays, so a window that is only briefly unavailable (facts being recomputed across
   * midnight) comes back by itself.
   */
  fellBack: boolean;
  /** The pet the facts were read for (`WindowFacts.petId`). */
  petId: string | null;
  /** For the trial or visit window only: the record's first day ('YYYY-MM-DD') when the
   *  anchor is earlier, so the bounds start at the record (GAP-24) and the count line says
   *  *record from Aug 3* (CUL-1189). Null for every other window, and when the anchor is
   *  inside the record. */
  recordStartsLater: string | null;
  /** The trial window, offered past the trial's planned last day (B-422's grace): the count
   *  line says *past its planned end* (CUL-1189). Always false for any other window. */
  trialPastTarget: boolean;
}

/** One year's months on the window sheet, newest first, under a subhead. */
export interface MonthGroup {
  year: number;
  /** The subhead: the year, always stated (*2026*), even for the current one. */
  subhead: string;
  months: HistoryWindowKey[];
}

// ── Day arithmetic ────────────────────────────────────────────────────────────

const MONTH_KEY = /^(\d{4})-(\d{2})$/;
const INSTANT = /^\d{4}-\d{2}-\d{2}T/;

/** Today as a day index, or a thrown error: `today` comes from the device clock, so an
 *  unreadable one is a caller's bug, and no window can be placed on it. */
function todayIndexOf(today: string): number {
  const index = recordDayIndex(today);
  if (index === null) throw new RangeError(`historyWindows: today is not a day key: "${today}"`);
  return index;
}

/** The first and last day of a month key, as indices, or null for a malformed key. */
function monthSpan(month: string): { first: number; last: number } | null {
  const m = MONTH_KEY.exec(month);
  if (!m) return null;
  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;
  const first = recordDayIndex(`${m[1]}-${m[2]}-01`);
  if (first === null) return null;
  // Day 0 of the next month is this month's last day, and Date.UTC has no DST.
  const last = recordDayIndex(new Date(Date.UTC(year, monthIndex + 1, 0)).toISOString().slice(0, 10));
  return last === null ? null : { first, last };
}

/** The month key ('YYYY-MM') a day index falls in. */
function monthOf(index: number): string {
  return dayKeyFromIndex(index).slice(0, 7);
}

/** The Sunday on or before a day (the strip pages by the week, Sunday first, §3.4), or
 *  null for a malformed key. 1970-01-01, index 0, was a Thursday. */
export function weekStartOf(day: string): string | null {
  const index = recordDayIndex(day);
  if (index === null) return null;
  const weekday = (((index + 4) % 7) + 7) % 7; // 0 = Sunday
  return dayKeyFromIndex(index - weekday);
}

// ── The trial ─────────────────────────────────────────────────────────────────

/**
 * The trial as the window table takes it: the evidence window's dates and the belief that
 * the trial is running on `today`, read by the shared predicates (the header).
 *
 * `trial` is the trial row as the trial predicates take it (`TrialCardTrial` from
 * `loadTrialPredicateFacts` fits); `facts` are its `computeTrialFacts` answer, computed
 * with NO scope. Facts computed with a report scope open `exposureRange` on the scope's
 * first day, which would print *Since the trial started · Sep 16* over a trial that
 * started Jul 26, so they throw rather than mislabel.
 */
export function windowTrialOf(
  trial: {
    startedAt: string;
    targetDurationDays?: number | null;
    status?: string | null;
    endedAt?: string | null;
  },
  facts: Pick<TrialFacts, 'exposureRange'>,
  today: string,
): WindowTrial {
  const todayIndex = todayIndexOf(today);
  // `started_at` may be a DATE or an instant (`trialStartDayKey`'s two shapes); either is
  // read as its local day on this device, the basis `computeTrialFacts` used.
  const startIndex = localDayIndexOf(trial.startedAt);
  const range = facts.exposureRange;
  if (range && startIndex !== null && range.startDayIndex !== startIndex) {
    throw new RangeError(
      'windowTrialOf: the trial facts were computed with a scope; History needs them unscoped',
    );
  }
  // Local noon on `today`, built from its parts: on `today` in every zone and across every
  // DST change, so the belief is read for exactly the day the table resolves.
  const [y, m, d] = dayKeyFromIndex(todayIndex).split('-').map(Number);
  const noon = new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
  const targetEnd = trialTargetEndDayIndex(trial);
  const window: Omit<WindowTrial, '__brand'> = {
    startDay: startIndex === null ? null : dayKeyFromIndex(startIndex),
    exposureRange: range,
    running: isTrialRunning(trial, noon),
    pastTargetEnd: targetEnd !== null && todayIndex > targetEnd,
  };
  return window as WindowTrial;
}

// ── The record's span ─────────────────────────────────────────────────────────

interface Span {
  today: number;
  /** The first day any window may show: the record's first day, or today when there is
   *  no record (nothing before today can be in a window of an empty record). Never after
   *  today, so a record dated in the future cannot invert a window. */
  floor: number;
  /** The record's first day when it is on or before today, else null. What a label may
   *  state as the record's start: a first record dated after today has no honest place
   *  on a line that ends today. */
  recordStart: number | null;
  /** Whether the pet has a record at all. */
  hasRecord: boolean;
}

/** The first record's day index (the `firstRecordDay` contract), or null for none. */
function firstRecordIndexOf(value: string | null): number | null {
  if (value === null) return null;
  const day = recordDayIndex(value);
  if (day !== null) return day;
  const instant = INSTANT.test(value) ? localDayIndexOf(value) : null;
  if (instant === null) {
    throw new RangeError(`historyWindows: firstRecordDay is neither a day key nor an instant: "${value}"`);
  }
  return instant;
}

function spanOf(facts: WindowFacts): Span {
  const today = todayIndexOf(facts.today);
  const first = firstRecordIndexOf(facts.firstRecordDay);
  return {
    today,
    floor: first === null ? today : Math.min(first, today),
    recordStart: first !== null && first <= today ? first : null,
    hasRecord: first !== null,
  };
}

/** The anchor day of an anchored window, as an index, when it is offered. */
function anchorIndex(key: HistoryWindowKey, facts: WindowFacts, span: Span): number | null {
  if (key.kind === 'trial') {
    const trial = facts.trial;
    // Belief first: only a running trial (§11).
    if (!trial || !trial.running) return null;
    const range = trial.exposureRange;
    // Then the evidence: it must reach today, and the trial must have begun. A trial read
    // the night before fails here (its evidence stops last night), so a screen left open
    // across midnight shows All time until it recomputes, and the store keeps the choice.
    // One read for a LATER day needs no check: belief only ever turns off as days pass,
    // so a trial running tomorrow was running today.
    if (!range || range.endDayIndex < span.today || range.startDayIndex > span.today) return null;
    return range.startDayIndex;
  }
  if (key.kind === 'visit') {
    const visit = facts.sinceVisit === null ? null : recordDayIndex(facts.sinceVisit);
    // Strictly before today, re-checked: a bound read on an earlier day is still honest
    // tomorrow, but one computed for a later "today" than this one is not.
    return visit !== null && visit < span.today ? visit : null;
  }
  return null;
}

/** The unclipped start and end of a window, as indices, or null when it is not offered. */
function rawBounds(
  key: HistoryWindowKey,
  facts: WindowFacts,
  span: Span,
): { from: number; to: number } | null {
  switch (key.kind) {
    case 'all':
      return { from: span.floor, to: span.today };
    case 'today':
      return { from: span.today, to: span.today };
    case 'last':
      if (!(LAST_DAYS as readonly number[]).includes(key.days)) return null;
      return { from: span.today - (key.days - 1), to: span.today };
    case 'trial':
    case 'visit': {
      const anchor = anchorIndex(key, facts, span);
      return anchor === null ? null : { from: anchor, to: span.today };
    }
    case 'month': {
      // A month is offered only inside the record: from the first record's month through
      // this one. An empty record offers none.
      const m = monthSpan(key.month);
      if (!m || !span.hasRecord) return null;
      if (m.last < span.floor || m.first > span.today) return null;
      return { from: m.first, to: Math.min(m.last, span.today) };
    }
  }
}

/** The clipped window, as indices, with the unclipped start kept for `recordStartsLater`. */
function clippedBounds(
  key: HistoryWindowKey,
  facts: WindowFacts,
  span: Span,
): { from: number; to: number; rawFrom: number } | null {
  const raw = rawBounds(key, facts, span);
  if (!raw) return null;
  const from = Math.min(Math.max(raw.from, span.floor), span.today);
  const to = Math.min(raw.to, span.today);
  return from > to ? null : { from, to, rawFrom: raw.from };
}

// ── The table ─────────────────────────────────────────────────────────────────

/**
 * A window's bounds for this pet today, or null when the window is not offered.
 * Clipped to the record: never before its first day, never past today. Throws on an
 * unreadable `today` or first record (the `WindowFacts` contract).
 */
export function windowBounds(key: HistoryWindowKey, facts: WindowFacts): WindowBounds | null {
  const c = clippedBounds(key, facts, spanOf(facts));
  return c ? { fromDay: dayKeyFromIndex(c.from), toDay: dayKeyFromIndex(c.to) } : null;
}

/** Is this window offered for this pet today? */
export function isWindowOffered(key: HistoryWindowKey, facts: WindowFacts): boolean {
  return windowBounds(key, facts) !== null;
}

/**
 * How a window reads, or null when it is not offered. Every date goes through the one
 * formatter (H-10), so an anchor outside the current year carries its year everywhere
 * (*Since Dec 27, 2025*).
 */
export function windowLabel(key: HistoryWindowKey, facts: WindowFacts): WindowLabel | null {
  const span = spanOf(facts);
  if (!clippedBounds(key, facts, span)) return null;
  const day = (index: number) => recordDay(dayKeyFromIndex(index), facts.today) as string;
  const start = span.recordStart;

  switch (key.kind) {
    case 'all': {
      const since = start === null ? null : `since ${day(start)}`;
      return { long: 'All time', short: 'All time', anchor: null, sheetTitle: 'All time', sheetSub: since };
    }
    case 'today':
      return { long: 'Today', short: 'Today', anchor: null, sheetTitle: 'Today', sheetSub: null };
    case 'last': {
      const name = `Last ${key.days} days`;
      return { long: name, short: name, anchor: null, sheetTitle: name, sheetSub: null };
    }
    case 'trial':
    case 'visit': {
      const anchor = day(anchorIndex(key, facts, span) as number);
      const long = key.kind === 'trial' ? 'Since the trial started' : 'Since the last vet visit';
      return { long, short: `Since ${anchor}`, anchor, sheetTitle: long, sheetSub: anchor };
    }
    case 'month': {
      const name = recordMonth(key.month, facts.today) as string;
      const m = monthSpan(key.month);
      // The month the record starts inside says where: *from May 14*.
      const startsInside = m !== null && start !== null && start > m.first;
      return {
        long: name,
        short: name,
        anchor: null,
        sheetTitle: recordMonthUnderYear(key.month) as string,
        sheetSub: startsInside ? `from ${day(start as number)}` : null,
      };
    }
  }
}

/**
 * The window that applies: the one asked for when it is offered, All time when it is not
 * (All time is always offered). Throws on an unreadable `today` or first record.
 */
export function resolveWindow(key: HistoryWindowKey, facts: WindowFacts): ResolvedWindow {
  const span = spanOf(facts);
  const asked = clippedBounds(key, facts, span);
  const effective = asked ? key : ALL_TIME;
  const c = asked ?? (clippedBounds(ALL_TIME, facts, span) as { from: number; to: number; rawFrom: number });
  return {
    key: effective,
    bounds: { fromDay: dayKeyFromIndex(c.from), toDay: dayKeyFromIndex(c.to) },
    label: windowLabel(effective, facts) as WindowLabel,
    fellBack: asked === null,
    petId: facts.petId,
    recordStartsLater:
      (effective.kind === 'trial' || effective.kind === 'visit') &&
      span.recordStart !== null &&
      c.rawFrom < span.recordStart
        ? dayKeyFromIndex(span.recordStart)
        : null,
    trialPastTarget: effective.kind === 'trial' && facts.trial !== null && facts.trial.pastTargetEnd,
  };
}

/**
 * The window sheet's fixed rows, in order: All time, Today, the three rolling windows,
 * then the trial and visit rows only for a pet that has one (PMD-17). The months follow,
 * from `monthGroups`.
 */
export function offeredWindows(facts: WindowFacts): HistoryWindowKey[] {
  const rows: HistoryWindowKey[] = [
    { kind: 'all' },
    { kind: 'today' },
    ...LAST_DAYS.map((days): HistoryWindowKey => ({ kind: 'last', days })),
    { kind: 'trial' },
    { kind: 'visit' },
  ];
  return rows.filter((k) => isWindowOffered(k, facts));
}

/**
 * The months the record spans, newest first, grouped under their year (H-10): this
 * month back to the one the first record falls in. None for an empty record.
 */
export function monthGroups(facts: WindowFacts): MonthGroup[] {
  const span = spanOf(facts);
  if (!span.hasRecord) return [];
  const groups: MonthGroup[] = [];
  // Walk back a month at a time by DAY INDEX: `cursor` is a day in the month being
  // added, and a month is in the record while any of its days is on or after the floor.
  let cursor = span.today;
  while (cursor >= span.floor) {
    const month = monthOf(cursor);
    const year = Number(month.slice(0, 4));
    let group = groups[groups.length - 1];
    if (!group || group.year !== year) {
      group = { year, subhead: String(year), months: [] };
      groups.push(group);
    }
    group.months.push({ kind: 'month', month });
    cursor = (monthSpan(month) as { first: number }).first - 1;
  }
  return groups;
}

// ── The window as a link parameter ────────────────────────────────────────────

/**
 * A window as a `?window=` value, and as the window's part of the scope key. v1's
 * vocabulary is kept where it exists ('today', '7d', '30d', the links Ask and the Noticed
 * card already send), so an existing link lands on the same window in v2.
 */
export function windowParam(key: HistoryWindowKey): string {
  switch (key.kind) {
    case 'all':
      return 'all';
    case 'today':
      return 'today';
    case 'last':
      return `${key.days}d`;
    case 'trial':
      return 'trial';
    case 'visit':
      return 'visit';
    case 'month':
      return key.month;
  }
}

/**
 * A `?window=` value as a window. Anything unrecognised, or absent, is All time: v1's
 * rule (`coerceDatePreset`), because a bad link degrades to the superset rather than
 * hiding rows. Whether the window is OFFERED is `resolveWindow`'s question, not this one.
 */
export function windowFromParam(value: string | null | undefined): HistoryWindowKey {
  switch (value) {
    case 'today':
      return { kind: 'today' };
    case '7d':
      return { kind: 'last', days: 7 };
    case '14d':
      return { kind: 'last', days: 14 };
    case '30d':
      return { kind: 'last', days: 30 };
    case 'trial':
      return { kind: 'trial' };
    case 'visit':
      return { kind: 'visit' };
    default:
      return value && monthSpan(value) ? { kind: 'month', month: value } : ALL_TIME;
  }
}

/** Two window identities are the same window. */
export function sameWindow(a: HistoryWindowKey, b: HistoryWindowKey): boolean {
  return windowParam(a) === windowParam(b);
}
