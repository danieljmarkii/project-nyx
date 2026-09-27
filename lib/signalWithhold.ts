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
// ── THE REASONS, in the order they are checked ──────────────────────────────────
//   • `not_eating` / `not_eating_unknown` — the pair counts VOMITING and the pet's record
//     says it is not eating (`isAnimalNotEating`, B-789, or an `intake_decline` in the Signal
//     itself), or the facts have not answered (`null`: fail closed — absence of a refusal
//     fact is not evidence of eating). An empty stomach has less to bring up.
//   • `trial_start` (the week line only) — a running trial began after the start of "last
//     week", so "this week · last week" is a before/during pair drawn across the trial's
//     start, with none of the strip's floors or baseline (PM ruling (a): no drawn trial
//     compare; the strip's own sentence is the trial's one compare).
//   • `density` — the engine's own verdict on the pair, where it has one (a reflection's
//     `density.comparable === false`), else the two windows' logging FRACTIONS are not within
//     the shared ratio of each other.
//   • `thin` — a window holds fewer logged days than the engine's reflection floor.
//
// ── THE DENOMINATOR IS THE ENGINE'S, NOT THE CHART'S (adversarial pass, F3) ──────
// The ticks under the bars count every logged day (`readLoggedDays`: any event, and a look);
// that is COVERAGE, and it stays on the chart. A GATE on a falling symptom pair asks a
// narrower question — could these days have shown this sign — so it counts what the engine's
// gate counts (`loggingDaysInWindow`, detection.ts): the comparison-gate symptom set
// (`CORRELATION_SYMPTOM_TYPES`, parity-pinned by `guards/loggedDayParity.test.ts`), a meal,
// and the finding's own sign (the `alsoCounts` rule, CUL-787). A dose confirm or a look
// keeps the day count up while vomit logging lapses — the maropitant counterexample — and
// cannot vouch for vomit observation. `readGateLoggedDays` reads exactly that set.
//
// The ratio and the floor are MIRRORED, each naming its source, because each answers the
// same question its source does (C-34): the ratio is the strip's and the engine's
// (`TRIAL_RESPONSE_COUNTS_DEFAULTS.densityComparableMinRatio` / `DENSITY_COMPARABLE_MIN_RATIO`,
// "were these windows logged alike enough for a reduction to be read"); the floor is the
// reflection lane's `minLoggingDaysPerWindow` ("were these windows logged at all").
//
// Pure: no store, no clock, no database.

import type { CompareWindowsModel, WeeklyBucketsModel } from './chartModels';
import type { SignalFinding, SignalSymptomType } from './signal';
import { isReflectionDensityWithheld } from './signalCopy';
import { TRIAL_RESPONSE_COUNTS_DEFAULTS } from './trialResponseCounts';
import { weekLineNumbers, type SignalTrialWindow, type SignalWindowSpec } from './signalWindows';
import { localDayIndexOf } from './utils';

/**
 * The fewest gate-logged days a window may hold for a falling pair over it to print —
 * mirrored from the engine's reflection lane (`DEFAULT_CONFIG.reflection.minLoggingDaysPerWindow`,
 * detection.ts): the same question, "was this window logged enough to compare at all".
 */
export const MIN_GATE_LOGGED_DAYS_PER_WINDOW = 3;

export type FallingPairWithheld = 'not_eating' | 'not_eating_unknown' | 'density' | 'thin';
export type WeekLineWithheld = FallingPairWithheld | 'trial_start';

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

export interface FallingPairInput {
  finding: SignalFinding;
  /** The symptom the pair counts (`signalSymptomOf`). */
  symptom: SignalSymptomType | null;
  notEating: NotEatingFact;
  /** The GATE's logged days (`readGateLoggedDays`) — never the chart's coverage days. */
  gateLoggedDays: readonly string[];
}

function notEatingReason(symptom: SignalSymptomType | null, notEating: NotEatingFact): FallingPairWithheld | null {
  if (symptom !== 'vomit') return null;
  if (notEating === true) return 'not_eating';
  if (notEating === null) return 'not_eating_unknown';
  return null;
}

/** Gate-logged days inside [first, last] (inclusive day indexes). */
function loggedIn(gateLoggedDays: readonly string[], first: number, last: number): number {
  const seen = new Set<number>();
  for (const key of gateLoggedDays) {
    const i = localDayIndexOf(key);
    if (i != null && i >= first && i <= last) seen.add(i);
  }
  return seen.size;
}

