# FAB PR-28: the log sheet's meal glyph clears 3:1

**Date:** 2026-10-07
**One thing:** none — dispatched session, not this round's teach row

Dispatched build of CUL-1637, shipped via #1097.

**What shipped.** The "More events" sheet's Meal tile drew `colorEventMeal` (#00C2A8) on `colorEventMealLight` at 2.08:1, under WCAG 1.4.11's 3:1 non-text floor. The meal entry in `CATEGORY_TINT` (`components/log/EventTypePicker.tsx`) now takes `colorAccentGlyph` (#0FA08B), 3.01:1. `constants/theme.contrast.test.ts` gains a block that walks every `CATEGORY_TINT` entry against 3:1 off the real map, pins the meal glyph token, and pins the failing bright half beside it. The picker snapshot changed in the meal glyph's colour only.

**The other pairs.** Symptom rose on its wash 3.06:1 (the thinnest, now recorded so a token nudge shows as a diff), medication 3.88:1, neutral 7.17:1. No change needed.

**Proof.** Reverting the meal tint reds two tests in the new block; restored.

**Found and filed.** CUL-1659: the Patterns month drill-in (`MonthInstrument.tsx`) keeps its own tint map with the bright meal teal on what is likely a white ground (2.26:1). Its ground needs measuring first; a separate surface, so not folded in. NotificationPrimer's bright meal dot is on a night ground and passes.

**Residual.** 3.01:1 is a thin pass; the test makes any downward token drift a red build.
