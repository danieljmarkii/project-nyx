-- ============================================================
-- Migration 044: vet_documents — the Vet Files substrate (B-478, VF-1)
-- Spec: docs/nyx-vet-files-requirements.md §5.1 (schema), §5.2 (storage),
--       §6.2 (standing rules), D3/D4/D7/D13.
-- Patterns imported: 003 (per-pet child + owner RLS), 040/041 (a new table with
--   dated/soft-delete semantics + the same-pet integrity trigger), 043 (the
--   {pet_id}/ path CHECK and the owner-scoped Storage policy family).
-- ============================================================
--
-- WHAT THIS IS. Vet Files is a per-pet, owner-held library of vet-facing
-- documents — lab PDFs, vaccination certificates, discharge summaries, screenshots
-- of clinic email. This migration is the whole substrate and NOTHING else: the
-- table, its RLS, the Storage policies for the already-created nyx-vet-documents
-- bucket, and the integrity guards. No UI ships in this PR (VF-2–VF-4), and no
-- server-side reader touches these rows (§5.3: generate-report, ask and
-- generate-signal are all Phase 2, behind the D8 gate).
--
-- WHY A NEW TABLE RATHER THAN RELAXING vet_visit_attachments (D3, PM-ratified).
-- The shipped table is a per-visit photo attach with `vet_visit_id NOT NULL` and
-- none of the metadata this needs (kind/title/document_date/source/deleted_at).
-- Making its FK nullable would make every existing read of it ambiguous — "is
-- this a visit photo or a library document?" — for the benefit of reusing four
-- columns. Existing rows stay put; §12 parks a backfill-link follow-up.
--
-- ------------------------------------------------------------
-- COLUMN NOTES — the ones that are decisions rather than plumbing
-- ------------------------------------------------------------
--
-- pet_id NOT NULL. D13 (multi-pet) is served by DUPLICATE-ON-ADD — "Also add to
-- {other pet}'s Vet Files" creates a full independent copy, its own row AND its
-- own storage object. A shared-document model was considered and rejected because
-- one object serving two pets breaks all three of: the {pet_id}/ path CHECK below,
-- the per-pet Storage policies, and the delete-account cascade (removing one pet
-- would orphan or destroy the other's reference). So pet_id stays NOT NULL and
-- this table needs no join table.
--
-- vet_visit_id — OPTIONAL, and the direction of the link is load-bearing (D7,
-- the report-window protection rule). The vet report's scope cascade keys rung 1
-- off `vet_visits.visited_at`, so uploading a document must NEVER create, date or
-- re-date a vet_visits row — not in v1, not in Phase 2, not by AI extraction. A
-- document may LINK to an existing visit; it may never MINT one. Nothing in this
-- migration writes to vet_visits, and ON DELETE SET NULL means deleting a visit
-- UNLINKS its documents rather than destroying them (a lab PDF outlives the visit
-- record it was filed under). The same-pet trigger below closes the FK's own hole.
--
-- document_group_id NOT NULL — §4.4. An email thread or a multi-page discharge
-- sheet is N images that are ONE document. One row per page, grouped by this id
-- and ordered by page_index, rendered as a swipeable stack. It equals `id` for a
-- single-page document, which is the overwhelming case. Cheap now, expensive to
-- retrofit: the alternative (one library row per screenshot) makes the list read
-- as clutter and makes Phase-2 attribution ambiguous about what "the document"
-- even is. Deliberately NOT a foreign key to anything — it is a grouping key, and
-- there is no "document group" entity to point at. Its integrity guard is the
-- trigger below, not an FK.
--
-- title NULLABLE, and that is the design, not an oversight. D11 ruled kind chips
-- OUT of the capture flow: a document saves with everything defaulted and nothing
-- asked (Principle 1 — the upload moment is often a clinic parking lot). §4.1
-- states untitled rows are "the expected steady state, and the list is designed
-- for them". So the default title ("Document — {date}") is RENDERED by the client,
-- never STORED — which is what keeps "has the owner actually named this?" knowable
-- by a NULL test. Storing a default would make the one-tap Name affordance (the
-- sanctioned recovery for the zero-decision default) unable to tell the two apart.
--
-- document_date DATE, distinct from created_at — the Data Scientist's line: the
-- date ON the document is the clinically meaningful one (bloodwork drawn in March,
-- filed in July). DATE not TIMESTAMPTZ because documents carry dates, not times.
-- Nullable for a document whose date is genuinely unknown, though the VF-3 writer
-- always defaults it (EXIF date, else today) so a NULL should be rare.
--
-- source NOT NULL — provenance from day one (D10). The original artifact is
-- primary forever; any future AI read is an annotation linked back to it, never a
-- replacement (the same owner-editable-analysis pattern as B-028).
--
-- deleted_at — soft delete, the house rule on events, and the substrate for the
-- 30-day "Recently deleted" surface VF-4 owes (AC 5). The final purge of the
-- storage OBJECT joins the B-249-class retention decision rather than forking it.
--
-- updated_at + the set_updated_at trigger are what make the local mirror possible
-- at all: an insert-only table's sync contract is "never overwrite an existing
-- local row", so a rename or a soft-delete on one device could never propagate to
-- another. This is the same argument 040 made for diet_trial_foods.
--
-- ------------------------------------------------------------
-- CHECK CONSTRAINTS — what each one actually prevents
-- ------------------------------------------------------------
--
-- storage_path — the {pet_id}/ prefix CHECK, on day one (§5.2, D4). This is the
-- confused-deputy guard 025/042/043 each had to retrofit; this table is born with
-- it, which is the whole point of "correct-by-construction, never a B-248/B-464
-- class member". `starts_with()` rather than LIKE so the dynamic pet_id prefix
-- carries no pattern semantics.
--
--   ⚠ LOAD-BEARING DEPENDENCY — `pet_id UUID NOT NULL`. This CHECK is silently
--   VOIDED if pet_id ever becomes nullable: `NULL::text || '/'` is NULL,
--   `starts_with(x, NULL)` is NULL, and a CHECK passes on NULL. A future migration
--   relaxing pet_id would disable this guard without failing, erroring, or touching
--   this file. If that is ever proposed, this CHECK must gain an explicit
--   `pet_id IS NOT NULL AND …` first. (Inherited verbatim from 043's finding — the
--   dependency lives in a different statement and is invisible from the CHECK.)
--
-- storage_path is also UNIQUE. One row, one object — which is what makes the
-- delete-account purge count (AC 8: "zero objects", verified not assumed) and the
-- soft-delete retention sweep unambiguous. It pins a contract VF-3 must honour:
-- derive the object key from the DOCUMENT ID (`{pet_id}/{id}.{ext}`), so two rows
-- can never name one object and the D13 copy genuinely gets its own bytes.
--
-- kind — a CHECK'd closed set rather than an ENUM. Both are one migration to
-- extend; TEXT keeps the local SQLite mirror's column congruent with the server's
-- and keeps Phase-2 additions from needing an ALTER TYPE inside a transaction.
-- Ordered here by the §2 continuity-of-care ranking (labs first, invoices last),
-- which is also the order §4.5 requires in pickers — never alphabetical.
--
-- mime_type — CHECK'd to the FOUR types the bucket itself accepts. This is
-- deliberate duplication with a named coupling: the bucket's allowed_mime_types
-- rejects the UPLOAD, this CHECK rejects the ROW, and the row is what drives the
-- viewer branch (PDF → native/WebView, image → PhotoViewer, per G2). A row whose
-- mime_type is junk is a broken detail screen even when the object is fine.
--   ⚠ If the bucket's allowed_mime_types is ever widened via the dashboard, THIS
--   CHECK must be widened in the same change or the new type uploads fine and then
--   fails to insert. The bucket is the outer gate; this is the inner one.
--
-- page_index >= 0 and file_size_bytes >= 0 are ordinary domain guards. There is
-- deliberately NO unique index on (document_group_id, page_index): a soft-deleted
-- page would otherwise permanently burn its slot, and a UNIQUE violation during
-- the offline push flush is a terminal 23505 that wedges the sync queue for that
-- row. Page order is a display concern; a duplicate index is a cosmetic bug, and
-- trading a wedged queue for it is a bad trade.
--
-- ------------------------------------------------------------
-- Migration Safety Pre-flight
-- ------------------------------------------------------------
--   Destructive y/n:  n. Purely additive — one new table, its indexes, its RLS
--                     policies, one trigger function + trigger, and four Storage
--                     policies on a bucket that currently has NONE. Drops,
--                     renames or alters NO existing column, table, policy or row.
--                     The only pre-existing objects referenced are read-only FK
--                     targets (pets, vet_visits) and the shared set_updated_at().
--   Affected tables:  public.vet_documents (new, 0 rows by construction) and
--                     storage.objects (four policies ADDED; none dropped —
--                     verified 0 policies mention this bucket today).
--                     Row-count checks the PM can run BEFORE applying — both
--                     verified live at authoring time (2026-07-26):
--                       select to_regclass('public.vet_documents');   -> expect NULL
--                       select count(*) from storage.objects
--                         where bucket_id = 'nyx-vet-documents';      -> expect 0
--                     A non-NULL first result means someone already created the
--                     table; STOP rather than re-running.
--   Backfill:         N/A — new table, no rows, nothing to conform.
--   Rollback plan:    reversible; run in this order (dependents first):
--                       DROP POLICY IF EXISTS "nyx-vet-documents: owner insert" ON storage.objects;
--                       DROP POLICY IF EXISTS "nyx-vet-documents: owner select" ON storage.objects;
--                       DROP POLICY IF EXISTS "nyx-vet-documents: owner update" ON storage.objects;
--                       DROP TRIGGER IF EXISTS trg_vet_documents_pet_scope ON public.vet_documents;
--                       DROP TRIGGER IF EXISTS trg_vet_documents_updated_at ON public.vet_documents;
--                       DROP FUNCTION IF EXISTS enforce_vet_document_pet_scope();
--                       DROP TABLE IF EXISTS public.vet_documents;
--                     Rolling back DESTROYS every stored document row (the objects
--                     survive in the bucket, orphaned). Safe today at 0 rows; after
--                     VF-3 ships it is real data loss — back up first.
--
-- PREREQUISITE — the nyx-vet-documents bucket ALREADY EXISTS (dashboard-created
-- per the B-124 rule, verified live 2026-07-26: private, file_size_limit
-- 15728640, allowed_mime_types {image/jpeg,image/png,image/heic,application/pdf},
-- 0 policies, 0 objects). This migration NEVER creates it — a SQL-created bucket
-- lands with owner = NULL and its RLS then fails with 42501 no matter how correct
-- the policies are (the landmine documented in 008/021/CLAUDE.md). Private is the
-- load-bearing half: a public bucket's read route bypasses RLS entirely, so every
-- policy below would be decoration.
-- ============================================================


-- ============================================================
-- 1. The table
-- ============================================================
CREATE TABLE vet_documents (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id            UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  -- Optional link, never minted by an upload (D7). SET NULL so deleting a visit
  -- unlinks its documents instead of destroying them.
  vet_visit_id      UUID REFERENCES vet_visits(id) ON DELETE SET NULL,
  -- §4.4 page grouping; equals id for a single-page document.
  document_group_id UUID NOT NULL,
  kind              TEXT NOT NULL DEFAULT 'other',
  -- NULL = never named by the owner. See the header — this is what the one-tap
  -- Name affordance keys on, so the client renders the default title and does
  -- not store it.
  title             TEXT,
  document_date     DATE,
  notes             TEXT,
  source            TEXT NOT NULL,
  storage_path      TEXT NOT NULL,
  mime_type         TEXT NOT NULL,
  file_size_bytes   INTEGER,
  page_index        SMALLINT NOT NULL DEFAULT 0,
  deleted_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT vet_documents_kind_check CHECK (kind IN (
    -- §4.5, ordered by the §2 continuity-of-care ranking, not alphabetically.
    'lab_result',
    'vaccination',
    'visit_summary',
    'imaging',
    'prescription',
    'referral',
    'invoice_estimate',
    'insurance',
    'correspondence',
    'other'
  )),
  CONSTRAINT vet_documents_source_check CHECK (source IN ('camera', 'photo_library', 'files')),
  CONSTRAINT vet_documents_mime_type_check CHECK (mime_type IN (
    'image/jpeg', 'image/png', 'image/heic', 'application/pdf'
  )),
  -- The 043-style path binding, on day one. See the header for the pet_id
  -- NOT NULL dependency that silently voids it.
  CONSTRAINT vet_documents_storage_path_pet_prefix
    CHECK (starts_with(storage_path, pet_id::text || '/')),
  CONSTRAINT vet_documents_page_index_check CHECK (page_index >= 0),
  CONSTRAINT vet_documents_file_size_check CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0)
);

