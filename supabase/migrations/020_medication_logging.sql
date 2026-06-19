-- ============================================================
-- Medication Logging — Schema Migration (B-117, PR 1 of the build plan)
-- See: docs/nyx-medication-logging-requirements.md §4 (proposed schema),
--      §3 (the food-model mapping this mirrors), §6 (clinical invariants).
-- ============================================================
-- `medication` is already a live event_type (001_schema.sql:88) with no
-- model behind it. This migration adds the data layer, mirroring the food
-- model's three patterns 1:1 (the spine of the spec, §3):
--
--   food_items   (global catalog, created_by_user_id)  -> medication_items
--   diet_trials  (pet-scoped ongoing regimen + status)  -> medications
--   meals        (1:1 child of an event, unique event_id) -> medication_administrations
--
-- The regimen carries the structured dose/route/frequency fields entered
-- ONCE; logging a dose thereafter is a single confirm-don't-enter tap
-- (§3, §5) — the 10-second test passes because the wall of decisions lives
-- on the regimen, not the dose. No UI ships here (PR 1 is schema-only and
-- isolated per the CLAUDE.md migration-isolation rule).
--
-- ON DELETE behaviours align with the B-039 hard-delete cascade (resolved
-- 2026-06-19): pet-scoped tables CASCADE from pets (which cascades from
-- auth.users); the global medication_items catalog survives account
-- deletion via created_by_user_id -> SET NULL, exactly like food_items.
--
-- Migration Safety Pre-flight:
--   Destructive:  n  (purely additive — 4 new enums + 3 new tables + their
--                     RLS/indexes/triggers; no existing column, type, table,
--                     or row is dropped, renamed, retyped, or altered.
--                     `medication` already exists in the event_type enum, so
--                     even that is untouched.)
--   Rollback:     DROP TABLE IF EXISTS medication_administrations;
--                 DROP TABLE IF EXISTS medications;
--                 DROP TABLE IF EXISTS medication_items;
--                 DROP TYPE  IF EXISTS dose_adherence;
--                 DROP TYPE  IF EXISTS medication_status;
--                 DROP TYPE  IF EXISTS medication_form;
--                 DROP TYPE  IF EXISTS medication_route;
--                 (drop tables before types; administrations before its
--                  parents to respect FK order.)
--   Backfill:     N/A — three brand-new tables, zero existing rows. Nothing
--                 to populate; no other table is read or written.
--   Affected tables: none existing. Row-count sanity check before applying:
--                 SELECT count(*) FROM medication_items;          -- expect: relation does not exist
--                 SELECT count(*) FROM medications;               -- expect: relation does not exist
--                 SELECT count(*) FROM medication_administrations;-- expect: relation does not exist
--                 (i.e. nothing to back up — additive only.)
-- ============================================================


-- ============================================================
-- 1. Enums
-- ============================================================

CREATE TYPE medication_route AS ENUM (
  'oral',
  'topical',
  'otic',
  'ophthalmic',
  'injectable',
  'inhaled',
  'rectal',
  'other'
);

CREATE TYPE medication_form AS ENUM (
  'tablet',
  'capsule',
  'liquid',
  'chewable',
  'transdermal',
  'injection',
  'drops',
  'ointment',
  'powder',
  'other'
);

CREATE TYPE medication_status AS ENUM (
  'active',
  'completed',
  'stopped'
);

-- The adherence scale on a dose event — the medication analog of
-- meals.intake_rating (011). It deliberately splits 'refused' (the pet
-- rejected the dose — a possible DISEASE signal: a pet too nauseated or
-- painful to take a pill, §6.2) from 'missed' (the owner skipped it — an
-- adherence gap). That split is load-bearing for the clinical-guardrails
-- "refusal is not stubbornness" invariant; do not collapse them.
--
-- S1 (spec §11) is OPEN at build time: Dr. Chen + Data Scientist may add
-- 'vomited_up' (both an adherence event and a symptom) at the PR 3 chip step.
-- Postgres `ALTER TYPE ... ADD VALUE` is additive/non-destructive, so this
-- vocabulary can be extended later without a destructive migration — deferring
-- S1 carries no schema risk.
CREATE TYPE dose_adherence AS ENUM (
  'given',
  'partial',
  'missed',
  'refused'
);


