# Session — Signals v2 PR 9 (CUL-11): Patterns panels — Timing distribution + The trial so far

**Date:** 2026-08-15
**Branch / PR:** `claude/cul-11-patterns-timing-li6p5f` → shipped via #649 (draft)
**Track:** Signals v2 — the record, decomposed (B-755); spec `docs/nyx-signals-v2-requirements.md` §4.5, D9

---

## Build phase

Signals v2 **PR 9 of 10** (CUL-11). Depends only on PR 1 (CUL-6, `lib/mealTiming.ts` — merged #639); blocks PR 10 (CUL-15, the copy/safety pass + the single gated `generate-signal` redeploy + beta-shelf row). No server, no schema, no deploy.

## What was built

Two additive panels on the Patterns dashboard (`app/insights`), dark behind `signals_v2`:

- **Timing** — the full-record meal-relative vomit-timing distribution. `lib/patternsTiming.ts` (pure `buildTimingDistribution` + the `patternsTimingPos` / `patternsTimingAxis` geometry + copy; thin DB reads). Every timeable episode is a real dot on the `ate · 30m · 1h · 2h · 4h · 8h+` axis (linear head, log₂ tail); three band-count rows; untimed episodes disclosed as a count + a per-reason breakdown in the detail. `components/dashboard/TimingDistribution.tsx` (dot lane), `TimingPanelCard.tsx`, `app/insights/timing.tsx`.
- **The trial so far** — `lib/patternsTrial.ts` (pure `buildTrialSoFar` + copy; DB wrapper). Per-phenotype vomit-timing rows + diet-structure rows (treat share, meals/day) + the "shows what, not why" line, windowed on `TrialFacts.exposureRange` (the evidence bound). `components/dashboard/TrialSoFarCard.tsx`, `app/insights/trial.tsx`.
- Wired into `app/insights/index.tsx` behind the two-gate flag.

**G9 held throughout:** all meal-relative timing runs through `lib/mealTiming` (`collapseEpisodes`/`classifyEpisodeSet`); the geometry never re-decides a band (adversarial-confirmed, boundaries match the classifier to 1e-12). The trial day-count comes from `getDietTrialProgress` (the one day-math path); `loggedDays` mirrors the engine's `loggedDaysIn` (feeding OR correlation-symptom day) via the client mirror `CORRELATION_SYMPTOM_TYPES`.

## Gates run

- **`adversarial-reviewer`** (timing math + trial evidence window) — **core SOUND**: G9, collapse-then-window, the `exposureRange`/B-494 evidence bound, geometry monotonicity/clamp/tick-alignment, band-fraction denominators, and the artifact-pattern protections all held under counterexamples. Broke one thing → the trial zero-wall (below); flagged denominator transparency.
- **`pm-feature-review`** (Designer gate) — NEEDS-WORK on both panels, blocking on the trial zero-wall + the Timing under-read; several copy/legibility gaps.
- **`code-reviewer`** — fix-before-merge on four findings (all fixed); confirmed SQL parity, `assignJitterRows` rationale, theme tokens, a11y, copy all clean.

All findings addressed across two review passes (commits `5770f2d`, `2b3c002`). tsc clean; full jest green (224 suites / 4993, +48 new incl. a real-`node:sqlite` DB-read suite).

## Decisions made

- **Trial zero-state (blocking, caught by BOTH pm-feature + adversarial).** A just-started or dermatologic (zero-vomiting) trial used to render a wall of "— 0" rows + "0 timed of 0", reading as an all-clear — reassurance-on-absence on the wedge surface. New `trialPhenotypeState`: **`empty`** (no in-window vomiting) → the phenotype section is **dropped** (omission claims nothing; no D2 absence-sentence needed); **`none_timeable`** (episodes logged, none placeable) → an honest line that **discloses the burden** ("N vomiting episodes logged … none could be timed"), never zero rows; **`rows`** unchanged. Applied to the card AND the detail route; unit- + screen-test-pinned. This sidesteps the open D2 gate (no absence-shaped *sentence* is rendered).
- **Two-gate flag (`eligible && optedIn`).** Corrected from a single allowlist check to mirror SignalZone — `signals_v2` is not in the beta registry until PR 10's shelf row, so the panels are dark for everyone today, including an account already on the server allowlist.
- **`loggedDays` = feeding OR correlation-symptom day**, matching the engine, so the panel and the future Signal trial card never disagree on `mealsPerDay` for the same window.
- **Denominator honesty:** treat share reads "X% of meals & treats" (the real classifiable denominator), not the misleading "of feedings".
- **Axis:** kept the CUL-11-specified `ate · 30m · 1h · 2h · 4h · 8h+` (a distribution needs the long tail spread), deliberately wider than the A2 card's `ate · 30m · 2h · 6h+`; the 6h boundary is carried by the shaded tail.

## Persona flags raised / resolved

- Designer + Data/Dr. Chen (adversarial) converged on the zero-wall → resolved (above).
- Data (adversarial): denominator transparency → resolved (meals & treats naming).
- Engineer (code-review): staged-rollout leak, multi-pet stale render, evidence-lineage parity, route leak → all resolved.

## Open questions surfaced (for the PM / Designer — decision briefs)

1. **Timing axis reconciliation (cross-surface).** *Deciding:* whether the Patterns Timing panel and the A2 timing card (PR 5) share one axis. *Options:* keep the two (distribution vs compare — **recommended**, they do different jobs) / adopt the A2 `6h+` axis on Patterns (loses the long-tail spread) / design a shared axis in round 2. *Consequence:* a round-2 mock item (CUL-18); nothing else blocks.
2. **Whole-record scope on the Timing panel** (vs the dashboard's 30-day cards). *Options:* keep whole-record with the "· whole record" tag (**recommended** — a distribution wants all the data) / add a Week/Month/3-Month control like the symptom detail (B-093 lineage). *Consequence:* the control is a follow-up, not a blocker.
3. Both are **round-2 / PR-10** refinements, not PR-9 blockers.

## Known issues / tech debt

- The two panel loaders each re-run the three local reads (6 full-record scans, not 3) so the standalone detail routes stay self-sufficient — acceptable for a dark beta surface; noted in code.
- On-device / VoiceOver pass still owed (static review only) — folds into PR 10's flag-on QA.

## PM action items

- [ ] **Rule the two round-2 design calls** (axis reconciliation, whole-record scope) — or defer to CUL-18. Neither blocks this PR.
- [ ] Nothing to provision/deploy — no schema, no secret, no Edge Function. The `generate-signal` redeploy is PR 10 (CUL-15), still gated on B-494.

## Recommended next steps

1. **PR 10 (CUL-15)** — copy/safety pass, S10 audit, flag-on QA script, the beta-shelf row (which is what finally lets `optedIn` flip), the single gated redeploy, GA rec. This is the natural next item; it depends on PRs 2–9 (all now down except 6/7).
2. **PRs 6 & 7** (trial card line + Signal trial card; the watching system) — parallel-safe, independent files; the one shared-file collision is STATUS.md at wrap.
3. **Round-2 mock (CUL-18)** — fold these panels' frames in and resolve the two open design calls.

## Next Session Kickoff

**Recommended first prompt:**
> Signals v2 PR 10 (CUL-15): the copy/safety pass + flag-on QA + beta-shelf row for `signals_v2` + the single gated `generate-signal` redeploy. Read `docs/nyx-signals-v2-requirements.md` §5/§7/§9 and the PR-9 session record first; the redeploy is still B-494-gated.

**Alternates:**
- Signals v2 PR 6 (CUL-13): the trial card standing line + the Signal trial card + expands, dark behind `signals_v2`.
- Resolve the two PR-9 design calls (Timing axis reconciliation + whole-record scope) into round-2 mock frames (CUL-18).

## Documentation updates

- **CLAUDE.md** — no change (no new convention; the panels follow the analytics pure-core + thin-wrapper and the B-712 two-gate patterns already documented).
- **New mock:** `docs/culprit-signals-v2-patterns-mockups.html` (Artifact https://claude.ai/code/artifact/3d5ae054-477b-4a71-996e-ddd0679eabec) — the two panels + the review-changed states, real dot-lane geometry. Feeds round 2 (CUL-18).
- **STATUS.md** — Signals v2 track line updated with PR 9.
