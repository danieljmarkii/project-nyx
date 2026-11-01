-- Probe cases for migration 113 (CUL-2287). Runs after bootstrap.sql, 110 and
-- 113 have been replayed. Every case runs in its own subtransaction and is
-- rolled back, so cases never depend on each other; the seed rows below are
-- the only shared state. Each records the SQLSTATE it got against the one it
-- wants; the run fails on any mismatch.

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

-- Fixed ids so messages can be searched for them.
--   A  = aaaaaaaa-…, the owner.       B  = bbbbbbbb-…, the other account.
--   PA = a1…  A's pet.  PA2 = a2…  A's other pet.  PB = b1…  B's pet.
--   VA = a3… visit of PA.  VB = b3… visit of PB.
--   AA = a4… appointment of PA.  AA2 = a5… appointment of PA2.  AB = b4… of PB.
--   RD = d1… draft of PA.  RK = d2… kept copy of PA, linked to VA and AA.
INSERT INTO auth.users VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO public.pets VALUES
  ('a1a1a1a1-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('a2a2a2a2-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('b1b1b1b1-0000-4000-8000-000000000003', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO public.vet_visits (id, pet_id) VALUES
  ('a3a3a3a3-0000-4000-8000-000000000004', 'a1a1a1a1-0000-4000-8000-000000000001'),
  ('b3b3b3b3-0000-4000-8000-000000000005', 'b1b1b1b1-0000-4000-8000-000000000003');
INSERT INTO public.vet_appointments (id, pet_id, reason) VALUES
  ('a4a4a4a4-0000-4000-8000-000000000006', 'a1a1a1a1-0000-4000-8000-000000000001', 'itch'),
  ('a5a5a5a5-0000-4000-8000-000000000007', 'a2a2a2a2-0000-4000-8000-000000000002', 'itch'),
  ('b4b4b4b4-0000-4000-8000-000000000008', 'b1b1b1b1-0000-4000-8000-000000000003', 'secret clinic reason');

INSERT INTO public.vet_reports
  (id, pet_id, generated_by, date_range_start, date_range_end, storage_path,
   report_version, renderer_fingerprint, params, scope_basis, created_at)
VALUES
  ('d1d1d1d1-0000-4000-8000-000000000009', 'a1a1a1a1-0000-4000-8000-000000000001',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-09-01', '2026-10-30',
   'a1a1a1a1-0000-4000-8000-000000000001/d1d1d1d1-0000-4000-8000-000000000009.html',
   'v2', 'fp-1', '{"window":"60d"}', 'since_last_visit', NOW() - INTERVAL '2 days');
INSERT INTO public.vet_reports
  (id, pet_id, generated_by, date_range_start, date_range_end, storage_path,
   report_version, renderer_fingerprint, params, scope_basis, status, snapshot,
   short_id, shared_via, shared_at, vet_visit_id, vet_appointment_id,
   ai_lead_text, ai_lead_verdict, ai_lead_model, content_sha256)
VALUES
  ('d2d2d2d2-0000-4000-8000-00000000000a', 'a1a1a1a1-0000-4000-8000-000000000001',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-09-01', '2026-10-30',
   'a1a1a1a1-0000-4000-8000-000000000001/d2d2d2d2-0000-4000-8000-00000000000a.pdf',
   'v2', 'fp-1', '{"window":"60d"}', 'since_last_visit', 'kept', '{"facts":[1]}',
   'K7Q2', 'share_sheet', NOW(), 'a3a3a3a3-0000-4000-8000-000000000004',
   'a4a4a4a4-0000-4000-8000-000000000006',
   'Cooper vomited 4 times.', '{"pass":true}', 'model-x', repeat('ab', 32));

-- A valid draft insert for PA, with one field swappable via replace().
CREATE FUNCTION ins(over text DEFAULT '') RETURNS text LANGUAGE sql AS $$
  SELECT format($f$
    INSERT INTO public.vet_reports
      (id, pet_id, generated_by, date_range_start, date_range_end, storage_path,
       report_version, renderer_fingerprint, params, scope_basis %1$s)
    SELECT 'e1e1e1e1-0000-4000-8000-00000000000b', 'a1a1a1a1-0000-4000-8000-000000000001',
       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-09-01', '2026-10-30',
       'a1a1a1a1-0000-4000-8000-000000000001/e1e1e1e1-0000-4000-8000-00000000000b.pdf',
       'v2', 'fp-1', '{}', 'since_last_visit' %2$s
  $f$, split_part(over, '|', 1), split_part(over, '|', 2))
$$;

-- A SECURITY DEFINER function owned by the migration owner, callable by the
-- service role, that edits a kept copy: CUL-2318's case.
CREATE FUNCTION public.probe_definer_edit() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.vet_reports SET params = '{"tampered":true}'
   WHERE id = 'd2d2d2d2-0000-4000-8000-00000000000a'
$$;
GRANT EXECUTE ON FUNCTION public.probe_definer_edit() TO service_role;

\o /dev/null
-- ── Inserts: the shape (service role) ────────────────────────────────────────
SELECT probe('insert: valid draft', 'service_role', NULL, ins(), 'ok');
SELECT probe('insert: valid kept', 'service_role', NULL,
  ins(', status, snapshot, short_id, shared_via, shared_at, content_sha256| , ''kept'', ''{}'', ''ZZ99'', ''print'', now(), repeat(''ab'', 32)'), 'ok');
SELECT probe('insert: .html key', 'service_role', NULL,
  replace(ins(), '0000000b.pdf', '0000000b.html'), 'ok');
SELECT probe('path: another row''s id', 'service_role', NULL,
  replace(ins(), '/e1e1e1e1-0000-4000-8000-00000000000b.pdf', '/d1d1d1d1-0000-4000-8000-000000000009.pdf'), '23514');
SELECT probe('path: another pet''s prefix', 'service_role', NULL,
  replace(ins(), '''a1a1a1a1-0000-4000-8000-000000000001/', '''b1b1b1b1-0000-4000-8000-000000000003/'), '23514');
SELECT probe('path: traversal', 'service_role', NULL,
  replace(ins(), '/e1e1e1e1-0000-4000-8000-00000000000b.pdf', '/../b1b1b1b1-0000-4000-8000-000000000003/e1e1e1e1-0000-4000-8000-00000000000b.pdf'), '23514');
SELECT probe('path: three segments', 'service_role', NULL,
  replace(ins(), '/e1e1e1e1-0000-4000-8000-00000000000b.pdf', '/e1e1e1e1-0000-4000-8000-00000000000b/report.pdf'), '23514');
SELECT probe('path: upper-case id', 'service_role', NULL,
  replace(ins(), '/e1e1e1e1-0000-4000-8000-00000000000b.pdf', '/E1E1E1E1-0000-4000-8000-00000000000B.pdf'), '23514');
SELECT probe('path: .json', 'service_role', NULL,
  replace(ins(), '0000000b.pdf', '0000000b.json'), '23514');
SELECT probe('token: share_token set', 'service_role', NULL,
  ins(', share_token| , uuid_generate_v4()'), '23514');
SELECT probe('token: expiry set', 'service_role', NULL,
  ins(', token_expires_at| , now() + interval ''1 day'''), '23514');
SELECT probe('status: unknown', 'service_role', NULL, ins(', status| , ''sent'''), '23514');
SELECT probe('kept: no snapshot', 'service_role', NULL,
  ins(', status, short_id, shared_via, shared_at, content_sha256| , ''kept'', ''ZZ98'', ''print'', now(), repeat(''ab'', 32)'), '23514');
SELECT probe('kept: no content hash', 'service_role', NULL,
  ins(', status, snapshot, short_id, shared_via, shared_at| , ''kept'', ''{}'', ''ZZ96'', ''print'', now()'), '23514');
SELECT probe('content hash: upper-case hex', 'service_role', NULL,
  ins(', content_sha256| , repeat(''AB'', 32)'), '23514');
SELECT probe('kept: no departure', 'service_role', NULL,
  ins(', status, snapshot, short_id, content_sha256| , ''kept'', ''{}'', ''ZZ97'', repeat(''ab'', 32)'), '23514');
SELECT probe('shared: via without at', 'service_role', NULL, ins(', shared_via| , ''print'''), '23514');
SELECT probe('short_id: I is not Crockford', 'service_role', NULL, ins(', short_id| , ''ABCI'''), '23514');
SELECT probe('short_id: lower-case', 'service_role', NULL, ins(', short_id| , ''abcd'''), '23514');
SELECT probe('short_id: duplicate on the pet', 'service_role', NULL, ins(', short_id| , ''K7Q2'''), '23505');
SELECT probe('short_id: same id, other pet', 'service_role', NULL,
  replace(replace(ins(', short_id| , ''K7Q2'''),
    '''a1a1a1a1-0000-4000-8000-000000000001''', '''a2a2a2a2-0000-4000-8000-000000000002'''),
    '''a1a1a1a1-0000-4000-8000-000000000001/', '''a2a2a2a2-0000-4000-8000-000000000002/'), 'ok');
SELECT probe('ai lead: text without verdict', 'service_role', NULL,
  ins(', ai_lead_text, ai_lead_model| , ''Cooper vomited.'', ''m'''), '23514');
SELECT probe('ai lead: verdict without text (lead dropped)', 'service_role', NULL,
  ins(', ai_lead_verdict, ai_lead_model| , ''{"pass":false}'', ''m'''), 'ok');
SELECT probe('params: not an object', 'service_role', NULL, replace(ins(), '''{}''', '''[]'''), '23514');
SELECT probe('photos_left_out: negative', 'service_role', NULL, ins(', photos_left_out| , -1'), '23514');

-- ── CUL-2317: the maker is the pet's owner ───────────────────────────────────
SELECT probe('maker: B on A''s pet', 'service_role', NULL,
  replace(ins(), '''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa''', '''bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'''), '23514');
SELECT probe('maker: no such user, migration owner', 'postgres', NULL,
  replace(ins(), '''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa''', '''cccccccc-cccc-4ccc-8ccc-cccccccccccc'''), '23514');
SELECT probe('maker: kept row re-pointed to B', 'service_role', NULL,
  $$UPDATE public.vet_reports SET generated_by = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' WHERE id = 'd1d1d1d1-0000-4000-8000-000000000009'$$, '23514');

-- ── Visit links ──────────────────────────────────────────────────────────────
SELECT probe('visit: own pet''s visit', 'service_role', NULL,
  ins(', vet_visit_id| , ''a3a3a3a3-0000-4000-8000-000000000004'''), 'ok');
SELECT probe('visit: B''s visit', 'service_role', NULL,
  ins(', vet_visit_id| , ''b3b3b3b3-0000-4000-8000-000000000005'''), '23514');
SELECT probe('appointment: own pet''s', 'service_role', NULL,
  ins(', vet_appointment_id| , ''a4a4a4a4-0000-4000-8000-000000000006'''), 'ok');
SELECT probe('appointment: A''s other pet''s', 'service_role', NULL,
  ins(', vet_appointment_id| , ''a5a5a5a5-0000-4000-8000-000000000007'''), '23514');
SELECT probe('appointment: B''s', 'service_role', NULL,
  ins(', vet_appointment_id| , ''b4b4b4b4-0000-4000-8000-000000000008'''), '23514');
SELECT probe('appointment: link a draft later', 'service_role', NULL,
  $$UPDATE public.vet_reports SET vet_appointment_id = 'a4a4a4a4-0000-4000-8000-000000000006' WHERE id = 'd1d1d1d1-0000-4000-8000-000000000009'$$, 'ok');

-- ── The content freeze: kept rows, every writer ──────────────────────────────
SELECT probe('draft: service edits content', 'service_role', NULL,
  $$UPDATE public.vet_reports SET params = '{"window":"30d"}', snapshot = '{}' WHERE id = 'd1d1d1d1-0000-4000-8000-000000000009'$$, 'ok');
SELECT probe('draft: becomes kept', 'service_role', NULL,
  $$UPDATE public.vet_reports SET status = 'kept', snapshot = '{}', short_id = 'AB12', shared_via = 'print', shared_at = now(), content_sha256 = repeat('cd', 32) WHERE id = 'd1d1d1d1-0000-4000-8000-000000000009'$$, 'ok');
SELECT probe('kept: service edits params', 'service_role', NULL,
  $$UPDATE public.vet_reports SET params = '{"window":"30d"}' WHERE id = 'd2d2d2d2-0000-4000-8000-00000000000a'$$, '23514');
SELECT probe('kept: migration owner edits snapshot', 'postgres', NULL,
  $$UPDATE public.vet_reports SET snapshot = '{"facts":[2]}' WHERE id = 'd2d2d2d2-0000-4000-8000-00000000000a'$$, '23514');
SELECT probe('kept: service edits ai lead', 'service_role', NULL,
  $$UPDATE public.vet_reports SET ai_lead_text = 'Cooper is fine.' WHERE id = 'd2d2d2d2-0000-4000-8000-00000000000a'$$, '23514');
SELECT probe('kept: back to draft', 'service_role', NULL,
  $$UPDATE public.vet_reports SET status = 'draft' WHERE id = 'd2d2d2d2-0000-4000-8000-00000000000a'$$, '23514');
SELECT probe('kept: storage_path to .html', 'service_role', NULL,
  $$UPDATE public.vet_reports SET storage_path = replace(storage_path, '.pdf', '.html') WHERE id = 'd2d2d2d2-0000-4000-8000-00000000000a'$$, '23514');
SELECT probe('kept: dates moved', 'service_role', NULL,
  $$UPDATE public.vet_reports SET date_range_start = '2026-08-01' WHERE id = 'd2d2d2d2-0000-4000-8000-00000000000a'$$, '23514');
SELECT probe('kept: unlink visit', 'service_role', NULL,
  $$UPDATE public.vet_reports SET vet_visit_id = NULL WHERE id = 'd2d2d2d2-0000-4000-8000-00000000000a'$$, 'ok');
SELECT probe('kept: new departure', 'service_role', NULL,
  $$UPDATE public.vet_reports SET shared_via = 'email', shared_at = now() WHERE id = 'd2d2d2d2-0000-4000-8000-00000000000a'$$, 'ok');
SELECT probe('kept: departure cleared', 'service_role', NULL,
  $$UPDATE public.vet_reports SET shared_via = NULL, shared_at = NULL WHERE id = 'd2d2d2d2-0000-4000-8000-00000000000a'$$, '23514');
SELECT probe('kept: no-op update passes', 'service_role', NULL,
  $$UPDATE public.vet_reports SET params = params WHERE id = 'd2d2d2d2-0000-4000-8000-00000000000a'$$, 'ok');
SELECT probe('kept: DEFINER fn called by service role', 'service_role', NULL,
  $$SELECT public.probe_definer_edit()$$, '23514');
SELECT probe('kept: content hash swapped', 'service_role', NULL,
  $$UPDATE public.vet_reports SET content_sha256 = repeat('ef', 32) WHERE id = 'd2d2d2d2-0000-4000-8000-00000000000a'$$, '23514');

-- ── F1: a kept copy is not deleted and re-inserted ───────────────────────────
SELECT probe('kept: service deletes it', 'service_role', NULL,
  $$DELETE FROM public.vet_reports WHERE id = 'd2d2d2d2-0000-4000-8000-00000000000a'$$, '23514');
SELECT probe('kept: migration owner deletes it', 'postgres', NULL,
  $$DELETE FROM public.vet_reports WHERE id = 'd2d2d2d2-0000-4000-8000-00000000000a'$$, '23514');
SELECT probe('kept: delete and re-insert softened', 'service_role', NULL,
  $q$DO $d$ BEGIN
      CREATE TEMP TABLE k ON COMMIT DROP AS SELECT * FROM public.vet_reports WHERE id = 'd2d2d2d2-0000-4000-8000-00000000000a';
      DELETE FROM public.vet_reports WHERE id = 'd2d2d2d2-0000-4000-8000-00000000000a';
      UPDATE k SET snapshot = '{"facts":[]}';
      INSERT INTO public.vet_reports SELECT * FROM k;
    END $d$ $q$, '23514');
SELECT probe('service: TRUNCATE', 'service_role', NULL, $$TRUNCATE public.vet_reports$$, '23514');
SELECT probe('draft: service deletes it', 'service_role', NULL,
  $$DELETE FROM public.vet_reports WHERE id = 'd1d1d1d1-0000-4000-8000-000000000009'$$, 'ok');

-- ── F6: id and storage_path never change, drafts included ────────────────────
SELECT probe('draft: re-keyed (id and path)', 'service_role', NULL,
  $$UPDATE public.vet_reports SET id = 'f1f1f1f1-0000-4000-8000-00000000000c',
      storage_path = 'a1a1a1a1-0000-4000-8000-000000000001/f1f1f1f1-0000-4000-8000-00000000000c.html'
    WHERE id = 'd1d1d1d1-0000-4000-8000-000000000009'$$, '23514');
SELECT probe('draft: extension switched', 'service_role', NULL,
  $$UPDATE public.vet_reports SET storage_path = replace(storage_path, '.html', '.pdf') WHERE id = 'd1d1d1d1-0000-4000-8000-000000000009'$$, '23514');

-- ── F3: with the no-live-token CHECK dropped (the future public-link
-- migration), the freezes alone decide the expiry. Setup runs as the owner;
-- the attempt as client A.
CREATE FUNCTION tok(target text, stmt text) RETURNS text LANGUAGE sql AS $f$
  SELECT format($s$DO $d$ BEGIN
      ALTER TABLE public.vet_reports DROP CONSTRAINT vet_reports_no_live_token;
      %1$s
      PERFORM set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
      SET LOCAL ROLE authenticated;
      %2$s
    END $d$$s$, target, stmt)
$f$;
-- A draft with a live expiry, and a kept copy with one.
\set draft_tok 'UPDATE public.vet_reports SET share_token = uuid_generate_v4(), token_expires_at = now() + interval ''30 days'' WHERE id = ''d1d1d1d1-0000-4000-8000-000000000009'';'
\set kept_tok 'INSERT INTO public.vet_reports (id, pet_id, generated_by, date_range_start, date_range_end, storage_path, report_version, renderer_fingerprint, params, scope_basis, status, snapshot, short_id, shared_via, shared_at, content_sha256, share_token, token_expires_at) VALUES (''c1c1c1c1-0000-4000-8000-00000000000d'', ''a1a1a1a1-0000-4000-8000-000000000001'', ''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'', ''2026-09-01'', ''2026-10-30'', ''a1a1a1a1-0000-4000-8000-000000000001/c1c1c1c1-0000-4000-8000-00000000000d.pdf'', ''v2'', ''fp'', ''{}'', ''s'', ''kept'', ''{}'', ''TK01'', ''link'', now(), repeat(''ab'', 32), uuid_generate_v4(), now() + interval ''30 days'');'
SELECT probe('token, draft: client clears the expiry (NULL)', 'postgres', NULL,
  tok(:'draft_tok', $$UPDATE public.vet_reports SET token_expires_at = NULL WHERE id = 'd1d1d1d1-0000-4000-8000-000000000009';$$), '23514');
SELECT probe('token, draft: client extends the expiry', 'postgres', NULL,
  tok(:'draft_tok', $$UPDATE public.vet_reports SET token_expires_at = 'infinity' WHERE id = 'd1d1d1d1-0000-4000-8000-000000000009';$$), '23514');
SELECT probe('token, draft: client sets an expiry where there was none', 'postgres', NULL,
  tok('', $$UPDATE public.vet_reports SET token_expires_at = '9999-01-01' WHERE id = 'd1d1d1d1-0000-4000-8000-000000000009';$$), '23514');
SELECT probe('token, draft: client moves it earlier (revoke)', 'postgres', NULL,
  tok(:'draft_tok', $$UPDATE public.vet_reports SET token_expires_at = now() WHERE id = 'd1d1d1d1-0000-4000-8000-000000000009';$$), 'ok');
SELECT probe('token, kept: client clears the expiry (NULL)', 'postgres', NULL,
  tok(:'kept_tok', $$UPDATE public.vet_reports SET token_expires_at = NULL WHERE id = 'c1c1c1c1-0000-4000-8000-00000000000d';$$), '23514');
SELECT probe('token, kept: client moves it earlier (revoke)', 'postgres', NULL,
  tok(:'kept_tok', $$UPDATE public.vet_reports SET token_expires_at = now() WHERE id = 'c1c1c1c1-0000-4000-8000-00000000000d';$$), 'ok');
SELECT probe('token, kept: service clears the expiry (content freeze alone)', 'postgres', NULL,
  replace(replace(tok(:'kept_tok', $$UPDATE public.vet_reports SET token_expires_at = NULL WHERE id = 'c1c1c1c1-0000-4000-8000-00000000000d';$$),
    'SET LOCAL ROLE authenticated;', 'SET LOCAL ROLE service_role;'),
    '''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'', true)', ''''', true)'), '23514');

-- ── Clients (110's boundary, unchanged by 113) ───────────────────────────────
SELECT probe('client A: reads own copies', 'authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  $q$DO $d$ BEGIN IF (SELECT count(*) FROM public.vet_reports) <> 2 THEN RAISE EXCEPTION 'count'; END IF; END $d$ $q$, 'ok');
SELECT probe('client B: reads none of A''s', 'authenticated', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  $q$DO $d$ BEGIN IF (SELECT count(*) FROM public.vet_reports) <> 0 THEN RAISE EXCEPTION 'count'; END IF; END $d$ $q$, 'ok');
SELECT probe('anon: reads', 'anon', NULL, $$SELECT * FROM public.vet_reports$$, '42501');
SELECT probe('client A: insert', 'authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ins(), '42501');
SELECT probe('client A: link a visit', 'authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  $$UPDATE public.vet_reports SET vet_visit_id = NULL WHERE id = 'd2d2d2d2-0000-4000-8000-00000000000a'$$, '42501');
SELECT probe('client A: delete', 'authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  $$DELETE FROM public.vet_reports$$, '42501');
SELECT probe('client A: mint expiry on a kept copy', 'authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  $$UPDATE public.vet_reports SET token_expires_at = now() + interval '9 years' WHERE id = 'd2d2d2d2-0000-4000-8000-00000000000a'$$, '23514');
SELECT probe('client A: mint expiry on a draft', 'authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  $$UPDATE public.vet_reports SET token_expires_at = now() + interval '9 years' WHERE id = 'd1d1d1d1-0000-4000-8000-000000000009'$$, '23514');

-- ── FK actions reach vet_reports as UPDATE / DELETE (§7b) ────────────────────
SELECT probe('client A: deletes the linked visit (SET NULL)', 'authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  $q$DO $d$ BEGIN
      DELETE FROM public.vet_visits WHERE id = 'a3a3a3a3-0000-4000-8000-000000000004';
      IF (SELECT vet_visit_id FROM public.vet_reports WHERE id = 'd2d2d2d2-0000-4000-8000-00000000000a') IS NOT NULL
        THEN RAISE EXCEPTION 'not unlinked'; END IF;
    END $d$ $q$, 'ok');
SELECT probe('client A: cannot hard-delete an appointment (066: no policy)', 'authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  $q$DO $d$ BEGIN
      DELETE FROM public.vet_appointments WHERE id = 'a4a4a4a4-0000-4000-8000-000000000006';
      IF EXISTS (SELECT 1 FROM public.vet_reports WHERE vet_appointment_id IS NULL AND id = 'd2d2d2d2-0000-4000-8000-00000000000a')
        THEN RAISE EXCEPTION 'unlinked'; END IF;
    END $d$ $q$, 'ok');
SELECT probe('service: deletes the linked appointment (SET NULL on a kept copy)', 'service_role', NULL,
  $q$DO $d$ BEGIN
      DELETE FROM public.vet_appointments WHERE id = 'a4a4a4a4-0000-4000-8000-000000000006';
      IF (SELECT vet_appointment_id FROM public.vet_reports WHERE id = 'd2d2d2d2-0000-4000-8000-00000000000a') IS NOT NULL
        THEN RAISE EXCEPTION 'not unlinked'; END IF;
    END $d$ $q$, 'ok');
SELECT probe('client A: deletes the pet (cascade)', 'authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  $q$DO $d$ BEGIN
      DELETE FROM public.pets WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001';
      IF EXISTS (SELECT 1 FROM public.vet_reports) THEN RAISE EXCEPTION 'rows survived'; END IF;
    END $d$ $q$, 'ok');
SELECT probe('service: deletes the account (cascade)', 'service_role', NULL,
  $q$DO $d$ BEGIN
      DELETE FROM auth.users WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      IF EXISTS (SELECT 1 FROM public.vet_reports) THEN RAISE EXCEPTION 'rows survived'; END IF;
    END $d$ $q$, 'ok');
SELECT probe('reaper: service deletes drafts older than 24 h', 'service_role', NULL,
  $q$DO $d$ BEGIN
      DELETE FROM public.vet_reports WHERE status = 'draft' AND created_at < now() - interval '24 hours';
      IF EXISTS (SELECT 1 FROM public.vet_reports WHERE status = 'draft') THEN RAISE EXCEPTION 'draft survived'; END IF;
      IF NOT EXISTS (SELECT 1 FROM public.vet_reports WHERE status = 'kept') THEN RAISE EXCEPTION 'kept reaped'; END IF;
    END $d$ $q$, 'ok');

-- ── §6: vet_appointments.pet_id is immutable ─────────────────────────────────
SELECT probe('appointment: client moves it to A''s other pet', 'authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  $$UPDATE public.vet_appointments SET pet_id = 'a2a2a2a2-0000-4000-8000-000000000002' WHERE id = 'a4a4a4a4-0000-4000-8000-000000000006'$$, '23514');
SELECT probe('appointment: upsert re-sends the same pet', 'authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  $$INSERT INTO public.vet_appointments (id, pet_id, reason)
      VALUES ('a4a4a4a4-0000-4000-8000-000000000006', 'a1a1a1a1-0000-4000-8000-000000000001', 'itch, worse')
    ON CONFLICT (id) DO UPDATE SET pet_id = EXCLUDED.pet_id, reason = EXCLUDED.reason$$, 'ok');
SELECT probe('appointment: service moves it', 'service_role', NULL,
  $$UPDATE public.vet_appointments SET pet_id = 'a2a2a2a2-0000-4000-8000-000000000002' WHERE id = 'a4a4a4a4-0000-4000-8000-000000000006'$$, '23514');

-- ── C-31: what a guard's message can carry ───────────────────────────────────
-- The victim pair (B's real appointment and pet) and a random pair must give
-- the same SQLSTATE, and no message may carry anything read from B's rows: B's
-- user id where the statement did not send it, or the appointment's reason.
SELECT probe('C-31: B''s real appointment on A''s pet', 'service_role', NULL,
  ins(', vet_appointment_id| , ''b4b4b4b4-0000-4000-8000-000000000008'''), '23514');
SELECT probe('C-31: random appointment on A''s pet', 'service_role', NULL,
  ins(', vet_appointment_id| , ''99999999-0000-4000-8000-000000000099'''), '23514');
SELECT probe('C-31: maker guard on B''s pet', 'service_role', NULL,
  replace(replace(ins(), '''a1a1a1a1-0000-4000-8000-000000000001''', '''b1b1b1b1-0000-4000-8000-000000000003'''),
    '''a1a1a1a1-0000-4000-8000-000000000001/', '''b1b1b1b1-0000-4000-8000-000000000003/'), '23514');
SELECT probe('C-31: client A cannot reach B''s appointment (0 rows, no 23514)', 'authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  $$UPDATE public.vet_appointments SET pet_id = 'a1a1a1a1-0000-4000-8000-000000000001' WHERE id = 'b4b4b4b4-0000-4000-8000-000000000008'$$, 'ok');

INSERT INTO probe_results (label, who, want, got, msg)
SELECT 'C-31: no message names B''s user id or reason', '-', 'clean',
       CASE WHEN EXISTS (SELECT 1 FROM probe_results
                          WHERE (msg ILIKE '%bbbbbbbb-bbbb%' AND stmt NOT ILIKE '%bbbbbbbb-bbbb%')
                             OR msg ILIKE '%secret clinic%')
            THEN 'LEAK' ELSE 'clean' END, '';
INSERT INTO probe_results (label, who, want, got, msg)
SELECT 'C-31: victim and random appointment give one message shape', '-', 'same',
       CASE WHEN (SELECT regexp_replace(msg, '[0-9a-f-]{36}', 'X', 'g') FROM probe_results WHERE label = 'C-31: B''s real appointment on A''s pet')
               = (SELECT regexp_replace(msg, '[0-9a-f-]{36}', 'X', 'g') FROM probe_results WHERE label = 'C-31: random appointment on A''s pet')
            THEN 'same' ELSE 'differ' END, '';

\o
\echo
SELECT n, CASE WHEN want = got THEN 'PASS' ELSE 'FAIL' END AS r, label, who, want, got,
       left(msg, 110) AS msg
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
