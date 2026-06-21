# Vet Report — Product Discovery Round (Step 9 foundation)

*Kickoff prompt — paste the body below into a fresh session. PM-ratified scope (2026-06-21): the audience treatment is a **strawman axis** (not pre-decided); **one prioritized** discovery session; the round runs on **synthetic** personas and a **ranked real-vet-validation list gates the requirements spec**. This prompt is a discovery kickoff, not the deliverable — the deliverable is `docs/vet-report-discovery.md`.*

---

You are the Nyx product team running a **product-discovery round** to lay the foundation for the **vet report (Build Step 9)** — the clinical payoff of everything the app logs.

**This session is DISCOVERY, not build.** No code, schema, migrations, or build-ready requirements spec. The single deliverable is one foundation document, **`docs/vet-report-discovery.md`**, ending in *decidable* Open Questions + recommendations that tee up a later requirements-spec session and the build.

Work as the full product team, with agency. Surface dissent via the Persona Conflict Protocol — never resolve a conflict silently.

---

## The outcome this discovery hangs from

Before anything else, sharpen the single desired **outcome** this report exists to produce — it is the root of the opportunity solution tree in Workstream D, and the method falls apart without it. Hypothesis to refine, not accept: success = **a vet trusts the report enough to let it inform the encounter for a patient she's never met** (Dr. Chen's bar) — *not* owner engagement, retention, or screen-time. Make "how would we know v1 worked?" answerable by the end: propose 2–3 candidate success signals (e.g. the vet would act on it / would want it again next visit / can orient in under 60 seconds) and carry them into Open Questions. Pets > $: this report is care, never a conversion surface.

---

## Session scope, priority & done-definition

- **One prioritized session.** Protect the spine first; where time runs short, **mark a section "thin — needs follow-up" rather than padding it.** Priority order (1 = must be solid): **(1) Workstream A** — must-carry inventory reconciled to current `STATUS.md`; **(2) Workstream E** — clinical-question spine + strawmen; **(3) Workstream F** — delivery/format + threat-model; **(4)** Open Questions + Recommendations + ranked Research Debt; then **(5) D**, **(6) C**, **(7) B** as an enabling step. C and D may be thinner — log gaps as research debt rather than forcing depth.
- **Synthetic round; real vets gate the spec.** These personas are synthetic. Produce the discovery doc on synthetic input, but the **ranked Research Debt list (impact × uncertainty) is a first-class deliverable and the explicit gate** before the requirements spec is locked: its top items must be validated with *real practicing vets* before the spec session.
- **Done-definition for the discovery itself:** every Open Question is *decidable* (the PM can pick an option, not "explore more"); the must-carry inventory is reconciled to current STATUS; 2–3 strawmen exist and have been critiqued; the delivery recommendation states how it reshapes the PDF-library Open Question; the ranked Research Debt list exists.
- **Out of scope for this discovery:** writing the requirements spec; choosing the PDF/render library (a follow-up engineering spike); any code/schema; editing `personas.md`, the technical spec, or the competitive/research docs.

---

## Phase 0 — Orient (read before anything else)

**Must-read:**
- `docs/nyx-technical-spec-v1_0.md` — §7 Vet Report Export, Architectural Decisions, Open Engineering Questions, Build Sequence step 9.
- `docs/nyx-design-principles-v1_0.md` — Principle 6 (vet report is clinical-grade), Principle 5 (empty states are features), Visual Language, Copy Principles, and the "vet portal visual language" open design question.
- `docs/nyx-research-v1_0.md` — market, persona, and user-behavior data. This is the evidence base; ground product claims in it rather than asserting them.
- `docs/nyx-competitive-landscape-v1_0.md` — the authoritative competitive baseline. Read it before Workstream C; do not re-derive what it already covers.
- `docs/personas.md` — Dr. Alex Chen, Designer, Data Scientist, Trust & Safety/Privacy, QA, Jordan, Sam; the "Vet report" routing-table row.
- `.claude/agents/vet-report-cold-read.md` — this already encodes what "clinic-ready" means; treat it as the acceptance lens. Also skim `rls-privacy-reviewer.md` and `adversarial-reviewer.md`.
- `STATUS.md` — note "Step 9 resumes, blocked on the PDF-library question," and every parallel-track item marked "blocked on Step 9."
- `CLAUDE.md` — Open Questions table, the two safety invariants, Persona Conflict Protocol, Documentation Update Protocol (Tier 2), Backlog Protocol.

