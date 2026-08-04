# Trial protein capture (B-704) PR 1 — the schema migration

**Date:** 2026-08-04

Shipped via **#594** (draft → merged this session).

## What shipped

Migration `supabase/migrations/053_diet_trials_target_protein.sql` — two nullable columns on `diet_trials`, applied live to production via the Supabase MCP (`apply_migration`, project `aigchluqluzuhtbfllgh`) and verified by reading `information_schema` + `col_description` back:

- `target_protein TEXT NULL` — the owner-stated trial protein, the word the vet named ("rabbit"). Canonical key (`canonicalizeProtein`, `lib/protein.ts`; TG-4 — a raw label never lands here). NULL = never set / cleared / "no single protein (hydrolyzed)", all meaning "no naming, derivation off" (TG-2).
- `target_protein_set_at TIMESTAMPTZ NULL` — set/last-changed provenance stamp (TP-3's disclosure hook — the report renders "protein confirmed day N" when it falls after day 1). NULL whenever `target_protein` is NULL.

Purely additive: nullable, no default, no index/FK/policy/trigger/constraint. The 2 live `diet_trials` rows take NULL — every trial keeps deriving its protein at read, exactly as today; no backfill. RLS unchanged (the existing pet-scoped `diet_trials` policies from 001 already cover the columns). `get_advisors` (security + performance) clean for this change — the only `diet_trials`-named advisories (unindexed `food_item_id` FK, the `diet_trials_owner` RLS init-plan warning) are pre-existing debt that predate the migration; the two new nullable columns add zero new advisories.

Local mirror + hydration + push payload are **PR 2**, not here (per the plan).

## What was decided

**TP-1 ruled E1 (PM, this session), overriding the provisional E2.** When nothing derives from the picked foods at setup, the "Trial protein" row still renders — empty/optional, tap to set — rather than hiding. The provisional E2 (hide) rested on "TP-4 gives the protein a permanent mid-trial home, and 'Not set' is the wrong register for a hydrolyzed patient." The PM overrode to E1: an always-present affordance. The E2 rationale's worry is answered by the picker's own first-class options (`No single protein (hydrolyzed)` / `Not sure — leave it unset`, §7.2), which carry the inapplicable-vs-incomplete distinction, so the empty row is a set-prompt, never a bare "Not set". Recorded in the spec §0 (TP-1 row) and propagated to §7.1, §8 (a draft empty-state sub-line), §9 A-2, and §10 so PR 3 has no contradictory E2 reference to build against. A-2 is closed.

**No DB CHECK for the paired-null invariant — a deliberate engineering call.** `target_protein_set_at` is NULL ⇔ `target_protein` NULL is a real invariant, and the house pattern (migration 049's mutual-exclusion CHECK) would make it a Postgres constraint. Declined here because: (1) the spec routes this track's invariants to a single predicate (`trialTargetProtein`, §4) plus PR 2 property tests (TG-1/TG-2/TG-4/TG-5) — that is the designated enforcement locus; (2) a Postgres CHECK would not cover the SQLite mirror PR 2 must handle anyway, so it wouldn't retire PR 2's work; (3) the state a CHECK would forbid (a `set_at` timestamp over a NULL protein) is **inert** downstream — every reader resolves the protein first and, on NULL, never reads `set_at` — so it corrupts no output, unlike 049's two-denomination row which every reader would have had to reconcile. Keeping PR 1 to exactly the two specified columns gives a clean two-column-drop rollback and a minimal, isolated schema diff. The invariant is documented in the migration header and both `COMMENT ON COLUMN` bodies as a PR-2 write contract.

## Verification / DoD

- Migration applied + read back: both columns present, `text` / `timestamp with time zone`, nullable, no default, comments persisted verbatim.
- `get_advisors` security + performance: no new advisory attributable to the change.
- Pre-push hook ran on the commit: `tsc --noEmit` clean; jest **203 suites / 4449 tests** green (the diff is SQL + markdown only, so no code path changed).
- Tests: N/A for new logic — schema migration + doc edit; the predicate + TG property tests are PR 2 (Engineer signs the exemption).
- Adversarial review: correctly not required for PR 1 — no clinical/statistical logic; that gate lives on PR 2 (the naming predicate) and PR 5 (the report render), per the plan.
- Persona sign-off: Data ✓ (schema integrity, never-permits/TG-1, paired-null contract) · Engineer ✓ (isolation, no over-build) · T&S ✓ (no new reader/grant, pet-scoped, rides delete cascade) · Designer N/A · Dr. Chen N/A.

## Residuals / next

- **PR 2** is the strict next step and gates the rest (1→2): local mirror in `DIET_TRIAL_SCHEMA_SQL` + hydration + push payload; `lib/trialProtein.ts`'s `trialTargetProtein(trial, primaryFoods)` stored-first resolver with `resolveTargetProtein` demoted to its fallback arm; TG-1/TG-2/TG-4/TG-5 tests incl. the property passes; `adversarial-reviewer` mandatory. After PR 2, PR 3 (setup-sheet E1 row + picker) ∥ PR 4 (mid-trial naming/editor); PR 5 (report render) after PR 2, and its production reach rides the **B-494 `generate-report` redeploy**, never its own.
