-- ============================================================
-- Migration 099: when a read's call was said (Engines v3, CUL-1754)
-- See: CUL-1754 (the issue, the plan, the PM's go and ruling (a), 2026-10-10);
--      CUL-1739 / #1156 (PR-30c, the dated call now, whose adversarial passes 2-4
--      all broke on `updated_at` standing in for "said at", and ruling B);
--      094_may_wait_decided_at.sql (the stamp shape and the freeze body this extends).
-- ============================================================
--
-- THE GAP
-- ------------------------------------------------------------
-- A "Call your vet now" read says "now" for 24 hours from when it was said, then
-- steps to a dated form ("On Oct 3, the read said: call your vet now"; PR-30c).
-- "Said" was the later of the event and the row's `updated_at`, and every write
-- moves `updated_at` since 075: a Hide (lib/analysisDismissal.ts), an owner's
-- field edit, a failed re-read's error-only write, 089's `may_wait` take-back.
-- Each restarts "now" for a day and dates the call to the day of that write:
-- loud, accepted under ruling B, and false.
--
-- ------------------------------------------------------------
-- WHAT IT MEANS
-- ------------------------------------------------------------
-- The time this row's CALL was last said: when its call level changed into a
-- call, or when a read at the same call level gave a new reason for it. The call
-- level is the louder of the two columns the phone resolves (lib/incidentTier.ts,
-- `effectiveTierRank`):
--     2  tier = 'call_now'
--     1  tier = 'call_today', or recommendation = 'worth_a_call'
--     0  anything quieter (logged, not_enough_to_say, monitor, nothing)
--
-- WHEN IT STAMPS (now(), the transaction's start; never later than the write's
-- own `updated_at`, which 075 sets from the clock after this trigger):
--   · INSERT at level 1 or 2.
--   · UPDATE whose level changes and lands on 1 or 2: a raise (quiet -> call, call
--     today -> call now, a re-floor) and a lower between calls (call now -> call
--     today) are both newly said.
--   · UPDATE at the same level 1 or 2 whose `visual_flags` or `contextual_flags`
--     changed: a re-read that keeps the call for a NEW reason (blood on a new
--     photo, lethargy logged beside it). Without this, "if you haven't spoken to
--     your vet since Oct 1" would excuse an owner who called before the new sign.
--     The louder side: a re-read that only reorders the same flags re-stamps too.
-- WHEN IT CLEARS: an UPDATE that lands on level 0 (the row says no call).
-- OTHERWISE IT IS KEPT: a Hide, a Show, an owner's field edit (it writes neither
--   flag column: lib/analysis.ts buildVomitEditWrite / buildStoolEditWrite), a
--   failed re-read's error-only write, 088-092's `may_wait` writes, and a re-read
--   that keeps the same call for the same reasons.
--
-- WHY A TRIGGER, NOT THE WRITER: one writer, every path (094's reasoning). The
-- Edge Functions, a dashboard edit and any future writer reach the row through
-- it; a writer that names the column has it overwritten.
--
-- STATED BLIND SPOTS:
--   · A row written before 099 keeps NULL until its level or its flags change.
--     The phone and generate-signal then fall back to `updated_at` (ruling B's
--     loud behaviour), so nothing is quieter than today.
--   · `contextual_flags` is not in the client freeze (it never was); a client
--     write of it would move this stamp LATER, the loud side. No app path writes
--     it. Freezing it is a separate change.
--   · `recommendation` is not in the client freeze either (075's older hole). On a
--     legacy level-1 row (no tier, `worth_a_call`) a client write of it can clear the
--     stamp (readers then fall back to `updated_at`) or re-stamp it now(): later, the
--     loud side. It cannot touch a call now, whose level needs the frozen `tier`.
--   · The level is a closed CASE over today's tier values (079's CHECK). A migration
--     that widens the tier CHECK must update this function and the guard's pinned body
--     in the same file, or the new value ranks 0 and its stamp clears (loud fallback).
--   · A row deleted and re-created stamps afresh (094's note; no app path deletes).
--
-- NO DEFAULT, NO BACKFILL, deliberately: an old call's said-at is unknowable, and
-- an UPDATE here would fire 075's trigger and move every row's `updated_at`.
--
-- ------------------------------------------------------------
-- R-5, THE PRIVACY LINE
-- ------------------------------------------------------------
--   Cascade:     inherits event_ai_analysis's (events and pets ON DELETE CASCADE).
--   RLS:         013's policy, unchanged; 074 revoked client INSERT. A client
--                UPDATE that moves the stamp is refused by the freeze (§2), which
--                fires before §3 ("stamps_frozen" sorts before "stamps_said_at"):
--                without it an owner could push "now" around by hand.
--   Trigger:     INVOKER, search_path pinned, EXECUTE revoked from clients; it
--                assigns NEW only, reads no other row, raises nothing (C-31).
--   Same-pet:    no new reference; 074's trigger is unchanged.
--   Realtime:    the table is in the publication (059); a timestamp carries no
--                words, paths or URLs.
--   Wipe list:   no local copy (the phone reads it with the row into component
--                state; generate-signal reads it server-side).
--   Model reads: none.
--   Export:      no export function exists yet (B-041); the column rides with
--                the row when one does.
--
-- Migration Safety Pre-flight:
--   Destructive:  n  (1 nullable column added while every value is NULL; 1
--                     function body replaced by a superset of 094's; 1 new
--                     function on 1 new trigger).
--   Rollback (one transaction; the freeze body and the trigger name the column):
--     BEGIN;
--     DROP TRIGGER trg_event_ai_analysis_stamps_said_at ON public.event_ai_analysis;
--     DROP FUNCTION public.stamp_call_said_at();
--     re-run 094's §2 CREATE OR REPLACE FUNCTION
--       public.freeze_event_ai_analysis_stamps() and its three REVOKEs verbatim;
--     ALTER TABLE public.event_ai_analysis DROP COLUMN call_said_at;
--     COMMIT;
--     The order is load-bearing: plpgsql records no dependency, so dropping the column
--     before restoring the freeze succeeds silently and then every client UPDATE (a
--     Hide, an edit) fails with "record new has no field call_said_at".
--     The code PR that reads the column (CUL-1754 PR 2) must be reverted or held
--     first: generate-signal and both analysis sections select it.
--   Backfill:     N/A, deliberately (see above).
--   Affected tables: event_ai_analysis (ADD COLUMN; the freeze trigger's function;
--                 one new trigger). Sanity checks before applying:
--                   SELECT column_name FROM information_schema.columns
--                    WHERE table_name = 'event_ai_analysis' AND column_name = 'call_said_at';          -- 0 rows
--                   SELECT count(*) FROM pg_proc WHERE proname = 'stamp_may_wait_decided_at';         -- 1 (094 applied)
--                   SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_event_ai_analysis_stamps_frozen'; -- 1
-- ============================================================


-- ============================================================
-- §1 The column
-- ============================================================

ALTER TABLE public.event_ai_analysis
  ADD COLUMN call_said_at TIMESTAMPTZ;

COMMENT ON COLUMN public.event_ai_analysis.call_said_at IS
  'CUL-1754: when this read''s call was last said. Set by trg_event_ai_analysis_stamps_said_at when the call level (2 tier call_now; 1 tier call_today or recommendation worth_a_call; 0 otherwise) changes into a call, or stays a call while visual_flags or contextual_flags change; cleared at level 0; kept on every other write (a Hide, an owner edit, a failed re-read, a may_wait write). A dated call now (PR-30c) counts its first 24 hours from the later of the event and this. NULL on a row not stamped since 099: readers fall back to updated_at. No backfill. Clients may not move it (freeze_event_ai_analysis_stamps).';


-- ============================================================
-- §2 The stamp is the server's: a client UPDATE may not move it
-- ============================================================
-- 094's body, verbatim, plus one line. Same posture and reasons as
-- 075/079/085/086/087/088/094: INVOKER (it tests current_user; DEFINER would
-- freeze nothing), search_path pinned, EXECUTE closed to clients. An edit that
-- leaves the stamp as it was passes, so a row stays editable, dismissable and
-- lowerable (C-38). The message names no value (C-31).

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
       OR NEW.call_said_at                  IS DISTINCT FROM OLD.call_said_at
       OR (NEW.may_wait IS DISTINCT FROM OLD.may_wait
           AND NOT (OLD.may_wait IS TRUE AND NEW.may_wait IS NULL))) THEN
    RAISE EXCEPTION 'event_ai_analysis: a read''s stamps are written by the server only'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.freeze_event_ai_analysis_stamps() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.freeze_event_ai_analysis_stamps() FROM anon;
REVOKE ALL ON FUNCTION public.freeze_event_ai_analysis_stamps() FROM authenticated;

-- trg_event_ai_analysis_stamps_frozen (075) already calls this function; it is
-- not re-created.


-- ============================================================
-- §3 The stamp: set when the call is said, kept otherwise
-- ============================================================
-- Every role, the server's included. Fires after the freeze (above; "frozen"
-- sorts before "said_at") and before `updated_at` (075; "stamps_said_at" sorts
-- before "updated_at"), so a client's attempt is refused loudly first and the
-- stamp is never later than the write's own `updated_at`.

