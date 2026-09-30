# Culprit — Executive Product & Strategy Review: Method Annex

**Binding companion to `docs/culprit-strategy-review-PROMPT.md`.** The kickoff is what you paste; this is what you read at the point of use. Every section here is binding, not background.

**Contents.** §0.3 the ground (queries, Lane 9, the artifact auditor) · §P1 the de-anchored seat · §W0–§W8 the workstreams · §M1–§M4 the honesty machinery · §S the five stress tests.

---

## §0.3 — The ground

**The query list.** Results go once into `docs/strategy-review-2026-09/verified-facts.md` — query or URL · value · timestamp — and are pasted into every packet. **Each seat then gets two query credits:** at most two further verifications, requested in writing, naming the question and what the answer would change. "Verify at use" means spending your credits on the number your recommendation rests on.

- `Linear list_issues(project="App Store Launch")`, and **separate "blocks submission" from "filed under the launch project."** Several of the 25 are post-launch by design; conflating the two sets builds a fake critical path.
- `Supabase execute_sql`: counts for `auth.users`, `pets`, `events` (live and deleted), `diet_trials`, `vet_reports`, `looks`; `ai_usage` grouped by surface, by distinct day **and by distinct account**.
- `list_edge_functions` against `supabase/functions/deploy-manifest.json` — live versions and dates. The manifest's `pending` means "a deploy is owed **or** the live state is unverified"; it does not mean nothing is deployed.
- `select key, value from app_config` — the full flag manifest (feeds W6.1).
- Apple iTunes Search API for the named competitors: current ratings, version dates, rank on the wedge's owner-language queries.

**The account question, settled cheaply and without touching PII.** **Ask the PM first** — *"has anyone outside your household ever signed up on their own?"* takes ten seconds. Only if he does not know does the panel query, and then in **aggregate**: counts of accounts with ≥1 organic event, grouped by whether the address domain matches the founder's known set. **No seat reads, records, quotes or reproduces a user email address, and no output of this engagement contains one.** If a genuine third party exists, the output is a **decision brief for the PM on whether and how to contact them, routed to the T&S seat** — outreach from an individual with no entity and an unhosted privacy policy is a T&S question before it is a growth one. "Two phone calls" is not the cost; the posture that permits the calls is.

**Lane 9 — the asset register. Runs before any seat is seated; packet-mandatory.**
The evidence pack ran eight lanes and **none of them looked for assets**, so the engagement as designed could not write the strengths section it mandates — a seat told to write W3 to the same standard as the criticism would have had nothing to cite, and would have padded or hedged. One research lane, same method and same adversarial verifier as lanes 1–8, answering: *what does this company have that a competitor starting today would need twelve months and money to acquire?*

A table on the pack's `[E]/[C]/[A]/[MK]` convention, covering at minimum: the case-crossover engine and its Monte-Carlo property tests · the guard-and-convention system **as a delivery capability** · the 51 requirements specs · the local-first sync fabric · the safety architecture as a positioning claim · `/rundown` · the founder's demonstrated throughput. **Each row states what reproducing it would cost a competitor, and what this memo's own recommendations would destroy.**

**The artifact auditor — runs first and alone**, before any seat, with its report added to every packet. Three fixed questions:
1. Name three things the evidence pack systematically cannot see, given who produced it and what they were scored on.
2. §8 records fabrication, mis-attribution and stale-document laundering. Name where in §2–§7 the same error class is **likely still present and unchecked**, and re-run two of the queries above as a spot check, reporting agreement or disagreement.
3. State the strongest case that the pack's framing is wrong **wholesale**, not locally.

An auditor whose findings cannot reach the seats is decoration.

---

## §P1 — The de-anchored seat

The design's main defence against its own anchoring, so it is specified rather than requested.

**The packet is assembled mechanically** into a scratch directory: `docs/store-listing-copy.md` · the eight onboarding screens' rendered strings · the landing and marketing copy · a rendered `generate-report` output · the §0.3 raw counts · and the app source with **every line matching `CUL-[0-9]`, every line matching `docs/`, and every `// *-ok:` marker stripped** (those markers *are* CLAUDE.md, restated in the code).

**Excluded, verified by grep before the packet is sent:** `CLAUDE.md`, `STATUS.md`, `docs/sessions/`, every `*-requirements.md`, `docs/personas.md`, §1 and §4–§6 of the evidence pack, and the intake. **The memo prints the file list verbatim.** The seat is told the repository is out of scope.

**Its deliverable is fixed in form before it sees anything: eight questions, ≤40 words each — and every anchored seat answers the identical eight in its own sealed verdict, so divergence is measured rather than described.**

