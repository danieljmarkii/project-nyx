-- ============================================================
-- B-244 — Harden nyx-event-attachments access
-- Two PRE-EXISTING findings from the PR 7 rls-privacy-reviewer pass (#278),
-- neither exploitable today, both closed here BEFORE PR 6 opens the first
-- unauthenticated (public-link) path to report data.
-- ============================================================
--
-- Path convention (written centrally at every event-attachment call site —
-- app/log.tsx, app/event/[id].tsx, app/edit-event.tsx):
--   {pet_id}/{event_id}/{attachment_id}.jpg
-- The leading {pet_id} segment is the ownership boundary. Unlike
-- nyx-medication-photos ({user_id}/…, migration 021), the first segment here is a
-- PET id, so ownership is "that pet belongs to auth.uid()" — the exact subquery the
-- event_attachments TABLE policy (003) already uses.
--
-- ------------------------------------------------------------
-- FINDING 1 — storage_path is unbound to the pet (confused-deputy primitive).
-- ------------------------------------------------------------
-- 003's row RLS binds the ROW to pet_id, but nothing binds the PATH to a
-- {pet_id}/ prefix. A user could write a row for their own pet whose storage_path
-- points anywhere, and the service-role vet-report embed (generate-report) would
-- fetch and render whatever path the row names. Not exploitable today (paths are
-- 3×UUIDv4, unguessable; the bucket read below was already broader), but it is a
-- latent confused-deputy against a service-role reader. Fix: a CHECK constraint
-- pinning storage_path to the owning pet's prefix, mirroring the per-user-prefix
-- discipline lib/storage.ts enforces for medication photos.
--
-- Safety: all 43 live rows already conform (0 violations) — validated, non-
-- destructive, no backfill. starts_with() is used instead of LIKE so the dynamic
-- pet_id prefix carries no pattern semantics (a uuid has no LIKE metacharacters,
-- but starts_with removes the question entirely).
--
-- ------------------------------------------------------------
-- FINDING 2 — the bucket read policy is bucket-wide (006).
-- ------------------------------------------------------------
-- 006_storage_policies.sql lets ANY authenticated user SELECT (and INSERT/DELETE)
-- ANY object in nyx-event-attachments by path — a de-facto shared read surface over
-- other owners' raw, EXIF-intact pet-health photos. Acceptable reasoning never
-- applied here the way it does for the food catalog (mass-produced front-of-pack,
-- no PII); an incident photo is private health data. Narrow all four verbs to the
-- owning pet, matching the strictness 021 chose for drug labels.
--
-- Server-side consumers are unaffected: generate-report, analyze-vomit and
-- delete-account read/purge via the SERVICE ROLE, which bypasses RLS. The client
-- reads its own photos via signed URLs; minting a signed URL runs under the owner's
-- JWT and still passes the narrowed SELECT for their own pets, so owner rendering is
-- unchanged. Validated against live data: all 43 objects referenced by a live row
-- map to an owned pet and keep read access; the only 14 objects that lose
-- readability are ORPHANS (no event_attachments row references them — residue of
-- deleted pets/events), which correctly should not be readable by anyone.
--
-- NOTE — nyx-vet-attachments (006) has the identical bucket-wide pattern. It is NOT
-- on PR 6's public path (the public vet report embeds event photos, not vet-visit
-- attachments), so it is deliberately left to a scoped follow-up (see backlog) to
-- keep this PR to the one bucket B-244 names.
--
-- PREREQUISITE — the nyx-event-attachments bucket already exists (created via the
-- dashboard). This migration ONLY changes RLS; it never CREATEs the bucket (the
-- SQL-created-bucket owner=null landmine, documented in 021/008/CLAUDE.md).
--
-- Migration Safety Pre-flight:
--   Rollback plan — reverse in two parts (both reversible, see block at file end):
--     (1) ALTER TABLE event_attachments DROP CONSTRAINT event_attachments_storage_path_pet_prefix;
--     (2) DROP the four "nyx-event-attachments: owner …" policies and recreate the
--         three broad 006 policies (verbatim copy at the end of this file).
--   Destructive y/n — n. Adds one CHECK (0 live violations) + swaps RLS policies;
--     drops/alters no column and touches no row data.
--   Backfill — N/A (all 43 rows already satisfy the CHECK).
-- ============================================================

