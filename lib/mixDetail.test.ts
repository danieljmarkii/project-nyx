// The event detail's line for a mixed bowl (Mixed meals row 5, CUL-2054; spec §11, T8).

import { amountText, bowlDetailLine } from './mixDetail';
import { bowlFromRows } from './mealBowls';
import { mintGenerationId } from './mealComposition';

function bowl(parts: { food: string; share: number; source?: string; value?: number; unit?: string }[]) {
  return bowlFromRows(
    { food_item_id: null, component_count: parts.length },
    parts.map((p, i) => ({
      id: mintGenerationId(1_700_000_000_000, 5, () => (i + 1) / 10),
      position: i,
      food_item_id: p.food,
      food_label: `Weruva ${p.food}`,
      share: p.share,
      share_source: p.source ?? 'preset',
      amount_value: p.value ?? null,
      amount_unit: p.unit ?? null,
      updated_at: '2026-10-21T08:00:00.000Z',
      deleted_at: null,
      food: { brand: 'Weruva', productName: p.food, foodType: 'meal', format: 'wet', primaryProtein: null, proteins: [] },
    })),
  )!;
}

it('a measured bowl reads as measured, with its shares as "about"', () => {
  expect(bowlDetailLine(bowl([
    { food: 'Chicken', share: 1 / 3, source: 'amounts', value: 0.25, unit: 'can' },
    { food: 'Rabbit', share: 2 / 3, source: 'amounts', value: 0.5, unit: 'can' },
  ]))).toBe('¼ can Chicken, ½ can Rabbit (about ⅓ and ⅔)');
  expect(bowlDetailLine(bowl([
    { food: 'Chicken', share: 0.4, source: 'amounts', value: 40, unit: 'g' },
    { food: 'Rabbit', share: 0.6, source: 'amounts', value: 60, unit: 'g' },
  ]))).toBe('40g Chicken, 60g Rabbit (~40% and ~60%)');
});

it('a preset bowl reads as History names it', () => {
  expect(bowlDetailLine(bowl([{ food: 'Chicken', share: 0.25 }, { food: 'Rabbit', share: 0.75 }])))
    .toBe('¼ Chicken + ¾ Rabbit');
});

it('a synced three-food bowl names two and says "+1 more"', () => {
  expect(bowlDetailLine(bowl([
    { food: 'Chicken', share: 0.5 }, { food: 'Rabbit', share: 0.25 }, { food: 'Duck', share: 0.25 },
  ]))).toBe('½ Chicken + ¼ Rabbit +1 more');
});

it('writes amounts the way an owner does', () => {
  expect(amountText(2)).toBe('2');
  expect(amountText(1.5)).toBe('1½');
  expect(amountText(0.4)).toBe('0.4');
});
