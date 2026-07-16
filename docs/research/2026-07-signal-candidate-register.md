# Signal Candidate Register — Home Signals card

**Type:** product-research brief (non-build). **Date:** 2026-07-15.
**Method:** multi-persona review (Data Scientist · Dr. Chen · Designer · Sam · Jordan · Trust & Safety) over literature + our own schema/data + the seed vet-tech email. Persona Conflict Protocol used where lenses genuinely disagreed (§7).
**Status:** DRAFT for PM review. This brief proposes candidates and a priority order; it creates **no** backlog tickets. Proposed rows are staged in §9 for PM ratification before any `B-NNN` is written.

> This is a candidate *register*, not a build plan. A signal's legitimacy here is **clinical, not statistical** — literature and clinical priority generate the candidate; our data decides feasibility; synthetic data only validates specificity; and the safety spine (§1) can veto a statistically-clean idea outright.

---

## 1. The safety spine (every candidate is checked against this)

1. **n=1 never reassures.** A single-sample read may escalate on the **presence** of a red flag, never reassure on its **absence**. Absence ≠ wellness. This is why every "positive"/all-clear signal is hazardous and is confined to the engagement/descriptive classes here, never a clinical verdict.
2. **Intake is not preference.** Decline/refusal routes to a health flag, never "picky."
3. **Descriptive lanes are associational-only.** Name timing/counts with the denominator attached; never cause or mechanism.
4. **Principle 3 — Home is a curated intelligence surface.** Safety leads; ~4 cards max. More candidate *types* expand the pool, not the display. A new detector competes for a slot; it does not add one.
5. **Pets > $.** Any safety-bearing signal is free forever, never paywalled (Principle 7).
6. **The disposition ladder** (observed across the corpus, our governing pattern): an emerging pattern is either **(a)** routed to a deterministic lane if it passes the descriptive-lane five-part inclusion rule (`nyx-descriptive-signals-requirements.md` §1.1); **(b)** held for its own spec + a *mandatory* adversarial pass if it is clinically load-bearing and needs a defensible threshold (the weight-loss-flag template, `024_weight_checks.sql`); or **(c)** kept in the emerging-signals debate / rejected if it asserts a food→symptom relationship below detector ①'s floors.

---

## 2. What already exists — the dedupe baseline (do NOT re-propose)

From `supabase/functions/generate-signal/detection.ts` (`DETECTOR_REGISTRY`) and the descriptive/chronicity specs. Extensions to these are fair game and are flagged as such below.

| # | Detector | Class | Status |
|---|---|---|---|
| ① | `food_symptom_correlation` | associational (McNemar, above floors) | live |
| ② | `intake_decline` | safety | live — but **misses the meal-refusal signal** on treat-noisy/unrated baselines (self-dilution, → SC-4) |
| ③ | `reflection` | reflection | live — gated silent by ④ and ⑦ |
| ④ | `symptom_worsening` | safety (week-over-week *delta*) | live |
| ⑤ | `postprandial_timing` | descriptive | live (B-078) |
| ⑥ | `timeofday_clustering` | descriptive | live (B-079); blocked for real users until client writes timezone (B-085) |
| ⑦ | `symptom_chronicity` | safety (long-span *persistence*) | built (B-182 PRs 1–3), deploy-gated on redeploy + D2 ratification |
| — | coverage lane: `rate_meals`, `staple_washout` | diagnostic | live |
| — | diet-structure: `meal_type_collapse`, `diet_churn` | coverage-lane observation | live (B-080) |

**Already-ratified/held candidates in the pipeline** (carried into this register so the PM sees the whole field): **B-340** per-incident vomit red flag → Home (RATIFIED 2026-07-13 → SC-5); **B-190** weight-loss flag (held → SC-1); **B-183** meal-finished-rate lane (Next → SC-4); **B-187** treat-load observation (→ SC-13); **B-223** subjective appetite (→ SC-18); **B-046** emerging-signals opt-in pull view (the destination for class-(c) rejects); **B-071** soft-delete under-count (→ SC-7).

---

## 3. Feasibility ground truth — our schema and our real data

**Event types (`event_type` enum):** `meal, vomit, diarrhea, stool_normal, lethargy, itch, scratch, skin_reaction, weight_check, medication, other`.
So **activity** has a proxy (`lethargy`), **pruritus/derm** is first-class (`itch`/`scratch`/`skin_reaction`), **stool** is first-class (`diarrhea`/`stool_normal`), **weight** is first-class (`weight_check` + the `weight_checks` child, B-186). **No** event type exists for **water intake, urination/litter-box, nasal/ocular discharge, or structured mobility.**

**Live-data reality check (Supabase MCP, project `aigchluqluzuhtbfllgh`, 2026-07-15):**

