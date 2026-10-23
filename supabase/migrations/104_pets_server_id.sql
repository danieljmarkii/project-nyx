-- ============================================================
-- Migration 104: a pet's id is always the server's (CUL-2029)
-- See: CUL-2029 (the issue, the plan, the PM's go 2026-10-19);
--      CUL-594 / PR-34b (migration 103's review, where the rls-privacy-reviewer
--      found this and reproduced it on a stub database).
-- ============================================================
--
-- THE GAP
-- ------------------------------------------------------------
-- Every pet-keyed Storage policy admits a caller to the prefix
-- `(storage.foldername(name))[1] IN (SELECT id::text FROM pets WHERE user_id = auth.uid())`.
-- 001's `pets_owner` policy (FOR ALL USING (auth.uid() = user_id)) let any
-- signed-in account choose a pet's id: INSERT with a client-supplied `id`, or
-- UPDATE a childless pet's `id` (the children's foreign keys cascade on delete
-- and do nothing on update). A live pet's id is safe (`pets_pkey`), but an id
-- with no row is not: a leftover object under a dead pet's prefix (an upload
-- whose row write failed, a delete-account purge that failed and still removed
-- the user) became readable, overwritable and signable by whoever claimed the
-- id. The id is not secret; it is written in every shared photo link.
--
-- ------------------------------------------------------------
-- THE FIX
-- ------------------------------------------------------------
-- One BEFORE trigger on pets, two arms:
--   · INSERT: the id is replaced with gen_random_uuid(), whatever was sent,
--     for every write except the server's own (a server role, with no JWT or
--     a service_role one; WHO IS EXEMPT below). So `authenticated` and `anon`
--     are bound, and so is any role added later: the list names who is
--     exempt, never who is bound.
--     The exemption exists for scripts/fixture/emitFixtureSql.ts, which writes
--     four pets with fixed ids through execute_sql; no Edge Function inserts a
--     pet. A server write never comes from a phone.
--   · UPDATE: a changed id is refused for every role, exempt or not. No path
--     changes a pet's id, and a server that did would orphan the same prefixes.
--     A plain UPDATE trigger, not `UPDATE OF id`, so it fires whatever the SET
--     list names (an `ON CONFLICT DO UPDATE` included).
--
-- No client change: neither client insert sends an id (app/add-pet.tsx,
-- app/onboarding/pet-name.tsx), and the sync path never upserts pets; it only
-- updates `weight_kg` by id (lib/sync.ts). Both inserts read the id back with
-- `.select().single()`, so they see the server's.
--
-- WHO IS EXEMPT: a write is the server's only when BOTH say so: `current_user`
-- is a server role AND the request carries no JWT at all, or one whose role is
-- service_role. Claims that are present but name no role (or any other role)
-- are a client's. The JWT half is what keeps a client bound inside SECURITY
-- DEFINER code: a DEFINER function (or this one, if a later migration flipped
-- it to DEFINER) runs as its owner, so `current_user` alone would read
-- `postgres` for a client's request. PostgREST sets `request.jwt.claims` from
-- the verified token for the whole transaction, and a client cannot set it. An
-- empty setting counts as absent: a custom setting reads '' once a transaction
-- that set it locally has ended. No JWT is a direct SQL session (execute_sql,
-- the fixture). The claims are parsed on INSERT only and only for a server
-- role (AND short-circuits), so a malformed value gives a client a server id,
-- fails a server role's insert loudly, and never touches a pets UPDATE (the
-- weight sync). Its error echoes only the caller's own claims, never another
-- row (C-31).
-- (rls-privacy-reviewer on this PR, both passes, replayed on the stub.)
--
-- SECURITY INVOKER: the function reads no other row, so it needs no privilege
-- the caller lacks. The refusal names no value (C-31). 23514, the code this
-- repo's guards raise for a refused write.
--
-- STATED BLIND SPOTS:
--   · A superuser can disable the trigger. That is the server, not a client.
--   · Leftover objects already under a dead pet's prefix stay where they are;
--     104 only stops anyone claiming them. Their cleanup is its own issue.
--
-- ------------------------------------------------------------
-- MIGRATION SAFETY PRE-FLIGHT
-- ------------------------------------------------------------
--   Destructive: n. No column, row or policy changes; one function, one trigger.
--   Backfill: N/A.
--   Rollback:
--     DROP TRIGGER IF EXISTS trg_pets_server_id ON public.pets;
--     DROP FUNCTION IF EXISTS public.enforce_pet_server_id();
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_pet_server_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  claims text;
  legacy_role text;
  server_write boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    claims := nullif(current_setting('request.jwt.claims', true), '');
    legacy_role := nullif(current_setting('request.jwt.claim.role', true), '');
    server_write := current_user IN ('postgres', 'supabase_admin', 'service_role')
      AND ((claims IS NULL AND legacy_role IS NULL)
           OR coalesce(claims::jsonb ->> 'role', legacy_role, '') = 'service_role');
    IF NOT server_write THEN
      NEW.id := gen_random_uuid();
    END IF;
  ELSIF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'A pet''s id cannot change'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_pet_server_id() IS
  'CUL-2029: the server chooses every client-inserted pet id, and no role can change one, so no account can claim a dead pet''s Storage prefix.';

DROP TRIGGER IF EXISTS trg_pets_server_id ON public.pets;
CREATE TRIGGER trg_pets_server_id
  BEFORE INSERT OR UPDATE ON public.pets
  FOR EACH ROW EXECUTE FUNCTION public.enforce_pet_server_id();
