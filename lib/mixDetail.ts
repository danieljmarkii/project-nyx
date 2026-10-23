// How the event detail screen states a mixed bowl (Mixed meals row 5, CUL-2054; spec §11,
// T8): "¼ can Chicken Pâté, ½ can Rabbit Pâté (about ⅓ and ⅔)" when the owner measured
// it, else History's own label ("⅓ Chicken Pâté + ⅔ Rabbit Pâté"). The amounts are what
// the owner entered, in their unit; the shares are each food's part of the bowl, named as
// "about", because a split by eye is an estimate.

import { bowlRowLabel, componentRowName, shareGlyph } from './mealBowlLabel';
import type { AppBowl } from './mealBowls';

const FRACTIONS: readonly [number, string][] = [
  [0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾'],
];

/** An amount as an owner writes it: 2, ½, 1½, 0.4. */
export function amountText(value: number): string {
  const whole = Math.floor(value + 1e-9);
  const frac = value - whole;
  if (frac < 0.005) return String(whole);
  const glyph = FRACTIONS.find(([v]) => Math.abs(v - frac) < 0.005)?.[1];
  if (glyph) return whole > 0 ? `${whole}${glyph}` : glyph;
  return String(Math.round(value * 100) / 100);
}

const UNIT_WORD: Record<string, [string, string]> = {
  can: ['can', 'cans'], pouch: ['pouch', 'pouches'], cup: ['cup', 'cups'],
  tbsp: ['tbsp', 'tbsp'], scoop: ['scoop', 'scoops'], g: ['g', 'g'], oz: ['oz', 'oz'],
};

function unitText(value: number, unit: string): string {
  const [one, many] = UNIT_WORD[unit] ?? [unit, unit];
  return value > 1 ? many : one;
}

/** The bowl's one line on the detail screen. */
export function bowlDetailLine(bowl: AppBowl): string {
  const measured =
    bowl.status === 'mix' &&
    bowl.components.length === 2 &&
    bowl.components.every((c) => c.amountValue !== null && c.amountValue > 0 && !!c.amountUnit);
  if (!measured) return bowlRowLabel(bowl).text;
  const parts = bowl.components.map((c) => {
    const v = c.amountValue as number;
    const unit = c.amountUnit as string;
    const sep = unit === 'g' || unit === 'oz' ? '' : ' ';
    return `${amountText(v)}${sep}${unitText(v, unit)} ${componentRowName(c)}`;
  });
  const shares = bowl.components.map((c) => shareGlyph(c.normalizedShare));
  if (!shares.every(Boolean)) return parts.join(', ');
  // A percentage already carries its "~"; "about" is for the fractions.
  const approx = shares.some((g) => g?.startsWith('~')) ? '' : 'about ';
  return `${parts.join(', ')} (${approx}${shares[0]} and ${shares[1]})`;
}
