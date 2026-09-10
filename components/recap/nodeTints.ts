// Shared timeline-node tints for the Daily Recap (B-762 / CUL-23).
//
// ONE source of truth for the category → dot colour mapping, imported by BOTH
// the vertical day spine (DR-1, `DaySpine.tsx`, night ground) and DR-2's
// horizontal recap lane on Home (light ground). The spec's structural rule
// (§2 "the horizontal lane shares its dot/tint constants so the two sizes cannot
// drift"): a node's hue is decided HERE, once, so a meal is the same teal, a
// symptom the same rose and a dose the same slate whether it is a spine node or
// a lane dot — the two surfaces can never disagree because there is no second map.
//
// The categories are `describeDayEvent`'s `EventTintCategory` (symptom / meal /
// medication / other), so the recap tints and the calendar drill-in's glyph tints
// are keyed the same way. Two grounds, two maps:
//
//   • DAY  — the calendar-drill-in / History light-ground mapping. DR-2's lane
//     renders on Home's light ground and reads this.
//   • NIGHT — the Daily Recap's night register (R-1, always-night). Symptom and
//     medication get their night-ground siblings (`colorEventSymptomOnNight`,
//     the minted `colorEventMedicationOnNight`); teal (meal) and the muted
//     neutral (other) already read on the night ground, matching the mock's
//     spine dots (`.spine-dot.m` keeps #00C2A8 on night).
import { theme } from '../../constants/theme';
import type { EventTintCategory } from '../../lib/dayEvents';

/** Light-ground node tint — DR-2's Home lane. Mirrors the calendar day drill-in
 *  (`app/day-summary.tsx`'s prior `CATEGORY_TINT`, the DayEventsSheet mapping):
 *  symptom rose, meal teal, medication slate, everything else neutral. */
export const NODE_TINT_DAY: Record<EventTintCategory, string> = {
  symptom: theme.colorEventSymptom,
  meal: theme.colorEventMeal,
  medication: theme.colorEventMedication,
  other: theme.colorTextSecondary,
  // A look is the muted neutral, and it is drawn HOLLOW (see `nodeDotColors`) —
  // never rose, never a hue of its own (CUL-868, spec §5.1 row 2). The hue says
  // "not a symptom"; the hollowness says "not an event that happened to her" — the
  // owner answered the question, and the mark on the lane records the ACT.
  look: theme.colorTextSecondary,
};

/** Night-ground node tint — DR-1's day spine. The two category hues that would
 *  read muddy on #13112E swap to their night siblings; teal and the muted neutral
 *  carry over unchanged (they clear the 3:1 graphical-glyph target on night). */
export const NODE_TINT_NIGHT: Record<EventTintCategory, string> = {
  symptom: theme.colorEventSymptomOnNight,
  meal: theme.colorEventMeal,
  medication: theme.colorEventMedicationOnNight,
  other: theme.colorTextOnNightMuted,
  // The night sibling of the lane's neutral. The spine's own look mark — the
  // hollow bead on the day spine — is N-3's (CUL-869); this entry is here because
  // the Record is exhaustive and the hue is decided once, in this file, for both
  // grounds.
  look: theme.colorTextOnNightMuted,
};

// The node's GEOMETRY, shared for the same reason as the tints: the vertical day spine
// (DR-1) and DR-2's horizontal Home lane both import these, so a node is the same-sized
// ground-ringed bead at both sizes and the two renderings cannot drift (§2 "shares its
// dot/tint constants so the two sizes cannot drift"). Both are the border-box width in
// RN, so the ring is drawn INSIDE the size (a dot reads as `NODE_DOT_SIZE` across).
export const NODE_DOT_SIZE = 11;
export const NODE_DOT_RING = 2;


/**
 * A node's FILL and RING for one ground — the hollow-mark rule, decided here so the
 * lane and the spine cannot draw a look two different ways (the same argument the
 * tints themselves are in this file for).
 *
 * Every category is a filled bead with a ground-coloured ring (it reads as cutting
 * the track). A LOOK inverts that: the ground is the fill and the tint is the ring,
 * so it reads as an outline — present on the day, plainly not one of the events
 * beside it. The GEOMETRY is identical either way (`borderWidth` is inside the box
 * in RN, so a `NODE_DOT_SIZE` dot stays `NODE_DOT_SIZE` across) — which is the
 * point: nothing moves, the mark just stops being filled.
 */
export function nodeDotColors(
  category: EventTintCategory,
  tints: Record<EventTintCategory, string>,
  ground: string,
): { fill: string; ring: string } {
  const tint = tints[category];
  return NODE_DOT_STYLE[category] === 'hollow'
    ? { fill: ground, ring: tint }
    : { fill: tint, ring: ground };
}

/** Filled or hollow, per category. A Record rather than an equality test so a sixth
 *  category cannot arrive without someone deciding which one it is — the same reason
 *  the tints above are a Record and not a chain of `===`. */
const NODE_DOT_STYLE: Record<EventTintCategory, 'filled' | 'hollow'> = {
  symptom: 'filled',
  meal: 'filled',
  medication: 'filled',
  other: 'filled',
  look: 'hollow',
};
