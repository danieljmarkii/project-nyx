-- ============================================================
-- Per-Account Food & Medication Library — Re-scoping Migration (B-354, PR 1)
-- See: docs/nyx-per-account-food-library-requirements.md §10 (PR plan),
--      §4 FR-1..FR-4 (the requirements this implements), §2 (current state),
--      §9 D1/D2/D3/D4 (PM-ratified 2026-07-16).
-- ============================================================
-- `food_items` and `medication_items` were built as GLOBALLY-scoped shared
-- catalogs (no user_id; created_by_user_id was attribution only). The PM has
-- ratified (2026-07-16) that the library goes PER-ACCOUNT now, with a curated
-- shared/canonical layer returning later as a SEPARATE table (FR-9) — never by
-- un-scoping user rows again.
--
-- Ownership model this establishes (documented for future readers):
--   created it = owns it = the only account that can see it.
-- `created_by_user_id` stops being attribution and BECOMES the ownership scope
-- (Dir. of Eng call D3: scope in place rather than add a redundant owner column —
-- deployed clients already write created_by_user_id on every insert/upsert path,
-- so keeping the name is the zero-breakage choice; a parallel owner column that
-- must always equal the creator is two names for one fact).
--
-- What this migration does (food_items AND medication_items, D2):
--   FR-1  created_by_user_id -> NOT NULL, DEFAULT auth.uid(), FK SET NULL->CASCADE
--   FR-2  drop 004's permissive food_items policies; rewrite all RLS to owner-only
--   FR-3  food_items UPC uniqueness: global -> per-account (created_by_user_id, upc)
--   FR-4  nyx-food-photos Storage: SELECT scoped to the owner of the food the path
--         names (see the INSERT note below — deliberately NOT scoped here)
--
-- medication photos (nyx-medication-photos) are ALREADY owner-locked by a
-- per-user path prefix (021) — verified at build; no change needed (FR-4 "same-
-- class treatment IF similarly open" — they are not open).
--
-- ------------------------------------------------------------
-- FR-4 INSERT deviation — BUILD-TIME DISCOVERY, flagged for PM/T&S ratification
-- ------------------------------------------------------------
-- The requirements' FR-4 asks to scope BOTH the storage INSERT and SELECT to the
-- food's owner via an ownership subquery on the first path segment (the
-- food_items.id). The client capture flow (app/food-capture.tsx
-- runUploadAndExtract) UPLOADS the photos to `{foodId}/…` BEFORE it inserts the
-- pending food_items row. An ownership-subquery INSERT policy resolves that
-- subquery against a row that does not exist yet -> EVERY food-photo upload would
-- fail 42501, not just cross-tenant ones. A path-based INSERT ownership check is
-- structurally incompatible with the current `{foodId}/…` scheme + upload-first
-- ordering (which is exactly why the spec's own rejected alternative was
-- `{uid}/{foodId}/…` paths).
--
-- The actual launch blocker (§1) is the cross-tenant SELECT: any authed user can
-- READ every other account's food label photos. That is closed here. The INSERT
-- integrity gap is far narrower now that everything else is locked: an attacker
-- cannot read the object back (SELECT scoped), cannot reference a foreign photo
-- from their catalog (food_items rows are owner-locked, FR-2), and would have to
-- guess an unguessable UUID foodId. So INSERT stays authenticated+bucket-scoped
-- (unchanged from 008 in effect) to avoid breaking the live upload path in a
-- schema-only PR. Fully closing INSERT requires either the PR-2 client reorder
-- (insert-then-upload) or a `{uid}/…` path migration; tighten the INSERT policy
-- together with that client change. Flagged for PM + rls-privacy-reviewer.
--
-- ------------------------------------------------------------
-- Migration Safety Pre-flight
-- ------------------------------------------------------------
--   Destructive y/n:  n. Additive constraints (NOT NULL/DEFAULT), an FK
--                     re-point (SET NULL -> CASCADE, no data change), a UNIQUE
--                     swap (global -> composite), and RLS/Storage policy
--                     rewrites. No column, table, type, or row is dropped or
--                     retyped; no row data is mutated.
--   Affected tables:  food_items (56 rows), medication_items (2 rows).
--   Backfill:         Defensive no-op. created_by_user_id is already non-null on
--                     every row (0/0 null-creators, verified this session), so
--                     NOT NULL needs no backfill. The DO-block below ABORTS the
--                     whole migration if that assumption is ever violated on
--                     apply — a null-creator row cannot be owned, so scope-in-
--                     place must refuse rather than silently orphan it.
--   Row-count check the PM should run before applying (expect 0 / 0):
--                     SELECT
--                       (SELECT count(*) FROM food_items       WHERE created_by_user_id IS NULL),
--                       (SELECT count(*) FROM medication_items WHERE created_by_user_id IS NULL);
--   Rollback plan:
--     -- food_items
--     ALTER TABLE food_items ALTER COLUMN created_by_user_id DROP NOT NULL;
--     ALTER TABLE food_items ALTER COLUMN created_by_user_id DROP DEFAULT;
--     ALTER TABLE food_items DROP CONSTRAINT food_items_created_by_user_id_fkey;
--     ALTER TABLE food_items ADD  CONSTRAINT food_items_created_by_user_id_fkey
--       FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
--     ALTER TABLE food_items DROP CONSTRAINT food_items_created_by_upc_key;
--     ALTER TABLE food_items ADD  CONSTRAINT food_items_upc_barcode_key UNIQUE (upc_barcode);
--     -- (then restore the pre-migration policies: 001 read/insert/update,
--     --  004 permissive insert/update, 009 delete; 008 food-photo insert/select)
--     -- medication_items: symmetric (drop NOT NULL/DEFAULT, FK back to SET NULL,
--     --  restore 020 policies). No UPC constraint on meds.
-- ============================================================


