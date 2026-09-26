# Engines deep dive: the evidence pack (three research lanes)

**Date:** 2026-09-24
**Status:** 🧊 Frozen point-in-time evidence capture. Correct additively (a dated §V at the foot, with inline ⚠ pointers), never in place.
**What this is:** the three literature lanes behind `docs/research/2026-09-engines-step-change.md`, committed the same session they ran (the lost-C2-study lesson). Each lane was an isolated research agent; its text is kept as written, with headings demoted one level and two editor's notes (⚠) where a lane's premise about the dogfood record was wrong. The brief carries the synthesis, the replays, the candidate space and the open questions; this pack carries the sources.

- **Lane D** — the statistical methods frontier for the Signal engine (Bayesian n-of-1, shrinkage, point processes, surveillance evaluation, anytime-valid inference, LLMs over personal health data). Includes one original simulation (§6.1 and Appendix A), labelled as such.
- **Lane E** — veterinary evidence for recalibrating the per-incident vomit floor (triage protocols, vomit appearance, base rates, chronic vs acute urgency, hepatic lipidosis, re-contact triggers).
- **Lane F** — AI triage calibration, alarm fatigue, triage granularity, vision reliability on clinical photos, learning from corrections, and the competitive scan.

**Grades and tags differ by lane** and are defined at the top of each. Every lane ends with its own research-debt list; the brief's §10 consolidates the load-bearing items.

---

## Lane D: Methods frontier for the signals engine

**Date:** 2026-09-24
**Scope:** A web sweep of methods from the 2018–2026 research frontier that could give a step-level improvement over seven independent threshold detectors, while staying honest on one pet's sparse record. It builds on `docs/research/2026-08-signals-deep-dive.md` §3 and §5 and does not repeat them. Out of scope because that brief already covered them: case-crossover, SCCS basics, g-charts, C/E-test, EARS, CUSUM/EWMA, Tau-U/WWC, Kulldorff scan, N1-Headache, mySymptoms, Whoop floors, seizure-diary under-reporting, and regression to the mean.
**Method:** About 60 searches and fetches. Primary sources were checked through arXiv abstract pages, the Europe PMC REST API (abstracts, plus full text where it is open access) and publisher pages. NCBI/PubMed/AHRQ were not reachable from this sandbox (a captcha or a blank page). `generate-signal/detection.ts` was read wherever a sketch depends on how the engine really works. One original simulation was run (§6.1, Appendix A). It illustrates a point and is not a literature claim.

**Evidence grades used below:**
- **A:** peer-reviewed, primary source fetched, and the claim checked against its text (abstract or full text).
- **B:** peer-reviewed, and existence/venue confirmed, but the claim was checked only against an abstract or a publisher listing.
- **C:** preprint (arXiv), with the abstract page fetched.
- **D:** search snippet only, not fetched. Treat as unverified.

---

### §0 Bottom line

The engine's weakest point is not a missing detector. It is **how the engine checks itself**. Three findings from the source code shape everything below:

1. **Floors are calibrated per snapshot, but the engine re-runs daily.** The null property tests (⑥ "≪5% pooled", ⑦ "~1.3%", the ⑤-guard "≈α") measure the chance that *one evaluation* fires. `generate-signal` recomputes every day on a growing record (24h cache, `index.ts:16`). My simulation (§6.1) shows the gap. A fixed-sample exact test that fires 2.8–3.0% per evaluation fires **at least once in 10.2% of null pets over 6 months and 13.5% over 12 months**. A beta-binomial mixture e-process run on the same data held **1.2% and 1.6%**.
2. **Nothing measures the false-negative side.** The chronicity ratification record says "the noise gate sees only false-positives" (`docs/decisions-archive.md`), and the spec adds that the property test "only measures false-positives (noise), never false-negatives" (`docs/nyx-chronicity-signal-requirements.md:276`). The gap-shortening lane accepts a 4.5–5.8% residual under an autocorrelated null. Nothing runs **time-to-detection versus false-alarm rate over synthetic trajectories with injected true signals**. That is the standard evaluation in surveillance science (AMOC/G-AMOC).
3. **The engine has no built-in bias detector.** Case-crossover/SCCS designs remove fixed confounders. They do nothing about the owner changing food *because* the pet vomited (event-dependent exposure), logging artifacts, or reverse causation. Negative-control analyses are the cheap, deterministic, well-cited way to catch these.

**Ranked shortlist, detailed in §8:**
1. **ADOPT: a trajectory-level evaluation harness.** Run AMOC/G-AMOC curves over seeded synthetic pets with injected positives, and report the lifetime false-card rate per pet across all lanes. Everything else below needs this harness to be judged.
2. **ADOPT: negative-control (time-reversed and off-window) checks** as a deterministic suppress/cap gate on ① and ⑤.
3. **PROTOTYPE: anytime-valid gating** (a mixture e-process, or alpha-spending over the trial's known horizon) for lanes that re-test the same growing record: ①, the trial-response lane, ⑤.
4. **PROTOTYPE: the shrinkage observed-to-expected statistic** (Norén/BCPNN Gamma-Poisson) as ①'s evidence measure, with a robust literature-informed prior. It unlocks a new count-phrased sentence: *"5 of her 7 vomits followed chicken; about 2 would be expected from how often she eats it."*
5. **ADOPT as policy: the LLM stays out of every number.** The best published agent over personal health data reaches 84% exact-match *with* code execution and 22% without. Any "gestalt reviewer" gets computed findings only, and a veto/escalate channel only.

**The main negative results.** At one pet's scale, these fail on data floor or honesty grounds: HMM "flare" models, Hawkes processes, recurrent-event survival models beyond SCCS, seizure-style forecasting, conformal prediction, time-series causal discovery (PCMCI, Daza's APTE, MoTR), and population foundation models. Each floor is in §9. **Hierarchical pooling across pets** is the right long-term answer to multiplicity and sparsity (Gelman/Hill/Yajima; the I-STOP-AFib meta-analysis of individual trials). It needs a population Culprit does not have yet. The action now is to **store per-pet results as sufficient statistics** so pooling is possible later.

---

### §1 The engine's statistical posture (verified in source, 2026-09-24)

Only what bears on this lane:

- **① Correlation.** Matched case/control pairs per protein. **"One-sided exact McNemar p on the discordant pairs. Established requires it to clear the corrected bar"**, with `correctedAlpha = alpha / family size` (`detection.ts:988–991`). Early/Established are binary tiers on hand-set floors (≥3 or ≥5 pairs).
- **Re-evaluation.** Findings are cached with a 24h TTL. Caps are 12 calls per pet per day (`index.ts:16, 632–635`). The vet report **re-runs detection** and never reads the cache (`index.ts:89`). The same record is therefore tested every day, and again whenever a report is built.
- **Calibration practice.** Seeded-LCG null sweeps (≥1,000 fixtures) assert per-evaluation fire rates: `detectChronicity` < 2%, the ⑥ pooled uniform-random rate < 4.5%, and the ⑤ Poisson-binomial guard "calibrated to ≈ α (0.05), NOT ≪ α" (`detection.test.ts:2099–3307`). None of them simulates a pet over months of daily re-runs.
- **Known limits the code already states.** The trial lane's "fewer" direction: *"SYMPTOM-LOGGING ATTRITION … a false fewer renders ~14–35% of the time at realistic attrition … no detector can distinguish 'stopped logging vomits' from 'vomits stopped'"* (`detection.ts:~5237`). Gap-shortening under an autocorrelated null: *"~4.5–5.8% … accepted residual"* (`detection.ts:~5545`). ⑦'s floor: *"the gate 'passes' only at the assumed ~2/56d base rate — at ~3.5/56d, minEpisodes 6 fires ~12.4%"* (`docs/nyx-chronicity-signal-requirements.md:276`).

These are the engineering gaps the frontier methods below map onto.

---

### §2 Lane 1: Bayesian n-of-1, partial pooling, and disproportionality shrinkage

#### 2.1 Bayesian analysis of n-of-1 trials (Schmid, Duan, Kravitz, Marcus)

- **What.** Each person's repeated-crossover data is modelled on its own. The output is a posterior over the treatment/trigger effect, reported as "probability that A beats B" plus a credible interval. The model is chosen among variants (with or without autocorrelation or carryover), and trials can later be pooled hierarchically.
- **Citations.**
  - **Kravitz et al., JAMA Intern Med 2018, PREEMPT** (A): 215 patients, n-of-1 vs usual care. No difference in the primary outcome (−1.36; 95% CI −2.91 to 0.19); better shared decision-making. https://doi.org/10.1001/jamainternmed.2018.3981
  - **Barr et al., Trials 2015 (protocol)** (A, full text): the "Trialist" app runs Bayesian models "with and without correlation over time, with and without carryover", picks "the simplest model that accurately fits the data", and shows patients and clinicians "the probability that each treatment is the best for each outcome" with 95% Bayesian intervals. https://doi.org/10.1186/s13063-015-0590-8
  - **Marcus et al., JAMA Cardiol 2022, I-STOP-AFib** (A): 446 participants; self-selected triggers tested in random 1-week expose/avoid blocks for 6 weeks, after which "the probability their trigger influenced AF risk was then communicated". A meta-analysis across individual trials found **only alcohol** significant; caffeine, the most commonly suspected trigger, was not. https://doi.org/10.1001/jamacardio.2021.5010
  - **Diaz, Stat Med 2021** (A): "partial empirical Bayes", which combines prior population crossover data with one patient's data. The author finds situations where individualization is "highly beneficial" and others where it "may be unfruitful". https://doi.org/10.1002/sim.9030
  - **Senarathne, Overstall & McGree 2020** (C): hierarchical Bayesian adaptive n-of-1 in which individual estimates borrow strength from the population. https://arxiv.org/abs/1911.00878
  - **Liao et al. 2021/2023** (C; Stat Med 2023 per the search listing): Bayesian distributed-lag model for carryover with no washout plus AR errors. https://arxiv.org/abs/2112.13991
  - The **AHRQ N-of-1 User's Guide, ch. 4 (Schmid & Duan 2014)** could not be fetched (the AHRQ site returned an empty page). See research debt.
- **Floor.** These are *designed* trials: randomized blocks, fixed duration (I-STOP: 6 weekly blocks; PREEMPT: multiple crossovers), daily outcomes. Culprit's record is *observational* (unrandomized exposures, event outcomes). The Bayesian machinery carries over. The randomization-based causal warrant does not.
- **Sketch.** The closest fit is the **diet trial and a vet-guided re-challenge**. The trial already has a protocol (a start date and a target length). A future re-challenge flow (remission, then provocation, then re-remission, the A-B-A design the prior brief named) is a designed n-of-1. A Beta-Binomial or Gamma-Poisson model of episode rates per phase gives the posterior that the rate differs between phases.
- **New thing it lets the engine say.** On the **vet report only**, never owner copy: *"Vomiting episodes per logged week: before the trial 3.1 (95% interval 1.9–4.8); trial weeks 3–8 1.2 (0.5–2.3)."* That gives an uncertainty statement next to the counts, which a skeptical GP can read. The owner surface keeps its count-only register.
- **Honesty risks.** "Probability the trigger mattered" reads as causal to lay readers. I-STOP had randomization to back that up; an unrandomized owner diet change does not. Priors can be chosen to make almost anything look significant. Regression to the mean after owner-initiated trials is still present (prior brief, Goldenholz). A posterior does not remove confounding.
- **Implementation weight.** Low. Conjugate Beta/Gamma posteriors need only `lgamma` plus incomplete-gamma/beta quantiles (about 150 lines of TypeScript for Lanczos plus continued fractions), or Norén's closed-form approximations (§2.3), which need no special functions.
- **Verdict: PROTOTYPE** for the trial/re-challenge vet-report block. **REJECT** owner-facing posterior probabilities. The register rule (counts, never verdicts) wins, and PREEMPT/I-STOP show that patient-facing probabilities did not change the primary outcomes.

#### 2.2 Partial pooling as the answer to multiplicity (Gelman, Hill & Yajima 2012)

- **What.** Instead of widening intervals (Bonferroni), a multilevel model shrinks the many estimates (one per food) toward each other. Noisy extreme estimates are pulled in, so fewer spurious "winners" appear, without losing power the way a family-size correction does.
- **Citation** (A, full text checked). Gelman, Hill & Yajima, *J Res Educ Effectiveness* 5(2):189–211, 2012. https://sites.stat.columbia.edu/gelman/research/published/multiple2f.pdf. Verbatim: multilevel models "shift point estimates and their corresponding intervals toward each other … whereas classical procedures typically keep the point estimates stationary, adjusting for multiple comparisons by making the intervals wider". The z-score correction factor "approaches zero as the group-level variance σ²θ approaches zero". **The caveat that matters for Culprit:** "Effects that are truly zero (not just 'small') can make sense in genetics … but are less likely in social science." For food↔symptom pairs, most foods probably *are* exactly zero-effect, so a normal hierarchical prior is not the right shape: it assumes every food has *some* effect. A sparse prior (spike-and-slab, horseshoe) fits the domain better.
- **Related.** Gelman, *Bayesian Analysis* 1(3):515–534, 2006 (A, abstract) recommends "the half-t family when the number of groups is small". https://doi.org/10.1214/06-BA117A. Gelman & Carlin, *Perspect Psychol Sci* 2014 (A, abstract): in "noisy, small-sample settings, statistically significant results can often be misleading", through Type S (wrong sign) and Type M (exaggeration ratio) errors. https://doi.org/10.1177/1745691614551642. This is the formal reason a "5 of 7" that just clears a gate overstates the true association.
- **Floor.** Estimating the group-level variance needs enough groups. Culprit pets often have **1–4 proteins**: trial pets have 1–2, and a staple-dominant diet effectively 1. With so few groups the data say almost nothing about τ, so the result is driven by the prior.
- **Sketch.** Within one pet, the "groups" are proteins. With few groups, run the model with **τ fixed by the prior** (in effect a fixed shrinkage prior, which is §2.3) rather than an estimated hierarchy. **Across pets**, which is the real payoff, a food-level random effect shared across a species would make pet #1,000's chicken estimate borrow from 999 others. I-STOP-AFib already did this with an individual-trials meta-analysis.
- **New thing it lets the engine say.** Nothing new today. Across pets later, it could say *"chicken is associated with vomiting in this pet more strongly than in most cats who eat it"*. That is a population comparison, which the prior brief explicitly ruled out for now because the data do not exist.
- **Honesty risks.** Pooling moves an individual pet's estimate toward the population. For a genuinely unusual pet (the n-of-1 thesis, e.g. Peris et al.'s 85%-unique trigger profiles) that is a bias toward "normal", which is a quietly reassuring direction. Culprit would need an escalate-only override: pooling may lower a false alarm but never mute a safety lane.
- **Implementation weight.** Fixed-τ is trivial (conjugate). A real cross-pet hierarchy needs MCMC or INLA, which is not TypeScript-native, so it would run offline as a batch job writing priors into `app_config`.
- **Verdict: WATCH (cross-pet). ADOPT the data-model implication now.** Store each pet's per-protein sufficient statistics (case/control exposure counts, discordant-pair counts, exposure-time totals), versioned, so a future hierarchical batch job can pool them. The pooling itself would be a T&S/privacy question, because it aggregates across accounts.

#### 2.3 Disproportionality shrinkage: Gamma-Poisson Shrinker, BCPNN, and the shrinkage observed-to-expected ratio (O/E)

- **What.** Pharmacovigilance's answer to "is this drug–event count interestingly large when most cells hold 0–2 reports". Compare the observed count O with the expected count E under a baseline, and shrink the ratio toward 1 with a Gamma prior, so low counts cannot produce extreme ratios.
- **Citations.**
  - **DuMouchel, *Am Stat* 53(3):177–190, 1999** (B, abstract via publisher listing): empirical-Bayes Gamma-Poisson Shrinker for "millions of cells, most of which have an observed frequency of 0 or 1". https://doi.org/10.1080/00031305.1999.10474456. Its two-component Gamma mixture prior is *estimated from the whole table*, which needs a large table. One pet's food × symptom table is maybe 5 × 4 cells.
  - **Norén, Hopstadius & Bate, *Stat Methods Med Res* 2013** (A, full text checked; the transparent version usable at n=1). https://doi.org/10.1177/0962280211403604. Shrunk O/E = (O+α₁)/(E+α₂). This "can be viewed as the Bayesian posterior mean of … μ under the assumption that O is Poisson Po(μ·E) with a Gamma prior G(α₁, α₂)". The shrinkage "is equivalent to that of α₁ additional observed events, and α₂ additional expected events". The authors recommend α₁ = α₂ = ½ and give a **closed-form 95% lower bound**: log₂((O+α₁)/(E+α₂)) − 3.3·(O+α₁)^−½ − 2·(O+α₁)^−3/2, accurate "in the second decimal" whenever O+α₁ > 1. It "can be computed at the back of an envelope". The paper explicitly covers **temporal association** (event y following event x in chosen time windows, with a control-group baseline) and notes that "some measures from … self-controlled designs are directly interpretable as OE ratios".
  - **Norén et al., *Data Min Knowl Discov* 20:361–387, 2010**, "Temporal pattern discovery in longitudinal electronic patient records" (B, venue confirmed): the "chronograph", which plots O/E for events following a prescription across time windows, with intervals. https://doi.org/10.1007/s10618-009-0152-3. This is the published ancestor of a food→symptom lag profile.
