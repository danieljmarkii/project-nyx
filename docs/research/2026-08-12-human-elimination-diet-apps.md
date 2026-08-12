# Human Elimination-Diet Apps — Visualization & UI Patterns
**Date:** 2026-08-12 · **Method:** single web-grounded research lane (published user guides, app-store listings, vendor support docs, dietitian reviews — no hands-on installs; where a source describes a screen precisely that is said, where only marketing text exists it is flagged) · **Scope:** how the mature human elimination-diet market visualizes adherence, food↔symptom association, symptom trends, and reintroduction — as input to the B-745 diet-trial surface uplift.

> 🧊 **Frozen point-in-time evidence brief** (per `docs/research/README.md`): evidence, not decisions. What the team decided lives in `docs/sessions/2026-08-12-diet-trial-signal-uplift-exploration.md` and, once ratified, the B-745 spec. Transferability judgments below are made against Nyx's standing constraints (no correlation-as-causation, no reassurance from absent data, counts with denominators, no owner-scored severity), which are treated as the fixed lens, not re-argued.

---

## Part 1 — App-by-app findings

### 1. mySymptoms Food Diary (SkyGazer Labs) — the most documented correlation engine in the space

Source of truth: the official [iOS user guide](https://www.mysymptoms.net/ios-user-guide/), plus [App Store listing](https://apps.apple.com/us/app/mysymptoms-food-diary/id405231632) and a [clinical review on Healthify NZ](https://healthify.nz/apps/m/mysymptoms-food-diary-symptom-tracker-app).

1. **Adherence / phase progress:** None. There is no phase model — it is a continuous diary (food, drink, meds, stress, exercise, environment, Bristol-scale bowel movements, energy, sleep). Elimination-diet users self-manage phases outside the app. Dietitians recommend it "for tracking during the FODMAP diet" ([Gutivate comparison](https://gutivate.com/blog/apps)) but the app itself has no notion of "you are on day 12 of elimination."
2. **Food↔symptom correlation — the deepest UI in the market, four screens:**
   - **"Outcomes Experienced"**: entry screen; a bar chart of symptom occurrence counts within the chosen date range, ordered by frequency. You pick the symptom to investigate.
   - **"Top Suspects"**: ranked list of foods/ingredients, descending by correlation strength. Each row carries **two horizontal bars: an orange bar = the item's score relative to other items; a green bar = the confidence of the result** (confidence grows with event count). Toggle buttons **SCORES / RATIO** re-rank by algorithmic score vs. "suspect ratio" (proportion of suspect vs. clear occurrences).
   - **"Result Detail"**: three scrollable panels. Summary panel shows four named stats: **Score**, **Confidence**, **Suspect Ratio**, and **"Outcomes/Symptoms Appear"** — the *average onset delay* between eating the item and the symptom.
   - **"Events"** screen: the receipts — a filterable event list tagged SUSPECT / ITEM / OUTCOME / ALL so the user can inspect the raw occurrences behind any score.
   - The **"Analysis Window"** is user-configurable **1–72 hours (default 24)** — it defines which preceding intake events the algorithm attributes a symptom to. Users can toggle "Use Symptom Intensity" and set an intensity threshold for inclusion.
3. **Symptom trends:** Two documented charts. **"OUTCOME/SYMPTOM ONSET DELAY"** — a histogram of how often the symptom occurs at each onset-delay bucket after the item; a peak suggests a sensitivity latency. **"OUTCOME/SYMPTOM & ITEM TRENDS"** — a dual line chart plotting symptom occurrence frequency and item consumption frequency per week/month on a shared time axis; "closer lines indicate stronger correlation."
4. **Reintroduction:** Nothing structured. The correlation engine is the whole product.
5. **Warnings:**
   - The vendor's own guide concedes the core hazard: *"correlation does not mean cause — sometimes coincidence results in items that don't cause outcomes attaining a high score"* ([user guide](https://www.mysymptoms.net/ios-user-guide/)). The UI still leads with a single ranked "Top Suspects" list — the caveat lives in documentation, the verdict lives on screen.
   - The clinical reviewer's caveats: *"Accuracy of data entered is dependent on individual attention to detail"* and *"Users should consult a health professional before making changes based on results"* ([Healthify](https://healthify.nz/apps/m/mysymptoms-food-diary-symptom-tracker-app)).
   - The word **"Suspects"** is actually a smart hedge — it frames output as accusation-to-investigate, not diagnosis. The orange/green dual-bar (strength vs. evidence-amount) is the single best idea here.

### 2. Monash University FODMAP Diet app — the protocol/phase benchmark

Sources: [Monash's own app guide blog](https://www.monashfodmap.com/blog/app-how-to/), [reintroduction diary walkthrough](https://www.monashfodmap.com/blog/reintroduction-using-diary-function/), and a detailed third-party walkthrough, [The Irritable Vegan](https://www.theirritablevegan.com/understanding-monash-fodmap-app/).

1. **Adherence / phase progress:** The app *is* the 3-step protocol (Elimination → Reintroduction → Personalization) but progress is expressed through **which mode the Food Guide is in**, not a progress bar: during elimination you see "larger traffic lights that indicate the food's overall rating"; after reintroduction, personalized filters switch the display to "smaller, serve-specific traffic lights" reflecting your tested sensitivities. Phase state changes what every food screen means — a genuinely elegant idea.
2. **Food↔symptom correlation:** None automated. The diary logs food (knife-and-fork icon), symptoms via **"5 simple sliders"** (none→severe), stress, and Bristol-scale bowel movements; correlation is left to the human/dietitian reading the exported diary (share icon → date range → emailed report).
3. **Symptom trends:** No charts documented — the diary is a timestamped list, exportable. Monash deliberately routes interpretation to the dietitian.
4. **Reintroduction — the most mature challenge UI anywhere:**
   - Diary "+" → **"Reintroduction" symbol** → pick the **FODMAP group** → the app "provide[s] you with suggestions for suitable challenge foods for each group" → pick the food → "the portions are displayed for all 3 days" — a **dose-escalation ladder** (e.g., "1.5 tsp for the first day and 2 tsp for the second day").
   - The scheduled challenge is inserted into the diary so each day's target dose appears alongside whatever symptoms get logged; pass criterion is textual guidance, not a UI verdict: "if you get through the 3 days without symptoms… you have passed the challenge," explicitly framed as "a guide, not a rule book."
   - Challenge outcomes then feed the **sensitivity filter**: "slide the bar to set your sensitivities" per FODMAP subgroup, which "alters the recommended safe serves in the food guide."
5. **Warnings:**
   - The per-food detail screen is exemplary dose-honesty: each food shows **per-FODMAP-group traffic lights at explicit serving thresholds** — a categorical encoding that never hides the denominator (the serving size). But the *category list* view collapses that to one big overall-rating circle, and third parties note inconsistency in whether the serving basis (cooked/uncooked) is visible without a tap ([Irritable Vegan](https://www.theirritablevegan.com/understanding-monash-fodmap-app/)).
   - "Passed the challenge" is verdict language — Monash softens it in prose ("a little bit of wind and bloating is normal") but a pet app copying the pass/fail frame would be handing the owner a clinical conclusion.

### 3. Bearable — the factor-effect benchmark

Sources: [Factor Effect Report support doc](https://bearable.app/support/howto/the-factor-effect-report/), ["discover what's improving/worsening your health"](https://bearable.app/support/howto/how-to-use-bearable-to-discover-whats-improving-and-worsening-your-health/), [Neura Health's review](https://neura.health/insight/bearable-symptom-tracker-app-review), [Google Play listing](https://play.google.com/store/apps/details?id=com.bearable&hl=en_US).

1. **Adherence / phase progress:** No phases; it's a general chronic-illness tracker (symptoms on severity scales, mood, meds, factors as tap-chips). Its phase analog is **"Experiments"**: a bounded 7–30-day window tracking one factor against one health metric — at the end "a breakdown of how the factor correlated with positive and negative changes" is shown. Structurally this *is* a challenge/trial unit, in consumer form.
2. **Food↔symptom correlation — the "Effect on" pattern:**
   - Insights tab → advanced report → **"Effect on"** section: each factor listed with **the % effect it has on the chosen metric**, sortable **"Best or Worst"**. A magnifying-glass icon opens a **with-vs-without comparison** for that factor (average metric on days with the factor vs. days without).
   - **Selectable lag windows**: "your average mood on the same day as the Factor was entered and up to your average mood over the seven-day window after."
   - **A hard minimum-data gate**: *"Bearable needs three entries with a factor and three entries without before it will appear in the Factor Effect Reports"* — plus "6 days of health metric data." Below the floor, the factor row simply does not render.
3. **Symptom trends:** Line graphs of symptom scores over time in Insights; a landscape-rotation mode overlays multiple metrics for "manually identify[ing] trends and correlations"; weekly reports give average mood/symptom/sleep/energy scores for the week ([Neura](https://neura.health/insight/bearable-symptom-tracker-app-review)).
4. **Reintroduction:** Not as such — but Experiments is the transferable container ("test one thing at a time, bounded window, see the with/without breakdown").
5. **Warnings:**
   - The %-effect number is presented per factor with no visible n on the main list — the denominator lives a tap away in the with/without view. A 3-days-with/3-days-without floor is a *very* low bar to hang a percentage on.
   - The vendor's caution is soft: "it's important to be critical of the results" — no explicit correlation≠causation statement in the report itself.
   - Reviewer-documented burden problem: "Tracking too many symptoms and factors can make daily check-ins harder to maintain… a dashboard filled with too many… can feel crowded" — over-instrumentation collapses logging adherence, which then silently degrades every correlation.

### 4. Cara Care (HiDoc / Bayer) — the best/worst-days contrast

Sources: [Google Play listing](https://play.google.com/store/apps/details?id=com.gohidoc.cara&hl=en_US&gl=US), [Odycy review](https://www.odycy.com/en-gb/health-apps/disease-management-and-medical-apps/symptom-tracking/cara-care), [Doximity "App of the Week"](https://opmed.doximity.com/articles/app-of-the-week-cara), [user reviews](https://justuseapp.com/en/app/1133687886/cara-care-ibs-fodmap-tracker/reviews), [Triggerbites roundup](https://triggerbites.com/blog/best-food-diary-apps-2026).

1. **Adherence / phase progress:** A structured **12-week low-FODMAP program** with dietitian chat; phase progress is program-week-based (curriculum), not a data visualization. Germany's first prescription IBS app.
2. **Food↔symptom correlation — the signature pattern:** the dashboard shows **"what your food, symptoms, and poop are like on your best and worst IBS days"** — i.e., it selects your extreme days and displays the food composition of each side for eyeball contrast. No scores, no ranks; a curated comparison of two small sets of days.
3. **Symptom trends:** Symptom/stool/mood tracked (photos for meals; personal symptoms addable); PDF/CSV export for doctors. Chart specifics are not documented anywhere verifiable; a power-user review complains "the level of analysis… is minimal and is not conducive to the detective work required… to pinpoint trends over time" ([justuseapp reviews](https://justuseapp.com/en/app/1133687886/cara-care-ibs-fodmap-tracker/reviews)).
4. **Reintroduction:** Handled by the human dietitian inside the program, not by a UI artifact. FODMAP-filtered "personalized safe food lists" exist for the elimination side.
5. **Warnings:** Best/worst-day framing is legible but statistically cherry-picked — it samples the tails and invites the reader to infer cause from two exemplar days. It also can't distinguish "food that caused the bad day" from "food logged because it was a bad day" (comfort eating, or the owner-analog: extra logging on scary days).

### 5. Bowelle — minimalist overlay trends

Sources: [App Store listing](https://apps.apple.com/us/app/bowelle-the-ibs-tracker/id1436064640), [Gutivate](https://gutivate.com/blog/apps).

1. **Adherence:** None; freeform diary (feelings, food, water, stress, sleep, bowel movements with frequency/consistency/discomfort, custom fields).
2. **Correlation:** No engine. Its answer is **chart overlay**: "charts allow you to overlap different data types" — e.g., plot wellbeing line and lay meal/stress events over it, leaving pattern-finding to the eye.
3. **Symptom trends:** Wellbeing-over-time line charts plus **daily averages over configurable lookbacks (14/30/60 days or all data)** in a side menu.
4. **Reintroduction:** None.
5. **Warnings:** Eyeballed overlays are honest (no fake scores) but scale terribly with sparse data, and "daily average wellbeing" is exactly the kind of owner-scored subjective scale Nyx's constraints exclude.

### 6. The scanner class — Spoonful, Fig, Selectivor (allowed-set tools, not diaries)

Sources: [Spoonful](https://spoonfulapp.com/) + [FODMAP Everyday review](https://www.fodmapeveryday.com/meet-spoonful-the-low-fodmap-scanner-app/), [Fig App Store](https://apps.apple.com/us/app/fig-food-scanner-guide/id1564434726) + [Fig's elimination-diet guide](https://foodisgood.com/elimination-diet/), [Selectivor coverage](https://appgrooves.com/app/selectivor-by-eatid-inc).

1. **Adherence / phase:** Their whole contribution. **Spoonful**: barcode scan → **green / yellow / red** verdict per product, with the *reason* (the offending ingredient) one tap down; explicitly "supports all phases — elimination, reintroduction, and personalization" by letting you customize which FODMAP categories your scan verdicts test against — i.e., **the phase is encoded as a filter state that changes every verdict**. **Fig**: same shape — restrictions in, "green/yellow/red rating" out, 2,500+ ingredient rules; the Triggerbites roundup is blunt that Fig is "a shopping tool, not a diary" with no pattern analysis. **Selectivor**: physician-templated diets rendered as three explicit lists — **"Allowed foods," "Maybe allowed foods," "Not Allowed Foods"** — shareable with family/caregivers so *other people feeding the patient* see the same allowed set.
2–4. **Correlation, trends, reintroduction:** None beyond the filter-state phase support.
5. **Warnings:** Traffic-light green reads as "safe" — a reassurance verdict delivered per-product with no uncertainty channel (cross-contact and shared-line info is exactly what Fig "cannot reliably capture," per the [roundup](https://triggerbites.com/blog/best-food-diary-apps-2026)). Selectivor's caregiver-shared allowed list, though, is the single most pet-relevant idea in the class — the multi-caregiver household is the contamination vector.

### 7. myIBS (Canadian Digestive Health Foundation) — the gated report

Source: [CDHF's own how-to](https://cdhf.ca/en/how-to-use-cdhfs-myibs-app/).

- Sliders (none→severe) for pain/bloating/stress/fatigue; Bristol-style stool with urgency/straining; meals by slot (breakfast/lunch/dinner/snack); daily journal. A **streak feature** "showing daily consistency."
- The one pattern worth stealing: **Reports refuse to exist until 5 days of tracking** — the report screen only generates after a minimum record, then prints for the doctor. An explicit "not enough data yet" gate at the surface level.
- Warning: streaks on a symptom diary shame lapses, and for a sick-pet owner a broken streak lands as "you failed your pet" — Principle-4-hostile.

### 8. Quick hits (one notable pattern each)

- **[Gutsy AI](https://apps.apple.com/us/app/gutsy-ai-ibs-trigger-finder/id6758587496)** — trigger candidates "with confidence levels," analyzed "across a 48-hour symptom window with real gut transit times" (personalized lag). Also ships "structured 3-day reintroduction challenges with graduated portions" — Monash's ladder, productized. And a **warning exemplar**: "a single score (0–100) based on symptoms, stool, meals, and hydration" — a composite wellness number that manufactures false precision.
- **[Food Diary: Symptom Tracker](https://apps.apple.com/us/app/food-diary-symptom-tracker/id6758482541)** — a full **"Elimination Diet Mode… pick suspect foods, track an elimination phase (2–4 weeks), then guided reintroduction one food at a time,"** with a "Correlation Engine" ranking triggers by "frequency, timing, and severity patterns" into a **"Top Triggers" card with confidence percentages** on the home screen. The complete stack — and the complete set of hazards — in one indie app.
- **[Triggerbites](https://triggerbites.com/blog/best-food-diary-apps-2026)** — natural-language logging ("had mom's lasagna… felt bloated around 8pm") with automatic ingredient extraction and compound tagging (FODMAPs, histamine, salicylates), correlated "across multiple time windows up to 72 hours."
- **[Dieta](https://apps.apple.com/us/app/dieta-stool-ai-tracker/id6744622435)** — AI stool-photo classification feeding trend charts; the "derive severity from the logged artifact, not from a feeling score" direction.
- **MyFitnessPal** — the negative control: "no symptom tracking whatsoever" ([roundup](https://triggerbites.com/blog/best-food-diary-apps-2026)); people repurpose it for elimination and it fails because a diary with no symptom axis can never close the loop. Confirms the two-sided event model is the entry ticket, not a differentiator.

---

## Part 2 — The recurring patterns, ranked by transfer value

Ranked by (relevance to a diet-trial surface) × (maturity of the evidence across apps). Judged against the Nyx lens: third-party observer logging 1–3 meals/day, no correlation-as-causation, no reassurance from absent data, counts with denominators, severity derived from events.

### P1. The dose-anchored traffic-light allowed set (phase-aware)
- **(a) Shows:** Per-food categorical verdict (green/amber/red) *anchored to an explicit serving threshold*, with per-subgroup breakdown one tap down; the phase (elimination vs. personalized) changes which verdict set renders.
- **(b) Apps:** Monash (the canonical form), Spoonful, Fig, Selectivor's three lists.
- **(c) Why it works:** It answers the only question the shopper has at decision speed, and Monash's version is quietly denominator-honest — the color is never separated from its serving size. It fails when the dose anchor gets dropped (the big single circle in list view) and the color becomes an identity ("onion is red") instead of a dose statement.
- **(d) Transfers: yes, and Nyx largely has it** — B-616/B-458's "What {pet} can eat" + pinned picker section, in the safer positive-marking-only variant (D2: absence of a mark is never a verdict; the human apps mark both sides). Selectivor's *shareable* allowed list is the extension to remember when household/caregiver support (B-292) arrives — in a multi-caregiver home, the allowed set is only as good as its least-informed feeder.

### P2. The structured challenge unit (reintroduction as a first-class scheduled object)
- **(a) Shows:** A named challenge (one food/group at a time) with a fixed duration (typically 3 days), a **per-day dose ladder**, scheduled into the diary so target-vs-actual and symptoms co-render; outcome recorded at the end; result then **feeds back into the allowed-set filter**.
- **(b) Apps:** Monash (canonical), Gutsy AI ("graduated portions… tolerance assessment"), Food Diary: Symptom Tracker ("guided reintroduction one food at a time"), Bearable's Experiments (the same container genericized).
- **(c) Why it works:** It converts an open-ended anxiety ("can he ever eat chicken again?") into a bounded, low-decision procedure — one variable, known duration, pre-committed doses. It fails where the endpoint is a UI verdict: "passed the challenge" is a clinical conclusion delivered by an app.
- **(d) Transfers: the biggest genuine gap in pet-land, and the human template is directly usable.** Post-elimination rechallenge is *in* the veterinary protocol (it is how food allergy is confirmed) and no pet app has any surface for it. Structure transfers cleanly to third-party logging because the challenge is *scheduled* — the owner executes a plan rather than deciding daily. Two constraint-driven amendments: (i) the endpoint must be an **observation summary with counts** handed to the vet — never a pass/fail badge; (ii) dose ladders must be vet-configured, not app-suggested — Monash can suggest doses because Monash *is* the clinical authority. Monash's sequencing insight: challenge results changing the food guide's lights is the loop that makes the challenge feel worth doing — the Nyx analog is challenge outcomes annotating the food library entry (as history, not verdict).

### P3. Ranked suspect list with dual strength/evidence encoding
- **(a) Shows:** Foods ranked by association score; each row encodes **two separate quantities — association strength and amount of evidence** (mySymptoms: orange score bar + green confidence bar; Gutsy/FDST: confidence percentages).
- **(b) Apps:** mySymptoms (canonical), Gutsy AI, Food Diary: Symptom Tracker, Triggerbites.
- **(c) Why it works / fails:** The two-channel encoding is the honest part — it visually separates "how suspicious" from "how much data," which a single trigger-score collapses. The failure mode is everything around it: a *ranked list* is read top-to-bottom as an indictment, coincidence attains high scores (the vendor says so themselves), and staples wash in and out depending on window settings. Every review of this class notes users cutting foods off the strength of the list alone.
- **(d) Transfers: the encoding yes, the surface mostly no.** At 1–3 owner-logged meals/day, a trial's total n is tens of feedings — any within-trial food ranking would be noise dressed as arithmetic, and the no-verdict constraints already forbid the trigger-score frame. What survives: **never show a strength mark without an adjacent evidence mark** (the S2 rule, arrived at independently by the market leader), and mySymptoms' **"Events" receipts screen** — every score backed by a tappable list of the raw occurrences.

### P4. The onset-delay window, made visible
- **(a) Shows:** (i) a user-adjustable **analysis window** (1–72h) governing food→symptom attribution; (ii) mySymptoms' **onset-delay histogram** — x = hours between item and symptom, y = frequency; (iii) Gutsy's personalized transit-time window.
- **(b) Apps:** mySymptoms (both), Gutsy AI, Triggerbites ("multiple time windows up to 72 hours").
- **(c) Why it works:** It surfaces the assumption every correlation hides — *which meal gets blamed*. Making the window visible/adjustable turns a silent modeling choice into an inspectable one. Fails when the histogram is under-fed: with sparse data the "peak" is two events.
- **(d) Transfers: as disclosure, not as a control.** This is literally the repo's old wound — the Step-10 "nearest-preceding meal" attribution bug. Owners should not tune windows, but any correlation receipt should *state* its window in words, and the vet-facing report even more so. The delay histogram itself does not survive pet-scale data density; its honest replacement is the time-ordered receipt with the actual gap printed.

### P5. Dual-series overlay trends (exposure line vs. symptom line)
- **(a) Shows:** Two frequencies on one time axis — item occurrence and symptom occurrence per week/month (mySymptoms), or freely overlapped data types (Bowelle), or rotate-to-landscape multi-metric overlay (Bearable). Read by eye: co-movement suggests association.
- **(b) Apps:** mySymptoms, Bowelle, Bearable.
- **(c) Why it works:** It shows change over the trial without asserting a mechanism; the user stays the analyst. Fails through visual-correlation bias, y-axis games, and — critically — it cannot distinguish "symptom declined" from "logging declined."
- **(d) Transfers: partially, with logging-density as a mandatory third layer.** Weekly symptom-event *counts* (bars/counts, honest at n=2 — never smoothed lines) plus the C5 logging-density disclosure — which is exactly the correction this pattern needs and that **no human app makes**: every human overlay chart silently assumes the diary is complete because the patient is the logger. With a third-party logger, the density series is the difference between "improving" and "stopped writing things down." No surveyed app renders it; that is Nyx's edge, not its gap.

### P6. With-vs-without comparison behind a minimum-data gate
- **(a) Shows:** Average outcome on days/periods *with* a factor vs. *without* it, rendered only after a floor is met (Bearable's "three entries with and three without"; myIBS's report refusing to generate before 5 days of tracking).
- **(b) Apps:** Bearable (canonical), myIBS (the gate applied to a whole report), Cara Care's best/worst days as the degenerate cousin (comparing tail *days* instead of factor-defined groups).
- **(c) Why it works:** A two-condition comparison is the most honest consumer-legible statistic in the catalog — a visible denominator on each side, inviting "huh, small difference" as an outcome. The hard gate is the best anti-thin-data idea in the market: below the floor the number *does not render*, rather than rendering with a caveat. Fails when the gate is set performatively low and the output is still a bold percentage.
- **(d) Transfers: yes — the closest human analog to the shape-C stacked compare and the falling-comparison density gate.** Two amendments the Nyx constraints force: the gate must **fail toward escalation** (Bearable's gate fails silent — a safety-relevant difference below the floor just doesn't appear), and no percentages — counts on both sides. Cara's best/worst variant does *not* transfer: tail-picking exemplar days from an owner-logged record mostly measures which days the owner was scared enough to log thoroughly.

### P7. Phase-as-filter-state (the phase changes what every other screen says)
- **(a) Shows:** Not a chart — a mode. Elimination vs. personalization changes every verdict the app renders (Monash's big-circle → serve-specific lights; Spoonful's scan results keyed to *your* current category set).
- **(b) Apps:** Monash, Spoonful, Fig.
- **(c) Why it works:** Zero added decisions — the user never re-derives "what does green mean this month"; the app's ground truth shifts once, centrally. Fails when mode state is invisible (you forget which filter you're in and trust a stale verdict).
- **(d) Transfers: yes.** An active trial should *recontextualize* existing surfaces (picker ordering, Foods-tab strip, allowed-set screen — shipped in B-616/B-458) rather than adding trial-specific dashboards; state the mode where it acts ("On the trial list" as a *named* section, which the picker's variant H already does).

### P8 (anti-pattern catalog). Composite scores, streaks, and verdict badges
- **(a) Shows:** A single 0–100 wellness score blending symptoms, stool, meals, hydration (Gutsy); daily-consistency streaks on a symptom diary (myIBS); "Top Triggers" confidence-% cards on the home screen (FDST); "passed the challenge" language (Monash's one lapse); green = safe scanner verdicts with no uncertainty channel (Spoonful/Fig).
- **(b–c) Why they fail:** Composites launder sparse, mixed-provenance data into false precision and can *rise* while a specific symptom worsens; streaks convert a caregiving lapse into a moral failure (an owner who breaks a streak on day 40 of a 56-day trial is exactly the person the trial can't afford to lose); home-screen trigger percentages are diagnosis-shaped output from coincidence-shaped input; and the mySymptoms case shows the caveat-in-the-manual / verdict-on-the-screen split is the industry's standing settlement — **the screen wins**.
- **(d) Transfer:** These map one-to-one onto rules Nyx already holds (no letter grades/bare percentages, no owner-scored severity, disclosure beside the verdict, the med-strip's ban on `missed`/compliance bars). The research value is confirmatory: every one of the prohibitions corresponds to a shipped failure mode in the mature human market, usually in the market leader.

---

## Three cross-cutting observations

1. **The human market's maturity is asymmetric in Nyx's favor.** Correlation UIs are mature (mySymptoms has four screens of it); *trial-phase* and *reintroduction* UIs are mature (Monash); but **nobody renders logging density as a first-class series**, because the self-logging assumption is buried in every chart. The pet context — where the observer is not the patient — forces Nyx to solve it, and it is the most defensible visualization idea available (already ratified as the C5 disclosure + B-592).
2. **The two best single ideas to steal:** Monash's *dose-anchored* categorical verdict (color never divorced from serving size → counts never divorced from denominators) and mySymptoms' *dual-bar strength+confidence* row generalized as "no association mark without an adjacent evidence mark" — the S2 rule arrived at independently by the market leader, then undermined by its own ranked-list framing.
3. **Reintroduction is the roadmap item this research most supports.** It is standard veterinary protocol, the human tooling for it is proven (scheduled challenge object, one variable, dose ladder, diary-integrated, result feeds the allowed set), and no pet competitor has it. Built under Nyx's constraints — vet-configured doses, observation-summary endpoint with counts, no pass/fail badge, escalation-safe below any floor — it would be the first genuinely new surface in the category rather than a port.
