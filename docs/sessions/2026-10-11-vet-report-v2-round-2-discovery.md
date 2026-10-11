# Vet report v2, round 2: code writes the words, the record draws the story (CUL-1859)

**Date:** 2026-10-11
**One thing (re-ask):** P2 L1 — Reversibility: one-way and two-way doors (asked again on today's B1: is letting a model write page-one words a one-way or a two-way door, and why?) · check: pending
**One thing:** P6 L1 — Deciding to decide: an open question past its third session is a cost (the emerging-signals question, open since June, left Nyx's 19-of-20 treat pattern unprintable either way) · check: pending

DISCOVERY session on [CUL-1859](https://linear.app/projectnyx/issue/CUL-1859), filed this session at the PM's direction (the exploration started from a chat prompt). No app or Edge Function code. Shipped via #1191, which names only its sub-issue [CUL-1862](https://linear.app/projectnyx/issue/CUL-1862) so the decision briefs stay open on the parent. Branch `claude/vet-report-redesign-ai-jddjxu`. The PR carries round 1's three commits from draft #815 (merge `77ea704`), which it supersedes; the squash message must drop that commit list so [CUL-847](https://linear.app/projectnyx/issue/CUL-847) does not close with its briefs unruled.

## The ask

The PM, by voice (transcription kept, bracketed where it misheard):

> our vet report is not AI generated, which I think there may be some merits of that, but I think a sort of templated vet report has its downsides as well. I'm wondering if there's a sort of best of both world situation report that can be generated via AI, but also has … guard rail that already exist … the PDF when I printed it last printed it pretty funky I feel like some of the edges were clipped … the vet report right now is just so … wordy … there's really two consumers of this report like one is the vet themselves and the other one is like a [vet] tech or maybe front desk persona … let this data tell the story … some sort of stacked graph … food intake … overlaid with [vomit] incidents or … a medication window … lead with the data graph heavy … LLMs are going to start to be consumers of this … the appendix is just this … exhaustive list of raw data.

## The answers

1. **AI and the guardrails: code writes the clinical words; AI reads them.** The audit inventoried 81 rules with file and line; a deterministic checker over AI prose reliably enforces 9, and the 3 it cannot catch are the report's founding hazards (a trial read as clean, cause implied by order, a refusal read as preference). Every in-house precedent already moved off model text on clinical surfaces ([CUL-1630](https://linear.app/projectnyx/issue/CUL-1630)). Eight of ten isolated reads ranked "no AI-written clinical words" first. AI's jobs instead: a standing round-trip test that reads every report change the way a clinic's AI will, offline pattern-finding that ships as rules, and help with the owner's own attributed note. The narrowest AI option (S4 ordering, then a closed-grammar S2) is drawn and costed, not recommended.
2. **Wordiness: one record strip carries what the sentences carried.** Page 1 today: 1,736 words (dog) and 871 (cat) over 2 to 4 sheets. The proposal: 420 and 336 words on one sheet each, plus a 552-word sheet 2 of self-contained lines. The first draw was about 365 and 308; the reviews added back about 55 and 28 words, each one a guard they showed was missing. One date axis, three bands in a fixed order (care given, signs, food taken in), unlogged days hatched, interventions as hairlines, a safety event as a heavy rule, and a few deterministic sentences on top, because text beat graphs for choosing an action.
3. **Two readers: a filing strip on every sheet and an email that names the flag.** Patient first, page X of Y, the stamp space where the QR was; the subject line is a fixed template, never AI, because it is the urgency rating.
4. **Machine readers: a number travels with its scope only when every copy of it carries the scope.** A simulated clinic summarizer kept 34% of today's honesty clauses intact; 43% kept the number and lost the scope; 5 were distorted ("adherence not tracked" became "on Apoquel 16 mg SID"). On the redesign's first draw: 46% kept, 39% number only, none distorted.
5. **The print clip:** expo-print hands UIKit a zero-inset page and WebKit consumes the CSS `@page` margin as a layout shrink, so the phone's PDF reaches the paper edge; a browser print of the same HTML keeps 11 mm. Filed as [CUL-1864](https://linear.app/projectnyx/issue/CUL-1864); one phone PDF decides between its two fixes.

## How the round was run

- **Wave 1, evidence.** Three isolated research sweeps, frozen in `docs/research/`: AI-written clinical documents and guardrail architectures (`2026-10-vet-report-ai-written-report.md`), machine readers (`2026-10-vet-report-machine-readers.md`), overlaid timelines (`2026-10-vet-report-overlaid-timelines.md`). Two read-only audits of `generate-report` at `ed29788`, rendered from the repo's own Deno fixtures under Node type stripping (Deno is not installed here): the guardrail map and the render, print and text-layer audit (`2026-10-vet-report-guardrail-map.md`, parts 1 and 2).
- **Wave 2, readers.** A blind round trip on today's report: two fixtures (the diet-trial dog, the safety cat), their PDF text layers handed to one isolated summarizer per fixture prompted as clinic software in three styles, scored by an isolated judge on 33 scope clauses (KEPT 34%, NUMBER ONLY 43%, DROPPED 17% of which 11 of 17 moot, DISTORTED 5%; the dog fared far worse than the cat). Ten isolated interviews on five AI strawmen (S0 to S4), the machine-reader layer (M0 to M4) and the stacked graph: Dr. Chen, the skeptical GP, the criticalist, the vet tech, the Data Scientist, Trust & Safety, Engineering, the Designer, Jordan, Sam.
- **Wave 3, the proposal.** Mock round 2 on the round-1 URL as one proposal (round 1's B and D directions leave the page; A becomes the first step toward C). The redesigned sheets were printed to Letter PDF and put through the same blind round trip with today's appendices appended. Then a cold read of the final sheets and one adversarial pass on the strip's rules (pass 1 of at most 2).

## Results of the re-test and the reviews

**The second round trip** (`docs/research/2026-10-vet-report-round-trip.md`). Same prompts, same rubric with round 1's scores removed, a blind judge, on the redesign's first draw plus today's appendices. KEPT 34% → 46% of 99 cells (moot-adjusted 39% → 52%), NUMBER ONLY 43% → 39%, DISTORTED 5 → 0, high-weight clauses kept about half → 81%. What it taught, now rules: a scope travels only when every copy of a fact carries it (0 of 12 where sheet 1 scoped one of two copies); coverage in brackets is pruned, so it is written as the denominator; scopes only in the appendices never travel; sheet 2 is quoted (its one incomplete line reappeared in two summaries) but its scopes appeared in none, so it must be exact and cannot rescue sheet 1. Still lost in both rounds: the null food-association result, with the owner's "flare after the chicken on Sunday" promoted in its place. The revised sheets quote the owner's words as unverified and keep the result and its limit in one sentence; a third round trip on them is the first check of the standing test (B5).

**The cold read** (`vet-report-cold-read`, Dr. Chen's chair, on the first draw): NOT READY on all three sheets, each one or two lines from ready. It caught: a "food test found no food association" sentence that read as "chicken is tolerated" beside the itching and contradicted "no food could be isolated" on the cat; "the record starts May 21" when 28 meals were logged May 4 to 17; daily chicken drawn as an outlined "allowed" box (understating it) with the cereal missing; "directed by Dr. A. Chen" and the allowed list carrying borrowed authority; the owner's Jun 18 note and two Jun 28 ear entries (typed as other) on no sheet; the flag not naming the plastic fragment and "Since then" reading as onset; 44% of the cat's axis spent on hatch; unexplained glyphs; letter-spaced headings extracting as "M E D I C A T I O N"; a weigh-in drawn on a day the legend called unlogged. Every item is fixed on the sheets (the mock's §01 ledger maps each one). Already-tracked engine halves: [CUL-974](https://linear.app/projectnyx/issue/CUL-974) (entries typed as other print nowhere) and [CUL-543](https://linear.app/projectnyx/issue/CUL-543) (an "unsure" foreign-material read prints nowhere; Nyx's May 21).

**The adversarial passes** (`adversarial-reviewer`, two, the cap). Pass 1, on the first draw: FAIL. Its counterexamples: Mira's refused trial on a three-dot intake scale reads as preference; a trial with nothing off-diet logged draws a blank lane, which is the banned clean claim; "because both are dense" was uncomputed and false (19 of 20 treat days precede a vomit day, about 11 expected); "itching fell" across halves with different coverage; dose lanes with no not-given glyphs; a since-flag zero reads as resolution; a free-fed food first logged mid-window drawn from the window's edge; several of today's guards dropped. Pass 2, on the revised draw: FAIL on six quiet failures, every one a wording or rule edit, all fixed: the trial diet missing from the concurrent changes, so a falling staircase of counts credited it; owner-logged roast chicken and Pro Plan hidden inside Dentastix days, resting the verdict on an AI read; the cat's food sentence giving a reason the engine never computed; blank treat days reading as treat-free; a before/after pair around a foreign-material flag; logged days that include food-only days. What the mock does not draw is carried as twelve build rules under B3.

Residuals that ship as stated, erring loud: "chicken, fed daily from Jun 8, cannot be tested on this record" is the sheet's inference, not an engine output, and refuses to clear chicken; the owner's chicken note shares a sheet with the chicken lane, quoted and unverified; cereal ticks though the trial food contains rice. Not printed either way: on Nyx's record 19 of 20 treat days precede a vomit day; whether a sub-threshold pattern may reach a page is the open emerging-signals question.

DoD (Biostatistician): tried Mira's refusal → broke, now rule 1; a trial with no logged off-diet → broke, now rule 3; the treat-then-vomit lag → broke, the sentence is gone; the stretch counts with the diet unnamed → broke, now named; roast chicken on Dentastix days → broke, now heavy ticks and the lead of the answer line; a falling since-flag pair → broke by rule, now rule 6; Nyx's max gap over fully logged gaps → held; the axis break against onset → held.

## Mistakes caught in the mock, and fixed before publishing

- The cat's free-fed bowl was labelled "since Mar 1". That date is when the owner first logged the food, not when the diet began (B-233, `report.ts:6217`); today's report says "start not recorded". Fixed in both places. The round-2 summarizers saw the wrong version; the judge was told.
- Sheet 2's half-split line named Apoquel and NexGard as concurrent changes and left out the daily chicken from Jun 8, breaking the rule the mock argues for. Fixed.
- Sentences I wrote that the reviews broke: "the food test found no food association", "because both are dense", "itching fell", and a list of concurrent changes that left out first the chicken and then the trial diet. Each is gone, and rule 5 now forbids the class.
- Three passages said unlogged days are hatched "through every lane" while the drawing hatched only signs and food. Settled as: hatched through every lane of daily marks (signs, meals, exposures, doses); a recorded course, a standing bowl and the weight row draw as recorded, because a hatch across them reads as stopped. The legend now says "no meal or sign logged that day", because the dog's fixture carries a May 18 weigh-in on a day it counts as unlogged (in production a weigh-in is an event and would count; what counts as a logged day is [CUL-1865](https://linear.app/projectnyx/issue/CUL-1865)'s open question).

## Decisions requested (all on [CUL-1859](https://linear.app/projectnyx/issue/CUL-1859), label Waiting on PM)

B1 who writes the clinical words (better-than-the-rule check on spec §5) · B2 build direction C, the record strip (carries round 1's D1) · B3 the overlay rule, a new spec §5 rule · B4 sheet 2, the record in lines (carries D2) · B5 the machine-reader layer · B6 the front-desk email (promotes [CUL-397](https://linear.app/projectnyx/issue/CUL-397)) · B7 deleted-entry counts, a persona conflict (skeptical GP vs Trust & Safety) · B8 the safety photo on page 1, still a conflict (carries D4) · B9 round 1's D6, D7 and D9 unchanged.

## Filed

- [CUL-1860](https://linear.app/projectnyx/issue/CUL-1860) a photo read the consent gate declined prints "still processing".
- [CUL-1861](https://linear.app/projectnyx/issue/CUL-1861) five guard and test gaps from the audit.
- [CUL-1862](https://linear.app/projectnyx/issue/CUL-1862) this PR's sub-issue.
- [CUL-1863](https://linear.app/projectnyx/issue/CUL-1863) six wordings a reader or a clinic AI misreads.
- [CUL-1864](https://linear.app/projectnyx/issue/CUL-1864) the print margin.
- [CUL-1865](https://linear.app/projectnyx/issue/CUL-1865) four numbers that mislead.
- [CUL-1867](https://linear.app/projectnyx/issue/CUL-1867) whether a chronicity flag belongs in the band for a recorded, treated condition (clinical gate).
- Already tracked, so not refiled: [CUL-1783](https://linear.app/projectnyx/issue/CUL-1783) (forced `tool_choice` returns a 400 on the 5.5 models; the AI brief found it again).

## PM actions

- Rule B1 to B9 on [CUL-1859](https://linear.app/projectnyx/issue/CUL-1859).
- Export one vet report PDF from the phone and attach it to [CUL-1864](https://linear.app/projectnyx/issue/CUL-1864): it decides the margin fix and runs [CUL-1771](https://linear.app/projectnyx/issue/CUL-1771)'s text-layer check on the real print path.
- [CUL-598](https://linear.app/projectnyx/issue/CUL-598): a real vet's read remains the only non-simulated reader of any of this.

## Limits

- Every reader here is simulated: personas, the summarizers and the judge are model agents, not clinic software or vets. The round trip is one run per fixture on two fixtures.
- The AI brief's research debt: no study of vets reading AI-labelled owner documents; no 2026 frontier-model test of number accuracy in data-to-text; AB 489's reach to vets unconfirmed.
- The print diagnosis is from WebKit's source and Chromium proxies, about 85 to 90% confident until one device PDF.

### Next Session Kickoff

**Recommended first prompt:**
> Build [CUL-1860](https://linear.app/projectnyx/issue/CUL-1860): the vet report prints "still processing" for photo reads the AI consent gate declined or capped, and counts a model-free escalation row as a legible AI read. Read the issue and `docs/nyx-vet-report-requirements.md` §5 rule 10 first; it is server-only and should merge before [CUL-552](https://linear.app/projectnyx/issue/CUL-552)'s client ships.

**Alternate prompts:**
- Once the PM has ruled [CUL-1859](https://linear.app/projectnyx/issue/CUL-1859): "Set up the Vet report v2 project per D9 and start build step 1 (R-19's text cuts, [CUL-1001](https://linear.app/projectnyx/issue/CUL-1001)) under the rulings; read `docs/culprit-vet-report-v2-mockups.html` §06 and §07 first."
- "Run the standing round trip ([CUL-1771](https://linear.app/projectnyx/issue/CUL-1771)) on the revised mock sheets, method and rubric in `docs/research/2026-10-vet-report-round-trip.md`. First question: does the null food-association result survive now that it shares a sentence with its limit?"
- "Clinical gate on [CUL-1867](https://linear.app/projectnyx/issue/CUL-1867): an adversarial pass on the options for a chronicity flag over a recorded, treated condition."
- When the PM has attached a phone PDF: "[CUL-1864](https://linear.app/projectnyx/issue/CUL-1864): measure it with `measure_pdf.py --one` (reproduced in the guardrail map) and ship the margin fix it supports."

**Parallel / efficiencies:**
- [CUL-1860](https://linear.app/projectnyx/issue/CUL-1860), [CUL-1863](https://linear.app/projectnyx/issue/CUL-1863) and option A of [CUL-1864](https://linear.app/projectnyx/issue/CUL-1864) all edit `generate-report/render.ts`: run them in sequence, or split by region. The round-trip re-run touches no repo code and runs alongside any of them.
- One PM sitting on [CUL-1859](https://linear.app/projectnyx/issue/CUL-1859) unblocks the whole v2 build. One phone PDF unblocks [CUL-1864](https://linear.app/projectnyx/issue/CUL-1864) and the device half of [CUL-1771](https://linear.app/projectnyx/issue/CUL-1771).
- [CUL-1865](https://linear.app/projectnyx/issue/CUL-1865) (numbers that mislead) waits on a clinical review; the v2 day ledger (build step 2) should land after it, because both change how logged days and exposures are counted.
