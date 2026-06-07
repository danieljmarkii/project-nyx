-- ============================================================
-- meals.updated_at — true last-write-wins basis for cross-device meal edits
-- See: docs/backlog.md B-055
--      docs/multi-device-sync-requirements.md §5.2 (FR-4/FR-5/FR-6), §12 Phase 2
-- ============================================================
-- B-054 Phase 1 assumed (FR-6) that meals are "effectively immutable once
-- written" and hydrated them insert-if-absent. That premise is FALSE in the
-- codebase: updateMealFood and updateMealIntake mutate a meal row in place, and
-- intake_rating is the clinically load-bearing WSAVA field (intake decline →
-- hepatic-lipidosis routing — the intake-is-not-preference invariant). Phase 1
-- shipped a safe stopgap ('refresh-if-synced': use the synced flag as a proxy
-- timestamp), but with NO updated_at, two *simultaneous offline* edits to the
-- same meal on two devices resolved by server-arrival order with zero authorship
-- signal — strictly worse than events, which at least compare updated_at.
--
-- This migration gives meals the same updated_at + set_updated_at trigger that
-- events / vet_visits already have, so hydration can use real updated_at LWW
-- (the FR-5 server-time basis the PM chose for v1: events stay on server-time
-- LWW, meals join them). The deterministic detection engine and vet report read
-- the durable Supabase record, so this only sharpens cross-device reconciliation;
-- it changes no clinical logic.
--
-- Migration Safety Pre-flight:
--   Destructive:  n  (purely additive — one nullable-then-NOT-NULL column + one
--                     trigger; no existing column dropped, renamed, or retyped)
--   Rollback:     DROP TRIGGER trg_meals_updated_at ON meals;
--                 ALTER TABLE meals DROP COLUMN updated_at;
--   Backfill:     updated_at := created_at for existing rows. A pre-migration
--                 meal has never been cross-device-reconciled, so its creation
--                 time is the honest last-change time. Done in-migration (below)
--                 so there are no NULLs to special-case in the reconcile.
--   Affected table: meals. Row-count sanity check before applying:
--                 SELECT count(*) FROM meals;            -- rows to backfill
--                 SELECT count(*) FROM meals WHERE updated_at IS NULL; -- expect 0 after
-- ============================================================

-- 1. Add the column (nullable first so the backfill can populate existing rows).
ALTER TABLE meals ADD COLUMN updated_at TIMESTAMPTZ;

-- 2. Backfill from created_at so every existing row carries a usable LWW timestamp.
UPDATE meals SET updated_at = created_at WHERE updated_at IS NULL;

-- 3. Lock it down to match events / vet_visits (default NOW(), NOT NULL).
ALTER TABLE meals ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE meals ALTER COLUMN updated_at SET NOT NULL;

-- 4. Stamp updated_at = NOW() on every server write, identical to the other
--    mutable tables (set_updated_at() defined in 001_schema.sql). This is what
--    makes LWW server-time-authoritative: an INSERT ... ON CONFLICT DO UPDATE
--    upsert from the client fires this on the update branch, so the last push to
--    reach the server wins — the documented, bounded FR-5 resolution.
CREATE TRIGGER trg_meals_updated_at
  BEFORE UPDATE ON meals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
