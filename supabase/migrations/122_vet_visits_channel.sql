-- ============================================================
-- Migration 122: vet_visits.channel + vet_visits.contacted_at, and the
--   vet_contacts_enabled flag seed
--   (CUL-2764, PR-02 of the Vet contacts project)
-- See: docs/nyx-vet-contacts-requirements.md §3 (this change), R9 (a channel
--      field on vet_visits, not a contacts table), §5.3 (every exam reader
--      filters to in_clinic, held by guards/visitReaders.test.ts in PR-03).
-- ============================================================
--
-- WHAT THIS ADDS
-- ------------------------------------------------------------
-- Two columns on vet_visits and one app_config row. No table, policy, grant,
-- trigger, index or function changes.
--
--   channel       how the owner heard from the vet. Default 'in_clinic', so
--                 every row written before this column reads as the visit it
--                 was. Only 'in_clinic' is an exam.
--   contacted_at  the optional time of a contact; NULL = day only. The day
--                 itself stays in visited_at (DATE), unchanged.
--
-- RLS: unchanged. These are columns on an owned table; the existing policies
-- and the same-pet triggers on medications / diet_trials / vet_documents /
-- care_acknowledgements .vet_visit_id cover a contact row exactly as they
-- cover a visit. Deletion and export: the columns ride vet_visits' existing
-- ON DELETE CASCADE from pets and its export scope.
--
-- No backfill: the default is the truth for every existing row.
--
-- LOCK: ADD COLUMN with a constant default is a catalog-only change on
-- Postgres 11+ (no rewrite). The CHECK validates existing rows under the
-- ACCESS EXCLUSIVE lock the ALTER already holds; every row carries the
-- default, so it passes immediately.
--
-- The flag seed mirrors 111 (report_composer_v2): off, empty allowlist,
-- ON CONFLICT DO NOTHING so a re-run never flips a live value.
--
-- ROLLBACK (destructive: n):
--   ALTER TABLE vet_visits DROP COLUMN contacted_at, DROP COLUMN channel;
--   DELETE FROM app_config WHERE key = 'vet_contacts_enabled';
-- ============================================================

ALTER TABLE vet_visits
  ADD COLUMN channel TEXT NOT NULL DEFAULT 'in_clinic'
    CHECK (channel IN ('in_clinic', 'phone', 'text', 'email')),
  ADD COLUMN contacted_at TIMESTAMPTZ;

COMMENT ON COLUMN vet_visits.channel IS
  'How the owner heard from the vet (CUL-2749). Only in_clinic is an exam: every reader that means "an exam happened" (the report window, since-the-last-visit, care state visit dates) filters to in_clinic, held by guards/visitReaders.test.ts. Default in_clinic, so every row before this column reads as the visit it was.';

COMMENT ON COLUMN vet_visits.contacted_at IS
  'The optional time of a contact (CUL-2749), UTC. NULL = the owner gave the day only; the day itself is visited_at. Never used to date or re-date the report window.';

INSERT INTO app_config (key, value) VALUES
  ('vet_contacts_enabled', '{"enabled": false, "allowlist": []}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- VERIFY (run after apply)
-- ------------------------------------------------------------
-- 1. Both columns exist with the expected shape:
--    SELECT column_name, data_type, is_nullable, column_default
--    FROM information_schema.columns
--    WHERE table_name = 'vet_visits' AND column_name IN ('channel', 'contacted_at');
--    -- expect: channel text NO 'in_clinic'::text ; contacted_at timestamp with time zone YES NULL
-- 2. Every existing row reads in_clinic:
--    SELECT channel, count(*) FROM vet_visits GROUP BY channel;
--    -- expect: one row, in_clinic
-- 3. The flag is seeded off:
--    SELECT value FROM app_config WHERE key = 'vet_contacts_enabled';
--    -- expect: {"enabled": false, "allowlist": []}
-- 4. No policy or grant changed:
--    SELECT policyname FROM pg_policies WHERE tablename = 'vet_visits';
--    -- expect: the same set as before apply
-- ============================================================
