# B-417 PR 7 — the vet-report render, and the first artifact where the report answers its own first question

**Date:** 2026-07-26

Shipped via **#466** (draft). Stacked on **#459** (PR 5, still open) — PR 7 cannot exist without the predicate, so the branch carries both and the PR body says so.

---

## What this PR is actually for

`docs/nyx-vet-report-requirements.md:21` names the report's **first** clinical question: *"Is this diet trial working?"* Step 9 has been designed, built, cold-read, shipped and sent to a real vet **without that question ever having been exercised**, because `diet_trials` held zero rows in production and every trial branch of `report.ts` / `render.ts` was gated on `hasTrial`. §1.2's corollary, verbatim: *"the trial branches of the vet report — the Appendix C caption, the trial tile set, the `diet_trial_working` framing — have never rendered in any artifact `vet-report-cold-read` has ever seen. Changing them re-litigates nothing."*

So this PR is not a content tweak. It is the first time the report's primary use case has a substrate, and the first time anyone has read the result.

## The re-base (§7's first bullet)

`report.ts`'s `confounderFeedings` was the shipped third definition of off-diet: every treat plus every human food, never consulting the trial. Two consequences a vet actually reads:

- it listed the **vet-permitted treat** as a contaminant, at every feeding — §2.1 case 2's alarm-fatigue failure, pointed at the clinician who authorised the treat;
- it **could not see a rival kibble fed as a meal at all**, which is the single commonest way an elimination trial breaks.

And the magnitude: applied to the production account that heuristic reports **~530 off-diet exposures across 645 feedings**, because 82% of logged feedings are treats. No layout rescues 530 exposures.

The set is now `classifyFeeding`'s whenever a trial overlaps the window, and the heuristic is retained **verbatim** otherwise — off the back of a trial it is not a worse definition, it is the only one available, and changing it would re-litigate every monitoring report already cold-read. One definition now spans page 1, the At-a-glance tile, the antigen tally, the protein-over-time chart and Appendix C, asserted by a test that reads all four out of one snapshot.

## What the block renders

A dedicated `Diet trial` section above the symptom trend — §7 rules the report's hierarchy the *opposite* way round from the card's, deliberately (*"the card's job is keeping the owner in the trial; the report's job is letting the vet act"*).

- **C4's two elements:** the medication overlap (drug, span, still-running-at-window-end, overlaps-last-7-days; explicitly **not judged**, because antipruritics are permitted throughout a trial and a 2–3 week prednisolone course is a documented protocol) and the **§7.2 interpretability statement**.
- **§5.1's two facts, never in one sentence.** Coverage is days-with-meals; exposure is all-feedings; a treat-only day is in one and not the other, and 15.7% of live covered days are treat-only — which is exactly why v0.97's welded sentence was false in a common case. The **one overlap range** is rendered explicitly, so a well-logged 8-week trial with a week-4 recheck can never read "27 / 56".
- **The allowed list** with `food_label` provenance, effective dates, per-food counts, and a line when the set changed after `started_at`. Membership is dated, so permitting a treat on day 14 does not rewrite day 5 (tested).
- **D-B's antigen tally** — *"Chicken ×30 (all from an approved food)"*. Without it six dental chews a day reads as a clean elimination to both owner and vet, which is a **stronger** false negative than the `% compliance` mislabel this track replaced, because it arrives with the authority of a two-fact presentation.
- **D-A's standing contamination fact**, **C3's oral-route line** (never a reason to skip a dose), **C5's** symptom-trend-against-logging-density disclosure, and the **owner-reported outcome** rendered as the owner's, with `confirmed` / `diagnosis` / `food allergy` asserted absent near it by test.

## The three exports PR 5 left unconsumed

`interpretabilityStatement`, `antigenTally` and `isWithinChallengeWindow` all now have callers. The third is the one with a trap: its day indices come from `dayIndexOf(ctx, …)` — the owner's local midnight on the report's clock — and never a UTC epoch-day, which is the two-day disagreement B-421 spent a PR deleting. It renders as a **dagger** on an Appendix C row meaning *a symptom was logged inside the species' forward challenge window after this feeding* (dog 14d, cat 7d), with a footnote that says **timing only**, names the source, and states that same-day pairs are deliberately excluded — because same-day admits the nearest-preceding-meal attribution bug through the back door, and this repo shipped that bug once under three ceremonial sign-offs.

