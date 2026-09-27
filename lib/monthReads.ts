// The month's READS (Design v2 — the whole day, D2-5 · CUL-1067) — the local-SQLite
// facts `lib/monthModel.ts` is built from. The model is pure; this is the one file that
// knows the tables, and the one place the zone decision is made (`toLocalDayKey` on the
// device — the month's boundary is the owner's midnight, C-29).
//
// ── ONE PREDICATE PER FACT, EACH THE NEIGHBOUR'S ──────────────────────────────
//   • An EPISODE is a vomit row after the engine's re-log collapse (`episodeDaysOf`,
//     D2-1) — four rows of one bout are one mark.
//   • A CONTINUATION day holds a vomit row but no episode start: a bout that began the
//     night before and went on past midnight (CUL-1226). The rose stays the episode's,
//     but the day's WORDS follow its rows, so it is never spoken as "no vomiting" — the
//     History strip's rule (`lib/stripMarks.ts`, NEVER A FALSE ABSENCE). The bout each
//     row belongs to is read off the engine's own collapse (`collapseEpisodes`, the same
//     gap `episodeDaysOf` uses), never a restated gap (C-34).
//   • The RECORD'S START is the first surviving event that is not a look, by its parsed
//     instant — History's definition (`TYPE_FIRSTS_SQL` → `readRecordStartDay`,
//     `lib/historyQueries.ts`), mirrored here because that module imports this one
//     (CUL-1194; GAP-24's one start, held equal by `lib/monthReads.test.ts`).
//   • A LOGGED day is a day the owner logged ANYTHING about the pet — every event type
//     except a look (`check_in`: a look never enters another surface's coverage line,
//     `docs/nyx-daily-look-requirements.md`). This is the COVERAGE question, and the
//     answer is the PM's ruling on it (R3, 2026-08-28: "a logged cough IS a logged day",
//     `lib/patternsTiming.ts`'s own comment on `CORRELATION_SYMPTOM_TYPES`). The first
//     draft borrowed the Trial panel's `loggedDays` — the engine's COMPARISON-GATE set
//     (feeding OR vomit / diarrhea / itch / scratch / skin) — and a stool-, cough-,
//     lethargy- or dose-only day drew grey with its own rows one tap away (the
//     adversarial pass on CUL-1067). Same word, two questions, two constants (C-34):
//     the panel's "logged N of M" gates whether a vomiting comparison may be published
//     and stays the gate set; the month's grey square says whether the owner logged, and
//     is this. Because vomit is in it, an episode day is a logged day by construction —
//     the burden `DayMark`'s header puts on this caller.
//   • A LEFT-SOME day is a qualifying meal (`qualifyingIntakeMeals`: rated, non-treat,
//     non-free-fed) that was not finished (`isFinishedMeal`) — the intake lens's own
//     definition, so the paler hairline and the Meals calendar count the same meals.
//   • A DOSED day is a delivered dose — `given` or `partial`, the therapy-delivered
//     count B-618 D1 ratified — never a missed or refused one.
//   • A PHOTOGRAPHED day is any surviving attachment on a surviving event; its VERDICT
//     is the per-incident read's rose, read from the PHONE'S COPY (`lib/readCopy.ts`)
//     through the one read predicate every surface shares (`isWorthACall`,
//     `lib/readState.ts`; HV-5 / CUL-1162), so offline the rose still draws. A day whose
//     read the phone does not hold, or cannot read, is `seen`: presence escalates and
//     absence never reassures, so a missing verdict is never drawn as a benign one.
//
// ── BOUNDS ARE PARSED, NEVER COMPARED AS TEXT (C-40) ───────────────────────────
// A local write spells an instant `…Z` and a hydrated row `…+00:00`; the two do not
// order as text at the exact-equality second. So the SQL bound is a COARSE prefilter
// with a day of slack on each side, and the day a row belongs to is decided in JS from
// the parsed instant. The slack costs a few rows; a text bound costs a boundary row.

import { getDb, getTimeline, type TimelineRow } from './db';
import { episodeDaysOf } from './chartModels';
import { collapseEpisodes, DEFAULT_MEAL_TIMING_CONFIG, type MealTimingConfig } from './mealTiming';
import { TIMING_SYMPTOM_TYPE } from './patternsTiming';
import { isFinishedMeal, qualifyingIntakeMeals, type AnalyticsMeal } from './analytics';
import { getActiveArrangementsForPet } from './feedingArrangements';
import { readCopies } from './readCopy';
import { isWorthACall } from './readState';
import { dayKeyToLocalDate, toLocalDayKey } from './utils';
import type { MonthContinuationDay, MonthPhotoDay } from './monthModel';

