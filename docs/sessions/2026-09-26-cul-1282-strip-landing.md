# History v2: a strip tap lands on its day (CUL-1282)

**Date:** 2026-09-26

Shipped via #928 (CUL-1282). Filed and claimed CUL-1282 this session, from the PM's device pass.

## The ask

The PM, on the device with `history_v2` on, tapped the 15th in the week strip. The cell took its ring, but the list stayed on today. They asked whether it should scroll. §3.4 and §3.1 say it should: a tap lands on the day's card, a jump and never a glide, with the card outlined. The PM greenlit the fix after the plan.

## What was wrong

- **The jump aimed at the day's sticky header, and the list records every sticky header at offset 0.** `ScrollView` wraps each sticky header in `ScrollViewStickyHeader`. The cell's `onLayout` reports a position relative to its parent, which is that wrapper, so `VirtualizedList` stores every day header at y = 0. `scrollToLocation({ itemIndex: 0 })` targets the header cell, so every landing scrolled to 0. That is exactly the screenshot: nothing moved, because the list was already at 0.
- **A day the landing had to page in was never measured in time.** The recovery jumped to `averageItemLength × index`, which lands short because it ignores the ~400pt list header and the zero-height footers pull the average down. It then re-aimed three times on a 50ms timer.
- **Three exits dropped a landing and logged nothing.**
- **Why tests missed it:** every landing test mocked `scrollToLocation`, and jest lays nothing out, so the real scroll never ran (C-41 in a new place).

## What changed

- **`lib/historyScreen.ts`:** `LANDING_ITEM_INDEX = 1` (aim at the section's first item; RN lifts that jump by the header's measured height, so the header lands at the top). `landingStepFor` gives the furthest measured cell with a true offset, stepping back from a header. `LANDING_STALLS` replaces `LANDING_RETRIES` / `LANDING_RETRY_MS`.
- **`components/historyV2/HistoryList.tsx`:**
  - The jump aims at the item.
  - A day not measured yet is re-aimed on every cell layout, through a `CellRendererComponent` that runs the list's own handler and then pings. Between attempts it steps to `landingStepFor`'s cell, bounded by stalls, never by a timer.
  - The owner's scroll and the re-press end the aim.
  - Every dropped landing warns with its reason.
- **Tests:**
  - A harness drives the real `VirtualizedList` with the layout a phone reports (header cells at the wrapper's origin, cells placed by index) and asserts the final offset for three cases: a drawn day, a day on older pages, and a day past the drawn window (scroll events fed back). A fourth test covers a landing the pages cannot reach, which warns and moves nothing.
  - Red on the old code (offset 0; never scrolls).
  - Four mutants (aim at the header, drop the ping, drop the step, step onto a header) each red at least one test.
  - `landingStepFor` is table-tested.

## Decisions

- Kept `stickySectionHeadersEnabled` (H-3's sticky day header) and fixed the aim instead.
- `onFocusCapture` rides a spread onto the cell's View, as RN's default cell passes it. The View types do not declare it.

## Verification

- `tsc --noEmit` clean.
- Full `jest`: 520 suites, 11,706 passed.
- The changed suites pass under UTC+14, +12:45 and −10.
- No device run yet (the QA script is on the PR).

## Persona sign-off

Engineer ✓ (root cause traced to RN source, tests over the real list, mutation-proven). QA ✓ (§3.1 / §3.4 landing ACs covered: a drawn day, a paged day, a day past the window, a dropped landing). Designer ✓ (Principle-free change; the jump stays a jump, `animated: false`). Data N/A. Dr. Chen N/A.

## Open

- The on-device pass is still owed. It is part of HV-13 (CUL-1171).