- **Floor.** None formally: it is valid at O = 0. In practice, the lower bound itself sets a self-scaling floor. My calculation with α = ½ gives the minimum observed count for IC₀₂₅ > 0 at each expected count: E = 0.25 → O ≥ 3; E = 0.5 → O ≥ 4; E = 1 → O ≥ 5; **E = 2 → O ≥ 7**; E = 3 → O ≥ 8; E = 5 → O ≥ 11. Concretely, **5 observed vs 1.8 expected does not clear** (IC₀₂₅ = −0.30); **7 vs 2 does** (IC₀₂₅ = +0.28).
- **Sketch for ①.** For each (protein, symptom) pair: O = episodes with the protein inside the attribution window, and E = Σ over episodes of P(protein in window | the pet's own exposure pattern in matched control windows). This is the SCCS/case-crossover expectation, computed from the control windows ① already builds. Report IC and IC₀₂₅ per pair. **Gate:** IC₀₂₅ > threshold, with the threshold (and α₁/α₂) calibrated by the trajectory null harness (§4) rather than taken from the paper. Keep the McNemar test as a cross-check during the prototype.
- **New thing it lets the engine say.**
  - Owner: *"5 of her last 7 vomits came within 12 hours of chicken. From how often she eats chicken, about 2 would be expected."* The expected count supplies the denominator that "5 of 7" lacks: a staple chicken diet makes 5 of 7 unremarkable. It is count-phrased, uses no probability words, and stays positive-form.
  - Vet report: a small chronograph-style lag profile (O vs E in the 0–3h, 3–12h and 12–24h windows).
- **Honesty risks.**
  - E is conditional on a baseline model. Norén: "it is important to choose a baseline model that provides reasonably precise expected values". If the control windows are biased (for example, owners feed differently on sick days), E is wrong. This is the event-dependent-exposure problem (§3.4, §7.1).
  - Shrinkage with a symmetric α shrinks toward "no association", which is conservative for detection. For a *safety* lane the conservative direction is the opposite, so O/E belongs to the insight band (①), not to safety lanes.
  - An "expected" figure can read as the app claiming knowledge. The phrasing must attribute it to *her* feeding pattern, never to "cats in general".
- **Implementation weight.** Very low. Closed-form, no special functions for the approximate bounds, and about 40 lines. The exact interval needs the inverse incomplete gamma (about 80 more lines).
- **Verdict: PROTOTYPE,** as ①'s evidence statistic behind the existing floors first, compared in the harness, before it becomes a gate.

#### 2.4 Literature-informed, conflict-robust priors when there is no population

- **What.** When there is no in-house population, build the prior from published data, and make it **robust to prior–data conflict** with a heavy-tailed or vague mixture component, so a pet that differs from the literature is not overridden.
- **Citations.**
  - **Schmidli et al., *Biometrics* 2014, robust meta-analytic-predictive priors** (A, abstract): "two- or three-component mixtures of standard priors … for the one-parameter exponential family, straightforward posterior calculations … since one of the mixture components is usually vague, mixture priors will often be heavy-tailed and therefore robust." https://doi.org/10.1111/biom.12242
  - **Mueller, Olivry & Prélaud, *BMC Vet Res* 2016, CAT (2)** (A, full text checked). This is the available literature prior for protein culprits. **Dogs (n = 297 with cutaneous AFR):** beef 102 (34%), dairy 51 (17%), chicken 45 (15%), wheat 38 (13%), lamb 14 (5%). **Cats (n = 78):** beef 14 (18%), fish 13 (17%), chicken 4 (5%), wheat/corn/dairy 3 each (4%), lamb 2 (3%); rabbit was reported in individual cats. https://doi.org/10.1186/s12917-016-0633-8
- **Floor.** None for the math. The honesty floor is about applicability.
- **Sketch.** In ①'s shrinkage prior, set α₁/α₂ per protein slightly above 1 for literature-common culprits (beef, dairy, chicken, fish) and at 1 for others. Use a Schmidli-style two-component mixture (informative + vague) so the pet's own record dominates quickly.
- **New thing it lets the engine say.** Nothing new in copy. It changes *which* borderline associations surface first, favouring the literature-plausible ones.
- **Honesty risks.** High, and the reason this is not an ADOPT:
  - The CAT counts are **cutaneous** food reactions in **referral** populations. They are **proportions among confirmed cases, not risk per exposure**: beef tops the list partly because beef is commonly fed.
  - Culprit's dominant lane is GI.
  - An informative prior means two pets with identical records get different findings depending on the protein's name. That needs to be disclosed, which is awkward to phrase.
  - It also leans the engine toward the owner's likely prior belief ("it's the chicken"), the belief contamination the backfire literature warns about (prior brief §5).
- **Implementation weight.** Trivial once §2.3 exists.
- **Verdict: WATCH.** Prefer a symmetric, non-informative shrinkage (§2.3) until Dr. Chen rules that a GI-applicable, exposure-adjusted prior exists. Record the CAT figures as the candidate prior.

---

### §3 Lane 2: latent-state and point-process models of symptom episodes

#### 3.1 Bayesian online changepoint detection (BOCPD; Adams & MacKay 2007)

- **What.** An exact online recursion over "run length" (time since the last changepoint). At each step it gives a posterior over when the current regime began, using conjugate models (e.g. Poisson-Gamma for daily episode counts) and a hazard prior on changepoint frequency.
- **Citations.**
  - **Adams & MacKay 2007** (C, abstract): "an online algorithm for exact inference of the most recent changepoint … using a simple message-passing algorithm". https://arxiv.org/abs/0710.3742
  - **Robustness caveat: Altamirano, Briol & Knoblauch, ICML 2023** (A, PDF text checked): standard BOCPD "is not robust under outliers or model misspecification. This can lead to failures, where most data points inferred to be CPs are simply mild heterogeneities in the data … [and] can cause practitioners to act on safety-critical systems based upon an erroneously declared CPs." https://proceedings.mlr.press/v202/altamirano23a/altamirano23a.pdf
  - Health use exists but is thin. Search found physiological-transition detection in preterm infants (PubMed 30440337, D, not fetched) and nothing on owner diaries.
- **Floor.** Informally, a few events per regime. With a daily Poisson rate of about 0.1–0.3 vomits per day, each regime needs weeks. The **hazard prior** (expected regime length) largely decides the answer at this scale.
- **Sketch.** Not a new detector. Use it as an **internal onset-dating primitive**: for ⑦/④ and the trial lane, compute the posterior over "when did the current rate regime start". Use only the *mode ± interval* as a disclosed date on the vet report, and only when the posterior is concentrated.
- **New thing it lets the engine say.** Vet report: *"The current higher rate of vomiting most likely began in the week of Jul 7 (range Jun 30–Jul 21)."* Today ⑦ can name only the first episode in the window. The rule "a record-anchored date is free, a duration is guarded" (CLAUDE.md C-19) permits a disclosed date; it forbids a derived duration.
- **Honesty risks.**
  - Misspecification-driven false changepoints (Altamirano), which here means owner logging bursts read as disease regimes.
  - Changepoints at logging-density changes. Culprit's meal density halved in July for feeding-structure reasons (prior brief F5), and the model would happily date a "regime change" there.
  - The hazard prior is an unfalsifiable knob at n=1.
  - A change in *decreasing* direction must never render (escalate-only).
- **Implementation weight.** Low to moderate. About 150 lines; O(T²) or truncated run lengths; needs `lgamma`.
- **Verdict: WATCH.** Prototype only after the harness exists, and only as onset dating on the report. The robust variant (Altamirano) is the one to watch.

#### 3.2 Hidden Markov / state-space models of "flares"

- **What.** Latent disease-activity states (quiet, active, severe) emit observed counts, with a transition matrix giving flare persistence and recurrence.
- **Citations.**
  - **Dumkrieger, Ishii & Goadsby, *Headache* 2025** (A, abstract): a 4-state HMM fitted to *monthly* headache frequency from the American Registry for Migraine Research diaries. Emissions: 3.5 / 10.1 / 20.3 / 28 days per month. Result: "61.3% of the time, a change in chronic migraine classification was not accompanied by a change in the HMM state". The HMM is more stable than a single cutoff, which is a direct argument against fixed floors. https://doi.org/10.1111/head.14782
  - **Agachi et al., *JMIR mHealth uHealth* 2023** (A, abstract): an HMM of *user engagement* (inactive / average / high), fitted on 22,797 users over 78 weeks. https://doi.org/10.2196/43033
- **Floor.** Both were fitted on **registry or population data**: many people, monthly or weekly resolution, years of follow-up. A per-pet HMM with 3–4 states and a transition matrix has more parameters than a pet has regime switches.
- **Sketch and verdict.** **REJECT per pet. WATCH as a population model.** Once hundreds of pets exist, a species-level HMM (fixed parameters from the population, per-pet state *filtering* only) becomes feasible. Per-pet filtering on population-fitted parameters is cheap: the forward algorithm, about 60 lines.
- **Most useful near-term idea: model the *owner*, not the pet.** The engine's deepest stated limit is logging attrition ("stopped logging vomits" vs "vomits stopped"). An engagement-state model (Agachi-style) over the *logging stream* would let the trial lane's "fewer" direction be gated on "the logging regime is unchanged". A deterministic version needs no HMM: a symptom-logging-propensity check such as "were any non-meal events logged in the fewer window at the pre-trial rate?" Honesty caveat: no model can make a silent diary informative about the pet. It can only refuse to speak.

#### 3.3 Hawkes (self-exciting) point processes

- **What.** An event raises the short-term intensity of further events (clusters). Intensity = background rate + Σ kernel(time since past events).
- **Citations.**
  - **Kanaster et al. 2026** (C, abstract): a Bayesian *mixed* Hawkes model for seizure diaries of 407 newly diagnosed patients over 3 years. Clusters averaged 2.20 seizures (95% CrI 1.96–2.47). "Omitting random effects in the presence of heterogeneity leads to underestimation of the background intensity and overestimation of excitation rates." https://arxiv.org/abs/2605.22038
  - **Cheng, Gong & Xie 2024** (C, abstract): point processes when event times are uncertain, handled by imposing a time grid. Relevant because Culprit timestamps carry `occurred_at_source` and confidence. https://arxiv.org/abs/2411.02694
- **Floor.** Separating background from excitation at the individual level needs many events. The published fit leans on *random effects across 407 people*, and without them the excitation is overestimated. One pet with 20–40 episodes cannot identify both.
- **Sketch.** The engine already approximates self-excitation deterministically: 3h episode collapse, and gap-shortening (L4). A per-pet Hawkes fit would only add false precision.
- **Verdict: REJECT at n=1. WATCH at population scale.** The "flurry" question ("is this a cluster or background?") could be answered with population-fitted kernels once they exist.

#### 3.4 Recurrent-event survival models, and SCCS's own assumptions

- **What.** Andersen–Gill, PWP-TT/GT, marginal and frailty models for repeated events with time-varying covariates (meals as time-varying exposure).
- **Citations.**
  - **Amorim & Cai, *Int J Epidemiol* 2015** (A, abstract), tutorial covering AG, PWP-TT, PWP-GT, marginal, frailty and multi-state models. https://doi.org/10.1093/ije/dyu222
  - **Whitaker et al., *Stat Med* 2006** (A, abstract), SCCS tutorial: inference "within individuals, and hence fixed covariates effects are implicitly controlled". https://doi.org/10.1002/sim.2302
  - **Farrington, Whitaker & Hocine, *Biostatistics* 2009** (A, abstract): an SCCS variant "where occurrence of the event censors, curtails, or otherwise affects post-event exposures". https://doi.org/10.1093/biostatistics/kxn013
- **Floor.** AG/PWP are *cohort* methods whose power comes from many subjects. For one subject, the within-person Poisson likelihood with exposure-window covariates *is* the SCCS, which the engine already approximates.
- **The part that matters.** SCCS assumes **exposures are not affected by the event**. Pet owners break this all the time: after a vomit they withhold food, switch to bland food, change protein, or start a trial. The 2009 paper exists because this assumption fails in practice. Culprit's matched control windows will be **systematically different after episodes**, which biases ①'s discordance in unknown directions.
- **Sketch.** Two cheap moves.
  - (a) A **post-event exclusion (pre-exposure-style) window** in the control-window sampler: do not draw control windows from the N hours after an episode.
  - (b) The **time-reversed negative control** (§7.1), which *measures* whether event-dependent exposure is present in this pet's record.
- **Verdict: REJECT AG/PWP.** **ADOPT the event-dependent-exposure fix** (post-episode control-window exclusion) plus the negative control. This is a correctness fix hiding inside a methods question, and it should go to the adversarial reviewer.

#### 3.5 Forecasting from diaries (seizure cycles)

- **Citations.**
  - **Karoly et al., *Epilepsia* 2020** (A, abstract): forecasts from diary-derived circadian and multiday cycles in 50 app users with a **mean of 109 seizures per subject**. Predictive "for approximately half the cohort"; users spent 67.1% of time in low-risk and 14.8% in high-risk states, and 69.1% of seizures occurred in high-risk states. https://doi.org/10.1111/epi.16485
  - **Proix et al., *Lancet Neurol* 2021** (A, abstract): **≥20 seizures required** plus **≥6 months of hourly implanted-device EEG**. Next-day forecasts beat chance in 66% of the validation cohort, and at a 3-day horizon in 39%. https://doi.org/10.1016/S1474-4422(20)30396-3
  - **Goldenholz et al., *Ann Neurol* 2020** (A, abstract): deep-learning 24h forecasts from SeizureTracker, trained on **3,806 patients / 1.67M patient-days**. AUC 0.86 vs **0.83 for a rate-matched random forecaster**, Brier skill score 0.27. https://doi.org/10.1002/ana.25812
- **Lesson.** Most apparent forecast skill comes from **knowing the individual's rate**: the rate-matched random baseline reached AUC 0.83. The diary analog of this, the most mature one in the literature, needs ~100 events per person *or* thousands of people.
- **Verdict: REJECT** forecasting ("risk today") at Culprit's scale. **ADOPT the benchmark rule:** any future predictive claim must beat a **rate-matched random forecaster** from the pet's own rate, or it is not shown.

---

### §4 Lane 3: evaluation science when ground truth is scarce

#### 4.1 Surveillance evaluation: sensitivity, timeliness, false-alert rate, AMOC and G-AMOC

- **What.** Detectors are judged on **all three** of sensitivity, time-to-detection and false-alert rate, jointly. The AMOC curve plots expected time-to-detection against false-alert rate. G-AMOC adds the user's *response protocol* (grouping alerts, ignoring isolated signals).
- **Citations.**
  - **Buehler et al., CDC Working Group, *MMWR Recomm Rep* 2004** (A, abstract): the evaluation framework gives "particular attention to the measurement of timeliness and validity for outbreak detection". PMID 15129191.
  - **Buckeridge, *J Biomed Inform* 2007** (A, abstract): of 35 evaluation studies, 13 (37%) used **simulated outbreaks**. Detection depended on "the magnitude and shape of the signal and the timing". https://doi.org/10.1016/j.jbi.2006.09.003
  - **Jiang, Cooper & Neill, AMIA 2009, G-AMOC** (A, abstract): "the standard AMOC curve is a special case … that assumes a trivial response protocol (initiating a new and separate investigation in response to each alert signal)". A response protocol "such as grouping alerts or ignoring isolated signals" changes real performance, so G-AMOC can be used "to choose appropriate response protocols". PMC2815453.
- **Floor.** Needs a *simulator*, not a population. That is the point.
- **Sketch: the trajectory harness.** Extend the existing seeded-LCG Deno sweeps from snapshot nulls to trajectories. Each synthetic pet is a 180–365-day daily-evaluated record: a meal schedule, symptom episodes from a null process (Poisson, overdispersed/negative-binomial, autocorrelated or "wandering" rate), realistic logging attrition, and missed logs. Then:
  - **Null trajectories:** measure the **lifetime per-pet false-card rate**, per lane and **across all lanes**, which is what the owner experiences.
  - **Injected positives** (Buckeridge's simulated-outbreak method): add a true food effect at relative risk 2, 3 or 5 starting on day X, a chronic course, a post-prandial phenotype, or a trial response. Measure **detection probability and median days to detection**.
  - Plot **AMOC per lane.** Use **G-AMOC** to evaluate the *composition layer*, because suppression rules (⑤→⑥, ⑦→④), the one-nudge-per-day rule and card caps are exactly a "response protocol".
- **New capability.** This does not make the engine say anything new. It makes the **floor decisions answerable**. Every open floor ratification (⑦'s 5-vs-6, gap-shortening's 4-vs-5, the trial lane's fewer-direction viability) is today argued from a null fire rate alone. Each needs the sensitivity side, which the chronicity spec already asks for.
- **Honesty risks.** A simulator encodes our assumptions about the null. Mitigations: sweep base rates and overdispersion (⑦'s floor fails at 3.5/56d), include adversarial nulls (autocorrelated, logging bursts, event-dependent feeding), and report results *across* the grid, never at one assumed rate.
- **Implementation weight.** Moderate: about 400–800 lines of Deno test code, reusing the fixture builders. It should be a **CI-reported (not CI-gating) benchmark**, with numbers written to a committed file so drift shows in diffs. Keep the existing snapshot gates.
- **Verdict: ADOPT.** Highest leverage in this lane. It pairs with the existing B-758 synthetic-corpus issue.

#### 4.2 Simulation-study design discipline (ADEMP) and simulation-based calibration

- **Citations.**
  - **Morris, White & Crowther, *Stat Med* 2019** (A, abstract): the structured approach to simulation studies, "defining aims, data-generating mechanisms, estimands, methods, and performance measures ('ADEMP')", based on a review of 100 simulation studies found "often poorly designed, analyzed, and reported". https://doi.org/10.1002/sim.8086
  - **Talts, Betancourt, Simpson, Vehtari & Gelman 2018, SBC** (C, abstract): validates Bayesian computation by drawing parameters from the prior, simulating data, fitting, and checking rank statistics for uniformity. https://arxiv.org/abs/1804.06788
- **Sketch.** Write the §4.1 harness as an ADEMP document: one table per lane (aims, data-generating mechanisms, estimand, method, performance measures) committed beside the tests. If any Bayesian component ships (§2.3, §6), SBC is its unit test: the posterior intervals must cover at their nominal rate over prior-drawn pets.
- **Verdict: ADOPT** ADEMP as the harness's written form. **ADOPT SBC** as the test for any Bayesian component that ships.

#### 4.3 Decision curve analysis and net benefit

- **Citation.** **Vickers & Elkin, *Med Decis Making* 2006** (A, abstract). The threshold probability at which one would act encodes "how the patient weighs the relative harms of a false-positive and a false-negative"; net benefit is plotted across thresholds. https://doi.org/10.1177/0272989X06295361
- **Floor.** Needs **outcome labels**: was the alert followed by a confirmed problem? Culprit has none.
- **Sketch.** The future label source is the vet-visit companion (VV track). What the vet changed or stopped, and future diagnosis capture, could label some alerts. Until then, DCA can run *inside the simulator* with known truth, where it is a useful way to show the PM the false-positive/false-negative trade-off per floor.
- **Verdict: WATCH** for real data. **PROTOTYPE inside the harness** as a way to present floor choices.

#### 4.4 A warning about shipped, unvalidated alerts

- **Wong et al., *JAMA Intern Med* 2021, external validation of the Epic Sepsis Model** (A, abstract). Hospitalization-level AUC 0.63. The model **"did not identify 1709 patients with sepsis (67%) despite generating alerts … for 6971 of all 38 455 hospitalized patients (18%)"**. https://doi.org/10.1001/jamainternmed.2021.2626
- **Lesson.** A detector deployed widely without a sensitivity-and-burden evaluation can be both noisy and blind. Culprit's null-fire discipline already guards one side. §4.1 is the other side.

---

### §5 Lane 4: LLMs over personal health data

#### 5.1 PHIA, the "LLM writes code, runtime computes" pattern (Google; Nature Communications, 2026)

- **Citation.** Merrill et al., *"Transforming wearable data into personal health insights using large language model agents"*, arXiv 2406.06464 (C, abstract and HTML full text), "Accepted to Nature Communications"; published Jan 2026 per the search listing (B). https://arxiv.org/abs/2406.06464 · https://www.nature.com/articles/s41467-025-67922-y
- **Key numbers (checked in the arXiv HTML).** Exact-match accuracy on objective numerical questions: **PHIA (agent + code + search) 84%, code generation alone 74%, numerical reasoning without code 22%**. Error rate: PHIA 0.192 vs code-gen 0.395. Error categories include hallucination, code errors and misinterpreting the data; PHIA recovered from fatal errors in 11.4% of cases.
- **Stated limits, verbatim.** "We make no claim as to the effectiveness of these insights for helping real users understand their data, facilitating behavior changes, and ultimately improving health outcomes"; "We did not employ health experts to assess the domain-specific validity of PHIA's recommendations". The evaluation data came from **synthetic users** generated from 30,000 real wearable users.
- **Implication for Culprit.** The frontier's best general agent is wrong on **about 1 in 6** objective numeric questions *with* code execution. For a clinical-grade vet report that error rate is disqualifying for LLM-computed numbers. **The engine's current architecture (deterministic compute, Haiku phrasing only, `validatePhrasing` rejecting added claims) is ahead of the published frontier on honesty, not behind it.**
- **Verdict: ADOPT as policy (no change).** No LLM-computed number ever reaches owner copy or the report. **REJECT** a PHIA-style free-form code agent over the record for owner or vet surfaces. The Ask track's deterministic tool layer is the right shape.

#### 5.2 PH-LLM (Google, Nature Medicine 2025)

- **Citation.** Khasentino et al., *Nat Med* 2025 (A, abstract). A Gemini fine-tune for sleep and fitness: 79% vs 76% for human experts on sleep multiple-choice and 88% vs 71% on fitness. On 857 case studies it was "similar to human experts for fitness", improved over base Gemini on sleep insights, and predicted self-reported sleep quality from wearables. https://doi.org/10.1038/s41591-025-03888-0
- **Relevance.** Knowledge and coaching, not numeric inference on sparse event logs. It needs a fine-tune on large proprietary data. **REJECT** for the engine. It is marginally relevant to Ask's knowledge answers, where the provider's model already covers it.

#### 5.3 How well LLMs reason over health time series and statistics (2026 benchmarks)

- **HEARTS** (Li et al., arXiv 2603.06638, 2026; C): 16 datasets, 110 tasks, 16 models. "LLMs substantially underperform specialized models"; they "rely on simple heuristics and struggle with multi-step temporal reasoning"; "scaling alone is insufficient". https://arxiv.org/abs/2603.06638
- **WearableQA** (Lee et al., arXiv 2609.05405, Sept 2026; C): 4,084 questions over 200 real users' wearable data spanning up to 500 days. Accuracy ranged **19.6%–72.9%** against a 10% chance baseline; "most models achieve accuracies below 60%". https://arxiv.org/abs/2609.05405
- **StatABench** (Zhu et al., arXiv 2606.22977, June 2026; C): "even GPT-5.1 achieves only 68.6% on Stat-Closed". https://arxiv.org/abs/2606.22977
- **SciTab** (Lu et al., EMNLP 2023; C/B): claim verification against scientific tables. "All models except GPT-4 achieved performance barely above random guessing". https://arxiv.org/abs/2305.13186
- **MedCalc-Bench** (NeurIPS 2024 D&B; D, snippet): common failures include "incorrectly performing the arithmetic". https://arxiv.org/abs/2406.12036
- **Implication.** An LLM "reviewer" asked to *check* the engine's numbers or claims against the record would be a weak verifier (SciTab, StatABench). The only defensible reviewer role is **qualitative veto/escalate over already-computed findings**. For example: "these three findings together describe a pet whose record reads worse than any single card says; raise priority". Its output must be restricted to a closed set of actions (raise, cap, suppress-reassurance) that deterministic code executes, and it can never add a number or a claim.

#### 5.4 Multi-agent "false-positive suppression" for patient monitoring

- **Veritas-RPM** (Misro et al., arXiv 2604.16081, Apr 2026; C): a five-layer multi-agent system that *suppresses* remote-monitoring alerts, evaluated only on **synthetic** epochs (n = 530 from a 98-case taxonomy). https://arxiv.org/abs/2604.16081
- **Verdict: REJECT the pattern.** An LLM layer whose job is to *suppress* alerts is the reassure-from-absence failure in architectural form. Culprit's invariant allows an LLM to escalate or veto a too-calm framing, never to suppress a safety finding. This paper is a useful counter-example to cite.

#### 5.5 Verdict for Lane 4 overall

**ADOPT (policy):** deterministic compute and LLM phrasing only, with a closed-action-set reviewer if one is ever built. This is consistent with the open "AI Signals card — gestalt reviewer" question in CLAUDE.md. The 2026 evidence (HEARTS, WearableQA, StatABench) strengthens the case for keeping any reviewer bounded to escalate/veto.

---

### §6 Lane 5: sequential testing, anytime-valid inference and alert budgets

#### 6.1 The problem, quantified (original simulation; illustration, not literature)

The engine re-tests one growing record every day. Classical tests assume a fixed sample, and repeated looks inflate the false-positive rate. That has been known since **Armitage, McPherson & Rowe, *JRSS-A* 1969** (B, abstract listing: "when significance tests at a fixed level are repeated at stages during the accumulation of data, the probability of obtaining a significant result when the null hypothesis is true rises above the nominal significance level"). https://doi.org/10.2307/2343787

**My simulation** (Appendix A; Python, seeded, 20,000 null pets). Vomit episodes arrive Poisson at 0.15/day. Under the null each episode is "rapid" with p₀ = 0.2. From 6 episodes on, a one-sided exact binomial test at α = 0.05 is re-run on every day that brings a new episode. A **beta-binomial mixture e-process** (Beta(1,1) mixing, rejecting when E ≥ 1/α) runs on the same data.

| Horizon | Per-evaluation fire rate (fixed-n test) | P(fires ever), fixed-n test re-run daily | P(fires ever), mixture e-process |
|---|---|---|---|
| 180 days | 2.83% | **10.2%** | **1.2%** |
| 365 days | 3.02% | **13.5%** | **1.6%** |

**The cost, from the same simulation under true effects:**

| True rapid fraction | Fixed-n daily: detected within 180d / median day | E-process: detected within 180d / median day |
|---|---|---|
| 0.4 (2× chance) | 78.8% / day 70 | 40.7% / day 91 |
| 0.5 (2.5×) | 95.6% / day 55 | 76.5% / day 80 |
| 0.7 (3.5×) | 99.9% / day 41 | 99.5% / day 50 |

**Reading.** A floor calibrated to "≪5% per evaluation" can still produce a card on roughly 1 in 8–10 null pets within a year, *per lane per symptom*. Anytime-valid control fixes that, at a real cost in delay and power for weak effects and a small cost for strong ones. This trade-off, not the math, is the PM/Dr. Chen decision. The engine's actual lanes (matched pairs, episode collapse, recency gates that let a card expire) differ from this toy. **The §4.1 harness is how to measure the real number.** It is plausibly lower (recency gates) or higher (seven lanes times several symptoms).

#### 6.2 Always-valid p-values and the mixture SPRT

- **Citation.** **Johari, Koomen, Pekelis & Walsh, *Operations Research* 70(3):1806–1821, 2022** (B, publisher listing and abstract via search). Classical inferences "are wholly unreliable if users endogenously choose sample sizes by continuously monitoring their tests". Always-valid p-values via the **mSPRT** (mixture sequential probability ratio test) are "valid statistical inference whenever they make their decision". https://doi.org/10.1287/opre.2021.2135 · https://arxiv.org/abs/1512.04922
- **Floor.** None formal. Power grows with events, and the price is the delay shown in §6.1.
- **Verdict:** see §6.3. These form one family.

#### 6.3 E-values, test martingales and confidence sequences (the SAVI program)

- **What.** An e-process is a nonnegative (super)martingale under the null that starts at 1. By **Ville's inequality**, P(it *ever* exceeds 1/α) ≤ α. So it can be checked every day, forever, with lifetime error ≤ α. Confidence sequences are the interval version: intervals valid at all times at once.
- **Citations.**
  - **Ramdas, Grünwald, Vovk & Shafer 2023**, "Game-theoretic statistics and safe anytime-valid inference" (C, abstract; published in *Statistical Science* per my knowledge, not confirmed this session): SAVI methods "remain valid at all stopping times, accommodating continuous monitoring and analysis of accumulating data". https://arxiv.org/abs/2210.01948
  - **Howard, Ramdas, McAuliffe & Sekhon, *Ann Stat* 49(2):1055–1080, 2021** (B, abstract via arXiv): time-uniform, nonparametric, nonasymptotic confidence sequences that widen at the law-of-the-iterated-logarithm rate. https://arxiv.org/abs/1810.08240
- **Why it fits Culprit specifically.**
  - The **SCCS/case-crossover conditioning makes the null simple.** Given the pet's exposure pattern, the count of episodes whose window contains protein X is a sum of Bernoulli(pᵢ) with **known** pᵢ, the per-episode chance-exposure probability from control windows. That is the Poisson-binomial ⑤ already computes. A mixture likelihood ratio over an odds multiplier θ (e.g. a discrete grid or a Beta mixture) is then a valid e-process.
  - The same conjugate kernel as §2.3 means one small evidence module could serve ①, ⑤ and the trial lane.
  - Evidence **accumulates across days** instead of being re-tested from scratch. That also removes the Bonferroni-by-family-size dependence: e-values for different proteins can be combined, or Bonferroni'd at the e-value level with the same lifetime guarantee.
- **New thing it lets the engine say.** Nothing new to the owner; counts stay the register. Internally, "Established" gets a formal lifetime meaning: *under no association, a pet this closely watched reaches this bar less than 1 time in 20 over its whole record*. The vet-report methods note can then say that honestly.
- **Honesty risks.**
  - Validity rests on the conditional null being right. Event-dependent exposure (§3.4) breaks the known pᵢ, so the negative control (§7.1) is a precondition.
  - The mixture choice trades early against late power (§6.1). A mis-set mixture silently costs sensitivity. For **safety** lanes, where the safe error direction is toward firing, anytime-valid *suppression* control is the wrong tool. Keep it for insight lanes.
  - "Lifetime" guarantees assume the record is not reset. Card expiry/re-fire semantics and soft-deletes must be modelled.
- **Implementation weight.** Low. The beta-binomial mixture e-value is ~15 lines (lgamma only). The Poisson-binomial mixture over an odds grid is ~50 lines. Persisting the running e-value is unnecessary: it can be recomputed from the full record each day, since it is a deterministic function of the ordered episodes.
- **Verdict: PROTOTYPE** for ① and the trial lane, behind the §4.1 harness, as a comparison against the current gates. **Do not apply** to ④/⑦ (safety).

#### 6.4 E-detectors (anytime-valid change detection)

- **Citation.** **Shin, Ramdas & Rinaldo, "E-detectors: a nonparametric framework for sequential change detection", *New England J Stat Data Sci*** (B, journal page listing plus arXiv abstract). Sums of e-processes started at consecutive times, with "clean, nonasymptotic bounds on the average run length (frequency of false alarms)". They recover "Shiryaev-Roberts and CUSUM-style" detectors. https://nejsds.nestat.org/journal/NEJSDS/article/59/info · https://arxiv.org/abs/2203.03532
- **Relevance.** This is the formal version of what ④ (worsening), ⑦ (chronicity onset) and gap-shortening do informally. It gives an **average-run-length (ARL) guarantee**: the expected days between false alarms on a stationary pet, which is exactly the "alert budget" quantity.
- **Verdict: WATCH, and use for evaluation.** Adopt **ARL-to-false-alarm** as the harness metric for ④/⑦/L4 now (§4.1). Swapping the detectors for e-detectors is a later question, and for safety lanes the ARL target should be set by Dr. Chen from the false-negative side, not minimized.

#### 6.5 Alpha-spending for the bounded trial horizon

- **Citation.** **Lan & DeMets, *Biometrika* 70(3):659–663, 1983** (B, publisher listing and summary): an α-spending function α*(t) whose boundary "does not depend on the future decision times or the total number of decision times". https://doi.org/10.1093/biomet/70.3.659
- **Fit.** The diet trial has a **known horizon** (`target_duration_days`, e.g. 56). Group-sequential spending is the classical, well-understood tool for "look every day of a trial of known length". An O'Brien-Fleming-type spend makes early claims very hard and leaves nearly full α at the end, matching the clinical expectation that GI response appears in 10–14 days and derm by 5–8 weeks.
- **Verdict: PROTOTYPE** for the trial-response lane specifically. It is simpler to explain in a vet-report methods note than e-values.

#### 6.6 Alert budgets and response protocols

- **Bax & Shtoff 2024** (C, abstract): "it is impossible to maintain a constant requirement for significance for tests that have no a priori stopping time", but "we can come arbitrarily close … by using tests that require repeated significant results to confirm". https://arxiv.org/abs/2408.02821. This is a formal basis for a **persistence requirement**: a finding must clear its bar on k of the last m evaluations before it renders. That is a cheap, explainable halfway step.
- **Perez et al., *NEJM* 2019, Apple Heart Study** (A, abstract): of 419,297 participants, **0.52%** were notified over a median of 117 days. PPV was 0.84 for AF on a simultaneous ECG. 57% of notified participants who returned the survey contacted a provider. https://doi.org/10.1056/NEJMoa1901183. Precedent for a *deliberately rare, confirmation-gated* consumer health alert. (The confirmation algorithm's details are in the methods and were not verified here.)
- **G-AMOC** (§4.1): the response protocol (grouping, ignoring isolated signals) is part of the detector's real performance. Culprit's composition layer is a response protocol and should be evaluated as one.
- **Sketch: an explicit per-pet alert budget.** State a target such as "a stationary, healthy-record pet sees ≤ 1 insight-band card per N months from chance, across all lanes". Allocate it across lanes (Bonferroni over lanes, or e-value budgeting), and measure it in the harness. Safety lanes are **outside** the budget and governed by sensitivity targets instead.
- **Verdict: ADOPT** the budget as a harness metric. **PROTOTYPE** the k-of-m persistence gate, the cheapest lifetime-error reduction available.

---

### §7 Lane 6: other frontier moves

#### 7.1 Negative controls and empirical calibration

- **Citations.**
  - **Lipsitch, Tchetgen Tchetgen & Cohen, *Epidemiology* 2010** (A, abstract): negative-control **exposures** and **outcomes** detect "confounding as well as other sources of error, including recall bias or analytic flaws". https://doi.org/10.1097/EDE.0b013e3181d61eeb
  - **Schuemie, Ryan, DuMouchel, Suchard & Madigan, *Stat Med* 2014** (A, abstract). Designs including **SCCS** were applied to negative-control drugs; "the majority of observational studies would declare statistical significance when no effect is present", and empirical calibration "reduce[d] spurious results to the desired 5% level" and suggested ≥54% of p<0.05 findings should be re-evaluated. https://doi.org/10.1002/sim.5925
- **Sketch for ① and ⑤, all deterministic.**
  1. **Time-reversed exposure window.** Rerun ①'s matched-pair statistic with the attribution window placed *after* each episode (0–12h post). A protein that "predicts" vomiting *after* it happened signals event-dependent feeding, logging artifacts (meal and vomit entered together) or reverse causation (the pre-nauseous pet seeking or refusing food; prior brief, Marcus 1997). **Rule:** if the reversed statistic clears a lenient bar, cap the forward finding at Early and disclose nothing new. It is an internal gate only.
  2. **Negative-control outcome.** Run ① against an outcome no food plausibly causes within 12h (e.g. a `check_in` look or the medication-dose stream). Firing reveals pipeline artifacts.
  3. **Empirical null for ⑤.** Compute the "rapid" fraction for meal-*unrelated* logged events (e.g. non-GI events) as a check on logging-time artifacts. If owners log everything right after meals, apparent post-prandial clustering is an artifact.
- **New capability.** No new sentences. It **removes false ones** and gives the vet-report methods note a published bias-check it can name ("time-reversed negative control applied").
- **Honesty risks.** Negative controls detect bias; they do not correct it. At n=1 a reversed-window "hit" may itself be noise. Treat it as a *cap*, never as licence to state a finding is false, which would be the negative claim G2 forbids.
- **Implementation weight.** Very low. It reuses ①/⑤ code with a shifted window (~60 lines plus tests).
- **Verdict: ADOPT.** The best evidence-per-line move in this sweep.

#### 7.2 Conformal prediction for per-pet calibrated uncertainty

- **Citations.** Angelopoulos & Bates, "A Gentle Introduction to Conformal Prediction" (C) https://arxiv.org/abs/2107.07511. Gibbs & Candès, "Adaptive conformal inference under distribution shift" (C; NeurIPS 2021 per my knowledge), which guarantees coverage "over long-time intervals", not pointwise. https://arxiv.org/abs/2106.00170
- **Floor, derived.** Split conformal at level 1−α needs the ⌈(n+1)(1−α)⌉-th calibration score, which is finite only when **n ≥ (1−α)/α**, i.e. **≥ 19 calibration points at α = 0.05**. It also assumes exchangeability, which a symptom course (trending, autocorrelated) violates. The adaptive version only promises *long-run* coverage.
- **Verdict: REJECT.** Its guarantee is marginal and long-run. Culprit's claims are about the current state of one pet, which is exactly what conformal does not promise.

#### 7.3 Causal discovery and counterfactual n-of-1 from self-tracked series

- **Daza, *Methods Inf Med* 2018** (A, abstract): a counterfactual framework (the average period treatment effect, APTE) for single-subject observational studies, applied to **six years** of the author's weight and exercise data; it requires "the veracity of certain key assumptions [be] assessed critically". https://doi.org/10.3414/ME16-02-0044
- **Daza, Matias & Schneider, Model-Twin Randomization (MoTR)** (C, rev. 2025): the g-formula under serial interference, demonstrated on **nearly eight years** of Fitbit data. https://arxiv.org/abs/2208.00739
- **Runge et al., *Sci Adv* 2019 (PCMCI)** (A, abstract): causal networks from large time series, validated on climate and heart data "using large-scale synthetic datasets". https://doi.org/10.1126/sciadv.aau4996
- **Verdict: REJECT.** Floors are years of dense data or large-T series. The framing value (state the estimand; assumptions over algorithms) is already in the engine's design.

#### 7.4 "Ask the owner the one question that most reduces uncertainty" (value of information)

- **Citation.** **Li, Ponnada, Wang, Dunton & Intille, *Proc ACM IMWUT* 2024, "Ask Less, Learn More"** (A, abstract): choosing EMA questions by estimated information gain cut imputation error by **15%–52%** versus random omission, and mean survey length by **34%–56%**. https://doi.org/10.1145/3699735. JITA-EMA (Schneider et al., *Behav Res Methods* 2023; D, snippet): computerized-adaptive EMA reaching better classification with 2–3 questions than a fixed 5.
- **Fit to Culprit, which is constrained.** Principle 1 (zero decisions at the moment of the event) and Principle 4 (one nudge per day) rule out follow-up questionnaires. The legitimate form is to **rank candidate clarifications by expected information gain on the live findings** and use the day's single nudge for the best one, only when it is worth it. Examples: "confirm the time" for a low-confidence vomit that would move ⑤'s rapid fraction; "was this a hairball?" is *not* a candidate, since it would steer the owner toward a folk explanation. Expected gain can be computed exactly for the conjugate models above (§2.3/§6.3).
- **Honesty risks.** Asking about a finding primes the owner and changes future logging (a measurement effect). The question must never reveal the hypothesis ("did she eat chicken?" leaks the suspicion). It could also become engagement bait.
- **Verdict: WATCH.** Revisit after the notification foundation's consumer queue and the Principle-4 budget are settled. Its value depends on the §2.3/§6.3 kernel existing.

#### 7.5 Human factors of Bayesian outputs for self-trackers

- **"Bayesian Analysis of Self-Tracked Health Data: A Technology Probe Study"**, ACM Interactive Health 2026 (D; the page returned 403, so this rests on a snippet). Participants used Bayesian networks over their own trigger and symptom data and hit "misunderstanding of Bayesian capabilities and conclusions, and misalignment of conclusions with participant goals". https://dl.acm.org/doi/10.1145/3786579.3804970
- **Chakraborty, arXiv 2601.03299 (Jan 2026; C, single-author preprint, synthetic data only):** "progressive Bayesian confidence" tiers that reach directional signals by day 5–7 with a reported 5.9% false-discovery rate and "76% credible interval coverage" at day 90. The nominal level was not stated on the abstract page. If it was 95%, that is serious under-coverage. https://arxiv.org/abs/2601.03299
- **Lesson.** The one directly on-topic "cold-start personal-analytics" paper is a synthetic-only preprint whose own calibration figure looks like under-coverage. That is a cautionary example of tiered Bayesian confidence **shipped without SBC** (§4.2). Owner-facing Bayesian language is poorly understood even by motivated self-trackers. Culprit's count register stays the right choice.
- **Verdict: REJECT** owner-facing probabilistic tiers. The one confirmed "cold-start Bayesian" paper is a cautionary tale, not a precedent.

#### 7.6 Overdispersion in binomial n-of-1 outcomes

- **John, Bang, Winkelbeiner & Homan, arXiv 2607.08722 (Jul 2026; C):** methods for "extra-binomial variation" and "hierarchical clustering in addition to overdispersion" in binomial n-of-1 data. https://arxiv.org/abs/2607.08722
- **Relevance.** Episodes within a flare are not independent. "5 of 7 episodes" treated as 7 independent Bernoulli trials overstates evidence when 4 of them sit in one flare week. The engine's 3h episode collapse handles the finest scale. **Flare-level clustering is untreated.**
- **Sketch.** Add an overdispersed (beta-binomial) null to the harness (§4.1), and consider counting at the **episode-day** or **flare-cluster** grain for ①'s O. That is cheap, and it is the n=1 analog of cluster-robust inference.
- **Verdict: ADOPT** as a harness null. **PROTOTYPE** day-grain counting in ①.

---

### §8 Ranked shortlist: the five highest-leverage moves

Ranked by "step-level improvement to honest signal per unit of engineering". The ordering matters: 1 is the instrument that decides 3 and 4.

| # | Move | Verdict | Why it is step-level | Cost (TypeScript/Deno) | Gate |
|---|---|---|---|---|---|
| **1** | **Trajectory evaluation harness.** 180–365-day synthetic pets, null (Poisson, overdispersed, autocorrelated, logging attrition, event-dependent feeding) and injected positives. Reports AMOC per lane, G-AMOC for the composition layer, the **lifetime false-card rate per pet across all lanes**, and ARL-to-false-alarm for ④/⑦/L4. Written up as ADEMP. | **ADOPT** | Turns every open floor ratification (⑦ 5-vs-6, L4 4-vs-5, the trial lane's fewer direction) from a one-sided null argument into a two-sided sensitivity/burden decision. Measures the real daily-rerun inflation (§6.1). Uses the existing seeded-LCG pattern. | ~400–800 lines of test code; CI-reported, not gating | Pairs with B-758; excludes demo pets by id (prior brief §9) |
| **2** | **Negative-control gates on ① and ⑤.** Time-reversed exposure window; negative-control outcome; an empirical logging-time null. Plus the **post-episode control-window exclusion** that fixes SCCS's event-dependent-exposure assumption. | **ADOPT** | The only bias detector in the sweep that runs at n=1. Targets the failure the engine's design cannot see: owners change food *because of* the symptom. Precedent: Lipsitch 2010; Schuemie 2014 (SCCS included). | ~60–120 lines plus tests | Adversarial reviewer (a correctness change in ①) |
| **3** | **Anytime-valid gating** for lanes that re-test a growing record. Mixture e-process on the SCCS-conditional (Poisson-binomial) null for ①/⑤; **Lan–DeMets α-spending** over the trial's known horizon for the trial lane; a **k-of-m persistence** gate as the cheap interim. **Never on safety lanes.** | **PROTOTYPE** | Gives "Established" a lifetime meaning under daily re-evaluation. §6.1 shows fixed-n daily testing at ~3%/look reaching 10–13% ever-fire in 6–12 months, while the e-process holds ~1–2%. The cost (slower weak-effect detection) is explicit and decidable. | ~50–150 lines; lgamma only | #1 must quantify the real inflation and the delay cost first; PM/Dr. Chen trade-off brief |
| **4** | **Shrinkage O/E evidence statistic for ①** (Norén 2013: (O+½)/(E+½), closed-form 95% bound), with E from the pet's own control windows, and optionally a Schmidli-robust mixture prior. | **PROTOTYPE** | A **new count-phrased sentence**: "5 of her 7 vomits followed chicken; about 2 would be expected from how often she eats it". The self-scaling floor (O ≥ 5 at E = 1, O ≥ 7 at E = 2) replaces hand-set pair counts. Removes the family-size dependence of Bonferroni. Chronograph lag profiles for the vet report. | ~40–120 lines | Copy through nyx-voice + Dr. Chen; the literature-prior variant stays WATCH (§2.4) |
| **5** | **LLM boundary as policy:** deterministic compute, LLM phrasing only; any future reviewer gets computed findings plus a closed action set (raise / cap / suppress-reassurance), never numbers or suppression of safety. **Plus the forecasting rule:** no predictive claim unless it beats a rate-matched random forecaster. | **ADOPT (no build)** | 2026 evidence: PHIA 84% with code, 22% without; WearableQA mostly <60%; HEARTS shows LLMs underperform specialized models; Veritas-RPM shows the suppress-alerts anti-pattern. Goldenholz: rate-matched random reached AUC 0.83 vs 0.86. Protects the moat against a tempting shortcut. | none | Record in the AI-Signals Open Question row |

**Parallelism.** #1 and #2 are independent (the test harness vs detector code) and can run concurrently. #3 and #4 depend on #1's numbers and share one conjugate "evidence kernel" module, so build them together. #5 is a policy note and needs no build session.

**One decision unblocks two tracks.** The PM/Dr. Chen ruling on **what lifetime false-card budget a healthy-record pet should see** (e.g. ≤1 insight card per 6 months from chance) sets both #3's target and #1's pass/fail line.

---

### §9 Verdict table (every method assessed)

| Method | Data floor (evidence) | Verdict | One-line why |
|---|---|---|---|
| Trajectory harness (AMOC/G-AMOC, injected positives, ADEMP) | A simulator, no population | **ADOPT** | Measures the false-negative and lifetime sides no current test sees |
| Negative controls (time-reversed, outcome, logging-time) | Same as the detector it checks | **ADOPT** | The only n=1 bias detector; catches event-dependent feeding and reverse causation |
| SCCS post-episode control-window exclusion | Same as ① | **ADOPT** | Fixes a known assumption violation (Farrington 2009) |
| Alert budget + ARL metric | Harness | **ADOPT** | Makes "how often does a healthy pet see a card" a number |
| Overdispersed nulls; day/cluster-grain counts | Harness | **ADOPT** / PROTOTYPE | Flare clustering inflates "k of n" evidence |
| LLM boundary policy; rate-matched-random rule | — | **ADOPT** | Frontier evidence says LLM numbers are ~1-in-6 wrong at best |
| Mixture e-process / mSPRT (①, ⑤) | None formal; costs delay | **PROTOTYPE** | Lifetime error under daily re-runs; decide the trade-off with data |
| Lan–DeMets α-spending (trial lane) | Known horizon | **PROTOTYPE** | Classical, explainable, fits a 56-day trial |
| k-of-m persistence gate | None | **PROTOTYPE** | Cheapest lifetime-error reduction (Bax & Shtoff) |
| Shrinkage O/E (Norén/BCPNN) for ① | Valid at O=0; self-scaling floor | **PROTOTYPE** | New "N observed vs ~M expected" sentence; graded evidence |
| Bayesian n-of-1 phase posterior (vet report only) | Trial/re-challenge phases | **PROTOTYPE** | Credible intervals for the skeptical GP; never owner copy |
| DCA / net benefit | Outcome labels | WATCH (PROTOTYPE in simulator) | No labels yet; the VV track could supply some |
| BOCPD onset dating | Weeks per regime; hazard-prior-driven | WATCH | Misspecification yields false changepoints (Altamirano 2023) |
| E-detectors (④/⑦/L4) | ARL target from Dr. Chen | WATCH | Use ARL as a metric now; replace detectors later, if ever |
| Literature-informed robust priors | Applicability is the floor | WATCH | Cutaneous, referral-population, exposure-confounded data |
| Cross-pet hierarchical pooling | Population (hundreds of pets) | WATCH (+ store sufficient stats now) | The real multiplicity answer; T&S question |
| Population HMM with per-pet filtering | Population fit | WATCH | Per-pet state filtering is cheap once parameters exist |
| Value-of-information "one question" | Conjugate kernel + nudge budget | WATCH | Principle 1/4 constraints; priming risk |
| Per-pet HMM flare model | Registry-scale (Dumkrieger; Agachi 22,797 users) | REJECT | More parameters than one pet has regime switches |
| Per-pet Hawkes | Random effects across 407 people needed (Kanaster 2026) | REJECT | Excitation over-estimated without pooling |
| Andersen–Gill / PWP | Cohort methods | REJECT | SCCS is already the n=1 form |
| Diary seizure-style forecasting | ≥20 events + 6 months EEG (Proix); ~109 events/person (Karoly); 3,806 patients (Goldenholz) | REJECT | Culprit is one to two orders of magnitude under the floor |
| Conformal prediction | ≥19 exchangeable calibration points at α=0.05 (derived) | REJECT | Long-run marginal guarantee; claims are about now |
| PCMCI / Daza APTE / MoTR | Years of dense data | REJECT | Floors out of reach |
| PHIA-style code agent on owner/vet surfaces | — | REJECT | 16% numeric error even with code |
| LLM alert-suppression layers (Veritas-RPM) | — | REJECT | The reassure-from-absence failure in architectural form |
| Owner-facing posterior probabilities or confidence tiers | — | REJECT | Misunderstood even by motivated self-trackers; PREEMPT/I-STOP did not move primary outcomes |
| Population foundation models (Apple, 162K users; PH-LLM fine-tune) | Massive populations | REJECT | Not applicable to sparse event logs at n=1 |

---

### §10 Research debt and verification notes

- **AHRQ N-of-1 User's Guide, ch. 4 (Schmid & Duan 2014)** could not be fetched (the AHRQ site returned empty; the NCBI Bookshelf showed a captcha). Its specific recommendations (minimum crossovers, autocorrelation handling, priors) are **unverified**. The PREEMPT protocol (Barr 2015, full text) and I-STOP-AFib (Marcus 2022, abstract) stand in as verified Schmid-group practice.
- **Journal references not confirmed this session:** Ramdas et al. 2023 in *Statistical Science* (the arXiv page was fetched, the venue was not); Gibbs & Candès at NeurIPS 2021; the E-detectors NEJSDS volume and year (the article page was found in search, not fetched); PHIA's Nature Communications publication date (search listing; the nature.com page redirected to login).
- **Classics cited without re-fetching:** Wald's SPRT; Fawcett & Provost's original AMOC (1999), which is referenced only through G-AMOC's abstract; Armitage 1969's numerical tables (the qualitative claim is from the abstract listing; the inflation figures in §6.1 are **my own simulation**, not Armitage's).
- **§6.1 simulation scope.** It is a toy: a single binomial "rapid-fraction" lane, a Poisson arrival rate of 0.15/day, p₀ = 0.2 and a Beta(1,1) mixture. It shows the *direction and rough size* of daily-rerun inflation and of the e-process's cost. It is **not** a measurement of any shipped lane. The recency gates, card expiry, matched-pair structure and episode collapse of the real lanes could move the numbers either way. Harness #1 is the real measurement. Code: Appendix A.
- **Snippet-grade (D) items:** the ACM Interactive Health 2026 Bayesian probe (403); JITA-EMA's "2–3 questions beat fixed 5" (Schneider 2023); MedCalc-Bench's failure taxonomy; openEBGM/MGPS implementation details; BOCPD in preterm infants (PubMed 30440337).
- **The Apple Heart Study's confirmation algorithm** (the repeated-tachogram requirement) is in the paper's methods and was **not verified**; only the abstract's rates were.
- **Mueller/Olivry/Prélaud allergen frequencies** are cutaneous-AFR cases from mixed-quality sources (case reports, case series, conference abstracts, per the CAT's own evidence section). Whether any GI-specific culprit-frequency data exist for dogs and cats was **not searched**. That is a prerequisite for §2.4 to leave WATCH.
- **No veterinary n-of-1 or Bayesian owner-diary analytics literature was found.** One search returned PetSORT reporting standards and crossover-trial quality reviews only. Absence of evidence from one search, not a confirmed empty field.
- **Not researched (out of budget):** spike-and-slab/horseshoe priors for sparse food effects (the shape Gelman's "truly zero" caveat points to); INLA-in-JavaScript feasibility for a future cross-pet batch job; whether the "time-reversed window" negative control has a published n-of-1/diary precedent (it is proposed here as a design adaptation of Lipsitch's negative-exposure control, not cited as established practice).

---

### Appendix A: simulation code (Python, seeded; illustration only)

```python
# Null: episodes Poisson(rate/day); each "rapid" w.p. p0. From MIN episodes on, re-test on every
# day that adds an episode. Compare a fixed-n exact binomial test at alpha with a beta-binomial
# mixture e-process (a test martingale under the point null; reject when E >= 1/alpha).
from math import comb, lgamma, log
def binom_sf(k,n,p): return sum(comb(n,i)*p**i*(1-p)**(n-i) for i in range(k,n+1))
def log_e(k,n,p0,a=1.0,b=1.0):
    lB=lambda x,y: lgamma(x)+lgamma(y)-lgamma(x+y)
    return lB(k+a,n-k+b)-lB(a,b) - (k*log(p0)+(n-k)*log(1-p0))
# 20,000 null pets, 180/365 days, rate 0.15/day, p0 0.2, alpha 0.05, MIN 6, seed 7:
#   per-evaluation fire 2.83% / 3.02%; ever-fire fixed-n 10.15% / 13.49%; ever-fire e-process 1.16% / 1.57%
# Power (5,000 pets, 180 days, seed 11), detected-within-180d / median day / median episodes:
#   p1=0.4: fixed 78.8% / 70 / 10   e-proc 40.7% / 91 / 14
#   p1=0.5: fixed 95.6% / 55 / 7    e-proc 76.5% / 80 / 12
#   p1=0.7: fixed 99.9% / 41 / 6    e-proc 99.5% / 50 / 7
```

Shrinkage O/E lower bound (Norén 2013, α₁ = α₂ = ½): IC₀₂₅ = log₂((O+½)/(E+½)) − 3.3(O+½)^−½ − 2(O+½)^−3/2. Minimum O for IC₀₂₅ > 0: E = 0.25 → 3; 0.5 → 4; 1 → 5; 2 → 7; 3 → 8; 5 → 11. Worked cases: (O=5, E=1.8) → IC₀₂₅ = −0.30 (does not clear); (7, 2) → +0.28; (5, 1) → +0.31.

---

## Lane E: vomiting triage, vomit appearance, base rates and chronic-vs-acute urgency (evidence for recalibrating the per-incident vomit floor)

**Date:** 2026-09-24 · **Lane:** E (veterinary literature) · **Status:** research brief, not a spec · **Author:** research subagent

**Scope.** This lane goes past `docs/research/2026-08-signals-deep-dive.md` §4. That brief already covers Norsworthy's chronic-vomiting cohorts and the Marsilio 2019 challenge, the weakness of the bilious-vomiting (BVS) evidence, regurgitation vs vomiting, the 2026 ACVIM canine CIE consensus, cough contaminating the vomit stream, weight (Freeman), and Cannon's hairball ~10%. None of that is re-argued here. Where this lane depends on one of those findings, it cites §4.

**Evidence grades used:** consensus statement > systematic review > cohort > case series > textbook/review > expert opinion. Two more tags: **[human analog]** for human-medicine evidence used only as a structural precedent, and **[owner-facing]** for clinic or university pages written for owners. Owner-facing pages are expert opinion whose job is to be conservative about a single event.

**How the sources were checked.** Every source listed under §9 was fetched on 2026-09-24. Most came through Europe PMC abstracts or full text, or the publisher or university page. Items marked ⚠ in §8 could not be fully verified.

**Current behaviour, read from `supabase/functions/analyze-vomit/index.ts`:**
- Repeat vomiting: ≥2 events in 4h, or ≥3 in 24h.
- `feline_reduced_intake`: a cat with no meal rated most/all in 24h, but only if the owner rated any meal in the last 7 days.
- Lethargy: any lethargy event within 24h.
- Visual flags: `blood` (the model called `fresh_red` or `coffee_ground`) and `suspected_foreign_material`.
- Every flag forces `worth_a_call`. There is no other escalation tier.

---

### §0 Headline (five findings)

1. **No validated veterinary telephone or owner-facing triage system for vomiting exists.** In-clinic ED triage lists do exist (Ruys VTL 2012; VetTriS 2025), and a 2020 PLoS One paper states flatly that "there is currently no published research on telephone triage within the veterinary profession". Every owner-facing threshold below is expert opinion. The thresholds disagree by nearly an order of magnitude. Armstrong's alarm line is **8–10 vomits in one day**. A 2026 specialist-hospital owner page says **3+ in rapid succession** is an emergency and **2–3 in 24h** means a visit within one day. The app's 2-in-4h / 3-in-24h floor sits at the **most sensitive end** of published owner guidance.

2. **The published owner guidance is built for one acute episode. The PM's cat is a known chronic vomiter.**
   - Every source that separates the two gives chronic, recurrent vomiting a **scheduled-workup** disposition, not an emergency one.
   - Armstrong 2013 (DACVIM) defines acute as <7 days and chronic as ≥3 weeks, and says chronic warrants "extensive diagnostic evaluation". The 2023 ACVIM feline chronic-enteropathy consensus also uses ≥3 weeks.
   - The most widely used human telephone-triage system (Schmitt-Thompson) routes "vomiting is a chronic problem (recurrent or ongoing AND present > 4 weeks)" to **"See PCP within 2 Weeks"**. It sends even "SEVERE vomiting (8+/day) BUT hydrated" to home care.
   - The floor applies acute-episode rules to every episode of a chronic pattern. That is the structural cause of "more red flags than it's worth".

3. **The cat intake flag is the likeliest single source of false alarms, and its threshold is misattributed.**
   - The flag fires on "no meal eaten most/all in 24h". The PM's cat is a grazer whose meals were never once logged "all" (vet-council brief, 2026-06). So the flag fires on essentially every vomit. **⚠ Editor's note (2026-09-24, pre-commit): the premise is wrong for this record — 62 to 96% of meals were rated per week May to mid July, most of them "all". The flag's real trigger on this record was the rating stream collapsing from mid August (3 positive ratings across 209 meals from 8/17): 3 of the 4 intake flags fired with 4 to 6 meals logged in the window, all unrated. The mechanism the lane describes (absence of a positive rating read as not eating) is right; see the brief §3.**
   - The 24h owner rule is about a cat that **stops eating**. Cornell: anorexia "can have a severe impact on a mature cat's health if it persists for as little as 24 hours". Merck owner table: "failure to eat or drink for 24 hours".
   - The rule is not about eating less than a full meal. And it is not a hepatic-lipidosis onset time.
   - The only experimental evidence (Biourge 1993, 1994) produced clinical hepatic lipidosis after **5–7 weeks** of total fasting in cats >40% overweight.
   - The ISFM 2022 consensus grades intake below 80% of resting energy requirement (<80% RER) for **<3 days as low risk**, 3–5 days as moderate and >5 days as high. It says nutritional intervention should come "no later than 3 days after the cessation of eating".

4. **A photo-based blood call is the least reliable field in the read. It needs higher confidence, not removal.**
   - Absence of visible blood never reassures. In confirmed gastroduodenal ulcers, hematemesis was reported in only **20% of cats** (Bottero 2022, n=61) and **32% of dogs** (Fitzgerald 2017, n=82).
   - When dark "coffee-ground" material is seen, the human evidence says it is a weak signal. Coffee-ground vomit "without any other data supporting upper gastrointestinal bleeding, does not represent a reliable indicator" (Blanco Nodal 2024, n=276). In a 6,054-patient bleeding-unit cohort it had lower endoscopic yield, transfusion need and rebleeding than frank hematemesis (Schneider 2020).
   - No inter-observer study of visually identifying coffee-ground emesis was found, in human or veterinary medicine.
   - The nearest analog, caregiver vs clinician grading of infant stool colour from a smartphone card, started at a weighted **κ = 0.28**.

5. **The honest recalibration is about urgency tiers, never about reassurance.** The evidence supports four dispositions: *call now* / *call today* / *worth booking a visit* / *keep a record*. Today the floor has one escalation (`worth_a_call`), so it cannot say "this is a pattern worth a planned workup" without sounding like "call your vet now" every time. The chronic tier is still an escalation. The FCEAI and the vet sources say ~2–3 vomits/week is **not** benign. It simply should not ring on every episode.

---

### §1 Triage protocols: what exists, and the tiered red-flag table

#### §1.1 The evidence base for veterinary triage is thin

**In-clinic triage lists exist; telephone triage is unstudied.**
- **Ruys et al. 2012, JVECC, n=485.** A Veterinary Triage List adapted from the Manchester Triage System, with five colour categories and target waits of 0/15/30–60/120 minutes. Agreement with a review team: 95.5% for red and 84.3% for orange, vs 44.8% and 24.7% for intuitive nurse triage. https://pubmed.ncbi.nlm.nih.gov/22702436/ (cohort)
- **VetTriS (Groesser, Klootwijk, Ruys 2025, JVECC, n=164).** κ = 0.69. Over-triage 9.8%, under-triage 0.6%. It "did not allow for good assessment of hydration status". https://onlinelibrary.wiley.com/doi/10.1111/vec.70068 (cohort)
- Both are **in-person** ED triage with a hands-on check (vitals, mentation, perfusion). Their GI discriminators could not be retrieved (paywalled; see §8). They are not owner-facing.
- **Lightfoot et al. 2020, PLoS One (equine colic):** "There is currently no published research on telephone triage within the veterinary profession." https://doi.org/10.1371/journal.pone.0238874 (mixed methods; the statement is about the literature)

**Teletriage (Ireifej, Morello, Lesser 2026, Open Vet J).**
- Retrospective study of 1,575 dogs with GI signs seen by video teletriage. 23% were referred to the ER.
- Adjusted predictors of referral:
  - abdominal distension: +174% odds
  - lethargy: +126%
  - vomiting: +50%
  - anorexia: raised the odds
  - diarrhoea alone: −31%
- **No outcome follow-up**, so nothing can be said about whether a referral was needed. https://pmc.ncbi.nlm.nih.gov/articles/PMC13314175/ (cohort; describes clinician behaviour, not validity)

**Holzmann et al. 2023, Front Vet Sci (prospective, n=99 first-opinion dogs at an internal-medicine ER).**
- 34 had uncomplicated vomiting and 65 complicated. Obstructive foreign bodies were uncommon (3/99; a cited study found 10/213 = 4.7%).
- **Impaired mentation and clinical signs other than diarrhoea** predicted a complicated course.
- The number of vomiting episodes did not correlate significantly with the diagnostic utility of any test.
- Authors: "For dogs who have exclusively vomiting as a clinical sign, and present in good mentation, further investigations might not be beneficial."
- https://pmc.ncbi.nlm.nih.gov/articles/PMC9933778/ (prospective cohort; ER-selected)

**Human analog: the Schmitt-Thompson pediatric protocol "Vomiting Without Diarrhea" (2019 after-hours version).** This is the most widely used and most validated human telephone-triage system. It is read here for *structure only*:
- **Severity is graded per day:** MILD 1–2, MODERATE 3–7, SEVERE ≥8.
- **"Multiple stomach contractions (heaves) do not count as separate episodes of vomiting. At least 10 minutes need to pass, before we consider it another episode."**
- **Blood → Go to ED Now:** "[1] Blood (red or coffee grounds color) in the vomit AND [2] not from a nosebleed (Exception: Few streaks AND only occurs once AND age > 1 year)".
- **Bile (green) ×2 → ED** (obstruction). "Exception: Stomach juice which is yellow."
- **"SEVERE vomiting (8 or more times per day OR vomits everything) BUT hydrated" → Home Care** ("will usually pass").
- **MODERATE (3–7/day), age >1y, present >48h → See PCP within 24 Hours.** MILD >3 days → within 3 days.
- **"Vomiting is a chronic problem (recurrent or ongoing AND present > 4 weeks)" → See PCP within 2 Weeks.**
- Source: https://triagelogic.com/wp-content/uploads/2019/10/2019-Pediatric-After-Hours-Vomiting-Without-Diarrhea.pdf **[human analog; widely used protocol, expert-consensus grade]**

The lesson is not the numbers, since children are not cats. It is the **architecture**:
- Urgency comes from frequency × duration × hydration/mentation × specific appearance.
- Each of those has explicit exceptions.
- Chronicity is its own disposition, weeks out.
- Episode-counting has a de-duplication rule.

The Nyx floor has frequency (without de-duplication), appearance, and one disposition.

**Over-triage is the documented failure mode of automated triage.** Semigran et al. 2015, BMJ: 23 symptom checkers gave appropriate triage in 57% of vignettes overall, 80% of emergent cases, 55% of non-emergent cases and **33% of self-care cases**. "Triage advice from symptom checkers is generally risk averse, encouraging users to seek care for conditions where self care is reasonable." https://doi.org/10.1136/bmj.h3480 **[human analog; audit study]**

#### §1.2 (a) Tiered red-flag table

Species: B = both, C = cat, D = dog.

**Tier 1 — Emergency now**

| Sign | Threshold as published | Species | Source | Grade |
|---|---|---|---|---|
| Unproductive retching, distending abdomen, drooling, restlessness | "retching without producing anything"; GDV "requires immediate medical attention"; worse outcome when signs have lasted >6h | D (large, deep-chested) | ACVS GDV page https://www.acvs.org/small-animal/gastric-dilatation-volvulus/ | Specialty college, owner-facing (textbook-level) |
| Male cat straining with little or no urine (vomiting can accompany it) | "time from complete urinary obstruction until death may be less than twenty-four to forty-eight hours" | C (male) | Cornell FLUTD https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/feline-lower-urinary-tract-disease | Expert/owner-facing. ⚠ Merck's owner table puts "straining but failing to defecate or urinate" in *within 24h*; see §8 |
| Known or suspected toxin ingestion | Call a poison hotline or vet now; emesis is induced "ONLY in asymptomatic patients with recent ingestion (< 4 to 6 h)" | B | Clinician's Brief telephone triage (2014) https://www.cliniciansbrief.com/article/art-telephone-triage ; Thomovsky & Ilie 2024 CVJ https://pmc.ncbi.nlm.nih.gov/articles/PMC10880400/ | Review/expert |
| Known foreign body, or string under the tongue or from the anus | Most need surgery; perforation → peritonitis | B (string mostly C) | ACVS GI foreign bodies https://www.acvs.org/small-animal/gastrointestinal-foreign-bodies/ | Specialty college, owner-facing |
| Blood in vomit, fresh or coffee-ground | "Hematemesis … or melena" warrants "immediate diagnostic investigation" | B | Armstrong 2013 https://todaysveterinarypractice.com/gastroenterology/gi-intervention-approach-to-diagnosis-therapy-of-the-vomiting-patient/ ; MedVet 2026; PetMD 2024 ("any amount") | Review (DACVIM) + owner-facing |
| Very frequent vomiting | **"8–10 times in 1 day"** (Armstrong). "Three-plus episodes in rapid succession" (MedVet 2026). Can't keep water down (MedVet) | B | Armstrong 2013; MedVet https://www.medvet.com/vomiting-in-dogs-and-cats/ | Review; owner-facing. **The two thresholds disagree ~3×** |
| Vomiting with depression/extreme lethargy, weakness, pale or "muddy" gums, abdominal pain or distension, fever | Named concurrent signs | B | Armstrong 2013; Merck owner "When to See a Veterinarian" (extreme lethargy → see immediately) https://www.merckvetmanual.com/multimedia/table/when-to-see-a-veterinarian ; Ireifej 2026 (distension, lethargy); Holzmann 2023 (mentation) | Review + cohort |
| Faecal-smelling vomit, projectile vomiting | Named | B | MedVet 2026 | Owner-facing |
| Vomiting lasting >24h | "Vomiting or diarrhea for more than 24 hours" → see immediately | B | Merck owner table | Owner-facing (Merck) |
| Complete failure to eat or drink for 24h | "Failure to eat or drink for 24 hours" → see immediately | B (weighted to C) | Merck owner table; Cornell anorexia ("as little as 24 hours") https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/anorexia | Owner-facing/expert |

**Tier 2 — Call or be seen within ~24h**

| Sign | Threshold as published | Species | Source | Grade |
|---|---|---|---|---|
| Repeated vomiting | "Multiple episodes (two to three) across 24 hours" → within one day (MedVet). Cats: "more often than once or twice daily" → detailed exam (Merck owner, Webb, reviewed 2024) | B | MedVet 2026; Merck cat-owner vomiting https://www.merckvetmanual.com/cat-owners/digestive-disorders-of-cats/vomiting-in-cats | Owner-facing |
| Reduced appetite, no other signs | "Lack of appetite but no other signs of illness" → within 24h | B | Merck owner table | Owner-facing |
| Decreased energy (not collapse) | Named | B | MedVet 2026; Cornell vomiting ("lethargy, weakness … promptly") | Owner-facing |
| Acute vomiting in a cat | "Cats appear to be less likely than dogs to present with acute, self-limiting vomiting … and are relatively more likely … to require diagnostic investigation" | C | Armstrong 2013 | Review |
| Human analog: moderate vomiting (3–7/day) lasting >48h | → within 24h | — | Schmitt 2019 | [human analog] |

**Tier 3 — Non-urgent booked visit (days to ~2 weeks)**

| Sign | Threshold as published | Species | Source | Grade |
|---|---|---|---|---|
| Recurrent or chronic vomiting | More than once/week → "evaluated … promptly" (Cornell). "More than a couple of times per month" → "needs to be seen" (Teller, TAMU 2021). >every 2 weeks → more likely to have GI disease (St Denis & O'Brien, citing Norsworthy 2015). ≥3 weeks = chronic (Armstrong; ACVIM 2023). Human: >4 weeks → within 2 weeks (Schmitt) | B, esp. C | Cornell vomiting https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/vomiting ; TAMU https://vetmed.tamu.edu/news/pet-talk/when-to-be-concerned-about-feline-vomiting ; OVMA 2017 PDF https://www.canadianveterinarians.net/media/dojiquvt/hairballs-are-not-normal.pdf | Expert/owner-facing, plus consensus for the *definition*. ⚠ MedVet puts "chronic or recurrent vomiting … weekly" in *within one day*, the conservative outlier |
| Frequent hairballs | "Frequent hairballs or vomiting repeatedly" → vet (Merck owner). Frequent hairballs = "indicator of an underlying chronic disease" (Cannon 2013, prior brief §4) | C | Merck cat-owner page; Cannon 2013 | Owner-facing; review |
| Recurrent early-morning bile on an empty stomach | "Regular morning vomiting of yellow bile on empty stomach" → vet visit | B | MedVet 2026. BVS evidence is weak (prior brief §4) | Owner-facing |
| Weight loss (any), even with "mild" vomiting | "Although weight loss is the most common clinical sign, it often is overlooked by clients or even veterinarians" | C | ACVIM 2023 feline CE consensus https://pmc.ncbi.nlm.nih.gov/articles/PMC10229359/ | Consensus |
| Food vomited >8h after a meal | Delayed gastric emptying: "chronic intermittent vomiting that occurs more than 8 hours after eating" | B | Washabau, WSAVA 2005 (VIN) https://www.vin.com/apputil/content/defaultadv1.aspx?pId=11196&catId=30751&id=3854163 ; Vet Clin 2020 "Gastric Motility Disorders" https://www.vetsmall.theclinics.com/article/S0195-5616(20)30100-5/abstract | Textbook/review |
| Visible worms | Adult ascarids "occasionally found in the vomitus"; treatable, test/deworm | B | CAPC ascarid guideline https://capcvet.org/guidelines/ascarid/ | Guideline (parasite council) |

**Home monitoring — never an all-clear**

| Sign | Threshold as published | Species | Source | Grade |
|---|---|---|---|---|
| A single isolated episode in a pet that is bright, eating and drinking within hours, with no blood | "Pets with a history of mild, acute vomiting … that have a normal physical examination and no other concurrent signs usually have self-limiting signs and can be treated symptomatically or simply monitored" (Armstrong). MedVet lists a single episode of clear fluid or yellow bile, no blood, as home monitoring. Dogs: 45.8% of owner-reported episodes lasted <1 day (Dogslife) | B (less so C, per Armstrong) | Armstrong 2013; MedVet 2026; Holzmann 2023 | Review; cohort |

**What this table does not license:**
- **Frequency thresholds.** Armstrong's "8–10 times in 1 day" is one expert's line. MedVet's "three-plus in rapid succession" is another. Neither has been validated against outcomes.
- **The cat 24h line.** It is a *sign-of-illness* rule, repeated by every owner source, with no primary evidence behind the number. Its hepatic-lipidosis framing is addressed in §5.

---

### §2 Vomit appearance: clinical meaning and phone-photo reliability

#### §2.1 Blood: the reliability problem, stated with evidence

**Visible blood is insensitive: its absence never reassures.** This is the strongest new support for the never-reassure invariant.
- Bottero et al. 2022, JFMS: 61 cats with endoscopically confirmed gastroduodenal ulcers. Vomiting 90%, hyporexia 66%, **haematemesis only 20%**. https://doi.org/10.1177/1098612x221109802 (case series)
- Fitzgerald et al. 2017, JSAP: 82 dogs with confirmed GI ulceration. Vomiting 88%, **haematemesis 32%**, melaena 31%. https://doi.org/10.1111/jsap.12631 (case series)
- Liptak et al. 2002, JFMS (8 cats plus 25 from the literature): "Clinical signs consistent with gastrointestinal bleeding were infrequently identified although anaemia was a common finding." https://doi.org/10.1053/jfms.2001.0148 (case series + review)

**Coffee-ground material is a weak positive signal, even in humans with a clinician present.**
- Schneider et al. 2020, Eur J Gastroenterol Hepatol, n=6,054, UK bleeding unit 1992–2005. Coffee-ground vomit alone vs frank hematemesis and/or melena:
  - significantly lower risk of gastric and duodenal ulcer, varices, cancers and Mallory-Weiss tears
  - lower transfusion need and rebleeding (P<0.0001)
  - less likely to need endoscopic intervention
  - **similar 30-day mortality**
  - more often "no source found"
  - https://doi.org/10.1097/meg.0000000000001701 **[human analog; cohort]**
- Blanco Nodal et al. 2024, Gastroenterol Hepatol (retrospective, 276 patients endoscoped for coffee-ground vomit): "Coffee ground vomiting, without any other data supporting upper gastrointestinal bleeding, does not represent a reliable indicator." Urgent vs scheduled endoscopy made no difference to lesions, ICU admission, rebleeding or survival. https://pubmed.ncbi.nlm.nih.gov/37806346/ **[human analog; cohort]**
- Bou-Abdallah et al. 2012, J Emerg Med (case series, 6 patients): stable patients with coffee-ground emesis often had *other* serious illness, such as MI, urosepsis, bowel obstruction or PE. Endoscopy was unremarkable in 3 of 6. https://doi.org/10.1016/j.jemermed.2009.05.008 **[human analog; case series]**. For Nyx the lesson is that the dark vomit may be a marker of systemic illness rather than a GI bleed, and that is still an escalation.

**Inter-observer reliability of *visual* identification.** The specific study requested was not found: nothing measures whether people agree on what "coffee grounds" looks like, in human or veterinary medicine. Searches of Europe PMC, PubMed and the web found only outcome studies (above) and guaiac-test interference studies (guaiac tests on gastric aspirate are themselves unreliable at pH <2 or 2–4). The nearest measured analog is colour grading of stool from a smartphone-delivered colour card:
- Upadhyay et al. 2026, J Clin Exp Hepatol, n=7,529 newborns. Caregiver vs doctor weighted **κ = 0.28 at 6 weeks, rising to 0.74 at 10 weeks** with repetition and counselling. https://doi.org/10.1016/j.jceh.2026.103607 **[human analog; cohort]**

So colour judgment from phone media starts poor and improves with practice and standardisation. A vision model does not have the owner's context: lighting, what the pet ate, the dye in the treat.

**Small streaks after repeated retching.**
- Owner-facing vet content acknowledges that "repeated vomiting can cause irritation", which can produce a "light red or pink streak along with mucus" (PetMD, J. Coates DVM, 2024).
- The same page says to seek immediate care for "any amount of blood". https://www.petmd.com/cat/symptoms/why-my-cat-vomiting-blood (expert, owner-facing)
- The only codified exception is human pediatric (Schmitt): few streaks **and** only once **and** age >1 year.
- **No veterinary source codifies a streaks exception.**

#### §2.2 (b) Vomit-photo feature table

**Fresh red blood, frank (clots, pooled red)**
- **Meaning:** Active upper-GI bleeding (ulcer, foreign body, toxin, neoplasia, coagulopathy).
- **Assessable from a phone photo?** Moderate. It is fairly legible on a light floor. Confounders: red food dye, red treats, tomato or beet, red carpet or rug, warm white balance.
- **Evidence:** Armstrong 2013 (review); Bottero/Fitzgerald on low sensitivity (case series). No veterinary photo study.

**Fresh red streaks, pink-tinged mucus**
- **Meaning:** Possible mucosal irritation from repeated retching, but not dismissible.
- **Assessable?** Low. Small, low-contrast and confounded; a JPEG artefact, a hair or a food fleck can pass for a streak.
- **Evidence:** PetMD 2024 (expert); Schmitt exception [human analog].

**Coffee-ground (dark, granular)**
- **Meaning:** Digested blood, meaning slower or stopped bleeding. Humans: lower yield and lower PPV than frank blood; it can signal systemic illness.
- **Assessable?** Lowest. Digested dark wet food, liver-based pâté, chocolate, kibble crumbs, bile-stained debris and soil all look alike. This is the call most likely to be a false positive.
- **Evidence:** Schneider 2020; Blanco Nodal 2024 [human analog cohorts]. No inter-observer study found.

**No visible blood**
- **Meaning:** Uninformative. 68–80% of confirmed ulcers had no reported haematemesis.
- **Assessable?** Not applicable. It must never de-escalate.
- **Evidence:** Bottero 2022; Fitzgerald 2017; Liptak 2002 (case series).

**Yellow bile or foam**
- **Meaning:** Duodenal reflux, common on an empty stomach, not a red flag alone. Recurrent morning bile → booked visit (MedVet). Human: *green* bile repeated → obstruction; *yellow* stomach juice is the explicit exception (Schmitt). BVS is a diagnosis of exclusion (prior brief §4).
- **Assessable?** Good for yellow vs not-yellow. Moderate for green vs yellow.
- **Evidence:** MedVet 2026 (owner-facing); Schmitt [human analog]; prior brief §4.

**Clear fluid or white foam**
- **Meaning:** Non-specific. It could be regurgitated saliva or water, or post-tussive (cough → gag → foam; prior brief §4).
- **Assessable?** Good for "clear". It cannot tell vomit from regurgitation or cough.
- **Evidence:** Prior brief §4 (VCA on post-tussive vomiting).

**Undigested food, tubular shape**
- **Meaning:** Suggests regurgitation (oesophageal) or bolting. Different differentials from vomiting.
- **Assessable?** Moderate for digestion state and tubular form.
- **Evidence:** Clinician's Brief (prior brief §4); textbook.

**Partially digested food, well after a meal**
- **Meaning:** Food still in the stomach >8h after eating suggests delayed gastric emptying or outflow obstruction, so a workup. The meaningful feature is **photo content × logged meal time**, not the photo alone.
- **Assessable?** Photo: moderate for digestion state. The timing comes from the log.
- **Evidence:** Washabau WSAVA 2005; Vet Clin 2020 (textbook/review).

**Hair or hairball**
- **Meaning:** Frequent hairballs in shorthaired cats = chronic disease indicator (Cannon 2013). In CPAWS, hair presence was **not associated** with vomiting frequency. **Hair never de-escalates.**
- **Assessable?** High.
- **Evidence:** Cannon 2013 (review); Dowgray 2022 (cohort).

**Grass or plant matter**
- **Meaning:** Plant eating is often followed by vomiting: 27–37% of plant-eating cats "frequently" vomit afterwards; dogs 22%. Few cats look ill beforehand. The risk is a *toxic* plant (e.g. lilies in cats), which a photo cannot identify.
- **Assessable?** Moderate for "plant material". Poor for species.
- **Evidence:** Hart et al. 2021, Animals https://doi.org/10.3390/ani11071853 (owner survey); Sueda, Hart & Cliff 2008, Appl Anim Behav Sci (owner survey). ⚠ Lily toxicity not re-verified here.

**Worms (spaghetti-like)**
- **Meaning:** Ascarids. Deworm, not an emergency unless a young animal is weak.
- **Assessable?** Good.
- **Evidence:** CAPC guideline; Merck roundworms.

**Foreign material (string, plastic, fabric, bone)**
- **Meaning:** Obstruction or perforation risk. A linear foreign body in cats is high-consequence.
- **Assessable?** Good for obvious objects. Poor for a thin string partly hidden in the vomit.
- **Evidence:** ACVS (specialty, owner-facing); Holzmann (FB 3–4.7% of ER vomiters).

**Faecal smell or brown fetid material (copremesis)**
- **Meaning:** Obstruction.
- **Assessable?** Not assessable: a photo cannot smell, and the colour overlaps with food.
- **Evidence:** MedVet 2026; Holzmann (copremesis cases go straight to surgical clinics).

**Volume and number of piles**
- **Meaning:** Severity. Several piles from one bout are one episode (Schmitt's 10-minute rule).
- **Assessable?** Poor. There is no scale in the photo, and duplicate photos are possible.
- **Evidence:** Schmitt [human analog].

**Across the whole table:** there is no veterinary study of photo-based vomit assessment, human or AI, and no study of a vision model reading pet vomit. Everything in the reliability column is reasoned from the analogs above and from how cameras render colour. It is research debt (§8).

---

### §3 (c) Base rates

**Cats: owner-reported vomiting in a general (not health-screened) population.**
- Source: Dowgray et al. 2022, Front Vet Sci (Cat Prospective Aging and Welfare Study, CPAWS). n=206 enrolled, 205 with data; age 7–10y (median 8); Liverpool, UK; **not excluded for pre-existing disease**. https://doi.org/10.3389/fvets.2022.859041 (cohort baseline)
- **63% (130/205) vomited in the previous year.**
- Among vomiters: <monthly 54%, a few times a month 26%, weekly 10%, several times weekly 3%, unreported 7%.
- Converted to all cats:
  - ≈ **25% vomit ≥ a few times a month**
  - ≈ **8% weekly or more**
  - ≈ **2% several times a week**
- The paper's "39% … at least once a month" is 39% of *vomiters* (51/130), not of all cats; see §8.
- Hairballs "always" 17% and "occasionally" 60% of vomiting cats. "No association between the presence of hairballs and the frequency of vomiting." No association with azotaemia or hyperthyroidism (small n).
- **The PM's cat, vomiting every 2–4 days (≈1.75–3.5/week), sits in roughly the top 2–8% of this population.**

**Cats: vomiting reaching a vet record.**
- Source: VetCompass 2019 (O'Neill et al. 2023, JFMS), 18,249 UK primary-care cats. https://pmc.ncbi.nlm.nih.gov/articles/PMC10812063/ (cohort)
- "Vomiting" was recorded as a disorder in **3.2%** of cats that year (589; 95% CI 2.98–3.49).
- The grouped-level "enteropathy" was **8.5%**. "Anorexia" was 1.7%.
- Set against CPAWS's 63%, **most feline vomiting never becomes a veterinary presentation.** Owners normalise it. As Royal Canin Academy (citing Banfield data) puts it: "Many owners will consider their cat's vomiting or diarrhea to be 'normal'".

**Cats: hairballs.** Cannon 2013: ~10% of shorthaired cats regularly produce hairballs, and longhaired cats about twice as often (prior brief §4, verified 2026-08-14; "regularly" = ≥2/year).

**Dogs: owner-reported vomiting.**
- Source: Pugh et al. 2017, Prev Vet Med (Dogslife, UK Labradors, 4,728 dogs contributing data; 2,601 vomiting reports). https://pmc.ncbi.nlm.nih.gov/articles/PMC5424887/ (cohort)
- Incidence peaked at **1.04 incidents/dog-year at 3–6 months**.
- **Only 28.4% of vomiting reports involved a vet visit.**
- **45.8% lasted <1 day**, and a further 12.5% lasted 1–2 days.
- Owners were more likely to go to the vet after one day "if the dog vomited at least every six hours".
- **Haematemesis was ~0.5–0.8% of owner vomiting reports** (14 as the only sign, ~21 in total; ⚠ §8). About half of those led to a vet visit.

**How often presentations turn out serious.**
- ER-selected first-opinion dogs (Holzmann 2023): **34% uncomplicated, 65% complicated**. 7/65 went to surgery. Foreign bodies 3%. This is a *selected* population, so it is not a base rate for home vomiting.
- **There is no feline equivalent.** Cats "are relatively more likely than dogs to require diagnostic investigation" (Armstrong 2013).
- Among cats with *chronic* vomiting that *were biopsied*, 96–99% had small-bowel histological abnormality (Norsworthy; prior brief §4). But healthy cats also show histological change (Marsilio 2019), so this does not give a probability of disease.

**Blood in vomit: base rate and PPV.**
- Dogs: ~0.5–0.8% of owner-reported vomiting (Dogslife).
- Cats: no population base rate was found.
- **No veterinary PPV of owner-observed hematemesis for serious disease was found.**
- The only PPV-type data are human (coffee-ground < frank hematemesis for significant lesions; §2.1).

**Plant-eating and vomiting.** 27–37% of plant-eating cats frequently vomit afterwards (Hart 2021). Dogs: 22% of plant-eating dogs frequently vomit afterwards, and only 9% frequently seemed ill beforehand (Sueda, Hart & Cliff 2008).

**Scale anchor from the clinician side: FCEAI** (Jergens et al. 2010, JVIM). Vomiting is scored **0 none · 1 mild (1×/wk) · 2 moderate (2–3×/wk) · 3 severe (>3×/wk)**. Weight loss is scored 1 <5%, 2 5–10%, 3 >10%. https://academic.oup.com/jvim/article/24/5/1027/8447312 (validated clinical index; cohort)

By the vets' own disease-activity scale, **every 2–4 days is "moderate" to "severe" vomiting activity**, not background. The honest message to the PM is that the feature was *right that this pattern matters*. It was wrong to say so as an urgent call on each episode.

---

### §4 (d) Chronic vs acute: the urgency language, quoted

- **Armstrong 2013** (P. Jane Armstrong, DVM, DACVIM; Today's Veterinary Practice):
  - "Acute vomiting is commonly defined as vomiting of variable frequency over a period of less than 7 days."
  - "Chronic vomiting is commonly defined as persistent vomiting of variable frequency and, typically, duration of 3 weeks or longer."
  - Mild acute vomiting with a normal exam "usually [has] self-limiting signs and can be treated symptomatically or simply monitored". Chronic vomiting warrants diagnostic evaluation rather than symptomatic management.
  - (review)
- **ACVIM 2023 feline consensus** (Marsilio et al., JVIM): "Chronic enteropathy for cats with chronic (at least 3 weeks' duration) signs of gastrointestinal disease…"
  - Low-grade lymphoma cases had signs for a median **365 days**, and lymphoplasmacytic enteritis cases for a median **107 days**.
  - That timescale is months, not hours. The right ask is a workup, and a delay of days does not change outcome in the way it does for obstruction or GDV.
  - (consensus)
- **Cornell Feline Health Center** (updated 2021):
  - "It is not uncommon for a cat to expel a hairball once every week or two without any enduring problems."
  - "Cats that vomit more frequently than once per week or that show signs of lethargy, weakness, decreased appetite, blood in the vomitus, increased thirst, increased or decreased urination, or simultaneous diarrhea should be evaluated by a veterinarian promptly."
  - (expert, owner-facing)
- **Teller (TAMU, 2021):** "if a cat vomits more than a couple of times per month or if the cat displays other symptoms of illness, it needs to be seen by a veterinarian". Also "a veterinarian would much rather see a vomiting cat and determine that the cat is otherwise healthy". (expert, owner-facing)
- **St Denis & O'Brien, "Hairballs are not normal"** (OVMA 2017, both DABVP feline):
  - "cats that are vomiting more often than every 2 weeks are significantly more likely to have some baseline underlying GID (Norsworthy et al, 2015)."
  - **"When clients are uncertain about vomiting and/or hairball frequency, a calendar recording system should be recommended."**
  - "The documentation of weight loss in a cat with frequent vomiting may be the only physical examination change noted."
  - (expert, CE proceedings; directly supports the app's *logging* role)
- **Schmitt-Thompson (human):** chronic (>4 weeks) → "See PCP within 2 Weeks". [human analog]
- **MedVet 2026** (E. Klosterman, DACVIM): "Chronic or recurrent vomiting that occurs weekly or intermittently" sits in "Schedule professional evaluation within one day". This is the most conservative owner source found and shows how owner content collapses chronic into acute urgency. (owner-facing)

**Synthesis.**
- Every clinician-authored source that separates the two dispositions treats chronic vomiting as **"needs a workup visit; do not normalise"**. None treats it as an emergency on each episode.
- The acute red flags (blood, foreign body, not eating, lethargy, collapse, abdominal pain, very high frequency, unable to keep water down) apply **on top of** the chronic state, and they remain call-now triggers.
- Correct framing for a known chronic vomiter:
  - "This pattern is worth a booked visit (if not already underway)", said once and reinforced by the pattern lane.
  - Plus "these specific changes mean call now".
  - Not "worth a call" on every episode.

---

### §5 Feline hepatic lipidosis: what the anorexia-duration threshold actually rests on

**Experimental (the only direct evidence of time to onset).**
- **Biourge et al. 1994, AJVR** (15 obese cats, >40% overweight, voluntary long-term fast): "Clinical signs and laboratory results consistent with hepatic lipidosis were observed in 12 of 15 cats **after 5 to 7 weeks of fasting**, and were associated with 30 to 35% reduction of initial body weight."
  - Histologic lipidosis developed in all 15, but the timing of histologic onset is not given in the abstract.
  - Early changes (urea, glucose, albumin, RBC mass) appeared at 2–4 weeks.
  - "Except for development of hepatic lipidosis, cats appeared to tolerate the fast without other adverse effect."
  - https://doi.org/10.2460/ajvr.1994.55.09.1291 (experimental)
- **Biourge et al. 1993, JVIM:** six obese laboratory cats developed clinical hepatic lipidosis **6–7 weeks** after a diet change that produced near-zero intake. https://doi.org/10.1111/j.1939-1676.1993.tb03186.x (case series)

**Clinical reviews and case series.**
- Webb 2018, JFMS review: "The classic presentation is that of an overweight cat that stops eating for **days to weeks**, losing weight in the process." https://doi.org/10.1177/1098612x18758591 (review)
- Kuzi et al. 2017, Vet Rec (71 cats with hepatic lipidosis): primary conditions were GI disease, pancreatitis or cholangiohepatitis in 44%, stressful events in 20%, and idiopathic in 28%. Mortality was 38%. https://doi.org/10.1136/vr.104252 (cohort)
- Recent case reports describe ~1-week histories of anorexia at presentation (e.g. Park et al. 2026 JAAHA; Akiyoshi 2026 OVJ).

**Consensus.**
- **ISFM 2022, "Management of the Inappetent Hospitalised Cat"** (Taylor et al., JFMS). https://pmc.ncbi.nlm.nih.gov/articles/PMC11107985/ (consensus; for hospitalised cats, but the at-home clause is explicit)
- Nutritional-risk table: food intake **<80% RER for <3 days = low risk**, **3–5 days = moderate**, **>5 days = high**.
- "Given the metabolic and pathological changes that occur in cats following prolonged fasting, nutritional interventions … should be implemented **no later than 3 days after the cessation of eating**. When cats are presented for veterinary assessment of inappetence, it is important to take into consideration the number of days without normal food intake **at home** that have already elapsed…"
- Feeding-tube indication: "Patients consuming less than 80% RER for 3 days or more, especially if associated with involuntary weight loss."

**Owner-facing.**
- Cornell anorexia: "anorexia can have a severe impact on a mature cat's health if it persists for as little as 24 hours". For kittens under 6 weeks it is 12 hours.
- Merck owner table: "Failure to eat or drink for 24 hours" → see immediately; "Lack of appetite but no other signs of illness" → within 24h.
- **The current Merck professional hepatic-lipidosis page (S. Center, updated 2025) and the Cornell hepatic-lipidosis page state no anorexia duration at all.**

**Grading the claim "a cat not eating for 24h needs a call".**

| Claim | Status |
|---|---|
| A cat that has **stopped eating** for 24h should be discussed with a vet today | **Well supported as owner guidance** (Cornell, Merck; expert opinion, consistent across sources). Anorexia is a non-specific sign of most feline disease, and the call is about finding the cause. It is not about hepatic lipidosis starting at hour 24. |
| Hepatic lipidosis risk starts at 24–48h | **Not supported.** No primary source fixes onset at 24–48h. Experimental clinical hepatic lipidosis took weeks in obese cats. The best-grounded clinical line is ISFM's 3 days. |
| Overweight cats are at higher risk | **Supported** (Biourge used cats >40% overweight; Cornell "much higher in obese cats"; Merck "overconditioned"). The magnitude by body condition score is not quantified. |
| Reduced (not absent) intake for 24h is a red flag | **Not supported.** ISFM calls <80% RER for <3 days low risk. Partial intake becomes a concern at ≥3 days, or with weight loss. |

**Correction to an earlier Nyx brief.** `docs/research/2026-05-feeding-windows-and-partial-eating.md` line 61 says hepatic lipidosis "can develop after as little as 2–3 days of complete anorexia, and more reliably after 1–2 weeks of *reduced* intake". It cites Merck, Cornell and Wallace 2024. **None of the three pages as fetched on 2026-09-24 contains either duration.** Wallace 2024 is about time to enteral feeding after admission: ≤12h vs >12h, 68% vs 57% survival, P=.55. The 2026-05 brief needs a §V addendum per the frozen-brief convention. Its conclusion ("didn't eat" is high-acuity in cats) survives. The hepatic-lipidosis mechanism attached to 24–48h does not.

---

### §6 Repeated alerts for a known chronic vomiter: what vets tell owners to watch for

**The honest finding: there is no published protocol for "re-contact triggers in a known chronic vomiter".** The evidence is indirect.

- **The disease-activity indices *are* the re-contact spec.**
  - FCEAI (cats) scores vomiting frequency by band (1/wk, 2–3/wk, >3/wk), plus diarrhoea, appetite, attitude/activity and weight loss (<5%, 5–10%, >10%).
  - The 2026 ACVIM canine CIE consensus prescribes at-least-weekly index monitoring during trials (prior brief §4).
  - So a change in *band* is what a clinician would call worsening. A new episode at the same band is not.
- **Owner-facing chronic-GI guidance:**
  - Cornell IBD: "Vigilant monitoring by the veterinarian and owner is also critical, so that relapses can be assessed and the dosing of long-term medications can be adjusted."
  - Lap of Love (veterinary hospice network): monitor "appetite, vomiting, defecation, weight, and energy levels". Contact "immediately if your cat stops eating, develops uncontrollable diarrhea or vomiting, a distended abdomen, or difficulty breathing, or vocalizes in pain". https://www.lapoflove.com/resource-center/common-diseases-in-cats/ibd
  - (expert, owner-facing)
- **ACVIM 2023:** weight loss is the most common sign of feline CE and is "often … overlooked by clients or even veterinarians".
- **St Denis & O'Brien:** keep a calendar, and weight loss may be the only exam finding.

**Derived re-contact trigger set for a known chronic vomiter.** Each trigger is sourced above. Everything else is "logged toward the pattern", **which is not reassurance**.

1. **Frequency moves up a band** from the pet's own recent baseline. For example, the FCEAI band rises (≤1/wk → 2–3/wk → >3/wk), or ≥3 distinct episodes in 24h (MedVet's within-a-day line).
2. **Any visible blood** (fresh or coffee-ground, at adequate confidence) or foreign material.
3. **Not eating.** Complete refusal for ≥24h, or reduced intake for ≥3 days (ISFM).
4. **Lethargy, weakness or hiding**, abdominal pain or distension, or vomiting with inability to keep water down.
5. **Weight loss.** Any confirmed downward trend. ≥5% is the cachexia-definition criterion (prior brief §4) and FCEAI's "moderate" band.
6. **New co-signs.** Diarrhoea, increased thirst or urination (Cornell), and for a male cat litter-box straining.
7. **A new sign on the cough/vomit boundary** (prior brief §4). A new cough is its own problem line.

---

### §7 (e) Implications for recalibrating a per-incident floor that must never reassure

**Guardrail restated.** Every change below changes *which escalation fires and how urgent it sounds*. None produces "fine", "normal" or "nothing to worry about". "Keep an eye on" and "logged toward the pattern" stay non-reassuring: they name what is visible, what would change the ask, and that the vet is the call if worried. The n=1 rule still holds. A single photo may escalate on *presence* and never reassure on *absence*. The §2.1 sensitivity data (80% of cat ulcers with no haematemesis) is the strongest argument yet for keeping it.

**Probable false-alarm drivers for the PM's cat, in order of likely contribution:**

1. **`feline_reduced_intake` fires on partial intake.**
   - **Problem.** A free-fed grazer whose meals are never rated "most/all" satisfies it permanently (⚠ on this record the cause was unrated meals, not low ratings; editor's note above). The owner "tracks intake" (rates meals), so the tracking guard does not help. This one flag can make every photographed vomit `worth_a_call`.
   - **Evidence.** The 24h owner rule concerns *stopping eating*. Partial intake is low risk for <3 days (ISFM).
   - **Recalibrate (stays safe).**
     - Fire at **24h only on a positive refusal fact**: an explicit "didn't eat" or "refused" record, or a declined offered meal. This is the "intake is not preference" invariant: refusal is the signal.
     - For partial intake, fire at **≥3 consecutive days** below the cat's own baseline, or with a weight drop.
     - **Never fire on the absence of a full-meal rating.**
   - A truly anorexic cat still escalates at 24h. A grazer eating half-portions does not trip it daily.
   - This mirrors CUL-873's lesson: *a mirrored constant must answer the same question*. The 24h number answers "has this cat stopped eating?", not "did this cat finish a bowl?".

2. **`repeated_vomiting` at 2-in-4h, counting raw events.**
   - **Problem.** Cats often produce several piles from one bout, or the owner photographs the same event twice. Schmitt's rule, "at least 10 minutes need to pass", exists for exactly this.
   - **Evidence.** The literature's *call-now* frequencies are higher: 8–10/day (Armstrong), "3+ in rapid succession" (MedVet), inability to keep water down. 2–3 in 24h is a *within-a-day* line (MedVet), not call-now. Holzmann found episode count did not predict which tests would be useful.
   - **Recalibrate.**
     - Collapse events into episodes first, with a gap of at least ~10–30 min (a Dr. Chen call).
     - Then:
       - ≥3 episodes in ~4h, or vomiting with inability to keep water down → **call now**
       - ≥3 episodes in 24h → **call today**
       - 2 in 4h alone → no escalation; logged toward the pattern
     - For a pet with an established chronic baseline, escalate on a **band change** (§6 trigger 1), not on the absolute count.

3. **The blood call on dark or ambiguous material.**
   - **Problem.** `coffee_ground` is the least photo-reliable field (§2.2) and the weakest positive signal even in human medicine.
   - **Keep escalation on presence.** Every clinician source says blood → vet.
   - **Reduce false positives without reassuring:**
     - (a) Require high per-field confidence for `coffee_ground`, and a slightly lower bar for `fresh_red`.
     - (b) On a low-confidence blood call, ask the owner a **one-tap confirm on the result screen**, after the log so Principle 1 holds: "Is the dark material something she ate, or does it look like coffee grounds?". *Unsure* keeps the escalation. Only an explicit owner "it's the food" moves it to *keep an eye*, and the copy still names what was seen.
     - (c) A Schmitt-style streaks exception ("few streaks, once, after repeated retching" → call during office hours rather than now) has **no veterinary basis**. It is flagged as a PM/Dr. Chen decision with a recommendation *against* adopting it without Dr. Chen's explicit sign-off. Pets cannot report nausea, and any-blood → vet is universal in veterinary owner guidance.

4. **One escalation register for two different asks.**
   - **Problem.** `worth_a_call` has to carry both "call now" (blood, foreign body, not eating, lethargy) and "this pattern needs a workup". Said on every episode, the second reads as the first. That is Semigran's over-triage failure mode, and the PM's exact complaint.
   - **Add a non-urgent escalation register:** *worth booking a visit*.
     - It fires when the pattern crosses a chronic line: ≥3 weeks of recurrence (Armstrong/ACVIM), or ~>1/week (Cornell).
     - It points at the chronicity lane (⑦) rather than repeating per incident.
     - Other triggers: frequent hairballs, recurrent morning bile, food retained >8h, visible worms.

5. **A known-chronic state needs an owner action, never an inference.**
   - Once the owner marks "my vet knows / a workup is booked or done", the per-incident card stops re-escalating on baseline frequency. From then on it escalates only on the §6 change triggers.
   - Without that action, the pattern stays at *worth booking a visit*. It never becomes "normal for her".
   - This mirrors the med-history rule: `Ended` only from an owner action.

6. **Keep lethargy as call-now.** It is the most consistent discriminator in the evidence: Holzmann (mentation), Ireifej (lethargy OR ≈2.26 for ER referral), Armstrong, and Merck ("extreme lethargy").

7. **Add red flags that are currently absent.** Recalibration should add real signal, not only remove noise.
   - Dog: retching with nothing produced, or a swelling belly (GDV) → call now.
   - Male cat: vomiting plus litter-box straining → call now (obstruction).
   - Any logged toxin or foreign-body ingestion → call now.
   - Vomiting with inability to keep water down → call now.
   - These need capture affordances (Designer + Dr. Chen). They are listed as candidates, not proposals to build.

8. **Copy follows the tier.** "Call your vet now" / "Worth a call to your vet today" / "Worth booking a visit about this pattern" / "Logged. If … happens, call your vet." Each tier names *why*. The fourth never comments on the absence of concern (existing Pattern-1 copy rules).

**Where the evidence stops, and a Dr. Chen / PM call is needed:**
- the episode-collapse gap
- whether 3-in-24h is "call today" or "call now" for **cats** (Armstrong says cats are less often self-limiting)
- the band definition of "baseline" for a chronic vomiter (FCEAI bands are the defensible default)
- the streaks exception (recommend no)
- the 3-day partial-intake line (ISFM) vs a baseline-relative drop

---

### §8 (f) Research debt and unverified claims

1. **No inter-observer study of visual coffee-ground identification was found** in any species. The human evidence is outcome-based (PPV/yield) only. The requested "reliability of a photo blood call" evidence does not exist. The stool-colour-card κ is an analog.
2. **No veterinary study of photo-based or AI vomit assessment** was found in Europe PMC.
3. **No veterinary PPV of owner-observed hematemesis.** The dog base rate is ~0.5–0.8% (Dogslife). No cat base rate.
4. ⚠ **Dogslife haematemesis count.** A summarizer returned both "21 of 2,601" and "14 cases alone (50% vet visit)". Likely 14 as the sole sign and ~21 including combined reports. **Verify against the paper's table** before citing a number.
5. ⚠ **CPAWS "39% at least once a month" denominator.** The breakdown sums to 39% of *vomiters* (51/130), i.e. ~25% of all cats. The paper's sentence reads as "of owners". Cite as "≈25% of cats (39% of vomiting cats)".
6. ⚠ **Merck owner "When to See a Veterinarian" table.** Category assignments came through a summarizer. In particular, "Straining but failing to defecate or urinate" listed under *within 24 hours* conflicts with Cornell's obstruction urgency (death possible in <24–48h). Read the table directly before citing. For a male cat, Cornell governs.
7. ⚠ **ACVS foreign-body page** did not contain the common "never pull a string" advice. Source it elsewhere if used.
8. ⚠ **VTL and VetTriS GI discriminators** were not retrieved (Wiley/ResearchGate 403). Only the abstracts were verified.
9. ⚠ **Cannon 2013 full text** was not re-fetched (Europe PMC XML unavailable). The ~10% figure and "regularly = ≥2/year" rest on the 2026-08-14 verification.
10. ⚠ **Lily toxicity in cats** was not re-verified in this lane.
11. ⚠ **Webb 2018 full text** was not accessible (reCAPTCHA). Only the abstract's "days to weeks" was verified.
12. **Do not cite.** A southwestjournal.com page claims "a 2023 study found 68% of cats showing these signs required transfusion or surgery", with no citation. It looks like generated content. It surfaced in search and must never enter a Nyx doc.
13. **Correction owed to the 2026-05 feeding-windows brief** (§5): the "2–3 days complete / 1–2 weeks reduced" hepatic-lipidosis durations are not on the cited pages. Needs a §V addendum.
14. **Schmitt-Thompson** was read from the 2019 *pediatric* after-hours protocol. The adult protocol was not accessed. Use it only as an architecture precedent.
15. **MedVet 2026** is a single specialty-hospital owner page and the most conservative source found. It is cited to show the *range* of owner guidance, not as evidence of risk.
16. **Ireifej 2026 teletriage** has no outcome follow-up. Its odds ratios describe clinician referral behaviour, not accuracy.
17. **The cat-side "how many vomiting presentations are serious" base rate is missing.** The only outcome-graded cohort (Holzmann) is dogs at an ER.

---

### §9 Sources (all fetched 2026-09-24)

**Triage**
- Ruys et al. 2012 JVECC: https://pubmed.ncbi.nlm.nih.gov/22702436/
- Groesser et al. 2025 JVECC (VetTriS): https://onlinelibrary.wiley.com/doi/10.1111/vec.70068
- Lightfoot et al. 2020 PLoS One: https://doi.org/10.1371/journal.pone.0238874
- Ireifej et al. 2026 Open Vet J: https://pmc.ncbi.nlm.nih.gov/articles/PMC13314175/
- Holzmann et al. 2023 Front Vet Sci: https://pmc.ncbi.nlm.nih.gov/articles/PMC9933778/
- Thomovsky & Ilie 2024 CVJ: https://pmc.ncbi.nlm.nih.gov/articles/PMC10880400/
- Clinician's Brief 2014: https://www.cliniciansbrief.com/article/art-telephone-triage
- Schmitt 2019: https://triagelogic.com/wp-content/uploads/2019/10/2019-Pediatric-After-Hours-Vomiting-Without-Diarrhea.pdf
- Semigran 2015 BMJ: https://doi.org/10.1136/bmj.h3480

**Owner-facing clinical guidance**
- Armstrong 2013: https://todaysveterinarypractice.com/gastroenterology/gi-intervention-approach-to-diagnosis-therapy-of-the-vomiting-patient/
- Merck owner table: https://www.merckvetmanual.com/multimedia/table/when-to-see-a-veterinarian
- Merck cat vomiting: https://www.merckvetmanual.com/cat-owners/digestive-disorders-of-cats/vomiting-in-cats
- Cornell vomiting: https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/vomiting
- Cornell anorexia: https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/anorexia
- Cornell FLUTD: https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/feline-lower-urinary-tract-disease
- Cornell IBD: https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/inflammatory-bowel-disease
- TAMU (Teller 2021): https://vetmed.tamu.edu/news/pet-talk/when-to-be-concerned-about-feline-vomiting
- MedVet 2026: https://www.medvet.com/vomiting-in-dogs-and-cats/
- PetMD 2024: https://www.petmd.com/cat/symptoms/why-my-cat-vomiting-blood
- ACVS GDV: https://www.acvs.org/small-animal/gastric-dilatation-volvulus/
- ACVS GI foreign bodies: https://www.acvs.org/small-animal/gastrointestinal-foreign-bodies/
- St Denis & O'Brien, OVMA 2017: https://www.canadianveterinarians.net/media/dojiquvt/hairballs-are-not-normal.pdf
- Lap of Love IBD: https://www.lapoflove.com/resource-center/common-diseases-in-cats/ibd
- CAPC ascarid guideline: https://capcvet.org/guidelines/ascarid/

**Appearance**
- Bottero 2022 JFMS: https://doi.org/10.1177/1098612x221109802
- Fitzgerald 2017 JSAP: https://doi.org/10.1111/jsap.12631
- Liptak 2002 JFMS: https://doi.org/10.1053/jfms.2001.0148
- Schneider 2020 EJGH: https://doi.org/10.1097/meg.0000000000001701
- Blanco Nodal 2024: https://pubmed.ncbi.nlm.nih.gov/37806346/
- Bou-Abdallah 2012 JEM: https://doi.org/10.1016/j.jemermed.2009.05.008
- Upadhyay 2026 JCEH: https://doi.org/10.1016/j.jceh.2026.103607
- Hart 2021 Animals: https://doi.org/10.3390/ani11071853
- Washabau WSAVA 2005: https://www.vin.com/apputil/content/defaultadv1.aspx?pId=11196&catId=30751&id=3854163
- Vet Clin 2020 gastric motility: https://www.vetsmall.theclinics.com/article/S0195-5616(20)30100-5/abstract

**Base rates**
- Dowgray 2022 (CPAWS): https://doi.org/10.3389/fvets.2022.859041
- O'Neill 2023 JFMS (VetCompass cats): https://pmc.ncbi.nlm.nih.gov/articles/PMC10812063/
- Pugh 2017 Prev Vet Med (Dogslife): https://pmc.ncbi.nlm.nih.gov/articles/PMC5424887/
- Jergens 2010 JVIM (FCEAI): https://academic.oup.com/jvim/article/24/5/1027/8447312

**Chronic**
- Marsilio et al. 2023, ACVIM consensus: https://pmc.ncbi.nlm.nih.gov/articles/PMC10229359/

**Hepatic lipidosis**
- Biourge 1994 AJVR: https://doi.org/10.2460/ajvr.1994.55.09.1291
- Biourge 1993 JVIM: https://doi.org/10.1111/j.1939-1676.1993.tb03186.x
- Webb 2018 JFMS: https://doi.org/10.1177/1098612x18758591
- Kuzi 2017 Vet Rec: https://doi.org/10.1136/vr.104252
- Wallace 2024 JVIM: https://doi.org/10.1111/jvim.17200
- ISFM 2022 (Taylor et al.): https://pmc.ncbi.nlm.nih.gov/articles/PMC11107985/
- Merck professional hepatic lipidosis: https://www.merckvetmanual.com/digestive-system/hepatic-diseases-of-small-animals/feline-hepatic-lipidosis
- Cornell hepatic lipidosis: https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/hepatic-lipidosis

---

## Lane F — AI triage calibration, alarm fatigue, and per-incident escalation design

**Prepared:** 2026-09-24 · research agent · for the Culprit per-incident vomit/stool photo read
**Question behind the lane:** the per-incident read "raised more red flags than it's worth." What does the evidence say about why single-threshold escalation over-fires, what it costs, and how to build a calibrated escalation system that still never reassures on absence?

**How to read the grades**

| Grade | Meaning |
|---|---|
| A | Systematic review / meta-analysis, or a large preregistered RCT |
| B | Large prospective or retrospective cohort, or a controlled experiment with a reasonable n |
| C | Small, single-site, lab-task, vignette-only, or preprint |
| D | Vendor claim, marketing page, book or expert opinion |

**Verification tag.** [P] = I read the primary abstract or full text this session (PMC, Europe PMC, arXiv or the publisher). [S] = a secondary source only (a search-engine summary of the abstract, a press release, or a vendor/news page). Treat [S] numbers as needing a re-read before anyone quotes them in a spec.

**The product in one line (so the bottom lines make sense):** Claude Sonnet vision pulls structured fields from one photo. A deterministic floor then maps *any* visible blood or foreign material, or any contextual flag (repeated vomiting, cat not eating, lethargy), to one binary output, "worth a call to your vet." Nothing sets severity tiers, dedups across photos or episodes, or captures outcomes. Owners can edit the fields.

---

### Lane 1 — Over-triage in symptom checkers and LLM triage

#### Key findings

| Study | What was measured | Numbers | Grade | Link |
|---|---|---|---|---|
| **Semigran et al., BMJ 2015** — 23 symptom checkers, 45 standardized vignettes | Appropriate triage by urgency | Overall **57%**; emergent **80%**; non-emergent **55%**; self-care **33%**. "In two thirds of standardized patient evaluations where medical attention was not necessary, we found symptom checkers encouraged care." The checkers were "generally risk averse." | B/C (vignette audit) [P] | https://pmc.ncbi.nlm.nih.gov/articles/PMC4496786/ |
| **Schmieding et al., JMIR 2022** — 5-year follow-up, 22 apps, same 45 vignettes | Change since 2015 | Median accuracy **55.8% (2020) vs 59.1% (2015)**, with no improvement. By level in 2020: emergency 57.4%, non-emergency 71.7%, self-care 45.5%. The over:under-triage odds fell from **2.82:1 to 1.11:1**: the apps became less risk-averse but missed more emergencies. **No app beat laypersons on both decisions.** | B/C [P] | https://pmc.ncbi.nlm.nih.gov/articles/PMC9131144/ |
| **Wallace et al., npj Digit Med 2022** — systematic review, 10 studies | Pooled accuracy | Triage accuracy **49–90%**; primary diagnostic accuracy **19–38%**. The authors note that over-triage "manifests in inappropriate health resource utilisation." | A− (SR of low-quality primaries) [P] | https://pmc.ncbi.nlm.nih.gov/articles/PMC9385087/ |
| **Kopka, He & Feufel, Commun Med 2026** — 22 ChatGPT versions × 45 vignettes × 10 runs (9,900 assessments) | LLM care-seeking advice | Best model **74%** (o1-mini). "**All models overtriage** and face problems identifying self-care cases." There has been little gain since GPT-4. From the authors' institutional press release: none of the 13 self-care cases was answered correctly by every model in every run, **~70% of errors were in self-care cases**, and GPT-5 was correct 58% of the time and inconsistent across runs 42% of the time. Quote: "if the recommendation is almost always the same, it no longer offers any real guidance." | B/C [S] | https://www.nature.com/articles/s43856-026-01466-0 · https://www.tu.berlin/en/news/detail/zu-vorsichtig-fuer-die-versorgung-schwaechen-von-chatgpt-bei-gesundheitsfragen |
| **Xu, Zhao & Huang, J Med Syst 2025** — 8 LLMs (GPT-4, o1, DeepSeek V3/R1, Gemini 2.0, Copilot, Grok-2, Llama-3.1) on short vignettes | Triage, and the effect of structured prompting | Triage **68.8–89.6%** unprompted, mean 86.2% with structured prompting. **Over-triage rose from 36–75% to 50–90% with prompting**, and "safety of advice" rose from 89% to 94.5%. Prompting "shifted models toward safety" at the cost of more unnecessary urgent referrals. (The over-triage denominator appears to be triage errors, not all cases. Check the paper before quoting.) | C [P] | https://pmc.ncbi.nlm.nih.gov/articles/PMC12535515/ |
| **Masanneck et al., JMIR 2024** — 124 ED vignettes, Manchester Triage System | LLMs vs untrained doctors | **LLMs over-triaged and untrained doctors under-triaged.** Gemini 1.5 rated ~64% of cases "Orange" against 19.4% in the expert consensus. LLM support did not improve the doctors. | C [S] | https://www.jmir.org/2024/1/e53297 |
| **Bean et al., Nat Med 2026** — preregistered RCT, 1,298 UK adults, GPT-4o / Llama 3 / Command R+ | LLM alone vs a human using the LLM | Models alone named a relevant condition in **94.9%** of cases and picked the correct disposition in **56.3%**. Humans using an LLM named a relevant condition in **≤34.5%**, below the control group's 47.0%, and chose dispositions no better than control. | A−/B [S] | https://www.nature.com/articles/s41591-025-04074-y |
| **Wong et al., Veterinary Record** (doi 10.1002/vetr.6126) — retrospective canine emergency cases; ChatGPT-3.5/4.0 vs 3 vets and 2 nurses | **Veterinary LLM triage** | ChatGPT correctly prioritized **80–90% of critical cases** but put **~60% of non-urgent cases in "see immediately"**. Nurses caught 87% of critical cases, and nurses plus ChatGPT as a severe-case flag reached **95%**. The title states the finding: AI "recognise[s] emergencies but [is] more likely than veterinary staff to flag non-urgent cases as urgent." | C [S] (publisher returned 403; thesis abstract read) | https://bvajournals.onlinelibrary.wiley.com/doi/abs/10.1002/vetr.6126 · https://ses.library.usyd.edu.au/handle/2123/32901 |
| **Pet symptom checkers** | Validation | Petriage claims "97%-plus" accuracy for urgency, but that comes from a patent press release, not a peer-reviewed validation. Löwe & Löwe (Vet Res Commun 2026) validated a vet symptom checker on *synthetic* dialogs only. I found **no peer-reviewed real-world triage validation of any consumer pet symptom checker.** | D / C | https://petriage.com/2021/02/23/petriage-awarded-first-ever-patent-for-online-ai-driven-pet-symptom-checker-a-97-plus-accurate-tool-for-assessing-urgency-of-seeking-care/ · https://pmc.ncbi.nlm.nih.gov/articles/PMC13201370/ |

**What over-triage costs downstream when consumer AI is deployed (the closest analogue to Culprit):**

| Study | Numbers | Grade | Link |
|---|---|---|---|
| **Smak Gregoor et al., npj Digit Med 2023** — SkinVision offered free by a Dutch insurer; 18,960 users matched to 56,880 controls | Claims for (pre)malignant lesions 6.0% vs 4.6% (OR 1.3), but claims for **benign lesions 5.9% vs 1.7% (OR 3.7)**. €2,567 per additional (pre)malignancy detected. | B [P] | https://pmc.ncbi.nlm.nih.gov/articles/PMC10199884/ |
| **SPOT RCT (Smak Gregoor et al., medRxiv 2025)** — 19,009 randomized 3:2 | Skin-cancer detection trend was not significant (2.7% vs 2.3%). **Benign claims 3.9% vs 2.6% (p<0.001)**, plus more surgery and higher cost (€63 vs €47 per participant). | A− (RCT, preprint) [P] | https://doi.org/10.1101/2025.11.18.25340297 |
| **Simpson et al., BMJ Open 2022** — introduction of NHS 111 online | Per 1,000 online contacts: advice to call 999 IRR **1.067**, advice to go to ED **1.050**, primary-care advice **1.051**. Digital triage *added* urgent-care demand. | B [P] | https://pmc.ncbi.nlm.nih.gov/articles/PMC9316045/ |
| **Winn et al., JAMA Netw Open 2019** — Buoy, 158,083 encounters | After the checker, **32% lowered their intended level of care**, 65% were unchanged and 4% raised it. Checkers also *de-escalate*. For Culprit this is the forbidden direction, and it shows how a "low" output gets read as reassurance. | B [P] | https://pmc.ncbi.nlm.nih.gov/articles/PMC6991310/ |

#### Bottom line for Culprit
Being risk-averse is the **default failure mode** of rule-based checkers (Semigran: care advised in two-thirds of self-care cases) and of LLMs (Kopka: *every* ChatGPT version over-triages; Masanneck; Xu). Prompting a model "for safety" buys a few points of sensitivity for a lot of over-triage. The only veterinary LLM triage study found the same thing: about 60% of non-urgent dogs were flagged for immediate care. When consumer AI escalation is deployed, it **mostly adds care for benign findings** (SkinVision OR 3.7).

Culprit's single "worth a call" output, fired by *any* presence of blood or foreign material or *any* contextual flag, has the same structure as a maximally risk-averse checker, so the PM's observation is what the literature predicts. The architectural choice is sound: the model extracts fields and deterministic code decides, so the LLM is never asked for urgency. The failure is in the floor's **threshold and granularity**.

---

### Lane 2 — Alarm fatigue, cry-wolf, and alert PPV

#### Clinical alarm fatigue

| Source | Numbers | Grade | Link |
|---|---|---|---|
| **Sendelbach & Funk, AACN Adv Crit Care 2013** | **72–99% of clinical alarms are false**, which leads to desensitization and missed alarms. Deaths have been attributed to alarm fatigue. | B (review) [P] | https://pubmed.ncbi.nlm.nih.gov/24153215/ |
| **Joint Commission Sentinel Event Alert 50 (2013)** | 98 alarm-related sentinel events (2009–2012): **80 deaths**, 13 cases of permanent loss of function. | B (registry; under-reported) [S] | https://www.jointcommission.org/en-us/knowledge-library/newsletters/sentinel-event-alert/issue-50 |
| **Ancker et al., BMC Med Inform Decis Mak 2017** — 112 primary-care clinicians, 2010–2013 | **A quarter of drug alerts and a third of reminders were repeats for the same patient in the same year.** Acceptance **fell 30% for each additional reminder per encounter** and **10% for each 5-point rise in the share of repeats**. There was *no* sign of time-based desensitization to a new alert. The authors conclude "reducing within-patient repeats may be a promising target." | B [P] | https://pmc.ncbi.nlm.nih.gov/articles/PMC5387195/ |

#### Human-factors: cry-wolf, compliance and the reliability threshold

| Source | Finding | Grade | Link |
|---|---|---|---|
| **Breznitz, *Cry Wolf: The Psychology of False Alarms* (1984)** | The foundational account: each false alarm lowers response to the next one. | D (book / theory) [S] | — |
| **Bliss, Gilson & Deaton, Ergonomics 1995** — 138 participants; alarms 25%, 50% or 75% true | **About 90% of participants "probability-matched"**, responding at roughly the rate the alarm was true. About 10% chose all-or-none. | C (lab), widely replicated [P] | https://pubmed.ncbi.nlm.nih.gov/7498189/ |
| **Dixon & Wickens, Human Factors 2006** | False alarms reduce **compliance** (acting when the alarm fires); misses reduce **reliance** (trusting silence). | C [S] | https://journals.sagepub.com/doi/10.1518/001872006778606822 |
| **Dixon, Wickens & McCarley, Human Factors 2007** — n=32 | "**False alarm-prone automation hurt overall performance more than miss-prone automation**." False alarms reduced *both* compliance and reliance. | C [P] | https://pubmed.ncbi.nlm.nih.gov/17702209/ |
| **Wickens & Dixon, Theor Issues Ergon Sci 2007** — synthesis of 20 studies (35 data points) | Benefit rises linearly with reliability. **Below ~0.70, imperfect diagnostic automation was worse than no automation.** *The claim checks out*, with caveats: it comes from lab dual-task paradigms, "reliability" means overall accuracy rather than PPV, and the crossover depends on the task. Treat it as a heuristic floor, not a law. | B− [S] | https://www.tandfonline.com/doi/abs/10.1080/14639220500370105 |
| **Rice, J Gen Psychol 2009** | False alarms and misses act through separate trust processes, which supports a multiple-process theory of trust. | C [S] | https://www.tandfonline.com/doi/abs/10.3200/GENP.136.3.303-322 |

#### Consumer health alerts: PPV and what happens afterwards

| Source | Numbers | Grade | Link |
|---|---|---|---|
| **Apple Heart Study (Perez et al., NEJM 2019)** — 419,297 participants | Only **0.52% were notified** over a median of 117 days. A notification required **5 of 6 irregular tachograms within 48 h**, a confirmation rule before any alert. On later ECG patches (applied ~13 days after notification), AF was found in **34%**. PPV for AF during a concurrent notification was **0.84**. Of 1,376 notified participants who returned the 90-day survey, **57%** had contacted a provider. | B [P] (5-of-6 rule [S]) | https://pmc.ncbi.nlm.nih.gov/articles/PMC8112605/ |
| **Fitbit Heart Study (Lubitz et al., Circulation 2022)** — 455,699 | An alert required **11 consecutive irregular 5-minute tachograms**. **1%** of participants received one. AF was on the patch in **32.2%**. PPV for concurrent AF was **98.2%**. The 2025 follow-up found 57% had another detection within 3 months, and diagnostic yield rose with monitoring length (1 week 32%, 4 weeks 61%). | B [P] | https://pmc.ncbi.nlm.nih.gov/articles/PMC9640290/ · https://pmc.ncbi.nlm.nih.gov/articles/PMC12263307/ |
| **Wyatt et al., JAMIA 2020 (Mayo)** — 264 patients seen for an Apple Watch pulse alert | A clinically actionable cardiovascular diagnosis in only **11.4%**, after heavy downstream testing. | C [S] | https://academic.oup.com/jamia/article/27/9/1359/5911974 |
| **Tran et al., 2023 (Pulsewatch RCT secondary analysis)** | False AF alerts were linked to a **dose-dependent decline** in self-rated physical health and in confidence managing symptoms. | C [P] | https://pmc.ncbi.nlm.nih.gov/articles/PMC10358285/ |
| **Carson et al., Front Vet Sci 2023 — Whistle FIT pruritus alerts** — 7,191 then 6,684 dogs; 113,530 then 93,217 alerts; Banfield EHR linkage | Share of alerts followed by a vet visit within 4 weeks: **4.74%** before owners could see alerts, **7.49%** after. So **~92.5% of alerts were not followed by a visit.** *The "~92% no vet visit" claim checks out.* Alerts ran at **~14–17 per dog per 10 months**. The "severe" categories converted better (8.8% → 16%). Medication was prescribed after 53.3% of alert-associated visits. **Funded by Zoetis and Kinship; authors from Mars and Zoetis.** | B− (retrospective, industry-funded) [P] | https://pmc.ncbi.nlm.nih.gov/articles/PMC10445133/ |
| **Consumer notification fatigue (mHealth)** | Micro-randomized trials (e.g. Bidargaddi et al., JMIR mHealth 2018) find small proximal engagement effects from push notifications that vary with time in the program. I did not extract effect sizes in this pass. | C [S] | https://mhealth.jmir.org/2018/11/e10123/ |

#### What PPV or frequency keeps users compliant?
**No consumer-health study sets a threshold.** The best proxies:

1. **Probability matching.** Compliance tends toward the *perceived* PPV (Bliss 1995). An alert that is right 20% of the time will eventually be acted on about 20% of the time, *including the time it is right*.
2. **The ~0.70 reliability crossover** from lab tasks (Wickens & Dixon 2007).
3. **False-alarm-prone systems are worse than miss-prone ones** for overall performance (Dixon 2007). Note the tension with Culprit's hard rule, covered in Lane 3 and the principles.
4. **The engineered pattern from the two big wearable programs:** alerts are rare (0.5–1% of users over roughly 4 months), each alert must survive repeated confirmation, and PPV is ≥0.84 at the moment of notification.
5. **Repeats are the main driver of override** (Ancker: −30% acceptance per extra reminder).

#### Bottom line for Culprit
A per-photo alert that fires on any presence of a flag, repeats for every photo of one episode, and fires on common contextual flags will, if its PPV for "a vet would have wanted that call" is low, **train owners to ignore it**. That erodes the one alert that matters. It is Whistle's dynamic (≈1.5 alerts per dog per month, ~7% conversion) plus Ancker's repeat effect, and it matches the PM's complaint. The wearable programs protected rare true positives with **confirmation rules and rarity**, not by lowering thresholds.

---

### Lane 3 — Triage granularity: tiers vs binary, and safety-netting

#### Evidence that graded output beats binary

| Source | Numbers | Grade | Link |
|---|---|---|---|
| **Travers et al., J Emerg Nurs 2002** — the same ED switched from a 3-level to a 5-level system | Weighted kappa **0.53 → 0.68**; sensitivity 58% → 68%; specificity 83% → 91%; **under-triage 28% → 12%**. Less-experienced nurses under-triaged more on the 3-level system. | C (single site, before/after) [S] | https://pubmed.ncbi.nlm.nih.gov/12386619/ |
| **Zachariasse et al., BMJ Open 2019** — SR, 66 studies, 33 triage systems | Established 5-level systems show "reasonable validity," but performance "varies considerably." MTS under-triaged fewer adults than ESI (**8.3% vs 13.5%**) at the cost of more over-triage. The *reference standard and setting* drive the results. | A− [P] | https://pmc.ncbi.nlm.nih.gov/articles/PMC6549628/ |
| **Likelihood alarm systems (LAS)** — Sorkin et al. 1988; Wiczorek & Manzey 2014; Zirk, Wiczorek & Manzey, Human Factors 2020 | A LAS grades its alert by how likely the event is. Graded alerts improved operators' decisions compared with a *liberal* binary alarm, and more stages meant fewer wrong decisions (2014). In 2020, both a **4-stage LAS and a *conservative* binary alarm improved joint human-machine sensitivity over a liberal binary alarm**. The conservative binary alarm also produced the *fewest joint misses*, because people actually respond to it. Authors: "when refraining from designing systems which are miss prone, 4-LASs represent a suitable compromise." | C (lab) [P for 2020; S for 2014] | https://pubmed.ncbi.nlm.nih.gov/31216189/ · https://doi.org/10.1177/0018720814528534 |

The LAS result is the most direct evidence that a **liberal binary alarm is the worst of the designs studied.** Culprit's current floor is a liberal binary alarm. The hard rule ("may escalate on presence, never reassure on absence") rules out the conservative binary alarm, which trades away misses. That leaves the 4-stage graded design as the one the evidence supports.

#### How mature triage systems speak

| Source | What it shows | Grade | Link |
|---|---|---|---|
| **Schmitt-Thompson benchmark, 2023** — 1,647,846 calls, 11 call centres; 37 dispositions consolidated to 6 | Adults: 911 **4.3%**, ED now **22.6%**, urgent within 4 h **10.7%**, office visit within 24 h to 2 weeks **22.8%**, **home care 20.5%**, other 17.2%. Children: home care **31.7%**. A mature protocol system sends a fifth to a third of contacts to *home care with advice*, not to the clinician. (The protocols pair each disposition with care advice and "call back if" criteria. That structure is widely documented, but I did not re-verify it this pass.) | B (descriptive; vendor) [P] | https://www.stcc-triage.com/benchmark-report-disposition-rates |
| **NHS Pathways / 111** | Each disposition names a *service* and a *timeframe* (e.g. 1-h, 4-h and 12-h dispositions). | [S] | https://www.whatdotheyknow.com/request/cfrs_5/response/701116/attach/3/Clarification%20of%20Terms%20used%20in%20NHS%20Pathways%20Dispositions.pdf |
| **Huibers et al., Scand J Prim Health Care 2011** — SR of out-of-hours telephone triage | Triage was safe in **97%** of all contacts and 89% of high-urgency ones, but only **46%** of high-risk *simulated* patients. The rare dangerous presentation is the hard part. | A−/B [P] | https://pmc.ncbi.nlm.nih.gov/articles/PMC3308461/ |
| **Pet-market tier vocabularies** | Petriage uses non-threatening / worrisome / seek medical advice / urgent / emergency. Joii uses a traffic light across 160 symptoms and ~6,000 outcomes. | D [S] | see Lane 6 |

#### Safety-netting: the non-reassuring low tier

| Source | Numbers / finding | Grade | Link |
|---|---|---|---|
| **Jones et al., BJGP 2019** — literature review, 47 studies | Safety-netting is "a consultation technique to communicate uncertainty, provide patient information on red-flag symptoms, and plan for ongoing care." | B [S] | https://bjgp.org/content/69/678/e70.abstract |
| **Edwards et al., BJGP 2019** — 318 video-recorded UK GP consultations | Safety-netting appeared in **64.5%** of consultations, but **52.8% of episodes were *generic*** ("come back if it gets worse"). Advice given at closing was mostly generic (90 of 123). | B/C [S] | https://bjgp.org/content/69/689/e878 |
| **Friedemann Smith et al., BMJ Qual Saf 2022** — realist review, 95 documents, 15 recommendations | Good safety-netting is **tailored and practical** (self-care plus *when and how* to re-consult), checks the patient understood and agreed, **explains why**, and is documented. | B [P] | https://pmc.ncbi.nlm.nih.gov/articles/PMC9234415/ |
| **Francis et al., BMJ 2009** — cluster RCT, 61 practices, 558 children | An interactive booklet with written "when to worry / when to come back" advice: **antibiotics 19.5% vs 40.8%**; re-consultation 12.9% vs 16.2% (not significant); intention to consult in future **OR 0.34**; satisfaction *unchanged*. | A− [P] | https://pmc.ncbi.nlm.nih.gov/articles/PMC2718088/ |

#### Bottom line for Culprit
Graded output beats a binary alarm on discrimination and reliability (Travers), and on how people respond (LAS). Mature telephone triage has a *time-bound* rung for each level of acuity plus a home-care rung that comes **with a specific watch-for list**. That rung is the **safety net**, and it is how a system says "not now" without saying "all clear."

The safety-netting literature supplies the copy rules: specific over generic, the *timeframe* and the *action*, and the *why*. The Buoy result (32% lowered intended care) warns that any "lower" output will be read as reassurance unless the copy blocks that reading. The lowest rung must name the limits of what the photo can show and list the red flags that would change the answer. It must never say normal, healthy or fine.

---

### Lane 4 — LLM/vision reliability on clinical photos, calibration and abstention

#### Multimodal models "read" more than they "see"

| Source | Numbers | Grade | Link |
|---|---|---|---|
| **Buckley et al., Nat Commun 2026** — 8 models, 1,090 multimodal cases | "Image predictions are largely driven by text." **o3 accuracy fell from 84% to 28%** when a misleading clinical vignette was added to a case it had got right from the image alone. Adding images to highly informative text reduced or did not improve GPT-4V accuracy. | B [P] | https://pmc.ncbi.nlm.nih.gov/articles/PMC13408344/ |
| GPT-4V dermatology (medRxiv 2024) | Primary diagnosis **54%** from the image alone, **89%** from image plus scenario, with a noted "bias towards textual data." | C [S] | https://www.medrxiv.org/content/10.1101/2024.01.24.24301743v2.full |
| ChatGPT-4o across Fitzpatrick skin types (2025), 324 biopsy-confirmed images | Lower melanoma accuracy on darker skin types. Appearance-dependent performance does not transfer across grounds. | C [S] | https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12323556/ |
| **Apichonbancha et al., Sci Rep 2026** — 450 wound photos; GPT-4o, Claude 3.5 Sonnet, Gemini | GPT-4o diagnosis **51.3%**. **Claude 3.5 Sonnet was best at urgency determination (70.9%)** and wound sizing (72%). Gemini gave no response in 67–68% of several domains. | B/C [P] | https://pmc.ncbi.nlm.nih.gov/articles/PMC13503788/ |

**Implication:** if the vision prompt receives the contextual flags ("cat not eating", "vomited 3×"), the model will be pulled toward finding blood or foreign material that fits the story. Keep the photo read **blind to context**, and combine context in the deterministic layer.

#### Stool / feces image AI

| Source | Numbers | Grade | Link |
|---|---|---|---|
| **Lee et al., Am J Gastroenterol 2025 (DLSUC)** — prospective, 6 centres; trained on 2,161 photos from 306 UC patients, tested on 1,047 photos from 126 | Predicting endoscopic activity: AUC **0.801**, not different from fecal calprotectin (0.837). Accuracy 0.746, sensitivity 0.662, specificity 0.877. A purpose-trained model on smartphone stool photos can carry clinical signal. | B [P] | https://pmc.ncbi.nlm.nih.gov/articles/PMC11676591/ |
| Smartphone AI for Bristol Stool Scale (Am J Gastroenterol 2022) | Validation n=14: ICC 0.78–0.85 against 2 gastroenterologists. AI beat self-report. | C [S] | https://journals.lww.com/ajg/abstract/10.14309/ajg.0000000000001723 |
| Ludwig et al., JPGN 2021 (diaper stool) | Algorithm agreed with raters 77% of the time; parents managed 65% in the scale's validation study. | C [S] | https://onlinelibrary.wiley.com/doi/10.1097/MPG.0000000000003007 |
| **Mars Poopscan (vendor)** | 14,000+ images labelled by a 10-expert panel with voting. EfficientNetB4. "**90% accuracy-in-range**" (within ±0.25 on a 1–5 scale in 0.25 steps), AUC 0.9495. **It scores consistency only, with no blood or colour.** No peer-reviewed paper. | D [P] | https://www.mars.com/poopscan-science |
| MC-SCMNet dog feces classifier (Animals 2023) | **88.27%** on 1,623 photos, using the Purina and Waltham scales. | C [S] | https://www.mdpi.com/2076-2615/13/10/1660 |

#### Colour under phone cameras (the blood, melena and coffee-ground problem)

| Source | Numbers | Grade | Link |
|---|---|---|---|
| **PoopMD (Franciscovich et al., PLOS One 2015)** — acholic infant stool | Sensitivity **7/7**, specificity **24/27**. The 3 misses were labelled *indeterminate*, after which the user is asked to **retake the photo with quality tips**. Kappa: across users 0.68, across phones 0.88, across lighting 0.81. | C [P] | https://pmc.ncbi.nlm.nih.gov/articles/PMC4519295/ |
| BiliCam (neonatal jaundice) | Uses a **paper colour-calibration card** in frame to correct for lighting and white balance. | C [S] | https://seominjoon.github.io/assets/papers/1409.bilicam.pdf |
| **Blood, melena and coffee-ground material in consumer photos** | **I found no study, human or veterinary, that validates detecting fresh blood, melena or coffee-ground material from a smartphone photo by AI *or* by clinicians.** Mars scoped blood and colour out of Poopscan. Known clinical mimics (red dyes in food or treats, beet, iron or bismuth "pseudo-melena", bile and grass) are background knowledge, not verified this pass. | — | research debt |

#### Calibration, self-consistency and abstention

| Source | Numbers | Grade | Link |
|---|---|---|---|
| **Xiong et al., ICLR 2024** | Verbalized confidence is overconfident, "potentially imitating human patterns." Sampling for consistency helps. | B [S] | https://proceedings.iclr.cc/paper_files/paper/2024/file/6733cf15e10e2cd1d59af033c3bb8507-Paper-Conference.pdf |
| **Savage et al., JAMIA 2025** — GPT-3.5/4, Llama 2/3, open-ended clinical scenarios | **Verbalized confidence "consistently overestimate[s]" model confidence.** Sample consistency discriminates best (AUC **0.68–0.79**). | B [P] | https://pmc.ncbi.nlm.nih.gov/articles/PMC11648734/ |
| **Boie et al., J Med Syst 2026** — MedMCQA, 12,000 responses | ECE: **Claude Sonnet 4.5 best (0.06)**, GPT-4o worst (0.127). A **3× ECE spread across specialties**, which pooled metrics hide. Text multiple-choice only, not images. | C [P] | https://pubmed.ncbi.nlm.nih.gov/42360536/ |
| **Senoglu et al., arXiv 2026** — medical VQA, small open multimodal models | Multimodal models are "overconfident … regardless of actual correctness." A training fix cut calibration error by ≥60%. | C (preprint) [P] | https://arxiv.org/abs/2606.27023 |
| **Wienholt et al., Eur Radiol 2026** — GPT-4o / GPT-4.1, 706 image-question pairs; **15 samples at temperature 1.0** | Discarding high-entropy questions (discrete semantic entropy >0.3) raised accuracy **from 51.7% to 76.3%** for GPT-4o (334 of 706 kept) and from 54.8% to 63.8% for GPT-4.1 (499 kept). Multi-sample disagreement is a usable **abstention signal** for black-box vision models. | B/C [P] | https://pmc.ncbi.nlm.nih.gov/articles/PMC13282299/ |
| **Farquhar et al., Nature 2024** | Semantic entropy detects confabulation at the level of meaning. It needs no task-specific data. | B [P] | https://pmc.ncbi.nlm.nih.gov/articles/PMC11186750/ |
| **Machcha et al., arXiv 2026 (MedAbstain)** | "**Providing explicit abstention options consistently increases** model uncertainty and safer abstention, far more than input perturbations, while scaling model size or advanced prompting brings little improvement." | C (preprint) [P] | https://arxiv.org/abs/2601.12471 |

#### Bottom line for Culprit
- There is **no validation evidence** that any model, or any person, can reliably detect blood, melena or coffee-ground material from an owner's phone photo. The field most likely to trip the floor is the one with the least evidence behind it.
- Purpose-trained stool models work on *consistency* (Poopscan, DLSUC, BSFS apps). Colour judgments need calibration aids (BiliCam) or an **indeterminate → retake** path (PoopMD).
- Self-reported confidence cannot be trusted as a gate. **Multi-sample agreement can** (Savage; Wienholt). The explicit `unsure` option is the right primitive (MedAbstain). What matters is where `unsure` routes: into a clearly labelled "we couldn't tell" rung with a safety net, never into silence and never automatically into "call your vet."
- **Don't feed the context flags into the vision prompt** (Buckley).

---

### Lane 5 — Learning from user corrections and outcomes

| Source | What it shows | Grade | Link |
|---|---|---|---|
| **Chambers et al., Animals 2021 (Kinship Pet Insight Project)** | Training data: **>5,000 videos of >2,500 dogs**; ran on **>11 million device-days**. In-app surveys covering **10,550 dogs returned 163,110 event confirmations** ("was your dog eating at this time?"). User-reported true-positive rate: eating **95.3%**, drinking **94.9%**. Lightweight in-app confirmation prompts produce production-scale validation labels. | B [P] | https://pmc.ncbi.nlm.nih.gov/articles/PMC8228965/ |
| **Whistle FIT pruritus study** | Outcome capture by **linking to the vet EHR** (1,042 Banfield clinics, all under Mars). It measured whether an alert led to a visit and whether a drug was prescribed. | B− [P] | https://pmc.ncbi.nlm.nih.gov/articles/PMC10445133/ |
| **Oura Symptom Radar (vendor)** | Trained on **~3 million member illness tags** used as weak labels. Claims detection "up to two days before" a tag. Output reads "minor / major signs of strain" (plus "no signs"), which describes physiology, not a diagnosis. | D [P] | https://ouraring.com/blog/inside-the-ring-symptom-radar/ |
| **Apple Heart Study** | Outcome capture by a **90-day survey**: 57% of respondents had contacted a provider. | B [P] | https://pmc.ncbi.nlm.nih.gov/articles/PMC8112605/ |
| **SkinVision studies** | Outcome capture by **insurer claims linkage**. That is what exposed the benign-care cost. | B / A− [P] | see Lane 1 |
| **Joii (vendor)** | Claims "400,000 video consultations and 100,000 labelled images" behind its triage. | D [S] | https://cloud.google.com/customers/vet-ai |
| **Dratsch et al., Radiology 2023 — automation bias** — 27 radiologists, 50 mammograms, incorrect AI BI-RADS suggestions on 12 | Accuracy when the AI was **wrong** versus right: inexperienced **79.7% → 19.8%**, moderately experienced 81.3% → 24.8%, very experienced 82.3% → 45.5%. Pre-filled AI answers **anchor** human labels, even an expert's. | B [P] | https://pubmed.ncbi.nlm.nih.gov/37129490/ |

#### Bottom line for Culprit
- **Owner edits to pre-filled fields are weak, anchored labels.** Dratsch shows people accept wrong AI suggestions, so unedited fields are *not* confirmations. Edits are also missing-not-at-random: owners edit mainly when they strongly disagree, and possibly in the de-escalating direction. That direction is unmeasured and is research debt.
- The **higher-value label is the outcome**: did the owner call, and what did the vet say or do. PIP shows owners answer short confirmation prompts at scale.
- The **moat** is a vet-confirmed label set linking photo, extracted fields, tier shown and outcome, especially where owners use Culprit's vet report. That is the Whistle-to-Banfield linkage pattern without owning the clinics.
- Unlike every competitor surveyed in Lane 6, Culprit could **measure its own per-tier PPV**.

---

### Lane 6 — Competitive scan: photo-based vomit/stool analysis in pet apps (2025–2026)

| Product | Claims | Escalation | Published validation | Source |
|---|---|---|---|---|
| **Mars Poopscan** (IAMS PoopScan tool) | Dog stool **consistency only**, 1–5 in 0.25 steps; 14k images; 10-expert panel | "Share with your vet." No automated escalation. The IAMS page offers free live chat with vet techs. | Vendor page only (90% accuracy-in-range, AUC 0.95) | https://www.mars.com/poopscan-science · https://www.iams.com/poopscan [P] |
| **Yipara** (dog/cat stool, **cat vomit**) | Blood (bright red vs dark tarry), worms, mucus, foreign objects, colour; vomit types (foam, bile, hairball, blood) | "Wait or vet?" framing, e.g. "vet visit within 24 hours" for black stool, and emergency flags (parvo, rat poison) | **None.** Model undisclosed. Heavy disclaimers. | https://www.yipara.com/dog-poop · https://www.yipara.com/cat-vomiting [P] |
| **Dog Poo AI** (iOS; solo developer) | Consistency, colour, coating; a "health score" | "a heads-up when it's worth seeing the vet" | None. $4.99/month. | https://apps.apple.com/us/app/dog-poo-ai/id6758951350 [P] |
| **PoopBuddy** (Android) | Stool photos; colour and shape signals; vet-ready reports | Unclear | None found | https://play.google.com/store/apps/details?id=com.poopbuddy.app [S] |
| **Ollie Health Check-ins** (the former DIG Labs technology page now 301-redirects here, observed 2026-09-24, which *suggests* an acquisition; not confirmed) | "Digestion Check-In" photo upload; "data from over 100,000 dogs"; in-house vet team | Not described | None | https://www.ollie.com/health-check-ins/ [P] |
| **Purina Petivity** (smart litterbox; not photo-based) | Alerts on weight and visit-pattern changes that "may indicate" disease | Alerts suggest a vet chat. Reviewers report false alerts (e.g. in kittens). | No false-positive data found | https://www.petivity.com/products/smart-litter-box-monitor [S] |
| **Whistle / Kinship** (collar) | Scratching and licking alerts | Push alerts | Carson 2023: **92.5% of alerts not followed by a visit** | Lane 2 |
| **Joii** (UK; symptom checker, not photo) | 160 symptoms, ~6,000 outcomes, traffic-light triage | Tiered, and routes to its own video vets | Vendor claims only | https://shop.joiipetcare.com/pages/pet-symptom-checker [S] |
| **Petriage** (symptom checker) | Five tiers, non-threatening → emergency | Tiered | "97%+" in a patent press release | Lane 1 |

#### Bottom line for Culprit
- **No competitor publishes validation for blood or colour detection** in pet vomit or stool photos. The only large-company product (Mars) deliberately **scoped to consistency**.
- The one vomit-photo competitor I found (Yipara) is unvalidated and hedged with disclaimers.
- Everyone who escalates uses **tiers or a "wait or vet" frame**, not a single binary flag.
- No one publishes outcomes or per-tier PPV. If Culprit measured and reported its own calibration, that would be a real differentiator, and it fits "the vet report is clinical-grade."
- *Re-verify at use:* this category changes monthly (the DIG Labs → Ollie redirect is an example).

---

### (a) Design principles for a calibrated, non-reassuring per-incident escalation system

Each principle is tied to evidence. Items marked **(judgement)** are design inferences the literature supports but does not test directly.

1. **Keep "what the photo shows" apart from "what to do."** The model extracts fields; a versioned deterministic policy assigns the tier. Never ask the LLM for urgency.
   *Evidence:* LLMs over-triage systematically, and more so when prompted for safety (Kopka 2026; Xu 2025; Masanneck 2024; Wong vet study).

2. **Blind the photo read to context.** Contextual flags (inappetence, repeat count, lethargy) join the result in the deterministic layer, not the vision prompt.
   *Evidence:* Buckley 2026: text drives image predictions, and o3 fell from 84% to 28% with a misleading vignette.

3. **Replace the binary with graded rungs (3–4), each naming an action *and* a timeframe.** A sketch for Dr. Chen to own clinically:
   - **Now:** call your vet or an emergency clinic now.
   - **Today:** call your vet today.
   - **Mention:** raise it at the next contact, or sooner if [specific list].
   - **Logged + safety net:** described under principle 4.

   The "Now" rung should be rare and gated on hard combinations, such as a presence finding *plus* a systemic flag.
   *Evidence:* Travers (under-triage 28% → 12% going from 3 to 5 levels); the LAS literature (graded alerts beat a liberal binary alarm; a 4-stage LAS is the recommended compromise when misses are unacceptable); Schmitt-Thompson and NHS dispositions all pair a service with a timeframe; pet competitors that escalate use tiers.

4. **The lowest rung is a safety net, not reassurance.** It states the limits of what a photo can show, then gives a *specific, time-bound* watch-for list and action: "call today if she vomits again tonight, won't eat by tomorrow morning, or you see red or black material." Never "normal," "healthy," "nothing to worry about" or "looks fine."
   *Evidence:* Jones 2019 and Friedemann Smith 2022 on what makes safety-netting work; Edwards 2019 (generic advice is common and weaker); Francis 2009 (written specific advice changed behaviour without hurting satisfaction); Buoy (any "lower" output gets read as permission to de-escalate, so the copy must block that reading). This satisfies the hard rule.

5. **Latch and dedup at the episode, not the photo.**
   - One escalation per pet per episode. Later photos of the same episode *attach* to it and don't re-alert.
   - A latch can only move **up** (new, higher-rung evidence re-alerts; same-rung evidence does not).
   - An open escalation stays visible until acknowledged or aged out.
   - Dedup never suppresses a higher rung.

   *Evidence:* Ancker 2017 (repeats were a quarter to a third of alerts; −30% acceptance per extra reminder); Apple's 5-of-6 and Fitbit's 11-consecutive confirmation rules (confirm, then alert once).

6. **Don't let one unconfirmed colour call alone fire the "Today" rung.** Gate colour-only presence findings (fresh_red / coffee_ground with nothing else) on **multi-sample agreement**, e.g. 3–5 reads with presence in most of them. When the reads disagree, go to **"We couldn't tell from this photo"**: offer a retake with lighting tips, then land on the Mention/safety-net rung with the specific colour red flags named.
   - Keep **foreign material** and **presence + systemic flag** combinations ungated, or gate them more lightly (**judgement**; Dr. Chen to rule).
   - *This is a real sensitivity/false-positive trade and needs a PM + Dr. Chen ruling.* The hard rule is kept because "couldn't tell" is disclosed, never rendered as "no blood."

   *Evidence:* no validation exists for blood detection in consumer photos; verbalized confidence is overconfident (Savage; Xiong; Senoglu); semantic-entropy filtering took GPT-4o from 51.7% to 76.3% on retained questions (Wienholt); PoopMD's indeterminate → retake; BiliCam's calibration card; Bliss/Dixon (every false alarm lowers compliance on the true one).

7. **Keep `unsure` and route it on purpose.** Explicit abstention options are the most effective abstention lever (MedAbstain). `unsure` must never map to `none`, and it should not map straight to the Today rung. It maps to "couldn't tell" plus a safety net (as in 6).

8. **Budget and measure every rung.** Keep an over-triage ledger per rung and species: fires per pet-month, share acknowledged, share where the owner called, and share where the vet agreed the call was warranted.
   - Set targets (**judgement**): the Today rung firing for a small minority of incidents, and a vet-agreed rate well above ~50%. The lab crossover (Wickens & Dixon ~0.70) and probability matching (Bliss) imply owners will follow an alert about as often as it has been right for them.
   - Re-tune thresholds from the ledger, never from intuition.

   *Evidence:* Bliss 1995; Wickens & Dixon 2007; Dixon 2007; the Apple/Fitbit engineered rarity (0.5–1% notified) and PPV (≥0.84); Whistle's ~1.5 alerts per dog per month with ~7% conversion as the counter-example.

9. **One-tap acknowledgement closes the loop.** Offer "I've called" / "I'll call" / "Not now," as a confirmation with no typing, in line with design Principle 2. It stops re-nudging (Principle 4, one nudge a day) and seeds outcome capture.
   *Evidence:* the alarm-management consensus (Joint Commission SEA 50: customise, reduce and close the loop); Ancker (repeat suppression). Direct consumer-app evidence is thin (**judgement**; research debt).

10. **Capture outcomes, not just edits.** Send one light follow-up 48–72 h after an escalation: "Did you speak to your vet? What happened? Seen / advised to watch / treated / emergency visit." Optionally ask "Was the photo read right?" Treat owner field edits as weak, anchored labels, and log their direction.
    *Evidence:* PIP's 163,110 in-app confirmations; Apple's 90-day survey; Whistle's EHR linkage; SkinVision's claims linkage; Dratsch on anchoring.

11. **Edits update the record but never erase history.** If an owner edits `blood: fresh_red → none`, recompute future rungs from the edited value. Keep the fact that an escalation was shown, and keep both values in the record the vet sees.
    *Evidence:* **judgement.** It follows the automation-bias and missing-not-at-random concerns above and matches the app's record-integrity conventions.

12. **Hand patterns to the longitudinal engine.** "Repeated vomiting" across days, or a cat vomiting more than about twice a month, is a *pattern* claim for the Home Signal engine, not a per-photo flag. The per-incident read handles only the acute, single-episode rungs, which avoids double-alerting from two surfaces.
    *Evidence:* Norsworthy 2013 (vomiting more than 2×/month in cats warrants work-up) [S]; Ancker (repeats).

13. **Test the model before trusting a field.** Before any colour field can trigger escalation on its own, build a vet-labelled internal evaluation set. It should cover confounders (red kibble or treats, beet, grass, bile, hairballs, dark kitchen lighting) and report per-field sensitivity, specificity and multi-sample agreement for the model Culprit actually runs.
    *Evidence:* Lane 4's evidence gap; Boie 2026 (calibration varies 3× by domain, so a model's aggregate calibration does not carry over to this field).

---

### (b) Research debt

1. **Photo-based blood, melena, coffee-ground and foreign-material detection has no validation at all**, for AI or for clinicians, human or veterinary. This is the largest gap and sits directly under the floor's most frequent trigger. We need an internal vet-labelled set (roughly a few hundred images per class, including mimics and poor lighting).
2. **Culprit's own base rates are unknown.** How often does "worth a call" fire per incident, per pet-month and per species, and what share is driven by the colour fields vs contextual flags vs `unsure`? This can be pulled from existing data before any design change.
3. **Clinical rung definitions:** which combinations are Now vs Today vs Mention, for dogs vs cats (e.g. cat inappetence duration, unproductive retching in large-breed dogs). Needs Dr. Chen and ideally a vet-triage protocol source. None was verified here.
4. **Direction of owner edits:** do owners edit toward de-escalation? This matters for principles 10–11 and for any retraining.
5. **Acknowledgement and latching UX in consumer health** has almost no direct evidence. Test it with an A/B on acknowledgement plus the one-shot follow-up.
6. **The ~0.70 reliability crossover and probability matching are lab findings.** No consumer-health study sets the PPV or frequency that keeps owners compliant. Culprit's ledger could produce that evidence.
7. **Several numbers are secondary [S]:** Kopka's self-care detail (press release), Wong's veterinary LLM study (publisher 403), Masanneck, Bean, Travers, Edwards, Wickens & Dixon. Re-read the primaries before any of them lands in a spec.
8. **Model-specific calibration on images:** the Claude Sonnet ECE result (0.06) is on text multiple-choice. Measure multi-sample agreement and calibration for the production vision model on Culprit's own photos.
9. **Vomit-image AI** has essentially no literature. Stool has consistency models (Poopscan, BSFS, DLSUC) but little on colour or blood.
10. **Notification-fatigue effect sizes** for consumer health push (Bidargaddi and later micro-randomized trials) were not extracted this pass.
11. **Competitor claims move monthly.** Re-verify at the time of use, not at citation.
12. **The only veterinary alert-outcome study (Whistle) is industry-funded and retrospective.** An independent replication would strengthen the conversion benchmark.
