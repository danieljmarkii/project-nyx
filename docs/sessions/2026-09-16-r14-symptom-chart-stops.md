# R-14 — the trend chart marks stops, and two reviewers turned the first cut down

**Date:** 2026-09-16

Shipped via #862 (draft). Session S5 of the re-cut run order on **Vet report — the v15 cold-read remediation**, wave B, landing after R-11 (CUL-993) as its comment required — this extends R-11's relocated legend and dated start labels rather than re-placing them. Carries CUL-291. `generate-report` is **not** deployed by the merge; the ledger is re-acknowledged `pending`, riding the Codespace deploy R-1, R-2, R-5, R-11 and R-16 already owe.

## The complaint

The chart drew a dashed vertical where a diet, medication or supplement **started** and nothing where one stopped. So the reading a clinician actually asks the chart for — a steroid coming off as the flares fell, which is the strongest argument the record holds for a diet working — was undrawable, while *Reading the trend* counted that same withdrawal as a change in prose eight lines below. On the `clean` fixture a chicken-bearing treat entered the trial's allowed list on Jun 8 and was fed 25 times, with no marker at all and a count that said two changes.

`ConcurrentChange` already carried `endInWindow`; `changeTiming` already rendered stops. Only the chart never got them.

## What the build did

**One predicate, three surfaces.** `isWindowChange` is what the chart draws from, what the marker legend gates on, and what the count switches on. Inverting it alone reds fifteen tests across all three (C-4). Its complement is exactly the standing set, so `readingTheTrend` splits on one call rather than two filters kept each other's negation by hand.

**`endBucketIndex`, derived where `bucketIndex` is.** The chart needs a bucket and `endInWindow` is a date. Re-deriving the bucket in the renderer off `bucketStartDates` would be a second answer to a question the report has already answered — equal until one of them is edited. Same `bucketIndexOfDay` closure, same call.

**The allowed-list addition.** A `diet_allowed` kind, one per `diet_trial_foods` row opening strictly after the trial's `started_at`. That gate is load-bearing rather than a nicety: `startDietTrial` writes `allowed_from = started_at` on the primary diet, so without it every trial draws a duplicate marker on its own start week.

## Both reviewers returned FAIL, and they were right

`adversarial-reviewer` and `vet-report-cold-read` ran on the first cut. Six findings. Two of them meant the change did not deliver its own purpose.

**A stop manufactured from logging silence.** An ad-hoc course has no regimen row, so its span ends at `UnlinkedMedicationGroup.lastDate` — the last dose *in the record*. An owner who keeps giving a drug and stops logging it produces exactly the value an owner who stopped it produces. The first cut drew `med stop · May 20` over that, in the most-read element on the page, while §4.4's lifetime table printed the opposite over the same dose rows under a caption reading *"a course shown with no end date is one whose end the owner never recorded — **not one still under way**"*. That table's H1 invariant exists so that no code path prints an ending the owner never made. This was that path, and it is the direction of error that ends a treatment early.

The honest attribution, which the reviewer made itself: the *prose* "stopped May 20" pre-existed on `main`. What R-14 added was the glyph — promoting a latent prose looseness into the report's most-read visual claim. `endIsDeclared` now records whether the **source column** is an owner action; `drawsStopMark` gates the glyph; `changeTiming` reads "last dose logged" where it is false.

**The glyph was invisible exactly where it mattered.** Markers were emitted before the bars and `--bar` is near-black, so any rule crossing a column was painted out. The cold read measured the prednisolone stop as a ~3px stub and could not find it on the chart at all — it read the fact off the legend instead. And it is worst by construction: an intervention starts in the week with the most events, because that is why it was started. Markers now paint last and invert to paper-on-ink over the bar, which costs no colour (§5.8) and is the highest-contrast pair a photocopy has.

**A permission spoken as an exposure.** `diet added` read as a second diet being introduced; a bare date under a sentence whose only verbs are *started* and *stopped* read as the food starting — which page 1 of the same report refutes (*"1 was fed before that food was permitted"*). Saying "started" over a permission row manufactures a food challenge with a negative result over zero feedings, which a vet can rationally read as "those were fine, keep them". The face is `permitted`, the note says "(permitted from Jun 8)", the legend attaches the verb.

