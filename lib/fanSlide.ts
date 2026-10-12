// Hold and slide on the FAB (CUL-1278, PM ruling D5 = a; the convening's five amendments
// of 2026-10-07 on CUL-1625). Press and hold the disc, slide to a pill, let go.
//
// This module is the WRITE RULE, kept apart from the component so it can be read and
// tested as data: given what the finger did, does a release act, leave the fan open, or
// close it? The FAB measures the pills and follows the touch; it asks this module what a
// release means and does exactly that, through the same actions a tap runs.
//
// THE RULES, each one a reason a release must not write:
//
//   1. A FOOD WRITES ONLY FROM A PILL HELD STILL. A food pill writes a meal in one
//      press, so a thumb sliding past it on the way to Vomit must never log it. The
//      finger has to have rested on that one pill, within `STILL_SLOP_PT` of where it
//      settled, for `FOOD_DWELL_MS` before it lifts (amendment 3). A release that has
//      not earned that leaves the fan open: nothing is written, and the owner's next
//      tap is the log. The dwell is timed on the TOUCH's own clock (the native event
//      timestamp), never on when JavaScript got round to the event: a busy JS thread
//      only ever stretches a handler-side clock, so a 30ms brush past a food would read
//      as a rest (adversarial review, B1). A rest with no event time cannot qualify.
//   2. NOTHING ACTS UNTIL THE FAN HAS LANDED. The pills are measured only once the
//      open's springs are at rest, and the measure is dropped whenever the drawn rows
//      change (a late recent-food read, a pet switch dealing new foods). With no
//      current measure there is no hit, so nothing can be chosen against a pill that is
//      still moving (amendment 3, CUL-1634, CUL-1647). The pills are measured in the
//      space the touch is reported in, and the measure is trusted only if the disc's
//      measured origin is the origin the touch itself reports for the disc (its page
//      point less its point within the disc), to within `SPACE_CHECK_TOLERANCE_PT`
//      (`spacesAgree`). Two spaces a status bar apart would land every hit one pill off,
//      so they fail to no hit at all. A containment check is not enough: the press can be
//      anywhere on a 56pt disc, so it would pass offsets up to the disc's width.
//   3. A SYMPTOM NEVER WRITES FROM HERE. Vomit, Normal and Loose open their confirm,
//      exactly as a tap does (amendment 2, PR-29b's split): the confirm is where Saw it
//      or Found it is answered, and a direct write would stamp a found vomit "now".
//      That is the caller's half: a `confirm` target's action is the tap's hand-off.
//   4. A RELEASE OFF EVERY PILL CLOSES WITH NO WRITE: over the disc, the veil, the pet
//      chip (a switch is not a log) or nothing. The one exception is a finger that
//      never left the disc: that is a slow tap, however much it rolled on the disc, and
//      the fan stays open as a tap leaves it (amendment 4: the tap path is untouched).
//   5. A REDEAL OR A CLOSE UNDER WAY IS BUSY: nothing acts, the fan stays as it is.
//
// The tap path is untouched (amendment 4): VoiceOver, Switch Control and Voice Control
// cannot drag, so this is an accelerator over the menu, never a second way in.

import { FAB_DISC } from './fanBudget';

/** How long the disc is held before the fan opens in slide mode. A device number. */
export const HOLD_TO_OPEN_MS = 250;
/** How long a finger rests on one food pill before a release there may write (amendment
 *  3's "about 150ms"). A device number. */
export const FOOD_DWELL_MS = 150;
/** How far a resting finger may drift and still be resting. Past it the dwell restarts
 *  from the new point. */
export const STILL_SLOP_PT = 6;
/** How far the disc's measured origin may sit from the origin the touch reports for it
 *  and the two spaces still count as one: rounding, never a status bar (24pt and up). */
export const SPACE_CHECK_TOLERANCE_PT = 2;
/** Without a measured disc, how far from the press point counts as having left it: the
 *  disc's radius, so a roll on the disc is never read as a slide. */
export const DISC_FALLBACK_RADIUS_PT = FAB_DISC / 2;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What a pill does when the slide lets go over it. `food` writes (rule 1), `confirm`
 *  opens a symptom's confirm (rule 3), `door` opens a sheet or a screen. */
export type SlideKind = 'food' | 'confirm' | 'door';

export interface SlideTarget {
  key: string;
  kind: SlideKind;
  rect: Rect;
}

/** The pill a finger is resting on: which one, since when on the touch's own clock
 *  (null when no event time is known, which can never qualify), and the point the rest
 *  is measured from. */
