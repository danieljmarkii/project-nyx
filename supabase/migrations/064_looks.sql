-- ============================================================
-- looks — the Noticed (daily look) record: the `check_in` event_type value
-- and its 1:1 `looks` child (Home v2 — the redesign / Noticed, N-1 / CUL-867)
-- See: docs/nyx-daily-look-requirements.md v1.1 §5.2 (the DDL as corrected by
--      the pre-decomposition review — E-2, E-3, E-19), §5.1 (Shape A over
--      Shape B), §5.6 (the observed-absence row), §9 (the six consent/privacy
--      rules this table holds at rest); the weight_checks template (024); the
--      same-pet trigger mechanism (023, 041) in its LIVE posture (047 Part 3,
--      B-520); the enum-add shape (062).
-- ============================================================
-- A look is the owner's answer to "how did <pet> seem?" — a closed set of word
-- keys, an outcome, the owner's LOCAL day, an optional note. Shape A (spec
-- §5.1, ruled L-5 / R13): the look is an `events` row with
-- event_type = 'check_in' plus this 1:1 child, exactly as a weight check is an
-- events row plus `weight_checks`. So it inherits, for free, the parent's RLS,
-- the B-039 cascade, the sign-out wipe, the sync push, soft delete through
-- `events.deleted_at`, `occurred_at_*`, History, the day spine, the completion
-- card and its Undo through `reverseLoggedEvent` (C-20) — one timeline, one
-- reversal. Nothing in the row is ordinal (R5: no scale in the record), and a
-- look never enters the engine, a count, a floor or any other surface's
-- coverage line (spec §5, T-5) — that exclusion is the client and report PRs'
-- walk rows (N-2, N-6), never a schema fact.
--
-- SHIP-DARK: creating the value and the table changes nothing an owner can see.
-- No client writes a `check_in` yet (N-2 is the mirror + `insertLook`); no Edge
-- Function reads `looks` (N-6 is the report). Schema ONLY, isolated per the
-- CLAUDE.md migration-isolation rule.
--
-- ------------------------------------------------------------
-- Where this file departs from the issue's literal DDL, and why. Each was
-- checked at file:line before this was written — the v1.35 lesson: a spec's
-- borrowed premises are verified in the tree, never trusted.
-- ------------------------------------------------------------
--   1. The same-pet trigger is SECURITY DEFINER with client EXECUTE revoked —
--      the B-520 posture (047:568-576) — NOT the INVOKER form the issue's E-3
--      names. E-3 rests on two premises the tree contradicts: "the shipped
--      mechanism does not [use SECURITY DEFINER]" (047 ALTERed 023's and 041's
--      functions to DEFINER; live catalog: prosecdef = t on all three integrity
--      triggers, acl = {postgres, service_role}) and "a trigger runs as the
--      invoking role regardless" (a DEFINER trigger function runs as its owner —
--      that is the whole point of B-520). "023's exact shape" as it LIVES is
--      DEFINER + pinned + revoked, and lib/functionHardening.test.ts exists
--      precisely so that copying 023's file body forward cannot silently
--      re-create the pre-047 form. The new function is registered there. Both
--      postures fail CLOSED for this predicate (a NULL lookup raises), so the
--      choice is class consistency, not safety — Part 5 records the one case
--      whose refusing LAYER the flip changes.
--   2. The policy carries an EXPLICIT `WITH CHECK`. The issue's acceptance
--      criterion wants `pg_policies.with_check` non-null, and the 024 template's
--      bare `FOR ALL USING (…)` stores NULL there (verified live on
--      weight_checks_owner; 047 records the same for
--      medication_administrations_owner): Postgres reuses USING as the check at
--      RUN time, the catalog does not materialise it. Same predicate both sides.
--   3. `auth.uid()` is `(select auth.uid())` — the 040 / 044 / 050 form — so the
--      policy stays off the `auth_rls_initplan` performance lint (the issue's
--      "advisors clean" criterion; a bare call would be the 28th WARN).
--   4. The events CHECK compares `event_type::text`, never the enum literal. A
--      value added by ALTER TYPE … ADD VALUE cannot be USED in the transaction
--      that adds it (the house caveat — 014, 019, 062), and an enum literal in
--      a CHECK is a use; a text comparison is not. So this file is safe whether
--      or not the apply path wraps it in one transaction, which 062's
--      value-only shape never had to find out.
--
-- ------------------------------------------------------------
-- WHAT THE ACCESS-CONTROL REVIEW CHANGED (rls-privacy-reviewer, on the file
-- as first written, against a live PG16 stub of this surface)
-- ------------------------------------------------------------
--   F1 (blocking, fixed). The first draft's local_day RAISE printed
--      parent_day — a value READ FROM THE PARENT ROW. A BEFORE trigger runs
--      before RLS, and under SECURITY DEFINER the lookup sees every row, so a
--      caller holding a victim's (pet_id, event_id) — any JWT, even one owning
--      nothing, even with an invalid outcome — sent an absurd local_day and got
--      the victim event's UTC date back in the error, one request, no
--      ownership. The mitigation 047 leaned on ("two unguessable v4 UUIDs")
--      is weaker than it reads: attachment storage paths are
--      `${petId}/${eventId}/…` (lib/simpleEvent.ts), so a pasted signed URL
--      carries both ids forever even after its token expires. The rule this
--      leaves behind for every DEFINER trigger: A VALUE READ FROM THE PARENT
--      MUST NEVER REACH THE MESSAGE. The trigger now raises ONCE, naming only
--      NEW.event_id / NEW.pet_id / NEW.local_day, with one message for "no such
--      parent" and "day out of bound" alike. Verified: the leak is gone, the
--      honest UTC+14 / UTC−12 devices still pass, the probe still passes whole.
--   N1 (hardening, taken). The parent lookup also requires
--      e.event_type::text = 'check_in' — Shape A's invariant said in SQL: a
--      look's parent is a look. Without it a hostile client could hang a look
--      on an `other` event, whose notes Ask's recall fetch reads. Same row,
--      same lookup, zero cost; text comparison, never the enum literal.
--   N2 / N3 / N4 (routed, not taken here): notes and words are unbounded and
--      the "words non-empty iff observed" rule is client-only — the spec's
--      explicit 032-precedent choice, so they go to the write path (N-2,
--      CUL-868: insertLook writes NULL never '' for an absent note, and holds
--      the iff) and the readers (N-6, CUL-875: map every key through the
--      vocabulary, never echo a raw one). Out of scope, named on their issues:
--      an events-side UPDATE re-validates neither pet_id nor local_day (class-
--      wide with 023 / 041 — its own issue); soft delete leaves the note at rest
--      with no schema-side signal, so §9 rule 2 is entirely reader discipline
--      (N-2 / N-6 fixtures); B-041 export widens (CUL-232).
--
-- Migration Safety Pre-flight:
--   Destructive:  n  (purely additive — one enum VALUE, one new table with its
--                     index / RLS / two triggers, one function, one CHECK on
--                     events that no existing row can violate: 0 rows carry the
--                     new value, because it did not exist. No column, type,
--                     table, row or policy is dropped, renamed, retyped or
--                     altered.)
--   Rollback:     ALTER TABLE events DROP CONSTRAINT IF EXISTS events_check_in_notes_null;
--                 DROP TABLE IF EXISTS looks;                        -- drops its triggers
--                 DROP FUNCTION IF EXISTS enforce_look_paired_event_same_pet();
--                 ** The enum value 'check_in' CANNOT be dropped — IRREVERSIBLE **
--                 (Postgres has no DROP VALUE; an unused value is harmless; a
--                 true reversal is the full type-recreation dance and is only
--                 worthwhile if rows already use it — 014 / 062's note.)
--   Backfill:     N/A — a brand-new table, zero rows. The events CHECK reads
--                 existing rows only to validate them, and every one passes by
--                 construction.
--   Affected tables: events (one additive CHECK; ~2.2k rows, one validation
--                 scan, no rewrite). Row-count checks before applying:
--                   SELECT count(*) FROM looks;  -- expect: relation does not exist
--                   SELECT count(*) FROM events WHERE event_type::text = 'check_in';  -- expect 0
-- ============================================================


-- ============================================================
-- 1. The leaf — `check_in` on the events enum
-- ============================================================
-- 062's shape: a real enum, an additive ADD VALUE, appended (enum order is not a
-- display order — constants/eventTypes.ts owns presentation; the family is
-- presentation metadata, taxonomy D2). IRREVERSIBLE, said in the pre-flight.
-- Nothing below USES the value (see departure 4): the trigger body never names
-- it and the events CHECK compares text.
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'check_in';


