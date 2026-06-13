# Nyx — "Ask" (natural-language query over a pet's own record) Requirements

**Status:** DRAFT (rev 1) — awaiting PM ratification before any build. Scope locked to **Tier 1 only** (PM, 2026-06-13).
**Owner build step:** Post-MVP fast-follow (after Step 9 vet report + Step 10 AI Signal close). NOT a current build step.
**Created:** 2026-06-13 (product-team kickoff session — "ask my vet" experimental feature)
**Backlog anchor:** B-088 (this feature, tiered) · B-089 (the export escape-hatch — separate, see §11)

> Output of the 2026-06-13 product-team session. Read alongside `docs/nyx-ai-signal-requirements.md`
> (the architecture this mirrors — deterministic compute + LLM-phrasing-only + the §7.1 value ladder),
> the **clinical-guardrails** skill (the n=1 escalate-but-never-reassure asymmetry this inherits), and
> the **nyx-voice** skill (all owner-facing copy). This doc specifies Tier 1; Tiers 2–3 and the export are
> deliberately out of scope here (§11).

---

## 0. What this doc covers — and deliberately does not

**Covers:** a natural-language way for an owner to **ask about their own pet's logged record** — "how many times has my cat vomited?", "what's she been eating?", "when did she last vomit?" — answered by a **deterministic query**, phrased by an LLM that never computes or interprets the answer.

**Deliberately does NOT cover (PM decision, 2026-06-13):**
- **Tier 2 — guided generative asks** ("suggest treats"). Doable but gated; deferred on the B-088 row.
- **Tier 3 — clinical judgment** ("is she okay?", "what's wrong?", "what should I do?"). **Out of the app entirely.** These intents are *detected and deflected* (§6, G3), never answered.
- **The AI-ready export / "context pack"** (the escape-hatch for Tier-3 questions). Separate deliverable → **B-089**, built as an extension of B-041 (portability) + Step 9 (vet report). Not specced here.
- **Free-form SQL generation (text-to-SQL).** A non-starter over a health DB (injection, hallucinated columns, RLS-bypass). The model selects from a **fixed whitelist** (§4), never authors a query.
- **Any proactive push.** This is a **pull-only** surface (§7). The home stays a curated, non-interactive intelligence surface (Principle 3); the Signal/nudge channels are unchanged.

---

## 1. Purpose & origin

Owners will layer AI onto their pet's data whether or not we help them — the PM convened this session to get ahead of that. The literal "ask my vet" framing was found to be the **single biggest risk** in the idea (it implies veterinary advice / a vet-in-the-loop → unauthorized-practice + FTC-deceptive exposure + a direct clinical-guardrails violation), so the need was decomposed into **risk tiers** mirroring the AI-Signal value ladder (`nyx-ai-signal-requirements.md` §7.1). **Tier 1 is the shippable core**: it is not a vet question at all — it is *search your pet's record* — and nobody else in the market has Nyx's longitudinal structured data to answer it well.

**Two session decisions are load-bearing for this doc:**
1. **Scope = Tier 1 only** (deterministic retrieval). Tier 2 deferred; Tier 3 routed out via B-089.
2. **Rename — no vet implication** (Dr. Chen + Lawyer, non-negotiable). Working names: *"Ask about {pet}"* / *"Ask the record"* / *"Nyx, about {pet}…"*. Final wording is a nyx-voice pass at build time (§10, open decision d).

**Feasibility (confirmed against the codebase):** zero new infrastructure. The deterministic count already exists (`hooks/useSignal.ts:46–65`); the deterministic-compute → LLM-phrasing-only → `validatePhrasing` pattern is `generate-signal`; the never-reassure machinery is `analyze-vomit`'s escalation floor; RLS-scoped JWT reads are the norm. This is a **guardrail-discipline** spec, not an architecture spec.

---

## 2. Architecture — DECIDED: NL intent-parse → whitelisted deterministic query → LLM phrasing only

Identical in spirit to `generate-signal` (Architecture B). The model appears at **two seams only**, and at **neither does it compute or judge the answer**:

```
owner question (NL)
   │
   ▼
[A] INTENT PARSE (LLM, Haiku 4.5, forced tool)  ──►  { query_id ∈ whitelist, params }  | OR "unsupported" | OR "clinical_judgment"
   │                                                   (the model SELECTS a query; it never writes one and never answers)
   ▼
[B] DETERMINISTIC EXECUTION (pure TS + parameterized SQL, caller-JWT/RLS)  ──►  structured result (counts, dates, distributions)
   │                                                   (THIS produces the number — never the model; one source of truth, §6 G5)
   ▼
[C] PHRASE (LLM, Haiku 4.5, forced tool)  ──►  one warm sentence from the structured result  ──►  validatePhrasing  ──►  templated fallback
   │                                                   (the model gets the structured result ONLY — never the raw event log)
   ▼
answer  (+ optional "see on timeline" / "add to vet report" affordance, §7)
```

- **Seam A** maps NL onto a **closed whitelist** (§4) via a forced-tool call (mirrors `phrase_insight`'s `tool_choice` discipline). Output is a structured query selection or a sentinel (`unsupported` / `clinical_judgment`) — **never prose**. An out-of-whitelist or interpretive question is *classified*, then deflected deterministically (§6) — it is **never** answered by free generation.
- **Seam B** is the only thing that produces a number, and it calls the **same counting code** the Timeline / Signal / vet report use (§6 G5).
- **Seam C** renders the structured result into one sentence under `validatePhrasing` (`phrasing.ts:217–262`), with a deterministic template fallback so an answer is never blank or unguarded.

**Hosting:** an **`ask` Edge Function** (the API key is server-only; reuse the `generate-signal` I/O shell + caller-JWT RLS pattern). An **offline degraded mode** — chip questions resolve to local-SQLite counts phrased by *template only*, no LLM — is an open enhancement (§10, decision b), since the pure count already runs on-device.

---

## 3. Model & cost

- **Both LLM seams: Haiku 4.5** (`claude-haiku-4-5`). Neither seam is load-bearing reasoning — A is constrained classification onto a whitelist, C is phrasing an already-true fact — so cheapest-capable wins (B-001 rationale, same as the AI Signal). Reuses the provisioned `ANTHROPIC_API_KEY` (Secrets Register — no new secret).
- **Cost shape differs from the Signal and is a build prerequisite, not a "later":** the cached daily Signal is bounded; a free-text ask is an **owner-initiated, unbounded** call pattern (1–2 Haiku calls per ask). **B-001 (per-user/day cap + abuse throttle) must land before this reaches real users.** Chips-first (§7) naturally bounds it; a raw free-text field widens it.

---

## 4. The query whitelist (the load-bearing artifact)

The whitelist is the security and correctness boundary. Each entry = **one parameterized query + one phrasing template + one guardrail class**. v1 set (all scoped to the **active pet**, all exclude `deleted_at IS NOT NULL`, all RLS-gated by caller JWT):

| `query_id` | NL examples | Params | Returns | Guardrail class |
|---|---|---|---|---|
| `count_symptom` | "how many times has she vomited?", "how often is she scratching?" | `symptom_type ∈ {vomit, diarrhea, stool_normal, lethargy, itch, scratch, skin_reaction}`, `window` | count + window + (rising? via ④ `isWorsening`) | **never-reassure; rising→safety handoff** |
| `last_symptom` | "when did she last throw up?" | `symptom_type` | most-recent `occurred_at` (+ B-010 confidence) | never-reassure |
| `symptom_trend` | "is the vomiting getting better?" | `symptom_type` | week-over-week counts (reuse ③ reflection / ④ worsening) | **flat/improving may state; worsening→safety; never a verdict** |
| `recent_foods` | "what has she been eating?", "what foods this week?" | `window` | distinct `food_items` (brand/product/protein) from logged meals | factual only |
| `intake_summary` | "is she eating normally?", "has she been eating?" | `window` | `intake_rating` distribution (refused/picked/some/most/all) | **decline→safety, NEVER "picky" (intake-not-preference)** |
| `free_fed` | "what's always available?", "what's in her bowl?" | — | active `free_choice` arrangements (food + since-date) | carries "intake not directly observed" |
| `diet_trial_status` | "how many days into the trial?", "are we on track?" | — | `diet_trials.started_at` + days-in + target | factual; no compliance verdict |
| `meds` | "when did she last get her medication?" | `window?` | `medication` events | factual; no dosing advice |

**`window` parsing** ("this week" / "lately" / "since we switched food" / explicit dates) is itself constrained: the parser maps to a bounded enum of windows (`7d`, `14d`, `30d`, `all`, `since_trial_start`) — never an arbitrary free range that could mask acute worsening (§6 G-window). Default when unstated: **7 days**, and the answer **states the window it used.**

**Adding a whitelist entry is a spec change**, not a prompt tweak — each needs its query, template, guardrail class, and tests before it ships (clinical-guardrails Pattern 8 discipline).

---

## 5. Intent-parse contract (Seam A)

The parser returns exactly one of:
1. **`{ query_id, params }`** — a whitelist match with validated params (params outside their enum → the parser must re-ask via a clarifying chip, never coerce silently).
2. **`clinical_judgment`** — the question asks for interpretation / "is this normal/a lot/concerning" / diagnosis / prognosis / treatment / "should I worry". → deterministic **Tier-3 deflection** (§6 G3). This classification is *itself* a guardrail: the most dangerous questions are routed by the parser to the deflection, not the answerer.
3. **`unsupported`** — a real question we don't have a whitelisted answer for (e.g. "what breed is she", "how much does she weigh" if weight isn't tracked). → honest "I can't answer that from {pet}'s logs" + suggest what *can* be asked (the chips).
4. **`ambiguous`** — needs a pet/symptom/window disambiguation. → a clarifying chip, never a guessed answer.