-- ── FINDING 1 — bind storage_path to the owning pet ─────────────────────────
-- Idempotent add: ADD CONSTRAINT has no IF NOT EXISTS, so guard on pg_constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'event_attachments_storage_path_pet_prefix'
      AND conrelid = 'public.event_attachments'::regclass
  ) THEN
    ALTER TABLE public.event_attachments
      ADD CONSTRAINT event_attachments_storage_path_pet_prefix
      CHECK (starts_with(storage_path, pet_id::text || '/'));
  END IF;
END $$;

-- ── FINDING 2 — narrow the bucket policies to the owning pet ─────────────────
-- Drop the broad 006 event-attachment policies (verbatim names).
DROP POLICY IF EXISTS "Authenticated users can upload event attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read event attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete event attachments" ON storage.objects;

-- Idempotent: safe to re-run.
DROP POLICY IF EXISTS "nyx-event-attachments: owner insert" ON storage.objects;
DROP POLICY IF EXISTS "nyx-event-attachments: owner select" ON storage.objects;
DROP POLICY IF EXISTS "nyx-event-attachments: owner update" ON storage.objects;
DROP POLICY IF EXISTS "nyx-event-attachments: owner delete" ON storage.objects;

-- INSERT: a user may upload ONLY under one of their own pets' {pet_id}/ prefixes.
-- WITH CHECK mirrors the CHECK constraint above at the storage layer, so a path
-- for a pet the user does not own is rejected before an object is ever written.
CREATE POLICY "nyx-event-attachments: owner insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'nyx-event-attachments'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.pets WHERE user_id = auth.uid()
    )
  );

-- SELECT: a user may read ONLY their own pets' photos. This closes finding 2 — an
-- authenticated user can no longer read another owner's incident photo by path.
CREATE POLICY "nyx-event-attachments: owner select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'nyx-event-attachments'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.pets WHERE user_id = auth.uid()
    )
  );

-- UPDATE: covers the upsert-overwrite path (uploadPhoto uses upsert:true; the
-- sync re-upload in lib/sync.ts overwrites the same key). USING gates which rows
-- may change; WITH CHECK blocks re-homing an object under a pet the user does not
-- own. 006 granted no UPDATE for this bucket, so adding an owner-scoped one is
-- strictly enabling — it cannot regress an existing grant.
CREATE POLICY "nyx-event-attachments: owner update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'nyx-event-attachments'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.pets WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'nyx-event-attachments'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.pets WHERE user_id = auth.uid()
    )
  );

-- DELETE: a user may remove ONLY their own pets' photos (drives the per-photo
-- remove in app/event/[id].tsx). Safe to scope here where 006 had granted it
-- bucket-wide.
CREATE POLICY "nyx-event-attachments: owner delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'nyx-event-attachments'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.pets WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- ROLLBACK (for reference — do not run inline):
--
--   ALTER TABLE public.event_attachments
--     DROP CONSTRAINT IF EXISTS event_attachments_storage_path_pet_prefix;
--
--   DROP POLICY IF EXISTS "nyx-event-attachments: owner insert" ON storage.objects;
--   DROP POLICY IF EXISTS "nyx-event-attachments: owner select" ON storage.objects;
--   DROP POLICY IF EXISTS "nyx-event-attachments: owner update" ON storage.objects;
--   DROP POLICY IF EXISTS "nyx-event-attachments: owner delete" ON storage.objects;
--
--   CREATE POLICY "Authenticated users can upload event attachments"
--     ON storage.objects FOR INSERT TO authenticated
--     WITH CHECK (bucket_id = 'nyx-event-attachments');
--   CREATE POLICY "Authenticated users can read event attachments"
--     ON storage.objects FOR SELECT TO authenticated
--     USING (bucket_id = 'nyx-event-attachments');
--   CREATE POLICY "Authenticated users can delete event attachments"
--     ON storage.objects FOR DELETE TO authenticated
--     USING (bucket_id = 'nyx-event-attachments');
-- ============================================================
