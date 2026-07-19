# Nyx — Multi-Protein Capture & Set-Membership Correlation (B-351)

**Status:** DRAFT design spec — provisional decisions pending PM/vet-advisor ratification.
**Version:** 0.1 | Created: 2026-07-19
**Owner backlog item:** B-351 (Later). Predecessor: **B-332** (single-protein manual capture, shipped #355). Likely absorbs: **B-048** (ingredient→protein canonicalization).
**Gating Open Question (CLAUDE.md):** *"Capture ALL proteins in a food, not just `primary_protein`? … vet-advisor + PM call on sensitivity vs. attribution before B-351 is spec-ready."*

> **Why this doc exists.** B-351 was surfaced by the PM during B-332 and parked pending a decision on the sensitivity-vs-attribution tradeoff. This design session (2026-07-19) was run **non-interactively** — the live PM decision prompt could not be collected — so per the CLAUDE.md Open-Questions protocol, this doc records **provisional decisions with recommendations, clearly flagged for PM/Dr. Chen ratification** (see §10). Nothing here is built; the spec locks after §10 is ruled.

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

**Conclusion (provisional D1):** capture all proteins; keep attribution honest via collinearity-aware joint attribution. The sensitivity/attribution framing is a false binary once capture and attribution are separated.

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

## 6. Manual capture (`ProteinPicker` → multi-select)

B-332 shipped a **single-select** `ProteinPicker` (wrapping `ChipGroup`, `COMMON_PROTEINS` + "Other" typed escape) on the food-capture edit step and the food-detail edit screen. B-351 extends it to **multi-select**:

- Multi-select `ChipGroup` (already supported) over `COMMON_PROTEINS`, storing an ordered set; the first-selected (or an explicit "primary" affordance) becomes `proteins[0]`.
- The "Other" typed escape appends a canonicalized custom protein to the set.
- **Never null-clobber an AI value** (the load-bearing B-332 property) — extended: the picker reseeds from the full `proteins` array and only writes on an owner tap/keystroke, so an AI-hydrated multi-protein set is never silently overwritten.
- Copy/voice: the field is still optional (many treats/legacy rows have none); the label stays factual ("Proteins" / "Main proteins"), never preference framing (B-112 intake≠preference is a separate axis, but keep the register plain). `nyx-voice` pass required.

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

**The adversarial pass must try to break, at minimum:**
- A daily staple + a sporadic co-occurring secondary → the staple washes out, the secondary is correctly attributable *only* once it appears without the staple; no false signal while they're collinear.
- A 4-protein food fed alongside a 1-protein food → family size counts clusters, not the 5 raw proteins; the bar against a real single-protein correlate does not silently tighten.
- Two always-together proteins where one is the true culprit → reported as a **joint** candidate, never one falsely credited; the copy never reassures about the other.
- The B-156 medication-vehicle drop + B-040 free-fed standing-exposure paths still hold when a meal carries a *set* rather than a single protein.

---

## 8. Trial-contaminant check (Phase A — deterministic, §3)

**8a — trial food self-contamination (the pure win).** When a `diet_trial` is active and its trial `food_item_id`'s `proteins` set contains **more than one** protein (or a protein other than the trial's novel/target protein), surface a calm, factual flag at:
- **capture / confirm time** for that food ("This food lists *chicken* as a secondary protein…"), and
- the **diet-trial card** (Pet profile) as a standing note.

