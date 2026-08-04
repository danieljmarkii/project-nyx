# B-693 PR 1 — the log-time trial-list heads-up: lib layer

**Date:** 2026-08-04

**Outcome: shipped via #590** (draft) — lib layer only, no UI/store/schema change. Also **closes B-595**.

## Build phase

Parallel track — diet-trial lifecycle. B-693 is a 3-PR build (lib → surface → copy/QA); this is **PR 1 (lib)**. Not a Build-Sequence step; no phase change. Design authority: `docs/culprit-trial-log-warning-mockups.html` (round 2, amber frame, PM-ratified 2026-08-04). Kickoff: `docs/sessions/2026-08-04-b693-log-time-trial-warning-kickoff.md`.

## What was built (`lib/trialContaminant.ts` + tests)

The shipped log-time flag fires on **rung 2 only** (`off_diet_protein` — a read panel carries an off-trial protein). A **rung-3** feeding (`off_diet_unrecognised` — the food isn't on the allowed list and nobody read its panel, *the modal case*) landed silently. This PR adds the rung-3 **membership** heads-up: "this isn't on {pet}'s trial list" — a fact about the **LIST**, never a claim about **contents** nobody read.

- `TrialMembershipFlag` + `LogTimeTrialFlag` discriminated union; `TrialContaminantFlag` gained a `kind: 'off_diet_protein'` discriminant.
- `foodMembershipFlag` — the pure rung-3 predicate. **One predicate**: consumes `classifyFeeding`, never re-derives. Fires on `off_diet_unrecognised` only, guarded by `allowedSetHydrated` (mid-sync unhydrated list → silence).
- **Rung-2 precedence is structural** — `classifyFeeding` returns exactly one verdict per feeding, so contents/membership are mutually exclusive and never both fire.
- `evaluateLogTimeFlag` spine adds the `isTrialRunning` gate to **both** log-time evaluators, at the log-time call site — **not** in `loadTrialProteinContext` or the pure predicates. **Closes B-595**: a stale-active trial goes quiet at log time (Principle 1) while the standing surfaces (`trialDietNote`, `trialTargetLine`, food-detail, `generate-report`) keep their input off the same context — the split B-422 round 3 required.
- `membershipFlagCopy` — list language only per mock §5; never `off-diet`/`contaminant`/any all-clear. Takes only `petName` (structurally cannot assert contents).
- Ledger reused **kind-agnostically** (`noteTrialFlagShown` widened structurally).
- Tests: `lib/trialContaminant.test.ts` (pure predicate/copy, DB stubbed to throw) + new `lib/trialLogTimeFlag.test.ts` (I/O spine against a fake SQLite — the `isTrialRunning` gate + shared ledger end-to-end). `store/momentStore.test.ts` fixtures gained `kind`.

**No UI/store change** — PR 2 renders the amber panel + the add line. Deliberate: `app/log.tsx` spends the ledger budget the instant `evaluateMealTrialFlag` returns, so the membership flag ships as its own evaluator (not by widening that one) to avoid spending the budget on a flag the card can't yet show.

## Decisions made

- **Two single-kind evaluators, not one union-returning evaluator, for PR 1** — keeping `evaluateMealTrialFlag`'s output unchanged means the current callers (log.tsx/FAB/store/card) need zero change and never spend budget on an unshowable flag. PR 2 composes the two pure predicates behind one read (documented in `evaluateMealMembershipFlag`).
- **Gate placement = the log-time call site** (per the B-595 row's own prescription), never the shared context — otherwise the standing surfaces lose their input on a stale-active trial (the reverted B-422 mistake).
- **Over-fire is acceptable, reassurance is not** — where a cheap guard would trade an over-fire for a reassurance hole (silencing a genuine off-list food), the over-fire is kept. This governed the response to the adversarial findings.

## Reviews

- **`adversarial-reviewer` (mandatory, claim-strength): PASS on the clinical-safety spine.** Claim-strength (no contents claim from a membership flag), no-reassurance (G2), rung-2 precedence/never-both, gate placement + fail-open direction (B-595), and ledger read/write split each held under a concrete counterexample. The *reassurance direction* — the one that endangers a pet — held everywhere it was attacked. **Two OVER-FIRE findings** (alarm-fatigue direction, never reassurance, ≤ the contents flag's existing behaviour): **P3** a divergent-key re-photo of the *prescribed diet* evades the exact-key dedup → membership on the trial diet (self-healed by the add-to-list hatch; bounded by the ledger); **P2** an unsynced cross-device permitted food. Response: docstrings scoped to what the guard actually prevents, P3 pinned as a known-limitation test, root cause filed as **B-699** (a shared `matchAllowed` dedup fix, Deno-shared, out of this lib-only PR). No behaviour change.
- **`code-reviewer`: ship-ready.** No BUG/ANTI-PATTERN findings; independently re-verified `tsc`, the full suite, the non-UTC matrix, and the union-widen safety across every consumer. Four low-severity items: (2) docstring over-claimed a "+"-prepend convention → **fixed**; (3) the shared-ledger test held trivially → **strengthened** to force a genuine rung flip + prove the ledger (not classification) suppresses; (1) double `readFoodProteinRecord` if PR 2 calls both evaluators → **documented** the single-read composition for PR 2; (4) `status`-select style divergence → left (both correct per contract).

## DoD

- AC (silence-state coverage): all pass — fires on rung-3 off-list; rung-2 precedence (never both); silent on unhydrated/out-of-window/permitted/trial-diet/no-context/ledger-spent; `isTrialRunning` gate suppresses both flags on a stale trial; copy carries no banned words / makes no contents claim.
- Types green (`tsc --noEmit`); full suite green (198 suites / 4342 tests); new suites green under UTC+14 / UTC−10 / Chatham. CI green on the first commit (all 3 checks).
- Persona sign-off: Engineer ✓ — Data/Biostatistician ✓ (adversarial PASS on the spine) — Designer N/A (no UI) — Dr. Chen N/A (no rendered clinical artifact; PR 3 owns the voice pass).
- Adversarial review: run, PASS on the spine, findings routed to B-699 (not a merge blocker).
- Tests: present and separated (pure layer / I/O spine / store fixtures).

## Known issues / tech debt

- **B-699** (filed) — divergent-key re-photo of the trial diet + unsynced permitted food over-fire membership on a food that should be silent. Over-fire direction, bounded, self-healed by the add-to-list hatch; root cause is the shared `matchAllowed` exact-match dedup (cross-cutting, Deno-shared). Pinned by a red-ready test.

## PM action items

None. Lib-only, CI-verified, draft PR #590 open for review. No secret, migration, or deploy.

## Recommended next steps

- **PR 2 (surface)** — the amber inset panel on `MealCompletionCard` (by `flag.kind`) + the "+ Add to the trial list" line → the shipped `AddTrialFoodSheet`; migrate log.tsx/FAB to a single-read composition of the two pure predicates (per the `evaluateMealMembershipFlag` doc note); spend the budget on render only. Designer + `pm-feature-review`.
- **PR 3 (copy/safety + QA)** — `nyx-voice` pass, the silence-state QA matrix, the on-device script.
- Independent of B-693: PR 2 is the only thing gated on this PR merging.
