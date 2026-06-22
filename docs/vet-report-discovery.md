# Vet Report — Product Discovery Synthesis (Build Step 9 foundation)

**Status:** Discovery synthesis — NOT a build-ready requirements spec. | **Date:** 2026-06-21 | **Round:** Synthetic (persona role-play); the ranked Research Debt in §10 is the **gate of real-vet validation before the requirements spec locks.**

> **Updated 2026-06-21 — PM QA review (leans recorded inline; await formal ratification at the requirements-spec session):**
> - **Audience → banded both-sides** (clinical-first report with a "for the owner" section above) — the owner also keeps their separate Patterns analytics; the vet gets a familiar clinical document (§6.3, §8.1).
> - **Delivery → HTML/webview-first**, derive the PDF later (easier to iterate; PDFs are finicky) (§7.2, §8.2).
> - **Audience is a distribution channel, not a layout** — swing for the fences, don't let scope-trimming hollow out the two-sided design (§5.4, §8.1).
> - **Specialist panel → its own PR-evolvable doc**, not embedded in `personas.md` (§3.2, §8.8).
> - **Diet-detail depth → deferred to Dr. Chen + the specialist-panel roundtable** (§5.4, §10 R7).
> - **B-028 can be kicked off in parallel now** (§8.7, §9); the report is **explicitly owner-accessible** (§6.4).
> - **Keep the report SOAP-adjacent** (PM endorses; §4.3, §10 R6).
> - New future scope logged: **B-145** vet-visit document capture. Data-quality fix to insight I1 + a flagged inconsistency in `nyx-research-v1_0.md` (§5.3, §11).

> This document is the single deliverable of the discovery round defined in `docs/vet-report-discovery-PROMPT.md`. It ends in *decidable* Open Questions (§8), prioritized Recommendations (§9), and a ranked Research Debt list (§10). It writes no code, schema, or requirements spec, and proposes — but does not write — Tier-2 edits to `personas.md`, the technical spec, and the competitive-landscape doc (collected in §11).
>
> **Prior-art finding (sweep done first):** there is **essentially no prior art beyond spec §7.** `app/report.tsx` is a placeholder ("coming in build step 9"); `lib/pdf.ts` is a 28-line client stub that invokes a not-yet-existent `generate-report` Edge Function and returns `{ shareToken, shareUrl, storagePath }`; no report Edge Function exists; the `vet_reports` table + RLS already exist and are correct (migration 001). So this round designs from a clean slate against decided *architecture* (server-side render, share token, 30-day expiry, public read-without-account) — not against existing report design.

---

## 1. Purpose, scope, outcome & success definition

### 1.1 Purpose
Lay the product foundation for the vet report — the clinical payoff of everything Nyx logs, and the surface where the brand promise ("vets cannot diagnose what they cannot measure") is either kept or broken.

### 1.2 The desired outcome (the root of everything below)
The hypothesis we were handed, refined:

> **v1 succeeds when a GP vet, handed this report for a diet-trial or GI-symptom patient she has never met, can answer the report's clinical question in under 60 seconds and trust it enough to let it inform what she does in the encounter.**

Two refinements to the starting hypothesis:
- **"Trust enough to inform the encounter"** is sharper than "trust." A report can be believed and still be useless (a true data dump). The bar is *action*: it confirms or changes a clinical decision — continue/adjust the trial, order/defer a test, shift a differential.
- **The unit is the wedge, not "pet health."** v1 serves the reactive-tracking owner on a diet trial or symptom-monitoring directive (CLAUDE.md primary wedge; research §1 "clinical wedge"). The report answers *their* clinical question, not every question.

**Pets > $:** the report is care, always free (Principle 7). It is never a conversion surface, and nothing in this document treats it as one.

### 1.3 Candidate success signals (→ carried to Open Question §8.9)
"How would we know v1 worked?" must be answerable. Three candidates, in trust order:

| # | Signal | What it measures | Measurability tension |
|---|---|---|---|
| **S1** | The vet **acts on** it (continues/adjusts the trial, orders/defers a test) | The true value prop | Hard pre-PMF — needs a vet-feedback channel we don't have yet |
| **S2** | The vet **orients in ≤60s** without the owner narrating | The cold-read precondition for S1 | Testable now via `vet-report-cold-read` + real-vet timing |
| **S3** | The vet **wants it again** ("bring this next time") | The flywheel leading indicator (research §2 passive-distribution play) | Owner-reported proxy; instrument via B-047 |

