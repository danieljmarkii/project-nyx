# Culprit — Competitive Landscape & Feature Head-to-Head
**Date:** 2026-07-25 · **Method:** 11 parallel agents — 4 code-grounded product audits + 7 web-grounded market teardowns (747 tool calls, 106 competitors profiled) · **Scope:** US market

> **Status.** Session deliverable / proposed Tier-2 input. Supersedes `docs/nyx-competitive-landscape-refresh-2026-06.md` as the current read. Does **not** edit the frozen `nyx-competitive-landscape-v1_0.md`. §11 holds proposed edits for PM ratification.

**Evidence convention:** `[E]` verified with a source · `[A]` reasoned assumption · `[C]` verified in **our own code** (file:line in the underlying audit). Marketed vs. shipped separated throughout.

**What is different about this pass:** the June refresh benchmarked us against a *documented* version of Culprit that no longer matches the code. This pass re-derived our own feature set from source first, then compared. Several things the docs claim we ship, we do not — and several things we ship, the docs never recorded. The most consequential findings in this review are about **us**, not about competitors.

---

## 1. Executive summary — the seven findings that matter

**① The wedge is still unoccupied — verified harder than last time, and the verdict is unchanged.** Across ~106 players examined by seven independent researchers, **not one combines frictionless event logging + food/protein exposure capture + a deterministic statistical correlation engine + a portable clinical report.** Every player holds at most two of four. Two independent agents reached this conclusion without contact. `[E]`

**② …but our own front door to that wedge does not exist.** `diet_trials` has **zero write paths in the entire codebase** and **zero rows in production** — 18 files read the table, none writes it. An owner sent home on an elimination trial — the user CLAUDE.md says everything follows from — **cannot start one in the app.** Every trial-aware branch (Signal rank promotion, staple-washout suppression, diet-churn suppression, `getDietTrialProgress`, Ask's `dietTrialStatus` tool, the vet report's trial section) is written, tested, and dead. `[C]` **This is the single most important finding in the review.**

**③ The elimination-diet lane is not just unoccupied — it is uncontested to a degree that is hard to believe.** Across 14 direct competitors, **not one** has a diet-trial construct, a protein model, ingredient extraction, or novel-protein/contaminant logic. `[E]` Across 207 harvested US App Store pet listings, **zero** contain the strings "elimination diet", "food trial", "novel protein", or "hydrolyzed". `[E]` Meanwhile vet sources describe the elimination trial as an 8–12 week protocol whose named failure mode is *owner compliance*. A clinically-endorsed, high-intent, well-documented job with no purpose-built software.

**④ Our correlation engine is a genuine, verified, category-unique asset — and it is the thing to lead with.** It is a symptom-anchored **case-crossover** design: each symptom episode is a case, matched 1:1 to a time-of-day-matched control window from a symptom-free day, tested with **exact one-sided McNemar** on discordant pairs, **Bonferroni-corrected** over the (protein × symptom) family, with medication run through the *same* matched arithmetic as a pseudo-exposure, free-fed exposures excluded from candidacy, and thresholds calibrated by committed **Monte-Carlo false-positive property tests that overruled our own spec twice**. `[C]` Independent verdict from the market side: **"case-crossover analysis is not a claimed capability anywhere in the market"** and **"NOT ONE player has a statistical correlation engine… Everyone surfaces 'this changed'; nobody says 'because of that'."** `[E]`

**⑤ Where we are genuinely behind is not intelligence — it is table stakes and operations.** Three feature gaps recur across nearly every competitor with traction: **reminders/notifications** (we have *none* — no dependency, and the push entitlement is deliberately stripped `[C]`), **household/multi-caregiver sharing** (shipped by DogLog, Everkin, Petfetti, CompanAIn, PetNoter, Vetara; its *absence* generates 1★ reviews at rivals `[E]`), and **data export** (referenced in our own code comments as if it exists; implemented nowhere `[C]`). Operationally we have **no CI on ~430 merges, no crash reporting, and no password reset** `[C]`.

**⑥ Two moats are eroding from opposite directions, and neither is the one we defend most.** *From below*, hardware has commoditized passive capture of the exact events we ask owners to log: per-cat elimination with weight and stool-consistency classification is now table stakes and the price floor fell **$899 → $70 in nine months**; PETKIT ships automatic **cat vomit detection** this month. `[E]` *From above*, ChatGPT + camera roll now delivers label extraction, vomit/stool reads, persistent photo memory, real case-crossover statistics via Code Interpreter, and a generated vet summary — an honest estimate puts it at **~60–70% of our value over a 1–3 week acute episode, ~20–30% over an 8-week trial** `[A]`. The moat that survives both is **sustained structured capture + food identity + the clinical artifact** — notably *not* "AI".

