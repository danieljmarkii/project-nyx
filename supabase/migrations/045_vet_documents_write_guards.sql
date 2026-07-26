-- ============================================================
-- Migration 045: vet_documents write guards — three holes the VF-1
-- rls-privacy-reviewer found in 044's trigger (B-478 VF-1)
-- ============================================================
--
-- 044 is already applied, so this is a follow-up rather than an edit to it: the
-- recorded migration must keep saying what was actually run. `vet_documents` holds
-- 0 rows and no capture surface exists (VF-3), so all three fixes are free now and
-- would be expensive after the corpus exists.
--
-- All three were EXECUTED against a real PostgreSQL replay of 044, not reasoned
-- about. Each is a case where 044 asserts an invariant that the database does not
-- actually enforce — and 044's COMMENT ON FUNCTION states that invariant, so the
-- comment was writing a cheque the code did not cash.
--
-- ------------------------------------------------------------
-- FINDING 1 — check (b) was RLS-BLIND ACROSS ACCOUNTS, and failed OPEN.
-- ------------------------------------------------------------
-- Demonstrated: user B inserts a document under B's own pet, reusing user A's
-- `document_group_id`. It SUCCEEDS. Final state read as the service role:
-- `rows_in_group = 2, pets = 2, accounts = 2`.
--
-- The cause is a polarity asymmetry between 044's two checks, and it is worth
-- stating precisely because it is not obvious from reading them:
--
--   * Check (a) — `vet_visit_id` — is `NOT EXISTS(matching visit) → RAISE`. Under
--     SECURITY INVOKER the lookup is itself RLS-filtered, so another account's visit
--     is INVISIBLE, `EXISTS` is false, and the check RAISES. It fails CLOSED — by
--     accident of its polarity, not by design.
--   * Check (b) — `document_group_id` — is `EXISTS(conflicting row) → RAISE`. The
--     conflicting row belongs to another account, so it is equally invisible,
--     `EXISTS` is false… and the check ALLOWS. Identical blindness, opposite
--     polarity, opposite safety direction.
--
-- SECURITY DEFINER is the fix: the lookups then see the whole table regardless of
-- who is writing, which is what a defense-at-rest guard needs by definition. It does
-- not weaken check (a) — under DEFINER a foreign visit becomes visible but its
-- `pet_id` still differs from `NEW.pet_id`, so `EXISTS` is still false and it still
-- raises. Same outcome, now for the right reason.
--
-- `search_path` stays pinned to '' and both lookups stay schema-qualified, which is
-- what makes DEFINER safe here: the elevated body cannot be redirected to a
-- caller-controlled schema. The function takes no arguments, reads two tables, and
-- either returns NEW or raises — there is no branch that writes.
--
-- Severity, stated honestly: no cross-account READ exists today, because every list
-- read is pet-scoped and RLS-filtered (verified under both JWTs). The harm is that
-- 044's stated invariant — "every page of one document group belongs to one pet" —
-- was FALSE in the database, and it is asserted precisely so that service-role and
-- Phase-2 readers need not re-filter. A B-480 report attach, or a D8 reader that
-- groups by `document_group_id` without re-scoping on `pet_id`, would have pulled
-- another account's row into a vet-facing artifact.
--
-- 023 and 041 share this shape. Both of their checks are `NOT EXISTS → RAISE`, i.e.
-- the fails-closed polarity, so neither is exposed the way (b) was — but both are
-- equally RLS-blind and both would flip if their predicate were ever inverted.
-- Filed as B-509 rather than changed here: they are different tables with live rows,
-- and a boundary hotfix should not carry an unrelated table's regression risk.
--
-- ------------------------------------------------------------
-- FINDING 2 — `storage_path` was MUTABLE, which orphans an object from every purge.
-- ------------------------------------------------------------
-- Demonstrated: `UPDATE vet_documents SET storage_path = '{myPet}/decoy.pdf'`
-- succeeds under the owner's own RLS policy. So does re-pointing `pet_id` and
-- `storage_path` together at another of the owner's own pets.
--
-- The real object never moves. No row names it any more. `delete-account` purges
-- only paths named by rows, so the object SURVIVES ACCOUNT DELETION — with no
-- Storage grant required at all, and no DELETE policy that could remove it
-- afterwards. This is strictly stronger than the residual 043 recorded on its
-- sibling bucket, where the same orphan needed a deliberate storage-api `move()`;
-- here it is one PATCH.
--
-- `storage_path` was ALREADY treated as immutable by every writer — the hydration
-- step omits it from its `DO UPDATE SET` with the comment "re-writing it could only
-- ever corrupt the row", and `buildVetDocumentPath` derives it from the document id.
-- The server simply never enforced what the client already assumed. This makes the
-- assumption true.
--
-- `IS DISTINCT FROM` (not `<>`) so a NULL can never slip past — and note the push
-- path is unaffected: PostgREST's upsert re-sends `storage_path` with its EXISTING
-- value on a conflict, which is not DISTINCT from itself, so a legitimate re-push of
-- an already-synced row still passes.
--
-- This also closes the `pet_id` half for free: a document cannot be moved between
-- pets, because any such move would have to change the path prefix to satisfy
-- `vet_documents_storage_path_pet_prefix`, and the path can no longer change.
--
-- ------------------------------------------------------------
-- FINDING 3 — check (b) had a TOCTOU race.
-- ------------------------------------------------------------
-- Demonstrated: two overlapping transactions inserting the same
-- `document_group_id` under two of the SAME account's pets, one committing inside
-- the other's window. Both commit. `rows = 2, pets = 2`, no error.
--
-- Inherent to a BEFORE-ROW trigger reading its own table under READ COMMITTED:
-- neither transaction can see the other's uncommitted row, and nothing serialises
-- them. Within-account only, so the blast radius is the multi-pet bleed rather than
-- a cross-tenant one — but the multi-pet bleed IS what check (b) exists to prevent,
-- and D13's duplicate-on-add ("Also add to {other pet}") is exactly the flow that
-- would fire two writes about one document at once.
--
-- A transaction-scoped advisory lock keyed on the group id serialises writers that
-- share a group and no one else. It is taken FIRST, before either check, so the
-- read that follows cannot be raced. `pg_advisory_xact_lock` releases at commit or
-- rollback with no unlock path to forget. Cost: writers to the SAME group serialise,
-- which is both rare and desirable — a page group is written as one batch.
--
-- Worth recording that the reviewer also tried the shape this most resembles — a
-- single multi-row `INSERT … VALUES (rowA),(rowB)` spanning two pets of one account
-- — expecting the trigger to miss row 1 while validating row 2. It HELD: plpgsql's
-- SPI performs a CommandCounterIncrement, so row 2's trigger sees row 1. The race
-- above needs genuinely separate transactions.
--
-- ------------------------------------------------------------
-- Migration Safety Pre-flight
-- ------------------------------------------------------------
--   Destructive y/n:  n. Replaces one trigger function body (CREATE OR REPLACE) and
--                     re-states its COMMENT. Adds no column, table, index or policy;
--                     drops nothing; touches no row data. The trigger itself is not
--                     recreated — it already points at this function by name.
--   Affected tables:  public.vet_documents (0 rows — created empty by migration 044
--                     earlier the same day, and no capture surface exists yet).
--                     Row-count check the PM can run BEFORE applying:
--                       select count(*) from public.vet_documents;   -> expect 0
--                     The new guards are forward-looking only, so a non-zero count
--                     would not block the apply — but it would mean a write path
--                     exists that this migration's assumptions did not account for,
--                     which is worth understanding first.
--   Backfill:         N/A — no data change. Nothing can violate the new rules
--                     retroactively: the immutability check only fires on UPDATE,
--                     and there are no rows to update.
--   Rollback plan:    reversible — re-run 044's version of
--                     enforce_vet_document_pet_scope() (its body is in
--                     044_vet_documents.sql §3, verbatim). Rolling back re-opens all
--                     three findings above: the cross-account group collision, the
--                     storage_path orphan primitive, and the TOCTOU race. It is a
--                     real rollback, not routine cleanup.
-- ============================================================

