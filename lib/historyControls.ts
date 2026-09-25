// History v2's controls, pure (HV-9 / CUL-1166; docs/nyx-history-v2-requirements.md §3.1,
// §3.7–3.9). What the pinned row's two pills say and what their two sheets list: every
// row, its count, its second line, and what VoiceOver reads for it. The reads live in
// `lib/historyWindowFacts.ts`; `components/historyV2/` draws what this returns, so every
// rule here is table-tested without a screen (C-41).
//
// ── NOTHING HERE COUNTS ON ITS OWN ──────────────────────────────────────────────────
// Every number is HV-4's. A sheet row's count and the type pill's are `windowTotalOf` /
// `typeSheetCountsOf` over the same `DayFacts` the count line sums (R-1, AC 1), sliced to
// the window from ONE read of the whole record (`daysIn`). The windows are HV-3's table
// (`offeredWindows`, `monthGroups`, `windowLabel`, `windowBounds`), a course is the vet
// report's course grain (`HistoryCourse`), and a read's state is HV-5's `readStateOf`,
// applied by the reader. This module decides only what to SHOW.
//
// ── WHEN A ROW MAY CARRY A NUMBER ───────────────────────────────────────────────────
//   • Never before the read answers (C-12): with no counts, no row prints a number, and
//     never a 0 standing in for one.
//   • Never while a search is open (`showCounts: false`). A number that labels a
//     destination counts what the destination holds (C-3), and under a search every
//     destination holds only the matches, which search never counts (§3.7, R-2). So the
//     pill, both sheets, *N not read* and *N not given in full* go quiet together.
//   • Never on Noticed, and never on a window row under Noticed (H-9).
//
// ── THE FILTER ON SCREEN IS ALWAYS LISTED ───────────────────────────────────────────
// The sheet lists a course only while it has a dose in the window (§3.8) and Noticed only
// where the look is live, but the filter the list is showing stays listed either way: a
// pill naming a filter the sheet cannot show is a filter the owner cannot see or undo
// (the filter UX spec §2, rules 1 and 2). A window needs no such rule: `resolveWindow`
// only ever applies a window the table offers, All time when the one asked for is not.

import { EVENT_TYPES } from '../constants/eventTypes';
import {
  HISTORY_TYPE_KEYS,
  countsDoses,
  courseSpanText,
  filterNoun,
  formatCount,
  inRange,
  notGivenInFullText,
  typeSheetCountsOf,
  windowTotalOf,
  type DayFacts,
  type DayRange,
  type HistoryCourse,
  type HistoryDateFormat,
  type HistoryFilter,
  type HistoryTypeKey,
  type TypeSheetCounts,
} from './historyDays';
import {
  ANCHORED_WINDOW_NAMES,
  monthGroups,
  offeredWindows,
  resolveWindow,
  windowBounds,
  windowLabel,
  type HistoryWindowKey,
  type ResolvedWindow,
  type WindowFacts,
} from './historyWindows';
import { historyDateFormatFor } from './historyDateFormat';
import type { HistoryRecordData } from './historyWindowFacts';
import { recordMonth } from './recordDates';

// ── The words ─────────────────────────────────────────────────────────────────────
// Placeholders for HV-12's copy pass, gathered here so that pass edits one place.

/** The two sheets' own labels, and the pills' spoken prefixes. */
export const TYPE_SHEET_LABEL = 'Show only';
export const WINDOW_SHEET_LABEL = 'Show events from';
export const TYPE_PILL_PREFIX = 'Filter';
export const WINDOW_PILL_PREFIX = 'Date range';

/** The type sheet's two section labels (§3.8). */
export const RECORD_HOLDS_SECTION = 'What the record holds';
export const DAILY_LOOK_SECTION = 'The daily look';

/** The filters that are not a single event type, in the pill's and the sheet's words. */
const FILTER_LABEL = {
  all: 'All types',
  symptoms: 'All symptoms',
  photographed: 'Photographed',
  noted: 'With a note',
} as const;

/** Photographed's second line when the owner turned photo reading off (H-4b, CUL-552):
 *  said once, here and on the record, never on the rows. */
export const READING_OFF_TEXT = 'photo reading is off';

