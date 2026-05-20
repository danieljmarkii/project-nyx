-- ============================================================
-- food_items.food_type — usage classification (meal vs treat)
-- See: docs/backlog.md B-011
-- ============================================================
-- Adds a usage-role classification distinct from the existing
-- `format` column (which is physical form: dry_kibble / wet_canned /
-- treat / topper / ...). A freeze_dried product can be either a meal
-- replacement or a training snack; format alone cannot tell us which.
--
-- Hard prerequisite for B-014 (WSAVA intake chip): the inline intake
-- prompt on app/log.tsx renders only when food_type = 'meal' — treats
-- do not get an intake prompt.
--
-- Migration Safety Pre-flight:
--   Destructive:  n  (additive nullable column)
--   Rollback:     ALTER TABLE food_items DROP COLUMN food_type;
--                 DROP TYPE food_type_kind;
--   Backfill:     N/A — existing rows remain NULL. Per PM call
--                 2026-05-20, users manually classify legacy rows via
--                 the food detail screen. No Claude backfill.
-- ============================================================

CREATE TYPE food_type_kind AS ENUM (
  'meal',
  'treat',
  'other'
);

ALTER TABLE food_items
  ADD COLUMN food_type food_type_kind;
  -- Nullable. NULL = unclassified (legacy rows, or user skipped).
  -- B-014 gates inline intake chip on food_type = 'meal' specifically;
  -- NULL and 'other' both opt out of the intake prompt.

CREATE INDEX idx_food_items_food_type ON food_items(food_type)
  WHERE food_type IS NOT NULL;
