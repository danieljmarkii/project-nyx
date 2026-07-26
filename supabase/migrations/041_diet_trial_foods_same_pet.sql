-- ============================================================
-- diet_trial_foods — same-pet integrity guard (B-417 PR 1, follow-up to 040)
-- See: docs/nyx-diet-trial-requirements.md §3.2 (the allowed set),
--      supabase/migrations/023_dose_paired_event.sql (the mechanism this imports).
-- ============================================================
-- FOUND BY `rls-privacy-reviewer` AGAINST MIGRATION 040, AND CONFIRMED
-- EMPIRICALLY against production (in rolled-back transactions, as real
-- `authenticated` roles with JWT claims) before this migration was written.
--
-- 040's policy constrains TWO of the table's three foreign keys — `pet_id` and
-- `food_item_id` — and leaves `diet_trial_id` in neither `USING` nor
-- `WITH CHECK`. It is therefore a bare FK: existence-checked, RLS-bypassing.
-- 040's own comment cites `023_dose_paired_event.sql` for exactly this hazard
-- class and then does not import its mechanism. Three confirmed consequences:
--
--   (1) CROSS-PET WITHIN ONE ACCOUNT — the one that corrupts the vet report.
--       An owner with two pets can write a row whose `pet_id` is Pet A and
--       whose `diet_trial_id` is Pet B's trial. Both `WITH CHECK` predicates
--       pass (both objects belong to the writer) and the FK passes, because
--       nothing compares the trial's `pet_id` to the row's. §5.3 makes the
--       allowed set the ONLY permit path, so the effect is to grant a permit
--       for the wrong pet: a genuine off-diet exposure scores `permitted`, and
--       PR 7 renders that to a clinician. It fails in the REASSURING direction,
--       which is the direction this repo treats as the dangerous one.
--       (`personas.md`'s multi-pet-bleed anti-pattern, landing in the artifact
--       it specifically warns about.)
--
--   (2) CROSS-ACCOUNT TRIAL REFERENCE — the silent shrink, re-opened.
--       An owner can write a row naming ANOTHER account's `diet_trial_id`.
--       Confirmed harm, measured: when that other account deletes the trial —
--       or deletes their whole account — the CASCADE removes a row from the
--       FIRST owner's allowed set. Their permitted food becomes an off-diet
--       exposure, with no user action and no trace.
--
--       That is the SAME harm 040's `food_item_id` predicate was written to
--       prevent, arriving through the FK that predicate does not cover. The
--       boundary was closed on one door and left open on its twin.
--
--   (3) UPDATE IS UNGUARDED TOO, and is the path PR 2's last-write-wins mirror
--       will use. `USING` admits the old row, `WITH CHECK` never mentions
--       `diet_trial_id`, so re-pointing an existing legitimate row at any trial
--       in the database succeeds.
--
-- WHY A TRIGGER AND NOT A THIRD `WITH CHECK` PREDICATE. A policy is a
-- CLIENT-PATH gate: it binds `authenticated`, and every service-role caller
-- bypasses it entirely. `023` chose a BEFORE trigger deliberately, in its own
-- words, because it "runs server-side on every write regardless of client, so
-- the boundary does not depend on the [...] write path remembering to enforce
-- it." That reasoning applies here verbatim and more strongly: `generate-report`,
-- `ask` and `generate-signal` all hold the service role key, and §9 contemplates
-- a future share-link reader. A `WITH CHECK` predicate would leave every one of
-- those paths able to write the corrupt row.
--
-- WHY CHECKING THE PET IS SUFFICIENT FOR BOTH (1) AND (2). `pets.user_id` makes
-- a pet unique to one owner, and `NEW.pet_id` has already been RLS-verified as
-- the writer's pet. So same-pet ⟹ same-owner, and a trial belonging to another
-- ACCOUNT necessarily belongs to another PET — one check closes both. This is
-- `023`'s argument, and like `023` it holds under either security context:
--   • SECURITY INVOKER (the default, used here): `diet_trials` RLS also applies,
--     so another owner's trial is invisible → 0 rows → raise.
--   • Even with RLS not filtering: a trial whose `pet_id` equals `NEW.pet_id`
--     necessarily belongs to that same owner.
--
-- `search_path` is pinned to '' and `diet_trials` is schema-qualified, so this
-- cross-table lookup cannot be redirected by a caller-controlled search_path —
-- the same hardening `023` applies, for the same reason.
--
-- Cost: one indexed PK lookup on `diet_trials.id` per write. `diet_trial_id` is
-- NOT NULL, so unlike `023` there is no null fast-path to guard.
--
-- ------------------------------------------------------------
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
-- ------------------------------------------------------------
-- The review raised two further findings that are NOT access-control bugs and
-- are NOT fixed here, because both are design calls that belong to the PM and
-- to PR 5 rather than to a boundary hotfix:
--
--   • `food_label NOT NULL` + `ON DELETE CASCADE` are in tension. 040 says the
--     label exists "for the SNAPSHOT readers that outlive the row" while also
--     conceding the row dies with the food — so a hard food delete loses the
--     whole ENTRY, not merely its label. Reachability is low today
--     (`lib/foodArchive.ts` made the owner path a reversible archive that never
--     touches trials), but `food_items_delete` still grants a hard DELETE.
--     Making the snapshot real means `RESTRICT`, or `SET NULL` + a nullable
--     `food_item_id` — a schema shape change, flagged for the PM.
--   • `FOR ALL` grants the owner a hard DELETE over rows 040 says must only
--     ever be soft-removed ("removing a food is an UPDATE [...] NEVER a
--     DELETE"). Confirmed: an owner DELETE succeeds. Splitting the policy into
--     SELECT/INSERT/UPDATE would default-deny it, but that constrains PR 2's
--     sync shape, so it is PR 2's call to make with its write paths in view.
--
-- ------------------------------------------------------------
-- Migration Safety Pre-flight
-- ------------------------------------------------------------
--   Destructive y/n:  n. Adds one function and one trigger. No table, column,
--                     type, index or policy is altered or dropped.
--   Affected tables:  diet_trial_foods (0 live rows — production has never had
--                     a write path; verify with
--                       SELECT count(*) FROM diet_trial_foods;   -> expect 0).
--                     Because the table is empty, no existing row can violate
--                     the new invariant, so this cannot fail on legacy data.
--                     If it is ever non-zero, run this first and expect 0:
--                       SELECT count(*) FROM diet_trial_foods f
--                       JOIN diet_trials t ON t.id = f.diet_trial_id
--                       WHERE t.pet_id <> f.pet_id;
--   Backfill:         N/A — no rows, and the guard is forward-looking.
--   Rollback plan:    reversible, and order matters (trigger before function):
--                       DROP TRIGGER IF EXISTS trg_diet_trial_foods_same_pet
--                         ON diet_trial_foods;
--                       DROP FUNCTION IF EXISTS enforce_diet_trial_food_same_pet();
--                     Rolling back re-opens findings (1)–(3) above.
-- ============================================================

CREATE OR REPLACE FUNCTION enforce_diet_trial_food_same_pet()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.diet_trials t
    WHERE t.id = NEW.diet_trial_id
      AND t.pet_id = NEW.pet_id
  ) THEN
    RAISE EXCEPTION
      'diet_trial_id % must reference a diet trial for the same pet (%)',
      NEW.diet_trial_id, NEW.pet_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_diet_trial_foods_same_pet
  BEFORE INSERT OR UPDATE ON diet_trial_foods
  FOR EACH ROW EXECUTE FUNCTION enforce_diet_trial_food_same_pet();

COMMENT ON FUNCTION enforce_diet_trial_food_same_pet() IS
  'B-417: defense-at-rest guard closing the gap rls-privacy-reviewer found in migration 040 — diet_trial_id was the one FK constrained by neither USING nor WITH CHECK, so a row could name a trial belonging to a different pet (granting a permit for the wrong pet on the vet report) or a different account (whose trial deletion then silently shrank this owner''s allowed set). A trigger rather than a policy predicate because service-role callers bypass RLS entirely; mirrors enforce_dose_paired_event_same_pet() from migration 023.';
