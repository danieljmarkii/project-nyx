# The engines vs. their own history: replaying the Signal and the vomit read (September 2026)

**Date:** 2026-09-24
**Status:** 🧊 Frozen point-in-time evidence capture (research brief, see `docs/research/README.md`). Correct additively, never in place.
**Issue:** CUL-1117 (discovery). Proposed build project and decision briefs live in Linear; this file carries evidence, candidates and open questions, not decisions.
**Companions:** `docs/research/2026-09-engines-evidence-pack.md` (the three literature lanes, with every source) and `docs/research/2026-09-engines-source-maps.md` (the engine map, the vomit-read map with its twelve-surface table, and the prior-work ledger). Reproduction tooling: `scripts/engine-replay/`.

**Method.** Six isolated research lanes (a source map of `generate-signal`; a source map of every path from a logged vomit to an owner-facing escalation; a ledger of what the four prior dogfood briefs recommended and what became of it; the statistical methods frontier; the veterinary vomiting evidence; AI triage calibration and alarm fatigue), plus two things no prior brief did:

1. **A replay of the shipped Signal engine over the real record, one evening at a time.** The record is reconstructed as it stood at 21:00 each evening (rows created by then and not yet deleted; photo fields as they were before any later owner edit), and fed to the unmodified `detectSignals` → `curateFindings` → template phrasing path. 129 evenings, 2026-05-19 to 2026-09-24. The replay of 9/23 matches the live `ai_signals` row card for card and word for word.
2. **A replay of the per-incident escalation floor.** The shipped `computeContextualFlags`, fed the way `analyze-vomit` feeds it, reproduces all 43 stored contextual flag sets on the record's live vomit reads. A proposed recalibration is then run over the same reads.

Then an isolated adversarial pass tried to break the proposals and the evidence claims (§8). It failed two proposals as first written and downgraded three claims; both corrections are folded in below, and §8 keeps the record.

**The subject.** One real pet, as in every prior brief: Nyx, the PM's 3-year-old cat (1,111 live events, 2026-05-14 to 2026-09-24). The other three pets in production are a QA clone of Nyx (frozen at 8/2), a test cat and the App Store demo dog; all excluded, per the 2026-08 brief's §9 rule.

---

## §0 The answer in one paragraph

Both engines are rigorous about each sentence and unaccountable about the whole. They do not know whether they were right (nothing measures a miss, an alert's burden, or an outcome), they cannot hear an answer (a vet visit, a treatment or an owner's "my vet knows" changes nothing they say), and they cannot see the animal (weight, treatment and visits are not inputs). On the real record that shows up as a Home screen that asked to book a vet visit on 101 of 129 evenings and kept asking every evening after the visit happened; a per-incident read that escalated one vomit in four at a single urgency, with its intake flag firing on meals that were logged but simply unrated; and a 15% weight loss, the most clinically important fact in the record, that neither engine can see. The step change is not a new detector. It is an engine that is **measured** (replayed and simulated against known truth before anything ships), **calibrated** (urgency in tiers, each ask stated once), **accountable** (it holds a care state per concern and listens for change rather than repeating itself) and **whole-animal** (weight, treatment and visits enter the record it reads). The moat is the loop that results: the only pet product that knows, per alert, whether it was right.

---

## §1 What changed since the August brief (2026-08-13)

| Fact | Source |
|---|---|
| **Weight 3.73 kg** measured 9/16, the record's only weigh-in. The profile said **4.4 kg** from June until that reading overwrote it; the PM confirmed 4.4 kg was a real weigh-in. **−0.67 kg, −15.2%.** The June value survives only in the three June briefs and in a QA clone taken 8/2. | `weight_checks`; `pets.weight_kg`; PM, this session |
| A **vet visit** on 9/16 (the vet visit companion shipped for every account 9/23). | `vet_visits`, `vet_appointments` |
| **Prednisone** (oral) started 9/21, indication "Coughing". | `medications` |
| The diet trial (Royal Canin Selected Protein PR, GI, started 7/26) was **extended to 84 days**. | `diet_trials` |
| **Cough** is now a typed event (30 events, 7/1 to 9/23; W1 went GA 9/22). | `events` |
| **Meal intake ratings stopped.** 75% of meals rated May 11 to Jul 26 (62 to 96% per week); 26 of 35 unrated the week of 8/10; **3 positive ratings across 209 meals from 8/17**. The PM: "software labeling of intake is tough" (CUL-1118). | `meals.intake_rating` |
| **Vomiting on the trial:** 2.86/week in the seven pre-trial weeks (20 in 49 days) → 1.61/week over the trial's 61 days (14). Exact conditional binomial, one-sided **p = 0.067**: suggestive, not established, and confounded by the feeding-structure change the August brief described. **September alone: 2.33/week (8 in 24 days), p = 0.40 against the pre-trial rate.** | `events` |
| **The early-morning bile phenotype returned.** The August brief (F5) recorded it as having stopped in the trial's first 19 days (one-sided p ≈ 0.07, "suggestive, not conclusive"). September has three bile-positive early-morning vomits: 9/4 07:02 (3.8 h after the last logged meal), 9/7 06:00 (4.7 h), 9/22 01:30 (3.5 h). The hedge in F5 was right; the pause was not a cessation. An engine that had said "the empty-stomach vomiting has stopped" would have been wrong a month later. | `events`, `event_ai_analysis` |
| **Signals v2 lanes are live** (empty-stomach timing, trial response, photo composition, gap shortening; GA 8/20) and chronicity now reads cough with its own floors (v33, 8/29). | lane A map |
| **Two plumbing defects bias any before/after claim:** the dose query has failed silently since 6/23 so the engine reads zero doses (CUL-1099), and event reads are unpaginated past the row cap (CUL-989). On this record the dose defect changes nothing visible (a replay with doses produces an identical ledger, because the regimen spans cover the same days); on a record that logs ad hoc doses it would. | lanes A, C; this replay |