-- ============================================================
-- 0. Backfill pre-check — refuse to proceed if the ownership assumption breaks
-- ============================================================
-- Scope-in-place requires a non-null owner on every row. Data is clean today
-- (0 null-creators on both tables), but assert it at apply time rather than
-- trust the snapshot — a null here would become a NOT NULL violation mid-DDL
-- with a far less legible error, or (worse, if we defaulted) silently mis-owned.
DO $$
DECLARE
  food_nulls INT;
  med_nulls  INT;
BEGIN
  SELECT count(*) INTO food_nulls FROM food_items       WHERE created_by_user_id IS NULL;
  SELECT count(*) INTO med_nulls  FROM medication_items WHERE created_by_user_id IS NULL;
  IF food_nulls > 0 OR med_nulls > 0 THEN
    RAISE EXCEPTION
      'B-354 backfill assumption violated: % food_items and % medication_items rows have NULL created_by_user_id. A null-creator row cannot be owned; resolve (assign an owner or delete) before re-applying.',
      food_nulls, med_nulls;
  END IF;
END $$;


-- ============================================================
-- 1. FR-1 — ownership scope on the catalog columns
-- ============================================================
-- DEFAULT auth.uid() mirrors the existing insert WITH CHECK (auth.uid() =
-- created_by_user_id): a client that forgets to set the column still writes an
-- owned row rather than a null-creator orphan. NOT NULL makes ownership total.
-- FK SET NULL -> CASCADE: a food/med row IS its creator's data now (it was
-- shared-catalog data before), so deleting the account deletes its catalog rows
-- (this is also what FR-7 / delete-account's purge flip relies on in PR 4).

-- food_items
ALTER TABLE food_items ALTER COLUMN created_by_user_id SET DEFAULT auth.uid();
ALTER TABLE food_items ALTER COLUMN created_by_user_id SET NOT NULL;
ALTER TABLE food_items DROP CONSTRAINT food_items_created_by_user_id_fkey;
ALTER TABLE food_items ADD  CONSTRAINT food_items_created_by_user_id_fkey
  FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- medication_items (D2 — same track, same treatment; drug names are a more
-- sensitive exposure class than foods, so this is if anything more urgent).
ALTER TABLE medication_items ALTER COLUMN created_by_user_id SET DEFAULT auth.uid();
ALTER TABLE medication_items ALTER COLUMN created_by_user_id SET NOT NULL;
ALTER TABLE medication_items DROP CONSTRAINT medication_items_created_by_user_id_fkey;
ALTER TABLE medication_items ADD  CONSTRAINT medication_items_created_by_user_id_fkey
  FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


-- ============================================================
-- 2. FR-2 — RLS rewrite: default-deny to other accounts
-- ============================================================
-- The 004 permissive policies (WITH CHECK (true) / USING (true)) OR-combine with
-- (and swallow) the 001 creator checks — so today ANY authed user can INSERT or
-- UPDATE ANY food row. They must be DROPPED, not merely supplemented: same-command
-- policies OR together, so a new restrictive policy is dead until 004's are gone.
-- We drop every existing policy on each table and recreate a clean owner-only set
-- keyed on `created_by_user_id = auth.uid()` for all four commands.
--
-- This also closes B-343's client half for free: the food-detail edit can no
-- longer reach another account's row.

-- food_items — drop all existing policies (001 + 004 + 009)
DROP POLICY IF EXISTS "food_items_read"                            ON food_items;
DROP POLICY IF EXISTS "food_items_insert"                          ON food_items;
DROP POLICY IF EXISTS "food_items_update"                          ON food_items;
DROP POLICY IF EXISTS "food_items_delete"                          ON food_items;
DROP POLICY IF EXISTS "Authenticated users can insert food items"  ON food_items;
DROP POLICY IF EXISTS "Authenticated users can update food items"  ON food_items;

CREATE POLICY "food_items_read" ON food_items
  FOR SELECT USING (created_by_user_id = auth.uid());

CREATE POLICY "food_items_insert" ON food_items
  FOR INSERT WITH CHECK (created_by_user_id = auth.uid());

-- WITH CHECK added (001's update policy had none): also blocks re-homing a row
-- to another account via UPDATE, not just editing a foreign row.
CREATE POLICY "food_items_update" ON food_items
  FOR UPDATE USING (created_by_user_id = auth.uid())
             WITH CHECK (created_by_user_id = auth.uid());

CREATE POLICY "food_items_delete" ON food_items
  FOR DELETE USING (created_by_user_id = auth.uid());

-- medication_items — 020 kept these strict (creator-locked writes) but SELECT was
-- still GLOBAL (auth.role()='authenticated'). Rewriting SELECT to owner-only is
-- the behavioural change; insert/update/delete are re-stated for symmetry, with
-- WITH CHECK added on update for the same re-home guard as foods.
DROP POLICY IF EXISTS "medication_items_read"   ON medication_items;
DROP POLICY IF EXISTS "medication_items_insert" ON medication_items;
DROP POLICY IF EXISTS "medication_items_update" ON medication_items;
DROP POLICY IF EXISTS "medication_items_delete" ON medication_items;

CREATE POLICY "medication_items_read" ON medication_items
  FOR SELECT USING (created_by_user_id = auth.uid());

CREATE POLICY "medication_items_insert" ON medication_items
  FOR INSERT WITH CHECK (created_by_user_id = auth.uid());

CREATE POLICY "medication_items_update" ON medication_items
  FOR UPDATE USING (created_by_user_id = auth.uid())
             WITH CHECK (created_by_user_id = auth.uid());

CREATE POLICY "medication_items_delete" ON medication_items
  FOR DELETE USING (created_by_user_id = auth.uid());


-- ============================================================
-- 3. FR-3 — UPC uniqueness goes per-account (food_items only)
-- ============================================================
-- Global UNIQUE (upc_barcode) -> UNIQUE (created_by_user_id, upc_barcode). Two
-- households scanning the same bag each get their own row (that IS the model
-- now); one household scanning the same bag twice still collides into B-009's
-- within-account dedup flow. NULL upc_barcode stays multi-row-safe (NULLs are
-- distinct in a UNIQUE constraint). Pre-verified: 0 per-creator UPC dupes, so
-- the composite constraint applies cleanly with no data cleanup.
--
-- The 007 partial index idx_food_items_upc_barcode (WHERE upc_barcode IS NOT
-- NULL) is intentionally KEPT — it still serves within-account barcode lookups.
-- medication_items has no upc_barcode column, so no per-account UPC work there.
ALTER TABLE food_items DROP CONSTRAINT food_items_upc_barcode_key;
ALTER TABLE food_items ADD  CONSTRAINT food_items_created_by_upc_key
  UNIQUE (created_by_user_id, upc_barcode);


-- ============================================================
-- 3b. Supporting index for the new per-account RLS predicate
-- ============================================================
-- created_by_user_id is now the hot scoping predicate on EVERY per-account read
-- (RLS: created_by_user_id = auth.uid()), and also the FK target for account
-- deletion's CASCADE. food_items is already covered — the FR-3 composite UNIQUE
-- (created_by_user_id, upc_barcode) leads with this column. medication_items has
-- no such index, so add one (get_advisors flagged the uncovered FK once the
-- column became a scoping key). Trivial at today's row counts; correct as
-- accounts grow.
CREATE INDEX IF NOT EXISTS idx_medication_items_created_by
  ON medication_items(created_by_user_id);


-- ============================================================
-- 4. FR-4 — nyx-food-photos Storage: scope reads to the food's owner
-- ============================================================
-- Path convention (lib/storage.ts / app/food-capture.tsx): `{foodItemId}/{slot}.jpg`,
-- so the first path segment is a food_items.id. The SELECT policy resolves that id
-- to its owner and requires it to be auth.uid(). We compare as text (id::text) so a
-- malformed first segment simply fails to match rather than raising a uuid cast
-- error. Edge Functions (service role) bypass RLS and are unaffected —
-- extract-food-from-photo, generate-report, and delete-account all still read.
--
-- INSERT: see the header deviation note — kept authenticated+bucket-scoped to
-- avoid breaking the upload-before-insert capture ordering. Tighten alongside the
-- PR-2 client reorder. SELECT is the launch blocker and IS scoped here.

DROP POLICY IF EXISTS "nyx-food-photos: authenticated insert" ON storage.objects;
DROP POLICY IF EXISTS "nyx-food-photos: authenticated select" ON storage.objects;

-- INSERT: any authenticated user may upload into the bucket (path ownership is
-- established when the owner-locked food_items row is created — the upload
-- precedes that row in the current client flow, so this cannot be a row-lookup).
CREATE POLICY "nyx-food-photos: authenticated insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'nyx-food-photos');

-- SELECT: a user may read a food photo ONLY if they own the food_items row named
-- by the path's first segment. Closes the cross-tenant read of health-adjacent
-- label photos (the §1 launch blocker).
CREATE POLICY "nyx-food-photos: owner select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'nyx-food-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM food_items WHERE created_by_user_id = auth.uid()
    )
  );
