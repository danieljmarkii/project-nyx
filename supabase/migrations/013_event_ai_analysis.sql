-- ============================================================
-- event_ai_analysis — per-incident AI analysis (B-027, under B-013)
-- See: docs/backlog.md B-013 (parent, cross-cutting decisions)
--      docs/backlog.md B-027 (Vomit, first per-type child)
--      docs/research/2026-05-feeding-windows-and-partial-eating.md
-- ============================================================
-- The owner-facing feedback loop after logging an incident: from ONE
-- Claude vision call we get (1) a readable description + structured
-- clinical fields, and (2) an n=1 interpretive read ("based on this one
-- instance, should you worry?").
--
-- ONE feature, parameterized by incident_type (B-013) — do NOT fork the
-- table per type. v1 lights up incident_type='vomit'; later types reuse
-- this table on the same machinery. The structured-field columns below
-- are vomit-shaped for v1; future types either reuse them where the
-- semantics match or add their own additive columns.
--
-- Mirrors the food-extraction provenance pattern (007): a cached raw AI
-- payload is the source of truth for "what the AI said", per-field
-- confidence rides alongside, and status tracks the async pipeline.
--
-- Dr. Chen's non-negotiable asymmetry (B-013), enforced structurally:
--   the recommendation enum has NO reassuring value. The read may
--   ESCALATE on the PRESENCE of a red flag ('worth_a_call') but can never
--   reassure on its ABSENCE — false reassurance is unrepresentable, the
--   same way B-010's CHECK constraints made illegal time-states
--   unrepresentable. Reassurance, if ever, comes only from the future
--   cross-incident layer (Step 10), never from a single instance.
--
-- Escalation = context-assembled floor (PM decision 2026-05-24):
--   visual_flags    — raised by the vision model from the photo
--                     (blood, suspected_foreign_material).
--   contextual_flags— computed deterministically by the Edge Function
--                     from events+meals (repeated_vomiting,
--                     feline_reduced_intake, concurrent_lethargy) and
--                     FORCE 'worth_a_call' regardless of the photo — the
--                     model cannot downgrade them. This is what catches
--                     the clear-foam-but-cat-hasn't-eaten case and what
--                     protects photo-less logs. These are simple per-pet
--                     aggregates via pet_id, server-side — NOT the
--                     correlation engine.
--
-- Human override (B-013): the structured fields + description are freely
-- EDITABLE; the n=1 read (recommendation/read_text) is DISMISSIBLE, not
-- editable. dismissed_at is a reversible soft-hide (soft-delete rule —
-- never destroy). "Edited [date]" is derived: a field whose current value
-- differs from ai_raw_payload is edited; edited_at drives ONE calm marker
-- (no per-field history columns). An edited field is the preferred,
-- more-trusted value on the vet report (human-reviewed > raw AI), and
-- re-analysis must never clobber a human-edited field (Edge Function
-- guardrail, mirrors the food retry rule).
--
-- Vet-report scoping (B-013): the structured fields feed the report; the
-- n=1 worry read is owner-facing ONLY and is never a report element.
--
-- Migration Safety Pre-flight:
--   Destructive:  n  (one new table + six new enums; no existing column
--                 or table altered or dropped)
--   Rollback:     DROP TABLE event_ai_analysis;
--                 DROP TYPE ai_recommendation;
--                 DROP TYPE vomit_tristate;
--                 DROP TYPE vomit_blood;
--                 DROP TYPE vomit_consistency;
--                 DROP TYPE vomit_content;
--                 DROP TYPE vomit_colour;
--   Backfill:     None. New table, no existing rows. Analysis rows are
--                 created by the client on log (status='pending') and
--                 filled by the Edge Function — there is no historical
--                 data to populate.
-- ============================================================


-- ── Enums ──────────────────────────────────────────────────────────────
-- 'unsure' is an explicit analysed-but-not-legible value, distinct from a
-- NULL column (which means "not analysed yet" — row still pending). The
-- vision model returns 'unsure' rather than guessing (carried from the
-- food extraction prompt rule).

CREATE TYPE vomit_colour AS ENUM (
  'clear',
  'white',
  'yellow',
  'green',
  'brown',
  'tan',
  'pink_red',
  'dark_red',
  'black_coffee_ground',
  'mixed',
  'unsure'
);

-- Multi-select (stored as an array). Blood / bile / foreign material have
-- their own authoritative fields below and are intentionally NOT listed
-- here, so the bulk-matrix description can never drift against the three
-- escalation-driving fields.
CREATE TYPE vomit_content AS ENUM (
  'undigested_food',
  'partially_digested_food',
  'bile',
  'foam',
  'liquid_only',
  'grass_or_plant',
  'hair',
  'unsure'
);

CREATE TYPE vomit_consistency AS ENUM (
  'watery',
  'foamy',
  'mucoid_slimy',
  'soft_formed',
  'chunky',
  'unsure'
);

-- coffee_ground = digested blood; clinically distinct from fresh_red and
-- kept as its own value deliberately (Dr. Chen).
CREATE TYPE vomit_blood AS ENUM (
  'none_visible',
  'fresh_red',
  'coffee_ground',
  'unsure'
);

-- Shared yes/no/unsure for the boolean-ish clinical fields.
CREATE TYPE vomit_tristate AS ENUM (
  'yes',
  'no',
  'unsure'
);

-- The n=1 read. NO reassuring value by design (see header). 'monitor' is
-- honest-but-non-reassuring; 'not_enough_to_say' is the designed uncertain
-- state (Principle 5) for unclear / not-vomit / no-photo-and-no-flag.
CREATE TYPE ai_recommendation AS ENUM (
  'worth_a_call',
  'monitor',
  'not_enough_to_say'
);


-- ── Table ──────────────────────────────────────────────────────────────

CREATE TABLE event_ai_analysis (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- 1:1 with the event being analysed. CASCADE so a hard-deleted event
  -- (should not happen — events are soft-deleted) cannot orphan analysis.
  event_id                  UUID NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,

  -- Every table carries pet_id (hard constraint) — drives RLS and keeps
  -- multi-pet isolation intact without joining through events.
  pet_id                    UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,

  -- Which incident type this analysis is for. Reuses the event_type enum
  -- (denormalised from events) so analysis can be filtered by type without
  -- a join. v1 only ever writes 'vomit'.
  incident_type             event_type NOT NULL,

  -- Async pipeline state, mirrors food_items.ai_extraction_status.
  --   'pending'   — row created on log, Edge Function not yet returned
  --   'completed' — analysis present
  --   'failed'    — Edge Function errored; `error` set, retry CTA shown
  --   'uncertain' — call succeeded but produced not_enough_to_say
  --                 (photo unclear / not vomit / no photo, no flag)
  status                    TEXT NOT NULL DEFAULT 'pending',
  error                     TEXT,

  -- Cached raw tool-use payload from the vision model — the source of
  -- truth for "what the AI originally said". "Edited" is derived by
  -- comparing the live structured columns against this (no history cols).
  ai_raw_payload            JSONB,
  -- Per-field confidence (0..1), same shape/idea as
  -- food_items.ai_extraction_confidence.
  ai_confidence             JSONB,

  -- ── Structured clinical fields (editable; feed the vet report) ────────
  colour                    vomit_colour,
  contents                  vomit_content[],
  consistency               vomit_consistency,
  blood_present             vomit_blood,
  bile_present              vomit_tristate,
  foreign_material_present  vomit_tristate,
  foreign_material_note     TEXT,
  -- Owner-facing plain-language description of what's visible (editable).
  description               TEXT,

  -- ── n=1 interpretive read (dismissible, NOT editable) ─────────────────
  recommendation            ai_recommendation,
  read_text                 TEXT,
  -- Flags the vision model raised from the photo.
  visual_flags              TEXT[] NOT NULL DEFAULT '{}',
  -- Flags the Edge Function computed deterministically; these force
  -- 'worth_a_call' and the model cannot downgrade them.
  contextual_flags          TEXT[] NOT NULL DEFAULT '{}',

  -- ── Provenance / override ─────────────────────────────────────────────
  -- Set when the owner edits any structured field; drives the single calm
  -- "Edited [date]" marker. NULL = never edited (raw AI is ground truth).
  edited_at                 TIMESTAMPTZ,
  -- Reversible soft-hide of the n=1 read (soft-delete rule). NULL = visible.
  dismissed_at              TIMESTAMPTZ,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS lookups and the "find pending analyses" sweep both key off these.
CREATE INDEX idx_event_ai_analysis_pet ON event_ai_analysis(pet_id);
CREATE INDEX idx_event_ai_analysis_status ON event_ai_analysis(status);


-- ── RLS ──────────────────────────────────────────────────────────────────
-- Owner access via pet_id, same pattern as events/meals/attachments. The
-- Edge Function writes with the service role key (bypasses RLS), like
-- extract-food-from-photo; this policy governs client reads, edits, and
-- the dismiss/undismiss toggle.

ALTER TABLE event_ai_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_ai_analysis_owner" ON event_ai_analysis
  FOR ALL USING (
    pet_id IN (SELECT id FROM pets WHERE user_id = auth.uid())
  );


-- ── updated_at trigger ─────────────────────────────────────────────────

CREATE TRIGGER trg_event_ai_analysis_updated_at
  BEFORE UPDATE ON event_ai_analysis
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
