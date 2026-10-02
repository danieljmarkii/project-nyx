# The Patterns month: never "no vomiting" over a vomit, and a record that starts at the first logged event

**Date:** 2026-09-27

One of four parallel lanes on **Design v2 — the whole day** (the Patterns month lane). Shipped via #959. Advances CUL-1226 and CUL-1194.

## What shipped

- **CUL-1226, a false negative on a safety fact.** The month counts vomiting *episodes*: re-logs inside the engine's 3h gap collapse into one, dated by its first row. A bout from 23:10 to 00:40 left the second day at a count of 0, and its VoiceOver label said "logged, no vomiting" over a vomit row.
  - `lib/monthReads.ts` adds `continuationDaysOf`: the days holding a vomit row but no episode start, each paired with the day its bout began. It is derived from `collapseEpisodes`, so the gap is never restated.
  - `lib/monthModel.ts` adds `MonthDay.continuesFrom`, and `dayMarkA11yLabel` speaks it as "vomiting logged, part of the bout that began Sep 12" (the PM approved the bout wording this session).
  - The rose, the corners, the bars and the line stay episode-based, so the GC-4 unit ruling (CUL-1225) is untouched.
  - `DayMark` gains one optional, label-only prop, and `MonthInstrument` passes it through.
- **Found by the adversarial pass, same class, folded in.** `monthReadRange` stopped at the month's last day, while the last grid row draws the next month's first days. A past September therefore spoke Oct 1 (the tail of a Sep 30 bout) as "nothing logged". The read now runs to the grid's last Saturday.
- **CUL-1194.** The record start now excludes looks and uses `MIN(julianday(occurred_at))` with History's ms rounding. The old query sorted `occurred_at` as text and included looks, so a look could start the record.
  - It mirrors `readRecordStartDay` rather than importing it, because `historyQueries` imports `monthReads`.
  - A parity test drives both over one table (GAP-24).

## Falsification

`adversarial-reviewer` ran in all four CI zones. Every case held:
- 23:10 → 00:40 across midnight.
- A 30h chain from Aug 31 through Sep 1 and Sep 2.
- A day holding a bout's tail plus a new bout.
- Gaps of exactly 3h and of 3h plus 1s.
- A look-only first day, a look-only pet, and a soft-deleted earliest row.
- A midnight row in `…Z` and in `…+00:00`.

It broke one thing that predated the diff: the trailing next-month days described above, which are now fixed.

Two blind spots are stated in code rather than fixed:
- A bout running longer than the read's one day of slack is truncated. That only affects undrawn days.
- The record start is parsed by SQLite's `julianday` and a row's day by `Date.parse`. The two disagree only on a zoneless spelling no writer produces.

Every new test was proven by mutation, including the ms rounding, which goes red in Kiritimati and Honolulu without it.

## Residuals

- `msOfJulianDay` and `UNIX_EPOCH_JULIAN_DAY` now exist in both `lib/monthReads.ts` and `lib/historyQueries.ts`. The parity test holds them equal. A code-review follow-up could move both to `lib/utils.ts`.
- `continuationDaysOf` runs the episode collapse a second time over the same rows that `episodeDaysOf` already collapses (cleanup only).
- One full-suite run in Honolulu failed `HistoryList.test.tsx` while other jest runs were going in the same tree. A clean serial rerun was 555/555 green.
