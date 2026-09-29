-- ============================================================
-- Migration 079: the per-incident read's tier (Engines v3 PR-25)
--   EN-3 (CUL-1133) part 1: the additive tier column, and the tier joins
--   075's server-only freeze.
-- See: docs/nyx-incident-tiers-requirements.md §1 (storage) and §11 (K2 ruled
--      "drawn at render", PM 2026-09-28); the PR-25 plan comment on CUL-1133;
--      docs/engines-v3-critique-2026-09.md GAP-3, GAP-34, R-1, R-5.
-- ============================================================
--
-- SCHEMA ONLY. Nothing writes or reads `tier` until PR-26 (the analyze-* writers
-- dual-write it under the Engines v3 flag) and PR-27 (the client reads it through
-- the tier-word map). Applying this changes nothing an owner can see, so the flag
-- does not gate it (EN-F: additive schema nothing reads is not flagged).
--
-- ------------------------------------------------------------
-- WHY A SECOND COLUMN, NOT NEW VALUES IN `recommendation` (GAP-3, CUL-1277)
-- ------------------------------------------------------------
-- Installed builds (1.2.0) read only `recommendation`, and every shipped
-- escalation guard checks its literal 'worth_a_call'. A new value there would be
-- blank or rose on an old phone, and a new QUIET value on a failed or capped row
-- would be rescued as a false "Worth a call" (CUL-1277's binding condition). So
-- `recommendation` keeps its three values forever and the tier lives beside it.
-- The writers' mapping (PR-26's contract, spec §1):
--   call_now, call_today -> worth_a_call
--   logged               -> monitor
--   not_enough_to_say    -> not_enough_to_say
-- A vomit with no photo read is not_enough_to_say in BOTH columns, never logged.
--
-- THE VALUES: four (K2). "Part of a pattern" is drawn at render from the live
-- finding's evidence set and is never stored, so it has no value here.
-- TEXT + CHECK rather than a Postgres enum: a later value is a constraint swap in
-- one transaction, not ALTER TYPE … ADD VALUE, and the shape CHECK keeps words,
-- paths and URLs out of a column that is in the realtime publication (059).
--
-- NULL means one thing: no tier was written for this row. It does NOT mean
-- "earlier rule": that is decided by 075's rule_version stamp (spec §1). A NULL
-- tier on a row written under the new rule is a writer bug, and readers show the
-- louder of the tier and `recommendation`'s rank, so a missed dual-write can
-- never render calmer than the legacy column. No backfill, deliberately: an old
-- worth_a_call was never graded, and relabelling it now would invent a tier.
--
-- ------------------------------------------------------------
-- WHAT THIS DELIBERATELY DOES NOT ADD
-- ------------------------------------------------------------
--   · No CHECK pairing `tier` with `recommendation`. Under an EN-F rollback,
--     flag-off code writes `recommendation` and never touches `tier`. A pairing
--     CHECK would reject a flag-off escalation over a calm tiered row with 23514
--     (and send it to the client's terminal path), losing the one write that
--     matters most (C-38: never brick what the guard failed to protect). The
--     mapping is PR-26's writer contract, proven by its tests; readers' max is
--     the backstop that does not depend on it.
--   · No "never lower" trigger. Never-lower binds the call tiers only and is
--     decided in resolveReanalysisWrite and the cap branch (PR-26); a database
--     guard for it is CUL-1321's, filed separately.
--   · No stored shown tier yet (spec §1, GAP-34). Its shape is a device claim
--     carrying a rule version and the row ids it read (spec §8 item 5), which is
--     a log, and its writer is EN-4's re-floor marker (PR-28). Until that re-floor
--     exists the only thing that moves a stored tier is a re-read, which PR-26's
--     never-lower binds, so `tier` is itself the floor of what was shown.
--
-- ------------------------------------------------------------
-- R-5, THE PRIVACY LINE
-- ------------------------------------------------------------
--   Cascade:     inherits event_ai_analysis's (events and pets ON DELETE CASCADE).
--   RLS:         inherits 013's policy; 074 revoked client INSERT. Client UPDATE
--                of this column is refused by the freeze (§2 below).
--   Same-pet:    no new reference; 074's trigger is unchanged.
--   Wipe list:   the phone's copy of the tier is PR-27's; it wipes with the table
--                it extends.
--   Model reads: none here. Ask relays `recommendation` raw to its model today;
--                the tier must reach Ask only as the map's words with a one-line
--                definition (spec §4), never the raw value. That is PR-26/27's.
--   Export:      the owner's own pet data; in the export scope with the read.
--   Label:       unchanged (derived from health data already declared).
--
-- Migration Safety Pre-flight:
--   Destructive:  n  (1 nullable column with a CHECK, added while every value is
--                     NULL; 1 function body replaced by a superset of 075's).
--   Rollback:
--     BEGIN;
--     re-run 075's §2b CREATE OR REPLACE FUNCTION
--       public.freeze_event_ai_analysis_stamps() verbatim, the function only
--       (075's CREATE TRIGGER still stands; this body minus the `tier` line);
--     ALTER TABLE public.event_ai_analysis DROP COLUMN tier;
--     COMMIT;
--     One transaction: 079's body names NEW.tier, so with the column gone and
--     the body not yet restored every UPDATE on the table would fail.
--     Safe as written only while nothing names the column. Once PR-26's writers
--     set `tier` (every analyze-* write-back would then fail, escalations
--     included) or PR-27 selects it, revert or hold those first, then run this.
--     (Irreversible only for tier values PR-26 has written by then.)
--   Backfill:     N/A, deliberately (see above).
--   Affected tables: event_ai_analysis (ADD COLUMN; the freeze trigger's function).
--                 Sanity check before applying:
--                   SELECT column_name FROM information_schema.columns
--                    WHERE table_name = 'event_ai_analysis' AND column_name = 'tier';  -- 0 rows
--                   SELECT to_regprocedure('public.freeze_event_ai_analysis_stamps()'); -- not NULL (075 applied)
-- ============================================================


-- ============================================================
-- §1 The column
-- ============================================================

ALTER TABLE public.event_ai_analysis
  ADD COLUMN tier TEXT
    CONSTRAINT event_ai_analysis_tier_values
    CHECK (tier IS NULL OR tier IN ('call_now', 'call_today', 'logged', 'not_enough_to_say'));

COMMENT ON COLUMN public.event_ai_analysis.tier IS
  'EN-3 (CUL-1133): how soon to act on this read. call_now > call_today > {logged, not_enough_to_say}. Written beside recommendation, which keeps its three values for installed builds (call_* -> worth_a_call, logged -> monitor, not_enough_to_say -> not_enough_to_say). Readers show the louder of the two. NULL = no tier written; "earlier rule" is rule_version''s call, not this column''s. "Part of a pattern" is drawn at render and never stored (K2). Server-written only (freeze_event_ai_analysis_stamps).';


-- ============================================================
-- §2 The tier is the server's: a client UPDATE may not move it
-- ============================================================
-- Readers take the louder of `tier` and `recommendation`, which protects against
-- a MISSING tier but not a LOWERED one: a client that rewrote call_now to logged
-- on its own row would still render (worth_a_call ranks as call_today), a quieter
-- call than the server gave, with nothing to catch it. So the tier joins the
-- stamps 075 froze, by the same rule and for the same reason: it is a value the
-- server decides on.
--
-- 075's body, verbatim, plus one line. Same posture: INVOKER (it tests
-- current_user; DEFINER would freeze nothing), search_path pinned, EXECUTE closed
-- to clients (lib/functionHardening.test.ts already registers it). An edit that
-- leaves the tier as it was passes, so a tiered row stays editable and
-- dismissable (C-38). The message names no value (C-31).

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
       OR NEW.engine_flags  IS DISTINCT FROM OLD.engine_flags
       OR NEW.tier          IS DISTINCT FROM OLD.tier) THEN
    RAISE EXCEPTION 'event_ai_analysis: a read''s stamps are written by the server only'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- CREATE OR REPLACE keeps the function's existing ACL, but restate 075's revokes
-- so this file alone proves the posture.
REVOKE ALL ON FUNCTION public.freeze_event_ai_analysis_stamps() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.freeze_event_ai_analysis_stamps() FROM anon;
REVOKE ALL ON FUNCTION public.freeze_event_ai_analysis_stamps() FROM authenticated;

-- trg_event_ai_analysis_stamps_frozen (075) already calls this function; it is
-- not re-created.
