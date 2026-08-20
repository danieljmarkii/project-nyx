// I/O-free leaf module holding shared weight SQL, so a query can be imported by both
// lib/weight.ts (the write-side owner, which imports lib/sync.ts for the push) and
// lib/sync.ts (the snapshot-reconcile path) WITHOUT the weight → sync import cycle that
// would otherwise force the SQL to be duplicated. Mirrors lib/foodQueries.ts /
// lib/eventAttachmentQueries.ts / lib/medicationQueries.ts (CUL-293, code-review).

// A pet's LATEST weight reading (kg): newest by the parent event's occurred_at — a
// back-dated entry sorts to its true place, never where it was typed — and soft-delete
// filtered, since deletedness lives on the parent event (weight_checks has no own
// deleted_at). One bound param: the pet id. Returns a single { weight_kg } row or none.
export const LATEST_WEIGHT_KG_QUERY =
  `SELECT wc.weight_kg AS weight_kg
     FROM weight_checks wc
     JOIN events e ON e.id = wc.event_id
    WHERE wc.pet_id = ? AND e.deleted_at IS NULL
    ORDER BY e.occurred_at DESC
    LIMIT 1`;
