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
};

/** Night-ground node tint — DR-1's day spine. The two category hues that would
 *  read muddy on #13112E swap to their night siblings; teal and the muted neutral
 *  carry over unchanged (they clear the 3:1 graphical-glyph target on night). */
export const NODE_TINT_NIGHT: Record<EventTintCategory, string> = {
  symptom: theme.colorEventSymptomOnNight,
  meal: theme.colorEventMeal,
  medication: theme.colorEventMedicationOnNight,
  other: theme.colorTextOnNightMuted,
};
