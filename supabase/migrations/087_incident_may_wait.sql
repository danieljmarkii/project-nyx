-- ============================================================
-- Migration 087: the "may wait" fact beside a per-incident read's tier
--   (Engines v3 PR-27c)
--   EN-3 remainder B (CUL-1611, PM ruled A 2026-10-06): the server stores
--   whether a call_today read may say "first thing tomorrow" late in the day.
-- See: CUL-1611 (the decision brief and the eight checks the server must pass
--      before allowing the wait); CUL-1627 (this PR's plan + PM go);
--      CUL-1510 (PR-27b's four adversarial passes that broke every
--      client-side attempt); 079_incident_tier.sql (the tier this sits beside).
-- ============================================================
--
-- SCHEMA ONLY. Nothing writes or reads `may_wait` until PR-27e (analyze-vomit /
-- analyze-stool decide it server-side) and PR-27f (the client renders the
-- late-day line only on it). Applying this changes nothing an owner can see.
--
-- ------------------------------------------------------------
-- THE DIRECTION IS THE POINT
-- ------------------------------------------------------------
-- "First thing tomorrow" is leave to wait. It is the CALMER line, so the default
-- must be the louder one ("If they're closed, call an emergency clinic"):
--   TRUE   the server checked every CUL-1611 rule and allows the wait.
--   FALSE  the server checked and refused it.
--   NULL   no fact was written: every row before PR-27e, a writer that did not
--          decide, a flag-off write. Reads exactly as FALSE.
-- Only TRUE grants leave. A reader tests `may_wait IS TRUE`, never
-- `NOT may_wait` / `may_wait IS NOT FALSE`, so absent, null and unknown all keep
-- the louder line. No default and no backfill, deliberately: an old read was
-- never checked against those rules, and stamping one now would invent leave.
--
-- A boolean, not the resolved line's class: the words live in the client's tier
-- map (one place nyx-voice and the copy guards read), and the column holds only
-- the fact the server decided. It means something only beside
-- `tier = 'call_today'`; readers gate on BOTH (`tier = 'call_today' AND
-- may_wait IS TRUE`).
--
-- ------------------------------------------------------------
-- WHAT THIS DELIBERATELY DOES NOT ADD
-- ------------------------------------------------------------
--   · No CHECK pairing it with `tier` (`may_wait IS NOT TRUE OR tier =
--     'call_today'`). A re-read that escalates a row to call_now while a stale
--     TRUE sits on it would fail 23514 and go to the client's terminal path:
--     the escalation would be the write lost (079's reasoning, C-38: never brick
--     what the guard failed to protect). Readers' two-column gate is the
--     backstop that does not depend on the writer. PR-27e's writer contract:
--     every write that writes `tier` writes `may_wait` too (TRUE, or FALSE /
--     NULL), so a re-read never inherits the previous read's leave.
--   · No index. Nothing filters on it; it is read with its row.
--
-- ------------------------------------------------------------
-- R-5, THE PRIVACY LINE
-- ------------------------------------------------------------
--   Cascade:     inherits event_ai_analysis's (events and pets ON DELETE CASCADE).
--   RLS:         inherits 013's policy, unchanged; 074 revoked client INSERT.
--                Client UPDATE of this column is refused by the freeze (§2):
--                without it an owner's own row could be set TRUE and earn the
--                calmer line, which RLS alone permits.
--   Same-pet:    no new reference; 074's trigger is unchanged.
--   Realtime:    the table is in the publication (059); a boolean carries no
--                words, paths or URLs.
--   Wipe list:   no local copy yet; PR-27f's, with the table it extends.
--   Model reads: none.
--   Export:      the owner's own pet data; in the export scope with the read.
--   Label:       unchanged (derived from health data already declared).
--
-- Migration Safety Pre-flight:
--   Destructive:  n  (1 nullable column added while every value is NULL; 1
--                     function body replaced by a superset of 086's).
--   Rollback (one transaction; 087's freeze body names NEW.may_wait, so with
--   the column gone and the body not yet restored every UPDATE would fail):
--     BEGIN;
--     re-run 086's §2 CREATE OR REPLACE FUNCTION
--       public.freeze_event_ai_analysis_stamps() verbatim (this body minus the
--       `may_wait` line);
--     ALTER TABLE public.event_ai_analysis DROP COLUMN may_wait;
--     COMMIT;
--     Safe as written only while nothing names the column. Once PR-27e writes it
--     or PR-27f selects it, revert or hold those first, then run this.
--   Backfill:     N/A, deliberately (see above).
--   Affected tables: event_ai_analysis (ADD COLUMN; the freeze trigger's function).
--                 Sanity checks before applying:
--                   SELECT column_name FROM information_schema.columns
--                    WHERE table_name = 'event_ai_analysis' AND column_name = 'may_wait';     -- 0 rows
--                   SELECT column_name FROM information_schema.columns
--                    WHERE table_name = 'event_ai_analysis' AND column_name = 'intake_read_at'; -- 1 row (086 applied)
-- ============================================================


-- ============================================================
-- §1 The column
-- ============================================================

ALTER TABLE public.event_ai_analysis
  ADD COLUMN may_wait BOOLEAN;

COMMENT ON COLUMN public.event_ai_analysis.may_wait IS
  'CUL-1611 (EN-3 remainder B): TRUE only when the server checked every rule in CUL-1611 and allows a call_today read to say "first thing tomorrow" late in the day. FALSE = checked and refused; NULL = no fact written (every pre-PR-27e row). FALSE and NULL both mean no leave to wait, the louder line: readers test may_wait IS TRUE, and only beside tier = ''call_today''. No backfill. Server-written only (freeze_event_ai_analysis_stamps).';


-- ============================================================
-- §2 The fact is the server's: a client UPDATE may not move it
-- ============================================================
-- 086's body, verbatim, plus one line. Same posture and reasons: INVOKER (it
-- tests current_user; DEFINER would freeze nothing), search_path pinned,
-- EXECUTE closed to clients. An edit that leaves `may_wait` as it was passes, so
-- a row stays editable and dismissable (C-38). The message names no value (C-31).

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
       OR NEW.tier          IS DISTINCT FROM OLD.tier
       OR NEW.intake_correction_at          IS DISTINCT FROM OLD.intake_correction_at
       OR NEW.intake_correction_meals       IS DISTINCT FROM OLD.intake_correction_meals
       OR NEW.intake_correction_most_or_all IS DISTINCT FROM OLD.intake_correction_most_or_all
       OR NEW.intake_correction_unrated     IS DISTINCT FROM OLD.intake_correction_unrated
       OR NEW.intake_read_at                IS DISTINCT FROM OLD.intake_read_at
       OR NEW.may_wait                      IS DISTINCT FROM OLD.may_wait) THEN
    RAISE EXCEPTION 'event_ai_analysis: a read''s stamps are written by the server only'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- CREATE OR REPLACE keeps the function's existing ACL, but restate the revokes
-- so this file alone proves the posture.
REVOKE ALL ON FUNCTION public.freeze_event_ai_analysis_stamps() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.freeze_event_ai_analysis_stamps() FROM anon;
REVOKE ALL ON FUNCTION public.freeze_event_ai_analysis_stamps() FROM authenticated;

-- trg_event_ai_analysis_stamps_frozen (075) already calls this function; it is
-- not re-created.
