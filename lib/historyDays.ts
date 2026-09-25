// History v2's numbers, pure (CUL-1161 / HV-4; docs/nyx-history-v2-requirements.md §3.2,
// §3.5, §3.7, §5.2). The one place every count History shows is derived: the count line,
// the type sheet's option counts, each day header and the week strip's `DayFacts`. The
// reads live in `lib/historyQueries.ts`; everything here is a function of what they return,
// so the rules are table-tested without a screen (C-41: a rule whose effect lands below the
// fold is asserted over data, never through a list).
//
// ── ONE POPULATION (R-1) ─────────────────────────────────────────────────────────
// Every count is over the same rows: every surviving event except a look, the population
// the Patterns month counts (`lib/monthReads.ts`). A look never enters a count, a coverage
// line or a gap line here (H-9; the daily look spec §5.6); it is carried only as the day's
// `looked` flag, for the Noticed filter's dates. A vet visit is not an event and never
// enters a count or a coverage line either (`guards/visitReaders.test.ts`, the vet visits
// spec's AC 10): it reaches History only as a date-only item, drawn at the top of its day.
//
// ── ONE COUNT PER QUESTION ───────────────────────────────────────────────────────
// `dayCountFor` is the only answer to "how many rows does this filter show on this day",
// and the count line, the type sheet and the day header all sum it. A meal left unfinished
// is the intake lens's own predicate (`qualifyingIntakeMeals` + `isFinishedMeal`), a dose is
// keyed by the vet report's course grain (`attributeDoses` into `deriveMedicationCourses`'s
// keys), and a same-minute duplicate is the report's own rule (`lib/sameMinuteDuplicates.ts`).
// Nothing here restates a predicate another module owns (R-3).
//
// ── ABSENCE ONLY OVER WATCHED DAYS ───────────────────────────────────────────────
// Coverage and gap lines say what did NOT happen, so they carry the tightest rules: an
// unlogged day is counted only on or after the pet's first record and never today; a
// "no vomit logged" line spans only closed, logged days, splits at an unlogged day and
// never starts before the first row of its kind; nothing is ever said under Noticed.
//
// Day keys are local 'YYYY-MM-DD' (the owner's midnight, C-29). Fixed-width keys compare
// correctly as text; an instant never does (C-40), so every instant is parsed first.

import { EVENT_TYPES, SYMPTOM_TYPES, type EventTypeKey } from '../constants/eventTypes';
import { isFinishedMeal, qualifyingIntakeMeals, type AnalyticsMeal } from './analytics';
import { episodeDaysOf } from './chartModels';
import { attributeDoses, type AttributableDose, type RegimenWindow } from './medications';
import type { MedicationCourse } from './medicationHistory';
import { TIMING_SYMPTOM_TYPE } from './patternsTiming';
import type { HistoryVisitRow } from './vetVisits';
import type { BoundaryMarker } from './feedingArrangements';
import { collapseSameMinute } from './sameMinuteDuplicates';
import { dayKeyFromIndex, localDayIndexOf, toLocalDayKey } from './utils';

// ── Days ─────────────────────────────────────────────────────────────────────────

