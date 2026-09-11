-- ============================================================
-- Migration 066: vet_appointments + the three visit links (CUL-899, VV-1)
-- Spec: docs/nyx-vet-visits-requirements.md §5.1 (schema), §5.3 (readers),
--       §6.1 (privacy posture), G3.
-- Patterns imported: 001 (vet_visits_owner, the per-pet owner shape), 044 (a new
--   per-pet table with soft-delete semantics and NO DELETE verb), 045 (the
--   HARDENED same-pet trigger — SECURITY DEFINER, pinned search_path).
-- ============================================================
--
-- ⚠ AMENDED BY MIGRATION 067 — READ IT BEFORE CHANGING ANYTHING HERE.
-- The same-pet guard below is enforced on the CHILD only. `vet_visits.pet_id` stayed
-- freely mutable, so ONE RLS-legal `UPDATE vet_visits SET pet_id` moved a visit to
-- the owner's other pet and left all three linked tables naming a visit belonging to
-- a different pet — and, because the guard re-validated on EVERY write, permanently
-- bricked those rows (terminal 23514 → client quarantine). Found by the VV-1
-- rls-privacy-reviewer and reproduced against the live schema. 067 closes both
-- halves and corrects three statements in this file's prose (the "every reader"
-- claim on `deleted_at`, the invariant asserted in COMMENT ON FUNCTION, and the
-- `questions` bound's "only by a bug or an attacker"). This file is left as applied
-- so the record stays honest — the 045 discipline.
--
-- WHAT THIS IS. The substrate for the vet-visit companion, and nothing else. No UI
-- ships in this PR (VV-2 onward) and no server-side reader gains a new input: the
-- one Edge-Function change that rides with it is a FILTER on an existing pull, and
-- it is inert until the CUL-19 redeploy.
--
-- ------------------------------------------------------------
-- WHY A SECOND TABLE AND NOT A NULLABLE `visited_at` (G3, PM 2026-09-10)
-- ------------------------------------------------------------
-- `vet_visits` means "a visit that happened", and three shipped readers depend on
-- that meaning without stating it:
--
--   * lib/rundown.ts readLastVisitDate — `MAX(visited_at)`, UNBOUNDED. A booked
--     future date stored here becomes "your last visit", and the rundown's whole
--     "what changed since then" section is computed from that date — so every food
--     and regimen would silently fall OUTSIDE the window.
--   * lib/vetDocumentDetail.ts VET_VISIT_OPTIONS_QUERY — the Vet Files link picker,
--     likewise unbounded and reverse-chron, so a booking would sit at the top of the
--     list of visits a lab result can be filed under.
--   * generate-report — the scope cascade's rung 1. A future-dated row here moves
--     the report window, which is the single most load-bearing date in the product.
--
-- Each of those could be taught to exclude future rows. None of them WOULD be, at
-- the moment someone adds the fourth reader. A separate table makes the invariant
-- structural: there is no way to write a booking into the table whose rows mean
-- "happened", so every existing and future reader of `vet_visits` stays correct by
-- construction rather than by remembering. That is the same argument 044 made for
-- not relaxing `vet_visit_attachments.vet_visit_id`.
--
-- ------------------------------------------------------------
-- ONE DEVIATION FROM SPEC §5.1, RECORDED RATHER THAN QUIET
-- ------------------------------------------------------------
-- §5.1's DDL names this table's link `visit_id`. It ships as `vet_visit_id`.
--
-- Two reasons, and the second is the real one:
--   (1) The three other links to this table — vet_visit_attachments.vet_visit_id,
--       vet_documents.vet_visit_id, and the two added below — are all spelled
--       `vet_visit_id`. A fourth spelling buys nothing.
--   (2) guards/visitReaders.test.ts keys its column detector on the string
--       `vet_visit_id`. A link column spelled differently would be INVISIBLE to
--       that guard — a hole in the new boundary, opened by the same PR that builds
--       it. Naming is what makes the guard total.
--
-- It also lets ONE trigger function serve all three tables (§3 below), so the rule
-- about what a trigger's error message may say is written once instead of three
-- times. Flagged to the PM in the PR body; §11 of the spec carries the doc edit.
--
-- ------------------------------------------------------------
-- COLUMN NOTES — the ones that are decisions rather than plumbing
-- ------------------------------------------------------------
--
-- scheduled_at TIMESTAMPTZ, not DATE — deliberately unlike `vet_visits.visited_at`.
-- A visit that happened is remembered as a DAY; an appointment that has not happened
-- yet has a TIME, and two surfaces need it: the 5-day Home window (§4.1 B1) and
-- CUL-253's reminder. Time-optional in the UI is a client concern (VV-2 stores
-- a chosen hour or a sensible default); the column can always answer.
--
-- questions JSONB — [{id, text, source, source_ref, asked_at}]. A JSON column rather
-- than a child table because nothing ever queries across appointments for these:
-- they are read as a list, written as a list, and moved onto the visit at save. The
-- Data Scientist's condition on that ruling is recorded on CUL-899 — promote to a
-- table the moment ANY surface counts them, because a count over a JSONB array is
-- the shape that later gets written as a lateral join nobody can index.
--
--   The two CHECKs on it are structural, not product rules:
--     * jsonb_typeof = 'array' — a scalar or an object here would break every
--       reader's `for (const q of questions)` at render time rather than at write.
--     * length(questions::text) <= 65536 — this column is owner-controlled free
--       text with no bound at rest, and an unbounded one is a memory fact for
--       whatever isolate eventually holds a page of these rows (the CUL-875 finding
--       on `looks.notes`, applied before there is a writer instead of after).
--       64 KB is roughly 4x the product cap (§5.1: "≤ a dozen strings"), and the
--       headroom is the point: a CHECK a legitimate client can actually HIT is a
--       terminal 23514 on the push, which quarantines the row and wedges that
--       appointment's sync forever (the reasoning 044 used to refuse a UNIQUE index
--       on page order). This one can only be reached by a bug or an attacker.
--
-- notes_draft TEXT, deliberately UNBOUNDED, and that asymmetry with `questions` is
-- the decision. This is the C1 in-room draft, and at save it is MOVED into
-- `vet_visits.notes` — which has no bound. A bound here that the destination lacks
-- would mean a draft that cannot be saved to the place it is going, which is worse
-- than no bound at all. If `vet_visits.notes` ever gains one, this follows it.
--
-- vet_visit_id — the attendance link, NULL until the visit is logged. ON DELETE SET
-- NULL: deleting the visit un-links the appointment rather than destroying the
-- record that it was booked. Its same-pet guard is §3; the FK alone is not one.
--
-- cancelled_at vs deleted_at — two different facts, both needed, neither derivable
-- from the other. `cancelled_at` is a fact about the WORLD (the appointment did not
-- happen); a cancelled row still belongs in Past, because "we cancelled" is history
-- an owner may want. `deleted_at` is a fact about the RECORD (the owner removed it);
-- a deleted row is never rendered. Collapsing them would make an owner choose
-- between keeping a wrong entry and losing a true one.
--
-- ------------------------------------------------------------
-- Migration Safety Pre-flight
-- ------------------------------------------------------------
--   Destructive y/n:  n. Purely additive — one new table with its indexes, RLS
--                     policies and triggers; three ADD COLUMN (all nullable, no
--                     default, no rewrite); one new trigger function and three
--                     triggers. Drops, renames or alters NO existing column,
--                     table, policy or row. The two ALTERs on live tables
--                     (medications, diet_trials) add a nullable column, which
--                     Postgres does as a catalog-only change — no table rewrite,
--                     no lock beyond the brief ACCESS EXCLUSIVE for the catalog
--                     update.
--   Affected tables:  public.vet_appointments (new, 0 rows by construction),
--                     public.vet_visits, public.medications, public.diet_trials
--                     (one nullable column each; every existing row reads NULL,
--                     which is the honest value — no visit has ever been linked
--                     and no visit has ever been deleted).
--                     Row-count check the PM can run BEFORE applying:
--                       select to_regclass('public.vet_appointments');  -> expect NULL
--                     A non-NULL result means someone already created the table;
--                     STOP rather than re-running.
--   Backfill:         N/A. All three new columns are nullable with no default and
--                     NULL is correct for every existing row. Nothing can violate
--                     the new triggers retroactively — they fire on write only, and
--                     a NULL link takes the fast path.
--   Rollback plan:    reversible; run in this order (dependents first):
--                       DROP TRIGGER IF EXISTS trg_diet_trials_visit_same_pet ON public.diet_trials;
--                       DROP TRIGGER IF EXISTS trg_medications_visit_same_pet ON public.medications;
--                       DROP TRIGGER IF EXISTS trg_vet_appointments_visit_same_pet ON public.vet_appointments;
--                       DROP TRIGGER IF EXISTS trg_vet_appointments_updated_at ON public.vet_appointments;
--                       DROP FUNCTION IF EXISTS enforce_vet_visit_link_same_pet();
--                       ALTER TABLE public.diet_trials DROP COLUMN vet_visit_id;
--                       ALTER TABLE public.medications DROP COLUMN vet_visit_id;
--                       ALTER TABLE public.vet_visits  DROP COLUMN deleted_at;
--                       DROP TABLE IF EXISTS public.vet_appointments;
--                     Safe today at 0 appointments and 0 links. After VV-2/VV-3
--                     ship it destroys every booked appointment and every
--                     provenance link — back up first.
-- ============================================================


