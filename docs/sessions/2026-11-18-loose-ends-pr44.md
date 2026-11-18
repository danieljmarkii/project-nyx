# Loose ends PR-44: a photo read that fails after the photo was read keeps what the photo showed

**Date:** 2026-11-18
**One thing:** T5 L1 — A server job runs in steps, and a step that fails takes with it whatever was not handed over yet · check: pending

Shipped via #1564 ([CUL-2812](https://linear.app/projectnyx/issue/CUL-2812)). A dispatched routine row: built from the build note, no plan gate.

## What was wrong

A photo read runs in steps: read the photo, look at the saved record again, re-run the record's rules, decide, write. When a step fails, a last-chance handler writes what the run had worked out so far. That handler only learned what the photo showed deep inside the deciding step. Four steps sit between the photo read and that point, and any of them can fail:

- the fresh look at the saved record (it fails on purpose when the database does not answer);
- the saved record turning out to belong to another pet;
- the record's rules, run a second time after the photo;
- the second look that lets the photo withdraw a record flag.

A photo that showed blood, followed by a failure at any of those, ended as "Couldn't finish reading this one" with nothing about blood.

## What shipped

The photo's own finding is handed to the handler the moment the photo read stands, before any later step runs. Two things are handed over, both presence only:

- the red-flag columns the photo showed present (blood, a foreign object), for the same presence write PR-39 added;
- the call the photo earns on its own (a blood or foreign-object flag, or the model's own call on a photo that shows the subject), with the record's flags beside it.

A photo read that found nothing hands over nothing. A failed run still never writes a calm verdict, an absence, or an owner-edited column.

## What the reviews changed

**Pass 1** found one break my fix introduced and one older one in the same class.

- Over a record that already holds a call, the newly held finding replaced the stored finding in the card's words. Before the fix, the failed run kept the stored words. Now a finding held before the record was read is added to what the record holds: its flag leads, the stored flag and the stored reason stay.
- After a write that missed because the record moved, the handler was still holding that attempt's verdict, including a record flag the attempt had withdrawn. The code comment said the handler fell back to the record's flags; it did not. A miss now hands the photo's finding over again with the record's flags.

**Pass 2** read the second commit and broke it once more. My pass 1 fix for the missed write handed the handler the record's flags only. A flag the second look had *added* was dropped with the withdrawal, and when it was the only reason for the call, the call went too. No live read adds a flag today (stool's second look only withdraws), so nobody was exposed, but the contract allows it. A miss now gives back what was withdrawn and keeps what was added. Pass 2 also named two unpinned lines in the merge; both now have a test that reds when the line is broken.

That was the second and last pass. Its fix is the one the reviewer checked in a scratch copy; the tests and mutation proofs stand in for a third read.

## Residuals

- A record filed under another pet takes nothing, by design: every write is keyed on the event's own pet. The finding is held but has no record to land on. The run returns an error and the phone shows its retry line.
- Over a record that already holds a call, the merged words name the stored finding beside this photo's as seen "in this photo". The stored one came from an earlier read. It errs loud.
- If the database refuses the handler's own read as well, nothing is written. That was already so and is the safe answer.

## Teach

**A server job runs in steps, and a step that fails takes with it whatever was not handed over yet** (T5, L1)

A photo read is not one action. It is a short list of steps the server runs in order, and each one can fail on its own: the photo service, the database, a rule. When one fails, the server jumps to a single clean-up routine. That routine can only use what earlier steps had already put somewhere it can reach. Anything a step knew but had not yet handed over is gone.

**Like:** a nurse who reads a test result and means to write it on the chart after checking the patient's file. If the file room is locked and the nurse is sent home, the result leaves in their head. Writing it on the chart first costs nothing.

**In today's work:** `supabase/functions/_shared/incident-analysis.ts` (step 6-hold)

```ts
holdPhotoFinding()
```

This one line runs straight after the photo is read and before the server looks at the saved record again. It writes what the photo showed onto the clean-up routine's chart.

**Why it matters to you as PM:** when a spec says "if the read fails, show X", the useful question is "fails at which step, and what did we already know by then?"

**Check:** the fix hands over what the photo showed, but only when it showed something. Suppose a later request asks the failed state to say "no blood seen" when the photo was read and looked clean. What would be wrong with handing that over too?
