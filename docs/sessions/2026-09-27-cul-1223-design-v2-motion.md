# CUL-1223 — Design v2's motion defects, before the device pass

**Date:** 2026-09-27

Linear project **Design v2 — the whole day**. The PM ruled CUL-1225 GC-1: fix the known motion defects before the device pass (CUL-1070) runs, so the pass judges feel. Shipped via #962.

## Scope

Four of the issue's five items were live on `main`. Item 2 (unfolding the lead swapped components) was superseded by #927 (CUL-1285 retired the fold under design_v2); the issue description was patched to say so, with the original text kept.

## What shipped

- **The draw-in plays on the daily charts (BRK-12).**
  - Home's lead chart draws on first mount through `components/motion/coldStartDraw.ts` (`useColdStartDrawFact`): held while the cold-start silhouette is up, and once it has shown, until `coldStartHandoff` bumps. The hold includes the one render between hydration ending and the bump, so the draw never starts and restarts a frame later.
  - The lead card keeps a ready model while it re-reads the same finding. Every sync tick used to swap the chart for a skeleton, which with the draw armed would have redrawn it on every sync.
  - The flight's clone is its own mount, so it is staged with a static chart.
  - The month draws on first show; the weight card draws once per pet; the Signal screen's compare draws on its own 200ms landing (`drawDelayMs`) instead of unseen at opacity 0.
- **The opening fits 700ms (WBC-3, WBC-4).** `drawInPlan` is one pure ceiling over delay, marks and labels. The stagger compresses as a total span; lanes stagger per lane; each mark is up for its lead before the labels land. PM ruling, option (a): the mock's durations stay; bar and dot label delays move to 400ms. The landing seeds `-driftPt`, the house direction.
- **The first-pattern arrival mounts once (BRK-49).** Under design_v2 the stack always sits in one `ArrivalStage` (switched by `active`) and each row is always an `Animated.View`. Before: three mounts, each at the skeleton, and a VoiceOver focus reset. Flag-off is unchanged.
- **Cleanup pins, never freezes.** Both `useDrawIn` and `useSignalOpen` settle on cleanup; `useDrawIn` reads the mark count at arm time, so a re-read that moves the count neither restarts nor snaps a draw in flight (code-reviewer notes).

## Verification

Every new test was run against the pre-fix source and failed (the arrival test counted 3 reads, then 1), or was proved by mutation (the ceiling, the per-lane index, the drift sign, the count dependency, the static flight clone). The code-reviewer independently reverted the source in a scratch copy and saw all six touched suites go red. `tsc` clean; full jest suite green.

## Decisions

- PM: option (a) for the timings.
- Team: the ceiling is one function with a property test over every kind, 1–200 marks and both delays, rather than per-chart constants.

## Residuals

- The half of item 3 about the route itself (the opening's beats starting at the push, the full-height slide) was out of this session's scope; filed as CUL-1376.
- The feel of every motion is the device pass's (CUL-1070); the PR carries the dev-client script with each duration.
