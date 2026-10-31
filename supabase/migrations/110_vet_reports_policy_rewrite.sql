-- ============================================================
-- Migration 110: vet_reports, the policy rewrite
--   (Vet report v2 row VR2-5, CUL-283 widened 2026-10-31, critique BRK-6)
-- See: CUL-283 (the issue; its plan comment, PM go 2026-10-31);
--      docs/nyx-vet-report-v2-requirements.md §11.1;
--      001_schema.sql (the policy replaced here); 026 (the public share drop);
--      029 (updated_at); 045 / 109 (the vet_documents shape this follows).
-- Replaces the one policy on vet_reports, narrows its grants, adds a
-- whole-shape storage_path CHECK and a client-side column freeze. No column
-- is added, dropped or altered. The table holds 0 rows (read 2026-10-31).
-- ============================================================
--
-- THE HOLE
-- ------------------------------------------------------------
-- 001 gave the table one policy, `vet_reports_owner FOR ALL USING
-- (auth.uid() = generated_by)`, with no WITH CHECK, so the USING expression
-- doubled as the write check and tested only generated_by. Any signed-in
-- account could:
--   * INSERT a row naming another account's pet_id and any storage_path it
--     liked, then read back its own row's default share_token: the path was
--     the key a future public view would download from nyx-vet-reports;
--   * UPDATE its own row's pet_id, storage_path, share_token, dates or expiry
--     (a link made permanent by token_expires_at = 9999-01-01);
--   * DELETE its rows outright.
-- And anon held every grant on the table (RLS refused it, nothing else did).
-- It was safe only because nothing wrote the table and the report keys were
-- two server UUIDs. Vet report v2 keeps a saved copy of every report sent
-- (VR2-7, CUL-2287), so the table is about to hold its first rows.
--
-- THE SHAPE AFTER THIS FILE
-- ------------------------------------------------------------
--   Grants      anon: nothing. authenticated: SELECT, and UPDATE on
--               token_expires_at only (a column grant). No INSERT, DELETE,
--               TRUNCATE, REFERENCES or TRIGGER. service_role untouched.
--   SELECT      Owners read through pets.user_id: the report's pet is the
--               caller's. generated_by no longer decides access; a pet has one
--               owner, so the two agree today, and the pet is the boundary the
--               rest of the schema draws.
--   INSERT      No client path. The Edge Function writes with the service role.
--   UPDATE      Pet ownership in USING and in WITH CHECK, so a row can neither
--               be reached nor moved onto a pet that is not the caller's.
--   Freeze      A BEFORE UPDATE trigger for every client caller. It is an
--               ALLOWLIST: the row as JSON minus the control columns must not
--               change, so a column a later migration adds is frozen until that
--               migration names it. The control set is token_expires_at, and it
--               may only move earlier (revoking a link), never later.
--               updated_at is stamped by trg_vet_reports_updated_at regardless.
--   DELETE      No client path. Account deletion runs as the service role.
--   Path        storage_path is exactly `{pet_id}/{uuid}.html` or `.pdf`, the
--               two-segment shape delete-account's scopeVetReportPaths will
--               keep (VR2-1, PR-01, in review; main's purge runs these paths
--               through cleanPaths only, so today this CHECK is the one thing
--               tying a path to its pet). A traversal (`{own}/../{victim}/x.pdf`), an extra
--               segment, another pet's prefix or an upper-case id all fail by
--               construction, for every writer including the service role.
--
-- Two layers on UPDATE on purpose: the column grant refuses a client write
-- naming any other column before a trigger runs (42501), and the trigger keeps
-- the freeze if a later migration ever grants table-wide UPDATE. Neither reads
-- another row, so neither is a cross-tenant oracle (C-31): the trigger runs
-- with the caller's rights and its message names only column names.
--
-- Who is a client: a call with a user (auth.uid() set), one running as anon or
-- authenticated, or one whose session role is either, which reaches a
-- SECURITY DEFINER function called by anon, or by authenticated with no user
-- (there current_user is the owner, and Postgres refuses to SET role inside
-- one; rls-privacy-reviewer on this file, two passes, measured). The service
-- role with no user and the migration owner are not; VR2-7's content freeze
-- binds them too. The service role carrying a user (a sub claim) is frozen,
-- which fails closed; no current path sends one. A client-callable function
-- with a `SET role = service_role` clause is exempt, as it is from every
-- policy in the schema: shipping one hands anon the service role, which is a
-- compromise of its own, not a gap in this file.
--
-- WHAT IS NOT CLOSED, stated:
--   * Visit links. The table has no vet_visit_id or vet_appointment_id yet.
--     Their same-pet guard lands with the columns in VR2-7 (PM, 2026-10-31,
--     option a), bound to enforce_vet_visit_link_same_pet.
--   * generated_by is not bound to the pet's owner. Only the service role can
--     write it now, so the Edge Function is the binding. A wrong value is worse
--     than a wrong label: generated_by cascades from auth.users, so deleting
--     the account it wrongly names deletes the row, and the owner's own
--     deletion later finds no row and leaves the stored file behind. VR2-7
--     binds it (a check that it is the pet's owner).
--   * A SECURITY DEFINER function owned by the migration owner and called by
--     the service role with no user is exempt from the freeze, as the service
--     role is. VR2-7's public share read must not write through one.
--   * The service role is trusted with every column. The CHECK above is the
--     one rule it cannot pass; the content freeze is VR2-7's.
--   * A per-report delete by the owner does not exist. If the library grows
--     one, it is a server path, not a client grant.
--   * The nyx-vet-reports bucket is private with no Storage policies (read
--     2026-10-31): only the service role reaches it. Unchanged here.
--
-- ------------------------------------------------------------
-- MIGRATION SAFETY PRE-FLIGHT
-- ------------------------------------------------------------
--   Destructive:  n. One policy dropped and three created, grants narrowed, a
--                 CHECK and a trigger added. No column, row or index touched.
--                 Row count before applying (expect 0; the CHECK validates
--                 every existing row and would fail on a bad one):
--                   SELECT count(*) FROM public.vet_reports;
--   Backfill:     N/A. The table is empty.
--   Rollback:     re-opens the hole above, so only to unbrick something:
--                   DROP TRIGGER trg_vet_reports_client_freeze ON public.vet_reports;
--                   DROP FUNCTION public.vet_reports_client_freeze();
--                   ALTER TABLE public.vet_reports
--                     DROP CONSTRAINT vet_reports_storage_path_shape;
--                   DROP POLICY vet_reports_select_owner ON public.vet_reports;
--                   DROP POLICY vet_reports_update_owner ON public.vet_reports;
--                   CREATE POLICY "vet_reports_owner" ON public.vet_reports
--                     FOR ALL USING (auth.uid() = generated_by);
--                   GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES,
--                     TRIGGER ON TABLE public.vet_reports TO anon, authenticated;
--                 (Both held arwdDxt before this file, read 2026-10-31; named
--                 rather than ALL, which on PG17 adds MAINTAIN.) Not an exact
--                 restore: authenticated's column grant on token_expires_at
--                 survives it (harmless under the table grant; a re-apply's
--                 REVOKE ALL clears it).
--   Ordering:     after 109; before VR2-7 (CUL-2287), which it blocks. No app
--                 or Edge Function reads or writes vet_reports as a client
--                 today (delete-account reads it as the service role).
--   After:        the VERIFY block at the foot, then get_advisors (security +
--                 performance).
-- ============================================================


-- ============================================================
-- §1. Grants
-- ============================================================
REVOKE ALL ON TABLE public.vet_reports FROM anon;
REVOKE ALL ON TABLE public.vet_reports FROM authenticated;
GRANT SELECT ON TABLE public.vet_reports TO authenticated;
GRANT UPDATE (token_expires_at) ON TABLE public.vet_reports TO authenticated;


-- ============================================================
-- §2. Policies
-- ============================================================
DROP POLICY IF EXISTS "vet_reports_owner" ON public.vet_reports;
DROP POLICY IF EXISTS "vet_reports_public_share" ON public.vet_reports;

-- (SELECT auth.uid()) so the planner evaluates it once per statement.
CREATE POLICY "vet_reports_select_owner" ON public.vet_reports
  FOR SELECT TO authenticated
  USING (
    pet_id IN (SELECT p.id FROM public.pets p WHERE p.user_id = (SELECT auth.uid()))
  );

CREATE POLICY "vet_reports_update_owner" ON public.vet_reports
  FOR UPDATE TO authenticated
  USING (
    pet_id IN (SELECT p.id FROM public.pets p WHERE p.user_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    pet_id IN (SELECT p.id FROM public.pets p WHERE p.user_id = (SELECT auth.uid()))
  );

-- No INSERT and no DELETE policy: with RLS on, none means refused.


-- ============================================================
-- §3. storage_path: the whole shape, bound to the row's pet
-- ============================================================
-- Lower-case hex, as uuid::text prints, so the first segment is compared to
-- the row's own pet_id exactly; ~ is anchored at both ends.
ALTER TABLE public.vet_reports
  ADD CONSTRAINT vet_reports_storage_path_shape CHECK (
    storage_path ~ (
      '^' || pet_id::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(html|pdf)$'
    )
  );


-- ============================================================
-- §4. The client freeze
-- ============================================================
CREATE OR REPLACE FUNCTION public.vet_reports_client_freeze()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  -- The only columns a client may change. updated_at is stamped by
  -- trg_vet_reports_updated_at after this trigger, whatever the client sent.
  control text[] := ARRAY['token_expires_at', 'updated_at'];
BEGIN
  -- Exempt only with no user, no client role, and no client role set on the
  -- session. The third test is the one a SECURITY DEFINER function cannot hide:
  -- inside one, current_user is the owner, but the role PostgREST SET stays.
  IF auth.uid() IS NULL
     AND current_user NOT IN ('anon', 'authenticated')
     AND coalesce(current_setting('role', true), 'none') NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - control) IS DISTINCT FROM (to_jsonb(OLD) - control)
     OR NEW.token_expires_at > OLD.token_expires_at THEN
    -- Column names only, never a value (C-31).
    RAISE EXCEPTION
      'vet_reports: a client may only move token_expires_at earlier'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.vet_reports_client_freeze() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vet_reports_client_freeze() FROM anon;
REVOKE ALL ON FUNCTION public.vet_reports_client_freeze() FROM authenticated;

-- Named to sort before trg_vet_reports_updated_at (same-event triggers fire in
-- name order), so the freeze judges the client's row, not the stamped one.
DROP TRIGGER IF EXISTS trg_vet_reports_client_freeze ON public.vet_reports;
CREATE TRIGGER trg_vet_reports_client_freeze
  BEFORE UPDATE ON public.vet_reports
  FOR EACH ROW EXECUTE FUNCTION public.vet_reports_client_freeze();

COMMENT ON FUNCTION public.vet_reports_client_freeze() IS
  'CUL-283 (110): for a client caller (a user, the anon / authenticated role, or a session whose role is either, which reaches a DEFINER function called by anon), every vet_reports column but token_expires_at is frozen, and token_expires_at may only move earlier (revoke, never extend). An allowlist over to_jsonb, so columns added later are frozen until named. SECURITY INVOKER, reads no other row, message names no value (C-31). The service role and the owner, with no user, are exempt; VR2-7''s content freeze binds them.';


-- ============================================================
-- VERIFY (run by hand after apply; read-only)
-- ============================================================
--   1. Exactly the two policies, each TO authenticated:
--        SELECT policyname, cmd, roles, qual IS NOT NULL AS has_using,
--               with_check IS NOT NULL AS has_check
--          FROM pg_policies WHERE schemaname = 'public' AND tablename = 'vet_reports'
--         ORDER BY policyname;
--      -> vet_reports_select_owner SELECT {authenticated} t f
--         vet_reports_update_owner UPDATE {authenticated} t t
--   2. The grants:
--        SELECT grantee, privilege_type FROM information_schema.role_table_grants
--         WHERE table_schema = 'public' AND table_name = 'vet_reports'
--           AND grantee IN ('anon', 'authenticated');
--      -> one row: authenticated SELECT.
--        SELECT grantee, column_name, privilege_type
--          FROM information_schema.column_privileges
--         WHERE table_schema = 'public' AND table_name = 'vet_reports'
--           AND grantee IN ('anon', 'authenticated') AND privilege_type <> 'SELECT';
--      -> one row: authenticated token_expires_at UPDATE.
--   3. The CHECK and the trigger:
--        SELECT conname FROM pg_constraint
--         WHERE conrelid = 'public.vet_reports'::regclass AND contype = 'c';
--      -> vet_reports_storage_path_shape
--        SELECT tgname, tgfoid::regproc FROM pg_trigger
--         WHERE tgrelid = 'public.vet_reports'::regclass AND NOT tgisinternal
--         ORDER BY tgname;
--      -> trg_vet_reports_client_freeze  vet_reports_client_freeze
--         trg_vet_reports_updated_at     set_updated_at
--   4. The same through has_*_privilege, which sees grants information_schema
--      hides (another grantor):
--        SELECT has_table_privilege('anon', 'public.vet_reports',
--                 'SELECT,INSERT,UPDATE,DELETE')                         AS anon_any,
--               has_table_privilege('authenticated', 'public.vet_reports',
--                 'INSERT,DELETE,TRUNCATE')                              AS authed_write,
--               has_column_privilege('authenticated', 'public.vet_reports',
--                 'share_token', 'UPDATE')                               AS authed_token,
--               (SELECT relacl FROM pg_class
--                 WHERE oid = 'public.vet_reports'::regclass)            AS acl;
--      -> f, f, f, and an acl with no anon entry and authenticated=r.
--   5. The behaviour: the probe in the PR.
