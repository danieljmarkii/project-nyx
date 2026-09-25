// History v2's reads (CUL-1161 / HV-4; docs/nyx-history-v2-requirements.md §5.2, §3.7).
// The one file that knows the tables behind History v2's list and numbers; everything it
// returns is shaped by the pure `lib/historyDays.ts`. `getTimeline` stays v1's until GA.
//
// ── WHOLE-DAY PAGES ON A TOTAL ORDER ─────────────────────────────────────────────
// `readDayPage` returns whole LOCAL days, newest first, until a page holds at least
// DAY_PAGE_MIN_ROWS rows. Rows sit in a day by (occurred_at, id), a total order, so a
// same-minute pair never swaps between renders (C-42; rule H). The cursor is a DAY: the
// next page is every day before the last one this page returned. So a page never splits a
// day, removing a row never shifts a later page (there is no offset to shift), and a
// same-minute pair across a page's seam, necessarily across midnight, sits one row on each
// page, never lost and never repeated.
//
// ── BOUNDS ARE PARSED, NEVER COMPARED AS TEXT (C-40) ─────────────────────────────
// A local write spells an instant `…Z`, a hydrated row `…+00:00`, and the two do not order
// as text at the exact-equality second. So every SQL bound on `occurred_at` is a COARSE
// prefilter with a day of slack each side, and the local day a row belongs to is decided in
// JS from the parsed instant (`dayOfInstant`), the `lib/monthReads.ts` shape. The record's
// first instants are taken with `julianday()`, which parses both spellings, never with a
// text MIN. A day key ('YYYY-MM-DD', one spelling) compares correctly as text.
//
// ── ONE POPULATION, ONE PREDICATE PER FILTER ─────────────────────────────────────
// The population is every surviving event but a look (`LOOK_EVENT_TYPE`, the month's own
// constant). The page's filters and the facts' flags are built from the SAME SQL fragments
// (`PHOTOGRAPHED_SQL`, `NOTED_SQL`, the symptom set from `SYMPTOM_TYPES`, the course key
// from `courseKeysOf`), so a filtered list and its count cannot disagree about a row.
// `historyQueries.test.ts` holds them equal over one table.
//
// ── WHAT THIS FILE DOES NOT READ ─────────────────────────────────────────────────
// Vet visits. A visit is drawn as a date-only item and must never reach a count or a
// coverage line (`guards/visitReaders.test.ts`), so the screen reads visits through the
// shipped `readVisitsForHistory` and hands them to the pure `dateOnlyItemsOf`; nothing in
// the file that computes History's numbers ever holds one. The same goes for the bowl's
// markers (`getBoundaryMarkers`).
//
// ── SEARCH (§3.7, R-2) ───────────────────────────────────────────────────────────
// One extra condition on the page's own pet-scoped query, over named fields only: the
// food's brand and product, the medicine's name (the item's, else the regimen's), the
// type's label. `LIKE` with `%`, `_` and the escape character escaped. It counts nothing,
// builds no index, saves nothing. The note is NOT searched until CUL-848's cue is live
// (`SEARCH_READS_NOTES`, pinned false by the suite; HV-16 flips it). STATED BLIND SPOT:
// SQLite's LIKE folds case for ASCII only, so 'É' does not find 'é'.

import { EVENT_TYPES, SYMPTOM_TYPES, type EventTypeKey } from '../constants/eventTypes';
import { getDb, type TimelineRow } from './db';
import { getActiveArrangementsForPet } from './feedingArrangements';
import {
  buildDayFacts,
  courseKeysOf,
  dayOfInstant,
  duplicateCountsOf,
  firstDaysOf,
  historyCourseOf,
  inRange,
  isDayKey,
  shiftDay,
  type DayRange,
  type HistoryCourse,
  type HistoryFacts,
  type HistoryFilter,
  type PopulationRow,
  type TypeFirsts,
} from './historyDays';
import type { MedicationHistoryRegimen } from './medicationHistory';
import { ALL_REGIMENS_FOR_HISTORY_SQL, loadMedicationCourses } from './medicationHistoryFacts';
import { PAIRED_DOSE_REVERSE_JOIN } from './medicationQueries';
import { LOOK_EVENT_TYPE } from './monthReads';
import { resolveCourseName, type MedItemName } from './rundown';
import { dayKeyToLocalDate } from './utils';

