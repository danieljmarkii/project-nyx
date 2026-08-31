# Home-screen competitive teardown — pet category, the consumer-health design bar, and the 2025–26 platform window

**Date:** 2026-08-31 · **Status:** 🧊 Frozen point-in-time evidence capture. Do not edit in place — corrections land additively in a dated `§V` addendum with inline ⚠ pointers at the corrected claim (the CUL-671 convention). **Re-verify at use:** in the June→August sweeps, competitor claims went stale within days of being committed.

**Commissioned by:** CUL-773 (project **Home Redesign — Conference Spike**; CEO conference mandate, 2026-08-31). **Companion brief:** `2026-08-home-screen-design-leadership.md` (ideas/people/practices — deliberately no app teardowns there, none of that here beyond what a teardown needs).

**Method:** one isolated research agent, ~78 tool calls; 22 current US App Store records pulled via Apple's public iTunes Search API (primary, `[fetched]`) plus vendor pages/press/help docs; roster seeded from `docs/culprit-competitive-landscape-2026-07.md` (the July doc), whose positioning analysis is deliberately **not** duplicated — this pass is home-surface-scoped and fresher. Synthesized and edited by the session; the session independently re-verified one load-bearing platform claim (the Apple SDK deadline — see §4) and the repo's own Expo/RN versions.

