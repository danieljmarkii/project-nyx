# B-533 card viability wiring — five adversarial rounds, and a split

**Date:** 2026-07-28

Built B-417 Bucket-B PR 1 (B-533, pairing B-474): the card viability wiring from mock round 5 and rulings R1/R1b/R3/R4. It shipped as **two** PRs rather than one — `shipped via #498` (the wiring + claim gate) with **#499** held for a design pass (the two new owner-facing registers). The split was the PM's call, taken after the review evidence made the case.

## What shipped in #498

`lib/dietTrialFacts.ts` **hard-nulled `exposures` and `belowCoverageFloor`**, so card states 3/4 and the record-and-continue copy were structurally unreachable — B-474, worse than filed. It now reads the allowed set, feedings, doses and arrangements out of local SQLite and routes them through `computeTrialFacts`, the same `lib/dietTrial.ts` `generate-report` and `ask` import.

Its bespoke `readCoverage` was **deleted rather than ported**: a second definition of the §5.1 metric one import away from the real one, with no §10 S3 head clip, so an owner handed the diet at the clinic and logging from home was scored "1 of 15 days" while the report printed a kinder number on the same record (**B-537**).

`mayStateRecordClean` **moved from `generate-report/trial.ts` into the shared module**, under a comment that had claimed *"`lib/dietTrialFacts.ts` gates the card on exactly this"* — which was untrue. The card asked a strictly weaker question, so one record produced a withheld claim on the vet's page and an affirmative one on the owner's card.

The free-fed forbidden claim is deleted **and the green test locking that exact string is flipped** (round 5 ①). The start date is promoted to the start modal's default path (**R3**). 7a's verdict line is pinned conditional (**R4**). Both safety registers render as the app's tinted block rather than body text. `lib/dietTrialFacts.test.ts` is new — 13 cases running the real SQL against `node:sqlite`, which the mocked `getAllAsync` harness could never reach.

## What is held in #499

The **R1 refusal register** (`trial_refusal`, consuming `trialDietRefusal` — built in PR 5, consumed by nothing, the pre-ship review's worst client-side finding) and the **R1b teach line**, plus their facts: `recentFinishedFeedings`, `rangeRefusalSpansEpisodes`, `intakeRating`, `freeFedOverlap`.

Blocking, both named on the PR: **Dr. Chen on the stand-down semantics** — when may a fired safety register be stood down? — and **a mock round** for four disclosure lines that now exist in code and in no mock (`pushUnmatchedCaveat`, `pushPastBowlCaveat`, `pushUntrackedHead`, the refusal card's floor line). Those were forced into existence by review rounds, which is precisely the "inventing them inside a build PR" failure the old loader header warned against.

## The five rounds

`adversarial-reviewer` ran five times and returned **FAIL** every time — **8 → 5 → 7 → 9 → 10** findings, 39 total. Each round's fixes introduced the next round's defects.

| # | The one that mattered |
|---|---|
| 1 | Card said *"all 112 matched"* over a cat that refused 84 of 112 prescribed feedings; the report withheld it on the same record. |
| 2 | `allowedSetUnavailable` was **unreachable as a gate** — it guards the `offDiet <= 0` branch, which an empty permit set can never reach — so the compliant-owner accusation was fully intact, sign flipped. |
| 3 | Round 2's fix was wrong *in principle*: suppression deletes real findings, was discontinuous at the 10-feeding floor (more evidence bought less disclosure), and asserted "no allowed-food list is recorded" two lines under the card's own food label. |
| 4 | **Silence cancelled a fired safety register.** Owner documents 42 refusals, stops rating → the recency window empties, the register vanishes, the card returns to "Meals logged on 44 of 44 days" over a cat still refusing. |
| 5 | The round-4 stand-down predicate counted *ratings* not *finished* feedings, so **two more logged refusals cancelled the register**. And the property test **could not fail**: its skip-guard ("no feeding word in the output") was a condition *implied by* the defect it was written to catch. |

Two things the reviews **proved** rather than assumed: `rangeRefusal` matches the `generate-report` loop it replaced across **4,000 randomized fixtures, zero mismatches**, with byte-identical rendered report output against a pre-change worktree; and the new arrangements SQL held on 16 real-SQLite cases.

## Why it was split

The findings were not spread evenly. Every round's regression sweep shows the wiring holding since round 1; essentially all 39 landed in the two new registers. R1's PM sizing was *"one design pass + small PRs, not a rebuild"* and the combined PR was +3,739/−345 across 14 files.

**Dir. of Eng. correction to the seam:** it is *not* "wiring vs register", which is where it was first drawn. `rangeRefusal` and `allowedSetUnavailable` read like register work but are claim-gate correctness — without them PR A ships round 1's bug. The seam is **everything except the two new owner-facing registers**.

**Consequence the PM holds:** #498 does *not* satisfy R1, so the **TestFlight cut waits on #499**, not on #498. A later cut in exchange for not shipping a safety register five rounds could not stabilise.

## The structural outcome

Round 4 diagnosed why the same defect kept reappearing: each fix applied one of *{withhold the reading, withhold the count, disclose}* to one register, and the branch it did not visit inherited the opposite defect. `pushExposureFloor` (one helper every reading-withholding branch calls) plus a **cross-state property test** is the answer to that, and both ship in #498. The test is **mutation-checked** — break the helper and it fails — because its predecessor could not.

That is only half the answer. **B-559** files the rest: the resolver is 1,702 lines, 12 states, 21 input flags, and §4.2's "a switch, not eleven components" no longer describes it — the states are still a switch, but the *disclosures* compose independently of them and are not. Do it before #499 grows the surface again.

## Residuals

- **B-556** — `lib/trialContaminant.ts` narrows an unrecognised `diet_trial_foods.role` to `primary_diet` where this file and the report use `permitted_other`. Fixing it moves the *shipped* log-time contaminant flag, so it needs its own PR and adversarial pass.
- `view_exposures` has no handler on the shipped surface (PR 5's list screen does not exist), so that drill-in renders nothing on device today.
- **B-557 / B-558** closed — both were filed as deferrals during the build and promoted to fix-now by the review, because each moved a claim in the reassuring direction rather than merely omitting a disclosure.

## Process note

One self-inflicted cost worth recording: mid-round-4 a `git checkout` inside a compound probe command discarded that round's edits to `lib/dietTrialCard.ts`. Caught immediately, redone, and the mutation check re-run safely — but it cost a cycle. Never put a working-tree-discarding command in a compound line.
