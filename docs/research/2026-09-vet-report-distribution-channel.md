# The vet report as a distribution channel — how a client-supplied document enters a clinic, what makes a vet recommend a tool, and the September 2026 competitor re-check

**Status:** 🧊 FROZEN research brief — dated evidence, not a decision. | **Date:** 2026-09-09 | **Method:** isolated web sweep, 70 calls (44 `WebSearch`, 26 `WebFetch`), no app installed, no clinic contacted. | **Informs:** the chart-led vet-report redesign (mock round 0), the "report as distribution channel" framing, any future clinic-partner or "for vets" surface.

> **Scope.** Five questions the PM asked before mocks are drawn: (1) how a client-supplied document physically enters a veterinary clinic and who handles it; (2) what makes a veterinarian recommend a consumer tool to clients, and what they distrust; (3) how the 15-minute appointment is actually spent; (4) a re-verification of the June 2026 competitor claims (`docs/vet-report-discovery.md` §4.1–§4.3); (5) what a credible provenance block looks like on documents professionals receive from consumer-side tools. This is a **delta** over `docs/vet-report-discovery.md` §4 (2026-06-21): SOAP-as-lingua-franca, WSAVA diet history, the no-vet-FHIR finding and the PGHD/AVS human-medicine analogs are **not** re-told; where a June claim moved it is in the §4 table.
>
> **Method and grading.** Every claim carries `[EVIDENCE: <source>]` or `[ASSUMPTION]`. Two evidence grades: **fetched** (the page was retrieved and read) and **snippet** (the claim is from a search-engine excerpt of a page that could not be fetched — several PIMS knowledge bases require a JavaScript browser, and four sites returned 403 through the proxy: `vetrecord.app`, `vital-pet.com`, `dvm360.com`, the Wiley DOI for Robinson 2014). Snippet-grade claims are marked `[EVIDENCE: snippet — <source>]`. Reddit is blocked to our crawler, so the vet-tech-forum lane is thinner than asked; it is named in §7. App Store facts are from the US storefront listing text on 2026-09-09 (Vettie: the Trinidad storefront, the only one that returned).
>
> **Not a decision.** This brief contains no product recommendation. §6 states what the evidence *implies* for a chart-led redesign and is explicitly evidence-not-decision; the decision briefs belong to the mock round.

---

## 1. How a client-supplied document enters a veterinary clinic

### 1.1 The ingest path is "a file attached to a patient" in every PIMS checked

The receiving mechanism is the same shape across the six practice-management systems whose documentation could be read: a human opens the patient, uploads or drags a file, and the file lands as an **attachment on the patient record** (sometimes on a specific visit or medical-note line), where it is later viewed, printed or emailed with the chart.

| PIMS | How a client document gets in | Constraints the vendor states | Grade |
|---|---|---|---|
| **ezyVet** (IDEXX) | "select Patients, find and select the applicable patient record, select Attachment, and drag the applicable document or file into the Add Attachment(s) box. ezyVet adds the document or file to the patient record as a file attachment." | "Examples of documents or files that you can add include PDF documents and images." Max **200 MB** per attachment. A separate procedure exists to "Include a clinical summary from a different veterinary practice in a complete history" (page title; content not retrievable). | snippet — docs.ezyvet.com |
| **Vetspire** | Patient Chart → Chart → **Upload**; choose file(s); optional **Rename** field; pick a **Category** from a dropdown; up to **10 files** per submit. Saved files live under Chart → **Uploads** and can be re-opened with **Rename & Categorize**. | Max **50 MB**; "Videos cannot be uploaded"; the search excerpt states "Only .pdf and .jpeg files are supported." Example categories: **"rDVM Records, Prescriptions, or Pictures."** Example documents: "medical records from other clinics, pictures of healing incisions, or completed consent forms." A separate **rDVM Mass Upload** page exists for referral records. | fetched — manual.vetspire.com |
| **AVImark** (Covetrus) | A practice write-up: "scan the document from the paper chart to our shared network folder. We then open AVImark and find the appropriate patient, and the code that we would like to attach it too, and then go into the shared folder find the file and attach it." Attachments hang off a **medical-history code**, not off the patient in the abstract. | The same write-up documents the failure mode: staff "open an email, download an image or copy it into word, print the image, then scan that printed image and attach it as a PDF, instead of simply attaching the jpeg." The vendor guide: attachments give "electronic access to items that might otherwise only be found in the patient's paper chart, like lab work from an outside site or discharge instructions," and AVImark can "print actual file attachments with the chart." | fetched (blog) / snippet (Covetrus PDF) |
| **Cornerstone** (IDEXX) | "Document scanners can be used to add items that cannot be downloaded or attached electronically to the patient's file, such as lab results from universities, emergency or referral reports, and new client registration forms." On a medical-note template there are "two tabs: Invoice Items and **Attachments**, where you can click 'New file' and select an appropriate report from a computer folder." The **Patient File** button lists all attachments. | A medical note "with any included attachments" can be emailed "directly from the Cornerstone Editor." The Email-and-fax help page could not be retrieved (empty body). | snippet — idexx.com Cornerstone EMR guide; cornerstonehelphub.com |
| **Digitail** | A **Files** tab on the patient record takes "any type of document." **Tails Vision** (AI assistant) accepts ".jpeg" images and "PDF files," will "analyze, extract text from images and PDF files" and "write a short summary of what's included." | **The AI does not write to the record:** "Tails Vision extracts and summarizes information for review only. Any data you want saved in the patient record must be manually entered." Stated use cases: when "important information exists only in scanned documents, PDFs, or images," "reviewing external medical records," and extracting "historical information not entered as structured data." | fetched — help.digitail.io |
| **Provet Cloud** | "keeps all forms and files directly linked to the patient"; attachments can be sent from the record by email "with just a few clicks." SmartFlow reports "automatically attach into the Notes & Communication section in one merged file" on discharge. | No client-upload specifics found. | snippet — provet.cloud; smartflowsheet forum |
| **Shepherd** | Forms, notes and client interactions "automatically write back into patient files or can be downloaded as a PDF." | No client-upload specifics found. | snippet — shepherd.vet |

[EVIDENCE: the seven rows above, sources in §8 Q1.]

Three properties of this path are load-bearing for a document that wants to survive it:

