# Intake, interventions and outcomes on one time axis: precedents, reading evidence, honest overlays, time-of-day views and print density

**Date:** 2026-10-11 · **Status:** 🧊 Frozen evidence, re-verify at use. Corrections land additively in a dated §V addendum with inline ⚠ pointers (the CUL-671 convention). Consumer-app claims here are listing grade or weaker, and products move fast. Check them again before anyone cites them.

**Commissioned for:** the PM's direction on the vet report PDF, verbatim: *"Right now there are so many words on the page… I would love to let the data tell the story. A new and improved vet report might just have more graphs. There's so much going on and all of this is interacting at once. It would be really interesting to have some sort of stacked graph, or something that would show: here is food intake, here is that overlaid with vomit incidents, or here is a medication window and how it directly impacts recorded incidents like vomits or other incidents. Lead with the data, graph heavy."*

**What this brief adds to prior work.** The September sweep catalogued 22 devices (I1 §7). Three of them are the ones the PM's direction stacks together: D3 (small multiples at one scale), D13 (the coverage strip) and D15 (an intervention rule on a timeline). The AGP was covered as a trust precedent (I2 §5.2). Mock round 1's lead direction was "the record strip": one shared axis carrying symptom lanes, intervention spans, exposure ticks, coverage pips and weigh-in dots. The cold read kept the shape and flagged its honesty leaks (I3, addendum). This brief does not repeat any of that. It asks five narrower questions about overlaid, multi-lane timelines specifically:

1. What precedents exist, and how were they evaluated?
2. How do clinicians read these displays?
3. How do you overlay them honestly?
4. When does a time-of-day view help?
5. How many lanes fit, and how dense can they be, on a faxed US Letter page?

**Method.** One isolated research pass made about 115 web and API calls on 2026-10-11. Most of the evidence came from peer-reviewed papers, read in one of four ways:

- **PDFs:** about 25 were downloaded and their text extracted locally (`pdftotext`).
- **Abstracts:** about 40 were read verbatim through the Europe PMC, Crossref and OpenAlex APIs.
- **First-party product documents:** the Dexcom Clarity clinic user guide, Abbott's AGP sample and LibreView HCP aid, the JMP Clinical swimmer-plot help page, the R `Hmisc` event-chart reference, and the WHO Labour Care Guide user's manual.
- **Repo files:** the four internal documents listed as I1–I5.

No app was installed, no export was generated, and nothing was faxed or photocopied. Layout claims about consumer products are therefore listing grade at best.

**Evidence tags.**
- **[E]** means the claim was checked against a source fetched this pass: a PDF, an abstract read verbatim through an API, a first-party page, or a repo file.
- **[A]** means a reasoned assumption, an inference, or a calculation.
- **[A·snippet]** means the claim rests only on a search-result excerpt, because the page itself returned 403 or 503 or could not be reached. Treat it as an assumption until someone fetches the page.

Each piece of evidence carries its study design and *n*. No universal negatives: every absence below reads "none of the N checked."

**Not a decision.** This brief carries evidence and research debt. Reconciling it with Principle 6, the September interviews and the CUL-847 decision briefs is the spec phase's job.

**Fetch failures.** These were substituted or downgraded:
- Tidepool help centre: 403, and empty bodies via curl.
- Clue's "report for my doctor" article: 403.
- Seizure Tracker's own help page, and the ANU review entry about it: 503.
- HAL (Isenberg et al.): blocked by bot protection. The abstract was read through OpenAlex instead.
- Sultanum et al. CHI 2018 PDF: 404. A University of Toronto news page was used instead.
- The NC Dental Board ADSA sedation-record PDF: failed TLS verification, then 503. It was not read, and TLS verification was never disabled.
- BMJ, Stone 2002: 403. The 2003 full-length abstract was used instead.
- Eaton et al. 2005: no open copy. Its findings are read through Song & Szafir's related-work section.
- van Wijk & van Selow 1999 and Goldberg & Helfman 2011: not reached. They are cited from citation records or snippets only.

---

## Executive summary

1. **The shared-axis, many-lane chart is an old and well-tested form.** It wins on *temporal* questions:
   - LifeLines beat a table on interval and cross-category questions (n=36) [E].
   - A medication timeline raised physicians' accuracy on "past prescriptions" from 17% to 91% and on "length of prescription" from 44% to 93% (n=23, underpowered) [E].
   - Aligning records on a sentinel event made complex tasks 62–65% faster (n=20 non-clinicians) [E].
   - A task-specific ICU display cut errors per provider from 2 to 0.5 (n=20) [E].
2. **For deciding what to *do*, short descriptive text beat trend graphs in both neonatal ICU trials, at equal speed (n=40; n=35).**
   - The graphs carried event markers. The texts averaged 135 words and were written *without interpretation* [E].
   - Most staff still preferred the graphs [E].
   - Preference is not performance. In another study, the display format alone moved physicians' correct trial-stopping decisions from 43% to 82% (n=34) [E].
3. **Putting things on one axis invites causal reading.**
   - LifeLines2's own example: a steroid prescription that coincides with an asthma entry gets read as "prescribed for asthma" [E].
   - Trained postgraduate analysts "saw" an intervention effect in 16–84% of AB charts that had none (n=37) [E].
   - A two-bin before/after aggregation produced the highest causal ratings of all (crowdsourced, n≈129 and 136) [E].
   - The title or label steers what readers remember (100 per condition) [E].
   - Eight GI providers reading the same food-and-symptom journals agreed at Krippendorff's α = 0.07 [E].
4. **Separate lanes beat superposition for clinicians.**
   - Overlapping blood-pressure and heart-rate graphs were slower and more error-prone than separate graphs, even for nurses trained to read the overlap [E].
   - Split-space layouts win dispersed comparisons and scale better past eight series (n=16) [E].
   - Dual-axis evidence is thin. ONS shows that the choice of axis can manufacture crossings that are not in the data [E].
5. **Readers treat absence as zero unless the design says otherwise.**
   - People "interpreted confidently even when critical data was missing" (Eaton et al. 2005, as summarised by Song & Szafir [E]; n=30 per a 2024 survey [A·snippet]).
   - Song & Szafir's design rationale: removing missing data from a bar chart "is indistinguishable from zero values." In their crowdsourced study (n=303), highlighting missing values beat removing them on perceived data quality [E].
   - The honest precedents state coverage first: the AGP's "% Time Sensor is Active", Clarity's "Days with data (≥50% readings)" and the connected-pen AGP's "number of days with bolus doses recorded" [E].
   - They also force explicit negatives: the WHO Labour Care Guide records "N = No" every hour; the ICIQ bladder diary has a "Not done" code; a medication administration record (MAR) circles the initials for a refused or missed dose [E].
6. **Diaries undercount and backfill.**
   - Video-EEG caught seizures that patients failed to document 55.5% of the time (n=91 inpatients) [E].
   - Paper-diary patients claimed 90% compliance; actual compliance was 11% (instrumented binders) [E].
   - So a blank day in an owner's log means no record, not no event [A].
7. **A time window that is only bounded (for example, "found at 07:44, last seen 04:00") reads best as an error bar or a lighter "ambiguation" region (n=73) [E].** But clinical experts read displayed intervals as *certain durations* [E]. A drawn window can therefore be mistaken for "vomiting from 04:00 to 07:44" [A].
8. **Time-of-day views.**
   - Linear 24-hour charts beat radial ones: read-value error was 14% against 41% (n=92) [E].
   - Aligning records on an event (a meal) is the tested way to answer "within X of Y" [E].
   - Diabetes reports that aggregate by hour or meal print the *n* behind every cell [E].
   - No study was found that compares time-of-day views with calendar views for clinicians.
   - At 70 days across 170 mm, 30 minutes on a calendar axis is 0.05 mm wide [A]. Latency questions therefore need their own aligned view, and a free-fed pet cannot be aligned to meals at all [A].
9. **Lane-count limits.**
   - Correctness falls and time rises as concurrent series go from 2 to 4 to 8 [E].
   - Short-term capacity is about four chunks [E].
   - *Removing* derived rows made an observation chart faster and more accurate (n=47) [E].
   - Line-chart accuracy held down to about 24 px (6.8 mm on screen) and degraded below it [E].
   - The WHO Labour Care Guide holds 12 hourly columns per form and then starts a new form [E].
10. **Print and fax geometry.**
    - Standard fax is 1-bit black and white, with 3.85 scan lines per mm vertically (0.26 mm per line) and about 8 pels per mm across [E].
    - Lines thinner than 0.5 pt "may not print" [E].
    - A 0.5 pt horizontal rule is 0.68 of one standard-fax scan line [A·computed].
    - On a 170 mm plot, 70 days is 2.4 mm per day and 90 days is 1.9 mm per day. That is enough for ticks and stacked dots, but not for grey tints [A·computed].
11. **Swimmer plots and event charts are the clinical-trial precedent for one lane per subject.** They use bars for exposure, symbols for events, arrows for "ongoing", and a change of line type for a state that changes over time [E]. No reading-accuracy evaluation of either was found. The trial-harms consensus says to keep the crude numbers beside any plot [E].
12. **Consumer diary exports cannot be verified.** Seizure Tracker, Migraine Buddy, mySymptoms, Cara Care, Monash FODMAP, Clue, EczemaWise and the IBD apps publish no layout, no missing-data rule and no evaluation that this pass could fetch. "Digestly" was not found [A·snippet / E].
    - The best-documented human analog is the connected-pen AGP: two pages of daily glucose profiles with insulin timing overlaid, plus a count of days with doses recorded. It is an expert consensus with no reader study [E].

---

## 1. Precedents: intake or exposures, interventions and outcomes on one time axis

### 1.1 The Shneiderman group's lineage

**LifeLines (Plaisant et al., CHI '96; medical version, AMIA '98).**

- **Lanes and encoding.** The record is split into *facets*, each "shown as regions of the screens distinguished by alternating background colors." Inside a facet, "stories or aspects are lines, periods correspond to changes of size or color along the line, while discrete events are marked by icons." Line colour and thickness encode severity or relatedness. In the medical mock-up, the knee-tear line thins as the injury heals and the acetaminophen dose falls [E, S1].
- **The present and the future.** A dashed "current date line" marks today. "Future events occur to the right of the current date line and appear gray" [E, S1].
- **Missing data.** The first stated benefit is "Reduce the chances of missing information." In the design review, users worried about "the possible bias associated with the color and thickness coding." Showing severity "brought to the surface underlying issues such as the data 'quality' (possibility of errors or cases of uncertainty)." The authors' own warning: "color and thickness coding is very powerful, and should be used carefully to avoid misleading overviews" [E, S1]. Data-entry errors became *visible* on the timeline: "a case was left open by mistake" [E, S1].
- **Print.** The paper was printed with colour plates. Its encodings depend on colour [E, S1].
- **Evaluation.** Alonso, Rose, Plaisant & Norman (1998) gave 36 participants either a static LifeLines view or a tabular summary.
  - LifeLines produced "much faster response times, primarily for questions which involved interval comparisons and making intercategorical connections."
  - Participants rated LifeLines preferable on nine of eleven satisfaction questions.
  - Recall was higher with LifeLines (p<.004).
  - A first-impression test suggested the graphic "can reduce some of the biases of the tabular record summary."
  - The authors named precise dates, attribute coding and overlaps as weaknesses [E, S2 abstract].

