# Vet report v2 PR-26: the fourth bake-off of the AI summary

**Date:** 2026-11-07
**One thing:** D3 L2: a pre-registered rule is only as complete as the fixtures it names, and the gap shows up before the first call or not at all · check: pending

Dispatched DISCOVERY row (CUL-2306), branch `claude/vet-report-v2-pr26-11071616`; shipped via #1470, the PR titled "Vet report v2 PR-26: the fourth bake-off of the AI summary".

## What happened

- **The rule, first.** Every stamp matched the code at `3a28451`: `vr2-lead-6`, claude-opus-5-5, claude-sonnet-5-5, `vr2-9`, 3 sentences, 80 words, set v3 (106 items, 11 controls), and `checkerCodeIssues` exported. `PREREGISTRATION.md` landed unedited (`2689946`) before any model call.
- **Two stops before any call, one ruling.**
  - The rule gives each draft row "that fixture's own snapshot". `h2` and `bakeoff-nyx` have no report behind them, and for `h2` that decides whether it can print at all.
  - While I was asking, `main` moved: #1468 (CUL-2627) changed nyx-v2's band order and moved the set to v4.
  - The PM typed "h2 a, commit a": no copy refusal on the two hand-built fixtures, and measure `3a28451`.
- **The run.** The flagged six ended `not_eligible` / `live_flag` with zero calls, 30 of 30, and the thin pair held. `h2` and `olive` printed 0 of 10: 8 checker rejects, 2 verifier rejects. All 141 calls were served by the model asked for.
- **The verdict: PASS.**
  - Stop (2) is clear on both reads (106 of 106 reject), and stop (3) is clear (0 of 103).
  - The checker model rejected `res-order-a` and `res-order-b` on its own. That pair is why the second read was kept.
  - The model alone passed `rv-tense-b` and `own-rr-1`; the code half rejected both.
  - Full table: `docs/vet-report-v3-discovery/bakeoff/rerun-4/RESULT.md`.
- **Reproduced.** A keyless clean worktree rewrote `score.json` byte for byte.
- **`main` went red.** #1468 and #1469 were each green alone; together they break one stale expectation in `aiLead/coverage.test.ts`. Filed as CUL-2639 (Todo, blocks CUL-2306). This row may not edit `supabase/functions/`.

## Filed

- CUL-2639: `main`'s Edge Functions check is red on a stale test expectation after #1468. Direction: neither. Blocks this PR going green.

## Residual

Zero prints for the second run running. The PASS shows that no hazard passes the nets. It says nothing about whether a lead ever prints: the checker refuses every `h2` and `olive` draft for leaving out the quiet week, the chicken start, or the absence line. The flag stays off until the PM decides what a PASS with no prints unlocks.

## Teach

**D3 · Reading a test: what it proves and what it cannot** (L2)

A rule written beforehand is a promise about what will count. It can only promise about things it names. "Each fixture's own snapshot" assumed every fixture had one. Two did not, and nothing in the rule said what then. The honest move is to stop before the first call, while either answer is still free, and let the owner of the rule choose. Choosing after the results arrive would have turned a test into a story.

**Check:** why did the h2 question have to be settled before any model call, when its answer could only change h2's runs?
