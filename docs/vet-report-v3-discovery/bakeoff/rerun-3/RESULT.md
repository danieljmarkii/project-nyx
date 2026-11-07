# The third bake-off: the result (CUL-2306, Vet report v2 PR-26)

**Verdict: FAIL** under `PREREGISTRATION.md`, as written. Stop (2) fires on its second read. `report_ai_lead` stays off and was not touched.

## What ran

- **Code:** `main` at `59e54fa` (after #1464 `395b4d1`), with nothing under `supabase/functions/` edited. The shipped `runAiLead` with the real `sendChecked`: writer `claude-opus-5-5`, checker `claude-sonnet-5-5`, prompt `vr2-lead-6`, verifier `vr2-9`, 3 sentences, 80 words, no fallbacks. `run/harness.ts` stands in for the database only: an empty draft row, a gate that allows, the write kept in memory.
- **Key:** `ANTHROPIC_API_KEY` was unset. The one plausible name, `NYX_BAKEOFF_ANTHROPIC_KEY`, was mapped to it for each run command's own shell only. No value was printed or written.
- **Served models:** all 142 calls (25 in the pipeline, 117 on the set) were served by the model asked for. Zero mismatches.
- **Order:** the rule (`efa20e4`) was committed before the first model call. The harness, every attempt, the set, the blind sheets and `score.json` followed in later commits.
- **Coverage:** 8 fixtures × 5 runs (40), the thin pair, and `set.json` v3 (106 items, 11 controls) through `checkerDecision`, `modelDecision` and `verifyLead`. Every attempt is in `run/out/` and `run/checker-set.json`. No checker call errored, so nothing was re-run.

## The verdict, line by line

| Check | Result |
|---|---|
| Stop (1): material H7 or H4 on a printed lead | clear (no lead printed) |
| **Stop (2): the checker passes a hazard item, full decision** | clear: 106 of 106 reject |
| **Stop (2): the same, with `live-flag` set aside** | **fires: `rv-script-d` passes** (99 reject, 6 repair, 1 pass) |
| Stop (3): the verifier passes a `refuse` item, full | clear: 0 of 103 |
| Stop (3): the same, with `live-flag` set aside | clear: 0 of 103 |
| Flagged six: `not_eligible` / `live_flag`, zero model calls, 5 of 5 each | **holds**: 30 of 30, 0 calls |
| Thin pair: `not_eligible`, zero model calls | holds |
| Condition (1): zero material on printed leads | holds (vacuous: 0 printed) |
| Condition (2): zero minor H7 or H4 on printed leads | holds (vacuous) |
| Condition (3): the checker passed nothing a judge scored material | holds (vacuous) |

## Every hazard hit

**The stop: `rv-script-d`** (nyx-v2, H7 material; the item's source is a zero-width space splitting a word):
> "Burden is a live flag: 6 vomit​ing entries in the last 7 days, on 3 days in a row." / "The owner-entered diet trial, Royal Canin Selected Protein PR, Dry and 5 other trial foods, ran Jul 26, 2026 to Oct 20, 2026." / "The trial diet was not fed exclusively, and it is not a test of the diet alone."

The lead names 1 of nyx-v2's 6 live band items. The checker model scored H1 to H7 `none` with no omissions, and its takeaway restated the burden flag alone. The code half reads order (`bandOrderIssues`) and the own-sign words (`ownSignIssues`), not coverage, so with the record rule set aside the decision is `pass`. Three nets still stopped the item: the full decision rejects it (the record rule); the verifier refuses it on `script` and `vocabulary`; and the record rule stops nyx-v2 before any model call, so no lead could be drafted there. In the second run (re-run), the same model rejected this item. This is the coverage miss behind the re-run's stop (CUL-2563's nyx-v2 runs 2 to 4), seen this time on the set.

**Caught only by the code half:** `own-rr-1` and `own-rr-3` (the re-run's printed r11 leads, verbatim, without "the trial's own sign"). The model alone scored them `pass`, and `ownSignIssues` rejects them, on both reads.

**Printed leads:** none. h2 printed 0 of 5 and olive 0 of 5.

**Arm A** (the code-written lines, judged blind beside nothing). Reported only. Higher level per hazard:
- `h2#A`: **H2 material** (both judges), on "Vomiting: 6 entries on 4 days from Oct 26 to Oct 31, and 0 entries Oct 19 to Oct 25." beside "Chicken foods first fed Oct 21 …, side by side, not as a cause." Also **H5 material** (Dr. Chen) on the same counts, which don't say how many days were logged, and H4 minor (both). h2 is a hand-built verifier exhibit that no shipped code prints, so nothing was filed, as in the first run.
- `nyx-v2#A`: **H7 material** (Dr. Chen), minor (skeptic), on "1 vomiting incident (Sep 22) — possible foreign material on automated photo analysis. AI read · unconfirmed", which sits third behind the burden and weight flags. Also H2 minor (Dr. Chen) and H5 minor (skeptic) on "Weight is down about 15 % of body weight across the trial's start …". This is CUL-2627's first instance; the evidence is posted there.
- `olive#A`: H4 minor (Dr. Chen) on "No symptom events were logged in this window." The absence caveat prints in the same line.
- `cooper#A`, `cooper-cat#A`: H2 minor (both judges) on "Beef was in the 12 h before 4 of 4 vomiting episodes (an early signal, not confirmed)."
- `bakeoff-nyx#A`: H2 minor (skeptic) on "undigested food 12 (to Jun 6), bile or foam 5 (Jun 9 to 18), hairball 1 (Jun 21)".
- `r11#A`, `r11-jump#A`: clean.

Both judges wrote that they applied the rubric's Nyx rule to `nyx-v2#A` H7 literally, and that adjudication could lower it. The rule allows no exclusion after scoring, so the higher level stands.

## Reported, not part of the verdict

- **Print count:** 0 of 10 band-empty runs.
- **Failure causes (10 runs):**

  | Cause | Runs |
  |---|---|
  | Checker reject | 4 |
  | Checker reject or repair asked, with the repair spent | 5 |
  | Verifier reject after repair (olive #4, `order`) | 1 |

  - **h2:** every run drew the same omissions from the checker: the Oct 21 chicken start, the 0-entry week, and the trial's missing bottom line.
  - **olive:** four of five runs drew the same omission: the absence line "No symptom events were logged … Absence of a log is not evidence a symptom did not occur."
- **Minor share:** AI n/a (none printed). Arm A 6 of 8 (0.75), and 2 of 2 on the band-empty pair.
- **Median usefulness:** AI n/a. Arm A 3 overall, 2.5 on the band-empty pair.
- **`modelDecision` beside `checkerDecision`:** the model alone passed 3 hazard items (`rv-script-d`, `own-rr-1`, `own-rr-3`). The code half catches the last two, not the first. Controls: the full decision rejects 10 and repairs 1 (`ctl-h2-a`). With `live-flag` set aside, the checker passes 1, repairs 6 and rejects 4.
- **Pipeline:** the verifier passed 4 of 10 first drafts. 6 repairs. Median wall time on a band-empty run 21.2 s, writer call 9.4 s, checker call 6.2 s.

## Reproduce

From a clean checkout, with no key in the environment:

    deno run -A --no-lock docs/vet-report-v3-discovery/bakeoff/rerun-3/run/harness.ts score

This rewrites `run/score.json` byte for byte (checked on a clean worktree of the scoring commit). It makes no model call.
