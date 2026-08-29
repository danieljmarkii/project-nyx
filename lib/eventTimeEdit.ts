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
import { deriveOccurredAt, type OccurredConfidence } from './utils';

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
  // `current` may be null on the edit screen: an unclassified row seeds neither
  // segment (B-527). Tapping either one from null is therefore never a no-op — it
  // is the owner making a first claim about how well the time is known — so it
  // falls straight through to the asserted branches below.
  current: TimeMode | null,
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

// ── Seeding the control from a stored row (B-527) ────────────────────────────
//
// The edit screen reconstructs the Saw-it / Found-it control from what the row
// actually holds. The load-bearing case is the one B-527 names: a row whose
// occurred_at_confidence is NULL has NO recorded claim about how well its time is
// known — migration 012 is explicit that NULL is "NOT a claim either way". So it
// must seed NEITHER segment (`mode: null`), rendering the absence as an absence.
//
// Before B-527 the screen seeded 'saw' and only ever *changed* it for a stored
// estimated/window, so a NULL row rendered byte-identical to a witnessed one:
// "Saw it happen", highlighted. That display asserted a certainty the record did
// not hold — and until B-448's no-op rule, one tap on the already-highlighted
// segment promoted the display into a stored 'witnessed', the exact reassuring-
// direction misrepresentation the B-010 legend exists to prevent.
//
// Pure so the mapping is pinned by a test, not by an effect nobody re-reads.

export interface TimeControlSeed {
  /** null = unclassified: the record holds no claim, so neither segment is on. */
  mode: TimeMode | null;
  /** Meaningful only when mode === 'found'; null otherwise. */
  foundMode: FoundMode | null;
  /** ISO lower edge, only for a 'between' window; null otherwise. */
  earliest: string | null;
  /** ISO latest edge — the window's discovery time; null when not a window. */
  latest: string | null;
}

export function reconstructTimeControl(stored: {
  confidence: 'witnessed' | 'estimated' | 'window' | null;
  earliest: string | null;
  latest: string | null;
}): TimeControlSeed {
  if (stored.confidence === 'witnessed') {
    return { mode: 'saw', foundMode: null, earliest: null, latest: null };
  }
  if (stored.confidence === 'estimated') {
    return { mode: 'found', foundMode: 'around', earliest: null, latest: null };
  }
  if (stored.confidence === 'window') {
    const { earliest: e, latest: l } = stored;
    if (e && l) return { mode: 'found', foundMode: 'between', earliest: e, latest: l };
    if (l) return { mode: 'found', foundMode: 'before', earliest: null, latest: l };
    // Degenerate lower-edge-only window — render as open-ended "before" off that edge.
    if (e) return { mode: 'found', foundMode: 'before', earliest: null, latest: e };
    // A window with neither bound is illegal (chk_occurred_window_fields), but a
    // reconstruct maps defensively rather than throwing on a malformed row.
    return { mode: 'found', foundMode: 'before', earliest: null, latest: null };
  }
  // NULL — unclassified. Neither segment selected (B-527): show the absence.
  return { mode: null, foundMode: null, earliest: null, latest: null };
}

// ── Deriving the stored B-010 fields from the control's state ─────────────────
//
// The Saw-it / Found-it control holds a small state machine (timeMode, foundMode,
// the point, its source, the estimate, and the window edges). What actually gets
// written is three columns: occurred_at (a single point every reader keys off),
// confidence, and the two window bounds. This is the one place that reduction
// lives, so app/log.tsx's full-screen simple step and components/log/
// SimpleEventConfirm's in-sheet confirm (B-745 PR 3) can never derive a different
// row from the same control state. Pure, so it's pinned by a test.
//
//   saw            -> witnessed at the point (source preserved: 'now'/'exif'/'manual')
//   found + around -> estimated at the estimate (an owner guess, so source 'manual')
//   found + before -> window, latest edge only (open-ended; "found by {latest}")
//   found + between -> window, both edges
//
// occurred_at for a window is the LATEST edge (deriveOccurredAt) — a real value the
// owner entered, never an invented midpoint. The window bounds remain the source of
// truth; surfaces render the window (describeOccurredAt), not this point.
export interface BuiltTimeFields {
  confidence: OccurredConfidence;
  occurredAt: Date;
  earliest: Date | null;
  latest: Date | null;
  source: 'manual' | 'exif' | 'now';
}

