# A bowl that held part of the trial takes the meals-logged ratio too (CUL-1578)

**Date:** 2026-10-04
**One thing:** none — dispatched session, not this round's teach row

BUILD session dispatched by `/dispatch` as PR-43e of the Out of beta run order. Shipped via #1057. Builds on PR-43d's `bowl_throughout` (#1051).

## What shipped

- `lib/dietTrialCard.ts`:
  - A `bowl_part` withholding reason (`pastPartialBowl`): a bowl overlapped the counted range, is gone now, and did not hold every counted day. It is disjoint from `free_fed` and `bowl_throughout`. The Home strip withholds its ratio on it, and so do Get ready (which quotes the strip) and the this-week lane (which inherits the list). It is not in the not-eating subset, so the vomit standing line is unchanged.
  - `withoutBowlRatio`, the card's one projection, now also nulls `coverage` on that record (`partialBowlOnCard`). The "For part of this trial…" qualifier, the feeding total and the off-diet floor all stay.
  - A finished (completed or abandoned) trial whose bowl was still down on its last day, but went down mid-trial, now drops the ratio and names the bowl. Terminal cards never route to the `free_fed` register, and `pushPastBowlCaveat` returned on `freeFed`, so those cards printed "Meals logged on 30 of 56 days" with no bowl line. The strip never sees a terminal trial, so this predicate sits beside the reason list rather than in it.
- `lib/widgetSnapshot.ts`: `widgetTrialCoverage` withholds on `intakeNotDirectlyObserved` (any overlap), matching the strip.
- Tests:
  - The issue's real-loader record (bowl on days 20 to 30, meals every other day, read on day 50), plus the comment's 30-bowl-day overrun.
  - Card, strip, completed and abandoned cases, each with an armed no-bowl control.
  - The strip's independently restated predicate gains the bowl facts (it had missed `freeFedThroughout` too).
  - Four mutants, each red: dropping the reason, the projection, the terminal branch, and the caveat change.

## The rule, and why it was a team call

The issue's newest comment asked for one partial-bowl rule across both surfaces. The rule chosen: **any bowl in the counted range means no meals-logged ratio**. Data: the denominator mixes days a meal-by-meal record could hold with days it never could, so the number understates a compliant owner (39 of 50) or flatters one who logged on top of the bowl (56 of 56 over 55 bowl days). Designer: the strip has no room for the qualifier, and on the card the qualifier now explains an absence instead of sitting beside a number it contradicts. The lenses agreed, so no PM brief was needed. A ratio over the non-bowl days alone was considered and set aside: the card input does not carry the bowl's dates per day, and a new spoken count would need its own pass.

## Falsification

`adversarial-reviewer`, one pass, on a scratch copy:
- **Held:** active, overrun, below-floor, terminal `refusal_withheld`, the trial screen, the week lane, the door row, Get ready, signalScreen and the widget. The off-diet floor and the vomit line survive.
- **Broke, in this issue's class:** the finished-trial-with-bowl-down case above. **Fixed here.**
- **Broke, pre-existing:** the vet report prints the ratio over any bowl. Already filed as CUL-1577; the reviewer's extra findings are a comment there. CUL-1586 was filed by mistake and closed as its duplicate.
- **Low:** the gate is asked over the trial window, wider than the counted range (C-35), so it over-withholds for a bowl only after the target end or only in the untracked head. It errs toward silence. Filed CUL-1587.

## Persona sign-off

Designer ✓ (no new copy; the qualifier now explains an absence) — Engineer ✓ (one projection, one reason list; the terminal case beside it, documented) — Data ✓ (the denominator argument; C-35 residual filed) — Dr. Chen N/A (no report change; CUL-1577) — QA ✓.

## Residuals

- CUL-1577: the vet report still prints the ratio over bowl days, so Home and the report disagree until it ships.
- CUL-1587: the gate's window is wider than the claim's.
