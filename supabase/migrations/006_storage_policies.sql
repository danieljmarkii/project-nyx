-- Storage bucket RLS policies for nyx-event-attachments, nyx-vet-attachments, nyx-food-photos.
-- Any authenticated user can upload to and read from these buckets.
-- Path-level ownership is enforced at the app layer (storage_path includes event/vet-visit IDs
-- that are already gated by table RLS on event_attachments and vet_visit_attachments).
-- Apply this in the Supabase SQL Editor.

-- Event attachments bucket
CREATE POLICY "Authenticated users can upload event attachments"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'nyx-event-attachments');

CREATE POLICY "Authenticated users can read event attachments"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'nyx-event-attachments');

CREATE POLICY "Authenticated users can delete event attachments"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'nyx-event-attachments');

-- Vet visit attachments bucket
CREATE POLICY "Authenticated users can upload vet attachments"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'nyx-vet-attachments');

CREATE POLICY "Authenticated users can read vet attachments"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'nyx-vet-attachments');

CREATE POLICY "Authenticated users can delete vet attachments"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'nyx-vet-attachments');

-- Food label photos bucket
CREATE POLICY "Authenticated users can upload food photos"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'nyx-food-photos');

CREATE POLICY "Authenticated users can read food photos"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'nyx-food-photos');
