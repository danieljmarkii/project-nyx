-- ============================================================
-- Migration 077: stamp ended_at when a build that predates 076 ends a bowl
-- (CUL-1396; adversarial round 4 on CUL-1086, finding E1)
-- ============================================================
--
-- 076 added `feeding_arrangements.ended_at`, the toggle-off instant, written by
-- the app beside `active_until`. Builds that predate it keep ending bowls without
-- it until their owners update: their upsert omits the column, so the row lands
-- with `active_until` set and `ended_at` NULL, and the intake-decline detectors
-- fall back to the local date. That fallback counts every rating from the
-- earliest instant the date could begin (UTC+14), up to ~40 hours of real bowl
-- time in western zones, and round 4 reproduced round 3's silencing inside it:
-- bowl "picked" ratings dragging the baseline under a later watched drop, and a
-- bowl "ate it all" counted as a watched meal.
--
-- So the server stamps the instant the take-up REACHES it. `endFreeChoice`
-- pushes fire-and-forget at the toggle, so for an online device that is seconds
-- after the real take-up; an old device that was offline stamps late, by the
-- length of its outage. Bounded two ways so a late push can never claim a bowl
-- stayed down past what its own date allows: no earlier than the row's
-- `created_at`, no later than the end of the `active_until` date in the
-- westernmost zone (UTC−12, date + 36 h).
--
-- Fires only when the push carries no instant of its own: a current build's
-- `ended_at` always wins. INSERT covers a row created and ended on an offline
-- old device before its first push; UPDATE covers the toggle-off transition
-- (OLD.active_until IS NULL). A row already ended is never re-stamped, and a
-- re-opened row (active_until back to NULL) is not touched: the readers ignore
-- `ended_at` while `active_until` is NULL.
--
-- SECURITY INVOKER (the default): it reads and writes only NEW/OLD, never another
-- row, so it needs no privilege of its own and cannot leak one (C-31's DEFINER
-- concern does not arise). search_path pinned per the advisor.
--
-- Rollback: DROP TRIGGER trg_feeding_arrangements_ended_at_stamp ON
-- feeding_arrangements; DROP FUNCTION stamp_feeding_arrangement_ended_at();
-- Destructive: n. Backfill: none (076's backfill covered every row ended before it).

CREATE OR REPLACE FUNCTION stamp_feeding_arrangement_ended_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.active_until IS NOT NULL
     AND NEW.ended_at IS NULL
     AND (TG_OP = 'INSERT' OR OLD.active_until IS NULL)
  THEN
    NEW.ended_at := GREATEST(
      NEW.created_at,
      LEAST(now(), (NEW.active_until::timestamp AT TIME ZONE 'UTC') + interval '36 hours')
    );
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION stamp_feeding_arrangement_ended_at() IS
  'CUL-1396 / 077: when a build predating 076 ends a free-fed bowl (active_until set, no ended_at), stamp the instant the take-up reached the server, bounded to [created_at, active_until + 36 h]. A pushed ended_at always wins.';

CREATE TRIGGER trg_feeding_arrangements_ended_at_stamp
  BEFORE INSERT OR UPDATE ON feeding_arrangements
  FOR EACH ROW EXECUTE FUNCTION stamp_feeding_arrangement_ended_at();
