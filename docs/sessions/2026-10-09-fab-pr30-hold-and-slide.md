# FAB PR-30: press and hold, slide to a pill, let go

**Date:** 2026-10-09
**One thing:** D4 L1 — A test is proven by breaking the code it protects · check: pending

Dispatched session (`/dispatch`, FAB round 2, Wave 4), CUL-1278, built to the FAB convening's five amendments (CUL-1625, 2026-10-07). The row was plan-gated: the plan went on the issue, and the PM typed the go in this session. Shipped via #1132, left open for its merge gate: PR-30c's re-measure (reported on CUL-1674, data half met) and a device pass on a real thumb.

## What shipped

- **The hold.** Holding the disc for 250ms opens the fan through the same `openMenu` a tap uses. The finger is followed from the disc: the touch belongs to the disc's Pressable from press to lift, so its moves bubble to a wrapper View whichever pill they cross, and no pill's own press fires during a slide.
- **The write rule, `lib/fanSlide.ts`.** Pure, and tested as data. A release does exactly the tap's action for the pill under it, or nothing:
  - Vomit, Normal and Loose open their confirm and never write (amendment 2).
  - More events and Log food open their door.
  - A food writes through the tap's own `handleQuickMeal` (same writer, card, flight and trial flag), and only from a pill held still for 150ms on a fan that has landed and been measured (amendment 3).
  - A release off every pill closes with no write. A finger that never left the disc is a slow tap and leaves the fan open.
  - A redeal or a close under way is busy, and nothing acts.
- **No ring** (amendment 1). The pill under the finger takes the tap's pressed fill; Reduce Motion drops the scale, as the tap does.
- **`slideCross()`**, a new selection verb in `lib/haptics.ts`, ticks on arriving at a pill and never on leaving one. The export pin in `lib/haptics.test.ts` now lists nine verbs.
- **Tap path untouched** (amendment 4). Under a screen reader the disc takes no long press at all.
- **`measureNodeOnPage`** in `lib/measureNode.ts`: the page-space sibling of `measureNodeInWindow`, the space a touch's `pageX` and `pageY` are reported in.

## Decisions

- **A too-short rest on a food leaves the fan open** rather than closing it, so the owner's next tap is the log. **A release on the pet chip closes** rather than opening the switcher: a switch is not a log. Both were in the plan the PM approved.
- **The large-text scroll branch is tap only.** A door scrolled under the pinned chip still measures where it hides, so a hit-test there could open a door the owner cannot see.
- **A finger already still on a food when the fan lands cannot write until it moves.** Its rest has no event time to be counted from. That fails toward no write, and it is a device-pass item for how it reads.

## Reviews

- **code-reviewer: ship-ready**, nits only. The silent catch on the screen reader probe now warns and says why it fails safe, and the render-time ref writes carry a note that they are idempotent. The casts were left as they are.
- **adversarial-reviewer: three passes, FAIL, FAIL, PASS.** Every write path held its in-process counterexample from the first pass. What broke was the rule's footing:
  - **B1, the dwell clock.** It was read with `Date.now()` in the handler, so a JS stall stretched a 30ms brush past a food into a 150ms rest. It now runs on the touch's own `nativeEvent.timestamp` at both ends, and a missing time never qualifies.
  - **D1, coordinate spaces.** Touch `pageY` against `measureInWindow` frames was predicted to sit one Android status bar apart, which would write the neighbouring food. Pills are now measured in page space. The first backstop (the press point inside the disc's frame, plus 12pt) failed the second pass: the press can sit anywhere on a 56pt disc, so it tolerated up to 68pt, and under a 24pt shift a rest on one food wrote the other. The check now compares origins exactly: the disc's measured origin against `pageX - locationX`, `pageY - locationY` of the press, within 2pt, with the disc's content set to `pointerEvents="none"` so the press always targets the Pressable's host.
  - **F2, a slow tap with a roll.** A 400ms hold that rolled 7 to 10pt on the disc opened the fan and closed it. "Left the disc" is now the disc's frame, not a 6pt slop.
  - **C2, the scroll branch.** Tap only (above).
  - **E1 and E2.** A close under the finger (a completion card, the capture overlay's stand-down) now ends the slide, so no tick plays over whatever took the fan's place.
  - **C3.** One missing frame drops the whole measure, so the code now does what its comment said. The row signature also carries the scroll branch, the width cap and each food's line count.
- Each guard was proven red by mutation. One survivor needed all three of its scroll checks removed before it went red, since they defend in depth. A `retract`-time clear that survived was removed as redundant.

## Tests

- `lib/fanSlide.test.ts` (rule as data), `components/log/FAB.slide.test.tsx` (wiring; the measure stub answers page frames by testID and can be switched off or shifted), `lib/measureNode.test.ts`, `lib/haptics.test.ts`.
- The full suite passes, with typecheck clean: 625 suites, 14,655 tests.
- Jest cannot prove that touch moves bubble to the wrapper while a long press holds the responder, the native hit-test with a `pointerEvents="none"` child, or what `locationX` is measured from on each platform. All three are on the device pass.

## Residuals

- **The device pass, iOS and Android**, is owed before merge: tap, slow tap and hold-and-close still work; a hold turns slide mode on (the "measure and touch disagree" warning does not fire); a slide lands on the pill under the finger; event timestamps are in milliseconds on both platforms; and how the pressed fill reads when a still finger cannot write.
- **A pre-landing move handled after the measure** gets a rest start from a few milliseconds before the fan landed. The window is a frame or two. The reviewer called it low and the fix optional; it was not built.

## Teach

### One thing — A test is proven by breaking the code it protects (D4, L1)
A test that passes tells you nothing until you have seen it fail for the right reason. So after writing a guard, you deliberately break the code it is meant to protect and check the test goes red; if it stays green, it was never checking anything. Today one test passed while protecting nothing: it shifted the pills 80 points to fake a status bar, but real status bars are 24 to 48, and at 24 the old check let a wrong food through.

**Like:** testing a smoke alarm by holding a lit match under it, not by noticing it has been quiet all year.

**In today's work:** `components/log/FAB.slide.test.tsx:381`
`for (const k of Object.keys(mockFrames)) mockFrames[k] = { ...mockFrames[k], y: mockFrames[k].y - 24 };` moves every measured pill up by one real status bar, the smallest one a phone has. With the check switched off, this test goes red and the neighbouring food gets logged; with it on, nothing is written.

**Why it matters to you as PM:** when a PR says "tested", the question that matters is whether anyone watched the test fail first, and against a case production can actually produce.

**Check:** If a test for the Vomit confirm still passes after someone deletes the line that opens the confirm, what does that tell you about the test?
