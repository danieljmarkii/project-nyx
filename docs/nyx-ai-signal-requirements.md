# Nyx — AI Signal / Home Intelligence Surface Requirements

**Status:** DRAFT (rev 2) — product-team aligned, awaiting PM sign-off
**Owner build step:** Step 10 (AI Signal Edge Function)
**Created:** 2026-05-30 · **Revised:** 2026-05-30 (rev 3, per PM review)
**Supersedes:** the hardwired empty-state placeholder in `components/home/SignalZone.tsx`

> Output of the 2026-05-30 product-team design session + PM review (rev 2). Read
> alongside `docs/nyx-technical-spec-v1_0.md` (Step 10 + Zone 1 AC),
> `docs/nyx-design-principles-v1_0.md` (Principle 3 — **see §3.1, this rev proposes
> revising it**), and the clinical-guardrails skill (the n=1 asymmetry this layer
> inherits and relaxes).

### What changed in rev 3 (PM review)
5. **Per-type card presentation.** Cards are not a uniform template — an insight may render as
   a sentence, a stat, or a mini graph, whichever suits the data. Detection stays decoupled from
   presentation; each registered type owns its renderer (§3.2, §4). Mixed-format coherence is a
   design-phase task (§11f) for the Designer + Data Scientist.

### What changed in rev 2 (PM review)
1. **Home is no longer a single-winning-sentence.** It becomes a curated, prioritized
   set of insight cards — open-ended in type (correlations, preferences, and future
   weight / activity / overfeeding, etc.). This revisits Principle 3 (§3.1).
2. **Confidence becomes visible.** Weak correlations stay suppressed, but surfaced
   insights carry a calm, qualitative confidence/evidence tag — owners want to know
   how solid a read is (§6).
3. **No single finding "wins."** Ranking becomes *composition + prioritization* of a
   set, not winner-take-all (§5). Safety still always leads.
4. **Speed vs quality resolved via evidence tiers.** "How much data do we need?" is
   answered per-insight-type with an Early→Established tier model so owners get real
   insights *fast* without the app overclaiming (§6–§7).

---

## 1. Purpose & current state

The Home screen's top zone is the product's **intelligence surface** — the single
biggest reason a week-one user stays. Today it's a designed empty state (two ghosted
preview insights + a "keep logging" line). The data substrate to make it real now
largely exists:

- **Events** (vomit, stool, itch, …) with `occurred_at` + `occurred_at_confidence` (B-010)
- **Meals** with `intake_rating` — WSAVA `refused/picked/some/most/all` (B-014)
- **Food items** — brand, product, `primary_protein`, `is_novel_protein`, ingredients, `food_type` meal/treat (B-011)
- **`event_ai_analysis`** — per-incident structured reads (B-027)
- **Diet trials** — `started_at`, `target_duration_days`
- **Correlation reference query `[2]`** + diet-trial-compliance query `[3]` in the schema
- **`ai_signals` cache table** (migration `005`) — `pet_id`, `signal_text`, `is_building`, `generated_at`, `expires_at` (24h). Built, never yet written to. **Rev-2 note:** v1 may extend this to hold a *set* of findings rather than one `signal_text` (§12 build plan).

---

## 2. Architecture — DECIDED: deterministic detection + LLM phrasing

> Data Scientist + Engineer + Dr. Chen, unanimous. Unchanged by rev 2.

A server-side function computes candidate findings from real queries, ranks/curates
them, and hands each **already-true** finding to Claude *only* to render into one
warm sentence. The model never decides whether a pattern exists.

- **(A) LLM-does-everything** — rejected (invents correlations, unverifiable clinical
  claims, costly, un-cacheable).
- **(B) Deterministic detection + LLM phrasing** — ADOPTED.

### Pipeline (`generate-signal` Edge Function)
1. **Detect** — run each registered detector (§4) over the pet's data. Each returns
   zero or more structured candidate findings (type, payload, **evidence tier**,
   sample sizes — §6).
2. **Curate & rank** — select the set of qualifying findings and order them by
   priority (§5). Safety/concern always leads. (Rev 2: a *set*, not a single winner.)
3. **Phrase** — pass each selected finding's structured payload to Claude with a tight
   phrasing prompt (voice + guardrails). One sentence per finding. The model gets no
   raw event log and cannot add claims the payload doesn't contain.
