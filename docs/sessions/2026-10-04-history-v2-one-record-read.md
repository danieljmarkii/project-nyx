# History v2 — one record read for the whole screen, and a linear duplicate sweep (CUL-1228)

**Date:** 2026-10-04
**One thing:** D4 L1 — Guards: a test is only proven when breaking the code makes it fail · check: pending

Shipped via #1049 (draft). BUILD session on CUL-1228, History v2 · the record you can read, before HV-13's device pass.

## What shipped

**The duplicate sweep is linear.** `collapseSameMinute` (`lib/sameMinuteDuplicates.ts`) parsed both sides of every sort comparison, and every meal of one food falls into one group, so a two-year record ran hundreds of thousands of `Date.parse` calls. It now parses each instant once into a decorated array. On the issue's fixture (10,950 events over 730 days, node, warm) the sweep went from 168ms to 38ms; a guard counts the parses (134,450 for 5,000 rows against the old code, at most one per row now). The rule is unchanged: HV-15's differential against the report's live `dedupeEvents` is untouched and green.

**One record read behind every number.** The list's load reads the whole record once (`readHistoryRecord`: window facts, the record's facts over All time, courses, read states), slices the window from it (`historyFactsFor` in `lib/historyQueries.ts`: the window's days, and duplicates swept over the window plus a day of slack only), and publishes the record **on the same snapshot**. The pinned row's hook (`useHistoryRecordFacts`) no longer reads; it draws that record for the pet and day on screen. So the count line, the day headers, the strip, the pills and both sheets are one answer, and the race CUL-1228's newest comment named (the pill and the count line re-reading separately after a write) is gone.

- A scope change (filter, window, search) reuses the record read for the same pet and day, joining it while in flight. Every other reload reads it fresh.
- A sync tick while History is out of view no longer reloads; the return to the tab already does.
- Per refresh on All time: about 130ms once (89ms read + 41ms slice), where it was ~267ms for the list plus the pinned row's own whole-record read. A filter or window change is a slice only (7–41ms).

## Reviews and what they changed

- **`code-reviewer`**: no high-severity bug; sweep equivalence, staleness and pet/day stamping all held. Two real low findings, fixed in `3f9fe76`: a record whose courses read failed resolved successfully and was reused, so every later scope change failed again without re-reading (now released like a failed read); and the hook read any stale `failedRequest` as an error (a new load now clears an earlier request's failure). Nits applied.
- **`adversarial-reviewer`**: Claim A (the new sweep equals the old) held over 60,000 random corpora in three zones, both ISO spellings, NaN and extreme instants, duplicate ids and the 60s edge. Claim B (a slice of the All-time read equals a direct read of the window) **broke**: a `+00:00` row exactly on the duplicates' lower slack bound was dropped by the window read's SQL text prefilter (C-40) and kept by the slice, so behind an unbroken 24-hour 40s chain the two counted 45 and 44. Unreachable by real logging, but a real C-40 hole. Fixed in `3b53bf7`: the population read's SQL reaches a day wider than the slack, so only the parsed filter decides it. The reviewer also showed the slice-vs-window guard could not see a slack that was too wide; a new test pins it.

Falsification line: *Biostatistician: tried 60k random corpora old vs new `collapseSameMinute` → identical ✓; tried slice-of-All-time vs the HEAD~1 window read over 425 windows × 7 zones incl. DST days and rows planted on the slack bounds → equal ✓; tried a `+00:00` row on the lower slack bound anchoring a 24h chain → BROKE (45 vs 44), fixed by widening the SQL prefilter, pinned by a test red against the old prefilter.*

## Decisions

- **One trade-off, taken:** if the courses read fails, the list already fails its load; the pinned row now blanks with it instead of drawing counts without course rows. One answer, consistent with C-12.
- No Edge Function redeploys: no touched file is in any function's import closure. (The plan said `generate-report` would redeploy; it does not import the sweep until HV-15.)

## Lesson worth keeping

A differential test whose two sides share the code under test proves less than it looks: the new `readHistoryFacts` *is* `historyFactsFor` over a narrower read, so the guard compared the slice with itself. The adversarial pass closed it by comparing against HEAD~1's function. And the counterexample test first passed against the old prefilter, because the chain ended on a row count where the pairing phase cancels out; it went red only after the fixture's end moved one step. Both guards here were then proven by mutation (C-18, C-34).

## Residuals

- The record read itself (~89ms on the fixture, ~35ms of it `buildDayFacts`, which calls `dayOfInstant` per row) is the remaining cost; the duplicate pass still calls it again per row. Not worth a change before HV-13 measures on a real device.
- MERGE CHECK: CLEAN (3 ahead, 4 behind `main`; no collision with #1024, #1013, #1001).
