-- ============================================================
-- Migration 067: the parent half of the same-pet invariant 066 asserted
-- but did not enforce (CUL-899 VV-1, rls-privacy-reviewer finding 1)
-- ============================================================
--
-- 066 is already applied, so this is a follow-up rather than an edit to it: the
-- recorded migration must keep saying what was actually run (the 045 rule).
--
-- ------------------------------------------------------------
-- FINDING 1 — the invariant was enforced on the CHILD and not on the PARENT,
-- and 066's COMMENT ON FUNCTION stated it as fact.
-- ------------------------------------------------------------
-- Demonstrated, executed against the LIVE schema inside a rolled-back transaction
-- (and independently against a PG16 replay by the reviewer):
--
--   1. One owner, two pets. Link a medication, a diet trial and an appointment —
--      all of pet P1 — to P1's visit V. Every write legal, every trigger passes.
--   2. `UPDATE vet_visits SET pet_id = P2 WHERE id = V;`  → ACCEPTED, 1 row.
--      `vet_visits.pet_id` is freely mutable under `vet_visits_owner` (001:231).
--   3. Three rows now name a visit belonging to a different pet. Measured: 3.
--
-- 066's trigger guards the CHILD's write. Nothing guarded the parent's move, so
-- the invariant its COMMENT ON FUNCTION asserts — "an owner could link one pet's
-- row to another pet's visit" named as the thing prevented — was FALSE in the
-- database. That is 045's own diagnosis, word for word, on the half 066 did not
-- import: "044 asserts an invariant that the database does not actually enforce —
-- and 044's COMMENT ON FUNCTION states that invariant, so the comment was writing
-- a cheque the code did not cash." 045 closed the parent half for `vet_documents`
-- by freezing `storage_path` and noted it "closes the pet_id half for free"; 066
-- took 045's SECURITY DEFINER + pinned-search_path half and left this one behind.
--
-- ------------------------------------------------------------
-- FINDING 1b — the second-order half, which is worse than the bleed
-- ------------------------------------------------------------
-- 066's trigger re-validates on EVERY write (it tests `NEW.vet_visit_id IS NOT
-- NULL`, never whether the link CHANGED). So once a parent has moved, the linked
-- rows are permanently UN-WRITABLE. Executed, live:
--
--   UPDATE medications SET notes = 'an ordinary edit' WHERE id = M;
--   ERROR: 23514 vet_visit_id … must reference a vet visit for the same pet (…)
--
-- An edit that touches neither the link nor the pet is refused — and `23514` is in
-- `TERMINAL_SYNC_ERROR_CODES` (lib/sync.ts), so the client QUARANTINES the row
-- immediately with no retry. The owner loses the ability to edit her own
-- medication, permanently, with no path in the app to move the visit back.
--
-- Both halves are closed below, and they are independent on purpose:
--   * §1 makes the violation unwritable (no new row can ever get into that state).
--   * §2 makes an unrelated edit stop re-validating, so a row that somehow IS in
--     that state stays EDITABLE rather than bricked. Writable-but-violating beats
--     bricked: the first is repairable by the owner, the second is not repairable
--     at all.
--
-- ------------------------------------------------------------
-- SEVERITY, STATED HONESTLY
-- ------------------------------------------------------------
-- WITHIN-ACCOUNT, not cross-tenant. `vet_visits_owner`'s reused WITH CHECK still
-- confines the move to the owner's own pets, so no cross-ACCOUNT link is
-- constructible — the cross-tenant boundary held under every attack tried.
-- NOT REACHABLE FROM TODAY'S UI: the only write to `vet_visits` is the INSERT at
-- app/vet-visit.tsx, and the sync round-trip only echoes the stored `pet_id`.
-- It becomes reachable the moment VV-6 ships a visit edit control, or from any
-- service-role backfill — and a BEFORE trigger binds the service role too, which a
-- policy would not. Fixed now because it is free now: 0 rows can violate it today
-- (verified), and it is expensive once appointments and links exist.
--
-- ------------------------------------------------------------
-- WHY IMMUTABLE RATHER THAN CASCADING THE MOVE
-- ------------------------------------------------------------
-- Re-pointing the children along with the parent would be the other repair, and it
-- is wrong here: a visit that happened to pet A did not happen to pet B, so moving
-- it is not a correction, it is a fabrication — and it would silently re-attribute
-- a medication's and a trial's provenance. "I logged this under the wrong pet" is
-- real, and its honest implementation is delete-and-re-log (the row is one INSERT),
-- not a silent re-point that strands or rewrites every link. If VV-6 ever needs a
-- genuine move, it takes a deliberate migration that also decides what happens to
-- the links — which is exactly the decision this makes someone make.
--
-- ------------------------------------------------------------
-- ALSO IN THIS FILE — three corrections to 066's own prose
-- ------------------------------------------------------------
-- A migration header is the permanent record the next reviewer in this family will
-- trust, and three of 066's statements are not true as written. Corrected via
-- COMMENT (which is queryable schema state) rather than by editing the applied file:
--
--   (a) `vet_visits.deleted_at`'s comment says "Every reader gained deleted_at IS
--       NULL in this PR". Not true of `lib/db.ts`'s isLocalDataEmpty(), which the
--       same PR deliberately exempts (it asks "does this device hold any rows",
--       and a soft-deleted row is still a row). Left as written, it invites a
--       future reader to "fix" a deliberate carve-out.
--   (b) `enforce_vet_visit_link_same_pet`'s comment asserts the invariant this
--       migration is what actually makes true.
--   (c) The `questions` 64 KB bound is described as reachable "only by a bug or an
--       attacker". Measured: 12 spec-shaped questions of ~5.2 KB each reach it —
--       a paste, not a marathon — and the "~4x the product cap" it rests on is a
--       cap no shipped code enforces (VV-2 is not built). The bound stays (it is
--       the right backstop); the CLAIM is corrected, and the client-side guard that
--       makes the CHECK genuinely unreachable lands in lib/sync.ts in the same PR.
--
-- ------------------------------------------------------------
-- AND ONE DISCLOSURE 066 OWED AND DID NOT MAKE
-- ------------------------------------------------------------
-- The SECURITY DEFINER flip creates a cross-account MEMBERSHIP ORACLE, by error
-- CLASS rather than by message. Executed: for a caller holding two UUIDs,
--   42501 (RLS)     ⟹ visit V DOES belong to pet P
--   23514 (trigger) ⟹ it does not, or V does not exist
-- Under SECURITY INVOKER both return 23514, so the flip is what creates it. 066's
-- ⚠ C-31 note answers only the narrower question (the message text, which is
-- genuinely byte-identical across causes — verified). 047 disclosed exactly this
-- class for `medication_administrations` and said why it must be recorded rather
-- than dismissed: "calling it 'no behaviour change' is how it would have gone
-- unrecorded." Gated behind knowing two unguessable v4 UUIDs that are themselves
-- the protected identifiers, so it is not a practical exposure — but it is a real
-- information leak that did not exist before, now on three more tables.
--
-- A correction to 047's own warning, from the same pass and worth carrying: 047
-- says a per-verb policy split "or WITH CHECK (true)" makes this class fail open.
-- Executed — a bare per-verb split still HOLDS (Postgres reuses USING when
-- WITH CHECK is omitted), and WITH CHECK (true) alone still HOLDS (a pet-scoped
-- SELECT policy is applied to the new row on UPDATE). It broke only with
-- WITH CHECK (true) AND a non-pet-scoped SELECT policy. Two conditions, not one.
-- ⚠ Live-verified 2026-09-11: `medications_owner` and `diet_trials_owner` are both
-- `FOR ALL USING (…)` with `with_check IS NULL`, so that reuse is load-bearing on
-- both tables. Any PR splitting either policy must re-check this case explicitly.
--
-- ------------------------------------------------------------
-- Migration Safety Pre-flight
-- ------------------------------------------------------------
--   Destructive y/n:  n. Adds one trigger function + one trigger; replaces one
--                     trigger function body (CREATE OR REPLACE); re-states three
--                     COMMENTs. Adds no column, table, index or policy; drops
--                     nothing; touches no row data.
--   Affected tables:  public.vet_visits (one new BEFORE UPDATE trigger).
--                     Row-count check to run BEFORE applying — verified 0 live:
--                       select count(*) from public.vet_visits;              -> 0
--                       select count(*) from public.medications m
--                         join public.vet_visits v on v.id = m.vet_visit_id
--                        where v.pet_id <> m.pet_id;                         -> 0
--                       (and the same for diet_trials / vet_appointments)
--                     A non-zero second result means a row already violates the
--                     invariant; §1 would not reject it (it fires on UPDATE of
--                     pet_id only) but it must be repaired before VV-6.
--   Backfill:         N/A — no data change. Nothing can violate §1 retroactively:
--                     it fires on UPDATE only, and no existing row is being updated.
--   Rollback plan:    reversible:
--                       DROP TRIGGER IF EXISTS trg_vet_visits_pet_immutable ON public.vet_visits;
--                       DROP FUNCTION IF EXISTS enforce_vet_visit_pet_immutable();
--                     then re-run 066's body of enforce_vet_visit_link_same_pet()
--                     verbatim (it is in 066 §3). Rolling back re-opens the
--                     cross-pet link AND the bricking described above.
-- ============================================================


-- ============================================================
-- 1. The parent cannot move (the 045 storage_path move, applied to pet_id)
-- ============================================================
CREATE OR REPLACE FUNCTION enforce_vet_visit_pet_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
-- SECURITY DEFINER is deliberately NOT used here, and the asymmetry with its
-- sibling is the point: this function reads NOTHING. It compares two columns of the
-- row in front of it, so it has no lookup to be RLS-blinded on, and an elevated
-- context would be privilege with no purpose. `search_path` is pinned anyway — it
-- costs nothing and keeps the family's shape uniform.
SET search_path = ''
AS $$
BEGIN
  -- IS DISTINCT FROM (not <>) so a NULL can never slip past, and so the upsert path
  -- still passes: PostgREST re-sends pet_id with its EXISTING value on a conflict,
  -- which is not DISTINCT from itself.
  IF NEW.pet_id IS DISTINCT FROM OLD.pet_id THEN
    -- Names only NEW.* and OLD.pet_id — both columns of the row the caller already
    -- holds and has already been RLS-cleared to write. No lookup, so nothing here
    -- can be another tenant's data (C-31).
    RAISE EXCEPTION
      'vet_visits.pet_id is immutable (visit %); a visit that happened to one pet did not happen to another, and moving it would strand or silently re-attribute every medication, trial and appointment linked to it',
      NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Part of the SECURITY DEFINER decision family even though this one is INVOKER:
-- revoked anyway so the whole family has one posture and nobody has to work out
-- which members needed it (CUL-935 asks for the mechanical version of this).
REVOKE ALL ON FUNCTION public.enforce_vet_visit_pet_immutable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_vet_visit_pet_immutable() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_vet_visit_pet_immutable() FROM authenticated;

CREATE TRIGGER trg_vet_visits_pet_immutable
  BEFORE UPDATE ON vet_visits
  FOR EACH ROW EXECUTE FUNCTION enforce_vet_visit_pet_immutable();


-- ============================================================
-- 2. The link guard stops re-validating writes that cannot violate it
-- ============================================================
-- Identical to 066's body except for the guard clause. The change is what makes an
-- ordinary edit to a linked row survive even if that row is somehow already in a
-- violating state — see FINDING 1b. It is also strictly cheaper: the common case
-- (an edit that touches neither the link nor the pet) now does ZERO lookups instead
-- of one per write on three tables, two of which are the hot medication and trial
-- mirrors.
--
-- The predicate is BOTH columns, not just the link: moving the CHILD to a different
-- pet invalidates the pair exactly as re-pointing the link does, so `NEW.pet_id IS
-- DISTINCT FROM OLD.pet_id` is not defensive padding — without it, an owner could
-- link a row legally and then move that row to her other pet.
CREATE OR REPLACE FUNCTION enforce_vet_visit_link_same_pet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.vet_visit_id IS NOT NULL
     AND (
       TG_OP = 'INSERT'
       OR NEW.vet_visit_id IS DISTINCT FROM OLD.vet_visit_id
       OR NEW.pet_id      IS DISTINCT FROM OLD.pet_id
     )
     AND NOT EXISTS (
       SELECT 1
       FROM public.vet_visits v
       WHERE v.id = NEW.vet_visit_id
         AND v.pet_id = NEW.pet_id
     ) THEN
    -- NEW.* only, and one message for both causes (C-31 / CUL-867). Unchanged from
    -- 066 and verified byte-identical across "no such visit" and "another pet's
    -- visit" — do not "improve" it by adding the visit's date or pet.
    RAISE EXCEPTION
      'vet_visit_id % must reference a vet visit for the same pet (%)',
      NEW.vet_visit_id, NEW.pet_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- CREATE OR REPLACE preserves the ACL, so 066's follow-up REVOKEs still hold.
-- Re-stated anyway: this is the third instance in this family of the REVOKE being
-- the forgotten line (045, 066, and 066 again would have been the fourth), and
-- re-running it is idempotent (CUL-935).
REVOKE ALL ON FUNCTION public.enforce_vet_visit_link_same_pet() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_vet_visit_link_same_pet() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_vet_visit_link_same_pet() FROM authenticated;


-- ============================================================
-- 3. The three corrected COMMENTs
-- ============================================================
COMMENT ON FUNCTION enforce_vet_visit_pet_immutable() IS
  'CUL-899 VV-1 / migration 067: the PARENT half of the same-pet invariant. 066 guarded every write to a CHILD carrying vet_visit_id and left vet_visits.pet_id freely mutable under vet_visits_owner, so one RLS-legal UPDATE moved a visit to the owner''s other pet and left three tables naming a visit belonging to a different pet — and, because 066''s guard re-validated on every write, permanently bricked those rows (terminal 23514 → client quarantine). Executed against the live schema, not reasoned about. This is 045''s finding on the half 066 did not import: an invariant a COMMENT asserted and the database did not hold. Immutable rather than cascading because a visit that happened to one pet did not happen to another — the honest repair for a mis-filed visit is delete and re-log.';

COMMENT ON FUNCTION enforce_vet_visit_link_same_pet() IS
  'CUL-899 VV-1 (066, amended by 067): defense-at-rest guard over the three bare FKs to vet_visits (vet_appointments, medications, diet_trials). FK checks bypass RLS, so a bare FK verifies only that the target EXISTS — an owner could link one pet''s row to another pet''s visit, and naming a FOREIGN account''s visit would let that account''s deletion silently un-link this owner''s row (ON DELETE SET NULL, no trace). SECURITY DEFINER per 045''s finding, made safe by the pinned search_path; the CUL-867/C-31 rule that the message names only NEW.* values, identically for "no such visit" and "another pet''s visit", is written once for all three tables. 067 narrowed the guard clause to fire only when the link or the row''s pet actually CHANGES: re-validating every write meant a row whose PARENT had moved could never be edited again. NOTE the disclosure in 067''s header — the DEFINER flip makes 42501-vs-23514 a cross-account membership oracle for a caller holding two UUIDs (047''s recorded class).';

COMMENT ON COLUMN vet_visits.deleted_at IS
  'CUL-899 VV-1 / §4.1 D3 (comment corrected by 067): the soft-delete column, shipped AHEAD of its control. Every RECORD-FACING reader gained `deleted_at IS NULL` in that PR — lib/rundown.ts readLastVisitDate, lib/vetDocumentDetail.ts VET_VISIT_OPTIONS_QUERY, and generate-report''s scope-cascade pull (which lands on main INERT until the CUL-19 redeploy). TWO readers deliberately do NOT filter, and neither is an oversight: hydration CARRIES the column unfiltered because a tombstone is a change that has to travel between devices, and lib/db.ts isLocalDataEmpty() asks "does this device hold any rows at all", for which a soft-deleted row still counts — both are registered in guards/visitReaders.test.ts. 066''s version of this comment said "every reader", which was wrong in a way that invited someone to "fix" the carve-out. The delete CONTROL (VV-6) waits for the CUL-19 redeploy.';

COMMENT ON COLUMN vet_appointments.questions IS
  'CUL-899 VV-1 / §5.1 (comment corrected by 067): [{id, text, source, source_ref, asked_at}]. JSON rather than a child table because nothing queries across appointments for these. Data Scientist''s standing condition: promote to a table the moment ANY surface counts them. The two CHECKs are structural — array-typed, and 64 KB of JSON text. ⚠ 066 described that bound as reachable "only by a bug or an attacker"; MEASURED, it is reachable by twelve spec-shaped questions of ~5.2 KB each, which is a paste rather than a marathon, and the "~4x the product cap" it rested on is a cap no shipped code enforces (VV-2 is not built). The bound stays — it is the right backstop against an unbounded owner-controlled column at rest — but the thing that keeps a legitimate client off it is the CLIENT-side bound in lib/sync.ts''s push path, because reaching this CHECK is a terminal 23514 that quarantines the row and wedges that appointment''s sync.';
