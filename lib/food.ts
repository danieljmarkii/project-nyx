// Shared food-library grouping helpers — extracted from components/log/FoodPicker
// (B-004 PR 1) so the standalone Foods tab and the quick-log picker bucket and
// lay out the library identically, from one tested source. Pure and schema-free:
// no DB, no I/O, no React — just the food_type bucketing (B-011) and the 2-up
// row chunking the grid renders. The `import type` keeps this module free of any
// runtime dependency on lib/db, so it unit-tests without the expo-sqlite stack.
import type { FoodIntakeStat, PickerFood } from './db';

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

// ── Per-pet intake annotation (B-004 PR 4) ─────────────────────────────────────
// The Foods tab shows the global catalog, but each row carries a per-active-pet
// note of the pet's *logged* history with the food — a factual recency + count
// line, never a preference or wellness read (intake-is-not-preference). "Logged",
// not "fed/ate": a meal is an offering, counted even when refused, so a rising
// count reads as logging diligence, not feeding success — it can't soften a
// decline. The positive "reliable favorite" rate is PR 5 (Data sign-off); decline
// routing is the AI Signal's. This layer only says "last logged … · N times".

// Case-fold brand+product into the key getFoodIntakeStats groups on, so a library
// row finds its stat across the duplicate-capture ids that share a brand+product.
// Joined on an ASCII unit-separator (U+001F) — a control char that can't occur in
// a food label, so "ab"+"c" can't collide with "a"+"bc" the way a space delimiter
// would (both brands and products contain spaces). Mirrors the SQL's
// LOWER(brand)/LOWER(product_name). Pure; no I/O.
export function foodIntakeKey(brand: string, productName: string): string {
  return `${brand.toLowerCase()}\u001F${productName.toLowerCase()}`;
}

// Index a pet's intake stats by foodIntakeKey for O(1) per-row lookup. The stat's
// own brand_key/product_key are already case-folded by the query, so they form
// the identical key foodIntakeKey(brand, product) produces from a library row.
export function indexIntakeStats(stats: FoodIntakeStat[]): Map<string, FoodIntakeStat> {
  const map = new Map<string, FoodIntakeStat>();
  for (const s of stats) {
    map.set(`${s.brand_key}\u001F${s.product_key}`, s);
  }
  return map;
}

// Warm, day-granular "time ago" for a feeding — today / yesterday / N days /
// weeks / months. Computed on LOCAL calendar days so "today"/"yesterday" align
// with the owner's clock (occurred_at is UTC). A future timestamp (cross-device
// clock skew) clamps to "today" — never "in 3 days". Honest buckets over false
// precision: past ~4 weeks it rounds to months. Pure.
export function relativeDayLabel(iso: string, now: number): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const nowD = new Date(now);
  const thenMidnight = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime();
  const nowMidnight = new Date(nowD.getFullYear(), nowD.getMonth(), nowD.getDate()).getTime();
  const d = Math.round((nowMidnight - thenMidnight) / 86_400_000);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d <= 6) return `${d} days ago`;
  if (d <= 13) return 'last week';
  if (d <= 29) return `${Math.round(d / 7)} weeks ago`;
  if (d <= 59) return 'last month';
  if (d <= 364) return `${Math.round(d / 30)} months ago`;
  return 'over a year ago';
}

// The Foods-row annotation for a pet's history with one food, or null when the
// pet has no logged meals of it (or the timestamp is unreadable) — the row then
// stays clean (matching History's NULL-intake-renders-nothing convention, and
// keeping the browse surface quiet rather than stamping every untried food with
// an empty-state line). Says "logged", never "fed/ate": a meal is an OFFERING,
// counted even when refused, so the line can never read as reassurance that the
// pet ate — and a rising count reads as logging diligence, not feeding success
// (intake-is-not-preference; decline is the Signal's to surface, not a browse
// row's). count ≥ 2 appends "· N times"; a single meal shows recency alone.
export function foodIntakeNote(stat: FoodIntakeStat | undefined, now: number): string | null {
  if (!stat || stat.meal_count < 1) return null;
  const when = relativeDayLabel(stat.last_fed_at, now);
  if (!when) return null; // unreadable timestamp — no honest recency to show
  const recency = `Last logged ${when}`;
  return stat.meal_count >= 2 ? `${recency} · ${stat.meal_count} times` : recency;
}

