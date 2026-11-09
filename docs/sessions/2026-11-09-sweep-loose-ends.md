# /sweep: the board's loose ends, checked, ranked and launched

**Date:** 2026-11-07 to 2026-11-09
**One thing:** P3 L1 — Sequencing and opportunity cost: the scarce thing is the PM's review places, not the agents · check: pending

Shipped via #1475 ([CUL-2651](https://linear.app/projectnyx/issue/CUL-2651)).

## What happened

The PM typed `/dispatch sweep`, expecting a workflow that reached work outside any project. No such workflow existed, in git or Linear. The product team, convened on the question, found the need real: about a third of the open board (650 loose `Todo` issues on the first run) sat outside every run order, unreachable by `/dispatch`. They found a workspace-wide dispatcher the wrong shape: it would need a second planner, compete with the live tracks for the six slots, and build stale issues blind. The PM ruled for a standing **Loose ends** project whose run order a new `/sweep` curates, launched through `/dispatch`'s existing machinery, and set seven requirements (recorded on CUL-2651).

A research agent surveyed practice (Anthropic's harness notes, METR's task-length curve, Willison on review as the bottleneck, Shape Up, critiques of WSJF and stale bots). The PM added four tips from a grooming session: no shared files, a findings cap, dry run first, claim at launch. All four landed.

## What shipped

- `scripts/sweep/rank.ts`, `rank.test.ts` (29 tests), `cli.ts`:
  - **The order:** a fixed order, never a score.
  - **Closes:** on evidence only (a PR number, commit or replacing issue; prose shapes).
  - **Picks:** file-disjoint from each other, open PRs and running work. Same-surface bundles stay within size M.
  - **Sizes:** S and M build, L plans, XL shapes.
  - **Plan gate:** Storage, migration, deletion and export work plans first.
  - **Review cap:** builds that deploy count against the PM's three review places.
- `.claude/commands/sweep.md`, and `dispatch.md` v1.12:
  - a typed `/sweep` is the Loose ends take-over;
  - a bundle claims every issue;
  - every child files at most three new non-harm issues.
- The doc budget held at its ceiling. The additions were paid for by cutting text git, CLAUDE.md or the scripts already hold, and the groomer's label-strip account moved to lessons P-20 (main took P-19 for the filing rule while this branch was open).
- Linear: the Loose ends project and its *Found along the way* milestone.

## What broke, and how it was caught

- **A code review found two bugs.** Row ids under 10 were unreadable to dispatch (page.ts reads two digits). A bundle member's file clash held a clean lead.
- **The PM's sanity check found two gaps.** Prose passed as evidence. Deploying builds weren't counted as waiting on the PM.
- **The first real run found a third:** it read a Storage change as a routine build while dispatch would plan-gate it.

Every fix has a test that is red against the module before it.

## The first run

A dry run, seen by the PM; nothing was launched.

- **Pool:** 650 candidates. The shortlist was the 20 `Live harm` issues, all unclaimed.
- **Picks:** CUL-1797 (shape), 1917, 1916 and 1286.
- **Closes verified against their commits:** CUL-1354 (#1319) and CUL-1918 (#1436).
- **Holds:** 9 of the 14 were the PM's review places. The PM chose to run the real sweep in a new session after this PR merges.

## Residuals

- The circuit breaker and the shaping brief's appetite are prose in the build note, not mechanisms.
- The metrics line records launch to merge but nothing acts on it yet: [CUL-2695](https://linear.app/projectnyx/issue/CUL-2695).
