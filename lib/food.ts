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

export interface BrandGroup {
  // Canonical grouping key (the canonicalizeBrand output). Stable React list
  // key; never shown to the user.
  key: string;
  // Display label — the first-seen original brand spelling for this key, so the
  // header reads as the owner wrote it, not the normalized form.
  brand: string;
  foods: PickerFood[];
}

// Trademark glyphs ("Fancy Feast®"). Stripped BEFORE NFKC normalization —
// NFKC expands ™→"TM" and ℠→"SM", which would survive a symbol-only strip and
// corrupt the key, so we drop the raw glyphs first.
const BRAND_TRADEMARK_RE = /[®™©℠]/g;
// Apostrophe variants folded to a straight quote so "Hill's" (curly) groups
// with "Hill's" (straight). Curly/back/acute/modifier-letter forms all map to '.
const BRAND_APOSTROPHE_RE = /[’‘‛`´ʼ]/g;

// Fold a brand string to a grouping key so trivial spelling differences collapse
// to one brand (B-004 PR 3). A single owner's library routinely holds the SAME
// brand spelled a few ways — AI extraction, manual entry, and packaging disagree
// on case, spacing, trademark glyphs, and apostrophe style ("Fancy Feast",
// "fancy feast", "Fancy Feast®", "Hill's" vs "Hill’s"). Folding those lets the
// variants sit under a single brand header instead of scattering down the tab.
//
// Deliberately CONSERVATIVE: it normalizes only formatting noise — it never
// strips apostrophes or other punctuation and never drops words, so two
// genuinely different brands ("Wellness" vs "Wellness Core") are never merged.
// The key is for grouping only and is never displayed; the UI shows the
// first-seen original spelling. Pure; no I/O.
export function canonicalizeBrand(brand: string): string {
  return brand
    .replace(BRAND_TRADEMARK_RE, '')
    .normalize('NFKC')
    .replace(BRAND_APOSTROPHE_RE, "'")
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Collapse a list of foods into per-brand groups, folding trivial spelling
// variants of the same brand together via canonicalizeBrand. Group order and
// food-within-group order follow first appearance, so a caller passing the
// alpha-sorted library (getLibraryFoods orders by brand then product) gets
// alpha-by-brand groups with alpha products inside each. Robust to non-adjacent
// variants — keying a Map by the canonical brand means interleaved spellings
// still land in one group. Empty in → empty out; the input is not mutated.
export function groupFoodsByBrand(foods: PickerFood[]): BrandGroup[] {
  const groups = new Map<string, BrandGroup>();
  for (const f of foods) {
    const key = canonicalizeBrand(f.brand);
    const existing = groups.get(key);
    if (existing) {
      existing.foods.push(f);
    } else {
      groups.set(key, { key, brand: f.brand, foods: [f] });
    }
  }
  return [...groups.values()];
}