-- ============================================================
-- 1. The table
-- ============================================================
CREATE TABLE vet_appointments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pet_id        UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  -- A time, not a day — the Home window and CUL-253's reminder both need one.
  scheduled_at  TIMESTAMPTZ NOT NULL,
  clinic_name   TEXT,
  vet_name      TEXT,
  reason        TEXT,
  -- [{id, text, source: 'record'|'owner', source_ref, asked_at}] — see the header
  -- for why JSON, and for what the two CHECKs below are and are not.
  questions     JSONB,
  -- The C1 in-room draft, before a vet_visits row exists. Unbounded on purpose
  -- (see the header): it is moved into vet_visits.notes at save, which is unbounded.
  notes_draft   TEXT,
  -- Filled when the visit is logged. Spelled `vet_visit_id`, not §5.1's `visit_id`
  -- — see the header. Its same-pet guard is §3; the FK alone is not one.
  vet_visit_id  UUID REFERENCES vet_visits(id) ON DELETE SET NULL,
  -- A fact about the world; a cancelled appointment still belongs in Past.
  cancelled_at  TIMESTAMPTZ,
  -- A fact about the record; a deleted appointment is never rendered.
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT vet_appointments_questions_is_array
    CHECK (questions IS NULL OR jsonb_typeof(questions) = 'array'),
  -- `questions::text` is immutable (jsonb_out), so this is a legal CHECK expression.
  CONSTRAINT vet_appointments_questions_bounded
    CHECK (questions IS NULL OR length(questions::text) <= 65536)
);