-- One row, one object (see the header). Also the index that lets the
-- delete-account purge and any future orphan sweep look a path up directly.
CREATE UNIQUE INDEX idx_vet_documents_storage_path ON vet_documents(storage_path);

-- The library read: "this pet's documents, newest first" (§4.1 reverse-chron).
-- Deliberately NOT partial on `deleted_at IS NULL`, even though every list read
-- filters soft-deleted rows out: a partial index cannot serve the pets-cascade
-- delete, which must find ALL rows including the soft-deleted ones, and an
-- unindexed FK is exactly what get_advisors flags. One non-partial index serves
-- both; at this table's row counts the extra filter step is free.
CREATE INDEX idx_vet_documents_pet ON vet_documents(pet_id, document_date DESC, created_at DESC);

-- FK coverage for vet_visits (the ON DELETE SET NULL scan), and the "documents
-- filed under this visit" read VF-4 will want. Partial because the column is
-- NULL for most rows — a visit link is optional and deferrable by design (D7).
CREATE INDEX idx_vet_documents_visit ON vet_documents(vet_visit_id) WHERE vet_visit_id IS NOT NULL;

-- The detail-view page fetch (§4.4 swipeable stack), and the lookup the same-pet
-- trigger below performs on every write.
CREATE INDEX idx_vet_documents_group ON vet_documents(document_group_id, page_index);