-- ============================================================
-- 2. looks — the look child (mirrors weight_checks, 024)
-- ============================================================
-- The look itself is an events row (event_type = 'check_in', occurred_at = when
-- the owner looked, soft-deletable via events.deleted_at) + this 1:1 child via
-- a UNIQUE event_id, exactly the weight-check pattern. There is NO deleted_at
-- here: deletedness is read through the parent (the medication_administrations
-- rule), so every reader of `looks` joins `events` and drops soft-deleted
-- parents (spec §9 rule 2 — the N-2 / N-6 readers own that, pinned by fixture).
-- There is NO UNIQUE (pet_id, local_day): a second look on a day is a second
-- observation and its own row (R9, T-14) — the day is a COUNTING unit, never a
-- storage one.
--
-- pet_id is denormalized (as in meals / weight_checks) so RLS is a direct
-- pet-scope check with no join. outcome is a CHECK, not an enum: droppable, and
-- the set changes only by spec revision ('not_observed' left with the "Haven't
-- really looked yet" chip, R8). words carries closed keys from
-- constants/lookWords.ts and the CLIENT validates — no CHECK, the 032
-- `document` precedent (the set grows without a migration; non-empty iff
-- outcome = 'observed'). local_day is the owner's local day at write (device
-- zone), re-derived only when occurred_at moves, and EVERY surface counts this
-- key (T-19; B-421 / B-442) — never a server default, and no CHECK on the column
-- (E-2: occurred_at lives on events, and a CHECK cannot reach another table;
-- the ±1-day bound is in the same-pet trigger, Part 5, which already reads the
-- parent row). observer is RESERVED for the household track (CUL-194): the
-- reservation is said in SQL as a named CHECK so it is dropped by name when
-- that track lands. notes is the note after the save (T-22): quoted on the
-- entry / History / Appendix G, never counted, never summarised, never read by
-- a model — and it lives HERE, never on the parent (Part 6).

