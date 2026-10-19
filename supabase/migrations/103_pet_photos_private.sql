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
-- owner SELECT policy above, whose exact text this file asserts before it
-- changes anything. The `/object/sign/…` link it returns is verified by its token, not
-- by the bucket's `public` flag, so a link minted before this applies keeps
-- loading after it. What DOES break is any build older than PR-34: it reads
-- `/object/public/…` and its pet discs fall back to the initial. That is the
-- ordering rule: apply only once PR-34's build is on the PM's phone.
--
-- ── What this does NOT do, stated so nobody mistakes it for closed ───────────
--   * A signed link is a bearer link for its lifetime (PET_PHOTO_LINK_TTL_SEC,
--     one hour, lib/storage.ts). Whoever holds a pasted link reads that photo
--     until it expires. That is the ruled design, not a hole this file opens.
--   * A leftover object is NOT purged; it only stops being world-readable. A
--     replaced photo leaves none (the key is fixed, `{petId}/profile.jpg`, and
--     overwritten in place). An object under a pet whose row is gone is NOT
--     sealed, and an earlier draft of this header said it was: `pets_owner`
--     (001) lets any account INSERT a pet with a client-chosen `id`, or rename
--     a childless pet's `id`, so an account that knows the dead pet's UUID
--     (it is plain text in any pasted signed link) can claim the prefix and
--     read the object. Not live (0 such objects, read 2026-10-18), not a
--     regression (today that object is world-readable), and filed rather than
--     fixed here, because the fix is a `pets` schema change. CUL-437's orphan
--     gets narrower; it does not disappear.
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

-- 1. Precondition. The flag is only as private as the policies behind it, so
--    the migration refuses to land unless the policy set reaching this bucket
--    is EXACTLY 042's owner-only rule. A check that three names exist is not
--    that: rls-privacy-reviewer applied this file's first draft over eight
--    loosened sets (a fourth anon SELECT, a `FOR ALL USING (true)`, an owner
--    select reduced to `auth.uid() IS NOT NULL`, an UPDATE WITH CHECK reduced to
--    the bucket) and every one went private over a hole. So it checks:
--      a. the bucket exists;
--      b. each of the three policies is PERMISSIVE, `TO authenticated`, on the
--         right command, and every clause it has is, word for word, 042's
--         owner predicate (the text read live 2026-10-18, whitespace folded),
--         with UPDATE carrying it on BOTH sides (USING gates the source of a
--         move, WITH CHECK the destination);
--      c. no OTHER permissive policy on storage.objects names this bucket, or
--         names no bucket at all (a clause with no `bucket_id` predicate
--         applies to every bucket, B-248's shape).
--    A Postgres that deparses the predicate differently fails (b) and changes
--    nothing: it fails closed, and the message says which policy to read. The
--    check reads pg_policies (the catalog, not any tenant's rows), and the
--    messages name only policy names.
DO $$
DECLARE
  owner_rule constant text :=
    '((bucket_id = ''nyx-pet-photos''::text) AND ((storage.foldername(name))[1] IN ( SELECT (pets.id)::text AS id FROM pets WHERE (pets.user_id = auth.uid()))))';
  wrong text[];
  stray text[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'nyx-pet-photos') THEN
    RAISE EXCEPTION '103: bucket nyx-pet-photos does not exist';
  END IF;

  SELECT array_agg(want.name ORDER BY want.name)
    INTO wrong
    FROM (VALUES
      ('nyx-pet-photos: owner insert', 'INSERT', false, true),
      ('nyx-pet-photos: owner select', 'SELECT', true,  false),
      ('nyx-pet-photos: owner update', 'UPDATE', true,  true)
    ) AS want(name, cmd, has_using, has_check)
   WHERE NOT EXISTS (
     SELECT 1
       FROM pg_policies p
      WHERE p.schemaname = 'storage'
        AND p.tablename  = 'objects'
        AND p.policyname = want.name
        AND p.cmd        = want.cmd
        AND p.permissive = 'PERMISSIVE'
        AND p.roles      = ARRAY['authenticated']::name[]
        AND (CASE WHEN want.has_using
                  THEN regexp_replace(p.qual, '\s+', ' ', 'g') = owner_rule
                  ELSE p.qual IS NULL END)
        AND (CASE WHEN want.has_check
                  THEN regexp_replace(p.with_check, '\s+', ' ', 'g') = owner_rule
                  ELSE p.with_check IS NULL END)
   );

  IF wrong IS NOT NULL THEN
    RAISE EXCEPTION '103: owner policies missing or changed on nyx-pet-photos: %', wrong;
  END IF;

  SELECT array_agg(p.policyname ORDER BY p.policyname)
    INTO stray
    FROM pg_policies p
   WHERE p.schemaname = 'storage'
     AND p.tablename  = 'objects'
     AND p.permissive = 'PERMISSIVE'
     AND p.policyname NOT IN ('nyx-pet-photos: owner insert',
                              'nyx-pet-photos: owner select',
                              'nyx-pet-photos: owner update')
     AND (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '') LIKE '%nyx-pet-photos%'
          OR coalesce(p.qual, '') NOT LIKE '%bucket_id%' AND p.qual IS NOT NULL
          OR coalesce(p.with_check, '') NOT LIKE '%bucket_id%' AND p.with_check IS NOT NULL
          OR p.qual IS NULL AND p.with_check IS NULL);

  IF stray IS NOT NULL THEN
    RAISE EXCEPTION '103: other policies reach nyx-pet-photos or name no bucket: %', stray;
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