-- The two reads VV-2 ships — "this pet's appointments, soonest first" for Next and
-- the same set reversed for Past — plus FK coverage for the pets CASCADE.
--
-- Deliberately NOT partial on `deleted_at IS NULL`, for 044's reason: a partial
-- index cannot serve the pets-cascade delete, which must find ALL rows including
-- the soft-deleted ones, and an unindexed FK is what get_advisors flags. One
-- non-partial index serves both.
CREATE INDEX idx_vet_appointments_pet_scheduled
  ON vet_appointments(pet_id, scheduled_at DESC);

-- FK coverage for the ON DELETE SET NULL scan on vet_visits, and the "did this
-- visit come from a booking?" read. Partial because the column is NULL for every
-- row until the visit is logged; the scan's `vet_visit_id = <uuid>` implies the
-- predicate, so a partial index still serves it.
CREATE INDEX idx_vet_appointments_visit
  ON vet_appointments(vet_visit_id) WHERE vet_visit_id IS NOT NULL;

-- Reuse set_updated_at() from 001, as every mutable table since 016 does, so a
-- server write stamps updated_at = NOW() and the local mirror has a real
-- server-time last-write-wins basis rather than a client clock.
CREATE TRIGGER trg_vet_appointments_updated_at
  BEFORE UPDATE ON vet_appointments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- 2. Row Level Security
-- ============================================================
-- Default-deny, per-pet owner scope — the `vet_visits_owner` shape (001), in the
-- THREE-VERB form 044 established rather than 001's `FOR ALL`.
--
-- The missing verb is the decision. This table carries `deleted_at`, so a delete is
-- an UPDATE; account deletion runs the pets CASCADE under the service role, which
-- is RLS-exempt; and any future retention purge is a server-side sweep. There is no
-- client path that needs a hard DELETE, so it is withheld by default-deny rather
-- than granted and then contradicted by convention. (041 recorded inheriting the
-- `FOR ALL` grant as debt on a table with exactly this rule; a new table is the only
-- cheap moment not to repeat it.)
--
-- The WITH CHECK on INSERT/UPDATE is not ceremony: USING gates which rows you may
-- touch, WITH CHECK gates what they may BECOME. Without it an owner could re-point
-- `pet_id` at a pet they do not own, moving an appointment out of their account.
--
-- `auth.uid()` wrapped in `(select …)` so it is evaluated once per statement rather
-- than once per row (the auth_rls_initplan lint), matching 040/041/044.
ALTER TABLE vet_appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vet_appointments_owner_select" ON vet_appointments
  FOR SELECT USING (
    pet_id IN (SELECT id FROM pets WHERE user_id = (select auth.uid()))
  );

