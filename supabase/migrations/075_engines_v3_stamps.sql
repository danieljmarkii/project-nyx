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
-- Five parts (plus the freeze in §2b), one reason: the stamps are one reconciled
-- set. Three plans (EN-F, EN-2 and flag review's parked data model, #896) each
-- wanted columns on event_ai_analysis under different names; carrying them in
-- one migration is what makes them one vocabulary.
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
--                HASH, never the text, and every stamp and log column carries a
--                shape CHECK so no writer can put words, a path or a signed URL
--                into one (the table is in the realtime publication and the
--                stamps reach the phone). text_hash is reversible by template
--                enumeration, so data rights treat it as the text (§5).
--   Export:      doc-only today (no export function exists in supabase/functions/);
--                the log is the owner's own pet data and belongs in its scope.
--   Label:       unchanged. Everything here is derived from health data the App
--                Store label already declares. Any EVALUATION use of the stamps
--                or the log waits on PMD-12's stated purpose (CUL-1313); until
--                then every evaluation input is synthetic or the PM's own.
--
-- Migration Safety Pre-flight:
--   Destructive:  n  (purely additive: 1 config row, 7 nullable columns with
--                     shape CHECKs, 1 new table with its policies, grants and
--                     index, 2 new functions, 1 new trigger. One trigger is
--                     re-pointed from set_updated_at() to the new function;
--                     set_updated_at() itself is untouched and still serves every
--                     other table. A pre-apply assertion refuses if any read
--                     carries a far-future updated_at.)
--   Rollback:
--     DROP TRIGGER trg_event_ai_analysis_stamps_frozen ON public.event_ai_analysis;
--     DROP FUNCTION public.freeze_event_ai_analysis_stamps();
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
--                   SELECT count(*) FROM event_ai_analysis
--                    WHERE updated_at > now() + interval '1 day'
--                       OR updated_at = 'infinity';                          -- 0
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
-- Every stamp is written by the analyze-* service-role path only (PR-11a). 074
-- revoked client INSERT, but clients still hold table-level UPDATE (013's policy
-- is FOR ALL, for the dismiss and the field edits), which would cover these
-- columns too. The freeze in §2b is what makes "server only" a boundary rather
-- than a description of today's client code (rls-privacy-reviewer, 2026-09-27).
--
-- SHAPE CHECKs, added while every value is NULL (a CHECK added after a bad write
-- fails to apply). The table is in the realtime publication (059) and PR-12
-- copies the stamps to the phone, so a writer bug that put a signed photo URL or
-- a sentence into a stamp would broadcast it and store it on a device. Each
-- CHECK admits only its stamp's shape:
--   photo_set_key  lowercase hex, commas and hyphens: a SHA-256, or a sorted list
--                  of attachment ids (PR-11a / PR-12 choose; the phone has no
--                  hash library today). Never a path, a URL or words.
--   prompt_hash    a lowercase hex SHA-256.
--   model_id / rule_version  a short identifier.
--   engine_flags   §2's key shape, repeated on every engine_flags column.

ALTER TABLE public.event_ai_analysis
  ADD COLUMN photo_set_key TEXT
    CONSTRAINT event_ai_analysis_photo_set_key_shape
    -- The length is its own test: Postgres caps a regex repetition count at 255,
    -- so '{1,4000}' is an invalid pattern that fails the first non-NULL write.
    CHECK (photo_set_key IS NULL OR (char_length(photo_set_key) BETWEEN 1 AND 4000
                                     AND photo_set_key ~ '^[0-9a-f,-]+$')),
  ADD COLUMN model_id      TEXT
    CONSTRAINT event_ai_analysis_model_id_shape
    CHECK (model_id IS NULL OR model_id ~ '^[a-z0-9._:-]{1,100}$'),
  ADD COLUMN prompt_hash   TEXT
    CONSTRAINT event_ai_analysis_prompt_hash_shape
    CHECK (prompt_hash IS NULL OR prompt_hash ~ '^[0-9a-f]{64}$'),
  ADD COLUMN rule_version  TEXT
    CONSTRAINT event_ai_analysis_rule_version_shape
    CHECK (rule_version IS NULL OR rule_version ~ '^[a-z0-9._-]{1,64}$'),
  ADD COLUMN engine_flags  TEXT[]
    CONSTRAINT event_ai_analysis_engine_flags_shape
    CHECK (engine_flags IS NULL OR (
      cardinality(engine_flags) <= 32
      AND array_position(engine_flags, NULL) IS NULL
      AND array_to_string(engine_flags, ',') ~ '^([a-z0-9_]{1,64}(,[a-z0-9_]{1,64})*)?$'
      -- One comma-separated piece per element, so no element can hide a comma
      -- or be empty (array_to_string alone would accept '{"a,b"}' and '{""}').
      AND cardinality(engine_flags) = coalesce(array_length(
            string_to_array(nullif(array_to_string(engine_flags, ','), ''), ','), 1), 0)
    ));

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
-- §2b The stamps are the server's: a client UPDATE may not move them
-- ============================================================
-- The next PRs decide on these values: PR-12's readStateOf treats a photo_set_key
-- mismatch as unread, and flag-off code refuses to lower an escalation whose
-- engine_flags says it was written under a key. A client that could rewrite them
-- (the owner's own JWT: a stale or buggy build, a future upsert path) could make
-- a read of an old photo look current, or turn an EN-0 escalation back into a
-- pre-stamp row that a flag-off re-read may overwrite. Same-account only (013's
-- USING clause already filters other accounts' rows), but these are provenance
-- the server will trust, so a client may not move them at all.
--
-- A trigger, not column-level UPDATE grants, deliberately. Column grants would
-- also close the older hole (a client can write recommendation / read_text on
-- its own rows today), but they replace the table's whole client write posture,
-- and this clone's history is too shallow to prove no installed build writes a
-- column outside today's editable set. That hardening is filed on its own issue;
-- this freeze touches only the columns this migration adds, so no shipped write
-- path can change behaviour.
--
-- Judged by role, not by payload: PostgREST runs a client request as `anon` or
-- `authenticated`; the analyze-* path runs as `service_role`, a migration as
-- `postgres`. INVOKER is load-bearing: a DEFINER function would see its owner as
-- current_user and freeze nothing. An edit that leaves every stamp as it was
-- passes, so a stamped row stays editable and dismissable (C-38: never brick).
-- The message names no value (C-31).

CREATE OR REPLACE FUNCTION public.freeze_event_ai_analysis_stamps()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated')
     AND (NEW.photo_set_key IS DISTINCT FROM OLD.photo_set_key
       OR NEW.model_id      IS DISTINCT FROM OLD.model_id
       OR NEW.prompt_hash   IS DISTINCT FROM OLD.prompt_hash
       OR NEW.rule_version  IS DISTINCT FROM OLD.rule_version
       OR NEW.engine_flags  IS DISTINCT FROM OLD.engine_flags) THEN
    RAISE EXCEPTION 'event_ai_analysis: a read''s stamps are written by the server only'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.freeze_event_ai_analysis_stamps() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.freeze_event_ai_analysis_stamps() FROM anon;
REVOKE ALL ON FUNCTION public.freeze_event_ai_analysis_stamps() FROM authenticated;

-- Fires between trg_event_ai_analysis_same_pet and trg_event_ai_analysis_updated_at
-- (BEFORE triggers run in name order); none reads what another writes.
CREATE TRIGGER trg_event_ai_analysis_stamps_frozen
  BEFORE UPDATE ON public.event_ai_analysis
  FOR EACH ROW EXECUTE FUNCTION public.freeze_event_ai_analysis_stamps();


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
--
-- WHAT THE FLOOR COSTS: set_updated_at() healed a far-future updated_at on the
-- next write; GREATEST(…, OLD + 1µs) keeps it forever, and one such row pins the
-- phone's read-copy watermark (lib/hydration.ts advanceWatermark never moves
-- back), so incremental pulls would skip every later verdict. Near the maximum
-- timestamp it would brick the row. Since 074 only the service role inserts and
-- no analyze-* write sets updated_at, so no new one can appear; but rows from
-- before 074 were client-inserted. So the apply refuses if any exists (a count
-- only, never a value: C-31). Measured 0 of 116 on 2026-09-27 before apply. The
-- phone-side watermark clamp is filed separately.

DO $$
DECLARE
  far_future bigint;
BEGIN
  SELECT count(*) INTO far_future
  FROM public.event_ai_analysis
  WHERE updated_at > now() + interval '1 day' OR updated_at = 'infinity';
  IF far_future > 0 THEN
    RAISE EXCEPTION '075: % event_ai_analysis row(s) carry a far-future updated_at; the monotonic trigger would keep it forever. Repair them first.', far_future;
  END IF;
END;
$$;

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

-- Not frozen like §2b: generate-signal writes this row with the CALLER's JWT, and
-- ai_signals has been client-writable wholesale since 005 (findings included), so
-- a role test cannot tell the engine from the client here. Making the cache
-- server-written is filed on its own issue; until then PR-11a treats these stamps
-- as the same-account hint they are. The shape CHECKs still keep text out.

ALTER TABLE public.ai_signals
  ADD COLUMN engine_flags       TEXT[]
    CONSTRAINT ai_signals_engine_flags_shape
    CHECK (engine_flags IS NULL OR (
      cardinality(engine_flags) <= 32
      AND array_position(engine_flags, NULL) IS NULL
      AND array_to_string(engine_flags, ',') ~ '^([a-z0-9_]{1,64}(,[a-z0-9_]{1,64})*)?$'
      AND cardinality(engine_flags) = coalesce(array_length(
            string_to_array(nullif(array_to_string(engine_flags, ','), ''), ','), 1), 0)
    )),
  ADD COLUMN engine_fingerprint TEXT
    CONSTRAINT ai_signals_engine_fingerprint_shape
    CHECK (engine_fingerprint IS NULL OR engine_fingerprint ~ '^[0-9a-f]{64}$');

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
-- can do is pollute its own measurement, inside the shapes the CHECKs allow.
-- recorded_at is the server's time and is not client-writable (column grant
-- below); generated_at is the run's instant as the writer states it, bounded to
-- recorded_at. Whether PR-11a should instead write the log with a service-role
-- client (pet_id from the caller-JWT pets read, then drop this INSERT policy and
-- grant, and HMAC the text) is PR-11a's call; the rls-privacy-reviewer raised it
-- on 2026-09-27 as the stronger option if EN-9 or evaluation must trust the log.
--
-- APPEND-ONLY BY RLS ALONE: SELECT + INSERT policies, no UPDATE or DELETE policy,
-- and the UPDATE / DELETE grants revoked for good measure. Deliberately NO trigger
-- that raises on DELETE: it would abort the pets cascade and with it account
-- deletion. Cascade deletes run as the table owner and are unaffected by RLS or
-- the revoked grants.

-- EVERY column is shape-checked, not only text_hash: a writer bug (or a client,
-- which can insert into its own pet's log) must not be able to put the sentence
-- into finding_key, the fingerprint or a flag element instead. finding_key must
-- begin with its own finding_type, and generated_at must sit beside the server's
-- recorded_at, so a row cannot backdate "first shown" (the log's min) or pose as
-- a showing from another day.
--
-- TWO THINGS THE CHECKs DO NOT CHANGE, stated so they read as known:
--   · finding_key IS health data by design (foldIdentity carries the protein
--     cluster and the symptom type). It is the owner's own data, cascades, and
--     belongs in the export scope.
--   · text_hash is an unsalted SHA-256 of a templated sentence, so anyone holding
--     the templates can recover the text by enumeration. For data rights and any
--     evaluation use (PMD-12), treat the hash as equivalent to the text.

CREATE TABLE public.signal_shown_log (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id             UUID        NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  generated_at       TIMESTAMPTZ NOT NULL,   -- the Signal run that served the finding
  finding_type       TEXT        NOT NULL CHECK (finding_type ~ '^[a-z0-9_]{1,64}$'),
  finding_key        TEXT        NOT NULL CHECK (char_length(finding_key) BETWEEN 1 AND 200),
  tier               TEXT                 CHECK (tier IS NULL OR tier ~ '^[a-z0-9_]{1,32}$'),
  text_hash          TEXT        NOT NULL CHECK (text_hash ~ '^[0-9a-f]{64}$'),
  engine_fingerprint TEXT        NOT NULL CHECK (engine_fingerprint ~ '^[0-9a-f]{64}$'),
  engine_flags       TEXT[]      NOT NULL CHECK (
      cardinality(engine_flags) <= 32
      AND array_position(engine_flags, NULL) IS NULL
      AND array_to_string(engine_flags, ',') ~ '^([a-z0-9_]{1,64}(,[a-z0-9_]{1,64})*)?$'
      AND cardinality(engine_flags) = coalesce(array_length(
            string_to_array(nullif(array_to_string(engine_flags, ','), ''), ','), 1), 0)
  ),
  recorded_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT signal_shown_log_key_names_its_type
    CHECK (finding_key = finding_type OR left(finding_key, char_length(finding_type) + 1) = finding_type || ':'),
  CONSTRAINT signal_shown_log_generated_beside_recorded
    CHECK (generated_at BETWEEN recorded_at - interval '1 hour' AND recorded_at + interval '5 minutes')
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
