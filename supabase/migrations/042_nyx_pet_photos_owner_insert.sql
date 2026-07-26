-- ============================================================
-- nyx-pet-photos: owner-scope the Storage policies + bind pets.photo_path (B-431)
-- See: backlog.md B-431. Same fix pattern as migration 036 (nyx-food-photos,
--      B-358) and migration 025 (nyx-event-attachments, B-244) — 025 is the
--      closest precedent and is followed deliberately, including its pairing of
--      a path CHECK with the bucket's policies in one migration.
-- ============================================================
-- The live policy set for this bucket was a SINGLE policy, verified against
-- pg_policies before writing this migration:
--
--   pet_photos_insert  FOR INSERT TO public  WITH CHECK (bucket_id = 'nyx-pet-photos')
--
-- B-431 is finding 1. Findings 2–4 were found while fixing it — 2 and 3 by
-- reading the write path, 4 by the mandatory `rls-privacy-reviewer` pass, which
-- returned FAIL on this migration's first draft (policy-only) and is the reason
-- the CHECK below rides in this PR rather than a filed follow-up.
--
-- ------------------------------------------------------------
-- FINDING 1 (B-431) — `TO public` includes `anon`.
-- ------------------------------------------------------------
-- `public` is not "the public bucket"; it is the Postgres role that `anon` and
-- `authenticated` both inherit. So the check reduced to "is this the right
-- bucket" for UNAUTHENTICATED callers too. The anon key is committed in
-- eas.json for all three build profiles and inlined into every client bundle
-- (it is meant to be — it is RLS-gated), so anyone with a copy of the app could
-- write arbitrary objects into nyx-pet-photos. And nyx-pet-photos is the one
-- bucket with `public = true`, meaning those objects get permanent
-- unauthenticated URLs on the project's own domain: storage-cost and
-- content-hosting abuse, not a read of anyone's pet data.
--
-- This is NOT the cross-tenant-read class of B-244/B-248 (private buckets with
-- bucket-wide SELECT). Reads here are public BY DESIGN — whether to KEEP that
-- posture is the hardening audit's §A3 question, still OPEN and a PM call, and
-- it is deliberately untouched here.
--
-- Worth recording because nobody had filed it: pre-fix, `anon` could also SQUAT
-- a key. Planting `{anyPetId}/profile.jpg` was permitted, and because no UPDATE
-- policy existed (finding 2) the real owner could never overwrite it — a
-- permanent squat on a public URL. Findings 1 and 2 close both halves.
--
-- ------------------------------------------------------------
-- FINDING 2 — no UPDATE policy, and the write path upserts.
-- ------------------------------------------------------------
-- The pet photo key is a FIXED name per pet — `{petId}/profile.jpg`
-- (app/(tabs)/profile.tsx:324) — and lib/storage.ts `uploadPhoto` uploads with
-- `upsert: true`. The first photo for a pet is an INSERT; every REPLACEMENT
-- overwrites the existing key, which needs UPDATE. With INSERT as the only
-- policy, changing a pet's photo fails. Migration 025 hit and documented this
-- exact seam for nyx-event-attachments ("UPDATE: covers the upsert-overwrite
-- path (uploadPhoto uses upsert:true)"); this bucket never got the same pass.
-- Adding an owner-scoped UPDATE where none existed is strictly enabling — it
-- cannot regress a grant that was never there.
--
-- The UPDATE policy's WITH CHECK half is load-bearing, not ceremony: storage-api
-- implements `move()` as an UPDATE of `objects.name`, so a USING-only UPDATE
-- grant would let an owner re-home one of their own objects into another owner's
-- `{petId}/` prefix — on a world-readable bucket. WITH CHECK forbids the
-- destination as well as the source.
--
-- ------------------------------------------------------------
-- FINDING 3 — no SELECT policy, on a bucket whose only write path upserts.
-- ------------------------------------------------------------
-- Postgres applies SELECT policies to a RETURNING clause, and storage-api's
-- upsert path both reads the existing object row and returns the written row.
-- Every bucket in this project that has working uploads has a SELECT policy for
-- `authenticated` (008/033 food, 021 medication, 025 event, 006 vet) —
-- nyx-pet-photos is the ONLY bucket with none, and it is also the only bucket
-- holding zero objects while carrying a standing "uploads fail with 42501 even
-- with correct policies" Open Question (CLAUDE.md). That open question blames
-- the SQL-created-bucket `owner = null` landmine, but every other bucket in this
-- project ALSO has `owner = null` and uploads to them work — so the missing
-- SELECT policy is the better-supported explanation, and the `owner` theory is
-- not actually the discriminator it was assumed to be.
--
-- This migration does not claim to close that open question — only a real
-- on-device upload can — but it removes the candidate cause that is free to
-- remove. On a `public = true` bucket an owner-scoped SELECT narrows nothing
-- (the `/object/public/...` route bypasses RLS entirely, so the whole internet
-- already reads these objects) and widens nothing beyond what the internet
-- already has. The first draft of this migration omitted SELECT on the grounds
-- that it buys no PRIVACY; correct as far as it went, and the wrong call —
-- the reason to add it is FUNCTIONAL.
--
-- ------------------------------------------------------------
-- FINDING 4 — pets.photo_path is unconstrained, and a service role trusts it.
-- ------------------------------------------------------------
-- `rls-privacy-reviewer`, High. The same confused-deputy class as B-244 finding 1
-- and B-354 FR-7, and the last unclosed member of it for this bucket family:
--
--   * `pets.photo_path` is plain TEXT with no constraint, and `pets_owner`
--     (`FOR ALL USING (auth.uid() = user_id)`, WITH CHECK null so USING is
--     reused) gates which ROW you may write — never the column CONTENTS.
--   * `delete-account` reads `pets.photo_path` for the caller's own pets
--     (index.ts:77) and purges each path from nyx-pet-photos with the SERVICE
--     ROLE, which bypasses RLS — so the policies above are never consulted.
--   * `collectStoragePaths` passes the pet list through `cleanPaths` ONLY
--     (plan.ts:214 — dedupe/blank-drop, no ownership scoping), while the food
--     and medication lists ARE re-scoped (`scopeFoodPaths`,
--     `scopeMedicationPaths`) for exactly this reason.
--
-- So: an attacker sets their OWN pet's `photo_path` to `{victimPetId}/profile.jpg`,
-- deletes their own account, and the service-role purge deletes the victim's
-- photo verbatim — one victim per owned pet, and multi-pet is free (B-086).
-- Destruction, not disclosure, and it costs the attacker their account; but the
-- comments asserting this bucket needs no guard (plan.ts:145-147,
-- index.ts:61-62) are wrong on their own terms: row ownership is pet-scoped, the
-- column VALUE is not.
--
-- It is dormant only because zero pet photos exist — and this migration is the
-- change that makes photos start existing. The CHECK is free NOW (0 rows to
-- audit, 0 violations, 1 writer, verified below) and expensive later, which is
-- why it rides here instead of being filed. `scopePetPhotoPaths` in plan.ts is
-- good defense-in-depth but is an Edge Function change, so it stays OUT of this
-- schema PR and is filed instead — the CHECK is the half that makes the crafted
-- path impossible by construction, so the deputy has nothing to be confused by.
--
-- ------------------------------------------------------------
-- Ordering — why the B-358 lesson does not bite here.
-- ------------------------------------------------------------
-- 036 could not owner-scope nyx-food-photos' INSERT until the client was
-- reordered, because food photos were uploaded to `{foodId}/…` BEFORE the
-- owner-locked food_items row existed, so an ownership subquery would have
-- 42501'd EVERY upload. Checked for that here, and this write path is already
-- in the safe order:
--   * There is exactly ONE pet-photo write path in the app —
--     app/(tabs)/profile.tsx `launchPhotoPicker` (the only `uploadPhoto` call
--     against this bucket; lib/sync.ts never touches it).
--   * It returns early unless `activePet` is set, and every pets row is created
--     by a DIRECT, awaited Supabase insert (app/onboarding/pet-name.tsx,
--     app/add-pet.tsx) — pets are never queued through the offline mirror — so
--     the row the subquery needs is already committed server-side.
--   * The same function's very next statement is
--     `pets.update({ photo_path }).eq('id', activePet.id)`, which would fail
--     anyway if the row did not exist. Upload-then-update is fine; only
--     upload-BEFORE-row-creation is the 036 trap.
-- No client change is needed and no client reorder precedes this migration.
--
-- Path convention: `{petId}/profile.jpg`, so the first path segment is a
-- pets.id. Compared as text (`id::text`) so a malformed first segment simply
-- fails to match instead of raising a uuid cast error inside a policy (a
-- `::uuid` formulation would turn a hostile key into a 500); exact set
-- membership via `IN`, never a prefix match, so one id can never be a string
-- prefix of another. A key with no '/' has an empty folder list, so
-- `(storage.foldername(name))[1]` is NULL and the write is rejected — all of
-- `profile.jpg`, `/profile.jpg`, `../{petId}/profile.jpg` and a trailing-space
-- near-miss of a real pet id were checked against the live DB and fail closed.
--
-- Migration Safety Pre-flight:
--   Destructive: n — swaps one Storage RLS policy for tighter ones, adds SELECT
--     and UPDATE policies where there were none, and adds one CHECK constraint.
--     Drops/renames/alters no column, and touches no row data; existing objects
--     are neither moved nor deleted (there are none).
--   Rollback: two independent parts.
--     (1) ALTER TABLE public.pets DROP CONSTRAINT IF EXISTS pets_photo_path_pet_prefix;
--     (2) DROP POLICY IF EXISTS "nyx-pet-photos: owner insert" ON storage.objects;
--         DROP POLICY IF EXISTS "nyx-pet-photos: owner update" ON storage.objects;
--         DROP POLICY IF EXISTS "nyx-pet-photos: owner select" ON storage.objects;
--         CREATE POLICY "pet_photos_insert" ON storage.objects
--           FOR INSERT TO public WITH CHECK (bucket_id = 'nyx-pet-photos');
--   Backfill: N/A — no data change.
--   Tables affected: storage.objects (RLS policies only) and public.pets (one
--     CHECK constraint, no column change). Row-count checks the PM can run
--     BEFORE applying — both verified 0 live at authoring time:
--       select count(*) from storage.objects where bucket_id = 'nyx-pet-photos';
--       select count(*) from public.pets
--         where photo_path is not null
--           and not starts_with(photo_path, id::text || '/');
--     The first is expected 0; any row whose first path segment is not a live
--     pets.id would keep its public read URL but could no longer be overwritten
--     by a client, which is the intended outcome for a planted object. The
--     second MUST be 0 or the ADD CONSTRAINT fails — it is the whole
--     no-backfill claim. `app/(tabs)/profile.tsx:334` is the only writer of
--     `photo_path` and already writes `${activePet.id}/profile.jpg`.
-- ============================================================

-- ── FINDING 4 — bind photo_path to the owning pet's own prefix ───────────────
-- Idempotent add: ADD CONSTRAINT has no IF NOT EXISTS, so guard on pg_constraint
-- (same shape as 025). NULL stays legal — a pet with no photo is the norm. If a
-- "remove photo" action is ever built it MUST write NULL, not '' (an empty
-- string would fail this CHECK, which is the honest outcome: '' is not a path).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pets_photo_path_pet_prefix'
      AND conrelid = 'public.pets'::regclass
  ) THEN
    ALTER TABLE public.pets
      ADD CONSTRAINT pets_photo_path_pet_prefix
      CHECK (photo_path IS NULL OR starts_with(photo_path, id::text || '/'));
  END IF;
