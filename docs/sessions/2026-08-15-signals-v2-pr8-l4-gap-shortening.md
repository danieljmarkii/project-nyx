# Signals v2 PR 8 (CUL-10) — L4 gap-shortening lane + its watching row

**Date:** 2026-08-15

Built PR 8 of the Signals v2 track (B-755): the `gap_shortening` detector (L4 — **the sub-floor lane**), its escalate-only phrasing template, and the seeded property sweep that **set the fire floor**. Server-only, **no redeploy** (G10 — Signals v2 stays inert in production until PR 10 lands behind the `signals_v2` client flag; the shipped client renders an unknown finding type as null). Blocked-by CUL-6 (PR 1 primitives, shipped #639) — reuses the shared `toEpisodeOnsets` 3h episode collapse (G9); the lane needs no meal-timing classification (it reads only inter-episode durations).

## Why this lane exists

Of the tools in the signals deep-dive (§3), the **g-chart on inter-event gaps** is the ONLY one that speaks at the 4-episodes-in-2-weeks scale (§2 F4) — the sub-floor state that is *every new account's first weeks by construction*, where ⑤/⑥ (6 eligible), ⑦ (6 episodes) and ④/③ (3-in-7d) are all correctly silent by their own floors. L4 monitors the GAPS between a symptom's 3h-collapsed episodes and fires ONLY on a SHORTENING run (a rising episode rate) — the plain D2 sentence *"the gaps between vomiting episodes have been 6 days, then 3, then 2."*

## What was built (all in `supabase/functions/generate-signal/`)

- **`detectGapShortening` (detection.ts).** Per `CORRELATION_SYMPTOM_TYPES`: collapse to episode onsets (`toEpisodeOnsets`, 3h, G9), compute inter-episode gaps, and fire when — the last `runLength` gaps are **strictly monotonically decreasing** AND the latest gap ≤ `gapShorteningRatio` × the record's **median** gap AND the **recency guard** holds (open interval `now − lastOnset` ≤ `recencyGraceFactor` × latest gap). Emits at most ONE finding (the strongest shortening — smallest latest/median). Registered in `DETECTOR_REGISTRY`; ranks **band 4** — the engine's lowest, below reflection (the quiet watching row leads only when nothing louder exists, which is the sub-floor state it is built for).
- **ESCALATE-ONLY BY CONSTRUCTION (G5).** A lengthening or flat run is not strictly decreasing → SILENCE. There is no "gaps widening / settling" finding, ever — the never-reassure direction is closed structurally (a flat step fails `<`, not `<=`). Absence is not wellness.
- **`gapShortening` config + defaults (detection.ts).** `minGaps: 3` (the g-chart anchor / WATCHING-row floor), `runLength: 4` (**the sweep result**, see below), `gapShorteningRatio: 0.5` ("meaningfully shorter than typical" — held loose because the FPR is controlled by runLength), `recencyGraceFactor: 2` (staleness/reversal guard, escalate-safe). Every constant carries its anchor; none is tuned to Nyx's record (G6).
- **`templateGapShortening` + `formatGapSequence` + validation (phrasing.ts).** The D2 form: state the recent gaps as plain counts in time order and let the numbers speak — `"the gaps between {symptom} episodes have been 6 days, then 3, then 2 — a pattern worth keeping an eye on."` Uniform units compress ("6 days, then 3, then 2"); a day→hour-crossing run states each unit ("3 days, then 18 hours, then 9 hours"), so a sub-day gap never reads as a dishonest "0 days". Phrased **deterministically** (index.ts gate) — never the LLM, so the model can't add a verdict ("worsening") or a reassuring "settling". A `validatePhrasing` screen bars cause/mechanism/food/reassurance/verdict (reuses `TRIAL_VERDICT_RE`, which covers "worse"/"worsening").
- **index.ts.** Added `gap_shortening` to the deterministic-phrasing (template-only) list. No new input, no new query — the detector reads the existing `symptomEvents` (already 180-day-windowed by the caller), so "the record" = the current era.

## The one real design decision — the sweep SET the floor (the monotone-runs-by-chance trap)

The spec's fire condition was **provisional**: "the last 3 gaps monotonically decreasing AND latest ≤ ratio × median". But **3 i.i.d. gaps are strictly decreasing 1/3! = 16.7% of the time BY CHANCE** — so a monotone-3 condition fires ~1-in-6 on *any* null, the exact class of miss ⑥ hit (its naive floors fired ~21.6% on uniform noise; the `DEFAULT_CONFIG` ⑥ CALIBRATION NOTE is the in-repo precedent). The ticket names this directly: *"the sweep sets the floor, not intuition; the ⑥ calibration lesson."*

So a seeded property sweep (5 constant-rate null models × record sizes × 2000+ trials) **measured** the null false-positive rate and calibrated the run length UP:

| runLength | pooled null FPR | worst cell |
|---|---|---|
| 3 (provisional) | 6.7–10.2% | **13.4%** — the trap |
| **4 (shipped)** | **~2.0%** | **~3.5%** — ≪5%, matches ⑥'s calibrated ~3.3% |
| 5 | ~0.3% | <0.9% (needs 6 episodes; over-conservative) |

**runLength = 4** is the honest floor. The cost, taken knowingly: the FIRING floor is effectively 4 gaps / 5 episodes; a **3-gap record is WATCHED** (§4.4, the client watching row, PR 7) but never fired on — the honest reading of "≥3 gaps is the anchor" over the g-chart's low end. The ratio is left loose (0.5) because runLength, not a strict ratio, controls the FPR (a ratio strict enough to hold the FPR alone (~0.17) would miss every moderate real acceleration). The committed sweep asserts the shipped config fires **< 3% pooled / < 5% worst-cell**, AND locks the calibration with a second assertion that **runLength=3 BLOWS the 5% ceiling** — so no future dev can silently drop the run back to 3 without the test screaming.

The **recency guard** (`now − lastOnset ≤ 2 × latestGap`) suppresses a stale run (happened long ago) or a reversed one (a long quiet gap opened after the run) — the g-chart's own logic (an in-progress gap longer than the recent short gaps is the rate dropping). It only ever SUPPRESSES (never mints a fire, never reassures), so it cannot manufacture a signal; a §RECALL/staleness test pins that a run ending ≤5d ago fires while 10d/30d ago is silent (latest gap 3d, 2× = 6d threshold).

## Reviews — adversarial (MANDATORY) + code review

**`adversarial-reviewer` returned FAIL (medium — a calibration-disclosure gap, not a dangerous detector); resolved in-session.** It ran the deno sweep itself and confirmed the structure is sound — escalate-only/G5 (strict `<`, no lengthening branch, template-only + `validatePhrasing`), the recency guard (ratio + guard jointly force recency, no flicker), the n=5 floor (the conservative end), episode collapse, per-type isolation, and at-most-one selection **all HELD**. It also confirmed a genuine strength: because the fire check reads only the **last** `runLength` gaps (not a sliding scan), the by-chance base is a fixed 1/24 regardless of n — flat to n=1000, so it avoids ⑥'s scan-statistic trap; constant-rate + iid heavy-tail nulls hold at ~3–4% up to any n.

**The break** — and it's a real one — is that my sweep tested only **constant-rate** nulls, omitting the one class the ticket named ("a slowly-drifting rate") and the lane's own docstring names as its hazard ("wax and wane"). On an **autocorrelated / waxing-waning** rate (a rate that wanders *without* a trend), the last-4-monotone rate exceeds the iid 1/24 because the down-wander reads as acceleration (the RTM the lane guards against). Reproduced independently in-session (40k trials): an AR(1) log-rate Cox process at an extreme ~80× swing fires **~5.8%**, moderate Cox/Markov flare-quiet ~4.5–5.5% — so the original "≪5% on **every** null / worst ~3.55%" claim was the constant-rate worst, not the true worst.

**Resolution — the reviewer's own preferred option (a): keep runLength=4, add the omitted null, and DISCLOSE the residual honestly (the ⑥ discipline: name the residual, don't hide the null that produces it), NOT runLength=5.** Rationale: the lane's entire purpose is the sub-floor state, and runLength=5 raises the firing floor to 6 episodes — ⑦-chronicity's own floor — which erodes that mission; meanwhile the ~5.8% is on an *extreme* swing, it's a quiet band-4 escalate-only row whose counts always show, and its output (a TRUE "the gaps shortened", never a verdict/cause) is, on a genuinely waxing/waning disease, a flare worth a quiet note rather than a false alarm. Applied:
- Added a **variable-rate null class** (AR(1) Cox 80× + 36×, 2-state flare/quiet Markov) to the committed §PROPERTY SWEEP, asserting the residual **< 7% worst / < 6.5% pooled** with a *sanity floor* (worst > 4%, so the test can't rot into a no-op) — an honest, regression-guarding ceiling, not a hidden one.
- Encoded the **runLength=5 lever** as a measured fact (a test asserting it pulls the variable-rate residual < 2.5%).
- Rewrote every over-claiming docstring (detector header, `runLength` config, `DEFAULT_CONFIG`) to disclose the residual + point at the decision brief.
- **Surfaced the 4-vs-5 call to Dr. Chen/PM as a decision brief** (below), proceeding with 4 provisionally — the lane is dark (G10), so there is no production exposure while it's ruled.

**`code-reviewer` returned no correctness bugs** (independently ran `deno check` + the 492-test suite green); 4 non-blocking findings, all applied this session:
1. **[cleanup]** `medianOfGaps` duplicated the existing `median()` ~900 lines up in the same file → deleted, reuse `median()`.
2. **[real copy bug]** `formatGapUnit` bucketed day/hour off the *raw* hours but rounded independently, so a gap in [23.5, 24)h could render "24 hours" — a genuinely-shortening pair could read flat/backwards → round once, then bucket off the rounded value.
3. **[cleanup]** the "strongest shortening wins" test didn't exercise the comparator (the loser failed the ratio gate outright) → rewrote so both types fire, plus a dedicated recency + type-order tie-break test.
4. **[nit]** noted `TRIAL_VERDICT_RE`'s reuse by L4 at its declaration site.
It also folded `trial_response`/`gap_shortening` into the two universal guardrail sweeps that previously omitted them.

### Dr. Chen / PM decision brief — L4 gap run length: 4 or 5?
- **Deciding:** whether the shortening run must be 4 gaps (5-episode firing floor) or 5 gaps (6-episode floor).
- **Options:** **(A, recommended) runLength=4** — preserves the sub-floor mission (fires below ⑦-chronicity's 6-episode floor, where the lane is *meant* to speak), at a disclosed ~5–6% null FPR on autocorrelated waxing/waning rates (an ⑥-style accepted residual for a quiet, escalate-only, counts-shown row whose "false positive" is a true flare note); **(B) runLength=5** — a clean <2% on *all* nulls, but the 6-episode floor sits at ⑦'s own, eroding the reason L4 exists (a one-line change). Do **not** tighten `recencyGraceFactor` (the adversarial pass showed the guard is already load-bearing; tightening worsens over-suppression).
- **Consequence:** (A) ships the lane at its intended sensitivity with the residual documented + test-asserted; (B) trades the sub-floor mission for a cleaner FPR. Either way the lane stays **dark (G10)** until PR 10, so the ruling changes at most one constant before the gated redeploy.

## Gates / DoD

- **`deno test`**: full `generate-signal/` suite green (**495 pass**; +21 L4 detector incl. two §PROPERTY SWEEP classes + the runLength=5 lever + the calibration-lock + §RECALL + the structural invariant + the tie-break tests, +6 phrasing). `deno check` clean. App `tsc --noEmit` clean.
- **§PROPERTY SWEEP** (the required adversarial calibration gate, now TWO classes): (1) constant-rate/iid nulls (Poisson at several rates, uniform, periodic+jitter, heavy-tailed lognormal) < 3% pooled / < 5% worst-cell; (2) **autocorrelated waxing/waning nulls** (AR(1) Cox 80×/36×, 2-state flare/quiet Markov) asserted as a **disclosed ⑥-style residual** < 7% worst / < 6.5% pooled, with a sanity floor so it can't rot; plus the calibration-lock (runLength=3 exceeds 5%) and the runLength=5 lever (variable-rate < 2.5%). §RECALL: genuine 4-gap shortening runs fire; staleness suppressed.
- **Two invariants** (structural, always true when a finding emits): `recentGapsHours` strictly decreasing; `latest ≤ ratio × median`; `gapCount == episodeCount − 1`.
- **Adversarial review (MANDATORY): FAIL → resolved** (the variable-rate calibration-disclosure gap; option (a) disclose-and-accept, with the 4-vs-5 call surfaced as a Dr. Chen decision brief). **Code review: no correctness bugs; 4 findings applied.**
- **No new secret; no schema; no migration; no client change; NO redeploy** (G10 — inert until PR 10's gated redeploy behind `signals_v2`).

## Notes / follow-ups

- **PR 5–7 (CUL-12/13/14) render this.** L4 surfaces as the D2 **quiet watching/insight row**, not a full card; the finding carries `recentGapsHours` + `medianGapHours` + counts for that row. The §4.4 **watching-state row** ("watching N gaps" at ≥3 gaps, sub-floor) is the client watching system (PR 7), computed from local data — this server PR emits the FIRING finding; the ≥3-gaps watch floor (`minGaps`) is the anchor it reads.
- **G6:** no constant is tuned to Nyx's record — `runLength` is a null-model sweep result, the ratio a g-chart concept, the recency factor an escalate-safe guard.

## PR

Shipped via **#647** (draft) on `claude/cul-10-l4-gap-shortening-k1bxh2`.
