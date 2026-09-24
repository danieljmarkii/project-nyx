# Trial window PR 1 — migration 068: the three columns that record a moved window

**Date:** 2026-09-17 · **Issue:** CUL-1037 · shipped via #866

The first build PR of the diet-trial extension track (CUL-156), against
`docs/nyx-trial-extension-requirements.md` v2.1 §7's PR plan. Schema only,
per the house rule that a schema change never rides with UI work.

## What shipped

Three nullable columns on `diet_trials` — `target_duration_days_initial
INTEGER`, `target_duration_set_at TIMESTAMPTZ`, `target_duration_vet_directed
BOOLEAN` — plus an idempotent backfill of the first from `target_duration_days`,
and three `COMMENT ON COLUMN` carrying the contracts. The local SQLite mirror
gains the same three in both places that matter: `DIET_TRIAL_SCHEMA_SQL`
(`lib/dietTrialMirror.ts`, fresh installs) and `COLUMN_UPGRADES`
(`lib/localSchema.ts`, already-installed devices).

The problem, from the spec's TE-4: `target_duration_days` is overwritten in
place, so an 8-week trial extended on day 56 is byte-identical, everywhere, to
a 12-week trial started on day 1 — and *that the signs had not resolved at
eight weeks* is precisely the finding the extension is evidence of. D2(a) ruled
three columns rather than a `diet_trial_window_changes` child table, on this
table's own precedent: `target_protein_set_at` (migration 053, TP-3) already
settled the identical question as *an edit is disclosed here, never versioned*.

Nothing reads or writes the columns yet. They are **declared, not yet synced**.

## Three findings the issue did not carry

**1. The live row count is 3, not the issue's "1 live row as of 2026-09-16."**
All three `active`, targets 42–56, zero NULL targets. Not a gate — nullable, no
default, no CHECK, so nothing is validated against existing rows — but the
pre-flight in the PR carries the verified number rather than the copied one. A
pre-flight that is not true is not a pre-flight.

**2. The issue's stated reason for the local DDL does not hold, and the half
that does was unnamed.** It says the mirror's `CREATE TABLE` is owed "or the
local row and the remote row disagree on first hydrate." The hydrate is an
explicit column list (`lib/sync.ts:2905-2912`), so a column absent from *that*
list never comes down, DDL or no DDL — this PR does not make the rows agree,
and claiming it did would have been a comment writing a cheque the code does
not cash (C-38). Two corrections: the `diet_trials` DDL lives in
`lib/dietTrialMirror.ts`, not `lib/localSchema.ts`; and the load-bearing half
is `COLUMN_UPGRADES`, which the issue does not mention at all. `diet_trials`
predates this build, so `CREATE TABLE IF NOT EXISTS` is a no-op on an installed
device and only that path can add the columns — without it, PR 2's local
`UPDATE diet_trials SET target_duration_days_initial = ?` throws *no such
column* on every upgrading phone while working perfectly on a fresh simulator.

The issue's *conclusion* was right for a different reason than the one it gave.
What is still owed, and is PR 2's per spec §7: the hydrate select, the push
mapper, and the `INTEGER` ↔ `BOOLEAN` coercion the local mirror needs because
SQLite has no boolean type. Worth naming that `dietTrialRowToRemote` is a
*completeness* mapper whose key-set test is a **hardcoded list** — so it will
not catch the omission, exactly the C-32 shape where a guard's registry is
green over the thing it exists to catch.

