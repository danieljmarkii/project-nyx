-- ============================================================
-- Food Library Redesign — Step 2: nyx-food-photos RLS Policies
-- See: docs/food-library-redesign-requirements.md §5.2
-- ============================================================
-- Applies RLS policies to the nyx-food-photos Storage bucket.
-- The bucket MUST be created via the Supabase dashboard UI before
-- running this migration — SQL-created buckets have owner=null and
-- policies will silently fail (see CLAUDE.md anti-pattern).
--
-- Migration 006 included a prior draft of these policies written
-- before the bucket existed. This migration supersedes those entries
-- with DROP IF EXISTS guards so it is safe to run in either state.
--
-- Decided policy set (requirements §5.2, MVP):
--   - Authenticated users: INSERT (upload)
--   - Authenticated users: SELECT (read)
--   - No UPDATE or DELETE for non-creators at MVP
-- ============================================================

-- Drop prior entries from 006 if they exist, then recreate cleanly.
DROP POLICY IF EXISTS "Authenticated users can upload food photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read food photos"   ON storage.objects;

-- INSERT: any authenticated user may upload to the food-photos bucket.
-- Path-level ownership (e.g. food_item_id in the path) is enforced at
-- the app layer; the bucket-level policy is intentionally permissive
-- because food_items are globally scoped (no user_id per schema decision D1).
CREATE POLICY "nyx-food-photos: authenticated insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'nyx-food-photos');

-- SELECT: any authenticated user may read food photos.
-- Required for the picker UI and the Edge Function (which reads via
-- service role key anyway, but this keeps user-facing reads open).
CREATE POLICY "nyx-food-photos: authenticated select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'nyx-food-photos');

-- UPDATE and DELETE: explicitly omitted at MVP.
-- Rationale: food_items are globally shared; allowing arbitrary deletes
-- would let one user corrupt another's library entries.
-- Post-MVP: revisit when per-user overrides (food_item_overrides) ship —
-- at that point creators should be able to manage their own uploads.
