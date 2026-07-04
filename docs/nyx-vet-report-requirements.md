# Vet Report (Build Step 9) — Requirements & Build Plan

**Status:** Build-ready v2 — updated 2026-07-02; **photo decision revised 2026-07-04** (see below). | **Owner:** Step 9 build sessions.

> **v2.1 update (2026-07-04) — incident photos.** The 2026-07-02 "split by type" call is **reversed for the authenticated surface (PM)**: **all incident photos are included in the report + PDF** so the artifact a vet reviews is complete; safety-flagged photos still *lead* the safety band; EXIF/GPS is stripped at render; an optional pre-send owner review can exclude any photo. The split-by-type + token-streaming + link-revocation (B-143) machinery **relocates to the public link (PR 6)**, the only channel where revocability has teeth. **Build order changed: PR 7 (photos, authenticated) now ships BEFORE PR 6 (public link) and no longer depends on it** — PR numbers are kept stable for cross-references. See §2 (Incident photos row), §3 Appendix E, §4, §8, §12 (PR 6/PR 7 + build-order note), AC-7.

> **v2 update (2026-07-02).** This revision folds in: the **v3 + cat design mocks** (`docs/vet-report-mock-v3.html`, `docs/vet-report-mock-cat.html`), the **9-lens synthetic panel review** of v2, and a **real-data dry-run** of the report against the live pet **Nyx** (23 real vomits + AI phenotype fields + free-feeding). The panel returned **CLINIC-READY** (Dr. Chen cold-read) with a fix list, now applied; the real-data run validated the design end-to-end and surfaced concrete data-layer requirements (§7.1). New/changed decisions are in §2; the **reordered** build plan (full functional report first, seamless-sharing later) is in §12.
>
> **The real-vet gate — reframed by the PM (2026-07-02).** The original gate ("5–8 GPs cold-read before Phase 1 locks") is **relaxed to a pragmatic n=1-first path**: the PM will **email the real Nyx report to their own practicing GP and book a real appointment for Nyx**, getting a real-vet reaction **in parallel with the build** — the report artifact already exists (the dry-run), so it need not wait for the build. The load-bearing principle survives: **the first real-vet reaction should land before the expensive, irreversible PRs** (the unauthenticated share path + photo-privacy machinery — §12 Phase 2), so feedback can still reshape them cheaply. Broad 5–8-GP validation becomes a **pre-scale gate**, not a v1-build blocker. Synthetic vets shaped the design and cannot validate trust; one real GP is worth more than all nine synthetic lenses, read as **directional** (n=1). Rationale: a structured, denominatored, photographic log strictly beats an owner's on-the-spot recall across a months-long gap — the product's founding thesis.
>
> **Preconditions — ALL RESOLVED** (per STATUS.md): **B-044** ✅ #218 (migration audit, zero drift — the §7.1 real-data pull re-confirms every column the report reads is present), **B-115** ✅ #219 (exact-ms treat-collapse), **B-028** ✅ #220 (editable AI fields). None block the build.
>
> **Lineage.** Discovery synthesis (`docs/vet-report-discovery.md`, #214) → v1 mock + panel review (`docs/vet-report-mock.html` + `-mock-review.md`, #216) → **v2 (`docs/vet-report-mock-v2.html`) → the 9-lens panel + v3/cat revision + the Nyx real-data dry-run (this session)**. Read `docs/vet-report-mock-v3.html` (calm diet-trial dog) and `docs/vet-report-mock-cat.html` (safety-led cat) first — they *are* the page-1 + appendix design this spec productionizes.

---

## 1. The clinical-question spine (everything derives from this)

v1 answers **one or both** questions for a patient the vet has never met (`discovery §6.1`):

1. **"Is this diet trial working?"** — compliance (days logged vs elapsed vs target) + symptom trend across the trial window + confounders (treats, human food, flavored meds, off-diet exposure).
2. **"Is this symptom getting better or worse?"** — frequency/trend over the window, with denominators.

Both reduce to **trend + denominator + confounders, scoped to a window.** A report that answers no specific question is the chronological data-dump every competitor already ships (`discovery §4.1`); Nyx's differentiation is that it exports a **synthesized clinical answer a GP can act on in ≤60s**, not that it exports.

**The success bar (`discovery §1.2`):** *v1 succeeds when a GP, handed this report for a diet-trial / GI-symptom patient she has never met, can answer the report's clinical question in under 60 seconds and trust it enough to let it inform the encounter.*

**Substrate honesty:** the app already carries `diet_trials` + the profile diet-trial card (days elapsed / target + compliance %, schema reference query [3]). v1 renders **that existing trial data** honestly. There is **no** richer guided "trial workflow" today and v1 does **not** build one.

**Both questions must render with NO diet trial present (real-data-validated).** The live pet **Nyx** has **no diet trial and no vet visit** — 23 vomits over ~7 weeks on a free-fed diet — so her report falls to **question 2 (symptom monitoring)** and the 90-day scope fallback. v1 must render the pure symptom-monitoring case (no trial section, no compliance) as a **first-class path, not a degraded one** — and the **safety-led case** (chronic frequency / intake decline / a *present* blood-or-foreign flag), which the calm diet-trial mock cannot show. The two mocks cover both: `-v3` (calm diet-trial dog) and `-cat` (safety-led cat); the Nyx dry-run is the real safety-led instance (chronicity + a possible-foreign photo).

---

## 2. Decisions — what this spec ratifies

The discovery's §8 Open Questions, resolved. **§8.1 / §8.4 / §8.5 are decided; §8.2 is a strongly-endorsed PM lean carried as the design basis (one format gate remains); §8.3 is this spec's call.**

| # | Question | Decision |
|---|---|---|
| **8.1 Audience** | vet-only · banded both-sides · separate docs | **VET-ONLY (Strawman A) — DECIDED by PM, 2026-06-22.** The "for the owner" band is **removed**. The report is a single clinical artifact in the vet's familiar (SOAP-adjacent) register. The **owner still has full access** to the report they generate — same artifact, no hidden clinical layer (Principle 7 / transparency) — but there is **no owner-readable band on the report**. The owner's *ongoing* surface is the **Patterns dashboard (B-023)**, which is complementary, not redundant. This closes discovery §8.1 → option (a) and resolves Research-Debt **R4** (no owner-band A/B needed). |
| **8.2 Delivery format** | HTML-first + derived PDF · PDF-first · co-equal | **HTML-FIRST — RATIFIED by the PM, 2026-07-02.** The canonical immutable artifact is **server-rendered HTML**. **HTML-first is a rendering/architecture choice, NOT a user-facing file format — the owner never sees or downloads a raw `.html` file.** Two **hard owner-facing requirements** (PM): **(1) the report renders IN-APP** — a WebView of the server HTML; the owner opens "Vet report" and sees it *inside the app* (a main feature, never a link-out or a downloaded file). **(2) The primary way to hand it to the vet is a PDF via the native share sheet** — "Send to vet" → a PDF → Mail/Messages/AirDrop — because the average owner won't hand-generate a link or wrangle a PDF. **This makes the in-app render + PDF export day-one CORE, not a deferred nice-to-have.** The **public token web-link is SECONDARY** (later — for vets who prefer a live link; §12 PR 6). This **demotes the "which PDF library" Open Question** to the B-144 spike; the PDF-generation *location* (on-device `expo-print` of the finished HTML vs a server-side headless render) is a build-time sub-decision (§14 **S7**; note the CLAUDE.md "PDF generation server-side" constraint). `report.ts` is format-agnostic, so if real-vet **R5** ever shows print-only, nothing in Phase 1 reworks. |
| **8.3 Report scope & control** | fixed · owner-range · trial-scoped · since-last-visit | **DEFAULT CASCADE + owner override + cherry-pick guard** — see §6. **(1)** since last vet visit (`vet_visits`) → **(2)** else active diet-trial window → **(3)** else a **90-day fallback**. The owner may override to a custom range **at generation time** (an in-app control on the B-023 bridge, *not* a control on the static artifact). **Cherry-pick guard:** any owner-customized window **must disclose the count of in-pet symptom events that fall outside it** ("N events outside this range") — the synthetic GP's strongest non-obvious add (`review §3.3`, GP-3). |
| **8.4 Severity** | omit · owner-reported-only in appendix · averaged headline | **One-line ratification:** lead with **frequency/trend**; render severity **only as owner-reported, per-event, in the appendix** — **never an averaged headline** (`discovery §8.4`; Dr. Chen trusts frequency over owner-rated severity). *(Triggers a Tier-2 fix — see §13: technical-spec §7 AC and design-principles §6 both still say "severity averages," which this decision reverses.)* |
| **8.5 Correlation rigor tier** | Established-only · Established + Early | **One-line ratification:** **`Established`-only** on the report (associational, denominatored, multi-sample). `Early`-tier patterns stay owner-side. Putting `Early` on the report would imply rigor the data lacks. This **narrows the CLAUDE.md "emerging-signals tier" Open Question for the report surface only.** |
| **8.6 B-115** | dedup · ratify raw-count | **Precondition** — resolve B-115 (dedup exact-timestamp same-food treat re-logs) **before the diet/confounder line ships** (Phase 2 / §11). Overstating a confounder's prevalence is the wrong headline for a diet-trial owner. |
| **8.7 B-028** | gate on B-028 · owner-confirmed fields only | **v1 renders owner-confirmed fields only;** AI-derived-unedited structured fields are **excluded** (or carry an explicit provenance tag). PM cleared **B-028 to run in parallel** — shipping the editable-fields layer *removes* this precondition rather than gating on it (§11). |
| **8.8 Specialist panel — where** | sub-roster in `personas.md` · own doc · doc-local | **Own PR-evolvable doc** `docs/vet-specialist-panel.md`, cross-referenced from `personas.md` + the routing table. Tier-2 — flagged in §13, **not written by this spec**. |
| **8.9 Success signals** | S2 · S2+S3 · all three | **S2 (cold-read orient ≤60s) is the build bar** (what `vet-report-cold-read` measures); **S3 ("wants it again") instrumented via B-047**; **S1 (acts on it)** deferred to the real-vet feedback channel. |

**New decisions ratified this session (2026-07-02) — 9-lens panel + PM:**

| # | Decision |
|---|---|
| **Branding (points 9/10)** | **Professional letterhead — keep; footer marketing — kill.** A restrained Nyx wordmark masthead + a *verify-only* QR that **encodes no token**. The clinical body stays unbranded / B&W-safe. The skeptical-GP and Designer lenses **independently validated the letterhead** ("reads as a lab masthead") and **independently flagged the "Free forever / learn about Nyx" footer as the one 'consumer-app' contaminant** — removed. Reads like an IDEXX/Antech lab report: branded *and* trusted. |
| **Vomit phenotype (point 7)** | **Aggregate the `analyze-vomit` STRUCTURED fields across incidents** into a descriptive "Vomit characteristics" section (contents mix + consistency). Multi-sample → clears the n=1 bar; migration 013 already scopes these fields to the report; the n=1 *worry read* stays off. **PRESENT-ONLY** (below). Real-data-validated on Nyx's 23 incidents (food ×12 / bilious ×5 / hairball ×1). Add a parallel **Stool characteristics** strip (below). |
| **Present-only safety rendering** | **Blood / foreign material / mucus render ONLY when present in an incident — never as a "0 of N" count.** Aggregating AI-read negatives (the enum *emits* `unsure`) reconstructs the reassurance-on-absence the n=1 layer forbids — the criticalist + stats red-team converged on this independently, and Nyx's real data contains the exact `unsure` values that would have been mis-folded. Mirrors the empty-safety-slot principle. When none present → a **de-weighted limitation note** (a photo can't exclude bleeding; coffee-ground blood photographs poorly; these are AI reads). A present flag **leads the safety band**. |
| **Incident photos (point 8)** | **Include ALL incidents in the report + PDF — no split-by-type on the authenticated surface (PM, 2026-07-04, supersedes the 2026-07-02 "split by type" call).** Every photographed incident renders in the report and is baked into the PDF, so the artifact a vet reviews (ideally ahead of the appointment) is **complete** — a report with photos silently missing defeats its purpose and erodes trust in the whole document (Dr. Chen + Owner + Designer). Safety-flagged photos (blood / foreign) **still lead the safety band** (prominence is orthogonal to inclusion). **EXIF/GPS stripped at render** + reasonable embedded resolution (reuse the `analyze-vomit` downscale) are the standing mitigations; an optional **pre-send "N photos will be included — tap to exclude any" review** answers the residual accidentally-sensitive-frame risk without mutilating the default. **Rationale for the reversal:** the old split's whole justification was *revocability*, which is a property of the **public web link (PR 6)**, not of a PDF the owner deliberately hands their own vet — in a PDF-only world "exclude everyday photos to keep them revocable" just means "the vet never gets them," which is worse, not more private (the rest of the report is equally sensitive + equally unrevocable, so singling out photos was incoherent). **The split-by-type + token-streaming + link-revocation machinery relocates to the public-link path (PR 6)**, the only channel where revocability has teeth (a link is forwardable/leakable; a handed-over PDF is not). `rls-privacy-reviewer` still mandatory on the photo PR (EXIF strip, signed-fetch, no baked long-TTL URL). |
| **Weight (B-186)** | **Descriptive weight trend on page 1** (sparkline + delta), a trajectory not a point. **No loss flag** (clinically load-bearing → its own spec **B-190** + adversarial pass). **Designed empty state when no weigh-ins exist** (Nyx has zero) — a logging nudge, never the undated onboarding figure, never reassurance. |
| **Stool characteristics** | **A stool-characteristics strip** (consistency distribution; present-only for blood/mucus) — stool is the **primary** outcome of a diet trial (GI internist) yet was under-rendered vs. vomit. Same present-only discipline. |
| **Medications & supplements** | The Medications section becomes **"Medications & supplements"** — OTC supplements (e.g. probiotics) render as **concurrent interventions**, named in the `Reading the trend` confound note when they co-start with the diet/drug. (Owner-floated: the med workflow may generalize to "medication + supplements" — **B-212** future scope, not v1.) |
| **Owner/client identity + neuter (real-data-surfaced schema gaps)** | The report needs an **owner/client name** for PIMS filing (practice manager); it is **not on `pets`** → pull from profile/auth. **Neuter status is not stored at all** → add a field or state "not recorded" honestly. Both are §7.1 data-layer requirements. |
| **Section-based print pagination** | The clinical summary runs ~2 A4 sheets in print (the web view is one continuous scannable page — HTML-first). Footers use **section labels** ("Clinical summary" / "Appendix A") + pet+range on every page, **not** a fixed "Page N of 4" that print makes wrong (practice manager). |