**Reference as needed:**
- `docs/nyx-schema-v1_0.sql` — `vet_reports`, reference query [4], and the data the report draws on (`events`, `meals.intake_rating`, `occurred_at_confidence`, `diet_trials`, `medications`/`medication_administrations`, `feeding_arrangements`).
- Research briefs: `docs/research/2026-05-event-timestamp-uncertainty.md`, `docs/research/2026-05-feeding-windows-and-partial-eating.md`, and `docs/research/README.md` (brief format/conventions).
- Requirements docs that produce report inputs: `nyx-free-feeding-requirements.md`, `nyx-medication-logging-requirements.md`, `nyx-analytics-dashboard-requirements.md`, `nyx-account-deletion-requirements.md`, `nyx-ask-requirements.md`, `human-food-format-requirements.md`.

**Prior-art sweep:** before designing, search existing branches / PRs / `docs/backlog.md` for any earlier vet-report thinking (beyond spec §7) so you extend it rather than re-derive it.

**Robustness check:** if `docs/nyx-research-v1_0.md` or `docs/nyx-competitive-landscape-v1_0.md` is absent, the rename/wiring PR hasn't merged yet — flag it and stop, don't proceed by inventing their contents (per CLAUDE.md's "if a referenced document does not exist yet, stop and flag it to the PM" rule).

---

## Workstream A — Current state + the "what the report must carry" inventory  *(PRIORITY 1)*

Don't start from a blank page. First synthesize the *decided* scope (spec §7, Principle 6, Dr. Chen, the cold-read lens) and the relevant persona/behavior findings from `nyx-research-v1_0.md`.

**Reconcile against current `STATUS.md` / `docs/backlog.md`, not the spec** — much of this shipped since the spec was written. In particular, these are already-built consumers **explicitly gated on Step 9** — treat them as *committed requirements the report must satisfy*, not open possibilities:
- **B-117 PR 10** — vet-report "Current medications" section + per-drug computed adherence summary
- **B-023 PR 5** — the "Share with my vet" bridge from the Patterns dashboard
- **B-040** — vet-report feeding-method rendering ("intake not directly observed" verbatim)
- **B-102** — vet-report human-food line

Then inventory the rest of the report-relevant scope and, for each, state what it is, why the report must represent it *honestly*, and the clinical trap if it doesn't:
- B-010 timestamp confidence (witnessed vs estimated vs window — never a bare point for a discovered event)
- B-028 editable AI structured fields (a mis-read "Blood: none" would feed the report)
- B-115 protein exposure over-count (overstating a confounder = wrong headline)
- B-044 vet-visit attachment sync (a migration-drift blocker for Step 9)
- The standing rule: **n=1 AI reads are owner-facing only — never on the vet report.**

This inventory is a core output.

**Scoping question this raises (carry to design / Open Questions):** what populates a given report — a fixed window, an owner-chosen date range, or auto-scoped to the active diet trial — and who controls it.

---

## Workstream B — Specialist vet panel (propose; light & early)  *(enabling)*

Beyond Dr. Chen (GP), assemble a **panel of specialist vets that rotates per question** — e.g. internal medicine / GI, dermatology, cardiology, oncology, behavior, a board-certified veterinary nutritionist, emergency/criticalist, radiology/imaging — plus a vet tech/nurse and a practice manager (PIMS/workflow angle), and species/breed-specific lenses as needed. Define **how rotation works** and **how the panel composes with** the in-context Dr. Chen persona and the `vet-report-cold-read` subagent.

Set this up **early and lightly** — enough to use as lenses through C–F; don't over-build the rotation taxonomy. **Per PM decision:** write the panel as a *proposal inside the discovery doc*; **do not edit `docs/personas.md`** — flag "formalize the panel into `personas.md`" as a Tier-2 PM decision. Then actually *use* the panel throughout C–F.

---

## Workstream C — Competitive research (extend the baseline)  *(may be thinner)*

`docs/nyx-competitive-landscape-v1_0.md` is your starting point — treat it as authoritative and **build on it rather than rewriting it.** This can be a thinner pass: extend it for the vet-report angle and **log unresearched gaps as research debt** rather than forcing exhaustive coverage. Use **real, cited web research** where the network policy allows (the `deep-research` skill, or WebSearch/WebFetch); otherwise mark claims as model-knowledge and add them to research debt.

1. **Direct pet-health apps** — what data they surface, and specifically what (if anything) they export/show *to a vet*.
2. **General-purpose tools owners actually use** — spreadsheets, Notes, camera roll, paper, pasting history into ChatGPT. Treat these as the real incumbents.
3. **Vet-side software** — PIMS / EHRs, lab & diagnostic report formats, referral letters, SOAP notes. **What format do vets receive and ingest data in today, and what would slot into their workflow vs. create friction?**
4. **Bonus — human-medicine analogs** — patient-generated health data, after-visit summaries, specialist referral letters, and the "Sigma-Aldrich / certificate-of-analysis" aesthetic (analytical but ugly) as the baseline our design hypothesis aims to beat.

Capture the vet-report-specific teardown (what they show · format · delivery · strengths · gaps · steal/avoid) **in the discovery doc.** If findings warrant updating the canonical `docs/nyx-competitive-landscape-v1_0.md`, flag them as a Tier-2 proposed edit — don't write them in unilaterally.

---

## Workstream D — Discovery interviews (Continuous Discovery Habits) + anti-bias guardrails

Run discovery in the spirit of Teresa Torres' *Continuous Discovery Habits*. Interview key stakeholders — pet owners (Jordan, Sam, + variants), GP vets, vet techs/nurses, rotating specialists, and a practice manager — using Torres tooling: **interview snapshots, an opportunity solution tree rooted in the desired outcome named above, jobs-to-be-done**, and an explicit **"assumptions to test"** list.

**Owner JTBD to study explicitly (Jordan):** *when, where, and how* the owner generates and hands the report over (phone in the waiting room? emailed ahead? printed?). That context constrains format more than aesthetics — a multi-page PDF is wrong for a phone shown across a consult desk.

**These interviews are SYNTHETIC (persona role-play). Guard hard against an echo chamber:**
- Ground every non-obvious claim in cited research (`nyx-research-v1_0.md` first, then external sources). Tag each insight **[EVIDENCE]** vs **[ASSUMPTION]**.
- **Rank assumptions by impact × uncertainty**, each with a one-line "what evidence would change our mind." These feed the ranked Research Debt deliverable (the spec gate).
- Run a deliberate **adversarial / skeptical vet** who distrusts owner-collected data, worries about liability, and won't change workflow. Let it attack the value prop.
- Surface disagreement via the Persona Conflict Protocol; flag, don't resolve.

---

## Workstream E — Report vibes / design vision  *(PRIORITY 2)*

**Start with the clinical-question spine.** Name the 1–2 questions v1 must answer — e.g. "is this diet trial working?" / "is this symptom getting better or worse?". The information architecture flows from these; a report that answers no specific question is a data dump that fails the 60-second scan.

Then pressure-test the design hypothesis: **the vet is the primary consumer.** Resolve Principle 6's tension — clinical-grade *and* genuinely well-designed (Calm / Linear / Oura, not decorated; beat the Sigma-Aldrich baseline) while fully satisfying the analytical/clinical need. Frame the build as a **discipline-extensible system, but ship the wedge** — the "system" is a *seam plan*, not built abstraction; v1 serves the diet-trial / GI-symptom reactive-tracking owner; name the v1 cut explicitly and defend it.

**Produce 2–3 deliberately divergent strawman layouts (text/markdown) early**, then spend the panel's energy — skeptical vet + Dr. Chen included — tearing them apart. Vary them on purpose along two axes:
- **(a) Density / register** — dense clinical one-pager ↔ narrative "what changed" summary ↔ hybrid.
- **(b) Audience treatment** — *this is how we decide the audience question rather than pre-deciding it*: include at least one **vet-only clinical one-pager** and at least one **single artifact with an owner-readable summary band**. The recommended direction **emerges from the critique** and goes to Open Questions for PM ratification.

(A text mock sharpens the in-context read and pre-stages the `vet-report-cold-read` subagent, but does **not** satisfy it — that agent wants a *rendered* artifact, which arrives at build.)

Work these design questions *against the strawmen*:
- **Information architecture** — the 60-second scan path, the two-audience tension, and what's explicitly out of v1.
- **Sparse / partial / empty report** — what it shows at day 3 or across a logging gap. Principle 5 + the clinical-honesty trap: never imply completeness the data doesn't have.
- **Provenance & verifiability** — summary-only vs. summary + an appendix / drill-down to the underlying events. Dr. Chen's core trust lever ("can I check this?"); interacts directly with Workstream F.
- **Statistical honesty** — denominators + observation windows on every count; correlations carry counts and stay **associational, never causal** (the report's sibling of the Signal engine's `validatePhrasing`).
- **Intake honesty** — free-fed "intake not directly observed" renders verbatim (B-040, *shipped*); never let absence-of-logged-intake read as "didn't eat"; intake decline ≠ preference; represent shared-bowl / grazing ambiguity honestly (Sam).
- **Self-framing — authority & limits** — how the artifact states "owner-reported data," "not a diagnosis," and the liability boundary *without* undermining the trust it's built to earn (inherits associational-not-causal).
- **Owner-facing copy** — clarifies without spiking anxiety and without false reassurance (n=1 discipline; the report is generated at a stressful moment).
- **Accessibility** — non-colour severity encoding (shape / label / position) that survives grayscale and print; **reuse the B-023 colour-as-wellness ruling** rather than re-deciding colour semantics.

Also test the strawmen against the **trust-killers Dr. Chen names** (back-dating, owner-rated severity — she trusts *frequency* over severity, missing denominators, no provenance) and the **QA edge-case data scenarios** (zero-event / empty, share-token-after-expiry, back-dated-before-trial-start, deleted-pet).

---

## Workstream F — Delivery & format (genuinely open — do NOT assume PDF)  *(PRIORITY 3 — reshapes the blocking Open Question)*

Pressure-test the PDF default. Weigh, against what discovery says vets actually want to *receive and ingest*: preformatted PDF; responsive shareable web link (the spec's current default); structured/underlying data export (CSV/JSON — note the interaction with the provenance/appendix decision in E); a PIMS/EHR-ingestible format (and whether standards like FHIR/HL7 even apply in veterinary medicine); an "AI-ready context pack" (cf. backlog B-089); print. Recommend a direction **with rationale** — don't default to PDF.

- The recommendation **reshapes (not just informs) the blocking PDF-library Open Question** — if discovery lands on a web link or structured export, "which PDF lib" stops being the question. State explicitly how it rewrites that Open Question. The render-library *choice itself* is a follow-up **engineering spike, not a discovery deliverable.**
- **Trust & Safety threat-model sketch (first-class, not a footnote):** the share link is the *first unauthenticated path to pet health data* in the entire app. Sketch what's exposed, the consent moment, expiry / revocation, and link-enumeration risk — this materially constrains the format choice (a structured CSV/JSON export widens the surface vs. a view-only page). Include the **share-link lifecycle vs. account deletion** (the artifact is user data; no live link may survive the B-039 deletion cascade). `rls-privacy-reviewer` is the build-time backstop; this session flags, doesn't build.

---

## Deliverable — `docs/vet-report-discovery.md`

One discovery synthesis (not a build-ready spec; not a `docs/research/` evidence brief, which carry no recommendations). Suggested structure:

1. Purpose, scope, the desired outcome / success definition, and "out of scope for this discovery"
2. Current state + must-carry inventory (reconciled to current STATUS), incl. the Step-9-gated committed consumers and the scoping question (A)
3. Specialist panel — proposal + "formalize?" flag (B)
4. Competitive teardown for the vet-report angle + any Tier-2 proposed edits to `nyx-competitive-landscape-v1_0.md` (C)
5. Discovery synthesis — opportunity solution tree, insights tagged evidence/assumption, dissent (D)
6. Design vision — clinical-question spine; 2–3 divergent strawmen + panel critique; the **audience recommendation** (→ Open Question to ratify); system vs. wedge; sparse-data / provenance / statistical-honesty / intake-honesty / self-framing / accessibility decisions (E)
7. Delivery & format recommendation, **how it reshapes the PDF-library Open Question**, + Trust & Safety threat-model sketch (F)
8. **Open Questions** — decidable, PM-routed. Include the audience recommendation to ratify and which existing CLAUDE.md Open Questions this narrows (esp. PDF-library). Propose resolutions where the evidence supports one.
9. **Recommendations & next steps** — what the requirements-spec session should decide first
10. **Research Debt (ranked by impact × uncertainty)** — first-class; the explicit **gate of real-vet validation before the spec locks**; each item carries "what evidence would change our mind"

**Protocols to honor:** Persona Conflict Protocol; Tier-2 doc protocol (flag proposed edits to `personas.md`, the spec, and `nyx-competitive-landscape-v1_0.md` — don't write them); Backlog Protocol (log every new deferral as a B-row immediately with the full row contract; cross-reference existing specs — med-logging, analytics-dashboard — rather than restating them; route new *scope* to Open Questions, never a silent backlog add); the safety invariants (n=1 never reassures; intake decline ≠ preference; report claims are associational, never causal/diagnostic).

**Do NOT:** write code/schema/migrations; edit `personas.md`, the spec, or the competitive/research docs; choose the render library (follow-up spike); pre-decide the audience question (it's a strawman axis); assume PDF; let synthetic interviews confirm priors; put n=1 reads or causal claims on the report; imply the report is more complete than the data behind it; over-scope v1 beyond the wedge.