export interface MonthFacts {
  episodeDays: string[];
  /** Days holding a vomit row but no episode start, each with the day its bout began. */
  continuationDays: MonthContinuationDay[];
  loggedDays: string[];
  leftSomeDays: string[];
  dosedDays: string[];
  photoDays: MonthPhotoDay[];
  /** The record's first day, or null for a pet with no events at all. */
  recordStart: string | null;
}

export interface MonthReadRange {
  /** The first local day to read, inclusive. */
  fromKey: string;
  /** The last local day to read, inclusive. */
  toKey: string;
}

const MS_PER_DAY = 86_400_000;
/** The Julian day of 1970-01-01T00:00Z — `julianday()`'s answer mapped back to an instant. */
const UNIX_EPOCH_JULIAN_DAY = 2_440_587.5;
/** The daily look's event type — the one row that is never coverage (§5.6, T-5). */
export const LOOK_EVENT_TYPE = 'check_in';
/** Delivered doses — B-618 D1's therapy-delivered count. */
const DELIVERED_ADHERENCE = ['given', 'partial'] as const;

/** `[after, before)` ISO bounds with a day of slack on each side of the local range —
 *  the coarse SQL prefilter; the parsed instant decides membership. */
function slackBounds(range: MonthReadRange): { after: string; before: string } | null {
  const from = dayKeyToLocalDate(range.fromKey);
  const to = dayKeyToLocalDate(range.toKey);
  if (!from || !to) return null;
  return {
    after: new Date(from.getTime() - MS_PER_DAY).toISOString(),
    before: new Date(to.getTime() + 2 * MS_PER_DAY).toISOString(),
  };
}

/** The local day key of an instant, or null when it does not parse. */
function keyOfIso(iso: string): string | null {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? toLocalDayKey(new Date(ms)) : null;
}

/** A `julianday()` answer as an instant, or null. Rounded to the ms as History rounds it
 *  (`msOfJulianDay`, `lib/historyQueries.ts`): a double carries a Julian day to ~50µs,
 *  and a row at exactly local midnight must not come back a hair before it, on the
 *  previous day. */
function msOfJulianDay(jd: number | null | undefined): number | null {
  return jd == null || !Number.isFinite(jd) ? null : Math.round((jd - UNIX_EPOCH_JULIAN_DAY) * MS_PER_DAY);
}

/**
 * The days a bout CONTINUES into: a day holding a vomit row whose bout began on an
 * earlier day, and on which no bout begins. Each row's bout is the latest episode start
 * at or before it, from the engine's own collapse — bouts are disjoint in time, so at
 * most one can cross into a day. A day on which a new bout begins is an episode day and
 * speaks its own count; it is not listed here. Ordered by day.
 *
 * STATED BLIND SPOT (C-41): a bout is read only as far back as the rows the caller hands
 * over. The month's read reaches a day of slack before its first day, so a bout running
 * longer than that is dated from its first row in the slack. The read's first day is at
 * least three weeks before the grid's first row (nine weeks of bars over at most six
 * rows), so no drawn day is reached.
 */
