-- ============================================================
-- Migration 081: where each weight reading came from (Engines v3 PR-18)
--   EN-8 part 1 (CUL-1412): `weight_checks.source` and `source_basis`, with
--   the W2 backfill.
-- See: docs/nyx-weight-lane-requirements.md §0 (W1 A, W2 home scale, both PM
--      2026-09-28), §4.1 (the three sources), §7 (this migration's outline);
--      docs/engines-v3-critique-2026-09.md GAP-20, BRK-11, R-5; migrations 024
--      and 072.
-- ============================================================
--
-- SCHEMA ONLY, plus the sync columns. Nothing reads `source` until PR-19 (the
-- lane in generate-signal, behind the Engines v3 flag) and nothing lets an owner
-- change it until PR-37 (the correction sheet). Applying this changes nothing an
-- owner can see, so the flag does not gate it (EN-F: additive schema nothing
-- reads is not flagged).
--
-- ------------------------------------------------------------
-- THE TWO COLUMNS
-- ------------------------------------------------------------
-- source: where the reading was taken (spec §4.1).
--   clinic      at the vet. Anchors a change and counts as confirmed on its own.
--   home_scale  on a home scale. Anchors, and confirms only with a second
--               consecutive reading (PMD-9, spec §5.3).
--   estimate    an estimate. Never anchors, never counts, never plots (WG-3).
--               Under W1 A no entry path writes it: the profile field stays a
--               snapshot (072 keeps what it displaces) and never becomes a row
--               here. The one way in is an owner correcting a reading down to "a
--               guess" (PR-37), and a reading so marked stays listed as not
--               counted (spec §4.2, attack 6).
--
-- source_basis: how `source` was decided. It never changes what a source may do;
-- it lets the correction sheet say "We labelled this from how it was logged".
--   entry   derived from the entry path by a client that knows this column (the
--           log weigh-in writes home_scale; the after-visit row writes clinic).
--   owner   the owner corrected it.
--   legacy  labelled by rule, not by the writer: every row on file before this
--           migration, and every row a build that predates this column writes.
--
-- TEXT + CHECK rather than a Postgres enum, as 079: a later value is a constraint
-- swap in one transaction, not ALTER TYPE … ADD VALUE.
--
-- ------------------------------------------------------------
-- THE BACKFILL IS THE COLUMN DEFAULT (W2, PM 2026-09-28)
-- ------------------------------------------------------------
-- Every existing row came through the log weigh-in or its edit screen: no other
-- writer of weight_checks exists (lib/weight.ts insertWeightCheck and
-- updateWeightCheck; hydrate only mirrors server rows down). The entry-path rule
-- therefore gives home_scale, known rather than guessed, and home scale is the
-- class that needs confirmation anyway. `ADD COLUMN … NOT NULL DEFAULT <const>`
-- fills every existing row in the same statement, so no separate UPDATE runs and
-- no row's updated_at moves (no trigger fires on ADD COLUMN).
--
-- Consequence the spec states and this migration does not hide: Nyx's Sep 16
-- 3.73 kg reads "on a home scale" until the owner corrects it to "at the vet"
-- (spec §0 W2, F4).
--
-- ------------------------------------------------------------
-- WHY THE DEFAULTS STAY AFTER THE BACKFILL
-- ------------------------------------------------------------
-- Installed builds (1.2.0 and earlier) upsert weight_checks without either
-- column. With NOT NULL and no default, every weigh-in from an installed phone
-- would fail its push with 23502 and quarantine on the device: the reading
-- would never reach the server. So both defaults are permanent. An installed
-- build writes only through the log weigh-in, so home_scale is the entry-path
-- answer for its rows too, and `legacy` says honestly that the server, not the
-- writer, labelled it. A current build always sends both columns explicitly.
--
-- An installed build's EDIT of a weight upserts only the columns it knows, so
-- PostgREST's merge leaves an owner's correction (source_basis = 'owner') in
-- place: the old build cannot reset it.
--
-- ------------------------------------------------------------
-- WHAT THIS DELIBERATELY DOES NOT ADD
-- ------------------------------------------------------------
--   · No CHECK pairing source = 'estimate' with source_basis = 'owner', though
--     that is the only legal way in under W1 A. A violating write would be a
--     client bug, and a CHECK would answer it by refusing the whole reading with
--     23514, which the client quarantines: the weight never lands. Refusing a
--     reading to protect its label fails toward loss (C-38: never brick what the
--     guard failed to protect). The pairing is PR-37's writer contract, proven by
--     its tests.
--   · No change to 072. Its table gets its first reader in PR-19, and
--     guards/weightDisplacements.test.ts gains that reader's entry in the PR
--     that ships it (C-32: a registry entry lands with the code it admits).
--   · No planned-loss column. W6 A makes it a plan-row value on the after-visit
--     write (PR-37 or VV's own schema line), never a weight_checks field.
--   · No index. Every reader already fetches a pet's readings by pet_id
--     (idx_weight_checks_pet) and filters source in memory; the table holds a
--     handful of rows per pet.
--
-- ------------------------------------------------------------
-- PRIVACY LINE (R-5; the vet visits §6.1 shape)
-- ------------------------------------------------------------
--   Cascade:     unchanged. weight_checks cascades from pets (and so from
--                auth.users, B-039) and from its parent event (024). Two more
--                columns on a row that already goes.
--   RLS:         unchanged. `weight_checks_owner` is FOR ALL with USING only,
--                which Postgres reuses as the WITH CHECK on INSERT and UPDATE, so
--                every verb stays pet-owner scoped. A column needs no policy of
--                its own.
--   Same-pet:    unchanged. Neither column references another row, so there is
--                nothing new for a trigger to check.
--   Wipe list:   unchanged. weight_checks is already in LOCAL_WIPE_TABLES; the
--                local mirror gains both columns in lib/localSchema.ts.
--   Model:       no model reads either column in this PR. Ask's and the report's
--                weight reads name their columns (neither selects `source`). When
--                PR-19 hands a model the source, it is the fixed WORD from a
--                closed set, never free text.
--   Export and label: the source is weight data, already declared under Health
--                & Fitness → User Content in docs/app-privacy-answers.md (the
--                health log, weight_checks named). No new data class, no new
--                label; an export built later carries the column with its row.
--
-- ------------------------------------------------------------
-- Migration Safety Pre-flight
-- ------------------------------------------------------------
--   Destructive:  n. Two added columns with constant defaults and CHECKs; no
--                 column, type, table or row is dropped, renamed or retyped.
--   Rollback:     ALTER TABLE weight_checks DROP COLUMN IF EXISTS source_basis;
--                 ALTER TABLE weight_checks DROP COLUMN IF EXISTS source;
--                 (Loses any owner corrections made after PR-37 ships; before
--                 it, both columns hold only the defaults and dropping them loses
--                 nothing. Roll the client back first: a current build pushes
--                 both columns and a push naming a dropped column fails.)
--   Backfill:     the column defaults (above). Every existing row becomes
--                 source = 'home_scale', source_basis = 'legacy'.
--   Row check before applying:
--                 SELECT count(*) FROM weight_checks;
--   and after (expect the same total in one row, and zero NULLs):
--                 SELECT source, source_basis, count(*)
--                   FROM weight_checks GROUP BY 1, 2;
-- ============================================================

ALTER TABLE weight_checks
  ADD COLUMN source TEXT NOT NULL DEFAULT 'home_scale'
    CONSTRAINT weight_checks_source_check
    CHECK (source IN ('clinic', 'home_scale', 'estimate')),
  ADD COLUMN source_basis TEXT NOT NULL DEFAULT 'legacy'
    CONSTRAINT weight_checks_source_basis_check
    CHECK (source_basis IN ('entry', 'owner', 'legacy'));

COMMENT ON COLUMN weight_checks.source IS
  'Where the reading was taken: clinic | home_scale | estimate (EN-8 spec §4.1). '
  'An estimate never anchors a change, never counts and is never plotted. The '
  'default is the entry-path answer for builds that predate this column (081).';

COMMENT ON COLUMN weight_checks.source_basis IS
  'How source was decided: entry (derived from the entry path by a current build) '
  '| owner (corrected by the owner) | legacy (labelled by rule: rows before 081 and '
  'rows from builds that predate it). Never changes what a source may do.';