/**
 * Whether the owner has turned photo reading off. FALSE until CUL-552 ships the consent
 * (HV-18, CUL-1174, wires the owner's choice here). One constant, so the sheet's line and
 * the *N not read* count can never disagree about it.
 */
export const PHOTO_READING_OFF: boolean = false;

/** The search button, and the field it opens (§3.7). */
export const SEARCH_DONE_LABEL = 'Done';
export function searchLabelOf(petName: string): string {
  return `Search ${petName}'s record`;
}

/**
 * The field's placeholder names only what search reads: food and medicine names, and the
 * owner's notes only once search reads them (`SEARCH_READS_NOTES`, CUL-848; AC 39). A
 * placeholder promising notes would send an owner looking for a word search cannot find.
 */
export function searchPlaceholderOf(readsNotes: boolean): string {
  return readsNotes ? 'Foods, medicines, your notes' : 'Foods, medicines';
}

/** Photographed rows whose read is `unread` (§5.4): '4 not read'. Null at zero. */
export function notReadText(n: number): string | null {
  return n > 0 ? `${formatCount(n)} not read` : null;
}

// ── Days ─────────────────────────────────────────────────────────────────────────

/** The facts of the days inside a window: the one slice every count here reads. */
export function daysIn(days: ReadonlyMap<string, DayFacts>, range: DayRange): Map<string, DayFacts> {
  const out = new Map<string, DayFacts>();
  for (const [day, facts] of days) if (inRange(day, range)) out.set(day, facts);
  return out;
}

/** A per-day tally summed over a window (the *N not read* count). */
export function sumIn(perDay: ReadonlyMap<string, number>, range: DayRange): number {
  let n = 0;
  for (const [day, count] of perDay) if (inRange(day, range)) n += count;
  return n;
}

/** A record with nothing in it yet, as of `today`: what the window table answers before
 *  the pet's own facts have been read (the rolling windows only, and no dates). */
export function emptyWindowFacts(petId: string | null, today: string): WindowFacts {
  return { petId, today, firstRecordDay: null, trial: null, sinceVisit: null };
}

/**
 * A count as VoiceOver says it on the window sheet, where every row counts the ONE filter
 * on screen and the visible number carries no noun: '3 vomits', '12 photographed rows'.
 * All types and a dose filter read 'logged' (a dose count is never 'doses', CUL-1193).
 */
export function spokenCountOf(filter: HistoryFilter, n: number): string {
  if (filter.kind === 'all' || countsDoses(filter)) return `${formatCount(n)} logged`;
  return `${formatCount(n)} ${filterNoun(filter, n)}`;
}

// ── The rows ─────────────────────────────────────────────────────────────────────

/** One sheet row: what it picks and everything it shows. */
export interface SheetRow<T> {
  /** The filter or window the row picks. */
  value: T;
  label: string;
  /** Formatted ('1,094'), or null: no number on this row (see the header). */
  count: string | null;
  /** The quiet second line: its parts joined by ' · ' ('Jul 1 – Sep 5 · 4 not given in
   *  full'), or null. */
  detail: string | null;
  /** A course, drawn as a sub-row of Medication. */
  nested: boolean;
  /** A section label drawn above the row. */
  section: string | null;
  /** What VoiceOver reads: the label, the second line's parts and the count with its
   *  noun, in reading order. */
  accessibilityLabel: string;
}

function rowOf<T>(
  value: T,
  label: string,
  count: string | null,
  parts: readonly (string | null)[] = [],
  opts: { nested?: boolean; section?: string | null; spokenCount?: string | null } = {},
): SheetRow<T> {
  const detail = parts.filter((p): p is string => p !== null && p.length > 0);
  const spokenCount = count === null ? null : (opts.spokenCount ?? `${count} logged`);
  const spoken = [label, ...detail, spokenCount].filter((p): p is string => p !== null);
  return {
    value,
    label,
    count,
    detail: detail.length > 0 ? detail.join(' · ') : null,
    nested: opts.nested ?? false,
    section: opts.section ?? null,
    accessibilityLabel: spoken.join(', '),
  };
}

/** The care and measurement types, in the sheet's order after every other type: the
 *  mock's order, where the symptoms and the stools come first. Every other filterable type
 *  keeps `EVENT_TYPES`' own order ahead of these, so a new leaf is on the sheet (with its
 *  0) the day it ships. */
