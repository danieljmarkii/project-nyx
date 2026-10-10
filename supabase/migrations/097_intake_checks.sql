-- ============================================================
-- Migration 097: intake_checks, the stored answer to "Has she eaten?"
--   (Engines v3 PR-30m)
-- See: CUL-1723 (the row; its plan comment, PM go 2026-10-10);
--      CUL-1136 (EN-5, intake evidence; the plan comment of 2026-10-09 that
--      split this migration out of PR-30);
--      docs/clinical-ruling-sheet-2026-10.md §2.0a, §2.7 (I1 to I5);
--      064_looks.sql (the mutable, synced child-of-an-event shape);
--      082_care_record.sql (the guard's ownership arm).
-- Nothing reads or writes this table yet. PR-30q is the first client writer
-- (the question under the read) and the first server reader (analyze-vomit).
-- ============================================================
--
-- WHY ITS OWN TABLE (CUL-1136's plan)
-- ------------------------------------------------------------
-- The answer could be stored as a synthetic meal row. It must not be: a meal row
-- counts as a food exposure (CUL-1190), pushes real refusals out of the Noticed
-- last-three window, and has no honest home for "Not sure" or "Haven't seen".
-- So the answer is its own fact, about ONE vomit, and never pretends to be a meal.
--
-- WHAT A ROW SAYS
-- ------------------------------------------------------------
--   event_id     The vomit the question was asked under. Checked by the guard
--                to be a `vomit` event of this row's own pet.
--   since        The instant the question asks from ("since 6 PM yesterday").
--                Stored, never re-derived, so a reader judges the answer over
--                the window the owner was actually asked about.
--   form         Which question was asked: meal_fed (Has she eaten?), free_fed
--                (Have you seen her eat?, I2) or other_food (Could he have
--                eaten something else?, the dog and trial door).
--   answer       The MEANING, never the words. "Not sure" and "Haven't seen"
--                both store not_observable (the ruling sheet: intake not
--                observable, never normal), so no wording or pronoun lands at
--                rest. a_little is offered only on meal_fed and stores as a
--                Picked rating for the engine (I3), so the CHECK refuses it on
--                the other two forms.
--   answered_at  The device's time of the tap. The reader's ordering key.
--
-- A SKIPPED QUESTION WRITES NO ROW. No row is unknown, never normal (GAP-22).
--
-- NO UNIQUENESS ON event_id, ON PURPOSE. Two devices can answer the same vomit
-- offline. A unique key would refuse the second push with a terminal 23505 and
-- quarantine it. The reader's rule instead (PR-30q): per vomit, the newest row
-- with deleted_at IS NULL by answered_at, then id, wins. A changed answer on one
-- device is an UPDATE of its own row (last-write-wins on updated_at, C-23).
--
-- DELETEDNESS. deleted_at is the row's own soft delete (an owner clearing her
-- answer). A soft-deleted VOMIT is read through events.deleted_at: a reader joins
-- events, as every looks reader does, and an answer under a deleted vomit counts
-- for nothing.
--
-- ------------------------------------------------------------
-- THE SAME-PET GUARD (082's shape, with an UPDATE arm)
-- ------------------------------------------------------------
-- A foreign key is checked without RLS: it proves the event exists, not whose it
-- is. So a BEFORE trigger checks it.
--   INSERT  The event must be a `vomit` of NEW.pet_id. For a signed-in caller
--           (auth.uid() set), NEW.pet_id must also be the caller's pet. That arm
--           closes the 42501-vs-23514 membership oracle that 064 and 066
--           disclosed: every insert naming another account's pet is refused
--           here, with one code and one message, whether the pair is real or
--           not. BEFORE ROW triggers run ahead of RLS WITH CHECK and the FK.
--           The service role has no user and gets the same-pet check alone.
--   UPDATE  id, pet_id, event_id, since and form are frozen. A row never moves
--           to another vomit, another pet or another question. The sync upsert
--           sends them unchanged, so IS DISTINCT FROM OLD is false and nothing
--           is looked up. That is also what keeps the row repairable (C-38): a
--           later re-type of the vomit, or a parent move, re-validates nothing
--           here, so an answer edit is never bricked on a terminal 23514.
-- Posture B-520 from birth: SECURITY DEFINER (the lookup is not RLS-filtered),
-- search_path = pg_catalog, pg_temp (072: pg_temp last), EXECUTE revoked from
-- PUBLIC, anon and authenticated (trigger firing does not check EXECUTE).
-- Registered in lib/functionHardening.test.ts.
-- C-31: the one RAISE names only NEW.* values. Nothing read from the event (its
-- type, its pet, its time) reaches the message.
--
-- WHAT IS NOT CLOSED, stated: the platform-generic row-id existence oracle. An
-- INSERT reusing another account's primary key fails with 23505 where a fresh id
-- succeeds. It needs an unguessable UUID that no path hands out (082's finding).
--
-- ------------------------------------------------------------
-- WHAT ELSE CAN MOVE (C-38)
-- ------------------------------------------------------------
--   * The parent event's pet_id or event_type. An events UPDATE re-validates no
--     child (the class-wide CUL-882 gap 023 / 041 / 064 / 074 / 082 carry). The
--     events RLS confines a move to the owner's own pets, so it never crosses
--     accounts, and the app has no path that moves an event between pets. A
--     re-typed vomit leaves its answer readable; a reader that joins events and
--     filters event_type = 'vomit' drops it.
--   * answer, answered_at, deleted_at and updated_at, by the owner, on her own
--     rows. That is the table's purpose.
--   * Nothing else. The guard freezes the rest, and no client role holds DELETE.
--   * PR-30q's writer: the guard runs before the FK, so an answer pushed before
--     its offline-created vomit has synced fails with a terminal 23514, not a
--     retryable 23503. Push the parent event first (082's note, same reason).
--
-- ------------------------------------------------------------
-- THE PRIVACY LINE (R-5, MFU-6)
-- ------------------------------------------------------------
--   Free text: none. Every text column is CHECK-bounded to a fixed set, so
--              nothing an owner types can be stored here and nothing here can
--              reach a model as prose. guards/intakeChecks.test.ts pins it.
--   Readers:   no Edge Function reads the table in this PR. The guard's reader
--              allow-set is EMPTY (C-32), and it requires an explicit column list
--              of any reader PR-30q adds (analyze-vomit). generate-report and ask
--              may never name it: whether the report shows an intake answer is
--              not ruled.
--   Export:    the owner's own pet data, in the export scope beside the events.
--              Doc-only today, because no export function exists (B-041).
--   Deletion:  cascades from pets, and so from auth.users through delete-account.
--              The events FK cascades too, so neither FK blocks a parent's delete.
--              No new bucket, no new secret, no model call.
--   Device:    no local mirror in this PR. PR-30q adds the SQLite mirror, and
--              hydration.test.ts refuses to build it unless it is in
--              LOCAL_WIPE_TABLES (082's split).
--
-- ------------------------------------------------------------
-- THE FLAG
-- ------------------------------------------------------------
-- Seeds engines_v3_en5 off, in 075's shape: {"enabled": false, "allowlist": []},
-- ON CONFLICT DO NOTHING, so a re-apply never touches a live row and a committed
-- seed never carries a uid. The flag fails closed, so the seed turns nothing on.
-- It exists so the PM can allowlist an account without hand-writing the row.
--
-- ------------------------------------------------------------
-- MIGRATION SAFETY PRE-FLIGHT
-- ------------------------------------------------------------
--   Destructive:  n. One new table, one new function, two triggers on the new
--                 table, and one app_config row inserted only if absent. No
--                 existing table, column, policy, grant or row is touched.
--   Backfill:     N/A. No answer exists before the question ships.
--   Rollback:     DROP TABLE IF EXISTS public.intake_checks;
--                 DROP FUNCTION IF EXISTS public.enforce_intake_check_same_pet();
--                 DELETE FROM public.app_config WHERE key = 'engines_v3_en5';
--                 Nothing writes the table until PR-30q ships.
--   Ordering:     after 096. Nothing depends on it until PR-30q.
--   After:        run the VERIFY block at the foot of this file, then
--                 get_advisors (security + performance).
-- ============================================================


-- ============================================================
-- 1. The table
-- ============================================================
CREATE TABLE public.intake_checks (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id       UUID        NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  event_id     UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  since        TIMESTAMPTZ NOT NULL,
  form         TEXT        NOT NULL CHECK (form IN ('meal_fed', 'free_fed', 'other_food')),
  answer       TEXT        NOT NULL CHECK (answer IN ('yes', 'a_little', 'no', 'not_observable')),
  answered_at  TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ,
  -- "A little" is offered only on the meal-fed question (I3: it stores as Picked).
  CONSTRAINT intake_checks_a_little_is_meal_fed
    CHECK (answer <> 'a_little' OR form = 'meal_fed')
);

COMMENT ON TABLE public.intake_checks IS
  'Migration 097 (Engines v3 PR-30m, CUL-1723; EN-5, CUL-1136): the owner''s answer to the one-tap intake question under a vomit read. Its own fact about ONE vomit, never a meal row. Mutable and synced last-write-wins; soft-deleted by deleted_at, and a soft-deleted vomit is read through events.deleted_at. No uniqueness on event_id: per vomit, the newest live row by answered_at (then id) wins. No free text. Never reaches the vet report or Ask until ruled. Cascades from pets and events.';
COMMENT ON COLUMN public.intake_checks.answer IS
  'The meaning, never the words. not_observable is "Not sure" and "Haven''t seen" (never normal). a_little is meal_fed only and stores as a Picked rating for the engine (I3). A skipped question writes no row.';
COMMENT ON COLUMN public.intake_checks.since IS
  'The instant the question asks from ("since 6 PM yesterday"), stored as asked so a reader judges the answer over the window the owner saw.';
COMMENT ON COLUMN public.intake_checks.form IS
  'Which question was asked: meal_fed (Has she eaten?), free_fed (Have you seen her eat?, I2), other_food (Could he have eaten something else?, the dog and trial door). Frozen after insert.';

-- The reader's lookup (newest answer per vomit), and the FK the events cascade
-- walks (the unindexed-FK advisor).
CREATE INDEX intake_checks_event_idx ON public.intake_checks (event_id, answered_at DESC);
CREATE INDEX intake_checks_pet_idx   ON public.intake_checks (pet_id, answered_at DESC);


-- ============================================================
-- 2. Triggers: updated_at, and the same-pet guard
-- ============================================================
-- set_updated_at() from 001 (search_path pinned by 047): every server write
-- stamps updated_at = NOW(), the sync layer's last-write-wins basis (C-23).
CREATE TRIGGER trg_intake_checks_updated_at
  BEFORE UPDATE ON public.intake_checks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

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
    -- The caller's own pet (when there is a caller), and that pet's vomit. One
    -- NOT EXISTS shape, so a missing event, another pet's event, a non-vomit and
    -- another account's pet all land on the same RAISE. Fail closed.
    SELECT EXISTS (
      SELECT 1
        FROM public.pets p
        JOIN public.events e ON e.pet_id = p.id
       WHERE p.id = NEW.pet_id
         AND (me IS NULL OR p.user_id = me)
         AND e.id = NEW.event_id
         AND e.event_type::text = 'vomit'
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
  'CUL-1723 (097) / B-520: BEFORE INSERT OR UPDATE on intake_checks. INSERT: event_id must be a vomit of NEW.pet_id, and for a signed-in caller that pet must be the caller''s (closes the 42501-vs-23514 membership oracle, 082''s arm). UPDATE: id, pet_id, event_id, since and form are frozen, and nothing is looked up, so an answer edit is never bricked by a moved parent (C-38). SECURITY DEFINER so the lookup is not RLS-filtered; search_path = pg_catalog, pg_temp (072); EXECUTE revoked from PUBLIC/anon/authenticated. One RAISE naming only NEW.* (C-31).';

CREATE TRIGGER trg_intake_checks_same_pet
  BEFORE INSERT OR UPDATE ON public.intake_checks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_intake_check_same_pet();


-- ============================================================
-- 3. RLS: the owner reads, inserts and updates her own rows; nobody deletes
-- ============================================================
-- TO authenticated on every policy (026: a policy with no TO clause applies to
-- public, which includes anon). `(SELECT auth.uid())` is evaluated once per
-- statement (auth_rls_initplan). No DELETE policy: soft delete only, so RLS
-- default-denies a DELETE even if a grant ever came back. The cascade runs as
-- the table owner and is untouched.
ALTER TABLE public.intake_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "intake_checks_read_own" ON public.intake_checks
  FOR SELECT TO authenticated
  USING (pet_id IN (SELECT id FROM public.pets WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "intake_checks_insert_own" ON public.intake_checks
  FOR INSERT TO authenticated
  WITH CHECK (pet_id IN (SELECT id FROM public.pets WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "intake_checks_update_own" ON public.intake_checks
  FOR UPDATE TO authenticated
  USING (pet_id IN (SELECT id FROM public.pets WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (pet_id IN (SELECT id FROM public.pets WHERE user_id = (SELECT auth.uid())));


-- ============================================================
-- 4. Grants: RLS decides which rows; grants decide which verbs and columns
-- ============================================================
-- Supabase's default privileges hand anon, authenticated and service_role every
-- verb at CREATE time. Revoke it, then give authenticated SELECT and INSERT /
-- UPDATE on every column but created_at, which is the server's. The sync push is
-- an upsert (ON CONFLICT DO UPDATE), which needs both verbs on every column it
-- names; the guard, not the grant, is what freezes the identity columns.
-- service_role keeps SELECT, INSERT and UPDATE (a future server writer) and
-- loses DELETE and TRUNCATE: soft delete only, for every role but the cascade.
--
-- MAINTENANCE WARNING: never GRANT DELETE or TRUNCATE on this table to any role,
-- and never a table-level GRANT INSERT or UPDATE, which would re-cover
-- created_at. Extend the column lists; never re-grant at the table level.
REVOKE ALL ON TABLE public.intake_checks FROM anon, authenticated;
REVOKE DELETE, TRUNCATE ON TABLE public.intake_checks FROM service_role;

GRANT SELECT ON TABLE public.intake_checks TO authenticated;
GRANT INSERT (id, pet_id, event_id, since, form, answer, answered_at, updated_at, deleted_at)
  ON TABLE public.intake_checks TO authenticated;
GRANT UPDATE (id, pet_id, event_id, since, form, answer, answered_at, updated_at, deleted_at)
  ON TABLE public.intake_checks TO authenticated;


-- ============================================================
-- 5. The flag: engines_v3_en5, seeded off (075's shape)
-- ============================================================
INSERT INTO public.app_config (key, value) VALUES
  ('engines_v3_en5', '{"enabled": false, "allowlist": []}'::jsonb)
ON CONFLICT (key) DO NOTHING;


-- ------------------------------------------------------------
-- VERIFY (run after applying; read-only)
-- ------------------------------------------------------------
--   SELECT policyname, cmd FROM pg_policies
--    WHERE tablename = 'intake_checks' ORDER BY 1;
--     -- intake_checks_insert_own | INSERT; intake_checks_read_own | SELECT;
--     -- intake_checks_update_own | UPDATE (no DELETE policy)
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--    WHERE table_name = 'intake_checks'
--      AND grantee IN ('anon','authenticated','service_role')
--    ORDER BY 1, 2;
--     -- authenticated: SELECT only (INSERT / UPDATE are per column, in
--     --   column_privileges, and never on created_at);
--     -- service_role: INSERT, REFERENCES, SELECT, TRIGGER, UPDATE (no DELETE / TRUNCATE);
--     -- anon: nothing
--   SELECT tgname, tgenabled FROM pg_trigger
--    WHERE tgrelid = 'public.intake_checks'::regclass AND NOT tgisinternal;
--     -- trg_intake_checks_same_pet, trg_intake_checks_updated_at, both 'O'
--   SELECT prosecdef, proconfig FROM pg_proc
--    WHERE proname = 'enforce_intake_check_same_pet';
--     -- t | {"search_path=pg_catalog, pg_temp"}
--   SELECT value FROM public.app_config WHERE key = 'engines_v3_en5';
--     -- {"enabled": false, "allowlist": []}
