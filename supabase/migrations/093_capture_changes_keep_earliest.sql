-- ============================================================
-- Migration 093: capture_changes keeps the EARLIER date when two phones collide
--   CUL-1701 (FAB PR-29d), ruled A by the PM 2026-10-09. Follows 091 (applied),
--   so this is a new file rather than an edit to it (the 045 rule).
--
-- APPLIED to production 2026-10-09 (the PM's typed `apply 093`), live version
-- 20261009194024, name capture_changes_keep_earliest. The VERIFY block passed on
-- the live database (DEFINER, search_path "", EXECUTE authenticated only, table
-- grants unchanged, owners postgres | postgres). A live probe as an account with
-- no pets got the constant 42501 on a real pet and on a pet that does not exist,
-- anon got permission denied, and no row was written. get_advisors (security)
-- raised 0029 authenticated_security_definer_function_executable on this
-- function, which is intended: authenticated is the one role that pushes, and
-- the body's caller check is the boundary (record_ai_usage carries the same
-- lint). Performance raised nothing on this function or table. Comments added
-- after the apply change no statement.
-- ============================================================
--
-- THE FINDING (adversarial review of PR-29b)
--   091 keeps the FIRST row to arrive for a (pet_id, change_key). Phone A shows
--   the split stool pill on day 1 while offline and logs Normal through it; phone
--   B, online, shows it on day 2 and its row lands first; A reconnects on day 3,
--   its day-1 events land, its row meets the UNIQUE and is dropped. The server
--   holds day 2, so the report's disclosure (PR-29c, LEAST(first_seen_at,
--   created_at)) dates the change a day late and counts A's day-1 normals as
--   before it: more normal stools after a change can read as the pet improving.
--   Only the earlier phone needs to be unsynced, and the error lasts as long as
--   it stays so.
--
-- THE FIX: one function the push calls instead of the plain INSERT. It inserts
-- the row, and on a (pet_id, change_key) conflict lowers first_seen_at to the
-- earlier of the two. The later date never replaces the earlier. created_at (the
-- server's clock at the FIRST receipt) is never touched, so the reader's LEAST
-- still leans early. A replay of the phone's own row (a lost response) is a
-- no-op success.
--
-- WHY SECURITY DEFINER, NOT INVOKER
--   An INVOKER function writes with the caller's rights, and the conflict arm is
--   an UPDATE: it would need a GRANT UPDATE (first_seen_at) and an UPDATE policy
--   on capture_changes, and every client could then issue direct UPDATEs too.
--   091 is append-only by RLS alone ("no role holds UPDATE"), and that stays
--   true: the one write that may lower a date lives in this body, nowhere else.
--   What a DEFINER body owes in return, all below:
--     * search_path = '' and every name schema-qualified.
--     * The caller check FIRST, before any read of the table: p_pet_id must be a
--       pet of auth.uid(). No user (anon, service_role, a bare session) is
--       refused by the same check. The refusal is one constant message and the
--       42501 RLS gives, naming no value (C-31), and it reads only pets, which
--       the caller's own pets_owner policy already exposes to them. So it says
--       "not your pet" for another account's pet and a pet that does not exist
--       alike: no membership oracle.
--     * EXECUTE for authenticated only.
--
-- WHAT A CALLER CAN DO, stated (no more than 091's INSERT already allowed)
--   Write a row for its own pet with any first_seen_at, or lower its own pet's
--   date to any earlier value. 091's INSERT already took any date (no CHECK, on
--   purpose: a 23514 quarantines the row and loses the disclosure), and a forged
--   early date errs the way the reader wants errors to lean: it over-discloses.
--   It cannot raise a date, touch created_at, move a row to another pet or key,
--   or reach another account's row.
--
-- THE ROW-ID ORACLE (platform-generic, as 082 and 091 state it)
--   A p_id that is already the id of a DIFFERENT (pet, change) row raises 23505
--   on the primary key, which ON CONFLICT (pet_id, change_key) does not arbitrate.
--   It says a UUID exists and nothing more, exactly as the plain INSERT did, and
--   needs a UUID no path hands out. The client never counts it as landed (the
--   plain-INSERT client did): under this function a 23505 never means the fact is
--   on the server, and the client quarantines the row (a terminal code).
--
-- WHAT ELSE CAN MOVE (C-38)
--   first_seen_at, downward only, through this body only. Nothing else: no role
--   gains UPDATE on the table. pets.user_id is moved by no app path; if it were,
--   the caller check follows the pet, which is the right owner.
--
-- OLD BUILDS: 091's column INSERT grant stays, so a build already on a phone
-- keeps its plain insert and the first-wins behaviour it had. Dropping it would
-- quarantine those rows (42501) and lose their dates.
--
-- ------------------------------------------------------------
-- MIGRATION SAFETY PRE-FLIGHT
-- ------------------------------------------------------------
--   Destructive:  n. One new function and its EXECUTE grants. No table, column,
--                 policy, grant or row is touched.
--   Backfill:     N/A. Rows already on the server keep their date; a later push
--                 of an earlier date from another phone lowers it from now on.
--   Rollback:     DROP FUNCTION IF EXISTS public.record_capture_change(uuid, uuid, text, timestamptz);
--                 Ship the rollback only with a client that no longer calls it:
--                 a build that does would quarantine every capture row on
--                 PGRST202 (function not found) after its attempts run out.
--                 Dates already lowered stay lowered, which is right.
--   Ordering:     after 091 (needs the table) and 092. Merges before the client
--                 half ships in a build: the app calls a function that must exist.
--   After:        the VERIFY block at the foot, then get_advisors (security +
--                 performance).
-- ============================================================

CREATE FUNCTION public.record_capture_change(
  p_id            UUID,
  p_pet_id        UUID,
  p_change_key    TEXT,
  p_first_seen_at TIMESTAMPTZ
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- The caller check, before anything reads capture_changes. auth.uid() is NULL
  -- for anon, service_role and a bare session, and NULL matches no user_id.
  IF NOT EXISTS (
    SELECT 1 FROM public.pets
     WHERE id = p_pet_id AND user_id = (SELECT auth.uid())
  ) THEN
    RAISE EXCEPTION 'capture change refused: pet not owned by caller'
      USING ERRCODE = '42501';
  END IF;

  -- created_at is left to its default: the server's clock at first receipt, and
  -- never rewritten by the conflict arm. The WHERE makes a later or equal date a
  -- no-op, so a replay of the same row changes nothing.
  INSERT INTO public.capture_changes (id, pet_id, change_key, first_seen_at)
  VALUES (p_id, p_pet_id, p_change_key, p_first_seen_at)
  ON CONFLICT (pet_id, change_key) DO UPDATE
    SET first_seen_at = EXCLUDED.first_seen_at
    WHERE EXCLUDED.first_seen_at < public.capture_changes.first_seen_at;
END;
$$;

COMMENT ON FUNCTION public.record_capture_change(uuid, uuid, text, timestamptz) IS
  'The push for capture_changes (migration 093, FAB PR-29d, CUL-1701): inserts the row, and on a (pet_id, change_key) conflict keeps the EARLIER first_seen_at. SECURITY DEFINER so the table stays append-only for every role; refuses (42501, constant message) unless p_pet_id is a pet of auth.uid(). Never touches created_at.';

-- MAINTENANCE WARNING (rls-privacy-reviewer, N1): this body runs as the table's
-- owner, so RLS does not apply to its INSERT and PostgreSQL keeps the DETAIL line
-- it drops under RLS ("Key (id)=(...) already exists", "Failing row contains").
-- Today every value there is the caller's own input. A new constraint or trigger
-- on capture_changes (an EXCLUDE, a key across tenants, a trigger that reads a
-- parent) could put another account's values in that DETAIL: re-check it here.
--
-- Supabase's default privileges give EXECUTE to anon, authenticated and
-- service_role at CREATE, and PostgreSQL gives it to PUBLIC. Take it all back,
-- then give it to the one role that pushes.
REVOKE ALL ON FUNCTION public.record_capture_change(uuid, uuid, text, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_capture_change(uuid, uuid, text, timestamptz)
  TO authenticated;


-- ------------------------------------------------------------
-- VERIFY (run after applying; read-only)
-- ------------------------------------------------------------
--   SELECT prosecdef, proconfig FROM pg_proc
--    WHERE oid = 'public.record_capture_change(uuid, uuid, text, timestamptz)'::regprocedure;
--     -- t | {search_path=""}
--   SELECT r.rolname,
--          has_function_privilege(r.rolname,
--            'public.record_capture_change(uuid, uuid, text, timestamptz)', 'EXECUTE')
--     FROM pg_roles r WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
--    ORDER BY 1;
--     -- anon f, authenticated t, service_role f
--   SELECT privilege_type FROM information_schema.role_table_grants
--    WHERE table_name = 'capture_changes' AND grantee = 'authenticated';
--     -- SELECT only, unchanged from 091 (no UPDATE)
--   SELECT p.proowner::regrole AS fn_owner, c.relowner::regrole AS table_owner
--     FROM pg_proc p, pg_class c
--    WHERE p.oid = 'public.record_capture_change(uuid, uuid, text, timestamptz)'::regprocedure
--      AND c.oid = 'public.capture_changes'::regclass;
--     -- postgres | postgres. The body reads pets and writes capture_changes as
--     -- this owner; an owner without RLS bypass on pets would refuse every call
--     -- (42501, fail closed, rows quarantine after their attempts).
--   Then one live call each with a real user token: own pet -> 204; a pet id
--   the user does not own -> 403 with the constant message.
