# Vet visits: the notes door reads "Your notes" once notes exist

**Date:** 2026-11-07
**One thing:** D2 L2 — Types: adding a required field makes the compiler list every place that must change · check: pending

Shipped via #1479, finishing CUL-2674.

## What happened

The PM, on device, saved notes for an upcoming visit and came back to the Pet tab's Vet visits card: the door still read *Take notes*, which reads like a blank page even though the notes screen opens the saved draft. The behaviour was right; only the label hid it.

The door now reads *Your notes* whenever the booking's `notes_draft` is non-blank, on all three surfaces that carry it: the Pet tab card, the visits list (Next, later bookings, Waiting on you) and Get ready's bottom bar. All three already re-read on focus, so the label flips the moment the owner returns from saving.

- `lib/vetVisits.ts`: `AppointmentView.hasNotes`, derived through one predicate `hasNotesDraft` (also adopted by `appointmentPrepNote`, which had the same test inline). `readVetVisitsHome` now selects `notes_draft`.
- `components/vetvisits/AppointmentActions.tsx`: optional `hasNotes` prop drives the visible and the accessibility label.
- `app/rundown.tsx`: Get ready's secondary button uses the same predicate.

## Decisions

- **"Your notes" over "Add to notes"** (Designer, team call inside `nyx-voice`): the screen opens the whole draft for editing, not an append box, so "Add to" would promise a narrower thing than it does. "Your notes" says the notes exist and are the owner's.
- `hasNotes` is a required field on the view rather than optional, so every hand-built fixture had to state it; `tsc` listed all 19.

## Residuals

None. No schema change, no clinical logic.