**LifeLines2 (Wang et al., CHI 2008): align, rank, filter.**

- **Lanes and encoding.** Many records are stacked, and events are triangles. *Alignment* re-zeroes every record on a sentinel event (for example, the first pneumonia), so the axis becomes relative ("+1 month") [E, S3].
- **Evaluation.**
  - Part 1 had 20 participants, all non-clinicians, working on synthetic academic data. Alignment made Task 2 65% faster (p<0.0001) with fewer and smaller errors, and Task 4 62% faster.
  - Part 2 tested "intervals of validity," lines that extend a diagnosis over its plausible duration. They did **not** improve speed, and the error results conflicted. One participant said she "relied on visualization more when intervals of validity were displayed, and was less inclined to zoom-in to verify her answers" [E, S3].
- **The causal-reading hazard, in the authors' own example.** "Because prednisone (a steroid) prescriptions coincided temporally with asthma diagnoses and with no other events, users may mistakenly conclude that prednisone was given for asthma." Drawing the rheumatism condition's open-ended interval "allows users to visually confirm that there may be more than one reason why prednisone was prescribed" [E, S3].
- **Expert reading (4 clinicians, qualitative).**
  - Without the intervals, "none of the participants paid much attention to the possibility of a long lasting rheumatism condition."
  - With them, "two participants interpreted the intervals as certain or known duration, and not as an uncertain, possible duration."
  - Two distrusted intervals that someone else had asserted.
  - The authors concluded there is "a lot more to be done in terms of providing a visual representation that adequately represents the 'messiness' of clinical data" [E, S3].

**LifeFlow, EventFlow and Outflow (2011–2013): cohort aggregates, not single-patient records.**

- **LifeFlow.** It aggregates every sequence into a "tree of sequences." Bar height is proportional to the number of records, and horizontal gap is "the average time between events." It handles point events only. A 10-participant study found novices could answer prevalence and timing questions after 15 minutes of training [E, S4].
- **EventFlow.** It adds interval events, such as "the 3-month interval during which patients took a medication." Its authors call this "a fundamental increase in complexity at every level of the application." No *n* is reported on its page [E, S5].
- **Outflow.** It aggregates pathways to outcomes ("life or death") and was tested in a 12-person usability study [E, S6].
- **Relevance.** These tools carry over the *alignment* and *time-gap* encodings. They do not carry over to a single pet's one-page record [A].

### 1.2 EHR timelines, ICU displays, medication timelines and medication administration records

- **ICU, AWARE (Ahmed et al. 2011): a randomised crossover with 20 critical-care physicians and 160 encounters.**
  - The task-specific interface showed a median of 102 data points per patient, against 1,008 in the standard EHR.
  - Task load was 38.8 against 58. Time per patient was roughly halved (for example, 54 s against 112 s).
  - Errors per provider were 0.5 against 2 (p=.007) [E, S7].
  - The lesson is *fewer, task-chosen data points*, not more lanes [A].
- **ICU eye-tracking (Wright et al. 2016; 20 clinicians, qualitative).** The stated need was "better representation of dynamic data such as vital signs and laboratory results." Its visions included organising "by systems or problems as well as by current versus historical" data and "detecting and representing change and urgency" [E, S8].
- **HistoriView (2024): a space-efficient single-patient timeline.** It used non-stacking events and an overlap-detection "y-shift." It was evaluated by usability survey only (n=11) [E, S9].
- **Medication timeline (Belden et al., JAMIA 2019), the closest EHR analog for an intervention lane.**
  - Each drug gets one row. The bar has a fixed height, because variable height "required more vertical space." Dose is shown by greyscale intensity: a "monochrome grayscale bar graph, where black represents maximum daily dose for a given clinical indication."
  - Bar ends show stops, and gaps show breaks in continuity. Brushing by diagnosis replaces grouping by drug class [E, S10].
  - **Evaluation.** 23 ambulatory physicians, randomised to a table or the timeline, unsupervised, five tasks:
    - current prescription: 50% → 64%
    - past prescriptions: 17% → 91%
    - length of prescription: 44% → 93%
    - new prescriptions: 50% → 62%
    - dose change: 0% → 18%
  - The timeline was faster on four of five tasks, but not significantly, given "weak statistical power" [E, S10].
  - The dose-change task stayed poor even on the timeline. Greyscale intensity is a weak channel for change [A].
- **The paper medication administration record (MAR) as an absence grammar.** Multnomah County's adult-care-home policy (rev. 4/26) works like this:
  - Each dose's date and time box carries the administering staff member's initials.
  - "Missed or refused medications: The administering staff member must initial in the applicable date/time box, circle these initials, and provide an explanation… on the back of the MAR." Late documentation is circled too.
  - Initials are valid only with a signature key at the front of the MAR [E, S11].
  - Florida's rule uses numbered reason codes (4 = refusal, 6 = held by physician) [A·snippet, S12].
  - In this grammar, a **blank** box is a documentation failure. It never means "not needed" [A].
- **Pump and CGM daily views.** In Tidepool, delivered basal insulin is a shaded area, and scheduled-but-not-delivered basal is a dotted line. Manually entered meter readings are larger dots, and the CGM trace is described as smoothed [A·snippet, S13].
- **Powsner & Tufte (Lancet 1994), the "graphical summary of patient status."** It is cited by record only. Its body has never been read, here or in I1 [E citation, S14].

### 1.3 Paper multi-lane clinical charts read under time pressure

**The WHO partograph and its 2020 replacement, the Labour Care Guide (LCG).**

- **Lanes and time axis.** The LCG has a horizontal time axis. "Each column represents 1 clock hour," with a second row counting elapsed hours. "If labour extends beyond 12 hours, a second LCG form should be commenced."
- **Sections.** Seven sections sit on the one axis: identifying information, supportive care, baby, woman, labour progress, **medication** and shared decision-making.
- **Explicit negatives.** The medication rows (oxytocin, medicine, IV fluids) record **"N = No" or "Y = Yes" every hour**, rather than leaving a blank [E, S15].
- **The Alert column.** A reference ("Alert") column holds thresholds. The instruction is to "circle any observation meeting the criteria in the 'Alert' column," a glyph that survives black and white [E, S15].
- **Reading rule.** The manual warns that "decisions should not be based on findings from individual observations, but rather on an overall assessment" [E, S15].
- **Evaluation.**
  - Cochrane 2018 pooled 11 trials with 9,475 women. For partograph against no partograph, "it is uncertain whether there is any clear difference" in caesarean rates (RR 0.77, 95% CI 0.40–1.46; very low quality) [E, S16].
  - The LCG's multi-country usability study (136 practitioners, 1,226 women) found high satisfaction but a median usability score of 67.5%, with "some design improvements" needed [E, S17].
  - **A many-lane, shared-axis paper chart has not been shown to change outcomes.** It is valued for completeness and standardisation [A].

**Hospital observation charts (Christofidis, Hill, Horswill & Watson).** These are the most experimentally tested paper multi-lane charts found.

- **Human-factors-designed charts.** These beat the charts 101 experienced professionals already used: fewer errors and faster responses ("superior observation chart design appears to trump familiarity") [E, S18].
- **Separate against overlapping BP and HR graphs.** Participants "responded faster and made fewer errors when blood pressure and heart rate observations were graphed separately." This held "even for 'Seagull-trained' participants viewing 'Seagull Sign available' cases." The abstract does not give *n* [E, S19].
- **Removing the per-vital-sign scoring rows.** These are derived rows. Taking them out was fastest and most accurate (47 novices) [E, S20].
- **Drawn dots against written numbers.** The dots were faster and produced fewer errors (205 novices, 64 trials each) [E, S21].
- **Caveats.** These charts use colour-coded zones, and the tested readers were nurses and novices.

**The bladder diary, an intake-plus-outcome diary with an explicit observation window.**

- **Fields.** The ICIQ bladder diary (as hosted in the NIDDK LURN case-report forms) records, for each entry: time, **"Woke up?"**, **"Went to bed?"**, leaked, amount drunk, type of drink, amount voided, bladder sensation and pad change. Amount fields have a **"Not Done"** code (99) [E, S22].
- **Validation.** 264 patients completed it; the 3-day diary was found valid, reliable and responsive [E, S22].
- **What it shows.** It is a standard clinical document in which **intake and outcome share one time axis**, and in which the patient's *awake window* is recorded alongside, so that night-time absence can be read correctly [A].

**The paper anesthesia record.** Drug rows sit above a vitals graph on 5-minute columns, and the carets (inverted for systolic, upright for diastolic) survive photocopying. This rests on a figure caption and a form whose glyphs could not be read [A·snippet, S23].

### 1.4 Clinical-trial individual charts: swimmer plots and event charts

- **Swimmer plot (JMP Clinical documentation).**
  - "Each bar represents one subject." Dots mark when a response was recorded; "Arrows indicate ongoing response."
  - "Reasons for leaving the study are not indicated." By default, "Only those subjects who had at least one overall response assessment are plotted."
  - Colour carries the response category, and a grey-scale option exists [E, S24].
  - **Missing data is handled by omission** in that default: a subject with no assessment simply disappears [A].
  - **Evaluation.** A Europe PMC title search for "swimmer plot" returned four papers. All were applications, and none tested reading accuracy [E, S25].
- **Event charts (Goldman 1992; Lee, Hess & Dubin 2000).**
  - They come as "calendar, interval, or Goldman event charts." The extensions include "sorting, subsetting, alignment, and multiple point and line formats."
  - "Discrete time-varying covariates can be shown by changing the line formats between line segments" (line type, width, colour) [E, S26].
  - In R's `event.chart`, each subject is a line and each event column a distinct symbol (`pch`). Censoring is simply another event column with its own symbol. A "now line" marks the end of follow-up. Interval charts re-zero time on a reference event [E, S27].
  - No reading evaluation was found [A].
