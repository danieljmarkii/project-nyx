-- ============================================================
-- Migration 086: the intake correction counts the window the words were about
--   (Engines v3 PR-13b, CUL-1406; PM ruling (a), 2026-10-07)
-- See: CUL-1406 (the adversarial pass on 085 and the decision brief it raised);
--      085_vomit_intake_correction.sql (what this amends);
--      docs/culprit-incident-screen-mockups.html §3b (round 4 frames).
-- ============================================================
--
-- WHAT 085 GOT WRONG (adversarial pass, BREAKS, measured on the live record):
--   B1 · it attached a correction to every stored intake sentence, and the
--        words it sits beside ("went further than the record") are false where
--        every logged meal was RATED below Most: on 7/27, six of seven meals were
--        refused / picked / some, so "hasn't eaten a full meal recently" was true.
--   B2 · it counted the 24 h before the VOMIT. The sentence was computed over the
--        24 h before the READ ran (analyze-vomit's shipped read-time window), so
--        a late read was corrected from a different set of meals: 9/22 (read 6.6 h
--        late) held 6 meals before the read and 5 before the vomit, and a full
--        meal before the vomit could be cited over refusals after it.
--   Nothing showed either: no installed build reads 085's columns.
--
-- THE RULE NOW (ruling (a)):
--   · The window is the one the words were about: [read − 24 h, read], where
--     `read` is `intake_read_at`, the moment the server last wrote those words.
--     A held re-read never writes read_text (resolveReanalysisWrite's hold), so
--     the stamp moves only when the sentence was really recomputed. Backfill:
--     `created_at`, the best stamp stored rows have (a later full re-read that
--     rewrote the same sentence is the case it misses; it then counts an earlier
--     24 h, which the words were also once about).
--   · A correction is written only where that window shows the sentence rested
--     on something other than rated intake, or where a Most / All meal has since
--     landed in it:
--       most_or_all > 0         a Most / All meal was added after the read
--       meals = 0               nothing was logged, so the log could not say
--       unrated > 0             some meals were never rated, so it could not say
--       otherwise (every meal rated below Most)   NO correction: the words stand
--   · The words live in lib/readCorrection.ts (one module, the screen and Ask).
--
-- NEW COLUMNS: `intake_correction_unrated` (the fact the words now turn on) and
-- `intake_read_at` (the window's anchor). Both server-written, both frozen.
-- The count function changes signature, so 085's is dropped and replaced.
--
-- WHAT KEEPS IT CURRENT: unchanged in shape. A server write of the old sentence
-- stamps `intake_read_at` and recounts; any other sentence clears every fact.
-- A meal added, moved, retyped, soft-deleted, moved between pets or re-rated
-- recounts the reads whose window it falls in, now [meal, meal + 24 h] against
-- `intake_read_at`. A vomit moving no longer matters (the window is the read's),
-- so the events trigger fires on meals only.
--
-- ------------------------------------------------------------
-- R-5, THE PRIVACY LINE (unchanged from 085)
-- ------------------------------------------------------------
--   Every fact is an integer or an instant; the new two join 085's freeze. The
--   one DEFINER function is still the AFTER refresh, scoped to the pet the firing
--   row names, re-checked against the meal's event on `meals`, raising nothing
--   (C-31). The count joins a meal under its own pet only (rls-privacy-reviewer
--   on 085, attack 1). EXECUTE stays revoked from anon / authenticated; the
--   count keeps service_role's explicit grant (the read writer).
--
-- Migration Safety Pre-flight:
--   Destructive:  n  (2 nullable columns added while empty; the CHECK replaced by
--                     a superset; 1 function dropped and re-created with a new
--                     signature; 4 function bodies replaced; 1 trigger re-created
--                     with a narrower WHEN; a re-backfill that writes only the
--                     correction columns, on rows holding the old sentence).
--   Rollback (one transaction): restore 085 by re-running its §1b–§4 function
--     bodies and its events trigger verbatim, then
--       DROP FUNCTION public.vomit_intake_record(uuid, timestamptz);   -- 086's
--       (085's re-create of the same name and signature replaces it)
--       ALTER TABLE public.event_ai_analysis
--         DROP CONSTRAINT event_ai_analysis_intake_correction_shape,
--         DROP COLUMN intake_correction_unrated,
--         DROP COLUMN intake_read_at,
--         ADD CONSTRAINT event_ai_analysis_intake_correction_shape CHECK (<085's>);
--       re-run 085's §5 backfill.
--     Safe only while no client selects the two new columns (PR-13b's code half).
--   Backfill:     §6: every stored read holding the old sentence is re-stamped
--                 (`intake_read_at := created_at`) and recounted.
--   Affected tables: event_ai_analysis (2 columns, the CHECK, the backfill);
--                 events and meals (AFTER triggers only).
--   Sanity checks before applying:
--     SELECT count(*) FROM information_schema.columns
--      WHERE table_name = 'event_ai_analysis' AND column_name LIKE 'intake_correction%';  -- 3 (085)
--     SELECT count(*) FROM public.event_ai_analysis
--      WHERE incident_type = 'vomit'
--        AND read_text LIKE '%hasn''t eaten a full meal recently.%';                      -- the rows
-- ============================================================


-- ============================================================
-- §1 Two columns, and the facts' shape
-- ============================================================
ALTER TABLE public.event_ai_analysis
  ADD COLUMN intake_correction_unrated INTEGER,
  ADD COLUMN intake_read_at            TIMESTAMPTZ,
  DROP CONSTRAINT event_ai_analysis_intake_correction_shape,
  ADD CONSTRAINT event_ai_analysis_intake_correction_shape CHECK (
    (intake_correction_at IS NULL
      AND intake_correction_meals IS NULL
      AND intake_correction_most_or_all IS NULL
      AND intake_correction_unrated IS NULL)
    OR
    (intake_correction_at IS NOT NULL
      AND intake_correction_meals >= 0
      AND intake_correction_most_or_all >= 0
      AND intake_correction_unrated >= 0
      AND intake_correction_most_or_all + intake_correction_unrated <= intake_correction_meals)
  );

COMMENT ON COLUMN public.event_ai_analysis.intake_read_at IS
  'CUL-1406 (086): the moment the server last wrote the pre-EN-0 intake sentence into read_text, the anchor of the 24 h window that sentence was about. NULL on every other read. Server-written only.';
COMMENT ON COLUMN public.event_ai_analysis.intake_correction_unrated IS
  'CUL-1406 (086): of intake_correction_meals, those with no intake_rating, as of intake_correction_at.';
COMMENT ON COLUMN public.event_ai_analysis.intake_correction_meals IS
  'CUL-1406: non-deleted meal events of this pet in [intake_read_at - 24 h, intake_read_at], rated or not, as of intake_correction_at (086; 085 counted before the vomit).';
COMMENT ON COLUMN public.event_ai_analysis.intake_correction_at IS
  'CUL-1406: when the meal log first held the counts beside it. Set only where the read-time window shows the pre-EN-0 intake sentence rested on missing ratings or an empty log, or where a Most / All meal has since landed in it (086); NULL otherwise, including where every meal was rated below Most. The words are lib/readCorrection.ts''s; recommendation and tier are never touched. Server-written only.';


-- ============================================================
-- §2 The freeze: the two new columns are the server's too
-- ============================================================
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
       OR NEW.intake_read_at                IS DISTINCT FROM OLD.intake_read_at) THEN
    RAISE EXCEPTION 'event_ai_analysis: a read''s stamps are written by the server only'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.freeze_event_ai_analysis_stamps() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.freeze_event_ai_analysis_stamps() FROM anon;
REVOKE ALL ON FUNCTION public.freeze_event_ai_analysis_stamps() FROM authenticated;


-- ============================================================
-- §3 The count, over the read's window, with the unrated split out
-- ============================================================
-- Same posture as 085's (INVOKER, pinned, revoked, service_role granted). The
-- OUT columns change, so the old function is dropped first; nothing else calls
-- it (§4 and §5 are replaced in this file).
DROP FUNCTION IF EXISTS public.vomit_intake_record(uuid, timestamptz);

CREATE FUNCTION public.vomit_intake_record(
  p_pet_id  uuid,
  p_read_at timestamptz,
  OUT meals_logged integer,
  OUT unrated      integer,
  OUT most_or_all  integer
)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT count(*)::integer,
         (count(*) FILTER (WHERE m.intake_rating IS NULL))::integer,
         (count(*) FILTER (WHERE m.intake_rating IN ('most', 'all')))::integer
    FROM public.events e
    -- A meal counts under its own pet only (rls-privacy-reviewer on 085, attack 1).
    LEFT JOIN public.meals m ON m.event_id = e.id AND m.pet_id = e.pet_id
   WHERE e.pet_id = p_pet_id
     AND e.event_type = 'meal'
     AND e.deleted_at IS NULL
     AND e.occurred_at >= p_read_at - interval '24 hours'
     AND e.occurred_at <= p_read_at;
$$;

REVOKE ALL ON FUNCTION public.vomit_intake_record(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vomit_intake_record(uuid, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.vomit_intake_record(uuid, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.vomit_intake_record(uuid, timestamptz) TO service_role;

-- Whether the facts earn a correction (ruling (a)). One predicate, used by the
-- write trigger and the recount alike, so the two can never disagree.
CREATE OR REPLACE FUNCTION public.vomit_intake_correction_due(
  p_meals integer, p_unrated integer, p_most_or_all integer
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT p_most_or_all > 0 OR p_meals = 0 OR p_unrated > 0;
$$;

REVOKE ALL ON FUNCTION public.vomit_intake_correction_due(integer, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vomit_intake_correction_due(integer, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.vomit_intake_correction_due(integer, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.vomit_intake_correction_due(integer, integer, integer) TO service_role;


-- ============================================================
-- §4 Writing the read stamps its window and sets (or clears) the facts
-- ============================================================
-- As 085 §3, with two changes: a SERVER write of the old sentence stamps
-- `intake_read_at := now()` (that write IS the read the words describe), and the
-- facts are kept only when the correction is due. A client never moves the stamp
-- (the freeze would refuse it, and a client writing read_text is CUL-1651's).
-- Never blocks the write it rides on (C-38): any error leaves the facts as they
-- were, with a WARNING naming no value (C-31).
CREATE OR REPLACE FUNCTION public.set_vomit_intake_correction()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_rec record;
BEGIN
  IF NEW.incident_type = 'vomit'
     AND NEW.read_text LIKE '%hasn''t eaten a full meal recently.%' THEN
   BEGIN
    IF current_user NOT IN ('anon', 'authenticated') THEN
      NEW.intake_read_at := now();
    END IF;
    IF NEW.intake_read_at IS NULL THEN
      RETURN NEW;  -- no anchor (a client wrote the words): leave the facts as they were
    END IF;
    SELECT * INTO v_rec FROM public.vomit_intake_record(NEW.pet_id, NEW.intake_read_at);
    IF NOT public.vomit_intake_correction_due(v_rec.meals_logged, v_rec.unrated, v_rec.most_or_all) THEN
      NEW.intake_correction_at          := NULL;
      NEW.intake_correction_meals       := NULL;
      NEW.intake_correction_unrated     := NULL;
      NEW.intake_correction_most_or_all := NULL;
    ELSIF NEW.intake_correction_meals       IS DISTINCT FROM v_rec.meals_logged
       OR NEW.intake_correction_unrated     IS DISTINCT FROM v_rec.unrated
       OR NEW.intake_correction_most_or_all IS DISTINCT FROM v_rec.most_or_all THEN
      NEW.intake_correction_at          := now();
      NEW.intake_correction_meals       := v_rec.meals_logged;
      NEW.intake_correction_unrated     := v_rec.unrated;
      NEW.intake_correction_most_or_all := v_rec.most_or_all;
    END IF;
   EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'event_ai_analysis: intake correction not recounted on this write';
    RETURN NEW;
   END;
  ELSE
    NEW.intake_read_at                := NULL;
    NEW.intake_correction_at          := NULL;
    NEW.intake_correction_meals       := NULL;
    NEW.intake_correction_unrated     := NULL;
    NEW.intake_correction_most_or_all := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_vomit_intake_correction() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_vomit_intake_correction() FROM anon;
REVOKE ALL ON FUNCTION public.set_vomit_intake_correction() FROM authenticated;
-- trg_event_ai_analysis_intake_correction (085) already calls it.


-- ============================================================
-- §5 The record moving recounts the reads whose window it touches
-- ============================================================
-- p_from / p_to now bound the READ's anchor: a meal at t falls in the window of
-- every read stamped in [t, t + 24 h]. A row whose correction is no longer due
-- is cleared; one that newly is gets dated now. Names none of read_text /
-- recommendation / tier, so §4 does not fire and the verdict cannot move.
CREATE OR REPLACE FUNCTION public.apply_vomit_intake_corrections(
  p_pet_id uuid,
  p_from   timestamptz,
  p_to     timestamptz
)
RETURNS void
LANGUAGE sql
VOLATILE
SET search_path = pg_catalog, pg_temp
AS $$
  WITH counted AS (
    SELECT a.id,
           r.meals_logged, r.unrated, r.most_or_all,
           public.vomit_intake_correction_due(r.meals_logged, r.unrated, r.most_or_all) AS due
      FROM public.event_ai_analysis a
      CROSS JOIN LATERAL public.vomit_intake_record(a.pet_id, a.intake_read_at) r
     WHERE a.pet_id = p_pet_id
       AND a.incident_type = 'vomit'
       AND a.intake_read_at IS NOT NULL
       AND a.intake_read_at >= p_from
       AND a.intake_read_at <= p_to
       AND a.read_text LIKE '%hasn''t eaten a full meal recently.%'
  )
  UPDATE public.event_ai_analysis a
     SET intake_correction_at          = CASE WHEN c.due THEN now() END,
         intake_correction_meals       = CASE WHEN c.due THEN c.meals_logged END,
         intake_correction_unrated     = CASE WHEN c.due THEN c.unrated END,
         intake_correction_most_or_all = CASE WHEN c.due THEN c.most_or_all END
    FROM counted c
   WHERE a.id = c.id
     AND ((CASE WHEN c.due THEN c.meals_logged END) IS DISTINCT FROM a.intake_correction_meals
       OR (CASE WHEN c.due THEN c.unrated END)      IS DISTINCT FROM a.intake_correction_unrated
       OR (CASE WHEN c.due THEN c.most_or_all END)  IS DISTINCT FROM a.intake_correction_most_or_all);
$$;

REVOKE ALL ON FUNCTION public.apply_vomit_intake_corrections(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_vomit_intake_corrections(uuid, timestamptz, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.apply_vomit_intake_corrections(uuid, timestamptz, timestamptz) FROM authenticated;

-- The refresh: meals only now. DEFINER for the same reason as 085 (a client's own
-- meal write fires it and the freeze refuses the recount as authenticated).
CREATE OR REPLACE FUNCTION public.refresh_vomit_intake_corrections()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_meal_at timestamptz;
BEGIN
  IF TG_TABLE_NAME = 'meals' THEN
    SELECT e.occurred_at INTO v_meal_at
      FROM public.events e
     WHERE e.id = NEW.event_id
       AND e.pet_id = NEW.pet_id
       AND e.event_type = 'meal';
    IF v_meal_at IS NOT NULL THEN
      PERFORM public.apply_vomit_intake_corrections(NEW.pet_id, v_meal_at, v_meal_at + interval '24 hours');
    END IF;
    RETURN NULL;
  END IF;

  -- events: the meal's new place, then its old place under its old pet.
  IF NEW.event_type = 'meal' THEN
    PERFORM public.apply_vomit_intake_corrections(NEW.pet_id, NEW.occurred_at, NEW.occurred_at + interval '24 hours');
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.event_type = 'meal'
     AND (OLD.occurred_at IS DISTINCT FROM NEW.occurred_at
       OR NEW.event_type IS DISTINCT FROM 'meal'
       OR OLD.pet_id IS DISTINCT FROM NEW.pet_id
       OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at) THEN
    PERFORM public.apply_vomit_intake_corrections(OLD.pet_id, OLD.occurred_at, OLD.occurred_at + interval '24 hours');
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_vomit_intake_corrections() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_vomit_intake_corrections() FROM anon;
REVOKE ALL ON FUNCTION public.refresh_vomit_intake_corrections() FROM authenticated;

-- A vomit moving no longer changes any window: the events triggers fire on meals.
DROP TRIGGER IF EXISTS trg_events_vomit_intake_correction_ins ON public.events;
CREATE TRIGGER trg_events_vomit_intake_correction_ins
  AFTER INSERT ON public.events
  FOR EACH ROW
  WHEN (NEW.event_type = 'meal')
  EXECUTE FUNCTION public.refresh_vomit_intake_corrections();

DROP TRIGGER IF EXISTS trg_events_vomit_intake_correction_upd ON public.events;
CREATE TRIGGER trg_events_vomit_intake_correction_upd
  AFTER UPDATE OF occurred_at, deleted_at, event_type, pet_id ON public.events
  FOR EACH ROW
  WHEN ((NEW.event_type = 'meal' OR OLD.event_type = 'meal')
        AND (OLD.occurred_at IS DISTINCT FROM NEW.occurred_at
          OR OLD.deleted_at  IS DISTINCT FROM NEW.deleted_at
          OR OLD.event_type  IS DISTINCT FROM NEW.event_type
          OR OLD.pet_id      IS DISTINCT FROM NEW.pet_id))
  EXECUTE FUNCTION public.refresh_vomit_intake_corrections();


-- ============================================================
-- §6 Re-backfill: stamp the window, then recount
-- ============================================================
-- Runs as the migration's role (the freeze exempts it; the stamp names no
-- read_text, so §4 does not fire). Clears 085's facts first so a row whose
-- correction is no longer due ends NULL, never with 085's counts.
UPDATE public.event_ai_analysis
   SET intake_read_at                = created_at,
       intake_correction_at          = NULL,
       intake_correction_meals       = NULL,
       intake_correction_unrated     = NULL,
       intake_correction_most_or_all = NULL
 WHERE incident_type = 'vomit'
   AND read_text LIKE '%hasn''t eaten a full meal recently.%';

DO $$
DECLARE
  v_pet uuid;
BEGIN
  FOR v_pet IN
    SELECT DISTINCT a.pet_id
      FROM public.event_ai_analysis a
     WHERE a.incident_type = 'vomit'
       AND a.intake_read_at IS NOT NULL
  LOOP
    PERFORM public.apply_vomit_intake_corrections(v_pet, '-infinity'::timestamptz, 'infinity'::timestamptz);
  END LOOP;
END;
$$;
