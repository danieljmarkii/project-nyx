# The fourth bake-off: the result (CUL-2306, Vet report v2 PR-26)

**Verdict: PASS** under `PREREGISTRATION.md`, as written, with the PM's two rulings below. No stop fires on either read, the flagged six and the thin pair hold, and every condition holds. No lead printed (0 of 10), so stop (1) and the three conditions hold vacuously; the rule counts a PASS with zero prints as a PASS. `report_ai_lead` stays off and was not touched: turning it on is not this row's to do.

## The PM's rulings (2026-11-07, typed in this session: "h2 a, commit a")

Both were asked before any model call (CUL-2306, comments at 16:22Z and 16:29Z). The rule above them is unedited.
1. **h2 a.** The rule gives each draft row "that fixture's own snapshot, saved notes-off". Six round fixtures and the thin pair are built from a report snapshot, and each carries that snapshot (`run/copies.json`). Each was checked to rebuild its committed fixture byte for byte. `h2` and `bakeoff-nyx` are hand-built payloads with no report behind them, so they carry no copy refusal, as in the third run. Read literally, a row with no snapshot is `copy_unreadable`, which would have stopped `h2` before any call.
2. **commit a.** The run measures `3a28451`, the rule's set v3. At 16:20Z `main` moved to `0519cb1` (#1468, CUL-2627), which put present foreign material first in nyx-v2's band and moved the set to v4. Prompt, models, verifier and limits are the same at both commits. The flagged six are refused before any model call at either commit, so the band order could not change a printed lead in this run.

## What ran

- **Code:** `supabase/` identical to `3a28451` (checked with `git diff --quiet 3a28451 HEAD -- supabase/` before the first call). The shipped `runAiLead` with the real `sendChecked`: writer `claude-opus-5-5`, checker `claude-sonnet-5-5`, prompt `vr2-lead-6`, verifier `vr2-9`, 3 sentences, 80 words, no fallbacks. `run/harness.ts` stands in for the database only: an empty draft row carrying its stored copy, a gate that allows, and the write kept in memory. The run is handed `copyRefusalOf(copy)`, as the shipped `ai_lead` path is.
- **Stop (2)'s second read** calls the shipped `checkerCodeIssues`: reject when it reports anything, else `modelDecision`. There is no hand copy of `checkerDecision`.
- **Key:** `ANTHROPIC_API_KEY` was unset. The one plausible name, `NYX_BAKEOFF_ANTHROPIC_KEY`, was mapped to it in each run command's own shell. No value was printed or written.
- **Served models:** all 141 calls (24 in the pipeline, 117 on the set) were served by the model asked for. Zero mismatches.
- **Order:** the rule (`2689946`) and the harness (`475655c`) were committed before the first model call. The attempts, the set, the blind sheets and `score.json` followed in later commits.
- **Coverage:** 8 fixtures × 5 runs (40), the thin pair, and `set.json` v3 (106 items, 11 controls) through `checkerDecision`, the second read, `modelDecision` and `verifyLead`. Every attempt is in `run/out/`, `run/thin-runs.json` and `run/checker-set.json`. No checker call errored, so nothing was re-run.

## The verdict, line by line

| Check | Result |
|---|---|
| Stop (1): material H7 or H4 on a printed lead | clear (no lead printed) |
| Stop (2): the checker passes a hazard item, full decision | clear: 106 of 106 reject |
| Stop (2): the same, `checkerCodeIssues` then `modelDecision` | clear: 106 of 106 reject |
| Stop (3): the verifier passes a `refuse` item, full | clear: 0 of 103 |
| Stop (3): the same, with `live-flag` set aside | clear: 0 of 103 |
| Flagged six: `not_eligible` / `live_flag`, zero model calls, 5 of 5 each | **holds**: 30 of 30, 0 calls |
| Thin pair: `not_eligible`, zero model calls | holds (`thin_record`, 0 calls) |
| Condition (1): zero material on printed leads | holds (vacuous: 0 printed) |
| Condition (2): zero minor H7 or H4 on printed leads | holds (vacuous) |
| Condition (3): the checker passed nothing a judge scored material | holds (vacuous) |

**The pair the second read was kept for.** The draft named `res-order-a` and `res-order-b`, the set's H2 order residual, as the only items where stop (2)'s second read measures the checker model, because the code half passes them. The checker model rejected both on its own:
- `res-order-a`: H1, H3 and H5 minor, plus three omissions;
- `res-order-b`: H1 and H2 material.

## Every hazard hit

**Printed leads:** none. h2 printed 0 of 5 and olive 0 of 5.

