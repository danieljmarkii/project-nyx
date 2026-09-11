# Culprit — Executive Product & Strategy Review: Kickoff Prompt

*Paste the body below into a fresh session. Scope set with the PM, 2026-09-11.*

**This file is the kickoff, not the deliverable.** The deliverables are `docs/culprit-strategy-review-2026-09.md` (the memo) and a set of Linear issues. The Phase 0 evidence pack already exists at **`docs/culprit-state-of-play-2026-09.md`** — 8 verified research lanes, with a corrections register. Read it; do not re-derive it.

**Parameters the PM set at commissioning (binding — do not re-litigate):**

| | |
|---|---|
| **Ambition** | A **profitable solo or very small business**. Not venture-scale. Not cost-recovery. Judge every recommendation against that, not against a fundable narrative. |
| **Cash** | **Essentially none.** No paid acquisition, no paid research, no contractors, no hires. Agent spend is the only money leaving this company. A recommendation that needs a budget is not a recommendation; it is a wish. |
| **Capacity** | **Variable** — some weeks nights and weekends, some weeks effectively full-time. **Plan for the low case. Treat the high case as upside.** Do not average them. |
| **Scope of challenge** | **Everything is on the table**, explicitly including Pets > $, the diet-trial wedge, $4.99, iOS-only, the App Store as the launch vehicle, the solo-plus-agents operating model, and whether the product should exist in this form. |
| **Required outputs** | All four: an unvarnished diagnosis · a launch-forcing plan · a strategy and positioning verdict · a go/no-go with real alternatives. |

---

## The outcome this engagement hangs from

A strategy review has two failure modes. The first is a flattering document: a panel that agrees with the founder in nine voices. The second is a *flattering-in-reverse* document: a panel that mistakes severity for insight, because harshness reads as courage and gets praised. **Both are sycophancy.** Guard against both, explicitly and with named mechanisms.

The outcome to produce: **a diagnosis the PM did not already have, a ruling he can act on alone next week with no money, and a ranked list of tests that would prove the panel wrong.** If the memo could have been written from `STATUS.md` without this engagement, it failed. If every recommendation is one the PM already agrees with, it failed. If it recommends anything that needs cash or a second person, it failed.

**The one-sentence bar:** twelve months from now, someone reading this memo alongside what actually happened should be able to say *the panel called it* or *the panel was wrong about X* — never *the panel wrote something reasonable.*

---

## Phase 0.A — PM intake (do this FIRST; the panel does not convene until it is answered)

Every version of this engagement that was designed and rejected optimized an objective function nobody had asked the PM to state. **Ask him, in writing, before any seat is seated.** Present it as a short interview, not a form. Do not proceed on assumed answers; if he declines to answer one, record the refusal and say what the panel therefore cannot conclude.

1. **Do you actually want users?** Asked without judgment. 180 consecutive sessions chose building over shipping. The available readings are sequencing, capacity, avoidance — and a fourth nobody has offered: **preference.** Users bring support load, bug reports, sick animals, and constraints on what you are allowed to change. If the honest answer is *I want to build this, not run it*, then most of what follows is answering the wrong question and the panel must say so on page one.
2. **What do you want to be true about yourself when this ends?** *I shipped a real product* / *I made money* / *I proved I can build this way* / *I helped sick animals* / *I enjoyed my evenings*. These produce different memos.
3. **What are you afraid of?** Three candidates are in the record: the vet's reaction, the download counter, and **the support inbox** — the moment a stranger's sick pet becomes your responsibility. A person who built an architecture whose defining rule is *never falsely reassure an owner* is taking on an emotional liability the day real owners arrive, not just an operational one.
4. **The concrete life questions.** Is there an employer? A savings burn? A partner's tolerance? A date you have privately given yourself? What is the next-best use of fifteen hours a week — more income, more joy, or more optionality? **What are you unwilling to change at any price?**
5. **Was the pace pleasant or compulsive?** ~7.3 sessions a day for fifty days. No plan should be optimized for throughput if the throughput was a symptom.
6. **What do *you* think is working, and what isn't?** Capture this **before** the panel forms its own view. **Where the panel and the PM disagree about what is working is the finding** — and it is the cheapest anchor-check available.
7. **What would you do with $500k and a co-founder?** One question that reveals whether the binding constraint is money, time, or belief.