// ── The shared fragments ─────────────────────────────────────────────────────────

/** The population (R-1): a surviving event that is not a look. One parameter:
 *  LOOK_EVENT_TYPE. */
const POPULATION_WHERE = 'e.deleted_at IS NULL AND e.event_type <> ?';

/** Photographed: any attachment row on the event, the month's own predicate. One
 *  pre-aggregated join, not a per-row EXISTS: `event_attachments` has no event_id index. */
const PHOTO_JOIN = 'LEFT JOIN (SELECT DISTINCT event_id FROM event_attachments) ph ON ph.event_id = e.id';
const PHOTOGRAPHED_SQL = 'ph.event_id IS NOT NULL';

/** The joins every scope condition (a filter, a search) reads. */
const SCOPE_JOINS = `
    LEFT JOIN meals m ON m.event_id = e.id
    LEFT JOIN food_items_cache f ON f.id = m.food_item_id
    LEFT JOIN medication_administrations ma ON ma.event_id = e.id
    LEFT JOIN medication_items_cache mi ON mi.id = ma.medication_item_id
    LEFT JOIN medications rg ON rg.id = ma.medication_id
    ${PHOTO_JOIN}`;

/** With a note: the owner's note on the event row, the only note field the app writes (a
 *  meal's, a dose's and a weight's children are written NULL). Whitespace alone is not a
 *  note. */
const NOTED_SQL =
  "(e.notes IS NOT NULL AND trim(e.notes, ' ' || char(9) || char(10) || char(13)) <> '')";

const MS_PER_DAY = 86_400_000;
/** The Unix epoch as a Julian day: `julianday()` back to epoch ms. */
const UNIX_EPOCH_JULIAN_DAY = 2_440_587.5;

function msOfJulianDay(jd: number | null): number | null {
  // Rounded to the ms: a double carries a Julian day to ~50µs, and an instant exactly at
  // local midnight must not come back a hair before it, on the previous day.
  return jd === null || !Number.isFinite(jd) ? null : Math.round((jd - UNIX_EPOCH_JULIAN_DAY) * MS_PER_DAY);
}

/** `[after, before)` ISO bounds with a day of slack each side of the local days: the
 *  coarse prefilter. The parsed instant decides membership. */
function slackBounds(range: DayRange): { after: string; before: string } {
  const from = dayKeyToLocalDate(range.fromDay);
  const to = dayKeyToLocalDate(range.toDay);
  if (!from || !to || !isDayKey(range.fromDay) || !isDayKey(range.toDay)) {
    throw new Error(`historyQueries: not a day range: ${range.fromDay}..${range.toDay}`);
  }
  return {
    after: new Date(from.getTime() - MS_PER_DAY).toISOString(),
    before: new Date(to.getTime() + 2 * MS_PER_DAY).toISOString(),
  };
}

async function readRegimens(petId: string): Promise<MedicationHistoryRegimen[]> {
  return getDb().getAllAsync<MedicationHistoryRegimen>(ALL_REGIMENS_FOR_HISTORY_SQL, [petId]);
}

// ── The facts: one population behind every number ───────────────────────────────

interface RawPopulationRow {
  id: string;
  event_type: string;
  occurred_at: string;
  food_item_id: string | null;
  food_type: string | null;
  intake_rating: string | null;
  dose_id: string | null;
  medication_id: string | null;
  medication_item_id: string | null;
  adherence: string | null;
  has_photo: number;
  has_note: number;
}

/** The population over a window's days plus a day of slack each side (the duplicates'
 *  context). Parameters: pet, LOOK_EVENT_TYPE, after, before. */
export const POPULATION_SQL = `
  SELECT e.id, e.event_type, e.occurred_at,
         m.food_item_id, f.food_type, m.intake_rating,
         ma.id AS dose_id, ma.medication_id, ma.medication_item_id, ma.adherence,
         CASE WHEN ${PHOTOGRAPHED_SQL} THEN 1 ELSE 0 END AS has_photo,
         CASE WHEN ${NOTED_SQL} THEN 1 ELSE 0 END AS has_note
    FROM events e
    LEFT JOIN meals m ON m.event_id = e.id
    LEFT JOIN food_items_cache f ON f.id = m.food_item_id
    LEFT JOIN medication_administrations ma ON ma.event_id = e.id
    ${PHOTO_JOIN}
   WHERE e.pet_id = ? AND ${POPULATION_WHERE}
     AND e.occurred_at >= ? AND e.occurred_at < ?`;