1. **It is one file, attached by a person who has to name and categorise it.** Vetspire literally has a `Rename` field and a `Category` dropdown at upload time, and a `Rename & Categorize` action afterwards; the category examples are *rDVM Records / Prescriptions / Pictures* — there is no "client-supplied summary" bucket in the examples given. [EVIDENCE: fetched — manual.vetspire.com] So whatever the file is called on arrival is what a tired front-desk person types, unless the file already carries it. [ASSUMPTION — inference from the field list; no vendor guidance on client-file naming was found in any PIMS documentation.]
2. **It may be printed with the chart, and it may be re-scanned.** AVImark and Cornerstone both print attachments with the chart; the AVImark practice write-up shows staff print-then-scan an emailed image as a matter of course. [EVIDENCE: fetched — AVImark blog; snippet — Covetrus] A document that depends on colour or on screen resolution is degraded twice on this path. [ASSUMPTION — inference.]
3. **It may be read by the clinic's AI before a human reads it.** Digitail's Tails Vision summarises uploaded PDFs on request, for human review; CoVet's marketing describes turning "pre-visit intake responses and uploaded PDFs into structured records that flow directly into EHRs." [EVIDENCE: fetched — help.digitail.io; snippet — co.vet] Whether the PDF carries a text layer, and how legibly its numbers are labelled, now affects what the clinic's own summariser says about it. [ASSUMPTION — Tails Vision states it extracts text from *images* too, so a text layer is an advantage, not a requirement.]

### 1.2 Who reads it first: the technician, then the DVM

The history is increasingly taken by a credentialed technician before the veterinarian enters. VetTechPrep's exam-room guide: "As a veterinary technician, you are one of the first points of contact and play a key role in taking a good history for the doctor." The VetPartners utilization guide describes the technician conducting "the pet's intake, asking all the pertinent questions that the vet needs to start the appointment," with some practices having tech and DVM take the history together so "the client narrates the story once." The 2023 AAHA Technician Utilization Guidelines name "appointments/initial assessments" as the first place to push utilization, and cite an "average revenue increase of 36%" where veterinarians rarely do tasks credentialed technicians can. [EVIDENCE: snippet — blog.vettechprep.com; utilization-guide.vetpartners.org/guide/8-4; aaha.org 2023 guidelines]

Two consequences: the first reader of a handed-over document is most likely a **technician doing intake**, whose job is to compress it into a history the DVM hears in one line; and the DVM's own data-gathering is a small slice of the encounter (Shaw 2004, §3.2). The report is therefore consumed twice, by two roles with different questions. [ASSUMPTION — synthesis; no study observed a client document moving tech → DVM.]

### 1.3 What the front desk is already carrying

Front desk workflow is dominated by record *requests* and paper intake, not by ingesting client documents. Instinct: "Front desk staff frequently receive calls asking for copies of vaccination records, lab reports, or visit summaries, with each request involving searching the record, exporting the document, sending it to the client, and confirming receipt." Digitail: a new client is handed "a clipboard with four pages of forms," after which staff "must decipher handwriting and manually type every detail into the PIMS." Digitail's own answer is an AI intake that asks "relevant questions about the visit reason and patient history," then summarises into "appointment notes and SOAP records." [EVIDENCE: snippet — instinct.vet; digitail.com blog] For records from a previous practice, "most U.S. states and Canadian provinces require the pet owner's permission, so it's best to ask the previous veterinarian to send records before the appointment." [EVIDENCE: snippet — pethub.com] Records are the practice's property and are retained "three to seven years after the last patient visit" in most US states. [EVIDENCE: snippet — otto.vet]

### 1.4 The legal-record rule that decides what happens to it

The clearest published rule on client-supplied documents is human-medicine (AHIMA), and it is the one veterinary practice-management guidance points at by analogy: "Copies of personal health records that are created, owned, and managed by the patient and are provided to a healthcare organization should be considered part of the legal health record, if so defined by the organization and if the information is used to provide patient care services." Organisational policy "should address how personal health information will or will not be incorporated," and clinical information "received from other facilities or from the patient should be evaluated by the clinician, and the organization's policy should define whether the data in its entirety or just the data abstracted and transferred by the clinician is incorporated." [EVIDENCE: snippet — AHIMA, Fundamentals of the Legal Health Record] No AAHA-specific rule on client-supplied documents was found in this sweep (§7).

**What a receiving clinic wants, read off the evidence rather than asked:** a single PDF (the one type every PIMS names), well under 50 MB (the tightest cap found), that identifies the patient and the client on its first page so the uploader can name and categorise it without opening it, that survives a black-and-white print and a re-scan, and whose numbers are labelled plainly enough that a technician's one-line intake summary and a clinic AI's auto-summary both come out right. [ASSUMPTION — a synthesis of §1.1–§1.4; no clinic was asked.]

---

## 2. What makes a veterinarian recommend a consumer tool — and what they distrust

### 2.1 The only measured recommendation channel: verbal + written, in the room

The Austria/Denmark/UK veterinarian survey (n = 641: AT 101, DK 172, UK 368) found 70–78% of vets are "occasionally" confronted by clients questioning advice on the basis of internet information, with UK and Danish vets more often "frequently." It reports no data on app or diary recommendation, but cites the prior measurement of the channel: "of the 94 veterinarians … who suggested websites to clients, 32% verbally recommended particular websites, 21% gave written recommendations, and 17% gave both." Its recommendation is that "veterinarians should proactively direct clients towards appropriate and factually accurate online resources … by providing both verbal and written information, as well as recommending reliable websites." Younger vets "feel more insecure when facing owners with strong opinions." [EVIDENCE: fetched — PMC9404757]

The owner side of the same programme (n = 2,117: AT 800, DK 626, UK 691): 68.9% use internet resources before a consultation and 63.0% after; and "although over 60% of owners reported that they use internet resources prior to consultation, only around 20% of surveyed veterinarians estimated that number" — vets under-estimate how prepared owners arrive. Neither paper measured symptom diaries or apps. [EVIDENCE: fetched — PMC11223573]

### 2.2 The handout tradition is the incumbent "written recommendation"

LifeLearn ClientEd: "over 2,100 veterinarian-approved handouts, including 400+ on medications," "used by more than 1,500 veterinary practices," handed out "either in response to telephone queries or post-consultation." [EVIDENCE: snippet — lifelearn.com] Veterinary written recommendation, at scale, is a printed sheet the vet chooses from a library; it is practice-branded and vendor-authored. The AVMA practice data cited by a 2025 telehealth report: 59.9% of practices use client-communication software integrated with the PIMS; telehealth is used by 29.2%. [EVIDENCE: snippet — akveo.com citing AVMA] AVMA's own owner research: the vast majority "believe that an in-person examination by a veterinarian leads to the best care" and prefer to meet the vet in person first. [EVIDENCE: snippet — avma.org press release]

### 2.3 The clinic-app playbook (PetDesk) — how recommendation is engineered when the clinic is the sponsor

PetDesk (7 million pet owners, "thousands" of practices) publishes the adoption mechanics for its clinic-sponsored app: "Display QR codes on signage, receipts, and business cards"; staff scripts at check-in and check-out; pre-filled onboarding so a client reaches an active state "within 5 minutes"; incentives; a target install rate of "50–70% of active clients." Its stated premise: "A veterinary professional's recommendation carries a lot of weight, and if the veterinarian recommends an app to help monitor their pet's care, clients will trust it." Vendor-claimed outcomes (90% fewer no-shows, 40% higher routine-care compliance for app users) are marketing-grade. [EVIDENCE: fetched — petdesk.com blog; snippet — petdesk.com product page] This is the **clinic → client** direction: the practice is the customer and the app is its channel. VitusVet and Digitail's pet-parent app are the same shape. [EVIDENCE: snippet — apps.apple.com VitusVet; digitail.com/pet-parent-app] No **client → clinic → other clients** case (an owner tool that a vet then recommends to unrelated clients) was found with numbers attached. [EVIDENCE: absence in this sweep]

