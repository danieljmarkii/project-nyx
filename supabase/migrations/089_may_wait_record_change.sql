-- ============================================================
-- Migration 089: a change on the events side takes back a stored leave to wait
--   (Engines v3 PR-27h)
-- See: CUL-1671 (the issue, its decision brief, the PM's ruling A 2026-10-08,
--      the plan and the PM's go);
--      088_may_wait_owner_edit.sql (the analysis-row half, whose shape this mirrors);
--      supabase/functions/_shared/incidentMayWait.ts (the predicate whose windows
--      are mirrored here) and incidentMayWaitEvidence.ts (the reads behind it).
-- ============================================================
--
-- THE GAP
-- ------------------------------------------------------------
-- `may_wait` TRUE is leave for a call_today read to say "first thing tomorrow".
-- The server decides it from the record around the read, and re-checks a stored
-- TRUE only when it reads a neighbour (revalidateMayWait). 088 lowers it when the
-- owner edits an analysis row. Nothing lowers it when the record moves on the
-- EVENTS side, where most of the call-now signs live:
--   · lethargy logged after the read (the predicate refuses lethargy a day either
--     side of the run, and any logged since);
--   · a cat's meal rated, re-rated, re-dated, moved or soft-deleted (intakeFlagAt
--     and the untracked-cat rule both read rated meals);
--   · a vomit or stool re-dated, re-typed, moved between pets or un-deleted into
--     a TRUE's reach (the floor re-run and the neighbour check).
-- None of these writes calls the server, so the TRUE stood. Here the database
-- lowers it, in the same transaction as the write.
--
-- ------------------------------------------------------------
-- THE DIRECTION IS STILL THE POINT
-- ------------------------------------------------------------
-- The one write is `may_wait = NULL` on a row holding TRUE: the louder line, the
-- same lower-only transition 088 opened in the freeze. Nothing here writes TRUE
-- or FALSE, and nothing re-raises a TRUE the server may have kept: a lowered row
-- waits for the server's next read of it.
--
-- WHY INVOKER (088's reason): the sweep runs as the writer, so 013's RLS bounds
-- it to rows they could already UPDATE, and the freeze judges it like any client
-- write. A DEFINER sweep would skip RLS and need an id-scoping argument instead.
--
-- EVERY ROLE FIRES, unlike 088's client-only gate. 088 skipped service_role
-- because the server re-checks neighbours itself after its own analysis writes.
-- No server path re-checks after an EVENTS write, so a write here lowers
-- whoever makes it.
--
-- ------------------------------------------------------------
-- THE WINDOWS (mirrored from incidentMayWait.ts, pinned by
-- guards/mayWaitRecordChange.test.ts; C-34: same value, same question)
-- ------------------------------------------------------------
-- A TRUE's anchor is its event's `occurred_at`. Each change names one or more
-- touch points (kind, pet, time), and a TRUE inside a touch point's window is
-- lowered:
--   lethargy at L   anchor <= L + 72 h + 24 h
--                   (MAY_WAIT_NEIGHBOUR_HOURS + MAY_WAIT_LETHARGY_HOURS). The run
--                   reaches 72 h from the anchor and the lethargy check a day
--                   past the run. No lower bound: the predicate refuses lethargy
--                   "logged since", back-dated or not, whatever the read's age.
--   incident at t   anchor within 2 x 72 h of t (a vomit / stool: the neighbour
--                   check reaches 72 h; the floor re-run on a neighbouring vomit
--                   reads 72 h either side of IT, which is why the server reads
--                   2x the reach).
--   meal at M       a cat only (the predicate reads intake for cats only, and a
--                   dog's TRUE must not vanish at its next meal). anchor in
--                   [M - 72 h, M + 72 h + 168 h] (a vomit in the run, 72 h from
--                   the anchor, reads rated meals 168 h back:
--                   MAY_WAIT_INTAKE_BASELINE_HOURS), OR every TRUE on the cat when
--                   M >= now() - 168 h, because the predicate also evaluates the
--                   intake flag and the untracked-cat rule at the read's NOW. Any
--                   rated meal counts, not just Most / All: losing a rating can
--                   make tracksIntakeAt refuse.
--   self            the moved event's own TRUE, whatever its window: its anchor,
--                   pet or type moved under it.
-- The guard derives each interval from the TS constants, so a constant that moves
-- reds there until this file moves with it.
--
-- WHAT FIRES (four AFTER triggers, one function):
--   events INSERT   a live lethargy (lethargy), or a live vomit or stool
--                   (incident). A photoless incident reaches no server code
--                   (lib/simpleEvent.ts reads only inside its photo branch), and a
--                   third vomit in half an hour is the floor's T1; the PM ruled it
--                   in (CUL-1671, 2026-10-08). A photographed one is lowered here
--                   too, ahead of the server's own re-check, which never re-raises.
--   events UPDATE   OF occurred_at, occurred_at_confidence, pet_id, event_type,
--                   deleted_at: a move (time, confidence, pet or type changed, or
--                   the row un-deleted) touches the OLD
--                   place under the OLD pet and the NEW place under the NEW pet
--                   (both, so either timeline loses its TRUEs), and self. A meal
--                   soft-deleted touches its old place.
--   meals INSERT    a rated meal, at its event's time.
--   meals UPDATE    OF intake_rating, event_id, pet_id: the old and new place.
-- The confidence counts as a move because the floor reads it: a found pile is
-- never an onset (T1), and an estimated time does not merge (T2), so restating a
-- "Found it" vomit as "Saw it" at the same time can make a run call-now
-- (adversarial pass on this file). The guard derives the UPDATE OF list from the
-- columns the server's evidence reader reads off `events`, so a column it starts
-- reading reds there until it is watched here.
-- An event type the predicate does not read (anything but lethargy, a meal, a
-- vomit or a stool) touches only self. A soft delete of a vomit, stool or
-- lethargy only removes evidence (calmer is never the result) and touches
-- nothing.
--
-- SAME PET (CUL-882, 088's rule): a TRUE matches a touch point's pet through
-- either its analysis `pet_id` or its event's current `pet_id`, so a move
-- reaches the reads on both timelines whichever row was moved.
--
-- FAILS CLOSED: a TRUE whose event cannot be read is lowered for any touch point
-- on its pet; a touch point with no readable time lowers every TRUE on its pet;
-- a pet whose species cannot be read counts as a cat.
--
-- No recursion: the sweep moves only `may_wait` on event_ai_analysis, so 088's
-- edit predicate is false for every lowered row, and no events or meals row is
-- written.
--
-- STATED BLIND SPOTS (filed on CUL-1671): a photo added or replaced on an event
-- (event_attachments, which the predicate reads through `photoReadSettled`) is
-- not watched, and the edit screen's photo change runs no read; a profile time zone change (the `dst` rule) and a pet's species
-- change are not watched; a write that commits between the server's record read
-- and its TRUE write leaves that TRUE (the read-in-flight race); and a TRUE
-- refused by time alone (the cat intake check at a later now) is CUL-1629's
-- render-time re-check, not a write.
--
-- ------------------------------------------------------------
-- R-5, THE PRIVACY LINE
-- ------------------------------------------------------------
--   Cascade:     unchanged.
--   RLS:         unchanged. The function is INVOKER: for a client its reads
--                (events, pets) and its sweep are bounded by the writer's own
--                rows; service_role is already unbounded and names the pet.
--   Freeze:      unchanged. The sweep uses 088's TRUE -> NULL, nothing else.
--   Same-pet:    074 / 023's triggers unchanged; nothing here writes a pet_id.
--   Realtime:    lowered rows publish as ordinary updates (059); a boolean
--                carries no words, paths or URLs.
--   Errors:      the function raises nothing of its own (C-31). The one error it
--                can hit is Postgres's own `timestamp out of range`, for a touch
--                point within days of timestamptz's limit on a pet with a TRUE; it
--                carries no row value, and RLS is applied before the window
--                arithmetic, so it fails only the writer's own write
--                (rls-privacy-reviewer, probes O1/O2/O8).
--   Wipe list:   no local copy yet (PR-27f's).
--   Model reads: none.
--
-- Migration Safety Pre-flight:
--   Destructive:  n  (one new function, four new triggers, one partial index;
--                     no column, row or data changed on apply).
--   Rollback (one transaction):
--     BEGIN;
--     DROP TRIGGER trg_events_may_wait_record_ins ON public.events;
--     DROP TRIGGER trg_events_may_wait_record_upd ON public.events;
--     DROP TRIGGER trg_meals_may_wait_record_ins  ON public.meals;
--     DROP TRIGGER trg_meals_may_wait_record_upd  ON public.meals;
--     DROP FUNCTION public.take_back_may_wait_on_record_change();
--     DROP INDEX public.idx_event_ai_analysis_may_wait_true;
--     COMMIT;
--     Any TRUE already lowered stays NULL after rollback, which is the louder
--     line; nothing to restore.
--   Backfill:     N/A. A TRUE that a change before this migration should have
--                 lowered keeps standing until the server's next read near it;
--                 no installed build renders a TRUE yet (PR-27f's).
--   Bulk writes: a future migration or script that re-dates, re-types, re-pets
--                 or un-deletes events (or re-rates meals) now lowers the TRUEs it
--                 reaches, across tenants. That is the safe direction; say so in
--                 that migration's pre-flight.
--   Affected tables: events, meals (two triggers each), event_ai_analysis (the
--                 sweep's target; one partial index). Sanity checks before applying:
--                   SELECT count(*) FROM pg_proc WHERE proname = 'take_back_may_wait_on_record_change';  -- 0
--                   SELECT count(*) FROM pg_proc WHERE proname = 'take_back_may_wait_on_owner_edit';     -- 1 (088 applied)
--                   SELECT count(*) FROM public.event_ai_analysis WHERE may_wait IS TRUE;               -- the TRUEs a write may lower
-- ============================================================


-- ============================================================
-- §1 The TRUE set, indexed: every trigger here sweeps it
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_event_ai_analysis_may_wait_true
  ON public.event_ai_analysis (pet_id)
  WHERE may_wait IS TRUE;


-- ============================================================
-- §2 A change on the events side takes back the leave to wait
-- ============================================================
CREATE OR REPLACE FUNCTION public.take_back_may_wait_on_record_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_kinds  text[]        := '{}';
  v_pets   uuid[]        := '{}';
  v_ats    timestamptz[] := '{}';
  v_self   uuid[]        := '{}';
  v_moved  boolean;
  v_at     timestamptz;
  v_pet    uuid;
  v_type   text;
  v_gone   timestamptz;
BEGIN
  IF TG_TABLE_NAME = 'events' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.deleted_at IS NULL THEN
        v_kinds := v_kinds || CASE
                     WHEN NEW.event_type::text = 'lethargy' THEN 'lethargy'
                     WHEN NEW.event_type::text IN ('vomit', 'stool_normal', 'diarrhea') THEN 'incident'
                   END;
        v_pets  := v_pets || NEW.pet_id;
        v_ats   := v_ats  || NEW.occurred_at;
      END IF;
    ELSE
      v_moved := NEW.occurred_at IS DISTINCT FROM OLD.occurred_at
              OR NEW.occurred_at_confidence IS DISTINCT FROM OLD.occurred_at_confidence
              OR NEW.pet_id      IS DISTINCT FROM OLD.pet_id
              OR NEW.event_type  IS DISTINCT FROM OLD.event_type
              OR (OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL);
      IF v_moved THEN
        v_self := v_self || NEW.id;
        -- The old place, under the old pet.
        IF OLD.deleted_at IS NULL THEN
          v_kinds := v_kinds || CASE
                       WHEN OLD.event_type::text = 'lethargy' THEN 'lethargy'
                       WHEN OLD.event_type::text = 'meal' THEN 'meal'
                       WHEN OLD.event_type::text IN ('vomit', 'stool_normal', 'diarrhea') THEN 'incident'
                     END;
          v_pets  := v_pets || OLD.pet_id;
          v_ats   := v_ats  || OLD.occurred_at;
        END IF;
        -- The new place, under the new pet.
        IF NEW.deleted_at IS NULL THEN
          v_kinds := v_kinds || CASE
                       WHEN NEW.event_type::text = 'lethargy' THEN 'lethargy'
                       WHEN NEW.event_type::text = 'meal' THEN 'meal'
                       WHEN NEW.event_type::text IN ('vomit', 'stool_normal', 'diarrhea') THEN 'incident'
                     END;
          v_pets  := v_pets || NEW.pet_id;
          v_ats   := v_ats  || NEW.occurred_at;
        END IF;
      ELSIF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
            AND OLD.event_type::text = 'meal' THEN
        -- A meal soft-deleted: its rating leaves the record.
        v_kinds := v_kinds || 'meal'::text;
        v_pets  := v_pets  || OLD.pet_id;
        v_ats   := v_ats   || OLD.occurred_at;
      END IF;
    END IF;
  ELSE
    -- meals: the place is its event's. The meal's own pet_id and its event's
    -- pet_id are both touched (CUL-882: either may have moved).
    IF TG_OP = 'INSERT' THEN
      SELECT e.occurred_at, e.pet_id, e.event_type::text, e.deleted_at
        INTO v_at, v_pet, v_type, v_gone
        FROM public.events e
       WHERE e.id = NEW.event_id;
      IF NOT FOUND OR v_gone IS NULL THEN
        v_kinds := v_kinds || 'meal'::text || 'meal'::text;
        v_pets  := v_pets  || NEW.pet_id || COALESCE(v_pet, NEW.pet_id);
        v_ats   := v_ats   || v_at || v_at;
      END IF;
    ELSE
      -- Both places, each under the meal row's pet and its event's pet; an
      -- unreadable event leaves the time NULL, which lowers every TRUE on the pet.
      SELECT array_agg('meal'::text), array_agg(p.pet), array_agg(p.at)
        INTO v_kinds, v_pets, v_ats
        FROM (
          SELECT m.pet_id AS pet, e.occurred_at AS at
            FROM (VALUES (OLD.event_id, OLD.pet_id), (NEW.event_id, NEW.pet_id)) AS m(event_id, pet_id)
            LEFT JOIN public.events e ON e.id = m.event_id
           WHERE e.deleted_at IS NULL
          UNION ALL
          SELECT e.pet_id, e.occurred_at
            FROM (VALUES (OLD.event_id), (NEW.event_id)) AS m(event_id)
            JOIN public.events e ON e.id = m.event_id
           WHERE e.deleted_at IS NULL
        ) p;
    END IF;
  END IF;

  IF COALESCE(array_length(v_self, 1), 0) = 0 AND COALESCE(array_length(v_kinds, 1), 0) = 0 THEN
    RETURN NULL;
  END IF;

  UPDATE public.event_ai_analysis a
     SET may_wait = NULL
   WHERE a.may_wait IS TRUE
     AND (a.event_id = ANY (v_self)
       OR EXISTS (
         SELECT 1
           FROM unnest(v_kinds, v_pets, v_ats) AS t(kind, pet, at)
           LEFT JOIN public.events n ON n.id = a.event_id
          WHERE t.kind IS NOT NULL
            AND (a.pet_id = t.pet OR n.pet_id = t.pet)
            AND (t.kind <> 'meal'
                 OR NOT EXISTS (
                   SELECT 1 FROM public.pets s
                    WHERE s.id = t.pet AND s.species::text <> 'cat'))
            AND (n.occurred_at IS NULL
                 OR t.at IS NULL
                 OR (t.kind = 'lethargy'
                     AND n.occurred_at <= t.at + interval '72 hours' + interval '24 hours')
                 OR (t.kind = 'incident'
                     AND n.occurred_at >= t.at - 2 * interval '72 hours'
                     AND n.occurred_at <= t.at + 2 * interval '72 hours')
                 OR (t.kind = 'meal'
                     AND ((n.occurred_at >= t.at - interval '72 hours'
                           AND n.occurred_at <= t.at + interval '72 hours' + interval '168 hours')
                          OR t.at >= now() - interval '168 hours')))));

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.take_back_may_wait_on_record_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.take_back_may_wait_on_record_change() FROM anon;
REVOKE ALL ON FUNCTION public.take_back_may_wait_on_record_change() FROM authenticated;

CREATE TRIGGER trg_events_may_wait_record_ins
  AFTER INSERT ON public.events
  FOR EACH ROW
  WHEN (NEW.event_type IN ('lethargy', 'vomit', 'stool_normal', 'diarrhea'))
  EXECUTE FUNCTION public.take_back_may_wait_on_record_change();

CREATE TRIGGER trg_events_may_wait_record_upd
  AFTER UPDATE OF occurred_at, occurred_at_confidence, pet_id, event_type, deleted_at ON public.events
  FOR EACH ROW
  WHEN (OLD.occurred_at IS DISTINCT FROM NEW.occurred_at
     OR OLD.occurred_at_confidence IS DISTINCT FROM NEW.occurred_at_confidence
     OR OLD.pet_id      IS DISTINCT FROM NEW.pet_id
     OR OLD.event_type  IS DISTINCT FROM NEW.event_type
     OR OLD.deleted_at  IS DISTINCT FROM NEW.deleted_at)
  EXECUTE FUNCTION public.take_back_may_wait_on_record_change();

CREATE TRIGGER trg_meals_may_wait_record_ins
  AFTER INSERT ON public.meals
  FOR EACH ROW
  WHEN (NEW.intake_rating IS NOT NULL)
  EXECUTE FUNCTION public.take_back_may_wait_on_record_change();

CREATE TRIGGER trg_meals_may_wait_record_upd
  AFTER UPDATE OF intake_rating, event_id, pet_id ON public.meals
  FOR EACH ROW
  WHEN (OLD.intake_rating IS DISTINCT FROM NEW.intake_rating
     OR OLD.event_id      IS DISTINCT FROM NEW.event_id
     OR OLD.pet_id        IS DISTINCT FROM NEW.pet_id)
  EXECUTE FUNCTION public.take_back_may_wait_on_record_change();

COMMENT ON FUNCTION public.take_back_may_wait_on_record_change() IS
  'CUL-1671 (089): a change on the events side lowers may_wait TRUE -> NULL on every TRUE of the same pet (either row''s analysis or event pet) inside the predicate''s window: a lethargy (anchor <= L + 96 h), a new or moved vomit / stool (anchor within 144 h), a cat''s rated meal (anchor in [M - 72 h, M + 240 h], or every TRUE when M is within 168 h of now), and the moved event''s own TRUE. A time / confidence / pet / type move or un-delete counts. Windows mirrored from incidentMayWait.ts. INVOKER, so RLS bounds a client''s sweep; every role fires. Raises no message of its own.';