/** Each type's first instants over the WHOLE record, parsed by `julianday()`. Parameters:
 *  pet, LOOK_EVENT_TYPE. */
export const TYPE_FIRSTS_SQL = `
  SELECT e.event_type AS event_type,
         MIN(julianday(e.occurred_at)) AS first_jd,
         MIN(CASE WHEN ${PHOTOGRAPHED_SQL} THEN julianday(e.occurred_at) END) AS first_photo_jd,
         MIN(CASE WHEN ${NOTED_SQL} THEN julianday(e.occurred_at) END) AS first_note_jd
    FROM events e
    ${PHOTO_JOIN}
   WHERE e.pet_id = ? AND ${POPULATION_WHERE}
   GROUP BY e.event_type`;

/** Every surviving look's day in a range. `local_day` is the one day key every surface
 *  counts a look on, and a day key compares correctly as text. Parameters: pet, from, to. */
export const LOOK_DAYS_SQL = `
  SELECT l.local_day AS local_day
    FROM looks l
    JOIN events e ON e.id = l.event_id
   WHERE e.pet_id = ? AND e.deleted_at IS NULL
     AND l.local_day >= ? AND l.local_day <= ?`;

/** The first surviving look's day. Parameter: pet. */
export const FIRST_LOOK_SQL = `
  SELECT MIN(l.local_day) AS local_day
    FROM looks l
    JOIN events e ON e.id = l.event_id
   WHERE e.pet_id = ? AND e.deleted_at IS NULL`;

function toPopulationRow(r: RawPopulationRow): PopulationRow {
  return {
    id: r.id,
    eventType: r.event_type,
    occurredAt: r.occurred_at,
    foodItemId: r.food_item_id,
    foodType: r.food_type,
    intakeRating: r.intake_rating,
    isDose: r.dose_id !== null,
    medicationId: r.medication_id,
    medicationItemId: r.medication_item_id,
    adherence: r.adherence,
    hasPhoto: r.has_photo === 1,
    hasNote: r.has_note === 1,
  };
}

/**
 * Every number History shows for one window: each day's facts, the record's first days,
 * and the same-minute duplicates. One population read feeds all of it (R-1), so the count
 * line, the type sheet, the day headers and the strip agree by construction. Rejects on a
 * failed read: the screen shows its error state, never an empty record (C-12).
 */
export async function readHistoryFacts(petId: string, range: DayRange): Promise<HistoryFacts> {
  const bounds = slackBounds(range);
  const db = getDb();
  const [rows, lookRows, typeFirsts, firstLook, regimens, arrangements] = await Promise.all([
    db.getAllAsync<RawPopulationRow>(POPULATION_SQL, [petId, LOOK_EVENT_TYPE, bounds.after, bounds.before]),
    db.getAllAsync<{ local_day: string }>(LOOK_DAYS_SQL, [petId, range.fromDay, range.toDay]),
    db.getAllAsync<{ event_type: string; first_jd: number | null; first_photo_jd: number | null; first_note_jd: number | null }>(
      TYPE_FIRSTS_SQL,
      [petId, LOOK_EVENT_TYPE],
    ),
    db.getFirstAsync<{ local_day: string | null }>(FIRST_LOOK_SQL, [petId]),
    readRegimens(petId),
    getActiveArrangementsForPet(petId),
  ]);
  const population = rows.map(toPopulationRow);
  const firsts: TypeFirsts[] = typeFirsts.map((t) => ({
    eventType: t.event_type,
    firstMs: msOfJulianDay(t.first_jd),
    firstPhotoMs: msOfJulianDay(t.first_photo_jd),
    firstNoteMs: msOfJulianDay(t.first_note_jd),
  }));
  return {
    range,
    days: buildDayFacts({
      rows: population,
      lookDays: lookRows.map((l) => l.local_day),
      range,
      freeFedFoodIds: new Set(arrangements.map((a) => a.food_item_id)),
      regimens,
    }),
    firsts: firstDaysOf(firsts, firstLook?.local_day ?? null),
    duplicates: duplicateCountsOf(population, range),
  };
}

