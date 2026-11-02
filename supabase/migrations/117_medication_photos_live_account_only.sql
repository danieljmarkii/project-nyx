-- ============================================================
-- CUL-2327 / CUL-2397 (117): a deleted account can no longer write a label photo
-- ============================================================
--
-- THE HOLE. 021 keyed every nyx-medication-photos policy on the path alone:
-- (storage.foldername(name))[1] = auth.uid()::text, with no table lookup.
-- auth.admin.deleteUser does not revoke an access token already issued (it
-- stays valid until its exp, 1 h by default), and storage.objects.owner has no
-- foreign key to auth.users (measured in production 2026-11-02: the only FK on
-- storage.objects is bucket_id). So a second phone, or a label capture queued
-- at the moment of deletion, could still write {uid}/… after delete-account's
-- post-delete sweep had listed that folder and returned ok: true. The file then
-- outlived its account with nothing recording it.
--
-- THE CLASS (closed here; guards/storageWritePolicies.test.ts keeps it closed).
-- Every other bucket's INSERT and UPDATE policies key on a row the deletion
-- cascade removes: the pet buckets (event / vet attachments, vet documents, pet
-- photos) join pets (user_id ON DELETE CASCADE), and nyx-food-photos joins
-- food_items (created_by_user_id ON DELETE CASCADE). This was the one bucket
-- whose writes keyed on the uid alone.
--
-- THE FIX. The two write policies also require the caller's user_profiles row.
-- user_profiles.id references auth.users ON DELETE CASCADE, the
-- on_auth_user_created trigger mints it for every account (0 of 9 accounts
-- lacked one, measured), and its own policy lets a caller see only its own row,
-- so the EXISTS reads exactly "this token's account still exists". A stale
-- token cannot mint the row again: the FK refuses an id auth.users no longer
-- holds. Why not EXISTS on auth.users itself: authenticated has no SELECT on
-- auth.users (measured), so that check would refuse every live account's
-- upload too.
--
-- SELECT and DELETE stay as 021 left them: a stale token may still read or
-- remove its own leftovers, which only helps the sweep. UPDATE gets the check
-- in USING and in WITH CHECK, so an upsert overwrite is refused as well.
--
-- What this does NOT cover: a write that commits before deleteUser commits.
-- That file exists when the post-delete sweep lists the folder, so the sweep
-- removes it (CUL-2314). The orphan sweep (CUL-231) stays the backstop for any
-- path the policies cannot see.
--
-- Migration Safety Pre-flight:
--   Rollback plan — re-create 021's two policies (the ROLLBACK block below).
--   Destructive y/n — n. Two storage.objects policies replaced; no data touched.
--   Backfill — N/A. Measured 2026-11-02: 3 objects in the bucket, 0 under a
--     folder whose account is gone.
-- ============================================================

DROP POLICY IF EXISTS "nyx-medication-photos: owner insert" ON storage.objects;
DROP POLICY IF EXISTS "nyx-medication-photos: owner update" ON storage.objects;

CREATE POLICY "nyx-medication-photos: owner insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'nyx-medication-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid())
  );

CREATE POLICY "nyx-medication-photos: owner update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'nyx-medication-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid())
  )
  WITH CHECK (
    bucket_id = 'nyx-medication-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid())
  );

-- ------------------------------------------------------------
-- VERIFY (run after applying; read only)
-- ------------------------------------------------------------
-- 1. Both write policies carry the account check (expect 2 rows, each true):
--   SELECT policyname, cmd,
--          coalesce(with_check, '') LIKE '%user_profiles%' AS check_ok,
--          cmd = 'INSERT' OR coalesce(qual, '') LIKE '%user_profiles%' AS using_ok
--   FROM pg_policies
--   WHERE schemaname = 'storage' AND tablename = 'objects'
--     AND policyname IN ('nyx-medication-photos: owner insert',
--                        'nyx-medication-photos: owner update');
--
-- 2. No write policy on storage.objects keys on the uid alone (expect 0 rows):
--   SELECT policyname, cmd FROM pg_policies
--   WHERE schemaname = 'storage' AND tablename = 'objects'
--     AND cmd IN ('INSERT', 'UPDATE', 'ALL')
--     AND coalesce(with_check, '') || coalesce(qual, '')
--         !~ '(FROM pets|FROM food_items|FROM public\.user_profiles)';
--
-- 3. Every account still has the row the check reads (expect 0):
--   SELECT count(*) FROM auth.users u
--   WHERE NOT EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = u.id);
--
-- 4. No label photo already sits under a deleted account (expect 0):
--   SELECT count(*) FROM storage.objects o
--   WHERE o.bucket_id = 'nyx-medication-photos'
--     AND NOT EXISTS (SELECT 1 FROM auth.users u
--                     WHERE u.id::text = (storage.foldername(o.name))[1]);
--
-- 5. Then get_advisors (security + performance).
--
-- ------------------------------------------------------------
-- ROLLBACK (021's two policies, verbatim)
-- ------------------------------------------------------------
--   DROP POLICY IF EXISTS "nyx-medication-photos: owner insert" ON storage.objects;
--   DROP POLICY IF EXISTS "nyx-medication-photos: owner update" ON storage.objects;
--   CREATE POLICY "nyx-medication-photos: owner insert" ON storage.objects
--     FOR INSERT TO authenticated
--     WITH CHECK (bucket_id = 'nyx-medication-photos'
--                 AND (storage.foldername(name))[1] = auth.uid()::text);
--   CREATE POLICY "nyx-medication-photos: owner update" ON storage.objects
--     FOR UPDATE TO authenticated
--     USING (bucket_id = 'nyx-medication-photos'
--            AND (storage.foldername(name))[1] = auth.uid()::text)
--     WITH CHECK (bucket_id = 'nyx-medication-photos'
--                 AND (storage.foldername(name))[1] = auth.uid()::text);