const CARE_TAIL: readonly HistoryTypeKey[] = ['meal', 'medication', 'weight_check', 'other'];

/** Every filterable type, in the sheet's order. */
export const TYPE_SHEET_ORDER: readonly HistoryTypeKey[] = [
  ...HISTORY_TYPE_KEYS.filter((type) => !CARE_TAIL.includes(type)),
  ...CARE_TAIL.filter((type) => HISTORY_TYPE_KEYS.includes(type)),
];

/** A filter as the pill and the sheet name it. A course the phone does not know by name
 *  yet (its courses still being read, or a link to one that no longer exists) reads as
 *  Medication, the filter it narrows, rather than as nothing. */
export function filterLabelOf(filter: HistoryFilter, courses: readonly HistoryCourse[]): string {
  switch (filter.kind) {
    case 'type':
      return EVENT_TYPES[filter.type].label;
    case 'course':
      return courses.find((c) => c.key === filter.courseKey)?.name ?? EVENT_TYPES.medication.label;
    case 'noticed':
      return EVENT_TYPES.check_in.label;
    default:
      return FILTER_LABEL[filter.kind];
  }
}

export interface TypeSheetInput {
  /** The counts for the window on screen (`typeSheetCountsOf` over its days), or null
   *  until the record's facts have been read. They also decide which courses are listed. */
  counts: TypeSheetCounts | null;
  /** False while a search is open: rows print no numbers (the header). */
  showCounts: boolean;
  /** The pet's courses, in the derivation's order (`readHistoryCourses`). */
  courses: readonly HistoryCourse[];
  /** Photographed rows in the window whose read is `unread`, or null when not known. */
  notRead: number | null;
  /** The owner turned photo reading off (`PHOTO_READING_OFF` until HV-18). */
  readingOff: boolean;
  /** The daily look is live for this account and pet (`lookCardLive`). */
  lookLive: boolean;
  /** The filter on screen. */
  current: HistoryFilter;
  /** The one formatter, for the courses' spans (H-10). */
  dates: HistoryDateFormat;
}

/**
 * The type sheet (§3.8), top to bottom: All types, All symptoms, every type (a type with
 * nothing logged shows 0 rather than hiding), Meal, Medication and one sub-row per course
 * with a dose in the window, Weight, Other; then what the record holds (Photographed with
 * its unread photos, With a note); then Noticed, with no count, where the look is live.
 */
export function typeSheetRows(input: TypeSheetInput): SheetRow<HistoryFilter>[] {
  const { counts, showCounts, courses, notRead, readingOff, lookLive, current, dates } = input;
  const shown = showCounts && counts !== null;
  const num = (n: number | undefined): string | null => (shown ? formatCount(n ?? 0) : null);
  const rows: SheetRow<HistoryFilter>[] = [
    rowOf({ kind: 'all' }, FILTER_LABEL.all, num(counts?.all)),
    rowOf({ kind: 'symptoms' }, FILTER_LABEL.symptoms, num(counts?.symptoms)),
  ];

  const currentCourse = current.kind === 'course' ? current.courseKey : null;
  for (const type of TYPE_SHEET_ORDER) {
    rows.push(rowOf({ kind: 'type', type }, EVENT_TYPES[type].label, num(counts?.byType[type])));
    if (type !== 'medication') continue;
    for (const course of courses) {
      const doses = counts?.courses[course.key];
      if ((doses?.logged ?? 0) === 0 && course.key !== currentCourse) continue;
      rows.push(
        rowOf(
          { kind: 'course', courseKey: course.key },
          course.name,
          num(doses?.logged),
          [courseSpanText(course.days, dates), shown ? notGivenInFullText(doses?.notInFull ?? 0) : null],
          { nested: true },
        ),
      );
    }
  }

  const photographedLine = readingOff
    ? READING_OFF_TEXT
    : shown && notRead !== null
      ? notReadText(notRead)
      : null;
  rows.push(
    rowOf({ kind: 'photographed' }, FILTER_LABEL.photographed, num(counts?.photographed), [photographedLine], {
      section: RECORD_HOLDS_SECTION,
    }),
    rowOf({ kind: 'noted' }, FILTER_LABEL.noted, num(counts?.noted)),
  );
  if (lookLive || current.kind === 'noticed') {
    rows.push(rowOf({ kind: 'noticed' }, EVENT_TYPES.check_in.label, null, [], { section: DAILY_LOOK_SECTION }));
  }
  return rows;
}

