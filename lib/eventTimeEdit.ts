// The Saw-it / Found-it control's state transitions, as pure functions (B-448).
//
// Extracted from app/log.tsx and app/edit-event.tsx, which had drifted into two
// copies of the same handler. The `adversarial-reviewer` broke the copy in
// edit-event.tsx with a counterexample neither screen guarded against, and the
// bug was reachable in both: **a segmented control fires its handler even when
// you tap the segment that is already selected.**
//
// What that cost, concretely. A row stored `estimated` at 04:10 reconstructs to
// mode 'found' / sub-mode 'around', with "Found it" already highlighted. The
// owner taps "Found it" — nothing visibly changes, because it was already on.
// But the handler's enter-found branch fired anyway: sub-mode reset to 'before',
// latest edge reset to `new Date()`. Saving then wrote confidence 'window' with
// the latest edge at the moment of *editing*, and because occurred_at for a
// window derives from that edge (migration 012), the event's timestamp moved to
// the edit time — days, potentially. That is the correlation engine's key and
// the Timeline's sort key, silently re-dated by a tap that changed nothing on
// screen.
//
// The same no-op tap on "Saw it happen" was the B-448 defect itself surviving
// its own fix, at a cost of one tap: an unclassified row renders identically to
// a witnessed one (the reconstruct only reacts to 'estimated'/'window'), so the
// control already *displays* a claim the record does not hold, and one tap on
// the highlighted segment turned that display into a stored 'witnessed'.
//
// The rule both fixes share: **re-selecting the current value is not a new
// claim.** It seeds nothing, resets nothing, and asserts nothing. Living here
// rather than in a handler means it is pinned by a test instead of by two
// screens remembering to agree.

import type { FoundMode, TimeMode } from '../components/log/TimeConfidenceField';

/** How far back to open a fresh "between" window's lower edge. */
export const DEFAULT_WINDOW_SPAN_MS = 2 * 60 * 60 * 1000;

export interface TimeModeTransition {
  /** Nothing changes and nothing is asserted — the caller returns immediately. */
  noOp: boolean;
  /** Reset the found sub-mode (only when entering 'found' fresh). */
  seedFoundMode: FoundMode | null;
  /** Seed the window's latest edge: the EXIF point if we have one, else now. */
  seedLatestFrom: 'point' | 'now' | null;
  /** Did the owner make a claim about how well the time is known? */
  asserted: boolean;
}

export function resolveTimeModeChange(
  current: TimeMode,
  requested: TimeMode,
  hasExifPoint: boolean,
): TimeModeTransition {
  if (current === requested) {
    return { noOp: true, seedFoundMode: null, seedLatestFrom: null, asserted: false };
  }
  if (requested === 'found') {
    return {
      noOp: false,
      seedFoundMode: 'before',
      seedLatestFrom: hasExifPoint ? 'point' : 'now',
      asserted: true,
    };
  }
  return { noOp: false, seedFoundMode: null, seedLatestFrom: null, asserted: true };
}

export interface FoundModeTransition {
  noOp: boolean;
  /** Seed the estimate from the discovery time, as a starting point to adjust. */
  seedEstimatedFromLatest: boolean;
  /** Seed a sane lower bound the first time the owner opens a window. */
  seedEarliest: boolean;
  asserted: boolean;
}

export function resolveFoundModeChange(
  current: FoundMode,
  requested: FoundMode,
  hasEarliest: boolean,
): FoundModeTransition {
  if (current === requested) {
    return { noOp: true, seedEstimatedFromLatest: false, seedEarliest: false, asserted: false };
  }
  return {
    noOp: false,
    seedEstimatedFromLatest: requested === 'around',
    seedEarliest: requested === 'between' && !hasEarliest,
    asserted: true,
  };
}
