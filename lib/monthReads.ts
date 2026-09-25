// The month's READS (Design v2 — the whole day, D2-5 · CUL-1067) — the local-SQLite
// facts `lib/monthModel.ts` is built from. The model is pure; this is the one file that
// knows the tables, and the one place the zone decision is made (`toLocalDayKey` on the
// device — the month's boundary is the owner's midnight, C-29).
//
// ── ONE PREDICATE PER FACT, EACH THE NEIGHBOUR'S ──────────────────────────────
//   • An EPISODE is a vomit row after the engine's re-log collapse (`episodeDaysOf`,
//     D2-1) — four rows of one bout are one mark.
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
//     is the per-incident read's `worth_a_call`, read from the server in one batch.
//     Offline, or on any error, a photographed day is `seen` — presence escalates and
//     absence never reassures, so a missing verdict is never drawn as a benign one.
//
// ── BOUNDS ARE PARSED, NEVER COMPARED AS TEXT (C-40) ───────────────────────────
// A local write spells an instant `…Z` and a hydrated row `…+00:00`; the two do not
// order as text at the exact-equality second. So the SQL bound is a COARSE prefilter
// with a day of slack on each side, and the day a row belongs to is decided in JS from
// the parsed instant. The slack costs a few rows; a text bound costs a boundary row.

import { getDb, getTimeline, type TimelineRow } from './db';
import { supabase } from './supabase';
import { episodeDaysOf } from './chartModels';
import { TIMING_SYMPTOM_TYPE } from './patternsTiming';
import { isFinishedMeal, qualifyingIntakeMeals, type AnalyticsMeal } from './analytics';
import { getActiveArrangementsForPet } from './feedingArrangements';
import { escalationSurvivesFailure } from './incidentReadState';
import { dayKeyToLocalDate, toLocalDayKey } from './utils';
import type { MonthPhotoDay } from './monthModel';

export interface MonthFacts {
  episodeDays: string[];
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
    db.getFirstAsync<{ occurred_at: string }>(
      `SELECT occurred_at FROM events
        WHERE pet_id = ? AND deleted_at IS NULL
        ORDER BY occurred_at ASC LIMIT 1`,
      [petId],
    ),
    getActiveArrangementsForPet(petId),
  ]);

  // Episodes: vomit rows, collapsed through the engine's own re-log gap.
  const vomitRows = eventRows
    .filter((r) => r.event_type === TIMING_SYMPTOM_TYPE)
    .map((r) => ({ ms: Date.parse(r.occurred_at) }))
    .filter((r) => Number.isFinite(r.ms));
  const episodeDays = episodeDaysOf(vomitRows, keyOf).filter((k) => inRange(k, range));

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

  return {
    episodeDays,
    loggedDays: [...loggedSet].sort(),
    leftSomeDays: [...leftSomeSet].sort(),
    dosedDays: [...dosedSet].sort(),
    photoDays,
    recordStart: firstRow ? keyOfIso(firstRow.occurred_at) : null,
  };
}

/**
 * The event ids among `eventIds` whose per-incident read said `worth_a_call`. The
 * `event_ai_analysis` table is server-owned and never mirrored into SQLite, so this is
 * one network read per month page — and on any failure it answers EMPTY, which the
 * caller draws as `seen`: a verdict the app could not fetch is not a benign verdict.
 * `escalationSurvivesFailure` is the shipped predicate (CUL-812): a row that failed a
 * later re-read but still holds the escalation still counts.
 */
export async function readWorthACall(eventIds: readonly string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (eventIds.length === 0) return out;
  try {
    const { data, error } = await supabase
      .from('event_ai_analysis')
      .select('event_id, recommendation')
      .in('event_id', [...eventIds]);
    if (error || !data) return out;
    for (const row of data as { event_id: string; recommendation: string | null }[]) {
      if (escalationSurvivesFailure(row)) out.add(row.event_id);
    }
  } catch {
    // Offline or unreachable: no verdicts, every photographed day stays `seen`.
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
