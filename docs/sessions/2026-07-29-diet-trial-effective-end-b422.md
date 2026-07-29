# Diet trial: an effective end for a trial nobody ended (B-422)

**Date:** 2026-07-29

Shipped via **#513**. Closes **B-422**; files **B-592**, **B-593**, **B-594**, **B-595**.

The headline is not the feature. It is that `adversarial-reviewer` ran four times and **failed all four**, each round finding real breaks *introduced by the previous round's fix*. Nineteen executed counterexamples (plus three multi-hundred-case sweeps in round 4 that came back clean). The design changed four times, and the rules that came out of it are the thing worth keeping:

> **The effective end bounds BELIEF and ONE DENOMINATOR. It never bounds EVIDENCE.**
>
> **A field is an EVIDENCE bound if losing a row changes what the report SAYS. `range*` may only ever appear next to the word "coverage".**
>
> **`target_duration_days` is the only authority on how long a trial ran.** Not a log line.

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

## Round 3 — five more consumers, and the tail clip's anchor

`lib/dietTrial.ts`'s own invariants held: 6,000 fuzzed cases found no escape, and all ten prior counterexamples were genuinely fixed rather than moved. Six new regressions, and the reviewer named the shape better than round 2 had: **round 2 converted three call sites inside `buildTrialBlock` and left five others reading `range*` as an evidence bound.**

- **A more recent weigh-in deleted the weight-loss fact from the B-494 safety band.** `weightDuringTrial` gated containment on the tail-clipped coverage range, so the same cat with the same 4.6 → 4.1 kg loss and the same 352/352 refusals rendered *"Weight fell … about 11% of body weight"* if weighed in April and **nothing** if weighed in June. Refusal composed with weight delta is exactly what the round-3 cold read called page 1's blocking finding.
- **The band dated 176 days of refusals inside a 98-day window**, and reported the most recent refusal 79 days early — on the feline hepatic-lipidosis lane, in the one zone the report teaches vets to scan.
- **Appendix C's caption excluded rows in its own table** ("Jan 1 – Apr 22" over a row dated Apr 27) — the cross-check the appendix exists for.
- **The dagger footnote understated its own base rate 2.5×** (10% where the operative rate was 25%), which is the same defect its docstring records a cold read catching once already.
- **The card's C2 standing note and both B9 disclosures vanished** on a trial the card still displayed, because I had gated `loadTrialProteinContext`. My reasoning — "every consumer is a present-tense claim about the pet" — was true of the log-time flag and false of the other three. Those are standing facts about a trial still on screen, and B9 exists precisely so the most-unknown state does not get the least disclosure. Gate reverted; the narrow question filed as **B-595**.

And the one that was a design flaw rather than a miswiring: **the tail clip's `max(targetEnd, lastMealDay)` anchor let ONE datum stand for "the trial ran this long."** It broke in both directions — a 5-of-28-days record followed by ordinary post-trial logging read 60/84 `partially_supports` with `belowCoverageFloor` off and *"all 60 matched"*; and a single meal of the pet's regular food 60 days after a perfect 28-day trial pushed 28/28 `supports` to 28/84 `does_not_support`. Round 1 had already killed the all-*feeding* anchor because a treat did this; switching to meals only narrowed which single datum could.

The anchor is now **the target end, full stop**. "The trial ran this long" has exactly one authority and it is not a log line — it is `target_duration_days`, which §4.3's milestone moves with one tap, which moves it for every reader at once, and which a stray meal cannot trigger. An owner who genuinely runs long without tapping has their *coverage* measured over the window their vet prescribed — the number that motivated the clip in the first place. Everything past the target is still evidence; it is only not coverage.

Round 3 also caught a comment I had written backwards: `trial.ts` claimed `resolveScope` rung 2 *is* gated when it is not. Corrected — the must-rank-identically pairing is the round-1 bug, and a comment describing it backwards is an invitation to "restore" the gate.

## Round 4 — the fix's own cost, one layer up in the claim gate

