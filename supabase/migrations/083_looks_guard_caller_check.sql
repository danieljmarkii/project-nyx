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
-- THE FIX: 082's caller arm
-- ------------------------------------------------------------
-- When the request carries a user (auth.uid() is set), the guard first requires
-- the row's pet to be that user's, and reads the parent only if it is. Every
-- write naming another account's pet now gets the same 23514 and the same
-- message, whatever D is and whether the pair is real or not. BEFORE ROW
-- triggers run ahead of the RLS WITH CHECK and the FK check, so the trigger
-- answers first and no other layer gets to answer differently. The service role
-- carries no user (auth.uid() IS NULL) and keeps the same-pet check alone: it is
-- the trusted server writer and already sees every row.
--
-- What a signed-in caller can still learn, stated: nothing about another
-- account. Its own pet with a foreign event id is refused 23514 whether that
-- event exists or not (the lookup requires e.pet_id = NEW.pet_id). An UPDATE
-- aimed at a foreign looks row never reaches the trigger, because looks_owner's
-- USING hides the row first. The row-id existence oracle 082 states (23505 on a
-- reused primary key) is platform-generic and unchanged.
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
--   Destructive:  n. One function body replaced. No table, column, policy,
--                 grant, trigger or row is touched.
--   Backfill:     N/A. Existing rows already passed the stricter-or-equal check
--                 (every client write is the owner's own, and RLS refused the
--                 rest).
--   Rollback:     re-run 064's CREATE OR REPLACE FUNCTION block (§5, the
--                 enforce_look_paired_event_same_pet definition) as written; it
--                 restores the pre-083 body. Its REVOKEs and COMMENT can be re-run
--                 too.
--   Ordering:     after 082. No client change depends on it; the app's writes are
--                 always the owner's own pet and see no difference.
--   After:        run the VERIFY block at the foot of this file, then
--                 get_advisors (security + performance).
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
  'CUL-867 / B-520: same-pet guard for looks.event_id, bounding looks.local_day to ±1 day of the parent event''s UTC date (E-2). CUL-1457 (083): for a signed-in caller the row''s pet must be the caller''s, checked before the parent lookup, so every write naming another account''s pet gets one code and one message (closes the 42501/23514 date and membership oracle). SECURITY DEFINER, search_path pinned to '''', EXECUTE revoked from PUBLIC/anon/authenticated.';


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
-- 4. The probe (CUL-1457): as `authenticated` with a zero-pet JWT, insert a looks
--    row naming a real (pet, check_in event) pair of another account, sweeping
--    local_day across the parent's date ±3. Every attempt must return SQLSTATE
--    23514 with a message holding only the values sent. Before 083 the three
--    days around the parent's date return 42501.
