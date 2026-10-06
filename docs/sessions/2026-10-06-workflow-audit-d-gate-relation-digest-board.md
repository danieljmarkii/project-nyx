# The workflow audit D: a gate is a relation in the issue contract, and the digest Board by default

**Date:** 2026-10-06 · **Issues:** CUL-1621, CUL-1622 (of CUL-1612) · shipped via #1084
**One thing:** G3 L1 — A PR is a proposal; the squash merge is the one commit main keeps · check: pending

## What happened

Dispatched ad hoc (BUILD), two one-line builds in one PR.

**CUL-1621.** Groomer step 16 (CUL-1617, #1079) may add a `blocks` relation from a bare `**Blocks:** CUL-NNN` line, but only on issues created on or after the day the issue contract gives the line one direction, dated by `git log -S "a gate is a relation" origin/main -- CLAUDE.md`. That clause did not exist, and the contract still said "the condition that should trigger this", the blocked-by direction. The **Blocks:** row in CLAUDE.md § Backlog Protocol now says: what this issue holds back, never what holds it; a gate is a relation: the line names it for humans, the `blocks` relation is what planners read; set both. Paid for by trimming the same row: CLAUDE.md went 135,405 → 135,404 bytes, inside the budget's slack, so the ceiling did not move. The groomer skill's row-16 note "(none on `origin/main` yet, so no write)" now points at the `git log -S` date, so it stays true after the merge.

**CUL-1622.** PM ruled D4 the digests. `dispatch.md` step 8 makes the six-line digest the Board's default; `cli.ts plan` defaults to `--board digest` (and drops a ternary that only existed to keep `table` the default); `--board table` still renders the table.

**Proof.** jest over the budget guard, the groom-write-boundary guard and `scripts/dispatch`: 70 pass. `tsc` clean. `cli.ts plan` on the 10/5 Engines v3 fixture prints `Board (digest; parses)` with no flag and `Board (table; parses)` with `--board table`; `check-board` on the default output says `OK`. Step 16 dry run: `origin/main` empty (no write), branch HEAD `2026-10-06`.

## Open

- The contract date is the squash commit's date on `main`, so if the merge slips past today the eligible window starts on the merge day, not 10/6. Nothing to do; the groomer reads it from git.

## Teach

### A PR is a proposal; the squash merge is the one commit main keeps (G3, L1)
A pull request is a proposal to move `main` forward. Until it merges, its commits live only on its branch, and anything that reads `main` cannot see them. A squash merge takes everything the branch did and writes it onto `main` as one brand new commit, stamped with the moment of the merge.

**Like:** a draft contract can be signed in a week, but the contract's effective date is the day it is signed, not the day the draft was typed.

**In today's work:** `.claude/skills/backlog-groomer/SKILL.md:261`
`git log -S "a gate is a relation" --format=%cs origin/main -- CLAUDE.md`: the groomer asks `main`, not this branch, when the sentence first appeared. Run against this branch it answers `2026-10-06`; run against `main` before the merge it answers nothing, so the groomer writes nothing. After the squash, the answer is the merge day.

**Check:** if this PR were merged three days from now, from what date would the groomer start linking new issues' Blocks: lines, and why not today?
