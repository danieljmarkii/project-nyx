-- ============================================================
-- Migration 112: the vet report's AI summary gets its own consent scope and
-- its own flag, seeded off  (Vet report v2 PR-24, VR2-24)
-- See: CUL-2304 (the row; its plan comment, PM go 2026-10-31);
--      docs/nyx-vet-report-v2-requirements.md §9.3, §13;
--      100_ai_consent.sql (the tables this widens; its header names this path:
--      "a future scope is an explicit additive migration");
--      111_vet_report_v2_flags.sql (the allowlist seed this copies).
-- ============================================================
--
-- WHY A SECOND SCOPE (R-3, critique GAP-8)
-- ------------------------------------------------------------
-- The AI summary on the vet report is a new use of Anthropic: a model writes
-- sentences a vet reads about a patient. The owner's 'ai_boundary' yes was
-- given to words that never named it, so it is not a yes to this. The summary
-- needs BOTH answers: 'ai_boundary' (the whole boundary, D10, still closes
-- every call) and 'report_summary' (this use). A no, a missing row or a failed
-- read under EITHER is a no. The reader is
-- supabase/functions/_shared/reportSummaryGate.ts, which reads exactly these
-- two scopes and nothing looser (100's rule: never test "any row is granted").
--
-- Every existing reader and writer of these tables filters on
-- scope = 'ai_boundary' (lib/aiConsent.ts, _shared/aiConsent.ts), so a
-- 'report_summary' row can never answer for the boundary, and the photo
-- "sent only if you tap" history read (readConsentOnSince) never sees it.
--
-- WHAT CHANGES: the scope CHECK on both tables, and nothing else.
--   · Both tables in this one file (apply_migration runs it as one
--     transaction), the same set on each, so the history
--     (written by 100's DEFINER trigger) can never refuse a row the state
--     table accepted. If the two sets differed, a 'report_summary' write would
--     fail inside the logger and the owner's answer would not save at all.
--   · No new column, policy, grant, function or trigger. 100's RLS (own rows
--     only, no DELETE), its column grants (decided_at never client-writable),
--     its stamp trigger (database clock; user_id and scope never move on
--     UPDATE) and its append-only history apply to the new scope unchanged.
--   · `source` stays the closed four. The summary's ask writes 'backstop'
--     (an in-context door) or 'settings', as the boundary's asks do.
--   · `granted` keeps no DEFAULT: a decline is a row saying false; absence is
--     "never asked" and reads as declined.
--
-- THE FLAG: report_ai_lead, seeded {"enabled": false, "allowlist": []}.
-- The server checks it AND report_document_v2 (111) on every request, against
-- the JWT uid. Seeded off, so creating it changes nothing an owner can see.
-- It reaches no one before the smoke bake-off (spec §9.4, VR2-26). Cohort
-- enablement is a later recorded app_config UPDATE, never this seed, so a
-- re-applied seed never resets a live allowlist.
--
-- PETS > $ (spec §13): the summary is free on every tier, under one cap key,
-- 'report_summary', the same number for everyone. The cap is code
-- (reportSummaryGate.ts, overridable through app_config.ai_caps), not schema:
-- ai_usage.function is unconstrained TEXT (031). No eligibility predicate here
-- references a tier.
--
-- The CHECK is written as scope IN (...) to match 100's text; Postgres stores
-- it as scope = ANY (ARRAY[...]). The constraint names are Postgres's own
-- defaults for 100's inline CHECKs, read from the live database 2026-10-31:
-- ai_consent_scope_check, ai_consent_events_scope_check.
--
-- Migration Safety Pre-flight:
--   Destructive:  n  (widens two CHECKs to admit one more value; every row
--                     they admitted before they admit now. One new
--                     app_config row. Nothing dropped, renamed or retyped.)
--   Rollback:     Turn the feature off; never erase an answer:
--                   UPDATE app_config SET value = '{"enabled": false, "allowlist": []}'::jsonb
--                     WHERE key = 'report_ai_lead';
--                 The gate refuses on that flag alone, so the scope stays in place.
--                 Narrowing the CHECK back would first require deleting owners'
--                 recorded 'report_summary' answers, recorded noes included, which
--                 100 forbids ("no client erases an answer") and which service_role
--                 cannot do anyway (DELETE revoked on the history). If a full
--                 reversal is ever ruled necessary, copy both tables' report_summary
--                 rows out first (CREATE TABLE ... AS SELECT) and record the ruling.
--                 Before any answer exists (nothing writes one before VR2-25), the
--                 full reversal is: DELETE the report_ai_lead row; ALTER each table
--                 DROP CONSTRAINT <name>, ADD CONSTRAINT <name> CHECK (scope IN ('ai_boundary')).
--   Backfill:     N/A. No account is given a 'report_summary' row: absence is
--                 "never asked", the gate reads it as declined, and the
--                 preview asks. Inventing a yes is what 5.1.2(i) forbids.
--   Affected tables: ai_consent, ai_consent_events (CHECK only),
--                 app_config (INSERT only). Check before applying:
--                   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--                     WHERE conname IN ('ai_consent_scope_check', 'ai_consent_events_scope_check');
--                   -- expect: 2 rows, each CHECK ((scope = 'ai_boundary'::text))
--                   SELECT key FROM app_config WHERE key = 'report_ai_lead';
--                   -- expect: 0 rows
--   Check after applying:
--                   the same pg_constraint query -- expect both to read
--                   CHECK ((scope = ANY (ARRAY['ai_boundary'::text, 'report_summary'::text])))
--                   SELECT value FROM app_config WHERE key = 'report_ai_lead';
--                   -- expect: {"enabled": false, "allowlist": []}
-- ============================================================

-- One statement per table, so each swap is atomic on its own, not only by
-- virtue of the file running as one transaction.
ALTER TABLE public.ai_consent
  DROP CONSTRAINT ai_consent_scope_check,
  ADD CONSTRAINT ai_consent_scope_check CHECK (scope IN ('ai_boundary', 'report_summary'));
ALTER TABLE public.ai_consent_events
  DROP CONSTRAINT ai_consent_events_scope_check,
  ADD CONSTRAINT ai_consent_events_scope_check CHECK (scope IN ('ai_boundary', 'report_summary'));

COMMENT ON COLUMN public.ai_consent.scope IS
  'CUL-552 D10: ''ai_boundary'' covers every Anthropic call. CUL-2304 (112): ''report_summary'' is the vet report''s AI summary, which needs BOTH scopes granted; a decline under either wins. A new scope is an additive migration that updates guards/aiConsent.test.ts.';

-- ON CONFLICT DO NOTHING: idempotent, and a re-apply after a live allowlist
-- edit keeps the live value (the 030/063/111 discipline).
INSERT INTO app_config (key, value) VALUES
  ('report_ai_lead', '{"enabled": false, "allowlist": []}'::jsonb)
ON CONFLICT (key) DO NOTHING;
