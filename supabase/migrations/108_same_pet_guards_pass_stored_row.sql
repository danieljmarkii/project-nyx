-- ============================================================
-- Migration 108: four same-pet guards pass a row they already store
--   (Mixed meals adhoc, CUL-2064; 105's shape carried to the live guards)
-- See: CUL-2064 (the issue; its plan comment, PM go 2026-10-22);
--      105_meal_components.sql (the template: the stored-row arm);
--      082_care_record.sql (the caller arm);
--      066_vet_appointments.sql (the IS DISTINCT FROM OLD predicate, C-38).
-- Replaces four function bodies and revokes anon's grants on two of their
-- tables (§5). No table, column, trigger or policy changes; every trigger stays
-- bound to the function it already calls.
-- ============================================================
--
-- THE BUG (rls-privacy-reviewer on 105, reproduced here for all four)
-- ------------------------------------------------------------
-- The sync push is INSERT ... ON CONFLICT (id) DO UPDATE (lib/sync.ts pushRows).
-- PostgreSQL fires the BEFORE INSERT trigger on the proposed row before it finds
-- the conflict, so a guard's INSERT arm runs on EVERY push of a row, not only
-- the first. A guard whose INSERT arm looks up the parent therefore re-judged
-- the parent each time. Once the parent moved to another pet or changed type
-- after the first push, every later edit of the child was refused on a terminal
-- 23514 and quarantined on the phone (the C-38 brick). Three of the four were
-- wider still: they had no TG_OP split, so a plain UPDATE bricked too, and so
-- did an FK action: deleting a medication whose dose kept a moved pairing was
-- refused, because the ON DELETE SET NULL update fired 023's guard
-- (rls-privacy-reviewer's L1, measured).
--
-- Measured on a scratch PG16 (001 to 107 replayed; the four bodies md5-equal to
-- production), before this file: 11 of 11 unchanged-row edits after a parent
-- move or re-type refused 23514, across all four guards, upsert and UPDATE
-- alike, the service role included.
--
-- No screen moves an event or a trial between pets, or re-types an event, so
-- no owner should have hit this. The events and diet_trials RLS allows both,
-- confined to the owner's own pets, and an edit of an event's time across more
-- than a day reaches the looks bound today.
--
-- THE FIX, one shape for all four (105's)
-- ------------------------------------------------------------
--   Caller arm   For a signed-in caller (auth.uid() set), NEW.pet_id must be
--                the caller's pet, checked before anything else is read. 097
--                and 083 already had it; 041 and 023 gain it. It equals each
--                table's owner policy (pets.user_id = auth.uid()), so it
--                refuses no write RLS would have allowed, and it closes the
--                42501-vs-23514 membership oracle 041 and 023 still carried
--                (measured before this file: another account naming a real
--                trial or event got 42501, a made-up one got 23514). The
--                service role has no user and skips it, as before.
--   INSERT arm   The parent check as before, OR this row already stored with
--                the same identity (id, pet and parent, plus each table's
--                other frozen columns). The second arm is the upsert's: an
--                unchanged row re-pushed is the row the table already holds,
--                so re-judging its parent can only brick it. A fresh row, or a
--                row whose identity changed, still needs a valid parent.
--   UPDATE arm   Reads nothing when the identity is unchanged (IS NOT DISTINCT
--                FROM OLD). 097 freezes its identity, as it did. 064 / 041 /
--                023 let it change, and a changed one is checked against the
--                parent exactly as an insert is (066's predicate). On 041 and
--                023 the row's own id is in that set too (below).
--   Key lock     The stored-row read takes FOR KEY SHARE on the row it matches.
--                Without it, an owner's PATCH of a stored row's id (or a DELETE)
--                raced against an upsert of the old id let the upsert pass this
--                arm on the committed row, then find no conflict and INSERT a
--                fresh row on the moved parent (rls-privacy-reviewer on this
--                file's first draft, two sessions, measured). With the lock the
--                upsert waits for the key change, re-reads the row's new
--                version, finds no match and is judged on the parent alone.
-- One RAISE per function, naming only NEW.* values (C-31), and the same code
-- and message for every cause: no parent, another pet's parent, a wrong type,
-- another account's pet. Posture B-520 kept: SECURITY DEFINER (the lookups are
-- not RLS-filtered), search_path pinned as each function already had it,
-- EXECUTE revoked from PUBLIC, anon and authenticated (restated; CREATE OR
-- REPLACE keeps the ACL). Registered in lib/functionHardening.test.ts; the arms
-- are pinned by guards/samePetStoredRow.test.ts.
--
-- Why the stored-row arm sits behind the caller arm: under DEFINER it reads
-- every tenant's rows. With the caller arm in front, another account reusing a
-- row id lands on the same RAISE whether that id exists or not, so the arm
-- answers nothing about another account's rows.
--
-- The caller arm trusts every request with no user (the service role). The
-- anon key carries none either, and anon held every verb on diet_trial_foods
-- and medication_administrations (read live 2026-10-22), so an anon POST still
-- told a real (pet, trial / event) pair from a made-up one (42501 vs 23514),
-- and would have told whether a stored row exists. §5 revokes those two tables
-- from anon, as 083 did for looks; intake_checks and meal_components never
-- granted anon anything. No client path writes these tables without a user:
-- RLS already refused every anon write.
--
-- WHAT IS NOT CLOSED, stated (each predates this file):
--   * A child at rest on a moved parent stays as it is: writable, readable,
--     never re-judged (the CUL-882 class: an events or diet_trials UPDATE
--     re-validates no child). This file makes such a row editable, never valid.
--     A reader joining the parent's type or pet still sees what it saw.
--   * The platform-generic row-id existence oracle (an upsert reusing another
--     account's primary key with ON CONFLICT DO NOTHING; 097's list). Unchanged.
--   * A stored row can still be soft-deleted, edited in its non-identity
--     columns or revived while its parent stands moved: "editable, never
--     valid" above, by design. A new row on the moved parent cannot be made
--     that way (the key lock), and a key change on 041 / 023 is judged as an
--     insert is.
--   * Two pushes of the same row on a moved parent arriving together (two
--     devices; one device's queue is serialized) can deadlock: both hold the
--     key lock and each conflict path wants the row exclusively. One gets
--     40P01, which the client retries (not a terminal code, so never
--     quarantined). Before this file both were refused outright.
--     (rls-privacy-reviewer pass 2, measured with a widened window.)
--   * On 097, 041 and 023 the caller arm and the stored-row read share one
--     EXISTS, so the stored-row read running only after the caller arm is the
--     planner's order (measured: another account's request never took or
--     waited on the owner's lock, 0.03s vs 2.5s). In the worst case the lock
--     lands on a row of NEW.pet_id, the statement then fails, and the lock is
--     released with it. Looks orders it procedurally.
--   * Looks: an unchanged local_day is no longer re-bounded after the parent's
--     time moves. The day is what the table already held; re-judging it only
--     bricked the edit, it never corrected the day. The client re-derives the
--     day on a time change (C-10), and the changed day is bounded as before.
--
-- ------------------------------------------------------------
-- MIGRATION SAFETY PRE-FLIGHT
-- ------------------------------------------------------------
--   Destructive:  n. Four function bodies replaced; anon's grants on
--                 diet_trial_foods and medication_administrations revoked
--                 (RLS refused every anon write already). Nothing else.
--   Backfill:     N/A. Every stored row already passed the stricter check.
--   Rollback:     re-run the four prior definitions, which leaves the triggers
--                 bound and the ACL as it is. Capture them BEFORE applying:
--                   SELECT string_agg(pg_get_functiondef(p.oid) || ';', E'\n')
--                     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--                    WHERE n.nspname = 'public'
--                      AND p.proname IN ('enforce_intake_check_same_pet',
--                                        'enforce_look_paired_event_same_pet',
--                                        'enforce_diet_trial_food_same_pet',
--                                        'enforce_dose_paired_event_same_pet');
--                 (Measured on the replay: that output run after this file put
--                 all four prosrc md5s back to production's, DEFINER kept,
--                 EXECUTE still revoked.) The same bodies live in 097, 083, and
--                 041 / 023 as flipped by 047 PART 3.
--                 §5:  GRANT ALL ON TABLE public.diet_trial_foods TO anon;
--                      GRANT ALL ON TABLE public.medication_administrations TO anon;
--                 Rolling back re-opens the brick and 041 / 023's oracle.
--   Ordering:     after 107. No client change depends on it.
--   After:        the VERIFY block at the foot, then get_advisors (security +
--                 performance).
-- ============================================================


-- ============================================================
-- §1. intake_checks (097): the stored-row arm
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_intake_check_same_pet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  me  uuid := auth.uid();
  ok  boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Frozen identity. Reads nothing, so an unchanged row is never re-judged.
    ok := NEW.id       IS NOT DISTINCT FROM OLD.id
      AND NEW.pet_id   IS NOT DISTINCT FROM OLD.pet_id
      AND NEW.event_id IS NOT DISTINCT FROM OLD.event_id
      AND NEW.since    IS NOT DISTINCT FROM OLD.since
      AND NEW.form     IS NOT DISTINCT FROM OLD.form;
  ELSE
    -- The caller's own pet (when there is a caller), and either that pet's
    -- vomit or this row already stored with the same frozen identity. The
    -- second arm is the sync upsert, which fires this INSERT arm on every push
    -- (CUL-2064). One EXISTS shape, so a missing event, another pet's event, a
    -- non-vomit and another account's pet all land on the same RAISE. Fail
    -- closed.
    SELECT EXISTS (
      SELECT 1
        FROM public.pets p
       WHERE p.id = NEW.pet_id
         AND (me IS NULL OR p.user_id = me)
         AND (
           EXISTS (
             SELECT 1 FROM public.events e
              WHERE e.id = NEW.event_id
                AND e.pet_id = p.id
                AND e.event_type::text = 'vomit'
           )
           OR EXISTS (
             SELECT 1 FROM public.intake_checks ic
              WHERE ic.id = NEW.id
                AND ic.pet_id = NEW.pet_id
                AND ic.event_id = NEW.event_id
                AND ic.since = NEW.since
                AND ic.form = NEW.form
                FOR KEY SHARE
           )
         )
    ) INTO ok;
  END IF;

  IF NOT ok THEN
    -- NEW.* only, one message for every cause (C-31). Never the event's type,
    -- pet or time: under DEFINER that is another tenant's data.
    RAISE EXCEPTION
      'intake_checks.pet_id % must be the caller''s pet, event_id % that pet''s vomit, and neither may change',
      NEW.pet_id, NEW.event_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_intake_check_same_pet() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_intake_check_same_pet() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_intake_check_same_pet() FROM authenticated;

COMMENT ON FUNCTION public.enforce_intake_check_same_pet() IS
  'CUL-1723 (097) / CUL-2064 (108) / B-520: BEFORE INSERT OR UPDATE on intake_checks. INSERT: for a signed-in caller NEW.pet_id must be the caller''s pet (082''s arm), and event_id a vomit of that pet OR this row already stored with the same id, pet_id, event_id, since and form (the sync upsert fires this arm on every push, so without it a re-typed or moved parent bricks every later answer edit). UPDATE: id, pet_id, event_id, since and form are frozen, and nothing is looked up (C-38). SECURITY DEFINER so the lookup is not RLS-filtered; search_path = pg_catalog, pg_temp (072); EXECUTE revoked from PUBLIC/anon/authenticated. One RAISE naming only NEW.* (C-31).';


-- ============================================================
-- §2. looks (064 / 083): the UPDATE split and the stored-row arm
-- ============================================================
-- local_day is not frozen: "change time" across midnight re-derives it on the
-- client (C-10). So the UPDATE arm reads nothing only while the identity and
-- the day are unchanged, and a changed day is bounded against the parent
-- exactly as an insert is (E-2 kept for every new or changed day).
CREATE OR REPLACE FUNCTION public.enforce_look_paired_event_same_pet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  me         uuid := auth.uid();
  parent_day DATE;
  ok         boolean := false;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.id        IS NOT DISTINCT FROM OLD.id
     AND NEW.pet_id    IS NOT DISTINCT FROM OLD.pet_id
     AND NEW.event_id  IS NOT DISTINCT FROM OLD.event_id
     AND NEW.local_day IS NOT DISTINCT FROM OLD.local_day THEN
    -- Unchanged identity and day. Reads nothing, so it is never re-judged.
    RETURN NEW;
  END IF;

  -- The caller arm comes first: another account's pet never reaches the parent
  -- lookup or the stored-row lookup, so nothing either would find can change
  -- the answer.
  IF me IS NULL
     OR EXISTS (SELECT 1 FROM public.pets p
                 WHERE p.id = NEW.pet_id AND p.user_id = me) THEN
    SELECT (e.occurred_at AT TIME ZONE 'UTC')::date
      INTO parent_day
      FROM public.events e
     WHERE e.id = NEW.event_id
       AND e.pet_id = NEW.pet_id
       AND e.event_type::text = 'check_in';

    ok := parent_day IS NOT NULL
          AND NEW.local_day BETWEEN parent_day - 1 AND parent_day + 1;

    -- The sync upsert fires this arm on every push (CUL-2064): an INSERT that
    -- is this row already stored, unchanged in identity and day, passes.
    IF NOT ok AND TG_OP = 'INSERT' THEN
      ok := EXISTS (
        SELECT 1 FROM public.looks l
         WHERE l.id = NEW.id
           AND l.pet_id = NEW.pet_id
           AND l.event_id = NEW.event_id
           AND l.local_day = NEW.local_day
           FOR KEY SHARE
      );
    END IF;
  END IF;

  -- ONE raise, and it names only what the caller sent. Never parent_day (C-31).
  IF NOT ok THEN
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
  'CUL-867 / CUL-1457 (083) / CUL-2064 (108) / B-520: same-pet guard for looks.event_id, bounding looks.local_day to ±1 day of the parent event''s UTC date (E-2). For a signed-in caller the row''s pet must be the caller''s, checked before any lookup. An UPDATE that leaves id, pet_id, event_id and local_day unchanged reads nothing (C-38); a changed one is checked as an insert is. An INSERT also passes when it is this row already stored with the same id, pet_id, event_id and local_day (the sync upsert fires the INSERT arm on every push). SECURITY DEFINER, search_path pinned to '''', EXECUTE revoked from PUBLIC/anon/authenticated. One RAISE naming only NEW.* (C-31).';


-- ============================================================
-- §3. diet_trial_foods (041): caller arm, UPDATE split, stored-row arm
-- ============================================================
-- 041's argument "NEW.pet_id has already been RLS-verified" did not hold: a
-- BEFORE trigger runs ahead of RLS WITH CHECK. The caller arm makes it true for
-- every signed-in write, and closes the membership oracle that gap left.
CREATE OR REPLACE FUNCTION public.enforce_diet_trial_food_same_pet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  me  uuid := auth.uid();
  ok  boolean;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.id            IS NOT DISTINCT FROM OLD.id
     AND NEW.diet_trial_id IS NOT DISTINCT FROM OLD.diet_trial_id
     AND NEW.pet_id        IS NOT DISTINCT FROM OLD.pet_id THEN
    -- Unchanged id, trial and pet. Reads nothing, so a moved trial never
    -- bricks the row (C-38). id is in the set because a key change on a
    -- moved trial, raced against an upsert of the old id, would otherwise let
    -- that upsert pass the stored-row arm and then insert a fresh row.
    RETURN NEW;
  END IF;

  -- The caller's own pet (when there is a caller), and either a trial of that
  -- pet or, on INSERT, this row already stored with the same id, pet and trial
  -- (the sync upsert fires the INSERT arm on every push, CUL-2064). One EXISTS
  -- shape, one RAISE for every cause. Fail closed.
  SELECT EXISTS (
    SELECT 1
      FROM public.pets p
     WHERE p.id = NEW.pet_id
       AND (me IS NULL OR p.user_id = me)
       AND (
         EXISTS (
           SELECT 1 FROM public.diet_trials t
            WHERE t.id = NEW.diet_trial_id
              AND t.pet_id = p.id
         )
         OR (TG_OP = 'INSERT' AND EXISTS (
           SELECT 1 FROM public.diet_trial_foods f
            WHERE f.id = NEW.id
              AND f.pet_id = NEW.pet_id
              AND f.diet_trial_id = NEW.diet_trial_id
              FOR KEY SHARE
         ))
       )
  ) INTO ok;

  IF NOT ok THEN
    -- NEW.* only (C-31).
    RAISE EXCEPTION
      'diet_trial_id % must reference a diet trial for the same pet (%)',
      NEW.diet_trial_id, NEW.pet_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_diet_trial_food_same_pet() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_diet_trial_food_same_pet() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_diet_trial_food_same_pet() FROM authenticated;

COMMENT ON FUNCTION public.enforce_diet_trial_food_same_pet() IS
  'B-417 (041) / B-520 / CUL-2064 (108): diet_trial_id must reference a diet trial of the row''s own pet, so no row grants a permit for the wrong pet or names another account''s trial. For a signed-in caller NEW.pet_id must be the caller''s pet, checked first (closes the 42501-vs-23514 membership oracle). An UPDATE that leaves diet_trial_id and pet_id unchanged reads nothing (C-38); a changed one is checked as an insert is. An INSERT also passes when it is this row already stored with the same id, pet_id and diet_trial_id (the sync upsert fires the INSERT arm on every push). A trigger, not a policy, because service-role callers bypass RLS. SECURITY DEFINER so the lookup is not RLS-filtered; search_path pinned to ''''; EXECUTE revoked from PUBLIC/anon/authenticated. One RAISE naming only NEW.* (C-31).';


-- ============================================================
-- §4. medication_administrations (023): caller arm, UPDATE split, stored-row arm
-- ============================================================
-- The NULL fast path stays: a standalone dose pays a NULL test and nothing else.
CREATE OR REPLACE FUNCTION public.enforce_dose_paired_event_same_pet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  me  uuid := auth.uid();
  ok  boolean;
BEGIN
  IF NEW.paired_event_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.id              IS NOT DISTINCT FROM OLD.id
     AND NEW.paired_event_id IS NOT DISTINCT FROM OLD.paired_event_id
     AND NEW.pet_id          IS NOT DISTINCT FROM OLD.pet_id THEN
    -- Unchanged id, pairing and pet. Reads nothing, so a moved paired event
    -- never bricks the dose (C-38). id is in the set for 041's reason.
    RETURN NEW;
  END IF;

  -- The caller's own pet (when there is a caller), and either an event of that
  -- pet or, on INSERT, this row already stored with the same id, pet and
  -- pairing (the sync upsert fires the INSERT arm on every push, CUL-2064).
  -- One EXISTS shape, one RAISE for every cause. Fail closed.
  SELECT EXISTS (
    SELECT 1
      FROM public.pets p
     WHERE p.id = NEW.pet_id
       AND (me IS NULL OR p.user_id = me)
       AND (
         EXISTS (
           SELECT 1 FROM public.events e
            WHERE e.id = NEW.paired_event_id
              AND e.pet_id = p.id
         )
         OR (TG_OP = 'INSERT' AND EXISTS (
           SELECT 1 FROM public.medication_administrations a
            WHERE a.id = NEW.id
              AND a.pet_id = NEW.pet_id
              AND a.paired_event_id = NEW.paired_event_id
              FOR KEY SHARE
         ))
       )
  ) INTO ok;

  IF NOT ok THEN
    -- NEW.* only (C-31).
    RAISE EXCEPTION
      'paired_event_id % must reference an event for the same pet (%)',
      NEW.paired_event_id, NEW.pet_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_dose_paired_event_same_pet() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_dose_paired_event_same_pet() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_dose_paired_event_same_pet() FROM authenticated;

COMMENT ON FUNCTION public.enforce_dose_paired_event_same_pet() IS
  'B-023 (023) / B-520 / CUL-2064 (108): same-pet guard for medication_administrations.paired_event_id. A NULL pairing reads nothing. For a signed-in caller NEW.pet_id must be the caller''s pet, checked first (closes the 42501-vs-23514 membership oracle). An UPDATE that leaves paired_event_id and pet_id unchanged reads nothing (C-38); a changed one is checked as an insert is. An INSERT also passes when it is this row already stored with the same id, pet_id and paired_event_id (the sync upsert fires the INSERT arm on every push). SECURITY DEFINER so the lookup is not RLS-filtered; search_path pinned to ''''; EXECUTE revoked from PUBLIC/anon/authenticated. One RAISE naming only NEW.* (C-31).';


-- ============================================================
-- §5. anon, the other user-less role (083's precedent for looks)
-- ============================================================
REVOKE ALL ON TABLE public.diet_trial_foods FROM anon;
REVOKE ALL ON TABLE public.medication_administrations FROM anon;


-- ============================================================
-- VERIFY (run by hand after apply; read-only)
-- ============================================================
--   1. The four bodies carry the arms, and the posture held:
--        SELECT p.proname, p.prosecdef, p.proconfig,
--               p.prosrc LIKE '%auth.uid()%'      AS caller_arm,
--               p.prosrc ~ 'FROM public\.(intake_checks|looks|diet_trial_foods|medication_administrations) ' AS stored_row_arm,
--               has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authed_exec,
--               has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_exec
--          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--         WHERE n.nspname = 'public'
--           AND p.proname IN ('enforce_intake_check_same_pet',
--                             'enforce_look_paired_event_same_pet',
--                             'enforce_diet_trial_food_same_pet',
--                             'enforce_dose_paired_event_same_pet');
--      -> 4 rows: prosecdef t, proconfig pinned, caller_arm t, stored_row_arm t,
--         authed_exec f, anon_exec f.
--   2. The triggers are still bound to them:
--        SELECT tgrelid::regclass, tgname, tgfoid::regproc FROM pg_trigger
--         WHERE tgname IN ('trg_intake_checks_same_pet', 'trg_looks_same_pet',
--                          'trg_diet_trial_foods_same_pet',
--                          'trg_medication_administrations_paired_same_pet');
--      -> 4 rows, each naming its function above.
--   3. anon holds nothing on the two tables:
--        SELECT t, has_table_privilege('anon', t, 'INSERT,UPDATE,SELECT,DELETE')
--          FROM unnest(ARRAY['public.diet_trial_foods',
--                            'public.medication_administrations']) t;
--      -> 2 rows, f.
--   4. The behaviour, in a rolled-back transaction as the owner: move one of
--      her own events to her other pet, upsert an unchanged child of it
--      (ON CONFLICT (id) DO UPDATE) -> succeeds; a fresh child on the moved
--      event -> 23514. The full probe (45 cases, two accounts) is in the PR.
