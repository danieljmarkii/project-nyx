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
export const LIBRARY_FOODS_QUERY =
  `SELECT id, brand, product_name, format, food_type, MAX(photo_path) AS photo_path
   FROM food_items_cache
   GROUP BY LOWER(brand), LOWER(product_name)
   ORDER BY brand COLLATE NOCASE ASC, product_name COLLATE NOCASE ASC`;
