-- ============================================================
-- Migration 068: diet_trials window provenance — the three columns that
-- record a MOVED window (CUL-1037 / trial-window PR 1)
--
-- Spec: docs/nyx-trial-extension-requirements.md §5.1 (what the report must be
--       able to say), D2(a) (three columns, not a history table),
--       D4(a) (the vet-directed boolean), TE-4 (a window that moved is a
--       clinical fact and the record must keep it).
-- Track home: CUL-156. Blocks CUL-1039 (PR 2, the write path) and
--             CUL-1041 (PR 4, the vet report).
-- ============================================================
--
-- WHAT THIS IS. Three nullable columns on diet_trials, plus one backfill
-- statement. Nothing else changes: no index, no policy, no trigger, no CHECK,
-- no existing column altered.
--
--   target_duration_days_initial INTEGER      -- the window the trial was designed against
--   target_duration_set_at       TIMESTAMPTZ  -- when the window last moved, or NULL
--   target_duration_vet_directed BOOLEAN      -- owner reports the vet directed it, or NULL
--
-- WHY IT EXISTS. target_duration_days is overwritten in place, so today an
-- 8-week trial extended on day 56 is byte-identical, everywhere, to a 12-week
-- trial started on day 1 (TE-4). A clinician reading "day 60 of 84" has no way
-- to learn the window was eight weeks until day 56 — and *that the signs had
-- not resolved at eight weeks* is the finding the extension is evidence of. §5.1
-- is the sentence these columns exist to let the report render:
--
--     Elimination diet trial — day 60 of 84. Window extended from 56 days on
--     19 Sep (day 56), owner reports at the vet's direction.
--
-- WHY THREE COLUMNS AND NOT A HISTORY TABLE (D2a, ruled 2026-09-17). This table
-- has already ruled the identical question once: target_protein_set_at's
-- contract (migration 053, TP-3) is "an edit is disclosed here, never versioned
-- — one value, whole-trial." A diet_trial_window_changes child table buys the
-- middle steps of a multi-step extension, which is marginal, at the cost of a
-- table, its RLS, its SQLite mirror, its LOCAL_WIPE_TABLES entry and its sync
-- pass. The same disclosure-not-versioning contract is carried here.
--
-- "OWNER REPORTS", NOT "THE VET SAID" (D4a, §5.1). The app cannot verify a vet
-- instruction and must never assert one, so target_duration_vet_directed records
-- that the OWNER checked a box, never that a vet was consulted. The report
-- renders the attribution clause only when the value is TRUE.
--
-- THE TWO-SIDED RULE — an unchecked box is SILENCE, not a claim (§5.1). NULL
-- and FALSE are deliberately indistinguishable downstream: both mean "no
-- attribution", and NEITHER may ever render as "the owner did this on their
-- own". This mirrors the diet-trial spec's off-diet marking rule — a mark's
-- absence is never a verdict — and it is the one thing PR 4 can get wrong in a
-- way a clinician would act on. A migration cannot enforce it; it is carried by
-- the render and its tests, and stated here because this is where the column's
-- meaning is defined.
--
-- THE PAIRED-NULL WRITE CONTRACT (enforced in PR 2, not here).
-- target_duration_set_at is NULL whenever the window has never moved, and is
-- stamped on EVERY change. It is the predicate every reader switches on: "did
-- this window move?" is `target_duration_set_at IS NOT NULL`, never a comparison
-- of initial against current (two equal numbers are also what a corrected typo
-- looks like). This migration deliberately adds NO CHECK, on 053's reasoning: a
-- Postgres CHECK would not cover the SQLite mirror PR 2 must handle anyway, and
-- the dangling state it would forbid is inert by construction, since every
-- reader resolves set_at first and, on NULL, renders no window-change clause and
-- never reads the other two.
--
-- WHY BOOLEAN AND NOT AN ENUM. The question is one bit the owner answers about
-- one event. A richer provenance vocabulary ("vet directed / owner chose / a
-- second opinion") is a product question nobody has asked, and §5.1 renders
-- exactly one clause. TE-3 makes the window forward-only in v1, so there is no
-- second direction to qualify either.
--
-- ------------------------------------------------------------
-- WHAT THE BACKFILL BUYS, AND WHAT IT DOES NOT
-- ------------------------------------------------------------
-- Unlike 053's deliberate no-backfill, this one runs — target_duration_days is
-- INTEGER NOT NULL, so every existing row has an honest value to copy, and for
-- an existing trial "the window it was designed against" is the window it has.
--
-- What it does NOT buy, and PR 2 must not assume it does:
--
--   (1) The column is NOT universally non-null after this. A DEFAULT cannot
--       reference a sibling column, so any trial created between this apply and
--       PR 2 shipping lands with initial = NULL. PR 2's write path therefore
--       stamps COALESCE(target_duration_days_initial, target_duration_days)
--       before overwriting target_duration_days, and every reader treats NULL as
--       "not recorded" rather than as a number.
--
--   (2) It does not recover history that predates the column. A trial already
--       extended through the shipped milestone path (extendTrial,
--       lib/dietTrialSetup.ts) has a CURRENT target that is not its designed
--       one, and copying it records the extended value as "initial". This is not
--       a cost of backfilling — with or without it, `initial` can only ever mean
--       "the value immediately before the first RECORDED change", because no
--       earlier value was ever written down. Stated so PR 4 does not read the
--       column as a guarantee about the trial's origin.
--
--       Measured at apply time, on the only sound test available: an extension is
--       an UPDATE and set_updated_at() fires on every UPDATE, so a row whose
--       updated_at still sits at its created_at has never been edited at all and
--       its current target IS its designed one. Of 3 live rows, 2 are in that
--       state. The third has been edited at least once and the record cannot say
--       whether that edit moved the window — which is exactly the gap these
--       columns close, and exactly why it cannot be closed retroactively.
--       ("The window has not yet elapsed" is NOT such a proof and must not be
--       used as one: a 56→70 extension on day 56 also leaves started_at + 70 in
--       the future.)
--
-- ------------------------------------------------------------
-- RLS / PRIVACY (T&S). No change.
-- ------------------------------------------------------------
-- Three new columns on an existing pet-scoped table whose policies
-- (001_schema.sql) are unchanged and already cover every column — Postgres RLS
-- is row-scoped, so a policy admits or refuses the whole row and a new column is
-- reachable only through the same pet-ownership check that already gates
-- target_duration_days. No new reader, grant, view, function, index or surface;
-- no service-role path; rides the existing ON DELETE CASCADE from pets, so
-- account deletion and export need no change. The values are a day count, a
-- timestamp, and one owner-checked boolean — no health-photo or free-text note
-- class of data, and nothing here is reachable from the unauthenticated share
-- path (unshipped).
--
-- ------------------------------------------------------------
-- Migration Safety Pre-flight
-- ------------------------------------------------------------
--   Destructive y/n:  n. Purely additive — three nullable columns with no
--                     default, no CHECK. Drops, renames or alters no existing
--                     column, constraint, index, policy or row. An ADD COLUMN of
--                     a nullable column with no default is O(1) in PG 11+ (no
--                     table rewrite). The backfill is an UPDATE of a
--                     just-created, all-NULL column — it can overwrite nothing.
--   Affected tables:  public.diet_trials. Verified this session, not copied
--                     forward (the issue's pre-flight said 1 row as of
--                     2026-09-16; it is 3):
--                       SELECT count(*) FROM diet_trials;  -> 3
--                     All 3 status 'active', targets 42–56, zero NULL targets.
--                     Row count does not gate this migration: all three columns
--                     are nullable with no default and no CHECK, so no value is
--                     validated against existing rows. Confirm the columns are
--                     not already present:
--                       SELECT column_name FROM information_schema.columns
--                        WHERE table_schema='public' AND table_name='diet_trials'
--                          AND column_name IN ('target_duration_days_initial',
--                              'target_duration_set_at',
--                              'target_duration_vet_directed');
--                       -- expect 0 rows.
--   Backfill:         YES — the statement below, load-bearing (see "WHAT THE
--                     BACKFILL BUYS" above). Idempotent via the IS NULL guard,
--                     so a re-run cannot overwrite a value PR 2 later wrote.
--                     The other two columns stay NULL, correctly: no window has
--                     ever moved, so there is no date to stamp and no
--                     attribution to record.
--   Rollback plan:    reversible, one statement:
--                       ALTER TABLE public.diet_trials
--                         DROP COLUMN IF EXISTS target_duration_days_initial,
--                         DROP COLUMN IF EXISTS target_duration_set_at,
--                         DROP COLUMN IF EXISTS target_duration_vet_directed;
--                     Loses only window provenance recorded after apply; every
--                     trial, food, exposure count and coverage denominator
--                     survives untouched — nothing reads these columns until
--                     PR 4, and none of them is an input to any count.
-- ============================================================

ALTER TABLE public.diet_trials
  ADD COLUMN IF NOT EXISTS target_duration_days_initial INTEGER,
  ADD COLUMN IF NOT EXISTS target_duration_set_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS target_duration_vet_directed BOOLEAN;

-- The backfill. Guarded on IS NULL so it is idempotent and can never overwrite a
-- value the PR 2 write path has since stamped.
UPDATE public.diet_trials
   SET target_duration_days_initial = target_duration_days
 WHERE target_duration_days_initial IS NULL;

COMMENT ON COLUMN public.diet_trials.target_duration_days_initial IS
  'CUL-1037 §5.1: the window this trial was designed against, in days — what target_duration_days held before the first RECORDED change (TE-4: a window that moved is a clinical fact and the record must keep it). Backfilled = target_duration_days for every row live at migration time. NOT a guarantee about the trial''s origin: a trial extended through the milestone path before this column existed records the extended value, and a trial created between 068 and the PR 2 write path lands NULL (no DEFAULT can reference a sibling column). Readers treat NULL as "not recorded", never as a number, and never infer "the window moved" by comparing this against target_duration_days — that question is target_duration_set_at IS NOT NULL.';

COMMENT ON COLUMN public.diet_trials.target_duration_set_at IS
  'CUL-1037 §5.1: when the trial''s window last moved — the provenance hook the vet report discloses ("Window extended from 56 days on 19 Sep (day 56)"). THE PREDICATE for "did this window move?"; every reader switches on this, not on a comparison of initial against current. Paired-null WRITE contract (enforced in the PR 2 write path, not by a DB CHECK): NULL whenever the window has never moved, stamped on every change. An edit is disclosed here, never versioned — one value, whole-trial (D2a, on migration 053 / TP-3''s precedent). NULL here means the other two columns are not read at all.';

COMMENT ON COLUMN public.diet_trials.target_duration_vet_directed IS
  'CUL-1037 §5.1 / D4a: TRUE means the OWNER checked a box saying the vet directed the change — never that a vet was consulted, which the app cannot verify and must never assert. The report renders the attribution clause as "owner reports at the vet''s direction" only on TRUE. THE TWO-SIDED RULE: NULL and FALSE are indistinguishable downstream and both mean SILENCE — an unchecked box is never rendered as "the owner did this on their own" (the diet-trial spec''s rule that a mark''s absence is never a verdict). Read only when target_duration_set_at is non-null.';
