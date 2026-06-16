// Shared food-library grouping helpers — extracted from components/log/FoodPicker
// (B-004 PR 1) so the standalone Foods tab and the quick-log picker bucket and
// lay out the library identically, from one tested source. Pure and schema-free:
// no DB, no I/O, no React — just the food_type bucketing (B-011) and the 2-up
// row chunking the grid renders. The `import type` keeps this module free of any
// runtime dependency on lib/db, so it unit-tests without the expo-sqlite stack.
import type { PickerFood } from './db';

export interface GroupedFoods {
  meals: PickerFood[];
  treats: PickerFood[];
  other: PickerFood[];
}

// Group library foods by their food_type classification (B-011). Treats and
// meals are distinct mental models — surfacing them as separate sections lets
// the owner scan "treats" or "meals" without parsing every tile. Anything that
// isn't exactly 'meal' or 'treat' — rows the user hasn't classified yet
// (food_type === null) plus the explicit 'other' bucket, and defensively any
// unexpected value — collapses into the third section so nothing is hidden from
// the picker. Input order is preserved within each bucket (callers pass an
// already-sorted list); the input array is not mutated.
export function groupFoodsByType(foods: PickerFood[]): GroupedFoods {
  const meals: PickerFood[] = [];
  const treats: PickerFood[] = [];
  const other: PickerFood[] = [];
  for (const f of foods) {
    if (f.food_type === 'meal') meals.push(f);
    else if (f.food_type === 'treat') treats.push(f);
    else other.push(f);
  }
  return { meals, treats, other };
}

// Chunk a flat list of foods into fixed-size rows so each rendered row is a
// 2-col grid with matching tile heights (driven by the tallest tile in the
// row). A trailing odd tile lands in a one-element row, which the caller pads
// with a spacer. Empty in → empty out; order is preserved row-major.
export function toFoodRows(foods: PickerFood[]): PickerFood[][] {
  const rows: PickerFood[][] = [];
  for (let i = 0; i < foods.length; i += 2) {
    rows.push(foods.slice(i, i + 2));
  }
  return rows;
}
