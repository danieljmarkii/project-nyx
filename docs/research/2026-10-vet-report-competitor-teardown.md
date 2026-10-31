# Competitor vet reports: layouts, generation flows and what powers them

**Status:** 🧊 Frozen evidence, re-verify at use. Evidence only; product calls live on [CUL-2275](https://linear.app/projectnyx/issue/CUL-2275).
**Context:** round 3 (clean slate) of the vet report redesign, [CUL-2275](https://linear.app/projectnyx/issue/CUL-2275). Isolated sweep, about 120 tool calls; no app installed, no rival PDF generated.

**Sweep date:** 2026-10-30. **Extends** `docs/research/2026-09-vet-report-distribution-channel.md` §4 and `docs/culprit-competitive-landscape-2026-10.md` §5–6. Every claim was re-checked at use.
**Method:** I fetched App Store listing pages directly (`apps.apple.com/us/app/id…`). For each one I parsed the full description, the version history with dates, the in-app purchase prices and the rating count, then downloaded the screenshots at full resolution and read them. I fetched competitor websites and demo pages as HTML. The Zoetis Apoquel 2026 and Cytopoint itch-tracker PDFs were downloaded and rendered. **No app was installed and no in-app PDF was generated.** The closest we come to seeing a real report is Amaeru's and Petfetti's store screenshots of rendered PDFs, Pawsitive's iPad screenshots of its composed document, ThePawcess's live demo page and the two pharma PDFs.

**Evidence tags:**
- `[fetched]`: I read the page or listing.
- `[screenshot-described]`: I looked at the store screenshot myself.
- `[snippet]`: search-result text only.
- `[inferred]`: my reading, not stated by the source.
- `[prior]`: carried from the September or October brief without re-verifying.
- `[unverified]`: I tried and could not confirm.

---

## (a) Summary table

Ratings are US App Store counts as of 2026-10-30. "Flow" grades the generate-and-send flow on what is visible: **A** = composed scope plus section control plus preview plus several send targets; **B** = range plus preview or share; **C** = one export button; **–** = not visible.

| Product (ratings) | Report format · how shared | Price of the report | Page 1 / top of report | Charts | AI in report? | What powers it | Flow |
|---|---|---|---|---|---|---|---|
| **Pawsitive** (3) | PDF; one-page "Vet Summary" as **link, image or PDF**; weekly report as image/PDF/link; desktop web | Composer "free and unlimited for a limited time" at launch (v1.7, Jul 2026); Premium $9.99/mo, $99.99/yr; "logging is always free" | Pet header with condition badge; one-sentence summary with denominators ("Medications: 25 of 30 doses logged"); 4 KPI tiles; a "Week at a glance" grid where cell colour shows how fully the day was logged | Lab table with reference-range band sparklines; MAR-style med flowsheet (● given / ○ no log); glucose curves; weight line | Composer: **"adds no interpretation"**. Separate "AI Care Report" and an AI visit-recording summary | Lab OCR (140+ markers, ranges kept as printed, unit conversion), 130+ drug guide, food catalog (3,500 SKUs), voice logging ("Pozi"), Watch, NFC/QR log tags | **A** |
| **PawSolids** (0) | PDF via share sheet | Pro $4.99/wk, $6.99/mo, $34.99/yr; whether export is Pro `[unverified]` | `[unverified]`: PDF not shown | `[unverified]` | Separate "AI reports" on days 3, 7 and 21; headline "LOOKS GOOD" | AI stool photo scan, meal→symptom ratio ("6.2x"), food scan (47,000+ foods), 3-week plan | **A−** |
| **WagWatch** (11) | PDF; per-category CSV; **expiring, revocable read-only web link** (30 days); AI "vet visit report" to copy or read aloud | PDF free for the last 60 days; any range, links and AI report are Premium ($3.99/mo, $24.99/yr) | Link page: last 90 days with medication and vaccine lists `[fetched]`; PDF layout `[unverified]` | Day-rating line, weekly potty/medical lines with dashed trend lines, calendar heatmap | **Yes**: AI vet-visit summary of 90 days **with questions to ask**; AI weekly review labelled "Written by AI from your own entries. Not veterinary advice." | 1–5 day and night ratings, event logs, household logging, an assistant grounded in the logs | **A−** |
| **KOTrol** (cats; 0) | PDF ("Vet-View"), a "Report with documents" bundle (PDF + spreadsheet + medical files), CSV/Excel/Google Sheets, "Send directly" | **Vet report free on the Basic plan** (1 cat, 90 days); Premium $2.99/mo, $24.99/yr | Vet-View: weight, respiration, a status dot "Within range", vomiting "0x vs previous period", **"No deviations noted on 30 of 30 check-in days"**, then "Clinical summary for the veterinarian: **Stable**" | Weight trend; KPI tiles | `[unverified]`: no LLM stated; reads data from photos | Chronic-condition modules (CKD, IBD, asthma, FLUTD, etc.), elimination-diet calendar, food-tolerance analysis, document vault | **A−** |
| **Tend & Mend** cat (0) / Canine (0) | PDF | **Premium** ($3.99/mo, $34.99/yr); free plan sees 14 days | In-app "record your vet can read": program progress ("Litter trouble · Week 2 of 4 · 43 meals and 4 stools logged so far"), then a day-by-day meals × stools dot grid | Dot grid (**"A ring is a day with none"**); per-protein bars "89 of 147 meals were fine · 1.8× vs average"; Canine PDF has a **"confidence interval chart"** | No LLM stated; a rules "insight engine" | 4-week "Mend" programs (Vomiting / Litter / New medication), per-food rate against the pet's own baseline, protein grouping, open-can tracking, community norms | **B** |
| **Amaeru** (0) | PDF | **$1.99 "Vet Report Pass"**: unlimited PDFs for 7 days, no subscription | **A cover page** (logo, "Digestive Health Report", pet photo, period, generated date, disclaimer) | Bristol trend line with a shaded 3–5 normal band; weekly tables | No; "automatically generated" | Bristol stool logs, meal log (g/day, kcal), therapies | **B** |
| **ThePawcess** (web) | Web page, print or save as PDF | $39 one-time per dog (report "at the finish") | **"Elimination Trial Summary — Bailey · Prepared for the attending veterinarian"**: tiles "96% compliance score · 81/84 days logged", "4.2 → 0.8 itch severity ▼" | 84-day itch line; ranked trigger list | **Yes**: "Generated by AI from 81 daily logs" | AI label check, slip triage, cupboard audit, "flare forensics", reintro dosing | **B** |
| **PawTrial** (iOS; listing not resolvable) | On-screen report free; PDF/CSV/JSON in Pro | Pro price `[unverified]` | Site mock: "Day 14 of 84", "Diet compliance 12 of 14 days clean · 1 exposure", "Itching trend Easing: 7-day average 3.7, down from 6.7 at baseline" | Itch trend | No ("Your vet interprets") | Daily 0–10 scores on 5 dermal/GI signs, first-week baseline, slip and treatment log, progress photos, reintroduction (Pro), on-device only | **B** |
| **Petfetti** (32) | PDF | Plus $2.49 / $5.99 / $39.99 | Branded header, pet card (species, sex, age, sterilised, owner), then **day-by-day entries** with status chips ("Eating · Elevated") | Owner charts in app; in PDF `[unverified]` | No | Daily check-ins, condition tracker, libraries | **B−** |
| **CompanAIn** (25) | **Web Vet Portal** (owner invites a vet by email; **clinic invite link or QR**, added in v1.0.9, 2026-10-29) | $9.99–$54.99/mo tiers | Portal: Summary / Health Flags / Vaccines / Medication / Visits tabs; Health Timeline; "Key Changes"; "Key Findings" | Lab trend line per marker | **Yes**: AI narrative ("mostly healthy… not urgent"); a "Recommendation: No action is needed. Maintain routine checkups." card | Document upload and extraction, "Multi-Diagnosis Reasoning Agent", "Longitudinal Pattern & Response Agent" | **B** (portal) |
| **PetDocs** (0) | "Health summaries" and "pre-visit reports" PDF; JSON/CSV | Pro $3.99/mo; Family $6.99/mo | `[unverified]` | 7/30-day meal summaries | AI chat "organize what to observe or ask your vet next" | OCR of vaccine records, receipts and labels; food catalog | **C+** |
| **Petalife** (2) | PDF of the photo-analysis report; "Yearly Pet Health Report" | Free (no IAP listed) | Stool/vomit/urine analysis with "Urgency Score"; home screen says "**Misty is in great condition today!**" | – | Yes (photo AI, chat) | Photo AI on "60+ health risks", Purina gut program, product recommendations | **C** |
| **Sure Petcare** (451) | PDF of the activity / feeding / drinking report over a chosen period | Hardware + hub | Device bar charts by period | Bar charts | No | Felaqua water bowl, microchip feeder and flap | **C+** |
| **PETKIT Kitbo** (app 21K) | "Health report" to share with the vet | Hardware | Litter frequency, water, food and weight, **each against the cat's own baseline** | `[unverified]` | Yes (LLM assistant) | AI-camera litter box, fountain, feeder with per-cat recognition | **C** |
| **Fi** | Printable "Health Report", **unlocked after 30+ days** of data; share by screenshot or in-app summary | Collar + membership | Activity, rest, sleep, behaviour; 30-day baseline + recent changes | Behaviour charts | AI behaviour detection | Collar with scratch/lick/eat/drink detection | **C** |
| **Petivity** (738) | Vet Reports by PDF, **emailed manually** per one review | Hardware | `[unverified]` | – | Purina assistant | Litter monitor, feeder | **C** |
| **Tractive** | Weekly Health Report with an "AI-powered summary"; no vet PDF found | Hardware | – | Weekly | Yes | Activity, sleep, heart and respiratory rate | **–** |
| **Zoetis Apoquel 2026 / Cytopoint** | **Fillable PDF** the owner prints and carries | Free (drug marketing) | Yes/no screen → **0–100 descriptor-anchored itch grid** (14 days; Cytopoint: daily for week 1 then weekly to week 8, with an "injection administered" marker and a quality-of-life row) | Hand-plotted grid | No | The owner's pen; pushes reminders, rewards and The Pack | **C** (paper) |
| **Merck Numelvi itch tracker** | Downloadable tracker | Free | Daily itch scale | – | No | – | `[unverified]` (page 403) |
| **Chewy** | Vet consult report after "Connect with a Vet"; PetMD symptom-checker printable | Telehealth | Triage report | – | Vet / triage | Telehealth, Rx and diet sales | **C** |

Listing-grade tail, not deep-dived: Vettie, Vet Record, PetLog ×3, Fosia (formerly Veta), PetVitality, Every Wag, The Pack, Synth88 Vetara. See §(b)9.

---

## (b) Per-product sections

### 1. Pawsitive: Pet Health Tracker (Yeonjoo Sung; id6759310183). The most developed report system found. NEW to our record.
- **Footprint.** 3 ratings, 5.0. v1.0 2026-03-13 → **v2.1.0 2026-10-29**: 12 releases in 7 months, ~monthly cadence. 10 languages; iPhone, iPad, Mac, Watch and desktop web. Positioned for chronic and senior care (CKD, diabetes, heart, thyroid); built by a developer with a CKD cat. `[fetched]`
- **Report surfaces (Reports tab).** A segmented row reads **Weekly Care · Report Composer · AI Care Report · Table View · Health Gallery · Our Pets Compared**. Above it sits a pinned **"One-Page Vet Summary: Home care since the last visit, share as a link, image, or PDF for the vet."** `[screenshot-described]`
- **Weekly Care report** (iPad screenshot):
  - Header "Weekly Care Report · 10/23–10/29", then pet photo, name and a **condition badge** "Chronic Kidney Disease (CKD)", then "Cat · British Shorthair · 12 years · 4.32 kg".
  - **A one-sentence lede with denominators:** "Ate an average of 233 kcal a day. Drank an average of 192 ml of water a day. Medications: 25 of 30 doses logged."
  - Four tiles:
    - Calories 233 kcal: "Goal 208–254 · 4 days in range", with a 4/6 ring.
    - Water 192 ml/day: "Suggested 173–259 · avg of 6 days", with a range bar.
    - Medications 83%: "25/30 logged · 5 left today".
    - Weight 4.32 kg: "+0.01 kg vs. previous weigh-in", with a sparkline.
  - Then "Week at a glance" with the legend **"Cell color = how fully logged"**. `[screenshot-described]`
- **Composed document** ("Mochi — 3-month kidney care report"): **Document | Sections** tabs, pet chip, and presets **Last 7 / 14 / 30 / 90 days**.
  - **Lab Results table.** Columns: analyte, ref range, previous value (08.07), current value (10.21), change (▼−4, ▲+2.0), and a "Last 4 results" sparkline on a shaded reference-range band. Out-of-range rows are tinted, with "Low ▼" / "High ▲" pills. Footnote: *"Comparison always uses the two most recent tests, regardless of the report period… Reference ranges and high/low flags are copied exactly as printed on the lab report. The app does not interpret them."*
  - **Medication Flowsheet.** Header "07.30 → 10.27 · Logged as given 90/90". Rows per drug with dose; ● per given day and ○ for no log; a SubQ fluids (ml) row; and a **"Symptom Events" row aligned under the same day columns** (▲2 on one day). This is a hospital MAR layout. `[screenshot-described]`
- **Composer flow (v1.7.0, 2026-07-05).** "Choose the logs you want to share"; **start from ready-made templates "Pre-Visit Summary," "Diet Trial," or "Daily Vitals"**; **drag blocks to reorder**; "narrow to just the dates you need"; **preview**, then share in one tap. *"Nothing in the report is re-interpreted by the app… The footer even discloses how complete your records are ('Of 30 observed days: fed 30 · meds 28 · weight ×5…')… We leave out diagnoses and verdicts — that call belongs to your vet."* Days with no log show "○, shown honestly", and "even long spans like 90 days stay readable and never get cut off." Blood or mucus in stool "now appear in your reports by name." `[fetched]`
- **Visit prep.**
  - "**Ask the vet" pins** collect questions between visits (v2.0.0).
  - "**Pre-Visit Notes**" with per-species prompts that link to a scheduled visit; the prepared questions "appear right inside the recording screen during the appointment" (v1.4.0).
  - **Vet Visit Recording (beta):** records the consult and returns an AI summary, prescribed meds with schedules, follow-ups, next appointment and costs, "each item… next to the vet's actual quote". `[fetched]`
- **What powers it:** lab-sheet OCR (multi-page, HEIC, 60 more analytes), unit conversion between clinics, a personal-baseline overlay on lab trends, an injection-site body map, a fasting log before blood tests, a water-bowl weighing mode, and food moisture counted toward water. `[fetched]`
- **Diet trial:** a "Diet Trial" report template exists. The Meal Log marks "new ingredient" days "to compare before and after, and show your vet a clean table". No trial object, compliance or exposure logic is described. `[fetched]`; whether the template computes anything is `[unverified]`.
- **Read:** this is the bar for *flow* and for *honest density*. It is chronic-care first, not GI or diet-trial first.

### 2. PawSolids: Dog & Cat Health (Olha Hrynkiv; id6760619350)
- 0 ratings. v1.0 2026-06-05 → v1.1.3 2026-10-28. Pro $4.99/wk, $6.99/mo, $34.99/yr (and a $19.99 discount yearly). `[fetched]`
- **Report flow (v1.0.3):** "export a vet-ready Health Report — turn weeks of logs into one clean, shareable PDF. **Pick a date range, choose what to include (feedings, symptoms, water, stool scans), then preview and share in a tap.**" `[fetched]`
- **The sheet itself** (screenshot "Walk into the vet with answers · Weeks of logs in one PDF"):
  - Header "VET-READY EXPORT · Health report · A shareable PDF of Lukas's logs".
  - **TIME RANGE:** chips **7 days / 30 days / 90 days**, plus FROM / TO date fields (16 Oct 2026 → 22 Oct 2026).
  - **INCLUDE IN REPORT:** toggles, each with a **live count underneath**:
    - Meals & food: "2 entries"
    - Symptoms & reactions: "0 flagged"
    - Water intake: "daily totals"
    - Stool scans: "no scans"
    - Medications: "no doses logged"

  `[screenshot-described]`. The owner sees what each section will contain before generating it, empty sections included.
- **AI reports** (v1.1.0): "PawSolids reads your logs and tells you what changed and what to try next. Reports arrive on day 3, day 7 and day 21." The screenshot shows a "**LOOKS GOOD**" badge and the headline "Two normal stools, steady meals with new foods". It also shows an hourly 24-hour meal / stool / dose timeline with "8.7 h" gaps between meals, and tiles: Food 8 meals · 6 new foods; Meds "2 of 4 · PancrePlus Enzymes 19:00 not logged"; Symptoms 1. `[screenshot-described]`
- **Powers:** an AI stool scanner ("consistency, color, and hydration indicators"), symptom↔meal ratios, and a food scan with calories. Since v1.0.7 the app has drifted toward training lessons and a 3-week plan. `[fetched]`
- **Not seen:** the PDF's own layout `[unverified]`.

### 3. WagWatch (id6787262395; wagwatch.app)
- 11 ratings, 5.0 (the site says "20 ratings on the App Store and Google Play"). v1.0.0 2026-08-22 → v1.4.0 2026-10-27, 25 releases. Web app, iOS, Android, Watch. `[fetched]`
- **Three vet artifacts:**
  1. **"Vet-ready PDF reports."** Free covers the last 60 days; Premium covers any window ("bring the whole year"). History has **7 / 30 / 90 days / Custom** chips and type filters, plus export buttons **Events CSV · Meds CSV · Vaccines CSV · Vet report PDF**. `[fetched]` `[screenshot-described]`
  2. **Share links (Premium).** *"A read-only web page of your pet's recent history… They do not need an account or the app. Links expire automatically after 30 days, and you can revoke one sooner."* On Trends, the screenshot shows **"Share with vet" | "Vet visit report"** buttons and a card "1 active share link · Anyone holding one of these links can open this pet's recent history until it expires. Revoke a link once the visit is done. · Link ending …uzdp2s · Created 10/18/2026 · expires 11/17/2026 · **Revoke**". The page opens in the vet's browser language. `[fetched]` `[screenshot-described]`
  3. **Vet-visit report (Premium, AI).** *"A one-tap AI summary of the last 90 days, with suggested questions to ask. Generate it from Trends, then copy it into an email or read it off your phone in the room."* `[fetched]`
- The AI Weekly Review is labelled "AI-Powered… Written by AI from your own entries. Not veterinary advice." Below it sits a "Weekly Insights" table of metric, value and change vs the prior week ("4.3 · down 0.3"). `[screenshot-described]`
- **Powers:** 1–5 day and night ratings, potty, meals, meds, behaviour, household plus sitter passes, and an assistant "grounded in your pet's actual logged data". `[fetched]`
- **Read:** the only consumer pet app found that manages vet links as a *lifecycle* (create, list, expiry, revoke). The "suggested questions" pattern is here too.

### 4. KOTrol: Cat's health app (Poland; id6763902585). NEW to our record.
- 0 ratings. v1.0 2026-05-14 → v1.4.9 2026-10-17, 22 releases. **Vet report is free on the Basic plan** (1 cat, 90 days of history). Premium $2.99/mo, $24.99/yr. `[fetched]`
- **Framing:** the report answers "the questions every veterinarian asks: **when did it start, how often did it happen, what changed and what was given?**" (listing). "First improvements to the veterinary report, developed in collaboration with veterinarians" (v1.2.x). `[fetched]`
- **Report Center: "Working with Your Vet"**. Three KPI tiles (1 Vomiting (30d) · 50 Medication entries · 87% Active treatment), then **report types by purpose**:
  - "Your cat's week at a glance"
  - **"Vet-View Report"**: timeline, trends and key observations for the selected range
  - **"Diet report"**: plan, confirmed intake, energy-target progress
  - **"Report with documents"**: Vet-View PDF, spreadsheet and medical documents in one export
  - "Medical Vault"
  - "Export data" (CSV, Excel, Google Sheets)
  - a **"Send directly"** link at the foot

  `[screenshot-described]`
- **Vet-View page** (screenshot):
  - Tiles: Weight 5.19 kg (+0.07 kg); Respiration 21/min (max 24/min); STATUS green dot "Within range"; Vomiting 0x "vs previous period".
  - A green band: **"No deviations noted on 30 of 30 check-in days."**
  - "**Clinical summary for the veterinarian**" with a **"Stable"** pill: "The most important information from the report period in one place".
  - Diagnosis chips with certainty: "Asthma — confirmed", "Sensitive stomach / IBD", "Bladder issues (FLUTD) — suspected".
  - "Medications and dosing", with "doses given: 83%" per drug.
  - "Trends": "[weight] increased by 1.4% (+0.07 kg) over 5 [weigh-ins]… (30 days observed)".

  `[screenshot-described]`
- **Powers:** 24+ condition modules, custom observations, an **elimination-diet calendar** (fixed in v1.2.x), food-tolerance "ingredient reaction analysis", photo reading, a "Medication Lock", and co-caregivers. `[fetched]`
- **Read:** the closest structural analogue to our report (a clinical summary block, denominators, diagnosis certainty), and it is **free**. Its "Stable" pill and the "No deviations noted" band are verdicts our posture would not print.

### 5. Tend & Mend: Cat Food & Vomit Tracker (id6760874055) and Canine (id6761289493). Ben McNair-Kim.
- Cat: v1.0.0 2026-04-10 → **v3.0.1 2026-10-24** (19 releases). Canine: v1.0 2026-04-11 → v1.4.1 2026-07-05. Both show 0 ratings. `[fetched]`
- **v3.0 restructure (Oct 2026):**
  - "**Tend**": one appetite tap a day plus a weekly weight. Free.
  - "**Mend**": "a four-week program… Vomiting, Litter trouble or New medication… **finish with a summary you can share with your vet**". Premium.

  The report's scope is the program, so the owner never picks dates. `[fetched]`
- **Vet report:** Premium ("Before an appointment, export a clean summary of your cat's meals, vomiting and food pattern history"). The cat PDF gained litter trends, medication history and coughing episodes in v1.4. **Canine v1.3: "Vet Report — updated layout with potty trends overview and an improved confidence interval chart."** Canine scope control is a segmented **1 month / 3 months / 6 months** plus "Export PDF". `[fetched]` `[screenshot-described]`
- **In-app "A record your vet can read · Every meal, stool and dose, day by day"** (screenshot):
  - Program cards: "Litter trouble · Week 2 of 4", a 4-segment progress bar, "43 meals and 4 stools logged so far".
  - **"Meals and the litter box, day by day"**: a week grid with Meals and Stools rows, one coloured dot per entry by protein (Salmon, Chicken, Turkey, Other) and by stool form (Firm or formed / Soft or watery). Legend: *"Each dot is one entry. **A ring is a day with none.**"*
  - "Since the new medicine, day by day". `[screenshot-described]`
- **Meal Patterns** (screenshot):
  - "Fish Profile · 89 of 147 meals fine · 1.8× vs average".
  - Salmon "⚠ Worth monitoring · 89 of 147 meals were fine · 1.8× vs average".
  - Chicken "✓ **No concern** · 141 of 175 meals were fine"; Turkey "No concern · 56 of 59"; Duck "No concern · 67 of 68".
  - Footer: "Clear picture · Enough history to see which foods agree with your cat… Patterns show association only — not cause. Discuss with your vet before changing diet." `[screenshot-described]`
- **Canine:** "No significant link found between table scraps and bad stools" (16 scrap events; 50% bad stools after scraps vs 51% without). `[screenshot-described]`
- **Read:** the best *denominator discipline* in the pet market ("x of N meals fine"). It also prints per-food **"No concern"** and "No significant link found", which are absence-as-reassurance labels. "What Works" foods link to Amazon (intake read as preference).

### 6. Amaeru: Dog & Cat Diary (id6769683155). The only real rendered PDF found in store art.
- v1.1.90 2026-05-24 → v1.2.8 2026-09-28. **"Vet Report Pass 7 days" $1.99**: "one-time purchase; unlimited PDF reports for seven days; no subscription; no automatic renewal". After payment "you can now immediately choose the report period and download or share the PDF" (v1.2.4). Everything else is free. Premium $2.99/mo exists but is not on the report path. `[fetched]`
- **PDF** (screenshot "Ready when it matters"):
  - **Page 1 is a cover:** logo, "DIGESTIVE HEALTH REPORT", round pet photo, "Connie · Cat · Siberian · 1 year, 3 months", "REPORT PERIOD 26 Jul 2026 — 25 Aug 2026", "Generated on: 25 Aug 2026", and the footer disclaimer "This report was automatically generated by Amaeru (amaeru.eu) as support for your pet's veterinary care. It does not replace professional diagnosis."
  - Page 2:
    - **Therapies & Prevention** table (medication, dosage, completed date, status), with the provenance line **"(Data entered by the owner in the Amaeru app — check against original clinical records)"**.
    - **Bristol Trend**: a line chart with a shaded 3–5 normal band, "⌀ 4.2", "100% Ideal (3-5)", and the axis legend "Bristol Scale: 1–2 = constipation · 3–5 = normal · 6–7 = diarrhea".
    - **Symptom & Stool Record**: a weekly table (Week · No. Evac. · Avg. Bristol · Range), "Routine Bristol 3–5 (37 total)".
    - **Meal Log**: a weekly table (Week · Meals · Grams/day · Kcal/day (est.) · Diet U/S · Key products).

  `[screenshot-described]`
- **Read:** a clean clinical *feel*, an honest provenance line and a good pricing idea. But a whole cover page spends the vet's first glance on branding, and "100% Ideal" is a green verdict.

### 7. ThePawcess (web; thepawcess.com)
- **Live demo report** (`/demo/vet-report`, labelled "This is the real feature, not a mockup"):
  - Header "**Elimination Trial Summary — Bailey** · 84-day salmon elimination trial · **Prepared for the attending veterinarian**", plus a PDF button.
  - Tiles: "**96%** compliance score · **81/84 days logged**" and "**4.2 → 0.8** itch severity ▼".
  - "ITCH SEVERITY · 84 DAYS" line (Day 1 / 42 / 84).
  - "CANDIDATE TRIGGERS · CORRELATION ONLY, NEVER A DIAGNOSIS": Chicken **High** · Flavored heartworm med **Likely** · Beef **Low**.
  - "FLAGGED EXPOSURES": "Day 23 — Training treat at the park (chicken suspected) itch 2 → 4 within 3 days"; "Day 51 — Stole a slice of buttered toast **no flare in the 7-day window**".
  - Footer: "**Generated by AI from 81 daily logs** · supports your veterinarian's workup, never diagnoses." Then "🖨️ Print / save as PDF". `[fetched]`
- The marketing frames it against the vet's usual input: "'He's been itchy for a while… I think it got worse after Christmas?' — WHAT VETS USUALLY HAVE TO WORK WITH. BELOW: WHAT YOURS GETS INSTEAD." `[fetched]`
- **Pricing:** "Complete Trial Pass $39 one-time · per dog… Your vet-ready report at the finish". After 3 free days "new entries lock until you grab the Pass". The optional Food Passport is $4.99/mo or $39.90/yr. The homepage links to Chewy with an affiliate disclosure. `[fetched]`
- **Powers:** an AI label check (150 checks included), slip triage by g/kg dose, a household "fridge card" scanner, a day-0 cupboard audit, AI "flare forensics" (a ranked 1–7-day suspect list) and AI-dosed reintroduction. `[fetched]`
- **Read:** the best *page-one shape* for a diet trial: one clinical question, a before→after number, exposures with dates and outcomes. It also shows the worst conflation: the compliance score equals days logged (81/84 = 96.4%). A model writes it, and it reassures on absence ("no flare in the 7-day window").

### 8. PawTrial (pawtrial.com; package `com.skorg.pawtrial`)
- **Listing status:** the site's App Store link is a placeholder (`id0000000000`). An HTML comment says "numeric app id unknown until the App Store Connect record exists". The Play URL returns 404. **I could not confirm a live store listing on 2026-10-30.** The October brief recorded iOS release 2026-08-03 `[prior]`. `[fetched]` `[unverified]`
- **Report:** "Vet-ready report: A clear summary of symptom trends, compliance, exposures and treatments — prepared for veterinary review. **Pro exports it as a PDF, CSV or JSON.**" "Share with your vet: Review the report summary together, or export a PDF with PawTrial Pro. Your vet interprets — PawTrial just keeps the record straight." `[fetched]`
- **Dashboard mock on the site:** "Biscuit · Hydrolyzed protein diet · Day 14 of 84 · 70 days left"; "Diet compliance **12 of 14 days clean · 1 exposure**"; "Itching trend **Easing** · 7-day average 3.7 — down from 6.7 at baseline". `[fetched]`
- **Powers:** daily 0–10 scores for itching, paw licking, ears, skin and digestion; a first-week baseline; slip-up and treatment logging; progress photos (5 free); reintroduction (Pro); everything on-device, no account. `[fetched]`
- **Read:** the only product that exports **JSON**, the most machine-readable output found. How an unlogged day counts toward "clean" is still not stated.

### 9. Listing-grade tail (re-verified 2026-10-30 unless noted)
- **Petfetti** (pulsify.io; id6471319447). 32 ratings, 4.7; v5.3.1 2026-10-28. The PDF arrived in v3.3.0: "Select your pet, choose any date range… Export logs **grouped by category or see everything in a clear, chronological timeline**." The PDF screenshot shows a blue branded band, a pet card and then **day-grouped entries** ("Tuesday, May 14, 2025": Eating · Elevated, Drinking · Normal, Sleeping · Normal, Energy · Normal on 5-dot scales; Parasite control 8:20 AM Frontline 5 drops; Vitals BP 130/70, HR 120). A dated log, not a synthesis. `[fetched]` `[screenshot-described]`
- **CompanAIn** (id6747678727). 25 ratings, 4.4; v1.0.9 2026-10-29 adds "**Connect with your vet clinic: accept your clinic's invite link or scan its QR code**". This is the first clinic-initiated direction seen; no enrolled clinic was found in October `[prior]`.
  - The Vet Portal screenshot shows a web app with Patients / My Profile, tabs Summary · Health Flags · Vaccines · Medication · Visits, a dated "Health Timeline" ("Morphine treatment started", "Equine Metabolic Syndrome diagnosed", "Mild allergies present"), "Key Changes" (TP 6.60 g/dL trend) and "Key Findings", with a "**Recommendation: No action is needed. Maintain routine checkups.**" card.
  - The phone shows an AI "Poe's Health Summary: Recent Lab Reports… mostly healthy… These changes are not urgent but should be discussed with your veterinarian…".
  - Agents: "Multi-Diagnosis Reasoning Agent", "Longitudinal Pattern & Response Agent (LPRA)". `[fetched]` `[screenshot-described]`
- **Every Wag** (id6747091313). 7 ratings; v2.7.0 2026-10-29. Daily check-in charts, "Health Alerts" ("not a diagnosis"), uploaded vet records, and a **clinic-side "Care Connect by Every Wag"** (vet-created guides, clinic details). No PDF export named in the listing. `[fetched]`
- **PetDocs** (id6757140711). v1.2.1 2026-10-26. "Create health summaries or reports and choose to share them with your vet or family"; v1.2.0 fixed "full-data statistics in health summaries and **pre-visit reports**, and improved PDF dates"; JSON/CSV exports; AI chat to "organize what to observe or ask your vet next"; OCR. Pro $3.99/mo. `[fetched]`
- **Vettie** (id6760741400). v2.0.0 2026-09-05; "PDF report and CSV export" in Pro ($4.99/mo, $39.99/yr); a "2 A.M. card". Unchanged since September. `[fetched]`
- **Vet Record** (id6756975927). 1 rating, 2.0; v"112" 2026-07-07. "Professional PDF Export (Premium)"; free emergency QR. Unchanged. `[fetched]`
- **PetLog – Pet Health Journal** (logforlife; id6747721421). v2.3.0 2026-10-10. "Generate and export PDF reports for your veterinarian"; optional AI insights (cloud only if enabled); Bristol scale; offline. Plus $1.99/mo, $4.99/3 mo, $17.99/yr. `[fetched]`
- **PetLog – Pet Tracker** (id6759348549). PDF health report and vaccine card in Pro ($2.99/mo, $19.99/yr, $39.99 lifetime). `[fetched]`
- **PetLog: AI-powered Health Log** (jp.nooon): "AI Health Coach" summary `[prior]`.
- **Fosia (formerly Veta)** (id6758032978). v1.6.1 2026-09-02. "**Save questions before a veterinary visit** · Record post-visit notes · Create organized health reports for vet visits". Pro $8.99/mo, $34.99/yr, $79.99 lifetime. `[fetched]`
- **PetVitality** (petvitality.io). DVM-founded (Fredrik Johansen, "15,000+ downloads"); "send your vet a clean report of every seizure, cluster and medication change… **Reports and full statistics are part of Premium.**" `[fetched]`
- **The Pack by Zoetis** (id1633459819). ~10K ratings, 4.9; v0.72.0 2026-10-27. No itch or report language in the listing. One review says it can produce a vet report with chosen contents `[snippet]`.
- **Synth88 Vetara:** not found under that name in any search `[unverified]`. Carried from October `[prior]`.

### 10. Hardware-fed reports
- **Sure Petcare** (id1036175339; 451 ratings). "Pet Reports: Export to save or share your pet's data as a PDF with your vet." From the pet dashboard: "access reports for activity, feeding or drinking… export icon". Screenshots: "Review your pet's historic data in detail… Reports can be shared or saved as a PDF", with daily drinking bars. `[fetched]` `[snippet]` `[screenshot-described]`
- **PETKIT Kitbo** (launched 2026-08-18 `[snippet]`). "Kitbo can automatically generate a health report… litter box visit frequency and changes over time; daily water intake trends; food intake and weight changes; **a summary showing how each metric compares with the cat's established baseline**." The page pairs the pattern combinations with differentials ("Increased drinking and increased urine volume: may be associated with… chronic kidney disease, diabetes, or hyperthyroidism"). `[fetched]`
- **Fi.** The Vets section, found via Fi's "Vet Retail Guide" site (fitracking.com/vet-guide), says: "**30+ days of tracked activity unlocks a printable summary**… Activity, rest, sleep, and behavior trends · 30-day baseline + recent changes · Share via screenshot or in-app summary." The clinical playbook for allergies lists "Itch tracking · Treatment response · **Diet trials** · Sleep impact", with the talking point "Instead of asking 'is it better?' — show them a chart." **Fi is recruiting clinics as retailers of Fi Mini.** `[fetched]`
- **Petivity** (Purina; 738 ratings). The listing does not name a report. A manual summary and a review say Vet Reports exist but must be "manually email[ed]" as a PDF `[snippet]`.
- **Tractive:** a "Custom Weekly Report… with an AI-powered summary". No vet PDF found `[fetched]`.

### 11. Pharma paper trackers
- **Apoquel 2026 Itch Symptom Tracker** (Zoetis; InDesign PDF dated 2026-03-17; 2 pages; AcroForm). `[fetched]` `[screenshot-described]`
  - Page 1: four yes/no screening statements, then "If you checked 'yes'… your dog may be suffering from allergic itch, an urgent medical condition."
  - A **0–100 itch grid over 14 days** with six anchored bands (Normal 0 to Extremely severe 100), each with a behavioural descriptor ("Regular scratching while awake. May occasionally wake at night…").
  - Page 2: "**Bring these items with you:** this completed tracker · photos/videos of your dog scratching · list of current treatments you've tried · questions about Apoquel". "**Before you leave your vet appointment, make sure you:** discuss Apoquel… understand the dosing schedule… know what improvements to expect… schedule a follow-up." Then rewards, The Pack, and Important Safety Information.
- **Cytopoint Allergic Itch Tracker** (Zoetis 2023, hosted by AAHA). The same 0–100 scale, but **daily for week 1, then once a week to week 8**, an "Injection administered" marker on the x-axis, and a **Quality of Life** row for dog and family. `[fetched]`
- **Merck Numelvi itch tracker:** the page returned 403 `[unverified]`. A snippet says owners mark a daily itch level to bring to visits `[snippet]`.

### 12. Telehealth and retail
- **Chewy** (v26.41.0 2026-10-20). "Connect with a Vet… leave with a **personalized consult report**"; "Symptom Tracker — Share your pet's symptoms and receive quick advice on what to do next." Triage, not longitudinal. `[fetched]`

### 13. Human-health reference flows (for the generation flow only)
- **Guava Visit Prep.** "Choose from five different types of doctor appointments. Each type will guide you through relevant aspects of that visit type"; auto-pulls meds, conditions and allergies; "List and prioritize your questions… Discover potentially relevant questions"; "Translate your symptoms into doctor-friendly terms. Never stumble on frequency, onset, or severity again"; "Download, send, or print your summary". AI "Auto Prep" drafts it (one free use). `[fetched]` `[snippet]`
- **Glooko:** report presets of 1–90 days or custom, plus a choice of which reports to include `[snippet]`.

---

## (c) Patterns across the market

### Table stakes (most products have them)
1. **A PDF export.** Every owner-logging app checked has one, and in most it is **paid**: Tend & Mend, PawTrial, Vettie, Vet Record, PetLog ×2, PetVitality, WagWatch beyond 60 days, Amaeru's $1.99 pass. **Free:** KOTrol (Basic), WagWatch (60 days), Petalife, the pharma paper trackers, and Pawsitive's composer during launch.
2. **The owner picks a range** from presets or two dates.
3. **A "does not diagnose / replace your vet" footer.**
4. **A medication list** with doses; a weight line.
5. **Hand-off by share sheet.**

### Emerging (two or more products, all since spring 2026)
- **Scope set by an event, not a calendar:**
  - Pawsitive's one-page summary is "home care since the last visit". We do this too.
  - Tend & Mend reports a whole 4-week Mend program.
  - ThePawcess and PawTrial report the trial.
  - Cytopoint's grid is anchored on the injection day.
- **Section control at generation, with live counts:** PawSolids (toggles showing "2 entries" / "0 flagged" / "no doses logged") and Pawsitive (blocks, drag to reorder, templates).
- **Templates or report types by purpose:**
  - Pawsitive: Pre-Visit Summary, **Diet Trial**, Daily Vitals.
  - KOTrol: Week at a glance, Vet-View, **Diet report**, Report with documents.
- **Denominators on the page:**
  - Tend & Mend: "141 of 175 meals were fine".
  - Pawsitive: "25 of 30 doses logged", "4 days in range", "avg of 6 days".
  - KOTrol: "30 of 30 check-in days", "30 days observed".
  - ThePawcess: "81/84 days logged".
  - PawTrial: "12 of 14 days clean".
- **Showing a day with no log as missing, not as normal:** Pawsitive's ○ "shown honestly", its completeness footer and "Cell color = how fully logged"; Tend & Mend's "A ring is a day with none". *Two competitors now draw the missing day. Our report's weekly off-diet chart still draws a measured 0 for a one-meal week ([CUL-1779](https://linear.app/projectnyx/issue/CUL-1779)) `[prior]`.*
- **Visit-prep questions:** Pawsitive's "Ask the vet" pins and pre-visit notes, WagWatch's AI "suggested questions to ask", PetDocs ("organize what… to ask your vet next"), Fosia ("save questions before a veterinary visit"), Apoquel's bring-list and "before you leave" checklist, Guava.
- **Expiring read-only link:** WagWatch (30 days, revocable, list of active links); Pawsitive (one-page summary as link, weekly report as link); CompanAIn (portal).
- **Clinic-side entry points:** CompanAIn's clinic invite link/QR (2026-10-29), Every Wag "Care Connect", Fi's Vet Retail Guide (clinics stock Fi Mini).
- **A separate AI narrative next to a non-AI record:** WagWatch, Pawsitive, PawSolids, CompanAIn, Kitbo, Tractive, Petalife.

### What nobody does (as far as listings, screenshots and demos show)
1. **Saying what a hand-picked range left out.** PawSolids, Pawsitive, WagWatch and Petfetti all let the owner narrow dates freely. None says on the report that symptom events fell outside the chosen window. **Our report already does this** (`app/report.tsx` header comment; `render.ts`). Keep it and say it.
2. **Keeping logging coverage apart from trial adherence, on the trial itself.** ThePawcess merges them (96% = days logged). PawTrial's "12 of 14 days clean" does not say how an unlogged day counts. Pawsitive's completeness footer is the closest, but it has no trial object.
3. **Badging an AI photo read as unconfirmed inside a vet document.** Petalife and PawSolids put photo-AI output into reports with verdict-style labels ("Urgency Score", "Looks good").
4. **A page 1 that states the clinical question being answered** ("Is the diet trial clean enough to judge? Is vomiting more frequent?") for GI or diet trials. ThePawcess's header ("Elimination Trial Summary… Prepared for the attending veterinarian") comes closest, and it is AI-written and paid.
5. **A machine layer built for clinic summarizers.** No one describes one. The nearest are PawTrial's JSON export and PetDocs's JSON/CSV, both separate files. Not one product mentions surviving a clinic LLM (Provet, Vetspire, CoVet), even though that risk was flagged in October `[prior]`.
6. **A free, composed, GI/diet-trial report with section control.** KOTrol is free and composed (cat, chronic care). Pawsitive is composed and free only for a limited time (chronic care). Tend & Mend is GI but paid.

### Best layout ideas worth stealing (evidence, not decisions)
- **Pawsitive's medication flowsheet:** a MAR grid (drugs down, days across, ● given / ○ no log), with **symptom events on a row aligned to the same day columns**. A vet sees dose timing against symptom days in one glance, and the empty circles keep missing data visible. This maps directly onto a trial plus a med course.
- **Pawsitive's lab table:** previous vs current, a change arrow, and a sparkline over the **reference-range band**, with "copied exactly as printed… The app does not interpret them." This is how you print an outside value without owning it.
- **Pawsitive's one-sentence lede with denominators**, followed by four tiles that each carry "n of N" or "avg of N days".
- **Tend & Mend's day-grid legend** "Each dot is one entry. A ring is a day with none.", which is a coverage disclosure in seven words. Also its "x of N meals were fine" per food.
- **Amaeru's provenance line** on owner-entered therapy data: "Data entered by the owner… check against original clinical records". Also its shaded normal band on a Bristol trend with the scale printed under the axis.
- **ThePawcess's page-1 shape for a trial:** trial name, day count, the protein; one before→after number; dated exposures with what followed. (Not its compliance maths or its AI authorship.)
- **KOTrol's diagnosis chips carrying certainty** ("— confirmed" / "— suspected") and its framing around the four questions a vet asks: when it started, how often, what changed, what was given.
- **Kitbo's "each metric against this pet's own baseline".**
- **Cytopoint's x-axis that changes resolution over time** (daily, then weekly) with a treatment marker. Useful for an 8–12-week trial: dense at the start, sparse later.

### Anti-patterns
- **Wasting page 1.** Amaeru spends a whole cover on logo and pet photo. Petfetti opens on the branded band and the pet card, then a dated log.
- **Dumping the log.** Petfetti's PDF, and Vet Record or PetLog-style "complete records" exports, put day-by-day entries where a synthesis should be.
- **Counting logged days as compliance.** ThePawcess: "96% compliance score" = 81/84 days logged.
- **Verdicts that reassure on absence:**
  - PawSolids "LOOKS GOOD"
  - Tend & Mend per-protein "No concern" and Canine "No significant link found"
  - KOTrol "Stable" and "No deviations noted on 30 of 30 check-in days"
  - CompanAIn "Recommendation: No action is needed. Maintain routine checkups."
  - Petalife "Misty is in great condition today!"
  - ThePawcess "no flare in the 7-day window"
  - Amaeru "100% Ideal"

  Each of these is a place our n=1 / absence ≠ wellness rule would bite.
- **A model writing the vet document:** ThePawcess (the whole report), CompanAIn (the narrative), WagWatch (the vet-visit report). WagWatch at least labels it and keeps it separate from the PDF.
- **Selling in the report:** the Apoquel tracker asks the owner to "discuss Apoquel", makes it a "before you leave" checklist item, and carries rewards and ISI. ThePawcess links to Chewy affiliates. Petalife recommends Purina products from analysis results.
- **Locking the report or the history behind a paywall:** Tend & Mend's free plan sees 14 days. WagWatch's free PDF covers 60 days. ThePawcess locks new entries after 3 days.
- **Gating on data sufficiency without explanation:** Fi's report appears only after 30 days. That is defensible, but nothing says why on the page.

---

## (d) Best report-generation flows (ranked)

1. **Pawsitive Report Composer.**
   - Entry: a Reports tab with purpose-named modes (Weekly / Composer / AI / Table / Gallery / Compare).
   - Pinned **one-page summary scoped "since the last visit"**.
   - **Templates** (Pre-Visit Summary, **Diet Trial**, Daily Vitals) → **Document | Sections** tabs → **drag to reorder** → presets **7/14/30/90** ⚠ §V1 or narrowed dates → **preview** → share as **PDF, image or link**.
   - A completeness footer on every output.
   - Visit prep is wired in: "Ask the vet" pins, pre-visit notes, questions shown during the recorded visit.
   - Weakness: a lot of surface; chronic-care first. `[fetched]` `[screenshot-described]`
2. **PawSolids export sheet.** One bottom sheet: presets **7/30/90** plus From/To fields; **"Include in report" toggles each with a live count** ("2 entries", "0 flagged", "no scans", "no doses logged"); then preview and share. The owner learns what the report will say *before* it is made, empty sections included. The cheapest idea to borrow. `[screenshot-described]` `[fetched]`
3. **WagWatch share and visit kit.** From Trends, two equal buttons, **"Share with vet" | "Vet visit report"**.
   - Links list as **active links with created and expiry dates and a Revoke button**, plus copy telling the owner to revoke after the visit.
   - The AI visit report is "copy into an email or read it off your phone in the room". Range chips 7/30/90/Custom.
   - Per-category CSV beside the PDF. `[fetched]` `[screenshot-described]`
4. **KOTrol Report Center.** **Report types by purpose** in a single list: week at a glance, Vet-View, Diet report, report plus documents bundle, vault, data export, and "Send directly". A bundle that attaches the owner's stored vet documents to the PDF fills the gap our report screen discloses ("Your saved vet documents aren't part of this report"). `[screenshot-described]`
5. **Tend & Mend program-scoped report.** No date picker. The program is the scope (4 weeks; "Week 2 of 4 · 43 meals and 4 stools logged so far"), and it ends in a shareable summary. The cleanest model for a bounded trial. Canine uses a 1/3/6-month segmented control. `[fetched]`
6. **Apoquel and Guava visit prep.** The **bring-list** and the "**before you leave, make sure you**" checklist (Apoquel); visit-type-specific prompts with **prioritised questions** and symptom phrasing in "frequency, onset, severity" (Guava). Neither is a report generator. Both are the missing *visit* half of the flow.
7. **Amaeru pay-per-visit.** The pass ($1.99 for 7 days) is bought at the moment of need, then the period is chosen and the PDF downloaded. A pricing pattern, not a design one; we give it away.

**Our flow, for comparison** (from `app/report.tsx`; read, not run):
- A segmented **Default | Custom** control. Default resolves server-side to *since last visit → active trial → 90-day fallback*; Custom opens two native date pickers pre-filled to the last 90 days.
- An in-app WebView preview of the server render, then **"Send to vet"** via the share sheet.
- A send-moment bar warns about a missing allowed-food list and that vet documents don't travel with the PDF.
- A custom window triggers a **report-side disclosure of out-of-range symptom events**.
- There are no presets (B-236 tracks an honest "Last 90 days"), no section control, no live per-section counts, no questions-for-the-vet step, no link, and the label doesn't show which event the Default resolved to until after generation.

The market evidence points at five gaps, and one advantage to keep:
1. Make the default's *anchor* visible as a chip before generation ("Since last visit · 14 Sep", "This trial · day 41", "Last 30 / 90 days", "Custom…").
2. PawSolids-style per-section live counts, which would also show empty sections up front.
3. A questions-for-the-vet step that prints on the report.
4. A bundle of saved vet files.
5. Later, a revocable link.
6. **Keep** the cropped-window disclosure. Nobody else has it.

---

## AI across the market (question 5)

- **A model writes the vet document:**
  - ThePawcess ("Generated by AI from 81 daily logs")
  - WagWatch vet-visit report (a 90-day AI summary with questions; separate from the PDF)
  - CompanAIn (narrative summaries plus a web portal with "Key Findings" and "Recommendation")
  - Pawsitive "AI Care Report" (separate from the composer)
  - PawSolids AI reports (days 3, 7, 21)
  - Kitbo health report
- **Explicitly not AI, or adds no interpretation:** Pawsitive's composer ("every number appears exactly as logged; the app adds no interpretation"); PawTrial ("Your vet interprets"); Amaeru ("automatically generated", no model claimed); Tend & Mend (a rules engine); the pharma trackers.
- **"Ask about the record":** WagWatch assistant, Kitbo, CompanAIn, PetDocs, Petalife, PawSolids. All ask from the *owner's* side. **No product offers a vet-facing "ask about this report"**, and CompanAIn's portal is the only vet-side surface.
- **AI in the inputs:** lab-sheet OCR (Pawsitive, PetDocs, CompanAIn, KOTrol photo reading), visit-audio summarisation (Pawsitive), photo reads of stool, vomit or urine (PawSolids, Petalife, PETKIT), behaviour detection (Fi), voice-to-logs (Pawsitive Pozi).
- **Structure for machine reading:** none described inside a PDF. Separate structured exports exist: PawTrial JSON, PetDocs JSON/CSV, WagWatch per-category CSV, KOTrol Excel/Sheets.

---

## What I could not verify (research debt)
- The **inside** of any in-app PDF except Amaeru (store render), Petfetti (store render) and Pawsitive (iPad screenshots of the composed document). No app was installed. PawSolids', Tend & Mend's, WagWatch's, KOTrol's and PawTrial's PDFs remain unseen. `[CUL-1777](https://linear.app/projectnyx/issue/CUL-1777)`'s hands-on pass is still the way to close this.
- PawTrial's live store listing (placeholder ID; Play 404), and therefore its Pro price and current version.
- Whether PawSolids' export is Pro-gated.
- Merck's Numelvi tracker page (403); Furbo's "AI Vet Report Translator" help page (403); Fi's own support article (403); Synth88 Vetara (not found under that name).
- The screenshots are marketing frames with sample data. They show what each developer *chose to show*, not guaranteed shipped behaviour.

---

## (e) Sources (all accessed 2026-10-30)

**App Store listings** (`https://apps.apple.com/us/app/id<ID>`; description, version history, IAP and screenshots parsed):
- Pawsitive [id6759310183](https://apps.apple.com/us/app/id6759310183)
- PawSolids [id6760619350](https://apps.apple.com/us/app/id6760619350)
- WagWatch [id6787262395](https://apps.apple.com/us/app/wag-watch-pet-care-tracker/id6787262395)
- KOTrol [id6763902585](https://apps.apple.com/us/app/kotrol-cats-health-app/id6763902585)
- Tend & Mend Cat [id6760874055](https://apps.apple.com/us/app/cat-food-vomit-tracker/id6760874055)
- Tend & Mend Canine [id6761289493](https://apps.apple.com/us/app/id6761289493)
- Amaeru [id6769683155](https://apps.apple.com/us/app/id6769683155)
- Petfetti [id6471319447](https://apps.apple.com/app/id6471319447)
- CompanAIn [id6747678727](https://apps.apple.com/app/id6747678727)
- Every Wag [id6747091313](https://apps.apple.com/us/app/every-wag-dog-cat-health/id6747091313)
- PetDocs [id6757140711](https://apps.apple.com/us/app/petdocs-pet-health-diary/id6757140711)
- Vettie [id6760741400](https://apps.apple.com/us/app/id6760741400)
- Vet Record [id6756975927](https://apps.apple.com/us/app/vet-record-pet-health-tracker/id6756975927)
- Fosia/Veta [id6758032978](https://apps.apple.com/us/app/veta-pet-health-care-manager/id6758032978)
- PetLog – Pet Health Journal [id6747721421](https://apps.apple.com/us/app/petlog-pet-health-journal/id6747721421)
- PetLog – Pet Tracker [id6759348549](https://apps.apple.com/us/app/petlog-pet-tracker/id6759348549)
- Petalife [id6748324822](https://apps.apple.com/us/app/id6748324822)
- Petivity [id1500596230](https://apps.apple.com/us/app/petivity-smart-cat-health/id1500596230)
- Sure Petcare [id1036175339](https://apps.apple.com/us/app/id1036175339)
- PETKIT [id994053492](https://apps.apple.com/app/id994053492)
- Chewy [id1149449468](https://apps.apple.com/us/app/-/id1149449468)
- The Pack by Zoetis [id1633459819](https://apps.apple.com/us/app/the-pack-by-zoetis/id1633459819)

**Websites and demos:**
- ThePawcess [home](https://thepawcess.com/), [live vet-report demo](https://thepawcess.com/demo/vet-report), [pricing](https://thepawcess.com/pricing)
- PawTrial [pawtrial.com](https://pawtrial.com/); Play listing [com.skorg.pawtrial](https://play.google.com/store/apps/details?id=com.skorg.pawtrial) (404)
- WagWatch [home and pricing](https://wagwatch.app/), [help](https://wagwatch.app/help)
- Tend & Mend [tendandmend.co](https://tendandmend.co/)
- PawSolids [pawsolids.com](https://pawsolids.com/en)
- PETKIT [Kitbo article](https://www.petkit.com/blogs/blog/kitbo-petkits-ai-powered-pet-health-assistant-for-smarter-pet-care)
- Fi Vet Retail Guide [Vets tab](https://fitracking.com/vet-guide/health-tab), [clinical guide](https://fitracking.com/vet-guide/clinical)
- PetVitality [petvitality.io](https://petvitality.io/)
- Tractive [Tractive Health](https://tractive.com/en/fp/tractive-health)
- Guava [Visit Prep](https://www.guavahealth.com/prepare-for-visits), [announcement](https://guavahealth.com/news/visit-prep-summary-announcement) `[snippet]`

**PDFs downloaded and rendered:**
- [2026 Apoquel Itch Tracker US](https://assets.contentstack.io/v3/assets/blt6f84e20c72a89efa/blta7e5771fdd01a57b/69dd77191ea2b4994e58c221/2026-Apoquel-Itch-Tracker-US.pdf)
- [Cytopoint pet-owner itch tracker (AAHA-hosted)](https://www.aaha.org/globalassets/02-guidelines/2023-aaha-management-of-allergic-skin-diseases-in-dogs-and-cats-guidelines/zoetis-resources/cytopoint-pet-owner-downloadable-itch-tracker.pdf)

**Snippet-only:**
- [Merck itch tracker](https://www.merck-animal-health-usa.com/downloads/itch-tracker) (403)
- [Sure Petcare Felaqua](https://www.surepetcare.com/en-US/felaqua-connect)
- [CompanAIn vet portal press release (BusinessWire, 2026-06-23)](https://secure.businesswire.com/news/home/20260623641399/en/CompanAIn-Launches-New-Veterinary-Portal-Advancing-Its-Vision-for-Connected-Pet-Health)
- [Petivity litter monitor](https://www.petivity.com/products/smart-litterbox-monitor)
- [Fi Series 3+ coverage (Notebookcheck)](https://www.notebookcheck.net/Fi-unveils-Series-3-plus-dog-fitness-collar-with-GPS-tracking.1029108.0.html)
- [Furbo AI Vet Report Translator](https://help.furbo.com/hc/en-sg/articles/38412412477465-AI-Vet-Report-Translator) (403)
- [PetMD symptom checker (dvm360)](https://www.dvm360.com/view/online-pet-symptom-checker-tool-now-available)

**Internal:**
- `docs/research/2026-09-vet-report-distribution-channel.md` §4
- `docs/culprit-competitive-landscape-2026-10.md` §5–7
- `app/report.tsx` (our current range and send flow, read only)

---

## §V Verification pass (2026-10-30, the session that commissioned this brief)

Pawsitive was re-read from its App Store listing (id6759310183, version history verbatim) and its landing page.

- **V1.** No 7/14/30/90 range-preset picker was found. The listing's "7, 14 or 30 days before and after a med or food change" (v2.0.0) is the **Before & After comparison** window; v1.7.0 says only "narrow to just the dates you need". The landing's "Trends & reports (last 7 days)" is a free-plan limit, not a preset.
- **Confirmed verbatim:** the Diet Trial template (v1.7.0 notes: "ready-made templates like 'Pre-Visit Summary,' 'Diet Trial,' or 'Daily Vitals'"; the composer persists in v2.0.0 and v2.1.0), drag to reorder, "Everything since the last visit on a single page" (landing), the completeness footer ("Of 30 observed days: fed 30 · meds 28 · weight ×5"), the ●/○ medication chart, reference ranges "saved exactly as printed", and "the app adds no interpretation" (the report and logs only; the same app sells "AI care reports" on Premium at $9.99/mo).
- **Unresolved:** which tier the composer sits in today (it launched "free and unlimited for a limited time"; the landing's free plan lists a "Vet-ready summary").