---

## Phase 0.B — Verify the ground, once, centrally

Ten isolated seats must not each re-derive the same facts, and none of them may trust a repo document that describes production. `STATUS.md` is currently **wrong about the live version of `generate-report`**, which is the single most strategically important deploy in the project. Run these once and publish the results into every seat's packet:

- `Linear list_issues(team=Culprit, project="App Store Launch")` — and **separate "blocks submission" from "filed under the launch project."** They are different sets and conflating them builds a fake critical path.
- `Linear list_issues(team=Culprit, label="Waiting on PM")` and by state, for the open-issue count.
- `Supabase execute_sql` — counts for `auth.users`, `pets`, `events` (live and deleted), `diet_trials`, `vet_reports`, `looks`, and `ai_usage` grouped by surface **and by distinct day and distinct account**.
- **The account question, settled definitively:** one query joining `auth.users.email` → `pets` → `events`. Two research lanes disagreed about whether a genuinely third-party account has ever existed. *Does even one stranger use this?* is the most decision-relevant fact in the corpus and it is one query. **If the answer is yes, contacting that person is the second-highest-value action available to this company.**
- `Supabase list_edge_functions` — live versions and dates, against `supabase/functions/deploy-manifest.json`.
- `select key, value from app_config` — the full flag manifest.
- Apple iTunes Search API for the named competitors, for current ratings and version dates.

**Must-reads, in this order:**
1. `docs/culprit-state-of-play-2026-09.md` — **including §8, the corrections register, before citing anything from §2–§7.**
2. `CLAUDE.md` — the seven principles, the two safety invariants, Pets > $, the Open Questions table, the Persona Conflict Protocol, the decision-brief format, the Tier-2 documentation protocol.
3. `docs/monetization-and-ai-gating-strategy.md` §13 + §18 — D-M1…D-M8. Note that the doc itself calls $4.99 a *placeholder to validate*, not a locked price.
4. `docs/culprit-competitive-landscape-2026-07.md` §1, §2, §10, §11 — still the best competitive reference, with §5 of the evidence pack as its delta.
5. `docs/nyx-research-v1_0.md` — the evidence base, **including its own "not investor-grade" self-flag on the wedge triangulation.**
6. `docs/vc-financial-projections-PROMPT.md` — the model it commissioned was never written. That absence is a finding, and the prompt's five hard VC questions are a ready-made stress test.
7. `docs/app-store-readiness.md` + `docs/app-store-submission-guide.md`.
8. `docs/nyx-design-principles-v1_0.md:139` — read it against D-M1 and notice they contradict.

**Robustness check:** if a must-read is missing, **stop and flag it.** Do not proceed by inventing its contents.

---

## Phase 0.C — The abort clause

**Before the panel convenes, answer this in three sentences and act on the answer.**

By every framing's own value-of-information logic, the highest-information act available to this company is one email to a veterinarian, and it has been sitting in `Todo` for 71 days at a cost of zero. An engagement that spends multiple sessions and real agent spend to re-derive *send the email* has performed the exact pathology it was convened to diagnose.

So: **state what this engagement can produce that sending the email cannot.** If the honest answer is "nothing material," say so, write a one-page note instead of a memo, and close the session. If the answer is "a ruling on shape, a sequence, and a stopping rule that one email cannot give," proceed — and **send the email first, in this session, before the panel convenes.** It costs nothing and it means the panel is reasoning about a live experiment rather than about an unbooked one.

The engagement also prices itself: state the expected session count and rough agent spend up front, and what it displaces. A brief that demands every recommendation name its cost while arriving un-costed fails its own rule on entry.

---

## The panel

