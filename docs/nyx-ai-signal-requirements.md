# Nyx — AI Signal (Home Zone 1) Requirements

**Status:** DRAFT — product-team aligned, awaiting PM sign-off
**Owner build step:** Step 10 (AI Signal Edge Function)
**Created:** 2026-05-30
**Supersedes:** the hardwired empty-state placeholder in `components/home/SignalZone.tsx`

> This is the output of the 2026-05-30 product-team design session. It is the
> requirements artifact for lighting up the Home screen's Signal zone — the
> "AI-powered insights" surface that today is a placeholder. Read alongside
> `docs/nyx-technical-spec-v1_0.md` (Step 10 + Zone 1 acceptance criteria),
> `docs/nyx-design-principles-v1_0.md` (Principle 3), and the clinical-guardrails
> skill (the n=1 escalate-never-reassure asymmetry this layer inherits and relaxes).

---

## 1. Purpose & current state

The Home screen's top zone is the product's **intelligence surface** — the single
reason a week-one user stays. Today it is a designed empty state: two ghosted
preview insights ("What the signal looks like") plus a "keep logging" line. The
data substrate to make it real now largely exists:

- **Events** (vomit, stool, itch, etc.) with `occurred_at` + `occurred_at_confidence` (B-010)
- **Meals** with `intake_rating` — WSAVA 5-point `refused/picked/some/most/all` (B-014)
- **Food items** — brand, product, `primary_protein`, `is_novel_protein`, ingredient list, `food_type` meal/treat (B-011)
- **`event_ai_analysis`** — per-incident structured reads (B-027)
- **Diet trials** — `started_at`, `target_duration_days`
- **Correlation reference query `[2]`** and **diet-trial-compliance query `[3]`** in `nyx-schema-v1_0.sql`
- **`ai_signals` cache table** (migration `005`) — `pet_id`, `signal_text`, `is_building`, `generated_at`, `expires_at` (24h). Already built; never yet written to.

---

## 2. Architecture — DECIDED: deterministic detection + LLM phrasing

> Data Scientist + Engineer + Dr. Chen, unanimous (2026-05-30).

Two architectures hide in the spec line "Claude generates a single sentence." We
reject the one where the LLM finds the insight:

- **(A) LLM-does-everything** — rejected. Lets the model invent correlations from
  noise, puts unverifiable clinical claims on Home, costs more, can't be cached
  or tested principled-ly.
- **(B) Deterministic detection + LLM phrasing** — ADOPTED. A server-side function
  computes candidate findings from real queries, ranks them by a fixed priority,
  and hands the **single winning, already-true finding** to Claude *only* to render
  into one warm sentence. The model never decides whether a pattern exists.

### Pipeline (`generate-signal` Edge Function)

1. **Detect** — run the deterministic detectors (§4) over the pet's data. Each
   returns zero or more candidate findings as structured JSON (type, payload,
   confidence, sample sizes).
2. **Rank** — pick the single highest-priority candidate per the ranking order (§5).
   If none clear their thresholds → emit a `building` or `stale` state.
3. **Phrase** — pass *only the winning finding's structured payload* to Claude
   with a tight phrasing prompt (voice rules + the clinical guardrails). The model
   returns one sentence. It is given no raw event log and cannot add claims the
   payload doesn't contain.
4. **Cache** — write `signal_text` + `is_building` to `ai_signals` with a 24h TTL.
5. **Fallback** — if the LLM call fails, render a **templated sentence** from the
   structured payload (every finding type ships with a deterministic template).
   The Signal must never be blank because an API call failed.

### Trigger / freshness

- Home open reads the **cache only** — never a live LLM call (spec hard rule).
- Regeneration fires (a) on a **daily** refresh when the cached row is expired, and
  (b) **debounced after a new event is logged** (so a fresh vomit/meal can move the
  Signal same-day). Both call `generate-signal` async; the home screen shows the
  last cached value or the building/stale state meanwhile.
- Cost (B-001): ≤ ~1 phrasing call/pet/day in steady state. Cache + debounce cap it.

---

## 3. Surface & display states — Principle 3 holds

