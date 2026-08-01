# B-618 PR 1 — dose-denominated medication course length (schema)

**Date:** 2026-08-01

Shipped via **#531**. Migration `049_medication_dose_duration.sql`, applied live. Schema-only per migration isolation — one `.sql` file in the diff, no client code, and PRs 2–4 deliberately not started.

## What shipped

`medications.target_duration_doses` (nullable `INTEGER`), the sibling of `target_duration_days`, plus two CHECKs and a `COMMENT ON COLUMN`:

- `medications_target_duration_doses_positive` — `target_duration_doses IS NULL OR target_duration_doses > 0`
- `medications_one_duration_denomination` — `target_duration_days IS NULL OR target_duration_doses IS NULL`

Applied to `aigchluqluzuhtbfllgh` via the MCP `apply_migration` (history name `medication_dose_duration`), per the edge-deploy runbook. Both CI jobs green.

## Why a second column rather than a `(value, unit)` discriminator

This was the one real design decision in the PR, and it was decided by the isolation rule as much as by the merits.

Every shipped reader — `generate-report`, `generate-signal`, the profile card, the `lib/sync.ts` select — names `target_duration_days` and means days by it. A `target_duration` + `target_duration_unit` pair would have forced one of two bad outcomes: rewrite all of those inside a schema PR (violating the rule that a migration ships alone), or leave a column whose meaning depends on a sibling column that half the readers do not select. Two explicitly-named columns keep every existing reader correct and *unchanged*: a days course is exactly what it was, and a doses course simply reads NULL to anything that only knows days. Spec §7 had already verified that degradation is honest rather than wrong — the report renders "since &lt;start&gt;" and the signal engine reads `diet_trials` only.

The cost is named rather than hidden (PR body, future-self review): a *third* denomination — a taper's per-phase schedule, explicitly out of scope per §2 — would make a third column the wrong answer and force the discriminator refactor this PR declined. The mutual-exclusion constraint is what keeps that refactor cheap: it guarantees at most one column is ever populated, so a future migration to `(value, unit)` is a mechanical coalesce with no ambiguous rows to resolve.

## Why the mutual-exclusion CHECK, stated as an invariant

Three states are meaningful — both NULL (ongoing, unchanged and the dominant production shape), days only (every existing fixed row), doses only (new). The fourth state, both set with the two disagreeing about when the course ends, has **no correct rendering**, so the database refuses it rather than leaving every consumer to reconcile it at read time. Spec §8 #8 asks for exactly this as an acceptance criterion.

`> 0` is the same argument one layer down: a 0-dose course is not a shorter course, it is an absent one, and the honest encoding of absence is NULL. Letting 0 through would render "Dose 0 of 0" on a card that must never claim completion.

## The constraints were exercised, not asserted

The DDL was not taken on trust. All six cases ran against the real `public.medications` inside a self-aborting `DO` block — a terminating `RAISE EXCEPTION` rolled every write back, and `select count(*) where drug_name = 'ZZ_constraint_probe'` returned **0** afterwards:

| Attempted insert | Expected | Result |
|---|---|---|
| `days = 14` **and** `doses = 28` | refused | ✓ refused on `medications_one_duration_denomination` |
| `doses = 0` | refused | ✓ refused |
| `doses = -1` | refused | ✓ refused |
| `doses = 28` only | accepted | ✓ accepted |
| `days = 14` only | accepted | ✓ accepted (regression) |
| neither (ongoing) | accepted | ✓ accepted (regression) |

The last two are the ones that matter for a schema PR on a live table: existing regimens are untouched. Live state at apply time was 3 rows, 1 days-denominated, 0 doses-denominated — so the new table-level CHECK could not fail validation, because `target_duration_doses` was NULL on every row by construction.

`get_advisors` (security **and** performance) ran after apply: **no new lint**. Every finding predates this migration, including the two on `medications` (`medications_owner` auth-RLS-initplan WARN, `medications_medication_item_id_fkey` unindexed FK) which both date from migration 020. This PR adds no index, policy or table, so it introduces no advisory surface at all.

## D7 is enforced structurally here — and only here

Nothing in the migration is capable of setting `status`, so at the schema layer there is no path to completion or stop language. That is the whole of what this PR can do for D7, and it is worth being precise about the limit: **nothing stops a *consumer* rendering "complete" at `n >= target`.** D7 is enforced by the card, in PR 4. The `COMMENT ON COLUMN` carries the rule (along with D1's therapy-delivered count and D6's one-predicate rule) specifically so the session that builds that card meets the constraint while reading the schema, rather than having to find it in a spec.

## Falsification attempts

The spec's §117 posture makes the `adversarial-reviewer` subagent optional here — no statistical engine is touched and this PR ships no predicate. Per the DoD's "state the counterexample you tried":

- *Tried the row that would let a refused tail read a course as complete* — a regimen carrying both `days = 14` and `doses = 28`, where a reader picking the wrong column reports a finished course on an unfinished bottle. **Refused by the database**, so that reconciliation bug cannot be written into the data at all.
- *Tried `doses = 0` to manufacture an instantly-complete course.* **Refused.**
- The attempt that does **not** hold at this layer, stated so PR 4 inherits it rather than rediscovering it: nothing in the schema prevents a consumer from rendering completion language once the count reaches the target.

## What PR 2 inherits

The local SQLite mirror (`MEDICATION_SCHEMA_SQL`, B-424's schema-constant rule — never inline DDL) is client code and is excluded from this PR by isolation, along with the `Regimen`/`RegimenWritePayload` types, `buildRegimenPayload`, the `lib/sync.ts` column and the `dosesTowardTarget` predicate with its §4 tests. Until PR 2 lands the column exists server-side with no client path reading or writing it, which is **inert, not broken** — `medications` is already in `LOCAL_WIPE_TABLES`, so no wipe change is needed either.

One pairing worth carrying: B-441 (the `regimenDaysElapsed` UTC/DST over-count) is a *soft* pair per D4, not a gate. The dose counter never touches `daysElapsed` — but the compliance line on the same card does, so the regimen card is not fully honest until both land. B-441 shipped 2026-07-31 as B-614 PR M0, so that half is already done.

## Residuals

None filed. No new secret, no new reader, no new grant — an integer the owner typed, on an existing owner-scoped row, under unchanged RLS and the existing delete-account cascade.
