# Synthetic user testing: what simulated users can and cannot tell us

**Date:** 2026-10-11 · 🧊 **Frozen** (a dated evidence capture; correct it additively with a dated §V section at the foot, never in place) · **Written for:** the App Store 1.2.0 restart (Linear project *App Store 1.2.0 · the first public release*)
**Claim tags:** **[E]** external evidence, URL given · **[R]** repo fact, path given · **[J]** judgment, not evidence
**The program built on this evidence** lives in [`docs/synthetic-testing-protocol.md`](../synthetic-testing-protocol.md) (living). The PM's rulings of 2026-10-11 that shaped it: no external TestFlight beta before launch, and panels on the first ten minutes, the product page and a mock App Review.

---

## TL;DR, plain English

An AI playing a pet owner is good at one job: finding places where a screen or a sentence can be misread, contradicts another screen, or promises something the app doesn't do. It is bad at telling you whether real owners will like the app, download it, trust it, or keep using it. On those questions simulated users are reliably too positive, too alike, and too diligent: they read every word and push through friction that would make a real owner quit. So treat it the way the app treats a single photo read: **a simulated problem, once it is confirmed on the real screen, is worth fixing. A simulated "looks fine" proves nothing.** The strongest levers on fidelity in the literature are grounding personas in real people's words and calibrating against a small real sample (§1.2); this repo has neither yet (§2.3), which is why the protocol treats every panel as a problem finder only.

---

## 0. The rule this evidence supports

[J] Synthetic testing has the same asymmetry as Culprit's n=1 invariant.

- **When a simulated participant misreads a screen**, that is evidence the screen *can* be misread. Verify it on the pixels, then fix it.
- **When a simulated participant understands, completes, or likes a screen**, that is not evidence a real owner will. The simulator is known to over-read, over-complete and over-approve (§1.2).

So every test below has an asymmetric decision rule: a synthetic finding can trigger a fix, and only real users can clear a risk. The same reasoning splits the work into two roles. A **naive participant** sees only the stimulus and a persona card. An **expert verifier** sees the pixels, the code and the spec, and tries to refute each finding.

---

## Part 1: External evidence

### 1.1 Validity studies: where simulated people matched real ones, and where they didn't

**Surveys and social science**

| Study | What was compared | Matched | Diverged |
|---|---|---|---|
| Argyle et al. 2023, *Political Analysis*, "Out of One, Many" [E] https://arxiv.org/abs/2209.06899 | GPT-3 conditioned on thousands of real survey respondents' backstories ("silicon samples") vs. those respondents | Subgroup response distributions ("algorithmic fidelity") | The fidelity came from conditioning on *real people's* backstories. That is not a licence for invented personas. |
| Aher, Arriaga & Kalai, ICML 2023 [E] https://proceedings.mlr.press/v202/aher23a.html | "Turing experiments": classic studies re-run with simulated subjects | Ultimatum game, garden-path sentences, Milgram | Wisdom of crowds: "hyper-accuracy distortion", where simulated people knew obscure facts perfectly. In UX terms, they know too much. |
| Santurkar et al., ICML 2023 [E] https://proceedings.mlr.press/v202/santurkar23a.html | LM opinions vs. 60 US demographic groups (Pew) | — | Substantial misalignment that persists after explicit steering. Ages 65+ and widowed respondents are among the worst represented. |
| Bisbee et al. 2024, *Political Analysis* [E] https://www.cambridge.org/core/product/B92267DC26195C7F36E63EA04A47D2FE | ChatGPT personas vs. the ANES survey | Means | Less variance, wrong regression coefficients, shifts under small wording changes, and the same prompt drifted over three months. |
| Park et al. 2024, "Generative Agent Simulations of 1,000 People" [E] https://arxiv.org/abs/2411.10109 | Agents built from 2-hour interviews with 1,052 people | GSS answers matched at 85% of the participants' own two-week test-retest consistency | Persona-only and demographic-only agents did worse: GSS 0.85 vs 0.70 vs 0.71 (NN/g's table [E] https://www.nngroup.com/articles/ai-simulations-studies/). **Grounding in real interviews is the biggest lever.** |
| Hu & Collier, ACL 2024 [E] https://aclanthology.org/2024.acl-long.554 | Persona prompting on subjective annotation datasets | Modest, significant gains | Persona variables explain under 10% of annotation variance, so "different" personas mostly aren't. |
| **Arora, Chakraborty & Nishimura 2025, *Journal of Marketing*, as tabulated by NN/g** [E] https://www.nngroup.com/articles/ai-simulations-studies/ | 605 synthetic vs. 605 demographically matched humans rating a **refrigerated dog food** concept, the closest published analogue to Culprit's audience | Direction and valence | Purchase likelihood 1.58 vs 1.66, liking 1.40 vs 1.43, **perceived uniqueness 2.48 vs 2.12** (all significant). Synthetic standard deviations were consistently lower. Adding memory plus retrieval over **16 pet-owner interview transcripts** raised variability somewhat. |
| Wang, Morgenstern & Dickerson 2024 [E] https://arxiv.org/abs/2402.01908 | 3,200 human participants, 16 identities, 4 LLMs | — | LLMs misportray and flatten identity groups. A "person with impaired vision" persona reads as an out-group imitation. |
| Cheng, Piccardi & Yang, EMNLP 2023 (CoMPosT) [E] https://arxiv.org/abs/2310.11501 | Caricature in open-ended simulations | — | Simulations of marginalized groups, and of general uncontroversial topics, are highly susceptible to caricature. |
| Wang, Hunt, Tang & Joseph 2025 [E] https://arxiv.org/abs/2511.21218 | Fine-tuning on a small human pilot sample | "Substantially improves heterogeneity, alignment, and belief-action coherence" | Still fails to reproduce the study's regression coefficients. |