**Decided architecture this report inherits (do not re-litigate — `discovery §2.1`):** server-side render via the to-be-built `generate-report` Edge Function (never client-side); share by token, no vet account; immutable snapshot row in `vet_reports`; free forever (Principle 7); clinical-grade, unbranded (Principle 6); scannable in 60s.

---

## 3. The report IA — section contract (the 60s scan path)

The page-1 order is the cold-read scan path (`discovery §6.4`); it is **productionized from the v3 + cat mocks**. One home per fact (de-densification, `review §4` GP-4): the tiles are the headline; each section is the detail — no restatement. *Sections with no data render as **designed empty states** (§6, §7.1), never blanks — real data (Nyx: no trial, no weight) makes this mandatory.*

**Page 1 — the clinical summary (primary, self-sufficient; must pass the cold read alone; ~2 A4 sheets in print, one continuous page on screen):**

0. **Letterhead + signalment** — Nyx wordmark masthead + "Prepared for veterinary review · Not a diagnosis"; name · species · breed · sex · **neuter (or "not recorded")** · age (+ DOB) · **owner/client name** (PIMS filing — §7.1) · latest weight with date · the **range box** (window · days · logged-days · scope basis).
1. **Safety-leads slot** *(conditional, directly under signalment)* — when a **chronicity / intake-decline / feline-window / symptom-worsening / present-blood-or-foreign** flag is present it renders here, impossible to miss (`discovery §6.3` criticalist), mono-prominent (heavy border + weight, never colour). **When absent, nothing renders** — an "all clear" box is **never** shown. *(v3/Mochi triggers none; the cat mock and the real Nyx report both lead with it — chronicity + a possible-foreign flag.)*
2. **Clinical-question headline** — one line (S/O only, never A/P).
3. **Weight trend (B-186)** — descriptive sparkline + delta, a trajectory not a point; **empty state (logging nudge) when no weigh-ins exist**. Never a loss flag, never reassurance.
4. **At a glance** — a stat-tile row (symptom counts/denominators; trial-days-logged **or** intake summary; weight **or** its empty tile; logging coverage). **No "compliance" on a contaminated or absent trial** (§5).
5. **Symptom frequency & trend** — per symptom: a **non-colour** weekly chart (bar height = count; dashed **intervention marker** when a trial/drug/supplement started; date anchors) + a denominatored read + a **gap callout**. **A `Reading the trend` note** directly under the charts names **every** concurrent confound (diet + drug + **supplement**) — GP-0, the single highest-consequence misread to prevent.
6. **Vomit characteristics** *(NEW — point 7)* — the aggregated `analyze-vomit` structured fields: a contents-mix proportion bar + consistency, over the **assessed** denominator (`of N with a legible AI read`; failed/uncertain/pending are distinct). **Present-only** blood/foreign (§5): a de-weighted limitation note when absent, a flag that leads the safety band when present. Tagged "Nyx photo analysis · owner-**reviewable**."
7. **Stool characteristics** *(NEW)* — consistency distribution; present-only for blood/mucus. Renders only if stool events exist (Nyx has none → omitted).
8. **Diet, feeding, medications & supplements** — diet (trial *or* current) · **free-fed "Intake not directly observed" (B-040)** · feeding method + meal-completion (meals-only) · **human-food line (B-102)** · treats summary · **medications + adherence (B-117)** with the concurrent-change note · **supplements as concurrent interventions** · the two-line associational timing finding · pointer to the WSAVA appendix.
9. **Provenance footer** — owner-reported; estimated/window-timestamp count; "every count traces to the appendix"; **pet + range + section label on every page** (not a fixed "Page N of 4").

