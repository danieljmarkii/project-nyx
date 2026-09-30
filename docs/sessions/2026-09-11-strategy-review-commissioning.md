# Executive product & strategy review — commissioning the engagement

**Date:** 2026-09-11

The PM asked to convene CEO / CPO / CTO / top-tier-management-consultant lenses to assess the competitive space, our strengths and weaknesses, where the product is heading, what is working and what is not — and asked for **an optimized prompt for that work**, not the assessment itself. Shipped via #831 (CUL-933; the run is CUL-934, `Waiting on PM`, Urgent).

Three files: `docs/culprit-strategy-review-PROMPT.md` (the kickoff, 3,571 words), `docs/culprit-strategy-review-METHOD.md` (the binding method annex), `docs/culprit-state-of-play-2026-09.md` (🧊 the Phase 0 evidence pack).

---

## Method

**Pass 1 — recon.** Eight isolated research lanes: four internal (repo forensics, live-DB queries, strategy-of-record reconstruction, risk/ops) and four external and web-grounded (competitive delta since the 2026-07-25 teardown, market and channel reality, consulting method, real-world analogs and base rates). **Each lane was handed to a separate adversarial verifier** that re-ran the queries and re-fetched the URLs. Then three independently drafted engagement framings (ruthless diagnostic / launch-forcing operating review / investment-committee verdict) were judged on three lenses and grafted, and a completeness critic named what all three missed. 23 agents, 761 tool calls.

**Pass 2 — red team.** Five independent critics attacked the drafted prompt (will-it-actually-run · the prompt-as-anchor · the founder reading it on a Sunday night · the strategic substance · a mechanism-by-mechanism audit of the honesty machinery), consolidated by an editor into a ranked fix list with explicit rejections. 6 agents.

**Parameters recorded from the PM at commissioning:** a profitable solo or very small business (not venture-scale) · essentially no cash · variable capacity (plan the low case) · **everything on the table**, including Pets > $, the wedge, $4.99, iOS-only, and whether the product should exist in this form.

---

## The design decision that governs the prompt

**It does not commission a panel discussion**, which is what was asked for and the obvious thing to write. Multi-agent debate degrades accuracy through conformity rather than reasoning, and *assigned* devil's advocacy measurably backfires — role-played dissent produces cognitive bolstering of the initial position. A "skeptical CTO hat" worn inside one conversation is the single most likely thing to make a panel *more* confident in our priors.

So: isolated seats · sealed verdicts locked before any exposure · **one fact base, ten different questions** (different *facts* make agreement and disagreement equally uninterpretable) · a fixed ballot header so divergence is a number rather than a paragraph · the CEO seat reading the others and writing last · one seat running de-anchored from `CLAUDE.md` and `STATUS.md` with a mechanically-assembled packet · **two blind syntheses**, because every prior design isolated the seats and left the synthesizer unguarded, which is where polite convergence actually happens.

Three additions the PM did not ask for: a **PM intake before any seat is seated** (every rejected framing optimized an objective function nobody had asked him to state), an **abort test** (name three decisions this memo changes that one email to a vet does not — fewer than three and the output is a one-page note), and a **Steelman seat** that grades overstatement, because everything else in the design rewards severity and nothing penalized a false positive.

---

## What the research found that changed the shape of the work

**A free competitor shipped the whole wedge five months ago and nobody came.** Tend & Mend: Cat — App Store id 6760874055, solo developer, released 2026-04-10, free, sibling apps for dogs and human IBD — markets every cell of what the July teardown called the unoccupied wedge, vet report included. **Zero ratings.** The verifier corrected the lane's engine attribution (mis-sourced) and refuted its explanation for why July missed it (it ranks **#1** for "cat vomiting tracker," so the "clinical-keyword blind spot" story does not hold). The existence and the zero are solid, and they move the central question from *is the product good enough* to *is anyone looking*.

**`STATUS.md` is wrong about the live `generate-report`.** It says v13 / 2026-07-18; `list_edge_functions` says **v14 / 2026-07-30**. Three separate lanes copied the stale number and restated it as a live measurement. The routing card every session is told to read is wrong about the most strategically important deploy in the project. Filed as a proposed Tier-2 correction inside the pack, not applied.

**Production, queried live:** 9 auth users, of which one has ever produced an organic record; 2 signed up and never signed in. `vet_reports` 0 rows. `looks` 0 rows. Lifetime `extract_medication` 0 calls; `extract_food` 8; `ask` 48, of which **40 by the QA account in a single day**. Three of the four features in the ratified Premium bundle are in that list.

**`docs/nyx-financial-model-v1_0.md`, scoped 2026-07-12, was never written.** There is no LTV, no CAC, no payback period, no cohort model and no target subscriber count anywhere in the project. The price is ratified; what it has to do is unknown.

