-- Migration 001: Project Nyx initial schema
-- Run this in the Supabase SQL editor, then run 002_user_profiles_trigger.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE user_profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name    TEXT,
  timezone        TEXT NOT NULL DEFAULT 'America/New_York',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
  microchip_number    TEXT,
  photo_path          TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pets_user ON pets(user_id) WHERE is_active = TRUE;

CREATE TYPE condition_status AS ENUM ('active', 'monitoring', 'resolved');

CREATE TABLE conditions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id          UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  condition_name  TEXT NOT NULL,
  diagnosed_at    DATE,
  status          condition_status NOT NULL DEFAULT 'active',
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conditions_pet ON conditions(pet_id, status);

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
  is_novel_protein      BOOLEAN NOT NULL DEFAULT FALSE,
  is_grain_free         BOOLEAN NOT NULL DEFAULT FALSE,
  is_prescription       BOOLEAN NOT NULL DEFAULT FALSE,
  ingredients_notes     TEXT,
  created_by_user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_food_items_brand_name ON food_items(brand, product_name);

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
  'manual',
  'reminder',
  'imported'
);

CREATE TABLE events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id          UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  event_type      event_type NOT NULL,
  occurred_at     TIMESTAMPTZ NOT NULL,
  severity        SMALLINT CHECK (severity BETWEEN 1 AND 5),
  notes           TEXT,
  source          event_source NOT NULL DEFAULT 'manual',
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_pet_timeline
  ON events(pet_id, occurred_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_events_pet_type_time
  ON events(pet_id, event_type, occurred_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_events_pet_daterange
  ON events(pet_id, occurred_at)
  WHERE deleted_at IS NULL;

CREATE TYPE meal_quantity AS ENUM (
  'tiny',
  'small',
  'normal',
  'large',
  'unknown'
);

CREATE TABLE meals (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id              UUID NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  pet_id                UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  food_item_id          UUID REFERENCES food_items(id) ON DELETE SET NULL,
  quantity              meal_quantity NOT NULL DEFAULT 'unknown',
  is_full_portion       BOOLEAN,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_meals_pet_food ON meals(pet_id, food_item_id);
CREATE INDEX idx_meals_event ON meals(event_id);

CREATE TYPE trial_status AS ENUM ('active', 'completed', 'abandoned');

CREATE TABLE diet_trials (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id                UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  food_item_id          UUID REFERENCES food_items(id) ON DELETE SET NULL,
  started_at            DATE NOT NULL,
  target_duration_days  INTEGER NOT NULL,
  status                trial_status NOT NULL DEFAULT 'active',
  completed_at          DATE,
  vet_name              TEXT,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_diet_trials_active
  ON diet_trials(pet_id, status)
  WHERE status = 'active';

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

CREATE TABLE vet_reports (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id            UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  generated_by      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date_range_start  DATE NOT NULL,
  date_range_end    DATE NOT NULL,
  storage_path      TEXT NOT NULL,
  share_token       UUID NOT NULL DEFAULT uuid_generate_v4(),
  token_expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_vet_reports_share_token ON vet_reports(share_token);
CREATE INDEX idx_vet_reports_pet ON vet_reports(pet_id, created_at DESC);

ALTER TABLE user_profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pets             ENABLE ROW LEVEL SECURITY;
ALTER TABLE conditions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE events           ENABLE ROW LEVEL SECURITY;
ALTER TABLE meals            ENABLE ROW LEVEL SECURITY;
ALTER TABLE diet_trials      ENABLE ROW LEVEL SECURITY;
ALTER TABLE vet_visits       ENABLE ROW LEVEL SECURITY;
ALTER TABLE vet_reports      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_profiles_owner" ON user_profiles
  FOR ALL USING (auth.uid() = id);

CREATE POLICY "pets_owner" ON pets
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "events_owner" ON events
  FOR ALL USING (
    pet_id IN (SELECT id FROM pets WHERE user_id = auth.uid())
  );

CREATE POLICY "meals_owner" ON meals
  FOR ALL USING (
    pet_id IN (SELECT id FROM pets WHERE user_id = auth.uid())
  );

CREATE POLICY "conditions_owner" ON conditions
  FOR ALL USING (
    pet_id IN (SELECT id FROM pets WHERE user_id = auth.uid())
  );

CREATE POLICY "diet_trials_owner" ON diet_trials
  FOR ALL USING (
    pet_id IN (SELECT id FROM pets WHERE user_id = auth.uid())
  );

CREATE POLICY "vet_visits_owner" ON vet_visits
  FOR ALL USING (
    pet_id IN (SELECT id FROM pets WHERE user_id = auth.uid())
  );

CREATE POLICY "vet_reports_owner" ON vet_reports
  FOR ALL USING (auth.uid() = generated_by);

CREATE POLICY "vet_reports_public_share" ON vet_reports
  FOR SELECT USING (
    share_token IS NOT NULL
    AND token_expires_at > NOW()
  );

CREATE POLICY "food_items_read" ON food_items
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "food_items_insert" ON food_items
  FOR INSERT WITH CHECK (auth.uid() = created_by_user_id);

CREATE POLICY "food_items_update" ON food_items
  FOR UPDATE USING (auth.uid() = created_by_user_id);

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
