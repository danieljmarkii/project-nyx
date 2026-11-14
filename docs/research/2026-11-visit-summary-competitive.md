# The AI visit summary: who summarizes vet visits or reads vet documents today

**Date:** 2026-11-14 · **Status:** 🧊 frozen point-in-time brief (append-only; corrections land as a dated §V at the foot with inline ⚠ pointers, per `.claude/rules/docs.md`) · **Issue:** [CUL-2753](https://linear.app/projectnyx/issue/CUL-2753) · **Lane:** competitive and analogue evidence only. Legal, technical and clinical lanes are not in this file.

**The question.** The PM is considering an "AI visit summary". After a vet visit, at the owner's explicit request, a model reads one visit's typed notes, the owner's pre-visit questions and the documents filed under that visit. It returns a readable summary and a short list of proposed facts (clinic weight, medications, recheck date, "call me if" instructions). The owner confirms each fact one by one. Only confirmed facts enter the deterministic trend engine. This lane asks: who summarizes vet visits or reads vet documents today, how, and what can be learned.

**Method.** One isolated research pass on 2026-11-14. About 75 web calls (search plus page fetches). Three cohorts: owner-side readers and recorders, clinic-side scribes, human-health analogues. Competitor facts were re-verified live, not carried from the older briefs. **No app was installed. No rival summary was generated.** Every product claim is at store-listing or vendor-page strength.

**Evidence tags.** `[E]` the cited page was fetched and read this session. `[E†]` verified only through a search-index excerpt of the cited page (the page blocked a fetch or returned no body). `[A]` assumption, inference or arithmetic. "Not verified" means the claim could not be checked this session.

**What could not be verified.**
- **VetLens.** Two searches returned no product of that name. The "~12k users" figure in `docs/nyx-vet-files-requirements.md` §2 has no source this session.
- **PetRecord.ai.** The site returned only its title ("PetRecord.ai - AI-Powered Pet Health Records"). No feature, price or user count could be read.
- **MyPetID.** The only source is a directory listing read through a search excerpt (GoodFirms returned 403).
- **Fi's help centre, the IDEXX press release, the Otto help article and press page, the AVMA framework article, the Pawly Play listing, the Holderried 2026 trial page** all blocked or returned no body. Claims from them are `[E†]` or marked not verified.
- **App Store dates show no year.** Dates such as "Oct 29" are read as 2026 `[A]`.
- **Scribenote, Talkatoo, HappyDoc, Covetrus Pulse, Provet, Vetster, Chewy.** Not re-verified this session. Their rows in the September brief stand as dated.
- **FTC.** No 2026 action on consumer AI summaries of clinical documents was found. Absence of a search hit is not proof of absence.
- **Petnow.** Not checked.

A note on scope: this folder's README says briefs carry evidence, not recommendations. §6 and §7 were asked for by the issue. They are labelled `[A]` inference and rule nothing.

---

## 1. Bottom line

- **Reading a vet document with AI is now a commodity on the owner side.** At least nine small apps advertise photo or PDF in, structured fields or an explanation out (Pawtient AI, VetGPT, Pawtio, Kovan, Petto, PetCare AI, PetSage, MyPetID, Pawly), plus Fi and CompanAIn at larger scale. `[E]` for the listings fetched; `[E†]` MyPetID and Pawly.
- **Recording the visit is no longer a one-app category.** In September we found one owner-side recorder (Pawtient AI). Today there are at least three: Pawtient AI, VetGPT and Pawtio (first release September 11). `[E]`
- **Nobody found does owner-confirmed facts feeding a trend engine built on the owner's own daily log.** The nearest are partial: Pawtient plots scanned lab values as trends (confirmation step not stated); Kovan and Petto ask the owner to review before saving (no trend engine); Pawtio shows a confidence level per field; VetGPT saves everything in one tap with an undo. `[E]` listings; `[A]` that nothing unindexed exists.
- **Every cohort that is honest about error puts a human between the model and the record.** Clinic scribes have the vet review and send. Human-health studies conclude physician review is required. The better pet apps say "check the details before saving". `[E]`
- **The clinic's own AI summary is now a likely input document.** AI use among veterinary professionals went from 39.2% (2024) to 83.7% (2026); documentation is the top use (62.8% of AI users). Client recaps leave the clinic as an email, a branded PDF, a text message, a clinic app entry or a pasted paragraph. `[E]`
- **The published error pattern is omission first, then invention.** In the NYU study of patient-friendly discharge summaries, 54 of 100 reviews gave top accuracy, 56 of 100 rated the summary entirely complete, and 18 flagged a safety concern. Readability gains were large (grade 11.0 to 6.2). `[E†]`
- **The general assistants now read human medical records.** ChatGPT Health (January 7, 2026), Claude (January 11, 2026), Google's health coach (March 2026) and Apple's Health app (iOS 27) all do some of it. Owners will arrive expecting "upload it and ask". `[E†]`
- **No veterinary body has an adopted policy on consumer AI summaries that we could find.** FDA's January 6, 2026 guidances address clinician decision support and general wellness, not this. `[E†]`

---

## 2. Owner-side cohort: AI record readers and visit recorders

### 2.1 Table

All rows are store-listing or vendor-page strength. "Confirm?" asks whether the owner approves extracted facts before they are stored.

| Product | Input | Output | Confirm? | Feeds a trend or alert? | Price | Privacy posture (stated) | Scale and life signs | Tag |
|---|---|---|---|---|---|---|---|---|
| **Pawtient AI** | Audio of the visit ("with the vet's permission"); photo of lab results | Transcript and AI summary; lab values digitized; Q&A "drawn from your pet's own data" | Not stated on the listing | **Yes, for labs**: creatinine, SDMA, glucose "as trends over time" | Free; Premium $5.99/mo and $59.99/yr; the listing also shows Premium at $14.99/mo and $109.99/yr, and Family at $11.99 and $119.99, unexplained | Label: contact info and user content linked; audio and photos "not linked" | 1 rating (5.0). v1.2.0 "Jun 29": cloud backup of recordings and scans; an experimental "AI Connector" | `[E]` |
| **VetGPT AI Vet** | Audio of the visit; photos of prescriptions, vaccine cards, vet records; chat | "Transcribes everything and extracts diagnoses, warnings, medications, and follow-ups in plain English" | **Bulk, after the fact**: "One tap to save everything"; "Every save shows a receipt you can undo" | Reminders from extracted medications and follow-ups; scanned values "feed ... into every conversation". No trend engine described | Free; Premium $2.99, $4.99, $39.99; annual $19.99 | Label: health, precise location, audio, photos, all linked to identity. "Reminds you to inform parties before recording" | 30 ratings (4.8). v1.7.23 "Nov 5". Category: Medical | `[E]` |
| **Pawtio: Record Vet Visits** | Audio of the visit; scan of lab report, prescription or vaccine certificate | Structured summary: "what was discussed, what changed and what to watch"; a prep brief before the next visit; Ask Pawtio | **Correct after**: "can correct anything that came out wrong". **Each field shows a confidence level** | Not described | Free (no purchases listed) | Transcription "on your device"; recordings "never uploaded"; summaries and scans run "by a server on a paid AI tier" that does not train on the data. No consent language on the listing | No ratings shown. First version "Sep 11", current 1.62.2 "Oct 26" | `[E]` |
| **Kovan: Pet Health Records** | Photo of a vaccination booklet, prescription, lab result or vet report | Organized record; lab table with out-of-range values flagged; PDF for vet or insurer; emergency QR | **Yes, before saving**: "Review what it found and check the details before saving"; "Check scanned details against the original document" | Vaccination and dose reminders only | Free plan: one pet, one single-file scan per month. Premium $3.99 and $34.99; 14-day trial | Label: usage data used to track; health, contact, photos linked. "Does not diagnose or replace your vet" | Not enough ratings. v1.0 "Jul 12", v1.0.2 about Nov 9 | `[E]` |
| **Petto** ("Smart Uploads") | Uploaded vet records | Extracts vaccinations, bloodwork, medications, allergies, diagnoses; plain-language lab explanations | **Partly**: "review and edit any extracted information"; the demo flags an uncertain item ("Petto wasn't sure, check this one") and asks whether to save, with "Not now" | Next-due flags; no owner-log trend described | 14-day trial; plan prices not on the page | Encrypted in transit and at rest; delete any time | No store listing found this session. Vendor claims "over 95% accuracy on standard vet records", unverified | `[E]` |
| **PetCare AI: Symptom Checker** | PDF or photo of a vet report, blood test or lab result | Plain-language explanation tailored to the pet profile; follow-up questions; saved to the record | Not applicable (explanation, not extraction) | No | Free tier includes one report explained per day `[E†]`; Plus $4.99 and $49.99; Pro $9.99 and $99.99 | Label: identifiers and usage data used to track; third-party advertising listed as a purpose | Not enough ratings. v1.1.2 updated the day of fetch | `[E]` |
| **PetSage AI** | Photo of a vet invoice | Logs visit, clinic, medications (with reminders), cost; 30-day "Vet-Ready Summary" (Pro) | Unclear: copy says "we automatically log"; the sample screen shows a "Save to Diary" button; checks for duplicates | Medication reminders | Free with 1 invoice scan; Pro A$3.99/mo or A$29.99/yr | "Your data stays yours"; "Powered by Claude AI" | Not checked | `[E]` |
| **Fi Intelligence** | Uploaded vet records, lab results, vaccine certificates, prescriptions, invoices | Q&A over documents plus collar data ("what happened at my last vet appointment?") | Extraction to structured facts not described | Collar-derived behaviour alerts; documents are answer context | Fi membership; uploads need a Full-Access member | Says it does not diagnose. Dog profiles only, US only, one pet per conversation | Launched 2026-03-17. No newer update found | `[E†]` |
| **CompanAIn** | Uploaded vet records, lab results, daily observations; vets can upload through a portal | "Living" health timeline; AI recommendations; a "Longitudinal Pattern & Response Agent" over the timeline | **No confirm step described**: "CompanAIn will analyze everything in real time for you". Delete is first-class: remove an uploaded document "and every insight, lab result and entry that came from it" | **Yes, AI-flagged**, over an uploaded-record timeline | Guardian $9.99 / $99.99; Pathfinder $27.99 / $279.00; Apex $54.99 / $549.99 | Label: identifiers used to track; purposes include developer advertising and marketing | 25 ratings (4.4). v1.0.9 "Oct 29": clinic invite link or QR to share pets with a clinic | `[E]` listing; `[E†]` the agent |
| **MyPetID** | Uploaded vaccination records, prescriptions, vet documents | AI "reads each file automatically, extracting medications, dosages, dates, and diagnoses"; reminders; shareable digital ID | Not stated | Reminders | Listed as free | Not verified | Directory listing claims 10,000+ users, unverified | `[E†]` |
| **Pawly** (Android) | Records, prescriptions | AI reads them and "offers to add them to the medical record" | Appears to be an offer the owner accepts | Not verified | Not verified | Not verified | Play page returned no body | `[E†]` |
| **PerkyPet AI** | Logs; "Pet Record Storage" | "Vet-Ready Summaries" from logs and trends | Not described | Not described | No price; "3 years free access, 200 spots only" | Not verified | Site shows store badges; badge destinations not verified | `[E]` |
| **Every Wag** (consumer app) | Uploaded records, lab results, prescriptions | Organizer; AI "Product Advisor" for food safety and toxicity | No AI over records found | No | Not verified | Not verified | Its clinic product, Care Connect, is in §3 | `[E†]` |
| **11pets** | Manual forms; photo attachments | Record keeper; no AI extraction found | Not applicable | No | In-app purchases $1.99 and $17.99 `[E†]` | Not verified | iOS update dated Sep 12, 2026 on one tracker; rating counts conflict across trackers (77 vs 147 on iOS) | `[E†]` |
| **PetRecord.ai · VetLens** | Not verified | Not verified | Not verified | Not verified | Not verified | Not verified | See "What could not be verified" | n/a |

### 2.2 Notes on the cohort

- **Three confirmation patterns exist in the wild.** (1) Review before saving (Kovan; Petto in part). (2) Save everything, correct or undo after (VetGPT's receipt; Pawtio's "correct anything"). (3) Silent ingestion with a strong delete (CompanAIn). No listing describes a one-fact-at-a-time confirmation. `[E]`
- **Pawtio's per-field confidence is the only uncertainty display found.** Petto's "wasn't sure, check this one" is the only per-item uncertainty flag. `[E]`
- **The delete cascade is advertised by one product.** CompanAIn's release notes name it: delete a document and everything derived from it goes too. `[E]`
- **Recording consent is uneven.** Pawtient says "with the vet's permission". VetGPT added a reminder to inform parties. Pawtio's listing has no consent language and records with the phone locked. `[E]`
- **Paid tiers gate the AI nearly everywhere.** Free allowances are small: one scan a month (Kovan), one invoice scan (PetSage), one report a day (PetCare AI). Pawtio is the exception at free. `[E]`
- **Privacy labels are weak in this cohort.** PetCare AI and CompanAIn list advertising or marketing purposes. Kovan and CompanAIn declare tracking. VetGPT links precise location and audio to identity. `[E]`
- **Scale is tiny outside Fi and CompanAIn.** The largest rating count among the small apps is 30 (VetGPT). Pawtient still has one rating, as it did in September. `[E]`
- **"Explains, does not diagnose" is the universal disclaimer.** Kovan, Fi, Pawtio and PetCare AI all carry a version of it. `[E]` / `[E†]`
- **No listing says what the summary leaves out.** None states coverage, a "could not read this page" state, or what a summary's silence means. `[A]` from the listings read.

---

## 3. Clinic-side scribes and what the client receives

This matters because the clinic's summary is a likely input to an owner-side feature.

### 3.1 Adoption moved fast

- The 2026 Digitail and AAHA benchmark (n = 1,730, US and Canada, fielded July 27 to August 12, 2026): **83.7%** of respondents use AI, up from 39.2% in 2024. 88.3% of users engage daily or weekly. Clinical documentation, including scribes and SOAP notes, is the top use at **62.8% of AI users**. Client communication is second; no percentage was published. `[E]`
- Top concerns: reliability and accuracy 67.4%; data security and privacy 59%. Nearly half of practices have no AI strategy or owner. Close to one third lack governance basics such as usage guidelines or formal tool review. `[E]`
- IDEXX announced the acquisition of CoVet, an ambient-listening scribe, on September 16, 2026. The release says the tool supports client follow-up. `[E†]`

### 3.2 What leaves the clinic, by vendor

| Vendor | Client-facing artifact | Format and channel | Who checks it | Tag |
|---|---|---|---|---|
| **CoVet** (now IDEXX) | "Visit Summaries": Summary, Problem List, Treatment Plan and Care Instructions, **Symptoms to Watch For**, Follow-up Steps. Optional appendices: case photos, PDFs, lab documents, client handouts, dental charts. One document can cover several pets | **Branded PDF**, emailed from CoVet, or downloaded and printed. English, French or Spanish regardless of consult language | The help article tells staff to "Review the content for accuracy" and preview before sending. No formal approval gate | `[E]` |
| **ScribbleVet** (Instinct) | A client email in plain language; a discharge summary; a **"Care Card"**, a one-page infographic of take-home instructions | Email sent from ScribbleVet; Care Card shared or printed alongside it. English, Spanish, French | Editable before sharing; no formal review step described | `[E]` Care Cards; `[E†]` email |
| **VetRec** | Discharge instructions generated with the medical record; client recaps | **Email sent from VetRec** since January 13, 2026. Logging into the practice system was "coming next"; not confirmed shipped | Not stated | `[E†]` |
| **Otto** | Client recap from the scribe | **Text, email or both**, per the client's notification preference, from inside Otto Flow (announced March 13, 2026). Standalone Scribe users copy or download | **Not sent automatically**: staff review and edit first | `[E†]` |
| **PetDesk Scribe** | "User-friendly patient summaries after every visit" | Staff **copy and paste** the summary to share it. No direct send described | Vet reviews and finalizes notes | `[E]` |
| **Digitail (Tails AI)** | AI-drafted discharge notes | In the **Pet Parent app**, visible once the record is closed; the clinic controls what is shared | Not stated whether the text is labelled as AI-generated | `[E†]` |
| **Every Wag Care Connect** | An interactive "Care Guide" covering discharge instructions; timed tasks and medication reminders per reviews | **Every Wag app or email** (announced June 11, 2026) | Not stated; whether AI writes the guide is not stated | `[E]` release; `[E†]` reviews |
| **Vetspire** | "AI Summary for Uploaded Documents" and an AI patient summary, both clinician-facing | Inside the practice system | n/a | `[E†]` titles only |
| **ezyVet** | "AI-Assisted Notes (in beta)" per a vendor comparison guide; no client-facing AI summary found | n/a | n/a | `[E†]` |
| Scribenote · Talkatoo · HappyDoc · Covetrus Pulse · Provet | Carried from the September brief; **not re-verified today** | See `2026-09-vet-visit-companion-evidence.md` §1.3 | n/a | not verified |

### 3.3 What this means for an input document

- **Five delivery shapes.** Emailed PDF (CoVet). Email body text (ScribbleVet, VetRec, Otto). Text message (Otto). Clinic app screen (Digitail, Every Wag). Pasted paragraph of unknown final form (PetDesk). `[E]` / `[E†]`
- **So an owner will hold a PDF attachment, a screenshot, or a photo of a printout.** `[A]` This matches the domain finding in `docs/nyx-vet-files-requirements.md` §2: assume image and PDF, never a structured feed.
- **The clinic summary is already a model's compression of the visit.** A second model reading it compounds omission. `[A]` Our own October round-trip test found that qualifiers survive a summarizer only when they sit on the same line as the fact (`2026-10-vet-report-round-trip.md`).
- **Review before sending is the vendor norm but it is light.** Vendors describe "review for accuracy" as a step, not a gate. CoVet's own pilot reports the share of appointments receiving a discharge summary rose from 26% to 45%. Volume is rising faster than review time. `[E]` figures (vendor-reported); `[A]` the reading.
- **Some artifacts carry sections that map to proposed facts.** CoVet's "Symptoms to Watch For" and "Follow-up Steps" are the same shape as "call me if" and a recheck date. `[E]` / `[A]`
- **None of the client artifacts found says it was AI-drafted.** `[A]` from the pages read; not verified on a real artifact.

### 3.4 Professional positions

- **AVMA.** No adopted policy on AI was found. An AVMA News piece says the pace of AI development is outstripping clear professional guidance. `[E†]` The 2026 House of Delegates search returned only AMA (human medicine) results. Not verified against AVMA's policy database.
- **AAVSB (March 2025)** lists client communication among administrative uses of AI and asks licensees to understand its limits. `[E†]` Carried detail on transparency and consent is in the September brief §1.3.
- **AAHA** co-publishes the adoption benchmark above. No AAHA guideline on AI-written client summaries was found. `[E†]`
- **AMA (human medicine, June 2026)** adopted policies keeping AI under physician oversight. `[E†]` Included as the nearest professional-body signal, not as veterinary policy.

---

## 4. Human-health analogues and evidence

### 4.1 Products

| Product | What it does with records or visits | Confirmation and safeguards | Tag |
|---|---|---|---|
| **ChatGPT Health** (OpenAI, January 7, 2026) | A separate health space. Connects medical records through b.well (lab results, visit summaries, clinical history; US providers at launch) and Apple Health | User-initiated connection; revocable in Settings; one guide says disconnecting deletes records from the partner. Commentary notes records moved there lose HIPAA protection | `[E†]` |
| **Claude** (Anthropic, January 11, 2026) | US Pro and Max subscribers can link records through HealthEx; Apple Health and Android Health Connect in beta | Reported: requests only the record categories a question needs; health data excluded from memory and not used for training; not a substitute for professional advice. **Secondary coverage only; Anthropic's own page was not read** | `[E†]` |
| **Google Health / Fitbit coach** (records linking announced March 2026) | Links medical records (labs, medications, visit history); an earlier Labs feature turned lab reports into plainer overviews | The coach uses medical history **only on explicit opt-in**; records not used for ads; says it cannot diagnose, treat or monitor | `[E†]` |
| **Apple Health** (iOS 27, September 2026) | Apple Intelligence "Insights" summaries of wearable data; users can add or sync lab results; an **expert video** explains LDL on annual results | The lab explanation is authored content, not a model's reading of the user's document. The larger "Health+" service was reported scaled back | `[E†]` |
| **Epic MyChart "Emmie"** | A conversational assistant that answers questions from the patient's chart: visit notes, results, prior messages | Only reads what the patient can already see in MyChart. Sutter Health was first live; Community Health Network followed | `[E†]` |
| **Abridge** | Clinician-side: generates a patient visit summary at an 8th-grade reading level (diagnoses, medications, next steps) beside the note | Clinician reviews; the clinician copies the summary into the record to share it. Partnered with OpenNotes (November 2024) to study the summaries with patient focus groups | `[E†]` |
| **Medcorder** | Free patient-side recorder with transcript and family sharing | Listing is live with a 2026 copyright; a tracker dates the last store update October 31, 2025 | `[E†]` |
| **Function Health** | Not found in the searches run | n/a | not verified |

Pattern: the large human-health products **answer questions over records**. None found proposes discrete facts for the user to confirm into a structured record. Their records arrive already structured from the provider network. `[A]` from the coverage read.

### 4.2 Evidence on AI-written patient summaries

- **Zaretsky et al., JAMA Network Open 2024 (NYU Langone).** 50 inpatient discharge summaries rewritten by a large language model, each reviewed by two physicians (100 reviews). Flesch-Kincaid grade fell from 11.0 to 6.2. Understandability (PEMAT) rose from 13% to 81%. **54 of 100 reviews gave the top accuracy rating. 56 of 100 rated the summary entirely complete. 18 flagged a safety concern.** `[E†]`
- A journal commentary on the same study breaks down the 46 less accurate cases: **24 (52%) due to omissions, 4 (9%) due to hallucinations.** Examples of invented content included a nonexistent infection and chest pain. The team spent six weeks on the prompt. The commentary's conclusion: such tools "may not be ready for widespread unsupervised use". `[E]` (commentary on the JAMA Network Open site). The commentary counts summaries where the paper counts reviews; treat the unit as reviews. `[A]`
- **UCSF, JAMA Internal Medicine 2025.** 100 physician-written and 100 model-written discharge narratives, blinded review. No difference in overall quality or preference. Model narratives had more errors, mostly omissions and inaccuracies, with low overall potential for harm. Physician narratives were as likely to contain hallucination-type errors. `[E†]` Our own October brief records the per-narrative error counts from this study (`2026-10-vet-report-ai-written-report.md`).
- **Emergency discharge summaries, GPT-4 vs GPT-3.5-turbo (100 encounters).** Only 33% of GPT-4 summaries and 10% of GPT-3.5-turbo summaries were entirely error-free across all domains. Both hallucinated and omitted clinically relevant information. `[E†]`
- **Eisinger et al., JMIR 2025.** GPT-4 patient letters from three synthetic discharge letters covered 56 of 72 learning objectives (78%). 11 of 72 (15%) were missing from most letters. Medical errors appeared in 31 of 787 sentences (3.9%). `[E†]`
- **Holderried et al., JMIR 2026.** A prospective crossover trial with standardized patients. The patient-friendly letter improved comprehension (odds ratio 1.74, 95% CI 1.45 to 2.08). **24.3% of key information (261 of 1,073 items) still went unrecognized.** `[E†]` The page did not load; design details not verified.
- **No randomized trial of real patients using an AI-written summary with harm outcomes was found.** `[E†]` (search result statement); `[A]` that none exists.

### 4.3 Evidence on patients reading clinical text at all (OpenNotes)

- **Walker et al., JMIR 2019 ("OpenNotes After 7 Years").** 136,815 invited, 29,656 responded (21.68%), 22,947 had read at least one note. **3.3% were very confused (737 of 22,304). 4.8% were more worried (1,078 of 22,303).** 98% thought note access was a good idea. Benefits were reported most by less educated, older, nonwhite and Hispanic patients and those not speaking English at home. `[E†]`
- Clinicians over-predict confusion: 44% of oncology clinicians expected patients to be confused; 4% of patients reported it. `[E†]`
- Caveats in the same literature: responders are self-selected, and commentators (Blease) warn that some groups and scenarios carry more distress. `[E†]` No specific harm study was retrieved this session. Not verified.

### 4.4 Regulatory positions

- **FDA, January 6, 2026.** Revised final guidances on Clinical Decision Support and General Wellness replaced the 2022 and 2019 versions. The decision-support carve-out covers software that supports recommendations to health care professionals. Law-firm commentary says neither document expressly changes FDA's approach to AI. `[E†]`
- A consumer-facing summary of a clinical document is not addressed by name in either. `[A]` Patient-directed software falls outside the professional carve-out by its own terms. `[A]` inferred, not stated in the sources.
- **Veterinary.** FDA device premarket rules are understood not to apply to veterinary software. This was not re-verified this session. `[A]`
- **FTC.** Results show a September 2025 inquiry into companion chatbots and commentary that AI-generated statements are treated as the company's own representations. No 2026 action on health-document summaries was found. `[E†]` Not verified against FTC press releases.

---

## 5. Patterns

### 5.1 What everyone does

- **Photo or PDF in.** Every owner-side reader takes a photo; several take PDF. Nobody assumes a structured feed. `[E]`
- **Plain-language out.** "Explain" is the most common verb. `[E]`
- **A disclaimer.** "Does not diagnose", "not medical advice", "discuss with your vet". `[E]`
- **A paywall on the AI.** With small free allowances. `[E]`
- **A human check somewhere.** The clinic cohort and the human-health evidence put a professional in the loop. The owner cohort puts the owner in the loop, loosely. `[E]`
- **Reminders as the payoff.** Extracted medications and due dates become reminders (VetGPT, PetSage, Kovan, MyPetID). `[E]` / `[E†]`
- **Question-answering over the corpus.** Fi, CompanAIn, Pawtient, VetGPT, Pawtio, and the general assistants on the human side. `[E]` / `[E†]`

### 5.2 What a few do

- **Review before saving** (Kovan; Petto in part). `[E]`
- **Show uncertainty** (Pawtio per field; Petto per item). `[E]`
- **Undo with a receipt** (VetGPT). `[E]`
- **Delete a document and everything derived from it** (CompanAIn). `[E]`
- **Keep the original beside the extraction** (Kovan: "the original scans alongside your pet's history"). `[E]`
- **On-device transcription with a stated no-train server tier** (Pawtio). `[E]`
- **Opt-in before a coach may use medical history** (Google). `[E†]`
- **Request only the record categories a question needs** (Claude, as reported). `[E†]`
- **Plot extracted lab values as a trend** (Pawtient). `[E]`

### 5.3 What nobody does (among the products checked, at listing strength)

- **Owner-confirmed facts feeding a longitudinal trend engine built on the owner's own daily log.** The specific question for this lane. **None found.** `[E]` for each listing read; `[A]` for the universal.
  - Pawtient is nearest on "extracted value becomes a trend", but only for lab values, with no stated confirmation, and no symptom or meal log beside it.
  - CompanAIn is nearest on "longitudinal agent", but over uploaded records and observations, with no confirm step described.
  - Kovan is nearest on "confirm before saving", with no trend engine.
  - On the human side, the trend surfaces (Apple Health) take structured records from providers or manual entry, not confirmed extractions from a photographed document.
- **One-by-one confirmation.** Every confirm pattern found is whole-document review or bulk save. `[E]`
- **A source pointer per fact.** No listing describes tapping a fact to see the line of the document it came from. Kovan's "check against the original" is the owner's job, unaided. `[A]` from listings.
- **A stated separation between narrative and facts.** Nobody says "the summary is for reading; only what you confirm is used". `[A]`
- **A statement of what was not read.** No coverage line, no "page 2 was unreadable", no "this summary does not mean nothing else was said". `[A]`
- **Summarizing one visit as a bounded object** that joins typed notes, pre-visit questions and filed documents. Recorders summarize audio. Readers read one document. Fi answers across everything. Nobody found scopes the read to one visit's own bundle. `[A]`
- **Answering the owner's own pre-visit questions from the visit.** Pawtio builds a prep brief for the *next* visit. None found closes the question the owner wrote *before* this one. `[A]`
- **Reading the clinic's AI recap as a named input.** No owner app mentions it. `[A]`
- **Free at the point of care.** Only Pawtio lists no purchases. `[E]`

---

## 6. What to borrow, what to avoid

Inference from the evidence above. `[A]` throughout. Nothing here is a ruling.

### 6.1 Borrow

1. **Review before save, in the product's own words.** Kovan's line is the clearest in the cohort: review what it found, check against the original. The proposal's one-by-one confirm is a stricter form of a pattern owners are already being taught.
2. **Uncertainty shown per item.** Pawtio's per-field confidence and Petto's "wasn't sure, check this one" are the only two examples. Both point at the item, not at the document.
3. **The original stays primary.** Kovan keeps the scan beside the record. This matches the Apple Health lesson already recorded in the Vet Files spec §2.
4. **A delete that takes the derivatives with it.** CompanAIn advertises it in release notes. It is the cleanest answer found to "what if the read was wrong".
5. **An undo with a receipt.** VetGPT's shape for a write the owner did not type.
6. **The clinic recap's section names as the fact vocabulary.** CoVet's "Symptoms to Watch For" and "Follow-up Steps" are what a clinic already hands over. Owners will recognise them.
7. **Explicit opt-in before a model may read the medical corpus, and category-scoped reads.** Google's opt-in and Claude's reported per-category request are the two consumer precedents.
8. **Physician-review language from the human studies, translated.** The published conclusion is that review is required before patient use. On the owner side the reviewer is the owner, and the confirm step is where that review can happen.
9. **Grade-level targets.** Zaretsky's 6.2 and Abridge's 8th-grade target are the two published readability marks.

### 6.2 Avoid

1. **Silent ingestion.** CompanAIn's "will analyze everything in real time" is the pattern the Vet Files spec §10 already records a dissent against.
2. **"One tap to save everything."** It is a bulk write of model output. The published error pattern says some of it is wrong or missing.
3. **An accuracy number in marketing.** Petto's "over 95%" is unverified and, on the published evidence, about one in two summaries carries some inaccuracy or gap at review.
4. **Treating the summary as complete.** Omission is the leading error in every study read. A summary's silence about something is not evidence it was not said. This is the same shape as the n=1 rule.
5. **Compounding compression without saying so.** A clinic recap is already a model's summary. A summary of it inherits its omissions.
6. **Advertising and tracking on a health-document feature.** PetCare AI and CompanAIn declare both. It is the weakest trust posture in the cohort.
7. **Recording without consent language.** Pawtio's listing has none. This lane does not cover recording, but the contrast with Pawtient and VetGPT is visible in the store.
8. **Gating the read of a care document behind payment.** It is the category norm. It conflicts with Pets > $ if the confirmed facts feed health alerts.
9. **Explaining a result as reassurance.** The "explain" products describe values as normal or flagged. A model saying "normal" about one document is a single-sample all-clear.

---

## 7. Positioning implications (short)

`[A]` throughout.

- **"AI reads your vet records" is not a claim to lead with.** At least eleven products say it.
- **"Records your vet visit" is no longer rare.** Three owner apps say it.
- **Unclaimed, on today's evidence:** "nothing enters your pet's record until you say so"; "every fact shows where it came from"; "your vet's instructions next to your own daily log"; "the questions you wrote before the visit, answered after it".
- **"Bring the clinic's summary in"** is supported by §3: more clinics send one each quarter, and no owner app names it as an input.
- **Retire or narrow** any line implying owner apps only store documents. That was true of the keeper class. It is not true of the 2026 entrants.
- **Expect the comparison to be a general assistant.** An owner can already paste a discharge sheet into ChatGPT or Claude. What those cannot do is put a confirmed fact on the pet's own timeline beside the owner's log.
- **Re-verify before any public use.** This cohort changed between September and November.

---

## 8. Changes since our earlier briefs

The older briefs are frozen and are not edited here. These are the points where today's evidence differs.

**Against `2026-09-vet-visit-companion-evidence.md` §1 (2026-09-09):**

| Earlier claim | Today | Tag |
|---|---|---|
| "Exactly one shipped owner-side incumbent" that records a visit with an AI summary (Pawtient AI) | **No longer true.** VetGPT (30 ratings) and Pawtio (first version September 11, two days after that brief) also record and summarize | `[E]` |
| Pawtient AI: $5.99/mo, $59.99/yr; one rating | Still one rating. The listing now also shows Premium at $14.99/mo and $109.99/yr and a Family tier. Latest version 1.2.0 ("Jun 29") | `[E]` |
| CompanAIn priced $11.99 to $54.99/mo | Listing now shows $9.99, $27.99 and $54.99 tiers, with annual prices. Release notes mention "updated subscription plans". 25 ratings. Clinic invite link added | `[E]` |
| PerkyPet store links 404 | The site now shows App Store and Google Play badges. Destinations not verified. Launch still not confirmed | `[E]` |
| Adoption: 39.2% of veterinary professionals use AI (2024 survey) | **83.7%** in the 2026 Digitail and AAHA study; documentation 62.8% of AI users | `[E]` |
| CoVet listed among independent scribes | IDEXX announced its acquisition on September 16, 2026. (The October machine-readers brief already writes "CoVet/IDEXX") | `[E†]` |
| ScribbleVet summary email "user-reported" | Vendor pages now describe a client email sent from the product, plus Care Card infographics | `[E]` / `[E†]` |
| VetRec client output: discharge instructions | Now also emailed directly from VetRec (since January 13, 2026) | `[E†]` |
| Otto not listed | Client recaps by text or email since March 13, 2026, after staff review | `[E†]` |
| PetDesk Scribe summaries are copy-pasted by the vet | **Unchanged.** Still copy and paste | `[E]` |
| "Abridge's patient app is gone" | Still true of the consumer recorder. But Abridge keeps generating a patient visit summary on the clinician side and studies it with OpenNotes. The patient-facing artifact did not die; the patient-held app did | `[E†]` |
| Medcorder last update 2025-08-25 | A tracker reports the store listing last updated October 31, 2025. The two dates conflict. Not resolved | `[E†]` |
| "Nothing verified generates suggested questions from the record" | Not re-tested in depth. Pawtio advertises a prep brief before the next appointment; its content was not seen | `[E]` listing; not verified |

**Against `docs/nyx-vet-files-requirements.md` §2 (2026-07-26):**

| Earlier claim | Today | Tag |
|---|---|---|
| "AI record-reader cohort (PetRecord.ai, VetLens ~12k users, MyPetID)" | **VetLens could not be found at all.** PetRecord.ai shows only a title. MyPetID is found only on a directory listing (claims 10,000+ users, free). The cohort is real and larger, but its named members today are different: Kovan, Petto, Pawtio, VetGPT, PetCare AI, PetSage, Pawly | `[E]` / `[E†]` |
| The cohort "has no longitudinal owner-logged data to correlate against" | Mostly holds. Narrowed: Pawtient plots scanned lab values as trends; CompanAIn runs a longitudinal agent over uploads and observations | `[E]` / `[E†]` |
| "Explain-the-jargon is the proven first AI job (VetLens's whole business)" | The VetLens anchor is unverifiable. The claim itself is supported by others: PetCare AI's Report Explainer, Petto's lab interpretation, Fitbit's lab summaries, Apple's LDL explainer | `[E]` / `[E†]` |
| 11pets as the cautionary tale | No AI extraction found in 2026. One tracker shows an iOS update on September 12, 2026. Rating counts conflict across trackers | `[E†]` |

**Against `docs/nyx-competitive-landscape-refresh-2026-06.md`:**

- CompanAIn "live Feb 2026; vet portal 2026-06-23": both dates hold. Add the October clinic-invite release and the price change. `[E]`
- PerkyPet "pre-launch": still not confirmed live. `[E]`
- Fi Intelligence: no change found since launch. Still dog-only and US-only. `[E†]`
- "ChatGPT Health's longitudinal-companion pattern": now joined by Claude (January 2026), Google (March 2026) and Apple (September 2026). `[E†]`

---

## 9. Sources

All accessed 2026-11-14. "Fetched" means the page body was read. "Excerpt" means only the search-index excerpt was read.

**Owner-side cohort**
- https://apps.apple.com/us/app/pawtient-ai/id6756168872 (fetched)
- https://apps.apple.com/app/id6757766151 (VetGPT; fetched)
- https://apps.apple.com/us/app/id6791683099 (Pawtio; fetched) · https://chrome-stats.com/d/id6791683099 (403; excerpt)
- https://apps.apple.com/app/id6762416438 (Kovan; fetched)
- https://petto-health-c6n.pages.dev/features/smart-uploads (Petto; fetched)
- https://apps.apple.com/app/id6775739913 (PetCare AI; fetched)
- https://petsage.app (fetched)
- https://apps.apple.com/app/id6747678727 (CompanAIn; fetched)
- https://www.businesswire.com/news/home/20260217416274/en (CompanAIn GA; excerpt) · https://secure.businesswire.com/news/home/20260623641399/en/CompanAIn-Launches-New-Veterinary-Portal-Advancing-Its-Vision-for-Connected-Pet-Health (excerpt)
- https://www.businesswire.com/news/home/20260317091481/en/Fi-Launches-Fi-Intelligence-the-First-of-Its-Kind-AI-Health-Companion-for-Dogs (excerpt) · https://support.fitracking.com/hc/en-us/articles/49109803082387-Fi-Intelligence (403; excerpt)
- https://www.goodfirms.co/company/mypetid-ai (403; excerpt)
- https://play.google.com/store/apps/details?id=com.pawly (no body; excerpt)
- https://perkypetai.com (fetched)
- https://apps.apple.com/us/app/vetcation/id6470849243 (fetched; storage only, not tabled)
- https://apps.apple.com/us/app/id6747091313 (Every Wag; excerpt)
- https://apps.apple.com/us/app/id1232470530 · https://apps.appfollow.io/ios/11pets-pet-care/1232470530?country=us · https://appgoblin.info/apps/1232470530 · https://lagerland-apps.github.io/alternatives/11pets/ (11pets; excerpts; the last is a competitor's page)
- https://petrecord.ai (fetched; title only)
- https://www.pymnts.com/?p=4139678 (Petwealth, 2026-09-01; fetched; at-home diagnostics, not tabled)

**Clinic-side**
- https://www.dvm360.com/view/artificial-intelligence-use-among-veterinary-professionals-more-than-doubles-in-2-years (2026-10-06; fetched)
- https://help.co.vet/en/articles/14122487-generating-client-visit-and-discharge-summaries (2026-05-29; fetched) · https://co.vet/campaigns/visit-summaries/ (fetched)
- https://intercom.help/scribblevet-help-center/en/articles/14794642-care-cards (fetched) · https://scribblevet.com/ · https://scribblevet.com/whats-new (excerpts)
- https://blog.vetrec.io/updates · https://vetrec.io/solutions (excerpts) · https://vetrec.io/post/introducing-communication-documents (fetched; index only)
- https://otto.vet/veterinary-ai-scribe-client-recaps/ · https://otto.vet/otto-expands-ai-scribe-with-integrated-client-recaps-no-copy-and-paste-required/ (truncated; excerpts) · https://help.otto.vet/hc/en-us/articles/40279356069773 (404; excerpt)
- https://info.petdesk.com/scribe-v2 (fetched)
- https://help.digitail.io/en/articles/12601847-how-to-use-the-digitail-pet-parent-app-to-manage-your-pet-s-care · https://help.digitail.io/en/articles/8658432-tails-ai-assistant (excerpts)
- https://www.pr.com/press-release/970739 (Every Wag Care Connect, 2026-06-11; fetched)
- https://manual.vetspire.com/vetspire-user-manual/ok/Commercial/ai-summary-for-uploaded-documents · https://manual.vetspire.com/vetspire-user-manual/ok/Commercial/about-ai-patient-summary (titles only)
- https://www.businesswire.com/news/home/20260916581543/en/IDEXX-Laboratories-Acquires-CoVetAI-to-Advance-Veterinary-Workflow-Intelligence (403; excerpt)
- https://software.idexx.com/top-veterinary-software-solutions-a-2026-comparison-guide (excerpt)
- https://www.avma.org/news/building-framework-responsible-ai-veterinary-medicine (no body; excerpt) · https://www.vmb.ca.gov/meetings/materials/20250716-17_item_8.pdf (AAVSB position; excerpt)
- https://www.physicianspractice.com/view/ama-adopts-new-policies-to-keep-ai-under-physician-oversight (2026-06-10; excerpt)

**Human-health**
- https://jamanetwork.com/journals/jamanetworkopen/fullarticle/10.1001/jamanetworkopen.2024.0347 (commentary on Zaretsky; fetched) · https://pmc.ncbi.nlm.nih.gov/articles/PMC10928500 (Zaretsky et al.; excerpt) · https://nyulangone.org/news/artificial-intelligence-model-makes-doctors-notes-more-patient-friendly (excerpt)
- https://www.hcinnovationgroup.com/analytics-ai/article/55288186/researchers-llm-produced-discharge-summaries-comparable-to-md-produced-ones (UCSF study; excerpt)
- https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11023681/ (ED discharge summaries; excerpt)
- https://www.jmir.org/2025/1/e67143 (Eisinger et al.; excerpt)
- https://www.jmir.org/2026/1/e81243 (Holderried et al.; no body; excerpt)
- https://pmc.ncbi.nlm.nih.gov/articles/PMC6526690 (Walker et al. 2019; excerpt) · https://www.mdlinx.com/article/the-tricky-dilemma-with-open-notes/3uENHFoFhtMAFNnsLkV2yw (excerpt)
- https://openai.com/index/introducing-chatgpt-health/ · https://www.mobihealthnews.com/news/openai-launches-chatgpt-health-partners-bwell · https://medcitynews.com/2026/01/openai-chatgpt-healthcare-privacy-data/ (excerpts)
- https://www.mobihealthnews.com/news/jpm-anthropic-launches-claude-healthcare · https://thehackernews.com/2026/01/anthropic-launches-claude-ai-for.html (excerpts; secondary)
- https://blog.google/products-and-platforms/devices/fitbit/fitbit-personal-health-coach-updates-2026/ · https://hlth.com/insights/news/google-expands-ai-healthcare-tools-and-integrates-medical-records-into-fitbit-with-cms-clear-and-athenahealth-2026-03-19 (excerpts)
- https://apple.com/newsroom/2026/09/apple-advances-health-and-fitness-capabilities-using-apple-intelligence/ · https://macrumors.com/guide/ios-27-health-app-new-features (excerpts)
- https://www.epic.com/epic/post/community-health-network-adopts-emmie-an-ai-assistant-in-mychart-to-enhance-patient-experience/ · https://www.fiercehealthcare.com/ai-and-machine-learning/himss26-epic-expands-ai-roadmap-previews-factory-build-and-orchestrate-ai (excerpts)
- https://abridge.com/blog/patient-visit-summaries--now-generated-in-real-time · https://www.abridge.com/press-release/opennotes-announcement · https://www.abridge.com/patients (excerpts)
- https://apps.apple.com/us/app/medcorder-understand-your-doc/id1392651594 · https://appgoblin.info/apps/1392651594 (excerpts)

**Regulatory**
- https://www.kslaw.com/insights/articles/fda-updates-general-wellness-and-clinical-decision-support-guidance-documents · https://www.arnoldporter.com/en/perspectives/advisories/2026/01/fda-cuts-red-tape-on-clinical-decision-support-software · https://www.thefdalawblog.com/?p=15814 (excerpts; the FDA documents themselves were not read)
- https://www.agg.com/news-insights/publications/ai-chatbot-compliance-key-legal-risks-and-regulatory-considerations-for-businesses-in-2026/ · https://www.dlapiper.com/en-ca/insights/publications/2025/09/ftc-ai-chatbots (excerpts)

**In-repo (read, not re-derived)**
- `docs/research/README.md` · `docs/research/2026-09-vet-visit-companion-evidence.md` §1 · `docs/nyx-vet-files-requirements.md` §2 · `docs/nyx-competitive-landscape-refresh-2026-06.md` · `docs/research/2026-10-vet-report-ai-written-report.md` and `2026-10-vet-report-round-trip.md` (index summaries only)

**Research debt**
- Install Pawtient, VetGPT, Pawtio, Kovan and Petto and photograph one synthetic discharge sheet in each. Every confirm-step claim above is listing-grade.
- Read Zaretsky et al. in full for the reviewer-level hallucination count and the causes of the 18 safety flags.
- Read the FDA January 2026 guidances and AVMA's policy database directly.
- Obtain one real client recap from each of CoVet, ScribbleVet and Otto to check whether any is labelled as AI-drafted.
- Resolve VetLens and PetRecord.ai: find the source of the July figures or strike the names at next use.
