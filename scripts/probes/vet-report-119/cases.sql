-- Probe cases for migration 119 (CUL-2445). Runs after 113's bootstrap.sql,
-- 110, 113, 114, seed.sql and 119. Every case runs in its own subtransaction
-- and is rolled back, so cases never depend on each other; the seed is the only
-- shared state. Each records the SQLSTATE it got against the one it wants; the
-- run fails on any mismatch.

CREATE TABLE probe_results (n serial, label text, who text, want text, got text, msg text, stmt text);

-- who: 'postgres' (migration owner), 'service_role' (no user), 'authenticated'
-- (with sub), 'anon'. A statement that succeeds is rolled back by a sentinel.
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

-- The truth, whoever asks: departures per report, read past RLS.
CREATE FUNCTION public.dcount(rid uuid) RETURNS bigint
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT count(*) FROM public.vet_report_departures WHERE report_id = rid
$$;
-- want(a, b): raises P0001 naming both when they differ.
CREATE FUNCTION public.want(got bigint, expected bigint, what text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF got IS DISTINCT FROM expected THEN
    RAISE EXCEPTION '% : got %, want %', what, got, expected;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.dcount(uuid), public.want(bigint, bigint, text)
  TO anon, authenticated, service_role;

\set A  '''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'''
\set B  '''bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'''

\o /dev/null
-- ── The backfill ─────────────────────────────────────────────────────────────
SELECT probe('backfill: each kept copy has its latest send, drafts none', 'postgres', NULL, $s$DO $d$ BEGIN
  PERFORM public.want(public.dcount('d2d2d2d2-0000-4000-8000-00000000000a'), 1, 'RK');
  PERFORM public.want(public.dcount('b2b2b2b2-0000-4000-8000-00000000000b'), 1, 'RB');
  PERFORM public.want(public.dcount('d1d1d1d1-0000-4000-8000-000000000009'), 0, 'RD');
  PERFORM public.want((SELECT count(*) FROM public.vet_report_departures
    WHERE report_id = 'd2d2d2d2-0000-4000-8000-00000000000a' AND shared_via = 'email'
      AND shared_at = '2026-10-01T09:00:00Z'), 1, 'RK stamp');
END $d$$s$, 'ok');

-- ── The writer: keep and restamp, as generate-report's savedCopy.ts does them ─
SELECT probe('keep: the one-write keep logs one departure', 'service_role', NULL, $s$DO $d$ BEGIN
  UPDATE public.vet_reports SET status = 'kept', shared_via = 'share_sheet', shared_at = '2026-11-01T08:00:00Z'
   WHERE id = 'd1d1d1d1-0000-4000-8000-000000000009' AND status = 'draft';
  PERFORM public.want(public.dcount('d1d1d1d1-0000-4000-8000-000000000009'), 1, 'after keep');
END $d$$s$, 'ok');
SELECT probe('keep + two restamps: three departures, in order', 'service_role', NULL, $s$DO $d$ BEGIN
  UPDATE public.vet_reports SET status = 'kept', shared_via = 'share_sheet', shared_at = '2026-11-01T08:00:00Z'
   WHERE id = 'd1d1d1d1-0000-4000-8000-000000000009';
  UPDATE public.vet_reports SET shared_via = 'print', shared_at = '2026-11-01T09:00:00Z'
   WHERE id = 'd1d1d1d1-0000-4000-8000-000000000009' AND status = 'kept';
  UPDATE public.vet_reports SET shared_via = 'email', shared_at = '2026-11-02T09:00:00Z'
   WHERE id = 'd1d1d1d1-0000-4000-8000-000000000009' AND status = 'kept';
  PERFORM public.want(public.dcount('d1d1d1d1-0000-4000-8000-000000000009'), 3, 'after restamps');
  PERFORM public.want((SELECT count(*) FROM public.vet_report_departures
    WHERE report_id = 'd1d1d1d1-0000-4000-8000-000000000009'
      AND (shared_via, shared_at) IN (('share_sheet', '2026-11-01T08:00:00Z'::timestamptz),
                                      ('print', '2026-11-01T09:00:00Z'::timestamptz),
                                      ('email', '2026-11-02T09:00:00Z'::timestamptz))), 3, 'the three stamps');
END $d$$s$, 'ok');
SELECT probe('restamp of a copy kept before 119: two departures', 'service_role', NULL, $s$DO $d$ BEGIN
  UPDATE public.vet_reports SET shared_via = 'print', shared_at = '2026-11-02T10:00:00Z'
   WHERE id = 'd2d2d2d2-0000-4000-8000-00000000000a' AND status = 'kept';
  PERFORM public.want(public.dcount('d2d2d2d2-0000-4000-8000-00000000000a'), 2, 'RK');
END $d$$s$, 'ok');
SELECT probe('a link change on a kept copy logs nothing', 'service_role', NULL, $s$DO $d$ BEGIN
  UPDATE public.vet_reports SET vet_visit_id = 'a3a3a3a3-0000-4000-8000-000000000004'
   WHERE id = 'd2d2d2d2-0000-4000-8000-00000000000a';
  UPDATE public.vet_reports SET vet_visit_id = NULL
   WHERE id = 'd2d2d2d2-0000-4000-8000-00000000000a';
  PERFORM public.want(public.dcount('d2d2d2d2-0000-4000-8000-00000000000a'), 1, 'RK');
END $d$$s$, 'ok');
SELECT probe('the same stamp written again logs nothing', 'service_role', NULL, $s$DO $d$ BEGIN
  UPDATE public.vet_reports SET shared_via = shared_via, shared_at = shared_at
   WHERE id = 'd2d2d2d2-0000-4000-8000-00000000000a';
  PERFORM public.want(public.dcount('d2d2d2d2-0000-4000-8000-00000000000a'), 1, 'RK');
END $d$$s$, 'ok');
SELECT probe('a stamp repeated after another (A, B, A) never fails the send', 'service_role', NULL, $s$DO $d$ BEGIN
  UPDATE public.vet_reports SET shared_via = 'print', shared_at = '2026-11-02T10:00:00Z'
   WHERE id = 'd2d2d2d2-0000-4000-8000-00000000000a';
  UPDATE public.vet_reports SET shared_via = 'email', shared_at = '2026-10-01T09:00:00Z'
   WHERE id = 'd2d2d2d2-0000-4000-8000-00000000000a';
  PERFORM public.want(public.dcount('d2d2d2d2-0000-4000-8000-00000000000a'), 2, 'RK');
END $d$$s$, 'ok');
SELECT probe('a stamp on a draft logs nothing', 'service_role', NULL, $s$DO $d$ BEGIN
  UPDATE public.vet_reports SET shared_via = 'print', shared_at = '2026-11-01T08:00:00Z'
   WHERE id = 'd1d1d1d1-0000-4000-8000-000000000009';
  PERFORM public.want(public.dcount('d1d1d1d1-0000-4000-8000-000000000009'), 0, 'RD');
END $d$$s$, 'ok');
SELECT probe('a row inserted kept logs one departure', 'service_role', NULL, $s$DO $d$ BEGIN
  INSERT INTO public.vet_reports
    (id, pet_id, generated_by, date_range_start, date_range_end, storage_path,
     report_version, renderer_fingerprint, params, scope_basis, status, snapshot,
     short_id, shared_via, shared_at, content_sha256, created_at)
  VALUES ('e1e1e1e1-0000-4000-8000-00000000000c', 'a1a1a1a1-0000-4000-8000-000000000001',
     'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-09-01', '2026-10-30',
     'a1a1a1a1-0000-4000-8000-000000000001/e1e1e1e1-0000-4000-8000-00000000000c.pdf',
     'v2', 'fp-1', '{}', 'since_last_visit', 'kept', '{"facts":[4]}', 'P8T3',
     'email', '2026-11-02T11:00:00Z', repeat('12', 32), '2026-11-02T10:59:00Z');
  PERFORM public.want(public.dcount('e1e1e1e1-0000-4000-8000-00000000000c'), 1, 'inserted kept');
END $d$$s$, 'ok');

-- ── Reads ────────────────────────────────────────────────────────────────────
SELECT probe('read: the owner sees their own copy''s sends only', 'authenticated', :A, $s$DO $d$ BEGIN
  PERFORM public.want((SELECT count(*) FROM public.vet_report_departures), 1, 'A sees');
  PERFORM public.want((SELECT count(*) FROM public.vet_report_departures
    WHERE report_id = 'b2b2b2b2-0000-4000-8000-00000000000b'), 0, 'A sees B');
END $d$$s$, 'ok');
SELECT probe('read: the other account sees none of the owner''s', 'authenticated', :B, $s$DO $d$ BEGIN
  PERFORM public.want((SELECT count(*) FROM public.vet_report_departures
    WHERE report_id = 'd2d2d2d2-0000-4000-8000-00000000000a'), 0, 'B sees A');
  PERFORM public.want((SELECT count(*) FROM public.vet_report_departures), 1, 'B sees own');
END $d$$s$, 'ok');
SELECT probe('read: authenticated with no user sees nothing', 'authenticated', NULL, $s$DO $d$ BEGIN
  PERFORM public.want((SELECT count(*) FROM public.vet_report_departures), 0, 'no user');
END $d$$s$, 'ok');
SELECT probe('read: anon holds no grant', 'anon', NULL,
  $s$SELECT count(*) FROM public.vet_report_departures$s$, '42501');

-- ── Client writes ────────────────────────────────────────────────────────────
SELECT probe('client: INSERT its own copy''s current stamp', 'authenticated', :A,
  $s$INSERT INTO public.vet_report_departures (report_id, pet_id, shared_via, shared_at)
     VALUES ('d2d2d2d2-0000-4000-8000-00000000000a', 'a1a1a1a1-0000-4000-8000-000000000001', 'email', '2026-10-01T09:00:00Z')$s$, '42501');
SELECT probe('client: UPDATE a departure', 'authenticated', :A,
  $s$UPDATE public.vet_report_departures SET shared_via = 'print'$s$, '42501');
SELECT probe('client: DELETE a departure', 'authenticated', :A,
  $s$DELETE FROM public.vet_report_departures$s$, '42501');
SELECT probe('client: TRUNCATE', 'authenticated', :A,
  $s$TRUNCATE public.vet_report_departures$s$, '42501');
SELECT probe('anon: INSERT', 'anon', NULL,
  $s$INSERT INTO public.vet_report_departures (report_id, pet_id, shared_via, shared_at)
     VALUES ('d2d2d2d2-0000-4000-8000-00000000000a', 'a1a1a1a1-0000-4000-8000-000000000001', 'email', '2026-10-01T09:00:00Z')$s$, '42501');

-- ── The service role writes only through the trigger ─────────────────────────
SELECT probe('service: INSERT directly', 'service_role', NULL,
  $s$INSERT INTO public.vet_report_departures (report_id, pet_id, shared_via, shared_at)
     VALUES ('d2d2d2d2-0000-4000-8000-00000000000a', 'a1a1a1a1-0000-4000-8000-000000000001', 'print', '2026-10-05T09:00:00Z')$s$, '42501');
SELECT probe('service: UPDATE', 'service_role', NULL,
  $s$UPDATE public.vet_report_departures SET shared_via = 'print'$s$, '42501');
SELECT probe('service: DELETE', 'service_role', NULL,
  $s$DELETE FROM public.vet_report_departures$s$, '42501');
SELECT probe('service: TRUNCATE', 'service_role', NULL,
  $s$TRUNCATE public.vet_report_departures$s$, '42501');

-- ── Even the migration owner cannot forge, edit or drop a departure ──────────
SELECT probe('owner: a send the report never stamped', 'postgres', NULL,
  $s$INSERT INTO public.vet_report_departures (report_id, pet_id, shared_via, shared_at)
     VALUES ('d2d2d2d2-0000-4000-8000-00000000000a', 'a1a1a1a1-0000-4000-8000-000000000001', 'print', '2026-10-05T09:00:00Z')$s$, '23514');
SELECT probe('owner: the current stamp a second time', 'postgres', NULL,
  $s$INSERT INTO public.vet_report_departures (report_id, pet_id, shared_via, shared_at)
     VALUES ('d2d2d2d2-0000-4000-8000-00000000000a', 'a1a1a1a1-0000-4000-8000-000000000001', 'email', '2026-10-01T09:00:00Z')$s$, '23505');
SELECT probe('owner: another pet''s report under this pet', 'postgres', NULL,
  $s$INSERT INTO public.vet_report_departures (report_id, pet_id, shared_via, shared_at)
     VALUES ('b2b2b2b2-0000-4000-8000-00000000000b', 'a1a1a1a1-0000-4000-8000-000000000001', 'victimroute', '2026-10-02T10:00:00Z')$s$, '23514');
SELECT probe('owner: an absurd stamp on the victim''s copy (C-31 vehicle)', 'postgres', NULL,
  $s$INSERT INTO public.vet_report_departures (report_id, pet_id, shared_via, shared_at)
     VALUES ('b2b2b2b2-0000-4000-8000-00000000000b', 'b1b1b1b1-0000-4000-8000-000000000003', 'absurd', '1999-01-01T00:00:00Z')$s$, '23514');
SELECT probe('owner: a draft''s stamp', 'postgres', NULL, $s$DO $d$ BEGIN
  UPDATE public.vet_reports SET shared_via = 'print', shared_at = '2026-11-01T08:00:00Z'
   WHERE id = 'd1d1d1d1-0000-4000-8000-000000000009';
  INSERT INTO public.vet_report_departures (report_id, pet_id, shared_via, shared_at)
  VALUES ('d1d1d1d1-0000-4000-8000-000000000009', 'a1a1a1a1-0000-4000-8000-000000000001', 'print', '2026-11-01T08:00:00Z');
END $d$$s$, '23514');
SELECT probe('owner (pass 1, F1): a stamp before the copy existed, round-tripped by restamps', 'postgres', NULL, $s$DO $d$ BEGIN
  UPDATE public.vet_reports SET shared_via = 'fax', shared_at = '2019-01-01T00:00:00Z'
   WHERE id = 'd2d2d2d2-0000-4000-8000-00000000000a';
END $d$$s$, '23514');
SELECT probe('owner (pass 1, F1): a stamp in the future', 'postgres', NULL, $s$DO $d$ BEGIN
  UPDATE public.vet_reports SET shared_via = 'fax', shared_at = now() + interval '1 day'
   WHERE id = 'd2d2d2d2-0000-4000-8000-00000000000a';
END $d$$s$, '23514');
SELECT probe('service: a keep stamped by a clock 4 minutes ahead still lands', 'service_role', NULL, $s$DO $d$ BEGIN
  UPDATE public.vet_reports SET status = 'kept', shared_via = 'email', shared_at = now() + interval '4 minutes'
   WHERE id = 'd1d1d1d1-0000-4000-8000-000000000009';
  PERFORM public.want(public.dcount('d1d1d1d1-0000-4000-8000-000000000009'), 1, 'skewed keep');
END $d$$s$, 'ok');
SELECT probe('owner (pass 1, F3): a rule that swallows the departure fails the send, never loses it', 'postgres', NULL, $s$DO $d$ BEGIN
  CREATE RULE probe_swallow AS ON INSERT TO public.vet_report_departures DO INSTEAD NOTHING;
  UPDATE public.vet_reports SET shared_via = 'print', shared_at = now()
   WHERE id = 'd2d2d2d2-0000-4000-8000-00000000000a';
END $d$$s$, '23514');
SELECT probe('owner: UPDATE a departure', 'postgres', NULL,
  $s$UPDATE public.vet_report_departures SET shared_at = shared_at - interval '1 day'$s$, '23514');
SELECT probe('owner: DELETE a departure while its report stands', 'postgres', NULL,
  $s$DELETE FROM public.vet_report_departures WHERE report_id = 'd2d2d2d2-0000-4000-8000-00000000000a'$s$, '23514');
SELECT probe('owner: TRUNCATE', 'postgres', NULL,
  $s$TRUNCATE public.vet_report_departures$s$, '23514');

-- ── Deletion reaches them ────────────────────────────────────────────────────
SELECT probe('account deletion (service role deletes the auth user) removes them', 'service_role', NULL, $s$DO $d$ BEGIN
  DELETE FROM auth.users WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  PERFORM public.want(public.dcount('d2d2d2d2-0000-4000-8000-00000000000a'), 0, 'RK after account');
  PERFORM public.want(public.dcount('b2b2b2b2-0000-4000-8000-00000000000b'), 1, 'RB untouched');
END $d$$s$, 'ok');
SELECT probe('pet deletion removes them', 'postgres', NULL, $s$DO $d$ BEGIN
  DELETE FROM public.pets WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001';
  PERFORM public.want(public.dcount('d2d2d2d2-0000-4000-8000-00000000000a'), 0, 'RK after pet');
END $d$$s$, 'ok');

-- ── Shape ───────────────────────────────────────────────────────────────────
INSERT INTO probe_results (label, who, want, got, msg)
SELECT 'grants: client and service roles hold SELECT only', '-',
       'authenticated:SELECT,service_role:SELECT',
       coalesce(string_agg(grantee || ':' || privilege_type, ',' ORDER BY grantee, privilege_type), ''), ''
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public' AND table_name = 'vet_report_departures'
   AND grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC');
INSERT INTO probe_results (label, who, want, got, msg)
SELECT 'grants: no caller role executes a 119 function', '-', '0',
       count(*)::text, coalesce(string_agg(p.proname || ':' || r, ','), '')
  FROM pg_proc p
 CROSS JOIN unnest(ARRAY['anon', 'authenticated', 'service_role']) r
 WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname IN ('vet_report_departure_is_stamp', 'vet_report_departures_append_only',
                     'vet_reports_log_departure')
   AND has_function_privilege(r, p.oid, 'EXECUTE');
INSERT INTO probe_results (label, who, want, got, msg)
SELECT 'rls: on', '-', 'true', relrowsecurity::text, ''
  FROM pg_class WHERE oid = 'public.vet_report_departures'::regclass;

-- ── C-31: no refusal names a value the caller did not send ───────────────────
INSERT INTO probe_results (label, who, want, got, msg)
SELECT 'C-31: no 23514 message carries the victim''s stamp', '-', 'clean',
       CASE WHEN EXISTS (SELECT 1 FROM probe_results
                          WHERE got = '23514' AND (msg ~ 'victimroute' AND stmt !~ 'victimroute'
                                                   OR msg ~ '2026-10-02'
                                                      AND stmt !~ '2026-10-02'))
            THEN 'LEAK' ELSE 'clean' END, '';

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
