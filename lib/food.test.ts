// Unit tests for the shared food-grouping helpers (B-004 PR 1). These guard the
// exact bucketing + row-chunking behaviour the quick-log picker relied on inline
// before the extraction, so the refactor stays byte-for-byte behaviour-preserving
// and the standalone Foods tab inherits the same contract.
import { groupFoodsByType, toFoodRows, canonicalizeBrand, groupFoodsByBrand } from './food';
import type { PickerFood } from './db';

// Minimal PickerFood fixture — only id + food_type drive these helpers; the rest
// are filled so the shape type-checks. `id` doubles as a label for readable
// assertions.
const food = (id: string, food_type: string | null): PickerFood => ({
  id,
  food_type,
  brand: 'Brand',
  product_name: id,
  format: 'kibble',
  photo_path: null,
});

const ids = (foods: PickerFood[]) => foods.map((f) => f.id);

describe('groupFoodsByType', () => {
  it('buckets meals, treats, and everything else by food_type', () => {
    const { meals, treats, other } = groupFoodsByType([
      food('a', 'meal'),
      food('b', 'treat'),
      food('c', 'other'),
      food('d', null),
    ]);
    expect(ids(meals)).toEqual(['a']);
    expect(ids(treats)).toEqual(['b']);
    expect(ids(other)).toEqual(['c', 'd']);
  });

  it('routes NULL (unclassified) and unexpected food_type values into other', () => {
    // Anything that isn't exactly 'meal' or 'treat' collapses into `other` so
    // nothing is hidden from the picker — legacy NULL rows and any value the
    // schema might grow that this helper doesn't yet special-case.
    const { meals, treats, other } = groupFoodsByType([
      food('legacy', null),
      food('weird', 'snack'),
    ]);
    expect(meals).toEqual([]);
    expect(treats).toEqual([]);
    expect(ids(other)).toEqual(['legacy', 'weird']);
  });

  it('preserves input order within each bucket', () => {
    const { meals, other } = groupFoodsByType([
      food('m1', 'meal'),
      food('o1', null),
      food('m2', 'meal'),
      food('o2', 'other'),
      food('m3', 'meal'),
    ]);
    expect(ids(meals)).toEqual(['m1', 'm2', 'm3']);
    expect(ids(other)).toEqual(['o1', 'o2']);
  });

  it('returns three empty buckets for an empty list', () => {
    expect(groupFoodsByType([])).toEqual({ meals: [], treats: [], other: [] });
  });

  it('does not mutate the input array', () => {
    const input = [food('a', 'meal'), food('b', 'treat')];
    const snapshot = [...input];
    groupFoodsByType(input);
    expect(input).toEqual(snapshot);
  });
});

