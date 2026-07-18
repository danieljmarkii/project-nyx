-- ============================================================
-- nyx-food-photos Storage: owner-scope the INSERT policy (B-354 PR "B-358")
-- See: docs/nyx-per-account-food-library-requirements.md §4 FR-4,
--      backlog.md B-358 (PM-ratified Option A — reorder the client 2026-07-16).
-- ============================================================
-- Migration 033 (B-354 PR 1) scoped the nyx-food-photos SELECT to the owner of
-- the food named by the path's first segment, but deliberately LEFT the INSERT
-- authenticated + bucket-scoped only. The reason was ordering: the client
-- uploaded a food's photos to `{foodId}/…` BEFORE it inserted the owner-locked
-- `food_items` row, so an ownership-subquery INSERT policy would have 42501'd
-- EVERY upload, not just cross-tenant ones.
--
-- app/food-capture.tsx (runUploadAndExtract) has now been reordered to
-- insert-then-upload (B-358), so the owner row exists before its photos land and
-- the subquery can resolve. This migration tightens the INSERT to mirror the
-- shipped SELECT: a user may only write an object whose path's first segment is
-- a `food_items.id` they own.
--
-- Path convention (lib/storage.ts / app/food-capture.tsx): `{foodItemId}/{slot}.jpg`,
-- so the first path segment is a food_items.id. We compare as text (id::text) so a
-- malformed first segment simply fails to match rather than raising a uuid cast
-- error. Edge Functions (service role) bypass RLS and are unaffected.
--
-- Migration Safety Pre-flight:
--   Destructive: n — swaps one Storage RLS policy for a tighter one; touches no data.
--   Rollback: restore the prior permissive INSERT (the 033 form):
--     DROP POLICY IF EXISTS "nyx-food-photos: owner insert" ON storage.objects;
--     CREATE POLICY "nyx-food-photos: authenticated insert" ON storage.objects
--       FOR INSERT TO authenticated WITH CHECK (bucket_id = 'nyx-food-photos');
--   Backfill: N/A — no data change; existing objects are unaffected.

DROP POLICY IF EXISTS "nyx-food-photos: authenticated insert" ON storage.objects;
DROP POLICY IF EXISTS "nyx-food-photos: owner insert"         ON storage.objects;

-- INSERT: a user may upload a food photo ONLY into a prefix named by a food_items
-- row they own. Mirror of the "nyx-food-photos: owner select" policy (033).
CREATE POLICY "nyx-food-photos: owner insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'nyx-food-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM food_items WHERE created_by_user_id = auth.uid()
    )
  );
