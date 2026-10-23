-- ============================================================
-- Migration 101: EN-3 + EN-7 go live for the PM's account
--   (Engines v3 PR-41, Wave 4)
-- See: CUL-1407 (the row, the seed gates, the PM's go 2026-10-11);
--      CUL-1133 (EN-3, the four dispositions) and CUL-1138 (EN-7, the stool
--      spill-over fix), gated together by PR-26;
--      CUL-1513 / #1134 (PR-27k, the go-live date lines read `live_since`);
--      CUL-1511 / #1147 (PR-30a, the installed-build floor);
--      098_engines_v3_en10_seed.sql (the shape this copies).
-- ============================================================
--
-- WHAT IT DOES
-- ------------------------------------------------------------
-- Seeds `engines_v3_en3` as
--   {"enabled": false, "allowlist": ["<PM uid>"], "live_since": "<apply day>"}.
-- The allowlist reads as on for the PM's account alone, so analyze-vomit /
-- analyze-stool dual-write the tier beside the verdict and EN-7's stool fix
-- runs, from the next read on. Every other account stays exactly as today:
-- an allowlist that does not name the caller reads as off.
--
-- WHY THE UID IS LOOKED UP, NOT WRITTEN: 098's ruling B. The owner is named by
-- email and resolved at apply time. Exactly one match or nothing is written;
-- zero rows is never read as "fine" (C-27).
--
-- WHY `live_since` IS THE UTC DATE AT APPLY TIME: the field must be the flip day
-- or a later day, never an earlier one (CUL-1407, PR-27k comment). Each phone
-- reads it as local midnight. For a US-based reader the UTC date is never earlier
-- than the local date, so it is the flip day or the next day. The next day is the
-- safe side: a tiered (new-rule) read never carries "Read under the earlier rule"
-- (lib/ruleSeam.ts, isTieredRow), so a late day only hides the "New since" and
-- calendar seam lines for a few hours. An early day would label a pre-flip read
-- as new-rule, which is false. The day is a data-only edit later if wanted.
--
-- THE BUILD FLOOR (CUL-1407, PR-30a comment): a build without PR-30a renders a
-- record-raised call as a photo red flag. Apply only once the PM's installed
-- build carries #1147 (1.2.0 from main at or after 29927f3).
--
-- RE-APPLY: ON CONFLICT DO NOTHING, so a re-applied seed never resets a live
-- row (075's second rule). An existing row is left as it is, with a NOTICE.
--
-- NEVER THE DEMO ACCOUNT (GAP-26): app_config is readable by every signed-in
-- client, so the allowlist is the PM's uid alone. The single-email lookup makes
-- any other account unreachable by construction.
--
-- ------------------------------------------------------------
-- Migration Safety Pre-flight
-- ------------------------------------------------------------
--   Destructive:  n (one config row inserted; nothing altered or removed).
--   Rollback:     DELETE FROM public.app_config WHERE key = 'engines_v3_en3';
--                 Takes effect on the next read (the flag is read per request).
--                 Rows written while on keep their tier and engine_flags stamp,
--                 by design (075).
--   Backfill:     N/A. Existing reads are rewritten only by their own next read.
--   Affected tables: app_config (INSERT, one row). Check before applying:
--                   SELECT key FROM public.app_config WHERE key = 'engines_v3_en3';
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
    RAISE EXCEPTION 'engines_v3_en3: expected one owner account, found %', n;
  END IF;

  INSERT INTO public.app_config (key, value) VALUES
    ('engines_v3_en3',
     jsonb_build_object(
       'enabled', false,
       'allowlist', jsonb_build_array(uid::text),
       'live_since', to_char((now() AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD')))
  ON CONFLICT (key) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted = 0 THEN
    RAISE NOTICE 'engines_v3_en3: a row already exists and was left unchanged';
  END IF;
END $$;


-- ------------------------------------------------------------
-- VERIFY (run after applying; read-only)
-- ------------------------------------------------------------
--   SELECT value->'enabled' AS enabled,
--          jsonb_array_length(value->'allowlist') AS n,
--          value->'allowlist'->>0 = (SELECT id::text FROM auth.users
--                                     WHERE email = 'danieljmarkii@gmail.com') AS is_pm,
--          value->>'live_since' AS live_since
--     FROM public.app_config WHERE key = 'engines_v3_en3';
--     -- false | 1 | true | <apply day, UTC>
