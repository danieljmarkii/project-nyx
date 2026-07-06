-- ============================================================
-- user_profiles — owner identity + durable onboarding-complete flag
-- Onboarding revamp: B-251 PR 1 (docs/nyx-onboarding-requirements.md §4/§9).
-- ============================================================
-- Additive, schema-isolated. Captures the owner's name at account
-- creation and records — durably — that a user finished onboarding.
--
--   first_name / last_name    — owner identity, captured on the account
--                               screen. A derived `display_name =
--                               trim(first_name || ' ' || last_name)` is
--                               written alongside, so generate-report's
--                               existing display_name read (the vet-report
--                               "Owner:" line, §7.1) keeps working with no
--                               report-side change.
--   onboarding_completed_at   — set once, when the user reaches the "All
--                               set" screen. Replaces the fragile "user has
--                               >=1 pet" inference in hooks/usePet.ts, which
--                               silently treats a mid-flow quit as complete.
--                               Routing rule (§6): onboarding is complete
--                               iff this is set; a legacy account (has a
--                               pet, null completion) is treated complete
--                               and never re-onboarded.
--
-- All three columns are NULLABLE with NO default:
--   • Existing accounts keep null names + a null onboarding_completed_at.
--     They predate this flow, so §6's legacy rule (null completion + has a
--     pet => complete) covers them — no backfill needed.
--   • user_profiles already has an owner-scoped RLS policy
--     (user_profiles_owner, FOR ALL USING auth.uid() = id, migration
--     001_schema.sql). New columns inherit it; this migration adds no
--     policy and widens nothing.
--
-- Migration Safety Pre-flight (CLAUDE.md):
--   Destructive: n  (three ADD COLUMNs; no drop, rename, or type change)
--   Nullable, no default: yes
--   Backfill: N/A  (existing rows keep null; legacy routing handles them)
--   Rollback:
--     ALTER TABLE user_profiles DROP COLUMN onboarding_completed_at;
--     ALTER TABLE user_profiles DROP COLUMN last_name;
--     ALTER TABLE user_profiles DROP COLUMN first_name;
-- ============================================================

ALTER TABLE user_profiles
  ADD COLUMN first_name              TEXT,
  ADD COLUMN last_name               TEXT,
  ADD COLUMN onboarding_completed_at TIMESTAMPTZ;
