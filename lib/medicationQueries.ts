// Pure SQL for the medication-picker reads (B-117 PR 3) — kept in an I/O-free
// module (no expo-sqlite import) so the queries can be exercised against an
// in-memory SQLite in jest, exactly like lib/foodQueries.ts. lib/db.ts mocks
// getAllAsync in its own tests, so the SQL itself is otherwise unexercised;
// lib/db.ts imports these strings and medicationQueries.test.ts runs them for
// real against node:sqlite fixtures.
//
// The food picker is the 1:1 reference (spec §9): getLibraryFoods ⇒
// LIBRARY_MEDICATIONS_QUERY, getRecentFoods ⇒ recentMedicationsQuery.

// Full medication library, newest-name-first scan order. Every medication_items_cache
// row (the organically-built drug catalog, D2). Unlike the food library, this does
// NOT dedup by name+strength: the library is built one explicit "add medication"
// at a time in PR 3 (no photo re-capture duplicates the way food_items does), so
// there is no dedup to do yet — and cross-owner/cross-item canonicalization is the
// explicit future refactor (D2 / B-052), deferred to the Signal pass. Ordered by
// drug then brand so a scan reads alphabetically.
export const LIBRARY_MEDICATIONS_QUERY =
  `SELECT id, generic_name, brand_name, strength, form, default_route
   FROM medication_items_cache
   ORDER BY generic_name COLLATE NOCASE ASC, brand_name COLLATE NOCASE ASC`;

// This pet's most-recently-given distinct drugs, newest first — ordered by the
// pet's actual last dose of each drug (MAX(occurred_at)), the exact shape of
// getRecentFoods. The INNER JOIN on medication_items_cache deliberately drops
// ad-hoc doses with a NULL medication_item_id: a dose with no library item can't
// render as a re-pickable tile. e.deleted_at IS NULL hides soft-deleted doses
// (a dose's deletedness rides its parent event — migration 020). `hasWindow`
// adds the "recent" time bound (the picker passes a cutoff; a null-window caller
// re-offers staples of any age, like the FAB does for food).
//
// Params, in placeholder order: pet_id, [occurred_at cutoff], limit.
export function recentMedicationsQuery(hasWindow: boolean): string {
  const windowClause = hasWindow ? 'AND e.occurred_at >= ?' : '';
  return `SELECT mi.id, mi.generic_name, mi.brand_name, mi.strength, mi.form, mi.default_route
   FROM medication_administrations ma
   JOIN events e ON e.id = ma.event_id
   JOIN medication_items_cache mi ON mi.id = ma.medication_item_id
   WHERE ma.pet_id = ?
     AND e.deleted_at IS NULL
     ${windowClause}
   GROUP BY mi.id
   ORDER BY MAX(e.occurred_at) DESC
   LIMIT ?`;
}