/** A span of local days, inclusive at both ends: HV-3's `WindowBounds`, structurally. */
export interface DayRange {
  fromDay: string;
  toDay: string;
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** A well-formed local day key (shape and calendar both: '2026-02-30' is not one). */
export function isDayKey(value: string | null | undefined): value is string {
  return typeof value === 'string' && DAY_KEY.test(value) && localDayIndexOf(value) !== null;
}

/** The day `days` after (or before, when negative) a day key. The key must be valid. */
export function shiftDay(key: string, days: number): string {
  const index = localDayIndexOf(key);
  if (index === null || !DAY_KEY.test(key)) throw new Error(`historyDays: not a day key: ${key}`);
  return dayKeyFromIndex(index + days);
}

/** The local day an instant falls on, or null when it does not parse. Parsed, never read
 *  off the string: `…Z` and `…+00:00` spell one instant two ways (C-40). */
export function dayOfInstant(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? toLocalDayKey(new Date(ms)) : null;
}

/** A stored date that may be a DATE column ('YYYY-MM-DD', a calendar day already, taken
 *  verbatim) or an instant (placed on its local day). Never `new Date(key)`: that reads a
 *  bare day as UTC midnight, the previous day for every owner behind UTC (B-441). */
function dayOfStored(value: string | null | undefined): string | null {
  if (!value) return null;
  if (DAY_KEY.test(value)) return isDayKey(value) ? value : null;
  return dayOfInstant(value);
}

export function inRange(day: string, range: DayRange): boolean {
  return day >= range.fromDay && day <= range.toDay;
}

function laterDay(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a > b ? a : b;
}

function earlierDay(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a < b ? a : b;
}

/** Every day key from `hi` down to `lo`, inclusive; empty when the range is inverted. */
function daysDescending(lo: string, hi: string): string[] {
  const out: string[] = [];
  if (hi < lo) return out;
  for (let day = hi; day >= lo; day = shiftDay(day, -1)) out.push(day);
  return out;
}

// ── Filters ──────────────────────────────────────────────────────────────────────

/** An event type History can filter to on its own. A look is not one: it has its own
 *  filter (Noticed) and is never counted (H-9). */
export type HistoryTypeKey = Exclude<EventTypeKey, 'check_in'>;

/** The type pill's filter (§3.8). The window and the search are separate scopes. */
export type HistoryFilter =
  | { kind: 'all' }
  | { kind: 'type'; type: HistoryTypeKey }
  | { kind: 'symptoms' }
  | { kind: 'course'; courseKey: string }
  | { kind: 'photographed' }
  | { kind: 'noted' }
  | { kind: 'noticed' };

/** Every filterable type, derived from the one enum so a new leaf is filterable, counted
 *  and nouned the day it ships (the type sheet shows 0 rather than hiding one). */
export const HISTORY_TYPE_KEYS: readonly HistoryTypeKey[] = (Object.keys(EVENT_TYPES) as EventTypeKey[]).filter(
  (k): k is HistoryTypeKey => k !== 'check_in',
);

function isKnownType(type: string): type is EventTypeKey {
  return Object.prototype.hasOwnProperty.call(EVENT_TYPES, type);
}

/** The filters whose rows are symptoms: the rose one (a symptom type, or All symptoms).
 *  `SYMPTOM_TYPES` is the root predicate; `stool_normal` is not in it, so the Stool filter
 *  is neutral, as its rows are. */
export function isSymptomFilter(filter: HistoryFilter): boolean {
  return filter.kind === 'symptoms' || (filter.kind === 'type' && SYMPTOM_TYPES.has(filter.type));
}

// ── The population row and the day's facts ───────────────────────────────────────

/** One population row: the fields every count reads, as `lib/historyQueries.ts` returns
 *  them. The two flags are computed in SQL by the same fragments the page query filters
 *  with, so a count and a filtered list can never disagree about a row. */
export interface PopulationRow {
  id: string;
  eventType: string;
  occurredAt: string;
  foodItemId: string | null;
  /** `food_items.food_type`: 'meal' | 'treat' | 'other' | null. */
  foodType: string | null;
  intakeRating: string | null;
  /** A dose child exists (`medication_administrations`). A medication event with no dose
   *  row counts as a medication, never as a dose of any course. */
  isDose: boolean;
  medicationId: string | null;
  medicationItemId: string | null;
  adherence: string | null;
  hasPhoto: boolean;
  hasNote: boolean;
}

export interface DoseFacts {
  /** Every dose row, whatever its chip (§3.8: the course's count is not `dosesTowardTarget`). */
  logged: number;
  /** Recorded Partial, Missed or Refused. A dose with no chip is never counted here: the
   *  broken line keys on a recorded state, never on a missing one (§3.4). */
  notInFull: number;
}

/** One local day's facts: the week strip's only input, and the unit every count sums (§5.2). */
export interface DayFacts {
  day: string;
  /** The population: every row but a look. */
  total: number;
  /** Per known type. A stored type this build does not know counts in `total` only (the
   *  §8 degradation contract: counted, never mislabeled). */
  byType: Partial<Record<EventTypeKey, number>>;
  /** Qualifying meals (rated, never a treat, never free-fed) rated below Most. */
  mealsNotFinished: number;
  /** Dose rows by course key (the vet report's course grain). */
  doses: Record<string, DoseFacts>;
  photographed: number;
  noted: number;
  /** A look was answered this day. Shown as a date under Noticed; never counted. */
  looked: boolean;
  /** A vomiting EPISODE began this day: the Patterns month's own mark (`episodeDaysOf`,
   *  re-logs inside the engine's gap are one episode, dated by its first row). A bout that
   *  starts at 23:10 and is logged again at 00:40 marks the first day only, so the strip,
   *  which marks what the month marks under All types (§3.4), can never disagree with it.
   *  The day's rows still count on the day they were logged (`byType`). */
  vomitEpisode: boolean;
}

export function emptyDayFacts(day: string): DayFacts {
  return {
    day,
    total: 0,
    byType: {},
    mealsNotFinished: 0,
    doses: {},
    photographed: 0,
    noted: 0,
    looked: false,
    vomitEpisode: false,
  };
}

/** A dose's fields, for the course key. */
export interface DoseRow {
  id: string;
  medicationId: string | null;
  medicationItemId: string | null;
  adherence: string | null;
  occurredAt: string;
}

/** The key `deriveMedicationCourses` gives a dose that attaches to no regimen
 *  (`lib/medicationHistory.ts`, "2. Dose-derived courses"). Mirrored rather than imported
 *  because the derivation exposes courses, not each dose's membership; it is the same
 *  question (which course holds this dose), so C-34 allows the mirror, and
 *  `historyDays.test.ts` drives both over one record so a drift reds. */
function orphanCourseKey(medicationItemId: string | null): string {
  return `item:${medicationItemId ?? 'unspecified'}`;
}

/**
 * Each dose's course key, by event id: the regimen's id when `attributeDoses` (the one
 * attribution pass) places the dose on a regimen, else `item:<drug>` / `item:unspecified`.
 * Attribution is per dose (an explicit link, else the same drug in the regimen's window),
 * so a window's doses key exactly as they do over the whole record.
 */
export function courseKeysOf(doses: readonly DoseRow[], regimens: readonly RegimenWindow[]): Map<string, string> {
  const idOf = new Map<AttributableDose, string>();
  const attributable = doses.map((d) => {
    const a: AttributableDose = {
      medication_id: d.medicationId,
      medication_item_id: d.medicationItemId,
      adherence: d.adherence,
      deleted_at: null,
      occurred_at: d.occurredAt,
    };
    idOf.set(a, d.id);
    return a;
  });
  const { grouped, unattributed } = attributeDoses([...regimens], attributable);
  const out = new Map<string, string>();
  for (const [regimenId, list] of grouped) {
    for (const a of list) {
      const id = idOf.get(a);
      if (id !== undefined) out.set(id, regimenId);
    }
  }
  for (const a of unattributed) {
    const id = idOf.get(a);
    if (id !== undefined) out.set(id, orphanCourseKey(a.medication_item_id));
  }
  return out;
}

const NOT_IN_FULL: ReadonlySet<string> = new Set(['partial', 'missed', 'refused']);

export interface DayFactsInput {
  /** The population rows read for the range (a day of slack either side is fine: rows
   *  whose local day falls outside `range` are ignored). */
  rows: readonly PopulationRow[];
  /** `looks.local_day` of every surviving look: the one day key every surface counts a
   *  look on (the daily look spec), never re-derived from an instant. */
  lookDays: readonly string[];
  range: DayRange;
  /** Food ids currently free-fed for the pet: the intake lens's own exclusion. */
  freeFedFoodIds: ReadonlySet<string>;
  /** The pet's regimens, every status, for the course keys. */
  regimens: readonly RegimenWindow[];
}

/** The facts for every day of `range` that holds a population row or a look. A day absent
 *  from the map holds nothing: read it through `dayFactsOn`. */
export function buildDayFacts(input: DayFactsInput): Map<string, DayFacts> {
  const { rows, lookDays, range, freeFedFoodIds, regimens } = input;
  const out = new Map<string, DayFacts>();
  const factsOf = (day: string): DayFacts => {
    let f = out.get(day);
    if (!f) {
      f = emptyDayFacts(day);
      out.set(day, f);
    }
    return f;
  };

  const courseKeys = courseKeysOf(
    rows.filter((r) => r.isDose).map((r) => ({
      id: r.id,
      medicationId: r.medicationId,
      medicationItemId: r.medicationItemId,
      adherence: r.adherence,
      occurredAt: r.occurredAt,
    })),
    regimens,
  );

  const meals: AnalyticsMeal[] = [];
  const mealDay = new Map<AnalyticsMeal, string>();
  for (const r of rows) {
    const day = dayOfInstant(r.occurredAt);
    if (day === null || !inRange(day, range)) continue;
    const f = factsOf(day);
    f.total += 1;
    if (isKnownType(r.eventType)) f.byType[r.eventType] = (f.byType[r.eventType] ?? 0) + 1;
    if (r.hasPhoto) f.photographed += 1;
    if (r.hasNote) f.noted += 1;
    const key = courseKeys.get(r.id);
    if (key !== undefined) {
      const d = f.doses[key] ?? (f.doses[key] = { logged: 0, notInFull: 0 });
      d.logged += 1;
      if (r.adherence !== null && NOT_IN_FULL.has(r.adherence)) d.notInFull += 1;
    }
    if (r.eventType === 'meal') {
      const meal: AnalyticsMeal = {
        ms: Date.parse(r.occurredAt),
        foodItemId: r.foodItemId,
        foodLabel: null,
        foodType: r.foodType,
        primaryProtein: null,
        intakeRating: r.intakeRating,
      };
      meals.push(meal);
      mealDay.set(meal, day);
    }
  }
  // The intake lens's own qualifying set and finished predicate, so the header's "meals
  // not finished", the strip's broken line and the Meals calendar count the same meals.
  for (const meal of qualifyingIntakeMeals(meals, freeFedFoodIds)) {
    if (isFinishedMeal(meal)) continue;
    const day = mealDay.get(meal);
    if (day !== undefined) factsOf(day).mealsNotFinished += 1;
  }
  for (const day of lookDays) {
    if (isDayKey(day) && inRange(day, range)) factsOf(day).looked = true;
  }
  // Episodes over every row read, the slack included, exactly as the month reads them: a
  // bout that began before the window marks no day inside it.
  const vomits = rows
    .filter((r) => r.eventType === TIMING_SYMPTOM_TYPE)
    .map((r) => ({ ms: Date.parse(r.occurredAt) }));
  for (const day of episodeDaysOf(vomits, (ms) => toLocalDayKey(new Date(ms)))) {
    if (inRange(day, range)) factsOf(day).vomitEpisode = true;
  }
  return out;
}

/** A day's facts, or an empty day's when nothing was logged on it. */
export function dayFactsOn(days: ReadonlyMap<string, DayFacts>, day: string): DayFacts {
  return days.get(day) ?? emptyDayFacts(day);
}

// ── Counts ───────────────────────────────────────────────────────────────────────

function symptomCountOf(f: DayFacts): number {
  let n = 0;
  for (const t of SYMPTOM_TYPES) n += f.byType[t] ?? 0;
  return n;
}

/**
 * How many of a day's rows a filter shows: THE count (R-1). The day header's filtered count,
 * the count line's sum, the type sheet's option count and the strip's filtered kind all read
 * it. Null under Noticed, which counts nothing (H-9).
 */
export function dayCountFor(f: DayFacts, filter: HistoryFilter): number | null {
  switch (filter.kind) {
    case 'all':
      return f.total;
    case 'type':
      return f.byType[filter.type] ?? 0;
    case 'symptoms':
      return symptomCountOf(f);
    case 'course':
      return f.doses[filter.courseKey]?.logged ?? 0;
    case 'photographed':
      return f.photographed;
    case 'noted':
      return f.noted;
    case 'noticed':
      return null;
  }
}

export interface WindowTotal {
  /** Rows the filter shows across the window. */
  count: number;
  /** Days with at least one of them: "13 vomits on 11 days". */
  days: number;
}

/** A filter's total over the facts' window, or null under Noticed. */
export function windowTotalOf(days: ReadonlyMap<string, DayFacts>, filter: HistoryFilter): WindowTotal | null {
  if (filter.kind === 'noticed') return null;
  let count = 0;
  let dayCount = 0;
  for (const f of days.values()) {
    const n = dayCountFor(f, filter) ?? 0;
    count += n;
    if (n > 0) dayCount += 1;
  }
  return { count, days: dayCount };
}

/** The type sheet's counts for the current window (§3.8): every option, zero included. */
export interface TypeSheetCounts {
  all: number;
  symptoms: number;
  byType: Record<HistoryTypeKey, number>;
  /** Only courses with a dose row in the window, by course key: a course with none is not
   *  an option (the sheet's sub-rows, PMD-17). `logged` is the sub-row's count; `notInFull`
   *  is named after its span (CUL-1193, `notGivenInFullText`). */
  courses: Record<string, DoseFacts>;
  photographed: number;
  noted: number;
}

export function typeSheetCountsOf(days: ReadonlyMap<string, DayFacts>): TypeSheetCounts {
  const byType = {} as Record<HistoryTypeKey, number>;
  for (const t of HISTORY_TYPE_KEYS) byType[t] = 0;
  const out: TypeSheetCounts = { all: 0, symptoms: 0, byType, courses: {}, photographed: 0, noted: 0 };
  for (const f of days.values()) {
    out.all += f.total;
    out.symptoms += symptomCountOf(f);
    for (const t of HISTORY_TYPE_KEYS) out.byType[t] += f.byType[t] ?? 0;
    for (const [key, d] of Object.entries(f.doses)) {
      const c = out.courses[key] ?? (out.courses[key] = { logged: 0, notInFull: 0 });
      c.logged += d.logged;
      c.notInFull += d.notInFull;
    }
    out.photographed += f.photographed;
    out.noted += f.noted;
  }
  return out;
}

/** A filter whose rows are doses: a course, or Medication. Its count reads "logged", never
 *  "doses", because it counts every dose row whatever its chip and a vet reads "16 doses"
 *  as 16 given (CUL-1193, GAP-26). */
function countsDoses(filter: HistoryFilter): boolean {
  return filter.kind === 'course' || (filter.kind === 'type' && filter.type === 'medication');
}

/**
 * How many of a dose filter's rows over the window were recorded Partial, Missed or Refused:
 * the subset the count line names beside "N logged" (CUL-1193). A course counts its own;
 * Medication counts every course's. Null for any other filter.
 *
 * Under Medication this is a subset of the count because a dose row always hangs off a
 * medication event: migration 020 makes the dose an `event_type = 'medication'` row,
 * `insertMedicationDose` is its one writer, and nothing re-types an event. A dose row on
 * another type would count here and not in the list; no write path makes one.
 */
export function notInFullOf(days: ReadonlyMap<string, DayFacts>, filter: HistoryFilter): number | null {
  if (!countsDoses(filter)) return null;
  let n = 0;
  for (const f of days.values()) {
    if (filter.kind === 'course') n += f.doses[filter.courseKey]?.notInFull ?? 0;
    else for (const d of Object.values(f.doses)) n += d.notInFull;
  }
  return n;
}

// ── Coverage ─────────────────────────────────────────────────────────────────────

export interface CoverageInput {
  days: ReadonlyMap<string, DayFacts>;
  /** The window. */
  range: DayRange;
  /** The pet's first record: the population's first day, never a look's. */
  recordStartDay: string | null;
  today: string;
  /** A course's own days, when the filter is a course (§3.2: its coverage is over them). */
  within?: CourseDays | null;
}

/**
 * The window's unlogged days, newest first: days with nothing in the population, from the
 * later of the window's start and the pet's first record (and a course's start) through
 * yesterday. Today is never unlogged; before the record, nothing is claimed (GAP-24). A day
 * holding only a look or a vet visit IS unlogged: neither is an event of the record.
 */
export function unloggedDaysOf(input: CoverageInput): string[] {
  const { days, range, recordStartDay, today, within } = input;
  if (recordStartDay === null || !isDayKey(today) || !isDayKey(range.fromDay) || !isDayKey(range.toDay)) return [];
  let lo: string | null = laterDay(range.fromDay, recordStartDay);
  let hi: string | null = earlierDay(range.toDay, shiftDay(today, -1));
  if (within) {
    if (within.fromDay === null) return [];
    lo = laterDay(lo, within.fromDay);
    hi = earlierDay(hi, within.toDay);
  }
  if (lo === null || hi === null) return [];
  return daysDescending(lo, hi).filter((day) => (days.get(day)?.total ?? 0) === 0);
}

// ── Same-minute duplicates ───────────────────────────────────────────────────────

export interface DuplicateCounts {
  /** Rows in the window the vet report's rule drops as duplicates. */
  total: number;
  /** The same, by stored event type. */
  byType: Partial<Record<string, number>>;
}

/**
 * The rows inside `range` the vet report would drop as same-minute duplicates, by the
 * report's own rule (PMD-10). `rows` should carry the day of slack either side of the
 * window the population read already holds: a cluster is anchored on its first member, and
 * the report reads past the window's edge, so the rows just outside it decide which rows
 * inside it pair up. Only in-window rows are counted.
 */
export function duplicateCountsOf(rows: readonly PopulationRow[], range: DayRange): DuplicateCounts {
  const inWindow = new Set<string>();
  const typeOf = new Map<string, string>();
  for (const r of rows) {
    typeOf.set(r.id, r.eventType);
    const day = dayOfInstant(r.occurredAt);
    if (day !== null && inRange(day, range)) inWindow.add(r.id);
  }
  const { droppedEventIds } = collapseSameMinute(
    rows.map((r) => ({ id: r.id, type: r.eventType, occurredAt: r.occurredAt, foodItemId: r.foodItemId })),
    { isInWindow: (e) => inWindow.has(e.id) },
  );
  const out: DuplicateCounts = { total: 0, byType: {} };
  for (const id of droppedEventIds) {
    if (!inWindow.has(id)) continue;
    const type = typeOf.get(id);
    if (type === undefined) continue;
    out.total += 1;
    out.byType[type] = (out.byType[type] ?? 0) + 1;
  }
  return out;
}

/**
 * The duplicates a filter's count line may disclose, or null where it discloses none.
 * Photographed and With a note say nothing: which member of a pair the report keeps depends
 * on whose photo read completed, which the phone does not hold, so the number could name the
 * wrong row. A dose never pairs (its identity is on its child row), so a course reads 0.
 */
export function duplicatesFor(d: DuplicateCounts, filter: HistoryFilter): number | null {
  switch (filter.kind) {
    case 'all':
      return d.total;
    case 'type':
      return d.byType[filter.type] ?? 0;
    case 'symptoms': {
      let n = 0;
      for (const t of SYMPTOM_TYPES) n += d.byType[t] ?? 0;
      return n;
    }
    case 'course':
      return 0;
    case 'photographed':
    case 'noted':
    case 'noticed':
      return null;
  }
}

// ── The record's first days ──────────────────────────────────────────────────────

/** First days over the WHOLE record, not the window: the bounds absence may not cross. */
export interface FirstDays {
  /** The pet's first record: the population's first day. A look never starts the record
   *  (it would stretch a coverage line it may not join, §5.6). */
  record: string | null;
  /** The first answered look (`looks.local_day`): the Noticed filter's own start. */
  look: string | null;
  /** By stored event type. */
  byType: Partial<Record<string, string>>;
  symptoms: string | null;
  photographed: string | null;
  noted: string | null;
}

/** One stored type's earliest instants over the whole record, in epoch ms (parsed, C-40). */
export interface TypeFirsts {
  eventType: string;
  firstMs: number | null;
  firstPhotoMs: number | null;
  firstNoteMs: number | null;
}

function dayOfMs(ms: number | null): string | null {
  return ms !== null && Number.isFinite(ms) ? toLocalDayKey(new Date(ms)) : null;
}

function minMs(values: readonly (number | null)[]): number | null {
  let out: number | null = null;
  for (const v of values) if (v !== null && Number.isFinite(v) && (out === null || v < out)) out = v;
  return out;
}

/** The record's first days, from each type's earliest instants and the first look's day. */
export function firstDaysOf(perType: readonly TypeFirsts[], firstLookDay: string | null): FirstDays {
  const byType: Partial<Record<string, string>> = {};
  for (const t of perType) {
    const day = dayOfMs(t.firstMs);
    if (day !== null) byType[t.eventType] = day;
  }
  const symptomTypes = perType.filter((t) => isKnownType(t.eventType) && SYMPTOM_TYPES.has(t.eventType));
  return {
    record: dayOfMs(minMs(perType.map((t) => t.firstMs))),
    look: isDayKey(firstLookDay) ? firstLookDay : null,
    byType,
    symptoms: dayOfMs(minMs(symptomTypes.map((t) => t.firstMs))),
    photographed: dayOfMs(minMs(perType.map((t) => t.firstPhotoMs))),
    noted: dayOfMs(minMs(perType.map((t) => t.firstNoteMs))),
  };
}

/** The first day a filter has anything to show: a gap line never starts before it (§3.5). */
export function firstDayFor(firsts: FirstDays, filter: HistoryFilter, course: CourseDays | null): string | null {
  switch (filter.kind) {
    case 'all':
      return firsts.record;
    case 'type':
      return firsts.byType[filter.type] ?? null;
    case 'symptoms':
      return firsts.symptoms;
    case 'course':
      return course?.fromDay ?? null;
    case 'photographed':
      return firsts.photographed;
    case 'noted':
      return firsts.noted;
    case 'noticed':
      return firsts.look;
  }
}

/** What the queries hand the screen for one window: every number derives from this. */
export interface HistoryFacts {
  range: DayRange;
  days: ReadonlyMap<string, DayFacts>;
  firsts: FirstDays;
  duplicates: DuplicateCounts;
}

// ── Courses ──────────────────────────────────────────────────────────────────────

export interface CourseDays {
  /** The course's first day: its own start, or its first dose when that is earlier. */
  fromDay: string | null;
  /** Its last day, or null while it runs (a regimen the owner has not ended). */
  toDay: string | null;
}

/**
 * A course's days: the strip's bounds, the course filter's coverage and gap lines, and the
 * count line's "Jul 1 – Sep 5" / "since Jul 16". A regimen runs from its start until the
 * owner ends it, and an ending is only ever the owner's (the med history spec's H1), so an
 * unended regimen has no last day. A course derived from doses alone spans its doses. A dose
 * linked to a regimen can predate its start or outlive its end (B-153), so the span always
 * covers the evidence.
 */
export function courseDaysOf(course: MedicationCourse): CourseDays {
  const fromDay = earlierDay(dayOfStored(course.startedAt), course.firstDoseDay);
  if (course.source === 'regimen' && course.end.kind !== 'ended') return { fromDay, toDay: null };
  const endedDay = course.end.kind === 'ended' ? dayOfStored(course.end.endedAt) : null;
  return { fromDay, toDay: laterDay(endedDay, course.lastDoseDay) ?? fromDay };
}

/** A course as History names and bounds it. */
export interface HistoryCourse {
  key: string;
  name: string;
  source: 'regimen' | 'doses';
  isActive: boolean;
  /** A regimen's own start day (its date-only item); null for a course of doses alone. */
  startedDay: string | null;
  days: CourseDays;
}

export function historyCourseOf(course: MedicationCourse, name: string): HistoryCourse {
  return {
    key: course.key,
    name,
    source: course.source,
    isActive: course.isActive,
    startedDay: course.source === 'regimen' ? dayOfStored(course.startedAt) : null,
    days: courseDaysOf(course),
  };
}

// ── Copy ─────────────────────────────────────────────────────────────────────────
// Placeholders for HV-12's copy pass, gathered here so that pass edits one place. Dates
// arrive through `HistoryDateFormat`, which the screen fills from `lib/recordDates.ts` (the
// one formatter, H-10), so no date on the screen is formatted twice.

/** The one date formatter, injected (H-10). */
export interface HistoryDateFormat {
  /** 'Sep 16'; outside the current year, 'Dec 31, 2025'. */
  day(key: string): string;
  /** 'Sun, Sep 20': a single day's gap line. */
  weekday(key: string): string;
  /** 'Sep 13 – 16', 'Jul 1 – Sep 5', 'Dec 27, 2025 – Jan 2': the year once per range. */
  range(fromKey: string, toKey: string): string;
}

/** Nouns a label cannot give. Every other type counts as its label, lowercased, with an
 *  s for many (vomit, loose stool, stool, cough, sneeze, meal, weight), so a new leaf is
 *  nouned the day it ships instead of missing from a map. */
const NOUN_OVERRIDES: Partial<Record<HistoryTypeKey, readonly [string, string]>> = {
  medication: ['dose', 'doses'],
  other: ['other entry', 'other entries'],
  lethargy: ['lethargy entry', 'lethargy entries'],
  itch: ['itch', 'itches'],
};

function typeNoun(type: HistoryTypeKey, n: number): string {
  const override = NOUN_OVERRIDES[type];
  if (override) return n === 1 ? override[0] : override[1];
  const base = EVENT_TYPES[type].label.toLowerCase();
  return n === 1 ? base : `${base}s`;
}

/** The noun a filter counts in: '13 vomits', '12 photographed rows', a day header's '2 doses'.
 *  A dose filter's count line reads 'logged' instead (`countPhrase`, CUL-1193). */
export function filterNoun(filter: HistoryFilter, n: number): string {
  const one = n === 1;
  switch (filter.kind) {
    case 'type':
      return typeNoun(filter.type, n);
    case 'symptoms':
      return one ? 'symptom' : 'symptoms';
    case 'course':
      return one ? 'dose' : 'doses';
    case 'photographed':
      return one ? 'photographed row' : 'photographed rows';
    case 'noted':
      return one ? 'row with a note' : 'rows with a note';
    case 'all':
    case 'noticed':
      return one ? 'entry' : 'entries';
  }
}

/** 1094 → '1,094'. Grouped by hand so a count reads the same on every engine. */
export function formatCount(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** The subset a dose count names (CUL-1193): '3 not given in full', on the count line and
 *  on a course's sheet sub-row (after its span, as Photographed's 'N not read'). Null at
 *  zero: an unrated dose is never counted, so a zero would claim every dose was given when
 *  some were only never rated. */
export function notGivenInFullText(n: number): string | null {
  return n > 0 ? `${formatCount(n)} not given in full` : null;
}

// ── The count line (§3.2) ────────────────────────────────────────────────────────

export type CountLineDoorKey = 'outside-trial-diet' | 'trial-compare' | 'symptom-compare' | 'noticed-patterns';

/** A door: the destination is fixed (§3.2); the label is a copy-pass placeholder. */
export interface CountLineDoor {
  key: CountLineDoorKey;
  label: string;
}

const DOORS: Record<CountLineDoorKey, CountLineDoor> = {
  'outside-trial-diet': { key: 'outside-trial-diet', label: 'Outside the trial diet ›' },
  'trial-compare': { key: 'trial-compare', label: 'Before and since the trial ›' },
  'symptom-compare': { key: 'symptom-compare', label: 'See the compare ›' },
  'noticed-patterns': { key: 'noticed-patterns', label: 'What you noticed is on Patterns ›' },
};

/** One line with its emphasis: `lead` + **`strong`** + `tail`. */
export interface CountLineText {
  lead: string;
  strong: string;
  tail: string;
}

export type CountLine =
  /** The facts answer a different window than the one on screen (a read in flight after a
   *  window change): draw the skeleton, never these numbers under that name (C-12). */
  | { kind: 'pending' }
  /** No record yet: a new account shows no count line (§3.12). */
  | { kind: 'none' }
  /** Under Noticed: no count, one link to Patterns (H-9). */
  | { kind: 'noticed'; door: CountLineDoor }
  /** Under search: search finds; it never counts (R-2). */
  | { kind: 'search'; line1: CountLineText; line2: string }
  | { kind: 'count'; line1: CountLineText; line2: string | null; doors: CountLineDoor[] };

/** The window as the count line names it. The names are the window table's (HV-3). */
export interface CountLineWindow {
  /** 'All time', 'Last 30 days', 'Since the trial started', 'June'. */
  longName: string;
  /** An anchored window's date, printed after its name: 'Since the trial started, Jul 26'. */
  anchorDay: string | null;
  isAllTime: boolean;
  /** The trial window: a symptom filter's door goes to the before-and-since chart. */
  isTrial: boolean;
  /** The window's days. Must be the days the facts were read for; when it is not, the line
   *  is `pending`, so a stale read never prints its numbers under the new window's name. */
  range: DayRange;
}

export interface CountLineInput {
  filter: HistoryFilter;
  /** The search text, or null / empty when no search is open. */
  search: string | null;
  window: CountLineWindow;
  facts: HistoryFacts;
  /** The course a course filter names, with its days. */
  course: { name: string; days: CourseDays } | null;
  /** The running trial's days (`TrialFacts.exposureRange`), or null: the Outside-the-trial-
   *  diet door shows while it overlaps the window (PMD-9). */
  trialRange: DayRange | null;
  today: string;
  dates: HistoryDateFormat;
}

function overlaps(a: DayRange, b: DayRange): boolean {
  return a.fromDay <= b.toDay && b.fromDay <= a.toDay;
}

function sameRange(a: DayRange, b: DayRange): boolean {
  return a.fromDay === b.fromDay && a.toDay === b.toDay;
}

/**
 * What a filter's absence says: always about the RECORD, never about the pet. "No vomit
 * logged" is true over any day; "no vomits" asserts the pet did not vomit on days nobody
 * watched (PMD-10: call every count "logged"). Null under Noticed, which never states a
 * miss (H-9). A course names its drug when the caller knows it.
 */
export function absenceText(filter: HistoryFilter, courseName: string | null = null): string | null {
  switch (filter.kind) {
    case 'all':
      return 'nothing logged';
    case 'noticed':
      return null;
    case 'course':
      return courseName ? `no ${courseName} dose logged` : 'no dose logged';
    default:
      return `no ${filterNoun(filter, 1)} logged`;
  }
}

function countPhrase(filter: HistoryFilter, total: WindowTotal): string {
  if (filter.kind === 'all') return total.count > 0 ? `${formatCount(total.count)} logged` : 'nothing logged';
  if (total.count === 0) return absenceText(filter) ?? '';
  const days = `${formatCount(total.days)} ${total.days === 1 ? 'day' : 'days'}`;
  const noun = countsDoses(filter) ? 'logged' : filterNoun(filter, total.count);
  return `${formatCount(total.count)} ${noun} on ${days}`;
}

/** The count line, in every form of §3.2. Pure: the facts in, the words out. */
export function countLineOf(input: CountLineInput): CountLine {
  const { filter, window, facts, dates } = input;
  if (filter.kind === 'noticed') return { kind: 'noticed', door: DOORS['noticed-patterns'] };
  if (!sameRange(window.range, facts.range)) return { kind: 'pending' };
  const recordStart = facts.firsts.record;
  if (recordStart === null) return { kind: 'none' };

  const head = window.anchorDay ? `${window.longName}, ${dates.day(window.anchorDay)}` : window.longName;
  const term = input.search?.trim() ?? '';
  if (term.length > 0) {
    return {
      kind: 'search',
      line1: { lead: 'Rows that mention ', strong: `“${term}”`, tail: ` · ${head}` },
      line2: 'Search finds; it never counts.',
    };
  }

  const total = windowTotalOf(facts.days, filter) ?? { count: 0, days: 0 };
  const course = filter.kind === 'course' ? input.course : null;
  const line1: CountLineText = {
    lead: `${head} · `,
    strong: countPhrase(filter, total),
    tail: window.isAllTime && filter.kind !== 'course' ? ` since ${dates.day(recordStart)}` : '',
  };

  const clauses: string[] = [];
  if (course) {
    const { fromDay, toDay } = course.days;
    if (fromDay === null) clauses.push(course.name);
    else if (toDay === null) clauses.push(`${course.name} · since ${dates.day(fromDay)}`);
    else if (toDay === fromDay) clauses.push(`${course.name} · ${dates.day(fromDay)}`);
    else clauses.push(`${course.name} · ${dates.range(fromDay, toDay)}`);
  }
  // Right after the course it describes (the ruling's order: CUL-1193).
  const notInFull = notGivenInFullText(notInFullOf(facts.days, filter) ?? 0);
  if (notInFull !== null) clauses.push(notInFull);
  const unlogged = unloggedDaysOf({
    days: facts.days,
    range: window.range,
    recordStartDay: recordStart,
    today: input.today,
    within: filter.kind === 'course' ? (course?.days ?? { fromDay: null, toDay: null }) : null,
  }).length;
  if (unlogged > 0) clauses.push(`${formatCount(unlogged)} ${unlogged === 1 ? 'day' : 'days'} unlogged`);
  const duplicates = duplicatesFor(facts.duplicates, filter);
  if (duplicates !== null && duplicates > 0) clauses.push(`${formatCount(duplicates)} logged twice in the same minute`);

  const doors: CountLineDoor[] = [];
  if (isSymptomFilter(filter)) doors.push(DOORS[window.isTrial ? 'trial-compare' : 'symptom-compare']);
  const mealsInView = filter.kind === 'all' || (filter.kind === 'type' && filter.type === 'meal');
  if (mealsInView && input.trialRange !== null && overlaps(window.range, input.trialRange)) {
    doors.push(DOORS['outside-trial-diet']);
  }

  return { kind: 'count', line1, line2: clauses.length > 0 ? clauses.join(' · ') : null, doors };
}

// ── The day header (§3.5, rule C) ────────────────────────────────────────────────

export type DayHeaderTone = 'total' | 'symptom' | 'neutral' | 'unfinished';

export interface DayHeaderPart {
  text: string;
  /** `symptom` is rose; `unfinished` is the neutral grey of H-2, never rose. */
  tone: DayHeaderTone;
}

function mealsNotFinishedPart(f: DayFacts): DayHeaderPart | null {
  const n = f.mealsNotFinished;
  return n > 0 ? { text: `${formatCount(n)} ${n === 1 ? 'meal' : 'meals'} not finished`, tone: 'unfinished' } : null;
}

/**
 * A day header's counts, after the date the screen prints. Empty (the date only) under a
 * search, which counts nothing (R-2), and under Noticed (H-9). Under a filter, the filtered
 * count first, then the day's total ("2 vomits · 10 logged"); under Meal the meals not
 * finished follow, so a refusal never reads as routine one level above the rows (§1, H-2).
 * Under All types, the total, every symptom kind, the other entries, the meals not finished.
 * A day with nothing logged says only that (today: not yet), never what its nothing lacked.
 */
export function dayHeaderOf(
  f: DayFacts,
  filter: HistoryFilter,
  opts: { search?: boolean; isToday?: boolean } = {},
): DayHeaderPart[] {
  if (opts.search || filter.kind === 'noticed') return [];
  if (f.total === 0) return [{ text: opts.isToday ? 'nothing logged yet' : 'nothing logged', tone: 'neutral' }];
  const total: DayHeaderPart = { text: `${formatCount(f.total)} logged`, tone: 'total' };
  if (filter.kind !== 'all') {
    const n = dayCountFor(f, filter) ?? 0;
    const parts: DayHeaderPart[] = [
      {
        text: n > 0 ? `${formatCount(n)} ${filterNoun(filter, n)}` : (absenceText(filter) ?? ''),
        tone: isSymptomFilter(filter) ? 'symptom' : 'neutral',
      },
      { ...total, tone: 'neutral' },
    ];
    const unfinished = filter.kind === 'type' && filter.type === 'meal' ? mealsNotFinishedPart(f) : null;
    if (unfinished) parts.push(unfinished);
    return parts;
  }
  const parts: DayHeaderPart[] = [total];
  for (const type of HISTORY_TYPE_KEYS) {
    if (!SYMPTOM_TYPES.has(type)) continue;
    const n = f.byType[type] ?? 0;
    if (n > 0) parts.push({ text: `${formatCount(n)} ${typeNoun(type, n)}`, tone: 'symptom' });
  }
  const other = f.byType.other ?? 0;
  if (other > 0) parts.push({ text: `${formatCount(other)} ${typeNoun('other', other)}`, tone: 'neutral' });
  const unfinished = mealsNotFinishedPart(f);
  if (unfinished) parts.push(unfinished);
  return parts;
}

// ── Date-only items (§3.5, rule L) ───────────────────────────────────────────────

export type DateOnlyItem =
  | { kind: 'visit'; day: string; id: string; reason: string | null; where: string }
  | { kind: 'course-start'; day: string; courseKey: string; name: string }
  | {
      kind: 'bowl';
      day: string;
      id: string;
      change: BoundaryMarker['kind'];
      foodLabel: string;
      /** Set only for a switch: the food switched TO. */
      toFoodLabel: string | null;
    };

export interface DateOnlyItemsInput {
  visits: readonly HistoryVisitRow[];
  courses: readonly HistoryCourse[];
  bowls: readonly BoundaryMarker[];
  range: DayRange;
}

const ITEM_ORDER: Record<DateOnlyItem['kind'], number> = { visit: 0, 'course-start': 1, bowl: 2 };

function itemSortKey(item: DateOnlyItem): string {
  return item.kind === 'course-start' ? `${item.name}|${item.courseKey}` : item.id;
}

/**
 * The date-only items per day, in order: a vet visit, a regimen's start, a free-fed bowl's
 * Started / Stopped / Switched. Drawn at the top of their day under every filter; never
 * counted, never a row, never a reason a day is logged. Each carries a calendar day
 * already (a DATE column), so none is re-derived from an instant.
 */
export function dateOnlyItemsOf(input: DateOnlyItemsInput): Map<string, DateOnlyItem[]> {
  const { visits, courses, bowls, range } = input;
  const items: DateOnlyItem[] = [];
  for (const v of visits) {
    const day = dayOfStored(v.visitedAt);
    if (day !== null && inRange(day, range)) items.push({ kind: 'visit', day, id: v.id, reason: v.reason, where: v.where });
  }
  for (const c of courses) {
    const day = c.startedDay;
    if (day !== null && inRange(day, range)) items.push({ kind: 'course-start', day, courseKey: c.key, name: c.name });
  }
  for (const b of bowls) {
    const day = dayOfStored(b.date);
    if (day !== null && inRange(day, range)) {
      items.push({ kind: 'bowl', day, id: b.id, change: b.kind, foodLabel: b.foodLabel, toFoodLabel: b.toFoodLabel ?? null });
    }
  }
  items.sort((a, b) => {
    if (a.day !== b.day) return a.day < b.day ? -1 : 1;
    if (a.kind !== b.kind) return ITEM_ORDER[a.kind] - ITEM_ORDER[b.kind];
    const ak = itemSortKey(a);
    const bk = itemSortKey(b);
    return ak < bk ? -1 : ak > bk ? 1 : 0;
  });
  const out = new Map<string, DateOnlyItem[]>();
  for (const item of items) {
    const list = out.get(item.day);
    if (list) list.push(item);
    else out.set(item.day, [item]);
  }
  return out;
}

// ── The list's sections: day cards and gap lines (§3.5, R-1) ────────────────────

export type HistorySection =
  /** A day card: its rows (those the filter shows) and its date-only items. */
  | { kind: 'day'; day: string }
  /** Today with nothing logged yet (All types): its header and "Nothing logged yet today",
   *  never merged into yesterday's gap line (§3.12). */
  | { kind: 'today-open'; day: string }
  /** A filter hid every row, and the day's date-only items stay (AC 11). `statesAbsence`
   *  says whether the line may add "no {kind} logged": only on a closed, logged day. */
  | { kind: 'items-only'; day: string; statesAbsence: boolean }
  /** A run of days with nothing logged: one line (All types, and inside a filter's list). */
  | { kind: 'unlogged'; fromDay: string; toDay: string; days: number }
  /** A run of closed, logged days with none of the filter's kind: "no vomit logged · Sep 18 – 19". */
  | { kind: 'no-match'; fromDay: string; toDay: string; days: number };

export interface ListSectionsInput {
  /** The days the loaded pages account for (`DayPage.span`, merged newest to oldest). */
  span: DayRange;
  facts: HistoryFacts;
  filter: HistoryFilter;
  /** The course a course filter shows, with its days (its sections stay inside them).
   *  Null while the courses load: the course's rows still show, and nothing is claimed. */
  course: CourseDays | null;
  /** Days carrying a date-only item (`dateOnlyItemsOf`). */
  itemDays: ReadonlySet<string>;
  today: string;
  /** Under a search: the days whose rows matched, from the pages. A search lists those days
   *  and nothing else: no gap line, no item line, no absence (R-2). */
  searchDays?: readonly string[] | null;
}

/**
 * The list, newest day first, as sections. Pure, so every absence rule is a table test.
 *
 * Two kinds of thing appear, under two different rules:
 *   • What HAPPENED is drawn wherever it is: a day with a row the filter shows is a card,
 *     and a day with a date-only item keeps its items under every filter (AC 11), before
 *     the filter's first row and before the record's first day included. Under All types a
 *     day with only items is a card (a visit-only day is a day, §3.5); under a filter it is
 *     one item line.
 *   • What did NOT happen is said only over days the owner watched: on or after the pet's
 *     first record (GAP-24) and the filter's first row or the course's start (§3.5), and
 *     strictly before today. Under All types a run of such days with nothing logged is one
 *     line; under a filter a closed, logged day without a match joins a no-match run, which
 *     an unlogged day splits. An item line adds its absence only on such a day. Under
 *     Noticed nothing is ever said (H-9), and while a course filter's course is unknown
 *     nothing is said either (its rows still show).
 * Today with nothing logged keeps its own open card under All types (§3.12); a day after
 * today holds no claim. A course filter's list stays inside the course's days, as every
 * filter's stays inside the window. A record with no events, or a filter with no row at
 * all, lays out nothing: the screen's quiet state speaks instead.
 */
export function listSectionsOf(input: ListSectionsInput): HistorySection[] {
  const { span, facts, filter, course, itemDays, today } = input;
  if (input.searchDays != null) {
    return [...new Set(input.searchDays)]
      .filter((day) => isDayKey(day) && inRange(day, span))
      .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
      .map((day) => ({ kind: 'day' as const, day }));
  }
  if (!isDayKey(span.fromDay) || !isDayKey(span.toDay) || !isDayKey(today)) return [];

  let lo: string = span.fromDay;
  let hi: string = span.toDay;
  if (filter.kind === 'course' && course !== null) {
    if (course.fromDay === null) return [];
    lo = laterDay(lo, course.fromDay) ?? lo;
    hi = earlierDay(hi, course.toDay) ?? hi;
  }

  // The first day absence may be claimed on, or null for none at all.
  const record = facts.firsts.record;
  const first = firstDayFor(facts.firsts, filter, course);
  // A record with nothing in it, or a filter with no row ever: nothing to lay out, so the
  // screen's quiet state speaks (§3.12), not a scatter of item lines. A course filter whose
  // course has not loaded yet is not "nothing": its rows are in the facts already.
  const courseLoading = filter.kind === 'course' && course === null;
  if (!courseLoading && (first === null || (filter.kind !== 'noticed' && record === null))) return [];
  let claimFrom: string | null;
  if (filter.kind === 'noticed' || record === null) claimFrom = null;
  else if (filter.kind === 'all') claimFrom = record;
  else if (filter.kind === 'course' && course === null) claimFrom = null;
  else claimFrom = first === null ? null : laterDay(record, first);
  const claims = (day: string): boolean => claimFrom !== null && day >= claimFrom && day < today;

  const out: HistorySection[] = [];
  let unlogged: string[] = [];
  let noMatch: string[] = [];
  const flushUnlogged = () => {
    if (unlogged.length === 0) return;
    out.push({ kind: 'unlogged', fromDay: unlogged[unlogged.length - 1], toDay: unlogged[0], days: unlogged.length });
    unlogged = [];
  };
  const flushNoMatch = () => {
    if (noMatch.length === 0) return;
    out.push({ kind: 'no-match', fromDay: noMatch[noMatch.length - 1], toDay: noMatch[0], days: noMatch.length });
    noMatch = [];
  };
  const flushBoth = () => {
    flushUnlogged();
    flushNoMatch();
  };

  for (const day of daysDescending(lo, hi)) {
    const f = dayFactsOn(facts.days, day);
    const hasItems = itemDays.has(day);
    const shows =
      filter.kind === 'noticed' ? f.looked : filter.kind === 'all' ? f.total > 0 : (dayCountFor(f, filter) ?? 0) > 0;

    if (shows || (filter.kind === 'all' && hasItems)) {
      flushBoth();
      out.push({ kind: 'day', day });
    } else if (hasItems) {
      flushBoth();
      out.push({ kind: 'items-only', day, statesAbsence: claims(day) && f.total > 0 });
    } else if (day === today && filter.kind === 'all' && claimFrom !== null && day >= claimFrom) {
      flushBoth();
      out.push({ kind: 'today-open', day });
    } else if (!claims(day)) {
      // Today, a day after it, or a day before the claims begin: nothing is said, and no
      // run reaches across it.
      flushBoth();
    } else if (f.total === 0) {
      flushNoMatch();
      unlogged.push(day);
    } else {
      flushUnlogged();
      noMatch.push(day);
    }
  }
  flushBoth();
  return out;
}

/**
 * A gap line's words (§3.5): "Sun, Sep 20 · nothing logged", "nothing logged · Sep 13 – 16",
 * "no vomit logged · Sep 18 – 19". Null for a section that is not a gap line. A course names
 * its drug when the caller knows it.
 */
export function gapLineText(
  section: HistorySection,
  filter: HistoryFilter,
  dates: HistoryDateFormat,
  courseName: string | null = null,
): string | null {
  if (section.kind === 'unlogged') {
    return section.days === 1
      ? `${dates.weekday(section.fromDay)} · nothing logged`
      : `nothing logged · ${dates.range(section.fromDay, section.toDay)}`;
  }
  if (section.kind === 'no-match') {
    const words = absenceText(filter, courseName);
    if (words === null) return null;
    const when = section.days === 1 ? dates.day(section.fromDay) : dates.range(section.fromDay, section.toDay);
    return `${words} · ${when}`;
  }
  return null;
}
