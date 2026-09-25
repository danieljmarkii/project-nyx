// History's windows: one table, in local days (BRK-5, BRK-17, H-10, H-11; CUL-1160;
// docs/nyx-history-v2-requirements.md §3.9, §5.2).
//
//   All time                  the pet's first record → today
//   Today                     today
//   Last 7 / 14 / 30 days     today − 6 / 13 / 29 → today
//   Since the trial started   the trial's `exposureRange` start → today, while that range
//                             reaches today
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
// a clock.
//
// ── THE WINDOW IS AN IDENTITY; ITS DATES ARE RESOLVED ──────────────────────────
//
// `HistoryWindowKey` names a window and never carries a date: "since the trial" is
// resolved against the pet's own trial every time. So the store and a link hold only the
// identity, and no window can carry one pet's trial or visit date to another (GAP-27).
//
// ── THE TRIAL WINDOW READS `exposureRange`, NEVER `range` ──────────────────────
//
// The diet-trial spec's hardest-won rule (§5, the B-494 lineage): `range` is the COVERAGE
// window, clipped at both ends for the denominator's sake, and a consumer that bounds
// rows by it deletes logged exposures. So `WindowFacts.trial` is typed as
// `Pick<TrialFacts, 'exposureRange'>`: the compiler will not let this module read the
// other field. The window is offered only while that range reaches today (§11 parks a
// window over an ended trial), which also answers a trial that ended yesterday: its
// evidence stops at its end, so it is not offered today.
//
// A trial nobody ended, past its effective end, is still offered: `exposureRange` reaches
// today because the evidence does (the effective end bounds belief and one denominator,
// never evidence, B-422). A window is a lens over the record, not a claim about it, so
// offering it over an overrun trial states nothing the record does not hold.

import type { TrialFacts } from './dietTrial';
import { recordDay, recordMonth, recordMonthUnderYear } from './recordDates';
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

/** What a window is resolved against: one pet's record, as of today. */
export interface WindowFacts {
  /** The owner's local day, 'YYYY-MM-DD' (`toLocalDayKey(new Date())`). */
  today: string;
  /** The local day the pet's record starts (the list's "{pet}'s record starts here",
   *  §3.12), or null for a pet with nothing logged. The data layer decides what counts
   *  as the record; a visit never does (`guards/visitReaders.test.ts`). */
  firstRecordDay: string | null;
  /**
   * The pet's trial, as the trial predicates computed it, or null for no trial. Compute
   * it with NO report scope, so `exposureRange` opens on the trial's own first day. Only
   * `exposureRange` is read, and the type says so.
   */
  trial: Pick<TrialFacts, 'exposureRange'> | null;
  /** "Since the last vet visit" — minted only by `lib/visitWindow.ts` (H-11). */
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

/** A window as the screen uses it: the identity that actually applies, its bounds and
 *  its names. */
export interface ResolvedWindow {
  key: HistoryWindowKey;
  bounds: WindowBounds;
  label: WindowLabel;
  /** The window asked for is not offered for this pet today (no trial running, no visit
   *  before today, a month outside the record), so All time applies instead. The screen
   *  writes All time back rather than show a pill that names a window it is not using. */
  fellBack: boolean;
}

/** One year's months on the window sheet, newest first, under a subhead. */
export interface MonthGroup {
  year: number;
  /** The subhead: the year, always stated (*2026*), even for the current one. */
  subhead: string;
  months: HistoryWindowKey[];
}

// ── Day arithmetic ────────────────────────────────────────────────────────────

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY = /^(\d{4})-(\d{2})$/;

/** A day key's whole-day index, or null when it is not a real calendar day. */
function dayIndex(key: string | null | undefined): number | null {
  return typeof key === 'string' && DAY_KEY.test(key) ? localDayIndexOf(key) : null;
}

/** The first and last day of a month key, as indices, or null for a malformed key. */
function monthSpan(month: string): { first: number; last: number } | null {
  const m = MONTH_KEY.exec(month);
  if (!m) return null;
  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;
  const first = dayIndex(`${m[1]}-${m[2]}-01`);
  if (first === null) return null;
  // Day 0 of the next month is this month's last day, and Date.UTC has no DST.
  const last = dayIndex(new Date(Date.UTC(year, monthIndex + 1, 0)).toISOString().slice(0, 10));
  return last === null ? null : { first, last };
}

/** The month key ('YYYY-MM') a day index falls in. */
function monthOf(index: number): string {
  return dayKeyFromIndex(index).slice(0, 7);
}

/** The Sunday on or before a day (the strip pages by the week, Sunday first, §3.4), or
 *  null for a malformed key. 1970-01-01, index 0, was a Thursday. */
export function weekStartOf(day: string): string | null {
  const index = dayIndex(day);
  if (index === null) return null;
  const weekday = (((index + 4) % 7) + 7) % 7; // 0 = Sunday
  return dayKeyFromIndex(index - weekday);
}

// ── The record's span ─────────────────────────────────────────────────────────

interface Span {
  today: number;
  /** The first day any window may show: the record's first day, or today when there is
   *  no record (nothing before today can be in a window of an empty record). Never after
   *  today, so a record dated in the future cannot invert a window. */
  floor: number;
  /** The record's first day, or null for an empty record. */
  first: number | null;
}

function spanOf(facts: WindowFacts): Span | null {
  const today = dayIndex(facts.today);
  if (today === null) return null;
  const first = dayIndex(facts.firstRecordDay);
  return { today, first, floor: first === null ? today : Math.min(first, today) };
}

/** The anchor day of an anchored window, as an index, when it is offered. */
function anchorIndex(key: HistoryWindowKey, facts: WindowFacts, span: Span): number | null {
  if (key.kind === 'trial') {
    const range = facts.trial?.exposureRange ?? null;
    // Offered only while the evidence reaches today, and only once the trial has begun.
    if (!range || range.endDayIndex < span.today || range.startDayIndex > span.today) return null;
    return range.startDayIndex;
  }
  if (key.kind === 'visit') {
    const visit = dayIndex(facts.sinceVisit);
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
      if (!m || span.first === null) return null;
      if (m.last < span.floor || m.first > span.today) return null;
      return { from: m.first, to: Math.min(m.last, span.today) };
    }
  }
}

