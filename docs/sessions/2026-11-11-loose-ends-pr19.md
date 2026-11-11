# Loose ends PR-19: a refused trial is not a broken elimination

**Date:** 2026-11-11
**One thing:** D3 L1 — Reading a test: tests written for another case are what stop a fix from going too far · check: pending
**Mode:** BUILD, [CUL-2707](https://linear.app/projectnyx/issue/CUL-2707)

## What changed

- On a vet report where the ratings show most of the trial diet was left, the "Interpreting this record" box opens by saying the record documents a refusal rather than an elimination. Its off-diet line then closed with "so this record shows an elimination that was broken", and its "1 of 22 feedings" counted the refused bowls as feedings of the diet. Now that line states a fact: "Also fed off the trial diet: 1 feeding on May 10, 2026 (appendix C; a floor, not a total)."
- The first cut applied whenever any refusal or intake line printed. Eleven existing Cooper and Nyx tests went red: there the diet was partly eaten, and "an elimination that was broken" is the right, loud verdict. The gate was narrowed to the refusal sentence.
- Adversarial pass 1 found that the AI lead's fact table took its required "trial is not clean" words from the old line. With that line gone, the refusal sentence became the bottom line with nothing it had to say. "rather than an elimination" is now a bottom-line phrase. The same pass narrowed the gate again, to the whole-range ratings showing more than half of the trial diet unfinished.
- Adversarial pass 2 found no QUIET break. Its one cheap, louder-only fix shipped: where off-diet feedings are the majority, the ratio stays. Its other residuals are filed as Backlog items [CUL-2716](https://linear.app/projectnyx/issue/CUL-2716) and [CUL-2717](https://linear.app/projectnyx/issue/CUL-2717).
- Dr. Chen's cold read judged the box clinic-ready. The cold read found the same class still on page 1 (the headline and the tile), filed as [CUL-2714](https://linear.app/projectnyx/issue/CUL-2714), and missing detail in the box, filed as [CUL-2715](https://linear.app/projectnyx/issue/CUL-2715).

## Teach

### One thing: Reading a test, what tests written for something else are for (D3, L1)
A test checks one case. A fix is written for one case too, and it can quietly change other cases nobody was looking at. The tests that catch that are usually not the new ones. They are old tests, written months ago for a different patient, that still expect their own sentence.

**Like:** a new rule at a clinic: "tell owners of cats that refuse food to stop the diet." Then a front desk reads it to every owner whose cat skipped one meal. The people who notice are the regular clients whose instructions just changed under them.

**In today's work:** `supabase/functions/generate-report/sheet1Pr29.test.ts:50`
`assert.match(t, /4 of 42 feedings during the trial did not match it on Sep 30, Oct 4, Oct 8 and Oct 13, 2026/)` checks that Cooper's report, a dog fed beef jerky on the days he vomited, still says how many feedings broke the trial. This session's first fix removed that sentence for every pet with any intake warning. This test, written for a different issue, went red and showed the fix was too wide.

**Why it matters to you as PM:** when a PR says "the whole suite passes", the old tests are part of the claim that the fix changed only what it meant to change. A PR that deletes or edits old tests to go green is the one to ask about.

**Check:** If the Cooper test had not existed, what would a vet reading Cooper's report have seen after this PR, and who would have noticed?

## Outcome

Shipped via #1516.
