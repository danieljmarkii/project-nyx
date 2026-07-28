# B-533 card viability wiring — five adversarial rounds, and a split

**Date:** 2026-07-28

Built B-417 Bucket-B PR 1 (B-533, pairing B-474): the card viability wiring from mock round 5 and rulings R1/R1b/R3/R4. It shipped as **two** PRs rather than one — `shipped via #498` (the wiring + claim gate) with **#499** held for a design pass (the two new owner-facing registers). The split was the PM's call, taken after the review evidence made the case.

## What shipped in #498

`lib/dietTrialFacts.ts` **hard-nulled `exposures` and `belowCoverageFloor`**, so card states 3/4 and the record-and-continue copy were structurally unreachable — B-474, worse than filed. It now reads the allowed set, feedings, doses and arrangements out of local SQLite and routes them through `computeTrialFacts`, the same `lib/dietTrial.ts` `generate-report` and `ask` import.

Its bespoke `readCoverage` was **deleted rather than ported**: a second definition of the §5.1 metric one import away from the real one, with no §10 S3 head clip, so an owner handed the diet at the clinic and logging from home was scored "1 of 15 days" while the report printed a kinder number on the same record (**B-537**).

`mayStateRecordClean` **moved from `generate-report/trial.ts` into the shared module**, under a comment that had claimed *"`lib/dietTrialFacts.ts` gates the card on exactly this"* — which was untrue. The card asked a strictly weaker question, so one record produced a withheld claim on the vet's page and an affirmative one on the owner's card.

The free-fed forbidden claim is deleted **and the green test locking that exact string is flipped** (round 5 ①). The start date is promoted to the start modal's default path (**R3**). 7a's verdict line is pinned conditional (**R4**). Both safety registers render as the app's tinted block rather than body text. `lib/dietTrialFacts.test.ts` is new — 13 cases running the real SQL against `node:sqlite`, which the mocked `getAllAsync` harness could never reach.

## What is held in #499

