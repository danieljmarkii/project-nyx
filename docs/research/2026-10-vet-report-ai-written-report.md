# An AI-written vet report? Evidence on LLM clinical summaries, data-to-text precedent and "AI writes, rules hold" guardrails

**Date:** 2026-10-11 · **Status:** 🧊 frozen point-in-time evidence, re-verify at use (append-only; corrections land as a dated §V at the foot with inline ⚠ pointers, per CLAUDE.md § Documentation Update Protocol) · **Commissioned by:** the PM's vet-report AI question: *"Our vet report is not AI generated, which has merits, but a templated report has downsides too (it is very wordy). Is there a best-of-both-worlds report generated via AI that keeps the guardrails that already exist in the current way we create the report?"* · **Informs (no edit proposed):** `docs/nyx-vet-report-requirements.md` §5 (honesty rules) and §6–§7 (immutability, architecture) · **Out of scope (researched elsewhere, not redone):** the visual design of clinical one-pagers; how a client document enters a clinic.

**Method.** One analyst pass on 2026-10-11. Web search, then first-party fetches of papers, abstracts, product pages and help docs. In-repo reads of the report spec, the Signal and Patterns phrasing pipeline (`supabase/functions/generate-signal/`), the report renderer, the July first-artifact review and the October competitive brief. The shared web-search budget ran out near the end of the pass; §10 lists what that left unverified.

**Evidence tags.** `[E]` verified against a source fetched this pass, with design and n where the source gives them · `[E†]` verified only through a search-index excerpt of the cited page, because the page blocked or failed a fetch · `[A]` reasoned assumption, synthesis or arithmetic by the analyst · `[C path:line]` in-repo code or document read this pass. This brief records evidence. It makes no product decision.

**Honesty-rule codes used throughout** (spec §5, abbreviated):

| Code | Rule |
|---|---|
| R1 | A denominator and a window on every count ("9 episodes / 52 d, 48 of 52 d logged") |
| R2 | Associational, never causal |
| R3 | Absence is not wellness: no "all clear", gaps called out |
| R4 | Blood and foreign material render only when present, never as "0 of N" |
| R5 | Frequency over severity: severity is never averaged |
| R6 | Every page-1 number traces to an appendix line |
| R7 | No load-bearing colour |
| R8 | No assessment or plan |
| R9 | "Intake not directly observed" verbatim for free-fed pets; a refusal is never "picky" |
| R10 | An n=1 AI photo read may escalate on a red flag, never reassure |

---

## Executive summary

