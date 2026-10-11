# CUL-1780: Home's trial line waits for supports before a bare date implies a clean record

**Date:** 2026-10-11
**One thing:** D3 L1 — Reading a test: what an "absent field" test proves, and why it was written to fail loud · check: pending

Shipped via #1186 ([CUL-1780](https://linear.app/projectnyx/issue/CUL-1780)). Mode: BUILD.

## What shipped

- Home's Design v2 trial card line (`resolveTrialStrip` → `cardLine`, `lib/dietTrialCard.ts`) used to show a bare "Ends <date>" at zero off-diet feedings whenever `mayStateRecordClean` passed. That gate accepts `partially_supports`, which starts at half the days logged. The line shows the off-diet clause only above zero, so a daily reader takes the bare date as "nothing off-diet", and the card prints no ratio (the [CUL-1526](https://linear.app/projectnyx/issue/CUL-1526) ruling).
- New predicate `mayImplyRecordClean(facts, opts)` in `lib/dietTrialCard.ts` = `mayStateRecordClean` plus `supports`, measured with the untracked head counted in the denominator of both the designed and the live window, and merged with `facts.interpretability` by `leastReassuring`.
- `lib/dietTrialFacts.ts` sets it as the optional `exposures.mayImplyRecordClean`, passing the same `stoppedForRefusal` as the old gate. Absent reads as false, so a missed construction site renders "off-diet check incomplete" rather than a claim.
- Tests: card cases (the 30/56 zero → incomplete, a below-supports count still leads with no suffix, an absent field → incomplete, the property and its non-vacuity floor now keyed on the new field) and loader cases through the real `computeTrialFacts` (the supports boundary and one day under it, both derived from `COVERAGE_SUPPORTS`, the issue's 30/56 counterexample, the late-first-log head clip, and a short clinic hand-off head that still clears).

## Decided

PM ruling 2026-10-11, option 1 of the decision brief posted on the issue: the bare date requires `supports`. The ratio stays off Home (CUL-1526 G3 stands). No new copy; "off-diet check incomplete" already existed.

## Falsification

- Pass 1 (adversarial-reviewer) broke the first draft quietly: coverage starts at the first logged day by design (§10 S3), so a first log on day 40 of 56 followed by 8 logged days read 8 of 8 `supports` and the bare date stood over 8 of 48 trial days. The old gate had the same hole, so this was not a regression, but it is the issue's failure through another door. Fixed by adding the head to the gate's denominators; a 2-day clinic hand-off still clears.
- Pass 2 traced the revised predicate: the head and `coverage.daysElapsed` share one start index, so the sum is exact; the one inexact case (live end earlier than designed) double-counts the head and errs loud; `not_yet` cannot be padded into `supports`; the predicate is strictly narrower than the old gate. Held. Two passes, the cap.
- Mutation proofs: reverting the card gate reds 4 card tests; dropping `supports` from the predicate reds 2 loader tests; zeroing the head reds the head-clip test.

## Residuals

- Coverage saturates on the first meal of a day, so a once-a-day logger whose household slips an unlogged evening treat still reaches `supports`. Disclosed in the predicate's docstring; ratifying 0.8 stays Dr. Chen's question (`lib/dietTrial.ts` `COVERAGE_SUPPORTS` note).
- Filed, both predating this PR: [CUL-1818](https://linear.app/projectnyx/issue/CUL-1818) (the legacy strip `line` on Foods and Get ready shows a bare "food · ends date" at zero over a withheld ratio) and [CUL-1819](https://linear.app/projectnyx/issue/CUL-1819) (Home's card has no multi-pet household caveat).
