-- ============================================================
-- Diet Trial Lifecycle — schema gate (B-417, PR 1)
-- See: docs/nyx-diet-trial-requirements.md §3.1 (diet_trials columns),
--      §3.2 (diet_trial_foods — the allowed set, D3), §3.3 (one active trial),
--      §0.4 (the two provisional decisions), §12 (PR 1 acceptance criteria).
-- ============================================================
-- `diet_trials` shipped in 001_schema.sql and has never had a WRITE PATH. Seven
-- surfaces READ it (the profile card, useTrend/TrendZone, the widget snapshot,
-- report.ts, ask, trialContaminant, getDietTrialProgress); production holds
-- ZERO rows. So the app's stated wedge — "reactive tracking for owners sent home
-- with a diet trial" — has never rendered with real data, and the vet report's
-- own first question ("is this diet trial working?") has never been answerable.
--
-- This migration is the gate the whole B-417 track queues behind. It is also the
-- LAST CHEAP MOMENT this schema will ever have: at zero live rows every choice
-- below is free today and a migration forever after.
--
-- ------------------------------------------------------------
-- Three deliberate OMISSIONS — decisions, not oversights
-- ------------------------------------------------------------
-- Recorded here because the natural instinct of a future reader (or a future
-- session) is to "fix" each one by adding it:
--
--   • NO `diet_class` column.  C4 landed the vet-report trial block two-element
--     (§7), so nothing computes over a diet's class. A column no reader wants is
--     a column that drifts.
--   • NO `paused` value on `trial_status`.  P-2 (§0.4): a trial is active or it
--     is not. A vet-directed hold records as stopped-early + a new trial. The
--     accepted cost is stated in the spec: one clinical episode becomes two rows,
--     neither of which is a continuous window. (v0.9's §3.1 draft carried an
--     `ALTER TYPE trial_status ADD VALUE 'paused'` line marked "pending PM
--     ruling" — the ruling came back NO, and the line is deliberately absent.)
--   • NO severity columns.  C5 (PM override of the panel's recommendation):
--     severity is derived from LOGGED EVENTS, never owner-scored. §7 instead
--     discloses logging density so a thinning record cannot masquerade as an
--     improving pet.
--
-- ------------------------------------------------------------
-- Migration Safety Pre-flight
-- ------------------------------------------------------------
--   Destructive y/n:  y. §3 below DROPs the live index idx_diet_trials_active
--                     and recreates it UNIQUE. No column or table is dropped and
--                     no data is altered — the destructive flag is earned solely
--                     by the index replacement, which is why it is safe to do
--                     now and expensive to do later.
--   Affected tables:  diet_trials (0 live rows — verified this session:
--                       SELECT count(*) FROM diet_trials;                     -> 0
--                       SELECT count(*) FROM diet_trials WHERE status='active';-> 0
--                     Re-run both before applying. If either is non-zero, STOP:
--                     the UNIQUE index in §3 will fail with 23505 on the second
--                     active row for any pet, and the duplicates must be
--                     resolved by hand first.)
--                     diet_trial_foods (new table, 0 rows by construction).
--   Backfill:         N/A. Every added column is nullable or carries a DEFAULT,
--                     and there are no existing rows to fill.
--   Rollback plan:    reversible. Run in this order (children first):
--
--                       DROP TABLE IF EXISTS diet_trial_foods;   -- drops its
--                         -- policy, indexes and updated_at trigger with it
--                       ALTER TABLE diet_trials
--                         DROP COLUMN IF EXISTS food_label,
--                         DROP COLUMN IF EXISTS indication,
--                         DROP COLUMN IF EXISTS phase,
--                         DROP COLUMN IF EXISTS outcome,
--                         DROP COLUMN IF EXISTS outcome_notes,
--                         DROP COLUMN IF EXISTS stopped_reason,
--                         DROP COLUMN IF EXISTS ended_at,
--                         DROP COLUMN IF EXISTS transition_started_at;
--                       DROP TYPE IF EXISTS diet_trial_food_role;
--                       DROP TYPE IF EXISTS diet_trial_outcome;
--                       DROP TYPE IF EXISTS diet_trial_indication;
--                       DROP TYPE IF EXISTS diet_trial_phase;
--                       DROP INDEX IF EXISTS idx_diet_trials_active;
--                       CREATE INDEX idx_diet_trials_active
--                         ON diet_trials(pet_id, status) WHERE status = 'active';
--
--                     ALL FOUR TYPE DROPS ARE LOAD-BEARING. A rollback that
--                     drops the table and columns but leaves the ENUMs behind
--                     makes THIS MIGRATION UN-RE-APPLIABLE: CREATE TYPE fails
--                     42710 (duplicate_object) on the first surviving type, and
--                     the failure surfaces as an opaque migration error rather
--                     than as "you forgot the types". The types must be dropped
--                     LAST, after the columns and table that depend on them.
-- ============================================================


-- ============================================================
-- 1. diet_trials — additive columns (§3.1)
-- ============================================================

CREATE TYPE diet_trial_phase      AS ENUM ('elimination', 'reintroduction');
CREATE TYPE diet_trial_outcome    AS ENUM ('improved', 'no_change', 'worse', 'unsure');
CREATE TYPE diet_trial_indication AS ENUM ('skin', 'gi', 'other');

-- `indication` is an ENUM, NOT TEXT, and the distinction is clinical rather than
-- stylistic. §4.1 specifies a closed set with a closed mapping (GI -> 28 days,
-- Skin -> 56). Stored as free text, any value that is not exactly 'skin'/'gi'
-- falls through to a default SILENTLY — and the same string reaches a clinician
-- verbatim on the vet report (§7) and crosses the LLM boundary in Ask. A typo
-- that a domain would have rejected instead becomes a wrong duration default and
-- a wrong word in front of the vet.
--
-- `phase` carries 'reintroduction' from day one (D8) even though v1 never writes
-- it: the oral-challenge phase is the other half of every clinical protocol we
-- cite, and adding an enum value later is a migration while carrying an unused
-- one is free.
ALTER TABLE diet_trials
  ADD COLUMN food_label           TEXT,
  ADD COLUMN indication           diet_trial_indication,
  ADD COLUMN phase                diet_trial_phase NOT NULL DEFAULT 'elimination',
  ADD COLUMN outcome              diet_trial_outcome,
  ADD COLUMN outcome_notes        TEXT,
  ADD COLUMN stopped_reason       TEXT,
  ADD COLUMN ended_at             DATE,
  ADD COLUMN transition_started_at DATE;

COMMENT ON COLUMN diet_trials.food_label IS
  'B-417 §3.1: denormalized display fallback for the trial diet. food_item_id is '
  'ON DELETE SET NULL, so archiving the trial food today silently blanks the '
  'trial''s identity on the card AND the vet report. Closes the gap '
  'nyx-medication-logging-requirements.md §4.3 called "a known minor gap".';

COMMENT ON COLUMN diet_trials.indication IS
  'B-417 §3.1/§4.1: what the trial is FOR. Drives the species x indication '
  'duration default (P-1, provisional pending Dr. Chen) and is rendered verbatim '
  'to a clinician on the vet report. Closed set by construction — see migration '
  'comment for why this is not TEXT.';

COMMENT ON COLUMN diet_trials.ended_at IS
  'B-417 §3.1: written on BOTH completed and abandoned trials — this is not '
  'optional and not a duplicate of completed_at. completed_at alone leaves an '
  'ABANDONED trial with no end date, so report.ts:2813 reads the null end as '
  '"open-ended -> active through the window end" and renders an intervention the '
  'owner stopped weeks ago as still ongoing, while getDietTrialProgress renders '
  '"Day 104 of 28". Mirrors the already-shipped medications.ended_at.';

COMMENT ON COLUMN diet_trials.transition_started_at IS
  'B-417 §4.1: the first day of the >=1-week TRANSITION onto the trial diet. '
  'started_at is the first day of EXCLUSIVE feeding — the day the clinical '
  'countdown begins (CAVD: "start the 8-week countdown on the first day you feed '
  'only the elimination diet"). Recording the transition separately lets PR 5 '
  'exclude transition-window feedings from the exposure count BY CONSTRUCTION, '
  'rather than relying on owner discipline to not log them.';

COMMENT ON COLUMN diet_trials.stopped_reason IS
  'B-417 §4.3: free text, owner-supplied, on an abandoned trial. A refusal '
  'reason routes to the intake lane (intake is not preference).';

COMMENT ON COLUMN diet_trials.outcome IS
  'B-417 §4.3 (D6): OWNER-REPORTED at completion, and must be rendered as such '
  'everywhere. Not a computed verdict and never presented as one.';


-- ============================================================
-- 2. diet_trial_foods — the allowed set (§3.2, D3)
-- ============================================================
-- A trial diet is a SET, not a food: a wet and a dry of the same diet, or two
-- forms the vet named together, plus whatever extras the vet explicitly
-- permitted. diet_trials.food_item_id (singular) cannot express that, and §4.1
-- rules it display-only legacy: PR 3 keeps writing the first-picked primary food
-- for the seven existing readers, but NO COMPUTATION may read it. Every protein
-- and membership decision reads this table.

CREATE TYPE diet_trial_food_role AS ENUM
  ('primary_diet', 'permitted_treat', 'permitted_other', 'supplement');

CREATE TABLE diet_trial_foods (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  diet_trial_id  UUID NOT NULL REFERENCES diet_trials(id) ON DELETE CASCADE,
  pet_id         UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  food_item_id   UUID NOT NULL REFERENCES food_items(id) ON DELETE CASCADE,
  role           diet_trial_food_role NOT NULL DEFAULT 'primary_diet',
  food_label     TEXT NOT NULL,
  allowed_from   DATE NOT NULL DEFAULT CURRENT_DATE,
  allowed_until  DATE,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (diet_trial_id, food_item_id, role, allowed_from)
);

-- pet_id IS REQUIRED, and is not redundant with diet_trial_id.
-- CLAUDE.md's hard constraint: "Every other new table includes pet_id and RLS."
-- `grep JOIN supabase/migrations/*.sql` returns ZERO matches across all 40
-- migrations — the nested-subquery-through-the-parent form does not exist
-- anywhere in this repo, and the convention is stated three times in-migration,
-- each naming the join as the thing being avoided. Beyond convention, routing
-- this child's boundary through diet_trials would COUPLE IT TO EVERY FUTURE
-- SELECT POLICY ON THE PARENT — which is the 026_drop_vet_reports_public_share
-- failure one table removed, and §9 contemplates exactly such a policy
-- ("vet-prescribed trials via share link"). A direct pet scope cannot be widened
-- by someone else's decision about the parent.

-- MEMBERSHIP IS DATED — allowed_from/allowed_until are not bookkeeping.
-- Without them, editing the allowed set RETROACTIVELY REWRITES THE TRIAL'S
-- ENTIRE EXPOSURE HISTORY with no audit trail: add the contraband on day 13 and
-- twelve prior exposures silently re-score as permitted, the card flips to
-- clean, and the vet-report appendix empties. The vet is then reading a record
-- that changed after the fact, with nothing on the page saying so. Mirrors
-- 018_feeding_arrangements.sql:69-75.
--
-- Consequence for PR 2/PR 3, stated so it is not rediscovered as a bug: removing
-- a food from the set is an UPDATE (set allowed_until, or deleted_at for a
-- mistake), NEVER a DELETE — and re-adding a food later is a NEW ROW with a
-- later allowed_from, not a resurrection of the old one. The UNIQUE constraint
-- enforces exactly that reading: it permits the same food at the same role
-- across DIFFERENT allowed_from dates (a real removal-then-re-add), and rejects
-- a duplicate insert on the same day (which is a double-tap, not a history).

-- updated_at + deleted_at ARE WHAT MAKE THE PR-2 MIRROR POSSIBLE AT ALL.
-- A created_at-only table forces insert-if-absent sync, whose contract is "never
-- overwrite an existing local row" — so removing a food on one device could
-- NEVER propagate to another. Two devices would then compute different exposure
-- counts for the same trial, with the phone holding the REASSURING one and no
-- way for the owner to tell which is right. updated_at gives the sync layer a
-- server-time last-write-wins basis; deleted_at makes a removal a fact that can
-- travel (soft deletes only — the house rule).

-- food_label IS NOT NULL, deliberately paired with ON DELETE CASCADE.
-- The label must survive the food's deletion, and the row carrying it does not:
-- when the food goes, this row goes with it. So the label is captured at write
-- time for the SNAPSHOT readers that outlive the row — the vet report rendering
-- a completed trial, and the History of what was allowed when. A nullable
-- food_label would be dead by construction: nothing would ever have populated it
-- at the moment it was needed. (v0.9 copied it as nullable with the comment
-- "same fallback rationale as §3.1", which is the one rationale CASCADE breaks.)

-- INDEXES — two, and two is enough. All THREE foreign keys get leading-column
-- coverage, so neither a pet deletion nor a trial deletion nor a food deletion
-- seq-scans this table:
--   diet_trial_id  <- covered by the UNIQUE (diet_trial_id, ...) constraint's
--                     own btree index, which is ALSO the index that serves the
--                     dominant read ("the allowed set for this trial") as a
--                     leading-column prefix scan. Do not add a redundant
--                     standalone index on diet_trial_id — this is why there
--                     isn't one.
--   pet_id         <- idx_diet_trial_foods_pet (leading column)
--   food_item_id   <- idx_diet_trial_foods_food
CREATE INDEX idx_diet_trial_foods_pet  ON diet_trial_foods(pet_id, diet_trial_id);
CREATE INDEX idx_diet_trial_foods_food ON diet_trial_foods(food_item_id);

-- Reuse set_updated_at() from 001_schema.sql, as every mutable table since 016
-- does, so a server write stamps updated_at = NOW() and the PR-2 mirror has a
-- real server-time LWW basis rather than a client clock.
CREATE TRIGGER trg_diet_trial_foods_updated_at
  BEFORE UPDATE ON diet_trial_foods
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ------------------------------------------------------------
-- Row Level Security
-- ------------------------------------------------------------
-- Two predicates, and they guard two DIFFERENT boundaries. The pet_id clause is
-- the ordinary owner scope (as meals_owner / weight_checks_owner). The
-- food_item_id clause in the WITH CHECK is the one that is easy to leave out and
-- expensive to leave out:
--
--   FOREIGN KEY CHECKS BYPASS RLS. A bare FK to food_items(id) verifies only
--   that the row EXISTS — it is evaluated with RLS suspended, so it happily
--   accepts another account's food_item_id. Without this clause, account A can
--   insert a row naming account B's food into A's own allowed set. Then, when B
--   deletes their account, food_items.created_by_user_id CASCADEs (033), the
--   food row dies, and THIS row CASCADEs with it — silently removing an entry
--   from A's allowed set. A's permitted treat becomes an off-diet exposure, on
--   A's vet report, with no user action, no notification and no trace of what
--   changed. The failure is silent in both directions: A never did anything, and
--   B's account deletion is supposed to affect only B.
--
--   This repo litigated the identical class of hazard at
--   023_dose_paired_event.sql:106-114 (a bare FK to events(id) that verified
--   existence but not ownership).
--
-- Scope note for the reviewer: this closes the WRITE side. The pet_id clause
-- already makes another account's rows unreadable, and food_items' own
-- owner-only policies (033 FR-2) make B's food invisible to A on read — so a
-- cross-account food_item_id cannot be discovered through the API either. The
-- WITH CHECK is what stops it being GUESSED or replayed.
--
-- auth.uid() is wrapped in (select ...) so it is evaluated once per statement
-- rather than once per row (the auth_rls_initplan lint). The older policies in
-- this repo predate that guidance and are separate pre-existing debt, not
-- widened here.
ALTER TABLE diet_trial_foods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "diet_trial_foods_owner" ON diet_trial_foods
  FOR ALL USING (
    pet_id IN (SELECT id FROM pets WHERE user_id = (select auth.uid()))
  )
  WITH CHECK (
    pet_id IN (SELECT id FROM pets WHERE user_id = (select auth.uid()))
    AND food_item_id IN (SELECT id FROM food_items WHERE created_by_user_id = (select auth.uid()))
  );

COMMENT ON TABLE diet_trial_foods IS
  'B-417 §3.2 (D3): the ALLOWED SET for a diet trial — every food the trial '
  'permits, with its role and its DATED membership. This is the sanctioned set '
  'that PR 5''s single off-diet predicate (lib/dietTrial.ts) computes against; '
  'diet_trials.food_item_id is display-only legacy (§4.1) and no computation '
  'reads it.';

COMMENT ON COLUMN diet_trial_foods.food_label IS
  'B-417 §3.2: captured at write time because the row does not survive the food '
  '(ON DELETE CASCADE) and the snapshot readers do — a vet report rendering a '
  'completed trial must still be able to name what was allowed.';

COMMENT ON COLUMN diet_trial_foods.allowed_from IS
  'B-417 §3.2: membership is DATED. An edit to the allowed set must never '
  'retroactively re-score prior feedings — see the migration comment.';


-- ============================================================
-- 3. One active trial per pet — now enforced (§3.3)
-- ============================================================
-- DESTRUCTIVE STEP. 001_schema.sql:161 created idx_diet_trials_active as a
-- PLAIN, NON-UNIQUE partial index. The v0.9 spec asserted "the existing partial
-- index assumes [one active trial]" — it does not; nothing enforced anything.
--
-- Under the house's offline last-write-wins with no merge logic, two devices
-- each starting a trial produce two active rows with DIFFERENT ids, so LWW never
-- fires (it resolves conflicts on the same row, and these are not the same row).
-- The result is not a merge conflict but a set of silent, un-owner-fixable
-- failures:
--   • profile.tsx:177 uses .maybeSingle() -> PGRST116 -> caught at :209 with a
--     console.error, and the diet trial card RENDERS NOTHING;
--   • Home's trend reverts silently;
--   • the widget first-wins on an unordered query;
--   • report.ts describes trial A inside a window anchored to trial B.
-- And the owner cannot repair any of it, BECAUSE THE SURFACE THAT WOULD LET THEM
-- EDIT THE TRIAL IS THE ONE THAT STOPPED RENDERING.
--
-- Free right now, at zero live rows, and never free again. Two consequences to
-- carry forward:
--   • PR 3's "starting a second trial offers to complete the first" is now a
--     HARD SERVER CONSTRAINT, so the complete-then-start writes must be ORDERED.
--   • PR 2 needs a TERMINAL-ERROR branch: a 23505 here is permanent, not
--     retryable, and the existing syncPending* shape has no such branch — it
--     would retry the doomed insert forever.
--
-- The index is dropped and recreated rather than a UNIQUE constraint added,
-- because the constraint form cannot be partial (WHERE status = 'active') and
-- the uniqueness must apply ONLY to active trials — a pet is expected to
-- accumulate many completed and abandoned ones.
DROP INDEX idx_diet_trials_active;

CREATE UNIQUE INDEX idx_diet_trials_active
  ON diet_trials(pet_id)
  WHERE status = 'active';