**Do not run a conversation.** The evidence is unambiguous and it matters more than the roster: multi-agent debate degrades accuracy through conformity, not through reasoning (strict conformity ~29% of observations; conformity-driven flips predominantly correct→wrong; even vacuous reasoning induces 20–39% error adoption). Assigned devil's advocacy measurably **backfires** — Nemeth found role-played dissent produces cognitive bolstering of the initial position, while authentic dissent produces better solutions. A "skeptical CTO hat" worn inside one conversation is the single most likely thing to make this panel *more* confident in the PM's priors.

**So: manufacture authentic difference instead of assigning it.**

- Each seat runs in its **own isolated subagent context** (`Agent` tool), writes a **sealed verdict**, and locks it **before seeing any other seat's work**. This repo has the precedent: the nine isolated vet-visit interviews (CUL-878) converged on conditions without contact, which is why that convergence meant something.
- **Each seat gets a different evidence packet** and a **different starting position it is told to defend on the record.** Not different hats on the same facts.
- **Sparse topology.** No seat sees the full transcript. Exposure happens once, in writing, after positions are locked.
- **The CEO seat writes last.** Authority-driven dynamics suppress semantic diversity; a CEO opening remark is the anchor everything else regresses to.
- **One seat runs de-anchored:** it receives the built app, the market data and the live numbers, but **not** `CLAUDE.md`, **not** `STATUS.md` and **not** the session records. Its first deliverable is its own independent statement of what this product is for. **Where that diverges from the ratified strategy is a finding, not a misunderstanding.**

### Seats

The PM named CEO, CPO, CTO and top-tier management consultants. All four are seated. Five of the six additions below are non-negotiable given the parameters; the roster is deliberately reweighted away from capital, because the ambition is a profitable solo business and a VC lens optimizes the wrong thing.

| Seat | There to catch what nobody else will |
|---|---|
| **CEO (bootstrapped consumer, writes last)** | The shape question. Is this a business, and of what kind? Owns the go/no-go and the stopping rule. |
| **CPO** | That the product is built for a user who has never touched it, and that "product direction" is a real half of the commission the business seats will otherwise eat. |
| **CTO** | **Scope is load and blast radius, not architecture.** State the concurrency ceiling and the cost ceiling under a 1,000-user day; name what breaks first and what it costs to find out. The architecture is good; that claim is the one thing the panel may not simply inherit — require the one-line evidence that the exemption is earned. |
| **Management consultant (MBB, engagement partner)** | Structure: SCQA, a governing thought, a MECE issue tree, the "so what" test on every section, an answer-first one-pager. Owns whether the memo is auditable as an argument. |
| **Growth / distribution operator (indie, zero-budget)** | The crux, probably. Names the literal first hundred users. This seat is disqualified from using the words "organic," "vets," or "word of mouth" without a name, a URL and a date attached. |
| **Positioning (Dunford method)** | The competitive alternative a real owner actually has (a paper notebook, the Notes app, ChatGPT, nothing), and the category the product should compete in. Also owns the vitamin-or-painkiller question and its ugly corollary in §"five questions" below. |
| **Veterinary practice economics** | Whether vets *want* this. Not "is the report good" — **would receiving it make their day worse, and would they hand a client a QR code.** This seat must make indifference a recordable outcome. |
| **Trust, safety and liability counsel** | The unsigned drafts, the absent entity, the personal-name exposure, the escalation liability, and **state veterinary practice acts** — the one legal question nobody has looked at. |
| **The Short (adversary)** | Argues the company is worth nothing and the next year is wasted. Must produce the strongest version, not a caricature. |
| **The Steelman / overstatement auditor** | **The mirror of the Short, and the seat every prior design forgot.** Reviews the panel's own findings for claims stated one notch stronger than their evidence, and writes a mandatory steelman of each attacked thing. Nothing else in this design penalizes a false positive. |

**Explicitly barred from seats:** every incumbent in-house persona — Dr. Chen, the Designer, the Data Scientist, Jordan, Sam, the `vet-report-cold-read` and `pm-feature-review` subagents. **They cannot audit themselves.** They may be *quoted as subjects*; they may not *vote*.