S2 is the build-time acceptance bar (it's exactly what the `vet-report-cold-read` subagent measures). S1/S3 are the outcome bars that need the real-vet channel.

### 1.4 Out of scope for this discovery
Writing the requirements spec; choosing the render library (a follow-up engineering spike — now B-144); any code/schema/migrations; editing `personas.md`, the technical spec, or the competitive/research docs (proposed edits flagged in §11, not written); pre-deciding the audience question (it is a strawman axis resolved by the §6 critique → §8.1 for PM ratification).

---

## 2. Current state + the must-carry inventory *(Workstream A — Priority 1)*

### 2.1 Decided architecture the report must inherit (don't re-litigate)
From spec §7, the schema, and architectural decisions:
- **Server-side render** via a Supabase Edge Function (the to-be-built `generate-report`); never client-side. Reference query **[4]** in `schema.sql` is the data-pull target.
- **Share by token, no vet account:** `vet_reports.share_token` (UUIDv4) + `token_expires_at` default `NOW() + 30 days`; link `nyx.app/report/{share_token}`. RLS: owner `FOR ALL` via `generated_by`; public `FOR SELECT` gated on `share_token IS NOT NULL AND token_expires_at > NOW()`.
- **Immutable record:** a `vet_reports` row is a snapshot; no updatable content fields.
- **Free forever** (Principle 7); **clinical-grade, not branded** (Principle 6); **scannable in 60s** (Principle 6 test).

### 2.2 Committed consumers — already built, explicitly gated on Step 9 (treat as requirements, not options)

| Item | What the report MUST carry | Source / exact mandate |
|---|---|---|
| **B-117 PR 10** | A **"Current medications"** section (per-regimen: drug, strength, dose, route, frequency, indication, start date) + a **one-line computed adherence summary per drug** from logged doses — e.g. *"Given consistently (28/28 logged doses)"* / *"Some doses missed (24/28; 3 missed, 1 refused June 8–10)."* A regimen with **zero logged doses reads "adherence not tracked," never "compliant."** | `nyx-medication-logging-requirements.md` §7 |
| **B-040** | **Free-fed / continuously-available food rendering carrying the verbatim string "Intake not directly observed."** Absence of logged intake must **never** render as "didn't eat." | `nyx-free-feeding-requirements.md` §6 |
| **B-102 PR 6** | A **distinct, scannable human-food line** — *"owner supplemented with human food N× this period"* — because human food is the **#1 diet-trial confounder.** `vet-report-cold-read` is a mandatory gate. | `human-food-format-requirements.md` PR 6 |
| **B-023 PR 5** | A **"Share with my vet"** bridge from the Patterns dashboard that assembles **this** report (default range: since last vet visit, else 30d). **Clinical content is the report's, not the dashboard's** — warm owner cards and owner-only n=1 reads **never** leak onto the clinical export. | `nyx-analytics-dashboard-requirements.md` §9 |

### 2.3 The rest of the report-relevant inventory + the clinical trap if mis-rendered

| Item | What it is | Why the report must represent it honestly · the trap |
|---|---|---|
| **B-010** timestamp confidence | Option C: `occurred_at_confidence` (`witnessed`/`estimated`/`window`) + nullable earliest/latest | **Never a bare point for a discovered event.** Trap: a vomit logged 07:42 but occurring ~04:00 moves symptom→meal latency from ~40 min (post-treat) to ~3.5 h — *dietary indiscretion vs bilious vomiting syndrome*, a different workup. Dr. Chen prefers *"found 07:42, occurred ~04:00–07:42"* over false precision. (`research/2026-05-event-timestamp-uncertainty.md` §4) |
| **B-028** editable AI structured fields | The per-incident vomit fields shipped **read-only**; the editable layer is **still Open** | A mis-read field (e.g. *"Blood: none"*) would feed the report with **no way to correct it.** The report must not render an uncorrectable AI-derived field as fact — gate on B-028 or render owner-confirmed fields only (→ §8.7). |
| **B-115** protein-exposure over-count | `computeTopProteins` ranks by raw feeding count; same-timestamp treat re-logs inflate rank | This card **bridges to the report**, where **overstating a confounder's prevalence is the wrong headline for a diet-trial owner.** Carries a PM/Data-Scientist decision — must resolve before a "top protein/confounder" line ships (→ §8.6). |
| **B-044** vet-visit attachment sync / migration drift | `003_attachments.sql` only partially applied; `vet_visit_attachments` + `food_items.photo_path` likely absent server-side | A **migration-drift blocker** for Step 9: the report scopes "since last visit" off `vet_visits` and may surface vet-visit context. Priority **Now**. |
| **Standing rule** | n=1 per-incident AI reads (`analyze-vomit`) | **Owner-facing only — never on the vet report.** A single-sample read may escalate on the *presence* of a red flag, never reassure on *absence*; the report is a multi-sample artifact and must not inherit n=1 reads. |
| **AI-Signal rigor tiers** | `Early` (provisional) vs `Established` (vet-report-grade) | Only **Established, multi-sample, denominatored, associational** correlations are report-grade. `Early` patterns are owner-side; putting them on the report would imply rigor the data lacks (→ §8.5). (`nyx-ai-signal-requirements.md`) |

### 2.4 The scoping question this raises (→ Open Question §8.3)
**What populates a given report, and who controls it?** Options: a fixed window · an owner-chosen date range · auto-scoped to the active diet trial · "since last vet visit." This is the single most consequential IA decision because *the window defines the denominator*, and the denominator is the thing Dr. Chen trusts.

---

## 3. Specialist vet panel *(Workstream B — proposal; light & early)*

A panel of specialist lenses that **rotates per question**, layered on top of the always-on Dr. Chen (GP). Proposed here; **per PM decision this is a proposal inside this doc — `personas.md` is not edited** (formalizing it is a Tier-2 PM call, §11).

### 3.1 Composition
| Lens | When it rotates in |
|---|---|
| **Dr. Alex Chen — GP (always on)** | Every report decision; owns the 60-second-scan / "would I trust this for a patient I haven't met" bar |
| **GI / internal medicine** | The wedge — diet trials, chronic enteropathy, vomiting/diarrhea trend semantics. **Default rotation for v1.** |
| **Board-certified veterinary nutritionist (DACVN)** | Diet section, WSAVA diet-history completeness, confounders (treats, human food, flavored meds). **Default rotation for v1.** |
| **Dermatology** | Skin/allergy elimination trials (8–12 wk; #1 dog claim) — the report's other major trial type |
| **Emergency / criticalist** | The escalation lens — when does the *frequency/trend* on a report imply urgency; the feline 48h intake danger window |
| **Behavior** | Appetite/anxiety vs disease ambiguity (composes with intake-decline) |
| **Vet tech / nurse** | Who physically receives the phone/printout; triage and handoff workflow |
| **Practice manager (PIMS/workflow)** | Discharge-sheet distribution, whether/how a handed-over report is archived into the PIMS |
| **The skeptical / adversarial GP** | (Workstream D) distrusts owner-collected data, fears liability, won't change workflow — runs against every strawman |

### 3.2 How rotation works & how it composes
- **Rotation = per clinical question / report section**, pulled in as an in-context lens; v1's standing rotation is **GI internist + nutritionist + skeptical GP** (the wedge + the trust attack). Keep it light — no rotation taxonomy to build.
- **Composition with existing mechanisms:** the panel are **personas** (in-context lenses for discovery/design). Dr. Chen (persona) stays the always-on GP lens. The **`vet-report-cold-read` subagent** remains the *isolated acceptance gate* on the **rendered** artifact — the panel informs design; the subagent gates the build. No overlap: lenses shape, the subagent judges.

**→ Tier-2 PM decision (§11). PM lean (QA 2026-06-21):** formalize this panel into **its own PR-evolvable doc** (e.g. `docs/vet-specialist-panel.md`) that grows and is kept current via PRs over time — *not* embedded as a sub-roster inside `personas.md`. `personas.md` + the persona-routing table cross-reference it (so routing still points there), but the panel's depth lives in a file that can evolve independently. Flagged, not written.

---

## 4. Competitive teardown — the vet-report angle *(Workstream C — extends the baseline)*

`nyx-competitive-landscape-v1_0.md` is authoritative and not rewritten here. This extends it for the **vet-report angle** with cited research; gaps are logged as Research Debt (§10).

### 4.1 Direct pet-health apps — what they export *to a vet*
A **new crop of indie trackers** (post-dating the May-2026 landscape doc) now advertise vet-facing export — this is the material change:

| App | What it exports to a vet | Format / delivery |
|---|---|---|
| Vet Record: Pet Health Tracker | "complete medical records" + shared symptom log as a "professional PDF" | PDF, share direct to vet (premium) |
| Vettie | "professional PDF health reports for vet visits" + CSV | PDF + CSV, email/AirDrop |
| Petfetti | "fully customizable PDF reports" of complete health data | PDF |
| PetDocs / PetVitality | "vet visit summaries to share," doc-scan to PDF | PDF |

**Finding (steal/avoid):** **"export a PDF to your vet" is becoming table stakes**, but every one of these exports a **record dump / digital filing-cabinet** — chronological history, vaccines, weights. **None answer a clinical question** ("is the trial working?"), **none carry denominators, statistical rigor, timestamp/intake honesty, or a synthesized trend.** [EVIDENCE: App Store / Google Play listings, 2025–26]
→ **Nyx's differentiation moves up a layer:** not *that* it exports, but that it exports a **synthesized clinical answer** a vet can act on in 60s. The earlier landscape framing ("AI-generated vet summaries designed for appointment-time use — not yet built by anyone") still holds; the export-to-PDF commodity does not threaten it.

### 4.2 General-purpose tools owners actually use (the real incumbents)
Spreadsheets, Notes, camera roll, paper, and **pasting history into ChatGPT** remain the true incumbents (research §1 compliance data: 53% of owners can't name the diet mid-trial; the failure is friction, not apathy). The bar to beat is "a screenshot of the Notes app" — low on rigor, but *zero friction and instantly legible.* Our report must be as legible and nearly as frictionless. [EVIDENCE: research §1; ASSUMPTION on ChatGPT-paste prevalence → Research Debt §10]

### 4.3 Vet-side software — what vets receive & ingest today
- **SOAP is the lingua franca** (Subjective / Objective / Assessment / Plan); it's how every clinical encounter is documented and how referrals/handoffs are structured. [EVIDENCE: veterinary SOAP-note sources, 2024–26]
  → **Design implication:** the report maps cleanly onto **S** (owner-reported observations) and the owner-measured slice of **O** (frequencies, weights, intake) — and must **explicitly NOT** produce **A/P** (assessment/plan). A/P is the vet's job *and the liability line.* A report that "diagnoses" fails both Dr. Chen's trust and the safety invariant.
- **WSAVA Short Diet History Form is the clinical gold standard** for diet intake: brands + product names + amounts of **all** foods, treats, snacks, dental chews, rawhides, **foods used to give medications**, and supplements, over a 24h picture, plus who feeds. [EVIDENCE: WSAVA Global Nutrition Toolkit / Diet History Form]
  → **The diet section should read as a superset of the WSAVA form.** This is a concrete, citable target the nutritionist lens endorses.
- **No veterinary FHIR/HL7 standard is in widespread use.** FHIR nominally spans veterinary but isn't adopted; the UK's **Vet-XML attempt did not become a standard**; PIMS vendors each define proprietary structures and rely on point-to-point integrations. [EVIDENCE: veterinary-interoperability sources, 2025–26]
  → **This directly reshapes Workstream F:** a "PIMS/EHR-ingestible structured format" has **no standard to target** in vet medicine. Structured export is a bespoke, per-PIMS effort — a post-PMF partnership play, not a v1 format.

### 4.4 Human-medicine analogs (the aesthetic & trust baseline to beat)
- **After-visit summary (AVS) research:** clinicians value summaries but flag **content prioritization, formatting, accuracy, and workflow fit** as the make-or-break axes. [EVIDENCE: PMC AVS qualitative study]
- **Patient-generated health data (PGHD) research:** clinicians are **often not receptive** to patient-collected data shared on the patient's initiative; what makes PGHD usable is **pre-digested, synthesized, prioritized** insight and **clarity on what's clinically relevant** — not raw logs. [EVIDENCE: PMC PGHD review]
  → This is **direct evidence for the skeptical-vet persona** (§5) and for the design hypothesis: **synthesize, don't dump.** The "Sigma-Aldrich certificate-of-analysis" aesthetic (analytical but ugly) is the baseline our design aims to beat — credible *because* it's plain, but we can be plain *and* well-ordered.

**→ Tier-2 proposed edit (§11):** add the §4.1 indie-app crop + the §4.3 no-vet-FHIR finding to `nyx-competitive-landscape-v1_0.md`. Flagged, not written.

### 4.5 Sources (external research, this round)
- WSAVA Global Nutrition Toolkit & Short Diet History Form — https://wsava.org/wp-content/uploads/2021/04/WSAVA-Global-Nutrition-Toolkit-English.pdf · https://wsava.org/wp-content/uploads/2020/01/Diet-History-Form.pdf
- Veterinary SOAP notes (structure / referral handoff) — https://co.vet/post/vet-soap-notes/ · https://www.vetmed.wisc.edu/wp-content/uploads/2019/07/soapwriting.pdf
- Indie pet-health apps with vet-facing PDF export — Apple App Store / Google Play listings (Vet Record, Vettie, Petfetti, PetDocs, PetVitality), 2025–26
- Veterinary data interoperability / no vet FHIR-HL7 standard — https://www.puppilot.co/blog/veterinary-data-interoperability-the-complete-guide-to-connecting-pims-labs-insurers · https://priorknowledgeandpractice.substack.com/p/the-three-layers-of-veterinary-software
- After-visit summary design (clinician perspective) — https://pmc.ncbi.nlm.nih.gov/articles/PMC7651937/
- Patient-generated health data & clinician receptiveness — https://pmc.ncbi.nlm.nih.gov/articles/PMC10971637/

---

## 5. Discovery synthesis *(Workstream D — Continuous Discovery; SYNTHETIC)*

These interviews are **synthetic persona role-play.** Every non-obvious claim is tagged **[EVIDENCE]** or **[ASSUMPTION]**; assumptions are ranked in §10 (the spec gate). Disagreement is surfaced via the Persona Conflict Protocol (§5.4), not resolved.

### 5.1 Opportunity solution tree (rooted in the §1.2 outcome)

```
OUTCOME: A GP vet trusts the report enough to let it inform the encounter for a
         diet-trial / GI-symptom patient she's never met (orient in <60s → act).
│
├─ OPP-V1  Vet can ORIENT instantly (signalment + the clinical question's answer up top)
│     └─ Sol: headline-first IA; signalment band; 60s scan path (§6)
├─ OPP-V2  Vet can TRUST owner-collected data (provenance, denominators, frequency-over-severity)
│     └─ Sol: denominators on every count; logged-at vs occurred-at; severity demoted; appendix drill-down
├─ OPP-V3  Vet can INGEST it into her workflow (no login, prints, archivable, SOAP-mappable)
│     └─ Sol: no-account view + print/PDF; map to S/O; never A/P
├─ OPP-O1  Owner can HAND IT OVER credibly in the moment (phone across a desk / emailed ahead)
│     └─ Sol: format fits the handoff context (§7); owner-readable orienting band (§6 strawman axis)
└─ OPP-O2  Owner isn't made ANXIOUS by generating it (stressful moment; no false reassurance)
      └─ Sol: nyx-voice owner band; n=1 discipline; associational-not-causal
```

### 5.2 Jobs-to-be-done
- **Vet (Dr. Chen):** *"When an owner hands me data for a patient I haven't prepped for, help me orient in 60 seconds and judge whether to trust it enough to act — without making me learn an app or log into anything."*
- **Owner (Jordan) — the JTBD to study explicitly:** *"When I'm in the waiting room / across the consult desk, help me hand my vet something credible so we spend the 15 minutes on the problem, not on me failing to remember."* **The handoff context constrains format more than aesthetics** — a multi-page PDF is wrong for a phone shown across a desk. **PM QA probe (2026-06-21):** *is the typical interaction really the owner handing their phone to the vet?* — maybe not, and we shouldn't assume it. The candidate handoff modes are broader than one: **phone shown across the desk · link/PDF emailed or uploaded ahead of the visit · printed and brought in · the owner reading from it themselves · (future) surfaced inside the practice's own tooling.** Which mode(s) dominate is **[ASSUMPTION]** today and is the strongest argument *for* HTML-first (one artifact that serves all of them) — but it must be validated → Research Debt §10 (**R2, top gate**).
- **Owner (Sam, cat):** *"Show my vet that Pixel's intake actually dropped — honestly — without it reading as 'she's just being picky.'"* (intake-decline ≠ preference; shared-bowl honesty.)

### 5.3 Key insights (tagged)
- **I1 [EVIDENCE]** Pets average **~2.4 vet visits/year — roughly one every ~5 months** (AVMA, research §1), and the owner's recall across that gap is the primary diagnostic input; structured longitudinal data "currently never exists." (research §1–2) → the report's reason to exist. *(Data-quality note — PM QA caught this: research §1 also cites an "85.8-day gap between visits" (Vetsource 2024); that **cannot** be the inverse of 2.4 visits/yr — which implies ~152 days — and does **not** mean ~4 visits/yr. The two figures use different cohorts/denominators. The load-bearing point — months pass between visits — holds under the conservative 2.4/yr figure; the source's internal inconsistency is flagged as a Tier-2 fix to `nyx-research-v1_0.md`, §11.)*
- **I2 [EVIDENCE]** Clinicians distrust patient-initiated data and want it *synthesized and prioritized*, not dumped. (§4.4 PGHD) → "synthesize, don't dump" is evidence-based, not taste.
- **I3 [EVIDENCE]** Dr. Chen trusts **frequency over owner-rated severity**; back-dating and missing denominators are named trust-killers. (personas.md; research §2) → severity is demoted; denominators are mandatory.
- **I4 [EVIDENCE]** Distribution is passive infrastructure (QR on a discharge sheet, a line in a post-visit email), not a sales motion — the report must require **zero extra effort from the vet** to be useful. (research §2) → no-login, no-account, prints.
- **I5 [ASSUMPTION]** The owner hands the report over **on a phone, across the consult desk.** → if true, a paginated PDF is the wrong primary artifact (§7). Top Research Debt.
- **I6 [ASSUMPTION]** A single artifact with an owner-readable band raises owner confidence without lowering vet trust. → contested (§5.4); Research Debt.

### 5.4 Dissent — surfaced, not resolved (Persona Conflict Protocol)

> **Designer:** A single artifact with an owner-readable summary band serves the real handoff — Jordan is standing there and shouldn't be handed something alien. It also raises owner confidence going into a stressful consult.
> **Dr. Chen (+ skeptical GP):** Any owner-facing copy near the clinical data risks reading "consumer app," which is exactly the trust I'm trying to extend to owner-collected data. A vet-only one-pager is safer for trust.
> **PM decision needed:** the **audience treatment** (vet-only vs single artifact with an owner band). → Open Question §8.1; discovery's emerging recommendation in §6.3, to ratify.
> **PM (QA 2026-06-21) — strategic weight:** this is **not just a layout choice — it is a distribution channel.** One owner bringing a credibly-designed report to a vet is how the vet flywheel (research §2; success signal S3) actually starts: a set of advocates, word-of-mouth sign-ups. **Do not let scope-trimming hollow out the two-sided design — swing for the fences here and get it right.** PM leans to the **banded both-sides** artifact (§6.3). The Dir.-of-Eng scope instinct is noted but **yields on *this* decision** — the *build* is still phased (§6.6), the *design ambition* is not cut.

> **Engineer (Dir. Eng):** A structured CSV/JSON export is cheap and serves owner portability (B-041) and the AI-context-pack (B-089).
> **Trust & Safety:** A downloadable structured dump of the whole record is a far wider unauthenticated-exposure surface than a bounded, revocable, view-only page — and vets have nothing to ingest it into (§4.3, no vet FHIR). For the *vet* audience it adds risk and no value in v1.
> **PM decision needed:** is a structured export in v1 scope, or deferred to B-041/B-089? → §8.2 / §9.

> **Nutritionist:** The diet section should be WSAVA-complete — every treat, supplement, and med-delivery food.
> **Dr. Chen (GP, 60s scan):** WSAVA-complete risks an unscannable wall. The scan path must survive.
> **PM decision needed:** how much diet detail on page 1 vs an appendix? **PM (QA 2026-06-21): this scope call is deferred to Dr. Chen + the specialist-panel roundtable (§3), not pre-resolved here.** The §6.4 split (page-1 summary line + WSAVA-superset in the appendix) is the *starting proposal* the roundtable refines, owned by R7 (§10).

---

## 6. Design vision *(Workstream E — Priority 2)*

### 6.1 The clinical-question spine (the IA flows from this)
v1 must answer **one or both** of:
1. **"Is this diet trial working?"** — compliance (days logged / elapsed vs target) + symptom trend across the trial window + confounders (treats, human food, flavored meds, off-diet exposure).
2. **"Is this symptom getting better or worse?"** — frequency/trend over the window, with denominators.

Both reduce to **trend + denominator + confounders, scoped to a window.** A report that answers no specific question is the data dump §4 says everyone already ships. **This spine is the most important output of Workstream E** — IA, strawmen, and the cut all derive from it.

**Substrate honesty (PM QA 2026-06-21):** the app already carries the **`diet_trials`** table + the profile **diet-trial card** (days elapsed / target duration + compliance %, via schema reference query [3]) — that is the trial substrate the "is the trial working?" question reads from. There is **no richer guided "trial workflow"** (protocol stepper, structured check-ins) today, and **v1 does not require one** — the report renders the existing trial data honestly. A deeper trial *experience*, if ever wanted, is a separate feature, **not** a vet-report dependency (note it for the spec; don't assume it).

### 6.2 Three divergent strawmen (text mocks — vary on density/register × audience)

> A text mock sharpens the in-context read and pre-stages the `vet-report-cold-read` subagent; it does **not** satisfy it (that agent wants a *rendered* artifact, which arrives at build).

#### Strawman A — "The Clinical One-Pager" *(dense · vet-only · SOAP-S/O-adjacent)*
```
MOCHI — Mixed breed, M/N, 4y      Owner-reported summary · May 1–Jun 21, 2026 (51 days)
Weight 12.4 kg (Jun 2)            Prepared for veterinary review · Not a diagnosis
─────────────────────────────────────────────────────────────────────────────────
DIET TRIAL: Royal Canin Hydrolyzed (dry) · started May 8 · target 56d · day 44/56
  Compliance: 41 of 44 days with ≥1 meal logged (93%)
  Off-diet exposures: human food ×3 (May 19, Jun 2, Jun 14); treats ×7 (see appendix)
SYMPTOMS (logged 47 of 51 days)
  Vomiting   ▆▃▂▁  9 episodes / 51 d → 6 (first half) vs 3 (second half)
  Diarrhea   ▅▂▁▁  6 episodes / 51 d → 5 vs 1
  (severity owner-reported; see appendix. Trend by frequency.)
CORRELATION (associational; multi-sample): vomiting occurred within 30 min of eating
  in 4 of 12 timed episodes. No protein reached the established threshold.
MEDICATIONS: Metronidazole 250mg PO q12h (GI) since May 8 —
  Given consistently (88 of 88 logged doses)
TIMESTAMP CONFIDENCE: 7 events estimated/window (rendered as ranges in appendix)
─────────────────────────────────────────────────────────────────────────────────
Owner-reported observations. Associational, not causal. Full event log: page 2.
```

#### Strawman B — "The What-Changed Narrative" *(prose-first · owner-readable · hybrid)*
```
How Mochi has been — for Dr. ___, since the last visit (May 1–Jun 21)

Since starting the hydrolyzed diet on May 8, Mochi's vomiting has roughly halved
(6 episodes in the first ~3 weeks, 3 in the last ~3 weeks) and diarrhea has nearly
stopped (5 → 1). He's been on the trial diet 41 of 44 days. There were 3 days with
human food and 7 treats logged, noted below. He's had metronidazole twice daily
throughout, with all doses logged.

[then a compact clinical table identical to Strawman A's body]

This is what the owner observed and logged. It is not a diagnosis.
```

#### Strawman C — "Banded One-Pager" *(hybrid · one artifact, two bands · provenance appendix)*
```
┌─ FOR THE OWNER ───────────────────────────────────────────────────────────────┐
│ Mochi's vomiting is down about half since the diet change, and diarrhea has     │
│ nearly stopped. Here's the detail for your vet. (This isn't a diagnosis.)       │
└────────────────────────────────────────────────────────────────────────────────┘
[ then the EXACT Strawman A clinical one-pager, unchanged, as the primary surface ]
[ Appendix (p2+): full event log · timestamp ranges · severity per event · treats ]
```

### 6.3 Panel critique → the emerging audience recommendation
- **Skeptical GP:** Ignores B's prose ("I don't read paragraphs between appointments") and A's owner band is absent — A wins on pure trust. But concedes C's owner band is *one line he can skip*, and the clinical surface under it is identical to A. **C doesn't cost him anything.**
- **Dr. Chen:** A and C both pass the 60s scan (headline → trend → diet → meds → provenance). B fails it — the answer is buried in prose. **B is out** as the primary form (its narrative is a good *owner-band* source, not a vet artifact).
- **Nutritionist:** All three under-render diet on page 1; wants the WSAVA-superset — agrees it belongs in the **appendix**, with a confounder summary line on page 1.
- **Criticalist:** Wants the intake-decline / feline-window signal to be *impossible to miss* when present — a safety line above the fold, never buried (mirrors the Signal's "safety leads" rule).
- **Designer + Jordan:** B/C serve the handoff moment; a vet-only A hands Jordan something alien. C keeps one artifact (no two-document confusion) while giving Jordan an orienting line.
- **Data Scientist:** Every number on all three must carry its denominator and window, and the correlation line must stay associational — non-negotiable across all strawmen.

**Emerging recommendation (→ ratify at §8.1):** **a vet-first single artifact (the Strawman-A clinical one-pager) with a thin owner-readable header band and a provenance appendix — i.e., disciplined Strawman C.** The clinical page is **primary and self-sufficient** (it must pass the cold read *alone*, band removed); the owner band is **one orienting line, not a parallel owner report**; the appendix satisfies "can I check this?" This resolves Principle 6 (the clinical surface is unbranded and dense) *and* the handoff reality (Jordan isn't locked out). The audience question is thereby **decided by the critique**, not pre-decided — and goes to the PM to ratify.

**PM endorsement (QA 2026-06-21):** the PM lands here too — *"clinical-first report with a 'for the owner' section above"* — because it **serves both audiences without compromising either**: the vet gets a document in their familiar (SOAP-adjacent) form; the owner gets an orienting band **and** keeps their own analytics home. The two owner surfaces are **complementary, not redundant** — the report's owner band is a **one-line orienting summary of *this* report**, while the **Patterns dashboard** (B-023) is the owner's **ongoing, exploratory analytics**. The report does not try to be the dashboard, and the dashboard's warm cards never leak onto the clinical export (§2.2; B-023 §9). Held with the §5.4 "this is a distribution channel — swing for the fences" weight.

### 6.4 Design decisions worked against the strawmen

| Decision | Resolution |
|---|---|
| **IA / 60s scan path** | signalment → the clinical-question **headline answer** → symptom trend(s) **with denominators** → diet & confounders (summary line) → meds + adherence → provenance footer. **Out of v1:** A/P (diagnosis/plan), n=1 reads, `Early`-tier correlations as findings, multi-pet comparison. |
| **Sparse / partial / empty** | Show the window + **what was logged** + an explicit gap callout (*"no entries Jun 3–7"*); a report with < N logged days reads *"limited data — N days logged in this window,"* never a confident trend or a broken chart (Principle 5). **Clinical-honesty trap: absence ≠ wellness** — never imply completeness the data lacks. |
| **Provenance & verifiability** | Summary on page 1 + an **event-log appendix** (reference query [4] line items) on page 2+; **every derived number traceable** to its events. Dr. Chen's core trust lever. Interacts with §7: a web report can expand provenance inline; a static PDF needs the printed appendix. |
| **Statistical honesty** | **Denominators + observation window on every count** (*"4 episodes / 51 d, 47 of 51 d logged"*); correlations carry counts and stay **associational, never causal** (*"within 30 min of eating in 4 of 12 timed episodes"* — never *"chicken causes…"*). The report's sibling of the Signal's `validatePhrasing`. |
| **Intake honesty** | Free-fed renders **"Intake not directly observed"** verbatim (B-040); absence of logged intake is **never** "didn't eat"; decline routes to a **health flag, never "picky"** (feline 48h window); shared-bowl/grazing ambiguity rendered honestly (Sam). Finished-rate is **meals-only** (treats excluded; §11 #1). |
| **Self-framing — authority & limits** | *"Owner-reported observations for [pet], [range]. Associational, not a diagnosis."* The liability boundary is stated plainly — and to a skeptical vet it **reads as a strength** (the tool knows its lane), *not* as undermining the trust it's built to earn. |
| **Owner-facing copy (the band)** | One nyx-voice line that clarifies without spiking anxiety and **without false reassurance** (n=1 discipline; generated at a stressful moment). Never causal. |
| **Owner access** *(PM QA 2026-06-21)* | The **owner can always view the full report they generate** — it's their pet's data, transparency builds trust, and care is never gated (Principle 7). **The owner sees exactly what the vet sees — no hidden clinical layer.** This is the report artifact; the owner's *ongoing* analytics home is the separate Patterns dashboard (B-023). |
| **Accessibility** | **Non-colour severity/trend encoding** (shape · label · position · sparkline) that survives **grayscale and print** — the report is frequently printed B&W, so **colour can never be load-bearing.** **Reuse the B-023 colour-as-wellness ruling** (verdict colour only on established multi-sample metrics; adverse falling = calm/muted, **never a green "win"**; single observation neutral both ways) — do not re-decide colour semantics. |

### 6.5 Trust-killers & QA edge cases the strawmen were tested against
- **Trust-killers (Dr. Chen):** back-dating → render **logged-at vs occurred-at** where they diverge + timestamp confidence (B-010); **owner-rated severity** → lead with frequency, demote severity to owner-reported-only in the appendix (→ §8.4); missing denominators → denominators everywhere; no provenance → the appendix.
- **QA edge-case data scenarios (must each have a defined render):** **zero-event / empty** (designed empty state, not a blank page) · **share-token after expiry** (server-side 410/expired view, never the report) · **back-dated before trial start** (event excluded from trial-window stats but visible in the full log with its real date) · **deleted pet** (report generation blocked / prior reports invalidated by cascade).

### 6.6 System vs. wedge (ship the wedge; leave a seam, don't build an abstraction)
v1 serves the **diet-trial / GI-symptom reactive-tracking owner** — *the wedge* (Nyx's primary, highest-intent user: the owner sent home from a vet visit with a diet-trial or symptom-monitoring directive; CLAUDE.md "primary wedge"). The "discipline-extensible system" is a **seam plan, not built abstraction**: the section model (signalment · question-headline · trend · diet · meds · provenance) is general enough that derm (8–12 wk skin trials), behavior, or a senior-wellness report slot in later **without re-architecting** — but we do not build those sections, those rotations, or a template engine now. **Named v1 cut, defended:** GI/diet-trial only; no derm-specific section, no multi-pet comparative report, no A/P, no structured export, no PIMS integration, `Early`-tier and n=1 reads excluded.

**Indicative build phasing** *(PM QA 2026-06-21 — a sketch for the requirements spec to refine, NOT the plan of record).* The PM asked that this surface be split into phases → PRs so the work reads as a concrete project plan ("this is coming in N PRs"), like B-117's 10-PR plan. A candidate decomposition, wedge-first:
> - **Phase 1 — Core clinical one-pager (the spine):** signalment + clinical-question headline + symptom trend with denominators + diet section + provenance appendix; **HTML-first render**; the `generate-report` Edge Function + reference query [4]. *(~2–3 PRs: data/query layer · render · share-token wiring.)*
> - **Phase 2 — Committed consumers:** medications + adherence (B-117 PR 10) · free-fed "Intake not directly observed" (B-040) · human-food line (B-102 PR 6) · B-010 timestamp-confidence rendering. *(~3–4 PRs, several disjoint/parallel.)*
> - **Phase 3 — The two-sided artifact:** the owner band + the "Share with my vet" dashboard bridge (B-023 PR 5) + owner-initiated revocation (B-143). *(~2 PRs.)*
> - **Phase 4 — Save/print PDF derivation** (B-144 spike → implementation) + the QA edge-case empty/expired/deleted states. *(~1–2 PRs.)*
>
> Each phase is gated by `vet-report-cold-read` (rendered artifact); load-bearing logic also gates on `adversarial-reviewer` + `rls-privacy-reviewer`. The **real-vet validation (§10 R1/R2)** precedes Phase 1 locking. The spec session owns the final cut.

**Adjacent future seam — vet-visit document capture (B-145).** The PM floated capturing vet-visit documentation (discharge sheets, lab reports) by photo + AI extraction. **Out of v1 vet-report scope**, but it composes naturally: it **reuses the existing vision-extraction infra** (`extract-food/medication-from-photo`) on the `vet_visit_attachments` substrate (B-044), and would feed *into* the report — closing the loop so Nyx ingests what the vet sent home, then summarizes the owner's data back. Logged as B-145; carries the same provenance/guardrail rules (AI-extracted clinical data never silently trusted; n=1 reads stay owner-side).

---

## 7. Delivery & format *(Workstream F — Priority 3; reshapes the blocking Open Question)*

### 7.1 Options weighed against what vets actually receive & ingest

| Format | For the vet | For the owner handoff | Verdict |
|---|---|---|---|
| **Preformatted PDF** | Universal, prints, emails, archivable into PIMS as a document; no login | Fixed layout is **wrong for a phone across a desk**; static (no drill-down) | Keep as a **derived** artifact, not the primary one |
| **Responsive view-only web link** (spec default) | No account, adapts phone↔desktop, **provenance drill-down inline**, **server-side revoke/expiry** | Fits both waiting-room-phone and emailed-ahead | **Recommended primary** |
| **Structured export (CSV/JSON)** | **Vets have nothing to ingest it into** (§4.3, no vet FHIR/HL7); widens the privacy surface (whole record, uncontrollable) | Serves owner portability, not a vet handoff | **Defer** to B-041 / B-089 (not v1) |
| **PIMS/EHR-ingestible** | **No standard exists** in vet medicine (Vet-XML failed; FHIR unused) | n/a | **Post-PMF partnership**, not v1 |
| **AI-ready context pack** | n/a (owner-asks-external-AI) | Correct liability posture; owners already paste into ChatGPT | **Cross-ref B-089**; not a vet-handoff format |
| **Print** | Survives any clinic workflow; B&W-safe | n/a | **First-class regardless** of primary format |

### 7.2 Recommendation
**A view-only, responsive web report as the primary artifact, with a one-tap "Save / Print PDF" of the same content** (the web report is the source of truth; the PDF is a faithful rendering of it). Rationale:
- Fits **both** handoff contexts (phone in the waiting room + emailed-ahead-to-desktop) — the format constraint §5.2/I5 names.
- Enables **inline provenance drill-down** (Dr. Chen's "can I check this?") that a static PDF can't.
- Gives **server-side revocation + expiry** (Trust & Safety) that an emailed PDF **file can never have** — a downloaded PDF is uncontrollable forever, and **no live link may survive the B-039 deletion cascade.** An HTML-first, server-controlled artifact makes "kill the row → kill the link" true; a mailed file breaks that guarantee.
- Print/PDF stays because vets **archive documents into the PIMS** and print (§4.3).

**PM endorsement (QA 2026-06-21):** the PM independently lands on **webview/HTML-first** for two further reasons: **(1) iteration speed** — a web view is far easier to spin up and change than a PDF (PDFs are notoriously finicky on layout), so we converge on the final design in HTML and then **derive the PDF from the iterated webview**; **(2)** it matches this recommendation. This firms §8.2 toward option (a).

### 7.3 How this RESHAPES the blocking PDF-library Open Question
If the primary artifact is an HTML/web report, **"which PDF library" stops being the question.** It is **reshaped and demoted** to: *"server-render HTML as the canonical artifact, and derive the save/print PDF via (a) headless-Chromium HTML→PDF, (b) a print stylesheet + browser print with no heavy dependency, or (c) a lightweight `pdf-lib` pass."* The **render-library choice is a follow-up engineering spike (now B-144), gated on the PM ratifying HTML-first vs PDF-first (§8.2)** — not a discovery deliverable. The old CLAUDE.md Open Question ("`pdf-lib` vs `puppeteer` vs `react-pdf`") is **narrowed**: `puppeteer`/headless-Chromium becomes the natural fit *only if* we want pixel-faithful PDF of the HTML; option (b) may need no PDF library at all.

### 7.4 Trust & Safety threat-model sketch *(first-class — the share link is the first unauthenticated path to pet health data in the entire app)*
- **What's exposed:** **one bounded, immutable report artifact** (signalment, symptom/diet/med summary, owner notes), **never a live query into the whole record.** **Hard design constraint:** the token scopes to the **single report it was minted for** — not a view key into the pet's record.
- **Consent moment:** explicit owner action ("Share with my vet") generates + shares; the artifact is a **snapshot at generation time.**
- **Expiry / revocation:** 30-day server-side expiry exists in schema (`token_expires_at`, enforced by the public RLS policy — server-side, never client). **Gap → add owner-initiated revocation (now B-143)**; passive expiry alone can't retract a mis-shared link.
- **Link-enumeration:** `share_token` is UUIDv4 (~122 bits) — not enumerable; ensure no sequential/guessable component, **no token in logs or `Referer`**, and **bounded signed-URL TTLs** on the stored PDF and any embedded health photos (a long-lived signed URL is a de-facto public link).
- **Structured export widens the surface** (whole record, downloadable, uncontrollable) vs a view-only page — a concrete point **against** CSV/JSON in v1 (§5.4 dissent).
- **Lifecycle vs account deletion (B-039):** **no live link may survive** the cascade — `vet_reports` rows + the storage PDF objects are purged, invalidating the token. HTML-first server-control makes this clean; an emailed file does not.
- **Backstop:** `rls-privacy-reviewer` is the build-time gate (mandatory; this is its first real exercise). This session **flags, does not build.**

---

## 8. Open Questions — decidable, PM-routed

Each is decidable now (pick an option), with a discovery recommendation. **§8.1–8.3 gate the spec.**

**8.1 — Audience treatment** *(the strawman-axis decision).* Options: **(a)** vet-only clinical one-pager · **(b)** single artifact with a thin owner-readable header band + provenance appendix · **(c)** separate owner and vet documents. **Recommend (b)** (disciplined Strawman C; §6.3) — clinical surface self-sufficient, owner band one line. *Routes to: requirements spec IA.* **PM lean (QA 2026-06-21): (b) — banded both-sides**, held as a *distribution-channel* decision (swing for the fences, §5.4), to ratify at the spec session.

**8.2 — Primary delivery format** *(reshapes the PDF-library question).* Options: **(a)** HTML-first web report (source of truth) + derived save/print PDF · **(b)** PDF-first · **(c)** both co-equal. **Recommend (a)** (§7.2). Ratifying (a) **narrows the CLAUDE.md PDF-library Open Question** to the B-144 render spike. *Routes to: spec + B-144.* **PM lean (QA 2026-06-21): (a) — HTML/webview-first** (iterate in HTML, derive the PDF later; §7.2).

**8.3 — Report scope & control.** Options: fixed window · owner-chosen range · auto-scoped to active diet trial · since-last-visit. **Recommend a default cascade:** **since last vet visit (`vet_visits`) → else active diet-trial window → else 30 days**, with an **owner range override.** The trial is the natural clinical unit for the wedge; this composes with B-023's "since last visit else 30d." *Routes to: spec IA + the `generate-report` query.*

**8.4 — Owner-rated severity on the report.** Dr. Chen trusts frequency over severity. Options: omit severity · render it owner-reported-only in the appendix (labeled) · include an averaged headline. **Recommend: lead with frequency/trend; render severity only as owner-reported per-event in the appendix — never an averaged headline.** *Routes to: spec.*

**8.5 — Correlation rigor tier on the report.** Options: `Established`-only · `Established` + `Early` with explicit "early, not established" framing. **Recommend `Established`-only for v1** (associational, denominatored); `Early` stays owner-side. This **narrows the CLAUDE.md "emerging-signals tier" Open Question for the report surface.** *Routes to: spec.*

**8.6 — Resolve B-115 (protein-exposure over-count) before the diet/confounder line ships.** Options: dedup exact-timestamp same-food treat re-logs before ranking · ratify the raw-count stance. **Recommend dedup** — overstating a confounder's prevalence is the wrong headline for a diet-trial owner. *Routes to: the existing B-115 PM/Data-Scientist call, now a Step-9 precondition.*

**8.7 — B-028 ordering (editable AI structured fields).** The report must not render an uncorrectable AI-derived field as fact. Options: gate the report's use of AI structured fields on B-028 shipping · render only owner-confirmed fields in v1. **Recommend: v1 renders owner-confirmed fields only; AI-derived-unedited fields are excluded or carry an explicit provenance tag.** *Routes to: spec + B-028 sequencing.* **PM (QA 2026-06-21): B-028 can be kicked off in parallel now** — building the editable-fields layer ahead of / alongside the report *removes* this precondition rather than gating on it (added to the §9 parallel track).

**8.8 — Formalize the specialist vet panel — where?** Options: a sub-roster inside `personas.md` · **its own PR-evolvable doc** (`docs/vet-specialist-panel.md`) cross-referenced from `personas.md` · keep doc-local. **Recommend formalize** (it earns its keep across C–F). **PM lean (QA 2026-06-21): its own PR-evolvable doc**, kept current via PRs, cross-referenced from `personas.md` + the routing table (§3.2). Tier-2 — flagged in §11, not written. *Routes to: PM.*

**8.9 — Which v1 success signal(s) do we instrument (§1.3)?** Options: S2 only (cold-read orient, testable now) · S2 + S3 (add the "wants it again" proxy via B-047) · all three (needs a real-vet feedback channel). **Recommend S2 as the build bar + S3 instrumented via B-047; S1 deferred to the real-vet validation channel.** *Routes to: B-047 + the Research-Debt vet panel.*

### Existing CLAUDE.md Open Questions this round narrows
- **"Which PDF rendering library for the Edge Function?"** → **reshaped & demoted** by §8.2: if HTML-first is ratified, this becomes the B-144 render spike (HTML→PDF path / print stylesheet), not a v1 blocker.
- **"Emerging-signals tier on the Signal surface?"** → for the **report surface specifically**, §8.5 recommends `Established`-only (the broader Signal-surface question stays open as-is).

---

## 9. Recommendations & next steps

**Immediate next step: the requirements-spec session** (turns these decisions into a build-ready spec — the natural follow-up the PM flagged). It should decide, in order:
1. **Ratify §8.1–8.3 (audience · format · scope)** — they gate the entire IA and the `generate-report` contract. One PM batch unblocks the spec.
2. **Validate the top Research Debt items (§10 R1, R2) with real practicing vets BEFORE the spec locks** — this is the gate; synthetic vets cannot validate trust or the handoff moment.
3. **Resolve the data-integrity preconditions:** B-115 (§8.6) and B-028 ordering (§8.7) — both feed the report and must be settled before the diet/AI-field sections ship.
4. **Land B-044 (vet-visit attachment sync / migration drift)** — a **Now** blocker; the "since last visit" scope and any vet-visit context depend on it.
5. Then the spec defines: the clinical-question-spine IA (§6.1), the must-carry sections (§2.2–2.3), sparse/empty behavior (§6.4), and the §7.4 threat-model controls.

**Parallelism & efficiencies (don't run this linearly):**
- **Independent, run concurrently:** the **B-144 render-library spike** (engineering) and the **real-vet validation pass** (§10, PM/research) are disjoint — no shared files, no logical dependency — and can run as separate tracks once §8.2 is ratified. **B-044's migration audit** and **B-028 (editable AI fields — PM: parallelizable now, §8.7)** are both independent and **ready-to-run now** (neither waits on a decision); doing B-028 in parallel *removes* the §8.7 precondition instead of gating on it.
- **One decision unblocks several tracks:** ratifying **§8.1–8.3** simultaneously unblocks the spec IA, the B-023 PR 5 bridge, and the B-144 spike scoping.
- **Gated vs ready:** ready-now = B-044, the strawman rendering for cold-read, real-vet recruiting. Gated-on-a-PM-call = the spec itself (§8.1–8.3), B-115 (§8.6), B-028 (§8.7).
- **Shared-file collision to expect at wrap:** `STATUS.md` and `CLAUDE.md` Open Questions (the PDF-library row) — coordinate if the spike and spec sessions run in parallel.

---

## 10. Research Debt — ranked by impact × uncertainty *(first-class; the gate before the spec locks)*

**The top items (R1, R2) MUST be validated with real practicing vets before the requirements spec is locked.** Each carries "what evidence would change our mind."

| # | Debt item | Impact × Uncertainty | What evidence would change our mind |
|---|---|---|---|
| **R1** | Does a *synthesized owner-reported* report actually get **trusted and acted on** by real GPs for a patient they've never met? (The whole value prop; synthetic vets can't validate trust.) | **HIGH × HIGH** | 5–8 real-GP cold-reads of a rendered strawman: would they *act* on it / *want it again*? If most wouldn't act, the report's framing/contents need rework before spec. |
| **R2** | What's the **real handoff moment** — phone across the desk · emailed ahead · printed? (Constrains format more than aesthetics; §5.2/I5.) | **HIGH × HIGH** | 10–15 owner + vet interviews on how data changes hands today. If "printed paper dominates," the HTML-first call (§7.2) needs revisiting toward print-first. |
| **R3** | **Frequency-over-severity:** do vets want owner-rated severity at all, or is it noise? (§8.4) | **HIGH × MED** | Vet preference test on a strawman with vs without severity. If vets *want* severity, §8.4 changes. |
| **R4** | Is the **owner-readable band** a help or a trust-contaminant? (§5.4 / §6.3 / §8.1) | **HIGH × MED** | A/B cold-read of banded (Strawman C) vs vet-only (Strawman A): does the band lower vet trust? |
| **R5** | Will a vet **open a web link** mid-consult, or is print/PDF the only thing that survives the workflow? (§7) | **MED × HIGH** | Vet workflow interviews + a **discharge-sheet format scan** (research §4 already flags this owner=PM). If vets won't open links, PDF/print becomes primary. |
| **R6** | Does the report need to **map to SOAP S/O explicitly** to be ingested, or is a clean clinical summary enough? (§4.3; **PM endorses SOAP-adjacency** — keep the report close to standard clinical documentation) | **MED × MED** | Show GPs a SOAP-mapped vs free-form clinical layout; measure ingest/scan ease. Direction is set (SOAP-adjacent); the debt is *how explicit* the S/O mapping must be. |
| **R7** | **WSAVA completeness vs scannability** — how much diet detail on page 1 vs appendix? (§5.4 nutritionist↔GP; **PM: this scope call is owned by Dr. Chen + the specialist-panel roundtable**, §3) | **MED × MED** | Dr. Chen + nutritionist (panel roundtable) review the diet section at two detail levels and pick the page-1/appendix line. |
| **R8** | **PIMS archival** — do vets save a handed-over report into the PIMS as a document, and does that change the format/filename/metadata needs? | **LOW × MED** | Practice-manager interviews; if archival matters, add filename/header conventions to the spec. |
| **R9** | Prevalence of the **"paste history into ChatGPT"** incumbent behavior (§4.2) — sizes the B-089 escape-hatch demand. | **LOW × MED** | Owner survey; informs B-089 prioritization, not v1 report. |

---

## 11. Tier-2 doc edits proposed (flagged, NOT written) & protocol notes

**Proposed Tier-2 edits (await PM confirmation before any write):**
- **New doc `docs/vet-specialist-panel.md`** *(PM lean, QA 2026-06-21)* — formalize the §3 specialist vet panel in **its own PR-evolvable file** (not a sub-roster inside `personas.md`), noting its composition with the `vet-report-cold-read` subagent; **cross-reference it from `personas.md` + the persona-routing table** so routing still points there. *(→ §8.8.)*
- **`docs/nyx-research-v1_0.md`** — reconcile the **internally inconsistent visit-cadence figures**: §1 cites both "2.39 visits/year" and an "85.8-day gap between visits," which conflict (2.4/yr ⇒ ~152 days, not 85.8). Correct or footnote so downstream docs don't propagate a ~4×/yr misread (see §5.3 I1).
- **`docs/nyx-competitive-landscape-v1_0.md`** — add the §4.1 indie-app "export-to-vet is now table stakes" crop (Vet Record / Vettie / Petfetti / PetDocs / PetVitality) and the §4.3 "no veterinary FHIR/HL7 standard" finding; both sharpen Nyx's differentiation toward *synthesized clinical answer*, not export.
- **`docs/nyx-technical-spec-v1_0.md` §7** — once §8.1–8.3 are ratified: reshape the "PDF rendering library" Open Engineering Question per §7.3; add the must-carry sections (meds + adherence, human-food line, free-fed "Intake not directly observed" verbatim, B-010 timestamp-confidence rendering) to the §7 content list; record the HTML-first delivery direction.
- **`docs/nyx-design-principles-v1_0.md`** — the "vet portal visual language" Open Design Question now has discovery input (Principle 6 + the §6.4 accessibility/colour-reuse rulings); flag for the future design pass.

**New backlog rows added this session** (operational file; proactive add per Backlog Protocol — *resolved deferrals*, not new scope): **B-143** owner-initiated share-link revocation; **B-144** vet-report render-library spike; **B-145** vet-visit document capture + AI extraction (PM-floated future scope, §6.6). New *scope/decisions* were routed to Open Questions (§8), never silently added to the backlog.

**Protocols honored:** Persona Conflict Protocol (§5.4 — flagged, not resolved); Tier-2 doc protocol (above — flagged, not written); Backlog Protocol (B-143/B-144 with full row contract; existing specs cross-referenced, not restated); safety invariants throughout (n=1 never reassures and is off the report; intake decline ≠ preference; report claims associational, never causal/diagnostic; absence ≠ wellness).
