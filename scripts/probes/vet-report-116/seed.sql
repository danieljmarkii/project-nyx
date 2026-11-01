-- Probe seed for migration 116 (CUL-2336, CUL-2375). LOCAL scratch Postgres only.
-- Runs after 113's bootstrap.sql and 104, 110, 113, 114, 115, and BEFORE 116,
-- so 116's backfill has live pets and leftover Storage folders to read.
--
-- Stubs storage.objects with the two columns 116's backfill reads (production
-- has more; bucket_id and name are the ones the pet-keyed policies read too).
-- Fixed ids (113's): A = aaaaaaaa-…, B = bbbbbbbb-…, PA = a1… (A's pet),
-- PB = b1… (B's pet). DEAD = dead0000-… a pet deleted before 116 whose photo
-- is still in Storage (CUL-2030's shape). RK = d2… kept copy of PA.

CREATE SCHEMA storage;
CREATE TABLE storage.objects (
  id        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  bucket_id text NOT NULL,
  name      text NOT NULL
);
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT ALL ON storage.objects TO service_role;

ALTER TABLE public.pets ADD COLUMN weight_kg numeric(5,2), ADD COLUMN is_active boolean NOT NULL DEFAULT true;

INSERT INTO auth.users VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO public.pets (id, user_id) VALUES
  ('a1a1a1a1-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('b1b1b1b1-0000-4000-8000-000000000003', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
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

INSERT INTO storage.objects (bucket_id, name) VALUES
  ('nyx-vet-reports',       'a1a1a1a1-0000-4000-8000-000000000001/d2d2d2d2-0000-4000-8000-00000000000a.pdf'),
  ('nyx-pet-photos',        'dead0000-0000-4000-8000-0000000000aa/photo.jpg'),
  ('nyx-event-attachments', 'dead0000-0000-4000-8000-0000000000bb/e1/vomit.jpg'),
  ('nyx-vet-documents',     'DEAD0000-0000-4000-8000-0000000000CC/lab.pdf'),
  ('nyx-medication-photos', 'cccccccc-0000-4000-8000-0000000000dd/label.jpg'),
  ('nyx-pet-photos',        'not-a-uuid/x.jpg');