CREATE OR REPLACE FUNCTION enforce_vet_document_pet_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
-- FINDING 1: was SECURITY INVOKER (the default), so both lookups were RLS-filtered
-- and check (b) below could not see another account's conflicting row — it failed
-- OPEN. A defense-at-rest guard has to see the whole table by definition.
SECURITY DEFINER
-- Load-bearing WITH the line above, not decoration: an elevated body with a
-- caller-controlled search_path is the classic privilege-escalation shape. Pinned to
-- '' and every reference below is schema-qualified.
SET search_path = ''
AS $$
BEGIN
  -- FINDING 2 — storage_path is immutable. One RLS-legal UPDATE would otherwise
  -- leave the real object named by no row, surviving account deletion with no way to
  -- remove it. Every writer already assumed this; now the server enforces it.
  -- IS DISTINCT FROM so the upsert path (which re-sends the same value on conflict)
  -- still passes.
  IF TG_OP = 'UPDATE' AND NEW.storage_path IS DISTINCT FROM OLD.storage_path THEN
    RAISE EXCEPTION
      'storage_path is immutable (document %); it is derived from the document id and is the only handle the deletion purge has on the stored object',
      NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- FINDING 3 — serialise writers that share a document group, before the read
  -- below, so two concurrent transactions cannot both pass check (b). Transaction-
  -- scoped: released on commit or rollback, with no unlock path to forget.
  -- hashtextextended gives a stable 64-bit key from the uuid's text form.
  PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.document_group_id::text, 0));

  -- (a) An optional link, so NULL is the fast path and the common case. Unchanged in
  -- substance from 044; under SECURITY DEFINER it now rejects a foreign-account
  -- visit because the pet genuinely differs, rather than because the row was
  -- invisible. Same outcome, sound reason.
  IF NEW.vet_visit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.vet_visits v
    WHERE v.id = NEW.vet_visit_id
      AND v.pet_id = NEW.pet_id
  ) THEN
    RAISE EXCEPTION
      'vet_visit_id % must reference a vet visit for the same pet (%)',
      NEW.vet_visit_id, NEW.pet_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- (b) Every page of one document group belongs to one pet. THIS is the check that
  -- was failing open. The message deliberately names only the writer's OWN ids — it
  -- must not disclose whose pet or account holds the conflicting row.
  IF EXISTS (
    SELECT 1
    FROM public.vet_documents d
    WHERE d.document_group_id = NEW.document_group_id
      AND d.id <> NEW.id
      AND d.pet_id <> NEW.pet_id
  ) THEN
    RAISE EXCEPTION
      'document_group_id % already belongs to a different pet (row pet is %)',
      NEW.document_group_id, NEW.pet_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION enforce_vet_document_pet_scope() IS
  'B-478 VF-1 (hardened by migration 045): defense-at-rest guard over the references RLS cannot constrain — vet_visit_id (a bare FK; FK checks bypass RLS) and document_group_id (no FK at all) — plus storage_path immutability. SECURITY DEFINER because 044''s SECURITY INVOKER version could not see another account''s conflicting row, so the group check failed OPEN (demonstrated: a cross-account document_group_id collision); an advisory lock closes the same check''s TOCTOU race between concurrent transactions; and storage_path is pinned because one RLS-legal UPDATE would otherwise orphan the stored object from every deletion purge. A trigger rather than policy predicates because service-role callers bypass RLS entirely; mirrors enforce_diet_trial_food_same_pet() (041) and enforce_dose_paired_event_same_pet() (023), both of which are RLS-blind in the same way but fail CLOSED by polarity (B-509).';

-- ============================================================
-- ROLLBACK (for reference — do not run inline).
--
-- ⚠ Re-opens all three findings: the cross-account document_group_id collision, the
-- storage_path orphan primitive, and the TOCTOU race on the group check.
-- Re-run migration 044's §3 body verbatim (SECURITY INVOKER, no lock, no
-- immutability check), then restore 044's COMMENT ON FUNCTION.
-- ============================================================