// ── Courses ──────────────────────────────────────────────────────────────────────

/**
 * The pet's medication courses as History names and bounds them: the vet report's course
 * grain (`deriveMedicationCourses`, through the shipped loader), named by the rundown's
 * rule (the regimen's own name, else the drug's brand-first name, else "Medication").
 * Rejects when the record cannot be read.
 */
export async function readHistoryCourses(petId: string): Promise<HistoryCourse[]> {
  const courses = await loadMedicationCourses(petId);
  if (courses === null) throw new Error('historyQueries: medication courses could not be read');
  const rows = await getDb().getAllAsync<{ id: string; generic_name: string | null; brand_name: string | null }>(
    'SELECT id, generic_name, brand_name FROM medication_items_cache',
  );
  const names = new Map<string, MedItemName>();
  for (const r of rows) names.set(r.id, { generic: r.generic_name, brand: r.brand_name });
  return courses.map((c) => historyCourseOf(c, resolveCourseName(c, names)));
}

// ── Search ───────────────────────────────────────────────────────────────────────

/**
 * Whether search reads the owner's note. FALSE until CUL-848's cue is live at every place a
 * note is written (spec §6, AC 39): a note is the owner's own words, and nothing new may read
 * it until the product says where notes go. Flipping this is HV-16's (CUL-1172), with the
 * cue; `historyQueries.test.ts` pins it false and pins that no searched field is a note.
 */
export const SEARCH_READS_NOTES: boolean = false;

/** The named fields a search reads (§3.7): the food's brand and product, the medicine's
 *  generic and brand names, and the regimen's own name for a dose with no library item. */
const NAME_FIELDS = ['f.brand', 'f.product_name', 'mi.generic_name', 'mi.brand_name', 'rg.drug_name'] as const;
export const SEARCHED_FIELDS: readonly string[] = SEARCH_READS_NOTES ? [...NAME_FIELDS, 'e.notes'] : NAME_FIELDS;

/** Escape LIKE's wildcards and its escape character, so a search for "50%" or "pro_plan"
 *  finds exactly those characters. Pairs with `ESCAPE '\'`. */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** The event types whose label contains the term, case-folded as LIKE folds ASCII. */
function typesWhoseLabelContains(term: string): EventTypeKey[] {
  const needle = term.toLowerCase();
  return (Object.keys(EVENT_TYPES) as EventTypeKey[]).filter((k) => EVENT_TYPES[k].label.toLowerCase().includes(needle));
}

/** The search's one extra condition, or null when there is nothing to search for. */
export function searchCondition(term: string | null | undefined): { sql: string; params: string[] } | null {
  const t = (term ?? '').trim();
  if (t.length === 0) return null;
  const pattern = `%${escapeLike(t)}%`;
  const parts: string[] = SEARCHED_FIELDS.map((field) => `${field} LIKE ? ESCAPE '\\'`);
  const params: string[] = SEARCHED_FIELDS.map(() => pattern);
  const labelled = typesWhoseLabelContains(t);
  if (labelled.length > 0) {
    parts.push(`e.event_type IN (${labelled.map(() => '?').join(', ')})`);
    params.push(...labelled);
  }
  return { sql: `(${parts.join(' OR ')})`, params };
}

// ── The page ─────────────────────────────────────────────────────────────────────

/** A page holds at least this many rows, in whole days (§5.2). */
export const DAY_PAGE_MIN_ROWS = 50;
/** The first read covers a week; each further read of the same page doubles, to a cap, so a
 *  sparse record or a rare filter reaches back in a few reads, not one per week. */
const FIRST_CHUNK_DAYS = 7;
const MAX_CHUNK_DAYS = 256;

/** A row as History v2 draws it: the `getTimeline` row, column for column (so a row says
 *  the same thing in v1 and v2), plus what the shared row and the course filter need. */