| Substrate | Count | Implication for feasibility |
|---|---|---|
| Live meals / rated | **546 / 433** | Meal-based lanes (SC-4) have a **dense** substrate — data-ready today. |
| Events witnessed / discovered / null-confidence | **435 / 14 / 149** | Enough witnessed onsets for timing-gated detectors; the 149 nulls are the legacy-backfill (B-010) that stay timing-ineligible. |
| `event_ai_analysis` completed / owner-edited | **30 / 2** | Phenotype signals off the AI read (bile/consistency/blood — SC-5/6/12) are **thin and AI-derived** (owner-editable, rarely edited). |
| `diet_trials` rows | **0** | Diet-trial adherence/response (SC-8/9) is computable but has **no live data to validate against** — an *adoption* gap, not a feasibility one. |
| `medications` regimens | **2** | Med-response (SC-9) is nearly as thin. |

The blunt read: **meal-intake and weight substrates are ready; the diet-trial/medication substrates are structurally sound but empty; and the highest-value *new* signals (water, urine) have no capture at all.**

---

## 4. The seed vet email as a requirements source

The vet tech asked for, per incident: **frequency + vomit consistency** (liquid/bile/undigested); **latency after eating**; **empty-stomach vs not**; **nasal/ocular discharge**; **indoor/outdoor**; **whether Zyrtec helped**; **whether the Royal Canin Selected Protein elimination diet helped.** Mapped to candidates:

- frequency → ⑦ chronicity (built) + SC-4
- consistency/content → SC-12 (`consistency`/`contents`/`bile_present` exist) + SC-5 (red-flag content)
- latency / empty-stomach → ⑤ (built) + ⑥ (built) + SC-6 (bilious phenotype)
- **"did the diet/med help?"** → **SC-8 (adherence) + SC-9 (response)** — the literal core ask, and the app's wedge payoff
- nasal/ocular discharge → SC-19 (new capture)
- indoor/outdoor → SC-20 (profile context)

The single most important sentence in the email is **"did the intervention the vet started actually change the symptom rate?"** That is the reactive-owner wedge stated by a clinician. It is also the most dangerous thing to answer (§7, Conflict 1).

---

## 5. The Register

Each candidate carries the 10 required fields. Class ∈ {safety, descriptive-associational, engagement-behavioral, capture-unlock}. Verdict ∈ {productize · needs-spec · needs-new-capture · defer · reject}.

### SAFETY class

---

**SC-1 — Weight-loss flag** — *sustained, unexplained weight loss escalates toward a vet; stable/rising never reassures.*
1. Fires when `weight_checks` show a sustained downward trend past a defensible threshold.
2. Source: **B-190** (held); all five vet-council lenses named a weight trend the **single highest-value missing datum** (§5.1.4).
3. Rationale: weight loss is *the* danger signal across the top feline chronic killers — CKD ("gradual, unexplained weight loss even with normal appetite"), hyperthyroidism ("weight loss + increased appetite"), diabetes. A rising line is *not* wellness (fluid/edema).
4. Data: **`weight_checks` exists** (B-186 substrate shipped); real data thin (few readings). No new schema.
5. Class: **safety.**
6. Safety check: **PASS by construction only if held to the template** — must escalate on loss, never reassure on stable/rising, never render a wellness colour/verdict (`024` header). B-190 found the neutral-colour v1 only *partially* discharged the guardrail (down-arrow + "Down X lbs" still carries loss-valence).
7. Feasibility: **deterministic**, but the threshold (how much loss over how long, muscle-mass vs fluid noise) is clinically load-bearing → needs a defensible floor + **mandatory adversarial pass.**
8. Prior art: **B-190, Open (Next)** — held deliberately as its own spec (the `024` template).
9. Verdict: **needs-spec (held).**
10. Priority: **Next.**

---

**SC-2 — Water-intake / polydipsia signal** — *a rise in drinking is the earliest owner-observable sign of the top feline chronic diseases.*
1. Fires when logged water intake (or an owner "drinking more?" confirm) rises past baseline.
2. Source: literature (feline CKD / hyperthyroidism / diabetes); not currently in the pipeline.
3. Rationale: **PU/PD is the earliest observable change in feline CKD** — cases were more likely than controls to have had polydipsia/polyuria in the year *before* diagnosis. Hyperthyroidism and diabetes share the sign. This is the highest-yield *early* signal in the whole register.
4. Data: **no capture exists** — needs a new `water`/hydration event type or a periodic confirm. Owner-friction cost is **high** (you don't witness every drink; a multi-cat/free-water household can't meter a bowl).
5. Class: **safety** (escalate-on-rise; never reassure on "normal" — absence of observed increase ≠ healthy kidneys).
6. Safety check: **PASS if escalate-only.** Hard hazard: a "water intake looks normal" read would be a textbook n=1 reassurance violation — must be structurally impossible.
7. Feasibility: deterministic *if* captured, but capture fidelity is the whole problem (§7, Conflict 2). A low-fidelity weekly "is she drinking more than usual?" confirm may be the only Principle-1-compatible path.
8. Prior art: none (net-new).
9. Verdict: **needs-new-capture.**
10. Priority: **Later** (capture spike first) — but flagged as the **highest-value new-capture idea in the register.**

---