-- Reuse set_updated_at() from 001_schema.sql, as every mutable table since 016
-- does, so a server write stamps updated_at = NOW() and the local mirror has a
-- real server-time last-write-wins basis rather than a client clock.
CREATE TRIGGER trg_vet_documents_updated_at
  BEFORE UPDATE ON vet_documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- 2. Row Level Security
-- ============================================================
-- Default-deny, per-pet owner scope (§6.2), same shape as vet_visits_owner.
--
-- SPLIT INTO THREE VERBS RATHER THAN `FOR ALL`, and the missing verb is the
-- decision. Every table in this repo before 041 used `FOR ALL`, which grants the
-- owner a HARD DELETE — and 041's header recorded that as debt on diet_trial_foods
-- precisely because 040 declared those rows must only ever be soft-removed. This
-- table has the same rule (deleted_at, the house soft-delete convention) and no
-- client path that needs a hard delete: a delete is an UPDATE setting deleted_at,
-- account deletion runs the FK CASCADE under the service role (RLS-exempt), and
-- the eventual retention purge of soft-deleted rows is a server-side sweep. So
-- DELETE is withheld by default-deny rather than granted and then contradicted by
-- convention. A new table is the only cheap moment to get this right; inheriting
-- 041's debt here would just be copying a known bug forward.
--
-- The WITH CHECK on INSERT/UPDATE is not ceremony: without it, UPDATE's USING
-- clause would admit the row and let an owner RE-POINT `pet_id` at a pet they do
-- not own, moving a document out of their own account. USING gates which rows you
-- may touch; WITH CHECK gates what they may become.
--
-- `auth.uid()` is wrapped in `(select …)` so it is evaluated once per statement
-- rather than once per row (the auth_rls_initplan lint), matching 040/041.
ALTER TABLE vet_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vet_documents_owner_select" ON vet_documents
  FOR SELECT USING (
    pet_id IN (SELECT id FROM pets WHERE user_id = (select auth.uid()))
  );

