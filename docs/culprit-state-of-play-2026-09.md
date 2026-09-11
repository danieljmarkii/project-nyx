# Culprit — State of Play, September 2026

**Date:** 2026-09-11 · **Status:** 🧊 FROZEN point-in-time artifact — do not version-bump; write a new dated pack if the picture changes
**Method:** 8 isolated research lanes (4 internal repo/live-DB forensics, 4 external web-grounded sweeps), each handed to a separate adversarial verifier that re-ran the queries and re-fetched the URLs. 23 agents, 761 tool calls. Verdicts: 7 × `MOSTLY_SOLID`, 1 × `SHAKY` (the analogs lane — see §8).
**Purpose:** the Phase 0 input pack for `docs/culprit-strategy-review-PROMPT.md`. It exists so ten isolated panel seats do not each re-derive the same facts, and so none of them reasons from a number this pass already broke.

**Evidence convention:** `[E]` verified against a live system or a fetched primary source · `[C]` verified in our own code or DB, with the query or file:line · `[A]` reasoned assumption · `[MK]` model knowledge, not freshly verified · **⚠** a claim that a verifier refuted or had to soften, with the corrected form given.

> **Read §8 before you cite anything in §2–§7.** The corrections register is not an appendix. This project's own documented dominant error mode (CUL-671) is claims stated one notch stronger than their source, and this research pass reproduced it: one lane fabricated a statistic outright, one mis-attributed the load-bearing quote in its own headline, and three restated a stale `STATUS.md` number as a live measurement. The register is the part of this document with the highest information density.

---

## 1. The one-paragraph picture

Culprit is a technically excellent, extensively specified, pre-launch iOS pet health app built in roughly four months by one person and ~830 agent-authored pull requests. It has **never had a user.** Production holds nine auth accounts, of which one has ever produced an organic record: the founder's cat. No veterinarian has ever read the vet report that is the product's entire reason for existing. There is no analytics, no crash reporting, no payment infrastructure and no distribution plan of any kind. The App Store Launch project has been open for 22 days and has closed zero of its 25 issues, while five to six new feature tracks opened around it, one of them today. Meanwhile a solo developer shipped a free app to the App Store in April 2026 that markets the same four-part wedge this project believes is unoccupied, and it has zero ratings.

---

## 2. Production reality (live Supabase `aigchluqluzuhtbfllgh`, queried 2026-09-11)

| Fact | Value | Grade |
|---|---|---|
| `auth.users` total | **9** | `[C]` |
| …of which the founder's own addresses (primary + aliases + SMTP/test) | 5 | `[C]` |
| …QA account (`nyx-qa-ask@`), App Review demo account (`support@`) | 2 | `[C]` |
| …signed up and **never signed in** (`cmonachino@`, `djm0017@`) | 2 | `[C]` |
| Accounts that have ever produced an organic record | **1** | `[C]` |
| `pets` | 4 | `[C]` |
| `events` | 2,174 total / 1,881 live | `[C]` |
| …founder's cat Nyx | 1,024 | `[C]` |
| …QA mirror of the same cat | 771 | `[C]` |
| …App Review demo dog Cooper (seeded; stopped 2026-08-11) | 56 | `[C]` |
| …test pet | 30 | `[C]` |
| `diet_trials` | 3 | `[C]` |
| `ai_signals` | 5 | `[C]` |
| **`vet_reports`** | **0 rows** | `[C]` |
| `looks` (the Noticed feature, N-0…N-5 shipped) | **0 rows** | `[C]` |

**Lifetime AI usage, all accounts, all time (`ai_usage`):**

| Surface | Calls | Detail | Grade |
|---|---|---|---|
| `generate_signal` | 446 | across 58 calendar days; 110 founder rows + 2 demo rows ⚠ (the earlier "112 days" was a row count, not a day count) | `[C]` |
| `ask_message` | 48 | **40 by the QA account in a single day (2026-08-02)**, 8 by the founder across 5 days ⚠ (not "one allowlisted user") | `[C]` |
| `extract_food` (photo food extraction) | **8**, last 2026-08-12 | | `[C]` |
| `extract_medication` (drug-label vision) | **0, ever** | | `[C]` |

