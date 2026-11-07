# Vet report v2 PR-26: the third bake-off of the AI summary

**Date:** 2026-11-07
**One thing:** D3 L2: a net you read "with the other net set aside" is a separate test, and it can fail while the product is safe · check: pending

Dispatched DISCOVERY row (CUL-2306), branch `claude/vet-report-v2-pr26-11071418`; shipped via the PR titled "Vet report v2 PR-26: the third bake-off of the AI summary" (left for the PM: the run failed, so it names no issue).

## What happened

- **A stop before any call.** The approved rule named prompt `vr2-lead-5` and also "`main` unedited". Since #1462, `main` has shipped `vr2-lead-6`. I stopped and posted a brief, and the PM typed "Let's go option a" in this session. `PREREGISTRATION.md` landed with two corrections (set v3, prompt `vr2-lead-6`) as the first commit, before any model call.
- **The key.** `ANTHROPIC_API_KEY` was unset. `NYX_BAKEOFF_ANTHROPIC_KEY` was mapped to it per command shell, and no value was written. All 142 calls were served by the model asked for.
- **The run.** All six flagged fixtures ended `not_eligible` / `live_flag` with zero model calls, 30 of 30 runs. The thin pair held. The band-empty pair (`h2`, `olive`) printed 0 of 10: 9 checker rejects and 1 verifier reject.
- **The verdict: FAIL** on stop (2)'s second read. With `live-flag` set aside, the checker passed `rv-script-d`, nyx-v2's burden flag alone (1 of 6). The full decision rejects all 106 items, and the verifier refuses it. Full table: `docs/vet-report-v3-discovery/bakeoff/rerun-3/RESULT.md`.
- **Reproduced.** A keyless clean worktree rewrote `score.json` byte for byte.

## Filed

- CUL-2629 (QUIET, `Live harm`, `Gate: clinical`, `Waiting on PM`; believed dark): the checker model's coverage miss, with every instance listed. It needs a `blocks` relation to the go-live issue, which this session could not write.
- Comment on CUL-2627: `nyx-v2`'s code lines scored H7 material (Dr. Chen) on the foreign material sitting third.

## Residual

The record rule makes the checker's coverage miss unreachable today. The rule as written still counts the miss when that net is set aside, and the next run must either close the miss in code or be ruled to read stop (2) on the full decision alone.

## Teach

**D3 · Reading a test: what it proves and what it cannot** (L2)

A test that asks "would net B hold without net A?" is a different test from "does the product hold?". It can fail while the product is safe. Today the product held: no lead can be written on any flagged record. The question with the record rule set aside asked whether the checker would still stand on its own, and it didn't. Both answers are true, and the rule written beforehand said which one decides.

**Check:** if the record rule already stops every flagged record, why was the second read pre-registered at all?