**3. The backfill is safe, and the case that would have made it unsafe was
checked rather than assumed.** A trial already extended through the shipped
milestone `extendTrial` path has a *current* target that is not its designed
one, so copying it records the extended value as "initial" — a false claim on a
vet-facing surface. That turns out not to be a cost of *backfilling*: with or
without it, `initial` can only ever mean *the value immediately before the
first **recorded** change*, because no earlier value was ever written down.
Backfill and no-backfill produce identical reports. So the ruling stands, and
what the backfill actually buys — no *existing* row is NULL — is now written
down beside what it does not buy: a trial created between this apply and PR 2
shipping still lands NULL, because no `DEFAULT` can reference a sibling column.
PR 2's write path needs `COALESCE(target_duration_days_initial,
target_duration_days)`.

## A false inference caught in my own header, before the reviewer saw it

The migration header first claimed that of the 3 live rows, "2 have not yet
reached their target and so cannot have been extended at all." That is wrong: a
56→70 extension on day 56 also leaves `started_at + 70` in the future, so
"window not yet elapsed" is not a proof of anything. The sound test is that an
extension is an `UPDATE` and `set_updated_at()` fires on every `UPDATE`, so a
row whose `updated_at` still sits at its `created_at` has never been edited at
all. Re-measured: 2 of 3 are in that state; the third has been edited at least
once and the record cannot say whether that edit moved the window — which is
exactly the gap these columns close, and exactly why it cannot be closed
retroactively. The corrected claim is strictly more useful than the wrong one.

## The contracts, recorded where the meaning is defined

- **The paired-null write contract** (enforced in PR 2, not by a DB CHECK —
  053's reasoning: a Postgres CHECK would not cover the SQLite mirror PR 2 must
  handle anyway). `target_duration_set_at` is NULL whenever the window has
  never moved and is stamped on every change. It is **the predicate**: *did
  this window move?* is `set_at IS NOT NULL`, never `initial <>
  target_duration_days` — two equal numbers are also what a corrected typo
  looks like. One predicate so two surfaces cannot disagree by re-deriving it
  (the §5.3 / CUL-746 lesson, applied preemptively).
- **The two-sided rule** (§5.1). `target_duration_vet_directed` records that
  the **owner** checked a box, never that a vet was consulted — the app cannot
  verify a vet instruction and must never assert one. NULL and FALSE are
  indistinguishable downstream and both mean **silence**; neither may ever
  render as "the owner did this on their own". This is the one thing PR 4 can
  get wrong in a way a clinician would act on, so it lives in the column
  comment rather than only in the spec.

## Verification

`tsc --noEmit` clean · lint clean · `npm test` **388 suites / 8394 tests**
green.

Tests proven by mutation, not by reading (C-18). Deleting the three
`COLUMN_UPGRADES` entries reds 2 tests; deleting the three DDL lines reds 4,
including the fixture's own non-vacuity floor. Both mutations were run and
restored. The upgrade-path test builds `diet_trials` the way a pre-068 build
actually left it — the DDL with those three lines stripped, with an assertion
that the strip removed exactly three (C-36's non-vacuity floor: a fixture that
silently kept the columns would make every assertion after it green over
nothing) — then asserts the exact `UPDATE` shape PR 2 will issue throws *no
such column* before the upgrade and succeeds after it.

One self-correction during the adversarial re-read: the floor's
`expect.not.arrayContaining` over the whole column set only fails when *every*
member is present, so it would have passed over a fixture that kept two of the
three. Tightened to a per-column assertion.

## Not applied

The migration is **not applied to the live database**. The issue's TL;DR makes
that a PM approval, so it is held despite the standing convention that backend
deploys run from the session. On approval: Supabase MCP `apply_migration`
(project `aigchluqluzuhtbfllgh`), then `get_advisors` for security and
performance.

## The `rls-privacy-reviewer` pass — PASS, with four things it caught

Mandatory per the issue, and the reviewer did the thing that makes it worth
running: it built a PG16 cluster, replayed the real schema (001's `diet_trials`
+ policy, 040/053/066's adds, 067's `SECURITY DEFINER` trigger, Supabase's
bootstrap grants), seeded two tenants, applied 068 verbatim from the repo file,
and attacked it — rather than reasoning about the header's claim.

**Held, each against an executed attack:** user-B JWT selecting *only the three
new columns* from pet-A's trial by known id → 0 rows (`diet_trials_owner` is
row-scoped and genuinely column-agnostic); `anon` → 0 rows; cross-tenant
`INSERT` / `UPDATE` / re-parent → `42501` on the USING-reuse `WITH CHECK` that
067 verified and 068 does not split; zero column-level ACLs, no view, no RPC,
and every server + client reader on an explicit column list — including the
`ask` LLM boundary and the widget's App Group snapshot; PR 2's exact write shape
against a row already violating 066's link invariant → `UPDATE 1`, no `RAISE`,
so no C-31 message leak (067's narrowed `IS DISTINCT FROM` guard short-circuits
— it notes 068 would have *bricked* the rows had it landed between 066 and 067);
the backfill cannot cross a tenant (per-row self-copy, no join) and cannot
overwrite (re-run over a stamped value → `UPDATE 0`); deleting the `auth.users`
row cascaded all three columns away, and both deletion halves are structurally
column-agnostic.

**Four advisories, all fixed on this branch.** Three were corrections to claims
I had written:

1. **The backfill bumps `updated_at` on every row, and the pre-flight said it
   altered none.** `trg_diet_trials_updated_at` (001:281) fires on the backfill
   `UPDATE` — verified in the repo, not taken on trust. `updated_at` is the LWW
   sync basis, so every device re-pulls the 3 rows on next hydrate. Benign,
   because `hydrateDietTrials` writes under `WHERE diet_trials.synced = 1` and
   cannot clobber an unpushed edit — but this repo treats an `updated_at` bump
   as load-bearing propagation elsewhere, so it is now disclosed in the
   pre-flight rather than left for whoever debugs the next watermark question.
2. **The mapper's completeness guard was blind to exactly the drift this PR
   creates, and fired against its fix.** `dietTrialRowToRemote`'s comment claims
   the key-set test asserts it forwards every server column; that test was a
   **hardcoded literal**. Proven by mutation: green with 068's columns absent
   from the mapper, red when PR 2 adds them. A guard that is green on the drift
   and red on the repair is worse than none. Rewritten to derive the expected
   set from the DDL the repo actually executes (C-38), with a
   `PENDING_MAPPER_COLUMNS` registry naming CUL-1039 and **the empty set as the
   assertion** (C-32) — so a half-fix, a stale registry entry, and the original
   B-057 drift all red, while the complete PR 2 repair is green. All four states
   were run.
3. **Sensitivity was justified by data TYPE.** The header said "a day count, a
   timestamp and a boolean — no photo, no free text", which is 053's phrasing
   and the wrong test: this repo already rejected type when
   `ACTIVE_DIET_TRIAL_QUERY` excluded `indication` from the widget snapshot on a
   *meaning* basis. These columns' meaning is *the signs had not resolved at
   eight weeks* — a clinical inference. Rewritten, with the snapshot/share call
   handed explicitly to PR 2 and PR 4. The share-path sentence is also now
   marked do-not-carry-forward: it is true today and false by design at PR 4,
   which renders these columns into the report the token would unlock.
4. **"Export needs no change" was vacuous.** There is no export path in the tree
   at all (verified: zero hits). Now stated as vacuous rather than verified,
   with B-041 named as owing the enumeration.

The reviewer also left three things it could not settle from the repo, carried
into the PR's apply checklist: the live policy/grant state (`pg_policy` +
`pg_attribute.attacl` queries to run before apply), the header's row-count claim
(re-run at apply), and `get_advisors` after.

## Applied — 2026-09-17, PM-approved

Migration `068` is live on `aigchluqluzuhtbfllgh` as
`diet_trials_window_provenance`, applied via the Supabase MCP with the full
annotated file stored (the 066/067 convention — prior records store the whole
file, not the bare statements).

**Pre-apply gates, all four green.** The first one confirmed the red-team's
replay against production rather than trusting it: `diet_trials` carries exactly
one policy, `diet_trials_owner`, `polcmd = '*'` (FOR ALL), `polwithcheck IS
NULL` — so the `USING` expression is reused as the `WITH CHECK`, which is the
load-bearing behaviour 067 depends on — and that expression names only `pet_id`.
Column-level ACLs: 0. The three columns: absent. Rows: 3, zero NULL targets.

One thing worth recording about the gate query itself: the first attempt used
`with_check`, which is the `pg_policies` *view*'s column name. The `pg_policy`
*catalog* calls it `polwithcheck`, and the query errored rather than silently
returning something wrong. Worth knowing for the next pre-apply.

**Post-apply, every pre-flight expectation held:** 3 new columns present; 3 rows;
`target_duration_days_initial IS NULL` → 0; rows where initial `IS DISTINCT
FROM` target → 0 (the backfill is exact, not approximate); rows wrongly carrying
`set_at` or `vet_directed` → 0; policies still 1; column ACLs still 0; CHECK
constraints still 0. All three columns nullable with no default, typed
`integer` / `timestamp with time zone` / `boolean`. All three `COMMENT ON
COLUMN` landed with the `''` escaping intact.

**The disclosed side effect was verified, not just claimed.** The header says the
backfill bumps `updated_at` on every row via `trg_diet_trials_updated_at`.
Measured after apply: 3 of 3 bumped to apply time, 0 still at `created_at`. The
disclosure was accurate.

A consequence of that, worth stating because the header cites the measurement:
the pre-apply finding that 2 of 3 rows had never been edited **can no longer be
re-derived from the live database** — the backfill moved every row's
`updated_at`. The evidence survives only here and in the migration header, which
is where it was written down before the apply. That is the reason to measure
before, not after.

**`get_advisors` — nothing new.** Security returns two WARNs, both pre-existing
and both structurally impossible for a column add to have caused: a
`SECURITY DEFINER` `record_ai_usage` RPC callable by `authenticated`, and the
Auth leaked-password-protection setting. Performance returns the same shapes
`diet_trials` already had — an unindexed `food_item_id` FK (from 001), the
`auth_rls_initplan` re-evaluation that 27 tables share (from 001), and an unused
`idx_diet_trials_vet_visit` (from 066). This migration added no index and no
policy, and no finding names a new column.