4. **Cache** — write the ordered findings (+ each one's evidence tier) to `ai_signals`
   with a 24h TTL.
5. **Fallback** — on LLM failure, render a **templated sentence** from each payload.
   The surface must never be blank because an API call failed.

### Trigger / freshness
- Home open reads the **cache only** — never a live LLM call (spec hard rule).
- Regenerate (a) **daily** on cache expiry, and (b) **debounced after a new event is
  logged**. Both call `generate-signal` async; the screen shows the last cached set or
  a building/stale state meanwhile.
- Cost (B-001): a small bounded number of phrasing calls/pet/day (one per surfaced
  finding, capped by the visible-card limit in §3.2), cached 24h + debounced.

---

## 3. The Home as a composable intelligence surface

### 3.1 Design-principle change — PROPOSED, needs PM confirmation

Principle 3 today reads (canonical, `design-principles.md` + CLAUDE.md):
> *"Home screen is an intelligence surface — three zones only: Signal, Today, Trend.
> No log feed, no nav menu, no upsell."*

**PM direction (2026-05-30):** the home should be **as informative as possible** and
open to whatever design makes most sense — multiple insight surfaces over time
(correlations, food/treat preferences, future weight / activity / overfeeding, …).
This is a real spec deviation (B-023 already flagged the "Home becoming a dashboard"
tension). **Proposed revised Principle 3** (await PM sign-off before editing the
canonical docs — Tier 2/3):

> *"Home screen is an intelligence surface — a curated, prioritized set of insight
> cards above today's state and trend. It earns every pixel by being informative,
> not busy: no raw log feed, no nav menu, no upsell, never a firehose. Safety/concern
> insights always lead. The set of insight types is open-ended and grows with the data
> model; curation — lead with what matters, cap the visible set, keep each card calm
> and scannable — is what keeps 'informative' from becoming 'dashboard.'"*

> **Designer note:** I'm bought in *with* the curation clause. My original concern
> wasn't "more than one card is bad" — it was "an un-curated dump is bad." A
> prioritized, capped, calm set is still an intelligence surface; a scrolling wall of
> badges is not. The clause is the guardrail; hold me to it.

### 3.2 Composition (replaces single-sentence)
- The surface renders an **ordered stack of insight cards** — each card is one
  plain-language sentence + optional confidence tag (§6) + optional tap-to-evidence.
- **Capped visible set** (start: ~3–4 cards) so it stays scannable; overflow via a
  calm "more insights" affordance, not an infinite feed.
- **Context-adaptive ordering** (see §8): a diet-trial pet leads with trial/correlation
  insights; a healthy grazer leads with preference/intake insights. Same engine,
  different top card by pet context.
- **Each new insight type is a card renderer + a detector** (§4 registry) — the home
  grows by registering types, not by redesigning.
- **Presentation is per-insight-type, not one uniform template** (PM, rev 3). A card may
  render as a **sentence** (correlation, concern flag), a **stat / single number** (preference
  rate, days-on-trial), a **mini graph / sparkline** (symptom-frequency trend, intake over time),
  or a future format that suits the data. Each registered type declares its own presentation;
  the engine still produces the same structured finding underneath, so detection and rendering
  stay decoupled. The LLM phrasing layer (§2) applies only to text-shaped cards — a graph card
  needs data + a calm caption, not a generated sentence. **Curation guardrail still holds:** varied
  formats must read as one calm, coherent surface, not a gallery of mismatched widgets — a design-phase
  concern (§11f).

### 3.3 Display states (each a designed moment — Principle 5)
| State | Trigger | Pattern |
|---|---|---|
| **Building** | < a few days of data / nothing cleared even an Early tier (`is_building`) | "We're getting to know {pet}. Keep logging and patterns start appearing in a few days." Keep ghosted "what insights look like" previews. |
| **Stale** | No events logged 48h+ | "Not enough recent data to show a pattern. Log today and we'll keep building the picture." |
| **Live** | ≥ 1 finding cleared at least the Early tier | The ordered card stack (§3.2). |

---

## 4. Insight taxonomy & detector registry

Detectors are a **pluggable registry** — each returns typed structured findings; the
home renders a card per type, **in whatever presentation format suits that type**
(sentence / stat / graph / …, see §3.2). This is the extensibility spine the PM asked for
(future: weight, activity, overfeeding, multi-pet preferences, …). Detection and
presentation are decoupled: one finding shape per type, one renderer per type.

> **Prioritization (PM decision 2026-05-30):** food→symptom correlation is **promoted
> to lead v1**. The PM dogfoods with a cat *not* on a diet trial, so the diet-trial
> trend isn't exercisable for them, whereas correlation works on any logged
> food+symptom data (B-027 means real vomit incidents are already logged). "Cart
> before horse" is defused by the evidence-tier floor (§6): below the floor the
> detector is silent (building state), so it can't print a false claim.

### v1
**① Food/protein → symptom correlation** *(flagship)*
- "Itching tends to peak 3–6h after meals containing chicken; no reaction to salmon."
- Rigor baked in day one: evidence-tier floor (§6), **multiple-comparison correction**
  (testing many ingredients × symptoms surfaces spurious hits on small n), protein-level
  before ingredient-level, **associational copy only** ("tends to follow," never "causes").
  Also a vet-report element.

**② Intake-decline calm health flag** *(MANDATORY safety net — ships WITH ①)*
- "Pixel has eaten less than usual the last two days — worth keeping an eye on."
- Routed as calm concern, **never softened into "picky"** (Data Scientist + Dr. Chen,
  non-negotiable). Dr. Chen's sign-off on shipping ① first is conditional on ② shipping
  alongside (§9). Fires at deliberately low thresholds — for safety we accept more
  sensitivity (§7). Coverage caveat: depends on intake-rating coverage (B-033); where
  thin it simply doesn't fire — never reads absence as wellness.

### v2 fast-follow (cheap, additive)
**③ Symptom trend / diet-trial progress** — "Vomiting is down 60% in the two weeks since
the protein switch." Cleanest stat; the one defensible *reassuring* read (multi-sample,
quantified, anchored on `diet_trials.started_at`). Engine is built v1 to anchor on it.

