# Vet report v2 PR-15: the phone reflow, and the keep-together rule meeting a real phone

**Date:** 2026-11-01
**One thing (re-ask):** D3 L1 — A test that looks for something it cannot see passes by not looking (from 2026-10-27, the moon watermark: had the code drawn the moon on a full day, what would that first test have said, and why?) · check: pending
**One thing:** D3 L1 — A check that samples proves only its samples: the frame walk passed while a free scroll could rest between frames · check: pending

Dispatched BUILD row VR2-15 ([CUL-2295](https://linear.app/projectnyx/issue/CUL-2295)), plan-gated. Shipped via #1394.

## What shipped

- `renderPhoneV2` (`supabase/functions/generate-report/renderPhoneV2.ts`) lays out the same `DocumentV2` as print, at phone column width. Type is rem-based, rooted on `-apple-system-body`; print sizes are absolute pt. Labels and dates are HTML; SVG counts are at least 11pt. The band is the first `h2`, and headings and line numbers are real text. Compaction at scale 1.6 folds the full signalment, conditions and window behind "More details", but species, sex, age and weight stay visible (a new model field, `signalmentBrief`).
- The keep-together rule (PM ruling (a) on CUL-2320, option 1 on CUL-2295): the lead chart, any lines under it and the confounder are one unit that starts in the next frame rather than straddle one. The line's lead sentence (a new model field, `confounder.lead`) is pinned beside the bars.
- The model's free-fed-bowl sentence now leads with a fixed warning and puts the owner's labels after it. Print says the same facts in a new order.
- `scripts/report-phone/guard.mjs`, a Playwright guard run locally, since CI needs `.github/workflows/`, which #1378 held. It covers 16 fixtures at 320×568, 320×460 and 390×844, at scales 1.0, 2.35 and 3.1. It fails on clipping and labels under 11pt, on the band missing the first frame, and on any page-step frame or 8pt free-scroll position that shows bars without the warning. It also fails on a pin that isn't the line's own words or that covers more than 40% of the screen, on any chart row never seen uncovered, on the same checks after a live text-size change, and on PDFs that differ between scale 1.0 and 3.1.
- Spec §6.2 (v1.3) states the rule as shipped.

## What the phone taught the rule

The PM's ruling (a) said: keep the chart, its bars and its confounder in one frame, and start the unit in the next frame when it would straddle. The first measurement broke it. Nyx's unit was 821pt against a 568pt frame at default text, and at AX5 the confounder alone outgrew a frame. The PM chose option 1: keep (a) when the unit fits, and pin the confounder's first sentence beside the bars when it doesn't.

Then the reviews moved it three times:

1. **Cold read (Dr. Chen).** NOT READY. The pin covered chart rows on screen-step scrolling, including the label of a steroid course. The compact fold hid the species. Mira's pin was the weak "no medication" clause, not her free-fed bowl. Fixes: scroll padding equal to the pin's height, a species brief that never folds, and a model-chosen lead sentence.
2. **Adversarial pass 1.** FAIL, QUIET. Hiding the pin when the unit "fits" left 220 to 440pt of free-scroll resting positions with bars on screen and the warning below the fold, on the Prednisolone fixture among others. Frames exist only for a reader who pages; a thumb stops anywhere. Under the stay-loud rule the pin now always shows, and the PM is asked to re-rule ([CUL-2295](https://linear.app/projectnyx/issue/CUL-2295) comment).
3. **Adversarial pass 2.** FAIL, QUIET. The bowl sentence carried the owner's free-text labels, so three long product names grew the pin past the screen and hid a refusing cat's intake chart. Fixes: a fixed warning sentence, a type cap of 1.25×, a long-label fixture and a 320×460 frame in the guard, and a 40%-of-screen cap. That was the second and last pass. The fix is proven by the guard and a mutation (the old sentence put back reds it), not by a third pass.

One residual is a deliberate trade. At 320pt and scale 2.35, the species brief and the band can't both fit the first frame. The band is the warning, so the brief folds there, and only where folding actually brings the band in.

## Filed

- [CUL-2381](https://linear.app/projectnyx/issue/CUL-2381): the most urgent flags sit 3rd and 4th in the band. Live harm, `Gate: clinical`, blocks the go-live.
- [CUL-2383](https://linear.app/projectnyx/issue/CUL-2383): the preview's WebView must run JS. Live harm, blocks VR2-17 and the go-live.
- [CUL-2378](https://linear.app/projectnyx/issue/CUL-2378): the guard in CI.
- [CUL-2379](https://linear.app/projectnyx/issue/CUL-2379): transpose past 8 columns.
- [CUL-2382](https://linear.app/projectnyx/issue/CUL-2382): phone polish.
- Comments on [CUL-2351](https://linear.app/projectnyx/issue/CUL-2351) (post-trial diet) and [CUL-2297](https://linear.app/projectnyx/issue/CUL-2297) (WebView insets).

## Teach

### One thing — A check that samples proves only its samples (D3, L1)

A test only looks where it is told to look. This session's browser check first walked the report one screen at a time: screen 1, screen 2, screen 3. It confirmed that every screen showing the chart's bars also showed the warning. It passed. A reviewer then let the page stop at every 4 points instead. Between those screens it found hundreds of resting positions with bars on view and the warning below the edge, because a thumb doesn't scroll in whole screens.

**Like:** A night guard who checks the door on the hour, every hour, and reports "locked all night". The report is true for the hours he looked and silent about 2:30.

**In today's work:** `scripts/report-phone/guard.mjs`

```
for (let y = from; y <= to; y += 8) {   // stop the page every 8 points, not once per screen
```

That one line is the fix. The old walk stepped `y` by a whole screen height, so it only ever saw the positions a page-turning reader lands on.

**Why it matters to you as PM:** When a session says "the guard is all clear", the question that matters is what the guard walked. An all-clear over the wrong sample is how ruling (a) looked safe until a reviewer sampled differently.

**Check:** The guard now stops every 8 points. Suppose a future row adds a warning only 6 points tall that could sit entirely between two stops. Would the guard catch it if it went missing, and what would you ask the session to change?
