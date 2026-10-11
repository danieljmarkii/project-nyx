# Culprit · Competitive Landscape & Feature Head-to-Head (October 2026)
**Date:** 2026-10-10 (verification completed 2026-10-11) · **Issue:** CUL-1762 · **Method:** 25 agents (4 code audits of our own product, 8 market segment sweeps, one adversarial verifier per report, one completeness critic), then a main-session re-check of every load-bearing claim and an `adversarial-reviewer` pass over the head-to-head · **Scope:** US market

> **Status.** 🧊 Frozen, dated artifact. Supersedes `docs/culprit-competitive-landscape-2026-07.md` as the current read. The July, June and v1.0 landscape files are not edited; §14 proposes the corrections they need, for PM ratification.
>
> **Evidence convention.** `[E]` verified against a source fetched in this pass (store record, first-party page, paper) · `[A]` reasoned assumption · `[C]` verified in **our own code or live system** (file:line, query or deployed version). Marketed and shipped are separated throughout. A rival counts as **shipping** only with a live store listing or a first-party source dated on or after 2026-07-12.
>
> **Read this first.** Our own evidence rule disqualifies us. Every rival in the matrices below has a live store listing; Culprit has none (§4.1). Read every "where we win" row as "where the product we have built would win, once it ships".

---

## 1. Executive summary: what would change a roadmap decision

