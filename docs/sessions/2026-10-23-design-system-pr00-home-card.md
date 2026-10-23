# Design system PR-00: Home speaks one card language (CUL-1525)

**Date:** 2026-10-23
**One thing (re-ask):** D3 L1 — Reading a test: a test that two numbers agree proves they agree, not that either is right (from 2026-10-23, the bowls row: if the shared rule starts skipping every bowl whose second food wasn't recorded, does the sum test go red, and which kind of test would catch it instead?) · check: pending
**One thing:** D4 L1 — Guards: a scanning test sees only the files it walks · check: pending

Shipped via #1289. Dispatched row, `Teach: yes`. The PR body is the record of what changed and what review found; this file carries the teach.

## Teach

### One thing — a scanning test sees only the files it walks (D4, L1)
Some tests here do not run the app at all: they read the code itself and fail the build when they find a forbidden shape. Today's new one reads every file Home is built from and fails on an old card or a hand-drawn ›. To know which files those are, it starts at the Home screen and follows each file it imports, then each file those import, and so on. Anything Home never imports is invisible to it, however Home-like it looks.

**Like:** a building inspector who walks the rooms on the floor plan. A room that was built but never added to the plan gets no inspection, and no report says it was skipped.

**In today's work:** `guards/homeCardSurface.test.ts`
```
export function scannedFiles(root: string): string[] {
  return homeClosure(root).filter((r) => !r.includes('.test.') && /\.tsx?$/.test(r));
}
```
`homeClosure` is the floor plan: Home's screen file plus everything it imports. The grey outline Home shows while it first loads is drawn by a file Home's screen does not import (the app shell draws it), so the new rule never reads it, and that outline still draws the cards the old way. It is filed as CUL-2140 rather than discovered by a red build.

**Why it matters to you as PM:** when a PR says "a guard now enforces X on Home", the useful follow-up is "which files does it read?", because the answer is where the rule actually holds.

**Check:** A future card is built in its own file and added to Home's screen. Does the guard check it automatically, and what if the card is instead drawn by the tab bar's file?