// ── Reliable-favorites shelf (B-004 PR 5) ──────────────────────────────────────
// A POSITIVE-ONLY, rate-over-N promotion: the foods this pet RELIABLY FINISHES,
// with the denominator shown on the card. This is the one Foods-tab surface that
// reads a *rate* (PR 4 deliberately deferred all rate framing to here), so it is
// held to the analytics.ts finished-rate discipline (§11 #1/#5/#6) PLUS a recency
// guard — because "favorite" is a present-tense claim and NO Nyx surface may
// reassure over an active decline (intake-is-not-preference; absence/decline is
// never wellness). The pure core below is what the jest fixtures and the
// adversarial review hit; the DB read is the thin wrapper in lib/foodFavorites.
//
// A food is a reliable favorite only when ALL hold:
//   • MEALS only — any capture of the brand+product classified `food_type='treat'`
//     taints the whole group OUT (a treat finishes at a ceiling; "treats 100%
//     finished → loved" is exactly the soft-preference read the invariant forbids).
//     Order-independent treat-if-ANY, mirroring computeTopFoods so a mixed/legacy
//     classification errs ceiling-safe, not toward whichever row the DB returned.
//   • Intake DIRECTLY OBSERVED — meals of a currently free-fed food are excluded
//     (§11 #6: a free-fed bowl's rating is unreliable; its absence isn't a refusal).
//   • RATED — only meals the owner gave an intake rating count (you cannot call a
//     meal "finished" if it was never rated). Unrated meals leave the denominator.
//   • ENOUGH samples — rated meals ≥ FAVORITE_MIN_RATED_MEALS. One good meal is not
//     a pattern; a favorite is a *claim*, so the floor sits one notch above the
//     analytics neutral-rate floor of 4.
//   • HIGH rate — finished(most/all)/rated ≥ FAVORITE_MIN_RATE. Positive-only by
//     construction: a low rate is NEVER surfaced (there is deliberately no "foods
//     Nyx refuses" inverse — that routing is the decline detector's, never a
//     browse row's).
//   • STILL reliable NOW — the most-recent rated meal was finished. A food finished
//     18/20 all-time but refused at its latest meal is in possible decline and is
//     SUPPRESSED here (the AI Signal's detector ② owns that refusal), so the shelf
//     can never call a food a "favorite" in the same breath the pet is refusing it.
//     Over-suppression is the SAFE direction — it hides a nicety, never reassures.

/** Min rated, directly-observed meals before a "favorite" is a claim and not noise.
 *  One above analytics' neutral-rate floor (minRatedMealsForIntakeRate = 4): a
 *  favorite asserts more than a neutral rate, so it earns a higher bar. */
export const FAVORITE_MIN_RATED_MEALS = 5;
/** Min finished-rate to read as "reliably finishes". Positive-only ceiling band. */
export const FAVORITE_MIN_RATE = 0.8;
/** Cap so the shelf stays a curated strip, not a second full catalog — lower-ranked
 *  favorites still appear in the type-grouped list below. */
export const FAVORITE_SHELF_LIMIT = 6;

/** WSAVA ratings that count a meal as "finished". Mirrors analytics' FINISHED_SCORE
 *  (most | all); any other/absent rating is not finished. */
const FINISHED_RATINGS: ReadonlySet<string> = new Set(['most', 'all']);

/** One non-deleted meal of a cached food, reduced to what the favorites core needs.
 *  Built by the lib/foodFavorites DB wrapper; the core does ALL the favorite logic. */
export interface FavoriteMealRow {
  foodItemId: string;
  brand: string;
  productName: string;
  /** food_items_cache.food_type: 'meal' | 'treat' | 'other' | null. */
  foodType: string | null;
  /** WSAVA rating string, or null when the meal was logged without an intake rating. */
  intakeRating: string | null;
  /** occurred_at as epoch ms — the recency guard needs ordering. Non-finite dropped. */
  ms: number;
}

export interface ReliableFavorite {
  /** foodIntakeKey(brand, productName) — matches a library row + is a stable list key. */
  key: string;
  /** First-seen original spelling, for display (the key is the case-folded form). */
  brand: string;
  productName: string;
  /** finished/rated, in [FAVORITE_MIN_RATE, 1]. */
  rate: number;
  finishedMeals: number;
  /** Rated, non-treat, non-free-fed meals — the denominator shown on the card. */
  ratedMeals: number;
}

export interface FavoriteOptions {
  /** Foods currently free-fed for this pet — their meals are excluded (§11 #6).
   *  Pass an empty set when none are free-fed (the core never assumes a default). */
  freeFedFoodIds: ReadonlySet<string>;
  /** Override the sample floor (tests). Default FAVORITE_MIN_RATED_MEALS. */
  minRatedMeals?: number;
  /** Override the rate bar (tests). Default FAVORITE_MIN_RATE. */
  minRate?: number;
  /** Max favorites returned. Default FAVORITE_SHELF_LIMIT. */
  limit?: number;
}

interface FavoriteGroup {
  brand: string;
  productName: string;
  rows: FavoriteMealRow[];
  /** True once ANY capture of this brand+product is classified a treat. */
  treatTainted: boolean;
}

