# Event-taxonomy evidence pack — three research sweeps (August 2026)

**Date:** 2026-08-24
**Status:** 🧊 Frozen point-in-time evidence capture (research brief — see `docs/research/README.md`)
**Track:** B-756 / CUL-509 (event-type taxonomy expansion). Consumed by `docs/nyx-event-taxonomy-requirements.md` (the scored leaf matrix cites this file per cell).
**Method:** Three isolated web-research agents run in parallel during the 2026-08-23/24 spec session (the deep-dive's lane method): Sweep A = population prevalence (insurance claims, primary-care prevalence, presenting complaints); Sweep B = competitor capture-menu teardown at leaf grain; Sweep C = validated-instrument item inventories + home-RRR literature. Reports reproduced below near-verbatim (agent meta-lines removed). **Committed the same session it was produced** — the original C2 taxonomy study (2026-08-13/14) was an agent brief that never got committed and survives only as a summary on CUL-509; this file exists so that cannot happen twice.
**Verification status:** URLs are agent-sourced and inline; the standard adversarial fact-check pass has NOT yet run on these claims (spec §17 carries the debt). **Superseded 2026-08-30 — see §V at the foot of this file:** the W2-anchor slice was discharged by the 2026-08-26 hard review and the remainder by the CUL-671 verification pass. Claims corrected there carry an inline ⚠ pointer here. Sweep A self-labels source grades ([peer-reviewed] / [press-release] / [press-coverage]) and passed internal arithmetic spot-checks; treat press-release-grade rankings as rankings, not rates.

---

# Sweep A — Population-prevalence evidence

**Dogs vs. cats separated throughout. Every numeric claim carries its source URL. Grades: [peer-reviewed] = primary study; [press-release] = insurer/corporate publication; [press-coverage] = journalism summarizing a primary source the agent could not access directly.**

## §A1 Insurance-claims condition rankings

### A1.1 Nationwide — top 10 claimed conditions, 2025 claims year [press-release]
Source: PRNewswire release 2026-03-05, https://www.prnewswire.com/news-releases/chronic-conditions-dominate-this-years-list-of-most-common-and-expensive-pet-health-problems-302705532.html (same content at https://news.nationwide.com/chronic-conditions-dominate-this-years-list-of-most-common-pet-health-problems/ where the lists are embedded as images). Basis: >3.3M claims from >1M insured pets, Jan 1–Dec 31 2025. Ranked by claim frequency. `*` = chronic per Nationwide.

**Dogs (2025 claims):**

| Rank | Condition | Avg cost | Yearly chronic cost | Owner-observable home signs |
|---|---|---|---|---|
| 1 | Skin allergies* (15th consecutive year at #1) | $286 | $891 | scratching, licking/chewing paws, red skin, hair loss, ear rubbing |
| 2 | Intestinal upset/diarrhea | $768 | — | diarrhea event, vomit event, appetite refusal |
| 3 | Ear infection | $312 | — | head shaking, ear scratching, ear odor/discharge |
| 4 | Arthritis* | $420 | $1,245 | limping, stiffness after rest, reluctance on stairs, slower walks |
| 5 | Trauma | $755 | — | wound, limp, bleeding, sudden pain vocalization |
| 6 | Dental disease* | $1,420 | $1,420 | bad breath, drooling, dropping food, chewing one-sided |
| 7 | Urinary tract infection | $575 | — | frequent urination, straining, blood in urine, accidents |
| 8 | Heart disease* | $596 | $1,283 | coughing, exercise intolerance, fast resting breathing |
| 9 | Liver disease* | $569 | $841 | vomiting, appetite loss, lethargy, yellow gums (late) |
| 10 | Seizures* (NEW to top 10) | $783 | $1,477 | seizure/convulsion episode, post-ictal disorientation |

**Cats (2025 claims):**

| Rank | Condition | Avg cost | Yearly chronic cost | Owner-observable home signs |
|---|---|---|---|---|
| 1 | Intestinal upset/diarrhea (3rd consecutive year at #1) | $863 | — | vomit event, diarrhea event, appetite refusal |
| 2 | Urinary tract infection | $1,005 | — | litter-box straining, frequent small urinations, blood in urine, urinating outside box |
| 3 | Kidney failure* | $727 | $1,251 | increased drinking, increased urine clumps, weight loss, vomiting |
| 4 | Dental disease* | $1,671 | $1,671 | bad breath, drooling, dropping food, pawing at mouth |
| 5 | Arthritis* | $448 | $1,360 | hesitating at jumps, stiff gait, reduced activity |
| 6 | Overactive thyroid* | $523 | $1,118 | weight loss despite big appetite, yowling, hyperactivity, vomiting |
| 7 | Diabetes* | $898 | $2,194 | increased drinking/urination, weight loss, increased appetite |
| 8 | Respiratory infection | $593 | — | sneezing, nasal/eye discharge, congested breathing |
| 9 | Inflammatory bowel disease* | $792 | $1,534 | chronic intermittent vomiting, diarrhea, weight loss |
| 10 | Skin allergies* | $342 | $612 | overgrooming, scabs, bald patches, scratching |

### A1.2 Nationwide — top 10 conditions, 2022 claims year (corroborating prior year, text-form lists) [press-release]
Source: https://news.nationwide.com/top-common-conditions-that-prompt-veterinary-visits/ (released 2023-04-13; >1.43M claims for the top-10 conditions in 2022).

| Rank | Dogs (2022) | Cats (2022) |
|---|---|---|
| 1 | Skin allergies | Chronic kidney disease |
| 2 | Ear infection | Bladder/urinary tract disease |
| 3 | Diarrhea/intestinal upset | Vomiting/upset stomach |
| 4 | Vomiting/upset stomach | Diarrhea/intestinal upset |
| 5 | Skin infections | Excessive thyroid hormone |
| 6 | Anal gland inflammation/infection | Dental disease |
| 7 | Arthritis | Diabetes |
| 8 | Non-cancerous skin mass | Skin allergies |
| 9 | Bladder infection | Upper respiratory infection |
| 10 | Dental disease | Ear infection |

### A1.3 Trupanion — top 5 claimed conditions, cumulative 2000–2024 [press-release]
Source: Veterinary Practice News, 2024-12-02, https://www.veterinarypracticenews.com/trupanion-reaches-3-billion-reveals-top-5-claims-for-dogs-and-cats/ — transcribing Trupanion's release (original at https://www.trupanion.com/pet-blog/article/3-billion-pet-insurance-claims, 403 to direct fetch). Basis: 11.1M paid invoices, 2000–2024, ranked by total claim count since 2000; dollar figures are cumulative paid claims, not the rank basis. Caveat: secondary coverage varies on dog ranks 2–4 ordering (VPN prints diarrhea>limping>vomiting; other coverage prints limping>vomiting>diarrhea); dollar figures identical across versions.

| Rank | Dogs (2000–2024) | Paid claims | Cats (2000–2024) | Paid claims |
|---|---|---|---|---|
| 1 | Allergy and otitis | $128,471,744 | Renal failure | $9,618,255 |
| 2 | Diarrhea | $66,742,702 | Vomiting | $18,401,635 |
| 3 | Limping | $78,592,984 | Diarrhea | $6,128,976 |
| 4 | Vomiting | $80,462,404 | Diabetes | $5,822,469 |
| 5 | Mass lesion | $103,604,609 | Hyperthyroidism | $3,456,438 |

### A1.4 Embrace — top 5 claims, 2021 claims year [press-release, primary PDF]
Source: Embrace PDF (July 2021, "Based on 2021 Embrace Pet Insurance claims data"), https://assets.ctfassets.net/nx3pzsky0bc9/IjnvHVVTEOzbwOwjDWBuL/2e63f01d8a2b8202c4f3ed4a7750c364/Embrace_Pet_Insurance_Top_2020_Insurance_Claims_07.01.22.pdf — verbatim lists from the PDF text layer:

- **Dogs:** 1. Intestinal issues (vomiting/diarrhea) · 2. Ear infections (otitis/otitis externa) · 3. Allergies · 4. Urinary tract infections · 5. Pruritus (itching)
- **Cats:** 1. Intestinal issues (vomiting/diarrhea) · 2. Cancer · 3. Hyperthyroidism · 4. Kidney disease · 5. Diabetes mellitus
- The PDF states "The number one reason Embrace pet parents bring their cats to the vet is stomach issues."

### A1.5 Healthy Paws [press-coverage; current primary list: not found]
- Current species-ranked list: **not found** — live "cost of care" pages carry cost trends only (checked https://www.healthypawspetinsurance.com/common-pet-illnesses-and-accidents.html, 2026); the 2019 report PDF is now 404.
- 2016 report via CBS coverage, https://www.cbsnews.com/news/pet-health-care-costs-can-top-human-medical-bills-new-cat-and-dog-health-insurance-report/ : dogs — stomach issues, skin conditions, ear and eye infections, growths, chronic allergies and pain; cats — stomach issues, skin issues, urinary tract infections, cancer, kidney disease, eye and ear conditions, heart and respiratory problems. [press-coverage, 2016]

### A1.6 Agria (Sweden) [peer-reviewed, cats; dogs: recent ranking not found]
- **Cats 2011–2016** — Hadar et al. 2023, Veterinary Record, https://bvajournals.onlinelibrary.wiley.com/doi/10.1002/vetr.2778 (abstract via https://api.semanticscholar.org/graph/v1/paper/DOI:10.1002/vetr.2778): >1.6M cat-years-at-risk; most common purebred morbidity categories: **digestive, whole body, injury, urinary lower, skin, female reproduction** (per-category rates paywalled).
- **Cats 1999–2006** — Egenvall et al. 2010, J Feline Med Surg, https://pmc.ncbi.nlm.nih.gov/articles/PMC11135553 : **875 (95% CI 858–892) cats with claims per 10,000 cat-years at risk**; the three leading claim causes were **trauma, gastrointestinal problems, lower urinary tract problems**; males <9y had 2–3× the female rate of lower urinary problems. [pre-2020 — noted]
- **Dogs** — a recent (2020+) Agria all-condition ranked morbidity list: **not found** in accessible form; excluded rather than approximated.

## §A2 Primary-care prevalence studies

### A2.1 Dogs — VetCompass (O'Neill et al. 2021; 2016 data) [peer-reviewed]
"Prevalence of commonly diagnosed disorders in UK dogs under primary veterinary care," The Veterinary Journal 2021; random sample **n = 22,333 dogs** from 784 clinics out of 905,543 under care in **2016**. Full text: https://pmc.ncbi.nlm.nih.gov/articles/PMC7888168/ (PubMed: https://pubmed.ncbi.nlm.nih.gov/33593363/).

**Top 20 precise-level disorders (1-year period prevalence, 95% CI):**

| # | Disorder | Prev. | 95% CI | Owner-observable home signs |
|---|---|---|---|---|
| 1 | Periodontal disease | 12.52% | 12.09–12.97 | bad breath, tartar, drooling, dropping food |
| 2 | Otitis externa | 7.30% | 6.97–7.65 | head shaking, ear scratch, ear odor/discharge |
| 3 | Obesity | 7.07% | 6.74–7.42 | weight/body-shape change (weigh-in event) |
| 4 | Overgrown nail(s) | 5.52% | 5.23–5.83 | clicking on floor, snagging |
| 5 | Anal sac impaction | 4.80% | 4.52–5.08 | scooting, licking rear, fishy odor |
| 6 | Diarrhoea | 3.81% | 3.57–4.07 | loose stool event |
| 7 | Vomiting | 3.04% | 2.82–3.27 | vomit event |
| 8 | Lameness | 2.65% | 2.44–2.87 | limp event |
| 9 | Osteoarthritis | 2.34% | 2.14–2.54 | stiffness, stairs/jump reluctance, slow rising |
| 10 | Aggression | 2.24% | 2.05–2.45 | growl/snap/bite incident |
| 11 | Conjunctivitis | 2.24% | 2.05–2.44 | red eye, discharge, squinting |
| 12 | Heart murmur | 2.13% | 1.94–2.32 | not directly observable — proxies: cough, exercise intolerance, breathing rate |
| 13 | Skin mass | 2.07% | 1.89–2.27 | lump found |
| 14 | Flea infestation | 2.05% | 1.87–2.25 | fleas/flea dirt seen, scratching |
| 15 | Pruritus | 1.63% | 1.46–1.80 | scratching/licking bout |
| 16 | Allergy | 1.57% | 1.41–1.74 | scratching, paw chewing, recurrent ears |
| 17 | Undesirable behaviour | 1.50% | 1.34–1.66 | behavior incident |
| 18 | Pyoderma | 1.46% | 1.30–1.62 | pustules/scabs/red skin |
| 19 | Lipoma | 1.44% | 1.29–1.61 | soft lump found |
| 20 | Claw injury | 1.38% | 1.23–1.55 | limping, bleeding nail |

**Grouped-level:** dental disorder 14.10% (13.64–14.56) · skin disorder 12.58% (12.15–13.02) · enteropathy 10.43% (10.04–10.84) · musculoskeletal 8.64% (8.27–9.01) · ear disorder 8.17% (7.82–8.54) · obesity 7.07%.

### A2.2 Cats — VetCompass (O'Neill et al. 2023; 2019 data) [peer-reviewed]
"Commonly diagnosed disorders in domestic cats in the UK and their associations with sex and age," J Feline Med Surg 2023; random sample **n = 18,249 cats** from 1,255,130 under care in **2019**. Full text: https://pmc.ncbi.nlm.nih.gov/articles/PMC10812063/ (PubMed: https://pubmed.ncbi.nlm.nih.gov/36852509/).

**Top 20 disorders (1-year period prevalence, 95% CI):**

| # | Disorder | Prev. | 95% CI | Owner-observable home signs |
|---|---|---|---|---|
| 1 | Periodontal disease | 15.2% | 14.72–15.76 | bad breath, drooling, dropping food, pawing mouth |
| 2 | Obesity | 11.6% | 11.12–12.06 | weight/body-shape change |
| 3 | Dental disease | 8.2% | 7.84–8.64 | as periodontal; chewing one-sided |
| 4 | Overgrown nail(s) | 5.2% | 4.91–5.56 | snagging, clicking |
| 5 | Flea infestation | 5.1% | 4.76–5.40 | fleas/flea dirt seen, scratching, overgrooming |
| 6 | Heart murmur | 4.4% | 4.15–4.75 | not directly observable — proxies: breathing rate, lethargy |
| 7 | Weight loss | 3.8% | 3.56–4.12 | weight event (loss) — itself a sign |
| 8 | Vomiting | 3.2% | 2.98–3.49 | vomit event |
| 9 | Abscess | 3.1% | 2.89–3.40 | swelling/wound found, pain to touch |
| 10 | Diarrhoea | 2.9% | 2.62–3.11 | loose stool event |
| 11 | Haircoat disorder | 2.6% | 2.39–2.86 | dull/matted coat, bald patches, overgrooming |
| 12 | Thin/underweight | 2.2% | 1.97–2.40 | weight event (low BCS) |
| 13 | Wound | 2.1% | 1.87–2.29 | wound found |
| 14 | Hyperthyroidism | 1.9% | 1.72–2.13 | weight↓ with appetite↑, yowling, hyperactivity, vomiting |
| 15 | Chronic kidney disease | 1.8% | 1.64–2.03 | drinking↑, urine clumps↑, weight↓, vomiting |
| 16 | Anorexia | 1.7% | 1.56–1.94 | meal refusal event |
| 17 | Conjunctivitis | 1.6% | 1.47–1.85 | red eye, discharge, squinting |
| 18 | Disorder not diagnosed | 1.6% | 1.39–1.76 | — |
| 19 | Flea bite hypersensitivity | 1.5% | 1.29–1.64 | scabs (miliary dermatitis), overgrooming |
| 20 | Osteoarthritis | 1.4% | 1.22–1.56 | jump hesitation, stiffness, reduced activity (widely under-diagnosed) |

### A2.3 Banfield State of Pet Health [press-release; full report tables not publicly accessible]
Source: PRNewswire 2016 release (2015 data; 2.5M dogs + ~500K cats), https://www.prnewswire.com/news-releases/banfield-pet-hospital-releases-state-of-pet-health-2016-report-highlights-10-year-trends-for-common-diseases-300255151.html ; corroborated by https://www.petage.com/banfield-pet-hospital-releases-findings-of-state-of-pet-health-2016-report/ .
- Dental disease: **76% of dogs, 68% of cats** (93% of dogs / 88% of cats over age 3).
- Otitis externa: **13% of dogs, 7% of cats** diagnosed in 2015 (percentages via secondary coverage of the same report).
- Fleas: **5.9 cases/100 dogs; 10.9 cases/100 cats**.
- Diabetes trend: +79.9% in dogs, +18.1% in cats since 2006.
- A ranked all-condition prevalence table for recent years: **not found** publicly (newer releases are single-topic).

## §A3 Chief-complaint / presenting-sign studies

### A3.1 UK general practice, direct observation — Robinson et al. 2015 [peer-reviewed]
"Investigating common clinical presentations in first opinion small animal consultations using direct observation," Veterinary Record 2015, https://bvajournals.onlinelibrary.wiley.com/doi/full/10.1136/vr.102751 . **1,720 consultations, 1,901 patients, 3,206 health problems** (dogs 2,158 problems; cats 881; rabbits 103). Skin was the most frequently affected body system for both presenting and non-presenting problems.

**Owner-reported presenting signs, all species (% of 3,206 problems):** skin lump 4.7% · vomiting 4.1% · inappetence 3.9% · lameness 3.3% · diarrhea 3.2% · weight loss 3.1% · overweight/obese 2.9% · polydipsia 2.8% · pruritus 2.6% · ocular discharge 2.3%.

**Dogs — top owner-reported signs:** skin lump 5.8% (125/2,158) · lameness 3.9% (85) · diarrhea 3.6% (78) · vomiting 3.5% (76) · pruritus 3.3% (71).
**Cats — top owner-reported signs:** vomiting 6.1% (54/881) · weight loss 6.0% (53) · inappetence 5.8% (51) · polydipsia 4.1% (36) · ocular discharge 2.8% (25).
**Top exam findings (all species):** overweight/obese 6.6% · dental tartar 5.6% · skin lump 5.2% · weight loss 5.0% · weight gain 3.3%. (Note the gap: obesity and dental disease are mostly *found by the vet*, not reported by the owner — they need a measurement/photo surface, not a symptom-log surface.)

### A3.2 Emergency — Kim et al. 2014, Korea (3,180 cases) [peer-reviewed; pre-2020, noted]
https://www.e-jvc.org/journal/view.html?doi=10.17555%2Fksvc.2014.04.31.2.90 . **2,784 dogs, 396 cats**, Mar 2012–Aug 2013, referral ER, Korea.
- **Dogs:** vomiting/diarrhea (or both) most common chief complaint → dyspnea → trauma → seizure → lethargy.
- **Cats:** dyspnea most common → vomiting/diarrhea → trauma → **dysuria** → lethargy.
- Vomiting, diarrhea, dyspnea and trauma together ≈ **48.6% of all cases**; underlying causes predominantly GI in dogs vs. urologic in cats.
- A larger 2020+ general presenting-complaint ER study: **not found** — recent Vets Now-based papers are condition-specific.

### A3.3 Telehealth caseload [marketing-grade, no numbers — directional only]
Vetster's "top telemedicine appointment cases" (https://vetster.com/en/wellness/top-veterinary-telemedicine-appointment-cases-by-species): dogs — skin problems, ear infections, parasites, vomiting/fecal concerns, mobility, appetite change; cats — litter-box habit changes, urination volume changes, vomiting/fecal concerns, mobility, appetite change, sneezing/runny eyes. No frequencies published.

## §A4 Synthesis — top owner-observable sign categories by population weight
Ranked by combined weight of evidence (frequency across independent sources × species breadth). Source keys: NW25/NW22 = Nationwide §A1.1/§A1.2 · TRU = Trupanion · EMB = Embrace · AGR = Agria · VC-D/VC-C = VetCompass dog/cat · BAN = Banfield · ROB = Robinson · ER = Kim.

| # | Sign category (loggable event family) | Dog weight | Cat weight |
|---|---|---|---|
| 1 | **Vomiting** | VC-D 3.04%; NW25 D2; TRU D4; ROB 3.5%; ER D1 | VC-C 3.2%; ROB cat #1 (6.1%); NW25 C1; TRU C2; EMB C1; ER C2 |
| 2 | **Diarrhea / stool changes** | VC-D 3.81% (higher than vomiting in dogs); NW25 D2; TRU D2; ROB 3.6% | VC-C 2.9%; NW25 C1; TRU C3 |
| 3 | **Itching / scratching / skin & coat change** | NW #1 dog claim 15 straight years; TRU D1; EMB D3+D5; VC-D pruritus+allergy+pyoderma; ROB: skin = most affected system | NW25 C10; VC-C haircoat 2.6% + flea-bite hypersensitivity 1.5% |
| 4 | **Ear signs** (head shaking, scratching, odor/discharge) | VC-D otitis 7.30% (#2); BAN 13%; NW25 D3; EMB D2 | BAN 7%; NW22 C10 |
| 5 | **Appetite change / meal refusal** | ROB inappetence #3 overall (3.9%) | ROB cat #3 (5.8%); VC-C anorexia 1.7%; gateway for CKD/hyperthyroid/diabetes |
| 6 | **Weight / body condition (measurement)** | VC-D obesity 7.07%; ROB exam finding #1 | VC-C obesity 11.6% + weight loss 3.8% + thin 2.2%; ROB cat weight loss #2 (6.0%) |
| 7 | **Drinking more / polydipsia** | ROB 2.8% | ROB cat 4.1%; proxy for CKD/diabetes/hyperthyroid |
| 8 | **Urinary signs** (straining, frequency, blood, out-of-box) | NW25 D7; EMB D4 | NW25 C2; NW22 C2; ER cat dysuria #4; AGR lower-urinary top-3 both eras |
| 9 | **Lameness / limping / mobility change** | TRU D3; VC-D lameness 2.65% + OA 2.34%; NW25 D4; ROB dog #2 (3.9%) | NW25 C5; VC-C OA 1.4% (under-diagnosed — jump hesitation is the loggable proxy) |
| 10 | **Oral/dental signs** | VC-D periodontal 12.52% (#1); BAN 76%; NW25 D6 | VC-C periodontal 15.2% (#1); BAN 68%; NW25 C4 — caveat: mostly vet-found, weakly owner-reported (ROB) |
| 11 | **Lump / mass found** | ROB dog #1 sign (5.8%); TRU D5; VC-D skin mass + lipoma ⚠ §V.1f — denominator is *presented problems* | VC-C abscess 3.1%; EMB C2 |
| 12 | **Breathing signs** (labored breathing, cough, sneeze, resting rate) | ER D2 dyspnea; NW25 D8 heart disease (cough proxy); VC-D murmur 2.13% | ER C1 dyspnea (cats' #1 ER complaint) ⚠ §V.1a — #1 in the *one published* ranking; NW25 C8 resp infection; VC-C murmur 4.4% |
| 13 | **Trauma / wound / injury** | NW25 D5; ER D3 | VC-C wound 2.1% + abscess 3.1%; AGR trauma #1 claim cause 1999–2006; ER C3 |
| 14 | **Lethargy / energy change** | ER D5 | ER C5 — weak standalone, strong ER-visit driver |
| 15 | **Eye signs** | VC-D conjunctivitis 2.24% | ROB cat #5 ocular discharge (2.8%); VC-C conjunctivitis 1.6% |
| 16 | **Seizure / collapse** | NW25 D10 (new entrant); ER D4 | not in any top cat list found |
| 17 | **Scooting / anal gland** | VC-D anal sac 4.80% (#5); NW22 D6 | negligible — dog-only candidate |
| 18 | **Fleas/parasites seen** | VC-D 2.05%; BAN 5.9/100 | VC-C 5.1% (#5); BAN 10.9/100 |
| 19 | **Behavior change** (aggression, hiding, vocalization) | VC-D aggression 2.24% + undesirable behaviour 1.50% | hyperthyroid yowling; litter avoidance overlaps #8 |

**Structural notes:** GI is the heaviest cross-species family everywhere. Dog-skewed: skin/itch, ears, anal glands, seizures, injury-lameness. Cat-skewed: urinary, weight loss, appetite refusal, polydipsia, dyspnea-at-ER, hyperthyroid behavior. The cat chronic-disease cluster (CKD/hyperthyroid/diabetes/IBD) is owner-observable almost entirely through four generic events — drinking↑, urination↑, weight↓, appetite change — arguing for measurement-type events carrying extra diagnostic weight in cats. Obesity/dental rank top-3 in diagnosis prevalence but near-bottom in owner-reported signs — capture mechanism is weigh-in/photo, not symptom logs.

## §A5 Source-quality notes

| Source | Grade | Years | Caveats |
|---|---|---|---|
| VetCompass dog 2021 | Peer-reviewed; full table verified at PMC | 2016 data | UK-only; 1-yr period prevalence; denominator = dogs under care |
| VetCompass cat 2023 | Peer-reviewed; full table verified at PMC | 2019 data | UK-only; same design |
| Robinson 2015 | Peer-reviewed; direct-observation gold standard for GP presenting signs | 2014–15 | Small (3,206 problems); UK; cat n modest |
| Kim 2014 | Peer-reviewed | 2012–13 | Korea, single referral ER; cat n=396; pre-2020 |
| Nationwide 2025 + 2022 | Press-release (largest US claims base) | 2025, 2022 | Frequency ranks only; insured-population selection bias; lay condition labels |
| Trupanion 2000–2024 | Press-release | cumulative | 25-year pooled; dog ranks 2–4 ordering inconsistent across coverage |
| Embrace 2021 | Press-release, primary PDF | 2021 | Top-5 only, no counts |
| Healthy Paws | Press-coverage only | 2016 | Current list not found |
| Banfield | Press-release (largest US clinical base) | 2015 data | Full tables not public |
| Agria cat papers | Peer-reviewed (abstracts verified) | 1999–2006, 2011–16 | Category rates partly paywalled; dog ranking not found |
| Vetster | Marketing-grade | ~2023 | No frequencies; directional |

**Access notes (reproducibility):** rvc.ac.uk, dvm360, Wiley/BVA, SAGE, and pubmed.ncbi.nlm.nih.gov returned 403 via the session proxy; PMC mirrors and the Semantic Scholar API were the reliable routes. Arithmetic spot-checks passed on Robinson and both VetCompass tables.

---

# Sweep B — Competitor capture-menu teardown

**Method:** vendor sites, help docs, App Store/Play listings, third-party reviews (no app installs — all claims text-sourced; source type labeled per app). Products profiled: 14 (11 assigned + 3 discoveries); one assigned app not found (§B11).

## B1. PetDesk
**Verdict: reminder/comms app, not an event logger. No symptom/observation taxonomy.**
- **To-Dos** — free-text care tasks with times/recurrence (vendor examples: "walk and medication times", "weigh pet weekly", "log side-effects"). No typed event categories.
- **Medications** — structured: name, dosage, start date, frequency, administration route, end date; doses marked complete → reviewable history; vendor advises symptom notes as free text inside the med log.
- Appointment requests (clinic-routed). Clinic-pushed records otherwise.
- Species-conditional: none. Pricing: free to owners (clinic-funded B2B).
- Sources: https://petdesk.com/products/veterinary-mobile-app · https://petdesk.com/blog/using-petdesk-to-remember-pet-medications

## B2. Everkin
**Verdict: closest philosophical analog — structured symptom log + unified Timeline + auto-surfaced correlations.** (All sources vendor marketing; treat sub-field claims accordingly.) **⚠ §V.4c — re-verified 2026-08-30; the smart-insights Timeline is an Everkin+ (paid) feature.**
- Trackers (vendor labels): **Weight · Symptoms · Feedings · Bathroom Habits · Glucose Levels · Seizures · Grooming · Activity · Medications · Allergies · Food Preferences · Medical Conditions · Daily check-ins and mood · Vet visits · Vaccinations/records**
- Sub-detail: symptoms carry "severity levels, detailed notes, and timestamps" + photos; bathroom habits "frequency, consistency, and abnormalities"; glucose linked to meals/insulin; seizures "duration, severity, and trigger analysis"; all feed a Timeline with "smart insights that surface correlations automatically."
- Species-conditional: none (dogs, cats, others — same menu).
- Pricing: free = weight, symptoms, feedings, bathroom, 2 pets; **Everkin+ ($6.99/mo, $49.99/yr) gates glucose + seizure tracking**, PDF summaries, household sharing, unlimited pets.
- Sources: https://everkin.io/ · https://everkin.io/blog/pet-health-tracking/

## B3. DogNote (Pet Journal & Walks)
**Verdict: shared-family activity feed with customizable event types; default list PARTIAL.**
- Found types: Walks (timer) · Meals · Potty times · Medications · Training · Weight (charted) · Vaccinations/appointments (reminders) · **Custom events** ("Create new custom events or just reorder the existing ones") · sleep + bathroom habits (user reviews only).
- Structure: timestamped feed entries with notes + photos; weight the only charted numeric; no severity/sub-fields found; PDF export.
- Pricing: logging free; Premium $4.99/mo / $44.99/yr gates calendar + reports (per review).
- Sources: https://apps.apple.com/us/app/dognote-pet-journal-walks/id1527756855 · https://help.dognote.app/ · https://dognote.app/

## B4. PetNoter and PetnotePlus (two distinct apps)
- **PetNoter:** vaccine & medication tracker (reminders, history) · weight & growth charts · medical-records vault · expenses · free-text notes · tasks · documents · photos. No symptom taxonomy, no meal/stool/urine logging. Multi-species, same menu. Premium $2.99/mo gates documents + photos. https://petnoter.com/ · https://apps.apple.com/us/app/petnoter-pet-care-vet-log/id1580581463
- **PetnotePlus:** "log your pet's weight, temperature, **stool condition**, and more with photos attached" · **custom tracking items** on daily/weekly/monthly routines · trend charts · diary · expenses · sharing up to 15 members. Interesting primitive: user-defined scheduled tracking items. Premium $3.99/mo. https://apps.apple.com/us/app/dog-and-cat-care-petnoteplus/id1553584485

## B5. 11pets: Pet Care
**Verdict: broadest category coverage of any competitor; structured everything + custom categories.**
- **Preventive:** deworming · vaccinations · custom treatment categories. **Medical:** X-rays · analyses/tests · blood work · treatments · conditions · allergies · surgeries · **medical incidents** (photos + notes). **Hygiene:** bathing · teeth brushing · nails · ears (partial list). **Medications:** name/dosage/frequency/reminders. **Vet visits:** reason, professional, cost, notes, photos. **Nutrition:** meal logging (type + amount), schedules. **Behavior:** characteristics evaluation (emoji + star ratings), timeline. **Measurements:** customizable vitals (weight/height/temperature + custom) with **normal-range limits and out-of-range alerts**, trend charts. Expenses, calendar sync.
- Species-conditional: multi-species, same structure. Pricing: free tier limited; premium unlocks "more than 50 features" incl. parts of medical logging.
- Sources: https://www.11pets.com/en/feature · https://apps.apple.com/us/app/11pets-pet-care/id1232470530

## B6. Pet First Aid (American Red Cross)
**Verdict: reference app; storage, not logging.** Pet profiles (meds list, medical history), vet appointments/contacts; the rest is first-aid reference content. Species-conditional **content** toggle (cat/dog) — the only species toggle found in this teardown. Free. https://apps.apple.com/us/app/pet-first-aid/id780415389

## B7. Whistle (manual-log side)
**Status: whistle.com now redirects to tractive.com — brand folded into Tractive; findings archival.**
- Sensor-automatic: licking, scratching, eating, drinking, sleeping, activity; Health Report; wellness score (beta).
- **Owner-manual:** **Daily Check-ins** (mood rating + known-factor tags + optional note) · **Food Pantry** (food brand record + portion calculator) · journal notes. No symptom/event taxonomy beyond mood.
- Dogs only. Sources: https://www.whistle.com/blogs/dogs-love-whistle/whistle-app-update-introducing-daily-check-ins · https://www.reviewed.com/pets/content/whistle-health-review-smart-dog-health-tracker-worth

## B8. Tractive (health-log side)
**Verdict: zero manual health-event logging; everything sensor-derived.** Activity · sleep · resting heart rate · **resting respiratory rate** · scratch detection (dogs only) · bark monitoring (dogs only) · activity/sleep/vitals alerts · weekly AI-summarized reports. Manual entry: profile height/weight only. No symptom diary, vet-visit log, or med log in public docs. https://tractive.com/en/fp/health-monitoring-for-dogs-and-cats

## B9. Purina Petivity (app-side)
**Verdict: device-generated events; owner's only "logging" is corrective labeling.** Auto per litter-box event: which cat · elimination type (#1/#2) · weight · frequency · time of day · box preference. Owner-manual: training labels, event reassignment, profile notes, monthly vet report, GenAI chat. **No independent owner event logging.** Cats only; app free, monitor $129.99–$199.99, no subscription. https://www.petivity.com/pages/petivity-app

## B10. RVC Pet Epilepsy Tracker
**Verdict: deepest single-domain structure (Royal Veterinary College).**
- **Seizure log per episode:** what it looked like · what happened during and after (pre/post-ictal) · duration · **owner-rated severity** · frequency; seizure calendar + graphs.
- **Medication log:** every med, dose, schedule; med calendar; repurchase reminders; per-med alarms. **Weight monitoring** (med side effects). **Blood test logging** (liver function). Notes, contacts, **export to vet (PDF)**, anonymous research sharing.
- Dogs; free. https://apps.apple.com/us/app/rvc-pet-epilepsy-tracker/id992917809 · https://www.rvc.ac.uk/research/animals-in-research/case-studies/canine-epilepsy-research

## B11. Dog Recruit — NOT FOUND
No app of this name surfaced in app stores or web search; nearest real names are DogLog, Doggy Logs (pro walker tool), Doggy Time. Reported as could-not-find rather than guessed.

## Discoveries

### BD1. DogLog (Track your Pet's Life)
**Richest one-tap default menu found. Verbatim default list from the App Store description:** "Food - Water - Treat - Walk - Pee - Poop - Sleep - Teeth brushing - Grooming - Training - Medicine - Custom." Plus weight · temperature · **blood glucose with abnormal-range alerts** · vaccine reminders · **stool quality** · event duration/quantity · custom buttons · photos + caretaker comments · shared multi-caretaker feed · export. Premium $3.99/mo gates vaccination records, medical info storage, >3 pets. https://apps.apple.com/us/app/doglog-track-your-dogs-life/id1229529595 · https://www.doglogapp.com/

### BD2. PetLog – Pet Health Journal (LogFor.Life)
**Richest clinically-structured symptom capture found. Verbatim from the App Store description:** "Log meals and water intake, including type of food (dry, wet, homemade, raw) – Track treats and snacks throughout the day – Monitor symptoms such as vomiting, diarrhea, itching, or unusual behavior – Record symptom severity, duration and end time – Document medications, supplements, dosages and schedules – Keep a detailed weight history and monitor changes over time – Use the **Bristol stool scale** to track bowel movements and digestion – Track daily stress levels and activity patterns – Add notes about mood, sleep, hygiene, exercise and more – Record vet appointments, vaccinations, treatments and diagnoses."
- Notables: only competitor using a clinical stool scale by name; symptoms carry **severity + duration + end time** (episode semantics); typed food-type on meals. Multi-species, same menu. Free core + Plus $1.99/mo–$17.99/yr. https://apps.apple.com/us/app/petlog-pet-health-journal/id6747721421

### BD3. My Pet Child
Condition-specific routine logging: medications (pill reminders) · **symptom diary** ("coughing, lethargy, or stomach upset" + notes/photos; energy, appetite changes) · weight · **insulin routines** · **seizure episodes** (durations) · flea/tick/worming alerts · feeding records (who/when) · walks. Dogs + cats, same menu. Free = 1 pet/1 routine; PRO gates more. https://www.mypetchild.com/

## Sweep B synthesis

### §B-A Deduplicated union of owner-loggable event types (count = products offering it, of 14; "S" = sensor-only)

| Event type | Count | Offering products |
|---|---|---|
| Free-text note / journal | 10 | Everkin, DogNote, PetNoter, PetnotePlus, 11pets, RVC, DogLog, PetLog, MyPetChild, Whistle |
| Medication dose (structured) | 9 | PetDesk, Everkin, DogNote, PetNoter, 11pets, RVC, DogLog, PetLog, MyPetChild |
| Weight | 9 (+2) | same nine (+Tractive profile-field, +Petivity sensor) |
| Photo attached to event | 8 | Everkin, DogNote, PetNoter, PetnotePlus, 11pets, DogLog, PetLog, MyPetChild |
| Meal / feeding | 7 | Everkin, DogNote, 11pets, DogLog, PetLog, MyPetChild, Whistle |
| Vaccination | 6 | Everkin, DogNote, PetNoter, 11pets, DogLog, PetLog |
| Vet visit / appointment | 6 | PetDesk, Everkin, DogNote, 11pets, PetLog, RedCross |
| Stool / poop event | 5 (+1S) | Everkin, DogNote, PetnotePlus, DogLog, PetLog (+Petivity S) |
| Walk / exercise | 5 (+2S) | DogNote, 11pets, DogLog, PetLog, MyPetChild (+Whistle S, Tractive S) |
| Stool consistency/quality sub-field | 4 | Everkin, PetnotePlus, DogLog, PetLog (Bristol) |
| Grooming | 4 | Everkin, DogNote, 11pets, DogLog |
| Condition / diagnosis | 4 | Everkin, 11pets, PetLog, RVC |
| Labs / imaging records | 4 | PetNoter, 11pets, RVC, Everkin |
| Custom event type (user-defined) | 4 | DogNote, PetnotePlus, 11pets, DogLog |
| Urination / pee event | 3 (+1S) | Everkin, DogNote, DogLog (+Petivity S) |
| Symptom w/ severity (generic menu) | 3 | Everkin, PetLog, MyPetChild |
| Seizure episode | 3 | Everkin (premium), RVC, MyPetChild |
| Parasite prevention | 3 | PetNoter, 11pets, MyPetChild |
| Temperature | 3 | PetnotePlus, 11pets, DogLog |
| Mood / daily check-in | 3 | Whistle, Everkin, PetLog |
| Water intake | 2 | DogLog, PetLog |
| Treats | 2 | DogLog, PetLog |
| Glucose reading | 2 | Everkin (premium), DogLog |
| Behavior observation/rating | 2 | 11pets, PetLog |
| Sleep (manual) | 1 (+2S) | DogLog (+Whistle S, Tractive S) |
| Stress level (daily scalar) | 1 | PetLog |
| Vitals w/ range alerts (custom measurements) | 1 | 11pets |
| Litter-box event (elimination type, per-visit weight) | 0 manual (+1S) | Petivity S only |
| Licking / scratching | 0 manual (+2S) | Whistle S, Tractive S |
| Heart rate / respiratory rate | 0 manual (+1S) | Tractive S |

### §B-B Whitespace — types NO competitor structures as a typed, fielded owner event
1. **Vomit as a first-class typed event** — symptom-menu entry (PetLog) or free text at best; nobody gives it its own type with characteristics/photo analysis.
2. **Meal outcome / partial intake / refusal** — meals logged as given, never offered-vs-eaten; nobody structures decline. (Directly validates the intake-is-not-preference wedge.) **⚠ §V.4a — FALSE as stated: PetLog shipped "Reluctant" / "Barely ate" on 2026-08-10. The surviving claim is that nobody *routes* a decline toward a health signal.**
3. **Medication administration outcome** — every med log assumes given/complete; no refused/spat-out/unconfirmed states anywhere.
4. **Respiratory events** (coughing, sneezing, labored breathing) as typed events — symptom-list entries at best.
5. **Skin / ear / eye observations** with structured fields — only 11pets' generic "medical incident."
6. **Itching/scratching as an owner-logged event** — exclusively sensor-derived (Whistle/Tractive); no manual counterpart anywhere.
7. **Body condition score, gait/mobility observation** — absent everywhere.
8. **Occurrence-time semantics (witnessed vs found; time windows)** — every competitor stamps a single point time; none capture discovery vs occurrence.
9. **Species-conditional logging menus** — nobody varies the capture menu by species. Cat-specific observation types (grazing, litter behavior, hiding) are unserved in manual logging.
10. **Behavior events as discrete occurrences** (hiding, vocalization change) — only ratings or notes.

### §B-C Three richest capture menus, ranked
1. **PetLog (LogFor.Life)** — richest clinical structure (severity + duration + end time; Bristol scale; typed food classes). The benchmark for structured symptom capture.
2. **11pets** — broadest category coverage, extensible via custom categories; weakest at fast in-the-moment capture; partially paywalled.
3. **DogLog** — richest fast-capture menu (12 one-tap defaults + custom buttons + multi-caretaker feed); light on clinical sub-fields.
- Honorable mentions: **Everkin** (nearest strategic rival in concept; vendor-marketing-sourced), **RVC** (deepest single-domain fields; the template for episode-type events).

**Pricing note:** where logging is paywalled, the gate falls on *clinical* types — glucose + seizures (Everkin+), vaccination/medical records (DogLog, 11pets), pet count (nearly all). No competitor keeps all health capture free — a direct Pets > $ differentiation point. **⚠ §V.4b — overstated; DogLog's and PetLog's gates fall on records and pet count, not capture. Do not publish the flat form.**

---

# Sweep C — Validated-instrument item inventories

**Purpose:** feed the derive-don't-ask scoring model. Per item: measured what / scale / owner-observable? / event-derivable vs. rating. Verbatim quotes in quotation marks; paywalled content labeled and sourced from cited open reproductions; gaps marked "not found."

## C1. CIBDAI — Canine IBD Activity Index (all 6 items)
**Primary:** Jergens AE et al., J Vet Intern Med 2003;17(3):291–297. https://pubmed.ncbi.nlm.nih.gov/12774968/ . Anchors verbatim from open reproduction https://pmc.ncbi.nlm.nih.gov/articles/PMC12587788/ . Each item 0–3; total 0–18 (≤3 insignificant / 4–5 mild / 6–8 moderate / ≥9 severe).

| # | Item | Scale (verbatim anchors) | Owner? | Event-derivable vs rating |
|---|---|---|---|---|
| 1 | Attitude/activity | 0 normal → 3 severely decreased | Yes | **Rating** |
| 2 | Appetite | 0 normal → 3 severely decreased | Yes | **Rating**; strong proxy derivable from meal-intake events |
| 3 | Vomiting | "0 normal, 1 mild (1×/week), 2 moderate (2–3×/week), 3 severe (>3/week)" | Yes | **EVENT-DERIVABLE** — vomit count/week |
| 4 | Stool consistency | "0 normal, 1 slightly soft feces, 2 very soft feces, 3 watery diarrhea" | Yes | **Event-attribute** — per-stool consistency |
| 5 | Stool frequency | "0 normal, 1 slightly increased (2–3×/day) or fecal blood, mucus or both, 2 moderately increased (4–5×/day), 3 severely increased (>5×/day)" | Yes | **EVENT-DERIVABLE** — stool count/day + blood/mucus flags |
| 6 | Weight loss | "0 none, 1 mild (<5%), 2 moderate (5–10%), 3 severe (>10%)" | Yes | **EVENT-DERIVABLE** — weigh-in % change |

## C2. CCECAI — Canine Chronic Enteropathy Clinical Activity Index (9 items)
**Primary:** Allenspach K et al., J Vet Intern Med 2007;21(4):700–708. https://pubmed.ncbi.nlm.nih.gov/17708389/ . Anchors verbatim from https://pmc.ncbi.nlm.nih.gov/articles/PMC12587788/ . Items 1–6 = CIBDAI; total 0–27 (>12 predicts negative outcome).

| # | Item | Scale | Owner? | Derivable? |
|---|---|---|---|---|
| 7 | Serum albumin | g/L bands | **No — lab-only** | Lab-value (importable, never owner-logged) |
| 8 | Ascites / peripheral edema | 0–3 | Effectively clinician | Clinician rating |
| 9 | Pruritus | "0 no pruritus, 1 occasional episodes of itching, 2 regular episodes if itching but stops when the dog is asleep, 3 dog regularly wakes up because of itching" | Yes | **Near-event-derivable** — itch episodes + "woke from sleep" flag reconstruct the score |

## C3. FCEAI — Feline Chronic Enteropathy Activity Index
**Primary:** Jergens AE et al., J Vet Intern Med 2010;24(5):1027–1033. https://pubmed.ncbi.nlm.nih.gov/20584141/ . **Per-level anchors PAYWALLED**; structure from open reproductions https://pmc.ncbi.nlm.nih.gov/articles/PMC11022500/ and https://academic.oup.com/jvim/article/39/2/jvim70067/8446927 : five clinical criteria 0–3 (attitude/activity, appetite, vomiting, fecal consistency, weight loss) + three biochemistry variables 0/1 + a scored endoscopic-lesions criterion (omittable without endoscopy). **No stool-frequency item** in the clinical set (unlike CIBDAI). A "modified FCEAI (0–20)" also circulates (https://pmc.ncbi.nlm.nih.gov/articles/PMC12290242/) — do not conflate. Owner-observable clinical items: all five; vomiting/consistency/weight event-derivable as in C1.

## C4. Canine pruritus — PVAS (Hill/Rybníček)
**Primary:** Hill PB et al., Vet Dermatol 2007;18(5):301–308, https://pubmed.ncbi.nlm.nih.gov/17845617/ (paywalled; 116 owners; final scale = behavior/severity descriptors on a VAS; 98% of 166 owners found it easy/accurate). Rybníček J et al., Vet Dermatol 2009;20(2):115–122, https://pubmed.ncbi.nlm.nih.gov/19171021/ (713 owners; **normal range 0–1.9**; **visible numbers biased owners — the VAS line is essential**; median 4.4-point fall after treatment). Practice version: Elanco PVAS handout https://assets.elanco.com/0cec44ed-3eaa-0009-2029-666567e7e4de/0c72b22c-470a-4edf-807c-ae86a2e608e0/PVAS.pdf . Tier descriptors verbatim in the handout (10 "does not stop itching… physically restrained" → ~8 "disrupts sleep, eating, play… continues even when distracted" → ~5–6 "itchy periodically through the day… occurs at night when observed" → ~4 "does not itch when eating, playing, exercising, or being distracted" → ~2 "only slightly itchier than what I consider normal" → 0 "Itching is not a problem"). Feline counterpart **VAScat** exists: https://pubmed.ncbi.nlm.nih.gov/35920060/ (paywalled).
**Reading for taxonomy:** a single-item **rating**, but the anchors are frequency + context-disruption facts — scratching/licking/chewing **episode events with context flags** (during eating/play? at night? woke from sleep? continued despite distraction?) can reconstruct the tier.

## C5. Feline lower urinary tract signs (FLUTD/FIC) — owner-observable sign lists

> ⚠ **§V.3** — breadth slice discharged 2026-08-30. All seven rows below are confirmed; the 2025 consensus adds the periuria-vs-spraying distinction, the vocalising pairing, the named non-specific tail and the overgrooming pain attribution. **The three Stella 2011 relative risks below are unverified — do not repeat them.**
No validated scored index; the literature uses sign checklists:
- **iCatCare/ISFM consensus 2025**, J Feline Med Surg, open access https://pmc.ncbi.nlm.nih.gov/articles/PMC11816079/ : LUTS = "variable combinations of dysuria, haematuria, periuria, pollakiuria and stranguria." Home-monitoring guidance verbatim: monitor "perineal staining, over-grooming of the abdomen, perineum or hindlimbs, and unusual urination indoors"; "The colour and volume of urine passed should be recorded, if known (eg, by assessing the size of the deposit [or 'clump'] where clumping litter is used)."
- **Buffington MEMO 2006**, J Feline Med Surg 8(4):261–268, https://journals.sagepub.com/doi/10.1016/j.jfms.2006.02.002 (paywalled): owner-reported signs = hematuria, dysuria, stranguria, periuria, pollakiuria; outcome tracked as owner-reported recurrence (median weekly → never).
- **Stella JL et al. 2011**, JAVMA 238(1):67–73, https://pubmed.ncbi.nlm.nih.gov/21194324/ : 77-week prospective **daily event recording** of sickness behaviors — decreased food intake (RR 9.3 after unusual events), defecation outside box (RR 9.8), urination outside box (RR 1.6). Precedent that this domain is **counted as discrete daily events**, not rated.

| Owner wording | Clinical term | Event shape |
|---|---|---|
| Urinated outside the box / unusual places indoors | Periuria | EVENT (witnessed-vs-found applies) |
| Straining, in-and-out of box, little/nothing produced | Stranguria | EVENT — observed straining episode; **unproductive cluster = obstruction escalation** |
| More frequent, smaller urinations / small clumps | Pollakiuria | EVENT-derived rate + clump-size attribute |
| Blood-tinged urine or clump | Gross hematuria | EVENT-ATTRIBUTE (blood flag) |
| Crying/vocalizing when urinating | Dysuria | EVENT-ATTRIBUTE (pain flag) |
| Overgrooming abdomen/perineum/hindlimbs | Barbering | EVENT (or coat observation) |
| Defecated outside the box | Perichezia | EVENT |

## C6. Mobility / pain — LOAD, CBPI, FMPI
- **LOAD** (13 items, 0–4 each, total 0–52): Hercock 2009; Walton 2013 open access https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3591443/ ; instrument verbatim from the licensed questionnaire PDF https://assets.elanco.com/0cec44ed-3eaa-0009-2029-666567e7e4de/a17a52fb-1445-4df9-9cb7-3f486ebdf2fa/AU%20LOAD_Follow%20Up_Questionnaire.pdf ("subject to the terms of the Elanco Tiergesundheit AG and University of Liverpool LOAD license agreement"). 11 of 13 items are pure ratings; item 10 ("How often does your dog rest (stop/sit down) during exercise?" Never→Very frequently) is frequency-anchored and derivable from per-walk rest-stop counts; items 5/12 (stiffness after a lie-down) have an occurrence-event proxy.
- **CBPI** (11 items): Brown DC et al., AJVR 2007;68:631–637; JAVMA 2008;233:1278–1283 https://pubmed.ncbi.nlm.nih.gov/19180716/ ; official user guide (free to use **only unaltered** with citation) https://assets.elanco.com/0cec44ed-3eaa-0009-2029-666567e7e4de/e64824ca-e759-4a9d-90fb-9fa484fdfedd/canine-bpi-user's-guide-2017-07.pdf . 4 pain-severity NRS + 6 interference NRS + QoL, 7-day recall; all ratings. Validated success = ≥1 severity and ≥2 interference reduction. **Historically dropped items: 'mood' and 'sleep' failed reliability (owners don't uniformly observe sleep)** — a caution for sleep-quality items generally.
- **FMPI / sfFMPI** (17 / 9 activity items, 0–4 "activity performed normally" → "impossible to perform"): Benito J et al., JVIM 2013;27(3):474–482 https://pubmed.ncbi.nlm.nih.gov/23551140/ ; item list via open refinement paper https://pmc.ncbi.nlm.nih.gov/articles/PMC10812168/ ; **owner-facing phrasing LICENSE-GATED** (NC State, https://cvm.ncsu.edu/fmpi/). Items: walk/move, run, jump up, counter-height jump, jump down, stairs up/down, toys, other pets, get up, sit down, stretch, groom, interaction, touch, eat, litter use. All ability ratings; only the "impossible" endpoint is event-like.

## C7. Cough / respiratory
**Finding: no stand-alone validated owner *cough* score exists for canine chronic bronchitis or feline asthma** (searched; not found). What exists:

| Instrument | Species/condition | Status | Respiratory items | Source |
|---|---|---|---|---|
| **FETCH-Q** | Dogs, cardiac | Validated; 17 items 0–5, 7-day window; test-retest r=0.83 | includes coughing + breathing-difficulty items; **full list PAYWALLED** | Freeman LM et al., JAVMA 2005;226(11):1864–1868, https://pubmed.ncbi.nlm.nih.gov/15934254/ |
| **CATCH-Q** | Cats, cardiac | Validated; total 0–80; n=275 | same family; PAYWALLED | Freeman LM et al., JAVMA 2012;240(10):1188–1193, https://pubmed.ncbi.nlm.nih.gov/22559108/ |
| FLAD 12-point score | Cats, lower airway disease | Trial-used, not psychometrically validated; part clinician | "coughing frequency, frequency of respiratory distress" + auscultation (clinician) + condition/appetite | https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0276927 ; https://pubmed.ncbi.nlm.nih.gov/37728391/ |
| Owner cough sliders | Cats, chronic LAD | Survey instrument (not validated) | 0–100 sliders for cough **frequency** and **severity**; medians 48→10 and 42→7 with treatment | https://pubmed.ncbi.nlm.nih.gov/35125012/ |
| BOAS grading | Dogs, brachycephalic | Clinician exercise-test-based; owner questionnaires adjunct | noise, effort, exercise tolerance | https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4469695/ |

Owner-observable event shapes across these: a coughing episode (time-of-day, trigger context) · a respiratory-distress episode · wheeze heard · exercise stopped early — all discrete events; the trial scores are frequency-bucketings of exactly these.

## C8. Quality of life (representative)
- **HHHHHMM scale (Villalobos)** — authorized reprint https://www.pethospicevet.com/wp-content/uploads/2021/02/QualityofLifeScale.pdf ; seven 0–10 criteria (Hurt, Hunger, Hydration, Hygiene, Happiness, Mobility, More-good-days-than-bad; >35 total = acceptable). All global ratings; Hunger/Hydration/Mobility have event-stream proxies (meals, water, seizure/stumble).
- **VetMetrica HRQL** — canine 22 items https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6750605/ ; feline 20 items, 3 domains, 7-point Likert (Noble CE et al., JFMS 2019;21(2):84–94, DOI 10.1177/1098612X18758176; OA feline-OA validation https://pmc.ncbi.nlm.nih.gov/articles/PMC8514988/). **Item wording proprietary** — psychometric benchmark, not a source of loggable items.

## C-§A Deduplicated owner-observable, EVENT-DERIVABLE items (each row: item → deriving event type → instruments fed)

| # | Observable item | Deriving event type | Feeds |
|---|---|---|---|
| 1 | Vomiting episode | `vomit` (exists); count/week buckets 0–3 | CIBDAI 3; CCECAI 3; FCEAI vomiting; Stella 2011 |
| 2 | Stool + consistency | `stool` event + 4-level consistency attribute (CIBDAI anchors map cleanly) | CIBDAI 4; CCECAI 4; FCEAI consistency |
| 3 | Stool frequency | `stool` events/day (2–3 / 4–5 / >5 buckets) | CIBDAI 5; CCECAI 5 |
| 4 | Fecal blood / mucus | flags on `stool` event | CIBDAI 5 (folded into level 1) |
| 5 | Weight / % change | `weight_check` (exists); <5 / 5–10 / >10% buckets | CIBDAI 6; CCECAI 6; FCEAI weight loss |
| 6 | Meal → refused/partial/finished | `meal` + intake rating (exists, Nyx core) | Appetite proxies (CIBDAI/CCECAI/FCEAI); HHHHHMM Hunger; FETCH/CATCH appetite; Stella intake |
| 7 | Itch episode + context flags (at night; woke from sleep; despite distraction; disrupted eating/play) | `itch`/`scratch` events + context attributes | CCECAI 9 (anchors ARE episode frequency + sleep disruption); PVAS tier reconstruction; VAScat analog |
| 8 | Urinated outside box | periuria event | iCatCare 2025; MEMO 2006; Stella 2011 |
| 9 | Straining / unproductive box visits | stranguria event | FLUTD lists; **obstruction escalation** |
| 10 | Urination frequency / clump size | urination events + clump attribute | Pollakiuria (iCatCare quotes clump-size tracking) |
| 11 | Blood-tinged urine | blood flag on urination | Gross hematuria |
| 12 | Vocalizing on urination | pain flag on urination | Dysuria |
| 13 | Overgrooming abdomen/perineum/hindlimbs | overgrooming event | iCatCare sign list |
| 14 | Defecated outside box | perichezia event | Stella 2011 (RR 9.8) |
| 15 | Coughing episode | `cough` event (time-of-day, trigger) | FETCH/CATCH cough items; FLAD frequency; JFMS sliders |
| 16 | Respiratory-distress episode / wheeze | respiratory-distress event | FLAD; **emergency escalation** |
| 17 | **Sleeping/resting respiratory rate** | RRR measurement event (count breaths, pet asleep) | CHF monitoring (§C-C); HHHHHMM Hurt; **the best-validated owner-collected numeric in veterinary medicine** | ⚠ §V.1b — unsourced superlative; never publish it
| 18 | Rested/stopped during a walk | rest-stop count on walk event | LOAD item 10 |
| 19 | Stiff after rest / struggled to rise / refused stairs or jump | discrete mobility observation events | LOAD 5/12, CBPI Rising/Climbing, FMPI level-4 proxies (not full score substitutes) |
| 20 | Seizure / stumble episode | seizure / stumble events | HHHHHMM Mobility; RVC template |
| 21 | Water intake unusually low/high | water-intake observation | HHHHHMM Hydration; PU/PD flagging |

**Design implication:** rows 1–6 mean **CIBDAI is fully derivable** for its whole owner-observable item set; CCECAI derives ~7 of 9 (albumin/ascites are lab/clinician); FCEAI derives its 5 clinical items — the derive-don't-ask goal holds for the entire GI-activity family.

## C-§B Inherently RATINGS (cannot be event-derived; if wanted, must be asked)
Attitude/activity and appetite globals (CIBDAI/CCECAI/FCEAI) · 11 of 13 LOAD items · all CBPI NRS items · all FMPI ability ratings · PVAS global mark (validated only as the unaltered VAS) · ascites grading (clinician) · labs (import-only) · endoscopy (procedure) · FETCH/CATCH severity blends · HHHHHMM criteria · VetMetrica items (proprietary).

## C-§C Home resting/sleeping respiratory rate — the flagship derived measurement
All four primary studies used **owner-collected counts at home**:

| Study | Population | n | Key numbers |
|---|---|---|---|
| Rishniw M et al., Res Vet Sci 2012;93(2):965–969, https://pubmed.ncbi.nlm.nih.gov/22240295/ | Healthy adult dogs, owner-measured, 12–14 one-minute counts | 114 | Mean SRR 13/min; RRR 19/min; healthy dogs "generally have SRR(mean) <30 breaths/min and rarely exceed this rate at any time" |
| Ohad DG et al., JAVMA 2013;243(6):839–843, https://pubmed.ncbi.nlm.nih.gov/24004231/ | Dogs, subclinical left-sided heart disease, home | 190 | SRRmean 16/min; only 1 dog >30/min; subclinical dogs "generally had SRRmean < 25 breaths/min" |
| Ljungvall I et al., JFMS 2014;16(4):281–290, https://pubmed.ncbi.nlm.nih.gov/24170428/ | 87 healthy + 54 subclinical-heart-disease cats, 8–10 occasions ⚠ §V.1e — the 87 = 59 echo-normal + 28 apparently healthy | 141 | Median SRRmean ≈21/min; healthy + mild/moderate cats consistently <30/min; SRRmean >30/min "likely warrant additional evaluation" |
| Porciello F et al., Vet J 2016;207:164–168, https://pubmed.ncbi.nlm.nih.gov/26639825/ | Medically-controlled CHF dogs (51) + cats (22), home | 73 | Median SRRmean 20/min both species; "Most dogs and cats with CHF that is medically well-controlled and stable have SRRmean and RRRmean <30 breaths/min at home" |

**Operational thresholds the field uses:** SRR **<30/min = normal / well-controlled** (both species, all four studies); **sustained >30/min = decompensation flag** warranting vet contact; some MMVD dog guidance uses >40/min as the overt-failure alarm. Trend over repeated counts matters more than a single reading. Practice summary: https://www.cliniciansbrief.com/article/home-respiratory-rate-monitoring-dogs-cats .
**App precedent:** Ceva **Cardalis** RRR app — tap once per breath for 30 s; converts to breaths/min; graphs trend; flags >30 (and MMVD >40). **⚠ §V.1c — neither threshold is verifiable as app behaviour; the >30 operational threshold stands on the four primary studies, not on this app.** https://apps.apple.com/us/app/cardalis/id569166179 · https://play.google.com/store/apps/details?id=com.ceva.cardalisv2&hl=en_US . Emerging automation: smartphone audio/video RR in sleeping dogs, 27 dogs, good agreement (https://www.nature.com/articles/s41598-025-25305-9). No peer-reviewed outcome study of Cardalis itself found.

## C — Cross-cutting cautions
1. **Paywalled/gated content honestly held back:** FCEAI anchors, FETCH-Q/CATCH-Q item lists, FMPI phrasing (NC State license), VAScat items, VetMetrica items. Derive against published structures; never invent anchor text.
2. **License terms matter if items are reproduced in-app:** CBPI free only **unaltered** with citation; LOAD under a Liverpool/Elanco license; FMPI requires NC State permission; PVAS validation showed **visible numbers break the scale** (Rybníček) — a UI warning for any re-rendering.
3. **A derived score is not the validated instrument.** Deriving "CIBDAI-equivalent" numbers from events is defensible arithmetic on published anchors; claiming the validated instrument's clinical meaning requires the instrument as administered. Report derived indices as "computed from logged events using the CIBDAI/CCECAI item definitions."
4. **Frequency-anchored ratings are the conversion frontier:** CCECAI pruritus, PVAS tiers, LOAD item 10, FLAD cough frequency — ratings whose anchors are event counts + context flags; the highest-yield derive-don't-ask targets.
5. **The dropped-item evidence is as useful as the kept items:** CBPI discarded 'mood' and 'sleep' for owner-reliability failure — don't build items owners can't actually witness (the confirmability-gate lesson, independently rediscovered by the pain-instrument field).

---

# §V — Verification pass (2026-08-30, CUL-671)

**Additive, dated, and not a rewrite.** This is a frozen brief (`docs/research/README.md`), so nothing above this line was edited. Every claim this pass touched keeps its original wording in place and carries an inline **⚠ §V.n** pointer to the row here that corrects it — the same shape the taxonomy spec uses for its §9b. Read the claim, then read the correction; the pair *is* the record of what we believed and what we checked.

**Scope.** Discharges the three items `docs/nyx-event-taxonomy-requirements.md` §17 still carried after the 2026-08-26 hard review: (1) the HR-29 corrections fold-in, (2) the remaining fact-check breadth — the FLUTD sign-list beyond what W2 needs, and the competitor claims — and (3) the re-query scope rule, which was **verified as already written into §17 and §2 by the v1.3 pass** and is therefore recorded here, not re-done.

**Headline: no matrix ranking moves — again. But two claims did not survive**, and both are competitive rather than clinical: §B-B whitespace #2 was already false on the day this pack was committed (§V.4a), and the "no competitor keeps all health capture free" line is overstated (§V.4b). Neither had reached public materials — which is precisely what §17's "re-verify before any public-materials use" gate existed to catch.

## §V.1 The HR-29 corrections, folded in

| # | The claim as published | The verified position | Source checked |
|---|---|---|---|
| **a** | §A4 #12 — "cats' #1 ER complaint" | **"#1 in the one published ranking"** — a single Korean referral ER (Kim 2014, cat n=396). Referral caseloads over-weight acuity, so this is not "#1 ER complaint" full stop. Spec §5 row 4 already carries the softened form. | §A3.2 as published |
| **b** | C-§A row 17 — "the best-validated owner-collected numeric in veterinary medicine" | **Unsourced superlative — never publish it.** Nobody has ranked owner-collected measures against each other. Defensible only as "arguably, in veterinary *cardiology*"; what is genuinely unusual, and is the claim to make, is that **four primary studies used owner-collected home counts** (§C-C). | §C-C's own four rows |
| **c** | §C-C — Cardalis "flags >30 (and MMVD >40)" | **Neither threshold is verifiable as app behaviour.** Re-checked 2026-08-30: the public App Store description states no numeric threshold at all — it offers "Easily measure respiratory rate at rest", "Record and track results over time", and "Contact your veterinarian if values increase or if you have concerns." The **>30 operational threshold stands on the four primary studies + the Clinician's Brief practice summary**, which is where it should have been cited from; **>40 is dog-MMVD practice guidance, not an app behaviour.** What the Cardalis citation supports is exactly what spec §5 row 5 uses it for — a tap-counter RRR app exists and graphs a trend. Nothing more. | https://apps.apple.com/us/app/cardalis/id569166179 |
| **d** | The never-hairball rule's Cornell citation (lives in `docs/research/2026-08-signals-deep-dive.md` §4, not in this pack) | **Cornell carries the prevalence, not the confusion.** The Cornell Feline Health Center asthma page says "Asthma is a disease of the lower airways of the lungs that affects between 1 and 5% of cats" and **does not mention hairballs at all**. Cite Cornell for prevalence; cite **VCA** for the confusion — "It is often confused with 'bringing up a hairball,' but no hairball is produced" and "Cats will crouch down and extend their neck when they cough." VCA also independently sources the cough↔vomit cross-contamination caveat the rule rests on: "Severe bouts of coughing may end with a retch and a cat may even bring up stomach contents, such as bile." Of HR-29(d)'s three proposed replacements, **one is dead and one is a vendor** — see §V.4f and below. | Cornell asthma page; https://vcahospitals.com/know-your-pet/coughing-in-cats |
| **e** | §C-C — Ljungvall "87 healthy" cats | The 87 pools **59 echocardiographically normal + 28 apparently healthy** cats, the second group defined without echo screening. Verbatim from the abstract. **Nothing moves:** <30/min is reported for the EN, AH *and* mild/moderate SHD groups alike, so the threshold does not depend on the pooling. | Ljungvall 2014 abstract (JFMS 16(4):281–290) |
| **f** | §A4 #11 / §A3.1 — the lump claim | **Attribution is already correct in this pack** — ROB = Robinson 2015, direct observation, and §A3.1 gives the fraction (125/2,158). The correction is a **phrasing rule for consumers**: the denominator is *presented problems*, not dogs — "the most commonly owner-reported presenting sign in dogs (**5.8% of presented problems**)." Spec §5 row 14 currently omits the denominator → residual, §V.5. | §A3.1 as published |
| **g** | *(new, per CUL-671)* the ISFM quotation rule 8 asked for | See §V.2. | PMC11816079 |

None of the seven moves a matrix ranking, a floor, or a threshold.

## §V.2 The ISFM quotation — and a precision finding on how spec §9a rule 8 cites it

Rule 8 closes with "Put the quotation in the evidence pack." Verified verbatim 2026-08-30 from the **2025 iCatCare/ISFM consensus guidelines** (open access, https://pmc.ncbi.nlm.nih.gov/articles/PMC11816079/):

> "Urethral obstruction (UO), which occurs almost exclusively in male cats, is a manifestation of LUT disease with life-threatening complications." — *Introduction*

**Half of rule 8's attribution sentence is right, and the half that isn't should be narrowed.** The rule says the consensus "carries the every-cat lead sentence and the male intensifier verbatim."

- **The male intensifier is verbatim** — the sentence above. The sex branches now cite a source rather than a house judgement, which is what rule 8 wanted.
- **The every-cat lead sentence is ours.** The consensus contains no owner-facing sentence of the form "Straining without passing pee needs a vet today." What it carries is the *warrant* for one, and the warrant is solid: "almost exclusively" is not "exclusively", so **a female cat is not exempt**; UO is characterised by "life-threatening complications"; and the triage instruction is population-wide — "Cats presenting with LUTS should be triaged rapidly (Box 7) to determine if they have UO."

The rule is clinically sound and **unchanged** — only its attribution needs narrowing, from *"carries … verbatim"* to *"the male intensifier verbatim; the lead sentence is ours, warranted by the consensus's 'almost exclusively' and its population-wide triage instruction."* Proposed as a Tier-2 spec edit, not written (§V.5). This is the same defect class as §V.1a and §V.1b — an attribution stated one notch stronger than the source supports — which is why it belongs in this pass rather than being waved through as a discharged slice.

## §V.3 FLUTD sign-list breadth — the remaining slice, discharged

Re-read the 2025 consensus for owner-observable breadth **beyond** the strain cluster W2 needs and §C5 was written for. **All seven rows of §C5's table are confirmed.** The consensus adds four things a future FLUTD leaf design must know, none of which touches W2:

1. **Periuria must be distinguishable from spraying.** Verbatim: *"Distinguishing periuria from urine spraying is essential to differentiate medical and behavioural causes"*, and LUT disease *"should be excluded before a behavioural cause is assigned."* §C5's table carries one `Periuria` row with no spraying distinction, and spec leaf 6 (`urine_outside_box`, one species-neutral key) inherits that gap. **A W3+ capture-design finding, not a W2 one** — and the safe direction is the consensus's own: a leaf that cannot tell them apart routes toward the **medical** read, never the behavioural one. (Same shape as the intake-is-not-preference invariant: the ambiguous case does not get resolved toward the benign reading.)
2. **Vocalising belongs to the strain presentation** — *"Straining unproductively (and sometimes also vocalising) in the litter tray."* §C5 files vocalising under dysuria; the consensus pairs it with unproductive straining. Both readings are event-attributes, so nothing changes structurally — but a strain leaf's optional attribute set should carry it.
3. **The non-specific tail is named, and named as overlapping** — *"lethargy and hyporexia"*, *"weight loss, polydipsia/polyuria and gastrointestinal signs"*, which the consensus notes overlap with comorbidities such as CKD. A FLUTD-flavoured lane must not read these as urinary; they are the cat chronic-disease cluster §A4's structural note already routes elsewhere.
4. **Overgrooming carries a stated meaning** — *"Overgrooming of the abdomen, perineum and hindlimbs, indicating underlying pain."* §C5's barbering row is confirmed and gains the pain attribution, which matters for spec leaf 10 (`overgrooming`), currently sourced to the sign list alone.

**And one numeric claim in §C5 does not survive as stated.** §C5 cites Stella 2011 with three per-behaviour relative risks — "decreased food intake (RR 9.3…), defecation outside box (RR 9.8), urination outside box (RR 1.6)". The paper is paywalled; the accessible release for the same study reports **12 healthy cats and 20 cats with FIC, over 77 weeks**, a **3.2-fold** increase in sickness behaviours when routine was disrupted, and that "vomiting, urination or defecation outside the litter box and decreased food intake" accounted for **88% / 78%** of all sickness behaviours (healthy / FIC). **The three RRs could not be corroborated from any accessible source, and the pack never states the study's n (32 cats)** — a small-n study cited without its n, with unverifiable per-behaviour numbers. **Do not repeat the RRs.** The structural claim §C5 actually draws from the study — that this domain is *counted as discrete daily events, not rated* — is unaffected, and is what spec leaf 6 cites it for. (Leaf 6's citation reads "Stella 2011 counts it as daily events, RR 1.6–9.8"; the first clause survives, the second should go — §V.5.)

## §V.4 Competitor claims — re-verified, and two do not survive

Method as Sweep B: text sources only, no installs. All re-checked 2026-08-30.

**a) §B-B whitespace #2 is FALSE — and was false on the day this pack was committed.**
The row reads: *"Meal outcome / partial intake / refusal — meals logged as given, never offered-vs-eaten; nobody structures decline. (Directly validates the intake-is-not-preference wedge.)"*
**PetLog** (LogFor.Life — this pack's own §B-C #1 benchmark) shipped **v2.2.1 on 10 Aug 2026**, fourteen days before this pack was committed, adding eating-behaviour categories **"Reluctant" (eats listlessly but tries)** and **"Barely ate"**. That is offered-vs-eaten, typed and structured. The sweep was already stale on this row at publication — and it is the row annotated as validating the wedge, so the correction matters more than its size suggests.
**What survives, and is the claim to make instead: nobody *routes* a decline toward a health signal.** Capture is no longer whitespace; **interpretation still is** — and interpretation is what the invariant is actually about (a refusal is frequently a disease signal, never a preference; CLAUDE.md § safety invariants). A differentiation claim resting on *"nobody captures it"* is now false; one resting on *"nobody acts on it"* is still standing, and was the stronger claim all along.
*No matrix cell moves:* the §5 leaf matrix's E axis cites §B-B #4/#7/#9/#10 and §B-A — never #2, because meal refusal is shipped Nyx behaviour rather than a candidate leaf.
*And the gate held:* `docs/store-listing-copy.md`'s competitive line sources the diet-trial lane to `docs/culprit-competitive-landscape-2026-07.md`, not to this claim, so **nothing public rests on it.**

**b) "No competitor keeps all health capture free" is overstated.**
The §B-C pricing note calls this *"a direct Pets > $ differentiation point"* — the most public-materials-bound sentence in the sweep, and therefore the one §17's gate most exists for. **DogLog**'s paywall (now **$3.99/mo or $39.99/yr**) falls on **records and pet count** — "adding vaccinations and medical info", plus the per-pack pet limit — while the one-tap capture menu it is ranked for (Food · Water · Treat · Walk · Pee · Poop · Sleep · Teeth brushing · Grooming · Training · Medicine · Custom, plus stool quality and temperature) reads as free. **PetLog** likewise states "no login or subscription needed for basic features."
**The accurate version is narrower and still ours: no competitor keeps all health capture free *and* free of a pet-count gate.** Every product surveyed gates something — but for at least two, the gate is on *records* or *pet count* rather than on capture itself. **Do not publish the flat form.**

**c) Everkin — pricing and gating hold; one scope correction.** $6.99/mo, $49.99/yr confirmed; free tier still 2 pets + weight/feedings/bathroom habits/symptoms/vet visits; Everkin+ still gates glucose, seizures, PDF summaries, household sharing, unlimited pets. **Correction:** §B2 presents the Timeline "with smart insights that surface correlations automatically" as a general feature — the current site lists **"health timeline with smart insights" under Everkin+**. Everkin's *insight* layer is paid, which **sharpens** the Pets > $ contrast rather than blunting it. New platform state: iPhone only, iPad and Android "coming soon", web "later in 2026". All still vendor-marketing-grade; the sub-field claims remain uninstallable-unverified, exactly as §B2 warns.

**d) PetLog now advertises analysis, not just capture** — "AI-powered insights to detect patterns and potential health issues" (App Store description). Vendor-grade, unverifiable without an install. **Consequence: the flat claim "no competitor computes food↔symptom correlation" — carried in `docs/research/README.md`'s row for the signals deep-dive — can no longer be published as stated.** It is now contested by a vendor claim nobody here has checked. Either install and check, or narrow the claim to what a text source supports.

**e) Whistle → Tractive holds.** `whistle.com` returns 301 → `tractive.com` (checked 2026-08-30). §B7's archival framing stands.

**f) One cited source is dead.** PetHealthNetwork's "5 Tricky Conditions You Might THINK are Hairballs" now 301s to an IDEXX category page — the article is gone. It was named in HR-29(d) as a replacement citation; **do not use it.** Of that trio, **Trudell** is a vendor selling the AeroKat inhalation chamber, so it is corroboration rather than authority (*"Because cat hairballs are mistakenly believed to be so common, sometimes cats who are heard coughing and retching are assumed to be coughing up a hairball, which may not be the problem"*), and **Hill's** is likewise commercial. **Lead with VCA** (§V.1d) — clinic-grade, and it carries the posture and post-tussive sentences too.

## §V.5 What is still owed after this pass

- **Tier-2 spec edits this pass surfaced — proposed, not written** (Documentation Update Protocol): §5 row 14's lump denominator (§V.1f) · §5 leaf 6's "RR 1.6–9.8" clause (§V.3) · §9a rule 8's attribution sentence (§V.2). None changes a ruling, a floor, a threshold or a score.
- **The three Stella 2011 RRs**, if the domain ever needs them — paywalled paper, needs institutional access.
- **Any competitive claim about *analysis*** (Everkin's correlation surface, PetLog's AI insights) now needs an install; text sources cannot settle it.
- **The §15 real-vet answers** — unchanged, still outstanding.
- Pricing and feature claims date fast: three of the six products re-checked here had moved since the 24 Aug sweep. **Re-verify at use, not at citation.**
