# Mixed meals row 3: the server reads a bowl (CUL-2052)

**Date:** 2026-10-21
**One thing (re-ask):** D3 L1 — Reading a test: a test proves only the world it builds (from 2026-10-21, row 2: the pretend server lets every upload succeed; name one real failure it could never catch) · check: pending
**One thing:** D4 L1 — A test is proven by breaking the code it guards: today's first fixture for the reversed check stayed green with the bug put back · check: pending

Shipped via #1271. Dispatched row, `Teach: yes`, plan-gated (clinical), the PM's go typed in session. The PR body is the record of what changed and what review found; this file carries the teach.

## What review changed

Two adversarial passes, the cap. The first found six quiet breaks, the worst a trial fed only in mixed bowls that the report called "no allowed-food list recorded". The second confirmed those fixes and found that two of them opened new quiet paths: partly eaten mixes dragging a solid plain-meal history under the refusal floor, and an unknown bowl dropping a pair from the reversed-in-time control. Both were fixed in the loud direction and each fix is proven by putting the old behaviour back and watching its test go red. Two cold reads: NOT READY on the first (ratios read as doses, a refused off-diet bowl counted with no word about intake, switch bowls merged with an in-trial bowl), CLINIC-READY on the second.

## Teach

### One thing — a test is proven by breaking the code it guards (D4, L1)
A test that passes tells you the code does what the test checks, but only if the test could have failed. The way to know is to put the bug back on purpose and run it again. If it still passes, it was never looking at the bug.

**Like:** testing a smoke alarm by pressing its button proves the speaker works, not that it smells smoke. You only know it detects smoke when you hold a lit match under it and it goes off.

**In today's work:** `supabase/functions/generate-signal/detection.en11.test.ts`, the last test
```
const plainTier = run(m(31, 18, 'beef'))   // beef at dinner on day 31, the control day for the last vomit
```
The first version of this test put the beef on day 23. It passed with the fix, and it also passed with the bug put back, so it proved nothing. A search over every day and hour found the one placement where the bug changes the answer (day 31). Now the test passes with the fix and fails without it.

**Why it matters to you as PM:** when a PR says "added a test for the reviewer's break", the question worth asking is whether anyone watched that test fail on the old code.

**Check:** Today's first fixture for the refused-mix rule (break A) failed when the old code was put back. If it had passed instead, what would that have told you about the fix?