### 2.4 The one case with measured recommendation economics: pet insurance

Pet insurance is the closest analog of an owner-side product that spreads through vet recommendation, and it is measured. AVMA/NAPHIA reporting: "less than half of practices (48.2%) recommend pet insurance proactively; many wait for pet owners to ask. Practices that proactively recommend pet insurance report a median insured share of 7.5% of patients, about double the 3.5% at practices that only discuss it when asked." The stated barriers are the important part: "39% of veterinarians stated that pet insurance is not worth the money, **35% reported that it was a hassle for them and their staff**, and 19% felt it was a hassle for the pet owners." [EVIDENCE: snippet — avma.org "US pet insurance industry surpasses $4.7B in 2024"; naphia.org State of the Industry; veterinarypracticenews.com; the AVMA article itself fetched empty] Two readings: proactive recommendation roughly doubles penetration, and **staff hassle is the second-largest barrier**, larger than owner hassle. [EVIDENCE: the figures above]

### 2.5 What vets have said they accept: "without increasing consultation time"

The one veterinary study of an owner-completed instrument in primary care found veterinarians reported that a canine quality-of-life survey "facilitated client communication about preventive care **without increasing consultation time**," and 81% of owners wanted to learn more. [EVIDENCE: snippet — PMC7057240] That is the acceptance criterion a vet actually stated. On wearables, the IDEXX software blog frames the condition for trust: "When a veterinarian has already seen the patient, wearable tools can serve as an extension of their care"; Today's Veterinary Business's case: "Data from wearable devices showing gradual decline in activity combined with owner-taken videos revealed information that painted a clearer picture than the exam alone." [EVIDENCE: snippet — software.idexx.com; todaysveterinarybusiness.com] Fi's 2026 launch copy has "veterinary professionals" endorsing owner-spotted "subtle changes" and says the app "builds a health record from the collar's data, so you can share it with your vet." [EVIDENCE: snippet — petage.com; hepper.com] These are vendor voices; no peer-reviewed survey of vets' trust in **owner-logged app data specifically** was found (§7).

### 2.6 What they distrust

The distrust that is measured is about internet-sourced *interpretation*, not owner-collected *observation*: vets worry clients will "misunderstand information found on the internet, or … develop unrealistic expectations," that online resources "can distribute incorrect information," and that use "may inspire clients to try to treat their pets themselves, or to delay taking them to the veterinarian." [EVIDENCE: fetched — PMC9404757] The June brief's PGHD finding (clinicians are "often not receptive" to patient-initiated data unless it is "pre-digested, synthesized, prioritized") is the closest thing to a measured distrust of owner logs and stands unchanged. [EVIDENCE: `docs/vet-report-discovery.md` §4.4] The distribution-channel implication is that the objection a vet voices is to a *conclusion* arriving from outside the room; a document that carries observations and counts, and no assessment, is arguing with a different objection than the one on record. [ASSUMPTION]

The telehealth crop is a cautionary note on vendor durability rather than on recommendation: Fuzzy shut down in June 2023 after raising ~$80M, "with customers stranded mid-prescription." [EVIDENCE: snippet — sfgate.com; dutch.com; coverager.com] A vet who recommends a consumer tool is lending it the practice's name; the tool's survival is part of what is being judged. [ASSUMPTION]

---

## 3. How the 15-minute appointment is actually spent

### 3.1 The slot and the overrun

- **Booked slot (UK, first-opinion, n = 307):** 15 minutes is the most common vet consultation length (49.8%), then 10 minutes (39.4%); RVN consultations likewise 15 (45.9%) / 10 (39.4%). Extended slots are booked for euthanasia (95.8%), "complex medical cases" (73.9%), second opinions (64.8%), referrals (52.4%), skin conditions (48.5%), first vaccination (47.9%). [EVIDENCE: fetched — Robinson et al. 2019, PMC6820084]
- **Actual length (UK, direct observation, 182 consultations):** median **9 min 49 s** (IQR 7:16–13:48), range 51 s to 36 min 45 s; **48.4% exceeded the 10 minutes allocated.** [EVIDENCE: snippet — Robinson et al. 2014, Vet Record, PMC4251166 / vr.102713]
- **Video-recorded (48 consultations):** mean 11 min 45 s, range 4–28 min; and "no discernible consistency of structure" — consultations "varied in the presence, sequential order, size, location and reappearance of phases." [EVIDENCE: snippet — Everitt et al. 2013, JSAP, PubMed 23888879]
- **Preventive-care consults (UK, qualitative + timing):** practices allocate 10–20 min (20 for first puppy/kitten visits, 10 for subsequent, some 15 for all); median 9 min 45 s (IQR 7:50–14:00). A vet: "if you are trying to fit it into 10 minutes you are just overrun. It's impossible to fit everything in." An owner, unprompted, asked for the artifact this brief is about: "if there was a questionnaire with sort of maybe some ticky boxes: weight, food… it might help you remember what you… want to discuss." [EVIDENCE: fetched — Belshaw et al. 2018, PMC5876559]
- **US framing:** the 15-minute slot is described as "the default setting for most veterinary practices," while AVMA benchmarking has vets spending "about 30 minutes per patient" across ~15 scheduled appointments a day; "nearly 50% of veterinary consultations exceed their scheduled duration." [EVIDENCE: snippet — vetplanner.com; avma.org benchmarking]

### 3.2 The history-taking share