The parser is pinned to a forced tool (no free text out). A low-confidence parse fails toward `unsupported`/`ambiguous`, **never** toward a guessed query — a wrong-query answer to a health question is the failure mode we most need to avoid.

---

## 6. Safety guardrails (the heart of the spec)

Defense-in-depth, mirroring clinical-guardrails' layered model (system prompt → constrained output → deterministic floor → test assertions). **Every layer fails closed.**

- **G1 — Never interpret.** Tier 1 states facts; it never says whether a number is "a lot", "normal", "concerning", "fine". Interpretation is the diagnostic act the product forbids and is routed to deflection by Seam A (`clinical_judgment`).
- **G2 — Never reassure on absence.** A 0 / low count is **"nothing logged"**, not "she's well" (absence ≠ wellness; the hepatic-lipidosis miss). Reuse `validatePhrasing`'s `REASSURANCE_RE`. Empty result copy is forward-looking, never an all-clear (Principle 5).
- **G3 — Tier-3 deflection is deterministic and is a *feature*.** A `clinical_judgment` (or any interpretive lean) → a fixed, warm deflection: *"That's a question for {pet}'s vet — here's what I can pull together for them."* + the vet-report / export CTA. This deflection drives the wedge (the vet report), it doesn't dead-end.
- **G4 — Rising-count → safety handoff.** When `count_symptom`/`symptom_trend` reveals worsening (reuse detector ④'s `isWorsening`/`computeWindowedStats` — one shared predicate, so Ask and the Signal can't disagree about "worsening"), the answer carries the safety register (*"…that's up from last week — worth a word with your vet"*), never a bare number that lets the owner infer "fine".
- **G5 — One source of truth (Data Scientist red line).** The whitelist calls the **same counting code** as the Timeline, the Signal, and the vet report. If the Ask number ever disagrees with the Timeline number, we've built something that contradicts itself about a health fact — worse than B-067. Enforced by sharing the query helpers, asserted in tests.
- **G6 — B-010 timestamp honesty.** Counts/dates that include `estimated`/`window`-confidence events say so ("based on when they were logged"); a `window`-confidence "last vomit" renders the window, never a false-precise point.
- **G7 — Intake decline routes to safety, never "picky" (intake-not-preference invariant).** `intake_summary` that surfaces decline/refusal uses the calm health-flag framing, never softened to preference — the exact `intake_rating` anti-pattern, applied to a *query* answer.
- **G8 — Validation is a test assertion, not a comment (clinical-guardrails Pattern 8).** Every templated answer + the model's phrased output are regex-scanned for reassurance / interpretation / causal vocabulary in unit tests, before merge. Extend the assertion to every new template.
- **G-window — bounded windows only.** No arbitrary multi-month range that masks acute worsening; the answer always states its window.

