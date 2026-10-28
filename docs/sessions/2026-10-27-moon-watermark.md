# The moon watermark on the empty Daily Recap

**Date:** 2026-10-27
**One thing:** D3 L1 — A test that looks for something it cannot see passes by not looking · check: pending

Shipped via #1338. Issues: CUL-2222 (the mock), CUL-2224 (the build).

## What happened

The PM saw a touch in Linear's desktop app: a large, barely visible hairline outline of the logo sitting in the empty space of a new chat. They asked whether something like it could live on the Daily Recap (the night screen the 9pm notification opens) and on the launch splash. The session took four mock rounds in `docs/culprit-moon-watermark-mockups.html`, then built the one change the PM chose.

- **Round 1** drew the still watermark: the real `CulpritMark` geometry as one fading hairline, with no teal and no motion. It was placed on the recap's empty and full days, and as an "Echo" outline baked into the native splash image.
- **Round 2** answered "can we push the envelope on motion" with five replayable frames built from the app's shipped gestures:
  - Inside Principle 9: the recap's thread draw (History's first paint), a recap silhouette wait, and a registered splash that would delete an unplanned hop of the moon at the splash-to-Landing handoff.
  - Outside it, recommended against: the outline tracing itself, and the moon gliding from the splash spot to the Landing spot.
  - Drawing the Landing properly showed that round 1's handoff frame had used the wrong watermark. The shipped Landing carries the whorl ridges, not the outline.
- **Round 3**: the PM approved the empty-day moon and was unsure about the full day, so a designer subagent read three full-day placements cold.
  - Its verdict: no mark on a full day, because Linear's mark leaves once a chat has content, and on a symptom day the top of the recap is a safety surface (brand spec §7.5).
  - It also lifted the empty-day moon 24pt so its fade ends above the title.
  - The PM asked for a Play button under every moving screen; that was done.
- **Round 4**: the PM ruled "no mark" on the full day and limited the scope to the empty-day moon. The splash and motion frames left the page; they are in git at `05927b4`.

## The build (CUL-2224)

- `components/brand/NightWatermark.tsx` draws the crescent from masks: the moon's circle kept outside the carve, and the carve's circle kept inside the moon, plus a ring at the dot.
  - A 1pt stroke at any size, a top-to-bottom fade in the mark's own design units, and a faint elevated-indigo fill.
  - Hidden from assistive tech, and it takes no touch.
- `CulpritMark` now exports `MARK_GEOMETRY`, so the outline cannot drift from the mark (C-34).
- `NightEmpty` in `app/day-summary.tsx` carries the watermark and moves its copy to the foot.
- `constants/theme.ts` gained `colorWatermarkOnNight` and two SVG mask luminance tokens, so no hex lands in components under the style budget's colour ceiling. `docs/mockups/theme.css` was regenerated.

## What broke, and how it was found

- **A vacuous first draft of the tests.** The watermark is hidden from VoiceOver, and RNTL's queries skip hidden elements by default. So the first "never draws on a full day" checks could not have seen the moon even where it was drawn. Every query now passes `includeHiddenElements`. The fix was proven by planting the mark on a full day: the checks went red.
- **The code-reviewer's two minor findings**, both fixed in `14b8c92`:
  - The copy, pinned at the foot, could climb over the header at the largest text sizes. The state is now a non-bouncing scroll.
  - The carve test would not catch the two masks being swapped. It now pins the wiring, and it went red on a swap.
  - The reviewer's nits are also in: a two-pet all-empty case, and the canvas the 1pt stroke depends on is now asserted.
- **CI went red once on a known clock flaw**, not this change. `HistoryList.test.tsx` captures today at module load, and the run crossed midnight UTC (CUL-1729, CUL-2021). The occurrence was noted on CUL-1729, the failed job was re-run once, and it passed.

## Residuals

- How faint the moon reads is a device judgement. It rides the next TestFlight device pass (CUL-2221).
- The splash hop the round 2 mock measured on paper (the moon moving about 17pt left and 19pt up as the Landing takes over) is still in the app, out of scope by the PM's call.
- `colorMaskKeep` and `colorMaskCut` are luminance values, not palette colours. Don't let that pattern grow.
