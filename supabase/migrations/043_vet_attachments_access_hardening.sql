-- ============================================================
-- B-248 (+ B-466 folded in) — Harden nyx-vet-attachments access
-- The sibling migration 025 deliberately left for a scoped follow-up, plus the
-- last unclosed member of the storage_path confused-deputy class (B-466).
-- Pattern: migration 025 (nyx-event-attachments) and 042 (nyx-pet-photos).
-- ============================================================
--
-- Path convention (written at the ONE call site, app/vet-visit.tsx:133):
--   {pet_id}/{visit_id}/{attachment_id}.jpg
-- The leading {pet_id} segment is the ownership boundary — the same shape as
-- nyx-event-attachments (025), not the {user_id}/… of nyx-medication-photos
-- (021). So ownership reads "that pet belongs to auth.uid()", which is the
-- subquery the vet_visit_attachments TABLE policy (003) already uses.
--
-- ------------------------------------------------------------
-- FINDING 1 (B-248) — three bucket-wide policies, verified live.
-- ------------------------------------------------------------
-- Read back from pg_policies before writing this migration, the live set was
-- exactly 006's three, ALL `TO authenticated` and scoped ONLY by bucket_id:
--
--   Authenticated users can read vet attachments    SELECT  USING (bucket_id = …)
--   Authenticated users can upload vet attachments  INSERT  WITH CHECK (bucket_id = …)
--   Authenticated users can delete vet attachments  DELETE  USING (bucket_id = …)
--
-- So ANY authenticated user could read, overwrite-by-upload, or DELETE ANY
-- object in this bucket by path. 006's header states the rationale — "path-level
-- ownership is enforced at the app layer (storage_path includes … IDs that are
-- already gated by table RLS)" — and that reasoning is the bug: table RLS gates
-- which ROWS you can read, never which OBJECT KEYS you can name. A caller who
-- never touches the table is not constrained by the table's policies at all.
--
-- Vet-visit attachments are photographed visit summaries, prescriptions and
-- invoices: owner name, home address, phone, clinic identity and the pet's
-- clinical history, all in one image. That is a strictly wider PII surface than
-- the drug labels 021 already privatised, and wider than the incident photos 025
-- closed. This is the LAST live cross-tenant health-data read in the project
-- (2026-07-20 hardening audit §A1), which is why B-248 was elevated Later→Now as
-- a pre-multi-user blocker.
--
-- Not exploited today: the project has exactly ONE account (verified —
-- `select count(distinct user_id) from pets` = 1), and this bucket holds 0
-- objects. It goes live the moment user #2 uploads a vet document. Fixing it at
-- 0 objects is free; fixing it later means auditing real documents.
--
-- The DELETE half is worth naming separately because B-248's original row missed
-- it (the 2026-07-25 re-verification added it): a second user could not merely
-- READ another owner's vet documents, but permanently DESTROY them — and since
-- Storage objects have no soft-delete and the row would survive pointing at a
-- dead key, the loss is silent and unrecoverable. Disclosure and destruction,
-- not just disclosure.
--
-- ------------------------------------------------------------
-- FINDING 2 (B-466) — storage_path is unbound to the pet.
-- ------------------------------------------------------------
-- The same confused-deputy primitive 025 closed for event_attachments and 042
-- closed for pets.photo_path. The class has five members; this is the last one:
--
--     event_attachments.storage_path   → CHECK (025)                 ✓
--     medication_items.photo_paths     → scopeMedicationPaths        ✓
--     food_items.photo_paths           → scopeFoodPaths              ✓
--     pets.photo_path                  → CHECK (042)                 ✓
--     vet_visit_attachments.storage_path → closed NOWHERE            ← here
--
-- 003's `vet_visit_attachments_owner` policy binds the ROW to pet_id; nothing
-- binds the PATH to a `{pet_id}/` prefix. `storage_path` is plain TEXT and the
-- policy's USING clause gates which row you may write, never the column
-- CONTENTS. Meanwhile `delete-account` reads `vet_visit_attachments.storage_path`
-- for the caller's own pets (index.ts:125) and purges each path from this bucket
-- with the SERVICE ROLE, which bypasses RLS entirely — so none of the policies
-- above are consulted on that path. And `collectStoragePaths` passes the vet
-- list through `cleanPaths` ONLY (plan.ts:215 — dedupe/blank-drop, no ownership
-- scoping), while the food and medication lists ARE re-scoped (`scopeFoodPaths`,
-- `scopeMedicationPaths`) for precisely this reason.
--
-- So, pre-fix: an attacker writes a row for their OWN pet whose storage_path
-- names `{victimPetId}/{victimVisitId}/{victimAttId}.jpg`, deletes their own
-- account, and the service-role purge deletes the victim's vet document
-- verbatim. Destruction rather than disclosure, and it costs the attacker their
-- account — but it is exactly the B-244 finding-1 / B-354 FR-7 shape, and the
-- comments reasoning that this bucket needs no guard are wrong on their own
-- terms: row ownership is pet-scoped, the column VALUE is not.
--
-- The CHECK is the half that makes the crafted path impossible BY CONSTRUCTION,
-- so the deputy has nothing to be confused by. A `scopeVetAttachmentPaths` in
-- plan.ts is still worth building, but it is an Edge Function change and stays
-- OUT of this schema PR (filed instead) — exactly the split 042 made.
--
-- The precise residual that follow-up closes, found by this migration's
-- rls-privacy-reviewer pass and worth recording so the follow-up is built for
-- the right reason rather than generic thoroughness: `starts_with` is a PREFIX
-- test, so `{ownPetId}/../{victimPetId}/x.jpg` PASSES this CHECK and also passes
-- the storage INSERT policy below (its first folder segment is `{ownPetId}`,
-- which the owner legitimately owns). That string then reaches the service-role
-- `remove()` (index.ts:217) verbatim, because `cleanPaths` only dedupes and
-- drops blanks — it never normalises a path (plan.ts:109-120).
--
-- It does NOT delete the victim's object: `storage.objects.name` is an OPAQUE
-- literal, and neither storage-api nor S3 resolves `..`, so that string is
-- simply a different key that matches nothing. The boundary holds — but it
-- holds because of a third-party implementation detail we do not own and do not
-- test, which is a bad thing to depend on. `scopeVetAttachmentPaths` should
-- therefore mirror `scopeFoodPaths`' EXACT first-segment set membership
-- (plan.ts:203-208, which deliberately does not use `startsWith`), not a prefix
-- test. The identical shape exists in 025 for event attachments, whose
-- downstream reader is `generate-report` — trace that one when the follow-up is
-- built rather than assuming it is the same.
--
-- Free NOW, expensive later: 0 rows to audit, 0 violations, 1 writer path
-- (verified below). This is the same "the CHECK rides in this PR rather than a
-- filed follow-up" call 042's rls-privacy-reviewer forced, and B-466 asks for
-- explicitly ("Fold into B-248 … one PR, not two").
--
-- ------------------------------------------------------------
-- FINDING 3 — no UPDATE policy, and both write paths upsert.
-- ------------------------------------------------------------
-- Found by reading the write path, same seam 025 and 042 each hit. There are
-- exactly two writers, and BOTH go through `lib/storage.ts uploadPhoto`, which
-- uploads with `upsert: true` (storage.ts:135):
--   * app/vet-visit.tsx:151 — the initial upload during the visit flow.
--   * lib/sync.ts:407      — the offline-queue flush, which re-uploads the SAME
--                            key whenever a prior attempt left `synced = 0`
--                            (e.g. the upload landed but the row upsert failed,
--                            the explicitly-guarded case at vet-visit.tsx:160).
-- A first upload is an INSERT; a re-upload over an existing key is an UPDATE.
-- With INSERT as the only write grant, that retry fails — a latent bug that is
-- invisible today only because the bucket holds 0 objects. 006 granted no UPDATE
-- for this bucket, so adding an owner-scoped one is strictly ENABLING: it cannot
-- regress a grant that never existed.
--
-- The UPDATE policy's WITH CHECK half is load-bearing, not ceremony: storage-api
-- implements `move()` as an UPDATE of `objects.name`, so a USING-only grant
-- would let an owner re-home one of their own objects INTO another owner's
-- `{petId}/` prefix. WITH CHECK forbids the destination as well as the source.
--
-- ------------------------------------------------------------
-- DELETE — deliberately DROPPED, not re-granted. (Divergence from 025.)
-- ------------------------------------------------------------
-- 025 kept an owner-scoped DELETE because a real client path exercises it
-- (app/event/[id].tsx:433 removes a photo from an event). This bucket has NO
-- such path: `.remove()` is called exactly once in the entire app, against
-- nyx-event-attachments, and there is no vet-visit edit or delete screen at all
-- (app/vet-visit.tsx is a create-only flow; no code path deletes a vet_visits or
-- vet_visit_attachments row). The only deleter is `delete-account`, which purges
-- via `adminClient.storage` (index.ts:217) — the SERVICE ROLE, which bypasses
-- RLS and is therefore unaffected by the absence of a DELETE policy.
--
-- So dropping 006's DELETE is strictly tighter than narrowing it, and regresses
-- nothing. Following 042's rule — granting an unused verb is not hardening —
-- rather than 025's four-verb set, because the evidence differs. If a "remove
-- attachment" affordance is ever built for vet visits, it needs this policy, and
-- its absence will fail loudly at development time rather than silently:
--
--   CREATE POLICY "nyx-vet-attachments: owner delete"
--     ON storage.objects FOR DELETE TO authenticated
--     USING (
--       bucket_id = 'nyx-vet-attachments'
--       AND (storage.foldername(name))[1] IN (
--         SELECT id::text FROM public.pets WHERE user_id = auth.uid()
--       )
--     );
--
-- The one consequence of UPDATE-without-DELETE, named rather than discovered
-- later (rls-privacy-reviewer, low severity but a deletion-COMPLETENESS issue on
-- health documents, so it does not go unrecorded): an owner can `move()` one of
-- their own objects to a different key inside their own `{petId}/` prefix, and
-- the `vet_visit_attachments` row still names the OLD key. `delete-account`
-- purges only the paths recorded in rows (index.ts:125), so the renamed object
-- SURVIVES account deletion — and with no DELETE policy, no client can remove it
-- either. It requires deliberate action, it becomes unreadable to every
-- authenticated caller the moment the `pets` row cascades away (the SELECT
-- policy's subquery goes empty), and B-121's orphan sweep is the filed
-- mitigation — but a vet document outliving an erasure request is worth having
-- written down. Granting DELETE would NOT fix it: the row names the old key
-- either way, so the purge would still miss it. The real fix is the orphan
-- sweep, which is why this is a note and not a reason to add the policy.
--
-- ------------------------------------------------------------
-- Non-regression — who reads this bucket, and does anything break?
-- ------------------------------------------------------------
--   * Owner rendering: nothing regresses, because nothing reads these objects
--     from Storage today. The app renders vet attachments from the local file
--     (`local_uri`, app/vet-visit.tsx:139); there is no `getSignedUrl` call
--     against this bucket anywhere. When a render surface IS built, minting a
--     signed URL runs under the owner's JWT and passes the narrowed SELECT for
--     their own pets — the same property 025 relies on.
--   * The SELECT policy is therefore needed for two reasons that are NOT owner
--     rendering: Postgres applies SELECT policies to a RETURNING clause and
--     storage-api's upsert path reads the existing row and returns the written
--     one (042 finding 3 — the bucket-with-no-SELECT-policy trap), and it is the
--     policy a future signed-URL read needs. Scoping it to the owner is the
--     whole point of B-248.
--   * Server-side consumers are unaffected: delete-account purges with the
--     service role, which bypasses RLS. No Edge Function reads this bucket under
--     a caller JWT (grepped: the only references are plan.ts's bucket constant
--     and index.ts's admin read).
--
-- ------------------------------------------------------------
-- Ordering — why the B-358 trap does not bite here.
-- ------------------------------------------------------------
-- 036 could not owner-scope nyx-food-photos' INSERT until the client was
-- reordered, because food photos were uploaded to `{foodId}/…` BEFORE the
-- owner-locked food_items row existed, so an ownership subquery would have
-- 42501'd every upload. Checked for that here; the write path is already safe:
--   * The path's first segment is a PET id, and the upload is gated on an active
--     pet (app/vet-visit.tsx uses `pet.id`), not on the vet_visits row.
--   * Every pets row is created by a DIRECT, awaited Supabase insert
--     (app/onboarding/pet-*.tsx, app/add-pet.tsx) — pets are never queued through
--     the offline mirror — so the row the subquery needs is already committed
--     server-side before any attachment upload can be reached.
--   * The 042 verification of this same property, for this same subquery, was
--     re-checked rather than assumed.
-- No client change is needed and no client reorder precedes this migration.
--
-- Path handling: compared as text (`id::text`) so a malformed first segment
-- simply fails to match instead of raising a uuid cast error inside a policy (a
-- `::uuid` formulation would turn a hostile key into a 500); exact set
-- membership via `IN`, never a prefix match, so one id can never be a string
-- prefix of another. A key with no '/' has an empty folder list, so
-- `(storage.foldername(name))[1]` is NULL and the write is rejected (a NULL
-- predicate is not TRUE, so the policy denies).
-- `starts_with()` is used in the CHECK instead of LIKE so the dynamic pet_id
-- prefix carries no pattern semantics.
--
-- The whole 021/025/033/036/042/043 policy family depends on what
-- `storage.foldername` actually returns, and Supabase has shipped more than one
-- implementation of it. Read back from the live database rather than assumed:
--   string_to_array(name, '/'), returning _parts[1 : array_length(_parts,1) - 1]
-- i.e. the segments BEFORE the final one. So `[1]` is the first FOLDER, and a
-- key with no '/' yields an empty array whose `[1]` is NULL — which is what
-- makes the no-slash case below fail closed rather than match anything.
--
-- Both predicates were evaluated against the LIVE database with a real pets.id
-- before this migration was written. Every hostile key fails closed, and the
-- legitimate key passes both — policy predicate / CHECK:
--
--   {petId}/visit/att.jpg      → allow  / allow   ← the only legitimate shape
--   att.jpg          (no '/')  → NULL   / false
--   {petId}          (bare id) → NULL   / false
--   /{petId}/v/a.jpg           → false  / false   (first segment is '')
--   ../{petId}/v/a.jpg         → false  / false   (first segment is '..')
--   "{petId} /v/a.jpg"         → false  / false   (trailing-space near-miss)
--   {PETID}/v/a.jpg (upper)    → false  / false   (no case folding)
--   {petId}X/v/a.jpg           → false  / false   (id as a string PREFIX —
--                                                  the `IN` set-membership is
--                                                  what makes this a miss)
--
-- PREREQUISITE — the nyx-vet-attachments bucket already exists (created via the
-- dashboard, 2026-05-16). This migration ONLY changes RLS; it never CREATEs the
-- bucket (the SQL-created-bucket owner=null landmine, documented in 021/008/
-- CLAUDE.md). Verified private (`public = false`) — the load-bearing condition
-- for any of this to mean anything, since a public bucket's read route bypasses
-- RLS entirely.
--
-- Migration Safety Pre-flight:
--   Destructive: n — swaps three Storage RLS policies for tighter ones, adds an
--     UPDATE policy where there was none, and adds one CHECK constraint. Drops,
--     renames or alters NO column, and touches NO row data. Existing objects are
--     neither moved nor deleted (there are none).
--   Rollback: two independent parts (verbatim block at end of file).
--     (1) ALTER TABLE public.vet_visit_attachments
--           DROP CONSTRAINT IF EXISTS vet_visit_attachments_storage_path_pet_prefix;
--     (2) DROP the THREE "nyx-vet-attachments: owner …" policies this migration
--         creates (insert/select/update — there is no owner delete; see the
--         DELETE section above) and recreate the three broad 006 policies.
--         NOTE: rolling back part (2) RE-OPENS B-248 — it restores a
--         cross-tenant read AND a bucket-wide DELETE over other owners' vet
--         documents. It is a real rollback, not routine cleanup; do not run it
--         to "reset" the bucket.
--   Backfill: N/A — no data change, and 0 rows to conform.
--   Tables affected: storage.objects (RLS policies only) and
--     public.vet_visit_attachments (one CHECK constraint, no column change).
--     Row-count checks the PM can run BEFORE applying — all THREE verified 0 live
--     at authoring time (2026-07-26):
--       select count(*) from storage.objects where bucket_id = 'nyx-vet-attachments';
--       select count(*) from public.vet_visit_attachments;
--       select count(*) from public.vet_visit_attachments
--         where not starts_with(storage_path, pet_id::text || '/');
--     The third MUST be 0 or the ADD CONSTRAINT fails — it is the whole
--     no-backfill claim. `app/vet-visit.tsx:133` is the only writer of
--     `storage_path` and already writes `${pet.id}/${visitId}/${attId}.jpg`.
-- ============================================================

-- ── FINDING 2 (B-466) — bind storage_path to the owning pet ──────────────────
-- Idempotent add: ADD CONSTRAINT has no IF NOT EXISTS, so guard on pg_constraint
-- (same shape as 025/042). No NULL branch: storage_path is NOT NULL at the
-- column level (003), unlike pets.photo_path which 042 had to allow to be NULL.
--
-- LOAD-BEARING DEPENDENCY — `pet_id UUID NOT NULL` (003_attachments.sql:31).
-- This constraint is silently VOIDED if pet_id ever becomes nullable:
-- `NULL::text || '/'` is NULL, `starts_with(x, NULL)` is NULL, and a CHECK
-- passes on NULL. So a future migration relaxing pet_id would disable this
-- guard without failing, erroring, or touching this file. If that is ever
-- proposed, this CHECK must gain an explicit `pet_id IS NOT NULL AND …` first.
-- Stated here because the dependency lives in a different file and is invisible
-- from this one (caught by the rls-privacy-reviewer pass on this migration).
--
-- The other half of why this CHECK is the right tool, and not merely one of two
-- interchangeable options: a CHECK constraint is NOT RLS, so it also binds the
-- SERVICE ROLE. The confused-deputy in finding 2 is a service-role purge, which
-- bypasses every policy above — a `plan.ts` scope function would guard that one
-- caller, whereas the constraint makes the crafted row unrepresentable for all
-- of them. That is the stronger argument for closing it here rather than in the
-- Edge Function, and it is why the filed follow-up is defense-in-depth rather
-- than the actual fix.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'vet_visit_attachments_storage_path_pet_prefix'
      AND conrelid = 'public.vet_visit_attachments'::regclass
  ) THEN
    ALTER TABLE public.vet_visit_attachments
      ADD CONSTRAINT vet_visit_attachments_storage_path_pet_prefix
      CHECK (starts_with(storage_path, pet_id::text || '/'));
  END IF;
END $$;

-- ── FINDINGS 1 & 3 — narrow the bucket policies to the owning pet ────────────
-- Drop the broad 006 vet-attachment policies (verbatim live names).
DROP POLICY IF EXISTS "Authenticated users can upload vet attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read vet attachments"   ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete vet attachments" ON storage.objects;

-- Idempotent: safe to re-run. The delete drop is defensive — no such policy is
-- created below (see the DELETE note in the header), but naming it here means a
-- re-run after a future hand-added one still converges on this file's set.
DROP POLICY IF EXISTS "nyx-vet-attachments: owner insert" ON storage.objects;
DROP POLICY IF EXISTS "nyx-vet-attachments: owner select" ON storage.objects;
DROP POLICY IF EXISTS "nyx-vet-attachments: owner update" ON storage.objects;
DROP POLICY IF EXISTS "nyx-vet-attachments: owner delete" ON storage.objects;

-- INSERT: a user may upload ONLY under one of their own pets' {pet_id}/ prefixes.
-- WITH CHECK mirrors the CHECK constraint above at the storage layer, so a path
-- for a pet the user does not own is rejected before an object is ever written.
-- The subquery filters `user_id = auth.uid()` itself, so this policy does not
-- depend on the `pets` table's own RLS staying correct.
CREATE POLICY "nyx-vet-attachments: owner insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'nyx-vet-attachments'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.pets WHERE user_id = auth.uid()
    )
  );

