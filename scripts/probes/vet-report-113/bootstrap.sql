-- Probe bootstrap for migration 113 (CUL-2287). LOCAL scratch Postgres only.
--
-- Stubs the parts of Supabase the vet_reports guards touch, then the run
-- script replays 110 and 113 VERBATIM from supabase/migrations/. What is
-- stubbed, and how it differs from production:
--   * roles anon / authenticated / service_role (service_role BYPASSRLS, as in
--     Supabase). PostgREST's SET ROLE is simulated with SET LOCAL ROLE.
--   * auth.uid() reads request.jwt.claim.sub, the GUC PostgREST sets.
--   * pets, vet_visits, vet_appointments, vet_reports carry only the columns the
--     guards read. Their policies are production's (pets 001, vet_visits 001,
--     vet_appointments 066: no client DELETE). vet_reports is 001 + 029 exactly.
--   * enforce_vet_visit_link_same_pet is 109's body, copied (109 also rewrites
--     vet_documents, which this probe has no table for).

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE FUNCTION public.set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE TABLE public.pets (
  id      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.pets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pets_owner" ON public.pets FOR ALL USING (auth.uid() = user_id);

CREATE TABLE public.vet_visits (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id     uuid NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  deleted_at timestamptz
);
ALTER TABLE public.vet_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vet_visits_owner" ON public.vet_visits FOR ALL
  USING (pet_id IN (SELECT id FROM public.pets WHERE user_id = auth.uid()));

CREATE TABLE public.vet_appointments (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id       uuid NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  reason       text,
  vet_visit_id uuid REFERENCES public.vet_visits(id) ON DELETE SET NULL,
  deleted_at   timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT NOW()
);
ALTER TABLE public.vet_appointments ENABLE ROW LEVEL SECURITY;
-- 066's three policies: no DELETE (appointments soft-delete). vet_visits keeps
-- 001's FOR ALL, so a client CAN hard-delete a visit, as in production.
CREATE POLICY "vet_appointments_owner_select" ON public.vet_appointments FOR SELECT
  USING (pet_id IN (SELECT id FROM public.pets WHERE user_id = auth.uid()));
CREATE POLICY "vet_appointments_owner_insert" ON public.vet_appointments FOR INSERT
  WITH CHECK (pet_id IN (SELECT id FROM public.pets WHERE user_id = auth.uid()));
CREATE POLICY "vet_appointments_owner_update" ON public.vet_appointments FOR UPDATE
  USING (pet_id IN (SELECT id FROM public.pets WHERE user_id = auth.uid()))
  WITH CHECK (pet_id IN (SELECT id FROM public.pets WHERE user_id = auth.uid()));

-- 001 + 029, verbatim columns.
CREATE TABLE public.vet_reports (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id            UUID NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  generated_by      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date_range_start  DATE NOT NULL,
  date_range_end    DATE NOT NULL,
  storage_path      TEXT NOT NULL,
  share_token       UUID NOT NULL DEFAULT uuid_generate_v4(),
  token_expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_vet_reports_share_token ON public.vet_reports(share_token);
CREATE INDEX idx_vet_reports_pet ON public.vet_reports(pet_id, created_at DESC);
ALTER TABLE public.vet_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vet_reports_owner" ON public.vet_reports FOR ALL USING (auth.uid() = generated_by);
CREATE TRIGGER trg_vet_reports_updated_at
  BEFORE UPDATE ON public.vet_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
-- Account deletion (delete-account) removes the auth user with service rights.
GRANT ALL ON auth.users TO service_role;

-- 109's enforce_vet_visit_link_same_pet, copied.
CREATE OR REPLACE FUNCTION public.enforce_vet_visit_link_same_pet()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF NEW.vet_visit_id IS NOT NULL
     AND (TG_OP = 'INSERT'
          OR NEW.vet_visit_id IS DISTINCT FROM OLD.vet_visit_id
          OR NEW.pet_id      IS DISTINCT FROM OLD.pet_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.pets p
        WHERE p.id = NEW.pet_id
          AND (me IS NULL OR p.user_id = me)
          AND EXISTS (SELECT 1 FROM public.vet_visits v
                       WHERE v.id = NEW.vet_visit_id AND v.pet_id = p.id)
     ) THEN
    RAISE EXCEPTION 'vet_visit_id % must reference a vet visit for the same pet (%)',
      NEW.vet_visit_id, NEW.pet_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_vet_visit_link_same_pet() FROM PUBLIC, anon, authenticated;