CREATE POLICY "vet_documents_owner_insert" ON vet_documents
  FOR INSERT WITH CHECK (
    pet_id IN (SELECT id FROM pets WHERE user_id = (select auth.uid()))
  );

CREATE POLICY "vet_documents_owner_update" ON vet_documents
  FOR UPDATE USING (
    pet_id IN (SELECT id FROM pets WHERE user_id = (select auth.uid()))
  )
  WITH CHECK (
    pet_id IN (SELECT id FROM pets WHERE user_id = (select auth.uid()))
  );

-- DELETE: deliberately NOT created. See above — soft delete only.


-- ============================================================
-- 3. Same-pet integrity guard (the 023 / 041 mechanism)
-- ============================================================
-- ⚠ SUPERSEDED BY MIGRATION 045. The body below is what was applied by THIS
-- migration and is left verbatim so the record stays honest (and so 045's rollback
-- has something to restore). 045 replaces it because the VF-1 rls-privacy-reviewer
-- executed three holes in it against a real Postgres replay: check (b) was
-- SECURITY INVOKER and therefore RLS-blind across accounts, which — unlike check
-- (a) — made it fail OPEN; the same check raced under concurrent transactions; and
-- `storage_path` was mutable, so one RLS-legal UPDATE orphaned the stored object
-- from every deletion purge. Read 045 before changing anything here.
-- TWO references on this table are constrained by neither USING nor WITH CHECK,
-- for the same reason 040 left `diet_trial_id` open: an RLS policy gates which
-- ROW you may write, never the CONTENTS of a column, and FOREIGN KEY CHECKS
-- BYPASS RLS — a bare FK verifies only that the target EXISTS.
--
--   (a) vet_visit_id. Nothing compares the visit's pet_id to the row's, so an
--       owner with two pets can file Pet A's document against Pet B's visit. The
--       harm is the multi-pet bleed personas.md warns about, landing in a
--       vet-facing surface: VF-4 renders the linked visit's clinic and date on the
--       document, and when B-480 eventually attaches documents to a report, the
--       wrong pet's paperwork travels with it. Cross-ACCOUNT is worse and quieter:
--       naming another account's visit id means THEIR visit deletion silently
--       unlinks THIS owner's document (ON DELETE SET NULL), with no user action
--       and no trace — the exact "silent shrink" 041 measured on diet_trial_foods.
--
--   (b) document_group_id. Not an FK at all, so nothing constrains it whatsoever.
--       Two documents under different pets sharing a group id would render each
--       other's pages inside one swipeable stack (§4.4) — one pet's bloodwork
--       appearing as page 2 of another pet's vaccination record. Reads are
--       pet-scoped so this cannot cross ACCOUNTS, but within a multi-pet household
--       it is a silent cross-pet mix in exactly the artifact a vet reads. D13's
--       duplicate-on-add is the flow that would produce it if it ever forgot to
--       mint a fresh group id for the copy; this makes forgetting impossible
--       rather than merely reviewed.
--
-- WHY A TRIGGER AND NOT MORE `WITH CHECK` PREDICATES. A policy binds
-- `authenticated` only; every service-role caller bypasses it entirely. 023 chose
-- a BEFORE trigger deliberately because it "runs server-side on every write
-- regardless of client, so the boundary does not depend on the write path
-- remembering to enforce it." That applies here verbatim: delete-account holds the
-- service role today, and §7 contemplates Phase-2 readers/writers over this corpus.
-- A WITH CHECK would leave all of them able to write the corrupt row. (It is also
-- the only tool available for (b), which has no FK to hang a predicate on.)
--
-- WHY CHECKING THE PET IS SUFFICIENT. `pets.user_id` makes a pet unique to one
-- owner and `NEW.pet_id` is already RLS-verified as the writer's pet, so
-- same-pet ⟹ same-owner: one check closes both the cross-pet and the
-- cross-account case. 023's argument, and it holds under either security context.
--
-- `search_path` is pinned to '' and both lookups are schema-qualified, so this
-- cross-table read cannot be redirected by a caller-controlled search_path.
--
-- Cost: at most two indexed lookups per write — a PK lookup on vet_visits.id
-- (skipped entirely by the NULL fast path, which is the common case), and a
-- leading-column scan of idx_vet_documents_group.
CREATE OR REPLACE FUNCTION enforce_vet_document_pet_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- (a) An optional link, so NULL is the fast path and the common case.
  IF NEW.vet_visit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.vet_visits v
    WHERE v.id = NEW.vet_visit_id
      AND v.pet_id = NEW.pet_id
  ) THEN
    RAISE EXCEPTION
      'vet_visit_id % must reference a vet visit for the same pet (%)',
      NEW.vet_visit_id, NEW.pet_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- (b) Every page of one document group belongs to one pet. `d.id <> NEW.id` so
  -- an UPDATE of an existing row never trips over itself.
  IF EXISTS (
    SELECT 1
    FROM public.vet_documents d
    WHERE d.document_group_id = NEW.document_group_id
      AND d.id <> NEW.id
      AND d.pet_id <> NEW.pet_id
  ) THEN
    RAISE EXCEPTION
      'document_group_id % already belongs to a different pet (row pet is %)',
      NEW.document_group_id, NEW.pet_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_vet_documents_pet_scope
  BEFORE INSERT OR UPDATE ON vet_documents
  FOR EACH ROW EXECUTE FUNCTION enforce_vet_document_pet_scope();


