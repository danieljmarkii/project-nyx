# Vet visit reminders: the requirements kickoff

**Date:** 2026-11-13
**Issue:** [CUL-253](https://linear.app/projectnyx/issue/CUL-253) (parent; this PR finishes [CUL-2725](https://linear.app/projectnyx/issue/CUL-2725), PR-01) (DISCOVERY)
**Outcome:** shipped via the session's PR. The project *Vet visit reminders* is ready for `/dispatch`.

## Why this session exists

The PM picked up an August backlog row (appointment reminders) and asked the product team to bring it up to today's standards and shape it into a project. The Nyx round 3 deep dive (#1512) supplied the reason: before her 11-14 visit, the prep failures (no weigh-in in eight weeks, eating unrecorded since August, the vet's call condition met) happened days out, which a reminder the morning of cannot fix.

## What the team found

- The blocker the row named is gone: `vet_appointments` (VV-1) and Get ready are live, and Vet visits went GA on 2026-09-23. `app/rundown.tsx` already names this deep link as its next entry point.
- The notification registry and the prefs CHECK still hold only `daily_summary`, but a dated notification already ships: the vet call follow-up (`lib/followUpNotifications.ts`, CUL-1419). It is the template for this one, except that its switch lives on the phone (D4 departure, CUL-1598); this one uses the server table.
- CUL-253 already carried an acceptance line from CUL-2302 ruling 1a (a T-1d reminder carrying the report line and opening the composer). The new timing has no T-1d, so it was re-ruled.

## Rulings (PM)

R1 timing: three days before at 6pm, and 8am the morning of, or two hours before an earlier visit; a visit before 8am moves it to 7pm the evening before. R2: a booking inside a window skips the missed reminder. R3: off by default, with Remind me on the booking sheet; the general question of which notifications default on became CUL-2730. R4: day, time and the pet's name on the lock screen (the name always, after the round 1 reaction; the daily summary's name toggle is untouched). R5: reminders only. R6: the morning reminder carries the report line and opens Get ready (unseats CUL-2302 1a; noted there).

## What shipped

- `docs/nyx-vet-reminder-requirements.md` v1.0, build ready for rows 02 and 03.
- `docs/culprit-vet-reminder-mockups.html`, round 1 (exploratory): lock screen variants, the timing rule, Notification Center, Remind me in three states. Published as a private artifact.
- Linear: project *Vet visit reminders* (run order, critical path, build notes, rulings); sub-issues CUL-2725 to CUL-2729 with a blocks chain; CUL-253 moved in as the parent; CUL-2730 filed to Backlog; comments on CUL-253, CUL-2302 and CUL-1598.

## Residuals

- The 1.2.0 timing was not ruled; by default the rows ship as they merge, over the air (no native change).
- Round 1 is exploratory. PR-04 opens with the build ready round, and the open question on Remind me's "on" line (name the times or stay generic) is drawn there.
- PR-02 may absorb CUL-1598's `follow_ups` value in the same migration, if the PM wants one apply instead of two.
