# Diet trial: an effective end for a trial nobody ended (B-422)

**Date:** 2026-07-29

Shipped via **#513**. Closes **B-422**; files **B-592**, **B-593**, **B-594**.

The headline is not the feature. It is that `adversarial-reviewer` ran three times, **failed the first two**, and each of those rounds found real breaks *introduced by the previous round's fix*. Ten executed counterexamples across the two failing rounds. The design changed twice, and the rule that came out of it is the thing worth keeping:

> **The effective end bounds BELIEF and ONE DENOMINATOR. It never bounds EVIDENCE.**

## The problem

`diet_trials.status = 'active'` never expires. Nothing auto-completes a trial, and §4.3's completion milestone is action-first and needs an owner tap — so **stale-active is the steady state, not an edge case**. Three live consequences, all named on the B-422 row:

- **The widget's one-tap rows kept naming the trial diet** for every unlogged slot — including the bare row a pet with no learned slots gets. A habitual tap therefore **wrote a `meal` event naming a food the pet had not eaten since spring**, into the record a vet reads. Write-path corruption, not a stale caption.
- **Three Signal detectors stayed fully suppressed** (staple washout ⑧, meal-type collapse ⑨, diet churn ⑩) and `food_symptom_correlation` stayed promoted to band 1. The symptom is a permanently *missing* finding rather than a wrong one — which is exactly why nobody noticed.
- **The coverage denominator grew with the calendar**, so a well-run trial drifted below `COVERAGE_FLOOR` and stayed there; §5.2 rules the exposure count a floor, so a permanently sub-floor trial suppresses the record claim for good.

## What shipped

One definition in `lib/dietTrial.ts` — the module the client, `generate-report` and `ask` already share: `TRIAL_OVERRUN_GRACE_DAYS` (56), `trialTargetEndDayIndex`, `trialEffectiveEndDayIndex`, `isTrialRunning`, plus a coverage tail clip and a new `TrialFacts.exposureRange`. Read by the widget publisher, `generate-signal`'s and `generate-report`'s `dietTrialActive`, and `loadTrialProteinContext`. Every remaining `status = 'active'` in the tree is either gated or carries a comment saying why it must not be.

The widget gate sits in `buildWidgetSnapshot` rather than at the DB read, deliberately: that is the **pure** boundary both consumers pass through, so the write path is testable without a database, and the day counter and the one-tap rows cannot disagree about whether the pet is on a trial.

## Round 1 — the effective end had been applied to evidence

Six counterexamples. The first cut put the effective end on `buildTrialContext.endDayIndex` (which `isInTrialWindow` reads) and on the card's four SQL reads, so **the app stopped seeing the record** on a trial nobody ended. Every deletion moved toward reassurance:

- A cat eats every bowl for 61 days, then **refuses 38 of 38 rated bowls across 19 days**, all logged, past the effective end. The refusals were never read: `trialDietRefusal` → null, coverage 61/61 = 100% `supports`, `mayStateRecordClean` **false → true**. The card — which this change deliberately keeps rendering forever — showed the clean two-fact presentation over an anorexic cat 100× past the feline 48h hepatic-lipidosis window. Reassurance-on-absence, *produced by the fix*, on the exact surface B-494 exists to protect.
- A beef-flavoured **chewable** logged on trial-day 66 with the last meal on day 61 fell out of the dose loop, and because `oralRoute` is one of five withholding clauses, losing it turned silence into an affirmative "all N matched" claim.
- A `since_visit` scope starting past the target end collapsed the range below its own start → early return → **the entire trial block vanished**, with an in-scope off-diet exposure in it.
- The present-tense refusal register spoke from data **116 days stale**, with the `recentFinished` stand-down evidence structurally excluded.

Two claims I had written into the commit message and PR body were **falsified**:

- *"the tail anchor includes treats … which makes it provably unable to drop a logged exposure."* True for `input.feedings`, false for the **dose** loop, which shared the same bound. The anchor moved to **non-treat** feedings — round 1 also showed the all-feeding anchor let **one** permitted duck treat on day 84 re-create the exact *"56 of 84 days"* harm the clip exists to stop, and near the floor flip `belowCoverageFloor` on.
- *"grace = 28, derived from §4.3's named extensions (+28d skin / +14d GI)."* That sizes the grace off the **skin** case and then applies it to a dog·gut trial whose ACVIM 2026 ceiling is target+56. The observable was not soft degradation: the vet report's trial block **vanished at day 71 of an 84-day course**, so the report's own first question went unanswered mid-intervention. **56**, derived from the clinic, clears every P-1 cell (dog·gut 28→84, cat·gut 42→98, skin 56→112).

The most useful finding was not any single break: *"no case with `doses`, no case with `arrangements`, no case with `intakeRating`, and no case with `scopeStart`/`scopeEnd` — all four of the highest-severity breaks live in exactly those four gaps."*

## Round 2 — the same mistake one layer out

`lib/dietTrial.ts` was clean. The invariant was broken by its **largest consumer**, in a seam the module's own suite cannot see, with all 3,522 jest and 1,024 deno cases green throughout. Four more, two critical:

