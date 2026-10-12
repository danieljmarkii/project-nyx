# Run open PR-09: a folded run carries the stack

**Date:** 2026-10-10
**One thing:** D2 L1 — Types: a function can only use what it is handed, so the stack is given the count and nothing else · check: pending

Dispatched session (`/dispatch`, Run open PR-09), BUILD mode on CUL-1736. Shipped via #1175.

## What shipped

- `components/dayRow/SpineNodeRow.tsx`, the run's header only:
  - `runStackBeads(count)`: two beads for two meals, three for three or more, none for one.
  - `RunStack` draws the back beads in the front bead's own fill, ring and size, each 4pt further down the thread, deepest first so each lies under the one in front.
  - The tuck rides PR-07's line. Each bead's offset is an interpolation of `useRunOpen`'s `values.lead`, so the beads tuck as the lead grows (0 to 80ms) and come back out as it retracts (200 to 280ms). No beat constant is restated, and `runOpenMotion.ts` is untouched.
  - Reduce Motion: no slide. The stack crossfades on `line × lead`.
  - Hidden from accessibility, with no hit area. The run's label is unchanged.
  - Drawn only where the run opens in place, which is Home and History.
- `components/recap/DaySpine.tsx`: `SpineRowFrame` gains an optional `underBead` slot. It draws in the rail after the thread and before the bead, and it is handed the bead's own colours and frame.
- Tests (`SpineNodeRow.test.tsx`, eight new). Each is listed with the mutation that turns it red:
  - The bead counts, at 2, 3, 12 and 1.
  - The paint order and frame inside the rail.
  - None on a single row, and none without open in place.
  - The same stack across All, unrated, Most, mixed and wet runs. Red when the stack is fed the rated count.
  - The label byte-identical with and without the stack.
  - The tuck wired to the lead's own value, tucked at rest open, fanned once closed.
  - The Reduce Motion crossfade. Red when the crossfade is dropped.
  - No blink as a Reduce Motion close lands. Red on the old phase-gated fade.

## Decisions (team calls inside the ruling)

- **Only where the run opens in place.** The stack rides `useRunOpen`'s values, and every production run opens in place (Home's spine and History's day cards). Without `openInPlace` the run keeps the shipped open, byte for byte. The Patterns month never renders this component.
- **The count is the only input.** Condition 2 is enforced by the function's signature as well as by a test: the stack is handed `node.rows.length` and nothing else in the run.
- **The step stays a named literal (4pt)**, beside `RUN_RAIL_W = 4`. It is geometry on the thread, not spacing.

## Review

`code-reviewer` (isolated) found one bug, fixed in this PR before it was marked ready:

- **The bug:** under Reduce Motion the stack blinked out for one frame as a close landed. The hook's `rest(false)` pins the line back to 1 in a native write before React commits `closed`, and the first fade read the line gated by the render's phase.
- **The fix:** the fade reads `line × lead`. The lead drops to 0 in the same write, so the two values never disagree.
- **The proof:** a test drives that exact pre-commit state and reds on the old fade.

No adversarial pass: no detection, correlation or clinical logic changed. The dissent's clinical worry is carried by conditions 1 and 2, and both are tested.

## Residuals

- The look on a phone, and condition 3's cold read (does an owner read the arcs as "how many" or as "how it went"), ride the next TestFlight cut's device sitting. That is already recorded on CUL-1736's run-order comment, so no new PM issue.
- Jest cannot advance native-driver values mid-flight, so the tuck's in-flight frames are proven by wiring (the offset is an interpolation of the lead's own value), not by sampling.

## Teach

### One thing: Types, a function can only use what it is handed (D2, L1)
A function is a small machine that takes inputs and gives back an answer. Whatever it is not given, it cannot look at. So the surest way to keep a piece of code from depending on something is to never hand it that thing, and TypeScript (the checker that reads the code before it runs) holds that line.

**Like:** a judge scoring a dive from behind a screen that shows only the splash. Whatever the diver's name, the judge cannot favour it, because the judge never sees the name.

**In today's work:** `components/dayRow/SpineNodeRow.tsx`
`export function runStackBeads(count: number): number {` — the stack's whole decision takes one number, the meal count. It is never handed the meals, so it cannot read a rating, a format or a time.

**Why it matters to you as PM:** the dissent's condition 2 ("the mark never varies with a rating") is held by the shape of the code as well as by a test, so a later edit that wants the rating has to change this line in plain sight.

**Check:** if a future session wanted the stack to turn rose when any meal was refused, what is the first line of code it would have to change, and why would a reviewer notice?