CREATE POLICY "vet_appointments_owner_insert" ON vet_appointments
  FOR INSERT WITH CHECK (
    pet_id IN (SELECT id FROM pets WHERE user_id = (select auth.uid()))
  );

CREATE POLICY "vet_appointments_owner_update" ON vet_appointments
  FOR UPDATE USING (
    pet_id IN (SELECT id FROM pets WHERE user_id = (select auth.uid()))
  )
  WITH CHECK (
    pet_id IN (SELECT id FROM pets WHERE user_id = (select auth.uid()))
  );

-- DELETE: deliberately NOT created. See above — soft delete only.


-- ============================================================
-- 3. The links, and the one guard all three share
-- ============================================================
-- `deleted_at` on vet_visits. The COLUMN ships now so the report's reader can land
-- on `main` ahead of the CUL-19 redeploy; the delete CONTROL waits for VV-6, which
-- is gated on that redeploy (§4.1 D3). Nothing writes this column in this PR.
ALTER TABLE vet_visits  ADD COLUMN deleted_at   TIMESTAMPTZ;

-- Provenance links. A course or a trial that names a visit says WHERE IT CAME FROM;
-- its dates and counts stay its own. This is CUL-746's rule (one population, one
-- owner) and TG-5's (a link never moves a date), and it is why neither column is
-- read by any count, coverage line or engine input — pinned by
-- guards/visitReaders.test.ts.
ALTER TABLE medications ADD COLUMN vet_visit_id UUID REFERENCES vet_visits(id) ON DELETE SET NULL;
ALTER TABLE diet_trials ADD COLUMN vet_visit_id UUID REFERENCES vet_visits(id) ON DELETE SET NULL;

-- FK coverage for both SET NULL scans, partial for the same reason as above.
CREATE INDEX idx_medications_vet_visit
  ON medications(vet_visit_id) WHERE vet_visit_id IS NOT NULL;
CREATE INDEX idx_diet_trials_vet_visit
  ON diet_trials(vet_visit_id) WHERE vet_visit_id IS NOT NULL;

