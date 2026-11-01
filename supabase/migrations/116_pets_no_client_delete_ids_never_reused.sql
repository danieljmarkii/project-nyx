-- ============================================================
-- Migration 116: a pet leaves only with its account, and its id never
--   comes back (CUL-2336, CUL-2375)
-- See: CUL-2336 (the issue; PM ruling (a) 2026-11-01T19:29Z; the plan and
--      the PM's go in its build session);
--      CUL-2375 (folded in by the PM 2026-11-01);
--      044_vet_documents.sql (the three-verb policy form, no DELETE);
--      104_pets_server_id.sql (why the server may name a pet's id);
--      114_vet_reports_kept_ids_never_reused.sql (the reserve-at-insert
--      ledger this copies); 115_pets_owner_immutable.sql (pets.user_id).
-- ============================================================
--
-- THE GAPS
-- ------------------------------------------------------------
-- G1 (CUL-2336). `pets_owner` is 001's FOR ALL USING (auth.uid() = user_id),
--    so a client JWT can DELETE its own pet. Its rows cascade away (the saved
--    vet reports included) and its Storage objects stay: `nyx-vet-reports/
--    {petId}/…`, and the pet's photos, event attachments, vet attachments and
--    vet documents. delete-account takes its pet ids from `pets`, so a pet
--    already gone is in neither its row read nor its folder sweep, and the
--    account's erasure reports success over health files it never saw. No
--    app path deletes a pet (archive is `is_active`); the database allowed it.
-- G2 (CUL-2375). As the service role, DELETE FROM pets WHERE id = P (A's
--    pet), then INSERT INTO pets (id, user_id) VALUES (P, B). 104 lets the
--    server choose a pet id; 115 freezes user_id on UPDATE, and this is not
--    an UPDATE. Every pet-keyed Storage policy (025, 044, 103) admits the
--    caller whose pet has id P, so B reads A's photos and vet documents. The
--    same holds for any object left under a dead pet's folder (CUL-2030's
--    measured leftovers): 104 stopped a client claiming those ids, not the
--    server. No function, script or Edge Function does either.
--
-- ------------------------------------------------------------
-- THE FIX
-- ------------------------------------------------------------
-- (a) G1, the PM's ruling (a). `pets_owner` becomes 044's three-verb form:
--     SELECT USING, INSERT WITH CHECK, UPDATE USING + WITH CHECK, each the
--     same predicate as before, so reading, adding, editing, archiving and
--     the weight sync behave exactly as they did. There is no DELETE policy,
--     and DELETE and TRUNCATE on pets are revoked from anon and
--     authenticated, so a client's delete fails loudly (42501) instead of
--     touching 0 rows. A pet now leaves only through account deletion (the
--     auth.users -> pets cascade, which runs as the table's owner and needs
--     no caller privilege) or a server path, which must purge the pet's
--     folders first (none exists).
--     The UPDATE policy keeps 001's semantics on purpose: FOR ALL's USING
--     doubled as its write check, so the new row must still be the caller's.
--     `(select auth.uid())` is evaluated once per statement (the
--     auth_rls_initplan lint, 044's form); the result is the same.
-- (b) G2. public.pet_ids_retired reserves every pet id the moment the pet
--     row is inserted, and never releases it.
--       · AFTER INSERT on pets (reserve_pet_id) writes the reservation. A
--         second INSERT of that id, after any DELETE, under ANY owner, the
--         same one included, hits the table's primary key and is refused,
--         for every role. A pet is never re-created under an old id: the
--         fixture is upsert-only on live rows (an upsert that updates fires
--         no AFTER INSERT trigger), and its ids derive from the account, so
--         a new account gets new ids.
--       · Reserved at INSERT, not at DELETE (114's R1 / R2, measured there):
--         a reservation written at delete is invisible to a second READ
--         COMMITTED session until the first commits, so a delete racing a
--         re-insert would slip through. Here the reservation is committed
--         long before any delete.
--       · AFTER, so it reserves the id as stored: after 104 has replaced a
--         client's id, and after any later-named BEFORE trigger has run.
--       · A reservation that silently did not land (a DO INSTEAD NOTHING
--         rule or a RETURN NULL trigger on the ledger, both owner-only) fails
--         the insert by row count (114's M6 / M14). The row count cannot see
--         a rule that redirects the insert elsewhere, a ledger trigger that
--         rewrites the id, or a dropped primary key: each reports one row and
--         lets a re-insert land (rls-privacy-reviewer pass 1, F1 / F2,
--         measured). Those are owner-only DDL in a later migration, and
--         guards/petIdsNeverReused.test.ts reds on each.
--       · The table is server-only and append-only: RLS on with no policy,
--         every grant revoked, service_role INCLUDED (G2's actor is the
--         service role, so a ledger it could DELETE from would reopen the
--         hole). A trigger refuses UPDATE, DELETE and TRUNCATE on it for
--         every role, so a later SECURITY DEFINER function cannot clear it
--         either. No foreign key: a pet or account deletion does not erase it.
--       · It holds ids only, never an owner: CUL-2375's sketch refused a
--         re-insert "under a different owner", which needs the owner kept
--         after the account is deleted. Refusing every re-insert is stricter
--         and keeps random ids only (114's and 106's retention). Team call
--         under the brief, logged on CUL-2336; the PM can reverse it.
-- (c) Backfill. Every live pet id, plus every uuid-shaped first folder in
--     the five pet-keyed buckets with no pet row (CUL-2030's leftovers), so
--     no server insert can claim an id that already has files.
--
-- SECURITY DEFINER on reserve_pet_id (it writes a table no caller role may
-- touch), search_path '' with every name schema-qualified, EXECUTE revoked
-- from PUBLIC, anon, authenticated and service_role (B-520). One RAISE per
-- guard, one message, naming no value (C-31). 23514, the code this repo's
-- guards raise for a refused write (terminal in lib/sync.ts; no client path
-- sends a pet id: 104 replaces it).
--
-- WHAT ELSE CAN MOVE (C-38):
--   · pets.id: frozen by 104, so a reserved id cannot be renamed away.
--   · pets.user_id: frozen by 115.
--   · The policy predicates: unchanged from 001.
--   · TRIGGER on pets: revoked from the API roles by 115, so none of them
--     can replace or narrow trg_pets_reserve_id. TRIGGER on the ledger goes
--     with REVOKE ALL below.
--
-- STATED BLIND SPOTS:
--   · A service-role DELETE FROM pets still removes the pet's rows and
--     leaves its Storage objects. They are now unclaimable (the id is
--     reserved), but not erased, and delete-account cannot see them. No path
--     does it; the orphan sweep is CUL-231, noted there.
--   · A superuser or the migration owner can disable these triggers, drop
--     the policies or set session_replication_role = replica. That is the
--     server's owner; guards/petIdsNeverReused.test.ts reds on a later
--     migration that does it.
--   · The backfill sees only folders that exist at apply time. A pet deleted
--     before 116 whose objects are already gone needs no reservation; one
--     whose objects are added later under a dead id cannot be (only the
--     service role writes Storage for a dead pet, and nothing does).
--   · An uppercase or non-uuid first folder is not reserved. No pet-keyed
--     Storage policy can match one: they compare it to `pets.id::text`,
--     which is always lowercase.
--   · Dynamic SQL in a later migration is invisible to the guard test.
-- (rls-privacy-reviewer on this PR; replayed on local PG16 by
--  scripts/probes/vet-report-116/run.sh.)
--
-- ------------------------------------------------------------
-- MIGRATION SAFETY PRE-FLIGHT
-- ------------------------------------------------------------
--   Destructive: n. One policy replaced by three with the same predicate (no
--                DELETE), DELETE and TRUNCATE revoked from anon and
--                authenticated on pets, one new table, two new functions,
--                three new triggers. No column or row of an existing table
--                changes.
--   Backfill:    §4, inside this file. Before applying, read what it will
--                reserve (expect the pet count, and the orphan-folder count
--                CUL-2030 measured):
--                  SELECT count(*) FROM public.pets;
--                  SELECT count(DISTINCT lower(split_part(o.name, '/', 1)))
--                    FROM storage.objects o
--                   WHERE o.bucket_id IN ('nyx-pet-photos', 'nyx-event-attachments',
--                                         'nyx-vet-attachments', 'nyx-vet-documents',
--                                         'nyx-vet-reports')
--                     AND split_part(o.name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
--                     AND NOT EXISTS (SELECT 1 FROM public.pets p
--                                      WHERE p.id::text = lower(split_part(o.name, '/', 1)));
--   Rollback:    re-opens G1 and G2, so only to unbrick something:
--                  DROP TRIGGER trg_pets_reserve_id ON public.pets;
--                  DROP FUNCTION public.reserve_pet_id();
--                  DROP TRIGGER trg_pet_ids_retired_append_only ON public.pet_ids_retired;
--                  DROP TRIGGER trg_pet_ids_retired_no_truncate ON public.pet_ids_retired;
--                  DROP FUNCTION public.pet_ids_retired_append_only();
--                  DROP TABLE public.pet_ids_retired;
--                  DROP POLICY "pets_owner_select" ON public.pets;
--                  DROP POLICY "pets_owner_insert" ON public.pets;
--                  DROP POLICY "pets_owner_update" ON public.pets;
--                  CREATE POLICY "pets_owner" ON public.pets
--                    FOR ALL USING (auth.uid() = user_id);
--                  GRANT DELETE, TRUNCATE ON public.pets TO anon, authenticated;
--   Ordering:    after 115 (applied, #1392); before VR2-20 (CUL-2300).
--   After:       the VERIFY block at the foot, then get_advisors (security +
--                performance).
-- ============================================================


-- ============================================================
-- §0. Applied by a role that owns the guards
-- ============================================================
-- reserve_pet_id runs as the role applying this file and writes a table no
-- caller role may touch; the backfill reads storage.objects.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles
                 WHERE rolname = current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION '116 must be applied by a role that bypasses RLS';
  END IF;
END $$;


-- ============================================================
-- §1. G1: no client deletes a pet
-- ============================================================
DROP POLICY IF EXISTS "pets_owner" ON public.pets;
DROP POLICY IF EXISTS "pets_owner_select" ON public.pets;
DROP POLICY IF EXISTS "pets_owner_insert" ON public.pets;
DROP POLICY IF EXISTS "pets_owner_update" ON public.pets;

CREATE POLICY "pets_owner_select" ON public.pets
  FOR SELECT USING (user_id = (select auth.uid()));

CREATE POLICY "pets_owner_insert" ON public.pets
  FOR INSERT WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "pets_owner_update" ON public.pets
  FOR UPDATE USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- DELETE: deliberately NOT created (CUL-2336). A pet leaves with its account.
REVOKE DELETE, TRUNCATE ON public.pets FROM anon, authenticated;


-- ============================================================
-- §2. G2: the reservations, every pet id ever used
-- ============================================================
CREATE TABLE public.pet_ids_retired (
  id          uuid PRIMARY KEY,
  reserved_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pet_ids_retired IS
  'CUL-2375 (116): one row per pet id ever used, reserved the moment the pet row is inserted (and, at 116, every id with a pet-keyed Storage folder) and never released, so no pet is ever inserted under that id again, by any role, after any deletion: a dead pet''s Storage folder can never pass to another account. Written only by reserve_pet_id and 116''s backfill. Server-only and append-only (every grant revoked, service_role included; a trigger refuses UPDATE, DELETE and TRUNCATE). No foreign key, no owner: ids only.';

ALTER TABLE public.pet_ids_retired ENABLE ROW LEVEL SECURITY;
-- No policy: default-deny. The grants go too, by name, because this project's
-- default ACL grants each role explicitly and service_role bypasses RLS.
REVOKE ALL ON TABLE public.pet_ids_retired FROM PUBLIC;
REVOKE ALL ON TABLE public.pet_ids_retired FROM anon;
REVOKE ALL ON TABLE public.pet_ids_retired FROM authenticated;
REVOKE ALL ON TABLE public.pet_ids_retired FROM service_role;

CREATE OR REPLACE FUNCTION public.pet_ids_retired_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION
    'pet_ids_retired: a pet id''s reservation is never changed or removed'
    USING ERRCODE = 'check_violation';
END;
$$;

REVOKE ALL ON FUNCTION public.pet_ids_retired_append_only() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pet_ids_retired_append_only() FROM anon;
REVOKE ALL ON FUNCTION public.pet_ids_retired_append_only() FROM authenticated;
REVOKE ALL ON FUNCTION public.pet_ids_retired_append_only() FROM service_role;

CREATE TRIGGER trg_pet_ids_retired_append_only
  BEFORE UPDATE OR DELETE ON public.pet_ids_retired
  FOR EACH ROW EXECUTE FUNCTION public.pet_ids_retired_append_only();

CREATE TRIGGER trg_pet_ids_retired_no_truncate
  BEFORE TRUNCATE ON public.pet_ids_retired
  FOR EACH STATEMENT EXECUTE FUNCTION public.pet_ids_retired_append_only();

COMMENT ON FUNCTION public.pet_ids_retired_append_only() IS
  'CUL-2375 (116): refuses every UPDATE, DELETE and TRUNCATE on pet_ids_retired, for every role, so no later function or server write can release a pet id. SECURITY INVOKER, reads nothing, message names no value (C-31).';


-- ============================================================
-- §3. G2: a pet id is reserved when its pet is inserted
-- ============================================================
CREATE OR REPLACE FUNCTION public.reserve_pet_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  n bigint := 0;
BEGIN
  BEGIN
    INSERT INTO public.pet_ids_retired (id) VALUES (NEW.id);
    GET DIAGNOSTICS n = ROW_COUNT;
  EXCEPTION WHEN unique_violation THEN
    n := 0;
  END;
  IF n <> 1 THEN
    RAISE EXCEPTION 'A pet needs an id never used before'
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_pet_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_pet_id() FROM anon;
REVOKE ALL ON FUNCTION public.reserve_pet_id() FROM authenticated;
REVOKE ALL ON FUNCTION public.reserve_pet_id() FROM service_role;

-- A plain AFTER INSERT row trigger, no WHEN: the guard test pins this shape.
CREATE TRIGGER trg_pets_reserve_id
  AFTER INSERT ON public.pets
  FOR EACH ROW EXECUTE FUNCTION public.reserve_pet_id();

COMMENT ON FUNCTION public.reserve_pet_id() IS
  'CUL-2375 (116): reserves a pet''s id in pet_ids_retired when the pet row is inserted, and refuses the insert if the id was ever used (or had a Storage folder at 116), for every role, so a deleted pet''s id never returns under any owner and its leftover files never pass to another account. AFTER INSERT, so it reserves the id as stored. SECURITY DEFINER (writes a table no caller may touch), search_path pinned, EXECUTE revoked; message names no value (C-31).';


-- ============================================================
-- §4. Backfill: every live pet id, and every dead pet's folder
-- ============================================================
-- After the trigger, so a pet inserted while this runs is either committed
-- before CREATE TRIGGER's lock (and read here) or reserved by the trigger.
INSERT INTO public.pet_ids_retired (id)
SELECT p.id FROM public.pets p
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.pet_ids_retired (id)
SELECT DISTINCT lower(split_part(o.name, '/', 1))::uuid
  FROM storage.objects o
 WHERE o.bucket_id IN ('nyx-pet-photos', 'nyx-event-attachments',
                       'nyx-vet-attachments', 'nyx-vet-documents',
                       'nyx-vet-reports')
   AND split_part(o.name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- VERIFY (read-only, after applying)
-- ============================================================
--   1. The pets policies: three, no DELETE:
--        SELECT policyname, cmd, qual, with_check FROM pg_policies
--         WHERE schemaname = 'public' AND tablename = 'pets' ORDER BY policyname;
--      -> pets_owner_insert INSERT, pets_owner_select SELECT,
--         pets_owner_update UPDATE; no pets_owner, no DELETE or ALL row.
--   2. No client may delete:
--        SELECT has_table_privilege('authenticated', 'public.pets', 'DELETE'),
--               has_table_privilege('anon', 'public.pets', 'DELETE'),
--               has_table_privilege('authenticated', 'public.pets', 'TRUNCATE');
--      -> f, f, f.
--   3. The reservations, closed to every caller role, and complete:
--        SELECT grantee, privilege_type FROM information_schema.role_table_grants
--         WHERE table_schema = 'public' AND table_name = 'pet_ids_retired'
--           AND grantee IN ('anon', 'authenticated', 'service_role');
--      -> no rows.
--        SELECT count(*) FROM public.pets p
--         WHERE NOT EXISTS (SELECT 1 FROM public.pet_ids_retired r WHERE r.id = p.id);
--      -> 0.
--   4. The triggers:
--        SELECT tgrelid::regclass, tgname, tgfoid::regproc FROM pg_trigger
--         WHERE tgname IN ('trg_pets_reserve_id', 'trg_pet_ids_retired_append_only',
--                          'trg_pet_ids_retired_no_truncate')
--         ORDER BY tgname;
--      -> three rows.
--   5. The behaviour: the probe in the PR (scripts/probes/vet-report-116/run.sh).