1. Who is this for? 2. What does it do that the user could not otherwise do? 3. What problem does the user have the morning they install it? 4. What is the single screen that justifies the app? 5. What would you pay, and once or monthly? 6. What does the user do today instead? 7. What is it competing against? 8. What would make you delete it in week two?

The memo prints the grid. **Cells where the de-anchored reader and the ratified strategy disagree are the finding.** This seat does not vote on go/no-go; its verdict is a separate exhibit.

---

## §W0 — The founder's arithmetic *(→ memo §6; before any seat opines)*

Three tables, no adjectives.

**(a) Cost to stay alive.** Monthly run cost at 0 / 100 / 1,000 / 10,000 users — Supabase, Anthropic per D-M7 (**re-derive it: pack §7's 50k extrapolation does not reconcile with its own per-user figure, so neither may be used unchecked**), Apple's $99/yr, domain, Resend, EAS, and agent spend measured rather than assumed. **Name the user count at which this app costs more per month than the PM will pay under Pets > $ as ratified.** That number has never been computed, and it is the real reason the cost caps failing open at five call sites matter: not scale, *solvency*.

**(b) What enough looks like.** From intake Q5, three rungs — break-even · worth-the-evenings · replaces-income — with concurrent payers and rough downloads for each, conversion named and ranged, Apple's 15% Small Business rate modelled.

**(c) The break-even gate on W5.** Compute the free→paid conversion rate that makes the ratified shape gross-margin positive, and set it against the 2.1% freemium median, the 2.9% Health & Fitness median and the 10.7% hard-paywall median. **If it exceeds all three, that is a finding for the kernel, and only three things close it: COGS per free user falls 5–10×, conversion beats its category by 3–7×, or the shape changes.** A forced choice produced by arithmetic outranks every qualitative argument in W5. Show the working; a verifier must be able to reproduce it.

**Done when** the PM can read one line — *"this needs N payers to stop costing money and M to be worth the evenings; today it costs $X/month at zero users"* — and every later recommendation names which rung it moves.

## §W1 — The diagnosis *(→ memo §1)*

Rumelt's kernel: **diagnosis → guiding policy → coherent action.** The diagnosis names a **mechanism**, not a vice, and carries **the observation that would disconfirm it.**

A hypothesis is supplied **to be attacked, not adopted:** *this system's feedback loops all terminate inside itself; the only loop it has never closed is the market loop.* Its narrower rival: loops here demonstrably do close — every guard fires, every adversarial review changes code, every PR merges — so if exactly one wire is missing, the action is to attach one wire rather than overhaul a machine that works.

**These two are the same claim in two verbs, and a panel offered only these two has been told its answer.** Produce **at least four** candidate diagnoses and rank them. Three are mandatory entries whether or not any seat believes them:

**(R1) The loop is not missing; it would return null.** The value hypothesis is false. Available evidence: Tend & Mend shipped the same four-cell wedge free five months ago; every incumbent trip-wire inert for eleven weeks; PRO-TECT found no survival difference for clinician-consumed patient data (HR 0.99, 95% CI 0.83–1.17, n=1,191); Fuzzy Pet Health raised $80.5M against this thesis and shut down; the closest working analog's doctor report is *a trust signal, not a growth engine*. **If R1 holds, attaching the wire is the wrong action**, and the right one is to change the artifact, the indication or the payer before any launch.

**(R2) Nothing is broken.** A four-month-old pre-launch product with no users is the modal case; the session-count figure is an artefact of a convention instituted 2026-07-24; the correct action is to continue, and this memo's existence is the error.

**(R3) The constraint is the operating model, not the founder.** An infinite-capacity build partner and a zero-capacity everything-else partner. Agents cannot send an email as a human, be a stranger using the app, or sit in a waiting room — so effort routed to the only work the system could perform. The action is then *point the agents at distribution*, which no prior framing has proposed.

**Barred as a diagnosis:** *"the PM should prioritize better"* / *"should prioritize launch"* — goals wearing a diagnosis's clothes — **and any diagnosis whose action set is indistinguishable from the supplied hypothesis's.** If the ranked #1 *is* the supplied hypothesis, the memo states the prior odds it assigned before reading the pack and why the pack moved them.

## §W1.5 — The denominator *(→ verdict box)*

A go/no-go for a profitable-solo ambition that never compares expected value against forgone earnings is a preference survey. State **(a)** the forgone-income figure at the founder's own stated alternative — **or say plainly if the hours are non-fungible, which changes the answer completely**; **(b)** expected value at the intake Q5 bar, discounted by base rates rather than by narrative; **(c)** the comparison, **including the case where the honest conclusion is that this is a hobby which may pay for itself, deliberately chosen.**

Sunk cost is excluded by construction: the four months are gone and are not an argument for the next twelve. They enter only as evidence about the founder's **rate**, which is W5 Axis 2 (v)'s input.

## §W2 — The crux *(→ memo §3, ≤150 words)*

Each seat names the crux in one sentence and defends that it is the hardest part of the climb. Collect into a ranked list with a **cost of being wrong** per candidate.

**Apply this test to every candidate: a crux whose stated remedy can be completed without changing the business is a symptom, and ranks below one that cannot.** *"Nobody outside the household has ever used this"* is fully discharged by TestFlighting ten friends, which changes nothing about the business. Three candidates must be scored against it:

1. *There is no mechanism by which a stranger with a sick pet encounters this product, and building one is the single capability the operating model cannot substitute for* — agents write code; they cannot be a person in a community for six months.
2. *The product's value depends on an event — a vet directive — the founder cannot observe, trigger or reach, and every channel in the category runs through the moment of prescription.* If this is the crux, the shape is forced toward Axis 1 (d).
3. *The founder's willingness to be in sustained contact with strangers* — the one candidate that changes the answer rather than restating the problem.

## §W3 — What is working, and must be protected *(→ memo §5)*

The PM asked this. Answer it literally, at the **same evidence standard** as the criticism, off Lane 9. Name what would be destroyed by acting on this memo's own recommendations. **This section may not be shorter than the section naming what is not working.** A purely prosecutorial read biases the panel toward a rescue narrative when the real question may be positioning.

Include the question nobody has asked: **is the operating system the more valuable artifact than the app it produced?** One person shipped 129,698 lines, ~830 PRs, 8,290 tests, 14 build-failing guards and a real case-crossover engine with property tests in about four months. If the founder's durable asset is *I can build production software this way*, then the decision record is the portfolio rather than the bloat, and "product direction" has a completely different answer. One seat argues this seriously; it is W5 Axis 2 (v).

## §W4 — The competitive read *(→ memo §4, ≤250 words)*

The PM named competitive space **first**.

**Settle the Tend & Mend premise before reasoning from it.** Existence, date, price and rating count are `[E]`-solid; *"nobody came"* is not, and the pack's own §8 refuted two legs of the earlier framing (the engine attribution was mis-sourced; the "we missed it because it markets in owner language" explanation is refuted — it ranks **#1** for "cat vomiting tracker"). Run the free diagnostic first, in-session:

1. Apple Search API rank across the wedge's owner-language queries, and whether it has moved since April.
2. Version cadence since 2026-04-10 — **an abandoned app and a maintained one look identical in a ratings count.**
3. **The developer's sibling apps (dog, human IBD).** If all three show zero, the zero is a portfolio-wide prompting artefact and carries no information about any of them. If one has ratings, the zero is real.

Publish the result `VERIFIED live`. Then enumerate every reading at equal length before choosing: prompting artefact · real, wedge unwanted · real, wedge wanted but undiscoverable (**a distribution finding, not a demand finding**) · real, product bad · five months is early · **positive signal — independent convergence on the same wedge by a stranger, with no traction to defend.** Whatever survives, say whether it predicts yours.

**Admissibility rule, binding on every seat:** the zero may be cited as evidence about *distribution difficulty* and about whether the lane is *occupied*. It may **not** be cited as evidence about *demand*. A seat that uses it as a demand finding has its claim downgraded by the Steelman.

**In-session, do what is actually available:** Search API metadata, listing copy, screenshot text, review text and version history for the named five, each tagged `VERIFIED live` with its fetch date. **The hands-on week is commissioned, not performed** — installing the top three and completing each onboarding against the real cat's record becomes a row in the ranked test list with a date, an owner, and the specific question each install answers. A desk-only W4 is marked **"thin — desk research only,"** in those words. **A panel that claims to have used an app it could not install has committed the exact laundering §8 catalogues.**

**The durability question a competitive sweep structurally cannot answer.** Pack §5 is a snapshot, not a moat. State what is defensible in 24 months, assuming any competent solo developer can build this surface in months (this project just proved it) and an owner can paste eight weeks of notes into a general assistant for free. Rank the candidate remainders by how long each holds: the longitudinal record · the clinical guard architecture · a vet relationship (durable, currently n=0) · the independence stance · the engine (replicable) · the UI (replicable in a weekend). **If the only durable remainder is the vet relationship, that is the same conclusion W5 Axis 1 (d) reaches from the payer side, and two independent routes arriving at it is worth a line in the kernel.**

## §W5 — The shape ruling *(→ memo §8)*

One forced choice, defended, across **two axes that must both be ruled.**

**Axis 1 — who pays and how.** (a) freemium subscription as ratified · (b) paid up-front at install · (c) one-time or per-episode purchase after first value — note (b) and (c) have different funnels and the 10.7% hard-paywall figure describes neither cleanly · (d) a third-party payer, named specifically: vet practice, insurer, pharma/CRO, specialty referral · (e) free app with revenue from an adjacent line the founder states and defends, **including the one nobody will name: affiliate revenue on prescription diets, which must be explicitly ruled out with its reason rather than left unconsidered** (see pack §5⑥ on CompanAIn — and note *Culprit* is the product's literal name for independence) · (f) stop.

**Axis 2 — what the product is.** (i) the general pet-health record as built · (ii) narrowed to one bounded indication that terminates well, sold as a 12-week thing · (iii) narrowed to the species and indication with the larger volume (see §W8) · (iv) **the app becomes the internal tool for a service the founder personally performs** — read an owner's record, write the vet summary by hand, $50/case — which produces revenue on day one, needs no distribution machinery, and fits "profitable solo business" better than 90,000 downloads · (v) the app ships free and **the operating system is the product.** (v) is §W3's question promoted to a live option; a memo that concludes in W3 that the operating system is the more valuable artifact and then rules only on Axis 1 has contradicted itself.

**(f) is specified to the same depth as the rest, or the go/no-go is not real.** A stop ruling must name: what stop means concretely (archive read-only · open-source under what licence · publish free with what ongoing cost and what shutdown date · sell the codebase or the spec corpus, to whom · keep it as personal software for one cat) · what happens to the four existing pets' records and under what notice · what the founder does with the fifteen hours · **what is salvaged** · **what restarting would take**, so that stopping is reversible-with-a-price rather than a cliff. A no-go with no named day-after is not an option the panel actually offered.

**Rule on reversibility, not only merit.** At n=0 the panel is over-deciding if it picks a shape without naming what reverses it. Per retained option: what it costs to keep reachable from today's binary, the observation that reverses it, and the date. **Rank by information per dollar of irreversibility**, and say which options the panel is *choosing between* versus which it is merely *ordering*.

**Binding ruling constraint.** The panel may **retain** a third-party-payer option pending evidence; **it may not select one.** Selecting (d) commits a zero-cash solo founder to an enterprise motion — weeks for solo practices, one to two quarters for group and specialty, three to seven for corporate — on the testimony of a synthetic seat that has never spoken to a veterinarian, an insurer or a CRO. The permissible output is *"(d) retained, conditional on N conversations with real [x] by date D, with these three questions and this refusal-pattern instrument."* **The constraint is symmetric: the panel may not rule (d) out on synthetic reasoning either.**

### Three facts the ruling must metabolize

**1. Does the wedge terminate by construction?** State it at full strength: a diet trial is 8–12 weeks and then ends in a diagnosis, a resolution or a give-up; the success case churns; engagement is bounded by a disease course rather than a funnel; and a 7-day trial asks for a $39.99 annual commitment against a 12-week need. No prior analysis in this corpus made this argument.

**Then state its counters at full strength.** Food-responsive enteropathy and CAFR are chronic and relapsing, and a *failed* trial escalates to a longer chronic work-up, so both forks arguably extend rather than end · **the second act is already built and switched off** — the vet-visit companion and `/rundown` make the annual visit the recurring unit, 2–4 touches a year for the animal's life, so "no second act" is partly a claim about `app_config` · the closest analog retains chronic-illness users for years on this shape · multi-pet households restart the clock · **at zero acquisition spend the churn objection is an argument against paid acquisition, which is already banned.**

Required outputs: expected engagement duration in weeks derived from the protocol; **expected lifetime episodes per pet and per household**, which is the number that actually decides subscription-versus-one-time; and a read of the one longitudinal record the company owns (1,024 events across a span no single trial covers). **Then rule on term separately from shape** — 17–32-day trials convert at a 42.5% median versus 25.5% for ≤4 days — because this fact supports a term ruling and only weakly supports a shape ruling. Hand the original wording to the Steelman as a named target.

**2. Pets > $ has a cost, and this corpus does not know what it is.** The 2.1%-versus-10.7% comparison is freemium versus *hard paywall*; both the generous and the stingy version of this product are freemium, so that figure is an **upper bound on the cost of Pets > $, not a measurement of it**, and the 2.9% Health & Fitness median is the more honest anchor. State the cost as a range with its instrument named, **or state that it is unmeasured.** The real decision variable is *which* features cross the line, not *whether* a free tier exists — and settling that is a price/gate test, which needs users, so it is a post-launch instrument with a date rather than a pre-launch opinion.

Two facts cut the other way and must appear: Health & Fitness has the highest trial-to-paid conversion of any category (~35–37.7% vs a ~25.6% global median), and the free tier holds the only surface in this product with sustained use while the Premium bundle's lifetime usage is 56 calls, 40 of them from a QA harness. **A recommendation to overturn the constitution on the strength of 2.1-vs-10.7 is downgraded by the Steelman under the rule already in this brief.**

**3. Who already pays money for this exact artifact.** Nowhere in 1.34M words does anyone ask. Three candidates with real budgets, all absent from the record: **pet insurers** (claims substantiation, where the owner has direct monetary incentive) · **veterinary pharma and CROs** (feline chronic enteropathy and canine CAFR studies recruit owners and pay per completed home diary) · **specialty internal-medicine referral practices** (diet trials are protocol, and the referral letter is the product). Each is B2B2C against a budget, and the app already produces the exact artifact. Price finding out — it is a few emails.

Add the **buyer-side read**, which every prior framing treated as a failure state rather than a live option: is the case-crossover engine, the escalate-never-reassure architecture, or the 368-session decision record worth something to a vet-SaaS incumbent or an insurer **today, pre-launch**? Five emails would price it.

## §W6 — The launch-forcing plan *(→ memo §9)*

Executable alone, with no money, at low capacity.

**Rule the launch vehicle explicitly.** "Launch versus do not launch" is a false binary, and the binding parameters put the App Store itself on the table. Rank at least four by **strangers-reached ÷ irreversibility spent**, and **define what *launched* means before setting a date — three of these four make it true and only one is permanent:**

(i) **App Store submission as scheduled.**
(ii) **A public TestFlight link as the channel, not as a rehearsal** — roughly one day of review, up to 10,000 external testers, a URL postable anywhere, crash logs included. Real strangers next week at zero cash, spending neither permanent thing, and outside 4.3(b)'s "does not attract customers" removal criterion entirely. Every irreversibility argument below is an argument *for* it.
(iii) **Shipping the public vet-report share link** (PR 6, built, deliberately unshipped) — the only distribution asset in this project that is not iOS-gated, and the only thing that makes pack §4.6's *"the vet never touches a Culprit surface"* false.
(iv) **Do not launch in 2026, chosen deliberately**, dated and instrumented, with the date it is revisited. (Carried by the CTO seat.)

The panel must also defeat or adopt a fifth: **launch in November with the flags on** — eight weeks turning W6.1's dark surfaces on, the report redeployed, then submit.

**A date, and the cut list beside it.**

**The irreversibility list gates the date independently of the schedule.** After submission two things are permanent: the **Seller name** (an individual developer account publishes the founder's legal name on every shipped version, permanently) and the **app name and store slug.** These are a different class from lead times and must be treated as such.

**Instrumentation is a gating dependency, not a recommendation among twenty.** The ratified strategy's own §20 says instrumentation precedes the paywall; it currently sits in milestone M6, after submission. The first real cohort is the only one that can answer any open question, and it will be spent unmeasured.

**Support is a workstream, a cost, and an emotional liability.** `support@getculprit.app` is simultaneously the support address, the App Review demo account and the Resend sender. On day one a distressed owner emails about a sick pet: who answers, in what time, with what boundaries? Intake Q13(b) is this policy's source. This is the single most attention-consuming thing about launching, against the constraint everyone agrees is binding.

**Two undesigned guaranteed exits:** the pet gets better, and the pet dies. Both are certain in this category. Bereavement in an app that speaks in the pet's name is an ethics and voice problem with no spec, no mock and no mention anywhere in 1.34M words.

**Shutdown obligation.** If the founder stops in month 14, what happens to users' health records? A health-data product has an obligation on wind-down, and the unsigned drafts almost certainly do not cover it.

### §W6.1 — The flag manifest, as the shortest path to a shippable product *(→ memo §9, and probably §1)*

`select key, value from app_config`. Every rollout flag and every allowlist-shaped flag as: **flag · what it turns on · built and tested? · what breaks if it ships on · what is still needed · the reversal.**

Then the finding the table exists to produce: **how much of the product the PM believes he has built is currently off, and the shortest ordered sequence of flips that turns the shipped binary into the product he thinks he shipped.**

Where a flag is off for a good reason — CUL-552's 5.1.2(i) consent gate, a beta eligibility split, a spec's own dark-ship rule — say so and leave it off. Where it is off because nobody decided, **that is a decision brief, and it is the cheapest one in the memo.**

Ask, the home-screen widget, log-picker v2, cough/sneeze capture, Noticed and vet visits are built, tested, merged and **switched off**; `/rundown` is complete, in the binary, and reachable from exactly one flag-gated screen. **This section reports a capability, not a failure** — a large part of the product may already be finished and merely unswitched, and the highest-leverage act available may cost a config write and zero code. It is exactly what a business-shaped panel would never go looking for.

## §W7 — The 90-day evidence contract *(→ memo §10, a table)*

One row per strategic bet: **bet · metric · instrument · continue-threshold · kill-threshold · decision date · who decides.** A bet with no instrument is not a bet, it is a hope — and this makes instrumentation a dependency of the bet rather than a line item competing with it.

**One row is mandatory and is not about the product: the founder keeps working on this.** Bus factor is 1 and continuity is the bet every other row rides on. Metric, instrument, continue-threshold, kill-threshold, decision date, and a "who decides" that **cannot be the founder alone.**

## §W8 — Product direction *(→ memo §7, ≤400 words, not optional)*

The PM asked where the product is heading. Do not convert this into a business-shape ruling.

- **Which species and which indication is this actually built for?** All real data is one cat with chronic vomiting; the per-incident AI chain is `analyze-vomit` / `analyze-stool`. **Elimination diets run at far higher volume for itchy dogs**, where the outcome measure is a pruritus score over weeks, not a photographed incident. The founder's own animal may have biased the product toward the smaller half of its own wedge. State the relative volumes and **what fraction of the built surface serves the larger half.**
- **The funnel to the wedge does not exist.** Onboarding never mentions a diet trial; the trial lives two taps inside the Pet tab, below the fold, behind an empty food library. Day 1 with zero events renders the *lapsed-user* state, because `hasRecentActivity` is false until an event exists inside 48h. There is no reminder, by policy, for a user who must log daily for 8–12 weeks. Name the smallest set of changes that makes the shipped app the product the PM thinks he built, and name what breaks.
- **For each of the last 90 days' tracks — the Signal fold, Home v2 / Noticed, vet visits, the taxonomy expansion, the polish track — requested by a user, or discovered by a session reviewing its own prior work?**
- **Rule on iOS-only.** It is in the binding parameters and no other workstream owns it. State the US pet-owner platform skew, the Expo/RN port cost in PM-hours at low capacity, what Android buys and what it costs — then rule, or name the deferral date.
- If the memo refuses to answer part of "product direction," **it says so and says why.** Silent substitution is barred, and announced substitution applied to *ordering* does the same damage.

---

## §M1 — Against anchoring

**Seeded refutations, and an audit with no quota.** Every packet carries pack §8 in full; every seat confirms it has read it. **Each seat then audits four further load-bearing claims of its own choosing from §2–§7 and reports the result of each, whether it broke or held.** A break is reported in one fixed form: the quoted claim, its § and line, the specific check performed, and the exact query, URL or `file:line` another person can re-run. **Four holds is a passing answer.** A break with no repeatable check is struck from the record and counted against the seat — a worse outcome than four holds, not a better one.
*(A quota for finding a fourth error is a quota for inventing one, inside a document whose §8 exists because a lane fabricated a statistic. Inventing is cheaper than finding and indistinguishable in the output.)*

**Verify at use, not at citation.** Three of six competitor products had moved within six days of the July sweep being committed. Repo claims about production are re-checked against production; spend your two query credits on the number your recommendation rests on.

**Apply the distrust inward. A count is not a rate.** Nine accounts, several of them tests, cannot produce a "67% drop-off." Eight food extractions is a count. Put bounds on internal evidence or do not speak it as a measurement.

**The internal base rate, at its real strength.** Of 367 session records, 11 (3.0%) are store-or-submission-shaped **by filename**, and none since 2026-08-12; the App Store Launch project closed 0 of 25 issues in 22 days while eight tracks ran concurrently. **That measures what got recorded, not what was chosen.** Seats may use the 0-of-25 and the 3.0% as base rates. **No seat may assert intent from them.** A seat claiming avoidance rather than sequencing or classification drift must name the evidence distinguishing the three — and the PM's own intake answers are better evidence than any of them.
*(The classification is soft: `docs/nyx-onboarding-requirements.md` is CLAUDE.md's named spec for the app-store-readiness onboarding revamp, and the polish, Geist and accessibility tracks are submission-relevant by any definition Apple would recognize. The pack itself flags a neighbouring claim as "a filename claim, not a content claim.")*

## §M2 — Against unfalsifiable claims

**Every strategic claim ships as four things:** what would have to be true · the single observation that would disconfirm it · the cheapest test that produces that observation · the date. Roger Martin's rejection test applies: *if this were shown to be untrue, would you reject the associated possibility?* If not, it is a nice-to-have and it is cut.

**Base rates before opinions.** No seat states a date, a conversion or a retention number without first writing the base rate and its source. **Admissible base rates are only those in pack §6 that §8 did not break, plus internal rates computed by a §0.3 query with the denominator stated.** Any other is written `[MK — unverified]` and **may not carry a recommendation, appear in the kernel, or appear in the verdict box.** A seat needing an unavailable base rate writes one line — *"this claim requires a base rate we do not have; the cheapest way to get it is X"* — and that line goes into the ranked test list.
*(§8 records five fabricated or mis-sourced figures in exactly this class. "Write the base rate first" otherwise invites a second pass of the same failure, laundered through a rigor ritual.)*

**The one-number rule.** Each seat names the single number that would flip its recommendation. Collected, these are the panel's falsification list.

**Forced falsification of recommendations, not just claims.** CLAUDE.md's Definition of Done already requires naming the counterexample you tried and why it held. Lift it to the strategy level: **any recommendation with no stated counterexample is struck from the memo.**

**Each seat names one recommendation it believes the PM will not actually do, and why.** Checked at the +14-day scoring. A prediction about the founder's behaviour is falsifiable in two weeks; a prediction about other seats' taste never is.

## §M3 — Against severity mistaken for insight

**The Steelman grades, with a receipt; it does not veto.** A veto operates by silent subtraction, so a reader cannot distinguish *the panel found nothing* from *the panel found something and cut it* — in an engagement whose purpose is findings the PM does not already have. It runs **after the draft exists**, as a review pass over the memo, with a table in the appendix: each attacked thing · its steelman · `HOLDS` / `WEAK` / `NONE`. **A `NONE` is struck from the memo. A `WEAK` ships with the grade printed beside it in the memo itself**, not buried in the appendix. The same instrument applies to the DoD-style counterexamples: the Steelman, which wrote none of them, grades each, and a recommendation graded `NONE` is struck.

**Its standing runs only to text in the panel's own voice** — the kernel, the verdict box and the shape ruling. **It has no standing over the Short's sealed verdict, the verbatim dissent, or the PM rebuttal**: those are labelled advocacy and record, and are read as such. (The Short is *required* to state its case at the outer edge of its evidence, where a strict standard would strike it automatically.)

**Equal evidence standard, never equal length.** A steelman must cite at least as many `[C]`/`[E]`-graded facts as the attack it answers. Padding to a word count violates the thin-rather-than-pad rule.

**The panel's own output is tagged `[SYNTHETIC]`.** A synthetic panel that rules "your synthetic validation is invalid" and then signs its own verdict has performed the disease. The memo is **at best a hypothesis generator**, and its findings must be ranked by *which of these could be settled by one real human this week.*

## §M4 — Against a beautiful document that changes nothing

**The displacement ledger.** Every recommendation names what stops, as a **Linear project or issue identifier with its current state** — *"pauses the Vet visits project (CUL-898…906) to milestone-only"*, *"closes CUL-XXX as won't-do"*. A row naming a category rather than an identifier does not count, and the recommendation does not ship. **The memo prints the count of In Progress projects before and after the plan; if it does not go down, page one says so.** In this organization additive advice is free and therefore worthless.

**The PM-hour budget** is the number the PM gave in intake Q7. Every recommendation carries an hour estimate with a one-line basis (*"comparable to CUL-891, which took N hours"*). The memo prints the column and its sum. **The plan is valid only at ≤75% of that budget** — this repo's estimation record is uniformly optimistic and the remaining 25% absorbs it. **The first action takes ≤1 hour**, so a zero-capacity week does not reset the plan to nothing.

**Five panel-level predictions of record**, each with a date, a numeric threshold and a scoring trigger. **A prediction is not of record until it is a Linear issue** (team Culprit, `Waiting on PM`, due = its resolution date) whose description carries the threshold and the binary test. The memo prints the five with their `CUL-NNN`; per-seat predictions live in the appendix marked *not scored*. Before the memo closes, create **"Score the 2026-09 strategy review"**, due +14, whose description contains the top recommendation verbatim and a binary test for "started" (*"started = the email is in the Sent folder"*, not *"work has begun"*). **If neither that issue nor a scheduled Routine can be created, the memo states in §2 that its own enforcement mechanism does not exist.** Thirty predictions nobody scores is the July retro with more words.

**One irreversible real-world action**, with its timestamp in the memo. The engagement does not close until one of these has happened: an email sent to a named veterinarian outside the household · a TestFlight invite accepted by a named stranger · an appointment on a calendar with another person's name on it · the second household user interviewed on the record. **A flag flip, a Linear issue, a doc and a plan do not qualify** — all four are reversible, internal, and are exactly what the last several months already produced.

**The second party comes from intake Q8, not from the panel.** If he names one, the plan hangs from that date and the memo prints the role and the telling date. If he declines, **the memo says on page one that its own recommendations are unlikely to bind**, and reshapes accordingly: shorter horizons, smaller irreversible steps, and an explicit discount on the go/no-go for self-administered enforcement. **The panel may not invent a commitment device on his behalf.** Every other enforcement mechanism here is self-administered by the same person who is the diagnosed constraint, which is precisely why the July fix did not hold.

**Two blind syntheses.** Every prior design isolated the seats and left the synthesizer unguarded — one agent who has read all ten verdicts, knows who commissioned the engagement, and writes the one-page verdict box. **That is where polite convergence actually happens.** Two independent syntheses of the identical sealed verdicts, written blind to each other, with the divergence reported as `N/9` (see the ballot header).

**The pre-mortem, in the past tense.** Prospective hindsight raises correct identification of causes by roughly 30%, and the grammar is load-bearing — *what did go wrong*, not *what could*: **"It is 11 September 2027. Culprit has 400 monthly actives and $0 revenue. Write the post-mortem."** Then the inverse, the pre-parade: **it worked — what was true that we did not believe on 2026-09-11?**

**The PM rebuttal, on the record.** Before the memo closes, the PM responds. He holds context the panel structurally lacks. **His disagreement is evidence, not resistance**, and it is printed unedited.

---

## §S — Five stress tests the panel may not dodge

**These are not the PM's five questions.** His are answered separately, literally, in his words and his order, in memo §4–§7. **Do not merge the two sets.** Each stress test gets 150 words in the appendix, ending in `[VERIFIED live | REPO-CLAIM | ASSUMPTION]` on its load-bearing number.

**S1. A free competitor shipped the whole wedge five months ago and has zero ratings.** Settle the premise (§W4) first, then explain their zero, then say whether the explanation predicts yours.

**S2. Name the first hundred users.** Not a persona, not a segment — the literal mechanism by which human #1 through #100 installs this. If the answer contains "organic," "vets," or "word of mouth," keep going until it contains a name, a URL and a date. Zero budget is a given, not an excuse.

**S3. The vet report has never been read by a vet, the gate has been open 71 days, and it costs one email.** What is the actual reason? And what is the answer if a vet reads it and is simply **indifferent** — which is the modal outcome, not a tail case, for a GP with an 11-minute appointment for whom an unsolicited owner-generated PDF is cost and possibly chart-review liability?

**S4. Calibration, scored in both directions.** CUL-914 measured *the L-17 disclosure line on the Noticed pairing* true under the null at a 22–77% print rate: one line, one surface, one flag-gated feature shipped days ago. Do not generalize it past that without saying so.

**Score both halves.** The defect is real and in a shipped surface. **The detection is also real, and §W3 must weigh it: a solo shop that measures its own false-positive rate before a user sees it, files it Urgent, and writes it into the manual within a day is doing something most funded teams do not.**

Then **read the observed yield before generating a synthetic one.** Production holds 5 `ai_signals` rows across 1,024 events on the founder's cat and 0 `vet_reports`. **Settle first what an `ai_signals` row counts** — a distinct finding, a daily cache entry, a phrasing call — because §8 is a register of counts misread as rates. Then state findings-per-hundred-events on the densest record in existence and extrapolate to a wedge user with ~50 events over eight weeks. Then run the null replay and the sparse-trial replay (Guardrails carve-out). **Too quiet for the wedge user and too loud on noise is a calibration finding, not a contradiction** — both can be true, and together they define the operating window.

**S5. What is enough, and how far away is it?** Take the PM's number from intake Q5 and work backwards at the blended net rate to a required payer count, beside the monthly cost to keep the thing alive (§W0). **Then, and only then,** the reference class: median ~$72/month a year in; 17.3% clear $1,000/mo; 4.6% clear $10,000/mo. Say which rung sits in which percentile, and which rungs are reachable without a distribution machine.

**If the honest shape is Bearable's** — roughly $30k/month after four and a half years, two people, grown through chronic-illness communities, with the doctor report a trust signal rather than a growth engine — **say so plainly. It satisfies every parameter the PM set and implies a completely different plan.**