**① The most important competitive fact is about distribution, and it is ours.** Culprit is not on the App Store and has never been submitted. The newest distributed binary is an internal TestFlight build cut on 2026-08-29; about **420 commits** have merged since. Live usage is **one human household** (the PM's, 2 pets, about 1.4k events) plus an App Review demo seed and a synthetic test mirror; one account logged anything in the last 30 days `[C]`. Since July, the trial lifecycle, vet visits, Noticed, History v2 and Design v2 all went "GA" on `main` and reached nobody. Meanwhile, in eleven weeks, small rivals planted flags on the wedge (②). **No feature on the roadmap moves our competitive position as much as cutting 1.2.0 (CUL-559) and getting a listing live.**

**② The wedge's object layer is no longer empty, though the whole loop still is.** July: "no competitor ships a diet-trial object; zero listings contain the strings." October:
- **PawTrial** (iOS, released 2026-08-03, 0 ratings, dog only) names the job outright: a vet-prescribed hydrolyzed or novel-protein trial with a countdown, a first-week symptom baseline, compliance and exposure logging; a reintroduction workflow and the vet PDF sit in Pro. It "does not … identify allergens" `[E]`.
- **ThePawcess** (web only, $39 per trial plus an optional $4.99/mo Food Passport) demos the whole lifecycle: three phases, slip triage, a household fridge card, reintroduction and an **AI-generated** vet report `[E]`.
- **Tend & Mend** and **PawSolids** ship bounded 4-week and 3-week programs ending in a vet summary `[E]`.

**Nobody combines a trial object, protein-level food identity, a computed food↔symptom association with a stated statistical design, and a free clinical report.** But each pair of those is now held by someone, and every holder has 0 to 6 ratings. The wedge is fragmenting before we arrive.

**③ "We find the food" is now the most crowded claim on the shelf, and our own harness says it is our weakest layer.**
- At least six small pet apps describe food↔symptom association in their listings: Tend & Mend (protein-level in Premium), PawSolids ("6.2x"), iKnowMyCat, Everkin (copy only), Paws and Patterns, Amaeru `[E]`. None names a significance test or a multiple-comparison correction.
- A free **human** app, Digestly (2026-10-02), states an exact test, a correction for everything tried, a day-rotation permutation check, and publishes its simulated false-positive rates (3% / 1%) `[E]`.
- **Our side** `[C]`:
  - The engine is still a case-crossover with exact McNemar. But only the Established tier is significance-gated; every food card an owner sees today is the Early tier (≥3 matched episodes, ≥2 discordant pairs, b > c, risk difference ≥ 0.2, **no test**).
  - Our own synthetic scorecard (3 seeds per scenario; a drift report, not a rate) shows a card its answer key calls false on about 76% of healthy synthetic pets within 180 days, and no chicken-only card within 56 days on the hidden-chicken scenario. On that scenario, cards naming a non-culprit protein fill about two in three food-card evenings.
  - EN-11, the "insight honesty" lane that retires Early food cards, is dark.
- **The product name promises exactly the thing we have measured as weakest.** That makes the positioning lead a real PM call (§12, D1).

**④ What does hold up as differentiation is honesty and safety architecture, not "AI" and not the correlation.** Ranked by defensibility (§7):
1. A record that knows which days are missing: coverage kept separate from adherence, witnessed vs found timestamps, and never "no off-diet foods logged".
2. A free vet report with no generated prose that prints only corrected food findings.
3. Single-photo reads that cannot return an all-clear, beside a shelf where "when you can relax", "Low Concern" and "Looks Great!" are standard copy.
4. A single refusal of a normally eaten food routed to a safety card (cats on one low day), where the nearest rival waits five of seven days and says "consider mentioning at next visit".
5. Independence, now with a legal reason: FDA's 2025 warning letter treats a drug maker's itch tracker as promotional labeling.

**⑤ App Store search will not be the acquisition channel for the wedge.**
- Apple's autocomplete returns **nothing** for "elimination diet dog", "food trial dog", "novel protein", "hydrolyzed", "cat vomiting" or "dog itch". It does return suggestions for "pet health tracker", "dog poop tracker" and "pet medication tracker" `[E]`.
- On the web, owners say **"food trial"** (about 12–14× "elimination diet" in the 2025–26 window), and the autocompletes are shaped like vet handouts: "food trial dog client handout", "food trial dog vca", "diet trial veterinary partner" `[E]`.
- "cat vomiting tracker", which July listed as ownable, now returns Tend & Mend's "Cat Food & Vomit Tracker" at #4 `[E]`.
- **The distribution channel the data points at is the vet handout and the web, not the store** (§10, §11).

**⑥ The frontier-LLM substitute did not gain much; the OS gained retrieval.**
- No assistant added a pet or veterinary health scope.
- iOS 27 Siri AI (beta) and Gemini Personal Intelligence (free tier, US) can now find "every photo of the vomit this week".
- ChatGPT Pulse was retired into scheduled tasks; whether the free tier gets scheduled tasks is unconfirmed `[E]`.
- **Re-estimate:** a general assistant plus camera roll gives an engaged owner about **55–60%** of our value over a 1–3 week acute episode, an upper bound, and about **a quarter** over an 8-week trial. July said 60–70% and 20–30% (§9, R4).
- The new published evidence cuts against "AI errs safe": all four chatbots under-scored cat pain from face photos on average (Sci Rep, 2025-12-09; Claude's bias was within an acceptable margin), and five LLMs systematically under-triaged feline fractures from text case summaries (JAVMA, 2026-08-14) `[E]`.

**⑦ The July watch-list mostly went quiet; the real movers are elsewhere.**
- **Quiet:**
  - CompanAIn: 25 ratings. Its "vet portal" is an owner's email invite, and the login portal is still "coming soon".
  - Zoetis: no digital itch tracker.
  - IDEXX: Investor Day described a visit-centric, commerce-led pet-parent layer.
  - Digitail: chronic trackers still absent after ~4¾ years.
  - Fi, Dutch and PerkyPet: no change; PerkyPet is still unlaunched.
  - PETKIT: vomit detection not verifiable as shipped.
  - Tractive: no observed price rise.
- **Wonderdog fired:** live 2026-08-27, Claude-powered chat over clinic records, diet capture since 2026-09-19.
- **New movers:**
  - Clinic AI summarizers now read whatever PDF staff attach: Provet (free, uncapped since 2026-08-06), Instinct, Vetspire, CoVet (bought by IDEXX 2026-09-16).
  - Furbo and Petcube already ship passive vomit alerts behind subscriptions.
  - Read-only vet links are routine in small apps, usually paid `[E]`.

> **One-sentence answer:** *The full Culprit loop is still unbuilt by anyone, but in eleven weeks the trial object, protein-level association copy and bounded programs each found a zero-rating owner, while we sat on 420 unshipped commits; our real edge is honesty and safety architecture, our weakest measured layer is the one our name promises, and the store will not bring us the wedge user, the vet will.*

---

## 2. Trip-wires from July, resolved

| # | July trip-wire | Status | Detail (as of 2026-10-10) |
|---|---|---|---|
| 1 | **CompanAIn**: vet-portal traction, a new raise | 🟢 **DID NOT FIRE** | iOS v1.0.8 (2026-10-06), **25 ratings** (+9 in 11 weeks); Play 100+. The "Vet Portal" shipped in v1.0.4 (2026-05-28) as an owner-invites-vet-by-email share; the homepage still says the login and upload portal is "coming soon". No enrolled clinic found. No raise after the $1.0M pre-seed (June 2026) `[E]`. **Correction to July ⑦:** "buying the reader" is not evidenced. |
| 2 | **Zoetis digitizes the Cytopoint itch tracker** | 🟢 **DID NOT FIRE** | The Pack v0.70.7 (2026-10-07): 14 releases since July, all "Minor fixes and enhancements", no itch or AI language. The only downloadable US Zoetis tracker is the 2026 Apoquel tracker, a **fillable PDF** (92 form fields) that names The Pack for reminders only. The Cytopoint PDF link returns AccessDenied. **New:** Merck's Numelvi has a downloadable itch tracker too `[E]`. Now a *watch*, not an unknown: moving the 0–100 grid into The Pack is a small step. |
| 3 | **IDEXX Investor Day (2026-08-13)** | 🟢 **DID NOT FIRE** on owner logging | Deck: the pet-parent layer is Digital Intake · Reminders · In-Visit Updates · Personalized Offers · Visit Summaries · Home-Care Plan, plus "Coupons + Marketplace". Vello installed base +37% YTD. The pre-visit bloodwork prompt is credited with about +300 bps over ezyVet alone. IDEXX acquired **CoVet** (ambient scribe) on 2026-09-16 `[E]`. Watch "Home-Care Plan" and "Digital Intake". |
| 4 | **PETKIT vomit detection actually shipped** | 🟢 **NOT VERIFIABLE AS SHIPPED** | Promised 2026-07-02 for two camera feeders and a fountain (not the litter boxes). "Vomit" appears in no listing, release note or device page; PETKIT's own 2026-08-19 post still says "rolling out over the months ahead" `[E]`. **Correction to July:** passive vomit detection already ships at **Furbo** (Vomit Alert, Furbo Nanny from $9.99/mo) and **Petcube** (Care subscribers) `[E]`. |
| 5 | **Petalife** | 🟡 **PARTIAL** (smaller and drifting) | iOS v2.3.5 (2026-10-09), 2 ratings; Play 500+. Hong Kong startup in the Unleashed by Purina accelerator, **not Purina-owned**, but it runs a "Purina Gut Health Program" in the app and pays out Pro Plan food rewards. Latest releases are brand campaigns. AI chat dates from 2025 `[E]`. |
| 6 | **PerkyPet AI launches** | 🟢 **DID NOT FIRE** | No listing found by any search; it is recruiting a "Cohort 200" beta and missed its "Summer 2026" launch `[E]`. |
| 7 | **Tractive under Bending Spoons: pricing** | 🟡 **PARTIAL** | Current US plans: Basic from $9/mo and Premium from $10/mo on 1-year plans, down to $5/mo on 5-year; no monthly billing in the US. 0 of 500 recent reviews mention a price rise `[E]`. No first-party pre-close comparator (archives blocked). Bending Spoons' pattern elsewhere is steep rises (Harvest, Evernote) `[E]`. |
| 8 | **Fi deepens health** | 🟢 **DID NOT FIRE** | Since July: Fi Levels (gamification, 2026-08-06) and adopter flows only. Fi Intelligence is still dog-only, US-only Q&A over collar data and uploaded documents `[E]`. |
| 9 | **Digitail chronic trackers** | 🟢 **DID NOT FIRE** (with a correction) | Still absent. July missed one thing: an **AI pre-visit intake** chat, clinic-enabled, help doc dated 2025-08-26. The owner diary is still free text `[E]`. |
| 10 | **Dutch** | 🟢 **DID NOT FIRE** | $11/mo billed $132/yr; no AI, vision or owner logging; 732 ratings (fastest-growing telehealth listing checked). It sells 15+ hydrolyzed Rx diet SKUs `[E]`. |
| 11 | **Wonderdog** | 🔴 **FIRED (shipped)** | iOS released 2026-08-27, v1.0.22, 22 ratings, $9.99/mo or $69.99/yr. "Spark" chat, "powered by Claude", answers over synced clinic records; diet capture added in v1.0.12 (2026-09-19). $5M pre-seed dated 2026-07-11 `[E]`. A threat to "the app that knows your pet", not to the trial engine. |

---

## 3. What changed since July: genuinely new information

- **Wedge entrants:**
  - **PawTrial** (iOS, 2026-08-03): the first store listing with a dog elimination-trial object `[E]`.
  - **ThePawcess** now meets the shipping rule as a web product: a working login, Stripe pricing, blog posts through 2026-09-11. Capability is verified only to its own demo pages, and no third-party evidence of use was found `[E]`.
  - **LittlePetApp** (iOS 2026-08-08): "Made for elimination diets", but no trial object `[E]`.
  - **ItchyPet** is on Google Play as Carnivore Lifestyles (2026-08-06): ingredient-level logging, an undisclosed "Pattern Modeling" from day 45, $99/yr `[E]`.
  - **MyDog** (iOS 2026-09-07, 28 ratings) ranks #2 for "food trial dog" and #3 for "dog food sensitivity" `[E]`.
- **Decline routing is shared now.**
  - Petlog (Verto Studios, 2026-08-06) shows "Appetite below normal 5 of last 7 days. Consider mentioning at next visit."
  - PetLog (LogFor.Life) added "Reluctant" and "Barely ate" on 2026-08-10.
  - Every Wag, Cat360 and Sereno treat appetite change as a health concern.
  - None states a single-refusal or short-window rule `[E]`.
- **Questions from the record:** iKnowMyCat v3.0 (2026-10-01) generates "appointment-ready questions drawn directly from your cat's logs" `[E]`.
- **Vet-side readers exist, in small or narrow forms:**
  - WagWatch: a read-only link, Premium.
  - Cat360: a 7-day passcode link, Pro.
  - HotSpotter (Play): vet access codes plus two-way messaging.
  - VetBasic: vet comments.
  - Zoetis AlphaTrak: a vet web app plus a PIMS link over owner-logged diabetes data.
  - LinkVet: clinic-branded owner apps with "AI Insights" and meal logging, distributed exclusively through MWI, Covetrus's merger partner.

  All `[E]`.
- **Clinic-side AI reads attached PDFs:**
  - Provet: the Clinical Agent includes attached PDFs, caps removed for free tier, 2026-08-06.
  - Instinct: Document Summary links each finding to its source page.
  - Covetrus "Extract".
  - Vetspire: "PDF Summaries".
  - CoVet: converts PDFs and photos.

  **A Culprit PDF handed to a clinic will increasingly be read by a clinic LLM first** `[E]`.
- **Sponsor apps added AI chat, not correlation.**
  - myPurina's "Allie" (2026-03-11) guides on "Purina products".
  - Ollie's subscribers get stool and skin photo check-ins reviewed by its vets within 24 hours, marketed with "Looks Great!" and "avoid unnecessary (and expensive!) trips to the vet" `[E]`.
- **No therapeutic-diet maker ships an owner trial tool:** Hill's, Royal Canin, Purina PPVD, Blue Buffalo, Farmina, Dechra, Virbac `[E]`, confirmed by a second search in this session.
- **Hardware:**
  - Petivity Smart Feeder (Purina, $149.99, 2026-09) and Petlibro Granary 2 / 2 Vision / 2 X (2026-08) add per-pet recognition. **Every intake device still measures grams; none identifies the food** `[E]`, confirmed by a second search.
  - Tractive markets scratch monitoring for "patterns that might indicate food allergies", the nearest hardware association copy `[E]`.
- **The entrant flood continued.** Of 1,062 listings with a pet word and a health word in the app name, 598 were first released in 2026 and 142 after 2026-07-25. Only 49 have ≥100 ratings, and none of the post-July entrants exceeds 22 `[E]`.
- **Funding went clinic-side.** The only owner-facing raise found since July is Wonderdog. IDEXX→CoVet, Zoetis→VitalRADS and GoodVets→WellHaven are clinic or brand deals. TELUS Health MyPet is winding down (access ends 2026-12-08) `[E]`. Completeness is not guaranteed (§16).
- **Owner behaviour:**
  - 43% of US owners have used tools like ChatGPT for pet health or nutrition (Talker Research for Darwin's, n=2,000, published 2026-08-31).
  - Lovet's 2026 Checkup (Censuswide, n=2,000, coverage dated 2026-07-21) still gives 34% "first instinct online or AI" and 25% "delayed care after relying on online/AI information, then regretted it" `[E]`.
- **The name:** the App Store already has **"Culprit: Pattern Finder"**, a human 14-day elimination plus reintroduction app (released 2026-04-27; July missed it), "Culprit: Skincare Diary", an underwear shop called CULPRIT, and three Culprit-named games `[E]`.

---

## 4. Ground truth: what Culprit actually ships

Re-derived from source and the live system. Every doc was treated as a lead, not evidence. The four audits drew **0 refutations** from their verifiers, but several narrowings, which are folded in below.

### 4.1 Distribution and usage

| Fact | Evidence |
|---|---|
| **Not on the App Store; never submitted.** iTunes lookup for `com.projectnyx.app` returns 0 in the US, GB, CA and AU; no Play listing; the website says "Coming soon to the App Store". | `[C]` lookup 2026-10-11; CUL-559 / CUL-560 Todo |
| **Distributed binaries are internal TestFlight builds:** 1.1.0 (35) of 2026-07-25, and a **1.2.0 cut of 2026-08-29** carrying at least #730 (likely #731–#733). Its build number was never recorded. `docs/dev-handoff-runbook.md:24` still says 1.1.0 (35) and is stale. | `[C]` session records 2026-08-29 / 08-30 / 10-02; `app.json:5` |
| **About 420 commits** on `main` since that cut. No OTA to it is recorded; EAS history was unreadable from here. | `[C]` GitHub compare; `[A]` on OTA |
| **Usage:** 9 auth users; one human household (2 pets, ~1.4k events), the App Review demo seed (1 pet, 56 back-dated events), and a synthetic-UUID QA mirror (910 events). One owner logged in the last 30 days; no new account since 2026-08-11. | `[C]` aggregate SELECTs, 2026-10-11 |
| **Server is current:** Edge Functions deploy on merge. Live: `generate-signal` v78, `generate-report` v55, `analyze-vomit` v33, `analyze-stool` v25, `ask` v18, `extract-food-from-photo` v19, `extract-medication-from-photo` v6, `delete-account` v8 (2026-08-02; its re-auth version is held). All `verify_jwt` on. | `[C]` `list_edge_functions` 2026-10-11; `deploy-manifest.json` |

**Consequence for every comparison:** a server-side capability (the engine, the report, the photo reads) is live for any build that calls it. A client capability merged after 2026-08-28 is in **no distributed binary**, and will reach owners only with the 1.2.0 store build.

### 4.2 Shipped in code: availability by class

**L** = live in code on `main` for every account · **T** = also in the 08-29 TestFlight build · **S** = server-side, live now · **D** = dark (flag or allowlist) · **N** = merged after the cut, in no binary · **U** = unbuilt.

| Capability | Class | Note `[C]` |
|---|---|---|
| Repeat meal in 2 taps (FAB → recent-food pill); unlisted food in 3; vomit or stool in 3 (the confirm is the save); other symptoms in 4 | L, T (the pill rules changed on `main` 10-08: up to 3 foods from the 14 days before today) | No symptom ever writes without its confirm, by rule. At large Dynamic Type on small phones the fan can drop the pills. |
| Offline-first logging, witnessed / estimated / window timestamps | L, T | Pet creation and label extraction need the network. |
| Event types: meal, vomit, normal/loose stool, cough, sneeze, lethargy, itch, medication, weight, other (10 tiles, 11 types) | L; cough/sneeze N (an opt-in beta on T) | No skin, eye, ear, urinary or seizure types. Severity capture removed. |
| Food identity: photo extraction of brand, product and every protein; per-account library | S + L, T | No barcode scanner, no product database. Multi-protein: 36 of 63 distinct products carry ≥2 proteins (panel-derived). |
| Correlation engine: 13 detectors, case-crossover + exact McNemar; Bonferroni on Established only | S | Owner food cards are Early (no test); 0 Established food findings live. Medication is modelled from regimen spans; dose points are off in the Signal and on in the report. |
| Signals v2 lanes (timing, empty-stomach, trial response, chronicity, reflection, red flag) | S; renderers L, T | The server's gap-shortening finding has no client face (CUL-1370). |
| Engines v3 | EN-0 S (live for all since 2026-10-10, 0 reads since); EN-10 D (PM); EN-3/4/5/8/9/11/14 D | Tiered dispositions, care state, weight lane, insight honesty: all dark. |
| Vomit photo read (`analyze-vomit`) | S + L, T | 117 reads ever (8 in the last 30 days). Enum has no reassuring value; escalation computed before the model and survives a cap. |
| Stool photo read (`analyze-stool`) | S | **0 production reads ever.** |
| LLM boundary | S | Model text can reach an owner on 2 of 13 detector types (Haiku 4.5), guarded lexically with template fallback. Summary and report: template-only. |
| Diet trial: start, dated allowed set, end with outcome, target protein (never permits), off-diet predicate shared by client, report and engine | L, T (write path #456, 2026-07-26) | 1 trial ever started by a person. **Reintroduction phase U.** Change-window and the trial screen are N. |
| Medications: regimens, one-tap dose, given/partial/refused, dose-counted courses, history, med-with-food unconfirmed | L, T | No reminders (excluded by rule in v1). The Home med strip was deleted from `main` 2026-10-05 but is still in T. |
| Vet visits companion: book, Home strip, Get ready, notes, plan rows | L, **N** | No appointment notification, no calendar export, no recording. |
| Vet Files (store and share documents) | L, T | Not included in the report; a deleted file is never purged from Storage. |
| Vet report (`generate-report` v55): owner-reported summary, trial block, protein timeline, lifetime med history, incident photos, Noticed, appendices A–F; Established food findings only | S; screen and PDF L, T | No LLM call. AI-read *fields* print, badged "AI read · unconfirmed". No share link, nothing stored. |
| Noticed (daily look), History v2, Design v2, the trial screen, FAB round 2 | L, **N** | Their `app_config` rows read `enabled:false` but no code reads them. |
| Ask | D (S v18) | The PM plus one internal account; 9 human messages ever. |
| Home Screen widget v2 (informational) | D, T | Allowlist of 1 plus a local opt-in. v1 (capture) was in build 35 and logged 0 rows. |
| Notifications | L, T | One category: an opt-in 9pm Day Summary. A second (follow-up questions) is D and N. No push. |
| Household sharing · data export · purchases · crash reporting · Android · iPad · dark mode · Siri/Shortcuts · localization | U | Unchanged since July, except that CI now exists. |

### 4.3 Claims we cannot make: rebuilt

**July's list, re-checked:**

| July said we cannot claim | True now `[C]` | Claimable? |
|---|---|---|
| Diet-trial support | Write path shipped 2026-07-26; in the 08-29 TestFlight build | **Yes, once 1.2.0 ships.** Not "elimination *and reintroduction*": reintroduction is unbuilt. |
| "Share a link with your vet" | Still no share link; `view-report` is gone from the repo and the live project | **No.** PDF via the share sheet only. |
| Immutable report snapshot | Still nothing stored | **No.** "The PDF you send is fixed" is fine. |
| Multi-protein / hidden secondary proteins | The engine and the report read the full protein set | **Partly.** "Tests every listed protein" yes. "Catches hidden proteins" no: co-occurring proteins become a joint Early card, and synthetic hidden-chicken detection is slow (§1 ③). |
| Blood in stool reaches Home | Server live; client renderer in both builds | **Built, never exercised:** 0 stool reads exist. |
| "Vet-validated" / clinic-ready | Still no real veterinarian has read the report. Dr. Chen is a persona. The paid real-vet review (CUL-1312) was cancelled 2026-10-02. CUL-598 (send it to the PM's own vet) is still Todo. Nothing records the vet seeing it at the 2026-09-16 appointment. | **No.** Also not "clinical-grade", "designed with vets", "our consulting vet". |
| Home Screen widget | Data-gated in every TestFlight build; dark | **No.** |
| Barcode scanning | No scanner, no product DB | **No.** |
| Severity capture | Removed | **No.** |
| Reminders / nudges | One opt-in evening summary; medication reminders excluded by rule | **No** "reminders", "never miss a dose". "An optional evening summary" yes. |
| Data export | Still none (the privacy policy says "planned") | **No.** |
| Premium / gating | Still no purchase code; nothing gated | "Everything is free today" yes; no prices or trials. |
| Ask | Allowlisted to the PM plus one internal account | **No.** |
| CI | Runs on every PR; HEAD green. **No ruleset or branch protection is visible from any public endpoint**, so "required checks" is unconfirmed. | "CI on every PR" yes; "merges gated by CI" no. |

**New since July:**

| Tempting claim | Why not `[C]` |
|---|---|
| "Available on the App Store", any rating, user count, "trusted by owners" | Not submitted; one household of use. |
| "Finds the food behind your pet's symptoms" / "pinpoints the culprit protein" | Owner food cards are Early tier (no test); the synthetic harness forbids it (§1 ③). |
| "Every pattern is statistically significant / corrected" | Only Established findings are, and none is live. |
| "Low false alarms" / "won't cry wolf" | The synthetic harness says otherwise. |
| "Accounts for every medication dose" | The Signal reads regimen spans only. |
| "AI stool analysis" as a proven feature | 0 production reads. |
| "Never reassures, by construction" for everything | True for the photo reads and 11 template-only card types; **lexical** for the 2 model-phrased types (including intake decline, a safety card) and for Ask. |
| "No AI text in the vet report" | One labelled model fragment (suspected foreign material) can print. Say "no AI writes the report". |
| "We ask before any photo goes to AI" / "photos are only analysed when you ask" | Reads auto-fire on log; the consent gate (CUL-552) is unbuilt. **The live privacy policy currently says reads happen "when you request" them, and does not list Ask.** |
| "Tiered triage", "knows your vet has seen it", "weight-loss alerts", "spots shortening gaps" | EN-3/4, EN-9, EN-8 dark; L4 has no client face. |
| "Delete a document and it's gone" | Vet Files never purges the stored file. |
| "Password-protected deletion" | The live server does not check the password (re-auth version held, CUL-1454). |
| "Reset your password any time" | In the TestFlight build and enabled, but by code reading it most likely fails on the golden path (CUL-1205). |
| "Log from your Home Screen / with Siri / any species / in dark mode / on iPad / Android" | None. Onboarding is cat or dog; Add a pet also offers Other. |
| "Free forever for every pet" | True today; D-M8 (ratified) plans Premium at 4+ pets. See D4. |
| "Open source" | The repo is public with no license (CUL-1491). |

---

## 5. Head-to-head, Matrix A: capture and intelligence

**Legend:** ✓ shipped · ◐ partial, paid-only or marketed-not-verified · ✗ absent · ? unknown. "Shipping" per the evidence rule. Ratings are US iOS, 2026-10-10/11.

| Player (ratings) | Fast repeat log | Food identity | Per-incident photo read | Food↔symptom association (stated method) | Diet-trial object | Reminders | Household |
|---|---|---|---|---|---|---|---|
| **Culprit** (no listing) | ✓ 2 taps for a recent food | ✓ photo→protein set, free | ✓ vomit (stool built, unused) | ✓ case-crossover + McNemar; **owner cards Early, untested** | ✓ (no reintroduction) | ✗ evening summary only | ✗ |
| PawTrial (0) | ◐ daily 0–10 scores | ◐ exposure logging | ✗ | ✗ "does not identify allergens" | ✓ + reintroduction (Pro) | ✓ daily | ? |
| ThePawcess (web, none) | ? | ✓ AI label check | ✗ | ◐ "ranked by correlation", AI-written | ✓ 3 phases (demo-level) | ? | ✓ fridge card (demo) |
| Tend & Mend (0) | ◐ | ✓ brand + protein | ✗ | ◐ per-food rate vs baseline; protein-level Premium; no test | ✗ (4-week programs) | ✓ | ✓ free |
| PawSolids (0) | ◐ | ✓ | ◐ AI stool scan | ◐ "6.2x" ratios; no test | ✗ (3-week plan) | ✓ | ? |
| Everkin (6) | ◐ + Siri | ✗ | ✗ | ◐ marketed, copy-level | ✗ | ✓ | ✓ (paid to create) |
| DogLog (1,367) | ✓ one-tap defaults | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ |
| CompanAIn (25) | ◐ | ✗ | ✗ | ✗ LLM over the record | ✗ | ✓ | ✓ |
| Wonderdog (22) | ✗ records sync | ◐ profile-level diet | ✗ | ✗ | ✗ | ✓ | ✓ |
| PawMD (84) | ◐ daily care, streaks | ◐ food scan | ✓ PoopScan | ✗ | ✗ | ? | ? |
| Zoetis The Pack (9,931) | ◐ | ✗ | ✗ | ✗ | ✗ (itch tracker is a PDF) | ✓ | ◐ |
| Ollie (22.3K) | ✗ | sponsor's own food | ✓ vet-reviewed photos, 24h, subscribers | ✗ | ✗ | ✓ | ? |
| Furbo / Petcube | ✓✓ passive (one camera) | ✗ | ✓ vomit alert (subscription) | ✗ | ✗ | ✓ | ✓ |
| PETKIT / Petlibro / Whisker / Petivity | ✓✓ passive | ✗ **grams only** | ◐ stool flags; vomit marketed | ✗ change-from-baseline | ✗ | ✓ | ✓ |
| Tractive / Fi | ✗ passive vitals | ✗ | ✗ | ◐ Tractive markets scratch "patterns that might indicate food allergies" | ✗ | ✓ | ✓ |
| Chewy (1.19M) | ✗ | sells 600+ Rx diets | ✗ | ✗ (Symptom Tracker = triage) | ✗ | ✓ refills | ? |
| ChatGPT / Gemini + camera roll | ✗ prose | ◐ ad hoc | ✓ uncalibrated, varies on re-ask | ◐ only if the owner keeps a table | ◐ scheduled check-ins (paid) | ✓ | ✗ |
| *Digestly (human reference)* | ✓ | ✓ | ✓ meal photos | **✓ exact test + correction + permutation; publishes FP rates** | ✓ elimination/reintroduction compared | ✓ | n/a |

## 6. Head-to-head, Matrix B: output, safety, business

| Player | Vet artifact | AI-authored? | Free? | Single-photo / single-event posture | Sponsor? |
|---|---|---|---|---|---|
| **Culprit** | ✓ PDF, appendices A–F, Established food findings only | ✗ no LLM writes it (AI-read fields badged) | ✓ everything free today | ✓ photo read cannot return an all-clear; escalation before the model | ✗ independent |
| PawTrial | ◐ on-screen free; PDF Pro | ✗ | ◐ | n/a | ✗ |
| ThePawcess | ✓ report at the finish | **✓ "Generated by AI"**; "96% compliance" = days logged | ✗ $39 per trial | ✗ slip triage reassures ("probably survivable") | ✗ (Chewy affiliate links) |
| Tend & Mend | ◐ Premium | ? | ✗ protein-level and report paid | ◐ "What Works" foods with Amazon links (intake as preference) | ✗ |
| PawSolids | ◐ "clinical-grade PDF" marketed | ? | ✗ subscription only | ◐ demo stool read shows "Normal" | ✗ |
| CompanAIn | ◐ email-invite share | ✓ LLM | ✗ $11.99–$54.99/mo | ◐ reviews praise fewer vet visits | ✗ |
| Ollie | ✗ | human vets | subscriber feature | ✗ markets "Looks Great!", "avoid unnecessary … trips to the vet" | **✓ food company** |
| Petalife | ✓ PDF | ✓ | ✓ | ◐ "urgency score"; product recommendations | ◐ Purina program in-app |
| Fi / Sure Petcare / Petivity | ✓ device-data PDF or email | ✗ | ✗ hardware + sub | n/a | Petivity: **✓ Purina**; Sure: **✓ Merck** |
| PETKIT Kitbo | ◐ marketed ("helps vets reach a diagnosis sooner") | ✓ | ✗ | n/a | ✗ |
| Zoetis The Pack | ◐ downloadable history | ✗ | ✓ | n/a | **✓ drug rewards** |
| AI-vet shelf (~100 listings, median 0 ratings) | ◐ | ✓ | mixed | ✗ "when to relax", "Low Concern" common; PawTriage the exception | mixed |
| ChatGPT | ◐ prose, no provenance | ✓ | ✓ | ✗ error direction depends on the task | ✗ |

**What nobody fills** (Matrix A + B together): a trial object, protein-level food identity, an association with a *stated* design, a free report with no generated prose, and a single-sample posture that cannot reassure, in one product. The closest is ThePawcess on its own demo pages: three of five, paid, web-only, dog-only, AI-written report, reassuring slip triage, no evidence of real use.

---

## 7. Where we win

Ranked by defensibility. Each row names the counterexample the review tried, and whether the claim held. All of it presumes the 1.2.0 build ships.

| # | Claim | Counterexample tried | Held? |
|---|---|---|---|
| 1 | **The record knows which days are missing.** Coverage is kept apart from adherence; a quiet day is never read as a clean one; "no off-diet foods logged" is never printed at any coverage; witnessed vs found time is captured from the affordance, not asked. `[C]` | ThePawcess prints "96% compliance" from 81 of 84 days *logged* (coverage as adherence). A general assistant asked "any slips?" can only answer from what it was told. PawTrial's compliance tracker (clean vs slip days) does not say how an unlogged day counts. | **Held.** No rival found that states the distinction. |
| 2 | **A free vet report that no LLM writes, printing only food findings that pass a corrected test.** `[C report.ts:45, 2282]` | ThePawcess (AI-generated, paid); PawTrial and Tend & Mend (PDF paid); Fi / Sure / Petivity (device data only, no symptoms or food); PETKIT Kitbo (LLM, marketed); CompanAIn (LLM). | **Held**, with two caveats. AI-read fields print, badged. No real vet has read it (D5). |
| 3 | **A single photo cannot produce an all-clear.** The enum has no reassuring value; escalation from the record (repeat vomits, a cat not eating, lethargy) is computed before the model and survives a cap or an outage. `[C]` | Ollie ("Looks Great!"), BooBoo Buddy ("when you can relax"), DogMD and nuzlo ("Low Concern"), PawSolids (a "Normal" read), ThePawcess ("probably survivable"). PawTriage (0 ratings) also states a never-rule-out posture. | **Held, narrowed.** Not unique as a stated posture (PawTriage). Ours is lexical, not structural, on 2 model-phrased card types and in Ask. |
| 4 | **A refusal is read toward illness, fast.** One refusal of a food the pet normally eats, within 2 days, raises a safety card; for cats one low day is enough; never "picky". `[C detection.ts:2724–2735]` | Petlog waits 5 of 7 days and says "mention at next visit". Tend & Mend's "What Works / find it on Amazon" treats intake as preference. Every Wag, Cat360 and Sereno flag appetite change with no stated window. | **Held**, with a floor: it needs ≥4 rated meals and ≥3 prior ratings of that food, and meal rating collapsed in dogfood (CUL-1753 addresses it). |
| 5 | **Independence, now with a legal reason.** A drug maker's itch tracker is promotional labeling (FDA warning letter to Elanco, 2025-01-28, names the Zenrelia "Itch Tracker"). Ollie's vets work for the food you feed; myPurina's Allie guides on "Purina products"; Petivity is Purina, Sure Petcare is Merck; IDEXX's pet-parent layer includes "Personalized Offers" and "Coupons". `[E]` | Looked for a sponsor-backed app that names its own food as a culprit. None found. Petalife's "Purina Gut Health Program" does the opposite. | **Held**, and stronger than July. |
| 6 | **Protein-level food identity, free.** Every protein on the panel is captured and tested. `[C]` | Tend & Mend: protein-level in Premium. ItchyPet: ingredient-level, $99/yr. PawSolids: subscription. No device identifies food (second search confirmed). | **Held** as "free"; capped by the joint-card limit (co-occurring proteins are not separated). |
| 7 | **A disciplined trial record:** dated allowed-food membership, a target protein that never permits a food, a disclosed window change, and a report block headed "the record, not a result". `[C]` | PawTrial and ThePawcess both run trial objects. | **Narrowed.** Existence is contested; the claim is quality and honesty, not "only". Both rivals have reintroduction, which we lack. |
| 8 | **A stated statistical design**, for pets. | Digestly (human, free) states a stricter one and publishes false-positive rates. Pet rivals state rates vs baseline at most. | **Narrowed, and demoted.** "The only pet app…" survives only as a design claim, and owner food cards are untested Early. Do not lead with it (D1). |
| 9 | **No paywall on care, and no pet-count gate.** | Everkin's free tier covers 2 pets; Petlog's Pro unlocks unlimited pets; CUL-740 found no rival keeps capture free *and* free of a pet-count gate. | **Held today, at risk:** D-M8 plans Premium at 4+ pets (D4). |

---

## 8. Where we are behind

1. **Not shipping.** No listing; about 420 unshipped commits; one household of use. Every rival above passes the evidence rule; we do not.
2. **No real vet has read the report.** The paid review was cancelled; CUL-598 is untouched. This is the one claim the 140 zero-rating clones cannot fake, and we cannot make it either.
3. **The engine's food lane is measured weak on our own harness**, and owners would see only its untested tier. EN-11 is dark.
4. **No reintroduction phase.** PawTrial (Pro), ThePawcess and every human elimination app (Digestly, Culprit: Pattern Finder, Lergy, Monash FODMAP) have one. An owner who has used a human app will expect it.
5. **Table stakes the small rivals ship and we do not:**
   - household sharing, now free at Tend & Mend, WagWatch, Sirrius, Hau and Cat360 (CUL-194);
   - medication and appointment reminders;
   - data export: CSV free at Everkin, CSV/JSON free at WagWatch (CUL-232);
   - a revocable read-only vet link (usually paid elsewhere);
   - Siri, Shortcuts or Watch logging (Everkin, WagWatch, DogNote).
6. **Platform reach:** iOS only. No iPad, dark mode or localization. The Android shelf for the wedge is as empty as iOS, and indie trackers there run 10–100× their US iOS footprint.
7. **Trust and operations:**
   - no crash reporting;
   - password reset likely broken (CUL-1205);
   - deletion re-auth not enforced on the live server (CUL-1454);
   - the AI consent gate unbuilt, App Review's 5.1.2(i) (CUL-552);
   - the privacy policy misstates when photos go to AI and omits Ask (CUL-1769);
   - the disclaimer link 404s on every new account's onboarding (CUL-1460);
   - leaked-password protection off;
   - the repo is public (CUL-1491).
8. **No published validation.** Digestly publishes its false-positive rates; we publish nothing, and our numbers are not yet ones to publish.

---

## 9. Strategic risks

**R1. Time and dilution (now).** In eleven weeks the trial object (PawTrial, ThePawcess), protein-level association copy (Tend & Mend, PawSolids) and bounded programs each found an owner, and 142 new pet-health listings arrived, mostly $0-funded clones with near-identical copy. None has traction yet. The risk is not a funded rival; it is arriving on a shelf where every claim we would make has already been made in an adjective by someone with zero ratings. **Mitigation:** ship, and differentiate with verifiable artifacts (a rendered report page, a finding shown with its counts) rather than listing adjectives.

**R2. The reader of the artifact is becoming an LLM (12 months).** Provet, Instinct, Covetrus, Vetspire and CoVet/IDEXX summarize attached PDFs. Our honesty rules (scope in the same sentence as the number, present-only scoping, coverage stated) protect the document; a summarizer may keep the count and drop the scope clause. PIMS write access still costs a third party partner approval plus a six-month certification with a five-site beta. **The owner-carried PDF stays the only route to any vet, and it now needs to survive a machine reader.**

**R3. Fast followers at the moment the diet is bought.** Chewy (1.19M ratings, 600+ Rx diets, a "Symptom Tracker" doorway, Rx approvals with the vet), Dutch (sells 15+ hydrolyzed SKUs, fastest-growing telehealth listing) and Zoetis (The Pack plus a 2026 itch PDF that already points owners to the app) could each ship a trial counter cheaply. None shows a sign of it today.

**R4. Intelligence is commoditized; retrieval more so.** Re-estimate of what a general assistant plus camera roll delivers, by job, with weights `[A]`:

| Scenario | July | October | What moved |
|---|---|---|---|
| Acute GI episode, 1–3 weeks | 60–70% | **~55–60%** (upper bound) | Photo retrieval (Siri AI, Gemini PI) and visit prep improved. The denominator and the clinical artifact did not move. Medication credit excludes reminders, which we deliberately do not send. |
| 8-week elimination trial | 20–30% | **~25%** (up to ~29% on a paid tier with scheduled check-ins) | Scheduled tasks replaced Pulse, but free-tier availability is unconfirmed. A check-in an owner ignores leaves a day the assistant cannot tell from a clean one, so the trustworthy share stays about a quarter. |

Our own job list grew since July (trial lifecycle, med history, vet visits), so the substitute's share of it is flat to down. **The line to use:** *an assistant can read the photo you took; it cannot count the ones you didn't, and it cannot tell a quiet day from a day nobody looked.*

**R5. Our claims outrunning our evidence.** The name promises culprit-finding; the measured weak layer is culprit-finding. A human app with the same name runs the same protocol for people. A 1★ review from an owner who expected "find the food" and got an untested Early card is the reputational failure mode, and it is the Bearable review July quoted, arriving faster.

**R6. App Review (submission-blocking).** The 5.1.2(i) consent gate (CUL-552) and a privacy policy that describes a different trigger than the code are the two most likely rejection reasons found in this pass. Neither is competitive; both delay everything competitive.

**The structural good news (unchanged from July, re-verified).** No pet-side interoperability standard exists, and PIMS write paths are paywalled and certified. Nobody can stop an owner handing a vet a PDF.

---

## 10. App Store positioning (listing-ready)

Written against what the **1.2.0 store build** will contain if cut from current `main`: everything marked L in §4.2, nothing marked D or U. Re-verify every competitive line at the moment of entry (the house rule; this pass found a rival updating on the day it was checked).

### 10.1 Fields

| Field | Proposal | Count | Note |
|---|---|---|---|
| **Name** | `Culprit — Pet Health Tracker` (locked, B-272) | 28/30 | Keep. "Pet" already separates us from "Culprit: Pattern Finder" in search results. |
| **Subtitle** | `Food trials & symptom diary` | 27/30 | **D2.** "Food trial" is the owner's word (Google ~12–14× "elimination diet"). App Store volume is near zero either way, so the subtitle's job is conversion for an owner arriving from a vet or the web. |
| **Keywords** | `elimination,diet,allergy,poop,stool,novel,protein,hydrolyzed,vomiting,diarrhea,itching,vet,dog,cat` | 98/100 | No token repeats the name or subtitle. Swaps in "poop"/"stool" (Apple suggests "dog poop tracker", "stool tracker") and "diet" (keeps "elimination diet" indexable); drops "food" (now in the subtitle) and "sensitivity" (MyDog holds it). |
| **Promotional text** | `Your vet said to track it. Culprit makes it a few taps a day: meals, symptoms and a food trial, then an organized summary to hand your vet. Free, no paywall on care.` | 165/170 | Editable any time without review. |
| **Category** | Primary Lifestyle, secondary Health & Fitness | — | Unchanged. Avoid Medical. |

### 10.2 Description: required changes to the 2026-08-09 draft (`docs/store-listing-copy.md`)

| Draft line | Problem | Replace with |
|---|---|---|
| "Log a repeat meal in two taps — the food you set up once is a single tap away" | A food first logged today is not offered until tomorrow; pills are the 3 most recent of 14 days | "Log a food your pet had recently in two taps" |
| "itching tends to peak 3 to 6 hours after meals with chicken" | No template emits this; implies a food culprit the engine does not show today | "Patterns come with their counts, like how many of the vomits you logged came within half an hour of a meal" (detector ⑤'s real shape) |
| "A report your vet can read in a minute … laid out the way a vet actually reads" | No real vet has read it; the report titles itself "Owner-reported summary" | "An organized summary for your vet: symptoms and their timing, the trial so far, medications and photos. No app and no account needed on their end." |
| "Track every pet in your home, free." + "Care features are free — and stay free" | Collides with D-M8 (4+ pets Premium) | Keep only if D4 rules multi-pet free forever; otherwise "Track every pet in your home" and move "stay free" to the care list only |
| (missing) | Vet visits ship in 1.2.0 | Add: "Before the visit, Culprit lines up what's worth raising, your questions and the report" (needs a `nyx-voice` pass) |
| §7 of the draft: "Ask (allowlisted to one user)", "widget not in a distributed build" | Stale (two accounts; data-gated in TestFlight) | Keep both out of the listing; update the note |

**Keep as written:** the independence paragraph (verified, stronger), "It does not diagnose", the emergency line, "No app and no account needed on their end", "Snap a photo of a food or its label".

### 10.3 Screenshot frame 1 (search card)

Frames 1–3 show in search and decide most installs (Aug creative brief). Frame 1 should make **species and job** unmistakable, so a human elimination-diet searcher does not install and churn: a dog or cat, a running food trial ("Day 23 of 56"), and the report. Lead with the record and the report, not "AI" (§12).

### 10.4 Claims the listing, the site or a pitch may make

| May say | Must not say |
|---|---|
| "Free. No paywall on care." | "AI finds the food behind your pet's symptoms" |
| "Built for the food trial your vet prescribed" | "Elimination and reintroduction" (reintroduction is unbuilt) |
| "A summary for your vet, as a PDF, no account needed" | "Vet-approved", "clinical-grade", "designed with vets" |
| "Patterns come with their counts" | "Statistically proven", "finds the culprit" |
| "Not owned by a food or drug company" | "Share a link with your vet", "reminders", "export your data" |
| "A photo read never tells you everything is fine" | "We ask before any photo goes to AI" (until CUL-552 ships) |

---

## 11. Recommendations

**Before submission (days):**
1. **Cut 1.2.0 from current `main` and record its build number** (CUL-559). Every differentiator in §7 is in code and reaches nobody until this happens.
2. **Clear the App Review and trust blockers:** the AI consent gate (CUL-552); correct the privacy policy's AI-trigger sentence and add Ask (CUL-1769); publish the disclaimer (CUL-1460); release the deletion re-auth hold (CUL-1454); settle password reset on a device (CUL-1205).
3. **Apply the listing edit set** (§10, D2, CUL-1775). The accuracy fixes are not optional (Guideline 2.3.1).
4. **Send the report to a real vet** (CUL-598, D5): one email, and the only claim nobody on the shelf can copy.

**Before competitive claims (weeks):**
5. **Rule the positioning lead (D1).** Until EN-11, or a narrower relabel of Early food cards, passes its harness lines, lead with the record, the trial and the report.
6. **Run a summarizer round-trip:** put a sample report through one clinic summarizer (Provet's free tier) and check that scope clauses, denominators and escalation lines survive; harden the PDF (text layer, scope beside every number, stable section anchors, a clear filename) (CUL-1771).
7. **Hands-on pass on the four closest rivals** (PawTrial Pro, ThePawcess $39, Tend & Mend Premium, PawSolids; D8, CUL-1777). Every capability in §5 is still store or demo text.
8. **Do not publish false-positive numbers until they are ones to publish.** Digestly shows that a stated design plus published rates is the bar; meet it or do not claim rigor.

**Distribution (new territory):**
9. **A vet-handout experiment:** a printable, QR-linked "food trial log" a clinic can hand out, plus web pages answering "food trial dog instructions". The search data points here, not at the store (CUL-1772).
10. **Condition communities, disclosed and non-promotional:** r/dogallergies and r/AskVet hydrolyzed-diet threads. A one-account comment campaign (the Hugging Cat pattern on r/RenalCats) is visible and reputationally risky.

**Product weight after launch:**
11. **Reintroduction phase** (rivals and human apps standard; CUL-1770).
12. **Household sharing** (CUL-194): table stakes now, and the fix for the unwitnessed-treat trial contaminant.
13. **A revocable read-only vet link** behind an `rls-privacy-reviewer` pass (D6).
14. **Data export** (CUL-232).

---

## 12. Persona conflict: July's call revisited, and the new one

**July (§12):** "B-417 + multi-protein (make the differentiator reachable) vs reminders + household sharing (table stakes)." **What happened:**
- The differentiator track was executed within 48 hours: the trial write path landed 2026-07-26, and multi-protein reached the engine and report on 07-25/26.
- Notifications shipped narrowly (one evening summary; medication reminders excluded by rule).
- Household sharing was never started.
- The next eleven weeks went to depth and polish: Engines v3, Design v2, History v2, Noticed, the FAB, vet visits.

None of it was distributed. **The conflict has moved from "what to build" to "build or ship", and the evidence in §1 ① and §9 R1 says ship.** That part needs no PM call; it is the App Store Launch project's own premise.

**The conflict that does need a call:**

> **Data Scientist / Dr. Chen:** Every food card an owner sees today is the untested Early tier. On our own synthetic harness a hidden-chicken reaction goes unnamed by a chicken-only card for 56 days, two in three food-card evenings name a non-culprit protein, and most healthy synthetic pets see a false card within six months. A listing and a launch that lead with "find the food" promise exactly the layer we have measured as weakest, to the owners most likely to act on it.
>
> **Designer / Product Owner:** The product is called Culprit. "Find what's behind it" is the job an owner downloads for; "a tidy diary" is what 140 zero-rating clones already say. Lead with the finding, phrase it as a pattern with its counts and a vet conversation, and let EN-11 make the cards honest on its own schedule.
>
> **PM decision needed (D1):** does the 1.2.0 listing and launch lead with food findings, or with the trial record, the report and the safety posture until EN-11 (or a narrower relabel of Early food cards) passes its harness lines?

---

## 13. Decisions for the PM

Each is a decision brief. They are collected on one `Waiting on PM` issue, **CUL-1768** (one round). The listing edits wait on it as CUL-1775, the frozen-brief corrections as CUL-1776, the rival pass as CUL-1777.

**D1. The positioning lead.** *Persona conflict, §12; no team recommendation.*
- **Deciding:** what the listing, frame 1 and the launch copy lead with.
- **Options:** (a) the record, the trial and the report, with food patterns as a supporting line (Data Scientist / Dr. Chen); (b) food findings, phrased as patterns with counts (Designer / Product Owner); (c) (b), gated on EN-11 shipping first.
- **Consequence:** (a) changes §10's frame 1 and description order only; (c) makes EN-11 a submission dependency.

**D2. The subtitle, keywords and description edit set.**
- **Deciding:** whether to replace the subtitle locked in App Store Connect ("Track symptoms, find triggers") and apply the §10 edits now.
- **Options:** (a) `Food trials & symptom diary` plus all §10 edits (**recommended**: matches the owner's word, carries the wedge for conversion, and fixes two inaccurate lines); (b) keep the ASC subtitle, apply only the accuracy fixes; (c) defer everything to submission day.
- **Consequence:** (a) and (b) unblock CUL-173's copy step. "find triggers" reads close to the human Culprit app's pitch.

**D3. Approve a 1-hour Apple Search Ads popularity check before D2 locks.**
- **Deciding:** whether to measure absolute keyword popularity (1–100) for ~20 terms in a draft ASA campaign.
- **Options:** (a) yes, before D2 locks (**recommended**: no cost, under an hour); (b) skip; wedge volume is near zero by autocomplete anyway.
- **Consequence:** closes July's research debt #4. Whether ASA serves data before the app is live is untested.

**D4. Multi-pet: free forever, or Premium at 4+ (D-M8)?**
- **Deciding:** whether to rescind D-M8's pet-count gate. D-M1 lists multi-pet as free forever, so the two rulings already disagree.
- **Options:** (a) rescind; multi-pet free forever (**recommended**: it makes "no paywall on care and no pet-count gate" a claim no rival can make, and a fourth pet's log is care); (b) keep D-M8, and drop "stay free" from the listing's pet line.
- **Consequence:** (a) is a Tier-2 edit to the monetization record and frees the §10 copy; (b) forecloses the claim.

**D5. A real vet reads the report before submission.**
- **Deciding:** whether CUL-598 (email the report to your own vet) happens before 1.2.0 is submitted.
- **Options:** (a) yes, before submission (**recommended**: one email, catches clinical-readability problems before real owners do, and is the only claim no clone can copy); (b) after launch; (c) reopen the paid review (CUL-1312).
- **Consequence:** (a) may surface report edits; the report is server-side, so they ship without a binary.

**D6. A vet-side surface (July #12, revisited).**
- **Deciding:** whether to build anything a vet logs into.
- **Options:** (a) no portal; harden the PDF for clinic summarizers and attachment channels; revisit a revocable read-only link after launch (**recommended**: CompanAIn's portal has no clinic traction, read-only links are table stakes, often paid, and the owner→clinic file rails already exist); (b) build a revocable read-only link now (privacy review required); (c) build a respond loop.
- **Consequence:** (a) adds one research task (the summarizer round-trip), not a build.

**D7. Bounded-job pricing (July #13, revisited).**
- **Deciding:** the shape of a future Premium for the trial job.
- **Options:** (a) keep D-M5's monthly-forward placeholder; revisit at Track 3 with this evidence (**recommended**: nothing is gated today and no purchase code exists); (b) plan a trial-length pass for Premium launch; (c) one-time per trial (ThePawcess's $39).
- **Consequence:** no change before submission. The evidence: ThePawcess $39 plus a $4.99/mo Food Passport; PetLog $4.99 for 3 months; Amaeru $1.99 vet-report pass; $39.99/yr is still the modal annual price.

**D8. Spend on a hands-on rival pass.**
- **Deciding:** whether to buy and install the four closest wedge rivals (~$39 plus ~$15 in subscriptions; one session).
- **Options:** (a) yes, before the listing locks (**recommended**: every §5 cell is store or demo text, and ThePawcess and PawTrial are the reference points for the trial surfaces); (b) no; keep claims at text strength (CUL-740 option A).
- **Consequence:** (a) supersedes CUL-740's option B (PetLog is now resolved by text).

**Already on the queue, now more pressing:** CUL-1491 (the repo is public, including strategy docs, the attorney brief and this brief) and CUL-552 (AI consent).

---

## 14. Proposed Tier-2 edits (for PM ratification; not written in)

1. **`docs/culprit-competitive-landscape-2026-07.md`:** mark it superseded by this file. Add a dated §V verification addendum with inline ⚠ pointers (the frozen-brief correction rule) for:
   - passive vomit (Furbo and Petcube ship it; PETKIT is marketed and not for litter boxes);
   - the "$899 → $70" floor (three price tiers, not one);
   - the Feb-2026 JFMS paper (it exists; a baseline study in healthy cats, not a validation);
   - Petalife (accelerator alumnus running Purina co-marketing);
   - the Elanco Ventures date (2026-06-18);
   - Vetara (pre-launch; did not ship household sharing);
   - Voyage (lifetime is $99.99 / $179.99, not $29.99);
   - the "0 of 207 listings" claim (LittlePetApp and PawTrial now contain the strings);
   - CompanAIn's "portal" (an email invite; no clinic found);
   - "AI cannot count the fourth vomit" (record-aware AI vets now claim memory);
   - Joii's "65k images" (unsourced; the vendor says 100k);
   - Wonderdog's funding date (2026-07-11);
   - "cat vomiting tracker is ownable" (contested since April);
   - the missed "Culprit: Pattern Finder".
2. **Pulse ⚠ pointers** in `docs/research/2026-08-home-screen-competitive-teardown.md`, `2026-08-home-screen-design-leadership.md` and `2026-07-ask-ai-ux-landscape.md`: OpenAI retired ChatGPT Pulse into scheduled tasks (help-center notice of 2026-06-18, independent coverage). The design lesson stands; the "shipped precedent" claim does not. Gemini's Daily Brief is the current shipped analog.
3. **`docs/research/README.md`:** the signals deep-dive row's "no competitor computes food↔symptom correlation" is false at listing level (Tend & Mend, PawSolids, iKnowMyCat, Paws and Patterns, Amaeru). Narrow it to "no pet product names a statistical design".
4. **`docs/store-listing-copy.md`:** the §10 edit set, after D2 and D4.
5. **`docs/dev-handoff-runbook.md:24`:** the installed build is the 1.2.0 cut of 2026-08-29 (build number unrecorded), not 1.1.0 (35).
6. **`docs/monetization-and-ai-gating-strategy.md`:** reconcile D-M1 (multi-pet free forever) with D-M8 (4+ pets Premium), per D4.
7. **CLAUDE.md's diet-trial row** says the off-diet predicate is shared by "client / `generate-report` / `ask`". `ask` does not import it; `generate-signal` imports only `isTrialRunning`. Either Ask should use it or the rule should drop it (CUL-1773; not edited here, because it is a rule, not a typo).

---

## 15. Trip-wires for the next pass

| Watch | Fires when |
|---|---|
| **PawTrial** | An Android listing, any update past v1.0, ≥25 ratings, or any association or allergen-identification claim |
| **ThePawcess** | A store listing, or third-party evidence of real use |
| **Tend & Mend / PawSolids / MyDog** | ≥50 ratings, an Android launch, or an elimination-diet or novel-protein object |
| **Chewy** | Listing gains "diet trial" or "food trial", or the Symptom Tracker links to Rx-diet purchases or Modern Animal records |
| **Dutch** | Any owner logging or a diet-trial follow-up program |
| **Zoetis / Merck** | The Pack lists itch, allergy or a symptom score; Numelvi's tracker goes digital |
| **Wonderdog** | Release notes mention logging meals, symptoms or reactions |
| **IDEXX / Digitail / clinic AI** | Vello "Home-Care Plan" or "Digital Intake" ships owner check-ins; Digitail documents "Proactive Check-ins"; any summarizer names owner-generated reports or app exports as an input; the Covetrus–MWI FTC outcome (LinkVet comes with MWI) |
| **Hardware** | PETKIT's vomit OTA appears on the device pages; Kitbo's vet report ships; Furbo or Petcube add per-pet vomit attribution or a vet export; **any feeder identifies the food** |
| **Frontier AI** | ChatGPT Health adds family or dependent profiles; a pet plugin does logging or triage; Siri AI leaves beta or gains health reasoning; Gemini Spark reaches free or Pro; a published evaluation of LLMs on pet stool or vomit photos |
| **Statistics** | Any pet app states a test and a correction, or publishes false-positive rates (the Digestly bar) |
| **Money** | Any owner-facing pet-health raise ≥ $1M; a Tractive price change under Bending Spoons |
| **Name** | A Culprit-named pet app appears |

---

## 16. Research debt

1. **No competitor was installed or bought, again.** Every rival capability is store, help-center or demo text (D8).
2. **Absolute App Store keyword popularity** is still unmeasured (D3). The Google Trends ratio rests on a 2025–26 window that looks inflated across every series.
3. **The build state** cannot be read from here: the EAS build and OTA history, the 08-29 build number, any external tester groups (comment on CUL-559).
4. **OpenAI claims are snippet-level** where help-center pages blocked fetch. Pulse's retirement is now confirmed by OpenAI's help page and two outlets; free-tier scheduled tasks are not.
5. **Funding completeness:** the verifiers for four segments ran with no web search (a shared per-turn budget ran out). "Wonderdog is the only owner-facing raise" is untested for completeness.
6. **Reddit coverage is partial:** the archive's subreddit filters returned nothing. Quotes were not independently re-fetched.
7. **The AI-vet shelf counts** (the curated 67) are not reproducible; the script was lost. Proxy counts agree in direction.
8. **Vendor accuracy figures** (IAMS PoopScan 90% on 14k images; Joii 81%) are unverified; neither page shows them.
9. **Device outcomes** are code-level only: EXIF removal (rests on the client re-encode), password reset, wrong-password deletion.
10. **CI enforcement:** branch-protection admin endpoints returned 403, and every public endpoint shows none.
11. **Tractive's pre-close price:** web archives were blocked.
12. **The sweep is not saturated.** Every verifier found entrants its report missed (PawTrial, PawMD, Purrla, HotSpotter, LinkVet, MyDog, Barkwell, Rootsy, Petcube's vomit event). Expect more.
13. **The 2026-09-16 appointment:** only the PM knows whether the vet saw the report.

---

## 17. Method and verification log

**Agents.**
- 4 code audits worked from source, migrations, read-only aggregate queries and the deployed function list, told to treat every doc as unreliable: capture and surfaces; intelligence; clinical record and vet output; table stakes, ops and distribution.
- 8 market sweeps followed the evidence rule: direct owner apps; vet and clinic platforms; hardware; pharma and food brands; telehealth; general LLMs; web-first wedge entrants; demand, shelf, Android and funding. Between them, roughly 400 iTunes Search queries, 150 Google Play pages and the iTunes review RSS for 17 rivals (4,582 reviews).
- Each report had an adversarial verifier: 171 claims confirmed, 93 narrowed, 19 refuted (all market claims), 9 unverifiable. A completeness critic listed contradictions and gaps; all 37 contradictions are resolved in the text above.

**Main-session re-checks (2026-10-11), each done by hand, not delegated.**
- **Deployed versions and live counts:** `generate-signal` v78, `generate-report` v55, 9 users, 1 active owner, 3 trials (none ended), 117 vomit reads, 0 report rows, 0 care acknowledgements.
- **Code claims, each at file:line:**
  - the Early-tier thresholds (`detection.ts:2718–2721`) and the synthetic scorecard values (`eval/scorecard.json`; `ADEMP.md` §4–§5);
  - the trial write path (`lib/dietTrialSetup.ts`);
  - the four unread flags; the one notification category (`lib/notifications.ts:37`);
  - no household schema; the privacy-policy sentence (`docs/legal/privacy-policy.md:60`) against the auto-fire path;
  - the deletion hold; the password-recovery event mismatch (`lib/authRouting.ts`, auth-js `GoTrueClient.js:1496`);
  - no LLM in `generate-report`; the intake-decline thresholds (`detection.ts:2724–2735`).
- **Live checks:** repo visibility (public, no license); App Store lookup (0); the disclaimer URL (404).
- **App Store records re-fetched** for 24 rivals. PetLog shipped v2.3.0 on the day of the check with no AI change, which is the re-verify-at-use rule in action.
- **Second targeted searches** for every "nobody does X" claim in this brief: a pet app naming a statistical test (none; turned up Paws and Patterns and Paw Relief as more copy-level association apps); an elimination-trial app (none beyond PawTrial / ThePawcess); a manufacturer trial tool (none); a food-identifying feeder (none); a frontier pet-health feature (none); a 24-hour cat refusal alert (none); a vet portal over owner logs (VetBasic, as found).
- **Studies and stats re-fetched:** JAVMA (PMID 42600647), the Feline Grimace Scale chatbot study (PMID 41366265; corrected to note Claude's acceptable bias), Lovet's figures, Digestly's method page, ThePawcess's pricing and its AI-generated report footer, Furbo's Vomit Alert.

**Adversarial review.** The `adversarial-reviewer` subagent was run over §5–§7 with instructions to falsify our differentiation claims. Its findings and what changed are recorded on CUL-1762 and folded into §7.

*Raw agent reports, verifier tables and the critic's checklist were working files for this session and are not committed; the issue comment on CUL-1762 summarizes them.*
