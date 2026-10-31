# Reports patients and owners hand to clinicians: product teardowns, generation and share flows, and what powers them (adjacent domains, for vet report v2)

**Context:** round 3 (clean slate) of the vet report redesign, [CUL-2275](https://linear.app/projectnyx/issue/CUL-2275). Evidence only; product calls live on the issue.

**Date:** 2026-10-30 · **Status:** evidence brief, frozen at write; re-verify at use. Consumer-app facts move fast, and several help centres (Clue, Withings, Tidepool, CoVet, Kardia) blocked fetches this pass, so their claims are snippet grade. · **Commissioned for:** the PM's "step-function v2" question for the vet report: what the best reports in adjacent domains look like, and what capabilities power them. · **Evidence only; makes no product decision.**

**What this adds to the prior briefs (not repeated here).**
- `docs/research/2026-09-vet-report-visual-design-sweep.md` catalogued 22 visual devices (D1–D22) and 17 anti-patterns, and summarised Oura, Whoop, Apple Health, Function, InsideTracker, Natural Cycles, Flo, Withings Standard/Compact, Garmin and Levels at the layout level.
- `docs/research/2026-10-vet-report-overlaid-timelines.md` §1.5–1.6 covered the AGP page order, the connected-pen AGP, Clarity's daily and overlay graphs, LibreView's Daily Log, and seizure, migraine, IBD, eczema, menstrual and IBS diary reports at listing grade.
- `docs/research/2026-10-vet-report-machine-readers.md` covered clinic AI summarizers reading PDFs (Provet, Instinct, ScribbleVet, CoVet, Vetspire, Digitail, VetNotes), tagged PDF, PDF/A-3, FHIR's animal extension and VetXML.
- `docs/research/2026-10-vet-report-ai-written-report.md` covered LLM summary error rates, data-to-text precedent, guardrail architectures, rival AI-written pet reports and vets' trust in AI.

This brief adds four things those briefs leave out: product teardowns that include the **generation and share flow**, **what powers each report** (standards, instruments, rules, AI), **vet-side owner instruments** (itch trackers, pain and quality-of-life scales), and **anything new since 2026-10-11**.

**Evidence tags.** `[fetched]`: the page or PDF was retrieved and read this pass. `[snippet]`: the claim comes from a search-engine excerpt only, because the page was not fetched or blocked the fetch. `[repo]`: read from the Culprit repository this pass. `[inferred]`: my reasoning, not a source. Screenshots were not available, so no claim is `[screenshot-described]`. Every unfetched claim is marked as such. No product was installed and no account was created.

**Culprit today, for comparison** `[repo, app/report.tsx:23–72]`:
- **Default range cascade:** since last visit, then the active diet trial, then the last 90 days.
- **Custom range:** a hand-picked window, which makes the server disclose how many symptom events fall outside it.
- **Preview:** an in-app view of the server-rendered HTML.
- **Notes toggle:** the owner chooses whether notes are included.
- **Send-moment lines:** shown only when they apply (no allowed-food list on the running trial; saved vet documents do not travel with the PDF).
- **Sharing:** the PDF goes out through the native share sheet. There is no link and no clinic-side surface.

Several of the patterns below are ones Culprit **already exceeds**; those are flagged.

---

## (a) Summary table

| Product | Domain | Artifact the clinician gets | Range selection | Share path | What powers it | How missing data shows | Evidence grade |
|---|---|---|---|---|---|---|---|
| **Dexcom Clarity** | CGM, diabetes | Overview dashboard, Patterns, Trends, Daily, Overlay, **Compare**, Statistics, AGP; PDF, CSV, **Copy as text** | Defaults to the last 14 days. Presets ("recent numbers of days") or custom dates. Compare uses two independent ranges, up to 90 days | Clinic code, or a patient-generated code valid for **3, 6 or 12 months**; email, print, PDF download, CSV export | International TIR consensus ranges; a licensed AGP; rule-based pattern detection (time, scale and frequency of excursions); "considerations" | "Days with data" counts only days with ≥50% readings; "time active" is hours collected over hours in the period; a broken trace line means no data; "Only known insulin doses will display" | fetched (clinic guide, patient guide) |
| **LibreView** (Abbott) | CGM | Snapshot, Daily Log, Daily Patterns, AGP, **Glucose Pattern Insights**, Mealtime Patterns, Monthly and Weekly summaries | Most reports are 14-day; AGP can extend to 90 days | Patient enters the **Practice ID** in the app, after which data uploads automatically; the clinic dashboard has **conditional flags** | AGP / TIR consensus; **auto-generated comments**; the software "highlights the most important pattern" and offers "considerations" | Comments such as **"Gaps found in food data. 14 days in this reporting period have no recorded food events."**; "% Time Sensor is Active" sits under the date range; "SOURCES:" line names the device | fetched (HCP detail aid) |
| **Tidepool** | CGM, open source | Clinic population dashboard (TIDE) and summaries | Fixed 1/7/14/30-day windows; recency filters | Clinic workspace | Open summary statistics | GMI only shown above 70% data; time in range hidden below 24 h of data; **striped when under 70%** (snippet) | fetched (developer docs) + snippet |
| **mySugr** | Diabetes logbook | PDF (whole weeks), CSV, Excel | Two weeks, three months or custom (PRO); a PDF **expands to whole Sun–Sat weeks** | Share sheet, email | Logbook | — | snippet |
| **Oura** | Wearable | "Shareable Reports" PDF: Sleep, Cycle Insights, Perimenopause | Fixed 7, 30 or 90 days before today; "you cannot adjust the timeframes or type of data" | Download, email, message; "no way to recall it once it's been sent" | Wearable metrics | — | fetched (blog) + snippet (support) |
| **Withings** | BP, ECG, SpO2, weight | Health Report PDF (up to 3 months); **HealthLink** | Owner selects a timeframe, then reviews the generated PDF before sharing | Share sheet, or HealthLink "accessible for 7 days and … completely anonymized" | Device measurements | — | snippet (Zendesk blocked) |
| **Apple Health** | Platform | "Share with Provider": a web app inside the EHR. Separate Medications list PDF | Continuous; uploads about once every 24 h | Requires a US Health Records institution; provider copies "summary snippets" via a **Scratchpad** | HealthKit | — | fetched (Apple guide) + snippet |
| **Clue** | Menstrual | "Report for doctor" PDF: last 6 completed cycles, symptom **heatmap** | Fixed: last six cycles | Paid one-time purchase; **24-hour edit window, then read-only**; download | Cycle model | **Symptoms tracked fewer than 3 times are excluded**; temperature and weight are left out | snippet (help centre 403) |
| **Guava Health** | Chronic illness, multi-source | "Visit Prep" summary (download, send, print), symptom report PDF, provider dashboard | Symptom report: date range plus optional photos and body map. Visit Prep: chosen by **visit type** | Download, print; a provider dashboard (paid, per patient) | Wearables, EHR and labs aggregated; "Auto Prep" AI first draft; AI "Guava Assistant" for clinicians | — | fetched (marketing, 2023 announcement) |
| **Monash FODMAP** | IBS elimination / reintroduction | Diary report (PDF on Android) | Owner picks start and end dates, then **Preview** | Email; iOS requires Apple Mail as the default mail app | Monash food composition data; 3-day dose-escalation challenge protocol | — | fetched (help page, blogs) |
| **mySymptoms** | Food–symptom | PDF/CSV report; **Clinic web app** | — | Clinic web app; print | "Top suspects" analysis | — | snippet |
| **Migraine Buddy, Epsy, Visible, Bearable, Flaredown, Cara Care** | Migraine, epilepsy, long COVID, general, IBS | Doctor report or export (Bearable is CSV only, and it tells users to screenshot) | Varies; Bearable 3 months, 6 months or all time | Varies | Varies; Cara Care is a German DiGA | — | snippet |
| **Kardia** | ECG | Single-recording PDF; KardiaPro clinician portal (paid) | Per recording | Email PDF; NICE MTG64 assessed the single-lead device | FDA-cleared rhythm determinations, "potential findings" | — | snippet |
| **Zoetis Apoquel / Cytopoint itch trackers** | Vet dermatology | One-page paper trackers the owner brings to the visit | Apoquel: 14 daily boxes. Cytopoint: **daily in week 1, then weekly to week 8**, with an "Injection administered" row | Paper | Behaviourally anchored 0–100 itch scale; owner and pet quality-of-life 1–10 | — | fetched (PDFs) |
| **COSCAD'18 / PVAS10** | Vet dermatology trials | Core outcome set | — | — | PVAS10 validated; OGATE not validated | — | snippet (abstract) + repo |
| **VetMetrica** | Vet HRQoL | Domain profile normalised to healthy dogs (50 = average healthy dog of that age) | Repeated over months | Vendor web/app | 22-item instrument; threshold at 44.8; MID ~7.7 | — | fetched (PMC) |
| **IDEXX VetConnect PLUS** | Vet labs | Results with priors in columns, trending graphs, "client-friendly summary", PDF to client or specialist | Per result history | Email, print, Petly pages | Reference intervals. Graphing **analytes without traditional reference ranges** (USG, UPC, progesterone) | — | fetched (2018 release notes) + snippet |
| **CoVet IDEXX Lab Data Summary** | Vet AI | Structured summary with an **"At a glance" of 2–5 key findings**, reviewed before adding to the case | IDEXX lab history | Inside CoVet | LLM (vendor not disclosed); IDEXX history only | — | snippet (help 503) |
| **RVC Pet Epilepsy Tracker** | Vet epilepsy | Emailed PDF of seizure diary, medication diary, history | "a range of data" | Email | Owner log; research opt-in | — | snippet (listings) |
| **SMART Health Links / CMS "Kill the Clipboard"** | Human interoperability | QR code pointing to an encrypted FHIR Bundle, a **"FHIR-Rendered PDF"** and an optional **"Patient Story PDF"** | — | QR at check-in; link expiry required; every access logged | FHIR R4, US Core; KTC profile | — | fetched (CMS, KTC spec) |

---

## (b) Per-product sections

### B1. Dexcom Clarity: the most complete generation and share flow found

**Layout** `[fetched, Clarity clinic user guide]`
- **Overview page:** a dashboard of average glucose, GMI, SD, %CV, time in range against consensus ranges, sensor usage, insulin, and fasting and post-meal logs. Below it, **"up to four patterns identified in the data"** and the **"best glucose day."**
- **Patterns report:** one graph per **pattern occurrence**, each marked with a letter. The guide says "Significant daily data that is used to indicate the pattern, highlighted in the white background columns. Gray areas of the graph are not part of the pattern." Rebounds are counted, and "some possible considerations are provided at the bottom."
- **Compare report:** two columns, each with "its own date range selector". "Statistics in the right column are marked with arrows to indicate changes from the left column values." **"Patterns that were resolved from the left column are marked on the right column with strike-through green text and a check mark icon. New patterns in the right column are highlighted with a NEW icon."**

**Coverage** `[fetched]`
- "Days with data: The number of days during the reporting period with at least 50% sensor readings."
- "Time active: The number of hours the sensor has collected data, divided by the number of hours in the reporting period."
- Insulin: "Only known insulin doses will display."
- Fasting and post-meal checks: "The number of times this event is logged and the percentage of the logged events that fall within the selected target are displayed." The denominator is the logged events.
- In the daily graph, "If the black trace line … has interruptions or stops, then the Dexcom CGM system did not record glucose data during that time."

**Generation flow** `[fetched]`
- "By default, Dexcom Clarity reports display the most recent 14 days of data." The user can "Choose from the recent numbers of days or select a custom date range."
- Print and download follow the same steps: select a date range, then "Select at least one report to print". The user chooses which sections go into the PDF.
- Export produces a CSV of raw values and events.
- **"Copy as text. Available only on Overview report, you can copy the dashboard data to your computer's clipboard … displayed in a text only format."**
- Clinic-side target-range edits "only apply to your account view and do not change … patient's personal settings."

**Share flow** `[fetched, Dexcom IE FAQ; patient guide]`
- Option 1: the patient accepts a clinic invitation by entering the clinic's sharing code, enters their date of birth, ticks a consent box and taps "Yes, Share My Data."
- Option 2: the patient generates a code and taps "3, 6 or 12 to select number of months that the code can be used."
- The clinic code can be changed at any time, and "The previous code will no longer" work.
- The clinic's patient list sorts by name, DOB, ID or "GMI % (14 DAYS)".

**What powers it** `[fetched]`
- International consensus TIR ranges; GMI requires "at least 12 days of CGM data" (patient guide).
- AGP licensed from the International Diabetes Center.
- Pattern significance comes from three factors: "Time spent in hyper- or hypoglycemia; Scale…; Frequency…". This is a rule engine, not an LLM. Darker shading means more significant.

**Evidence and complaints**
- Vendor claim: "Frequent Dexcom CLARITY viewers experience up to 15% increased time in range" (a 2018 conference abstract; frequent = four or more logins a month) `[fetched, patient guide]`. This is about patient self-review, not clinician use.
- The colour coding is a known print risk: "the upper limit line is always yellow, and the lower limit line is always red" `[fetched]`.

### B2. LibreView: generated comments that state the gaps, and a ranked "most important pattern"

**Snapshot page** (one page, 14 days) `[fetched, LibreView HCP detail aid]`
- Average glucose and GMI, time in ranges, daily carbs, insulin, low-glucose events, and sensor usage ("% Time Sensor is Active 99%").
- A **Comments** column with machine-generated lines:
  - *"Gaps found in the insulin data. 14 days in this reporting period have no recorded insulin events."*
  - *"Gaps found in food data. 14 days in this reporting period have no recorded food events."*
- The guide explains: "Comments are provided that help to expose patterns in the data, rather than just showing numbers. These comments are automatically generated."
- Every page carries **"SOURCES: FreeStyle Libre 3 +"**, which names where the data came from.

**Glucose Pattern Insights** `[fetched]`
- "Time in Ranges and Glucose Statistics" compared with the International Consensus.
- The software "identifies your patient's glycaemic patterns and highlights the **most important pattern** during the reporting period."
- "Considerations for the Healthcare Professional" carry a footnote: "Suggested considerations do not replace the opinion or advice of the healthcare provider."

**Monthly Summary** `[fetched]`: a calendar grid with average glucose, scans and low events per day.

**Share and clinic side** `[fetched]`
- The patient types the Practice ID into the app ("Connect to a Practice"), and data then uploads automatically: "No need for office staff to download the data".
- The clinic dashboard has **conditional flags**: "Highlight patients who have not uploaded in the last 4 Weeks", "fewer than 7 scans per day", "more than 4 low glucose events".
- The AGP period defaults to 14 days and can extend to 90 days `[snippet, PMC review]`.

**Relevance** `[inferred]`: the Comments column is a shipped, regulated precedent for **deterministic sentences that name the denominator of absence per category**. "Most important pattern" plus "considerations" is the part Culprit's no-assessment rules would forbid (see (c) "Do not steal").

### B3. Tidepool: three sufficiency states rather than two

**From the developer docs** `[fetched, dev-docs.tidepool.org/docs/summary-data]`
- "GlucoseManagementIndicator is only present if GlucosePeriod.Total.Percent > 70."
- Range breakdowns for multi-day periods need more than 1,440 minutes (24 h) of data.
- Summaries run over "1, 7, 14, 30 day periods".
- "The 60 day window is backwards from the date of the last uploaded data for each user, not the current date."

**From the support pages** `[snippet; Zendesk blocked the fetch]`
- If CGM use is under 70% but over 24 hours, time-in-range values "will still be calculated but will be visualized with a **striped pattern**". Under 24 hours they are not displayed.
- The TIDE dashboard sorts patients by CGM wear time, lowest first, so the patients with the least data appear at the top.

**Relevance** `[inferred]`: this is a three-state rule: hidden, shown hatched, shown solid. Culprit's floors today are two-state (shown, or "not checked").

### B4. mySugr

`[snippet, mySugr support and an Accu-Chek-hosted guide]`
- PDF is "the most popular" export for doctor visits; PRO users get a custom range.
- CSV and Excel exports include all logged data except photos.
- **A PDF covers whole weeks**: pages run Sunday to Saturday, and the chosen dates expand to fit. The two sources conflict on whether Excel takes a range.

**Relevance** `[inferred]`: snapping to whole weeks keeps weekly bars complete, but it silently widens the window. Culprit's honest window labelling would have to print the expanded dates.

### B5. Platform reports: Oura, Withings, Whoop, Apple Health

**Oura** `[fetched, blog 2024-08-30; snippet, support]`
- Sleep report over "seven, 30, or 90 days prior to the current date". Cycle Insights covers six months.
- "There is no way to recall it once it's been sent." The report is static, so the provider only gets new data if the member sends a new report.
- Support: "you cannot adjust the timeframes or type of data that is shared." The sweep already noted the data gates.

**Withings** `[snippet; support.withings.com returned 403]`
- Health Report: "Select the time frame you wish to share … Wait while the PDF is generated and **review its contents**. Select Share". It covers up to 3 months of measurements.
- **HealthLink:** "accessible for 7 days and is completely anonymized."
- Standard versus Compact variants are in the September sweep.

**Whoop** `[snippet]`
- Each Heart Screener ECG can be exported as a PDF to a provider (WHOOP Life with WHOOP MG only).
- No batch export of several ECGs was found.

**Apple Health "Share with Provider"** `[fetched, Apple Health Records guide]`
- Available to US Health Records institutions only.
- Data categories include activity, heart rate, ECG, blood pressure, sleep, cycle, labs and immunizations.
- Uploads go "approximately once every 24 hours".
- The provider sees the latest data in a web app launched from the chart. Data "is not stored in the chart"; providers copy **"summary snippets"** into the chart through a **Scratchpad**.
- Stopping sharing deletes the data from the Health Sharing Cloud.
- Separately, the Medications list exports as a PDF. One user reports it lists names and strengths but not doses or times `[snippet]`.

**Apple's AI coach (Mulberry / "Health+")** `[snippet, Bloomberg via several outlets, 2026-02-05]`: reported as scaled back, with features to arrive piecemeal in the Health app. Nothing shipped was found.

### B6. Clue: a fixed window, a minimum-occurrence rule, and an edit window before the report freezes

`[snippet, Clue help centre; both pages returned 403]`
- The report is a PDF of the **last six completed cycles**: cycle and period history, statistics, and a **heatmap** of when symptoms occur in the cycle.
- Optional fields: name, age, conditions, medications, birth control.
- **"Any symptoms tracked less than 3 times are excluded from the report."** Single events (appointments, medications, most tests) and temperature and weight are excluded.
- Flow: "Report for doctor", then "Go to report details", then "Agree and create report" (a purchase). Generation takes 30 s to 5 min.
- **"During the 24 hours after purchase, you can update your personal and medical details, edit any tracking data, or hide a cycle … After that, the report is read-only."**
- Available in the US, UK, AU, CA and NZ, in English only. It is a one-time purchase, even for Clue Plus subscribers.

**Relevance** `[inferred]`:
- Paywalling the clinician report is the opposite of Pets > $. It shows that consumer health companies treat the clinician report as a product, but Culprit should not copy the paywall.
- The "<3 times excluded" rule is a frequency floor. For Culprit it is unsafe on red flags (n=1 escalates) and acceptable only for non-safety heatmaps, with the rule printed on the page.
- The 24-hour edit-then-freeze window is a concrete precedent for the snapshot immutability that the AI-written-report brief says the spec defines and v55 does not store.

### B7. Guava Health: visit type sets the content, and an AI drafts the summary

**Visit Prep** `[fetched, 2023-03-10 announcement]`
- Step 1: "You can choose from five different types of doctor appointments": New Symptoms, Annual Visit, Follow-up Visit, New Specialist, Other.
- Step 2: "Guava will pull in the onset day, the average severity, and more."
- Step 3: questions, either the user's own or suggested ones.
- Step 4: "compare symptoms, lifestyle, cycle, meds, and more on easy-to-digest graphs."
- Step 5: records auto-pulled (meds, conditions, allergies) and editable.

**Auto Prep** `[snippet, 2023 post]`: "our AI-powered assistant will generate an initial version of a Visit Prep summary based on your answers to a few questions". Free for one visit, unlimited on Premium (pricing as of 2023).

**Symptom report** `[fetched]`: "choose your desired date range, and decide whether to include photos and Body Map data."

**Marketing page** `[fetched]`: symptoms are translated "into doctor-friendly terms" (frequency, onset, severity). The summary can be downloaded, sent or printed.

**Provider dashboard** `[fetched, vendor]`
- Self-serve tier: $90 a month for 15 patients, then $3–6 per patient.
- "Key changes and trends are surfaced automatically".
- The "Guava Assistant" explores data and "generate[s] reports". Labs are extracted from PDFs.
- "Used by 200,000+ patients" (vendor claim).

**Complaints** `[snippet, Trustpilot]`: "providers have really appreciated my appointment prep summaries", but "the biggest issue is accuracy … significant discrepancies in my health data".

### B8. GI and elimination diets: Monash FODMAP, mySymptoms, Cara Care

**Monash FODMAP**
- Reintroduction: "Start smaller and increase serve size incrementally across the 3 days", one FODMAP group at a time on a low-FODMAP background diet. Minor symptoms that don't disrupt daily life count as a pass `[fetched, 2020 blog]`.
- Results feed back into **filters**: a slider to the "red unhappy face" hides foods by tolerance `[fetched, blog 2026-02-27]`.
- Export on Android: "Select the dates you want to include, then generate the report by pressing 'Preview'", then "Save as PDF". On iOS the user taps the tick and then shares `[fetched, help page]`.
- "The data is time stamped, saved indefinitely and you can export the data in a time frame of your choice"; on iPhone, Apple Mail must be the default mail app `[snippet]`.

**mySymptoms** `[snippet]`: "securely share your diary with your clinician through our dedicated Clinic web app"; a PDF or CSV export; "top food suspects" and a symptom-versus-food correlation graph.

**Cara Care** `[snippet]`: "share your data with your doctor and export the data as a file"; food on the best and worst IBS days; the IBS version is a reimbursable German DiGA. No report layout was found.

**What the research found** (Schroeder 2017, Zia 2017, TummyTrials 2017): see `2026-10-vet-report-overlaid-timelines.md` §1.6. Providers reading the same IBS journals agreed at α = 0.07, and "no evidence" was read as "not a trigger".

**Relevance** `[inferred]`: the human elimination-diet tools are structured around a **challenge protocol** (dose, days, pass/fail). Their reports are diaries, not challenge result sheets. No human tool found prints "challenge X: dates, dose steps, symptom days during versus before." That is open space, and it maps onto a vet's rechallenge step.

### B9. Diaries in migraine, epilepsy, long COVID and general tracking (listing grade)

**Migraine Buddy** `[snippet]`: "an easy to read summary report … to send to their doctor, employer, or insurance company". Contents per a listing: frequency, triggers, medication use, weather correlations. No layout documentation was found. Headache medicine counts in days (ICHD-3 medication-overuse threshold of 15 or more days a month; see the overlaid-timelines brief).

**Epsy** `[snippet, App Store]`: "share overview information with your healthcare team". A user complaint: no field for seizure length. No PDF or portal confirmed.

**Visible** `[snippet]`: "Download long-term health reports … and share them with your doctor". Complaints: "you can't get a full report until you've been tracking for a month", and lost data after a support fix.

**Bearable** `[snippet, help pages]`
- Export is a data file covering 3 months, 6 months or all time.
- Free users can export CSV "for manual analysis (e.g. in Excel) or using AI tools (e.g. ChatGPT)".
- Its advice for appointments is to **"screengrab relevant trends & impacts reports"**.
- PDF export is listed as a possible future improvement.

**Flaredown** `[snippet]`: CSV export; a developer case study claims weekly visual reports.

**Relevance** `[inferred]`: in most of the chronic-illness long tail, the clinician gets screenshots or a CSV, and there is no designed report at all. A designed, clinician-grade report is still rare in consumer tracking.

### B10. Kardia (AliveCor)

`[snippet]`
- Each recording can be printed or saved as a PDF and emailed.
- Determinations (for example, possible AF) are "only potential findings".
- In the cleared workflow, the provider "can review the ECG for rhythm and measure the QT interval".
- KardiaPro is a paid clinician tier for remote monitoring and reports.
- NICE MTG64 recommends the single-lead device for suspected paroxysmal AF, citing 6 comparative studies including 3 RCTs and a cost saving of £13.22 per patient. Guidance was withdrawn from December 2022 to July 2023 while the company met DTAC.

The manual PDFs returned 404 or 503, so the PDF layout is unverified.

**Relevance** `[inferred]`: the PDF carries a raw trace the clinician measures for themselves, and the device's verdict is labelled as a potential finding. This is the human precedent for Culprit's "AI read · unconfirmed" badge next to the photo, which the vet judges.

### B11. Owner trackers vets already hand out: Zoetis Apoquel and Cytopoint

**Apoquel itch symptom tracker (2026, US)** `[fetched PDF]`
- **Screen:** four yes/no statements. "If you checked 'yes' to any of these statements, your dog may be suffering from allergic itch".
- **Grid:** 14 day columns against a six-rung scale (0, 20, 40, 60, 80, 100) with behavioural anchors:
  - "VERY MILD: A TINY ITCH: Scratching is rare. Only slightly itchier than normal."
  - "MODERATE: A MEDIUM ITCH: Regular scratching while awake. May occasionally wake at night, but doesn't interfere with eating or playing."
  - "SEVERE … disrupting your dog's sleep, eating, and play."
- **Instruction:** "Bring this tracker to your next vet visit to show how their symptoms have progressed over time."
- **Also on the page:** a checklist of what to bring (the tracker, "Photos/videos of your dog scratching", treatments already tried) and a product pitch.

**Cytopoint itch tracker (Canada, 2025)** `[fetched PDF]`
- **Cadence:** "Week 1: Rate your dog's itch every day … Weeks 2 to 8: Rate your dog's itch just once a week, on the same day each week."
- **Intervention row:** an **"Injection administered"** row on the same grid, and "When the dots are connected, you and your veterinarian will see the progress during treatment and how long the injection provided relief."
- **Anchors:** these match the published PVAS behavioural descriptors closely. Severe: "Scratching, licking, etc, occur at night and also when eating, playing, or exercising". Moderate: "no scratching occurs when eating, playing, exercising, or being distracted."
- **Quality of life:** two 1–10 rows, "My dog's quality of life" and "My quality of life", running from "Before treatment" through Week 8.

**What powers them** `[snippet, COSCAD'18 abstract; repo]`: the PVAS10 is the owner pruritus instrument in the canine atopic dermatitis core outcome set. COSCAD'18 says OGATE is not validated. The repo already records this (`docs/nyx-diet-trial-requirements.md:621`).

**Relevance** `[inferred, read against repo rulings]`:
- Vets and dermatologists are **already trained to read the behavioural anchors**. Culprit's taxonomy D11 rules out a numeric itch scale and licensed instrument wording, and plans itch **context flags** (at night, woke from sleep, continued despite distraction) that "reconstruct the CCECAI-9 and PVAS tiers" `[repo, docs/nyx-event-taxonomy-requirements.md:38,124]`.
- The trackers show that **the anchor text itself is what vets recognise**, not the number. They also show a **daily-then-weekly cadence** and an **intervention row on the same grid**.

### B12. Vet-validated owner instruments (scoring that powers a report)

**VetMetrica HRQL (dogs)** `[fetched, Davies et al. 2019, PMC6750605]`
- Scores are normalised so that "a score of 50 … represents the score for the age-related average healthy dog".
- A dotted threshold sits at 44.8 (the 30th percentile of healthy dogs).
- A single minimum important difference of 7.7 is applied across domains.
- An individual dog's four domains are plotted over 11 months, annotated at key events such as an IBD flare.
- Rationale: normalised scores "are much more readily interpretable".
- Caveat: the MID "may not apply when the scale is used in specific disease populations". The instrument is licensed and fenced out of the app by D11 `[repo]`.

**CBPI and LOAD** `[snippet]`: CBPI and LOAD are owner instruments for canine osteoarthritis pain, and a COSMIN review found sufficient content validity for both, plus the COI.

**Acute pain scales (clinic-side)** `[snippet]`: these are clinic-scored, not owner-scored.
- Feline Grimace Scale: "≥ 4/10 … likely to be in pain requiring … rescue analgesia"; five action units scored 0–2. An app exists.
- Glasgow CMPS-Feline: intervention at ≥5/20.

**Relevance** `[inferred]`: what vets trust in these instruments is a **published anchor plus an intervention threshold printed beside the score**. That is the shape of "value + reference" (devices D2 and D6). For owner logs it is honest only when the threshold is the instrument's own, which licensing currently rules out.

### B13. IDEXX VetConnect PLUS and CoVet (IDEXX)

**VetConnect PLUS** (2018 release notes) `[fetched]`
- "Some analytes … do not have traditional reference ranges … USG, UPC, PROG. You can now easily graph these analytes and track changes over time".
- "Client-friendly summary" for Fecal Dx.
- "Share results through email or Petly online pet pages".

**VetConnect PLUS** (current pages) `[snippet]`
- The mobile app sends "a PDF of the patient's results to the client or a specialist".
- Trending graphs "normalize across modalities".
- "DecisionIQ" offers interpretive assistance.
- An App Store review says "trending results is not good at all".

**CoVet "IDEXX Lab Data Summary"** `[snippet; help.co.vet returned 503]`
- A structured summary with **"An At a glance section with two to five key findings"**, which the vet reviews before adding to the case.
- It covers IDEXX history only: "does not include non-IDEXX lab results".
- IDEXX announced the CoVet acquisition on 2026-09-16, with planned VetConnect PLUS integration `[snippet, dvm360 and press]`.

**Relevance** `[inferred]`:
- The largest US reference lab already graphs values that have **no reference range**, which is the vet-side precedent for plotting owner counts without a band.
- The newest vet AI layer leads with **2–5 findings**. That is the length a clinic AI will compress Culprit's report to, so the report's own lead should already be that length and that shape.

### B14. RVC Pet Epilepsy Tracker

`[snippet, listings]`
- An export packages "seizure diary, medication diary and medical history" and emails them to the vet.
- The seizure log records type, timing, duration, severity and action taken.
- Owners can opt in to share anonymised data with RVC researchers.
- Built with the Epilepsy Society and Boehringer Ingelheim.
- A reviewer: "My vet loved the reports … You can easily email a PDF of a range of data". Another warns against relying on it as the only record after the app failed to open.

**Relevance** `[inferred]`: this is a rare vet-side precedent of a **university-branded** owner diary report. Its credibility comes from the institution, not the design.

### B15. Machine-readable sharing: SMART Health Links and CMS "Kill the Clipboard"

**CMS provider guide** (last modified 2026-07-30) `[fetched]`
- The patient's QR code is "an encrypted pointer, not the data". It points to "a FHIR bundle or PDF".
- Structured data is FHIR R4 US Core (USCDI v3); unstructured documents arrive as DocumentReference attachments.
- Available in athenahealth, eClinicalWorks (mobile and iPad apps only for now), Epic, MEDITECH, Medplum, NextGen and Parker. Three more EHRs have readers in development.

**KTC profile** `[fetched, ktc-spec.github.io]`
- The Bundle "SHALL contain a Patient resource and at least one additional patient-shared content entry".
- Two optional PDF kinds:
  - **FHIR-Rendered PDF** (LOINC 60591-5): "a complete readable representation of every non-DocumentReference FHIR resource in the same Bundle".
  - **Patient Story PDF** (LOINC 51855-5): "A patient-authored narrative in the patient's own words" that "SHOULD focus on information from the patient's perspective" and avoid restating clinical facts.
- `exp` is **required**. Suggested lifetimes: **5–15 min** for a QR shown on a phone, **24–48 h** for a printed QR for a scheduled appointment, per patient preference for ongoing care.
- The EHR "SHALL supply a `recipient` query parameter", and the patient app logs every access with recipient and timestamp.

**Adoption** `[snippet, TechTarget May 2026 via search]`: more than 60 health systems have signed the pledge.

**Relevance** `[inferred]`:
- No veterinary equivalent exists (machine-readers brief §4).
- Two design ideas carry over without any vet standard: (i) keep the **owner's narrative as its own labelled document**, separate from the rendered record; (ii) make any link **expire and log access**.

### B16. AI layers in human health (for section e)

**ChatGPT Health** `[snippet, OpenAI help and press, 2026]`
- Logged-in US adults can connect Apple Health, hospital portals (via b.well), One Medical and Function.
- Launch post use cases: "review recent test results and get ready for appointments".
- Connected data is not used for training. By default it asks permission before using the data in a reply.

**Claude for Healthcare** (2026-01-11) `[snippet, Anthropic, Fortune]`
- US Pro and Max users can connect HealthEx (portal records), Function, and Apple Health or Android Health Connect (beta).
- It can "summarize medical history … prepare questions for appointments". Opt-in; not used for training.

**Function's AI connectors** `[snippet]`: they pass "a limited, high-level summary of their lab results across 20+ health categories", and "individual lab values are never sent". The doctor-facing artifact is still the performing lab's PDF.

**Epic Emmie (MyChart)** `[snippet]`: reaches out before a visit to learn what the patient wants to cover and "builds the visit agenda for both patient and clinician". It only sees what the patient can already see. Sutter Health went live first.

**Dexcom Stelo Weekly Insights** (2024-12-17) `[snippet, press]`: generative AI on Google Vertex/Gemini replaced a template that gave "largely static text each week". It does not give medical advice and was built under an FDA AI framework. It is aimed at the user, not the clinician.

**Abridge "Linked Evidence"** `[snippet, vendor and trade press]`: clinicians "click on any part of a generated summary and see the exact segment of the source conversation". An internal benchmark reports catching 97% of confabulations against 82% for GPT-4o.

**Clinician evidence**: see section (e).

---

## (c) Ideas worth stealing for a pet vet report, ranked by expected impact

The ranking weighs four things: clinical value to the vet in 60 seconds, survival through a clinic AI summarizer, cost, and conflict with standing rules `[inferred]`. Each idea is tied to its source product. **None is a decision.** Items that touch rulings say so.

1. **A per-category "gaps" sentence written by the generator.** *(LibreView Snapshot Comments; Clarity "Only known insulin doses will display")*
   - **What:** a deterministic line per logged category that states the absence and its denominator, e.g. "No meals logged on 9 of 30 days in this report" or "No medication doses logged after Oct 12."
   - **Why first:** the vet's most dangerous misread of an owner log is "nothing logged" read as "nothing happened". LibreView solves this with a generated sentence beside the data, not a chart, which is exactly what survives text extraction (machine-readers brief §5–6).
   - **Cost:** server-side copy in `generate-report`.
   - **Watch:** the C-3 coverage rule (render only when there are unlogged days); the voice re-pass.

2. **A paste-ready text block for the clinic record.** *(Clarity "Copy as text"; Apple "Scratchpad … summary snippets")*
   - **What:** one plain-text block of the page-1 facts with scope in-line, which the technician pastes into the PIMS note or which a clinic AI reads first. Two human-health platforms ship this because clinicians do not keep the device's report in the chart.
   - **Format:** on the PDF it could be a final "for the record" box. In the app it could be a "copy summary" action in the send flow.
   - **Watch:** the declarative-not-instructional rule from the machine-readers brief §5.
   - **Cost:** low.

3. **A Compare page: before the trial against on the trial, with "new" and "no longer seen" marks.** *(Clarity Compare: two independent ranges; arrows; resolved patterns struck through; NEW icon)*
   - **What:** for the diet-trial wedge, the vet's question is "is it different since the switch?" A two-column page with matching windows, same rows (counts per logged day, days with data, exposures), and directional arrows answers it in one look.
   - **Honesty constraints:**
     - matched window lengths;
     - coverage stated per column;
     - "no longer seen" only above a sufficiency floor, never on n=1 absence;
     - no green ticks.
   - Culprit already computes a window-versus-window "getting worse: not checked, too few days logged to compare" `[repo, render.ts:2124]`, so the engine half exists.
   - **Cost:** medium. It is clinical logic, so the adversarial pass applies.

4. **Hatched, not hidden: a third sufficiency state.** *(Tidepool: hidden under 24 h, striped under 70%, solid above)*
   - **What:** a value computed on thin coverage prints **hatched or greyed with its coverage beside it**, rather than vanishing ("not checked") or printing as solid as a well-covered one. The vet sees there was a signal and how thin it was.
   - **Rule:** red flags always print solid (n=1 escalates). Hatching applies only to rates and comparisons.
   - **Cost:** low on the page. It is a rule question, so it goes to a decision brief.

5. **Print the behavioural itch anchors vets already know.** *(Zoetis Apoquel and Cytopoint trackers; PVAS behavioural descriptors; COSCAD'18)*
   - **Within D11** (no numeric itch scale, no licensed wording) `[repo]`: when the planned itch context flags ship, the report can label each week's itch with the **behavioural descriptor tier** the logs support (e.g. "scratching while awake; stops when eating or playing"), quoted as "from logged context, not a validated score".
   - **Two pieces to copy outright:**
     - the **"Injection administered" row on the same grid**: an intervention row on the outcome grid, which is device D15 already shipped in vet dermatology;
     - the **daily-for-week-1, then weekly cadence**, which suits low-friction capture of a slow outcome.
   - **Cost:** depends on capture. Any change to the itch scale is a PM ruling (D11).

6. **The owner's own story, on its own page, labelled as the owner's.** *(KTC "Patient Story PDF", LOINC 51855-5, kept apart from the "FHIR-Rendered PDF")*
   - **What:** owner notes are currently a toggle (`includeNotes`) `[repo]`. The standard separates the patient's narrative into its own document, "in the patient's own words", and keeps clinical facts out of it.
   - **For Culprit:** one attributed page ("In the owner's words, unedited") instead of notes woven into data rows. This also contains prompt-injection risk (machine-readers brief §5), because free text then sits in one labelled place.
   - **Cost:** low.

7. **Visit purpose sets the page-1 emphasis.** *(Guava Visit Prep: New Symptoms, Annual, Follow-up, New Specialist; Epic Emmie builds a shared agenda)*
   - **What:** Culprit's default cascade *infers* purpose (since last visit, then active trial). One optional question in the send flow, "What's this visit for? Check-up · Something new · Trial follow-up · Specialist", could reorder page 1 without changing any number.
   - **Rule tension:** it adds a decision. It happens at send time, not at the moment of an event, so Principle 1 holds `[inferred]`.
   - **Cost:** medium.

8. **An expiring link with an access receipt, alongside the PDF.** *(Withings HealthLink, 7 days, anonymised; KTC `exp` required, 24–48 h for a printed QR, every access logged; Dexcom codes valid 3, 6 or 12 months; Oura: a PDF "no way to recall")*
   - **What:** keep the PDF as the default (clinic PIMS ingest PDFs). Optionally add a short-lived link or QR that opens the same frozen snapshot and tells the owner "opened by the clinic on Oct 31". The receipt answers "did my vet see it?" and can be revoked, which a PDF cannot.
   - **Cost:** high. It touches RLS and share tokens, so `rls-privacy-reviewer` applies.
   - **Fit:** it fits the frozen-snapshot requirement in the AI-written-report brief.

9. **An edit window, then freeze.** *(Clue: 24 h to edit or hide a cycle, then read-only)*
   - **What:** the artifact the vet received never changes. The owner gets a short window to correct obvious mistakes, after which the stored version is fixed, and a re-send produces a new, dated version.
   - **Fit:** this supplies the policy the spec's immutable snapshot needs.
   - **Cost:** medium.

10. **The clinic pulls, rather than the owner pushes.** *(LibreView Practice ID with automatic upload and clinic conditional flags; Dexcom clinic code; Guava provider dashboard)*
    - **What:** in human health the strongest channel is the **clinic-side connection**: the clinic sees the data before the visit, and the dashboard flags "not uploaded in 4 weeks". For Culprit this is the distribution-channel endgame, a vet who asks every itchy-dog client to connect.
    - **Cost:** very high (a clinic product). Listed for direction, not for v2.

11. **A frequency floor for non-safety heatmaps, with the rule printed.** *(Clue: symptoms tracked fewer than 3 times excluded)*
    - **Use only for** time-of-day or day-of-week distributions.
    - **Never for** red flags or vomit, blood or intake decline, where n=1 must show.
    - Print the rule ("shown only for signs logged 3 or more times") so absence is not read as absence.

12. **Plot what has no reference range, as the lab does.** *(VetConnect PLUS graphs USG, UPC and progesterone "which do not have traditional reference ranges")*
    - Use this as the argument for **trend-without-band** charts for owner counts, citing the vet's own lab tool.
    - Avoid the zone-colour verdict line (sweep anti-pattern).

13. **Lead with 2–5 findings, because the clinic's AI will.** *(CoVet IDEXX Lab Data Summary, "At a glance … two to five key findings")*
    - Shape the page-1 lead as 2–5 count-anchored lines in a fixed order, so the clinic AI's compression **matches** the report's rather than re-deriving it.
    - This reinforces the round-trip brief's "scope on the number's own line".

**Do not steal** `[inferred]`:
- **LibreView "most important pattern" plus "considerations".** Medication and lifestyle suggestions with a disclaimer amount to an assessment; R8 and Principle 6 rule it out.
- **Clarity's "best day".** It is a reassurance device; the n=1 and selection-bias risk is obvious.
- **Clue's paid report.** It breaks Pets > $.
- **Bearable's "screengrab".** It is the absence of a report.
- **mySugr's silent week-snap.** It would widen the window without saying so.
- **InsideTracker- or Dexcom-style colour-coded verdict lines.** These are already in the sweep's anti-patterns.

---

## (d) Best generation and share flows: concrete patterns

**Range selection**
- **The default is a fixed recent window**, nearly everywhere: Clarity 14 days, LibreView 14 days, Oura 7/30/90, Withings up to 3 months, Clue the last six cycles `[fetched/snippet]`.
- **Presets plus custom dates** is the norm. Clarity offers "recent numbers of days" or custom; Bearable 3 months, 6 months or all time; Monash and Guava a custom start and end `[fetched/snippet]`.
- **Domain-shaped windows** beat calendar windows where the domain has its own unit: Clue uses cycles; Cytopoint uses week 1 daily and then weeks 2–8; Monash uses 3-day challenges `[fetched/snippet]`.
- **"Since last visit" was not found as a shipped preset** in any human or vet consumer report checked `[snippet: absence across ~10 products and one targeted search]`. The nearest is Glooko's clinic-side "Last Clinic Visit Date" filter and Pre/Post tab `[snippet]`. **Culprit's default cascade (since last visit, then active trial, then 90 days) appears to be ahead of the field** `[repo + inferred]`.
- **Two ranges at once** (Clarity Compare) is the only shipped "before / after" range model found `[fetched]`.
- **Disclosure of what a custom crop left out** was not found anywhere else. Culprit's custom-range disclosure is ahead `[repo + inferred]`.

**Preview and customisation**
- **Preview before share:** Withings ("review its contents"), Monash ("Preview") and Clarity's interactive reports before print `[snippet/fetched]`. Culprit previews in-app `[repo]`.
- **Section picking:** Clarity requires "Select at least one report"; Guava offers optional photos and body map; Clue offers optional personal fields `[fetched/snippet]`. Section-level toggles are common for *what* goes in, but no product lets the owner drop a *finding*.
- **An edit-then-freeze window:** Clue, 24 h `[snippet]`.
- **Visit-type templates:** Guava `[fetched]`.

**Send targets**
- **A PDF through the share sheet or email is the universal floor**: Oura, Withings, Whoop, Monash, mySugr, Kardia, Clue, RVC `[fetched/snippet]`.
- **A clinic-side portal** where the clinic already has an account: Clarity (clinic code), LibreView (Practice ID, auto-upload), Guava provider dashboard, KardiaPro, mySymptoms Clinic web app `[fetched/snippet]`.
- **An expiring link:** Withings HealthLink 7 days; Dexcom codes 3/6/12 months; KTC `exp` required, with lifetimes tied to the setting `[snippet/fetched]`.
- **A QR at check-in carrying structured data plus a readable PDF:** SMART Health Links / KTC, which needs an EHR reader; the human side has seven EHR vendors live `[fetched]`.
- **Inside the EHR, not as a document:** Apple Share with Provider. The clinician copies snippets `[fetched]`.

**Scheduled or automatic**
- Automatic *upload* to the clinic (LibreView, Clarity sharing, Apple daily) is common. Automatic *report generation* before a visit was **not found** shipped in these products. Epic Emmie's pre-visit agenda is the nearest, and it is AI and conversational `[snippet]`.
- Oura's and Whoop's monthly and periodic reports are aimed at the user, not the clinician (sweep) `[fetched earlier]`.

**Flow patterns worth copying** `[inferred]`:
- **"Choose range, then preview, then pick sections, then share"** as one screen (Clarity, Withings). Culprit has range, preview and a notes toggle already.
- **One "what this report will tell the vet" line at send.** Culprit's send-moment lines (R-16) are already ahead of everything found `[repo]`.
- **A receipt.** Nothing that sends a PDF tells the owner whether the clinic opened it. KTC's access log is the only precedent `[fetched]`.

---

## (e) AI on top of a report: what actually ships, and what clinicians say

**What ships: four distinct shapes** `[fetched/snippet as marked in B16, B2, B13]`

1. **Rule-based "insights" printed on the clinician report** (no LLM): LibreView Comments, Glucose Pattern Insights with "most important pattern" plus considerations and a disclaimer, and Clarity Patterns with considerations. These are the **only** machine-written text found *on* a regulated clinician-facing patient report.
2. **LLM text aimed at the user, kept off the clinician report**: Stelo Weekly Insights (Gemini) and Guava Auto Prep (a draft the user edits). The clinician sees the user's edited prep, or nothing.
3. **"Chat with your data", consumer side**: ChatGPT Health, Claude connectors, Guava Assistant. Function sends only a "high-level summary", never individual values, through its AI connectors. The **clinician-facing artifact stays the lab's PDF**.
4. **Clinic-side LLM over incoming documents**: CoVet "At a glance" (2–5 findings), ScribbleVet Record Review with chat over uploaded documents, Vetspire, Provet. All carry a "review before filing" rule. Abridge's Linked Evidence ties every summary span to its source.

**Read** `[inferred]`: across human health, **no product found ships an LLM-written narrative on the clinician-facing patient report itself**. Machine text on the report is rule-generated. The LLMs sit on the patient's side (prep, chat) or the clinician's side (summarise what arrived). This matches the prior brief's conclusion that "the differentiator is the rules". It also confirms that the clinic's AI will be the one writing the narrative from Culprit's PDF.

**What clinicians say**
- **Pre-visit AI preparation helps preparation; time savings are unproven.**
  - Google AMIE at Beth Israel Deaconess (2026; 44 visits): physicians said reviewing the AI transcript or summary helped them prepare in 75% of cases and may have influenced their approach in 57%. It was rated "somewhat harmful" once `[snippet, HMS news; arXiv 2603.08448]`.
  - JAMIA Open 2025 (17 clinicians): average chart review time fell from 3 min 22 s to 3 min 4 s. Among heavy reviewers, 55% said the summaries improved understanding and saved time `[snippet]`.
- **New since 2026-10-11: the first RCT of AI summaries given to patients before a specialist consult.**
  - AI-INFOCARE (Dresden neurosurgery; NEJM AI, 2026-10-15; 300 patients, 17 physicians; May 2025 to January 2026). Patients received plain-language AI summaries of their own records before a first consultation.
  - Median consult time fell from **33 to 25 minutes** with no reported loss in perceived information quality.
  - Patients felt better informed. Physicians found the conversations "slightly more demanding" (not significant).
  - **No accuracy data was reported.** The last author co-founded the summary vendor `[fetched, TU Dresden news 2026-10-23]`.
  - For Culprit `[inferred]`: this is the closest evidence that a *summary the patient brings* can shorten a visit. It concerns the patient's understanding, not a document the clinician relies on.
- **Patients now bring AI text.**
  - Tebra survey (211 US providers, February 2026; vendor survey): 38% say patients regularly bring ChatGPT-generated summaries; 64% say it raises misinformation risk; 52% support it as a question-prep tool `[fetched]`.
  - Dermatology pilot of ChatGPT after-visit summaries: 10 of 53 (19%) needed physician edits for incorrect or incomplete content `[snippet]`.
- **New since 2026-10-11, veterinary.** BVA launched a member-only AI toolkit (announced 2026-10-26). Survey figures as reported: vets estimate about **one in seven clients** use AI in caring for their animals, and about **two-thirds** of vets surveyed said clients had used AI to diagnose a problem. The toolkit includes guidance for conversations where "a vet's diagnosis … differs from an AI tool's suggestion" `[fetched, single trade-press source (Zenopa); not confirmed on bva.co.uk]`.
- **Vet practices' AI readiness.** Digitail and AAHA (2026-10-01): "nearly half have no AI strategy", and the average AI maturity is 2.67 out of 4 `[snippet]`.
- **Patient-generated data in general** (Brückner et al., npj Digit Med 2025, 33 studies): views are mostly positive. Persistent concerns are reliability, security and **workload when the data is not integrated** into the record `[snippet]`. This is the human-side version of the vet "staff hassle" barrier in the distribution-channel brief.

**Other new items since 2026-10-11 relevant to the vet side**
- **PETKIT TRACE** (announced 2026-10-29): an "AI-powered pet health data platform" connecting feeder, fountain and litter-box data "with veterinary expertise" `[snippet; press release 403]`. It builds on Kitbo (2026-08-18), whose health report "pet parents can share with their vet" (AI-written-report brief §4.1). No vet-facing report layout was found. **A competitor to re-check before v2 ships.**
- **CoVet** published "How to Summarize Veterinary Medical Records Before the Consult" (dated 2026-10-05, just before the window) `[snippet]`.
- **No new clinic-AI capability for client PDFs** was found dated 2026-10-11 to 10-30. Provet's PDF-aware history summary remains the 2026-08-06 release; this pass confirmed the release page names no regional limit `[fetched]`.

---

## Research debt (not done this pass)

- Clue, Withings, Tidepool, CoVet and Kardia help pages blocked fetches (403/503/404). Their flow details are snippet grade.
- Migraine Buddy, Epsy, Visible, Cara Care and mySymptoms report layouts: no first-party documentation was found. Installing the apps and generating a sample report is the only way to verify.
- Sample PDFs of any human diary report printed in black and white: none were obtained.
- Glooko automatic pre-visit reports: not found. A Glooko clinic IFU (docs.glooko.com, Web 25.4) was listed but not read.
- No study was found of clinicians' use of *app-generated* (non-CGM) patient reports beyond the AGP literature (Mullen 2025: 17 clinicians; small, developer-affiliated).
- The BVA toolkit and survey figures come from one trade article.

---

## (f) Sources

All accessed 2026-10-30. The grade is the best grade obtained.

**CGM and diabetes**
- Dexcom Clarity User Guide for Clinics (EU PDF): https://productstore.clarity.dexcom.eu/Documentation/en/Dexcom_Clarity_User_Guide_Clinic.pdf [fetched]
- Dexcom CLARITY Patient Guide to Reports LBL017270: https://www.teladochealth.com/content/dam/tdh-www/us/en/documents/helpcenter/LBL017270-Dexcom-CLARITY-Patient-Guide-to-Reports.pdf [fetched]
- Dexcom FAQ, sharing Clarity reports (IE): https://www.dexcom.com/en-ie/faqs/how-can-i-share-my-clarity-reports-my-healthcare-professional [fetched]
- Abbott LibreView HCP Detail Aid (IE): https://pro.freestyle.abbott/content/dam/adc/pro/countries/ie-en/documents/DIGITAL,%20IE%20LibreView%20HCP%20Detail%20Aid.pdf [fetched]
- Tidepool summary data docs: https://dev-docs.tidepool.org/docs/summary-data [fetched]
- Tidepool support, dashboard statistics and population dashboard: https://support.tidepool.org/hc/en-us/articles/10388460078996-How-Dashboard-Statistics-are-Calculated · https://support.tidepool.org/hc/en-us/articles/10376696872852-Navigating-the-Population-Health-Dashboard [snippet]
- mySugr support, import and export: https://mysugr.com/support/en/can-i-import-and-export-data [snippet]
- Glooko Population Tracker: https://support.glooko.com/hc/en-gb/articles/4409609004563-What-is-Glooko-Population-Tracker [snippet]
- Dexcom Stelo generative AI press release: https://investors.dexcom.com/news/news-details/2024/Dexcom-Launches-the-First-Generative-AI-Platform-in-Glucose-Biosensing/default.aspx [snippet]
- AGP qualitative study (Mullen et al. 2025): https://scholarlycommons.henryford.com/endocrinology_articles/179 [snippet]

**Platform and wearable reports**
- Oura shareable report blog: https://ouraring.com/blog/share-report-feature/ [fetched]
- Oura support, Shareable Reports: https://support.ouraring.com/hc/en-us/articles/360025441594 [snippet]
- Withings support, Health Report and HealthLink: https://support.withings.com/hc/articles/360004485358 · https://support.withings.com/hc/en-us/articles/360024568873-BPM-Connect-Sharing-data-with-my-doctor [snippet; 403]
- Whoop Heart Screener: https://www.whoop.com/us/en/thelocker/heart-screener · community: https://www.community.whoop.com/t/how-can-i-share-my-ecg-results-with-my-doctor/450 [snippet]
- Apple, Health app data Share with Provider FAQ: https://support.apple.com/en-bh/guide/healthregister/apd531bc6215/web [fetched]
- MacRumors, sharing the medications list: https://www.macrumors.com/how-to/share-medications-list-health-ios/ [snippet]
- Apple scales back the AI health coach (Feb 2026): https://www.iclarified.com/99859/apple-scales-back-standalone-ai-health-coach-will-fold-features-into-health-app-report · https://news.bgov.com/artificial-intelligence/apple-is-scaling-back-plans-for-ai-based-health-coach-service [snippet]

**Symptom and diary apps**
- Clue help: https://support.helloclue.com/hc/en-us/articles/37230173214237-What-is-the-report-for-my-doctor · https://support.helloclue.com/hc/en-us/articles/37230262486685-What-kind-of-data-is-shown-in-the-report [snippet; 403]
- Guava: https://www.guavahealth.com/prepare-for-visits · https://guavahealth.com/news/visit-prep-summary-announcement · https://guavahealth.com/article/tracking-and-visualizing-symptoms-in-guava · https://guavahealth.com/provider-dashboard [fetched]; Auto Prep: https://guavahealth.com/news/enhancing-doctor-visits-guava-ai-powered-auto-prep [snippet]; Trustpilot: https://se.trustpilot.com/review/guavahealth.com [snippet]
- Monash FODMAP: https://monashfodmap.com/get-app-help/ · https://monashfodmap.com/blog/reintroduction-using-diary-function · https://monashfodmap.com/blog/interpreting-reintroduction-challenges/ [fetched]
- mySymptoms App Store: https://apps.apple.com/us/app/id405231632 [snippet]
- Cara Care App Store and DiGA: https://apps.apple.com/app/apple-store/id1133687886 · https://www.mobihealthnews.com/news/emea/berlin-based-cara-care-app-approved-german-diga [snippet]
- Bearable support: https://bearable.app/support/common-questions/how-to-share-data-with-a-doctor-therapist-or-other-medical-team-member/ [snippet]
- Migraine Buddy App Store: https://apps.apple.com/ie/app/migraine-buddy/id975074413 · https://www.cefaly.com/blog/migraine-buddy-review [snippet]
- Epsy App Store: https://apps.apple.com/us/app/id1479108189 [snippet]
- Visible App Store: https://apps.apple.com/us/app/visible-pacing-for-illness/id1624474919 [snippet]
- Flaredown: https://appfollow.io/ios/flaredown-for-chronic-illness/982963596?country=gb · https://litslink.com/chronic-illness-tracking-app [snippet]
- Kardia FDA 510(k) K210753: https://fda.innolitics.com/submissions/CV/subpart-c—cardiovascular-monitoring-devices/DXH/K210753 [snippet]; NICE MTG64: https://nice.org.uk/guidance/MTG64/chapter/1-Recommendations [snippet]

**Veterinary**
- Zoetis 2026 Apoquel Itch Tracker (US): https://assets.contentstack.io/v3/assets/blt6f84e20c72a89efa/blta7e5771fdd01a57b/69dd77191ea2b4994e58c221/2026-Apoquel-Itch-Tracker-US.pdf [fetched]
- Zoetis Cytopoint Itch Tracker (CA, 2025): https://www.zoetispets.com/_assets/pdf/en-ca/cytopoint_itch_tracker_eng_2025.pdf [fetched]
- COSCAD'18 (Olivry et al. 2018): https://pmc.ncbi.nlm.nih.gov/articles/PMC6097451 [snippet]
- VetMetrica outputs (Davies et al. 2019): https://pmc.ncbi.nlm.nih.gov/articles/PMC6750605/ [fetched]
- CBPI Italian validation: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8484962/ [snippet]; COSMIN review of OA owner measures (via search) [snippet]
- Feline Grimace Scale FAQ: https://felinegrimacescale.com/copy-of-frequently-asked-questions [snippet]; feline pain tools table: https://pmc.ncbi.nlm.nih.gov/articles/PMC10845386/table/table2-1098612X211066268 [snippet]
- IDEXX VetConnect PLUS release notes (2018): https://www.idexx.com/files/vc-plus-release-notes.pdf [fetched]; QRGs: https://idexx-prod-base.django-aws.idexx.com/files/vcplus-web-qrg.pdf · https://idexx-prod-base.django-aws.idexx.com/files/vcplus-mobile-qrg.pdf [snippet]
- CoVet IDEXX Lab Data Summary help: https://help.co.vet/en/articles/15850012-using-idexx-lab-data-summary-in-covet [snippet; 503]
- IDEXX acquires CoVet: https://www.dvm360.com/view/recent-acquisitions-idexx-buys-covet-the-farmer-s-dog-acquires-woof [snippet]
- ScribbleVet Record Review: https://intercom.help/scribblevet/en/articles/11795903-record-review-feature [snippet; 404 on fetch]
- RVC Pet Epilepsy Tracker: https://apps.apple.com/gb/app/id992917809 · https://www.bluestacks.com/campaign/com.rvc.phonegap/en [snippet]
- WSAVA nutrition guidelines and toolkit: https://wsava.org/global-guidelines/global-nutrition-guidelines/ [snippet]; the form itself is in the September sweep
- Provet release, August 2026: https://www.provet.com/release-log/more-room-to-work-august-2026 [fetched]
- BVA AI toolkit (Zenopa, 2026-10-28): https://zenopa.com/news/bva-launches-ai-toolkit-to-tackle-client-self-diagnosis [fetched]
- Digitail and AAHA 2026 benchmark: https://digitail.com/blog/digitail-and-aaha-release-2026-veterinary-ai-benchmark-study/ [snippet]
- PETKIT TRACE press release (2026-10-29): https://globenewswire.com/news-release/2026/10/29/3391517/0/en/petkit-unveils-petkit-trace-an-ai-powered-pet-health-data-platform-on-national-cat-day-for-a-more-connected-future-of-pet-care.html [snippet; 403]
- CoVet blog listing: https://co.vet/post/ai-vet-tools/ [snippet]

**Standards and interoperability**
- CMS Provider Kill the Clipboard Guide: https://www.cms.gov/initiatives/health-technology-ecosystem/overview/health-tech-ecosystem-categories/provider-kill-clipboard-guide [fetched]
- KTC profile: https://ktc-spec.github.io/ [fetched]
- SMART Health Cards and Links IG: https://hl7.org/fhir/uv/smart-health-cards-and-links/links-specification.html [snippet]
- Flexpa, SMART Health Links: https://www.flexpa.com/docs/smart-health-links [snippet]

**AI layers and clinician evidence**
- OpenAI, Health in ChatGPT: https://openai.com/index/health-in-chatgpt/ · https://help.openai.com/en/articles/20001036-health-in-chatgpt [snippet]
- Anthropic, Claude for Healthcare: https://anthropic.com/news/healthcare-life-sciences · https://fortune.com/2026/01/11/anthropic-unveils-claude-for-healthcare-and-expands-life-science-features-partners-with-healthex-to-let-users-connect-medical-records/ [snippet]
- Function connectors: https://claude.com/connectors/function · https://functionhealth.com/faq-categories/my-results [snippet]
- Epic Emmie: https://www.epic.com/software/emmie · https://www.beckershospitalreview.com/healthcare-information-technology/ehrs/sutter-health-1st-to-adopt-epics-ai-chatbot-for-patients/ [snippet]
- Abridge Linked Evidence: https://hitconsultant.net/2025/08/21/abridge-outlines-approach-to-eliminating-ai-hallucinations-in-clinical-notes/ · https://www.abridge.com/blog/building-trusted-healthcare-ai [snippet]
- AMIE real-world study: https://hms.harvard.edu/news/real-world-study-patient-facing-ai-primary-care · https://arxiv.org/pdf/2603.08448 [snippet]
- AI encounter summaries, JAMIA Open 2025: https://academic.oup.com/jamiaopen/article/8/5/ooaf096/8245794 [snippet]
- AI-INFOCARE, NEJM AI 2026 (TU Dresden news, 2026-10-23): https://tu-dresden.de/med/mf/die-fakultaet/newsuebersicht/dresdner-forschende-zeigen-nutzen-ki-generierter-befundzusammenfassungen-fuer-arztgespraeche?set_language=en [fetched]
- Tebra, ChatGPT Health and provider trust: https://www.tebra.com/theintake/healthcare-reports/inside-chatgpt-health-patient-provider-trust [fetched]
- ChatGPT dermatology after-visit summary pilot: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10869927/ [snippet]
- PGHD attitudes systematic review (npj Digit Med 2025): https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11955519/ [snippet]

**In-repo, read this pass** `[repo]`
- `app/report.tsx:23–72, 114, 426`: range cascade, custom disclosure, send-moment lines, notes toggle, share sheet
- `constants/eventTypes.ts:104`: `itch` has `hasSeverity: false`
- `docs/nyx-event-taxonomy-requirements.md:38, 124`: D11 licensing fence and itch context flags
- `docs/nyx-diet-trial-requirements.md:621`: COSCAD'18 note
- `supabase/functions/generate-report/render.ts:2124`: window-comparison "not checked" line
