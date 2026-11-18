# Loose ends PR-39: a failed photo read's finding reaches the record, and its last write never lowers a call

**Date:** 2026-11-18
**One thing:** T2 L1 — A check inside the write has no gap: ask the database the question in the same statement that saves · check: pending
**One thing (re-ask):** T2 L1 — Last write wins, held (PR-36's check) · asked again in this session's return, ungraded: no answer yet

Shipped via #1560 ([CUL-2808](https://linear.app/projectnyx/issue/CUL-2808)). A dispatched shaping row: the session posted a decision brief, the PM typed `go` on all three recommendations, and the build followed in the same session.

## What the shaping pass found

The issue described one race. Reproduced in the pipeline's fake client before any fix, there were four ways a failed read's blood finding failed to reach the record:

- **Three missed writes of a blood read.** The call and `visual_flags: ['blood']` landed, the blood column kept the older read's "no". Home, Ask and the vet report read the column.
- **The third foreign write is a sibling's call for another reason.** The catch wrote the error note only. The blood reached neither the flags nor the column.
- **No race at all.** Any single failed write after an escalating photo read took the same rescue, which carries no structured column.
- **The rescue's own last try.** After three version-held misses it was an unconditional write, and a sibling's call now landing in that one round trip came back as this run's call today.

The question the issue asked was what an owner's later edit is diffed against if a failed read writes a blood column. The answer: the stored payload, untouched. Every reader of that diff was traced. The only one that can quiet anything quiets a flag when the owner's changed column reads none, and a presence-only write never produces a none.

## What was ruled

The PM ruled all three as recommended (typed `go`, 2026-11-18):

1. A failed read may write the red-flag columns it saw, presence only.
2. Never onto a row the owner has edited. That stays [CUL-1110](https://linear.app/projectnyx/issue/CUL-1110)'s ruling to make.
3. The rescue's last try is filtered on content: it lands only over a row that holds no call.

## What shipped

- **The presence write.** When a photo read stood and the run then failed, the catch writes the red-flag columns that read found present, and the columns that describe them, on a row the owner has not edited. The database checks "not edited" inside the write. It carries no absence and never the raw payload. It needs no version and no retry, because "this photo showed blood" is true over any version of an unedited row. It clears the owner's hide, since it puts a finding on the record they have not seen, and takes back a leave to wait.
- **The content-held last try.** After three version-held misses the rescue asks the database one thing in the write itself: does this row hold no call. A row that only keeps moving still gets the rescue. A row that holds a call keeps it and gets the error note.

## What broke, and how

**Adversarial pass 1 broke the first build.** The presence write carried the red-flag column alone. A stored row from an older read can hold a foreign-material note written under "unsure" (a hairball guess, say). A failed read that saw string set the column to yes, and the old note became the words shown beside the new finding on the card, the report and Ask: the wrong object, in softer words, on a call's surfaces. The fix: each descriptor names the columns that describe a red flag (the note for the object, the kind for stool blood), and they travel with the finding at this run's value, cleared when this run has none. The test descriptor had no such column, which is why the suite could not see it; it has one now, and both real descriptors have their own test.

The same pass confirmed the rest by counterexample: untrusted reads (a collapsed partial read, an unreadable photo, floor-only, capped, consent declined) never reach the presence write; an owner's edit committing under the write is refused by the database; a sibling's call now, a flag-off call, an unknown verdict, a verdict a client lowered under a frozen tier, and a stored refusal of leave to wait all survive the last try.

Pass 2's result is in the PR body's Definition of Done, at the commit it read.

Nine mutants were run against the new code. Each one turned at least one test red.

## Residuals

- **An "edited" mark on a field nobody edited.** The record marks a field as edited when it differs from the stored payload, with no check that the owner edited anything. A presence write makes the blood field differ. Cosmetic and loud. Per-field provenance is CUL-1110.
- **A replaced photo.** A failed read of photo 1 can land its blood on the row after a finished read of photo 2. Loud, and consistent with the standing rule that presence carries across photos.
- **The bound.** The catch tries six times in all. Exhausting it needs a call to land and be lowered again inside one round trip, twice.
- **A louder failed call over a quieter stored one** is not this PR's: filed as [CUL-2811](https://linear.app/projectnyx/issue/CUL-2811).

## Teach

**A check inside the write has no gap: ask the database the question in the same statement that saves** (T2, L1)

PR-36 taught the held write: save only if the record is still the version you read. That still has two steps, a read and then a save, and something can change between them. This session's fix removes the first step for the cases that allow it. The save itself carries the condition ("only if nobody has edited this", "only if this row holds no call"), so the database answers at the instant it saves and there is no moment in between for another writer to slip into.

**Like:** a shop's "last one in stock" button. Checking the shelf and then walking to the till leaves time for someone else to take it. Handing the till a slip that says "sell me this only if it is still there" does not.

**In today's work:** `supabase/functions/_shared/incident-analysis.ts` (`writePresentRedFlags`)

```ts
.is('edited_at', null)
```

Write the blood finding only onto a row whose "owner edited this" stamp is empty. The database checks that as part of the save, so an owner's correction that lands a millisecond earlier is never written over.

**Why it matters to you as PM:** when a spec says "never overwrite the owner's edit", the question to ask is who checks, and when. A check made before the save can be out of date by the time the save runs. A check made by the save cannot.

**Check:** the presence write does not use the version hold from PR-36 at all. Why is that safe for "this photo showed blood", and why would it not be safe for "this photo showed no blood"?
