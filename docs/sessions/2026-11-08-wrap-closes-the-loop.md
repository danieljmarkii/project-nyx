# /wrap closes the loop: release by branch, read back Along the way, no unmerged record

**Date:** 2026-11-08
**One thing:** none — the concept this row illustrates (a guard proven by mutation) was today's row 1 teach

Shipped via #1484, finishing CUL-2658 (row 3 of the W-F throughput parent, CUL-2655).

## What happened

The 2026-11-07 grooming pass found two issues (CUL-2234, CUL-1851) still reading claimed by deleted branches with no PR, and a grooming record plus two research briefs (#1332) stuck 13 days in an open PR. Each was a wrap that ended without closing. `.claude/commands/wrap.md` now carries three steps:

1. **Release every claim by branch** (step 4): on each issue whose `**Claimed**` names this branch, the outcome comment opens with `**Released** — branch`, the UTC time, and the PR or `no PR: <reason>`. This is the marker `/dispatch` already reads, now used by interactive wraps too.
2. **Read back the PR's Along the way list** (step 5): before any merge, read the PR body and list its `## Along the way` items in What Was Built, or `Along the way: none`. The Session Summary format names it.
3. **The unmerged-record check** (step 5): a record in a PR still open at the end of the wrap means the wrap does not report done; the summary opens `UNMERGED:` and the Kickoff prompt is to merge it. `/wrap and hold <reason>` is the deliberate exception and writes `Held: <reason>` into the PR body and the outcome comment.

## The byte ratchet

The total ratchet had 56 B of headroom. The new text was paid for inside wrap.md by deleting story that is held elsewhere: the "no duplicate-ID check" history paragraph, the 102-unchecked-bullets aside, and the self-referential *Shortcut* paragraph inside the Session Summary format. The set ended 43 B under its ceiling; neither ceiling moved.

## The guard

`guards/wrapCloseLoop.test.ts` finds each step's paragraph by its opener and requires its phrases. 13 phrase mutants and 3 whole-paragraph deletions run in memory against the real file; three on-disk mutations (the release marker, `Along the way: none`, `/wrap and hold`) each went red and were restored. Blind spot, stated in the file: it guards the text, not whether a session follows it.

## Along the way

None.

## Residuals

- `--dispatched` wraps already release by branch; their `open, left for the PM` return is the dispatched form of a hold, so the unmerged check was not added there.
- `wrap.md` is a gate path for `scripts/steward/merge-check.sh`, so merging this PR needs the PM's typed `merge`.
