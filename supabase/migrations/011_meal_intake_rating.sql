-- ============================================================
-- meals.intake_rating — WSAVA 5-point owner-reported intake
-- See: docs/backlog.md B-014
--      docs/research/2026-05-feeding-windows-and-partial-eating.md
-- ============================================================
-- Today the meal log conflates *offered* with *consumed*. This
-- column captures owner-reported intake on the validated WSAVA
-- Diet History Form 5-point ordinal scale (per Dr. Chen) so the
-- correlation engine, diet-trial compliance, and AI Signal can
-- distinguish "she ate it" from "she licked it and walked away".
--
-- Scale (do not invent a custom emoji scale — WSAVA is the
-- validated clinical instrument):
--   refused  — did not touch the food
--   picked   — sniffed / a few bites, walked away
--   some     — ate a portion, left material
--   most     — ate most, left a small amount
--   all      — finished
--
-- Nullable. NULL = unrated (legacy rows, rows where the owner
-- skipped, or rows where the food is not classified as a meal
-- per food_items.food_type). The inline capture surface on
-- app/log.tsx is gated on food_items.food_type = 'meal' — treats
-- and 'other' do not get an intake prompt. See B-014 for the
-- locked v1 capture surfaces.
--
-- Migration Safety Pre-flight:
--   Destructive:  n  (additive nullable column, additive enum)
--   Rollback:     ALTER TABLE meals DROP COLUMN intake_rating;
--                 DROP TYPE intake_rating;
--   Backfill:     N/A — existing rows remain NULL. Legacy meals
--                 stay unrated; owners can rate retroactively
--                 via the event detail screen.
-- ============================================================

CREATE TYPE intake_rating AS ENUM (
  'refused',
  'picked',
  'some',
  'most',
  'all'
);

ALTER TABLE meals
  ADD COLUMN intake_rating intake_rating;

CREATE INDEX idx_meals_intake_rating ON meals(intake_rating)
  WHERE intake_rating IS NOT NULL;
