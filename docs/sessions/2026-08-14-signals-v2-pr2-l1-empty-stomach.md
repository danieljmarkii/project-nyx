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
- So L1 carries the **⑤ grazing-guard's mirror**: `longCount ≥ minObservedToExpectedRatio × expectedLong`, where `expectedLong = eligibleCount × scheduleLongBaseRate(...)` and `scheduleLongBaseRate` integrates the ≥6h tail over the actual consecutive in-window feeding gaps (~0.5 twice-daily, ~0.75 once-daily, ~0.25 thrice-daily, ~0 grazing). This makes the bar **schedule-adaptive**: a once/twice-daily feeder whose vomits merely match its schedule stays silent; a cat whose vomits are disproportionately empty-stomach fires. (This is G6-faithful — the constant is set by the sweep against null models, never to make any record fire.)

### The sweep (at 6h — the boundary is physiology, the floors are the sweep)

Locked `minLongGapFraction = 0.6`, `minObservedToExpectedRatio = 1.7`. Measured pooled n=6..10 null-model fire rates (deno seeded sweep, asserted in CI):

| null model | pooled fire rate |
|---|---|
| once-daily (base ~0.75) | 0.00% (guard threshold > eligible → impossible) |
| twice-daily (base ~0.5) | 2.72% |
| thrice-daily (base ~0.25) | 1.96% |
| grazing (8/day) | 0.00% |
| Poisson (twice-daily) | 1.16% |

**Accepted residual:** the twice-daily **n=7 slice alone is ~5.5%** — an intrinsic combinatorial floor at a base rate of exactly 0.5 (P(Binom(7,0.5) ≥ 6) ≈ 6.25%), the same shape as ⑥'s n=8 residual. It cannot be tuned out without a threshold that also kills the golden. Accepted for v1: the card is descriptive (never reassures, routes to the vet), so its worst case is a mildly-noisy empty-stomach card, never a false all-clear. The property test asserts the pooled rate **and** tracks the per-n slice with a ceiling above 5% (so a regression is caught, the residual is visible — ⑥'s pattern). `minLongGapEpisodes 3` confirmed to hold.

## The suppression behaviour change (the point of the PR)

The shipped rule dropped ⑥ whenever any ⑤ fired for the symptom — which **hid an empty-stomach clock finding** whenever the pet also had unrelated rapid-after-eating episodes (deep-dive F1). The episode-set-aware rule fixes exactly that. Recorded in three tests:

- **§7#4 (rewritten):** the ⑤ golden — 12 vomits all at 8am, but only 4 meal-adjacent — now **keeps ⑥** (overlap 4/12 = 0.33 < 0.5). The 8am clock pattern is broader than the 4 rapid episodes; the old rule wrongly erased it.
- **§7#4b (new):** a true schedule-fed vomiter (8 vomits, all rapid, all at 8am) — ⑥ **is** suppressed (overlap 1.0), the case the rule was always meant for.
- **§7#4c (new — the rescue):** ⑤ fires on 6pm rapid episodes, a disjoint clock cluster sits at 6am — ⑥ **survives** (overlap 0), the empty-stomach pattern the blanket rule used to hide.

## Gates / DoD

- **`deno test`**: 420 pass across the whole `generate-signal/` suite (was 394 offline + index; +26 new L1/composition/suppression/phrasing cases). `deno check index.ts` clean. App `tsc --noEmit` clean (my changes are Deno-only; the app path is untouched).
- **`adversarial-reviewer`** (MANDATORY per CUL-7): <RESULT — folded in before commit>.
- **`code-reviewer`**: <RESULT — folded in before commit>.
- **Persona sign-off:** Engineer ✓ (G9 one-predicate, byte-identical ⑤) — Data Scientist ✓ (the guard + the seeded sweep + the accepted n=7 residual) — Dr. Chen: boundary is his (CUL-16, 6h) — Designer N/A (dark, no rendered surface this PR — that's CUL-12/PR 5).
- **Future-self review:** the guard is a new pattern (a schedule-adaptive base-rate defense, not ⑤'s rate approximation). Would I want it in 12 months? Yes — it is the *only* honest way to gate a phenotype whose label's base rate depends on the feeding schedule; a fixed fraction floor is provably wrong here (the 19% twice-daily null). The risk named: `scheduleLongBaseRate` is estimated from logged feedings, so a pet with sparse feeding logs gets a shaky estimate — mitigated by the <2-feedings→0 fallback + the fraction floor backstop, and revisited on real data.
- **No new secret; no schema; no migration; no client change; NO redeploy** (G10).

## Notes / follow-ups

- The **A2 card / expands (CUL-12 / PR 5)** render `timing_story` (and lone `empty_stomach_timing`) — the third band label is `6h+` per CUL-16. Until PR 5, the client renders an unknown finding type as null (the PR-1 pin), which is why no-redeploy is safe.
- `suppressionOverlapFraction = 0.5` is an owned constant; the safe direction is toward keeping ⑥ (don't hide empty-stomach patterns). Adversarial-gated this session.
- One evidence-only tie-break change from the ⑤ rewrite: at a same-millisecond feeding tie, the shared predicate keeps the first-at-max-ms feeding's form where inline ⑤ kept the last. Affects only `feedingFormsInEvidence` in a millisecond collision; the shared predicate is now canonical (G9).

## PR

Shipped via #<PR> (draft) on `claude/cul-7-l1-empty-stomach-lane-q3z82o`.
