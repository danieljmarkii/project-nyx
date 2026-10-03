# History names unconfirmed doses (CUL-1209, the History half)

**Date:** 2026-10-03

Dispatched as PR-37 of *Out of beta — Noticed, Design v2, History v2, the trial screen*. Outcome: **stopped, half built.** Draft PR #1030 carries the History half; the report half is not started.

## What shipped (on the branch, shipped via #1030 once the report half lands)

PM ruling 1(a): every History surface that names the doses not given in full now also names the doses recorded with no chip as *N unconfirmed*, the vet report's and the med strip's word. Count line, day header, a course's type-sheet sub-row, and the week strip (which breaks its line on them and speaks *a dose unconfirmed*, per the HV-12 comment on the issue).

- `DoseFacts` gains `unconfirmed` (`adherence === null`, the report's own definition). One walk, `doseSubsetOf` in `lib/historyDays.ts`, feeds all four surfaces.
- A test pins `logged − notInFull − unconfirmed = tally.given` for every derived course: the ruling's point, stated as an invariant.
- History spec v1.11 records the ruling (§3.2, §3.4, §3.5, §3.8, AC 30).
- Checks: typecheck clean, full jest green (13,664). Mutation: dropping the increment reds 11 tests.

## Why it stopped

Ruling 2(a), renaming the report's *Doses logged* column and *Logged on N of M days*, lives in `supabase/functions/generate-report/render.ts`. The dispatch prompt put that file off limits while CUL-1002 works in it, and said to stop and say so if it was needed. It is needed, so the report half, its report-spec edit and its `vet-report-cold-read` are not done, and #1030 is not merged: merging it would close CUL-1209 with half the ruling unbuilt.

## For the PM

Two ways forward: land the report half on this branch once CUL-1002 is out of `render.ts`, or split CUL-1209 into a History sub-issue (point #1030 at it and merge) and a report sub-issue.
