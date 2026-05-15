-- ============================================================
-- Migration 003: Photo attachments
-- ============================================================

-- Photos attached to events (vomit, meals, symptoms, etc.)
CREATE TABLE event_attachments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  pet_id          UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  storage_path    TEXT NOT NULL,
  mime_type       TEXT NOT NULL DEFAULT 'image/jpeg',
  taken_at        TIMESTAMPTZ,
  -- EXIF timestamp from the photo, used to pre-fill occurred_at on the event.
  sort_order      SMALLINT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_event_attachments_event ON event_attachments(event_id);

ALTER TABLE event_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_attachments_owner" ON event_attachments
  FOR ALL USING (
    pet_id IN (SELECT id FROM pets WHERE user_id = auth.uid())
  );

-- Documentation photos for vet visits (e.g. visit summaries, prescriptions)
CREATE TABLE vet_visit_attachments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vet_visit_id    UUID NOT NULL REFERENCES vet_visits(id) ON DELETE CASCADE,
  pet_id          UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  storage_path    TEXT NOT NULL,
  mime_type       TEXT NOT NULL DEFAULT 'image/jpeg',
  taken_at        TIMESTAMPTZ,
  sort_order      SMALLINT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vet_visit_attachments_visit ON vet_visit_attachments(vet_visit_id);

ALTER TABLE vet_visit_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vet_visit_attachments_owner" ON vet_visit_attachments
  FOR ALL USING (
    pet_id IN (SELECT id FROM pets WHERE user_id = auth.uid())
  );

-- Food label photo on the shared catalog — mirrors pets.photo_path pattern
ALTER TABLE food_items ADD COLUMN IF NOT EXISTS photo_path TEXT;