describe('toFoodRows', () => {
  const rowIds = (rows: PickerFood[][]) => rows.map(ids);

  it('chunks an even list into rows of two', () => {
    const rows = toFoodRows([food('a', null), food('b', null), food('c', null), food('d', null)]);
    expect(rowIds(rows)).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('leaves a trailing odd tile in a one-element row', () => {
    const rows = toFoodRows([food('a', null), food('b', null), food('c', null)]);
    expect(rowIds(rows)).toEqual([['a', 'b'], ['c']]);
  });

  it('returns a single one-element row for one food', () => {
    expect(rowIds(toFoodRows([food('a', null)]))).toEqual([['a']]);
  });

  it('returns no rows for an empty list', () => {
    expect(toFoodRows([])).toEqual([]);
  });

  it('preserves order row-major across the flattened rows', () => {
    const order = ['a', 'b', 'c', 'd', 'e'];
    const rows = toFoodRows(order.map((id) => food(id, null)));
    expect(ids(rows.flat())).toEqual(order);
  });
});

// Brand fixture — id doubles as the product name (readable assertions); brand
// is what these helpers key on.
const branded = (id: string, brand: string): PickerFood => ({
  id,
  brand,
  product_name: id,
  format: 'wet_canned',
  food_type: 'meal',
  photo_path: null,
});

describe('canonicalizeBrand', () => {
  it('folds case so spellings of one brand share a key', () => {
    expect(canonicalizeBrand('FANCY FEAST')).toBe('fancy feast');
    expect(canonicalizeBrand('Fancy Feast')).toBe('fancy feast');
    expect(canonicalizeBrand('fancy feast')).toBe('fancy feast');
  });

  it('trims and collapses internal whitespace', () => {
    expect(canonicalizeBrand('  Fancy   Feast ')).toBe('fancy feast');
    expect(canonicalizeBrand('Fancy\tFeast')).toBe('fancy feast');
    // Non-breaking space (NFKC folds it to a normal space, then collapse).
    expect(canonicalizeBrand('Fancy Feast')).toBe('fancy feast');
  });

  it('strips trademark / registered / copyright glyphs', () => {
    expect(canonicalizeBrand('Fancy Feast®')).toBe('fancy feast');
    // ™ and ℠ expand to "TM"/"SM" under NFKC — must be dropped before that,
    // not left to corrupt the key.
    expect(canonicalizeBrand('Fancy Feast™')).toBe('fancy feast');
    expect(canonicalizeBrand('Brand℠')).toBe('brand');
    expect(canonicalizeBrand('Brand©')).toBe('brand');
  });

  it('folds curly and straight apostrophes together', () => {
    expect(canonicalizeBrand('Hill’s')).toBe("hill's");
    expect(canonicalizeBrand("Hill's")).toBe("hill's");
    expect(canonicalizeBrand('Hill’s')).toBe(canonicalizeBrand("Hill's"));
  });

  it('is conservative — never merges genuinely different brands', () => {
    // No word-dropping or punctuation-stripping that would over-collapse.
    expect(canonicalizeBrand('Wellness')).not.toBe(canonicalizeBrand('Wellness Core'));
    expect(canonicalizeBrand('Friskies')).not.toBe(canonicalizeBrand('Friskies Farm Favorites'));
    expect(canonicalizeBrand('Blue')).not.toBe(canonicalizeBrand('Blue Buffalo'));
  });

  it('is idempotent', () => {
    const once = canonicalizeBrand('  Fancy Feast® ');
    expect(canonicalizeBrand(once)).toBe(once);
  });

  it('reduces a blank or whitespace-only brand to an empty key', () => {
    expect(canonicalizeBrand('')).toBe('');
    expect(canonicalizeBrand('   ')).toBe('');
  });
});

describe('groupFoodsByBrand', () => {
  const groupIds = (groups: ReturnType<typeof groupFoodsByBrand>) =>
    groups.map((g) => ({ brand: g.brand, foods: ids(g.foods) }));

  it('collapses spelling variants into one group, keeping the first-seen label', () => {
    const groups = groupFoodsByBrand([
      branded('chicken', 'Fancy Feast'),
      branded('salmon', 'fancy feast'),
      branded('tuna', 'Fancy Feast®'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].brand).toBe('Fancy Feast'); // first-seen original spelling
    expect(ids(groups[0].foods)).toEqual(['chicken', 'salmon', 'tuna']);
  });

  it('keeps genuinely different brands as separate groups, in first-seen order', () => {
    const groups = groupFoodsByBrand([
      branded('a', 'Fancy Feast'),
      branded('b', 'Royal Canin'),
      branded('c', 'Fancy Feast'),
    ]);
    expect(groupIds(groups)).toEqual([
      { brand: 'Fancy Feast', foods: ['a', 'c'] },
      { brand: 'Royal Canin', foods: ['b'] },
    ]);
  });

  it('collapses non-adjacent variants into a single group', () => {
    // Interleaved spellings must still land in one group — the helper keys by the
    // canonical brand, it does not rely on the caller pre-sorting variants together.
    const groups = groupFoodsByBrand([
      branded('a', 'Fancy Feast'),
      branded('b', 'Royal Canin'),
      branded('c', 'FANCY FEAST'),
    ]);
    expect(groups).toHaveLength(2);
    expect(groupIds(groups)).toEqual([
      { brand: 'Fancy Feast', foods: ['a', 'c'] },
      { brand: 'Royal Canin', foods: ['b'] },
    ]);
  });

  it('returns no groups for an empty list', () => {
    expect(groupFoodsByBrand([])).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const input = [branded('a', 'Fancy Feast'), branded('b', 'Royal Canin')];
    const snapshot = [...input];
    groupFoodsByBrand(input);
    expect(input).toEqual(snapshot);
  });
});
