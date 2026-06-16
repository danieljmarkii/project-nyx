// Unit tests for the shared food-grouping helpers (B-004 PR 1). These guard the
// exact bucketing + row-chunking behaviour the quick-log picker relied on inline
// before the extraction, so the refactor stays byte-for-byte behaviour-preserving
// and the standalone Foods tab inherits the same contract.
import {
  groupFoodsByType, toFoodRows, canonicalizeBrand, groupFoodsByBrand,
  foodIntakeKey, indexIntakeStats, relativeDayLabel, foodIntakeNote,
  selectReliableFavorites, foodFavoriteNote,
  FAVORITE_MIN_RATED_MEALS, FAVORITE_MIN_RATE, FAVORITE_SHELF_LIMIT,
  type FavoriteMealRow,
} from './food';
import type { FoodIntakeStat, PickerFood } from './db';

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

// ── Per-pet intake annotation (B-004 PR 4) ─────────────────────────────────────

describe('foodIntakeKey + indexIntakeStats', () => {
  const stat = (over: Partial<FoodIntakeStat> = {}): FoodIntakeStat => ({
    brand_key: 'fancy feast',
    product_key: 'chicken paté',
    meal_count: 3,
    last_fed_at: '2026-06-14T12:00:00.000Z',
    ...over,
  });

  it('case-folds brand+product into the key the query groups on', () => {
    expect(foodIntakeKey('Fancy Feast', 'Chicken Paté')).toBe(foodIntakeKey('fancy feast', 'chicken paté'));
  });

  it('separator-joins so component boundaries cannot collide', () => {
    // "ab" + "c" must not collide with "a" + "bc" (a space delimiter would).
    expect(foodIntakeKey('ab', 'c')).not.toBe(foodIntakeKey('a', 'bc'));
  });

  it('indexes stats so a library row finds its stat by foodIntakeKey', () => {
    const map = indexIntakeStats([
      stat({ brand_key: 'fancy feast', product_key: 'chicken' }),
      stat({ brand_key: 'royal canin', product_key: 'gastrointestinal' }),
    ]);
    // Looked up with the original-cased row brand/product — the key folds to match.
    expect(map.get(foodIntakeKey('Fancy Feast', 'Chicken'))?.product_key).toBe('chicken');
    expect(map.get(foodIntakeKey('Royal Canin', 'Gastrointestinal'))?.product_key).toBe('gastrointestinal');
    expect(map.get(foodIntakeKey('Unknown', 'Food'))).toBeUndefined();
  });
});

describe('relativeDayLabel', () => {
  // Anchor "now" to a fixed local wall-clock moment and build each "then" by
  // subtracting whole local days from it, so the calendar-day math is exact in
  // any runner timezone (both sides bucket on local midnight). Hour 12 keeps the
  // UTC round-trip from shifting the local date.
  const now = new Date(2026, 5, 16, 9, 30, 0).getTime(); // 2026-06-16 09:30 local
  const daysAgoIso = (n: number): string => {
    const d = new Date(2026, 5, 16, 12);
    d.setDate(d.getDate() - n);
    return d.toISOString();
  };

  it('labels same-day and adjacent days warmly', () => {
    expect(relativeDayLabel(daysAgoIso(0), now)).toBe('today');
    expect(relativeDayLabel(daysAgoIso(1), now)).toBe('yesterday');
  });

  it('counts exact days up to a week', () => {
    expect(relativeDayLabel(daysAgoIso(2), now)).toBe('2 days ago');
    expect(relativeDayLabel(daysAgoIso(6), now)).toBe('6 days ago');
  });

  it('rolls up to weeks, then months, at honest boundaries', () => {
    expect(relativeDayLabel(daysAgoIso(7), now)).toBe('last week');
    expect(relativeDayLabel(daysAgoIso(13), now)).toBe('last week');
    expect(relativeDayLabel(daysAgoIso(14), now)).toBe('2 weeks ago');
    expect(relativeDayLabel(daysAgoIso(29), now)).toBe('4 weeks ago');
    expect(relativeDayLabel(daysAgoIso(30), now)).toBe('last month');
    expect(relativeDayLabel(daysAgoIso(59), now)).toBe('last month');
    expect(relativeDayLabel(daysAgoIso(60), now)).toBe('2 months ago');
    expect(relativeDayLabel(daysAgoIso(364), now)).toBe('12 months ago');
    expect(relativeDayLabel(daysAgoIso(365), now)).toBe('over a year ago');
  });

  it('clamps a future timestamp (clock skew) to "today" — never "in N days"', () => {
    expect(relativeDayLabel(daysAgoIso(-3), now)).toBe('today');
  });

  it('returns an empty string for an unparseable timestamp', () => {
    expect(relativeDayLabel('not-a-date', now)).toBe('');
  });
});

