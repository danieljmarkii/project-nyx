# Patterns month: the lens opens on the most days in the whole read (CUL-1565)

**Date:** 2026-10-04
**One thing:** D4 L1 — A test is proven by breaking the code it guards · check: pending

Shipped via #1046. BUILD session on CUL-1565 (Design v2 — the whole day, GA gate; Out of beta run order PR-24c, which PR-53 waits on).

## What shipped

- `lib/monthLens.ts`: each `SymptomLens` now carries two numbers. `days` stays the shown month's arrived days and is still what the symptom `ScopeMenu` prints. `readDays` counts the days across the whole nine-week read and is the sort key only. The default (`lenses[0]`) is therefore read-wide; the tie rule (vomiting first, then the symptom list's order) is unchanged.
- Header comments restated for the new scope in `lib/monthLens.ts`, `lib/monthModel.ts` and `components/designV2/patterns/MonthInstrument.tsx`.
- Tests: four new pure cases in `lib/monthLens.test.ts` (the issue's disagreeing fixture, the 1st of a month, a page back, a read-wide tie) and one component case in `MonthInstrument.test.tsx` (a month with no itching opens on Itching). Existing cases now assert both numbers.

## The decision

PM ruling 2b on CUL-1557 (2026-10-04) narrowed the earlier ruling's scope from "most days in the shown month" to "most days across the whole read". No new decision here. The one build call was C-3's: the ruling changes the ORDER, so the shown count stays month-scoped and the read-wide number is a separate, unspoken key. Printing nine weeks of days beside a month would be a month claim the month does not hold.

## Falsification

- **Mutation:** the sort put back on `days` reds 5 tests (four pure, one component). Restored and green.
- **The issue's fixture:** itching on 6 earlier days, none this month, one vomit this month → opens on Itching, with `days` 0 beside it. Holds.
- **Counterexample tried (Dr. Chen lens):** heavy itching in the earlier weeks and a fresh vomiting run this month now opens on Itching, where the month-scoped rule opened on Vomiting. This is the ruling's accepted tradeoff: the Vomiting chip sits beside it, and safety findings lead on Home's Signal, not on this record view. Recorded on CUL-1565, not escalated.
- **Paging:** each month reads its own nine weeks, so the default follows that read. It holds across a page turn whenever the leading symptom still leads (adjacent reads overlap by about four weeks), and an explicit pick already holds while the month offers it. Not a guarantee across distant months; stated in the PR.

Full suite: 615 suites, 13,901 tests green. `tsc --noEmit` clean.
