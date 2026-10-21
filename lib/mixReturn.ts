// The meal card a first mix returns to (Mixed meals row 5, CUL-2054; spec §7.1, §7.5 D-M1).
//
// "+ Mixed with another food" hides the card and opens the mix route; the split's chip tap
// writes the bowl, and the card comes back AS the mix. What it comes back with is the card
// it left: the intake answer, the time, and above all the trial heads-up it was showing,
// whose budget is already spent. A fresh payload would drop that line with its food still
// in the bowl, so the food would be spent with nothing on screen for Undo to give back.
//
// Held here, in memory, keyed by the meal, and taken once. A mix opened from anywhere
// else (event detail) finds nothing and returns to where it came from.

import type { MealPayload } from '../store/momentStore';

type Held = Omit<MealPayload, 'kind'>;
let held: Held | null = null;

/** The card's payload as it hides for the mix route. Replaces any earlier hold. */
export function holdMixReturn(payload: Held): void {
  held = payload;
}

/** The held card for this meal, once; null when none was held for it. */
export function takeMixReturn(eventId: string): Held | null {
  if (!held || held.eventId !== eventId) return null;
  const out = held;
  held = null;
  return out;
}