Three of the four features in the **ratified Premium bundle** are in that table. Their combined lifetime usage is 56 calls, 40 of them from a QA harness. The fourth and fifth (widgets, custom themes) are respectively shipped-in-one-TestFlight-build and not built. ⚠ *Caveat that must travel with this:* the installed TestFlight build is 1.1.0 (35) from 2026-07-25 and the SDK-57 fence makes OTA a no-op against it, so low usage is partly an artefact of nothing new reaching a device. It is evidence of **no demonstrated demand**, not proof of **no demand**.

### Deploy state

- **`generate-report` is live at v14, deployed 2026-07-30 — 42 days stale.** ⚠ `STATUS.md` says "live is v13 (Jul 18)"; the live system says v14 / 2026-07-30. *The routing card that every session is told to read is itself wrong about the single most strategically important deploy in the project.* `[E]` via `list_edge_functions`
- `main` carries at least five merged report changes the live function does not have, including the **diet-trial block** — the wedge's entire narrative. An owner, a vet, an App Review reviewer or a store screenshot generated today all see a report with that section absent. `[C]`
- The hold (CUL-19, riding B-494) gates the prod visibility of CUL-64, CUL-45, CUL-50, CUL-564, CUL-479, and now the Noticed track's N-6 fix (CUL-891) and the store screenshots. ⚠ CUL-19 is a *rider queued behind* the hold, not the hold itself; the earlier "sits in Backlog at No priority" framing conflated the two.
- The per-incident AI chain (`analyze-vomit` → `analyze-stool` → `ask`) owes a redeploy in that order (CUL-557). `[C]`
- `generate-signal` **was** deployed (v33, 2026-08-29) and verified. ⚠ The deploy ledger's `pending` marks "a deploy is owed **or** the live state is unverified" — it does not mean nothing is deployed.

### What a brand-new App Store user would actually get

