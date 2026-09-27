// The trial screen's door to the Signal's trial finding (TS-9 · CUL-1305;
// `docs/nyx-trial-screen-requirements.md` §3.7, T-1, S3, S7).
//
// THE DOOR RENDERS EXACTLY WHEN HOME WOULD DRAW THE CARD. Whether a `trial_response`
// finding is reachable is `visibleFindings` (`lib/signalVisible.ts`), the one predicate
// Home's stack, its arrival and Get ready already share, fed the same not-eating register
// Home feeds it. So a falling pair over a pet that may not be eating (or beside the
// Signal's own `intake_decline`) has no door, because Home draws no card; a rising pair
// keeps its door on the safety face too, because Home keeps its card (S7 in both
// directions: never less than Home when it escalates, never more when it reassures).
// No second predicate: a door that re-derived "live" one import away could lead to a
// reassuring screen the stack had withheld.
//
// THE DOOR NAMES THE SCREEN IT OPENS. The head is `signalTitle` over the same finding and
// the same trial window the Signal screen builds its own title from (`buildSignalScreenModel`),
// so the tap lands on a screen with the name the owner tapped (CUL-1270). The href is the
// one Home pushes (`signalScreenHref` over `foldIdentity`). No number is added: the head
// carries the trial's day, never a count.
//
// THE SUB-LINE (PM, 2026-09-27, CUL-1305 option (a)): since CUL-1270 the trial finding's
// title is "Rabbit trial, day 23 of 56", one punctuation mark from the trial screen's own
// title, so a head alone read as a door to the screen already open. The sub says what is
// behind the door and where it comes from. "Vomiting" is exact, not a guess: the trial
// response lane counts vomiting only (`signalHomeLine`'s trial row says the same).

import type { CachedFinding } from './signal';
import { foldIdentity } from './signalFold';
import { signalScreenHref } from './signalRoute';
import { signalTitle } from './signalTitle';
import { signalTrialWindowFor } from './signalTrialAnchor';
import { visibleFindings } from './signalVisible';
import type { SignalTrialWindow } from './signalWindows';

export const SIGNAL_DOOR_SUB = 'Vomiting, from the Signal';

export interface TrialSignalDoor {
  label: string;
  sub: string;
  href: string;
}

export interface TrialSignalDoorArgs {
  /** The route's pet (C-9): the cache was read for it, and the href carries it. */
  petId: string;
  /** The pet's cached findings, as `readSignalCache(petId)` returned them. */
  findings: readonly CachedFinding[];
  /** Home's register: `isAnimalNotEating(input)` over the route's pet's answered facts.
   *  A caller that has not answered passes true (fail closed, as Home does). */
  withholdFallingVomit: boolean;
  /** `signalTrialWindowOf(trial, nowMs)`, the window the Signal screen titles with. */
  trialWindow: SignalTrialWindow | null;
  /** The cache row's `generated_at` (CUL-1360): with the window, it says whether the cached
   *  finding counted THIS trial. Required, so no caller can title an older trial's finding
   *  with this one by leaving it out; null only when the row carried none. */
  generatedAt: string | null;
  nowMs: number;
}

export function trialSignalDoor(args: TrialSignalDoorArgs): TrialSignalDoor | null {
  // CUL-1360: the same anchor Home's stack and the Signal screen read, so a finding counted
  // over a replaced trial has the door Home gives it (a falling pair none, a rising pair one
  // titled by its own day), never a door named for the trial on screen.
  const anchor = { generatedAt: args.generatedAt, trial: args.trialWindow };
  const live = visibleFindings([...args.findings], args.withholdFallingVomit, args.nowMs, anchor).find(
    (f) => f.finding.type === 'trial_response',
  );
  if (!live) return null;
  return {
    label: signalTitle(live.finding, signalTrialWindowFor(live.finding, anchor)),
    sub: SIGNAL_DOOR_SUB,
    href: signalScreenHref(args.petId, foldIdentity(live.finding)),
  };
}
