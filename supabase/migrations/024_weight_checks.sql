-- ============================================================
-- Weight Tracking — Schema Migration (B-186, PR 1 of the build plan)
-- See: docs/backlog.md B-186; the 2026-06-25 vet-council deep-dive
--      (docs/research/2026-06-vet-council-nyx-deep-dive.md, Consensus #4 / §3)
--      named a weight TREND the single highest-value missing datum for a
--      chronic-GI cat on a free-choice weight-management diet.
-- ============================================================
-- `weight_check` is already a live event_type (001_schema.sql:87) with no model
-- behind it: today an owner could record THAT a weight was taken but not WHAT
-- the scale read — the events table carries only `severity` (a dead 1–5 scale)
-- and free-text `notes`, with no numeric value column. Every other typed event
-- stores its value in a 1:1 child table; this migration adds the missing one,
-- mirroring the meals / medication_administrations pattern exactly:
--
--   meals                    (1:1 child of an event, UNIQUE event_id) -> weight_checks
--   medication_administrations (ditto)                               -> weight_checks
--
-- v1 is DELIBERATELY display-only / descriptive (PM-confirmed 2026-06-26): this
-- is the capture + trend substrate, with NO weight-loss flag. A loss flag needs
-- a defensible threshold and is clinically load-bearing (the n=1 / never-reassure
-- asymmetry weight shares with intake) — it gets its own spec + a mandatory
-- adversarial-reviewer pass later, not bundled here. No UI ships in this PR
-- (schema-only and isolated per the CLAUDE.md migration-isolation rule).
--
-- Clinical note carried forward to every consumer: a weight TREND must never
-- reassure. A stable or rising weight is NOT wellness (a rising line can be
-- fluid/edema/ascites); weight LOSS is the danger signal. The descriptive
-- surface renders neutral numbers + a plain line, never a "healthy"/"stable"
-- verdict or a wellness colour.
--
-- ON DELETE behaviour aligns with the B-039 hard-delete cascade: pet-scoped,
-- CASCADE from pets (which cascades from auth.users) and from the parent event.
--
-- Migration Safety Pre-flight:
--   Destructive:  n  (purely additive — 1 new table + its RLS/index/trigger;
--                     no existing column, type, table, or row is dropped,
--                     renamed, retyped, or altered. `weight_check` already
--                     exists in the event_type enum, so even that is untouched.)
--   Rollback:     DROP TABLE IF EXISTS weight_checks;
--   Backfill:     N/A — one brand-new table, zero existing rows. Nothing to
--                 populate; no other table is read or written. (pets.weight_kg
--                 stays the current-snapshot column it already is — the logging
--                 PR will keep it in sync with the latest check, but THIS
--                 migration touches no existing data.)
--   Affected tables: none existing. Row-count sanity check before applying:
--                 SELECT count(*) FROM weight_checks; -- expect: relation does not exist
-- ============================================================


-- ============================================================
-- weight_checks — the weight-measurement child (mirrors meals)
-- ============================================================
-- The weight check itself is an events row (event_type='weight_check',
-- occurred_at = when the pet was weighed, soft-deletable via events.deleted_at)
-- + this 1:1 child via a UNIQUE event_id, exactly the meal pattern. There is no
-- deleted_at here: deletedness is read through the parent event, like meals.
--
-- weight_kg is NOT NULL — unlike meals.intake_rating (nullable, renders clean
-- when absent), a weight check WITHOUT a weight is meaningless: the value IS the
-- event. This is the one event type where confirm-don't-enter cannot apply
-- (the number is the observation), so the value is mandatory by construction.
--
-- Stored canonical in KILOGRAMS, matching pets.weight_kg and the EditPetModal
-- lbs<->kg precedent (owners see lbs; kg is the storage unit). NUMERIC(5,2)
-- bounds it < 1000 kg; the CHECK rejects a zero/negative reading that would
-- corrupt a trend line. pet_id is denormalized (as in meals) so RLS is a direct
-- pet-scope check with no join.

CREATE TABLE weight_checks (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id    UUID NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  pet_id      UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  weight_kg   NUMERIC(5,2) NOT NULL CHECK (weight_kg > 0),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mirrors idx_medication_administrations_pet_med — "all weight checks for this
-- pet", the trend-series query (joins weight_checks -> events for occurred_at;
-- events already has idx_events_pet_type_time for the date ordering).
-- NOTE: no separate plain index on event_id — the column-level UNIQUE already
-- creates the btree index that serves the 1:1 event<->check lookup.
CREATE INDEX idx_weight_checks_pet ON weight_checks(pet_id);


-- ============================================================
-- Row Level Security — pet-scoped (mirrors meals_owner / medication_administrations_owner)
-- ============================================================
-- FOR ALL with only USING means Postgres reuses the USING expression as the
-- INSERT/UPDATE WITH CHECK, so a user can neither read nor write a weight row
-- for a pet they do not own. RLS belongs in this schema-only PR, never bundled
-- into a UI PR (the 009 food_items cautionary tale: a missing DELETE policy +
-- supabase-js success-with-0-rows = a row that silently resurrects from cache).

ALTER TABLE weight_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "weight_checks_owner" ON weight_checks
  FOR ALL USING (
    pet_id IN (SELECT id FROM pets WHERE user_id = auth.uid())
  );


-- ============================================================
-- updated_at trigger
-- ============================================================
-- Reuse set_updated_at() from 001_schema.sql so every server write stamps
-- updated_at = NOW(), giving the sync layer (PR 2) a real server-time LWW basis
-- for cross-device reconciliation — the same discipline meals got in 016. The
-- row is mutable: an owner can correct a mis-keyed weight (retroactive edit).

CREATE TRIGGER trg_weight_checks_updated_at
  BEFORE UPDATE ON weight_checks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