The **R1 refusal register** (`trial_refusal`, consuming `trialDietRefusal` — built in PR 5, consumed by nothing, the pre-ship review's worst client-side finding) and the **R1b teach line**, plus their facts: `recentFinishedFeedings`, `rangeRefusalSpansEpisodes`, `intakeRating`. (`freeFedOverlap` came *back* to #498 at the DoD gate — the sub-floor state it explains is reachable there.)

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

That is only half the answer. **B-559** files the rest: the resolver is ~1,450 lines, 11 states and ~15 input flags after the split (it was 1,702 / 12 / 21 before it), and §4.2's "a switch, not eleven components" no longer describes it — the states are still a switch, but the *disclosures* compose independently of them and are not. Do it before #499 grows the surface again.

## Residuals

- **B-556** — `lib/trialContaminant.ts` narrows an unrecognised `diet_trial_foods.role` to `primary_diet` where this file and the report use `permitted_other`. Fixing it moves the *shipped* log-time contaminant flag, so it needs its own PR and adversarial pass.
- `view_exposures` has no handler on the shipped surface (PR 5's list screen does not exist), so that drill-in renders nothing on device today.
- **B-557 / B-558** closed — both were filed as deferrals during the build and promoted to fix-now by the review, because each moved a claim in the reassuring direction rather than merely omitting a disclosure.

## The DoD gate caught the split

Running `adversarial-reviewer` against the **reduced** branch — not the work, the *reduction* — returned **FAIL with a merge-blocker**, and it was the right instinct: a subtractive edit fails by leaving something half-removed.

The split kept the §10 S3 coverage clip and deleted the loader line that discloses it. The ordinary clinic hand-off — trial back-dated to the visit, logging starts at home — rendered **"Meals logged on 2 of 2 days" under "Day 30 of 56"** with nothing saying why, while `generate-report` printed *"The first 28 days…"* off the same record. Strictly more reassuring than the card it replaced, and a card/report divergence on one record: the exact thing this PR exists to remove. `pushUntrackedHead` was dead in production and **no test noticed** — the resolver suite injects the field directly and the loader suite only exercised SQL strings.

So the gap is closed as well as the defect: `lib/dietTrialFacts.test.ts` now asserts the **loader→card contract** — every disclosure the module computes reaches the field that renders it, and the clip and its disclosure ship together or neither does. Mutation-checked; delete the line again and both fail.

Three more of the same shape, all fixed:

- B-474's un-nulling made the **sub-floor state reachable in this PR** while its bowl disclosure went to the sibling, so an owner who *recorded* a bowl's removal landed on "There isn't enough logged yet…" with nothing naming the cause.
- Both **terminal decline branches** withheld the off-diet floor the active card discloses on the identical record — round 4's rule surviving in the two branches `everyState` could not walk, because every decline fixture in that list is an active trial. Both branches are now in the list.
- Two **property-test exemptions had gone stale in a way only B-474 could cause**: `day one` and `milestone` were vacuous while `exposures` was hard-nulled. Un-nulling made the silence real — an off-diet feeding logged on day 1 vanished, and twelve logged exposures were withheld at the moment the owner decides whether the trial is done. Both retired.

**One deviation flagged rather than taken silently:** adding the floor to the milestone departs from the round-4 design lock. §4.3's "deliberately no fact lines" argues about *coverage* beside a stop button; §5.2's floor is a different rule pointing the other way. Cheap to revert if the Designer disagrees.

### …and the gate's own fixes needed a second pass

Re-running it on the fixes returned **FAIL again**, with two of three gate items *introduced by the repairs*:

- **The Home strip** rendered the newly-clipped ratio with nowhere to carry the head — "meals logged on 2 of 2 days" reading as a near-perfect record for a whole trial, in the reassuring direction, on the Principle-3 intelligence surface. It falsified the very invariant the first fix is named after. The strip now drops a ratio it cannot qualify, exactly as it already does under a safety flag.
- **`day_one`** rendered *"Nothing logged yet today."* directly above *"2 logged feedings were outside the trial diet"* — coverage excludes treats, the exposure count includes them, so the two lines keyed on different populations. Not clinically dangerous (the direction is disclosure) but a flat false statement on the card whose job is being true about the record.
- **The contract tests I added did not test behaviour.** They asserted the field's *name* appeared in the return literal; hardcoding it to `0` passed them green while the disclosure never rendered — and my comment claimed a guarantee they did not provide. Replaced with tests that run the real `loadDietTrialFacts` against a stub db, and mutation-checked with the exact mutation that defeated the originals.

Also fixed: the two states that took the floor as a *declared* deviation silently inherited a directive ("Worth checking the list before your vet reads this") along with it. **B-560** and **B-561** filed rather than fixed.

The lesson worth carrying: **a source-text test is not a test of behaviour**, and writing one while claiming otherwise is worse than writing none — it converts an untested contract into an apparently-tested one.

## Process note

One self-inflicted cost worth recording: mid-round-4 a `git checkout` inside a compound probe command discarded that round's edits to `lib/dietTrialCard.ts`. Caught immediately, redone, and the mutation check re-run safely — but it cost a cycle. Never put a working-tree-discarding command in a compound line.

---

## Rounds 6–9, added after the wrap

The PM asked for an eighth and ninth round on the hypothesis that severity was
declining and might converge to nothing. It did not. **Round 9 produced the
worst finding of any round, and it was a defect introduced by round 9's own
fix.**

Counts across the whole PR: **8 → 5 → 7 → 9 → 10 → 4 → 6 → 9 → ~10**, the last
from two lenses run in parallel (`adversarial-reviewer` + `pm-feature-review`).

### Round 8

Four findings, every one a fix applied to one register or one surface and not
its sibling. The Home strip stated a coverage ratio the card withheld (a cat
refusing 88 of 88 rated feedings for 44 days read *"meals logged on 44 of 44
days"* on Home); an unhydrated permit set named the **prescribed diet** as the
most recent slip while saying "Keep going with the trial diet"; the decline
register's *"Culprit isn't showing the trial numbers"* rendered directly above
a trial number — falsified by this PR's own change, and the sibling
`trialViabilityNote` had that exact sentence corrected twice already.

And a null range was read as a zero record: `computeTrialFacts` returns an
all-zero `base` where it cannot establish a range, so five logged feedings
reached the card as *"0 feedings in total."* — the app's own failure to compute,
dressed as a finding about the pet. `generate-report/trial.ts:599` already
returned null there, so it was a card/report divergence too.

`ARRANGEMENTS_IN_WINDOW_SQL` also got the executable test the previous pass had
explicitly declined to sign off — nine real-engine cases over every null
combination of `active_from`/`active_until`. All nine held first run, so the
algebra was right; it just wasn't proven.

### Round 9 — the fix that had to be reverted

Round 8's Home-strip fix came with a test asserting *"the strip drops what the
card drops."* The assertion failed, and what it proved was that **the card did
not drop it**: the active card under a whole-range refusal led with *"Meals
logged on 22 of 23 days."* over a cat refusing 38 of 38 rated feedings. Round 4's
rule in the one branch nobody had visited. So the strip fix had **inverted** the
divergence rather than closing it.

The fix — route `pushRecordFacts` through `pushRefusalWithheld` — was then broken
by both lenses, on the same ground, and they were right:

> `rangeRefusal` is 3 rated / 2 not-finished days / 50% share with **no span
> guard**, and `some` counts as not-finished. Its own justification in
> `lib/dietTrial.ts` reads *"what firing does is withhold an affirmative claim,
> and silence is cheap."*

Verified against the real predicate: **a dog rated `some` / `all` / `some` fires
it on day 2 of 56.** The consequence of firing had been changed and the threshold
never re-derived — so a wedge owner whose dog ate would have been handed *"a diet
that wasn't eaten can't be read as one that was followed"*, and the likely
response is that she stops rating intake honestly, which is the one signal the
trial needs from her. The closing *"…is the refusal"* also has no antecedent on a
live card; on the terminal cards it sits under the owner's own *"wouldn't eat
it"*, which is exactly why it reads there and not here.

Hoisting the check above the state switch — the other candidate, since
`below_floor`, `free_fed`, `milestone` and `day_one` never see it either — makes
both faults worse by giving the misfire four more states. **Reverted**, with the
ruling recorded at the call site and pinned by tests so it cannot be re-taken by
accident. Residual filed as **B-566** against #499.

Four more, fixed:

- **Home rendered the most non-adherent record as a flawless strip** — round 8's
  own `stripOffDiet` suppression. A dog fed the old kibble twice a day for 23
  days with a *correct* permit list trips `allowedSetUnavailable` via its second
  disjunct, so the off-diet clause was dropped and Home read *"meals logged on 23
  of 23 days"* and nothing else. It failed the invariant its own fix is named
  after.
- **The floor suffix and the can't-match caveat, in both directions.** Five
  wholly-unmatched feedings rendered *"The 5 are what's been logged, not a
  total."* directly above *"Culprit can't match these against the food list"* —
  at-least-five and maybe-fewer, adjacent, under a comment asserting the pair was
  impossible. One predicate now answers for both, at both of the suffix's two
  render sites. The partial-match half needs new copy → **B-567**.
- **The untracked head said "nothing" again** — and it was locked green by a test
  named `it('the untracked head says "no meals", not "nothing"')` whose assertion
  pinned `"nothing"`. Round 8's rewrite changed the string *and* updated the
  assertion to match, while the function's all-caps docstring still claimed the
  round-2 fix.
- **Two empty-record states.** B-474's un-nulling turned `coverage`/`exposures`
  into zeroed objects, which closed the only route to `soFarLine`'s designed
  Principle-5 empty state — written, shipped, unreachable. And `exposureLine`
  rendered *"0 feedings in total. Culprit isn't saying how many matched…"*: the
  app declining to answer a question nobody asked about a record that is empty.

### The test lesson, third time

Swapping two params in `readArrangements` silently drops every free-choice bowl
on a running trial, so the affirmative claim comes back — and it passed all 247
tests. **The first test written for it did not close the gap either**: the
behavioural harness stubs `getDb`, so the params never execute and the mutation
still passed. Only mutation-checking caught that. The bind array is now
`arrangementParams`, tested against the real engine.

Three times in this PR a test that looked like coverage was not one. The rule
that keeps holding: **green is not evidence; a failed mutation is.**

### Convergence — the honest read

The count did not converge, but the *cause* did. The adversarial lens named it:
six withholding predicates (`intakeDeclineHeadline`, `rangeRefusal`, `freeFed`,
`allowedSetUnavailable`, `untrackedDaysBeforeFirstLog`, `belowCoverageFloor`) ×
eleven states × two surfaces, enforced by branch-local helper calls that each new
branch is trusted to remember. `pushExposureFloor` solved that for the
*disclose-the-floor* half in round 4 — one enforcement point plus a property
test. The *withhold-the-reading* half still has none. That is **B-559**, and this
round is its strongest evidence: its prediction is that round 10 finds this class
again until B-559 lands.

The product lens's parallel finding is worth carrying too: across nine rounds the
card has accreted six disclosure lines, four of which exist in no mock, and the
composition has tilted from *"keep this owner in the trial for eight weeks"* —
§4.2's stated job — toward *"be unfalsifiable in front of a vet."* The `forward`
line is the card's actual job and is the first thing crowded out. Filed as
**B-563**.
