# Session — 2026-08-14 — Signals v2 PR 1 (CUL-6): shared primitives

**PR:** #639 (draft) · **branch:** `claude/cul-6-shared-primitives-118hmz` · **track:** Signals v2 (B-755), Linear CUL-6

## Build Phase
Step 10 evolution — **Signals v2 (B-755), PR 1 of 10.** The one-predicate foundation the L1–L4 lanes and the timing/trial/Patterns surfaces all build on. Spec: `docs/nyx-signals-v2-requirements.md` §3 (shared primitives), §2 (the lanes that consume them), G6/G9/G10, §7 (PR plan). PR 1 blocks PRs 2/3/4/8/9.

## What Was Built
- **`lib/mealTiming.ts`** (new) — the ONE implementation of "how long since she last ate" (G9), dependency-free and importable by BOTH `detection.ts` (Deno) and the client Patterns screens (the `lib/dietTrial.ts` precedent):
  - three-band classification `rapid ≤30m` / `mid` / `long ≥ longGapHours` (default **6h**, §0 D10 — feline solid-phase gastric-emptying anchor, not Nyx's record, G6);
  - 3h episode collapse (`collapseEpisodes`, generic, order-independent);
  - the **two-tier eligibility asymmetry** — `feedingIsTimeEligible` (NULL-tolerant) vs `onsetIsTimeEligible` (strict `witnessed`); collapsing the two is the silent mistake the file's docstring exists to prevent;
  - `nearestPrecedingFeeding` (within a 24h lookback, order-independent), `isFreeFedNear` (the B-040 overlap test);
  - `classifyEpisodeTiming` (the gate order: witnessed → free-fed → nearest-preceding → band) and `classifyEpisodeSet` (the `TimingDistribution` the surfaces read — `eligibleCount` kept separate from `totalCount`, untimed disclosed as a count).
  - A **behaviour-preserving extract** of detector ⑤'s inline logic in `supabase/functions/generate-signal/detection.ts` — gate order, boundary inclusivity, NULL semantics and the free-fed overlap test all match as shipped, so PR 2 is a lift-and-call. **Detector floors deliberately stay in the detectors** (this computes raw facts; ⑤/L1 apply their own floors).
- **`lib/rateContrast.ts`** (new) — the conditional-binomial exact test (C-test) render-gate for every two-window comparison sentence the engine emits (L2 first consumer). `rateContrast` returns `{ gate, direction, rateA, rateB }`; **p-values never surface** (the two-sided `conditionalBinomialTwoSidedP` is exported for property tests only, with a no-render docstring). Degenerate windows (exposure ≤0 / non-finite / n=0) fail toward `gate:false`; a lopsided-exposure `0×-Infinity` NaN edge in the log-pmf is guarded. Local `lgamma` (Lanczos g=7) keeps the module import-free. Cites Przyborowski & Wileński 1940 / Krishnamoorthy & Thomson 2004.
- **`lib/mealTiming.test.ts`, `lib/rateContrast.test.ts`** (new) — property + unit tests: symmetry, monotonicity (alpha-sweep + the statistic directly), degenerate windows, hand-computed binomial validation; band-monotonicity, collapse order-independence, eligibility asymmetry, and a **⑤-parity pin** that guards the PR-2 drop-in.
- **`components/home/InsightCard.test.tsx`** (edit) — the **G10 pin**: a finding type with no registered renderer renders `null` (safely ignored), with a positive control. The precondition that lets every server lane merge no-deploy (the B-182 lesson).

## Decisions Made
- **Detector floors are NOT in the timing primitive.** `minEligibleEpisodes`, `minLongGapEpisodes`, `minLongGapFraction`, the grazing guard, recency — all stay in the detectors' `DEFAULT_CONFIG`. The primitive computes honest per-episode facts; the two detectors (⑤ rapid, L1 long) and the two always-on Patterns panels apply their own (different, or no) floors. This is what lets one primitive serve all four readers.
- **The internal p-value is exported, for tests only.** Honouring §3's "p-values never surface" strictly would forbid even a test hook; instead the statistic is exported with a docstring that forbids routing it to any surface, and the public API hands out only the boolean gate. This buys real monotonicity/symmetry assertions on the statistic without a rendered p-value.
- **`classifyEpisodeTiming` prepares its feedings itself** (runs `timedEligibleFeedings` internally) so a caller cannot forget the NULL-tolerant feeding filter; `classifyEpisodeSet` prepares once and loops the prepared core, keeping the batch path O(episodes × feedings) without re-preparing.

## Persona Flags Raised
None (a persona conflict). Sign-off: **Engineer ✓** (dependency-free / one-predicate / Deno-safe / floors-stay-in-detectors) — the §7 gate for PR 1. Designer / Data / Dr. Chen **N/A** (no UI, no owner copy, no clinical claim surfaced — the primitive computes facts; the flag-gated surfaces are PRs 5–7). Ran `adversarial-reviewer` (statistics + ⑤-parity) and `code-reviewer` (house rules + Deno-safety) on the diff beyond the formal gate; findings to be folded into #639 if any.

## Open Questions Surfaced
None new. Consumes the ruled `longGapHours` = 6h (§0 D10, CUL-16). Does not touch the still-open **D2** (absence-shaped trial sentence, Dr. Chen) — that governs PR 3's copy, not this primitive.

## Known Issues / Tech Debt
- The primitive is created but **not yet wired into `detection.ts`** — that is PR 2's L1 work (adversarial-mandatory, because ⑤ is a shipped/deployed/calibrated detector). The ⑤-parity test pins the contract PR 2 must preserve.
- `deno check` could not run in this environment (deno absent); the modules are zero-import pure TS and were grep-verified free of Node/Deno globals. The CI `Edge Functions (deno test)` job validates for real when PR 2 imports them.

## PM Action Items
None. No schema, no secret, no deploy, no dashboard step. (Draft PR #639 is open for review; merge is the PM's call once CI is green.)

## Recommended Next Steps
1. **PR 2 (CUL-7)** — L1 `empty_stomach_timing` detector + `timing_story` composition + episode-set-aware suppression, rewiring ⑤ onto `lib/mealTiming.ts`. Adversarial-mandatory + property sweep. Gated on this PR.
2. In parallel (all gate on PR 1, disjoint files): **PR 3 (CUL-8)** L2 trial-response lane (consumes `rateContrast`; Dr. Chen copy contract), **PR 4 (CUL-9)** L3 photo composition, **PR 9 (CUL-11)** Patterns panels (needs only PR 1, via `lib/mealTiming`). The one shared-file collision across these is STATUS.md at wrap.

## Next Session Kickoff
**Recommended first prompt:**
> Signals v2 PR 2 (CUL-7): build the L1 `empty_stomach_timing` detector in `supabase/functions/generate-signal/detection.ts`, rewiring detector ⑤ onto `lib/mealTiming.ts` (the ⑤-parity test in `lib/mealTiming.test.ts` pins the contract). Add the `timing_story` composition payload and make `suppressTimeOfDayWhenPostprandial` episode-set-aware per spec §2 L1. Read `docs/nyx-signals-v2-requirements.md` §2/§3 first. Adversarial-reviewer + property sweep mandatory; server change but NO deploy (G10).

**Alternate prompts (parallel-safe, all gate on PR 1 #639):**
- PR 9 (CUL-11): the two Patterns panels (Timing distribution + The trial so far) computing client-side through `lib/mealTiming.ts` only (G9). No server.
- PR 3 (CUL-8): the L2 trial-response lane, using `lib/rateContrast.ts` as the comparison-sentence render-gate. Carries the Dr. Chen copy contract; the D2 sentence gate is still open.