END $$;

-- ── FINDINGS 1-3 — owner-scope the bucket ────────────────────────────────────
-- Drop the permissive `TO public` policy (live name) and make the new set
-- idempotent so this migration is safe to re-run.
DROP POLICY IF EXISTS "pet_photos_insert"              ON storage.objects;
DROP POLICY IF EXISTS "nyx-pet-photos: owner insert"   ON storage.objects;
DROP POLICY IF EXISTS "nyx-pet-photos: owner update"   ON storage.objects;
DROP POLICY IF EXISTS "nyx-pet-photos: owner select"   ON storage.objects;

-- INSERT: an AUTHENTICATED user may upload a pet photo ONLY under a `{pet_id}/`
-- prefix naming a pet they own. Mirrors the nyx-event-attachments owner insert
-- (025), which keys on the same pets subquery for the same reason: the first
-- path segment is a PET id, so ownership is "that pet belongs to auth.uid()".
-- The subquery filters `user_id = auth.uid()` itself, so this policy does not
-- depend on the `pets` table's own RLS staying correct.
CREATE POLICY "nyx-pet-photos: owner insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'nyx-pet-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.pets WHERE user_id = auth.uid()
    )
  );

-- UPDATE: covers the upsert-overwrite of `{petId}/profile.jpg` when an owner
-- replaces their pet's photo. USING gates which objects may change; WITH CHECK
-- blocks re-homing an object (storage-api's `move()`) under a pet the user does
-- not own — see finding 2.
CREATE POLICY "nyx-pet-photos: owner update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'nyx-pet-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.pets WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'nyx-pet-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.pets WHERE user_id = auth.uid()
    )
  );

-- SELECT: required by the upsert write path (finding 3), NOT a privacy control —
-- the bucket is `public = true`, so the public read route bypasses RLS and this
-- policy neither narrows nor widens who can read a pet photo. Scoped to the
-- owner anyway, so that if the §A3 decision ever flips the bucket to private,
-- this is already the policy we would want rather than a bucket-wide grant to
-- be re-tightened later.
CREATE POLICY "nyx-pet-photos: owner select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'nyx-pet-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.pets WHERE user_id = auth.uid()
    )
  );

-- Deliberately NOT added: DELETE. No client path deletes a pet photo — the only
-- remove() calls are app/event/[id].tsx (event attachments) and delete-account's
-- service-role purge, and no code path hard-deletes a `pets` row (archive sets
-- is_active = false and keeps photo_path, so an archived pet's photo is still
-- reachable by the purge). Granting an unused verb is not hardening. Two real
-- consequences of that, filed rather than fixed here because both are product
-- decisions on a public bucket, not policy bugs: an owner cannot UNPUBLISH a
-- photo (only overwrite it), and if the best-effort purge ever fails the orphan
-- stays world-readable with no row left to find it by.
