# Feeding Windows, Partial Eating, and Grazing — Clinical Research Brief

**Date:** May 2026
**Prepared for:** Nyx product team
**Clinical lens:** Dr. Alex Chen (DVM)
**Scope:** What the veterinary literature actually says about when food enters a pet, what comes back out and when, and what owner-reported feeding data is worth on a SOAP note.
**Status:** Point-in-time evidence capture. Not a product decision. Informs future schema, design, and correlation-engine decisions.

---

## 1. Feeding Behavior Baselines

**Dogs — discrete, fast meals.** Dogs can consume a meal sufficient for daily caloric needs in roughly 10 minutes; in domestic feeding studies, the modal pattern is 1–4 discrete meals per day, with consumption typically completing in well under 15 minutes for kibble-fed adult dogs ([PMC: Portion size and meal consumption in domesticated dogs](https://pmc.ncbi.nlm.nih.gov/articles/PMC6488012/)). Fast eaters — disproportionately brachycephalic breeds (Bulldogs, Pugs, French Bulldogs) and small terriers — gulp meals in 1–3 minutes with significant aerophagia, raising bloat and post-meal regurgitation risk ([Today's Veterinary Nurse — Brachycephalic GI](https://todaysveterinarynurse.com/nutrition/nutritional-management-of-gastrointestinal-disease-in-brachycephalic-dogs/)). Slow-eater phenotypes are well-recognised in senior dogs, toy breeds, and dogs with dental disease or nausea.

**Cats — grazers by physiology.** Given free access, cats voluntarily distribute intake across 8–20 small meals per 24 hours, eating throughout both light and dark periods ([PMC: Feeding Cats for Optimal Mental and Behavioral Well-Being](https://pmc.ncbi.nlm.nih.gov/articles/PMC7415653/); [Royal Canin Academy — Feeding behavior in cats](https://academy.royalcanin.com/en/veterinary/th-feeding-behavior-in-cats)). The behavioural unit is a "few mouthfuls, walk away, return" pattern — meaningfully different from a dog's discrete meal.

**Free-feeding prevalence.** A 2024 self-reported owner survey (O'Halloran et al., JFMS) found roughly 40–60% of cats are free-fed, with dry food disproportionately free-fed and wet food disproportionately meal-fed ([JFMS 2024 — How and why pet cats are fed](https://pmc.ncbi.nlm.nih.gov/articles/PMC10911312/)). Twice-daily meal feeding sits around 40% of the remaining cohort. For dogs, free-feeding is far less common; the dominant pattern is 1–2 scheduled meals.

**Multi-cat households.** Communal-bowl feeding is the default in most multi-cat homes, and the literature explicitly flags that this defeats individual-intake monitoring. RFID/microchip feeders (SureFeed Connect, Catlink Facelink) and pet-separating automatic feeders have been validated as the only practical means to attribute consumption to a specific cat ([PubMed: Evaluation of a pet-separating automatic feeder](https://pubmed.ncbi.nlm.nih.gov/35762268/)).

**Modifiers of eating speed/pattern:** brachycephaly, age (seniors slower), dental disease, nausea from underlying disease (CKD, pancreatitis), competitive feeding stress, palatability, kibble size and moisture, and temperature.

> **Dr. Chen's lens:** "Offered at 07:00" tells me almost nothing about a free-feeding cat and a fair amount about a Lab. If the app cannot distinguish those two cases, it is averaging clinical signal into noise. For cats specifically, I want to know *whether* the bowl was visited and *whether* intake dropped — exact timestamps matter less than the trend in consumed volume.

---

## 2. GI Transit and Symptom-Correlation Windows

**Gastric emptying.**
- Dogs: complete emptying typically 6–10 hours; one radiographic study reported 7.6 ± 2.0 hours for intact kibble ([Wyse 2003, JVIM — Review of GE methods](https://onlinelibrary.wiley.com/doi/pdf/10.1111/j.1939-1676.2003.tb02491.x); [Miyabayashi 1984](https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1740-8261.1984.tb02143.x)).
- Cats: faster gastric half-emptying (~3–3.5 hours; scintigraphy mean 196 min, ultrasound 203 min) but slower *total* GI transit ([Husnik et al. 2017, JVIM](https://pmc.ncbi.nlm.nih.gov/articles/PMC5354052/)).

**Total GI transit (JAVMA 2022, Beagles vs cats).** Dogs ~828 ± 439 min (~14 hr) postfeeding; cats ~2,441 ± 1,359 min (~40 hr) — roughly a 3× difference ([JAVMA 2022 — GI transit time faster in Beagles vs cats](https://avmajournals.avma.org/view/journals/javma/260/S3/javma.22.07.0287.xml)). Notably, 4/cats in that study had episodes of *delayed* gastric emptying (>5 hr) even at baseline — i.e. baseline cat GI motility is more variable than baseline dog motility.

**Symptom-to-meal latency windows (clinical):**

| Sign | Typical latency from ingestion | Source |
|---|---|---|
| Regurgitation (megaesophagus, oesophageal) | Minutes to a few hours; can be immediate | [VCA — Megaesophagus](https://vcahospitals.com/know-your-pet/megaesophagus); [dvm360](https://www.dvm360.com/view/diagnosis-and-management-megaesophagus-dogs-proceedings) |
| Vomiting of undigested food (overeating / gastric irritation) | 2–3 hours | [Vetsmall / Vet Clinics SAP](https://www.vetsmall.theclinics.com/article/S0195-5616(20)30100-5/abstract) |
| Vomiting of undigested food >8–10 hr post-meal | Suggests delayed gastric emptying / outlet obstruction | [Vet Clinics SAP — Gastric Motility Disorders](https://www.vetsmall.theclinics.com/article/S0195-5616(20)30100-5/abstract) |
| Diarrhoea (acute dietary indiscretion) | 6–24 hours typically | Standard GI references |
| Cutaneous AFR — pruritus on rechallenge, dogs | Median 12 hours; 98% within 7 days | [Olivry & Mueller 2020, BMC Vet Res](https://bmcvetres.biomedcentral.com/articles/10.1186/s12917-020-02379-3) |
| Cutaneous AFR — pruritus on rechallenge, cats | 90% within 7 days | [Olivry & Mueller 2020, BMC Vet Res](https://bmcvetres.biomedcentral.com/articles/10.1186/s12917-020-02379-3) |
| Type I food hypersensitivity (rare, IgE-mediated) | Minutes to ~4 hr | [Royal Canin — Adverse food reactions in dogs](https://academy.royalcanin.com/en/veterinary/an-overview-of-adverse-food-reactions-in-dogs) |
| Chronic enteropathy / IBD | Hours to days; often no clear temporal link | Standard GI references |

**How much does timestamp imprecision matter?** It depends on what you're correlating to.
- For *acute vomiting / regurgitation*, a ±2-hour error between offered_at and consumed_at is large relative to the signal: a regurgitation event 30 min "after a meal" actually offered 2 hours earlier moves you from oesophageal disease (suspect megaesophagus, sliding hiatal hernia) into normal early-postprandial vomiting territory. This is clinically consequential.
- For *cutaneous AFR rechallenge*, where median time to flare is 12 hr in dogs and the diagnostic window stretches to 14 days, ±2 hours of imprecision is negligible.
- For *chronic GI signs over weeks*, the correlation engine is looking for ingredient-level patterns across many meals; per-meal timestamp precision matters less than dietary compliance integrity.

> **Dr. Chen's lens:** Acute symptoms — vomiting, regurgitation, immediate-type allergic reactions — are exactly where I'd use timestamp data for differential diagnosis. If the app gives me "vomited at 14:00, kibble offered at 07:00" and the cat actually ate at 13:30, I'd reach for the wrong diagnosis. For dermatologic AFR work-ups, I care far more about *what* and *whether*, not *when within the day*.

---

## 3. Partial Eating and Refused Food as Clinical Signals

**Hyporexia and anorexia are themselves diagnoses, not absences of data.** Anorexia is a non-specific systemic effect of nearly every feline disease — uraemia, neoplasia, diabetic ketoacidosis, inflammatory/febrile conditions, pancreatitis ([Cornell Feline Health Center — Anorexia](https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/anorexia)). In CKD specifically, 43% of owners report anorexia, hyporexia, or food-preference changes ([JVIM 2021, Spencer et al.](https://onlinelibrary.wiley.com/doi/10.1111/jvim.16268); [Veterinary Practice — Hyporexia](https://www.veterinary-practice.com/article/hyporexia-unintentional-weight-loss-inappetence-cats)). Weight loss in feline CKD can begin up to 3 years before diagnosis.

**The cat-specific 48-hour threshold.** Hepatic lipidosis can develop after as little as 2–3 days of complete anorexia, and more reliably after 1–2 weeks of *reduced* intake; >24–48 hours of refusal in an adult cat is the textbook trigger for veterinary attention ([Merck Vet Manual — Feline Hepatic Lipidosis](https://www.merckvetmanual.com/digestive-system/hepatic-diseases-of-small-animals/feline-hepatic-lipidosis); [Cornell — Hepatic Lipidosis](https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/hepatic-lipidosis); [JVIM 2024 — Wallace et al.](https://onlinelibrary.wiley.com/doi/full/10.1111/jvim.17200)). Overweight cats are at highest risk and decompensate fastest. This makes "didn't eat" in cats a higher-acuity signal than almost any positive log entry.

**Owner volume-estimation reliability.** The veterinary nutrition literature is consistent that owner free-text recall of *amounts* is unreliable. The Dog Aging Project home-diet analysis explicitly noted that without precise measurement, completeness estimates are upper bounds, and recommends veterinarians demand ingredient-level *with amounts*, not general descriptions ([Dog Aging Project home-prepared diets, 2024](https://pubmed.ncbi.nlm.nih.gov/40865554/); [AVMA News summary](https://www.avma.org/news/how-dog-owner-feeding-choices-correlate-nutritional-health-outcomes)). For ongoing monitoring, validated owner-completed appetite tools tend to use *qualitative 5-point ordinal scales* (e.g. ate all / most / about half / a little / none) rather than gram estimates ([JVIM 2021 omeprazole CKD trial](https://onlinelibrary.wiley.com/doi/10.1111/jvim.16268)).

**Diet trial compliance: any deviation invalidates.** Veterinary dermatology consensus is unambiguous. From [Today's Veterinary Practice — Elimination Diet Trials](https://todaysveterinarypractice.com/dermatology/elimination-diet-trials-steps-for-success-and-common-mistakes/) and the WSAVA 2016 food allergy materials: even one treat, one stolen kibble of a housemate's food, one flavoured medication, or one off-leash garbage encounter can confound a trial. With strict adherence, >90% of dogs and cats with cutaneous AFR respond by 8 weeks; with non-adherence, the trial is uninterpretable. The clinical rule is binary: full compliance or trial repeated.

> **Dr. Chen's lens:** "Bowl untouched for 36 hours" in a cat is a higher-priority log entry than any individual meal record. I'd want that to surface to me as a flag, not buried as an absence of events. And for a diet-trial patient, I trust the report exactly to the extent the owner has logged *every* ingestion event — including treats, dental chews, flavoured medications, and "he stole a piece of cheese." A trial with even one off-diet ingestion is a trial I won't read.

---

## 4. How Clinical Practice Actually Tracks Feeding

**WSAVA Diet History Form (2013, still current).** The canonical clinical instrument. Captures: every food and treat consumed, brand and product name, amount per day, who feeds, feeding method (meal vs free-choice), supplements, and flavoured medications ([WSAVA Diet History Form PDF](https://wsava.org/wp-content/uploads/2020/01/Diet-History-Form.pdf); [WSAVA Global Nutrition Toolkit](https://wsava.org/wp-content/uploads/2021/04/WSAVA-Global-Nutrition-Toolkit-English.pdf)). Notably, it asks about feeding *method* (meal vs free-choice) as a first-class field — implicitly acknowledging that "what was offered" is not the same as "what was consumed."

**WSAVA 2011 Nutritional Assessment Guidelines (JSAP).** Treat nutritional assessment as the "fifth vital sign" and require it at every visit ([WSAVA 2011 JSAP](https://wsava.org/wp-content/uploads/2020/01/WSAVA-Nutrition-Assessment-Guidelines-2011-JSAP.pdf)).

**Elimination-trial diary practice.** The published protocols ([Today's Vet Practice](https://todaysveterinarypractice.com/dermatology/elimination-diet-trials-steps-for-success-and-common-mistakes/); [VCA Implementing an Elimination-Challenge Diet Trial](https://vcahospitals.com/know-your-pet/implementing-an-elimination-challenge-diet-trial-dog); [Olivry & Mueller 2020](https://bmcvetres.biomedcentral.com/articles/10.1186/s12917-020-02379-3)) ask owners to log *every* oral exposure (food, treat, chew, flavoured med, supplement, accidental), pruritus score (typically a visual analogue or ordinal scale), and any GI events with timestamp and description. Volume of food is not typically the load-bearing field — *identity* of ingredients is.

**Commercial/academic apps.** No published, validated app currently solves the offered-vs-consumed problem at the food-log level. RFID feeders (SureFeed, Catlink) are the closest thing to a "consumed" sensor, and they record *visits* and *bowl weight before/after*, which is the gold standard for individual feline intake in research settings ([PMC: pet-separating feeder trial](https://pmc.ncbi.nlm.nih.gov/articles/PMC10812286/)).

> **Dr. Chen's lens:** What I actually want from an owner-facing app: the WSAVA diet form, but living and continuously updated, plus a binary "off-diet exposure y/n" flag for trial patients. For consumption, a 5-point ordinal — *all / most / half / little / none* — is what I'd believe. Anything more precise than that from a typical owner is theatre.

---

## 5. Cat-vs-Dog Divergences

**Cats — sickness behaviour is subtle and load-bearing.** Cats evolved as both predator and prey; they hide illness. Appetite decline is often the *first* sign owners notice across CKD, hyperthyroidism, IBD, neoplasia, dental disease, and FIC. Combined with grazing baseline behaviour, this means a 30–50% drop in 24-hour intake can occur without an owner registering a single "missed meal" event ([Cornell Feline Health Center](https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/anorexia); [Catster — Eating Disorders](https://www.catster.com/ask-the-vet/cat-eating-disorders/)). The 48-hour hepatic lipidosis window makes this clinically urgent.

**Dogs — eating speed itself is data.** Dogs eat discretely and fast; a sudden refusal or slowdown in a previously enthusiastic eater is a meaningful, easily detectable signal. Slow-eating phenotypes (seniors, toy breeds, dogs with dental disease, dogs in pain) skew the baseline — what matters clinically is *change from this dog's baseline*, not absolute consumption time. Fast brachycephalic eaters introduce a confounder: post-meal regurgitation or vomiting within 5–15 minutes is often mechanical (aerophagia / overeating) rather than oesophageal disease, so timestamp data must be interpreted against eating-speed phenotype.

> **Dr. Chen's lens:** With cats, the question I ask first is "did intake change from this cat's normal?" — not "did the cat eat at 7am?" With dogs, I'm more interested in discrete events and their proximity to symptoms. The same app surface cannot serve both questions equally well.

---

## 6. Summary of Clinical Implications for Nyx

Bulleted, no recommendations — observations the team can argue over.

- **A single `offered_at` timestamp is structurally biased against cats.** For roughly half of cats (free-fed) and any slow-eating dog, it does not represent ingestion.
- **For acute GI signs (vomiting, regurgitation), ±2 hours of offered-vs-consumed error is clinically meaningful** and can shift differential diagnoses (mechanical post-meal vomiting vs delayed gastric emptying vs oesophageal disease).
- **For cutaneous AFR rechallenge work-ups, timestamp imprecision at the hour level is negligible** — the diagnostic window is 12 hours to 14 days. Ingredient identity and full compliance dominate.
- **The 24–48 hour feline anorexia window is a hard clinical threshold.** Absence of consumption is itself a high-priority event; the data model needs a way to represent "no intake" with the same clarity as "intake occurred."
- **Diet-trial integrity is binary.** Any off-diet exposure (treats, flavoured meds, stolen food, dental chews) potentially invalidates an elimination trial. The system needs to capture non-meal oral exposures as first-class events.
- **Owner volume estimation in grams is unreliable; a 5-point ordinal (all/most/half/little/none) is the validated practical instrument** used in published feline appetite-monitoring trials.
- **Eating-speed phenotype is itself clinical data.** Brachycephalic fast eaters, senior slow eaters, and grazing cats all need different interpretive frames for "ate at X."
- **In multi-cat households, attribution to a specific cat is unsolved without hardware.** Self-reported per-cat consumption is low-confidence data and should be marked as such on any vet-facing output.
- **The WSAVA Diet History Form is the clinical gold standard for static diet history.** Anything Nyx outputs to a vet should be readable as a superset of those fields, not a parallel format.
- **Cutaneous AFR diagnostic latency:** dogs median 12 hr to flare, 98% within 7 days; cats 90% within 7 days. A correlation engine looking only at <24 hour meal-to-symptom windows will miss the bulk of food-allergy signal.

---

## 7. Open Questions the Literature Does Not Resolve

- **Validated accuracy of owner-reported 5-point ordinal consumption scores against gravimetric ground truth.** Practice uses these; their psychometric validation in the home setting is thin.
- **Inter-rater reliability when multiple household members feed the same pet.** WSAVA flags "who feeds" as a field but the literature on disagreement between co-feeders is essentially absent.
- **How clinically meaningful is *eating duration* (slow eating drift) as an early sign in dogs?** Anecdotally important; not well quantified in published cohorts.
- **Symptom-to-meal correlation in cats with chronic GI disease where meals are grazed across hours.** Most correlation research uses meal-fed cohorts; grazers are under-studied.
- **What proportion of "non-compliance" failures in elimination trials are owner-acknowledged vs unrecognised** (e.g. flavoured heartworm preventatives, dental chews owners don't think of as "food")? Quoted compliance rates in the literature almost certainly overestimate true adherence.
- **Optimal latency window for a meal→symptom correlation engine.** Standard practice differs by symptom class (minutes for regurgitation, hours for acute vomiting, hours-to-days for AFR pruritus, days-to-weeks for chronic enteropathy). No single window covers the relevant clinical space.
- **Whether grazing cats experience clinically distinct GI transit kinetics from meal-fed cats** beyond the baseline variability already noted in the JAVMA 2022 transit-time study.

---

## Sources

- [JAVMA 2022 — GI transit faster in Beagles vs cats](https://avmajournals.avma.org/view/journals/javma/260/S3/javma.22.07.0287.xml)
- [Wyse 2003, JVIM — Review of gastric emptying methods 1898–2002](https://onlinelibrary.wiley.com/doi/pdf/10.1111/j.1939-1676.2003.tb02491.x)
- [Husnik 2017, JVIM — Ultrasound vs scintigraphy GE in cats](https://pmc.ncbi.nlm.nih.gov/articles/PMC5354052/)
- [Vet Clinics Small Anim Pract — Gastric Motility Disorders](https://www.vetsmall.theclinics.com/article/S0195-5616(20)30100-5/abstract)
- [Olivry & Mueller 2020, BMC Vet Res — Time to flare in cutaneous AFR](https://bmcvetres.biomedcentral.com/articles/10.1186/s12917-020-02379-3)
- [Royal Canin Academy — Overview of adverse food reactions in dogs](https://academy.royalcanin.com/en/veterinary/an-overview-of-adverse-food-reactions-in-dogs)
- [Today's Vet Practice — Elimination Diet Trials](https://todaysveterinarypractice.com/dermatology/elimination-diet-trials-steps-for-success-and-common-mistakes/)
- [WSAVA Diet History Form](https://wsava.org/wp-content/uploads/2020/01/Diet-History-Form.pdf) / [WSAVA Global Nutrition Toolkit](https://wsava.org/wp-content/uploads/2021/04/WSAVA-Global-Nutrition-Toolkit-English.pdf) / [WSAVA 2011 Nutritional Assessment Guidelines (JSAP)](https://wsava.org/wp-content/uploads/2020/01/WSAVA-Nutrition-Assessment-Guidelines-2011-JSAP.pdf)
- [O'Halloran et al. 2024, JFMS — How and why pet cats are fed](https://pmc.ncbi.nlm.nih.gov/articles/PMC10911312/)
- [PMC — Feeding Cats for Optimal Mental and Behavioral Well-Being](https://pmc.ncbi.nlm.nih.gov/articles/PMC7415653/)
- [Royal Canin Academy — Feeding behavior in cats](https://academy.royalcanin.com/en/veterinary/th-feeding-behavior-in-cats)
- [PMC — Portion size and meal consumption in domesticated dogs](https://pmc.ncbi.nlm.nih.gov/articles/PMC6488012/)
- [Today's Vet Nurse — Nutritional Management of GI Disease in Brachycephalic Dogs](https://todaysveterinarynurse.com/nutrition/nutritional-management-of-gastrointestinal-disease-in-brachycephalic-dogs/)
- [PubMed — Pet-separating automatic feeder, multi-cat weight loss](https://pubmed.ncbi.nlm.nih.gov/35762268/) / [PMC version](https://pmc.ncbi.nlm.nih.gov/articles/PMC10812286/)
- [Merck Vet Manual — Feline Hepatic Lipidosis](https://www.merckvetmanual.com/digestive-system/hepatic-diseases-of-small-animals/feline-hepatic-lipidosis)
- [Cornell Feline Health Center — Hepatic Lipidosis](https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/hepatic-lipidosis) / [Anorexia](https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/anorexia)
- [Wallace et al. 2024, JVIM — Time to enteral nutrition in hepatic lipidosis](https://onlinelibrary.wiley.com/doi/full/10.1111/jvim.17200)
- [Spencer et al. 2021, JVIM — Omeprazole appetite in feline CKD](https://onlinelibrary.wiley.com/doi/10.1111/jvim.16268)
- [Veterinary Practice — Hyporexia & unintentional weight loss in cats](https://www.veterinary-practice.com/article/hyporexia-unintentional-weight-loss-inappetence-cats)
- [Dog Aging Project — home-prepared diets analysis](https://pubmed.ncbi.nlm.nih.gov/40865554/) / [AVMA news summary](https://www.avma.org/news/how-dog-owner-feeding-choices-correlate-nutritional-health-outcomes)
- [dvm360 — Megaesophagus diagnosis & management](https://www.dvm360.com/view/diagnosis-and-management-megaesophagus-dogs-proceedings) / [VCA — Megaesophagus](https://vcahospitals.com/know-your-pet/megaesophagus)
