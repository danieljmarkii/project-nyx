# Vet visit reminders PR-04: mock round 2, the settings row, Remind me, copy and the tap

**Date:** 2026-11-13
**One thing:** D3 L1 — A test proves only what its example can tell apart: the first cross-booking tests passed with the fix deleted · check: pending

[CUL-2728](https://linear.app/projectnyx/issue/CUL-2728), PR-04 of *Vet visit reminders*. Shipped via #1528 (draft). BUILD, opened with a build ready mock round as the issue asked.

## What shipped

**Mock round 2** (`docs/culprit-vet-reminder-mockups.html`, republished to the round 1 URL, build ready): final lock screen copy, the Notification Center row in its four states, Remind me on the booking sheet in each state, the primer, the tap and the state set. It carried two PM decisions; the PM took both recommendations the same day, and the round was republished as ruled.

- **D1 (a):** the day-of reminder names no date from the record. *Make a report to take along.* R4 lists day, time and name; the last visit's date is a record fact. The planner stopped reading `vet_visits`, so `readReminderInputs` reads bookings only and the two visit writers stopped firing the re-plan signal.
- **D2 (a):** the sheet names the reminders a booking will get, in the picked line and the on line.

**The build:**
- `lib/vetReminders.ts`: final copy (the ahead body opens on the date, since the title has the weekday, and drops "weigh in"); `petId` on every planned reminder; `upcomingReminderInstants` for the sheet.
- `lib/vetReminderNotifications.ts`: `setVetRemindersOn`, the `VET_VISIT_PRIMER` descriptor, `petId` in the tap payload and the signature.
- `lib/notificationRouting.ts`: a collapsed tap opens `/vet-visits?pet=<first pet>`, the id validated by shape.
- `lib/notificationSettings.ts`: `PreferenceCategory` names `vet_visit` beside the daily registry without widening it.
- `hooks/useVetReminders.ts`: `setVetReminders`, `readVetReminderStatus`, `useRemindMeAfterSave`.
- `components/settings/VetReminderNotificationRow.tsx` (new), mounted in `app/settings/notifications.tsx`, whose lock screen line now covers both rows.
- `components/vetvisits/RemindMeRow.tsx` (new), on `BookVisitSheet`'s booked arm; the sheet's "No reminder yet" footnote left.
- `app/vet-visits/index.tsx`: reads the status and the live bookings for the sheet, applies Remind me after Save, hosts the primer.
- `components/notifications/NotificationPrimer.tsx`: takes a descriptor; an `other` node kind.
- Spec v1.3: §0 R7, R8; §4, §5 final.

## Decisions along the way

- **Remind me is carried, not acted on (T3).** The booking sheet is a modal and a modal never presents another (C-14), so the sheet carries the choice on submit and the screen applies it once the sheet has closed. Where an Alert follows a save (Also for), Remind me runs from its OK.
- **Picked is indigo, on is teal (T7).** The selected role for a choice, the positive role for a fact.
- **A reminder more than a week out is named by date** in the sheet, so "Monday" never reads as today's weekday.

## What the review caught

`code-reviewer` returned fix-before-merge. Fixed:

1. **The sheet line could promise what the schedule would not do.** The first helper judged each booking alone; the planner collapses a day's reminders across pets and skips the whole day once its earliest has fired. With another pet booked earlier that day, the sheet named a time the notification would not fire at, or one that would never come. The helper now runs the planner itself over every live booking plus the new one.
2. The settings primer raised an Alert while still visible (swallowed on iOS); it now closes first and speaks through the snackbar, with the write-failure words when the grant succeeded and the save did not.
3. Remind me's hook could arm its primer after the screen unmounted; a mounted ref stops it.
4. The sheet's denied row went stale after a trip to Settings; the status re-reads on return.
5. Stale comments about the report window; the denied switch's label now says why.

**The mutation that taught the lesson.** The first two cross-booking tests passed with the fix deleted: in each example the new booking's own time happened to equal the group's. Rewritten so another pet's earlier visit changes the answer, both now fail with the fix removed and pass with it. The unmount guard was proven the same way.

## Residuals

- A warm tap on a collapsed reminder while `/vet-visits` is already open for another pet: `router.push` should mount a fresh screen on the new pet. Verify on device in PR-05.
- No `adversarial-reviewer`: no clinical or statistical logic changed; the copy carries nothing from the record and a test pins it.
