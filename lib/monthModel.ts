// The month's MODEL (Design v2 — the whole day, D2-5 · CUL-1067).
//
// Design authority: `docs/culprit-design-v4-mockups.html` §04 — the month page the PM
// ruled ("LOVE the weekly bars + calendar"), with the data read's three corrections:
// the bars start on the same weekday the rows do, a vomit day keeps its date with the
// count in its corner, and the weight's range is fixed. §05 is the standard every chart
// on the page answers — a mark per fact · a count on every mark · the denominator in
// view · the uncounted disclosed · the window named.
//
// ── ONE MODEL, TWO DRAWINGS ─────────────────────────────────────────────────────
// The weekly bars over the grid and the grid itself read ONE object built here. The
// bars are `weeklyBuckets` (`lib/chartModels.ts`, D2-1) over the same episode and
// logged-day inputs the grid's day marks take, so the count the line speaks, the count
// on the bars and the counts in the corners cannot disagree (C-4: two counts over one
// population partition it; the AC — "the line's count and the bars agree (they read one
// model)"). Nothing here reads a database, a clock or a store: every input is a value
// the caller already holds, so a test fixture is the shape production hands over (C-35).
//
// ── ROWS AND BARS START ON SUNDAY, AND THE NINTH BAR IS THE ROW HOLDING TODAY ──
// Round 3's bars began on Monday over a grid whose rows began on Sunday, so no bar
// matched a row. Here every grid row's Sunday is a week's `startKey`, and the drawn
// weeks END with the row holding the month's last DRAWN day — today's row for the
// current month, the month's last row for a past one — so each bar is a row the reader
// can point at (`barIndexOfRow`). Rows after today's have no bar: a bar over days that
// have not arrived would be a count over a coverage of nothing (the D2-1 pass, B5).
//
// ── DAY KEYS, NOT INSTANTS (C-29) ──────────────────────────────────────────────
// Every day-scoped input is a LOCAL day key (`YYYY-MM-DD`). The month's boundary is
// local midnight, which is the caller's key: this module indexes a key
// zone-independently and never sees an instant, so it cannot shift a day across
// midnight. The reads that produce the keys (`lib/monthReads.ts`) make the one zone
// decision, with `toLocalDayKey` on the device.
//
// ── COVERAGE IS NEVER GATED ON THE THING COUNTED (C-3) ────────────────────────
// `loggedDays` and `episodeDays` are separate inputs, and the grey square comes from the
// first alone. The line's "K days unlogged" is the un-logged days and NOTHING when the
// month is fully covered; a day ahead is `ahead`, never "unlogged" (a day that has not
// happened is not a day nobody logged); a day before the record is `before_record` and
// out of every denominator. What counts as "logged" is the caller's predicate, and the
// caller uses the one the neighbouring Trial panel uses (a feeding OR a
// correlation-symptom day — `lib/patternsTrial.ts`), so the two surfaces one scroll apart
// partition the same days. That predicate includes vomit, so an episode day is a logged
// day by construction of the READ, not by inference here — this module never infers
// "logged" from "had an episode" and never infers "unlogged" from "no episode".

import { dayKeyFromIndex, localDayIndexOf, MONTHS } from './utils';
import { weekdayOfIndex, weekStartIndex, weeklyBuckets, type WeeklyBucketsModel } from './chartModels';
import { dateWord } from './chartCopy';

/** The nine weeks §04 draws over the month. */
export const MONTH_WEEKS = 9;

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