**SC-3 — Urination / litter-box straining & frequency → FLUTD / obstruction** — *straining or repeated unproductive litter-box trips is a same-day emergency in male cats.*
1. Fires on logged straining / increased frequency / blood in urine.
2. Source: literature (FLUTD); the criticalist's "go now" line (vet-council §4).
3. Rationale: **urethral obstruction kills in 24–48h**; "trying and failing to pass urine is an emergency — seen immediately." This is the **highest-consequence** candidate in the register.
4. Data: **no capture exists** — needs a urination/litter event type. Friction **high** (litter-box behaviour is unwitnessed for most owners).
5. Class: **safety** (escalate-on-presence; the ultimate never-reassure — absence of observed straining must never read as "fine").
6. Safety check: **PASS if escalate-only.** The criticalist's guardrail is load-bearing: the "go now" line must key on **observed straining/behaviour**, *never* "no litter event logged."
7. Feasibility: the *signal* is trivial (any straining → escalate); the *capture* is the barrier. A red-flag capture affordance ("straining to pee?") that escalates immediately is more realistic than a frequency trend.
8. Prior art: none.
9. Verdict: **needs-new-capture.**
10. Priority: **Later** — but if any single-tap red-flag capture ships, this is the one whose miss is fatal; treat as a **capture-priority**, not a trend.

---

**SC-4 — Meal-specific finished-rate / refusal lane** — *meals never finished + clustered meal refusals time-locked to symptom clusters (nausea-driven aversion, not pickiness).*
1. Fires on a meals-only decline in finished-rate that detector ② misses.
2. Source: **B-183**; vet-council Finding 5 (behaviorist lens).
3. Rationale: "devours treats / never finishes a meal" is the classic shape of early **nausea-driven food aversion** masquerading as treat-motivated pickiness. Refusal of two complete diets time-locked to vomit clusters is a **disease signal** — invariant 2, do not behavioralize.
4. Data: **`meals.intake_rating` — 433 rated of 546.** Dense and ready **today.** No schema. The fix is scoping to *meals* (excluding treat refusals) so the baseline doesn't self-dilute (the §6.3 problem the Fable brief flagged).
5. Class: **safety** (extension of ②).
6. Safety check: **PASS** — inherits intake-is-not-preference; escalate-on-decline; absence of decline is silence, never all-clear.
7. Feasibility: **deterministic**; the open work is the baseline/threshold on a treat-noisy log → Biostatistician + Dr. Chen before any floor.
8. Prior art: **B-183, Open (Next).**
9. Verdict: **needs-spec (data-ready).**
10. Priority: **Now/Next** — best-data candidate in the register; the substrate is already dense.

---

**SC-5 — Per-incident vomit red flag → Home safety card** — *a photo-visible blood / suspected-foreign-material read on any in-window vomit leads Home.*
1. New safety detector reads non-deleted in-window `event_ai_analysis` and fires a firm-but-calm Home card on a visual red flag.
2. Source: **B-340 (PM-RATIFIED 2026-07-13, elevate).**
3. Rationale: today a per-incident red flag lives only on the event detail screen and never reaches Home — a Principle-3 miss ("safety insights always lead"). n=1 *permits* escalation on presence.
4. Data: `event_ai_analysis` structured fields (`foreign_material_present`, `blood_present`) — **exist but thin (30 reads).** No schema. Must derive from the **owner-editable structured fields**, never the stale `visual_flags` array (so an owner override clears the card by construction).
5. Class: **safety.**
6. Safety check: **PASS** — escalate-on-presence, never reassure (a cleared/absent flag is silence); single-incident fires (false positives are cheap to clear via the existing edit path).
7. Feasibility: **deterministic** over the AI-derived fields; reads a **new source** into `detectSignals` → **adversarial-reviewer MANDATORY**; deploy-gated on the client renderer (the B-182 "registered-but-unrenderable" lesson).
8. Prior art: **B-340, Open (Next), ratified & ready to spec.**
9. Verdict: **productize** (already ratified).
10. Priority: **Next.**

---

