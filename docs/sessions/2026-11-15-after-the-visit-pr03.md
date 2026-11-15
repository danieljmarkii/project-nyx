# After the visit PR-03: saved as you type, and the honest recheck

**Date:** 2026-11-15
**One thing:** T1 L1 — Local-first: a save lands on the phone first, after the typing pauses · check: pending

Shipped via #1539 ([CUL-2757](https://linear.app/projectnyx/issue/CUL-2757), which also finishes [CUL-1150](https://linear.app/projectnyx/issue/CUL-1150)). A dispatched BUILD row, plan-gated; the PM typed the go in the session.

## What shipped

- **How did it go? saves as you type** (§4.4 R5, AC 16). Once the visit exists, every field is written 600 ms after typing stops. It is also written on back, blur, *Done*, and the app going to the background. All of these go through the one write path that diffs the form against the record, so a *Done* with no change writes nothing. The button reads *Done* on both screens.
- **The recheck is a date** (R2, AC 17, CUL-1150). The new `RecheckRow` offers *2 weeks · 6 weeks · Pick a date*. Only *Set* writes, and it writes `next_visit_at`, never an appointment. The row reads "Recheck around {date} · Not booked yet" with *Book it*, which opens the visits list's booking sheet on that date.
- **One predicate for "booked"** (`recheckBookingFor`) drives the row, the list's tag and the Pet-tab line. Home's strip reads appointments only, so an unbooked recheck draws nothing. That followed AC 17 over R2's prose, a team call logged on the issue.

## What broke, and how

The adversarial reviewer ran its two allowed passes. Each failed on one QUIET break, and both are fixed in the PR with tests:

1. **The booking stood in for the recheck.** With no recheck set, any later booking for the pet hid the chips, so the vet's recheck could never be recorded. Now a booking only answers a recheck the visit names.
2. **The booking was checked against the old date.** If *Set* came within 600 ms of moving the visit date, the booking read used the old visit date, because the date had not been saved yet. Now *Set* saves the form first. A related LOUD issue: a save that landed after *Set* reset the recheck in memory. It now merges onto the record as it stands when the write lands.

Residuals, all LOUD: rechecks the old wheel already booked ([CUL-2788](https://linear.app/projectnyx/issue/CUL-2788)), plus a parked list on CUL-2757. The device check on iOS is the PM's, in the TestFlight cut's sitting.

## Teach

**Local-first: a save lands on the phone first, after the typing pauses** (T1, L1)

Nyx writes to a small database on the phone itself, and only later sends the row to the cloud. That is why typing can be saved with no signal in a car park. Saving on every keystroke would be forty writes per sentence. The screen waits until you pause, like a friend who lets you finish the sentence before writing it down.

The line from today's diff that does the waiting, in `app/vet-visits/after.tsx`:

```ts
autosaveTimer.current = setTimeout(() => { flushFields() }, FIELDS_DEBOUNCE_MS);
```

Each keystroke cancels the previous timer and starts a fresh 600 ms one. Only when 600 ms pass with no new keystroke does `flushFields` write to the phone's database. A second piece listens for the app going to the background, which happens before the app switcher can kill it, and writes at once rather than waiting out the timer.

**Check:** you type a sentence and the phone crashes 0.3 seconds after your last keystroke, with no switch away first. Is the last word kept?