function indexOfKey(key: string, what: string): number {
  const i = DAY_KEY.test(key) ? localDayIndexOf(key) : null;
  if (i == null) throw new Error(`monthModel: ${what} is not a YYYY-MM-DD day key: ${key}`);
  return i;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

/** A day's coverage on the grid. `left_some` is a logged day on which a rated meal was
 *  left unfinished (the paler hairline — §04's legend; Sam: paler, never amber). */
export type MonthCoverage = 'logged' | 'left_some' | 'unlogged' | 'ahead' | 'before_record';

/** The photo layer's per-day fact: nothing, a photographed record, or one the
 *  per-incident read called worth a call. A photographed day with no verdict yet (or one
 *  the read could not reach) is `seen` — never a colour. */
export type MonthPhoto = 'none' | 'seen' | 'worth_a_call';

export interface MonthDay {
  key: string;
  dayOfMonth: number;
  /** The day is in the first or last row but belongs to the neighbouring month. It is
   *  DRAWN (dim, dated) so the row IS the bar above it: an episode on Aug 31 sits in
   *  September's first row and in the bar over it, and hiding it as a blank pad left a bar
   *  of 3 over a row that showed 1 (the adversarial pass on CUL-1067). It is never in
   *  the month's own counts or its line. */
  outsideMonth: boolean;
  /** Episodes on the day. Zero is a day with none, not a missing number. */
  count: number;
  coverage: MonthCoverage;
  /** A medication dose the record says was delivered (given or partial — B-618 D1). */
  medication: boolean;
  photo: MonthPhoto;
  today: boolean;
}

/** One grid row, Sunday → Saturday. Every slot is a day: the neighbouring months' days
 *  in the first and last row are `outsideMonth`. */
export type MonthRow = [MonthDay, MonthDay, MonthDay, MonthDay, MonthDay, MonthDay, MonthDay];

export interface MonthPhotoDay {
  day: string;
  verdict: 'seen' | 'worth_a_call';
}

export interface MonthModelInput {
  /** The shown month. `month` is 0-based, as `Date` counts it. */
  year: number;
  month: number;
  /** Today's local day key. Days after it are `ahead`. */
  today: string;
  /** The record's first day (the pet's earliest entry). Days before it are
   *  `before_record`. Omitted → every arrived day is in the denominator. */
  recordStart?: string | null;
  /** The pet has NO entries at all. Then no day is a day nobody logged — there is no
   *  record for a day to be missing from — so every arrived day is `before_record` and
   *  the line invites the first entry rather than counting weeks of "unlogged" on an
   *  account that is minutes old (the product read on CUL-1067). */
  recordEmpty?: boolean;
  /** One entry PER EPISODE, after the engine's re-log collapse (`episodeDaysOf`). */
  episodeDays: readonly string[];
  /** Days with any logging under the caller's predicate. Duplicates are fine. */
  loggedDays: readonly string[];
  /** Days on which a rated meal was left unfinished. A subset of `loggedDays` in any
   *  honest read (a rated meal is a feeding); treated as logged regardless. */
  leftSomeDays?: readonly string[];
  /** Days with a delivered dose. */
  dosedDays?: readonly string[];
  /** Photographed days, each with the read's verdict where one exists. A day appearing
   *  twice takes the worse verdict — presence escalates, absence never reassures. */
  photoDays?: readonly MonthPhotoDay[];
  /** The trial's start, marked on the bars at its day (kept and said when it falls off
   *  the chart — C-37). */
  trialMark?: { day: string; label: string } | null;
  /** What is counted, lower-case ("vomiting"). */
  noun: string;
}

export interface MonthModel {
  year: number;
  month: number;
  /** "September 2026" — locale-independent, from `MONTHS`. */
  label: string;
  /** The month's first day and its last, as keys. */
  firstKey: string;
  lastKey: string;
  /** The last day the month DRAWS a fact for: today for the current month, the month's
   *  last day for a past one. The window the line names. */
  lastDrawnKey: string;
  /** Today is in this month. */
  isCurrent: boolean;
  /** Every day of the month is still ahead. */
  isAhead: boolean;
  rows: MonthRow[];
  /** The month's days in order, the same objects the rows hold. */
  days: MonthDay[];
  /** The nine Sunday-start weeks ending with `lastDrawnKey`'s week. */
  weekly: WeeklyBucketsModel;
  /** For each grid row, the index of its bar in `weekly.weeks`, or null for a row with
   *  no bar (one wholly ahead, or off the nine-week chart). */
  barIndexOfRow: (number | null)[];
  /** Episodes on the month's drawn days. */
  count: number;
  /** Days with at least one episode among the drawn days. */
  episodeDayCount: number;
  /** Episodes dated on a day of this month that has not arrived — disclosed, never drawn. */
  aheadCount: number;
  /** Arrived days with nothing logged (before-record days excluded). */
  unloggedDays: number;
  beforeRecordDays: number;
  aheadDays: number;
  /** The line above the grid — "Vomiting 6 times on 4 days · through Sep 17 · 2 days
   *  unlogged". Nothing about coverage when fully covered (C-3). */
  line: string;
  /** The line with the symptom layer OFF: the window and its coverage, no count — the
   *  layer leaves the whole card (bars, corners, sentence), the coverage never does. */
  coverageLine: string;
  /** `recordEmpty` echoed, so a renderer can name the state ("nothing logged yet"). */
  recordEmpty: boolean;
  noun: string;
}

/** Days in a Gregorian month, from the calendar and nothing else. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function keyOf(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** "September 2026". */
export function monthLabel(year: number, month: number): string {
  return `${MONTHS[month]} ${year}`;
}

/** The month before / after, normalised across the year. */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(Date.UTC(year, month + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

/** The year and month a day key names. */
export function monthOfKey(key: string): { year: number; month: number } {
  const m = DAY_KEY.exec(key);
  if (!m) throw new Error(`monthModel: not a YYYY-MM-DD day key: ${key}`);
  return { year: Number(m[1]), month: Number(m[2]) - 1 };
}

/** Whether `a` is the same month as or later than `b`. */
export function compareMonths(a: { year: number; month: number }, b: { year: number; month: number }): number {
  return a.year - b.year || a.month - b.month;
}

/** The days a month's read must cover: the nine weeks' first Sunday through the month's
 *  last day — the same span the model draws, so one read feeds both drawings. `today`
 *  decides the last DRAWN day (the current month's weeks end with today's row). */
export function monthReadRange(m: { year: number; month: number }, today: string): { fromKey: string; toKey: string } {
  const first = indexOfKey(keyOf(m.year, m.month, 1), 'firstKey');
  const lastOfMonth = first + daysInMonth(m.year, m.month) - 1;
  const lastDrawn = Math.min(lastOfMonth, indexOfKey(today, 'today'));
  const fromIdx = weekStartIndex(lastDrawn) - 7 * (MONTH_WEEKS - 1);
  return { fromKey: dayKeyFromIndex(Math.min(fromIdx, first)), toKey: dayKeyFromIndex(lastOfMonth) };
}

export function buildMonthModel(input: MonthModelInput): MonthModel {
  const { year, month, noun } = input;
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 0 || month > 11) {
    throw new Error(`monthModel: not a calendar month: ${year}-${month}`);
  }
  const n = daysInMonth(year, month);
  const firstKey = keyOf(year, month, 1);
  const lastKey = keyOf(year, month, n);
  const firstIdx = indexOfKey(firstKey, 'firstKey');
  const lastIdx = firstIdx + n - 1;
  const todayIdx = indexOfKey(input.today, 'today');
  const recordIdx = input.recordStart != null ? indexOfKey(input.recordStart, 'recordStart') : null;

  const isCurrent = todayIdx >= firstIdx && todayIdx <= lastIdx;
  const isAhead = todayIdx < firstIdx;
  const recordEmpty = input.recordEmpty === true;
  const lastDrawnIdx = Math.min(lastIdx, todayIdx);

  const toSet = (keys: readonly string[] | undefined, what: string): Set<number> => {
    const s = new Set<number>();
    for (const k of keys ?? []) s.add(indexOfKey(k, what));
    return s;
  };
  const logged = toSet(input.loggedDays, 'loggedDays[]');
  const leftSome = toSet(input.leftSomeDays, 'leftSomeDays[]');
  const dosed = toSet(input.dosedDays, 'dosedDays[]');
  const photos = new Map<number, MonthPhoto>();
  for (const p of input.photoDays ?? []) {
    const i = indexOfKey(p.day, 'photoDays[].day');
    const prev = photos.get(i);
    // The worse verdict wins: a day with one read worth a call is a day worth a call.
    photos.set(i, prev === 'worth_a_call' ? prev : p.verdict);
  }
  const counts = new Map<number, number>();
  let aheadCount = 0;
  for (const k of input.episodeDays) {
    const i = indexOfKey(k, 'episodeDays[]');
    if (i > todayIdx) {
      // Only the month's own days are disclosed as "dated ahead": a neighbouring month's
      // future day is not this month's claim.
      if (i >= firstIdx && i <= lastIdx) aheadCount += 1;
      continue;
    }
    counts.set(i, (counts.get(i) ?? 0) + 1);
  }

  const dayAt = (i: number, outsideMonth: boolean): MonthDay => {
    let coverage: MonthCoverage;
    if (i > todayIdx) coverage = 'ahead';
    else if (recordEmpty || (recordIdx != null && i < recordIdx)) coverage = 'before_record';
    else if (leftSome.has(i)) coverage = 'left_some';
    else if (logged.has(i)) coverage = 'logged';
    else coverage = 'unlogged';
    return {
      key: dayKeyFromIndex(i),
      dayOfMonth: Number(dayKeyFromIndex(i).slice(8, 10)),
      outsideMonth,
      count: coverage === 'ahead' ? 0 : (counts.get(i) ?? 0),
      coverage,
      medication: coverage !== 'ahead' && dosed.has(i),
      photo: coverage === 'ahead' ? 'none' : (photos.get(i) ?? 'none'),
      today: i === todayIdx,
    };
  };

  const days: MonthDay[] = [];
  let count = 0;
  let episodeDayCount = 0;
  let unloggedDays = 0;
  let beforeRecordDays = 0;
  let aheadDays = 0;
  for (let d = 0; d < n; d++) {
    const day = dayAt(firstIdx + d, false);
    if (day.coverage === 'ahead') aheadDays += 1;
    else if (day.coverage === 'before_record') beforeRecordDays += 1;
    else if (day.coverage === 'unlogged') unloggedDays += 1;
    if (day.count > 0) {
      count += day.count;
      episodeDayCount += 1;
    }
    days.push(day);
  }

  // The grid: Sunday-start rows; the neighbouring months' days in the first and last
  // row are drawn as `outsideMonth`, so every row is the seven days its bar counts.
  const lead = weekdayOfIndex(firstIdx);
  const cells: MonthDay[] = [];
  for (let d = lead; d > 0; d--) cells.push(dayAt(firstIdx - d, true));
  cells.push(...days);
  for (let i = lastIdx + 1; cells.length % 7 !== 0; i++) cells.push(dayAt(i, true));
  const rows: MonthRow[] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7) as MonthRow);

  // The bars: nine Sunday-start weeks ending with the row holding the last drawn day.
  const lastDrawnKey = dayKeyFromIndex(lastDrawnIdx);
  const weekly = weeklyBuckets({
    episodeDays: input.episodeDays,
    loggedDays: input.loggedDays,
    weeksEnding: lastDrawnKey,
    today: input.today,
    weeks: MONTH_WEEKS,
    mark: input.trialMark ?? undefined,
    recordStart: input.recordStart ?? undefined,
  });
  const firstWeekStart = indexOfKey(weekly.firstKey, 'weekly.firstKey');
  const barIndexOfRow = rows.map((_, r) => {
    const rowSunday = weekStartIndex(firstIdx) + 7 * r;
    const w = (rowSunday - firstWeekStart) / 7;
    if (!Number.isInteger(w) || w < 0 || w >= weekly.weeks.length) return null;
    // A row wholly ahead has no bar even when the chart could index it (it cannot: the
    // chart ends with the last drawn day's week — but the rule is stated, not inferred).
    if (rowSunday > lastDrawnIdx) return null;
    return w;
  });

  const lineFacts: LineFacts = {
    noun,
    count,
    episodeDayCount,
    aheadCount,
    unloggedDays,
    beforeRecordDays,
    isAhead,
    recordEmpty,
    allBeforeRecord: !isAhead && beforeRecordDays > 0 && beforeRecordDays === n - aheadDays,
    lastDrawnKey,
  };
  const line = buildLine(lineFacts);
  const coverageLine = buildLine(lineFacts, { withCount: false });

  return {
    year,
    month,
    label: monthLabel(year, month),
    firstKey,
    lastKey,
    lastDrawnKey,
    isCurrent,
    isAhead,
    rows,
    days,
    weekly,
    barIndexOfRow,
    count,
    episodeDayCount,
    aheadCount,
    unloggedDays,
    beforeRecordDays,
    aheadDays,
    line,
    coverageLine,
    recordEmpty,
    noun,
  };
}

