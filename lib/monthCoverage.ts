// The coverage door — "September · logged 15 of 17 days · Patterns ›" (Design v2 —
// the whole day, D2-4 / CUL-1066; the round-4 page §01: "the door at the end speaks
// coverage, not a count, so it cannot rhyme with the Signal's numbers").
//
// THREE POPULATIONS, NONE RHYMING (the Data Scientist's line on the page): the Signal's
// line is the week's episodes, the count line is the day's rows, and this door is the
// MONTH's logged DAYS — how many of the days that have happened so far this month hold
// an EVENT. A day counts once however much was logged. A day holding only a look does
// NOT count: a look "joins no coverage line of any other surface" (daily-look spec §5.6,
// floor 5), and the vet report measured what happens otherwise — "3 days with a log"
// became "31", bought by tapping a chip once a day (generate-report/report.ts, CUL-891).
// This module's first draft counted them, on a misread of that very fix; the adversarial
// pass caught it (F1) with the Today card one row above reading "Nothing logged yet
// today" over a door reading "logged 17 of 17 days". So the rows carry their type and the
// model excludes the look itself, where a test can see it. C-3: the count is spoken as a
// record fact over a named window, and the window is the month to date.
//
// Pure over instants + one `now`, timezone-honest through `localDayIndex` (the owner's
// midnight, C-29). The read that feeds it is `readMonthOccurredAts` in
// `lib/spineReads.ts`.

import { eventTintCategory } from './dayEvents';
import { dayKeyFromIndex, localDayIndex } from './utils';

/** One row of the month's population: its instant and its type (the type is what lets
 *  the model refuse a look). */
export interface MonthRow {
  occurredAt: string;
  eventType: string;
}

export interface MonthCoverage {
  /** "September" */
  monthLabel: string;
  /** Distinct logged days this month, up to and including today. */
  logged: number;
  /** Days of the month elapsed, today included. */
  elapsed: number;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function monthCoverage(
  rows: readonly MonthRow[],
  nowMs: number,
  timeZone?: string,
): MonthCoverage {
  const todayIdx = localDayIndex(nowMs, timeZone);
  const todayKey = dayKeyFromIndex(todayIdx);
  const monthPrefix = todayKey.slice(0, 7);
  const elapsed = Number(todayKey.slice(8, 10));
  const days = new Set<number>();
  for (const row of rows) {
    // Floor 5: a look enters no other surface's coverage line.
    if (eventTintCategory(row.eventType) === 'look') continue;
    const ms = Date.parse(row.occurredAt);
    if (!Number.isFinite(ms)) continue;
    const idx = localDayIndex(ms, timeZone);
    if (idx > todayIdx) continue; // a backdated-forward row is not a logged day yet
    if (dayKeyFromIndex(idx).slice(0, 7) !== monthPrefix) continue;
    days.add(idx);
  }
  return {
    monthLabel: MONTHS[Number(todayKey.slice(5, 7)) - 1],
    logged: days.size,
    elapsed,
  };
}

/** The door's line. "logged 1 of 1 day" on the first; never a percentage. */
export function monthCoverageLine(c: MonthCoverage): string {
  return `${c.monthLabel} · logged ${c.logged} of ${c.elapsed} ${c.elapsed === 1 ? 'day' : 'days'}`;
}
