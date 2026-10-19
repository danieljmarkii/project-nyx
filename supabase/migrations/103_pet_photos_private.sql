-- ============================================================
-- nyx-pet-photos goes private (CUL-594, ruled private with signed links
-- 2026-10-12 via CUL-1825)
-- ============================================================
-- `nyx-pet-photos` is the last bucket in this project with `public = true`
-- (verified live 2026-10-18; the other six are private). A public bucket is
-- served by Storage's `/object/public/{bucket}/{key}` route, which never
-- consults RLS: anyone holding a key reads the object, forever, with no login.
-- That is why an owner cannot unpublish a pet photo (CUL-437): replacing or
-- deleting the row does not make the old URL stop working. This migration
-- closes that route for this bucket. It is the hardening audit's last open
-- line (docs/app-store-hardening-audit-2026-07.md, ①).
--
-- ── What changes ─────────────────────────────────────────────────────────────
-- ONE config column on ONE existing bucket row. No policy is created, dropped
-- or altered, because the policies already are the owner-only rule. 042 (B-431)
-- wrote them, verified live before this file was written:
--
--   "nyx-pet-photos: owner insert"  FOR INSERT TO authenticated
--   "nyx-pet-photos: owner select"  FOR SELECT TO authenticated
--   "nyx-pet-photos: owner update"  FOR UPDATE TO authenticated
--
-- each admitting a row only when its first path segment is the id of a pet
-- whose `user_id = auth.uid()`. Who that admits, once the bucket is private:
--   * the owner: reads (and so can sign links), uploads, overwrites, under
--     their own pets' prefixes only;
--   * another account: nothing, on any verb;
--   * anonymous (the anon key, which ships in every client bundle): nothing.
--     There is no anon or `public`-role policy, and the public route stops
--     serving the bucket;
--   * the service role (the delete-account purge): bypasses RLS, unchanged.
-- No DELETE policy is added. Nothing in the app deletes a pet photo object
-- (the purge runs as the service role), and a grant nothing uses is latent
-- permission, not hardening (042/043/046).
--
-- ── Why this cannot break a pet photo on a current build ─────────────────────
-- PR-34 (CUL-1856, #1249) moved every pet photo read to signed links and
-- deleted `getPublicUrl`; `guards/petPhotoSignedOnly.test.ts` keeps it deleted.
-- `createSignedUrl(s)` runs as the signed-in owner and is authorised by the
-- owner SELECT policy above, which this file asserts before it changes
-- anything. The `/object/sign/…` link it returns is verified by its token, not
-- by the bucket's `public` flag, so a link minted before this applies keeps
-- loading after it. What DOES break is any build older than PR-34: it reads
-- `/object/public/…` and its pet discs fall back to the initial. That is the
-- ordering rule: apply only once PR-34's build is on the PM's phone.
--
-- ── What this does NOT do, stated so nobody mistakes it for closed ───────────
--   * A signed link is a bearer link for its lifetime (PET_PHOTO_LINK_TTL_SEC,
--     one hour, lib/storage.ts). Whoever holds a pasted link reads that photo
--     until it expires. That is the ruled design, not a hole this file opens.
--   * A leftover object is NOT purged; it only stops being world-readable. One
--     left by a replaced photo sits under a prefix its owner still holds, so
--     only that owner can read it. One left by a pet whose row is gone has no
--     pet row naming its prefix, so no account's SELECT admits it and only the
--     service role can read it. CUL-437's orphan becomes private; it does not
--     disappear.
--   * Bucket config is not replayed by any test against a database; the
--     precondition below and the read-back are what prove it on apply.
--
-- ── Migration Safety Pre-flight ──────────────────────────────────────────────
--   Destructive: n. One boolean on one `storage.buckets` row. No column, no
--     object, no policy changes; every object keeps its key.
--   Backfill: N/A. Paths are unchanged (1 object, 1 pet with a photo, 0 objects
--     under a prefix with no pet, read live 2026-10-18).
--   Pre-apply check:
--     select public,
--            (select count(*) from storage.objects where bucket_id = 'nyx-pet-photos')
--       from storage.buckets where id = 'nyx-pet-photos';
--     -- expect: true, and a small count
--   Rollback: at the foot of this file. Instant, touches no object.
--
-- This is an UPDATE of an existing, dashboard-created bucket, so the
-- SQL-created-bucket `owner = null` landmine (008/021) does not apply: that is
-- an INSERT hazard.
-- ============================================================

-- 1. Precondition. Going private with no owner SELECT would turn every signed
--    link into a 400 and blank every pet disc, so the migration refuses to land
--    unless the bucket exists and all three owner policies do. The check reads
--    pg_policies (the catalog, not any tenant's rows), and the messages name
--    only constants.
DO $$
DECLARE
  missing text[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'nyx-pet-photos') THEN
    RAISE EXCEPTION '103: bucket nyx-pet-photos does not exist';
  END IF;

  SELECT array_agg(want.name ORDER BY want.name)
    INTO missing
    FROM (VALUES
      ('nyx-pet-photos: owner insert', 'INSERT'),
      ('nyx-pet-photos: owner select', 'SELECT'),
      ('nyx-pet-photos: owner update', 'UPDATE')
    ) AS want(name, cmd)
   WHERE NOT EXISTS (
     SELECT 1
       FROM pg_policies p
      WHERE p.schemaname = 'storage'
        AND p.tablename  = 'objects'
        AND p.policyname = want.name
        AND p.cmd        = want.cmd
        AND p.roles      = ARRAY['authenticated']::name[]
        AND coalesce(p.qual, p.with_check) LIKE '%auth.uid()%'
   );

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION '103: owner policies missing or changed on nyx-pet-photos: %', missing;
  END IF;
END $$;

-- 2. The change.
UPDATE storage.buckets
   SET public = false
 WHERE id = 'nyx-pet-photos';

-- 3. Read back. A silent no-op (a renamed bucket, an UPDATE our role is not
--    permitted) must fail the apply, not report success.
DO $$
BEGIN
  IF (SELECT public FROM storage.buckets WHERE id = 'nyx-pet-photos') IS DISTINCT FROM false THEN
    RAISE EXCEPTION '103: nyx-pet-photos is still public after the update';
  END IF;
END $$;


-- ============================================================
-- ROLLBACK (for reference; do not run inline).
--
--   UPDATE storage.buckets SET public = true WHERE id = 'nyx-pet-photos';
--
-- Re-opens CUL-594: every pet photo is world-readable again by key, and links
-- signed in the meantime keep working either way.
-- ============================================================