**⑦ CompanAIn is playing a better strategic game than we are, and it is the one to watch.** It fired **both** trip-wires in the June review's watch window: a **veterinary portal free to clinics (2026-06-23)** and a **$1.0M pre-seed (2026-06-27)** `[E]`. Traction is negligible (~16 ratings), but the insight is real: **everyone else is optimizing the artifact; CompanAIn is buying the reader of the artifact.** We have no answer to that.

> **One-sentence answer:** *The full Culprit loop remains unbuilt by anyone and the elimination-diet lane is startlingly empty — but our correlation engine is currently reachable only through a front door we never built, our table-stakes gaps are wider than our differentiators are deep, and the capture half of the moat is being commoditized from both the hardware and the frontier-model side.*

---

## 2. What changed since the June 2026 refresh — trip-wires, checked

| # | Trip-wire from June | Status | Detail |
|---|---|---|---|
| 1 | **CompanAIn raises** | 🔴 **FIRED ×2** | $1.0M pre-seed 2026-06-27 **and** a free-to-clinic vet portal 2026-06-23. iOS app real (v1.0.5, 2026-07-03) but ~16 ratings. `[E]` |
| 2 | **PerkyPet AI launches** | 🟢 **DID NOT FIRE** | **Still has not shipped.** Verified two ways: Apple's Search API returns no such app; both store links on its own homepage **404**. It publishes a $12.95/mo pricing page and "Subscribe Now" CTAs anyway. Hired a Global Head of Applied AI 2026-06-25. **Treat all "PerkyPet shipped" claims as false.** `[E]` |
| 3 | **Zoetis The Pack adds AI/insights** | 🟢 **DID NOT FIRE** | Checked three ways. Latest release v0.68.4 (2026-07-02): *"Minor fixes and enhancements."* No AI language anywhere in the listing. Zoetis's 2026 AI capital went **clinic-side** — agreed to acquire teleradiology firm VitalRADS 2026-07-14. `[E]` |
| 4 | **Digitail chronic-disease trackers** | 🟢 **DID NOT FIRE** | Announced **January 2022**. Four and a half years later its own help docs (updated 2026-01-06) show a generic free-text "Diary Update" and a weight/allergy/vaccine "Health Card". No disease trackers, no AI over owner-logged data, no export. `[E]` |
| 5 | **Fi Intelligence deepens** | 🟢 **DID NOT FIRE** | No health enhancement since its 2026-03-17 launch. Fi's energy went to connectivity — **Fi Ultra** with T-Satellite/Starlink (2026-07-08). App v3.134.1: "Bug fixes." `[E]` |
| 6 | **Zoetis digitizes the Cytopoint Allergic Itch Tracker** | ⚪ **UNRESOLVED** | No evidence either way in the current listing or 140 mined reviews. **Still the highest-consequence unknown in the segment** — it targets our exact chronic-skin user. `[E]` |
| 7 | **IDEXX Investor Day 2026-08-13** | ⏳ Pending | No pre-announcements found. |

### New since June — genuinely new information

- **PETKIT AI Vomiting Detection** — an OTA update landing **July 2026** that automatically detects, records, and per-cat-attributes vomiting from camera. `[E]` Its own framing names the ceiling on owner logging: cats often eat the vomit before discovery, and multi-cat households can rarely attribute an event. **No tap-count optimization survives that comparison.**
- **Wonderdog** — **$5M pre-seed** (WndrCo, Maveron), 2026-07-08, at-home blood testing + AI companion. `[E]`
- **Elanco venture platform** — $25M, 2026-06-23. **Marley Health** — vet-facing AI biomarker platform, 2026-06-30. `[E]`
- **Tractive → Bending Spoons** closed 2026-05-18 ($900M), cut **~160 of ~300 staff**, then **IPO'd ~2026-07-02 raising $1.68B** with stated intent to pursue ~1,000 more acquisitions. Evernote precedent: an 86% price rise. `[E]`
- **Petalife** (Nestlé Purina "Unleashed" 2026 cohort) — **ships per-incident photo vision on stool, vomit AND urine** with Bristol-scale output and blood/mucus detection, plus **gait analysis from video**. `[E]` The only verified shipped analog to our vision reads.
- **ChatGPT Health** went GA to all US users **2026-07-23** — but is **human-only**; zero pet/veterinary scope found across four independent sources. `[E]`
- **Four net-new web-first wedge entrants** the June pass did not have: **thepawcess.com** ($39 one-time, purpose-built elimination-diet product with slip triage, reintroduction sequencing, household contamination control), **vetara.app**, **littlepetapp.com**, **petallergyscanner.com**, plus **itchypet.app** and **allergic.pet**. All web-only, none on the App Store, several pre-launch. **All feature claims are unverified vendor marketing.** `[E existence, LOW confidence on capability]`

