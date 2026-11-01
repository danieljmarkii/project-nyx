-- Probe cases for migration 114 (CUL-2339). Runs after 113's bootstrap.sql,
-- 110, 113 and 114 have been replayed. Every case runs in its own
-- subtransaction and is rolled back, so cases never depend on each other; the
-- seed rows below are the only shared state. Each records the SQLSTATE it got
-- against the one it wants; the run fails on any mismatch.
--
-- E3 and E4 are the two ways round 113's depth-1 delete guard (CUL-2339).
-- With MIGRATION_114=/dev/null every E3-* and E4-* case that wants 23514
-- gets 'ok' instead: the probe sees the hole it says is closed.

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

-- Fixed ids (113's):
--   A  = aaaaaaaa-…, the owner.  B = bbbbbbbb-…, the other account.
--   PA = a1… A's pet.  PA2 = a2… A's other pet.  PB = b1… B's pet.
--   VA = a3… visit of PA.  AA = a4… appointment of PA.
--   RD = d1… draft of PA.  RK = d2… kept copy of PA (label K7Q2), linked to VA and AA.
INSERT INTO auth.users VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO public.pets VALUES
  ('a1a1a1a1-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('a2a2a2a2-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('b1b1b1b1-0000-4000-8000-000000000003', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO public.vet_visits (id, pet_id) VALUES
  ('a3a3a3a3-0000-4000-8000-000000000004', 'a1a1a1a1-0000-4000-8000-000000000001');
INSERT INTO public.vet_appointments (id, pet_id, reason) VALUES
  ('a4a4a4a4-0000-4000-8000-000000000006', 'a1a1a1a1-0000-4000-8000-000000000001', 'itch');

-- kins(id, label, snapshot, pet): the INSERT of a kept copy, as text.
CREATE FUNCTION kins(rid text, label text, snap text,
                     pet text DEFAULT 'a1a1a1a1-0000-4000-8000-000000000001') RETURNS text
LANGUAGE sql AS $$
  SELECT format($f$
    INSERT INTO public.vet_reports
      (id, pet_id, generated_by, date_range_start, date_range_end, storage_path,
       report_version, renderer_fingerprint, params, scope_basis, status, snapshot,
       short_id, shared_via, shared_at, ai_lead_text, ai_lead_verdict, ai_lead_model,
       content_sha256)
    VALUES (%1$L, %4$L, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-09-01', '2026-10-30',
       %5$L, 'v2', 'fp-1', '{"window":"60d"}', 'since_last_visit',
       'kept', %3$L, %2$L, 'share_sheet', now(), 'Cooper vomited 4 times.',
       '{"pass":true}', 'model-x', repeat('ab', 32))
  $f$, rid, label, snap, pet, pet || '/' || rid || '.pdf')
$$;

-- dins(id, pet): the INSERT of a draft, as text.
CREATE FUNCTION dins(rid text, pet text DEFAULT 'a1a1a1a1-0000-4000-8000-000000000001') RETURNS text
LANGUAGE sql AS $$
  SELECT format($f$
    INSERT INTO public.vet_reports
      (id, pet_id, generated_by, date_range_start, date_range_end, storage_path,
       report_version, renderer_fingerprint, params, scope_basis)
    VALUES (%1$L, %2$L, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-09-01', '2026-10-30',
       %3$L, 'v2', 'fp-1', '{}', 'since_last_visit')
  $f$, rid, pet, pet || '/' || rid || '.pdf')
$$;

INSERT INTO public.vet_reports
  (id, pet_id, generated_by, date_range_start, date_range_end, storage_path,
   report_version, renderer_fingerprint, params, scope_basis)
VALUES
  ('d1d1d1d1-0000-4000-8000-000000000009', 'a1a1a1a1-0000-4000-8000-000000000001',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-09-01', '2026-10-30',
   'a1a1a1a1-0000-4000-8000-000000000001/d1d1d1d1-0000-4000-8000-000000000009.html',
   'v2', 'fp-1', '{"window":"60d"}', 'since_last_visit');
DO $$ BEGIN EXECUTE kins('d2d2d2d2-0000-4000-8000-00000000000a', 'K7Q2', '{"facts":[1]}'); END $$;
UPDATE public.vet_reports SET vet_visit_id = 'a3a3a3a3-0000-4000-8000-000000000004',
       vet_appointment_id = 'a4a4a4a4-0000-4000-8000-000000000006'
 WHERE id = 'd2d2d2d2-0000-4000-8000-00000000000a';

-- E3a's vehicle: a table whose AFTER INSERT trigger deletes the kept copy.
-- Plain SECURITY INVOKER server code, the shape 113's residual named.
CREATE TABLE public.probe_hook (n int);
CREATE FUNCTION public.probe_hook_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.vet_reports WHERE id = 'd2d2d2d2-0000-4000-8000-00000000000a';
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_probe_hook AFTER INSERT ON public.probe_hook
  FOR EACH ROW EXECUTE FUNCTION public.probe_hook_delete();
GRANT ALL ON public.probe_hook TO service_role;

-- A DEFINER function that deletes the kept copy, callable by the service role.
CREATE FUNCTION public.probe_definer_delete() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  DELETE FROM public.vet_reports WHERE id = 'd2d2d2d2-0000-4000-8000-00000000000a'
$$;
GRANT EXECUTE ON FUNCTION public.probe_definer_delete() TO service_role;

\o /dev/null
-- ── Direct deletes (113's F1, still refused) ─────────────────────────────────
SELECT probe('direct: service role deletes the kept copy', 'service_role', NULL,
  $$DELETE FROM public.vet_reports WHERE id = 'd2d2d2d2-0000-4000-8000-00000000000a'$$, '23514');
SELECT probe('direct: migration owner deletes the kept copy', 'postgres', NULL,
  $$DELETE FROM public.vet_reports WHERE id = 'd2d2d2d2-0000-4000-8000-00000000000a'$$, '23514');
SELECT probe('direct: DEFINER function deletes the kept copy', 'service_role', NULL,
  $$SELECT public.probe_definer_delete()$$, '23514');
SELECT probe('truncate: vet_reports', 'postgres', NULL,
  $$TRUNCATE public.vet_reports CASCADE$$, '23514');

-- ── E3: a DELETE from inside a trigger, depth 2 ──────────────────────────────
SELECT probe('E3-a: another table''s trigger deletes the kept copy', 'service_role', NULL,
  $$INSERT INTO public.probe_hook VALUES (1)$$, '23514');
SELECT probe('E3-b: an AFTER UPDATE trigger on vet_reports deletes the kept copy', 'postgres', NULL,
  $q$DO $b$ BEGIN
      CREATE FUNCTION public.probe_self_delete() RETURNS trigger LANGUAGE plpgsql AS $f$
      BEGIN
        DELETE FROM public.vet_reports WHERE id = OLD.id;
        RETURN NULL;
      END $f$;
      CREATE TRIGGER trg_probe_self_delete AFTER UPDATE ON public.vet_reports
        FOR EACH ROW WHEN (OLD.status = 'kept')
        EXECUTE FUNCTION public.probe_self_delete();
      UPDATE public.vet_reports SET shared_via = 'print'
       WHERE id = 'd2d2d2d2-0000-4000-8000-00000000000a';
    END $b$$q$, '23514');
SELECT probe('E3-c: a BEFORE DELETE trigger on pets deletes the copy while the pet stands', 'postgres', NULL,
  $q$DO $b$ BEGIN
      CREATE FUNCTION public.probe_pet_hook() RETURNS trigger LANGUAGE plpgsql AS $f$
      BEGIN
        DELETE FROM public.vet_reports WHERE pet_id = OLD.id;
        RETURN OLD;
      END $f$;
      CREATE TRIGGER trg_probe_pet_hook BEFORE DELETE ON public.pets
        FOR EACH ROW EXECUTE FUNCTION public.probe_pet_hook();
      DELETE FROM public.pets WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001';
    END $b$$q$, '23514');

-- ── The legitimate exits still work ──────────────────────────────────────────
SELECT probe('cascade: service role deletes the pet', 'service_role', NULL,
  $$DELETE FROM public.pets WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001'$$, 'ok');
SELECT probe('cascade: migration owner deletes the pet', 'postgres', NULL,
  $$DELETE FROM public.pets WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001'$$, 'ok');
SELECT probe('cascade: account deletion (auth user removed)', 'service_role', NULL,
  $$DELETE FROM auth.users WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'ok');
SELECT probe('cascade: the pet deletion retires the kept copy''s id and label', 'postgres', NULL,
  $q$DO $b$ BEGIN
      DELETE FROM public.pets WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001';
      IF NOT EXISTS (SELECT 1 FROM public.vet_report_retired_ids
                      WHERE id = 'd2d2d2d2-0000-4000-8000-00000000000a'
                        AND pet_id = 'a1a1a1a1-0000-4000-8000-000000000001'
                        AND short_id = 'K7Q2') THEN
        RAISE EXCEPTION 'not retired';
      END IF;
      IF EXISTS (SELECT 1 FROM public.vet_report_retired_ids
                  WHERE id = 'd1d1d1d1-0000-4000-8000-000000000009') THEN
        RAISE EXCEPTION 'draft retired';
      END IF;
    END $b$$q$, 'ok');
SELECT probe('cascade: the account deletion retires it too', 'postgres', NULL,
  $q$DO $b$ BEGIN
      DELETE FROM auth.users WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      IF NOT EXISTS (SELECT 1 FROM public.vet_report_retired_ids
                      WHERE id = 'd2d2d2d2-0000-4000-8000-00000000000a') THEN
        RAISE EXCEPTION 'not retired';
      END IF;
    END $b$$q$, 'ok');
SELECT probe('draft: service role deletes a draft (the reaper)', 'service_role', NULL,
  $$DELETE FROM public.vet_reports WHERE id = 'd1d1d1d1-0000-4000-8000-000000000009'$$, 'ok');
SELECT probe('draft: a deleted draft''s id can be used again', 'service_role', NULL,
  format($q$DO $b$ BEGIN
      DELETE FROM public.vet_reports WHERE id = 'd1d1d1d1-0000-4000-8000-000000000009';
      %s;
    END $b$$q$, dins('d1d1d1d1-0000-4000-8000-000000000009')), 'ok');
SELECT probe('upsert: over the live kept copy, DO NOTHING', 'service_role', NULL,
  kins('d2d2d2d2-0000-4000-8000-00000000000a', 'K7Q2', '{"facts":[1]}') || ' ON CONFLICT (id) DO NOTHING', 'ok');
SELECT probe('insert: a fresh kept copy', 'service_role', NULL,
  kins('e2e2e2e2-0000-4000-8000-00000000000c', 'M3P8', '{"facts":[2]}'), 'ok');
SELECT probe('update: allowed columns on the kept copy', 'service_role', NULL,
  $$UPDATE public.vet_reports SET shared_via = 'print', vet_visit_id = NULL
     WHERE id = 'd2d2d2d2-0000-4000-8000-00000000000a'$$, 'ok');

-- ── E4: delete the pet, re-create it under the same id, re-insert the copy ──
-- The pet's id is the server's to name (104 exempts the service role).
SELECT probe('E4-a: same id, softer snapshot', 'service_role', NULL,
  format($q$DO $b$ BEGIN
      DELETE FROM public.pets WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001';
      INSERT INTO public.pets VALUES ('a1a1a1a1-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
      INSERT INTO public.vet_visits (id, pet_id) VALUES ('a3a3a3a3-0000-4000-8000-000000000004', 'a1a1a1a1-0000-4000-8000-000000000001');
      %s;
    END $b$$q$, kins('d2d2d2d2-0000-4000-8000-00000000000a', 'K7Q2', '{"facts":[]}')), '23514');
SELECT probe('E4-b: same id, new label', 'service_role', NULL,
  format($q$DO $b$ BEGIN
      DELETE FROM public.pets WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001';
      INSERT INTO public.pets VALUES ('a1a1a1a1-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
      %s;
    END $b$$q$, kins('d2d2d2d2-0000-4000-8000-00000000000a', 'W4X9', '{"facts":[]}')), '23514');
SELECT probe('E4-c: new id wearing the old label', 'service_role', NULL,
  format($q$DO $b$ BEGIN
      DELETE FROM public.pets WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001';
      INSERT INTO public.pets VALUES ('a1a1a1a1-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
      %s;
    END $b$$q$, kins('f1f1f1f1-0000-4000-8000-00000000000d', 'K7Q2', '{"facts":[]}')), '23514');
SELECT probe('E4-d: a draft takes the old label by UPDATE', 'service_role', NULL,
  format($q$DO $b$ BEGIN
      DELETE FROM public.pets WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001';
      INSERT INTO public.pets VALUES ('a1a1a1a1-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
      %s;
      UPDATE public.vet_reports SET short_id = 'K7Q2' WHERE id = 'f1f1f1f1-0000-4000-8000-00000000000d';
    END $b$$q$, dins('f1f1f1f1-0000-4000-8000-00000000000d')), '23514');
SELECT probe('E4-e: after account deletion, a re-created account and pet re-insert the id', 'postgres', NULL,
  format($q$DO $b$ BEGIN
      DELETE FROM auth.users WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      INSERT INTO auth.users VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
      INSERT INTO public.pets VALUES ('a1a1a1a1-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
      %s;
    END $b$$q$, kins('d2d2d2d2-0000-4000-8000-00000000000a', 'K7Q2', '{"facts":[]}')), '23514');
SELECT probe('E4 residual: new id and new label is a new report (stated)', 'service_role', NULL,
  format($q$DO $b$ BEGIN
      DELETE FROM public.pets WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001';
      INSERT INTO public.pets VALUES ('a1a1a1a1-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
      %s;
    END $b$$q$, kins('f1f1f1f1-0000-4000-8000-00000000000d', 'W4X9', '{"facts":[]}')), 'ok');
SELECT probe('label is per pet: another pet may use K7Q2 after the first is deleted', 'service_role', NULL,
  format($q$DO $b$ BEGIN
      DELETE FROM public.pets WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001';
      %s;
    END $b$$q$, kins('f1f1f1f1-0000-4000-8000-00000000000d', 'K7Q2', '{"facts":[]}',
                    'a2a2a2a2-0000-4000-8000-000000000002')), 'ok');

-- ── The ledger: closed to every caller, append-only for its owner ───────────
SELECT probe('ledger: service role reads', 'service_role', NULL,
  $$SELECT * FROM public.vet_report_retired_ids$$, '42501');
SELECT probe('ledger: service role deletes', 'service_role', NULL,
  $$DELETE FROM public.vet_report_retired_ids$$, '42501');
SELECT probe('ledger: service role inserts', 'service_role', NULL,
  $$INSERT INTO public.vet_report_retired_ids (id, pet_id) VALUES (gen_random_uuid(), gen_random_uuid())$$, '42501');
SELECT probe('ledger: service role truncates', 'service_role', NULL,
  $$TRUNCATE public.vet_report_retired_ids$$, '42501');
SELECT probe('ledger: signed-in client reads', 'authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  $$SELECT * FROM public.vet_report_retired_ids$$, '42501');
SELECT probe('ledger: anon reads', 'anon', NULL,
  $$SELECT * FROM public.vet_report_retired_ids$$, '42501');
SELECT probe('ledger: owner deletes a retired id, then E4', 'postgres', NULL,
  $q$DO $b$ BEGIN
      DELETE FROM public.pets WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001';
      DELETE FROM public.vet_report_retired_ids;
    END $b$$q$, '23514');
SELECT probe('ledger: owner updates a retired id', 'postgres', NULL,
  $q$DO $b$ BEGIN
      DELETE FROM public.pets WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001';
      UPDATE public.vet_report_retired_ids SET short_id = NULL;
    END $b$$q$, '23514');
SELECT probe('ledger: owner truncates', 'postgres', NULL,
  $$TRUNCATE public.vet_report_retired_ids$$, '23514');

-- ── Who may call the functions ───────────────────────────────────────────────
INSERT INTO probe_results (label, who, want, got, msg)
SELECT 'grants: no caller role executes a 114 function', '-', '0',
       count(*)::text, string_agg(p.proname || ':' || r, ',')
  FROM pg_proc p
 CROSS JOIN unnest(ARRAY['anon', 'authenticated', 'service_role']) r
 WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname IN ('vet_reports_kept_not_deleted', 'retire_vet_report_id',
                     'guard_vet_report_retired', 'vet_report_retired_ids_append_only')
   AND has_function_privilege(r, p.oid, 'EXECUTE');
INSERT INTO probe_results (label, who, want, got, msg)
SELECT 'definer: the three vet_reports functions are SECURITY DEFINER', '-', '3',
       count(*) FILTER (WHERE prosecdef)::text, ''
  FROM pg_proc
 WHERE pronamespace = 'public'::regnamespace
   AND proname IN ('vet_reports_kept_not_deleted', 'retire_vet_report_id', 'guard_vet_report_retired');

-- ── C-31: no refusal names a value ──────────────────────────────────────────
INSERT INTO probe_results (label, who, want, got, msg)
SELECT 'C-31: no 23514 message carries an id or a label', '-', 'clean',
       CASE WHEN EXISTS (SELECT 1 FROM probe_results
                          WHERE got = '23514'
                            AND (msg ~ '[0-9a-f]{8}-[0-9a-f]{4}' OR msg ~ 'K7Q2|W4X9'))
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