---

## 7. The surface / UX (Designer + Jordan + Sam)

- **Opt-in PULL surface — never the home.** This is not the curated intelligence surface (Principle 3); it's a destination the owner chooses to enter (precedent: B-046's "patterns we're watching" pull view). Entry point TBD in the design pass (a Pet-tab affordance / a search-style icon) — **not** a home card, **not** a nav tab at MVP.
- **Chips-first (tap, don't type).** Lead with suggested questions — *"How often has {pet} vomited?"*, *"What's {pet} been eating?"*, *"When did {pet} last vomit?"*. This keeps Principle 1 (zero typing) and **scopes the answerable set to the whitelist** (you can only ask what we answer well). Whether an **optional free-text field** sits behind the chips is an **open PM decision** (§10 a) — it's the Designer↔Jordan/Sam tension surfaced in the session.
- **Can't-answer is a designed deflection, not an error toast** (Principle 5): `unsupported` → "I can't answer that from {pet}'s logs yet — here's what I can tell you" + chips; `clinical_judgment` → the G3 vet/report deflection.
- **Multi-pet:** scoped to the **active pet**, and every answer **names the pet** (first-person-pet voice). Switching pets re-scopes.
- **Offline:** chip questions that resolve to pure counts can run on local SQLite with templated phrasing (no LLM) — **open decision** (§10 b) whether v1 ships that or is online-only.
- **Affordance after an answer:** "see these on the timeline" (filter the History view) and/or "add to a vet report" — the Tier-1 answer becomes an on-ramp to the clinical surfaces, not a dead end.

---

## 8. Copy / voice (nyx-voice skill)

First-person pet / second-person owner ("Nyx has vomited 4 times this week", not "your pet"); specific over generic; **no exclamation marks**; plain language ("vomiting", not "emesis"); **no reassurance, no interpretation verbs.** One sentence per answer where possible. The deflection copy is warm, not a cold "I can't help with that" — it points at the vet/report.

---

## 9. Acceptance criteria & edge cases (QA)

**AC (each must pass before "done"):**
1. `count_symptom` for vomit over 7d returns the **same number** as the History/Timeline filter for the same window (G5).
2. A 0-count answer contains **no** reassurance/wellness vocabulary (G2; regex test).
3. An interpretive question ("is that a lot?") is classified `clinical_judgment` and returns the **deflection**, never a number-plus-opinion (G1/G3).
4. A rising vomit count returns the **safety-register** phrasing, not a bare count (G4), and "worsening" matches detector ④'s verdict on the same data (shared predicate).
5. An `intake_summary` revealing decline uses safety framing, **never "picky"** (G7; regex test).
6. A question about a pet the caller doesn't own returns nothing (RLS; never another pet's data).
7. Out-of-whitelist question → `unsupported` deflection, **never** a guessed/hallucinated answer.
8. `window`-confidence events render as a window, not a false-precise point (G6).

**Edge cases to design for:** empty data ("nothing logged" ≠ healthy); ambiguous intent ("how is she?"→ `clinical_judgment`); injection / prompt-override attempts in free text (sanitize; the forced-tool parse contains blast radius); a question spanning a soft-deleted event (excluded by query); fuzzy windows ("lately"→ default 7d, stated); the LLM-phrasing-down path (templated fallback still answers + still guarded); multi-pet active-pet scoping; offline.

---

## 10. Open decisions for PM (none block ratifying this doc; all are build-time calls)

