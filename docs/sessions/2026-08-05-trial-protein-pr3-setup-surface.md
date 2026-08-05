# Trial protein capture (B-704) PR 3 — the setup surface

**Date:** 2026-08-05
**Shipped via #597** (draft) · branch `claude/trial-protein-setup-surface-q5oxrc`

## What this PR is

PR 3 of the B-704 trial-protein track (`docs/nyx-trial-protein-requirements.md` §10). PR 1 (#594) added the columns; PR 2 (#595) built the local mirror + the stored-first `trialTargetProtein` predicate. This PR is the **setup-time surface**: the derived "Trial protein" row on the start-a-trial sheet, the shared picker sheet, and the non-blocking day-0 mismatch heads-up — plus the write of `target_protein`.

The spine (§2, unchanged): the stored protein **only NAMES** what the record already counts — **it never permits** (TG-1). The food list (`diet_trial_foods`) stays the sole off-diet authority (§5.5 D-A); `classifyFeeding` is untouched.

## What shipped

- **The "Trial protein" row** (`components/profile/StartTrialModal.tsx`) — **TP-1 ruled E1**: always renders once ≥1 trial food is picked, pre-filled from the derivation, empty-but-optional ("Not set" / "Tap to name this trial's protein") when nothing nameable derives. A glance, not a decision — the golden path stays two answers.
- **The shared picker** (`components/profile/TrialProteinPicker.tsx` + the pure `lib/trialProteinPicker.ts`) — derived options first (with provenance sub-labels), the common set (`COMMON_PROTEINS` minus derived), then the two escape hatches as first-class options. A **closed set of canonical keys** — no free-text. Mounted step-based in the start modal (the `FoodPicker` pattern, no nested sheet); the component is standalone so PR 4 mounts it on the allowed-set screen.
- **The day-0 mismatch heads-up** (`components/profile/TrialProteinMismatchNote.tsx`, amber; `trialFoodProteinMismatches` in `lib/trialProtein.ts`) — inline, immediately below the offending food row, never blocking. The predicate is kinship-aware and **source-gated on both sides**.
- **The write path** (`lib/dietTrialSetup.ts`) — `targetProtein` on `StartTrialInput`; `buildTrialRows`/INSERT write `target_protein` (canonical key only, TG-4) + `target_protein_set_at` (dated only beside a non-null protein); `getFoodPrimaryProteins` reads the derivation source from the local cache.
- **Amber theme tokens** (`constants/theme.ts`) — `colorAttentionInk`/`Light`/`Border`, the light-surface Tier-2 heads-up register.

## The state model (§5's null-collapse, made legible)

`TrialProteinChoice` = `derived` | `protein` | `hydrolyzed` | `unset`. Only a `protein` pick stores a value; the other three store **null** (the three states §5 collapses onto one null column). The distinction between "No single protein (hydrolyzed)" and "Not sure" lives in the picker UI and matters nowhere downstream. The **untouched golden path stores null**, so the read re-derives and honestly labels it `derived` — an owner-confirmed provenance is reserved for an *active* pick.

## The adversarial review, and the one thing it broke

`adversarial-reviewer` **PASSED every dangerous invariant** — TG-1 (never permits: `classifyFeeding` reads no target, verified structurally + behaviorally), TG-2 (silence never an all-clear), TG-4 (canonical key only), TG-5 (numbers don't move), and provenance (a glance-only prefill stores null → re-derives `derived`, never `owner`).

It **broke TG-3's "never misfires spuriously"** — a **safe-direction** defect (a false positive in a *non-blocking* amber, never a reassurance/permit/false-negative). The target guard was asymmetric: `trialFoodProteinMismatches` gated the *food* main on `proteinSourceBase` but the *target* only on `canonicalizeProtein`, so a source-less process-word target (`'hydrolyzed protein'`) slipped the early-return and fired a spurious amber on every sibling food — reachable with **zero owner action** from a hydrolyzed-Rx label captured as `primary_protein='hydrolyzed protein'`, with the broken copy *"…if the trial is hydrolyzed protein-only…"*. Compounded by `buildDerivedProteinOptions` offering "Hydrolyzed protein" as a selectable option competing with the "No single protein (hydrolyzed)" escape hatch.

**Fix:** a symmetric `proteinSourceBase` gate across **all three surfaces** — the predicate (target guard mirrors the food guard), the picker option builder (a source-less process word is not a selectable protein), and the setup row (a source-less derived value reads as "nothing derived", the empty E1 state — mock frame E). `trialTargetProtein`'s derived arm stays plain `canonicalizeProtein` for report behavior-neutrality (B-705 unifies it in PR 5); the setup surface applies the gate before display. Three regression tests added (predicate / picker / modal).

A **secondary** finding — a Class-B synonym misfire (`'whitefish'` target vs a legacy `'ocean whitefish'` food fires) — is left as a documented, safe-direction residual: fixing it would require a Class-B synonym merge **on read**, which `lib/protein.ts`'s D3a doctrine forbids. It requires legacy un-normalized data *and* an owner affirmatively picking the clean synonym over the derived option; it over-flags, never reassures.

## Decisions / notes to the PM

- **TP-1 — built E1, not E2.** The kickoff prompt framed the row as "hidden when nothing derives" (the *superseded provisional E2*). The build contract (§0/§7.1) and STATUS.md record the PM's **E1 override** (2026-08-04). Built E1. The mock's rulings strip still shows "E2 — provisional" because it predates the override; the mock's frame E1 panel is the one that ships.
- **B-705 (PR-3 half) discharged by construction.** It anticipated sanitising a typed "Other"; §7.2's picker is a closed set with no free-text, so no un-canonical value can reach `target_protein`. The **PR-5 half** (unify the derived arm) stands.
- **Row-provenance copy.** Used §8's locked generic row sub-line ("From the foods you picked — tap to change") rather than the mock's frame-D food-specific variant; the food-specific provenance lives in the picker options (§7.2's home for it).
- **Nested vs step-based picker.** Chose the step-based mount (the proven `FoodPicker` pattern in this file) over a nested modal I could not verify on device.

## Verification (DoD)

- `npx tsc --noEmit` — clean.
- `npm test` — **207 suites / 4520 tests** green (added 3 suites / 51 cases), incl. the B-514 non-UTC job (UTC+14 / −10 / +12:45).
- `deno test --allow-read=supabase/functions supabase/functions/` — **1165 passed / 0 failed** (`lib/trialProtein.ts` is inlined into the bundles; the new predicate + import are safe).
- **Persona sign-off:** Engineer ✓ (write-path/param alignment, one source gate) — Data ✓ (never-permits structural) — Designer ✓ *static* (E1 row is a prefilled confirm; §6.6 satisfied by inline placement) **+ the on-device 15-second re-time is a human gate, owed on a physical device** — `adversarial-reviewer` PASS (one TG-3 finding fixed) — `nyx-voice` ✓ on every §8 string — `code-reviewer` (in flight on the draft; findings folded before ready). Dr. Chen N/A (report render is PR 5).
- **Adversarial DoD line:** Biostatistician/Dr. Chen — tried a daily-staple washout equivalent (no target input reaches `classifyFeeding`, verified 0 refs in `dietTrial.ts`) → no value moves a verdict/count (TG-1/TG-5) ✓; null/hydrolyzed/unset/no-protein targets → mismatch silent, no all-clear (TG-2) ✓; dirty keys → only canonical land (TG-4) ✓; glance-only prefill → stores null, re-derives `derived` ✓; **broke** a source-less process-word target firing a spurious non-blocking amber (safe direction) → fixed with a symmetric `proteinSourceBase` gate + 3 regression tests.

## Not in this PR

Mid-trial surfaces (card/`TrialStrip` naming, the allowed-set editor, the correction confirm) = PR 4. The report render + provenance line = PR 5 (`vet-report-cold-read` gate; production reach rides the B-494 redeploy, never before). No schema (PR 1). The §6.6 physical-device viewport check and the 15-second re-time are on-device human gates.