---

## §2 The Signal, replayed (129 evenings)

**Read this section as the answer to "what does today's engine say about this record, evening by evening", not "what the owner saw on each date".** Chronicity ⑦ was merged 6/25 but gated until the v32 deploy on 8/21, and the v2 lanes went live 8/20, so before late August the owner saw fewer cards than the replay shows (adversarial pass, E3). The replay evaluates the engine as it ships now, which is the question a step change has to answer.

### What it said

| | Evenings (of 129) |
|---|---|
| At least one safety-class card | **119** |
| "…worth booking a vet visit" (chronicity, firm tier) | **101** |
| "…worth a call to your vet" (a photo red flag, 14-day window) | 22 |
| "…worth a word with your vet" (worsening, standard) | 23 |
| "…worth mentioning / reviewing with your vet" (insight cards) | 77 |
| Evenings with two or more safety cards | 69 |
| Evenings after the 9/16 visit still asking to book a visit | **9 of 9** (two cards each: cough and vomiting) |

The card-set timeline, compressed: first-week food cards (5/19 to 6/8); photo red-flag cards on 22 evenings (5/24 to 5/31, 7/9 to 7/19, 9/22 onward); vomiting chronicity from 6/7 on **110 consecutive evenings** (firm tier on 101 of them); "worsening" on 14 evenings (vomiting 5/23 to 5/24; itch 7/16 to 7/22 and 9/11 to 9/17); the post-prandial timing card from 7/17; cough chronicity from 8/2; a trial-response card on three evenings (9/2, 9/3, 9/6).

### Five findings

**R1. The ask never resolves.** The vomiting chronicity card is correct: by the vets' own disease-activity index, vomiting every two to four days is moderate to severe (FCEAI bands, pack Lane E §3), and "worth booking a vet visit" is the right disposition for a chronic pattern (Lane E §4). What is wrong is that it is a **latch with no reset**. It asked on 110 consecutive evenings, it cannot know the visit happened, and after the visit it had nothing new to say, so it said the old thing. The data the engine would need to stand down (a logged visit, a started treatment) is already in the database; the engine reads neither (lane A).

**R2. The engine cannot see weight.** `detection.ts` has no weight input (`lib/weight.ts:12-16` says so). The June 4.4 kg reading was overwritten in place when the 9/16 weigh-in arrived, so the history needed to compute the loss no longer exists in the schema. ACVIM's 2023 feline chronic-enteropathy consensus: weight loss is the most common sign and "often … overlooked by clients or even veterinarians" (Lane E §4). Whether the loss was planned is for the PM and the vet (the record shows three meals of a weight-management food, 8/8 to 8/14, and no weight plan), and the 15% rests on one profile value against one clinic value (a ±0.3 kg error in the June figure spans roughly 9 to 20%; every value in that range is past the 5% cachexia-definition line). Either way it is the fact a vet reading this record would want first, and the engine is structurally unable to state it.

**R3. The first week produced culprit cards from noise.** 5/19: "Nyx's vomiting has tended to follow meals with turkey within about 12 hours"; 5/20: the same for beef. Evidence: 3 and 4 matched pairs, 2 discordant case-only pairs, exact McNemar **p = 0.25**, against a corrected alpha of 0.007 across a 7 to 9 protein family. The Early tier fires on hand-set pair counts with no test (lane A, `detection.ts:3502-3533`). This is the multiplicity trap the August brief cited (an IBS pilot found a "strong association" in 8 of 11 people in two weeks), shipped. It ran 16 evenings.

**R4. A safety card on two episodes.** "Nyx has had 2 episodes of itching this week, after none last week — worth a word with your vet" (7/16 to 7/22, during a treated ear infection, and again 9/11 to 9/17). `worseningMinEpisodes` is 2. Two against zero is not evidence of worsening (an exact test cannot reject at any conventional level); it is a safety-class ask on noise.

**R5. The trial's real story appeared on two evenings.** "6 episodes of vomiting in the trial's 39 days, compared with 19 in the 49 days before it" rendered on three evenings (9/2, 9/3 and 9/6), flickering with recency gates. That comparison, stated with its uncertainty and its confounders, is the single most useful thing the record says about the trial, and it was the least visible card.

