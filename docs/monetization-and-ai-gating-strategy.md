# Monetization & AI Gating Strategy — Session Record
**Date:** 2026-07-11 | **Status:** Strategy for PM ratification (spec follows in a separate session) | **Decision points:** D-M1–D-M7 (§8)

---

## 1. Context and the PM's proposal

Preparing for App Store submission. The PM proposed a five-step approach and asked the product team — plus an **App Store submission consultant** and **two VC advisors** (guest lenses for this session) — to stress-test it:

1. Feature-flag all AI features; submit for App Store review as a free app with AI off.
2. AI features become part of a paid upgrade.
3. Build the upgrade + payments layer later.
4. Possibly a "buy the creator a coffee" workflow as v0.1 of payments.
5. When AI is enabled, throttle so there's no abuse.

**Session parameters confirmed by the PM up front:** no hard submission date (quality-gated); ambition is a **real revenue business** (not cost-recovery, not explicitly venture-scale); **iOS-only via Apple IAP** for v1 of the paid tier; this session delivers strategy + decision points, and the build-ready step-by-step spec (including offline actions) comes after ratification.

**Prior art this session builds on (already in the record):**
- **B-001** (2026-05-17): "AI cost & rate-limit strategy — per-user/day cap, caching, cost-per-active-user. Revisit before first release." This session is that revisit.
- **B-263**: reconcile the paywall mock's placeholder bullets to a ratified freemium gate (D9). This session effectively *is* the D9 deliberation.
- **B-264**: StoreKit wiring bar (Guideline 3.1.2 disclosure set) when the gate lands. **B-265**: paywall placement (onboarding-terminus vs post-first-value). **B-266**: free-escape hierarchy.
- **B-252**: never gate an entitlement on owner-forgeable client state (`onboarding_completed_at` precedent) — entitlements need a server-side source of truth.
- **Freemium Open Question, narrowed 2026-07-06:** multi-pet ships free (B-086, decided); live sub-questions are "advanced correlation views: care or convenience?" and "does a 90-day history gate silently break the free vet report?"
- **Pets > $ / Principle 7** (non-negotiable, no PM confirmation needed to enforce): core logging, health alerts, trend visibility, and vet report export are always free. Premium wraps convenience, never care.

---

## 2. Ground truth — the AI dependency inventory (PM question 1)

Code-verified inventory (Explore pass, 2026-07-11). **Answer: no feature hard-breaks with AI off.** All four AI surfaces have working manual/deterministic fallbacks — but the *fallback UX* currently reads as an error, not an intentional state (see the catch in §2.1).

| Feature | Edge Function / model | If AI is off | Fallback quality |
|---|---|---|---|
| **AI Signal** (home) | `generate-signal` / Haiku 4.5 (phrasing only) | **Fully works.** Detection is 100% deterministic (`detection.ts`); Haiku only rewrites copy for two finding types, and `phraseFinding` falls back to guardrail-safe templates when `ANTHROPIC_API_KEY` is unset or errors (`index.ts:117-161`). Cache row still written on failure. Detectors ③–⑦ are already template-only; the summary line is template-only via kill-switch today. | **Perfect** — invisible degradation by design. |
| **Photo food extraction** | `extract-food-from-photo` / Sonnet 4.6 vision | Food entry still works: "Enter manually" on capture intro (`food-capture.tsx:504`), camera-denied path, and the zero-AI existing-food picker (re-logging a known food never calls the LLM). Extraction failure routes to the manual edit step with a banner. | Functional, but the failure banner reads "Couldn't read the label automatically" — an *error*, not a tier state. Owner loses auto-extracted ingredients/protein/prescription flags. |
| **Medication label extraction** | `extract-medication-from-photo` / Sonnet 4.6 vision | Manual entry works ("Enter manually", `MedicationNameChips`). **The §6.5 strength-confirm safety gate applies identically to hand-typed and AI-extracted values** — disabling AI does not weaken dose safety. | Functional; same error-banner framing issue. |
| **Per-incident vomit read** | `analyze-vomit` / Sonnet 4.6 vision | Vomit *logging* is fully independent (event + photo persist; the analysis trigger is fire-and-forget). No read → "Couldn't finish reading this one." + Try again, or "Not enough to say…". Owner can hand-enter the structured "What's visible" fields. Never-reassure holds structurally. **Note:** even on a vision failure, the function's *deterministic* contextual escalation flags (repeated vomiting, feline reduced intake, concurrent lethargy) still fire and can force `worth_a_call` with a template read. | Functional; the "off" state looks like a persistent malfunction with a retry button. |