**And four more.** Labels overprinted into `med start · Jundiet added · Jun 8` on the clean fixture — garbled text on a clinical figure, which the cold read called disqualifying on its own. A week whose stop preceded its start described its rules backwards, on a branch no fixture exercised. A label stated fewer marks than the week held (four stops on three days said three) — CUL-982 item 4's own defect reproduced on the new lane. And the caution's rationale *"— they overlap in time"*, true of the whole window while the chart drew only starts, is false after a withdrawal: the stop marker's entire purpose is to carve out that stretch, and the sentence's own justification told a sharp reader the prohibition lapsed there. One caveat now fires beside a drawn stop, refusing an attribution rather than making one.

## Two things caught in the fix itself

The adversarial pass found a **C-4 duplication inside the C-4 fix**: `buildConcurrentChanges` re-derived "did this row open after the trial started?" with a bare `dayNumber` comparison while `trial.ts`'s `openedAfter` already answers it and already ships as `TrialPermittedFood.addedAfterStart`. Exactly the duplication `isWindowChange`'s own docstring argues against. Now imported.

And the test helper matched `<line class="([a-z]+)"`, which cannot see `class="mark on"` — so every absence assertion in the new suite would have been **green over a real leak**. Found by a mutation, not by reading.

## Measured, not argued

- 1708/1708 Edge Function tests; `tsc --noEmit` clean; 22/22 guard suites after the ledger acknowledgement; stable under UTC+14 / +12:45 / −10.
- Thirteen new tests, every one proven by mutation — including the absence assertions, where a mutation that draws a stop unconditionally reds four of them.
- One mutation **survived** the first round: flipping the ad-hoc call site to "declared" left 667 green, because the guard was on the renderer given a flag rather than on the source that sets it. The reviewer's original finding was still open under a fix that looked complete. Both directions are now red.
- The adversarial pass's own measurement worth keeping: 539 stops swept across 18 window lengths found 0 clamped buckets, and it proved the clamp inert rather than arguing it.

## Decisions deferred rather than guessed

**The count's unit (CUL-1027).** *Reading the trend* counts interventions; the chart draws transitions. The sets agree — that is what `isWindowChange` bought — but a vet counting marks can get 4 where the sentence says 2. The two reviewers proposed **opposite** fixes, and both have a real cost: counting events breaks C-3 (the number would stop describing the enumeration it introduces), and renaming to "interventions" is wrong for a permitted treat, the fifth kind this PR adds. Nothing on the page is false and the legend already bridges them, so it went to a decision brief.

**A withdrawn permit from the trial's *original* set (CUL-1018)** needs a ruling on whether that is distinct from the trial ending.

## Filed, not folded in

| | |
|---|---|
| CUL-1017 | The chart's `aria-label` names no marker — starts included. Pre-existing, widened here. |
| CUL-1018 | A permit withdrawn from the trial's original allowed set draws nothing. |
| CUL-1026 | A never-fed permitted food renders identically to an untallied one (`× N` only when `N > 0`). |
| CUL-1027 | The count's unit vs the chart's. |
| CUL-1028 | The unobserved-week ghost bar fails the same 1-bit fax test the stop glyph did — and B-532's whole point is that "not logged" must never read as a measured zero. |
| CUL-1029 | The halves arrow invites a comparison across unequal denominators. |

CUL-860 (splitting the trend halves at the intervention date) stays out of scope by the issue's own §6.

## The lesson worth carrying

Three of the six blocking findings share one shape: **a channel that carries a distinction in the renderer, and loses it in the artifact.** The dotted rule that vanished in a fax while the dashed one survived. The marker painted out by a bar. The label that overprinted its neighbour. None was visible from the code, from the tests, or from a greyscale render — all three needed the page rasterised and then degraded. The report's stated bar is a photocopy, and greyscale-proofing does not test for it.

The fourth, `endIsDeclared`, is a different shape and the more dangerous one: **the glyph could not hedge.** Prose had been carrying an overstatement quietly for months ("stopped" over a logging fact), and drawing it is what made it a claim. A visual element has no room for "as far as the record shows", so promoting a fact to a glyph is a decision about whether the fact is certain enough to be stated flatly.