**One seat, assigned to the Short, also argues the counter-case nobody has made:** *do not launch in 2026.* Launching today ships a July binary with the wedge's payoff 42 days stale and its trial block rendering empty, no crash reporting, no analytics, no push channel, no support process, into a category where first impressions are permanent and Apple's rewritten 4.3(b) now lists "does not attract customers" as a removal criterion. **The pathology may not be the delay. It may be that the delay is undecided rather than chosen.** The panel must defeat this case explicitly or adopt it.

---

## Workstreams

Prioritized. Where time runs short, **mark a section "thin — needs follow-up" rather than padding it.**

### W1 — The diagnosis *(PRIORITY 1)*
Rumelt's kernel or nothing: **diagnosis → guiding policy → coherent action.** The diagnosis must name a **mechanism**, not a vice, and must carry **the observation that would disconfirm it**.

A hypothesis is pre-supplied **to be attacked, not adopted**: *this system's feedback loops all terminate inside itself; the only loop it has never closed is the market loop.* Note the narrower rival reading, because they produce completely different action sets: loops here demonstrably do close — every guard fires, every adversarial review changes code, every PR merges. **If exactly one wire is missing, the action is to attach one wire, not to overhaul a machine that works.** The panel must choose between these two diagnoses explicitly.

Barred as a diagnosis: *"the PM should prioritize better"* and *"the PM should prioritize launch."* Those are goals wearing a diagnosis's clothes. Send them back.

**Done when:** one paragraph, naming a mechanism, with a disconfirming observation beside it, that a reader who has never seen the repo can act on.

### W2 — The crux *(PRIORITY 1)*
Each seat names **the crux** in one sentence — the hardest part of the climb, the thing that if solved makes the rest easier — and defends that it is the hardest part. Collect into a ranked list with a **cost of being wrong** per candidate. There is an obvious candidate (nobody outside the household has ever used this) and the panel should be suspicious of how obvious it is.

### W3 — What is working, and must be protected *(PRIORITY 1, non-optional)*
The PM asked *"what's currently working."* Answer it literally, at **equal length and under the same evidence standard as the criticism** — asymmetric length is how a panel launders a foregone conclusion. Name what would be destroyed by acting on this memo's own recommendations. A purely prosecutorial read biases the panel toward a rescue narrative when the real question may be positioning.

Include the question nobody has asked: **is the operating system the more valuable artifact than the app it produced?** One person shipped 129,698 lines, ~830 PRs, 8,290 tests, 14 build-failing guards and a real case-crossover engine with Monte-Carlo property tests, in about four months. If the founder's durable asset is *I can build production software this way*, the 1.34M-word decision record is the portfolio, not the bloat, and "product direction" has a completely different answer. One seat must argue this seriously.

### W4 — The competitive read, done properly *(PRIORITY 2)*
The PM named competitive space first. The corpus's only competitive work is desk research, and this pass showed its method has a systematic blind spot.

**Install the top five and use each for a week against the real cat's record.** Write what each does better. That is the obvious CPO move and it has never been done. Start with **Tend & Mend: Cat** (free, App Store since 2026-04-10, markets every cell of the "unoccupied wedge", **zero ratings**), **Everkin** ($6.99/mo, shipped our daily-look seven days before we did, paywalls the vet PDF), and **ThePawcess** ($39 one-time, elimination-diet protocol deeper than our shipped track).

**The mandatory starting prior:** *Tend & Mend shipped the whole wedge, free, five months ago, and nobody came.* Explain their zero first. Then say whether your explanation predicts yours. And check the premise before reasoning from it — a zero-ratings count may be measuring whether an app asks for ratings, not whether anyone uses it.

**Done when:** the panel can state what is genuinely differentiated in a sentence a stranger would believe, and has named the competitive alternative a real owner would actually use instead.

### W5 — The shape ruling *(PRIORITY 2)*
One forced choice, defended: **(a)** freemium subscription as ratified · **(b)** bounded one-time or per-episode purchase · **(c)** vet-channel B2B2C · **(d)** a different payer entirely · **(e)** deliberately un-monetized public good · **(f)** stop.

Three facts the ruling must metabolize:

