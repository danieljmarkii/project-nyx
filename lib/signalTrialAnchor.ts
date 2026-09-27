// Which trial a cached trial finding counted (CUL-1360).
//
// THE DEFECT. The Signal cache outlives the trial it counted: starting or replacing a trial
// bumps `hydrationTick` and nothing else, so a `trial_response` finding computed over the
// rabbit trial stays in the cache until the next regen. Every surface that titles it reads
// the LOCAL trial window (`signalTitle(finding, window)`), so the moment the owner replaced
// rabbit with chicken, rabbit's pair ("2 during vs 11 before") printed under "Chicken trial,
// day 1 of 56" on Home, on the Signal screen and on the trial screen's door.
//
// THE ANCHOR. The finding carries no trial id, but it carries the day the engine said the
// trial was on (`trialDayNumber`, day 1 = the start day, through the shared `trialDayCounter`)
// and the cache row carries when the engine counted (`generated_at`). So the engine's start
// day is recoverable: the local day of `generated_at`, minus `trialDayNumber - 1`. A finding
// belongs to the running trial exactly when that day is the running trial's `startDay`.
// Anchoring on the START DAY, not on a day-number comparison, is what makes every ordering
// hold: a replace today (rabbit day 23 vs chicken day 1), a trial ended and another started
// days later (either counter can be the larger), a regen that ran before the new trial row
// synced (a FRESH `generated_at` over the old trial still anchors on the old start), and a
// start date the owner corrected (the finding counted windows that no longer exist).
//
// It is also the finding's whole identity. `detectTrialResponse` names no diet: its windows
// are the start day onward and the 49 days before it, so two trials that start on the same
// day are the same claim over the same days, and titling one with the other's name is true.
//
// WHAT A SURFACE DOES WITH IT (one rule, every titling surface — the diet-trial §5.3 lesson):
//   · `fewer_during_trial` counted over another trial → DROPPED (`isOtherTrialReassurance`,
//     applied inside `visibleFindings`). A stale reassuring pair has nothing left to protect,
//     and the next regen retires it anyway (the engine compares the NEW trial's days).
//   · `more_during_trial` counted over another trial → KEPT, titled by its OWN day
//     (`signalTrialWindowFor` returns null, so `signalTitle` falls back to the cache's
//     "Diet trial, day 23 of 56"). An escalation is never removed on a guess about its age
//     (fail toward escalation, clinical-guardrails); its own day is true of it, and it agrees
//     with the server sentence under it ("in the trial's 23 days").
//   · Anything the anchor cannot read (no `generated_at`, no usable day number, no running
//     local trial) is UNKNOWN and changes nothing: an absence of evidence never drops a card.
//
// THE ZONE. The engine counts in `user_profiles.timezone`, this device in its own zone; the
// profile is stamped from the device, so they agree unless the owner is travelling. When they
// do not, the counted day can sit one off for part of the day and a current finding reads as
// another trial's: a rise is then titled by its own day (still true) and a fall is withheld
// until the next regen (the safe direction). Never the reverse.

import type { SignalFinding, TrialResponseFinding } from './signal';
import type { SignalTrialWindow } from './signalWindows';
import { localDayIndex, localDayIndexOf } from './utils';

/**
 * How long after the engine's clock read the cache row can be stamped. `ai_signals.generated_at`
 * is the insert's `DEFAULT now()`, written AFTER detection and the phrasing call, while the
 * day number was counted at the function's own `Date.now()` — so a regen that straddles local
 * midnight stamps the next day. Bounded by the Edge Function's wall-clock limit (400 s on the
 * paid plan, 150 s on free); ten minutes is past both with margin. Inside that band after
 * midnight either day is accepted — a wider band only widens the one residual this cannot
 * separate (an old trial that started the day before the new one, regenerated in that band).
 */
export const GENERATION_LAG_CEILING_MS = 10 * 60_000;

/** What a surface knows when it titles a finding: when the cache counted, and the trial
 *  running on this device now (`signalTrialWindowOf`), each null when unknown. */
export interface SignalTrialAnchor {
  generatedAt: string | null;
  trial: SignalTrialWindow | null;
}

/**
 * The local days the engine could have taken as the trial's day 1, or null when the finding
 * does not say. One day normally; two only when `generated_at` falls inside the lag band after
 * a local midnight.
 */
export function countedStartDays(finding: TrialResponseFinding, generatedAt: string | null): number[] | null {
  const day = finding.trialDayNumber;
  if (typeof day !== 'number' || !Number.isInteger(day) || day < 1) return null;
  const ms = generatedAt ? Date.parse(generatedAt) : Number.NaN;
  if (!Number.isFinite(ms)) return null;
  const stamped = localDayIndex(ms) - (day - 1);
  const counted = localDayIndex(ms - GENERATION_LAG_CEILING_MS) - (day - 1);
  return stamped === counted ? [stamped] : [counted, stamped];
}

/**
 * True when the finding is a trial finding the engine counted over a DIFFERENT trial's days
 * than the one running here. False for every other finding type, and false whenever either
 * side is unknown (the caller then keeps what it did before).
 */
export function countedAnotherTrial(finding: SignalFinding, anchor: SignalTrialAnchor): boolean {
  if (finding.type !== 'trial_response' || !anchor.trial) return false;
  const running = localDayIndexOf(anchor.trial.startDay);
  const counted = countedStartDays(finding, anchor.generatedAt);
  if (running == null || counted == null) return false;
  return !counted.includes(running);
}

/**
 * The trial window a surface may title and draw this finding in: the running trial's, unless
 * the finding counted another trial, when it is null and the finding speaks in its own day.
 * Every other finding type gets the running trial unchanged.
 */
export function signalTrialWindowFor(finding: SignalFinding, anchor: SignalTrialAnchor): SignalTrialWindow | null {
  return countedAnotherTrial(finding, anchor) ? null : anchor.trial;
}

/** A falling trial pair counted over another trial's days: dropped by `visibleFindings`. */
export function isOtherTrialReassurance(finding: SignalFinding, anchor: SignalTrialAnchor): boolean {
  return finding.type === 'trial_response' && finding.comparisonDirection === 'fewer_during_trial' && countedAnotherTrial(finding, anchor);
}