## B-455, folded in as instructed

`generate-report/index.ts` never selected `ended_at`. `completed_at` is NULL on an **abandoned** trial, so `buildConcurrentChanges` read the null end as *"open-ended → active through the window end"* and the vet's copy said *"the trial diet (Royal Canin HP) — ongoing since 3 June"* about a diet the cat came off three weeks earlier. Fixed at the reader: the column is selected, `trialEndValue(t)` = `ended_at ?? completed_at`, and the headline is past-tense for a non-active trial. The day phrase for an ended trial became a **span** (*"19 days, of a 42-day window"*) rather than a position, because "day 19 of 42" reads as a trial still 23 days from target.

The `refused` `stopped_reason` also reaches something for the first time: it renders as a clinical finding and **structurally suppresses every adherence figure**, including the split "N matched, M did not" — §4.3, and the round-1b Jordan finding that produced *"All 54 matched the trial diet"* three lines above *"wouldn't eat it"*.

## What the cold read caught, and why it mattered

`vet-report-cold-read` was run against two **rendered** artifacts (`scripts/render-trial-report-sample.ts` emits them): a dog at day 46 of 56 of a hydrolysed skin trial with a mid-trial allowed-list change, and a cat who refused the diet and was stopped at day 19 with a free-fed bowl still down.

Its best finding was not a bug in the sense of a wrong number. **A cat whose owner dutifully put the bowl down twice a day for nineteen days and logged every refusal scores 19-of-19 coverage** — so the coverage-only §7.2 sentence read *"This record covers 19 of 19 days of the trial window and supports interpreting it"* over a trial in which **no elimination ever happened**. A vet skimming that concludes the diet was adequately documented and the result can be read.

§7.2 always specified the statement as derived from *"coverage + exposures + any uncontrolled-access flag"*. Only coverage had been wired. It now carries caveat clauses for refusal, an off-list free-fed bowl, a missing allowed set, and the coverage floor — each one naming a specific reason the **record** cannot carry a trial result, which is the *"uninterpretable, not negative"* distinction §7.2 exists to draw. Also caught: a literal `&mdash;` rendering in a tile, because `tile()` escapes its value.

Both are regression-tested. The lesson worth carrying: **a high coverage number is not evidence of a clean elimination, and the two are easy to conflate precisely because coverage deliberately does not read intake.**

### Round two, and the finding it ranked above everything it replaced

The re-read confirmed the first-round fixes and then found that **one of them had regressed something worse.** The permitted-extra contamination (D-A) had been unioned into the trial food's breach set to get it onto the headline — so it printed in the **trial food's voice**: page 1 said *"The trial food's own label also lists Chicken"* about a clean hydrolysed diet, while Appendix B, billed on the same document as *"the reference record behind every figure on page 1"*, said *"Soy · nothing else on the label."*

Dr. Chen's ranking is the part to keep: *"The old defects made me under-react to a real problem — I'd have continued a void trial. This one makes me act confidently against the wrong target with a named product accusation."* Discard the prescription diet and file a complaint against the manufacturer, where the record says drop the dental chew and continue the diet. **Confident wrong action beats timid wrong action for harm.** It also launders the finding's provenance: *"a vet-approved extra … less likely to be noticed"* is an insight about the vet's own prescribing, and re-voiced as a manufacturer defect that lesson is gone.

The fix is structural, and the shape was already in the file: `freeFed` had always owned its own sentence. `trialProteinBreaches` now returns **three** sets — shape ①, permitted extras, free-fed — and each renders in its own voice. The headline unions all three, which is safe there and only there, because that sentence names the **protein and the pet** and never the food.

Three more from round two:

