-- ============================================================
-- ask_config — seed the two Ask feature flags (Ask / B-228, PR A1)
-- See: docs/nyx-ask-requirements.md §8 (the experimental-flag primitive +
--      the two seeded keys) and §12 A1 (this PR). Strategy provenance:
--      the same file's D1 (nested toggles) and D4 (Ask is the next main project).
-- ============================================================
-- Ask is Culprit's first open-ended conversational surface. It ships behind two
-- flags in the existing app_config table (030_app_config.sql):
--
--   ask_enabled          the main gate — is the Home "Ask" pill visible at all?
--   ask_general_enabled  the sub-gate — may Ask answer general (non-record)
--                        questions? Seeded off; its first flip-on is Dr. Chen-
--                        gated (§7.5). ask_enabled off => this is moot.
--
-- THE ALLOWLIST SHAPE (§8): unlike the six 030 keys (plain bools), these two
-- seed the experimental-flag primitive value shape —
--   {"enabled": bool, "allowlist": ["<user-uuid>", …]}
-- Resolution (implemented once in A2, client + server): enabled=true => on for
-- everyone; else on iff the caller's uid is in allowlist. Plain-bool values keep
-- resolving too (back-compat with all six existing keys). This lets the PM
-- dogfood Ask by adding a single uid to the allowlist — a recorded config UPDATE,
-- no deploy — before any broader rollout.
--
-- SHIP-DARK (§8, both off): {"enabled": false, "allowlist": []} means the pill
-- renders for no one. Creating these rows changes nothing an owner can see. The
-- Ask surface, tools, and Edge Function land in later PRs (A2–A8); flipping a
-- flag on is its own deliberate, recorded act, never a deploy side effect.
--
-- Scope: this PR is the SEED HALF only (two app_config rows), isolated per the
-- CLAUDE.md migration-isolation rule. No new table, column, type, or policy —
-- app_config already exists (030) with its read-only-to-authenticated RLS, which
-- these rows inherit unchanged.
--
-- Migration Safety Pre-flight:
--   Destructive:  n  (purely additive — 2 new seed rows in an existing table;
--                     no column, type, table, row, or policy is dropped,
--                     renamed, retyped, or altered.)
--   Rollback:     DELETE FROM app_config WHERE key IN
--                   ('ask_enabled', 'ask_general_enabled');
--   Backfill:     N/A — two brand-new config rows; no existing data is read or
--                 written.
--   Affected tables: app_config (INSERT only). Row-count sanity check before
--                 applying:
--                   SELECT key FROM app_config
--                   WHERE key IN ('ask_enabled','ask_general_enabled');
--                   -- expect: 0 rows (neither key exists yet)
-- ============================================================

-- ON CONFLICT DO NOTHING makes the seed idempotent AND safe: if this migration
-- is ever re-applied after a flag has been flipped/allowlisted in prod, it
-- preserves the live value rather than resetting it to the shipped-dark seed.
-- (Same discipline as the 030 seeds.)

INSERT INTO app_config (key, value) VALUES
  ('ask_enabled',         '{"enabled": false, "allowlist": []}'::jsonb),
  ('ask_general_enabled', '{"enabled": false, "allowlist": []}'::jsonb)
ON CONFLICT (key) DO NOTHING;
