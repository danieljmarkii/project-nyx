-- ============================================================
-- Dose ↔ co-logged meal/treat link — Schema Migration (B-156, Phase B / PR B1)
-- See: docs/medication-food-combo-investigation.md §8 (schema sketch), §10
--      (the gated PR-by-PR plan), §2 (the adherence-accuracy reframe this
--      link exists to serve), and docs/nyx-medication-logging-requirements.md
--      §6 (the clinical invariants the combo inherits).
-- ============================================================
-- B-156 lets an owner log a medication given *inside* a food/treat (a pill in
-- a Delectable, a tablet in a pill pocket) as ONE act. The owner experiences
-- it as one thing, but the decided single-event-timeline architecture keeps it
-- as TWO events — the meal/treat event + the dose event — never a merged row
-- (Option D, rejected §5). This migration adds the per-event LINK between them:
-- a nullable paired_event_id on the dose, pointing at the meal's events.id.
--
-- WHY THE LINK LIVES ON THE DOSE, NOT THE FOOD (the recent-treats trap, §3):
-- the food↔med pairing is a per-EVENT fact derived from what the owner did in
-- THIS session — never a property of the food_items library row (the same shape
-- as B-010 saw-it/found-it). So "Delectable" re-added from Recent tomorrow logs
-- a bare treat, never a phantom dose. The link is history, not identity, so it
-- belongs on the historical dose record (medication_administrations), not the
-- catalog. (Data Scientist, §3.)
--
-- This is schema ONLY (isolated per the CLAUDE.md migration-isolation rule).
-- The local mirror + sync + the combo write path are PR B2; the intake→adherence
-- safety coupling is PR B3 (adversarial-reviewer-mandatory); the unified combo
-- edit surface is PR B4 (implements the G2 edit-model decision).
--
-- GATE STATUS (read before stacking B2–B4 on this): Phase B is gated on G2 +
-- G3. G3 (compose with the B-153/B-154 dose↔regimen link) is SATISFIED (#228).
-- G2 (edit model — one combo unit vs two independent instances) is STILL OPEN
-- per CLAUDE.md Open Questions and the B-156 backlog row. This column is
-- deliberately G2-AGNOSTIC: a nullable link supports either edit model, so the
-- schema does not foreclose that decision — B1 is the additive foundation laid
-- ahead of the gated write/coupling/edit PRs. Shipping B1 ahead of the G2 ruling
-- is a PM call flagged in the PR description; nothing here is irreversible.
--
-- Migration Safety Pre-flight:
--   Destructive:  n  (purely additive — one new nullable column + one partial
--                     index + one validation function/trigger on the existing
--                     medication_administrations table. No column, type, table,
--                     or row is dropped, renamed, retyped, or altered; existing
--                     rows get paired_event_id = NULL, which renders clean.)
--   Rollback:     DROP TRIGGER  IF EXISTS trg_medication_administrations_paired_same_pet
--                   ON medication_administrations;
--                 DROP FUNCTION IF EXISTS enforce_dose_paired_event_same_pet();
--                 DROP INDEX    IF EXISTS idx_medication_administrations_paired_event;
--                 ALTER TABLE medication_administrations DROP COLUMN IF EXISTS paired_event_id;
--                 (drop trigger before its function; column last.)
--   Backfill:     N/A — a brand-new nullable column; every existing dose is a
--                 standalone (non-combo) dose and correctly reads NULL. No
--                 existing row is read or written.
--   Affected tables: medication_administrations (additive only). Row-count
--                 sanity check before applying (informational — nothing is
--                 mutated): SELECT count(*) FROM medication_administrations;
-- ============================================================


-- ============================================================
-- 1. The link column
-- ============================================================
-- Nullable, defaults NULL: the ~99% of doses with no co-logged food stay NULL
-- and render exactly as today. ON DELETE SET NULL mirrors the medication_id /
-- medication_item_id discipline (020): if the meal event is ever HARD-deleted
-- (only the B-039 account-deletion cascade does that — normal removal is a soft
-- delete via events.deleted_at), the historical dose survives with a cleared
-- link rather than being cascade-killed. Under a normal SOFT delete the link
-- persists and points at a deleted_at-stamped event; the B3/B4 consumers read
-- through deleted_at exactly as every other event consumer does.
--
-- DELIBERATELY NO UNIQUE constraint on paired_event_id: N doses may share one
-- food event (two pills crushed into one bowl), so the link is many-doses→one-
-- meal (§8). Uniqueness would forbid the legitimate two-pills-one-treat case.
ALTER TABLE medication_administrations
  ADD COLUMN paired_event_id UUID REFERENCES events(id) ON DELETE SET NULL;

COMMENT ON COLUMN medication_administrations.paired_event_id IS
  'B-156: the co-logged meal/treat event this dose was given inside (the "with food" combo). '
  'NULL = a standalone dose (the common case). Per-event fact, never on food_items. '
  'Same-pet integrity enforced by trg_medication_administrations_paired_same_pet.';


-- ============================================================
-- 2. Reverse-lookup index (given a meal event → its linked dose(s))
-- ============================================================
-- The forward lookup (dose → its paired event) rides the events PK. The REVERSE
-- lookup — "does this meal/treat have a dose hanging off it?" — is what the B3
-- coupling (a refused vehicle must find its linked dose) and the B4 combo-edit
-- surface (open the treat → show the linked dose) both run. Partial WHERE NOT
-- NULL because the vast majority of doses are unlinked, so the index stays tiny
-- (mirrors the idx_*_unsynced / idx_medications_active partial-index pattern).
CREATE INDEX idx_medication_administrations_paired_event
  ON medication_administrations(paired_event_id)
  WHERE paired_event_id IS NOT NULL;


-- ============================================================
-- 3. Same-pet integrity (defense-at-rest — the cross-event ref guard)
-- ============================================================
-- THE RLS GAP THIS CLOSES (rls-privacy-reviewer, PR B1): medication_administrations_
-- owner (020) checks only the DOSE's own pet_id ∈ the user's pets. A bare FK to
-- events(id) checks only that the event EXISTS — neither verifies the paired
-- event belongs to the SAME pet. Without this guard a malicious or buggy client
-- could set paired_event_id to:
--   (a) another of the owner's OWN pets' events  → a cross-pet combo (Pixel's
--       dose linked to Mochi's bowl), the §9 multi-pet "wrong-pet dose is a real
--       adherence error" hazard; or
--   (b) a DIFFERENT owner's event id             → a dangling cross-owner ref
--       (a confused-deputy seed) the FK alone would happily accept.
--
-- A CHECK constraint can't subquery another table, and the dose's RLS policy
-- can't see the referenced event's pet_id without a brittle cross-table WITH
-- CHECK. A BEFORE trigger is the right, bypass-proof tool for a cross-row
-- invariant (the B-128(b) defense-at-rest pattern): it runs server-side on
-- every write regardless of client, so the boundary does not depend on the
-- B2 write path remembering to enforce it.
--
-- The load-bearing check is `e.pet_id = NEW.pet_id`. It is correct under BOTH
-- security contexts, so the guard never silently weakens if the function's
-- volatility/owner ever changes:
--   • SECURITY INVOKER (the default used here — least privilege): events RLS
--     also applies, so a different owner's event is invisible → 0 rows → raise.
--   • Even if RLS did NOT filter here: pet_id is unique to one owner (pets.user_id),
--     and NEW.pet_id was already RLS-verified to be the writer's pet, so an event
--     with e.pet_id = NEW.pet_id necessarily belongs to that same owner.
-- Either way: same-pet ⟹ same-owner, and a mismatch is rejected.
--
-- Guarded by `IF NEW.paired_event_id IS NOT NULL` so the ~99% standalone-dose
-- writes pay only a NULL test (no subquery); a linked write pays one indexed PK
-- lookup on events.id. Fires on INSERT and UPDATE so a retroactively-linked dose
-- (the combo built from an already-logged treat) is validated too.
-- search_path is pinned to '' (and events is schema-qualified as public.events)
-- so this cross-table lookup can't be redirected by a caller-controlled
-- search_path — the function_search_path_mutable hardening, applied here because
-- this is a security-sensitive cross-row guard. SECURITY INVOKER (the default)
-- is retained: least privilege, and the same-pet check is correct under invoker
-- RLS per the analysis above. (set_updated_at/handle_new_user predate this and
-- remain unpinned — separate pre-existing tech debt, not widened here.)
CREATE OR REPLACE FUNCTION enforce_dose_paired_event_same_pet()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.paired_event_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = NEW.paired_event_id
        AND e.pet_id = NEW.pet_id
    ) THEN
      RAISE EXCEPTION
        'paired_event_id % must reference an event for the same pet (%)',
        NEW.paired_event_id, NEW.pet_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_medication_administrations_paired_same_pet
  BEFORE INSERT OR UPDATE ON medication_administrations
  FOR EACH ROW EXECUTE FUNCTION enforce_dose_paired_event_same_pet();
