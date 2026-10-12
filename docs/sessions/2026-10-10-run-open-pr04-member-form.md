# Run open PR-04: an opened run's meals lead with the difference

**Date:** 2026-10-10
**One thing:** none — dispatched session, not this round's teach row

Dispatched session for CUL-1733, BUILD mode, branch `claude/run-open-pr04-10101831`. Shipped via #1165.

## What shipped

- **A member form of `SpineEventRow`** (`components/dayRow/SpineNodeRow.tsx`), used only by `SpineCompactRow` for an opened run's members. Line 1: *Meal* / *Treat*, the WET/DRY tag, the photo glyph, the rating chip. Line 2: the brand and product in `styles.line2`, the run's own formats register. The row's spoken label stays `eventRowLabel`, so VoiceOver still names the product.
- **`SpineRowFrame` takes `member`** (`components/recap/DaySpine.tsx`): a 9pt bead (`MEMBER_DOT`) whose top is derived from the 11pt bead's centre, so the two cannot drift, and the time in the ground's secondary ink. Without the prop the frame renders the same host tree as before (the single-row branch keeps its exact style array).
- **History v2 §3.6** gains one paragraph describing the member form. No version row: PR-06 (CUL-1737) bumps the same spec in parallel, and the dispatcher asked this edit to stay to the member form.

## How it was proven

- New `SpineNodeRow.test.tsx` block: a two-meal (All, Most) and a four-meal (two rated) run assert line 1 holds the meal word, format and chip and none of the product, line 2 holds the product in the formats line's exact style; the VoiceOver label still names the product; the member bead is 9pt, same ring and fill, centred on the run bead's centre; the member time is secondary while the run's range stays tertiary; a single row keeps the product on line 1, the 11pt bead and the tertiary time.
- Mutation: product back on line 1 with line 2 removed reds both line-2 tests.
- `tsc` clean; the dayRow, recap, TodayCard and DayCard suites and all guards green; full suite run before merge.

## Residuals

- The look on a phone rides the next TestFlight cut's device sitting.
- The spec's header version is not bumped here (see above).