- **§7.2 named the exposure caveat and left out the medication confound.** §7 says a derm trial is unreadable without it — a steroid course and a successful elimination produce the identical improving curve — and continuous oclacitinib with **zero doses logged** masks the trial's only endpoint. The overlap list stays un-judged (that is right); §7.2 now names it, because §7.2 is the line a reader lifts.
- **Mira's page never composed its own facts.** 34-of-38 refused (trial block), 4.4 → 4.1 kg (a greyed fourth tile), *"Typical intake: Refused"* (Appendix E) and a free-fed bowl (feeding line) — every fact needed, across four sections, never put together, with a **legend entry on the last page** carrying a page-1 clinical fact. Composition is the whole job at minute zero. The Record row now states the weight change **as a percentage of body weight** beside the refusal. Deliberately not a flag and not a threshold — a restatement of adjacent facts in the register the report already uses. B-474 still owns the escalation lane, and Dr. Chen's own read is that deferring the *detector* is defensible while shipping the *page* silent is not, and that clearing it needed no threshold decision.
- **The fix contradicted an uncorrected line.** *"Logging held up across the trial"* (true of the trial's range) sat eight lines from the new *"a fall here may be less logging"* (true of the charted window), with neither stating its scope, and the more assertive one was winning. The trial-scoped claim now names its own scope and the overrun.

Two residuals were argued and **not** changed, with reasons on the PR: the Label-contamination row names one protein because the two sets answer different questions (`trialContamination` asks whether a food lists more than its own front-of-pack claim; Appendix C's stars ask whether a protein is the trial's — and cereal *is* what the chew says it is, and does appear in the antigen tally); and Cooper's bare negative-correlation line is pre-existing with a backlog row that wants the engine's own diagnostics, not a string edit.

## Two rules that got a single home

The affirmative *"all N matched"* sentence has three renderers — the At-a-glance tile, the page-1 record line, and Appendix C's empty row — and the first draft re-derived the gate in each. It held in two of them: Appendix C said *"Every one of the 38 feedings logged in this window matched the trial diet or a permitted food"* on the **refused** cat. There is now one field, `mayStateRecordClean`, folding PR 5's `mayClaimAllMatched` together with the three report-level reasons PR 5 has no way to know about (no allowed set, below the coverage floor, stopped-because-refused). **A rule re-derived in three places is a rule that will hold in two of them** — which is the same structural finding the adversarial pass made on PR 5, arriving one layer up.

`DietSummary.activeTrial` was also renamed to `DietSummary.trial`. The field now covers a trial that ENDED inside the window (§7's day-after-completion AC), so "active" had become a lie on a clinical surface, in a field name read by eighteen call sites.

## Also closed

- **B-423** — `MIN_TRIAL_SCOPE_DAYS = 28` floors the rung-2 window, extending *backwards* so a floored window carries pre-trial baseline. A trial started today no longer collapses the report to a one-day window at the highest-intent moment in the product (the clinic car park). It never widens what counts as the trial: §5.1's range still opens at `max(scope start, trial start)`.
- **B-442** (the day-counter row) — the report's own `Math.max(0, endDayNum - start + 1)` is deleted; `DietSummary.trial` carries no day math at all. `lib/dietTrialDayMath.guard.test.ts` was **inverted** from recording the divergence to forbidding it. The overrun case is fixed too: `day 61 — 5 days past the 56-day window`, never `day 61 of 56`.
- Rung 2 is verified **reachable and floored**: an unsanctioned protein in a captured array fires it; a food whose panel was never read falls to rung 3 and is still recorded, because an empty array is silence and never an all-clear.

## Filed, not fixed

- **B-473** — the block has no Designer/Dr. Chen pass **as shipped**. The C4 mock round rendered only the two variants the PM chose between; the antigen line, the "Also during the trial" group, the four §7.2 caveats and the medication framing have no mock, and the block is now the longest thing on page 1.
- **B-472** — seven duplicate backlog IDs (`B-432/441/442/443/463/464/465`). Found because the guard test cited "B-442" and there are two unrelated B-442 rows.
- **B-463 stays open and §12's tappable-reason criterion stays unmet** — `explainVerdict` still has zero callers; its destination is B-458, the exposures list screen deferred out of PR 4.

## One deliberate deviation from the spec

§7 calls the medication overlap *"re-siting, not addition"*. It is **split**, not moved wholesale: the overlap *framing* moves into the trial block, and per-regimen **adherence** (doses given / missed / refused / unconfirmed) stays in the page-1 medication column. Dropping adherence from page 1 of every trial report would be a regression, and neither line restates the other. A Tier-2 §7 wording edit is **proposed, not written**.

## Gates

`vet-report-cold-read` (mandatory) run on rendered artifacts, twice — two findings, both fixed and regression-tested. `tsc --noEmit` clean · **jest 131 suites / 2312 tests** · **`deno test` 936 cases** over `supabase/functions/`.

## Deploy gate

**Do not deploy `generate-report` until the PR 4 client renderer has landed on `main`** (§11, the B-182 lesson). PR 7 changes the Edge Function's output; the client that renders it ships in #454.