interface LineFacts {
  noun: string;
  count: number;
  episodeDayCount: number;
  aheadCount: number;
  unloggedDays: number;
  beforeRecordDays: number;
  isAhead: boolean;
  recordEmpty: boolean;
  allBeforeRecord: boolean;
  lastDrawnKey: string;
}

/**
 * The line above the grid, to §05: the count · the window named · the uncounted
 * disclosed. "Vomiting 6 times on 4 days · through Sep 17 · 2 days unlogged".
 *
 * C-3: the coverage clause is the UN-LOGGED days and nothing when fully covered — a
 * "28 of 28" beside a partial enumeration would be a claim about the enumeration. A
 * month with nothing logged says so through its unlogged days, never through the
 * absence of a count: "No vomiting logged · through Sep 17 · 17 days unlogged" reads
 * as unlogged, not quiet. Days before the record are named separately, because they are
 * not days nobody logged; and a month wholly before the record says only that.
 */
export function buildLine(f: LineFacts, opts: { withCount?: boolean } = {}): string {
  const withCount = opts.withCount !== false;
  if (f.isAhead) return 'Nothing yet · this month has not started';
  // An empty record is an invitation, never a count of days nobody logged (Principle 5).
  if (f.recordEmpty) return 'Nothing logged yet · the month fills in from the first entry';
  if (f.allBeforeRecord) return 'Before the record began';
  const parts: string[] = [];
  if (!withCount) parts.push(`Through ${dateWord(f.lastDrawnKey)}`);
  else if (f.count === 0) parts.push(`No ${f.noun} logged`, `through ${dateWord(f.lastDrawnKey)}`);
  else {
    parts.push(
      `${capitalize(f.noun)} ${f.count} ${plural(f.count, 'time')} on ${f.episodeDayCount} ${plural(f.episodeDayCount, 'day')}`,
      `through ${dateWord(f.lastDrawnKey)}`,
    );
  }
  if (f.unloggedDays > 0) parts.push(`${f.unloggedDays} ${plural(f.unloggedDays, 'day')} unlogged`);
  if (f.beforeRecordDays > 0) parts.push(`${f.beforeRecordDays} ${plural(f.beforeRecordDays, 'day')} before the record`);
  if (withCount && f.aheadCount > 0) parts.push(`${f.aheadCount} dated ahead, not drawn`);
  return parts.join(' · ');
}

/** The month in one sentence for a screen reader: the line, then the totals of the
 *  layers that are ON — the eye and the ear hear the same layers (DayMark's own rule; a
 *  layer-blind label spoke medication days the grid did not draw). */
export function monthA11yLabel(model: MonthModel, layers: { meds: boolean; photos: boolean } = { meds: true, photos: true }): string {
  const dosed = model.days.filter((d) => d.medication).length;
  const photographed = model.days.filter((d) => d.photo !== 'none').length;
  const called = model.days.filter((d) => d.photo === 'worth_a_call').length;
  const parts = [`${model.label}.`, `${model.line}.`];
  if (layers.meds && dosed > 0) parts.push(`Medication on ${dosed} ${plural(dosed, 'day')}.`);
  if (layers.photos && photographed > 0) {
    parts.push(
      `Photos on ${photographed} ${plural(photographed, 'day')}${called > 0 ? `, ${called} read as worth a call` : ''}.`,
    );
  }
  return parts.join(' ');
}
