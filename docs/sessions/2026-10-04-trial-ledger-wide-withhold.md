# The trial ledger's unfinished-bowl withhold reads the wide meal record (CUL-1348, PR-43)

**Date:** 2026-10-04
**One thing:** D1 L1 — Anatomy of a diff: a minus line and a plus line are one change · check: pending

Dispatched as PR-43 of the second Out of beta project. Shipped via #1038.

## What shipped

- **`lib/dietTrial.ts`:** adds a new `TrialFacts.unfinishedMealDayIndices` field.
  - It holds the days of every rated, unfinished non-treat meal (B-530's `meal_record` rows), unioned with the narrow `unfinishedDayIndices`.
  - The union makes it a superset by construction, so the switch can only withhold more.
  - It uses the same predicate (`feedingWasFinished`) and the same evidence bound as the narrow set, and has no floors.
- **`lib/trialLedger.ts`:** `buildTrialLedger` now withholds on the wide set. That covers the trial screen's ledger and Home's this-week lane. The trial-week boundary is unchanged (ruling 2).
- **Unchanged:** the refusal facts and the narrow set. Nothing speaks from the new field.
- **`lib/trialLedger.test.ts`:** each extra bowl now names what it was logged against: trial, trial typed as a treat, a re-photographed bag, a rival meal, a treat, or no food. Six new tests run through the real loaders.

## Proven by mutation

| Mutation | Tests that go red |
|---|---|
| Point the gate back at the narrow set | 4 |
| Drop the wide half of the set | 5 |
| Drop the narrow half of the union | the union test (a trial-diet row typed `treat` is narrow-only) |

## Falsification

`adversarial-reviewer` returned **PASS**. It worked in a scratch copy, wrapped `computeTrialFacts` so that every call also ran the pre-change module, and generated 600 seeded random records through the real loaders. Results:

- Every fact except the new field was deep-equal across 1,200 calls, so the refusal facts are unchanged.
- There were 0 cases where the new ledger drew and the old one withheld. 30 records were withheld only under the new set.
- No drawn ledger had a rated, unfinished non-treat bowl in the current trial week. This held under +14, +12:45, −10 and America/New_York.
- The wide window contains the fill window, because `startDayIndex ≥ exposureStart` and `endDayIndex ≤ evidenceEnd`.
- The only reader of the new field is the withhold's `return null`. Ask, generate-report and the widget read named fields only.
- Reverting the gate turned its probe red.

## Residual

These predate this PR and sit inside the ruled boundary:

- **Ended and overrun trials** have no current week, so a refused bowl on the last days still paints filled. Example: a 14-day trial read on day 16, with refused re-photographed-bag bowls on days 13 and 14.
- **An earlier week of a running trial** behaves the same way.

If the boundary is ever reopened, these records are the tests to run.

## Teach

### One thing — Anatomy of a diff (D1, L1)
A diff is the before and after of a change, shown line by line. Lines starting with `-` were removed and lines starting with `+` were added. A `-` line followed by an almost identical `+` line is one line that was edited. Read those pairs first, because the rest is often only comments that explain them.

**Like:** a contract with tracked changes. The struck-through word and the inserted word beside it are one edit, and the margin notes explain why it was made.

**In today's work:** `lib/trialLedger.ts:273`
```
-    if (facts.unfinishedDayIndices.some((d) => d >= weekStart && d <= todayIndex)) return null;
+    if (facts.unfinishedMealDayIndices.some((d) => d >= weekStart && d <= todayIndex)) return null;
```
The two lines are identical except for one word. Before, the grid hid itself only when a day had an unfinished bowl of the trial diet. Now it hides itself when a day has an unfinished bowl of any meal. That one word is the whole of your ruling 1(a). The other changes in the PR create that new list and test it.

**Why it matters to you as PM:** when a PR says it does one small thing, the minus/plus pairs let you check in seconds that the code change really is that small, and that the rest is comments and tests.

**Check:** if a later PR showed only the `+` line above, with no `-` line beside it, what would that tell you had happened to the old rule?
