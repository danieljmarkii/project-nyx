# A failed look keeps only the rose on Home and History (CUL-1585)

**Date:** 2026-10-04
**One thing:** none — dispatched session, not this round's teach row

Shipped via #1058 (PR-34b of "Out of beta — Noticed, Design v2, History v2, the trial screen"; dispatched BUILD).

## What shipped

- **One rule, `carryRosesAcrossFailedLook` (`lib/readState.ts`).** When a look at the phone's copy fails for a set of ids, a row `isWorthACall` calls a call stays drawn, a row the server left `pending` stays, and every other row the look asked about goes back to unanswered (no photo glyph, no mark: C-12's "has not answered"). When nothing goes back it returns the same object.
- **Home (`TodayCard.refreshAnalysis`).** The `null` branch applies the rule instead of returning. It moves no applied mark, so an older answer still lands after it (HV-6 ordering unchanged).
- **History (`store/historyListStore.ts`).** `ReadAnswer` carries a `failed` set, `joinAnswers` subtracts answered ids from it, and `settleReads` applies the rule through `load`, `loadMore` and `refreshReads`. An older look in `load` yields with nothing demoted. `refreshReads` now lands a failed look without moving `readsApplied`.

## Decisions

- **Not a no-op.** On these surfaces a calm draws the photo glyph and no mark, unread draws the grey *No read yet*, and unanswered draws neither. A kept calm is visibly different from the honest state.
- **Demote to unanswered, not unread** (Designer lens, a team call logged on CUL-1585). That's the issue's fix shape, and it's the state C-12 already designs for "could not look". *No read yet* would claim no read exists. The reviewer dissented: unanswered hides the photo, and a lasting failure has no error or retry. That's broader than this fix, so it's filed as CUL-1588.
- **Pending rows carry.** Pending outranks calm, so keeping one is no reassurance, and the row is what keeps the watch alive.

## Falsification

The isolated `adversarial-reviewer` returned **BREAKS (narrowly)** on the first commit. Every rose shape held (a rose only in rows, an unknown verdict, a failed-status call, a call only in the tier), and so did overlapping looks in both orders and `load()`'s partial failure in the landing loop. What broke: a server-left `pending` row was demoted, which tore down its watch on Home (`watchAnalysisRow`) and History (`pendingKey`), so a later `worth_a_call` stayed undrawn until the next foreground. Fixed in the second commit with tests that fail against the first: the Home watch stays armed and is not re-armed, and the History store keeps the pending row through both `refreshReads` and `load`. The CUL-1585 tests themselves failed against `main`'s store and card before the fix.

## Residuals

- Low, and already true before this change: an older successful look landing after a newer failed one can bring back a calm from before the photo was replaced. Ordered SQLite reads against a server round-trip of seconds make it practically unreachable.
- CUL-1588: a lasting local read failure on these surfaces reads as "never answered", with no error or retry.