---

## 3. Ground truth — what Culprit actually ships today

Re-derived from source. The PM's instinct was right: the docs drifted, **in both directions.**

### 3.1 Shipped and live (defensible in a comparison)

| Area | Reality `[C]` |
|---|---|
| **Meal capture** | **2 taps** for a repeat food (FAB → recent tile → local SQLite write, before any network). 3 taps via the full picker. Honest qualifier: 2 taps applies to the pet's **3 most-recent** foods. |
| **Correlation engine** | 8 registered detectors, 4,118 LOC, pure/no-I/O. Case-crossover + McNemar + Bonferroni; medication, free-feeding, shared-bowl and pill-in-food confounders all modelled. Deployed `generate-signal` **v25**. |
| **LLM boundary** | Narrower than we claim: **only 2 of 8** finding types ever reach a model. The other six and the dashboard summary are **template-only by hard-coded switch**. The model gets a structured payload, never an event log, and is rejected to a deterministic template on any guardrail hit. |
| **Per-incident vision** | `analyze-vomit` v9, `analyze-stool` v2 — both deployed. Recommendation enum contains **no reassuring value**; contextual flags computed **before** the model call so escalation survives a cap or a flag-off. |
| **Never-reassure enforcement** | **Structural, not lexical** — the model's free text reaches the owner *only* on the escalation path; the "monitor" path is always a deterministic template. A regex denylist was tried and measured at ~86% miss before being replaced. |
| **Vet report** | `generate-report` **v13**, live. Page-1 clinical summary + Appendices A–F. **Zero LLM calls anywhere in the report.** Honesty enforced at the *data layer*: "present-only" is a type (a "0 of N" is structurally unrepresentable), "zero doses ≠ compliant" is a state field, de-dup runs before counting, four AI states kept distinct. Correct GI bleeding anatomy (melena vs haematochezia). Concurrent-intervention confound note. |
| **Offline-first** | Genuinely local-first: push-before-pull, FK-correct ordering, parent-gated children, watermarked incremental hydration, server-time LWW, soft deletes, sign-out epoch aborting mid-flight hydration. |
| **Timestamp honesty** | `occurred_at_confidence` ∈ witnessed/estimated/window with bounds, **derived from the affordance touched, never asked as a quiz**. EXIF seeds event time with a future-date guard. Rare and clinically strong. |
| **Med-with-food safety** | A dose given in a refused/picked-at vehicle lands **UNCONFIRMED**, never auto-"given", and resurfaces. No competitor's checkbox adherence can match this. |
| **Free-feeding** | A standing fact (`feeding_arrangements`), not a fake meal, with a two-way staleness re-attest and no push. |
| **Multi-pet** | Unlimited, free, ungated. Write-time pet identity re-read at the moment of every write. |
| **Trust posture** | RLS on all 21 tables; service-role functions re-verify ownership from the JWT; EXIF/GPS stripped before photos cross to Anthropic; hard-delete cascade with Storage purge. |
| **AI cost control** | Server-enforced per-function caps with a forge-resistant counter RPC, runtime-tunable without a deploy. **A cap never blocks the record or the deterministic escalation.** |

### 3.2 Doc drift — claimed but NOT true

