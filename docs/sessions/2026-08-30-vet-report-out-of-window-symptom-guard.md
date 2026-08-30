# 2026-08-30 — CUL-62 / B-613: the out-of-window symptom guard names the sign, and fires on a preset trial crop

**Mode:** BUILD · **Branch:** `claude/vet-report-symptom-guard-ihc47m` · **Outcome:** shipped via #772 (draft)

## What the issue asked for

Two halves, both ranked top of the non-blocking list by `vet-report-cold-read` rounds 14 **and** 15:

1. The §6 cherry-pick guard said *"5 symptom events fall outside this window (most recent May 28)"* and never what the event **was** — the type is read one line above the counter and was thrown away. On a completed elimination whose window closes eleven days early, that is the difference between "the trial held to the end" and "she relapsed in the final week".
2. The guard was gated on `isCustomOverride`. But `since_visit` truncates a long trial **by construction** — it is the second report of every trial, the one sent at or after a recheck — and there the trial block said *"42 trial days fall before it, outside this report's window"* and nothing said what was logged in them.

## The shape decision (PM-approved before coding)

Two placements were possible and they are not interchangeable:

- **(A)** extend the page-1 cherry-pick box to fire on preset bases. Its lead is *"**Custom range.**"* and its tail *"shown so nothing is cropped to a good week"* — an accusation of cherry-picking aimed at an owner over a window **the app chose**.
- **(B, taken)** a clause on the trial block's own truncation sentence, in a completeness register rather than an accusatory one, landing in the sentence a reader already uses to calibrate every number below it.

A structural fact decided it: `since_visit` / `diet_trial` / `fallback_90d` all end **today**, so a preset window can only crop a trial at the **head**. Only a custom window crops the tail. The "relapse in the final days" case is therefore half 1 (page 1, needs the type); the preset case is head-crop — calibration, not alarm.

One premise in the issue was **corrected rather than silently fixed**: the legend already scoped itself to *"A **custom (hand-picked)** window…"*, so it was not over-advertising. The substantive half of (2) stood regardless.

## What shipped

- `ScopeInfo.outOfWindowMostRecentType` — the type, captured in the **same branch** as the instant so the pair can never describe two different events.
- `ScopeInfo.trialCropSymptoms` — symptom events inside the **trial's elapsed span** and outside the report window, on any basis. Bounded by the trial, never by all history: outside the trial is outside the block's subject.
- `TrialBlock.elapsedStart/EndDayIndex` — the trial's own span, published from where `ctx.startDayIndex` lives rather than letting a consumer rebuild it as `scope.startDayNum - before` (valid only while `before > 0` — the seam mistake rounds 2/3/4 paid for three times). Deliberately **neither** an evidence nor a coverage bound.
- `computeLookbackIso` gains a third term stretching the event pull to the report trial's start, capped at 400 d before the window start, calling `selectReportTrial` — the one predicate, not a second copy. `ReportInput.eventsSinceIso` tells assembly how far the pull reached; short **or unknown** renders "at least N".
- Out-of-window dates carry a year when it is not the window's (CUL-69) — this date is out-of-window by definition and now bounded only by a pull that can reach 400 days back. Safe as a conditional stamp **only** because each clause holds exactly one date.

**Present-only, by rule and not by default:** a zero renders nothing. The cropped days are typically days the owner was not yet logging, so *"no symptom events were logged"* there converts "we hold no record" into "nothing happened" on the span the report has just admitted it cannot see — the diet-trial G2 rule and B-494 in one move.

## The two reviews, and what they cost

Both DoD-mandated reviews **failed the first cut**, and both failures were in material added *after* the core change worked.

**`vet-report-cold-read` (round 16) — BLOCKING: the count had no denominator.** Sharper than an omission: the report's own legend promises *"a count is never read without knowing how long and how completely it was tracked"*, so a count without one was a **contradiction**, and — in Dr. Chen's words — being told the rule and then denied it *"stopped me looking for the qualifier"*.

