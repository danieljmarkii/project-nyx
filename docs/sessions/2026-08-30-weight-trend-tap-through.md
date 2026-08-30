# Weight-trend tap-through — the readings list behind both weight cards (CUL-223)

**Date:** 2026-08-30

Shipped via **#777** (draft). Mode: BUILD. Branch `claude/weight-trend-tap-through-niqtt7`.

## What shipped

`app/weight-history.tsx` — "Weight readings", a pushed screen listing every weigh-in
newest-first, reached from the `Last weighed {date} · N readings` line on **both**
weight cards (Profile `WeightTrendCard`, Patterns `WeightCard`). Each row opens the
`weight_check` event it already is, so the edit and the delete stay where they already
live and this screen owns no editing of its own.

Supporting: `lib/weightHistory.ts` (the pure view model), `getWeightReadings` +
`getWeightReadingCount` in `lib/weight.ts`, the `WEIGHT` value on `app/event/[id].tsx`,
and route registration.

Client-only — `lib/weight.ts` is in no Edge closure, so neither standing deploy hold
(CUL-19, CUL-557) is touched.

## The three things the tap-through forced

The interesting part of this session is that the feature itself was small, and each of
the three real defects was something the tap-through would have made *visible* rather
than something it introduced. Written down because the pattern generalises: **adding a
door is a good way to audit the room.**

**1. The "N readings" count was false.** Both cards read `getWeightHistory(petId, 12)`
and rendered `trend.readingCount`, which is `min(total, 12)` — so a pet with 20
weigh-ins read "12 readings". Invisible while the count was terminal; the moment it
labels a list of 20, it is a promise the destination breaks. Surfaced to the PM as a
decision brief before coding (fix here / file separately / cap the list to match) and
ruled **fix here**.

`computeWeightTrend` now takes an optional `totalCount`. **The first draft of that fix
was itself broken** and is the lesson worth keeping: the natural edit is
`const count = Math.max(seriesLbs.length, totalCount ?? 0)`, and `count` is also the
array index (`seriesLbs[count - 1]`, `sorted[count - 1]`). With a total of 20 over a
12-row window that reads `undefined` and then throws. So the two live in separate
variables with the rule stated in place: **the window is the only thing that may index,
the total is the only thing that may be spoken.** Both halves are pinned by tests
confirmed red against a re-conflated source.

**2. The destination did not show the number.** `getEventById` has always selected
`weight_kg` — the History row renders it — but `app/event/[id].tsx` had FOOD / INTAKE /
MEDICATION / NOTES sections and no weight. So the tap-through would have landed an
owner on a weight check with no weight on it: the one number they opened it to check.
Three lines and no query change, which is what made it easy to miss.

The first draft labelled it `WEIGHT` as a section — and the test failed with *"Found
multiple elements with text: WEIGHT"*, because the type heading already reads WEIGHT
(`EVENT_TYPES.weight_check.label` is 'Weight', uppercased). Moved under the date,
unlabelled. A test catching a copy duplication rather than a logic error was a nice
accident of asserting on rendered text.

**3. Both cards' "Log a weigh-in" carried `hitSlop={8}` on a `minHeight: 44` box.** The
CUL-579 shape exactly: a control already at the floor gains no reach from slop and only
reaches into its neighbour's — and the neighbour was about to be the new tap-through
row. Deleted on both; the new row carries its own 44pt box.

## Two smaller findings

**The year band (CUL-69) applies to any unbounded list, not just the report.** The
cards' `formatWeightDate` stamps a year only on a date outside the current one — safe
on a card showing ONE date, wrong in a list, where per-row stamping renders
`Nov 23, 2025` directly above a bare `Jun 12` and the bare one inherits the stamped
year, so the newer reading reads as the older. `buildWeightHistoryRows` decides once
for the whole list. Mutation-proved both ways (per-row stamping, and the plausible
half-fix of reading only `readings[0]`).

**The line had to shrink.** Found in my own diff during the pre-push adversarial read,
not by a test: the readings line sits in a row with a chevron and no `flexShrink`, so
the longest real phrasing (year stamp + three-digit count) pushes the chevron out of
the card. Nothing about that is visible in a green diff.

## One mutation that proved nothing

Worth recording because it is the CUL-613 failure mode from the other side. Testing
"renders NO touchable when there is nothing to open", the mutation was to make
`ReadingsLink` render a `disabled` node — and the suite stayed green. Not because the
test was weak, but because the mutation was **unreachable**: the card's empty branch
never reaches `ReadingsLink` at all. Re-run as a reachable defect (render the link in
every state, disabled when empty) it went red. *A mutation that does not change
behaviour has not tested the guard either* — check the mutant actually executes before
concluding anything about the test.

## Verification

`tsc --noEmit` clean. **6282/6282 jest green**, 292 suites. All 9 guard suites green
(incl. `edgeFunctionDeploy` — no closure drift — and `geistRollout`). Full suite green
under the non-UTC CI matrix (UTC+14 Kiritimati / UTC+12:45 Chatham / UTC−10 Honolulu),
which the year-band rule needs since it reads local components.

Two existing suites (`app/insights/index.test.tsx`, `signalsV2Panels.test.tsx`) went red
mid-session because the screen makes a genuinely new call their `lib/weight` mock did
not provide; the mocks were extended, not the check weakened.

Every new guard was proved by mutating the source it protects — 11 mutations across
`computeWeightTrend`, the year band, the screen's `loaded` flag and pet scoping, both
cards' geometry, and the detail screen's value.