| Claim | Reality `[C]` |
|---|---|
| Diet-trial support | **No write path, zero rows.** The wedge has no front door. |
| "Share a link with your vet" | **Does not exist.** No code mints a `share_token` anywhere. Delivery is on-device PDF → iOS share sheet only. |
| Vet report is an "immutable snapshot" | **Nothing is stored.** Every open re-renders from live data; owner and vet can see different documents. |
| Multi-protein / "we catch hidden secondary proteins" | Captured at schema + extraction only. **The engine and the report still key off `primary_protein` alone, and all 59 live food rows are single-protein** — a "Tiki Cat Rabbit & Chicken Liver" is keyed as clean rabbit. |
| Blood-in-stool reaches Home | **Merged but NOT deployed.** Verified absent from the live `generate-signal` bundle. Blood in *vomit* reaches Home; blood in *stool* only reaches the event detail screen. |
| "Vet-validated" / CLINIC-READY | Every such verdict is from **our own `vet-report-cold-read` Claude subagent.** **No real veterinarian has ever read this report.** The spec says so itself. |
| Home Screen widget | Built, tested (67 tests), **in no distributed build.** Never observed running on a device. iOS-only by construction. |
| Barcode scanning | **No scanner, no product database.** The barcode is a third photo handed to Claude vision. |
| Severity capture | A 1–5 picker exists, blocks its own confirm button, and is **unreachable from any route.** Dead code in the hottest file. |
| Reminders / nudges | **Zero.** No dependency; the push entitlement is actively stripped. |
| Data export | Referenced in code comments as if shipped. **Implemented nowhere.** Delete works; export does not. |
| Premium / gating | **No purchase code of any kind.** Paywall is a mock and is flag-disabled. Nothing is gated today. |
| Ask | Understated in STATUS: A5–A8 all merged, `ask` deployed **v4** — but the live flag is an allowlist of **exactly one user**, with 4 total messages ever. Built and deployed, **not released.** |
| CI | **None.** `.github/` holds only a PR template. ~430 merges with zero automated checks; the only gate is an opt-in local pre-push hook. |

### 3.3 Live issues found during this audit — flagged for immediate attention

These are not competitive findings, but they surfaced here and are pre-submission relevant:

1. **`view-report` is live with `verify_jwt=false` and has no source in the repo.** Independently confirmed via `list_edge_functions`: the only unauthenticated function in the project, deployed 2026-07-06, never passed the mandated `rls-privacy-reviewer` gate. Inert today (nothing mints tokens) but it is an unowned unauthenticated path to pet health data. Tracked as B-397 "Now" since 2026-07-20. `zz-deploy-probe` also still live.
2. **`nyx-vet-attachments` is bucket-wide readable by any authenticated user** — any signed-in user can list and download another owner's prescriptions and discharge summaries. Migration 025 fixed exactly this pattern for event attachments and explicitly deferred this bucket (B-248).
3. **The public `nyx-pet-photos` bucket accepts anon writes** — `pet_photos_insert` is `TO public`, which includes `anon`, and the anon key is inlined into every client bundle. **This finding appears in no existing document.**
4. **Auth-diagnostics scaffolding ships in the release binary** (gated against Jest, not `__DEV__`), reachable via an 800ms long-press on the settings version footer.
5. **A first-run user alert leaks dev jargon and the dead brand name:** *"Make sure the nyx-pet-photos storage bucket exists and has upload policies."*

---

## 4. Head-to-head — Matrix A: capture & intelligence

**Legend:** ✓ real · ◐ partial/weak/marketed-not-verified · ✗ absent · ? unverified

| Player | Fast repeat log | Food identity (brand/protein) | Per-incident AI vision | **Statistical correlation** | Reminders | Household sharing |
|---|---|---|---|---|---|---|
| **Culprit** | ✓ 2 taps, offline | ✓ photo→AI extraction | ✓ vomit + stool | ✓ **case-crossover** | ✗ | ✗ |
| Zoetis The Pack | ◐ preset categories | ✗ | ✗ | ✗ | ✓ | ◐ (complaints) |
| CompanAIn | ◐ log + doc ingest | ✗ | ✗ | ✗ (LLM-over-record) | ✓ | ✓ |
| Petalife | ◐ | ✗ | ✓ **stool+vomit+urine+gait** | ✗ | ? | ? |
| Everkin | ◐ | ✗ | ✗ | ◐ *markets* it, mechanism undisclosed | ✓ | ✓ (auto-expiring) |
| DogLog | ✓ fast | ✗ | ✗ | ✗ | ✓ | ✓ mature, at scale |
| Petfetti | ◐ 17+ log types | ✗ | ✗ | ✗ | ✓ | ✓ (5 people) |
| ItchyPet | ◐ web-only | ◐ | ✗ | ◐ lagged, undocumented | ? | ? |
| ThePawcess | ? | ◐ AI label scan | ✗ | ◐ claimed | ? | ✓ claimed |
| Dutch | ✗ | ✗ | ◐ roadmap | ✗ | ✓ | ✗ |
| Fi Intelligence | ✗ passive | ✗ | ✗ | ✗ (behaviour classifier) | ✓ | ✓ |
| Maven Pet | ◐ manual + HW | ✗ | ✗ | ✗ (biometric baseline) | ✓ | ? |
| PETKIT / Petlibro / Whisker | ✓✓ **passive, zero taps** | ✗ **grams only** | ◐ stool consistency, vomit (July) | ✗ | ✓ | ✓ |
| Digitail Pet Parent | ◐ free-text diary | ✗ | ✗ | ✗ | ✓ | ✓ |
| IAMS PoopScan (Mars) | n/a | ✗ | ✓ **published: 90% acc., 14k labelled images** | ✗ | n/a | n/a |
| ChatGPT + camera roll | ✗ expects prose | ◐ ad-hoc | ✓ often good | ◐ **real stats if you keep a table** | ✓ scheduled tasks | ✗ |
| PerkyPet AI | — | — | — | — | — | — *(has not shipped)* |

