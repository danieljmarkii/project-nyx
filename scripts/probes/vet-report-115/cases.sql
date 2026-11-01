-- Probe cases for migration 115 (CUL-2337). Runs after 113's bootstrap.sql,
-- 104, 110, 113, 114 and 115 have been replayed. Every case runs in its own
-- subtransaction and is rolled back, so cases never depend on each other; the
-- seed rows below are the only shared state. Each records the result it got
-- against the one it wants; the run fails on any mismatch.
--
-- M*: moving a pet's owner, every role and every statement shape.
-- S*: the writes that must still pass (the sync upsert re-sending user_id,
--     ordinary edits).
-- X*: the measured attack end to end, and account deletion.
-- With MIGRATION_115=/dev/null every M* case that wants 23514 gets 'ok' (the
-- client's M5 gets 42501 from pets_owner's check, M7 23502) and X1 finds the pet
-- B's with its kept copy gone: the probe sees the hole 115 closes.

CREATE TABLE probe_results (n serial, label text, who text, want text, got text, msg text, stmt text);

CREATE FUNCTION probe(label text, who text, sub uuid, stmt text, want text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  got text;
  m   text;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', coalesce(sub::text, ''), true);
    IF who <> 'postgres' THEN
      EXECUTE format('SET LOCAL ROLE %I', who);
    END IF;
    EXECUTE stmt;
    RAISE EXCEPTION 'probe_ok';
  EXCEPTION WHEN others THEN
    IF SQLERRM = 'probe_ok' THEN got := 'ok'; m := ''; ELSE got := SQLSTATE; m := SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  INSERT INTO probe_results (label, who, want, got, msg, stmt) VALUES (label, who, want, got, m, stmt);
END;
$$;

-- The bootstrap's pets carries only id and user_id; the app's ordinary edits
-- write other columns, so two of them are added here (probe-local).
ALTER TABLE public.pets ADD COLUMN weight_kg numeric(5,2), ADD COLUMN is_active boolean NOT NULL DEFAULT true;

-- Fixed ids (113's): A = aaaaaaaa-…, the owner. B = bbbbbbbb-…, the other
-- account. PA = a1… A's pet. PB = b1… B's pet. RD = d1… draft of PA.
-- RK = d2… kept copy of PA.
INSERT INTO auth.users VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO public.pets (id, user_id) VALUES
  ('a1a1a1a1-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('b1b1b1b1-0000-4000-8000-000000000003', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO public.vet_reports
  (id, pet_id, generated_by, date_range_start, date_range_end, storage_path,
   report_version, renderer_fingerprint, params, scope_basis)
VALUES
  ('d1d1d1d1-0000-4000-8000-000000000009', 'a1a1a1a1-0000-4000-8000-000000000001',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-09-01', '2026-10-30',
   'a1a1a1a1-0000-4000-8000-000000000001/d1d1d1d1-0000-4000-8000-000000000009.html',
   'v2', 'fp-1', '{}', 'since_last_visit');
INSERT INTO public.vet_reports
  (id, pet_id, generated_by, date_range_start, date_range_end, storage_path,
   report_version, renderer_fingerprint, params, scope_basis, status, snapshot,
   short_id, shared_via, shared_at, ai_lead_text, ai_lead_verdict, ai_lead_model,
   content_sha256)
VALUES
  ('d2d2d2d2-0000-4000-8000-00000000000a', 'a1a1a1a1-0000-4000-8000-000000000001',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-09-01', '2026-10-30',
   'a1a1a1a1-0000-4000-8000-000000000001/d2d2d2d2-0000-4000-8000-00000000000a.pdf',
   'v2', 'fp-1', '{}', 'since_last_visit', 'kept', '{"facts":[1]}', 'K7Q2',
   'share_sheet', now(), 'Cooper vomited 4 times.', '{"pass":true}', 'model-x',
   repeat('ab', 32));

-- M6's vehicle: a DEFINER function that moves the pet, callable by the
-- service role (runs as the migration owner).
CREATE FUNCTION public.probe_move() RETURNS void LANGUAGE sql SECURITY DEFINER
  SET search_path = '' AS $f$
  UPDATE public.pets SET user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
   WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001' $f$;
GRANT EXECUTE ON FUNCTION public.probe_move() TO service_role;

\o /dev/null
-- ── M: moving the owner is refused, every role, every shape ─────────────────
SELECT probe('M1: service role moves A''s pet to B (the measured attack)', 'service_role', NULL,
  $$UPDATE public.pets SET user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
     WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001'$$, '23514');
SELECT probe('M2: migration owner moves A''s pet to B', 'postgres', NULL,
  $$UPDATE public.pets SET user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
     WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001'$$, '23514');
SELECT probe('M3: service role moves it inside an upsert (ON CONFLICT DO UPDATE)', 'service_role', NULL,
  $$INSERT INTO public.pets (id, user_id)
     VALUES ('a1a1a1a1-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
     ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id$$, '23514');
SELECT probe('M4: service role moves it in a multi-column UPDATE', 'service_role', NULL,
  $$UPDATE public.pets SET weight_kg = 12.3, user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
     WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001'$$, '23514');
SELECT probe('M5: owner (client) gives the pet to B', 'authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  $$UPDATE public.pets SET user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
     WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001'$$, '23514');
SELECT probe('M6: a DEFINER function moves it, called by the service role', 'service_role', NULL,
  $$SELECT public.probe_move()$$, '23514');
SELECT probe('M7: moving it to NULL (the BEFORE trigger answers ahead of NOT NULL)', 'service_role', NULL,
  $$UPDATE public.pets SET user_id = NULL
     WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001'$$, '23514');
SELECT probe('M8: the refusal names no value (C-31)', 'service_role', NULL,
  $q$DO $b$ BEGIN
      BEGIN
        UPDATE public.pets SET user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
         WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001';
      EXCEPTION WHEN check_violation THEN
        IF SQLERRM ~ '[0-9a-f]{8}-' THEN RAISE EXCEPTION 'message leaks: %', SQLERRM; END IF;
        RETURN;
      END;
      RAISE EXCEPTION 'not refused';
    END $b$$q$, 'ok');

-- ── S: the writes that must still pass ───────────────────────────────────────
SELECT probe('S1: sync-shaped upsert re-sending the same user_id', 'authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  $$INSERT INTO public.pets (id, user_id, weight_kg)
     VALUES ('a1a1a1a1-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 9.5)
     ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, weight_kg = EXCLUDED.weight_kg$$, 'ok');
SELECT probe('S2: service-role upsert re-sending the same user_id', 'service_role', NULL,
  $$INSERT INTO public.pets (id, user_id, weight_kg)
     VALUES ('a1a1a1a1-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 9.5)
     ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, weight_kg = EXCLUDED.weight_kg$$, 'ok');
SELECT probe('S3: UPDATE that sets user_id to its own value', 'authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  $$UPDATE public.pets SET user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', weight_kg = 10
     WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001'$$, 'ok');
SELECT probe('S4: owner''s weight edit (log.tsx)', 'authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  $$UPDATE public.pets SET weight_kg = 11 WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001'$$, 'ok');
SELECT probe('S5: owner archives the pet (ArchivePetSheet)', 'authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  $$UPDATE public.pets SET is_active = false WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001'$$, 'ok');
SELECT probe('S6: client insert of a new pet (add-pet)', 'authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  $$INSERT INTO public.pets (user_id) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$, 'ok');
SELECT probe('S7: 104 still refuses an id change (two triggers coexist)', 'service_role', NULL,
  $$UPDATE public.pets SET id = 'c1c1c1c1-0000-4000-8000-000000000099'
     WHERE id = 'b1b1b1b1-0000-4000-8000-000000000003'$$, '23514');

-- ── X: the measured attack end to end, and account deletion ─────────────────
SELECT probe('X1: move to B then delete A: the pet never becomes B''s with its rows gone', 'service_role', NULL,
  $q$DO $b$ BEGIN
      BEGIN
        UPDATE public.pets SET user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
         WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001';
      EXCEPTION WHEN check_violation THEN NULL;
      END;
      DELETE FROM auth.users WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      -- The pet is still A's, so A's deletion takes it and its rows with it,
      -- which is the deletion contract. The hole was B's pet losing its rows
      -- while B's account stands: assert the pet was never B's.
      IF EXISTS (SELECT 1 FROM public.pets
                  WHERE user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
                    AND id = 'a1a1a1a1-0000-4000-8000-000000000001') THEN
        RAISE EXCEPTION 'pet moved to B and survived A''s deletion without its rows';
      END IF;
    END $b$$q$, 'ok');
SELECT probe('X2: account deletion removes A''s pets and both report rows', 'service_role', NULL,
  $q$DO $b$ BEGIN
      DELETE FROM auth.users WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      IF EXISTS (SELECT 1 FROM public.pets WHERE user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
         OR EXISTS (SELECT 1 FROM public.vet_reports WHERE pet_id = 'a1a1a1a1-0000-4000-8000-000000000001') THEN
        RAISE EXCEPTION 'deletion left rows';
      END IF;
    END $b$$q$, 'ok');
SELECT probe('X3: B''s account deletion leaves A''s pet and both report rows', 'service_role', NULL,
  $q$DO $b$ BEGIN
      DELETE FROM auth.users WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
      IF (SELECT count(*) FROM public.vet_reports WHERE pet_id = 'a1a1a1a1-0000-4000-8000-000000000001') <> 2
         OR NOT EXISTS (SELECT 1 FROM public.pets WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001') THEN
        RAISE EXCEPTION 'B''s deletion touched A''s rows';
      END IF;
    END $b$$q$, 'ok');

\o
\echo
SELECT n, CASE WHEN want = got THEN 'PASS' ELSE 'FAIL' END AS r, label, who, want, got,
       left(msg, 100) AS msg
  FROM probe_results ORDER BY n;
SELECT count(*) FILTER (WHERE want = got) AS pass, count(*) FILTER (WHERE want <> got) AS fail
  FROM probe_results \gset
\echo PASS :pass FAIL :fail
SELECT :fail = 0 AS all_pass \gset
\if :all_pass
\else
  \echo PROBE FAILED
  SELECT 1/0;
\endif
