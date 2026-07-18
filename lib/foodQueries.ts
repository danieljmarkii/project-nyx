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
export const LIBRARY_FOODS_QUERY =
  `SELECT id, brand, product_name, format, food_type, MAX(photo_path) AS photo_path
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
