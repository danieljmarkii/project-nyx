# Vet report v2 PR-13: sheet 2, the pointers that land, and the PDF keeps its punctuation

**Date:** 2026-11-02
**One thing:** D4 L1 — Guards: a guard that never meets the thing it bans passes over nothing, so it is proven by breaking the code · check: pending
**One thing (re-ask):** D3 L1 — A test that looks for something it cannot see passes by not looking (from 2026-10-27, the moon watermark: had the code drawn the moon on a full day, what would that first test have said, and why?) · check: pending

Shipped via #1398. Finishes CUL-2293, CUL-2350 and CUL-2386.

## What shipped

The v2 vet report now has back sheets behind the document flag:
- **"The record by day":** the incident photos, a day ledger, and "What each episode looked like".
- **"Intake per feeding":** promoted ahead of it when an intake or refusal flag fired, and it says when a refusing pet last ate something.

Sheet 1's flag lines point at those sheets by title instead of at appendices v2 never printed. The PDF's text layer keeps the punctuation beside numbers ("48–72 h" no longer reads "4872 h") in all three renderers.

The PR body is the full record: the Definition of Done, the reviews, the residuals and the QA script.

## Teach

### One thing — A guard that never meets what it bans passes over nothing (D4, L1)
A guard is a test that reads the report itself and fails the build when a banned thing appears. Today's guard bans "0 of" next to blood, foreign material or mucus, because "Blood 0 of 18" turns "the photo couldn't be read" into an all-clear. A guard that comes back green proves nothing until we have broken the code on purpose and watched it go red. So we planted "Blood 0 of 3" in the report's own sentence. The guard stayed green: none of our test pets ever reached the sentence where that phrase would print, so the guard never saw it. We added two pets whose photos came back clean, ran the plant again, and it went red.

**Like:** a smoke alarm tested only in rooms with no kitchen. It never beeps, which says nothing about whether it works. You find out by holding a match under it in the room where fires actually start.

**In today's work:** `supabase/functions/generate-report/backSheetsV2.test.ts`
```
function cleanReads()                                   // two test pets whose photos show nothing
  cat.aiAnalyses = … foreignMaterialPresent: 'no' …      // the cat's one "foreign material" read turned clean
  dog.aiAnalyses = … stoolBloodPresent: 'no', … 'no' …   // the dog's blood and mucus reads turned clean
  for (const [name, s] of [...all(), ...cleanReads()])   // the guard now reads every pet AND the clean two
    assert.deepEqual(zeroBesidePresentOnly(text), [], name)   // no "0 of" beside blood, foreign or mucus
```
Before `cleanReads()` existed, every photographed test pet had a finding, so the "nothing seen" sentence never printed, and a "0 of" planted there could not be caught.

**Why it matters to you as PM:** when a PR says "guarded", ask whether the guard was ever shown red; a guard nobody has broken is a promise, not a protection, and on the vet report the promise is the one that keeps an unread photo from reading as clear.

**Check:** Next month someone adds a new sentence to the stool section that only prints when a dog has exactly one stool logged. None of the test pets has exactly one. If that sentence says "mucus ×0", what does today's guard report, and what would you ask for before trusting it?
