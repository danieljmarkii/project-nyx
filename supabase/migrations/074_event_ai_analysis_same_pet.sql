-- ============================================================
-- Migration 074: a per-incident read can only sit on an incident of its own
-- pet (CUL-1203; found by rls-privacy-reviewer on HV-5 / CUL-1162, sequenced
-- ahead of every Engines v3 change to this table by CUL-1268 BRK-1)
-- ============================================================
--
-- NUMBERING: written and applied to production as 073 on 2026-09-26 (live
-- version 20260926212721, name event_ai_analysis_same_pet). 073_trial_screen_
-- config merged to main first, so the repo file is 074. The SQL below is
-- byte-identical to what ran, which is why §3's RAISE text still says '073:'.
--
-- ------------------------------------------------------------
-- THE HOLE
-- ------------------------------------------------------------
-- `event_ai_analysis_owner` (013) is `FOR ALL USING (pet_id IN (<the caller's
-- pets>))` with no WITH CHECK, so the same pet-only test is the insert check.
-- Nothing tied `event_id` to `pet_id`: the `events(id)` foreign key is checked
-- WITHOUT RLS (it proves the event exists, not whose it is), and `UNIQUE
-- (event_id)` lets the first row for an event win. Verified live 2026-09-25 and
-- again 2026-09-26: one policy, `authenticated` (and `anon`) holding INSERT,
-- UPDATE and DELETE, and `set_updated_at` the only trigger.
--
-- The attack, one request from any signed-in account holding a victim's event
-- id:
--
--   INSERT {event_id: <victim's event>, pet_id: <attacker's own pet>,
--           incident_type: 'vomit', edited_at: now()}
--
-- for a victim event with no read yet (a photoless vomit whose record was never
-- opened is the easy case). RLS passes (the pet is the attacker's), the FK
-- passes (the event exists). When the victim's read later runs, the analyze-*
-- write-back takes its humanEdited branch (`edited_at` is set) and writes
-- `update(readFields).eq('event_id', …)` with no pet_id
-- (supabase/functions/_shared/incident-analysis.ts, before this PR), so
-- `read_text` (which names the pet), `recommendation` and the flags land in the
-- ATTACKER's row. The victim reads through their own RLS and never sees their
-- "Worth a call"; a planted `status = 'completed'` also made the capped branch
-- leave the row untouched, so the victim's escalation was never written at all.
-- An UPDATE re-pointing an owned row's `event_id` did the same.
--
-- Event ids are unguessable but not secret: attachment paths are
-- `${petId}/${eventId}/…` and a pasted signed URL outlives its token (C-31's
-- reasoning, 064's F1).
--
-- ------------------------------------------------------------
-- THE FIX, three parts, independent on purpose
-- ------------------------------------------------------------
--   §1 INSERT is same-pet checked: the row's event must be an event of the
--      row's pet. Binds every role, the service role included (a policy would
--      bind `authenticated` only — 041's argument).
--   §1 UPDATE freezes `event_id` and `pet_id`: a read is ABOUT one incident of
--      one pet; nothing legitimate ever moves either column. The app's two
--      client writes (dismiss, field edits — lib/analysis.ts,
--      components/event/*AnalysisSection.tsx) name neither, and the server's
--      upsert re-sends the values the row already holds, which is not DISTINCT
--      FROM them. An ordinary edit to a row that is somehow already mismatched
--      still passes (it changes neither column), so the row stays editable
--      rather than bricked (C-38 / 067's FINDING 1b).
--   §2 Clients lose INSERT. No client path inserts (lib/analysisChain.ts header,
--      re-verified by grep 2026-09-26: every insert is the analyze-* service-role
--      upsert), so this removes the attack's entry verb at the privilege layer,
--      ahead of RLS and ahead of the trigger. UPDATE and DELETE stay: the app
--      uses UPDATE, and DELETE is out of this issue's scope.
--   §3 The apply refuses if any row is ALREADY mismatched, because §1 only
--      judges writes and a row planted before this runs would outlive it.
--
-- The server half ships in the same PR (PM ruling, 2026-09-26, option A): the
-- analyze-* functions refuse an existing row whose pet differs from its event's
-- and key every update on event_id AND the event's pet_id, with a zero-row
-- check. That refusal is not decoration: for a row that IS mismatched at rest,
-- it is the only thing standing between a re-read and that row (the reviewer
-- showed an upsert whose SET omits pet_id, or the old unkeyed update, still
-- writing the victim's read into a row planted with this trigger disabled).
-- §3 guarantees no such row exists at apply time and §1 that none can be made
-- after, except by the events-side move below.
--
-- ------------------------------------------------------------
-- WHERE THIS DEPARTS FROM THE ISSUE'S LITERAL SHAPE, and why
-- ------------------------------------------------------------
--   1. FREEZE, not re-check, on UPDATE (PM ruling 2026-09-26, a better-than-
--      the-rule brief). The issue and the CUL-1268 comment spec a guard that
--      re-runs the same-pet lookup on any UPDATE where either column IS
--      DISTINCT FROM OLD. That shape carries the cross-account MEMBERSHIP
--      ORACLE 047 / 064 / 067 each disclosed: under SECURITY DEFINER the lookup
--      sees every tenant, so an UPDATE of one's own row to (victim pet, victim
--      event) passes the trigger and is refused by RLS (42501) exactly when
--      the pair is real, and by the trigger (23514) when it is not. Freezing
--      does no lookup on UPDATE, so every such attempt returns the same 23514
--      with the same message. It also forbids a same-pet re-point, which
--      nothing uses. 067 chose freezing over re-pointing for the same reason
--      (a read of one incident is not a read of another).
--   2. `search_path = pg_catalog, pg_temp`, not the `''` the comment names.
--      072 (same day) recorded that under `''` Postgres still searches the
--      session's temp schema FIRST for type names — a SECURITY DEFINER
--      type-shadowing hole the reviewer exploited on a PG16 replay; naming
--      pg_temp LAST closes it. This function declares no typed variables, so
--      `''` would likely be safe here, but the newest house form is the one to
--      copy forward (the repo-wide pass is CUL-1281).
--
-- ------------------------------------------------------------
-- POSTURE — B-520 (047 Part 3), from birth
-- ------------------------------------------------------------
-- SECURITY DEFINER so the INSERT arm's lookup is not RLS-filtered and the
-- guard's correctness does not depend on what the writer can see (the NOT
-- EXISTS → RAISE polarity fails closed either way; this is class consistency).
-- The lookup is schema-qualified. EXECUTE revoked from PUBLIC / anon /
-- authenticated, all three explicitly (CUL-881: the project's default ACL grants
-- anon and authenticated directly, so a PUBLIC-only revoke leaves them). Trigger
-- firing does not check EXECUTE (probed live by 047). Registered in
-- lib/functionHardening.test.ts.
--
-- C-31: the one RAISE names only NEW.event_id / NEW.pet_id, values the caller
-- sent, with ONE message for "no such event", "another pet's event" and "the
-- columns moved". Nothing read from `events` reaches it.
--
-- Oracle, stated rather than assumed: with §2 a client INSERT is refused at the
-- privilege check (42501 "permission denied for table") before RLS or this
-- trigger run, whatever ids it names, so the INSERT arm answers nothing to a
-- client. The UPDATE arm reads nothing. The service role, which does insert,
-- already sees everything.
--
-- ------------------------------------------------------------
-- WHAT ELSE CAN MOVE (C-38), and what this file does not close
-- ------------------------------------------------------------
--   * `events.pet_id`. An events UPDATE re-validates no child's pet — the
--     class-wide gap 064 filed as CUL-882 (023 / 041 / 064 carry it too).
--     events RLS confines such a move to the owner's own pets, so it is never
--     cross-account; the app has no path that moves an event between pets
--     (lib/db.ts updateEvent sets no pet_id). If one happens by hand, the
--     analyze-* refusal (the PR's server half) stops a re-read from writing
--     into the stale row, and §1 leaves it editable. THE COST, a behaviour
--     change and not only a guard: before this an un-edited re-read's upsert
--     re-pointed pet_id and healed such a row; now the upsert is refused (the
--     freeze) and so is the keyed update, so the moved event's read cannot
--     refresh until the stale row is deleted, which has no UI. Same account
--     only; recorded on CUL-882, where the events-side move is decided.
--   * `incident_type` is denormalised from `events.event_type` and an owner can
--     change it on their own row. Same account, same pet, no cross-account
--     reach; 0 rows differ today. Not this issue.
--   * DELETE: an owner can delete their own analysis row. Own data; not this
--     issue.
--
-- ------------------------------------------------------------
-- Migration Safety Pre-flight
-- ------------------------------------------------------------
--   Destructive y/n:  n. One new function, one new trigger, INSERT revoked
--                     from two client roles that no client path uses, and a
--                     read-only assertion. No column, table, type, policy or
--                     row is created, altered or dropped.
--   Affected tables:  public.event_ai_analysis (one BEFORE INSERT OR UPDATE
--                     trigger; a privilege change). Row-count checks to run
--                     BEFORE applying — verified live 2026-09-26:
--                       select count(*) from public.event_ai_analysis;        -> 116
--                       select count(*) from public.event_ai_analysis a
--                         join public.events e on e.id = a.event_id
--                        where e.pet_id is distinct from a.pet_id;            -> 0
--                     A non-zero second result means a row is already planted or
--                     stale. §3 now makes the apply itself fail on it (a count
--                     only), so this check is no longer the only line.
--   Backfill:         N/A — no data change.
--   Rollback plan:    reversible:
--                       DROP TRIGGER IF EXISTS trg_event_ai_analysis_same_pet
--                         ON public.event_ai_analysis;
--                       DROP FUNCTION IF EXISTS public.enforce_event_ai_analysis_same_pet();
--                       GRANT INSERT ON TABLE public.event_ai_analysis TO anon, authenticated;
--                     (trigger before its function). Rolling back re-opens the
--                     plant described above.
-- ============================================================


-- ============================================================
-- 1. The guard: same-pet on INSERT, frozen on UPDATE
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_event_ai_analysis_same_pet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (
      SELECT 1
        FROM public.events e
       WHERE e.id = NEW.event_id
         AND e.pet_id = NEW.pet_id
    ) THEN
      -- NEW.* only, one message for every cause (C-31). Do not "improve" it
      -- with the event's pet or date: under DEFINER that is another tenant's
      -- data (064's F1).
      RAISE EXCEPTION
        'event_ai_analysis.event_id % must reference an event of the same pet (%) and cannot change',
        NEW.event_id, NEW.pet_id
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.event_id IS DISTINCT FROM OLD.event_id
     OR NEW.pet_id   IS DISTINCT FROM OLD.pet_id THEN
    -- IS DISTINCT FROM (not <>) so a NULL can never slip past, and so the
    -- service-role upsert, which re-sends both columns with the values the row
    -- already holds, still passes. Byte-identical to the INSERT message on
    -- purpose: whichever arm refuses, the caller learns nothing it did not send.
    RAISE EXCEPTION
      'event_ai_analysis.event_id % must reference an event of the same pet (%) and cannot change',
      NEW.event_id, NEW.pet_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_event_ai_analysis_same_pet() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_event_ai_analysis_same_pet() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_event_ai_analysis_same_pet() FROM authenticated;

CREATE TRIGGER trg_event_ai_analysis_same_pet
  BEFORE INSERT OR UPDATE ON public.event_ai_analysis
  FOR EACH ROW EXECUTE FUNCTION public.enforce_event_ai_analysis_same_pet();

COMMENT ON FUNCTION public.enforce_event_ai_analysis_same_pet() IS
  'CUL-1203 / B-520: event_ai_analysis.event_id must name an event of the row''s own pet_id on INSERT, and neither column may change on UPDATE (a read of one incident is not a read of another; freezing does no lookup, so it opens no 047-class membership oracle). SECURITY DEFINER so the INSERT lookup is not RLS-filtered; search_path = pg_catalog, pg_temp (072: pg_temp last); EXECUTE revoked from PUBLIC/anon/authenticated (trigger firing does not check EXECUTE). One RAISE naming only NEW.event_id / NEW.pet_id (C-31). Paired with the analyze-* write-back keyed on event_id AND pet_id.';


-- ============================================================
-- 2. Clients never insert a read
-- ============================================================
-- Every read is born in the analyze-* Edge Functions under the service role,
-- which keeps its grants. A future client path that needs to insert takes a
-- migration that re-grants it, which is exactly the decision this makes someone
-- make — and §1 still binds it when it does.
REVOKE INSERT ON TABLE public.event_ai_analysis FROM anon;
REVOKE INSERT ON TABLE public.event_ai_analysis FROM authenticated;


-- ============================================================
-- 3. No row is already mismatched (rls-privacy-reviewer H1)
-- ============================================================
-- §1 validates WRITES, never rows at rest. A row planted before this file runs
-- (the pre-flight count above was taken by hand, earlier) would survive it: the
-- victim cannot see or delete it, the attacker can still edit it, and the
-- analyze-* refusal then blocks every future read of that event — its
-- deterministic "Worth a call" included. A permanent, silent escalation
-- suppression, so the apply refuses rather than trusting a count taken earlier.
--
-- WHY HERE, at the end: CREATE TRIGGER took SHARE ROW EXCLUSIVE on the table,
-- which every INSERT / UPDATE / DELETE conflicts with, and holds it to commit.
-- So this statement sees every row committed before the lock and no write can
-- land after it until the guard is live — there is no gap between the check and
-- the trigger. (Applied statement-by-statement instead, the trigger is already
-- live by the time this runs, so the conclusion holds either way.)
--
-- A count only, never an id or a pet (C-31): this reads every tenant's rows.
DO $$
DECLARE
  mismatched BIGINT;
BEGIN
  SELECT count(*)
    INTO mismatched
    FROM public.event_ai_analysis a
    JOIN public.events e ON e.id = a.event_id
   WHERE e.pet_id IS DISTINCT FROM a.pet_id;

  IF mismatched > 0 THEN
    RAISE EXCEPTION
      '073: % event_ai_analysis row(s) are filed under a pet other than their event''s; investigate before applying (CUL-1203)',
      mismatched;
  END IF;
END
$$;
