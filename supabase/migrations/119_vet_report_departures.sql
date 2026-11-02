-- ============================================================
-- Migration 119: a saved vet report lists every time it was sent
--   (CUL-2445; plan and PM go (a) on CUL-2445, 2026-11-02)
-- See: docs/nyx-vet-report-v2-requirements.md §11.3 (GAP-26: "one copy per
--      snapshot; each departure appends to its row");
--      113_vet_report_saved_copies.sql (shared_via / shared_at, the kept-copy
--      freeze that lets them move); 114 (a kept copy is deleted only with its
--      pet or account, and its id never comes back); 118 (the live client
--      freeze body, untouched here);
--      supabase/functions/generate-report/savedCopy.ts (markKept / restamp,
--      the two writes that move the stamp; unchanged by this file).
-- ============================================================
--
-- THE GAP
-- ------------------------------------------------------------
-- vet_reports keeps one departure stamp, shared_via / shared_at, and keepCopy
-- restamps it on every later send of the same copy. An owner who emails a
-- copy and later prints it sees only "Printed": the earlier send is gone.
--
-- THE SHAPE AFTER THIS FILE
-- ------------------------------------------------------------
--   Table     public.vet_report_departures, one row per send of a kept copy:
--             (report_id, pet_id, shared_via, shared_at). The stamp on
--             vet_reports stays, as the LATEST departure (the library sorts on
--             it); this table is the whole list.
--   Writer    The database, not the Edge Function. An AFTER INSERT OR UPDATE
--             trigger on vet_reports writes one departure whenever a kept row's
--             (shared_via, shared_at) is new: the keep (draft -> kept, 113's
--             one write) and every restamp. Same transaction as the stamp, so a
--             send can never move the stamp and miss the log, and every writer
--             is covered. savedCopy.ts is unchanged. A conflict on the
--             departure's natural key is skipped (ON CONFLICT DO NOTHING), so
--             logging can never fail a send.
--   Same pet  Structural: the FK is (report_id, pet_id) -> vet_reports(id,
--             pet_id), backed by a new UNIQUE (id, pet_id). A departure cannot
--             name another pet's report, and a report's pet cannot move while
--             it has departures (NO ACTION). 113's freeze already pins a kept
--             row's pet; this holds on any row with a departure.
--   Truthful  A BEFORE INSERT guard admits a departure only for a KEPT report
--             whose current stamp IS this departure: report id, pet, status
--             'kept', shared_via and shared_at all equal NEW's. So even the
--             migration owner cannot log a send the report never stamped; the
--             most a direct insert can do is repeat the latest one, which the
--             natural key refuses. SECURITY DEFINER (it reads vet_reports
--             whoever writes), one RAISE naming only NEW.* (C-31).
--   Append    No UPDATE, ever, for any writer (BEFORE UPDATE refuses). A
--   only      DELETE is refused while its report still exists, 114's
--             parent-exists form: a cascade runs after the report row is gone,
--             so pet and account deletion pass. TRUNCATE is refused.
--   Access    RLS on. One policy: SELECT TO authenticated, the departure's pet
--             is the caller's (044's form). anon: nothing. authenticated and
--             service_role: SELECT only. No role holds INSERT, UPDATE, DELETE,
--             TRUNCATE, REFERENCES or TRIGGER; the trigger writes as the table
--             owner.
--   Deletion  ON DELETE CASCADE from vet_reports, which cascades from pets and
--             auth.users. A departure holds no Storage path, so delete-account
--             has nothing new to read or sweep.
--   Freeze    113's vet_reports_content_freeze and 118's client freeze are
--             untouched: shared_via / shared_at were already in both control
--             sets as needed, and the UNIQUE adds no column, so their to_jsonb
--             comparisons see the same row.
--
-- WHAT IS NOT CLOSED, stated:
--   * Sends before this file. Each restamp overwrote the last, so only a kept
--     copy's latest send is known; §6 backfills that one. An earlier send of a
--     copy kept before 119 is not recoverable and is not listed.
--   * shared_at is still the writer's claim (113's residual), now bounded: §4
--     admits a departure only between its report's creation and now (5 minutes
--     of clock slack each way; rls-privacy-reviewer pass 1, F1). Inside that
--     band the service role can still log a send that did not happen, and the
--     list keeps it: append only means no one can remove it while the copy
--     exists. generate-report stamps server time; nothing else writes it.
--     The lower bound reads created_at, which 113 freezes only once kept: a
--     server writer that back-dates a DRAFT's created_at can then keep it with
--     an old stamp (pass 2, P2-1). No code path writes created_at.
--   * A later-named BEFORE INSERT trigger on vet_report_departures could
--     rewrite NEW after §4 has judged it (pass 2, P2-2). Owner DDL, the same
--     class as DISABLE TRIGGER below; guards/vetReportsPolicy.test.ts pins the
--     four triggers this file creates.
--   * "Latest" is the latest WRITTEN stamp, not the latest instant (pass 1,
--     F2): two sends racing can commit out of order, so vet_reports.shared_at
--     may trail the newest departure by the race's width. The detail screen
--     reads this table, ordered by time, so it shows every send in order; the
--     library list sorts on the stamp.
--   * ALTER TABLE ... DISABLE TRIGGER, like session_replication_role below, is
--     the table owner's and turns the append-only guard off (pass 1, F4).
--   * Export (B-041, not built): departures are the owner's data and belong in
--     the export when it lands (pass 1, F4).
--   * Two sends of one copy in the same millisecond by the same route are one
--     departure (the natural key). Both sends still succeed.
--   * session_replication_role = replica skips every trigger, the logger
--     included (113's residual; only the owner or a superuser can set it).
--   * A pet that changed owner would expose its departures to the new owner,
--     as it would the report itself. 115 makes pets.user_id immutable.
--
-- ------------------------------------------------------------
-- MIGRATION SAFETY PRE-FLIGHT
-- ------------------------------------------------------------
--   Destructive:  n. One table, one UNIQUE constraint on vet_reports, four
--                 functions and five triggers added. No column, row or policy
--                 of an existing table changed.
--   Backfill:     §6: one departure per kept vet_reports row, from its current
--                 shared_via / shared_at. §4's time bound applies to it, so
--                 before applying (expect 0; a row here fails the apply whole):
--                   SELECT count(*) FROM public.vet_reports
--                    WHERE status = 'kept'
--                      AND (shared_at < created_at - interval '5 minutes'
--                           OR shared_at > now() + interval '5 minutes');
--                 Count to expect afterwards:
--                   SELECT count(*) FROM public.vet_reports WHERE status = 'kept';
--                 equals
--                   SELECT count(*) FROM public.vet_report_departures;
--   Rollback:
--                   DROP TRIGGER trg_vet_reports_log_departure ON public.vet_reports;
--                   DROP FUNCTION public.vet_reports_log_departure();
--                   DROP TABLE public.vet_report_departures;  -- its triggers go with it
--                   DROP FUNCTION public.vet_report_departure_is_stamp();
--                   DROP FUNCTION public.vet_report_departures_append_only();
--                   ALTER TABLE public.vet_reports DROP CONSTRAINT vet_reports_id_pet_unique;
--   Ordering:     after 118. Nothing reads the table until the library's code
--                 PR, which merges only after this is applied.
--   After:        the VERIFY block at the foot, then get_advisors (security +
--                 performance).
-- ============================================================


-- ============================================================
-- §1. The key the departures hang from
-- ============================================================
-- id is already the primary key, so (id, pet_id) is unique by construction;
-- the constraint exists so a composite FK can reference it.
ALTER TABLE public.vet_reports
  ADD CONSTRAINT vet_reports_id_pet_unique UNIQUE (id, pet_id);


-- ============================================================
-- §2. The table
-- ============================================================
CREATE TABLE public.vet_report_departures (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id   uuid        NOT NULL,
  pet_id      uuid        NOT NULL,
  shared_via  text        NOT NULL,
  shared_at   timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vet_report_departures_report_same_pet
    FOREIGN KEY (report_id, pet_id)
    REFERENCES public.vet_reports (id, pet_id)
    ON DELETE CASCADE,
  -- 113's bound on vet_reports.shared_via.
  CONSTRAINT vet_report_departures_shared_via_bounded
    CHECK (length(shared_via) BETWEEN 1 AND 32),
  CONSTRAINT vet_report_departures_once
    UNIQUE (report_id, shared_at, shared_via)
);

-- The detail screen's read: one copy's sends, newest first, on a total key.
CREATE INDEX idx_vet_report_departures_report
  ON public.vet_report_departures (report_id, shared_at DESC, id DESC);
-- The policy's pet test.
CREATE INDEX idx_vet_report_departures_pet
  ON public.vet_report_departures (pet_id);

COMMENT ON TABLE public.vet_report_departures IS
  'CUL-2445 (119): one row per time a kept vet report left the phone (spec §11.3, GAP-26). Written only by trg_vet_reports_log_departure, in the transaction that moves vet_reports.shared_via / shared_at; a departure must equal its report''s stamp when written (vet_report_departure_is_stamp). Append only; leaves only with its report, which leaves only with its pet or account. Owners read their own pets'' rows; no role writes it directly.';


-- ============================================================
-- §3. Access
-- ============================================================
ALTER TABLE public.vet_report_departures ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.vet_report_departures FROM PUBLIC;
REVOKE ALL ON public.vet_report_departures FROM anon;
REVOKE ALL ON public.vet_report_departures FROM authenticated;
REVOKE ALL ON public.vet_report_departures FROM service_role;
GRANT SELECT ON public.vet_report_departures TO authenticated;
GRANT SELECT ON public.vet_report_departures TO service_role;

CREATE POLICY vet_report_departures_owner_select
  ON public.vet_report_departures
  FOR SELECT
  TO authenticated
  USING (pet_id IN (SELECT p.id FROM public.pets p WHERE p.user_id = (SELECT auth.uid())));


-- ============================================================
-- §4. A departure is its report's stamp, and is never edited
-- ============================================================
CREATE OR REPLACE FUNCTION public.vet_report_departure_is_stamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
       SELECT 1 FROM public.vet_reports r
        WHERE r.id = NEW.report_id
          AND r.pet_id = NEW.pet_id
          AND r.status = 'kept'
          AND r.shared_via = NEW.shared_via
          AND r.shared_at = NEW.shared_at
          -- A send is no earlier than its copy and no later than now (rls-privacy-reviewer
          -- pass 1, F1): an append-only list must not hold a stamp the writer invented. Five
          -- minutes of slack each way for the Edge Function's clock against the database's.
          AND NEW.shared_at >= r.created_at - interval '5 minutes'
          AND NEW.shared_at <= now() + interval '5 minutes'
     ) THEN
    -- NEW.* only, one message for every cause (C-31).
    RAISE EXCEPTION
      'vet_report_departures: report % (pet %) is not a kept copy stamped % at %',
      NEW.report_id, NEW.pet_id, NEW.shared_via, NEW.shared_at
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.vet_report_departure_is_stamp() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vet_report_departure_is_stamp() FROM anon;
REVOKE ALL ON FUNCTION public.vet_report_departure_is_stamp() FROM authenticated;
REVOKE ALL ON FUNCTION public.vet_report_departure_is_stamp() FROM service_role;

