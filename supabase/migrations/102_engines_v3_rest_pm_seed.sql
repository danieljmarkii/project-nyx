-- ============================================================
-- Migration 102: the rest of Engines v3 goes live for the PM's account
-- See: CUL-1407 (the PM's "enable all of v3 for my acct", 2026-10-11);
--      _shared/engineFlags.ts (each key's scope and its stated go-live gate);
--      101_engines_v3_en3_seed.sql / 098 (the shape this copies).
-- ============================================================
--
-- WHAT IT DOES
-- ------------------------------------------------------------
-- Puts the PM's uid on the allowlist of every Engines v3 key not yet on for
-- that account, leaving `enabled` false so every other account stays off:
--   engines_v3_en4   EN-4, the vomit floor (seeded here)
--   engines_v3_en8   EN-8, the weight lane (seeded here)
--   engines_v3_en9   EN-9, the care state (seeded here)
--   engines_v3_en11  EN-11, insight honesty; the Signal AND the vet report (seeded here)
--   engines_v3_en5   EN-5, intake evidence (seeded off by 097; uid appended here)
-- en0 is already enabled for everyone; en3 (101) and en10 (098) already name the PM.
--
-- GATES THE PM WAIVED FOR THIS ONE ACCOUNT (engineFlags.ts states each; none is
-- waived for any other account, and none of these keys reaches `enabled: true`):
--   en8   PMD-9 re-run on lib/weightStory.ts's definition, by weighing cadence (W1)
--   en9   PR-16's combined 5% line on a corpus with null diarrhea / lethargy /
--         refused or picked ratings (CUL-1417, PM 10/02)
--   en5   EN-8 live with it, plus the E-6 harness proof for a change that fires less
--   en11  the 1.2.0 App Review: the demo pet's beef card is Early. Not reached here,
--         because the demo account is never on the allowlist (GAP-26).
--   en4   none left: its vet-review gate went with CUL-1312 (PM, 2026-10-02) and
--         both halves are Done (CUL-1435, CUL-1436).
--
-- WHY THE UID IS LOOKED UP, NOT WRITTEN: 098's ruling B. Exactly one match or
-- nothing is written (C-27), and the closing check RAISEs unless every key
-- now names the PM, so a partial go-live is never recorded as applied.
--
-- RE-APPLY: inserts are ON CONFLICT DO NOTHING; en5's append skips when the uid
-- is already there. Nothing ever flips `enabled`.
--
-- NEVER THE DEMO ACCOUNT (GAP-26): app_config is readable by every signed-in
-- client; the single-email lookup is the only uid this file can write.
--
-- ------------------------------------------------------------
-- Migration Safety Pre-flight
-- ------------------------------------------------------------
--   Destructive:  n (four config rows inserted; one row's allowlist appended).
--   Rollback:     DELETE FROM public.app_config
--                  WHERE key IN ('engines_v3_en4','engines_v3_en8',
--                                'engines_v3_en9','engines_v3_en11');
--                 UPDATE public.app_config
--                    SET value = '{"enabled": false, "allowlist": []}'::jsonb
--                  WHERE key = 'engines_v3_en5';
--                 Each takes effect on the next read or Signal run. Rows written
--                 while on keep their engine_flags stamp, by design (075).
--   Backfill:     N/A. Reads and Signal rows are rewritten only by their next run.
--   Affected tables: app_config. Check before applying:
--     SELECT key, value FROM public.app_config
--      WHERE key IN ('engines_v3_en4','engines_v3_en5','engines_v3_en8',
--                    'engines_v3_en9','engines_v3_en11');
--     -- one row: engines_v3_en5 | {"enabled": false, "allowlist": []}
-- ============================================================

DO $$
DECLARE
  n   integer;
  uid uuid;
  k   text;
  missing text[];
BEGIN
  SELECT count(*), min(id::text)::uuid INTO n, uid
    FROM auth.users
   WHERE email = 'danieljmarkii@gmail.com';
  IF n <> 1 THEN
    RAISE EXCEPTION 'engines_v3 PM seed: expected one owner account, found %', n;
  END IF;

  FOREACH k IN ARRAY ARRAY['engines_v3_en4','engines_v3_en8','engines_v3_en9','engines_v3_en11'] LOOP
    INSERT INTO public.app_config (key, value) VALUES
      (k, jsonb_build_object('enabled', false, 'allowlist', jsonb_build_array(uid::text)))
    ON CONFLICT (key) DO NOTHING;
  END LOOP;

  UPDATE public.app_config
     SET value = jsonb_set(value, '{allowlist}',
                           COALESCE(value->'allowlist', '[]'::jsonb) || to_jsonb(uid::text))
   WHERE key = 'engines_v3_en5'
     AND NOT COALESCE(value->'allowlist', '[]'::jsonb) ? uid::text;

  SELECT array_agg(want.k) INTO missing
    FROM unnest(ARRAY['engines_v3_en4','engines_v3_en5','engines_v3_en8',
                      'engines_v3_en9','engines_v3_en11']) AS want(k)
    LEFT JOIN public.app_config c ON c.key = want.k
   WHERE c.key IS NULL
      OR NOT (COALESCE(c.value->'allowlist', '[]'::jsonb) ? uid::text
              OR (c.value->>'enabled')::boolean IS TRUE);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'engines_v3 PM seed: not on for the owner after the write: %', missing;
  END IF;
END $$;


-- ------------------------------------------------------------
-- VERIFY (run after applying; read-only)
-- ------------------------------------------------------------
--   SELECT key, value->'enabled' AS enabled,
--          value->'allowlist' ? (SELECT id::text FROM auth.users
--                                 WHERE email = 'danieljmarkii@gmail.com') AS has_pm,
--          jsonb_array_length(value->'allowlist') AS n
--     FROM public.app_config WHERE key LIKE 'engines_v3_%' ORDER BY key;
--     -- en0 true; every other key false | true | 1