**④ Positive food/treat preference** — "Mochi eats 100% of the hydrolyzed protein vs 60%
of the kibble." B-023's safe (positive, multi-sample) half. Consumption rate over N
offerings; never a single rating.

### Future types (registry slots — not scoped here)
Weight trend, activity level, over/under-feeding vs target, treat-load, multi-pet
preference comparisons, seasonal patterns. Each = one detector + one card renderer.

---

## 5. Composition & prioritization (replaces winner-take-all)

There is **no single finding that wins** (PM, rev 2). The engine composes an ordered,
capped set. Ordering priority (highest first):

1. **Safety / concern** (②, and future concern-type findings) — always leads, always
   visible if present; never buried under a "loves this treat" card.
2. **Context-lead insight** — the most relevant type for this pet's context (§8):
   correlation/trial for a diet-trial pet; preference/intake for a healthy grazer.
3. **Remaining qualifying insights** by evidence tier (Established before Early) then
   recency.

Caps + curation (§3.2) keep the set calm. A pet with one strong finding shows one card —
quality over quantity; we don't pad to fill slots.

---

## 6. Confidence / evidence tiers (NEW — PM rev 2)

Owners want to know how solid a read is. We make confidence **visible but honest**:

- **Two qualitative tiers, derived from sample size + effect strength — never a fake
  percentage** ("87% confident" is fabricated precision; rejected by Dr. Chen + Data Scientist):
  - **Early read** — cleared the minimum floor; provisional. Card wears a calm
    "Early pattern — keep logging to confirm" tag. This is the lever that lets us
    surface *fast* (note #4) without overclaiming.
  - **Established** — cleared the higher threshold (+ multiple-comparison correction for
    correlations). Drops the qualifier; vet-report-grade.
- **Weak / below-floor findings stay fully suppressed** (PM agrees) — the tag is only
  ever shown on findings that already cleared the floor.
- **Calm + subordinate treatment** (Designer): a small label/dot, not a loud meter; no
  anxiety-spiking. Reserve the tag for insight types where confidence genuinely varies
  (correlation, trend) — a deterministic fact (preference rate over N, "you've logged 12
  chicken meals") doesn't need a confidence badge, it needs its sample size shown.

> **Persona read (PM asked us to run it by them):**
> - **Dr. Chen ✓** — an honest "Early read, n=3" *increases* clinical trust; a fake % would
>   destroy it. Tiers tied to sample size are how I'd write it in a note.
> - **Data Scientist ✓** — the tier *is* the mechanism that resolves speed vs quality; it
>   lets us ship at low n provided we label provisional.
> - **Designer ✓** — only if calm and subordinate; not on every card.
> - **Jordan ✓** — "Early pattern, keep logging" makes me *more* likely to keep logging.
> - **Sam ✓** — "still learning Pixel's preferences" is honest, not anxiety-inducing.

---

## 7. Time-to-first-insight & data thresholds (NEW — answers PM note #4)

The tension: surface insights **fast** (so owners get value and keep logging) vs keep
them **high-quality**. Resolution: thresholds are **per-insight-type**, and confidence is
**visible** (§6) rather than waiting for certainty. Starting points (tune on real data):

| Insight | Early read fires at | Established at | Notes |
|---|---|---|---|
| ① Correlation | ≥3 symptom events **and** ≥3 exposures, both arms; relaxed effect bar | ≥5+5, multiple-comparison-corrected significance | Below Early → silent (building). Protein-level first. |
| ② Intake-decline flag | 2 consecutive days below baseline, or refusal of a normally-eaten food | n/a (safety flag, not a "pattern") | Deliberately sensitive — missing the 48hr feline window is worse than a soft false alarm. Different threshold philosophy than ①. |
| ③ Trend / trial | ≥3 events in each pre/post window | full pre/post window | Anchored on a clean event (trial start / protein switch). |
| ④ Preference | ≥3 offerings of a food | ≥8 offerings | Positive multi-sample only; show sample size. |

**Time-to-first-insight target:** a typical actively-logging owner should see at least one
real (non-placeholder) insight — even if Early-tier — within ~3–5 days. Safety flags can
fire sooner. **Open:** validate these floors against real dogfood data before locking
(§11).

> **Threshold philosophy (Data Scientist + Biostatistician + Dr. Chen):** correlations
> bias toward *specificity* (a false "chicken causes vomiting" erodes trust) → higher bar +
> "Early" labeling. Safety flags bias toward *sensitivity* (a missed decline can be
> dangerous) → low bar, calm framing. Two different error-cost profiles, two different floors.

---

## 8. Owner personas — what they want on the home (PM asked us to loop them in)

The two owners want *different* primary surfaces — which is itself the argument for a
**context-adaptive, composable** home rather than one universal sentence.

**Jordan (diet-trial dog owner, Mochi, GI issues) — leads with:**
1. "Is the trial working?" → trend/trial-progress (③). Top of mind every day.
2. "What's triggering Mochi?" → food→symptom correlation (①). The dream insight.
3. "Am I on track / how many days in?" → trial compliance/streak.
- Wants honest "all quiet" when nothing's wrong — warm, not anxious. Does **not** want
  clutter or charts to interpret.

**Sam (healthy cat owner, Pixel, picky/grazing) — leads with:**
1. "What does Pixel actually like / will she eat this?" → preference (④). Her #1 pain.
2. "Is she eating normally?" → intake trend; early non-alarming warning if down (②) — the
   48hr fear.
3. "Which treats does she love?" → positive preference, useful + delightful.
- Does **not** want a cutesy gimmick, pressure to log every nibble, or to be made anxious
  by normal fussiness.

**Design consequence:** the home **prioritizes by pet context** (diet-trial-active →
Jordan stack; healthy/grazing → Sam stack), with safety/concern always on top regardless.
Same detectors, context-weighted ordering (§5).

---

## 9. Clinical guardrails (inherited from B-013, relaxed in one direction)

This is the **cross-incident, multi-sample** layer — the *one* place reassurance is
permitted, carefully:
- **Reassurance only when multi-sample + quantified** ("vomiting down 60% over two weeks"),
  never "your pet is probably fine."
- **Absence of a detected pattern ≠ wellness** → building/stale states, never an all-clear.
- **Concern findings get calm-but-clear treatment** (Principle 4), always rank-top (§5),
  never softened into preference.
- **No causal claims** on correlation — associational only.
- Guardrails embedded in the phrasing prompt; the deterministic ranking ensures concern is
  never outranked.

---

## 10. Copy / voice

Per the nyx-voice skill: first-person pet / second-person owner, specific over generic, no
exclamation marks, plain language ("vomiting," not "emesis"), warm-not-nagging. One sentence
per card; confidence tag is a short calm label.

---

## 11. Open decisions

- **(a)** Tap-to-expand evidence under a card — v1 or defer? (Designer floats; honest, adds surface.)
- **(b)** Exact thresholds / tier cut-offs (§7) — lean: start with the table, tune on real dogfood data before locking.
- **(c)** Visible-card cap (§3.2) — start ~3–4; confirm in design pass.
- **(f) Per-type card presentation (§3.2)** — a design-phase task for the Designer + Data
  Scientist: which insight types render as sentence vs stat vs graph, and the shared visual
  language that keeps mixed formats reading as one calm surface (not a widget gallery). Captured
  now (PM rev 3); resolved in the design pass before/at build Step 3.
- **(d) Principle 3 revision (§3.1)** — PM to confirm the proposed wording so the canonical
  `design-principles.md` + CLAUDE.md can be updated (Tier 2/3). Until confirmed, build proceeds
  under the rev-2 direction but the canonical principle is unedited.
- **(e)** Build timing — DECIDED 2026-05-30: land this spec, build in a dedicated session (B-045).

---

## 12. Phased build plan (tracked as B-045)

Dedicated session, each step gated. Schema largely in place (`ai_signals`, 005). **Rev-2
note:** if v1 surfaces multiple findings, Step 2 likely needs a small additive migration to
store a *set* (e.g. a `findings jsonb` column or a child table) instead of a single
`signal_text` — own PR, additive, Migration Safety Pre-flight (decide at Step 2).

- **Step 1 — Deterministic detection engine.** Pure, server-side, testable module: correlation
  detector (①) + intake-decline detector (②), evidence-tier floors (§6/§7), multiple-comparison
  correction, returns typed ranked candidate findings (§4/§5). **Unit tests required.** No LLM,
  no UI. Acceptance: fixtures above the floor → correct ranked findings + correct tier; below →
  empty (building).
- **Step 2 — `generate-signal` Edge Function + phrasing + cache.** Detect → curate/rank → phrase
  each winner via Claude (voice + guardrail prompt) → cache the ordered set (24h TTL) →
  templated fallback on LLM failure. Decide the cache shape (single vs set) here. Acceptance:
  produces a correct, guardrail-compliant, tier-tagged ordered set; concern outranks reassurance;
  LLM-down path still writes sentences.
- **Step 3 — Wire `SignalZone` to the cache.** Replace the placeholder with the composable card
  stack (§3.2): cache-only read, render the ordered cards + confidence tags + live/building/stale
  states, context-adaptive ordering (§8), async regen (daily-expiry + debounced-after-log),
  optional evidence-expand (§11a). **Per-type renderers** (§3.2 / §11f): a card-renderer interface
  keyed by insight type so sentence / stat / graph cards plug in; v1 ships the renderers its v1
  insight types need, with the shared visual language resolved in the design pass. Acceptance: the
  stack renders, capped + calm, mixed formats read as one surface; building/stale states render;
  safety card leads when present.

---

## 13. Persona sign-off

- **Dir. of Engineering ✓** — architecture B; reuses `ai_signals` (005) + query [2]; detector
  registry is clean extensibility; flagged the possible Step-2 additive migration for a finding set.
- **Data Scientist ✓ (conditional)** — correlation-first is safe because the floor silences it on
  sparse data; evidence tiers resolve speed-vs-quality; decline routed to flag; reassurance multi-sample only.
- **Dr. Chen (Vet) ✓ (conditional)** — ships correlation-first only if the intake-decline safety net
  ships with it; confidence-as-tier (not %) increases trust; no causal claims; concern never softened.
- **Veterinary Nutritionist ✓** — protein-level before ingredient-level; trial anchor is the clean signal.
- **Biostatistician ✓** — correlation gated on multiple-comparison correction + tiering; two error-cost
  profiles (specificity for correlations, sensitivity for safety) drive different floors.
- **Designer ✓ (conditional)** — endorses the richer home *with* the curation clause in revised
  Principle 3 (§3.1): capped, prioritized, calm cards — not a dashboard dump. Confidence tag stays
  subordinate. Per-type formats (§3.2) welcome **if** a shared visual language keeps them reading as
  one calm surface — owns that design pass (§11f).
- **Data Scientist ✓ (presentation)** — graph/sparkline cards (trend, intake-over-time) are the
  honest representation for time-series findings; the structured finding already carries the data a
  graph needs. Co-owns the per-type presentation pass with the Designer (§11f).
- **Jordan ✓** — wants trial-progress + trigger insights up top; "Early, keep logging" drives return.
- **Sam ✓** — wants preferences + honest intake warning; decline never "picky"; confidence framing is calming.
