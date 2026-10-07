-- ============================================================
-- Migration 085: a dated correction beside a stored vomit read (Engines v3 PR-13b)
--   EN-0 part 2 (CUL-1406): the facts a correction states, server-written,
--   kept current by the record.
-- See: CUL-1406 (plan + PM go 2026-10-07: C-A, refresh option (a));
--      docs/culprit-incident-screen-mockups.html §3b (round 3, R-5);
--      docs/engines-v3-critique-2026-09.md GAP-1, R-3.
-- ============================================================
--
-- THE SENTENCE. Before EN-0 (PR-13a, #979) the feline intake escalation read
--   "<pet> has been vomiting and hasn't eaten a full meal recently. In cats
--    that combination is worth a call to your vet sooner rather than later."
-- It concludes from the meal log's silence, and it was false wherever meals
-- were logged but not marked Most or All (Nyx's 9/4 read had four, 9/22 six).
-- It is present tense, so a meal back-filled after the read makes it falser
-- still, and CUL-1201's hold keeps it beside the escalation. Flag-off accounts
-- still write it until EN-0 is on for everyone.
--
-- THE RULE (CUL-1406): the stored words are never rewritten, the verdict is
-- never touched (`recommendation` and `tier` are not read or written here), and
-- a dated correction sits beside the words. This file stores the correction's
-- FACTS only: when it was taken, how many meals the log held in the 24 hours
-- before the vomit, and how many of them were marked Most or All. The words are
-- built from those facts by one module (lib/readCorrection.ts) for the incident
-- screen and Ask alike, so the copy lives where Pattern 8 and nyx-voice test it,
-- and the columns are integers and an instant, never text, in a table that is
-- in the realtime publication (059).
--
-- Three typed columns rather than the jsonb the plan comment named: the same
-- facts, but the database enforces their types and their pairing with a plain
-- CHECK instead of a jsonb shape expression.
--
-- WHAT KEEPS IT CURRENT (PM ruling (a), 2026-10-07):
--   §3 a BEFORE trigger on the read sets the facts whenever `read_text` is
--      written: the old sentence gets them, any other sentence clears them.
--      So the analyze-vomit write path needs no code change, and a re-read that
--      replaces the old sentence takes its correction with it.
--   §4 AFTER triggers on events (a meal or vomit moving, appearing or being
--      soft-deleted) and on meals (a rating changing) recount the reads whose
--      window the change touches. A meal logged after the read is exactly the
--      case the old sentence could not survive.
--   The facts are rewritten only when a count changes, so `intake_correction_at`
--   is the moment the log first held what the correction says, and every
--   sentence built from it ("That day, the meal log held …") stays true.
--
-- THE COUNT, one definition (§2): every non-deleted meal event of the vomit's
-- pet with occurred_at in [vomit − 24 h, vomit], inclusive at both ends, rated
-- or not; `most_or_all` counts those whose meals.intake_rating is 'most' or
-- 'all'. The same window EN-0's anchored half reads (analyze-vomit/context.ts
-- `vomitAnchoredWindows`, a meal at the vomit's own instant counting as before
-- it). Instants compare as timestamptz, never as text (C-40).
--
-- ------------------------------------------------------------
-- R-5, THE PRIVACY LINE
-- ------------------------------------------------------------
--   Cascade:     the columns inherit event_ai_analysis's (events and pets ON
--                DELETE CASCADE).
--   RLS:         inherits 013's policy for reads. A client cannot write the
--                columns: 074 revoked INSERT, and §1b adds them to 075/079's
--                freeze, so a client UPDATE that moves one is refused.
--   DEFINER:     one function, §4's refresh. It must be: a client's own meal
--                write is what fires it, and the freeze refuses the update as
--                `authenticated`. Its scope is the pet named by the row that
--                fired it, which RLS already admitted (events) or which it
--                re-checks against the event (meals: event_id AND pet_id AND
--                event_type), so it never reaches another account's pet. It
--                RAISEs nothing (C-31), returns nothing, and EXECUTE is revoked
--                from every client role; a trigger fires without that check.
--   Model reads: Ask relays the correction's WORDS beside the stored words
--                (PR-13b's code half); no model reads these columns raw.
--   Export:      the owner's own pet data; in the export scope with the read.
--   Label:       unchanged (derived from health data already declared).
--
-- Migration Safety Pre-flight:
--   Destructive:  n  (3 nullable columns added while empty; 1 CHECK; 4 new
--                     functions; 5 new triggers; 1 function body replaced by a
--                     superset of 079's; a backfill that writes only the 3 new
--                     columns, on rows holding the old sentence).
--   Rollback (one transaction; 079's freeze body names nothing of 085's, so
--   restoring it first keeps every UPDATE on the table working):
--     BEGIN;
--     DROP TRIGGER IF EXISTS trg_meals_vomit_intake_correction_ins ON public.meals;
--     DROP TRIGGER IF EXISTS trg_meals_vomit_intake_correction_upd ON public.meals;
--     DROP TRIGGER IF EXISTS trg_events_vomit_intake_correction_ins ON public.events;
--     DROP TRIGGER IF EXISTS trg_events_vomit_intake_correction_upd ON public.events;
--     DROP TRIGGER IF EXISTS trg_event_ai_analysis_intake_correction ON public.event_ai_analysis;
--     DROP FUNCTION IF EXISTS public.refresh_vomit_intake_corrections();
--     DROP FUNCTION IF EXISTS public.set_vomit_intake_correction();
--     DROP FUNCTION IF EXISTS public.apply_vomit_intake_corrections(uuid, timestamptz, timestamptz);
--     DROP FUNCTION IF EXISTS public.vomit_intake_record(uuid, timestamptz);
--     re-run 079's §2 CREATE OR REPLACE FUNCTION
--       public.freeze_event_ai_analysis_stamps() verbatim;
--     ALTER TABLE public.event_ai_analysis
--       DROP CONSTRAINT event_ai_analysis_intake_correction_shape,
--       DROP COLUMN intake_correction_at,
--       DROP COLUMN intake_correction_meals,
--       DROP COLUMN intake_correction_most_or_all;
--     COMMIT;
--     Safe as written only while no client selects the columns. Once PR-13b's
--     code half ships (the incident sections' SELECT_COLS, Ask's READ_COLS),
--     revert or hold that first, then run this.
--   Backfill:     §5, in this file: every stored read holding the old sentence
--                 gets its facts from the record as of the apply.
--   Affected tables: event_ai_analysis (ADD COLUMN ×3, CHECK, a BEFORE trigger,
--                 the freeze function's body, the backfill); events and meals
--                 (AFTER triggers only; no column, no row change).
--                 Sanity checks before applying:
--                   SELECT column_name FROM information_schema.columns
--                    WHERE table_name = 'event_ai_analysis'
--                      AND column_name LIKE 'intake_correction%';             -- 0 rows
--                   SELECT to_regprocedure('public.freeze_event_ai_analysis_stamps()'); -- not NULL
--                   SELECT count(*) FROM public.event_ai_analysis
--                    WHERE incident_type = 'vomit'
--                      AND read_text LIKE '%hasn''t eaten a full meal recently.%';  -- the backfill's rows
--                   SELECT count(*) FROM public.meals m JOIN public.events e ON e.id = m.event_id
--                    WHERE m.pet_id <> e.pet_id;  -- expect 0; the count ignores such rows either way
--   Known, not recounted (stale until the pet's next recount, never cross-account):
--                 a meals row whose event_id or pet_id is edited, and a hard-deleted
--                 meals row (the app never hard-deletes; events soft-delete).
-- ============================================================


-- ============================================================
-- §1 The columns
-- ============================================================
ALTER TABLE public.event_ai_analysis
  ADD COLUMN intake_correction_at          TIMESTAMPTZ,
  ADD COLUMN intake_correction_meals       INTEGER,
  ADD COLUMN intake_correction_most_or_all INTEGER,
  ADD CONSTRAINT event_ai_analysis_intake_correction_shape CHECK (
    (intake_correction_at IS NULL
      AND intake_correction_meals IS NULL
      AND intake_correction_most_or_all IS NULL)
    OR
    (intake_correction_at IS NOT NULL
      AND intake_correction_meals >= 0
      AND intake_correction_most_or_all >= 0
      AND intake_correction_most_or_all <= intake_correction_meals)
  );

COMMENT ON COLUMN public.event_ai_analysis.intake_correction_at IS
  'CUL-1406 (EN-0 part 2): when the meal log first held the counts beside it. Set only on a vomit read whose stored read_text is the pre-EN-0 intake sentence ("hasn''t eaten a full meal recently"); NULL otherwise. The words are built from these facts by lib/readCorrection.ts and sit beside read_text, never replacing it; recommendation and tier are never touched. Server-written only (freeze_event_ai_analysis_stamps).';
COMMENT ON COLUMN public.event_ai_analysis.intake_correction_meals IS
  'CUL-1406: non-deleted meal events of this pet in [vomit - 24 h, vomit], rated or not, as of intake_correction_at.';
COMMENT ON COLUMN public.event_ai_analysis.intake_correction_most_or_all IS
  'CUL-1406: of intake_correction_meals, those whose meals.intake_rating is most or all, as of intake_correction_at.';


-- ============================================================
-- §1b The correction is the server's: a client UPDATE may not move it
-- ============================================================
-- 079's body, verbatim, plus three lines. Same posture and reasons: INVOKER (it
-- tests current_user), search_path pinned, EXECUTE closed to clients. An edit
-- that leaves the columns as they were passes, so a corrected row stays
-- editable and dismissable (C-38). The message names no value (C-31).

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
       OR NEW.intake_correction_most_or_all IS DISTINCT FROM OLD.intake_correction_most_or_all) THEN
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
-- §2 The count, defined once
-- ============================================================
-- INVOKER: every caller already holds the right to read the rows (the service
-- role on a read write, the owner inside §4's DEFINER refresh, postgres in the
-- backfill). Revoked so it is not an RPC; it would only ever count a caller's
-- own rows under RLS, but the family keeps one posture.

CREATE OR REPLACE FUNCTION public.vomit_intake_record(
  p_pet_id   uuid,
  p_vomit_at timestamptz,
  OUT meals_logged integer,
  OUT most_or_all  integer
)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT count(*)::integer,
         (count(*) FILTER (WHERE m.intake_rating IN ('most', 'all')))::integer
    FROM public.events e
    -- The meal's pet as well as its event: meals RLS checks only meals.pet_id and no
    -- guard pairs it with the event's pet, so another account's meals row can sit on this
    -- pet's meal event. Joined on the id alone, its rating would count here, in the
    -- reassuring direction (rls-privacy-reviewer on this file, attack 1).
    LEFT JOIN public.meals m ON m.event_id = e.id AND m.pet_id = e.pet_id
   WHERE e.pet_id = p_pet_id
     AND e.event_type = 'meal'
     AND e.deleted_at IS NULL
     AND e.occurred_at >= p_vomit_at - interval '24 hours'
     AND e.occurred_at <= p_vomit_at;
$$;

REVOKE ALL ON FUNCTION public.vomit_intake_record(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vomit_intake_record(uuid, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.vomit_intake_record(uuid, timestamptz) FROM authenticated;
-- The service role writes every read, and §3 counts as that writer. Stated
-- explicitly rather than left to the platform's default privileges: without it,
-- every analyze-vomit write of the old sentence would fail (measured against a
-- scratch database while building this file).
GRANT EXECUTE ON FUNCTION public.vomit_intake_record(uuid, timestamptz) TO service_role;


-- ============================================================
-- §3 Writing the read sets (or clears) its correction
-- ============================================================
-- BEFORE INSERT OR UPDATE OF read_text: fires on every analyze-* write-back
-- (they name read_text) and never on a client's dismissal or field edit (they
-- do not). Runs before trg_event_ai_analysis_stamps_frozen (triggers of one
-- timing fire in name order, 'i' < 's'), so on the service role's write the
-- freeze sees the change and lets it through. A client that names read_text
-- itself (013's policy and the table grant still allow it on its own row) is
-- refused by the freeze only when the facts would move; otherwise its text lands
-- and the facts stay as they were. That is the owner's own row and a
-- pre-existing grant, filed separately; the freeze never covered read_text.
--
-- The old sentence is matched by its fixed clause, which no other template in
-- analyze-vomit or analyze-stool contains (EN-0's intake sentence says "meals
-- were logged"; analyze-vomit/index.test.ts pins both). A write whose facts are
-- unchanged keeps its instant, so a re-read that rewrites the same sentence does
-- not re-date the correction.
--
-- INVOKER: the service role (or postgres) is the writer; reading the vomit's own
-- event is a read it already holds. Raises nothing of its own, and NEVER blocks
-- the write it rides on: the read it accompanies can be an escalation, and a
-- correction is not worth losing one (C-38). Any error inside the count leaves
-- the facts as they were and lets the write through, with a WARNING that names
-- no value (C-31).

CREATE OR REPLACE FUNCTION public.set_vomit_intake_correction()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_vomit_at timestamptz;
  v_rec      record;
BEGIN
  IF NEW.incident_type = 'vomit'
     AND NEW.read_text LIKE '%hasn''t eaten a full meal recently.%' THEN
   BEGIN
    SELECT e.occurred_at INTO v_vomit_at
      FROM public.events e
     WHERE e.id = NEW.event_id AND e.pet_id = NEW.pet_id;
    IF v_vomit_at IS NULL THEN
      RETURN NEW;  -- no event to anchor on: leave the facts as they were
    END IF;
    SELECT * INTO v_rec FROM public.vomit_intake_record(NEW.pet_id, v_vomit_at);
    IF NEW.intake_correction_meals IS DISTINCT FROM v_rec.meals_logged
       OR NEW.intake_correction_most_or_all IS DISTINCT FROM v_rec.most_or_all THEN
      NEW.intake_correction_at          := now();
      NEW.intake_correction_meals       := v_rec.meals_logged;
      NEW.intake_correction_most_or_all := v_rec.most_or_all;
    END IF;
   EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'event_ai_analysis: intake correction not recounted on this write';
    RETURN NEW;
   END;
  ELSE
    NEW.intake_correction_at          := NULL;
    NEW.intake_correction_meals       := NULL;
    NEW.intake_correction_most_or_all := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_vomit_intake_correction() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_vomit_intake_correction() FROM anon;
REVOKE ALL ON FUNCTION public.set_vomit_intake_correction() FROM authenticated;

CREATE TRIGGER trg_event_ai_analysis_intake_correction
  BEFORE INSERT OR UPDATE OF read_text ON public.event_ai_analysis
  FOR EACH ROW EXECUTE FUNCTION public.set_vomit_intake_correction();


-- ============================================================
-- §4 The record moving recounts the reads it touches
-- ============================================================
-- One UPDATE, written once (apply_vomit_intake_corrections): every read of the
-- pet that holds the old sentence, on a vomit whose occurred_at lies in
-- [p_from, p_to], gets its facts recounted, and is written only when a count
-- changed. It names none of read_text / recommendation / tier, so §3 does not
-- fire and the verdict cannot move.
--
-- A meal at t can change the count of any vomit in [t, t + 24 h]; a vomit whose
-- own time moved is recounted at its new time ([t, t]). An UPDATE that moves a
-- meal recounts both its old and its new window.

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
  UPDATE public.event_ai_analysis a
     SET intake_correction_at          = now(),
         intake_correction_meals       = r.meals_logged,
         intake_correction_most_or_all = r.most_or_all
    FROM public.events v
    CROSS JOIN LATERAL public.vomit_intake_record(v.pet_id, v.occurred_at) r
   WHERE a.pet_id = p_pet_id
     AND v.pet_id = p_pet_id
     AND a.event_id = v.id
     AND a.incident_type = 'vomit'
     AND v.event_type = 'vomit'
     AND v.occurred_at >= p_from
     AND v.occurred_at <= p_to
     AND a.read_text LIKE '%hasn''t eaten a full meal recently.%'
     AND (a.intake_correction_meals       IS DISTINCT FROM r.meals_logged
       OR a.intake_correction_most_or_all IS DISTINCT FROM r.most_or_all);
$$;

REVOKE ALL ON FUNCTION public.apply_vomit_intake_corrections(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_vomit_intake_corrections(uuid, timestamptz, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.apply_vomit_intake_corrections(uuid, timestamptz, timestamptz) FROM authenticated;

-- DEFINER (see the privacy line above): the write that fires it is a client's
-- own, and the freeze would refuse the recount as `authenticated`. Every pet id
-- it touches comes from the row that fired it; on meals it is re-checked against
-- the meal's event (same id, same pet, a meal) before anything is counted, so a
-- meals row pointing at another account's event recounts nothing. Raises nothing.

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

  -- events
  IF NEW.event_type = 'meal' THEN
    PERFORM public.apply_vomit_intake_corrections(NEW.pet_id, NEW.occurred_at, NEW.occurred_at + interval '24 hours');
  ELSIF NEW.event_type = 'vomit' THEN
    PERFORM public.apply_vomit_intake_corrections(NEW.pet_id, NEW.occurred_at, NEW.occurred_at);
  END IF;
  -- The old window, under the OLD pet: a meal moved in time, retyped, or moved to
  -- another of the owner's pets leaves a count behind where it was.
  IF TG_OP = 'UPDATE' AND OLD.event_type = 'meal'
     AND (OLD.occurred_at IS DISTINCT FROM NEW.occurred_at
       OR NEW.event_type IS DISTINCT FROM 'meal'
       OR OLD.pet_id IS DISTINCT FROM NEW.pet_id) THEN
    PERFORM public.apply_vomit_intake_corrections(OLD.pet_id, OLD.occurred_at, OLD.occurred_at + interval '24 hours');
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_vomit_intake_corrections() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_vomit_intake_corrections() FROM anon;
REVOKE ALL ON FUNCTION public.refresh_vomit_intake_corrections() FROM authenticated;

-- WHEN clauses keep the sync path cheap: the client's upserts name every column,
-- so UPDATE OF alone would fire on every push of an unchanged row.
CREATE TRIGGER trg_events_vomit_intake_correction_ins
  AFTER INSERT ON public.events
  FOR EACH ROW
  WHEN (NEW.event_type IN ('meal', 'vomit'))
  EXECUTE FUNCTION public.refresh_vomit_intake_corrections();

CREATE TRIGGER trg_events_vomit_intake_correction_upd
  AFTER UPDATE OF occurred_at, deleted_at, event_type, pet_id ON public.events
  FOR EACH ROW
  WHEN ((NEW.event_type IN ('meal', 'vomit') OR OLD.event_type IN ('meal', 'vomit'))
        AND (OLD.occurred_at IS DISTINCT FROM NEW.occurred_at
          OR OLD.deleted_at  IS DISTINCT FROM NEW.deleted_at
          OR OLD.event_type  IS DISTINCT FROM NEW.event_type
          OR OLD.pet_id      IS DISTINCT FROM NEW.pet_id))
  EXECUTE FUNCTION public.refresh_vomit_intake_corrections();

CREATE TRIGGER trg_meals_vomit_intake_correction_ins
  AFTER INSERT ON public.meals
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_vomit_intake_corrections();

CREATE TRIGGER trg_meals_vomit_intake_correction_upd
  AFTER UPDATE OF intake_rating ON public.meals
  FOR EACH ROW
  WHEN (OLD.intake_rating IS DISTINCT FROM NEW.intake_rating)
  EXECUTE FUNCTION public.refresh_vomit_intake_corrections();


-- ============================================================
-- §5 Backfill: every stored read holding the old sentence
-- ============================================================
-- Runs as the migration's role, which the freeze exempts. Each pet's reads are
-- recounted over all time; rows without the sentence are untouched.
DO $$
DECLARE
  v_pet uuid;
BEGIN
  FOR v_pet IN
    SELECT DISTINCT a.pet_id
      FROM public.event_ai_analysis a
     WHERE a.incident_type = 'vomit'
       AND a.read_text LIKE '%hasn''t eaten a full meal recently.%'
  LOOP
    PERFORM public.apply_vomit_intake_corrections(v_pet, '-infinity'::timestamptz, 'infinity'::timestamptz);
  END LOOP;
END;
$$;
