# AI Correlation Confidence Thresholds — When Owner-Logged Data Can Responsibly Claim a Pattern

**Date:** May 2026
**Prepared for:** Nyx product team
**Clinical lens:** Dr. Alex Chen (DVM)
**Owner lens:** Jordan
**Scope:** What the literature says about the methods, latency windows, clinical gold standards, copy conventions, and downstream risks involved when an algorithm surfaces a candidate food→symptom or food→refusal association from owner-logged data. Informs Step 10 (AI Signal Edge Function) — specifically the case where the Signal proposes a pattern from the user's own logs.
**Status:** Point-in-time evidence capture. Not a product decision. Where the literature does not resolve a question, this brief says so rather than filling the gap.

---

## 1. Trigger

The AI Signal is the home-screen surface that turns the Nyx event timeline into a single warm sentence. The most ambitious — and most clinically consequential — output is a pattern claim of the form *"Mochi seems to have more loose stools on the days he eats chicken"* or *"Luna has refused her morning meal three days in a row."*

These raise two problems the literature has direct evidence on:

1. **A statistical problem.** Owner-logged data is sparse, irregular, self-selected. Naive lift / odds-ratio calculations on small N produce false positives quickly. Pharmacovigilance and human-symptom-tracker literatures have spent decades on this exact shape of problem.
2. **A clinical and copy problem.** Even when a pattern is statistically defensible, the gold-standard diagnostic for food–symptom causation is an 8–12 week strict elimination trial followed by re-challenge — not a journal. Anything Nyx surfaces is, by construction, suggestive at best.

Companion briefs: [feeding windows and partial eating](./2026-05-feeding-windows-and-partial-eating.md) covers GI transit and the offered-vs-consumed gap; [event timestamp uncertainty](./2026-05-event-timestamp-uncertainty.md) covers witnessed-vs-discovered precision, which sets the noise floor on the symptom side of any correlation.

---

## 2. Statistical Methodology for Sparse Owner-Reported Association

### 2.1 The sparse-data bias problem

