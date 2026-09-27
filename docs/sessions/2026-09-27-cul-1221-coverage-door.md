# CUL-1221 — Home's coverage door counts from the record, and the header dates the day

**Date:** 2026-09-27

Shipped via #957. One of four parallel lanes on *Design v2 — the whole day*. This lane
owned the coverage door and Home's header date.

## What shipped

- **The door's count (BRK-22).** `lib/monthCoverage.ts` gains `coverageWindow`: from the
  later of the month's 1st and the local day of the pet's first **non-look** event,
  through **yesterday**. The record's start comes from a new unbounded read,
  `readRecordStart` (`lib/spineReads.ts`). The door never shows a ratio over a window that
  does not exist: an empty record gets Patterns' own invitation, and a record or a month
  that starts today says so.
- **Today is in neither number.** This was PM ruling (a). Counting today only once it is
  logged would gate the ratio on the thing it counts (C-3).
- **The header date (BRK-26).** `Thu, Sep 17` at the head of the right cluster, behind
  `design_v2` only. It is drawn in `components/designV2/home/HeaderDate.tsx`, built from
  the day key, and subtracted from the name's budget. `HomeHeader` joins the pinned
  consumer list in the flag-off guard.
- **Staying true without a new log.** `hooks/useTodayKey.ts` re-reads the day at local
  midnight and on return to the foreground. The door also re-reads the record when Home
  regains focus.

## Decisions

- **PM, 2026-09-27:** (a) today is out of both numbers; (a) the window is exported for
  Patterns to adopt under CUL-1194. This lane does not edit `monthModel`.
- **Kept the ratio register.** PMD-16 is ruled at GA.
- **PM, 2026-09-27:** the record starts at the first entry (a), not at the pet's creation.

## Falsification (adversarial-reviewer)

Every case below **held**:
- A pet created mid-month.
- Today with a log, and today without one.
- UTC+14 at 00:30 on Oct 1 over a Sep 30 record.
- The Santiago DST day.
- An exact-midnight `+00:00` row.
- A record start before the month, with the month's read still bounded.

Two findings:
- **Staleness after an edit or delete of an older row. Fixed:** the door now re-reads on
  focus, and a test pins it.
- **Patterns now disagrees with the door on a fully logged morning.** The door says
  "26 of 26" and Patterns says "1 day unlogged". The door is right. #959 (CUL-1194) fixed
  the look half; the today half is CUL-1380, which should land before owners see design_v2.

Mutation proofs:
- The look exclusion, the soft-delete filter, the yesterday bound, the record-start max,
  the future-only case, the ungated date (the flag-off guard turns red) and the date
  becoming a control all turn their tests red.
- One test was wrong and got rewritten. I first claimed a text `ORDER BY` could misorder
  the two ISO spellings across seconds. It cannot: they agree through the seconds, and the
  mutant survived. The comment and the test now say what is true: the spellings can only
  tie inside one second, and that cannot move the day.

## Residuals

- **CUL-1380:** Patterns still counts today as unlogged, so on a fully logged morning it
  says "1 day unlogged" beside the door's "26 of 26". #959 (CUL-1194) already moved
  Patterns' record start to the first non-look event; today is the half that remains.
- **Record start, ruled by the PM on 2026-09-27:** the record starts at the pet's first
  entry, not at its creation. That is option (a), the definition both surfaces already use.
