-- ============================================================
-- app_config — server-flippable product config (Monetization Track 2, T2-1 / B-329)
-- See: docs/monetization-and-throttling-requirements.md §4.2 (the table + the
--      six seeded keys) and §4.1 (the lever hierarchy this sits in).
--      Strategy provenance: docs/monetization-and-ai-gating-strategy.md (D-M4/§20).
-- ============================================================
-- This is the "product lever": a tiny key/value config table that lets the PM
-- switch any AI surface or the onboarding paywall on/off WITHOUT a new binary
-- build or an App Review cycle. Each Edge Function reads its own key(s) at
-- request time; the client reads the same rows only to shape UI (the function's
-- check is always authoritative — B-252, no gate ever trusts client state).
--
-- SHIP-DARK (spec §20 #1): every seeded value below matches today's live
-- behavior byte-for-byte. Creating this table changes nothing an owner can see.
-- Flipping a value later is its own deliberate, reviewed act — a documented
-- dashboard/SQL UPDATE recorded in STATUS.md — never a deploy side effect.
--
-- Scope: this PR is the SCHEMA HALF only (table + RLS + seeds), isolated per the
-- CLAUDE.md migration-isolation rule. The server reads (T2-3) and the client
-- reads / flag-aware states (T2-4) land in their own later PRs.
--
-- Migration Safety Pre-flight:
--   Destructive:  n  (purely additive — 1 new table + its RLS policy, trigger,
--                     and 6 seed rows; no existing column, type, table, or row
--                     is dropped, renamed, retyped, or altered.)
--   Rollback:     DROP TABLE IF EXISTS app_config;
--   Backfill:     N/A — one brand-new table; the six seed rows ship IN this
--                 migration (INSERT below). No existing data is read or written.
--   Affected tables: none existing. Row-count sanity check before applying:
--                 SELECT count(*) FROM app_config; -- expect: relation does not exist
-- ============================================================


-- ============================================================
-- app_config — key/value config, JSONB values
-- ============================================================
-- Global scope (no user_id / pet_id): this is app-wide product config, not
-- pet-scoped data — the closest precedent is the globally-scoped food_items
-- table (004_food_items_rls_insert.sql), read by everyone, owned by no one.
-- `value` is JSONB so a key can hold a bool (the enable flags) OR a nested
-- object (ai_caps) under one uniform read path.

CREATE TABLE app_config (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- Row Level Security — read-only to authenticated, write via service-role only
-- ============================================================
-- One SELECT policy for `authenticated`. All Edge Functions run verify_jwt=true
-- (a JWT-bearing request resolves to the `authenticated` role), so this covers
-- them; the service-role client bypasses RLS entirely for its own reads. There
-- are DELIBERATELY no INSERT/UPDATE/DELETE policies: with RLS enabled, the
-- absence of a write policy is a default-deny, so no authenticated client can
-- create, flip, or drop a config row from the app. Config is flipped only by
-- the service role (dashboard / SQL editor), which is exactly the intended
-- "product lever" control surface. (This is the mirror of the 009 food_items
-- lesson: be explicit about which write paths RLS opens — here, none.)

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_config_read_authenticated" ON app_config
  FOR SELECT
  TO authenticated
  USING (true);


-- ============================================================
-- updated_at trigger
-- ============================================================
-- Reuse set_updated_at() from 001_schema.sql. `updated_at` exists to record WHEN
-- a flag was last flipped (the STATUS.md-recorded config change, §4.2); a
-- dashboard UPDATE that forgot to set it by hand would leave that timestamp
-- stale, so the trigger stamps it on every write — the same server-write
-- discipline meals (016) and weight_checks (024) got.

CREATE TRIGGER trg_app_config_updated_at
  BEFORE UPDATE ON app_config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- Seed the six keys — every value matches today's behavior (ship-dark, §4.2)
-- ============================================================
-- JSONB literals: `true` for the boolean flags, `{}` for the (empty) cap-override
-- object. ON CONFLICT DO NOTHING makes the seed idempotent AND safe: if this
-- migration is ever re-applied after a value has been flipped in prod, it
-- preserves the live (flipped) value rather than resetting it to the seed.
--
--   ai_food_extraction_enabled  gates extract-food-from-photo (model call + capture affordance)
--   ai_med_extraction_enabled   gates extract-medication-from-photo (same shape)
--   ai_vomit_read_enabled       gates the analyze-vomit DESCRIPTIVE read ONLY — never the
--                               deterministic escalation (§3.1 rule 1: escalation is free forever)
--   ai_signal_phrasing_enabled  off => generate-signal falls back to template phrasing
--                               (already an invisible degradation; detection is never gated)
--   paywall_enabled             gates app/onboarding/paywall.tsx. Seeded true (ship-dark);
--                               the client FALLBACK when config is unreachable is fail-CLOSED
--                               (false) — a dead trial CTA is a Guideline 2.1/3.1.2 risk (B-330),
--                               a skipped paywall is merely one fewer screen. That fallback lives
--                               in client code (T2-4/T2-5), not here — the SEED is true.
--   ai_caps                     optional per-function cap overrides (same shape as §4.4); empty
--                               object => code-default caps apply. Lets the PM tune a cap without
--                               a deploy.

INSERT INTO app_config (key, value) VALUES
  ('ai_food_extraction_enabled', 'true'::jsonb),
  ('ai_med_extraction_enabled',  'true'::jsonb),
  ('ai_vomit_read_enabled',      'true'::jsonb),
  ('ai_signal_phrasing_enabled', 'true'::jsonb),
  ('paywall_enabled',            'true'::jsonb),
  ('ai_caps',                    '{}'::jsonb)
ON CONFLICT (key) DO NOTHING;