/**
 * Pure: the pet's reliable-favorite foods — positive-only, rate-over-N, recency-
 * guarded (see the block comment above for the full contract). Returns at most
 * `limit` favorites, ranked by rate desc, then denominator desc, then label, so the
 * shelf is deterministic. An empty array means "no food clears the bar yet" — the
 * shelf simply doesn't render (a thin/declining library never produces a favorite,
 * and there is no inverse "refuses" output by construction).
 */
export function selectReliableFavorites(
  rows: FavoriteMealRow[],
  opts: FavoriteOptions,
): ReliableFavorite[] {
  const minRatedMeals = opts.minRatedMeals ?? FAVORITE_MIN_RATED_MEALS;
  const minRate = opts.minRate ?? FAVORITE_MIN_RATE;
  const limit = opts.limit ?? FAVORITE_SHELF_LIMIT;
  const freeFed = opts.freeFedFoodIds;

  // Group every meal by case-folded brand+product (the SAME collapse the library
  // row uses, via foodIntakeKey), so duplicate captures of one package pool into
  // one favorite. Carry the first-seen original spelling for display.
  const groups = new Map<string, FavoriteGroup>();
  for (const r of rows) {
    const key = foodIntakeKey(r.brand, r.productName);
    let g = groups.get(key);
    if (!g) {
      g = { brand: r.brand, productName: r.productName, rows: [], treatTainted: false };
      groups.set(key, g);
    }
    if (r.foodType === 'treat') g.treatTainted = true;
    g.rows.push(r);
  }

  const favorites: ReliableFavorite[] = [];
  for (const [key, g] of groups) {
    if (g.treatTainted) continue; // ceiling-unsafe — never a meal favorite
    // Qualifying = rated, directly-observed (non-free-fed), parseable-time meals.
    const qualifying = g.rows.filter(
      (r) => r.intakeRating != null && !freeFed.has(r.foodItemId) && Number.isFinite(r.ms),
    );
    if (qualifying.length < minRatedMeals) continue; // §11 #5 floor
    const finishedMeals = qualifying.filter(
      (r) => FINISHED_RATINGS.has(r.intakeRating as string),
    ).length;
    const rate = finishedMeals / qualifying.length;
    if (rate < minRate) continue; // positive-only — a low rate is never surfaced
    // Recency guard: the latest rated meal(s) must be finished. On a timestamp tie
    // ALL meals at the max ms must be finished, so ambiguity errs toward suppression
    // (the safe direction). Operates on the qualifying set only — an unrated or
    // free-fed later meal is not a refusal signal (a logging gap ≠ anorexia).
    const maxMs = qualifying.reduce((m, r) => (r.ms > m ? r.ms : m), -Infinity);
    const latestFinished = qualifying
      .filter((r) => r.ms === maxMs)
      .every((r) => FINISHED_RATINGS.has(r.intakeRating as string));
    if (!latestFinished) continue;
    favorites.push({
      key,
      brand: g.brand,
      productName: g.productName,
      rate,
      finishedMeals,
      ratedMeals: qualifying.length,
    });
  }

  return favorites
    .sort(
      (a, b) =>
        b.rate - a.rate ||
        b.ratedMeals - a.ratedMeals ||
        a.brand.localeCompare(b.brand) ||
        a.productName.localeCompare(b.productName),
    )
    .slice(0, limit);
}

// The shelf-row line for a reliable favorite — the denominator is ALWAYS shown
// (the rate's receipts, never a bare "82%" that could read as a preference score).
// "Meals" here = rated, directly-observed meals, the honest base of the rate; the
// floor guarantees ratedMeals ≥ 5, so the phrasing is always plural. Pure.
export function foodFavoriteNote(fav: ReliableFavorite): string {
  return `Finished ${fav.finishedMeals} of ${fav.ratedMeals} meals`;
}

// Pure: should the ENTIRE favorites shelf be suppressed, given the pet's intake-
// decline verdict? ONLY an active `'watch'` suppresses — `'none'` and
// `'not_enough_data'` do NOT. This pins the cross-surface arm of the safety
// invariant from BOTH sides: an active decline watch ALWAYS hides the shelf (no
// surface reassures over a decline), while thin/absent decline data must NEVER hide
// it (absence of a decline signal ≠ a decline — that would wrongly blank the shelf
// whenever the baseline is too thin to assess). Kept pure + named so the gate is a
// tested unit, not an inline branch buried in the I/O wrapper. `declineStatus` is
// the IntakeDeclineResult.status the wrapper reads from getIntakeDecline.
export function shouldSuppressFavorites(declineStatus: string): boolean {
  return declineStatus === 'watch';
}
