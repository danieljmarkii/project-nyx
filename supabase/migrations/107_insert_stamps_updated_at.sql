-- ============================================================
-- Migration 107: every synced row carries the server's updated_at from its
--   first INSERT, and a meal component's tombstone is final
-- See: CUL-2073 (the row; plan comment, PM go 2026-10-22 "go a");
--      CUL-2074 (rides here by the PM's ruling 2026-10-21, "park 2074");
--      001_schema.sql set_updated_at(); 047 (its search_path = '');
--      105_meal_components.sql (the guard this replaces);
--      lib/hydration.ts FR-3 (the reader this protects).
-- ============================================================
--
-- THE BUG (CUL-2073)
-- ------------------------------------------------------------
-- An incremental pull asks for `updated_at >= watermark - 2 min` and assumes the
-- row stamps it compares against are server times. Every synced table's
-- set_updated_at trigger fired BEFORE UPDATE only, so a fresh INSERT kept the
-- phone's own updated_at. A row written offline at T and first pushed at T+60m
-- landed stamped T, below every other phone's watermark, and those phones never
-- pulled it (a vomit logged with no signal never shows on the second phone).
--
-- THE FIX
-- ------------------------------------------------------------
-- The same trigger, the same name, the same function, now BEFORE INSERT OR
-- UPDATE. CREATE OR REPLACE TRIGGER swaps it in place, so there is no moment a
-- table has no stamp trigger. set_updated_at() writes NEW.updated_at = NOW()
-- whatever the caller sent, which on INSERT is now the server's transaction time.
--
-- WHY IT IS SAFE
-- ------------------------------------------------------------
--   * markSynced (lib/sync.ts) matches `WHERE id = ? AND updated_at IS <the value
--     this phone sent>` against the phone's own SQLite row. The push reads back
--     only `id`, so the server's stamp never enters that comparison.
--   * The pull side already meets this on every UPDATE push: the author's phone
--     holds its time T, the server holds S, and shouldWriteRemoteRow takes S only
--     when S > T, over synced = 1 rows. The INSERT case now behaves the same.
--   * The sync upsert (INSERT ... ON CONFLICT DO UPDATE) fires BEFORE INSERT on
--     the proposed row, so EXCLUDED.updated_at is already NOW(); BEFORE UPDATE
--     stamps the same NOW() again on the conflict arm.
--   * No other trigger function on these tables reads updated_at (measured on a
--     scratch catalog of 001 to 106: only set_updated_at, set_updated_at_monotonic
--     on event_ai_analysis and preserve_displaced_pet_weight on pets mention it),
--     so firing order beside the same-pet guards and the AFTER triggers does not
--     matter.
--   * NOW() is transaction-start time, as it already is for UPDATE; the pull's
--     two-minute overlap covers the commit skew (lib/hydration.ts).
--   * A phone clock running ahead can no longer push a fresh row's stamp ahead of
--     the server, which shrinks the watermark skew 075 notes.
--
-- THE TABLES: every last-write-wins sync queue (lib/syncQueue.ts SYNC_QUEUES with
-- pendingSince 'updated_at'). Before this file each had its stamp BEFORE UPDATE
-- only. The insert-only queues carry no updated_at and are untouched.
--
-- meal_components already reached the server's time by a double send (pushRows
-- serverStamp, CUL-2051). That stays correct and is now redundant; retiring it is
-- app code, after this is applied (Backlog).
--
-- CUL-2074: A TOMBSTONE IS FINAL (meal_components)
-- ------------------------------------------------------------
-- Phone A pushes a bowl's components and loses the ack, so they stay queued.
-- Phone B pulls them, takes a food out (tombstones it) and pushes. A retries
-- with the food still live, and the upsert's conflict arm wrote deleted_at = NULL
-- over B's tombstone, so the record named a food the pet did not eat. The guard's
-- UPDATE arm now keeps OLD.deleted_at once it is set. Nothing in the app brings a
-- component back (lib/mealComponents.ts only tombstones and inserts a new
-- generation), so no real path loses a write. The rest of A's retry still lands,
-- and the server copy (what the report and the engines read) is right. A's own
-- phone takes the tombstone on its next pull when the server's stamp is later
-- than A's local updated_at; a phone clock running ahead of the server delays
-- that until A's next edit of the row (the LWW skew 075 notes, not new here).
--
-- The guard keeps 105's posture exactly: SECURITY DEFINER, search_path =
-- pg_catalog, pg_temp, EXECUTE revoked from PUBLIC, anon and authenticated, one
-- RAISE naming only NEW.* (C-31). The new line reads nothing but OLD, so it adds
-- no lookup and cannot brick a row (C-38).
--
-- ------------------------------------------------------------
-- MIGRATION SAFETY PRE-FLIGHT
-- ------------------------------------------------------------
--   Destructive:  n. Fifteen triggers re-created with a wider event list, one
--                 function body replaced. No column, row, policy or grant changes.
--   Backfill:     N/A, by the PM's ruling (2026-10-22, option a). A row a phone
--                 already skipped comes back on that phone's next cold pull.
--                 Restamping every row would re-download every phone's history
--                 and fire the AFTER UPDATE triggers on events and meals across
--                 the whole record.
--   Rollback:     the ROLLBACK block at the foot of this file (each trigger back
--                 to BEFORE UPDATE, and 105's guard body).
--   Ordering:     after 106. Never applied between App Store 1.2.0 Submit and its
--                 review verdict (D14).
--   After:        run the VERIFY block, then get_advisors (security + performance).
-- ============================================================


-- ============================================================
-- 1. The stamp: BEFORE INSERT OR UPDATE on every LWW sync table
-- ============================================================
CREATE OR REPLACE TRIGGER trg_events_updated_at
  BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_meals_updated_at
  BEFORE INSERT OR UPDATE ON public.meals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_weight_checks_updated_at
  BEFORE INSERT OR UPDATE ON public.weight_checks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_looks_updated_at
  BEFORE INSERT OR UPDATE ON public.looks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_intake_checks_updated_at
  BEFORE INSERT OR UPDATE ON public.intake_checks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_meal_components_updated_at
  BEFORE INSERT OR UPDATE ON public.meal_components
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_vet_visits_updated_at
  BEFORE INSERT OR UPDATE ON public.vet_visits
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_vet_documents_updated_at
  BEFORE INSERT OR UPDATE ON public.vet_documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_vet_appointments_updated_at
  BEFORE INSERT OR UPDATE ON public.vet_appointments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_feeding_arrangements_updated_at
  BEFORE INSERT OR UPDATE ON public.feeding_arrangements
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_medications_updated_at
  BEFORE INSERT OR UPDATE ON public.medications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_medication_administrations_updated_at
  BEFORE INSERT OR UPDATE ON public.medication_administrations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_diet_trials_updated_at
  BEFORE INSERT OR UPDATE ON public.diet_trials
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_diet_trial_foods_updated_at
  BEFORE INSERT OR UPDATE ON public.diet_trial_foods
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_notification_preferences_updated_at
  BEFORE INSERT OR UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- 2. CUL-2074: the meal_components guard, with a final tombstone
-- ============================================================
-- 105's body, unchanged but for the one IF in the UPDATE arm.
CREATE OR REPLACE FUNCTION public.enforce_meal_component_same_pet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  me  uuid := auth.uid();
  ok  boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Frozen identity. Reads nothing, so an unchanged row is never re-judged.
    ok := NEW.id       IS NOT DISTINCT FROM OLD.id
      AND NEW.pet_id   IS NOT DISTINCT FROM OLD.pet_id
      AND NEW.event_id IS NOT DISTINCT FROM OLD.event_id
      AND NEW.position IS NOT DISTINCT FROM OLD.position;
    -- CUL-2074: a food taken out of a bowl stays out. A retried push of an older
    -- live copy cannot clear another phone's tombstone; the rest of its write
    -- still lands. Components are only ever tombstoned, never brought back.
    IF OLD.deleted_at IS NOT NULL THEN
      NEW.deleted_at := OLD.deleted_at;
    END IF;
  ELSE
    -- The caller's own pet (when there is a caller), and either that pet's meal
    -- or this row already stored with the same identity. The second arm is the
    -- sync upsert: INSERT ... ON CONFLICT DO UPDATE fires this INSERT arm on
    -- every push, so without it a parent re-typed or moved after the first push
    -- would brick every later ratio edit on a terminal 23514 (C-38; found by
    -- rls-privacy-reviewer on this file). The ownership arm stays in front of
    -- both, so another account's pet still lands on the same RAISE whether the
    -- row id is real or not. One EXISTS shape, so a missing event, another pet's
    -- event, a non-meal and another account's pet all land on the same RAISE.
    -- Fail closed.
    SELECT EXISTS (
      SELECT 1
        FROM public.pets p
       WHERE p.id = NEW.pet_id
         AND (me IS NULL OR p.user_id = me)
         AND (
           EXISTS (
             SELECT 1 FROM public.events e
              WHERE e.id = NEW.event_id
                AND e.pet_id = p.id
                AND e.event_type::text = 'meal'
           )
           OR EXISTS (
             SELECT 1 FROM public.meal_components mc
              WHERE mc.id = NEW.id
                AND mc.pet_id = NEW.pet_id
                AND mc.event_id = NEW.event_id
                AND mc.position = NEW.position
           )
         )
    ) INTO ok;
  END IF;

  IF NOT ok THEN
    -- NEW.* only, one message for every cause (C-31). Never the event's type,
    -- pet or time: under DEFINER that is another tenant's data.
    RAISE EXCEPTION
      'meal_components.pet_id % must be the caller''s pet and event_id % that pet''s meal; id, pet_id, event_id and position never change',
      NEW.pet_id, NEW.event_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- CREATE OR REPLACE keeps the ACL; restated so the posture reads from this file.
REVOKE ALL ON FUNCTION public.enforce_meal_component_same_pet() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_meal_component_same_pet() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_meal_component_same_pet() FROM authenticated;

COMMENT ON FUNCTION public.enforce_meal_component_same_pet() IS
  'CUL-2050 (105) / B-520, CUL-2074 (107): BEFORE INSERT OR UPDATE on meal_components. INSERT: event_id must be a meal of NEW.pet_id, and for a signed-in caller that pet must be the caller''s (082''s arm, closes the 42501-vs-23514 membership oracle). UPDATE: id, pet_id, event_id and position are frozen, nothing is looked up, and a set deleted_at is kept (a tombstone is final, so a retried push cannot bring a removed food back); the INSERT arm an upsert fires also passes a row already stored with the same identity, so a ratio edit is never bricked by a moved parent (C-38). food_item_id ownership is RLS''s check, not this one. SECURITY DEFINER so the lookup is not RLS-filtered; search_path = pg_catalog, pg_temp (072); EXECUTE revoked from PUBLIC/anon/authenticated. One RAISE naming only NEW.* (C-31).';


-- ------------------------------------------------------------
-- VERIFY (run after applying; read-only)
-- ------------------------------------------------------------
--   SELECT c.relname, t.tgname, (t.tgtype & 4 = 4) AS on_insert, (t.tgtype & 16 = 16) AS on_update
--     FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
--    WHERE NOT t.tgisinternal AND t.tgname LIKE 'trg\_%\_updated\_at'
--      AND c.relname IN ('events','meals','weight_checks','looks','intake_checks',
--        'meal_components','vet_visits','vet_documents','vet_appointments',
--        'feeding_arrangements','medications','medication_administrations',
--        'diet_trials','diet_trial_foods','notification_preferences')
--    ORDER BY 1;
--     -- 15 rows, every one on_insert = t and on_update = t
--   SELECT prosecdef, proconfig, prosrc LIKE '%OLD.deleted_at IS NOT NULL%'
--     FROM pg_proc WHERE proname = 'enforce_meal_component_same_pet';
--     -- t | {"search_path=pg_catalog, pg_temp"} | t
--
-- ------------------------------------------------------------
-- ROLLBACK (exact reversal)
-- ------------------------------------------------------------
--   For each of the fifteen tables above:
--     CREATE OR REPLACE TRIGGER trg_<table>_updated_at
--       BEFORE UPDATE ON public.<table>
--       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--   Then re-run section 2 of 105_meal_components.sql (its CREATE OR REPLACE
--   FUNCTION, REVOKEs and COMMENT; not its CREATE TRIGGERs, which still exist).
--   No data to undo: stamps already written stay server times.
