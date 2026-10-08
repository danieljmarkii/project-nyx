-- ============================================================
-- Migration 090: a new vomit or stool, and a restated confidence, take back a
--   stored leave to wait (Engines v3 PR-27h, second half)
-- See: CUL-1671 (the issue; the PM's "yes to 1" on CUL-1676 and the split
--      ruling, 2026-10-08); 089_may_wait_record_change.sql (what this amends:
--      its header carries the windows, the R-5 line and the reasons).
-- ============================================================
--
-- WHY A SECOND MIGRATION
-- ------------------------------------------------------------
-- 089 was applied to production from its first draft (commit 3e2d1de). Two
-- changes the reviews and the PM then made to that file never ran:
--   1. occurred_at_confidence is a move (adversarial pass): restating a "Found it"
--      vomit as "Saw it" at the same time can make the floor's T1 / T2 call-now,
--      and the floor reads the column (lib/incidentFloor.ts). 089's update trigger
--      does not watch it.
--   2. a new vomit, stool_normal or diarrhea is a touch point (PM ruled yes,
--      CUL-1676): a photoless incident reaches no server code (lib/simpleEvent.ts
--      reads only inside its photo branch), and a third vomit in half an hour is
--      the floor's T1. 089's insert trigger fires on lethargy only.
-- An applied migration is left as it ran, so 089's file is the applied bytes and
-- the two changes land here. The function body below is 089's with both
-- changes; the two events triggers are re-created with the wider column list and
-- types. The meals triggers and the index are unchanged and not touched.
--
-- Everything else is 089's: lower-only (TRUE -> NULL), INVOKER so RLS bounds a
-- client's sweep, every role fires, either row's pet, fails closed, raises no
-- message of its own. A photographed incident is lowered here too, ahead of the
-- server's own re-check, which never re-raises: the safe side, accepted.
--
-- STATED BLIND SPOTS: 089's, less the incident insert (now covered).
--
-- R-5, THE PRIVACY LINE: unchanged from 089 (the rls-privacy-reviewer pass ran on
-- the combined body). The new insert types widen which client writes fire the
-- sweep, not what the sweep can reach.
--
-- Migration Safety Pre-flight:
--   Destructive:  n  (one function body replaced by a superset of 089's; two
--                     triggers dropped and re-created with wider WHEN / UPDATE OF;
--                     no column, row or data changed on apply).
--   Rollback (one transaction): re-run 089's §2 CREATE OR REPLACE FUNCTION and its
--     three REVOKEs verbatim, then
--       DROP TRIGGER trg_events_may_wait_record_ins ON public.events;
--       DROP TRIGGER trg_events_may_wait_record_upd ON public.events;
--     and re-run 089's two CREATE TRIGGER statements for them verbatim. Any TRUE
--     already lowered stays NULL (the louder line); nothing to restore.
--   Backfill:     N/A. A TRUE a photoless incident or a confidence restatement
--                 should have lowered between 089 and this keeps standing until
--                 the server's next read near it; no installed build renders a
--                 TRUE yet (PR-27f's).
--   Affected tables: events (two triggers re-created); event_ai_analysis (the
--                 sweep's target). Sanity checks before applying:
--                   SELECT pg_get_triggerdef(oid) FROM pg_trigger
--                    WHERE tgname = 'trg_events_may_wait_record_ins';   -- WHEN (new.event_type = 'lethargy') (089 applied)
--                   SELECT pg_get_triggerdef(oid) FROM pg_trigger
--                    WHERE tgname = 'trg_events_may_wait_record_upd';   -- no occurred_at_confidence
-- ============================================================


-- ============================================================
-- §1 The function: 089's body, a confidence change counts as a move, and a new
--    incident is a touch point
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

-- ============================================================
-- §2 The two events triggers, re-created wider (in one transaction with §1)
-- ============================================================
DROP TRIGGER trg_events_may_wait_record_ins ON public.events;
DROP TRIGGER trg_events_may_wait_record_upd ON public.events;

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

COMMENT ON FUNCTION public.take_back_may_wait_on_record_change() IS
  'CUL-1671 (089, 090): a change on the events side lowers may_wait TRUE -> NULL on every TRUE of the same pet (either row''s analysis or event pet) inside the predicate''s window: a lethargy (anchor <= L + 96 h), a new or moved vomit / stool (anchor within 144 h), a cat''s rated meal (anchor in [M - 72 h, M + 240 h], or every TRUE when M is within 168 h of now), and the moved event''s own TRUE. A time / confidence / pet / type move or un-delete counts. Windows mirrored from incidentMayWait.ts. INVOKER, so RLS bounds a client''s sweep; every role fires. Raises no message of its own.';
