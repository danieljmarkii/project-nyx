# Nyx — Multi-Protein Capture & Set-Membership Correlation (B-351)

**Status:** DESIGN-RATIFIED (2026-07-19) — D1–D8 ruled by the PM over a mock-review session; build-ready. Spec locks; PRs can start.
**Version:** 1.0 | Created: 2026-07-19 | Last Updated: 2026-07-19
**Owner backlog item:** B-351 (Later). Predecessor: **B-332** (single-protein manual capture, shipped #355). Absorbs: **B-048** (ingredient→protein canonicalization).
**Gating Open Question (CLAUDE.md):** *"Capture ALL proteins in a food, not just `primary_protein`? … vet-advisor + PM call on sensitivity vs. attribution before B-351 is spec-ready."* → **RESOLVED (D1, §10): capture all, phased.**
**Design mocks:** `docs/nyx-multi-protein-mockups.html` — the owner-facing surfaces (Main-protein/Also-contains picker · trial-contaminant catch at *add + log* · joint-candidate Signal · vet-report protein exposure).

> **How this was ratified.** B-351 was surfaced by the PM during B-332 and parked on the sensitivity-vs-attribution tradeoff. The design session (2026-07-19) opened non-interactively with provisional decisions, then the PM reviewed the mocks turn-by-turn and ruled each call: D1 capture-all/phased ✓, D2 contaminant-at-add-*and*-log ✓, D7 disclosure-vs-escalation tiers ✓, D8 Main-line/Also-contains picker ✓ ("10/10, super clear"), the joint-candidate resolution ✓ ("let the vet piece it together"), and Dr. Chen's vet-report conditions ✓. §10 records the final rulings.

---

## 1. The problem in one paragraph

Today `food_items.primary_protein` is a **single** `TEXT` column. The flagship diet correlation (`generate-signal/detection.ts`), the Patterns dashboard (`lib/analytics.ts`), and the vet report (`generate-report`) all key off that one field. But a real food frequently contains **several** proteins — a "duck" novel-protein food that also lists *chicken by-product meal* is the textbook elimination-trial contaminant. Because we only store the primary, that secondary chicken exposure is **invisible to every clinical surface**, even though the full ingredient list is already captured verbatim as free text in `food_items.ingredients_notes`. B-351 structures that latent data so the exposure the wedge cares about most stops being silently dropped.

---

## 2. The core tension — and why it is a false binary

The backlog records a genuine, unresolved persona split:

- **Dr. Chen / vet advisors (capture all):** for the elimination / novel-protein trial — *our wedge* — hidden *secondary* proteins are the **single most common reason a home trial silently fails**. "Primary only" systematically misses the exposure that matters most. Capture everything.
- **Sr. Data Scientist (counterweight):** multi-protein is **not a free win**. Co-occurring proteins are **collinear** (you can't tell which one drove the symptom), foods with 4–5 proteins **bloat the exposure set** and the Bonferroni family, and per-protein effective-n **drops**. It raises *sensitivity to hidden exposure* but muddies *which* protein is the culprit.

**Resolution — the two are different jobs that `primary_protein` currently conflates:**

| Job | Question | Multi-protein effect |
|---|---|---|
| **Exposure / sensitivity** | *Did the pet encounter protein X at all?* | **Unambiguous win.** You cannot detect a contaminant you never recorded. This is a data-completeness fix, not a tradeoff. |
| **Attribution / culprit** | *Which protein among several drove the symptom?* | **Real risk** — but it is a *ranking/confidence* problem, not a *capture* problem, and the engine already has the machinery to keep it honest. |

Capturing all proteins wins Job 1 outright. The Job-2 risk is contained by three guardrails the engine **already anticipates** (§7):

1. **Collinearity → joint candidate.** Two proteins that *always* co-occur in this pet's diet are statistically inseparable. The engine must **not credit one falsely** — it surfaces them jointly ("chicken and/or duck — can't yet be separated") and counts them as **one** effective candidate (which also bounds the Bonferroni family).
2. **Omnipresent proteins self-eliminate.** A protein in *every* case and control window is a staple and the case-crossover already washes it out (B-070). Capturing more proteins does **not** automatically bloat the candidate family — only *discriminating* proteins are candidates.
3. **Effective-n floors stay.** The existing minimum-sample floors and the `notEnoughData` sentinel already refuse to rank below floor. Nothing here weakens them.

**Conclusion (D1 — RATIFIED):** capture all proteins; keep attribution honest via collinearity-aware joint attribution. The sensitivity/attribution framing is a false binary once capture and attribution are separated. The PM's ratification came with a governing steer that shapes §7–§9: **"let the vet piece it together"** — surface honest exposure and reserve causal synthesis for the clinician, rather than over-computing a verdict on Home.

---

## 3. The highest-value slice is deterministic, not statistical

Before any correlation math, there is a clean, wedge-centred win that carries **near-zero statistical risk**:

> **Trial-contaminant check.** For a pet on a declared elimination / novel-protein `diet_trial`, a food whose captured protein set contains a protein the trial should exclude is a **contaminant**. Flag it deterministically at capture / diet-trial time — *"This food lists **chicken** as a secondary protein. Nyx's elimination trial is on **duck** — chicken may contaminate the trial."*

No correlation to accumulate, no attribution ambiguity, no Bonferroni. It is exactly the failure mode Dr. Chen names, caught the moment the data exists. This is why the recommended build is **phased** (§9): ship the deterministic contaminant flag first, then the harder set-membership correlation.

Two contaminant sub-cases (§8 details):
- **3a — the trial food is itself contaminated:** the "duck" trial food's protein set = `{duck, chicken}`. Multi-protein capture of the *trial food itself* reveals the chicken. This is the purest win and needs **no explicit excluded list** — it compares the trial food's own set against its novel/target protein.
- **3b — off-diet exposure during an active trial:** a *different* food/treat logged during the active trial whose protein set includes a non-sanctioned protein. Partly overlaps the vet report's existing off-diet / free-fed double-count surfacing.

---

## 4. Data model (provisional D4 — Engineer lean)

Add an **ordered protein array** to `food_items`; keep `primary_protein` as the derived first element for back-compat.

```sql
-- Migration 0NN_food_items_proteins.sql  (additive-only, non-destructive)
ALTER TABLE food_items
  ADD COLUMN proteins TEXT[] NOT NULL DEFAULT '{}';   -- prominence-ordered canonical protein keys
```

- **`proteins`** — an ordered array of canonical protein keys (prominence order, as they appear in the ingredient list; the most prominent first). Each element is already `canonicalizeProtein`-stable, so an owner-picked chip and an AI-extracted value key identically (the B-332 parity property, extended to the set). Empty array = protein-unknown (never a junk key).
- **`primary_protein`** stays as-is and becomes the **derived convenience** = `proteins[0]` (first/most-prominent). Every existing read (`ProteinPicker` seed, vet report joins, picker display) keeps working unchanged during and after migration.
- **Backfill:** existing rows → `proteins = ARRAY[canonicalizeProtein(primary_protein)]` when non-null, else `'{}'`. Additive, reversible (`DROP COLUMN proteins`), non-destructive (Migration Safety Pre-flight: destructive=`n`, rollback=`DROP COLUMN proteins`, backfill SQL above).

**Why `TEXT[]` and not jsonb / a join table:**
- The correlation engine only needs **set-membership** — `TEXT[]` is the exact shape, GIN-indexable, and dependency-free through the existing `canonicalizeProtein` path.
- A **join table** is over-engineered: no per-protein relational data is needed, and it would complicate the offline SQLite mirror + last-write-wins sync (a food is one row today).
- **jsonb** is the alternative *only if* we later want per-protein metadata (extraction confidence, ingredient-list position). Deferred — `TEXT[]` first; jsonb is a non-breaking future widening if a real need appears. (Flagged as sub-decision D4a for the PM.)

**Local mirror:** `food_items_cache` gains a `proteins` column (mirror the `archived_at`/`photo_path` ALTER-upgrade pattern from #385); `refreshFoodCache` pulls and writes it. The B-052 `canonicalizeProtein` module stays the single source of truth for keying — it now maps a *set* on read.

---

## 5. Extraction (`extract-food-from-photo`)

The function **already** captures the full ingredient list verbatim (`ingredients_text`, AAFCO order, "do not reorder/paraphrase/omit") and writes it to `ingredients_notes`. B-351 structures it:

- The tool schema gains a **`proteins`** output: an ordered array of the animal-protein sources the model identifies in the ingredient list, most-prominent first, each a canonical bare-animal term (`chicken`, `salmon`, …) — *not* the processing qualifier (the model emits `chicken`, not `chicken by-product meal`; `canonicalizeProtein` is still the server-side backstop).
- `primary_protein` is retained in the output (= `proteins[0]`) for back-compat; the write-back sets both `proteins` and the derived `primary_protein`.
- Per-field confidence already exists — extend it to `proteins`. A low-confidence secondary protein is still *captured* (sensitivity direction) but can be surfaced for owner confirmation on the confirm screen (Job 1 never silently drops an exposure).
- **This is where B-048 lands (provisional D3):** the ingredient→protein structuring *is* the multi-protein derivation. One spec owns extraction → structured `proteins` → canonical keys end-to-end. The narrow synonym-mapping B-048 contemplated (`ocean whitefish` → `whitefish`) becomes a bounded server-side normalization table applied inside the extraction/canonicalization path — **not** a re-merge of already-stored keys (which `canonicalizeProtein`'s §29 scope note deliberately avoids).

---

## 6. Manual capture — two lines: "Main protein" + "Also contains" (D8 — RATIFIED)

B-332 shipped a **single-select** `ProteinPicker` (wrapping `ChipGroup`, `COMMON_PROTEINS` + "Other" typed escape) on the food-capture edit step and the food-detail edit screen. B-351 **does not** turn it into one flat multi-select list — an earlier draft did, and the "first tap = main" model made *editing which protein is primary* clunky (deselect all → re-tap in order). The PM's review settled a cleaner two-line layout ("10/10, super clear"):

- **Line 1 — "Main protein"** (single-select): **the shipped B-332 `ProteinPicker`, unchanged.** One tap sets it, one tap changes it. This is `proteins[0]`.
- **Line 2 — "Also contains"** (multi-select, optional): the secondary proteins. AI-extracted secondaries land here; the owner adds/removes freely.
- **Editing the main is one tap, and never loses the set:** picking a new main **auto-demotes the previous main into "Also contains."** So `proteins = [main, ...alsoContains]` and no protein is ever silently dropped by a re-designation.
- A protein is never in both lines: selecting it as main removes it from "Also contains" (and vice-versa).
- **Never null-clobber an AI value** (the load-bearing B-332 property, extended): both lines reseed from the stored `proteins` array and only write on an owner tap/keystroke, so an AI-hydrated set is never silently overwritten — a wrong extraction is corrected, not fought.
- Copy/voice: both fields stay optional (many treats/legacy rows have none) and factual — "Main protein" / "Also contains", never preference framing (B-112 intake≠preference is a separate axis). `nyx-voice` pass required.

**Why two lines, not one (the clinical rationale):** the main is *what the food is sold as* (and, in a trial, the target protein); the secondaries are *the hidden exposure that breaks trials*. The two lines literally are the two jobs of §2 — separating them in the form is the same separation that unties the sensitivity-vs-attribution knot.

---

## 7. Correlation engine (`detection.ts` + `lib/analytics.ts`) — set-membership with collinearity guardrails

**This is the load-bearing, `adversarial-reviewer`-mandatory part.** Today each meal maps to **one** `canonicalizeProtein(m.primaryProtein)`; proteins are already keyed as a `Set<string>` per window internally, so the case-crossover is *structurally* close to set-membership already. The change:

1. **Each meal contributes its full protein SET**, not a single protein. A protein is "exposed" in a window iff it is in **any** in-window meal's protein set. This is the direct sensitivity win — the hidden secondary protein now enters the exposure set.
2. **Collinearity clustering (the Data guardrail).** Before ranking candidates, group proteins that are **perfectly (or near-perfectly) collinear** across the pet's classifiable exposures into **one joint candidate**. Attribution is reported for the *cluster*, and the copy names them jointly and honestly ("chicken and/or duck — these always appear together, so Nyx can't yet separate them"). This:
   - keeps the Bonferroni family sized by **discriminating clusters**, not raw protein count (kills the "4–5 proteins bloat the family" objection);
   - prevents the false-attribution failure the Data Scientist flags (never credit one collinear protein over its twin).
3. **Omnipresent-staple washout is unchanged** (B-070) — a protein in ≥ dominance-fraction of all exposures is genuinely unassessable and washes out; this now applies per protein in the set. Never reassurance (an omnipresent exposure is unassessable, not "safe").
4. **Confidence/attribution machinery reused.** The existing `AttributionConfidence` (`low`/…) and `standingConfounder` tier-capping carry over per-cluster: a cluster with only collinear/low-confidence exposures caps at Early; a protein that *does* discriminate (appears in some case windows without its former co-occurrers) earns clean attribution as the diet varies.
5. **Effective-n floors + `notEnoughData` sentinel unchanged.** Below floor → sentinel, never a fabricated rank.
6. **Where the joint candidate SURFACES (RATIFIED — "let the vet piece it together").** Collinearity is **always computed** — it is the correctness guardrail that stops the engine falsely blaming duck when it cannot distinguish duck from chicken (and stops a false "duck is fine"). But the surfacing is deliberately restrained:
   - **On Home:** a joint candidate is shown **only when it clears the same effective-n/floor a single culprit would**, and the copy is **action-led** ("feed them apart"), never ambiguity-led. Design (mock §3): a compact **linked pair** (`Chicken + Duck · always fed together`) with the can't-separate explanation + resolving action in the body sentence — **not** a text-heavy pill. It is expected to be a **rare** card (chicken's ubiquity usually breaks collinearity in a varied diet; it's most likely for a mono-food cat or a strict single-food trial dog).
   - **On the vet report:** the full primary/secondary set is laid out (§9) for the clinician to synthesize — this is the primary home for the "piece it together" work, not a heavy Home card. The engine surfaces honest exposure; the vet draws the causal line.

**The adversarial pass must try to break, at minimum:**
- A daily staple + a sporadic co-occurring secondary → the staple washes out, the secondary is correctly attributable *only* once it appears without the staple; no false signal while they're collinear.
- A 4-protein food fed alongside a 1-protein food → family size counts clusters, not the 5 raw proteins; the bar against a real single-protein correlate does not silently tighten.
- Two always-together proteins where one is the true culprit → reported as a **joint** candidate, never one falsely credited; the copy never reassures about the other.
- The B-156 medication-vehicle drop + B-040 free-fed standing-exposure paths still hold when a meal carries a *set* rather than a single protein.

---

## 8. Trial-contaminant check (Phase A — deterministic, §3)

**Two contaminant shapes (both ship):**
- **Shape ① — the trial food is itself contaminated (the pure win).** A "duck" trial food whose `proteins` set = `{duck, chicken}`. Multi-protein capture of the *trial food itself* reveals the chicken.
- **Shape ② — off-diet exposure during an active trial.** A *different* food/treat logged during the active trial whose protein set includes a protein not sanctioned by the trial (a chicken kibble fed during a duck trial).

**Two surfaces — and they behave differently (D2 — RATIFIED: flag at add AND log).** A food often enters the library *before* a trial starts, so the add-to-library moment can't see the trial; the trial context is live at log time. So the flag fires at **both** moments — but with different registers governed by the design principles:

| Surface | Register | Why |
|---|---|---|
| **Adding a food to the library** | **Soft confirm** — a "Not now / Add anyway" choice is fine. | The food is not at the moment-of-event; presenting a choice here is allowed. |
| **Logging a meal of the food** | **Non-blocking** — the meal saves the instant the owner taps; the heads-up **rides the meal completion card** afterward, with "tap to undo" already present. **No gate, no "are you sure?".** | **Principle 1 — zero decisions at the moment of event.** Logging must stay a one-tap action; a confirmation gate here would violate the wedge's core interaction. |
| **Diet-trial card** (Pet profile) | Standing factual note. | Persistent context, not a moment. |

Copy (mock §2, `nyx-voice`, non-reassuring): *"This one has chicken. Nyx's duck trial should skip chicken. The meal's saved — just worth knowing, and maybe a note for your vet."*

`diet_trials` has **no explicit excluded-protein column** today (it references a single trial `food_item_id`; the target protein is implicit = the trial food's intended novel protein). v1 keys off the **trial food's own protein set vs. its `is_novel_protein` / `proteins[0]`** — no schema change to `diet_trials` (**D6 — RATIFIED, deferred**). Shape ② composes with (does not duplicate) the vet report's existing off-diet / free-fed double-count surfacing.

**Safety register:** never reassure (a *clean* protein set is not an "all clear" — `clinical-guardrails`); the flag is descriptive/`worth-a-look`, never alarmist; `nyx-voice` + `clinical-guardrails` mandatory.

### 8.5 Two tiers — disclosure (everyone) vs. escalation (trial) — D7, RATIFIED

The contaminant *escalation* above is trial-scoped. But the underlying insight — *"so many foods say 'chicken' and quietly also contain salmon"* — is a **universal owner-education** win, not a trial-only one. So multi-protein surfacing is two-tiered:

- **Tier 1 — Disclosure (all owners, always).** The food's full protein set is shown plainly wherever a food appears (food card / detail / confirm): "Duck · also contains Chicken, Salmon." Factual, quiet, educational. No trial required. This is the "know what's actually in the bowl" tier.
- **Tier 2 — Contaminant escalation (active trial only).** The amber "heads up, this conflicts with the duck trial → worth a vet word" (§8 above). Only this tier escalates.

**Guardrail (Designer):** Tier 1 disclosure is *informational*, never a repeated nudge — Principle 4. It is shown on the surface where the food is presented; it never barks on every log. Only the Tier-2 trial conflict rides the completion card. `nyx-voice` pass on both tiers.

---

## 9. Vet report (`generate-report`) — primary + secondary, Dr. Chen ratified

**Dr. Chen's clinical verdict (consulted this session): YES, high value.** The first thing a vet does with a diet history in a food-responsive workup is scan for **protein overlap** — the marketing name on the bag is clinically meaningless, and a "duck" diet that also contains chicken *invalidates the elimination trial*. Today the vet only learns that if the owner brings the physical bags and the vet reads the ingredient panels in-room. Laying out actual primary+secondary exposure across every food in the window turns a 10-minute label-reading exercise into a 60-second glance.

**Ratified with three clinical-hygiene conditions:**
1. **Provenance, stated once.** A quiet line — *"Proteins as read from product labels."* Label-derived, not lab-verified; the vet must weight it accordingly. Never asserted as fact.
2. **Primary reads first, secondaries subordinate.** Visual weight tracks prominence (bold `proteins[0]`, quiet secondaries) — a 60-second scan should never hunt for the headline protein.
3. **Present-only, never causal.** List what is *in* the food; never imply a secondary protein *caused* anything. The report shows exposure; the clinician draws the line ("let the vet piece it together").

**Render:**
- The diet section renders the **full protein set** per food (primary emphasized, secondaries listed); off-trial proteins under an active trial are **flagged** (a factual `*` "off-trial protein present", never causal).
- The protein-over-time chart (§5.8 colour-carve, already ratified) extends to set-membership (a food-week can contribute to multiple protein bands).
- All existing joins that read `primary_protein` keep working (it's still `proteins[0]`); the report *adds* the secondaries rather than reworking the primary path.
- `vet-report-cold-read` gate on the rendered change; `clinical-guardrails` (present-only, never causal).

**Timing (RATIFIED): a Phase A fast-follow, not gated behind the correlation engine.** The report only needs the *captured set*, not the statistics — so once foods carry `proteins` (Phase A), the report can render them without waiting on the Phase B joint-candidate work. Given the education value, the vet sees the real exposure early. (It still ships *after* Phase A capture, since there are no secondaries to render before then.)

---

## 10. Decisions — RATIFIED (PM mock-review session, 2026-07-19)

| # | Decision | Ruling |
|---|---|---|
| **D1** | Capture all proteins & correlate on set-membership? (the blocking Open Question — sensitivity vs. attribution) | **RATIFIED — YES, phased.** Sensitivity is an unambiguous data-completeness win; attribution stays honest via collinearity-aware joint candidates (§7). False binary once the two jobs are separated (§2). Governing steer: **"let the vet piece it together."** |
| **D2** | Trial-contaminant check — sequencing & surfaces | **RATIFIED — Phase A, flag at BOTH add-to-library AND meal-log** (a pre-trial library food only meets the trial at log time). Log-time is **non-blocking** (Principle 1); add-time is a soft confirm (§8). |
| **D3** | Does B-351 absorb B-048 (ingredient→protein canonicalization)? | **RATIFIED — absorb.** The multi-protein set *is* derived by structuring `ingredients_notes`; one spec owns extraction→structured proteins→canonical keys (§5). |
| **D4** | Schema shape | **RATIFIED — `food_items.proteins TEXT[]`** (ordered, canonical, `proteins[0]`=derived `primary_protein`); additive, back-compat. Join table rejected; jsonb deferred. |
| **D4a** | Per-protein metadata (extraction confidence / list position)? | **Deferred.** `TEXT[]` first; jsonb widening is non-breaking if a real need appears. |
| **D5** | Collinearity attribution surface | **RATIFIED — joint candidate: compute always (guardrail); surface on Home only above the single-culprit floor, action-led, as a compact linked-pair (not a text pill); the vet report is the synthesis surface** (§7 #6, §9). Exact copy at build time (`nyx-voice` + Dr. Chen). |
| **D6** | Explicit `excluded_proteins` on `diet_trials`? | **RATIFIED — deferred.** v1 keys off the trial food's own set vs. its novel protein — no `diet_trials` schema change. |
| **D7** | Disclosure vs. escalation tiers | **RATIFIED — two tiers** (§8.5): Tier 1 disclosure (full protein set shown to ALL owners, always, informational — the "chicken food secretly has salmon" education win); Tier 2 contaminant escalation (active trial only). Only Tier 2 escalates; Tier 1 never nudges (Principle 4). |
| **D8** | Manual-capture picker shape | **RATIFIED — two lines: "Main protein" (single-select, = shipped B-332 picker unchanged, `proteins[0]`) + "Also contains" (multi-select secondaries); changing the main auto-demotes the old main so the set is never lost** (§6). PM: "10/10, super clear." |
| **VR** | Vet report primary+secondary | **RATIFIED (Dr. Chen)** with three conditions — provenance line, primary-first, present-only/never-causal; pulled to a **Phase A fast-follow** (§9). |

---

## 11. PR plan — RATIFIED

**Phase A — capture + deterministic contaminant + report render (wedge-first, low statistical risk):**
1. **Schema migration** — `food_items.proteins TEXT[]` + backfill from `primary_protein`; local `food_items_cache` mirror + `refreshFoodCache`. *(Own PR — schema isolation. Migration Safety Pre-flight: additive, destructive=`n`, rollback=`DROP COLUMN`.)*
2. **Extraction** — `extract-food-from-photo` emits ordered `proteins`; write-back sets `proteins` + derived `primary_protein`; absorbs B-048 canonicalization (§5). *(Edge Function; deno tests; `deploy-edge` bundle.)*
3. **Manual capture (D8)** — the two-line "Main protein" + "Also contains" picker; auto-demote on main-change; never null-clobber an AI set (§6). *(Client; `nyx-voice`.)*
4. **Disclosure + trial-contaminant flag (D7/D2/§8/§8.5)** — Tier-1 protein-set disclosure on the food surfaces; Tier-2 contaminant flag at **add (soft) + log (non-blocking, rides the completion card)** + the diet-trial-card note. *(Client + shared helper; `clinical-guardrails` + `nyx-voice`.)*
5. **Vet-report render (VR)** — full protein set per food, primary emphasized, off-trial `*` flag, provenance line (§9). *(Edge Function; `vet-report-cold-read` gate.)* Depends only on Phase A capture, not the engine.

**Phase B — set-membership correlation (statistical, `adversarial-reviewer` MANDATORY):**
6. **Engine** — `detection.ts` + `lib/analytics.ts` key on set-membership + collinearity clustering + joint attribution + the Home linked-pair render (§7). *(Shared `lib/protein.ts` extended to map a set on read; `adversarial-reviewer` mandatory; deploy-gated on the client renderer per the B-182 lesson.)*

Phase A slices 2/3/4/5 are largely **parallelizable** (disjoint files — extraction vs. picker vs. flag/disclosure vs. report) once slice 1's schema lands. Phase B is sequential and gated.

---

## 12. What is explicitly NOT lost today

The full ingredient list is **already** captured verbatim (`ingredients_notes`, AAFCO order). B-351 does not add raw data collection — it **structures latent data we already hold**. So there is no urgency-of-data-loss argument; the urgency is purely that the clinical surfaces can't *see* the secondary exposure until it's structured. This also means the migration can backfill opportunistically and extraction can re-derive from stored `ingredients_notes` for existing rows if desired (a future backfill nicety, not required for v1).

---

## 13. Open questions this raises

- **Ingredient re-derivation backfill:** should slice 2 also re-run protein derivation over existing rows' stored `ingredients_notes` (structuring history), or only populate `proteins` going forward + the naive `primary_protein` backfill? (Recommend: forward + naive backfill for v1; historical re-derivation is a separate, cheap, idempotent backfill job.)
- **Near-collinearity threshold:** how "always together" is collinear-enough to force a joint candidate (100% co-occurrence vs. a fraction)? A build-time `adversarial-reviewer`-swept parameter, like B-070's dominance fraction.
- **Treat vs. meal protein weighting:** a chicken *treat* is a chicken exposure exactly like a chicken meal (detector ① already ignores `food_type` for exposure) — confirm the set-membership change preserves that.