The Signal stays **one ranked insight at a time** — the dominant elevated card,
one specific sentence. NOT a feed, NOT a dashboard (Principle 3; the B-023 "Home
becomes a dashboard" concern is explicitly out of bounds here — preferences
analytics, if it grows, is B-023's own surface, not a fourth zone).

Three states, each a designed moment (Principle 5):

| State | Trigger | Copy pattern |
|---|---|---|
| **Building** | < 5–7 days of data / below sample floors (`is_building = true`) | "We're getting to know {pet}. Keep logging and patterns start appearing in about a week." Keep the ghosted "what the signal looks like" previews. |
| **Stale** | No events logged 48h+ | "Not enough recent data to show a pattern. Log today and we'll keep building the picture." |
| **Live** | A finding cleared its thresholds | The single specific sentence (see §4 examples). |

**Optional (Designer):** the live sentence is **tappable to reveal the evidence**
behind it ("based on 7 vomiting events and 12 chicken meals over 3 weeks").
Scannable at rest, honest on demand. Flagged as an open design decision (§7).

---

## 4. Insight taxonomy & detectors

> **Prioritization (PM decision 2026-05-30):** the food→symptom correlation —
> originally staged as the rigor-gated v2 flagship — is **promoted to lead v1**.
> Rationale: the PM is dogfooding with a cat that is **not** on a diet trial, so the
> diet-trial-anchored trend insight (①) isn't exercisable for them, whereas
> correlation works on any logged food + symptom data (and B-027 means real vomit
> incidents are already being logged). "Cart before horse" is **defused by the
> sample floor**: on sparse data the correlation detector *does not fire* (Home
> shows the building state) rather than printing a false claim — so building it
> first is safe by construction. The rigor below is built **from day one**, not
> deferred. Diet trials remain a first-class design target (① is the immediate
> fast-follow and the engine is built to anchor on `diet_trials.started_at`).

### v1 — ships first (the flagship correlation + its mandatory safety net)

**① Food/ingredient → symptom correlation** *(flagship — the wedge dream, the priority)*
- The "your cat vomits after this food" insight. Uses reference query `[2]`.
- Example: "Itching tends to peak 3–6 hours after meals containing chicken; no reaction to salmon-based foods."
- **Rigor baked in from day one (Biostatistician + Nutritionist) — these are the spec, not optional polish:**
  - Minimum-sample floor — ≥ ~3 symptom events AND ≥ ~3 exposures, both arms populated. Below the floor the detector is silent (→ building state). **This floor is what makes shipping early safe.**
  - **Multiple-comparison correction** — testing many ingredients × symptoms surfaces spurious hits on small n; correct for the number of hypotheses tested, only "strong" associations earn the screen.
  - **Confidence tiering** — weak associations stay silent.
  - **Protein-level first** (`primary_protein`, `is_novel_protein`), ingredient-level as a later refinement.
  - **Associational copy only** — "symptoms tend to follow," never "X causes Y."
- Correlation findings are also **vet-report elements** (Dr. Chen wants them).

**② Intake-decline calm health flag** *(MANDATORY safety net — ships WITH ① )*
- Falling intake rate over recent days, or treat refusal preceding meal decline.
- Example: "Pixel has eaten less than usual the last two days — worth keeping an eye on."
- **Routed as calm concern, never softened into "picky"** (Data Scientist + Dr. Chen non-negotiable).
- **Why it ships in v1 and not later:** per the asymmetry (§6), you cannot put a correlation read on Home without the never-reassure safety net underneath it. Dr. Chen's sign-off on shipping ① first is conditional on ② shipping alongside.
- Coverage caveat: depends on intake-rating coverage (B-033 — owners may under-rate exactly when it matters). Where coverage is thin, this detector simply doesn't fire — it must never read absence as wellness.

### v2 — fast-follow (cheap, additive, the diet-trial + preference wins)

**③ Symptom trend / diet-trial progress** *(statistically cleanest; the immediate fast-follow)*
- Pre/post delta around a clean anchor (diet-trial `started_at`, or a protein switch).
- Example: "Vomiting is down 60% in the two weeks since the protein switch — the diet trial appears to be working."
- The one place a **reassuring** read is defensible: multi-sample, quantified, anchored (§6).
- Sample floor: ≥ N events in each of the pre/post windows (tune; start ~3).
- The engine is built v1 to anchor on `diet_trials.started_at` so this is a thin add.

**④ Positive food/treat preference** *(safe, cheap, broadens to Sam)*
- Consumption rate over N offerings, `intake_rating='most'|'all'`. Positive multi-sample only.
- Example: "Mochi has eaten 100% of meals on the hydrolyzed protein vs 60% on the kibble."
- Sample floor: ≥ N offerings of the food (tune; start ~5). Never from a single rating (Data Scientist anti-pattern).

---

## 5. Ranking — which single finding wins

When multiple candidates clear their thresholds, show one, in this priority order
(highest first):

1. **Intake-decline / concern flag** (②) — clinical safety outranks everything.
2. **Food → symptom correlation** (①) — the flagship.
3. **Symptom trend / diet-trial progress** (③, v2).
4. **Positive preference** (④, v2).

Rationale: a concern must never be buried under a "loves this treat" line. Within
a tier, prefer the higher-confidence / more-recent finding.

---

## 6. Clinical guardrails (inherited from B-013, relaxed in exactly one direction)

This is the **cross-incident, multi-sample** layer — per the project's own
anti-pattern, the *one* place reassurance is permitted, and only carefully:

- **Reassurance is allowed only when multi-sample and quantified** — "vomiting down
  60% over two weeks" is defensible; "your pet is probably fine" is never emitted.
- **Absence of a detected pattern ≠ wellness.** "No patterns detected" renders as the
  building/stale states, never as an all-clear.
- **Concern findings (decline, rising frequency) get the same calm-but-clear
  treatment as a single incident** — surfaced, never alarmist (Principle 4), never
  explained away as preference.
- **No causal claims** on correlation — associational language only.
- The LLM phrasing prompt embeds these rules; the deterministic ranking ensures a
  concern can never be outranked by a reassuring or preference finding.

---

## 7. Copy / voice

Per the nyx-voice skill: first-person pet / second-person owner, specific over
generic ("down 60% since Tuesday," not "things are improving"), no exclamation
marks, plain language ("vomiting," not "emesis"), warm-not-nagging. One sentence.

---

## 8. Open decisions

- **(a) Tap-to-expand evidence** under the live sentence — ship in v1 or defer? (Designer floats it; honest but adds surface.) — OPEN.
- **(b) Sample-floor / confidence-tier exact values** — start with the §4 defaults and tune against real data, or set firmer thresholds now? — OPEN, lean: start with defaults, tune on real data.
- **(c) Build timing** — **DECIDED 2026-05-30:** land this aligned spec, log a phased build plan to the backlog (B-045), build in a dedicated next session with AC pasted in (Build Step Kickoff). Step 9 (vet report) remains the formal current phase until the PM formally interrupts to start B-045.
- **(d) Correlation copy register** — exact associational phrasing + the "discuss with your vet" framing for ① needs a copy pass (nyx-voice skill) at build time.

---

## 9. Phased build plan (tracked as B-045)

Built in a dedicated session, each step gated before the next (mirrors the build
sequence discipline). Schema is already in place — `ai_signals` (005) — so no
migration is needed for v1.

- **Step 1 — Deterministic detection engine.** A pure, server-side module (testable
  in isolation) that runs the correlation detector (① ) + the intake-decline
  detector (② ) over a pet's events/meals/food_items, applies the sample floor +
  multiple-comparison correction + confidence tiering, and returns ranked
  structured candidate findings (§4/§5). **Unit tests required** (shared logic /
  Edge Function per DoD). No LLM, no UI. Acceptance: given fixture data above the
  floor → correct ranked finding; below the floor → empty (building).
- **Step 2 — `generate-signal` Edge Function + phrasing + cache.** Wrap Step 1 in an
  Edge Function: detect → rank → phrase the winner via Claude (voice + guardrail
  prompt) → write `ai_signals` (24h TTL) → templated fallback on LLM failure.
  Acceptance: invoking the function writes a correct, guardrail-compliant
  `signal_text`; concern findings outrank reassuring ones; LLM-down path still
  writes a sentence.
- **Step 3 — Wire `SignalZone` to the cache.** Replace the placeholder: read
  `ai_signals` on home open (cache-only, no live LLM), render the live sentence /
  building / stale states (§3), trigger async regeneration (daily-expiry +
  debounced-after-log). Optional evidence-expand per decision §8(a). Acceptance:
  Zone 1 shows the cached signal; building/stale states render; the 10-second /
  Principle-3 single-sentence read holds.

---

## 10. Persona sign-off

- **Dir. of Engineering ✓** — architecture B; reuses `ai_signals` (005), correlation query [2]; cacheable, testable, graceful fallback. Build as a phased plan in a dedicated session (B-045).
- **Data Scientist ✓ (conditional)** — correlation-first is fine **because** the min-sample floor makes it silent on sparse data; deterministic detection; decline routed to flag; multi-sample reassurance only. Conditional on the rigor (§4 ①) being built day one, not deferred.
- **Dr. Chen (Vet) ✓ (conditional)** — endorses shipping correlation first **only if** the intake-decline safety net (② ) ships with it; asymmetry preserved; no causal claims; concern never softened; correlations are vet-report-grade.
- **Veterinary Nutritionist ✓** — protein-level before ingredient-level; diet-trial anchor is the clean signal (v2); preference tied to consumption rate.
- **Biostatistician ✓** — correlation gated on multiple-comparison correction + confidence tiering; floor doubles as the early-ship safety net.
- **Designer ✓ (Principle 3, 5)** — one sentence, no dashboard; three designed states; optional evidence-expand flagged.
- **Jordan ✓** — one honest sentence on open, no menu-diving.
- **Sam ✓** — preference answers "will Pixel eat this"; decline never read as "picky."
