-- ============================================================
-- events.occurred_at_confidence + window fields — B-010
-- See: docs/backlog.md B-010
--      docs/research/2026-05-event-timestamp-uncertainty.md
--      docs/mockups/b010-found-flow.html (UX storyboard)
-- ============================================================
-- The schema treated occurred_at as a single precise timestamp,
-- but ~65% of adverse incidents are *discovered*, not witnessed
-- (research brief §3). A vomit "found at 7:42am" that actually
-- occurred ~4am is a false-precise time that propagates into the
-- correlation engine and the clinical-grade vet report — a real
-- clinical regression Dr. Chen flagged.
--
-- Option C (PM decision 2026-05-23): model the uncertainty
-- explicitly.
--
--   occurred_at_confidence — how trustworthy occurred_at's precision is:
--     witnessed — owner saw it happen; occurred_at is exact
--     estimated — owner found it, knows roughly when; occurred_at
--                 is a single point but NOT witnessed (e.g. ~4am)
--     window    — owner found it, only knows a range; the event
--                 occurred between earliest and latest
--
--   occurred_at_earliest / occurred_at_latest — the window bounds,
--     populated ONLY when confidence = 'window'. Either edge may be
--     null for an open-ended window (the one-tap "found it, sometime
--     before now" default sets latest = now, earliest = null).
--
-- occurred_at is RETAINED as the canonical/derived point so every
-- existing query, index, and the timeline keep working untouched:
--   witnessed/estimated -> the point the owner set
--   window (both edges)  -> midpoint, derived at write time
--   window (latest only) -> latest
-- Derivation lives in the app layer (same place timezone conversion
-- already does), not in the DB.
--
-- Confidence is ORTHOGONAL to occurred_at_source (007). A photo of
-- discovered vomit is EXIF-stamped at discovery, not occurrence, so
-- confidence must NOT be inferred from source — it is set by the
-- quick-log affordance the owner touches.
--
-- Migration Safety Pre-flight:
--   Destructive:  n  (additive enum + 3 columns + 2 CHECKs; no
--                 existing column altered or dropped)
--   Rollback:     ALTER TABLE events DROP CONSTRAINT chk_occurred_window_fields;
--                 ALTER TABLE events DROP CONSTRAINT chk_occurred_window_order;
--                 ALTER TABLE events DROP COLUMN occurred_at_earliest;
--                 ALTER TABLE events DROP COLUMN occurred_at_latest;
--                 ALTER TABLE events DROP COLUMN occurred_at_confidence;
--                 DROP TYPE occurred_at_confidence;
--   Backfill:     N/A — existing rows take the DEFAULT 'witnessed'
--                 with both window fields NULL. This matches the old
--                 implicit model (owners set/accepted a precise time
--                 in the prior UI), so it is the correct, lossless
--                 back-fill. Same reasoning as the occurred_at_source
--                 = 'manual' back-fill in 007.
-- ============================================================

CREATE TYPE occurred_at_confidence AS ENUM (
  'witnessed',
  'estimated',
  'window'
);

ALTER TABLE events
  ADD COLUMN occurred_at_confidence occurred_at_confidence NOT NULL DEFAULT 'witnessed';

ALTER TABLE events
  ADD COLUMN occurred_at_earliest TIMESTAMPTZ;

ALTER TABLE events
  ADD COLUMN occurred_at_latest TIMESTAMPTZ;

-- Window bounds belong only to windowed events — keeps the three
-- confidence states mutually exclusive at the storage layer
-- (one of Option C's stated benefits: illegal states unrepresentable).
ALTER TABLE events
  ADD CONSTRAINT chk_occurred_window_fields
  CHECK (
    occurred_at_confidence = 'window'
    OR (occurred_at_earliest IS NULL AND occurred_at_latest IS NULL)
  );

-- When both edges are known, they must be ordered. Open-ended windows
-- (one edge null) are allowed — the "sometime before now" default has
-- latest set and earliest null.
ALTER TABLE events
  ADD CONSTRAINT chk_occurred_window_order
  CHECK (
    occurred_at_earliest IS NULL
    OR occurred_at_latest IS NULL
    OR occurred_at_earliest <= occurred_at_latest
  );