- **Trial-harms consensus (Phillips et al., BMJ 2022; 25 experts).**
  - Of the 28 visualisations considered, 10 were endorsed. None of them is an individual-subject timeline. For time-to-event data with multiple outcomes, the panel found "No suitable plot."
  - "Trialists should continue to examine crude numbers alongside visualisations" [E, S28].

### 1.5 CGM reports: the closest human analog (outcome, intake and medication on one axis)

**The AGP (Ambulatory Glucose Profile), one page, as in Abbott's sample.** The page runs in this order:

1. Glucose statistics and targets. **"% Time Sensor is Active 97%"** sits directly under the date range.
2. Time in ranges.
3. The AGP curve: "a summary of glucose values from the report period, with median (50%) and other percentiles shown as if occurring in a single day."
4. **Daily Glucose Profiles**: "Each daily profile represents a midnight to midnight period with the date displayed in the upper left corner."

The sufficiency rule appears on the page: "The consensus recommends that >70% of data is captured over 14 days of sensor wear time" [E, S29].

- Interpretation guides open with sufficiency. "Interpretation should begin by assessing data sufficiency" (a 2026 narrative review). "Reliable CGM data interpretation requires at least 70% sensor use over 14 days" (a 2025 consensus) [E, S34].
- The AGP was set by expert consensus (2012–13) [E, S33]. No reading-performance comparison of the AGP layout against alternatives was found among the abstracts checked [A]. The 4–19 minutes it saves per visit is in I2 [E, I2].

**The AGP Report for Connected Insulin Pens (Simonson et al., DT&T 2024; an international expert panel).**

- It is a "single simplified two-page report."
- Page 2 holds the bolus assessment periods, "information on meal timing… and **number of days with bolus doses recorded**," and "daily glucose profiles with an **overlay of the timing and amount of basal and bolus insulin** administered" [E, S32].
- This is the closest standardised human document to the PM's "medication window plus incidents." It is an expert consensus; no reader evaluation was published in the abstract [E/A].

**Dexcom Clarity, from the clinic user guide.**

- **Daily graph.** It shows a 24-hour axis. "Events recorded by the Dexcom CGM system and partner apps are shown with an icon at the bottom." "If the black trace line in the graph has interruptions or stops, then the Dexcom CGM system did not record glucose data during that time" [E, S31].
- **Overlay.** It "displays one week of data in each graph with colored lines to represent a single day's data… A key above the graph shows which line corresponds with which day" [E, S31]. This depends on colour [A].
- **Coverage and medication definitions.** "Days with data: The number of days during the reporting period with at least 50% sensor readings." "Time active" is hours collected divided by hours in the period. "**Only known insulin doses will display**." For post-meal checks, "The number of times this event is logged and the percentage of the logged events…" [E, S31].
- **Target lines.** They are coloured: "the upper limit line is always yellow, and the lower limit line is always red" [E, S31]. They do not survive black and white [A].

**LibreView (Abbott HCP detail aid).**

- **Daily Log.** It "shows detailed glucose, carbohydrate, insulin and other data that a patient has logged and when the data was logged for each day." Its legend includes "Logged," "Post-Meal Peak," "New Sensor" and "Time Change" [E, S30].
- **Daily Patterns.** It gives hourly averages of carbohydrates and insulin, where "**Numbers in the parentheses indicate how many readings have been logged**" [E, S30].
- **Mealtime Patterns.** It shows "glucose, carbohydrate and insulin data for 'typical' meals, based on all meal tags" [E, S30].
- **Monthly Summary.** It shows "average glucose, low-glucose events and sensor usage data in a calendar format" [E, S30].

**How clinicians are told to read these (NHS Tayside paediatric guidance).**

- Data sufficiency comes first: "If the average number of readings is less than 4, then there is not enough information to make any meaningful decisions."
- "Your highest highs and lowest lows generally are not trends."
- Act on "a pattern… which recurs on most days" [E, S35].

### 1.6 Patient-diary reports for doctors

| Domain | What was found | Grade |
|---|---|---|
| **Seizures** | Seizure Tracker produces "graphs and charts that compare seizure activity alongside the therapy and lifestyle information" and "printable reports and graphs to share with your healthcare team." It tracks "medication dosages" [S36]. No published evaluation was reachable. The accuracy problem underneath: on video-EEG, 91 inpatients "failed to document 55.5% of all recorded seizures," and 85.8% of seizures during sleep; daily reminders did not help [S37]. | [E] |
| **Headache / migraine** | Headache medicine counts in **days**. ICHD-3 8.2 defines medication-overuse headache as "headache occurring on ≥15 days/month" plus regular overuse of acute drugs for more than 3 months, and "in almost all cases, this necessitates diary follow-up" [S38]. Medication-overuse headache is the textbook case where the *intervention* drives the *outcome*. Migraine Buddy's doctor report is described only in listings [S39]. | [E] / [A·snippet] |
| **IBD** | The apps found (GutLog, Mirae, IBDsmart and others) are listing grade. IBDsmart reports validated indices (HBI, CDAI, SCCAI) rather than raw overlays [S40]. | [A·snippet] |
| **Eczema / allergy** | EczemaWise (National Eczema Association) offers printable data; its layout is unknown [S41]. Allergy trials handle medication masking symptoms with a **combined symptom and medication score**, "a simple and standardized method that balances both symptoms and the need for antiallergic medication in an equally weighted manner" (EAACI 2014). MASK-air applies it daily [S42]. | [A·snippet] / [E] |
| **Menstrual** | Clue sells a "Report for doctor" PDF of "recent cycle data and symptom trends" (US, UK, AU, CA, NZ) [S43]. The clinical instrument is the DRSP, prospective daily ratings validated in 27 and 243 women [S44]. | [A·snippet] / [E] |
| **Human food–symptom apps** | mySymptoms exports a PDF or CSV and has a clinic web app; Cara Care "share[s] your app data… with your doctor" [S45, S46]. The Monash FODMAP diary supports reintroduction over 3 days per challenge food, logging "IBS symptoms, including stress" [S47 blog]. A PDF "Share PDF" export is listing grade [S47]. "**Digestly**" was not found [S48]. | [E] / [A·snippet] |
| **Food–symptom research (IBS)** | Schroeder et al. (CSCW 2017; 10 patients and 10 providers) built bubble-plus-bar and parallel-coordinate views. They defined potential triggers as foods in "the 4-hour window preceding a symptom report" and excluded symptoms with no meal in that window, which "some patients felt… did not accurately reflect their experience" [S49]. Zia et al. (2017): **8 providers reading 17 IBS journals agreed at average α = 0.07**, and "favored certain trigger food likelihood ratings… regardless" [S50]. TummyTrials (CHI 2017; 15 patients) used a randomised self-experiment with a timeline and a by-condition strip plot. "No evidence" was the commonest result, and "to most, 'no evidence' meant the food is not a trigger" [S51]. | [E] |

**How these print, and whether any were evaluated.** None of the consumer report pages reachable this pass describes the printed layout, the black-and-white behaviour or the handling of gaps. None reports a reader evaluation. The academic IBS tools are interactive and screen-only [A].

---

## 2. How clinicians read these displays

### 2.1 Graph against text against table: the studies that bear most directly

| Study | Design, *n* | Finding | Bearing |
|---|---|---|---|
| Law et al. 2005 [S54] | 40 NICU staff in 5 groups; ~40-minute scenarios; choose actions from 18 | **Text beat trend graphs** for appropriate actions. Speed was equal. "The majority of participants reported a subjective preference for the Graphs." Texts were expert-written "to describe… but not to interpret" | Descriptive text is not the enemy of a chart. It carried more decision value |
| van der Meulen et al. 2010 / Portet et al. 2009 (BT-45) [S55, S56] | 35 NICU staff (9 senior doctors, 9 junior doctors, 9 senior nurses, 8 junior nurses); 24 scenarios; graphs (G) against human text (H) against computer text (C) | Mean scores G 0.33, H 0.39, C 0.34; H beat G (p<.05). Reaction times 73, 77 and 79 s, with no difference. Human texts averaged **135 words (SD 79)**, and were written "to avoid… judgmental language." The graphs showed "only the discrete events mentioned in the human-authored texts." The title calls it "a graph… poorer than 100 words" | The comparison condition was effectively a multi-lane physiological chart with event markers |
| Alonso et al. 1998 [S2] | 36; static LifeLines against a table | Faster on interval and cross-category questions; better recall; fewer first-impression biases | Timelines help *temporal* questions |
| Belden et al. 2019 [S10] | 23 physicians; table against timeline | Large accuracy gains on history and duration; dose change poor in both (0% → 18%) | Same pattern |
| Bauer et al. 2010 [S58] | 12 PICU physicians, think-aloud | Graph faster (3.6 against 4.4 min); **37% of interpretations differed between formats**; "slightly abnormal values were easier to identify with tables" | Format changes the reading itself, not only its speed |
| Torsvik et al. 2013 [S59] | 20 medical students, crossover, 4 formats | "With sparklines participants **more often assessed laboratory results to be within reference ranges**"; no single format was best; "tables seem to suffice for simpler result sets" | A compact trace biases toward "normal," which is the reassurance hazard |
| Elting et al. 1999 [S57] | 34 physician-investigators | Correct stop decisions: icons 82%, tables 68%, pie 56%, bars 43%; framing in tables 93% against 47% | Format alone moves clinical decisions |
| Ahmed et al. 2011 [S7] | 20 ICU physicians, 160 encounters | Task-specific, sparser display: errors 0.5 against 2; roughly half the time | Fewer chosen data points beat more |
| Christofidis et al. 2013–2016 [S18–S21] | 101 professionals; 205 and 47 novices | Designed charts beat familiar ones; drawn dots beat written numbers; separate graphs beat overlapping ones; fewer derived rows was better | Paper multi-lane charts can be engineered, and must be tested |
| Sultanum et al. 2018 (MedStory) [S61] | 14 medical professionals (snippet) | The authors stress "the importance of text content being visible front and centre" [E]; replacing text lost detail and trust [A·snippet] | Keep the words that carry the evidence |
| Chung et al. 2016 [S52] | 211 patients surveyed, 18 interviewed; 21 provider interviews re-analysed | Patients reported about **5 minutes (~25% of the visit)** reviewing their data with a GP or gastroenterologist; "providers are overwhelmed by the excessive amount of data"; recommends "flagging missing data… instead of just treating it as 'bad' or 'incomplete'" | Matches the 60-second budget |

**Read across the table [A].** Graphs consistently win on *speed for temporal and pattern questions*, and on preference. Descriptive text wins on *choosing actions*, in the two trials closest in spirit to the vet report (NICU staff, mixed data). Compact traces drift toward "normal." Two caveats apply to all of it:

- None of these readers was a veterinarian.
- None read an owner-logged record. Every study was a screen or a booklet, never a faxed sheet.

