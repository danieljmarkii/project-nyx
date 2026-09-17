# Trial window PR 1b — the coverage denominator is frozen, and the overrun is disclosed

**Date:** 2026-09-17

CUL-1038, shipped via #TBD. The second behaviour change of the diet-trial window
track (CUL-156) and the first repair on it: everything before this pinned or
recorded the defect, and this closes it.

Spec: `docs/nyx-trial-extension-requirements.md` v2.3 §5.4 (the ⚠ REPAIRED block),
TE-6, §6 D7(c). Mock: `docs/culprit-trial-extension-mockups.html` §8, republished.

## What was wrong

`computeTrialFacts`'s B-422 coverage tail clip bounded the coverage denominator at
`trialTargetEndDayIndex`, which reads `diet_trials.target_duration_days` — the exact
integer the extension tap overwrites. On an un-ended trial past its window, extending
pushed the target past the evidence, the clip stopped applying, and the denominator
jumped from the prescribed window to the full elapsed range, carrying
`belowCoverageFloor`, `mayStateRecordClean` and `interpretability` with it.

Executed on the rendered page, both report scopes:

| scope | before the tap | after one tap |
|---|---|---|
| default | Meals logged on **10 of 28** days · *too sparse to read that as a clean elimination* | **32 of 50** · *all 32 matched the trial diet or a permitted food* |
| **since the visit (rung 1)** | Meals logged on **0 of 9** days · *too sparse* | **22 of 31** · *all 22 matched* |

Zero new evidence, retroactive over days already reported. Rung 1 is the scope a
diet-trial owner actually gets — they were just at the vet, which is how they came to
be on an elimination diet — so the worst instance lands on the wedge's own owner.

## What shipped

**The freeze.** A new predicate, `trialCoverageWindowEndDayIndex` (`lib/dietTrial.ts`),
reads `target_duration_days_initial` (migration 068, backfilled for every live row) and
falls back to the live target only where nothing recorded the designed window. The tail
clip takes it for **both** `endDayIndex` and `overrunUnended` — bounding one and leaving
the other on the live target releases the clip entirely on an extended trial, which is
the defect wearing a different shape.

**The disclosure.** `range.closedByOverrun` now reaches production for the first time
since B-422: the report's coverage sentence, its scan-grid tile, and
`interpretabilityStatement`, which says *which* window it covered. Written in the
register of the precedent one block away in the same document — *"The allowed list
changed after the trial started"* (`render.ts:2721`).

**The column, made true and read.** `startDietTrial` stamps
`target_duration_days_initial` at creation; `dietTrialRowToRemote` forwards it;
`hydrateDietTrials` pulls it; `lib/dietTrialFacts.ts` and `generate-report`'s pull +
mapper carry it to the two `computeTrialFacts` callers.

**The markers.** PR 0's four §5.4 expected failures are promoted to plain tests with
their assertion bodies byte-identical. Two new blocks: **G4** pins the downstream
surfaces PR 0 listed and could not assert, **G5** pins the residual.

## What the build settled that the ruling did not say

**1. The freeze is a NEW predicate, and `trialTargetEndDayIndex` deliberately keeps
reading the live target.** D7(c) says "freeze the coverage denominator at
`target_duration_days_initial`", which reads like a one-line change to the existing
function. It is not: that function is also how `trialEffectiveEndDayIndex` and
`isTrialRunning` answer *is this trial running today*, and an extension is **supposed**
to move that — the tap's own docstring calls it "the sanctioned way to move the window",
and detector suppression, the widget projection and the report anchor all read it.
Freezing both would have withdrawn belief from the trial the owner had just extended.

The split is the repair, and it is the same split TE-6 states: an extension may move
BELIEF, and may not move a CLAIM ABOUT THE RECORD. It also answered one of PR 0's four
listed blind spots — `pet.dietTrialActive` still flips across a tap, and that is correct
rather than unfixed.

**2. A column the backfill filled is not a column the freeze can use.** 068's backfill
covers every row that existed when it applied and nothing after, because a `DEFAULT`
cannot reference a sibling column. Without a create-stamp the freeze would have covered
every existing trial and no trial started from that day on — a repair whose coverage
shrinks over time. So the stamp, the push mapper and the hydrate select came into 1b;
`set_at` / `vet_directed` and the window-MOVE write path stay PR 2's. The line is: **1b
owns making the column TRUE and READ, PR 2 owns recording that the window moved.**

