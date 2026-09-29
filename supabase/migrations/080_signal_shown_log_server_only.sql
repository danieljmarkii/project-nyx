-- ============================================================
-- Migration 080: signal_shown_log is written by the server only (Engines v3 PR-21a)
--   CUL-1384: drop 075 §5's client INSERT policy and grant.
-- See: 075_engines_v3_stamps.sql §5 (the table, its policies and grants);
--      supabase/functions/_shared/engineStamps.ts insertShownLog (the writer);
--      CUL-1267 PR-11a plan ruling D-A, 2026-09-27; CUL-1378 (the same move for
--      ai_signals, and the HMAC of text_hash).
-- ============================================================
--
-- WHY. The log exists to be trusted later: EN-9 reads the rate at acknowledgement
-- from it, EN-14 an alert identity, evaluation the run-by-run history. Its value is
-- its history, and a row a client could have written can never be trusted after
-- the fact. PR-11a moved the one writer to the server: generate-signal inserts with
-- a service-role client, keyed on a pet id it has already verified through the
-- caller's own RLS-scoped `pets` read. 075's client INSERT policy and column grant
-- are unused from then on (nothing in the app or any function inserts as
-- `authenticated`), and while they exist any signed-in account can append rows to
-- its own pet's log.
--
-- WHAT CHANGES. Two walls come down together, because either alone is still a
-- door for the next migration to open by accident:
--   · the RLS policy `signal_shown_log_insert_own`, and
--   · the INSERT privilege. 075 granted it per column; a table-level REVOKE INSERT
--     also revokes every column-level INSERT grant on the table (Postgres REVOKE:
--     "the corresponding column privileges ... are automatically revoked"), so one
--     statement covers the column list without restating it.
-- `authenticated` keeps SELECT and `signal_shown_log_read_own` (an owner may read
-- their own pet's log; data rights treat text_hash as the text, 075 §5). `anon`
-- held nothing after 075 and holds nothing now. `service_role` bypasses RLS and
-- keeps its default privileges, so the server write is untouched.
--
-- WHAT IT DOES NOT TOUCH. UPDATE and DELETE were never granted or given a policy
-- (075: append-only, default-deny both ways). The rows already written stay: the
-- log first gained rows on 2026-09-28, after PR-11a deployed, and no app build or
-- other function has ever carried a client insert into it, so there is nothing to
-- quarantine.
--
-- MAINTENANCE WARNING (supersedes 075's). There is no client writer to extend any
-- more. Never GRANT INSERT on this table to `authenticated` or `anon`, at the
-- table or the column level, and never add an INSERT policy for them. A new writer
-- goes through the service role on the server, after verifying the pet id through
-- the caller's own RLS-scoped read, as insertShownLog's caller does.
--
-- ------------------------------------------------------------
-- MIGRATION SAFETY PRE-FLIGHT
-- ------------------------------------------------------------
--   Destructive:  n. No column, row or table is dropped or altered; a policy and
--                 a privilege are removed.
--   Backfill:     N/A.
--   Rollback:     restore 075 §5's policy and column grant exactly:
--     CREATE POLICY "signal_shown_log_insert_own" ON public.signal_shown_log
--       FOR INSERT TO authenticated
--       WITH CHECK (pet_id IN (SELECT id FROM public.pets
--                              WHERE user_id = (SELECT auth.uid())));
--     GRANT INSERT (pet_id, generated_at, finding_key, finding_type, tier,
--                   text_hash, engine_fingerprint, engine_flags)
--       ON TABLE public.signal_shown_log TO authenticated;
--   Ordering:     apply only while generate-signal's service-role write is live
--                 (PR-11a, deployed); otherwise nothing writes the log. Sanity
--                 check before applying:
--                   SELECT count(*), max(recorded_at) FROM signal_shown_log;
--                   -- rows, the newest recent
--   After:        run the VERIFY block at the foot of this file.
-- ============================================================

DROP POLICY IF EXISTS "signal_shown_log_insert_own" ON public.signal_shown_log;

REVOKE INSERT ON TABLE public.signal_shown_log FROM authenticated;
REVOKE INSERT ON TABLE public.signal_shown_log FROM anon;

COMMENT ON TABLE public.signal_shown_log IS
  'Append-only, server-written: one row per finding per Signal run that served it (MFU-3, Engines v3 PR-10). Written only by generate-signal with the service role (CUL-1384, migration 080); clients may SELECT their own pets'' rows and nothing else. Identity, tier and a SHA-256 of the text, never the text. First/last shown are derived. Cascades from pets.';

-- ------------------------------------------------------------
-- VERIFY (run after applying; read-only)
-- ------------------------------------------------------------
--   SELECT policyname, cmd FROM pg_policies
--    WHERE tablename = 'signal_shown_log';
--     -- one row: signal_shown_log_read_own | SELECT
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--    WHERE table_name = 'signal_shown_log' AND grantee IN ('anon','authenticated');
--     -- one row: authenticated | SELECT
--   SELECT DISTINCT grantee, privilege_type FROM information_schema.column_privileges
--    WHERE table_name = 'signal_shown_log' AND grantee IN ('anon','authenticated');
--     -- one row: authenticated | SELECT
--   SELECT has_table_privilege('authenticated', 'public.signal_shown_log', 'INSERT'),
--          has_any_column_privilege('authenticated', 'public.signal_shown_log', 'INSERT'),
--          has_table_privilege('service_role', 'public.signal_shown_log', 'INSERT');
--     -- false | false | true
