# Vet visit reminders PR-03: the planner and dated scheduling

**Date:** 2026-11-13
**One thing:** D3 L1 — A test proves a rule only if breaking the rule makes the test fail · check: pending

Shipped via #1527, for [CUL-2727](https://linear.app/projectnyx/issue/CUL-2727) (PR-03 of the *Vet visit reminders* project, parent CUL-253). BUILD mode. I posted a plan and the PM said go. "Go" took the recommended option a on the one brief: spec §6's local-mirror line was corrected, and the spec is now v1.2.

## What shipped

- **`lib/vetReminders.ts`, the pure planner.**
  - *Ahead* fires at 18:00 three local days before the visit.
  - *Day of* fires at the earlier of 08:00 and two hours before; before 06:00 it moves to 19:00 the evening before; a booking with no time takes 08:00.
  - R2 skips a reminder whose time has passed, judged per collapsed group.
  - One notification per kind per local fire day, naming every pet.
  - The strings are provisional (spec §4's drafts); PR-04 owns the words.
- **`lib/vetReminderNotifications.ts`, the scheduler, modelled on the follow-up module.**
  - Its own `nyx.vetreminder.` prefix and `vet_visit` channel.
  - A content signature, so a changed reminder is replaced in place.
  - One reconcile at a time, with one trailing re-run.
  - The switch is read from `notification_preferences` (`'vet_visit'`, the module's own literal).
  - A sign-out fence in `wipeLocalSession`, and a `petsLoaded` guard.
- **`hooks/useVetReminders.ts`**, mounted in `app/_layout.tsx`. It re-plans on foreground, on the hydration tick, when the pet list loads, and on every local appointment or visit write (`onAppointmentsChanged` in `lib/vetVisits.ts`).
- **`lib/vetVisits.ts`** gained `readReminderInputs`, which reads live appointments and visit days. It is the only reader allowed to touch the link column (`guards/visitReaders`).
- **Tap routing** (`lib/notificationRouting.ts`, `hooks/useNotificationScheduling.ts`). One visit opens Get ready with a validated id; a collapsed reminder opens `/vet-visits`.

The scheduler does nothing visible until PR-04 adds the switch. With the category off it only ever cancels.

## What broke, and how it was found

The first draft had the planner filter `vet_visit_id` itself. `guards/visitReaders` went red: the planner was a new reader of the link column. Rather than add an exemption, I moved the live filter to the read, which `lib/vetVisits.ts` already does through `LIVE_APPOINTMENT_SQL`. The planner now sees only an id, a pet and a time.

`code-reviewer` returned fix-before-merge with three bugs. All are fixed, pinned by tests and proven by mutation.

1. **The day-of reminder fired twice for two visits on one day.**
   - The past-time skip ran before grouping. Two pets with visits at 08:15 and 10:30 collapsed into one reminder at 06:15.
   - At a re-plan at 06:20, the 06:15 member was gone, so the 08:00 member formed its own group under the same identifier. The OS no longer held that identifier, so a second notification was scheduled.
   - The fix judges R2 on the group's earliest instant.
   - The stated cost: a visit booked onto a day whose notification already fired gets none of that kind that day.
2. **Overlapping reconciles could bring back a cancelled booking's reminder.** A run holding a stale read could schedule after a newer run had cancelled. The fix is a single-flight with a trailing re-run that reads its input at run time.
3. **An account with every pet archived kept its reminders.** The empty-pet-map guard could not tell "not loaded" from "none". The fix is `petStore.petsLoaded`.

Also from the review: a changed reminder is no longer cancelled before it is rescheduled (the OS replaces on the same identifier), so a failed schedule cannot lose it.

## Falsification and tests

- **Planner.**
  - Every worked example in §3.2, and both R2 cases plus the boundary instant.
  - Collapse by fire day, including an evening-before slot sharing a day with a same-day slot.
  - A year-long sweep asserting in local terms. It passed under UTC, UTC+14, UTC+12:45, UTC−10, Santiago (local midnight skipped by DST), New York and Beirut.
- **Mutation.** Removing each R2 skip, the 06:00 move, the no-time sentinel, the collapse, the per-group R2, the single-flight and the loaded guard each turns a test red.
- **Full suite.** 841 suites and 20,537 tests green, tsc clean.
- **Adversarial pass.** Not required (spec §8): there is no clinical logic.

## Residuals carried to PR-04 (CUL-2728)

- The day-of body names the report window's start date: a date from the record on the lock screen. The spec drafts it, but R4's list does not name it.
- `formatClockTime` prints "10:30 am", where the spec drafts say "10:30".
- A collapsed two-pet tap opens a list that shows the active pet only.
- One `scheduleNotificationAsync` already in flight at sign-out can land after the cancel-all, the same millisecond window the follow-up module has.