-- ============================================================
-- 2. medication_items — the drug-product library (mirrors food_items)
-- ============================================================
-- Globally scoped: no user_id / pet_id. created_by_user_id drives RLS and
-- survives account deletion (SET NULL) so the shared catalog persists, exactly
-- like food_items (D2: organically built, NOT pre-curated; a centralized/
-- curated drug catalog is an explicit future refactor, spec §10). The
-- ai_extraction_* columns mirror the food photo-extraction pipeline added in
-- 007 — populated by the PR 5 `extract-medication-from-photo` function.

CREATE TABLE medication_items (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  generic_name             TEXT NOT NULL,                  -- "prednisolone"
  brand_name               TEXT,                           -- "Apoquel"
  strength                 TEXT,                           -- "5 mg", "16 mg/mL" (free text in v1)
  form                     medication_form,
  default_route            medication_route,
  is_prescription          BOOLEAN NOT NULL DEFAULT TRUE,
  -- Critical drugs (insulin / anti-seizure / cardiac) gate the missed-dose
  -- escalation (§6.3). Classification is clinical, NEVER owner-judged — it is
  -- derived from a curated known-critical match in a later slice (S2, PR 9);
  -- this column is the storage for that derived flag, defaulting safe (FALSE).
  is_critical              BOOLEAN NOT NULL DEFAULT FALSE,
  photo_paths              TEXT[] NOT NULL DEFAULT '{}',    -- nyx-medication-photos; [0]=label/front
  ai_extraction_status     TEXT NOT NULL DEFAULT 'pending', -- pending|completed|failed|manual
  ai_extraction_confidence JSONB,                          -- per-field vision-model confidence
  ai_extraction_error      TEXT,                           -- set when ai_extraction_status='failed'
  notes                    TEXT,
  created_by_user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mirrors idx_food_items_brand_name — the picker/search lookup key.
CREATE INDEX idx_medication_items_name ON medication_items(generic_name, brand_name);

-- Mirrors idx_food_items_status (007) — lets the PR 5 extraction pipeline find
-- 'pending' items to process without a full-table scan.
CREATE INDEX idx_medication_items_status ON medication_items(ai_extraction_status);


-- ============================================================
-- 3. medications — the prescription/regimen (mirrors diet_trials)
-- ============================================================
-- Pet-scoped ongoing regimen. Carries the structured fields entered once so
-- that logging a dose is a single tap (§3). status + ended_at end a regimen
-- (mirrors diet_trials.status/completed_at); there is intentionally no
-- deleted_at — a regimen is "ended", not soft-deleted, like a diet trial.

CREATE TABLE medications (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id               UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  medication_item_id   UUID REFERENCES medication_items(id) ON DELETE SET NULL,
  -- Denormalized display/report fallback. diet_trials relies on the food_items
  -- join with no name fallback (a known minor gap); for meds, losing the drug
  -- name when a library item is deleted is clinically worse — the vet report
  -- (§7) must still name the drug — so we keep drug_name even when
  -- medication_item_id goes NULL. (Data Scientist confirmed at PR 1.)
  drug_name            TEXT NOT NULL,
  dose_amount          TEXT,                            -- "5 mg", "1 tablet", "0.5 mL"
  route                medication_route,
  doses_per_day        NUMERIC(4,2),                    -- expected/day for compliance %; NULL = PRN/as-needed
  schedule_notes       TEXT,                            -- "8am & 8pm", "with food"
  indication           TEXT,                            -- vet-report context
  prescribed_by        TEXT,
  started_at           DATE NOT NULL,
  target_duration_days INTEGER,                         -- NULL = ongoing/indefinite
  status               medication_status NOT NULL DEFAULT 'active',
  ended_at             DATE,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mirrors idx_diet_trials_active — the "what is this pet currently on?" query
-- behind the pet-profile "Current medications" card (§5.4) and the vet report.
CREATE INDEX idx_medications_active
  ON medications(pet_id, status)
  WHERE status = 'active';


-- ============================================================
-- 4. medication_administrations — the dose-event child (mirrors meals)
-- ============================================================
-- The dose itself is an events row (event_type='medication', occurred_at =
-- administration time, soft-deletable via events.deleted_at) + this 1:1 child
-- via a UNIQUE event_id, exactly the meal pattern. There is no deleted_at here:
-- deletedness is read through the parent event, like meals.
--
-- medication_id / medication_item_id are nullable + SET NULL so the historical
-- dose record survives if the regimen or library item is later deleted
-- (medication_id NULL also = a legitimate ad-hoc one-off dose with no regimen).
-- pet_id is denormalized (as in meals) so RLS is a direct pet-scope check with
-- no join — see §5 RLS below.

CREATE TABLE medication_administrations (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id            UUID NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  pet_id              UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  medication_id       UUID REFERENCES medications(id) ON DELETE SET NULL,      -- the regimen (NULL = ad-hoc dose)
  medication_item_id  UUID REFERENCES medication_items(id) ON DELETE SET NULL, -- the drug product
  -- Nullable like meals.intake_rating: NULL renders clean (no placeholder).
  -- The capture UI defaults to 'given' (§5.1); 'refused'/'partial'/'missed'
  -- route toward a health flag, never "fussy" (§6.2).
  adherence           dose_adherence,
  dose_amount         TEXT,                                                    -- actual administered (defaults from regimen)
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mirrors idx_meals_pet_food — "all doses of this regimen for this pet", the
-- compliance-% computation (§5.4) and the Signal confounder join (§8).
-- NOTE: no separate plain index on event_id — the column-level UNIQUE already
-- creates the btree index that serves the 1:1 event<->dose lookup, so meals'
-- redundant idx_meals_event is intentionally not replicated here.
CREATE INDEX idx_medication_administrations_pet_med
  ON medication_administrations(pet_id, medication_id);


-- ============================================================
-- 5. Row Level Security
-- ============================================================
-- medications / medication_administrations: pet-scoped, identical to
-- meals_owner / diet_trials_owner (001:216-229). FOR ALL with only USING means
-- Postgres reuses the USING expression as the INSERT/UPDATE WITH CHECK, so a
-- user can neither read nor write a row for a pet they do not own.
--
-- medication_items: globally readable, but writable (insert/update/delete) only
-- by the creating user — the creator-locked shape of the ORIGINAL food_items
-- policies (001:245-252) PLUS the delete policy food_items only gained in 009.
--
-- DELIBERATELY STRICTER THAN THE LIVE food_items: migration 004 later loosened
-- food_items writes to `WITH CHECK (true)` / `USING (true)` for any authenticated
-- user (those OR-combine with the 001 creator policies, so today *any* user can
-- write *any* food row). We do NOT carry that loosening here — a drug-product
-- catalog is more sensitive than a kibble catalog, and creator-locked writes
-- keep one user from silently rewriting strength/route on a drug row every other
-- user reads. Keep this strict; do not "harmonize" it back to food's looser live
-- state in a later PR. (rls-privacy-reviewer, PR 1.)
--
-- The delete policy is included now (not deferred to the PR 6 detail/delete
-- screen) because 009 is the cautionary tale: food_items shipped with no DELETE
-- policy, supabase-js returns success-with-0-rows when RLS silently blocks a
-- delete, and the row resurrected from the local cache on next focus. Schema +
-- its RLS belong in this schema-only PR, never bundled into a UI PR.

ALTER TABLE medication_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE medications                ENABLE ROW LEVEL SECURITY;
ALTER TABLE medication_administrations ENABLE ROW LEVEL SECURITY;

-- medication_items — global read, creator-locked writes
CREATE POLICY "medication_items_read" ON medication_items
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "medication_items_insert" ON medication_items
  FOR INSERT WITH CHECK (auth.uid() = created_by_user_id);

CREATE POLICY "medication_items_update" ON medication_items
  FOR UPDATE USING (auth.uid() = created_by_user_id);

CREATE POLICY "medication_items_delete" ON medication_items
  FOR DELETE USING (auth.uid() = created_by_user_id);

-- medications — pet-scoped (mirrors diet_trials_owner)
CREATE POLICY "medications_owner" ON medications
  FOR ALL USING (
    pet_id IN (SELECT id FROM pets WHERE user_id = auth.uid())
  );

-- medication_administrations — pet-scoped (mirrors meals_owner)
CREATE POLICY "medication_administrations_owner" ON medication_administrations
  FOR ALL USING (
    pet_id IN (SELECT id FROM pets WHERE user_id = auth.uid())
  );


-- ============================================================
-- 6. updated_at triggers
-- ============================================================
-- Reuse the set_updated_at() function from 001_schema.sql so every server
-- write stamps updated_at = NOW(), giving the sync layer (PR 2) a real
-- server-time LWW basis for cross-device reconciliation — the same discipline
-- meals got in 016. All three tables are mutable: library edits, regimen
-- edits, and retroactive adherence edits (§5.3).

CREATE TRIGGER trg_medication_items_updated_at
  BEFORE UPDATE ON medication_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_medications_updated_at
  BEFORE UPDATE ON medications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_medication_administrations_updated_at
  BEFORE UPDATE ON medication_administrations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
