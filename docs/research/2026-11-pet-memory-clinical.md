# "What Culprit knows about {pet}": the clinical evidence (Dr. Chen's lens)

**Date:** 2026-11-15 · **Status:** frozen point-in-time brief · **Issue:** CUL-2787 · **Method:** read the house context (`docs/personas.md`, `.claude/skills/clinical-guardrails/SKILL.md`, `docs/nyx-care-state-requirements.md`, the `conditions` table in `supabase/migrations/001_schema.sql`, the conditions lines in `supabase/functions/generate-report/render.ts` and `documentV2.ts`, and the two CUL-2753 briefs: the visit summary clinical read and the Nyx ground truth), then a web search and fetch pass on 2026-11-15 covering problem lists, record standards, owner and patient reported history, medication reconciliation, allergy labels, alert fatigue and diagnostic error. **Lens:** Dr. Alex Chen, small animal general practice.

**Claim marks.** `[E: source]` is a claim with a cited source (list in §H). `[inferred]` is a step from a cited source to this setting. `[CJ]` is clinical judgment, Dr. Chen lens, with no source found or none sought.

**Limits of the evidence pass.** Sources were read at abstract, search summary or single page level, not full text. Recheck any figure before it is quoted in a spec. The AAHA Standards of Accreditation are member only and were refreshed in September 2025; the standard numbers below come from a vendor's summary of the older set. No AVMA text on problem list content was retrieved. One veterinary paper (the Dog Aging Project accuracy study) was found by title and abstract only and its journal could not be confirmed. Veterinary evidence on owner reported diagnoses and medication lists is thin, so human medicine carries much of §B. It is an analogue, not proof.

**Scope.** Evidence and clinical reasoning only. This brief states the rules a careful vet would hold. It makes no recommendation about what to build. The two house safety invariants (n=1 never reassures; intake is not preference) are treated as fixed.

---

## 1. Bottom line

- **A problem list is an index of open questions, not a list of answers.** In the problem oriented record a problem is written at the level it is understood today, and it is expected to be refined, combined, inactivated or resolved, each with a date [E: WSU; Melbourne; Guelph].
- **Owner reported history is useful and uneven.** Owners agree well with records for some disease categories and poorly for others (skin and dental are weak), and about four in ten owners who call a dog healthy disagree with the clinical record [E: DAP accuracy study; Rodger 2021]. Human medication lists miss a drug in 10 to 61% of admissions [E: Tam 2005]. Allergy labels are mostly wrong in the over-labelled direction [E: Shenoy 2019; CDC].
- **The rule for an unknown source diagnosis:** record it as history, in the owner's words, with who said it and when. Read the signs as if it were not there. It can explain why a question is asked. It cannot answer the question.
- **The dangerous errors are the quiet ones.** A standing fact does most harm when it explains a sign away. Human medicine has a name for it: diagnostic overshadowing [E: AAFP Lown 2023; Joint Commission]. Premature closure is the most common single cognitive cause of diagnostic error [E: Graber 2005].
- **Ranked by quiet harm in an owner maintained record:** (1) current medications, above all a missing steroid; (2) "resolved" and removed facts; (3) a chronic condition label used as an explanation; (4) vet instructions and carried forward reassurance; (5) weight; (6) drug allergy or adverse reaction; (7) food allergy or dietary restriction; (8) reproductive status and age (§C).
- **Every fact has a shelf life, and the shelf life differs by class.** A weight ages in months. A medication list ages at every visit. A "call me if" ages when its condition is met or its course ends. A "resolved" ages the day the sign returns (§C.3).
- **On the Cooper flag:** the alarm fatigue evidence says repeats lower response. The diagnostic error evidence says a known label hides new disease. Both are true at once. The clinical practice that reconciles them is "a known chronic sign is reported against its own baseline". This brief gives the evidence and does not rule (§D.2).

---

## A. What belongs on a problem list in veterinary practice

### A.1 The problem oriented record

The problem oriented medical record (POMR, or POVMR in veterinary teaching) comes from Lawrence Weed's work in human medicine. It has four parts: a data base (signalment, history, examination, initial tests), a master problem list, plans per problem, and progress notes written as SOAP (Subjective, Objective, Assessment, Plan) [E: WSU].

- **The master problem list sits at the front of the record and works as its index.** One veterinary school calls it "the single most important component of a POMR" [E: WSU]. Another describes it as a living document that reflects all problems over time and shows which are still active [E: Guelph].
- **What counts as a problem.** After Weed: "anything that may require health care management, and that has or could significantly affect the well-being of a patient". That covers clinical signs, examination findings, abnormal lab values and named diseases [E: WSU].
- **Problems are written at the highest level currently understood, and no higher.** The teaching example refines "polyuria" into "hypercalcemia due to lymphosarcoma" only once the work-up supports it [E: WSU]. A working list leans on signs because the diagnosis is often unknown when the problem is first addressed [E: Guelph, secondary].
- **A problem has four possible fates.** Resolved (on its own or with treatment). Redefined (to a higher level of understanding, or merged with other problems that share a cause). Inactivated (no further diagnostic or therapeutic action needed). Left open [E: WSU; Melbourne].
- **Each entry is numbered and dated** in the classic paper form [E: flashcard level source only; treat as convention, not standard].
- **A final diagnosis is not required for entry.** One practice management text says software that demands a final diagnosis before a problem can be listed "must therefore be suspect" [E: VIN, Leak, Morris and Humphries]. The S of SOAP is where client reported information goes. It is kept apart from the O on purpose [E: WSU].

**What this means for the vocabulary** [CJ]:

| Term | Meaning in practice | Who can assert it |
|---|---|---|
| Presenting complaint | Why the owner came. In the owner's words | Owner |
| Problem | A sign or finding that needs managing. Dated. Open | Vet, from history and exam |
| Differential / rule out (r/o) | A candidate cause still under consideration | Vet |
| Presumptive / suspected / working diagnosis | The leading candidate, treated as if true, not proven | Vet |
| Confirmed / definitive diagnosis | Supported by the test that defines it (histology, challenge, assay) | Vet, with the result on file |
| Inactive | No action needed now. Still part of the animal's history | Vet |
| Resolved | Gone, with a date. Can recur | Vet |

### A.2 What the standards bodies say

