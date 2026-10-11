# Reintroduction discovery: the research, five isolated reads, mock round 1 and the decision round (CUL-1770 / CUL-1808)

**Date:** 2026-10-11
**One thing:** T2 L1 — The sync queue: last write wins, so a value on a shared row can be erased by a phone that never saw it · check: pending

**Outcome:** shipped via #1183 (docs only: the frozen research brief, its index row, mock round 1, this record). No app code, no schema, no deploys. The decision round is [CUL-1821](https://linear.app/projectnyx/issue/CUL-1821) on `Waiting on PM`; the spec ([CUL-1770](https://linear.app/projectnyx/issue/CUL-1770)) follows the rulings.

## The ask

The PM: "Our most recent competitive landscape run found a gap with pet owners expecting a diet trial reintroduction phase … kick off a research and discovery project that will help us lay the foundation for this type of feature." DISCOVERY mode. The October competitive pass ([CUL-1762](https://linear.app/projectnyx/issue/CUL-1762)) had found PawTrial, ThePawcess and every human elimination app guiding the second half of an elimination diet; Culprit ships only the first. CUL-1770's definition of done is a spec, so the PR names a sub-issue, [CUL-1808](https://linear.app/projectnyx/issue/CUL-1808).

## What was done

1. **Seven research lanes plus an independent verifier** (skin challenge science; gut, cats and handouts; owners and practice; pet rivals; human apps; our product at file:line; the engine and its statistics). The verifier re-fetched every load-bearing source and rebuilt the CAT(9) curves from the supplementary spreadsheets with its own script. Result: `docs/research/2026-10-diet-trial-reintroduction-landscape.md` (frozen), and its row in `docs/research/README.md`.
2. **Five isolated persona reads on one shared brief**, run in parallel, none seeing the others: Jordan; Sam; Dr. Chen with the Data Scientist; the Designer with Motion & IA and the chart standard; Engineering with QA, the Product Owner and Trust & Safety. All five returned **BUILD WITH CONDITIONS**.
3. **Mock round 1**: `docs/culprit-trial-reintroduction-mockups.html`, published at https://claude.ai/artifact/44jrqZ6EKvjz15BuhJN3h2 (private). Fourteen sections on a calendar-checked five-pet fixture (Rex, Bear, Luna, Mochi, Pixel): today's misrender, the recheck question, staying on, setup, the window, the stop and settling, the quiet end, results and the report's phase block, the cat switched back to eat and the gut dog, Home and the household card, the revised rules, the decision round, team calls and the build plan. Every visual decision is drawn side by side.
4. **One decision round** ([CUL-1821](https://linear.app/projectnyx/issue/CUL-1821)), eleven calls in four lines each, plus the Tier-2 edits to ratify.

## What the research found

- **Three events, not one.** The skin provocation (the old diet back for up to 14 days; flare, then a second remission) is "the sole means of confirming" food allergy (AAHA 2023). For the gut, response alone confirms the phenotype and going back is a transition after 12 weeks (ACVIM 2026); dogs with protein-losing enteropathy stay on the diet. Staying on is a complete outcome.
- **Improving is not the diagnosis**: about a third of improved dogs and half of improved cats did not relapse on challenge.
- **Timing**: 14 days for both species. The cat's 7-day figure rests on Scott & Miller 2013, whose cohort was selected on relapse (Dr. Chen's re-analysis); every study that visibly watched past day 7 found 9 to 43% of flares later.
- **Open challenges over-call**: in the only placebo-controlled study, 6 of 12 food-allergic dogs met relapse criteria on placebo.
- **Uptake**: "only 10% re-challenge" is 8 of 77 respondents in one pre-referral survey, where only 33% recalled the vet raising it.
- **Our product**: a vet-ordered provocation reaches the vet as owner non-adherence ("28 / 30 · Feedings not matched to the trial diet … supports interpreting that window"), and the food correlation lane can print the vet's own experiment back at the Established tier with a p-value.

## What the reads changed

- **Hosting**: Engineering and the Data Scientist independently recommend completing the elimination at the recheck and hanging the windows off the ended trial, instead of the brief's open row with a phase flag. The open row cannot serve an owner who already tapped *This trial is done*, puts new columns in the full-row-upsert clobber path (migration 069, CUL-1044), needs a second outcome writer against a guard the code calls a clinical rule, and breaks at target + 56 days. `diet_trials.pet_id` is mutable today, a live CUL-899 brick for every child row; the schema PR closes it.
- **The vet's plan first** (Designer): the shipped action-first rule; never gated on *Better*; one component in two hosts. **Nothing final the night before** (Jordan): the milestone holds when a recheck is booked within a day.
- **The comparison sentence is dropped** (Data Scientist): the shipped C-test models Poisson counts while symptom days are capped at one a day, false gates run 3.7 to 7.8% once flare days cluster, and power for a mild flare is 6 to 27%.
- **An emergency branch** (Dr. Chen): facial swelling, hives, breathing trouble or collapse is a vet now, not "go back and tell your vet".
- **The cat switched back to eat is its own kind** (Sam, Dr. Chen, Designer, Trust & Safety): never a window.
- **Owner words** (Jordan, the Designer): symptoms, never challenge, provocation, reintroduction or test; "two weeks, or until the itching's back", never "up to".

## Persona conflicts surfaced (no recommendation; in CUL-1821)

D1 what v1 builds for a gut trial (Jordan vs Dr. Chen and the Designer, Sam between); D2b storing the owner's first-seen day (Dr. Chen and the Designer vs Engineering); D5a the settling grid (Designer vs Data); D5b daily-look words on the owner grid (Sam vs Dr. Chen and Data); D6a/b the report's quiet sentence (Dr. Chen vs Data, twice); D7b a symptom line on Home (Jordan vs the Designer, Dr. Chen and Data); D8 raising "does {pet} need this diet for life?" (three ways); D10 the household card's timing (Jordan and Sam vs Trust & Safety).

## Falsification attempts, and how each held

- **The verifier** confirmed the CAT(9) numbers and found the re-analysis overstated for cats, Sofou 2026's scope narrower than claimed (p = 0.5 does not reproduce), and FoodMaestro's funnel misread. All folded into the brief.
- **Dr. Chen and Data** broke three evidence claims (the Scott selection, the wrong exact test, the owner-rating "12 of 13" being a component of its own reference standard) and the brief's quiet sentence (a claim about the world, addressed to the wrong reader).
- **The Designer's counterexamples**: the quiet grid on day 14 beside the owner's read over a Cytopoint injection (fixed: no grid at the end question); *Ended* at the recheck erasing the window (fixed: the after-visit row hosts the question); "three more days" under a 79% bar (fixed, pending D7a).
- **Sam's**: a two-cat quiet fortnight where Juniper ate Pixel's challenge food; every R5 rule passed and the quiet sentence printed (fixed: no quiet sentence in a multi-pet home in v1, and logged is not eaten, both on the clinical sheet).
- **Jordan's**: the night before a recheck, then a gut plan with nowhere to go (fixed by the hold; the gut half is D1).
- **Engineering's**: path B (completed before the recheck) and an old build in the same household (both fixed by the recommended host).

## Filed and commented

Filed: [CUL-1811](https://linear.app/projectnyx/issue/CUL-1811) (the report's derived previous diet), [CUL-1812](https://linear.app/projectnyx/issue/CUL-1812) (three frozen briefs' corrections), [CUL-1813](https://linear.app/projectnyx/issue/CUL-1813) (rename the dagger's window constant; the cat value), [CUL-1814](https://linear.app/projectnyx/issue/CUL-1814) (per-drug masking has no open ruling), [CUL-1815](https://linear.app/projectnyx/issue/CUL-1815) (baseline-only foods look guilty), [CUL-1816](https://linear.app/projectnyx/issue/CUL-1816) (`allowed_until` is never written), [CUL-1817](https://linear.app/projectnyx/issue/CUL-1817) (stale comments), [CUL-1820](https://linear.app/projectnyx/issue/CUL-1820) (no minimum-version gate), [CUL-1821](https://linear.app/projectnyx/issue/CUL-1821) (the decision round). Commented: [CUL-297](https://linear.app/projectnyx/issue/CUL-297), [CUL-1083](https://linear.app/projectnyx/issue/CUL-1083), [CUL-1340](https://linear.app/projectnyx/issue/CUL-1340), [CUL-1768](https://linear.app/projectnyx/issue/CUL-1768).

## Residuals

- **No Linear project yet**, on the Product Owner's advice: create it after D1, D2 and D11 are ruled, so the board doesn't become a second roadmap. The proposed milestones and run order are in mock §14.
- **The mock's copy is a draft** for nyx-voice and Dr. Chen. The report's phase block needs `vet-report-cold-read` on rendered fixtures before PR-6.
- **Evidence gaps**: owner voice is cat-heavy and 2014–2024 (Reddit and Facebook were blocked); no gut time-to-relapse data exists; no rival app was installed (CUL-1768 D8, CUL-1777).
- **[CUL-1780](https://linear.app/projectnyx/issue/CUL-1780) should land before the 1.2.0 cut**; it is In Progress elsewhere.
- **The mock generator lives only in this session's scratchpad**, following the trial screen mock's precedent; the committed HTML is the source of truth for round 2.
