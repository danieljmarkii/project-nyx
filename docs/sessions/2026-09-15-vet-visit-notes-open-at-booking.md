# Notes open when the visit is booked — and the gate that came off was guarding the other door

**Date:** 2026-09-15

Shipped via #849. CUL-966 + CUL-949, one PR, the Vet visits project (two of the four finish-pass blockers in front of VV-GA). The session started as PM device feedback on the shipped companion, not from an issue: four observations, verified at file:line, which resolved into two already-filed issues, two new ones, and one build.

## What the PM found, and what was actually there

Four observations. The first was named primary: *"there's not really a great place to take notes during the vet visit."*

The screen exists and is complete. `app/vet-visits/at-the-vet.tsx` (VV-4) autosaves `notes_draft` per keystroke, ticks the prepared questions, and photographs paperwork straight into Vet Files under the visit. Nothing about it is wrong. Its entry points, grepped: **exactly one** — `app/vet-visits/index.tsx:304`, on the visits list's Next block, gated on `home.next.isToday`. Home's five-day strip offers *Get ready* and *Add a question*; neither reaches it. Get ready offers nothing, despite spec §4.1 C1 stating the screen is *"opened from Get ready on the day"* — a sentence that was never built.

So the feature's day-of job was four taps deep behind a door the two surfaces an owner actually uses could not open, and the questions typed in Get ready became ticks on a screen Get ready could not reach.

This had already been found. It was **CUL-953 item 3**, one of five one-line gaps filed at Medium by the VV-6 `pm-feature-review`. Filing it there was the error the board could not see: the finding was correct and the *size* was wrong, so the single most important thing about the feature sat in a grouping labelled "one-line finish-pass gaps". Lifted to CUL-966 at Urgent; CUL-953 keeps its other four.

The remaining three:

- **"The rundown and Worth raising are two similar features."** True, and structural. `lib/getReady.ts:20–38` states the rule the module exists to keep — *deterministic, one source per row, quoted never re-derived* — and two of its four row types (the unterminated course, the weight gap) quote the rundown tiles rendered directly below them. The rule that stops the two blocks from ever disagreeing (the CUL-746 class) is the same rule that makes them repeat. Filed CUL-967 with four options and, deliberately, **no recommendation**: it is a layout call that should be drawn before it is argued, and round 2 of the mock hid the duplication because its fixture record was quiet. **PM paused it the same day** — *"I'll continue using it a bit"* — which is the right input for a decision this size. Backlog/Low.
- **The rundown's fixed 30-day window.** `lib/rundown.ts:118`, `RUNDOWN_WINDOW_DAYS = 30`, one constant, no parameter. Not a label: the window is spoken into every claim the page makes (*"7 in 30 days"*, *"meals logged on 27 of 30 days"*, the artifact stamp), correctly, per C-3. Filed CUL-968. **PM ruled the control dead** — *"really that's the vet report's job"* — so options (b) and (c) are gone. The *default* question (option (a): count since the last visit, which tile 6 already computes) was not covered by the ruling and is recorded as a residual at Low, with the alternative reading named so the PM can close it outright.
- **"Once a visit is scheduled it can never be edited."** Confirmed, already filed as **CUL-952**, four days old. Raised High → Urgent on the PM's independent confirmation. One precision recorded on the issue: a *visit* (past, logged) can be edited via `app/vet-visits/edit.tsx`; an *appointment* cannot — `lib/vetVisits.ts` ships book, cancel, save-questions, save-draft, set-asked, and no update path for `scheduled_at` / clinic / vet / reason. Answering the PM's "why?" honestly: **it was never specified.** §4.1 E3 covers booking, §10 parks reminders and the calendar write; reschedule is in neither. An omission, not a deferral.

## The ruling, and the thing it nearly took with it

The PM's ruling on the notes was broader than any option presented: not *which door is the day-of primary* but **remove the gate entirely** — *"Notes needs to open WHEN THE VISIT IS SCHEDULED. Let's not get fancy and try to gate when it opens."*

Correct, and the data model had always agreed: `notes_draft` lives on the **appointment**, not the visit, so typing at booking distance was never the constraint. Only the UI said otherwise.

**But the gate was guarding the other door.** The comment at `app/vet-visits/index.tsx:290` justified withholding `AppointmentActions` on the appointment's own day, and its reason names a real hazard — *"on a recheck booked six weeks out they are a mis-tap that consumes the booking (the save marks it attended, and there is no way back before VV-6's delete)."* Read closely, that describes **only** *How did it go?*, which writes a `vet_visits` row, retires the appointment and moves the vet report's window, with no delete path until CUL-19 deploys. *At the vet* writes a draft on a row that already exists and is harmless at any distance.

So the gate **splits** rather than goes: notes ungated, finish door day-bounded. Obeying "no gate" literally would have handed a six-weeks-out booking a one-tap control that silently moves the owner's report window — the destructive half smuggled in under a ruling about the harmless half.

The generalisable shape: **a gate over two controls records the hazard of the one that has it.** Before removing a shared gate, ask which sibling the comment is actually about. Both halves are now pinned by mutation: dropping the `isToday` condition on `onHowDidItGo` reds exactly one test while the notes test stays green, which is the asymmetry in one line.

