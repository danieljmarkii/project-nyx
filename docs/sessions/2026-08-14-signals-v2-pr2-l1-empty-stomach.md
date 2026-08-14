# Signals v2 PR 2 (CUL-7) — L1 empty-stomach lane + episode-set-aware suppression + `timing_story`

**Date:** 2026-08-14

Built PR 2 of the Signals v2 track (B-755): the `empty_stomach_timing` detector (L1 — the ⑤ mirror), the `timing_story` composition that merges a same-symptom ⑤ + L1 pair into one A2 card face, and the episode-set-aware rewrite of the ⑤-suppresses-⑥ rule. Server-only, **no redeploy** (G10 — Signals v2 stays inert in production until PR 10 lands behind the `signals_v2` client flag). Blocked-by CUL-6 (PR 1 primitives, shipped #639) and CUL-16 (`longGapHours` = 6h, shipped #638) — both merged, so the floor lock could proceed.

## What was built (all in `supabase/functions/generate-signal/`)

- **⑤ rewired onto `lib/mealTiming.ts` (G9).** `detectPostprandialTiming`'s former inline `classifyTimedFeedings` / `nearestPreceding` / `freeFedNear` / rapid-band test are gone, replaced by a new shared `scanVomitTiming` helper that runs PR 1's `classifyEpisodeSet`. There is now **exactly one** implementation of "minutes since she last ate" server-side — the §5.3 diet-trial lesson pre-empted, exactly as PR 1's header said PR 2 would do. **Byte-identical**: the full shipped ⑤ suite is green with zero changes. ⑥ also moved its clock scan into a shared `clockConcentration` helper (byte-identical; the fire decision depends only on `count`).
- **L1 — `detectEmptyStomachTiming`.** The complement of ⑤: of the vomit episodes we could time, how many were ≥ `longGapHours` (6h) after the last feeding. Shares ⑤'s eligibility ladder and denominator (both read the one `dist` from `scanVomitTiming`), carries the full three-band split (`bandCounts`), and computes the **clock concentration of the long episodes as evidence** (`clockBand`/`clockCount`, reusing ⑥'s scan — no separate clock card, §2 L1). Registered in `DETECTOR_REGISTRY` like ④–⑧.
- **`timing_story` composition.** `composeTimingStory` merges a same-symptom ⑤ + L1 pair into one `timing_story` (the A2 Shape-C compare: three-band counts + per-phenotype evidence). Only the co-firing pair merges — a lone ⑤ stays `postprandial_timing`, a lone L1 stays `empty_stomach_timing`. Detectors stay separate and separately tested; only the presentation payload merges.
- **Episode-set-aware suppression.** `suppressTimeOfDayWhenPostprandial` now drops a same-symptom ⑥ only when ≥ `suppressionOverlapFraction` (0.5) of ⑥'s cluster episodes are also ⑤'s meal-adjacent (rapid) episodes. ⑤ and ⑥ carry their onset instants (`rapidEpisodeOnsets` / `clusterEpisodeOnsets`, optional — absent ⇒ the shipped unconditional suppression, behaviour-parity for any pre-v2 finding). Onsets match by exact ms because both collapse the same vomit list with the same 3h gap.
- **Client-boundary wiring** for the two new `InsightType`s: `templateForFinding` + `templateEmptyStomachTiming`/`templateTimingStory` + `validatePhrasing` screens + `phrasingPayload` (phrasing.ts); the deterministic-phrasing gate (index.ts, so they're never sent to the LLM — the model would drift toward the banned "empty stomach"/"bilious" mechanism); the medContext decoration (medContext.ts). The templates name the **timing band** ("6 or more hours after eating"), never the syndrome — `MECHANISM_RE` bars "empty stomach"/"bilious", pinned by a test.

## The one real design decision — the guard, not just the fraction floor

CUL-7's unblock note (and the ⑥ analogy) steered toward "raise `minLongGapFraction` above the twice-daily ~0.5 base rate." **The seeded sweep showed that is necessary but not sufficient**, and the deviation is worth recording:

- The empty-stomach ≥6h bucket has a **large, schedule-dependent chance base rate** — ~0.5 of the day for a twice-daily feeder, ~0.75 for a once-daily one (a solid meal clears in <6h, so most of a long inter-meal gap is "empty stomach" by the clock). This is the **opposite** confound to ⑤ (there the grazer inflates the rapid band; here the sparse feeder inflates the long band).
- At `minLongGapFraction` 0.5/0.6 with no guard, the **twice-daily null fires ~19%**, and no fixed fraction floor separates it at small n without a threshold (~0.9) that also kills every realistic golden.
- The first cut used the **⑤ grazing-guard's mirror** — a multiplicative `longCount ≥ ratio × eligible × scheduleLongBaseRate`. **Both reviewers broke it** (see "Review round 1" below), so the shipped guard is the corrected version:

### The guard — corrected after review round 1 (windowed base rate + exact binomial)

Two independent reviews (adversarial FAIL, code-review fix-before-merge) broke the multiplicative guard from one root cause — a ratio against a whole-window base rate is the wrong statistical shape:

- **Adversarial (false positives):** `scheduleLongBaseRate` was estimated over the whole 60 days but applied to *recent* episodes, so a **non-stationary** schedule (fed 3×/day → 1×/day recently, or logging fatigue where only the AM feed is logged) read its base rate off the dense historical regime and fired on pure noise — measured **~81%** on the regime-change null.
- **Code review (false negatives):** the multiplicative threshold `1.7 × base × eligible` **exceeds `eligible` for any base ≥ ~0.588**, so a **once-daily-fed cat** (base ~0.75 — the *classic* empty-stomach presentation) could not fire even at 100% long. No test exercised a once-daily true positive, so it shipped green.

The corrected guard: **(1)** the base rate is estimated over the window the **eligible episodes occupy** (earliest onset − lookback → now), so it tracks the recent regime / logging density — self-correcting, because the *same* sparse logs both classify the episodes and set the base rate; **(2)** the test is a one-sample **exact binomial upper tail** `P(X ≥ longCount | Binomial(eligible, baseRate)) < baseRateAlpha`, which self-calibrates the null to ≤ alpha at *any* base rate and *can* fire at a high base rate given enough disproportionate evidence. `baseRateAlpha = 0.05` (sweep-locked). Config swap: `minObservedToExpectedRatio` → `baseRateAlpha`.

### The re-sweep (false-positive AND recall, both asserted in CI)

Measured pooled n=6..10 fire rates (deno seeded sweep, 1.5k trials/n):

| null model | old ratio guard | reworked (binomial) |
|---|---|---|
| once-daily (base ~0.75) | 0.00% | 0.00% |
| twice-daily (base ~0.5) | 2.72% | ~1.7% |
| thrice-daily (base ~0.25) | 1.96% | ~1.6% |
| grazing / Poisson | 0.0% / 1.16% | 0.0% / ~0.8% |
| **regime-change 3×→1× recent** | **~81%** | **~0.8%** |
| regime 2×→1× recent / logging-fatigue | (untested) | ~1.1% / ~1.1% |

And a new **§RECALL** test asserts the true positives fire: once-daily 12/12 **fires** (the case the old guard could *never* fire), thrice-daily 7/10 fires, twice-daily 7/8 fires. The exact binomial self-calibrates, so there is **no accepted per-n residual** any more (the old twice-daily n=7 ~5.5% carve-out is gone — the binomial is exact). A direct `binomialUpperTailProbability` unit test pins the core against textbook values.

## The suppression behaviour change (the point of the PR)

The shipped rule dropped ⑥ whenever any ⑤ fired for the symptom — which **hid an empty-stomach clock finding** whenever the pet also had unrelated rapid-after-eating episodes (deep-dive F1). The episode-set-aware rule fixes exactly that. Recorded in three tests:

- **§7#4 (rewritten):** the ⑤ golden — 12 vomits all at 8am, but only 4 meal-adjacent — now **keeps ⑥** (overlap 4/12 = 0.33 < 0.5). The 8am clock pattern is broader than the 4 rapid episodes; the old rule wrongly erased it.
- **§7#4b (new):** a true schedule-fed vomiter (8 vomits, all rapid, all at 8am) — ⑥ **is** suppressed (overlap 1.0), the case the rule was always meant for.
- **§7#4c (new — the rescue):** ⑤ fires on 6pm rapid episodes, a disjoint clock cluster sits at 6am — ⑥ **survives** (overlap 0), the empty-stomach pattern the blanket rule used to hide.

## Review round 1 — both reviewers ran, both broke the guard, all findings addressed

- **Guard (adversarial ① + code review):** reworked to windowed base rate + exact binomial (above). ✅
- **Finding ③ (adversarial):** a surviving ⑥ could duplicate `timing_story.long.clockBand` when its cluster is L1's *long* episodes (the suppression only measured overlap vs ⑤-*rapid*). Fixed: the suppression now measures overlap against the **whole timing lane (⑤-rapid ∪ L1-long)** — test §7#4d. ✅
- **Finding ② (code review):** the internal onset arrays (`rapidEpisodeOnsets` / `longEpisodeOnsets` / `clusterEpisodeOnsets`) reached the cached payload. Fixed: a `stripInternalOnsets` pass drops them after the suppression runs, before caching — a redeploy never bloats live ⑤/⑥ cards. ✅
- **Finding ④ (adversarial, accepted):** the ⑤ same-millisecond feeding-tie carries a different evidence *form* (`feedingFormsInEvidence`) than shipped ⑤ — evidence-only, needs an exact-ms collision, the shared predicate is now canonical (G9). Documented, no code change.
- Code review also **verified clean:** the ⑤ rewrite is byte-identical, G9 holds (⑥'s `toConfidenceEpisodes` is symptom-episode collapse, not meal-timing — out of scope), no B-514 timezone issue, constants carry G6 anchors.

## Gates / DoD

- **`deno test`**: **423 pass** across the whole `generate-signal/` suite (cached-only, CI-exact). `deno check index.ts` clean. App `tsc --noEmit` clean (my changes are Deno-only; the app path is untouched).
- **`adversarial-reviewer`** (MANDATORY per CUL-7): round 1 = **FAIL** (findings ①–④). Reworked and **re-run** on the binomial guard + windowed base rate with the non-stationary + once-daily counterexamples as the opening falsification.
- **`code-reviewer`**: round 1 = **fix-before-merge** (guard unsatisfiability + payload strip). Both fixed; the clean-verified items confirmed.
- **Persona sign-off:** Engineer ✓ (G9 one-predicate, byte-identical ⑤) — Data Scientist ✓ (the windowed base rate + exact binomial + the re-sweep's FP-and-recall assertions + the binomial unit test) — Dr. Chen: boundary is his (CUL-16, 6h); `baseRateAlpha` is a tunable he can set, flagged — Designer N/A (dark, no rendered surface this PR — that's CUL-12/PR 5).
- **Future-self review:** the exact-binomial base-rate test is a new pattern. Would I want it in 12 months? Yes — it is the honest gate for a phenotype whose label's base rate depends on the feeding schedule, and it self-calibrates so it needs no per-schedule tuning. The residual risk named: `baseRateAlpha` sets sensitivity and is a clinical knob (once-daily needs ~12 all-long to fire, so the once-daily *typical* case is really ⑥'s clock lane, which the episode-set-aware suppression now keeps) — flagged for Dr. Chen.
- **No new secret; no schema; no migration; no client change; NO redeploy** (G10).

## Notes / follow-ups

- The **A2 card / expands (CUL-12 / PR 5)** render `timing_story` (and lone `empty_stomach_timing`) — the third band label is `6h+` per CUL-16. Until PR 5, the client renders an unknown finding type as null (the PR-1 pin), which is why no-redeploy is safe.
- `suppressionOverlapFraction = 0.5` is an owned constant; the safe direction is toward keeping ⑥ (don't hide empty-stomach patterns). Adversarial-gated this session.
- One evidence-only tie-break change from the ⑤ rewrite: at a same-millisecond feeding tie, the shared predicate keeps the first-at-max-ms feeding's form where inline ⑤ kept the last. Affects only `feedingFormsInEvidence` in a millisecond collision; the shared predicate is now canonical (G9).

## PR

Shipped via #642 (draft) on `claude/cul-7-l1-empty-stomach-lane-q3z82o`. Branch was fast-forwarded onto `origin/main` (#641, the PR-0 flag seed, had landed after the branch point) before the push, so the PR diff is exactly the L1 work.