**Evidence convention:** every claim carries a source + accessed date (2026-08-31 unless noted). `[fetched]` = URL successfully fetched this pass · `[search-snippet]` = rests on a search snippet, one notch weaker · `[July doc]` = carried from the 2026-07-25 sweep, not re-verified unless stated. **No app was installed** — every layout claim is listing/press/help-doc-grade and no stronger (the July doc's research-debt item #1 still stands).

**Informs:** the Home redesign spike — mock round 1 (CUL-776), the build-ready spec (CUL-777), the D1–D4 rulings (CUL-775); the App Store listing work (CUL-173); the standing competitive watch items.

---

## 1. Method + source log

**What was done.** (a) Read the July 2026 competitive sweep and `docs/nyx-design-principles-v1_0.md` for the roster and the definition of "Home." (b) For each roster app plus additions (TTcare, Whistle, Tractive, Sure Petcare, Woofz, 11pets, Airvet, Vetster, PetDesk, Chewy, myVCA), pulled the **current** US App Store record (version, current-version release date, rating count/average, release notes verbatim, description verbatim where load-bearing), plus vendor pages/press where the home surface is described. (c) Design bar: primary vendor sources (Oura blog ×2, Apple newsroom ×3, Apple support, Apple Developer, Expo docs) with secondaries labeled. (d) Platform context: Apple newsroom (Liquid Glass), TechCrunch (WWDC 2026), Expo docs (RN adoption path), Apple newsroom (ADA 2025 + 2026), TechCrunch (ChatGPT Pulse).

**What could not be reached (honest failures):**
- `support.whoop.com` ("The All-New Home") — HTTP 401. Substituted two secondaries (the5krunner, gadgetsandwearables), both fetched.
- `dataconomy.com` PETKIT CES 2026 piece — HTTP 403 after one retry. PETKIT ecosystem claims rest on the search snippet + the fetched PETKIT App Store listing.
- **TTcare consumer app:** not found in two US iTunes Search API queries (`ttcare`, `ttcare pet`) on 2026-08-31. Only **TTcare Vet** (professional, v2.0.0, released 2026-08-28) returned. Third-party mirrors (not the App Store) still list a consumer build. Stated as "not found via US iTunes search this pass," **not** as "delisted" — the search API can miss, and no direct ID lookup was possible without a current US ID.
- Chewy and The Pack first fetches 404'd on wrong ID guesses; both resolved to the correct IDs and fetched.
- Digitail Pet Parent, PetNoter, and the web-only wedge entrants (ThePawcess/ItchyPet/Vetara/LittlePetApp/PetAllergyScanner): **not re-checked this pass** — the July doc's findings stand as of 2026-07-25 and are labeled where used. Exception: **PerkyPet got a fresh check — still no app in US iTunes search on 2026-08-31** (only the unrelated "Perky-Pet" bird-feeder brand). The July doc's "treat all 'PerkyPet shipped' claims as false" instruction remains correct.

---

## 2. Pet category teardown — what greets the user on app open

### Tier 1 — scaled players with real health-tracking homes

#### Tractive GPS — **the one that moved; the most important pet-category finding this pass**
- **Store vitals:** "Tractive GPS for Dogs and Cats" v26.34.0, current version 2026-08-24, 43,937 ratings, 4.69★. Release notes: "We've adjusted some nuts and bolts to improve your app experience." (iTunes Search API `[fetched]`)
- **Home/dashboard:** primary surface is live location ("Track your pet in real-time with location updates every few seconds"), but the listing now carries health: "Track daily activity and set fitness goals," "Monitor your dog's resting heart and respiratory rate," "Health Alerts to catch potential health issues early." `[fetched]`
- **The April 2026 launch the July doc did not cover:** "Tractive Launches Next-Generation Health Intelligence for Pets" — press release dated **2026-04-08** (Yahoo Finance syndication `[fetched]`). Verbatim claims: "Weekly, plain-language insights that translate complex health data into clear guidance"; a **"new Health screen"** presenting "each pet's health at a glance"; a "Visual History Timeline" for patterns; "predictive health alerts" powered by "learnings from millions of pets"; framing of "AI-powered insights" from "billions of anonymized data points." Same release disclaims: the devices are "not medical devices" and "not intended to replace the expertise and care of veterinarians."
- **Why it matters:** this is the **closest scaled competitor to the "intelligence surface" position** — a per-pet "health at a glance" screen + plain-language AI summaries + predictive alerts, backed by Bending Spoons capital (acquisition closed 2026-05-18; IPO ~2026-07-02 raising $1.68B `[July doc]`) and the absorbed Whistle base (below). The gap that remains theirs to close: hardware-fed passive data (activity/vitals/scratching) with **no food identity, no owner-logged symptom record, no statistical method named, no clinical-report claim** in the sources fetched.
- **Monetization posture:** hardware + subscription; health features ride the subscription.

#### Whistle — **gone (category event)**
- Whistle (Mars) trackers **shut down 2025-08-31**; users were offered replacement Tractive trackers through 2025-09-30, prepaid subscriptions credited to Tractive accounts (Engadget, 2025-07-28 `[fetched]`: Whistle "joining the Tractive family"). No Whistle app returns in a US iTunes search for "whistle pet" on 2026-08-31 (only dog-whistle sound apps) `[fetched]`.
- **Implication:** one fewer health-home competitor; Tractive inherited the most health-forward US collar user base. Any July-roster row for Whistle is dead.

#### Fi (dog collar)
- **Store vitals:** v3.140.0, 2026-08-27, 39,899 ratings, 4.65★. Notes: "Bug fixes and performance improvements." `[fetched]`
- **Home surface (per listing):** step count + streaks + community comparison lead ("Track your dog's step count daily and start streaks… see how they compare with similar dogs in the Fi community"); health framing is trend-shaped ("Spot trends in activity, rest, scratching, licking, drinking, eating, and barking…").
- **Read:** a **gamified quantified-dog surface** (streaks, rankings) with behavioral trends one level down. No per-incident capture, no food identity, no report claim in the listing. The July doc's "Fi Intelligence deepens — did not fire" still looks accurate at listing level as of 2026-08-31.

#### PETKIT (passive capture from below)
- **Store vitals:** v13.9.1, 2026-08-04, 19,328 ratings, 4.59★. Notes: "Release new product EVERSWEET ULTRA AI." `[fetched]`
- **Home surface:** device-manager-first — "manage everything from a single app," "turn everyday moments into actionable insights for confident pet care." Health intelligence is per-device: AI litter boxes "learn each cat's litter box habits," alert on "stool consistency (solid to loose), urine health (with compatible litter), inactivity, or unusual meowing," per-cat recognition "even cats with similar weight," and "automatically records litter box activity" for vet review. The current US listing text does **not** mention vomit detection; the July doc's PETKIT-vomit-OTA claim is carried as theirs, not re-verified here.
- **CES 2026:** an "AI-powered pet care ecosystem" whose app "compiles daily changes" into a health dashboard, emphasis on early urinary issues in cats — `[search-snippet only; fetch 403'd]`.
- **Read:** the litter-box home keeps commoditizing exactly the events we ask owners to log — but it remains device-shaped: no owner-logged record, no food identity beyond grams.

#### Sure Petcare (connected feeder/flap/water)
- **Store vitals:** v4.3.0, 2026-07-14, 429 ratings, 4.37★ `[fetched]`.
- **Home surface (verbatim):** "each pet has their own pet tile with a summary view of their products and daily highlights"; "Timeline: Quickly check on what's happened during the day"; history "grouped into daily, weekly, monthly or six-monthly overviews."
- **Read:** the **pet-tile + daily-highlights + timeline** structure is the most home-relevant pattern in the hardware segment — a per-pet summary-card model, but device-fed and tiny in the US.

### Tier 2 — the AI-forward entrants (traction still negligible, velocity real)

#### CompanAIn — **shipped a new home screen in August 2026**
- **Store vitals:** v1.0.6, 2026-08-12, **20 ratings**, 4.2★ `[fetched]`. (July doc: ~16 — a month of GA added ~4.)
- **What's New verbatim (the load-bearing bit):** "**New home screen: pet photo menu (upload, open profile, share access) and a profile-setup banner to guide you** • Search your pet's health timeline by keyword • Tap notifications to jump straight to what matters • Enjoy a 30-day free trial (previously 7 days) Smarter AI health insights: • Genetic Results … • **Multi-Diagnosis Reasoning Agent** — weighs multiple possible conditions for more accurate insights • **Longitudinal Pattern & Response Agent (LPRA)** — tracks your pet's health trends over time and how they respond to care."
- **Home framing (description verbatim):** "CompanAIn connects every visit, symptom, and change—so you catch what matters early"; "CompanAIn surfaces the shifts that are invisible day to day — a gradual change in weight, a quiet drop in appetite, a symptom that keeps returning — and shows you how they connect, specific to your pet."
- **Read:** conceptually the **closest match to our intelligence-surface language** — but the mechanism is LLM-agent-branded, no statistical method named, and the *new* home is a **profile/menu hub** (photo menu + setup banner), not an insight stack. Monetization heavy and visible: $11.99 / $27.99 / $54.99 per month tiers. Vet portal live since 2026-06-23 `[July doc; consistent with search results this pass]`. **The insight-stack home position is still open.**

#### Petalife (Purina-backed)
- **Store vitals:** v2.3.2, 2026-08-25, **2 ratings**, 5.0★ `[fetched]`.
- **What's New verbatim:** "**Smarter home dashboard — see your pet's daily health snapshot, recent logs, and a clearer week view at a glance.** AI chat that knows your pet — ask questions grounded in this pet's profile…"
- **Description:** "Just snap a photo of your pet's stool, vomit, or urine—our AI instantly detects over 60+ health risks"; daily logs track "stool, vomiting, and urination patterns"; trained on "100,000+ clinical cases" (vendor claims, unverified).
- **Read:** the only shipped analog to our per-incident vision reads `[July doc]` just rebuilt its home as **snapshot + recent logs + week view** — a Today-zone-shaped home. Two ratings; distribution not happening.

#### Everkin
- **Store vitals:** v1.9.0, 2026-08-29, **6 ratings**, 5.0★ `[fetched]`.
- **Home framing (verbatim):** "daily check-ins in seconds—mood, energy, a note, a photo. One pet or your whole household at once." Correlation copy: "**Everkin reads your entries and surfaces connections. Symptoms that started after a food change. Weight slipping since a new medication.**" Vet-ready PDF export claimed.
- **Read:** the marketing sentence is our category's job statement; mechanism still undisclosed (the July doc's research-debt item #2 — still unresolved). Six ratings.

#### Wonderdog — **shipped since the July doc**
- **Store vitals:** v0.1.8, 2026-08-27, **0 ratings** `[fetched]`.
- **Description verbatim:** "Dogs hide illness. Their data doesn't. … Wonderdog brings that history together, **learns your dog's baseline**, and helps you make every vet visit count." Consolidates records/labs/meds; "plain-language health summaries"; "AI health companion grounded in your dog's medical history"; at-home blood draws "available separately in Los Angeles and New York City only."
- **Read:** the $5M pre-seed `[July doc]` now has a binary. Records-and-baseline home, biomarker-first; no owner event-logging emphasis in the listing.

#### VetPati — **noted for the anti-pattern**
- **Store vitals:** v1.5.7 (Apr 10), too few ratings to display `[fetched]`. $2.99/mo, $12.99/yr.
- **"AI Butler" verbatim:** "Proactive daily insights based on your pet's history. Symptom repeat alerts, overdue vaccine reminders, walk suggestions based on weather, **and positive reinforcement when everything looks good.**"
- **Read:** a shipped, literal **reassurance-on-absence** feature — the exact register `clinical-guardrails` forbids. The named foil for "plainness is the severity signal" positioning; also evidence that "AI daily insights" is arriving in the category as cheerful noise.

#### TTcare (AI FOR PET)
- **Consumer app: not found** in US iTunes search this pass (two queries, 2026-08-31). **TTcare Vet** (professional): v2.0.0, released 2026-08-28, 2 ratings `[fetched]` — "capture images of pets' eyes, skin, teeth, and gait… analyzed through a professional results analysis system."
- Vendor claims (aiforpet.com `[search-snippet]`): eye/skin photo screening, ">90% accuracy," "2.5 million validated images"; freemium.
- **Read:** the photo-screening pioneer appears to be pivoting energy to the vet-facing app; consumer US presence could not be confirmed this pass. **Do not cite TTcare as a live US consumer competitor without a follow-up check.**

### Tier 3 — traction leaders whose homes are service shells (distribution threat, not design bar)

#### Chewy — **verbatim symptom-tracker line, worth knowing exactly**
- **Store vitals:** v26.33.0, 2026-08-27, **1,108,975 ratings**, 4.91★ `[fetched]`.
- **Description verbatim:** "Connect with a Vet - Get timely advice from our licensed veterinary team and leave with a personalized consult report." / "**Symptom Tracker - Share your pet's symptoms and receive quick advice on what to do next.**" / "Medicine Reminders - Add your pet's current medications and we'll remind you on when to refill based on the frequency you need."
- **Read:** Chewy's "Symptom Tracker" is, by its own wording, a **triage-advice intake** ("receive quick advice on what to do next"), not a longitudinal record — but a 1.1M-rating commerce app now carries symptom capture + med reminders + vet chat in its top-level feature list. The home is a storefront; the health features are doorways. This is the July doc's Risk 3 (distribution asymmetry) with a current timestamp.

#### PetDesk
- v10.0.1, 2026-08-19, **498,883 ratings**, 4.86★ `[fetched]`. Home jobs: appointments, reminders/to-dos, provider directory, loyalty, refills. **Read:** still a clinic-services shell; no tracking home, no AI language in the listing.

#### myVCA
- v5.11.356, 2026-08-28, 39,908 ratings, 4.91★ `[fetched]`. Home jobs: 24/7 chat, appointments, reminders, "personalized pet care information," food ordering. **Read:** clinic shell + chat; no tracking surface in the listing.

#### The Pack by Zoetis
- v0.68.13, ~2026-08-27, **9.4K ratings, 4.9★** `[fetched]`. Recent notes remain "Minor fixes and enhancements" — the July doc's "no AI, trip-wire did not fire" extends through August. One feature note from v0.65.0 (Feb 2026): caregiver sharing.
- Home jobs per listing: "Track their exercise, grooming, training, and activities"; "See their health and fitness progress at a glance"; visual diary; records; reminders; rewards (pharma loyalty). Quality signal: a recent review reports "Frustratingly Slow & Buggy" — consistent with the July doc's finding that the 4.9★ is rewards-prompted.
- **Read:** the biggest owner-side tracker home is still a **utility grid + rewards program** — no intelligence layer, no AI claim in the listing as of 2026-08-31.

#### Airvet / Vetster / Dutch (telehealth — checked, low design relevance)
- Airvet v2.73.0 (2026-08-27), 10,859 ratings, 4.93★; Vetster v3.56.0 (2026-08-18), 2,721 ratings, 4.56★; Dutch v1.2.9 (2026-08-26), 532 ratings, 4.65★ — all `[fetched]`, none with AI in listing.
- **Read:** all three homes are connect-to-a-human CTAs — the referral endpoints an intelligence surface hands off to, not a design bar.

### Tier 4 — small tracker/diary apps (the direct genre)

#### DogLog — **already restyling for Liquid Glass**
- v3.36, 2026-06-02, 1.3K ratings, 4.8★. Premium $3.99/mo, **$39.99/yr** (the modal category price `[July doc]`, reconfirmed). `[fetched]`
- **Release notes verbatim:** v3.36: "Adjustments and visual improvements for the in-app buttons of the **iOS 26 glass design**." v3.34 (2025-10-10): "Aligning new modern standards with the iOS 26."
- Home jobs: log activities, "Use the Statistics page to get insights about your dog's life," reminders/alerts, household "Pack" sharing.
- **Read:** the strongest pure-logging competitor's home is a **shared activity feed + stats page + reminders** — and a two-person shop has shipped **two** Liquid Glass alignment passes while the checked scaled apps have shipped zero. Adoption pressure is real at the indie tier.

#### Petfetti — the most designed home in the small-tracker genre
- v5.1.1, 2026-04-06, 27 ratings, 4.78★ `[fetched]`.
- **Release notes verbatim:** "**Your Home Screen just got a major upgrade. You can now reorder your pets and rearrange cards for each one, so everything is exactly where you want it.**…"
- **Read:** the genre's answer to home design is **user-arranged cards** — customization as the feature. The direct counter-position to Principle 3 (curation/prioritization as the feature). Useful contrast for any deck.

#### 11pets · Woofz · Maven
- 11pets v6.003.022 (2026-08-26), **77 ratings, 3.29★** — record-keeper home; US traction minimal. `[fetched]`
- Woofz v3.12 (2026-08-19), **55,501 ratings**, 4.57★ — training-plan home; "24/7 AI Assistant" copy; aggressive paywall ($7.99 *weekly* tier). Evidence AI-chat is table-stakes copy even outside health. `[fetched]`
- Maven v1.35.0 (2026-08-24), **23 ratings**, 3.83★ — hardware-gated; "Daily summaries and reports," "Weekly wellness summaries" — briefing-shaped copy, tiny. `[fetched]`

---

## 3. The design bar — consumer health / quantified-self homes

### Oura — the pattern most worth stealing from (and the one our principles already echo)
- **Redesign #1 (2024-10-03, Oura blog `[fetched]`):** five tabs → three (**Today / Vitals / My Health**). Today = scores at top, shortcuts, "a dynamic daily highlight relevant to your current time and activities," a day timeline, Discoveries. Stated metaphor: "**like the 'Top Stories' page of a news app, delivering the most timely, relevant health updates to help you navigate your day.**" My Health = long-horizon metrics + "shareable reports for healthcare providers."
- **Redesign #2 (2025-11-05, Oura blog `[fetched]`):** Today now focuses on "**one big thing**—the most important score or insight you need *right now*," plus "a clear, quick snapshot of your body's readiness and any unusual key metrics." Vitals "**uses color to signal your body's different states**." Advisor (AI) reads across domains and can "create a plan." Rationale: "understanding your health shouldn't be complicated."
- **Load-bearing patterns:** (1) **one-big-thing prioritization** — the home commits to a hierarchy instead of a grid; (2) the news-briefing metaphor stated out loud; (3) **short-term surface / long-term surface split** (Today vs My Health); (4) color as state-signal, not decoration; (5) the AI advisor is a *doorway from* the home, not the home itself.
- **Mapping to us:** the Signal zone is already the "one big thing" stack; the gap worth noticing is Oura pairs it with an explicit long-horizon surface while our Trend zone is one chart and the provider report lives behind export.

### Whoop — briefing-first, then a dense scrollable home
- **Daily Outlook (2025-01-24, gadgetsandwearables `[fetched]`):** a named morning summary replacing the old chatbot — recovery %, RHR, HRV, strain suggestion, contextual lines. Accessed from a card on the home screen.
- **Home revamp (2025-10-15, the5krunner `[fetched]`, updated 2026-01-30):** tab-swiping → "a more dense, scrollable home page"; the log action button "more prominent and placed centrally"; Coach pinned to a nav corner, with memory.
- **Load-bearing patterns:** the **briefing is a named, bounded object** on the home; one scrollable prioritized column beat tab-swiping; **capture action central and persistent** (their + is our FAB — same conclusion); coach/chat persistent but peripheral. (Primary Whoop home doc 401'd — module ordering beyond this is unverified.)

### Apple Health — the reference "pin + highlights" summary
- Apple support `[fetched]`: Summary shows "your progress in one convenient place"; "Your **Pinned** list shows how you're doing in each health category that day"; "**Highlights** show your Health over time." iOS 27 (Sept 2026, MacRumors guide `[fetched]`) redesigns Browse into cards; no AI briefing announced for Health at WWDC 2026 per sources fetched.
- **Load-bearing pattern:** user-pinned favorites + system highlights is the *committee* version of a home — it never commits to "the one thing." It is the pattern Principle 3 deliberately rejects; useful on stage as the foil ("a dashboard shows everything; a briefing tells you something").

### Gentler Streak — readiness → one suggested action; already Liquid Glass
- Listing `[fetched]`: 8.8K ratings, 4.7★. "Start your day with a summary of key vitals and sleep, helping you detect changes before you feel them. Receive workout suggestions that respond to your readiness." The **Go Gentler** widget "provides your most optimal daily action directly on your Home Screen" `[search-snippet]`. **v5.8 (Sept 2025) made Liquid Glass the headline:** "The design that mimics the look and feel of glass, adding translucency, motion blur, depth, and real-time environmental feedback" `[fetched]`. Their new app (The Outsiders) was a **2026 ADA finalist** `[fetched]`.
- **Load-bearing patterns:** the home converts state into **one suggested action**; a status-path visualization rather than a raw chart; proof an ADA-tier indie treats Liquid Glass adoption as a feature.

### Flighty — smart states: the surface re-decides what it is
- Apple's Behind the Design (developer.apple.com `[fetched]`): Live Activities "designed to recall **airport signage conventions**… 'Those airport boards have one line per flight… they've had 50 years of figuring out what's important.'" And: "We want Flighty to work so well that it feels **almost boringly obvious**." ~15 "smart states" show gate/seat/baggage exactly when each matters `[search-snippet]`.
- **Load-bearing pattern:** **state-machine homes** — the surface commits to a phase model and renders only that phase's needs. The strongest external validation of a mode-aware Culprit home (pre-trial / mid-trial day N / post-visit / quiet maintenance are our phases).

### Copilot Money · Calm · Headspace · AllTrails (brief)
- **Copilot Money:** ADA finalist 2024 + Editor's Choice; reviewers describe a "deliberately calm" data-forward dashboard `[search-snippet]` — texture reference only, not deeply verified this pass.
- **Calm** (screensdesign teardown `[fetched]`, secondary): curated content cards + an onboarding checklist + mood check-ins; the same source cautions the dashboard "could feel a bit busy for a first-time user" — the register benchmark, and the busy-dashboard trap.
- **Headspace** `[search-snippet]`: "The 'Today' view… provides a personalized, time-of-day-aware feed" — time-of-day-aware curation.
- **AllTrails** v26.8.40, **1,036,720 ratings** `[fetched]`: explore/search-first home — right when the job is *choosing an outing*, the wrong shape for *is my pet okay*. The contrast case for why we didn't build a browse home.

---

## 4. 2025–26 platform + trend context

### Liquid Glass and the iOS 26→27 window
- **What it is (Apple newsroom, 2025-06-09 `[fetched]`):** "a new material called Liquid Glass. This translucent material reflects and refracts its surroundings, while dynamically transforming to help bring greater focus to content" — applied to "controls, buttons, switches, sliders… tab bars and sidebars… app icons and widgets." Shipped with the iOS 26 generation (fall 2025).
- **The hard deadline (Apple Developer News `[fetched]`; independently re-verified verbatim by this session, 2026-08-31):** "Starting April 28, 2026, apps and games uploaded to App Store Connect need to meet the following minimum requirements: iOS and iPadOS apps must be built with the iOS 26 & iPadOS 26 SDK or later…" **Repo note (session-verified):** Culprit is on Expo SDK 57 / RN 0.86, so *toolchain compliance* is almost certainly already met — the live question is **design adoption**, since our chrome (e.g. `NyxTabBar`) is custom-drawn JS, which the SDK bump does not re-skin.
- **iOS 27 (WWDC 2026-06-09; ships September 2026 — mid-way through the redesign window):** Apple "acknowledged user concerns about last year's Liquid Glass aesthetic" and offers **opt-in customization** — users can "dial back some of its elements, or really highlight them" — plus "a new, layered approach to Liquid Glass within its apps" (TechCrunch `[fetched]`). Also: full-screen homepage widgets; redesigned Siri.
- **The RN adoption path (Expo docs `[fetched]`):** Expo Router **NativeTabs** ("SDK 54 and later," **alpha**, "API is subject to change") renders the real system tab bar: "the system draws the tab bar with Liquid Glass and derives its background from the content behind it" on the latest iOS; older iOS keeps the old style automatically. Limitations that matter here: can't measure tab bar height (interacts with CUL-612-class hit-area work); no runtime add/remove of tabs; styling props only affect iOS ≤18. Community `expo-glass-effect` exposes UIGlassEffect with fallbacks `[search-snippet]`; Expo published a first-party Liquid Glass guide `[search-snippet]`.
- **Category adoption:** DogLog has shipped two glass alignment passes; Gentler Streak made glass a headline. **Among the pet apps checked, only DogLog's release notes mention the iOS 26 design; none of the scaled pet apps' notes fetched this pass (The Pack, Fi, Tractive, PETKIT, PetDesk, Chewy, myVCA) do** — the field is mostly *not* re-skinned yet, which is exactly why a glass-native, briefing-first home would read as next-generation on a stage this fall.

### Apple Design Awards — what "conference-grade" currently means to Apple
- **2026 winners (Apple newsroom, 2026-06-02 `[fetched]`):** include **Moonlitt: Moon Phase Tracker** (Interaction) and **Tide Guide: Charts & Tables** (Visuals & Graphics — "a **crisp presentation of weather data**"). Relevant finalists: **The Outsiders: Athlete Tracker** (Gentler Stories), Structured.
- **2025 winners (`[fetched]`):** include **Watch Duty** (Social Impact) — an emergency *data* app ("active fire perimeters and progress, wind speed and direction, and evacuation orders"). Health/fitness apps were finalists only in 2025.
- **Read:** Apple is currently rewarding **calm, dense, data-forward tracker presentation** — the "clinical data made legible" register — over gamified health. A pet-health home built like a Tide-Guide-grade data surface with a briefing on top has a genuine awards-shaped story.

### The "AI daily briefing" pattern — who ships one and what it looks like
- **ChatGPT Pulse (OpenAI, 2025-09-25; TechCrunch `[fetched]`):** proactive overnight research delivered as "five to 10 briefs" rendered as **cards**; tapping opens the full report; deliberately bounded — generation stops with "**Great, that's it for today**," framed by TechCrunch as anti-engagement-feed design.
- **Oura:** Today as "Top Stories" + "one big thing" — the briefing *is* the home. **Whoop:** Daily Outlook, a named morning-summary object. **Strava Athlete Intelligence:** out of beta ~2025-02; per-activity natural-language summaries; subscriber-only; vendor claims "80% or more of users say… very helpful" `[search-snippet]`.
- **In the pet category:** briefing-*shaped copy* now exists at Tractive ("weekly, plain-language insights"), Maven ("Daily summaries"), VetPati ("proactive daily insights" incl. reassurance), Petalife ("daily health snapshot" home), CompanAIn (LPRA trend narration) — all `[fetched]`. **None of these five describes the briefing as prioritized/curated with safety-first ordering or attached evidence; four of the five have ≤27 ratings, and Tractive's is weekly + hardware-fed.**
- **Read:** the daily AI briefing is the consumer pattern of 2025–26. The credibility differentiator available here — per the July doc's verified engine facts — is a briefing whose sentences are **backed by named deterministic findings and counts** rather than LLM prose; the bounded "that's it for today" register (Pulse) matches Principle 3's never-a-firehose rule.

---

## 5. Whitespace + threats

**Apps checked this pass (n=22 US App Store records reviewed 2026-08-31):** The Pack, DogLog, CompanAIn, Fi, Tractive, PETKIT, Sure Petcare, PetDesk, Chewy, myVCA, Woofz, 11pets, Airvet, Vetster, Dutch, Maven, Petfetti, Petalife, Everkin, Wonderdog, VetPati, TTcare Vet. (Digitail + the web-only entrants not re-checked; July doc stands.)

**Whitespace — phrased to the rule.** Method limit on every negative below: the check is of each app's **US App Store record (description + release notes as fetched this pass)** — not of installed apps. An in-app behavior absent from listing copy would not be caught. These are "absent from the store record" claims, never "absent from the product" claims.

1. **None of the 22 checked describes a curated, prioritized insight-card home where safety findings structurally lead** (closest copy: CompanAIn's "surfaces the shifts… shows you how they connect"; Tractive's "health at a glance" screen; neither states prioritization, ordering, or a safety register), as of 2026-08-31.
2. **None of the 22 checked names a statistical method** anywhere in its listing (consistent with the July doc's stronger market-wide verified negative on case-crossover). "AI" language without mechanism appears at CompanAIn, Petalife, Everkin, Woofz, VetPati, Wonderdog, PETKIT, Tractive.
3. **None of the 22 listings mentions an elimination diet, food trial, or diet-trial construct** — consistent with the July doc's 207-listing zero. The wedge remains uncontested in App Store copy as of 2026-08-31.
4. **None of the 22 checked describes evidence receipts** — counts/dates/denominators attached to an insight so the owner can audit it. Our shipped receipt components (B-721) have no visible analog in this set.
5. **Only 1 of the 22 (DogLog) mentions the iOS 26 design language in its release notes** — the category's visual layer predates Liquid Glass almost everywhere.
6. **The reassurance hole is being filled badly:** VetPati ships "positive reinforcement when everything looks good"; the July doc logged reassuring lowest-tier buckets at three others. A home that is *structurally unable* to reassure on absence remains unclaimed ground — and is our existing architecture.

**Threats (ranked, home-scoped):**
1. **Tractive Health Intelligence (2026-04-08)** — 43.9K ratings, Bending Spoons capital, the absorbed Whistle base, and now a per-pet "Health screen… at a glance" + weekly plain-language AI insights + predictive alerts. The nearest *scaled* thing to an intelligence-surface home; its structural seams (device-fed, no food identity, no owner symptom record, weekly not daily) are the exact things to design against.
2. **Chewy's top-list "Symptom Tracker"** — 1.1M ratings; today triage-shaped. If it grows from intake into a longitudinal record, distribution does the rest. Watch item.
3. **CompanAIn** — ~20 ratings but shipping monthly (new home + two named AI agents in August), vet portal live, marketing language closest to ours. The July watch-list #1 ranking stands.
4. **PETKIT / passive capture** — per-cat litter-box habit learning, urinary alerts, a CES 2026 ecosystem dashboard `[snippet]`. Keeps commoditizing capture of exactly our logged events; the home answer is what hardware can't see (food identity, symptoms anywhere in the house, the spouse's treat, the report).
5. **Petalife's rebuilt "smarter home dashboard"** — a budget version of our Today+Trend zones with Purina money and (today) zero traction.
6. **iOS 27 ships mid-window (Sept 2026)** — a November 2026 cut that ignores post-glass chrome will read one generation old on stage next to Apple's own apps; conversely NativeTabs is **alpha**, so the safe play is glass-adjacent chrome (system tab bar where stable, glass accents via `expo-glass-effect`-class libs, full fallback below iOS 26) rather than a hand-rolled glass clone. **Engineering feasibility is a spec-phase question (CUL-777), not settled here.**

**What would make a pet-health home read best-in-category on a conference stage (evidence-backed synthesis, marked as synthesis):**
- **A briefing, not a dashboard:** Oura's "one big thing" + Pulse's bounded card stack + Whoop's named Daily Outlook are the awarded/adopted pattern; our Signal stack is already this shape — the stage version needs the *bounded* ending (Pulse's "that's it for today" ≈ our S6 quiet-is-labeled rule) and the receipts no checked competitor shows.
- **Mode-aware smart states:** Flighty's phase model applied to the diet-trial lifecycle — the home re-decides what it is, which no checked pet app describes doing.
- **Plainness as the severity register:** unique against the category's cheerful AI (VetPati's reinforcement, The Pack's rewards) and already ratified internally (S1).
- **Tide-Guide-grade data presentation** on the trend surface — the current ADA Visuals & Graphics language is dense, crisp, un-gamified charts.
- **Glass-native chrome with restraint** — a first-mover look on a shelf where only DogLog has moved, while honoring the no-looping-motion rule (iOS 27's own "dial back" option is Apple conceding restraint is a preference worth serving).

---

## 6. Research debt (follow-ups this brief does not settle)

1. **Hands-on installs** of Tractive, The Pack, DogLog, CompanAIn, Petalife — every layout claim here is listing/press-grade; the July doc's debt item #1 (no app installed) still stands and matters most for Tractive's new Health screen.
2. **Everkin's correlation mechanism** — still marketing copy, mechanism undisclosed (July debt item #2, unresolved).
3. **PETKIT CES 2026 ecosystem dashboard** — fetch 403'd; verify via an alternate source before citing.
4. **NativeTabs stability** against Expo SDK 57 before committing the chrome strategy (alpha; API subject to change; tab-bar height unmeasurable — interacts with the CUL-612 hit-area arithmetic). → CUL-777.
5. **Whoop's primary home doc** (401'd) if exact module ordering is ever needed.
6. **TTcare US consumer status** — direct ID lookup / alternate storefront check before citing either way.

---

## 7. Source table

| # | URL | What it supports | Accessed | Verified (fetched)? |
|---|---|---|---|---|
| 1 | https://www.apple.com/newsroom/2025/06/apple-introduces-a-delightful-and-elegant-new-software-design/ | Liquid Glass definition, quoted; OS scope; announce date 2025-06-09 | 2026-08-31 | y |
| 2 | https://techcrunch.com/2026/06/09/wwdc-2026-everything-announced-on-siri-ai-os-27-apple-intelligence-and-more/ | WWDC 2026: iOS 27 Sept 2026; Liquid Glass "dial back" customization; Siri; Health app additions | 2026-08-31 | y |
| 3 | https://docs.expo.dev/router/advanced/native-tabs/ | Expo NativeTabs: SDK 54+, alpha, system tab bar draws Liquid Glass; limitations | 2026-08-31 | y |
| 4 | https://www.apple.com/newsroom/2026/06/apple-reveals-winners-of-the-2026-apple-design-awards/ | ADA 2026 winners/finalists + Apple's wording (Tide Guide, Moonlitt, The Outsiders) | 2026-08-31 | y |
| 5 | https://www.apple.com/newsroom/2025/06/apple-unveils-winners-and-finalists-of-the-2025-apple-design-awards/ | ADA 2025 winners (Watch Duty et al.); health apps finalists only | 2026-08-31 | y |
| 6 | https://ouraring.com/blog/new-oura-app-experience/ | Oura 3-tab redesign (2024-10-03); Today tab contents; "Top Stories" quote | 2026-08-31 | y |
| 7 | https://ouraring.com/blog/new-app-design/ | Oura 2025-11-05 redesign: "one big thing," color-as-state, Advisor scope | 2026-08-31 | y |
| 8 | https://the5krunner.com/2025/10/15/whoop-homescreen-gets-a-revamp/ | Whoop home: tabs→dense scrollable page; central + button; Coach position/memory (secondary) | 2026-08-31 | y |
| 9 | https://gadgetsandwearables.com/2025/01/24/whoop-daily-outlook/ | Whoop Daily Outlook contents/access (secondary) | 2026-08-31 | y |
| 10 | https://support.whoop.com/APP_FEATURES__COACHING/Understanding_Your_WHOOP_Features/The_All-New_Home | Whoop primary home doc | 2026-08-31 | **n — HTTP 401** |
| 11 | https://support.apple.com/en-us/104997 | Apple Health Summary/Pinned/Highlights wording | 2026-08-31 | y |
| 12 | https://www.macrumors.com/guide/ios-27-health-app/ | iOS 27 health/fitness changes; Browse card redesign; Sept 2026 (secondary) | 2026-08-31 | y |
| 13 | https://apps.apple.com/us/app/gentler-streak-workout-tracker/id1576857102 | Gentler Streak v5.8 Liquid Glass notes quote; daily summary copy; 8.8K/4.7 | 2026-08-31 | y |
| 14 | https://developer.apple.com/news/?id=970ncww4 | Flighty Behind the Design: airport signage, "boringly obvious," smart states | 2026-08-31 | y |
| 15 | https://techcrunch.com/2025/09/25/openai-launches-chatgpt-pulse-to-proactively-write-you-morning-briefs | ChatGPT Pulse: 2025-09-25, 5–10 cards, "Great, that's it for today" | 2026-08-31 | y |
| 16 | https://apps.apple.com/us/app/the-pack-by-zoetis/id1633459819 | The Pack v0.68.13; notes; caregiver sharing v0.65.0; 9.4K/4.9; review quote | 2026-08-31 | y |
| 17 | https://apps.apple.com/us/app/doglog-track-your-dogs-life/id1229529595 | DogLog v3.36; iOS 26 glass notes verbatim; pricing; home jobs | 2026-08-31 | y |
| 18 | https://apps.apple.com/us/app/companain/id6747678727 | CompanAIn v1.0.6 What's New verbatim (new home screen, agents); tiers; 20 ratings | 2026-08-31 | y |
| 19 | https://itunes.apple.com/search?term=fi+dog+collar&entity=software&country=us&limit=5 | Fi v3.140.0 vitals + description quotes | 2026-08-31 | y |
| 20 | https://itunes.apple.com/search?term=tractive&entity=software&country=us&limit=5 | Tractive v26.34.0 vitals + health description quotes | 2026-08-31 | y |
| 21 | https://finance.yahoo.com/sectors/healthcare/articles/tractive-launches-next-generation-health-130000629.html | Tractive Health Intelligence 2026-04-08: Health screen, weekly plain-language insights, predictive alerts, disclaimers | 2026-08-31 | y |
| 22 | https://www.engadget.com/wearables/whistle-pet-trackers-are-shutting-down-next-month-212828325.html | Whistle shutdown 2025-08-31; Tractive replacement terms | 2026-08-31 | y |
| 23 | https://itunes.apple.com/search?term=whistle+pet&entity=software&country=us&limit=5 | No Whistle app in US search 2026-08-31 | 2026-08-31 | y |
| 24 | https://itunes.apple.com/search?term=petkit&entity=software&country=us&limit=3 | PETKIT v13.9.1; litter-box AI quotes; no vomit mention in current listing | 2026-08-31 | y |
| 25 | https://dataconomy.com/2026/01/05/petkit-unveils-ai-powered-pet-care-ecosystem-at-ces-2026/ | PETKIT CES 2026 ecosystem/dashboard | 2026-08-31 | **n — HTTP 403; search-snippet only** |
| 26 | https://itunes.apple.com/search?term=sure+petcare&entity=software&country=us&limit=5 | Sure Petcare v4.3.0; pet tiles/daily highlights/timeline quotes | 2026-08-31 | y |
| 27 | https://itunes.apple.com/search?term=petdesk&entity=software&country=us&limit=3 | PetDesk v10.0.1; 498,883 ratings; home jobs | 2026-08-31 | y |
| 28 | https://itunes.apple.com/search?term=chewy+pet&entity=software&country=us&limit=2 | Chewy trackId 1149449468; "Symptom Tracker" sentence verbatim | 2026-08-31 | y |
| 29 | https://itunes.apple.com/search?term=myvca&entity=software&country=us&limit=3 | myVCA v5.11.356; 39,908 ratings; home jobs | 2026-08-31 | y |
| 30 | https://itunes.apple.com/search?term=woofz&entity=software&country=us&limit=3 | Woofz v3.12; 55,501 ratings; AI assistant; weekly pricing | 2026-08-31 | y |
| 31 | https://itunes.apple.com/search?term=11pets&entity=software&country=us&limit=3 | 11pets v6.003.022; 77 ratings/3.29 | 2026-08-31 | y |
| 32 | https://itunes.apple.com/search?term=airvet&entity=software&country=us&limit=3 | Airvet v2.73.0 vitals + copy | 2026-08-31 | y |
| 33 | https://itunes.apple.com/search?term=vetster&entity=software&country=us&limit=3 | Vetster v3.56.0 vitals + copy | 2026-08-31 | y |
| 34 | https://itunes.apple.com/search?term=dutch+pet&entity=software&country=us&limit=3 | Dutch v1.2.9 vitals + copy | 2026-08-31 | y |
| 35 | https://itunes.apple.com/search?term=maven+pet&entity=software&country=us&limit=3 | Maven v1.35.0; 23 ratings; daily/weekly summaries copy | 2026-08-31 | y |
| 36 | https://itunes.apple.com/search?term=petfetti&entity=software&country=us&limit=3 | Petfetti v5.1.1; home-rearrange release notes verbatim | 2026-08-31 | y |
| 37 | https://itunes.apple.com/search?term=petalife&entity=software&country=us&limit=3 | Petalife v2.3.2; "Smarter home dashboard" notes verbatim; 2 ratings | 2026-08-31 | y |
| 38 | https://itunes.apple.com/search?term=everkin&entity=software&country=us&limit=3 | Everkin v1.9.0; correlation copy verbatim; 6 ratings | 2026-08-31 | y |
| 39 | https://itunes.apple.com/search?term=wonderdog&entity=software&country=us&limit=5 | Wonderdog shipped: v0.1.8, 2026-08-27, 0 ratings; baseline/AI-companion copy | 2026-08-31 | y |
| 40 | https://itunes.apple.com/search?term=perkypet&entity=software&country=us&limit=5 | PerkyPet AI still absent from US store | 2026-08-31 | y |
| 41 | https://apps.apple.com/us/app/vetpati-dog-cat-ai-health/id6760646762 | VetPati AI Butler verbatim incl. "positive reinforcement when everything looks good"; pricing | 2026-08-31 | y |
| 42 | https://itunes.apple.com/search?term=ttcare&entity=software&country=us&limit=5 (+ `ttcare+pet`) | TTcare consumer absent from US search; TTcare Vet v2.0.0 2026-08-28 | 2026-08-31 | y |
| 43 | https://itunes.apple.com/search?term=alltrails&entity=software&country=us&limit=2 | AllTrails v26.8.40; 1.04M ratings; explore-first home | 2026-08-31 | y |
| 44 | https://screensdesign.com/showcase/calm | Calm home structure (secondary teardown source) | 2026-08-31 | y |
| 45 | https://www.aiforpet.com/en | TTcare vendor claims (accuracy, images) | 2026-08-31 | n — search-snippet only |
| 46 | https://expo.dev/blog/liquid-glass-app-with-expo-ui-and-swiftui | Expo first-party Liquid Glass guide exists | 2026-08-31 | n — search-snippet only |
| 47 | Strava Athlete Intelligence (stuff.co.za 2025-02-21; press.strava.com) | Out of beta; NL summaries; vendor 80%-helpful stat | 2026-08-31 | n — search-snippet only |
| 48 | Headspace Today view (wearetenet.com; screensdesign) | Time-of-day-aware Today feed | 2026-08-31 | n — search-snippet only |
| 49 | https://docs.gentler.app/using-gentler-streak-widgets/overview-of-available-gentler-streak-widgets | Go Gentler widget = "most optimal daily action" | 2026-08-31 | n — search-snippet only |
| 50 | `docs/culprit-competitive-landscape-2026-07.md` (repo) | Roster; prior verified negatives (case-crossover, 207-listing diet-trial zero); Bending Spoons/IPO; Digitail/web-only entrants | 2026-08-31 | y (repo read) |
| 51 | https://developer.apple.com/news/?id=ueeok6yw | iOS 26 SDK mandatory for App Store uploads from 2026-04-28 (session re-verified verbatim) | 2026-08-31 | y |

---

*Carries evidence + research debt, not decisions. Prepared by session `2026-08-31-home-redesign-spike-kickoff` (CUL-773); decisions live on CUL-775 and in the spike's spec (CUL-777).*
