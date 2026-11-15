# Loose ends PR-35: the editor's time check and its write are one statement

**Date:** 2026-11-15
**One thing:** none — dispatched session, not this round's teach row

Shipped via #1553 ([CUL-2772](https://linear.app/projectnyx/issue/CUL-2772)). A dispatched shaping row (DISCOVERY): the session read the code, posted a decision brief with its appetite, and built on the PM's `Go`, typed in the session, which took both recommendations.

## What the shaping found

The issue asked for a SQL guard and said jest had no real SQLite path to prove one. Two things were different on reading:

- **The test path exists.** `lib/updateEvent.test.ts` already drives the real `updateEvent` over `node:sqlite` with the runtime schema, and ten other suites do the same. The issue's reason for being parked was stale.
- **The race does not need the floor flag.** The issue located the gap in `writeOwingFloorCheck`'s extra SELECT. A hydrate upsert already queued on the connection lands between the save's read and its UPDATE with the flag off too, because hydrate overwrites any row still marked synced and the row stays synced until the save's own statement runs.

## The two rulings (PM, 2026-11-15)

1. **The guard is a compare and swap, not a SQL copy of the window rule.** `updateEvent` takes `ifTimeStill`, the four time fields the save just read, and the UPDATE changes zero rows when any of them moved; that is thrown as `EventTimeMovedError`. The editor re-reads and re-judges once with the one JS rule (`pointLeavesStoredWindow`), then shows the existing "This time was just updated" alert. The issue sketched a `julianday` mirror of the rule in SQL; this keeps one rule in one place (C-34) and compares the row with itself, so spelling never enters it (C-40).
2. **An untouched, unmoved time is not restated.** A save where the owner neither touched a confidence control nor moved the point hands the row its own `occurred_at` and provenance back, verbatim (`timeWriteForEdit`). This is B-448's rule for the confidence, extended to the point. It closes both instances in the issue's newest comment: a window replaced by another window, and a window re-graded to witnessed, each overwritten by a note edit carrying the time the screen loaded at mount. The Data Scientist's dissent is on the record: it reads as a field level mix of remote time and local note against "no merge logic". The ruling treats it as the editor declining to restate a field it was not asked about; sync stays last-write-wins by row.

## What broke, and how

- **A guard keyed to indentation.** `lib/occurredAtConfidence.guard.test.ts` slices the editor's one `updateEvent` call with a regex anchored at six spaces. Moving the call into the retry loop put it at twelve and the guard found nothing. The anchor now reads six or more; the code reviewer confirmed the span and its three assertions are unchanged.
- **An existing test changed meaning.** CUL-2199's "untouched save does not write the opening point back" used to assert a refusal and an alert. Under ruling 2 that save now goes through quietly with the row's own point. The test asserts the new behaviour and the guard it carries.
- **The adversarial pass found no break in the logic and five holes in the tests.** Deleting any one column from the guard's WHERE, or either `restated` gate, left every suite green: the one race test moved the point, the confidence and the bounds together, so each clause was covered only by the others. Fixed with one race per column (five rows, each moving exactly one field), a look test for the day key and two editor tests for the Signal refresh. Each was then proven by mutation: bounds, point, confidence, the look gate, the Signal gate and the refusal reset each red exactly one or two tests.
- **The reviewer's one behaviour fix.** After a refusal the screen redrew its control from the row but still counted the owner's refused point as moved, so the next save would restate a time no longer on screen. A refusal now puts the screen on the row: point, provenance and the moved flag.

## Filed

- [CUL-2806](https://linear.app/projectnyx/issue/CUL-2806): a phone that has not pulled overwrites another phone's time, whole row. QUIET, live, `Waiting on PM`: it is last-write-wins behaving as written, so it needs a ruling, not a fix. No stopgap exists; the phone cannot know it is behind.
- Five parked findings in one comment on the issue, none QUIET.

## Residual

The guard makes the local check atomic. It does nothing for a phone that is honestly behind, which is CUL-2806.