**UX and usability**

| Study | What was compared | Matched | Diverged |
|---|---|---|---|
| UXAgent (Lu et al., CHI 2025 Extended Abstracts) [E] https://arxiv.org/abs/2504.09407 | Persona agents browsing a shopping site from simplified HTML; 5 UX researchers judged the output | Helped researchers refine their *study design* | Realism rated 3.0/5 ("not like real humans"); helpfulness 3.4, trust 3.6. The agents perceive HTML only, so visuals are excluded. |
| SimUser (Xiang et al., CHI 2024) [E] https://doi.org/10.1145/3613904.3642481 | Simulated users vs. 48 users and 21 designers on a smartwatch interface | Heuristic issue similarity **35.7%–100%**, depending on user group and category | Wide variance by group: no single "the AI found X%". |
| vizron (Arends et al., CHI '26 persona workshop) [E] https://ceur-ws.org/Vol-4249/paper5.pdf | Screenshot-reading persona agents on web apps | Found usability issues | "The effect of including personas proved to be ineffective in terms of chosen navigation paths." A senior-citizen persona complained of small text and a complex UI "while the framework nevertheless navigates to the next best option seamlessly." |
| Walmart (Sharma et al., CHI '26 persona workshop) [E] https://ceur-ws.org/Vol-4249/paper2.pdf | Personas vs. a 150-participant moderated benchmark on an "AI Quick Add" feature | Themes aligned: trust, control, clarity | The personas rationalized hesitation that humans felt emotionally, showed "assumed system familiarity", never paused or re-read, and carried weaker price and brand context. This is an interested party's single case; the 90%-savings claim is theirs. |
| Kuric, Demcak & Krajcovic 2026 [E] https://arxiv.org/abs/2605.18302 | GPT-predicted clicks vs. 12 real first-click tests (n = 3,431) | — | **Click distributions differed significantly in 53% of tasks.** Personas, chain-of-thought and sampling settings did not improve fidelity "apart from inflating believability". |
| AgentA/B (Lu et al., CHI 2026 Extended Abstracts) [E] https://arxiv.org/abs/2504.09723 | 1,000 agents on Amazon vs. a parallel human A/B test | Direction (414 vs 403 purchases) | Magnitude not established |
| Zhong, McDonald & Hsieh 2025 [E] https://arxiv.org/abs/2507.02306 | Multimodal-LLM heuristic evaluation vs. 5 experienced evaluators, on two apps | LLM found **73% / 77%** of issues; the humans found 57% / 63% | Strong on layout; weak on UI conventions and cross-screen violations |
| Guerino et al., INTERACT 2025 [E] https://arxiv.org/abs/2506.16345 | GPT-4o heuristic evaluation vs. experts on a web system | Better on aesthetics and real-world match | Found only **21.2%** of the experts' issues, added 27 new ones, and produced hallucinated false positives |
| UICrit (Duan et al., UIST 2024) [E] https://arxiv.org/abs/2407.08850 | LLM critique of mobile UIs, improved with 3,059 designer critiques of 983 screens | Few-shot plus visual prompting gave +55% quality | Still below human experts |

[J] The two heuristic-evaluation papers disagree about threefold on overlap with experts; the difference is method and prompt. That disagreement is the best argument for a verifier: anything a model finds is a hypothesis until someone checks it on the screen.

**Practitioner write-ups and critiques**

- **NN/g, Rosala & Moran, 2024-06-21** [E] https://www.nngroup.com/articles/synthetic-users/. They re-ran three real studies with the Synthetic Users product and ChatGPT.
  - Synthetic learners said they finished every course; real learners often quit partway.
  - Synthetic learners valued discussion forums that real learners avoided.
  - Quotes: "Synthetic users seem to care about everything." "Since AI loves to please, every idea is often seen as a good one." The tools are "limited to replicating text-based attitudinal methods."
  - Their advice: supplement, never substitute; use them to prepare (for example, to pilot an interview guide); never use them for concept validation.
- **NN/g, Budiu, 2025-08-15** [E] https://www.nngroup.com/articles/ai-simulations-studies/. Synthetic users "capture general trends in human behavior but fails at capturing the magnitude of the effects" (sic), and accuracy "depends on demographic group, task, and contextual information."
- **MeasuringU, Lewis & Sauro, 2026-04-14** [E] https://measuringu.com/review-of-experiments-with-synthetic-users/. Across 12 peer-reviewed papers since 2023 they counted 9 encouraging findings against 14 discouraging, and no study showed good qualitative depth. Quotes: "Premature to rely on research with synthetic users for critical decision-making." "An LLM is just an easier way to query your database … Just don't think it's predicting something that's not already known."
- **Userbrain, Rössler, 2026-04-28** [E] https://www.userbrain.com/blog/synthetic-users-experiment/. Five real sessions vs. five ChatGPT sessions on a pricing page; the vendor bias is disclosed.
  - Task 1: 5/5 synthetic users got it right vs. 3/5 real users ("the AI pushed past friction").
  - Task 2: both groups fell into the same trap. A shared failure is a useful signal.
  - The first prompt behaved like "a patient accountant" and had to be rewritten to scan and settle for good enough.
  - Their advice: at least three fresh synthetic sessions, run *alongside* real ones.
- **Vendor claims.** Synthetic Users advertises 85–92% "synthetic-organic parity" from its own comparison studies [E] https://www.syntheticusers.com/. Third-party comparisons note small internal samples and no independent validation [E] https://societies.io/compare/synthetic-users. Treat this as marketing.
- **Critique: Agnew et al., CHI 2024, "The Illusion of Artificial Inclusion"** [E] https://research.google/pubs/the-illusion-of-artificial-inclusion/. Substitution proposals "ignore and ultimately conflict with foundational values of work with human participants": representation, inclusion and understanding.

### 1.2 Failure modes and their mitigations

| Failure mode | Evidence | Mitigation | What remains after mitigation |
|---|---|---|---|
| **Positivity / sycophancy** | RLHF-trained assistants are sycophantic (Sharma et al., ICLR 2024 [E] https://arxiv.org/abs/2310.13548); NN/g's drone and course examples; Arora's inflated "uniqueness" | Never ask whether they like it or would download it. Ask comprehension questions scored against an answer key written beforehand (teach-back). Include a worst-case-reader persona. The verifier discards non-specific praise. | Intent and approval measures stay unusable. |
| **Homogeneity, low variance, "average user" collapse** | Bisbee; Arora (lower SDs); Hu & Collier (personas explain <10% of variance) | Concrete persona constraints (vocabulary, stakes, reading habit). Count *distinct interpretations* across runs instead of taking majority votes. Treat unanimity as low information, not consensus. | The spread of real behaviour can't be recovered. Never report "N% of users". |
| **Knowing too much: no real confusion, pushing through friction** | Aher (hyper-accuracy); Userbrain (5/5 vs 3/5); vizron (the persona complains, then navigates seamlessly); Walmart ("assumed system familiarity") | The participant sees only the stimulus: no repo, no spec, no rulings. Reveal screens in sequence. Put vocabulary limits in the persona card ("has never heard 'elimination diet'"). Collect *reasons* someone would stop, never completion counts. | Task completion and time-on-task are not measurable. |
| **Over-reading text** | Real users read about 20–28% of a page's words (Nielsen 2008 [E] https://www.nngroup.com/articles/how-little-do-users-read/); 74% skipped a privacy policy through a clickwrap (Obar & Oeldorf-Hirsch 2018 [E] https://papers.ssrn.com/abstract=2757465) | Run a glance pass first ("what did you notice in 3 seconds", on a downscaled image). Score headline and button comprehension separately from body text. Treat any comprehension pass as an **upper bound**. | A model can't skip the way a person does, so comprehension is overstated. |
| **Can't perceive the rendered visual** | UXAgent reads HTML only; NN/g: "AI can't actually use a product like a human does"; vision models fail simple visual tasks (BlindTest: 4 VLMs average 58%, best 78%, on 2024-era models [E] https://arxiv.org/abs/2407.06581) | Give real device screenshots at native resolution. Ask participants to *locate* elements, and have the verifier check. Keep contrast, tap size and truncation in deterministic tools. | Motion, timing, haptics and real scrolling need a device. |
| **No stakes, no emotion** | Walmart (emotional hesitation rationalized); NN/g | Put stakes in the scenario (time of night, the dog vomiting twice). Treat emotional claims as hypotheses only. | Trust formation, anxiety and fatigue need real users. |
| **Prompt anchoring, wording sensitivity, drift** | Bisbee (wording effects, 3-month drift); Kuric (chain-of-thought and personas don't fix it) | Freeze prompts and stimuli per round and store them with the results. Test variants between subjects (one variant per run). Use neutral task wording. Record the model id and date. | Results are specific to a model and a date; re-run after a model upgrade. |
| **Caricature of edge groups** | Wang et al.; CoMPosT; idealized disability personas (Bombieri et al. 2026 [E] https://arxiv.org/abs/2605.20191) | **Don't simulate disability.** Use deterministic accessibility checks and real assistive-technology users. | — |
| **Hallucinated findings** | Guerino (false positives) | A verifier that tries to refute each finding against the pixels and the code (the `/design-critique` pattern) | Plausible-but-unverifiable findings go to the real cohort as probes. |

The mitigations with the strongest evidence [E] are **grounding in real people's data** and **calibrating against a small real sample**:

- interview-grounded agents beat persona-description agents (Park);
- retrieval over 16 pet-owner transcripts raised variability (Arora);
- a small human pilot improved fidelity (Wang et al. 2025).

The rest (isolation, sequential reveal, glance pass, between-subjects variants, the verifier) is my judgment [J], reasoned from the failure mechanisms. Userbrain's prompt rewrite and the repo's own verifier results partly support it.

### 1.3 What it is good for, ranked by the strength of the evidence

1. **Comprehension and copy ambiguity.** Detecting that a sentence admits more than one reading, or uses a word the reader may not know.
   - [J] This is the strongest fit, because reasoning over text is what models do best. "Two of six runs read it as X" is a legitimate finding even though the real base rate is unknowable.
   - Evidence is indirect: the Walmart themes aligned, and NN/g calls synthetic users useful for desk research.
2. **Consistency audits**: text against text against screen. Examples: reviewer notes vs. the app; consent copy vs. the privacy policy vs. the actual data flow; store claims vs. features.
   - [J] This is a checklist task, not a simulation, and every hit is checkable.
3. **Heuristic evaluation of rendered screens.** The evidence is mixed: 73–77% recall in one study, 21% overlap in another [E]. It needs a verifier.
4. **Edge-case coverage generation**: which states and personas to capture and test (a rescue with unknown age, a three-pet household, a first log at 2 a.m.).
   - [J] High value as a checklist generator, low value as a judge of those states.
5. **Piloting the real test**: debugging the TestFlight task script and survey before humans see them [E] (UXAgent; NN/g's "pilot an interview guide").
6. **Predicting obvious drop-off points.** Weak. Dead ends and missing affordances, yes (that's heuristics). Predicted clicks and completion rates, no (Kuric's 53%; Userbrain) [E].
7. **Direction of an A/B test.** Sometimes right (AgentA/B; Arora's "direction and valence"), never the magnitude. Not decision-grade before launch [E].

**Not good for:** concept validation, "would you download", intent or price, trust in clinical output, retention, emotion, or the experience of accessibility. Sources [E]: NN/g; Arora; Kuric; Wang et al.

### 1.4 Sample sizes and aggregation: what makes a finding decision-grade

**Real users.**
- Five users find about 85% of the usability problems within one user group (Nielsen, with a per-user find rate L = 31%).
- With two distinct groups, test 3–4 users in each.
- Run 3 rounds of 5 users rather than 1 round of 15.
- Source [E]: https://www.nngroup.com/articles/why-you-only-need-to-test-with-5-users/
- Quantitative metrics need at least 20 users, often around 40 [E] https://www.nngroup.com/articles/quantitative-studies-how-many-users/.

**Synthetic.** [J] More runs buy stability, not representativeness: a hundred runs of one model sample the model, not the population (Bisbee; Arora). So:
- **Panel size.** 6–8 personas spanning the segments, plus adversarial ones, with **3 independent fresh-context runs each** (Userbrain's "at least three"). That is 18–30 runs per test.
- **What counts as a finding.** It must recur (≥2 of 3 runs for one persona, or ≥2 personas), **and** a verifier must confirm it on the pixels, **and** it must name a mechanism (which element, which word).
- **How to report.** Say "N of M runs", never "N% of users". This matches the house rule that every number owns a denominator.
- **Unanimity is not consensus.** If every run reads a sentence the same way, that is low information, not proof the sentence is clear.
- **Model diversity as a robustness check.** Use two model sizes; a finding that shows up in only one model gets lower confidence. Every model here comes from one family, which limits the check.
- **Pre-register** the questions, the answer keys and the decision rules before the run.
- **Calibrate once real users exist:**
  - recall: what share of real users' problems did the synthetic run flag?
  - precision: what share of verified synthetic findings did real users actually hit?
  - A synthetic test stays in the release checklist only if those numbers earn it.

### 1.5 Real-user complements for a first launch

| Option | What it gives | Limits | Cost and time |
|---|---|---|---|
| **TestFlight external testing** [E] https://developer.apple.com/testflight/ | Up to 10,000 external testers (100 internal). A public link with device/OS criteria. Testers send annotated screenshots and crash reports from the TestFlight app. Builds stay valid for 90 days [E] https://docs.expo.dev/submit/testflight/ | Beta App Review is required on the first build of every app version (Expo docs, above). Data lands in **production** (real health data), so the consent gate and the privacy policy must be live first. | Free. Beta App Review usually takes a day or two [J]. Recruiting is the real cost. |
| **The 5-user moderated test** | Think-aloud first run over a video call with screen share: the richest signal for first-run problems | Five per round; the PM's time | Incentives $25–75 each [J]; about 6–8 PM hours |
| **Unmoderated services** | Userbrain at $45 per tester session, mobile supported [E] https://www.userbrain.com/en/pricing. Lyssna five-second, first-click and preference tests on static images, at 1 credit (≈ $1) per minute per response plus 2 credits for a screener [E] https://help.lyssna.com/en/articles/4953377-lyssna-pricing. Prolific surveys at a minimum of $8/h (recommended $12/h) plus a 42.8% corporate fee [E] https://researcher-help.prolific.com/en/articles/445129-study-cost. UserTesting is enterprise-priced [J]. | Panel pet owners are rarely in-wedge. Getting panelists to install a TestFlight build may be awkward; check before booking [J]. | A 2-minute glance test with 50 US pet owners is ≈ $100–200, and a 5-minute consent-comprehension survey with 40 is ≈ $60–120 [J, arithmetic from the published rates; vendor prices change, so verify]. |
| **Pre-launch store-page test on paid traffic** (a SplitMetrics-style simulated product page) [E] https://appscreenshotstudio.com/glossary/splitmetrics | Intent (taps on a fake "Get" button) | Measures intent, not installs; needs ad spend | Not recommended for 1.2.0 [J] |
| **Product page optimization, after launch** [E] https://developer.apple.com/app-store/product-page-optimization/ | Up to 3 treatments vs. the original (icons, screenshots, previews); one test at a time for up to 90 days; iOS 15+; read results at ≥90% confidence | Needs traffic; treatment metadata goes through review. A new app may take weeks to reach confidence [J]. | Free. Already on the M6 list as "screenshot test" [R, App Store Launch project]. |

A glance test is worth running at all because visual-appeal judgments made in 50 ms agreed with judgments made after longer viewing (Lindgaard et al. 2006) [E] https://www.nature.com/news/2006/060109/full/news060109-13.html.

---

## Part 2: This repo's precedent

### 2.1 What the team already does

| Mechanism | What it is | Notable result |
|---|---|---|
| **Personas, subagents, skills** (`docs/personas.md`) [R] | Personas are in-context lenses; subagents are isolated reviews; skills are invariants. The routing table says which lenses must speak on which surfaces. | The model is sound. Isolation is treated "as a feature" for adversarial review. |
| **Synthetic persona role-play for discovery** (`docs/vet-report-discovery.md` §5, 2026-06-21) [R] | The vet-report interviews were explicitly "synthetic persona role-play". Every claim is tagged [EVIDENCE] or [ASSUMPTION], with a ranked Research Debt in §10. | §10 names its own limit: "**synthetic vets can't validate trust**." Validating R1 and R2 with real practicing vets was the gate. |
| **Specialist panel** (`docs/research/2026-06-vet-council-nyx-deep-dive.md`) [R] | Five board-certified lenses read the same evidence pack in isolation, each falsifying its own hypothesis. | "Specialty diversity, not raw model capability, produced the new substance." |
| **Isolated persona interviews** (`docs/sessions/2026-09-05-home-v2-discovery.md`; `docs/nyx-vet-visits-requirements.md` §0.2) [R] | Six interviews for Home v2 and nine for Vet visits. Each lens read the app as built (file paths) and formed a view before reading the prior record. | Convergence "without being asked" was the signal. Vet visits came back 2 BUILD, 7 BUILD WITH CONDITIONS, 0 DON'T BUILD, and every condition became a rule or a named decision. |
| **`/design-critique`** (`.claude/commands/design-critique.md`, `.claude/workflows/design-critique.js`) [R] | Every lens reads the same pixels in isolation; a verifier tries to refute each finding (CONFIRMED / PLAUSIBLE / REFUTED / MOCK_ARTIFACT); the result is synthesized into decision briefs. | CUL-1108 (History v2, round 3): 27 agents; 118 findings confirmed, 12 plausible, 13 mock artifacts, 2 refuted; eleven defects in shipped code filed. |
| **`pm-feature-review`** (`.claude/agents/pm-feature-review.md`) [R] | Walks the flows as Jordan or Sam cold, before reading the spec | Describes itself as "a STATIC read of the screen code as a proxy for the rendered experience". It asks for screenshots and returns INSUFFICIENT rather than guessing. |
| **`vet-report-cold-read`** (`.claude/agents/vet-report-cold-read.md`) [R] | Reads the rendered report only and refuses code | The first real artifact came back NOT READY, "fix 3–4 things" (`docs/research/2026-07-vet-report-first-artifact-review.md`). |
| **Onboarding** (`docs/nyx-onboarding-requirements.md` v1.1 header and §3.0) [R] | A Jordan and Sam persona interview on mock v1 | Found "no obvious create-account affordance and no logo, and both personas bounced on the entry", which led to the Landing pattern. |

### 2.2 What worked

- **Isolation plus a verifier that tries to refute.** After verification the refutation rate was low, and real defects were found in shipped code (CUL-1108).
- **Rendered-artifact discipline.** The cold read refuses code.
- **Tagging evidence vs. assumption**, plus a ranked research-debt list that names what synthetic work cannot settle.
- **Convergence of independent lenses as the signal**, rather than any one lens's opinion.
- **Affordance and logic problems.** Synthetic interviews reliably caught them: the onboarding entry, and the vet-visits conditions.

### 2.3 Limits

- **The panels are expert lenses that read code, specs and rulings** [R/J]. `design-critique.js` tells each lens to read the principles, `docs/personas.md` and the shipped code. That is right for review and wrong for simulating a first-time owner: they know too much by construction.
- **The owner personas are composites from desk research** [R].
  - `docs/nyx-research-v1_0.md` is market and clinical data plus composite personas.
  - Its proposed 5-person diary study (§4) is recorded as "still unanswered" (`docs/logging-capture-discovery.md`, open-questions row 3), and the 10–15 owner/vet interviews in the vet-report discovery (R2) have no record of having run.
  - So no interview transcripts exist to ground a simulation, and the literature's biggest fidelity lever is missing (Park 2024).
- **Static code reads are a proxy** [R]. `pm-feature-review` says so itself, and `/design-critique` can critique a shipped surface only from the PM's screenshots (step 2, "shipped").
- **No calibration loop** [R].
  - Nothing on record compares synthetic findings with real users.
  - The real-vet gate was relaxed to the PM's own GP (`docs/nyx-vet-report-requirements.md` §11).
  - As of 2026-10-10, "no real veterinarian has read the report; the paid review was cancelled" (`docs/sessions/2026-10-10-cul-1762-competitive-landscape-refresh.md`; D5 on [CUL-1768](https://linear.app/projectnyx/issue/CUL-1768)).
- **Every simulated owner is in-wedge** [J]: each has a vet directive and a known problem. But the store name is "Culprit — Pet Health Tracker" (`docs/store-listing-copy.md` §1) [R], so real traffic will include owners with no directive and owners looking for vaccine records or reminders. Nobody has simulated them.
- **Volume** [J]. A full critique runs 27 agents, and the findings outnumber the decisions. The team's own retros ask that process net out (`docs/personas.md` § Periodic Process Retro) [R].

### 2.4 The onboarding flow as shipped (what a test would name)

The flow below is verified against the route files [R]. The app is version 1.2.0 on Expo ^57.0.8 and React Native 0.86.0, with **no `react-native-web` dependency** (`package.json`, `app.json`).

| # | Screen (route) | Headline and copy | Controls and notes |
|---|---|---|---|
| 0 | **Landing** `app/(auth)/index.tsx` | "Culprit" wordmark over the night hero; sub: "Track symptoms, find triggers. Walk into your next vet visit with answers, not guesses." | "See how it works ›", **Create account**, Log in. A live session skips straight to the tabs. |
| 0a | **How it works** (optional) `app/(auth)/how-it-works.tsx` + `components/onboarding/ValuePreview.tsx` | Three previews: "Patterns you can't see." / "Culprit tells you what the data means — not just what happened." · "A couple of taps today. A clearer picture tomorrow." / "Log a meal or a symptom in seconds — it's what lets Culprit catch what's changing." · "Ready for the vet." / "Hand your vet a clear, clinical summary in one tap. Free, always." | Swipe or tap the dots; Create account and Log in repeated |
| 1 | **Create account** `app/(auth)/signup.tsx` | "Create your account" / "This is you — we'll set up your pet next." | First name, Last name, Email, Password; **Create account**; "By continuing you agree to Culprit's Terms and Privacy Policy."; "Already have an account? Log in". Apple and Google are hidden (`SOCIAL_AUTH_ENABLED = false`, `constants/flags.ts`). |
| 1a | **Check your inbox** (same file) | "Check your inbox" | Open email app · Resend link · "I'll do this later" (goes back to the Landing). Self-created accounts confirm by email (`docs/app-review-notes.md`). |
| 1b | **Confirm** `app/(auth)/confirm.tsx` | "Confirming your email" → "Your email is confirmed" or "That link no longer works" ("Go to sign in") | Opened from the emailed link |
| 2 | **Before you start** `app/onboarding/disclaimer.tsx` | "Culprit helps you notice and record — it can't examine your pet, and it never gives the all-clear. For diagnosis, treatment, or anything urgent, your vet is the call." | "Read the full disclaimer"; the button reads "I understand Culprit is not a substitute for veterinary care." |
| 2a | **AI consent**: planned, **not built** ([CUL-552](https://linear.app/projectnyx/issue/CUL-552) PR 3) | To sit next to "Before you start". It names "Anthropic, the maker of Claude" and keeps "not used to train models". The scope is the whole Anthropic boundary (D10, ruled 2026-10-11). | Also planned: a first-open sheet for existing accounts, a pre-upload backstop sheet, and a Settings toggle (`docs/sessions/2026-10-11-cul-552-consent-schema.md`) |
| 3 | **Pet type** `pet-type.tsx` (Step 1 of 5) | "Who are we tracking?" / "Built for every pet in your home — you can add the rest anytime." | Tiles: Cat ("Whiskers, grazing, the works"), Dog ("Walks, treats, tail wags"); Continue |
| 4 | **Name** `pet-name.tsx` (2 of 5) | "What's your pet's name?" / "The one you actually call them." | Name field, placeholder "e.g. Luna"; Continue |
| 5 | **Breed** `pet-breed.tsx` (3 of 5, skippable) | "What's {name}'s breed?" / "Optional — it helps tailor what we watch for." | "Type the breed" / "Choose from the list instead"; Continue; Skip |
| 6 | **Gender** `pet-gender.tsx` (4 of 5) | "What's {name}'s gender?" / "Optional — helps us read the data in context." | Chips; Continue; skip labelled "Not sure? Skip" |
| 7 | **Age** `pet-age.tsx` (5 of 5, skippable) | "How old is {name}?" / "An age or a birthday — whichever you know." | Years/Months or a birthday picker; Continue |
| (8) | **Paywall** `paywall.tsx`: **not in 1.2.0** | "Culprit Premium", £29.99/yr, £3.99/mo, "Start 7-day free trial" (a mock) | Gated by `app_config.paywall_enabled`, flagged off since 2026-07-24 (`docs/sessions/2026-07-24-paywall-flagged-off.md`). Check the flag again at the cut. |
| 9 | **All set** `done.tsx` | "You're all set." / "Say hi to {name} — their home is ready." | "Go to {name}'s home"; "Got another pet? You can add them anytime from your profile." |
| 10 | **First Home**, empty (`components/home/SignalZone.tsx`, `lib/signalCopy.ts`, `components/designV2/home/TodayCard.tsx`) | Signal: "We're getting to know {name}." (plus "Day N — X events so far." once something is logged) / "Patterns usually start appearing within the first week. Here's what we're watching for:" Three rows (Timing · Food connections · Change). Floor line: "If something needs attention sooner, it won't wait for the week." Today: "Nothing logged yet today. Meals, symptoms and medication go in with the + button." | The daily-look (Noticed) card; the + button (FAB). The food library starts empty, so the first meal is typed, not confirmed (onboarding spec §7). |

**Drift from the spec and mock** [R]. The spec's v1.3 flow is partly superseded:
- the Landing became the night hero, with the value previews moved behind "See how it works" (B-284);
- a "Before you start" disclaimer was added (B-270);
- the copy now says "Culprit".

**`docs/onboarding-flow-mockups.html` is stale against the shipped flow; don't use it as a stimulus for the shipped onboarding.**

### 2.5 Getting rendered screens in front of synthetic testers

This container cannot run the app. There is no `react-native-web`, no macOS or iOS Simulator, and Expo Go no longer runs the app since the widget targets landed (`docs/store-screenshot-plan.md`) [R]. Here are the realistic routes.

| Source | What it yields | Fidelity | Effort | Feeds |
|---|---|---|---|---|
| **(a) PM captures from TestFlight**: screenshots, or an iOS screen recording split into frames here (`/usr/bin/ffmpeg` and ImageMagick are installed [R, checked]) | The only true rendering of the shipped app. Use a **fresh account** for first-run and empty states; the device-pass **fixture account** (`docs/device-pass-fixture-runbook.md`: *Fig* is brand new with every designed empty state, *Pepper* shows the Signal's building state); and the **Cooper demo account** (`scripts/demo/`) for full-data and review screens. Also capture the largest Dynamic Type size for key screens. | Exact | About 60–90 min per capture set, plus about 5 min a day for days 2, 4 and 7. One sitting serves T2, T4 and the store frames' capture mode. | T2, T3 (the expectation check), T4 |
| **(b) HTML mocks via `scripts/design-critique/render.mjs`** | Every frame at 390 and 1280 wide, with Reduce Motion on and off, plus `MANIFEST.md` and `page.txt`. **Verified working in this container today**: it rendered `docs/culprit-landing-hero-mockups.html` to 12 manifest entries with 0 page errors, output written to scratch only. `scripts/render-mockup.mjs` makes one full-page PNG but needs `npm install --no-save puppeteer`. | Only as true as the mock; good for screens not yet built | Minutes | **T1** (the consent mock, still to be drawn), T3 |
| **(c) `node scripts/store-screenshots/render.js --draft`** (`scripts/store-screenshots/README.md`) | The six-frame store set at 1320×2868 from built-in stand-ins, with no captures needed. Capture mode composes the real Cooper captures once they exist. The search-card preview lives in `docs/culprit-store-screenshot-mockups.html`. | Draft frames are for copy and positioning only. They are not uploadable (Guideline 2.3) and their captions are placeholders. | Minutes | **T3** |
| **(d) Other `scripts/`** | `layout-probe` is **not a renderer**: it runs the shipped Yoga layout engine in Node for one component's geometry (tap gaps). Useful only for a specific Dynamic Type or tap-target question. `scripts/demo` and `scripts/fixture` are the seeds that make states capturable, not renderers. | — | — | T5 (narrowly) |
| (e) Possible but not recommended: adding `react-native-web` to render screens in Chromium | Screens in a browser | Diverges from native fonts and layout; a large lift before launch | Days | — [J] |

---


### 2.6 Where synthetic testing would give false confidence

| What someone might report | Why it's misleading |
|---|---|
| "18 of 21 simulated owners finished onboarding." | Agents push through friction, so completion counts carry no information (Userbrain 5/5 vs 3/5; vizron). |
| "Every simulated owner understood the consent sheet." | Models read every word; real owners mostly skip consent text (74% skipped; 20–28% of words read). A pass is an upper bound. |
| "Simulated owners rated the store page 4.2/5 and would download." | Sycophancy and inflated "uniqueness" (NN/g; Arora's dog-food study). |
| "Simulated vets trust the report." | Trust can't be simulated; the repo's own R1 says so, and no real vet has read the report. |
| "The older and low-vision personas had no trouble." | Caricature and flattening (Wang et al.; Santurkar on ages 65+). |
| "Week one looks fine." | Retention is the main risk named in the research dossier (`docs/nyx-research-v1_0.md` §3), and nothing here measures it. |
| "All our personas agree." | They were written by the team that designed the app, so the in-wedge vocabulary is baked in. Agreement may be the design talking to itself. |

### 2.7 Found while researching: candidates to file

Each needs verifying before it is filed.

1. **[R, verified] The reviewer notes describe a retired surface.** Step 3 of `docs/app-review-notes.md` §2 says "Still on Home, the Trend zone charts symptoms over time". There is no TrendZone component left in `components/home/` and nothing imports one; `components/home/SignalReceipts.tsx` refers to "the retired TrendZone". The notes are dated 2026-08-11, before the Design v2, History v2, Vet visits and Noticed GAs and before the consent gate. This is a T2 seed and belongs on [CUL-188](https://linear.app/projectnyx/issue/CUL-188).
2. **[R, read from the code] The breed screen's subtitle over-claims.** Onboarding says breed "helps tailor what we watch for" (`app/onboarding/pet-breed.tsx`), but breed is read only by the header's identity line (`lib/utils.ts`) and the vet report's signalment (`supabase/functions/generate-report/`). None of `generate-signal`, `analyze-*` or the client detectors reads it. This is a candidate copy fix.
3. **[R] The onboarding spec v1.3 and `docs/onboarding-flow-mockups.html` are stale against the shipped flow** (the night-hero Landing, the disclaimer step, the Culprit naming). Don't use them as stimuli; perhaps add a ⚠ note to the spec.
4. **[J, hypothesis] The Landing never says "pet".** The only cue is "vet visit". It's a T3/T4 probe, not a defect.
5. **[R] There is no AI-consent sheet mock yet.** T1 needs one, and "Mock what you change" requires it.
6. **[R, read from the code; verify] The notes' notification line may be incomplete.** The notes say a notifications prompt appears "only if you turn them on in Settings", but the Daily Recap screen also offers the 9 pm summary in-app (`app/day-summary.tsx` → `DailyRecapOffer`). That path is primer-gated and user-initiated, so this is wording, not a violation.


## Sources

**Academic**
- Argyle et al. 2023: https://arxiv.org/abs/2209.06899
- Aher, Arriaga & Kalai 2023: https://proceedings.mlr.press/v202/aher23a.html
- Santurkar et al. 2023: https://proceedings.mlr.press/v202/santurkar23a.html
- Bisbee et al. 2024: https://www.cambridge.org/core/product/B92267DC26195C7F36E63EA04A47D2FE
- Park et al. 2024: https://arxiv.org/abs/2411.10109
- Hu & Collier 2024: https://aclanthology.org/2024.acl-long.554
- Wang, Morgenstern & Dickerson: https://arxiv.org/abs/2402.01908
- Cheng, Piccardi & Yang 2023: https://arxiv.org/abs/2310.11501
- Wang, Hunt, Tang & Joseph 2025: https://arxiv.org/abs/2511.21218
- Sharma et al. 2023: https://arxiv.org/abs/2310.13548
- Agnew et al. 2024: https://research.google/pubs/the-illusion-of-artificial-inclusion/
- Bombieri et al. 2026: https://arxiv.org/abs/2605.20191
- Rahmanzadehgervi et al. 2024: https://arxiv.org/abs/2407.06581

**UX and HCI**
- UXAgent: https://arxiv.org/abs/2504.09407
- SimUser: https://doi.org/10.1145/3613904.3642481
- vizron: https://ceur-ws.org/Vol-4249/paper5.pdf
- Walmart AI personas: https://ceur-ws.org/Vol-4249/paper2.pdf
- Kuric et al. 2026: https://arxiv.org/abs/2605.18302
- AgentA/B: https://arxiv.org/abs/2504.09723
- Zhong et al. 2025: https://arxiv.org/abs/2507.02306
- Guerino et al. 2025: https://arxiv.org/abs/2506.16345
- UICrit: https://arxiv.org/abs/2407.08850
- Lindgaard et al. 2006: https://www.nature.com/news/2006/060109/full/news060109-13.html

**Practitioner write-ups**
- NN/g 2024: https://www.nngroup.com/articles/synthetic-users/
- NN/g 2025: https://www.nngroup.com/articles/ai-simulations-studies/
- MeasuringU 2026: https://measuringu.com/review-of-experiments-with-synthetic-users/
- Userbrain 2026: https://www.userbrain.com/blog/synthetic-users-experiment/
- Synthetic Users: https://www.syntheticusers.com/
- Synthetic Users comparison: https://societies.io/compare/synthetic-users
- NN/g, 5 users: https://www.nngroup.com/articles/why-you-only-need-to-test-with-5-users/
- NN/g, quantitative sample sizes: https://www.nngroup.com/articles/quantitative-studies-how-many-users/
- NN/g, how little users read: https://www.nngroup.com/articles/how-little-do-users-read/
- Obar & Oeldorf-Hirsch: https://papers.ssrn.com/abstract=2757465
- AHRQ teach-back: https://www.ahrq.gov/sites/default/files/publications2/files/health-literacy-universal-precautions-toolkit-3rd-edition.pdf (Tool 5)

**Platform and vendors**
- TestFlight: https://developer.apple.com/testflight/
- Expo, TestFlight: https://docs.expo.dev/submit/testflight/
- App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Product page optimization: https://developer.apple.com/app-store/product-page-optimization/
- Userbrain pricing: https://www.userbrain.com/en/pricing
- Lyssna pricing: https://help.lyssna.com/en/articles/4953377-lyssna-pricing
- Prolific study cost: https://researcher-help.prolific.com/en/articles/445129-study-cost
- SplitMetrics-style tests: https://appscreenshotstudio.com/glossary/splitmetrics

**Repo (read for this brief)**
- `docs/personas.md`, `docs/nyx-research-v1_0.md`, `docs/vet-report-discovery.md`, `docs/research/2026-06-vet-council-nyx-deep-dive.md`, `docs/research/2026-07-vet-report-first-artifact-review.md`
- `docs/sessions/2026-09-05-home-v2-discovery.md`, `docs/nyx-vet-visits-requirements.md` §0.2, `.claude/commands/design-critique.md`, `.claude/workflows/design-critique.js`, `.claude/agents/pm-feature-review.md`, `.claude/agents/vet-report-cold-read.md`
- `docs/nyx-onboarding-requirements.md`, `app/(auth)/*`, `app/onboarding/*`, `components/onboarding/ValuePreview.tsx`, `lib/signalCopy.ts`
- `docs/app-review-notes.md`, `docs/store-listing-copy.md`, `docs/store-screenshot-plan.md`, `scripts/store-screenshots/README.md`, `scripts/layout-probe/README.md`, `scripts/design-critique/render.mjs`, `docs/device-pass-fixture-runbook.md`, `docs/legal/privacy-policy.md`
- `docs/sessions/2026-10-11-cul-552-consent-schema.md`, `docs/sessions/2026-10-02-release-qa-1-2-0.md`, `docs/sessions/2026-10-10-cul-1762-competitive-landscape-refresh.md`
- Linear: [CUL-552](https://linear.app/projectnyx/issue/CUL-552) and the App Store Launch project (read only).
