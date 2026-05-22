# Vision Models on Stool / Vomit / Accident Imagery — Clinical Scales, Capabilities, and Guardrail Patterns

**Date:** May 2026
**Prepared for:** Nyx product team
**Clinical lens:** Dr. Alex Chen (DVM)
**Owner lens:** Jordan
**Scope:** What the literature and adjacent industry currently say about (a) what general-purpose vision models can reliably extract from photos of pet stool, vomit, and accidents, (b) the established clinical reference scales those photos would map against, (c) the descriptive-vs-diagnostic language boundary, and (d) how clinical-adjacent consumer products handle the gap. Background for the feature scoped as backlog item **B-013** — a per-event AI observation surfaced on the event detail screen.
**Status:** Point-in-time evidence capture. Not a product decision. Surfaces what is known, what is contested, and where the literature is silent.

---

## 1. Trigger

The team is scoping a feature where Claude generates a short observation about a symptom event — primarily from the attached photo plus event metadata — and surfaces it on the event detail screen. Two product shapes are on the table and are not yet differentiated by evidence:

- **Standalone per-event blurb.** A brief, image-grounded description tied to a single symptom log, rendered on its detail screen.
- **Narrowed home-screen AI Signal, scoped to one event.** The existing Zone 1 surface, but seeded by a single event instead of a multi-day window.

Both shapes raise the same underlying questions: what can a vision model actually see in a phone photo of vomit on a kitchen counter, how clinically meaningful are those observations, and how do adjacent products keep useful-without-being-diagnostic. Persona tension is acknowledged up front:

> **Jordan's lens:** "I just took a photo of something disgusting at 3am. If the app says nothing back, my data went into a black box and I'm done by Friday."

> **Dr. Chen's lens:** "False reassurance on a melena photo because the lighting was warm is a clinical regression. So is false alarm on a normal stool because the model has seen too many parasitology atlases. The failure modes are not symmetric — one underplays an emergency, the other amplifies anxiety. Both are net-harmful."

This brief does not resolve the tension. It documents the evidence base both lenses point at.

---

## 2. The Clinical Reference Scales

Any AI description of pet stool or vomit lands in a literature that already has a well-developed vocabulary. The team should understand what is established before considering language design.

### 2.1 Bristol Stool Form Scale (BSFS)

