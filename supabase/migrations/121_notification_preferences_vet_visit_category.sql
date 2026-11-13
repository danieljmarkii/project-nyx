-- ============================================================
-- Migration 121: notification_preferences accepts the 'vet_visit' category
--   (CUL-2726, PR-02 of the Vet visit reminders project, parent CUL-253)
-- See: docs/nyx-vet-reminder-requirements.md §6 (this change), §3.5 (the
--      scheduler that reads it, PR-03);
--      050_notification_preferences.sql (the table, and the rule that a new
--      category is an explicit additive migration, never a silent widening).
-- ============================================================
--
-- WHAT THIS ADDS
-- ------------------------------------------------------------
-- One value in one CHECK. 050 declared `category` as a CHECK enum holding only
-- 'daily_summary'; the vet visit reminder keeps its switch in this table
-- (account-wide row, pet_id NULL, category 'vet_visit'), so the CHECK must
-- admit it. No table, column, index, policy, grant or trigger changes.
--
-- No backfill: the absence of a row means OFF (G6, every category defaults
-- off), so no existing account is opted in by this file.
--
-- The constraint is dropped and re-added under the SAME name, so a later
-- widening (CUL-1598, the follow-up switch moving into this table) finds it
-- where 050 left it. Read live 2026-11-13: the one check constraint on the
-- table is notification_preferences_category_check, CHECK (category =
-- 'daily_summary'). Nothing else (no trigger, policy or later migration)
-- reads `category`.
--
-- THE LOCAL MIRROR needs nothing: lib/notificationPreferences.ts declares
-- `category TEXT NOT NULL` with no CHECK, so the device already stores any
-- value the server accepts.
--
-- LOCK: ADD CONSTRAINT validates every row under an ACCESS EXCLUSIVE lock.
-- The table held one row at the read above, so the scan is immediate.
--
-- ROLLBACK (destructive: n):
--   DELETE FROM notification_preferences WHERE category = 'vet_visit';
--   ALTER TABLE notification_preferences
--     DROP CONSTRAINT notification_preferences_category_check;
--   ALTER TABLE notification_preferences
--     ADD CONSTRAINT notification_preferences_category_check
--     CHECK (category IN ('daily_summary'));
-- ============================================================

ALTER TABLE notification_preferences
  DROP CONSTRAINT notification_preferences_category_check;

ALTER TABLE notification_preferences
  ADD CONSTRAINT notification_preferences_category_check
  CHECK (category IN ('daily_summary', 'vet_visit'));

COMMENT ON COLUMN notification_preferences.category IS
  'B-661 §4: the notification category. CHECK enum, not free TEXT. Permits ''daily_summary'' (050) and ''vet_visit'' (121, CUL-2726: the vet visit reminder switch, account-wide). Adding a category is an explicit additive migration, never a silent widening.';

-- ============================================================
-- VERIFY (run after apply)
-- ------------------------------------------------------------
-- 1. The CHECK holds both values, and only them:
--    SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'notification_preferences_category_check';
--    -- expect: CHECK ((category = ANY (ARRAY['daily_summary'::text, 'vet_visit'::text])))
-- 2. Existing rows are untouched:
--    SELECT category, count(*) FROM notification_preferences GROUP BY 1;
-- ============================================================
