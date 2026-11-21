# Workflow retro 5: free the decider before adding agents

**Date:** 2026-11-21

Interactive DISCOVERY session, branch `claude/dazzling-ptolemy-2sm19j`. The PM asked for a session on workflow efficiency: reduce dispatch's downsides, find the next dispatch sized gain, and research what people at the frontier of agent driven delivery are doing, Reddit included. The write-up is `docs/workflow-retro-2026-11.md`; the briefs are on [CUL-2854](https://linear.app/projectnyx/issue/CUL-2854).

## How it ran

- **First pass (about 20 minutes):** this session read dispatch, retro 4 and the queue, with two research agents (outside practice, a platform audit). It produced six briefs, R1 to R6.
- **The PM asked for depth** ("take as long as you need"), so a second pass ran ten read only streams in parallel:
  - the `Waiting on PM` queue, all 90 issues read and classed;
  - a scored sample of 60 findings out of 1,750 issues;
  - 27 child session transcripts and three orchestrators;
  - all 304 PRs merged in 30 days, 3,157 workflow runs and every failed job log;
  - six outside streams: device verification, the human decision bottleneck, fleet orchestration, review quality, community channels, and the platforms' current docs.
- A report writer then synthesised the ten sets of notes. This session spot checked three load bearing claims against the repo (the ship bar is in no file, the 150K hand off constant exists and was not honoured, CI has no path filter) and wrote the decision briefs.

## What it found

- **The constraint is the PM's attention, and most of what waits on it is not a decision.** 90 issues and about 195 decisions wait against a cap of 30; about 23 block anything.
- **Finished work waits for a merge word.** Green PRs sat 474 hours in 30 days; 21 of 27 sampled rows could not merge themselves.
- **Four rulings never reached a file:** merge when ready ([CUL-2234](https://linear.app/projectnyx/issue/CUL-2234)), the ship bar ([CUL-2123](https://linear.app/projectnyx/issue/CUL-2123)), the weekly grooming pass and the retro 4 readout ([CUL-1876](https://linear.app/projectnyx/issue/CUL-1876)). They map onto the four largest measured losses.
- **Findings are half signal.** Of 60 sampled, 25 were worth fixing before release and 29 were low likelihood, not real or duplicates. Hit rate differs sharply by reviewer.
- **CI's whole wait is one job** that runs the suite three times in sequence, and a third of dispatch branches rerun it for a docs only commit.
- **`main` has no ruleset.** CLAUDE.md says it does.
- **A child costs a median $13.66**, about 85% of it carried context. Both dispatchers ran past 580K tokens against a 150K hand off rule.

## What changed from the first pass

R3 (finish ruled work) was confirmed and moved first. R1, R2, R5 and R6 changed shape. R4 (a cheaper model) was largely overturned: money is not the constraint. The table is in § 5 of the write-up.

## Decisions put to the PM

D1 lift the tool pause · D2 merge when ready, widened to deploying merges · D3 build the ship bar with four filing fixes · D4 restructure the queue and stop starting over cap · D5 a ruling sheet for single rulings · D6 the simulator ladder (a better than the rule brief against "No E2E tests in MVP scope") · D7 merged code reaches the phone by itself · D8 trial parallel review with a refuter. None is ruled yet.

## Mistakes caught in session

- **The first pass called the queue 88 decisions.** It holds about 195, 72% of them inside 20 design rounds.
- **The first pass proposed one ruling sheet for the whole queue.** The queue read and the approval fatigue evidence both cut against it.
- **The first pass carried retro 4's "37K tokens before code".** Transcripts show a first request of about 124K.
- **The first pass could not reach Reddit.** One archive route worked on the second.

## Limits

Human minutes are estimates throughout; nothing records them. The session sample covers ten days. Every CI saving is arithmetic on measured step times. The raw research notes were not committed.

Shipped via the session's draft PR.