1. **The wedge terminates by construction.** A diet trial is 8–12 weeks and then it ends, in a diagnosis, a resolution, or a give-up. **The success case churns.** Engagement is bounded by a disease course, not by a funnel. **State the expected engagement duration in weeks, derived from the protocol itself rather than from a retention assumption, then explain how a $39.99/yr subscription survives it — or rule the shape.** This is the strongest argument in the entire corpus for a one-time price, and no prior analysis made it.
2. **Pets > $ costs about 5×.** Freemium converts at a 2.1% median download-to-paid; a hard paywall at 10.7%. Pets > $ may well be right, and it is the constitution. **Say out loud what it costs, then decide again.** The ratified free tier also holds the only surface with sustained use, while the Premium bundle's lifetime usage is 56 calls, 40 of them from a QA harness.
3. **Who already pays money for this exact artifact.** Nowhere in 1.34M words does anyone ask. Three candidates with real budgets, all absent from the record: **pet insurers** (claims substantiation, where the owner has direct monetary incentive), **veterinary pharma and clinical trials** (feline chronic enteropathy and canine CAFR studies recruit owners and pay per completed home diary), and **specialty internal-medicine referral practices** (diet trials are protocol, and the referral letter is the product). Each is B2B2C against a budget, and the app already produces the artifact. Price finding out — it is a few emails.

Add the buyer-side read, which every prior framing treated as a failure state rather than a live option: **is the engine, the safety architecture or the decision record worth something to a vet-SaaS incumbent or an insurer today, pre-launch?** Five emails would price it.

### W6 — The launch-forcing plan *(PRIORITY 2)*
Executable alone, with no money, at low capacity.