CREATE OR REPLACE FUNCTION public.stamp_call_said_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  new_level integer;
  old_level integer;
BEGIN
  new_level := CASE
    WHEN NEW.tier = 'call_now' THEN 2
    WHEN NEW.tier = 'call_today' OR NEW.recommendation::text = 'worth_a_call' THEN 1
    ELSE 0
  END;

  IF TG_OP = 'INSERT' THEN
    NEW.call_said_at := CASE WHEN new_level > 0 THEN now() END;
    RETURN NEW;
  END IF;

  old_level := CASE
    WHEN OLD.tier = 'call_now' THEN 2
    WHEN OLD.tier = 'call_today' OR OLD.recommendation::text = 'worth_a_call' THEN 1
    ELSE 0
  END;

  IF new_level = 0 THEN
    NEW.call_said_at := NULL;
  ELSIF new_level <> old_level
     OR NEW.visual_flags IS DISTINCT FROM OLD.visual_flags
     OR NEW.contextual_flags IS DISTINCT FROM OLD.contextual_flags THEN
    NEW.call_said_at := now();
  ELSE
    NEW.call_said_at := OLD.call_said_at;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.stamp_call_said_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stamp_call_said_at() FROM anon;
REVOKE ALL ON FUNCTION public.stamp_call_said_at() FROM authenticated;

CREATE TRIGGER trg_event_ai_analysis_stamps_said_at
  BEFORE INSERT OR UPDATE ON public.event_ai_analysis
  FOR EACH ROW EXECUTE FUNCTION public.stamp_call_said_at();
