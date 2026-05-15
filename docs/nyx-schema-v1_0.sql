-- ============================================================
-- Project Nyx — Database Schema
-- Version: 1.0 | May 2026
-- Platform: Supabase (Postgres)
-- ============================================================
-- Design principles:
--   - Multi-pet ready from day one (pet_id on all clinical tables)
--   - Single event timeline (Option A) — meals are events with detail rows
--   - Soft deletes on events for correlation engine integrity
--   - food_items globally scoped (no user_id) — architected for shared catalog
--   - All timestamps stored in UTC; display in user local time at app layer
--   - Row-level security (RLS) policies control data access by role
-- ============================================================


-- ============================================================
-- EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ============================================================
-- USERS (extends Supabase Auth)
-- ============================================================
-- Supabase manages auth.users. This table extends it with
-- app-level profile data. Created automatically on signup
-- via a Supabase trigger.

CREATE TABLE user_profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name    TEXT,
  timezone        TEXT NOT NULL DEFAULT 'America/New_York',
  -- Timezone stored per user. All occurred_at values are UTC.
  -- App layer converts for display and day-boundary aggregations.
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- PETS
-- ============================================================

CREATE TYPE pet_species AS ENUM ('dog', 'cat', 'other');
CREATE TYPE pet_sex AS ENUM ('male', 'female', 'unknown');

