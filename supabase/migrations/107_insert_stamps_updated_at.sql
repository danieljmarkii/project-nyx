-- ============================================================
-- Migration 107: every synced row carries the server's updated_at from its
--   first INSERT
-- See: CUL-2073 (the row; plan comment, PM go 2026-10-22 "go a");
--      001_schema.sql set_updated_at(); 047 (its search_path = '');
--      lib/hydration.ts FR-3 (the reader this protects).
-- CUL-2074 (a meal component's tombstone made final) was drafted here and taken
-- out by the PM's ruling (2026-10-22, "A" on CUL-2073): with a stale meals
-- parent retry it left a bowl naming no food, dropping an off-diet heads-up
-- (CUL-2096). It waits for CUL-2096's fix.
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
--   * feeding_arrangements.updated_at doubles as "last confirmed" (the widget's
--     bowl check, the 14-day re-confirm prompt). A bowl started offline now reads
--     as confirmed at push time, as every re-confirm (an UPDATE) already does. A
--     display fact; it gates no flag.
--
-- THE TABLES: every last-write-wins sync queue (lib/syncQueue.ts SYNC_QUEUES with
-- pendingSince 'updated_at'). Before this file each had its stamp BEFORE UPDATE
-- only. The insert-only queues carry no updated_at and are untouched.
--
-- meal_components already reached the server's time by a double send (pushRows
-- serverStamp, CUL-2051). That stays correct and is now redundant; retiring it is
-- app code, after this is applied (Backlog).
--
-- ------------------------------------------------------------
-- MIGRATION SAFETY PRE-FLIGHT
-- ------------------------------------------------------------
--   Destructive:  n. Fifteen triggers re-created with a wider event list. No
--                 column, row, function, policy or grant changes.
--   Backfill:     N/A, by the PM's ruling (2026-10-22, option a). A row a phone
--                 already skipped comes back on that phone's next cold pull.
--                 Restamping every row would re-download every phone's history
--                 and fire the AFTER UPDATE triggers on events and meals across
--                 the whole record.
--   Rollback:     the ROLLBACK block at the foot of this file (each trigger back
--                 to BEFORE UPDATE).
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
--
-- ------------------------------------------------------------
-- ROLLBACK (exact reversal)
-- ------------------------------------------------------------
--   For each of the fifteen tables above:
--     CREATE OR REPLACE TRIGGER trg_<table>_updated_at
--       BEFORE UPDATE ON public.<table>
--       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--   No data to undo: stamps already written stay server times.
