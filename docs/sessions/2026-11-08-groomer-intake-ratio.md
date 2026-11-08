# The groomer leads with the intake ratio

**Date:** 2026-11-08
**One thing:** none (the concept, a guard proven by mutation, was today's row 1 teach)

Shipped via #1487, finishing CUL-2660 (row 5 of the W-F throughput parent, CUL-2655).

## What happened

The 2026-11-07 pass found the board honest but growing: about 1.8 issues opened per close over 13 days. `.claude/skills/backlog-groomer/SKILL.md` now:

1. **Leads with the intake ratio** (step 15): opened ÷ closed for the window, first in the Board count; the template line opens `intake ratio <N.N> (opened ÷ closed; last pass <N.N>)`.
2. **Stops on it:** above 1 on two consecutive passes, the first *Needs PM decision* item is an intake cut naming the generator and its fix. The previous ratio is read from the last pass's outcome issue, which the skill already reads first.
3. **Dry-runs its writes:** before any write, the pass lists them under **Intended writes**; unattended passes then make them, attended passes show the PM and write on the answer. The write boundary table is unchanged.

The 10% reopen and reversal checks stay, and the guard now pins both.

## The byte ratchet

The total had 480 B of headroom. The additions were paid for by deleting history held elsewhere: step 0's "used to be two lines" paragraph (its account lives in `guards/groomPreflight.test.ts`), step 1's 08-29/09-06 aside, step 16's CUL-1560 instance, step 17's Out of beta count. Net −239 B; the set sits 719 B under its ceiling, inside the 4,096 B slack, so neither ceiling moved.

## The guard

`guards/groomIntakeRatio.test.ts`: 13 phrase mutants plus an ordering mutant in memory against the real file; red (11 of 14) against `origin/main`'s skill; three on-disk mutations (the two-pass rule, the dry run, the Board count lead) each went red and were restored. Blind spot, stated: it guards the text, not whether a pass computes the ratio.

## Along the way

- Step 14's doubled full stop (`same reasons..`).

## Residuals

- CUL-928 (the weekly pass, unbuilt) is the first consumer of this headline.
