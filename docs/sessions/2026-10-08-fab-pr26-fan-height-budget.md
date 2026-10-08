# FAB PR-26: the fan fits at large text sizes and never cuts the pet chip

**Date:** 2026-10-08
**One thing:** none — dispatched session, not this round's teach row

Dispatched build of CUL-1636, shipped via #1104.

**What shipped.** The FAB's fan grew upward from the disc with no cap, so at large text or on a small phone the top row, the "Logging for" chip, was the first thing cut. New `lib/fanBudget.ts` plans the column from the window, the text multiplier and the safe-area top before anything is drawn (a measured plan would draw rows and then remove them under the thumb, CUL-1634's lesson). The recent foods leave oldest first; if even the four doors overflow, the chip pins at the top and the doors scroll beneath it, snapped to the bottom once per open. The pill cap is `min(300, width − 40)`, so a 320pt Display Zoom SE no longer overflows. Two shown foods that would truncate to the same visible words under one format tag both lose their line cap; PR-23's tag already parts the issue's wet / dry Royal Canin pair, so that pair keeps its cap. The fan's geometry now lives in the budget module and the FAB stylesheet consumes it.

**What the estimate says.** A 375×667 SE keeps all three foods at default text, drops to fewer at AX1, holds no food at AX2 and scrolls the doors at AX3. A 320pt SE drops a food at default. A Pro Max keeps all three through AX1. The estimate counts characters against an average glyph width set wide of Geist's metrics, so it errs toward dropping a food, never toward cutting the chip. The module header states its blind spots: the logging spinner is not budgeted, and the scroll clips the open's slide at its right edge.

**Proof.** `lib/fanBudget.test.ts` runs the matrix (320 / 375 / 393 / 430pt × default, AX1, AX2, AX3) and asserts that the small phones really do drop and scroll, so the matrix is not green over nothing. FAB.test.tsx's CUL-1636 block pins what the FAB draws per SE size. Mutations: forcing the plan to keep every food reds six tests, removing the snap-once guard reds one, and budgeting doors with no pet reds one; all restored.

**Review.** The code-reviewer subagent found no blocking bug. Fixed from its report: inline style literals became named plan-derived entries, the food label is computed once for both plan and pill, the no-pet card is never planned as doors or put in a scroll, the scroll snaps once per open, and the weak either-branch test became per-size expectations.

**Residual.** The device pass (320pt, AX1 to AX3, SE) is the issue's `Gate: device` and rides the next TestFlight cut's sitting; the scroll branch's shadow and the slide's clip are judged there.
