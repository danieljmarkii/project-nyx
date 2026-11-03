-- Seed for the 119 probe (CUL-2445), loaded after 110 / 113 / 114 and BEFORE
-- 119, so 119's §6 backfill has a kept copy to log.
--   A  = aaaaaaaa-…, the owner.  B = bbbbbbbb-…, the other account.
--   PA = a1… A's pet.  PB = b1… B's pet.
--   RK = d2… A's copy kept before 119, stamped ('email', 2026-10-01 09:00Z).
--   RB = b2… B's kept copy, stamped ('victimroute', 2026-10-02 10:00Z): the
--        value a C-31 leak would show.
--   RD = d1… A's draft, complete enough to keep in one write.
-- created_at sits just before each send, as a real draft's does (119 §4 bounds
-- a send to its copy's lifetime).
INSERT INTO auth.users VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO public.pets VALUES
  ('a1a1a1a1-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('b1b1b1b1-0000-4000-8000-000000000003', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO public.vet_visits (id, pet_id) VALUES
  ('a3a3a3a3-0000-4000-8000-000000000004', 'a1a1a1a1-0000-4000-8000-000000000001');

INSERT INTO public.vet_reports
  (id, pet_id, generated_by, date_range_start, date_range_end, storage_path,
   report_version, renderer_fingerprint, params, scope_basis, status, snapshot,
   short_id, shared_via, shared_at, content_sha256, created_at)
VALUES
  ('d2d2d2d2-0000-4000-8000-00000000000a', 'a1a1a1a1-0000-4000-8000-000000000001',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-09-01', '2026-10-30',
   'a1a1a1a1-0000-4000-8000-000000000001/d2d2d2d2-0000-4000-8000-00000000000a.pdf',
   'v2', 'fp-1', '{}', 'since_last_visit', 'kept', '{"facts":[1]}',
   'K7Q2', 'email', '2026-10-01T09:00:00Z', repeat('ab', 32), '2026-10-01T08:59:00Z'),
  ('b2b2b2b2-0000-4000-8000-00000000000b', 'b1b1b1b1-0000-4000-8000-000000000003',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '2026-09-01', '2026-10-30',
   'b1b1b1b1-0000-4000-8000-000000000003/b2b2b2b2-0000-4000-8000-00000000000b.pdf',
   'v2', 'fp-1', '{}', 'since_last_visit', 'kept', '{"facts":[2]}',
   'W4X9', 'victimroute', '2026-10-02T10:00:00Z', repeat('cd', 32), '2026-10-02T09:59:00Z');

INSERT INTO public.vet_reports
  (id, pet_id, generated_by, date_range_start, date_range_end, storage_path,
   report_version, renderer_fingerprint, params, scope_basis, snapshot, short_id,
   content_sha256, created_at)
VALUES
  ('d1d1d1d1-0000-4000-8000-000000000009', 'a1a1a1a1-0000-4000-8000-000000000001',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-09-01', '2026-10-30',
   'a1a1a1a1-0000-4000-8000-000000000001/d1d1d1d1-0000-4000-8000-000000000009.html',
   'v2', 'fp-1', '{}', 'since_last_visit', '{"facts":[3]}', 'N5R6', repeat('ef', 32), '2026-10-31T08:00:00Z');
