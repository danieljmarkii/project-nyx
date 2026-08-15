# Signals v2 PR 6 (CUL-13) — the trial surfaces

**Date:** 2026-08-15

Built PR 6 of the Signals v2 track (B-755): the two D3-ruled trial surfaces — the **standing trial-card line** on the Home strip and the **event-driven Signal trial card** + expand. Client-only, no server behaviour change, **no redeploy** (G10 — Signals v2 stays inert in production until PR 10 lands behind `signals_v2`). Dark behind the `signals_v2` client flag; flag-off is byte-identical (snapshot-pinned). Renders the `trial_response` finding PR 3 (CUL-8, #644) emits. Design authority = `docs/culprit-signals-v2-mockups.html` §04 (mock round 2). Gate: Designer.

## What was built

### The Signal trial card (renders the cached `trial_response` finding)
- **`lib/signal.ts`** — `TrialResponseFinding` client mirror (rendered fields of detection.ts's `TrialResponseFinding`), added to `InsightType` + the `SignalFinding` union. `densityComparable?` is optional (old-cache tolerant → treated as comparable).
- **`lib/signalCopy.ts`** — the client-composed pieces around the server lead (`cached.text`):
  - `trialResponseCompareRows` — the two count rows, **time-ordered** (rapid ≤30m, then long ≥6h), each **two-sided** via a new optional `CompareRow.baseline` ("4 · was 8" / "0 · was 7" — G2). Labels are the **mechanism-free** band labels the A2 timing card uses (`Within 30 min of eating` / `6h+ after eating`) — never "empty stomach" (MECHANISM_RE); the mock's "Empty-stomach (6h+)" label was a mock shorthand that would fail the guardrail. A phenotype present during the trial (trial count ≥1) wears the symptom hue descriptively; a zero rides muted (empty bar).
  - `trialResponseDayBadge` ("Day N of M" / "Day N"), `trialResponseSampleLine` ("counted from days you logged"), `trialResponseDensityLine` (the C5 logged-days denominators + the uneven-logging caveat when `densityComparable === false`), `trialResponseDietStructureLine` (the "what else changed" diet-structure deltas in **words** — coarse treat-share buckets + meals/day as "from about 2 to about 4"; no "%", B-733; only clauses that meaningfully changed render).
  - `TRIAL_RTM_CONFOUND` (the §2 L2 verbatim "three things changed at once…"); reuses the shipped `TRIAL_ADJACENCY` (G9 — one string, the mock's adjacency line is byte-identical to the reflection card's).
  - `isTrialResponse` + `isSignalsV2Finding` (the one predicate the card gate and the zone filter both read). `sampleLine`/`evidenceText`/`medContextOf` gained `trial_response` branches (kept total over the union).
- **`components/home/SignalReceipts.tsx`** — `StackedCompare` extended for the two-sided "N · was M" form + baseline-aware bar scaling (a reduction reads as a shorter bar). Purely additive: a single-count (timing/⑤/⑥) row set is byte-identical.
- **`components/home/InsightCard.tsx`** — `TrialResponseBody` (face) + `TrialResponseExpanded` (RTM/confound box + "what else changed" box + med line), registry entry, the flag gate generalised to `isSignalsV2Finding`, and the a11y label + expand branch extended.
- **`components/home/SignalZone.tsx`** — the flag-off LiveStack filter switched from `isTimingStory` to `isSignalsV2Finding` (drops `trial_response` too, keeping the divider/lead rhythm correct).

### The standing trial-card line (local data)
- **`lib/trialResponseCounts.ts`** (NEW, pure, Deno-portable) — `computeTrialResponseCounts`: a faithful reproduction of `detectTrialResponse`'s count windowing (local-day-index windows B-514/B-517, `collapseEpisodes` 3h collapse-then-window via `lib/mealTiming` — the same predicate the detector's `toEpisodeOnsets` is, G9, 49d baseline), returning trial/baseline vomit counts + logged-days + the day number. `.ts` import extensions so the generate-signal deno suite (the parity test) can load it.
- **`lib/dietTrialCard.ts`** — `trialResponseStandingLine` (the copy: the two-sided comparison when both windows clear `minLoggingDaysPerWindow`=7 logged days; the trial-so-far form below the floor; null when there's no vomiting to describe — never a proactive "0"), plus `trialResponse` on `TrialCardInput` and `trialResponseLine` on `TrialStripModel`, wired through both `resolveTrialStrip` returns (suppressed under a live intake-decline flag — never a count beside a safety flag).
- **`lib/dietTrialFacts.ts`** — `readTrialResponseCounts` (one local read over the padded [baseline start, now] window: vomit onsets + all logged-event instants), gated in `loadDietTrialFacts` on a new `signalsV2` param + a running trial (overlaps the two existing lanes).
- **`hooks/useDietTrial.ts`** — resolves the two-gate `signals_v2` flag (`useAllowlistFlag && useBetaOptIn`, mirroring SignalZone) and passes it, so the extra read is skipped flag-off (byte-identical, zero cost) and re-runs on a flag flip.
- **`components/home/TrialStrip.tsx`** — renders `model.trialResponseLine` as a second line below the coverage line; folds it into the strip's a11y label when present (the Pressable's explicit label would otherwise swallow it).

## The one real architecture decision — the standing line is a SECOND count computation, pinned by a parity test (not a detector rewire)

The strip sits directly below the Signal trial card on Home, and both name the same pooled vomit counts (the strip locally; the card's server lead from the cached finding). If the two counting algorithms drift, the two surfaces print **different numbers for the same trial on the same screen** — the §5.3 "one-record-two-answers" failure, one layer out. The clean fix is ONE shared predicate both call, but `detectTrialResponse`'s window predicates (`inTrialEra`/`inBaseline`/`dayIndexOf`) are reused across its phenotype + diet-structure blocks, so a clean extract-and-rewire is a larger refactor than PR 6's client charter (server=no) — and it would re-open the detector's adversarial review. So:

- `lib/trialResponseCounts.ts` is the client's implementation, written to reproduce the detector's windowing exactly (same helpers: `collapseEpisodes`, `localDayIndex(Of)`, `trialDayCounter`, same 49d baseline).
- A **parity test** in `detection.trialResponse.test.ts` runs BOTH sides on the same firing inputs and asserts the shared predicate reproduces the detector's emitted `pooledTrialCount`/`pooledBaselineCount`/`trialDayNumber`/`trialLoggedDays`/`baselineLoggedDays` — so a future windowing/collapse change to either side fails CI.
- **Follow-up filed:** rewire `detectTrialResponse` onto `computeTrialResponseCounts` in a dedicated server PR (true one-predicate), guarded by the parity test until then.

The standing line deliberately does NOT gate on the C-test or density (it's the un-gated raw-count surface — the detector's own config comment names it: "the trial-so-far counts still show on the standing Pet-tab line"). It DOES gate the baseline clause on the same `minLoggingDaysPerWindow`=7 floor, so a brand-new account never sees a misleading "0 in the 7 weeks before" over a period it never observed.

## Decisions / deviations from the mock (Designer gate)
- **Time-ordered count rows** (rapid, then long), not the mock's data-driven long-first order — matches the shipped A2 timing card's §4.1 time-ordering (R2-1's recommendation) rather than baking in Nyx-specific emphasis.
- **Mechanism-free row labels** — the mock's "Empty-stomach (6h+)" would trip MECHANISM_RE; shipped the timing card's guardrail-clean labels. The mock's own §01 established mechanism-free copy, so this is honouring the mock's intent over its shorthand.
- **The diet-structure "what else changed" box IS built** (the mock includes it and the finding carries `treatShare`/`mealsPerDay`), phrased conservatively in words. Flagged for the Designer gate — the coarse treat-share word buckets are a presentation choice worth a look.
- **D2 absence-shaped sentence NOT built** — gated on Dr. Chen (CUL-17, open). The count-row form is the unconditional shipping form; only the LEAD would change under D2, over identical rows.

## Gates / DoD
- **tsc** clean. **jest** 5003 pass (221 suites), incl. new `lib/trialResponseCounts.test.ts` (15), signalCopy trial-card copy tests, InsightCard trial-card flag-on/off + snapshot, dietTrialCard standing-line, TrialStrip render, SignalZone filter. **7 flag-off snapshots unchanged** (byte-identical confirmed) + new flag-off `null` snapshots pinned.
- **deno** (generate-signal) 498 pass incl. **3 new parity tests** (fewer / more / re-log-collapse) — the §5.3 pin. Ran locally against a freshly-installed Deno 2.9.5.
- **No schema, no migration, no new secret, no client-visible change flag-off, NO redeploy** (G10).
- **Reviews:** code-reviewer + adversarial-reviewer (never-reassure / count-integrity) + pm-feature-review (the Designer/product read of the wedge surface) — run in parallel; outcomes folded in before merge.
- Persona sign-off: Engineer ✓ (G9 shared collapse predicate + parity pin; local-day-index windowing; flag-gated compute skips flag-off; Rules of Hooks) — Data ✓ (the counts reproduce the C-test-gated detector by construction, parity-tested) — Designer: the mock is the authority; deviations named above for the gate — Dr. Chen: D2 sentence deferred to him (CUL-17).

## Notes / follow-ups
- **PR 10 (CUL-15)** carries the single gated `generate-signal` redeploy + the flag-on QA + the beta-shelf row. Until then this is dark for everyone.
- **Follow-up:** rewire `detectTrialResponse` onto `lib/trialResponseCounts.ts` (true one-predicate) in a server PR — parity-pinned until then.
- The Signal trial card only surfaces when `changedMaterially` (PR 3's trigger); under the still-open **PR-3 fewer-direction decision** (escalate-only vs ship-the-fewer, Dr. Chen/PM), Nyx's improving trial may mint no Signal card at all — the standing strip line + Patterns (PR 9) carry the story regardless. The client renders whatever the server emits, so this PR is direction-agnostic.

## PR
Shipped via **#650** (draft) on `claude/cul-13-trial-surfaces-signal-hs8w3d`.
