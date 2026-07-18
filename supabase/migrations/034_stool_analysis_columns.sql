-- ============================================================
-- Stool analysis columns — per-incident AI read for stool (B-247)
-- See: docs/nyx-stool-analysis-requirements.md (§4 schema, §2 decisions)
--      docs/backlog.md B-247 (Stool, second per-type child of B-013)
--      supabase/migrations/013_event_ai_analysis.sql (parent table + vomit)
-- ============================================================
-- Stool is the SECOND incident type on the incident-agnostic
-- event_ai_analysis table (013). Per that table's own header — "ONE
-- feature, parameterized by incident_type; do NOT fork the table per
-- type" — this migration adds stool-shaped structured columns alongside
-- the vomit ones rather than creating a new table. incident_type already
-- exists and takes 'stool_normal' or 'diarrhea' for these rows (D1: the
-- two event_type values stay split — no stool_normal/diarrhea
-- consolidation here; that CLAUDE.md Open Question is unrelated and stays
-- open). The shared pipeline columns (status, ai_raw_payload,
-- ai_confidence, recommendation, read_text, visual_flags,
-- contextual_flags, edited_at, dismissed_at) are reused as-is.
--
-- Consistency taxonomy is the Bristol Stool Scale (Type 1-7) — the
-- clinical standard vets already think in (D3). Owner-facing copy renders
-- the plain-language texture, never the bare number (see the requirements
-- §3.4); the numeric type is a vet-report / small-print detail.
--
-- Dr. Chen's asymmetry (inherited from 013, structurally enforced): the
-- shared ai_recommendation enum still has NO reassuring value, so a stool
-- read can ESCALATE on the presence of a red flag (blood, repeated
-- watery, concurrent vomiting/lethargy) but can never reassure on its
-- absence. n=1 never reassures.
--
-- Blood is split into a present/absent tristate plus a free-text
-- fresh-vs-dark discriminator: melena (black/tarry, digested upper-GI
-- blood) is a clinically distinct escalation from bright red haematochezia
-- (lower-GI), the same reasoning that keeps vomit_blood's coffee_ground
-- separate from fresh_red. stool_colour ALSO carries 'black_tarry' and
-- 'red_streaked' so the colour field and the blood field corroborate
-- rather than drift.
--
-- foreign_material_present / foreign_material_note are NOT added here:
-- they already exist on the table from 013 (vomit) and are semantically
-- identical for stool (a sock is a sock). Reuse them — no stool-prefixed
-- duplicates.
--
-- Migration Safety Pre-flight:
--   Destructive:  n  (four new enums + six new columns; nothing existing
--                 altered or dropped)
--   Rollback:     ALTER TABLE event_ai_analysis
--                   DROP COLUMN stool_consistency,
--                   DROP COLUMN stool_colour,
--                   DROP COLUMN stool_content,
--                   DROP COLUMN stool_blood_present,
--                   DROP COLUMN stool_blood_type,
--                   DROP COLUMN stool_mucus_present;
--                 DROP TYPE stool_consistency;
--                 DROP TYPE stool_colour;
--                 DROP TYPE stool_content;
--                 DROP TYPE stool_tristate;
--   Backfill:     None. Purely additive — existing rows get all-null new
--                 columns, which the app already reads as "not analysed
--                 for these fields" (status remains the source of truth
--                 for pipeline state).
-- ============================================================


-- ── Enums ──────────────────────────────────────────────────────────────
-- 'unsure' is the explicit analysed-but-not-legible value, distinct from a
-- NULL column ("not analysed yet"). The vision model returns 'unsure'
-- rather than guessing (carried from the vomit / food-extraction rule).

-- Bristol Stool Scale, Type 1-7. Type 4 (smooth, soft, sausage-shaped) is
-- the clinical "normal" reference point; 1-2 trend constipation, 5-7 trend
-- loose/diarrhoeal.
CREATE TYPE stool_consistency AS ENUM (
  'type_1_hard_lumps',   -- Bristol 1: separate hard lumps
  'type_2_lumpy',        -- Bristol 2: sausage-shaped but lumpy
  'type_3_cracked',      -- Bristol 3: sausage with surface cracks
  'type_4_smooth_soft',  -- Bristol 4: smooth, soft — the "normal" reference
  'type_5_soft_blobs',   -- Bristol 5: soft blobs, clear-cut edges
  'type_6_mushy',        -- Bristol 6: mushy, ragged edges
  'type_7_watery',       -- Bristol 7: watery, no solid pieces
  'unsure'
);

CREATE TYPE stool_colour AS ENUM (
  'brown',        -- the normal range
  'dark_brown',
  'yellow',
  'green',
  'black_tarry',  -- melena — corroborates stool_blood_type='dark_tarry'
  'grey_pale',    -- acholic / possible biliary
  'red_streaked', -- fresh blood on the surface — corroborates 'fresh_red'
  'unsure'
);

-- Multi-select (stored as an array). Blood / mucus / foreign material have
-- their own authoritative fields below and are intentionally NOT listed
-- here, so the bulk-content description can never drift against the
-- escalation-driving fields (same discipline as vomit_content).
CREATE TYPE stool_content AS ENUM (
  'undigested_food',
  'grass',
  'hair',
  'unsure'
);

-- Shared yes/no/unsure for the stool boolean-ish clinical fields. Kept
-- distinct from vomit_tristate only for name clarity; identical shape.
CREATE TYPE stool_tristate AS ENUM (
  'yes',
  'no',
  'unsure'
);


-- ── Columns ────────────────────────────────────────────────────────────
-- All additive on event_ai_analysis. Structured fields are editable and
-- feed the vet report (§3.7 "Stool characteristics"); the shared n=1 read
-- columns (recommendation/read_text/flags) are reused from 013.

ALTER TABLE event_ai_analysis
  ADD COLUMN stool_consistency   stool_consistency,
  ADD COLUMN stool_colour        stool_colour,
  ADD COLUMN stool_content       stool_content[],
  ADD COLUMN stool_blood_present stool_tristate,
  -- 'fresh_red' | 'dark_tarry' | NULL. Only meaningful when
  -- stool_blood_present = 'yes'; distinguishes haematochezia from melena.
  ADD COLUMN stool_blood_type    TEXT,
  ADD COLUMN stool_mucus_present stool_tristate;


-- ── RLS ────────────────────────────────────────────────────────────────
-- No new policy: event_ai_analysis_owner (013) is FOR ALL and pet_id-scoped
-- — not column-scoped — so it already governs every column added here.