export function continuationDaysOf(
  rows: readonly { ms: number }[],
  keyOf: (ms: number) => string,
  config: MealTimingConfig = DEFAULT_MEAL_TIMING_CONFIG,
): MonthContinuationDay[] {
  const valid = rows.filter((r) => Number.isFinite(r.ms));
  const starts = collapseEpisodes(valid, config.episodeGapHours).map((r) => r.ms);
  const startDays = new Set(starts.map(keyOf));
  const byDay = new Map<string, string>();
  const sorted = [...valid].sort((a, b) => a.ms - b.ms);
  let s = 0;
  for (const r of sorted) {
    while (s + 1 < starts.length && starts[s + 1] <= r.ms) s += 1;
    const day = keyOf(r.ms);
    const from = keyOf(starts[s]);
    if (from !== day && !startDays.has(day) && !byDay.has(day)) byDay.set(day, from);
  }
  return [...byDay].map(([day, from]) => ({ day, from })).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

function inRange(key: string, range: MonthReadRange): boolean {
  // Keys are fixed-width `YYYY-MM-DD`, so a lexical compare IS a calendar compare —
  // the C-40 hazard is two spellings of an instant, and a day key has one spelling.
  return key >= range.fromKey && key <= range.toKey;
}

/** The pet's local-day facts over a range of days. Every read is soft-delete aware. */
export async function readMonthFacts(petId: string, range: MonthReadRange): Promise<MonthFacts> {
  const bounds = slackBounds(range);
  if (!bounds) throw new Error(`monthReads: not a day range: ${range.fromKey}..${range.toKey}`);
  const db = getDb();
  const keyOf = (ms: number) => toLocalDayKey(new Date(ms));

  const [eventRows, mealRows, doseRows, photoRows, firstRow, arrangements] = await Promise.all([
    db.getAllAsync<{ event_type: string; occurred_at: string }>(
      `SELECT event_type, occurred_at FROM events
        WHERE pet_id = ? AND deleted_at IS NULL
          AND occurred_at >= ? AND occurred_at < ?`,
      [petId, bounds.after, bounds.before],
    ),
    db.getAllAsync<{ food_item_id: string | null; intake_rating: string | null; occurred_at: string; food_type: string | null }>(
      `SELECT m.food_item_id, m.intake_rating, e.occurred_at, f.food_type
         FROM meals m
         JOIN events e ON e.id = m.event_id
         LEFT JOIN food_items_cache f ON f.id = m.food_item_id
        WHERE e.pet_id = ? AND e.deleted_at IS NULL
          AND e.occurred_at >= ? AND e.occurred_at < ?`,
      [petId, bounds.after, bounds.before],
    ),
    db.getAllAsync<{ occurred_at: string }>(
      `SELECT e.occurred_at
         FROM medication_administrations a
         JOIN events e ON e.id = a.event_id
        WHERE e.pet_id = ? AND e.deleted_at IS NULL
          AND a.adherence IN (${DELIVERED_ADHERENCE.map(() => '?').join(',')})
          AND e.occurred_at >= ? AND e.occurred_at < ?`,
      [petId, ...DELIVERED_ADHERENCE, bounds.after, bounds.before],
    ),
    db.getAllAsync<{ event_id: string; occurred_at: string }>(
      `SELECT DISTINCT a.event_id, e.occurred_at
         FROM event_attachments a
         JOIN events e ON e.id = a.event_id
        WHERE e.pet_id = ? AND e.deleted_at IS NULL
          AND e.occurred_at >= ? AND e.occurred_at < ?`,
      [petId, bounds.after, bounds.before],
    ),
    // The record's start: never a look (§5.6), and the earliest by the PARSED instant —
    // a text ORDER BY sorts `…+00:00` before `…Z` whatever the instants (C-40), and
    // `MIN(julianday())` skips a row whose instant does not parse (CUL-1194).
    // STATED BLIND SPOT (C-41): the start is parsed by SQLite, a row's day by `Date.parse`.
    // They agree on every spelling the app writes (`…Z`, `…+00:00`); a zoneless
    // `YYYY-MM-DD HH:MM:SS` would read as UTC here and local there, and could date a row
    // before the start. No writer produces it (`events.occurred_at` has no SQL default),
    // and History's `readRecordStartDay` shares the exposure, so the parity test cannot see it.
    db.getFirstAsync<{ first_jd: number | null }>(
      `SELECT MIN(julianday(occurred_at)) AS first_jd FROM events
        WHERE pet_id = ? AND deleted_at IS NULL AND event_type <> ?`,
      [petId, LOOK_EVENT_TYPE],
    ),
    getActiveArrangementsForPet(petId),
  ]);

  // Episodes: vomit rows, collapsed through the engine's own re-log gap.
  const vomitRows = eventRows
    .filter((r) => r.event_type === TIMING_SYMPTOM_TYPE)
    .map((r) => ({ ms: Date.parse(r.occurred_at) }))
    .filter((r) => Number.isFinite(r.ms));
  const episodeDays = episodeDaysOf(vomitRows, keyOf).filter((k) => inRange(k, range));
  const continuationDays = continuationDaysOf(vomitRows, keyOf).filter((c) => inRange(c.day, range));

  // Logged: any surviving event that is not a look (the coverage question, see the header).
  const loggedSet = new Set<string>();
  for (const r of eventRows) {
    if (r.event_type === LOOK_EVENT_TYPE) continue;
    const k = keyOfIso(r.occurred_at);
    if (k && inRange(k, range)) loggedSet.add(k);
  }

  // Left some: an unfinished qualifying meal, by the intake lens's own definition.
  const freeFed = new Set(arrangements.map((a) => a.food_item_id));
  const meals: AnalyticsMeal[] = mealRows
    .map((r) => ({
      ms: Date.parse(r.occurred_at),
      foodItemId: r.food_item_id,
      foodLabel: null,
      foodType: r.food_type,
      primaryProtein: null,
      intakeRating: r.intake_rating,
    }))
    .filter((m) => Number.isFinite(m.ms));
  const leftSomeSet = new Set<string>();
  for (const m of qualifyingIntakeMeals(meals, freeFed)) {
    if (isFinishedMeal(m)) continue;
    const k = keyOf(m.ms);
    if (inRange(k, range)) leftSomeSet.add(k);
  }

  const dosedSet = new Set<string>();
  for (const r of doseRows) {
    const k = keyOfIso(r.occurred_at);
    if (k && inRange(k, range)) dosedSet.add(k);
  }

  // Photographed days, with the verdict read in one batch and degraded to `seen`.
  const photoEvents: { eventId: string; key: string }[] = [];
  for (const r of photoRows) {
    const k = keyOfIso(r.occurred_at);
    if (k && inRange(k, range)) photoEvents.push({ eventId: r.event_id, key: k });
  }
  const called = await readWorthACall(photoEvents.map((p) => p.eventId));
  const photoDays: MonthPhotoDay[] = photoEvents
    .map((p): MonthPhotoDay => ({ day: p.key, verdict: called.has(p.eventId) ? 'worth_a_call' : 'seen' }))
    // Ordered by day, then the escalation first: a DISTINCT read has no order of its own.
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.verdict === b.verdict ? 0 : a.verdict === 'worth_a_call' ? -1 : 1));

  const firstMs = msOfJulianDay(firstRow?.first_jd);
  return {
    episodeDays,
    continuationDays,
    loggedDays: [...loggedSet].sort(),
    leftSomeDays: [...leftSomeSet].sort(),
    dosedDays: [...dosedSet].sort(),
    photoDays,
    recordStart: firstMs === null ? null : keyOf(firstMs),
  };
}

