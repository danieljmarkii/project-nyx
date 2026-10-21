// A mixed bowl as the meal completion card holds and names it (Mixed meals row 5,
// CUL-2054; spec §7.1, §7.2).
//
// The card is written before any read of the bowl lands, so it carries the bowl it just
// wrote: each food's id, the label the bowl stores, the short name a row prints, and its
// share. The title is History's label ("⅓ Chicken Pâté + ⅔ Rabbit Pâté"), built from the
// same `shareGlyph`, so the card never names a bowl differently from the row it wrote.

import { productNameBesideTag } from './food';
import { shareGlyph, BOWL_ROW_NAMED } from './mealBowlLabel';
import type { ComponentInput } from './mealComposition';
import type { MixFood } from './mixRatio';

export interface CardBowlFood {
  foodItemId: string;
  /** The label the bowl stores (`meal_components.food_label`). */
  foodLabel: string;
  /** The short name a row prints: the product without its format qualifier. */
  rowName: string;
  /** The owner's share, as written (normalised at read). */
  share: number;
}

export interface CardBowl {
  foods: CardBowlFood[];
}

/** What a picked food needs to become one food of a bowl. */
export interface BowlPickable {
  id: string;
  brand: string | null;
  product_name: string | null;
  format: string | null;
}

/** The label a bowl stores for a food: brand and product, as the trial list stores it. */
export function bowlFoodLabel(food: Pick<BowlPickable, 'brand' | 'product_name'>): string {
  return `${food.brand ?? ''} ${food.product_name ?? ''}`.trim() || 'Food';
}

/** The food as the split step and the writer take it, with its row name. */
export function mixFoodOf(food: BowlPickable): MixFood & { rowName: string } {
  const foodLabel = bowlFoodLabel(food);
  return {
    foodItemId: food.id,
    foodLabel,
    rowName: productNameBesideTag(food.product_name, food.format)?.trim() || foodLabel,
  };
}

/** The card's bowl from what the writer just wrote. `rowNames` maps food id → short name;
 *  a food missing from it prints its stored label. */
export function cardBowlFrom(components: readonly ComponentInput[], rowNames: Record<string, string>): CardBowl {
  return {
    foods: components.map((c) => ({
      foodItemId: c.foodItemId,
      foodLabel: c.foodLabel,
      rowName: rowNames[c.foodItemId] ?? c.foodLabel,
      share: c.share,
    })),
  };
}

/** The bowl back as the writer's input, at new shares (the stepper's write). */
export function bowlWithShares(bowl: CardBowl, firstShare: number): ComponentInput[] {
  const [a, b] = bowl.foods;
  return [
    { foodItemId: a.foodItemId, foodLabel: a.foodLabel, share: firstShare, shareSource: 'preset' },
    { foodItemId: b.foodItemId, foodLabel: b.foodLabel, share: 1 - firstShare, shareSource: 'preset' },
  ];
}

/** Each food's part of the bowl, summing to one. */
export function normalisedShares(bowl: CardBowl): number[] {
  const total = bowl.foods.reduce((s, f) => s + f.share, 0);
  return bowl.foods.map((f) => (total > 0 ? f.share / total : 0));
}

/** The bowl's name on the card's title: "⅓ Chicken Pâté + ⅔ Rabbit Pâté", "+N more" past
 *  two (the UI is built for two, R3). */
export function cardBowlLabel(bowl: CardBowl): string {
  const shares = normalisedShares(bowl);
  const named = bowl.foods.slice(0, BOWL_ROW_NAMED).map((f, i) => {
    const glyph = shareGlyph(shares[i]);
    return glyph ? `${glyph} ${f.rowName}` : f.rowName;
  });
  const more = bowl.foods.length - BOWL_ROW_NAMED;
  return more > 0 ? `${named.join(' + ')} +${more} more` : named.join(' + ');
}