-- ============================================================
-- 4. Storage policies — nyx-vet-documents
-- ============================================================
-- The bucket exists and holds 0 policies, so RLS on storage.objects currently
-- denies every authenticated caller against it (default-deny). These three grants
-- are the entire access boundary, and they are the SAME family as 021/025/033/
-- 036/042/043 — first folder segment ∈ the caller's own pet ids.
--
-- Path convention, written at one call site (lib/vetDocuments.ts buildVetDocumentPath):
--   {pet_id}/{document_id}.{ext}
-- The leading {pet_id} is the ownership boundary, mirroring nyx-event-attachments
-- (025) and nyx-vet-attachments (043) rather than the {user_id}/… of
-- nyx-medication-photos (021). So ownership reads "that pet belongs to auth.uid()",
-- which is the same subquery the table policies above use.
--
-- Path handling, inherited from 043 and re-verified rather than assumed:
--   • Compared as text (`id::text`) so a malformed first segment simply fails to
--     match instead of raising a uuid cast error inside a policy (a `::uuid`
--     formulation would turn a hostile key into a 500).
--   • Exact set membership via `IN`, never a prefix match, so one pet id can never
--     be a string prefix of another.
--   • A key with no '/' has an empty folder list, so `(storage.foldername(name))[1]`
--     is NULL, the predicate is not TRUE, and the write is denied.
--   • The subquery filters `user_id = auth.uid()` itself, so these policies do not
--     depend on the `pets` table's own RLS staying correct.
--
-- Live implementation of storage.foldername on this project (read back, because
-- Supabase has shipped more than one): string_to_array(name, '/') returning the
-- segments BEFORE the final one. So `[1]` is the first FOLDER, and the no-slash
-- case fails closed.
--
-- Hostile-key table — every one fails closed, only the legitimate shape passes,
-- against both the storage predicate and the table CHECK:
--   {petId}/{docId}.pdf        → allow  / allow   ← the only legitimate shape
--   doc.pdf          (no '/')  → NULL   / false
--   {petId}          (bare id) → NULL   / false
--   /{petId}/d.pdf             → false  / false   (first segment is '')
--   ../{petId}/d.pdf           → false  / false   (first segment is '..')
--   "{petId} /d.pdf"           → false  / false   (trailing-space near-miss)
--   {PETID}/d.pdf    (upper)   → false  / false   (no case folding)
--   {petId}X/d.pdf             → false  / false   (id as a string PREFIX — the
--                                                  `IN` set membership is what
--                                                  makes this a miss)
--
-- The one shape that passes both and is still not what it looks like:
--   {petId}/../{victimPetId}/d.pdf → allow / allow
-- Its first folder segment IS a pet the caller owns, and starts_with is a PREFIX
-- test. 043 recorded this residual for nyx-vet-attachments and reasoned it deletes
-- nothing because storage.objects.name is an OPAQUE literal that neither
-- storage-api nor S3 resolves — true, but a boundary that holds on a third-party
-- implementation detail we do not own and do not test.
--
-- So this row of the table is a REAL residual at the SQL layer, and it is not
-- closed by anything in this file. What closes it is `scopeVetDocumentPaths`
-- (delete-account/plan.ts), which drops the string before the service-role remove()
-- ever sees it.
--
-- ⚠ AND THE MECHANISM THERE IS THE WHOLE-SHAPE TEST, NOT A FIRST-SEGMENT TEST.
-- An earlier revision of this header claimed exact first-segment set membership
-- closed it, copying scopeFoodPaths. That was wrong, and the VF-1
-- rls-privacy-reviewer executed it to prove so: in `{ownPetId}/../{victim}/x.pdf`
-- the FIRST segment genuinely IS `{ownPetId}` — the `..` is the SECOND segment — so
-- a first-segment filter keeps the path and changes nothing. The guard therefore
-- requires the full `{pet_id}/{document_id}.{ext}` shape (exactly two segments),
-- which drops every traversal variant by construction. Recorded here rather than
-- quietly corrected, because a migration header is the permanent record the next
-- reviewer in this family will trust — and this one was briefly wrong.
--
-- The durable fix, if this is ever revisited, is to tighten the CHECK below to a
-- full-shape regex: a CHECK binds the SERVICE ROLE too, whereas the scope function
-- guards one caller. Filed rather than done here (see B-510) — 044 is applied, and
-- tightening a CHECK is a different risk profile from adding one.
--
-- ORDERING — the B-358 trap does not bite here. 036 could not owner-scope
-- nyx-food-photos' INSERT until the client was reordered, because the photo was
-- uploaded BEFORE the owner-locked row existed, so the ownership subquery 42501'd
-- every upload. Checked here: the first path segment is a PET id, and every pets
-- row is created by a DIRECT, awaited Supabase insert (app/onboarding/pet-*.tsx,
-- app/add-pet.tsx) — pets are never queued through the offline mirror — so the row
-- the subquery needs is committed server-side long before any document upload. No
-- client reorder precedes this migration.
--
-- DELETE: deliberately NOT granted, matching 043 and the table policies above. No
-- client path removes a document object — an owner delete is a soft delete (an
-- UPDATE setting deleted_at), account deletion purges with the service role (which
-- bypasses RLS entirely), and the eventual retention sweep of soft-deleted objects
-- is likewise server-side (the B-249 decision). Granting an unused verb is not
-- hardening. If a hard "remove this object now" affordance is ever built, it needs
-- this policy and its absence will fail loudly at development time:
--
--   CREATE POLICY "nyx-vet-documents: owner delete"
--     ON storage.objects FOR DELETE TO authenticated
--     USING (
--       bucket_id = 'nyx-vet-documents'
--       AND (storage.foldername(name))[1] IN (
--         SELECT id::text FROM public.pets WHERE user_id = auth.uid()
--       )
--     );