## 5. Head-to-head — Matrix B: output, safety, business

| Player | Vet artifact | AI-authored? | Portable to *any* vet? | Clinical safety posture | Core care free? |
|---|---|---|---|---|---|
| **Culprit** | ✓ clinical HTML + PDF, appendices A–F | **✗ — zero LLM in the report** (a *feature*) | ✓ PDF, no account | ✓✓ n=1-never-reassures, **structurally** enforced | ✓ everything free today |
| Zoetis The Pack | ✓ owner-curated report | ✗ export | ✓ | ✗ | ✓ (drug-rebate subsidised) |
| CompanAIn | ✓ + **vet PORTAL** | ✓ (LLM) | ◐ portal needs clinic enrolment | ◐ has a reassuring "Low Concern" tier | ✗ $11.99–$54.99/mo |
| Dutch | ✓ 500-datapoint brief | ✓ | ✗ **walled to Dutch's own vets** | ◐ real vets | ✗ membership |
| Petalife | ✓ PDF | ✓ | ✓ | ◐ outputs "personalized nutrition recs" — **Purina-backed** | ◐ |
| Maven Pet | ◐ 1-month report | ✗ | ✓ | ◐ alert-only | ✗ HW + sub |
| Fi | ◐ 30-day/52-week PDF | ✗ | ✓ | ◐ chat reassures | ✗ $199+/$189yr, dog-only |
| Digitail | ◐ in-PIMS | ◐ | ✗ clinic-gated | ? | ✓ (clinic pays) |
| Petfetti / PetNoter / DogLog / 11pets | ◐ PDF/data dump | ✗ | ✓ | ✗ | ◐ mixed |
| Tractive | ✗ **none** (900k+ subs) | — | — | — | ✗ |
| ChatGPT | ◐ prose, no provenance | ✓ | ✓ | ✗ **uncalibrated both ways** | ✓ |

**The two columns nobody fills:** a **real statistical correlation engine** and a **defensible clinical-safety posture**. Every rival misses at least one of the two hardest layers — the same conclusion as June, now verified against 106 players instead of asserted.

---

## 6. Where we are winning

Ranked by defensibility.

1. **The correlation engine — genuinely category-unique.** Verified negative across the whole market: no competitor runs a deterministic statistical correlation engine; case-crossover is not a claimed capability anywhere. `[E]` **Name the design, not "AI"** — "AI" is a crowded, cheap word on this shelf (13+ AI symptom-checker listings, the largest with 25 ratings). A competitor's data scientist will look for a pooled/unmatched test; we don't have one.
2. **A vet report that cannot hallucinate.** Zero LLM calls in the artifact. Against a category where *everyone* now ships a "vet-ready PDF" and several ship AI-authored summaries, "no generated text in the clinical document" is the differentiator that actually matters to a clinician. Independent finding: **a vet report is now a commodity — what is in it is not.** `[E]`
3. **Clinical safety as architecture, not copy.** Enum with no reassuring value; escalation computed before the model call so it survives a cap; the model's words only reach the owner on escalation. Rivals are actively on the wrong side: CompanAIn/Nuzlo/Auddl ship reassuring lowest-tier buckets; VetPati advertises "a complete AI diagnosis report in seconds". `[E]`
4. **Independence.** Zoetis's app is a pharma loyalty vehicle (points on Apoquel/Cytopoint purchases); Petalife is Purina-backed and outputs "personalized nutrition recommendations"; IAMS PoopScan is Mars. **None can credibly name a sponsor's food as a culprit.** We can. This is a positioning advantage no strategic-backed app can copy — and it is *literally our product name.*
5. **Food identity.** Every passive intake device measures **grams and is blind to brand, protein and ingredients.** `[E]` A feeder can tell you the cat ate 42 g; none can tell you the duck kibble also contains chicken by-product meal. This is the permanent hardware gap.
6. **Offline-first capture.** A real local-first system, not a thin Firebase client. Most rivals fail or spin offline.
7. **Timestamp-uncertainty capture.** ~65% of our events are *discovered*, not witnessed; competitors force a single precise timestamp. Strong Dr. Chen-facing claim.
8. **Free core with code behind it.** No purchase code exists; a cap gates the model call, never the record or the escalation. Rivals paywall exactly the clinical layer — Everkin paywalls the vet PDF, 11pets paywalls multi-pet, PerkyPet paywalls vet data-sharing at $12.95/mo/pet.

