import { theme } from '../constants/theme';

// ── TAP TARGET GEOMETRY (CUL-658) ───────────────────────────────────────────
// A helper, deliberately not a shared hitSlop constant. Two chips that hold the
// same slop today hold it because their boxes happen to match; a shared constant
// would keep them equal after one is restyled, and wrong. So each call site passes
// ITS OWN pinned box and the reach is computed from it: the site states the
// geometry it reasons about, and the arithmetic is never copied.
//
// The box is a PINNED height (`minHeight`), never a font's line box. A floor that
// rests on a metric no test can compute is a floor nobody is holding (CUL-579).

/** The 44pt touch floor (Apple HIG), as theme.hitTarget names it. */
export const TAP_TARGET_FLOOR = theme.hitTarget;

function assertLength(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`tapTarget: ${name} must be a finite, non-negative length, got ${value}`);
  }
}

/** The reach each side (top and bottom) that carries a box of pinned `boxHeight`
 *  to `floor`. Rounded UP, so `boxHeight + 2 × reach` never lands under the floor;
 *  zero when the box already meets it (the floor then lives in the box, C-5). */
export function verticalReachTo(floor: number, boxHeight: number): number {
  assertLength('floor', floor);
  assertLength('boxHeight', boxHeight);
  return Math.max(0, Math.ceil((floor - boxHeight) / 2));
}

/** Vertical-only hitSlop for a pinned box. Vertical ONLY, because horizontal slop
 *  reaches into the gap between chips in a row and makes neighbours share hit
 *  area (CUL-612). A wrapping row still owes its rowGap `top + bottom`. */
export function verticalSlopTo(
  floor: number,
  boxHeight: number,
): { readonly top: number; readonly bottom: number } {
  const reach = verticalReachTo(floor, boxHeight);
  return { top: reach, bottom: reach };
}

/** The most each of two controls facing each other across `gap` may reach into it
 *  without their hit areas crossing: half the gap, rounded DOWN, so the two
 *  facing reaches sum to at most the gap (C-5). */
export function facingReach(gap: number): number {
  assertLength('gap', gap);
  return Math.floor(gap / 2);
}