-- Idempotent: safe to re-run. The delete drop is defensive — no such policy is
-- created below, but naming it means a re-run after a future hand-added one still
-- converges on this file's set.
DROP POLICY IF EXISTS "nyx-vet-documents: owner insert" ON storage.objects;
DROP POLICY IF EXISTS "nyx-vet-documents: owner select" ON storage.objects;
DROP POLICY IF EXISTS "nyx-vet-documents: owner update" ON storage.objects;
DROP POLICY IF EXISTS "nyx-vet-documents: owner delete" ON storage.objects;

-- INSERT: a user may upload ONLY under one of their own pets' {pet_id}/ prefixes.
-- This mirrors the table's storage_path CHECK at the storage layer, so a path for
-- a pet the user does not own is rejected before an object is ever written.
CREATE POLICY "nyx-vet-documents: owner insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'nyx-vet-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.pets WHERE user_id = auth.uid()
    )
  );

-- SELECT: a user may read ONLY their own pets' documents. Needed for three
-- distinct reasons, not just the obvious one:
--   (1) the signed-URL read path VF-2 ships — createSignedUrl runs under the
--       owner's JWT and is gated by this policy;
--   (2) Postgres applies SELECT policies to a RETURNING clause, and storage-api's
--       upsert path reads the existing row and returns the written one — the
--       bucket-with-no-SELECT-policy trap 042 documented as its finding 3;
--   (3) it is what makes a cross-tenant probe return uniform not-found (AC 7).
CREATE POLICY "nyx-vet-documents: owner select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'nyx-vet-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.pets WHERE user_id = auth.uid()
    )
  );