With few incidents and few exposures, maximum-likelihood odds ratios bias upward, often catastrophically — "estimated odds ratios can yield impossibly large values" ([PMC — Bias in Odds Ratios with Sparse Data](https://pmc.ncbi.nlm.nih.gov/articles/PMC10165217/)). Standard remediation: Firth's correction, exact methods, mid-P, Bayesian priors. **Fisher's exact test** is the conventional 2×2 fall-back when cell counts are <5 or total N <20 ([DataCamp — Fisher's Exact Test](https://www.datacamp.com/tutorial/fishers-exact-test); [Influential Points — Use and Misuse](https://influentialpoints.com/Training/Fishers_exact_test_use_and_misuse.htm)).

### 2.2 Pharmacovigilance — the closest analogue

The nearest signal-detection cousin to Nyx's problem (many candidate exposures, sparse adverse events, no controlled study) is post-market drug safety. Standard methods are the **proportional reporting ratio (PRR)**, **reporting odds ratio (ROR)**, **information component (IC)**, and **empirical Bayes geometric mean (EBGM)** ([IntechOpen — Data Mining in Pharmacovigilance](https://www.intechopen.com/chapters/38579); [Drug Safety / Springer](https://link.springer.com/article/10.1007/s40264-024-01433-5)).

Both PRR and ROR "tend to produce false-positive signals in settings of sparse data," which is why Bayesian alternatives (BCPNN, MGPS) were developed — they "shrink the estimates" toward the prior, suppressing spurious signals at small N ([MedipharmSolutions](https://medipharmsolutions.com/blog/biostatistics-in-pharmacovigilance-analyzing-safety-data/); [arXiv — pvEBayes](https://arxiv.org/pdf/2512.01057)).

**Minimum-N thresholds are concrete.** A 2023 sensitivity-and-specificity analysis of the ROR found that to detect an ROR of 2 at sensitivity 0.8, at least **12 expected events** are required; to detect an ROR of 4, just 2 events suffice ([Trillenberg 2023 — Pharmacoepidemiology & Drug Safety](https://onlinelibrary.wiley.com/doi/10.1002/pds.5624)). Below 2 expected events "can be expected to cause sensitivity problems." Owner-logged pet data lives almost entirely in that regime.

### 2.3 The multiple-comparison problem

With a hundred candidate foods at α=0.05, ~5 will appear "significant" by chance alone ([Cornell QBio — Multiple Comparisons](https://physiology.med.cornell.edu/people/banfelder/qbio/resources_2008/1.5_Bonferroni_FDR.pdf); [Handbook of Biological Statistics](http://www.biostathandbook.com/multiplecomparisons.html); [Wikipedia](https://en.wikipedia.org/wiki/Multiple_comparisons_problem)). Bonferroni divides α by the number of tests (conservative, low power); Benjamini–Hochberg controls the false discovery rate — the proportion of declared positives that are false — and is "often preferred" for exploratory work ([Columbia Mailman — FDR](https://www.publichealth.columbia.edu/research/population-health-methods/false-discovery-rate); [arXiv — Benjamini–Hochberg Review](https://arxiv.org/pdf/1406.7117)). Neither is free; Bonferroni at scale suppresses true signals.

### 2.4 The IBS journal validation — the most damning analogue

A 2017 study in the *Journal of Clinical Medicine* tested how reliably clinicians interpret food–symptom journals. Eight providers reviewed 17 IBS patient journals and rated how likely each of five food groups was to trigger that patient's symptoms.

**Agreement was effectively zero: Krippendorff's α = 0.07** ([PMC — IBS Journal Inter-Rater Reliability](https://pmc.ncbi.nlm.nih.gov/articles/PMC5704122/); [MDPI — same study](https://www.mdpi.com/2077-0383/6/11/105)). The authors concluded "there are currently no standardized methods for identifying trigger food(s) from irritable bowel syndrome food and symptom journals."

For Nyx the implication is structural: even when interpreted by trained clinicians, food-symptom journals do not reliably identify triggers. The data itself is ambiguous before any algorithm touches it.

### 2.5 mySymptoms — the only published mass-market analogue

mySymptoms (~500,000 users; IBS/IBD/migraine/eczema) is the most thoroughly documented consumer trigger-finder. Per its [Android](https://mysymptoms.net/user-guide/android/user-guide.htm) and [iOS](https://www.mysymptoms.net/ios-user-guide/) user guides:

- A **"suspect ratio"** ranks items by how often they appear with vs. without the symptom.
- The UI shows an **orange bar (score)** and a separate **green bar (confidence)** — uncertainty is rendered visually alongside the point estimate.
- Disclaimer is in the UI: **"an item appearing in the Top Suspects list doesn't mean it's a cause of your symptom — the algorithm can only identify correlation, not causation."**

This is the published industry norm.

---

## 3. Latency Windows by Symptom Class

This extends the GI-transit data in the [feeding-windows brief](./2026-05-feeding-windows-and-partial-eating.md) onto the symptom side of the correlation window.

- **Acute vomiting**: minutes to ~2 hours post-meal is consistent with dietary indiscretion or rapid-onset hypersensitivity; normal gastric emptying completes in 6–8 hours ([Vetster — Dietary Indiscretion](https://vetster.com/en/conditions/dog/dietary-indiscretion-in-dogs); [WagWalking — Vomiting After Eating](https://wagwalking.com/symptom/why-is-my-dog-throwing-up-after-eating)). Undigested food >8–10 hours post-meal points to motility/obstruction, not acute hypersensitivity ([Houndsy — Undigested Food Hours After Eating](https://www.houndsy.com/blogs/modern-tails/understanding-why-your-dog-is-throwing-up-undigested-food-hours-after-eating)).
- **Bilious vomiting**: fasting-state, early morning, mechanistically *not* bound to a specific recent meal ([AKC — Bilious Vomiting](https://www.akc.org/expert-advice/health/bilious-vomiting-syndrome-in-dogs/)). Including it in a meal-correlation engine would generate spurious associations to whatever the previous evening's food was.
- **Diarrhoea / colitis**: hours to days after the offending food; acute cases resolve in 2–5 days; signs can persist after exposure ceases ([VCA — Colitis in Dogs](https://vcahospitals.com/know-your-pet/colitis-in-dogs); [AKC — Colitis in Dogs](https://www.akc.org/expert-advice/health/colitis-in-dogs/)).
- **Cutaneous adverse food reaction (CAFR)**: the most rigorously quantified window in companion-animal medicine. Olivry & Mueller's 2020 critically appraised topic on **time to flare** ([PMC — Time to Flare CAT](https://pmc.ncbi.nlm.nih.gov/articles/PMC7247231/); [Springer / BMC Vet Research](https://link.springer.com/article/10.1186/s12917-020-02379-3); [PubMed](https://pubmed.ncbi.nlm.nih.gov/32448251/)) reports:

| Species | 50% of animals flare by | 90% flare by |
|---|---|---|
| Dogs (n=234) | 5 days | **14 days** |
| Cats (n=83) | 4 days | **7 days** |

Only 9% of dogs and 27% of cats flared within the first 24 hours. **A 24-hour correlation window misses the median food-allergic dog and nearly all such dogs at sub-day resolution.**

- **Initial elimination-diet response**: 8–12 weeks. Some dogs improve in 4 weeks; others need the full 12 ([Veterinary Skin & Ear — Food Allergies](https://veterinaryskinandear.com/food-allergies-in-dogs/); [VIN / Veterinary Partner](https://veterinarypartner.vin.com/default.aspx?pid=19239&id=4951526); [PetMD — Food Allergies](https://www.petmd.com/dog/conditions/digestive/food-allergies-dogs)). Pruritus "waxes and wanes over a period of weeks" — day-to-day noise readily masquerades as a food correlation.
- **Re-challenge in a sensitised patient**: signs typically return within 1–7 days, "most typically within 1–3 days" ([Veterinary Skin & Ear](https://veterinaryskinandear.com/food-allergies-in-dogs/)) — faster than the original diagnostic window.

A single uniform correlation window collapses these into noise. The literature does not support a one-size window for "food caused symptom."

---

## 4. Clinical Elimination-Diet Protocol — the Gold Standard

The benchmark any owner-logged inference has to be honest about. There is broad consensus across veterinary dermatology and clinical nutrition:

- An **8-week strict elimination diet trial followed by oral re-challenge** is the gold standard for CAFR diagnosis ([Today's Veterinary Practice — Elimination Diet Trials](https://todaysveterinarypractice.com/dermatology/elimination-diet-trials-steps-for-success-and-common-mistakes/); [Clinician's Brief — Diagnosing CAFR](https://www.cliniciansbrief.com/article/diagnosing-cutaneous-adverse-food-reactions-allergic-patient); [Today's Veterinary Practice — Diet Trial Methodology](https://todaysveterinarypractice.com/nutrition/diet-trial-to-identify-food-allergies-in-dogs-and-cats); [Veterinary Practice — Diagnosing CAFR](https://www.veterinary-practice.com/article/diagnosing-cutaneous-adverse-food-reactions); [Wiley / Shimakura 2021](https://onlinelibrary.wiley.com/doi/10.1111/vde.12953)). Duration may extend to 12 weeks; ">90% of dogs and cats with CAFR responded by 8 weeks" when followed strictly ([PMC — CAT on Duration](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4551374/)).
- Diet must be **novel protein** (never eaten by this pet) or **hydrolysed protein** ([NC State Vet Hospital — Hydrolyzed Diets](https://hospital.cvm.ncsu.edu/services/small-animals/nutrition/hydrolyzed-diets/); [Royal Canin Academy](https://academy.royalcanin.com/en/veterinary/how-to-do-an-elimination-diet-for-pets); [VCA — Implementing Elimination-Challenge Trial](https://vcahospitals.com/know-your-pet/implementing-an-elimination-challenge-diet-trial-dog)).
- **No commercially available lab test (serum, hair, saliva, intradermal) reliably diagnoses CAFR.** Blood and saliva tests "have not been shown to provide reliable, repeatable or useful information" ([Tufts Petfoodology — Eliminating Mistakes](https://sites.tufts.edu/petfoodology/2022/04/04/think-your-pet-has-a-food-allergy-eliminating-mistakes-in-elimination-diet-trials/); [Animal Dermatology Group — Food Allergy](https://www.animaldermatology.com/services/food-allergy); [PMC — CAT 4: In vivo / in vitro tests](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5577833/); [JAVMA — Mueller & Olivry 2023](https://avmajournals.avma.org/view/journals/javma/261/S1/javma.22.12.0548.xml)).
- WSAVA Global Nutrition Toolkit provides the published clinic-side framework for diet history-taking ([WSAVA Toolkit](https://wsava.org/wp-content/uploads/2021/04/WSAVA-Global-Nutrition-Toolkit-English.pdf); [WSAVA Nutritional Assessment Guidelines (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11107980/)).
- True food-allergy prevalence is ~1–2% in dogs and <1% in cats receiving veterinary care, against an owner-perceived prevalence that is much higher ([PMC — CAFR Prevalence](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5311844/); [PMC — Common Food Allergens](https://pmc.ncbi.nlm.nih.gov/articles/PMC4710035/); [Veterinary Practice News — Food Allergy: Fact vs Fiction](https://www.veterinarypracticenews.com/food-allergy-november-2018-2/); [Purina Institute](https://www.purinainstitute.com/centresquare/therapeutic-nutrition/food-allergy-and-food-intolerance)).

Where owner-logged data sits relative to this: **supplementary signal, not diagnostic evidence.** Combined with the IBS journal study (α=0.07), the literature converges: journals are a reason to *start* a trial, not a substitute for one.

> **Dr. Chen's lens:** "If an owner shows me a journal saying 'chicken makes Mochi throw up,' I take it as a reason to consider an elimination trial. Not as a diagnosis. The whole point of the 8-week trial is that the journal alone cannot answer this — even in my hands, much less an algorithm's."

---

## 5. How Adjacent Apps Phrase Association Without Claiming Causation

The published copy from mass-market human symptom trackers is consistent: **patterns, not causes**.

- **mySymptoms** — marketing: "you can start to **see patterns and identify potential culprits**" ([mySymptoms.net](https://www.mysymptoms.net/)). In-app: "an item appearing in the Top Suspects list **doesn't mean it's a cause** of your symptom — the algorithm can only identify correlation, not causation. Coincidence sometimes means items not actually associated with a symptom appear in the list" ([User Guide](https://mysymptoms.net/user-guide/android/user-guide.htm)).
- **Bearable** — "**help you identify triggers, factors, and patterns**" with a soft frame: "you might find that specific foods, people, or routines improve or worsen your symptom severity" ([Bearable home](https://bearable.app/); [Chronic Illness Tracker](https://bearable.app/chronic-illness-symptom-tracker-app/)). "The more you track, the more you will be able to **see patterns emerge**."
- **FoodMarble** — frames the question as **personal response**, not allergy diagnosis: "test how your body responds to specific foods" ([FoodMarble](https://foodmarble.com/more/test-food-intolerance-with-foodmarble/)). A real-world evaluation (N=21,462 users, 8,760 challenges) reports per-food trigger rates as proportions, not causal claims ([PMC — FODMAP Reintroduction](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10305236/); [PubMed](https://pubmed.ncbi.nlm.nih.gov/37375587/)).
- **GutDiaries** — "the app **analyzes the probability** of specific ingredients being your triggers" ([GutDiaries](https://www.gutdiaries.com/)). "Probability of being your trigger" is the careful hedge.
- **Cara Care** — positioned as a personal health diary for tracking food, stress, poop, pain ([AppGrooves comparison — Cara vs mySymptoms](https://appgrooves.com/compare/app-mysymptoms-food-diary-and-symptom-tracker-lite-by-skygazer-labs-ltd/app-cara-food-mood-poop-tracker-by-cara-by-hidoc-technologies-gmbh)).

**What is consistent across the genre:** the verbs "see," "identify," "may," "suspect," "probability" dominate. Definitive causal verbs ("causes," "triggers") show up in headlines but are walked back in body copy and explicit disclaimers. Confidence is visually separated from score. The app is never the diagnostic instrument — the journal is input, the algorithm is a pattern-finder, the user (with their clinician) is the decision-maker. **No app surveyed claims to differentiate intolerance from allergy from coincidence.** The IBS journal study explains why.

No directly comparable **pet-side** AI-pattern-finder with published methodology was found in this scan.

---

## 6. Veterinary Hedging Language — How Clinicians Phrase Suggestive-but-Unconfirmed

The published norms here are mature. The 2025 ACVR / ECVDI consensus statement on imaging report foundations is the most authoritative recent source ([Wiley — Scrivani 2025](https://onlinelibrary.wiley.com/doi/10.1111/vru.13471); [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11649853/); [PubMed](https://pubmed.ncbi.nlm.nih.gov/39681983/)).

The standard vocabulary:

- **"Clinical signs consistent with X"** — patient's signs match X without asserting X is the cause. Veterinary patients "do not have 'symptoms.' Instead, they have 'clinical signs' of disease that are observed and reported by others" ([AVMA / NAIC comments](https://content.naic.org/sites/default/files/inline-files/2020_03_04_NAIC%20Model%20Act_AVMA%20Comments_Definition%20of%20Preexisting.pdf)).
- **"Compatible with," "suggestive of," "could represent," "cannot rule out," "is possible," "unlikely"** — the radiology consensus names these as the standard vocabulary for findings of uncertain etiology. Notably: "language suggesting doubt (cannot rule out, is possible, unlikely) does not affect the timeliness of follow-up" — hedged language is not weaker, it is more accurate ([VetCT — 8 C's of Diagnostic Imaging Reports](https://resources.vet-ct.com/the-8-cs-of-veterinary-diagnostic-imaging)).
- **"Differential diagnosis includes…"** — the structured format for candidate causes ranked by likelihood without committing to one ([Clinician's Brief — Differential Diagnosis](https://www.cliniciansbrief.com/article/veterinary-differential-diagnosis-symptoms-disease); [Veterian Key — Clinical Signs Approach](https://veteriankey.com/1-clinical-signs-approach-to-differential-diagnosis/)).
- An NLP-on-clinical-notes study confirmed that disease references in veterinary records "can be negated, hypothetical, generic, historical, refer to another person, **hedged (such as 'could be')**, or part of a differential diagnosis" — unhedged disease references are the minority, not the norm ([PMC — Detecting False-Positive Disease References](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6550178/)).

**The FDA / DCM precedent.** For a regulator-grade example of an association-not-causation finding for a consumer audience: the FDA reported a "potential link" between grain-free diets and DCM while explicitly stating "the FDA has not yet determined the nature of this potential link" ([FDA Q&A on DCM](https://www.fda.gov/animal-veterinary/animal-health-literacy/questions-answers-fdas-work-potential-causes-non-hereditary-dcm-dogs); [AKC — FDA Grain-Free Alert](https://www.akc.org/expert-advice/nutrition/fda-grain-free-diet-alert-dcm/)). A retrospective on this episode warned that "the reversibility argument — used throughout the diet-association literature as implicit proof of causation — is hypothesis-generating at best" ([Veterinary Practice News — Debunking Diet Myths](https://www.veterinarypracticenews.com/debunking-diet-myths-misconceptions/)). It is also a cautionary tale about owner behaviour in response to a soft association claim (§7.2).

**The Bradford Hill framing.** Of the nine Bradford Hill viewpoints (strength, consistency, specificity, temporality, biological gradient, plausibility, coherence, experiment, analogy), only temporality is mandatory ([Wikipedia — Bradford Hill](https://en.wikipedia.org/wiki/Bradford_Hill_criteria); [Health Knowledge — Association vs Causation](https://www.healthknowledge.org.uk/e-learning/epidemiology/practitioners/causation-epidemiology-association-causation); [StatsDirect](https://www.statsdirect.com/help/basics/causality.htm)). An owner-logged signal can satisfy temporality and possibly consistency; almost never the others.

---

## 7. The Cost of a False-Positive Trigger Claim

### 7.1 Owners abandon the diet trial early

Elimination-trial compliance is the well-documented Achilles heel of CAFR diagnosis. The literature names the same failure modes consistently: "giving in to begging," "not waiting long enough," multi-pet contamination, treats and flavoured medications, palatability ([Today's Veterinary Practice — Elimination Diet Trials](https://todaysveterinarypractice.com/dermatology/elimination-diet-trials-steps-for-success-and-common-mistakes/); [Today's Veterinary Nurse — 5 Common Mistakes](https://todaysveterinarynurse.com/nutrition/5-common-elimination-diet-trial-mistakes); [Royal Canin Academy](https://academy.royalcanin.com/en/veterinary/how-to-do-an-elimination-diet-for-pets); [Purina Institute — Diet Elimination Trials](https://www.purinainstitute.com/centresquare/therapeutic-nutrition/diet-elimination-trials); [Whole Dog Journal](https://www.whole-dog-journal.com/food/food-elimination-trial-a-valuable-tool-when-done-correctly/)). Owner education and continued follow-up are the single largest predictors of completion. **Premature conclusions about which food is or isn't the trigger are a primary failure mode.** An app surfacing a confident trigger claim mid-trial can functionally do the same thing as an owner deciding mid-trial that they've "figured it out" — terminate the diagnostic process before it can yield a real answer. The literature does not give crisp dropout-percentage numbers but is uniform that compliance is the dominant obstacle.

### 7.2 Owners switch diets unsupervised

The DCM/grain-free episode demonstrated this at population scale: a perceived association drove millions of owners to switch their dogs to grain-free or boutique diets, with a downstream signal of nutritionally associated DCM that took years to investigate ([FDA — DCM Q&A](https://www.fda.gov/animal-veterinary/animal-health-literacy/questions-answers-fdas-work-potential-causes-non-hereditary-dcm-dogs); [Oakland Veterinary Referral](https://www.ovrs.com/blog/grain-free-diets-and-dog-food/); [Greenland Vet — FDA, DCM and Grain-Free](https://greenlandvet.com/blog/fda-dcm-and-grain-free-diets/)). The broader pattern: "unbalanced home-cooked diets can be problematic if you prepare your dog's food at home without working with a vet or pet nutritionist" ([Doctor Paws](https://doctorpawsco.com/blogs/education/signs-of-nutritional-deficiencies-in-dogs-every-pet-owner-should-know); [Butternut Box — Effects of Poor Diet](https://butternutbox.com/blog/nutrition/poor-diet-in-dogs); [PMC — Dietary Imbalances in a Large Breed Puppy](https://pmc.ncbi.nlm.nih.gov/articles/PMC5731398/)).

### 7.3 The species-specific cat catastrophe

For cats, the cost of a false-positive trigger claim is uniquely sharp. A finicky cat, told (via its owner) that its current diet is suspect, may be transitioned and refuse the alternative:

- "Hepatic lipidosis can occur in cats after as little as **36 hours of fasting**, particularly in overweight individuals" ([Animeal — Cat Not Eating But Active](https://animeal.in/blogs/animeal-blogs/cat-not-eating-but-active-should-i-worry); [Paumanok Vet Hospital — Cat Refusing to Eat](https://www.paumanokvethospital.com/cat-not-eating-causes-remedies/); [Cornell Feline Health — Anorexia](https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/anorexia)).
- "Anorexia can have a severe impact on a mature cat's health if it persists for **as little as 24 hours**" ([PDSA](https://www.pdsa.org.uk/pet-help-and-advice/pet-health-hub/symptoms/my-cats-not-eating); [PetMD — Why Cats Can't Go Without Food](https://www.petmd.com/cat/conditions/digestive/why-your-cat-cant-go-without-food)). For kittens, the threshold collapses to **12 hours**.

A false-positive in a dog produces (at worst) unnecessary diet restriction and expense. A false-positive in a cat can produce a refusal-induced 36-hour fast and acute hepatic lipidosis. **This is the literature's clearest single argument for species-conditional thresholds on any food→symptom claim.**

### 7.4 The base-rate problem

True food-allergy prevalence is ~1–2% in dogs and <1% in cats receiving veterinary care; owner-perceived prevalence is much higher (§4). Any algorithm operating in a low-prevalence space has a base-rate problem — even high specificity produces a positive predictive value dominated by false positives. For the general pet population this is the dominant determinant of whether any surfaced association is more likely true or coincidental.

---

## 8. Refusal-Pattern Detection — the Structurally Similar Problem

Dr. Chen flagged refusal of a previously-eaten food as a clinically meaningful early-warning sign — structurally the same problem as trigger detection: a sparse signal accumulating against a temporal baseline.

**General principle.** "A dog that normally eats well but suddenly refuses food, eats much less than usual, or walks away from the bowl may be showing early signs of illness, pain, stress, or digestive upset" ([CommerceCityVet — Sudden Loss of Appetite](https://www.commercecityvet.com/blog/understanding-sudden-loss-of-appetite-in-dogs-and-cats); [Urbana VC — Sudden Appetite Changes](https://www.urbanavc.com/blog/what-sudden-appetite-changes-in-pets-may-mean); [AMC NY — Loss of Appetite](https://www.amcny.org/pet_health_library/loss-of-appetite/); [PetCare Vet Clinic](https://www.petcarevetclinic.com/when-your-pet-isnt-acting-normal/)). Animals "instinctively hide weakness," so refusal of food is often the first visible behavioural change ([Farmington Vet Hospital](https://www.farmingtonvethospital.com/how-pets-hide-illness-warning-signs/); [Grand Valley Vet — Pet Pain](https://grandvalleyvet.com/pet-pain-why-animals-hide-it-and-what-you-can-do-to-help/)).

**Possible causes:** dental disease (phantom chewing — approaches, sniffs, walks away), GI nausea, early CKD in cats, hepatic disease, foreign body, stress, food-specific aversion ([Pooler Vet — Cat Refusing to Eat](https://poolervet.com/cat-refusing-to-eat-causes-and-quick-solutions/); [Oz Animal Hospital — Picky Eater](https://www.ozanimalhospital.com/is-your-cat-a-picky-eater-or-is-it-something-more/); [iCatCare — Inappetence in Cats](https://icatcare.org/articles/inappetence-in-cats); [VCA — Anorexia in Cats](https://vcahospitals.com/know-your-pet/anorexia-in-cats)).

### 8.1 The CKD precedent — refusal as the earliest signal

The clearest case for refusal as an early-warning signal is feline chronic kidney disease:

- "Weight loss in cats with CKD can begin **up to three years prior to diagnosis**, with an average loss of 8.9% of body weight within one year of diagnosis" ([Vet Practice — Hyporexia and Weight Loss](https://www.veterinary-practice.com/article/hyporexia-unintentional-weight-loss-inappetence-cats); [PMC — Weight Loss in CKD Cats](https://pmc.ncbi.nlm.nih.gov/articles/PMC5032880/); [EveryCat — Weight Loss in CKD](https://everycat.org/cat-health/weight-loss-in-cats-with-chronic-kidney-disease/)).
- "A 2015 study found that 43% of owners of cats with CKD reported an abnormal appetite in the animal"; "approximately 21–92% of caregivers report changes in their CKD cats' appetite" ([Vet Practice](https://www.veterinary-practice.com/article/hyporexia-unintentional-weight-loss-inappetence-cats); [PMC — Ghrelin in CKD Cats](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10385538/)).

Subtle, sustained appetite reduction in cats — exactly the pattern logged meal-completion data could detect over weeks — is a published early indicator of a disease whose detection currently lags clinical signs by 1–3 years.

### 8.2 Statistical asymmetry vs. trigger detection

Refusal detection has one advantage: **the baseline is the pet's own history**, not a population. A cat that has eaten brand X every day for 8 months and skipped four of the last five meals presents a within-subject signal that does not need disproportionality analysis. The base-rate problem (§7.4) does not apply the same way.

It also has one disadvantage: **the false-positive cost is asymmetric in the other direction.** Telling Jordan "Mochi seems to be eating less than usual" when Mochi is fine is low-cost — Jordan checks Mochi. Missing a true refusal pattern that is the first sign of feline CKD costs years of disease progression.

The same lifestyle factors that drive under-reporting of vomit (working owners, multi-pet households, free-feeding) also degrade the signal for refusal: owners who free-feed cannot observe meal-by-meal completion at all, only daily/weekly bowl-empty patterns. The cat hairball / vomit literature has documented this under-reporting bias directly ([PMC — Hair Balls in Cats](https://pmc.ncbi.nlm.nih.gov/articles/PMC10816490/); [Canadian Veterinarians — Hairballs Are Not Normal](https://www.canadianveterinarians.net/media/dojiquvt/hairballs-are-not-normal.pdf)).

---

## 9. Open Questions

The literature does not resolve:

- **No published minimum-N threshold for owner-logged pet food–symptom association.** Pharmacovigilance ROR thresholds (§2.2) are the closest analogue but apply to a different signal structure.
- **No randomised evaluation of food–symptom journal interpretation accuracy in pets.** The IBS journal inter-rater study (α=0.07) is the closest analogue; no veterinary parallel exists.
- **No published comparator of the false-positive rate of a consumer trigger-finder vs. a veterinary elimination trial.** mySymptoms reports its algorithm exists and warns about false positives; no peer-reviewed study quantifies the rate.
- **No published copy-validation study on which phrasings drive owner behaviour change.** Research on causal language in health warnings exists for cigarettes/alcohol ([PMC — Causal Language in Health Warning Labels](https://pmc.ncbi.nlm.nih.gov/articles/PMC6727298/)) but not for pet-food trigger claims. Whether "patterns suggest" vs. "may be associated" vs. "we noticed" produces different downstream owner actions is untested.
- **No published threshold for what duration of partial appetite reduction in a healthy cat warrants flagging.** "24 hours of total anorexia → vet visit" is well-established; partial hyporexia over days or weeks has no comparable consensus number, despite the CKD literature establishing it as the earliest signal of a major disease.
- **No published latency window for behaviour-class symptoms (anxiety, restlessness, lethargy) bound to diet.** Vomit, diarrhoea, and pruritus have published windows. Behaviour-class symptoms do not.
- **No published guidance on weighting discovered (un-witnessed) events in a correlation engine.** The companion [event-timestamp uncertainty brief](./2026-05-event-timestamp-uncertainty.md) §6 raised this; this brief does not close it.
- **No empirical pet-side validation of any AI-driven food–symptom pattern claim.** The closest neighbours (FoodMarble, mySymptoms) are human-side. No veterinary equivalent surfaced.

---

## Sources

### Statistical methodology
- [Bias in Odds Ratios From Logistic Regression With Sparse Data (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC10165217/)
- [Fisher's Exact Test (DataCamp)](https://www.datacamp.com/tutorial/fishers-exact-test)
- [Fisher's Exact Test: Use & Misuse (Influential Points)](https://influentialpoints.com/Training/Fishers_exact_test_use_and_misuse.htm)
- [Biostatistics in Pharmacovigilance (MedipharmSolutions)](https://medipharmsolutions.com/blog/biostatistics-in-pharmacovigilance-analyzing-safety-data/)
- [Data Mining Techniques in Pharmacovigilance (IntechOpen)](https://www.intechopen.com/chapters/38579)
- [Comparators in Pharmacovigilance (Drug Safety / Springer)](https://link.springer.com/article/10.1007/s40264-024-01433-5)
- [Sensitivity and Specificity in Signal Detection with the ROR — Trillenberg 2023 (Wiley)](https://onlinelibrary.wiley.com/doi/10.1002/pds.5624)
- [pvEBayes: Empirical Bayes Methods in Pharmacovigilance (arXiv)](https://arxiv.org/pdf/2512.01057)
- [Multiple Comparisons: Bonferroni and FDR (Cornell QBio)](https://physiology.med.cornell.edu/people/banfelder/qbio/resources_2008/1.5_Bonferroni_FDR.pdf)
- [Multiple Comparisons (Handbook of Biological Statistics)](http://www.biostathandbook.com/multiplecomparisons.html)
- [Multiple Comparisons Problem (Wikipedia)](https://en.wikipedia.org/wiki/Multiple_comparisons_problem)
- [False Discovery Rate (Columbia Mailman)](https://www.publichealth.columbia.edu/research/population-health-methods/false-discovery-rate)
- [Benjamini–Hochberg Algorithm Review (arXiv)](https://arxiv.org/pdf/1406.7117)
- [Inter-Rater Reliability of IBS Journal Interpretations (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC5704122/)
- [Same study (MDPI / J Clin Med)](https://www.mdpi.com/2077-0383/6/11/105)
- [Bradford Hill Criteria (Wikipedia)](https://en.wikipedia.org/wiki/Bradford_Hill_criteria)
- [Causation in Epidemiology — Association and Causation (Health Knowledge)](https://www.healthknowledge.org.uk/e-learning/epidemiology/practitioners/causation-epidemiology-association-causation)
- [Causality and Association (StatsDirect)](https://www.statsdirect.com/help/basics/causality.htm)

### Latency windows
- [Dietary Indiscretion in Dogs (Vetster)](https://vetster.com/en/conditions/dog/dietary-indiscretion-in-dogs)
- [Why Is My Dog Vomiting After Eating (WagWalking)](https://wagwalking.com/symptom/why-is-my-dog-throwing-up-after-eating)
- [Undigested Food Hours After Eating (Houndsy)](https://www.houndsy.com/blogs/modern-tails/understanding-why-your-dog-is-throwing-up-undigested-food-hours-after-eating)
- [Bilious Vomiting Syndrome in Dogs (AKC)](https://www.akc.org/expert-advice/health/bilious-vomiting-syndrome-in-dogs/)
- [Colitis in Dogs (VCA)](https://vcahospitals.com/know-your-pet/colitis-in-dogs)
- [Colitis in Dogs (AKC)](https://www.akc.org/expert-advice/health/colitis-in-dogs/)
- [Time to Flare of Cutaneous Signs After Dietary Challenge — Olivry & Mueller (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC7247231/)
- [Same paper (Springer / BMC Vet Research)](https://link.springer.com/article/10.1186/s12917-020-02379-3)
- [Same paper (PubMed)](https://pubmed.ncbi.nlm.nih.gov/32448251/)
- [Food Allergies in Dogs (Veterinary Skin & Ear)](https://veterinaryskinandear.com/food-allergies-in-dogs/)
- [Food Allergies in Dogs and Cats (VIN / Veterinary Partner)](https://veterinarypartner.vin.com/default.aspx?pid=19239&id=4951526)
- [Food Allergies in Dogs (PetMD)](https://www.petmd.com/dog/conditions/digestive/food-allergies-dogs)

### Clinical elimination-diet protocol
- [Elimination Diet Trials: Steps for Success and Common Mistakes (Today's Veterinary Practice)](https://todaysveterinarypractice.com/dermatology/elimination-diet-trials-steps-for-success-and-common-mistakes/)
- [Performing a Diet Trial (Today's Veterinary Practice)](https://todaysveterinarypractice.com/nutrition/diet-trial-to-identify-food-allergies-in-dogs-and-cats)
- [Diagnosing CAFR (Veterinary Practice)](https://www.veterinary-practice.com/article/diagnosing-cutaneous-adverse-food-reactions)
- [Diagnosing CAFR in the Allergic Patient (Clinician's Brief)](https://www.cliniciansbrief.com/article/diagnosing-cutaneous-adverse-food-reactions-allergic-patient)
- [Results of Food Challenge in Dogs with CAFR — Shimakura 2021 (Wiley)](https://onlinelibrary.wiley.com/doi/10.1111/vde.12953)
- [Hydrolyzed Diets (NC State Vet Hospital)](https://hospital.cvm.ncsu.edu/services/small-animals/nutrition/hydrolyzed-diets/)
- [Elimination Diet Trials for Dogs and Cats (Royal Canin Academy)](https://academy.royalcanin.com/en/veterinary/how-to-do-an-elimination-diet-for-pets)
- [Implementing an Elimination-Challenge Diet Trial (VCA)](https://vcahospitals.com/know-your-pet/implementing-an-elimination-challenge-diet-trial-dog)
- [CAT 1: Duration of Elimination Diets (PMC)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4551374/)
- [CAT 2: Common Food Allergen Sources (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4710035/)
- [CAT 3: Prevalence of CAFR (PMC)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5311844/)
- [CAT 4: In vivo / in vitro tests for AFR (PMC)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5577833/)
- [Food Allergy in Dogs and Cats — Mueller & Olivry 2023 (JAVMA)](https://avmajournals.avma.org/view/journals/javma/261/S1/javma.22.12.0548.xml)
- [Think Your Pet Has a Food Allergy? (Tufts Petfoodology)](https://sites.tufts.edu/petfoodology/2022/04/04/think-your-pet-has-a-food-allergy-eliminating-mistakes-in-elimination-diet-trials/)
- [Food Allergy (Animal Dermatology Group)](https://www.animaldermatology.com/services/food-allergy)
- [Food Allergy: Fact vs Fiction (Veterinary Practice News)](https://www.veterinarypracticenews.com/food-allergy-november-2018-2/)
- [Pet Food Allergy and Food Intolerance (Purina Institute)](https://www.purinainstitute.com/centresquare/therapeutic-nutrition/food-allergy-and-food-intolerance)
- [Diet Elimination Trials (Purina Institute)](https://www.purinainstitute.com/centresquare/therapeutic-nutrition/diet-elimination-trials)
- [WSAVA Global Nutrition Toolkit (PDF)](https://wsava.org/wp-content/uploads/2021/04/WSAVA-Global-Nutrition-Toolkit-English.pdf)
- [WSAVA Nutritional Assessment Guidelines (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11107980/)

### Adjacent app copy
- [mySymptoms Food Diary (homepage)](https://www.mysymptoms.net/)
- [mySymptoms Android User Guide](https://mysymptoms.net/user-guide/android/user-guide.htm)
- [mySymptoms iOS User Guide](https://www.mysymptoms.net/ios-user-guide/)
- [Bearable Symptom Tracker (homepage)](https://bearable.app/)
- [Bearable Chronic Illness Symptom Tracker](https://bearable.app/chronic-illness-symptom-tracker-app/)
- [FoodMarble — Test Food Intolerance](https://foodmarble.com/more/test-food-intolerance-with-foodmarble/)
- [FODMAP Restriction & Reintroduction in 21,462 Users (PMC)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10305236/)
- [Same paper (PubMed)](https://pubmed.ncbi.nlm.nih.gov/37375587/)
- [GutDiaries (homepage)](https://www.gutdiaries.com/)
- [Comparison: mySymptoms vs Cara Care (AppGrooves)](https://appgrooves.com/compare/app-mysymptoms-food-diary-and-symptom-tracker-lite-by-skygazer-labs-ltd/app-cara-food-mood-poop-tracker-by-cara-by-hidoc-technologies-gmbh)
- [Causal Language in Health Warning Labels (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC6727298/)

### Veterinary hedging language
- [ACVR / ECVDI Consensus on Imaging Report Foundations — Scrivani 2025 (Wiley)](https://onlinelibrary.wiley.com/doi/10.1111/vru.13471)
- [Same statement (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11649853/)
- [Same statement (PubMed)](https://pubmed.ncbi.nlm.nih.gov/39681983/)
- [The 8 C's of Veterinary Diagnostic Imaging Reports (VetCT)](https://resources.vet-ct.com/the-8-cs-of-veterinary-diagnostic-imaging)
- [Creating a Differential Diagnosis List (Clinician's Brief)](https://www.cliniciansbrief.com/article/veterinary-differential-diagnosis-symptoms-disease)
- [Clinical Signs Approach to Differential Diagnosis (Veterian Key)](https://veteriankey.com/1-clinical-signs-approach-to-differential-diagnosis/)
- [Detecting False-Positive Disease References in Veterinary Clinical Notes (PMC)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6550178/)
- [AVMA Comments on Definition of Preexisting (NAIC)](https://content.naic.org/sites/default/files/inline-files/2020_03_04_NAIC%20Model%20Act_AVMA%20Comments_Definition%20of%20Preexisting.pdf)

### False-positive cost
- [FDA Q&A on Non-Hereditary DCM in Dogs](https://www.fda.gov/animal-veterinary/animal-health-literacy/questions-answers-fdas-work-potential-causes-non-hereditary-dcm-dogs)
- [FDA Grain-Free Diet Alert and DCM (AKC)](https://www.akc.org/expert-advice/nutrition/fda-grain-free-diet-alert-dcm/)
- [DCM and Grain-Free Diets (Oakland Veterinary Referral)](https://www.ovrs.com/blog/grain-free-diets-and-dog-food/)
- [FDA, DCM and Grain-Free Diets (Greenland Vet)](https://greenlandvet.com/blog/fda-dcm-and-grain-free-diets/)
- [Debunking Diet Myths and Misinformation (Veterinary Practice News)](https://www.veterinarypracticenews.com/debunking-diet-myths-misconceptions/)
- [5 Common Elimination Diet Trial Mistakes (Today's Veterinary Nurse)](https://todaysveterinarynurse.com/nutrition/5-common-elimination-diet-trial-mistakes)
- [Food Elimination Trial: A Valuable Tool (Whole Dog Journal)](https://www.whole-dog-journal.com/food/food-elimination-trial-a-valuable-tool-when-done-correctly/)
- [Signs of Nutritional Deficiencies in Dogs (Doctor Paws)](https://doctorpawsco.com/blogs/education/signs-of-nutritional-deficiencies-in-dogs-every-pet-owner-should-know)
- [Effects of Poor Diet in Dogs (Butternut Box)](https://butternutbox.com/blog/nutrition/poor-diet-in-dogs)
- [Dietary Imbalances in a Large Breed Puppy (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC5731398/)
- [Anorexia in Cats (VCA)](https://vcahospitals.com/know-your-pet/anorexia-in-cats)
- [Anorexia (Cornell Feline Health Center)](https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/anorexia)
- [Cat Refusing to Eat (Paumanok Vet Hospital)](https://www.paumanokvethospital.com/cat-not-eating-causes-remedies/)
- [Cat Not Eating But Active (Animeal)](https://animeal.in/blogs/animeal-blogs/cat-not-eating-but-active-should-i-worry)
- [Eating Less (Anorexia) in Cats (PDSA)](https://www.pdsa.org.uk/pet-help-and-advice/pet-health-hub/symptoms/my-cats-not-eating)
- [Why Your Cat Can't Go Without Food (PetMD)](https://www.petmd.com/cat/conditions/digestive/why-your-cat-cant-go-without-food)
- [Inappetence in Cats (International Cat Care)](https://icatcare.org/articles/inappetence-in-cats)

### Refusal as early-warning signal
- [Hyporexia and Unintentional Weight Loss in Cats (Veterinary Practice)](https://www.veterinary-practice.com/article/hyporexia-unintentional-weight-loss-inappetence-cats)
- [Evaluation of Weight Loss Over Time in CKD Cats (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC5032880/)
- [Weight Loss in CKD Cats (EveryCat Health Foundation)](https://everycat.org/cat-health/weight-loss-in-cats-with-chronic-kidney-disease/)
- [Ghrelin in Cats with and without CKD (PMC)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10385538/)
- [Sudden Loss of Appetite in Dogs and Cats (Commerce City Vet)](https://www.commercecityvet.com/blog/understanding-sudden-loss-of-appetite-in-dogs-and-cats)
- [Sudden Appetite Changes in Pets (Urbana VC)](https://www.urbanavc.com/blog/what-sudden-appetite-changes-in-pets-may-mean)
- [Loss of Appetite or Anorexia (AMC NY)](https://www.amcny.org/pet_health_library/loss-of-appetite/)
- [Cat Refusing to Eat (Pooler Vet)](https://poolervet.com/cat-refusing-to-eat-causes-and-quick-solutions/)
- [Picky Eater or Something More (Oz Animal Hospital)](https://www.ozanimalhospital.com/is-your-cat-a-picky-eater-or-is-it-something-more/)
- [How Pets Hide Illness (Farmington Vet Hospital)](https://www.farmingtonvethospital.com/how-pets-hide-illness-warning-signs/)
- [Pet Pain — Why Animals Hide It (Grand Valley Animal Hospital)](https://grandvalleyvet.com/pet-pain-why-animals-hide-it-and-what-you-can-do-to-help/)
- [Early Signs Your Pet Is Sick (PetCare Vet Clinic)](https://www.petcarevetclinic.com/when-your-pet-isnt-acting-normal/)
- [Hair Balls in Cats — Owner Under-Reporting (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC10816490/)
- [Hairballs Are Not Normal (Canadian Veterinarians)](https://www.canadianveterinarians.net/media/dojiquvt/hairballs-are-not-normal.pdf)

### Companion briefs
- [Feeding windows and partial eating (Nyx research, May 2026)](./2026-05-feeding-windows-and-partial-eating.md)
- [Event timestamp uncertainty (Nyx research, May 2026)](./2026-05-event-timestamp-uncertainty.md)
