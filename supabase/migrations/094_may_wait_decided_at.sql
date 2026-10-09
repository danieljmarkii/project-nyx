-- ============================================================
-- Migration 094: when the server decided a read's leave to wait
--   (Engines v3 PR-27l)
-- See: CUL-1707 (the issue, the plan and the PM's go A 2026-10-09);
--      CUL-1629 (PR-27f, whose adversarial pass found the gap, finding 1);
--      087_incident_may_wait.sql (the column this dates);
--      088_may_wait_owner_edit.sql (the freeze body this extends).
-- ============================================================
--
-- THE GAP
-- ------------------------------------------------------------
-- `may_wait` TRUE is leave for a call_today read to say "first thing tomorrow",
-- and that leave covers ONE night: the phone ends it at the first local 6 AM
-- after the decision (lib/mayWaitLine.ts, `leaveEndsAt`). The phone has no true
-- decision time. It reads `updated_at`, which every write moves since 075, a
-- Hide or a Show included (lib/analysisDismissal.ts), and 088 does not take the
-- leave back on one. So a Hide tapped open the next morning would re-open the
-- night; PR-27f bounded it by min(updated_at, the incident's own time), which is
-- safe but cuts short a late read of an older vomit. This column is the time.
--
-- ------------------------------------------------------------
-- WHAT IT MEANS
-- ------------------------------------------------------------
-- The server time of the last SERVER write that carried `may_wait`, whatever
-- value it carried (incident-analysis.ts `withMayWaitDecidedAt`, at every write
-- that names the column). A TRUE is only ever written on a fresh passing verdict
-- (`mayWaitValue`), so beside a TRUE the stamp is that verdict's time.
--
-- THE DIRECTION IS STILL THE POINT. The one unsafe stamp is one NEWER than the
-- TRUE beside it: it would lengthen the night past what was decided. A write
-- that does not carry `may_wait` therefore never moves it, and a writer that
-- forgets to stamp leaves an OLDER time (or none), which ends the night sooner:
-- the louder line. The phone also never reads it past `updated_at`, so a skewed
-- stamp cannot lengthen the night either.
--
-- 088–092's client sweeps lower TRUE -> NULL and leave the stamp as it was:
-- NULL grants nothing, so a stamp beside it means nothing.
--
-- NO DEFAULT, NO BACKFILL, deliberately: an old TRUE was never stamped, and
-- stamping it now would date a decision to today. A row with no stamp keeps the
-- phone's PR-27f bound, min(updated_at, the incident's time).
--
-- ------------------------------------------------------------
-- R-5, THE PRIVACY LINE
-- ------------------------------------------------------------
--   Cascade:     inherits event_ai_analysis's (events and pets ON DELETE CASCADE).
--   RLS:         013's policy, unchanged; 074 revoked client INSERT. Client
--                UPDATE of this column is refused by the freeze (§2): without it
--                an owner could push the stamp forward and lengthen their night.
--   Same-pet:    no new reference; 074's trigger is unchanged.
--   Realtime:    the table is in the publication (059); a timestamp carries no
--                words, paths or URLs.
--   Wipe list:   no local copy (the phone reads it with the row and holds it in
--                component state only).
--   Model reads: none.
--   Export:      the owner's own pet data; in the export scope with the read.
--   Label:       unchanged (derived from health data already declared).
--
-- Migration Safety Pre-flight:
--   Destructive:  n  (1 nullable column added while every value is NULL; 1
--                     function body replaced by a superset of 088's).
--   Rollback (one transaction; 094's freeze body names the column, so with the
--   column gone and the body not yet restored every UPDATE would fail):
--     BEGIN;
--     re-run 088's §1 CREATE OR REPLACE FUNCTION
--       public.freeze_event_ai_analysis_stamps() and its three REVOKEs verbatim;
--     ALTER TABLE public.event_ai_analysis DROP COLUMN may_wait_decided_at;
--     COMMIT;
--     The server writer names the column (PR-27l's incident-analysis.ts): revert
--     or hold analyze-vomit / analyze-stool first, or every analysis write fails
--     on the unknown column. The phone selects it too: a build that selects it
--     reads an error until the column is back.
--   Backfill:     N/A, deliberately (see above).
--   Affected tables: event_ai_analysis (ADD COLUMN; the freeze trigger's function).
--                 Sanity checks before applying:
--                   SELECT column_name FROM information_schema.columns
--                    WHERE table_name = 'event_ai_analysis' AND column_name = 'may_wait_decided_at'; -- 0 rows
--                   SELECT count(*) FROM pg_proc WHERE proname = 'take_back_may_wait_on_owner_edit';    -- 1 (088 applied)
-- ============================================================


-- ============================================================
-- §1 The column
-- ============================================================

ALTER TABLE public.event_ai_analysis
  ADD COLUMN may_wait_decided_at TIMESTAMPTZ;

COMMENT ON COLUMN public.event_ai_analysis.may_wait_decided_at IS
  'CUL-1707: the server time of the last server write that carried may_wait. Beside a TRUE it is when the leave to wait was decided; the phone ends that leave at the first local 6 AM after it (never later than updated_at). A write without may_wait never moves it, so it is never newer than the TRUE beside it. NULL = never stamped (every pre-094 row): the phone keeps min(updated_at, the incident time). No backfill. Server-written only (freeze_event_ai_analysis_stamps).';


-- ============================================================
-- §2 The stamp is the server's: a client UPDATE may not move it
-- ============================================================
-- 088's body, verbatim, plus one line. Same posture and reasons as
-- 075/079/085/086/087/088: INVOKER (it tests current_user; DEFINER would freeze
-- nothing), search_path pinned, EXECUTE closed to clients. An edit that leaves
-- the stamp as it was passes, so a row stays editable, dismissable and
-- lowerable (088's TRUE -> NULL moves only `may_wait`) (C-38). The message names
-- no value (C-31).

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
       OR NEW.ai_raw_payload                IS DISTINCT FROM OLD.ai_raw_payload
       OR NEW.visual_flags                  IS DISTINCT FROM OLD.visual_flags
       OR NEW.may_wait_decided_at           IS DISTINCT FROM OLD.may_wait_decided_at
       OR (NEW.may_wait IS DISTINCT FROM OLD.may_wait
           AND NOT (OLD.may_wait IS TRUE AND NEW.may_wait IS NULL))) THEN
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