Round 4 ran against the round-3 state after five platform-outage restarts (529s — every crash was server-side, and the resumed transcript preserved its probes). The prior work **held everywhere it was attacked**: 960 declared-end cases byte-identical to `origin/main`, a 924-case invariant grid with zero violations, 750 paired cases in which no exposure, refusal, oral-route hit or item was ever lost versus main, and B-494's flag firing on both surfaces. Three findings, all report-side:

- **① HIGH — the coverage clip converted a months-long logging blackout into a complete record.** A 56-day trial logged on every prescribed day, never closed, then silent 145 days: main read *"56 of 201 … too sparse to read as a clean elimination"*; the branch read *"56 of 56 … all 56 matched … supports interpreting it"* with `mayStateRecordClean` flipping to true. The reviewer's framing: the clip changes what the report *says*, so the coverage denominator had become an evidence bound through the claim gate. The resolution is deliberately **not** a revert — main's sentence was the false one (there are no gaps in the window, and 56/201-forever is the filed harm) — it is **disclosure**: the C5 logging-density line now spans the **evidence** window, so the blackout renders as a zero back half beside the verdict, with §7.2 already scoped "of the trial window" and `daysPastTarget` in the same block. Complete-over-the-window and silent-since-the-window are two facts; the report states both. The card's counterpart sentence is **B-592, upgraded by this finding from cosmetic to load-bearing.**
- **② MEDIUM-LOW — C5's density was computed over the clipped window**, hiding logging decay on exactly the overrun population B-422 creates (the refusing cat rendered "28 of 28, 28 of 28" where main showed "100 of 100, 81 of 101"). Same fix as ①; the density span is also §5.1's documented overlap range, so the render's "logged overlap range" label became more accurate, not less. The R6 scope-clause test was updated to pin both directions: no clause when the spans coincide, the clause with evidence dates when the window is wider.
- **③ LOW (latent trap) — `SafetyFlag.rangeStartDate/rangeEndDate` carried EVIDENCE dates under a `range*` name** — round 3 fixed the value at that site and kept the name, violating the branch's own naming rule at the exact site it had just fixed. Renamed `evidenceStartDate/evidenceEndDate` through the type, the population, the render and the tests.

Round 4 also priced the grace's margin: **target 28 + 56 lands exactly on ACVIM's ≥12-week floor for the dog·gut cell — zero margin** — recorded on B-593 for Dr. Chen's ruling. Honest gaps the reviewer named: the fresh-seed fuzz ran UTC-only (zone coverage rests on the shipped suites), no state-by-state enumeration of the card's eleven presentations, no end-to-end `generate-signal`/`ask` execution, no on-device pass.

**The merge was taken on the PM's explicit call after round 4's fixes**, with the round-4 fix itself unreviewed by a fifth round — the pattern of four consecutive rounds each breaking the previous fix argues for one, and the PM chose to stop. Mitigations: neither Edge Function is redeployed by this PR (`generate-report` under the B-494/R1 hold, `generate-signal` under B-182's), so the report-side surface where every round-4 finding lives ships to no one until those holds lift — and the redeploy gate includes a fresh `vet-report-cold-read`, which is the natural place the composed blackout disclosure gets a human-shaped read.

## Residuals

- **B-593** — ratify the 56-day grace with Dr. Chen. The accepted cost, stated for the ruling: an *abandoned* trial keeps its widget one-tap row and its three detector suppressions for **eight weeks** past target. Bounded where it used to be unbounded, but eight weeks is the number to push back on.
- **B-592** — the overrun card reads "Meals logged on 56 of 56 days" under a day counter that keeps climbing. Both numbers are right and the pair is unexplained. `TrialRange.closedByOverrun` is computed and exported for it and nothing consumes it yet — undrawn copy on a design-locked card needs a mock round, not invention inside a build PR.
- **B-594** — the report-window anchor, above.
- **B-595** — should the log-time contaminant flag fire on a trial past its effective end? A Designer call about friction at the moment of the event; the fix belongs on `foodContaminantFlag`'s call sites, not on the shared context.
- **Round 5 not run** — the PM's call; recorded above with the mitigations.