export interface WindowSheetInput {
  /** The pet's window facts, or null until they have been read: the rolling windows are
   *  then the whole sheet, with no numbers. */
  facts: WindowFacts | null;
  /** The record's facts over All time, or null until read. */
  recordDays: ReadonlyMap<string, DayFacts> | null;
  /** The filter on screen: each row counts it in that window. */
  filter: HistoryFilter;
  /** False while a search is open. */
  showCounts: boolean;
  /** The owner's local day, for the loading sheet's names. */
  today: string;
}

/**
 * The window sheet (§3.9), top to bottom: HV-3's offered windows (All time, Today, the
 * three rolling windows, then the trial and visit rows only for a pet with one), then the
 * months the record spans, newest first, grouped under their year. Every row counts the
 * filter on screen in that window, except under Noticed (H-9).
 */
export function windowSheetRows(input: WindowSheetInput): SheetRow<HistoryWindowKey>[] {
  const facts = input.facts ?? emptyWindowFacts(null, input.today);
  const counting = input.showCounts && input.facts !== null && input.recordDays !== null;
  const totalOf = (key: HistoryWindowKey): number | null => {
    if (!counting) return null;
    const bounds = windowBounds(key, facts);
    // Null under Noticed: `windowTotalOf` counts nothing there (H-9), so no row does either.
    const total = bounds && input.recordDays ? windowTotalOf(daysIn(input.recordDays, bounds), input.filter) : null;
    return total === null ? null : total.count;
  };
  const rowFor = (key: HistoryWindowKey, section: string | null = null): SheetRow<HistoryWindowKey> | null => {
    const label = windowLabel(key, facts);
    if (label === null) return null;
    const n = totalOf(key);
    return rowOf(key, label.sheetTitle, n === null ? null : formatCount(n), [label.sheetSub], {
      section,
      spokenCount: n === null ? null : spokenCountOf(input.filter, n),
    });
  };

  const rows: SheetRow<HistoryWindowKey>[] = [];
  for (const key of offeredWindows(facts)) {
    const row = rowFor(key);
    if (row) rows.push(row);
  }
  for (const group of monthGroups(facts)) {
    group.months.forEach((key, i) => {
      const row = rowFor(key, i === 0 ? group.subhead : null);
      if (row) rows.push(row);
    });
  }
  return rows;
}

// ── The pills ────────────────────────────────────────────────────────────────────

export interface TypePill {
  label: string;
  /** Formatted, or null: All types and Noticed never carry one, and neither does any
   *  filter before the read answers or while a search is open. */
  count: string | null;
  accessibilityLabel: string;
}

/**
 * The type pill (§3.8: "one pill always names what is filtering"): its words, and the
 * count the count line gives for the same filter and window, from the same sum.
 */
export function typePillOf(input: {
  filter: HistoryFilter;
  courses: readonly HistoryCourse[];
  /** The facts of the window on screen (`daysIn`), or null until read. */
  windowDays: ReadonlyMap<string, DayFacts> | null;
  showCounts: boolean;
}): TypePill {
  const { filter, courses, windowDays, showCounts } = input;
  const label = filterLabelOf(filter, courses);
  const total =
    filter.kind !== 'all' && showCounts && windowDays !== null ? windowTotalOf(windowDays, filter) : null;
  const count = total === null ? null : formatCount(total.count);
  return {
    label,
    count,
    accessibilityLabel: `${TYPE_PILL_PREFIX}: ${label}${count === null ? '' : `, ${count} logged`}`,
  };
}

/**
 * The window pill's words (§3.9): the applied window's short name (*Since Jul 26*). Before
 * the pet's facts are read, a window that needs no facts is named as it always is, and an
 * anchored one by its long name: true while its date is still being read, where *All
 * time* would name a window the list is not about to show.
 */
