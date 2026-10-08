-- ============================================================
-- Migration 088: an owner edit of a read takes back its leave to wait;
--   ai_raw_payload and visual_flags join the server-only freeze
--   (Engines v3 PR-27g)
-- See: CUL-1668 (the issue, the PM's ruling "yes" 2026-10-08, the plan);
--      CUL-1628 (PR-27e, the server predicate, and the adversarial and
--      rls-privacy-reviewer passes that found both gaps);
--      087_incident_may_wait.sql (the column and the freeze this extends).
-- ============================================================
--
-- TWO GAPS, ONE MIGRATION
-- ------------------------------------------------------------
-- 1. The owner edit. `may_wait` TRUE is leave for a call_today read to say
--    "first thing tomorrow". The server decides it from the read's structured
--    columns, its flags and payload, and its neighbours' (incidentMayWait.ts).
--    An owner edit (lib/analysis.ts: saveVomitFieldEdits / saveStoolFieldEdits)
--    is a client UPDATE with no server call after it, so the server never sees
--    the record move: blood changed to "fresh red" left the TRUE on the row, and
--    on every neighbour whose TRUE was earned partly on this row looking clean.
--    087's freeze refused any client change to `may_wait`, so the edit could not
--    lower it either. Here the database lowers it, in the same statement.
--
-- 2. Owner self-forgery (CUL-1628 rls-privacy-reviewer; PM ruled A). 013's FOR
--    ALL owner policy let a client hand-PATCH `ai_raw_payload` (the model's own
--    words, `read_photo_set_key`, `recommendation`) and `visual_flags` on their
--    own row, then earn a TRUE through a floor-only write. 087's R-5 note said the
--    freeze stopped an owner earning the calmer line on their own row; with these
--    two columns open it did not. No app code writes either column, so freezing
--    them breaks nothing legitimate.
--
-- ------------------------------------------------------------
-- THE DIRECTION IS STILL THE POINT
-- ------------------------------------------------------------
-- Only TRUE grants leave; FALSE and NULL keep the louder line (087). So the one
-- client move this opens is TRUE -> NULL, which can only ever restore the louder
-- line. FALSE stays sticky (PR-27e: it is the durable trace of a removed photo's
-- finding, and it refuses for every neighbour), and nothing a client sends can
-- move NULL or FALSE to TRUE, or TRUE to FALSE.
--
-- WHY INVOKER FOR THE NEIGHBOURS, NOT DEFINER: the neighbour sweep runs as the
-- owner, so 013's RLS bounds it to rows they could already UPDATE, and the
-- freeze judges it like any client write. A DEFINER sweep would need the freeze
-- left shut and an id-scoping argument in place of RLS; opening TRUE -> NULL is
-- the smaller grant (any client could already make its own read louder by
-- dismissing or deleting it).
--
-- WHAT COUNTS AS AN EDIT: a client UPDATE that moves `edited_at` or any column
-- the server's predicate reads that is not frozen: the blood, foreign-material
-- and colour columns (incidentMayWait.ts `columnBlockers`), and the verdict
-- columns a neighbour is judged on (`neighbourRefuses` / `photoReadSettled`:
-- `recommendation`, `contextual_flags`, `status`, `error`). No app path writes
-- the four verdict columns, but 013 lets a client, and a hand-PATCH that strips
-- a neighbour's `concurrent_lethargy` must not leave the TRUE it would have
-- refused (CUL-1668 adversarial pass). The guard pins the rule itself: every
-- column the predicate reads is frozen or in this set. The app's edit always
-- stamps `edited_at`, so every app edit counts, whichever field it changed. A dismiss
-- (`dismissed_at`) is not an edit and keeps the TRUE. Server writes
-- (service_role) are not touched: the server writes `may_wait` beside every
-- `tier` and re-checks neighbours itself (revalidateMayWait).
--
-- THE NEIGHBOURHOOD: 72 h either side of the edited event's `occurred_at`, the
-- server's own reach (MAY_WAIT_NEIGHBOUR_HOURS = FLOOR_READ_HOURS =
-- FLOOR_PERSISTENCE_DAYS * 24, lib/incidentFloor.ts). Same value, same question
-- ("which reads could this row have stood behind"), so it is mirrored and
-- guards/incidentReadFreeze.test.ts pins it to the TS constant (C-34). The
-- server reads a neighbour's analysis only inside that reach; its 2x read is
-- events-only, for the floor. Soft-deleted events are not excluded (lowering
-- more is the safe side). If the edited event cannot be read, every TRUE on the
-- pet is lowered: fail closed.
--
-- CUL-882: an event moved between two of one owner's pets leaves its analysis
-- row on the old pet (074 freezes `pet_id`). "Same pet" here is either side of
-- either row: the neighbour's analysis `pet_id` or its event's current
-- `pet_id`, against the edited row's `pet_id` or its event's current `pet_id`.
-- So an edit reaches the reads on both timelines whichever of the two rows was
-- moved (the adversarial pass broke the first draft, which matched only the
-- neighbour's analysis `pet_id`). An owner edit is the only path that lowers a
-- moved row's TRUE: the server's re-check reads analysis by the event's pet. The server-side half (revalidateMayWait reads a
-- neighbour's analysis by the event's pet, so it never sees such a row) is not
-- changed here.
--
-- ------------------------------------------------------------
-- R-5, THE PRIVACY LINE
-- ------------------------------------------------------------
--   Cascade:     unchanged (event_ai_analysis's own).
--   RLS:         013's policy, unchanged. The sweep is INVOKER, so it can only
--                reach rows the editing owner could UPDATE themselves.
--   Freeze:      two more columns closed; one transition (TRUE -> NULL on
--                `may_wait`) opened, lower-only.
--   Same-pet:    074's trigger is unchanged; the sweep moves only `may_wait`.
--   Realtime:    lowered neighbours publish as ordinary row updates (059); a
--                boolean carries no words, paths or URLs.
--   Errors:      the freeze's one message names no value (C-31); the new
--                function raises nothing.
--   Wipe list:   no local copy yet (PR-27f's).
--   Model reads: none.
--
-- Migration Safety Pre-flight:
--   Destructive:  n  (one function body replaced by a superset of 087's, one
--                     transition opened lower-only; one new function and two
--                     triggers; no column, row or data changed on apply).
--   Rollback (one transaction):
--     BEGIN;
--     DROP TRIGGER trg_event_ai_analysis_may_wait_edit_row ON public.event_ai_analysis;
--     DROP TRIGGER trg_event_ai_analysis_may_wait_edit_neighbours ON public.event_ai_analysis;
--     DROP FUNCTION public.take_back_may_wait_on_owner_edit();
--     re-run 087's §2 CREATE OR REPLACE FUNCTION
--       public.freeze_event_ai_analysis_stamps() and its three REVOKEs verbatim;
--     COMMIT;
--     Order matters: with the triggers live and 087's body restored, an owner
--     edit of a TRUE row would be refused by the freeze (the BEFORE trigger's
--     TRUE -> NULL), so drop the triggers first. Any TRUE already lowered stays
--     NULL after rollback, which is the louder line; nothing to restore.
--   Backfill:     N/A. Rows edited before this applies keep whatever `may_wait`
--                 they hold; PR-27f gates its render on `edited_at IS NULL` for
--                 the row it shows, and no TRUE exists before PR-27e's writes.
--   Affected tables: event_ai_analysis (the freeze trigger's function; one new
--                 function on two new triggers). Sanity checks before applying:
--                   SELECT count(*) FROM pg_proc WHERE proname = 'take_back_may_wait_on_owner_edit';  -- 0
--                   SELECT column_name FROM information_schema.columns
--                    WHERE table_name = 'event_ai_analysis' AND column_name = 'may_wait';              -- 1 row (087 applied)
-- ============================================================


-- ============================================================
-- §1 The freeze: 087's body plus two columns, and TRUE -> NULL open on may_wait
-- ============================================================
-- Same posture and reasons as 075/079/085/086/087: INVOKER (it tests
-- current_user; DEFINER would freeze nothing), search_path pinned, EXECUTE
-- closed to clients. An edit that leaves a frozen column as it was passes, so a
-- row stays editable and dismissable (C-38). The message names no value (C-31).

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
-- §2 An owner edit takes back the leave to wait: this row, and its neighbours
-- ============================================================
-- One function, two triggers, so the edit predicate is written once. BEFORE
-- lowers the edited row's own TRUE in the same write; AFTER lowers the
-- neighbours' (it needs the committed row's event, and a BEFORE trigger must not
-- write the table it guards mid-statement). Order against the freeze does not
-- matter: the freeze accepts TRUE -> NULL whichever runs first.
--
-- No recursion: the sweep's UPDATE moves only `may_wait`, so for each lowered
-- neighbour the edit predicate is false and both arms return at once.

CREATE OR REPLACE FUNCTION public.take_back_may_wait_on_owner_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_anchor    timestamptz;
  v_event_pet uuid;
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF NOT (NEW.edited_at                IS DISTINCT FROM OLD.edited_at
       OR NEW.colour                   IS DISTINCT FROM OLD.colour
       OR NEW.stool_colour             IS DISTINCT FROM OLD.stool_colour
       OR NEW.blood_present            IS DISTINCT FROM OLD.blood_present
       OR NEW.stool_blood_present      IS DISTINCT FROM OLD.stool_blood_present
       OR NEW.stool_blood_type         IS DISTINCT FROM OLD.stool_blood_type
       OR NEW.foreign_material_present IS DISTINCT FROM OLD.foreign_material_present
       OR NEW.recommendation           IS DISTINCT FROM OLD.recommendation
       OR NEW.contextual_flags         IS DISTINCT FROM OLD.contextual_flags
       OR NEW.status                   IS DISTINCT FROM OLD.status
       OR NEW.error                    IS DISTINCT FROM OLD.error) THEN
    RETURN NEW;
  END IF;

  IF TG_WHEN = 'BEFORE' THEN
    IF NEW.may_wait IS TRUE THEN
      NEW.may_wait := NULL;
    END IF;
    RETURN NEW;
  END IF;

  SELECT e.occurred_at, e.pet_id
    INTO v_anchor, v_event_pet
    FROM public.events e
   WHERE e.id = NEW.event_id;

  UPDATE public.event_ai_analysis a
     SET may_wait = NULL
   WHERE a.may_wait IS TRUE
     AND a.event_id <> NEW.event_id
     AND (a.pet_id IN (NEW.pet_id, v_event_pet)
          OR EXISTS (
            SELECT 1
              FROM public.events p
             WHERE p.id = a.event_id
               AND p.pet_id IN (NEW.pet_id, v_event_pet)))
     AND (v_anchor IS NULL
          OR EXISTS (
            SELECT 1
              FROM public.events n
             WHERE n.id = a.event_id
               AND n.occurred_at >= v_anchor - interval '72 hours'
               AND n.occurred_at <= v_anchor + interval '72 hours'));

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.take_back_may_wait_on_owner_edit() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.take_back_may_wait_on_owner_edit() FROM anon;
REVOKE ALL ON FUNCTION public.take_back_may_wait_on_owner_edit() FROM authenticated;

CREATE TRIGGER trg_event_ai_analysis_may_wait_edit_row
  BEFORE UPDATE ON public.event_ai_analysis
  FOR EACH ROW EXECUTE FUNCTION public.take_back_may_wait_on_owner_edit();

CREATE TRIGGER trg_event_ai_analysis_may_wait_edit_neighbours
  AFTER UPDATE ON public.event_ai_analysis
  FOR EACH ROW EXECUTE FUNCTION public.take_back_may_wait_on_owner_edit();

COMMENT ON FUNCTION public.take_back_may_wait_on_owner_edit() IS
  'CUL-1668 (088): a client UPDATE that moves edited_at or any unfrozen column the may_wait predicate reads (blood / foreign material / colour; recommendation, contextual_flags, status, error) lowers may_wait TRUE -> NULL on the row (BEFORE) and on every TRUE of the same pet (either row''s analysis or event pet) within 72 h either side of its event (AFTER; FLOOR_READ_HOURS, mirrored). INVOKER, so RLS bounds the sweep to the owner''s rows; service_role writes are untouched. Raises nothing.';
