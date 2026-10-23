# Design system PR-02: the component front door

**Date:** 2026-10-23 · **Issue:** [CUL-1896](https://linear.app/projectnyx/issue/CUL-1896) · **Branch:** `claude/design-system-pr02-10231355` · shipped via #1301

## What shipped

`components/designV2/` is now `components/surfaces/`, a name for what it holds: the live Home, Signal and Patterns surfaces and the waits. Every import, guard path and rule pointer moved in one change. `.claude/rules/ui.md` gained a Components inventory with the second-use placement rule, `code-reviewer` checks new code against it, and the `components/ui` barrel now exports every store-free primitive.

## What broke and how it was fixed

- **The barrel.** Exporting the completion cards and `Snackbar` from the barrel made every screen that imports a chip also load the stores and Supabase, and 14 suites failed. Those hosts mount once and read stores, so they stay off the barrel and are imported by path.
- **The budget.** The inventory cost about 2 KB of always-read text with 13 B of room. It was paid for by folding the chip and header bullets into it and by dropping three passages their `docs/engineering-lessons.md` accounts already hold.
- **Main moved.** Seven merges landed while the branch was open, and git merged them in with no conflict. Two things were still wrong after that clean merge. PR-07 had added a line naming `components/designV2`, and the other PRs' rule text had pushed the budget back over by 19 B. Both were fixed before the PR went ready.
- **The gate file.** A one-line fix to an example path in the steward skill made the merge check call this a production write, so that fix was reverted and parked on [CUL-2155](https://linear.app/projectnyx/issue/CUL-2155) with the stale spec pointers.

## Residuals

- Living specs under `docs/` and the steward skill's example still name the old folder ([CUL-2155](https://linear.app/projectnyx/issue/CUL-2155), Found along the way).
- `components/surfaces/home/HomeCard.tsx` still imports `RAIL_WIDTH` backwards from `components/home/InsightCard`; the rail width token is [CUL-1900](https://linear.app/projectnyx/issue/CUL-1900)'s.

**One thing (re-ask):** G4 L1 — Why "divergent branches" (and a merge conflict) happens (asked again on today's merge: main moved seven commits while this branch was open; why did git merge them without asking, and what did it still get wrong?) · check: pending
**One thing:** G4 L1 — A clean merge is not a correct merge: git checks that lines don't collide, not that they still make sense together · check: pending

## Teach

### One thing — a clean merge is not a correct merge (G4, L1)
While this branch was open, seven other pieces of work landed on `main`. Bringing them in meant a merge: git lays the two sets of changes over each other and stops only when both sides edited the same lines. None did, so git merged without asking. But a merge that raises no conflict has only proved that no two edits landed on the same lines. It has not proved that the combined result still makes sense. One of those seven added a brand new line naming the old folder this branch had just renamed. Git saw no collision because the line was new, and the result pointed at a folder that no longer existed.

**Like:** two people editing a recipe in separate copies. One renames "the blue bowl" to "the mixing bowl" everywhere. The other adds a new step: "pour into the blue bowl." Merged, no sentence was edited twice, so nothing clashes, and the recipe now names a bowl that isn't in the kitchen.

**In today's work:** `.claude/workflows/design-critique.js:59`
```
(a components/ui or components/surfaces export, and constants/theme.ts keys)
//  this line arrived from main saying components/designV2; git merged it cleanly; a search after the merge caught it
```

**Why it matters to you as PM:** when two PRs that each passed on their own both land, the merge can still be wrong. That is why a session re-runs its checks and its search after bringing `main` in, and why "no conflicts" in GitHub is not the same as "safe to merge."

**Check:** Suppose PR-08 had renamed the chart standard doc while this PR added a pointer to it under its old name. Which PR's merge would go red, the first or the second, and what would catch it?
