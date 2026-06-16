// Unit tests for the shared food-grouping helpers (B-004 PR 1). These guard the
// exact bucketing + row-chunking behaviour the quick-log picker relied on inline
// before the extraction, so the refactor stays byte-for-byte behaviour-preserving
// and the standalone Foods tab inherits the same contract.
import { groupFoodsByType, toFoodRows } from './food';
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