## The same hazard arrived by a second path

Found while building, listed in no issue. *Done* in the notes screen's header routes to `/vet-visits/after` — the same booking-consuming save. Opening the notes six weeks early would have put it one tap from an owner who came to jot a sentence.

Same answer, on a **wider predicate than `isToday`**: the list's *Waiting on you* bucket is exactly the owner with a visit left to finish, so `appointmentDayReached(scheduledAt, now)` is new in `lib/vetVisits.ts` — today or already passed. The control is **absent, never `disabled`** (C-7: before the visit no finish control exists, so a disabled one would claim one does). Both sides go through `localDateKey`, so the comparison is two day keys built by one function rather than two spellings of an instant (C-40, with a test that asserts the two spellings differ as text and still answer identically, or it would be measuring nothing).

Worth naming: **no existing test touched the Done control at all**, which is why the hazard could arrive unnoticed on a screen whose every other behaviour is covered. The four new tests anchor to `Date.now()` rather than an absolute date — the gate is judged against the real clock, so a literal fixture would fail by calendar drift rather than by a change to the code (C-29, time axis). Re-run green under the CI matrix at UTC+14, +12:45 and −10.

## Three doors, one label

- **The list** (ungated; and on *Waiting on you* too — the first draft withheld it there on the reasoning that the owner has "left the room", but an owner reading that row has not logged the visit yet, and what they remember of it is exactly what the field is for).
- **Get ready**, secondary under *Send the vet report*. The report stays the single primary (R-share, nine lenses); this is the door §4.1 C1 always specified.
- **The Pet tab card**, and it is the only surface that can carry it. Home's strip spans five days (`APPOINTMENT_WINDOW_DAYS`) and Get ready is reached *through* that strip, so at booking distance neither exists. Without this door the notes stay four taps behind *Open visits*, which is the state the PM hit. It reuses `AppointmentActions` rather than a local button — label, target size and a11y wording match the list exactly — and takes only `onAtTheVet`, because a card whose job is "what is next" has no business offering the gated door.

`onHowDidItGo` became optional to make that possible, which is the API change that encodes the lesson: neither door implies the other.

## The copy was dated, and that used to be fine

*At the vet*, *What the vet said*, *Saved as you type · finish the visit when you're out* — every string on the screen was true on the day and wrong six weeks before it. This is the honest cost of the ruling, paid in the same PR rather than deferred.

The copy re-anchors to the **visit**, which exists the whole time, rather than the room, which is one afternoon of it: *Notes for {pet}'s visit* (the pet named once, in the title, the `GetReadyTitle` shape — CUL-660), section *Notes*, placeholder *Start now, add to it at the vet.* — which carries the guidance the old section label used to and names both moments the field serves — and *Saved as you type · kept with this visit*, which says what happens to the words instead of when the owner is done with them. `nyx-voice` pass run on all of it.

## CUL-949 rode along, and had to

Home's *Yes — how did it go?* pushed a bare `/vet-visit`, which flag-on redirects to `/vet-visits/after` **with no param** — so the likeliest path through the entire feature arrived blank: the notes dropped (`after.tsx:192` seeds from `appt?.notes_draft`), clinic and reason unfilled, and `logVisitFromAppointment` never run, leaving the booking in *Waiting on you* **after** the visit was logged, with Home's single ask already spent.

It is a one-line fix and it belonged here rather than in its own PR: CUL-966 is why the owner never reaches the notes, CUL-949 is why they are lost if they do. Shipping the doors alone would have sent more owners down the path that eats what they typed.

## Recorded, not built

- **Two free-text inputs are now live at once** on an appointment: `questions` (typed in Get ready, ticked in the room) and `notes_draft`. That is CUL-967's shape on the *input* side, arriving in the same session the PM paused CUL-967 on the output side. The team's position is that the distinction is real and worth keeping — a question is a thing to ASK and becomes a tick, a note is a thing to REMEMBER and never does — so v1 keeps both and does not restructure. Flagged for the next device pass rather than designed around now.
- **No in-room surface exists for a visit with no appointment row** (booked by phone, never entered in the app). That owner logs it afterwards from the after-visit notes field. Probably correct for v1; on the issue rather than decided.
- **Tier 2 doc edit, awaiting PM confirmation:** `docs/nyx-vet-visits-requirements.md` §4.1 C1 still reads *"Opened from Get ready on the day (Get ready stays the day's primary door…)"*. The ruling contradicts it directly and the spec will send the next session backwards until it is amended. Not written.

## State at close

| Issue | Was | Now |
|---|---|---|
| CUL-966 (new) | — | In Review, #849 |
| CUL-949 | Todo, Urgent | In Review, #849 |
| CUL-953 | Medium, 5 items | Medium, 4 items (item 3 lifted) |
| CUL-952 | Todo, High | Todo, **Urgent** — next session |
| CUL-967 (new) | — | Backlog/Low, paused by PM |
| CUL-968 (new) | — | Backlog/Low, control ruled out |

VV-GA (CUL-905) now stands behind **CUL-951** and **CUL-952**.

Types clean, 381 suites / 8258 tests green, flag-off guard green, timezone matrix green.
