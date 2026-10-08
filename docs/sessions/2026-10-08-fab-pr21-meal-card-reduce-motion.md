# FAB PR-21: the quick meal's card honours Reduce Motion

**Date:** 2026-10-08
**One thing:** none — dispatched session, not this round's teach row

Dispatched build of CUL-1633, shipped via #1110.

**What shipped.** `components/ui/MealCompletionCard.tsx` reads `useReducedMotion()` in the render, as the FAB and `NamedCompletionCard` do. Under Reduce Motion, or while the setting is still unknown (C-43), the card crossfades in place: `translateY` is held at 0, the check is held at scale 1, and only the opacity timing runs (180ms in, 140ms out). The animated values are seeded from the setting, so the first frame is already the still one. The motion path is unchanged apart from now stopping the previous animation on cleanup.

**The handler half.** The issue asked for `reducedMotionNow()` in the handlers. No handler in this card animates anything (no scroll, no LayoutAnimation, no Animated call outside the show/hide effect), so there was nothing to route through it. The comment at the read says so.

**Proof.** Three tests in `MealCompletionCard.test.tsx` § Reduce Motion: still state under `true` and under `null` (no `Animated.spring` call, a fade to 1, the check's rendered transform `[{ scale: 1 }]`, the wrapper's `[{ translateY: 0 }]`), and the motion path under `false`. Both still-state tests ran red against main (four spring calls). Mutation: removing the static seeds and `setValue`s while keeping the spring skip reds both on the transform assertions, so they test the frame and not only the spring count.

**Residual.** None.
