// The split of a two-food bowl as the owner enters and moves it (Mixed meals row 5,
// CUL-2054; spec §7.1, P-2, P-3, R4).
//
// Five stops in fractions, first food on the left: ¾·¼, ⅔·⅓, ½·½, ⅓·⅔, ¼·¾ (P-2). A chip
// tap writes a stop; "Other amounts…" writes what the owner measured, in ONE unit for both
// foods, so a share always exists and the app never converts wet to dry (§7.1). There is no
// "Not sure" (P-3): every v1 mix has a share, and a zero is refused rather than stored.
//
// The stepper moves one stop in EITHER direction and the app never picks which (R4): no
// default direction, no suggestion, and the end stops say why they are dimmed (C-7).

import { shareGlyph } from './mealBowlLabel';
import type { AmountUnit, ComponentInput } from './mealComposition';

/** The first food's share at each stop, left to right as the chips render. */
export const MIX_STOPS: readonly number[] = [3 / 4, 2 / 3, 1 / 2, 1 / 3, 1 / 4];

/** Shares are stored to 3 places, so ⅓ reads back as 0.333 (mealBowlLabel's tolerance). */
const STOP_TOLERANCE = 0.002;

/** The units "Other amounts…" offers: one for both foods (§7.1). `%` is the owner's own
 *  estimate, for a bowl measured two different ways. */
export const MIX_UNITS = ['can', 'cup', 'g', '%'] as const;
export type MixUnit = (typeof MIX_UNITS)[number];

export const MIX_UNIT_LABEL: Record<MixUnit, string> = {
  can: 'Cans',
  cup: 'Cups',
  g: 'Grams',
  '%': '%',
};

export interface MixFood {
  foodItemId: string;
  /** The library's name for the food, as the bowl stores it. */
  foodLabel: string;
}

/** A stop as its chip reads: "⅔·⅓". */
export function stopLabel(firstShare: number): string {
  return `${shareGlyph(firstShare)}·${shareGlyph(1 - firstShare)}`;
}

/** The index of the stop this share sits on, or null for a measured split between stops. */
export function stopIndexOf(firstShare: number): number | null {
  const i = MIX_STOPS.findIndex((s) => Math.abs(s - firstShare) <= STOP_TOLERANCE);
  return i === -1 ? null : i;
}

/** The bowl at a preset stop. */
export function presetComponents(first: MixFood, second: MixFood, stopIndex: number): ComponentInput[] {
  const share = MIX_STOPS[stopIndex];
  if (share === undefined) throw new Error(`No mix stop ${stopIndex}`);
  return [
    { foodItemId: first.foodItemId, foodLabel: first.foodLabel, share, shareSource: 'preset' },
    { foodItemId: second.foodItemId, foodLabel: second.foodLabel, share: 1 - share, shareSource: 'preset' },
  ];
}

/** Parse one amount field. Commas count as decimal points; anything not a positive,
 *  finite number is null, so a zero or a blank can never be saved. */
export function parseAmount(raw: string): number | null {
  const n = Number(raw.trim().replace(',', '.'));
  return raw.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * The bowl from the owner's measured amounts, one unit for both. Null when either amount
 * is missing or zero: a food at 0% is not in the bowl, and the save stays off (§10).
 * Shares are each food's part of the whole; the amounts ride along as entered, so the
 * event detail can say "¼ can Chicken, ½ can Rabbit (about ⅓ and ⅔)".
 */
export function amountComponents(
  first: MixFood,
  second: MixFood,
  unit: MixUnit,
  firstAmount: number | null,
  secondAmount: number | null,
): ComponentInput[] | null {
  if (firstAmount === null || secondAmount === null || firstAmount <= 0 || secondAmount <= 0) return null;
  const total = firstAmount + secondAmount;
  const firstShare = firstAmount / total;
  if (unit === '%') {
    return [
      { foodItemId: first.foodItemId, foodLabel: first.foodLabel, share: firstShare, shareSource: 'custom' },
      { foodItemId: second.foodItemId, foodLabel: second.foodLabel, share: 1 - firstShare, shareSource: 'custom' },
    ];
  }
  const amountUnit: AmountUnit = unit;
  return [
    {
      foodItemId: first.foodItemId, foodLabel: first.foodLabel, share: firstShare, shareSource: 'amounts',
      amountValue: firstAmount, amountUnit,
    },
    {
      foodItemId: second.foodItemId, foodLabel: second.foodLabel, share: 1 - firstShare, shareSource: 'amounts',
      amountValue: secondAmount, amountUnit,
    },
  ];
}

/** Which food the owner asked for more of. Named for the food, never "up" or "down": the
 *  app has no direction of its own (R4). */
export type StepToward = 'first' | 'second';

/**
 * One stepper tap: the next stop toward more of the named food, or null at the end of the
 * scale. A measured split between stops moves to the nearest stop on that side, so one tap
 * always moves the bowl the way the owner asked and never past a stop.
 */
export function stepStop(firstShare: number, toward: StepToward): number | null {
  if (toward === 'first') {
    // More of the first food: a larger first share, leftward on the chips.
    for (let i = MIX_STOPS.length - 1; i >= 0; i--) {
      if (MIX_STOPS[i] > firstShare + STOP_TOLERANCE) return i;
    }
    return null;
  }
  for (let i = 0; i < MIX_STOPS.length; i++) {
    if (MIX_STOPS[i] < firstShare - STOP_TOLERANCE) return i;
  }
  return null;
}

/**
 * The line under a stepper whose side has dimmed (spec §7.5, C-7; CUL-2134): the end stop
 * says why in words a sighted owner reads, not only in the button's label. The steps end
 * at ¾, so the line names that ceiling for the food asked for, never "all of it": a bowl
 * that is all one food is a plain meal, which the stepper never writes. Null when neither
 * side is at an end. One function for both steppers (the card and the edit screen).
 */
export function stepEndLine(firstShare: number, firstName: string, secondName: string): string | null {
  const ceiling = shareGlyph(MIX_STOPS[0]) ?? '¾';
  if (stepStop(firstShare, 'first') === null) return `${ceiling} ${firstName} is as far as the steps go.`;
  if (stepStop(firstShare, 'second') === null) return `${ceiling} ${secondName} is as far as the steps go.`;
  return null;
}
