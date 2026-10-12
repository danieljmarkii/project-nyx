# Run open PR-06b: pin that History's timing read runs under a filter, a search and a month window (CUL-1760)

**Date:** 2026-10-10
**One thing:** none — dispatched session, not this round's teach row

Shipped via #1168. A `/dispatch` child (Run open, PR-06b), mode BUILD, built from the issue description with no plan gate. Test only: no store code changed.

## Why

PR-06 (CUL-1737) made a meal eaten just before a vomit keep its own row on History even when the vomit sits on a day History has not loaded. `historyNodesByDay` takes those vomits from `timing.onsets[].span`, which `readTiming` fills by reading from the first loaded day minus the episode gap, with no upper bound and no filter. The second adversarial pass on PR-06 confirmed by reading that `load` runs that read under every filter but Noticed, and found no test that said so.

## What shipped

Three cases in `store/historyListStore.test.ts`: a type filter (cough), a search (`cough`) and a past month window. Each seeds a vomit at 23:00 on the day before the first loaded day (inside the three-hour episode gap, on a day the scope hides) and asserts that:

- `readVomitOnsetsSince` was called with `dayStartMs(pages.span.fromDay)` minus the episode gap;
- the hidden vomit reached `snapshot.timing.onsets`;
- the vomit is not among the page's rows, so the case really is the hidden one.

The month case also pins that the span starts on the month's first day, so the vomit sits outside the window rather than merely unloaded.

## Proven by mutation

Each applied to `store/historyListStore.ts` and restored:

| Mutation | Result |
|---|---|
| Skip the read under any filter but All types | the filter case reds |
| Skip it under a search | the search case reds |
| Skip it under a month window | the month case reds |
| Read from the span's start with no episode gap | all three red |

Green under UTC and the three CI zones (Pacific/Kiritimati, Pacific/Chatham, Pacific/Honolulu); typecheck clean.

## Residual

The cases drive `load`. `loadMore` has its own copy of the Noticed-only gate (`historyListStore.ts`, the `Promise.all` in `loadMore`) and these cases do not exercise it; a mutation there alone would stay green. The issue asked for `load`, so this stays as stated.
