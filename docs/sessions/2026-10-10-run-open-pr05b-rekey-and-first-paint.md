# Run open PR-05b: an open run survives a re-key, and a tap waits out the first paint

**Date:** 2026-10-10
**One thing:** none — dispatched session, not this round's teach row

Dispatched build of [CUL-1757](https://linear.app/projectnyx/issue/CUL-1757), shipped via #1176, run beside PR-09 (which owns the run's header in `SpineNodeRow.tsx`; this PR's edit there is two lines on the open path).

## What shipped

- **The carry (`lib/openRunCarry.ts`).** A run's id is its first meal's, so a backdated earlier meal or a deleted first meal re-keys it, and the hosts' open sets (History's `openRuns`, Home's `HomeSpine`) lost it: the row remounted closed. `carryOpenRuns` moves an open id to the run that now holds the most of the old run's meals, applied in the render that brings the new nodes (React's adjust-state-in-render), so the row mounts open at rest. It never closes an id.
- **The hold (`ThreadDrawing`, `useRunOpen`'s `held`).** The run's open and close are layout-animated commits; over `ThreadDraw`'s in-flight wrappers they snap the draw back (Fabric). `ThreadDraw` now publishes whether it is drawing; the run's host-state effect returns early while held and re-runs when the draw settles. Re-key, reset and blur still land at once.

## Decisions

- **Carry, not a stable id.** The id is the row's key, its testIDs and the reveal's and focus's handle, and no field of a run survives both edits; carrying the open state across the re-key is the smaller, local change.
- **Wait, not explicit geometry.** The wrappers sit in the flow (rows below a growing run must move), so they cannot hold explicit geometry; the run waits for the draw instead. Cost: a tap in the first ~0.5s opens when the line finishes.
- **Most members, not first member.** The code-reviewer subagent found that following the first surviving meal lets a meal backdated across midnight into another day's run steer the carry there (History flattens every day into one call). Fixed with a test that reds against the first-hit rule.

## Proof

Each fix proven by mutation: removing the carry reds the HomeSpine and HistoryList re-key tests (real reads in the latter); removing `held` from the `useRunOpen` call reds the HomeSpine first-paint test; the first-hit successor reds the cross-day test. `TodayCard.test.tsx`'s run-open test tapped during Home's first paint and expected an instant open; it now waits out the draw first (the new behaviour is pinned in `HomeSpine.test.tsx`).

## Residuals

- A re-key that lands across a read with no nodes is not carried (the run reads closed). Written in the module header.
- An open id whose run dissolves to a single meal stays in the set unused (as before this PR); a run that later takes that id would open unasked. Rare; not filed.
