# Trial protein capture (B-704) PR 2 — local mirror, sync, and the stored-first predicate

**Date:** 2026-08-05
**Shipped via #595** (draft) · branch `claude/b704-pr2-trial-protein-g2kaaa`

## What this PR is

PR 2 of the B-704 trial-protein track (`docs/nyx-trial-protein-requirements.md` §10). PR 1 (#594) added the two columns to `diet_trials` server-side (migration 053, verified live this session — both nullable, present on the remote table). This PR is the client half: the local mirror, the sync round-trip, and the one stored-first predicate every consumer will read through to *name* a trial's protein.

The whole track rests on one invariant (§2): the stored protein **only NAMES what the record already counts — it never permits.** The allowed set (`diet_trial_foods`) stays the sole off-diet authority; `classifyFeeding` is untouched.

## What shipped

- **Local mirror** (`lib/dietTrialMirror.ts`, `lib/localSchema.ts`): `target_protein` + `target_protein_set_at` join `DIET_TRIAL_SCHEMA_SQL` (fresh installs), `COLUMN_UPGRADES` (the ALTER path for existing installs — `diet_trials` predates this build, so `CREATE TABLE IF NOT EXISTS` can't add them), the `LocalDietTrial`/`RemoteDietTrialUpsert` interfaces, and the `dietTrialRowToRemote` mapper. TIMESTAMPTZ→ISO/UTC TEXT locally, per the mirror's own convention.
- **Sync** (`lib/sync.ts`): `RemoteDietTrial` + `hydrateDietTrials` carry both columns through SELECT / INSERT / ON CONFLICT / params (hand-verified alignment: 23 cols, 21 `?` + `1,NULL`, 21 params — that upsert runs only on-device, so no jest test covers it). The push side rides `dietTrialRowToRemote` with no column allowlist, so it needed no separate change.
- **The one predicate** (`lib/trialProtein.ts`): `trialTargetProtein(trial, primaryFoods)` → `{ protein, source }`. Stored-first, derivation fallback, with provenance (`owner` | `derived`) because the vet report renders the two differently. `resolveTargetProtein` demoted from a public export to the non-exported derivation-fallback arm; the only direct importers (`generate-report`, `trialContaminant`, the test) now read through the predicate. A direct `resolveTargetProtein` import is now review-blocking (§4).
- **`report.ts` migrated behavior-neutrally**: the call swapped `resolveTargetProtein(primaryProtein)` → `trialTargetProtein({ target_protein: null }, [{ primaryProtein }]).protein`. `target_protein: null` short-circuits to the derivation arm, byte-identical to the old path; the stored value is threaded from the snapshot in PR 5. Renamed the colliding local const to `trialProteinTarget`.
- **Tests** (`lib/trialProtein.test.ts`, new): the TG spine — TG-1 (never permits, incl. the "off-diet food whose only protein IS the trial protein" crux and a regression tripwire that spreads the varying target into the trial object so a future permit-leak trips it), TG-2 (silence), TG-4 (canonical key + provenance), TG-5 (edit never moves a number). Mirror coverage (`dietTrialMirror.test.ts`): DDL round-trip of both columns + the mapper key-set/value assertions incl. the null case.

## The adversarial review, and the one thing it broke

`adversarial-reviewer` is mandatory here (this feeds the vet report's naming). It **PASSED every load-bearing invariant** — TG-1 never-permits (confirmed structurally: `target_protein` is read by *zero* code in `lib/dietTrial.ts`, and the two naive permit-leak threadings both trip the TG-1 property), TG-5 never-moves-a-number, the behavior-neutral `report.ts` migration (pinned by `report.test.ts`'s 300-case dirty cross-product), and the sync round-trip.

It **broke one defensive claim (TG-4).** `canonicalizeProtein` is a *keyer*, not a *validator*: a stored value like `'hydrolyzed'` → `'hydrolyzed'` (a non-null fixpoint) or `'NOT A REAL KEY!!! $$$'` → `'not a real key'` survived the stored arm as `source:'owner'` and would reach the vet report as an owner-confirmed protein. The `'hydrolyzed'` case is the pointed one: `lib/dietTrial.ts`'s `isUncharacterizedTrialDiet` already rejects that value (via `proteinSourceBase`, because a process word names no source), so the naming path and the antigen path *disagreed about the same value*. My docstring and the TG-4 test comment overclaimed ("junk drops to derivation" / "a raw label never survives"), and the corpus comment at `:137` was factually wrong (it claimed `'NOT A REAL KEY!!! $$$'` canonicalizes to null — it does not).

**Fix (commit `f118bab`):** gate the stored arm on `proteinSourceBase(...) != null` — the *same* usable-source notion the antigen path uses — so a process word drops to derivation instead of being named owner-confirmed. The **derivation arm stays plain `canonicalizeProtein`** (the historical report derivation, pinned by `report.test.ts`), so the PR-2 report migration remains byte-identical and the report never even reaches the new gate (it passes `target_protein: null`). Made the docstring and tests honest about the residual: arbitrary well-formed non-protein text still keys to a fixpoint and survives — closing *that* is the write path's job.

## Decisions

- **One notion of "a usable protein source", shared with the antigen path.** The stored arm uses `proteinSourceBase` (as `isUncharacterizedTrialDiet` does) rather than a weaker `canonicalizeProtein != null` check — the "one predicate, one keying function" lesson B-351 slice 5 paid for, applied preemptively.
- **The derived arm keeps `canonicalizeProtein` in PR 2**, deliberately, to hold the report migration behavior-neutral (the report property test pins the derived value to `canonicalizeProtein`, including `'hydrolyzed soy protein'`). Unifying the derived arm onto the source gate is a **report-render change → PR 5**, under the `vet-report-cold-read` gate. Recorded as B-705.
- **Two carry-forwards made explicit gates (B-705, filed this session):** PR 3's picker must sanitise its typed "Other" input (B-412/D9 pattern) so arbitrary junk never lands in `target_protein`; PR 5 unifies the derived arm. Both latent today — no writer or consumer reads a stored value until PR 3/4/5.

## Verification (DoD)

- `npx tsc --noEmit` — clean.
- `npm test` — 204 suites / 4469 tests green (incl. the new `trialProtein.test.ts` + mirror coverage).
- `deno test --allow-read=supabase/functions supabase/functions/` — 1165 passed / 0 failed (incl. `generate-report` 417, confirming behavior-neutrality). Deno was installed locally to run this — the repo's CI `edge-functions` job is the usual gate.
- jest under `TZ=Pacific/Kiritimati` (+14) / `Pacific/Honolulu` (−10) / `Pacific/Chatham` (+12:45) — green (the B-514 non-UTC job; the new fixtures build instants from local components or round-trip an opaque TEXT string, so B-514 doesn't bite).
- **Persona sign-off:** Engineer ✓ (mirror/sync completeness, param alignment) — Data ✓ (the never-permits invariant is structural) — `adversarial-reviewer` PASS on the load-bearing invariants, one TG-4 finding fixed — `code-reviewer` no bugs/anti-patterns (independently verified all 5 risk areas + ran the suites). Designer N/A (no UI). Dr. Chen N/A here (report render is PR 5, cold-read-gated).
- **Adversarial DoD line:** Biostatistician/Data — tried an off-diet food whose only protein equals the trial protein → stays off-diet, verdict is target-free (TG-1 holds structurally) ✓; tried the two naive permit threadings against the property corpus → both trip `verdictSets.size===1` ✓; tried editing derived→owner → counts byte-identical, naming moved (TG-5) ✓; **broke** the TG-4 "raw label never survives" defense (`'hydrolyzed'`/`'not a real key'` named `owner`) → fixed with the `proteinSourceBase` gate + honest residual docs, filed B-705.

## Not in this PR

No user-facing surface (setup row = PR 3, mid-trial = PR 4, report render = PR 5). No schema (migration 053 shipped in PR 1). The `generate-report` redeploy stays gated by B-494 — PR 5's render reaches production on that redeploy, never before.
