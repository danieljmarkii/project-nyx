-- ============================================================
-- Migration 094: when the leave to wait was first decided
--   (Engines v3 PR-27l)
-- See: CUL-1707 (the issue, the plan, the PM's go A 2026-10-09, and the PM's
--      ruling A on the re-read residual the same day);
--      CUL-1629 (PR-27f, whose adversarial pass found the gap, finding 1);
--      087_incident_may_wait.sql (the column this dates);
--      088_may_wait_owner_edit.sql (the freeze body this extends).
-- ============================================================
--
-- THE GAP
-- ------------------------------------------------------------
-- `may_wait` TRUE is leave for a call_today read to say "first thing tomorrow",
-- and that leave covers ONE night: the phone ends it at the first local 6 AM
-- after the decision (lib/mayWaitLine.ts, `leaveEndsAt`). The phone had no
-- decision time. It read `updated_at`, which every write moves since 075, a
-- Hide or a Show included (lib/analysisDismissal.ts), and 088 does not take the
-- leave back on one. So PR-27f bounded the night by min(updated_at, the
-- incident's own time): safe, but it cuts short a late read of an older vomit.
--
-- ------------------------------------------------------------
-- WHAT IT MEANS: THE FIRST GRANT, SET ONCE
-- ------------------------------------------------------------
-- The time `may_wait` first became TRUE on this row. A trigger (§3) writes it,
-- and nothing ever moves it after: a later TRUE, a lower to NULL (088–092, the
-- server's take-backs) and another read all leave it where it is.
--
-- WHY ONCE, NOT THE LATEST DECISION (PM ruling A, 2026-10-09; the adversarial
-- and rls-privacy-reviewer passes on this PR's first draft both found it): the
-- server's predicate does not read an incident's age. A stamp that moved with
-- every passing read would let a second read of an old call today, by the owner
-- or by a photo landing and being read, start a fresh night that nobody decided
-- after the first one had run out. Set once, a late FIRST read keeps its night
-- (the point of CUL-1707) and every later read errs earlier, the louder line.
--
-- WHY A TRIGGER, NOT THE WRITER: one writer, every path. The Edge Functions,
-- revalidateMayWait, a dashboard edit and any future writer all reach the row
-- through it, so no write can forget the stamp or carry its own. It reads the
-- database's clock, `now()` (the transaction's start), so it is never later than
-- the write's own `updated_at` (075: GREATEST(clock_timestamp(), …) on update,
-- the column default on insert).
--
-- WHEN IT STAMPS: only on the TRANSITION to TRUE, when the row holds no stamp:
--   INSERT with `may_wait` TRUE, or an UPDATE whose OLD `may_wait` IS NOT TRUE and
--   whose NEW `may_wait` IS TRUE. A TRUE that already stood before this
--   migration is never stamped by a later write over it (a Hide, a re-read that
--   keeps it TRUE): stamping it then would date an old decision to today. Such a
--   row keeps the phone's PR-27f bound until it is lowered.
--
-- STATED BLIND SPOTS:
--   · A row deleted and re-created loses its first stamp. No app path deletes an
--     analysis row, but 013's FOR ALL policy lets the owner by hand, and a
--     re-read then stamps afresh: one more night per deletion. Photographed, that
--     costs a model read under the caps; a photoless record-alone call is not
--     capped (the cap gate runs only with a photo, incident-analysis.ts), so it
--     costs only the hand-made DELETE and a re-invoke.
--   · A TRUE that predates 094, lowered and then raised again, is stamped at the
--     raise: its first night is unknowable. Only incidents spanning the apply.
--   · The stamp is the write's transaction start, a moment after the server's
--     verdict (the verdict's read is a separate request). The gap is the write's
--     latency; a verdict a breath before 6 AM may get the following night. The
--     predicate reads no time of day, so the words stay right.
--
-- NO DEFAULT, NO BACKFILL, deliberately: an old TRUE was never stamped, and
-- stamping it now would date a decision to today.
--
-- ------------------------------------------------------------
-- R-5, THE PRIVACY LINE
-- ------------------------------------------------------------
--   Cascade:     inherits event_ai_analysis's (events and pets ON DELETE CASCADE).
--   RLS:         013's policy, unchanged; 074 revoked client INSERT. A client
--                UPDATE that moves the stamp is refused by the freeze (§2), which
--                fires before §3: without it an owner could push the stamp
--                forward and lengthen their night.
--   Trigger:     INVOKER, search_path pinned, EXECUTE revoked from clients; it
--                assigns NEW only, reads no other row, raises nothing.
--   Same-pet:    no new reference; 074's trigger is unchanged.
--   Realtime:    the table is in the publication (059); a timestamp carries no
--                words, paths or URLs.
--   Wipe list:   no local copy (the phone reads it with the row and holds it in
--                component state only).
--   Model reads: none.
--   Export:      no export function exists yet (B-041); the column rides with
--                the row when one does.
--   Label:       unchanged (derived from health data already declared).
--
-- Migration Safety Pre-flight:
--   Destructive:  n  (1 nullable column added while every value is NULL; 1
--                     function body replaced by a superset of 088's; 1 new
--                     function on 1 new trigger).
--   Rollback (one transaction; the freeze body and the trigger name the column):
--     BEGIN;
--     DROP TRIGGER trg_event_ai_analysis_stamps_may_wait_once ON public.event_ai_analysis;
--     DROP FUNCTION public.stamp_may_wait_decided_at();
--     re-run 088's §1 CREATE OR REPLACE FUNCTION
--       public.freeze_event_ai_analysis_stamps() and its three REVOKEs verbatim;
--     ALTER TABLE public.event_ai_analysis DROP COLUMN may_wait_decided_at;
--     COMMIT;
--     The phone selects the column (PR-27l's two analysis sections): revert or
--     hold that build first, or its read errors until the column is back. No
--     Edge Function names it.
--   Backfill:     N/A, deliberately (see above).
--   Affected tables: event_ai_analysis (ADD COLUMN; the freeze trigger's function;
--                 one new trigger). Sanity checks before applying:
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
  'CUL-1707: when may_wait first became TRUE on this row, set once by trg_event_ai_analysis_stamps_may_wait_once and never moved (a later TRUE, a lower and a re-read leave it). The phone ends the leave to wait at the first local 6 AM after it (never later than updated_at). NULL = no TRUE since 094: the phone keeps min(updated_at, the incident time). No backfill. Clients may not move it (freeze_event_ai_analysis_stamps).';


-- ============================================================
-- §2 The stamp is the server's: a client UPDATE may not move it
-- ============================================================
-- 088's body, verbatim, plus one line. Same posture and reasons as
-- 075/079/085/086/087/088: INVOKER (it tests current_user; DEFINER would freeze
-- nothing), search_path pinned, EXECUTE closed to clients. An edit that leaves
-- the stamp as it was passes, so a row stays editable, dismissable and
-- lowerable (088's TRUE -> NULL moves only `may_wait`) (C-38). The message names
-- no value (C-31). §3 holds the stamp against every role; this line makes a
-- client's attempt LOUD (42501) instead of silently held, since the freeze
-- fires first (triggers of one timing fire in name order: "stamps_frozen" sorts
-- before "stamps_may_wait_once").

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


-- ============================================================
-- §3 The stamp: set on the first TRUE, never moved
-- ============================================================
-- Every role, the server's included: the stamp is the database's, and a writer
-- that names the column has it overwritten here. Fires after the freeze (above)
-- and after 088's owner-edit lower (`may_wait_edit_row` sorts first), so it sees
-- the `may_wait` the row will actually hold, and before `updated_at` (075), which
-- is set from the clock after it.

CREATE OR REPLACE FUNCTION public.stamp_may_wait_decided_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.may_wait_decided_at := CASE WHEN NEW.may_wait IS TRUE THEN now() END;
  ELSIF OLD.may_wait_decided_at IS NOT NULL THEN
    NEW.may_wait_decided_at := OLD.may_wait_decided_at;
  ELSIF NEW.may_wait IS TRUE AND OLD.may_wait IS NOT TRUE THEN
    NEW.may_wait_decided_at := now();
  ELSE
    NEW.may_wait_decided_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.stamp_may_wait_decided_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stamp_may_wait_decided_at() FROM anon;
REVOKE ALL ON FUNCTION public.stamp_may_wait_decided_at() FROM authenticated;

CREATE TRIGGER trg_event_ai_analysis_stamps_may_wait_once
  BEFORE INSERT OR UPDATE ON public.event_ai_analysis
  FOR EACH ROW EXECUTE FUNCTION public.stamp_may_wait_decided_at();