-- SELECT: a user may read ONLY their own pets' vet documents. This closes the
-- cross-tenant read that B-248 names — the last live one in the project.
CREATE POLICY "nyx-vet-attachments: owner select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'nyx-vet-attachments'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.pets WHERE user_id = auth.uid()
    )
  );

-- UPDATE: covers the upsert-overwrite path (both writers use uploadPhoto with
-- upsert:true; the sync flush re-uploads the same key after a failed attempt).
-- USING gates which objects may change; WITH CHECK blocks re-homing an object
-- (storage-api's `move()`) under a pet the user does not own — see finding 3.
CREATE POLICY "nyx-vet-attachments: owner update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'nyx-vet-attachments'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.pets WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'nyx-vet-attachments'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.pets WHERE user_id = auth.uid()
    )
  );

-- DELETE: deliberately NOT created — no client path deletes a vet attachment,
-- and delete-account purges with the service role (RLS-exempt). See the header.

-- ============================================================
-- ROLLBACK (for reference — do not run inline).
--
-- ⚠ Running this RE-OPENS B-248: it restores a bucket-wide authenticated read
-- AND a bucket-wide authenticated DELETE over every owner's vet documents. That
-- is the whole hole this migration closes. Roll back only to recover from a
-- specific regression, never as routine cleanup — and re-apply promptly.
--
-- The two parts are independent; part (1) is safe to run alone (it only relaxes
-- the path binding) and does NOT re-open the cross-tenant read.
--
--   -- (1) drop the path binding
--   ALTER TABLE public.vet_visit_attachments
--     DROP CONSTRAINT IF EXISTS vet_visit_attachments_storage_path_pet_prefix;
--
--   -- (2) restore 006's bucket-wide policies. The owner-delete drop mirrors the
--   -- forward migration's defensive drop, so both directions converge on the
--   -- same policy set even if one was hand-added between runs.
--   DROP POLICY IF EXISTS "nyx-vet-attachments: owner insert" ON storage.objects;
--   DROP POLICY IF EXISTS "nyx-vet-attachments: owner select" ON storage.objects;
--   DROP POLICY IF EXISTS "nyx-vet-attachments: owner update" ON storage.objects;
--   DROP POLICY IF EXISTS "nyx-vet-attachments: owner delete" ON storage.objects;
--
--   -- Each create is preceded by its own drop so the ROLLBACK is itself
--   -- idempotent — without these, a second rollback run errors 42710
--   -- "policy already exists". (025's rollback block has this flaw; not
--   -- inherited here.)
--   DROP POLICY IF EXISTS "Authenticated users can upload vet attachments" ON storage.objects;
--   CREATE POLICY "Authenticated users can upload vet attachments"
--     ON storage.objects FOR INSERT TO authenticated
--     WITH CHECK (bucket_id = 'nyx-vet-attachments');
--
--   DROP POLICY IF EXISTS "Authenticated users can read vet attachments" ON storage.objects;
--   CREATE POLICY "Authenticated users can read vet attachments"
--     ON storage.objects FOR SELECT TO authenticated
--     USING (bucket_id = 'nyx-vet-attachments');
--
--   DROP POLICY IF EXISTS "Authenticated users can delete vet attachments" ON storage.objects;
--   CREATE POLICY "Authenticated users can delete vet attachments"
--     ON storage.objects FOR DELETE TO authenticated
--     USING (bucket_id = 'nyx-vet-attachments');
-- ============================================================