---

## 7. Where we are behind

Honest, ranked by how much it costs us.

1. **No front door to the wedge (diet trials).** Not "behind a competitor" — behind *ourselves*. Highest-value fix in the product.
2. **No reminders or notifications of any kind.** Table stakes across the entire category. This is probably the single largest feature-parity gap, and for a logging product it is also the retention mechanism.
3. **No household / multi-caregiver sharing.** Shipped by DogLog, Everkin, Petfetti, CompanAIn, PetNoter, Vetara; its absence generates 1★ reviews at rivals. It is *also* the fix for the worst diet-trial contaminant — the unwitnessed treat from a spouse. B-292 is a competitive gap, not a roadmap nicety.
4. **No vet-side surface at all.** CompanAIn is buying the *reader* of the artifact while we optimize the artifact. Our report is one-way: the vet reads it and discards it. No feedback loop, no persistence, no relationship.
5. **The multi-protein promise is not delivered where it counts.** Extraction emits the set; the engine and report still use `primary_protein`, and every live row is single-protein. **For an elimination-trial product this is the substance of the wedge** — a rabbit-and-chicken food currently reads as clean rabbit.
6. **No published validation.** IAMS PoopScan publishes 90% accuracy on 14,000+ expert-labelled images with a 10-expert panel; Vet-AI/Joii publishes 65k vet-labelled images. We publish nothing, and **no real vet has read our report.** Our rigor is real but invisible.
7. **No passive capture story.** Not a gap to close by building hardware — but we need an answer when an owner asks "why log when my litter box does it?" (Answer: the box sees one box; vomit on the stairs, the spouse's treat, and the food's identity are all invisible to it.)
8. **Operational maturity is close to zero.** No CI on ~430 merges, no crash reporting (a production crash is a silent white screen), no password reset (the first user who forgets is locked out permanently), no data export. Reliability — not features — is what kills apps in this category: the dominant negative-review theme everywhere is crashes, lost data and botched migrations.
9. **Platform reach is one platform.** iOS-only in practice, English-only, no dark mode, no tablet, no web. Android has config scaffolding and no evidence of a build.
10. **Two things we say we have, we don't:** the widget (built, never on a device) and Ask (deployed, allowlisted to one user). Both are real work; neither is shippable copy yet.

---

## 8. The three real strategic risks

**Risk 1 — capture commoditization from below (12–24 months).** Passive elimination capture at $70; PETKIT vomit detection this month; a Feb-2026 *Journal of Feline Medicine and Surgery* paper validating connected-feeder + connected-litter-box baselines as a detection substrate. `[E]` **The structural limit that protects us:** hardware coverage is *device-shaped*, not *home-shaped*. A box sees one box; a feeder sees one bowl; a camera sees one frame. Owner logging is the only capture surface that follows the pet. **But the mitigation is to stop selling capture speed as the moat.**

