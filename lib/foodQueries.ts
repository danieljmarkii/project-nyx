// Pure SQL for the food-library reads — kept in an I/O-free module (no expo-sqlite
// import) so the query can be exercised against an in-memory SQLite in jest. The
// lib/db.ts test harness mocks getAllAsync, so the SQL itself is otherwise
// unexercised; lib/db.ts imports this string, and foodQueries.test.ts runs it for
// real against node:sqlite fixtures.

// Full catalog, deduplicated by case-folded brand+product, alpha by brand then
// product.
//
// MAX(photo_path) makes a non-null photo WIN the per-(brand+product) dedup so a
// photo-bearing capture is never hidden behind a photo-less duplicate of the same
// food (B-108 — a re-captured/duplicated food rendered the "no photo" placeholder
// on the Foods tab even though a photo existed). SQLite's single-max bare-column
// rule then ties the projected id/format/food_type to that SAME (photo-bearing)
// row, so the row the owner taps opens the capture whose photo they see — the
// projected row stays internally consistent instead of mixing columns across the
// dedup group. A fully photo-less group still yields one row with a null photo
// (MAX ignores NULLs → NULL), unchanged from before.
//
// B-005: `WHERE archived_at IS NULL` hides archived foods from the library list —
// a picker/library read, exactly where the archive filter belongs (the invariant:
// filter archived at picker/library reads ONLY, never on history/analytics/report
// joins). The filter is in the WHERE (pre-aggregation) so an archived duplicate
// capture of a still-active food can't drag its group into the archived state —
// each cache row is independently archived, and only non-archived rows form the
// displayed group. A group whose rows are ALL archived drops out entirely.
//
// B-351 slice 4: the row also carries the Tier-1 protein disclosure's three
// inputs — the captured set plus the two D10 completeness arms. They are BARE
// columns, so SQLite's single-max rule ties them to the same (photo-bearing) row
// MAX(photo_path) selects: the disclosure describes the capture whose photo the
// owner is looking at, rather than mixing one capture's proteins with another's
// provenance. A duplicate capture with a different set is the known B-009 dedup
// wrinkle and is unchanged by this.
export const LIBRARY_FOODS_QUERY =
  `SELECT id, brand, product_name, format, food_type, MAX(photo_path) AS photo_path,
          proteins, ingredients_notes, ai_extraction_confidence
   FROM food_items_cache
   WHERE archived_at IS NULL
   GROUP BY LOWER(brand), LOWER(product_name)
   ORDER BY brand COLLATE NOCASE ASC, product_name COLLATE NOCASE ASC`;

// B-005 PR 3: the Archived section's backing read — the inverse of the library
// list. Where LIBRARY_FOODS_QUERY shows what's still in the pantry, this shows
// what's been removed, so an owner can browse and Restore.
//
// Grouped by brand + product + FORMAT (not the library's format-blind
// brand+product), because that trio is exactly the unit archiveFood stamps in one
// shot: a whole brand+product+format group — every duplicate capture of it — is
// flipped to a single archived_at. So each row here is one restorable archive-unit
// carrying one uniform stamp, which lets Restore rebuild the precise ArchiveResult
// restoreFood expects (the id set + that one stamp) and revert exactly those rows.
//
// HAVING COUNT(*) = COUNT(archived_at) keeps a unit ONLY when EVERY capture in it
// is archived (COUNT(archived_at) counts non-null stamps). This is the mirror of
// the library's pre-aggregation WHERE and the guarantee of mutual exclusivity: a
// food with one archived and one still-active capture stays in the library (its
// active capture) and must NOT also surface here as a phantom "archived" tile — the
// HAVING drops that partial group. Only a fully-removed unit appears.
//
// GROUP_CONCAT(id) hands Restore the full id set of the unit so its server revert
// (.in('id', …)) clears every capture, not just the representative. MAX(archived_at)
// is the stamp (uniform within the unit); ordering by it puts the most-recently
// removed food first — a just-made mistake is the easiest to undo.
export const ARCHIVED_FOODS_QUERY =
  `SELECT id, brand, product_name, format, food_type,
          GROUP_CONCAT(id) AS archived_ids,
          MAX(archived_at) AS archived_at
   FROM food_items_cache
   GROUP BY LOWER(brand), LOWER(product_name), format
   HAVING COUNT(*) = COUNT(archived_at)
   ORDER BY MAX(archived_at) DESC, brand COLLATE NOCASE ASC, product_name COLLATE NOCASE ASC`;

// The recent foods read (`getRecentFoods`, lib/db.ts): the foods this pet actually ate,
// newest first by the pet's own MAX(occurred_at). Built here, I/O free, so the SQL runs
// against a real engine in foodQueries.test.ts.
//
// B-005: `AND f.archived_at IS NULL`. The recent foods are a PICKER read (they offer a
// food to log next), so an archived food drops out of the re-offer set. This is the one
// archive filter that lives on a meals JOIN; the meal HISTORY itself (getTimeline,
// getMealForEvent) is a separate join and stays unfiltered.
//
// Two ways to bound it. `daysBack` is the picker's rolling window, and its text compare
// is unchanged. `bounds` is a fixed span of instants (CUL-1647, the FAB's day order),
// compared through julianday() on BOTH sides, never as text: a row written locally
// reads `…T04:00:00.000Z`, the same instant hydrated from PostgREST reads
// `…T04:00:00+00:00`, and as text `+` sorts before `.`, which drops a row sitting
// exactly on a bound (C-40). `after` is inclusive and `before` exclusive. With neither,
// the SQL and the params are what they were before `bounds` existed
// (pinned in foodQueries.test.ts).
export interface RecentFoodsBounds {
  after: string;
  before: string;
}

export function recentFoodsQuery(
  petId: string,
  daysBack: number | null,
  limit: number,
  bounds?: RecentFoodsBounds,
  nowMs: number = Date.now(),
): { sql: string; params: (string | number)[] } {
  // Params are pushed in the same order their `?` placeholders appear below:
  // pet_id, then the optional window cutoff, then the optional bounds, then the limit.
  const params: (string | number)[] = [petId];
  let windowClause = '';
  if (daysBack != null) {
    windowClause = 'AND e.occurred_at >= ?';
    params.push(new Date(nowMs - daysBack * 24 * 60 * 60 * 1000).toISOString());
  }
  let boundsClause = '';
  if (bounds) {
    boundsClause =
      'AND julianday(e.occurred_at) >= julianday(?) AND julianday(e.occurred_at) < julianday(?)';
    params.push(bounds.after, bounds.before);
  }
  params.push(limit);
  const sql = `SELECT f.id, f.brand, f.product_name, f.format, f.food_type, f.photo_path
     FROM meals m
     JOIN events e ON e.id = m.event_id
     JOIN food_items_cache f ON f.id = m.food_item_id
     WHERE m.pet_id = ?
       AND e.deleted_at IS NULL
       AND f.archived_at IS NULL
       ${windowClause}${boundsClause ? ` ${boundsClause}` : ''}
     GROUP BY f.id
     ORDER BY MAX(e.occurred_at) DESC
     LIMIT ?`;
  return { sql, params };
}