### 2.2 Visual alignment invites causal inference

- **Coincidence on one axis reads as cause.** This is LifeLines2's own prednisone and asthma example [E, S3].
- **Two-bin aggregation maximises causal readings.** Xiong et al. (IEEE VIS 2019) ran three crowdsourced experiments.
  - Experiment 1 had 4 conditions × 34 participants. Bar charts were rated most causal (M=76.6), then text (71.3), then line (68.4) and scatter (67.3).
  - Experiment 2 had 129 participants. Aggregation level 2 (two bins) was rated most causal (M=84.8) and 16 bins least (63.7). "High levels of data aggregation by graphs tend to be associated with higher perceived causality" [E, S62].
  - A before/after split at an intervention is exactly a two-bin aggregation. This is consistent with the panel's veto of the dumbbell [A, I3].
- **Phase-change lines produce false alarms.** Thirty-seven postgraduate students judged 27 AB charts.
  - "False alarm rates were surprisingly high (16% to 84%)." Positive autocorrelation and variability raised them.
  - "Visual analysts were not conservative" [E, S63].
  - Across 19 studies (32 effects), agreement between visual analysts averaged .76 [E, S64].
  - Symptom series cluster, which is positive autocorrelation, so an intervention line drawn over a vomit lane sits in the false-alarm zone [A].
- **Self-limiting conditions breed illusions.** The outcome-density bias: "when someone is trying to obtain an outcome and the outcome occurs frequently, the feeling that the action is being effective is much stronger." It specifically affects "any disease or pain condition in which spontaneous remissions are frequent" [E, S65]. Acute vomiting often resolves on its own, so a decline after a diet change can be remission or regression [A].
- **Labels steer memory.** In Kong et al. (CHI 2019; 100 participants per condition), "people's recall of the visualization's message more frequently aligned with the titles than the visualization," and visualisations "were persistently perceived as impartial by the majority" [E, S66]. The label on an intervention marker is therefore load-bearing [A].
- **Expert reading of raw food-symptom data is unreliable.** Eight providers agreed at α = 0.07, with personal "favourite" triggers [E, S50].
- **Medication and symptoms are bidirectional.**
  - In medication-overuse headache, the treatment produces the outcome [E, S38].
  - In allergy, rescue medication *suppresses* the symptom being counted, hence the combined symptom and medication score [E, S42].
  - With as-needed (PRN) dosing, doses follow symptoms. The textbook name is confounding by indication [E citation, S79]. On an overlay, an as-needed antiemetic will always sit next to vomits by construction [A].

### 2.3 Dual axes

- **Empirical evidence is thin and indirect.** Isenberg et al. (TVCG 2011) studied *dual-scale* charts: two resolutions of one variable, not two variables. They concluded that "superimposed charts in which focus and context overlap… should be avoided" [E, S68]. A 2020 critique notes the study had only 15 participants and an unusual task [A·snippet, S69].
- **The practical case against dual axes is demonstrable.** ONS shows the same data told different ways by rescaling ("I've deliberately manipulated the axis to tell different stories"). Lines that cross suggest false events such as "Gold overtook Blue." ONS's recommended alternatives are annotation or separate panels, each with its own scale [E, S70].
- **For intake against vomits [A].** Any overlay that puts grams or meals and episodes on two scales lets the scale choice create or erase apparent co-movement. Separate lanes, each on its own labelled scale, avoid the problem.

### 2.4 Superposition against small multiples against stacked lanes

- **Javed et al. (TVCG 2010; 16 participants; 2, 4 or 8 series; 48, 96 or 192 px).**
  - Shared-space charts (line, braided) were faster for the *local* "maximum" task.
  - Split-space charts (small multiples, horizon) were faster for *dispersed* discrimination.
  - "Higher numbers of concurrent time series caused decreased correctness and increased completion time."
  - "Decreased display space allocation had a negative impact on correctness."
  - Stacked graphs were dropped after the pilot as "mostly unsuitable."
  - Split-space "seem[s] to scale better for higher values of N" (follow-up up to 16 series, n=4) [E, S71].
- **Ondov et al. (TVCG 2019; crowdsourced, about 50 per experiment).** "Overlaid > horizontal multiples > vertical multiples" for finding the biggest mover; mirror-symmetric multiples and animation also helped [E, S72]. For *comparing two series of the same quantity*, superposition is strong [A].
- **Clinical observation charts.** Separate graphs beat overlapping graphs [E, S19].
- **Synthesis [A].** Superpose only like with like: the same unit and the same question, such as two halves of one symptom. Put *different* quantities in separate lanes on a shared time axis. On a vet report, the questions span the whole window (did vomits cluster after the exposures?), which is the dispersed case that favours lanes.

---

## 3. Honest overlay design

### 3.1 Coverage and no-data days

