-- ============================================================
-- Migration 075: the Engines v3 stamps (Engines v3 PR-10)
--   EN-F  (CUL-1267) the rollout flag's first key + the flag / fingerprint stamps
--   EN-2  (CUL-1132) model_id + prompt_hash on every per-incident read
--   CUL-1201 part 1  the photo-set stamp; part 3 the monotonic updated_at
--   MFU-3 (critique CUL-1268) the append-only log of what the Signal showed
-- See: docs/engines-v3-critique-2026-09.md R-1 (EN-F re-specified) and R-5
--      (privacy on every new data path); the Engines v3 project plan, PR-10's
--      build notes; the plan comment on CUL-1267 (2026-09-27).
-- ============================================================
--
-- SCHEMA ONLY. Nothing in the app or any Edge Function reads or writes a column,
-- a row or a key this file adds: PR-11a is the one writer of every stamp and the
-- log, PR-12 adds the stamps to the phone's copy. Applying this changes nothing an
-- owner can see, which is why the flag does not gate it (EN-F: "additive schema
-- that nothing reads until the flag is on" is not flagged).
--
-- Five parts, one reason: the stamps are one reconciled set. Three plans (EN-F,
-- EN-2 and flag review's parked data model, #896) each wanted columns on
-- event_ai_analysis under different names; carrying them in one migration is
-- what makes them one vocabulary.
--
-- ------------------------------------------------------------
-- WHY THE STAMPS (GAP-2)
-- ------------------------------------------------------------
-- Today no per-incident read and no cached Signal records which model, prompt,
-- rules, photos or flag state produced it. The day EN-0 turns on for one account
-- and is rolled back a week later, that account holds three kinds of read with
-- identical shapes and nothing to tell them apart; and a rolled-back flag would
-- mint Signal stand-downs for findings that were never really withdrawn. Every
-- stamp below is NULLABLE and NULL means exactly one thing: "written before the
-- stamps existed". Nothing is backfilled, because no backfill can be honest (the
-- model and prompt of a May read are not recorded anywhere; a photo set can have
-- changed since).
--
-- ------------------------------------------------------------
-- THE NAMES, reconciled
-- ------------------------------------------------------------
--   photo_set_key   flag review's name, kept verbatim: its parked answer RPC
--                   rejects an answer whose key is stale, so the name is shared.
--                   What the read's photos were (the derivation is the writer's
--                   contract, PR-11a; a hash of the event's attachment set).
--   model_id        EN-2's name. Flag review's single `model_version` (model id
--   prompt_hash       and prompt revision) splits into these two, because EN-2
--                   measures a prompt change on a fixed model and a model change
--                   on a fixed prompt; one fused string cannot group either way.
--   rule_version    R-1's rule-version stamp: which deterministic floor rules
--                   (the escalation ladder, the flags' derivation) made the row.
--   engine_flags    The Engines keys resolved ON for this write, sorted. An
--                   array, not a boolean, because keys follow units that ship
--                   together (R-1) and later phases seed their own: a new key
--                   needs no new column. NULL = pre-stamp; '{}' = all off.
--   engine_fingerprint  (ai_signals + the log) a hash of the engine that ran,
--                   so a replay can tell two runs of different code apart.
--
-- ------------------------------------------------------------
-- R-5, THE PRIVACY LINE (vet visits §6.1's shape)
-- ------------------------------------------------------------
--   Cascade:     signal_shown_log.pet_id -> pets ON DELETE CASCADE, so a pet's or
--                an account's deletion erases it (delete-account's auth delete
--                fires the pets cascade). The stamp columns live on rows that
--                already cascade.
--   RLS:         every verb. The log: SELECT + INSERT on the caller's own pets;
--                no UPDATE or DELETE policy (default-deny) and the grants revoked
--                too. The stamp columns inherit their tables' existing policies.
--   Same-pet:    the log references no child row (only pets), so there is no
--                cross-table link to guard.
--   Wipe list:   server-only; no local SQLite copy, so no LOCAL_WIPE_TABLES entry.
--                The stamps' phone copy is PR-12's, and it wipes with the table
--                it extends.
--   Model reads: none. No model reads the log or a stamp; the log holds a text
--                HASH, never the text (enforced below by a CHECK).
--   Export:      doc-only today (no export function exists in supabase/functions/);
--                the log is the owner's own pet data and belongs in its scope.
--   Label:       unchanged. Everything here is derived from health data the App
--                Store label already declares. Any EVALUATION use of the stamps
--                or the log waits on PMD-12's stated purpose (CUL-1313); until
--                then every evaluation input is synthetic or the PM's own.
--
-- Migration Safety Pre-flight:
--   Destructive:  n  (purely additive: 1 config row, 7 nullable columns, 1 new
--                     table with its policies, grants and index, 1 new function.
--                     One trigger is re-pointed from set_updated_at() to the new
--                     function; set_updated_at() itself is untouched and still
--                     serves every other table.)
--   Rollback:
--     DROP TRIGGER trg_event_ai_analysis_updated_at ON public.event_ai_analysis;
--     CREATE TRIGGER trg_event_ai_analysis_updated_at BEFORE UPDATE ON
--       public.event_ai_analysis FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--     DROP FUNCTION public.set_updated_at_monotonic();
--     DROP TABLE public.signal_shown_log;
--     ALTER TABLE public.ai_signals DROP COLUMN engine_flags,
--       DROP COLUMN engine_fingerprint;
--     ALTER TABLE public.event_ai_analysis DROP COLUMN photo_set_key,
--       DROP COLUMN model_id, DROP COLUMN prompt_hash, DROP COLUMN rule_version,
--       DROP COLUMN engine_flags;
--     DELETE FROM app_config WHERE key = 'engines_v3_en0';
--     (Irreversible only for stamp values PR-11a has written by then.)
--   Backfill:     N/A, deliberately (see WHY THE STAMPS).
--   Affected tables: app_config (INSERT), event_ai_analysis (ADD COLUMN + the
--                 trigger), ai_signals (ADD COLUMN). Sanity check before applying:
--                   SELECT key FROM app_config WHERE key = 'engines_v3_en0';  -- 0 rows
--                   SELECT to_regclass('public.signal_shown_log');           -- NULL
-- ============================================================


-- ============================================================
-- §1 The flag's first key (EN-F)
-- ============================================================
-- The allowlist shape every rollout flag since Ask uses (037):
--   {"enabled": bool, "allowlist": ["<user-uuid>", …]}
-- READ ON THE SERVER, because the engines run there: PR-11a resolves it for the
-- record's OWNER in analyze-vomit, analyze-stool, generate-signal and
-- generate-report through its own read that fails CLOSED (never readGateConfig,
-- which fails open). No lib/appConfig.ts registration: no client surface reads it
-- (an app-side key exists only for surfaces that start on the phone).
--
-- Named for the unit it gates, EN-0 (R-1: keys follow units that ship together);
-- each later phase seeds its own key in its first PR, and engine_flags records
-- whichever were on.
--
-- SHIP-DARK: eligible for no one. The PM's uid goes in afterwards by a recorded
-- config UPDATE, never in a committed migration (a re-applied seed must never
-- reset a live allowlist), and never the App Review demo account: app_config is
-- readable by every signed-in client (GAP-26 / B-744), so an allowlist stays the
-- PM's uid alone until CUL-489 moves cohorts somewhere private.

INSERT INTO app_config (key, value) VALUES
  ('engines_v3_en0', '{"enabled": false, "allowlist": []}'::jsonb)
ON CONFLICT (key) DO NOTHING;


-- ============================================================
-- §2 event_ai_analysis: the read's stamps (EN-F, EN-2, CUL-1201 part 1)
-- ============================================================
-- Client write posture is unchanged: 074 revoked client INSERT, and the client's
-- two UPDATE paths (dismiss, field edits) name none of these columns. Every stamp
-- is written by the analyze-* service-role path only (PR-11a).

ALTER TABLE public.event_ai_analysis
  ADD COLUMN photo_set_key TEXT,
  ADD COLUMN model_id      TEXT,
  ADD COLUMN prompt_hash   TEXT,
  ADD COLUMN rule_version  TEXT,
  ADD COLUMN engine_flags  TEXT[];

COMMENT ON COLUMN public.event_ai_analysis.photo_set_key IS
  'Which photos this read looked at (a key over the event''s attachment set; derivation owned by the one stamp writer, PR-11a). A mismatch with the event''s current photos means the read no longer speaks for them (CUL-1201). NULL = written before the stamp existed.';
COMMENT ON COLUMN public.event_ai_analysis.model_id IS
  'The vision model id that produced ai_raw_payload (EN-2, CUL-1132). NULL = pre-stamp.';
COMMENT ON COLUMN public.event_ai_analysis.prompt_hash IS
  'A hash of the prompt that produced ai_raw_payload (EN-2, CUL-1132). NULL = pre-stamp.';
COMMENT ON COLUMN public.event_ai_analysis.rule_version IS
  'The deterministic rule set (escalation ladder, flag derivation) that wrote this row (critique R-1). NULL = pre-stamp.';
COMMENT ON COLUMN public.event_ai_analysis.engine_flags IS
  'The Engines v3 app_config keys resolved ON for this write, sorted (EN-F, CUL-1267). NULL = pre-stamp; empty = every key off. Flag-off code never overwrites, collapses or lowers an escalation written under a key.';


-- ============================================================
-- §3 A strictly increasing updated_at on event_ai_analysis (CUL-1201 part 3)
-- ============================================================
-- set_updated_at() stamps now(), the TRANSACTION's start. Two concurrent writes
-- to one read can therefore commit in the opposite order to their stamps, and
-- every last-write-wins reader (the phone's copy included) keeps the superseded
-- version for good. Here the stamp is taken at the ROW's write, after the row
-- lock is held, and is never earlier than the version it replaces: under READ
-- COMMITTED a writer blocked on the lock re-reads OLD as the version that just
-- committed, so its stamp lands strictly after it. The 1µs floor covers a clock
-- that has not moved (or moved back).
--
-- Scoped to this table: the defect was found here, and this is the table whose
-- updated_at the phone's copy decides on. set_updated_at() is unchanged for
-- every other table. The phone's millisecond julianday compare (CUL-1201,
-- 2026-09-25 comment) is PR-12's, where the copy's upsert lives.
--
-- INVOKER (reads nothing), search_path pinned, EXECUTE closed to clients: a
-- trigger fires without an EXECUTE check, so nothing legitimate needs it, and
-- it is registered in lib/functionHardening.test.ts.

CREATE OR REPLACE FUNCTION public.set_updated_at_monotonic()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW.updated_at := GREATEST(clock_timestamp(), OLD.updated_at + interval '1 microsecond');
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_updated_at_monotonic() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_updated_at_monotonic() FROM anon;
REVOKE ALL ON FUNCTION public.set_updated_at_monotonic() FROM authenticated;

-- Same name, same timing (BEFORE UPDATE, so it still fires after the
-- alphabetically earlier trg_event_ai_analysis_same_pet), new function.
DROP TRIGGER IF EXISTS trg_event_ai_analysis_updated_at ON public.event_ai_analysis;
CREATE TRIGGER trg_event_ai_analysis_updated_at
  BEFORE UPDATE ON public.event_ai_analysis
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_monotonic();


-- ============================================================
-- §4 ai_signals: the cache row's stamps (EN-F)
-- ============================================================
-- The cache row is deleted and rewritten on every run, and stand-downs are minted
-- against the previous row. PR-11a skips minting when the previous row's
-- engine_flags differs from the current run's, so flipping the flag never
-- announces a stand-down that did not happen. A read failure on the flag reuses
-- the last stamp rather than writing a flag-off row (GAP-2).

ALTER TABLE public.ai_signals
  ADD COLUMN engine_flags       TEXT[],
  ADD COLUMN engine_fingerprint TEXT;

COMMENT ON COLUMN public.ai_signals.engine_flags IS
  'The Engines v3 app_config keys resolved ON for this run, sorted (EN-F, CUL-1267). NULL = pre-stamp; empty = every key off. No stand-down is minted across a change in this value.';
COMMENT ON COLUMN public.ai_signals.engine_fingerprint IS
  'A hash of the Signal engine that produced this row (critique R-1), so two runs of different code can be told apart. NULL = pre-stamp.';


-- ============================================================
-- §5 signal_shown_log: what the Signal showed (MFU-3)
-- ============================================================
-- ai_signals is one row per pet, replaced on every run, so what the owner was
-- shown on 9/17 no longer exists by 10/1. EN-9 needs the rate at acknowledgement,
-- EN-14 an alert identity, and the ask-evenings metric the run-by-run history.
-- Moved here from PR-21 so the PM's account has a real before-period.
--
-- One row per finding per Signal run that served it. First and last shown are
-- derived (min / max of generated_at per finding_key), never stored, which is
-- what lets the table stay append-only.
--
-- WHAT IT HOLDS: the finding's identity, type and tier, a HASH of the text shown,
-- and the stamps. NEVER the text: the CHECK on text_hash admits only a lowercase
-- hex SHA-256, so a writer that passes the sentence fails at the database.
--
-- WHO WRITES: generate-signal runs as the CALLER (its client carries the caller's
-- JWT), so the writer needs an INSERT policy, exactly as 032's acceptances do. A
-- client can therefore add rows to its OWN pet's log and to no other; the worst it
-- can do is pollute its own measurement. recorded_at is the server's time and is
-- not client-writable (column grant below); generated_at is the run's instant as
-- the writer states it.
--
-- APPEND-ONLY BY RLS ALONE: SELECT + INSERT policies, no UPDATE or DELETE policy,
-- and the UPDATE / DELETE grants revoked for good measure. Deliberately NO trigger
-- that raises on DELETE: it would abort the pets cascade and with it account
-- deletion. Cascade deletes run as the table owner and are unaffected by RLS or
-- the revoked grants.

CREATE TABLE public.signal_shown_log (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id             UUID        NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  generated_at       TIMESTAMPTZ NOT NULL,   -- the Signal run that served the finding
  finding_key        TEXT        NOT NULL CHECK (char_length(finding_key) BETWEEN 1 AND 200),
  finding_type       TEXT        NOT NULL CHECK (char_length(finding_type) BETWEEN 1 AND 64),
  tier               TEXT                 CHECK (tier IS NULL OR char_length(tier) BETWEEN 1 AND 64),
  text_hash          TEXT        NOT NULL CHECK (text_hash ~ '^[0-9a-f]{64}$'),
  engine_fingerprint TEXT        NOT NULL CHECK (char_length(engine_fingerprint) BETWEEN 1 AND 128),
  engine_flags       TEXT[]      NOT NULL,
  recorded_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.signal_shown_log IS
  'Append-only: one row per finding per Signal run that served it (MFU-3, Engines v3 PR-10). Identity, tier and a SHA-256 of the text, never the text. First/last shown are derived. Cascades from pets.';
COMMENT ON COLUMN public.signal_shown_log.finding_key IS
  'The finding''s identity across runs: type plus the noun the sentence is about (the shape of lib/signalFold.ts foldIdentity; the writer, PR-11a, owns the derivation).';
COMMENT ON COLUMN public.signal_shown_log.text_hash IS
  'Lowercase hex SHA-256 of the phrased text shown. The CHECK is what keeps the text itself out of this table.';

-- The reads this exists for: one finding's history on one pet, newest first.
CREATE INDEX signal_shown_log_pet_finding_idx
  ON public.signal_shown_log (pet_id, finding_key, generated_at DESC);

ALTER TABLE public.signal_shown_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "signal_shown_log_read_own" ON public.signal_shown_log
  FOR SELECT
  TO authenticated
  USING (pet_id IN (SELECT id FROM public.pets WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "signal_shown_log_insert_own" ON public.signal_shown_log
  FOR INSERT
  TO authenticated
  WITH CHECK (pet_id IN (SELECT id FROM public.pets WHERE user_id = (SELECT auth.uid())));

-- Grants. RLS decides WHICH rows; grants decide WHICH verbs and columns.
-- Supabase's default privileges hand anon and authenticated every verb at CREATE
-- time. Revoke all, then give authenticated SELECT and an INSERT on exactly the
-- writer-supplied columns, so a payload naming id or recorded_at is refused
-- (032's column-grant discipline).
--
-- MAINTENANCE WARNING: a later bare `GRANT INSERT ON signal_shown_log TO
-- authenticated` would re-cover recorded_at and let a client forge it, and a bare
-- `GRANT UPDATE` / `GRANT DELETE` would still be stopped by RLS but would remove
-- the second wall. Extend the column list; never re-grant at the table level.
REVOKE ALL ON TABLE public.signal_shown_log FROM anon;
REVOKE ALL ON TABLE public.signal_shown_log FROM authenticated;
GRANT SELECT ON TABLE public.signal_shown_log TO authenticated;
GRANT INSERT (pet_id, generated_at, finding_key, finding_type, tier, text_hash,
              engine_fingerprint, engine_flags)
  ON TABLE public.signal_shown_log TO authenticated;
