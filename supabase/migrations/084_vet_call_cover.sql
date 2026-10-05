-- ============================================================
-- 084: a call's cover, stored on the call (Engines v3, CUL-1602 part 1 = CUL-1605)
-- ============================================================
-- Spec: docs/nyx-care-state-requirements.md §6.1 and §6.3 ("the escalation as shown … at
-- the moment 'I've called' was tapped, never its current tier"). PM ruling 2026-10-05 on
-- CUL-1604 (A: hold PR-36, store the cover on the server, rebuild the client on it).
--
-- APPLIED to production 2026-10-05 via the Supabase MCP on the PM's word, live version
-- 20261005201950, name vet_call_cover. The statements that ran are this file's with the
-- comments stripped; comments added after the apply change no statement. The table held 0
-- rows at apply time, the VERIFY block below passed on the live database, and get_advisors
-- (security, performance) reported nothing new for vet_calls.
--
-- WHY. A call answers ONE escalation: the reads of one bout of one incident family, up to
-- the rank the owner was shown when she tapped "I've called". 082 stored only the call's
-- anchor event, so every phone had to RECOMPUTE what a call covered from per-incident reads
-- whose tier keeps moving (a re-floor raises it, a re-read lowers it, a late read lands
-- before it). PR-36's five adversarial passes (2026-10-05, the session record on #1072) broke
-- on that recomputation every time: a call that covered a read on one day stopped covering
-- it the next, and a second phone could not tell which escalation a pulled call belonged to,
-- so "What did the vet say?" was asked again after it was answered. Recomputation cannot be
-- patched into a fixed fact; storing it can.
--
-- WHAT. Two columns on the ROOT call (the "I've called" row):
--   covers_rank  1 = call today, 2 = call now (the incident-tier rank, lib/incidentTier.ts
--                TIER_RANK): the loudest rank the call answers, as shown at the tap.
--   covers_from  the bout's first read's time, as shown at the tap. The call covers a read
--                of its anchor's family whose time is in [covers_from, covers_from + 24 h]
--                and whose rank is at most covers_rank. Every phone reads the same two
--                values, so coverage is the same everywhere and never moves afterwards.
-- A note edit or an Undo is a later row naming the root in `supersedes` (082) and carries
-- NEITHER: the cover belongs to the call, not to its corrections, so a correction can never
-- move it. The CHECK below holds both directions.
--
-- WHAT THIS DOES NOT DO. The client (writing, pulling and reading the cover) is PR-36,
-- CUL-1419, rebuilt on these columns and re-reviewed. No server reader exists: the shell
-- reads no call (082's header, guards/careRecord.test.ts). No new table, policy, trigger,
-- function, bucket or secret.
--
-- PRIVACY (R-5). Two scalars, written by the owner's own client on her own row under 082's
-- RLS and same-pet guard. They name no parent, so no lookup and no cross-account oracle is
-- added. They say only what the call already implied (a call was made about a call-tier
-- read at about this time). Covered by 082's deletion cascade from pets and events.
--
-- ------------------------------------------------------------
-- MIGRATION SAFETY PRE-FLIGHT
-- ------------------------------------------------------------
--   Destructive:  n. Two nullable columns, two CHECKs, one column-level grant.
--   Row check:    vet_calls held 0 rows on 2026-10-05 (read-only count via the MCP), and no
--                 shipped client writes it (PR-36 is unmerged). The strict CHECK is
--                 validated against those rows as it is added, so a non-empty table at
--                 apply time FAILS the migration rather than passing silently. If that
--                 happens, stop and ask: do not add NOT VALID to get past it.
--   Backfill:     N/A (no rows).
--   Rollback:     ALTER TABLE public.vet_calls
--                   DROP CONSTRAINT IF EXISTS vet_calls_cover_on_root_only,
--                   DROP COLUMN IF EXISTS covers_from,
--                   DROP COLUMN IF EXISTS covers_rank;
--                 (dropping the columns drops their column grants with them.) Irreversible
--                 for any cover written after the apply.
--   Ordering:     after 082 (the table) and 083. No client depends on it until PR-36 is
--                 rebuilt on it; PR-36 must not merge before this is applied.
--   Apply:        ON THE PM'S WORD ONLY (PM, 2026-10-05). Then run VERIFY and get_advisors.
-- ============================================================

-- ONE statement, on purpose: the columns and the CHECK land together or not at all. Split
-- across two statements, a non-empty table would keep the columns and fail the CHECK, a
-- half-applied migration (measured on a PG16 replay, 2026-10-05).
--
-- The cover lives on the root call, whole, and nowhere else. A root without one would be a
-- call nothing can match to a read; a correction with one could move a cover the household
-- already relies on.
ALTER TABLE public.vet_calls
  ADD COLUMN covers_rank SMALLINT CHECK (covers_rank IN (1, 2)),
  ADD COLUMN covers_from TIMESTAMPTZ,
  ADD CONSTRAINT vet_calls_cover_on_root_only CHECK (
    (supersedes IS NULL AND covers_rank IS NOT NULL AND covers_from IS NOT NULL)
    OR
    (supersedes IS NOT NULL AND covers_rank IS NULL AND covers_from IS NULL)
  );

COMMENT ON COLUMN public.vet_calls.covers_rank IS
  'CUL-1602 (084): the loudest rank this call answers, as shown when "I''ve called" was tapped (1 = call today, 2 = call now; lib/incidentTier.ts TIER_RANK). Set on the root call only; never on a note edit or an Undo (vet_calls_cover_on_root_only). Never recomputed from the reads'' current tier (§6.3).';
COMMENT ON COLUMN public.vet_calls.covers_from IS
  'CUL-1602 (084): the start of the bout this call answers, as shown at the tap. The call covers reads of its anchor''s family in [covers_from, covers_from + 24 h] at or below covers_rank (§6.1). Root call only.';

-- Extend 082's column list (082's MAINTENANCE WARNING: never a table-level INSERT, which
-- would re-cover created_at).
GRANT INSERT (covers_rank, covers_from) ON TABLE public.vet_calls TO authenticated;


-- ------------------------------------------------------------
-- VERIFY (run after applying; read-only)
-- ------------------------------------------------------------
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'vet_calls'
--      AND column_name IN ('covers_rank', 'covers_from') ORDER BY 1;
--     -- covers_from | timestamp with time zone | YES
--     -- covers_rank | smallint                 | YES
--   SELECT conname FROM pg_constraint
--    WHERE conrelid = 'public.vet_calls'::regclass AND contype = 'c' ORDER BY 1;
--     -- includes vet_calls_cover_on_root_only and vet_calls_covers_rank_check
--   SELECT column_name FROM information_schema.column_privileges
--    WHERE table_schema = 'public' AND table_name = 'vet_calls'
--      AND grantee = 'authenticated' AND privilege_type = 'INSERT' ORDER BY 1;
--     -- called_on, covers_from, covers_rank, event_id, id, note, pet_id, supersedes, withdrawn
--     -- (never created_at)
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--    WHERE table_name = 'vet_calls' AND grantee IN ('anon', 'authenticated') ORDER BY 1, 2;
--     -- authenticated | SELECT only (082 unchanged); anon: nothing
