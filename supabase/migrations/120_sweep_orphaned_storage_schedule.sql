-- ============================================================
-- Migration 120: the orphaned-storage sweep runs once a day
--   (CUL-2475, sub-issue 2 of CUL-2421; plan and PM go on CUL-2475,
--   2026-11-04)
-- See: supabase/functions/sweep-orphaned-storage (the sweep this calls;
--      plan.ts holds the run gate this schedule must match);
--      118_vet_report_draft_lifetime.sql §3 (pg_cron's install, and the
--      anon-key choice this file repeats);
--      guards/sweepOrphanedStorageSchedule.test.ts (pins this file to plan.ts).
-- ============================================================
--
-- WHAT THIS ADDS
-- ------------------------------------------------------------
-- One pg_cron job. Nothing else: no table, column, row, policy, function or
-- extension changes (118 installed pg_cron; pg_net 0.20.0 is in `extensions`).
-- At 09:23 UTC every day it POSTs to the sweep-orphaned-storage Edge Function,
-- which removes Storage files whose owner row (pet, food, account) is proven
-- gone. Until this job exists the function is deployed (#1423, deploy run 521,
-- 2026-11-03) but never runs: its gate answers 400 to every other call.
--
-- THE SCHEDULE MUST MATCH THE FUNCTION'S GATE, EXACTLY
-- ------------------------------------------------------------
-- plan.ts gate() starts a run only when the body is {"run": RUN_MARKER} and the
-- request arrives within RUN_WINDOW_MIN (15) minutes after RUN_HOUR_UTC:
-- RUN_MINUTE_UTC (09:23 UTC). Anything else is a 400 that sweeps nothing, so a
-- mismatch here fails SILENTLY: the job "succeeds" daily and no file is ever
-- removed (rls-privacy-reviewer pass 2 on CUL-2421, R3). The guard named above
-- parses this file and fails the build if the cron expression or the body stop
-- matching those constants.
--
-- The cron expression is read in cron.timezone. Read 2026-11-04:
-- cron.timezone = 'GMT' (UTC, no daylight saving), TimeZone = 'UTC'. So
-- '23 9 * * *' is 09:23 UTC all year. If cron.timezone is ever changed, this
-- job leaves the window and every call is a 400; VERIFY 4 below shows it.
--
-- THE KEY: the project's public anon key, as 118 does (PM ruling (a) on
-- CUL-2377, 2026-11-02). It is public by design (shipped in the app, committed
-- in eas.json; docs/secrets-register.md). It grants nothing here: the function
-- uses its own platform-provided service role, takes no input but the run
-- marker, and the gate bounds what any anon-key holder can start to the same
-- one 15-minute window a day. If the key is rotated, re-run cron.schedule below
-- with the new key (the same name replaces the job).
--
-- THE TIMEOUT: 160 s, not 118's 30 s. A sweep may run up to the Edge runtime's
-- 150 s request limit (delete-account/plan.ts SWEEP_REQUEST_LIMIT_MS; its
-- budget stops new folders at 90 s and every call at 130 s). Waiting past that
-- means net._http_response records the run's real answer (204, or the 500 a
-- failed run returns) rather than a client timeout that says nothing about it.
-- The guard pins timeout > SWEEP_REQUEST_LIMIT_MS.
--
-- THE URL IS PRODUCTION'S. Replayed on a branch database or a local reset with
-- pg_cron, this job calls production's sweep at 09:23 UTC daily. That is no
-- more than production's own job does (same gate, same proof per file), but it
-- is surprising; unschedule it there (as 118 says of its own job).
--
-- Migration Safety Pre-flight
-- ------------------------------------------------------------
--   Destructive:  n for the schema: one scheduled job added, nothing dropped,
--                 renamed or altered. The JOB removes files: orphaned Storage
--                 objects whose owner is proven gone (plan.ts header lists the
--                 five conditions every removed file meets). The inventory
--                 read behind it is on CUL-2421, 2026-11-02.
--   Backfill:     N/A.
--   Rollback:
--                   SELECT cron.unschedule('sweep-orphaned-storage');
--                 (pg_cron stays: 118's reaper needs it.) Files already
--                 removed by a run are not restored by the rollback.
--   Ordering:     after 119. The function is merged and deployed first
--                 (#1423, 08c8617; Deploy Edge Functions run 521 passed
--                 2026-11-03T21:07Z).
--   After:        the VERIFY block at the foot, then get_advisors (security +
--                 performance). Then docs/secrets-register.md's row for this
--                 job goes to provisioned.
-- ============================================================


SELECT cron.schedule(
  'sweep-orphaned-storage',
  '23 9 * * *',
  $job$
  SELECT net.http_post(
    url := 'https://aigchluqluzuhtbfllgh.supabase.co/functions/v1/sweep-orphaned-storage',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpZ2NobHVxbHV6dWh0YmZsbGdoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NTcwNDcsImV4cCI6MjA5NDQzMzA0N30.FWerawEGnFuaDeBIuzVHF6LuGIJMu2Yw6RbEzVf8yTo'
    ),
    body := '{"run": "sweep-orphaned-storage"}'::jsonb,
    timeout_milliseconds := 160000
  );
  $job$
);


-- ============================================================
-- VERIFY (after apply)
-- ============================================================
--   1. The job, and the clock it reads:
--        SELECT jobname, schedule, active FROM cron.job
--         WHERE jobname = 'sweep-orphaned-storage';
--      -> one row, '23 9 * * *', true.
--        SELECT current_setting('cron.timezone');
--      -> 'GMT' or 'UTC'.
--   2. 118's job is untouched:
--        SELECT jobname, schedule FROM cron.job ORDER BY jobname;
--      -> reap-vet-report-drafts '*/15 * * * *', sweep-orphaned-storage
--         '23 9 * * *'.
--   3. No client reach into cron:
--        SELECT has_schema_privilege('anon', 'cron', 'USAGE'),
--               has_schema_privilege('authenticated', 'cron', 'USAGE');
--      -> f, f.
--   4. After the first 09:23 UTC, the same day (pg_net keeps responses only
--      for pg_net.ttl; read it with SHOW pg_net.ttl before relying on this):
--        SELECT d.status, d.start_time FROM cron.job_run_details d
--          JOIN cron.job j USING (jobid)
--         WHERE j.jobname = 'sweep-orphaned-storage'
--         ORDER BY d.start_time DESC LIMIT 1;
--      -> 'succeeded'. That means only that the POST was queued.
--        SELECT status_code, timed_out, created FROM net._http_response
--         WHERE created >= now()::date + time '09:23'
--           AND created <  now()::date + time '09:27'
--         ORDER BY created DESC;
--      (The window excludes 118's reaper responses at 09:15 and 09:30; the
--      response row carries no URL, so the time window is the only filter.)
--      -> 204: the call reached the function inside the gate's window. It
--         does NOT prove a sweep: a run whose listings or owner reads all
--         failed also answers 204, and so does a call that found a run
--         already going on that worker. Step 5 is the proof.
--      -> 400: the schedule left the window (check cron.timezone) or the body
--         changed. 401: the key. 500: missing env or a code regression.
--         504 or timed_out: the run passed the 150 s request limit.
--   5. THE PROOF. The function's run line in the Edge Function logs for
--      sweep-orphaned-storage, 09:23 to 09:26 UTC: it names what was removed
--      and what was left, per bucket and per reason, and any read that failed.