-- UPDATE: covers the upsert-overwrite path. lib/storage.ts uploadPhoto uploads
-- with `upsert: true`, and the offline push flush re-uploads the SAME key whenever
-- a prior attempt left synced = 0 (e.g. the object landed but the row upsert
-- failed). A first upload is an INSERT; a re-upload over an existing key is an
-- UPDATE, so INSERT-only would make that retry fail — the latent bug 043 found on
-- its own bucket, avoided here rather than inherited.
--
-- The WITH CHECK half is load-bearing, not ceremony: storage-api implements
-- `move()` as an UPDATE of objects.name, so a USING-only grant would let an owner
-- re-home one of their own objects INTO another owner's {pet_id}/ prefix. WITH
-- CHECK forbids the destination as well as the source.
CREATE POLICY "nyx-vet-documents: owner update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'nyx-vet-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.pets WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'nyx-vet-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.pets WHERE user_id = auth.uid()
    )
  );


-- ============================================================
-- 5. Documentation
-- ============================================================
COMMENT ON TABLE vet_documents IS
  'B-478 Vet Files §5.1 (D3): a per-pet, owner-held library of vet-facing documents — lab PDFs, vaccination certificates, discharge summaries, clinic correspondence. Distinct from vet_visit_attachments (which is a per-visit photo attach with a NOT NULL visit FK and no metadata). v1 is store + browse + share; AI over this corpus is Phase 2 and gated on the D8 ruling, so no Edge Function reads these rows today.';

