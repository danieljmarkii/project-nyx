-- Minimal stand-in for the parts of a Supabase project migration 117 touches,
-- for the LOCAL behaviour probe only (run.sh). Never applied anywhere real.
--   * auth.uid() reads request.jwt.claim.sub, the GUC PostgREST and
--     storage-api set from the caller's access token.
--   * authenticated has no SELECT on auth.users, as in production (measured
--     2026-11-02), which is why 117 reads user_profiles instead.
--   * storage.objects carries no FK from owner to auth.users, as in production
--     (measured 2026-11-02): the only FK is bucket_id.
--   * user_profiles is 001's shape and 001's own-row policy.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE public.user_profiles (
  id        uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  timezone  text
);
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_profiles_owner ON public.user_profiles FOR ALL USING (auth.uid() = id);
GRANT SELECT, INSERT, UPDATE ON public.user_profiles TO authenticated;

CREATE SCHEMA storage;
CREATE TABLE storage.buckets (id text PRIMARY KEY);
CREATE TABLE storage.objects (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id  text REFERENCES storage.buckets(id),
  name       text NOT NULL,
  owner      uuid,
  UNIQUE (bucket_id, name)
);
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
GRANT ALL ON storage.objects, storage.buckets TO service_role;
INSERT INTO storage.buckets (id) VALUES ('nyx-medication-photos');
