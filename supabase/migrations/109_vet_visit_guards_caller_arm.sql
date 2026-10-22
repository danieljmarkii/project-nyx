-- ============================================================
-- Migration 109: the vet visit and vet document guards answer a stranger once
--   (Mixed meals adhoc, CUL-2105; 108's caller arm carried to the last two)
-- See: CUL-2105 (the issue; its plan comment, PM go 2026-10-22);
--      108_same_pet_guards_pass_stored_row.sql (the shape, and §5's revoke);
--      082_care_record.sql (the caller arm);
--      067_vet_visit_link_parent_guard.sql, 045_vet_documents_write_guards.sql
--      (the two bodies replaced here).
-- Replaces two function bodies and revokes anon's grants on the four tables
-- they guard (§3). No table, column, trigger or policy changes; every trigger
-- stays bound to the function it already calls.
-- ============================================================
--
-- THE BUG (rls-privacy-reviewer on 108, X6 / X7; measured live on diet_trials)
-- ------------------------------------------------------------
-- A BEFORE trigger runs ahead of RLS WITH CHECK, and under SECURITY DEFINER its
-- lookup sees every tenant. Neither guard asked who the caller was, so another
-- account (or the anon key) naming a victim's pet and a vet visit learned from
-- the error code whether the visit is that pet's: a real pair passed the guard
-- and RLS refused it (42501), a made-up pair was refused by the guard (23514).
-- 045's document group check answered a second question the same way: whether
-- a document group belongs to some pet other than the one named.
--
-- Measured on a scratch PG16 (001 to 108 replayed; the two bodies logic-equal
-- to production, which holds them with the comments stripped), before this
-- file: on medications, diet_trials, vet_appointments and vet_documents,
-- another account and anon both got 42501 for a real (pet, visit) pair and
-- 23514 for a made-up one; on vet_documents both got 23514 for a real document
-- group and 42501 for a made-up one.
--
-- THE FIX (108's shape)
-- ------------------------------------------------------------
--   Caller arm   For a signed-in caller (auth.uid() set), NEW.pet_id must be
--                the caller's pet, checked before anything else is read. It
--                equals each table's owner policy (pets.user_id = auth.uid()),
--                so it refuses no write RLS would have allowed. Another
--                account now lands on one 23514 whatever it names. The service
--                role has no user and skips it, as before.
--   anon         Has no user either, so the caller arm cannot tell it from the
--                service role. §3 revokes the four tables from anon, as 083 did
--                for looks and 108 for diet_trial_foods and
--                medication_administrations. No client path writes or reads
--                them without a user (the sync push returns without a session;
--                every Edge Function that uses the anon key sends the caller's
--                Authorization header), and RLS already refused every anon
--                write. anon now gets 42501 permission denied before any
--                trigger runs.
-- No stored-row arm (108's second arm): vet_visits.pet_id is frozen by 067, so
-- an unchanged row re-pushed always passes the visit check again, and 045's
-- group check excludes the row itself (d.id <> NEW.id).
--
-- On vet_documents the caller arm sits ahead of the advisory lock too, so
-- another account can no longer take, or wait on, an owner's group lock.
--
-- Posture B-520 kept: SECURITY DEFINER, search_path pinned to '', EXECUTE
-- revoked from PUBLIC, anon and authenticated (restated; CREATE OR REPLACE
-- keeps the ACL). Pinned by guards/samePetCallerArm.test.ts.
--
-- WHAT IS NOT CLOSED, stated (each predates this file):
--   * The platform-generic row-id existence oracle (an upsert reusing another
--     account's primary key; 097's list). On vet_documents the group check is
--     a case of it for an owner writing her own pet: naming another account's
--     real document_group_id (which equals the document's id on a one-page
--     document) is refused 23514 where a made-up one inserts. It confirms that
--     an id exists, never whose pet it is.
--   * anon keeps the platform's default grants on the other public tables
--     (events, pets, vet_visits and more). None of them has a DEFINER guard
--     that reads before RLS, so none answers this question; RLS refuses every
--     anon write there.
--   * In enforce_vet_visit_link_same_pet the caller arm and the visit read
--     share one EXISTS, so the caller arm running first is the planner's
--     order (as 108's 097 / 041 / 023). It takes no lock, so the only signal
--     left is timing on an index probe.
--
-- ------------------------------------------------------------
-- MIGRATION SAFETY PRE-FLIGHT
-- ------------------------------------------------------------
--   Destructive:  n. Two function bodies replaced; anon's grants on
--                 medications, diet_trials, vet_appointments and vet_documents
--                 revoked (RLS refused every anon write already). Nothing else.
--   Backfill:     N/A. Every stored row was written by its owner or the
--                 service role, both of which this file still admits.
--   Rollback:     re-run the two prior definitions, which leaves the triggers
--                 bound and the ACL as it is. Capture them BEFORE applying:
--                   SELECT string_agg(pg_get_functiondef(p.oid) || ';', E'\n')
--                     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--                    WHERE n.nspname = 'public'
--                      AND p.proname IN ('enforce_vet_visit_link_same_pet',
--                                        'enforce_vet_document_pet_scope');
--                 Production's prosrc md5s before this file (2026-10-22):
--                   enforce_vet_visit_link_same_pet  b92a30eecfa52cf52b509b36ff1fa1b0
--                   enforce_vet_document_pet_scope   65cf840dcb98e1b8dd161c1cceadaff9
--                 The same logic lives in 067 §2 and 045.
--                 §3, anon held arwdDxtm on all four (read 2026-10-22):
--                   GRANT ALL ON TABLE public.medications TO anon;
--                   GRANT ALL ON TABLE public.diet_trials TO anon;
--                   GRANT ALL ON TABLE public.vet_appointments TO anon;
--                   GRANT ALL ON TABLE public.vet_documents TO anon;
--                 Rolling back re-opens both oracles.
--   Ordering:     after 108. No client change depends on it.
--   After:        the VERIFY block at the foot, then get_advisors (security +
--                 performance).
-- ============================================================


-- ============================================================
-- §1. medications, diet_trials, vet_appointments (066 / 067): the caller arm
-- ============================================================
-- 067's firing condition is kept: the guard reads only when a link is set and
-- the row is new or its link or pet changed. The read gains the caller arm.
CREATE OR REPLACE FUNCTION public.enforce_vet_visit_link_same_pet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF NEW.vet_visit_id IS NOT NULL
     AND (
       TG_OP = 'INSERT'
       OR NEW.vet_visit_id IS DISTINCT FROM OLD.vet_visit_id
       OR NEW.pet_id      IS DISTINCT FROM OLD.pet_id
     )
     AND NOT EXISTS (
       -- The caller's own pet (when there is a caller), and a visit of that
       -- pet. One EXISTS shape, so another account's pet, a missing visit and
       -- another pet's visit all land on the same RAISE.
       SELECT 1
         FROM public.pets p
        WHERE p.id = NEW.pet_id
          AND (me IS NULL OR p.user_id = me)
          AND EXISTS (
            SELECT 1 FROM public.vet_visits v
             WHERE v.id = NEW.vet_visit_id
               AND v.pet_id = p.id
          )
     ) THEN
    -- NEW.* only, one message for every cause (C-31). Unchanged from 066.
    RAISE EXCEPTION
      'vet_visit_id % must reference a vet visit for the same pet (%)',
      NEW.vet_visit_id, NEW.pet_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_vet_visit_link_same_pet() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_vet_visit_link_same_pet() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_vet_visit_link_same_pet() FROM authenticated;

COMMENT ON FUNCTION public.enforce_vet_visit_link_same_pet() IS
  'CUL-899 VV-1 (066, amended by 067) / CUL-2105 (109): defense-at-rest guard over the three bare FKs to vet_visits (vet_appointments, medications, diet_trials). FK checks bypass RLS, so a bare FK verifies only that the target EXISTS. Fires only when a link is set and the row is new or its link or pet changes (067: re-validating every write bricked rows). For a signed-in caller NEW.pet_id must be the caller''s pet, read in the same EXISTS as the visit, so another account gets one 23514 whatever pair it names (109 closes the 42501-vs-23514 membership oracle 067''s header disclosed). anon holds no grant on the three tables (109). SECURITY DEFINER, search_path pinned to '''', EXECUTE revoked from PUBLIC/anon/authenticated. One RAISE naming only NEW.* (C-31).';


-- ============================================================
-- §2. vet_documents (045): the caller arm first
-- ============================================================
-- Ahead of the storage_path check, the advisory lock and both reads. Only the
-- new arm is added; 045's three checks are unchanged.
CREATE OR REPLACE FUNCTION public.enforce_vet_document_pet_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  me uuid := auth.uid();
BEGIN
  -- The caller's own pet, when there is a caller. Another account lands here
  -- whatever visit or group it names, before anything is read or locked.
  IF me IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.pets p
     WHERE p.id = NEW.pet_id
       AND p.user_id = me
  ) THEN
    -- NEW.* only (C-31).
    RAISE EXCEPTION
      'vet_documents.pet_id % must be the caller''s pet',
      NEW.pet_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- storage_path is immutable (045 FINDING 2). IS DISTINCT FROM so the upsert
  -- path, which re-sends the same value on conflict, still passes.
  IF TG_OP = 'UPDATE' AND NEW.storage_path IS DISTINCT FROM OLD.storage_path THEN
    RAISE EXCEPTION
      'storage_path is immutable (document %); it is derived from the document id and is the only handle the deletion purge has on the stored object',
      NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Serialise writers that share a document group before the read below
  -- (045 FINDING 3). Transaction-scoped.
  PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.document_group_id::text, 0));

  -- (a) The optional visit link belongs to the row's own pet.
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

  -- (b) Every page of one document group belongs to one pet. The message names
  -- only the writer's own ids.
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

REVOKE ALL ON FUNCTION public.enforce_vet_document_pet_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_vet_document_pet_scope() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_vet_document_pet_scope() FROM authenticated;

COMMENT ON FUNCTION public.enforce_vet_document_pet_scope() IS
  'B-478 VF-1 (044, hardened by 045 and B-520) / CUL-2105 (109): defense-at-rest guard over the references RLS cannot constrain on vet_documents: vet_visit_id (a bare FK) and document_group_id (no FK), plus storage_path immutability. For a signed-in caller NEW.pet_id must be the caller''s pet, checked first, ahead of the advisory lock and every read, so another account gets one 23514 whatever visit or group it names (109 closes the membership oracle both checks carried). anon holds no grant on vet_documents (109). SECURITY DEFINER because an INVOKER group check failed OPEN (045); an advisory lock closes that check''s TOCTOU race; search_path pinned to ''''; EXECUTE revoked from PUBLIC/anon/authenticated. Each RAISE names only NEW.* (C-31).';


-- ============================================================
-- §3. anon, the other user-less role (083's and 108's precedent)
-- ============================================================
REVOKE ALL ON TABLE public.medications FROM anon;
REVOKE ALL ON TABLE public.diet_trials FROM anon;
REVOKE ALL ON TABLE public.vet_appointments FROM anon;
REVOKE ALL ON TABLE public.vet_documents FROM anon;


-- ============================================================
-- VERIFY (run by hand after apply; read-only)
-- ============================================================
--   1. The two bodies carry the arm, and the posture held:
--        SELECT p.proname, p.prosecdef, p.proconfig,
--               p.prosrc LIKE '%auth.uid()%' AS caller_arm,
--               has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authed_exec,
--               has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_exec
--          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--         WHERE n.nspname = 'public'
--           AND p.proname IN ('enforce_vet_visit_link_same_pet',
--                             'enforce_vet_document_pet_scope');
--      -> 2 rows: prosecdef t, proconfig {search_path=""}, caller_arm t,
--         authed_exec f, anon_exec f.
--   2. The triggers are still bound to them:
--        SELECT tgrelid::regclass, tgname, tgfoid::regproc FROM pg_trigger
--         WHERE tgname IN ('trg_medications_visit_same_pet',
--                          'trg_diet_trials_visit_same_pet',
--                          'trg_vet_appointments_visit_same_pet',
--                          'trg_vet_documents_pet_scope');
--      -> 4 rows, each naming its function above.
--   3. anon holds nothing on the four tables:
--        SELECT t, has_table_privilege('anon', t, 'INSERT,UPDATE,SELECT,DELETE')
--          FROM unnest(ARRAY['public.medications', 'public.diet_trials',
--                            'public.vet_appointments', 'public.vet_documents']) t;
--      -> 4 rows, f.
--   4. The behaviour: the probe in the PR (another account and anon naming a
--      real and a made-up pair, and the owner's and service role's writes).
