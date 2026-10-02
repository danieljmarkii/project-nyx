// The coverage door — "September · logged 15 of 17 days · Patterns ›" (Design v2 —
// the whole day, D2-4 / CUL-1066; the round-4 page §01: "the door at the end speaks
// coverage, not a count, so it cannot rhyme with the Signal's numbers").
//
// THREE POPULATIONS, NONE RHYMING (the Data Scientist's line on the page): the Signal's
// line is the week's episodes, the count line is the day's rows, and this door is the
// MONTH's logged DAYS — how many of the month's finished days since the record began
// hold an EVENT. A day counts once however much was logged. A day holding only a look does
// NOT count: a look "joins no coverage line of any other surface" (daily-look spec §5.6,
// floor 5), and the vet report measured what happens otherwise — "3 days with a log"
// became "31", bought by tapping a chip once a day (generate-report/report.ts, CUL-891).
// This module's first draft counted them, on a misread of that very fix; the adversarial
// pass caught it (F1) with the Today card one row above reading "Nothing logged yet
// today" over a door reading "logged 17 of 17 days". So the rows carry their type and the
// model excludes the look itself, where a test can see it. C-3: the count is spoken as a
// record fact over a named window, and the window is below.
//
// THE WINDOW (CUL-1221, the critique's BRK-22). The denominator is not the day of the
// month. It runs from the LATER of the month's 1st and the record's first day — the local
// day of the pet's earliest non-look event, read over the WHOLE record (C-35: a predicate
// about the record takes the record) — through YESTERDAY. Days before the record are not
// days nobody logged (Patterns names them "before the record"), and today is not a miss
// while it is still happening (History v2 R-1); the Today card above the door speaks for
// today. Today is out of BOTH numbers, never the numerator alone: counting today only once
// it is logged would gate the ratio on the thing it counts (C-3), and the PM ruled (a),
// 2026-09-27. A record with no event yet gets the month's invitation, never a ratio.
//
// Pure over instants + one `now`, timezone-honest through `localDayIndex` (the owner's
// midnight, C-29). The reads that feed it are `readMonthRows` and `readRecordStart` in
// `lib/spineReads.ts`.

import { eventTintCategory } from './dayEvents';
import { dayKeyFromIndex, localDayIndex } from './utils';

/** One row of the month's population: its instant and its type (the type is what lets
 *  the model refuse a look). */
export interface MonthRow {
  occurredAt: string;
  eventType: string;
}

/** What the door can say about the month. Every state that is not `counted` renders no
 *  ratio, because there is no window yet for a ratio to be a claim about. */
export type MonthCoverage =
  /** No event yet (or only future-dated ones): the invitation. */
  | { kind: 'empty'; monthLabel: string }
  /** The record's first day is today: nothing has had a chance to be missed. */
  | { kind: 'record_starts_today'; monthLabel: string }
  /** Today is the 1st and the record is older: the month has no finished day yet. */
  | { kind: 'month_starts_today'; monthLabel: string }
  /** `logged` of the `days` from the window's start through yesterday. */
  | { kind: 'counted'; monthLabel: string; logged: number; days: number };

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Floor 5: a look enters no other surface's coverage line — not its count, and not
 *  where its record begins. */
function isLook(eventType: string): boolean {
  return eventTintCategory(eventType) === 'look';
}

/** The window the door counts over: epoch-day indices `[fromIdx, toIdx]`, inclusive, in
 *  the owner's zone. `null` start = no record yet. `fromIdx > toIdx` is an empty window
 *  (the record, or the month, starts today). Exported as the ONE rule for "which of this
 *  month's days can be counted", so Patterns can adopt it (CUL-1194) rather than restate
 *  it. */
export interface CoverageWindow {
  todayIdx: number;
  monthStartIdx: number;
  /** The record's first local day, or null when the record holds no event. */
  recordStartIdx: number | null;
  fromIdx: number;
  toIdx: number;
}

export function coverageWindow(
  recordStartIso: string | null,
  nowMs: number,
  timeZone?: string,
): CoverageWindow {
  const todayIdx = localDayIndex(nowMs, timeZone);
  const dayOfMonth = Number(dayKeyFromIndex(todayIdx).slice(8, 10));
  const monthStartIdx = todayIdx - (dayOfMonth - 1);
  // C-40: the instant is PARSED, never compared as text; the day is keyed in the zone.
  const startMs = recordStartIso != null ? Date.parse(recordStartIso) : NaN;
  const recordStartIdx = Number.isFinite(startMs) ? localDayIndex(startMs, timeZone) : null;
  const fromIdx = Math.max(monthStartIdx, recordStartIdx ?? monthStartIdx);
  return { todayIdx, monthStartIdx, recordStartIdx, fromIdx, toIdx: todayIdx - 1 };
}

/**
 * The month's coverage for the door.
 *
 * `recordStartIso` is the instant of the pet's earliest NON-LOOK event across the whole
 * record (`readRecordStart`), not the earliest row in `rows` — `rows` is bounded to the
 * month, so its first row is the month's first log, and a record that began in August
 * would otherwise start the window at the month's first logged day and hide every
 * unlogged day before it.
 */
export function monthCoverage(
  rows: readonly MonthRow[],
  recordStartIso: string | null,
  nowMs: number,
  timeZone?: string,
): MonthCoverage {
  const w = coverageWindow(recordStartIso, nowMs, timeZone);
  const monthLabel = MONTHS[Number(dayKeyFromIndex(w.todayIdx).slice(5, 7)) - 1];
  // A record whose only events are dated ahead has not started: nothing has been missed.
  if (w.recordStartIdx == null || w.recordStartIdx > w.todayIdx) return { kind: 'empty', monthLabel };
  if (w.fromIdx > w.toIdx) {
    return w.recordStartIdx === w.todayIdx
      ? { kind: 'record_starts_today', monthLabel }
      : { kind: 'month_starts_today', monthLabel };
  }
  const days = new Set<number>();
  for (const row of rows) {
    if (isLook(row.eventType)) continue;
    const ms = Date.parse(row.occurredAt);
    if (!Number.isFinite(ms)) continue;
    const idx = localDayIndex(ms, timeZone);
    // Inside the window only: never before the record or the month, never today, never
    // a row dated ahead.
    if (idx < w.fromIdx || idx > w.toIdx) continue;
    days.add(idx);
  }
  return { kind: 'counted', monthLabel, logged: days.size, days: w.toIdx - w.fromIdx + 1 };
}

/** The door's line. Never a percentage, and a ratio only over a window that exists. */
export function monthCoverageLine(c: MonthCoverage): string {
  switch (c.kind) {
    case 'empty':
      // Patterns' own invitation (lib/monthModel.ts), so the door and the page it opens
      // say the same thing about an empty record.
      return `${c.monthLabel} · the month fills in from the first entry`;
    case 'record_starts_today':
      return `${c.monthLabel} · the record starts today`;
    case 'month_starts_today':
      return `${c.monthLabel} · the month starts today`;
    case 'counted':
      return `${c.monthLabel} · logged ${c.logged} of ${c.days} ${c.days === 1 ? 'day' : 'days'}`;
  }
}
