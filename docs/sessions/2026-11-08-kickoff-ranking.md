# Row 4 · /kickoff ranks work by what it unblocks

**Date:** 2026-11-08
**One thing:** P3 L2 — Sequencing by what a task frees: an item that unblocks three others is worth more today than a higher-priority one that unblocks none · check: pending

[CUL-2659](https://linear.app/projectnyx/issue/CUL-2659), the workflow audit's W-F · Throughput, shipped via #1486.

## What shipped

- `.claude/commands/kickoff.md` gained `## Ranking`. It ranks open `Todo`/`Backlog` issues with no live claim, team-wide. The first difference wins: open `blocks` relations (direct, then transitive), `Live harm`, priority, then age. A gated candidate (a `Gate:` label, `Area: Privacy/RLS`, a migration, clinical logic) is listed as needing the PM's go. The rule names no project; STATUS.md orients and never ranks. *Recommended first task* and *Alternates* read from the list.
- The deletions that paid for it, all inside kickoff.md (6,554 → 6,117 B): step 0's status paragraph cut to one line, step 1's STATUS.md asides, step 2's frozen-backlog aside, the "High-priority ready work" view and its project scoping, step 5's incident story, and the "parallel food track" alternate. Each repeated CLAUDE.md or STATUS.md. The always-read total went from 43 B of room to 480 B, inside slack, so `TOTAL_CEILING_BYTES` did not move.
- `guards/kickoffRanking.test.ts` holds the four keys in order, the gate line, "names no project" and the absence of a `project:` filter, and reds when any live-track name from STATUS.md's table appears in kickoff.md. The names are read from the repo (non-vacuity floor: at least 10, and *The Daily Recap* among them). Eleven in-memory mutants plus an out-of-order swap, each must red.

## Decisions

- The no-project check reads STATUS.md's *Live tracks* table rather than a hardcoded list, so a new track is covered the day it is added there. Its blind spot, stated in the guard: a Linear project missing from that table is not checked.

## Residuals

- Transitive unblock counts are walked by hand from `get_issue` relations. If that is slow in practice, a script beside `scripts/dispatch/` is the follow-up; not filed until a kickoff shows the cost.
