# The step-2 waits to the silhouette primitive, one tick implementation (CUL-1075, PR-22)

**Date:** 2026-10-03
**One thing:** none — dispatched session, not this round's teach row

Dispatched as PR-22 of the Out of beta project (Design v2's D2-7b). Shipped via #1031.

## What shipped

- **The waits.** The four `Skeleton` sites behind `design_v2` now draw the static primitive in `components/designV2/waits/Silhouette.tsx`: `SignalLeadCard`, `LookHeader`, `TodayCard` (through a new `Rows` helper, the static sibling of `SkeletonRows`) and `MonthInstrument`. Each one is a single hidden accessibility unit.
- **The Signal screen** draws `SignalSilhouette` (`waits/SignalSilhouette.tsx`) where it had a `WhorlSpinner`. The silhouette is the screen's own shape: title line, weekly bars, sentence, compare block. Under the card's flight it draws only the lower half, because the title and the chart slot are already real.
- **One tick.** `useTickBreath(value, breathing)` in `components/motion/arrivalMotion.ts` is the breath's only implementation. D2-4's node calls it on `tickOpacity`, and `Tick.tsx` calls it on its own value.
- **The guard** (`guards/designV2OneLoop.test.ts`) now asserts three things: no loop is written in the namespace, exactly one reached module loops (the breath, which the tick reaches), and that module spells `Animated.loop` once. `KNOWN_LOOP_IMPORTS` is `{}`. The fixture proof was rewritten to match. Mutation: putting one `SkeletonRows` import back into `TodayCard` reds it.

## The tick call

The issue left the shape open. A node cannot render `Tick`. The node's breathing view is the same node that grows into the rail on arrival (pinned by the renderer's node-identity test), and `Tick` returns null once the request lands, so swapping one for the other would break that identity. The two remaining options were a hook in `components/designV2/waits/` that the motion layer imports, or a hook in the motion layer that `Tick` imports. The first would put a namespace module into `SpineNodeRow`'s closure. That closure also renders without `design_v2`, so the stubbed namespace in `guards/designV2FlagOff.test.tsx` would reach it. So the breath lives in `arrivalMotion.ts` and `Tick` wraps it. As a side effect the standalone tick takes the arrival's easing (`Easing.inOut(Easing.sin)` in place of `Easing.ease`), with the same 1400ms and 0.35.

## Review

`code-reviewer` found it ship-ready and raised four optional nits. They stay as they are:
- Nothing asserts the tick's easing.
- The Signal screen's wait is silent to a screen reader. That follows the Skeleton precedent (CUL-575), and the header stays spoken.
- The lower silhouette sits closer to the hero slot than the old centred whorl did. Worth a look at the device sitting.
- Nothing asserts that `useNodeArrival` calls the hook. `SpineNodeRow.test.tsx`'s breath test does cover it: it counts the two half-cycle timings.

No clinical, statistical or copy logic changed, so no adversarial pass was needed.

## Residual

D2-8 (CUL-1071) can now delete `Skeleton`'s shimmer and the Whorl, because nothing behind `design_v2` reaches either one.
