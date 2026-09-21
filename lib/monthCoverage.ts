// The coverage door — "September · logged 15 of 17 days · Patterns ›" (Design v2 —
// the whole day, D2-4 / CUL-1066; the round-4 page §01: "the door at the end speaks
// coverage, not a count, so it cannot rhyme with the Signal's numbers").
//
// THREE POPULATIONS, NONE RHYMING (the Data Scientist's line on the page): the Signal's
// line is the week's episodes, the count line is the day's rows, and this door is the
// MONTH's logged DAYS — how many of the days that have happened so far this month hold
// anything at all. A day counts once however much was logged, and a day with only a
// look counts: the owner answered, and the vet report's own coverage denominators say
// the same (daily-look spec §5.6). C-3: the count is spoken as a record fact over a
// named window, and the window is the month to date, not a display cap.
//
// Pure over instants + one `now`, timezone-honest through `localDayIndex` (the owner's
// midnight, C-29). The read that feeds it is `readMonthOccurredAts` in
// `lib/spineReads.ts`.

import { dayKeyFromIndex, localDayIndex } from './utils';

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
  occurredAts: readonly string[],
  nowMs: number,
  timeZone?: string,
): MonthCoverage {
  const todayIdx = localDayIndex(nowMs, timeZone);
  const todayKey = dayKeyFromIndex(todayIdx);
  const monthPrefix = todayKey.slice(0, 7);
  const elapsed = Number(todayKey.slice(8, 10));
  const days = new Set<number>();
  for (const iso of occurredAts) {
    const ms = Date.parse(iso);
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
