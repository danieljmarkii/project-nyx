# Run open PR-03: the timing line speaks the printed times' minutes, and "under a minute" for none (CUL-1720)

**Date:** 2026-10-10
**One thing:** none — dispatched session, not this round's teach row

Shipped via #1169. A `/dispatch` child (Run open, PR-03), mode BUILD, built from the build note.

## What was wrong

A vomit row's "N min after eating" (`timingLine`, `lib/spineNode.ts`) rounded the true gap, while the time column prints each instant with its seconds dropped (`formatTime`). A 2:52:50 PM meal and a 2:53:10 PM vomit read "0 min after eating" under times one minute apart; 2:52:10 and 2:53:50 read "2 min" under the same two times.

## The words, and why (nyx-voice and Dr. Chen)

Both options, combined: the minutes come from the same minute-cut instants the rows print (`clockMinuteGap`), and a gap of zero, both rows printing the same minute, reads **"under a minute after eating"**.

- **Dr. Chen:** a vet reading the row subtracts the two times, so the number must agree with them. 20 seconds spoken as "1 min" and 100 seconds spoken as "1 min" are both inside the rapid band, so nothing clinical moves; "0 min" reads as a logging error and costs trust in the rest of the row. The band (rapid / mid / long) stays the lane's, off the true gap: only the spoken number follows the clock.
- **nyx-voice:** plain words, no number a reader can catch out. "under a minute" says what a zero means without the "0 min" artifact.
- Hours follow the clock too ("2 h 20 min" for 12:00:50 → 2:20:10); the remainder-under-five rule is unchanged.

## Where else the phrase lives (checked, none changed)

- The vet report (`generate-report`): prints no per-vomit "N min after eating". Its `timingLine` is a different function (the correlation summary line).
- The engine (`generate-signal`): its timing words are bands ("6 or more hours after eating", "soon after eating"); the median minutes ride in the payload.
- `lib/signalCopy.ts:1178`: "typically about N minutes", a rounded MEDIAN over many episodes with no clock times beside it. A different claim, so not this fix; a median under 30 seconds would print "about 0 minutes", noted on CUL-1720.
- `lib/spineNode.ts` is not in the Edge Functions' `lib/` closure: no redeploy.

## Tests

`lib/spineNode.test.ts`: the convening's 2:52 PM meal and 2:53 PM vomit (20 s apart → "1 min"), the reverse (2:52:10 / 2:53:50 → "1 min", never 2), a same-minute pair ("under a minute"), an hour figure, and `clockMinuteGap`'s boundaries. Each case asserts the line equals the gap a reader gets from the printed hours and minutes. Mutation: restoring the rounded true gap reds four. Green under TZ Kiritimati (+14), Kathmandu (+5:45), Honolulu (−10).

## Residuals

None blocking. The `signalCopy` median wording above is a separate surface, noted rather than filed (one rare edge, no times beside it).
