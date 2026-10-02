# A cut first-paint draw left a row blank on Home and History (CUL-1375)

**Date:** 2026-09-27

Shipped via #961. Fixes CUL-1375 (History v2 · the record you can read).

## The report

The PM sent an iPad screenshot of Home under `history_v2`: `4 logged · 2 meals · 2 doses`, the first row (the 6:44 AM meal) drawn as a blank gap exactly its own height, the other three rows fine. They said it also happens on History's day cards. The row was mounted and laid out, but at opacity 0.

## Root cause

`useThreadDraw` (`components/motion/threadMotion.ts`) lands each row on the native driver. When a draw is **cut** (a blur, or the safety valve), `rest()` stops the animation and pins every value to 1. Stopping a native animation is not synchronous, though. The native side answers the stop a frame later with the value it had reached, and RN 0.86 writes that into the JS node and re-renders every bound view (`Animation.__startAnimationIfNative`'s end callback, then `__onAnimatedValueUpdateReceived`, then `node.update()`, then `scheduleUpdate`). That reply overwrote the pin, and Fabric committed the stale opacity. The row stayed invisible.

Why always the **first** row: row 0's timing has delay 0, so its native animation starts at once and has a native side to reply. Rows 1+ wait on a JS `setTimeout` (TimingAnimation handles `delay` in JS). Stopped before that timer fires, they never got a native id, so no reply came and their pin held.

The commonest cut: the card mounting while `AppState` is `inactive`. That covers a cold launch's first frames and an unfocused iPad window (the PM was in split view). The layout effect started the draw, then the blur effect (`appActive` false, `running` set) cut it one passive effect later, before a single frame.

## The fix

1. **A cut rebinds.** `rest()` takes `finished`. A cut swaps the rows' and the line's `Animated.Value`s for fresh ones at rest, so the late reply lands on values nothing reads. A finished draw keeps its values, since nothing is left to reply. This is the fold's "unbind at rest" precedent, adapted: ThreadDraw keeps its wrapper mounted (a remount would drop a read's arrival), so the rebind is a new props node on the same view, never a remount.
2. **No draw while the app is not active.** It takes the still frame, as Reduce Motion does: nothing seeded, token left unclaimed, and no late draw when the app becomes active.

## Tests

- `threadMotion.test.ts` adds five tests. The key ones play the native reply (`__onAnimatedValueUpdateReceived`) onto the value bound before the cut, for both the blur cut and the valve cut. Two more cover the inactive mount, and one pins that a finished draw is not rebound.
- The new `ThreadDraw.test.tsx` shows the same thing on the rendered rows. The row wrapper's opacity stays 1 after the reply; on the old code it re-rendered at 0.
- Every new behavioural test was run against the pre-fix `threadMotion.ts` and went red.
- `TodayCard.test.tsx` now mocks `useAppActive` to true, as 35 other suites do. Jest's `AppState` is not `active`, and that suite's first-paint test had passed only because the old code drew while inactive: the bug itself.

## Residuals

- A cold launch where Home's read answers while iOS still reports `inactive` now shows its rows without the first-paint draw. That is the intended trade.
- The replacement path (a landing on a day still drawing) still stops and re-animates the same values. A stale reply there is transient, because the new draw's own end re-syncs. It was left alone to keep the change minimal.
