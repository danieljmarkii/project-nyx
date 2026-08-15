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

Both launched on the working-tree diff. **`adversarial-reviewer` (MANDATORY)** was asked to break the calibration specifically — to find a null model that pushes the FPR past 5% at runLength=4, to attack the escalate-only guarantee, the recency guard, and the median-coupling at the 4-gap floor — running the deno sweep itself. **`code-reviewer`** covers general health + house rules. Outcomes + any fixes are recorded here in a follow-up commit before the PR leaves draft (the initial commit lands the lane; fixes ride on top, the L2 pattern). Pre-review self-falsification (scratch, 5000 trials): heavy-tailed lognormal (σ up to 1.5), bimodal, drifting-random-walk-rate and gamma nulls all fire **< 3.72%** at the shipped config — the heavy-tailed worst case is now folded into the committed §PROPERTY SWEEP.

## Gates / DoD

- **`deno test`**: full `generate-signal/` suite **492 pass** (+18 L4 detector incl. the §PROPERTY SWEEP + calibration-lock + §RECALL + the structural invariant, +6 phrasing). `deno check` clean. App `tsc --noEmit` clean.
- **§PROPERTY SWEEP** (the required adversarial calibration gate): shipped config fires < 3% pooled / < 5% worst-cell on every constant-rate null (Poisson/exponential at several rates, uniform onsets, periodic+jitter); the calibration-lock asserts runLength=3 exceeds 5% (the trap). §RECALL: genuine 4-gap shortening runs fire; staleness suppressed.
- **Two invariants** (structural, always true when a finding emits): `recentGapsHours` strictly decreasing; `latest ≤ ratio × median`; `gapCount == episodeCount − 1`.
- **No new secret; no schema; no migration; no client change; NO redeploy** (G10 — inert until PR 10's gated redeploy behind `signals_v2`).

## Notes / follow-ups

- **PR 5–7 (CUL-12/13/14) render this.** L4 surfaces as the D2 **quiet watching/insight row**, not a full card; the finding carries `recentGapsHours` + `medianGapHours` + counts for that row. The §4.4 **watching-state row** ("watching N gaps" at ≥3 gaps, sub-floor) is the client watching system (PR 7), computed from local data — this server PR emits the FIRING finding; the ≥3-gaps watch floor (`minGaps`) is the anchor it reads.
- **G6:** no constant is tuned to Nyx's record — `runLength` is a null-model sweep result, the ratio a g-chart concept, the recency factor an escalate-safe guard.

## PR

Shipped via **#<n>** (draft) on `claude/cul-10-l4-gap-shortening-k1bxh2`.
