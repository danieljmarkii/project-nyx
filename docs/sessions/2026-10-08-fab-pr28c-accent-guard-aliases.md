# FAB PR-28c: the accent-on-light guard reads every name of the bright teal

**Date:** 2026-10-08
**One thing:** none — dispatched session, not this round's teach row

Dispatched build of CUL-1664, shipped via #1105.

**Measured first (C-33).** `#00C2A8` has three names in `constants/theme.ts`: `colorAccent`, `colorEventMeal` and `colorMomentConfirm`. The third was not in the issue and turned up during the measurement. Under the two new names there are 0 text sites (`color:` style keys). Glyph sites across all three names: 29 `color={…}` / `tint={…}` props and 22 object values under non-`*Color` keys (nine Switch tracks plus tint maps and chart tokens, most of them fills).

**What shipped.** The text detector's names are now derived from the theme by value (`ACCENT_NAMES`) and pinned in both directions. Glyph sites stay out of the grep, and the guard header says why. Covering them would take 51 markers, which is a scope error. Neither motivating hole (CUL-1637, CUL-1659) took a shape a grep can reach: both were tint-map values drawn through `color={MAP[k]}`. The mechanism that caught them, `theme.contrast.test.ts` walking an exported map against its exported ground, is the precedent for new glyph maps.

**Proof.** Regressing the derivation fails 2 tests and dropping the `\b` fails 3. A real `color: theme.colorEventMeal` planted in `CompositionCard.tsx` fails the live-tree test, while main's guard passes over it. The plant was removed.

**Found and filed.** CUL-1666 is the glyph sweep over the 51 measured sites. `NODE_TINT_DAY.meal` (a teal dot on a light lane) and `CompositionCard.meal` are the likeliest real defects. It needs a mock first, because repointing to `colorAccentGlyph` visibly darkens the brand teal.

**Residual.** Glyph-tint maps written in the future are caught only if their author exports them with a ground for the contrast test. That is convention, not enforcement.