**Also verified:** `generate-report` makes **no** LLM call (pure DB→HTML). There is **no feature-flag, remote-config, entitlement, StoreKit, or RevenueCat mechanism anywhere in runtime code** — the onboarding paywall (`app/onboarding/paywall.tsx`) is an explicitly non-functional mock whose "Start 7-day free trial" CTA shows a "Premium is on its way" alert and advances.

### 2.1 The consultant's first catch — the flag isn't free, and the mock is a live risk

Two concrete findings that reshape step 1 of the PM's plan:

1. **"Flags off" must not ship as error states.** If we submit with AI disabled and no UI awareness, the App Review reviewer (and every early user) hits "Couldn't read the label" banners and dead "Try again" buttons — the app looks broken, which is a Guideline 2.1 (app completeness) rejection pattern and a terrible first impression. A flag needs *flag-aware* UI: hide the photo-capture affordance and default to manual entry; hide the "Try analysis" link. That's real (small) client work per surface.
2. **The paywall mock cannot go to App Review as-is.** A visible "Start 7-day free trial" button that performs no purchase is a Guideline 2.1 / 3.1.2 mismatch (advertised paid functionality that doesn't exist). Whatever else we decide, **the mock must be flagged out of the submission build** until real IAP is wired. (New backlog item B-325.)

---

## 3. Divergent round — the option space

The team deliberately generated wide before converging. Options considered, with the lens that championed each:

### 3.1 Monetization models
- **(a) Freemium subscription** — free core + "Culprit Premium" auto-renewing sub (monthly + annual) gating AI conveniences. *(VC advisors, Dir. of Eng, Designer)*
- **(b) Tip jar / "buy the creator a coffee"** — the PM's v0.1. *(Nobody championed after the consultant's brief — see §4.)*
- **(c) One-time lifetime unlock** — single non-consumable IAP. *(Engineer: simplest wiring; VC: caps LTV, misprices an ongoing-API-cost product — recurring cost needs recurring revenue.)*
- **(d) Consumable credits** — pay-per-AI-read packs. *(Data Scientist: cleanly maps price to cost; Designer/Jordan: metering *care-adjacent* actions creates a decision at the moment of event — a Principle 1 violation at the worst possible moment.)*
- **(e) Vet-side monetization** — clinics pay, owners free. *(VC: the long-term big idea; everyone: not v1 — no clinic sales motion exists.)*
- **(f) Hybrid: subscription + a small number of free metered AI reads** — free tier gets N extractions/reads per month as a taste, Premium removes the meter. *(Sam, VC-2: best conversion mechanics; QA: most states to test.)*

### 3.2 What could be gated (beyond AI)
Evaluated against Pets > $ — each candidate classified **care** (never gate) or **convenience** (gateable):

| Candidate | Verdict | Why |
|---|---|---|
| History beyond 90 days | **Care — do not gate** | A >90-day diet trial or chronic case silently loses trend + vet-report completeness; breaks the "trends & reports always free" promise (already flagged in the D9 narrowing). Dr. Chen: an incomplete report is clinically worse than no report. |
| Advanced correlation views | **Care — do not gate** | Principle 3: Home is an intelligence surface; the correlation *is* the product's care claim. |
| Multi-pet | **Free — decided** (B-086) | Already ratified; the mock's completion screen promises "add pets anytime." |
| Data export / CSV | **Care/right — do not gate** | T&S: export is a data right (B-041), not a feature. |
| Vet report | **Care — free forever** | Principle 6/7; the wedge artifact. |
| Photo food extraction | **Convenience — gate** | Manual entry + the picker fully work; this is "we do the typing for you." |
| Medication label extraction | **Convenience — gate** | Same; the safety gate (strength confirm) is identical on both paths. |
| Per-incident vomit photo read | **Contested → D-M2** | See §6 conflict. |
| AI Signal (detection + card) | **Care — free forever** | And it costs ~nothing: detection is deterministic; Haiku phrasing is cache-bounded pennies. |
| "Ask AI" open-ended chat (B-228, unbuilt) | **Convenience-plus — the future Premium flagship** | First genuinely open-ended (expensive, unbounded) LLM surface; born-premium avoids any takeback. |
| Widgets / themes / priority support | **Convenience — gate** | Already the mock's placeholder bullets. |
| Reminders / confirmation pushes (B-288, unbuilt) | **Defer** | Principle-4 question still open; don't entangle. |