---

## What the red team broke in the draft, and what it taught

The consolidated verdict on the first draft: *"a rigorous, well-argued, high-confidence memo that the founder already mostly agrees with, and whose central conclusion was decided in Phase 0 rather than by the panel."*

**The arithmetic defect.** The deliverable mandated ~9,700 words of content against a 6,000-word cap — dissent from ten seats answered clause by clause, a steelman of each attacked thing, a strengths section at equal weight, 30 predictions, four balancing tables. Under the cap a session keeps all fourteen headers and empties them: **every honesty device degrades to a stub simultaneously, and none of them fails visibly.** Fixed by splitting the deliverable into a ≤2,500-word memo with per-section budgets and an uncapped appendix, with the rule that every memo claim names the appendix section carrying its evidence.

**The answer space contained one answer written twice.** W1 offered *"the loops terminate inside the system"* and *"exactly one wire is missing"* as rival diagnoses; they differ in prescribed action, not premise. Ten isolated seats over one prosecutorial pack would have returned it unanimously, and the design would have read that as strength. Now four ranked candidates minimum, with three mandatory: **the loop would return null** · **nothing is broken** · **the constraint is the operating model, not the founder** (agents cannot be a person in a waiting room, so effort routed to the only work the system could perform — the action is then *point the agents at distribution*, which no framing had proposed). A **Null Hypothesis seat** owns the premise.

**The engagement could not write the strengths section it mandated.** The pack ran eight lanes and none looked for assets; its whole asset inventory is one sentence. The reading list carried the same bias, routing seats past the competitive doc's own §6, *"where we are winning."* **Lane 9, the asset register, now runs before any seat is seated.**

**The one calculation that may settle the shape ruling was never done.** §7 gives free-tier COGS per engaged user; §6 gives blended net per payer. Joined, break-even conversion may exceed the freemium median, the category median **and** the hard-paywall median — meaning the ratified shape may not be profitable at any scale. **W0, the founder's arithmetic, now runs first.**

**Two self-defeating mechanisms.** The abort clause printed its own passing answer in the same sentence as the test. And *"require each seat to find a fourth broken claim"* is a quota for fabrication — inventing one is cheaper than finding one and indistinguishable in the output, inside a document whose corrections register exists because a lane fabricated a statistic. Replaced by: audit four of your own choosing, report holds or breaks, **four holds is a passing answer.**

**A live safety hole.** The Gmail MCP is available in this environment, so *"send the email first, in this session"* instructed an agent to mail the founder's veterinarian, in his name, carrying a report 42 days stale with the diet-trial block absent. Now: **no phase of this engagement contacts a named human**; the email is drafted here and sent by the PM, with a decision brief on redeploying first.

**And three of my own claims were stated a notch stronger than their evidence** — the exact error class the pack's §8 catalogues, in the document that commissions a seat to catch it. *"Pets > $ costs 5×"* compares freemium to a hard paywall, and both versions of this product are freemium, so it is an upper bound rather than a measurement. *"180 sessions chose building over shipping"* adds a verb the data does not carry. *"The wedge terminates by construction"* is a hypothesis wearing a fact's clothes, and now ships with four counters at full strength — one of which is that the second act is already built and switched off.

---

## The lesson worth keeping

**A prompt that diagnoses over-production is judged by its own rule.** After applying 26 edits the draft had grown from 6,014 words to 9,645 — the additions were all load-bearing rules, and the growth was all justification for them. The fix was the same one the red team had just applied to the deliverable: split the paste-ready kickoff (3,571 words) from the binding method annex, on the principle that **a kickoff which cannot be held in mind is not a kickoff.** The house precedent is 1,613 and 2,667 words; five times that, in a document arguing the project ships too much documentation, would have performed the disease.

The generalizable half: **when a review's fix list is adopted wholesale, measure the artifact against its own thesis before shipping it.** Every edit was right and the sum was wrong.

---

## Residuals

Proposed Tier-2 edits, stated in the pack and **not applied** (each needs a PM call):

- `STATUS.md` — the `generate-report` live version (v13 → v14, 2026-07-18 → 2026-07-30).
- `docs/nyx-design-principles-v1_0.md:139` — still lists multi-pet, extended history, advanced correlation views and customisation as "what may be premium"; D-M1 / D-M8 made all four free forever on 2026-07-12. **The document a session reads on every UI change is the repudiated one.**
- `CLAUDE.md` Open Questions — the freemium gate still shows "Open — narrowed 2026-07-06," five days before it was ratified.

**Linear:** CUL-933 (this PR completes it) · CUL-934 (`Waiting on PM`, Urgent — answer the intake, run the review).