`diet_trials` has **no explicit excluded-protein column** today (it references a single trial `food_item_id`; the target protein is implicit = the trial food's intended novel protein). v1 keys off the **trial food's own protein set vs. its `is_novel_protein` / `proteins[0]`** — no schema change to `diet_trials`. An explicit `excluded_proteins TEXT[]` on `diet_trials` is a **future enhancement** (D6, deferred) for trials that exclude a named list rather than "everything but the novel protein."

**8b — off-diet exposure during an active trial.** A *different* food/treat logged during an active trial whose protein set includes a protein not sanctioned by the trial is an off-diet exposure. This **composes with** (does not duplicate) the vet report's existing off-diet / free-fed double-count surfacing — the multi-protein set just makes the exposure *complete*. Scope for Phase A: surface at most as a diet-trial-card note; deeper vet-report integration rides Phase B / the report renderer.

**Safety register:** never reassure (a *clean* protein set is not an "all clear" — `clinical-guardrails`); the flag is descriptive/`worth-a-look`, never alarmist; `nyx-voice` + `clinical-guardrails` mandatory.

---

## 9. Vet report (`generate-report`)

- The "diet / proteins" surfaces render the **full protein set** per food, primary emphasized, secondaries listed — the vet sees the complete exposure, which is precisely the data they'd otherwise reconstruct from the ingredient panel by hand.
- The protein-over-time chart (§5.8 colour-carve, already ratified) extends to set-membership (a food-week can contribute to multiple protein bands).
- A contaminated trial food (§8a) surfaces in the diet-trial section as a factual "secondary protein present" line — high clinical value, never causal.
- All existing joins that read `primary_protein` keep working (it's still `proteins[0]`); the report *adds* the secondaries rather than reworking the primary path. `vet-report-cold-read` gate on any rendered change.

---

## 10. Provisional decisions — **PM / Dr. Chen ratification required**

These were to be collected live this session; recorded provisionally per the Open-Questions protocol. **Recommend-and-proceed** unless overridden.

| # | Decision | Provisional ruling (recommended) | Who ratifies |
|---|---|---|---|
| **D1** | **Capture all proteins & correlate on set-membership?** (the blocking Open Question — sensitivity vs. attribution) | **YES — phased.** Sensitivity is an unambiguous data-completeness win; attribution stays honest via collinearity-aware joint candidates (§7). False binary once the two jobs are separated (§2). | PM + Dr. Chen / vet advisors |
| **D2** | **Trial-contaminant check — sequencing** | **Pull forward as Phase A** (deterministic, near-zero statistical risk, wedge-centred). Ship before the set-membership correlation. | PM |
| **D3** | **Does B-351 absorb B-048** (ingredient→protein canonicalization)? | **Absorb.** The multi-protein set *is* derived by structuring `ingredients_notes`; one spec owns extraction→structured proteins→canonical keys (§5). | PM |
| **D4** | **Schema shape** | **`food_items.proteins TEXT[]`** (ordered, canonical, `proteins[0]`=derived `primary_protein`); additive, back-compat. Join table rejected (over-engineered); jsonb deferred. | Dir. of Eng |
| **D4a** | Per-protein metadata (extraction confidence / list position)? | **Defer.** `TEXT[]` first; jsonb widening is non-breaking if a real need appears. | Dir. of Eng |
| **D5** | **Collinearity attribution surface** — joint candidate copy ("chicken and/or duck — can't yet separate") | **Adopt** as the honest attribution surface; exact copy at build time (`nyx-voice` + Dr. Chen). | Dr. Chen + Designer |
| **D6** | Explicit `excluded_proteins` on `diet_trials`? | **Defer.** v1 contaminant check keys off the trial food's own set vs. its novel protein — no `diet_trials` schema change. Explicit excluded list is a future enhancement. | PM |

---

## 11. Provisional PR plan (locks after §10 ratification)

**Phase A — capture + deterministic contaminant (wedge-first, low statistical risk):**
1. **Schema migration** — `food_items.proteins TEXT[]` + backfill from `primary_protein`; local `food_items_cache` mirror + `refreshFoodCache`. *(Own PR — schema isolation. Migration Safety Pre-flight: additive, destructive=`n`, rollback=`DROP COLUMN`.)*
2. **Extraction** — `extract-food-from-photo` emits ordered `proteins`; write-back sets `proteins` + derived `primary_protein`; absorbs B-048 canonicalization (§5). *(Edge Function; deno tests; `deploy-edge` bundle.)*
3. **Manual capture** — `ProteinPicker` → multi-select; never null-clobber an AI set (§6). *(Client; `nyx-voice`.)*
4. **Trial-contaminant flag (§8a)** — deterministic capture-time + diet-trial-card note. *(Client + shared helper; `clinical-guardrails` + `nyx-voice`.)*

**Phase B — set-membership correlation (statistical, `adversarial-reviewer` MANDATORY):**
5. **Engine** — `detection.ts` + `lib/analytics.ts` key on set-membership + collinearity clustering + joint attribution (§7). *(Shared `lib/protein.ts` extended to map a set on read; `adversarial-reviewer` mandatory; deploy-gated on the client renderer per the B-182 lesson.)*
6. **Vet report** — render the full protein set + contaminant line (§9). *(Edge Function; `vet-report-cold-read` gate.)*

Phase A slices 2/3/4 are largely **parallelizable** (disjoint files — extraction vs. picker vs. trial card) once slice 1's schema lands. Phase B is sequential and gated.

---

## 12. What is explicitly NOT lost today

The full ingredient list is **already** captured verbatim (`ingredients_notes`, AAFCO order). B-351 does not add raw data collection — it **structures latent data we already hold**. So there is no urgency-of-data-loss argument; the urgency is purely that the clinical surfaces can't *see* the secondary exposure until it's structured. This also means the migration can backfill opportunistically and extraction can re-derive from stored `ingredients_notes` for existing rows if desired (a future backfill nicety, not required for v1).

---

## 13. Open questions this raises

- **Ingredient re-derivation backfill:** should slice 2 also re-run protein derivation over existing rows' stored `ingredients_notes` (structuring history), or only populate `proteins` going forward + the naive `primary_protein` backfill? (Recommend: forward + naive backfill for v1; historical re-derivation is a separate, cheap, idempotent backfill job.)
- **Near-collinearity threshold:** how "always together" is collinear-enough to force a joint candidate (100% co-occurrence vs. a fraction)? A build-time `adversarial-reviewer`-swept parameter, like B-070's dominance fraction.
- **Treat vs. meal protein weighting:** a chicken *treat* is a chicken exposure exactly like a chicken meal (detector ① already ignores `food_type` for exposure) — confirm the set-membership change preserves that.