- **(a) Chips-only vs chips + optional free-text.** Chips-only is safest + bounds cost; a free-text field is what makes it feel like an "ask". *(The surfaced Designer↔Jordan/Sam conflict.)*
- **(b) Offline behavior.** Ship the local-SQLite templated-chip answers in v1, or online-only first?
- **(c) Question retention.** Do we persist the owner's question text (for B-047 instrumentation / improving the parser), and if so anonymized + with what basis? *(Trust & Safety — default lean: do not persist raw questions in v1.)*
- **(d) Final name.** Working set: "Ask about {pet}" / "Ask the record". nyx-voice pass.
- **(e) Post-answer CTA.** Does Tier 1 share the vet-report "add to report" affordance (couples it to Step 9), or stay read-only in v1?

---

## 11. Out of scope → where it lives

- **Tier 2 (generative "suggest treats"):** B-088 row (the tier model + the diet-trial/allergy/health-flag PRE-gate is captured there).
- **Tier 3 (clinical judgment) in-app:** never. Routed out via the deflection (G3) → the export.
- **The AI-ready export / "context pack":** **B-089** — built as an extension of B-041 (GDPR portability, service-role read-and-package) + Step 9 (vet report). The honest, machine-readable companion an owner can hand to their vet *or* paste into a general AI. Trust & Safety + Lawyer caveats live on that row; `rls-privacy-reviewer` gates it.

---

## 12. Phased build plan (when greenlit — each step gated, AC pasted at kickoff)

- **Step 1 — Intent-parse + whitelist, pure & tested.** The `query_id` whitelist (§4), the parse contract (§5) as a forced-tool schema, the param/window enums, and the deterministic query helpers (shared with the Signal/vet-report counters — G5). **Unit tests required**, including the G1/G2/G3/G7 guardrail assertions (Pattern 8). No LLM wiring, no UI.
- **Step 2 — `ask` Edge Function.** Wire parse → execute (caller JWT/RLS) → phrase (Haiku, forced tool) → `validatePhrasing` → templated fallback → deflection paths. B-001 per-user/day cap. `rls-privacy-reviewer` pass (new free-text surface). Acceptance: every §9 AC green; LLM-down path still answers + still guarded.
- **Step 3 — Surface.** Chips-first pull view, deflection UX, multi-pet active-pet scoping, post-answer CTA, (optional) offline templated chips. Acceptance: can't-answer is a designed moment; never on the home; never a verdict.

---

## 13. Persona sign-off (2026-06-13 session — conditional, pending PM ratification of this doc)

- **Dir. of Engineering ✓** — mirrors `generate-signal`; the whitelist is the clean boundary; flagged B-001 cap as a *prerequisite*, not a follow-up (unbounded call pattern).
- **Sr. Data Scientist ✓ (conditional)** — conditional on G5 (one source of truth) being enforced by shared query helpers + tests, and on the intake-decline answer routing to safety (G7).
- **Dr. Chen ✓ (conditional)** — conditional on the rename, Tier 3 staying out (G3 deflection), never-reassure (G2), and never-interpret (G1). "Ask the record" is the dream owner-consult input; "ask the vet" is malpractice-shaped.
- **Sr. Product Designer △ (conditional)** — endorses a chips-first **pull** surface off the home; the free-text field is the open call (§10 a); can't-answer must be a designed deflection.
- **Jordan ✓** — "how many times since we switched food" is the daily need; won't type a paragraph; accepts "bring it to your vet" *if* handed the thing to bring.
- **Sam ✓** — the intake/eating questions are hers; conditional on decline never reading as "picky" (G7).
- **Sr. QA ✓ (conditional)** — conditional on the §9 AC, especially G5 number-parity with the Timeline.
- **Trust & Safety / Privacy △** — new free-text exfiltration/injection surface; needs input sanitization, the §10c retention call, no service-role reads, and an `rls-privacy-reviewer` gate before ship.
- **Competitive (added voice) △** — validates "ask the *record*" as the defensible wedge (vs. liability-magnet "ask the vet"); keep the post-answer CTA pointing back at the clinical surfaces so we don't commoditize into a data backend.
- **Lawyer / risk (added voice) △** — sign-off contingent on the rename + repeated "informational, not veterinary advice" disclaimers + Tier 3 refused in-app. Tier 1 (retrieving the owner's own facts) is the lowest-risk surface in the product.