**SC-6 — Bilious / empty-stomach vomit phenotype** — *"N of M vomits were bile/empty-stomach, mostly overnight" — a distinct process from meal-adjacent vomiting.*
1. Descriptive phenotype split surfaced alongside ⑤/⑥.
2. Source: vet-council Finding 1a (GI internist — phenotype decomposition; bile-timing ≠ overnight-timing → ≥2 processes).
3. Rationale: separating bilious/empty-stomach episodes from post-prandial ones changes the differential (bilious reflux/motility vs food-response). The internist explicitly warned they **do not cleanly co-map** — don't collapse them into one signal.
4. Data: `event_ai_analysis.bile_present` + `consistency` + episode timing — **AI-derived and thin (30 reads);** owner-editable.
5. Class: **descriptive-associational** (extension of ⑥ + the AI read).
6. Safety check: **PASS if timing/count only** — name the pattern, never the mechanism ("reflux" is the vet's word); never reassure on the meal-adjacent subset.
7. Feasibility: deterministic over the fields, but gated on AI-read volume + the ⑤/⑥ suppression interaction; a defensible floor is hard at n=30.
8. Prior art: none (net-new; adjacent to ⑤/⑥).
9. Verdict: **needs-spec** (thin-data; hold until AI-read volume grows).
10. Priority: **Later.**

---

**SC-7 — "This view may under-count" data-honesty signal** — *when live symptom rows are a small curated subset of what was logged-then-deleted, tell the owner the picture may under-count.*
1. A meta-signal on the log itself, not on the pet.
2. Source: **B-071** reframed by vet-council Conflict B / Finding 4.
3. Rationale: on the dogfood pet, **43 deleted vs 21 live vomits** and *all* diarrhea/lethargy rows deleted → the live picture is biased toward **under**-calling, and the deletions remove exactly the co-signs (diarrhea, lethargy) that would upgrade concern.
4. Data: soft-delete ratio is computable today (`deleted_at`). No schema.
5. Class: **safety-adjacent** (it can only ever *raise* concern — the structural opposite of reassurance).
6. Safety check: **PASS** on the invariant, but see §7 Conflict 3 — the *product* risk is trust/accusation, not reassurance.
7. Feasibility: deterministic; the hard part is copy that informs without accusing ("why did you delete these?").
8. Prior art: **B-071, Open (Next)** — the input-contract test is still owed regardless.
9. Verdict: **needs-spec (PM call on whether the product ever surfaces this at all).**
10. Priority: **Later.**

### DESCRIPTIVE-ASSOCIATIONAL class

---

**SC-8 — Diet-trial adherence / off-protocol exposure** — *"since the trial started, N off-diet foods were logged — each one can confound the result."*
1. During an active `diet_trial`, count logged foods that aren't the trial diet and surface a gentle adherence observation.
2. Source: elimination-diet literature + the vet email (Royal Canin Selected Protein) + our wedge.
3. Rationale: **strict adherence is the #1 failure mode of an elimination trial** — "no treats, no table scraps, no flavored meds… 100% strict for the full 8 weeks." Contaminants "cause a flare and lead to confusion about what the pet is allergic to." This is the single most wedge-aligned, owner-actionable, *safe* candidate — it helps the owner run the trial the vet prescribed correctly.
4. Data: `diet_trials` (started_at, food_item_id) + `meals` + `food_items`. **Computable with no schema** — but **0 live diet_trials**, so it's blocked on *adoption*, not feasibility.
5. Class: **descriptive-associational / behavioral.**
6. Safety check: **PASS** — it counts observed off-protocol foods; it makes **no clinical verdict** and cannot reassure (it only ever flags contamination). Distinct from SC-9 (which judges whether the trial *worked*).
7. Feasibility: **deterministic**; trivial once a trial exists.
8. Prior art: none as a signal (the `diet_trials` substrate exists; the adherence surface does not).
9. Verdict: **needs-spec.**
10. Priority: **Next** (gated on diet-trial adoption; pair with SC-22 progress).

---

**SC-9 — Diet / medication intervention-response** — *"did the diet/med the vet started actually change the symptom rate?"*
1. Compares symptom rate in a window before vs after an intervention `started_at`.
2. Source: **the vet email's core ask** ("did Zyrtec help? did the elimination diet help?"); the reactive-owner wedge.
3. Rationale: this is the payoff of the entire product — the reason a reactive owner logs at all. Clinically it is what the vet most wants back.
4. Data: `diet_trials` / `medications` (started_at) + symptom events. Computable — but **0 trials / 2 regimens live**, and the confound is severe (the nutritionist's **chicken-in-67%** "washout is baked in", free-feeding B-040).
5. Class: **descriptive-associational** (before/after rate).
6. Safety check: **CONDITIONAL — this is the register's biggest reassurance hazard (§7, Conflict 1).** An "it's working / she's improving" read on n=1 with a baked-in confound is exactly the council's named failure ("swap the treats and feel fixed"). Safe form = **observe-or-escalate only**: name the rate change with counts, escalate if worse, and **never** emit "resolved"/"cured"/"working" or any framing that could delay a vet visit.
7. Feasibility: deterministic arithmetic; the *legitimacy* is the problem (confound, low-n, the improving-tail-of-a-chronic-course trap ⑦ already guards for symptoms). Needs the ⑦-style never-reassure coupling.
8. Prior art: none as a Home signal (the vet report renders adherence/interventions; this is the owner-facing rate-change read).
9. Verdict: **needs-spec (high-risk; PM decision on whether an improvement direction is ever surfaced).**
10. Priority: **Next/Later** — stage it **after** SC-8: ship the safe adherence signal first, then the load-bearing response read.

---

**SC-10 — Pruritus severity trend (owner-assessed VAS)** — *a validated 0–10 itch score trended over an intervention, paralleling the weight trend.*
1. Owner rates itch severity on a validated scale; trend renders like the weight card.
2. Source: literature (pVAS / VNS for dogs; VAScat for cats — the only validated owner instruments in derm) + skin-allergy morbidity (Nationwide's #1 dog claim for 15 straight years).
3. Rationale: pruritus is the top dog insurance claim and a core elimination-trial outcome; a **validated** owner VAS is repeatable (two owners R≈0.8) and tracks antipruritic response — a real, non-invented instrument.
4. Data: **`itch`/`scratch`/`skin_reaction` event types already exist**, and events already carry a `severity smallint`. The gap is adopting the *validated* scale + a trend surface — a **small extension**, not new capture. (Note the tension with **B-232**, which proposes retiring the *generic* severity picker — a validated *pruritus-specific* VAS is a different instrument and the counter-argument to blanket retirement.)
5. Class: **descriptive-associational** (trend), with an SC-9-style response overlay.
6. Safety check: **PASS as a neutral trend** (same discipline as weight: never a "clearing up" verdict); a *rising* itch score may escalate.
7. Feasibility: deterministic; mostly capture-ready.
8. Prior art: partial — `severity` exists but unused/under-review (B-232); pairs with B-223 (subjective rating).
9. Verdict: **needs-spec.**
10. Priority: **Later** (strong dog-wedge candidate; reconcile with B-232 first).

---

**SC-11 — Stool consistency / frequency pattern** — *descriptive pattern over stool events (chronic-diarrhea run, consistency shift).*
1. Surfaces a stool-consistency/frequency pattern the way ⑦ handles chronicity.
2. Source: literature (chronic GI is the top feline insurance claim — "intestinal upset"); vet-council (all diarrhea rows were deleted → absent-by-deletion).
3. Rationale: chronic diarrhea is a core chronic-enteropathy signal; ⑦ already runs on `diarrhea`, but a *consistency* dimension (Bristol/fecal-score style) would sharpen it.
4. Data: `diarrhea`/`stool_normal` event types exist, but there is **no consistency sub-field** — blocked by the open **stool-schema-consolidation** question (`event_type='stool'` + `stool_consistency`).
5. Class: **descriptive-associational** (extends ⑦'s reach into stool detail).
6. Safety check: PASS if count/consistency only; never reassure on a formed-stool day.
7. Feasibility: deterministic once the stool schema consolidates.
8. Prior art: the stool-schema consolidation is a live Open Question (CLAUDE.md); ⑦ already covers stool *chronicity*.
9. Verdict: **needs-spec (schema-gated).**
10. Priority: **Later.**

---

**SC-12 — Vomit consistency / content distribution** — *"most logged vomits were watery/foamy/bile" — a descriptive content summary.*
1. Descriptive distribution over `vomit_consistency` + `contents`.
2. Source: the vet email (liquid/bile/undigested).
3. Rationale: content pattern shapes the differential; the vet explicitly asked for it.
4. Data: `event_ai_analysis.consistency` (enum: watery/foamy/mucoid_slimy/soft_formed/chunky/unsure) + `contents` array + `bile_present` — exists but **thin (30 reads), AI-derived.**
5. Class: **descriptive-associational.**
6. Safety check: PASS as a count summary; never reassure.
7. Feasibility: deterministic; better suited to the **vet report** than a Home card (it's reference detail, not an escalation).
8. Prior art: overlaps SC-5 (red-flag content) + the vet-report content rendering.
9. Verdict: **defer to vet report** (not a Home card).
10. Priority: **Later.**

---

**SC-13 — Treat-load / over-treating observation** — *"treats are most of what you log — that makes patterns harder to read."*
1. Gentle, non-judgmental treat-share observation.
2. Source: **B-187**; nutritionist lens (Nyx: **86% treats** vs ≤10%-of-calories norm).
3. Rationale: treat-share is computable + owner-actionable + diagnostically clarifying (simplify the diet before a trial); routes toward care without diagnosing.
4. Data: `meals` + `food_items.food_type`. Ready.
5. Class: **descriptive-associational** (distinct from B-080 *structure*; this is *load*).
6. Safety check: PASS; nyx-voice ship-gate (observation, never judgment — must not shame the owner).
7. Feasibility: deterministic.
8. Prior art: **B-187, Open (Later).**
9. Verdict: **needs-spec.**
10. Priority: **Later.**

---

**SC-14 — "Too varied to assess" coverage diagnostic** — *explain the silence when a well-logged but highly-varied diet defeats correlation.*
1. A coverage-lane diagnostic for the varied-diet case.
2. Source: Fable rerun §6.2 / open Q#3; a B-053 extension.
3. Rationale: both existing coverage diagnostics target *degenerate* logs; a varied, treat-heavy, well-logged diet produces **silence with no explanation** — "your diet is too varied for any single food to be assessable" is true, computable, and non-reassuring, but the layer can't currently say it.
4. Data: protein/food distribution — ready.
5. Class: **coverage diagnostic** (extension of the existing lane).
6. Safety check: PASS (it explains absence of a signal without implying wellness).
7. Feasibility: deterministic.
8. Prior art: rerun open Q#3 (still Open); natural B-053 extension.
9. Verdict: **needs-spec.**
10. Priority: **Later.**

---

**SC-15 — Activity / mobility decline (canine OA)** — *owner-reported mobility change screens for undiagnosed osteoarthritis.*
1. Structured mobility change (reluctance on stairs/jumps, stiffness) trended.
2. Source: literature (validated owner instruments: LOAD, HCPI, COAST, GenPup-M, CBPI).
3. Rationale: OA is under-diagnosed because owners mistake early signs for aging; an owner checklist reached **~88% sensitivity / 71% specificity** and found more cases than prevalence estimates. Big for the dog wedge.
4. Data: `lethargy` is a weak proxy; a real signal needs **structured mobility capture** (new).
5. Class: **descriptive-associational** (screen → "worth mentioning"), never a diagnosis.
6. Safety check: PASS if escalate/observe only.
7. Feasibility: needs new capture; a validated instrument exists to copy.
8. Prior art: none.
9. Verdict: **needs-new-capture.**
10. Priority: **Later** (dog wedge is secondary to Nyx's reactive-GI/diet-trial wedge).

---

**SC-16 — Grooming / coat change** — *over-grooming (barbering) or under-grooming as a derm/pain/illness signal.*
1. Owner-logged grooming change.
2. Source: literature (feline over-grooming → derm/stress/pain; under-grooming → illness/obesity/pain).
3. Rationale: grooming change is a recognized feline behavioral-health marker.
4. Data: no capture (adjacent to `skin_reaction`/`itch`).
5. Class: descriptive-associational.
6. Safety check: PASS if observe/escalate only.
7. Feasibility: needs new capture.
8. Prior art: none.
9. Verdict: **needs-new-capture.**
10. Priority: **Later** (low, relative to SC-2/SC-3).

### CAPTURE-UNLOCK (a field that unlocks signals, not a signal itself)

---

**SC-17 — Vomiting-vs-regurgitation "was there an active retch?" field** — *a one-tap quick-log affordance that separates two different clinical processes.*
- Source: vet-council §9.7 (behaviorist + GI internist). Rationale: **vomiting vs regurgitation changes the differential and the workup** — the panel flagged the missing "active retch" field. Data: **new, cheap** (one quick-log toggle; Principle-1 compatible as a single optional tap). Class: capture-unlock. Safety: neutral capture. Verdict: **needs-new-capture (cheapest high-value capture in the register).** Priority: **Next** — it's a small affordance that unlocks SC-6 and materially raises vet-report value.

---

**SC-18 — Subjective appetite rating (dual intake)** — *pair the objective intake question with an owner-perceived appetite rating.*
- Source: **B-223.** Rationale: gives the free-fed/grazer case a real appetite signal where objective intake can't see the bowl. Data: new field. Class: capture-unlock. **Safety (load-bearing): the subjective rating must NEVER reassure over or override an objective decline** — it may add texture or escalate, never soften. Prior art: **B-223, Open (Later).** Verdict: **needs-new-capture.** Priority: **Later.**

---

**SC-19 — Nasal / ocular discharge capture** — *URI/allergy sign the vet asked for.*
- Source: the vet email. Data: new (maps to `other` today). Class: capture-unlock. Verdict: **needs-new-capture.** Priority: **Later.**

---

**SC-20 — Indoor/outdoor + risk context** — *a static profile attribute that changes prior probability (FeLV/parasite/trauma).*
- Source: the vet email. Data: pet-profile attribute, not an event. Class: context, **not a signal.** Verdict: **defer** (profile field; informs risk, doesn't fire a card). Priority: **Later.**

### ENGAGEMENT-BEHAVIORAL class (never a clinical verdict)

> Per the brief's rule: positive signals are engagement/descriptive only. These may celebrate a *logging habit*; they must never read as a *wellness verdict* (invariant 1). Kept off the safety band; candidates for the Today/reflection surface, not the Signal safety lane.

---

**SC-21 — Logging streak / consistency nudge** — "you've logged every day this week." Engagement only; explicitly **not** "she's doing well." Verdict: **defer** (engagement; Later; guard hard against wellness-drift).

**SC-22 — Diet-trial progress ("day 12 of 56")** — a neutral progress meter for an active trial; pairs with SC-8. Engagement/behavioral; supports adherence without judging outcome. Verdict: **needs-spec.** Priority: **Next** (rides SC-8).

---

## 6. Synthetic and external data — how they were (and weren't) used

- **Synthetic data — validation only.** Synthetic logs contain only the patterns programmed into them, so they are a **specificity/noise-gate tool**, never a discovery method. This is exactly how the existing lanes were hardened: ⑤'s grazing guard and ⑥'s floors were *calibrated on property tests* (⑥ fired ~21.6% on uniform-random onsets at the original floors → raised to 5/0.6 → ~3.6%). Any new safety lane (SC-1/4) must clear the same noise-gate before a floor locks.
- **External datasets — real but mostly out of reach for productization.** The **Dog Aging Project** is genuinely open (de-identified curated release via Terra/Broad; CBC/chem/urinalysis/microbiome on tens of thousands of dogs) but is **research-access, dog-only, and cohort-survey shaped** — useful for *validating a threshold or prior*, not for a live product feature. **Nationwide's 3.3M-claim morbidity report** confirms our target conditions (skin allergies #1 for dogs 15 years running; digestive upset the top cat claim 3 years running; chronic conditions dominate both top-10s) — it prioritizes candidates (SC-10 derm, SC-11/⑦ GI) but is aggregate. Net: external data **ranks and calibrates** candidates; it does not supply a feature.

---

## 7. Genuine persona conflicts (Persona Conflict Protocol — surfaced, not resolved)

**Conflict 1 — SC-9, the intervention-"it's working" read.**
> **Data Scientist / Dr. Chen:** an improvement read on n=1 with a baked-in chicken confound (67%) is precisely the council's named failure mode — "swap the treats and feel fixed." Absence of symptoms during a trial ≠ the trial working. An "improving" verdict is a false-reassurance and could delay a workup.
> **Designer / Jordan:** answering "is it working?" is the *entire reason* the reactive owner logs. If the app structurally refuses to ever say, it fails at its one job at the exact moment of highest intent.
> **Trust & Safety:** a wrong "working" verdict that delays a vet visit is the most consequential error the product can make.
> **PM decision needed:** does SC-9 ever surface an *improvement* direction, or is it strictly observe-or-escalate (name the rate change + counts, escalate if worse, never "resolved/working")?

**Conflict 2 — SC-2 / SC-3, water & litter capture vs friction.**
> **Data Scientist / Dr. Chen:** PU/PD and litter-box straining are the highest-yield early signs of the top feline killers, and obstruction is a <48h emergency. Not capturing them is a real clinical blind spot.
> **Sam / Jordan / Designer:** water and litter events are near-impossible to capture at moment-of-event without heavy friction (you don't witness every drink; you don't watch the box). A per-event capture violates Principle 1 and the 10-second test.
> **PM decision needed:** is a *low-fidelity periodic* capture (weekly "drinking/peeing more than usual?" confirm) acceptable as the Principle-1-compatible form, or does the friction kill it — and does a single-tap *red-flag* capture (straining) ship even if a trend never does?

**Conflict 3 — SC-7, the soft-delete under-count product signal.**
> **Skeptical GP / Data Scientist:** the live log is an owner-curated subset biased toward under-calling; hiding that lets a dangerously-partial picture read as complete. The product should say "this view may under-count."
> **Designer / Trust & Safety:** telling owners "your own data may be wrong/incomplete" undermines trust and can read as accusatory or surveilling ("why did you delete those?"). The invariant is satisfied either way (it can only raise concern) — the risk is relational, not clinical.
> **PM decision needed:** does the product ever surface a data-completeness caveat to the owner, and if so in what register? (The B-071 input-contract *test* is owed regardless of this call.)

---

## 8. The 3–5 to productize first — and why

Ranked for a first wave, weighing wedge-fit × data-readiness × safety-cleanliness:

1. **SC-4 — Meal-finished-rate / refusal lane (B-183).** Best data in the register (433 rated meals), fixes a *known* ② miss the council flagged, safe by inheritance. Data-ready now; the only open work is the baseline/floor. **Highest readiness.**
2. **SC-5 — Per-incident vomit red flag → Home (B-340).** Already PM-ratified, scoped, and safe (escalate-on-presence, owner-clearable). Just needs the spec + mandatory adversarial + client renderer. **Highest certainty.**
3. **SC-8 — Diet-trial adherence / off-protocol exposure.** The most wedge-aligned *and* safe candidate — it helps the owner run the vet's trial correctly without any clinical verdict. No schema. Its only gate is diet-trial *adoption* (0 live), which is itself worth solving. **Highest wedge-fit.**
4. **SC-1 — Weight-loss flag (B-190).** The single highest-value missing vital sign per all five vet-council lenses; the substrate is shipped. Held for its own spec + mandatory adversarial (the load-bearing-signal template). **Highest clinical value among ready substrates.**
5. **SC-17 — "active retch?" capture field.** The cheapest high-value capture — one optional tap that unlocks the phenotype split (SC-6) and materially raises vet-report value. **Best effort-to-value.**

Deliberately *not* first-wave: **SC-9** (the response read) is the most important eventual capability but the riskiest — stage it *after* SC-8 so the safe adherence surface ships before the load-bearing "did it work" read. **SC-2/SC-3** (water/litter) are the highest-value *new capture* but gated on the Conflict-2 friction decision.

---

## 9. Open questions only the PM can decide

1. **SC-9 improvement direction** (Conflict 1) — does intervention-response ever say "improving," or observe/escalate-only?
2. **SC-2/SC-3 capture form** (Conflict 2) — periodic low-fidelity confirm vs no capture; does a straining red-flag tap ship independently?
3. **SC-7 surfacing** (Conflict 3) — does the product ever tell an owner "this view may under-count"?
4. **SC-9/SC-8 sequencing** — confirm adherence-before-response staging.
5. **SC-10 vs B-232** — a validated pruritus VAS is the counter-argument to retiring generic `events.severity`; reconcile before either ships.
6. **The gestalt-reviewer LLM-over-findings layer** (existing Open Question, not a new candidate here) — the panel's lean is that any LLM layer may only *escalate / re-rank / veto* computed findings, **never reassure, never attribute cause**; several candidates above (SC-9 especially) would be its natural first consumers. Flagging the dependency, not re-opening the question.
7. **Adoption, not just detection** — SC-8/SC-9's blocker is that owners aren't creating `diet_trials` (0 live) and barely logging regimens (2). A detector with no substrate can't validate; solving diet-trial/med *adoption* may unblock more value than any single new lane.

## Proposed backlog rows (NOT created — staged for PM ratification)

Per the brief, no tickets are created here. If ratified, these are the rows I'd write:

| Proposed | Title | Class | Verdict | Priority |
|---|---|---|---|---|
| new | Diet-trial adherence / off-protocol exposure signal (SC-8) | descriptive | needs-spec | Next |
| new | Intervention-response (diet/med) rate-change signal (SC-9) | descriptive | needs-spec (high-risk) | Next/Later |
| new | Water-intake / polydipsia capture + signal (SC-2) | safety | needs-new-capture | Later (capture spike) |
| new | Urination/litter straining red-flag capture (SC-3) | safety | needs-new-capture | Later (capture-priority) |
| new | "Active retch?" vomit-vs-regurgitation field (SC-17) | capture-unlock | needs-new-capture | Next |
| new | Pruritus severity VAS trend (SC-10) — reconcile with B-232 | descriptive | needs-spec | Later |
| new | "Too varied to assess" coverage diagnostic (SC-14) | coverage | needs-spec | Later |
| new | Bilious/empty-stomach vomit phenotype (SC-6) | descriptive | needs-spec (thin data) | Later |
| existing | B-183 meal-finished-rate lane (SC-4) — reaffirm Now/Next priority | safety | needs-spec (data-ready) | Now/Next |
| existing | B-190 weight-loss flag (SC-1), B-340 red flag (SC-5), B-187 treat-load (SC-13), B-223 appetite (SC-18) — already tracked | — | — | — |

---

## Sources

- Nationwide 2025 claims analysis (3.3M claims): [chronic conditions dominate](https://news.nationwide.com/chronic-conditions-dominate-this-years-list-of-most-common-pet-health-problems/) · [Veterinary Practice News summary](https://www.veterinarypracticenews.com/top-pet-insurance-claims/)
- Feline hyperthyroidism: [Cornell Feline Health Center](https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/hyperthyroidism-cats) · [Virginia Tech](https://vth.vetmed.vt.edu/animal-care-tips/cat-hyperthyroidism.html)
- Feline CKD early signs (PU/PD, weight loss): [Today's Veterinary Practice](https://todaysveterinarypractice.com/urology-renal-medicine/feline-chronic-kidney-disease/) · [feline CKD screening (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC10816690/) · [CKD risk-factor case-control (PMC)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC2946592/)
- FLUTD / urethral obstruction emergency: [AVMA](https://www.avma.org/resources-tools/pet-owners/petcare/feline-lower-urinary-tract-disease) · [Cornell](https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center/health-information/feline-health-topics/feline-lower-urinary-tract-disease) · [2025 iCatCare consensus (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11816079/)
- Canine OA owner-screening / metrology: [owner-reported questionnaire (JSAP/PMC)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9543207/) · [GenPup-M (PMC)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10752556/)
- Elimination diet trials (8-wk strictness, response monitoring): [Today's Veterinary Practice](https://todaysveterinarypractice.com/dermatology/elimination-diet-trials-steps-for-success-and-common-mistakes/) · [Tufts Petfoodology](https://sites.tufts.edu/petfoodology/2022/04/04/think-your-pet-has-a-food-allergy-eliminating-mistakes-in-elimination-diet-trials/) · [Purina Institute](https://www.purinainstitute.com/centresquare/therapeutic-nutrition/diet-elimination-trials)
- Pruritus owner-VAS validation: [0–10 VNS validation (Vet Dermatology)](https://onlinelibrary.wiley.com/doi/10.1111/vde.13062) · [pVAS owner perception (Vet Dermatology)](https://onlinelibrary.wiley.com/doi/10.1111/vde.12761)
- Dog Aging Project open data: [data access](https://dogagingproject.org/data-access) · [precision cohort rationale (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12397037/)

_Internal sources: `docs/research/2026-06-vet-council-nyx-deep-dive.md`, `docs/research/2026-06-fable-signal-engine-rerun.md`, `docs/nyx-descriptive-signals-requirements.md`, `docs/nyx-chronicity-signal-requirements.md`, `supabase/functions/generate-signal/detection.ts`, `supabase/migrations/024_weight_checks.sql`, `docs/backlog.md`, live DB (project `aigchluqluzuhtbfllgh`, 2026-07-15)._
