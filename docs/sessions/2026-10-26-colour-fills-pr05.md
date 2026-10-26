# Colour fills PR-05: the button onto the action colour

**Date:** 2026-10-26
**One thing:** D3 L1 — Reading a test: a test can record the wrong answer on purpose, so the tempting one token shortcut turns the build red · check: pending

Shipped via #1336 ([CUL-2200](https://linear.app/projectnyx/issue/CUL-2200)). Dispatched BUILD row, branch `claude/colour-fills-pr05-10262257`. The PR body is the record; this file exists for the teach row.

## Teach

### One thing — A test can record the wrong answer on purpose (D3, L1)
Most tests say "this is right." Some say "this tempting thing is wrong," and they exist because the wrong answer looks like a tidy one word edit. If a later edit makes the wrong answer look right, the test goes red and says why.

**Like:** A label on the bleach bottle that says "do not mix with ammonia." It is not a recipe; it is there because mixing them looks harmless and is not.

**In today's work:** `constants/theme.contrast.test.ts:551`
```
expect(contrastRatio(colorRoles.action.fill, theme.colorSurfaceDark)).toBeLessThan(NON_TEXT);
```
The paywall's button is moonlight on a near black ground. This line measures the ordinary indigo on that ground and requires it to fail the 3:1 floor, so the reason for moonlight is written down as a number. It guards the colours, not the screen: if someone tunes the indigo or the dark ground until the shortcut would pass, it goes red. It does not watch which variant the paywall picks, so it cannot stop that edit on its own.

**Why it matters to you as PM:** When a ruling picks one option because the obvious other one fails (C3: moonlight, because indigo cannot show at night), a test that records the failure keeps that reason alive after everyone forgets the round.

**Check:** A later session changes the paywall's button from the night variant to the plain one. Does any of today's tests go red, and if not, where does that mistake have to be caught?
