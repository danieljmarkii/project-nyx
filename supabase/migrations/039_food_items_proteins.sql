-- ============================================================
-- Multi-Protein Capture — food_items.proteins (B-351 Phase A, PR 1)
-- See: docs/nyx-multi-protein-requirements.md §4 (data model, D4 RATIFIED),
--      §11 slice 1 (this PR), §12 (the data already exists as free text).
-- ============================================================
-- A real food frequently contains SEVERAL proteins — the "duck" novel-protein
-- food that also lists chicken by-product meal is the textbook elimination-trial
-- contaminant. Today only `primary_protein` (single TEXT) is structured, so the
-- secondary exposure is invisible to every clinical surface. `proteins` is the
-- ordered set that fixes that:
--
--   proteins TEXT[]  — prominence-ordered CANONICAL protein keys (most prominent
--                      first, as they appear on the ingredient panel). Each
--                      element is canonicalizeProtein-stable (lib/protein.ts), so
--                      an owner-picked chip and an AI-extracted value key
--                      identically. Empty array = protein-unknown — never a junk
--                      key (junk would pad the Bonferroni family in the Signal).
--
-- `primary_protein` STAYS, and becomes the derived convenience = proteins[0]:
-- every existing read (ProteinPicker seed, vet-report joins, picker display)
-- keeps working unchanged. Write paths set both together from PR 2 (extraction)
-- and PR 3 (picker) onward.
--
-- Legacy-row property (relied on by every reader): after the backfill below,
-- `primary_protein` keeps its VERBATIM stored value (possibly cased/qualified —
-- "Chicken By-Product Meal"), while proteins[0] holds its canonical key
-- ("chicken"). The two are equal UNDER CANONICALIZATION — which is the only
-- equality any ranking/correlation read uses (they all canonicalize on read).
-- New writes (PR 2/3) keep the pair trivially consistent.
--
-- Why TEXT[] (D4): the engine only ever needs set-membership; a join table adds
-- relational machinery no reader wants and complicates the SQLite mirror +
-- last-write-wins sync (a food is one row); jsonb is deferred (D4a) until a real
-- per-protein-metadata need appears — widening TEXT[]→jsonb later is non-breaking.
--
-- No GIN index: `proteins` is never a SERVER-side predicate today. The Phase B
-- correlation engine (generate-signal) pulls meal/food rows and computes
-- set-membership in TypeScript, and refreshFoodCache pulls by created_by_user_id
-- only. Adding an index now would advertise a query pattern nothing uses
-- (mirroring migration 035's no-index rationale).
--
-- ------------------------------------------------------------
-- Migration Safety Pre-flight
-- ------------------------------------------------------------
--   Destructive y/n:  n. One additive column with a DEFAULT; the backfill only
--                     writes the NEW column. No column/table/type is dropped or
--                     retyped; primary_protein is never mutated.
--   Affected tables:  food_items (~56 live rows, 1 creator — B-354 grounding).
--   Backfill:         in-migration DO block below — proteins = ARRAY[canonical
--                     key of primary_protein] where one exists, else '{}' stays.
--   Rollback plan:    ALTER TABLE food_items DROP COLUMN proteins;
--                     (reversible; primary_protein was never touched, so the
--                     pre-migration state is fully intact.)
-- ============================================================

ALTER TABLE food_items
  ADD COLUMN proteins TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN food_items.proteins IS
  'B-351: prominence-ordered canonical protein keys (canonicalizeProtein-stable, '
  'lib/protein.ts). proteins[1] (SQL 1-based) = the primary; primary_protein is '
  'the derived single-value convenience kept for back-compat. Empty = unknown.';

-- ------------------------------------------------------------
-- One-shot backfill: proteins = ARRAY[canonicalize(primary_protein)].
--
-- ⚠️ The canonicalization below is a SQL MIRROR of lib/protein.ts
-- canonicalizeProtein (B-052), inlined ONLY for this one-shot backfill because a
-- migration cannot call TypeScript. lib/protein.ts remains the single source of
-- truth — never reuse or extend this SQL copy; any future re-derivation backfill
-- (spec §13, over ingredients_notes) must run through the TS path instead.
-- Mirrored rules, in order: lowercase + trim + collapse whitespace; strip
-- leading/trailing non-alphanumerics; normalize by-product spellings; strip
-- trailing form-qualifiers (by-product meal | by-product | meal) to a fixpoint;
-- junk sentinels ('null', 'unknown', …) and empty results stay '{}'.
-- ------------------------------------------------------------
DO $$
DECLARE
  r    RECORD;
  v    TEXT;
  prev TEXT;
BEGIN
  FOR r IN SELECT id, primary_protein FROM food_items WHERE primary_protein IS NOT NULL LOOP
    v := regexp_replace(lower(btrim(r.primary_protein)), '\s+', ' ', 'g');
    v := regexp_replace(v, '^[^[:alnum:]]+|[^[:alnum:]]+$', '', 'g');
    v := regexp_replace(v, '\mby[ -]?product\M', 'by-product', 'g');
    LOOP
      prev := v;
      v := btrim(regexp_replace(v, '(^|\s+)(by-product meal|by-product|meal)$', ''));
      EXIT WHEN v = prev;
    END LOOP;
    IF v = '' OR v IN ('null', 'none', 'n/a', 'na', 'unknown', 'undefined', 'unspecified') THEN
      CONTINUE;  -- junk / qualifier-only → protein-unknown; proteins stays '{}'
    END IF;
    UPDATE food_items SET proteins = ARRAY[v] WHERE id = r.id;
  END LOOP;
END $$;
