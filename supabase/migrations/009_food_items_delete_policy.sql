-- ============================================================
-- food_items — DELETE RLS policy
-- Bug fix surfaced during QA of the food detail screen (PR #20).
-- ============================================================
-- The original 001_schema.sql created SELECT / INSERT / UPDATE
-- policies on food_items but no DELETE policy. Supabase-js
-- returns success with 0 rows affected when RLS silently blocks
-- a DELETE, so the food detail screen's "Delete this food"
-- action appeared to succeed but actually left the row in place.
-- refreshFoodCache() then re-inserted it into the local cache
-- on next focus, making the food keep coming back.
--
-- Single-user MVP — only the row's creator can delete it.
-- Multi-user moderation rules (e.g. block delete when other
-- users have meals referencing this food) are deferred post-MVP.
-- ============================================================

CREATE POLICY "food_items_delete" ON food_items
  FOR DELETE USING (auth.uid() = created_by_user_id);
