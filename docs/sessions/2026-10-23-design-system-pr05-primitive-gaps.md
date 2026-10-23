# Design system PR-05: primitive gaps (CUL-1900)

**Date:** 2026-10-23
**One thing (re-ask):** D4 L1 — Guards: a scanning test sees only the files it walks (from PR-00: a future card is built in its own file and added to Home's screen. Does the guard check it automatically, and what if the tab bar's file draws it instead?) · check: pending
**One thing:** D4 L1 — Guards: a test is trusted only after it has been seen to fail · check: pending

Shipped via #1305. Dispatched row, `Teach: yes`. The PR body is the record of what changed and what review found; this file carries the teach.

## Teach

### One thing — a test is trusted only after it has been seen to fail (D4, L1)
A test that passes tells you less than it seems. It might be checking the right thing, or it might be checking nothing: asserting on a value that is always there, or reading a file it never actually opens. Both pass. The only way to tell them apart is to break the code on purpose and watch the test go red. That deliberate break is called a *mutation*. A test that stays green through one has been shown to check nothing.

**Like:** testing a smoke alarm. You don't trust it because the light is green; you hold a match under it and listen for the beep.

**In today's work:** the new rail width guard, `guards/railWidthToken.test.ts`
```
const TYPED = /\b[A-Z_]*RAIL_WIDTH\s*=\s*\d/;
...
expect(offenders).toEqual([]);
```
It fails the build if any screen types the rail's width as a bare number again instead of reading the one shared token. To prove it, the session put `RAIL_WIDTH = 3` back into `InsightCard` and `HomeSilhouette` by hand. The guard went red both times, and both files were then restored. The PR lists twelve such breaks, one or more per new part, and every one went red.

**Why it matters to you as PM:** when a PR says "tests added", the question that separates real coverage from decoration is "what did you break to see them fail?". A PR with an answer is safer than one with more tests.

**Check:** a test asserts "the delete button is red". Someone changes the button to grey and the test still passes. Name one way the test could be written so that this happens.
