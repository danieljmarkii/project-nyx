// A food added mid mix, handed back to the bowl that asked for it (CUL-2089, mock A2).
//
// The bowl picker opens food capture in its add only mode (`returnTo=back`, which writes a
// food and no meal) with `handBack=<the meal's event id>`. On save, capture offers the new
// food here and pops back; the mix route takes it on focus and raises the split with it, as
// if it had been tapped. Held in memory, keyed by the meal, taken once: a capture opened
// from anywhere else passes no key and offers nothing, and an offer for another meal is
// never taken by this one.

import type { PickerFood } from './db';

let held: { key: string; food: PickerFood } | null = null;

/** The food capture just saved, for the screen that asked under `key`. Replaces any earlier offer. */
export function offerCapturedFood(key: string, food: PickerFood): void {
  held = { key, food };
}

/** The food offered under `key`, once; null when none was offered for it. */
export function takeCapturedFood(key: string): PickerFood | null {
  if (!held || held.key !== key) return null;
  const { food } = held;
  held = null;
  return food;
}
