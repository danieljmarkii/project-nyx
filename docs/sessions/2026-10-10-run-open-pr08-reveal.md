# Run open PR-08: a run that opens out of sight moves the list just far enough to show its first meal

**Date:** 2026-10-10
**One thing:** D3 L1 — Reading a test: it proves only the cases it builds (5,000 random cases stayed green with the bound deleted) · check: pending

Dispatched session (`/dispatch`, Run open PR-08), BUILD mode on CUL-1735. Shipped via #1172.

## What shipped

- `components/motion/runRevealMotion.ts` (new):
  - `runRevealDistance`, a pure function. It moves the smaller of two amounts: what shows the first meal clear of the plus, and what keeps the run's top a margin (24pt) under the list's top. Zero under 2pt.
  - `RunRevealContext`, which the run asks through.
  - `useRunRevealHost`, the list's half:
    - One pending reveal at a time.
    - Fired once, a frame after the scroll content grows, or by a 112ms fallback timer.
    - Cancelled by a drag.
    - Bounded under whatever is pinned over the list's top (`topInset`).
- `components/motion/runOpenMotion.ts`: `useRunOpen` gains `onFreshOpen`.
  - Called on the box's commit, or on Reduce Motion's at-once box.
  - Never called on a reversal, a close, a re-key, a blur or a host's reset.
- `components/dayRow/SpineNodeRow.tsx`:
  - The run measures its header with `measureInWindow`, plus its first meal's foot from the layout reports (a 44pt floor before they land).
  - A close tap, a settle to closed or closing, and a re-key all drop a reveal that has not yet landed.
- Home (`app/(tabs)/index.tsx`, its `ScrollView`) and History (`components/historyV2/HistoryList.tsx`, its `SectionList`) own the scroll.
  - `animated: !reducedMotionNow()` on both.
  - History measures its sticky day header and bounds under it.
  - A drag cancels the reveal on both lists.
- `guards/haptics.test.ts`: the new module is added to `ALWAYS_SCANNED`, proven by mutation (a `commitSymptom` import reds it).
- `docs/nyx-history-v2-requirements.md` v1.17: the §4 row *Reveal an opened run*, approved with the D3 ruling (a doc edit that only matches shipped code).

## Decisions (team calls inside the ruling)

- **The plus's top** is the screen's height less `FAB_BOTTOM + FAB_DISC` (128pt), with an 8pt gap. The meal must clear the plus even though the plus sits at the right edge, because the ruling says "clear of the plus".
- **The margin** is `theme.space3` (24pt) under the list's top on Home. On History it sits under the sticky day header.
- **The fire** comes on content growth plus one frame, with a fallback timer. Under the open's layout animation, Fabric commits the final layout at once, so the content grows on the box's commit and the scroll does not clamp short. The device pass checks that this lands.

## Review

`code-reviewer` (isolated) said fix-before-merge on two findings, both fixed in this PR:

1. **History's sticky day header.** The bound sat 24pt under the scroll view's frame, which is under the pinned header. The fix is the `topInset` the History host reads from the header's layout. There is a test with a 40pt inset.
2. **Cancel paths.** Only a close tap cancelled. Now a reset, a settle to closed, a re-key and a drag all cancel, including a measure that is already in flight. The reset test is proven by mutation: removing the phase effect reds it.

Minor findings:

- **Accepted as residuals:**
  - Home's offset ref is throttled to 100ms, but a drag now cancels, and a tap lands on a list at rest.
  - An unrelated content growth in the same frame could fire the reveal early, using the 44pt stand-in.
- **Fixed:** the C-34 note on the 44pt floor.

## Falsification and mutation

- **The bound.** Replacing `Math.min(toShow, Math.max(0, room))` with `toShow` first left the "never above its margin" property **green**. The 5,000 random geometries never drew a run near the top with its meal far below. I widened the generator to short viewports and tall first meals, and the property reds. Two worked examples red as well.
- **The haptics entry.** A `commitSymptom` import reds `guards/haptics.test.ts`.
- **The reset drop.** Removing the phase effect reds the row's reset test.

## Residuals

- The real Fabric ordering (content growth on the box's commit, before the fallback timer) is unproven in jest. It rides the next TestFlight cut's device sitting, through the QA script in #1172.

## Teach

### One thing — Reading a test: it proves only the cases it builds (D3, L1)
A test that checks a rule "for thousands of random cases" sounds airtight, but it only proves the rule for the cases it actually made. If the case generator never makes the awkward one, the test passes whether or not the rule is in the code.

**Like:** a smoke detector tested by holding a match under it in every room except the kitchen. A thousand passes, and still no evidence about the kitchen.

**In today's work:** `components/motion/runRevealMotion.test.ts`, the generator
`const mealBottom = runTop + 88 + r() * 412;` (the first meal's foot, anywhere from 88 to 500 points below the run's line). The first version said `+ 140` at most. With that, the meal was never far enough below a run near the top for the "don't push the run off screen" limit to matter. Deleting the limit left all 5,000 cases green.

**Why it matters to you as PM:** when a PR says "property-tested over N cases", the question to ask is whether breaking the rule turned it red. A count of cases is not that evidence.

**Check:** if the generator had produced only runs in the middle of the screen, what would deleting the "keep the run on screen" limit have done to the test, and why?
