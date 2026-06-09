-- ============================================================
-- feeding_arrangements — pet↔food standing-fact join (B-040 R1, PR 1)
-- See: docs/nyx-free-feeding-requirements.md §4 (schema) + §8 (build order)
--      docs/backlog.md B-040
--      docs/research/2026-05-feeding-windows-and-partial-eating.md
-- ============================================================
-- R1 introduces the missing concept: a STANDING FACT joining a pet to a
-- food it always has access to ("free-fed / always down"), set once — not
-- a per-nibble log. The data model has no pet↔food standing relationship
-- today: `meals` is a point event (assumes discrete, witnessed feeding)
-- and `food_items` is globally scoped (no user_id/pet_id), so "THIS pet is
-- free-fed THIS food" has nowhere to live. This table is that home.
--
-- A new join table is required (not a column on food_items) precisely
-- because food_items is global and cannot carry per-pet facts. Additive,
-- RLS'd, and multi-pet-ready by construction.
--
-- SCOPE — this PR is schema only (migration-isolation rule). No UX, no
-- detection.ts ingestion. Capture UX is PR 2; History rendering PR 3;
-- engine ingestion PR 4 (§8). This migration ships the DATA so those
-- consumers have something to build against.
--
-- Clinical guardrail carried by every future consumer (§2, NOT enforced
-- by schema but noted so it is never lost): a standing free-fed food means
-- intake is NOT directly observed — absence of witnessed intake is NEVER
-- read as "didn't eat," and a free-fed food NEVER produces reassurance.
-- The vet report carries "intake not directly observed" verbatim (§6).
--
-- Migration Safety Pre-flight:
--   Destructive:  n  (one new table + one new enum; nothing altered or
--                 dropped, no existing column touched)
--   Rollback:     DROP TABLE feeding_arrangements;
--                 DROP TYPE feeding_method;
--   Backfill:     N/A — new table, no existing rows. Owners declare
--                 arrangements going forward; there is no historical
--                 free-feeding data to populate.
-- ============================================================


-- ── Enum ───────────────────────────────────────────────────────────────
-- `meal_fed` is present so the vet report can render a COMPLETE
-- feeding-method picture (WSAVA Diet History asks meal-vs-free-choice
-- explicitly), not just free-choice. R1's capture UX targets `free_choice`
-- only (the actual gap); whether to also capture `meal_fed` vs infer it
-- from logged meals is a §7 open item, deferred — the enum value reserves
-- the option without committing the UX.

CREATE TYPE feeding_method AS ENUM (
  'free_choice',   -- always available / ad libitum / grazing (R1 target)
  'meal_fed'       -- discrete meals (standing fact for vet-report completeness)
);


-- ── Table ──────────────────────────────────────────────────────────────

CREATE TABLE feeding_arrangements (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Every pet-child table carries pet_id (Eng hard constraint) — drives
  -- RLS and keeps multi-pet isolation intact. CASCADE so deleting a pet
  -- takes its arrangements with it.
  pet_id          UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,

  -- The food this pet always has access to. food_items is globally scoped,
  -- so the per-pet fact lives HERE, not on the food row. CASCADE so a
  -- deleted food cannot orphan an arrangement.
  food_item_id    UUID NOT NULL REFERENCES food_items(id) ON DELETE CASCADE,

  method          feeding_method NOT NULL DEFAULT 'free_choice',

  -- Active window: the standing fact is true between these. A NULL
  -- active_until means CURRENTLY ACTIVE (the bowl is still down). The
  -- window boundaries are the discrete, real lifecycle events History
  -- renders as boundary markers (§6a) and the engine can analyse (§8 PR 4)
  -- — the constant middle is matched-out, the edges are not.
  active_from     DATE,
  active_until    DATE,

  -- Forward-compat hook for shared-bowl multi-pet attribution WITHOUT
  -- building it now: a low-attribution shared arrangement is just
  -- is_shared = TRUE. INERT in R1 (UX always writes FALSE) — it reserves
  -- the hook so the multi-pet sprint is additive, not a reshape (§4).
  is_shared       BOOLEAN NOT NULL DEFAULT FALSE,

  notes           TEXT,

  -- Soft delete only (Eng hard constraint). A discontinued arrangement
  -- stays for historical correlation context — never DELETE.
  deleted_at      TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()

  -- NOTE: no quantity/intake fields by design — a standing fact has no
  -- per-meal amount. Quantity recovery is deferred (§0).
);

-- Partial index: the hot read is "active arrangements for this pet"
-- (food detail toggle state, History ambient strip, future engine
-- ingestion). Excluding soft-deleted rows keeps it tight (§4).
CREATE INDEX idx_feeding_arrangements_pet
  ON feeding_arrangements(pet_id)
  WHERE deleted_at IS NULL;


-- ── RLS ──────────────────────────────────────────────────────────────────
-- Owner-scoped via pet_id → pets.user_id, the same pattern as every other
-- pet-child table (events, meals, attachments, event_ai_analysis). Unlike
-- event_ai_analysis (written by an Edge Function with the service role),
-- arrangements are written directly by the client through the local-first
-- sync queue (PR 2), so this policy governs client read AND write. FOR ALL
-- with the USING expression defaults WITH CHECK to the same predicate, so
-- insert/update are gated on the pet belonging to auth.uid() too.

ALTER TABLE feeding_arrangements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feeding_arrangements_owner" ON feeding_arrangements
  FOR ALL USING (
    pet_id IN (SELECT id FROM pets WHERE user_id = auth.uid())
  );


-- ── updated_at trigger ─────────────────────────────────────────────────

CREATE TRIGGER trg_feeding_arrangements_updated_at
  BEFORE UPDATE ON feeding_arrangements
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