- **A date**, and what gets cut to hit it. Not a target — a date, with the cut list beside it.
- **The flag manifest as a strategic object:** every rollout flag and every global `ai_*` boolean, with ship state, one line of why, and the reversal. The submission binary is defined by a config table nobody has audited, and flipping flags is the single highest-leverage decision currently available. No competitive or product framing would ever open `app_config` to find it.
- **The irreversibility list, gating the date independently of the schedule.** After submission, two things are permanent: the **Seller name** (an individual account publishes the founder's legal name on every shipped version) and the **app name and store slug**. These are a different class from lead times.
- **Instrumentation as a gating dependency, not a recommendation.** The ratified strategy's own §20 says instrumentation precedes the paywall; it is currently scheduled after submission. The first real cohort is the only one that can answer any open question, and it will be spent unmeasured.
- **Support as a workstream, a cost and an emotional liability.** `support@getculprit.app` is simultaneously the support address, the App Review demo account and the Resend sender. On day one a distressed owner emails about a sick pet. Who answers, in what time, with what boundaries? This is the single most attention-consuming thing about launching, against the constraint everyone agrees is binding.
- **Two undesigned guaranteed exits:** the pet gets better, and the pet dies. Both are certain in this category. Bereavement in an app that speaks in the pet's name is an ethics and voice problem with no spec, no mock and no mention anywhere in 1.34M words.
- **Shutdown obligation.** If the founder stops in month 14, what happens to users' health records? The unsigned drafts almost certainly do not cover it.

### W7 — The 90-day evidence contract *(PRIORITY 2)*
One table. Every strategic bet gets a row: **bet · metric · instrument · continue-threshold · kill-threshold · decision date · who decides.** A bet with no instrument is not a bet, it is a hope, and instrumentation becomes a dependency of the bet rather than a line item competing with it.

### W8 — Product direction *(PRIORITY 3, and it is half the commission)*
The PM asked where the product is heading. Do not convert this entirely into a business-shape ruling. At minimum:

- **Which species and which indication is this actually built for?** All real data is one cat with chronic vomiting; the per-incident AI chain is `analyze-vomit` / `analyze-stool`. **Elimination diets run at far higher volume for itchy dogs**, where the outcome measure is a pruritus score over weeks, not a photographed incident. The founder's own animal may have biased the product toward the smaller half of its own wedge. State the relative volumes, and what fraction of the built surface serves the larger half.
- **The funnel to the wedge does not exist.** Onboarding never mentions a diet trial; the trial lives two taps inside the Pet tab, below the fold, behind an empty food library. Day 1 with zero events renders the *lapsed-user* state. There is no reminder, by policy, for a user who must log daily for 8–12 weeks. Name the smallest set of changes that makes the shipped app the product the PM thinks he built, and name what breaks.
- **Of the last 90 days of build, which item was requested by a user and which was discovered by a session reviewing its own prior work?** Answer for each track.
- If the memo refuses to answer part of "product direction," **it must say so and say why.** Silent substitution is not allowed.

---

## The honesty machinery

Every mechanism below is mandatory. Each one exists because a documented failure mode makes it necessary.

**Against anchoring:**
- **Seeded refutations.** Hand every seat **three of this research pass's own broken claims** from `docs/culprit-state-of-play-2026-09.md` §8 — the fabricated adherence statistic, the PRO-TECT reversal, the stale `generate-report` version copied from `STATUS.md` — and **require each seat to find a fourth.** A seat that finds none is not reading.
- **Verify at use, not at citation.** Three of six competitor products had moved within six days of the July sweep being committed. Every load-bearing number in the memo carries a tag: `VERIFIED live` / `REPO-CLAIM` / `ASSUMPTION`, and repo claims about production are re-checked against production.
- **Apply the distrust inward.** Every prior design pointed "do not trust this repo's documents" at the repo and then reasoned from the recon without confidence bounds. **A count is not a rate.** Nine accounts, several of them tests, cannot produce a "67% drop-off." Eight food extractions is a count. Put bounds on internal evidence or do not speak it as a measurement.
- **An artifact auditor.** One seat's only job is to audit the evidence pack *as an artifact* — who wrote it, what it was scored on, what it systematically cannot see — and to state the case that its framing is wrong wholesale, not just locally.

**Against convergence:**
- Sealed, mutually blind verdicts. CEO last. Sparse topology. Different packets, different assigned starting positions.
- **Report the blind-verdict distribution as a headline number.** If the ballot is **unanimous, the two most confident seats are reassigned to argue the opposite and the panel re-ballots.** Moving the conviction beats leaving a red team where it already was.
- **Forced dissent quota.** Every seat names one recommendation it expects the other seats to hate.
- **Dissent is reproduced verbatim and answered clause by clause. A summary of the dissent is a violation.**

**Against unfalsifiable claims:**
- **Every strategic claim ships as four things:** what would have to be true · the single observation that would disconfirm it · the cheapest test that produces that observation · the date. Roger Martin's rejection test applies: *if this were shown to be untrue, would you reject the associated possibility?* If not, it is a nice-to-have and it gets cut.
- **Base rates before opinions.** No seat may state a date, a conversion rate or a retention number without first writing the base rate and its source — **including the internal base rate** (180 consecutive sessions chose the other thing).
- **The one-number rule.** Each seat names the single number that would flip its recommendation. Collected, these are the panel's falsification list.
- **Forced falsification of recommendations, not just claims.** This repo's own Definition of Done already requires naming the counterexample you tried and why it held. Lift it to the strategy level: **any recommendation with no stated counterexample is struck from the memo.**
- **Reference-class forecasting.** Base rates from §6 of the evidence pack are the outside view. Without one, every seat grades this product against its own narrative.

**Against severity mistaken for insight:**
- **The Steelman seat has veto standing** over any finding stated stronger than its evidence.
- **Mandatory steelman of each attacked thing**, at equal length.
- **The panel's own output is tagged `[SYNTHETIC]`.** A synthetic panel that rules "your synthetic validation is invalid" and then signs its own verdict has performed the disease. The memo is **at best a hypothesis generator**, and its findings must be ranked by *which of these could be settled by one real human this week.*

**Against a beautiful document that changes nothing:**
- **The displacement ledger.** Every recommendation names what it kills. A recommendation with no displacement entry does not ship. In this organization, additive advice is free and therefore worthless.
- **The PM-hour budget.** Every recommendation carries a cost in PM-hours, drawn from a stated weekly budget at the **low** capacity case. **A recommendation set that exceeds the budget is a prioritization failure and gets sent back, not softened.** Arithmetic, not discipline.
- **Predictions of record.** Three dated, thresholded predictions per seat, printed in the memo and scored at the next review. The July retro failed to bind precisely because nothing was ever scored.
- **One irreversible real-world action.** The engagement ends with something that happened outside a document — the vet email actually sent, an appointment actually on a calendar, a flag actually flipped, a TestFlight link actually in a stranger's hands. **Without one, this is session 368 doing what the last 180 did.**
- **Name the second party.** Every enforcement mechanism here is self-administered by the same person who is the diagnosed constraint, which is exactly why the July fix did not hold. The memo must name a commitment device **external to the repo and to the PM**: a date told to another human, a public post, a recurring call with someone, a stranger expecting something on a day. If the panel cannot name one, it must say that its own recommendations are unlikely to bind, and why.
- **The engagement pre-registers its own failure.** If the top recommendation has not started within 14 days, this memo is recorded as the 368th session record and the next review may not use this format.

**Two blind syntheses.** Every prior design isolated the seats and left the synthesizer unguarded — one agent who has read everything, knows who commissioned the work, and writes the verdict box. That is where polite convergence actually happens. **Run two independent syntheses of the identical sealed verdicts, written blind to each other, and report the divergence between them as the measure of how much the conclusion is authored rather than derived.**

**The pre-mortem, in the past tense.** Prospective hindsight raises correct identification of causes by roughly 30%, and the grammar is load-bearing: *what did go wrong*, not *what could*. Date-stamp it: **"It is 11 September 2027. Culprit has 400 monthly actives and $0 revenue. Write the post-mortem."** Then the inverse: **it worked — what was true that we did not believe on 2026-09-11?**

**The PM rebuttal, on the record.** Before the memo closes, the PM responds. He holds context the panel structurally lacks. **His disagreement is evidence, not resistance,** and it is printed in the memo unedited.

---

## The five questions the panel may not dodge

1. **Tend & Mend shipped the entire wedge, free, on 2026-04-10, and has zero ratings.** If the wedge is real and the product was the bottleneck, why did nobody come? Answer that before claiming the lane is ownable.
2. **Name the first hundred users.** Not a persona, not a segment — the literal mechanism by which human #1 through #100 installs this. If the answer contains "organic," "vets," or "word of mouth," keep going until it contains a name, a URL and a date. Zero budget is a given, not an excuse.
3. **The vet report has never been read by a vet, the gate has been open 71 days, and it costs one email.** What is the actual reason? And what is the answer if a vet reads it and is simply *indifferent* — which is the modal outcome, not a tail case, for a GP with an 11-minute appointment for whom an unsolicited owner-generated PDF is cost and possibly chart-review liability?
4. **CUL-914 measured a shipped surface printing its finding on 22–77% of pure-noise records.** If the promise is "we find the culprit," what is the falsification standard for a shipped finding, who owns it, and has any signal ever been retired for failing it? **Before seeking any external evidence, run the detectors against synthetic null records across realistic densities and species and publish a per-detector false-positive rate** — no users, no vet, one weekend of compute. Then run the mirror test: **replay the detectors against a synthetic sparse 8-week trial record.** Every floor was tuned on a high-density chronic case. **If the wedge user structurally never sees a Signal, the product cannot serve its own wedge.**
5. **$10k/month at the ratified price needs roughly 2,600 concurrent payers, which at the category median needs roughly 90,000 downloads before churn.** The median app makes $72/month a year after launch; 4.6% reach $10k/month. Name the specific mechanism that puts this app in the 4.6%, or name the number that counts as success instead — and if the honest answer is Bearable-shaped (roughly $30k/month after four and a half years, grown through communities, with the doctor report as a trust signal rather than a growth engine), say so plainly, because that is a good outcome and it implies a completely different plan.

---

## The deliverable

**`docs/culprit-strategy-review-2026-09.md`**, ≤6,000 words, in this order:

1. **The kernel, page one.** Diagnosis paragraph · guiding policy paragraph · 5–8 subordinated actions. **Readable and actionable in 90 seconds.** If it cannot be, most of the analysis has not been dropped on purpose, and dropping it is the work.
2. **The verdict box.** Go / go-with-conditions / no-go, with the conditions, and the divergence between the two blind syntheses stated as a number.
3. **The PM's five questions, answered literally**, in his words, in his order: the competitive space · strengths and weaknesses · where the product is heading · what is working · what is not. **This is what he asked for. If the engagement is delivering a ruling instead of an assessment, page one says so and says why — it does not silently substitute.**
4. **What is working and must be protected** — equal weight, equal evidence standard.
5. **The shape ruling**, with the rejected options and why.
6. **The launch plan**: date, cut list, flag manifest, irreversibility list, support plan, week-1 actions executable with no follow-up questions.
7. **The 90-day evidence contract** as a table.
8. **The ranked test list** — every cheap falsifier, ordered by information value ÷ cost, with the date and the owner. **Given that value risk currently sits at zero evidence and no panel can manufacture evidence, this section may be the most valuable in the memo.**
9. **The displacement ledger and the PM-hour budget**, as tables that must balance.
10. **Predictions of record** — three per seat, dated and thresholded.
11. **The pre-mortem and the pre-parade.**
12. **Dissent, verbatim, answered clause by clause.**
13. **The PM rebuttal, unedited.**
14. **Open questions, decidable** — each in the CLAUDE.md decision-brief format (Deciding / Options with the recommendation marked / Consequence, ~4 lines). A bare "thoughts?" is not a decision request.

**Also required:**
- **Linear issues** for everything the memo commissions, on the `Waiting on PM` label where a PM call is the single remaining step. **Not a second checklist in prose** — that drift is the documented pathology.
- **The supersession protocol.** If the memo rules against a ratified decision, it names **which file changes, by what authority, and in the same pass.** Without this, the memo joins 1.34M words as another correct document nobody obeys — the cure reproducing the disease.
- **Where it lives, who reopens it, and on what date.** An unowned, unscheduled deliverable is the 368th instance of the pattern.

---

## Guardrails

- **Tier-2 protocol.** The memo is new and needs no approval. **Do not edit** `CLAUDE.md`, the specs, the design principles or the research docs — propose edits and wait.
- **No code, no schema, no migrations.** This is DISCOVERY. Flipping a flag or sending an email is not code.
- **Persona Conflict Protocol.** Never resolve a conflict silently. Dissent is the output, not the friction.
- **Pets > $ is on the table by the PM's explicit instruction** — but it is the constitution, so overturning it requires the same standard of proof as overturning a clinical invariant, and the memo states the cost of keeping it either way.
- **Honesty over polish.** One laundered number discredits the memo, and this research pass already produced several. Flag every assumption.
- **The panel is synthetic and says so.** No seat may cite a persona, a subagent or a simulated panel as *validation* of anything — a vet, a lawyer, a user. It may cite them as *subjects*. Where the existing record already rests on synthetic validation, say so in the same sentence as the claim.

## Do NOT

- Run this as a conversation, a round table, or "CEO reacts, then CPO reacts."
- Assign a skeptic hat inside a shared context. It backfires; the literature is clear.
- Seat Dr. Chen, the Designer, the Data Scientist, Jordan, Sam, or any in-house review subagent as a voting member.
- Let *"the PM should prioritize better"* stand as a diagnosis.
- Let a repo document describing production stand unverified. `STATUS.md` is currently wrong about the live version of `generate-report`.
- Cite anything from §2–§7 of the evidence pack without reading §8 first.
- Recommend anything requiring cash, a hire, or a co-founder — **except** as an explicitly labelled "if the constraint changed" appendix.
- Deliver a prosecution with a strengths section stapled to it.
- Confuse "filed under the App Store Launch project" with "blocks submission."
- Produce a recommendation set that exceeds the stated PM-hour budget at the **low** capacity case.
- Convert "product direction" entirely into a business-model ruling without saying that is what you did.
- End the session without one irreversible thing having happened outside a document.
