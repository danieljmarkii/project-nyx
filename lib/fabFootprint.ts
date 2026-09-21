// The FAB's footprint on a scrolling surface (Design v2 — the whole day, D2-4 /
// CUL-1066; CLAUDE.md C-5).
//
// The FAB (`components/log/FAB.tsx`) floats over the bottom-right of every tab at
// 56pt, inset `space3` from the right and 72pt from the bottom of the tab layout. A
// scroll surface that ends under it has to carry a bottom inset at least the FAB's
// reach, or the last row's control sits under the disc at scroll end — which the
// Mobile IA read measured on the round-4 page and the issue fixes at ≥ 88pt. Home's
// Design v2 body takes 96 (the page's number); the constant lives here, in `lib/`, so a
// guard can read it without importing a component, and so the number is written once.
//
// The other half of C-5 is not a number: the surface's LAST row keeps nothing tappable
// at its right edge (the coverage door is left-aligned for exactly this reason), because
// an inset clears the FAB only at scroll END, and a control under the disc mid-scroll is
// still under the disc.

/** The issue's floor for a scroll surface that ends under the FAB. */
export const FAB_SCROLL_INSET_FLOOR = 88;

/** Home's Design v2 bottom inset — the page's 96pt. Never below the floor. */
export const HOME_V2_SCROLL_INSET = 96;