describe('foodIntakeNote', () => {
  const now = new Date(2026, 5, 16, 9, 0, 0).getTime();
  const at = (daysAgo: number): string => {
    const d = new Date(2026, 5, 16, 12);
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString();
  };
  const stat = (meal_count: number, daysAgo: number): FoodIntakeStat => ({
    brand_key: 'b', product_key: 'p', meal_count, last_fed_at: at(daysAgo),
  });

  it('returns null when the pet has no logged meals of the food', () => {
    expect(foodIntakeNote(undefined, now)).toBeNull();
    expect(foodIntakeNote(stat(0, 1), now)).toBeNull(); // defensive: count 0
  });

  it('returns null (no dangling "Last logged ") for an unreadable timestamp', () => {
    expect(foodIntakeNote({ brand_key: 'b', product_key: 'p', meal_count: 3, last_fed_at: 'not-a-date' }, now)).toBeNull();
  });

  it('says "logged", not "fed" — recency alone for a single meal, never "· 1 times"', () => {
    // "Logged" not "fed/ate": a refused offering is still a logged meal, so the
    // line can never read as reassurance the pet ate (intake-is-not-preference).
    expect(foodIntakeNote(stat(1, 0), now)).toBe('Last logged today');
    expect(foodIntakeNote(stat(1, 1), now)).toBe('Last logged yesterday');
  });

  it('appends the count for repeat logged meals', () => {
    expect(foodIntakeNote(stat(12, 3), now)).toBe('Last logged 3 days ago · 12 times');
    expect(foodIntakeNote(stat(2, 1), now)).toBe('Last logged yesterday · 2 times');
  });
});

// ── Reliable-favorites shelf (B-004 PR 5) ──────────────────────────────────────
// The one Foods-tab surface that reads a RATE, so it carries the analytics
// finished-rate invariants (§11 #1/#5/#6) PLUS a recency guard. These fixtures are
// what the adversarial review hits; the decline-mask case is the headline.