CREATE TABLE looks (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id       UUID NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  pet_id         UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  outcome        TEXT NOT NULL
                   CONSTRAINT looks_outcome_check
                   CHECK (outcome IN ('observed', 'nothing_unusual')),
  local_day      DATE NOT NULL,
  words          TEXT[] NOT NULL DEFAULT '{}',
  vocab_version  SMALLINT NOT NULL DEFAULT 1,
  observer       UUID NULL
                   CONSTRAINT looks_observer_reserved
                   CHECK (observer IS NULL),
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE looks IS
  'CUL-867 (Noticed N-1): the 1:1 child of a check_in event — the owner''s look (word keys, outcome, LOCAL day, an optional note). Shape A, the weight_checks pattern: deletedness reads through events.deleted_at, so every reader joins events. Never enters the engine or any coverage line (spec §5).';
COMMENT ON COLUMN looks.local_day IS
  'The owner''s local day at write (device zone), the one key every surface counts (spec T-19). Never a server default; bounded to ±1 day of the parent''s UTC date by trg_looks_same_pet, since a CHECK cannot reach events.occurred_at (E-2).';
COMMENT ON COLUMN looks.words IS
  'Closed keys from constants/lookWords.ts, validated by the client (the 032 precedent: no CHECK, so the vocabulary grows without a migration). Non-empty iff outcome = observed.';
COMMENT ON COLUMN looks.observer IS
  'RESERVED for household shared care (CUL-194). CHECK looks_observer_reserved holds it NULL until that track lands and drops the constraint by name.';
COMMENT ON COLUMN looks.notes IS
  'The note after the save (spec T-22, §9 rule 1): lives on the child only — the parent''s events.notes is NULL by CHECK for a check_in, because Ask''s recall fetch selects events.notes with no type filter. Printed on Appendix G; never counted, never read by a model.';


-- ============================================================
-- 3. Index — "all looks for this pet"
-- ============================================================
-- Mirrors idx_weight_checks_pet: the per-pet read (the day counts in
-- lib/looks.ts join looks -> events for occurred_at / deleted_at; events already
-- carries idx_events_pet_type_time for the date ordering) and the cascade from
-- pets. No separate index on event_id — the column-level UNIQUE already creates
-- the btree that serves the 1:1 event <-> look lookup AND covers that FK (so
-- the unindexed_foreign_keys lint stays quiet, as it did for 040's UNIQUE).
CREATE INDEX idx_looks_pet ON looks(pet_id);


-- ============================================================
-- 4. Row Level Security — pet-scoped, authenticated only
-- ============================================================
-- TO authenticated: said in the file, not re-derived — 026 dropped a policy
-- whose missing TO clause applied to `public`, which includes `anon`. anon gets
-- no policy here, and RLS with no matching policy is default-deny, so the anon
-- key reads nothing and writes nothing. service_role bypasses RLS (the
-- report's read path, N-6) as on every table.
--
-- USING and WITH CHECK are both written out (departure 2) with the same
-- predicate: a user can neither read nor write a look for a pet they do not
-- own, and the write half is what stops a forged pet_id — including the one
-- case Part 5 hands to it. auth.uid() is (select …)-wrapped (departure 3).
ALTER TABLE looks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "looks_owner" ON looks
  FOR ALL
  TO authenticated
  USING (
    pet_id IN (SELECT id FROM pets WHERE user_id = (select auth.uid()))
  )
  WITH CHECK (
    pet_id IN (SELECT id FROM pets WHERE user_id = (select auth.uid()))
  );


-- ============================================================
-- 5. Triggers — updated_at, and the same-pet guard that also bounds local_day
-- ============================================================
-- updated_at: set_updated_at() from 001 (search_path pinned by 047), so every
-- server write stamps updated_at = NOW() — the sync layer's LWW basis (C-23).
-- The row is mutable: the words and the note are editable on the record (N-3).
CREATE TRIGGER trg_looks_updated_at
  BEFORE UPDATE ON looks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- THE TWO-FK SHAPE 023 AND 041 ALREADY CLOSED. looks_owner constrains pet_id;
-- event_id is a bare FK — existence-checked, RLS-bypassing — so without this
-- guard a row could name one pet's event under another pet's id (a look filed
-- on the wrong pet's day spine, the multi-pet bleed) or another account's
-- event id. A trigger, not a WITH CHECK predicate, because a policy binds
-- `authenticated` only and every service-role caller bypasses it (041's
-- argument, verbatim). Same-pet ⟹ same-owner (pets.user_id makes a pet unique
-- to one owner), so one check closes both doors.
--
-- POSTURE — B-520 (047 Part 3), departure 1: SECURITY DEFINER so the parent
-- lookup is not RLS-filtered and the guard's correctness does not depend on
-- what the writer can see; search_path pinned to '' with the lookup
-- schema-qualified, so DEFINER introduces no resolution hazard; EXECUTE revoked
-- from PUBLIC / anon / authenticated so a `postgres`-privileged function is not
-- on the REST RPC surface (trigger firing does not check EXECUTE — probed live
-- by 047 — so the guard still runs on every write). Registered in
-- lib/functionHardening.test.ts so a future CREATE OR REPLACE that forgets the
-- clause fails the build instead of silently reverting the posture.
--
-- THE ONE CASE WHOSE LAYER THE POSTURE CHANGES (047's finding, restated for
-- this table): a write lying WHOLLY inside another account — pet_id = the
-- victim's pet AND event_id = that same pet's event — passes THIS trigger
-- (the lookup sees the row; the pets match) and is refused one layer out by
-- looks_owner's WITH CHECK (42501). Under INVOKER the hidden row would have
-- made it raise here (23514). The boundary holds either way; the WITH CHECK is
-- LOAD-BEARING for that case, which is why Part 4 writes it explicitly. Any PR
-- that splits looks_owner per verb or loosens its WITH CHECK re-checks this
-- case (the 047 standing hazard). The membership oracle 047 discloses exists
-- here too — on a VALID local_day, 42501 vs 23514 distinguishes "that event
-- belongs to that pet" from "it does not". Recorded, not dismissed, and bounded
-- honestly: it needs both ids, and a pair learned from an attachment URL already
-- asserts the membership by its path, so the oracle adds nothing there. What
-- the review found and this file closes is the WORSE thing E-2's extension
-- would have added on top of it — a field read (the parent's date) through the
-- error message. See the header.
--
-- THE local_day BOUND (E-2): because the guard already reads the parent row, it
-- also bounds NEW.local_day to ±1 day of the parent's UTC date. The widest real
-- offsets are −12 / +14, so an honest device's local day is always within one
-- day of the UTC date of the same instant; two days off is a wrong clock or a
-- forged row, and either is refused AT CHILD-WRITE TIME. At rest the invariant
-- is only as good as the parent staying put: an events UPDATE that moves
-- occurred_at or pet_id re-validates nothing (the same gap 023 and 041 carry;
-- filed as its own class-wide issue), so a later looks UPDATE then fails 23514
-- until the day is re-derived. "Change time" across midnight (C-10)
-- re-derives local_day on the client and pushes the parent first (the child's
-- push is parent-gated, N-2), so the guard sees the moved occurred_at; a child
-- that arrives before its moved parent is refused and retried by the queue,
-- never accepted against a stale day. The NULL sentinel is sound because
-- events.occurred_at is NOT NULL (001:102): a NULL parent_day means no row
-- matched both ids, never a row with no time.
--
-- Cost: one indexed PK lookup on events.id per write; event_id is NOT NULL, so
-- unlike 023 there is no null fast-path to guard.
CREATE OR REPLACE FUNCTION enforce_look_paired_event_same_pet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  parent_day DATE;
BEGIN
  SELECT (e.occurred_at AT TIME ZONE 'UTC')::date
    INTO parent_day
    FROM public.events e
   WHERE e.id = NEW.event_id
     AND e.pet_id = NEW.pet_id
     AND e.event_type::text = 'check_in';

  -- ONE raise, and it names only what the caller sent. Never parent_day: see
  -- "WHAT THE ACCESS-CONTROL REVIEW CHANGED" above.
  IF parent_day IS NULL
     OR NEW.local_day NOT BETWEEN parent_day - 1 AND parent_day + 1 THEN
    RAISE EXCEPTION
      'looks.event_id % must reference a check_in event for the same pet (%) with local_day % within a day of it',
      NEW.event_id, NEW.pet_id, NEW.local_day
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_look_paired_event_same_pet() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_look_paired_event_same_pet() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_look_paired_event_same_pet() FROM authenticated;

CREATE TRIGGER trg_looks_same_pet
  BEFORE INSERT OR UPDATE ON looks
  FOR EACH ROW EXECUTE FUNCTION enforce_look_paired_event_same_pet();

COMMENT ON FUNCTION public.enforce_look_paired_event_same_pet() IS
  'CUL-867 / B-520: same-pet guard for looks.event_id, extended to bound looks.local_day to ±1 day of the parent event''s UTC date (E-2). Born in the B-520 posture — SECURITY DEFINER so the parent lookup is not RLS-filtered, search_path pinned to '''' with the lookup schema-qualified, EXECUTE revoked from PUBLIC/anon/authenticated (trigger firing does not check EXECUTE). Mirrors enforce_dose_paired_event_same_pet() (023) as it lives after 047.';


-- ============================================================
-- 6. The parent's free text is closed for a look
-- ============================================================
-- spec §9 rule 1 / T-22: a look's note is information about a household and it
-- lives on looks.notes, never on the parent. The shipped editor's Notes field is
-- type-blind and Ask's recall fetch (supabase/functions/ask/index.ts) selects
-- events.notes for the pet with NO type filter — so a note on the parent would
-- reach a model before D10 is ruled. Closed at rest here; the editor gates its
-- field off for a check_in in N-3. Text comparison, not the enum literal
-- (departure 4). No existing row can violate it: none carries the new value.
ALTER TABLE events
  ADD CONSTRAINT events_check_in_notes_null
  CHECK (event_type::text <> 'check_in' OR notes IS NULL);
