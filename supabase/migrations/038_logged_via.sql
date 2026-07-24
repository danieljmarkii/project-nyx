-- ============================================================
-- logged_via — capture-surface provenance (B-289, widget PR W1)
-- See: docs/nyx-widget-requirements.md §3 (data & provenance),
--      §7 (PR plan — this is W1, deliberately first in the chain),
--      docs/logging-capture-discovery.md (the evidence base).
-- ============================================================
-- Out-of-app capture is coming: the Home Screen widget (W5), App Intents /
-- Siri / NFC / Action Button (B-291), the B-288 confirmation-push pilot, and
-- possibly a watch. Every one of those surfaces writes the SAME rows the app
-- writes, through the same sync rules — so without a provenance column the
-- record can never say which surface produced it. That distinction is
-- load-bearing, not cosmetic:
--   • the engine/report must treat a widget meal as assumed-portion, unrated
--     intake — never conflated with a witnessed in-app rating (§3);
--   • B-291's kill criterion (≥20% of spontaneous-event volume via the widget)
--     is only measurable if writes are stamped;
--   • B-288's pilot needs notification-confirmed vs app-logged provenance.
--
-- Why this lands BEFORE any capture surface exists: the column is
-- unbackfillable later. Today the app is the only surface that has ever
-- written a row, so DEFAULT 'app' is a TRUE claim about every existing row —
-- the one moment in the project's life where the backfill is free and honest.
-- Ship one widget first and that certainty is gone forever.
--
-- logged_via — which surface performed the write:
--   app          — the phone app itself. Default, and the backfill value for
--                  every pre-migration row (see above).
--   notification — a confirmation-push action button (B-288 pilot).
--   reconciled   — an after-the-fact reconcile surface (B-288's fail-safe
--                  path: unanswered prompts record nothing; a later explicit
--                  confirm lands as reconciled, never assumed).
--   widget       — the Home Screen widget (W5). Named items only (D2).
--   intent       — App Intents outside the widget: Siri / Shortcuts / NFC /
--                  Action Button / Back Tap / Controls (B-291 free riders).
--   watch        — a future watch app (B-291, funding gated on the widget's
--                  kill criterion).
--   device       — reserved: other hardware capture (e.g. a scale or feeder
--                  integration). Reserved now because ALTER TYPE ... ADD VALUE
--                  carries the 019 same-transaction caveat; reserving the
--                  tail values costs nothing.
--
-- Distinct from events.source (event_source: manual/reminder/imported, 001):
-- source describes how the record's CONTENT originated (owner-entered vs a
-- reminder flow vs an import); logged_via describes which SURFACE performed
-- the write. A widget tap is source='manual' AND logged_via='widget' — the
-- two axes compose, they don't overlap. Extending event_source instead was
-- rejected: its values are a different axis, it exists only on events (not
-- meals / medication_administrations), and in-place enum extension trips the
-- ALTER TYPE same-transaction caveat (019's header).
--
-- Why all three tables, not just events: meals and medication_administrations
-- are read directly — the engine (generate-signal/detection.ts), the report
-- (generate-report), and adherence attribution all consume the child rows
-- without joining back to events. Stamping the child keeps provenance
-- join-free wherever the row is consumed, and the widget writes the event +
-- child pair in one act so both stamps come from the same write.
--
-- The capture/display UI is NOT in this PR (schema-only, isolated per the
-- CLAUDE.md migration-isolation rule). No client code sets or reads the
-- column yet: the local SQLite mirror + sync payload ride the B-290 write
-- path (W3), and app writes omitting the column land 'app' via the default —
-- which is exactly correct. Until then the column sits at 'app' everywhere,
-- additive and inert.
--
-- RLS is UNCHANGED by construction. All three tables carry FOR ALL row-level
-- owner policies predicated on pet ownership — events_owner + meals_owner
-- (001:211-219) and medication_administrations_owner (020:275-278) — and this
-- project uses no column-level grants, so the new column inherits that exact
-- row scope on each table. This migration adds NO policy, touches NO policy,
-- and changes NO grant.
--
-- Note on enum + use in one migration: CREATE TYPE followed by ADD COLUMN of
-- that freshly-created type in the same transaction is safe (012, 020, 022).
-- The "new value unusable until commit" caveat (019's header) applies only to
-- ALTER TYPE ... ADD VALUE, not to a brand-new CREATE TYPE.
--
-- Migration Safety Pre-flight:
--   Destructive:  n  (purely additive — 1 new enum + 3 new columns, each
--                 NOT NULL DEFAULT 'app'; no existing column, type,
--                 constraint, or row is dropped, renamed, retyped, or
--                 altered. On Postgres 11+ ADD COLUMN with a constant
--                 default is metadata-only — no table rewrite.)
--   Rollback:     ALTER TABLE events                     DROP COLUMN logged_via;
--                 ALTER TABLE meals                      DROP COLUMN logged_via;
--                 ALTER TABLE medication_administrations DROP COLUMN logged_via;
--                 DROP TYPE logged_via;
--                 (drop all three columns before the type they depend on.)
--   Backfill:     handled by the default — every existing row reads 'app',
--                 which is a true statement of fact (the app is the only
--                 capture surface that has ever existed), not a placeholder.
--                 No backfill script needed; this is the entire reason W1
--                 precedes every capture surface.
--   Affected tables: events, meals, medication_administrations (additive
--                 column only). Row-count sanity check before applying
--                 (additive, so informational only):
--                 SELECT (SELECT count(*) FROM events)                     AS events,
--                        (SELECT count(*) FROM meals)                      AS meals,
--                        (SELECT count(*) FROM medication_administrations) AS doses;
-- ============================================================

CREATE TYPE logged_via AS ENUM (
  'app',
  'notification',
  'reconciled',
  'widget',
  'intent',
  'watch',
  'device'
);

-- NOT NULL DEFAULT 'app': unlike how_given (022), where NULL was the honest
-- "owner didn't say", every row HAS a capture surface — there is no
-- unspecified. Pre-migration rows are app-captured by definition, and any
-- write that doesn't stamp the column is, by that very fact, an app write.
ALTER TABLE events
  ADD COLUMN logged_via logged_via NOT NULL DEFAULT 'app';

ALTER TABLE meals
  ADD COLUMN logged_via logged_via NOT NULL DEFAULT 'app';

ALTER TABLE medication_administrations
  ADD COLUMN logged_via logged_via NOT NULL DEFAULT 'app';