- **`generate-report` re-used the clipped `facts.range` as an evidence bound** in four places. A table-chicken feeding logged five days past the effective end was counted in `offDiet` (from the module) and missing from `exposures.items` (from the report's own second pass) — so page 1 read *"1 / 124 — dates in appendix C"* while Appendix C read *"Every one of the 124 feedings logged in this window matched the trial diet or a permitted food."* **Emptying the itemisation unlocked an affirmative all-clear the report has never otherwise printed** (`emptyRow` fires only when `items` is empty), and `confounderFeedings`, the protein tally and the protein-over-time chart all inherited it.
- **A B-494 inversion.** Ranking `selectReportTrial` on running aged an un-ended trial out at its effective end — and the trial block carries `trial_diet_refusal`, so dropping the block drops the **safety flag**. On the canonical case (an 8yo cat refusing every one of ~336 logged bowls of the prescribed diet, still refusing), `safetyFlags` went `['trial_diet_refusal']` → `[]`, and the legend flipped from *"absence of a flag is never shown as an all-clear"* to *"nothing is printed here when no flag fired"* — while her **owner's card still fired the refusal headline off the same record**.
- The coverage **numerator** was bounded by the evidence end while its denominator was clipped, so `daysLogged > daysElapsed`, fraction > 1, and post-trial logging rescued a 34% sub-floor record from `does_not_support` to `supports` with `mayStateRecordClean` false→true. That un-suppresses §5.2's record claim on exactly the under-capturing owner the floor exists to catch.
- The range could **invert** (`daysElapsed: -88`, rendered *"Meals logged on 30 of -88 days"*) when the first non-treat log landed past the effective end — the head clip is drawn from the evidence window and the tail clip from the coverage one.

### The decision round 2 forced: gate the anchor, never gate the disclosure

The B-494 inversion is the one that reverses a PM ruling, so it got a scope decision rather than a patch. **The report's trial *selection* reverted to `status`**, and `resolveScope` rung 2 reverted with it — the two must rank identically or the window is anchored on one trial while the block describes another, which is a real round-1 divergence. Only `dietTrialActive` stays gated on the report side, and that is one of the three harms B-422 was actually filed for.

The reasoning that settles it: **an owner still logging refusals daily is the strongest possible evidence the trial has not stopped.** The record contradicts the inference, and evidence outranks inference.

That leaves a real residual — an un-ended trial anchors the report window forever, so a 2024 trial nobody closed gives a two-year window. It needs both functions moved together plus a fresh `vet-report-cold-read`, and it is **not** one of B-422's three named harms → **B-594**, to pair with B-538. It was deliberately not smuggled in here.

## What deliberately did not change

- **The card keeps an overrun trial forever.** `status` stays the lifecycle authority for migration 040's one-active-trial index, the card's presence, the completion sheet (`profile.tsx`'s `sheetTrial`) and the start-modal takeover (`getActiveTrialForPet`). That card is the only way an owner can *ever* end a trial, so the effective end must never remove it. Both sites carry a comment saying so, because the "fix" is tempting and wrong.
- **`ask` is un-gated.** No write path, no suppression, no denominator, and the card still shows the overrun trial — so gating it would break G5 parity to avoid no harm. Flagged as the one judgment call worth a veto.
- **The widget and the card diverge on purpose.** The card carries the milestone and can *act* on the overrun; the widget cannot, so an unresolvable "Day 412 of 56" is noise on a glanceable surface. Documented at the call site rather than left as collateral (revisit at B-542's widget revamp).

## Composition with the open siblings

**B-538** (report anchor 14→90, card 14→30) composes rather than competes: an overrun trial is expressed as one that *ended on its effective end*, so the existing ended-trial graces govern its afterlife and B-538 lands on top with no edit here. **B-534** (just-ended-trial report race; Home strip staleness) has no definitional overlap — a write-flush race and a hydration-tick miss. Untouched.

## Drive-by

`scripts/deploy-edge.sh` was missing CI's `--allow-read=supabase/functions`, so B-071's soft-delete guard test (which *reads* `generate-signal/index.ts`) failed `NotCapable` — and that matches the script's own `| N failed |` pattern, so it **hard-failed every `generate-signal` deploy verification** on a permissions error dressed up as a test failure.

## Tests

29-case `lib/dietTrialEffectiveEnd.test.ts`: the arithmetic including every degraded input, the belief/evidence/denominator split, the tail clip, **all ten counterexamples as regressions**, and two property suites over generated inputs (`daysLogged <= daysElapsed`, `endDayIndex >= startDayIndex`, and every counted exposure walkable from `exposureRange`). Plus widget staleness, the contaminant gate, `selectReportTrial`, `resolveScope` + `dietTrialActive`, and a Deno-side test pinning the new cross-boundary import.

The property tests are the round-2 lesson made permanent: both of that round's arithmetic breaks were shapes no example test happened to name, and an example list would not have found them.

## Residuals

- **B-593** — ratify the 56-day grace with Dr. Chen. The accepted cost, stated for the ruling: an *abandoned* trial keeps its widget one-tap row and its three detector suppressions for **eight weeks** past target. Bounded where it used to be unbounded, but eight weeks is the number to push back on.
- **B-592** — the overrun card reads "Meals logged on 56 of 56 days" under a day counter that keeps climbing. Both numbers are right and the pair is unexplained. `TrialRange.closedByOverrun` is computed and exported for it and nothing consumes it yet — undrawn copy on a design-locked card needs a mock round, not invention inside a build PR.
- **B-594** — the report-window anchor, above.