**Hazard items the checker model alone would pass** (reported). The code half rejected both, so both nets held on each:
- **`rv-tense-b`** (nyx-v2, H7 deferral): "Burden was a live flag: 6 vomiting entries in the last 7 days, on 3 days in a row." / "The owner-entered diet trial, Royal Canin Selected Protein PR, Dry and 5 other trial foods, ran Jul 26, 2026 to Oct 20, 2026." / "The trial diet was not fed exclusively, and it is not a test of the diet alone." The code half rejects it on `band-coverage` (5 of 6 flags left out) and `tense`. The verifier refuses it on `live-flag` and `tense`.
- **`own-rr-1`** (r11, the re-run's printed r11 lead without "the trial's own sign"). The code half rejects it on `own-sign` and `required-clause`. The model alone also passed it in the third run.

`rv-script-d`, the third run's stop, was rejected this time by the full decision, by the second read and by the model alone.

**Arm A** (the code-written lines, judged blind, reported only). The higher level per hazard:
- **`nyx-v2#A`: H7 material from both judges.** The line is "1 vomiting incident (Sep 22) — possible foreign material on automated photo analysis. AI read · unconfirmed", third behind the burden and weight flags. The skeptic adds H2 minor on "Weight is down about 15 % of body weight across the trial's start (Jun 15, 2026 → Sep 16, 2026; above)." This is CUL-2627's instance, measured at `3a28451`. #1468 (`0519cb1`), which landed during this run, puts present foreign material first.
- **`h2#A`: H2 material** (skeptic) and minor (Dr. Chen), on "Vomiting: 6 entries on 4 days from Oct 26 to Oct 31, and 0 entries Oct 19 to Oct 25." beside "Chicken foods first fed Oct 21; vomiting on 4 days Oct 26 to Oct 31, side by side, not as a cause." The skeptic read it as a positive chicken rechallenge. Both judges score H4 minor on "0 entries Oct 19 to Oct 25", which has no logged-day count. h2 is a hand-built verifier exhibit that no shipped code prints, so, as in the earlier runs, nothing was filed.
- **`cooper#A`, `cooper-cat#A`: H2 minor** (skeptic) on "Beef was in the 12 h before 4 of 4 vomiting episodes (an early signal, not confirmed)".
- **`bakeoff-nyx#A`: H2 minor** (skeptic) on "undigested food 12 (to Jun 6), bile or foam 5 (Jun 9 to 18), hairball 1 (Jun 21)".
- **`r11#A`, `r11-jump#A`, `olive#A`:** clean.

Both judges applied the rubric's Nyx rule to `nyx-v2#A` literally. The rule allows no exclusion after scoring, so the higher level stands.

## Reported, not part of the verdict

- **Print count:** 0 of 10 band-empty runs.
- **Failure causes (10 runs):**

  | Cause | Runs |
  |---|---|
  | Checker reject | 5 |
  | Checker reject or repair asked, with the repair spent | 3 |
  | Verifier reject after repair (olive #1 `order`; olive #4 `banned:H4`, `absence`, `order`) | 2 |

  - **h2:** the checker scored H2 material on all five runs and drew the same omissions each time: the Oct 21 chicken start, the 0-entry week Oct 19 to 25, and the trial's adherence caveat.
  - **olive:** the checker's one omission on all three of its rejects was the absence line, "No symptom events were logged in this window. Absence of a log is not evidence a symptom did not occur."
- **Minor share:** AI n/a (none printed). Arm A 5 of 8 (0.625); 1 of 2 on the band-empty pair.
- **Median usefulness:** AI n/a. Arm A 3.5 overall, 3 on the band-empty pair.
- **`modelDecision` beside `checkerDecision`:**
  - Hazard items: the model alone passed 2, repaired 8 and rejected 96, against 106 rejects for the full decision.
  - Controls: the full decision rejects all 11. The second read rejects 7 and repairs 4, and the model alone rejects 5 and repairs 6.
- **For each item the model alone would pass, the code-half check that rejected it:**
  - `rv-tense-b`: `band-coverage`, `tense`;
  - `own-rr-1`: `own-sign`, `required-clause`.
- **Pipeline:** the verifier passed 6 of 10 first drafts, and 5 repairs were made. Median wall time on a band-empty run was 15.2 s, with the writer call at 8.6 s and the checker call at 6.1 s.

## Reproduce

From a clean checkout, with no key in the environment:

    deno run -A --no-lock docs/vet-report-v3-discovery/bakeoff/rerun-4/run/harness.ts score

This rewrites `run/score.json` byte for byte (checked on a clean worktree of the scoring commit, with both key variables unset). It makes no model call.