// ── The table ─────────────────────────────────────────────────────────────────

/**
 * A window's bounds for this pet today, or null when the window is not offered (or
 * `today` cannot be read).
 *
 * Clipped to the record: never before its first day, never past today.
 */
export function windowBounds(key: HistoryWindowKey, facts: WindowFacts): WindowBounds | null {
  const span = spanOf(facts);
  if (!span) return null;
  const raw = rawBounds(key, facts, span);
  if (!raw) return null;
  const from = Math.min(Math.max(raw.from, span.floor), span.today);
  const to = Math.min(raw.to, span.today);
  if (from > to) return null;
  return { fromDay: dayKeyFromIndex(from), toDay: dayKeyFromIndex(to) };
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
  if (!span || !windowBounds(key, facts)) return null;
  const day = (index: number) => recordDay(dayKeyFromIndex(index), facts.today) as string;

  // The record's first day as the windows see it: `floor`, so a first record dated in
  // the future (a skewed clock) never prints a start the window does not have.
  switch (key.kind) {
    case 'all': {
      const since = span.first === null ? null : `since ${day(span.floor)}`;
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
      const startsInside = m !== null && span.first !== null && span.floor > m.first;
      return {
        long: name,
        short: name,
        anchor: null,
        sheetTitle: recordMonthUnderYear(key.month) as string,
        sheetSub: startsInside ? `from ${day(span.floor)}` : null,
      };
    }
  }
}

/**
 * The window that applies: the one asked for when it is offered, All time when it is
 * not. Null only when `today` cannot be read, which no caller deriving it from the device
 * clock can produce, and which no window could be placed on.
 */
export function resolveWindow(key: HistoryWindowKey, facts: WindowFacts): ResolvedWindow | null {
  const asked = windowBounds(key, facts);
  const effective = asked ? key : ALL_TIME;
  const bounds = asked ?? windowBounds(ALL_TIME, facts);
  const label = bounds ? windowLabel(effective, facts) : null;
  if (!bounds || !label) return null;
  return { key: effective, bounds, label, fellBack: asked === null };
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
  if (!span || span.first === null) return [];
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
