# Home's timing row draws its counts, not a lane (CUL-1499)

**Date:** 2026-10-25
**One thing:** none: the session's concept (a chart drawn from counts cannot claim positions the payload lacks) is the chart standard itself, already taught.

BUILD session for CUL-1499, shipped via #PR_NUMBER.

**What was wrong.** Under Design v2, Home's Signal row drew the timing finding as `DotLane`. The finding carries counts, not each episode's minutes, so the lane spaced its dots by index. Its "30m" label, one of three words in a `space-between` row, sat at mid-lane while the band ended at 30/120 of it. The row also never named its 60-day window or the untimed episodes. The time-of-day lane had the same index spacing, though its band was correctly placed.

**What shipped.**
- `components/surfaces/signal/SignalRow.tsx`: a timing row (postprandial or time of day) draws the two-count `StackedCompare` from `timingCompareRows`, always. No lane, no degrade branch.
- `lib/signalHomeLine.ts` `timingRowDenominatorLine`: the line under the compare, "9 timed of 12 episodes · last 60 days" (the timing story's sample-line form, the window named as a span). The row's spoken label keeps the count sentence and adds this line, so every number is still spoken.
- `docs/nyx-chart-standard.md` v1.1: the dot lane's row is marked retired from Home, and the stacked compare's row records the timing row's denominator and window.

**Decided.** The PM ruled (a), the compare, over (b) moving the axis words to their true positions while the dots stayed index-spaced. The PM also waived the mock frames: the shape is already the frequency row's pair on Home.

**Falsification.** The issue's own counterexample (8 vomits at 25 to 29 minutes, one at 31) now draws "Within 30 min of eating 8 · Timed, but later 1", with no mark at an invented position. The test asserts that no node in the thumbnail carries a percentage `left`. Two mutations proved the tests: putting `DotLane` back reds two tests, and dropping the denominator line reds two.

**Residuals.**
- `DotLane` still exists, and `InsightCard`'s card face (rendered by nothing) still calls it. Deleting that dead component is out of scope.
- The true-minutes lane on Home waits on the detector shipping `eligibleMinutes`: `docs/nyx-postprandial-receipt-requirements.md` PRs 2 to 4.
- The full suite showed one load flake, `app/insights/index.test.tsx`, which passes alone with and without this diff.
