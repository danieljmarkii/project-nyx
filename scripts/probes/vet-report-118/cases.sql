-- Probe cases for migration 118 (CUL-2377). Runs after 113's bootstrap.sql,
-- 110, 113, 114, 100, 112 and 118 (§3 cut) have been replayed by run.sh.
-- Every case runs in its own subtransaction and is rolled back, so cases never
-- depend on each other; the seed rows below are the only shared state. Each
-- records what it got against what it wants; the run fails on any mismatch.
--
-- A case runs its statement as `who` (PostgREST's SET ROLE simulated with SET
-- LOCAL ROLE, auth.uid() from request.jwt.claim.sub), then, back as the owner,
-- reads `leads()`: each seeded row's summary state and the two consent answers.
-- got is that reading, or the SQLSTATE if the statement failed.
--
-- The wants differ by VARIANT (run.sh): full (118 as written), no118 (118 left
-- out: a "no" leaves the summary) and no-arm (118 without §2's freeze arm: the
-- clear fails inside the withdrawal, which still commits).

CREATE TABLE probe_results (n serial, label text, who text, want text, got text, msg text);

-- Ids: A = aaaaaaaa-…, B = bbbbbbbb-…. PA = a1… (A's pet), PB = b1… (B's pet).
--   DA1, DA2 = A's drafts holding a summary; DB = B's draft holding one;
--   KA = A's kept copy holding one.
INSERT INTO auth.users VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO public.pets VALUES
  ('a1a1a1a1-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('b1b1b1b1-0000-4000-8000-000000000003', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

CREATE FUNCTION seed_report(rid text, pet text, maker text, kept boolean) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.vet_reports
    (id, pet_id, generated_by, date_range_start, date_range_end, storage_path,
     report_version, renderer_fingerprint, params, scope_basis, status, snapshot,
     short_id, shared_via, shared_at, ai_lead_text, ai_lead_verdict, ai_lead_model,
     content_sha256)
  VALUES (rid::uuid, pet::uuid, maker::uuid, '2026-09-01', '2026-10-30',
     pet || '/' || rid || '.html', 'v2', 'fp-1', '{}', 'since_last_visit',
     CASE WHEN kept THEN 'kept' ELSE 'draft' END, '{"facts":[1]}',
     upper(substr(md5(rid), 1, 4)) , CASE WHEN kept THEN 'share' END,
     CASE WHEN kept THEN now() END, 'Cooper vomited 4 times.',
     '{"outcome":"printed","sentences":[{"text":"Cooper vomited 4 times."}]}', 'model-x',
     CASE WHEN kept THEN repeat('ab', 32) END);
END;
$$;
-- Short ids must be Crockford; md5 hex is 0-9a-f, upper-cased: all Crockford.
SELECT seed_report('d1d1d1d1-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
SELECT seed_report('d2d2d2d2-0000-4000-8000-000000000002', 'a1a1a1a1-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
SELECT seed_report('d3d3d3d3-0000-4000-8000-000000000003', 'b1b1b1b1-0000-4000-8000-000000000003', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false);
SELECT seed_report('d4d4d4d4-0000-4000-8000-000000000004', 'a1a1a1a1-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);

-- Both accounts said yes to both scopes.
INSERT INTO public.ai_consent (user_id, scope, granted, copy_version, source) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ai_boundary', true, '2026-10-11', 'onboarding'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'report_summary', true, '2026-11-01', 'settings'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'ai_boundary', true, '2026-10-11', 'onboarding'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'report_summary', true, '2026-11-01', 'settings');

-- The reading: per row, 'set' (all three summary columns hold a value),
-- 'clear' (all three NULL) or 'mixed'; then A's two answers.
CREATE FUNCTION leads() RETURNS text LANGUAGE sql AS $$
  SELECT (SELECT string_agg(
            CASE id::text
              WHEN 'd1d1d1d1-0000-4000-8000-000000000001' THEN 'DA1'
              WHEN 'd2d2d2d2-0000-4000-8000-000000000002' THEN 'DA2'
              WHEN 'd3d3d3d3-0000-4000-8000-000000000003' THEN 'DB'
              ELSE 'KA' END || '=' ||
            CASE WHEN ai_lead_text IS NOT NULL AND ai_lead_verdict IS NOT NULL AND ai_lead_model IS NOT NULL THEN 'set'
                 WHEN ai_lead_text IS NULL AND ai_lead_verdict IS NULL AND ai_lead_model IS NULL THEN 'clear'
                 ELSE 'mixed' END, ' ' ORDER BY id)
            FROM public.vet_reports)
      || ' | A:' || (SELECT string_agg(scope || '=' || granted::text, ',' ORDER BY scope)
                      FROM public.ai_consent WHERE user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
$$;

CREATE FUNCTION probe(label text, who text, sub uuid, stmt text, want text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  got text;
  m   text := '';
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', coalesce(sub::text, ''), true);
    IF who <> 'postgres' THEN
      EXECUTE format('SET LOCAL ROLE %I', who);
    END IF;
    EXECUTE stmt;
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claim.sub', '', true);
    got := leads();
    RAISE EXCEPTION 'probe_ok';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'probe_ok' THEN got := SQLSTATE; m := SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  INSERT INTO probe_results (label, who, want, got, msg) VALUES (label, who, want, got, m);
END;
$$;

-- w(full, no118, noarm): the want for this run's VARIANT.
CREATE FUNCTION w(full_v text, no118 text, noarm text) RETURNS text LANGUAGE sql AS $$
  SELECT CASE current_setting('probe.variant') WHEN 'no118' THEN no118 WHEN 'no-arm' THEN noarm ELSE full_v END
$$;
SELECT set_config('probe.variant', :'variant', false);

-- Vehicles for the arm's edges. A probe-only BEFORE UPDATE blocker (W6), and
-- two hooks a client role can fire: one INVOKER (current_user stays the client
-- role) and one DEFINER (current_user is the owner), each running at depth 2.
CREATE FUNCTION public.probe_block() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('probe.block', true) = 'on' THEN
    RAISE EXCEPTION 'probe blocker' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_vet_reports_aaa_probe_block BEFORE UPDATE ON public.vet_reports
  FOR EACH ROW EXECUTE FUNCTION public.probe_block();

CREATE TABLE public.probe_hook (what text);
GRANT INSERT ON public.probe_hook TO authenticated;
CREATE FUNCTION public.probe_hook_invoker() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.vet_reports SET ai_lead_text = NULL, ai_lead_verdict = NULL, ai_lead_model = NULL
   WHERE id = 'd1d1d1d1-0000-4000-8000-000000000001';
  RETURN NULL;
END;
$$;
CREATE FUNCTION public.probe_hook_definer() RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.what = 'snapshot' THEN
    UPDATE public.vet_reports SET ai_lead_text = NULL, ai_lead_verdict = NULL, ai_lead_model = NULL,
           snapshot = '{"facts":[]}' WHERE id = 'd1d1d1d1-0000-4000-8000-000000000001';
  ELSIF NEW.what = 'kept' THEN
    UPDATE public.vet_reports SET ai_lead_text = NULL, ai_lead_verdict = NULL, ai_lead_model = NULL
     WHERE id = 'd4d4d4d4-0000-4000-8000-000000000004';
  ELSIF NEW.what = 'text-only' THEN
    UPDATE public.vet_reports SET ai_lead_text = NULL WHERE id = 'd1d1d1d1-0000-4000-8000-000000000001';
  ELSIF NEW.what = 'to-kept' THEN
    UPDATE public.vet_reports SET ai_lead_text = NULL, ai_lead_verdict = NULL, ai_lead_model = NULL,
           status = 'kept', shared_via = 'share', shared_at = now(), content_sha256 = repeat('cd', 32)
     WHERE id = 'd1d1d1d1-0000-4000-8000-000000000001';
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_probe_hook_invoker AFTER INSERT ON public.probe_hook
  FOR EACH ROW WHEN (NEW.what = 'invoker') EXECUTE FUNCTION public.probe_hook_invoker();
CREATE TRIGGER trg_probe_hook_definer AFTER INSERT ON public.probe_hook
  FOR EACH ROW WHEN (NEW.what <> 'invoker') EXECUTE FUNCTION public.probe_hook_definer();

\o /dev/null
-- ── The withdrawal clear ─────────────────────────────────────────────────────
SELECT probe('W0: nothing done', 'postgres', NULL, $$SELECT 1$$,
  'DA1=set DA2=set DB=set KA=set | A:ai_boundary=true,report_summary=true');

SELECT probe('W1: A says no to report_summary', 'authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  $$UPDATE public.ai_consent SET granted = false WHERE user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND scope = 'report_summary'$$,
  w('DA1=clear DA2=clear DB=set KA=set | A:ai_boundary=true,report_summary=false',
    'DA1=set DA2=set DB=set KA=set | A:ai_boundary=true,report_summary=false',
    'DA1=set DA2=set DB=set KA=set | A:ai_boundary=true,report_summary=false'));

SELECT probe('W2: A says no to ai_boundary', 'authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  $$UPDATE public.ai_consent SET granted = false WHERE user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND scope = 'ai_boundary'$$,
  w('DA1=clear DA2=clear DB=set KA=set | A:ai_boundary=false,report_summary=true',
    'DA1=set DA2=set DB=set KA=set | A:ai_boundary=false,report_summary=true',
    'DA1=set DA2=set DB=set KA=set | A:ai_boundary=false,report_summary=true'));

-- PostgREST's upsert: every payload column written back, keys included.
SELECT probe('W3: A says no through an upsert', 'authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  $$INSERT INTO public.ai_consent (user_id, scope, granted, copy_version, source)
    VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'report_summary', false, '2026-11-01', 'settings')
    ON CONFLICT (user_id, scope) DO UPDATE SET user_id = EXCLUDED.user_id, scope = EXCLUDED.scope,
      granted = EXCLUDED.granted, copy_version = EXCLUDED.copy_version, source = EXCLUDED.source$$,
  w('DA1=clear DA2=clear DB=set KA=set | A:ai_boundary=true,report_summary=false',
    'DA1=set DA2=set DB=set KA=set | A:ai_boundary=true,report_summary=false',
    'DA1=set DA2=set DB=set KA=set | A:ai_boundary=true,report_summary=false'));

SELECT probe('W4: A says yes again: nothing cleared', 'authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  $$UPDATE public.ai_consent SET granted = true, copy_version = '2026-11-02' WHERE user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND scope = 'report_summary'$$,
  'DA1=set DA2=set DB=set KA=set | A:ai_boundary=true,report_summary=true');

SELECT probe('W5: B says no: only B''s draft clears', 'authenticated', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  $$UPDATE public.ai_consent SET granted = false WHERE user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' AND scope = 'report_summary'$$,
  w('DA1=set DA2=set DB=clear KA=set | A:ai_boundary=true,report_summary=true',
    'DA1=set DA2=set DB=set KA=set | A:ai_boundary=true,report_summary=true',
    'DA1=set DA2=set DB=set KA=set | A:ai_boundary=true,report_summary=true'));

SELECT probe('W6: the clear fails: the "no" still commits', 'authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  $$SELECT set_config('probe.block', 'on', true);
    UPDATE public.ai_consent SET granted = false WHERE user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND scope = 'report_summary'$$,
  'DA1=set DA2=set DB=set KA=set | A:ai_boundary=true,report_summary=false');

SELECT probe('W7: a server-side "no" (service role) clears too', 'service_role', NULL,
  $$UPDATE public.ai_consent SET granted = false WHERE user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND scope = 'ai_boundary'$$,
  w('DA1=clear DA2=clear DB=set KA=set | A:ai_boundary=false,report_summary=true',
    'DA1=set DA2=set DB=set KA=set | A:ai_boundary=false,report_summary=true',
    'DA1=clear DA2=clear DB=set KA=set | A:ai_boundary=false,report_summary=true'));

-- ── The freeze arm's edges ───────────────────────────────────────────────────
SELECT probe('F1: A clears a draft summary directly (no column grant)', 'authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  $$UPDATE public.vet_reports SET ai_lead_text = NULL, ai_lead_verdict = NULL, ai_lead_model = NULL WHERE id = 'd1d1d1d1-0000-4000-8000-000000000001'$$,
  '42501');

SELECT probe('F2: with a column grant, depth 1 is still frozen', 'postgres', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  $$GRANT UPDATE (ai_lead_text, ai_lead_verdict, ai_lead_model) ON public.vet_reports TO authenticated;
    SET LOCAL ROLE authenticated;
    UPDATE public.vet_reports SET ai_lead_text = NULL, ai_lead_verdict = NULL, ai_lead_model = NULL WHERE id = 'd1d1d1d1-0000-4000-8000-000000000001'$$,
  '23514');

SELECT probe('F3: an INVOKER trigger at depth 2, current_user a client role', 'postgres', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  $$GRANT UPDATE (ai_lead_text, ai_lead_verdict, ai_lead_model) ON public.vet_reports TO authenticated;
    SET LOCAL ROLE authenticated;
    INSERT INTO public.probe_hook VALUES ('invoker')$$,
  '23514');

SELECT probe('F4: a DEFINER clear that also moves the snapshot', 'authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  $$INSERT INTO public.probe_hook VALUES ('snapshot')$$, '23514');

SELECT probe('F5: a DEFINER clear of a kept copy', 'authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  $$INSERT INTO public.probe_hook VALUES ('kept')$$, '23514');

SELECT probe('F6: a DEFINER clear of one column only', 'authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  $$INSERT INTO public.probe_hook VALUES ('text-only')$$, '23514');

SELECT probe('F7: a DEFINER clear that also keeps the draft', 'authenticated', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  $$INSERT INTO public.probe_hook VALUES ('to-kept')$$, '23514');

\o
\echo
SELECT n, CASE WHEN want = got THEN 'PASS' ELSE 'FAIL' END AS r, label, who, want, got,
       left(msg, 90) AS msg
  FROM probe_results ORDER BY n;
SELECT count(*) FILTER (WHERE want = got) AS pass, count(*) FILTER (WHERE want <> got) AS fail
  FROM probe_results \gset
\echo VARIANT :variant PASS :pass FAIL :fail
SELECT :fail = 0 AS all_pass \gset
\if :all_pass
\else
  \echo PROBE FAILED
  SELECT 1/0;
\endif