export type HistoryRow = TimelineRow & {
  /** The dose's explicit regimen link. */
  medication_id: string | null;
  /** That regimen's own name: a dose with no library item is named from its course
   *  (GAP-25), never guessed. */
  regimen_drug_name: string | null;
  /** Any attachment on the event (the camera glyph; never the photo itself). */
  has_photo: boolean;
  /** The dose's course key (the vet report's course grain), null for any other row. */
  course_key: string | null;
  /** A look's `local_day`: the one day key a look is placed on, on every surface. */
  look_local_day: string | null;
};

export interface HistoryDay {
  day: string;
  /** Morning to night, by (occurred_at, id). */
  rows: HistoryRow[];
}

export interface DayPageScope {
  /** The window's local days (HV-3's `WindowBounds`). */
  range: DayRange;
  filter: HistoryFilter;
  /** The search text, or null. */
  search: string | null;
}

/** Where the next page starts: every day before `beforeDay`. */
export interface DayPageCursor {
  beforeDay: string;
}

export interface DayPage {
  /** Whole days with a row the scope shows, newest first. */
  days: HistoryDay[];
  /** The days this page accounts for: every day in it without a row is known to hold none
   *  (the gap lines' ground, `listSectionsOf`). Null when the scope is empty. */
  span: DayRange | null;
  /** The next page, or null when this page reached the window's first day. */
  next: DayPageCursor | null;
}

interface RawHistoryRow extends Omit<HistoryRow, 'has_photo' | 'course_key'> {
  dose_id: string | null;
  has_photo: number;
}

/** The `getTimeline` SELECT, column for column, plus the dose's link, its regimen's name and
 *  the photo flag. Every LEFT JOIN is one-to-one (UNIQUE event_id children, primary-key
 *  lookups, the pre-aggregated photo and reverse-dose joins), so no row is multiplied. */
const HISTORY_ROW_SELECT = `
  SELECT e.id, e.pet_id, e.event_type, e.occurred_at,
         e.occurred_at_confidence, e.occurred_at_earliest, e.occurred_at_latest,
         e.severity, e.notes,
         e.source, e.deleted_at, e.created_at, e.updated_at,
         m.food_item_id, m.quantity, m.intake_rating,
         f.brand AS food_brand, f.product_name AS food_product_name, f.food_type,
         f.format AS food_format,
         wc.weight_kg AS weight_kg,
         ma.medication_item_id, ma.adherence, ma.how_given,
         ma.paired_event_id,
         pm.intake_rating AS paired_vehicle_intake,
         pf.product_name AS paired_food_name,
         mi.generic_name AS drug_generic_name, mi.brand_name AS drug_brand_name,
         COALESCE(pd.dose_count, 0) AS paired_dose_count,
         pd.rep_event_id AS paired_dose_event_id,
         pdmi.generic_name AS paired_dose_drug_name,
         lk.outcome AS look_outcome, lk.words AS look_words, lk.notes AS look_note,
         lk.local_day AS look_local_day,
         ma.id AS dose_id, ma.medication_id AS medication_id, rg.drug_name AS regimen_drug_name,
         CASE WHEN ${PHOTOGRAPHED_SQL} THEN 1 ELSE 0 END AS has_photo
    FROM events e
    LEFT JOIN meals m ON m.event_id = e.id
    LEFT JOIN food_items_cache f ON f.id = m.food_item_id
    LEFT JOIN weight_checks wc ON wc.event_id = e.id
    LEFT JOIN looks lk ON lk.event_id = e.id
    LEFT JOIN medication_administrations ma ON ma.event_id = e.id
    LEFT JOIN medication_items_cache mi ON mi.id = ma.medication_item_id
    LEFT JOIN medications rg ON rg.id = ma.medication_id
    LEFT JOIN events pe ON pe.id = ma.paired_event_id AND pe.deleted_at IS NULL
    LEFT JOIN meals pm ON pm.event_id = pe.id
    LEFT JOIN food_items_cache pf ON pf.id = pm.food_item_id
    ${PAIRED_DOSE_REVERSE_JOIN}
    ${PHOTO_JOIN}`;

/**
 * The filter's condition. Built from the same fragments as the facts' flags: a type is
 * `event_type`, All symptoms is `SYMPTOM_TYPES`, a course is any dose row (its key is
 * decided in JS by `courseKeysOf`, as the facts decide it), Photographed and With a note are
 * the two shared fragments, and Noticed is the look and nothing else.
 */