CREATE TRIGGER trg_vet_report_departures_is_stamp
  BEFORE INSERT ON public.vet_report_departures
  FOR EACH ROW EXECUTE FUNCTION public.vet_report_departure_is_stamp();

COMMENT ON FUNCTION public.vet_report_departure_is_stamp() IS
  'CUL-2445 (119): a vet_report_departures row is admitted only when its report is kept, is the same pet, and carries exactly this shared_via and shared_at now, and that time falls between the report''s created_at and now (5 minutes of clock slack each way), so no writer, the owner included, can log a send the report never stamped. The time bound is only as strong as created_at, which a server writer can still move on a DRAFT (113 freezes it once kept; rls-privacy-reviewer pass 2, P2-1). SECURITY DEFINER (reads vet_reports for any writer), search_path pinned, EXECUTE revoked from every caller role; one RAISE naming only NEW.* (C-31).';

CREATE OR REPLACE FUNCTION public.vet_report_departures_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION
      'vet_report_departures: TRUNCATE is refused; departures leave only with their report'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION
      'vet_report_departures: a departure is never edited'
      USING ERRCODE = 'check_violation';
  END IF;
  -- DELETE: a cascade from vet_reports runs after the report row is gone.
  IF EXISTS (SELECT 1 FROM public.vet_reports r WHERE r.id = OLD.report_id) THEN
    RAISE EXCEPTION
      'vet_report_departures: a departure is deleted only with its report'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.vet_report_departures_append_only() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vet_report_departures_append_only() FROM anon;
