# Signals v2 PR 3 (CUL-8) — L2 trial-response lane

**Date:** 2026-08-15

Built PR 3 of the Signals v2 track (B-755): the `trial_response` detector (L2 — **the wedge**), the count-anchored/never-verdicted phrasing template, and the "changed materially" trigger that defines when the Signal trial card surfaces (spec §8.5). Server-only, **no redeploy** (G10 — Signals v2 stays inert in production until PR 10 lands behind the `signals_v2` client flag). Blocked-by CUL-6 (PR 1 primitives, shipped #639) — both `lib/mealTiming.ts` and `lib/rateContrast.ts` are the load-bearing dependencies, so this PR is the first consumer of the C-test render-gate.

## What was built (all in `supabase/functions/generate-signal/`)

- **`detectTrialResponse` (detection.ts).** For a pet on a RUNNING elimination diet trial, compares the trial era `[start, now]` against a `baselineDays` (49d) window immediately before it, over **logged-days denominators** (C5). Emits at most ONE `trial_response` finding, and ONLY when the pooled contrast "changed materially" (the §8.5 trigger). Carries: the day-count ("day N of M" — `target_duration_days` the only length authority), pooled symptom-episode burden (all tracked types, collapse-then-window) trial-vs-baseline, per-phenotype vomit-timing counts (rapid/long via `lib/mealTiming`, G9), diet-structure deltas (treat share, meals/day — the observable half of the RTM confound), the `comparisonDirection`, and `densityComparable`. Registered in `DETECTOR_REGISTRY`; ranks **band 1** (context-lead for the trial pet — it only ever exists for a running trial), leading correlation via `INSIGHT_TYPE_ORDER`.
- **The gate is the one predicate (G9).** `isTrialRunning` (`lib/dietTrial.ts` — the B-422 effective end), never a re-derivation from dates. The day-count uses `localDayIndex`/`localDayIndexOf` (the same helpers the trial card counts with, B-421), so the Signal card and the Pet-tab card can't drift.
- **`trialResponse` config + defaults (detection.ts).** `baselineDays: 49` (7 weeks — a season of the pet's life / both phenotypes' cadence, NOT tuned to any record, G6), `minLoggingDaysPerWindow: 7` (the garbage-baseline / too-new-trial guard), `contrastAlpha: 0.05` (the `lib/rateContrast` C-test threshold; p never surfaces, §3).
- **`templateTrialResponse` + validation (phrasing.ts).** Count-anchored, time-ordered, **direction-neutral** (states both counts; the reader sees which is higher, the copy never labels it), routes to the vet. Phrased **deterministically** (index.ts gate) — never the LLM — so the model can't drift into a verdict. A new `TRIAL_VERDICT_RE` screen bars "working"/"helping"/"improvement"/"ruled out"/"clean" and kin (better/worse, resolved, cleared, cured, fixed, effective, on-the-mend) in addition to the causal/mechanism/food/reassurance screens. `phrasingPayload` carries counts + day-count only (no verdict/direction field asked of the model).
- **index.ts + medContext.ts.** Threads the already-fetched trial row into `DetectionInput.dietTrial` (the SAME row `pet.dietTrialActive` is derived from — one definition); adds `trial_response` to the deterministic-phrasing gate and to `decorateFinding`'s med-on-board attachment (a drug on board during the trial is exactly the concurrent confound the three-things-changed honesty cares about).

## The one real design decision — the "changed materially" trigger (§8.5)

The Signal trial card is **event-driven** (D3): it surfaces on Home when something changed, while the standing Pet-tab trial-card line (PR 6, local data) shows the trial-so-far counts regardless. So the detector's EMISSION *is* the trigger — a `trial_response` finding exists exactly when the card should surface. The definition, adversarial-reviewed here:

```
changedMaterially = pooledContrast.gate AND (moreDuringTrial OR (fewerDuringTrial AND densityComparable))
```

- **`pooledContrast.gate`** — the `lib/rateContrast` C-test over the POOLED symptom-episode counts (all tracked types) with logged-days exposure clears α. The exact test is small-n-quiet BY CONSTRUCTION (0-vs-2 never gates), which is the noise defense. **ONE test, not pooled + per-phenotype** — three C-tests would be a multiple-comparison the never-over-claim surface can't afford; the phenotype rows are CONTEXT the card shows once it fires, never an independent trigger.
- **The direction gate is the B-721 §3.3 density rule reused, "both directions fail toward escalation":** a MORE-during-trial rate (escalation) always surfaces; a FEWER-during-trial rate surfaces ONLY when logging density is comparable — a quieter-looking trial may just be a less-logged one, and a Home card that reads as improvement must not be minted from a logging gap. Withholding the fewer card is the safe (never-reassure) direction; the raw counts still show on the standing line.

**The subtle correction (caught + fixed in-session):** the density gate compares logging **fractions** (logged days ÷ window span), NOT raw logged-day counts — the two windows are unequal length (the trial era grows; the baseline is a fixed 49d), so a raw-count ratio would silently suppress *every* early-trial fewer-comparison purely because a young trial has fewer logged days than a 49-day baseline. B-721's rule compares equal windows (week over week), where count-ratio == intensity-ratio; here it does not.

**Named limit (documented, safe direction):** a PHENOTYPE-ONLY shift with a flat pooled burden (empty-stomach 7→0 while post-prandial 1→8) doesn't clear the pooled gate, so L2 stays quiet — but the emergent post-prandial phenotype is exactly what detectors ⑤/L1 fire on separately, so the shift is re-homed, not lost. Silence, the safe direction.

## Reviews — adversarial (MANDATORY) + code review

**Round 1 — `adversarial-reviewer` returned FAIL, `code-reviewer` returned fix-before-merge.** Both converged on the day-boundary math; the adversarial pass additionally broke the density gate. Three findings, all fixed in-session (the fixes are the substance of this PR's second commit):

1. **BLOCKING (adversarial #1) — the wedge-user false-`fewer`.** The density gate was ONE-directional (withheld only when the *trial* was under-logged). The reactive owner's actual pattern is the MIRROR — sporadic, symptom-concentrated logging *before* the diagnosis, diligent daily logging *during* the trial. A symptom-only day IS a logged day, so the sparse baseline's per-logged-day rate inflates toward 1.0 and the C-test mints a false "fewer during the trial" over a *stationary* (non-improving) symptom process — measured **24–94%** of the time, worsening with trial length. **Fix:** the density gate is now **symmetric** (both windows' logging fractions must be within-ratio of each other, in both directions). The break profile drops from 82–94%/24–51% to **~0%** at the sparse-baseline densities; a small ~α residual remains at the equal-fraction boundary (the days-with-any-log limit `computeReflectionDensity` documents — near α, never a verdict). Regression-locked: a wedge-user fixture + a 3000-trial `§PROPERTY SWEEP` (asserts < 3%).
2. **FAIL (adversarial #2) — pooled cross-symptom masking.** The indication-blind pooled compare let a co-tracked symptom's fall (itch 33→0) mask a rising one (vomit 2→8), rendering a "fewer" over a worsening GI patient. **Fix:** the fewer direction now requires that NO single tracked type rose beyond chance (each type's own C-test must not gate `a_higher`); a genuine rise is independently led by ④/⑦. Regression-locked with a masking fixture + a flat-component positive control.
3. **BUG / fix-before-merge (code-reviewer #1, adversarial #3) — B-517 timezone drift.** The window boundary was reconstituted as `startIndex * MS_PER_DAY` (UTC midnight of the start *date*) and compared against real timestamps — the owner's local midnight only at UTC. The code-reviewer reproduced it concretely: an LA-owner's `2026-06-14T23:00-07:00` vomit (the evening *before* the trial by the owner's clock) misfiled into the trial. **Fix:** all windowing is now in **local-day-index space** (`localDayIndex(ms, tz)` compared index-to-index — the `lib/dietTrial` pattern), never reconstituted. Regression-locked with a non-UTC (LA) boundary fixture.
   - Also from code review, folded in: the day-count now uses the shared **`trialDayCounter`** (B-449) instead of re-spelling `max(1, end − start + 1)`; the per-type collapse is hoisted to run **once** (not once per window).

**Round 2 — re-dispatched on the corrected code** to confirm the fixes hold; verbatim outcome recorded on the follow-up commit. The draft stays NOT-ready-to-merge until the mandatory adversarial pass is green.

- **Persona sign-off:** Engineer ✓ (G9 one-predicate gate; band-1 ranking scoped to the trial pet; Deno-safe `lib/*` imports) — Data Scientist ✓ (the C-test render-gate + the §PROPERTY SWEEP: stationary null fires ~2% across 4 seeds, well under α; the fraction-based density fix) — Dr. Chen: the verbatim strings + the D2 absence-sentence gate are his ratification (the count-form here is D2-"always safe"; the absence-shaped SENTENCE is deferred) — Designer N/A (dark, no rendered surface this PR — that's PR 6).

## Gates / DoD

- **`deno test`**: **444 pass** across `generate-signal/` (was 423; +16 L2 detector incl. the property sweep, +5 phrasing, +decorate/dispatch parity); **1279 pass** across all `supabase/functions/`. `deno check` clean. App `tsc --noEmit` clean (Deno-only changes; the app path is untouched).
- **§PROPERTY SWEEP** (the required adversarial calibration gate): a stationary null trial (identical underlying rate both windows, full daily logging) fires **< 8%** (asserted); measured ~1.9–2.25% across 4 seeds (fewer ~1.0%, more ~1.1% — balanced, no directional bias). Plus §RECALL (a genuine drop and a genuine rise both fire).
- **Adversarial review** (mandatory for statistically load-bearing logic): dispatched; the verbatim counterexample line is recorded in the follow-up commit once the pass returns.
- **Tests**: detector + template + validation + decorate all covered (`detection.trialResponse.test.ts`, `phrasing.test.ts`, `medContext.test.ts`). The `index.ts` change is pure I/O-shell plumbing (threading one field), the untested layer by existing convention (`tests: N/A — I/O shell, Engineer ✓`).
- **No new secret; no schema; no migration; no client change; NO redeploy** (G10 — inert until PR 10's gated redeploy behind `signals_v2`).

## Notes / follow-ups

- **PR 6 (CUL-13) renders this.** The A2 trial card face = pooled compare + per-phenotype count rows; the RTM/confound expand (three-things-changed-at-once, verbatim from mock B3) + the Guilford 2001 citation + the §3.4 adjacency line are PR 6 client copy. The finding carries the structured facts (counts, phenotypes, structure, direction, density) they need; `changedMaterially`'s definition is the "when does the Signal card render" contract PR 6 keys off.
- **D2 (Dr. Chen, open):** the absence-shaped trial SENTENCE ("No early-morning empty-stomach episodes logged in the trial's 20 days…") is NOT in this PR — the count-row form is unconditional and always-safe; the sentence upgrade ships on his sign-off. This PR's server sentence is the pooled count comparison, direction-neutral.
- **PR 4 (CUL-9, L3 photo-composition) is parallel-safe** with this — both blocked only by CUL-6; expect one mechanical `detection.ts` merge-resolve in whichever lands second (the `InsightType`/`Finding` union + `DETECTOR_REGISTRY`).

## PR

Shipped via #_[assigned at creation]_ (draft) on `claude/cul-8-pr3-l2-trial-response-xgt67c`.
