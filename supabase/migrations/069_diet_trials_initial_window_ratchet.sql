-- ============================================================
-- 069 — diet_trials.target_duration_days_initial becomes a RATCHET
-- CUL-1051 (trial-window PR 1c). Found by `code-reviewer` on CUL-1038.
--
-- One BEFORE INSERT OR UPDATE trigger on public.diet_trials. Nothing else
-- changes: no column, no index, no policy, no CHECK, no existing column altered.
--
-- WHAT IT ENFORCES, exactly — the comment states what the code does and nothing
-- more (C-38: a COMMENT must not write a cheque the code does not cash):
--   INSERT  →  initial := COALESCE(initial, target_duration_days)
--   UPDATE  →  initial is IMMUTABLE once non-NULL; the server keeps its own value
--              and the client's is discarded, whatever it holds.
--
-- WHY. `target_duration_days_initial` is the window the trial was DESIGNED
-- against, and CUL-1038's coverage freeze prints the vet report's denominator
-- over it. It is a historical fact: it can never legitimately change once known.
-- But the client can erase it, and on `main` today that path is open end to end:
--
--   1. `COLUMN_UPGRADES` (lib/localSchema.ts:484) adds the column to an
--      already-installed device as a bare ADD COLUMN with NO local backfill —
--      deliberately, because a local guess would be the app writing down a value
--      the owner never stated. Every pre-existing trial holds NULL until its
--      first hydrate.
--   2. `dietTrialRowToRemote` (lib/dietTrialMirror.ts:375) FORWARDS the column.
--   3. `pushRows` (lib/sync.ts:512) is a full-row `upsert(…, {onConflict:'id'})`,
--      and PostgREST sets every column present in the payload from `excluded`.
--   4. `syncNow` is push-before-pull (FR-2), and the window-change path fires its
--      own immediate `syncPendingDietTrials()` with no hydrate in front of it.
--
-- So an owner on a freshly-updated phone who opens `Manage → Change the window`
-- overwrites the server's designed window with NULL, permanently — no trigger to
-- catch it, no way to re-derive it — and their vet report silently returns to the
-- TE-6-violating arithmetic CUL-1038 exists to stop, for exactly the trials it
-- was written to protect. PR 3 (#873) sharpened this: the control that fires the
-- push is now a header verb on every running card, not a link on an overrun one.
--
-- THE SECOND VARIANT, which a NULL-only guard would miss. A device whose LOCAL
-- target is already the extended value runs its own
-- `COALESCE(initial, target_duration_days)` (lib/dietTrialSetup.ts:1011) against
-- the LOCAL row and pushes, say, 84 over the server's correct 28. That is not a
-- NULL and it un-freezes the trial just as thoroughly, only less visibly. Hence
-- immutability rather than a NULL check: the server never takes the client's
-- word for this column once it has its own.
--
-- WHY SERVER-SIDE AT ALL. Every client-side variant writes a plausible wrong
-- number instead of an honest NULL, and none of them reaches an old build. A
-- trigger covers every client, hydrated or not, with no client change.
--
-- WHY A SILENT CORRECTION AND NOT A RAISE — decided explicitly, per the issue.
-- The caller is a stale sync payload, not an owner making a choice: nobody typed
-- this value and nobody is waiting to be told it was refused. A RAISE would abort
-- the whole UPDATE, and `23514` is in `TERMINAL_SYNC_ERROR_CODES`, so the client
-- quarantines the row IMMEDIATELY with no retry — the trial stops syncing
-- entirely, taking its status, its allowed set and every future edit with it,
-- over a column the client never meant to touch. C-38's rule from CUL-899, in
-- one line: writable-but-corrected is repairable, bricked is not. This trigger
-- cannot brick a row, because it has no failure path at all.
--
-- WHY INVOKER AND NOT `SECURITY DEFINER` (067's `enforce_vet_visit_pet_immutable`
-- asymmetry, applied): this function READS NOTHING. It compares columns of the
-- row in front of it, so it has no lookup to be RLS-blinded on, and an elevated
-- context would be privilege with no purpose — and it cannot be the cross-account
-- oracle of CUL-867/C-31, because it raises nothing and reads no other row.
-- `search_path` is pinned anyway: it costs nothing and keeps the family uniform.
--
-- WHAT ELSE CAN MOVE (C-38's question) — AND THE ANSWER IS NOT "NOTHING".
-- An earlier draft of this header said a DELETE "removes the trial outright
-- rather than falsifying it". That is FALSE, and `rls-privacy-reviewer` broke it:
--
--   DELETE FROM diet_trials WHERE id = X;  -- then re-INSERT the SAME id
--   INSERT INTO diet_trials (id, …, target_duration_days_initial) VALUES (X, …, 84);
--
-- takes the designed window from 28 to 84. EXECUTED against production inside a
-- rolled-back transaction, on a throwaway row: 28 -> 84, RLS-legal, no error.
-- This trigger is a per-row-VERSION guard, not a per-ID guard — a BEFORE INSERT
-- trigger cannot know the id was previously used — so the `COMMENT` below says
-- "immutable for the life of the row" and not "immutable", because the row's life
-- is exactly what a DELETE ends. Writing the stronger claim here while shipping
-- the weaker code is the cheque-the-code-does-not-cash failure 045 and 066 both
-- recorded, and this header cited C-38 while committing it.
--
-- BOUNDED, because the bound is what decides whether it ships: it is
-- owner-against-their-own-record, NOT cross-tenant (every cross-account attack
-- held — the only branch that reads OLD is unreachable for another tenant, since
-- RLS filters the row before the executor reaches the trigger). No shipped code
-- path DELETEs a `diet_trials` row — every touch in `lib/`, `store/`, `app/`,
-- `supabase/functions/` and `scripts/` is a SELECT — so it takes two hand-crafted
-- PostgREST calls with the owner's own session, and it costs the attacker the
-- allowed set (`diet_trial_foods … ON DELETE CASCADE`, 040:157). Closing it for
-- real needs a tombstone or a DELETE revoke, which is a separate decision with
-- its own blast radius: CUL-1058.
--
-- What genuinely cannot move it: `target_duration_days` is independent of it,
-- `started_at` moves the day counter and not this column, and a BEFORE trigger
-- binds the service role where a policy would not.
--
-- KNOWN LIMIT, stated because an undocumented blind spot reads as coverage.
-- The ratchet makes a WRONG value permanent too, and this is NOT confined to
-- legacy rows — an earlier draft of this header said it was, and that was
-- understated. Two live shapes, both measured:
--
--   (a) The INSERT branch TRUSTS a client-supplied `initial`. Executed against
--       production (rolled back): a row sent with target 21 and initial 7 keeps
--       7, frozen for the row's life. `COALESCE` is what makes that possible and
--       it is deliberate — PR 2's write path and any future `startDietTrial`
--       stamp correctly and must not be second-guessed — but the cost is that a
--       plausible wrong POSITIVE survives. `deriveWindowChange` rejects <= 0, so
--       the harmless shapes are filtered and this one is not.
--   (b) 068's own header records that its backfill "does not recover history that
--       predates the column": a trial extended through the milestone path before
--       068 applied carries its EXTENDED window as `initial`. Freezing that is not
--       a new defect — the value was already unrecoverable.
--
-- Branch 3 below is the one that can AFFIRMATIVELY MANUFACTURE a wrong value: on
-- a row with `initial` NULL and a target already extended, the first write of any
-- kind stamps the extended window, and branch 2 then freezes it. The report then
-- renders `direction = 'changed'` rather than "extended from N days" and
-- `daysPastOriginalWindowNow` goes NULL — the page's only staleness disclosure
-- (generate-report/trial.ts:469-475). Its whole defence is that `initial_null` is
-- zero, which is measured below and RE-CONFIRMED after apply. The branch is
-- self-closing: post-069 every INSERT stamps non-NULL, so no new row can enter
-- that state.
--
-- In every case the only correction is a service-role UPDATE with the trigger
-- dropped, which the rollback below covers.
--
-- ============================================================
-- MIGRATION SAFETY PRE-FLIGHT
--   Destructive:      n. Additive only — one function, one trigger. No column is
--                     added, dropped, renamed or altered; no existing value is
--                     rewritten by this migration.
--   Affected tables:  public.diet_trials (one new BEFORE INSERT OR UPDATE
--                     trigger, firing alphabetically FIRST of the three the
--                     table now carries — before trg_diet_trials_updated_at
--                     (001:283) and trg_diet_trials_visit_same_pet (066:360),
--                     neither of which reads this column).
--   Affected rows:    ZERO at apply. This migration rewrites nothing; it only
--                     constrains later writes. Measured on production
--                     2026-09-17, aggregates only:
--                       SELECT count(*) AS trials_total,
--                              count(*) FILTER (WHERE target_duration_days_initial IS NULL)   AS initial_null,
--                              count(*) FILTER (WHERE target_duration_set_at IS NOT NULL)     AS window_moved,
--                              count(*) FILTER (WHERE target_duration_days_initial
--                                                     IS DISTINCT FROM target_duration_days)  AS initial_differs
--                         FROM public.diet_trials;
--                       -> trials_total 3 · initial_null 0 · window_moved 0 · initial_differs 0
--                     So: 068's backfill is intact on all three rows, NO window
--                     has ever moved in production, and nothing has been
--                     clobbered between #868 and this apply. There is nothing to
--                     repair, which is why this ships as a guard and not as a
--                     guard plus a data fix. Re-run the same query before
--                     applying; a non-zero `initial_null` or `initial_differs`
--                     means a row moved in the interval and wants a look first.
--   Backfill:         N/A. The INSERT branch stamps rows created from now on;
--                     existing rows already carry 068's backfill.
--   Rollback plan:    reversible, two statements, no data loss:
--                       DROP TRIGGER IF EXISTS trg_diet_trials_initial_ratchet
--                         ON public.diet_trials;
--                       DROP FUNCTION IF EXISTS
--                         public.enforce_diet_trial_initial_window_ratchet();
--                     Dropping it restores today's behaviour exactly, including
--                     the clobber. Values stamped while it was live are ordinary
--                     column values and survive the drop.
-- ============================================================

CREATE OR REPLACE FUNCTION enforce_diet_trial_initial_window_ratchet()
RETURNS TRIGGER
LANGUAGE plpgsql
-- INVOKER, deliberately — see the header. Reads nothing, raises nothing.
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- At creation `target_duration_days` IS the designed window, by definition —
    -- the same identity 068's backfill relied on for existing rows. COALESCE so a
    -- client that already stamps the column correctly (PR 2's write path, and any
    -- future startDietTrial) is not second-guessed.
    NEW.target_duration_days_initial :=
      COALESCE(NEW.target_duration_days_initial, NEW.target_duration_days);
    RETURN NEW;
  END IF;

  IF OLD.target_duration_days_initial IS NOT NULL THEN
    -- THE RATCHET. Unconditional: the server's value wins over whatever the
    -- payload holds, NULL or a number. Not `IS DISTINCT FROM` + RAISE, because
    -- this corrects rather than refuses (see the header), and an assignment that
    -- writes back the identical value on the ordinary no-change path is free.
    --
    -- OBSERVABILITY, and why it is a LOG rather than nothing. Because this
    -- assignment is unconditional and this trigger fires first, every later
    -- trigger sees NEW = OLD on this column, so a correction is invisible to any
    -- audit trigger or future guard — a buggy client build erasing the designed
    -- window on every sync would surface NOWHERE. `rls-privacy-reviewer` named
    -- that, and it is separable from the decision not to quarantine: a LOG does
    -- not abort, never reaches the client, and is C-31-clean because it names
    -- only NEW.id and the caller's OWN payload value, never anything read from
    -- another row. Guarded by IS DISTINCT FROM so the ordinary no-change path
    -- (PostgREST re-sends the column unchanged on a conflict) logs nothing.
    IF NEW.target_duration_days_initial IS DISTINCT FROM OLD.target_duration_days_initial THEN
      RAISE LOG 'diet_trials %: refused a change to target_duration_days_initial (payload %); the designed window is immutable for the life of the row (CUL-1051)',
        NEW.id, NEW.target_duration_days_initial;
    END IF;

    NEW.target_duration_days_initial := OLD.target_duration_days_initial;
    RETURN NEW;
  END IF;

  -- OLD.initial IS NULL: the row predates both 068's backfill and this trigger's
  -- INSERT branch. Unreachable in production (measured: initial_null = 0), kept
  -- because it is the only branch that can still establish the value, and because
  -- it must NOT trust the payload either — a client's local COALESCE may already
  -- hold the EXTENDED window. The server's own pre-update target is the designed
  -- one: this UPDATE has not been applied yet, so OLD.target_duration_days is the
  -- window as it stood before whatever move this statement is making.
  NEW.target_duration_days_initial := OLD.target_duration_days;
  RETURN NEW;
END;
$$;

-- Part of the SECURITY DEFINER decision family even though this one is INVOKER:
-- revoked anyway so the whole family has one posture and nobody has to work out
-- which members needed it (067's note; CUL-935 asks for the mechanical version).
REVOKE ALL ON FUNCTION public.enforce_diet_trial_initial_window_ratchet() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_diet_trial_initial_window_ratchet() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_diet_trial_initial_window_ratchet() FROM authenticated;

CREATE TRIGGER trg_diet_trials_initial_ratchet
  BEFORE INSERT OR UPDATE ON diet_trials
  FOR EACH ROW EXECUTE FUNCTION enforce_diet_trial_initial_window_ratchet();

COMMENT ON FUNCTION public.enforce_diet_trial_initial_window_ratchet() IS
  'CUL-1051 (trial-window PR 1c): makes diet_trials.target_duration_days_initial a ratchet. On INSERT it stamps COALESCE(initial, target_duration_days) — at creation the target IS the designed window. On UPDATE, a non-NULL initial is IMMUTABLE FOR THE LIFE OF THE ROW: the server keeps its own value and discards the payload''s, because the client can erase it (COLUMN_UPGRADES adds the column locally with no backfill, dietTrialRowToRemote forwards it, pushRows is a full-row upsert, and sync is push-before-pull) or overwrite it with its own already-extended target. CUL-1038''s coverage freeze prints the vet report''s denominator over this column, so an erased value silently restores the TE-6-violating arithmetic. Corrects silently rather than RAISEing: the caller is a stale sync payload, not an owner, and a refusal would be a terminal 23514 that quarantines the whole trial (C-38 — writable-but-corrected is repairable, bricked is not). INVOKER because it reads nothing (067''s asymmetry). TWO LIMITS, both measured and stated in 069''s header rather than left implicit: a DELETE followed by a re-INSERT of the same id DOES move the value (this is a per-row-version guard, not a per-id one — owner-only, unreachable from shipped code, CUL-1058), and the INSERT branch trusts a client-supplied initial, so a plausible wrong positive is frozen for the row''s life. A refused change is RAISE LOG''d because the unconditional assign would otherwise make the attempt invisible to every later trigger.';
