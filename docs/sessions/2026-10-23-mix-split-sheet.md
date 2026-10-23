# Mixed meals: the split is a sheet, and Save commits it

**Date:** 2026-10-23 · **Issue:** [CUL-2133](https://linear.app/projectnyx/issue/CUL-2133) · **Branch:** `claude/mix-split-sheet-1023` · shipped via #1285

## What happened
The PM logged their first mixed meal on device and reported two things. The "About how much of each?" step opened as a full page with most of it empty, where mock M2 drew a compact bottom sheet. And a chip tap saved instantly, so a mistap was recorded before they could change it.

Diagnosis: the build rendered `MixSplitPanel` as page two of the `mix` route, which presents as a full screen modal; the sheet the spec's motion table refers to was never built. Tap as save was deliberate (spec §7.1, the intake sheet pattern) and mock R-1 had asked about it.

## Ruling
PM, option 1 of 3: a chip tap picks and draws the bar, Save writes. Rejected: a 5 s auto save countdown, and keeping tap as save. D-M2's 540 ms hold is retired.

## What shipped
- `app/mix.tsx`: the picker stays mounted; the split rises over it as a layer on the shared `useSheetMotion` (no second Modal, C-14). Tapping the veil goes back to the picker with nothing written; it is ignored while a write is in flight.
- `components/log/MixSplitPanel.tsx`: pick then Save; fractions inside the bar segments; the empty bar is a dashed outline so it no longer reads as loading; a failed write keeps the pick.
- Mock M2 and M2b redrawn and republished (https://claude.ai/artifact/JsaLnSwdqeuyQZAXqgEWFY); spec §7.1 and §7.5 updated to v0.5.
