-- ============================================================
-- Migration 096: EN-0 goes live for every account
--   (Engines v3 PR-40)
-- See: CUL-1726 (the row, the plan, the PM's `apply 096` 2026-10-10);
--      CUL-1130 (EN-0, the honest vomit read; PR-13a #979);
--      075_engines_v3_stamps.sql (the key this turns on).
-- ============================================================
--
-- WHAT IT DOES
-- ------------------------------------------------------------
-- Sets `enabled` to true on `engines_v3_en0`. resolveAllowlistFlag
-- (_shared/flags.ts) reads `enabled: true` as on for everyone, allowlist
-- ignored, so analyze-vomit runs EN-0's context step and copy for every
-- record's owner from the next read on.
--
-- WHY ONLY `enabled`: the allowlist holds the PM's uid, which 075 keeps out of
-- git (a committed uid, or a re-applied seed, must never set a live
-- allowlist). jsonb_set leaves it exactly as production holds it.
--
-- WHY IT RAISES: a missing or malformed row would otherwise leave EN-0 dark
-- with the migration recorded as applied. The flag fails closed, so a silent
-- no-op here is a go-live that never happened.
--
-- ON ITS OWN PROOF (E-1 = A amended, 2026-09-26): EN-0 only removes a false
-- statement and can never remove a warning. Re-proven on main 2026-10-10 by
-- scripts/engine-replay/incidentReplay.deno.ts over the PM's pet: EN-0 lost
-- escalations 0 over 46 reads (CUL-1726's plan comment carries the fidelity
-- note and CUL-1730 the replay-tooling fix it found).
--
-- ------------------------------------------------------------
-- Migration Safety Pre-flight
-- ------------------------------------------------------------
--   Destructive:  n (one config value; no column, no row removed).
--   Rollback:     UPDATE public.app_config
--                    SET value = jsonb_set(value, '{enabled}', 'false'::jsonb)
--                  WHERE key = 'engines_v3_en0';
--                 Takes effect on the next read (the flag is read per request).
--                 Reads written while on keep their words and their
--                 engine_flags stamp, by design.
--   Backfill:     N/A. Stored reads are never rewritten (CUL-1406 owns those).
--   Affected tables: app_config (UPDATE, one row). Check before applying:
--                   SELECT value FROM app_config WHERE key = 'engines_v3_en0';
--                   -- {"enabled": false, "allowlist": [<the PM's uid>]}
-- ============================================================

DO $$
DECLARE
  n integer;
BEGIN
  UPDATE public.app_config
     SET value = jsonb_set(value, '{enabled}', 'true'::jsonb)
   WHERE key = 'engines_v3_en0'
     AND jsonb_typeof(value) = 'object';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'engines_v3_en0: expected one row to turn on, found %', n;
  END IF;
END $$;