No veterinary time-and-motion study apportioning minutes to history-taking was found (Everitt's finding is that there is no stable structure to apportion). The nearest measurement is Shaw et al. 2004 (RIAS coding of vet-to-client statements): **data gathering was 9%** of veterinarian-to-client communication, "primarily accomplished through closed-ended questioning"; client education and counseling 48%; relationship building 30%; activation/partnership 7%; orientation 6%. [EVIDENCE: snippet — JAVMA 2004, PubMed 15323378] Statement share is not time share, but the shape is clear: the DVM asks a small number of closed questions and spends most of the encounter explaining. Combined with §1.2 (the technician takes the intake), the DVM's own history window is a few closed questions inside a ~10-minute consult that is already over its slot half the time. [ASSUMPTION — synthesis]

### 3.3 Does a visual summary shorten history-taking? Human-medicine evidence only

- **The AGP report (CGM data):** a 2014 study cited by the standard's stewards found "a standard download process creating AGP reports could save 4–19 minutes per patient visit"; the ADA Standards of Care recommend "standardized, single-page reports with visual cues such as the Ambulatory Glucose Profiles" as "a standard printout for all CGM devices." [EVIDENCE: fetched — agpreport.org/about; snippet — PubMed 31169432 / Wikipedia AGP] This is device data with a standardised format, not owner-entered logs — the analogy is to *format standardisation*, not to owner reporting.
- **Pre-consultation questionnaires:** a tablet questionnaire in diabetes shortened pre-clinical time (2:45 vs 5:39) but *lengthened* clinician face time (19:37 vs 11:25) — time moved into the room rather than out of it; a cardiology study is cited as saving "160 hours of cardiologist's work in a year" for ~5 minutes of patient effort; a review claims "approximately 13 minutes" saved per consultation (unverified, low grade). [EVIDENCE: snippet — PMC9759614; clinmedkaz.org review]
- **Veterinary:** the QoL-instrument study's "without increasing consultation time" (§2.5) is the only veterinary time statement found, and it is a no-worse claim, not a saving. [EVIDENCE: snippet — PMC7057240]

Net: there is evidence that a **standardised** summary saves clinician minutes (AGP) and evidence that a pre-visit questionnaire **redistributes** time toward the clinical part of the visit; there is no veterinary study of either. [EVIDENCE: absence; §7]

---

## 4. Competitor re-verification (as of 2026-09-09)

### 4.1 Per-app findings

**Indie trackers named in June (`discovery §4.1`):**

- **Vet Record: Pet Health Tracker** (Dragoslav Ivković; App Store id6756975927). Listing: "Professional PDF Export — Generate and share comprehensive medical reports, lab results, or care instructions directly with your veterinarian or boarding facility"; **"QR Code Data Sharing"** for emergencies ("Let the emergency vet or pet sitter scan your phone to instantly view your pet's critical allergies, chronic conditions, and current medications"); secure-link sharing with sitters/boarding/vets. Version 112 (7 July); **2.0★ from 1 rating**; free with IAP ($6.99/mo, $24.99/yr, $1.99 one-week offer). Mentions weight/growth charts and "Monitor daily mood and behavior" but "does not mention trend analysis or vet-facing summaries." The marketing site (`vetrecord.app`, self-titled "#1 Pet Medical Records & Health Tracker App") returned 403, so the existence of a "for vets" page is **unverified**. [EVIDENCE: fetched — apps.apple.com; vetrecord.app not retrieved]
- **Vettie** (UFUK OZDEMIR; id6760741400). **Version 2.0.0, "a complete rebuild," released ~4 days before the fetch (~2026-09-05)**, with a visual "line" design for vaccination tracking. "PDF report and CSV export" are now **Pro** features ($4.99/mo, $39.99/yr, 7-day trial; lifetime tier retired). Tracks "fifteen symptoms across three severities"; "weight and cost trends" are Pro. Not enough ratings to display. [EVIDENCE: fetched — apps.apple.com (TT storefront)]
- **Petfetti** (pulsify.io; id6471319447). "Create and share **vet-ready PDF reports** in a clear, easy-to-read format"; FAQ: "export all your pet's logs as a beautifully formatted PDF" over a chosen date range; "See your logs as easy-to-read charts that reveal patterns in your pet's health over time" — "hourly patterns," a "combined timeline," and "key insights to help you understand flare-ups, anxiety and other changes faster." Version 5.1.1 (6 April) added a "Health Conditions" chart category and calorie intake. **27 ratings, 4.8★**; Plus subscription $2.49 / $5.99 / $39.99. [EVIDENCE: fetched — apps.apple.com; snippet — petfetti.com/faq] This is the indie whose *language* moved closest to ours; the PDF is still described as an export of logs, and nothing in the listing describes denominators, a clinical question, or a vet-facing page distinct from the owner charts. [EVIDENCE: listing text; ASSUMPTION on what the PDF contains — not generated]
- **PetDocs — Pet Health Diary** (id6757140711): "generate vet visit summaries to share with your veterinarian"; AI health assistant; scan-and-digitise vaccination records; family sharing. **PetVitality** (petvitality.io): "100% veterinary-made," "export reports directly to your veterinarian's email." Both hold their June description. [EVIDENCE: snippet — apps.apple.com; petvitality.io]

**Newer entrants seen in this sweep (listing-grade only):** VitalPet ("Pet Health Tracker App for Symptoms, Care and Vet PDF" — site 403), Vetara, Veta, MyPetHealth, VetDex, VetPati, PetNexa, Collie, and **three different apps named PetLog**: *PetLog – Pet Health Journal* (de.logforlife: "generate and export PDF reports for your veterinarian and use AI-powered insights to detect patterns," Bristol stool scale, meals/water/treats/symptoms incl. vomiting and diarrhoea), *PetLog: AI-powered Health Log* (jp.nooon: an "AI Health Coach (beta)" that "turns recent records into a clear, readable summary"), and *PetLog – Pet Tracker* (PDF health report + vaccine card in the Pro tier). [EVIDENCE: snippet — App Store / Google Play listings] The CUL-671 contested claim ("PetLog now advertises AI-powered insights") is confirmed at listing grade for the *logforlife* PetLog; the three-way name collision means any future citation must carry the bundle id. [EVIDENCE: the listings above]

**Hardware-fed owner apps:**

- **Sure Petcare** (Felaqua Connect / Microchip feeders): "export your pet's data as a PDF to easily share it with your vet or anyone else involved in the care of your pet"; Felaqua daily drinking reports viewable "by different time periods and then export them as a PDF report to share with your veterinarian." Not in the June table — **new to the record**, and the only *chart-by-period* PDF found that is explicitly vet-addressed; it is device-witnessed intake, not owner-logged symptoms. [EVIDENCE: snippet — surepetcare.com]
- **Tractive** (Health Intelligence, launched 2026-04-08 per the August home-screen brief): the product page has a shareable "Weekly Health Report" ("Share your pet's report with friends and followers"), tells owners to "talk to your vet," and documents **no** vet export; the help centre separately says owners can "share concrete data with your vet … seven-day charts" of active minutes, calories, sleep, wakeups. No PDF found. [EVIDENCE: fetched — tractive.com; snippet — help.tractive.com]
- **Fi Series 3+** (2026): AI detection of "scratching, licking, barking, eating and drinking" at "up to 80 percent accuracy"; "the app builds a health record from the collar's data, so you can share it with your vet or ask the AI agent questions"; the app "can analyze uploaded vet records"; reviewers mention downloadable "tracking reports to share with their vets." **New since June.** [EVIDENCE: snippet — petage.com; forbes.com 2026-03-05; hepper.com]
- **Felcana** (UK): Felcana Go activity monitor, a "virtual vet clinic," marketing that it "can detect up to 90% of pet illnesses"; no vet-report export found. [EVIDENCE: snippet — felcana.com]
- **Whistle**: shut down 2025-08-31 (carried from the August brief). **Fuzzy**: shut down June 2023. [EVIDENCE: `docs/research/2026-08-home-screen-competitive-teardown.md`; snippet — sfgate.com]

**Big-name / clinic-side / telehealth:**

- **Chewy app**: a "Symptom Tracker that allows you to share your pet's symptoms and get quick advice on what to do next," with licensed vet teams providing "personalized consult reports" — triage-shaped, as the August brief flagged; still no owner-longitudinal export found. Chewy's **Practice Hub** is used by "over 1,000 veterinary practices"; **Chewy Vet Care** clinics opened from 2024. [EVIDENCE: snippet — apps.apple.com Chewy; dvm360.com; avma.org]
- **PetDesk / VitusVet / Digitail pet-parent app**: clinic-sponsored; records flow clinic → owner; none is an owner logging tool. [EVIDENCE: §2.3]
- **Vetster / Pawp / Dutch / AirVet**: telehealth marketplaces; one 2026 buyer's guide says AirVet has shifted toward employer-benefit distribution (low grade). No owner-logging-to-vet export was found for any of them **in this sweep**, which did not go deep on them (§7). [EVIDENCE: snippet — tailwerks.com; absence]
- **Petco, Rover, Purina, Royal Canin owner apps, "MyPetVitals"**: **not verified this sweep** (budget). A "PetVitals" app (petvitals.app) exists and is a records tracker; no product named MyPetVitals was found. [EVIDENCE: absence; snippet — petvitals.app]

**Human-medicine reference point (what "share with my doctor" looks like at platform scale):** Apple Health's *Share with Provider* puts selected data "in a dashboard in their health records systems (U.S. only; on systems that support Health app data Share with Provider)"; the generic *Export All Health Data* is XML — third parties describe it as "hundreds of megabytes … contains no charts, summaries, or option to export as PDF," and sell PDF exports with "trend charts and clean formatting designed for clinical use." [EVIDENCE: snippet — support.apple.com; vitalina.app; apps.apple.com Health App Data Export Tool] Even Apple did not ship a clinician-facing PDF; the market filled it with chart-led one-pagers.

### 4.2 The two channel questions, answered

- **Does anyone ship a chart-led, vet-facing one-pager?** No pet app checked describes one. Petfetti has owner-facing charts and a "vet-ready" PDF of logs; Sure Petcare exports period charts of device-measured drinking/feeding; Tractive and Fi share device charts and (Fi) a "health record." None describes a page composed *for* the veterinarian with a question, a denominator, or a fixed section order. [EVIDENCE: §4.1 listings; ASSUMPTION at the "none ships" strength — no PDF was generated, no app installed]
- **Does anyone use the report as a vet-acquisition channel** (a "for vets" page, a QR on the report, a clinic-partner programme)? Among owner-side trackers: none found. The QR codes found point the other way — Vet Record's is an *emergency card* for a vet to scan the owner's phone; PetDesk's are the clinic recruiting its own clients. PetVitality claims "veterinary-made" and Felcana has an "our vets" page — provenance signals, not programmes. [EVIDENCE: §4.1; §2.3; absence] The `vetrecord.app` and `vital-pet.com` sites were unreachable, so "none" is stated at the strength of the pages that could be read.

### 4.3 What moved since June 2026

| June 2026 claim (`discovery §4.1 / §4.3`) | September 2026 state | Moved? |
|---|---|---|
| Vet Record exports "complete medical records" + symptom log as a "professional PDF," share direct to vet (premium) | Same PDF export; **added** an emergency **QR card** and secure-link sharing; listing shows **1 rating (2.0★)**; site unreachable | **Moved** (features added; footprint measured as tiny) |
| Vettie: "professional PDF health reports for vet visits" + CSV, email/AirDrop | **Rebuilt as v2.0.0 (~2026-09-05)**; PDF + CSV now **Pro-only**; 15 symptoms × 3 severities enumerated | **Moved** (rebuild; export paywalled) |
| Petfetti: "fully customizable PDF reports" | Now "**vet-ready PDF reports**" + owner charts ("reveal patterns," "hourly patterns," "key insights"); Health Conditions chart category (Apr 2026) | **Moved** (vocabulary converged on ours: *vet-ready*, *patterns*, *insights*) |
| PetDocs / PetVitality: vet visit summaries, doc-scan to PDF | Unchanged at listing grade | Holds |
| "Export a PDF to your vet is becoming table stakes … every one … exports a record dump" | Still true, and the entrant count grew (≥9 new names incl. three "PetLog"s); AI-summary language ("AI-powered insights," "AI Health Coach") is now common in listings | **Holds, sharpened**: the *claim* of insight is now table stakes too |
| "None answer a clinical question, none carry denominators, statistical rigor, timestamp/intake honesty" | Still no listing describes any of these | Holds (listing-grade; no PDF generated) |
| No hardware-fed vet PDF in the June table | **Sure Petcare** ships a vet-addressed PDF of period charts; **Fi** (2026) builds a shareable "health record"; Tractive shares 7-day charts | **New** (hardware moved into vet-share first) |
| §4.3: SOAP is the lingua franca; no vet FHIR | Unchanged; the PIMS ingest is a file attachment (§1.1), not a structured import | Holds |
| §4.4: clinicians not receptive to raw PGHD | Unchanged; the new adjacent fact is that clinic AI (Digitail Tails Vision, CoVet) now summarises uploaded PDFs | Holds, **extended** |
| Whistle / Fuzzy in the competitive set | Whistle closed 2025-08-31; Fuzzy closed June 2023 | Remove |

---

## 5. Trust signals on a shared clinical artifact

### 5.1 What a regulated report is required to carry (the floor a vet's eye is trained on)

Every clinical laboratory report a US clinician receives must state, under 42 CFR 493.1291(c): "either the patient's name and identification number, or a unique patient identifier and identification number"; "the name and address of the laboratory location where the test was performed"; the test report date; the test performed; the specimen source where appropriate; "the test result and, if applicable, the units of measurement or interpretation, or both"; and information on specimen condition when unacceptable. When a test is referred out, the ordering person must be told "the name and address of each laboratory location where the test was performed." [EVIDENCE: fetched — law.cornell.edu 42 CFR 493.1291] Veterinary labs are not CLIA-regulated, but IDEXX/Antech reports are the daily object a vet reads and follow the same grammar; IDEXX additionally separates the clinical report from "client-friendly summaries" for the owner. [EVIDENCE: snippet — idexx.com VetConnect PLUS; ASSUMPTION on layout — no sample report was retrieved, §7]

So the provenance block a professional recognises is **identity-of-subject + identity-and-address-of-source + date + what-was-measured + units** — a *who / where / when / what* stamp, not a description of the source's virtues. [EVIDENCE: the CLIA list; ASSUMPTION as a generalisation]

### 5.2 The standardised one-pager that consumer devices feed into: the AGP

The AGP is the strongest precedent for a chart-led page produced from consumer-side data and read by clinicians. Its stewards' rationale: "Just like an EKG, the AGP offers a report that is consistent regardless of device"; a fixed three-part order (standardised glucose metrics, a summary glucose graph, daily views, per the 2013 consensus); one page ("No more searching for the numbers, printing pages of reports, or different reports for each patient and separate device"); licensed by device makers (Abbott, Diasend); the 4–19 minutes-per-visit saving (§3.3). The site says nothing about how a device maker's branding appears on the page. [EVIDENCE: fetched — agpreport.org/about] The lesson is structural: the *format* is the trusted thing, and it is trusted because it is the same every time — the brand rides along, it does not lead.

### 5.3 Claim forms: the document a clinic fills in for a consumer-side company

The Trupanion claim form is the highest-volume consumer-company document a clinic touches. It carries fields for "Hospital name" and "Treating veterinarian," requires "the signature of the attending veterinarian and … their printed name," and requires the owner to "attach your pet's medical records from the last two years and an itemized invoice," with the owner authorising the vet "to release their pet's medical records"; 90-day filing window. [EVIDENCE: snippet — pdffiller / signnow form mirrors] The register is *form*, not *brochure*: identity fields, an attestation, an authorisation, a deadline. It is also a reminder that the clinic's incentive on insurer paperwork is what produced the "35% hassle for staff" figure in §2.4.

### 5.4 Platform health exports

Apple's provider share is a **dashboard inside the clinician's EHR**, not a document, and it is US-only and EHR-dependent; the document-shaped exports are third-party PDFs whose pitch is "trend charts and clean formatting designed for clinical use." [EVIDENCE: snippet — support.apple.com; vitalina.app; Health App Data Export Tool listing] The human-side market's answer to "what does a clinician want from my app" is, again, a chart-led page with clean formatting, produced by someone other than the platform.

### 5.5 What reads as marketing, from the evidence

- A self-ranking in the document or its title ("#1 Pet Medical Records," Vet Record's App Store name). [EVIDENCE: fetched listing]
- An outcome claim with no denominator ("detect up to 90% of pet illnesses," Felcana; "40% higher routine care compliance," PetDesk). [EVIDENCE: snippets]
- A QR code whose destination is an acquisition page rather than verification of the document (the PetDesk playbook's QR is explicitly a download prompt on "signage, receipts, and business cards"). [EVIDENCE: fetched — petdesk.com]
- The June panel's own finding — the "Free forever / learn about Nyx" footer was the one "consumer-app contaminant" both the skeptical GP and the Designer flagged, and the masthead-plus-verify-only-QR (no token) survived as "reads as a lab masthead." [EVIDENCE: `docs/nyx-vet-report-requirements.md` §2, Branding row] Nothing found in this sweep contradicts that ruling; the CLIA grammar and the AGP precedent both support it.

---

## 6. Implications for a chart-led redesign — evidence, not decision

Each line names the evidence it rests on; none of them is a ruling.

1. **The first reader is a technician filing and summarising, not a DVM reading.** (§1.1, §1.2) A page that cannot be named and categorised from its top edge, and compressed to one spoken line by someone who did not open the app, has failed before the DVM sees it. The page-1 signalment and range box already in the spec are the right *kind* of thing; the evidence adds that they are doing front-desk work, not only clinical work.
2. **The file is one PDF, ideally small, and may be printed, re-scanned, and machine-summarised.** (§1.1) Vetspire's 50 MB cap is the tightest; AVImark's print-then-scan loop is real; Digitail's Tails Vision will read the PDF's text. The spec's B&W-safe rule is confirmed by the path; a text layer and plainly labelled numbers gain a new reason.
3. **Time is the currency, and the slot is already overdrawn.** (§3.1–§3.2) Median ~10 minutes, half over the slot, data-gathering ~9% of the DVM's talk. Anything that asks for reading time competes with the exam; the AGP's 4–19 minutes saved came from *standardisation*, so the case for a chart-led page is "same shape every time, one glance," not "more information."
4. **The stated acceptance bar is "without increasing consultation time," and the largest recommendation barrier after "not worth it" is staff hassle.** (§2.4, §2.5) The channel hypothesis (vet reads → recommends) is consistent with the insurance data (proactive recommendation ≈ 2× penetration) *only if* the artifact creates no staff work.
5. **Recommendation, where it is measured, is verbal-plus-written in the room, and the written half is a handout.** (§2.1, §2.2) The evidence for a document-borne channel is that the handout tradition exists at scale (1,500+ practices on one library) — not that any owner app has used it.
6. **Vets' recorded distrust is of outside *conclusions*, not outside *observations*.** (§2.6) A report that stays in S/O and carries counts with denominators is arguing with the objection that is not on record; this is consistent with the June "no A/P" rule and gives it a channel rationale.
7. **The competitive vocabulary has caught up; the artifact has not.** (§4.3) "Vet-ready PDF," "patterns," "insights," "AI-powered" are now listing boilerplate. Differentiation the listing can express is gone; what remains is what the *page* does in the vet's hand — the same-shape-every-time property the AGP has and no pet export describes.
8. **The provenance block that professionals recognise is who / where / when / what, and the format leads the brand.** (§5.1–§5.2) CLIA's element list and the AGP's "consistent regardless of device" both point at a small identity-and-date stamp with the brand subordinate; the June masthead + verify-only-QR ruling is consistent with both. A QR that recruits is the PetDesk register, and it is the register the panel struck.
9. **Hardware moved into vet-share first, with device-witnessed charts.** (§4.1) Sure Petcare's period-chart PDF is the nearest shipped object to a chart-led vet page, and it is trusted on the strength of a sensor. An owner-logged page does not have that; its equivalent is the denominator and the timestamp-confidence tag the spec already carries — the *witness* has to be on the page.

---

## 7. Research debt (what this sweep could not establish)

- **No peer-reviewed survey of veterinarians' trust in owner-logged app data.** The Dr. Google studies measure attitudes to internet *information*; the wearable pieces are vendor blogs; the QoL-instrument study is the only primary-care instrument study found. A real-vet channel (the PM's own GP; the pre-scale 5–8-GP gate in `nyx-vet-report-requirements.md`) is still the only way to get this.
- **No veterinary time-and-motion split of history-taking.** Everitt 2013 found no stable structure; Shaw 2004's 9% is *statement* share. "How many minutes is history" is not in the literature found.
- **No veterinary study on whether a visual summary shortens history-taking.** The AGP 4–19 min figure is human, device-fed, and standardised; the pre-visit questionnaire studies show time *redistribution*, not saving.
- **PIMS filename/header conventions:** inferred from Vetspire's `Rename`/`Category` fields and the AVImark loop; no vendor publishes guidance on how to name a client-supplied file. ezyVet's knowledge base and the Cornerstone email/fax page could not be fetched (JS-only / empty body); the ezyVet "include a clinical summary from a different practice" procedure exists by title only.
- **Vet-tech forums:** Reddit is blocked to the crawler; no forum thread on "the client brought a binder" was reachable. The technician-first history finding rests on training and utilization guides, not on forum testimony.
- **IDEXX / Antech report layout:** no sample PDF retrieved; §5.1 leans on CLIA and the VetConnect product page.
- **Competitors not verified this sweep:** Petco, Rover, Purina, Royal Canin owner apps, Pawp, Dutch, Vetster, AirVet (beyond one low-grade buyer's-guide line), "MyPetVitals" (no such product found). `vetrecord.app` and `vital-pet.com` returned 403, so "no 'for vets' page" is stated only for pages that could be read. No PDF was generated from any competitor; "record dump" is a listing-grade reading.
- **Snippet-grade figures to upgrade before external use:** the AVMA/NAPHIA insurance percentages (the AVMA page fetched empty); the 13-minutes-saved questionnaire claim; the Tractive help-centre 7-day-chart share; Vettie's release date (relative "4 days ago" on a 2026-09-09 fetch).
- **The dvm360 article "Apps for veterinary clients: 'Why can't I just do it on my smartphone?'"** and **"AI-powered pet collar allows data sharing with veterinarians"** are cited by title only (403).

---

## 8. Sources

**Q1 — clinic ingest and workflow**
- ezyVet, Add a document or other file to a patient record — https://docs.ezyvet.com/en/browse-documentation/ezyvet/file-attachments/add-a-document-or-other-file-to-a-patient-record-general-procedure (snippet; JS-only)
- ezyVet, File attachments — https://docs.ezyvet.com/en/browse-documentation/ezyvet/file-attachments
- ezyVet, Include a clinical summary from a different veterinary practice — https://docs.ezyvet.com/en/browse-documentation/ezyvet/veterinary-care/clinical-record-documents/include-a-clinical-summary-from-a-different-veterinary-practice-in-a-complete-history (title only)
- Vetspire, Upload Documents in Patient Chart — https://manual.vetspire.com/vetspire-user-manual/ok/Commercial/upload-documents (fetched)
- Vetspire, rDVM Mass Upload — https://manual.vetspire.com/vetspire-user-manual/ok/Commercial/rdvm-mass-upload
- Attaching files in AVImark (practice write-up) — https://professionalandtechnicalwriting.wordpress.com/2017/02/25/attaching-files-in-avimark-veterinary-management-software/ (fetched)
- Covetrus, Setup and Use the Medical Condition Record (AVImark) — https://covetrus.com/wp-content/uploads/Setup-and-Use-the-Medical-Condition-Record-2024.pdf
- IDEXX Cornerstone, EMR and Whiteboard Usage — https://www.idexx.com/files/cornerstone-coach-electronic-medical-record-and-whiteboard-usage-83.pdf
- Cornerstone Help Hub, Email and fax — https://cornerstonehelphub.com/docs/email-and-fax/ (empty body)
- Digitail, Tails AI Assistant — analyze patient's files with Vision — https://help.digitail.io/en/articles/9611715-tails-ai-assistant-analyze-patient-s-files-with-vision-capabilities (fetched)
- Digitail, Medical Records collection — https://help.digitail.io/en/collections/2751190-medical-records
- Digitail blog, front-desk automation — https://digitail.com/blog/solving-front-desk-chaos-automating-patient-check-ins-and-flows/
- Provet Cloud, Client & Patient Record — https://www.provet.cloud/blog/3-ways-provet-clouds-client-patient-record-supercharges-your-veterinary-clinic
- IDEXX SmartFlow support, Provet Cloud discharge attachments — https://forum.smartflowsheet.com/support/solutions/articles/13000061905-provet-cloud-how-to-discharge-a-patient-and-attach-documents-from-smart-flow-
- Shepherd, Features — https://www.shepherd.vet/features/
- Instinct, Pet Owner Portal — https://instinct.vet/blog/instinct-portal-introduction/
- CoVet, Veterinary patient history form — https://co.vet/post/veterinary-patient-history-template/
- VetTechPrep, Taking a good history in the exam room — https://blog.vettechprep.com/vettech-taking-a-good-history-in-the-exam-room
- VetPartners Team Utilization Guide, The Exam Room Experience — https://utilization-guide.vetpartners.org/guide/8-4
- AAHA, 2023 Technician Utilization Guidelines — https://www.aaha.org/resources/2023-aaha-technician-utilization-guidelines/
- Otto, Veterinary Record Keeping — https://otto.vet/veterinary-record-keeping/
- AHIMA, Fundamentals of the Legal Health Record and Designated Record Set — https://journal.ahima.org/Portals/0/archives/AHIMA%20files/Fundamentals%20of%20the%20Legal%20Health%20Record%20and%20Designated%20Record%20Set.pdf
- PetHub, Getting my pet's medical records — https://www.pethub.com/articles/70424/getting-my-pet-s-medical-records
- VCA, The importance of sharing medical records — https://vcahospitals.com/know-your-pet/the-importance-of-sharing-medical-records

**Q2 — recommendation and trust**
- PetDesk, 7 best practices to get clients to download your vet app — https://petdesk.com/blog/7-best-practices-to-get-clients-to-download-your-vet-app/ (fetched)
- PetDesk, Veterinary mobile app — https://petdesk.com/veterinary-mobile-app/
- Kogan et al., Compete or cooperate with 'Dr. Google'? (vets, AT/DK/UK) — https://pmc.ncbi.nlm.nih.gov/articles/PMC9404757/ (fetched)
- Does "Dr. Google" improve discussion and decisions? (owners, AT/DK/UK) — https://pmc.ncbi.nlm.nih.gov/articles/PMC11223573/ (fetched)
- AVMA News, US pet insurance industry surpasses $4.7B in 2024 — https://www.avma.org/news/us-pet-insurance-industry-surpasses-4b-2024 (fetched empty; snippet)
- NAPHIA, State of the Industry — https://naphia.org/industry-data/
- Veterinary Practice News, Vets warm up to pet health insurance — https://www.veterinarypracticenews.com/veterinarians-warm-up-to-pet-insurance/
- LifeLearn ClientEd — https://www.lifelearn.com/products/client-education-resource/ · https://www.lifelearn.com/2023/06/19/improve-a-veterinary-client-education-program/
- Akveo, The State of Veterinary Telehealth 2025 (citing AVMA) — https://www.akveo.com/pet-care/veterinary-software-development/telehealth
- AVMA press release, pet owners prefer veterinarian-led care — https://www.avma.org/news/press-releases/new-avma-research-finds-pet-owners-overwhelmingly-prefer-veterinarian-led-care
- IDEXX Software blog, Wearable technology in veterinary practice — https://software.idexx.com/resources/blog/the-future-of-pet-health-monitoring-wearable-technology-in-veterinary-practice
- Today's Veterinary Business, Making data work for patient care — https://todaysveterinarybusiness.com/making-data-work-for-patient-care
- Owner and veterinarian perceptions of a canine QoL survey in primary care — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7057240/
- dvm360, Apps for veterinary clients — https://www.dvm360.com/view/apps-veterinary-clients-why-cant-i-just-do-it-my-smartphone (403; title only)
- dvm360, AI-powered pet collar allows data sharing with veterinarians — https://www.dvm360.com/view/ai-powered-pet-collar-allows-data-sharing-with-veterinarians (title only)
- dvm360, Chewy launches marketplace service for veterinarians — https://www.dvm360.com/view/chewy-launches-brand-new-marketplace-service-for-veterinarians
- AVMA News, Chewy to open veterinary practices — https://www.avma.org/news/chewy-open-veterinary-practices-florida-colorado
- Dutch, Fuzzy Pet Health shuts down — https://www.dutch.com/blogs/general/fuzzy-shuts-down
- SFGate, SF startup Fuzzy abruptly shuts down — https://www.sfgate.com/tech/article/san-francisco-pet-startup-fuzzy-shuts-down-18161874.php
- Tailwerks, Best veterinary telemedicine platforms 2026 — https://tailwerks.com/best-veterinary-telemedicine-software/

**Q3 — the appointment**
- Robinson et al. 2014, Consultation length in first opinion small animal practice — https://pmc.ncbi.nlm.nih.gov/articles/PMC4251166/ · https://bvajournals.onlinelibrary.wiley.com/doi/10.1136/vr.102713 (403)
- Everitt et al. 2013, The structure of the small animal consultation — https://pubmed.ncbi.nlm.nih.gov/23888879/
- Robinson et al. 2019, Appointment scheduling and cost in first opinion small animal practice — https://pmc.ncbi.nlm.nih.gov/articles/PMC6820084/ (fetched)
- Belshaw et al. 2018, "I always feel like I have to rush…" — https://pmc.ncbi.nlm.nih.gov/articles/PMC5876559/ (fetched)
- Shaw et al. 2004, RIAS analysis of veterinarian-client-patient communication — https://pubmed.ncbi.nlm.nih.gov/15323378/
- VetPlanner, Is 15 minutes enough for a vet consultation? — https://vetplanner.com/blog/optimal-veterinary-appointment-length/
- AVMA, Benchmarking data plus elevating efficiency — https://www.avma.org/news/benchmarking-data-plus-elevating-efficiency-equals-practice-productivity
- Pre-consultation tablet questionnaire, diabetes — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9759614/
- Pre-consultation history taking systems review — https://www.clinmedkaz.org/download/pre-consultation-history-taking-systems-and-their-impact-on-modern-practices-advantages-and-13947.pdf
- AGP Report, About — http://www.agpreport.org/agp/about (fetched)
- Utilizing the AGP to standardize CGM in clinical practice — https://pubmed.ncbi.nlm.nih.gov/31169432/

**Q4 — competitors**
- Vet Record: Pet Health Tracker (App Store) — https://apps.apple.com/us/app/vet-record-pet-health-tracker/id6756975927 (fetched) · https://vetrecord.app/ (403)
- Vettie (App Store, TT) — https://apps.apple.com/tt/app/vettie-pet-health-tracker/id6760741400 (fetched)
- Petfetti (App Store) — https://apps.apple.com/us/app/pet-health-tracker-petfetti/id6471319447 (fetched) · https://www.petfetti.com/faq/
- PetDocs — https://apps.apple.com/us/app/petdocs-pet-health-diary/id6757140711
- PetVitality — https://petvitality.io/ · https://apps.apple.com/us/app/petvitality-pet-care-tracker/id6479165973
- VitalPet — https://vital-pet.com/ (403) · Vetara — https://vetara.app/ · Veta — https://apps.apple.com/us/app/veta-pet-health-care-manager/id6758032978 · MyPetHealth — https://apps.apple.com/us/app/mypethealth-pet-care/id6777263665 · VetDex — https://www.vetdex.app/
- PetLog – Pet Health Journal — https://apps.apple.com/us/app/petlog-pet-health-journal/id6747721421 · PetLog: AI-powered Health Log — https://apps.apple.com/us/app/petlog-ai-powered-health-log/id6756508276 · PetLog – Pet Tracker — https://apps.apple.com/us/app/petlog-pet-tracker/id6759348549
- Tractive, Health monitoring — https://tractive.com/en/fp/health-monitoring-for-dogs-and-cats (fetched) · help centre — https://help.tractive.com/hc/en-us/articles/360011024119-What-health-features-does-Tractive-track
- Sure Petcare, connected products and health insights — https://www.surepetcare.com/en-gb/advice-news/pet-tech/how-multiple-connected-pet-products-can-provide-greater-health-insights · Felaqua Connect — https://www.surepetcare.com/en-us/felaqua-connect
- Fi Series 3+ — https://www.petage.com/fi-unleashes-1st-ai-powered-smart-dog-collar-for-real-time-health-and-behavior-detection/ · https://www.forbes.com/sites/marksparrow/2026/03/05/dogs-are-getting-fatter-and-dying-sooner-but-tech-from-fi-comes-to-the-rescue/ · https://articles.hepper.com/fi-dog-collar-review/
- Chewy app — https://apps.apple.com/us/app/chewy-pet-care-pharmacy/id1149449468
- Felcana — https://felcana.com/ · https://felcana.com/pages/felcana-go
- PetVitals — https://www.petvitals.app/
- VitusVet (App Store) — https://apps.apple.com/us/app/vitusvet-pet-medical-records/id955252538 · Digitail pet-parent app — https://digitail.com/pet-parent-app/
- Apple, Share your health data — https://support.apple.com/guide/iphone/share-your-health-data-iph5ede58c3d/ios · vitalina, Share with doctor — https://vitalina.app/guides/share-with-doctor · Health App Data Export Tool — https://apps.apple.com/us/app/health-app-data-export-tool/id1625921705

**Q5 — trust signals**
- 42 CFR 493.1291, Standard: Test report — https://www.law.cornell.edu/cfr/text/42/493.1291 (fetched)
- AGP Report, About — http://www.agpreport.org/agp/about (fetched)
- Trupanion claim form (mirror) — https://www.pdffiller.com/88373876--trupanion-claim-form-
- IDEXX VetConnect PLUS — https://www.idexx.com/en/veterinary/software-services/vetconnect-plus/
- AHIMA (as Q1) · Digitail Tails Vision (as Q1) · Apple Health (as Q4)

**In-repo cross-references**
- `docs/vet-report-discovery.md` §4 (2026-06-21) — the baseline this brief extends
- `docs/nyx-vet-report-requirements.md` §2 (Branding row), §3 — the current report
- `docs/research/2026-08-home-screen-competitive-teardown.md` — Tractive Health Intelligence launch, Whistle shutdown
- `docs/research/2026-08-event-taxonomy-evidence.md` §V.4d (CUL-671) — the PetLog contested claim
