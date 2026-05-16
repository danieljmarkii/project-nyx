-- ============================================================
-- AI Signals cache table
-- Stores the generated home screen insight per pet.
-- Written by the generate-signal Edge Function; read by the
-- Zone 1 component on home screen open.
-- ============================================================

CREATE TABLE ai_signals (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id        UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  signal_text   TEXT NOT NULL,
  is_building   BOOLEAN NOT NULL DEFAULT FALSE,
  -- TRUE when there was insufficient data to produce a real insight.
  -- Client uses this to style Zone 1 differently from a real signal.
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE INDEX idx_ai_signals_pet_fresh
  ON ai_signals(pet_id, expires_at DESC);

ALTER TABLE ai_signals ENABLE ROW LEVEL SECURITY;

-- Owner can read and write their own pets' signals.
-- The Edge Function runs with the user's JWT so this policy applies there too.
CREATE POLICY "ai_signals_owner" ON ai_signals
  FOR ALL
  USING (
    pet_id IN (SELECT id FROM pets WHERE user_id = auth.uid())
  )
  WITH CHECK (
    pet_id IN (SELECT id FROM pets WHERE user_id = auth.uid())
  );
