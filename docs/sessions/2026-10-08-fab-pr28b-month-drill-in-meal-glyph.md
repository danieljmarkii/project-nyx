# FAB PR-28b: the Patterns month drill-in's meal glyph clears 3:1

**Date:** 2026-10-08
**One thing:** none — dispatched session, not this round's teach row

Dispatched build of CUL-1659, shipped via #1100.

**The ground, measured first.** The drill-in's row glyph sits on `styles.rowIcon`, a white (`colorSurface`) chip inside the `colorSurfaceSubtle` slot. It is not a night ground, so the bright meal teal (#00C2A8) was 2.26:1 there, under the 3:1 non-text floor.

**What shipped.** The meal entry takes `colorAccentGlyph` (#0FA08B), 3.27:1, which is CUL-1637's fix. The map (now `DAY_ROW_TINT`) and its ground (`DAY_ROW_ICON_GROUND`, which `styles.rowIcon` reads) move to `components/designV2/patterns/dayRowTint.ts`. They had to move: importing `MonthInstrument.tsx` into a test pulls in the Supabase client, which throws under jest. `constants/theme.contrast.test.ts` gains a block beside CUL-1637's. It pins the ground, walks every entry against 3:1 and pins the meal token. The other entries on white: symptom 3.67, medication 4.45, neutral 7.81.

**Proof.** Reverting the meal tint makes two tests in the new block fail. The tint is restored.

**Found and filed.** CUL-1664: `guards/accentOnLight.test.ts` scans for `theme.colorAccent` only. `colorEventMeal` is the same hex under another name and is used on glyph sites, so both CUL-1637 and CUL-1659 got past the guard.

**Residual.** None.
