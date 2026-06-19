-- ============================================================
-- B-117 PR 4 — nyx-medication-photos Storage RLS (per-user prefix)
-- Resolves B-124. Spec: docs/nyx-medication-logging-requirements.md §5.2.
-- ============================================================
--
-- PREREQUISITE — create the bucket via the Supabase DASHBOARD UI first, as a
-- PRIVATE bucket, BEFORE running this migration. A SQL-created bucket gets
-- owner=null and these policies then fail silently (uploads 42501) — the
-- unresolved nyx-pet-photos landmine documented in CLAUDE.md Open Questions and
-- the food-photos precedent (008's header). This migration ONLY adds the RLS
-- policies; it never CREATEs the bucket.
--   Dashboard → Storage → New bucket → name: nyx-medication-photos → Public: OFF.
--
-- ------------------------------------------------------------
-- B-124 DECISION — per-user PATH-PREFIX RLS, *not* food-style open read.
-- ------------------------------------------------------------
-- The food/event/vet buckets (006/008) let ANY authenticated user read the WHOLE
-- bucket; path-ownership is enforced app-layer only — a de-facto shared read
-- surface. That is acceptable for a kibble front-of-pack: mass-produced, no PII.
--
-- A drug LABEL is categorically different. A prescription label routinely carries
-- the OWNER's name, the PET's name, and the prescribing CLINIC — real PII on a
-- health artifact. So this bucket is STRICTER than the food precedent, mirroring
-- the strictness 020 already chose for the medication_items *catalog* RLS
-- ("a drug-product catalog is more sensitive than a kibble catalog").
--
-- Reconciliation with the GLOBAL medication_items library: the library ROW stays
-- globally readable (drug name / strength / form — useful, non-sensitive catalog
-- data), but the LABEL PHOTO is locked to its uploader here. We share what is safe
-- and privatise what is not. A user browsing another owner's catalog row sees the
-- structured fields and a placeholder where the label would be (getSignedUrls
-- already degrades a per-path RLS failure to a placeholder, never a torn image) —
-- and NOT showing another owner's prescription label is the correct behaviour, not
-- a regression.
--
-- Server-side consumers are unaffected: the PR 5 extraction Edge Function, the
-- Step 9 vet report, and account deletion all read via the SERVICE ROLE, which
-- bypasses RLS. The only behavioural change is cross-user thumbnail rendering in
-- the client picker — which we WANT suppressed for labels.
--
-- Deletion consequence (flagged to B-039): because these photos are per-user PII,
-- nyx-medication-photos belongs in delete-account's PURGE list (like
-- nyx-pet-photos), NOT the preserved list (unlike nyx-food-photos). The catalog
-- ROW survives (created_by_user_id → SET NULL) but its label photo is erased.
-- The {user_id}/ prefix makes that purge a trivial prefix-scoped list+remove.
-- Tracked as B-127 (wire when B-039's delete-account builds out the med input).
--
-- ------------------------------------------------------------
-- Path convention (enforced centrally in lib/storage.ts buildMedicationPhotoPath):
--   {user_id}/{medication_item_id}/{slot}.jpg
-- The leading {user_id} segment is the SECURITY boundary — (storage.foldername
-- (name))[1] is the first path segment and MUST equal auth.uid(). A path written
-- without that prefix is silently rejected by these policies, which is why the
-- prefix lives in one helper and never at a call site.
--
-- Migration Safety Pre-flight:
--   Rollback plan — DROP the four policies below (names listed). Reversible.
--   Destructive y/n — n. Adds storage.objects policies only; touches no app data.
--   Backfill — N/A.
-- ============================================================

-- Idempotent: safe to re-run (e.g. after the bucket is recreated via dashboard).
DROP POLICY IF EXISTS "nyx-medication-photos: owner insert" ON storage.objects;
DROP POLICY IF EXISTS "nyx-medication-photos: owner select" ON storage.objects;
DROP POLICY IF EXISTS "nyx-medication-photos: owner update" ON storage.objects;
DROP POLICY IF EXISTS "nyx-medication-photos: owner delete" ON storage.objects;

-- INSERT: a user may upload ONLY into their own {auth.uid()}/… prefix.
CREATE POLICY "nyx-medication-photos: owner insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'nyx-medication-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- SELECT: a user may read ONLY their own label photos. This is the whole point of
-- the decision — another authenticated user cannot read this object even with the
-- exact path, because the storage layer itself enforces the boundary.
CREATE POLICY "nyx-medication-photos: owner select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'nyx-medication-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- UPDATE: supports replace-the-label (§5.3) and the upsert overwrite path. USING
-- gates which rows may be updated; WITH CHECK blocks moving a row INTO another
-- user's prefix (a user cannot re-home an object under someone else's uid).
CREATE POLICY "nyx-medication-photos: owner update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'nyx-medication-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'nyx-medication-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- DELETE: a user may remove ONLY their own label photos. Safe to grant here
-- (unlike 008, which omitted DELETE on the SHARED food bucket to stop one user
-- deleting another's uploads) precisely because the prefix scopes it to the owner.
CREATE POLICY "nyx-medication-photos: owner delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'nyx-medication-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
