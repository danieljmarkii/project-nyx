# PR-21: the first day's Signal, the quiet line

**Date:** 2026-10-15

**One thing:** D4 L1 — A test is proven by breaking the code it guards: two of today's three breaks went red where they should, and the third went red in only one place · check: pending

**Mode:** BUILD, dispatched. Shipped via #1222. CUL-1838 with CUL-1468, CUL-1484 and CUL-1937 folded in; the PR body is the record of what changed and why.

## Teach

### One thing — A test is proven by breaking the code it guards (D4, L1)
A passing test only means something if it would fail when the thing it protects goes wrong. So after writing tests, you deliberately break the code they protect (a "mutation") and check that they turn red. If they stay green, the test was watching something else.

**Like:** testing a smoke alarm by holding a match under it. A silent alarm in a quiet room tells you nothing; a silent alarm under a match tells you it is broken.

**In today's work:** `components/home/SignalZone.tsx`, the line that routes the card
```
deriveDisplayState(holdsLive, …)   → mutated to deriveDisplayState(drawn.length, …)
```
That one-word change brings back the bug the reviewer found: a safety finding Home cannot title would read "No pattern right now". The new test went red, so it really guards the fix. A second break, letting zero events count as "gone quiet", went red only in the copy tests, because the card itself falls back to "Too early to tell" when there is no date to print.

**Why it matters to you as PM:** "tests pass" is only reassuring for the breaks someone actually tried, and the PR body says which ones were tried.

**Check:** The second break went red in one test file but stayed green on the card. If someone later removes that card fallback, which test would catch the "zero events reads gone quiet" bug?
