# Vet Report (Build Step 9) — Requirements & Build Plan

**Status:** Build-ready DRAFT. | **Date:** 2026-06-22 | **Owner:** Step 9 build sessions.

> **THE SPEC LOCKS AFTER THE REAL-VET R1/R2 PASS.** Everything below is build-ready, but Phase 1 does **not** lock (and no Phase-1 PR merges to `main`) until 5–8 real practicing GPs cold-read a rendered artifact and validate **R1** (would you act on it / want it again?) and **R2** (how does the report actually change hands?). Synthetic vets — the `vet-report-cold-read` subagent and the in-context specialist personas — *shaped* this design and returned **CLINIC-READY** on the mock (`docs/vet-report-mock-review.md` §1), but **they cannot validate trust**. The real-vet panel is the gate (`docs/vet-report-discovery.md` §10; review-doc §5 is reserved for it). If real GPs won't act on it, the IA/contents change before this spec is final.
>
> **Preconditions (must be settled before the sections they feed ship — see §11):** **B-044** (migration-drift audit — a *Now* blocker), **B-115** (protein/confounder over-count — before the diet-confounder line), **B-028** (editable AI structured fields — before any AI-derived field is rendered as fact; PM cleared it to run in parallel, which *removes* the gate rather than blocking on it).
>
> **Lineage.** This spec is the build-ready follow-up to the discovery synthesis (`docs/vet-report-discovery.md`, #214) and the rendered HTML mock + panel review (`docs/vet-report-mock.html` + `docs/vet-report-mock-review.md`, #216). It does not re-derive those; it turns their decisions into a section contract, a data/architecture contract, and a PR-by-PR build plan. Read the mock first — it *is* the page-1 + appendix design this spec productionizes.

---

## 1. The clinical-question spine (everything derives from this)

v1 answers **one or both** questions for a patient the vet has never met (`discovery §6.1`):

1. **"Is this diet trial working?"** — compliance (days logged vs elapsed vs target) + symptom trend across the trial window + confounders (treats, human food, flavored meds, off-diet exposure).
2. **"Is this symptom getting better or worse?"** — frequency/trend over the window, with denominators.

Both reduce to **trend + denominator + confounders, scoped to a window.** A report that answers no specific question is the chronological data-dump every competitor already ships (`discovery §4.1`); Nyx's differentiation is that it exports a **synthesized clinical answer a GP can act on in ≤60s**, not that it exports.

**The success bar (`discovery §1.2`):** *v1 succeeds when a GP, handed this report for a diet-trial / GI-symptom patient she has never met, can answer the report's clinical question in under 60 seconds and trust it enough to let it inform the encounter.*

**Substrate honesty:** the app already carries `diet_trials` + the profile diet-trial card (days elapsed / target + compliance %, schema reference query [3]). v1 renders **that existing trial data** honestly. There is **no** richer guided "trial workflow" today and v1 does **not** build one.

---

## 2. Decisions — what this spec ratifies

The discovery's §8 Open Questions, resolved. **§8.1 / §8.4 / §8.5 are decided; §8.2 is a strongly-endorsed PM lean carried as the design basis (one format gate remains); §8.3 is this spec's call.**

| # | Question | Decision |
|---|---|---|
| **8.1 Audience** | vet-only · banded both-sides · separate docs | **VET-ONLY (Strawman A) — DECIDED by PM, 2026-06-22.** The "for the owner" band is **removed**. The report is a single clinical artifact in the vet's familiar (SOAP-adjacent) register. The **owner still has full access** to the report they generate — same artifact, no hidden clinical layer (Principle 7 / transparency) — but there is **no owner-readable band on the report**. The owner's *ongoing* surface is the **Patterns dashboard (B-023)**, which is complementary, not redundant. This closes discovery §8.1 → option (a) and resolves Research-Debt **R4** (no owner-band A/B needed). |
| **8.2 Delivery format** | HTML-first + derived PDF · PDF-first · co-equal | **HTML-FIRST (option a) — design basis of this spec** (the mock is HTML; PM endorsed twice on iteration-speed + handoff grounds, `discovery §7.2`). The canonical immutable artifact is **server-rendered HTML**; the save/print **PDF is a faithful derivation** of it (Phase 4 / **B-144**). This **demotes the blocking "which PDF library" Open Question** to the B-144 render-path spike (`discovery §7.3`). **The one remaining format gate:** formal PM ratification of HTML-first at spec-lock + the B-144 spike — neither blocks Phase 1's *data/query* layer (render-agnostic). If real-vet **R5** shows print/PDF is the only thing that survives the clinic workflow, the primary artifact flips to PDF-first; the data layer is unaffected. |
| **8.3 Report scope & control** | fixed · owner-range · trial-scoped · since-last-visit | **DEFAULT CASCADE + owner override + cherry-pick guard** — see §6. **(1)** since last vet visit (`vet_visits`) → **(2)** else active diet-trial window → **(3)** else a **90-day fallback**. The owner may override to a custom range **at generation time** (an in-app control on the B-023 bridge, *not* a control on the static artifact). **Cherry-pick guard:** any owner-customized window **must disclose the count of in-pet symptom events that fall outside it** ("N events outside this range") — the synthetic GP's strongest non-obvious add (`review §3.3`, GP-3). |
| **8.4 Severity** | omit · owner-reported-only in appendix · averaged headline | **One-line ratification:** lead with **frequency/trend**; render severity **only as owner-reported, per-event, in the appendix** — **never an averaged headline** (`discovery §8.4`; Dr. Chen trusts frequency over owner-rated severity). *(Triggers a Tier-2 fix — see §13: technical-spec §7 AC and design-principles §6 both still say "severity averages," which this decision reverses.)* |
| **8.5 Correlation rigor tier** | Established-only · Established + Early | **One-line ratification:** **`Established`-only** on the report (associational, denominatored, multi-sample). `Early`-tier patterns stay owner-side. Putting `Early` on the report would imply rigor the data lacks. This **narrows the CLAUDE.md "emerging-signals tier" Open Question for the report surface only.** |
| **8.6 B-115** | dedup · ratify raw-count | **Precondition** — resolve B-115 (dedup exact-timestamp same-food treat re-logs) **before the diet/confounder line ships** (Phase 2 / §11). Overstating a confounder's prevalence is the wrong headline for a diet-trial owner. |
| **8.7 B-028** | gate on B-028 · owner-confirmed fields only | **v1 renders owner-confirmed fields only;** AI-derived-unedited structured fields are **excluded** (or carry an explicit provenance tag). PM cleared **B-028 to run in parallel** — shipping the editable-fields layer *removes* this precondition rather than gating on it (§11). |
| **8.8 Specialist panel — where** | sub-roster in `personas.md` · own doc · doc-local | **Own PR-evolvable doc** `docs/vet-specialist-panel.md`, cross-referenced from `personas.md` + the routing table. Tier-2 — flagged in §13, **not written by this spec**. |
| **8.9 Success signals** | S2 · S2+S3 · all three | **S2 (cold-read orient ≤60s) is the build bar** (what `vet-report-cold-read` measures); **S3 ("wants it again") instrumented via B-047**; **S1 (acts on it)** deferred to the real-vet feedback channel. |

**Decided architecture this report inherits (do not re-litigate — `discovery §2.1`):** server-side render via the to-be-built `generate-report` Edge Function (never client-side); share by token, no vet account; immutable snapshot row in `vet_reports`; free forever (Principle 7); clinical-grade, unbranded (Principle 6); scannable in 60s.

---

## 3. The report IA — section contract (the 60s scan path)

The page-1 order is the cold-read scan path (`discovery §6.4`); it is **productionized verbatim from the mock** (`docs/vet-report-mock.html`). One home per fact (de-densification, `review §4` GP-4): the **glance** list is the headline; each section below is the detail — no restatement.

**Page 1 — the clinical one-pager (primary, self-sufficient; must pass the cold read alone):**

0. **Signalment header** — name · species · breed · sex/neuter · age (+ DOB) · owner-recorded weight with date · "Owner-reported summary · `<range>` · `<N>` days · Range: `<scope basis>`" · **"Prepared for veterinary review · Not a diagnosis."**
1. **Safety-leads slot** *(conditional, directly under signalment)* — when an **intake-decline / feline-48h-window / symptom-worsening** flag is present it renders here, impossible to miss (`discovery §6.3` criticalist; mirrors the Signal's "safety leads"). **When absent, nothing renders** — an empty "all clear" box is **never** shown (absence ≠ wellness). *(Mochi's improving sample triggers none — correctly empty. The Sam cat mock exercises this slot — §12.)*
2. **Summary — this window** — the clinical-question headline + an "at a glance" list (symptom counts/denominators, trial compliance, off-diet exposures, medication adherence one-liner) + a **logging-coverage line** ("logged on N of M days; absence of an entry is not evidence a symptom did not occur").
3. **Symptom frequency & trend** — per symptom: a **non-colour** weekly chart (bar height = count; dashed **trial-start marker**; date anchors) + a denominatored read (first-half vs second-half) + a **gap callout**. **A `Reading the trend` note** sits **directly under the charts** naming any concurrent confound (e.g. metronidazole started the same day as the diet) — *the single highest-consequence misread to prevent* (`review §1` GP-0: a page-1-only reader must not credit the diet for a co-started drug).
4. **Diet & feeding** — trial diet + start/target/day · feeding method + meal-completion (meals-only) · **human-food line (B-102)** · treats summary · pointer to the WSAVA-superset appendix.
5. **Meal & treat timing vs symptoms** — associational, denominatored, **never causal** ("within ~30 min of eating in N of M timed episodes"); compress to its two-line finding (`review §4` GP-4).
6. **Medications + adherence (B-117)** — drug · strength · route · frequency · indication · start date + the **computed adherence line** + a **concurrent-change note** when a drug overlaps the trend window.
7. **Data notes (provenance footer)** — owner-reported; count of estimated/window timestamps; "every count traces to the appendix."

**Appendices (page 2+) — the provenance Dr. Chen's trust rests on; verbose is correct here:**

- **A — Symptom event log:** every symptom event in order, with **occurred (owner-reported, B-010) vs logged** columns, time-confidence tag (`seen`/`est`/`range`), per-event owner-reported severity (1–5, **never averaged**), owner note.
- **B — Off-diet exposures (confounders):** every treat + human-food item with date, category, item, note. Poultry/allergen exposures on an elimination trial flagged explicitly.
- **C — Diet history (WSAVA-superset):** primary diet, amount/schedule, who feeds, water, treats, human food, supplements, **food used to give medication**, active conditions.
- **D — Medication log:** per drug — regimen, doses logged/scheduled, adherence narrative (honest about unconfirmed doses).
- **E — How to read this report:** the legend (owner-reported / denominators / logging coverage / meal completion / severity / time confidence / associations / deleted entries / range).

**Every derived number on page 1 traces to an appendix line item** (reference query [4]). This is non-negotiable (Dr. Chen's core trust lever).

---

## 4. Must-carry sections — requirements, not options

These are **already-built consumers explicitly gated on Step 9** (`discovery §2.2–2.3`). Each is a hard requirement with a clinical trap if mis-rendered; each is owned by a PR in §12. The **`vet-report-cold-read` subagent is a mandatory gate** on every one.

| Source | What the report MUST carry | The trap if mis-rendered | Owned by |
|---|---|---|---|
| **B-117 PR 10** (`nyx-medication-logging-requirements.md` §7) | A **Medications** section: per regimen — drug, strength, dose, route, frequency, indication, start date — **+ a computed one-line adherence summary per drug** from logged doses ("logged on 41 of 45 days — 82 of 90 doses; 8 unconfirmed, none refused"). A regimen with **zero logged doses reads "adherence not tracked," never "compliant."** Unconfirmed ≠ missed ≠ refused. | A drug overlapping the trend window, rendered without a **concurrent-change note**, lets the diet silently take credit for an antibiotic — the highest-consequence misread on the page. | §12 PR 5 |
| **B-040** (`nyx-free-feeding-requirements.md` §6) | Free-fed / continuously-available food rendered with the **verbatim string "Intake not directly observed."** Absence of a logged intake **never** renders as "didn't eat." Meal-completion is **meals-only** (treats + free-fed excluded). | Reading absence-of-log as a refusal turns un-observed grazing into a false anorexia signal — or buries a real one. | §12 PR 6 |
| **B-102 PR 6** (`human-food-format-requirements.md` PR 6) | A **distinct, scannable human-food line** — "owner supplemented with human food N× this window (dates/items)" — because human food is the **#1 diet-trial confounder.** | Folding human food into "treats" hides the confounder most likely to make a working trial read as failing. | §12 PR 6 |
| **B-010** (`research/2026-05-event-timestamp-uncertainty.md`; CLAUDE.md Resolved) | Discovered/estimated events render as a **time range or estimate, never a false precise point** ("found 07:44, occurred ~04:00–07:44"). Appendix A carries **occurred-vs-logged** columns + the `seen`/`est`/`range` confidence tag. | A vomit logged 07:44 but occurring ~04:00 moves symptom→meal latency from minutes to hours — *dietary indiscretion vs bilious vomiting syndrome*, a different workup. | §12 PR 7 |
| **B-023 PR 5** (`nyx-analytics-dashboard-requirements.md` §9) | A **"Share with my vet"** bridge from the Patterns dashboard that assembles **this** report (default range per §6's cascade). **Clinical content is the report's, not the dashboard's** — warm owner cards and owner-only n=1 reads **never** leak onto the clinical export. | A dashboard's reassuring "doing great!" card on the clinical export destroys the trust the report exists to earn. | §12 PR 8 |

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
8. **No load-bearing colour (accessibility / B&W print).** Trend/severity carried by number · bar height · label · position — survives grayscale and print. **Reuse the B-023 colour-as-wellness ruling** (verdict colour only on Established multi-sample metrics; adverse-falling = calm/muted, never a green "win"; single observation neutral). Do **not** re-decide colour semantics.

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

---

## 8. Trust & Safety — the share link is the app's first unauthenticated path to pet health data

First-class (`discovery §7.4`); **`rls-privacy-reviewer` is the mandatory build-time gate** — this is its first real exercise.

- **Scope:** the token scopes to the **single immutable report it was minted for** — **never a live query into the whole record.** Hard constraint.
- **Consent moment:** explicit owner action ("Share with my vet") mints + shares; the artifact is a snapshot at generation time.
- **Expiry / revocation:** 30-day server-side expiry exists (`token_expires_at`, enforced by the public RLS policy — server-side, never client). **B-143 adds owner-initiated revocation** ("kill this link"); passive expiry alone can't retract a mis-shared link.
- **No token leakage:** `share_token` is UUIDv4 (~122 bits, non-enumerable); ensure **no token in logs or `Referer`**, no sequential/guessable component, and **bounded signed-URL TTLs** on the stored artifact and any embedded health photos (a long-lived signed URL is a de-facto public link). *(The clinical report carries no decorative photos — Principle 6 — which keeps the embedded-media surface minimal.)*
- **Deletion cascade (B-039):** **no live link may survive** the cascade — `vet_reports` rows + the Storage artifacts are purged, invalidating the token. HTML-first server-control makes "kill the row → kill the link" true; an emailed file never could (a point *for* HTML-first over emailing a PDF).
- **No structured export in v1** (CSV/JSON) — it widens the unauthenticated surface to the whole record and vets have nothing to ingest it into (`discovery §4.3/§7.1`). Deferred to B-041/B-089.

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

The mock (`vet-report-mock.html`) is **Mochi: an improving diet-trial dog** — it correctly leaves the **safety-leads slot empty**, so it **cannot exercise** that slot. Before/alongside the real-vet R1/R2 sessions, build the **second mock: the cat / safety-led case** (Sam — intake-decline + feline 48h window), where the safety slot **leads** (`review §4`). It strengthens R1/R2 by showing GPs both the calm-improving and the urgent-decline renders. *(Mock artifact, not a build PR — pairs with the real-vet recruiting in §11.)*

---

## 11. Preconditions & the real-vet gate

**The real-vet R1/R2 pass is the spec-lock gate** (top-of-doc + `discovery §10`). Recruit 5–8 real practicing GPs; capture R1 (act-on/want-again) + R2 (handoff mode) per reviewer in `vet-report-mock-review.md` §5. Phase 1 does not lock until it passes; if most GPs wouldn't act, the IA/contents change first.

**Build-time preconditions (per the task — flagged, sequenced):**

| Item | What | Gates | Status / note |
|---|---|---|---|
| **B-044** | Apply the rest of `003_attachments.sql` + audit migrations-on-disk vs live DB (`vet_visit_attachments`, `food_items.photo_path`). | **Now-blocker.** Before a new clinically-load-bearing read path ships you must know no column it reads is silently absent; the "since last visit" scope + any future vet-visit context lean on it. | Open (`Now`). Run the full audit before Phase 1 merges. |
| **B-115** | Dedup exact-timestamp same-food treat re-logs before ranking protein/confounder exposure. | **The diet/confounder line (PR 6).** Overstating a confounder's prevalence is the wrong headline for a diet-trial owner. | Open — PM/Data-Scientist call; now a Phase-2 precondition. |
| **B-028** | Editable AI structured fields + "Edited [date]" provenance. | **Any AI-derived structured field rendered as fact (PR 7).** v1 alternative: render **owner-confirmed fields only**. | Open — **PM cleared it to run in parallel**, which *removes* the gate. Either B-028 ships first, or PR 7 renders owner-confirmed fields only. |

**Real-vet Research Debt that informs later phases (`discovery §10`):** R1/R2 (gate, above) · R3 severity (confirm §8.4) · R4 owner-band (**resolved** — removed) · R5 web-link-vs-print (could flip §8.2) · R6 SOAP explicitness (direction set: SOAP-adjacent; *how explicit* is open) · R7 WSAVA page-1-vs-appendix depth (owned by the Dr. Chen + nutritionist panel roundtable) · R8 PIMS archival filename/header convention.

---

## 12. PR-by-PR build plan

Four phases, ~10 PRs (the B-117 shape). **Every PR is gated by `vet-report-cold-read` on the rendered artifact;** load-bearing logic also gates `adversarial-reviewer` (statistics/clinical) + `rls-privacy-reviewer` (the share path). **Phase 1 locking is gated on the real-vet R1/R2 pass (§11).** PRs within a phase marked *(parallel)* are disjoint (different files/sections) and can run as separate branches — the shared-file collision to expect at wrap is `STATUS.md` + the backlog.

### Phase 1 — Core clinical one-pager (the spine), HTML-first
*Renders for an improving diet-trial dog end-to-end. No must-carry consumers yet.*

- **PR 1 — Data/query + assembly layer (`report.ts`, pure).** Reference query [4] + [3] + vet_visits pull → structured snapshot (signalment, per-symptom windowed counts + denominators + weekly buckets, diet summary, provenance log), with the §5 honesty invariants baked in and the §6 scope cascade. Reuses the detection engine's `Established`-tier correlation logic over the window (§7). **No render, no I/O, no LLM.** Offline `deno test`. *(adversarial-reviewer: denominators, window-consistency, absence≠wellness, the metronidazole-confound concurrent-change computation.)*
- **PR 2 — HTML render (`render.ts`, pure).** Snapshot → canonical immutable HTML (the mock, productionized): non-colour trend charts + trial-start marker, the `Reading the trend` confound note **directly under the charts** (GP-0), `@page` print CSS, B&W-safe. **`vet-report-cold-read` gate.**
- **PR 3 — `generate-report` Edge Function + share token + serving.** I/O shell (caller-auth → ownership re-check → window → pull → `report.ts` → `render.ts` → store artifact → insert `vet_reports` → return token/url/path) + the public token-gated `view-report` route (expiry-enforced, short-lived signed URL or stream) + rename `lib/pdf.ts` → `lib/report.ts` client invoke. **`rls-privacy-reviewer` gate (first unauthenticated path).** Deploy via the B-082 MCP path.
- **PR 4 — In-app entry + share.** Replace the `app/report.tsx` placeholder with the generate→share flow (default-cascade range, generate, system share sheet, copy link) + the §6 empty / low-data / expired render states.

### Phase 2 — Must-carry consumers *(largely disjoint → parallelizable)*
- **PR 5 — Medications + adherence (= B-117 PR 10)** *(parallel)*. The §4 Medications section + computed adherence line + the **concurrent-change note** (GP-0). *adversarial: adherence honesty (unconfirmed ≠ missed ≠ refused; 0 doses → "not tracked").* Closes B-117 Phase D.
- **PR 6 — Diet honesty: free-fed (B-040) + human-food line (B-102 PR 6) + WSAVA appendix** *(parallel)*. "Intake not directly observed" verbatim; the distinct human-food confounder line; appendix C as a WSAVA superset. **Precondition: B-115** (dedup) before the confounder line.
- **PR 7 — B-010 timestamp-confidence rendering** *(parallel)*. Estimated/window events as ranges (never a false point); appendix-A occurred-vs-logged columns + `seen`/`est`/`range` tags. **Precondition: B-028** (or render owner-confirmed fields only). *adversarial: the latency-misread trap.*

### Phase 3 — The bridge + revocation *(owner band removed → this phase shrank)*
- **PR 8 — "Share with my vet" bridge (= B-023 PR 5).** From the Patterns dashboard; assembles **this** report (default cascade); **clinical content is the report's, not the dashboard's** — no warm-card / n=1 leak. Reconcile the B-023 §9 30d→90d default (§6/§13).
- **PR 9 — Owner-initiated revocation (= B-143).** "Kill this link" on each generated report; server-enforced (`token_expires_at = NOW()`), never client-only. **`rls-privacy-reviewer` gate.**

### Phase 4 — PDF derivation + edge-case hardening
- **PR 10 — Save/print PDF (= B-144 spike → impl) + edge-case states.** One-tap "Save / Print PDF" as a faithful derivation of the canonical HTML (render-path picked by the B-144 spike) + the remaining QA edge states (expired/revoked/deleted/back-dated-before-trial). **`vet-report-cold-read` on the PDF artifact.**

**Consumer ownership map (so nothing is double-built):** B-117 PR 10 → PR 5 · B-040 vet-report rendering → PR 6 · B-102 PR 6 → PR 6 · B-010 item (5) → PR 7 · B-023 PR 5 → PR 8 · B-143 → PR 9 · B-144 → PR 10.

---

## 13. Acceptance criteria (QA — per the build step + the cold-read bar)

Tie every PR back to the **technical-spec §7 AC** *(corrected per §8.4 — see the Tier-2 edit below)* and the **S2 cold-read bar** (orient ≤60s). A PR is not done until its row passes.

- **AC-1 (scope)** — range defaults to the §6 cascade (since-visit → trial → 90d); owner override works at generation; **a custom window discloses out-of-window event counts** (cherry-pick guard). *(PR 4 / PR 8)*
- **AC-2 (server-side render)** — the report is generated by the `generate-report` Edge Function via reference query [4]; never client-side. *(PR 3)*
- **AC-3 (content)** — signalment · windowed **frequency counts with denominators** · diet/meal log with food names + quantities · active conditions + diet trials · **medications + adherence** · **human-food line** · **free-fed "Intake not directly observed"** · **B-010 ranges** · provenance appendix. **No severity averages** (frequency-led; severity owner-reported-only in appendix). *(PRs 1/2/5/6/7)*
- **AC-4 (clinical tone)** — clinical, unbranded beyond a small footer; **no load-bearing colour** (B&W-print-safe); passes the **`vet-report-cold-read` CLINIC-READY** bar **on a rendered artifact**. *(every PR)*
- **AC-5 (share)** — a `vet_reports` row with `share_token` + 30-day expiry; system share sheet + copy link; `nyx.app/report/{share_token}` opens in a browser **with no Nyx account**; expiry **and revocation (B-143)** enforced server-side by RLS. *(PRs 3/4/9)*
- **AC-6 (honesty invariants — §5)** — denominators everywhere; associational-never-causal; absence≠wellness (empty safety slot when absent, never a false all-clear); n=1 reads + `Early`-tier excluded; deleted entries excluded **and said to be**. *(every PR; adversarial-reviewer)*
- **AC-7 (privacy — §8)** — token scopes to the single report; no token in logs/`Referer`; bounded signed-URL TTLs; deletion cascade kills the link. *(PRs 3/9; rls-privacy-reviewer)*

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
