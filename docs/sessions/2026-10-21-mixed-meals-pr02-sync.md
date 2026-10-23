# Mixed meals row 2: the bowl's foods on the phone, in sync (CUL-2051)

**Date:** 2026-10-21
**One thing:** D3 L1 — Reading a test: a test proves only the world it builds, so a model that skips how the real thing behaves is green over the bug · check: pending

Shipped via #1270. Dispatched row, `Teach: yes`, plan-gated on the sync layer. The PM ruled the read rule in session: **generations** (each save's rows share one stamp in their ids; the newest save is the bowl). The PR body is the record of what changed; this file carries the teach.

## What review changed

The first adversarial pass found that the phone's "what changed since I last looked" pull compares against server times, while a brand-new row keeps the phone's own time. A bowl edited offline and uploaded an hour later was skipped by the other phone for good. The two-phone property test was green over it, because its model phone pulled everything every time. The fix sends each batch twice, so the server stamps it; the test now pulls the way the app does, and goes red without the fix. The same gap sits in every synced table: [CUL-2073](https://linear.app/projectnyx/issue/CUL-2073).

## Teach

### One thing — a test proves only the world it builds (D3, L1)
A test sets up a small pretend world, does one thing in it, and checks the result. It can only catch a bug that its pretend world is able to produce. If the pretend world leaves out how the real system behaves at the step where the bug lives, the test passes and proves nothing about that bug.

**Like:** a fire drill held in a building with no stairs blocked. Everyone gets out in two minutes, and the drill says nothing about the night the main stairwell fills with smoke.

**In today's work:** `lib/mealComposition.test.ts`, the pretend phone's pull
```
const floor = watermarkQueryFloor(this.watermark);   // only rows newer than "last time I looked, minus 2 minutes"
```
The first version of this test had the pretend phone copy every server row on every pull. The real phone only asks for rows newer than its last look, and that is exactly where an offline edit went missing. With the real rule in the model, the old code fails on seed 241; with the fix, all 400 runs pass.

**Why it matters to you as PM:** when a PR says "400 random interleavings pass", the useful question is what the pretend world left out, not how many runs there were.

**Check:** The pretend server in this test lets every upload succeed. Name one real failure the app could have that this test, as written, could never catch.
