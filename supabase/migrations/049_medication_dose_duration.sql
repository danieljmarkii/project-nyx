-- ============================================================
-- Migration 049: medications.target_duration_doses — a fixed course
-- denominated in DOSES rather than days (B-618 PR 1)
--
-- Spec: docs/nyx-medication-dose-duration-requirements.md §3 (schema),
--       §0 D1 (what the counter counts), D7 (a counter never ends a course).
-- ============================================================
--
-- WHAT THIS IS. One nullable INTEGER column plus two CHECKs. Nothing else
-- changes: no index, no policy, no trigger, no existing column touched.
--
-- WHY IT EXISTS. Since migration 020 a fixed course has been expressible only
-- in days (`target_duration_days`), and days is a DERIVED approximation of what
-- the pharmacy actually dispensed. The PM's own Motozol course was dispensed as
-- "#28, until gone"; entered in days with an evening start, the profile card's
-- "Day X of Y" ran ahead of the bottle from day one, and compliance under-read
-- because the expectation (`doses_per_day × daysElapsed`) charges a full first
-- day the course never had. Days fails at both ends — an evening start
-- over-counts the front, and a missed day silently shifts the true end — while
-- the dispensed count is the label's own truth and drifts for neither reason.
--
-- WHY A SECOND COLUMN AND NOT A UNIT DISCRIMINATOR. The alternative shape was
-- one `target_duration` INTEGER plus a `target_duration_unit` enum. Rejected:
-- every existing reader (`generate-report`, `generate-signal`, the profile card,
-- the sync select) names `target_duration_days` and means days by it, so a
-- discriminator would either rewrite all of them in a schema PR — violating
-- migration isolation — or leave a column whose meaning depends on a sibling
-- column that half the readers do not select. Two explicitly-named columns keep
-- every shipped reader correct and unchanged: a days course is still exactly
-- what it was, and a doses course simply reads NULL to anything that only knows
-- about days (§7's verified seams — the report and the signal engine both
-- degrade to "since <start>", which is honest, not wrong).
--
-- WHY THE MUTUAL-EXCLUSION CHECK. `medications_one_duration_denomination` makes
-- a two-unit row UNREPRESENTABLE rather than something every consumer has to
-- reconcile at read time. Three states, all meaningful:
--     both NULL           -> ongoing / indefinite (unchanged, and the dominant
--                            shape in production today)
--     days set only       -> a fixed course in days (every existing fixed row)
--     doses set only      -> a fixed course in doses (new)
-- The fourth state — both set, with the two disagreeing about when the course
-- ends — has no correct rendering, so the database refuses it. That refusal is
-- itself an acceptance criterion (§8 #8).
--
-- WHY `> 0` AND NOT `>= 0`. Mirrors the existing "blank or zero never fakes a
-- course" rule at the entry path: a 0-dose course is not a course, it is an
-- ongoing regimen, and the honest encoding of that is NULL. Letting 0 through
-- would render "Dose 0 of 0" on a card that must never claim completion (D7).
--
-- WHAT THIS COLUMN DELIBERATELY DOES NOT DO. It does not end a course. Reaching
-- the target renders no completion state, no checkmark and no stop language —
-- `status` remains the only lifecycle authority, because end-of-course is the
-- vet's call and an app that says "done" at dose 28 is an app that teaches
-- owners to stop antibiotics early (D7, Dr. Chen, non-negotiable). Nothing in
-- this migration is capable of setting `status`; that is by design and any
-- future trigger proposing to do so is the thing D7 forbids.
--
-- NO BACKFILL, AND NO RE-DENOMINATION OF EXISTING ROWS. Every existing row is
-- days-denominated or ongoing and stays exactly so. Converting a days course to
-- doses would require multiplying by `doses_per_day`, which is nullable (PRN),
-- may have been edited since, and would silently restate a number the owner
-- entered — so the unit a course was created in is never converted, here or at
-- the edit path (§5).
--
-- RLS / PRIVACY (T&S). No change. This is a new column on an existing
-- pet-scoped table whose policies (migration 020 §5) are unchanged, reachable
-- only through the same pet-ownership check; it holds an integer the owner
-- typed, adds no new reader, no new grant and no new surface, and rides the
-- existing delete-account cascade.
--
-- ------------------------------------------------------------
-- Migration Safety Pre-flight
-- ------------------------------------------------------------
--   Destructive y/n:  n. Purely additive — ONE nullable column, its own CHECK,
--                     one table-level CHECK and one COMMENT. Drops, renames or
--                     alters no existing column, constraint, index, policy or
--                     row. Existing rows get NULL, which is the correct value
--                     for all of them.
--   Affected tables:  public.medications. Checks the PM can run BEFORE applying
--                     (both informational — an ADD COLUMN of a nullable column
--                     with no default is O(1) in PG 11+, no table rewrite):
--                       select count(*) as total,
--                              count(target_duration_days) as fixed_in_days
--                         from public.medications;
--                       -- confirm the column is not already present:
--                       select 1 from information_schema.columns
--                        where table_schema = 'public'
--                          and table_name  = 'medications'
--                          and column_name = 'target_duration_doses';  -- expect 0 rows
--                     The new table-level CHECK cannot fail validation against
--                     existing rows: `target_duration_doses` is NULL on every
--                     one of them at apply time, so the OR is satisfied by
--                     construction regardless of `target_duration_days`.
--   Backfill:         N/A — see "NO BACKFILL" above. NULL is the honest value
--                     for every existing row.
--   Rollback plan:    reversible, two statements, in this order:
--                       ALTER TABLE public.medications
--                         DROP CONSTRAINT medications_one_duration_denomination;
--                       ALTER TABLE public.medications
--                         DROP COLUMN target_duration_doses;
--                     (Dropping the column alone also drops both CHECKs, but the
--                     explicit constraint drop keeps the reversal readable.)
--                     Loses only dose-denominated targets entered after apply;
--                     every regimen, dose event and days-denominated target
--                     survives untouched.
-- ============================================================

ALTER TABLE public.medications
  ADD COLUMN IF NOT EXISTS target_duration_doses INTEGER;

-- A course is at least one dose. Zero/negative is not a shorter course, it is
-- an absent one — and the absence of a fixed target is spelled NULL.
ALTER TABLE public.medications
  ADD CONSTRAINT medications_target_duration_doses_positive
  CHECK (target_duration_doses IS NULL OR target_duration_doses > 0);

-- At most one denomination per regimen. See "WHY THE MUTUAL-EXCLUSION CHECK"
-- above: the two-unit row is the state with no correct rendering, so it is made
-- unrepresentable rather than reconciled by every reader.
ALTER TABLE public.medications
  ADD CONSTRAINT medications_one_duration_denomination
  CHECK (target_duration_days IS NULL OR target_duration_doses IS NULL);

COMMENT ON COLUMN public.medications.target_duration_doses IS
  'B-618: a fixed course length denominated in DOSES (the dispensed "#28, until gone"), the sibling of target_duration_days. At most one of the two is ever set (medications_one_duration_denomination); both NULL = ongoing. Counts THERAPY DELIVERED — the card advances it on administrations with adherence given or partial, via the single exported predicate dosesTowardTarget() in lib/medications.ts, never re-derived per surface (D1/D6). Reaching the target renders NO completion or stop language and never touches status: ending a course is the vet''s call (D7).';