- **AAHA.** The accreditation standards require problem oriented records (MR 11: "Problem-oriented medical records are utilized"), the weight recorded "each time the patient is presented to the practice" (MR 18), current medications and current medical therapy in the history, and "sufficient information to justify the tentative diagnosis, problems, and treatment" (MR 22 to 24) [E: Instinct 2023, a vendor summary of AAHA text; the standards themselves were not retrieved]. Note the phrase "tentative diagnosis": the standard itself expects hedged diagnoses.
- **AAHA Problem and Diagnosis Terms (AAHA-PDT).** A subset of SNOMED-CT and its veterinary extension, about 3,500 concepts, said to cover more than 90% of small animal cases. The advice is to enter a diagnosis at every visit, and "healthy" is an allowed entry [E: Dennis and Green 2020].
- **RCVS (UK).** Supporting guidance chapter 13: records should give "a complete and relevant account of the animal's clinical history", including examination, treatment, test results, plans, who provided care and advice given (13.2). Records should be "objective and factual" (13.4). They "may be amended to correct errors or factual inaccuracies", but "amendments should not remove or obscure the original entry", and there is "no obligation to amend matters of clinical judgement or professional opinion" at a client's request (13.9) [E: RCVS ch. 13]. The chapter is under review as of late 2025.
- **AVMA and state boards.** The AVMA Model Veterinary Practice Act is advisory. No AVMA text on problem list content was found. State level guidance does name it: West Virginia's board lists "problems, tentative diagnoses or rule outs, and definitive diagnoses, when made" as record content. Ontario's college expects problem lists and differentials, updated as information arrives [E: WVBVM; CVO].
- **VeNom (UK first opinion coding).** One list holds diagnoses, presenting complaints and procedures. When the diagnosis is uncertain the vet picks a presenting complaint term instead, and those terms carry the prefix "presenting complaint" to show they are not a diagnosis [E: VetCompass; VeNom]. VetCompass research takes only the final diagnosis when a diagnosis is revised over time, on the stated assumption that accuracy rises with work-up [E: VetCompass derived study, secondary].
- **SNOMED-CT Veterinary Extension (VetSCT).** Maintained at Virginia Tech. An extension, not a standalone terminology [E: NLM].
- **WSAVA.** The Global Nutrition Guidelines make nutritional assessment a "fifth vital sign" at every visit: diet history, body weight, body condition score (9 point), muscle condition score and weight change [E: WSAVA 2011].

No source found for a formal, shared status vocabulary (active, inactive, resolved) across veterinary systems. The three state split is teaching convention [CJ].

### A.3 What a first opinion vet expects at the top of a chart

Ranked by how soon the eye goes there [CJ, informed by the standards above].

| Item | Detail a vet wants | Why |
|---|---|---|
| Signalment | Species, breed, sex and neuter status, date of birth or age with "estimated" if so | Every differential list starts here |
| Weight and condition | Latest weight with date and scale, the previous weights, BCS and MCS with dates | The most objective serial number in the record [E: WSAVA 2011; AAHA MR 18] |
| Alerts | Drug allergy or adverse reaction (drug, reaction, date), anaesthetic complications, handling or aggression notes | Read before anything is given |
| Current medications | Drug, strength, dose, route, frequency, start date, prescriber. Supplements, preventives and human drugs included | Interactions, masking, what has been tried |
| Master problem list | Active problems with onset dates. Inactive and resolved problems with dates. Certainty per problem | The index to the rest |
| Diet | Exact product, amount, treats, anything used to give pills. Any trial with start date and rules | Half of chronic GI and skin work-ups turn on it |
| Preventive status | Vaccines with dates, parasite control with product and last dose, retroviral status in cats | Rules differentials in or out |
| Open items | Pending results, planned rechecks, standing instructions to the owner | What the last vet was waiting for |

---

## B. Owner reported diagnosis against a confirmed one

### B.1 How accurate is owner reported history? Veterinary evidence

- **Agreement varies by disease category.** In a Dog Aging Project study, owner reports were checked against veterinary electronic records for 309 dogs by masked reviewers. Agreement was 90% or higher in 10 of 20 categories. It was highest for endocrine and immune categories (99%) and lowest for dental and oral (44%), with skin also low. The authors expected better agreement for acute or serious conditions than for benign or self limiting ones [E: DAP accuracy study; abstract level, journal not confirmed].
- **"Healthy" is the weakest owner statement.** In 152 dogs with clinical records, about 40% of owner opinions on health status disagreed with clinical evidence of chronic disease (35% across all dogs, 43% in old dogs). The authors warn against relying on owner impression of health [E: Rodger 2021].
- **Owners and vets see different signs.** In dogs with chronic kidney disease, owner and vet agreement on individual signs ran from kappa 0.66 (pale gums) through 0.44 (weight loss, anorexia) to near zero (increased drinking 0.04, increased urination 0.09, diarrhoea 0.11). Owners reported more vomiting, diarrhoea and thirst than the vet recorded. Only about a quarter of dogs the vet judged dehydrated were so identified by owners [E: Wright 2025; 59 matched dogs, small].
- **Owners normalise chronic signs.** Commentary on a 100 cat biopsy series: chronic vomiting "is often accepted by the client as insignificant", yet 99 of the 100 cats had small bowel disease on full thickness biopsy (49 chronic enteritis, 46 lymphoma). Weight loss was the most common sign, in about 70%, sometimes with no vomiting at all [E: Norsworthy 2013; referral style case series, secondary summaries]. Owners of senior dogs often put signs down to ageing and do not mention them [E: Liverpool survey, secondary].

So the direction of owner error is not symmetric [inferred]. Owners over report signs they can see (vomiting, diarrhoea). They under report slow ones (weight, thirst, dehydration). They under call disease overall ("healthy", "normal for her").

### B.2 Human evidence, as an analogue

- **Self reported conditions.** Agreement with records depends on the condition. Diabetes is reported well (kappa about 0.76 to 0.84). Hypertension is moderate (about 0.50 to 0.70). Chronic lung disease, arthritis and back pain are moderate to poor (0.36 to 0.55) [E: AugUR 2022 and the studies it cites]. Clear, test defined, daily treated diseases are reported well. Vague or label drifting ones are not.
- **Medication lists.** A systematic review of 22 studies: 27 to 54% of patients had at least one medication history error at hospital admission. Omission was the most common type (10 to 61% of patients had a drug left off). Commission, a drug listed that was not taken, affected 13 to 22%. Between 11 and 59% of errors were judged clinically important [E: Tam 2005].
- **Allergy labels.** About 10% of US patients report a penicillin allergy. Fewer than 1% are truly allergic when evaluated. The false label pushes prescribers to second line drugs, with worse outcomes and more resistance [E: Shenoy 2019; CDC]. Common false sources are a childhood viral rash, family history, or an intolerance such as diarrhoea [E: CDC, secondary].
- **Clinician kept problem lists drift too.** They are "frequently inaccurate and out-of-date". Once a list is seen as incomplete, clinicians stop relying on it and stop updating it [E: Wright 2012; secondary review].