export function buildTimeFields(input: {
  timeMode: TimeMode;
  foundMode: FoundMode;
  /** The witnessed / point time. */
  point: Date;
  /** Provenance of `point` (kept only for the witnessed path). */
  pointSource: 'manual' | 'exif' | 'now';
  /** The "around a time" estimate — distinct from `point` so a guess never leaks. */
  estimatedAt: Date;
  earliest: Date | null;
  /** The window's discovery / latest edge. */
  latest: Date;
}): BuiltTimeFields {
  const { timeMode, foundMode, point, pointSource, estimatedAt, earliest, latest } = input;
  if (timeMode === 'saw') {
    return { confidence: 'witnessed', occurredAt: point, earliest: null, latest: null, source: pointSource };
  }
  if (foundMode === 'around') {
    return { confidence: 'estimated', occurredAt: estimatedAt, earliest: null, latest: null, source: 'manual' };
  }
  // 'before' (open-ended) or 'between' (bounded) -> window.
  const e = foundMode === 'between' ? earliest : null;
  const l = latest;
  return {
    confidence: 'window',
    occurredAt: deriveOccurredAt({ confidence: 'window', point, earliest: e, latest: l }),
    earliest: e,
    latest: l,
    source: 'manual',
  };
}

// ── Provenance after a point-time edit (B-525) ───────────────────────────────
//
// Touching the picker to CHANGE the value is an explicit manual choice, so
// occurred_at_source becomes 'manual' — whatever it was before. The pre-B-525
// handlers only flipped 'exif'→'manual' and left 'now' untouched, so a picker
// edit on a now-sourced row kept source='now'; a live row proves it (a vomit set
// to a round 09:00:00 whose source stayed 'now'). The column exists so the vet
// report and correlation engine can tell a witnessed-now log from an owner-
// backfilled one, so a picker-set time still reading 'now' is quietly wrong.
//
// A PEEK that changes nothing preserves the stored provenance — critically
// 'exif', whose photo attribution must not be dropped merely by opening the picker.
//
// EVERY point-time edit in the app routes through here (CUL-701): the four capture
// and edit surfaces, and all three completion cards. The cards were the holdouts —
// they wrote 'manual' unconditionally, and because their Save is live the moment
// the sheet opens, a peek-and-save was enough to stamp it. The named card was
// fixed at CUL-606; the meal and dose cards followed at CUL-701, where the meal
// card turned out to be losing 'exif' rather than merely mis-claiming, insertMeal
// taking the source as a parameter that both photo paths fill from EXIF.
export function sourceAfterPointEdit(
  current: 'manual' | 'exif' | 'now',
  changed: boolean,
): 'manual' | 'exif' | 'now' {
  return changed && current !== 'manual' ? 'manual' : current;
}

// ── Re-deriving the app's own clock default (CUL-576) ────────────────────────
//
// `occurred_at` on a fresh log starts as `new Date()` at mount: a standing
// ASSUMPTION the app makes on the owner's behalf ("this is happening now"), not
// a claim the owner made. The assumption goes stale while the surface sits open
// — the owner fumbles one-handed for a photo in the dark, or the screen is
// backgrounded and restored an hour later — and a stale one is written verbatim
// into occurred_at, which is the correlation engine's key and the Timeline's
// sort key.
//
// The fix is to re-derive the assumption when the surface is RE-ENTERED, NOT to
// re-stamp it at save. Two reasons the save-time re-stamp is wrong on these
// screens specifically:
//
//   1. The time is ON SCREEN here. app/log.tsx renders it in the time row and
//      the B-745 confirm renders it in the summary pill — and that spec's §0
//      makes the pill the save ("the summary pill IS the save"). Writing a
//      different value at save commits a time the owner was never shown.
//   2. A symptom is logged BECAUSE it just happened: the screen opens AFTER the
//      event, so every second that passes moves the clock further from it, not
//      closer. Mount is the better proxy for a 5:33 vomit than save is.
//
// The meal path (app/log.tsx handlePickFood) does re-stamp at write, and its own
// comment says why it may: on that one-tap path "the user never saw the time
// picker", so there is no displayed value to contradict, and the bowl goes down
// as the tap lands. Neither condition holds here — which is why the meal path is
// not the precedent it looks like.
//
// Only a 'now' point is re-derived. 'manual' is the owner's own choice and
// 'exif' is the photo's own stamp; both outrank the wall clock, and silently
// moving either would be the B-525 defect pointed the other way.
export function refreshedNowPoint(
  point: Date,
  source: 'manual' | 'exif' | 'now',
  now: Date,
): Date {
  return source === 'now' ? now : point;
}
