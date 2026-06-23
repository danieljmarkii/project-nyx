-- ============================================================
-- medication_administrations.how_given — dose vehicle (B-156, Slice B / PR A1)
-- See: docs/medication-food-combo-investigation.md §8 (schema sketch),
--      §10 (the gated PR plan — this is Phase A, PR A1, ungated/buildable now),
--      §2 (the clinical "given with food" reframe),
--      §3 (why the food↔med fact is per-event, never on food_items).
-- ============================================================
-- Owners routinely give a dose INSIDE food — a pill in a Delectable, a pill
-- pocket, a tablet crushed into wet food. Today that clinical fact is invisible:
-- the dose event records *that* a drug was given, never *how*. This adds the
-- vehicle as a small enum on the dose itself.
--
-- Why it matters (not "just convenience" — §2 Dr. Chen):
--   • "give with food" is a real dosing instruction for many drugs (absorption);
--     capturing the vehicle makes the record clinically honest.
--   • It is the additive HOOK the later combo (Slice C, Phase B) needs to couple
--     "vehicle not finished → dose in doubt." This PR ships ONLY the fact, no
--     coupling — the load-bearing safety logic is the gated, adversarial-reviewed
--     Phase B (§10), deliberately not here.
--
-- Why a column on the dose, not a property of the food (§3 Data Scientist):
--   The food↔med pairing is a PER-EVENT fact, derived from what the owner does
--   in this session — never stamped onto the globally-scoped food_items library
--   row (the same shape as saw-it/found-it, B-010). So "Delectable" re-added
--   from Recent tomorrow is a bare treat, never a phantom dose. how_given lives
--   on medication_administrations (the dose event), never on the catalog.
--
-- dose_route_vehicle — how the dose was administered:
--   direct         — given on its own (straight in the mouth, no vehicle)
--   in_food        — mixed into a meal (crushed in wet food, etc.)
--   in_treat       — hidden in a treat (the Delectable / Pill Pocket case)
--   in_pill_pocket — a purpose-made pill pocket specifically
--   other          — anything else
--   (NULL)         — unspecified: every existing dose, and any new dose where the
--                    owner skips the optional chip. NOT a claim of any vehicle —
--                    the absence of an answer. Renders clean (no placeholder),
--                    exactly like the nullable adherence / dose_amount columns on
--                    this table and meals.intake_rating (011/020).
--
-- The capture/display UI is NOT in this PR (schema-only, isolated per the
-- CLAUDE.md migration-isolation rule). A2 adds the local mirror + sync; A3 adds
-- the optional, skippable chip row on MedicationCompletionCard. Until A2/A3 land
-- the column simply sits NULL on every dose — additive and inert.
--
-- RLS is UNCHANGED by construction. medication_administrations is guarded by the
-- row-level policy medication_administrations_owner (020:275-278) — FOR ALL,
-- predicated on pet_id IN (pets WHERE user_id = auth.uid()). This project uses no
-- column-level grants, so a new column inherits that exact row-scope: a user can
-- read/write how_given on precisely the dose rows they already own, and no others.
-- This migration adds NO policy, touches NO policy, and changes NO grant.
-- (rls-privacy-reviewer + Data Scientist, PR A1.)
--
-- Note on enum + use in one migration: CREATE TYPE followed by ADD COLUMN of that
-- freshly-created type in the same transaction is safe (012 and 020 both do it).
-- The "new value unusable until commit" caveat (019's header) applies only to
-- ALTER TYPE ... ADD VALUE, not to a brand-new CREATE TYPE.
--
-- Migration Safety Pre-flight:
--   Destructive:  n  (purely additive — 1 new enum + 1 new nullable column;
--                 no existing column, type, constraint, or row is dropped,
--                 renamed, retyped, or altered.)
--   Rollback:     ALTER TABLE medication_administrations DROP COLUMN how_given;
--                 DROP TYPE dose_route_vehicle;
--                 (drop the column before the type it depends on.)
--   Backfill:     N/A — the column is nullable with no default, so every existing
--                 dose lands NULL = unspecified. No row is read or written; there
--                 is nothing to populate (a NULL vehicle is the honest value for a
--                 dose logged before the vehicle could be captured).
--   Affected tables: medication_administrations (additive column only). Row-count
--                 sanity check before applying (additive, so informational only):
--                 SELECT count(*) FROM medication_administrations;
-- ============================================================

CREATE TYPE dose_route_vehicle AS ENUM (
  'direct',
  'in_food',
  'in_treat',
  'in_pill_pocket',
  'other'
);

-- Nullable, no default: existing doses land NULL (unspecified) and render clean;
-- the A3 capture chip is optional and skippable, so NULL stays a first-class
-- "owner didn't say" — never a placeholder, never a claim of 'direct'.
ALTER TABLE medication_administrations
  ADD COLUMN how_given dose_route_vehicle;
