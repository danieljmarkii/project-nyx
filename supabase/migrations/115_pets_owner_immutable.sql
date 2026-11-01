-- ============================================================
-- Migration 115: a pet's owner never changes (CUL-2337)
-- See: CUL-2337 (the issue, the plan, the PM's go 2026-11-01);
--      CUL-2287 / migration 113 (rls-privacy-reviewer F5, where this was
--      found and measured).
-- ============================================================
--
-- THE GAP
-- ------------------------------------------------------------
-- 113 binds a saved vet report's maker (`vet_reports.generated_by`) to its
-- pet's owner when the row is written, and re-judges a row only when its own
-- maker or pet changes (C-38: a row is never bricked). Nothing stopped the
-- OTHER side moving: `pets.user_id` was writable by the service role and the
-- migration owner. Measured on 113's replay: as service_role,
--   UPDATE pets SET user_id = B WHERE id = <A's pet>;   -> 1 row
--   DELETE FROM auth.users WHERE id = A;                -> both of the pet's
--   vet_reports rows, the kept copy included, cascade away through
--   generated_by. B's pet keeps its files and loses its rows.
--
-- `pets.user_id` is also the scope every pet-keyed RLS policy, every
-- pet-keyed Storage policy and delete-account's folder sweep read, so a moved
-- owner falsifies more than 113: 113 is the instance that was measured.
-- A client could not move it (pets_owner's USING doubles as its write check:
-- the new row must still satisfy auth.uid() = user_id). No server path does
-- (0 rows have ever moved: no function, script or Edge Function writes
-- pets.user_id on UPDATE).
--
-- ------------------------------------------------------------
-- THE FIX
-- ------------------------------------------------------------
-- One BEFORE UPDATE trigger on pets that refuses a changed user_id for EVERY
-- role, the service role and the migration owner included (the measured
-- attack is the service role's; a trigger binds it where a policy cannot).
--   · A plain UPDATE trigger, not `UPDATE OF user_id`, so it fires whatever
--     the SET list names, an `ON CONFLICT DO UPDATE` included.
--   · IS DISTINCT FROM (067's form), so a write that re-sends the stored
--     user_id passes: an upsert that echoes the row is not a move. Every app
--     UPDATE of pets (EditPetModal, ArchivePetSheet, archived-pets,
--     pet-gender, log.tsx's weight write) omits user_id; add-pet's INSERT is
--     not an UPDATE.
--   · Account deletion is a DELETE: auth.users -> pets is ON DELETE CASCADE
--     (001), which never fires an UPDATE trigger. Unaffected.
--
-- WHY FREEZE, NOT DROP THE CASCADE ON generated_by: the other repair the
-- issue names would save 113's rows and leave them naming a dead account,
-- while every other reader of pets.user_id kept trusting a value that can
-- move. A pet that genuinely needs a new owner (a household transfer) takes a
-- deliberate migration that also decides what its reports, files and links
-- do, which is the decision this makes someone make (067's reasoning for
-- vet_visits.pet_id).
--
-- A separate function and trigger, not an edit of 104's
-- enforce_pet_server_id: 104's text is pinned by guards/petServerId.test.ts,
-- and two triggers roll back independently. Both are BEFORE UPDATE on pets
-- and both only refuse, so their order does not matter.
--
-- SECURITY INVOKER: the function reads no other row, so it needs no
-- privilege the caller lacks. The refusal names no value (C-31). 23514, the
-- code this repo's guards raise for a refused write (terminal in lib/sync.ts,
-- and no client path sends a changed user_id).
--
-- WHAT ELSE CAN MOVE (C-38):
--   · pets.id: frozen by 104.
--   · vet_reports.generated_by / pet_id: re-judged by 113 on change.
--   · auth.users.id: the primary key Supabase Auth owns; no path updates it.
--
-- STATED BLIND SPOTS:
--   · A superuser or the migration owner can DISABLE or DROP the trigger, or
--     set session_replication_role = replica (which skips every trigger).
--     That is the server, not a client; guards/petOwnerImmutable.test.ts
--     reds on a later migration that does it.
--   · Delete-and-reinsert under the same id with a new user_id is not an
--     UPDATE. A client cannot (104 replaces a client-inserted id); a server
--     transaction can, and the delete cascades the pet's rows away first, so
--     nothing is re-attributed. Same class as 113's stated G2.
--
-- ------------------------------------------------------------
-- MIGRATION SAFETY PRE-FLIGHT
-- ------------------------------------------------------------
--   Destructive: n. No column, row or policy changes; one function, one
--                trigger. pets_owner and trg_pets_server_id untouched.
--   Backfill:    N/A. The trigger judges only future changes.
--   Rollback:
--     DROP TRIGGER IF EXISTS trg_pets_owner_immutable ON public.pets;
--     DROP FUNCTION IF EXISTS public.enforce_pet_owner_immutable();
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_pet_owner_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'A pet''s owner cannot change'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_pet_owner_immutable() IS
  'CUL-2337: no role can change pets.user_id, so a saved vet report''s maker check (113), every pet-keyed policy and the deletion sweep never read a moved owner. Re-sending the stored value passes (IS DISTINCT FROM).';

DROP TRIGGER IF EXISTS trg_pets_owner_immutable ON public.pets;
CREATE TRIGGER trg_pets_owner_immutable
  BEFORE UPDATE ON public.pets
  FOR EACH ROW EXECUTE FUNCTION public.enforce_pet_owner_immutable();
