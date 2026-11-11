// DB-backed read for the reliable-favorites shelf (B-004 PR 5). Mirrors the
// analytics.ts pure-core + thin-wrapper split: ALL the favorite logic (treat /
// free-fed / rated filtering, the sample floor, the rate bar, and the recency
// guard) lives in the pure selectReliableFavorites in lib/food — unit-tested and
// adversarially reviewed. This wrapper only reads SQLite + resolves the free-fed
// spans, applies the clinical decline gate, and delegates.
//
// It is its OWN module rather than another lib/db function so that importing the
// free-fed helper + the decline detector (lib/feedingArrangements / lib/analytics,
// both → lib/db) introduces no lib/db import cycle — the same reason analytics.ts
// stands alone. lib/food stays I/O-free (it type-imports lib/db only) so its pure
// cores keep testing without the expo-sqlite stack; this module is the one place
// the pieces are wired to the database.
import { getDb } from './db';
import { getIntakeDecline, readFreeFedIntakeSpans, type Species } from './analytics';
import { isFreeFedIntakeMeal, type FreeFedIntakeSpan } from './freeFedIntake';
import { selectReliableFavorites, shouldSuppressFavorites, type FavoriteMealRow, type ReliableFavorite } from './food';

// One row per non-deleted meal of a CACHED (identifiable) food for this pet — a
// meal with no food_item_id can't be a "favorite food", so the inner JOIN drops it.
// `meals` has NO deleted_at column: a meal is soft-deleted by soft-deleting its
// parent EVENT, so `e.deleted_at IS NULL` is the complete soft-delete filter (don't
// add a meals.deleted_at check — there's no such column, and it would silently
// no-op). Scope is on m.pet_id (the meals→events FK guarantees the event is this
// pet's); we read rating + occurred_at per meal and let the pure core do the
// grouping and every exclusion, so the SQL stays a dumb projection.
export interface FavoriteRow {
  food_item_id: string;
  brand: string;
  product_name: string;
  food_type: string | null;
  intake_rating: string | null;
  occurred_at: string;
}

/**
 * The pet's reliable-favorite foods for the shelf, or [] when none qualify OR the
 * pet has an active intake-decline watch.
 *
 * The decline gate is the cross-surface arm of the n=1-never-reassures invariant:
 * the pure selector's recency guard already keeps a *currently-refused* food off the
 * shelf, but a pet whose OVERALL intake is declining (or who just refused a staple —
 * a non-specific disease signal) must not be shown a "reliable favorites" celebration
 * anywhere in the app, even on a different tab from where the watch surfaces. So we
 * read the SAME detectIntakeDecline verdict the Signal/Patterns surfaces use (decline
 * ROUTING stays theirs; this only READS it) and stay silent on an active watch.
 * Hiding the shelf during a watch is the safe direction — it withholds a nicety,
 * never reassurance. notEnoughData hides it too (CUL-1685, the armed-twin rule): the
 * detector cannot see this pet's recent intake, so no favourite is claimed beside it.
 *
 * `species` drives the detector's clinically-set thresholds (the feline single-day
 * hepatic-lipidosis path); it is the active pet's species, passed by the caller so
 * lib/ stays free of the pet store.
 */
/**
 * Every single-food meal of this pet, with its food. A MIXED BOWL is never here (spec
 * §5.4): its rating is a fact about the bowl, and "reliable favorite" is an acceptance
 * claim about one food. A mix names no food (T2), so the food join drops it; a meal with
 * a component count or any live component is dropped too, because live components win
 * over the parent (§3) and an older build can leave a food on a meal that is a mix.
 * EXPORTED so `foodFavorites.test.ts` runs the production string on a real engine.
 */
export const FAVORITE_MEALS_SQL = `SELECT f.id AS food_item_id, f.brand, f.product_name, f.food_type,
              m.intake_rating, e.occurred_at
       FROM meals m
       JOIN events e ON e.id = m.event_id
       JOIN food_items_cache f ON f.id = m.food_item_id
       WHERE m.pet_id = ?
         AND e.deleted_at IS NULL
         AND m.component_count IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM meal_components mc WHERE mc.event_id = m.event_id AND mc.deleted_at IS NULL
         )`;

/**
 * The shelf's meal rows, minus every rating logged while ITS food's bowl was down (CUL-1551).
 * BY DATE, NEVER BY FOOD: the same spans and the same predicate every other intake surface
 * reads (`readFreeFedIntakeSpans` + `isFreeFedIntakeMeal`, CUL-1086 / CUL-1237). The old rule
 * dropped every meal of a food free-fed TODAY, so a bowl left out last month and since taken
 * up had its "ate it all" counted as a watched meal, and a meal-fed food set down as a bowl
 * this week lost its watched ratings. A non-finite time is kept here and dropped by the core.
 * EXPORTED so the test drives the production filter, not a copy of it.
 */
export function observedFavoriteRows(rows: readonly FavoriteRow[], spans: readonly FreeFedIntakeSpan[]): FavoriteMealRow[] {
  const out: FavoriteMealRow[] = [];
  for (const r of rows) {
    const ms = Date.parse(r.occurred_at);
    if (isFreeFedIntakeMeal(r.food_item_id, ms, spans)) continue;
    out.push({
      foodItemId: r.food_item_id,
      brand: r.brand,
      productName: r.product_name,
      foodType: r.food_type,
      intakeRating: r.intake_rating,
      ms,
    });
  }
  return out;
}

export async function getReliableFavorites(petId: string, species: Species): Promise<ReliableFavorite[]> {
  const db = getDb();
  // All reads in parallel — the common (no-watch) path pays one round-trip, not
  // three. On the rare active-watch load BOTH the favorites query and the
  // spans read are discarded (the early return below); they're local
  // SQLite reads, so optimizing the common case wins over saving them.
  const [decline, rows, spans] = await Promise.all([
    getIntakeDecline(petId, species),
    db.getAllAsync<FavoriteRow>(FAVORITE_MEALS_SQL, [petId]),
    readFreeFedIntakeSpans(petId),
  ]);

  // Unless the decline read is armed and quiet ('none'), the whole shelf stays quiet
  // (see the doc above; CUL-1685's armed-twin rule). The gate predicate is pure +
  // unit-tested (lib/food shouldSuppressFavorites), not an untested branch here.
  if (shouldSuppressFavorites(decline.status)) return [];

  // Free-fed ratings are set aside here, by the bowl in force when each was logged (§11 #6),
  // so the core's by-food set stays empty: there is no food that is free-fed for all time.
  return selectReliableFavorites(observedFavoriteRows(rows, spans), { freeFedFoodIds: new Set(), nowMs: Date.now() });
}