/**
 * The event ids among `eventIds` whose read is the rose, from the phone's copy (HV-5 /
 * CUL-1162): no network, so the month draws the same marks offline. The question is
 * `isWorthACall`, the rose branch `readStateOf` is built on, so the month and every
 * other surface agree by construction: `worth_a_call` at any status (a failed re-read
 * never takes a live one away, CUL-812), and a verdict the app does not recognise.
 * Hide is no input. On a local failure it answers EMPTY, which the caller draws as
 * `seen`: a verdict the app could not read is not a benign verdict.
 */
export async function readWorthACall(eventIds: readonly string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (eventIds.length === 0) return out;
  try {
    const copies = await readCopies(eventIds);
    for (const [eventId, copy] of copies) {
      if (isWorthACall(copy)) out.add(eventId);
    }
  } catch (e) {
    console.warn('[month] read copy failed:', e);
  }
  return out;
}

// ── One day's rows, for the day opening in place ─────────────────────────────

/** A single day's events never approach this; a safe ceiling (the drill-in's own). */
const DAY_ROW_LIMIT = 200;
// STATED BLIND SPOT (C-41): the limit is applied by `getTimeline` over the three-day
// slack window, newest first, so past ~200 rows in three days the target day would
// truncate silently. Unreachable at any plausible volume; said here so it is not read
// as coverage.

/**
 * Every surviving event on one LOCAL day, oldest first. The bounds are the local day's
 * with a day of slack each side (C-40: the SQL bound is a coarse prefilter), and the
 * parsed instant decides membership. The day's door into History sends `?day=`, which
 * History reads as this same local day (`lib/historyDateFilter.ts`, CUL-1073); a bare
 * `?date=` is still the flag-off calendar's UTC day, a different set of events.
 * `lib/historyPage.test.ts` drives both reads over one table and holds them equal.
 */
export async function readDayRows(petId: string, dayKey: string): Promise<TimelineRow[]> {
  const bounds = slackBounds({ fromKey: dayKey, toKey: dayKey });
  if (!bounds) throw new Error(`monthReads: not a day key: ${dayKey}`);
  const rows = await getTimeline(petId, DAY_ROW_LIMIT, 0, null, bounds.after, bounds.before);
  return rows
    .filter((r) => keyOfIso(r.occurred_at) === dayKey)
    .sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
}