**Plumbing, for completeness:** each lane was calibrated against a single evaluation of a null record (seeded property tests: ⑦ about 1.3%, ⑥ about 3.3%), but the engine re-runs on the growing record every day. Lane D's simulation of one binomial lane shows the gap: a test firing 2.8 to 3.0% per run fired at least once for **10.2% of healthy simulated pets over six months and 13.5% over a year**; an anytime-valid version held 1.2% and 1.6% at a real cost in detection delay (pack Lane D §6.1, labelled there as an illustration, not a measurement of any shipped lane). No test runs the whole engine on a null record, so the chance a healthy pet sees any card at all is unknown (lane A).

---

## §3 The per-incident vomit read, audited

### What happened on the record

45 live vomit reads: 30 `monitor`, **11 `worth_a_call`**, 2 `not_enough_to_say`, 2 failed. The decision rule (`_shared/incident-analysis.ts:102-115`) forces `worth_a_call` on any contextual or visual flag; there is one escalation level, and every other template also closes by naming the vet (lane B).

| Vomit (local) | Why it escalated | What the record shows |
|---|---|---|
| 5/18 03:09 | Visual: suspected foreign material | The model's own note: a blue toy ball "on the feeding mat near the vomit … not possible to confirm … whether either was in the vomit". **Owner edited to "no".** (CUL-403) |
| 5/30 07:21 | `repeated_vomiting` | Two vomits 3.35 h apart (04:00 witnessed, 07:21). |
| 7/4 22:47 | `repeated_vomiting` | Two **found** piles logged 4 minutes apart (both `window`). One bout or two vomits hours apart; the log cannot tell. |
| 7/5 07:11 | `repeated_vomiting` | The third log in 24 h (with the 7/4 pair). |
| 7/9 12:21 | Visual: suspected foreign material | "a thin, pointed stick-like or toothpick-like object … fine dark hairs". **Owner edited to "no".** |
| 7/14 20:02 | Visual: blood (`fresh_red`) | **Owner downgraded to "unsure"**, not "no". |
| 7/27 10:56 | `feline_reduced_intake` | Trial day 2: three refusals, two "picked", one "some" of the new diet in 24 h. |
| 8/5 05:18 | `concurrent_lethargy` | The owner logged lethargy that morning. |
| 8/19 17:40 | `feline_reduced_intake` | Six meals logged in the prior 24 h, **all unrated**. Analysed two days later, with the window measured back from the moment of analysis, not the vomit. |
| 9/4 07:02 | `feline_reduced_intake` | Four meals in the prior 24 h, **all unrated**. |
| 9/22 01:30 | `feline_reduced_intake` + visual foreign material | Six meals in the rule's window: one "picked", five **unrated**. The model saw "a dark grey, irregularly shaped piece of material … could be fabric, rubber". **Not reviewed by the owner; this is the card on Home today.** |

### How to read it (after the adversarial pass)

The first draft of this brief called these alarms "mostly mechanical" and implied they were false. The adversarial pass was right to reject that (§8, E1). The honest reading is narrower and more useful:

