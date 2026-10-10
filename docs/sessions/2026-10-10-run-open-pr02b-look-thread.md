# Run open PR-02b: the thread through a look on History (CUL-1751)

**Date:** 2026-10-10
**One thing:** none — dispatched session, not this round's teach row

Dispatched session, Run open PR-02b. Shipped via #1164.

## What shipped

- `components/historyV2/DayCard.tsx`: `LookLine`'s row now takes `styles.itemRowFill` (`flexGrow: 1`), as the visit and call rows already did. A look sits in a 44pt door (`styles.lookDoor`) and its row is about 34pt (one line of text plus the 16pt gap pad), so the row ended about 10pt above the door's foot, and the bottom thread segment, which runs to the row's border edge since CUL-1718, stopped there. Filling the door carries the thread to the next bead.
- `components/historyV2/DayCard.test.tsx`: a CUL-1751 test beside CUL-1718's. A look between two rows: the door keeps its 44pt floor, the rail stretches, the row grows (`flexGrow: 1`), the bottom segment runs through the row's own `paddingBottom`, and both segments are drawn.

## Proof

- The test renderer does no layout, so the test pins the style that makes the row fill the door rather than a measured height (the CUL-1718 approach).
- Mutation: removing `itemRowFill` from the look's row turns the new test red (`flexGrow` expected 1, received undefined); restoring it turns it green. The History suites (9 files, 169 tests) and `tsc --noEmit` pass.

## Residual

- The look on a phone rides the next TestFlight cut's device sitting; the QA script is in the PR body.