1. **Omission is the most common LLM error; fabrication and negation are the most dangerous.** By count, omissions dominate: 86% of errors in GPT-4 SOAP notes (Kernberg 2024); 47% of GPT-4 emergency-department summaries had at least one (Williams, PLOS Digit Health 2025); 52% of inaccuracies in GPT-4 patient-friendly discharge rewrites (Zaretsky 2024). By severity, fabrication leads: 44% of hallucinations were "major" against 17% of omissions, and 30% of hallucinations were negations, mostly in the Plan section (Asgari 2025, 12,999 annotated sentences) `[E]`. Equal quality ratings can hide extra errors: LLM discharge narratives were rated the same as physicians' (3.67 vs 3.77) but carried 2.91 errors each against 1.82 (Williams, JAMA Intern Med 2025, 22 blinded attendings) `[E]`. *Citation correction:* the "Williams 2024, JAMA Netw Open" on the candidate list is two UCSF papers, in PLOS Digital Health and JAMA Internal Medicine. The 2024 JAMA Network Open discharge-summary study is Zaretsky et al.
2. **Compression strips qualifiers.** Three of ten LLMs generalized beyond their source in 26–73% of summaries. Asking them to "be accurate" raised the odds (OR 1.90), and temperature 0 lowered them. Claude models did not differ significantly from the source texts (Peters & Chin-Yee 2025, 4,900 summaries) `[E]`. Three LLMs kept clinical uncertainty cues less than half the time (Du 2026, 1,200 documents) `[E]`. Culprit's honesty rules are mostly qualifier clauses (window, coverage, "associational", "not directly observed"), so these clauses are what a shortening rewrite would lose first `[A]`.
3. **LLMs still get numbers wrong when they write from data.** Open LLMs put at least one semantic error in 76–86% of zero-shot data-to-text outputs, and GPT-3.5 did so in 61%; contradicting the data was the dominant error (Kasner & Dušek 2024). Numbers were the largest error class in neural sports summaries: 184 of 418 errors (Thomson & Reiter 2020). LLM-derived averages from patient-generated data were off by 2.7–4.0% on average (Pakianathan 2026) `[E]`. No head-to-head of 2026 frontier models on data-to-text was found `[A]`.
4. **In the data-to-text precedent, rules won on faithfulness and human writers won on narrative.** Neonatal ICU staff chose better actions from expert-written text than from graphs, yet preferred graphs (Law 2005, n=40). BabyTalk's generated text matched graphs (decision score 0.34 vs 0.33) but trailed human text (0.39). Its gaps were narrative: continuity, grouping related signals, the long-term overview and time. Content selection was "perhaps one of the hardest aspects" (BT-45, 35 clinicians, 24 scenarios) `[E]`. Weather forecasts written by consistent data-to-word rules were preferred to human forecasts (SumTime-Mousam 2005) `[E]`.
5. **Much of the wordiness has deterministic causes.** The July cold read traced most of the first artifact's 18 pages to one-row-per-feeding appendix rows (about 10–11 pages) and about 23 repeated disclaimer strings. The grouping and a single "AI read · unconfirmed" chip have since shipped, and the persona cold read (not a real vet) judged the trimmed version *more* trustworthy `[C docs/research/2026-07-vet-report-first-artifact-review.md:34,40; render.ts:117–124]`. The documented LLM gains are concision and coherence, at a cost in comprehensiveness: 4.01 vs 3.70 on concision, 3.72 vs 4.13 on comprehensiveness (Williams 2025) `[E]`.
6. **Verifiers check what is said, imperfectly. They cannot see what is missing or what is merely misleading.** The best entailment checkers reach about 75% balanced accuracy on LLM-AggreFact (GPT-4 75.3; MiniCheck 74.7; AlignScore 70.4). Between 50% and 90% of LLM medical answers are not fully supported by the sources they cite (SourceCheckup) `[E]`. Anthropic's Citations feature guarantees only valid pointers to source spans, and it cannot be combined with structured outputs `[E]`. R3, R4 and R8 forbid sentences that are true but misleading, and an entailment check passes those by design `[A]`.
7. **Catching omissions needs a must-include list, and even a list is necessary but not sufficient.** Forcing every schema field, with "[NOT MENTIONED]" for empty ones, cut major omissions from 61 to 0 (Asgari 2025) `[E]`. Culprit has already built "AI writes, rules hold" for the Patterns summary: the model may only join already-true sentences, and any new number or any causal, reassuring, preference or disease word sends it back to the template. Adversarial passes then showed that a tail can undo a verbatim safety lead without a single screened word ("Pixel ate everything this morning."). Safety summaries are therefore template-only by PM ruling ([CUL-1630](https://linear.app/projectnyx/issue/CUL-1630), 2026-10-07), and model phrasing of the summary ships switched off `[C summary.ts:45–52, 675–690; index.ts:278–283]`.
8. **A generated report would have to be generated once and frozen.** One prompt at temperature 0 produced 80 distinct completions in 1,000 runs (Thinking Machines 2025). Only 52.9% of note elements were correct in all three replicate runs (Kernberg 2024). The current Claude Opus and Fable models reject a `temperature` parameter outright `[E]`. The spec already defines an immutable stored snapshot, but the deployed `generate-report` v55 stores nothing `[C nyx-vet-report-requirements.md:183; culprit-competitive-landscape-2026-10.md:172]`.
9. **Rivals' AI-written pet reports carry disclaimers but break rules Culprit enforces.** ThePawcess prints "Generated by AI from 81 daily logs · supports your veterinarian's workup, never diagnoses" above a "96% compliance" figure that counts days logged (81 of 84), plus an averaged itch-severity fall from 4.2 to 0.8. CompanAIn ships a "Multi-Diagnosis Reasoning Agent". PETKIT's Kitbo report page says it helps "vets reach a diagnosis sooner" and carries no disclaimer `[E]`. Vendors of clinic-side AI scribes tell vets to review notes before they enter the record, and none publishes a comparable accuracy figure `[E]`.
10. **Vets use AI heavily and worry about its accuracy. An "AI" label costs a little trust; automation bias costs more.** 83.7% of 1,730 US and Canadian veterinary professionals use AI (2026; 39.2% in 2024), and reliability or accuracy is their top concern (67.4%; 70.3% in 2024) `[E]`. AI labels lower ratings modestly: −0.13 points of satisfaction on a 5-point scale, and −2.7 percentage points of perceived accuracy, mostly because readers assume no human checked the text `[E]`. No study of vets reading AI-labelled client documents was found. Wrong AI cues cut clinicians' accuracy by 11 percentage points (n=457) and novice radiologists' by 60 (n=27) `[E]`.
11. **Handoff research says to lead with a one-sentence problem representation, but its best-evidenced parts are clinician judgments.** I-PASS puts illness severity first, then a summary statement; it cut medical errors by 23% and preventable adverse events by 30% across 10,740 admissions. Training norms ask for one sentence in "semantic qualifiers" (acute vs chronic, recurrent, single vs multiple) `[E]`. Severity, assessment and recommendation collide with R8. The part Culprit can compute is onset, recurrence, frequency, duration, coverage and counted direction `[A]`.
12. **No US law was found that squarely governs an owner-made pet report. The legal edges are attribution and capability claims.** California AB 3030 covers human health facilities and exempts clinician-reviewed text. California AB 489, operative 2026-01-01, bars AI wording that implies the "care, advice, reports, or assessments" come from a licensee; whether it covers veterinary licensees is unconfirmed. FTC guidance requires evidence for claims about what AI can do. Federal transparency rules for health-IT AI (HTI-1) are proposed for repeal (HTI-5). Veterinary bodies (AAVSB, BVA) ask for transparency and keep the vet responsible `[E]`/`[E†]`.

---

## 1. LLM-written clinical summaries: accuracy and dominant error types

### 1.1 The studies side by side

| Study (venue) | Task | Design · n | Model | Headline | Error mix |
|---|---|---|---|---|---|
| Van Veen et al. 2024 (*Nat Med*) | Text to text: radiology impressions, patient questions, progress-note problem lists; doctor-patient dialogue scored by metrics only | 8 LLMs × 4 tasks (6 datasets). Reader study: 10 physicians (5 radiologists, 5 hospitalists); 100 inputs per task × 3 tasks; blinded A/B against "medical expert" summaries written in routine care | Best: GPT-4 with in-context learning | Model equivalent 45%, preferred 36%, expert preferred 19%. Summaries were short (15–47 tokens) `[E]` | Fabricated information, model vs expert: misread ambiguity 6% vs 9%; changed a fact 2% vs 4%; invented a fact 5% vs 12%. Potential-harm likelihood and extent: expert 14% and 22%, model 12% and 16%. The model still "missed historical context (a history of HTN)" in one case `[E]` |
| Williams et al. 2025 (*PLOS Digit Health*; preprint April 2024) | ED encounter notes to summaries | Cross-sectional; 100 random UCSF ED visits, 2012–2023 | GPT-4 and GPT-3.5, temperature 0 | GPT-4: 33% of summaries error-free; 47% after excluding redaction artefacts and return-precaution text `[E]` | Share of GPT-4 summaries with at least one error: inaccuracy 10%, hallucination 42%, omission 47% (GPT-3.5: 36%, 64%, 50%). Hallucinations clustered in the Plan and Other sections; omissions in the physical exam. Mean potential harm 0.57 on a 0–7 scale; the worst error, a hallucinated diagnosis (vertigo for migraine), scored 6 `[E]` |
| Williams et al. 2025 (*JAMA Intern Med* 185(7):818–825) | Hospital-course narratives in discharge summaries | Cross-sectional; 100 inpatient stays; 22 attendings, blinded, duplicate review | LLM (per abstract) | Quality 3.67 vs 3.77 (P=.21); preference not different; LLM more concise (4.01 vs 3.70) and coherent, less comprehensive (3.72 vs 4.13) `[E]` | Errors per narrative 2.91 (LLM) vs 1.82 (physician); harm per error equal (1.35 vs 1.34); narrative-level harm 0.84 vs 0.36 (P<.001) `[E]` |
| Zaretsky et al. 2024 (*JAMA Netw Open* 7(3):e240357) | Discharge summary to patient-friendly rewrite | 50 summaries, 100 reviews | GPT-4 (Azure) | Reading grade 11.0 → 6.2; understandability 13% → 81% `[E]` | Top-box accuracy in 54 of 100 reviews; "entirely complete" in 56; safety concerns in 18. Of the inaccuracies, omissions were 52.1% and hallucinations 8.7% `[E]` |
| Asgari et al. 2025 (*npj Digit Med* 8:274; authors from Tortus, the vendor) | Primary-care consultation transcript to clinical note | 18 experiments × 25 transcripts (PriMock); 12,999 note sentences and 49,590 transcript sentences, each pair labelled by at least 2 of 50 doctors | GPT-4 (32k-0613) | Hallucinations in 1.47% of note sentences (191); omissions of 3.45% of transcript sentences (1,712) `[E]` | 44% of hallucinations major vs 16.7% of omissions. Hallucination types: fabrication 43%, negation 30%, contextual 17%, causality 10%; most often in the Plan section (about 20%) `[E]` |
| Kernberg et al. 2024 (*JMIR* 26:e54419) | Audio of simulated encounters to SOAP notes | Comparative; 3 replicate generations per case | GPT-4 | 23.6 errors per case; notes "do not meet the standards required for clinical use" `[E]` | Omissions 86%, additions 10.5%, incorrect facts 3.2%. Only 52.9% of data elements were correct in all 3 replicates; accuracy fell as the transcript lengthened `[E]` |
| Tang et al. 2023 (*npj Digit Med* 6:158) | Cochrane review to evidence summary | 53 reviews across 6 clinical domains; 6 domain experts | GPT-3.5, ChatGPT | Best configuration had factual inconsistency in under 10% of summaries `[E]` | The taxonomy includes "certainty illusion": a summary more or less certain than its source. The human-written comparators had 28% fabricated errors `[E]` |
| Hegselmann et al. 2024 (CHIL) | Patient-facing hospital summaries | 100 doctor-written and 100 generated summaries annotated | GPT-4, Llama 2 | Hallucinations per summary: GPT-4 0.70 → 0.40 with hallucination-free examples; Llama 2 2.60 → 1.55 after fine-tuning on cleaned data `[E†]` | Standard metrics did not track faithfulness `[E†]` |

### 1.2 What dominates: omission by count, fabrication and negation by severity

- Every study above that separates the two finds omission is the more frequent error: Kernberg 86% of errors; Zaretsky 52% of inaccuracies; Williams (ED) 47% of summaries; Asgari 1,712 omissions against 191 hallucinations `[E]`.
- Severity runs the other way. In Asgari, 44% of hallucinations were major against 16.7% of omissions. Negation errors (30% of hallucinations) were "the most concerning", mostly in the Plan section, contradicting what was said in the consultation `[E]`. Williams (ED) found the single worst error was a hallucinated diagnosis `[E]`.
- Fabrication rates can be lower than human comparators' when the inputs are short and the outputs very short (Van Veen; Tang). The longer-narrative studies (Williams JAMA IM; Kernberg) show more errors than physicians, or than the clinical standard `[E]`.
- *Causality* hallucinations (10% in Asgari) are the class R2 targets; *negation* hallucinations are the class R3, R4 and R10 target `[E]`/`[A]`.

### 1.3 Lost hedges and qualifiers

- **Overgeneralization.** Peters & Chin-Yee (*R Soc Open Sci* 2025) compared 4,900 summaries from 10 LLMs against 200 abstracts and 100 full articles. Generalization was coded as restating quantified results as unquantified generics, shifting past-tense findings to present tense, and turning descriptive findings into recommendations; omitted qualifiers were treated as one route to broader claims. Three models (DeepSeek, ChatGPT-4o, LLaMA 3.3 70B) overgeneralized in 26–73% of cases. LLM summaries were more likely than NEJM Journal Watch summaries to generalize (OR 4.85). An "accuracy" prompt *raised* the odds (OR 1.90), and temperature 0 cut them by about 76%. Claude models did not differ significantly from the source texts `[E]`.
- **Certainty.** Tang 2023 defines a "certainty illusion" error, in which a summary is more or less certain than the evidence `[E]`. Du, Lu & Qu (MLHC 2026) built 1,200 clinical documents with 9,184 uncertainty annotations at 5 levels; three LLMs preserved the original uncertainty cues "less than half the time" and confused adjacent levels `[E]`. The abstract does not say whether hedges collapse into assertions or the reverse (§10).
- **Framing variability.** Goodman, Yi & Morgan (*JAMA* 2024, Viewpoint) argue that "variation in LLM-generated summaries could exert important and unpredictable effects on clinician decision-making" and note the absence of FDA oversight `[E]`. Their worked example, a summary that added "fever" to a report mentioning chills and cough, was verified only through secondary coverage `[E†]`.
- **Mapping to Culprit** `[A]`: R1's window and coverage clauses, R2's "associational", R3's gap callouts and R9's verbatim "Intake not directly observed" are all qualifier-class text. The studies above show that LLM condensation deletes or strengthens exactly this class.

### 1.4 Numbers

- **Neural data-to-text, pre-LLM.** Thomson & Reiter (INLG 2020) annotated 21 basketball summaries (3 annotators each) and found about 20 accuracy errors per story: 418 errors, of which 184 were numbers, 105 names, 80 words and 19 context (a true phrase that leads to a wrong inference). The standard automatic metric recalled only 34% of the number errors `[E]`.
- **LLM data-to-text.** Kasner & Dušek (ACL 2024) tested open LLMs (Llama 2, Mistral, Zephyr) and GPT-3.5, zero-shot, on fresh structured records from five domains. By human annotation, 76–86% of open-model outputs and 61% of GPT-3.5 outputs contained at least one semantic error; a GPT-4 checker found 89–94% and 76%. Statements contradicting the data dominated: more than two per output for the open models. The weather domain was hardest, with more than 8 errors per output `[E]`.
- **LLM-computed aggregates from patient-generated data.** Pakianathan et al. (arXiv 2026; HCI study, 16 health professionals, synthetic data, model not named) found that averages derived by the LLM differed from ground truth by 3.96% on average in summaries (median 0.47%) and by 2.68% in chat (median 1.57%). Trends and minimum/maximum values had no discrepancies `[E]`.
- **Adversarial elaboration.** Omar et al. (*Commun Med* 2025) planted one fabricated detail in each of 300 physician-validated vignettes. Six LLMs elaborated on it in 50–82% of 5,400 outputs; a mitigation prompt cut the mean from 66% to 44%, and temperature 0 did not help `[E]`. This bears on any owner free text routed through a model `[A]`.
- **In-repo.** Culprit's Patterns-summary validator extracts every number, digit or spelled out, and rejects any value not in the deterministic packet. Its word map was widened after an adversarial pass found that "thirteen days" escaped a zero-to-twelve map `[C summary.ts:105–109]`.

### 1.5 Variability between runs

- Kernberg 2024: only 52.9% of data elements were correct in all three replicate generations of the same case `[E]`.
- Atil et al. (arXiv, v5 April 2025): 5 models on 8 tasks, 10 runs each, "configured to be deterministic". Accuracy varied by up to 15% between identical runs, the best-to-worst gap reached 70%, and no model was consistently repeatable `[E]`. Mechanism and fixes are in §3.h.

### 1.6 Corrections to the candidate list

- "Williams et al. 2024, *JAMA Network Open*" was not found. The UCSF group's ED-summary study (Christopher Y.K. Williams et al.) appeared in *PLOS Digital Health*, 2025 (medRxiv preprint April 2024). Its hospital-course study appeared in *JAMA Internal Medicine*, 2025 `[E]`.
- The 2024 *JAMA Network Open* study of GPT-4 discharge summaries is **Zaretsky et al.** (NYU) `[E]`. A separate October 2025 *JAMA Network Open* paper (Song et al., Y-KNOT-EDN) and its commentary concern a locally hosted model for ED discharge notes `[E]`.
- Asgari et al. 2025 is real; its authors are employed by Tortus, the vendor whose tool was evaluated `[E]`.

### 1.7 Limits of transfer to Culprit `[A]`

- Most studies are **text-to-text** (transcripts or notes to summaries). Culprit's report is **data-to-text**: counts, windows and flags computed from structured logs. Data-to-text error evidence (§1.4) is older (2020–2024 models).
- None of the studies is veterinary, and none uses owner-generated logs.
- Models have changed since most of these studies ran (GPT-4 era). The direction of the error mix (omission-heavy, qualifier loss) is consistent across 2023–2026 papers. Absolute rates for 2026 frontier models were not found.

---

## 2. Data-to-text precedent

### 2.1 BabyTalk BT-45 and the text-versus-graph experiments

- **Law et al. 2005** (*J Clin Monit Comput* 19:183–194): 40 NICU staff, 8 from each of 5 groups (junior, intermediate and senior nurses; junior and senior doctors), chose from 18 actions for scenarios shown as trend graphs or as expert-written text covering about 40 minutes of physiology. The text described the data but did not interpret it. Participants chose **more appropriate actions from text**; speed did not differ; staff groups did not differ; and **most participants preferred the graphs** `[E]`.
- **BT-45** (Portet et al. 2009, *Artif Intell* 173:789–816) generated text from about 45 minutes of signals and events in four stages: signal analysis, data abstraction, document planning (content selection) and microplanning/realisation. In an off-ward NICU experiment, expert text beat graphs and **BT-45 text matched graphs**; BT-45 was weaker on "temporal information" and "good narratives" `[E]`.
- **The same experiment in detail** (Reiter, Gatt, Portet & van der Meulen, INLG 2008): 35 clinicians (junior and senior nurses and doctors), 24 scenarios, 18 action types, 8 scenarios per condition in a Latin square, 3 minutes per decision. Mean scores: **human text 0.39, BT-45 text 0.34, graphs 0.33** (BT-45 vs graphs not significant); the biggest differences were among junior nurses. BT-45 matched human text on 5 of 8 target-action types and lost on 3: adjust monitoring equipment (0.22 vs 0.59), manage temperature (0.33 vs 0.55) and no action (0.43 vs 0.61). Content overlap between BT-45 and the human texts was low (MASI 0.21) `[E]`.
- **Why the template text lost** (same paper) `[E]`:
  - Rule-based content selection gave low importance to sensor artefacts, so the text failed when the right action was to fix the sensors.
  - It described each channel independently: 18 BT-45 paragraphs mentioned only one of the two temperatures, against 3 in the human texts.
  - It gave a poor long-term overview in uneventful scenarios.
  - Its communication of time was poor.
  - Its "continuity" broke when intermediate events were omitted: readers complained that a value "decreased to 9.3" after the last mentioned value was 8.1.
  - Discourse analysts judged that the human texts had "much better narrative structures" and that BT-45 lacked any conclusion.
  - Readers asked for bullet lists, "especially for lab results".
  - Deciding "which events need to be explicitly mentioned … and which can be omitted … is perhaps one of the hardest aspects of data-to-text."
- **"When a graph is poorer than 100 words"** (van der Meulen et al. 2010, *Appl Cogn Psychol* 24:77–89) is the full report of this experiment. Its abstract and full text could not be fetched (§10); the numbers above come from the companion paper by the same group `[E]`.

### 2.2 BT-Nurse

- Hunter et al. 2012 (*Artif Intell Med* 56:157–172): drafted partial nursing shift summaries (respiratory and cardiovascular) from the electronic record, run for **2 months** under supervision at the Royal Infirmary of Edinburgh NICU. Nurses judged **90% understandable, 70% accurate, 59% helpful**, and wanted more content. Data designed for display to staff was hard to process `[E]`.

### 2.3 Weather text

- **SumTime-Mousam** (Reiter et al. 2005, *Artif Intell* 167:137–169): human forecasters differed in which words they chose for the same data and in what they meant by the same word. The generator used consistent data-to-word rules and avoided words used by few writers or interpreted differently. Forecast users **preferred its texts to human-written forecasts**, partly because of word choice; the authors call this possibly the first evaluation showing generated text beating human text `[E]`.
- **Met Office with Arria** (Sripada et al., INLG 2014): about 5,000 UK site forecasts, about 15,000 texts in under a minute, later 10,000 sites over 5 days. The machine text sits **at the top of the forecast table**. It went to a public beta only after **two years of internal expert assessment**, and the authors name "the high resource cost of quality assurance when delivering texts at such scale" `[E]`.
- **Met Office Shipping Forecast with AWS** (2025; a secondary ZenML write-up of an AWS talk): fine-tuned Amazon Nova models reached 52–62% word-level F1 against expert forecasts (Claude 3.7 Sonnet 57%). Feeding **pre-banded categorical values** instead of continuous numbers improved scores by 25.4% on average, and the team rejected BERTScore because it rated "north" and "south" 82% similar. The write-up judges that this accuracy "would require human review" before operational use `[E]` (secondary source).

### 2.4 Commercial data-to-text and the field's current hybrid position

- **Arria** markets "Arria Author" (deterministic plus human-authored content) and "Author+" (adds "large language model summaries from trusted sources"), and claims "rules-based, deterministic language models ensure reliable and trustworthy insights" `[E]` (vendor page).
- **Arria Intelligence** (planned release; Business Wire, 2026-07-23) describes a "visible trust profile" on every output: "verified deterministic output, governed hybrid narrative, governed LLM context, and governed human-authored commentary". It claims "100% factually accurate, 100% of the time", which is the vendor's assertion and was not independently tested `[E]`.
- **Reiter's 2025 book preprint** (partially read) proposes using "algorithms and rules to find patterns and generate insights, and a neural model to select and express insights" `[E]`.
- **A template-first neural pipeline** (Kasner & Dušek, ACL 2022): one handwritten template per fact, then neural ordering, aggregation and paragraph compression. On E2E, omissions and hallucinations measured by an NLI checker were about 0.001 per triple or example, against 0.016 and 0.083 for an end-to-end baseline, with better fluency than templates alone. Named problems: "over-eager sentence fusion may change the semantics", and hand-built templates limit scale `[E]`.

### 2.5 What made these systems trustworthy, what clinicians preferred, and where they decided better

- **Trust came from** `[E]`/`[A]`:
  - **Content selection by explicit rules over detected events.** Every sentence maps to a detected event (BT-45) `[E]`.
  - **Consistent word choice.** Each data value maps to one word, and words with variable meanings are removed (SumTime) `[E]`.
  - **Text placed beside its data.** The Met Office text sits at the top of the data table `[E]`.
  - **Long expert QA before release** (Met Office: two years) `[E]`.
  - Together these give traceability by construction: every word has a rule and an input `[A]`.
- **Preference did not equal performance.** Clinicians preferred graphs but chose better from human-written text (Law). Generated text matched graphs, and better narrative was the stated path to matching human text (BT-45). Nurses rated generated summaries highly for understandability but much less for helpfulness (90% vs 59%) and asked for more content (BT-Nurse) `[E]`.
- **The trade** `[A]`: templates were faithful but weak on narrative (continuity, grouping, overview, time). LLMs are rated high on concision and coherence (Williams 2025; Van Veen 2024) but are weak on faithfulness and completeness (§1). The literature does not show both strengths in one free-generation system. The hybrids that exist (Kasner 2022, Arria, Reiter's proposal) keep facts and selection rules deterministic and give the model language work only.

### 2.6 What this means for a "graphs vs words" redesign (evidence only)

- Text supported better decisions than graphs in both NICU experiments **when the text was good narrative written by experts**. Generated text only matched graphs `[E]`.
- Readers' stated preference (graphs) and their decision quality (text) diverged, so preference surveys alone would mislead a redesign `[E]`/`[A]`.
- Readers asked for bulleted structure for discrete results (BT-45). In radiology, both referring clinicians and radiologists preferred **itemized** reports for complex examinations (Bosmans et al. 2011, *Radiology*, 873 respondents) `[E]`.
- Deployed precedent pairs a short text with its data: the Met Office puts the text on top of the table `[E]`.
- No evidence was found that an **LLM** narrative beats a well-designed deterministic narrative plus graphs for decisions. The only randomized evidence found compares human text, rule-based text and graphs `[A]`.

---

## 3. Guardrail architectures for "AI writes, rules hold"

### 3.0 In-repo precedent: Culprit has already built and partly rolled back this pattern

- **Signal phrasing** `[C generate-signal/index.ts:129, 160–262; phrasing.ts:1200–1246]`:
  - Model: Claude Haiku 4.5.
  - Input: one already-verified finding as JSON, through a forced tool call (`phrase_insight`).
  - System prompt: "You do NOT decide whether the finding is true … You may not add any fact, number, food, symptom, cause, or reassurance that is not in the JSON".
  - Output check: `validatePhrasing`, with a template fallback on validation failure, API error, missing key or flag off.
- **Lanes the model never phrases** `[C index.ts:164–215]`: reflections, worsening, chronicity, all the timing lanes, trial response, gap-shortening, the incident red flag, weight loss, the refused-then-vomited intake card and joint correlation candidates. The stated reason: drift into reassurance, mechanism or food attribution that "validatePhrasing's keyword screen cannot reliably catch by paraphrase", and "The keyword screen can catch a causal verb; it cannot count proteins or notice a missing one."
- **Patterns summary** `[C summary.ts:1–52, 675–690; index.ts:270–290]`:
  - "LLM as Phraser, never Analyst": the model is handed the already-true draft sentences and asked only to join and smooth them.
  - `validateSummary` rejects any number not in the packet, any reassurance (including on absence), any causal claim, preference framing or disease name, and on a safety summary any text that does not open with every safety clause verbatim ([CUL-1618](https://linear.app/projectnyx/issue/CUL-1618)).
  - The adversarial record: a lexical "an ask appears somewhere" check let a model move the ask onto the wrong sign, drop one of two concerns, negate the ask, or soften it, and still pass. The verbatim-lead rule is "NECESSARY, NOT SUFFICIENT": a tail can undo the lead in meaning without a screened word ("Pixel ate everything this morning.", "Skip the appointment for now.").
  - The outcome: safety summaries are template-only permanently ([CUL-1630](https://linear.app/projectnyx/issue/CUL-1630), 2026-10-07), and the summary's model phrasing is off (`SUMMARY_MODEL_PHRASING_ENABLED` is false, pinned by a test) `[C summary.test.ts:650]`.
- **Net position, per the October brief:** model text reaches owners on 2 of 13 detector types; the summary and the report are template-only; and "never reassures, by construction" is **lexical** rather than structural for the model-phrased types `[C culprit-competitive-landscape-2026-10.md:167, 210]`. The brief also notes that the "picky" screen is three words, so "choosy" or "lost interest" would pass `[C :282]`.

### 3.a A deterministic draft with an LLM copy-editor under a diff constraint

- **Evidence for:**
  - Template-first pipelines kept omissions and hallucinations near zero while improving fluency (Kasner & Dušek 2022, §2.4) `[E]`.
  - Culprit's Patterns summary is this pattern, with number-set grounding `[C]`.
  - Rewritten narratives gain concision and coherence (Williams 2025) `[E]`.
  - Claude models did not overgeneralize relative to their source (Peters 2025) `[E]`.
- **Failure modes:**
  - Sentence fusion can change meaning (Kasner 2022) `[E]`.
  - LLM editors over-correct and do not keep to minimal edits (Fang et al. 2023, grammatical error correction) `[E]`.
  - Rewriting for readability or brevity drops content: omissions were 52% of inaccuracies (Zaretsky 2024); simplified radiology reports contained incorrect statements, missing information and potentially harmful passages (Jeblick et al. 2024, 15 radiologists) `[E]`; qualifiers are lost (§1.3) `[E]`.
  - Meaning can be reversed without any screened word ([CUL-1618](https://linear.app/projectnyx/issue/CUL-1618)) `[C]`.
- **What a diff constraint can check deterministically** `[A]`: that only deletion, merge and reorder operations occurred; that the multiset of numbers and named entities is unchanged; that locked spans survive byte-for-byte. **What it cannot check** `[A]`: whether a merge or reordering created an implicature such as cause or recovery, or whether a deletion removed meaning that mattered.

### 3.b A fact sheet only: each sentence cites fact IDs, a verifier checks, a template sentence prints on failure

- **Evidence for:**
  - Proposition-level checking of LLM text against a patient record agreed with an adjudicated clinician reference up to 92.7% of the time, against at most 88.5% between clinicians (VeriFact, Stanford, arXiv 2025) `[E]`.
  - Anthropic Citations returns `cited_text` and locations (character, page or content-block indices). "Citations are guaranteed to contain valid pointers to the provided documents". A *custom content* document is not re-chunked, so one block per fact gives citations at fact granularity `[E]`.
  - Schema-forced coverage removed major omissions (Asgari) `[E]`.
  - LLM-as-judge on clinical summaries reached ICC 0.818 with human raters on PDSQI-9 (Croxford et al. 2025, *npj Digit Med*) `[E†]`.
- **Failure modes:**
  - A valid pointer is not support. The Citations docs promise pointer validity only `[E]`. In SourceCheckup (Wu et al. 2025, *Nat Commun*; 7 LLMs, 800 questions, about 58,000 statement–source pairs), 50–90% of answers were not fully supported by their cited sources, and about 30% of GPT-4o-with-search statements were unsupported `[E]`.
  - Entailment checkers err about one time in four (§3.f), and negation ("inversion") is a named inconsistency type they must catch `[E]`.
  - Sentences that are true but misleading pass an entailment check. Thomson & Reiter's "context" errors, and Reiter's "misleading use of words", are accuracy errors that per-fact checks do not see `[E]`. R3 and R4 are rules of exactly this kind: "no blood seen in 6 reads" is entailed by the facts and still breaks R4 `[A]`.
  - Asgari's "atomisation" step, in which the LLM extracted facts before writing, *raised* major hallucinations from 4 to 25 `[E]`. Culprit's facts would be computed rather than extracted, which avoids that step `[A]`.
  - Citations cannot be combined with structured outputs: requesting both returns a 400 `[E]`.
  - Per-sentence fallback mixes registers within a paragraph `[A]`.

### 3.c Selection, not generation (the LLM picks and orders pre-approved sentences, findings or charts)

- **Evidence for:**
  - Woebot, a health chatbot, used only scripted content: "Everything Woebot says has been written by conversational designers", with NLP "only in the service of better understanding a user's written texts" and a rules engine resembling a decision tree (IEEE Spectrum 2024). In its 2023 trial of LLM augmentation, a full transcript review found "no concerning LLM-generated utterances" `[E]`.
  - Structured-output enums make a choice schema-valid (§3.e) `[E]`.
  - Content selection is the decisive step in data-to-text: BT-45's losses traced to its selection rules `[E]`.
- **Failure modes:**
  - Selection is not automatically faithful. In 1,600 extractive summaries from 16 systems, 30% had broad unfaithfulness problems (wrong or incomplete coreference, wrong or incomplete discourse, other misleading juxtapositions), and 5 standard metrics correlated poorly with human judgement (Zhang, Wan & Bansal, ACL 2023) `[E]`.
  - Adjacency creates "context" errors (Thomson & Reiter) `[E]`, and omitted intermediates break continuity (BT-45) `[E]`.
  - LLMs use information at the middle of long inputs less well than at the start or end (Liu et al., *TACL*), a risk when ranking long candidate lists `[E]`.
  - An item that is deselectable can be omitted `[A]`.

### 3.d A labelled AI summary over an unchanged deterministic report

- **Evidence for:**
  - Provenance labelling by paragraph is a shipping commercial pattern (Arria's trust profile) `[E]`.
  - Clinic software already layers AI summaries over records: Digitail's intake summary is copied into the appointment notes and the SOAP note `[E]`, and Instinct's Document Summary links each finding to its source page `[C culprit-competitive-landscape-2026-10.md:113–119]`.
  - Abridge's "Linked Evidence" maps note text to the transcript and audio, and is available until the note is signed `[E†]`.
  - Disclosure lowered satisfaction only slightly (Cavalier 2025; §4.4) `[E]`.
- **Failure modes:**
  - **Anchoring and automation bias on whatever is read first.** Incorrect AI suggestions dropped novice radiologists' correct BI-RADS ratings from 79.7% to 19.8%, and very experienced readers' from 82.3% to 45.5% (Dratsch et al. 2023, *Radiology*, n=27). A systematically biased model cut clinicians' diagnostic accuracy by 11.3 percentage points, and explanations did not significantly mitigate it (Jabbour et al. 2023, *JAMA*, n=457). Variation in summaries can steer decisions (Goodman 2024) `[E]`.
  - The box can contradict the body `[A]`.
  - Clinic LLM summarizers increasingly read attached PDFs first (Provet, Instinct, Covetrus, Vetspire, CoVet), so a model-written box would itself become model input `[C culprit-competitive-landscape-2026-10.md:63, 119, 321]`.
  - The box inherits every failure mode of whichever writer (3.a–3.c) produces it `[A]`.

### 3.e Structured outputs or constrained decoding with enumerated claim types

- **Evidence for:**
  - Anthropic structured outputs "guarantee schema-compliant responses through constrained decoding". Enums of strings, numbers, booleans and null are supported. Exceptions: a refusal, `max_tokens`, and enum values that differ only in capitalization `[E]`.
  - Schema slots with an explicit "[NOT MENTIONED]" eliminated major omissions in Asgari's function-call experiments (61 → 0) `[E]`.
  - Format restrictions *help* classification accuracy (Tam et al. 2024) `[E]`.
- **Failure modes:**
  - Schema compliance is not truth. The docs promise format, not correctness `[E]`.
  - Strict formats, especially JSON-mode constrained decoding, degraded reasoning, and stricter formats did so more (Tam et al., arXiv 2024; EMNLP Industry) `[E]`.
  - Numeric `minimum`/`maximum` constraints are not supported `[E]`.
  - Structured outputs cannot be combined with Citations `[E]`.
  - A schema-valid choice can still be the wrong one (a wrong claim type or fact ID) `[A]`.
  - **API surface drift:** forced `tool_choice` (`any`/`tool`), which the Signal's Haiku 4.5 call uses today, returns a 400 on Claude Opus 5.5, Sonnet 5.5 and Fable 5.1. The Anthropic reference says to use `strict: true` tools with `auto`, or structured outputs `[E]` (Anthropic API reference bundled with Claude Code, cached 2026-10-06) `[C index.ts:231–236]`.
- **Relation to 3.c** `[A]`: if the claim types are a closed list and a deterministic renderer writes every word, the model's job reduces to selection (3.c). The format guarantee then holds, and wording risk is removed rather than screened.

### 3.f Verifier families

| Family | What it checks | Evidence | Known failure modes |
|---|---|---|---|
| Numeric and entity set checks | Every number, unit and entity in the output exists in the fact set | In-repo `validateSummary` number extraction, including spelled numbers `[C summary.ts:105–109]` | Blind to a correct number in the wrong sentence or on the wrong subject, and to vague quantifiers ("most days") `[A]`. Pre-LLM metrics recalled only 34–39% of gold number and name errors `[E]` |
| NLI / entailment (SummaC, AlignScore, MiniCheck) | Each output sentence is entailed by source sentences | SummaC-Conv reached 74.4% balanced accuracy on 6 datasets; the paper cites earlier work in which off-the-shelf NLI models scored 52%, barely above chance (Laban et al. 2022). On LLM-AggreFact: GPT-4 75.3, Claude-3 Opus 74.1, MiniCheck-FT5 74.7, AlignScore 70.4, SummaC-ZS 67.9, QAFactEval 66.5 (Tang, Laban & Durrett, EMNLP 2024) `[E]` | About 1 error in 4; weak on multi-sentence reasoning; "inversions (i.e., negation)" are a core inconsistency type to catch `[E]`. Passes true-but-misleading text `[A]` |
| QA-based (QAFactEval) | Questions generated from the output are answered the same from the source | 66.5 balanced accuracy on LLM-AggreFact `[E]` | Below NLI checkers on that benchmark `[E]` |
| Citation grounding | Each statement points to a source span | Anthropic Citations: valid pointers guaranteed `[E]` | Pointer is not support: 50–90% of answers not fully supported in SourceCheckup `[E]` |
| Proposition-level checking against a record (VeriFact) | Decomposes text into propositions and judges each against the record | Up to 92.7% agreement with an adjudicated clinician reference `[E]` | Checks what is stated, not what is absent `[A]` |
| LLM-as-judge | Rubric scores (accuracy, thoroughness, harm) | GPT-4 judges agreed with humans more than 80% of the time on chat (Zheng et al. 2023); a clinical summary judge reached ICC 0.818 (Croxford 2025) `[E]`/`[E†]` | Position, verbosity and self-enhancement bias (Zheng); evaluators recognize and favour their own generations, so self-checking is biased (Panickssery et al., NeurIPS 2024) `[E]` |
| Lexical screens (in-repo) | Banned words and phrases (causal, reassuring, "picky", disease names) | `validatePhrasing`, `validateSummary` `[C]` | Paraphrase escapes ("choosy"); meaning reversal without a banned word (CUL-1618) `[C]` |

A further measurement caution: semantic-similarity metrics can be blind to polarity. In the Met Office write-up, BERTScore rated "north" and "south" 82% similar `[E]` (secondary source).

### 3.g The omission problem

- **Why it is the hard half.** Every verifier family in 3.f evaluates the sentences that *were* produced. An omitted coverage clause or safety line produces no sentence to check `[A]`.
- **Must-include approaches with evidence:**
  - *Schema slots that must be filled or marked empty.* Asgari's function-call schema, with "[NOT MENTIONED]" for empty fields, cut major omissions from 61 to 0 and minor omissions from 130 to 54 `[E]`.
  - *Key-fact recall.* MED-OMIT splits a source into facts, finds which ones a summary omits, and weights each by its simulated effect on a differential diagnosis; its judgments broadly agreed with clinicians' (Schumacher et al., ML4H 2025) `[E]`. FineSurE scores completeness by aligning short "keyfacts" to summary sentences (ACL 2024) `[E†]`. DocLens measures claim recall against reference claims for medical text (ACL 2024) `[E†]`. PDSQI-9 includes a "Thorough" item that is sensitive to omissions `[E†]`.
  - *Verbatim locked clauses.* The in-repo safety lead must appear byte-for-byte ([CUL-1618](https://linear.app/projectnyx/issue/CUL-1618)). It is necessary but not sufficient, because a tail can still undo it `[C]`.
  - *Template-first generation.* When every required fact starts as a rendered sentence and the model may only reorder or fuse, omission rates near zero follow (Kasner 2022) `[E]`.
- **What remains unsolved** `[A]`: a checklist confirms that a clause is *present*, not that the surrounding text leaves its meaning intact. That is exactly where Culprit's adversarial passes ended (§3.0).

### 3.h Variability between runs, and keeping generated clinical text immutable

- **The mechanism.** Thinking Machines (Horace He, 2025-09-10) sampled 1,000 completions of one prompt at temperature 0 and got **80 unique outputs**. They attribute it to kernels that are not "batch-invariant": server load changes batch size, and batch size changes the arithmetic. Batch-invariant kernels made all 1,000 identical, at a cost (26 s → 42 s in one test) `[E]`.
- **Clinical consequence.** Only 52.9% of note elements were stable across three replicates (Kernberg 2024) `[E]`.
- **Claude API surface.** `temperature`, `top_p` and `top_k` are rejected with a 400 on Claude Opus 4.7, 4.8, 5 and 5.5 and on Fable. Non-default values are rejected on Sonnet 5.5 and Haiku 5.5. They are still accepted on Haiku 4.5 and the 4.6 models `[E]` (Anthropic reference cached 2026-10-06). The live Messages API reference's body-parameter list fetched this pass shows no `temperature` entry between `system` and `thinking` `[E]`.
- **How products freeze AI text** `[E]`/`[E†]`/`[A]`:
  - Scribe output is a *draft until a clinician signs*; after signing it is part of the record. Abridge's Linked Evidence is available until the note is finalized and signed `[E†]`. CoVet treats every output "as a draft until a qualified veterinary professional verifies and approves it" `[E]`.
  - Digitail copies the AI intake summary into the SOAP note when the record is opened `[E]`.
  - Culprit's spec already makes the vet report an immutable snapshot, with stored HTML and JSON and no updatable content fields `[C nyx-vet-report-requirements.md:153, 183]`. The October brief records that deployed v55 stores nothing and has no share link, so each generation re-renders `[C culprit-competitive-landscape-2026-10.md:172]`.
  - With a deterministic template, re-rendering the same inputs gives the same text. With model text, two renders of "the same report" can differ `[A]`.

---

## 4. Veterinary market

### 4.1 Owner-side products shipping or marketing AI-written, vet-facing documents

| Product | What is AI-written for the vet | Label and disclaimer, verbatim | Notable against Culprit's rules | Tag |
|---|---|---|---|---|
| **ThePawcess** (web; $39 per trial) | An end-of-trial "vet report" PDF, "Prepared for Dr. …"; sample labelled "Bailey AI-written" | "Generated by AI from 81 daily logs · supports your veterinarian's workup, never diagnoses." A section headed "CORRELATION ONLY, NEVER A DIAGNOSIS". Footer: "Education, not veterinary advice." Site: "It does not diagnose, treat, or replace professional veterinary care." | "96% compliance" printed from 81 of 84 days logged (coverage shown as adherence). Itch severity "4.2 → 0.8" (averaged severity; R5). Candidate triggers ranked (chicken high, a flavoured heartworm medication "likely", beef low) with no counts on the fetched page. "Day 23 … itch rising from 2 to 4 within three days" (temporal juxtaposition). No model named; no statement of human review | `[E]` |
| **PETKIT Kitbo** | A "health report" consolidating litter-box visits, water, food intake and weight against the cat's baseline, "that pet parents can share with their vet". Launched 2026-08-18; "Select Kitbo AI features are expected to launch by the end of 2026" | "Powered by PETKIT AI". No medical disclaimer on the page. Claims it helps "vets reach a diagnosis sooner" | Whether the report text is LLM-written is not stated. No accuracy figure | `[E]` |
| **CompanAIn** (iOS, 25 ratings) | "AI-derived insights", a "Health Analysis" tab, a "Multi-Diagnosis Reasoning Agent"; the Vet Portal is an email invitation to the owner's vet | "Every insight is careful, evidence-based, and built to support your veterinarian — never to replace them." | Diagnostic reasoning is a stated product function (contrast with R8) | `[E]` |
| **Wonderdog** | Owner-facing "Spark" companion over at-home blood panels, which a veterinarian reviews, and the owner's records; helps owners decide when to see a vet | Press: not a substitute for a vet | Not a vet-facing document. "Powered by Claude" is carried from the October brief and was not re-verified (§10) | `[E†]` |
| **Digitail, Tails AI Patient Intake** (clinic-enabled) | A pre-visit AI chat with the owner; on finalizing, the summary is added automatically to the appointment notes and to the SOAP note | The help article (2025-08-26) carries no disclaimer or accuracy statement and does not say whether the summary is labelled as AI in the record; the clinic can read the full chat | An AI summary of owner-reported information already enters the medical record in at least one PIMS | `[E]` |

### 4.2 Clinic-side AI scribes: accuracy claims, disclaimers and how vets review

| Vendor | Accuracy claim | Review and disclaimer language | Tag |
|---|---|---|---|
| ScribbleVet (Instinct), blog 2026-07-13 | ">81%" fewer medication and clinical-term errors than general transcription; "91% of veterinarians rated ScribbleVet's notes as good or excellent" in "competitive trials" (no methods given) | "ScribbleVet isn't immune to occasional inaccuracies"; "we always recommend reviewing your notes before finalizing them" | `[E]` |
| VetRec | "#1 AI-powered veterinary scribe" (no method) | None on the homepage | `[E]` |
| Talkatoo | "Trusted by 30,000+ veterinary professionals"; "#1 rated AI scribe on Capterra"; "complete and accurate records before the appointment ends"; its AI Assistant offers dosage recommendations | No explicit error disclaimer on the homepage | `[E]` |
| CoVet (acquired by IDEXX 2026-09-16 `[C]`), post 2026-07-27 | "CoVet does not publish a universal clinical-accuracy percentage"; recommends that clinics run a 40-encounter benchmark with severity scoring | Its clinical team "is not permission to skip clinician review"; outputs are drafts until a qualified veterinary professional verifies and approves them | `[E]` |
| Scribenote | "6000+ veterinarians"; editing "should be minimal (<2 minutes)" | "You'll still need to review your generated notes, as AI is not perfect." | `[E]` |
| Lupa, vendor benchmark 2026-08-12 | Entity accuracy 0.83 vs 0.74–0.79 for comparators; word error rate 22–39%; preference test of 1 vet × 18 consults; competitors unnamed | Median share of a note edited fell from 12% to 4.4% after launch | `[E]` |
| VetNotes support, 2026-03-03 | No rate given; errors come from mis-transcription or "inference error" (content inferred but never spoken) | Check the audio-quality score (below 0.96), compare against the transcript, state medications and ruled-out diagnoses aloud | `[E]` |
| Industry | No shared veterinary accuracy benchmark; word error rate hides drug-name errors (carprofen misheard as ibuprofen). Article by ScribbleVet's CEO in *Veterinary Practice News*, 2026-03-10. HappyDoc's "99.8%" is the share of notes without negative feedback, not clinical accuracy (as characterized by CoVet) | — | `[E]` |

No peer-reviewed study of veterinary AI-scribe accuracy was found (§10).

### 4.3 Veterinarians' trust in AI (surveys)

- **Digitail and AAHA, 2024** (n=3,968 veterinary professionals): 39.2% used AI tools; reliability and accuracy was the top concern (70.3%), then data security and privacy (53.9%); 15.5% opposed AI `[E]`.
- **Digitail and AAHA, 2026** (n=1,730 US and Canadian veterinary professionals, fielded 2026-07-27 to 08-12, published 2026-10-06): 83.7% use AI, 88.3% of them daily or weekly. Reliability and accuracy remains the top concern (67.4%); privacy 59%; lack of training 47.1%. Clinical documentation (scribes, SOAP) is the most common use (62.8%), then client communication `[E]` (dvm360 report of the survey).
- **Clients' online information** (Springer et al. 2022, *Animals*; 641 small-animal vets in Austria, Denmark and the UK; response rates 7–13%): 70–78% are occasionally challenged by clients citing online information; 63–81% agree that internet use raises clients' expectations. The survey predates mainstream chatbots `[E]`.
- **A narrative review** (Heinlein 2026, *Front Vet Sci*) repeats the 70.3% accuracy concern and argues AI "should aid, not replace" the vet `[E]`.

### 4.4 How readers discount an "AI-generated" label (no veterinary study found; human proxies)

- **Lay readers of medical advice.** In two preregistered experiments (about 2,280 participants; Reis, Reis & Kunde 2024, *Nat Med*), identical advice labelled as from AI, or from a physician working with AI, was rated less reliable and less empathetic, and people were less willing to follow it; comprehensibility did not differ `[E]` (university press release; n per the search excerpt of the abstract `[E†]`).
- **Patients reading portal replies.** In a randomized-vignette survey of 1,455 Duke patient advisors (Cavalier et al. 2025, *JAMA Netw Open*), replies actually drafted by AI were rated higher than human-drafted ones (+0.30 points of satisfaction on a 5-point scale). Separately, an AI disclosure lowered satisfaction by 0.13 points against a human disclosure, and satisfaction stayed at 78–82% under every disclosure. The most preferred wording was "This message was written by Dr. T. with the support of automated tools." `[E]`
- **Clinician raters.** Shekar et al. (arXiv 2024): 300 lay participants could not tell AI from doctors' answers and rated even low-accuracy AI answers about as valid as doctors'. Experts rated AI answers *higher* when the source was hidden; a secondary account reports experts rated AI lower when it was labelled (3–6 evaluators) `[E]`/`[E†]`.
- **The mechanism.** Labelling headlines "AI-generated" lowered perceived accuracy by 2.66 percentage points, a third of the effect of labelling them "false", whether the headline was true or human-written. The discount appeared when no definition of the label was given, or under a "strong" definition (AI did everything), but not under a weak or medium one (AI assisted). Readers discounted the label because they assumed full automation without human oversight (Altay & Gilardi 2024, *PNAS Nexus*, n=4,976) `[E]`.
- **For Culprit** `[A]`: no evidence was found on how a *veterinarian* weighs an *owner-supplied* document labelled AI-generated. The proxies suggest a modest discount driven by assumed lack of checking, which disappeared in one experiment when readers were told the label meant AI assistance rather than full automation.

### 4.5 Automation bias (the opposite risk)

See §3.d (Dratsch 2023; Jabbour 2023) `[E]`. Readers who do *not* discount AI text follow wrong suggestions at high rates, and explanations did not fix this `[E]`.

---

## 5. The handoff one-liner

### 5.1 I-PASS

- **Format:** Illness severity (stable, "watcher", unstable); **P**atient summary (a summary statement, the events leading up to admission, hospital course, ongoing assessment, plan); Action list; Situation awareness and contingency planning; Synthesis by the receiver `[E]` (Revista Paulista de Pediatria 2023).
- **Origin.** Starmer et al. 2012 (*Pediatrics*): pilot faculty observers found illness severity among the elements residents most often left out. The paper notes that SBAR suits situations "where fewer than 5 key points need to be communicated" `[E]`.
- **Outcome.** Starmer et al. 2014 (*NEJM*; 9 hospitals, 10,740 admissions; prospective intervention study): medical errors fell 23% (24.5 → 18.8 per 100 admissions) and preventable adverse events 30% (4.7 → 3.3); non-preventable events did not change; oral handoff time did not change (2.4 vs 2.5 min per patient) `[E]`.

### 5.2 SBAR

Situation, Background, Assessment, Recommendation. A systematic review found 8 before-after studies and 3 controlled trials; 8 of 26 patient outcomes improved significantly. The evidence is "moderate", strongest for structuring phone communication (Müller et al. 2018, *BMJ Open*) `[E]`.

### 5.3 International Patient Summary (ISO 27269 / HL7 FHIR IPS)

An "electronic health record extract containing essential healthcare information", defined as "minimal and non-exhaustive; specialty-agnostic and condition-independent; but still clinically relevant". It was designed for unplanned, cross-border care `[E]`. Problems, allergies and medications are the mandatory sections `[E†]`.

### 5.4 The one-liner, or problem representation

- **Bowen 2006** (*NEJM* 355:2217–25): an early step in clinical reasoning is "the mental abstraction or 'problem representation', usually as a one-sentence summary defining the specific case in abstract terms". "Last night" becomes "acute onset", "I've had problems like this before" becomes "recurrent", "same knee" becomes "monoarticular". **Semantic qualifiers**, paired opposing descriptors (abrupt vs gradual, single vs multiple, severe vs mild), are associated with strong clinical reasoning `[E]`.
- **Teaching template** (University of Washington clinical-medicine textbook): "___ is a ___ year-old with a history of ___ who presents with ___ of ___ duration" `[E†]`.

### 5.5 What goes missing from written handoffs

Kripalani et al. 2007 (*JAMA*; systematic review of 55 observational and 18 controlled studies):
- Direct hospital-to-primary-care communication occurred in 3–20% of cases `[E]`.
- A discharge summary was available at the first follow-up visit in 12–34% of cases, and at 4 weeks in 51–77% `[E]`.
- Commonly missing: diagnostic test results (33–63%), hospital course (7–22%), discharge medications (2–40%), tests pending at discharge (65%), follow-up plans (2–43%) `[E]`.
- Computer-generated summaries and standardized formats improved timeliness and perceived quality `[E]`.

### 5.6 What clinicians want in the first two or three sentences (synthesis)

- In every format above, a **compressed statement of the case comes first**: illness severity then summary statement (I-PASS); situation (SBAR); the one-sentence problem representation (Bowen) `[E]`.
- That opening sentence is **an abstraction in clinical vocabulary**: onset, recurrence, laterality, severity `[E]`. In I-PASS and SBAR the next slots are **assessment and recommendation**, which are clinician judgments `[E]`.
- **For a pet-owner record** `[A]`: R8 rules out severity grading, assessment and recommendation. What remains computable is a record-level one-liner: signalment, the reason for monitoring (a diet trial or a monitoring directive), the window and coverage, and qualifiers with counts. Examples: "recurrent: 9 episodes in 52 days", "first logged on …", "frequency rising: 2 → 5 per fortnight, counts attached". Culprit's engine already computes chronicity, gap-shortening and trend lanes deterministically `[C index.ts:164–196]`. Whether a vet treats such a sentence as a problem representation, or as a framing to discount, was not studied for owner-generated documents (§10).

---

## 6. Disclosure and liability (short)

- **FTC.**
  - "Keep your AI claims in check" (Atleson, 2023-02-27/28): don't exaggerate what an AI product can do; don't claim it beats non-AI products without proof; know the risks; make sure the product actually uses AI `[E]` (via Marketing Dive; the FTC page returned 404).
  - **Operation AI Comply** (2024-09-25): five actions, including DoNotPay, the "robot lawyer" that never tested whether its output matched a lawyer's `[E]`. The DoNotPay order reportedly bars claims that a product can substitute for a professional service without evidence `[E†]`.
  - In December 2025 the Commission **set aside** the 2024 Rytr order (an AI tool that generated reviews), citing an insufficient Section 5 pleading and burden on AI innovation `[E]`.
  - Implication `[A]`: claims that a report "helps vets diagnose" (Kitbo's wording) are efficacy claims that need substantiation.
- **ONC HTI-1 and HTI-5.** HTI-1's decision-support criterion (§170.315(b)(11)) requires certified health-IT developers to expose "source attributes" for predictive tools, updated from 2025-01-01 `[E†]`. **HTI-5** (proposed 2025-12-29; comments closed 2026-02-27) would remove the source-attribute and risk-management requirements, revising (b)(11) `[E]`. Its final status is unknown (§10). The rule binds certified human-health IT, not pet apps `[A]`.
- **California AB 3030** (Health & Safety Code §1339.75; effective 2025-01-01): a health facility, clinic, physician's office or group practice that uses generative AI for patient communications about clinical information must add a disclaimer and instructions for reaching a human. The rule does not apply if a licensed provider has "read and reviewed" the communication `[E]`. Veterinarians are not named `[E]`, and the law appears not to apply to pet reports `[A]`.
- **California AB 489** (Chapter 615, Statutes of 2025; Business & Professions Code §§4999.8–4999.9; signed 2025-10-11; operative 2026-01-01): prohibits terms in the "advertising or functionality" of an AI system "that indicates or implies that the care, advice, **reports**, or assessments being offered through the AI … is being provided by a natural person in possession of the appropriate license". Each use is a separate violation, enforced by the relevant licensing board `[E]`. It sits in Division 2 (Healing Arts) `[E†]`. Whether the Veterinary Medical Board's titles are covered is unconfirmed (§10). The Board of Psychology's advisory reads it as requiring licensees to clearly identify AI-generated content in reports `[E]`.
- **Texas.** SB 1188 (effective 2025-09-01): practitioners may use AI for diagnostic purposes if they review AI-generated records and disclose the use. HB 149, TRAIGA (effective 2026-01-01): health-care providers notify patients of AI use `[E†]`. Coverage of veterinarians is not established `[A]`.
- **Utah** (AI Policy Act as amended by SB 226 and SB 332, 2025): a general business must disclose generative AI only when clearly asked. A "regulated occupation" licensed by the Department of Commerce must disclose prominently in "high-risk" interactions, which involve sensitive data such as health data, or personalized advice relied on for significant decisions. There is a safe harbor for clear self-disclosure, and the Act sunsets 2027-07-01 `[E]`. Whether this reaches a pet-owner app rather than a licensee is not established `[A]`.
- **Veterinary bodies.**
  - **AAVSB** white paper (2025-03-21): licensees "must also maintain full transparency regarding AI use", with informed consent "when appropriate" `[E]`. A board-hosted copy reportedly says responsibility "rests entirely with the Licensee" `[E†]`.
  - **BVA** eight principles: AI supports, not replaces, the vet; vets "must oversee AI use and be responsible for decisions"; explainability `[E]`.
  - **AVMA**: a Task Force on Emerging Technologies and Innovation; no adopted AI policy found; AVMA notes that, unlike human medicine, AI tools in veterinary medicine need no premarket screening `[E†]`.
- **Vet-specific statute** `[A]`: none found that regulates AI-written documents an *owner* brings to a vet. The live legal edges for Culprit are attribution (never implying vet authorship or review, per AB 489) and the substantiation of capability claims (FTC).

---

## 7. Architecture options

### 7.1 Options table

Rows 0 and 0′ are comparators with no model. The residual-risk levels are the analyst's judgments from the evidence cited in each row, `[A]` throughout; §7.2 gives the full row for each option.

| Option | What the model may do | What stays deterministic | Evidence for | Failure modes (evidence) | Residual risk to honesty rules |
|---|---|---|---|---|---|
| **0. Status quo** (`generate-report` v55) | Nothing. Photo-read fields print badged "AI read · unconfirmed" | Everything | Rule-based word choice preferred to human forecasts (SumTime) `[E]`; Met Office text shipped after 2 years of QA `[E]`; persona cold read judged the trimmed report more trustworthy `[C]` | Narrative weaknesses (continuity, overview, time; BT-45) `[E]`; length `[C]`; template bugs are deterministic and testable, for example the weekly chart printing a measured 0 for a week with one logged meal-day `[C Oct brief:212]` | No generative risk on any rule; breaches only as reproducible bugs |
| **0′. Deterministic compression** (no model): grouped rows, one consolidated label, a computed one-liner, a short summary page | Nothing | Everything | Grouping and disclaimer consolidation shipped (target about 18 → 6–7 pages; about 23 disclaimer strings → 4) `[C]`; semantic qualifiers are computable from counts and dates (Bowen) `[E]`/`[A]`; consistent-vocabulary NLG (SumTime) `[E]` | Narrative stays stiffer than human prose (BT-45) `[E]`; each new template costs engineering (render.ts about 9,800 lines, report.ts about 6,200) `[C]` | Same as 0 |
| **a. Template draft plus an LLM copy-editor under a diff constraint** | Delete, merge, reorder and rephrase template sentences; no new numbers or entities; locked spans untouched | Facts and numbers; the sentence inventory; locked spans (scope clauses, R9 verbatim text, the safety band); diff, number and entity checks; fallback to the draft | Template-first pipelines held omissions and hallucinations near zero (Kasner 2022) `[E]`; Patterns "join + smooth" pattern `[C]`; concision and coherence gains (Williams 2025) `[E]` | Fusion changes meaning (Kasner 2022); over-correction (Fang 2023); qualifier loss (Peters, Du); omissions in rewrites (Zaretsky, Jeblick) `[E]`; meaning reversal without screened words ([CUL-1618](https://linear.app/projectnyx/issue/CUL-1618)) `[C]`; variability between runs `[E]` | Medium on R1, R2, R3, R6, R8, R10; high on R1, R3 and R10 if spans are not locked |
| **b. Fact sheet only, fact-ID citations, verifier, per-sentence template fallback** | Write new sentences from a closed fact sheet, choosing which facts to state; cite fact IDs per sentence | Fact computation and sheet contents (for example, severity left out); verifier for numbers, entities, polarity lexicon and must-include list; per-sentence fallback; safety band | VeriFact up to 92.7% agreement with clinicians `[E]`; Citations guarantee valid pointers and support fact-level blocks `[E]`; schema-forced coverage (Asgari) `[E]` | Pointer is not support (SourceCheckup 50–90%) `[E]`; entailment checkers about 75% balanced accuracy `[E]`; true-but-misleading sentences pass `[E]`/`[A]`; judge biases `[E]`; Citations cannot be combined with structured outputs `[E]`; mixed register `[A]` | High on R3, R4, R8 (and R10 unless safety stays template-only); medium on R1, R2, R5, R6, R9 |
| **c. Selection, not generation** | Choose and order pre-approved, self-contained sentences, findings and charts by ID | The whole sentence library (each with its own window and denominator), every number, must-include items (never selectable), the safety band | Scripted-content health product (Woebot) `[E]`; enum choices are schema-valid `[E]`; selection is the decisive step (BT-45) `[E]` | Juxtaposition and order imply cause or priority (30% of extractive summaries unfaithful; context errors) `[E]`; position bias in long lists `[E]`; omission by deselection `[A]` | Low overall; medium on R3 if coverage lines are optional; low-to-medium on R2 (adjacency); low on R8 (ordering implies priority) |
| **d. Labelled AI summary over the unchanged report** | Write a short labelled box at the top of page 1 | The whole report as today | Paragraph-level provenance labelling ships (Arria) `[E]`; clinic summaries are layered over records (Digitail, Instinct) `[E]`/`[C]`; disclosure costs little satisfaction (Cavalier) `[E]` | Anchoring and automation bias on the box (Dratsch, Jabbour, Goodman) `[E]`; box-vs-body contradiction `[A]`; clinic LLMs read the box first `[C]`; the box inherits its writer's (a, b or c) risks `[A]`; "AI" label discount `[E]` | The writer's risks plus anchoring: high on R3, R8, R10 unless safety and absence content is kept out of the box |
| **e. Structured output with enumerated claim types and a deterministic renderer** | Emit JSON claims: a type from a closed list, fact IDs from a closed list, and an order; no free text | The claim-type list (no causal, reassurance or assessment types exist), every word of the renderer, the numbers, required claims | Constrained decoding guarantees schema compliance `[E]`; schema slots removed major omissions (Asgari) `[E]`; strict formats help classification (Tam 2024) `[E]` | Compliance is not truth `[E]`; schema breaks on refusal or `max_tokens` `[E]`; strict formats hurt reasoning `[E]`; no numeric bounds `[E]`; wrong but valid choices `[A]`; API drift on forced tool choice `[E]` | Lowest wording risk; low on R3 (a coverage claim left out unless forced), R6 (wrong fact ID) and R10 (wrong tier, unless the tier is computed) |

### 7.2 Residual risk by honesty rule

All entries `[A]`. Key: **—** the option offers no path to a breach of this rule; **bug** the rule can break only through a reproducible template bug; **L** a breach needs a narrow failure that a deterministic check catches; **M** a breach is possible and only partly checkable; **H** the option's documented dominant failure lands on this rule.

| Option | R1 | R2 | R3 | R4 | R5 | R6 | R7 | R8 | R9 | R10 |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 Status quo | bug | bug | bug | bug | bug | bug | bug | bug | bug | bug |
| 0′ Deterministic compression | bug | bug | bug | bug | bug | bug | bug | bug | bug | bug |
| a Copy-editor, spans locked | M | M | M | L | L | M | — | M | L | M |
| a Copy-editor, no locked spans | H | M | H | M | L | M | — | M | M | H |
| b Fact-sheet writer + verifier | M | M | H | H | M (L if severity left out of the sheet) | M | — | H | M | H (— if the safety band stays template-only) |
| c Selection only | — | L–M | M (— if coverage lines are locked) | — | — | — | — | L | — | — |
| d Labelled AI box (writer = a or b) | M | M | H | M | M | M | — | H | M | H (— if safety is kept out of the box) |
| d Labelled AI box (writer = c or e) | — | L | M | — | — | L | — | L | — | — |
| e Enumerated claims + renderer | — | — | L | — | — | L | — | — | — | L |

Why each rating sits where it does `[A]`:

- R1 and R3 are rated high for free-text options because their clauses are qualifier-class (§1.3), and omissions are the dominant error (§1.2).
- R4 and R8 are rated high for option b because a fact-entailed sentence can still break them (§3.b).
- R10 depends almost entirely on whether the safety band stays template-only, which is the in-repo precedent ([CUL-1630](https://linear.app/projectnyx/issue/CUL-1630)).
- R7 is visual and no text option touches it.

---

## 8. What this implies for Culprit (evidence, not decision)

1. **Brevity and the guarantees compete for the same words.** Part of the report's length is honesty text: windows, coverage, provenance and "associational". Part is structural: appendix rows and repeated disclaimers, which deterministic fixes have already cut `[C]`. Compression by an LLM most reliably fails by deleting or strengthening qualifier text (§1.2–1.3) `[E]`. A model asked to make the report shorter would, on this evidence, most likely shorten it at R1, R3 and R9 unless those spans are locked outside the model's reach `[A]`.
2. **"Best of both worlds" exists in the literature only in a narrow form.** Every hybrid with supporting evidence keeps fact computation, numbers, selection rules and must-say clauses deterministic. It gives the model language operations over already-true units: ordering, fusion, smoothing, choosing among approved items (Kasner 2022; Woebot; Arria; Culprit's Patterns design) `[E]`/`[C]`. Free generation from data carries error rates (§1.4) and verifier ceilings (about 75% balanced accuracy; citations not equal to support) that cannot meet R6, every page-1 number traceable, without a deterministic fallback for each sentence `[E]`/`[A]`.
3. **The in-repo record already answers the safety part.** Two adversarial passes on the owner-facing summary found that lexical and verbatim guards are necessary but not sufficient, and safety summaries are template-only by PM ruling `[C]`. A model anywhere near the report's safety band (R4, R10, intake decline) would reopen [CUL-1630](https://linear.app/projectnyx/issue/CUL-1630) `[A]`.
4. **Where model help has the most evidence.**
   - *Narrative linking:* BT-45's documented deficits (continuity, grouping related signals, overview, time) are where templates are weakest and where LLM text is rated best `[E]`.
   - *Checking rather than writing:* LLM judges reached ICC 0.82 with humans on clinical-summary quality, and record-grounded proposition checking reached 92.7% agreement `[E†]`/`[E]`. A model that audits deterministic output for misleading juxtapositions, such as the weekly-chart zero, has comparable evidential support and never writes clinical text `[A]`. Self-preference bias means the auditing model should not be the one that wrote the text `[E]`.
5. **Freezing and provenance become load-bearing.** With any model text, the artifact would need to be generated once and stored with the model ID, inputs and validator version, and never regenerated on view (§3.h) `[A]`. The spec already defines this snapshot. Deployed v55 does not store one `[C]`.
6. **Labelling.** "AI" labels cost a little trust, mainly because readers assume nobody checked; in the one experiment that tested it (news headlines), the discount disappeared when readers were told the label meant AI assistance rather than full automation (§4.4) `[E]`. Whether that holds for vets reading owner documents is unknown `[A]`. AB 489's "reports" wording makes any copy implying a vet wrote or reviewed the report a legal exposure in California `[E]`/`[A]`.
7. **Positioning.**
   - "Free and not AI-written" is held only partially; others hold each half `[C Oct brief:280]`.
   - The AI-written rival reports observed break rules Culprit enforces: coverage presented as compliance, averaged severity, diagnostic reasoning (§4.1) `[E]`. On this evidence the differentiator is the rules, not the absence of a model `[A]`.
   - Clinic-side LLM summarizers increasingly read the PDF first `[C]`. A model-written layer would make Culprit's text the input to a second model (two-hop drift), while the deterministic scope-in-sentence design is what the October brief judged lets the PDF "survive a machine reader" `[C :321]`/`[A]`.
8. **Graphs versus words.** Good narrative text supported better clinical decisions than graphs. Generated text matched graphs. Clinicians preferred graphs, and itemized reports for complex material (§2.6) `[E]`. Nothing found shows an LLM narrative beating a well-designed deterministic narrative plus graphs `[A]`.
9. **The one-liner.** The handoff literature favours one first sentence in semantic qualifiers. Culprit's rules permit only the record half of it (counts, onset, recurrence, coverage), which the engines already compute (§5.6) `[E]`/`[A]`.
10. **The evaluation burden is real.** The Met Office ran two years of expert QA before going public. Veterinary scribe vendors publish no comparable accuracy figures. The clinical studies that found errors used harm-graded taxonomies (CREOLA-style major/minor; AHRQ-style 0–7) and repeated runs (§1) `[E]`. Any model layer would need a comparable evaluation set: key-fact recall, harm grading and runs on the same report `[A]`.

**Open questions the evidence leaves for a decision (not answered here):**

- Is the goal fewer words, or a faster 60-second read? Deterministic grouping and an itemized lead address the second without a model `[A]`.
- Which honesty clauses may be paraphrased, and which must render verbatim from code?
- May a model decide what is omitted from page 1?
- Does the safety band stay template-only, following [CUL-1630](https://linear.app/projectnyx/issue/CUL-1630)?
- If any model text ships, what does the label say, and is the artifact stored?
- What error rate on what evaluation set counts as acceptable?

---

## 9. In-repo references read this pass

- `docs/nyx-vet-report-requirements.md`: §5 honesty rules (:127–145); §6 immutability (:153); §7 architecture, "Deterministic, no LLM" (:177) and the stored snapshot (:183).
- `docs/culprit-competitive-landscape-2026-10.md`: ThePawcess (:18, :257); free non-AI report claim (:34, :280); Wonderdog (:61); clinic summarizers (:63, :113–119); vet-LLM evidence (:50); LLM boundary (:167); report v55, no LLM, nothing stored (:172); the "never reassures" claim is lexical (:210); weekly-chart zero (:212); "picky" screen (:282); R2, the reader becoming an LLM (:321).
- `docs/research/2026-07-vet-report-first-artifact-review.md`: R2-1 appendix grouping (:34); R2-4 disclaimer consolidation (:40); per-page footer ruling (:61).
- `supabase/functions/generate-signal/index.ts`: phrasing model (:129); lanes excluded from the model (:160–215); forced tool call (:231–236); summary restraint (:270–290).
- `supabase/functions/generate-signal/summary.ts`: "LLM as Phraser, never Analyst" and the CUL-1630 ruling (:1–52); number-word grounding (:105–109); the verbatim lead is "necessary, not sufficient" (:675–690).
- `supabase/functions/generate-signal/phrasing.ts`: `PHRASE_TOOL` and `PHRASING_SYSTEM` (:1200–1246).
- `supabase/functions/generate-report/render.ts`: the "AI read · unconfirmed" chip replacing about 23 repeated sentences (:117–124).

---

## 10. Research debt

1. **The shared web-search budget ran out near the end of this pass.** The items below stayed unverified.
2. **van der Meulen et al. 2010** (*Appl Cogn Psychol*): abstract and full text not fetched (publisher 403, repository 503, abstract elided in Semantic Scholar). The BT-45 numbers come from the same group's INLG 2008 companion paper.
3. **AVMA:** no adopted AI policy located; AVMA news pages fetched empty, so the task force and "no premarket screening" points are from search excerpts.
4. **No veterinary handoff or handover study** (SBAR or I-PASS in veterinary hospitals) was verified. The search was cut off by the budget.
5. **California AB 489:** whether Veterinary Medical Board titles are covered was not confirmed; the chaptered text on leginfo and LegiScan returned 403.
6. **Texas SB 1188 and HB 149:** details come from law-firm search excerpts; whether they apply to veterinarians was not established.
7. **HTI-5:** final status unknown (proposed 2025-12-29; comment period ended 2026-02-27).
8. **EU AI Act Article 50** transparency duties were not researched.
9. **FTC 2023 blog post:** the primary page returned 404; verified via Marketing Dive. The DoNotPay "substitute for professional services" order term was seen only in search excerpts.
10. **Frontier-model (2026) accuracy at data-to-text with numbers:** no head-to-head study found. The data-to-text error rates in §1.4 come from 2020–2024 models.
11. **No study of veterinarians reading AI-labelled, owner-supplied documents.** §4.4 relies on human-medicine and general-public proxies.
12. **No peer-reviewed veterinary AI-scribe accuracy study found.** Vendor figures (ScribbleVet's 81% and 91%; Lupa; HappyDoc's 99.8%) are unverifiable.
13. **PETKIT Kitbo:** whether the report text is LLM-written is not stated on the fetched page, and the feature rollout is partial.
14. **Wonderdog "powered by Claude"** is carried from the October brief; the sources fetched this pass do not mention the model.
15. **Du et al. 2026:** the direction of uncertainty distortion (hedges collapsing into assertions, or the reverse) is not in the abstract.
16. **Goodman et al. 2024:** only the opening paragraph was fetched; the "fever" example and the sycophancy argument rely on secondary coverage.
17. **Abstract-level only, via search excerpts:** Hegselmann 2024; FineSurE; DocLens; Croxford 2025 (ICC 0.818); the HL7 IPS required sections; the University of Washington one-liner template; Abridge Linked Evidence (first-party page 403); Reis et al. 2024 participant count.
18. **Bosmans 2011:** a "clinicians read only the conclusion" statistic was sought and is not in the abstract, so it is not used.
19. **Arria's "100% factually accurate"** is a vendor claim with no independent test found. The Met Office Shipping Forecast figures come from a secondary write-up of an AWS talk.
20. **Carried from the October brief, not re-fetched:** the 2026 *JAVMA* study of LLMs under-triaging feline fractures and the 2025 *Sci Rep* study of chatbots under-scoring cat pain.
21. **Determinism wording:** Anthropic's statement that temperature 0 is not fully deterministic was not found on the live docs this pass. The sampling-parameter rejections come from the Anthropic API reference bundled with Claude Code (cached 2026-10-06) and the live Messages API parameter list.
22. **Williams et al. 2025, JAMA Intern Med:** the model used is not named in the fetched abstract.
23. **Peters & Chin-Yee:** per-model rates for Claude are cited only as "not significantly different from the originals", to avoid conflating two of the paper's metrics.

---

## 11. Sources (all accessed 2026-10-11)

**LLM clinical summarization and faithfulness**
- Van Veen D, et al. Adapted large language models can outperform medical experts in clinical text summarization. *Nat Med* 2024. arXiv v5 and full text: https://arxiv.org/abs/2309.07430 · https://arxiv.org/pdf/2309.07430
- Williams CYK, et al. Evaluating large language models for drafting emergency department encounter summaries. *PLOS Digit Health* 2025;4(6):e0000899. https://pmc.ncbi.nlm.nih.gov/articles/PMC12173386/
- Williams CYK, et al. Physician- and large language model–generated hospital discharge summaries. *JAMA Intern Med* 2025;185(7):818–825. Abstract via Europe PMC: https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=TITLE:%22Physician-%20and%20Large%20Language%20Model-Generated%20Hospital%20Discharge%20Summaries%22&resultType=core&format=json
- Zaretsky J, et al. Generative AI to transform inpatient discharge summaries to patient-friendly language and format. *JAMA Netw Open* 2024;7(3):e240357. https://pmc.ncbi.nlm.nih.gov/articles/PMC10928500
- Silberlust J, Genes N. Clinical integration of local AI assistants into ED discharge documentation (commentary). *JAMA Netw Open* 2025;8(10):e2538437. https://jamanetwork.com/journals/jamanetworkopen/fullarticle/2840384
- Asgari E, et al. A framework to assess clinical safety and hallucination rates of LLMs for medical text summarisation. *npj Digit Med* 2025;8:274. https://pmc.ncbi.nlm.nih.gov/articles/12075489/
- Kernberg A, Gold JA, Mohan V. Using ChatGPT-4 to create structured medical notes from audio recordings of physician-patient encounters. *JMIR* 2024;26:e54419. Europe PMC: https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:10.2196/54419&resultType=core&format=json
- Tang L, et al. Evaluating large language models on medical evidence summarization. *npj Digit Med* 2023;6:158. https://pmc.ncbi.nlm.nih.gov/articles/PMC10449915
- Hegselmann S, et al. A data-centric approach to generate faithful and high quality patient summaries with LLMs. CHIL 2024 (PMLR 248). https://proceedings.mlr.press/v248/hegselmann24a.html (search excerpt)
- Goodman KE, Yi PH, Morgan DJ. AI-generated clinical summaries require more than accuracy. *JAMA* 2024;331(8):637–638. https://jamanetwork.com/journals/jama/fullarticle/2814609
- Peters U, Chin-Yee B. Generalization bias in large language model summarization of scientific research. *R Soc Open Sci* 2025. https://pmc.ncbi.nlm.nih.gov/articles/PMC12042776/
- Du H, Lu Z, Qu J. Possible or definite? A benchmark for evaluating diagnostic uncertainty preservation in clinical text. MLHC 2026 (PMLR 340:435–460). https://proceedings.mlr.press/v340/du26a.html · https://arxiv.org/abs/2606.18471
- Omar M, et al. Multi-model assurance analysis showing LLMs are highly vulnerable to adversarial hallucination attacks during clinical decision support. *Commun Med* 2025. Europe PMC (PMID 40753316): https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=EXT_ID:40753316&resultType=core&format=json
- Jeblick K, et al. ChatGPT makes medicine easy to swallow. *Eur Radiol* 2024;34(5):2817–2825. Europe PMC: https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=TITLE:%22ChatGPT%20makes%20medicine%20easy%20to%20swallow%22&resultType=core&format=json
- Pakianathan PVS, et al. Exploring AI-augmented sensemaking of patient-generated health data. arXiv:2602.05687 (2026). https://arxiv.org/abs/2602.05687 · https://arxiv.org/html/2602.05687

**Data-to-text**
- Thomson C, Reiter E. A gold standard methodology for evaluating accuracy in data-to-text systems. INLG 2020. https://ar5iv.labs.arxiv.org/html/2011.03992
- Thomson C, Reiter E, Sundararajan B. Evaluating factual accuracy in complex data-to-text. *Comput Speech Lang* 2023;80:101482. https://abdn.elsevierpure.com/en/publications/evaluating-factual-accuracy-in-complex-data-to-text
- Kasner Z, Dušek O. Beyond traditional benchmarks: analyzing behaviors of open LLMs on data-to-text generation. ACL 2024. https://aclanthology.org/2024.acl-long.651 · https://arxiv.org/html/2401.10186v3
- Kasner Z, Dušek O. Neural pipeline for zero-shot data-to-text generation. ACL 2022. https://aclanthology.org/2022.acl-long.271 · poster: https://ufal.mff.cuni.cz/~odusek/2023/docs/ACL2022_Zero-shot_Pipeline_-_poster.pdf
- Law AS, et al. A comparison of graphical and textual presentations of time series data to support medical decision making in the NICU. *J Clin Monit Comput* 2005;19:183–194. Europe PMC (PMID 16244840): https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=TITLE:%22comparison%20of%20graphical%20and%20textual%20presentations%20of%20time%20series%20data%22&resultType=core&format=json
- Reiter E, Gatt A, Portet F, van der Meulen M. The importance of narrative and other lessons from an evaluation of an NLG system that summarises clinical data. INLG 2008. https://www.um.edu.mt/library/oar/bitstream/123456789/22354/1/inlg08-bt45.pdf
- Portet F, et al. Automatic generation of textual summaries from neonatal intensive care data. *Artif Intell* 2009;173:789–816. https://www.um.edu.mt/library/oar/handle/123456789/22142
- van der Meulen M, et al. When a graph is poorer than 100 words. *Appl Cogn Psychol* 2010;24:77–89 (metadata only): https://api.semanticscholar.org/graph/v1/paper/DOI:10.1002/acp.1545?fields=title,abstract,year,venue,authors
- Hunter J, et al. Automatic generation of natural language nursing shift summaries in neonatal intensive care: BT-Nurse. *Artif Intell Med* 2012;56:157–172. https://abdn.elsevierpure.com/en/publications/automatic-generation-of-natural-language-nursing-shift-summaries-
- Reiter E, et al. Choosing words in computer-generated weather forecasts. *Artif Intell* 2005;167:137–169. https://abdn.elsevierpure.com/en/publications/choosing-words-in-computer-generated-weather-forecasts
- Sripada SG, et al. A case study: NLG meeting weather industry demand for quality and quantity of textual weather forecasts. INLG 2014. https://aclanthology.org/W14-4401.pdf
- ZenML LLMOps Database. Automating weather forecast text generation using fine-tuned vision-language models (Met Office and AWS). https://www.zenml.io/llmops-database/automating-weather-forecast-text-generation-using-fine-tuned-vision-language-models
- Arria. Arria Author. https://www.arria.com/author · Arria Intelligence press release (Business Wire, 2026-07-23), republished: https://www.01net.it/arria-intelligence-addresses-the-fatal-flaw-unreliability-preventing-enterprise-adoption-of-agentic-ai-language-automation/
- Reiter E. Natural Language Generation (book preprint, 2025; partially read). https://arxiv.org/html/2502.14437v1

**Guardrails, verifiers and variability**
- Anthropic. Citations. https://platform.claude.com/docs/en/build-with-claude/citations
- Anthropic. Structured outputs. https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- Anthropic. Messages API reference. https://platform.claude.com/docs/en/api/messages · claude-api reference bundled with Claude Code (cached 2026-10-06; local)
- Laban P, et al. SummaC: re-visiting NLI-based models for inconsistency detection in summarization. *TACL* 2022. https://aclanthology.org/2022.tacl-1.10.pdf
- Tang L, Laban P, Durrett G. MiniCheck: efficient fact-checking of LLMs on grounding documents. EMNLP 2024. https://arxiv.org/html/2404.10774v2
- Chung P, et al. VeriFact: verifying facts in LLM-generated clinical text with electronic health records. arXiv:2501.16672. https://arxiv.org/abs/2501.16672v1
- Croxford E, et al. Evaluating clinical AI summaries with large language models as judges. *npj Digit Med* 2025 (search excerpt). https://pmc.ncbi.nlm.nih.gov/articles/PMC12045442/
- Zheng L, et al. Judging LLM-as-a-judge with MT-Bench and Chatbot Arena. NeurIPS 2023. https://arxiv.org/abs/2306.05685v1
- Panickssery A, Bowman SR, Feng S. LLM evaluators recognize and favor their own generations. NeurIPS 2024. https://arxiv.org/abs/2404.13076v1
- Wu K, et al. An automated framework for assessing how well LLMs cite relevant medical references. *Nat Commun* 2025. https://pmc.ncbi.nlm.nih.gov/articles/PMC12003634/
- Schumacher E, et al. MED-OMIT: extrinsically-focused evaluation metric for omissions in medical summarization. ML4H 2025 (PMLR 259). https://proceedings.mlr.press/v259/schumacher25a.html
- Song H, et al. FineSurE: fine-grained summarization evaluation using LLMs. ACL 2024 (search excerpt). https://aclanthology.org/2024.acl-long.51
- Xie Y, et al. DocLens: multi-aspect fine-grained evaluation for medical text generation. ACL 2024 (search excerpt). https://arxiv.org/pdf/2311.09581
- Zhang S, Wan D, Bansal M. Extractive is not faithful. ACL 2023. https://aclanthology.org/2023.acl-long.120
- Tam ZR, et al. Let me speak freely? A study on the impact of format restrictions on performance of LLMs. arXiv:2408.02442. https://arxiv.org/abs/2408.02442
- Fang T, et al. Is ChatGPT a highly fluent grammatical error correction system? arXiv:2304.01746. https://arxiv.org/abs/2304.01746
- Liu NF, et al. Lost in the middle: how language models use long contexts. *TACL*. https://arxiv.org/abs/2307.03172
- Atil B, et al. Non-determinism of "deterministic" LLM settings. arXiv:2408.04667 (v5). https://arxiv.org/abs/2408.04667
- He H, Thinking Machines Lab. Defeating nondeterminism in LLM inference (2025-09-10). https://thinkingmachines.ai/blog/defeating-nondeterminism-in-llm-inference/
- Sackett C, Harper D, Pavez A. Do we dare use generative AI for mental health? *IEEE Spectrum*, 2024-05-26. https://spectrum.ieee.org/woebot
- Abridge. Verify a note with Linked Evidence (search excerpt; page 403). https://support.abridge.com/hc/en-us/articles/30235128433811-Verify-a-Note-With-Linked-Evidence
- Dratsch T, et al. Automation bias in mammography. *Radiology* 2023;307(4):e222176. https://research.uni-luebeck.de/en/publications/automation-bias-in-mammography-the-impact-of-artificial-intellige/
- Jabbour S, et al. Measuring the impact of AI in the diagnosis of hospitalized patients. *JAMA* 2023;330(23):2275–2284. Europe PMC: https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=TITLE:%22Measuring%20the%20Impact%20of%20AI%20in%20the%20Diagnosis%20of%20Hospitalized%20Patients%22&resultType=core&format=json

**Veterinary market and surveys**
- ThePawcess, home and sample vet report. https://thepawcess.com · https://thepawcess.com/demo/vet-report
- PETKIT. Kitbo, PETKIT's AI-powered pet health assistant. https://www.petkit.com/blogs/blog/kitbo-petkits-ai-powered-pet-health-assistant-for-smarter-pet-care
- CompanAIn, App Store listing. https://apps.apple.com/app/id6747678727
- Wonderdog launch release (search excerpt). https://www.streetinsider.com/Business+Wire/Wonderdog+Launches+a+New+Era+of+Preventive+Health+for+Dogs/26744503.html
- Digitail. Tails AI Patient Intake. http://help.digitail.io/en/articles/8409582-tails-ai-patient-intake · Pet parent app guide: https://help.digitail.io/en/articles/12601847-how-to-use-the-digitail-pet-parent-app-to-manage-your-pet-s-care
- Instinct. ScribbleVet FAQ (2026-07-13). https://instinct.vet/blog/scribblevet-faq-veterinary-ai-scribe/
- VetRec. https://vetrec.io · Talkatoo. https://talkatoo.com · Scribenote. https://www.scribenote.com
- CoVet. Veterinary AI scribe accuracy (2026-07-27). https://co.vet/post/veterinary-ai-scribe-accuracy/
- Lupa. The most accurate AI scribe for vets: our benchmark results (2026-08-12). https://lupapets.com/blog/veterinary-ai-scribe-benchmark/
- VetNotes. What to do if your AI scribe makes things up (2026-03-03). https://support.vetnotes.com/en/articles/13912354-what-to-do-if-your-ai-scribe-makes-things-up
- Relan R. Lost in transcription: how accurate are veterinary AI scribes? *Veterinary Practice News*, 2026-03-10. https://www.veterinarypracticenews.com/?p=57022
- Digitail and AAHA 2024 survey. https://digitail.com/blog/39-2-of-veterinary-professionals-use-ai-tools-in-their-practice-digitail-and-aaha-survey/
- dvm360. AI use among veterinary professionals more than doubles in 2 years (2026 survey). https://www.dvm360.com/view/artificial-intelligence-use-among-veterinary-professionals-more-than-doubles-in-2-years
- Springer S, et al. Compete or cooperate with "Dr. Google"? *Animals* 2022. https://pmc.ncbi.nlm.nih.gov/articles/PMC9404757/
- Heinlein M. Ethical considerations of AI in veterinary medicine decision-making. *Front Vet Sci* 2026. https://pmc.ncbi.nlm.nih.gov/articles/PMC12947261/
- Reis M, Reis F, Kunde W. Influence of believed AI involvement on the perception of digital medical advice. *Nat Med* 2024. University of Würzburg release: https://www.uni-wuerzburg.de/en/news-and-events/news/detail/news/little-trust-in-dr-chatgpt/
- Cavalier JS, et al. Ethics in patient preferences for AI-drafted responses to electronic messages. *JAMA Netw Open* 2025;8(3):e250449. https://pmc.ncbi.nlm.nih.gov/articles/PMC11897835/
- Shekar S, et al. People over trust AI-generated medical responses… arXiv:2408.15266. https://arxiv.org/abs/2408.15266v1
- Altay S, Gilardi F. People are skeptical of headlines labeled as AI-generated, even if true or human-made. *PNAS Nexus* 2024. https://pmc.ncbi.nlm.nih.gov/articles/PMC11443540

**Handoff formats**
- Starmer AJ, et al. Changes in medical errors after implementation of a handoff program. *NEJM* 2014;371:1803–1812. Europe PMC (PMID 25372088): https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=EXT_ID:25372088&resultType=core&format=json
- Starmer AJ, et al. I-PASS, a mnemonic to standardize verbal handoffs. *Pediatrics* 2012;129:201–204. https://pmc.ncbi.nlm.nih.gov/articles/PMC9923540/
- Implementation of a standardized handoff system (I-PASS) in a tertiary care pediatric hospital. *Rev Paul Pediatr* 2023. https://scielo.br/j/rpp/a/BbLSYmQp3FRvvZW94bgJWmC/?lang=en
- Müller M, et al. Impact of the communication and patient hand-off tool SBAR on patient safety: a systematic review. *BMJ Open* 2018;8:e022202. Europe PMC: https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:10.1136/bmjopen-2018-022202&resultType=core&format=json
- HL7 International Patient Summary Implementation Guide. https://build.fhir.org/ig/HL7/fhir-ips/en/ · logical model (search excerpt): https://hl7.org/fhir/uv/ips/StructureDefinition-IPSSectionsLM-definitions.html
- Bowen JL. Educational strategies to promote clinical diagnostic reasoning. *NEJM* 2006;355:2217–25. https://www.bumc.bu.edu/facdev-medicine/files/2010/06/Bowen-clinical-reasoning-NEJM.pdf
- University of Washington, Foundations of Clinical Medicine textbook (search excerpt; page 403). https://uw.pressbooks.pub/fcmtextbook/?p=169
- Kripalani S, et al. Deficits in communication and information transfer between hospital-based and primary care physicians. *JAMA* 2007;297:831–841. Europe PMC (PMID 17327525): https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=EXT_ID:17327525&resultType=core&format=json
- Bosmans JML, et al. The radiology report as seen by radiologists and referring clinicians (COVER and ROVER). *Radiology* 2011;259:184–195. Europe PMC: https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:10.1148/radiol.10101045&resultType=core&format=json

**Disclosure and liability**
- Marketing Dive on the FTC's "Keep your AI claims in check" (2023-02-28). https://www.marketingdive.com/news/ftc-AI-warning-OpenAI-ChatGPT-advertising/643739/
- NBC News. FTC announces crackdown on "deceptive AI" businesses (2024-09-25). https://www.nbcnews.com/tech/internet/ftc-announces-crackdown-deceptive-ai-businesses-rcna172699
- Hogan Lovells. In rare move, FTC sets aside Rytr order (2025-12-24). https://www.hlc.com/en/publications/in-rare-move-ftc-sets-aside-rytr-order-for-burdening-ai-innovation-and-failing-to-plead-violations
- Covington. HHS proposes changes … in HTI-5 proposed rule (2026-01-15). https://www.covingtonblogs.com/2026/01/15/hhs-proposes-changes-to-the-health-it-certification-program-and-information-blocking-regulations-in-hti-5-proposed-rule/ · ONC HTI-5 chart: https://healthit.gov/resources/hti-5-proposed-rule-chart/ · ONC DSI guide (search excerpt): https://healthit.gov/wp-content/uploads/2025/05/Decision-support-interventions.pdf
- Arent Fox Schiff. California requires disclaimers for health care providers' AI-generated patient communications (AB 3030). https://www.afslaw.com/perspectives/alerts/california-requires-disclaimers-health-care-providers-ai-generated-patient
- California Senate Judiciary Committee. AB 489 (Bonta) analysis (July 2025). https://sjud.senate.ca.gov/system/files/2025-07/ab-489-bonta-sjud-analysis.pdf · Board of Psychology AB 489 advisory: https://psychology.ca.gov/laws_regs/ab489_advisory.pdf
- Akin Gump. Texas enacts a pair of AI governance laws, HB 149 and SB 1188 (search excerpt). https://www.akingump.com/en/insights/ai-law-and-regulation-tracker/texas-enacts-a-pair-of-ai-governance-laws-hb-149-and-sb-1188
- Davis Wright Tremaine. Utah regulation of AI policy and mental health chatbots (2025-04). https://www.dwt.com/blogs/artificial-intelligence-law-advisor/2025/04/utah-regulation-ai-policy-mental-health-chatbots
- AAVSB. Regulatory Considerations of the Use of Artificial Intelligence in Veterinary Medicine (release 2025-03-21). https://aavsb.org/news/aavsb-releases-guidance-for-the-use-of-ai-in-veterinary-medicine
- British Veterinary Association. Artificial intelligence in the veterinary profession (policy). https://www.bva.co.uk/take-action/our-policies/artificial-intelligence-in-the-veterinary-profession/
- AVMA News (search excerpts; pages fetched empty). https://www.avma.org/news/building-framework-responsible-ai-veterinary-medicine · https://avma.org/news/artificial-intelligence-veterinary-medicine-what-are-ethical-and-legal-implications