function filterCondition(filter: HistoryFilter): { sql: string; params: string[] } {
  if (filter.kind === 'noticed') return { sql: 'e.deleted_at IS NULL AND e.event_type = ?', params: [LOOK_EVENT_TYPE] };
  const base = { sql: POPULATION_WHERE, params: [LOOK_EVENT_TYPE] };
  switch (filter.kind) {
    case 'all':
      return base;
    case 'type':
      return { sql: `${base.sql} AND e.event_type = ?`, params: [...base.params, filter.type] };
    case 'symptoms': {
      const types = [...SYMPTOM_TYPES];
      return { sql: `${base.sql} AND e.event_type IN (${types.map(() => '?').join(', ')})`, params: [...base.params, ...types] };
    }
    case 'course':
      return { sql: `${base.sql} AND ma.id IS NOT NULL`, params: base.params };
    case 'photographed':
      return { sql: `${base.sql} AND ${PHOTOGRAPHED_SQL}`, params: base.params };
    case 'noted':
      return { sql: `${base.sql} AND ${NOTED_SQL}`, params: base.params };
  }
}

function scopeWhere(scope: DayPageScope): { sql: string; params: string[] } {
  const filter = filterCondition(scope.filter);
  const search = searchCondition(scope.search);
  return {
    sql: search ? `${filter.sql} AND ${search.sql}` : filter.sql,
    params: search ? [...filter.params, ...search.params] : filter.params,
  };
}

/** The earliest local day the scope could show anything on, from the parsed instants: how
 *  far back a page need read. A course's rows are decided in JS (`courseKeysOf`), so its
 *  floor is found the same way, over the doses the scope's SQL admits: the earliest dose of
 *  ANY course would be a correct floor too, but on a long medication history it would walk
 *  a recent course's pages back through years of other courses' doses. */
async function earliestScopeDay(
  petId: string,
  scope: DayPageScope,
  regimens: readonly MedicationHistoryRegimen[],
): Promise<string | null> {
  const where = scopeWhere(scope);
  if (scope.filter.kind === 'course') {
    const courseKey = scope.filter.courseKey;
    const doses = await getDb().getAllAsync<{
      id: string;
      occurred_at: string;
      medication_id: string | null;
      medication_item_id: string | null;
      adherence: string | null;
    }>(
      `SELECT e.id, e.occurred_at, ma.medication_id, ma.medication_item_id, ma.adherence
         FROM events e ${SCOPE_JOINS}
        WHERE e.pet_id = ? AND ${where.sql}`,
      [petId, ...where.params],
    );
    const keys = courseKeysOf(
      doses.map((d) => ({
        id: d.id,
        medicationId: d.medication_id,
        medicationItemId: d.medication_item_id,
        adherence: d.adherence,
        occurredAt: d.occurred_at,
      })),
      regimens,
    );
    let earliestMs: number | null = null;
    for (const d of doses) {
      if (keys.get(d.id) !== courseKey) continue;
      const ms = Date.parse(d.occurred_at);
      if (Number.isFinite(ms) && (earliestMs === null || ms < earliestMs)) earliestMs = ms;
    }
    return earliestMs === null ? null : dayOfInstant(new Date(earliestMs).toISOString());
  }
  const row = await getDb().getFirstAsync<{ first_jd: number | null }>(
    `SELECT MIN(julianday(e.occurred_at)) AS first_jd FROM events e ${SCOPE_JOINS}
      WHERE e.pet_id = ? AND ${where.sql}`,
    [petId, ...where.params],
  );
  const ms = msOfJulianDay(row?.first_jd ?? null);
  return ms === null ? null : dayOfInstant(new Date(ms).toISOString());
}

