# 2026-08-21 — CUL-564: generate-report adopts the Signals v2 timing types; retire the composeV2 fork

**Mode:** BUILD. **Outcome:** shipped via #694 (draft). **Deploy:** none — `generate-report` stays `hold` (B-494).

## Problem

`detection.ts` is shared between `generate-signal` (Signal surface) and `generate-report` (vet report). Signals v2 GA'd on the Signal surface (CUL-546/GA-3), which flipped `detectSignals`'s composition to v2 by default and kept a `composeV2` toggle only so the report could stay byte-identical on the pre-v2 taxonomy. That pre-v2 report path **silently dropped** a post-prandial (⑤) finding whenever it merged with a same-symptom empty-stomach lane (L1) into a `timing_story` the report ignored on `default: break`. CUL-564 teaches the report the v2 finding types and finishes GA-3's cleanup (delete the toggle + legacy fork).

## Decisions (PM + Dr. Chen, this session)

Two v2 lanes were a PM call (the issue flagged it). Presented as decision briefs; ruled:

- **L2 `trial_response` → EXCLUDE from the report (PM).** The report's dedicated diet-trial section answers "is the trial working?" at higher fidelity; a second count block would duplicate it and risk a contradicting denominator.
- **L4 `gap_shortening` → EXCLUDE from the report (PM delegated to Dr. Chen; call made this session).** Governing precedent = the report's own §8.5 `Established`-only rule ("putting `Early` on the report would imply rigor the data lacks"). L4 is a sub-floor lane that fires at 4 episodes and is treated as a *quiet watching row* on the owner surface precisely because confidence is low. Falsification: a 4-vomit shortening run — excluding the row loses nothing (Appendix A + the §3.5 trend chart carry the cadence at full fidelity); including it prints a low-confidence trend as a *finding* on an authoritative page. Asymmetry decisive → exclude. Both stay owner-surface signals; reversible if real-vet feedback later asks for a cadence callout.

Both dropped as **explicit, commented switch cases** (auditable, not a `default` accident).

## What was built

- **`detection.ts`** — removed the `composeV2` param, `suppressTimeOfDayWhenPostprandialLegacy` (the pre-v2 unconditional ⑤→⑥ suppression), and the `SIGNALS_V2_DETECTOR_TYPES` skip set. `detectSignals` now always runs the v2 composition. **Behaviour-neutral for `generate-signal`** — it always called `detectSignals` with the default (v2) path.
- **`report.ts`** — `runDetection` calls `detectSignals(detInput, DEFAULT_CONFIG)`. `TimingFinding` became a proper discriminated union (4 kinds); the switch **extracts** `empty_stomach_timing` (L1) + `timing_story` and **explicitly drops** L2/L4.
- **`render.ts`** — `timingLine` renders the empty-stomach band and the merged story, band-named / associational only (never a syndrome name). The ⑤ line is byte-identical to pre-v2. The `timing_story` line **leads with its denominator** ("Of M timed episodes, N … and K …") so the un-named middle band reads as remainder, not a gap (Dr. Chen cold-read polish); the lone ⑤/L1 lines stay count-led.
- **Tests** — removed the three obsolete pre-v2 comparison tests (the fork is gone). Added `report.test.ts` end-to-end coverage: L1 extraction, and a real ⑤+L1 co-fire firing a `timing_story` (asserting the field mapping + the denominator invariant `rapid+long ≤ eligible ≤ totalEpisodes ≤ logged`). Added `render.test.ts` coverage of both new rendered lines.
- **Docs** — `nyx-vet-report-requirements.md` §3.8 + a v2.2 update note (Tier-2 — **flagged for PM ratification**, written into the draft PR).
- **`deploy-manifest.json`** — `generate-report` fingerprint bumped, stays `hold` (B-494, now a *real* behaviour change, not the behaviour-neutral GA-3 bump); `generate-signal` → `pending` (behaviour-neutral source drift, a redeploy owed to reconcile source).

## Gates (all pass)

- **Data Scientist (in-context):** denominator integrity holds (⑤/L1 share one eligible denominator; bands partition, so `rapid+long ≤ eligible`); the ⑥-suppression change is invisible on the report (⑥ isn't rendered); two-sided/no-reassurance preserved; L2/L4 exclusion keeps rigor uniform.
- **`adversarial-reviewer` — PASS.** 4000-input fuzz differential (OLD `detectSignals(…,true)` vs NEW always-v2) + 5 lane-firing fixtures → **byte-identical** (behaviour-neutral for the Signal surface). Co-fire → exactly one `timing_story`, rapid/long counts equal the lone-detector runs (no loss, no double-count). L2/L4 provably unreachable on the report (explicit drop + not `TimingFinding` kinds + zero rank/suppression side-effect).
- **`code-reviewer` — fix-before-merge, resolved.** The one gap (timing_story extraction untested end-to-end) → added the co-fire integration test.
- **`vet-report-cold-read` (Dr. Chen):** L1 report **CLINIC-READY**; story report **NOT READY → CLINIC-READY** after fixing a bad hand-injected fixture denominator (real co-fire artifact + the denominator-led phrasing polish). No syndrome over-claim on either.

## Follow-ups filed (out of scope)

- **CUL-566** — surface the timing line even when an Established food correlation is present (pre-existing `timingLine` early-return; the suppressed content is now richer). PM/Dr. Chen call.
- **CUL-567** — page-1 readability: null-correlation jargon on a single-food pet + the "N of M days" frequency-tile framing (pre-existing).

## Notes / not done

- **Not deployed.** The report code change is inert in production until the B-494 `generate-report` redeploy, which still owes its own refusal-lane adversarial + Dr. Chen sign-off (separate gate). This PR is one input to that redeploy, not the redeploy.
- Unused `median*SinceFeeding` fields ride the new `detail` shapes (parallel to ⑤'s existing unused median) — harmless dead payload, left for consistency.
