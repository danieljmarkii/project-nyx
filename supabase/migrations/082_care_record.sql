-- ============================================================
-- Migration 082: the care record (Engines v3 PR-21)
--   CUL-1415 (EN-9 half): care_acknowledgements, the owner's "my vet knows"
--     facts, one sign per row.
--   CUL-1416 (EN-14 half): vet_calls, the call record with its note; and
--     vet_call_follow_ups, the ledger behind "What did the vet say?".
-- Spec: docs/nyx-care-state-requirements.md §3.2, §6.3–§6.5, §8 (v1.1, PM
-- rulings 2026-09-28). Nothing reads or writes these tables yet: PR-23 is the
-- first server reader (the care state, behind EN-F), PR-35 / PR-36 the client
-- writers.
--
-- APPLIED to production 2026-09-30 via the Supabase MCP (PM-approved), live version
-- 20260930001048, name care_record. The statements that ran are this file's with
-- the comments stripped; comments added after the apply change no statement. The
-- VERIFY block below passed on the live database.
-- ============================================================
--
-- WHAT THE THREE TABLES ARE
--   care_acknowledgements  A row the OWNER caused, saying a vet knows about ONE
--                          sign (§3.2). It carries the source of the answer and
--                          the anchor date the care state counts from. It is a
--                          dated fact, never a verdict: the care state is derived
--                          (§3.3) and never stored.
--   vet_calls              "I've called" on an escalation (§6.4, N-1 = A). This is
--                          its own table ON PURPOSE. An events row would put the
--                          note in Ask's recall fetch, which reads every event's
--                          notes. A vet_visits row would become the report's window
--                          anchor, so a report would start at a phone call.
--   vet_call_follow_ups    The ledger (§6.3). One owed row per call, then a new
--                          row per status change; the latest row by created_at is
--                          the truth.
--
-- APPEND-ONLY BY RLS ALONE (§8, the 075 / 032 shape). Each table has a SELECT
-- policy and an INSERT policy and nothing else. UPDATE, DELETE and TRUNCATE
-- are revoked from every client role and from service_role too (§8.4: "no
-- UPDATE or DELETE verb for any role but the cascade"). There is deliberately
-- NO trigger that raises on DELETE, because it would abort the pets cascade and
-- with it auth.admin.deleteUser. The cascade's referential actions run as the
-- table owner, so the revokes do not touch them. Any correction is a NEW row:
-- `retracts` on an acknowledgement, `supersedes` (plus `withdrawn` for an Undo)
-- on a call, and a new status row on the ledger.
--
-- THE CLIENT WRITES THESE, LOCAL-FIRST (plan review, CUL-1139). So authenticated
-- keeps INSERT, but only on the writer's columns. `created_at` is left out, so
-- the SERVER's clock orders "latest wins" and a device's clock cannot. The
-- consequence for PR-35 / PR-36: a push must name only the granted columns, and
-- it must be a plain INSERT or an ignore-duplicates upsert (ON CONFLICT DO
-- NOTHING), never a merge upsert. ON CONFLICT DO UPDATE needs UPDATE, which no
-- role holds.
--
-- ------------------------------------------------------------
-- BUILD CALLS THAT DEPART FROM §8's DRAFT DDL (plan comment on CUL-1415)
-- ------------------------------------------------------------
--   1. vet_calls.withdrawn. The draft said "an Undo or an edited note is a new
--      row" with `supersedes`, which cannot tell the two apart. Vet visits would
--      then keep listing a call the owner undid.
--   2. vet_call_follow_ups.vet_call_id is NULLABLE, set exactly when
--      reason = 'called'. The draft's NOT NULL could not hold the 'sampled' rows
--      (a logged-tier read with no call) that §6.5 says the ledger is built for.
--   3. "One owed row" is enforced per CALL RECORD, not per (pet_id, event_id).
--      "I've called" → Undo → "I've called" is a withdrawn row and then a fresh
--      call, which owes a fresh question. A unique (pet_id, event_id) would
--      refuse that second owed row. Sampled rows, which have no call, are unique
--      per (pet_id, event_id). Keeping ONE follow-up per escalation across
--      several reads of one bout is the writer's rule (§6.1): it writes one call
--      per escalation, and the database cannot see a bout.
--   4. symptom_type is CHECKed against the signs that can BE a concern: the
--      union of the chronicity and worsening lanes (§3.1). guards/careRecord.test.ts
--      pins this list to generate-signal's LANE_SYMPTOM_TYPES, so a lane that
--      widens reds the build until a migration follows.
--
-- ------------------------------------------------------------
-- THE SAME-PET GUARD, AND THE ORACLE IT CLOSES
-- ------------------------------------------------------------
-- A foreign key is checked WITHOUT RLS. It proves the parent exists, not whose it
-- is. So every link (the event, the visit, the trial, the course, the retracted
-- acknowledgement, the superseded call, the ledger's call) is checked by a
-- BEFORE INSERT trigger: the parent must belong to the row's own pet_id.
--
-- The posture is B-520 from birth: SECURITY DEFINER, so the lookup is not
-- RLS-filtered and the guard does not depend on what the writer can see;
-- search_path = pg_catalog, pg_temp (072: pg_temp LAST); EXECUTE revoked from
-- PUBLIC, anon and authenticated. Trigger firing does not check EXECUTE.
-- Registered in lib/functionHardening.test.ts.
--
-- STRICTER THAN 066 / 067 / 074, on purpose. Under DEFINER, those guards leave a
-- cross-account MEMBERSHIP ORACLE, which each one disclosed. A write lying WHOLLY
-- inside another account (the victim's pet and that pet's event) passes the
-- trigger and is refused one layer out by RLS with 42501. A write naming a pair
-- that does not match is refused by the trigger with 23514. So the error code
-- tells a caller holding two UUIDs whether they belong together. Here, when the
-- request carries a user (auth.uid() is set), the guard ALSO requires the row's
-- pet to be that user's. Every write naming another account's pet is refused by
-- the trigger, with the same code and message whether the pair is real or not.
-- The oracle is closed, not disclosed. BEFORE ROW triggers run ahead of both the
-- RLS WITH CHECK and the FK check, so the trigger answers first. The service role
-- carries no user (auth.uid() IS NULL) and gets the same-pet check alone. It is
-- the trusted server writer and already sees every row.
--
-- C-31: each RAISE names only NEW.* values, with ONE message for "no such parent",
-- "another pet's parent" and "not your pet". Nothing read from a parent reaches it.
--
-- WHAT IS NOT CLOSED, stated (rls-privacy-reviewer, 2026-09-30): a row-id existence
-- oracle. An INSERT reusing another account's primary key fails with 23505 where a
-- fresh id succeeds, and ON CONFLICT DO NOTHING returns 0 rows versus 1. It is
-- platform-generic, and it needs an unguessable UUID that no path hands out.
--
-- INSERT ONLY. The tables never UPDATE, so the trigger has no UPDATE arm. That is
-- also why `ON DELETE SET NULL` on care_acknowledgements.vet_visit_id is safe: the
-- cascade's UPDATE fires no guard, and no CHECK requires the column. A visit
-- source's need for a visit is checked at INSERT, by the trigger, and a CHECK
-- there would make a hard-deleted visit undeletable.
--
-- ------------------------------------------------------------
-- WHAT ELSE CAN MOVE (C-38)
-- ------------------------------------------------------------
--   * A PARENT's pet_id (events, vet_visits, diet_trials, medications). A parent
--     UPDATE re-validates no child (the class-wide CUL-882 gap that 023 / 041 /
--     064 / 074 carry). The parent's RLS confines such a move to the owner's own
--     pets, so it never crosses accounts, and the app has no path that moves any
--     of these between pets. A child left behind stays readable, and no client
--     or server write can edit it in place.
--   * The owner's own parents. Hard-deleting her own trial, course or event (where
--     that table allows it) cascades her acknowledgements, calls and ledger rows
--     away, and a hard-deleted visit NULLs vet_visit_id. Own data only.
--   * Nothing else. No role holds UPDATE, so no column changes except by those
--     cascades.
--   * PR-35/36 WRITERS: the guard runs before the FK, so a call or ledger row pushed
--     before its offline-created event has synced fails with a terminal 23514, not a
--     retryable 23503. Push the parent event first.
--
-- ------------------------------------------------------------
-- THE PRIVACY LINE (R-5, §8.4)
-- ------------------------------------------------------------
--   Note:      vet_calls.note is owner-only and no model reads it. Enforced by
--              guards/careRecord.test.ts over supabase/functions/, whose allow-set
--              is EMPTY: the report does not print call notes. That guard also
--              requires every server reader of these tables to name an explicit
--              column list. That is its stated limit, because a select('*') would
--              sweep the note up unseen.
--   Report:    no care state, tap, call, answer or note reaches generate-report or
--              any off-device share (§3.4, GAP-27). PR-23 lands the report guard
--              with the first reader.
--   Engine:    guards/visitReaders.test.ts scans all three tables. detection.ts
--              and phrasing.ts stay in MUST_STAY_CLEAN.
--   Export:    the owner's own pet data, in the export scope with the vet visits.
--              Doc-only today, because no export function exists (B-041).
--   Deletion:  all three cascade from pets, and so from auth.users through the
--              delete-account cascade. The FKs to events, diet_trials, medications
--              and the self-references cascade too, so no FK blocks a parent's
--              delete. No new bucket, no new secret, no model call.
--   Device:    no local mirror in this PR. The client PR that first writes these
--              tables adds the SQLite mirror, which hydration.test.ts refuses to
--              build unless it is in LOCAL_WIPE_TABLES. That PR also cancels the
--              follow_ups notifications in wipeLocalSession (§6.3).
--
-- ------------------------------------------------------------
-- MIGRATION SAFETY PRE-FLIGHT
-- ------------------------------------------------------------
--   Destructive:  n. Three new tables, one new function and three triggers on
--                 those new tables. No existing table, column, policy, grant or
--                 row is touched.
--   Backfill:     N/A. At GA every concern starts raised by design (§9); nothing
--                 is back-filled.
--   Rollback:     drop children before parents; the function goes with its
--                 triggers:
--                   DROP TABLE IF EXISTS public.vet_call_follow_ups;
--                   DROP TABLE IF EXISTS public.vet_calls;
--                   DROP TABLE IF EXISTS public.care_acknowledgements;
--                   DROP FUNCTION IF EXISTS public.enforce_care_record_same_pet();
--                 Irreversible for any rows written after the apply, but nothing
--                 writes them until PR-23 / PR-35 / PR-36 ship.
--   Ordering:     after 081. Nothing depends on it until PR-23.
--   After:        run the VERIFY block at the foot of this file, then
--                 get_advisors (security + performance).
-- ============================================================


-- ============================================================
-- 1. care_acknowledgements (§3.2, §8.1)
-- ============================================================
CREATE TABLE public.care_acknowledgements (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id        UUID        NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  symptom_type  TEXT        NOT NULL CHECK (symptom_type IN ('vomit', 'diarrhea', 'itch', 'scratch', 'skin_reaction', 'cough')),
  source        TEXT        NOT NULL CHECK (source IN ('at_vet_tick', 'visit_answer', 'my_vet_knows', 'vet_started_trial', 'vet_started_course')),
  anchor_on     DATE        NOT NULL,
  vet_visit_id  UUID        REFERENCES public.vet_visits(id) ON DELETE SET NULL,
  diet_trial_id UUID        REFERENCES public.diet_trials(id) ON DELETE CASCADE,
  medication_id UUID        REFERENCES public.medications(id) ON DELETE CASCADE,
  retracts      UUID        REFERENCES public.care_acknowledgements(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A visit link only on the two visit sources. Required on those at INSERT, by
  -- the trigger, not here: the link is SET NULL if the visit is ever hard-deleted.
  CONSTRAINT care_acknowledgements_visit_link_matches_source
    CHECK (vet_visit_id IS NULL OR source IN ('at_vet_tick', 'visit_answer')),
  -- PMD-4 A: a trial-scoped answer names its trial, a course-scoped one its course,
  -- and no other source names either. Both FKs cascade, so neither goes NULL.
  CONSTRAINT care_acknowledgements_trial_link_matches_source
    CHECK ((diet_trial_id IS NOT NULL) = (source = 'vet_started_trial')),
  CONSTRAINT care_acknowledgements_course_link_matches_source
    CHECK ((medication_id IS NOT NULL) = (source = 'vet_started_course')),
  CONSTRAINT care_acknowledgements_retracts_another_row
    CHECK (retracts IS NULL OR retracts <> id)
);

COMMENT ON TABLE public.care_acknowledgements IS
  'Append-only (RLS alone; migration 082, Engines v3 PR-21, CUL-1415): the owner''s statement that a vet knows about ONE sign, dated by anchor_on (docs/nyx-care-state-requirements.md §3.2). A fact the owner caused, never a verdict: the care state is derived in generate-signal''s shell (§3.3) and never stored. An Undo is a new row whose retracts names the old one. Never reaches the vet report or any off-device share (§3.4). Cascades from pets.';
COMMENT ON COLUMN public.care_acknowledgements.anchor_on IS
  'The local day the answer counts from: the visit''s visited_at (at_vet_tick, visit_answer), the day of the tap (my_vet_knows), or the trial''s / course''s start (vet_started_trial / _course). Counts start the day after, except a trial-scoped answer, which counts from the trial''s first day (§0.2 call 2).';
COMMENT ON COLUMN public.care_acknowledgements.symptom_type IS
  'One sign per row (§3.2, GAP-29: cough and vomiting are two concerns). CHECKed against the chronicity ∪ worsening lane set; guards/careRecord.test.ts pins the list to LANE_SYMPTOM_TYPES.';

CREATE INDEX care_acknowledgements_pet_sign_idx
  ON public.care_acknowledgements (pet_id, symptom_type, created_at DESC);
-- Indexes on the FKs a parent delete cascades through (the unindexed-FK advisor).
CREATE INDEX care_acknowledgements_vet_visit_idx  ON public.care_acknowledgements (vet_visit_id)  WHERE vet_visit_id  IS NOT NULL;
CREATE INDEX care_acknowledgements_diet_trial_idx ON public.care_acknowledgements (diet_trial_id) WHERE diet_trial_id IS NOT NULL;
CREATE INDEX care_acknowledgements_medication_idx ON public.care_acknowledgements (medication_id) WHERE medication_id IS NOT NULL;
CREATE INDEX care_acknowledgements_retracts_idx   ON public.care_acknowledgements (retracts)      WHERE retracts      IS NOT NULL;


-- ============================================================
-- 2. vet_calls (§6.4, §8.2)
-- ============================================================
CREATE TABLE public.vet_calls (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id      UUID        NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  called_on   DATE        NOT NULL,
  event_id    UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  note        TEXT        CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 4000),
  supersedes  UUID        REFERENCES public.vet_calls(id) ON DELETE CASCADE,
  withdrawn   BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- An Undo withdraws an EARLIER row; it is never a call of its own.
  CONSTRAINT vet_calls_withdrawn_supersedes
    CHECK (NOT withdrawn OR supersedes IS NOT NULL),
  CONSTRAINT vet_calls_supersedes_another_row
    CHECK (supersedes IS NULL OR supersedes <> id)
);

COMMENT ON TABLE public.vet_calls IS
  'Append-only (RLS alone; migration 082, Engines v3 PR-21, CUL-1416): "I''ve called" on an escalation (docs/nyx-care-state-requirements.md §6.4, N-1 = A). Its own table so the note never reaches Ask''s event recall and a call never becomes the report''s window anchor. An edited note is a new row with supersedes; an Undo is a new row with supersedes and withdrawn = true. Never reaches the vet report or any off-device share. Cascades from pets.';
COMMENT ON COLUMN public.vet_calls.note IS
  'The owner''s own words, written after the save and never required. OWNER-ONLY: no model reads it and no Edge Function selects it (guards/careRecord.test.ts, allow-set empty). The 4000-character bound is a backstop at rest; the client bounds the field first, because a CHECK failure is a terminal 23514 that quarantines the row.';
COMMENT ON COLUMN public.vet_calls.event_id IS
  'The escalation''s first read (§6.1). The call is about the escalation as shown when "I''ve called" was tapped, never its current tier.';

CREATE INDEX vet_calls_pet_called_idx ON public.vet_calls (pet_id, called_on DESC, created_at DESC);
CREATE INDEX vet_calls_event_idx      ON public.vet_calls (event_id);
CREATE INDEX vet_calls_supersedes_idx ON public.vet_calls (supersedes) WHERE supersedes IS NOT NULL;


-- ============================================================
-- 3. vet_call_follow_ups — the ledger (§6.3, §6.5, §8.3)
-- ============================================================
CREATE TABLE public.vet_call_follow_ups (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id       UUID        NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  vet_call_id  UUID        REFERENCES public.vet_calls(id) ON DELETE CASCADE,
  event_id     UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  reason       TEXT        NOT NULL CHECK (reason IN ('called', 'sampled')),
  status       TEXT        NOT NULL CHECK (status IN ('owed', 'answered', 'expired', 'withdrawn')),
  answer       TEXT        CHECK (answer IN ('wants_to_see', 'started_treatment', 'keep_watching', 'something_else', 'could_not_reach')),
  worth_it     TEXT        CHECK (worth_it IN ('yes', 'no', 'did_not_say')),
  due_at       TIMESTAMPTZ NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A 'called' row belongs to its call; a 'sampled' row (§6.5) has none.
  CONSTRAINT vet_call_follow_ups_call_matches_reason
    CHECK ((vet_call_id IS NOT NULL) = (reason = 'called')),
  -- An answer lives only on an 'answered' row, and an 'answered' row has one.
  -- worth_it is the optional second question, so it may be NULL there.
  CONSTRAINT vet_call_follow_ups_answer_matches_status
    CHECK (CASE WHEN status = 'answered' THEN answer IS NOT NULL
                ELSE answer IS NULL AND worth_it IS NULL END),
  CONSTRAINT vet_call_follow_ups_expires_after_due
    CHECK (expires_at > due_at)
);

COMMENT ON TABLE public.vet_call_follow_ups IS
  'Append-only (RLS alone; migration 082, Engines v3 PR-21, CUL-1416): the follow-up ledger (docs/nyx-care-state-requirements.md §6.3). One owed row per call record, then a NEW row per status change; the latest row by created_at (the server''s clock) is the truth, and answered is final across devices. Labels are used only in aggregate, only at design time, and only from the PM''s account until PMD-12''s purpose is published (§6.6, CUL-1313). Cascades from pets.';
COMMENT ON COLUMN public.vet_call_follow_ups.event_id IS
  'The escalation the question is about. Any server writer of an owed row keys on event_id AND pet_id (plan review). If the first read is soft-deleted as a duplicate, the key re-points by a new row naming the next read in the bout.';

-- One owed question per call record, and one per sampled read.
CREATE UNIQUE INDEX vet_call_follow_ups_one_owed_per_call
  ON public.vet_call_follow_ups (vet_call_id)
  WHERE status = 'owed';
CREATE UNIQUE INDEX vet_call_follow_ups_one_owed_per_sampled_read
  ON public.vet_call_follow_ups (pet_id, event_id)
  WHERE status = 'owed' AND reason = 'sampled';

CREATE INDEX vet_call_follow_ups_pet_event_idx
  ON public.vet_call_follow_ups (pet_id, event_id, created_at DESC);
CREATE INDEX vet_call_follow_ups_event_idx
  ON public.vet_call_follow_ups (event_id);
CREATE INDEX vet_call_follow_ups_call_idx
  ON public.vet_call_follow_ups (vet_call_id) WHERE vet_call_id IS NOT NULL;


-- ============================================================
-- 4. The same-pet guard (one function, three triggers)
-- ============================================================
-- One body for all three tables, switched on TG_TABLE_NAME, so the C-31 message
-- rule and the ownership arm are written once. `me` is the request's user, or
-- NULL for the service role and for a direct database session.
--
-- Each check is NOT EXISTS → RAISE, so a missing row, a row of another pet and a
-- row of another account all land on the same line. Fail closed.
CREATE OR REPLACE FUNCTION public.enforce_care_record_same_pet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  me  uuid := auth.uid();
  ok  boolean;
BEGIN
  -- The row's own pet, and for a signed-in caller, the caller's own pet. This
  -- arm is what closes the membership oracle (header): it refuses a write naming
  -- another account's pet here, with this message, before any parent is looked at.
  SELECT EXISTS (
    SELECT 1 FROM public.pets p
     WHERE p.id = NEW.pet_id
       AND (me IS NULL OR p.user_id = me)
  ) INTO ok;

  IF ok AND TG_TABLE_NAME = 'care_acknowledgements' THEN
    ok :=
      -- A visit source must name its visit, and the visit must be this pet's.
      (CASE WHEN NEW.source IN ('at_vet_tick', 'visit_answer')
            THEN NEW.vet_visit_id IS NOT NULL
             AND EXISTS (SELECT 1 FROM public.vet_visits v
                          WHERE v.id = NEW.vet_visit_id AND v.pet_id = NEW.pet_id)
            ELSE NEW.vet_visit_id IS NULL END)
      AND (NEW.diet_trial_id IS NULL
           OR EXISTS (SELECT 1 FROM public.diet_trials t
                       WHERE t.id = NEW.diet_trial_id AND t.pet_id = NEW.pet_id))
      AND (NEW.medication_id IS NULL
           OR EXISTS (SELECT 1 FROM public.medications m
                       WHERE m.id = NEW.medication_id AND m.pet_id = NEW.pet_id))
      -- A retraction withdraws an answer about the SAME sign of the SAME pet.
      AND (NEW.retracts IS NULL
           OR EXISTS (SELECT 1 FROM public.care_acknowledgements a
                       WHERE a.id = NEW.retracts
                         AND a.pet_id = NEW.pet_id
                         AND a.symptom_type = NEW.symptom_type));

  ELSIF ok AND TG_TABLE_NAME = 'vet_calls' THEN
    ok :=
      EXISTS (SELECT 1 FROM public.events e
               WHERE e.id = NEW.event_id AND e.pet_id = NEW.pet_id)
      AND (NEW.supersedes IS NULL
           OR EXISTS (SELECT 1 FROM public.vet_calls c
                       WHERE c.id = NEW.supersedes AND c.pet_id = NEW.pet_id));

  ELSIF ok AND TG_TABLE_NAME = 'vet_call_follow_ups' THEN
    ok :=
      EXISTS (SELECT 1 FROM public.events e
               WHERE e.id = NEW.event_id AND e.pet_id = NEW.pet_id)
      AND (NEW.vet_call_id IS NULL
           OR EXISTS (SELECT 1 FROM public.vet_calls c
                       WHERE c.id = NEW.vet_call_id AND c.pet_id = NEW.pet_id));

  ELSIF ok THEN
    -- Attached to a table this body does not know: refuse rather than pass.
    ok := false;
  END IF;

  IF NOT ok THEN
    -- NEW.* only, one message for every cause (C-31). Do not "improve" it with
    -- a parent's pet, date or sign: under DEFINER that is another tenant's data.
    RAISE EXCEPTION
      '%.pet_id % must be the caller''s pet, and every row it links must belong to it',
      TG_TABLE_NAME, NEW.pet_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_care_record_same_pet() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_care_record_same_pet() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_care_record_same_pet() FROM authenticated;

COMMENT ON FUNCTION public.enforce_care_record_same_pet() IS
  'CUL-1415 / CUL-1416 (082) / B-520: BEFORE INSERT on care_acknowledgements, vet_calls and vet_call_follow_ups. Every linked row (visit, trial, course, retracted acknowledgement, event, superseded call, ledger call) must belong to the row''s own pet_id, and for a signed-in caller that pet must be the caller''s. The second arm closes the 047-class 42501-vs-23514 membership oracle that 066/067/074 disclosed. SECURITY DEFINER so the lookups are not RLS-filtered; search_path = pg_catalog, pg_temp (072); EXECUTE revoked from PUBLIC/anon/authenticated. One RAISE naming only NEW.pet_id (C-31). INSERT only: the tables are append-only, so there is no UPDATE to guard, and the ON DELETE SET NULL cascade fires no guard.';

CREATE TRIGGER trg_care_acknowledgements_same_pet
  BEFORE INSERT ON public.care_acknowledgements
  FOR EACH ROW EXECUTE FUNCTION public.enforce_care_record_same_pet();

CREATE TRIGGER trg_vet_calls_same_pet
  BEFORE INSERT ON public.vet_calls
  FOR EACH ROW EXECUTE FUNCTION public.enforce_care_record_same_pet();

CREATE TRIGGER trg_vet_call_follow_ups_same_pet
  BEFORE INSERT ON public.vet_call_follow_ups
  FOR EACH ROW EXECUTE FUNCTION public.enforce_care_record_same_pet();


-- ============================================================
-- 5. RLS: SELECT and INSERT for the owner, nothing else
-- ============================================================
-- `(SELECT auth.uid())` so it is evaluated once per statement (the
-- auth_rls_initplan lint). No UPDATE or DELETE policy exists, so RLS default-denies
-- both even if a grant ever came back.
ALTER TABLE public.care_acknowledgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vet_calls             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vet_call_follow_ups   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "care_acknowledgements_read_own" ON public.care_acknowledgements
  FOR SELECT TO authenticated
  USING (pet_id IN (SELECT id FROM public.pets WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "care_acknowledgements_insert_own" ON public.care_acknowledgements
  FOR INSERT TO authenticated
  WITH CHECK (pet_id IN (SELECT id FROM public.pets WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "vet_calls_read_own" ON public.vet_calls
  FOR SELECT TO authenticated
  USING (pet_id IN (SELECT id FROM public.pets WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "vet_calls_insert_own" ON public.vet_calls
  FOR INSERT TO authenticated
  WITH CHECK (pet_id IN (SELECT id FROM public.pets WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "vet_call_follow_ups_read_own" ON public.vet_call_follow_ups
  FOR SELECT TO authenticated
  USING (pet_id IN (SELECT id FROM public.pets WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "vet_call_follow_ups_insert_own" ON public.vet_call_follow_ups
  FOR INSERT TO authenticated
  WITH CHECK (pet_id IN (SELECT id FROM public.pets WHERE user_id = (SELECT auth.uid())));


-- ============================================================
-- 6. Grants: RLS decides WHICH rows; grants decide WHICH verbs and columns
-- ============================================================
-- Supabase's default privileges hand anon, authenticated and service_role every
-- verb at CREATE time. Revoke all of it, then give authenticated SELECT and an
-- INSERT on exactly the writer's columns (032's column-grant discipline). No
-- created_at, so the server's clock orders the ledger. service_role keeps SELECT
-- and INSERT (a future server writer, e.g. PR-36's owed rows) and loses the
-- rest: append-only binds every role but the cascade (§8.4).
--
-- MAINTENANCE WARNING: never GRANT UPDATE, DELETE or TRUNCATE on these tables to
-- any role, and never a table-level GRANT INSERT, which would re-cover created_at.
-- Extend a column list; never re-grant at the table level.
REVOKE ALL ON TABLE public.care_acknowledgements FROM anon, authenticated;
REVOKE ALL ON TABLE public.vet_calls             FROM anon, authenticated;
REVOKE ALL ON TABLE public.vet_call_follow_ups   FROM anon, authenticated;

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.care_acknowledgements FROM service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.vet_calls             FROM service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.vet_call_follow_ups   FROM service_role;

GRANT SELECT ON TABLE public.care_acknowledgements TO authenticated;
GRANT SELECT ON TABLE public.vet_calls             TO authenticated;
GRANT SELECT ON TABLE public.vet_call_follow_ups   TO authenticated;

GRANT INSERT (id, pet_id, symptom_type, source, anchor_on, vet_visit_id,
              diet_trial_id, medication_id, retracts)
  ON TABLE public.care_acknowledgements TO authenticated;
GRANT INSERT (id, pet_id, called_on, event_id, note, supersedes, withdrawn)
  ON TABLE public.vet_calls TO authenticated;
GRANT INSERT (id, pet_id, vet_call_id, event_id, reason, status, answer,
              worth_it, due_at, expires_at)
  ON TABLE public.vet_call_follow_ups TO authenticated;


-- ------------------------------------------------------------
-- VERIFY (run after applying; read-only)
-- ------------------------------------------------------------
--   SELECT tablename, policyname, cmd FROM pg_policies
--    WHERE tablename IN ('care_acknowledgements','vet_calls','vet_call_follow_ups')
--    ORDER BY 1, 2;
--     -- six rows, each table: *_insert_own | INSERT, *_read_own | SELECT
--   SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
--    WHERE table_name IN ('care_acknowledgements','vet_calls','vet_call_follow_ups')
--      AND grantee IN ('anon','authenticated','service_role')
--    ORDER BY 1, 2, 3;
--     -- authenticated: SELECT only (INSERT is per column, in column_privileges);
--     -- service_role: INSERT, REFERENCES, SELECT, TRIGGER (no UPDATE / DELETE / TRUNCATE);
--     -- anon: nothing
--   SELECT tgname, tgenabled FROM pg_trigger
--    WHERE tgrelid IN ('public.care_acknowledgements'::regclass,
--                      'public.vet_calls'::regclass,
--                      'public.vet_call_follow_ups'::regclass)
--      AND NOT tgisinternal;
--     -- three rows, the *_same_pet triggers, enabled ('O')
--   SELECT prosecdef, proconfig FROM pg_proc
--    WHERE proname = 'enforce_care_record_same_pet';
--     -- t | {"search_path=pg_catalog, pg_temp"}
