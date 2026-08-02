-- ============================================================
-- notification_preferences — same-account pet-scope guard (B-661 PR 2,
-- follow-up to 050)
-- See: supabase/migrations/041_diet_trial_foods_same_pet.sql and
--      023_dose_paired_event.sql (the mechanism this imports).
-- ============================================================
-- FOUND BY `rls-privacy-reviewer` AND `code-reviewer` — independently — AGAINST
-- MIGRATION 050, and closed here before the first non-NULL pet_id is ever written.
--
-- 050's RLS policies constrain `user_id` (the account scope) but say nothing about
-- `pet_id`. The FK `pet_id -> pets(id)` is an EXISTENCE check, evaluated with RLS
-- SUSPENDED, so it accepts any account's pet id. An authenticated owner can
-- therefore INSERT/UPDATE a row into THEIR OWN account naming ANOTHER account's
-- pet — FK-legal and RLS-legal, because only `user_id` is checked. This is the
-- identical bare-FK class 041 (diet_trial_id), 023 (paired_event_id) and 044's
-- enforce_vet_document_pet_scope (vet_visit_id) were written to close.
--
-- WHY IT IS LOW SEVERITY TODAY, AND WHY IT IS CLOSED ANYWAY.
-- Today the row stays RLS-scoped to the attacker's own `user_id`: they read back
-- only their own row, `pet_id` is an opaque 122-bit UUID that reveals nothing, the
-- victim sees nothing, and — decisively — v1 has NO write path that emits a
-- non-NULL `pet_id` at all (every v1 preference is account-wide, pet_id NULL; the
-- per-pet shape is a reserved affordance). So there is no live breach. But it is
-- FREE to close at zero rows and expensive later, and it becomes a real
-- cross-account disclosure primitive the moment Part 2's SERVER PUSH — forecast in
-- 050's own header — reads `pet_id` under the service role: a push that joins
-- `pet_id -> pets` to name the pet in a notification body would render the
-- VICTIM's pet name into a notification delivered to the ATTACKER. The guard must
-- exist before any writer emits a non-NULL pet_id, which is PR 3 — hence now.
--
-- WHY A TRIGGER, NOT A `WITH CHECK` PREDICATE. A policy is a CLIENT-PATH gate: it
-- binds `authenticated` and every service-role caller bypasses it. A
-- `WITH CHECK (pet_id IN (SELECT id FROM pets WHERE user_id = auth.uid()))` would
-- also break under service role, where `auth.uid()` is NULL. 023 and 041 chose a
-- BEFORE trigger deliberately, "so the boundary does not depend on the [...] write
-- path remembering to enforce it," and that applies here verbatim and with force:
-- Part 2's push is a service-role path by construction. A BEFORE INSERT/UPDATE
-- trigger fires on every write regardless of security context, so it protects the
-- client path (PR 3) and the service-role path (Part 2) with one mechanism.
--
-- WHY CHECKING THE PET AGAINST `NEW.user_id` IS CORRECT UNDER BOTH CONTEXTS.
-- Unlike the pet-scoped tables (whose rows carry no owner, so 040/044 must check
-- `pets.user_id = auth.uid()`), this row CARRIES `user_id`. Checking
-- `pets.user_id = NEW.user_id` is therefore correct in both worlds:
--   • CLIENT (security invoker): 050's INSERT/UPDATE WITH CHECK already pins
--     NEW.user_id = auth.uid(), so this asserts the pet belongs to the caller.
--   • SERVICE ROLE (Part 2): RLS is bypassed and there is no auth.uid(), but the
--     row still names its owner in `user_id`, and the pet must belong to that
--     owner. `auth.uid()` would be the wrong thing to compare against here.
--
-- THE NULL FAST-PATH IS LOAD-BEARING, not an optimization. `pet_id` is NULLABLE
-- (NULL = account-wide, the ENTIRE v1 shape). Without `NEW.pet_id IS NOT NULL`,
-- the EXISTS would fail for every account-wide row and this guard would reject
-- every preference v1 actually writes. (This is the one difference from 041, whose
-- diet_trial_id is NOT NULL and needs no such guard.)
--
-- `search_path` is pinned to '' and `public.pets` is schema-qualified, so this
-- cross-table lookup cannot be redirected by a caller-controlled search_path — the
-- same hardening 023/041 apply, for the same reason.
--
-- SYNC NOTE (no client change needed). A client that ever pushed a foreign pet_id
-- would get 23514 (check_violation) from this trigger, which lib/syncQueue.ts
-- classifies as TERMINAL — so the offending row quarantines (honestly synced = 0)
-- rather than retrying forever. In v1 this never fires (pet_id is always NULL), so
-- the local mirror needs no change.
--
-- ------------------------------------------------------------
-- Migration Safety Pre-flight
-- ------------------------------------------------------------
--   Destructive y/n:  n. Adds one function and one trigger. No table, column,
--                     type, index, policy or grant is altered or dropped.
--   Affected tables:  notification_preferences (0 live rows — the table is one
--                     migration old and has no write path yet; verify with
--                       SELECT count(*) FROM notification_preferences;   -> 0).
--                     Because it is empty, and because no v1 row will ever carry a
--                     non-NULL pet_id, this cannot fail on existing data. If it is
--                     ever non-empty, run this first and expect 0:
--                       SELECT count(*) FROM notification_preferences np
--                       WHERE np.pet_id IS NOT NULL AND NOT EXISTS (
--                         SELECT 1 FROM pets p
--                         WHERE p.id = np.pet_id AND p.user_id = np.user_id);
--   Backfill:         N/A — no rows, and the guard is forward-looking.
--   Rollback plan:    reversible, and order matters (trigger before function):
--                       DROP TRIGGER IF EXISTS trg_notification_preferences_pet_scope
--                         ON notification_preferences;
--                       DROP FUNCTION IF EXISTS enforce_notification_pref_pet_scope();
--                     Rolling back re-opens the bare-FK gap described above.
-- ============================================================

CREATE OR REPLACE FUNCTION enforce_notification_pref_pet_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- NULL pet_id = account-wide (the v1 shape) — nothing to scope, always allowed.
  IF NEW.pet_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.pets p
    WHERE p.id = NEW.pet_id
      AND p.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION
      'pet_id % must reference a pet owned by user_id %', NEW.pet_id, NEW.user_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notification_preferences_pet_scope
  BEFORE INSERT OR UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION enforce_notification_pref_pet_scope();

COMMENT ON FUNCTION enforce_notification_pref_pet_scope() IS
  'B-661: defense-at-rest guard closing the bare-FK gap rls-privacy-reviewer + code-reviewer both found in migration 050 — pet_id was FK-existence-checked but never ownership-checked, so a row could name another account''s pet (a latent cross-account disclosure primitive once Part 2''s service-role push reads pet_id). A trigger, not a WITH CHECK predicate, because service-role callers bypass RLS; checks pets.user_id = NEW.user_id so it holds under both client and service-role contexts; NULL pet_id (account-wide) is skipped. Mirrors enforce_diet_trial_food_same_pet() (041) / enforce_dose_paired_event_same_pet() (023).';
