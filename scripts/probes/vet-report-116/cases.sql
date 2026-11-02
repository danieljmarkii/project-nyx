-- Probe cases for migration 116 (CUL-2336, CUL-2375). Runs after 113's
-- bootstrap.sql, 104, 110, 113, 114, 115, seed.sql and 116 have been
-- replayed. Every case runs in its own subtransaction and is rolled back, so
-- cases never depend on each other; the seed rows are the only shared state.
-- Each records the result it got against the one it wants; the run fails on
-- any mismatch.
--
-- D*: a client deleting a pet (CUL-2336, ruling (a)).
-- X*: deleting a pet and inserting its id again, every role and shape
--     (CUL-2375), and the end-to-end file claim it led to.
-- B*: the backfill: leftover folders under dead pets are reserved.
-- L*: the ledger itself: closed to every API role, append-only for all.
-- S*: the writes and reads that must still pass.
-- A*: account deletion still removes everything, and its ids stay reserved.

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

-- B's read of a Storage folder, as every pet-keyed Storage policy decides it
-- (025, 044, 103: the first folder is one of the caller's pet ids).
CREATE FUNCTION public.probe_can_read(folder text) RETURNS boolean
LANGUAGE sql STABLE AS $f$
  SELECT folder IN (SELECT id::text FROM public.pets WHERE user_id = auth.uid())
$f$;
GRANT EXECUTE ON FUNCTION public.probe_can_read(text) TO anon, authenticated, service_role;

-- X7's vehicle: a DEFINER function (runs as the migration owner) that does
-- the delete-and-reinsert, callable by the service role.
CREATE FUNCTION public.probe_swap() RETURNS void LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = '' AS $f$
BEGIN
  DELETE FROM public.pets WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001';
  INSERT INTO public.pets (id, user_id)
    VALUES ('a1a1a1a1-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
END $f$;
GRANT EXECUTE ON FUNCTION public.probe_swap() TO service_role;

\o /dev/null
-- ── D: a client never deletes a pet ─────────────────────────────────────────
SELECT probe('D1: owner (client) deletes its own pet', 'authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  $q$DO $b$ DECLARE n int; BEGIN
      DELETE FROM public.pets WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001';
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n = 0 THEN RAISE EXCEPTION 'silently deleted nothing' USING ERRCODE = 'P0002'; END IF;
    END $b$$q$, '42501');
SELECT probe('D2: anon deletes a pet', 'anon', NULL,
  $$DELETE FROM public.pets WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001'$$, '42501');
SELECT probe('D3: owner (client) deletes another account''s pet', 'authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  $$DELETE FROM public.pets WHERE id = 'b1b1b1b1-0000-4000-8000-000000000003'$$, '42501');
SELECT probe('D4: owner (client) truncates pets', 'authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  $$TRUNCATE public.pets CASCADE$$, '42501');
SELECT probe('D5: owner (client) deletes through a MERGE', 'authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  $$MERGE INTO public.pets p
     USING (SELECT 'a1a1a1a1-0000-4000-8000-000000000001'::uuid AS id) s ON p.id = s.id
     WHEN MATCHED THEN DELETE$$, '42501');
SELECT probe('D6: the saved copy and its file row survive every D attempt', 'postgres', NULL,
  $q$DO $b$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM public.vet_reports WHERE id = 'd2d2d2d2-0000-4000-8000-00000000000a') THEN
        RAISE EXCEPTION 'kept copy gone';
      END IF;
    END $b$$q$, 'ok');

-- ── X: a pet id never comes back ────────────────────────────────────────────
SELECT probe('X1: service role deletes A''s pet and re-inserts its id as B''s (the CUL-2375 attack)', 'service_role', NULL,
  $q$DO $b$ BEGIN
      DELETE FROM public.pets WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001';
      INSERT INTO public.pets (id, user_id)
        VALUES ('a1a1a1a1-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    END $b$$q$, '23514');
SELECT probe('X2: …and B could then read A''s report file (end to end, refused at the insert)', 'service_role', NULL,
  $q$DO $b$ BEGIN
      DELETE FROM public.pets WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001';
      BEGIN
        INSERT INTO public.pets (id, user_id)
          VALUES ('a1a1a1a1-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
      EXCEPTION WHEN check_violation THEN NULL;
      END;
      PERFORM set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
      IF public.probe_can_read('a1a1a1a1-0000-4000-8000-000000000001') THEN
        RAISE EXCEPTION 'B reads A''s folder';
      END IF;
    END $b$$q$, 'ok');
SELECT probe('X3: service role re-inserts under the SAME owner (stricter than the sketch)', 'service_role', NULL,
  $q$DO $b$ BEGIN
      DELETE FROM public.pets WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001';
      INSERT INTO public.pets (id, user_id)
        VALUES ('a1a1a1a1-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    END $b$$q$, '23514');
SELECT probe('X4: migration owner deletes and re-inserts', 'postgres', NULL,
  $q$DO $b$ BEGIN
      DELETE FROM public.pets WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001';
      INSERT INTO public.pets (id, user_id)
        VALUES ('a1a1a1a1-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    END $b$$q$, '23514');
SELECT probe('X5: delete and re-insert in one statement (data-modifying CTE)', 'service_role', NULL,
  $$WITH d AS (DELETE FROM public.pets WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001' RETURNING id)
    INSERT INTO public.pets (id, user_id)
    SELECT id, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid FROM d$$, '23514');
-- X5 is refused by 114's kept-copy guard before 116 is reached (the CTE's
-- snapshot still sees the pet); X5b runs the same shape on B's pet, which
-- has no kept copy, so 116 is what answers.
SELECT probe('X5b: one-statement delete and re-insert of a pet with no kept copy', 'service_role', NULL,
  $$WITH d AS (DELETE FROM public.pets WHERE id = 'b1b1b1b1-0000-4000-8000-000000000003' RETURNING id)
    INSERT INTO public.pets (id, user_id)
    SELECT id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid FROM d$$, '23514');
SELECT probe('X6: account A deleted, then its pet id inserted as B''s', 'service_role', NULL,
  $q$DO $b$ BEGIN
      DELETE FROM auth.users WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      INSERT INTO public.pets (id, user_id)
        VALUES ('a1a1a1a1-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    END $b$$q$, '23514');
SELECT probe('X7: a DEFINER function deletes and re-inserts, called by the service role', 'service_role', NULL,
  $$SELECT public.probe_swap()$$, '23514');
SELECT probe('X8: re-insert through an upsert (ON CONFLICT DO NOTHING still inserts)', 'service_role', NULL,
  $q$DO $b$ BEGIN
      DELETE FROM public.pets WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001';
      INSERT INTO public.pets (id, user_id)
        VALUES ('a1a1a1a1-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
        ON CONFLICT (id) DO NOTHING;
    END $b$$q$, '23514');
SELECT probe('X9: re-insert through MERGE … WHEN NOT MATCHED THEN INSERT', 'service_role', NULL,
  $q$DO $b$ BEGIN
      DELETE FROM public.pets WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001';
      MERGE INTO public.pets p
        USING (SELECT 'a1a1a1a1-0000-4000-8000-000000000001'::uuid AS id) s ON p.id = s.id
        WHEN NOT MATCHED THEN INSERT (id, user_id) VALUES (s.id, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    END $b$$q$, '23514');
SELECT probe('X10: the refusal names no value (C-31)', 'service_role', NULL,
  $q$DO $b$ BEGIN
      DELETE FROM public.pets WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001';
      BEGIN
        INSERT INTO public.pets (id, user_id)
          VALUES ('a1a1a1a1-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
      EXCEPTION WHEN check_violation THEN
        IF SQLERRM ~* '[0-9a-f]{8}-' THEN RAISE EXCEPTION 'message leaks: %', SQLERRM; END IF;
        RETURN;
      END;
      RAISE EXCEPTION 'not refused';
    END $b$$q$, 'ok');
SELECT probe('X11: a later-named BEFORE INSERT trigger rewrites NEW.id to a reserved id', 'postgres', NULL,
  $q$DO $b$ BEGIN
      CREATE FUNCTION public.probe_zz_id() RETURNS trigger LANGUAGE plpgsql AS $f$
      BEGIN NEW.id := 'dead0000-0000-4000-8000-0000000000aa'; RETURN NEW; END $f$;
      CREATE TRIGGER trg_pets_zz BEFORE INSERT ON public.pets
        FOR EACH ROW EXECUTE FUNCTION public.probe_zz_id();
      INSERT INTO public.pets (user_id) VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    END $b$$q$, '23514');

-- ── B: the backfill reserved every leftover folder ─────────────────────────
SELECT probe('B1: service role inserts a pet under a dead pet''s photo folder', 'service_role', NULL,
  $$INSERT INTO public.pets (id, user_id)
     VALUES ('dead0000-0000-4000-8000-0000000000aa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$$, '23514');
SELECT probe('B2: …under a dead pet''s event-attachment folder', 'service_role', NULL,
  $$INSERT INTO public.pets (id, user_id)
     VALUES ('dead0000-0000-4000-8000-0000000000bb', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$$, '23514');
SELECT probe('B3: …under an uppercase-spelled vet-document folder (reserved lowercased)', 'service_role', NULL,
  $$INSERT INTO public.pets (id, user_id)
     VALUES ('dead0000-0000-4000-8000-0000000000cc', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$$, '23514');
SELECT probe('B4: a medication-photo folder is an account''s, not a pet''s: not reserved', 'postgres', NULL,
  $q$DO $b$ BEGIN
      IF EXISTS (SELECT 1 FROM public.pet_ids_retired WHERE id = 'cccccccc-0000-4000-8000-0000000000dd') THEN
        RAISE EXCEPTION 'non-pet bucket reserved';
      END IF;
    END $b$$q$, 'ok');
SELECT probe('B5: every live pet is reserved, and the ledger is exactly pets + 3 dead folders', 'postgres', NULL,
  $q$DO $b$ BEGIN
      IF EXISTS (SELECT 1 FROM public.pets p WHERE NOT EXISTS
                   (SELECT 1 FROM public.pet_ids_retired r WHERE r.id = p.id))
         OR (SELECT count(*) FROM public.pet_ids_retired) <> 5 THEN
        RAISE EXCEPTION 'backfill wrong';
      END IF;
    END $b$$q$, 'ok');

-- ── L: the ledger is closed and append-only ────────────────────────────────
SELECT probe('L1: service role reads the ledger', 'service_role', NULL,
  $$SELECT * FROM public.pet_ids_retired$$, '42501');
SELECT probe('L2: service role releases A''s pet id', 'service_role', NULL,
  $$DELETE FROM public.pet_ids_retired WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001'$$, '42501');
SELECT probe('L3: service role pre-reserves an id', 'service_role', NULL,
  $$INSERT INTO public.pet_ids_retired (id) VALUES (gen_random_uuid())$$, '42501');
SELECT probe('L4: owner (client) releases an id', 'authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  $$DELETE FROM public.pet_ids_retired$$, '42501');
SELECT probe('L5: migration owner releases an id (append-only for every role)', 'postgres', NULL,
  $$DELETE FROM public.pet_ids_retired WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001'$$, '23514');
SELECT probe('L6: migration owner rewrites an id', 'postgres', NULL,
  $$UPDATE public.pet_ids_retired SET id = gen_random_uuid()
     WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001'$$, '23514');
SELECT probe('L7: migration owner truncates the ledger', 'postgres', NULL,
  $$TRUNCATE public.pet_ids_retired$$, '23514');
SELECT probe('L8: service role installs a trigger on the ledger', 'service_role', NULL,
  $q$DO $b$ BEGIN
      CREATE FUNCTION pg_temp.zz_skip() RETURNS trigger LANGUAGE plpgsql AS $f$
      BEGIN RETURN NULL; END $f$;
      CREATE TRIGGER zz_skip BEFORE INSERT ON public.pet_ids_retired
        FOR EACH ROW EXECUTE FUNCTION pg_temp.zz_skip();
    END $b$$q$, '42501');
SELECT probe('L9: service role replaces the reserve trigger on pets (TRIGGER revoked by 115)', 'service_role', NULL,
  $$CREATE OR REPLACE TRIGGER trg_pets_reserve_id AFTER INSERT ON public.pets
     FOR EACH ROW WHEN (false) EXECUTE FUNCTION public.reserve_pet_id()$$, '42501');
SELECT probe('L10: a reservation suppressed by a RETURN NULL trigger fails the insert (M6 shape)', 'postgres', NULL,
  $q$DO $b$ BEGIN
      CREATE FUNCTION public.probe_skip() RETURNS trigger LANGUAGE plpgsql AS $f$
      BEGIN RETURN NULL; END $f$;
      CREATE TRIGGER aa_skip BEFORE INSERT ON public.pet_ids_retired
        FOR EACH ROW EXECUTE FUNCTION public.probe_skip();
      INSERT INTO public.pets (user_id) VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    END $b$$q$, '23514');
SELECT probe('L11: no API role holds a privilege on the ledger, or DELETE on pets as a client', 'postgres', NULL,
  $q$DO $b$ DECLARE r text; p text; BEGIN
      FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
        FOREACH p IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER'] LOOP
          IF has_table_privilege(r, 'public.pet_ids_retired', p) THEN
            RAISE EXCEPTION '% holds % on the ledger', r, p;
          END IF;
        END LOOP;
      END LOOP;
      IF has_table_privilege('authenticated', 'public.pets', 'DELETE')
         OR has_table_privilege('anon', 'public.pets', 'DELETE')
         OR has_table_privilege('authenticated', 'public.pets', 'TRUNCATE') THEN
        RAISE EXCEPTION 'a client may delete pets';
      END IF;
    END $b$$q$, 'ok');

-- ── S: what must still pass ────────────────────────────────────────────────
SELECT probe('S1: owner reads its own pet and only its own', 'authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  $q$DO $b$ BEGIN
      IF (SELECT count(*) FROM public.pets) <> 1
         OR NOT EXISTS (SELECT 1 FROM public.pets WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001') THEN
        RAISE EXCEPTION 'read scope wrong';
      END IF;
    END $b$$q$, 'ok');
SELECT probe('S2: client adds a pet (add-pet; 104 picks the id, 116 reserves it)', 'authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  $q$DO $b$ DECLARE new_id uuid; BEGIN
      INSERT INTO public.pets (id, user_id)
        VALUES ('dead0000-0000-4000-8000-0000000000aa', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
        RETURNING id INTO new_id;
      IF new_id = 'dead0000-0000-4000-8000-0000000000aa' THEN RAISE EXCEPTION '104 kept a client id'; END IF;
      RESET ROLE;
      IF NOT EXISTS (SELECT 1 FROM public.pet_ids_retired WHERE id = new_id) THEN
        RAISE EXCEPTION 'new pet not reserved';
      END IF;
    END $b$$q$, 'ok');
SELECT probe('S3: client adds a pet for another account (WITH CHECK)', 'authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  $$INSERT INTO public.pets (user_id) VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$$, '42501');
SELECT probe('S4: owner''s weight edit (log.tsx, the sync)', 'authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  $$UPDATE public.pets SET weight_kg = 11 WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001'$$, 'ok');
SELECT probe('S5: owner archives the pet (ArchivePetSheet)', 'authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  $$UPDATE public.pets SET is_active = false WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001'$$, 'ok');
SELECT probe('S6: owner edits B''s pet: touches nothing', 'authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  $q$DO $b$ DECLARE n int; BEGIN
      UPDATE public.pets SET weight_kg = 1 WHERE id = 'b1b1b1b1-0000-4000-8000-000000000003';
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n <> 0 THEN RAISE EXCEPTION 'edited B''s pet'; END IF;
    END $b$$q$, 'ok');
SELECT probe('S7: sync-shaped upsert of an existing pet (ON CONFLICT DO UPDATE fires no AFTER INSERT)', 'authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  $$INSERT INTO public.pets (id, user_id, weight_kg)
     VALUES ('a1a1a1a1-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 9.5)
     ON CONFLICT (id) DO UPDATE SET weight_kg = EXCLUDED.weight_kg$$, 'ok');
SELECT probe('S8: fixture-shaped service-role upsert: new id inserts, re-seed updates', 'service_role', NULL,
  $q$DO $b$ BEGIN
      INSERT INTO public.pets (id, user_id, weight_kg)
        VALUES ('f1f1f1f1-0000-4000-8000-000000000011', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 4)
        ON CONFLICT (id) DO UPDATE SET weight_kg = EXCLUDED.weight_kg;
      INSERT INTO public.pets (id, user_id, weight_kg)
        VALUES ('f1f1f1f1-0000-4000-8000-000000000011', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 5)
        ON CONFLICT (id) DO UPDATE SET weight_kg = EXCLUDED.weight_kg;
    END $b$$q$, 'ok');
SELECT probe('S9: 104 and 115 still hold (id and owner frozen)', 'service_role', NULL,
  $q$DO $b$ BEGIN
      BEGIN
        UPDATE public.pets SET id = gen_random_uuid() WHERE id = 'b1b1b1b1-0000-4000-8000-000000000003';
        RAISE EXCEPTION 'id moved';
      EXCEPTION WHEN check_violation THEN NULL;
      END;
      BEGIN
        UPDATE public.pets SET user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' WHERE id = 'b1b1b1b1-0000-4000-8000-000000000003';
        RAISE EXCEPTION 'owner moved';
      EXCEPTION WHEN check_violation THEN NULL;
      END;
    END $b$$q$, 'ok');

-- ── A: account deletion ────────────────────────────────────────────────────
SELECT probe('A1: account deletion removes A''s pets and report rows (cascade needs no client DELETE)', 'service_role', NULL,
  $q$DO $b$ BEGIN
      DELETE FROM auth.users WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      IF EXISTS (SELECT 1 FROM public.pets WHERE user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
         OR EXISTS (SELECT 1 FROM public.vet_reports WHERE pet_id = 'a1a1a1a1-0000-4000-8000-000000000001') THEN
        RAISE EXCEPTION 'deletion left rows';
      END IF;
    END $b$$q$, 'ok');
SELECT probe('A2: B''s account deletion leaves A''s pet, rows and reservation', 'service_role', NULL,
  $q$DO $b$ BEGIN
      DELETE FROM auth.users WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
      IF (SELECT count(*) FROM public.vet_reports WHERE pet_id = 'a1a1a1a1-0000-4000-8000-000000000001') <> 1
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
