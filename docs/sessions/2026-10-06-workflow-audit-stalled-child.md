# The workflow audit: a dispatched child wakes when its CI finishes

**Date:** 2026-10-06 · **Issue:** CUL-1623 · shipped via #1085
**One thing:** G5 L1 — Protection: a required check that has not reported is not a pass · check: pending

## What happened

Dispatched ad hoc (BUILD). The issue offered two options; this PR does both, because the transcript of #1084's child showed neither alone closes the gap.

**The cause, read from the child's transcript** (`session_015zVuzkVGS4bC3b5aSjBQi8`). The child *was* subscribed to #1084. Its PR opened at 17:26:55Z; the one-job `migration-numbers` suite passed at 17:28:11Z, and that suite's notice woke it. It read the PR, saw the main CI run still queued, and ended its turn: "CI's result will wake this session." The main suite went green at 17:37:37Z and nothing woke it. A turn ended mid-CI is neither a stop nor a last act, so it sent the dispatcher nothing, and the PR sat green and mergeable until the 18:53Z check-in. So a subscription is one wake path, not a guarantee, and the fix cannot rest on the child alone.

**The child's half** (`dispatch.md` step 5's prompt, `wrap.md`): before ending a turn with its PR open, a child reads the check runs; a required check not yet reported, or any run queued or running, makes the turn end a stop (`stopped: waiting on CI`, if it is the first). One passed suite is not a green PR. The steward skill's §7 step 3, which told a cloud session "subscribe and end the turn, and the CI result wakes you", now says the result usually does, not always, and points at both halves.

**The dispatcher's half** (`scripts/dispatch/stall.ts`, wired into `cli.ts plan`): `checksOf` reads a head's raw check runs and calls a PR green only when every required check has reported and passed, dated by the last completion; `findStalls` finds a launched child whose PR is open, green for 10 minutes, mergeable, whose session is idle, and whose wakes do not hold it (a terminal wake ends it; a PM-waiting stop holds it until the branch moves past the stop; a CI-wait stop never holds). It prints the facts-only `/dispatch note` and notes one head commit once. `dispatch.md` gains the **stalled** outcome (step 0), the facts (step 1), a 20-minute check-in on a CI-wait stop (9.1, 9.8), the send rule (9.9), a `Nudged:` digest line and a blind-spots entry; version 1.5.

**Proof.** `scripts/dispatch/fixtures/stall-1084.ts` replays #1084 from GitHub's own check runs: at 17:28Z `checksOf` says pending (migration-numbers alone), at 17:30Z the child is a `ci-wait`, at 17:40Z the grace holds, at 17:48Z it is stalled and the note reads as the test pins. `cli.ts plan` on the same facts at 18:53Z prints the stall and the note. jest `scripts/dispatch`: 5 suites, 82 tests pass; `tsc --noEmit` clean; the mutants script: 53 of 53 killed (17 new, one per stall rule).

**Review.** The `code-reviewer` pass returned fix-before-merge; fixed before merge: the CI-wait reason is matched exactly (a PM-waiting stop that mentions CI holds); a run with no readable completion time is pending, not an undated green that skips the grace; no head sha read means no note (it could not be noted once); `cli.ts` refuses check runs without a head sha or without the wake list (a lost stop would make a waiting child look unheld). Kept as is, with the path traced: a draft green PR is still nudged (a child's own flow marks it ready and merges, so a draft is no reason to sit idle); a stop older than a merge commit the PM made with "Update branch" releases the hold (rare, and the note is a fact the child answers by staying put); a child whose one stop was a CI wait may get the note once per head while it waits on the PM (the two-message cap, now said in `dispatch.md`'s blind spots).

## Open

- The never-line still caps a child at two messages, so a child that spent its stop on a plan go sends nothing for a later CI wait; the dispatcher's next wake or check-in finds it through the stall check. Raising the cap would widen what a child may send, which is the PM's call; nothing is filed, since the stall check covers it.

## Teach

### Protection: a required check that has not reported is not a pass (G5, L1)
`main` only accepts a PR when certain named checks have passed; those are the required checks. A check that has not started yet is not on the list at all, so "everything on the list passed" can be true while the PR is nowhere near green. The safe reading counts the names that must be there, and treats a missing one as still running.

**Like:** a hiring panel of three. Two interviewers have sent glowing notes; the third has not interviewed yet. "Every note we have is positive" is true, and it is not a hire.

**In today's work:** `scripts/dispatch/stall.ts:37`
`if (required.some((n) => !names.has(n))) return { state: 'pending' };` reads: if any required check's name is missing from the list, the answer is "still running", whatever the finished ones say. At 17:28 on 10/6, #1084's list held one finished, passed check, and the PR's real tests had not started.

**Why it matters to you as PM:** "CI is green" is a claim about a fixed list of checks, so when a session reports green, the question that catches the false version is "all the required ones?"

**Check:** if the repo added a third required check tomorrow and nobody updated this list, what would the dispatcher do with a PR whose third check failed?
