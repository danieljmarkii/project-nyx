# Nyx — Analytics Dashboard Requirements

**Status:** DRAFT — design session 2026-06-13; **PM design review 2026-06-14** (clickable mocks: `docs/mockups/analytics-dashboard-mockup.html` + `-v2.html`) resolved the **layout direction (summary-led)**, the **Home doorways / no-4th-tab**, **detail-screen range control**, the **meals-only finished-rate**, and **Meals & treats as a v1 card** — all folded into the sections below. Two gates remain before build: the user-facing name (§13 #1) and the colour-as-wellness ruling (§13 #6).
**Working name:** "analytics dashboard" (internal). User-facing name is an open decision (§13) — leaning *"Nyx's health"* / *"Patterns"*; **never "Analytics"** (engineer jargon, fails `nyx-voice`).
**Anchor backlog item:** B-023 (this doc is the build-ready expansion of it). Composes with B-069, B-046, B-053, B-004.
**Build phase:** Post-MVP. Sequenced **after Step 9 (vet report)** — see §14. This is design-ahead.

---

## 0. What this doc covers — and deliberately does not

**Covers:** the owner-facing analytics *destination* (tier 2 of the intelligence ladder, §2) — its entry point, card taxonomy, the seeded metric set, the AI summary, empty states, the safety invariants that govern it, and the bridge to the vet report.

**Does NOT cover:**
- The **Home Signal** (B-045 / Step 10 — already built; tier 1). The dashboard *reuses* its engine but is a distinct surface.
- The **vet report internals** (Step 9 — tier 3). The dashboard *produces* it via a bridge (§9) but does not redefine it.
- **Build-your-own analytics** (query builders, segment pickers, editable metric trees, funnels, cohort grids). These are explicitly **rejected** (§3, §4.1) — they are the defining feature of B2B analytics tools and the single worst fit for our users.
- Final visual design (colors, exact type ramp) — that's a Designer task on top of this spec.

---

## 1. Purpose & current state

**The pain / opportunity.** Owners ask concrete questions the data can already answer but the app can't surface today:
- "How many times has Nyx vomited this month?" (count / frequency)
- "What does she eat most? What protein?" (intake)
- "Is she actually getting better?" (trend)
- "What should I tell the vet?" (the visit-prep bridge)

Today the only way to answer these is to scroll the History timeline and count by hand. The Home Signal (tier 1) answers *the one thing that matters today* but is deliberately capped and calm — it is not where you go to explore.

**Positioning (from B-023).** This surface is the lever that broadens Nyx from the reactive sensitive-stomach / diet-trial wedge to the larger "the app that knows your pet" market — and it's nearly free, because the data substrate (`events`, `meals.intake_rating`, `food_items`, the detection engine) already exists. Zero new logging burden; honors Principles 1 & 2.

**Current state.** Home Signal built & deployed (Step 10). Vet report is Step 9 (interrupted, blocked on the PDF-library open question). Multi-pet v1 shipped (this surface is per-active-pet). This dashboard is not yet built.

---

## 2. The three-tier intelligence ladder

The "distinct surfaces, shared engine" decision (PM, 2026-06-13) gives a clean architecture — three surfaces, one engine underneath, each with one job and one governing principle:

| Tier | Surface | Job | Governing principle | Posture |
|---|---|---|---|---|
| 1 | **Home Signal** (built) | The 1 thing to know today | Principle 3 | Push · ≤4 cards · calm |
| 2 | **The dashboard** (this doc) | The full story, on demand | Principles 3 + 5 | Pull · uncapped · exploratory |
| 3 | **Vet report** (Step 9) | Clinical export | Principle 6 | Share · 60-second cold read |

**The relationship answers the PM's "is it the vet report?" question:** No — the dashboard is the tier *above* the report. The vet report is what the dashboard **produces** when the owner taps "Share with my vet" (§9). The owner explores in warm, interactive language (tier 2); the vet receives the clinical-grade export (tier 3). Same engine, two consumers, two principles that would fight if forced onto one screen.

**Shared engine.** The dashboard reuses: the deterministic detection engine (`detection.ts`), correlation findings + coverage diagnostics (`ai_signals`), intake aggregates, symptom-frequency windows, and the `generate-signal` phrasing pattern. Most *count/intake/trend* cards are cheap **local SQLite aggregates** (instant, offline-capable); *correlations and the AI summary* are **server-computed** (Edge Function, cached) — never on-device, per the architecture constraint.

---

## 3. Design stance — seeded, not build-your-own (the central paradigm decision)

**Decision: a curated, pre-seeded set of cards. No query building, ever.**

The research swept Amplitude, Mixpanel, Heap, and Pendo (§4.1). They are a goldmine for *one* thing — the card anatomy — and a trap for everything else. Their core paradigm is "compose your own question": event-segmentation builders, funnels, cohort/retention grids, editable metric trees. That paradigm is **rejected** for Nyx:

- Jordan is answering a question while her dog is being weird. Sam wants to know if the cat is eating. Neither builds a funnel.
- It violates Principle 1 (zero decisions) and the 10-second test.
- A consumer health app's job is to **pre-answer** the questions that matter, not hand the owner an analytics IDE.

**What we take vs. reject:**

| Take | Reject |
|---|---|
| The four-layer KPI card (label / big number / sparkline / delta) | Query & segment builders |
| The "seeded starter dashboard" *philosophy* (pre-build the few questions that matter) | Editable metric trees / metric definitions |
| Card-as-doorway → detail screen | Funnels, cohort/retention grids |
| "Show the number next to the sentence" grounding | Dense multi-KPI executive grids |
| | Customizable / reorderable tiles (MVP — see §13) |

The engine decides card priority (safety always leads); the owner does not configure the dashboard. This is the same discipline as the Home Signal, extended.

---

## 4. Competitive research synthesis (2026-06-13)

Full citations retained for future sessions. Verdicts are for *a calm consumer mobile health surface* (Calm/Linear/Oura benchmark, 10-second test), not a B2B tool.

### 4.1 Card & visualization language — Amplitude / Mixpanel / Heap / Pendo

**The four-layer KPI card** (well-standardized; this is our primary card):
1. **Label** — what it is, plain, muted, subordinate.
2. **The big number (BAN)** — current value, large, dominant.
3. **Sparkline** — tiny trend line, *no axes, no values* — its only job is the *shape* (rising / falling / flat).
4. **Period delta** — change vs. the prior comparable period, with a directional arrow + color.

**Load-bearing adaptation — invert the color semantics for health.** In growth dashboards green = up = good. For an adverse count (vomits ↑), up = *concern*. **Color must mean "good / bad *for the pet*," never "number went up."** A falling vomit count is calm, not a green "win" (the n=1-never-reassure rule scaled up — and the gating in §11).

**Viz catalog with verdicts:**

| Viz | Question it answers | Verdict for Nyx |
|---|---|---|
| Big number / KPI card | "What's the value right now?" | **ADOPT — primary.** |
| Sparkline | "Which way, roughly?" | **ADOPT.** Pairs with the BAN, no axes. |
| Line chart | "How has it moved over time?" | **ADOPT (detail screen only).** Single series, no gridlines, plain-language label. |
| Bar / column | "Compare across days/categories." | **ADOPT (selective).** Good for "events per day"; honest at zero. No stacking. |
| **Calendar heat-grid** | "How *often* — which days?" | **ADOPT for episodic symptoms.** A colored month grid reads "how often" faster than a bar chart (Apple Health pattern). |
| Area / pie / donut / scatter | — | **AVOID.** Decorative or poor for small-N health data. |
| Funnel / cohort grid / segmentation builder / stickiness / tables / flows / session replay | — | **REJECT.** B2B analyst artifacts; see §3. |

**Seeded-dashboard philosophy (validated).** Amplitude ships "Starter Dashboard Templates" pre-answering the few universal questions; Tableau Pulse surfaces the top ~3 insights; Power BI Smart Narrative caps at ≤4/visual and "picks the most interesting." Every serious tool **caps and curates** — strong external validation for Principle 3 and our ~4-card discipline.

Sources: [Amplitude templates](https://amplitude.com/templates) · [Starter templates](https://community.amplitude.com/product-updates/introducing-starter-dashboard-templates-1332) · [Mixpanel chart types](https://docs.mixpanel.com/docs/features/chart-customization) · [Heap chart types](https://help.heap.io/hc/en-us/sections/36055227114769-Chart-Types) · [Pendo widgets](https://support.pendo.io/hc/en-us/articles/360032752991-Dashboard-widgets) · KPI anatomy: [phData](https://www.phdata.io/blog/dashboard-design-essentials-kpi-templates/).

### 4.2 Mobile-first UX — Oura / Whoop / Apple Health

The best consumer-health dashboards converge on one skeleton: **hero number(s) at top → vertical scroll of one-metric-per-card → each card is a "doorway, not a destination" into a detail screen → the time-range control lives on the detail screen, not the home.** This is our three-zone home extended.

**Steal:**
- **"Better/worse than YOUR baseline" as the core insight unit** — not absolute numbers, not two overlaid lines. "Stool has been firmer this week than last" + a faint baseline band beats a dual-axis chart. *Highest-leverage pattern for non-technical owners.*
- **Hero number + restrained sparkline; charts with no axes/gridlines/legend** — Whoop's "the background doesn't compete"; ~34% faster scanning. The literal recipe for the 10-second test.
- **Calendar heat-grid for frequency** (Apple) — ideal for "how often did this happen this month."
- **The "still learning the baseline" calibration state** (Whoop gates coaches to day 5/7) — converts our n=1 guardrail into a *warm onboarding moment* instead of an empty chart (§10). **Strong steal.**
- **Time-range = a simple segmented control (Week / Month / 3-Month) on the *detail* screen only** (Apple's D/W/M/6M/Y) — keep the dashboard itself range-free; it's a glance surface.

**Avoid (these products got criticized for exactly these):**
- **Robotic / jargon annotations** (Whoop's "multiple days below strain targets will promote recovery" — the #1 cited failure). Our whole moat is warm plain copy; every chart annotation is a `nyx-voice` sentence, never "0 emesis events / 7d window."
- **Tappable-but-unsignposted cards** (Oura's flagged weakness) — make cards *visibly* openable (chevron, affordance, `hitSlop`).
- **Customizable/reorderable tiles in MVP** — even Apple's half-measure annoys users; let the engine prioritize, safety leads. Backlog it.

**Chart library (Engineer call at build):** lean **`react-native-gifted-charts`** — SVG, **works in Expo Go** (managed workflow, no ejection), calm simple lines/bars. Escalate to **Victory Native (Skia)** only if a chart needs Skia-grade interaction (it requires an Expo dev build; we have EAS, so viable, but overkill for static trends).

Sources: [Oura new app](https://ouraring.com/blog/new-oura-app-experience/) · [Whoop design breakdown](https://www.925studios.co/blog/whoop-design-breakdown) · [Apple Health viz teardown](https://lenaviz.medium.com/elevating-apple-health-with-intuitive-data-visualizations-for-wellness-insights-eeefb6109f02) · [humanist mobile data viz](https://www.createwithswift.com/designing-humanist-data-visualization-for-mobile/) · [RN chart libs](https://blog.logrocket.com/top-react-native-chart-libraries/). *(Supabase's dashboard was a PM-suggested reference; it's a clean desktop **developer** dashboard — useful as an aesthetic touchstone for card restraint, but its B2D/desktop interaction model is less transferable than the consumer-mobile benchmarks above.)*

### 4.3 AI narrative — the safe pattern, and the hall-of-fame of failures

**The whole industry has converged on Nyx's existing architecture: compute the facts deterministically, let the LLM only phrase them.**

- **Tableau Pulse (reference implementation):** "deterministic statistical models that are guaranteed to be accurate" produce the ground-truth facts; the LLM phrases them; the output is validated. Salesforce's own phrase: "deterministic statistical models, which are incapable of lying." This is verbatim our B-045 Step 2 decision.
- **Same split:** Looker (semantic layer computes, LLM maps intent — "-2/3 errors"), Amplitude (LLM → JSON query → engine computes; "rather than feeding all event data to the LLM…"), Dexcom Stelo (GenAI "enhances phrasing" of pre-computed Weekly Insights; "does not provide medical advice"), Samsung (deterministic Energy Score → on-device LLM narrates).
- **The riskier path** (Power BI Copilot, Fitbit/Gemini, MyFitnessPal AI Coach) lets the LLM author the query / do the arithmetic / infer causation — and every one ships an "AI may be incorrect, verify before sharing" disclaimer, which is itself an admission the pattern is unsafe.

**The failure hall-of-fame (why this matters for us specifically):**
- **Google AI Health Overviews — PULLED for false reassurance.** Summaries called liver-test ranges "normal" while omitting that serious liver disease *can* present with normal results. Expert: "This false reassurance could be very harmful." → **verbatim our "absence ≠ wellness / n=1 never reassures" invariant, validated by a public retraction.**
- **Eight Sleep (May 2026) — our exact bug, in production.** The morning summary attributed reduced snoring to alcohol and said "keep the habits that helped" — single-sample causal inference → false reassurance, contradicting the medical fact. *This is the nearest-preceding-meal attribution bug, shipped by someone else.*
- **Garmin Active Intelligence — mocked for restating obvious arithmetic** ("subtracting 115 from 300"). Insight, not echo.
- **Strava — free-associated** "hope you're okay after that car accident" on an ended ride.

**Academic backbone (the *why*):** neural data-to-text hallucinates more than templates; LLMs are unreliable at arithmetic *and worse when numbers are embedded in prose*; low temperature ≠ factual; grounding cuts but doesn't eliminate hallucination (so a `validate`-style check that rejects any number not in the payload is still required); LLMs are systematically overconfident and **cannot self-hedge** — so hedging must be enforced by the template, not the model.

**The causal-language finding (sharpens our associational-only rule):** people **read "associated with" as causal**, and "associated with an increased risk" as *strongly* causal — even when offered "neither." **Softening the verb is insufficient.** Any association we surface must carry an explicit non-causal cue (and ideally a confound example), not just a hedged verb.

**The regulatory line as a copy charter (FDA general-wellness):** to stay "general wellness" (not a medical device): don't diagnose, don't name diseases, don't label outputs "abnormal/pathological," don't give clinical thresholds. **Explicitly permitted:** prompt the user to consult a professional when something is outside a normal range — *as long as you don't name a disease or assert abnormality.* This is a near-exact charter for our "talk to your vet" escalation.

**Additional precedents worth citing (consumer & pet health, June 2026):**
- **Google's Fitbit coach** — a *separate deterministic "data-science agent"* computes the stats via tool calls; the conversational agent only phrases them. Google states this "structurally prevents hallucinated numbers." The strongest, most-recent **health-domain** mirror of our architecture.
- **WHOOP Weekly Performance Assessment** — a *static, auto-generated, scheduled weekly narrative* anchored to the user's rolling baseline. The closest analog to our AI summary's **shape** (served, periodic, comparison-anchored — not a chatbot).
- **PetPace** (pet collar) — *escalation-first*: "detect early, consult your vet," never "your pet looks fine." A **pet-specific** precedent for our escalate-not-reassure + vet-routing posture.
- **Bearable** (symptom tracker) — ships **no** AI narrative on purpose, only correlation charts the user interprets; cited as the cleanest avoidance of the false-reassurance trap. The reminder that **restraint (show the data, don't narrate it) is always the safe fallback** when phrasing is uncertain.
- **Quantified backing (TFTS health-text study):** letting the LLM compute gave **16.9%** numeric error vs. **0.7%** for the deterministic-compute → LLM-phrase hybrid; it names four tasks that must stay deterministic — arithmetic, selection policy, evidence-gated attribution, and *which facts enter the prose*.

Sources: [Tableau Pulse insight types](https://help.tableau.com/current/online/en-us/pulse_insights_platform_insight_types.htm) · [Looker semantic layer + GenAI](https://cloud.google.com/blog/products/business-intelligence/how-lookers-semantic-layer-enhances-gen-ai-trustworthiness) · [Ask Amplitude architecture (AWS)](https://aws.amazon.com/blogs/big-data/how-amplitude-implemented-natural-language-powered-analytics-using-amazon-opensearch-service-as-a-vector-database/) · [Dexcom GenAI](https://www.medtechdive.com/news/dexcom-gen-ai-feature-stelo-cgm/735918/) · [Google retraction](https://www.aol.com/news/google-removes-multiple-ai-health-114037227.html) · [Eight Sleep attribution criticism](https://mwm.ai/articles/eight-sleep-s-ai-sleep-coach-draws-criticism-for-unsound-advice-in-may-2026) · [NLG hallucination survey](https://arxiv.org/html/2202.03629) · [associational-reads-as-causal (PLOS ONE)](https://pmc.ncbi.nlm.nih.gov/articles/PMC10194916/) · [FDA general-wellness 2026](https://www.troutman.com/insights/fdas-2026-guidance-on-general-wellness-devices-policy-for-low-risk-devices/) · ["keyhole effect" — chat is wrong for data](https://arxiv.org/pdf/2602.00947) · [Google Fitbit personal health coach (3-agent)](https://research.google/blog/how-we-are-building-the-personal-health-coach/) · [WHOOP Weekly Performance Assessment](https://www.whoop.com/eu/en/thelocker/new-weekly-performance-assessment/) · [PetPace AI collar (escalation-first)](https://petpace.com/petpace-launches-worlds-first-ai-smart-collar-that-includes-24-7-global-telehealth-and-telemedicine-revolutionizing-real-time-health-monitoring-for-dogs-and-cats/) · [Bearable symptom tracker (no-narrative)](https://bearable.app/symptom-tracker/) · [TFTS health-text deterministic-vs-LLM study](https://arxiv.org/html/2605.29652).

---

## 5. Card taxonomy & visual language

**The card is the atom of the dashboard.** Every card is a server- or locally-computed **finished result** — never a query the owner composes.

**Card types (v1):**
1. **Count card** (the four-layer KPI, §4.1) — label / big number / sparkline / period delta. The "how many times" workhorse. Color inverted for adverse metrics (§11).
2. **Trend card** — a count card whose detail screen opens a single-series line/bar with a Week/Month/3-Month segmented control and a plain-language "vs your baseline" read.
3. **Ranking card** — "Top food," "Top protein" (§6). A short ranked list with counts/rates, not a pie chart.
4. **Frequency-calendar card** — month heat-grid for episodic symptoms ("how often").
5. **Pattern card** — an established correlation or "watching" item (reuses Signal finding rendering; associational copy + confidence tier).
6. **Composition card** *(added PM review 2026-06-14)* — a single proportion bar over a labelled split with counts (v1 instance: **meals vs treats** this month). Descriptive only — *what was logged*, never a verdict on the owner's feeding choices. One idea, no stacking beyond the two-part split.

**Universal card rules:**
- One idea per card. No dense grids.
- Cards are **doorways**: tap → detail screen. Make tappability visible.
- Every number on a card is engine-computed; copy is `nyx-voice` (warm sentence, never jargon).
- Color carries the verdict *for the pet*, and only on **established multi-sample** metrics — a single observation stays neutral (§11).

---

## 6. The seeded metric set — v1 cards (grouped by the owner's question)

Curated, in priority order. Safety-class cards always lead (Principle 3). Each maps to existing data.

### A. "Is Nyx okay / getting better?" — health trajectory
- **Symptom counts** — vomit, stool (by consistency), lethargy, etc.: count card, WoW/MoM delta, **color inverted** (rising = concern). *(local: `events`)*
- **Symptom frequency calendar** — month heat-grid per symptom ("how often"). *(local: `events`)*
- **Diet-trial progress** — day counter / milestone toward the trial, anchored on `diet_trials.started_at`. *(local)*
- **Guardrail:** a falling line is *never* framed as an all-clear (§11).

### B. "What does Nyx eat & like?" — food & intake (descriptive, NOT preference)
- **Top food** — most-logged / most-eaten food (your #3). Inarguable, descriptive. *(local: `meals` × `food_items`)*
- **Top protein** — most-consumed `primary_protein` (your #3.1). The card Nyx is **uniquely positioned** to show. *(local, via `canonicalizeProtein`)*
- **Meals & treats composition** *(added PM review 2026-06-14, ships v1)* — the month's split of logged **meals vs treats**, as a proportion bar + counts (composition card, §5 #6). Descriptive (what was logged), never a judgment on the owner; it ties to the meal-type-collapse coverage signal when a stretch goes treats-only ("worth sharing with your vet," framed as coverage, never blame). *(local: `meals` × `food_items.food_type`)*
- **Intake / finished-rate (MEALS ONLY)** — share of **meals** rated `most`/`all` over N samples. **Treats are excluded from the denominator** *(PM review 2026-06-14)*: pets finish treats at a ceiling rate, so blending them in inflates the number and **masks a meal refusal** — the clinically load-bearing decline signal (§11 #1). *(local: `meals.intake_rating` where `food_type != 'treat'`)*
- **Guardrails (non-negotiable, §11):** this is *intake*, never relabeled "preference." A food Nyx has **started refusing** surfaces as a **health watch, not "picky."** Free-fed foods carry "intake not directly observed" and are never read as "didn't eat."

### C. "What's connected?" — patterns & links
- **Established correlations** — food/protein → symptom, confidence-tiered, **associational copy + explicit non-causal cue** (§4.3). *(server: detection engine)*
- **"Patterns we're watching"** (B-046) — the opt-in, off-by-default view for weak/emerging signals. **A pull surface is exactly where these belong** — off the Home push surface, where the curious owner opts in; never concern-framed. *(server)*
- **Why no signal yet** (B-053 coverage) — honest "here's what would unlock a pattern," never "you're fine." *(server)*

### D. The vet bridge — see §9.

---

## 7. The AI summary (the AI-forward centerpiece)

**What it is:** a short, warm narrative at the **top of the dashboard** that synthesizes the already-computed cards into 2–4 sentences — "Here's what I'm seeing for Nyx this month." **Static narrative, NOT a chat** (the "keyhole effect" — chat is the wrong shape for "what changed"; and every chat-based health AI in the research is where the safety incidents cluster).

**Layout decision — summary-led (PM, 2026-06-14).** The dashboard **leads with the AI summary at the top** (its `ComingSoonSummary` precursor until PR 4, §7.1), with the safety cards immediately below. Three top-of-dashboard treatments were mocked (`analytics-dashboard-mockup-v2.html`); two were rejected for v1: **hero-stat-led** (a single big safety number leads, Oura/Whoop-style — instantly answers "is she okay?" but privileges one metric and risks a gamified "score" against §11 #3) and **calm-uniform** (no hero, all cards equal, Bearable-style — calmest, but spends the AI summary, our differentiator). Summary-led wins because the AI summary is the thing Nyx is uniquely positioned to offer and §7 already names it the centerpiece. **Adopted refinement:** borrow the hero treatment's prominence for the **"vs your baseline" read** (§4.2) into the lead safety card, so the surface keeps the editorial-AI personality *and* the instant "is she okay?" answer.

> **The governing principle: LLM as Phraser, never Analyst.** The model never computes a number, never ranks, never infers a cause, never decides whether a pattern exists. Code does all of that deterministically and hands the model a finished, already-true **fact packet**; the model's *only* job is to turn those facts into warm, plain copy. Every number it emits must trace to the packet — anything it can't trace, it can't say. This one line is what separates the safe players (Google Fitbit, Tableau Pulse, Dexcom) from the retractions (Google Health Overviews, Eight Sleep), it's the architecture Nyx already runs in Step 10, and it governs this entire section.

**Reference models (research, §4.3):** WHOOP's Weekly Performance Assessment for the *shape* (served, periodic, baseline-anchored static narrative); Google's Fitbit three-agent split for the *architecture* (deterministic data-science agent computes, conversational agent only phrases — "structurally prevents hallucinated numbers"); PetPace's "consult your vet, never 'fine'" for the *escalation posture*; Bearable as the *restraint fallback* (when phrasing of a finding is uncertain, show the card and stay silent rather than narrate).

**Architecture — the safe pattern, validated by the entire industry (§4.3):**
- All facts/aggregates are computed **deterministically** (the §6 cards: SQLite aggregates + the detection engine).
- The LLM receives **only the structured, already-true facts** (card values, deltas, findings) — **never the raw event log**.
- The LLM's only job is **phrasing & prioritization** into a warm paragraph. It never computes a number, never infers a pattern, never asserts a cause.
- **`validateSummary` guardrail** (extends `validatePhrasing`): reject any number not present in the input payload; reject reassurance-on-absence; reject causal language; reject disease names (FDA line). Drift → fall back to the deterministic template.
- **Deterministic template fallback** if the LLM/key is unavailable (mirrors `generate-signal`).
- **Model:** Haiku 4.5 (phrasing, not reasoning — consistent with the Signal). Revisit only if quality demands Sonnet.
- **Cache:** 24h TTL, regen on the Signal's cadence (daily-expiry + debounced-after-log); **cache-read on dashboard open, never a live LLM call.**
- Likely reuses the `generate-signal` Edge Function family; exact shape (extend vs. sibling `generate-summary`) is a build-time call.

**Grounding ("show the work"):** the summary sits *above the cards it summarizes* — every claim it makes is backed by a card the owner can see and tap. (Withings/Oura "number next to the sentence" pattern.) No unattributable assertions.

**Safety (the hall-of-fame, as hard rules):**
- **Never reassure on absence** (Google liver-test retraction). "No vomiting logged this week" is an honest *observation*, never "Nyx is well."
- **Never infer causation from sparse data** (Eight Sleep). Cross-incident, multi-sample only — the one place reassurance is permitted per `clinical-guardrails`, and only quantified across many samples.
- **Associational + explicit non-causal cue**, not just a softened verb (the "associated with reads as causal" finding).
- **Route concerning findings to "talk to your vet"** (FDA-permitted; Function Health's escalation tiering).
- **Don't restate obvious arithmetic** (Garmin). Insight, not echo.
- **Pass the "what do I do next?" test** or it's a vanity sentence — cut it.

**Why this is genuinely "AI-forward" *and* safe:** it's a new, prominent AI surface, but it stays on the right side of every documented failure precisely because the model never touches the math or the causation — exactly the line that separated the safe players (Dexcom/Samsung/Tableau) from the retractions (Google/Eight Sleep).

### 7.1 Interim state — the "coming soon" summary (ships in PR 3, before the AI lands)

The AI summary is sequenced last (PR 4), but the dashboard ships before it (PR 3). Rather than leave a gap or hide the slot, the AI summary's place ships as a **designed, anticipatory card** pinned at the top of the dashboard — so owners know something good is coming and the layout never jumps when PR 4 lands. PM-requested; this is a feature, built well.

- **Why it's a feature, not a banned placeholder (Principle 5, resolved):** Principle 5 says "never a placeholder" — a gray "Coming soon" chip is exactly that, and is banned. But a *warm, honest, forward-looking* card that tells a small true story about what's being built is precisely what Principle 5 endorses (it's the same move as the first-run Signal empty state, "We're getting to know Luna"). The bar: it must look intentional and calm, reserve the real summary's slot, and point to value that already exists.
- **Copy (nyx-voice, first-person-pet — final wording at build):** e.g. *"Soon, I'll pull everything I'm noticing across Nyx's patterns into a few plain sentences, right here. For now, the cards below have the details."* Warm, specific about *what's* coming, and it hands the owner to the value that's already on screen.
- **Must NOT:** promise a clinical capability ("I'll tell you if Nyx is healthy" — crosses the FDA/clinical line even as a tease); read as an upsell (the summary is care-relevant → free, never premium — Principle 7); nag; or use an exclamation mark.
- **Trust caveat (Designer + Trust & Safety):** only ship the coming-soon if PR 4 is genuinely committed — a "coming soon" that never arrives erodes trust. Frame it as a calm intention, not a dated promise.
- **Hand-off:** PR 4 swaps `ComingSoonSummary` for `AiSummaryCard` in the *same slot* — zero layout change.

---

## 8. Entry point & navigation

- **From Home (honoring the PM's "tap from home" framing):** a quiet footer affordance on the Signal zone — *"See all of Nyx's patterns →"* — that **navigates to a dedicated destination**. **Not a 4th Home zone** (Principle 3 — Home stays a calm intelligence surface, not a dashboard). Optionally, each expanded Signal card gets an "explore →" deep-link into the relevant dashboard section.
- **Home doorways (PM, 2026-06-14):** beyond the Signal-footer CTA, each Home zone becomes a visible doorway to its deeper surface — the **Trend zone opens the dashboard** ("All patterns ›") and the **Today zone opens History, filtered to today (clearable)** ("History ›"). This is the discoverability answer the PM asked for — *instead of* a 4th tab — so the dashboard is reachable from the zone that already implies it.
- **Not a 4th tab in MVP (PM-ratified 2026-06-14).** The bar stays Home · History · Pet; a 4th tab + FAB reads as a feature menu and competes with "Home is the intelligence surface" (Principle 3), and a tab is permanent chrome (one-way door) where an affordance is reversible. Promote to a tab later **only if the in-home doorways under-discover** (that's B-004's conversation).
- **Per active pet** (multi-pet aware — carries the active pet from Home; switcher already exists).
- **Card → detail screen** is the internal navigation (the "doorway" pattern). **Time-range control lives on detail screens only** — the dashboard itself stays a range-free glance (a global dashboard range control was considered and rejected, PM 2026-06-14).

---

## 9. The vet-report bridge (tier 2 → tier 3)

- A persistent **"Share with my vet" / "Prepare for a visit"** action on the dashboard.
- It assembles the clinical report (default range: **since last vet visit**, else 30 days) → **Step 9 vet report**, inheriting its mechanics: server-side PDF, `share_token`, 30-day expiry, link `nyx.app/report/{share_token}`, openable without a vet account, RLS-enforced expiry.
- This is the **first deliberately unauthenticated path to pet health data** reached from this surface — it inherits Step 9's scrutiny and is exactly what the `rls-privacy-reviewer` subagent exists to red-team.
- **Clinical content is the report's, not the dashboard's.** The warm owner cards do not leak onto the clinical export; the bridge re-renders the underlying *facts* in Principle-6 form. (The n=1 worry reads remain owner-only, per B-013.)

---

## 10. Empty / low-data states & the "still learning" calibration state

Principle 5 territory — and the research gives us a strong, specific pattern.

- **Per-card empty states, not one blank dashboard.** Each card owns its empty state (three-part: small calm graphic / short *why* / forward-looking next step).
- **Distinguish the causes, word them differently:**
  - First-use / not enough data → onboarding tone: "Log a few more meals and I'll start spotting Nyx's patterns."
  - Genuinely no events → *good news, warm:* "No vomiting logged this month." (Never styled as a reassuring all-clear — see §11.)
- **The "still learning Nyx's baseline — N more days" calibration state** (Whoop day-5/7 pattern). When a trend lacks the sample floor to be honest, show this designed state — **never a fabricated flat line, never a reassuring read on thin data.** This turns the n=1 guardrail (a data-quality constraint) into a trust-building moment.
- **Set expectations:** tell the owner *when* a card will populate.
- Copy is pure `nyx-voice`: no "error/unable/no data"; warm, specific, forward-looking.

---

## 11. Safety invariants (the load-bearing constraints)

These govern every card and the summary. They are not negotiable and require no PM confirmation to enforce.

1. **Intake is not preference.** Top food / top protein / finished-rate are *descriptive intake* metrics. Never relabel them "preference." A **declining-intake** trend routes to a **health watch**, never softened to "picky" (anorexia is a non-specific disease sign; the feline 48h hepatic-lipidosis window). Validated externally by the Google/Function "in-range = fine" false-reassurance failures. **Finished-rate is meals-only (PM, 2026-06-14):** treats are excluded from the denominator — pets finish treats at a ceiling rate, so including them inflates the number and *masks a meal refusal* (the decline signal). Treats are surfaced separately (the Meals & treats composition card, §6), never folded into intake quality.
2. **n=1 never reassures, scaled up.** A single observation never gets a reassuring color or read. Reassurance is permitted **only** from cross-incident, multi-sample, quantified findings (the AI summary's one allowance) — and **never on the absence** of a signal.
3. **Adverse counts are honest, never gamified.** Color = good/bad *for the pet*. A falling vomit count is calm, not a green "win." No streaks/badges on adverse metrics.
4. **Associational only, with an explicit non-causal cue.** Softening the verb is insufficient (research §4.3). No causal claims; no disease names (FDA line).
5. **Minimum-sample floors on every ranking/rate.** "Top protein" off 3 meals is noise — gate on N (reuse the Signal's floors). Below floor → the calibration state (§10), not a card.
6. **Free-feeding honesty.** A free-fed food means intake is not directly observed — never read absence as "didn't eat," never reassure on it (carries the B-040 §2 guardrail).

**Persona conflict already surfaced (needs a Data Scientist + Dr. Chen ruling at build):** the universal consumer pattern of *semantic color = wellness* (green/yellow/red) tensions with invariant #2. Proposed resolution above (color only on established multi-sample metrics; single observations neutral) — ratify before building the card component.

---

## 12. Premium boundary (Principle 7 — "Pets > $")

Principle 7 already lists "advanced correlation views" as a candidate premium feature, so this surface has a foot in the paid conversation. The line:

- **Free, forever:** anything care-relevant — symptom counts/trends, the declining-intake health watches, care-affecting correlations, the AI summary, the vet report. Gating any of these would reduce care quality → free.
- **Premium-shaped (candidate):** pure convenience/curiosity — "compare Nyx to similar pets" (a cross-pet, RLS-crossing server aggregate — different build), deep historical export, extended history beyond the free window, dashboard customization.
- **Decision deferred** (B-023d, post-MVP). Flagged now so the design doesn't accidentally paywall care.

---

## 13. Open decisions for the build session

| # | Decision | Lean / Resolution |
|---|---|---|
| 1 | **User-facing name** (not "Analytics") | **OPEN** — *"Nyx's patterns"* shown in the mocks; leaning that or *"Nyx's health."* PM call before build. |
| 2 | Default time range | **RESOLVED 2026-06-14:** **Month** default; Week / 3-Month toggle on the **detail screen only** — the dashboard stays a range-free glance (a global dashboard range control was rejected). |
| 3 | AI summary model | **Haiku 4.5**; revisit if quality demands Sonnet |
| 4 | AI summary: extend `generate-signal` vs. sibling `generate-summary` | Build-time call; reuse the pattern + cache table either way |
| 5 | Chart library | **`react-native-gifted-charts`** (Expo-Go-safe) |
| 6 | Color-as-wellness vs. n=1 guardrail (§11) | **OPEN** — Color only on established multi-sample metrics — **Data Scientist + Dr. Chen to ratify** before the card component (PR 2). |
| 7 | Entry point: Home affordance now, tab later? | **RESOLVED 2026-06-14:** Home doorways (Trend→Dashboard, Today→History filtered) + Signal-footer CTA for v1; **no 4th tab**; tab is B-004 only if doorways under-discover (§8). |
| 8 | Premium line (§12) | Defer to B-023d |
| 9 | Are per-incident `event_ai_analysis` flags surfaced as a card? | Lean no for v1 (owner-facing already on the detail screen); revisit |
| 10 | **Dashboard layout direction** | **RESOLVED 2026-06-14: summary-led** (Direction A). Hero-stat-led & calm-uniform mocked and rejected for v1; borrow the "vs baseline" prominence into the lead card (§7). |
| 11 | **Meals & treats composition card in v1?** | **RESOLVED 2026-06-14: yes, v1** (§5 #6 / §6). New card type beyond the original §6 set. |
| 12 | **Finished-rate: blended or meals-only?** | **RESOLVED 2026-06-14: meals-only** — treats excluded (ceiling finish-rate masks meal refusal, §11 #1). |

---

## 14. PR-by-PR build breakdown (hand-off ready)

**How to use this section.** Each PR is self-contained enough to run in a fresh Claude Code session. That session should first read `CLAUDE.md`, this spec, and the named files, then build exactly one PR to the project's standards (TypeScript strict; theme tokens only; tests per the DoD; one PR per session; draft PR + Manual QA script on push). **No PR in this plan changes the database schema** — the dashboard rides existing tables (`events`, `meals`, `food_items`, `diet_trials`, `feeding_arrangements`) + the `ai_signals` jsonb cache.

**Dependency map & sequencing**
- **PR 1 → 2 → 3 → 4 is a strict chain** and is **buildable now** — it needs only the existing Step 10 engine + local SQLite tables, **not** Step 9.
- **PR 5 (vet bridge) is the only PR that requires Step 9 (the vet report) to exist.** Build it after Step 9 ships.
- **Roadmap note:** the spec's overall "after Step 9" framing (§1) is a PM *resourcing* call (don't starve the vet report) — not a technical block on PRs 1–4. A build session can run PRs 1–4 ahead of Step 9 if the PM greenlights it.

**Two prerequisites to settle before building (PM + experts, not the build session):**
- **(§13 #6) the color-as-wellness ruling** — Data Scientist + Dr. Chen decide when color may imply "good/bad for the pet" (proposal: only on *established multi-sample* metrics; single observations stay neutral). **PR 2 needs this as an input.**
- **`canonicalizeProtein` is server-only today** (`supabase/functions/generate-signal/protein.ts`). PR 1 needs it client-side for top-protein → port it to a shared `lib/protein.ts` (and have the Edge Function import the shared copy, to keep one source).

---

### PR 1 — Analytics aggregate layer (pure logic, no UI)
- **Goal:** compute every dashboard metric deterministically from local SQLite.
- **Depends on:** nothing (existing `lib/db.ts`).
- **Files:** create `lib/analytics.ts` + `lib/analytics.test.ts`; port `canonicalizeProtein` → `lib/protein.ts`.
- **Functions (pure, per-pet, each takes a window):** `getSymptomCounts`, `getSymptomFrequencyByDay` (calendar grid), `getTopFoods`, `getTopProteins`, `getIntakeRate` **(meals only — excludes `food_type='treat'`)**, `getMealTreatComposition` **(new, PM 2026-06-14 — meal vs treat counts for the §6 composition card)**, `getDietTrialProgress`, `detectIntakeDecline` (→ a health-watch flag, never "picky").
- **Key logic:** trailing **calendar** windows (Week / Month / 3-Month), not raw ms spans (the B-084 lesson); min-sample floors (reuse the Signal's) → below-floor returns a `notEnoughData` sentinel, never a fabricated rank; exclude free-fed foods from intake-rate denominators + carry "intake not directly observed"; **exclude treats (`food_type='treat'`) from the finished-rate denominator** (§11 #1 — treats' ceiling finish-rate masks meal refusal); canonicalize protein before ranking.
- **AC:** counts/rankings match a hand-built fixture; below-floor → sentinel (no rank invented); `detectIntakeDecline` returns a watch flag and a test asserts it never returns a "preference"/"picky" framing; free-fed foods excluded from intake rates; **a test asserts treats are excluded from `getIntakeRate` and that `getMealTreatComposition` counts them separately.**
- **Tests:** jest unit (DoD: a `lib/` util ⇒ tests required).
- **Review:** Data Scientist (floors, denominators, intake≠preference); **adversarial-reviewer** (decline-detection + ranking are statistically/clinically load-bearing).
- **Schema:** none.
- **Kickoff prompt:** *"Read CLAUDE.md + docs/nyx-analytics-dashboard-requirements.md (§5, §6, §11, §14 PR 1). Build PR 1: the analytics aggregate layer in `lib/analytics.ts` (pure, per-pet, windowed), porting `canonicalizeProtein` to `lib/protein.ts`. Calendar windows, min-sample floors (below-floor → sentinel, never a fabricated rank), intake-decline routes to a health-watch flag (never 'picky'), free-fed foods excluded from intake rates. Jest tests required. No schema, no UI. Run the adversarial-reviewer on the decline/ranking logic before opening the draft PR."*

### PR 2 — Card components (the visual language)
- **Goal:** the reusable, calm card set.
- **Depends on:** PR 1; the §13 #6 color ruling (confirm resolved first).
- **Files:** create `components/dashboard/MetricCard.tsx` (four layers: label / big number / sparkline / delta), `Sparkline.tsx` (`react-native-gifted-charts` wrapper), `RankingCard.tsx`, `FrequencyCalendarCard.tsx`, `CompositionCard.tsx` **(new — meals vs treats proportion bar, §5 #6)**, `MetricDetailScreen.tsx` (Week/Month/3-Month segmented control; surfaces the "vs your baseline" read prominently per the §7 summary-led refinement); co-located tests; add `react-native-gifted-charts` to `package.json`.
- **Key logic:** a `polarity: 'adverse' | 'neutral' | 'positive'` prop drives color — **inverted for adverse** (rising vomits = concern, falling = calm, never a green "win"); color applied **only to established multi-sample metrics** per the ruling; charts have no axes/gridlines/legend; plain-language annotation (no jargon); visibly tappable + 44pt/`hitSlop`; theme tokens only.
- **AC:** four layers render; adverse-rising = concern color, adverse-falling = calm (not green); per-card empty + "still learning the baseline" calibration states; card looks tappable; passes the 10-second glance.
- **Tests:** component tests for the polarity→color mapping + the empty/calibration-state selection (extract the selection as a pure fn and test it).
- **Review:** Designer (lead — Principles 3/5, with Jordan + Sam); Engineer (gifted-charts in Expo Go / managed workflow); nyx-voice (annotations).
- **Schema:** none.
- **Kickoff prompt:** *"...Build PR 2: the dashboard card components in `components/dashboard/` (MetricCard four-layer big-number+sparkline+delta, RankingCard, FrequencyCalendarCard, MetricDetailScreen) using react-native-gifted-charts. Color is inverted for adverse metrics and applied only to established multi-sample metrics (confirm the §13 #6 ruling is resolved). No axes/gridlines, theme tokens only, 44pt tap targets, visible tappability. Component tests for the color-polarity + empty/calibration-state logic."*

### PR 3 — Dashboard screen + Home entry + the "coming soon" AI-summary card
- **Goal:** assemble the seeded dashboard, wire the entry point, and ship the designed AI-summary anticipatory state (§7.1).
- **Depends on:** PR 2.
- **Files:** create `app/insights/index.tsx` (route, per active pet), `components/dashboard/ComingSoonSummary.tsx`, `components/dashboard/DashboardEmptyState.tsx`; modify `components/home/SignalZone.tsx` (quiet "See all of Nyx's patterns →" footer affordance) **and `components/home/TrendZone.tsx` (open the dashboard — "All patterns ›") + `components/home/TodayZone.tsx` (open History filtered to today — "History ›"), per the §8 Home-doorways decision**; extract + test a pure `orderDashboardCards` (safety leads).
- **Key logic:** **summary-led layout** (§7) — `ComingSoonSummary` pinned at the top in the AI summary's slot (§7.1), then the seeded card set in priority order (safety first — §6, now including the **Meals & treats composition card**), per active pet (multi-pet switcher-aware), cold-start + calibration states.
- **AC:** the Home affordance opens the dashboard scoped to the active pet (navigates away, not a zone); cards render in priority order, safety leads; honest empty/calibration states; the coming-soon card is warm and intentional (not a gray box), reserves the slot, makes **no** clinical promise, **no** upsell, **no** "!".
- **Tests:** jest for `orderDashboardCards` + state selection; screen smoke test.
- **Review:** Designer (lead, with Jordan + Sam); nyx-voice (coming-soon + empty-state copy); Trust & Safety (coming-soon over-promise check).
- **Schema:** none.
- **Kickoff prompt:** *"...Build PR 3: the dashboard screen at `app/insights/index.tsx` (seeded cards in priority order, safety leads, per active pet, empty + calibration states), the Home entry affordance in `components/home/SignalZone.tsx` ('See all of Nyx's patterns →', navigates away — not a 4th zone), and the well-designed `ComingSoonSummary` per §7.1 (warm nyx-voice, reserves the AI-summary slot, no clinical promise / upsell / '!'). Tests for card ordering + state selection."*

### PR 4 — The AI summary (LLM as Phraser)
- **Goal:** replace the coming-soon card with the real summary, on the deterministic-facts → phrasing architecture (§7).
- **Depends on:** PR 1 (the fact packet) + PR 3 (the slot); reuses the Step 10 engine (already built).
- **Files:** extend `supabase/functions/generate-signal/` — assemble a **fact packet** from PR 1's aggregates + existing findings; add `phraseSummary` + **`validateSummary`** in `phrasing.ts`; cache in `ai_signals` jsonb (or a sibling `generate-summary/` function if cleaner) + deno tests; client `lib/summary.ts` (cache-read) + `components/dashboard/AiSummaryCard.tsx` (swaps `ComingSoonSummary` in the **same slot**, evidence tappable).
- **Key logic (the §7 governing principle):** Haiku 4.5 receives **only the fact packet, never raw events**; phrases 2–4 sentences; **`validateSummary` rejects** any number not in the packet, any reassurance-on-absence, any causal claim, any disease name; deterministic template fallback if the key is unset; 24h cache, regen on the Signal cadence, **cache-read on open (no live LLM call)**; evidence rendered beneath / tappable to the cards it summarizes.
- **AC:** every number in the output ∈ the packet (test asserts this); quiet/empty data → no reassurance (test); associational only; template fallback when key unset; no live LLM call on dashboard open; tapping evidence opens the underlying cards.
- **Tests:** deno unit for `validateSummary` (= clinical-guardrails Pattern 8 as assertions) + fallback; jest for client cache-read.
- **Review:** **adversarial-reviewer MANDATORY** (the never-reassure-on-absence + no-fabricated-number guarantees are the load-bearing claims); `clinical-guardrails` skill; nyx-voice.
- **Schema:** none (rides `ai_signals` jsonb).
- **Kickoff prompt:** *"...Build PR 4: the AI summary on the LLM-as-Phraser architecture (§7). Extend generate-signal to assemble a deterministic fact packet (PR 1 aggregates + findings) and phrase it with Haiku via a forced tool, gated by a new `validateSummary` that rejects any number not in the packet, any reassurance-on-absence, any causal claim, any disease name; deterministic template fallback; 24h cache, cache-read on open. Client `AiSummaryCard` replaces `ComingSoonSummary` in the same slot with tappable evidence. Deno tests for validateSummary (clinical-guardrails Pattern 8). The adversarial-reviewer is MANDATORY before the PR is ready."*

### PR 5 — Vet-report bridge
- **Goal:** "Share with my vet" → the Step 9 report.
- **Depends on:** **Step 9 (vet report) must be built first.**
- **Files:** modify the dashboard screen (add the Share action); wire to Step 9's report-generation + share-token path.
- **Key logic:** default range = since last vet visit (else 30 days); generate the report; native share sheet; inherit Step 9 mechanics (`share_token`, 30-day expiry, `nyx.app/report/{token}`, opens without a vet account). **No owner-only content (the n=1 reads) leaks onto the report** (Principle 6; B-013).
- **AC:** Share generates a report for the active pet over the default range; token + 30-day expiry; link opens without an account; owner-only reads absent from the report.
- **Tests:** per Step 9's surface.
- **Review:** **rls-privacy-reviewer MANDATORY** (first deliberately unauthenticated path to health data from this surface); Dr. Chen / **vet-report-cold-read** on the rendered output.
- **Schema:** per Step 9.
- **Kickoff prompt:** *"(After Step 9 ships.) ...Build PR 5: the 'Share with my vet' bridge from the dashboard to the Step 9 vet report (default range = since last visit; share token + 30-day expiry; no owner-only n=1 reads on the report). The rls-privacy-reviewer is MANDATORY; run vet-report-cold-read on the rendered output."*

---

## 15. Persona sign-off (this scoping)

- **Sr. Product Designer** (lead, per PM) — ✓ on the seeded-not-build-your-own stance, the doorway navigation, and empty/calibration states; owns the visual pass on §5. Flag: color-as-wellness (§11 #6) needs the clinical ruling before the card component.
- **Pet Owner — Jordan** ✓✓ — "how many times / am I getting better / what do I tell the vet" are her real questions; the 10-second card pattern + vet bridge serve her directly.
- **Pet Owner (cat) — Sam** ✓✓ — top food / top protein / intake-rate is her surface; *gated hard* on invariant #1 (decline ≠ picky — the fussy-vs-sick ambiguity is her whole risk).
- **Sr. Data Scientist** ✓ (conditional) — architecture (deterministic compute → LLM phrase) is right and externally validated; conditions: min-sample floors (§11 #5), associational+non-causal-cue (§4.3), and the §11 #6 ruling.
- **Veterinarian — Dr. Chen** ✓ (conditional) — supports as long as the owner surface never reassures on absence and the clinical content stays on the report (tier 3), not the warm cards. Co-owns the §11 #6 ruling.
- **Dir. of Engineering** ✓ — reuses the engine + cache; local aggregates keep it cheap/offline; `gifted-charts` respects the managed-Expo constraint.
- **Trust & Safety / Privacy** ✓ — the vet bridge (§9) is the sensitive path; `rls-privacy-reviewer` gate named.
- **Product Owner / Backlog Steward** — anchor is B-023; this doc is its build-ready expansion; composes with B-069/B-046/B-053/B-004.

---

_Research briefs (2026-06-13) synthesized in §4; full source lists inline. Can be spun out into `docs/research/` if the complete receipts are wanted._
