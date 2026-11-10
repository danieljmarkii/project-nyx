# /sweep retro and v1.1: the PM hears about every wait, and the sweep leaves after launch

**Date:** 2026-11-09 to 2026-11-10
**One thing:** none — a retrospective and a tooling fix; the 2026-11-09 check (the property test) is still pending

Shipped via the session's PR ([CUL-2700](https://linear.app/projectnyx/issue/CUL-2700)).

## The retro (sweep 1, 2026-11-09)

Two subagents read the sweep session's whole transcript (639 events) and all six child transcripts. A third pass checked the PRs, the Loose ends page and the issues the run filed.

**What worked:**
- **Selection.** The pool held 376 loose `Todo` issues, the shortlist was the 20 `Live harm` ones, and 6 were picked. No two picks shared a file, and there were zero merge conflicts.
- **Closes.** Both evidence closes were checked against their commits.
- **Throughput.** The four routine builds went from launch to merge in 26 to 35 minutes, with no PM touch.
- **Shaping.** Both shaping rows posted a brief within 4 minutes, and the PM ruled within about 2.5. PR-06 found half its issue's premise wrong and shrank.
- **Adversarial passes** found real silent bugs in three PRs, and all were fixed before merge.
- **The board shrank.** 9 issues closed and 4 opened.
- **Total:** all six merged. Median launch to merge was 0.5h.

**What did not:**
- **Waits on the PM went unseen.** PR-01 sat green about 2 hours, and #1497 most of a day, both waiting on the PM's merge. Each child gets one stop message, and both had spent theirs: PR-01 on its plan go, PR-03 on CI (the relay hook rejected its longer message).
- **The sweep ran dispatch's half by hand.**
  - No dispatch dry run, plan CLI or `check-update`.
  - Prompts came from a one-off script that crashed.
  - The Board was never written.
  - Metrics froze at launch.
  - The six-slot ruling lived only in a comment.
- **Cost.** The sweep session reached about 280K tokens and $20.42, mostly relaying messages. A sweep batch has no chain, so a standing dispatcher had little to do.
- **The children's machines.** They lacked Deno, which caused the run's only CI failure, and full git history, which sent 4 of 6 into a merge-check REVIEW on stale #692.

## PM rulings (2026-11-10)

(a) One PR now, before sweep 2:
1. Ready for merge becomes its own signal.
2. The sweep takes dispatch's and wrap's lessons through scripts.
3. The environment gets fixed.
4. The sweep archives its own session after launch.

## What shipped

- **The signal (`dispatch.md` step 5, and every sweep prompt).**
  - A child that starts waiting on the PM, for a plan go, a ruling or a merge only the PM may make, renames its session `Needs you · <go | ruling | merge #n> · <project> PR-NN` and sends one PushNotification. It restores the title when it resumes.
  - This sits outside the two dispatcher messages.
  - The never-line gains that one exception. `guards/dispatchEmail.test.ts` pins the new text.
- **`scripts/sweep/readback.ts`, the sweep's new step 0.** It reads the last batch from the `**/dispatch run**` launch lines, in dispatch's grammar, and gives each row an outcome from GitHub and the session:
  - merged;
  - waiting on you, with the merge or go it needs;
  - running;
  - died, releasing only its own claim.

  It also returns the files still held, the PM's queue count, rows to prune after a week, the next row number (never reused) and the metrics line.
- **`scripts/sweep/prompt.ts`.** It renders each child's prompt, claim, branch and launch line.
  - Dispatch's paragraphs are copied verbatim, and `prompt.test.ts` reds when one drifts from `dispatch.md`.
  - The sweep variant has no dispatcher wakes.
  - It never ends a turn mid-CI; it waits with a background sleep.
  - It prints its return block rather than sending it.
- **`cli.ts readback` and `cli.ts prompts`.**
- **`sweep.md` v1.1.** Read back first, slots without dispatch's first-dispatch rule, prompts from the CLI, and a close that posts one update and archives the session.
- **`session-start.sh`.** It installs Deno 2.9.4, the same version CI pins (`guards/sessionStart.test.ts`), and unshallows git. Neither step can fail a session start.
- **The doc budget held** with no ceiling raised. `dispatch.md`'s idle-child blind spot was rewritten shorter, and the version history line went to git.

## How it was proven

- Mutation, each reverted:
  - drifting dispatch's commit paragraph, or deleting its Needs you paragraph, reds the prompt suite;
  - a release that ignores whose claim it is, row numbers reused after a prune, and an open PR ignoring a working session each red the read-back suite;
  - a Deno version off CI's reds the session-start guard.
- `cli.ts readback` on sweep 1's real batch printed `launched 6 · merged 6 · abandoned 0 · launch to merge median 0.5h over 6`, matching the dispatcher's own line.
- Guards and scripts: 119 suites, 2,421 tests. The typecheck is clean.

## Residuals

- **The push is untested end to end.** Whether a PushNotification from a cloud child reaches the PM's phone is unproven until sweep 2. The `Needs you` title works either way.
- **Merge rights.** The PR edits `.claude/hooks/session-start.sh`, a gate file, so the merge is the PM's typed `merge`.
- **Death detection.** A child that dies silently is now found at the next sweep, not 90 minutes in. The trade was accepted with the archive ruling.
- **Throttling.** [CUL-2695](https://linear.app/projectnyx/issue/CUL-2695) stays parked until two more sweeps give real numbers.