**Appendices — the provenance Dr. Chen's trust rests on; verbose is correct here:**

- **A — Symptom event log:** every symptom event in order, **occurred (B-010) vs logged**, `seen`/`est`/`range` tag, per-event owner severity (1–5, **never averaged; blank if unrated** — real owners skip it), owner note, and for photographed vomits the **AI phenotype fields** (owner-reviewable) with **failed/uncertain/pending** shown as such.
- **B — Off-diet exposures (confounders):** treats + human food with date/category/item/note; poultry/allergen exposures on an elimination trial flagged; the poultry-antigen tally reconciled (treats vs human food).
- **C — Diet history (WSAVA-superset):** primary diet, **previous diet**, amount/schedule, who feeds, water, treats, human food, **supplements (dated)**, **food used to give medication**, active conditions, **nutritional status** (weight-trend ref / BCS-not-assessed).
- **D — Medication log:** per drug — regimen, doses logged/scheduled, adherence narrative (honest about unconfirmed doses). Supplements listed in C.
- **E — Incident photos** *(NEW — point 8):* curated thumbnails of **every** photographed incident, most-recent-first, **all included in the report + PDF** (no split — PM 2026-07-04); safety-flagged (blood / foreign) photos also **lead the safety band** on page 1. EXIF stripped at render; owner-reviewable AI reads never carry an n=1 verdict. *(The public-link streaming/revocation controls are PR 6, not here.)*
- **F — How to read this report:** the legend (safety flags / range / free-fed intake / blood-&-foreign present-only / weight / severity / denominators / time confidence / photos-&-verify / associations / deleted entries).