COMMENT ON COLUMN vet_documents.vet_visit_id IS
  'B-478 D7 (the report-window protection rule): an OPTIONAL link to an existing visit. Uploading a document must NEVER create, date or re-date a vet_visits row — the vet report''s scope cascade keys rung 1 off vet_visits.visited_at, so a minted visit would silently move the report window. A document may link to a visit; it may never mint one. ON DELETE SET NULL so deleting a visit unlinks rather than destroys.';

COMMENT ON COLUMN vet_documents.document_group_id IS
  'B-478 §4.4: N pages that are ONE document (an email thread of screenshots, a multi-page discharge sheet). Equals id for a single-page document. Not an FK — there is no document-group entity — so its same-pet integrity is enforced by enforce_vet_document_pet_scope() rather than by a constraint.';

COMMENT ON COLUMN vet_documents.title IS
  'B-478 D11/§4.1: NULL means the owner has never named this document, which is the EXPECTED steady state — capture is zero-decision and asks nothing. The default title ("Document — {date}") is rendered by the client, never stored, so the one-tap Name affordance can tell a defaulted row from a named one.';

COMMENT ON COLUMN vet_documents.document_date IS
  'B-478 §5.1: the date ON the document (when the bloodwork was drawn), which is the clinically meaningful one — deliberately distinct from created_at (when it was filed). DATE, not TIMESTAMPTZ, because documents carry dates, not times.';

COMMENT ON COLUMN vet_documents.storage_path IS
  'B-478 §5.2 / D4: {pet_id}/{document_id}.{ext}. The leading pet segment is the ownership boundary enforced three ways — this column''s CHECK, the nyx-vet-documents Storage policies, and scopeVetDocumentPaths in delete-account. UNIQUE because one row means one object, which is what makes the account-deletion purge count verifiable (AC 8).';

COMMENT ON FUNCTION enforce_vet_document_pet_scope() IS
  'B-478 VF-1: defense-at-rest guard over the two references RLS cannot constrain — vet_visit_id (a bare FK; FK checks bypass RLS, so it would accept another pet''s or another account''s visit) and document_group_id (no FK at all, so a shared group id would render one pet''s pages inside another pet''s document). A trigger rather than policy predicates because service-role callers bypass RLS entirely; mirrors enforce_diet_trial_food_same_pet() (041) and enforce_dose_paired_event_same_pet() (023).';