/** One window as the density and floor gates read it. */
export interface GateWindow {
  logged: number;
  loggable: number;
}

/** The density and floor verdict over two windows, earlier first. */
function loggingReason(
  finding: SignalFinding,
  earlier: GateWindow,
  recent: GateWindow,
): FallingPairWithheld | null {
  // The engine's own verdict wins where it has one.
  if (isReflectionDensityWithheld(finding)) return 'density';
  if (earlier.logged < MIN_GATE_LOGGED_DAYS_PER_WINDOW || recent.logged < MIN_GATE_LOGGED_DAYS_PER_WINDOW) return 'thin';
  if (!loggingComparable(earlier, recent)) return 'density';
  return null;
}

/**
 * The lead card's week line ("1 this week so far · 4 last week"), and the screen's: withheld
 * when it FALLS and any reason above holds. Null when the pair may print. `trial` is the
 * running trial, or null.
 */
export function weekLineWithheld(
  weekly: WeeklyBucketsModel,
  input: FallingPairInput & {
    trial: SignalTrialWindow | null;
    /** The trial read failed: whether a trial started inside these weeks is unknown, so a
     *  falling line is withheld as if one did (fail closed — the F3 rule for a failed read). */
    trialUnanswered: boolean;
  },
): WeekLineWithheld | null {
  const { thisWeek, lastWeek } = weekLineNumbers(weekly);
  if (lastWeek == null || thisWeek >= lastWeek) return null;
  const eating = notEatingReason(input.symptom, input.notEating);
  if (eating) return eating;
  const n = weekly.weeks.length;
  const cur = weekly.weeks[n - 1];
  const prev = weekly.weeks[n - 2];
  const prevStart = localDayIndexOf(prev.startKey) as number;
  if (input.trialUnanswered) return 'trial_start';
  if (input.trial) {
    const trialStart = localDayIndexOf(input.trial.startDay);
    if (trialStart != null && trialStart > prevStart) return 'trial_start';
  }
  const curStart = localDayIndexOf(cur.startKey) as number;
  // The days of each week that have arrived and follow the record's start are exactly the
  // bucket's `daysSoFar`; they are the week's LAST `daysSoFar` arrived days, so count the
  // gate days over the arrived span (a day before the record holds no log to count anyway).
  const prevEnd = localDayIndexOf(prev.endKey) as number;
  const curArrivedEnd = curStart + cur.days.filter((d) => d !== 'ahead').length - 1;
  return loggingReason(
    input.finding,
    { logged: loggedIn(input.gateLoggedDays, prevStart, prevEnd), loggable: prev.daysSoFar },
    { logged: loggedIn(input.gateLoggedDays, curStart, curArrivedEnd), loggable: cur.daysSoFar },
  );
}

/**
 * The screen's drawn compare (the two halves of the lookback, off a trial): withheld on the
 * same reasons when the recent window holds fewer episodes than the one before it. `specs`
 * are the windows the compare was built from (`signalCompareSpec`), earlier first.
 */
export function compareWithheld(
  compare: CompareWindowsModel,
  specs: readonly [SignalWindowSpec, SignalWindowSpec],
  input: FallingPairInput,
): FallingPairWithheld | null {
  const [before, recent] = compare.windows;
  if (recent.count >= before.count) return null;
  const eating = notEatingReason(input.symptom, input.notEating);
  if (eating) return eating;
  const gate = (spec: SignalWindowSpec, w: typeof before): GateWindow => {
    const start = localDayIndexOf(spec.startDay) as number;
    return { logged: loggedIn(input.gateLoggedDays, start, start + spec.days - 1), loggable: w.days - w.beforeRecord };
  };
  return loggingReason(input.finding, gate(specs[0], before), gate(specs[1], recent));
}

/** The gate's logged-day counts over the compare's windows, for the withheld line's words. */
export function compareGateCounts(
  specs: readonly [SignalWindowSpec, SignalWindowSpec],
  gateLoggedDays: readonly string[],
): [number, number] {
  const count = (spec: SignalWindowSpec) => {
    const start = localDayIndexOf(spec.startDay) as number;
    return loggedIn(gateLoggedDays, start, start + spec.days - 1);
  };
  return [count(specs[0]), count(specs[1])];
}
