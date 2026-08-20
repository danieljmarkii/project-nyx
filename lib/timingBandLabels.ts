// The ONE owner-facing vocabulary for the three meal-relative timing bands
// (rapid / mid / long), shared by every surface that names them — the Patterns
// Timing panel (lib/patternsTiming.ts → timingBandLabel, re-exported by
// lib/patternsTrial.ts) and the Home A2 Signal receipt + trial card
// (lib/signalCopy.ts). CUL-98: these had drifted into two wordings — Home said
// "30 min–6h after eating" / "6h+ after eating" while Patterns said "30 min to 6h
// after eating" / "6h or more after eating" — so an owner crossing Home→Patterns
// saw the same fact relabeled. One vocabulary, one place, so the two can never
// diverge again (the §5.3 "one predicate, shared" lesson applied to copy).
//
// The wording is the plain-spoken form — "to" and "or more", not the "–"/"+"
// shorthand — so it reads aloud like the "smart, caring friend" register
// (docs/nyx-design-principles, Voice and Tone), which is the form the Patterns
// panel already shipped.
//
// TIMING ONLY, never mechanism (Signals v2 §6 / G1/G3): the bands are named by CLOCK
// time since eating, never by the physiology the timing might imply ("empty
// stomach" / "bilious" are the vet's inference, barred from owner copy). No
// verdict, no reassurance, no "!".
//
// Pure — takes the two boundary numbers directly, so a caller reading them off a
// MealTimingConfig (Patterns) and one reading them off an A2 finding payload
// (Home) produce byte-identical labels.

import type { TimingBand } from './mealTiming';

export function formatTimingBandLabel(
  band: TimingBand,
  rapidWindowMinutes: number,
  longGapHours: number,
): string {
  switch (band) {
    case 'rapid':
      return `Within ${rapidWindowMinutes} min of eating`;
    case 'mid':
      return `${rapidWindowMinutes} min to ${longGapHours}h after eating`;
    case 'long':
      return `${longGapHours}h or more after eating`;
  }
}
