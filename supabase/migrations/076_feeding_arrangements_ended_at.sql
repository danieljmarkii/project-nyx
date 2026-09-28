-- ============================================================
-- Migration 076: the instant a free-fed bowl comes up
-- (CUL-1396, the prerequisite of CUL-1086 / Engines v3 PR-14b)
-- ============================================================
--
-- ------------------------------------------------------------
-- WHY
-- ------------------------------------------------------------
-- A free-choice arrangement records the instant the bowl went down
-- (`created_at`: every toggle-on writes a fresh row, and sync carries the value
-- verbatim) but only the owner's LOCAL DATE it came up (`active_until`,
-- `lib/feedingArrangements.ts` localDateString). The one instant written with the
-- toggle-off, `updated_at`, is restamped by `trg_feeding_arrangements_updated_at`
-- (018) on every push, so it records when the row reached the server, not when
-- the bowl came up.
--
-- The intake-decline detectors (CUL-1086) must tell a bowl's rating from a
-- watched meal by date. On the take-up day the record could not say which side
-- of the edge a rating fell on: a local date spans some 50 hours of UTC across
-- zones. Three isolated adversarial passes each broke a rule that inferred it
-- (the end of the UTC date hid refusals the owner watched on that day; counting
-- only concern ratings in the window lowered the baseline and masked a later
-- drop). The PM ruled on 2026-09-28 to record the instant rather than infer it.
--
-- ------------------------------------------------------------
-- WHAT
-- ------------------------------------------------------------
-- `ended_at`: the instant the owner toggled the bowl off, written by the app
-- beside `active_until` (endFreeChoice) and pushed like every other column.
-- NULL while the bowl is down, and NULL on a row ended by a build that predates
-- this column: an old build's upsert omits the column, and PostgREST's
-- ON CONFLICT update leaves an omitted column untouched, so no build overwrites
-- a value another wrote. The readers treat NULL on an ended row as "instant not
-- recorded" and fall back to the date.
--
-- NO CONSTRAINT, deliberately. `ended_at >= created_at` or `ended_at IS NULL OR
-- active_until IS NOT NULL` would each be true of every honest write, and each
-- could reject one: two devices with skewed clocks, or a row re-opened by a
-- future path. A rejected push is a 23514, which the client quarantines (C-38:
-- a guard that bricks what it meant to protect). The reader already tolerates an
-- empty or inverted span.
--
-- No index: nothing filters on the column; it is read with the row.
--
-- RLS: unchanged. `feeding_arrangements_owner` (018) is row-scoped, so a new
-- column inherits it. Nothing about who can read or write a row moves.
--
-- ------------------------------------------------------------
-- BACKFILL
-- ------------------------------------------------------------
-- Every ended row gets `updated_at`, the only instant the row has. For a row
-- ended and never touched again, that is the push of the toggle-off: at or after
-- the real take-up, never before it. Production on 2026-09-28 held exactly one
-- live ended free-choice row (June 2026). Rows ended from here on by a current
-- build carry the true instant. The UPDATE fires the 018 trigger, so the row's
-- `updated_at` moves to the apply time and devices re-hydrate it: harmless (LWW
-- takes the newer copy), and `ended_at` reads the value from before the trigger.
--
-- Rollback: ALTER TABLE feeding_arrangements DROP COLUMN ended_at;
-- (no reader depends on it until CUL-1086's PR, which falls back to the date
-- when the column is NULL).

ALTER TABLE feeding_arrangements
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;

COMMENT ON COLUMN feeding_arrangements.ended_at IS
  'The instant the owner took the free-fed bowl up (toggle-off), written by the app beside active_until (the owner''s local date). NULL while active, and on rows ended by a build predating migration 076. Read by the intake-decline detectors to tell a bowl''s rating from a watched meal (CUL-1086).';

UPDATE feeding_arrangements
   SET ended_at = updated_at
 WHERE active_until IS NOT NULL
   AND ended_at IS NULL;