CREATE TABLE pets (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  species             pet_species NOT NULL,
  breed               TEXT,
  date_of_birth       DATE,
  sex                 pet_sex NOT NULL DEFAULT 'unknown',
  weight_kg           NUMERIC(5, 2),
  -- Weight is current snapshot. Weight history is tracked via
  -- events with event_type = 'weight_check' (post-MVP).
  microchip_number    TEXT,
  photo_path          TEXT,
  -- Path in Supabase Storage. Null until owner uploads a photo.
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  -- Soft delete for pets. Inactive pets are hidden in UI
  -- but retained for historical event data.
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pets_user ON pets(user_id) WHERE is_active = TRUE;


-- ============================================================
-- CONDITIONS
-- ============================================================
-- Known health conditions for a pet. Reference data, not time-series.
-- Informs vet report context and AI correlation weighting.

CREATE TYPE condition_status AS ENUM ('active', 'monitoring', 'resolved');

CREATE TABLE conditions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id          UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  condition_name  TEXT NOT NULL,
  diagnosed_at    DATE,
  -- Nullable. Owner may know the condition but not the diagnosis date.
  status          condition_status NOT NULL DEFAULT 'active',
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conditions_pet ON conditions(pet_id, status);


-- ============================================================
-- FOOD ITEMS
-- ============================================================
-- Global product catalog. No user_id — all users share this table.
-- MVP: user-created entries land here directly (accept some noise).
-- Future: seeded catalog + dedup + review queue for user additions.
--
-- The correlation engine queries food_items to find common
-- ingredients across symptom-correlated meals.

CREATE TYPE food_format AS ENUM (
  'dry_kibble',
  'wet_canned',
  'raw',
  'freeze_dried',
  'fresh_cooked',
  'topper',
  'treat',
  'other'
);

CREATE TABLE food_items (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brand                 TEXT NOT NULL,
  product_name          TEXT NOT NULL,
  format                food_format NOT NULL,
  primary_protein       TEXT,
  -- e.g. 'chicken', 'salmon', 'novel: kangaroo'
  -- Free text at MVP. Structured enum post-MVP when catalog is seeded.
  is_novel_protein      BOOLEAN NOT NULL DEFAULT FALSE,
  is_grain_free         BOOLEAN NOT NULL DEFAULT FALSE,
  is_prescription       BOOLEAN NOT NULL DEFAULT FALSE,
  -- Flags prescription diets (Hill's i/d, Royal Canin GI, etc.)
  -- Important for vet report context.
  ingredients_notes     TEXT,
  -- Free text for now. Structured ingredient list is post-MVP.
  created_by_user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Tracks who added the item. Not an ownership relationship —
  -- any user can use any food_item. Used for data quality review.
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_food_items_brand_name ON food_items(brand, product_name);


-- ============================================================
-- EVENTS (core log timeline)
-- ============================================================
-- Every logged observation lands here. Single timeline per pet.
-- Meals, symptoms, and custom events all share this table.
-- Meal-specific detail lives in the meals child table.

CREATE TYPE event_type AS ENUM (
  'meal',
  'vomit',
  'diarrhea',
  'stool_normal',
  'lethargy',
  'itch',
  'scratch',
  'skin_reaction',
  'weight_check',
  'medication',
  'other'
);

CREATE TYPE event_source AS ENUM (
  'manual',       -- owner logged it directly
  'reminder',     -- logged via a reminder prompt
  'imported'      -- future: imported from wearable or other source
);

CREATE TABLE events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id          UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  event_type      event_type NOT NULL,
  occurred_at     TIMESTAMPTZ NOT NULL,
  -- Owner-specified time of the event. Stored UTC.
  -- Defaults to now() at app layer but owner can back-date.
  severity        SMALLINT CHECK (severity BETWEEN 1 AND 5),
  -- Nullable. Relevant for symptom events. Not used for meals.
  -- 1 = mild, 5 = severe.
  notes           TEXT,
  source          event_source NOT NULL DEFAULT 'manual',
  deleted_at      TIMESTAMPTZ,
  -- Soft delete. NULL = active. Non-null = deleted.
  -- Deleted events are hidden in UI but retained for
  -- correlation engine integrity.
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary timeline query: all events for a pet, newest first
CREATE INDEX idx_events_pet_timeline
  ON events(pet_id, occurred_at DESC)
  WHERE deleted_at IS NULL;

-- Correlation engine: symptom or meal events by type and time
CREATE INDEX idx_events_pet_type_time
  ON events(pet_id, event_type, occurred_at DESC)
  WHERE deleted_at IS NULL;

-- Date range queries (vet report generation)
CREATE INDEX idx_events_pet_daterange
  ON events(pet_id, occurred_at)
  WHERE deleted_at IS NULL;


-- ============================================================
-- MEALS (child of events)
-- ============================================================
-- Created when event_type = 'meal'. Extends the event row
-- with structured dietary detail needed by the correlation engine.

CREATE TYPE meal_quantity AS ENUM (
  'tiny',       -- less than quarter portion
  'small',      -- quarter to half
  'normal',     -- full portion
  'large',      -- over-ate
  'unknown'
);

CREATE TABLE meals (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id              UUID NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  -- One meal row per meal event. UNIQUE enforces this.
  pet_id                UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  -- Denormalized for query efficiency. Avoids join to events
  -- on every correlation query.
  food_item_id          UUID REFERENCES food_items(id) ON DELETE SET NULL,
  -- Nullable. Owner may log "ate food" before identifying the product.
  quantity              meal_quantity NOT NULL DEFAULT 'unknown',
  is_full_portion       BOOLEAN,
  -- Simpler boolean alternative for quick logging. Can coexist
  -- with quantity or replace it depending on logging UX decision.
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_meals_pet_food ON meals(pet_id, food_item_id);
CREATE INDEX idx_meals_event ON meals(event_id);


-- ============================================================
-- DIET TRIALS
-- ============================================================
-- Tracks active elimination diet protocols. The clinical wedge
-- made explicit in the schema. Powers compliance tracking,
-- proactive flagging, and vet report trial context.

CREATE TYPE trial_status AS ENUM ('active', 'completed', 'abandoned');

CREATE TABLE diet_trials (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id                UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  food_item_id          UUID REFERENCES food_items(id) ON DELETE SET NULL,
  -- The elimination diet food being trialed. Nullable if not yet
  -- identified in the food_items catalog.
  started_at            DATE NOT NULL,
  target_duration_days  INTEGER NOT NULL,
  -- Vet-specified duration. 21-28 days for GI, 56-84 for skin.
  status                trial_status NOT NULL DEFAULT 'active',
  completed_at          DATE,
  -- Set when status changes to 'completed' or 'abandoned'.
  vet_name              TEXT,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup of active trials for proactive flagging
CREATE INDEX idx_diet_trials_active
  ON diet_trials(pet_id, status)
  WHERE status = 'active';


-- ============================================================
-- VET VISITS
-- ============================================================
-- Lightweight timeline anchors. Not a PIMS replacement.
-- Used to scope vet reports ("since your last visit on X")
-- and trigger pre-appointment AI talking points.

CREATE TABLE vet_visits (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id          UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  visited_at      DATE NOT NULL,
  clinic_name     TEXT,
  vet_name        TEXT,
  reason          TEXT,
  notes           TEXT,
  next_visit_at   DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vet_visits_pet_date ON vet_visits(pet_id, visited_at DESC);


-- ============================================================
-- VET REPORTS
-- ============================================================
-- Record of every generated PDF report. Enables share-by-link
-- without requiring the vet to create a Nyx account.

CREATE TABLE vet_reports (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id            UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  generated_by      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date_range_start  DATE NOT NULL,
  date_range_end    DATE NOT NULL,
  storage_path      TEXT NOT NULL,
  -- Path to PDF in Supabase Storage.
  share_token       UUID NOT NULL DEFAULT uuid_generate_v4(),
  -- Token-gated public link. Vet does not need a Nyx account.
  -- Link format: nyx.app/report/{share_token}
  token_expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_vet_reports_share_token ON vet_reports(share_token);
CREATE INDEX idx_vet_reports_pet ON vet_reports(pet_id, created_at DESC);


-- ============================================================
-- ROW-LEVEL SECURITY
-- ============================================================
-- Supabase RLS ensures users can only access their own data.
-- Vet report share tokens are the only public-read exception.

ALTER TABLE user_profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pets             ENABLE ROW LEVEL SECURITY;
ALTER TABLE conditions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE events           ENABLE ROW LEVEL SECURITY;
ALTER TABLE meals            ENABLE ROW LEVEL SECURITY;
ALTER TABLE diet_trials      ENABLE ROW LEVEL SECURITY;
ALTER TABLE vet_visits       ENABLE ROW LEVEL SECURITY;
ALTER TABLE vet_reports      ENABLE ROW LEVEL SECURITY;

-- User profiles: own row only
CREATE POLICY "user_profiles_owner" ON user_profiles
  FOR ALL USING (auth.uid() = id);

-- Pets: own pets only
CREATE POLICY "pets_owner" ON pets
  FOR ALL USING (auth.uid() = user_id);

-- Events: own pets' events only
CREATE POLICY "events_owner" ON events
  FOR ALL USING (
    pet_id IN (SELECT id FROM pets WHERE user_id = auth.uid())
  );

-- Meals: own pets' meals only
CREATE POLICY "meals_owner" ON meals
  FOR ALL USING (
    pet_id IN (SELECT id FROM pets WHERE user_id = auth.uid())
  );

-- Conditions: own pets only
CREATE POLICY "conditions_owner" ON conditions
  FOR ALL USING (
    pet_id IN (SELECT id FROM pets WHERE user_id = auth.uid())
  );

-- Diet trials: own pets only
CREATE POLICY "diet_trials_owner" ON diet_trials
  FOR ALL USING (
    pet_id IN (SELECT id FROM pets WHERE user_id = auth.uid())
  );

-- Vet visits: own pets only
CREATE POLICY "vet_visits_owner" ON vet_visits
  FOR ALL USING (
    pet_id IN (SELECT id FROM pets WHERE user_id = auth.uid())
  );

-- Vet reports: owner can do all; public can read via share token
CREATE POLICY "vet_reports_owner" ON vet_reports
  FOR ALL USING (auth.uid() = generated_by);

CREATE POLICY "vet_reports_public_share" ON vet_reports
  FOR SELECT USING (
    share_token IS NOT NULL
    AND token_expires_at > NOW()
  );

-- Food items: all authenticated users can read; creator can update
CREATE POLICY "food_items_read" ON food_items
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "food_items_insert" ON food_items
  FOR INSERT WITH CHECK (auth.uid() = created_by_user_id);

CREATE POLICY "food_items_update" ON food_items
  FOR UPDATE USING (auth.uid() = created_by_user_id);


-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
-- Auto-updates updated_at on any row change.

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_pets_updated_at
  BEFORE UPDATE ON pets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_conditions_updated_at
  BEFORE UPDATE ON conditions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_food_items_updated_at
  BEFORE UPDATE ON food_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_diet_trials_updated_at
  BEFORE UPDATE ON diet_trials
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_vet_visits_updated_at
  BEFORE UPDATE ON vet_visits
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_vet_reports_updated_at
  BEFORE UPDATE ON vet_reports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- REFERENCE QUERIES
-- ============================================================
-- These are not run at setup. Documented here so the correlation
-- engine has a reference implementation to build from.

-- [1] Timeline view: all active events for a pet, newest first
--
-- SELECT e.*, m.food_item_id, m.quantity, f.brand, f.product_name
-- FROM events e
-- LEFT JOIN meals m ON m.event_id = e.id
-- LEFT JOIN food_items f ON f.id = m.food_item_id
-- WHERE e.pet_id = :pet_id
--   AND e.deleted_at IS NULL
-- ORDER BY e.occurred_at DESC
-- LIMIT 50;


-- [2] Correlation engine: meals in the N hours before each symptom event
--
-- SELECT
--   symptom.id            AS symptom_event_id,
--   symptom.event_type    AS symptom_type,
--   symptom.occurred_at   AS symptom_time,
--   symptom.severity,
--   meal_event.occurred_at AS meal_time,
--   f.brand,
--   f.product_name,
--   f.primary_protein,
--   f.is_novel_protein,
--   m.quantity,
--   EXTRACT(EPOCH FROM (symptom.occurred_at - meal_event.occurred_at)) / 3600
--                         AS hours_before_symptom
-- FROM events symptom
-- JOIN events meal_event
--   ON meal_event.pet_id      = symptom.pet_id
--   AND meal_event.event_type = 'meal'
--   AND meal_event.occurred_at BETWEEN (symptom.occurred_at - INTERVAL '8 hours')
--                                  AND symptom.occurred_at
--   AND meal_event.deleted_at IS NULL
-- JOIN meals m   ON m.event_id     = meal_event.id
-- JOIN food_items f ON f.id        = m.food_item_id
-- WHERE symptom.pet_id       = :pet_id
--   AND symptom.event_type   IN ('vomit', 'diarrhea', 'itch', 'scratch', 'skin_reaction')
--   AND symptom.deleted_at   IS NULL
--   AND symptom.occurred_at  BETWEEN :date_start AND :date_end
-- ORDER BY symptom.occurred_at DESC, hours_before_symptom ASC;


-- [3] Diet trial compliance: days with at least one meal logged
--
-- SELECT
--   COUNT(DISTINCT DATE(e.occurred_at AT TIME ZONE :timezone)) AS days_with_meal_logged,
--   dt.target_duration_days,
--   CURRENT_DATE - dt.started_at AS days_elapsed
-- FROM diet_trials dt
-- JOIN events e
--   ON e.pet_id      = dt.pet_id
--   AND e.event_type = 'meal'
--   AND e.occurred_at >= dt.started_at::TIMESTAMPTZ
--   AND e.deleted_at IS NULL
-- WHERE dt.id     = :trial_id
--   AND dt.status = 'active'
-- GROUP BY dt.target_duration_days, dt.started_at;


-- [4] Vet report range: all events and meals for a date window
--
-- SELECT
--   e.event_type,
--   e.occurred_at,
--   e.severity,
--   e.notes,
--   f.brand,
--   f.product_name,
--   f.primary_protein,
--   m.quantity
-- FROM events e
-- LEFT JOIN meals m       ON m.event_id  = e.id
-- LEFT JOIN food_items f  ON f.id        = m.food_item_id
-- WHERE e.pet_id      = :pet_id
--   AND e.occurred_at BETWEEN :start_date AND :end_date
--   AND e.deleted_at  IS NULL
-- ORDER BY e.occurred_at ASC;