The fix added a density sentence and a type tally. Then:

**`adversarial-reviewer` — FAIL, on the density sentence.** Its counterexample: a cat whose 42 cropped trial days hold **42 refusals of the prescribed diet, 42 off-diet feedings and 5 vomits**, with `safetyFlags: []`. All of the refusals and feedings are invisible on the page (the block's exposure counts are window-scoped, appendix C too, and the refusal lane's evidence window is the report's). Adding *"Meals were logged on 42 of those 42 days"* beside a symptoms-only enumeration, under a legend saying the section *"names what was logged"*, told the reader the hole was **filled**. Before the change that record said only "42 trial days fall before it"; after it, it reassured.

> **A completeness ratio next to a partial enumeration is a claim about the enumeration, whatever it is a ratio of.**

Second blocking finding, reached **independently by both reviewers**: the crop counted any `type === 'meal'` while `computeTrialFacts`' coverage excludes treats — and `lib/dietTrial.ts` states in place that *"on live data 82% of feedings are treats, so a 'days with food logged' count is clearable entirely by treat data"*. Two conventions, the same words, twelve words apart, diverging toward "well tracked", on the larger half of the trial.

**Resolution:**
- the density sentence now renders **only the un-logged days** (*"No meal is logged on 34 of those 42 days."*) and nothing when the crop is fully logged, so no completeness ratio can ever appear and the sentence can only move a reader toward doubt;
- the legend names the scope outright — symptom events only, *"feedings, doses and intake in those days are counted nowhere on this report"*;
- the crop predicate filters treats, so the two sentences in the row are one scale;
- and the coverage fact is **ungated** from the symptom count and from `countIsFloor` (Dr. Chen: gating it rendered "42 days nobody logged" and "42 days logged and genuinely quiet" identically, as nothing — and suppressing a coverage fact is the reassuring direction).

## Mutation-proving found three guards that did not discriminate

CUL-613 says prove a guard by breaking the source, not by reading the test. Sixteen mutations; three passed green over their own defect:

1. **The type guard set the field on a snapshot fixture**, so it tested the renderer and was blind to assembly dropping the type — the exact defect B-613 exists for. Fixed by a guard that starts where the fact does.
2. **The pull-widening differential passed vacuously** for the weight and dose lanes, because the fixture carried no weigh-ins or doses. Enriching it established that `medicationHistory` **is** genuinely pull-sensitive and is insulated in production only by the separate untrimmed `lifetimeDoses` array — now asserted over the whole snapshot rather than assumed, so a new pull-sensitive field fails there instead of riding along.
3. **The tally-order guard's fixture happened to insert in sorted order**, so a tally sorted by `() => 0` passed it.

One more thing the sweep produced: a "safety net" intersection on the meal-day set that was **provably redundant** (`inWindow` is day-granular over the same `eventDayNumber` the loop computes). Dead code that reads as a safety net is worse than none — it tells the next reader there is a case it handles — so it was deleted and the boundary it appeared to cover is pinned by test instead.

## Round 3 — the re-attack

The corrected version went back to `adversarial-reviewer`, which confirmed **both blocking findings closed and surviving every counterexample it could build** — the refusing-cat crop no longer carries a completeness ratio and the clause stands without the legend; the treat filter fires; the floor predicate, span identity, page-1/clause agreement, year stamping and the pull-widening containment all held across UTC+14 / −10 / +12:45. It returned five residuals; three are closed here.

**The one running toward reassurance, and it is a language trap worth remembering.** A `type === 'meal'` row whose joined child did not hydrate arrives with `meal: null` (`index.ts` maps `event_type === 'meal' && meal ? … : null`). The predicate was `e.meal?.foodType !== 'treat'` — and `undefined !== 'treat'` is **true**, so every such day scored as *tracked* and silenced the un-logged sentence entirely. The window side already drops those rows, so the two predicates disagreed in **opposite directions**: the window under-counts *tracked* days (safe), this under-counted *un-logged* days (renders a better-tracked record than the report holds). `e.meal && e.meal.foodType !== 'treat'` closes it.

> An optional chain turns a missing value into a passing test. On a predicate whose two outcomes are "safe" and "reassuring", `?.` picks reassuring.

**And one the previous closure created — the third time in this session.** The legend was amended to describe the new un-logged line while keeping two clauses that line falsifies: *"feedings, doses and intake in them are counted nowhere on this report"* and *"neither reports an absence"*, twelve lines above a sentence that reports an absence of meal logs derived from feedings. The denial is now narrowed to what the G2 rule actually protects (*"Neither disclosure reports an absence of symptoms"*) and the scope clause names what is genuinely uncounted (*"what those meals were — the foods, the doses, the intake"*).

Also closed: a one-day crop printed *"1 of those 1 days"*; and the sentence is now phrased as a fact about **this report** (*"This report holds no meal log for…"*), in one form rather than branching on `countIsFloor` — under a short pull *"no meal is logged"* is a claim about the owner's record this document cannot support, while *"holds no log"* is true either way.

**One residual recorded rather than closed:** the sentence is not literally incapable of reassuring — *"1 of those 42 days"* conveys the other 41 — and a denominator that hid its complement would not be a denominator. The in-code comment now says so instead of over-claiming; what bounds it is the noun (meal logs) plus the legend's scope.

## What generalises

- **The deletion held; the additions and their seams did not.** The core change (name the type, count the crop, bound it by the trial) survived every attack. Both blocking findings were in material added to satisfy the *previous* review. This is the pattern the taxonomy §9a row records, arriving again.
- **A guard that has only ever been green has not been tested** — and three of sixteen here were written by someone who knew exactly what the defect was and still missed it.
- **On a safety surface, re-run the falsification pass after every correction**, not once at the end. Every round after the first was caused by the previous round's fix — including the legend contradiction, which was introduced by the closure that described the new line. The third pass was the first to return no new blocking finding.
- **An optional chain turns a missing value into a passing test.** On a predicate whose two outcomes are "safe" and "reassuring", `?.` picks reassuring — and here it did so on the exact sentence added to prevent reassurance.

## Out of scope, filed rather than folded in

- **CUL-746** — page 1 scores the **prescribed** trial diet as an off-diet breach when allowed-list membership starts after the trial did (`7 / 8` "not matched to the trial diet", contradicting its own appendix C). The dated-membership precedence exists in the appendix and was never applied to page 1; and the *alarming* tile branch carries no dates while the *reassuring* one was already fixed to.
- **CUL-747** — the sparsity brake is one-sided: it withholds "clean" at 11/31 coverage and publishes "dirty" at 8/28. G2's two-sidedness applied to the reassuring direction only.
- **CUL-748** — four page-1 render/copy defects (the At-a-glance "trial's own range" aside, the antigen sentence firing over the trial diet, the `'the logged observations'` headline fallback, the partial-week nub rendered as a measured zero) plus three minor.
- **CUL-749** — refusals and off-diet feedings in the cropped trial days are invisible everywhere on the page. The gap the adversarial counterexample exposed; the report is now *honest* about it and still does not fill it. Carries the scoping options and wants a Dr. Chen ruling.
- **CUL-750** — the C5 logging-density series (`mealLoggedDayIndices`) counts treats *and* unhydrated meal rows, so *"Days a meal was logged"* can disagree with both coverage sentences beside it, in the reassuring direction. Pre-existing; this change's own sentence is on the correct side of it.

## Deploy

`generate-report` re-fingerprinted in the deploy ledger with the reason. **Status stays `hold` — B-494 / CUL-19 unchanged, and this re-acknowledgment is not progress toward clearing it.**