- **Readers default to "nothing happened."**
  - Eaton, Plaisant & Drizd (INTERACT 2005) compared missing values drawn as 0, left absent, and coded with an icon. "People interpreted confidently even when critical data was missing." There was no significant difference between methods, but participants preferred visualisations "that explicitly indicated missing data" [E via S74's summary; primary not read, S75]. A 2024 survey gives the study's n as 30 [A·snippet].
  - Song & Szafir (TVCG 2019; 303 crowdsourced participants in study 1) chose to include bar charts because removing missing data "from bar charts is indistinguishable from zero values" (their design rationale, not a measured result). Measured: visualisations that **highlight** missing values were judged higher quality, while those that "break visual continuity decrease these perceptions and can bias interpretation." Zero-filling deviated most from the truth [E, S74].
- **Diaries are incomplete in a structured way.** Unawareness during sleep drives seizure under-documentation (85.8% of seizures during sleep went undocumented) [E, S37]. Paper diaries are backfilled: on 32% of days the binder was never opened, yet reported compliance exceeded 90% [E, S53].
- **The honest precedents do three things [E].**
  1. They state coverage before anything else: the AGP's "% Time Sensor is Active" at the top [S29]; Clarity's "Days with data" defined as ≥50% readings [S31]; the connected-pen AGP's "number of days with bolus doses recorded" [S32].
  2. They make negatives explicit, so that blank means unrecorded: the LCG's hourly N/Y [S15]; the ICIQ "Not Done" code [S22]; the MAR's circled initials plus a reason [S11].
  3. They show a gap *as a gap*: Clarity's interrupted trace, "did not record glucose data during that time" [S31].
- **Hatching against hollow against grey for "no data."** One map-perception survey (101 respondents) tested eight colours and two hatches as "missing" symbols, but reported only early demographic differences [E, S77]. No usable evidence was found on which no-data glyph survives a photocopier or fax best (research debt) [A].
- **Applying this to Culprit's own grammar [A].** Under the house rule (C-3), coverage is rendered as the un-logged days only, and nothing at all when the window is fully covered. A blank pip row then means "all logged," while a pip means "this day has no record." Song & Szafir's result that highlighting beats removal supports *marking* un-logged days, rather than leaving the symptom lane blank on those days.

### 3.2 Exposures: ticks against spans

- **The convention across event charts, LifeLines, swimmer plots and EventFlow.** Instantaneous things are glyphs; ongoing states are lines or bars; a *change of state* is a change of line format [E, S1, S24, S26, S27]. Intervals add real complexity [E, S5].
- **Inferred intervals mislead.** The LifeLines2 experts read "intervals of validity" as certain durations [E, S3]. **Drawing an exposure (a treat) as a span of assumed gut transit is an inferred interval and invites that misreading. A dated tick does not [A].**
- **Logged is not delivered is not swallowed.** In pharmacy adherence, proportion-of-days-covered counts *supply*, not ingestion, and the 80% threshold is conventional [A·snippet, S78]. Clarity says "Only known insulin doses will display" [E, S31]. An exposure lane shows only what was logged, so an absent tick is not an absent exposure [A].

### 3.3 A refused meal against an unobserved one

- **The MAR separates three states [E, S11; A].**
  - Given: initials.
  - Refused or missed: *circled* initials plus a written reason.
  - Not documented: a blank box, which is a failure, never a state.
- **Intake and outcome diaries code "not done" separately from zero** [E, S22].
- **For a free-fed pet [A, building on I5].** I5 already holds that "a single `offered_at` timestamp is structurally biased against cats," roughly half of which are free-fed.
  - A free-fed day is not "0 meals." It is "intake not directly observed," which is a coverage *state*.
  - It needs its own glyph or band, distinct from both "no record" and "refused."
  - The same pet cannot enter any meal-aligned latency view (see §4).
- **Black-and-white survival [A].** Three intake states (finished, picked at, refused) fit the three-level ceiling for photocopying (I1 §5) when they use shape and fill rather than grey: a filled glyph, a half-filled glyph, an open glyph with a stroke. "Not observed" belongs on the *coverage* band, not as a fourth grey.

### 3.4 Uncertain timestamps (found at 07:44; happened some time from 04:00 to 07:44)

- **Gschwandtner et al. (TVCG 2016; 73 participants; six encodings).** "We recommend using ambiguation – using a lighter color value to represent uncertain regions – or error bars for judging durations and temporal bounds, and gradient plots… for judging probability values" [E, S76]. The encodings were tested on screen. "Lighter color value" is a grey step, which is fragile on fax [A].
- **The trap.** The LifeLines2 experts read possible intervals as certain durations [E, S3]. A 04:00–07:44 bar on a time-of-day view could be read as "vomited for nearly 4 hours" [A].
- **At day grain** (the 70–90 day strip), the uncertainty is almost always inside one day, so it changes nothing on the calendar axis. A "found" episode needs a glyph distinction (witnessed against found), not a whisker [A]. The cold read already flagged that the report computes estimated and window timestamps but never draws them [E, I3]. The witnessed and discovered evidence is in I4 [E, I4].
- **On a time-of-day view.** A bounded window would be a thin error bar ending at "found," with the found end solid [A, from S76]. The left whisker must read as "last seen," for example with a labelled tick, so it is not read as a duration.

### 3.5 Event density across 90 days at US Letter width, in black and white

**Geometry** [A·computed from S87 and S88]. US Letter is 215.9 mm wide. With 0.5-inch margins and about 20 mm of lane labels, the plot area is roughly 170 mm.

| Window | mm per day | pt per day | Fax pels per day (horizontal, about 8.04 per mm) |
|---|---|---|---|
| 70 days (14-day baseline + 56-day trial) | 2.43 | 6.9 | 19.5 |
| 90 days | 1.89 | 5.4 | 15.2 |

**Fax vertical resolution** [E, S87]. Standard mode is 3.85 lines per mm (0.26 mm per scan line) and "fine" is 7.7 lines per mm. The horizontal scan is "1728 black and white picture elements" over 215 mm, which is bilevel with no grey [E].

| Line weight | Width in mm | Standard-fax scan lines it spans |
|---|---|---|
| 0.5 pt | 0.18 | 0.68, so a horizontal hairline may drop out or jitter |
| 0.75 pt | 0.26 | about 1 |
| 1 pt | 0.35 | 1.36 |

[A·computed]. SSA's figure guidance: "Lines thinner than 0.5 point may not print even if the figure size is not changed" [E, S88].

- **Same-day events must stack, never merge.** The cold read caught "ten feedings drawn as nine marks (same-day merge)" and "one hatch texture carrying three meanings" [E, I3]. At about 2.4 mm per day, a column of 1.0–1.2 mm dots holds about three events in a 5 mm lane before it needs a numeral [A].
- **Grey does not survive.** Fax is bilevel [E, S87]. A photocopy-safe categorical palette tops out at three steps [E, I1 §5]. Any meaning carried by grey tint (dose intensity as in Belden, "ambiguation" as in Gschwandtner) needs a shape or text backup on this channel [A].

### 3.6 Naming a concurrent change (diet and drug starting together) without implying which one worked

**What the evidence says not to do [E].**
- Do not aggregate into before/after bins, which maximises causal readings [S62].
- Do not rely on an unlabelled phase line, which produces false alarms [S63].
- Do not let a title or label assert efficacy, because recall follows the title [S66].
- Do not ignore spontaneous remission [S65].

**What precedents do [E].**
- LifeLines2 draws the *other* candidate cause (the rheumatism interval) so the alternative explanation is visible [S3].
- Swimmer plots and event charts give each concurrent therapy its own bar or line format [S24, S26].
- The LCG gives each medication its own row with an explicit N/Y per hour [S15].
- Allergy trials fold medication into the outcome score, because a symptom count without the medication count is uninterpretable [S42].
- The trial-harms consensus says to keep the crude numbers beside the plot [S28].

**No precedent was found** for an on-chart annotation that explicitly says "these two changes began together; this chart cannot separate their effects." The closest is radiology's "limitations… immediately before the impression" (I1 §1, D9) [A]. A co-start would therefore be named at the marker as *dates* ("Diet B and metronidazole both started Mar 12"), with the counts on both sides carrying their denominators. Whether the page also prints a one-line limitation is a spec question [A].

---

## 4. Time-of-day views

**The precedents [E].**
- **The AGP's modal day.** All days are folded into one 24-hour percentile band "as if occurring in a single day" [S29].
- **LibreView.** Its Daily Patterns view gives hourly carbohydrate and insulin averages with *n* in parentheses; Mealtime Patterns builds "typical" meals from meal tags [S30].
- **Clarity.** Its post-meal metric gives "the number of times this event is logged" [S31].
- **The connected-pen AGP.** It defines bolus assessment periods around meal timing [S32].
- **Actigraphy.** The double-plotted actogram (48 hours per row) is the documented format "for phase drift, phase assessment," while the single 24-hour plot is for overview [E, S83]. That drift shows as a diagonal is snippet grade [A·snippet].
- **van Wijk & van Selow (1999).** They cluster daily profiles and colour a calendar by cluster. No empirical evaluation was found [A·snippet, S82].
- **Event alignment.** LifeLines2 re-zeroes time on a sentinel event; interval event charts do the same [E, S3, S27]. This is the tested mechanism for "within X minutes of a meal" questions: 62–65% faster for relative-timing tasks in non-clinicians [E, S3].

**Linear or radial.** Waldner et al. (TVCG 2020; 92 crowdsourced users; hourly accident data) found:
- "The most elementary 24-hours linear bar chart is most accurate and efficient and is also preferred."
- Read-value error was **14% (24-hour linear) against 41% (two 12-hour radials)**.
- Locating a time took 5.2 s linear against 7.4 s radial.
- Users "did not report more about late evening or night hours using [the 24-hour radial chart], despite its continuous mapping across midnight." The supposed advantage of radial charts at midnight did not show up.
- Splitting the day into two charts pulled attention to the seam: there was "an increased tendency to report time periods just before noon" [E, S80].

Goldberg & Helfman (2011) also found linear graphs better for reading values (citation only) [A, S81]. The seam effect is relevant to any layout that cuts the axis at an intervention [A].

**Clinical reasons a vet might ask a time-of-day question [E].**
- Bilious vomiting syndrome is "historically associated with early morning vomiting of bile." Its therapy includes "frequent feedings, late evening meals." The evidence is a retrospective series of 20 dogs. In 3 of those 20, the diagnosis was later replaced by gastric adenocarcinoma, dietary indiscretion or liver disease [S85]. A time-of-day pattern is therefore a *prompt*, not a diagnosis [A].
- The IBS research used a 4-hour pre-symptom window and lost symptoms that fell outside it [S49].
- TummyTrials participants reported overnight carry-over from the previous dinner [S51].

**When does time-of-day beat a calendar view?** No study comparing them for clinicians was found [A]. Synthesis [A]:
- Use a time-of-day view when the question is *clock-time* (early morning, overnight) or *latency to another event* (after meals, after a long fast), **and** the pattern recurs across days.
- Use a calendar view when the question is about *change across days*: onset, the intervention, clusters, trend.
- On a 70-day calendar axis, 30 minutes is about 0.05 mm, so the calendar strip *cannot* carry latency [A·computed].

**Honesty conditions for any time-of-day view [A, from E precedents].**
1. Every hour or meal cell carries its *n*, as LibreView does.
2. A coverage statement opens the view, as the AGP and Clarity do.
3. "Within 30 minutes of a meal" is reported as *k of N meals*, not as a count of vomits, because the denominator is meals.
4. Free-fed pets and found (unwitnessed) episodes are excluded and counted as excluded: they cannot be aligned to a meal or placed on the clock.
5. Folding days into one cycle hides *which* days. A modal day must not stand alone when the window contains an intervention; the AGP pairs its curve with daily profiles for this reason.

The cold read showed the hazard: "23 of 23 episodes fell between 10:00 and 14:00" was a fixture artifact (every event stamped at the same hour) that the sheet printed as a finding [E, I3].

---

## 5. Lane count and density limits in print

**How many lanes a reader can use.**
- Performance degrades steadily from 2 to 4 to 8 series. Split lanes degrade more gracefully than overlays [E, S71].
- Short-term memory holds about **four chunks** [E, S86].
- On observation charts, *removing* the derived rows improved speed and accuracy (n=47) [E, S20].
- **Working inference [A].** A reader can carry about four lanes in mind at once. More lanes are tolerable when they are grouped (outcomes, exposures, interventions, coverage), ordered top to bottom by importance (I1 §4 item 6: nurses read "in pairs" and "top-to-bottom"), and when the page never asks the reader to integrate more than about two lanes at a time.

**Lane height.**
- Heer et al. (CHI 2009; 18 participants in Experiment 1, 30 in Experiment 2, 8 in the follow-up, all on screen): error held steady down to about 24 px virtual resolution. "For both normal line charts and 1-band mirror charts, we found a chart height of 24 pixels (6.8 mm on our…displays) to be optimal." Below that height, error rose roughly linearly as height halved. At 2 px, subjects fell back on colour [E, S73].
- These are *value-estimation* tasks for continuous lines (weight). Count lanes of stacked dots need height for the maximum daily stack instead [A].

**Mark size and labels.**
- Lines should be 0.5–1.0 pt at final size [E, S88]. Horizontal rules that carry meaning need about 0.75 pt or more on a standard fax [A·computed].
- Legge & Bigelow put the bottom of the fluent reading range at an x-height of about 0.2°, which is "1.4 mm (4 points)" of x-height at 40 cm [E, S90]. That is roughly 8 pt type in a typical face [A].
- Fax vendors advise at least 10–12 pt body text [A·snippet, S91].
- Direct labels beat legends, and three grey steps is the photocopy ceiling (I1 §5, D18) [E, I1].

**Fitting a 56-day trial and a 14-day baseline on one axis [A·computed].**
- Seventy days at about 2.4 mm per day fills 170 mm, so the day columns stay legible.
- With 8 lanes at about 6–7 mm each, plus an axis and labels (about 15 mm), the strip is roughly 65–70 mm tall, about a quarter of a Letter page's usable height.
- The precedents for long windows split by *form*, not by squeezing: the LCG starts a new form at 12 hours [E, S15]; the AGP fixes 14 days [E, S29]; the DRSP runs over whole cycles [E, S44].
- A trial-relative axis ("day −14 … day 56", aligned on the trial start, as in an interval event chart) is a documented option [E, S27]. Waldner's seam effect warns that any visual break at day 0 will draw attention to the break itself [E, S80].

---

## 6. Lane-design table for the Culprit record

Each row lists, for one lane of the record strip: the black-and-white encoding; how coverage, absence and uncertainty show; whether it survives fax; the honesty risk; and how a precedent mitigated that risk. Everything in the "proposal" cells is [A], an inference from the cited precedents, not a ruling.

| Lane | Encoding (black and white) | Coverage, absence, uncertainty | Fax / photocopy survival | Honesty risk | How a precedent mitigated it |
|---|---|---|---|---|---|
| **Window and coverage** | One row of day pips; mark only **un-logged** days (C-3), with nothing drawn when the window is fully covered; a coverage ratio in the lane label ("logged 61 of 70 days") | The lane *is* the coverage. A "logging began" marker sits before the first record (I3) | Filled pips at ≥1 mm, about 9 fax pels wide, survive. A hollow ring needs a stroke of 0.75 pt or more | A blank symptom lane read as a well day; a completeness ratio beside a partial list | AGP coverage at the top [S29]; Clarity "Days with data" [S31]; connected-pen days with doses recorded [S32]; Song & Szafir: highlight missing, never remove [S74] |
| **Symptom lanes** (vomit, loose stool, itch, cough), one scale | One dot per episode, stacked per day; a numeral above about 3; lanes as small multiples sharing one count scale; witnessed against found as filled against open glyph | Un-logged days show as coverage pips aligned under the column. Found episodes keep the day and change glyph only | Dots survive; open rings at 0.75 pt or more survive | Same-day merge; absence read as wellness; a decline read as treatment effect | Separate lanes beat overlays [S19, S71]; event charts use a distinct symbol per event type [S27]; Hoppe: undercounting is structural [S37] |
| **Safety flags** (blood, foreign material) | A text glyph on the episode (an asterisk or letter, in the lab-flag grammar, I1 D11), **only when present** | Absence is never drawn. "No blood seen" would be reassurance | Text glyphs survive | A missing flag read as "checked, none" | Present-only safety rule (house); circled "Alert" observations in the LCG [S15] |
| **Meals and intake** | A per-meal glyph per day: filled = finished, half = picked at, open with a stroke = refused; free-fed days drawn on the coverage band as "not directly observed," never as zero | Free-fed is a coverage state, not an intake value. Unrecorded meals are blank, with coverage stated | Three shape and fill states fit the photocopy ceiling | Refusal softened into "picky"; free-fed read as zero; repeats merged | MAR: circled initials plus reason for refused [S11]; ICIQ "Not done" [S22]; LCG explicit N [S15]; I5 on free feeding |
| **Off-diet exposures** (treats, human food) | A dated tick per exposure, letter-coded (T, H) per protein or food where it matters; never a span | "Only logged exposures show" stated once. The allowed list is shown bounded where incomplete (I3) | Letters and ticks survive | An absent tick read as an absent exposure; an inferred transit span read as certain | LifeLines icons for discrete events [S1]; LifeLines2: drawn intervals read as certain [S3]; "Only known insulin doses will display" [S31] |
| **Diet-trial span** | A bar from the start to the target end; line format changes at a state change (event-chart rule); arrow if ongoing; target end as a bracket | "Active" is not "on diet that day," so exposures are drawn *over* the bar. A blackout is disclosed beside it | Solid against dashed survives at ≥1 pt | The bar read as adherence; a before/after aggregation read as efficacy | Swimmer bars with arrows [S24]; event-chart line formats [S26]; Xiong: avoid two-bin aggregation [S62] |
| **Medication courses** | One row per drug (Belden); a daily dose glyph: filled = given, half = partial, open = unconfirmed; PRN doses as ticks; start and stop dated | Unconfirmed is never drawn as given; days with doses recorded are counted in the label | Glyphs survive; Belden's greyscale-intensity dose does **not** survive fax | The as-needed dose sits beside vomits by construction; medication masks symptoms; co-started drug and diet | Belden rows [S10]; MAR circled refused [S11]; connected-pen "days with bolus doses recorded" [S32]; allergy symptom and medication score [S42]; confounding by indication [S79] |
| **Weight** | Dots with printed values; no line across gaps; no fitted trend line on sparse weigh-ins | Gaps stay gaps; the number of weigh-ins is stated | Dots and numerals survive | A line through three points reads as a trend; a calm aspect ratio smooths change | Clarity trace interruptions [S31]; Heer: about 6.8 mm for value reading [S73]; I1 anti-pattern 13 |
| **Noticed** (the daily look) | One pip per **answered day** (the day is the unit); counts are answered days | Below the floor, no line is drawn and the reason is given; never a zero | Pips survive | A look read as a symptom count | ICHD-3's day-based counting [S38]; DRSP daily ratings [S44] |
| **Annotations** | Dated markers labelled with *what happened*: "logging began," "Diet B started," "metronidazole started (same day)"; counts with denominators on both sides | Co-starts are named together; no verdict words | Text survives at about 8 pt or more | A title or label read as an efficacy claim; false alarms at the phase line | Kong: titles steer recall [S66]; Matyas: phase-line false alarms [S63]; LifeLines2: show the alternative cause [S3]; trial consensus: crude numbers beside plots [S28] |
| **(Separate view) Time of day / meal-aligned** | A linear 24-hour axis (never radial); one row per day or a raster aligned on meals; *n* printed per hour or meal | "k of N meals"; free-fed and found episodes excluded and counted | Linear ticks survive | Fixture or rounding artifacts read as a pattern; a modal day hides the intervention | Waldner: linear beats radial [S80]; LibreView *n* in parentheses [S30]; LifeLines2 alignment [S3]; I3 fixture artifact |

---

## 7. What this implies for Culprit (evidence, not decision)

1. **The shape is supported for the temporal half of the job, and the text is still needed for the decision half.** Timelines beat tables on "when, how long, what came near what" [S2, S10, S3]. Short *descriptive* text beat graphs for choosing actions in both NICU trials [S54, S55]. That is evidence for a strip *plus* a small number of plain descriptive sentences that carry the denominators. It is not evidence for a graph-only page. The cold read's lesson was "say once" means once, not never (I3), and it points the same way.
2. **The four veto calls on page 1 have independent support.**
   - Dumbbell / before-after split: two-bin aggregation produces the strongest causal readings [S62], and a seam draws attention [S80].
   - Sparkline: compact traces bias toward "within range" [S59].
   - Stacked protein bar under the vomit bars: superposing different quantities [S19, S71].
   - Delta arrows and verdict colour: colour fails fax [S87, I1]; titles steer recall [S66].
3. **Lanes, not overlays.** Separate graphs beat overlapping ones in a clinical setting [S19]. Dispersed comparisons favour split space [S71]. Dual axes let scale choice manufacture co-movement [S70]. Grams of food "overlaid" on vomit counts is a dual-axis chart in disguise [A].
4. **A phase line on a symptom lane is a false-alarm generator.** Analysts called effects in 16–84% of null charts [S63]. Self-limiting symptoms add outcome-density bias [S65]. If the strip carries an intervention marker, the counts on both sides need their own coverage, and the label should be a date, not a claim [A].
5. **Coverage has to be drawn, and it has to precede the reading.** Every honest precedent states sufficiency first [S29, S31, S32, S34, S35]. Readers interpret confidently over missing data, and highlighting gaps beats removing them [S74, S75]. Diaries undercount structurally [S37, S53]. The coverage row is load-bearing, not decoration [A].
6. **"Not observed" is a third state, distinct from "no record" and from "refused."** The MAR, the ICIQ diary and the LCG all encode it explicitly [S11, S15, S22]. For free-fed pets it belongs on the coverage band, not in the intake values [A, I5].
7. **The medication lane needs the as-needed caveat built into its geometry.** As-needed doses follow vomits by construction [S79]. Medication suppresses the counted outcome [S42]. "Days with doses recorded" is the human-report standard [S32]. Medication-overuse headache shows the arrow can run from drug to symptom [S38].
8. **Time-of-day questions need their own aligned view, or none.** The calendar strip cannot resolve latency at 2.4 mm per day [A]. A linear 24-hour view with *n* per cell [S30, S80] and an explicit meals denominator is the evidence-backed form. Free-fed pets and found episodes cannot enter it [A]. One fixture has already produced a fake pattern [I3].
9. **The print budget is real, and it is the fax.** At 70 days the axis gives about 19 fax pels per day [A]. Hairlines under about 0.75 pt and any grey-only meaning are at risk [S87, S88]. Labels need about 8 pt or more [S90]. Glyph shape and fill, numerals, and letters are the channels that survive [A].
10. **There is no veterinary reader evidence for any of this.** Every reading study above involves human-medicine clinicians or lay readers. The in-house cold reads are still the only veterinary evidence (I3). A precedent's success transfers only as far as the reader does [A].

---

## 8. Research debt

- **No veterinary reading study** of any multi-lane record was found (a Europe PMC search for veterinary record visualisation returned nothing relevant; the only vet-pathology guidance is the Society of Toxicologic Pathology's toxicology-data "points to consider" [S92]). A 5–8 GP cold-read panel on the drawn strip is still the only way to get vet evidence.
- **Swimmer plots and event charts have never been tested for reading accuracy**, as far as this pass could find (four "swimmer plot" titles, all applications).
- **No study compared time-of-day views with calendar views** for detecting latency or clock-time patterns, in any clinical population.
- **No evidence on which "no data" glyph** (hatch, hollow, grey, text) survives fax and photocopy or is read correctly by clinicians. The one map study found has not yet reported results [S77].
- **No physical fax or photocopy test was run.** The fax geometry here is calculated from the T.4 draft (RFC 804) [S87]. Fax the drawn mock through a real machine in standard and fine modes and photocopy it twice (a 30-minute test).
- **Consumer report layouts are unverified.** Seizure Tracker, Migraine Buddy, mySymptoms, Cara Care, Monash, Clue, EczemaWise and the IBD apps need real exports in hand. "Digestly" does not appear to exist under that name.
- **Primary texts not read:**
  - Eaton et al. 2005 (read through Song & Szafir).
  - Powsner & Tufte 1994.
  - van Wijk & van Selow 1999.
  - Goldberg & Helfman 2011.
  - The Sultanum et al. 2018 full text.
  - The full Christofidis 2014 paper (*n* not in the abstract).
  - The Brath critique of Isenberg.
- **Isenberg et al. 2011 is not a two-variable dual-axis study.** It tested focus and context on one scale. No direct experiment on two-variable dual axes for correlation or causation judgements was found.
- **The Tidepool encodings** (dotted undelivered basal, smoothed trace) and Clue's report contents are snippet grade (403).
- **The paper anesthesia record's glyph legend** was unreadable (TLS failure, then 503). Its caret convention is snippet grade.
- **The BT-45 and NICU evidence is about roughly 45 minutes of continuous physiology** with discrete events. Its transfer to a 70-day daily-count record is unknown [A].
- **Heer's 6.8 mm optimum is a screen value-estimation result.** No print-specific lane-height study was found.
- **Diabetes report evaluations:** no reader-performance study of the AGP layout itself (against alternatives) was found among the abstracts checked. The 4–19 minute saving in I2 is time, not accuracy.

---

## 9. Sources

All accessed 2026-10-11. Grades:
- **pdf**: retrieved and text-extracted locally.
- **abstract**: read verbatim through the Europe PMC, Crossref or OpenAlex API.
- **fetched**: page body retrieved.
- **snippet**: search-result excerpt only.
- **citation**: record only.

| # | Source | URL | Grade |
|---|---|---|---|
| S1 | Plaisant C, Milash B, Rose A, Widoff S, Shneiderman B. LifeLines: visualizing personal histories. CHI '96 | https://www.cs.umd.edu/~ben/papers/Plaisant1996LifeLines.pdf | pdf |
| S2 | Alonso DL, Rose A, Plaisant C, Norman KL. Viewing personal history records: a comparison of tabular format and graphical presentation using LifeLines. Behav Inf Technol 1998;17(5):249–262 (CS-TR-3795) | https://drum.lib.umd.edu/items/c92aa8c0-478d-491a-b2da-68b0a1ffbd3e/full | abstract |
| S3 | Wang TD, Plaisant C, Quinn AJ, Stanchak R, Murphy S, Shneiderman B. Aligning temporal data by sentinel events: discovering patterns in electronic health records. CHI 2008 | https://www.cs.umd.edu/~ben/papers/Wang2008Aligning.pdf | pdf |
| S4 | Wongsuphasawat K, et al. LifeFlow: visualizing an overview of event sequences. CHI 2011 (doi:10.1145/1978942.1979196); HCIL LifeFlow page | https://www.cs.umd.edu/~ben/papers/Wongsuphasawat2011LifeFlow.pdf · https://www.cs.umd.edu/hcil/lifeflow/ | pdf, fetched |
| S5 | HCIL EventFlow page; Monroe M, et al. Temporal event sequence simplification. IEEE TVCG 2013 (doi:10.1109/TVCG.2013.200) | http://hcil.umd.edu/eventflow · https://api.openalex.org/works/doi:10.1109/tvcg.2013.200 | fetched, abstract |
| S6 | Wongsuphasawat K, Gotz D. Exploring flow, factors, and outcomes of temporal event sequences with the Outflow visualization. IEEE TVCG 2012 (doi:10.1109/TVCG.2012.225) | https://api.openalex.org/works/doi:10.1109/tvcg.2012.225 | abstract |
| S7 | Ahmed A, Chandra S, Herasevich V, Gajic O, Pickering BW. The effect of two different EHR user interfaces on intensive care provider task load, errors of cognition, and performance. Crit Care Med 2011 (PMID 21478739) | https://europepmc.org/article/MED/21478739 | abstract |
| S8 | Wright MC, et al. Toward designing information display to support critical care. Appl Clin Inform 2016 (PMID 27704138) | https://europepmc.org/article/MED/27704138 | abstract |
| S9 | HistoriView: a scalable space-efficient timeline without zoom interactions. Appl Clin Inform 2024 (PMID 38359876) | https://europepmc.org/article/MED/38359876 | abstract |
| S10 | Belden JL, Wegier P, Patel J, et al. Designing a medication timeline for patients and physicians. JAMIA 2019;26(2):95–105 (PMID 30590550) | https://pmc.ncbi.nlm.nih.gov/articles/PMC7647176/ | abstract + fetched |
| S11 | Multnomah County Adult Care Home policy guidance: Medication Administration (rev. 4/26) | https://multco.us/file/medication_administration_house_policy/download | pdf |
| S12 | Florida Administrative Code 65G-7.008 (MAR reason codes) | https://flrules.org/gateway/notice_Files.asp?ID=5426876 | snippet |
| S13 | Tidepool support: Daily view articles | https://support.tidepool.org/hc/en-us/articles/360029685351 | snippet (403) |
| S14 | Powsner SM, Tufte ER. Graphical summary of patient status. Lancet 1994 (PMID 7914312) | https://europepmc.org/article/MED/7914312 | citation |
| S15 | WHO. WHO labour care guide: user's manual. 2020 (ISBN 9789240017566) | https://www.rsu.lv/sites/default/files/book_download/9789240017566-eng.pdf | pdf |
| S16 | Lavender T, Cuthbert A, Smyth RMD. Effect of partograph use on outcomes for women in spontaneous labour at term and their babies. Cochrane 2018 (PMID 30080256) | https://europepmc.org/article/MED/30080256 | abstract |
| S17 | Vogel JP, et al. Usability, acceptability, and feasibility of the WHO Labour Care Guide. Birth 2021 (PMID 33225484) | https://europepmc.org/article/MED/33225484 | abstract |
| S18 | Christofidis MJ, Hill A, Horswill MS, Watson MO. A human factors approach to observation chart design can trump health professionals' prior chart experience. Resuscitation 2013 (PMID 23041534) | https://europepmc.org/article/MED/23041534 | abstract |
| S19 | Christofidis MJ, et al. Observation charts with overlapping blood pressure and heart rate graphs do not yield the performance advantage that health professionals assume. J Adv Nurs 2014 (PMID 23981204) | https://europepmc.org/article/MED/23981204 | abstract |
| S20 | Christofidis MJ, et al. Less is more: the design of early-warning scoring systems affects the speed and accuracy of scoring. J Adv Nurs 2015 (PMID 25645881) | https://europepmc.org/article/MED/25645881 | abstract |
| S21 | Christofidis MJ, et al. Observation chart design features affect the detection of patient deterioration. J Adv Nurs 2016 (PMID 26556775) | https://europepmc.org/article/MED/26556775 | abstract |
| S22 | ICIQ Bladder Diary case-report form (NIDDK LURN repository); Bright E, Cotterill N, Drake M, Abrams P. Developing and validating the ICIQ bladder diary. Eur Urol 2014 (PMID 24647230) | https://repository.niddk.nih.gov/media/studies/lurn_pro/Forms/Phenotyping%20CRFs/Questionnaire_%20ICIQ%20Bladder%20Diary.pdf · https://europepmc.org/article/MED/24647230 | pdf, abstract |
| S23 | Paper anesthesia and sedation record conventions (ADSA form; PMC figure caption) | https://www.ncdentalboard.org/PDF/2%20-%20Website%20form%20-%20ADSA%20Sedation%20and%20Anesthesia%20Record.pdf · https://pmc.ncbi.nlm.nih.gov/articles/PMC5789504/figure/F4 | snippet |
| S24 | JMP Clinical documentation: Disease Response Swimmer Plot | https://jmp.com/support/downloads/JMPC172_documentation/Content/JMPCUserGuide/DiseaseSwimmerPlot.htm | fetched |
| S25 | Europe PMC title search, "swimmer plot(s)" (4 hits) | https://www.ebi.ac.uk/europepmc/webservices/rest/search | abstract |
| S26 | Lee JJ, Hess KR, Dubin JA. Extensions and applications of event charts. Am Stat 2000;54(1):63–70 (doi:10.1080/00031305.2000.10474511) | https://api.openalex.org/works/doi:10.1080/00031305.2000.10474511 | abstract |
| S27 | R Hmisc reference: `event.chart` | https://search.r-project.org/CRAN/refmans/Hmisc/html/event.chart.html | fetched |
| S28 | Phillips R, et al. Visualising harms in publications of randomised controlled trials: consensus and recommendations. BMJ 2022 (PMID 35577357) | https://pmc.ncbi.nlm.nih.gov/articles/PMC9108928/ | abstract + full text |
| S29 | Abbott. FreeStyle Libre AGP Report with Time in Range (ADC-73104 v1.0, sample) | https://provider.freestyle.abbott/content/dam/adc/provider/countries/ca-en/pdfs/ADC-73104v1.0-Ambulatory-Glucose-Profile-Report_FINAL.pdf.coredownload.pdf | pdf |
| S30 | Abbott. LibreView HCP detail aid (Ireland) | https://pro.freestyle.abbott/content/dam/adc/pro/countries/ie-en/documents/DIGITAL,%20IE%20LibreView%20HCP%20Detail%20Aid.pdf | pdf |
| S31 | Dexcom. Dexcom Clarity User Guide for Clinics | https://productstore.clarity.dexcom.eu/Documentation/en/Dexcom_Clarity_User_Guide_Clinic.pdf | pdf |
| S32 | Simonson GD, et al. Expert panel recommendations for a standardized AGP report for connected insulin pens. Diabetes Technol Ther 2024 (PMID 38758213) | https://europepmc.org/article/MED/38758213 | abstract |
| S33 | Bergenstal RM, et al. Recommendations for standardizing glucose reporting and analysis… the AGP. Diabetes Technol Ther 2013 (PMID 23448694) | https://europepmc.org/article/MED/23448694 | abstract |
| S34 | Latin American expert recommendations on CGM data interpretation, 2025 (PMID 40340929); Interpretation of the AGP in community pharmacy, 2026 (PMID 42774048) | https://europepmc.org/article/MED/40340929 · https://europepmc.org/article/MED/42774048 | abstract |
| S35 | NHS Tayside. Pump data interpretation using Tidepool | https://rightdecisions.scot.nhs.uk/nhs-tayside-paediatrics-pathways/paediatric-diabetes/pump-data-interpretation-using-tidepool | fetched |
| S36 | LGS Foundation. Keeping a seizure diary | https://www.lgsfoundation.org/keeping-a-seizure-diary/ | fetched |
| S37 | Hoppe C, Poepel A, Elger CE. Epilepsy: accuracy of patient seizure counts. Arch Neurol 2007 (PMID 17998441) | https://europepmc.org/article/MED/17998441 | abstract |
| S38 | ICHD-3. 8.2 Medication-overuse headache | https://ichd-3.org/8-headache-attributed-to-a-substance-or-its-withdrawal/8-2-medication-overuse-headache-moh/ | fetched |
| S39 | Migraine Buddy listings (AppleVis; Healthify NZ) | https://applevis.com/apps/ios/medical/migraine-buddy · https://healthify.nz/migraine-buddy-app | snippet |
| S40 | IBD app listings (GutLog, Mirae, IBDsmart) | https://apps.apple.com/app/id6745683985 · https://apps.apple.com/app/id6769667060 · https://guthealthnetwork.com/resources-page/ibd/ibd-smart | snippet |
| S41 | National Eczema Association. EczemaWise app | https://nationaleczema.org/eczemawise-app | snippet |
| S42 | Pfaar O, et al. Recommendations for the standardization of clinical outcomes used in allergen immunotherapy trials (EAACI). Allergy 2014 (PMID 24761804); MASK-air CSMS study 2026 (PMID 42276378) | https://europepmc.org/article/MED/24761804 · https://europepmc.org/article/MED/42276378 | abstract |
| S43 | Clue. What is the report for my doctor? | https://support.helloclue.com/hc/en-us/articles/37230173214237-What-is-the-report-for-my-doctor | snippet (403) |
| S44 | Endicott J, Nee J, Harrison W. Daily Record of Severity of Problems (DRSP): reliability and validity. Arch Womens Ment Health 2006 (PMID 16172836) | https://europepmc.org/article/MED/16172836 | abstract |
| S45 | mySymptoms Food Diary listing | https://apps.apple.com/app/id405231632 | snippet |
| S46 | Cara Care listing; Cara Care clinician page | https://apps.apple.com/us/app/cara-care-ibs-fodmap-tracker/id1133687886 · https://cara.care/en/doctors/ | snippet |
| S47 | Monash FODMAP. Reintroduction using the diary function; app FAQ | https://monashfodmap.com/blog/reintroduction-using-diary-function · https://monashfodmap.com/get-app-help/ | fetched (blog), snippet (FAQ) |
| S48 | Search for "Digestly" (no such app found) | n/a | snippet |
| S49 | Schroeder J, Hoffswell J, Chung CF, Fogarty J, Munson S, Zia J. Supporting patient-provider collaboration to identify individual triggers using food and symptom journals. CSCW 2017 | https://homes.cs.washington.edu/~jfogarty/publications/cscw2017-triggers.pdf | pdf |
| S50 | Zia J, et al. Inter-rater reliability of provider interpretations of IBS food and symptom journals. J Clin Med 2017 (PMID 29113044) | https://europepmc.org/article/MED/29113044 | abstract |
| S51 | Karkar R, et al. TummyTrials: a feasibility study of using self-experimentation to detect individualized food triggers. CHI 2017 | https://people.cs.umass.edu/~rkarkar/pubs/conf-chi2017-tummytrials.pdf | pdf |
| S52 | Chung CF, et al. Boundary negotiating artifacts in personal informatics. CSCW 2016 | https://homes.cs.washington.edu/~jfogarty/publications/cscw2016.pdf | pdf |
| S53 | Stone AA, Shiffman S, Schwartz JE, Broderick JE, Hufford MR. Patient compliance with paper and electronic diaries. Control Clin Trials 2003 (PMID 12689739); companion BMJ 2002;324:1193 | https://europepmc.org/article/MED/12689739 | abstract (BMJ citation only) |
| S54 | Law AS, Freer Y, Hunter J, Logie RH, McIntosh N, Quinn J. A comparison of graphical and textual presentations of time series data to support medical decision making in the NICU. J Clin Monit Comput 2005 (PMID 16244840) | https://europepmc.org/article/MED/16244840 | abstract |
| S55 | van der Meulen M, Logie RH, Freer Y, Sykes C, McIntosh N, Hunter J. When a graph is poorer than 100 words. Appl Cogn Psychol 2010;24:77–89 (doi:10.1002/acp.1545) | https://api.crossref.org/works/10.1002/acp.1545 | abstract |
| S56 | Portet F, Reiter E, Gatt A, Hunter J, Sripada S, Freer Y, Sykes C. Automatic generation of textual summaries from neonatal intensive care data. Artif Intell 2009;173:789–816 | https://www.um.edu.mt/library/oar/bitstream/123456789/22142/1/bt45-aij.pdf | pdf |
| S57 | Elting LS, Martin CG, Cantor SB, Rubenstein EB. Influence of data display formats on physician investigators' decisions to stop clinical trials. BMJ 1999 (PMID 10356010) | https://europepmc.org/article/MED/10356010 | abstract |
| S58 | Bauer DT, Guerlain S, Brown PJ. The design and evaluation of a graphical display for laboratory data. JAMIA 2010 (PMID 20595309) | https://europepmc.org/article/MED/20595309 | abstract |
| S59 | Torsvik T, Lillebo B, Mikkelsen G. Presentation of clinical laboratory results: an experimental comparison of four visualization techniques. JAMIA 2013 (PMID 23043123) | https://europepmc.org/article/MED/23043123 | abstract |
| S60 | Pieczkiewicz DS, Finkelstein SM. Evaluating the decision accuracy and speed of clinical data visualizations. JAMIA 2010 (PMID 20190060); a method paper (multi-reader multi-case design) for future vet testing | https://europepmc.org/article/MED/20190060 | abstract |
| S61 | Sultanum N, Brudno M, Wigdor D, Chevalier F. More Text Please! CHI 2018 (doi:10.1145/3173574.3173996); University of Toronto news item | https://web.cs.toronto.edu/news-events/news/award-winning-text-visualization-research-aims-to-support-health-care-workers-navigating-patient-records | fetched (news), snippet (paper) |
| S62 | Xiong C, Shapiro J, Hullman J, Franconeri S. Illusion of causality in visualized data. IEEE TVCG 2020 (VIS 2019) | https://mucollective.northwestern.edu/files/2019-Correlation%20Causation-VIS.pdf | pdf |
| S63 | Matyas TA, Greenwood KM. Visual analysis of single-case time series. J Appl Behav Anal 1990 (PMID 16795732) | https://europepmc.org/article/MED/16795732 | abstract |
| S64 | Ninci J, Vannest KJ, Willson V, Zhang N. Interrater agreement between visual analysts of single-case data: a meta-analysis. Behav Modif 2015 (PMID 25878161) | https://europepmc.org/article/MED/25878161 | abstract |
| S65 | Matute H, et al. Illusions of causality: how they bias our everyday thinking and how they could be reduced. Front Psychol 2015 (PMC4488611) | https://pmc.ncbi.nlm.nih.gov/articles/PMC4488611/ | full text |
| S66 | Kong HK, Liu Z, Karahalios K. Trust and recall of information across varying degrees of title-visualization misalignment. CHI 2019 | https://mail.zcliu.cs.umd.edu/vistitles/degree-of-misalignment-CHI19.pdf | pdf |
| S67 | Kong HK, Liu Z, Karahalios K. Frames and slants in titles of visualizations on controversial topics. CHI 2018 | https://mail.zcliu.cs.umd.edu/vistitles/CHI18-VisTitles.pdf | snippet |
| S68 | Isenberg P, Bezerianos A, Dragicevic P, Fekete JD. A study on dual-scale data charts. IEEE TVCG 2011;17(12):2469–2478 | https://api.openalex.org/works/doi:10.1109/tvcg.2011.160 | abstract |
| S69 | Brath R, et al. Why two y-axes? (Uncharted presentation, 2020) | https://uncharted.software/assets/WhyTwoYAxes_Y2Y_presentation.pdf | snippet |
| S70 | ONS Digital. Dueling with axis: the problems with dual axis charts (2019) | https://digitalblog.ons.gov.uk/2019/07/03/dueling-with-axis-the-problems-with-dual-axis-charts | fetched |
| S71 | Javed W, McDonnel B, Elmqvist N. Graphical perception of multiple time series. IEEE TVCG 2010;16(6):927–934 | https://cs.au.dk/~elm/pdf/multilinevis.pdf | pdf |
| S72 | Ondov B, Jardine N, Elmqvist N, Franconeri S. Face to face: evaluating visual comparison. IEEE TVCG 2019;25(1):861–871 | https://cs.au.dk/~elm/pdf/face2face.pdf | pdf |
| S73 | Heer J, Kong N, Agrawala M. Sizing the horizon. CHI 2009 | https://hci.stanford.edu/courses/cs448b/w09/Heer-Horizon.pdf | pdf |
| S74 | Song H, Szafir DA. Where's my data? Evaluating visualizations with missing data. IEEE TVCG 2019;25(1):914–924 | https://par.nsf.gov/servlets/purl/10111567 | pdf |
| S75 | Eaton C, Plaisant C, Drizd T. Visualizing missing data: graph interpretation user study. INTERACT 2005 (doi:10.1007/11555261_68) | https://doi.org/10.1007/11555261_68 | citation (content via S74) |
| S76 | Gschwandtner T, Bögl M, Federico P, Miksch S. Visual encodings of temporal uncertainty: a comparative user study. IEEE TVCG 2016;22(1):539–548 | https://www.cvast.tuwien.ac.at/sites/default/files/bibcite/435/PubDat_242383.pdf | pdf |
| S77 | Polat Kayali M, Basiri A. The importance of communication with missing data with colours of map for decision-making. LBS 2023 | https://eprints.gla.ac.uk/322794/1/322794.pdf | pdf |
| S78 | PQA proportion of days covered (PDC) measure summaries (NH Medicaid appendix and others) | https://medicaidquality.nh.gov/sites/default/files/user-uploads/11/Appendix_V__Proportion_of_Days_Covered_%28PDC%29_Calculations%20%282%29.pdf | snippet |
| S79 | Kyriacou DN, Lewis RJ. Confounding by indication in clinical research. JAMA 2016 (PMID 27802529) | https://europepmc.org/article/MED/27802529 | citation |
| S80 | Waldner M, Diehl A, Gračanin D, Splechtna R, Delrieux C, Matković K. A comparison of radial and linear charts for visualizing daily patterns. IEEE TVCG 2020;26(1):1033–1042 | https://www.cg.tuwien.ac.at/research/publications/2019/waldner-2019-rld/waldner-2019-rld-paper.pdf | pdf |
| S81 | Goldberg JH, Helfman JI. Eye tracking for visualization evaluation: reading values on linear versus radial graphs. Inf Vis 2011;10(3):182–195 | n/a | citation |
| S82 | van Wijk JJ, van Selow ER. Cluster and calendar based visualization of time series data. InfoVis 1999 | n/a | snippet |
| S83 | zeitR actogram vignette (double-plotted actograms) | https://circadia-bio.r-universe.dev/zeitR/doc/actogram.html | fetched (partial) |
| S84 | Brehmer M, Lee B, Bach B, Riche NH, Munzner T. Timelines revisited: a design space and considerations for expressive storytelling. IEEE TVCG 2017 | https://api.openalex.org/works/doi:10.1109/tvcg.2016.2614803 | abstract |
| S85 | Ferguson L, Wennogle SA, Webb CB. Bilious vomiting syndrome in dogs: retrospective study of 20 cases (2002–2012). JAAHA 2016 (PMID 27008323) | https://europepmc.org/article/MED/27008323 | abstract |
| S86 | Cowan N. The magical number 4 in short-term memory. Behav Brain Sci 2001 (PMID 11515286) | https://europepmc.org/article/MED/11515286 | abstract |
| S87 | RFC 804: CCITT draft recommendation T.4 (Group 3 facsimile) | https://www.rfc-editor.org/rfc/rfc804.txt | fetched |
| S88 | Seismological Society of America. Art guidelines | https://www.seismosoc.org/publications/ssa-art-guidelines/ | fetched |
| S89 | Cambridge / AIAA figure line-weight guidance | https://aiaa.org/publications/journals/journal-author/guidelines-for-journal-figures-and-tables | snippet |
| S90 | Legge GE, Bigelow CA. Does print size matter for reading? J Vis 2011 (PMID 21828237) | https://pmc.ncbi.nlm.nih.gov/articles/PMC3428264/ | abstract |
| S91 | Fax font-size vendor guidance (FaxAuthority; Alohi help) | https://faxauthority.com/faq/what-is-the-best-font-for-a-fax/ · https://help.alohi.com/hc/en-us/articles/27585110167836 | snippet |
| S92 | Troth SP, et al. Points to consider: data visualization for clinical and anatomic pathologists. Toxicol Pathol 2018 (PMID 29843574) | https://europepmc.org/article/MED/29843574 | abstract |

**Internal (read this pass).**
- **I1**: `2026-09-vet-report-visual-design-sweep.md`, §1, §4, §5, §7–§9 (committed at `docs/research/2026-09-vet-report-visual-design-sweep.md`).
- **I2**: `2026-09-vet-report-distribution-channel.md`, §5–§7 (same folder).
- **I3**: `2026-09-09-vet-report-v2-design-exploration.md`, the session record and its cold-read addendum (same folder).
- **I4**: `docs/research/2026-05-event-timestamp-uncertainty.md` (header).
- **I5**: `docs/research/2026-05-feeding-windows-and-partial-eating.md` (§1 and the free-feeding lines).

---

## §V — verification passes (append-only; none yet)