- **Every contextual flag was mechanically derived from logging behaviour, not from a clinical fact the owner could recognise.** Three intake flags keyed on the absence of a positive rating, which on this record means "the owner stopped rating meals". Two repeat flags counted log entries, one pair of which may have been a single bout. That makes those flags **uninformative**, not necessarily wrong: they fired during the months the cat lost 15% of her weight, and nobody can now say whether she was eating.
- **Three of four photo flags were disputed by the owner**, one of them only to "unsure". Owner edits are anchored labels (people accept wrong AI suggestions; radiologists' accuracy fell from about 80% to 20% when the suggestion was wrong, Dratsch 2023, pack Lane F), so they are evidence of disagreement, not ground truth. Two of the three disputes have a mechanism a prompt can address (an object beside the vomit; hair and seasoning read as a stick).
- **Two escalations were plainly right by any rule considered here:** the trial-day-2 refusals and the owner-logged lethargy.
- **One is unresolved and current:** 9/22's foreign material, one day after prednisone started.

### Four mechanisms no prior brief named

1. **The windows are anchored at the moment of analysis, not the vomit** (`analyze-vomit/index.ts:497-554`: every lookback starts from `Date.now()`). A vomit analysed two days late (8/19) is judged against the two days after it. Opening an old photo-less vomit, replacing a photo, re-running a read or an Ask live read all judge an old incident against today's meals and lethargy, and the result is written permanently (lane B, cause 4).
2. **Logging order creates intake alarms.** On 6/7 the owner logged a vomit at 07:44 and back-filled the morning's ten meals at 07:48 to 07:54. At 07:44 the record held no positive meal in 24 h; the read only avoided an intake flag because it was re-run after the back-fill. An owner who logs the vomit first, as anyone would, briefly looks like the owner of a cat that has not eaten.
3. **The edit flow of May and June re-created rows.** Editing a vomit wrote a new row and deleted the old one in the same operation that ran its read, so for an instant the record held both. Any rule that counts vomits in both directions around a read (as the recalibration below does) must count the settled record, not that instant.
4. **An uninformative flag's sentence displaces an informative one.** When any contextual flag fires, the read's sentence is the contextual template, whatever the photo showed (`_shared/incident-analysis.ts:185`). On 9/22 the owner read "Nyx has been vomiting and hasn't eaten a full meal recently. In cats that combination is worth a call to your vet sooner rather than later" (six meals were logged in the rule's window, five of them unrated and one "picked"), and the sentence did not name the possible foreign material, the one finding on that read a vet might act on. The same template ran on 9/4 with four meals logged. A statement the owner can see is false, standing where the true concern should be, is the fastest way to teach an owner to skim the read.

### The recalibration, replayed

The shipped rule, replayed: **43 of 43 stored contextual flag sets reproduced exactly.** The proposed rule set, as amended by the adversarial pass (§7 B2, B3; `scripts/engine-replay/incidentReplay.deno.ts`), over the same reads:

| | Shipped | Recalibrated sketch |
|---|---|---|
| Context escalations | 8, all at one urgency | **3**, graded: 7/5 *call today* (three episodes in 24 h), 7/27 *call today* (five refusals, nothing eaten well), 8/5 *call now* (lethargy) |
| Removed | | 5/30 and 7/4 (two episodes in 24 h is logged toward the pattern, not a call); 8/19, 9/4, 9/22 intake (unrated meals are unknown, never "did not eat") |
| Photo escalations | 4 | Not replayable without re-running the vision model; see §7 B4 for what each would face |

The sketch is not the proposal's whole effect, and a smaller alarm count is not its goal. Two of its three survivors change urgency (*call today* instead of an undifferentiated call), and the amendments **add sensitivity** the shipped rule does not have: the deterministic floor running on every logged vomit whether or not it has a photo (a cat vomiting three times in four hours with no photos gets no call anywhere today), a one-tap "has she eaten since yesterday?" after a cat's vomit is saved, rapid-succession and unproductive-retching rules for dogs, an age modifier, and a steroid-or-NSAID-on-board escalation for any positive blood read (§7). The goal is alarms that mean something.

### What the read is for

The structured fields are what lasts: they feed the vet report, the Signal's photo composition (hair, bile, retained food) and Ask, and neither the report nor the engine reads the verdict (lane B, §6). The contextual half mostly restates, less rigorously, what the Signal's multi-incident lanes own. The read's unique triage value is the rare true visual finding, which is exactly the class its false positives are diluting. That argues for a read that **describes precisely and escalates rarely, at the right urgency**, and leaves the chronic question to the Signal.

---

## §4 The clinical evidence, condensed (pack Lane E)

- **No validated veterinary telephone or owner-facing triage system for vomiting exists.** In-clinic lists do (Ruys 2012; VetTriS 2025, κ 0.69); a 2020 paper states there is "no published research on telephone triage within the veterinary profession". Owner thresholds are expert opinion and disagree about threefold (8 to 10 vomits a day, Armstrong 2013; "3+ in rapid succession", MedVet 2026). The shipped floor (2 in 4 h, or 3 in 24 h) sits at the most sensitive end.
- **Acute and chronic are different dispositions.** Every clinician source that separates them gives chronic vomiting (≥3 weeks: Armstrong; ACVIM 2023 feline consensus) a **booked workup**, not a call per episode. Human telephone triage (Schmitt-Thompson) routes vomiting present over four weeks to "see PCP within 2 weeks", and counts retches under 10 minutes apart as one episode. The floor applies acute-episode rules to each episode of a known chronic pattern.
- **The disease-activity index is the re-contact specification.** FCEAI scores vomiting 1×/wk, 2 to 3×/wk, >3×/wk, and weight loss <5%, 5 to 10%, >10%. For a known chronic vomiter, a move up a band is worsening; another episode in the same band is not.
- **The feline 24 h intake rule is about a cat that has stopped eating**, not one that left food in the bowl (Cornell; Merck). The hepatic-lipidosis onset time is weeks in the only experimental data (Biourge 1993/1994, obese cats); ISFM 2022 grades intake under 80% of resting needs as low risk for under 3 days. **Correction owed and applied:** the 2026-05 feeding-windows brief's "2 to 3 days complete / 1 to 2 weeks reduced" hepatic-lipidosis durations are on none of the pages it cites (re-verified this session against Merck, updated June 2025, and Cornell); see that brief's new §V.
- **A photo blood call is the least reliable field, and its absence never reassures.** Haematemesis was reported in only 20% of cats (Bottero 2022) and 32% of dogs (Fitzgerald 2017) with confirmed ulcers. Coffee-ground vomit is a weak signal even with a clinician present (Schneider 2020, n=6,054; Blanco Nodal 2024: "does not represent a reliable indicator"). No study, in any species, measures whether people agree on what coffee grounds look like.
- **Base rates.** About 25% of mature cats vomit at least a few times a month and about 2% several times a week (CPAWS); Nyx sits in roughly the top 2 to 8%. Only 3.2% of cats have vomiting recorded at a vet in a year (VetCompass 2019): most feline vomiting never reaches a vet, which is the wedge. No veterinary PPV for owner-observed blood in vomit exists.
- **Lethargy stays call-now.** It is the most consistent discriminator in the evidence (Holzmann 2023 mentation; Ireifej 2026; Armstrong; Merck).

---

## §5 AI triage and alert science, condensed (pack Lane F)

- **Over-triage is the default failure of automated triage.** Symptom checkers advised care in two-thirds of cases that did not need it (Semigran 2015); no improvement five years later (Schmieding 2022). Every one of 22 ChatGPT versions over-triages (Kopka 2026); prompting for safety pushed over-triage from 36 to 75% up to 50 to 90% (Xu 2025). The one veterinary LLM triage study put about 60% of non-urgent dogs in "see immediately" (Wong, Vet Record).
- **Repeats and false alarms train people to ignore alerts.** 72 to 99% of clinical alarms are false (Sendelbach 2013). A quarter to a third of clinical alerts were repeats for the same patient; acceptance fell 30% per extra reminder (Ancker 2017). About 90% of people respond at the rate an alarm has been right (Bliss 1995). Whistle's collar alerts: 92.5% not followed by a vet visit within four weeks (Carson 2023, industry-funded). The adversarial pass is right that these magnitudes come from clinicians, lab tasks and passive collar alerts and do not transfer to pet owners as numbers; the direction does.
- **Rare, confirmed alerts are the consumer precedent that worked.** Apple Heart Study: 0.52% notified, confirmation required before any alert (5 of 6 readings in 48 h), PPV 0.84. Fitbit: 1% notified, 11 consecutive readings, PPV 0.98.
- **Graded output beats a binary alarm.** Five-level triage cut under-triage from 28% to 12% against three levels (Travers 2002); graded "likelihood alarms" beat liberal binary alarms in lab studies (Zirk 2020). The low tier works only with specific, time-bound watch-for advice (Edwards 2019; Francis 2009 RCT); a "lower" output is otherwise read as reassurance (Buoy: 32% lowered their intended care).
- **Vision reliability.** Text overrides the image in multimodal models (o3 fell from 84% to 28% accuracy with a misleading vignette, Buckley 2026), which supports the shipped rule that the read never sees context. No study validates blood, melena or coffee-ground detection from a phone photo by AI or clinicians; Mars' PoopScan deliberately scores stool consistency only. Self-reported confidence runs high (Savage 2025); agreement across repeated reads is the better signal (Wienholt 2026: 51.7% → 76.3% accuracy on retained questions). An explicit "unsure" is the strongest abstention lever (MedAbstain).
- **Competitors.** The one vomit-photo tool found (Yipara) is unvalidated; none publishes outcomes.

---

## §6 The methods frontier, condensed (pack Lane D)

- **ADOPT:** a trajectory evaluation harness (seeded synthetic pets over 180 to 365 days, null and with injected true signals; time-to-detection against false-alert rate per lane, the composition layer evaluated as a response protocol, and the **lifetime false-card rate per pet across all lanes**) — the standard in surveillance science (Buehler 2004; Buckeridge 2007; Jiang, Cooper and Neill 2009), absent here. Negative-control gates on the food correlation and post-prandial lanes (a time-reversed exposure window; excluding control windows in the hours after an episode, since owners change food because the pet vomited: Lipsitch 2010; Schuemie 2014; Farrington 2009). The LLM stays out of every number (PHIA: 84% exact with code, 22% without).
- **PROTOTYPE:** anytime-valid gating for insight lanes that re-test a growing record (mixture e-process; Lan–DeMets alpha spending over the trial's known horizon; a k-of-m persistence gate as the cheap interim), never on safety lanes. A shrinkage observed-to-expected statistic for the correlation lane (Norén 2013), which unlocks a count-phrased sentence the engine cannot say today: "5 of her 7 vomits followed chicken; about 2 would be expected from how often she eats it." Bayesian phase posteriors for the trial, on the vet report only.
- **WATCH / REJECT:** cross-pet pooling waits for a population (store per-pet sufficient statistics now); per-pet HMMs, Hawkes processes, forecasting, conformal prediction and time-series causal discovery all fail their data floors at one pet's scale; owner-facing probabilities are misread even by motivated self-trackers.

---

## §7 The candidate space

Grouped by what each buys. Every candidate carries the adversarial amendments (§8); none is ratified here.

### A · Measure: the instrument everything else is judged by

- **A1. The replay ledger** (built this session, `scripts/engine-replay/`). Replays the shipped engine over any record, evening by evening, and the per-incident floor over every read. Answers "what did the engine say, how often, at what urgency". Evaluation only: it must never tune a floor on the dogfood record.
- **A2. Synthetic pets with injected truth** (re-scopes CUL-508). Scenarios: healthy grazer; chronic enteropathy onset; a protein reaction at relative risk 3; post-prandial and early-morning phenotypes; 1% per week weight loss; logging attrition; event-dependent feeding; duplicate and found-pile logging. Output: per-lane detection probability and median days to detect, lifetime chance-card rate, evenings carrying a vet ask.
- **A3. The scorecard.** A committed, CI-reported (not gating) metrics file so drift shows in diffs. Proposed headline metrics: *ask evenings per pet-month in an acknowledged state*; *lifetime chance insight cards per healthy synthetic pet*; *detection within N days per scenario*; *per-incident call rate by tier*.
- **A4. Vision evaluation.** Stamp model id and prompt version on every read (FR-7 Tier 0 already recommends it); a re-read tool that runs stored photos through a prompt variant several times and reports agreement and disagreement with owner-adjudicated fields. The record already holds 60 reads with the model's original answer beside any owner edit: a small disagreement set nobody has used.

### B · Calibrate the per-incident read

- **B1. Four dispositions** replacing the single `worth_a_call`: *call now* · *call today* · *part of a pattern worth a visit* (points at the Signal's state, never re-asks) · *logged, with a specific watch-for list*. The enum still has no wellness value (clinical-guardrails Pattern 1). Needs an enum migration, copy through nyx-voice, and the guardrails skill updated.
- **B2. Counting and anchoring (amended).** Only *witnessed* logs merge, within 30 minutes of an episode's onset and without chaining (the shared `lib/symptomEpisodes.ts` collapse chains, which would fold a dog retching every ten minutes into one episode). Found piles are separate episodes. Windows run in both directions from the vomit up to the moment the read runs, over the settled record. Three logs within 30 minutes is *call now* in its own right. Dogs: a vomit log whose read shows nothing produced, or a "nothing came up" tap, is *call now* with the GDV signs named. Pets under 6 months: two episodes in 24 h is *call today*.
- **B3. Intake evidence (amended; ships only with C3 and a capture change).** An unrated meal is unknown, never "did not eat", and unknowns never cancel recorded refusals. Fire *call today* on two or more refusal-class ratings with nothing eaten well, in the 24 h before the vomit through the moment the read runs. For cats (and any free-fed bowl), one optional tap on the result screen after the save: "Has she eaten since yesterday? Normally / Less / No / Not sure" (No → *call today*; Less → counts toward a 3-day rule; Not sure → a dated safety-net line). Without the tap and the weight lane, this change would silence the only intake signal during the weight-loss months, which is why it cannot ship alone (§8, P3). Intersects CUL-1118.
- **B4. Vision hardening (amended).** Foreign material must be in the vomit; an object beside it becomes a structured observation plus "could she have swallowed part of it?", never silently dropped. Linear material (string, thread, tinsel) is never on the lookalike list. A colour-only coffee-ground call where repeated reads disagree asks the owner one question rather than going quiet; "unsure" keeps *call today*. Any positive blood read with a steroid or NSAID on board, lethargy, a refusal or two episodes is *call today* at least. The read still never sees context.
- **B5. The floor runs on every logged vomit**, photo or not, as a deterministic step with no model call and no cap, and re-runs the prior 24 h of vomits when lethargy or a refusal is logged.
- **B6. Missing red flags** (capture design needed): unproductive retching in a dog; a straining male cat; a logged toxin or foreign-body ingestion; can't keep water down.
- **B7. The stool spill-over.** Any vomit in the prior 24 h makes every stool read `worth_a_call`, including a normal formed stool, with copy about loose stool (lane B, `analyze-stool/index.ts:346-364`).

### C · Accountable state on the Signal

- **C1. A care-state latch per concern (amended).** Raised → acknowledged → watching → stood down. Acknowledgement comes only from a vet visit that carried the concern (its "Worth raising" list) or, weaker, an owner tap that keeps the ask visible on the folded strip; any other visit asks "was the vomiting discussed?". While watching, the card speaks only on change: frequency up a FCEAI band, split at daily, **or a 14-day rate at least 1.5× the rate at acknowledgement**; weight loss ≥5% or a falling trend; a new visual red flag; a new co-sign (diarrhoea, lethargy, refusal). Acknowledgement prompts a weigh-in, and watching prompts one every four weeks. The latch never reaches the vet report. An eight-week re-raise conflicts with the signal-fold rule DF-5 (no time-based re-open): a PM ruling.
- **C2. Visit and treatment context.** "Since the 9/16 visit: N vomits, M coughs"; "prednisone started 9/21" beside the cough and vomiting trajectories. Counts only, never attribution (regression to the mean alone explains a 20 to 30% post-intervention improvement: Goldenholz, August brief §3).
- **C3. A weight lane (amended).** Keep a weight history with each reading's source (clinic, home scale, estimate); an estimate can prompt a weigh-in but never anchor a percentage. Compare against the window's peak as well as its earliest reading. A safety card at ≥5% loss, firm at ≥10% (FCEAI bands; the cachexia-definition criterion), kept until an owner action rather than rolling off; juveniles on any drop from peak or no gain in four weeks; a "planned loss" state that still fires above 2% per week. Home-scale noise (±0.2 kg is 5% on a 4 kg cat) is why the source matters.

### D · The whole animal

- **D1. A problem list.** One composed, deterministic summary per system (GI, respiratory, skin, weight and intake), each with its trajectory, its care state and what is on board. It is the gestalt the four prior briefs kept rediscovering, done without a model, and the natural spine of the vet report's first page and the vet visit's Get ready.
- **D2. A bounded reviewer** (the standing Open Question). If ever built: computed findings in, a closed set of actions out (raise, cap, refuse a too-calm framing), never a number, never suppression of a safety finding (Veritas-RPM is the anti-pattern in architectural form, pack Lane D §5.4).

### E · Honest inference on the insight lanes

- **E1.** The Early correlation tier needs its own test or is retired (R3).
- **E2.** A time-reversed negative control on the correlation and post-prandial lanes; exclude control windows after an episode, tested against the reverse-causation case (a bland food fed after vomiting).
- **E3.** A lifetime alert budget for chance insight cards (for example, at most one per six months on a healthy synthetic pet), enforced by a k-of-m persistence gate first. **A design-time test, never a runtime per-pet counter** (a counter spent by a chance card would suppress a later true one).
- **E4.** The observed-to-expected evidence statistic for the correlation lane.
- **E5.** Store per-pet sufficient statistics so pooling is possible when a population exists.
- Worsening's two-episode floor (R4) belongs here too: a safety-class ask needs a floor a test could defend.

### F · The outcome loop (the moat)

- **F1.** One-tap acknowledgement on a call tier ("I've called · I'll call · Not now") and one follow-up 48 to 72 h later: "What did the vet say?", inside the one-nudge-a-day budget.
- **F2.** Flag review (CUL-1107) as the owner-adjudication path, with its answers kept as labels (FR-7 Tier 0).
- **F3.** The vet visit companion's plan rows (keep, changed, stopped) and visit reasons as outcome labels for the alerts that preceded them.
- **F4.** A real veterinarian labelling the photo set and reviewing thresholds. Deferred by the PM this session ("not now"); every clinical threshold in this brief remains persona-ratified until then.

---

## §8 The adversarial pass (isolated, 2026-09-24)

Package verdict: **FAIL as first written**; P2 and P3 each created misses relative to today. Verdicts and the amendments folded into §7:

| Proposal / claim | Verdict | The counterexample that broke or tested it |
|---|---|---|
| P1 four tiers | Holds with amendment | A 12-week-old puppy with two vomits in 2 h drops from a call to "logged" without an age modifier; a cat vomiting three times in 4 h with no photos gets no call anywhere (the read only runs when a photo exists or the detail screen opens). → B1, B2 age rule, B5. |
| P2 episodes and anchoring | **Fails** as written | A GDV-like dog logging retches at :00, :08, :15, :25, :40 is one chained episode → "logged". The record's own 7/4 pair is two *found* piles, possibly hours apart. A found vomit logged late is never counted by its neighbours with a backward-only window. → B2 (witnessed-only, no chaining, both directions, rapid-succession and GDV rules). |
| P3 intake evidence | **Fails** unless shipped with capture and weight | In the week before 8/21 the owner logged about 42 unrated servings while weight fell 4.4 → 3.73 kg; P3 treats them as unknown and stays silent in every lane. Unknowns cancelling two refusals; refusals logged after the vomit. → B3 (drop the cancelling clause, both-direction window, the one-tap question), C3. |
| P4 vision hardening | Holds with amendment | A true coffee-ground vomit where reads disagree goes quiet on a cleaned-up floor; liver pâté stays 3 of 3 (agreement filters noise, not systematic lookalikes); "hair and plant stems" is exactly what a swallowed string looks like. → B4. |
| P5 care-state latch | Holds with amendment | A cat acknowledged at >3/week going to daily shows no band change; a lymphoma cat steady at 3/week losing 3% a month with no weigh-ins never re-triggers; a vaccine visit auto-acknowledges the GI concern. → C1 (1.5× relative trigger, daily split, weigh-in prompts, visit must carry the concern). |
| P6 weight lane | Holds with amendment | A typed estimate hides or invents loss; 4.0 → 4.5 → 4.05 kg is 10% off the peak and 0% off the earliest; a six-month roll-off drops unregained loss. → C3. |
| P7 insight honesty | Holds with amendment | A true sporadic chicken reaction takes about two months to reach significance instead of one week, but the safety lanes still ask for a visit by about week 3, so care is not delayed. The budget must be design-time. → E3. |
| E1 "alarms were mostly mechanical" | **Overstated** | Mechanically *derived* is established; *false* is not. Two escalations were right by the proposals' own rules, one owner edit said "unsure", 9/22 is unreviewed, and the intake flags fired during the weight loss. → §3 reframed. |
| E2 alarm-fatigue transfer | Direction holds | Magnitudes come from clinicians, lab tasks and passive collar alerts. → §5 says so. |
| E3 replay fidelity | **Overstated** | It matches the live cache on one evening, for today's code; "every evening from 6/8" is what today's engine says, not what the owner saw. → §2 framing. The shipped-rule incident replay now reproduces 43 of 43 stored flag sets. |
| E4 weight | Holds with amendment | "Blind" is true; the 15% rests on one profile value whose error band still clears 5%; planned loss unverified. → §2 R2. |

Reviewer's DoD line, verbatim in substance: tried a GDV dog logging repeated retches (chained collapse → "logged" ✗, fixed by the non-chaining rapid-succession rule); two found piles 4 minutes apart (collapsed to one ✗); a cat with 42 unrated servings in a week while losing about 15% (P3 silent in every lane ✗, fixed by the one-tap question plus the weight lane); a cat acknowledged at >3/week going to daily (no band change ✗, fixed by the relative trigger); a sporadic true food reaction under P7 (about two months' delay, safety lanes still ask for a visit ✓).

---

## §9 Open questions for the PM

1. **Tiered dispositions for the per-incident read** (B1). Replace the single escalation with call now / call today / part of a pattern / logged-with-watch-fors?
2. **Intake capture** (CUL-1118): keep the rating, move to exception-only ("she didn't finish"), or drop it; and whether the one-tap post-save intake question (B3) is acceptable under Principle 1 (it comes after the save, on the result screen, and is skippable).
3. **What acknowledges a concern** (C1): a visit that carried the concern, an owner tap, or both; and the eight-week re-raise against the fold's no-timer rule (DF-5).
4. **A lifetime alert budget** for chance insight cards (E3): the number that sets both the harness's pass line and the anytime-valid target.
5. **The Early correlation tier** (E1): require a test, or retire it.
6. **Colour-only blood calls** (B4): the owner question on disagreement, or single-read escalation as today. A genuine two-sided trade (Dr. Chen: any blood is a call; the owners: a red chew flagged weekly turns the card into wallpaper).
7. **Weight as a safety lane** (C3) at ≥5%, firm at ≥10%, with reading sources.
8. **For the PM as an owner, not as a product call:** whether the vet has the June 4.4 kg reading beside the 9/16 3.73 kg one, and whether any loss was intended.

---

## §10 Verification notes and research debt

- **Replay limits** (stated in `scripts/engine-replay/record.deno.ts`): intake ratings are read as they are now; the diet trial is read at its current length (the window-provenance columns are deliberately not exported, per `guards/dietTrialProvenance.test.ts`); doses are excluded by default to match production (CUL-1099). The Signal replay evaluates today's code; it is not a record of what the owner saw before the 8/20 to 8/21 deploys.
- **The recalibration sketch's thresholds are placeholders** (30-minute merge, three in 24 h, two refusals) for a Dr. Chen ruling; it is a research sketch in a script, not a spec.
- **Every clinical threshold remains persona-ratified.** No real veterinarian reviewed this brief (PM, this session: "not now"). No claim here should be used publicly as "clinical-grade" until one does.
- **n = 1.** Every record-level number is one cat. The replay tooling must not be used to tune floors to her (the 2026-08 brief's §9 rule).
- **The weight loss** rests on one profile value against one clinic value, different scales, unknown intent.
- **Literature debt** is itemised at the end of each lane in the evidence pack. The load-bearing items: no study of photo-based blood detection in any species; no veterinary PPV for owner-observed blood; no validated veterinary telephone triage; several alert-fatigue figures read from secondary sources (Travers, Edwards, Kopka's self-care detail, Wong's veterinary LLM study); the anytime-valid inflation figures are the lane's own simulation of a toy lane, not a measurement of any shipped lane; the time-reversed negative control is an adaptation of Lipsitch's negative-exposure control, not established diary practice.
- **Corrections owed by earlier briefs, applied additively this session:** the 2026-05 feeding-windows brief (hepatic-lipidosis durations not on the cited pages → its new §V) and the 2026-08 signals brief (F5's cessation did not persist → its new §V).

---

## Appendix: reproducing the replays

```
# 1. In a session with the Supabase MCP, run the two queries in scripts/engine-replay/export.sql
#    (pet id + owner email filled in). Each result lands in the session's tool-results
#    directory; copy both files to the session scratchpad. Never into the repo.
# 2. The Signal ledger:
deno run --no-check --allow-read --allow-write scripts/engine-replay/signalReplay.deno.ts \
  --record <scratch>/record.json --meals <scratch>/meals.json --from 2026-05-19 --to 2026-09-24 \
  --out <scratch>/ledger.json
# 3. The per-incident floor (the shipped rule, then the sketch):
deno run --no-check --allow-read --allow-net --allow-env scripts/engine-replay/incidentReplay.deno.ts \
  --record <scratch>/record.json --meals <scratch>/meals.json
```

Before trusting either output, check the fidelity lines: the Signal ledger's last evening against the live `ai_signals` row, and the incident replay's "shipped-rule mismatches: 0".
