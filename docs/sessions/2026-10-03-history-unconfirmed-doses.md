# History names unconfirmed doses (CUL-1209, the History half)

**Date:** 2026-10-03

Dispatched as PR-37 of *Out of beta — Noticed, Design v2, History v2, the trial screen*. Outcome: **History half shipped via #1030; report half split out.** On the PM's word the issue was split into CUL-1549 (History, this PR) and CUL-1550 (the report, blocked by CUL-1002); the parent stays open until both close.

## What shipped (via #1030, CUL-1549)

PM ruling 1(a): every History surface that names the doses not given in full now also names the doses recorded with no chip as *N unconfirmed*, the vet report's and the med strip's word. Count line, day header, a course's type-sheet sub-row, and the week strip (which breaks its line on them and speaks *a dose unconfirmed*, per the HV-12 comment on the issue).

- `DoseFacts` gains `unconfirmed` (`adherence === null`, the report's own definition). One walk, `doseSubsetOf` in `lib/historyDays.ts`, feeds all four surfaces.
- A test pins `logged − notInFull − unconfirmed = tally.given` for every derived course: the ruling's point, stated as an invariant.
- History spec v1.11 records the ruling (§3.2, §3.4, §3.5, §3.8, AC 30).
- Checks: typecheck clean, full jest green (13,664). Mutation: dropping the increment reds 11 tests.

## Why the report half is split out

Ruling 2(a), renaming the report's *Doses logged* column and *Logged on N of M days*, lives in `supabase/functions/generate-report/render.ts`. The dispatch prompt put that file off limits while CUL-1002 works in it, and said to stop and say so if it was needed. It is needed, so the report half, its report-spec edit and its `vet-report-cold-read` are not done. The session stopped and offered two options; the PM chose to split the issue and merge the History half now (2026-10-03).

## Next

CUL-1550, once CUL-1002 is out of `render.ts`: rename the two report strings, edit the report spec, run `vet-report-cold-read` on a rendered report. Merging it closes the parent's last half.
