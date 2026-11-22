-- ============================================================
-- Migration 123: the orphaned-storage check runs from pg_cron, on time
--   (CUL-2897; plan and PM go (a) on CUL-2897, 2026-11-22)
-- See: supabase/functions/sweep-orphaned-storage (plan.ts gate: the check
--      window this schedule must match; index.ts: the check stores its answer
--      here, and the result read GitHub's watcher sends);
--      120_sweep_orphaned_storage_schedule.sql (the 09:23 run this check
--      judges; its anon-key, URL and timeout choices, repeated here);
--      106_food_item_ids_never_reused.sql (the server-only table posture
--      sweep_check_results copies);
--      guards/sweepOrphanedStorageSchedule.test.ts (pins this file to plan.ts).
-- ============================================================
--
-- WHY
-- ------------------------------------------------------------
-- The daily check (CUL-2521) ran from GitHub Actions at 12:07 UTC with a
-- two-hour window. GitHub started it 5 to 10 hours late every day, so every
-- call got the gate's 400 and no check ever ran: a sweep that stopped was seen
-- by no one. pg_cron fires on the minute (120's 09:23 run does), so the check
-- moves here, the window narrows to 15 minutes (plan.ts CHECK_WINDOW_MIN), and
-- GitHub only reads the stored answer, at any hour.
--
-- WHAT THIS ADDS
-- ------------------------------------------------------------
-- 1. public.sweep_check_results: one row per UTC day, the check's two bits.
--    Server-only, as 106's ledger: RLS on with no policy, every client grant
--    revoked. No pet_id: it holds no owner data (two booleans and a time), the
--    same exception 106's food_item_retired_ids makes. service_role keeps
--    SELECT, INSERT and UPDATE (the check upserts by day); DELETE and TRUNCATE
--    go, so the function cannot erase a day's answer. It grows by one row a
--    day; nothing reaps it.
-- 2. One pg_cron job, 'sweep-orphaned-storage-check', at 12:07 UTC daily,
--    POSTing {"check": "overdue"} to the sweep function with the anon key.
--
-- THE SCHEDULE MUST MATCH THE GATE, EXACTLY. plan.ts gate() answers 'check'
-- only for that body within CHECK_WINDOW_MIN (15) minutes after
-- CHECK_HOUR_UTC:CHECK_MINUTE_UTC (12:07 UTC). Anything else is a 400 that
-- checks nothing. Unlike 120, a mismatch here is not silent: no row is stored,
-- and the watcher's read answers 404, a red run. The guard still pins it.
-- cron.timezone is 'GMT' (read 2026-11-04, 120's header), so '7 12 * * *' is
-- 12:07 UTC all year.
--
-- THE KEY: the public anon key, as 120 (PM ruling (a) on CUL-2377). A check
-- removes nothing, takes no input but the marker, and the gate bounds what any
-- anon-key holder can start to one 15-minute window a day (narrower than the
-- two hours it replaces). If the key is rotated, re-run cron.schedule below
-- with the new key (the same name replaces the job), and 120's too.
--
-- THE TIMEOUT: 160 s, as 120: a check is the same pass, up to the 150 s
-- request limit. Nothing reads the reply (the stored row is the answer); the
-- timeout only keeps pg_net's record honest for triage.
--
-- THE URL IS PRODUCTION'S. Replayed on a branch or local database with
-- pg_cron, this job checks production daily; unschedule it there.
--
-- ORDERING WITH THE CODE. Apply this, then merge the PR (the merge deploys the
-- function). Between the two, the 12:07 job reaches the deployed function,
-- whose 120-minute window still admits it: the check runs and logs its line,
-- but stores no row (that code is not live), so the old workflow, until the
-- merge replaces it, keeps reporting as it does today. Merging BEFORE applying
-- is the wrong order: the result read finds no table and answers 503, and the
-- check's store fails (logged); both are loud, neither is clean.
--
-- Migration Safety Pre-flight
-- ------------------------------------------------------------
--   Destructive:  n. One table and one scheduled job added; nothing dropped,
--                 renamed or altered. The job removes nothing (a check).
--   Backfill:     N/A.
--   Rollback:
--                   SELECT cron.unschedule('sweep-orphaned-storage-check');
--                   DROP TABLE IF EXISTS public.sweep_check_results;
--                 (Then revert the function and workflow, or the watcher
--                 reads 503/404 daily: loud, never clean.)
--   Ordering:     after 122; before the PR merges (above).
--   After:        the VERIFY block at the foot, then get_advisors (security +
--                 performance).
-- ============================================================


-- 1. Where the check keeps its answer ------------------------------------------

CREATE TABLE IF NOT EXISTS public.sweep_check_results (
  checked_on  date        PRIMARY KEY,
  checked_at  timestamptz NOT NULL,
  overdue     boolean     NOT NULL,
  incomplete  boolean     NOT NULL
);

ALTER TABLE public.sweep_check_results ENABLE ROW LEVEL SECURITY;
-- No policy: default-deny for every client role. The grants go too, so the
-- table is not even visible to PostgREST's anon or authenticated callers.
REVOKE ALL ON TABLE public.sweep_check_results FROM PUBLIC;
REVOKE ALL ON TABLE public.sweep_check_results FROM anon;
REVOKE ALL ON TABLE public.sweep_check_results FROM authenticated;
REVOKE DELETE, TRUNCATE ON TABLE public.sweep_check_results FROM service_role;

COMMENT ON TABLE public.sweep_check_results IS
  'CUL-2897 (123): the daily orphaned-storage check''s answer, one row per UTC day (overdue, incomplete). Written by sweep-orphaned-storage under its service role; read by its {"result": "overdue"} call for the GitHub watcher. Server-only: RLS on with no policy, client grants revoked, service_role cannot delete. Holds no owner data, so no pet_id.';


-- 2. The check, on time --------------------------------------------------------

SELECT cron.schedule(
  'sweep-orphaned-storage-check',
  '7 12 * * *',
  $job$
  SELECT net.http_post(
    url := 'https://aigchluqluzuhtbfllgh.supabase.co/functions/v1/sweep-orphaned-storage',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpZ2NobHVxbHV6dWh0YmZsbGdoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NTcwNDcsImV4cCI6MjA5NDQzMzA0N30.FWerawEGnFuaDeBIuzVHF6LuGIJMu2Yw6RbEzVf8yTo'
    ),
    body := '{"check": "overdue"}'::jsonb,
    timeout_milliseconds := 160000
  );
  $job$
);


-- ============================================================
-- VERIFY (after apply)
-- ============================================================
--   1. Both jobs, and the clock:
--        SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
--      -> reap-vet-report-drafts '*/15 * * * *', sweep-orphaned-storage
--         '23 9 * * *', sweep-orphaned-storage-check '7 12 * * *', all true.
--        SELECT current_setting('cron.timezone');  -> 'GMT' or 'UTC'.
--   2. The table is server-only:
--        SELECT relrowsecurity FROM pg_class
--         WHERE oid = 'public.sweep_check_results'::regclass;        -> t
--        SELECT count(*) FROM pg_policies
--         WHERE tablename = 'sweep_check_results';                    -> 0
--        SELECT has_table_privilege('anon', 'public.sweep_check_results', 'SELECT'),
--               has_table_privilege('authenticated', 'public.sweep_check_results', 'SELECT'),
--               has_table_privilege('service_role', 'public.sweep_check_results', 'DELETE');
--      -> f, f, f.
--   3. After the first 12:07 UTC (pg_net keeps responses for pg_net.ttl):
--        SELECT status_code, timed_out, created FROM net._http_response
--         WHERE created >= now()::date + time '12:07'
--           AND created <  now()::date + time '12:11'
--         ORDER BY created DESC;
--      -> 204 (clean) or 200 (found): the check ran inside its window.
--         400: outside the window (cron.timezone, or the body). 503: the
--         worker was busy. 500: env or a regression.
--   4. THE PROOF CUL-2583 waits on: the function's sweep-orphaned-storage.check
--      line in its Edge Function logs, 12:07 to 12:10 UTC.
--   5. Once the PR has merged and a 12:07 has passed:
--        SELECT * FROM public.sweep_check_results ORDER BY checked_on DESC LIMIT 3;
--      -> today's row.
