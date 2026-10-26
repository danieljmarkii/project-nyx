# Competitive Research — Deep Feature-Level Teardown (refresh of the competitive landscape)

*Kickoff prompt — paste the body below into a fresh session. Scope decisions baked in by the PM (2026-06-27): **app features are the priority lens** (what each rival's product actually *does*, feature by feature, not just funding/positioning); the strategic lenses below ride along at the priority this prompt assigns them. The deliverable is **printed directly in the session** as a self-contained report — the PM decides afterward what to fold into the canonical docs. This prompt is the kickoff, not the deliverable.*

---

You are the Nyx product team running a **deep competitive-research pass** focused on **what competing products actually do at the feature level**, refreshing `docs/nyx-competitive-landscape-v1_0.md` (last updated May 2026; today is later — assume 1–2+ months of drift and hunt for what changed).

**This session is RESEARCH, not build.** No code, schema, migrations, or specs. The deliverable is one comprehensive, **web-grounded, cited** competitive report, printed directly in the session (see Deliverable). Do **not** unilaterally edit `docs/nyx-competitive-landscape-v1_0.md` or any canonical `/docs/` artifact — competitive findings are a Tier-2 proposed edit the PM ratifies later (CLAUDE.md → Documentation Update Protocol).

Work as the full product team, with agency — Dir. of Engineering (what's actually shipped vs. marketed), Designer (the Calm/Linear/Oura bar), Data Scientist (is their "AI" real or a label?), Dr. Chen (would a vet trust/use their output?), Jordan & Sam (could I actually log in 10 seconds?), Product Owner, Trust & Safety. Surface dissent via the Persona Conflict Protocol; never resolve a conflict silently.

---

## The core question this research answers

**Feature by feature, who else does what Nyx does — and where is the product gap still genuinely unoccupied?** Sharpen this into three answerable sub-questions and make sure the report answers all three:

1. **Parity** — for each Nyx capability (see the feature ledger in Workstream 1), which competitors have it, how well, and how does their execution compare to ours?
2. **The unoccupied core** — v1.0 claims no one has built *frictionless owner logging → AI correlation → a clinical-grade, appointment-ready vet summary* as one loop. **Verify or break that claim with current evidence.** The single highest-value finding this session can produce is *"someone now ships a vet-facing AI summary"* — or hard confirmation that no one does.
3. **The closing window** — re-test v1.0's three window-compression scenarios (Maven adds no-hardware manual logging; a PIMS vendor adds owner-side logging; PetDesk adds a health-intelligence layer) against what these companies have actually shipped or announced since May 2026.

Frame every finding around *the reactive-tracking wedge* (an owner sent home with a diet trial or symptom-monitoring directive), not the casual record-keeper — that's the user Nyx competes for.

---

## Session scope, priority & done-definition

- **Priority order (1 = spend the most rigor here):** **(1) Workstream 1** — feature-level teardown + the head-to-head matrix; **(2) Workstream 2** — new entrants + threat reassessment + the v1.0 open research questions; **(3) Workstream 3** — the DIY/general-purpose incumbents; **(4) Workstream 4** — pricing/Pets-> $ and distribution (lighter). Where time runs short, mark a section **"thin — needs follow-up"** rather than padding it, and add it to Research Debt.
- **Geographic scope: US market**, consistent with v1.0 and `nyx-research-v1_0.md`. Note non-US players only where they're poised to enter US.
- **Build on v1.0; don't re-derive it.** Treat `nyx-competitive-landscape-v1_0.md` as the authoritative baseline. For each incumbent it already covers, your job is to **(a) re-verify with a current source, (b) go deeper on features, (c) flag what changed.** Spend net-new effort on new entrants and the feature dimensions v1.0 is thin on.
- **Done-definition:** the feature matrix is filled for every competitor (cells marked *unverified* where you couldn't confirm, not left blank); sub-question #2 (vet-facing AI summary) has a definitive verified yes/no per relevant player; each of the four v1.0 open research questions is answered or explicitly moved to Research Debt; every non-obvious claim is tagged `[EVIDENCE]` (with a source) or `[ASSUMPTION]`/`[MODEL-KNOWLEDGE]`; threat levels are re-stated with a one-line rationale for any change from v1.0.

---

## Phase 0 — Orient (read before searching the web)

Read these so you benchmark against the *real* Nyx, not a guess:
- `docs/nyx-competitive-landscape-v1_0.md` — the baseline. Internalize the four categories, the per-competitor teardowns, the strategic gap section, the three window-compression scenarios, the summary table, and the four **Open Research Questions** (you are expected to answer these).
- `CLAUDE.md` — "What You Are Building," the primary wedge, the seven design principles, the **two safety invariants** (intake is not preference; n=1 never reassures), and **Pets > $** (core care is always free). These are the axes Nyx competes on; use them as teardown lenses.
- `STATUS.md` — Nyx's *actual current* feature surface (what has shipped vs. what's in flight). The feature ledger below is distilled from it; cross-check before claiming Nyx "has" something.
- `docs/nyx-research-v1_0.md` — market size, the clinical wedge (chronic enteropathy, diet trials as standard of care, the 64%→20–30% compliance gap). Ground "why this matters" claims here, not in assertion.
- `docs/nyx-design-principles-v1_0.md` — Principle 6 (vet report is clinical-grade) and the design bar competitors are measured against.
- `docs/research/README.md` — the brief format/conventions, in case the PM later routes any pure-evidence findings there.

**Robustness check:** if `docs/nyx-competitive-landscape-v1_0.md` is absent, stop and flag it — don't reconstruct it from memory (CLAUDE.md's "if a referenced document does not exist yet, stop and flag it to the PM" rule).

---

## Method & rigor (this is competitive intel — it must be current and verifiable)

- **Use real, cited web research.** Prefer the `deep-research` skill; otherwise WebSearch/WebFetch. Good sources: the product's own site/pricing page, App Store + Google Play listings (features, last-updated date, ratings, *and review text* for what users praise/hate), funding trackers (Crunchbase/PitchBook/press), job postings (the earliest signal of a roadmap pivot — e.g. PetDesk hiring for "owner health logging"), product changelogs, and vet-trade press. **If the network policy blocks web access, say so explicitly, mark every such claim `[MODEL-KNOWLEDGE]`, and put verification at the top of Research Debt** — do not silently present stale model knowledge as current fact.
- **Separate *marketed* from *shipped*.** "AI-powered" on a landing page is a claim, not a feature. Note when you could only confirm marketing copy and not the actual in-app behavior; rate confidence accordingly. The Data Scientist persona owns this skepticism for any "AI/pattern recognition" claim.
- **Adversarially verify the load-bearing findings.** For sub-question #2 especially (does anyone ship a vet-facing AI summary?), try to *disprove* a positive finding before reporting it — read the actual feature, not a blog headline. Consider fanning out parallel per-competitor research agents (general-purpose Agents, or the `deep-research` skill) so each rival gets a deep, independent read; then reconcile.
- **Tag every non-obvious claim** `[EVIDENCE]` (+source) / `[ASSUMPTION]` / `[MODEL-KNOWLEDGE]`. Date-stamp anything time-sensitive (funding, download counts, ratings).
- **Re-assess threat levels** against v1.0's table and state *why* each changed (or held).

---

## Workstream 1 — Feature-level teardown + head-to-head matrix  *(PRIORITY 1 — the PM's main interest)*

This is the core of the session. Two outputs: a **matrix** (scan-fast) and **per-competitor deep dives** (the why behind each cell).

### 1a. The Nyx feature ledger (benchmark every competitor against this)

Distilled from `STATUS.md` / `CLAUDE.md` — verify against them before use. For each row, the matrix records whether each competitor has it, and how their execution compares:

1. **Frictionless quick-log** — the 10-second "confirm over entry" capture; broad event types (meals, treats, vomit, stool/diarrhea consistency, weight, medication doses, water, etc.). *The friction of logging is the whole game — study their capture flow, not just their feature list.*
2. **Photo-first food logging + AI ingredient extraction** — snap the bag/bowl, AI extracts brand/ingredients (Nyx's `extract-food-from-photo`).
3. **Photo-first medication logging + AI label extraction** — regimen setup once → one-tap dose logging → adherence tracking (Nyx's `extract-medication-from-photo` + regimen/dose model).
4. **Per-incident AI vision read** — analyze a single photo of an incident (e.g. vomit) with an owner-facing read (Nyx's `analyze-vomit`), under an *escalate-but-never-reassure* discipline.
5. **AI correlation / pattern engine** — does symptom-to-food (or symptom-to-anything) correlation, trend detection, worsening/chronicity, time-of-day or post-prandial clustering. *This is Nyx's deterministic `generate-signal` engine + LLM phrasing. Scrutinize: is theirs real correlation or a generic "log a lot and see a chart"?*
6. **Home as an intelligence surface** — a curated, prioritized insight surface (Nyx's Signal/Today/Trend zones) vs. a raw feed/log dump.
7. **Vet-facing output** — anything exported/shown *to a vet*: a PDF, a share link, a structured summary. **And specifically: is it an AI-generated, appointment-ready clinical summary?** (Nyx's Step-9 vet report + share token — the core differentiator.)
8. **Diet-trial / elimination-diet support** — explicit support for the clinical wedge (trial start/end, compliance, the reactive-tracking directive).
9. **Analytics / trends dashboard** — owner-facing patterns view (Nyx's Patterns dashboard); weight trend.
10. **Offline-first + sync + multi-pet + free-feeding/grazing** — local-first capture that survives offline; multi-pet households; honest modeling of free-fed/grazing intake.
11. **Clinical-safety posture** — do they treat *decline/refusal as a possible disease signal* (not "picky"), and do they *avoid false reassurance from a single sample*? (Nyx's two safety invariants.) *Almost certainly a Nyx-only stance — confirm, because it's a real differentiator and a trust moat.*
12. **Pricing model** — what's free vs. paywalled, and specifically **whether any core clinical/safety utility sits behind a paywall** (the Pets > $ contrast).
13. **Design quality** — measured against Calm/Linear/Oura, not "typical health app." Note genuinely good UX worth learning from.

### 1b. Per-competitor deep dives

Cover, at minimum, every named player in v1.0 — **PerkyPet AI, 11pets, the DogLog/PetNoter/PokiPaw/PetVitality cluster, PetDesk (owner app + vet platform), Maven Pet, Tractive (+ the Whistle shutdown), Fi, PetPace**, and the **PIMS layer (Cornerstone, Avimark, ezyVet/IDEXX, Digitail, Shepherd)** — plus any new entrants from Workstream 2. **Lead with the highest-threat / most feature-similar players** (PerkyPet AI and Maven first; the record-keeper cluster can be a single consolidated teardown).

For each, capture:
- **What it actually is** — platforms, whether it's actively maintained (last app-store update), team/funding & execution risk.
- **Capture flow & friction** — how an owner logs an event; how close to Nyx's 10-second bar.
- **AI / correlation** — what's real vs. marketed; what specifically it computes.
- **Diet & food depth** — ingredient-level? diet-trial aware? photo capture?
- **Vet-facing output** — any? format? **AI summary y/n** (the load-bearing cell).
- **Pricing** — free vs. gated; is clinical utility paywalled?
- **Traction & sentiment** — downloads/ratings + the *themes* in reviews (what users love and hate — these are free product insight).
- **Design** — the Calm/Linear/Oura read.
- **Threat level (reassessed)** + the specific gap Nyx exploits, and **steal / avoid** (one UX idea worth learning from; one thing to avoid).

---

## Workstream 2 — New entrants + threat reassessment  *(PRIORITY 2)*

- **Hunt for what's new since May 2026.** Net-new categories to probe, beyond the v1.0 roster: well-funded **software-only** clinical-logging entrants (v1.0 flags the *absence* of one as notable — re-check); **pet telehealth** apps that may have added logging (Vetster, Pawp, Airvet, Dutch); **big-platform moves** (Chewy/Chewy Health, Rover, Mars/Royal Canin, IDEXX, Zoetis, Trupanion/insurers adding tracking); and **AI "ask-a-vet"/symptom-checker apps**. For each found, run the Workstream-1 teardown.
- **Answer v1.0's four Open Research Questions** explicitly (Maven's roadmap toward manual logging; which PIMS dominate independent 1–3-vet practices; any PetDesk owner-side-logging signal; any well-funded entrant not yet in market). Each gets `[EVIDENCE]`/`[ASSUMPTION]` and, if unanswerable now, a Research Debt line.
- **Re-test the three window-compression scenarios** with current evidence and update timelines/mitigations.

---

## Workstream 3 — The DIY / general-purpose incumbents  *(PRIORITY 3 — the real default behavior)*

The honest competitor to a logging app is usually *not another app*. Assess, at the feature level, what owners actually do today and where it beats/loses to Nyx:
- **Spreadsheets / Notes / camera roll / paper / a whiteboard on the fridge.**
- **General AI assistants** — pasting symptom history/photos into **ChatGPT, Gemini, Claude**. This is the fastest-moving substitute for Nyx's AI reads *and* the vet-summary idea (an owner can ask an LLM to "summarize this for my vet"). Assess seriously: what does it do well, where is it dangerous (no clinical guardrails, false reassurance — the exact failure mode Nyx's invariants exist to prevent), and what's the durable wedge against it?

Frame these as "the behavior Nyx must beat," with the specific friction or trust advantage Nyx holds over each.

---

## Workstream 4 — Pricing / Pets > $ and distribution  *(PRIORITY 4 — lighter)*

- **Pricing teardown** — free vs. paid tiers across the field; surface any case where a rival **gates clinical or safety utility** behind a paywall (the sharpest Pets > $ contrast — "premium wraps convenience, never care").
- **Distribution** — how each reaches users: consumer App Store/ASO vs. vet referral vs. PIMS bundling vs. QR in discharge flows. Note where the **owner-first → vet-flywheel** play (the "Calm model" in v1.0) is contested or defensible.

---

## Deliverable — print the full report directly in the session

Produce one **self-contained competitive research report as your session output** (not a file write to a canonical doc; the PM will decide downstream whether it becomes a v2.0 of `nyx-competitive-landscape-v1_0.md`, a research brief, or input to a roadmap call). If asked to persist it, write a *new* standalone file — never overwrite the canonical doc. Suggested structure:

1. **Executive summary** — the 5–7 findings that would change a product/roadmap decision, led by the verified answer to *"does anyone now ship a vet-facing AI summary / the full owner→AI→vet loop?"*
2. **Head-to-head feature matrix** — the Workstream-1a ledger × every competitor; cells marked *unverified* where unconfirmed.
3. **Per-competitor deep dives** (Workstream 1b), highest-threat first.
4. **New entrants + threat reassessment** + the four v1.0 open research questions answered (Workstream 2).
5. **DIY / general-purpose incumbents**, incl. the LLM-substitute analysis (Workstream 3).
6. **Pricing & distribution** (Workstream 4).
7. **The differentiator ledger** — what Nyx *verifiably still owns* (unoccupied) vs. what's *now contested*, each with the evidence; explicitly state whether the v1.0 "the gap is real and unoccupied" claim still holds.
8. **Proposed Tier-2 edits to `nyx-competitive-landscape-v1_0.md`** — the specific updates a v2.0 should make (flagged for PM ratification, **not** written into the file).
9. **Research Debt (ranked by impact × uncertainty)** — what couldn't be verified this session, what needs a paid data source or primary research, and "what evidence would change the conclusion." Anything blocked by network policy lands here.

End by surfacing, via the Persona Conflict Protocol, any disagreement the team couldn't resolve (e.g. Data Scientist vs. Designer on how real a rival's "AI" is).

---

## Protocols to honor
- **Tier-2 doc protocol** — flag proposed edits to the competitive doc; do not write them in.
- **Backlog Protocol** — if the research surfaces a concrete *action* Nyx should take later (e.g. "match competitor X's onboarding flow"), log it as a `docs/backlog.md` B-row with the full row contract; route new *product scope* to Open Questions, never a silent backlog/scope add.
- **The safety invariants as a lens** — when judging a rival's AI/insight features, measure them against *intake ≠ preference* and *n=1 never reassures*; a competitor that reassures an owner off a single sample is a clinical-trust liability, and that contrast is a finding.
- **Pets > $** — treat "is core care free?" as a first-class competitive axis, not an afterthought.

## Do NOT
- Write code/schema/specs, or edit `nyx-competitive-landscape-v1_0.md` / any canonical `/docs/` artifact (propose Tier-2 edits instead).
- Present model knowledge as current fact — tag and date it, and prefer a live source.
- Take "AI-powered" marketing at face value — separate marketed from shipped, and say which you verified.
- Re-derive what v1.0 already establishes — build on it and flag what changed.
- Drift off the reactive-tracking wedge into "best general pet app" comparisons.
- Leave the load-bearing cell (vet-facing AI summary, per competitor) as "unclear" without trying hard to resolve it or explicitly parking it in Research Debt.