-- ------------------------------------------------------------
-- The same-pet guard (the 045 mechanism, not 044's)
-- ------------------------------------------------------------
-- THREE new bare FKs to vet_visits land in this migration, and a bare FK is not an
-- ownership check: FOREIGN KEY CHECKS BYPASS RLS, so each one verifies only that the
-- target EXISTS. An owner with two pets could link Pet A's regimen to Pet B's visit;
-- naming ANOTHER ACCOUNT's visit id is worse and quieter, because their deletion of
-- that visit would then silently un-link this owner's row (ON DELETE SET NULL) with
-- no user action and no trace — the "silent shrink" 041 measured on
-- diet_trial_foods.
--
-- ONE FUNCTION, THREE TRIGGERS. It is possible only because all three columns are
-- spelled `vet_visit_id` (see the header's deviation note) and all three tables
-- carry `pet_id`. Worth the coupling: the rule about what this function's error
-- message may say (below) is then written once and cannot be got right on two
-- tables and wrong on the third.
--
-- SECURITY DEFINER, from 045's finding rather than 044's default. Under SECURITY
-- INVOKER the lookup is itself RLS-filtered, so a foreign account's visit is
-- invisible. This check's polarity (`NOT EXISTS → RAISE`) means that would still
-- fail CLOSED — but by accident, and 045 proved the sibling polarity in the same
-- function failed OPEN. A defense-at-rest guard has to see the whole table by
-- definition, so it does, and the reason it is then safe is the pinned search_path:
-- an elevated body with a caller-controlled search_path is the classic
-- privilege-escalation shape. Pinned to '' and every reference schema-qualified.
--
-- ⚠ WHAT THE ERROR MESSAGE MAY SAY (CUL-867 / C-31). This function runs BEFORE RLS
-- and under DEFINER, so its lookup sees every tenant's rows. Anything it read from
-- the parent row and formatted into a RAISE would be a cross-account field read for
-- anyone holding two ids — which is not a high bar, because ids travel in attachment
-- paths (`{petId}/{eventId}/…`) and a pasted signed URL outlives its token. So the
-- message names ONLY `NEW.*` values, and it is the SAME message whether the visit
-- does not exist or belongs to another pet: distinguishing them would itself be an
-- existence oracle. Do not "improve" this by adding the visit's date or pet.
--
-- WHY CHECKING THE PET IS SUFFICIENT. `pets.user_id` makes a pet unique to one
-- owner and `NEW.pet_id` is already RLS-verified as the writer's pet, so
-- same-pet ⟹ same-owner: one check closes both the cross-pet and the cross-account
-- case. 023's argument, and it holds under either security context.
--
-- WHY A TRIGGER AND NOT `WITH CHECK`. A policy binds `authenticated` only; every
-- service-role caller bypasses it entirely, and delete-account holds the service
-- role today.
--
-- Cost on the two LIVE tables: one branch per write. Every existing row and every
-- shipped writer leaves `vet_visit_id` NULL, so the NULL fast path means zero
-- lookups until VV-3 starts setting it.
CREATE OR REPLACE FUNCTION enforce_vet_visit_link_same_pet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.vet_visit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.vet_visits v
    WHERE v.id = NEW.vet_visit_id
      AND v.pet_id = NEW.pet_id
  ) THEN
    -- NEW.* only, and one message for both causes. See the ⚠ note above.
    RAISE EXCEPTION
      'vet_visit_id % must reference a vet visit for the same pet (%)',
      NEW.vet_visit_id, NEW.pet_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_vet_appointments_visit_same_pet
  BEFORE INSERT OR UPDATE ON vet_appointments
  FOR EACH ROW EXECUTE FUNCTION enforce_vet_visit_link_same_pet();

CREATE TRIGGER trg_medications_visit_same_pet
  BEFORE INSERT OR UPDATE ON medications
  FOR EACH ROW EXECUTE FUNCTION enforce_vet_visit_link_same_pet();

CREATE TRIGGER trg_diet_trials_visit_same_pet
  BEFORE INSERT OR UPDATE ON diet_trials
  FOR EACH ROW EXECUTE FUNCTION enforce_vet_visit_link_same_pet();

-- ------------------------------------------------------------
-- REVOKE — part of the SECURITY DEFINER decision, not a tidy-up (047)
-- ------------------------------------------------------------
-- Postgres grants EXECUTE to PUBLIC on every new function, so a SECURITY DEFINER
-- function in `public` lands on `/rest/v1/rpc/<name>` reachable with the ANON key,
-- running as `postgres`. 047 wrote this down in as many words — "revoking EXECUTE is
-- not optional here, it is part of the fix… without it, the flip is a lateral move,
-- not a hardening" — after 045 shipped precisely this omission and the advisor
-- flagged it twice for three months.
--
-- ⚠ AND THIS FILE SHIPPED IT AGAIN. The first apply of 066 (2026-09-11) had no
-- REVOKE, and `get_advisors` immediately returned the same two findings 045 earned:
-- `anon`/`authenticated` can execute `enforce_vet_visit_link_same_pet` as a DEFINER
-- function. Recorded rather than quietly corrected, because it is the third instance
-- of one omission and the useful fact is that 047's written warning did not prevent
-- it — the guard against it should be mechanical, which is filed as a follow-up.
--
-- Practical severity here is low: the function RETURNS TRIGGER, and Postgres refuses
-- to call a trigger function outside a trigger context, so the RPC errors rather than
-- executing. Low is not zero, and "it fails for an unrelated reason" is not an access
-- boundary — the boundary is the grant.
--
-- LIVE-DB NOTE (the 045 discipline: a recorded migration must keep saying what was
-- actually run). The three statements below were applied to the live project as a
-- SECOND migration record, `vet_appointments_revoke_execute`, because 066 had already
-- been applied when the advisor surfaced this. This FILE is what a fresh project
-- replays, so it carries both halves in one place, which is correct for a replay and
-- deliberately one record fewer than the live log.
REVOKE ALL ON FUNCTION public.enforce_vet_visit_link_same_pet() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_vet_visit_link_same_pet() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_vet_visit_link_same_pet() FROM authenticated;


-- ============================================================
-- 4. Documentation
-- ============================================================
COMMENT ON TABLE vet_appointments IS
  'CUL-899 VV-1 / spec §5.1 (G3): a BOOKED, not-yet-happened vet visit. Deliberately separate from vet_visits so every existing reader of that table keeps meaning "a visit that happened" — lib/rundown.ts readLastVisitDate is an unbounded MAX(visited_at), the Vet Files link picker is unbounded and reverse-chron, and generate-report keys the report window''s first rung off visited_at. A future date in any of those is a silently wrong window, so the separation is structural rather than a filter each reader must remember.';

COMMENT ON COLUMN vet_appointments.vet_visit_id IS
  'CUL-899 VV-1: the attendance link, NULL until the visit is logged. Spelled vet_visit_id rather than spec §5.1''s visit_id so it matches the three sibling links and so guards/visitReaders.test.ts''s column detector can see it. ON DELETE SET NULL: deleting the visit un-links the appointment rather than destroying the record that it was booked. Same-pet integrity is enforce_vet_visit_link_same_pet(), not the FK — FK checks bypass RLS.';

COMMENT ON COLUMN vet_appointments.scheduled_at IS
  'CUL-899 VV-1: TIMESTAMPTZ, deliberately unlike vet_visits.visited_at (DATE). A visit that happened is remembered as a day; a booking has a time, and both the 5-day Home window (§4.1 B1) and CUL-253''s reminder need it.';

COMMENT ON COLUMN vet_appointments.questions IS
  'CUL-899 VV-1 / §5.1: [{id, text, source, source_ref, asked_at}]. JSON rather than a child table because nothing queries across appointments for these — they are read as a list, written as a list, and moved onto the visit at save. The Data Scientist''s standing condition (CUL-899): promote to a table the moment ANY surface counts them. The two CHECKs are structural (array-typed; 64 KB, ~4x the product cap) — headroom is deliberate, because a CHECK a legitimate client can hit is a terminal 23514 that quarantines the row and wedges that appointment''s sync.';

COMMENT ON COLUMN vet_appointments.notes_draft IS
  'CUL-899 VV-1 / §5.1: the C1 in-room draft, before a vet_visits row exists — which is what keeps Vet Files D7 true by construction (no phantom visit row is minted to hold typing). Unbounded on purpose, unlike questions: at save it is MOVED into vet_visits.notes, which has no bound, and a draft that cannot be saved where it is going is worse than an unbounded one.';

COMMENT ON COLUMN vet_appointments.cancelled_at IS
  'CUL-899 VV-1: a fact about the WORLD — the appointment did not happen. Distinct from deleted_at (a fact about the RECORD). A cancelled appointment still belongs in Past; a deleted one is never rendered. Collapsing them would make an owner choose between keeping a wrong entry and losing a true one.';

COMMENT ON COLUMN vet_visits.deleted_at IS
  'CUL-899 VV-1 / §4.1 D3: the soft-delete column, shipped AHEAD of its control. Every reader gained `deleted_at IS NULL` in this PR, including generate-report''s — which lands on main and is INERT until the CUL-19 redeploy. The delete control (VV-6) waits for that redeploy, because a visit hidden from the app while the deployed report still counts it would move the report window with no way to see why.';

COMMENT ON COLUMN medications.vet_visit_id IS
  'CUL-899 VV-1 / §5.1: PROVENANCE — where this course came from — and never a source of numbers. Its dates and counts stay its own (CUL-746: one population, one owner; TG-5: a link never moves a date). No count, coverage line, Patterns panel or engine input reads it, which guards/visitReaders.test.ts pins.';

COMMENT ON COLUMN diet_trials.vet_visit_id IS
  'CUL-899 VV-1 / §5.1: PROVENANCE — where this trial came from — and never a source of numbers. Its start date, coverage and adherence stay its own (CUL-746; TG-5). No count, coverage line, Patterns panel or engine input reads it, which guards/visitReaders.test.ts pins.';

COMMENT ON FUNCTION enforce_vet_visit_link_same_pet() IS
  'CUL-899 VV-1: defense-at-rest guard over the three bare FKs to vet_visits added in migration 066 (vet_appointments, medications, diet_trials). FK checks bypass RLS, so a bare FK verifies only that the target EXISTS — an owner could link one pet''s row to another pet''s visit, and naming a FOREIGN account''s visit would let that account''s deletion silently un-link this owner''s row (ON DELETE SET NULL, no trace). SECURITY DEFINER per migration 045''s finding (an RLS-filtered lookup cannot see the row it is judging), made safe by the pinned search_path. One function for three tables because all three columns share a spelling — which also means the CUL-867/C-31 rule that the message names only NEW.* values, identically for "no such visit" and "another pet''s visit", is written once. A trigger rather than policy predicates because service-role callers bypass RLS entirely.';


-- ============================================================
-- ROLLBACK (for reference — do not run inline). See the header's
-- Migration Safety Pre-flight for the ordered statements and what they destroy.
-- ============================================================