describe('selectReliableFavorites', () => {
  const NO_FREE_FED: ReadonlySet<string> = new Set<string>();

  // One meal row — defaults to a finished ('all') meal of a meal-type food;
  // override anything per case. Default ms keeps single rows deterministic.
  const meal = (over: Partial<FavoriteMealRow> = {}): FavoriteMealRow => ({
    foodItemId: 'f1',
    brand: 'Tiki Cat',
    productName: 'Ahi Tuna',
    foodType: 'meal',
    intakeRating: 'all',
    ms: 1000,
    ...over,
  });

  // N meals of one food carrying the given ratings, timestamped oldest→newest so
  // the LAST rating is the most-recent meal — the recency guard's input.
  const series = (
    ratings: (string | null)[],
    over: Partial<FavoriteMealRow> = {},
  ): FavoriteMealRow[] =>
    ratings.map((intakeRating, i) => meal({ ...over, intakeRating, ms: (i + 1) * 1000 }));

  it('exposes the documented thresholds (pin the bar against silent drift)', () => {
    expect(FAVORITE_MIN_RATED_MEALS).toBe(5);
    expect(FAVORITE_MIN_RATE).toBe(0.8);
  });

  it('promotes a food finished every rated meal (5 of 5)', () => {
    const favs = selectReliableFavorites(
      series(['all', 'all', 'most', 'all', 'all']),
      { freeFedFoodIds: NO_FREE_FED },
    );
    expect(favs).toHaveLength(1);
    expect(favs[0]).toMatchObject({ finishedMeals: 5, ratedMeals: 5, rate: 1 });
    expect(favs[0].key).toBe(foodIntakeKey('Tiki Cat', 'Ahi Tuna'));
  });

  it('promotes at exactly the 80% bar (4 of 5 finished, newest finished)', () => {
    const favs = selectReliableFavorites(
      series(['all', 'some', 'most', 'all', 'all']),
      { freeFedFoodIds: NO_FREE_FED },
    );
    expect(favs).toHaveLength(1);
    expect(favs[0]).toMatchObject({ finishedMeals: 4, ratedMeals: 5 });
    expect(favs[0].rate).toBeCloseTo(0.8);
  });

  it('drops a food below the rate bar (3 of 5 finished, 60%)', () => {
    const favs = selectReliableFavorites(
      series(['all', 'some', 'some', 'all', 'all']),
      { freeFedFoodIds: NO_FREE_FED },
    );
    expect(favs).toEqual([]);
  });

  it('drops a food below the sample floor even at 100% (only 4 rated meals)', () => {
    const favs = selectReliableFavorites(
      series(['all', 'all', 'all', 'all']),
      { freeFedFoodIds: NO_FREE_FED },
    );
    expect(favs).toEqual([]);
  });

  // ── §11 #1: treats finish at a ceiling — never a meal favorite ───────────────
  it('excludes a food if ANY capture is classified a treat (ceiling-unsafe, order-independent)', () => {
    const rows = [
      ...series(['all', 'all', 'all', 'all', 'all']),
      meal({ foodType: 'treat', intakeRating: 'all', ms: 6000 }), // one treat-typed capture
    ];
    expect(selectReliableFavorites(rows, { freeFedFoodIds: NO_FREE_FED })).toEqual([]);
  });

  it('cannot exclude an UNclassified treat (food_type null) — a known classification limit', () => {
    // Documented limitation inherited from computeTopFoods: a treat the user never
    // classified is indistinguishable from a meal here, so a high-finish unclassified
    // item CAN surface. The fix is food classification, not this selector — asserted
    // so the behavior is intentional, not an accident.
    const favs = selectReliableFavorites(
      series(['all', 'all', 'all', 'all', 'all'], { foodType: null }),
      { freeFedFoodIds: NO_FREE_FED },
    );
    expect(favs).toHaveLength(1);
  });

  // ── §11 #6: free-fed intake isn't directly observed ──────────────────────────
  it('excludes free-fed meals from the denominator', () => {
    const portionFed = series(['all', 'all', 'all', 'all', 'all'], { foodItemId: 'f1', brand: 'A', productName: 'a' });
    const freeFed = series(['all', 'all', 'all', 'all', 'all'], { foodItemId: 'f2', brand: 'B', productName: 'b' });
    const favs = selectReliableFavorites([...portionFed, ...freeFed], { freeFedFoodIds: new Set(['f2']) });
    expect(favs.map((f) => f.brand)).toEqual(['A']); // B is free-fed → no observed rate
  });

  it('drops a food below the floor once its free-fed captures are excluded', () => {
    // Same brand+product, two capture ids: f1 observed (4), f2 free-fed (3). After
    // the §11 #6 exclusion only 4 rated meals remain → below the floor of 5.
    const rows = [
      ...series(['all', 'all', 'all', 'all'], { foodItemId: 'f1' }),
      ...series(['all', 'all', 'all'], { foodItemId: 'f2' }),
    ];
    expect(selectReliableFavorites(rows, { freeFedFoodIds: new Set(['f2']) })).toEqual([]);
  });

  // ── Rated-only denominator ───────────────────────────────────────────────────
  it('excludes unrated meals from the denominator (an unrated latest meal is not a refusal)', () => {
    // 5 finished + 3 unrated (logged without an intake tap). Denominator is 5, not 8;
    // the unrated latest meals don't trip the recency guard (a logging gap ≠ anorexia).
    const favs = selectReliableFavorites(
      series(['all', 'all', 'all', 'all', 'all', null, null, null]),
      { freeFedFoodIds: NO_FREE_FED },
    );
    expect(favs[0]).toMatchObject({ finishedMeals: 5, ratedMeals: 5, rate: 1 });
  });

  it('drops meals with an unparseable timestamp from the qualifying set', () => {
    const rows = [...series(['all', 'all', 'all', 'all', 'all']), meal({ intakeRating: 'all', ms: NaN })];
    expect(selectReliableFavorites(rows, { freeFedFoodIds: NO_FREE_FED })[0].ratedMeals).toBe(5);
  });

  // ── The recency guard — the decline mask (the headline case) ─────────────────
  it('SUPPRESSES a food refused at its most-recent meal, despite a high all-time rate', () => {
    // 9 of 10 finished all-time (90% ≥ bar, well above floor) — but the LATEST rated
    // meal is a refusal. Promoting it would reassure over a possible decline, which
    // the AI Signal's detector ② owns; the shelf must stay silent (no surface may
    // reassure over a decline — intake-is-not-preference; absence ≠ wellness).
    const ratings = ['all', 'all', 'all', 'all', 'all', 'all', 'all', 'all', 'all', 'refused'];
    expect(selectReliableFavorites(series(ratings), { freeFedFoodIds: NO_FREE_FED })).toEqual([]);
  });

  it('suppresses when the latest rated meal is merely "some" (strict present-tense reliability)', () => {
    // 5 of 6 finished (83% ≥ bar) but the newest meal was not finished → not reliable
    // right now. Over-suppression is the safe direction (hides a nicety, never reassures).
    expect(selectReliableFavorites(series(['all', 'all', 'all', 'all', 'all', 'some']), { freeFedFoodIds: NO_FREE_FED }))
      .toEqual([]);
  });

  it('promotes when the latest rated meal is finished despite an earlier miss', () => {
    const favs = selectReliableFavorites(series(['some', 'all', 'all', 'all', 'all', 'all']), { freeFedFoodIds: NO_FREE_FED });
    expect(favs).toHaveLength(1);
    expect(favs[0]).toMatchObject({ finishedMeals: 5, ratedMeals: 6 });
  });

  it('suppresses on a timestamp tie if any meal at the latest ms is not finished', () => {
    const rows = [
      ...series(['all', 'all', 'all', 'all']), // ms 1000..4000
      meal({ intakeRating: 'all', ms: 5000 }),
      meal({ intakeRating: 'refused', ms: 5000 }), // tie at the max ms, a refusal
    ];
    expect(selectReliableFavorites(rows, { freeFedFoodIds: NO_FREE_FED })).toEqual([]);
  });

  // ── Grouping ─────────────────────────────────────────────────────────────────
  it('pools duplicate captures of one brand+product into a single favorite', () => {
    const rows = [
      ...series(['all', 'all', 'all'], { foodItemId: 'cap1' }),
      ...series(['all', 'all'], { foodItemId: 'cap2' }),
    ];
    const favs = selectReliableFavorites(rows, { freeFedFoodIds: NO_FREE_FED });
    expect(favs).toHaveLength(1);
    expect(favs[0]).toMatchObject({ ratedMeals: 5, finishedMeals: 5 });
  });

  it('folds case/spelling variants of one brand+product, keeping the first-seen spelling', () => {
    const rows = [
      ...series(['all', 'all', 'all'], { brand: 'Tiki Cat', productName: 'Ahi Tuna', foodItemId: 'c1' }),
      ...series(['all', 'all'], { brand: 'TIKI CAT', productName: 'ahi tuna', foodItemId: 'c2' }),
    ];
    const favs = selectReliableFavorites(rows, { freeFedFoodIds: NO_FREE_FED });
    expect(favs).toHaveLength(1);
    expect(favs[0].ratedMeals).toBe(5);
    expect(favs[0].brand).toBe('Tiki Cat');
  });

  // ── Positive-only + ranking ──────────────────────────────────────────────────
  it('is positive-only — a mostly-refused food yields NO row, never a negative one', () => {
    expect(selectReliableFavorites(series(['refused', 'refused', 'picked', 'some', 'refused']), { freeFedFoodIds: NO_FREE_FED }))
      .toEqual([]);
  });

  it('ranks by rate desc, then denominator desc, then label', () => {
    const a = series(['all', 'all', 'all', 'all', 'all'], { brand: 'A', productName: 'a', foodItemId: 'a' }); // 1.0
    const b = series(['all', 'some', 'all', 'all', 'all'], { brand: 'B', productName: 'b', foodItemId: 'b' }); // 0.8
    const c = series(['all', 'all', 'all', 'all', 'all', 'all', 'some', 'all'], { brand: 'C', productName: 'c', foodItemId: 'c' }); // 0.875
    const favs = selectReliableFavorites([...b, ...a, ...c], { freeFedFoodIds: NO_FREE_FED });
    expect(favs.map((f) => f.brand)).toEqual(['A', 'C', 'B']);
  });

  it('breaks a rate tie by the larger denominator (more evidence first)', () => {
    const small = series(['all', 'all', 'all', 'all', 'all'], { brand: 'Small', productName: 's', foodItemId: 's' });
    const big = series(['all', 'all', 'all', 'all', 'all', 'all', 'all', 'all'], { brand: 'Big', productName: 'b', foodItemId: 'b' });
    expect(selectReliableFavorites([...small, ...big], { freeFedFoodIds: NO_FREE_FED }).map((f) => f.brand))
      .toEqual(['Big', 'Small']);
  });

  it('caps the shelf at the limit', () => {
    const rows: FavoriteMealRow[] = [];
    for (let i = 0; i < FAVORITE_SHELF_LIMIT + 2; i++) {
      rows.push(...series(['all', 'all', 'all', 'all', 'all'], { brand: `B${i}`, productName: `p${i}`, foodItemId: `f${i}` }));
    }
    expect(selectReliableFavorites(rows, { freeFedFoodIds: NO_FREE_FED })).toHaveLength(FAVORITE_SHELF_LIMIT);
  });

  it('honors overridden floor and rate thresholds (options plumb through)', () => {
    const rows = series(['all', 'all', 'all']); // 3/3
    expect(selectReliableFavorites(rows, { freeFedFoodIds: NO_FREE_FED })).toEqual([]); // default floor 5
    expect(selectReliableFavorites(rows, { freeFedFoodIds: NO_FREE_FED, minRatedMeals: 3 })).toHaveLength(1);
  });

  it('returns an empty array for no meals', () => {
    expect(selectReliableFavorites([], { freeFedFoodIds: NO_FREE_FED })).toEqual([]);
  });
});

describe('foodFavoriteNote', () => {
  const fav = (finishedMeals: number, ratedMeals: number) => ({
    key: 'k', brand: 'B', productName: 'p', rate: finishedMeals / ratedMeals, finishedMeals, ratedMeals,
  });

  it('always shows the denominator (the rate receipts, never a bare percentage)', () => {
    expect(foodFavoriteNote(fav(9, 10))).toBe('Finished 9 of 10 meals');
  });

  it('reads naturally at a perfect rate', () => {
    expect(foodFavoriteNote(fav(7, 7))).toBe('Finished 7 of 7 meals');
  });
});