export interface Rest {
  key: string;
  since: number | null;
  x: number;
  y: number;
}

export interface Point {
  x: number;
  y: number;
}

/** The pill under a point, or null. Edges count as inside: the pills stand a gap apart
 *  (C-5), so no point is inside two. The first match wins if a caller ever hands over
 *  overlapping rects, which the fan never draws. */
export function targetAt(targets: readonly SlideTarget[], p: Point): SlideTarget | null {
  for (const t of targets) {
    const { x, y, width, height } = t.rect;
    if (p.x >= x && p.x <= x + width && p.y >= y && p.y <= y + height) return t;
  }
  return null;
}

/** True once a point is farther than the slop from another. */
export function beyondSlop(a: Point, b: Point): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) > STILL_SLOP_PT;
}

/** Whether a point lies inside a rect grown by `margin` on every side. */
export function insideRect(r: Rect, p: Point, margin = 0): boolean {
  return p.x >= r.x - margin && p.x <= r.x + r.width + margin
    && p.y >= r.y - margin && p.y <= r.y + r.height + margin;
}

/** Whether the finger is off the disc. With the disc measured, its frame decides; without,
 *  the disc's radius from the press point does. A roll that stays on the disc is a slow
 *  tap's, never a slide's (rule 4). */
export function leftDisc(disc: Rect | null, start: Point, p: Point): boolean {
  if (disc) return !insideRect(disc, p);
  return Math.hypot(p.x - start.x, p.y - start.y) > DISC_FALLBACK_RADIUS_PT;
}

/** Whether the measured frames and the touch share a space (rule 2): the disc's origin as
 *  measured the way the pills are, against the disc's origin in the touch's own space
 *  (`pageX - locationX`, `pageY - locationY` of the press that started the hold). Null,
 *  an origin the touch never reported, never agrees. */
export function spacesAgree(disc: Rect, touchOrigin: Point | null): boolean {
  if (!touchOrigin) return false;
  return Math.abs(disc.x - touchOrigin.x) <= SPACE_CHECK_TOLERANCE_PT
    && Math.abs(disc.y - touchOrigin.y) <= SPACE_CHECK_TOLERANCE_PT;
}

/** The rest after a move. Leaving every pill ends it; a new pill starts one; drifting
 *  past the slop on the same pill restarts it from the new point, so a finger that is
 *  still travelling across a tall food pill never banks its dwell. */
export function nextRest(prev: Rest | null, hit: SlideTarget | null, p: Point, at: number | null): Rest | null {
  if (!hit) return null;
  if (prev && prev.key === hit.key && !beyondSlop(prev, p)) return prev;
  return { key: hit.key, since: at, x: p.x, y: p.y };
}

export type ReleaseOutcome =
  | { kind: 'act'; key: string }
  /** Leave the fan open, in tap mode. Nothing is written. */
  | { kind: 'stay' }
  /** Close the fan. Nothing is written. */
  | { kind: 'close' };

export interface ReleaseInput {
  /** The pills as currently measured; empty while the fan is landing or after its rows
   *  changed (rule 2). */
  targets: readonly SlideTarget[];
  /** Where the finger lifted. */
  at: Point;
  /** The rest as of the last move. */
  rest: Rest | null;
  /** Whether the finger ever left the disc (`leftDisc`). */
  left: boolean;
  /** A redeal or a close is under way (rule 5). */
  busy: boolean;
  /** The lift's time on the touch's own clock; null when unknown, which never qualifies. */
  now: number | null;
}

/** What a release means. Pure: the caller does what it says. */
export function releaseOutcome({ targets, at, rest, left, busy, now }: ReleaseInput): ReleaseOutcome {
  // A finger that never left the disc is a slow tap: the fan the hold opened stays.
  if (!left) return { kind: 'stay' };
  if (busy) return { kind: 'stay' };
  const hit = targetAt(targets, at);
  // Off every pill: the disc, the veil, the pet chip, or a fan not yet measured.
  if (!hit) return { kind: 'close' };
  if (hit.kind !== 'food') return { kind: 'act', key: hit.key };
  // A food: only from this pill, held still, long enough. The rest must be on this pill
  // AND the lift within the slop of where it rested, so a fast slide that lands on a
  // food and lifts in one motion never writes.
  const rested = rest !== null
    && rest.key === hit.key
    && rest.since !== null
    && now !== null
    && !beyondSlop(rest, at)
    && now - rest.since >= FOOD_DWELL_MS;
  return rested ? { kind: 'act', key: hit.key } : { kind: 'stay' };
}