No veterinary study was found that measures how often owner suspected food allergy is confirmed on challenge, or how complete owner reported medication lists are. Both remain [CJ]. In the general canine population, cutaneous adverse food reaction runs at about 1 to 2% of dogs presented for any reason, and most prevalence studies never put the whole population through an elimination diet [E: Olivry and Mueller 2017]. Owner belief in food allergy is far commoner than that in practice [CJ].

### B.3 How records mark certainty

A careful record keeps three things apart [CJ, consistent with RCVS 13.4, AAHA "tentative diagnosis" and VeNom's prefix]:

1. **Source.** "O reports", "per owner", "owner states", "hx of", "per referring vet", "per records from {clinic}". The S of SOAP is the owner's account. It is never copied into the A as a finding.
2. **Certainty.** "r/o", "ddx", "suspected", "presumptive", "working dx", "consistent with", "confirmed (histopath, date)". Flattening "r/o IBD" to "IBD" is a new diagnosis nobody made (the sibling brief makes the same point, §E.3 of the CUL-2753 clinical read).
3. **Status and date.** Onset, date diagnosed, date last reviewed, date resolved.

### B.4 "The owner says she has IBD", source unknown

What a careful first opinion vet does [CJ]:

1. **Writes it down as history, in quotes.** "O reports hx IBD, dx by previous vet approx 2024, no records seen." It goes in S.
2. **Asks five questions.** Who said it. When. On what basis (biopsy, ultrasound, diet response, or "the vet thought probably"). What was tried and what happened. Where the records are.
3. **Requests the records.** A diagnosis without its basis stays "reported".
4. **Does not anchor.** Feline "IBD" needs histology to separate it from small cell lymphoma, and the two look alike clinically [E: Norsworthy 2013, where the split was 49 to 46]. An unconfirmed "IBD" label on a cat that is losing weight is exactly the label that must not close the question.
5. **Uses the label one way only.** It may widen the work-up or sharpen a question ("is she on a steroid for it?"). It does not make a new or worsening sign expected.
6. **Re-enters it on the problem list at the level it is actually known.** Usually as the sign ("chronic vomiting, 2 yr, hx reported IBD, unconfirmed"), not as the disease.

The asymmetry matches the house invariant. A reported diagnosis may raise suspicion. It never lowers it.

---

## C. Which facts are dangerous if wrong or stale

"Loud" means the error makes a reader ask sooner or more. "Quiet" means it can drop, soften or delay a warning. The ranking below is for an owner maintained record that an engine reads and a vet may see. It is not the ranking for a prescribing chart: at the moment a drug is drawn up, drug allergy and current medications come first [CJ]. All cells are [CJ] unless marked.

### C.1 Ranked table

| Rank | Fact class | Present but wrong | Absent but true | Stale | Which way it errs |
|---|---|---|---|---|---|
| 1 | **Current medications and doses** | A phantom steroid makes real signs look masked or treated. A wrong dose or strength misleads the next prescriber. A drug listed but not given (commission, 13 to 22% in humans [E: Tam 2005]) makes "failed on X" false | **The worst cell in the table.** An unlisted steroid, NSAID, antihistamine or anti-nausea drug makes improvement look like diet or time. Omission is the commonest list error in humans [E: Tam 2005]. A vet adding an NSAID to an unlisted steroid risks GI ulceration and perforation [E: Clinician's Brief; JVECC 2022 series] | A list not reviewed since the last visit. An ended course still shown as running hides a relapse off treatment. A stopped anticonvulsant, insulin or thyroid drug still shown hides the reason for a change | **Quiet** when absent or when a masking drug is missed. Loud when a phantom drug adds caveats |
| 2 | **"Resolved" status, and a removed fact** | A problem marked resolved that is only controlled by a drug or a diet. Stop the drug and it is back | A truly resolved problem still shown as active is noise, and can become the explanation for an unrelated new sign | The day the sign returns, "resolved" is false. Ear disease, skin disease, urinary signs and seizures all recur | **Quiet** if resolved or removed is read as "no longer a concern". Loud if resolved is kept as history |
| 3 | **Chronic condition** (CKD, diabetes, hyperthyroidism, cardiac disease, epilepsy, IBD, atopy) | An unconfirmed label explains away a different disease: "IBD" over lymphoma, "hairballs" over small bowel disease [E: Norsworthy 2013], "arthritis" over a tumour. This is diagnostic overshadowing [E: AAFP Lown 2023] | A vet without the history repeats tests, or prescribes into a contraindication (an NSAID in CKD, a steroid in a diabetic). An engine without it reads polydipsia in a diabetic as new | A staged disease (CKD, cardiac) with an old stage. A diabetic recorded before remission. A hyperthyroid cat recorded before treatment | **Quiet** when the label explains a sign. Loud when it adds a reason to ask |
| 4 | **Vet instructions** ("call me if", "recheck in", "do not stop") and the vet's opinion | A paraphrased trigger changes the urgency. A reassurance stored as a standing fact outlives the visit it was about | The safety net is lost. On Nyx's record the trigger came true around Oct 1 and no surface noticed [E: CUL-2753 ground truth] | An instruction outlives its course. "Not concerned about the weight" from September, read in November | **Quiet** for a carried reassurance and for a lost trigger. Loud for a trigger kept past its time |
| 5 | **Weight** | A unit slip (8.22 lb stored as 8.22 kg) hides a 15% loss [E: CUL-2753 clinical read, F1]. A home and a clinic scale read as one series fakes or hides a change | No baseline. Cats with CKD lost a median 8.9% of body weight in the 12 months before diagnosis, and loss was detectable up to 3 years before [E: Freeman 2016]. Weight loss was the commonest sign of feline small bowel disease [E: Norsworthy 2013] | An old weight read as current hides a loss. Dose by an old weight under or overdoses | **Quiet** in every cell except a faked loss |
| 6 | **Drug allergy or adverse reaction** | Over-labelling. The animal is denied a first line drug. Fewer than 1 in 10 human penicillin labels survive testing [E: Shenoy 2019; CDC]. "Vomited on Metacam once" is a different fact from "anaphylaxis to a vaccine" | Re-exposure. For a true anaphylactic or idiosyncratic reaction this is the single worst event in the table, and it is rare | Labels do not expire. They need a reaction description and a date so a vet can weigh them | **Loud** when present and wrong (costly, not dangerous). **Quiet and severe** when absent and true |
| 7 | **Food allergy or dietary restriction** | A hunch recorded as fact narrows the diet for life and steers every later trial reading (§D.3). An unneeded restriction also costs nutrition | Exposure to a true allergen. The harm is a flare, not an emergency in most dogs and cats | "Allergic to chicken" from a trial with no rechallenge. A trial result read while a steroid ran | Loud for exposure flags. **Quiet** when it explains a flare ("that is her chicken thing") |
| 8 | **Reproductive status and age** | "Spayed" on an entire female removes pyometra, pregnancy and mammary disease from the list of things a reader thinks of. An estimated age read as exact moves a cat in or out of the senior screens | Unknown status is asked at the visit | Age moves on by itself. Status changes once | **Quiet** for a wrong "neutered". Otherwise low |

### C.2 Drug classes that need their own line [CJ unless marked]

- **Glucocorticoids.** They mask itch, cough, vomiting, appetite loss and pain. A sign that improves on a steroid has told you about the steroid. They must not be stopped suddenly after more than about 2 to 3 weeks at treatment doses, because of adrenal suppression [E: Merck Vet Manual; Clinician's Brief]. In a diet trial, signs can relapse fast once prednisolone stops, and published protocols wait two weeks off the drug before a food challenge [E: Vet Dermatol trial protocols, secondary]. A long acting injection the owner cannot name is the commonest missing entry.
- **NSAIDs.** With a steroid, or with a second NSAID, the risk is GI ulceration and perforation. In one series all five dogs given two NSAIDs together perforated [E: JVECC 2022 series]. An owner's leftover or human NSAID is the entry most likely to be missing.
- **Insulin.** A wrong dose or a missed remission in a cat is hypoglycaemia. A stale "diabetic, on insulin" that is no longer true is as dangerous to a reader as a missing one.
- **Anticonvulsants.** Abrupt withdrawal risks seizures. "Epilepsy, resolved" entered because the seizures stopped on the drug is the classic false resolution.
- **Thyroid drugs.** A treated hyperthyroid cat can unmask kidney disease. The treatment date changes how every later weight and thirst reading is read.
- **Antihistamines, anti-nausea drugs, gut protectants and supplements.** Often not thought of as medicines by owners. The house report has already seen one patient's antihistamine called a supplement on one page and absent from another (`render.ts`, the "None recorded" comment).

### C.3 Staleness horizons a vet would use

| Fact | Horizon | Basis |
|---|---|---|
| Weight, healthy adult | At every visit. Beyond 12 months it is history, not a current weight | [E: AAHA MR 18; WSAVA 2011] for "every visit"; the 12 months is [CJ] |
| Weight, senior cat or dog | Beyond 6 months | [E: AAFP 2021, exam at least every 6 months for seniors]; applied to weight [inferred] |
| Weight, during a trial, a weight loss question or a growth phase | 2 to 4 weeks | [CJ] |
| Medication list | Reviewed at every visit and at every new prescription. Unreviewed since the last visit means unverified | [inferred from Tam 2005 and human reconciliation practice] |
| A course with an end date | The day after the end date it is history. Its masking tail runs longer than the course | [CJ]; the house rule uses a 42 day tail |
| Chronic condition | Reviewed at each visit about it. Staged diseases restaged per their guideline. Unreviewed for 12 months means "reported, not current" | [CJ] |
| "Resolved" | Holds until the sign is next seen. It is a statement about the past | [CJ] |
| Vet instruction with a trigger | Until the trigger is met, the course it belongs to ends, or the next visit replaces it | [CJ] |
| Vet opinion or reassurance | The day it was given, about the number it was given on. It does not carry | [CJ; matches the CUL-2753 clinical read §D] |
| Drug allergy or adverse reaction | Does not expire. Needs the reaction and the date to be weighed | [E: CDC notes IgE can wane; CJ for the rule] |
| Diet | Changes without notice. A diet line older than the last food change is wrong | [CJ] |
| Age | Recomputed from a birth date, never stored as a number | [CJ] |

---

## D. The hazard for this product: when a standing fact makes an app reassure or go quiet

The common mechanism is the same in all six cases. A fact turns a sign from "unexplained" into "explained", and an explained sign gets less attention. In human medicine this is diagnostic overshadowing: "the attribution of symptoms to an existing diagnosis rather than a potential co-morbid condition" [E: Joint Commission; AAFP Lown 2023]. Its cognitive root is premature closure, "the failure to continue considering reasonable alternatives after an initial diagnosis was reached", the largest single cause among cognitive errors in 100 internal medicine diagnostic error cases [E: Graber 2005]. A stored fact is a closure that never reopens unless something forces it.

The house invariant already names the safe direction. A fact may add an ask. It may never remove one.

### D.1 "Vomiting is normal for her, she has hairballs / IBD"

- **The hazard.** The owner's explanation becomes the record's explanation. Frequency rises slowly and each week still looks "normal for her".
- **The evidence.** Owners accept chronic vomiting as insignificant. In the cats that reached biopsy, 99 of 100 had small bowel disease, split almost evenly between enteritis and lymphoma. Hairball vomiting at twice a month or more is argued to be a warning sign in itself [E: Norsworthy 2013; the thresholds are the author's opinion]. Owners disagree with the record about "healthy" about 40% of the time [E: Rodger 2021].
- **A careful clinician's rule** [CJ]: "normal for her" is a baseline to measure against, never a reason to stop measuring. The owner's explanation is recorded as the owner's. Any vomiting cat that is also losing weight is worked up, whatever the label.

### D.2 A recorded chronic condition whose sign worsens or changes character (the Cooper case)

Cooper: a dog on a diet trial, owner recorded "chronic pruritus", on Apoquel. The report's flag band fires "itching on 16 of 35 days" (CUL-1867). Two vet lenses said a flag that restates the presenting complaint trains the reader to skip the box. The safety rule says a flag is never dropped. Three options are on file: keep; keep only when new or worse against a baseline; keep, retitled as linked to the recorded condition. The evidence on each side:

- **For the worry about restating.** In a study of 112 primary care clinicians, each extra reminder per encounter cut the chance of accepting one by 30%, and each five point rise in the share of repeated reminders cut it by 10%. The authors' own remedy is fewer within-patient repeats [E: Ancker 2017]. Override rates for drug alerts average 46 to 96% across studies [E: Poly 2020]. A flag that tells a vet what the owner said at the door is, to that vet, a repeat [inferred].
- **For the worry about dropping.** Overshadowing and premature closure (above). In atopic dogs on oclacitinib, the label itself says to monitor for infection, and a field trial dog had "an intense flare-up of dermatitis and severe secondary pyoderma" at day 19 [E: Apoquel label]. Flares in a treated atopic dog have their own causes to look for: fleas, food, infection [E: Koch, TVP review]. So itching in a dog with recorded pruritus is the expected sign and also the sign that would announce a complication. The label does not tell the two apart. Only the count against a baseline does [inferred].
- **What "known chronic sign, only if new or worse" means in practice** [CJ]. Clinicians do triage this way. A stable seizure frequency in a known epileptic is not news; a cluster is. The practice depends on three things: a baseline that was actually measured, a definition of worse (frequency, severity, character, or a new sign alongside), and treatment status on the same line. Sixteen itch days in 35 on a JAK inhibitor is a control failure, which a vet wants to know, and is a different statement from sixteen itch days untreated.
- **What the evidence does not settle.** No study was found that tests a "new or worse only" rule against a "always show" rule for owner reported chronic signs in animals. Without a measured baseline, "not worse" is an absence, and the house rule says an absence does not reassure. A relabelled flag ("linked to recorded pruritus") changes what the reader expects without changing the count; whether readers then skip it more or less is untested.

This brief does not rule between the options.

### D.3 "Food sensitivity: chicken", entered on a hunch, then steering a diet trial reading

- **The hazard.** The fact becomes the hypothesis the trial is read against. A flare after a chicken exposure confirms it. A flare with no exposure is "she must have got into something". A quiet week is credited to avoidance. The fact cannot lose.
- **The evidence.** Food allergy is confirmed only by improvement on an elimination diet, relapse on rechallenge, and improvement again [E: Olivry and Mueller, CAT series]. True prevalence is low (1 to 2% of dogs presented for anything) [E: Olivry and Mueller 2017]. Human allergy labels are over applied about tenfold [E: Shenoy 2019; CDC]. No veterinary figure was found for owner suspected against challenge confirmed.
- **The second hazard.** The label explains skin or gut signs that have another cause (fleas, infection, a non food disease). That is overshadowing again.
- **A careful clinician's rule** [CJ]: a food reaction is "suspected" until a rechallenge on record says otherwise. A suspected allergen may add a food to the avoid list for a trial. It may not be used to explain a sign, and its absence from a meal log is not evidence of anything. Nyx is the worked example: a rabbit trial read while prednisolone ran for three of its twelve weeks.

### D.4 A medication list that omits a steroid

- **The hazard.** The record shows a sign falling. The steroid is not on the list. The fall is credited to the diet, the season or time. Then the course ends and the sign returns, and the return reads as new.
- **The evidence.** Omission is the most common medication history error [E: Tam 2005]. Steroid effects wear off fast in trial dogs once the drug stops [E: Vet Dermatol trial protocols, secondary]. On Nyx's record, Motozol was never entered as a course in September, Motozol doses run from Nov 10 against no course, and a prednisolone dose on Nov 14 sits against no course [E: CUL-2753 ground truth §3.3].
- **A careful clinician's rule** [CJ]: an empty medication list means "none recorded", not "none". An improvement is never credited to a diet until the vet has asked, by name, about steroids, injections at any visit, ear and eye drops, and anything given by another household member. A recent vet visit with no medication recorded is treated as a possible unrecorded drug. The house engine already does this for 42 days after any visit.

### D.5 A condition marked resolved by the owner

- **The hazard.** "Resolved" removes the condition from the lines a reader sees first. In the house report today only `active` conditions print on the masthead (§E.1). The owner's criterion for resolved is "I have not seen it lately", which is also what a controlled, masked or seasonal problem looks like.
- **The evidence.** In the POMR, resolving and inactivating are distinct acts with distinct meanings, and both are made by the clinician [E: WSU]. RCVS guidance says a correction must not remove or obscure the original entry [E: RCVS 13.9]. No source was found on owner assigned "resolved". Recurrence rates for otitis, atopic skin disease and feline lower urinary signs are high in practice [CJ].
- **A careful clinician's rule** [CJ]: an owner cannot resolve a diagnosis. An owner can report that a sign has not been seen since a date. The entry stays on the history with both dates. A resolved problem is the first differential when its sign returns, and a return is reported as a recurrence, with the earlier episode named. "Resolved" never lowers how a returning sign is read.

### D.6 A removed fact

- **The hazard.** Three different acts look the same: "this was wrong" (a correction), "this is over" (a resolution) and "I do not want this shown" (a preference). Each changes the history differently. A deletion also erases the reason for past decisions: a trial started because of a suspected allergen now has no stated reason.
- **The evidence.** Records are amended without obscuring the original [E: RCVS 13.9]. A reader cannot tell "never had it" from "removed" unless the record says so [inferred].
- **A careful clinician's rule** [CJ]: a withdrawn fact stops framing anything from the day it is withdrawn. It does not turn into its opposite. Removing "chicken sensitivity" is not a statement that chicken is tolerated. Removing a condition is not a statement of health. And a removal can only take away an explanation or a caveat; it cannot take away an ask that was standing for other reasons.

### D.7 The pattern across all six

| Case | The quiet path | The loud, safe path |
|---|---|---|
| D.1 explain-away | Label lowers attention to a counted sign | Label is context; the count and the weight stand |
| D.2 known chronic sign | Flag dropped or skipped because expected | Count shown against a measured baseline, with treatment status |
| D.3 hunch allergen | Label explains flares and credits quiet weeks | Label adds to the avoid list only; "suspected" until rechallenge |
| D.4 missing steroid | Improvement credited to diet | Empty list reads "none recorded"; visits imply possible drugs |
| D.5 owner resolved | Condition leaves the top of the chart | Kept as history with dates; return is a recurrence |
| D.6 removed fact | Removal read as the opposite fact | Removal withdraws the framing, nothing more |

---

## E. What a vet needs on an owner maintained fact page to trust it in a report

### E.1 What the record holds and prints today (grounding)

- **The table.** `conditions` (migration 001) holds `condition_name` (free text), `diagnosed_at` (a date, optional), `status` (`active`, `monitoring`, `resolved`), `notes`, and created and updated timestamps. It holds no source (who said it), no certainty, no basis, no date resolved, no date last reviewed and no link to a visit or document.
- **The report masthead.** It prints active conditions only, as: "Recorded conditions: {name} (since {date}). Owner-recorded history, not a finding in this window." (`render.ts` around line 1969; `documentV2.ts` `conditionsLineOf`). The code comment records why it is there: a cold read of a clean looking venison trial in a diagnosed atopic Westie produced two opposite plans until "Atopic dermatitis (active)" was on page 1.
- **The appendix.** It prints every condition with its status in brackets. Empty tables print as "nothing was entered", not "none", by an earlier ruling.
- **What a vet reads into that line** [CJ]. "Since Nov 14, 2025" reads as a diagnosis date. With `diagnosed_at` owner typed and no source, it may be the day the owner first noticed, the day a vet said "probably", or the day the row was created. "Owner-recorded history" is the right hedge and the only one. `monitoring` and `resolved` rows do not reach page 1, so a "resolved" condition (D.5) is three pages back.

### E.2 What each fact needs to carry [CJ throughout]

| Element | What a vet wants to read | Why |
|---|---|---|
| **Source, in words** | "Owner reports". "Owner reports that Dr Miller (clinic) said, on 16 Sep 2026". "From a document: discharge sheet dated…". "Suggested by the app from the owner's notes, confirmed by the owner on…" | The four are different evidence grades. A vet weighs them differently. An AI proposed fact must stay distinguishable after the owner confirms it; confirmation is a tap, not a check (automation bias is covered in the CUL-2753 clinical read §G) |
| **Certainty, as the source gave it** | "suspected", "being investigated", "confirmed by {test}", or "not stated" | Flattening a hedge makes a new diagnosis. "Not stated" is an honest value |
| **Basis** | "biopsy", "blood test", "diet trial with rechallenge", "response to treatment", "not known" | It is the first question a vet asks (§B.4) |
| **Dates, each labelled** | First noticed. Said by the vet on. Recorded in the app on. Last reviewed by the owner on. Not seen since / ended on | One unlabelled date is read as the strongest one |
| **Status** | Active. Not seen since {date}. Ended {date}. Withdrawn {date} | "Resolved" as an owner's word claims more than an owner can know |
| **For a medicine** | Name, strength, dose, route, frequency, start, end or "ongoing", who prescribed, "read from the label" or "from memory" | Dose from memory and dose from the label are different facts |
| **For a drug reaction** | Drug, what happened, when, how soon after the dose, who judged it a reaction | Lets a vet separate anaphylaxis from an upset stomach |
| **For a food reaction** | Food or protein, the sign, whether a trial and rechallenge were done, or "owner's suspicion" | §D.3 |
| **For a weight** | Value, unit, date, which scale | Two of Nyx's three weights say `home_scale` and were taken at the clinic |
| **For an instruction** | The vet's words as the owner wrote them, the date, the trigger, and what it belonged to | Any paraphrase of a clock or a verb changes urgency |
| **A "reviewed on" line for the page** | "Owner last reviewed this list on {date}" | An undated list is assumed stale |
| **An explicit empty** | "Nothing recorded" per class | Never "none" and never "no known allergies" unless the owner said exactly that, dated |

### E.3 What should never appear [CJ throughout]

1. **An owner's opinion set as a finding.** "Sensitive stomach", "picky", "anxious", "just hairballs", "always been thin". As a quoted owner statement it is history. As a row with the same visual weight as "CKD stage 2" it is a finding nobody made. "Picky" also collides with the house rule that intake is not preference.
2. **A vet's reassurance carried forward as standing truth.** "Vet not concerned about weight." It was an opinion on one day about one number. On Nyx's record that number is still about 16% under June two months later. The sibling brief's position stands unchanged (CUL-2753 clinical read §D).
3. **An absence as a fact.** "No known allergies", "heart normal", "bloods normal", "no other problems". An exam on one day says nothing about the next.
4. **"Resolved" in the app's voice** for anything the owner switched off.
5. **A diagnosis the record cannot source**, printed without "owner reports".
6. **An inferred fact.** A condition derived from a logged pattern ("vomits weekly, so: chronic vomiting") and then listed as something the pet "has". That is the engine's finding, with its own counts and coverage, and it belongs with findings.
7. **A cause.** "Vomiting due to hairballs." "Itching from chicken." Cause is the vet's call.
8. **A prognosis or an expected course.** "Should settle by week 12."
9. **A severity word the owner chose**, printed as a grade. Dr. Chen's profile already says she trusts frequency over owner rated severity.
10. **A fact with no date.**
11. **A removed fact shown as a negative.** "No longer allergic to chicken."
12. **The word "knows".** A vet reading "what the app knows" expects verified facts. What the page holds is what the owner has told the app. [CJ, a wording observation about how a clinician reads the title, offered as evidence of a trust risk, not as a naming decision.]

---

## F. Applied to Nyx: her problem list today

Built from `2026-11-visit-summary-ground-truth.md` (CUL-2753), which was hand written from the production rows on 2026-11-14. Nothing here is a diagnosis. The source column is the point: almost every line is the owner's account, and the "vet stated" lines are the owner's notes of what a vet said.

**Signalment.** Cat. Age, sex, neuter status and breed are not in the ground truth file.

### F.1 Active problems

| # | Problem, at the level it is known | Since | Source | Certainty |
|---|---|---|---|---|
| 1 | **Weight loss, unexplained, not regained.** 4.40 kg (Jun 15) to 3.73 kg (Sep 16) to 3.69 kg (Nov 14). About 16% below June. The last 40 g is inside scale noise | Jun to Sep 2026 | Measurements in the app. All three stored as home scale; the Sep and Nov readings were very likely taken at the clinic | Measured. Scale uncertain |
| 2 | **Chronic vomiting**, continuing on the rabbit diet. The owner's own weekly rates: 1.8, then 3.4 on chicken, then 3.1 back on rabbit | Before Jul 2026 | Owner's logs and the owner's note for the Nov 14 visit | Sign is owner observed. No diagnosis on record |
| 3 | **Possible blood in vomit**, one photo, Nov 12 | Nov 12 | An automated read of an owner photo | Present-only flag. Not confirmed by a vet in the record |
| 4 | **Cough, sneezing, congestion.** Daily cough. Returned after prednisolone ended | By Sep 2026 | Owner's notes. Owner showed the vet a video on Sep 16 | Sign is owner observed. "Lungs sound good" on Sep 16 is vet stated in the owner's notes, and is an absence on one day |
| 5 | **Recurrent ear disease.** Left ear "had dirt in it" Sep 16; the last infection was in both ears | Before Jul 2026 | Vet stated, in the owner's notes. The Sep 16 visit reason was "Potential ear infection" | No diagnosis written. Treated as otitis by the plan |
| 6 | **Suspected adverse food reaction**, under investigation by diet trial | Jul 2026 | Implied by the trial and the prescription document; the owner asks on Nov 14 whether "something other than a food allergy" is going on | A working hypothesis. Not confirmed. The trial ran with a steroid inside it |

Items 1 and 2 together are the pattern §D.1 describes: a vomiting cat that is losing weight. Item 6 is the label most at risk of explaining items 1 and 2 away.

### F.2 Medications

| Drug | What the record shows | Source | Gap |
|---|---|---|---|
| Motozol ear drops | A course Jul 16 to Aug 9. "Once a day", left ear, from Sep 16, never entered as a course. Doses twice a day from Nov 10 against no course | First course: owner entered. September: vet stated in owner's notes. November: owner's dose logs | Two of three treatment runs have no course. Length never stated |
| Prednisolone | A course Sep 21 to Oct 11, for the cough: 10 days full strength, then a taper. One dose logged Nov 14 against no course | Course: owner entered from the label, five days after the visit. Reason: vet stated in owner's notes | Whether a new course began on Nov 14 is unknown. Dose not in the notes |
| Zyrtec (cetirizine) | The owner writes that it "doesn't seem to be helping" | Owner's note only | Who suggested it, the dose and the start date are not in the file |

A systemic steroid ran for three weeks inside a twelve week diet trial, and its tail reaches the trial's end. Any reading of the trial has to carry that.

### F.3 Diet

Rabbit prescription diet (a prescription PDF dated Jul 30, linked to no visit). Trial Jul 26 to Oct 20, extended to 12 weeks on the vet's direction as the owner noted on Sep 16. The owner's November note implies a chicken reintroduction and a return to rabbit, with vomiting continuing on both. The current diet is "back on rabbit" per the owner. No treats or pill aids during the trial, vet stated in the owner's notes.

### F.4 Open vet instructions (all vet stated, in the owner's notes of Sep 16)

| Instruction | State today |
|---|---|
| Call if still coughing after the 10 full strength days of prednisolone | The condition came true around Oct 1. The owner recorded "my vet knows" for cough and for vomit on Oct 11. The course it belonged to has ended |
| Do not start and stop the steroid | Bears on the Nov 14 dose with no course |
| Clean ears every 4 weeks, starting Sep 16 | No home in the record. Whether it was done is unknown |
| Food can be increased as needed | Given alongside the weight comment. The weight did not come back |
| At 12 weeks, reintroduce foods one protein at a time. No need to return at 12 weeks | The trial ended Oct 20. A reintroduction appears in the owner's rates |
| Recheck | None stated |

**From Nov 14 (Dr Coleman):** nothing. The notes hold only what the owner went in with. There are no vet statements to list.

### F.5 What must not be on her list

- "Vet not concerned about weight" (Dr Miller, Sep 16, in the owner's words). It is a dated opinion about 3.73 kg, and it sits in the visit note.
- "Prednisolone helped the cough." The owner's inference.
- "Food allergy" or "chicken sensitivity" as a condition. Nothing on record confirms either.
- "Ear polyps." The owner's question, not a finding.
- "Lungs clear", "no fever", "right ear normal". Absences on one day.

### F.6 Not known from the file

Age, sex and neuter status, BCS and MCS, vaccination and parasite status, retroviral status, any lab result, the basis for starting the trial, the prednisolone and Motozol doses, and everything said at the Nov 14 visit.

---

## G. Clinical rules a careful vet would hold, in one place

All [CJ], each resting on the sections named.

1. A problem is written at the level it is known, with its source, and no higher (§A.1, §B.3).
2. A reported diagnosis is history until its basis is seen. It may raise a question. It never answers one (§B.4).
3. A standing fact may add an ask. It may not remove, soften, delay or re-rank one (§D, house invariant).
4. A known chronic sign is still counted. What changes is what it is compared against (§D.2).
5. "None recorded" is never "none" (§D.4, §E.3).
6. Only a measured baseline can say "not worse". Without one, there is nothing to compare, and an absence does not reassure (§D.2).
7. An owner reports that a sign has stopped. A vet resolves a problem (§D.5).
8. A correction leaves the original visible. A removal withdraws a framing and asserts nothing (§D.6).
9. Every fact has a date and a shelf life, and the shelf life is set by its class (§C.3).
10. A vet's opinion belongs to the day it was given (§C.1 rank 4, §E.3).
11. An owner's adjective is not a finding. Decline in intake is a health question before it is a preference (§E.3, house invariant).
12. Improvement is not credited to a diet until every drug, drop and injection has been asked for by name (§C.2, §D.4).

---

## H. Sources

Fetched or searched 2026-11-15. Read at abstract, search summary or single page level. Recheck figures at use.

**Records and problem lists**
- Washington State University, College of Veterinary Medicine. Problem Oriented Medical Records (Diagnostic Challenge student guide). https://hub.wsu.edu/dc-student/during/problem-oriented-medical-records/
- University of Guelph, VETM 3430. POMA and Maintaining Medical Records (lecture). https://books.lib.uoguelph.ca/app/uploads/sites/52/2020/07/VETM-3430-POMA-and-Maintaining-Medical-Records-Lecture.pdf
- University of Melbourne, Virtual Vet Surgery. The Patient: problem lists. https://lms.vet.unimelb.edu.au/Virtual%20Vet%20Surgery/documents/patient/u4_4.html
- Leak, Morris, Humphries. The Practice Success Prescription: Team-Based Veterinary Healthcare Delivery (VIN). https://www.vin.com/doc/?id=3862766
- Dennis S, Green J. The problem with the master problem list. dvm360, 17 Dec 2020. https://dvm360.com/view/the-problem-with-the-master-problem-list
- Instinct Science. 10 common questions about veterinary medical recordkeeping standards (vendor summary quoting AAHA MR 11, 18, 22 to 24, 40). https://instinct.vet/blog/10-common-questions-about-veterinary-medical-recordkeeping-standards/
- RCVS. Code of Professional Conduct, supporting guidance 13: Clinical and client records. https://www.rcvs.org.uk/veterinary-professionals/conduct-and-guidance/supporting-guidance/13-clinical-and-client-records
- West Virginia Board of Veterinary Medicine. Records Guidance, Small Animal. https://www.wvbvm.gov/Portals/WVBVM/docs/Forms/Records%20Guidance%20-%20Small%20Animal.pdf
- College of Veterinarians of Ontario. PRMR Assessment Questions, Companion Animal. https://www.cvo.org/getmedia/a0a5eb8f-12c4-4dbc-b8da-1ab7107dbb63/PRMR-Assessment-Questions-Companion-Animal.pdf
- VetCompass (RVC). Support: VeNom codes. https://rvc.ac.uk/vetcompass/support · VeNom Coding Group. https://en.wikipedia.org/wiki/VeNom_Coding_Group
- US National Library of Medicine. SNOMED CT Veterinary Extension source information. https://nlm.nih.gov/research/umls/sourcereleasedocs/current/SNOMEDCT_VET · Freeman L, et al. WSAVA Nutritional Assessment Guidelines. *J Feline Med Surg* 2011 (also *J Small Anim Pract* 2011). https://wsava.org/global-guidelines/global-nutrition-guidelines/
- Ray S, et al. 2021 AAFP Feline Senior Care Guidelines. *J Feline Med Surg* 2021;23:613-638. https://catvets.com/guidelines/senior-care

**Owner and patient reported history**
- "Accuracy of owner-reported diagnoses for dogs enrolled in the Dog Aging Project as compared to veterinary electronic medical records." Dog Aging Project (Creevy KE among the authors). Found by title and abstract only; journal and year not confirmed. https://www.bohrium.com/scholar/Gl5994859/Kate_Elizabeth_Creevy
- Rodger S, Scott EM, Nolan A, Wright AK, Reid J. Effect of age, breed, and sex on the health-related quality of life of owner assessed healthy dogs. *Front Vet Sci* 2021;8:603139. https://www.frontiersin.org/articles/10.3389/fvets.2021.603139
- Wright A, Taylor D, Lowe M, Barlow S, Jackson J. Replicating the real-world evidence methods available in human health to assess burden and outcomes for dogs with chronic kidney disease. *Front Vet Sci* 2025;12. https://doi.org/10.3389/fvets.2025.1502933
- Norsworthy GD, et al. Diagnosis of chronic small bowel disease in cats: 100 cases (2008-2012). *J Am Vet Med Assoc* 2013;243(10):1455-1461. Secondary: https://www.veterinarypracticenews.ca/Chronic-Vomiting-in-Cats-isnt-Normal-After-All/ · https://www.petmd.com/blogs/fullyvetted/2013/dec/dont-ignore-cats-chronic-vomiting-diarrhea-31100
- University of Liverpool senior dog survey, reported in Vet Times. https://www.vettimes.com/news/vets/small-animal-vets/education-call-about-senior-dog-vet-owner-disconnect
- AugUR cohort. Agreement of self-reported and general practitioner reported chronic conditions in the old and very old. *J Epidemiol Community Health* 2022 (authors not confirmed). https://jech.bmj.com/content/early/2022/08/26/jech-2022-219096
- Tam VC, et al. Frequency, type and clinical importance of medication history errors at admission to hospital: a systematic review. *CMAJ* 2005;173(5):510-515. https://www.cmaj.ca/content/173/5/510
- Shenoy ES, Macy E, Rowe T, Blumenthal KG. Evaluation and management of penicillin allergy: a review. *JAMA* 2019;321(2):188-199. https://doi.org/10.1001/jama.2018.19283
- CDC. Clinical features of penicillin allergy. https://www.cdc.gov/antibiotic-use/hcp/clinical-signs/index.html
- Wright A, Feblowitz J, Maloney FL, Henkin S, Bates DW. Use of an electronic problem list by primary care providers and specialists. *J Gen Intern Med* 2012;27(8). https://link.springer.com/doi/10.1007/s11606-012-2033-5
- Olivry T, Mueller RS. Critically appraised topic on adverse food reactions of companion animals (3): prevalence of cutaneous adverse food reactions in dogs and cats. *BMC Vet Res* 2017. https://bmcvetres.biomedcentral.com/track/pdf/10.1186/s12917-017-0973-z · the same series (6), non-cutaneous signs, 2018: https://pmc.ncbi.nlm.nih.gov/articles/PMC6233561

**Fatigue, closure, overshadowing**
- Ancker JS, et al. Effects of workload, work complexity, and repeated alerts on alert fatigue in a clinical decision support system. *BMC Med Inform Decis Mak* 2017;17:36. https://psnet.ahrq.gov/issue/effects-workload-work-complexity-and-repeated-alerts-alert-fatigue-clinical-decision-support
- Poly TN, et al. Appropriateness of overridden alerts in computerized physician order entry: systematic review. *JMIR Med Inform* 2020;8(7):e15653. https://medinform.jmir.org/2020/7/e15653/
- Graber ML, Franklin N, Gordon R. Diagnostic error in internal medicine. *Arch Intern Med* 2005;165(13):1493-1499. https://pubmed.ncbi.nlm.nih.gov/16009864/
- AAFP, Lown Right Care. Diagnostic overshadowing. *Am Fam Physician* 2023;108(3). https://www.aafp.org/pubs/afp/issues/2023/0900/lown-right-care-diagnostic-overshadowing.pdf · The Joint Commission, Sentinel Event Alert on diagnostic overshadowing (definition, via search summary).

**Drugs and disease**
- Freeman LM, et al. Evaluation of weight loss over time in cats with chronic kidney disease. *J Vet Intern Med* 2016;30(5):1661-1666. https://pubmed.ncbi.nlm.nih.gov/27527534/
- Merck Veterinary Manual. Hormonal treatment for integumentary disease in animals (glucocorticoid withdrawal). https://www.merckvetmanual.com/veterinary/pharmacology/systemic-pharmacotherapeutics-of-the-integumentary-system/hormonal-treatment-for-integumentary-disease-in-animals
- Clinician's Brief. Corticosteroid and NSAID interactions. https://www.cliniciansbrief.com/article/corticosteroid-nonsteroidal-antiinflammatory-drug-interactions
- Retrospective series of 33 dogs with GI ulceration and NSAID use. *J Vet Emerg Crit Care* 2022;32(6):764-768 (authors not confirmed). https://pubmed.ncbi.nlm.nih.gov/35708902/
- Elimination diet trials with a short prednisolone or oclacitinib course. *Vet Dermatol*, doi 10.1111/vde.12793 and 10.1111/vde.12940 (authors not confirmed; read via search summary).
- Apoquel (oclacitinib) product monograph and label. https://www.drugs.com/vet/apoquel-16-mg-chewable-tablets-can.html
- Koch S. Dermatology Details: new diagnosis and management of canine atopic dermatitis. *Today's Veterinary Practice*. https://todaysveterinarypractice.com/dermatology/dermatology-details-new-diagnosis-management-canine-atopic-dermatitis/

**House sources**
- CUL-2753 visit summary clinical read and ground truth (2026-11-14), read from the session scratchpad copies; `supabase/migrations/001_schema.sql` (`conditions`, `condition_status`); `supabase/functions/generate-report/render.ts` and `documentV2.ts` (the "Recorded conditions" line); `docs/nyx-care-state-requirements.md` §3.2 (acknowledgements lapse at stand-down; the weight loss card takes no answer).

**Searched and not found:** the AAHA standards' own text on master problem lists; AVMA text on problem list content; a shared veterinary status vocabulary (active, inactive, resolved); any veterinary study of owner reported medication list completeness; any study of how often owner suspected food allergy is confirmed on challenge; any trial of "new or worse only" against "always show" for chronic signs; any study of owner maintained problem lists in animals; a numeric weight loss threshold in the AAFP senior guidelines; the current ICADA text on working up a flare.
