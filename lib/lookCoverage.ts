// The Noticed card's COVERAGE FOOTER — the three forms (CUL-873 / N-4b).
//
// docs/nyx-daily-look-requirements.md §3.3 part 2, R11, L-15 / T-16, T-19.
//
// ── WHAT IT IS, AND WHOSE ACT IT COUNTS ──────────────────────────────────────
// *Answered 24 of the last 28 days.* A rolling 28-day window of LOCAL days, counted on
// the row's stored `local_day` (T-19 — never re-derived from `occurred_at`, because the
// client and the report bucket days on two clocks and this number has to be the same on
// both). The verb is the OWNER'S ACT: *answered*, never *looked* (which is her claim) and
// never *nothing unusual on N* (which is a run about the pet). It is a line, not a door.
//
// ── R11 IS A PM RULING OVER A RECORDED CLINICAL DISSENT ──────────────────────
// Dr. Chen's reassurance-ledger rows 6 (the streak) and 12 (reassurance by habit — a
// count of the owner's taps rewards the reflex tap) were overruled. The forms below are
// the mitigations the team can offer inside that ruling, and each one is here because a
// review broke the version without it:
//
//   • THE WINDOW CANNOT ACCRUE. Day 200 reads like day 40. There is no lifetime count
//     anywhere on Home.
//   • AT FULL COVERAGE IT STATES THE WINDOW ALONE. The third adversarial pass showed the
//     "it floats" mitigation is false at the top of the range: 28 of 28 is a consecutive
//     count by definition, and the reflex tapper the dissent named is exactly the owner
//     who lives there. So the number leaves and the window stays.
//   • BELOW THE FLOOR IT DOES NOT RENDER AT ALL. The first draft printed *Answered 4 of
//     the last 28 days* on the very card the receipt's floor exists to spare a worried
//     owner on day four.
//   • AFTER A WITHHELD PERIOD IT DOES NOT RENDER UNTIL THE WINDOW HAS MOVED PAST THE WHOLE
//     ILLNESS — the withheld days AND the gap they caused, measured to the first day she
//     answered again — and NEVER as the saturation form, which the fourth pass showed would
//     make one sentence mean both "you answered every day" and "your cat was ill". Waiting
//     only for the marked day to leave the window returns a number DEPRESSED by the days
//     nobody opened the app during the illness, which is the same reading by another route
//     (measured by the adversarial pass on CUL-873). On a chronic pet the footer may be
//     absent for long stretches, and absence carries no achievement reading.
//   • ABSENT ON A DAY WITH NO LOOK (Q-16). The resting card never grows; a skip costs
//     nothing on screen. An Undo of the day's only look takes the footer with it, so an
//     Undo never reads as a failed save.

import { localDayIndex, localDayIndexOf, dayKeyFromIndex } from './utils';
import type { LookDayRow } from './lookDayCounts';

/** The rolling window, in local days, inclusive of today. */
export const LOOK_COVERAGE_WINDOW_DAYS = 28;

/**
 * Q-13, PROVISIONAL — fourteen answered days IN THE WINDOW, below which neither the
 * footer nor a receipt renders. Stated once and shared by both, because the fourth
 * adversarial pass found the spec had drifted into two numbers for one floor.
 */
export const LOOK_COVERAGE_FLOOR_DAYS = 14;

/** Why the footer is absent — carried rather than collapsed to null, so a test can pin
 *  the REASON and a future surface (Patterns) can say the lapse out loud with its own
 *  denominator, which is where §3.3 puts that job. */
export type LookCoverageAbsence =
  | 'no_look_today'
  | 'below_floor'
  | 'withheld';

export type LookCoverage =
  | { form: 'absent'; reason: LookCoverageAbsence }
  | { form: 'ratio'; answered: number; window: number }
  | { form: 'window'; window: number };

export interface LookCoverageInput {
  nowMs: number;
  /** Explicit IANA zone for the day arithmetic. Production passes nothing — the DEVICE
   *  zone is the owner's midnight (T-19). Present so a timezone-honest fixture can pin
   *  the boundary instead of assuming the runner's (C-29). */
  timeZone?: string;
  /**
   * Is the card withholding RIGHT NOW (`lookWithheld`)? Passed rather than re-derived:
   * this module counts days and must not grow a second opinion about the pet's intake.
   */
  withheldNow: boolean;
  /**
   * The last local day this device withheld for the pet — `null` when there is none,
   * **`undefined` when the mark could not be read**, which suppresses. The footer is a
   * nicety; its absence carries no reading, while a number that under-counts a
   * hospitalisation is the thing T-16 exists to prevent. The mark's two holes (a day the
   * app was never opened on, a wiped device) are documented at its source
   * (`lib/lookWithheld.ts`) and both fail toward the footer returning.
   */
  lastWithheldDay: string | null | undefined;
}

