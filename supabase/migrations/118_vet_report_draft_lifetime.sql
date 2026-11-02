-- ============================================================
-- Migration 118: a vet report draft's AI summary leaves on time
--   (CUL-2377, with CUL-2437; plan and PM go on CUL-2377, 2026-11-02)
-- See: 100_ai_consent.sql (the consent table this fires on);
--      110 / 113 (the client freeze this widens by one arm);
--      supabase/functions/reap-report-drafts (the reaper the schedule calls);
--      supabase/functions/generate-report/savedCopy.ts (the reap flow).
-- ============================================================
--
-- TWO PROMISES, EACH ALREADY WRITTEN DOWN, NEITHER KEPT BEFORE THIS FILE
-- ------------------------------------------------------------
-- 1. An unsent draft (and the AI summary stored on it) is removed 24 hours
--    after it was made (spec §11.1; 113's own COMMENT on status). Until now the
--    only reaper ran inside the owner's next Preview of the same pet, so a
--    draft could outlive its day by months (CUL-2437).
-- 2. An owner's "no" to `report_summary` or `ai_boundary` clears the summary
--    on their unsent drafts at once (CUL-2377). Until now it was cleared only
--    lazily, at the next AI summary request for that draft.
-- Kept copies are untouched by both: a sent report stays exactly as sent
-- (113's content freeze; PM ruling (a) on promise 4, recorded on CUL-2331).
--
-- §1. THE WITHDRAWAL CLEAR
-- ------------------------------------------------------------
-- The app writes ai_consent directly (lib/aiConsent.ts), so the database is the
-- one place that sees every "no" at the moment it is given. An AFTER trigger on
-- ai_consent, for a `granted = false` row of either scope, nulls ai_lead_text,
-- ai_lead_verdict and ai_lead_model on every DRAFT row that owner made. The
-- verdict goes too: it holds the printed sentences and the checker's quotes.
-- The stored draft HTML carries no summary (it is rendered before one exists:
-- aiLead/run.ts settleLeadForKeep), so the three columns are the whole of it.
--
-- `generated_by` is the owner: 113's maker guard binds the maker to the pet's
-- owner, and 115 makes a pet's owner immutable.
--
-- A FAILED CLEAR NEVER REFUSES THE "NO". The UPDATE runs in its own
-- subtransaction; an error there is a WARNING and the consent write commits.
-- Refusing it would lose the owner's withdrawal itself, which is the worse
-- failure. A failed clear is still bounded: the summary pipeline re-runs the
-- consent gate and clears on its next read, and §3's reaper removes the whole
-- draft within 24 h 15 m of its making.
--
-- A WAIT ON A LOCKED DRAFT IS BOUNDED (rls-privacy-reviewer, pass 1, F4). The
-- function carries lock_timeout = 2s, so a draft row held by another write
-- becomes a caught 55P03 (a WARNING) and never the request's statement
-- timeout (57014), which no handler catches and which would refuse the "no".
--
-- §1b. A SUMMARY WRITTEN AFTER THE "NO" IS REFUSED (rls-privacy-reviewer,
-- pass 1, F1). §1 clears what exists at the moment of the "no"; the summary
-- pipeline checks consent before its model calls and writes up to a minute
-- later. A BEFORE INSERT OR UPDATE trigger on vet_reports therefore refuses a
-- draft write that puts model output in the summary columns (ai_lead_text,
-- ai_lead_model, or a verdict carrying `sentences` or `checker`) unless the
-- maker holds a yes to BOTH scopes. The pipeline reads a refused write as
-- `draft_not_found` and returns no summary (aiLead/leadPipeline.ts record).
-- Verdicts with no model output (declined, left out, the keep's settle) pass.
-- It reads the two consent rows FOR SHARE SKIP LOCKED, so the write NEVER
-- waits on a consent row:
--   * a "no" being written holds its row, which the write skips; a skipped
--     row is not a yes, so the write is refused (fail closed);
--   * a write that read them first holds them FOR SHARE, so the "no" waits
--     for it, and §1's clear then finds the summary and removes it.
-- A plain FOR SHARE deadlocked with §1 (rls-privacy-reviewer pass 2, F1:
-- §1b holds the draft row and waits on consent, §1 holds consent and waits on
-- the draft row; measured, 94 of 300 races left a summary behind a "no").
-- With SKIP LOCKED the cycle cannot form. The cost is that a write landing
-- during ANY consent write by the same owner (a yes re-given) is refused too,
-- which the pipeline reads as no summary this time.
-- It judges every INSERT and every UPDATE of a row that WAS a draft (pass 2,
-- F3: a draft-to-kept write in one statement must not carry a summary past it).
-- The wording version of a yes is not checked here (it lives in code,
-- REPORT_SUMMARY_COPY_VERSION); the pipeline's gate checks it.
--
-- §2. ONE NEW ARM IN 110's CLIENT FREEZE
-- ------------------------------------------------------------
-- §1's UPDATE runs inside the owner's own PostgREST request. 110's freeze reads
-- the session role, which a SECURITY DEFINER function cannot hide, so without
-- this arm the freeze would refuse the clear (and, before §1's subtransaction,
-- the owner's "no" with it). The arm makes a draft's three summary columns
-- going to NULL compare as unmoved, and only when all of these hold:
--   * pg_trigger_depth() > 1: inside a trigger, never a client's own statement;
--   * current_user is not a client role: inside a DEFINER function (or a server
--     role), never an INVOKER trigger a client could reach;
--   * OLD.status = 'draft' (a status change still fails the comparison);
--   * all three columns are NULL in NEW.
-- Erasing an owner's own draft summary is all it permits. A client holds no
-- column grant on the three columns (110), so it could not write them anyway.
-- The rest of the body is 113's, verbatim.
--
-- §3. THE SCHEDULE
-- ------------------------------------------------------------
-- pg_cron is available on this project and not installed (read 2026-11-02;
-- 047 recorded it absent); pg_net 0.20.0 is installed in `extensions`. SQL
-- cannot remove a Storage object, so the reaper is an Edge Function
-- (reap-report-drafts) and pg_cron calls it every 15 minutes through pg_net.
-- It removes every draft older than 24 h, objects first, then rows. A draft
-- therefore leaves between 24 h and 24 h 15 m after it was made.
--
-- NO NEW SECRET. The call carries the project's anon key, which every Edge
-- Function's verify_jwt accepts. It is public by design: it ships in the app
-- and is committed in eas.json (docs/secrets-register.md: "Public;
-- RLS-gated"). It grants nothing here: the function takes no input and uses its
-- own platform-provided service role, and a call can only remove drafts that
-- are already past their day. PM ruling (a) on CUL-2377, 2026-11-02, over
-- Vault. If the key is ever rotated, re-run cron.schedule below with the new
-- key (the same name replaces the job).
--
-- The body names the sweep: the function refuses `{}` with a 400 (the
-- deploy's boot check sends `{}` with this same key and needs a 4xx that does
-- nothing), so only this job's call reaps.
--
-- If the function is not deployed yet when this applies, each call answers
-- 404 into net._http_response and nothing else happens.
--
-- Migration Safety Pre-flight
-- ------------------------------------------------------------
--   Destructive:  n. One trigger and one function added on ai_consent; one
--                 trigger and one function added on vet_reports (§1b); one
--                 arm added to an existing function; one extension and one
--                 scheduled job added. No column, row or policy changed.
--   Backfill:     N/A. 0 draft rows hold a summary (report_ai_lead is off and
--                 nothing has written one).
--   Rollback:
--                   SELECT cron.unschedule('reap-vet-report-drafts');
--                   DROP EXTENSION pg_cron;
--                   DROP TRIGGER trg_ai_consent_clear_draft_summary ON public.ai_consent;
--                   DROP FUNCTION public.clear_draft_summary_on_withdrawal();
--                   DROP TRIGGER trg_vet_reports_summary_needs_consent ON public.vet_reports;
--                   DROP FUNCTION public.vet_reports_summary_needs_consent();
--                   -- then re-run 113 §7b's CREATE OR REPLACE FUNCTION
--                   -- public.vet_reports_client_freeze() and its COMMENT.
--   Ordering:     after 117. reap-report-drafts may deploy before or after;
--                 until it does, the calls 404.
--   After:        the VERIFY block at the foot, then get_advisors (security +
--                 performance).
-- ============================================================


-- ============================================================
-- §1. The withdrawal clear
-- ============================================================
CREATE OR REPLACE FUNCTION public.clear_draft_summary_on_withdrawal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '2s'
AS $$
BEGIN
  BEGIN
    UPDATE public.vet_reports
       SET ai_lead_text = NULL, ai_lead_verdict = NULL, ai_lead_model = NULL
     WHERE generated_by = NEW.user_id
       AND status = 'draft'
       AND (ai_lead_text IS NOT NULL OR ai_lead_verdict IS NOT NULL OR ai_lead_model IS NOT NULL);
  EXCEPTION WHEN OTHERS THEN
    -- Never refuse the "no" (header §1). The SQLSTATE only, never a value (C-31).
    RAISE WARNING 'ai_consent: the draft summary clear failed (%); the reaper removes the draft within a day', SQLSTATE;
  END;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_draft_summary_on_withdrawal() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clear_draft_summary_on_withdrawal() FROM anon;
REVOKE ALL ON FUNCTION public.clear_draft_summary_on_withdrawal() FROM authenticated;

DROP TRIGGER IF EXISTS trg_ai_consent_clear_draft_summary ON public.ai_consent;
CREATE TRIGGER trg_ai_consent_clear_draft_summary
  AFTER INSERT OR UPDATE ON public.ai_consent
  FOR EACH ROW
  WHEN (NEW.granted = false AND NEW.scope IN ('ai_boundary', 'report_summary'))
  EXECUTE FUNCTION public.clear_draft_summary_on_withdrawal();

COMMENT ON FUNCTION public.clear_draft_summary_on_withdrawal() IS
  'CUL-2377 (118): on a "no" to ai_boundary or report_summary, nulls ai_lead_text, ai_lead_verdict and ai_lead_model on every DRAFT vet_reports row that owner made. Kept copies are never touched. A failed clear is a WARNING, never a refused withdrawal; the 24 h reaper bounds it. SECURITY DEFINER (the client holds no grant on the lead columns), search_path empty, message names no value (C-31).';


-- ============================================================
-- §1b. A summary written after the "no" is refused
-- ============================================================
CREATE OR REPLACE FUNCTION public.vet_reports_summary_needs_consent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  granted_both boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status <> 'draft' THEN
      RETURN NEW;  -- a kept row: 113's content freeze holds it
    END IF;
  END IF;
  IF (NEW.ai_lead_text IS NOT NULL
          OR NEW.ai_lead_model IS NOT NULL
          OR jsonb_typeof(NEW.ai_lead_verdict -> 'sentences') = 'array'
          OR jsonb_typeof(NEW.ai_lead_verdict -> 'checker') = 'object')
     AND (TG_OP = 'INSERT'
          OR NEW.ai_lead_text IS DISTINCT FROM OLD.ai_lead_text
          OR NEW.ai_lead_verdict IS DISTINCT FROM OLD.ai_lead_verdict
          OR NEW.ai_lead_model IS DISTINCT FROM OLD.ai_lead_model) THEN
    -- SKIP LOCKED: never wait on a consent row; a row being written is not a
    -- yes (header §1b).
    SELECT count(*) = 2 INTO granted_both
      FROM (SELECT 1 FROM public.ai_consent c
             WHERE c.user_id = NEW.generated_by
               AND c.scope IN ('ai_boundary', 'report_summary')
               AND c.granted
               FOR SHARE SKIP LOCKED) yes;
    IF NOT granted_both THEN
      -- Names no value (C-31).
      RAISE EXCEPTION
        'vet_reports: an AI summary needs the maker''s consent'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.vet_reports_summary_needs_consent() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vet_reports_summary_needs_consent() FROM anon;
REVOKE ALL ON FUNCTION public.vet_reports_summary_needs_consent() FROM authenticated;

-- Sorts after trg_vet_reports_client_freeze (same-event triggers fire in name
-- order), so the freeze still judges the writer's row first.
DROP TRIGGER IF EXISTS trg_vet_reports_summary_needs_consent ON public.vet_reports;
CREATE TRIGGER trg_vet_reports_summary_needs_consent
  BEFORE INSERT OR UPDATE ON public.vet_reports
  FOR EACH ROW EXECUTE FUNCTION public.vet_reports_summary_needs_consent();

COMMENT ON FUNCTION public.vet_reports_summary_needs_consent() IS
  'CUL-2377 (118): an INSERT, or an UPDATE of a row that was a draft, that puts model output in the AI summary columns (ai_lead_text, ai_lead_model, or a verdict carrying sentences or checker) is refused unless the maker holds a yes to both ai_boundary and report_summary, read FOR SHARE SKIP LOCKED (never waits; a consent row being written counts as no yes, which avoids a lock cycle with clear_draft_summary_on_withdrawal). Verdicts with no model output pass; rows already kept are not judged here (113''s content freeze holds them). SECURITY DEFINER (reads ai_consent for the service role''s writes), search_path empty, message names no value (C-31).';


-- ============================================================
-- §2. 110's client freeze: the withdrawal-clear arm
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
  oldj jsonb := to_jsonb(OLD);
  newj jsonb := to_jsonb(NEW);
BEGIN
  -- Exempt only with no user, no client role, and no client role set on the
  -- session. The third test is the one a SECURITY DEFINER function cannot hide:
  -- inside one, current_user is the owner, but the role PostgREST SET stays.
  IF auth.uid() IS NULL
     AND current_user NOT IN ('anon', 'authenticated')
     AND coalesce(current_setting('role', true), 'none') NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  -- 113: a link going to NULL is the FK's ON DELETE SET NULL (see above).
  -- Compared as if it had not moved; any other change to a link still fails.
  IF NEW.vet_visit_id IS NULL THEN
    newj := jsonb_set(newj, '{vet_visit_id}', coalesce(oldj -> 'vet_visit_id', 'null'::jsonb));
  END IF;
  IF NEW.vet_appointment_id IS NULL THEN
    newj := jsonb_set(newj, '{vet_appointment_id}', coalesce(oldj -> 'vet_appointment_id', 'null'::jsonb));
  END IF;

  -- 118: the withdrawal clear (CUL-2377). Inside a DEFINER trigger, a draft's
  -- three AI summary columns going to NULL compare as unmoved. Erasing is all
  -- this permits; every other column is still compared.
  IF pg_trigger_depth() > 1
     AND current_user NOT IN ('anon', 'authenticated')
     AND OLD.status = 'draft'
     AND NEW.ai_lead_text IS NULL
     AND NEW.ai_lead_verdict IS NULL
     AND NEW.ai_lead_model IS NULL THEN
    newj := newj - ARRAY['ai_lead_text', 'ai_lead_verdict', 'ai_lead_model'];
    oldj := oldj - ARRAY['ai_lead_text', 'ai_lead_verdict', 'ai_lead_model'];
  END IF;

  -- 113: the expiry moves from a time to an earlier time only. 110's
  -- `NEW > OLD` was NULL-blind, which a NOT NULL column made safe; 113 made it
  -- nullable, so a move to or from NULL is refused too (F3).
  IF (newj - control) IS DISTINCT FROM (oldj - control)
     OR (NEW.token_expires_at IS DISTINCT FROM OLD.token_expires_at
         AND NOT (OLD.token_expires_at IS NOT NULL
                  AND NEW.token_expires_at IS NOT NULL
                  AND NEW.token_expires_at < OLD.token_expires_at)) THEN
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

COMMENT ON FUNCTION public.vet_reports_client_freeze() IS
  'CUL-283 (110), amended by CUL-2287 (113) and CUL-2377 (118): for a client caller (a user, the anon / authenticated role, or a session whose role is either), every vet_reports column but token_expires_at is frozen, and token_expires_at may only move earlier. 113: vet_visit_id or vet_appointment_id going to NULL passes, because only the FKs'' ON DELETE SET NULL can do that (no client column grant on either). 118: inside a trigger (depth > 1) whose current_user is not a client role, a draft''s ai_lead_text, ai_lead_verdict and ai_lead_model all going to NULL passes; that is the withdrawal clear (clear_draft_summary_on_withdrawal). An allowlist over to_jsonb. SECURITY INVOKER, reads no other row, message names no value (C-31). The service role and the owner, with no user, are exempt here; vet_reports_content_freeze binds them on kept rows.';


-- ============================================================
-- §3. The schedule
-- ============================================================
-- Supabase installs pg_cron into pg_catalog; its objects live in schema `cron`.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- The same name replaces the job, so a re-run (a rotated key) is safe.
SELECT cron.schedule(
  'reap-vet-report-drafts',
  '*/15 * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://aigchluqluzuhtbfllgh.supabase.co/functions/v1/reap-report-drafts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpZ2NobHVxbHV6dWh0YmZsbGdoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NTcwNDcsImV4cCI6MjA5NDQzMzA0N30.FWerawEGnFuaDeBIuzVHF6LuGIJMu2Yw6RbEzVf8yTo'
    ),
    body := '{"sweep": "drafts"}'::jsonb,
    timeout_milliseconds := 30000
  );
  $job$
);


-- ============================================================
-- VERIFY (after apply)
-- ============================================================
--   1. The trigger and its function:
--        SELECT tgname, tgenabled FROM pg_trigger
--         WHERE tgrelid = 'public.ai_consent'::regclass AND NOT tgisinternal
--         ORDER BY tgname;
--      -> trg_ai_consent_clear_draft_summary, trg_ai_consent_decided_at,
--         trg_ai_consent_log; each tgenabled = 'O'. And on vet_reports:
--        SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.vet_reports'::regclass
--           AND tgname = 'trg_vet_reports_summary_needs_consent';
--      -> one row.
--   2. No client EXECUTE on the new function:
--        SELECT p.proname, has_function_privilege('anon', p.oid, 'EXECUTE'),
--               has_function_privilege('authenticated', p.oid, 'EXECUTE')
--          FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
--           AND p.proname IN ('clear_draft_summary_on_withdrawal', 'vet_reports_summary_needs_consent');
--      -> f, f on both rows. And no client reach into cron:
--        SELECT has_schema_privilege('anon', 'cron', 'USAGE'),
--               has_schema_privilege('authenticated', 'cron', 'USAGE');
--      -> f, f. And the owner still bypasses RLS on vet_reports (§1 relies on it):
--        SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.vet_reports'::regclass;
--      -> f.
--   3. The job:
--        SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'reap-vet-report-drafts';
--      -> one row, '*/15 * * * *', true.
--   4. After the first quarter hour, once reap-report-drafts is deployed:
--        SELECT status_code, created FROM net._http_response ORDER BY created DESC LIMIT 3;
--      -> 204 (404 until the function deploys).
--   5. The behaviour: the probe in the PR (scripts/probes/vet-report-118/run.sh).