**3. The fixtures had to move toward production before the markers could fire (C-35).**
All four of PR 0's markers built a trial with no `targetDurationDaysInitial` — the
pre-068 row, and at the time the only row there was. Under any `initial ?? current`
freeze the "after" read still resolved to 64 and the denominator still moved: **the
markers stayed green over the repair.** The row a real tap produces post-068 is
`{initial: 28, current: 64}`, because the backfill stamped `initial` and the shipped
`extendTrial` writes only `target_duration_days`. Once the fixtures were that row, all
four fired.

The discipline that makes this legitimate rather than convenient: the `expectedFailure`
assertion bodies were not touched, only the row shape was, and the pre-repair reads are
kept verbatim in comments beside the assertions that replaced them. The oracle was never
the fixture's shape — it is that nothing an owner does may move a claim about the record.

**4. A non-vacuity floor keyed on the bug it sits next to expires with the bug.** G3's
floor read *"the fixture really is clipped before the move, and really is NOT clipped
after it"* — it proved the fixture was live by pointing at the defect, so the repair that
removed the defect also removed the proof, and G3 went red for the right reason in the
wrong place. Rebased onto the invariant: the trial has overrun on both reads, and the
exposure window reaches past the coverage window within each read. Same claim, no
dependence on the defect. Generalises: **when a guard's control asserts the behaviour a
queued PR is going to remove, it is not a control, it is a countdown.**

**5. The head-clip route closes with the freeze rather than beside it.** §5.4's real
ceiling ran through the HEAD clip following `endDayIndex` once the tail clip released: an
owner who logged nothing in the prescribed window and every day after went 0 of 28
`does_not_support` to 22 of 22, fraction 1.0, `supports`, with
`untrackedDaysBeforeFirstLog` fabricated at 28 so the page asserted the first 28 days
pre-dated any logging. With the window pinned there is no logged day inside it for the
head to follow. Stated in the code and the PR because it reads as incidental and is not.

**6. The card gets the freeze; the card's sentence stays B-592's.** The trial card's
facts come through the same module, so the flip is gone there too. What it still lacks is
the sentence explaining *"56 of 56 days"* under *"Day 84"* — filed since B-422,
deliberately unwritten because the card in `nyx-diet-trial-mockups.html` is design-locked
and this repo does not invent strings for it outside a mock round. Not a gap this PR left
open; a gap it narrowed from a safety defect to copy.

**7. A comment inside a query chain can red a guard that has nothing to do with it.**
`guards/reportPullPagination.test.ts` (C-42) reads 2,000 characters from `.from(` and
`blankComments` preserves line length, so a nine-line rationale inside the `.select()`
pushed `count: 'exact'` out of the window and the guard reported a pull that pages
perfectly well as un-paged. The bound is deliberate (C-4: a fixed window that reaches into
the next query is not a slice of the object under test), so **the comment moved, not the
bound** — and the reason it moved is written where the next person will put a comment
there.

## Proven by mutation, not by reading (C-18)

| Mutation | Result |
|---|---|
| `trialCoverageWindowEndDayIndex` reads `targetDurationDays` (the pre-repair function) | **17 red**, including all four TE-6 markers and both G4 pins. G5 correctly stays green — its fixture has no `initial`, so the mutation is a no-op there. |
| Freeze `endDayIndex` but leave `overrunUnended` on the live target (the half-repair the code comment warns against) | **17 red** |
| `initial ?? current` without the `> 0` guard (NULL/0 read as a number) | **exactly 1 red** — G5's own test, the one written for it |

## Adversarial review

`adversarial-reviewer` (mandatory — a coverage denominator the vet report renders) and
`code-reviewer` both ran against the committed diff. See the PR body and the CUL-1038
outcome comment for the counterexamples tried and what held.

## Tests

- `npx tsc --noEmit` clean.
- jest: **8,458 passed / 389 suites**, green at UTC and under all three CI clocks
  (UTC+14 Kiritimati, +12:45 Chatham, −10 Honolulu).
- `deno test`: **1,800 passed / 29 suites**.
- The report path is executed end to end (raw events → `assembleReport` →
  `renderReport`), on the default and since-visit scopes, both sides of the tap.

## What this owes

**A `generate-report` redeploy.** The function is at v15 and the ledger entry was already
`pending`; CUL-1038 joins that pending set and is the reason it is now worth deploying
sooner than the next batch — this is the only item in it that changes a clinical gate's
arithmetic rather than a render. `generate-signal` also re-fingerprinted: bundle-only
drift, no behaviour change (it imports exactly one symbol from `lib/dietTrial.ts`,
`isTrialRunning`, which this PR did not touch — D7(c)'s split working as ruled).

Until that deploy, the **client** carries the repair and the **report does not**.