REVOKE ALL ON FUNCTION public.vet_report_departures_append_only() FROM authenticated;
REVOKE ALL ON FUNCTION public.vet_report_departures_append_only() FROM service_role;

CREATE TRIGGER trg_vet_report_departures_no_update
  BEFORE UPDATE ON public.vet_report_departures
  FOR EACH ROW EXECUTE FUNCTION public.vet_report_departures_append_only();

CREATE TRIGGER trg_vet_report_departures_no_delete
  BEFORE DELETE ON public.vet_report_departures
  FOR EACH ROW EXECUTE FUNCTION public.vet_report_departures_append_only();

CREATE TRIGGER trg_vet_report_departures_no_truncate
  BEFORE TRUNCATE ON public.vet_report_departures
  FOR EACH STATEMENT EXECUTE FUNCTION public.vet_report_departures_append_only();

COMMENT ON FUNCTION public.vet_report_departures_append_only() IS
  'CUL-2445 (119): vet_report_departures is append only for every writer. UPDATE and TRUNCATE are refused; a DELETE is refused while its report still exists (114''s parent-exists form), so only the cascade from vet_reports (itself only from pets or auth.users, 114) removes one. SECURITY DEFINER (reads vet_reports), search_path pinned, EXECUTE revoked; messages name no value (C-31).';


