-- ============================================================
-- Food Library Archive Flag (B-005, PR 1)
-- See: docs/backlog.md B-005 (plan ratified 2026-07-16, #365),
--      docs/nyx-per-account-food-library-requirements.md §6 (interplay notes).
-- ============================================================
-- B-005 replaces today's destructive "Remove from library" (hard-delete the food
-- + soft-delete every referencing meal — "kills all records") with a reversible
-- ARCHIVE: a single flag flip that hides the food from the picker/library while
-- leaving all meal / diet_trial / feeding_arrangement history untouched, so a
-- library re-tidy never degrades correlation, diet-trial, or vet-report data.
--
-- Per-account library (B-354, migration 033): food_items rows are now owned by
-- created_by_user_id (RLS default-deny to other accounts). So `archived_at` on an
-- account-scoped row IS per-user BY CONSTRUCTION — no archived_by_user_id column,
-- no join table, no per-user override layer. Ownership and archive are orthogonal
-- predicates (§6). This is exactly the simplification per-account bought us.
--
-- LOAD-BEARING INVARIANT (do not violate in any later PR):
--   `archived_at` is filtered ONLY at picker / library reads (the meal-log picker,
--   the FAB quick-log, the Foods-tab library list, the edit-event food picker).
--   It is NEVER applied to a history / analytics / vet-report join — a meal logged
--   before a food was archived must still render that food's name in the vet
--   report and still count toward every correlation. Archive tidies the *pantry*,
--   not the *record*.
--
-- refreshFoodCache (client) deliberately pulls archived rows too (they populate
-- the future "Archived" library section + Restore); the filter is applied on the
-- local cache at read time, never on the server pull.
--
-- ------------------------------------------------------------
-- Migration Safety Pre-flight
-- ------------------------------------------------------------
--   Destructive y/n:  n. A single additive, nullable column. No column/table/type
--                     is dropped or retyped; no row data is mutated.
--   Affected tables:  food_items (all rows gain a NULL archived_at = active).
--   Backfill:         N/A. Nullable with no default; every existing row stays
--                     NULL, i.e. active/feedable — the correct pre-archive state.
--   Rollback plan:    ALTER TABLE food_items DROP COLUMN archived_at;
--                     (reversible; no data to restore since the column is new.)
--
-- No index: archived_at is never a SERVER-side predicate. refreshFoodCache scopes
-- its pull by created_by_user_id only (and wants archived rows in the result); the
-- IS NULL filter runs on the on-device SQLite cache. generate-signal /
-- generate-report must NOT filter on it (the invariant above). Adding a server
-- index would advertise a query pattern the invariant forbids.
-- ============================================================

ALTER TABLE food_items ADD COLUMN archived_at TIMESTAMPTZ;

COMMENT ON COLUMN food_items.archived_at IS
  'B-005: when set, the food is archived — hidden from picker/library reads only, '
  'never from history/analytics/vet-report joins. Per-user by construction (the '
  'row is account-scoped, B-354). NULL = active/feedable.';