**Every derived number on page 1 traces to an appendix line item** (reference query [4]). Non-negotiable (Dr. Chen's core trust lever).

---

## 4. Must-carry sections — requirements, not options

These are **already-built consumers explicitly gated on Step 9** (`discovery §2.2–2.3`). Each is a hard requirement with a clinical trap if mis-rendered; each is owned by a PR in §12. The **`vet-report-cold-read` subagent is a mandatory gate** on every one.

| Source | What the report MUST carry | The trap if mis-rendered | Owned by |
|---|---|---|---|
| **B-117 PR 10** (`nyx-medication-logging-requirements.md` §7) | A **Medications** section: per regimen — drug, strength, dose, route, frequency, indication, start date — **+ a computed one-line adherence summary per drug** from logged doses ("logged on 41 of 45 days — 82 of 90 doses; 8 unconfirmed, none refused"). A regimen with **zero logged doses reads "adherence not tracked," never "compliant."** Unconfirmed ≠ missed ≠ refused. | A drug overlapping the trend window, rendered without a **concurrent-change note**, lets the diet silently take credit for an antibiotic — the highest-consequence misread on the page. | §12 PR 5 |
| **B-040** (`nyx-free-feeding-requirements.md` §6) | Free-fed / continuously-available food rendered with the **verbatim string "Intake not directly observed."** Absence of a logged intake **never** renders as "didn't eat." Meal-completion is **meals-only** (treats + free-fed excluded). | Reading absence-of-log as a refusal turns un-observed grazing into a false anorexia signal — or buries a real one. | §12 PR 6 |
| **B-102 PR 6** (`human-food-format-requirements.md` PR 6) | A **distinct, scannable human-food line** — "owner supplemented with human food N× this window (dates/items)" — because human food is the **#1 diet-trial confounder.** | Folding human food into "treats" hides the confounder most likely to make a working trial read as failing. | §12 PR 6 |
| **B-010** (`research/2026-05-event-timestamp-uncertainty.md`; CLAUDE.md Resolved) | Discovered/estimated events render as a **time range or estimate, never a false precise point** ("found 07:44, occurred ~04:00–07:44"). Appendix A carries **occurred-vs-logged** columns + the `seen`/`est`/`range` confidence tag. | A vomit logged 07:44 but occurring ~04:00 moves symptom→meal latency from minutes to hours — *dietary indiscretion vs bilious vomiting syndrome*, a different workup. | §12 PR 7 |
| **B-023 PR 5** (`nyx-analytics-dashboard-requirements.md` §9) | A **"Share with my vet"** bridge from the Patterns dashboard that assembles **this** report (default range per §6's cascade). **Clinical content is the report's, not the dashboard's** — warm owner cards and owner-only n=1 reads **never** leak onto the clinical export. | A dashboard's reassuring "doing great!" card on the clinical export destroys the trust the report exists to earn. | §12 Phase 3 |
| **Vomit phenotype (point 7)** — `event_ai_analysis` structured fields | The aggregated "Vomit characteristics" section (§3.6): contents-mix + consistency over the **assessed** denominator; **present-only** blood/foreign. `adversarial-reviewer` mandatory. | Aggregating AI-read negatives into a bold "0 of N" reconstructs the reassurance-on-absence the n=1 layer forbids (the enum *emits* `unsure`). | §12 Phase 1 |
| **Incident photos (point 8)** — `event_attachments` + `nyx-event-attachments` | Appendix E, **all incidents included** in the report + PDF (no split — PM 2026-07-04); safety-flagged photos also lead the safety band. **EXIF stripped at render**, reasonable embedded resolution, `rls-privacy-reviewer` mandatory. | Omitting photos leaves the vet with an incomplete record they must chase mid-appointment; a mis-scoped signed URL leaks health data. *(Baked-into-PDF is unrevocable by design here — the owner's deliberate export; revocable delivery is the public link, PR 6.)* | §12 PR 7 |
| **Weight (B-186)** — `weight_checks` | A descriptive weight trend (§3.3) + a **designed empty state** when no weigh-ins exist. No loss flag (B-190). | Filling the gap with the undated onboarding weight, or letting "stable/rising" read as wellness (can be fluid). | §12 Phase 1 |
| **Stool characteristics** | A stool-characteristics strip (§3.7); present-only for blood/mucus. | Same present-only trap as vomit; and under-rendering the *primary* diet-trial outcome. | §12 Phase 1 |

**Standing exclusions (never on the report):** per-incident **n=1 AI reads** (`analyze-vomit` et al.) — a single-sample read may escalate on the *presence* of a red flag but **never reassure on absence**, and the report is a multi-sample artifact; **`Early`-tier** correlations (§8.5); **A/P** (assessment/plan/diagnosis) — that is the vet's job and the liability line (`discovery §4.3`).

---

## 5. Honesty rules — the report's `validatePhrasing` sibling

These are the report's load-bearing invariants (`discovery §6.4`), enforced **deterministically in the assembly layer** (§7), not by prose review. The report is a **deterministic assembly of already-true structured findings** — there is **no generative phrasing on clinical content** (the cleanest way to guarantee these hold; the Signal's Haiku phrasing has no analog here).

1. **Denominators + window on every count.** "9 episodes / 52 d, 48 of 52 d logged" — a count never appears without how long and how completely it was tracked.
2. **Associational, never causal.** Timing relationships are co-occurrence with counts ("within ~30 min of eating in 4 of 12 timed episodes") — never "chicken causes…".
3. **Absence ≠ wellness.** Never imply completeness the data lacks; gaps are called out explicitly; the safety-leads slot is empty-when-absent, never a fabricated "all clear."
4. **Intake honesty (B-040).** "Intake not directly observed" verbatim for free-fed; decline routes to a health flag, **never "picky"** (feline 48h window); shared-bowl/grazing ambiguity rendered honestly.
5. **Frequency over severity (§8.4).** Trend is read from frequency; severity is owner-reported-only, per-event, in the appendix, **never averaged**.
6. **Provenance is mandatory.** Every page-1 number traces to an appendix event line. Deleted entries are excluded and **said to be excluded** ("every figure is computed over exactly the events listed").
7. **Self-framing states the lane.** "Owner-reported observations for [pet], [range]. Associational, not a diagnosis." To a skeptical GP this reads as a *strength* (the tool knows its limits), not a weakness.
8. **No load-bearing colour (accessibility / B&W print).** Trend/severity carried by number · bar height · label · position — survives grayscale and print. **Reuse the B-023 colour-as-wellness ruling** (verdict colour only on Established multi-sample metrics; adverse-falling = calm/muted, never a green "win"; single observation neutral). Do **not** re-decide colour semantics. *(Real-data note: proportion-bar fills + swatches must carry `print-color-adjust:exact` or they print blank on a default clinic printer — practice manager.)*
   - **Colour-as-enhancement carve-out (PM-ratified 2026-07-04).** Colour *is* permitted as a **non-load-bearing enhancement** on a categorical chart — where the reader needs to distinguish many series (e.g. ~7 proteins on the protein-exposure-over-time stacked bar) — **provided every category is ALSO encoded by a non-colour channel** (a distinct SVG texture/pattern) **and a legend count**, so the datum reads identically in a B&W photocopy. This does not weaken the rule: colour never *carries* a datum alone. Any such chart must ship a greyscale proof. Applies to the #9 protein chart; not a general licence to colourise the report.
9. **Present-only for blood / foreign / mucus.** These render **only when present** in an incident — **never as a "0 of N" count** (§2 present-only decision). The enum *emits* `unsure`, so a shared "0 of N" denominator silently folds "couldn't assess" into a reassuring zero. Absent → a de-weighted limitation note; present → a flag that **leads the safety band**. Mirrors the empty-safety-slot rule; criticalist + stats red-team converged on it, and Nyx's real data carries the `unsure` values that prove it.
10. **Assessed denominators for AI reads.** Aggregate the `analyze-vomit` fields over the **assessed** set (`of N with a legible AI read`); **completed / uncertain / failed / pending are distinct**, disclosed — never collapsed into the denominator. Tag the fields **"owner-reviewable"** (raw AI), not "owner-reviewed," unless an `edited_at` exists.
11. **De-duplicate before counting.** Near-simultaneous duplicate event logs (same pet, same type, same minute — present in Nyx's real data) collapse before any count, so a bout logged twice is not double-counted (pseudoreplication makes a "0 of N" look safer and a frequency look worse).

---

## 6. Scope, control & immutability

**Default scope cascade (§8.3):** **(1) since last vet visit** (`vet_visits.visited_at`, most recent before today) → **(2) else the active diet-trial window** (`diet_trials.started_at`) → **(3) else a 90-day fallback.** *(The fallback was 30 days in discovery §8.3; the synthetic GP bumped it to ~90 — "this is a snapshot, not the full year" — `review §3.3`. The exact number is a real-vet-confirmable input; ship 90, confirm at R1/R2.)*

**Owner override** happens **at generation time**, in-app (the B-023 "Share with my vet" range control), **never as a control on the static artifact** — the artifact is an **immutable snapshot** (`discovery §2.1`).

**Cherry-pick guard (the synthetic GP's strongest add — `review §3.3`/§1 GP-3):** whenever the owner overrides to a **custom** window (i.e. away from the default cascade), the report **must disclose the count of in-pet symptom events that fall outside the chosen window** — e.g. "3 symptom events fall outside this range (most recent Jun 28)." The principled default cascade does **not** need the disclosure; a hand-picked window **does**, so a vet can see the owner didn't crop to a good week. *(This is a clinical-trust requirement, not a UI nicety — name it in the QA AC.)*

**Reconciliation with B-023 §9:** B-023's bridge currently reads "default since last visit, else 30d." **This spec's cascade is canonical** (since-visit → trial → 90d); the B-023 bridge must call `generate-report` with this spec's default, superseding the 30d. Flag the cross-doc edit when PR 8 lands (§13).

**Edge-case render states — each has a defined render (`discovery §6.4/§6.5`):**

| Scenario | Render |
|---|---|
| **Zero events in window** | A designed empty state ("No symptom events logged in this window"), not a blank page or a broken chart (Principle 5). The diet/med sections still render if present. |
| **< N logged days** (sparse) | "Limited data — N days logged in this window"; **never** a confident trend or a broken chart. |
| **Gap days** | Explicit callout ("nothing logged May 13, 27, Jun 11, 18") on page 1 + in the legend. |
| **Back-dated before trial start** | Event **excluded from trial-window stats** but **visible in the full log** with its real date (never silently dropped). |
| **Share token expired** | A server-side **410 / expired** view, **never the report** (token check is server-side, RLS-enforced — §8). |
| **Token revoked** (B-143) | Same expired/revoked view; the link is dead immediately, not at passive expiry. |
| **Deleted pet** | Report generation blocked; prior reports invalidated by the B-039 cascade (rows + Storage objects purged → token dead). |

---

## 7. Architecture & data contract

**`generate-report` Edge Function (server-side, never client — `discovery §2.1`, tech-spec Architectural Decisions).** Mirror the `generate-signal` split so the load-bearing logic is offline-unit-testable and the I/O is a thin shell:

- **`report.ts`** — **pure assembly** (no I/O): takes the pulled rows (reference query [4] + diet trials [3] + vet visits + medications + free-feeding arrangements) and a window, returns the **structured report snapshot** (signalment, per-symptom windowed counts + denominators + weekly buckets, diet summary, confounder list, medication adherence, provenance event log, the §5 honesty invariants baked in). **Deterministic, no LLM.** Offline `deno test` like `detection.ts`/`phrasing.ts`.
- **`render.ts`** — pure **snapshot → canonical HTML** (the mock, productionized). B&W-safe, non-colour encoding, `@page` print CSS. No I/O.
- **`index.ts`** — the I/O shell: **verify caller JWT → re-check pet ownership against the caller** (confused-deputy guard; copy `analyze-vomit`'s user-scoped re-load — never trust a body `pet_id`) → resolve the window (§6 cascade) → pull rows (service role, scoped to the verified owner's pet) → `report.ts` → `render.ts` → **store the immutable artifact in Storage** → insert the `vet_reports` snapshot row → return `{ share_token, share_url, storage_path }`.

**Correlation section = the detection engine, reused over the report window (§8.5).** The report's timing/correlation line is computed by the **shared `generate-signal` Established-tier logic over the report's window** — **not** by reading the rolling Signal cache (the windows differ; reading the cache would let the report claim the Signal's "this week"). One source of statistical truth (`detection.ts`) means the report and the Signal can never contradict. The report renders **only `Established`-tier** results; if none clear the bar, it says so honestly ("no single food/protein reached the established threshold over this window — counts too few"). *(Window-consistency is load-bearing — mirrors B-067; the Data Scientist signs off the windowing.)*

**The immutable snapshot.** A `vet_reports` row is a snapshot with no updatable content fields (`discovery §2.1`). The **canonical artifact is the rendered HTML stored in Storage** (`storage_path`); generation also stores the **structured JSON snapshot** alongside it so the served page renders deterministically and identically forever. Serving `nyx.app/report/{share_token}` goes through a **public, no-auth route** that looks up the row by token under the **existing public RLS policy** (`share_token IS NOT NULL AND token_expires_at > NOW()`), then streams the stored artifact (or mints a **short-lived** signed URL per view — never a long-lived one). *(Snapshot-as-stored-HTML vs render-on-demand-from-JSON, and stream-vs-short-signed-URL, are B-144-adjacent build decisions — §11 S-list — not PM-blocking.)*

**NO NEW SCHEMA for v1.** `vet_reports` + both RLS policies already exist (schema `migration 001`); `storage_path TEXT NOT NULL` holds the artifact path; **B-143 revocation reuses `token_expires_at = NOW()`** (no column). The only schema-adjacent precondition is **B-044** (migration-drift *audit* — verifying already-authored migrations are applied; not new report schema — §11). This matches the recent zero-schema pattern (analytics, multi-pet).

**Reference query [4]** (`schema.sql`) is the page-1 + appendix-A/B data pull (events + meals + food_items over `[start,end]`, `deleted_at IS NULL`, ordered). [3] feeds compliance; vet_visits feeds the scope cascade; the medication tables feed the Medications section; `feeding_arrangements` feeds B-040.

### 7.1 Data-layer requirements the Nyx real-data dry-run surfaced (build these into `report.ts`)

The report was **hand-run against the live tables for the pet Nyx** (2026-07-02) to preview the built output. It validated the design end-to-end and surfaced concrete `report.ts` obligations — none are design changes:

| Real-data reality (Nyx) | `report.ts` requirement |
|---|---|
| **No diet trial, no vet visit** | Render the pure **symptom-monitoring** path (no trial section / no compliance); range falls to the **90-day fallback** with coverage honesty ("logged N of 90 d; first entry `<date>`; nil before"). |
| **Zero `weight_checks`** | The weight section is a **designed empty state** (logging nudge), never the undated `pets.weight_kg` onboarding figure. |
| **Owner name NOT on `pets`; neuter NOT stored** | Pull the **owner/client name** from the profile/auth layer for PIMS filing; render neuter as **"not recorded"** (or add a field — §2 gap). |
| **AI analyses: 18 completed, 2 uncertain, 2 failed, 1 pending (of 23)** | Denominate over the **assessed** set; keep the four states distinct (§5.10). Real `unsure` blood/foreign values exist → **present-only** (§5.9). |
| **Same-minute duplicate vomit logs** (May 15, May 30, Jun 21) | **De-duplicate** near-simultaneous events before counting (§5.11). |
| **Free-fed staples** (`feeding_arrangements`: duck + RC Weight, `free_choice`) | Apply **B-040 "intake not directly observed"**; do not compute a false "meals finished." |
| **Severity never rated (all 23 blank)** | Frequency-led holds; the severity column is simply blank — never invent one. |
| **Chicken is the near-universal staple + most treats** | The correlation line says **"no established threshold"** honestly (the staple washes out) — the real engine output, not a convenience. |
| **Chronicity fires (B-182 ⑦, live)** | The safety-leads slot must carry the **chronicity** flag (frequency over many samples), plus any **present** foreign/blood flag. |

**The dry-run artifact** (kept out of the repo — personal data) is the reference for what "correct" looks like on real data; regenerate it after PR 1 to diff computed-vs-hand output.

---

## 8. Trust & Safety — the share link is the app's first unauthenticated path to pet health data

First-class (`discovery §7.4`); **`rls-privacy-reviewer` is the mandatory build-time gate** — this is its first real exercise.

- **Scope:** the token scopes to the **single immutable report it was minted for** — **never a live query into the whole record**; photos are addressed by **index into the snapshot's own manifest**, never a request-supplied path/`pet_id`. Hard constraint.
- **Consent moment:** explicit owner action mints + shares; the artifact is a snapshot at generation time.
- **Confused-deputy guard:** `generate-report` **re-verifies pet ownership against the caller JWT** (the client stub already sends a body `pet_id` — a live trap); `view-report` is the only `verify_jwt=false` function and its in-function token check is its *entire* boundary.
- **Expiry / revocation:** 30-day server-side expiry (`token_expires_at`, public RLS); **B-143 adds owner revocation** — passive expiry alone can't retract a mis-shared link.
- **Embedded photos (point 8) — controls split by surface (rls-privacy-reviewer, mandatory on the photo PR):**
  - **Authenticated report + PDF (PR 7 — where photos land first):** **all incident photos are included** (no split — PM 2026-07-04). **Server-side EXIF/GPS strip at render** is the load-bearing control (the upload path can fall back to the original with GPS — `lib/sync.ts` — a location leak); embed at a **reasonable downscaled resolution** (reuse the `analyze-vomit` downscale), not the full original. The owner's PDF export is **unrevocable by design** — it's their deliberate hand-off of their own record to their own vet — so the mitigation is *owner visibility*, not exclusion: an optional **pre-send review** ("N photos will be included — tap to exclude any"). Fetch photos for embedding via a **short-lived request-time signed URL, never a baked long-TTL URL** in the stored snapshot. `Cache-Control: private, no-store` on the report response.
  - **Public web link (PR 6 — the deferred, revocable channel):** this is where the **split-by-type + token-streaming + revocation** machinery earns its keep, because a link is forwardable/leakable. **Stream photos through the token route** (per-request expiry+revocation check, service-role fetch) **or** mint **≤120 s request-time signed URLs never persisted into the snapshot** — a baked/long-TTL signed URL **outlives revocation and expiry** and defeats B-143. On the link, **everyday photos stay stream-only/revocable**; a safety-flagged photo may additionally carry a **permanent-copy** path for records-integrity. **`Referrer-Policy: no-referrer` + self-hosted fonts** (zero third-party subresources, or the token leaks in the `Referer`); **the QR encodes a non-secret verify URL — never the share token** (print is unrevocable).
- **No token leakage:** `share_token` is UUIDv4 (~122 bits); **no token in logs or `Referer`**, no guessable component.
- **Deletion cascade (B-039):** no live link survives — `vet_reports` rows + Storage artifacts purged. Verified: `delete-account` purges both the report artifacts and the source `event_attachments` photos.
- **Dashboard checks (PM, not code):** `nyx-vet-reports` bucket **private, no read policy**; `nyx-event-attachments` **`public=false`**; `generate-report` `verify_jwt=true` / `view-report` `verify_jwt=false`.
- **No structured export in v1** (CSV/JSON) — widens the surface to the whole record; deferred to B-041/B-089.

---

## 9. Out of scope for v1 (the named cut, defended — `discovery §6.6`)

Ship the **wedge** (diet-trial / GI-symptom reactive-tracking owner), leave a **seam, not a built abstraction**. Explicitly cut:

- **The owner-readable band** (§8.1 — removed; the owner's surface is B-023).
- **A/P** (assessment / plan / diagnosis) — the liability line.
- **Per-incident n=1 AI reads** and **`Early`-tier** correlations (owner-side only).
- **Derm-specific / behavior / senior-wellness sections** — the section model is general enough to slot these later without re-architecting; we don't build them now.
- **Multi-pet comparative report.**
- **Structured export (CSV/JSON)** → B-041/B-089; **PIMS/EHR-ingestible format** → no vet FHIR/HL7 standard exists (`discovery §4.3`), a post-PMF partnership play.
- **Vet-visit document capture** (discharge sheets / labs → AI extraction) → **B-145** (composes later via the existing vision infra + `vet_visit_attachments`).

---

## 10. Adjacent companion artifact — the second mock (a real-vet-pass precondition)

**DONE this session.** The calm case is `docs/vet-report-mock-v3.html` (Mochi, improving diet-trial dog — safety slot correctly empty); the **safety-led companion is `docs/vet-report-mock-cat.html`** (Pixel, cat — intake decline + feline window + a *present* possible-blood flag, safety slot **leading**); and the **real Nyx dry-run** is a third, real-data safety-led instance (chronicity + a possible-foreign photo). GPs can be shown all three — calm-improving, urgent-decline, and real. Both mocks were reviewed by the 9-lens panel; fixes applied into v3/cat.

---

## 11. Preconditions & the real-vet gate

**The real-vet gate — n=1-first (reframed by the PM, 2026-07-02; see top-of-doc).** The PM emails the **real Nyx report** to their **own practicing GP** and books a real appointment for Nyx, getting a genuine R1 (act-on / want-again) + R2 (handoff mode) reaction **in parallel with the build** — the artifact already exists (the §7.1 dry-run), so it need not wait. **The first real-vet reaction should land before Phase 2** (the irreversible share + photo path), so it can still reshape the design cheaply. Broad **5–8-GP** validation is retained as a **pre-scale gate** (capture per reviewer in `vet-report-mock-review.md` §5), not a v1-build blocker. n=1 is directional, not definitive.

**Build-time preconditions (per the task — flagged, sequenced):**

| Item | What | Gates | Status / note |
|---|---|---|---|
| **B-044** | Migration-drift audit (no clinically-load-bearing column silently absent). | Before Phase 2 hits the live DB. | ✅ **RESOLVED #218** (zero drift). The §7.1 real-data pull re-confirms every column the report reads is present. |
| **B-115** | Dedup exact-timestamp same-food treat re-logs before ranking protein/confounder exposure. | The diet/confounder line (PR 4). | ✅ **RESOLVED #219** (exact-ms treat-collapse). Composes with the §5.11 general de-dup requirement. |
| **B-028** | Editable AI structured fields + "Edited [date]" provenance. | AI-derived fields rendered as fact (PR 3). | ✅ **RESOLVED #220** (editable AI fields). Fields render **owner-reviewable**, tagged raw-AI unless `edited_at` exists (§5.10). |

**Real-vet Research Debt that informs later phases (`discovery §10`):** R1/R2 (gate, above) · R3 severity (confirm §8.4) · R4 owner-band (**resolved** — removed) · R5 web-link-vs-print (could flip §8.2) · R6 SOAP explicitness (direction set: SOAP-adjacent; *how explicit* is open) · R7 WSAVA page-1-vs-appendix depth (owned by the Dr. Chen + nutritionist panel roundtable) · R8 PIMS archival filename/header convention.

---

## 12. PR-by-PR build plan

Three phases, ~14 PRs (Phase 2 gained the three small round-2 PRs — 5b/5c/5d — from the first-real-artifact review). **Reordered per the PM (2026-07-02): the full functional report renders FIRST; getting it out (share) is second; seamless-sharing niceties are last.** The sequencing principle is that **a vet's feedback lands cheaply** — the data + render layers (Phase 1, where "make this shorter / add X / move Y" hits) come before the **expensive, irreversible** unauthenticated-share-path + photo-privacy machinery (Phase 2), which should follow the **first real-vet reaction** (§11). Every PR is gated by `vet-report-cold-read` on the rendered artifact; load-bearing logic also gates `adversarial-reviewer` (statistics/clinical) + `rls-privacy-reviewer` (the share path). PRs marked *(parallel)* are disjoint.

### Phase 1 — The full functional clinical report, rendered (owner-facing; the deliverable's substance)
*Renders every section correctly from live data — including the safety-led, no-trial, empty-weight real cases. The owner can generate + view + Save-as-PDF locally and email it. **This is "the full report, functional and operational."** No unauthenticated path yet, so it's cheap to reshape on vet feedback.*

- **PR 1 — Data/query + assembly (`report.ts`, pure).** All sections' data → structured snapshot, with the §5 honesty invariants + the §6 scope cascade + **all §7.1 real-data requirements** (90-day fallback + coverage, empty states, assessed denominators + four AI states, de-dup, free-fed B-040, symptom-monitoring-with-no-trial). Reuses detection `Established`-tier over the window. No render/I/O/LLM; offline `deno test`. **`adversarial-reviewer`** (denominators, window-consistency, present-only, absence≠wellness, concurrent-change).
- **PR 2 — HTML render (`render.ts`, pure).** Snapshot → canonical HTML: the v3/cat design — letterhead, safety-leads slot, non-colour charts + intervention marker, `Reading the trend` note (GP-0), section-based footers, `@page` print CSS, `print-color-adjust` on fills, B&W-safe. **`vet-report-cold-read`.**
- **PR 3 — Clinical must-carry wiring** *(parallel)*. Vomit-phenotype aggregate (**present-only**, assessed denominators) + medications & supplements + adherence + concurrent-change note (B-117) + B-010 timestamp rendering. **`adversarial-reviewer`** + cold-read. Closes B-117 Phase D.
- **PR 4 — Diet, weight & stool** *(parallel)*. Free-fed (B-040) + human-food (B-102) + WSAVA appendix (prev diet, nutritional status); **weight trend + empty state (B-186)**; **stool characteristics**. **Precondition: B-115** before the confounder line.

> **➜ Real-vet reaction lands here** (PM emails the report + books Nyx's appointment). Feedback reshapes Phase 1 cheaply before Phase 2's irreversible work.

### Phase 2 — See it in-app + email a PDF (the owner-facing MVP), then the public link + photos
*Two milestones. First the **owner-facing MVP** — see the report **in-app** + email a **PDF** to the vet (authenticated, cheap, no unauthenticated path). Then the **public web-link + photos** (the expensive/irreversible unauthenticated path — after the vet reaction).*

- **PR 5 — `generate-report` (authenticated) + in-app WebView render + PDF share (the user-facing MVP).** I/O shell (caller-auth → **ownership re-check** → window → pull → `report.ts` → `render.ts` → store snapshot → return the HTML). Replace `app/report.tsx` with the owner flow: **render the server HTML in a WebView (the owner sees the report *in the app*)** → **"Send to vet" → a PDF via the native share sheet** (Mail/Messages/AirDrop) + the §6 empty/sparse states. **This is the user-facing MVP** — see it in-app, email a PDF; **no public link / no unauthenticated path yet** (cheap + reversible on vet feedback). *(PDF-generation location = §14 S7. Never a raw `.html` handed to the user.)* ✅ **shipped #265**; **feedback round 1** (first-real-artifact mechanical/honesty fixes) shipped **#266**.

> **➜ First real on-device artifact reviewed here** (2026-07-03). A four-agent panel read the rendered PDF (`vet-report-cold-read` = NOT READY, "fix 3–4 things"; `pm-feature-review`; Designer + Dr. Chen + T&S synthesis; `code-reviewer`). Durable record: `docs/research/2026-07-vet-report-first-artifact-review.md`. The mechanical/honesty bugs shipped in #266; the **design-level round-2 change list** (R2-1…R2-6, §3 of that doc) + the ratified §5 decision menu became the three small PRs below, which land BEFORE the public link.

**Round-2 feedback + owner controls (between PR 5 and PR 6 — all authenticated / cheap / reshapeable, gate the real-vet R1 send):**

- **PR 5b — Round-2 design changes (B-221).** Folds the first-real-artifact review's **R2-1…R2-6** into `render.ts` + `report.ts` (pure layers; no I/O, no schema): **R2-1** collapse Appendix B to grouped exposure rows (item × count × date-span, aggregate/tally-first; human food stays itemised; ~18pp → ~6pp); **R2-2** shape-conditional At-a-glance tile set for the no-trial shape (episodes-since-onset · first→last-half trajectory · **days-since-last-episode** · off-diet load — the trial shape keeps its tiles); **R2-3** the `0/25 fully eaten` free-fed-grazer misread → a descriptive feeding line (**framing only — the intake-decline engine + fully-eaten anchor are untouched, `clinical-guardrails` floor**); **R2-4** disclaimer consolidation (one masthead lane statement + a uniform "AI read · unconfirmed" badge + a per-page footer); **R2-5** summary/appendix divider + a page-1 orientation line; **R2-6** polish + naming (mechanism-not-brand AI attribution, neutral chart marker + month ticks + a marker legend, "Patient:" label, conditional empty-Appendix-D preamble, the unlogged-early-window acceleration caveat). **Gates: `vet-report-cold-read` MANDATORY re-run on the regenerated artifact** (the round-1 NOT-READY case must return CLINIC-READY) **+ `adversarial-reviewer` on the days-since-last-episode tile** (it must never read as recovery). *(Requires a `generate-report` redeploy — of the ASCII bundle — then regenerate, before the real-vet R1 email.)*
- **PR 5c — Worsening-flag tz reconciliation (B-219)** *(small, parallel — disjoint from 5b's render surface except STATUS.md at wrap)*. The `symptom_worsening` flag's `currentDays`/`priorDays` are UTC-day counts on a local-day artifact (the same root cause as the fixed chronicity 18-vs-19). Reconcile as ONE deliberate decision (report-side local recount within the detector's ms-windows vs engine tz-awareness). **Gate: `adversarial-reviewer`** — the counts sit near the ③/④ valve, so the reconciliation must not break the "③ silent ⟺ ④ speaks" equivalence.
- **PR 5d — Report date-range control (B-222)** *(small, parallel — self-contained `app/report.tsx` change)*. A generation-time range override on the report screen: presets (since last visit / active trial / 90 days) + custom. The immutable-artifact + cherry-pick-disclosure machinery is already built server-side in `report.ts` (§6); this is the owner-facing control the PM pulled forward from Phase 3 PR 10.

> **➜ Real-vet reaction lands here** (PM emails the regenerated report + books Nyx's appointment). Feedback reshapes Phase 1/round-2 cheaply before Phase 2's irreversible work.

> **➜ Build-order change (PM, 2026-07-04): PR 7 (photos, authenticated) is now built BEFORE PR 6 (public link) and no longer depends on it.** The split-by-type machinery moved to PR 6, decoupling photos from the unauthenticated path. **The numbers below are kept stable for the cross-references throughout this doc; the *build order* is PR 7 → PR 6.** PR 6 remains deferred (the public link is secondary — §8.2).

- **PR 7 — Incident photos in the report + PDF (authenticated; built FIRST, per the build-order change above).** **All** photographed incidents render in **Appendix E** and, when safety-flagged (blood / foreign), also **lead the safety band** — and every one is **baked into the PDF**, so the artifact the vet reviews (ideally ahead of the appointment) is **complete**. **Controls (§8, authenticated surface):** server-side **EXIF/GPS strip at render**; embed at a **reasonable downscaled resolution** (reuse the `analyze-vomit` downscale); fetch each photo via a **short-lived request-time signed URL, never a baked long-TTL URL**; `Cache-Control: private, no-store`. Optional **pre-send "N photos will be included — tap to exclude any"** owner review (answers the accidentally-sensitive-frame risk without exclusion). **No split-by-type, no public link, no link-revocation here** — those live in PR 6. Composes directly on PR 5's authenticated `generate-report` + in-app WebView + on-device PDF flow; **needs no PR 6.** **Gates: `rls-privacy-reviewer` (mandatory — health photos, EXIF, signed-fetch) + `vet-report-cold-read` on the rendered artifact.**
- **PR 6 — Public token share-link + revocable everyday-photo delivery (the unauthenticated path; deferred).** The public token-gated `view-report` route (a live link for vets who prefer one) + **all §8 public-link controls** + the expiry/revoked states + **owner "kill this link" revocation (B-143)** + the **split-by-type / token-streaming everyday-photo delivery relocated here from PR 7** (everyday photos streamed/revocable; a safety photo may additionally carry a permanent-copy path). **`rls-privacy-reviewer` (mandatory — first unauthenticated path).** **HARD BLOCKER, must land inside this PR before the link ships: B-218** — the `vet_reports_public_share` RLS policy (`share_token IS NOT NULL`, `TO public`) would let anon enumerate every report; DROP it and serve the public view through a service-role Edge Function that validates the token server-side. **Precondition: B-044** (✅ resolved). Secondary to the PDF-email flow.

> **➜ End of PR 5 = the owner-facing MVP** (see it in-app, email a PDF — your core requirement). **PR 7 adds photos to that authenticated flow next** (the complete PDF the vet reviews). **End of Phase 2 = the v1 the PM considers done** (photos in-hand, then the deferred public live link).

### Phase 3 — Seamless-sharing niceties + integrations *(LATER — explicitly deferred nice-to-haves, per PM)*
- **PR 8 — "Send to my vet"** *(nice-to-have)*. Capture the clinic/vet email in-app and send the link directly. Gated on the real-vet R2 handoff read.
- **PR 9 — QR-at-the-desk** *(nice-to-have)*. Owner shows a code, vet scans it onto their own screen.
- **PR 10 — B-023 "Share with my vet" dashboard bridge.** Reconcile the B-023 §9 30d → §6 cascade default.
- **PR 11 — PDF derivation hardening (B-144 spike → impl)** + remaining edge states (expired/revoked/deleted/back-dated).

**Consumer ownership map (so nothing is double-built):** B-117 PR 10 → PR 3 · B-102 PR 6 → PR 4 · B-040 rendering → PR 4 · B-010 → PR 3 · B-186 weight → PR 4 · phenotype (point 7) → PR 3 · photos (point 8, all-in authenticated) → PR 7 · everyday-photo streaming/split + B-143 link revocation → PR 6 · B-023 PR 5 → PR 10 · B-144 → PR 11 · **round-2 design (R2-1…R2-6) → PR 5b (B-221)** · **worsening tz reconciliation → PR 5c (B-219)** · **report range control → PR 5d (B-222)** · **`vet_reports_public_share` RLS fix → inside PR 6 (B-218, hard blocker)**.

---

## 13. Acceptance criteria (QA — per the build step + the cold-read bar)

Tie every PR back to the **technical-spec §7 AC** *(corrected per §8.4 — see the Tier-2 edit below)* and the **S2 cold-read bar** (orient ≤60s). A PR is not done until its row passes.

- **AC-1 (scope)** — range defaults to the §6 cascade (since-visit → trial → 90d); owner override works at generation; **a custom window discloses out-of-window event counts** (cherry-pick guard). *(PR 4 / PR 8)*
- **AC-2 (server-side render)** — the report is generated by the `generate-report` Edge Function via reference query [4]; never client-side. *(PR 3)*
- **AC-3 (content)** — signalment (+ **owner name**, neuter-or-"not recorded") · windowed **frequency counts with denominators** · **weight trend or its empty state** · **vomit-characteristics phenotype (present-only, assessed denominator)** · **stool characteristics when present** · diet/meal log · **medications + adherence** · **supplements as concurrent interventions** · **human-food line** · **free-fed "Intake not directly observed"** · **B-010 ranges** · provenance appendix. **No severity averages** (frequency-led; severity owner-reported-only, **blank if unrated**). *(PRs 1–4)*
- **AC-4 (clinical tone)** — clinical, unbranded beyond a small footer; **no load-bearing colour** (B&W-print-safe); passes the **`vet-report-cold-read` CLINIC-READY** bar **on a rendered artifact**. *(every PR)*
- **AC-5 (share)** — a `vet_reports` row with `share_token` + 30-day expiry; system share sheet + copy link; `nyx.app/report/{share_token}` opens in a browser **with no Nyx account**; expiry **and revocation (B-143)** enforced server-side by RLS. *(PRs 3/4/9)*
- **AC-6 (honesty invariants — §5)** — denominators everywhere; associational-never-causal; absence≠wellness (empty safety slot when absent, never a false all-clear); n=1 reads + `Early`-tier excluded; deleted entries excluded **and said to be**. *(every PR; adversarial-reviewer)*
- **AC-7 (privacy — §8)** — **ownership re-check** vs caller JWT; no token in logs/`Referer`. **PR 7 (authenticated photos):** **all** incident photos render in the report + PDF; **EXIF/GPS stripped at render**; embedded at a reasonable downscaled resolution; fetched via **short-lived signed URLs, never baked long-TTL**; `Cache-Control: private, no-store`; optional pre-send owner review to exclude any photo. **PR 6 (public link):** token scopes to the single report; everyday photos **streamed/revocable (≤120s signed URLs, never baked)**; `no-referrer` + self-hosted fonts; QR carries no token; revocation + deletion cascade kill the link **and its photos**; a safety photo may carry a permanent-copy path. *(PR 7 → authenticated; PR 6 → public link; both rls-privacy-reviewer)*
- **AC-8 (present-only + AI honesty — §5.9–5.11)** — blood/foreign/mucus render **only when present** (never "0 of N"); AI phenotype over the **assessed** denominator with completed/uncertain/failed/pending distinct; fields tagged **owner-reviewable**; near-simultaneous duplicate events de-duped before counting; **designed empty states** for weight / no-trial / no-severity, never blanks or fabricated values. *(PRs 1/3/4; adversarial-reviewer)*

**Manual/clinical checks the build can't unit-test:** the real-vet R1/R2 pass (§11); the **B&W test-print** of the zebra/band shading (PM manual, `review §4`); the second (cat/safety-led) mock cold-read (§10).

**Tier-2 doc edits this spec triggers (flagged, NOT written — await PM confirmation):**
- **`docs/nyx-technical-spec-v1_0.md` §7** — replace "**severity averages**" with **frequency-led / severity owner-reported-only** (§8.4); add the must-carry sections (meds+adherence, human-food line, free-fed verbatim string, B-010 ranges); record HTML-first delivery; **reshape the "PDF rendering library" Open Engineering Question** into the B-144 render-path spike (`discovery §7.3`).
- **`docs/nyx-design-principles-v1_0.md` §6** — same "severity averages" → frequency-over-severity correction (already an open PM action item); record the non-colour-encoding + B-023 colour-reuse rulings.
- **`docs/nyx-analytics-dashboard-requirements.md` §9** — reconcile the bridge default **30d → the §6 cascade (90d floor)** when PR 8 lands.
- **CLAUDE.md Open Questions** — mark the **PDF-library** row demoted to B-144 once §8.2 is formally ratified; record the §8.1 vet-only resolution.
- **New `docs/vet-specialist-panel.md`** (§8.8) — already flagged in `discovery §11`; cross-ref, don't duplicate.

---

## 14. Open sub-decisions (build-time, NOT PM-blocking)

- **S1 — Snapshot storage form:** stored rendered HTML (immutable, simplest) vs stored structured JSON + render-on-demand (responsive, drill-down). B-144-adjacent; pick at PR 3.
- **S2 — Serving mechanics:** stream the artifact through the public route vs mint a short-lived signed URL per view. Both avoid the long-lived-signed-URL trap (§8); pick at PR 3 with `rls-privacy-reviewer`.
- **S3 — 90-day fallback length:** ship 90, confirm the exact number at real-vet R1/R2 (R-debt).
- **S4 — How explicit the SOAP S/O mapping is (R6):** direction set (SOAP-adjacent); depth tuned with GPs.
- **S5 — WSAVA page-1-vs-appendix depth (R7):** owned by the Dr. Chen + nutritionist panel roundtable.
- **S6 — PIMS archival filename/header convention (R8):** add if practice-manager interviews show archival matters.
- **S7 — PDF-generation location (PM-flagged 2026-07-02):** **on-device** (`expo-print` renders the finished server HTML → PDF; simplest, WYSIWYG with the in-app WebView, the standard Expo pattern) vs **server-side headless render** (per the CLAUDE.md "PDF generation server-side" constraint). Same owner UX either way (in-app view + PDF via the share sheet). **Lean:** rendering the *already-server-generated, immutable* HTML to PDF on-device is a *presentation* step, not data assembly — so it arguably honors the constraint's intent — but it touches a hard constraint, so **confirm with the Dir. of Eng at PR 5.** B-144-adjacent.

---

## 15. Persona sign-off (this scoping)

- **Dr. Alex Chen (GP, always-on):** the spine (headline → trend+denominators → diet → meds → provenance) is the 60s scan; the metronidazole concurrent-change note under the charts (GP-0) is the catch that matters most. Synthetic cold read = CLINIC-READY — **but I am not the gate; real GPs are (R1/R2).** ✓ *pending real-vet*
- **Data Scientist:** denominators-everywhere + Established-only + the **report reuses `detection.ts` over the report window** (one statistical source, no Signal/report contradiction) + frequency-over-severity. Counterexample to break at PR 1: a co-started drug crediting the diet → the concurrent-change computation must fire. ✓
- **Trust & Safety / Privacy:** token scopes to one immutable report; expiry + B-143 revocation + B-039 cascade all server-side; no structured export in v1; `rls-privacy-reviewer` gates PRs 3/9. ✓
- **Sr. Product Designer:** Principle 6 (clinical, unbranded, no load-bearing colour, B&W-safe); designed empty/sparse states; one-home-per-fact de-densification. ✓
- **Sr. QA Associate:** AC-1…AC-7 enumerated + per-PR cold-read + the real-vet manual gate + B&W test-print. ✓
- **Dir. of Engineering:** server-side `generate-report` mirrors `generate-signal` (pure `report.ts`/`render.ts` + I/O shell); **no new schema**; HTML-first leaves the render path to the B-144 seam. ✓
- **Product Owner / Backlog Steward:** consumer ownership map (§12) prevents double-building B-117 PR 10 / B-040 / B-102 PR 6 / B-010 / B-023 PR 5 / B-143 / B-144; preconditions B-044/B-115/B-028 sequenced. ✓
- **PM (Sr. Product Manager):** owns the §8.1 vet-only decision (made), the §8.2 HTML-first ratification (lean → confirm at lock), and the real-vet recruiting. Final call on spec-lock. ⟶ *gate*
