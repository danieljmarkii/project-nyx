-- ============================================================
-- Migration 114: a kept vet report is never deleted around its guard, and its
--   id and label are never used again (CUL-2339)
-- See: CUL-2339 (the issue; its plan comment, PM go 2026-11-01);
--      113_vet_report_saved_copies.sql §7a (the delete guard this replaces)
--      and its stated residuals E3 / E4 (rls-privacy-reviewer pass 2, G2);
--      106_food_item_ids_never_reused.sql (the retired-id ledger pattern);
--      104_pets_server_id.sql (why the server may name a pet's id).
-- ============================================================
--
-- THE GAP
-- ------------------------------------------------------------
-- 113 freezes a kept copy for every writer and refuses its direct DELETE, so
-- the copy cannot be deleted and re-inserted with softened content. The DELETE
-- guard told a cascade from a direct delete by pg_trigger_depth() = 1. Two
-- ways round it:
--   E3  A DELETE issued from inside any trigger (another table's, or an AFTER
--       trigger on vet_reports itself) also runs at depth 2, so it passed as a
--       cascade would. The kept row is gone and the same id can be inserted
--       again with a changed snapshot.
--   E4  A server transaction copies the pet aside, deletes it (the cascade
--       passes, as it must), re-inserts it under the same id (104 lets the
--       server choose a pet's id), restores its children and re-inserts the
--       kept copy with a changed snapshot: a full rewrite under the old id.
-- Both need deliberate server code; neither exists. vet_reports holds 0 rows.
--
-- ------------------------------------------------------------
-- THE FIX
-- ------------------------------------------------------------
-- (a) E3. vet_reports_kept_not_deleted() stops reading trigger depth. It
--     refuses a kept row's DELETE while its pet AND its maker both still
--     exist. Every legitimate way a kept copy leaves removes one of them
--     first: a pet deletion (the FK cascade runs after the pet row is gone)
--     or an account deletion (auth.users goes, and pets and vet_reports
--     cascade from it). A DELETE from any trigger or function, at any depth,
--     with both parents present, is refused. Drafts still pass (the draft
--     reaper). TRUNCATE is still refused. It now reads pets and auth.users,
--     which the service role and a client cannot both see, so it is SECURITY
--     DEFINER; its message names no value (C-31).
-- (b) E4. public.vet_report_kept_ids reserves, the moment a row is kept, its
--     id and its (pet_id, upper(short_id)) label, and never releases them.
--       · AFTER INSERT OR UPDATE on vet_reports (reserve_vet_report_kept_id)
--         writes the reservation when a row is inserted kept or moves from
--         draft to kept. A second row kept under a reserved id or label hits
--         the table's unique keys and is refused, for every role, after any
--         pet or account deletion. The reservation exists long before any
--         delete, so two sessions racing a delete against a re-insert have
--         nothing to race (rls-privacy-reviewer pass 1, R1 / R2, measured:
--         this file's first cut wrote its ledger at DELETE, which a second
--         READ COMMITTED session could not see until the first committed).
--         AFTER, so it judges the row as stored, not as a BEFORE trigger
--         left it before a later one edited it (M7). A reservation that
--         silently did not land (a later RETURN NULL trigger or DO INSTEAD
--         rule) fails the keep by row count (M6 / M14).
--       · The table is server-only and append-only. RLS on with no policy,
--         and every grant revoked, service_role INCLUDED: E4's actor is the
--         service role, so a table it could DELETE from would reopen the
--         hole. A trigger refuses UPDATE, DELETE and TRUNCATE on it for every
--         role, so a later SECURITY DEFINER function cannot clear it either.
--         No foreign key: deleting a pet or an account does not erase it.
--     A draft is not reserved: a draft is never sent, and it cannot become
--     kept under a reserved id or label. content_sha256 (113) already pins
--     the stored object's bytes to the row.
--
-- SECURITY DEFINER on both vet_reports functions (the reservation writes a
-- table no caller role may touch; the delete guard reads pets and auth.users), search_path '' with every name schema-qualified, EXECUTE
-- revoked from PUBLIC, anon, authenticated and service_role (B-520; trigger
-- functions cannot be called directly anyway). One RAISE per guard, one
-- message, naming no value (C-31). 23514, the code this repo's guards raise.
--
-- RETENTION (PM, 2026-11-01, plan comment): after an account is deleted the
-- reservations keep a copy's id, its pet's id, its four-character label and
-- the time it was kept. Random ids and a label, no content, no owner; the
-- retention 106 makes for food ids. No client can read it. (The reviewer's
-- note: delete-account's Edge log line names the user id beside its pet
-- ids, so while those logs are kept the rows are pseudonymous, not
-- anonymous; filed on CUL-2339 as a follow-up.)
--
-- STATED BLIND SPOTS:
--   · A superuser can disable any of these triggers or set
--     session_replication_role to replica. That is the server's owner.
--   · A row kept before 114 is not reserved. vet_reports holds 0 rows (read
--     2026-10-31; 113 §0 refused otherwise), so there is none.
--   · E4 with a NEW id and a NEW label still lands: a pet deleted and
--     re-created (under its old id or a new one) can be given a fresh kept
--     copy. That is a new report, not a rewrite of the old one: the old
--     copy's id and label stay reserved, so a vet holding them finds nothing
--     rather than a softer copy. The label is per pet id, so a re-created pet
--     under a NEW id may wear an old label for what is visibly the same
--     animal; the pet id is not shown to anyone. Refusing re-use of a pet id
--     that once held a kept copy belongs to pets (104), not here.
--   · A draft may carry a reserved id or label (it is never sent and can
--     never be kept under it).
--   · A later migration can still add a trigger that rewrites NEW on
--     vet_reports, change a table's owner, or add a rule; the guard test
--     refuses each spelling it names, and a DO block's EXECUTE is invisible
--     to it.
--   · A kept copy whose pet and maker both exist can never be removed except
--     with one of them. That is the rule, not a gap: no path removes one
--     singly (spec §11.3).
-- (rls-privacy-reviewer on this PR; replayed on local PG16 by
--  scripts/probes/vet-report-114/run.sh.)
--
-- ------------------------------------------------------------
-- MIGRATION SAFETY PRE-FLIGHT
-- ------------------------------------------------------------
--   Destructive: n. One new table, two new functions, one function body
--                replaced, three new triggers. No column, row or policy on an
--                existing table changes.
--   Backfill:    N/A. vet_reports holds 0 rows, so nothing is kept yet.
--                Check before applying (expect 0):
--                  SELECT count(*) FROM public.vet_reports;
--   Rollback:    re-opens E3 and E4, so only to unbrick something:
--                  DROP TRIGGER trg_vet_reports_reserve_kept_id ON public.vet_reports;
--                  DROP FUNCTION public.reserve_vet_report_kept_id();
--                  DROP TRIGGER trg_vet_report_kept_ids_append_only ON public.vet_report_kept_ids;
--                  DROP TRIGGER trg_vet_report_kept_ids_no_truncate ON public.vet_report_kept_ids;
--                  DROP FUNCTION public.vet_report_kept_ids_append_only();
--                  DROP TABLE public.vet_report_kept_ids;
--                  -- then re-run 113 §7a's CREATE OR REPLACE FUNCTION
--                  -- vet_reports_kept_not_deleted() (SECURITY INVOKER, the
--                  -- depth test), its three REVOKEs and its COMMENT.
--   Ordering:    after 113; before VR2-20 (CUL-2300), the writer.
--   After:       the VERIFY block at the foot, then get_advisors (security +
--                performance).
-- ============================================================


-- ============================================================
-- §0. Applied by a role that owns the guards
-- ============================================================
-- The DEFINER functions run as the role applying this file and must read
-- pets and auth.users and write a table no caller role may touch. postgres
-- bypasses RLS in production (read 2026-10-20, 106).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles
                 WHERE rolname = current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION '114 must be applied by a role that bypasses RLS';
  END IF;
END $$;


-- ============================================================
-- §1. The reservations: every id and label ever kept
-- ============================================================
CREATE TABLE public.vet_report_kept_ids (
  id       uuid PRIMARY KEY,
  pet_id   uuid NOT NULL,
  short_id text NOT NULL,
  kept_at  timestamptz NOT NULL DEFAULT now()
);

-- upper(): the label is Crockford base32, case-insensitive by spec, so a later
-- CHECK that admitted lower case could not wear an old label as `k7q2`
-- (rls-privacy-reviewer pass 1, M10).
CREATE UNIQUE INDEX idx_vet_report_kept_ids_label
  ON public.vet_report_kept_ids (pet_id, upper(short_id));

COMMENT ON TABLE public.vet_report_kept_ids IS
  'CUL-2339 (114): one row per vet_reports row that has ever been kept: its id, its pet''s id and its short label, reserved the moment it is kept and never released, so no other row may be kept under that id or that (pet, label) again, after any deletion. Written only by reserve_vet_report_kept_id. Server-only and append-only (every grant revoked, service_role included; a trigger refuses UPDATE, DELETE and TRUNCATE). No foreign key, so a pet or account deletion does not erase it. Holds ids and a label, never content.';

ALTER TABLE public.vet_report_kept_ids ENABLE ROW LEVEL SECURITY;
-- No policy: default-deny. The grants go too, by name, because this project's
-- default ACL grants each role explicitly and service_role bypasses RLS.
REVOKE ALL ON TABLE public.vet_report_kept_ids FROM PUBLIC;
REVOKE ALL ON TABLE public.vet_report_kept_ids FROM anon;
REVOKE ALL ON TABLE public.vet_report_kept_ids FROM authenticated;
REVOKE ALL ON TABLE public.vet_report_kept_ids FROM service_role;

CREATE OR REPLACE FUNCTION public.vet_report_kept_ids_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION
    'vet_report_kept_ids: a kept copy''s reservation is never changed or removed'
    USING ERRCODE = 'check_violation';
END;
$$;

REVOKE ALL ON FUNCTION public.vet_report_kept_ids_append_only() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vet_report_kept_ids_append_only() FROM anon;
REVOKE ALL ON FUNCTION public.vet_report_kept_ids_append_only() FROM authenticated;
REVOKE ALL ON FUNCTION public.vet_report_kept_ids_append_only() FROM service_role;

CREATE TRIGGER trg_vet_report_kept_ids_append_only
  BEFORE UPDATE OR DELETE ON public.vet_report_kept_ids
  FOR EACH ROW EXECUTE FUNCTION public.vet_report_kept_ids_append_only();

CREATE TRIGGER trg_vet_report_kept_ids_no_truncate
  BEFORE TRUNCATE ON public.vet_report_kept_ids
  FOR EACH STATEMENT EXECUTE FUNCTION public.vet_report_kept_ids_append_only();

COMMENT ON FUNCTION public.vet_report_kept_ids_append_only() IS
  'CUL-2339 (114): refuses every UPDATE, DELETE and TRUNCATE on vet_report_kept_ids, for every role, so no later function or server write can release a kept copy''s id or label. SECURITY INVOKER, reads nothing, message names no value (C-31).';


-- ============================================================
-- §2. E3: a kept copy is deleted only once its pet or its maker is gone
-- ============================================================
-- Replaces 113 §7a's body; the triggers trg_vet_reports_kept_not_deleted and
-- trg_vet_reports_no_truncate keep pointing at it. The FK cascades from pets
-- and auth.users run after the parent row is deleted, so the EXISTS below
-- reads it as gone (measured on PG16, probe cases E3-* and cascade-*).
CREATE OR REPLACE FUNCTION public.vet_reports_kept_not_deleted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION
      'vet_reports: TRUNCATE is refused; saved copies leave only with their pet or account'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'kept'
     AND EXISTS (SELECT 1 FROM public.pets p WHERE p.id = OLD.pet_id)
     AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = OLD.generated_by) THEN
    RAISE EXCEPTION
      'vet_reports: a kept copy is deleted only with its pet or account'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.vet_reports_kept_not_deleted() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vet_reports_kept_not_deleted() FROM anon;
REVOKE ALL ON FUNCTION public.vet_reports_kept_not_deleted() FROM authenticated;
REVOKE ALL ON FUNCTION public.vet_reports_kept_not_deleted() FROM service_role;

COMMENT ON FUNCTION public.vet_reports_kept_not_deleted() IS
  'CUL-2287 (113), CUL-2339 (114): a kept vet_reports row is deleted only once its pet or its maker (auth.users) is gone, so it cannot be deleted and re-inserted with changed content by any writer, a DELETE from inside a trigger or function at any depth included. The pet and account cascades pass because their parent row is already deleted; drafts pass. TRUNCATE is refused. SECURITY DEFINER (reads pets and auth.users), search_path pinned, EXECUTE revoked; message names no value (C-31). Its re-insert twin is reserve_vet_report_kept_id.';


-- ============================================================
-- §3. E4: keeping a copy reserves its id and label for good
-- ============================================================
-- AFTER, so it judges the row as stored: a later BEFORE trigger that edits
-- NEW.id or NEW.short_id is judged on what it wrote (pass 1, M7). It fires
-- when a row is kept: inserted kept, or moved from draft to kept (a kept row
-- never returns to draft and never changes id, pet or label: 113's freeze).
-- A second row kept under a reserved id or (pet, label) hits the unique index
-- and is refused. The reservation is committed when the first copy is kept,
-- long before any delete, so a concurrent delete-and-re-insert has nothing to
-- race (pass 1, R1 / R2: a ledger written at DELETE was invisible to a second
-- session until the first committed). A write that silently vanishes (a later
-- RETURN NULL trigger or DO INSTEAD rule on the table, pass 1 M6 / M14) is
-- refused by the row count, so a lost reservation fails the keep, loudly.
CREATE OR REPLACE FUNCTION public.reserve_vet_report_kept_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  n bigint := 0;
BEGIN
  IF NEW.status = 'kept' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'kept') THEN
    BEGIN
      INSERT INTO public.vet_report_kept_ids (id, pet_id, short_id)
      VALUES (NEW.id, NEW.pet_id, NEW.short_id);
      GET DIAGNOSTICS n = ROW_COUNT;
    EXCEPTION WHEN unique_violation OR not_null_violation THEN
      n := 0;
    END;
    IF n <> 1 THEN
      RAISE EXCEPTION
        'vet_reports: a kept copy needs an id and label never kept before'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_vet_report_kept_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_vet_report_kept_id() FROM anon;
REVOKE ALL ON FUNCTION public.reserve_vet_report_kept_id() FROM authenticated;
REVOKE ALL ON FUNCTION public.reserve_vet_report_kept_id() FROM service_role;

-- A plain AFTER INSERT OR UPDATE row trigger, no WHEN and no UPDATE OF: the
-- test is in the body, where the guard test pins it.
CREATE TRIGGER trg_vet_reports_reserve_kept_id
  AFTER INSERT OR UPDATE ON public.vet_reports
  FOR EACH ROW EXECUTE FUNCTION public.reserve_vet_report_kept_id();

COMMENT ON FUNCTION public.reserve_vet_report_kept_id() IS
  'CUL-2339 (114): when a vet_reports row is kept (inserted kept, or moved from draft to kept), reserves its id and its (pet_id, upper(short_id)) in vet_report_kept_ids for good; a row kept under a reserved id or label, by any writer and after any deletion, is refused. AFTER, so it reads the row as stored. Refuses a reservation that did not land (row count). SECURITY DEFINER (no caller role may write the table), search_path pinned, EXECUTE revoked; one RAISE naming no value (C-31).';


-- ============================================================
-- VERIFY (read-only, after applying)
-- ============================================================
--   1. The reservations, closed to every caller role:
--        SELECT grantee, privilege_type FROM information_schema.role_table_grants
--         WHERE table_schema = 'public' AND table_name = 'vet_report_kept_ids'
--           AND grantee IN ('anon', 'authenticated', 'service_role');
--      -> no rows.
--        SELECT relrowsecurity, pg_get_userbyid(relowner) FROM pg_class
--         WHERE oid = 'public.vet_report_kept_ids'::regclass;
--      -> t, postgres.
--   2. The functions: DEFINER where stated, no caller EXECUTE:
--        SELECT p.proname, p.prosecdef,
--               has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
--               has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authed,
--               has_function_privilege('service_role', p.oid, 'EXECUTE') AS service
--          FROM pg_proc p
--         WHERE p.pronamespace = 'public'::regnamespace
--           AND p.proname IN ('vet_reports_kept_not_deleted', 'reserve_vet_report_kept_id',
--                             'vet_report_kept_ids_append_only')
--         ORDER BY p.proname;
--      -> reserve t, append_only f, kept_not_deleted t; anon / authed /
--         service f on every row.
--   3. The triggers:
--        SELECT tgrelid::regclass, tgname, tgfoid::regproc FROM pg_trigger
--         WHERE tgname IN ('trg_vet_reports_kept_not_deleted', 'trg_vet_reports_no_truncate',
--                          'trg_vet_reports_reserve_kept_id',
--                          'trg_vet_report_kept_ids_append_only',
--                          'trg_vet_report_kept_ids_no_truncate')
--         ORDER BY tgname;
--      -> five rows, the first two on vet_reports still naming
--         vet_reports_kept_not_deleted.
--   4. The behaviour: the probe in the PR (scripts/probes/vet-report-114/run.sh,
--      including its two-session race).
