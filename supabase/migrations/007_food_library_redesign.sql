-- ============================================================
-- Food Library Redesign — Schema Migration
-- Step 1 of the food-library-redesign parallel track.
-- See: docs/food-library-redesign-requirements.md §3
-- ============================================================
-- Adds photo-first catalog columns to food_items and the
-- occurred_at_source column to events.
-- No UI changes are bundled here per CLAUDE.md anti-pattern.
-- ============================================================


-- ============================================================
-- food_items — new columns
-- ============================================================

ALTER TABLE food_items
  ADD COLUMN upc_barcode              TEXT UNIQUE,
  -- Nullable. Populated via AI extraction or user scan post-MVP.
  ADD COLUMN photo_paths              TEXT[] NOT NULL DEFAULT '{}',
  -- Order convention: [0]=front, [1]=ingredients, [2]=barcode, [n]=additional.
  -- Paths reference the nyx-food-photos Supabase Storage bucket.
  ADD COLUMN ai_extraction_status     TEXT NOT NULL DEFAULT 'pending',
  -- 'pending' | 'completed' | 'failed' | 'manual'
  -- 'manual' = no photos; user typed all fields directly.
  ADD COLUMN ai_extraction_confidence JSONB,
  -- Per-field confidence scores from the vision model.
  -- Schema: { "brand": 0.98, "product_name": 0.94, "ingredients": 0.71, ... }
  ADD COLUMN source                   TEXT NOT NULL DEFAULT 'user',
  -- 'user' | 'ai_extracted' | 'curated' | 'opff'
  -- 'opff' reserved if we ever import the Open Pet Food Facts catalog.
  ADD COLUMN ai_extraction_error      TEXT;
  -- Populated when ai_extraction_status = 'failed'. Shown as retry CTA
  -- on the food detail screen.

-- Back-fill: rows that existed before this migration were entered without
-- photos (the old text-form UI). Mark them 'manual' so the extraction
-- pipeline never queues them and the UI shows their fields as ground truth.
UPDATE food_items
  SET ai_extraction_status = 'manual',
      source = 'user'
  WHERE photo_paths = '{}';

CREATE INDEX idx_food_items_upc_barcode ON food_items(upc_barcode)
  WHERE upc_barcode IS NOT NULL;

CREATE INDEX idx_food_items_status ON food_items(ai_extraction_status);


-- ============================================================
-- events — occurred_at_source
-- ============================================================
-- Records whether the meal event time came from EXIF, was auto-stamped
-- to now(), or was set manually by the user. Drives the
-- "set from your photo" attribution UI (§4.4).
-- Bundled here because it is schema-only with no UI dependency.

ALTER TABLE events
  ADD COLUMN occurred_at_source TEXT NOT NULL DEFAULT 'manual';
  -- 'manual' | 'exif' | 'now'
  -- 'manual' is the correct back-fill for all pre-existing events:
  -- owners explicitly set or accepted the default time in the old UI.
