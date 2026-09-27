// When a Signal surface may print a FALLING PAIR — the one place the Design v2 card and
// screen ask (CUL-1216, BRK-4 / BRK-5 / BRK-6; design_v2).
//
// ── WHY THIS MODULE EXISTS ──────────────────────────────────────────────────────
// The shipped card knew when to hold back: the reflection's density gate swapped its face,
// the trial strip compared only past its floors and its density check, and B-789 dropped a
// falling trial card over a pet that is not eating. Every one of those gates lived in a
// RENDER path (`InsightCard`, `trialResponseStandingLine`, `SignalZone`'s stack), so when
// Design v2 drew the same numbers from its own windows (`lib/signalWindows.ts`) it took the
// numbers without the gates. The rule this module holds is the one the trial-screen
// brainstorm named on CUL-1216: the gate travels with the number. A surface that states a
// falling pair asks here, and a surface may ADD withholding but never drop it.
//
// ── THE ASYMMETRY ───────────────────────────────────────────────────────────────
// Only a FALL is ever withheld. A rise, a flat pair and a pair with no prior are the
// escalation direction or no direction at all, and stay printed (the detector's own
// asymmetry, `detectTrialResponse`; never-reassure — a fall is the only reading an owner
// could take as "better").
//
// ── THE TWO REASONS ─────────────────────────────────────────────────────────────
//   • `density` — the two windows were not logged with comparable intensity, so a quieter
//     window may just be a less-logged one. The ratio is the trial strip's and the engine's
//     (`TRIAL_RESPONSE_COUNTS_DEFAULTS.densityComparableMinRatio`, detection.ts's
//     `DENSITY_COMPARABLE_MIN_RATIO`): the same question — "were these two windows logged
//     alike enough for a reduction to be read" — so the value is mirrored, not re-chosen
//     (C-34). The engine's own verdict wins where it has one (a reflection's `density`).
//   • `not_eating` — the pair counts VOMITING and the pet's record says it is not eating
//     (`isAnimalNotEating`, B-789, or an `intake_decline` in the Signal itself). An empty
//     stomach has less to bring up. `null` is "not answered", and a surface that prints a
//     pair treats it as not eating (fail closed: absence of a refusal fact is not evidence
//     of eating); the copy for that case never claims the pet is not eating.
//
// Pure: no store, no clock, no database.

import type { CompareWindowsModel, WeeklyBucketsModel } from './chartModels';
import type { SignalFinding, SignalSymptomType } from './signal';
import { isReflectionDensityWithheld } from './signalCopy';
import { TRIAL_RESPONSE_COUNTS_DEFAULTS } from './trialResponseCounts';
import { weekLineNumbers } from './signalWindows';

export type FallingPairWithheld = 'density' | 'not_eating' | 'not_eating_unknown';

/** The pet's not-eating register as a surface holds it: `true` a positive fact, `false`
 *  answered and eating, `null` not answered yet (or the read failed). */
export type NotEatingFact = boolean | null;

/**
 * Were two windows logged with comparable intensity? Logging FRACTIONS (logged days over the
 * days that could have been logged), within the shared ratio of each other in both
 * directions. A window with no loggable day (entirely before the record began, or wholly
 * ahead) has no fraction to compare, so the pair is not comparable.
 */
export function loggingComparable(
  a: { logged: number; loggable: number },
  b: { logged: number; loggable: number },
  minRatio: number = TRIAL_RESPONSE_COUNTS_DEFAULTS.densityComparableMinRatio,
): boolean {
  if (a.loggable <= 0 || b.loggable <= 0) return false;
  const fa = a.logged / a.loggable;
  const fb = b.logged / b.loggable;
  const hi = Math.max(fa, fb);
  const lo = Math.min(fa, fb);
  return hi <= 0 ? true : lo >= hi * minRatio;
}

function notEatingReason(symptom: SignalSymptomType | null, notEating: NotEatingFact): FallingPairWithheld | null {
  if (symptom !== 'vomit') return null;
  if (notEating === true) return 'not_eating';
  if (notEating === null) return 'not_eating_unknown';
  return null;
}

export interface FallingPairInput {
  finding: SignalFinding;
  /** The symptom the pair counts (`signalSymptomOf`). */
  symptom: SignalSymptomType | null;
  notEating: NotEatingFact;
}

/**
 * The lead card's week line ("1 this week so far · 4 last week"): withheld when it falls and
 * either the engine's own density gate withheld this finding's pair (the shipped face's swap,
 * `isReflectionDensityWithheld`), the two drawn weeks were not logged alike, or it counts
 * vomiting over a pet not known to be eating. Null when the pair may print.
 *
 * Not-eating is checked first: it is the reason the owner most needs, and the density reason
 * would be true of an empty-bowl week too.
 */
export function weekLineWithheld(weekly: WeeklyBucketsModel, input: FallingPairInput): FallingPairWithheld | null {
  const { thisWeek, lastWeek } = weekLineNumbers(weekly);
  if (lastWeek == null || thisWeek >= lastWeek) return null;
  const eating = notEatingReason(input.symptom, input.notEating);
  if (eating) return eating;
  if (isReflectionDensityWithheld(input.finding)) return 'density';
  const n = weekly.weeks.length;
  const cur = weekly.weeks[n - 1];
  const prev = weekly.weeks[n - 2];
  if (!loggingComparable({ logged: cur.loggedCount, loggable: cur.daysSoFar }, { logged: prev.loggedCount, loggable: prev.daysSoFar })) {
    return 'density';
  }
  return null;
}

/**
 * The screen's drawn compare (the two halves of the lookback, off a trial): withheld on the
 * same three reasons when the recent window holds fewer episodes than the one before it.
 */
export function compareWithheld(compare: CompareWindowsModel, input: FallingPairInput): FallingPairWithheld | null {
  const [before, recent] = compare.windows;
  if (recent.count >= before.count) return null;
  const eating = notEatingReason(input.symptom, input.notEating);
  if (eating) return eating;
  if (isReflectionDensityWithheld(input.finding)) return 'density';
  const loggable = (w: typeof before) => w.days - w.beforeRecord;
  if (!loggingComparable({ logged: before.loggedCount, loggable: loggable(before) }, { logged: recent.loggedCount, loggable: loggable(recent) })) {
    return 'density';
  }
  return null;
}