### 3.3 Flag mechanism options
- **(i) Build-time constant** — rejected: flipping requires a binary + review cycle.
- **(ii) Server env var per function** — kill switch only; client can't render intentional states.
- **(iii) Server-authoritative config table (`app_config`) read by both Edge Functions and client** — functions enforce (source of truth), client reads to *hide affordances and render tier states*. **Chosen direction** (ii is subsumed: keep `ANTHROPIC_API_KEY`-unset as the emergency kill switch we already have).
- Third-party remote config (Firebase/LaunchDarkly) — rejected: new dependency for a table's worth of state; Supabase already in the stack.

### 3.4 Entitlement + payments wiring options
- **StoreKit 2 direct** — no new vendor, but we own receipt validation, renewal webhooks, restore, and (later) Play Billing parity ourselves.
- **RevenueCat** — free tier well past our scale; server-side webhook → our own `entitlements` table (server-authoritative, satisfying **B-252**: Edge Functions check entitlements from our DB, never from client-forgeable state); Android later is a config change, not a rebuild. **Team recommendation.** Dir. of Eng: this is the "managed workflow" instinct applied to payments — don't hand-roll receipt cryptography in an app built by a two-lens team.

---

## 4. Guest lens — App Store submission consultant

Findings, in rejection-risk order:

1. **Guideline 3.1.1 — the coffee-tier constraint.** Any digital feature unlock must use Apple IAP. A Stripe/Ko-fi/Buy-Me-a-Coffee link that flips the AI flag = rejection. Even a *pure* tip collected in-app must itself be an IAP (3.2.1 permits tipping, via IAP, with Apple's cut). So "coffee that unlocks AI" is just a badly-shaped IAP subscription, and "coffee that unlocks nothing" is a revenue rounding error that still costs a purchase surface, restore handling, and review scrutiny. **Recommendation: drop step 4 entirely** — go straight to a properly-shaped subscription when payments land (→ D-M3).
2. **Guideline 2.1 — the dead-trial-button mock** must not be in the submission build (§2.1). Also 2.1: provide a **demo account with seeded data** (B-271, already logged) — a reviewer in an empty account can't evaluate the Signal and "unable to evaluate features" is a stock rejection.
3. **Guideline 2.3.1 — metadata accuracy.** Screenshots and description must not show flagged-off features. If we submit AI-off, the listing can't lead with photo extraction.
4. **"Free now, paid later" is a completely standard, penalty-free path.** Adding IAP later is a normal update. No strategic cost to deferring payments — the sequencing question is purely about product experience and data (§5).
5. **When Premium does land (bundle into B-264's wiring PR):** 3.1.2 disclosure set — price + renewal terms adjacent to the CTA ("then £X/yr, cancel anytime"), **Restore Purchases** affordance, functional links to ToS (B-230) + privacy policy (B-229). Paywall-in-onboarding is fine *if* the free path is clear (B-266's hierarchy work).
6. **Health-app posture (1.4.1):** the blanket medical disclaimer (B-270) + reviewer notes explaining the never-reassure design of AI reads ("escalates, never diagnoses, never all-clears") preempt the health-claims conversation.
7. **App Privacy label (B-268) interaction:** whichever AI surfaces are live at submission determine whether Anthropic appears as a processor for user photos at v1. AI-off simplifies the label; AI-on just means declaring it now instead of at the Premium update. Not a decider — declare-it-now is fine — but the label, policy (B-229), and flag states must agree at submission time.
8. **The actual submission critical path is unchanged by this session:** B-039 (in-app account deletion, 5.1.1(v) hard blocker — partial), B-229/230 (legal docs — in progress), B-267 (permission strings), B-268 (privacy label), B-269 (listing assets), B-270 (disclaimer), B-271 (demo account), B-272 (store record/name), B-273 (support URL/site — in progress), B-280 (password reset). **Monetization is not on this path. Do not let it block submission.**
9. **Enroll in the Apple Small Business Program** (≤$1M/yr proceeds → 15% commission instead of 30%). Offline action for the spec's step-by-step; also complete the App Store Connect **Agreements, Tax, and Banking** section before any IAP can even be configured.

---

## 5. Guest lens — VC advisors

Two advisors, deliberately different postures:

**Advisor 1 (consumer-subscription operator):**
- **Kill the tip jar.** Tips anchor the product as a hobby and destroy price integrity before you've ever set a price. You said "real revenue business" — behave like one from the first dollar: a named product ("Culprit Premium"), a real price, a real trial.
- **Pet care is a proven willingness-to-pay category** (adjacent comps: dog-training and pet-care apps sustain ~$40–80/yr subs; pet owners already out-spend most consumer-app categories on their animals). The reactive wedge is *high-intent by construction* — an owner mid-diet-trial is the easiest consumer subscription sale that exists. Price placeholder to carry into the spec: **$4.99/mo + $39.99/yr (7-day trial on annual)**; validate later, don't underprice at $1.99 — pricing signals seriousness, and Small Business Program margins make the unit economics comfortable.
- **Paywall placement:** the onboarding-terminus paywall converts terribly relative to post-first-value triggers. B-265 already says this — elevate it: the *trigger moments* are "first Signal card rendered" and "first vet report shared." Keep a low-pressure onboarding mention at most.
- **Takeback risk:** features that launch free and later move behind a gate generate outsized resentment (reviews, refunds). Either mark AI conveniences "free during early access" *in-product from day one*, or grandfather pre-gate accounts. Decide the posture **before** launch, not at gate time (→ D-M6).

**Advisor 2 (early-stage/metrics posture):**
- **Your gross margin is not the risk — your retention is.** The AI surfaces are architecturally cheap (one extraction per food, cache-bounded Haiku, bounded per-incident reads): median cost per active user is pennies/month. Throttling is about the *abuse tail*, not the median — so caps can be generous and invisible to every honest user.
- **What I'd want to see before a raise:** conversion to trial, trial→paid, M1/M3 retention by cohort, and time-to-first-insight (B-047 — instrument it *before* the paywall lands or you'll never know what converted). The monetization layer is as much an instrument as a revenue stream at this stage.
- **The free tier is the moat, not a cost center.** In a health-trust category, "the safety features are free, forever, structurally" is a *positioning weapon* — it's why an owner recommends it to their vet and vice versa. Pets > $ isn't in tension with the business; at this stage it *is* the business. Guard it in the paywall copy itself (the mock's "Always free: logging, health alerts, trends & vet reports" line is exactly right — keep it load-bearing).
- On ambition: nothing in this plan forecloses venture-scale later (vet-side B2B, the council/report enrichment), but don't build for it now — build the cleanest possible consumer sub and let the data argue.

---

## 6. Persona feedback on the proposed model

The model presented to them: free core (everything deterministic + all care surfaces) / Culprit Premium gates photo extraction (food + med), future Ask-AI chat, widgets/themes.

**Jordan (diet-trial dog owner):** "I'd pay *during the trial* — that's when I'm desperate. **Monthly matters to me**: my problem might be over in eight weeks; don't make annual the only real option. What I can't stomach: my dog just vomited, I photograph it, and the app asks for $4.99 before it *looks*. That would make me delete it. Typing a food name myself because I'm on the free tier? Completely fine — that's my labor, not my dog's health." → Supports gating extraction; **hard no** on gating the incident read at the moment of crisis; wants monthly pricing prominent.

**Sam (grazing/picky-cat owner):** "Photo extraction is the thing I'd actually pay for — I rotate a lot of foods and typing ingredient lists is misery. But give me a taste: if I've never seen the extraction work, I don't know what I'm buying. Two or three free scans, then the gate." → Argues for hybrid metering (§3.1f) on extraction specifically, or at minimum trial access.

**Dr. Chen (vet):** "My requirements: the report stays complete and free — an owner who can't afford Premium must not hand me a report with holes; adherence and history can never be tier-dependent. On the vomit read: honestly, the *photo description* is not standard of care — what matters clinically is the escalation logic and the structured record, and you've told me those are deterministic and survive without the model. So I'm less absolutist than you'd expect: gate the descriptive read if you must, **never gate the escalation**. But understand what you'd be spending — the first time a paywall appears between a worried owner and *anything* labeled 'analysis' of their pet's vomit, you've taught them what the app is." → Report/history/escalation untouchable; descriptive read gateable in principle but reputationally expensive.

**QA:** every gate multiplies states — (free, premium, capped, flag-off) × (online, offline, mid-sync). Demands: entitlement state must be locally cached for offline (an owner doesn't lose Premium in a dead zone), and every gated surface needs a designed "not included" state, a designed "cap reached" state, and a designed "entitlement expired" state. No gate ships without all three.

**T&S/Privacy:** entitlement checks server-side only (B-252); throttle counters are usage metadata — keep them out of any analytics pipeline until B-016 decides PII posture; if AI ships on at submission, Anthropic must be in the privacy policy (B-229) + App Privacy label (B-268) from day one; export/deletion (B-039/B-041) must include AI-derived artifacts regardless of tier.

---

## 7. Persona conflict — surfaced per protocol

> **Trust & Safety + Designer:** The per-incident vomit read is escalate-only by construction — it can only ever *raise* concern. Putting any part of it behind a paywall means a paying owner can receive a "worth a call" escalation a free owner wouldn't see. That is care, and Principle 7 says never.
> **Dir. of Eng + VC Advisor 1:** The deterministic contextual escalation flags (repeated vomiting, feline reduced intake, lethargy) fire *without* the model and stay free — the safety floor is identical on both tiers. What the model adds is a richer descriptive read: convenience layered on a free safety base. And it's our only *unbounded-ish* vision cost per symptomatic pet.
> **Dr. Chen (tiebreak input, not a resolution):** clinically the descriptive read is not standard of care; reputationally, gating anything near a crisis moment is the most expensive gate in the app.
> **PM decision needed (D-M2):** free / premium / hybrid for the descriptive vomit read. Team's majority recommendation: **free at launch** (it's cheap while user count is small, it's the trust moat, and the cap system bounds abuse), with an explicit data-informed revisit once real usage exists.

(Second known tension — Designer vs conversion on paywall placement — is already captured as B-265 and folds into the spec.)

---

## 8. Convergent recommendation + PM decision points

### The strategy in one paragraph
Ship the App Store v1 **free**, with AI surfaces **on but server-capped** (not flagged off), after landing two small pieces of infrastructure that are needed in every future anyway: a server-authoritative feature-flag/config mechanism and per-user AI usage throttles. Kill the coffee tier. Then wire **Culprit Premium** (single auto-renewing subscription, monthly + annual, via RevenueCat → server-side entitlements) as its own track, gating **photo extraction (food + med)** and future convenience AI (Ask-AI chat is born-premium), while the Signal, vet report, health alerts, escalations, history, multi-pet, and export stay free forever — Pets > $ enforced structurally, and marketed as such.

### Decision points

| # | Decision | Options | Team recommendation |
|---|---|---|---|
| **D-M1** | Ratify the free/premium boundary (§3.2 table) | — | Free forever: Signal + detection, vet report, alerts/escalations, history (all of it), multi-pet, export, core logging. Premium: food-photo extraction, med-label extraction, Ask-AI chat (when built), widgets/themes/priority support. **This becomes D9 and resolves B-263's bullet list.** |
| **D-M2** | Descriptive vomit photo read: free / premium / hybrid meter | Free at launch, revisit with data / Premium from gate day / N free reads per month | **Free at launch**, escalation free *forever* regardless; explicit revisit checkpoint when Premium ships. (§7 conflict — this is genuinely yours.) |
| **D-M3** | Coffee tier | Keep as v0.1 / drop | **Drop.** 3.1.1 makes an unlocking tip an IAP anyway; a non-unlocking tip is hobby-signaling for ~no revenue. Go straight to the subscription. |
| **D-M4** | Submission posture for AI | (a) Flags off at submission (PM's original plan) / (b) **AI on, free, server-capped** | **(b).** With no hard date and ~zero launch users, cost exposure is pennies and caps bound the tail; (a) buys a worse review experience (hidden differentiators, error-looking states), extra hide-the-UI work, and a listing that can't show the product. Flags still get built — as the kill switch and the future gate mechanism. |
| **D-M5** | Pricing placeholder for the spec | — | **$4.99/mo, $39.99/yr, 7-day trial on annual**; enroll Apple Small Business Program. Placeholder to validate — but the spec needs a number. |
| **D-M6** | Early-adopter posture when the gate lands | Grandfather pre-gate accounts / "free during early access" labeling from day one / neither | **"Free during early access" labeling** on the two extraction surfaces from v1 launch — cheapest honest option, preserves the gate. |
| **D-M7** | Throttle caps (§9 table) | — | Ratify the proposed numbers as spec inputs; they're deliberately generous (abuse-tail, not median). |

### Answers to the PM's three questions
1. **"Are there features that genuinely break without AI?"** No — verified in code (§2). Signal degrades invisibly by design; extraction surfaces have manual paths; vomit logging is AI-independent and even keeps deterministic escalation. The real cost of "off" is that today's fallbacks *look like errors*, so flag-off requires flag-aware UI states (B-324).
2. **"Is this a good monetization strategy? Gate other areas?"** The skeleton is right (flags → free submission → paid AI → throttles); the session's corrections: drop the coffee tier (D-M3), reorder to throttle-before-submission rather than payments-before-AI (D-M4), and gate by the care/convenience line rather than "AI vs non-AI" — the Signal is AI-branded but deterministic care (free), while the strongest additional gates are non-AI conveniences (widgets/themes) and the *future* Ask-AI chat. Do not gate history, correlation views, export, or the report (§3.2).
3. **"What other questions should we have?"** Collected in §10.

---

## 9. Throttling architecture (pre-spec sketch — detail lands in the spec)

**Shape:** per-user, per-function, per-day counters in a new `ai_usage` table (`user_id, function, day, count` — additive migration, own PR, RLS: owner-read/service-write), incremented and checked inside each Edge Function *before* the Anthropic call. Over-cap returns a clean, typed `cap_reached` response (never a bare 429/500) that the client renders as designed copy — warm, specific, never blaming (nyx-voice pass required). Entitlement tier (once Premium exists) reads from the server-side `entitlements` table (RevenueCat webhook-fed), never from client state (B-252).

**Proposed caps (D-M7)** — generous by design; an honest heavy user should never see them:

| Function | Cost profile | Free cap (proposed) | Premium cap | Notes |
|---|---|---|---|---|
| `extract-food-from-photo` | Sonnet vision, once per new food | 15/day, 60/month | 40/day | Bounded naturally — a pantry is finite; re-logging is zero-AI. |
| `extract-medication-from-photo` | Sonnet vision, once per new med | 10/day | 20/day | Same shape. |
| `analyze-vomit` | Sonnet vision, per incident | 10/day | 10/day | Deliberately identical across tiers per D-M2's direction; a genuinely bad day is ~5 incidents; retries hit the same counter. Cap copy must never read as "pay to analyze" — safety framing reviewed by Dr. Chen + `clinical-guardrails`. |
| `generate-signal` | Haiku, 24h cache + debounce | 12 regens/pet/day | same | Cache already does the real work; cap is a backstop against a client bug loop. |
| Ask-AI chat (future) | Unbounded conversational | n/a (premium-only) | e.g. 50 msgs/day | Born-premium + hardest-throttled; sized in its own spec (B-228). |

**Existing kill switch stays:** unsetting `ANTHROPIC_API_KEY` already degrades every surface safely (§2) — that's the emergency lever; flags are the *product* lever.

---

## 10. Questions the PM should be asking (question 3) — carried into the spec

Offline/account actions (the spec will sequence these step-by-step as requested):
1. **App Store Connect: Agreements, Tax, and Banking** — must be complete before any IAP can be configured. Who is the legal entity / merchant identity? (Sole trader vs company affects tax forms.)
2. **Apple Small Business Program enrollment** (15% commission) — enroll before first paid transaction.
3. **RevenueCat account + app setup** (free tier) — project, API keys (→ Secrets Register), webhook → Supabase endpoint.
4. **Product configuration in App Store Connect** — subscription group, monthly + annual products, trial offer, localized pricing.

Product/policy questions to answer in or before the spec:
5. **Household/caregiver interplay (B-292):** if shared-care lands, does one Premium cover the household? (Recommendation: yes — per-pet value, per-account billing splits a family's care.)
6. **Lapse behavior:** when a subscription lapses, previously-extracted data stays (data created is the owner's — T&S); only the *ability to run new* extractions gates. Confirm as an invariant.
7. **Refund/restore flows** — Restore Purchases placement; what support@getculprit.app says to a refund request (Apple handles the money; we handle the tone).
8. **Promo/comp mechanism** — offer codes for vets, testers, support gestures? (App Store Connect offer codes exist; decide posture, not mechanics, now.)
9. **Reviewer access to Premium** at the gate-launch submission — sandbox/demo entitlement in the review notes.
10. **Android timing** — RevenueCat makes Play Billing a later config exercise; decide the trigger (demand signal? iOS conversion data?).
11. **Price localization + territory posture** — launch territories at v1 (fewer = simpler legal/label review).
12. **Instrumentation prerequisite (B-047/B-016):** conversion and time-to-first-insight tracking should exist before the paywall ships, or the pricing/placement decisions stay guesses. Sequencing dependency, not optional.
13. **Grandfathering mechanics** if D-M6 goes that way (an `early_access` flag on `user_profiles` is trivial *now*, painful retroactively).

---

## 11. Sequencing (respects "no hard date"; monetization never blocks submission)

**Track 1 — Submission (unchanged critical path, independent of this session):** B-039 → B-229/230/270 → B-267/268/269/271/272/273 → B-280. Plus from this session: **B-325** (paywall mock flagged out of the submission build).

**Track 2 — AI infrastructure (this session's new work, small, before submission):**
1. **PR 1** — `app_config` flag table + migration (own PR, additive, pre-flight clean).
2. **PR 2** — `ai_usage` throttle table + cap checks in the four functions + typed `cap_reached` responses (tests; `adversarial-reviewer` on the cap logic touching `analyze-vomit`'s safety path).
3. **PR 3** — client: flag-aware affordance hiding + designed cap-reached states (nyx-voice + Designer pass).

**Track 3 — Premium (after ratification; after or parallel to submission, never blocking it):**
4. RevenueCat + `entitlements` table + webhook (rls-privacy-reviewer mandatory).
5. Paywall un-mock: real StoreKit products + B-264's disclosure set + B-265 placement + B-266 hierarchy.
6. Gate flip on the two extraction surfaces (+ "free during early access" labels retired), `pm-feature-review` on the full flow.

Tracks 1 and 2 are disjoint-file parallel. Track 3 is gated on D-M1–D-M6.

---

## 12. Backlog + record changes made this session

- **B-324** (new): server-authoritative feature-flag/config mechanism + flag-aware client states.
- **B-325** (new): flag the non-functional paywall mock out of the submission build (2.1/3.1.2 risk).
- **B-326** (new): RevenueCat + server-side `entitlements` (satisfies B-252's constraint for paid features).
- **B-001** (updated): promoted `Later → Now`; design lives here (§9); execution = Track 2 PR 2.
- **CLAUDE.md Open Questions**: one consolidated row for D-M1–D-M7 pointing at this doc.
- B-263/B-264/B-265/B-266 unchanged — they activate on ratification.