function compareRows(a: HistoryRow, b: HistoryRow): number {
  const am = Date.parse(a.occurred_at);
  const bm = Date.parse(b.occurred_at);
  if (am !== bm) return am - bm;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Every row the scope shows on the days of `range`, as whole days, newest first. */
async function readDays(
  petId: string,
  scope: DayPageScope,
  range: DayRange,
  regimens: readonly MedicationHistoryRegimen[],
): Promise<HistoryDay[]> {
  const bounds = slackBounds(range);
  const where = scopeWhere(scope);
  const raw = await getDb().getAllAsync<RawHistoryRow>(
    `${HISTORY_ROW_SELECT}
      WHERE e.pet_id = ? AND ${where.sql}
        AND e.occurred_at >= ? AND e.occurred_at < ?`,
    [petId, ...where.params, bounds.after, bounds.before],
  );
  const keys = courseKeysOf(
    raw
      .filter((r) => r.dose_id !== null)
      .map((r) => ({
        id: r.id,
        medicationId: r.medication_id,
        medicationItemId: r.medication_item_id,
        adherence: r.adherence,
        occurredAt: r.occurred_at,
      })),
    regimens,
  );
  const byDay = new Map<string, HistoryRow[]>();
  for (const r of raw) {
    // A look sits on its own `local_day`, the day the facts' `looked` reads; every other
    // row on the local day of its parsed instant.
    const day = r.event_type === LOOK_EVENT_TYPE && isDayKey(r.look_local_day) ? r.look_local_day : dayOfInstant(r.occurred_at);
    if (day === null || !inRange(day, range)) continue;
    const courseKey = keys.get(r.id) ?? null;
    if (scope.filter.kind === 'course' && courseKey !== scope.filter.courseKey) continue;
    const { dose_id: _doseId, has_photo, ...rest } = r;
    const out: HistoryRow = { ...rest, has_photo: has_photo === 1, course_key: courseKey };
    const list = byDay.get(day);
    if (list) list.push(out);
    else byDay.set(day, [out]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([day, rows]) => ({ day, rows: rows.sort(compareRows) }));
}

/**
 * One page of History's list: whole local days, newest first, until the page holds at least
 * `minRows` rows (§5.2). `cursor` is the previous page's `next`, or null for the first page.
 * Rejects on a failed read (the screen's error state, C-12).
 */
export async function readDayPage(
  petId: string,
  scope: DayPageScope,
  cursor: DayPageCursor | null,
  minRows: number = DAY_PAGE_MIN_ROWS,
): Promise<DayPage> {
  const { range } = scope;
  if (!isDayKey(range.fromDay) || !isDayKey(range.toDay)) {
    throw new Error(`historyQueries: not a day range: ${range.fromDay}..${range.toDay}`);
  }
  const lo = range.fromDay;
  let hi = range.toDay;
  if (cursor !== null) {
    if (!isDayKey(cursor.beforeDay)) throw new Error(`historyQueries: not a day key: ${cursor.beforeDay}`);
    const before = shiftDay(cursor.beforeDay, -1);
    if (before < hi) hi = before;
  }
  if (hi < lo) return { days: [], span: null, next: null };

  // Nothing the scope shows lies before its earliest row, so the read stops there; the
  // page still ACCOUNTS for every day down to the window's start (none of them holds a row).
  const regimens = await readRegimens(petId);
  const earliest = await earliestScopeDay(petId, scope, regimens);
  if (earliest === null || shiftDay(earliest, -1) > hi) return { days: [], span: { fromDay: lo, toDay: hi }, next: null };
  // A day of slack: a look sits on its `local_day`, which can be a day either side of its
  // instant's day for an owner who crossed a zone.
  const reachBack = shiftDay(earliest, -1);
  const floor = reachBack > lo ? reachBack : lo;

  const days: HistoryDay[] = [];
  let count = 0;
  let chunkHi = hi;
  let chunkDays = FIRST_CHUNK_DAYS;
  for (;;) {
    const reach = shiftDay(chunkHi, -(chunkDays - 1));
    const chunkLo = reach > floor ? reach : floor;
    for (const day of await readDays(petId, scope, { fromDay: chunkLo, toDay: chunkHi }, regimens)) {
      days.push(day);
      count += day.rows.length;
      if (count >= minRows) {
        return { days, span: { fromDay: day.day, toDay: hi }, next: day.day > lo ? { beforeDay: day.day } : null };
      }
    }
    if (chunkLo <= floor) return { days, span: { fromDay: lo, toDay: hi }, next: null };
    chunkHi = shiftDay(chunkLo, -1);
    chunkDays = Math.min(chunkDays * 2, MAX_CHUNK_DAYS);
  }
}
