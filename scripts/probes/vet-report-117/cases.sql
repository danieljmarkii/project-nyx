-- Probe cases for migration 117 (CUL-2327, CUL-2397). Runs after
-- bootstrap.sql, 021, seed.sql and 117. Each case runs in its own
-- subtransaction and is rolled back, except the one marked STATE, which
-- deletes account A the way auth.admin.deleteUser does (its cascade).
-- An UPDATE that RLS filters to zero rows is not an error in Postgres, so the
-- update cases count their rows and raise 22012 (division by zero) on none.
--
-- S*: a live account's writes and reads, which must still pass.
-- X*: another account's prefix, refused before and after.
-- D*: account A's still-valid token after A is deleted.

CREATE TABLE probe_results (n serial, label text, want text, got text, msg text);

CREATE FUNCTION probe(label text, sub uuid, stmt text, want text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  got text;
  m   text;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', coalesce(sub::text, ''), true);
    SET LOCAL ROLE authenticated;
    EXECUTE stmt;
    RAISE EXCEPTION 'probe_ok';
  EXCEPTION WHEN others THEN
    IF SQLERRM = 'probe_ok' THEN got := 'ok'; m := ''; ELSE got := SQLSTATE; m := SQLERRM; END IF;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  INSERT INTO probe_results (label, want, got, msg) VALUES (label, want, got, m);
END;
$$;

\set A '''aaaaaaaa-0000-0000-0000-00000000000a'''
\set B '''bbbbbbbb-0000-0000-0000-00000000000b'''

-- Live account A.
SELECT probe('S1 live A uploads a label into its own folder', :A::uuid,
  $s$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('nyx-medication-photos', 'aaaaaaaa-0000-0000-0000-00000000000a/m1/back.jpg', auth.uid())$s$, 'ok');
SELECT probe('S2 live A replaces its label (update)', :A::uuid,
  $s$WITH u AS (UPDATE storage.objects SET owner = auth.uid() WHERE name = 'aaaaaaaa-0000-0000-0000-00000000000a/m1/front.jpg' RETURNING 1) SELECT 1 / count(*)::int FROM u$s$, 'ok');
SELECT probe('S3 live A replaces its label (upsert, the uploadPhoto path)', :A::uuid,
  $s$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('nyx-medication-photos', 'aaaaaaaa-0000-0000-0000-00000000000a/m1/front.jpg', auth.uid()) ON CONFLICT (bucket_id, name) DO UPDATE SET owner = excluded.owner$s$, 'ok');
SELECT probe('S4 live A reads its label', :A::uuid,
  $s$SELECT 1 / count(*)::int FROM storage.objects WHERE name LIKE 'aaaaaaaa-0000-0000-0000-00000000000a/%'$s$, 'ok');
SELECT probe('X1 live A uploads into B''s folder', :A::uuid,
  $s$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('nyx-medication-photos', 'bbbbbbbb-0000-0000-0000-00000000000b/m9/front.jpg', auth.uid())$s$, '42501');

-- STATE: delete account A (deleteUser's effect on these tables). A's object
-- from the seed stays behind, standing in for a leftover the sweep has not
-- reached yet.
DELETE FROM auth.users WHERE id = :A::uuid;

SELECT probe('D1 deleted A''s token uploads a label', :A::uuid,
  $s$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('nyx-medication-photos', 'aaaaaaaa-0000-0000-0000-00000000000a/m1/late.jpg', auth.uid())$s$, '42501');
SELECT probe('D2 deleted A''s token overwrites a leftover (update)', :A::uuid,
  $s$WITH u AS (UPDATE storage.objects SET owner = auth.uid() WHERE name = 'aaaaaaaa-0000-0000-0000-00000000000a/m1/front.jpg' RETURNING 1) SELECT 1 / count(*)::int FROM u$s$, '22012');
SELECT probe('D3 deleted A''s token upserts a leftover (the uploadPhoto path)', :A::uuid,
  $s$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('nyx-medication-photos', 'aaaaaaaa-0000-0000-0000-00000000000a/m1/front.jpg', auth.uid()) ON CONFLICT (bucket_id, name) DO UPDATE SET owner = excluded.owner$s$, '42501');
SELECT probe('D4 deleted A''s token re-mints its profile row (the check''s anchor)', :A::uuid,
  $s$INSERT INTO public.user_profiles (id) VALUES (auth.uid()) ON CONFLICT (id) DO UPDATE SET timezone = 'UTC'$s$, '23503');
SELECT probe('D5 deleted A''s token removes its own leftover (unchanged, helps the sweep)', :A::uuid,
  $s$WITH d AS (DELETE FROM storage.objects WHERE name = 'aaaaaaaa-0000-0000-0000-00000000000a/m1/front.jpg' RETURNING 1) SELECT 1 / count(*)::int FROM d$s$, 'ok');
SELECT probe('S5 live B still uploads after A is gone', :B::uuid,
  $s$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('nyx-medication-photos', 'bbbbbbbb-0000-0000-0000-00000000000b/m2/back.jpg', auth.uid())$s$, 'ok');
SELECT probe('X2 no token at all uploads', NULL,
  $s$INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('nyx-medication-photos', 'aaaaaaaa-0000-0000-0000-00000000000a/m1/anon.jpg', NULL)$s$, '42501');

SELECT n, label, want, got, CASE WHEN want = got THEN 'PASS' ELSE 'FAIL' END AS verdict, msg
FROM probe_results ORDER BY n;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM probe_results WHERE want <> got) THEN
    RAISE EXCEPTION 'probe: % case(s) differ from the result they want',
      (SELECT count(*) FROM probe_results WHERE want <> got);
  END IF;
END $$;