Developed by Lewis & Heaton at the Bristol Royal Infirmary in 1997, validated against whole-gut transit time in 66 volunteers (Pearson r = −0.54 at baseline; r = −0.65 for changes in response to senna and loperamide) ([Lewis & Heaton history, Grokipedia summary](https://grokipedia.com/page/Bristol_stool_scale)). The scale is human-medicine in origin but is widely cross-applied to dogs and informally used by some pet owners and veterinarians ([Maev — Bristol Stool Chart for dogs](https://maevworld.com/nutrition/bristol-stool-chart-for-dogs); [Bristol Stool Chart adapted for pets](https://www.petscare.com/en-gb/news/post/understand-dog-health-poop-chart)). Validation has held up over 25 years for hard/loose endpoints but is weaker around clinical decision points (types 2/3 and 5/6) ([Apt 2016 validity & reliability study, Wiley](https://onlinelibrary.wiley.com/doi/10.1111/apt.13746)).

### 2.2 Nestlé Purina Fecal Scoring System (1–7)

The veterinary standard for dog and cat stool consistency. Officially published as a 1–7 chart by Purina Institute / Veterinary Health Center; widely redistributed by veterinary schools ([Missouri VHC PDF](https://vhc.missouri.edu/wp-content/uploads/2020/07/Nestle-Purina-Fecal-Scoring-System.pdf); [UGA Vet Med PDF](https://vet.uga.edu/wp-content/uploads/2020/10/Nestle-Purina-Fecal-Scoring-System.pdf); [Purina UK Vet Centre](https://vetcentre.purina.co.uk/sites/default/files/2021-11/Faecal%20scoring%20chart_general%20use.pdf); [Purina Institute Clinical Assessment Tools](https://www.purinainstitute.com/centresquare/nutritional-and-clinical-assessment-tools)). The scale runs from 1 (very hard, dry, pellet-like, difficult to pass) through 2–3 (ideal — firm, segmented, pliable, easy to pick up), 4 (very moist, log-shaped, loses form when handled), 5 (very moist but has shape, piles rather than logs), 6 (has texture, no defined shape, occurs as piles or spots), to 7 (watery, flat puddle, no texture). Scores 2–3 are clinically ideal; persistent 1, 6, or 7 is the threshold to consult ([Sunstone Vets summary](https://www.sunstonevets.com/blog/www-sunstonevets-com-purina-fecal-scoring-chart/)).

### 2.3 WALTHAM Faeces Scoring System (1–5, half-grades permitted)

Mars Petcare's WALTHAM science institute publishes a separate 1–5 scale with intermediate half-grades (1.5, 2.5, 3.5, 4.5) — "bullet-like and crumbly" at 1, well-formed at 2–3, increasingly amorphous through 4–5 ([WALTHAM Faeces Scoring PDF](https://www.waltham.com/s3media/2020-05/waltham-scoring.pdf); [Pedigree distribution](https://www.pedigree.in/files/2024-02/waltham-scoring.pdf); [WALTHAM blog on faecal monitoring](https://www.waltham.com/news-events/nutrition/why-monitor-your-dogs-faeces)).

### 2.4 Inter-rater agreement matters more than which scale you pick

Cavett et al. (2021), J Small Anim Pract, scored the same canine bowel movements on both Purina and WALTHAM scales across veterinarians and lay public. Reported Cohen's kappa: 0.40–0.77 between veterinarians on Purina, 0.54–0.61 between veterinarians on WALTHAM. Vet-to-lay-public agreement was substantially weaker: 0.38 on Purina and 0.34 on WALTHAM. Disagreement was consistently higher with lay scorers ([Cavett 2021, J Small Anim Pract, Wiley](https://onlinelibrary.wiley.com/doi/10.1111/jsap.13283); [PubMed entry](https://pubmed.ncbi.nlm.nih.gov/33491796/)). The most important finding for Nyx is not the scales themselves but that **owner-reported scoring is known-unreliable**, and a vision model that gives a consistent score across days has plausible value as a smoothing input even before the score's diagnostic accuracy is settled.

### 2.5 Vomit-specific scales — sparse to nonexistent

There is no widely-published equivalent of the Purina chart for vomit. Veterinary education materials describe vomit qualitatively by **color** (white foam, yellow/green bilious, red/fresh blood, dark "coffee-ground", brown/fecal), **content** (food, bile, foam, hair, foreign material, blood), and **mechanism** (productive vs non-productive; projectile vs passive; vomit vs regurgitation) ([Purina — types of dog vomit](https://www.purina.com/articles/dog/health/digestion/types-of-dog-vomit); [Great Pet Care — dog vomit color guide](https://www.greatpetcare.com/dog-health/dog-vomit-color-guide/); [Meowant — cat vomit color guide](https://meowant.com/blogs/comprehensive-guides/cat-vomit-color-guide); [VIN Veterinary Partner — Bilious Vomiting](https://veterinarypartner.vin.com/default.aspx?pid=19239&catId=254092&id=12296225)). The clinical literature is descriptor-first, not score-first.

### 2.6 The hairball-vs-vomit problem in cats

Cat owners systematically over-attribute episodes to hairballs. Veterinary sources describe the typical hairball as "a tube-shaped wad of wet hair" usually accompanied by clear, yellow, or white foamy liquid; non-hairball vomit is described by content (food, bile) and the active retching mechanism rather than passive return. Owner inability to reliably distinguish is acknowledged as a known clinical problem ([Cornell Feline Health Center — Danger of Hairballs](https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/danger-hairballs); [Whisker — Is it a hairball or something else?](https://www.whisker.com/blog/ask-the-vet-is-it-a-hairball); [Purina — cat hairball vs vomit](https://www.purina.com/articles/cat/health/digestion/cat-hairball-vomit); [Cross-reference: Nyx feeding-windows brief §3 on feline vomit under-counting](./2026-05-feeding-windows-and-partial-eating.md)).

### 2.7 Melena and hematochezia — descriptors of clinical weight

Two pieces of vomit/stool vocabulary are load-bearing for clinical urgency: **melena** (black, tarry, shiny, foul-smelling, indicating digested upper-GI blood) and **hematochezia** (frank red blood, indicating lower-GI bleeding). Melena is generally treated as more urgent — narrower differential, more frequently serious causes (ulcers, tumors, toxin ingestion). In cats, melena may indicate life-threatening illness ([PetPlace — Melena in Dogs](https://www.petplace.com/article/dogs/pet-health/melena-blood-in-stool-in-dogs); [PetPlace — Melena in Cats](https://www.petplace.com/article/cats/pet-health/melena-blood-in-stool-in-cats); [Vetster — bloody stool in dogs](https://vetster.com/en/symptoms/dog/bloody-stool-melena-and-hematochezia); [NCBI Clinical Methods — Hematemesis, Melena, Hematochezia](https://www.ncbi.nlm.nih.gov/books/NBK411/)). Any vision feature that names these terms is making a diagnostic-adjacent claim. Any vision feature that avoids them while a photo clearly shows them is hiding clinical signal from the owner.

---

## 3. What Vision Models Can Extract from Biological Imagery — Today's State of the Art

There is no published Claude/GPT-4V evaluation specifically on pet stool or vomit photos. The closest evidence base comes from adjacent domains: dermatology, radiology, GI endoscopy, and human stool imaging.

### 3.1 General-purpose vision models on medical imagery — performance is highly variable

- **Neuroradiology board-style questions.** GPT-4V scored 76% (22/29 cases). Self-reported reliance was 66.1% imaging / 33.9% text; correct diagnoses showed *lower* image reliance (62.8%) than incorrect (76.7%) — a counterintuitive finding suggesting the model performs better when the text cue carries the case ([JMIR Neurotechnology — GPT-4V neuroradiology evaluation](https://neuro.jmir.org/2026/1/e69708)).
- **Chest X-ray report generation.** GPT-4V can produce report-shaped text but "cannot generate radiology reports yet" — clinically-plausible-but-unsupported findings are a documented failure ([arXiv: GPT-4V cannot generate radiology reports](https://arxiv.org/html/2407.12176v1); [Radiology / RSNA: Evaluating GPT-4V on chest radiograph findings](https://pubs.rsna.org/doi/abs/10.1148/radiol.233270)).
- **GI endoscopy.** On the Gastrovision dataset, GPT-4V macro precision 11.15%, macro recall 9.12%, macro F1 6.81% — i.e. essentially does not work for endoscopic image classification ([Systematic Evaluation of GPT-4V on medical images, arXiv](https://arxiv.org/html/2310.20381v5)).
- **Laryngeal-cancer surgical imagery.** Claude 3.5 Sonnet achieved highest accuracy among compared models at 79.43% (95% CI 77.02–81.84%), with image+text outperforming text-only by ~13 points in some prompt configurations ([Multimodal LLMs on laryngeal cancer image interpretation, PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12372740/); [Visual-textual integration quantitative analysis, medRxiv](https://www.medrxiv.org/content/10.1101/2024.08.31.24312878.full.pdf)).
- **Dermatology with skin-tone bias.** GPT-4V's accuracy degrades on Fitzpatrick III–VI compared to I–II for melanoma; the model declined to provide a skin tone for 53/656 images in one dataset and was only 56.5% accurate on the skin tones it did report ([Performance of ChatGPT-4o across Fitzpatrick types, PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12323556/); [Mitigating skin tone biases in clinical dermatology LLMs, arXiv](https://arxiv.org/html/2510.00055v2)).

The pattern across these is consistent: **general vision models can describe well and classify poorly on medical imagery.** They produce report-shaped text and reasonable identifications of obvious features but hallucinate plausible-sounding clinical findings, exhibit demographic bias, and degrade on tasks requiring fine-grained discrimination.

### 3.2 Stool-image AI specifically — purpose-built outperforms general

Purpose-built stool-image classifiers, both human and veterinary, post much stronger numbers than general-purpose VLMs do on related tasks:

- **Human BSFS classification via smartphone app.** A trained-AI smartphone app outperformed self-reported BSFS scores against expert-gastroenterologist ground truth: 95% vs 89% accuracy, diagnostic odds ratio 30.64 vs 3.67; sensitivity +16 pts and specificity +11 pts over user self-report ([AI smartphone app vs self-reported stool form, PubMed](https://pubmed.ncbi.nlm.nih.gov/35288511/); [Cedars-Sinai newsroom summary](https://www.cedars-sinai.org/newsroom/study-app-more-accurate-than-patient-evaluation-of-stool-samples/)).
- **Auggi-style stool features in ulcerative colitis.** AI-derived stool image features (BSFS, consistency, fragmentation, edge fuzziness, volume) correlated with CRP at AUC 0.69–0.82 in acute severe UC inpatients ([AI- and physician-interpreted stool features correlate with CRP in acute severe UC, PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11350077/)).
- **PoopMD (infant acholic stool screening for biliary atresia).** Pilot study reported no false negatives; consistent across users, phones, ambient lighting; FDA-uncleared but distributed free ([PoopMD identifies acholic stools, PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC4519295/); [PoopMD coverage, Science Magazine](https://www.science.org/content/article/want-check-your-child-s-poop-liver-disease-there-s-app)).
- **Aptaclub / Nutricia Stool Tracker (infants).** The algorithm classified 77% of smartphone nappy photos correctly per the Brussels Infant and Toddler Stool Scale; parents scored 65% on the same images — algorithm-on-photo beat parent-on-photo ([Nutricia Stool Tracker validation summary](https://www.nutricia.com/latest-news/StoolTracker.html); [Aptaclub Poop Checker tool](https://www.aptaclub.co.uk/baby/baby-tools/poo-tracker.html)).
- **Veterinary purpose-built apps.** DIG Labs (computer vision on dog stool, includes detection of features like proglottids — visible tapeworm segments — and links visual attributes to gut microbiome correlates) ([DIG Labs technology page](https://getdiglabs.com/pages/our-technology); [DIG Labs computer vision blog](https://getdiglabs.com/blogs/the-dig-labs-dish/computer-vision-and-dog-poop)). Mars Poopscan (Bristol-style classification, trained on 14,000 labeled dog faeces images) ([Mars Poopscan science page](https://www.mars.com/poopscan-science)). Veterinary CNNs on canine skin lesions report 98.4% accuracy on classification of erythema, lichenification, alopecia, erosion/ulcer in one study ([Kang et al. on AI canine skin lesions, Veterinary Dermatology, Wiley](https://onlinelibrary.wiley.com/doi/10.1111/vde.70083); [arccjournals dog skin lesion CNN study](https://www.arccjournals.com/journal/indian-journal-of-animal-research/BF-1820)).

### 3.3 Where the literature is silent

There is **no published evaluation of any general-purpose VLM (Claude, GPT-4V, Gemini) on dog or cat stool, vomit, or accident photographs**. The closest signal comes from inferring across (a) human stool studies, (b) veterinary purpose-built CNNs, and (c) general-purpose VLM behavior on adjacent medical imagery. Each step of inference adds uncertainty.

---

## 4. Documented Failure Modes of Vision Models on Biological/Organic Imagery

Across the medical-imaging literature, vision-language model errors cluster into a small number of recurring shapes:

- **Object hallucination — describing what isn't there.** Models "favor textual prompts over visual evidence," extrapolating from learned visual-semantic priors when region-specific visual signals are weak or anomalous ([Mechanisms of prompt-induced hallucination in VLMs, arXiv](https://arxiv.org/abs/2601.05201); [Review of hallucination in large language and vision models, ResearchGate](https://www.researchgate.net/publication/396093591_Review_of_Hallucination_Understanding_in_Large_Language_and_Vision_Models)).
- **Object omission — missing what *is* there.** The mirror failure mode: features present in image but absent from generated description ([HALP detecting VLM hallucinations, arXiv](https://arxiv.org/html/2603.05465v1); [HallusionBench, arXiv](https://arxiv.org/pdf/2310.14566)).
- **Clinically-plausible-but-unsupported findings.** Medical VLMs produce reports "not grounded in the input image, generating clinically plausible but unsupported findings" — phrased in the literature as Visual Hallucination ([Hallucination mitigation for medical report generation, arXiv](https://arxiv.org/html/2601.15745); [Phrase-grounded fact-checking for CXR reports, arXiv](https://arxiv.org/pdf/2509.21356)).
- **Counting / quantity errors.** Models extrapolate from learned scene statistics. In controlled experiments on organic subjects (waterlilies), counts conformed to prompt suggestion rather than image evidence as object counts grew ([HallusionBench, arXiv](https://arxiv.org/pdf/2310.14566)).
- **Anatomical localization errors.** Documented in radiology — "incorrect anatomical localization, inaccurate imaging descriptions, and hallucinated findings" appear as consistent failure categories ([Diagnostic accuracy of VLMs for neuroradiological interpretation, NCBI/PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12623885/)).
- **Demographic bias.** Worse performance on darker skin tones across multiple VLMs ([Fitzpatrick performance, PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12323556/)). Veterinary analog is unknown but the same data-imbalance dynamics plausibly apply across coat color, lighting, household photography environments.
- **Color misreading under varied lighting.** Adjacent telemedicine literature: smartphone images are degraded by suboptimal lighting, framing, low resolution, bandwidth compression, and AI-based filters that "alter color, texture and contrast in ways that obscure clinically relevant signs." Out-of-focus / blur is unrecoverable after acquisition ([ICT&Health on smartphone clinical imagery](https://www.icthealth.org/news/when-smartphone-images-misrepresent-clinical-truth); [Ophthalmoscopy image quality metrics, arXiv](https://arxiv.org/pdf/1903.02695)). For stool/vomit photography specifically, indoor lighting can shift yellow vs green vs brown by clinically meaningful amounts. The model has no calibrated reference.
- **False-reassurance and false-alarm asymmetry in dermatology AI.** Cochrane-style review found mean sensitivity 0.28, mean specificity 0.81, mean accuracy 0.59 across commercially available smartphone apps for melanoma detection — and eight apps failed to identify any melanoma in top rankings ([Smartphone apps melanoma detection accuracy, PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC9328117/); [AI dermatology apps need more evaluation and regulation, PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC8144419/)). The harm is bidirectional: a SkinVision study found 27% higher rate of suspicious classification than dermatologist gold standard — risk of needless anxiety alongside risk of missed lesions ([SkinVision dermatologist agreement study, PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC7027514/)).

For a Nyx-shaped feature, the practical translation is: vision-model errors on stool/vomit photographs are likely to (a) describe foreign material that isn't present, (b) miss material that is, (c) misread color when ambient lighting is warm or cool, (d) generate clinically-resonant words (inflammation, parasites, infection) ungrounded in the image, and (e) be more confident than calibrated.

---

## 5. Owner-Reported vs Photo-Based Clinical History

Photographs are not free signal. Veterinary practice treats them as a supplement to owner verbal report — they do not replace it.

- **AVMA / AAHA telehealth guidance.** Telehealth examinations may suffer from "the quality of images, the accuracy of the description of the concern, missed symptoms or physical cues, and diagnosis without diagnostic testing" ([AAHA telehealth limitations](https://www.aaha.org/resources/2023-aaha-senior-care-guidelines-for-dogs-and-cats/using-telehealth-and-telemedicine-technologies/); [AAHA/AVMA 2021 Telehealth Guidelines PDF](http://www.aaha.org/wp-content/uploads/globalassets/02-guidelines/telehealth/2021-aaha-avma-telehealth-guidelines.pdf); [AVMA guidelines page](https://www.avma.org/sites/default/files/2021-01/AVMA-Veterinary-Telehealth-Guidelines.pdf)). The assessor uses owner report "sometimes supplemented by visual (e.g., photographs, video) information" — photographs are framed as supplemental, not primary.
- **Photo + structured AI features can exceed unaided owner report.** The smartphone-stool app data (95% AI accuracy vs 89% self-report on BSFS, [PubMed](https://pubmed.ncbi.nlm.nih.gov/35288511/)) and the Nutricia/Aptaclub infant data (77% algorithm vs 65% parent on BITSS) both find AI-on-photo outperforming human-on-photo for owner-grade scoring. This is a positive signal for offering owners visual feedback they couldn't generate themselves.
- **Owner history is known-imperfect even before photos enter the picture.** Veterinary clinical reasoning literature explicitly treats history as part-objective, part-subjective: "Be aware that some owners are extremely observant of their pet and others are not." Caretaker-to-caretaker discrepancy is documented in veterinary dermatology — different household members report meaningfully different histories on the same animal ([Pet owners and veterinarians on information exchange, PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC7850489/); [Informant discrepancy in veterinary dermatology, PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC12261937/); [History-taking technique, Clinician's Brief](https://www.cliniciansbrief.com/article/history-taking), cross-referenced in [Nyx event-timestamp-uncertainty brief §2](./2026-05-event-timestamp-uncertainty.md)).
- **Reporting bias on what gets logged at all.** Dogslife cohort: 6,084 Labradors, 28% of vomiting reports and 37% of diarrhoea reports led to a vet visit. Most GI events are managed at home and never seen by a clinician. Behavioral threshold: diarrhoea typically needed two days; vomiting at least every 6 hours typically needed one day, before a vet visit was triggered ([Dogslife cohort, PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5424887/); [PubMed](https://pubmed.ncbi.nlm.nih.gov/28460746/)).

Read together: pet owners are the primary observers and primary data source; their data is known to be imperfect; and AI-on-photo can outperform owner-on-photo for structured scoring tasks. This is genuinely the case the consumer-app evidence supports. It does not extend to "AI-on-photo can diagnose."

---

## 6. How Clinical-Adjacent Consumer Products Position the Gap

The team should know the existing language conventions. None of the products surveyed below position themselves as diagnostic; all use a recognizable register of hedge-and-defer.

### 6.1 Dermatology (the most-developed adjacent domain)

- **SkinVision** — CE-marked Class IIa medical device in Europe. Categorizes lesions as low / medium / high risk. Independent clinical research found 27% over-flagging vs dermatologist gold standard on real-world image sets ([SkinVision agreement study, PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC7027514/); [SkinVision regulatory positioning summary](https://www.scanskinai.com/blog/scanskinai-vs-skinvision)).
- **MoleMapper** (OHSU) — explicit framing: "Mole Mapper is NOT designed to provide medical advice, professional diagnosis, opinion, or treatment. Currently, there is not enough data to develop an app that can diagnose melanoma." Functions as a mole-tracking and photo-archiving tool, not a classifier ([MoleMapper, OHSU](https://www.ohsu.edu/war-on-melanoma/molemappertm-mole-tracking-app)).
- **MoleScope** — hardware (dermoscopy lens) + app; pitched as "track and monitor your moles and spots over time," with tele-consult with physicians as the diagnostic step ([MoleScope product page](https://www.molescope.com/); [MoleScope II](https://www.dermengine.com/molescope)).
- **Smartphone melanoma apps generally** — none have FDA approval as of the most recent reviews; accuracy is "highly variable and overall low"; AI training sets selected from biopsied lesions inflate apparent sensitivity/specificity vs general-population photos ([AI dermatology smartphone apps regulation review, PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC8144419/); [Commercial smartphone melanoma detection accuracy review, PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC9328117/)).

### 6.2 Human stool / digestive health

- **PoopMD** — narrow scope (acholic stool / biliary atresia screening for infants), three-category output (normal / pale / consistent with blood), email-to-pediatrician as the next step. Validation focuses on no-false-negatives within the narrow use case ([PoopMD validation, PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC4519295/); [imedicalapps coverage](https://www.imedicalapps.com/2015/04/unsure-babys-poops-theres-app/)).
- **Aptaclub Poop Checker / Nutricia Stool Tracker** — outputs a Brussels Infant and Toddler Stool Scale classification with parent-facing guidance, marketed by Danone as a wellness aid not a diagnostic ([Aptaclub Poop Tracker, UK](https://www.aptaclub.co.uk/baby/baby-tools/poo-tracker.html); [Nutricia Stool Tracker news](https://www.nutricia.com/latest-news/StoolTracker.html); [Danone R&I digital health stool tracker](https://www.danoneresearch.com/digital-innovation/digital-health/stool-tracker/)).

### 6.3 General symptom checkers (human)

- **Ada Health** — Class IIa medical device in EU; outputs "possible causes" with "an assessment, not a medical diagnosis"; broad condition coverage (99% in one comparison) ([Ada Health overview, Wikipedia](https://en.wikipedia.org/wiki/Ada_Health); [Ada terms framing, iatrox review](https://www.iatrox.com/blog/ada-symptom-checker-review-uk-gp-2026); [Comparative symptom-checker condition coverage, PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC7745523/)).
- **Buoy Health** — explicitly "not a substitute for professional medical evaluation or treatment."
- **K Health** — pairs AI triage with telehealth handoff to a licensed clinician — the AI never operates as the diagnostic endpoint.

### 6.4 Pet symptom checkers

- **Petriage** — four-tier urgency output (Non-threatening / Worrisome / Urgent / Emergency). Patent-protected, validated by a team of veterinarians, claims 97%+ accuracy on urgency classification (note: urgency, not diagnosis). Integrates with subscribing clinics for handoff ([Petriage homepage](https://petriage.com/); [Today's Veterinary Business on patent](https://todaysveterinarybusiness.com/pet-symptom-checker-patent/); [Overview of animal symptom checkers, PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC7193881/)).
- **Pawp Pet Symptom Checker** — frames itself as "help you understand the level of concern" ([Pawp symptom checker explainer](https://pawp.com/what-is-pawps-pet-symptom-checker/)).
- **PetMD by Chewy** — explicit language: outputs "not intended to constitute medical advice, diagnosis or treatment for your pet and should not be relied upon as a substitute to the clinical advice or care management by a treating veterinarian" ([PetMD symptom checker](https://www.petmd.com/symptom-checker)).
- **DIG Labs (closest analog to a Nyx-shaped feature)** — vision-AI on dog stool. Explicit framing: "DIG Labs does not diagnose or treat disease or health issues." Suggests "the most likely causes behind symptoms" and recommends diet/lifestyle improvements; "expressly created for canine stool analysis and is not designed for other animal or human use." Positions itself as "a partner tool to support pet owners… not a substitute for professional veterinary diagnosis" ([DIG Labs FAQ](https://getdiglabs.com/pages/faq); [DIG Labs technology](https://getdiglabs.com/pages/our-technology)).

**Convergent pattern across all of the above:** describe-what-is-seen, hedge what-it-might-mean, defer-to-clinician on what-to-do.

---

## 7. Descriptive vs Diagnostic Language — Where the Line Is Drawn

The clinical-writing literature already has a vocabulary for the boundary the team is implicitly debating.

### 7.1 Radiology's findings-vs-impression split

Radiology reports formalize observation and interpretation in separate sections. The Findings section "describes vascular congestion and consolidations"; the Impression section "interprets those as congestive heart failure (CHF) and pneumonia." Mixing them — "conflation can lead to incorrect diagnosis" — is treated as a writing-craft error ([ContrastConnect on findings vs impression](https://www.contrast-connect.com/blog-post/radiology-report-findings-vs-impression-whats-the-difference); [AJR — Language of the Radiology Report](https://ajronline.org/doi/10.2214/ajr.175.5.1751239); [Patient-radiologist interpretive differences on diagnostic phrases, PubMed](https://pubmed.ncbi.nlm.nih.gov/29023151/)).

This split maps directly to what a Nyx-shaped vision feature could and could not say:

| Category | Examples | Safe to surface? |
|---|---|---|
| **Descriptive (observation)** | "yellow", "foamy", "contains visible hair", "contains undigested kibble", "loose, no shape", "watery", "log-shaped, segmented", "dark red", "appears to contain a foreign object — photograph is unclear" | Yes — observational language is the radiology Findings analog. |
| **Quasi-descriptive / scale mapping** | "Purina score approximately 5/7", "Bristol type 6/7", "color closer to bilious-yellow than blood-red" | Mostly — the scale is the abstraction; the AI is mapping observation onto a published rubric. Caveat: inter-rater agreement is already mixed (Cavett 2021 kappas 0.34–0.77), so a model score with no confidence band hides real uncertainty. |
| **Diagnostic (interpretation)** | "inflammation", "infection", "normal", "abnormal", "concerning", "healthy", "irritable bowel", "gastritis", "pancreatitis", "parasitic load", "intestinal obstruction" | No — these are radiology Impression analogs. They imply clinical conclusions ungrounded in the image alone. |
| **Severity / urgency framing** | "this looks serious", "consider an emergency vet", "no need to worry" | No on the AI surface — these are triage outputs, separate problem from a per-event observation. Petriage-style urgency is a different feature shape. |

### 7.2 Veterinary SOAP-note conventions reinforce the split

Vet SOAP-note guides ([VetSyCare templates](https://vetsycare.com/blog/veterinary-soap-notes-templates); [VetGeni complete guide](https://www.vetgeni.com/guides/complete-veterinary-soap-notes); [PupPilot SOAP guide](https://www.puppilot.co/blog/the-veterinarians-complete-guide-to-soap-notes-2024)) describe stool in the Objective section using language like "loose brown stool, no melena, no hematochezia" — observation-first, pathological-language reserved for the Assessment. Veterinarians are explicitly taught to translate owner-colloquial input ("acting weird") into clinical observations ("decreased appetite, lethargy three days") before any diagnostic inference.

### 7.3 Hedging and disclaimers — necessary but not sufficient

Medical-AI hedging language (modal verbs *may*, *might*, *could*; adverbs *often*, *sometimes*; verbs *appears*, *seems*, *suggests*) is the established way to signal uncertainty in clinical writing ([Hedging in medical discourse, PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11336192/)). However, recent work found a **negative correlation** between diagnostic accuracy and disclaimer presence in generative AI — i.e. the more accurate a model gets, the *less* likely it is to include cautionary language ([Decline in medical safety messaging in generative AI, arXiv](https://arxiv.org/html/2507.08030v1)). Lower disclaimer rates were observed in high-stakes diagnostic categories (5.2%) and medication interaction (2.5%). A product can't rely on the underlying model to self-hedge; the product surface has to enforce it.

### 7.4 The FDA's general-wellness / medical-device line

US FDA distinguishes general-wellness products (low-risk, intended for wellness use, no disease/diagnostic/treatment claims) from medical devices (medical intended use including diagnosis, treatment, prevention, analysis of medical images/signals) ([FDA Device Software Functions including Mobile Medical Applications](https://www.fda.gov/medical-devices/digital-health-center-excellence/device-software-functions-including-mobile-medical-applications); [Updated 2026 FDA guidance on general wellness](https://www.faegredrinker.com/en/insights/publications/2026/1/key-updates-in-fdas-2026-general-wellness-and-clinical-decision-support-software-guidance); [Cohen Healthcare Law on mobile health app compliance](https://cohenhealthcarelaw.com/mobile-health-apps-legal-compliance-essentials-for-fda-and-ftc-standards/)). The boundary is partly determined by **claimed intended use** — language matters. "Apps making claims about diagnosing or treating disease come under FDA oversight." Standard disclaimer formulations like *"not intended to diagnose, treat, cure, or prevent any disease"* are inherited from dietary-supplement structure/function rules and have specific formatting requirements ([eCFR 21 CFR 101.93](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-F/section-101.93)). Pet products are not directly FDA-device-regulated in the same way human ones are, but the linguistic conventions and regulatory logic transfer.

Anthropic's own vision documentation states that Claude outputs "should not be considered a substitute for professional medical advice or diagnosis" and advises against using Claude for tasks requiring perfect precision or sensitive image analysis without human oversight ([Anthropic vision docs](https://docs.anthropic.com/en/docs/build-with-claude/vision)). Claude Sonnet 4.5 ships with explicit safety filters that refuse some classes of medical adversarial prompts (86.2% full refusal rate in one red-team evaluation; authority-impersonation attacks still landed at 45% success in the same study) ([Red-teaming medical AI on Claude Sonnet 4.5, medRxiv](https://www.medrxiv.org/content/10.64898/2026.02.26.26347212v1.full.pdf)). The model behavior is a moving target; a product cannot bank on a particular refusal rate.

---

## 8. Evidence Relevant to Feature Shape — Standalone Blurb vs Scoped-Signal

Two product shapes are on the table; this brief does not pick one. The evidence does, however, surface some asymmetries.

### 8.1 Cost shape

A standalone per-event blurb fires once per attached photo — call frequency is bounded by the rate at which a household generates symptom events with photos. The feeding-windows cohort (Dogslife, 18.9% of dogs vomited in a two-week window, [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC5424887/)) gives an order-of-magnitude estimate of how often vomit events alone would trigger a call.

A home-screen Signal scoped to one event fires when the home screen is opened, on a possibly-different cadence. Vision-API call cost scales with input image size, and cached-vs-live patterns are an established cost-optimization lever in mobile AI: OpenAI's published cached-input rate is roughly 10% of standard-input rate; cached generation cuts costs by 50–90% in typical patterns ([Best AI API for mobile apps cost guide](https://tokenmix.ai/blog/best-ai-api-for-mobile-apps); [OpenAI API pricing](https://openai.com/api/pricing/)). The relevant question is not which shape is cheaper but whether the model output is **idempotent enough** to cache by (photo, event metadata) hash — if the same photo can be re-shown the same description on every home-screen open, caching is straightforward; if the description depends on time-since-event or other dynamic context, it is not.

### 8.2 Owner attention shape

UI research treats home screens and detail screens as different cognitive surfaces. Home screens are 3–5-second judgement zones — high-frequency, low-attention, prioritize summary; detail screens follow progressive disclosure, are entered with intent, and tolerate more information depth ([Mobile UI best practices, Baianat](https://www.baianat.com/books/designing-for-small-screens/mobile-ui-best-practices); [Progressive-disclosure summary, Alpha Efficiency](https://alphaefficiency.com/ui-screens)). A per-event detail-screen blurb lands on a surface the user already chose to enter; a home-screen Signal lands unbidden on a higher-stakes surface where errors are more visible. The literature does not pick the right shape, but it does describe what each shape demands of the content.

### 8.3 Latency

AI-feature engagement benchmarks (OpenAI/industry) plateau around: <500ms perceived response time ≈ 78% engagement; 500ms–2s ≈ 52%; >2s ≈ 31% ([Best AI API for mobile apps engagement data](https://tokenmix.ai/blog/best-ai-api-for-mobile-apps)). A live-generated detail-screen blurb would land in the 1–3s window typical of Claude vision calls. A cached blurb (generated on event-create, displayed on event-view) avoids that latency entirely. The difference is meaningful for the Designer's 10-second-test analog on a non-quick-log surface.

The team has not measured any of these in Nyx.

---

## 9. Open Questions

The literature does not resolve, and Nyx-specific evidence does not yet exist for:

- **How does Claude 3.5 / 4.5 Sonnet actually perform on dog and cat stool, vomit, and accident photographs?** No published evaluation exists. The team would have to generate this evidence with an internal eval set (~100 photos spanning normal/abnormal, dog/cat, well-lit/poorly-lit, common-foreign-object/no-foreign-object) before sizing the feature realistically.
- **Are owners more or less likely to attach photos to severe events?** Recall bias may already be selecting for visually-dramatic events in the data Nyx is collecting; the AI's training-time priors and the owner's logging behavior may co-bias in the same direction.
- **Does descriptive-only language hold up across the actual long tail?** Melena, foreign material, vivid bile, and blood are categories where "describe what's visible" already encodes clinical weight whether the model says the word or not. The boundary is squishier than radiology-style separation suggests.
- **Does the persona conflict actually reduce when the surface is a detail screen instead of a home screen?** Jordan's "data went into a black box" complaint is plausibly a home-screen-on-cold-open problem; if the blurb lives on a detail screen the user already chose to enter, the framing may shift. Untested.
- **Inter-rater agreement on AI-generated descriptions vs human descriptions.** Cavett 2021 gave us vet-to-vet kappas on stool scoring. There is no analog study for AI-vs-vet on the same photos for pets.
- **Photo-quality refusal threshold.** At what blur / lighting / framing level should the model refuse to describe at all? Existing dermatology AI products use explicit "retake photo" patterns ([Telemedicine photo quality AI support tool, arXiv](https://arxiv.org/pdf/2209.09105)); pet products surveyed do not surface them clearly.
- **What happens when the photo contains an obvious clinical emergency the descriptive-only frame cannot honour?** A photo of frank melena, profuse hematochezia, or a clearly visible foreign object in vomit creates a genuine tension between "describe only what's visible" and "do not give clinical alarm." The literature has not resolved this — dermatology AI consistently struggles with the same boundary on suspicious-mole presentation.
- **Whether the AI Signal home-screen pattern (cached, server-side, low-frequency) and the per-event blurb pattern (per-photo, potentially live) should share infrastructure.** This is a Step 10 infrastructure question that becomes more constrained once feature shape is chosen.
- **Veterinary photo-quality guidelines specific to stool/vomit imagery.** The AVMA/AAHA telehealth guidelines acknowledge photo-quality variance as a limitation but do not give specific capture standards. There is no analog to the dermatology "good photo" guidance for pet stool/vomit yet.

---

## Sources

### Clinical scales and stool/vomit scoring

- [Bristol Stool Scale — historical summary (Grokipedia)](https://grokipedia.com/page/Bristol_stool_scale)
- [Validity and reliability of the Bristol Stool Form Scale in healthy adults and IBS patients (Wiley APT 2016)](https://onlinelibrary.wiley.com/doi/10.1111/apt.13746)
- [Bristol Stool Chart adapted for dogs (Maev)](https://maevworld.com/nutrition/bristol-stool-chart-for-dogs)
- [Petscare — Bristol Stool Chart for pets](https://www.petscare.com/en-gb/news/post/understand-dog-health-poop-chart)
- [Nestlé Purina Fecal Scoring System (Univ. of Missouri VHC PDF)](https://vhc.missouri.edu/wp-content/uploads/2020/07/Nestle-Purina-Fecal-Scoring-System.pdf)
- [Purina Fecal Scoring System (Univ. of Georgia Vet Med PDF)](https://vet.uga.edu/wp-content/uploads/2020/10/Nestle-Purina-Fecal-Scoring-System.pdf)
- [Purina Faecal Scoring Chart (UK Vet Centre PDF)](https://vetcentre.purina.co.uk/sites/default/files/2021-11/Faecal%20scoring%20chart_general%20use.pdf)
- [Purina Institute — Nutritional & Clinical Assessment Tools](https://www.purinainstitute.com/centresquare/nutritional-and-clinical-assessment-tools)
- [Why the Purina Fecal Scoring Chart matters (Sunstone Vets)](https://www.sunstonevets.com/blog/www-sunstonevets-com-purina-fecal-scoring-chart/)
- [WALTHAM Faeces Scoring System PDF](https://www.waltham.com/s3media/2020-05/waltham-scoring.pdf)
- [WALTHAM scoring (Pedigree distribution)](https://www.pedigree.in/files/2024-02/waltham-scoring.pdf)
- [Why monitor your dog's faeces (WALTHAM)](https://www.waltham.com/news-events/nutrition/why-monitor-your-dogs-faeces)
- [Cavett et al. 2021 — Consistency of faecal scoring using two canine faecal scoring systems (Wiley J Small Anim Pract)](https://onlinelibrary.wiley.com/doi/10.1111/jsap.13283)
- [Cavett 2021 — PubMed entry](https://pubmed.ncbi.nlm.nih.gov/33491796/)

### Vomit and stool characterization — clinical

- [Purina — Types of dog vomit](https://www.purina.com/articles/dog/health/digestion/types-of-dog-vomit)
- [Great Pet Care — Dog vomit color guide](https://www.greatpetcare.com/dog-health/dog-vomit-color-guide/)
- [Meowant — Cat vomit color guide](https://meowant.com/blogs/comprehensive-guides/cat-vomit-color-guide)
- [VIN Veterinary Partner — Bilious Vomiting Syndrome in Dogs and Cats](https://veterinarypartner.vin.com/default.aspx?pid=19239&catId=254092&id=12296225)
- [Cornell Feline Health Center — The Danger of Hairballs](https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/danger-hairballs)
- [Litter-Robot — Is it a hairball or something else?](https://www.whisker.com/blog/ask-the-vet-is-it-a-hairball)
- [Purina — Cat hairball vs vomit](https://www.purina.com/articles/cat/health/digestion/cat-hairball-vomit)
- [Melena (blood in stool) in dogs — PetPlace](https://www.petplace.com/article/dogs/pet-health/melena-blood-in-stool-in-dogs)
- [Melena (blood in stool) in cats — PetPlace](https://www.petplace.com/article/cats/pet-health/melena-blood-in-stool-in-cats)
- [Bloody Stool — Melena and Hematochezia in Dogs (Vetster)](https://vetster.com/en/symptoms/dog/bloody-stool-melena-and-hematochezia)
- [Hematemesis, Melena, and Hematochezia — NCBI Bookshelf, Clinical Methods](https://www.ncbi.nlm.nih.gov/books/NBK411/)

### Vision-language models on medical imagery

- [JMIR Neurotechnology — GPT-4V on neuroradiology board-style exam questions (2026)](https://neuro.jmir.org/2026/1/e69708)
- [A Systematic Evaluation of GPT-4V's Multimodal Capability for Medical Image Analysis (arXiv)](https://arxiv.org/html/2310.20381v5)
- [GPT-4V Cannot Generate Radiology Reports Yet (arXiv)](https://arxiv.org/html/2407.12176v1)
- [Evaluating GPT-4V on chest radiograph findings — Radiology / RSNA](https://pubs.rsna.org/doi/abs/10.1148/radiol.233270)
- [Multimodal LLMs on laryngeal cancer image interpretation (PMC)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12372740/)
- [Visual-Textual Integration in LLMs for Medical Diagnosis (medRxiv)](https://www.medrxiv.org/content/10.1101/2024.08.31.24312878.full.pdf)
- [Diagnostic accuracy of VLMs for neuroradiological interpretation (NCBI/PMC)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12623885/)
- [ChatGPT-4o dermatological diagnosis across Fitzpatrick skin types (PMC)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12323556/)
- [Adapting LLMs to mitigate skin tone biases in clinical dermatology (arXiv)](https://arxiv.org/html/2510.00055v2)
- [Anthropic — Vision documentation](https://docs.anthropic.com/en/docs/build-with-claude/vision)
- [Red-teaming medical AI on Claude Sonnet 4.5 (medRxiv)](https://www.medrxiv.org/content/10.64898/2026.02.26.26347212v1.full.pdf)

### Vision-language model hallucinations and failure modes

- [Mechanisms of Prompt-Induced Hallucination in Vision-Language Models (arXiv)](https://arxiv.org/abs/2601.05201)
- [HallusionBench — VLM hallucination and visual illusion benchmark (arXiv)](https://arxiv.org/pdf/2310.14566)
- [HALP — Detecting Hallucinations in Vision-Language Models without generating a single token (arXiv)](https://arxiv.org/html/2603.05465v1)
- [Hallucination Mitigation for Medical Report Generation (arXiv)](https://arxiv.org/html/2601.15745)
- [Phrase-grounded Fact-checking for Generated Chest X-ray Reports (arXiv)](https://arxiv.org/pdf/2509.21356)
- [Review of Hallucination Understanding in Large Language and Vision Models (ResearchGate)](https://www.researchgate.net/publication/396093591_Review_of_Hallucination_Understanding_in_Large_Language_and_Vision_Models)
- [Interpreting Vision and Language Generative Models with Semantic Visual Priors (Frontiers)](https://www.frontiersin.org/journals/artificial-intelligence/articles/10.3389/frai.2023.1220476/full)

### Stool image AI — human medicine and consumer

- [Smartphone AI app vs self-reported BSFS (PubMed)](https://pubmed.ncbi.nlm.nih.gov/35288511/)
- [Cedars-Sinai newsroom on the AI stool app study](https://www.cedars-sinai.org/newsroom/study-app-more-accurate-than-patient-evaluation-of-stool-samples/)
- [AI- and physician-interpreted stool image characteristics correlate with CRP in acute severe UC (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11350077/)
- [Detection and Classification of Human Stool Using Deep CNNs (IEEE)](https://ieeexplore.ieee.org/document/9632585/)
- [Machine Learning for Automated Digital Image Scoring of Stool in Diapers (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC7815249/)
- [PoopMD identifies infant acholic stools (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4519295/)
- [PoopMD coverage — Science magazine](https://www.science.org/content/article/want-check-your-child-s-poop-liver-disease-there-s-app)
- [Aptaclub Poop Tracker tool (UK)](https://www.aptaclub.co.uk/baby/baby-tools/poo-tracker.html)
- [Aptaclub Poopchecker upload](https://www.aptaclub.com/en-mt/baby/tools/poopchecker.html)
- [Nutricia Stool Tracker validation (news)](https://www.nutricia.com/latest-news/StoolTracker.html)
- [Danone R&I — Digital Health Stool Tracker](https://www.danoneresearch.com/digital-innovation/digital-health/stool-tracker/)

### Stool image AI — veterinary and pet consumer

- [DIG Labs — Computer vision and dog poop](https://getdiglabs.com/blogs/the-dig-labs-dish/computer-vision-and-dog-poop)
- [DIG Labs — Our technology](https://getdiglabs.com/pages/our-technology)
- [DIG Labs — FAQ](https://getdiglabs.com/pages/faq)
- [Mars Poopscan — Science page](https://www.mars.com/poopscan-science)
- [AI-based identification of common canine skin lesions (Kang et al., Wiley Veterinary Dermatology)](https://onlinelibrary.wiley.com/doi/10.1111/vde.70083)
- [CNN-based detection of skin lesions in dogs (Indian J Animal Research)](https://www.arccjournals.com/journal/indian-journal-of-animal-research/BF-1820)

### Veterinary telemedicine and image quality

- [Veterinary telehealth basics (AVMA)](https://www.avma.org/resources-tools/animal-health-and-welfare/telehealth-telemedicine-veterinary-practice/veterinary-telehealth-basics)
- [AVMA Guidelines for the Use of Telehealth in Veterinary Practice (PDF)](https://www.avma.org/sites/default/files/2021-01/AVMA-Veterinary-Telehealth-Guidelines.pdf)
- [2021 AAHA/AVMA Telehealth Guidelines for Small-Animal Practice (AAHA)](https://www.aaha.org/resources/2021-aaha-avma-telehealth-guidelines-for-small-animal-practice/)
- [AAHA/AVMA Telehealth Guidelines (full PDF)](http://www.aaha.org/wp-content/uploads/globalassets/02-guidelines/telehealth/2021-aaha-avma-telehealth-guidelines.pdf)
- [Using Telehealth and Telemedicine Technologies (AAHA 2023 Senior Care Guidelines)](https://www.aaha.org/resources/2023-aaha-senior-care-guidelines-for-dogs-and-cats/using-telehealth-and-telemedicine-technologies/)
- [Veterinary Telemedicine: A literature review (Veterinary Evidence)](https://veterinaryevidence.org/index.php/ve/article/view/349)
- [TrueImage — ML algorithm to improve telehealth photo quality (arXiv)](https://arxiv.org/pdf/2010.02086)
- [Telemedicine photo-quality AI support tool (arXiv)](https://arxiv.org/pdf/2209.09105)
- [When smartphone images misrepresent clinical truth (ICT&Health)](https://www.icthealth.org/news/when-smartphone-images-misrepresent-clinical-truth)
- [Diagnostic accuracy of smartphone-captured radiologic images via WhatsApp (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC8761606/)

### Dermatology consumer AI — adjacent guardrail patterns

- [SkinVision — agreement vs dermatologists (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC7027514/)
- [SkinVision vs ScanSkinAI (positioning summary)](https://www.scanskinai.com/blog/scanskinai-vs-skinvision)
- [Commercial smartphone melanoma apps accuracy review (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC9328117/)
- [AI smartphone apps for skin cancer — regulation review (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC8144419/)
- [MoleScope — product page](https://www.molescope.com/)
- [MoleScope II — DermEngine](https://www.dermengine.com/molescope)
- [MoleMapper — OHSU War on Melanoma](https://www.ohsu.edu/war-on-melanoma/molemappertm-mole-tracking-app)

### Symptom-checker apps (human and pet) — language and scope

- [Ada Health — Wikipedia](https://en.wikipedia.org/wiki/Ada_Health)
- [Ada symptom checker review (iatrox)](https://www.iatrox.com/blog/ada-symptom-checker-review-uk-gp-2026)
- [Comparative coverage of symptom-checker apps (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC7745523/)
- [Petriage — homepage](https://petriage.com/)
- [Petriage patent coverage (Today's Veterinary Business)](https://todaysveterinarybusiness.com/pet-symptom-checker-patent/)
- [Pawp Pet Symptom Checker overview](https://pawp.com/what-is-pawps-pet-symptom-checker/)
- [PetMD Symptom Checker — by Chewy](https://www.petmd.com/symptom-checker)
- [A brief overview of animal symptom checkers (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC7193881/)

### Owner-history accuracy and clinical reasoning

- [Pet owners and veterinarians on information exchange (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC7850489/)
- [Informant discrepancy in veterinary dermatology (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12261937/)
- [History-Taking technique (Clinician's Brief)](https://www.cliniciansbrief.com/article/history-taking)
- [Dogslife cohort — incidence rates and risk factor analyses for owner-reported vomiting and diarrhoea (PMC)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5424887/)
- [Dogslife cohort — PubMed](https://pubmed.ncbi.nlm.nih.gov/28460746/)

### Descriptive vs diagnostic language — clinical writing and regulation

- [Radiology report findings vs impression (ContrastConnect)](https://www.contrast-connect.com/blog-post/radiology-report-findings-vs-impression-whats-the-difference)
- [Language of the Radiology Report Primer (AJR)](https://ajronline.org/doi/10.2214/ajr.175.5.1751239)
- [Patient-radiologist interpretive differences on diagnostic phrases (PubMed)](https://pubmed.ncbi.nlm.nih.gov/29023151/)
- [VetSyCare — Veterinary SOAP Notes Templates and Examples](https://vetsycare.com/blog/veterinary-soap-notes-templates)
- [VetGeni — Complete Veterinary SOAP Notes Guide](https://www.vetgeni.com/guides/complete-veterinary-soap-notes)
- [PupPilot — Veterinarian's Guide to SOAP Notes](https://www.puppilot.co/blog/the-veterinarians-complete-guide-to-soap-notes-2024)
- [Expressing degrees of uncertainty in medical discourse: Hedging revisited (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11336192/)
- [A Systematic Analysis of Declining Medical Safety Messaging in Generative AI (arXiv)](https://arxiv.org/html/2507.08030v1)
- [FDA — Device Software Functions Including Mobile Medical Applications](https://www.fda.gov/medical-devices/digital-health-center-excellence/device-software-functions-including-mobile-medical-applications)
- [FDA 2026 General Wellness and CDS Software Guidance — Faegre Drinker analysis](https://www.faegredrinker.com/en/insights/publications/2026/1/key-updates-in-fdas-2026-general-wellness-and-clinical-decision-support-software-guidance)
- [Mobile Health App Compliance — FDA & FTC essentials (Cohen Healthcare Law)](https://cohenhealthcarelaw.com/mobile-health-apps-legal-compliance-essentials-for-fda-and-ftc-standards/)
- [eCFR — 21 CFR 101.93 disclaimer requirements](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-F/section-101.93)

### UX, latency, and cost shape

- [Best AI API for mobile apps — latency, SDK support, cost (TokenMix Blog)](https://tokenmix.ai/blog/best-ai-api-for-mobile-apps)
- [OpenAI API Pricing](https://openai.com/api/pricing/)
- [Mobile UI best practices for small screens (Baianat)](https://www.baianat.com/books/designing-for-small-screens/mobile-ui-best-practices)
- [UI screens — principles for maximizing engagement (Alpha Efficiency)](https://alphaefficiency.com/ui-screens)

### Companion Nyx briefs

- [Feeding windows and partial eating (Nyx research, May 2026)](./2026-05-feeding-windows-and-partial-eating.md)
- [Event timestamp uncertainty — witnessed vs discovered incidents (Nyx research, May 2026)](./2026-05-event-timestamp-uncertainty.md)
