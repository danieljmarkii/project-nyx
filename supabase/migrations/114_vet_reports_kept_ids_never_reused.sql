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
-- (b) E4. public.vet_report_retired_ids: one row per kept copy that has left
--     the table, holding its id, its pet's id and its short label.
--       · AFTER DELETE on vet_reports (retire_vet_report_id) records a kept
--         row as it goes, whatever removed it.
--       · BEFORE INSERT OR UPDATE on vet_reports (guard_vet_report_retired)
--         refuses, for every role:
--           an INSERT whose id is in the ledger (an upsert fires this too,
--           before its conflict check; a live row's id is never in the
--           ledger, so an upsert over a live row is untouched), and
--           a row whose (pet_id, short_id) is in the ledger, on INSERT or
--           when either changes: a rewritten copy under a new id cannot wear
--           the old copy's label for the same pet.
--         An id never changes on UPDATE (113's content freeze), so the id
--         arm is INSERT-only.
--       · The ledger is server-only and append-only. RLS on with no policy,
--         and every grant revoked, service_role INCLUDED: E4's actor is the
--         service role, so a ledger it could DELETE from would reopen the
--         hole. A trigger refuses UPDATE, DELETE and TRUNCATE on it for every
--         role, so a later SECURITY DEFINER function cannot clear it either.
--         No foreign key: deleting an account does not erase its ids.
--     content_sha256 (113) already pins the stored object's bytes to the row.
--
-- SECURITY DEFINER on the three vet_reports functions (they read or write the
-- ledger, which no caller role may touch; the delete guard reads pets and
-- auth.users), search_path '' with every name schema-qualified, EXECUTE
-- revoked from PUBLIC, anon, authenticated and service_role (B-520; trigger
-- functions cannot be called directly anyway). One RAISE per guard, one
-- message, naming no value (C-31). 23514, the code this repo's guards raise.
--
-- RETENTION (PM, 2026-11-01, plan comment): after an account is deleted the
-- ledger keeps a removed copy's id, its pet's id and its four-character label.
-- Random ids and a label, no content, no owner; the retention 106 makes for
-- food ids. No client can read it.
--
-- STATED BLIND SPOTS:
--   · A superuser can disable any of these triggers or set
--     session_replication_role to replica. That is the server's owner.
--   · A kept row deleted before 114 is not in the ledger. The table holds 0
--     rows (read 2026-10-31; 113 §0 refused otherwise), so there is none.
--   · E4 with a NEW id and a NEW label still lands: a pet deleted and
--     re-created under its old id can be given a fresh kept copy. That is a
--     new report, not a rewrite of the old one: the old copy's id and label
--     stay retired, so a vet holding them finds nothing rather than a softer
--     copy. Refusing re-use of a pet id that once held a kept copy belongs to
--     pets (104), not here.
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
--                replaced, four new triggers. No column, row or policy on an
--                existing table changes.
--   Backfill:    N/A. vet_reports holds 0 rows, so no kept copy has left it.
--                Check before applying (expect 0):
--                  SELECT count(*) FROM public.vet_reports;
--   Rollback:    re-opens E3 and E4, so only to unbrick something:
--                  DROP TRIGGER trg_vet_reports_retired_unused ON public.vet_reports;
--                  DROP TRIGGER trg_vet_reports_retire_id ON public.vet_reports;
--                  DROP FUNCTION public.guard_vet_report_retired();
--                  DROP FUNCTION public.retire_vet_report_id();
--                  DROP TRIGGER trg_vet_report_retired_ids_append_only ON public.vet_report_retired_ids;
--                  DROP TRIGGER trg_vet_report_retired_ids_no_truncate ON public.vet_report_retired_ids;
--                  DROP FUNCTION public.vet_report_retired_ids_append_only();
--                  DROP TABLE public.vet_report_retired_ids;
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
-- §1. The ledger
-- ============================================================
CREATE TABLE public.vet_report_retired_ids (
  id         uuid PRIMARY KEY,
  pet_id     uuid NOT NULL,
  short_id   text,
  retired_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_vet_report_retired_ids_label
  ON public.vet_report_retired_ids (pet_id, short_id)
  WHERE short_id IS NOT NULL;

COMMENT ON TABLE public.vet_report_retired_ids IS
  'CUL-2339 (114): every kept vet_reports row that has left the table: its id, its pet''s id and its short label, none of which a vet_reports row may carry again. Written only by retire_vet_report_id; read only by guard_vet_report_retired. Server-only and append-only (every grant revoked, service_role included; a trigger refuses UPDATE, DELETE and TRUNCATE). No foreign key, so account deletion does not erase it; no pet_id FK for the same reason (it holds ids, never content).';

ALTER TABLE public.vet_report_retired_ids ENABLE ROW LEVEL SECURITY;
-- No policy: default-deny. The grants go too, by name, because this project's
-- default ACL grants each role explicitly and service_role bypasses RLS.
REVOKE ALL ON TABLE public.vet_report_retired_ids FROM PUBLIC;
REVOKE ALL ON TABLE public.vet_report_retired_ids FROM anon;
REVOKE ALL ON TABLE public.vet_report_retired_ids FROM authenticated;
REVOKE ALL ON TABLE public.vet_report_retired_ids FROM service_role;

CREATE OR REPLACE FUNCTION public.vet_report_retired_ids_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION
    'vet_report_retired_ids: a retired saved-copy id is never changed or removed'
    USING ERRCODE = 'check_violation';
END;
$$;

REVOKE ALL ON FUNCTION public.vet_report_retired_ids_append_only() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vet_report_retired_ids_append_only() FROM anon;
REVOKE ALL ON FUNCTION public.vet_report_retired_ids_append_only() FROM authenticated;
REVOKE ALL ON FUNCTION public.vet_report_retired_ids_append_only() FROM service_role;

CREATE TRIGGER trg_vet_report_retired_ids_append_only
  BEFORE UPDATE OR DELETE ON public.vet_report_retired_ids
  FOR EACH ROW EXECUTE FUNCTION public.vet_report_retired_ids_append_only();

CREATE TRIGGER trg_vet_report_retired_ids_no_truncate
  BEFORE TRUNCATE ON public.vet_report_retired_ids
  FOR EACH STATEMENT EXECUTE FUNCTION public.vet_report_retired_ids_append_only();

COMMENT ON FUNCTION public.vet_report_retired_ids_append_only() IS
  'CUL-2339 (114): refuses every UPDATE, DELETE and TRUNCATE on vet_report_retired_ids, for every role, so no later function or server write can free a retired saved-copy id. SECURITY INVOKER, reads nothing, message names no value (C-31).';


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
  'CUL-2287 (113), CUL-2339 (114): a kept vet_reports row is deleted only once its pet or its maker (auth.users) is gone, so it cannot be deleted and re-inserted with changed content by any writer, a DELETE from inside a trigger or function at any depth included. The pet and account cascades pass because their parent row is already deleted; drafts pass. TRUNCATE is refused. SECURITY DEFINER (reads pets and auth.users), search_path pinned, EXECUTE revoked; message names no value (C-31). Its re-insert twin is guard_vet_report_retired.';


-- ============================================================
-- §3. E4: a kept copy's id and label are retired when it leaves
-- ============================================================
CREATE OR REPLACE FUNCTION public.retire_vet_report_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.status = 'kept' THEN
    INSERT INTO public.vet_report_retired_ids (id, pet_id, short_id)
    VALUES (OLD.id, OLD.pet_id, OLD.short_id)
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.retire_vet_report_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.retire_vet_report_id() FROM anon;
REVOKE ALL ON FUNCTION public.retire_vet_report_id() FROM authenticated;
REVOKE ALL ON FUNCTION public.retire_vet_report_id() FROM service_role;

-- A plain AFTER DELETE row trigger with no WHEN clause: the status test is in
-- the body, where the guard test pins it.
CREATE TRIGGER trg_vet_reports_retire_id
  AFTER DELETE ON public.vet_reports
  FOR EACH ROW EXECUTE FUNCTION public.retire_vet_report_id();

COMMENT ON FUNCTION public.retire_vet_report_id() IS
  'CUL-2339 (114): records every kept vet_reports row that is deleted, whatever deleted it (pet or account cascade), in vet_report_retired_ids. SECURITY DEFINER (no caller role may write the ledger), search_path pinned, EXECUTE revoked; raises nothing.';

CREATE OR REPLACE FUNCTION public.guard_vet_report_retired()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (TG_OP = 'INSERT'
      AND EXISTS (SELECT 1 FROM public.vet_report_retired_ids r WHERE r.id = NEW.id))
     OR (NEW.short_id IS NOT NULL
         AND (TG_OP = 'INSERT'
              OR NEW.short_id IS DISTINCT FROM OLD.short_id
              OR NEW.pet_id   IS DISTINCT FROM OLD.pet_id)
         AND EXISTS (SELECT 1 FROM public.vet_report_retired_ids r
                      WHERE r.pet_id = NEW.pet_id AND r.short_id = NEW.short_id)) THEN
    RAISE EXCEPTION
      'vet_reports: this id or label belonged to a saved copy that was removed, and is not used again'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_vet_report_retired() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_vet_report_retired() FROM anon;
REVOKE ALL ON FUNCTION public.guard_vet_report_retired() FROM authenticated;
REVOKE ALL ON FUNCTION public.guard_vet_report_retired() FROM service_role;

-- A plain INSERT OR UPDATE trigger, not UPDATE OF, so it fires whatever the
-- SET list names (an ON CONFLICT DO UPDATE included).
CREATE TRIGGER trg_vet_reports_retired_unused
  BEFORE INSERT OR UPDATE ON public.vet_reports
  FOR EACH ROW EXECUTE FUNCTION public.guard_vet_report_retired();

COMMENT ON FUNCTION public.guard_vet_report_retired() IS
  'CUL-2339 (114): refuses, for every role, a vet_reports INSERT whose id is in vet_report_retired_ids, and any row whose (pet_id, short_id) is there (on INSERT, or when either changes), so a removed kept copy is never re-inserted under its id or impersonated under its label. id itself never changes (vet_reports_content_freeze). SECURITY DEFINER (reads the server-only ledger), search_path pinned, EXECUTE revoked; one RAISE naming no value (C-31).';


-- ============================================================
-- VERIFY (read-only, after applying)
-- ============================================================
--   1. The ledger, closed to every caller role:
--        SELECT grantee, privilege_type FROM information_schema.role_table_grants
--         WHERE table_schema = 'public' AND table_name = 'vet_report_retired_ids'
--           AND grantee IN ('anon', 'authenticated', 'service_role');
--      -> no rows.
--        SELECT relrowsecurity FROM pg_class
--         WHERE oid = 'public.vet_report_retired_ids'::regclass;
--      -> t.
--   2. The functions: DEFINER where stated, no caller EXECUTE:
--        SELECT p.proname, p.prosecdef,
--               has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
--               has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authed,
--               has_function_privilege('service_role', p.oid, 'EXECUTE') AS service
--          FROM pg_proc p
--         WHERE p.pronamespace = 'public'::regnamespace
--           AND p.proname IN ('vet_reports_kept_not_deleted', 'retire_vet_report_id',
--                             'guard_vet_report_retired', 'vet_report_retired_ids_append_only');
--      -> prosecdef t, t, t, f; anon / authed / service f on every row.
--   3. The triggers:
--        SELECT tgrelid::regclass, tgname, tgfoid::regproc FROM pg_trigger
--         WHERE tgname IN ('trg_vet_reports_kept_not_deleted', 'trg_vet_reports_no_truncate',
--                          'trg_vet_reports_retire_id', 'trg_vet_reports_retired_unused',
--                          'trg_vet_report_retired_ids_append_only',
--                          'trg_vet_report_retired_ids_no_truncate')
--         ORDER BY tgname;
--      -> six rows, the first two on vet_reports still naming
--         vet_reports_kept_not_deleted.
--   4. The behaviour: the probe in the PR (scripts/probes/vet-report-114/run.sh).