**Risk 2 — the intelligence layer is already commoditized (now).** 34% of US owners say their first instinct on illness is to search online or use AI; 80% research symptoms online first. `[E]` **We should assume the owner asks ChatGPT first and design for the moment after that answer fails** — "you still don't know if it's the chicken." Do **not** claim "AI falsely reassures owners": the evidence is two-sided (ChatGPT under-triaged 51.6% of human emergencies in a Mount Sinai/*Nature Medicine* study, but **over**-triaged ~60% of non-urgent veterinary cases in a Jan-2026 *Veterinary Record* study). The truer and stronger claim: **AI pet triage is uncalibrated in both directions and reasons from a single unstructured snapshot with no denominator — it cannot tell you this is the fourth vomit in nine days, because it was never given the first three.**

**Risk 3 — distribution asymmetry (permanent).** PetDesk ~490K iOS ratings; Chewy 1.1M; myVCA 39K + 500K Android. Several could ship a symptom log in a quarter and reach more owners on day one than we will reach in years. `[E]` The mitigating fact: **vet-side owner-health announcements have a documented ~4-year delivery failure rate** (Digitail's chronic trackers announced 2022, still absent 2026). Treat every such announcement as marketing until a binary confirms it.

**The one genuinely good piece of news on distribution:** pet-side interoperability does not exist — no HL7/FHIR equivalent, no mandate, 100+ EMRs, records legally owned by the practice, and ezyVet charges write-back access fees. `[E]` **A self-contained PDF the owner controls and no vendor must approve is not a fallback — it is the only route that scales.**

---

## 9. App Store positioning (submission-relevant)

- **The shelf is thin and stale.** Apple's Search API returns *games* for "cat vomiting", human calorie counters for "elimination diet tracker", and GPS/training apps for "dog itching". No pet health app charts in the top 100 free of Medical, Health & Fitness or Lifestyle. `[E]`
- **Ownable keywords today (zero competing listings across 207 harvested):** elimination diet dog/cat · food trial · novel protein · hydrolyzed diet · dog food sensitivity · cat vomiting tracker · dog itch tracker · diet trial tracker · food allergy diary. **Caveat: search *volume* for these is unverified** — an uncontested keyword with negligible volume is not an opportunity. Close this with Apple Search Ads keyword-volume data before investing.
- **Unwinnable:** "pet health record" (PetDesk, 490K ratings), "pet medication tracker", "pet symptom tracker".
- **Ratings in this category are actively misleading.** Zoetis shows 4.9★/8.5K but a 142-review-text analysis reads **3.2/5 with 49 one-star reviews** citing crashes and failed data entry; the rewards program prompts engaged users to rate. `[E]` Don't benchmark against the star number.
- **Pricing:** $4.99/mo + $39.99/yr sits **dead centre** — $39.99/yr is the modal annual price, hit independently by four rivals. `[E]` **New consideration for the PM:** a diet trial is a *bounded* 8–12 week job, and the products aimed at it price accordingly (ThePawcess $39 one-time; VetReady $4.99 lifetime; Voyage $29.99 lifetime). A monthly subscription asks a user to keep paying after the trial resolves. This is a genuine tension with D-M5's monthly-forward ruling.
- **The sharpest warning, from the human analog.** A 2★ review of Bearable: *"It requires me to fill out dozens and dozens of symptoms… That would be perfectly OK if I felt that I was getting good or even average interpreted information… after two years I have concluded that it is not worth my time."* `[E]` **A correlation product dies when capture cost exceeds interpretive payoff.** Our 10-second log and our engine returning a *named* finding are not two features — they are the two halves of the only defence against that review.
- **Owners are already asking rivals for our roadmap.** A DogLog 5★ review: *"Suggestions: a widget option pls for quick logging and or Siri logging."* `[E]`

---

## 10. Recommendations

**Do before submission (days):**
1. **Build the diet-trial front door.** Even a minimal create/end-trial surface. Everything downstream is already built and currently dead. Highest value-per-hour in the product by a wide margin.
2. **Close the three live security items** — delete `view-report` + `zz-deploy-probe`, owner-scope `nyx-vet-attachments`, fix the anon-writable `nyx-pet-photos` INSERT policy.
3. **Password reset**, remove the diagnostics long-press from release, fix the `nyx-pet-photos` dev-jargon alert.
4. **Add a ~20-line CI workflow** (tsc + jest). 430 merges with zero automated checks is the soft spot any technical diligence finds first.
5. **Deploy the merged-but-undeployed engine changes** (stool red flag, protein canonicalizer) or explicitly accept the gap.

**Do before making competitive claims (weeks):**
6. **Get a real vet to read the report.** The PM action item has been open since 2026-07-02. Every "CLINIC-READY" verdict we hold is one Claude persona reviewing another's output. Until then we cannot say "vet-validated" — and it is the one claim rivals cannot fake.
7. **Ship multi-protein through to the engine and the report** (slices 4–6 + the B-416 re-extraction). It is the substance of the elimination-trial wedge.
8. **Reminders.** Table stakes, retention mechanism, and gated behind a Principle-4 open question that has been open since 2026-07-10. Resolve the question.

**Positioning (immediate, free):**
9. **Lead with the artifact and the finding, not "AI".** "AI" is cheap on this shelf. Lead with: *we compute the pattern statistically, then have a model say it in one sentence — and reject the sentence if it drifts.*
10. **Own independence explicitly.** Zoetis is a drug loyalty app, Petalife is Purina, PoopScan is Mars. *"The only one that can tell you the culprit is the food you're being sold."* The product name already does this work.
11. **Retire the "AI falsely reassures" line** in favour of the two-sided uncalibrated framing, and use the owner-indicting stat instead of a vet quote: **25% of US owners say they delayed or avoided a vet visit because they relied on online/AI information first, and later regretted it** (Lovet 2026, Censuswide, n=2,000). `[E]`

**Strategic, for PM decision:**
12. **Do we need a vet-side surface?** CompanAIn is buying the reader. A minimal "vet opens the report, can respond once" loop may be worth more than several owner-side features. Currently we have no design for this.
13. **Pricing shape** — bounded-job one-time SKU vs. monthly subscription (§9).

---

## 11. Proposed Tier-2 edits (for PM ratification — NOT written in)

1. Mark `nyx-competitive-landscape-refresh-2026-06.md` superseded by this file; keep both as dated artifacts (🧊 frozen, per the living-vs-frozen rule).
2. **Correct the record on PerkyPet AI** — it has *not* shipped; both store links 404. Any doc treating it as live is wrong.
3. **Downgrade** Zoetis, Digitail and Fi from the June threat levels — all three trip-wires verified as non-events.
4. **Promote CompanAIn to watch-list #1** with the vet-portal + pre-seed facts.
5. **Add PETKIT / Petlibro / Whisker as a named passive-capture segment**, and Petalife as the first shipped per-incident-vision analog.
6. **Add the §3.2 doc-drift table to STATUS.md** as a standing "claims we cannot make" list.
7. Backlog candidates: diet-trial front door (P0) · household sharing (B-292, re-prioritise to Now) · CI workflow · vet-side response loop · published-validation program.
8. New Open Question: **do we build a vet-side surface, or stay a one-way artifact?**

---

## 12. Persona conflict — unresolved, needs a PM call

> **Dir. of Engineering / Data Scientist:** The engine is the moat and it is verified unique. Ship the diet-trial front door, finish multi-protein through to the report, and the differentiator becomes reachable. Table-stakes features are commodity work any competitor can also do; the engine is not.
>
> **Designer / Jordan / Product Owner:** The engine is unreachable by a new owner for weeks and invisible when it fires on healthy data. What owners actually buy — verified in the traction data — is convenience and coordination: Zoetis ~250k downloads with zero AI, DogLog 100k+ with zero AI, versus every AI-forward player in single or double digits. **Reminders and household sharing are the acquisition and retention story; the engine is the reason they stay by month three.**
>
> **PM decision needed:** after the security/submission fixes, does the next block of work go to **the wedge front door + multi-protein** (make the differentiator reachable) or **reminders + household sharing** (close the table-stakes gaps that drive acquisition)? Both are correct; the sequencing is a real call and this review does not resolve it.

---

## 13. Research debt

1. **No competitor app was installed.** Every capture-friction rating is inferred from review text and listings. A hands-on pass on DogLog, The Pack, Everkin, Petfetti and Petalife would materially sharpen Matrix A.
2. **Everkin's automatic food→symptom correlation claim is the highest-value unresolved question** about a shipped iOS competitor. Statistical engine, heuristic, or copy? Unknown.
3. **ThePawcess, ItchyPet, Vetara, LittlePetApp, PetAllergyScanner** — all ratings rest on vendor marketing alone. ThePawcess is rated MED-HIGH on copy only; validate hands-on ($39) before it enters a head-to-head.
4. **Keyword search volume** for the ownable terms — unmeasured, and it gates the ASO recommendation.
5. **The Zoetis Cytopoint itch-tracker trip-wire** remains unresolved and is the highest-consequence unknown.
6. **Android and Google Play were not examined** at all.
7. **Reddit demand-signal task only partially completed** — tool-level blocks; the one successful batch was 14 months stale.
8. **No funding data was freshly verified** (Crunchbase/PitchBook inaccessible); June figures carried forward as prior research.
9. One agent lost its entire WebSearch budget before its first call and worked via WebFetch proxies only — its Android and press coverage is thinner than the rest.

*Method note: 106 players profiled across 7 segment agents; 4 code-audit agents worked from source with instructions to treat docs as unreliable. Load-bearing internal claims (diet_trials write paths, `view-report` exposure, generate-report version) were independently re-verified in this session before publication. Two prior-review hallucinations were caught and excluded by design — every competitor claim required a live store listing or first-party source.*
