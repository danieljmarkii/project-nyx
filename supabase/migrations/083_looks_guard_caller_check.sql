-- ============================================================
-- Migration 083: the looks same-pet guard refuses another account's pet before
-- it reads a parent (CUL-1457)
-- ============================================================
--
-- 064 is applied, so this is a follow-up rather than an edit to it: the recorded
-- migration keeps saying what was actually run (the 045 rule).
--
-- ------------------------------------------------------------
-- THE FINDING (rls-privacy-reviewer, release QA 2026-10-02)
-- ------------------------------------------------------------
-- 064 closed the date leak in the error MESSAGE (C-31: one RAISE, naming only
-- NEW.* values) and left it in the error CODE. A caller holding a victim's
-- (pet_id, check_in event_id) writes a looks row with local_day = D:
--
--   * D within a day of the parent's UTC date: the trigger passes, and
--     looks_owner's WITH CHECK refuses one layer out. 42501.
--   * D anywhere else: the trigger refuses. 23514.
--
-- Sweeping D recovers the parent's date, a field read across accounts. The same
-- 42501 / 23514 split is the membership oracle 064's header disclosed. Neither
-- is reachable today (a check_in carries no attachment, so no path or signed URL
-- hands out its id), and "two unguessable UUIDs" is not the mitigation C-31
-- accepts.
--
-- ------------------------------------------------------------
-- THE FIX, in two halves, both from 082
-- ------------------------------------------------------------
-- §1, the caller arm. When the request carries a user (auth.uid() is set), the
-- guard first requires the row's pet to be that user's, and reads the parent
-- only if it is. Every signed-in write naming another account's pet now gets
-- the same 23514 and the same message, whatever D is and whether the pair is
-- real. BEFORE ROW triggers run ahead of the RLS WITH CHECK and the FK check,
-- so for a signed-in caller the trigger answers first.
--
-- §2, the anon revoke. The arm trusts EVERY request with no user, and the
-- service role is not the only one: the anon key carries none either. Supabase's
-- default privileges gave anon every verb on looks at CREATE, 064 never took
-- them back, and looks_owner is TO authenticated only. So with §1 alone an
-- anon-key POST still read the parent and was refused one layer out by RLS:
-- 42501 inside the band, 23514 outside, the oracle 083 exists to close, now
-- with no account at all (rls-privacy-reviewer on this PR, measured on the
-- PG16 replay; live anon held INSERT on looks when this was written). 082 is
-- safe with the same arm because it revokes its tables from anon; this file
-- does the same for looks. anon is then refused by the privilege check, which
-- runs before any trigger and reads nothing: a constant 42501. Nothing reads or
-- writes looks as anon (the client syncs signed in; generate-report reads under
-- the caller's JWT, which is authenticated).
--
-- What stays trusted: a request with no user that is not anon. That is the
-- service role (the trusted server writer, which already sees every row) and a
-- direct database session. The authenticated role with no sub would also land
-- there, and GoTrue cannot mint such a token.
--
-- What a signed-in caller can still learn, stated: no field of another
-- account's. Its own pet with a foreign event id is refused 23514 whether that
-- event exists or not (the lookup requires e.pet_id = NEW.pet_id). An UPDATE
-- aimed at a foreign looks row never reaches the trigger, because looks_owner's
-- USING hides the row first. The row-id existence oracle 082 states remains and
-- is platform-generic: an upsert on the caller's own valid pair that reuses
-- another account's looks.id is refused 42501 (the ON CONFLICT arm meets a row
-- looks_owner's USING hides) where a fresh id succeeds. It says a UUID exists,
-- nothing more, and needs a UUID no path hands out.
--
-- Unchanged on purpose: the message (still names NEW.* only), the SQLSTATE, the
-- ±1-day bound, the check_in predicate, DEFINER, search_path = '', the revokes,
-- and the trigger itself (CREATE OR REPLACE keeps trg_looks_same_pet bound).
--
-- ------------------------------------------------------------
-- WHAT ELSE CAN MOVE (C-38)
-- ------------------------------------------------------------
--   * pets.user_id: no client path moves a pet between accounts, and pets_owner
--     confines it to the owner. A pet that did move would make its owner's own
--     looks writes refuse here, which is the correct answer.
--   * The parent event (occurred_at, pet_id): the CUL-882 class 064 carries,
--     unchanged by this file.
--
-- ------------------------------------------------------------
-- MIGRATION SAFETY PRE-FLIGHT
-- ------------------------------------------------------------
--   Destructive:  n. One function body replaced and anon's grants on looks
--                 revoked. No table, column, policy, trigger or row is
--                 touched; authenticated and service_role grants unchanged.
--   Backfill:     N/A. Existing rows already passed the stricter-or-equal check
--                 (every client write is the owner's own, and RLS refused the
--                 rest).
--   Rollback:     re-run ONLY 064's §5 CREATE OR REPLACE FUNCTION statement
--                 plus its three REVOKEs and COMMENT (not its CREATE TRIGGER,
--                 which already exists and stays bound). §2:
--                   GRANT ALL ON TABLE public.looks TO anon;
--                 Either half reopens the oracle this file closes.
--   Ordering:     after 082. No client change depends on it; the app's writes are
--                 always the owner's own pet and see no difference.
--   After:        run the VERIFY block at the foot of this file, then
--                 get_advisors (security + performance).
-- ============================================================

-- ============================================================
-- §1. The caller arm
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_look_paired_event_same_pet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  me         uuid := auth.uid();
  parent_day DATE;
BEGIN
  -- The caller arm comes first: another account's pet never reaches the parent
  -- lookup, so nothing the lookup would find can change the answer.
  IF me IS NULL
     OR EXISTS (SELECT 1 FROM public.pets p
                 WHERE p.id = NEW.pet_id AND p.user_id = me) THEN
    SELECT (e.occurred_at AT TIME ZONE 'UTC')::date
      INTO parent_day
      FROM public.events e
     WHERE e.id = NEW.event_id
       AND e.pet_id = NEW.pet_id
       AND e.event_type::text = 'check_in';
  END IF;

  -- ONE raise, and it names only what the caller sent. Never parent_day (C-31).
  IF parent_day IS NULL
     OR NEW.local_day NOT BETWEEN parent_day - 1 AND parent_day + 1 THEN
    RAISE EXCEPTION
      'looks.event_id % must reference a check_in event for the same pet (%) with local_day % within a day of it',
      NEW.event_id, NEW.pet_id, NEW.local_day
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_look_paired_event_same_pet() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_look_paired_event_same_pet() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_look_paired_event_same_pet() FROM authenticated;

COMMENT ON FUNCTION public.enforce_look_paired_event_same_pet() IS
  'CUL-867 / B-520: same-pet guard for looks.event_id, bounding looks.local_day to ±1 day of the parent event''s UTC date (E-2). CUL-1457 (083): for a signed-in caller the row''s pet must be the caller''s, checked before the parent lookup, so every signed-in write naming another account''s pet gets one code and one message; 083 also revokes looks from anon, the other user-less role (together they close the 42501/23514 date and membership oracle). SECURITY DEFINER, search_path pinned to '''', EXECUTE revoked from PUBLIC/anon/authenticated.';


-- ============================================================
-- §2. anon loses every verb on looks
-- ============================================================
REVOKE ALL ON TABLE public.looks FROM anon;


-- ============================================================
-- VERIFY (read-only; run after apply)
-- ============================================================
-- 1. Posture held:
--    SELECT prosecdef, proconfig, proacl
--      FROM pg_proc WHERE proname = 'enforce_look_paired_event_same_pet';
--    → t, {search_path=""}, no anon/authenticated/PUBLIC entry.
-- 2. The body is 083's:
--    SELECT pg_get_functiondef('public.enforce_look_paired_event_same_pet()'::regprocedure)
--      LIKE '%auth.uid()%';  → t
-- 3. The trigger is still bound:
--    SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.looks'::regclass
--      AND tgname = 'trg_looks_same_pet';  → 1 row
-- 4. anon holds nothing:
--    SELECT has_table_privilege('anon','public.looks','INSERT'),
--           has_table_privilege('anon','public.looks','UPDATE'),
--           has_table_privilege('anon','public.looks','SELECT');  → f, f, f
-- 5. The probe (CUL-1457): insert a looks row naming a real (pet, check_in
--    event) pair of another account, sweeping local_day across the parent's
--    date ±3, twice: as `authenticated` with a zero-pet JWT (every attempt
--    23514, a message holding only the values sent) and as `anon` (every
--    attempt 42501). Before 083 both answered 42501 on the three days around
--    the parent's date and 23514 elsewhere.