/**
 * The footer, decided. Pure over the record it is handed.
 *
 * `record` is every LIVE look row for the pet (`loadLookDays` has already dropped the
 * soft-deleted ones through the parent). A row outside the window is ignored here rather
 * than at the read: a window may INDEX, only the total may be SPOKEN, and the total this
 * line speaks is its own (C-3).
 */
export function lookCoverage(record: readonly LookDayRow[], input: LookCoverageInput): LookCoverage {
  const todayIndex = localDayIndex(input.nowMs, input.timeZone);
  const firstIndex = todayIndex - (LOOK_COVERAGE_WINDOW_DAYS - 1);
  const todayKey = dayKeyFromIndex(todayIndex);

  // WITHHELD FIRST, before any counting happens — so no branch below can leak a number
  // through a state whose whole point is that Home refuses to count answered days one
  // card below *Call your vet today*.
  if (input.withheldNow) return { form: 'absent', reason: 'withheld' };
  if (input.lastWithheldDay === undefined) return { form: 'absent', reason: 'withheld' };

  // Every answered day the record holds, and the earliest one after the mark — both needed
  // below, so the record is walked once.
  const answeredDays = new Set<string>();
  let todayAnswered = false;
  let firstAnsweredAfterMark: number | null = null;
  const markIndex = input.lastWithheldDay !== null ? localDayIndexOf(input.lastWithheldDay) : null;
  for (const row of record) {
    if (row.localDay === todayKey) todayAnswered = true;
    const index = localDayIndexOf(row.localDay);
    if (index === null) continue;
    if (markIndex !== null && index > markIndex) {
      firstAnsweredAfterMark =
        firstAnsweredAfterMark === null ? index : Math.min(firstAnsweredAfterMark, index);
    }
    if (index < firstIndex || index > todayIndex) continue;
    answeredDays.add(row.localDay);
  }

  if (input.lastWithheldDay !== null) {
    // A mark this module cannot parse suppresses rather than being ignored — the same
    // direction as an unreadable store, and for the same reason.
    if (markIndex === null) return { form: 'absent', reason: 'withheld' };
    // ── THE WINDOW MUST CLEAR THE ILLNESS, NOT JUST THE MARK ──────────────────
    // The first cut suppressed only until the marked DAY left the window, and the
    // adversarial pass measured what that returns as. An owner at 28 of 28 withholds on
    // day −20, her cat is in a clinic for a week during which she never opens the app, and
    // she resumes on day −12. When the mark leaves the window the clinic's UNANSWERED days
    // are still inside it, so the footer comes back reading *Answered 22 of the last 28
    // days* where it used to read *Counted across the last 28 days* — a number that fell
    // because her cat was ill, which is precisely the reading T-16 exists to prevent.
    //
    // So the window must start at or after the first day she ANSWERED following the mark.
    // Then no part of the illness — neither its withheld days nor the gap it caused — is
    // inside the span the number speaks for. This subsumes the mark check (the first
    // answered day after the mark is later than the mark itself) and needs no new storage:
    // the record already holds when she came back.
    if (firstAnsweredAfterMark === null || firstIndex < firstAnsweredAfterMark) {
      return { form: 'absent', reason: 'withheld' };
    }
  }

  // A day with no look shows the question and nothing else — no yesterday entry, no
  // days-since counter, no footer (Q-16). This is also what removes the footer on an Undo
  // of the day's only look, without an Undo path knowing the footer exists.
  if (!todayAnswered) return { form: 'absent', reason: 'no_look_today' };

  const answered = answeredDays.size;
  // Below the floor, nothing — which also covers day 1, where there is nothing to count.
  if (answered < LOOK_COVERAGE_FLOOR_DAYS) return { form: 'absent', reason: 'below_floor' };
  if (answered >= LOOK_COVERAGE_WINDOW_DAYS) return { form: 'window', window: LOOK_COVERAGE_WINDOW_DAYS };
  return { form: 'ratio', answered, window: LOOK_COVERAGE_WINDOW_DAYS };
}

/**
 * The footer's string, or null when it does not render.
 *
 * The numbers are set in tabular figures BY THE STYLE, not by this function — the line
 * must not wrap into the entry above it (R14) and a proportional digit is what makes a
 * one-line footer become a two-line one at 28 vs 4.
 */
export function lookCoverageText(coverage: LookCoverage): string | null {
  switch (coverage.form) {
    case 'absent':
      return null;
    case 'ratio':
      return `Answered ${coverage.answered} of the last ${coverage.window} days`;
    case 'window':
      // The number is GONE, deliberately: at saturation a count of eligible days IS a
      // consecutive count, and printing "28 of 28" is printing a streak (T-16).
      return `Counted across the last ${coverage.window} days`;
  }
}