-- ============================================================
-- §5. The writer: every new stamp on a kept copy is logged
-- ============================================================
-- AFTER, so it logs the row as stored. Fires on a row inserted kept, and on an
-- UPDATE that leaves a row kept with a stamp it did not have before: 113's
-- one-write keep (draft -> kept) and every restamp. A link change, a token
-- expiry or an updated_at stamp moves neither column and logs nothing.
CREATE OR REPLACE FUNCTION public.vet_reports_log_departure()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'kept'
     AND NEW.shared_at IS NOT NULL
     AND (
       TG_OP = 'INSERT'
       OR OLD.status IS DISTINCT FROM 'kept'
       OR NEW.shared_via IS DISTINCT FROM OLD.shared_via
       OR NEW.shared_at  IS DISTINCT FROM OLD.shared_at
     ) THEN
    INSERT INTO public.vet_report_departures (report_id, pet_id, shared_via, shared_at)
    VALUES (NEW.id, NEW.pet_id, NEW.shared_via, NEW.shared_at)
    ON CONFLICT ON CONSTRAINT vet_report_departures_once DO NOTHING;
    -- Nothing inserted is right only when the departure is already there (the natural key).
    -- Anything else (a later rule or trigger that swallowed the write) fails the send loudly
    -- rather than lose the departure (pass 1, F3; 114's row-count form).
    IF NOT FOUND AND NOT EXISTS (
         SELECT 1 FROM public.vet_report_departures d
          WHERE d.report_id = NEW.id AND d.shared_at = NEW.shared_at AND d.shared_via = NEW.shared_via
       ) THEN
      RAISE EXCEPTION
        'vet_reports: the departure of report % was not recorded', NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.vet_reports_log_departure() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vet_reports_log_departure() FROM anon;
REVOKE ALL ON FUNCTION public.vet_reports_log_departure() FROM authenticated;
REVOKE ALL ON FUNCTION public.vet_reports_log_departure() FROM service_role;

CREATE TRIGGER trg_vet_reports_log_departure
  AFTER INSERT OR UPDATE ON public.vet_reports
  FOR EACH ROW EXECUTE FUNCTION public.vet_reports_log_departure();

COMMENT ON FUNCTION public.vet_reports_log_departure() IS
  'CUL-2445 (119): writes one vet_report_departures row each time a kept vet_reports row carries a new (shared_via, shared_at): the keep and every restamp, in the same transaction. ON CONFLICT DO NOTHING on the natural key, so a repeated stamp never fails a send; a write swallowed by anything else does (one RAISE naming only NEW.id, C-31). SECURITY DEFINER (no role holds INSERT on the table), search_path pinned, EXECUTE revoked.';


-- ============================================================
-- §6. Backfill: each kept copy's latest send
-- ============================================================
-- The only departure known for a copy kept before this file (see WHAT IS NOT
-- CLOSED). §4's guard admits each row, since it is the report's own stamp.
INSERT INTO public.vet_report_departures (report_id, pet_id, shared_via, shared_at)
SELECT r.id, r.pet_id, r.shared_via, r.shared_at
  FROM public.vet_reports r
 WHERE r.status = 'kept'
ON CONFLICT ON CONSTRAINT vet_report_departures_once DO NOTHING;


-- ============================================================
-- VERIFY (run by hand after apply; read-only)
-- ============================================================
--   1. The backfill:
--        SELECT (SELECT count(*) FROM public.vet_reports WHERE status = 'kept') AS kept,
--               (SELECT count(*) FROM public.vet_report_departures) AS departures;
--      -> equal.
--   2. Grants:
--        SELECT grantee, privilege_type FROM information_schema.role_table_grants
--         WHERE table_schema = 'public' AND table_name = 'vet_report_departures'
--         ORDER BY grantee, privilege_type;
--      -> authenticated SELECT, service_role SELECT (and the owner's own).
--   3. RLS and the one policy:
--        SELECT relrowsecurity FROM pg_class WHERE oid = 'public.vet_report_departures'::regclass;
--        SELECT policyname, cmd, roles FROM pg_policies
--         WHERE schemaname = 'public' AND tablename = 'vet_report_departures';
--      -> t; one row: vet_report_departures_owner_select, SELECT, {authenticated}.
--   4. Triggers:
--        SELECT tgname, tgfoid::regproc FROM pg_trigger
--         WHERE tgrelid IN ('public.vet_report_departures'::regclass, 'public.vet_reports'::regclass)
--           AND NOT tgisinternal AND tgname LIKE '%departure%' ORDER BY tgname;
--      -> trg_vet_report_departures_is_stamp, _no_delete, _no_truncate,
--         _no_update, trg_vet_reports_log_departure.
--   5. No client EXECUTE:
--        SELECT p.proname,
--               has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
--               has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authed,
--               has_function_privilege('service_role', p.oid, 'EXECUTE') AS service
--          FROM pg_proc p
--         WHERE p.pronamespace = 'public'::regnamespace
--           AND p.proname IN ('vet_report_departure_is_stamp',
--                             'vet_report_departures_append_only',
--                             'vet_reports_log_departure');
--      -> f, f, f on every row.
--   6. The behaviour: the probe in the PR (scripts/probes/vet-report-119/run.sh).
