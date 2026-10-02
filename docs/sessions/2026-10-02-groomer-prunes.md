# The groomer prunes: a retirement sweep, a 7-day veto window, a board count

**Date:** 2026-10-02 · **Branch:** `claude/zen-fermi-fimkib` · shipped via the PR for CUL-1448 · Mode: DISCOVERY that became BUILD on the PM's ruling.

## What the PM asked

Could the backlog groomer also prune: when a surface is replaced (Home v1 by the Design v2 beta), the work that only makes sense on the old surface should leave the board, while ideas that carry over survive. Are we doing that today, and what else should change?

## What was true

- The groomer had **no step that removes an issue.** Its hard rules leaned the other way ("never cancel an item just to clear the board"), and its only death check (step 8c) covered aged Urgent/High issues and said flag, don't cancel.
- Pruning happened by accident in Quick Win sweeps. The `Propose close` label came out of the 2026-09-24 sweeps and had already caught the PM's exact case (CUL-570: "dissolves at D2-8").
- **The bottleneck was the drain, not detection:** 51 issues had carried `Propose close` since 2026-09-24, waiting on a hand bulk cancel.
- **Correction to the premise:** Home v1 is not retired yet. D2-8 (CUL-1071) is Todo, so every account outside the beta still sees v1, and its correctness bugs (CUL-1185) are live.

## Ruling

Decision brief in chat; PM chose **(b)**: propose, then cancel automatically after a 7-day veto window. Declined: (a) propose only; (c) instant cancel when the named file is gone.

## What shipped

`.claude/skills/backlog-groomer/SKILL.md`:

- **Step 12, prune.** 12a retirement sweep (flag retired, project closed, spec superseded, file deleted) with a three-way verdict: dies with the surface, the idea carries over (restate and rehome, not a prune), unclear. *Mark, don't propose* while the old surface still ships (`Dies at CUL-NNN`). 12b staleness decay (60 days, not Urgent/High, no live project). 12c closed-project leftovers. Exemptions: clinical, privacy, live correctness bugs, `Waiting on PM`, a comment in 14 days. A fixed four-word reason vocabulary and a signed comment shape.
- **Step 13, the veto window.** Cancel after 7 days unless the label was removed, a person commented, or an exempt label arrived. Pre-rule proposals start their clock at the first pass that announces it, so nobody's issue is cancelled on a clock they never saw.
- **Step 14, the board count.** Opened, closed, net, open total, and prune stats including cancels later reopened (above 10% over four passes, 12b loosens and says so).
- Step 8(c) and the hard rule now route through steps 12–13.

## Not done here

- **#842 (CUL-922, the write boundary)** is a draft from 2026-09-12 that no longer applies cleanly to `main` (three later skill changes). This PR does not depend on it. When it is rebased, its table should list step 13's cancel as an artifact-backed write; the step says so.
- The first pruning pass is a separate session (kickoff prompt on CUL-1448).

## Lesson

A queue with a mandated add and no mandated remove only grows (retro 2026-09, L1), and a proposal with no expiry is the same queue one label deep. The veto window is what turns `Propose close` from a second backlog into a drain.

## Second ruling, same session: the PM queue stays a label

The PM asked whether "needs the PM" should be a label (usable at any stage) and whether a PM persona could decide the low-stakes calls. Briefs in chat; rulings:

- **1a — `Waiting on PM` stays a label.** CUL-923's `Needs PM` workflow state is declined and #841 closed as superseded. The label's one flaw (it outlives the issue's close) is now a groomer step: step 9 strips `Waiting on PM` and `Quick Win` from completed, canceled and duplicate issues every pass. Step 4's collision resolves by rule: the status says whether a session holds the issue, the label says whether the PM owes it something.
- **2b — the queue drain is built separately, under CUL-1366** (the 2026-09-27 rulings: team decision rights, the 72h veto window on low-risk calls, the never-list), not folded into this PR.

`operating-kit/` still teaches "a state, not a label" for new projects. It is a template for other repos and was left alone; whether to change it is noted on CUL-1366.
