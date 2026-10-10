-- ============================================================
-- Migration 098: EN-10 goes live for the PM's account
--   (Engines v3 PR-45)
-- See: CUL-1727 (the row, the plan, the gate check, the PM's ruling B
--      2026-10-10); CUL-1140 (EN-10, the counts-only context lines;
--      PR-22 server, PR-38 app); CUL-1440 (no zero beside a masking drug
--      or a recent visit, the flip's gate, Done);
--      075_engines_v3_stamps.sql §1 (the flag's shape and its rules).
-- ============================================================
--
-- WHAT IT DOES
-- ------------------------------------------------------------
-- Seeds `engines_v3_en10` as {"enabled": false, "allowlist": ["<PM uid>"]}.
-- resolveAllowlistFlag (_shared/flags.ts) reads that as on for the PM's
-- account alone, so generate-signal writes EN-10's context lines on the PM's
-- findings from the next run on. Every other account stays exactly as today:
-- no row reads as off (the flag fails closed), and so does an allowlist that
-- does not name the caller.
--
-- WHY THE UID IS LOOKED UP, NOT WRITTEN (ruling B, CUL-1727): 075 keeps a uid
-- out of every committed migration. The owner is named here by email (already
-- in git, scripts/export-pet-timeline.sql) and resolved at apply time, so the
-- allowlist lands in this one reviewed write instead of a second hand-run
-- config UPDATE.
--
-- WHY IT RAISES: an email that matches no user, or more than one, would seed
-- an allowlist that never matches, recorded as applied: a go-live that never
-- happened (096's reasoning). Exactly one match or nothing is written. Zero
-- rows is never read as "fine" (C-27).
--
-- RE-APPLY: ON CONFLICT DO NOTHING, so a re-applied seed never resets a live
-- row (075's second rule). A row that already exists is left as it is and the
-- migration says so in a NOTICE; the VERIFY below reads what is there.
--
-- NEVER THE DEMO ACCOUNT (GAP-26 / B-744): app_config is readable by every
-- signed-in client, so the allowlist is the PM's uid alone until CUL-489 moves
-- cohorts somewhere private. The single-email lookup makes any other account
-- unreachable by construction.
--
-- NOT YET EVERY ACCOUNT: CUL-1429 gates `enabled: true`. With this key on, a
-- finding's careContext lines ride ai_signals.findings into Ask verbatim, which
-- first puts a visit date in front of Ask's model, and Ask's answer screen
-- (lib/careClaimScreens.ts) still passes "Since the Sep 16 visit, 0 vomiting
-- episodes are logged." Known and dogfooded on the PM's account; fixed before
-- the every-account row.
--
-- ------------------------------------------------------------
-- Migration Safety Pre-flight
-- ------------------------------------------------------------
--   Destructive:  n (one config row inserted; nothing altered or removed).
--   Rollback:     DELETE FROM public.app_config WHERE key = 'engines_v3_en10';
--                 Takes effect on the next Signal run (the flag is read per
--                 request). Signal rows written while on keep their lines and
--                 their engine_flags stamp, by design (075).
--   Backfill:     N/A. Cached Signal rows are rewritten only by the engine's
--                 own next run.
--   Affected tables: app_config (INSERT, one row). Check before applying:
--                   SELECT key FROM public.app_config WHERE key = 'engines_v3_en10';
--                   -- 0 rows
-- ============================================================

DO $$
DECLARE
  n   integer;
  uid uuid;
  inserted integer;
BEGIN
  SELECT count(*), min(id::text)::uuid INTO n, uid
    FROM auth.users
   WHERE email = 'danieljmarkii@gmail.com';
  IF n <> 1 THEN
    RAISE EXCEPTION 'engines_v3_en10: expected one owner account, found %', n;
  END IF;

  INSERT INTO public.app_config (key, value) VALUES
    ('engines_v3_en10',
     jsonb_build_object('enabled', false, 'allowlist', jsonb_build_array(uid::text)))
  ON CONFLICT (key) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted = 0 THEN
    RAISE NOTICE 'engines_v3_en10: a row already exists and was left unchanged';
  END IF;
END $$;


-- ------------------------------------------------------------
-- VERIFY (run after applying; read-only)
-- ------------------------------------------------------------
--   SELECT value->'enabled' AS enabled,
--          jsonb_array_length(value->'allowlist') AS n,
--          value->'allowlist'->>0 = (SELECT id::text FROM auth.users
--                                     WHERE email = 'danieljmarkii@gmail.com') AS is_pm
--     FROM public.app_config WHERE key = 'engines_v3_en10';
--     -- false | 1 | true