export function windowPillLabelOf(resolved: ResolvedWindow | null, key: HistoryWindowKey, today: string): string {
  if (resolved !== null) return resolved.label.short;
  if (key.kind === 'trial' || key.kind === 'visit') return ANCHORED_WINDOW_NAMES[key.kind];
  if (key.kind === 'month') {
    const month = recordMonth(key.month, today);
    if (month !== null) return month;
  }
  // All time, Today and the rolling windows need no facts to be named; anything else
  // unreadable is All time, the window `resolveWindow` would apply.
  const empty = emptyWindowFacts(null, today);
  return (windowLabel(key, empty) ?? resolveWindow(key, empty).label).short;
}

/**
 * What VoiceOver reads for the window pill: the window's long name and its date, where the
 * pill itself shows only the short one (*Since Jul 26*). Jordan remembers the trial, not the
 * day it began, and a label is right exactly when it says something the visible text does
 * not (C-8).
 */
export function windowPillSpokenOf(resolved: ResolvedWindow | null, key: HistoryWindowKey, today: string): string {
  if (resolved === null) return `${WINDOW_PILL_PREFIX}: ${windowPillLabelOf(null, key, today)}`;
  const { long, anchor } = resolved.label;
  return `${WINDOW_PILL_PREFIX}: ${anchor === null ? long : `${long}, ${anchor}`}`;
}

// ── The row, whole ───────────────────────────────────────────────────────────────

export interface PinnedRowInput {
  /** The record's answer for the pet on screen, or null while it loads or after it failed:
   *  either way there is nothing to count, and no row may carry a number (C-12). */
  record: HistoryRecordData | null;
  /** The filter on screen. */
  filter: HistoryFilter;
  /** The window the store holds: the owner's choice, applied only when it is offered. */
  window: HistoryWindowKey;
  /** The search the list's query takes (`effectiveSearch`), or null. */
  search: string | null;
  /** The daily look is live for this account and pet (`lookCardLive`). */
  lookLive: boolean;
  /** The owner turned photo reading off (`PHOTO_READING_OFF` until HV-18). */
  readingOff: boolean;
  /** The owner's local day: names the windows while the record has not answered. */
  today: string;
}

export interface PinnedRowView {
  typeRows: SheetRow<HistoryFilter>[];
  typePill: TypePill;
  windowRows: SheetRow<HistoryWindowKey>[];
  windowPill: { label: string; accessibilityLabel: string };
  /** The window the list shows: the applied one, or the store's while its facts load. */
  currentWindow: HistoryWindowKey;
}

/**
 * Everything the pinned row draws, from the record's answer and the scope. Every window is
 * resolved against the answer's own `today`, so the pills and the sheets name the days the
 * numbers were counted over, never a fresher day than the facts.
 */
export function pinnedRowViewOf(input: PinnedRowInput): PinnedRowView {
  const { record, filter, window, search, lookLive, readingOff } = input;
  const facts = record?.windowFacts ?? null;
  const today = facts?.today ?? input.today;
  const resolved = facts ? resolveWindow(window, facts) : null;
  // A record with nothing in it has nothing to count: no number anywhere, since a column of
  // zeros is not a designed empty state (§3.12's new account shows no count line either).
  const counted = record !== null && facts !== null && facts.firstRecordDay !== null ? record : null;
  const windowDays = counted !== null && resolved ? daysIn(counted.recordDays, resolved.bounds) : null;
  const courses = record?.courses ?? [];
  const showCounts = search === null;
  const notRead = counted?.notReadDays && resolved ? sumIn(counted.notReadDays, resolved.bounds) : null;
  return {
    typeRows: typeSheetRows({
      counts: windowDays ? typeSheetCountsOf(windowDays) : null,
      showCounts,
      courses,
      notRead,
      readingOff,
      lookLive,
      current: filter,
      dates: historyDateFormatFor(today),
    }),
    typePill: typePillOf({ filter, courses, windowDays, showCounts }),
    windowRows: windowSheetRows({ facts, recordDays: counted?.recordDays ?? null, filter, showCounts, today }),
    windowPill: {
      label: windowPillLabelOf(resolved, window, today),
      accessibilityLabel: windowPillSpokenOf(resolved, window, today),
    },
    currentWindow: resolved?.key ?? window,
  };
}