All rollout flags are `{enabled:false}`. ⚠ There are **seven** allowlist-shaped flags, of which **four** carry exactly one UUID (the founder's): `daily_look`, `event_types_v2`, and two others. `[C]`

A day-one user therefore gets **none of**: Ask, the home-screen widget, the log-picker v2 redesign, cough/sneeze capture, Noticed, vet visits. Roughly the last three months of build output — four entire Linear projects — is dark to the market. `/rundown`, the deterministic pre-visit summary the founder calls "the mini owner-facing vet report," is complete, tested, in the binary, and **reachable from exactly one screen: `app/ask.tsx`, which is flag-gated off.** `[C]`

### Time to first value

- Signal floors (`DEFAULT_CONFIG`): change detector needs 3 episodes in a 7-day window plus ≥3 logging days; chronicity needs 6 episodes across ≥21 days and ≥3 active weeks; timing lanes need 6 meal-eligible episodes; the lowest lane fires at 4 gaps / 5 episodes ⚠ (3 gaps is the *watching* floor, not the firing floor). `[C]`
- Practical time-to-first-Signal: **2–4 weeks for a symptomatic pet, and never for a healthy one.** The landing preview promises "Patterns you can't see." `[C]`
- **Day 1, zero events, Home renders the `stale` state** — the lapsed-user copy — because `hasRecentActivity` is false until an event exists inside 48h, and the designed "building" first-run frame is gated to `building`/`no_pattern`. The single most-designed moment in the app falls through to the re-engagement state. `[C]`
- Onboarding hard-requires two fields (species, name) across **eight screens** ⚠ (disclaimer, type, name, breed, gender, age, paywall, done) and delivers an empty app: empty food library, no trial, no conditions, no notification ask, no first log. **The diet trial — the stated wedge — is never mentioned in onboarding** and lives two taps inside the Pet tab, below the fold. `[C]`
- There is **no reminder mechanism at all.** One notification category exists (`daily_summary`, 21:00 local), it is OFF by default by Trust & Safety ruling, onboarding deliberately never asks for the permission, and G4 contractually forbids it from being a reminder. An owner must log daily for 8–12 weeks with no prompt. `[C]`

---

## 3. The operating record

| Measure | Value | Grade |
|---|---|---|
| Session records in `docs/sessions/` | 367, spanning **2026-07-24 → 2026-09-11** (50 days) ⚠ | `[C]` |
| Rate | ~7.3 sessions/day, ~7.7 merged PRs/day, sustained 50 days | `[C]` |
| Merged PRs total | ~830 (#115 → #828) | `[C]` |
| Non-test app source | 129,698 lines (`app/`, `components/`, `lib/`, `store/`, `supabase/functions/`) | `[C]` |
| Test files / automated tests | 385 files; 8,290 tests (6,753 jest + 1,537 Deno) | `[C]` |
| Build-failing guards | 14, with 10 distinct exemption-marker dialects | `[C]` |
| Numbered code conventions | 35 (C-1…C-35) | `[C]` |
| Supabase migrations | 65 | `[C]` |
| Requirements specs | 51, totalling 280,314 words | `[C]` |
| Total documentation | ~1,335,818 words (docs 600,927 + sessions 635,001 + research 99,890) | `[C]` |
| Design mock HTML files | 52 (2.74 MB) | `[C]` |
| Open Linear issues | 628 (566 Todo + 46 Backlog + 16 In Progress), against 487 migrated in on 2026-08-15 | `[C]` |
| Open `Waiting on PM` | 98 | `[C]` |
| Projects simultaneously In Progress | **8** ⚠ — an eighth, *"The workflow audit — the board, the queue, the ceremony"* (CUL-919…928), opened **2026-09-11**, i.e. today | `[C]` |

⚠ The session directory begins 2026-07-24 because that is when the convention was instituted; it covers 50 days of a project that began around 2026-05. Rates are in-window; the totals above are cumulative over the whole project. Do not present them as "produced in 50 days."

### The launch gap

- The **App Store Launch** project: created 2026-08-20, still In Progress, **25 issues, 0 Done, 6 In Progress**, on 2026-09-11. ⚠ Earlier milestone percentages were not reproducible; the verified fact is 25/0. `[C]`
- The last session record on the submission path is **2026-08-11** (demo-account seed PR 1). Only 11 of 367 records (3.0%) are store/launch/submission-shaped. Zero of the ~180 sessions since 2026-08-12 did submission work. `[C]`
- **CUL-552** — the Apple Guideline 5.1.2(i) explicit-consent gate before sending personal data to a third-party AI, described by the project's own ticket as the highest rejection risk and the only genuinely new code on the critical path — was created 2026-08-20, is Urgent, and is still `Todo` 22 days later. `[C]`
- Six new build tracks opened in the same window: Signals v2 (2026-08-14), App Store Launch (2026-08-20), Design Polish (2026-08-22), Event Taxonomy (2026-08-26), Signal fold (2026-09-03), Home v2 / Noticed (2026-09-05), Vet visits (2026-09-10), workflow audit (2026-09-11). `[C]`
- ⚠ Several of the 25 launch issues are post-launch by design. **"Blocks submission" and "filed under the launch project" are not the same set**, and conflating them builds a fake critical path. Separating them is a required analytic step, not an assumption.

### Velocity trend

Weekly session counts: W30 56 / W31 75 / W32 51 / W33 38 / W34 43 / W35 65 / W36 22 / W37 17. ⚠ A verifier showed that measuring the same directory **by words** inverts the "velocity is decaying" reading — the sessions got longer, not fewer. Do not assert decay from counts alone.

---

## 4. The strategy of record, and where it contradicts itself

**Ratified and internally coherent:** target user = the owner sent home with a diet-trial or symptom-monitoring directive; wedge payoff = a clinical-grade vet report; brand constitution = **Pets > $** (core logging, health alerts, trend visibility and report export always free); model = freemium subscription at **$4.99/mo · $39.99/yr · 7-day trial**, iOS-only IAP (D-M1…D-M8, 2026-07-12).

Six contradictions and absences a panel must confront rather than inherit:

1. **The financial model was scoped 2026-07-12 and never written.** `docs/nyx-financial-model-v1_0.md` does not exist and has no git history. There is no LTV, no CAC, no payback period, no cohort model and no target subscriber count anywhere in the project. The price is ratified; what it has to do is unknown. `[C]`
2. **The design principles contradict the ratified gate.** `docs/nyx-design-principles-v1_0.md:139` still lists multi-pet, extended history, advanced correlation views and customisation as "what may be premium." D-M1/D-M8 made all four free forever on 2026-07-12. CLAUDE.md's Open Questions table still shows the freemium gate as "Open — narrowed 2026-07-06." **The document a session is instructed to read on every UI change is the repudiated one.** `[C]`
3. **⚠ Pricing is softer than it is treated.** The monetization doc calls $4.99/$39.99 a "Pricing placeholder", "Placeholder to validate", "Locked as the spec's **working** numbers", with final price set at StoreKit-config time. It is a working anchor, not a closed decision. Treating it as immovable is a misreading of the project's own record.
4. **Track 3 has zero infrastructure.** No `entitlements` table in production, no RevenueCat in `package.json`, paywall a non-functional mock with `app_config.paywall_enabled = false`. The company has no mechanism to collect a dollar. `[C]`
5. **The strategy's own prerequisite was inverted.** The ratified record says instrumentation must exist *before* Premium ships or the price revisit has no data. Observability (CUL-113) sits in milestone M6, i.e. after submission. The first real cohort — the only people who can answer any open question — will be spent unmeasured. `[C]`
6. **The distribution plan has no built surface.** The documented model is owner-first, then passive vet distribution. The public share link (vet-report PR 6) is deliberately unshipped, nothing mints a share token, `vet_reports` has zero rows, and the only handoff is an on-device `expo-print` PDF through the iOS share sheet. **The vet never touches a Culprit surface.** `[C]`

### The load-bearing assumptions with zero external evidence

- That a real diet-trial owner will log for 8–12 weeks. *(n=0)*
- That a real veterinarian will read the report, trust it, and want another. *(n=0 — validation to date is an in-context `Dr. Chen` persona and a `vet-report-cold-read` Claude subagent grading its own team's artifact.)*
- That a vet will hand a QR code to a client. *(n=0, and never asked in any form.)*
- That the 10-second logging claim survives a stranger. *(Never timed on anyone but the author.)*
- That the market-sizing holds. The 43–65M annual "tracking directive" visit-instances figure is a triangulation the research doc itself labels *"not investor-grade,"* with a named fix (survey 15–20 GPs) untouched in four months.
- **CUL-598 — "email the vet report to your own GP + book Nyx's appointment" — has been open since 2026-07-02**, costs one email, and is still `Todo` / High / `Waiting on PM` on 2026-09-11.

---

## 5. Competitive delta since the 2026-07-25 teardown

The July pass (`docs/culprit-competitive-landscape-2026-07.md`) is otherwise still the best reference. What is new:

**① The "unoccupied wedge" claim can no longer be said without qualification.** **Tend & Mend: Cat** (App Store id 6760874055, seller Ben McNair-Kim, released **2026-04-10**, v2.1 on 2026-08-11, **free**) markets all four cells: fast meal/symptom logging, food-to-symptom pattern detection, and a vet-shareable report. It has **sibling apps for dogs and for human IBD**. It has **zero ratings.** `[E]`
⚠ The lane's claim that it runs "a Bayesian engine with clinically validated scoring" was **mis-sourced** by the verifier. The defensible form: *at least one shipped app now markets all four cells; its method is undisclosed and unverifiable; it has no traction.*
⚠ The lane's explanation for why July missed it — "our keyword sweep searched clinical language, it markets in owner language" — was **also refuted**: Tend & Mend returns at **rank #1** for "cat vomiting tracker" in Apple's Search API. The method flaw is real but is not the one named, and identifying it correctly matters because the same sweep produced the ASO recommendation.

**② Everkin shipped Culprit's in-flight "Noticed" daily-look seven days before Culprit did.** v1.10.0, 2026-09-04: *"Daily Observation Trends — your daily check-ins now add up to a bigger picture."* Everkin charges **$6.99/mo or $49.99/yr** and **paywalls both the vet-ready PDF export and household sharing**, free tier capped at 2 pets. `[E]`

**③ ThePawcess (web, $39 one-time) is live with an elimination-diet protocol deeper than Culprit's shipped B-417 track** — AI slip triage weighting accidental consumption against the dog's weight, a scannable fridge-card "Household Guard" QR for contamination control, and reintroduction sequencing Culprit has not specced. `[E]`

**④ Every incumbent trip-wire the July pass set has been inert for eleven weeks.** Zoetis's Cytopoint Allergic Itch Tracker — July's self-declared "highest-consequence unresolved unknown" — is still a downloadable PDF. Digitail: *"we are regularly bringing improvements"* (4.7 years after announcing chronic-disease trackers). Fi: *"bug fixes."* Dutch, Maven, PerkyPet: nothing. **PerkyPet AI still has not shipped** and both store links on its own homepage 404, while it runs a live paid-subscription funnel and outranks real products on review keywords. `[E]`
⚠ Headline discipline: July had already resolved four of the seven; only #6 and #7 were genuinely open. The honest form is *"the two open trip-wires resolve as non-events."*

**⑤ PETKIT announced Kitbo, an AI health assistant generating reports over its device ecosystem (2026-08-18 Shanghai).** ⚠ **Not shipped** — the source says "coming to the PETKIT app" and "once live." Treat as announced, not as a live competitor. `[E]`

**⑥ CompanAIn's position inverted.** It launched a Wellness Marketplace selling products "based on AI-driven health insights," debut brand Leap Years. July's finding ⑦ ("CompanAIn is buying the reader of the artifact") should be downgraded: selling supplements off your own health reads is the conflict Culprit's independence is a defence against, and *Culprit* is the product's literal name for that stance. `[E]`

**⑦ The frontier-model threat did not advance into pet health.** ChatGPT Health remains human-only; its only material expansion since 2026-07-23 was an Epic EHR integration for clinicians (2026-09-01). The substitute is still the generic "ChatGPT + camera roll" workflow. `[E]`

**⑧ Consumer pet-tech funding is down and rotating to vet-facing SaaS.** ⚠ The lane's "no pet-health round since May 2026" was refuted by the project's own July document (Wonderdog, $5M pre-seed, 2026-07-08). Direction is right; the specific claim was wrong.

---

## 6. Base rates and market reality

Every number here is a reference class, not a forecast. Verified figures only; the ones a verifier broke are in §8.

- **Apps launched in 2025+ account for 3% of all subscription revenue.** Median monthly revenue one year post-launch ≈ **$72**. **17.3%** of new subscription apps reach $1,000/mo within two years; **4.6%** reach $10,000/mo. `[E]` (RevenueCat State of Subscription Apps)
- **Freemium converts at a 2.1% median download-to-paid at D35; a hard paywall converts at 10.7%.** Health & Fitness freemium median is 2.9%. **Pets > $ is a deliberate ~5× monetization tax**, and that is a defensible choice, but it has never been costed. `[E]`
- Health & Fitness has the **highest trial-to-paid conversion of any category** (~35–37.7% vs a ~25.6% global median). ⚠ The claim that it is best-in-class on *download-to-paid* was not verifiable — do not use it.
- **Trial length:** 17–32-day trials convert at a 42.5% median vs 25.5% for ≤4 days; 7-day trials see 39.8% day-0 cancellation vs 31.1% for 30-day. A product whose payoff is an 8–12 week diet trial asks for the purchase decision on **day 7**. Cheap, reversible, pre-launch. `[E]`
- **Arithmetic on the ratified price:** $4.99/mo + $39.99/yr at a 68% annual mix blends to ~$3.86/payer/month. $10k/mo gross therefore needs **~2,600 concurrent payers**, which at the H&F 2.9% median needs **~90,000 downloads before churn**. ⚠ Net of Apple's 15% Small Business rate the payer count is higher still.
- **Retention:** median panel-measured digital-health retention is ~3.9% at 15 days and ~3.3% at 30 days; Health & Fitness runs ~20% D1, 7–8.5% D7, 3.5–4% D30. ⚠ These specific figures trace to Snoopr's 2026 benchmarks, not Business of Apps — cite correctly. The wedge's claim is that a vet directive breaks this benchmark. **That is a hypothesis with a plausible mechanism (Supportive Accountability) and no measurement, in this category or any other.**
- **Nobody has ever published how many elimination-diet trials are prescribed annually in the US.** Available anchors disagree by ~6×: Banfield's 2018 State of Pet Health puts food allergy at 0.2% of dogs (≈175K/yr); a derm-pool derivation gives ≈1M. ⚠ The 4.7% figure is from a **dermatology-referral denominator** (dogs presented for skin problems), not the general population — using it against all US dogs inflates the wedge by an order of magnitude.
- **Vet-channel distribution demonstrably works — with the clinic as the paying customer.** PetDesk: 12,000+ clinics, 18.5M+ pets/yr. Digitail reports 62% pet-parent adoption ⚠ *at one clinic, in a vendor-published customer-success story.* Every verified case is clinic-bought, clinic-branded, and front-desk-trained. None is consumer-side. `[E]`
- Enterprise veterinary sales cycles run **weeks for solo practices, one to two quarters for group and specialty, three to seven quarters for corporate** ⚠ (the earlier "9–22 months / 12–17% win rate" citation was fabricated at source). Roughly half of US clinics are corporate-owned ⚠ (sourced to an M&A brokerage with a disclosed interest; treat as directional).
- **Clinicians structurally under-consume patient-generated data** — accuracy and liability concerns, information overload, no reimbursement, no workflow integration. The two documented cases where they genuinely did adopt it (the Ambulatory Glucose Profile; the Basch PRO trials) won on **a field-wide standardized format plus institutional endorsement plus delivery into the clinical workflow with an action attached** — none of which a single app can grant itself. ⚠ Several supporting statistics in this lane were fabricated or mis-cited; see §8.
- **The closest indie analog is Bearable:** UK founder with chronic migraine, built for his own condition, launched March 2020, two people, $6.99/mo or $34.99/yr, doctor-shareable reports, reaching roughly **$30k/month after ~4.5 years**, grown through **chronic-illness communities**. Its doctor report is a trust signal, not its growth engine. `[E]`
- **What actually produced revenue for new consumer health apps in 2024–2026 was distribution machinery, not product depth.** Cal AI: two teenagers, 15M+ downloads and $30M+ ARR in under two years on a hand-built network of 250+ creators making native short-form content. Culprit has no creator network, no founder audience and no community presence. `[E]`
- **Fuzzy Pet Health raised $80.5M for a $15/mo consumer pet-health subscription and shut down abruptly in June 2023.** `[E]`
- **Apple Guideline 4.3(b), rewritten 2026-06-09:** *"Don't submit apps that are indistinguishable from what's already widely available… We may remove these apps from the App Store going forward if they are not updated, improved, or do not attract customers."* Pet-care logging is a lookalike category above the fold, and "does not attract customers" is now literally a removal criterion. `[E]`
- **Culprit has zero go-to-market artifacts.** 93 docs, ~830 PRs, 367 session records: no file matching `gtm|distribution|launch-plan|growth|acquisition|marketing|channel`. ⚠ `docs/culprit-website-requirements.md` and `docs/store-listing-copy.md` do contain adjacent material, so "zero documents" is a filename claim, not a content claim. The defensible form: **there is no plan for how a human who is not the founder finds this app.**

---

## 7. Risk, cost, legal, operations

- **Zero production observability, deliberately scheduled after launch.** No crash reporter, no analytics, no error monitor, no alerting, **and no React `ErrorBoundary` anywhere in the app** — an unhandled render error is an unreported crash. On day 3, a crash affecting 5% of users is undetectable, unmeasurable and uncommunicable. `[C]`
- **No server-initiated channel to users at all.** No push provider, no token registration; `plugins/withoutPushEntitlement.js` actively strips the entitlement. No re-engagement lever, and no way to reach an owner with a safety finding computed server-side. `[C]`
- **One environment.** All three EAS profiles point at the same Supabase project. No staging, no local stack; migrations applied live. Free today at zero users; expensive the day real health records land. `[C]`
- **Cost caps fail open at five call sites** ⚠ (not four): a `record_ai_usage` RPC error logs "proceeding under cap" and proceeds to the Anthropic call — under exactly the database-pressure conditions that arrive with scale. `ASK_CAPS.conversationMonthly` is `null`. Free Sonnet 4.6 vision is available to anyone with an email address: no captcha, no device attestation, no per-IP limit, no payment instrument. The only thing between the company and an abuse bill is that `ask` ships dark — one config flip, not a deploy. `[C]`
- **Free-tier COGS is real.** Roughly $0.50–0.90/month for an engaged wedge user, dominated by `generate-signal`. ⚠ The lane's "50k users ≈ $10–20k/month" does not reconcile with its own per-user figure (50,000 × $0.50–0.90 = $25–45k). Either number needs re-deriving before use; the point stands that **Pets > $ means the free tier is not zero-marginal-cost**, and no break-even free-user ceiling has been chosen.
- **Legal posture: an individual with no entity and three unsigned drafts, none hosted.** `docs/legal/privacy-policy.md` and `terms-of-service.md` still contain live `[YOUR FULL LEGAL NAME]` and `[OPERATOR MAILING ADDRESS]` placeholders. ⚠ A synthetic "legal-consultant panel" pass on 2026-07-16 made substantive edits; no licensed attorney has reviewed anything. There is no corporate veil between a `worth_a_call` escalation an owner acts or fails to act on and the founder's personal assets. An individual Apple developer account publishes the founder's legal name on every shipped version, permanently.
- **Nobody has checked state veterinary practice acts.** The whole compliance conversation is about Apple 5.1.2(i). The line between a "clinical-grade summary plus a recommendation" and unauthorized-practice statutes — which exist in every US state — has never been examined.
- **CUL-583 (Urgent, open since 2026-08-22)** records that ten issues converge on one unbooked clinical sitting, that **both of CUL-54's refusal-floor thresholds over-fire today** ⚠ (two named thresholds, not "several floors"), and that a cat picking at every bowl for three weeks and a cat in a three-day hunger strike currently get the same sentence.
- **The architecture is genuinely good and is not what breaks first.** Local-first SQLite with watermark-incremental pull, push-before-pull last-write-wins with the failure mode named in code, 25 tables with 25 RLS enables (1:1), 41 indexes. Uneventful at 10k users. The named pressure points at 100k are instance sizing (one Postgres, no read replica) and `generate-report` doing a full-record read plus HTML render inside an Edge Function budget ⚠ (13,962 non-test lines, not 26,828 — that figure included tests).
- **Bus factor 1, with a governance system that is an asset for AI contributors and a barrier to human ones.** 35 numbered conventions, 14 build-failing guards, 10 exemption-marker dialects, rationale in a separate 1.35M-word corpus. It is genuinely why ~7 PRs/day is sustainable without collapse. It is also a codebase where a hired engineer's first PR fails the build on shapes no other codebase treats as errors.
- **The engine is not purely escalate-only.** ⚠ `detection.ts` has a reflection detector that emits `direction: 'improving'` (its own test: *"a falling count reads as improving"*). The n=1 invariant governs per-incident AI reads; it does not describe the whole engine. Any positioning built on "we never reassure" must be stated at the right scope.

---

## 8. Corrections register — what this research pass got wrong about itself

This is the most important section. Eight lanes produced roughly fifty findings; the verifiers broke or softened a substantial fraction. The pattern is the same one CUL-671 found in the project's own frozen briefs.

**Outright fabrication (1 lane, `analogs-and-outcomes`, verdict `SHAKY` — do not cite it unverified):**
- A "13% exact adherence to a prescribed home-cooked recipe" statistic attributed to PMC8909024. **The cited paper is about dietary information obtained during consultations and contains no such figure.**
- **PRO-TECT, presented as the flagship proof that clinician-consumed patient data works, found no survival difference** (HR 0.99, 95% CI 0.83–1.17, P=0.86, n=1,191, Nat Med 2025). It was cited as confirmation of the opposite.
- "59.9% name lack of knowledge of effective apps as the barrier" attributed to a systematic review that contains no such number.
- "37% of physicians have ever prescribed a health app" sourced to an **IQVIA report from 2015**, presented undated inside a 2026 base-rate argument.
- The Arc post-mortem quote dated Oct 2024; it is from the May 2025 "Letter to Arc members."
- AGP described as "explicitly credited with removing clinician reluctance"; the literature partly says the reverse.

**Mis-attribution in a headline (`competitive-delta`):** the Tend & Mend "Bayesian engine / clinically validated scoring" quotes were not from where the lane said they were. The app's existence, date, price and zero ratings are solid; its method is undisclosed.

**Stale-document laundering (3 lanes):** `generate-report` v13 / 2026-07-18 was copied from `STATUS.md` and restated as a live measurement. The live system says v14 / 2026-07-30. **A lane instructed to verify at use instead trusted the routing card.**

**Instrument-switching:** "PM queue up 118%" compared `STATUS.md`'s old checklist against Linear's `Waiting on PM` label, two different instruments.

**Count-versus-rate errors:** "112 days" of signal usage was a row count. "Two users signed in within 30 days" is a re-authentication count, not an engagement metric — `last_sign_in_at` never updates on refresh-token rotation.

**Denominator errors:** the 4.7% allergic-dermatitis figure has a dermatology-referral denominator; Digitail's 62% is one clinic in a vendor case study; the 67% onboarding drop-off circulating in earlier analysis derives from **nine accounts, several of them test accounts** — that is a count, not a rate, and it should not be spoken as a measurement.

**Source-quality failures:** a claimed "9–22 month sales cycle / 12–17% win rate" traced to a page that says something different; "~50% of US clinics corporate-owned" traces to an M&A brokerage with a disclosed interest in the claim.

> **The operative rule for anyone using this pack: verify at use, not at citation.** Three of six competitor products had moved within six days of the July sweep being committed. A number that is correct in this document on 2026-09-11 is a hypothesis on 2026-10-11.

---

## 9. Still unverified, and cheap to settle

Ranked by (information value ÷ cost). Every item here is settleable by one person in under a day.

1. **Send the vet report to one real veterinarian** (CUL-598, open 71 days, cost: one email). The single highest-information act available. Note the report he would send is 42 days stale with the trial block absent — decide whether that gates the send or not, but decide.
2. **Ask whether vets *want* this.** The modal outcome is not "good report" or "bad report" — it is **indifference**: a GP with an 11-minute appointment for whom an unsolicited owner-generated PDF is cost and possibly chart-review liability. The instrument must make indifference a recordable answer.
3. **Resolve the account question definitively.** Two lanes disagreed about whether any genuinely third-party account exists. One query joining `auth.users.email` to `pets` and `events` settles it. **If a stranger exists, contacting them is the second-highest-value act available.** Two accounts signed up and never signed in — that is a 100% failure of the only organic acquisition that has ever happened, and two phone calls.
4. **Interview the second household user.** A non-technical person has used this product daily for months and has never been interviewed on the record.
5. **Run the detectors against synthetic null records.** CUL-914 measured the daily-look pairing printing on **22–77% of pure-noise records**. Generate synthetic nulls across realistic densities and species, run the full detector suite, publish a per-detector false-positive rate. No users needed, one weekend of compute. If "we find the culprit" prints findings on noise, the clinical architecture is decoration.
6. **Replay the detectors against a synthetic *sparse trial* record.** Every floor was tuned on a high-density chronic record (6 episodes / 21-day span / 3 active weeks). An 8-week diet trial with two symptom events clears none of them. **If the wedge user structurally never sees a Signal, the product cannot serve its own wedge.**
7. **Time the 10-second test on a stranger.** It is CLAUDE.md's Step 4 acceptance criterion and the product's founding usability claim. Fifteen minutes.
8. **Install the top five competitors and use each for a week** against the real cat's record. The corpus's only competitive work is desk research whose method has now been shown to have a systematic blind spot.
9. **Check whether Tend & Mend's zero ratings measure usage or measure prompting.** Every framing of the competitive picture leans on that zero. It may be measuring whether the app asks.
10. **Check the species and indication question.** All real data is one cat with chronic vomiting; the per-incident AI chain is `analyze-vomit` / `analyze-stool`. Elimination diets run at far higher volume for **itchy dogs**, where the outcome measure is a pruritus score over weeks, not a photographed incident. The founder's own animal may have biased the product toward the smaller half of its own wedge.
