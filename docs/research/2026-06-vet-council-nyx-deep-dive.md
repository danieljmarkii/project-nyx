# The Veterinary Council vs. the Single-Model Read — A Specialist-Panel Deep-Dive on Nyx

**Date:** 2026-06-25
**Prepared for:** Nyx product team
**Lenses (independent, isolated reads):** GI Internist (DACVIM, feline focus) · Veterinary Nutritionist (DACVN) · Emergency/Criticalist (DACVECC) · Veterinary Behaviorist (DACVB) · Skeptical GP. Chaired/reconciled by the always-on GP (Dr. Alex Chen) lens.
**Scope:** A third dogfood deep-dive on the same pet's data, but with a **new method**: instead of turning *one* frontier model loose on the whole log (the [Opus 4.8](./2026-06-opus-signal-engine-poc.md) and [Fable 5](./2026-06-fable-signal-engine-rerun.md) PoCs), convene the **specialist veterinary panel** (`docs/vet-report-discovery.md` §3 / `docs/vet-specialist-panel.md`) — five board-certified lenses reading the *same computed evidence pack* cold and independently, each running its own falsification pass, then reconciled by a chair. A methodology capture, not a model bake-off. **Not a product decision** — the product questions it sharpens are routed to Open Questions (§9), per the research-folder contract.

> **Data note.** Same boundary as the prior two briefs: this analyses the PM's own cat ("Nyx", `pets.id = bf7b196e-6db1-4a34-af34-f1759d380042`) in the PM's own database, at the PM's explicit request, captured into the PM's private repo. The §4 reads are identifiable pet-health narrative and live only in this repo. See §8 — the method does not transfer to other users' data unchanged.

---

## 1. Trigger

The PM asked to re-run the dogfood deep-dive, but explicitly with a **novel approach**: rather than a single model's gestalt, *convene the veterinary council* over Nyx's data — the formalized specialist panel — and see whether multiple differentiated expert lenses surface more, or more reliably, than one model did. The standing product goal behind it: keep harvesting insights worth productizing (the way the [Fable brief's](./2026-06-fable-signal-engine-rerun.md) post-prandial-timing and time-of-day findings became live detectors ⑤/⑥), and pressure-test the PM's longer-range "AI Signals card" idea and the "how much data is enough to surface an insight" threshold question.

## 2. Method — the panel, and how it differs from the single-model PoCs

**The prior two briefs:** one frontier model (Opus 4.8, then Fable 5) received the whole structured log and produced a single gestalt read, head-to-head against the deterministic `detection.ts` engine. The recurring finding was that the model is *holistic-but-undisciplined* and the engine *rigorous-but-myopic* — blind in opposite directions.

**This brief:** the same data, but five **independent board-certified specialist lenses** (GI internist, nutritionist, criticalist, behaviorist, skeptical GP), each:
- given the *same* computed evidence pack (counts, the full vomit timeline with per-incident photo reads, diet/intake aggregates, temporal patterns, denominator checks — **not** a raw log dump; data-minimized by construction);
- run in an **isolated context** (no sight of this conversation, the engine's optimism, or each other's reads — isolation is the point, as with the `adversarial-reviewer`);
- inheriting Nyx's two safety invariants verbatim (n=1/absence never reassures; intake is not preference);
- required to separate *what the data shows* from *what it cannot rule out*, to run a **falsification attempt on their own leading hypothesis**, and to name their blind spots;
- then **reconciled by a chair** (this brief) into consensus + surfaced disagreement.

Model was held constant across the five (all Opus 4.8) so the **only variable is specialty**, the inverse of the prior briefs (which varied the model and held the lens singular). All reads filtered `deleted_at IS NULL` and `pet_id`; times converted to the owner's local zone (America/Chicago).

**Methodology finding (recorded up front):** the panel *did* surface things the single-model reads did not — see §6. Specialty diversity, not raw model capability, produced the new substance (a phenotype decomposition, a vomiting-vs-regurgitation distinction, a diet-base contradiction, and a built-in adversary). This mirrors §6.6 of the Fable brief: capability and grounding are the levers, and here **structured disagreement was a lever the single model structurally could not pull.**

## 3. Dataset snapshot (live rows, 2026-06-25)

- **Subject:** "Nyx" — ♀ American Shorthair, **2.8 yr** (young adult), **4.4 kg**. No recorded conditions, no diet trial, **no medications**, **zero weight-check events**, no vet visits on file.
- **Symptom picture — vomiting only.** **21 live vomit rows → ~20 episodes** (3 h collapse) over **42 days (05-14 → 06-25)** = **~1 episode/2.1 days; ongoing (most recent today).** Weekly episodes oscillate 1–4; the lone "1" week (06-01) is the only calm stretch. Worst run: 4 consecutive days (06-08→11). Zero live diarrhea/stool/lethargy/itch (all such rows **soft-deleted**).
- **Soft-delete ratio:** **43 soft-deleted vomits vs 21 live** (plus deleted diarrhea/itch/lethargy). The "more-deleted-than-live" pet (B-071) — and §6.4 makes this clinically load-bearing, not just a test-fixture concern.
- **Phenotype (19/21 with photo reads):** predominantly food (partially-digested 14, undigested 6), **bile 4 (all yellow)**, foam 1; chunky 13; **no visible blood/melena**; **1 foreign-material flag** (05-18, blue toy-ball, `worth_a_call`); 2 `worth_a_call` total, 13 `monitor`.
- **Timing (local):** **14/21 (67%) midnight–8am; 12/21 (57%) in 3–7am.** Secondary daytime scatter.
- **Diet:** **336 logged feedings — 46 meals (14%) vs 289 treats (86%).** Chicken in **225/336 (67%)** → no dietary contrast. **Temptations = 96 feedings**; crunchy carb treats (Temptations/Greenies/Party Mix) dominate; 6 human-food feedings. **On top of a continuous free-choice Royal Canin *Weight* kibble (since 05-16, individual feedings unlogged)** + a transient Blue Buffalo duck bowl (06-09→10, inside the worst vomit run).
- **Intake:** treats eaten "all" 87% of the time; **meals never once eaten "all"** (picked/some), with two refusal clusters (05-23→30 incl. Fancy Feast + Hill's Science Diet **meal** refusals; 06-09→14) overlapping vomit clusters.
- **Post-prandial:** rapid cluster (vomit ≤15 min after feeding) = 4 episodes (05-19 2 m, 05-25 1 m, 06-09 14 m, 06-10 3 m), 3/4 Temptations, 4/4 crunchy; one explicitly intra-prandial (06-20). **Denominator:** Temptations 3/96 (3.1%) · other crunchy 2/191 (1.0%) · soft 0/49 (0%) — suggestive, low-n, not significant.
- **Live engine (`ai_signals`, generated 2026-06-25 13:38):** two cards — ④ `symptom_worsening` ("3 this week, up from 2 — worth a word with your vet") and ⑥ `timeofday_clustering` ("6 of 10 timed episodes between 3am and 7am"). **Both detectors are new since the Fable brief** (they close the "worsening valve" and surface the timing pattern that brief identified). Engine remains silent on chronicity, diet, the bilious phenotype, the foreign-body flag, and the rapid-after-treat pattern.

## 4. The five independent reads (condensed; each ran its own falsification)

- **GI Internist (DACVIM):** *Chronic intermittent vomiting in a young cat, ~1/2 days, 6+ weeks, unresolved — never normal until a workup says so.* Ranks **chronic enteropathy (food-responsive/IBD-spectrum)** top, with a bilious/motility component and treat-bolt regurgitation layered on; keeps small-cell GI lymphoma on the list on principle (age-atypical). **Sharpest catch: the bile-content episodes and the overnight-timing cluster do not cleanly co-map → likely several overlapping processes, not one.** The 05-18 foreign-body/pica flag is a separate, highest-consequence rule-out. Falsification: "just treat-bolting" *fails* — 67% are overnight/empty-stomach, the opposite of bolt physiology, and the rapid cluster is only 4/20 episodes.
- **Veterinary Nutritionist (DACVN):** *An over-treated, under-structured, uninterpretable diet — a weight-management base (Royal Canin Weight) actively undermined by ad-lib treating.* Treats are ~86% of logged feedings against a ≤10%-of-calories norm; chicken-ubiquity **pre-confounds any future elimination read** (the washout is baked in). "Just treats" *fails* falsification against the bile, the 3–7am circadian signal, and the chronicity. Load-bearing contribution: **simplify/structure the diet first — both safe and diagnostically clarifying** — but never *instead* of a workup.
- **Emergency/Criticalist (DACVECC):** *Not an emergency today, but past "monitor" → "be seen this week."* Ranks **partial/linear foreign body** as the can't-miss (the 05-18 ball + pica + intermittent vomiting). The two things the log structurally cannot see — **true intake** (free-fed) and a **weight trend** (on a *weight-managed* cat) — are exactly what would separate benign from dangerous; the overweight baseline makes the feline anorexia → hepatic-lipidosis window *short* if she ever truly stops eating. Defines the owner-facing "go now" line by **observed not-eating + behavior change**, never "no meal logged."
- **Veterinary Behaviorist (DACVB):** *The headline is not the grazing — it's the devours-treats / never-finishes-a-meal asymmetry, which is the classic shape of early nausea-driven food aversion masquerading as treat-motivated pickiness.* Applies rule #2 hard: refusal of two complete diets, time-locked to vomit clusters, is a disease signal — **do not behavioralize it.** Names real management contributors (over-treating, an owner-conditioned overnight feeding/vomiting loop, gulping) but ranks them *below* the disease signal. Flags the unresolved **vomiting-vs-regurgitation** question (no "active retch" field in the log).
- **Skeptical GP (trust attack / Occam):** *The simplest story — over-treated cat who eats too fast — is largely defensible but breaks on three facts it can't explain: 6-week chronicity, empty-stomach bile, genuine meal refusals.* Discounts the 3–7am clock (find-time/confidence-tier bias) and the Temptations link (3/96 vs 0/49 = noise-tier) harder than the others. **Standout contribution: the 43-deleted-vs-21-live ratio means the live log is an owner-curated subset biased toward *under*-calling** — his #1 question to the owner is *"why were ~43 vomits (and the diarrhea/lethargy rows) deleted?"*

## 5. Reconciliation

### 5.1 Consensus (independently reached by all five)
1. **The benign "just an over-treated cat who eats too fast" story does not survive** — broken by (a) 6-week unresolved chronicity, (b) the bilious empty-stomach minority, (c) genuine refusals of two complete diets time-locked to vomit clusters.
2. **Reconciled gestalt: ≥2 overlapping processes** — a chronic-enteropathy baseline + a bilious/motility overnight component + occasional treat-bolt regurgitation. Not one tidy diagnosis.
3. **The strongest true signal — chronicity/duration — is the one the engine never states.** It surfaces a week-over-week bump and a timing pattern (the *weaker* signals) but never "six weeks, ongoing, not resolving."
4. **Weight is the highest-value missing datum** (zero weight checks on a weight-managed cat); fecal, bloodwork (CBC/chem/T4/UA), and an exam ± imaging are the minimum workup.
5. **The 05-18 foreign-body/pica flag is being dropped on the floor** — surfaced once by the per-incident read, never re-surfaced; lowest-probability, highest-consequence.
6. **Intake is genuinely unobserved** (free-fed kibble) — cuts both ways, reassures in neither.
7. **Product-safety consensus:** safe to surface = chronicity + timing + the un-retired FB flag, count-anchored, "mention to your vet"; unsafe = any causal phrasing of the treat link, and — above all — letting a quiet week / "monitor" read / absence-of-blood ever read as reassurance.

### 5.2 Genuine disagreements (surfaced, not resolved — Persona Conflict Protocol)
- **Conflict A — trust in the 3–7am timing.** Internist/Criticalist/Behaviorist read it as *partly real physiology* (empty-stomach bilious reflux); the Skeptic reads it as *partly an artifact* (found-vomit timestamps over-load overnight hours). Both hold — it is over-determined. *Implication:* the live timing card surfaces a real-but-confounded pattern; a calibration caveat is warranted, not a teardown. **→ PM/Data-Science call.**
- **Conflict B — what the soft-delete ratio means.** The Skeptic treats 43-deleted-vs-21-live as a first-order finding (the picture is biased toward under-calling; the true frequency is plausibly higher). The other lenses largely read the live 21 at face value. *Implication:* this reframes B-071 from an input-contract/test concern into a **clinically load-bearing** one. **→ PM call** on whether to surface it and how (see §9).

## 6. Findings

1. **Specialty diversity surfaced what a single gestalt missed.** Net-new over the Opus/Fable reads: (a) the **phenotype decomposition** (bile-timing ≠ overnight-timing → ≥2 processes); (b) the **vomiting-vs-regurgitation** distinction and the missing "active retch" capture field; (c) the **weight-management-base contradiction** (the free-choice Royal Canin Weight kibble reframes "treat-dominated diet" and makes "intake not observed" load-bearing); (d) a **built-in adversary** (the skeptic) that deflated two of the engine's own live cards from inside the panel. The single-model briefs reached the same headline (chronic vomiting, see a vet); the panel reached a *structured* version of it.
2. **The highest-value engine gap is deterministically computable, not AI-shaped.** "Chronic vomiting, unresolved, ~1/2 days for 6 weeks" needs only an episode span + count under the existing honesty floors — the same shape as the worsening lane (④) that was *already* built from the Fable brief's finding. The most important true sentence about Nyx requires no LLM. (Routes to §9.)
3. **Chronicity ≠ week-over-week worsening.** Detector ④ fires on a 2→3 weekly bump; it is silent on a flat-but-relentless six-week course. A pet can be "not worsening" and still profoundly abnormal. The valve the Fable brief found is closed for *worsening*; a *persistence/chronicity* valve is still open.
4. **The soft-delete contract is clinically load-bearing, not just an input-contract test (B-071).** With 43 deleted vs 21 live vomits and *all* diarrhea/lethargy rows deleted, the live picture is an owner-curated subset that biases toward under-calling — the deletions remove exactly the co-signs (diarrhea, lethargy) that would upgrade concern. This is a stronger statement than the Opus brief's framing of B-071 as a fixture for the `deleted_at IS NULL` guard.
5. **The intake-asymmetry is a detector-shaped disease signal the current engine misses.** "Meals never finished + clustered meal refusals" is computable, but detector ② (intake decline) misses it here because the refusals are mostly on excluded treat rows and the meal baseline is largely unrated/chaotic (the §6.3 self-dilution the Fable brief flagged). A *meal-specific finished-rate* lane is a candidate. (Routes to §9.)
6. **The treat-timing association remains exactly the "emerging-signals" artifact the §6.4 debate is about** — rapid-after-crunchy-treat (Temptations 3/96 vs soft 0/49) is real-direction, low-n, never causal, and the panel's *most cautious* members (skeptic, criticalist) named it the single biggest false-reassurance/mis-action risk ("swap the treats and feel fixed"). It is the cleanest live example of the trade the emerging-tier decision is actually weighing.
7. **The reliability threshold is per-claim-type, not a global data-volume gate** (see §9): Nyx is well past the bar for *escalation* and *descriptive* signals (and the engine surfaces some), still below it for *causal/associational* signals (chicken-ubiquity → no contrast; the engine correctly stays silent), and *reassurance* is off the table by invariant. The asymmetry already encoded in the engine **is** the threshold model — the "AI Signals card" temptation is precisely to relax the causal/associational bar, which is where every lens located the danger.

## 7. Trust & Safety / Privacy

Unchanged from the Opus (§7) and Fable (§8) briefs, and it bears a third repeat now that we are *also* fanning the data out to five specialist sub-contexts: appropriate as PM-requested dogfooding on the PM's own data; **not** a shippable pattern. The panel read **computed, data-minimized findings** (counts, a de-identified timeline, photo-read *summaries*), never a raw log/notes/photo dump — which is itself the model any productized version must follow: send computed findings + structured counts, never raw logs or images, to any model crossing the service boundary. Any productized "AI Signals" feature needs explicit consent, that data-minimization boundary, retention/processing review, and a decision on whether per-incident photo reads may leave the device. The §4 reads are identifiable pet-health narrative and stay in this private repo.

## 8. What this brief deliberately does not do

It does not diagnose Nyx — no vet has examined her; the §4 reads are pattern summaries of an owner's log, explicitly separated into shows / cannot-rule-out, nothing more. It does not recommend shipping a chronicity detector, an AI Signals card, or an emerging-signals tier — per the research-folder contract those are decisions; the evidence is above and the questions are routed below.

## 9. Open questions this raises (routed, not decided here)

1. **A deterministic *chronicity/persistence* lane** (Finding 2/3) — "ongoing vomiting ~1/2 days for N weeks, unresolved" under the existing honesty floors, independent of the worsening lane. Computable today; the single highest-value gap. → PM decision / detection-engine spec.
2. **A *meal-specific finished-rate / refusal* lane** (Finding 5) — capturing the meals-never-finished + clustered-refusal disease signal that detector ② misses on a treat-noisy, unrated baseline. → Biostatistician + Dr. Chen, then PM.
3. **Surfacing the soft-delete under-count (B-071, reframed)** (Finding 4 / Conflict B) — should the product ever signal "this view may under-count"? And the input-contract test is still owed. → PM decision; B-071.
4. **The "AI Signals card" scope** (Finding 7) — the panel's lean is that its first, safest job is a **bounded gestalt reviewer** (reads computed findings + counts only; may *escalate / re-rank / veto a too-calm framing* — e.g., surface chronicity, refuse "improving"; **never** reassures, **never** attributes cause), *not* an emerging-associational generator. The deterministic lanes (Q1/Q2) should be built first; reserve the LLM for the genuinely gestalt veto/synthesis. This is the Opus §8.1 idea, now panel-validated. → PM decision; Open Questions.
5. **Emerging-signals tier** (Finding 6) — the live PM↔team debate; this run adds the Temptations timing as a clean worked example *and* the panel's caution that it is the biggest mis-action risk. → PM decision; existing Open Question.
6. **The reliability-threshold framing** (Finding 7) — adopt "threshold is per-claim-type (escalate low / describe with floors / never reassure / attribute-cause high), not a global data-volume gate" as the design principle for any AI-surfaced insight. → PM ratification; design-principles candidate.
7. **A vomiting-vs-regurgitation capture field** (Finding 1b) — a quick-log "was there an active retch?" affordance, since the distinction changes the differential and the workup. → Designer + Dr. Chen; backlog.
8. **A standing/re-surfacing flag for `worth_a_call` per-incident findings** (Consensus 5) — the 05-18 foreign-body read should not vanish after one view. → Product; backlog.

---

## Appendix A — Reproducibility

**Subject:** `pets.id = bf7b196e-6db1-4a34-af34-f1759d380042` (project `aigchluqluzuhtbfllgh`), owner tz America/Chicago. All queries filter `deleted_at IS NULL` and `pet_id`. The computed evidence pack handed to the panel (the §3 numbers, the full timeline, the denominator check) was built from ~11 queries; representative new ones:

```sql
-- Time-of-day histogram + week-over-week EPISODES (3h collapse) + daily counts (§3 timing)
with v as (
  select e.occurred_at, (e.occurred_at at time zone 'America/Chicago') local_ts,
         case when lag(e.occurred_at) over (order by e.occurred_at) is null
                or e.occurred_at - lag(e.occurred_at) over (order by e.occurred_at) > interval '3 hours'
              then 1 else 0 end as new_episode
  from events e where e.pet_id = :pet and e.deleted_at is null and e.event_type='vomit')
select extract(hour from local_ts)::int hr, count(*) from v group by 1 order by 1;  -- 67% midnight–8am

-- Denominator check for the rapid-post-treat pattern (§3): feedings followed by a vomit ≤15 min, by group
with feeds as (
  select e.occurred_at fts, f.brand, f.format::text fmt, e.pet_id
  from events e join meals mm on mm.event_id=e.id left join food_items f on f.id=mm.food_item_id
  where e.pet_id = :pet and e.deleted_at is null and e.event_type='meal')
select case when brand ilike 'Temptations%' then 'Temptations'
            when fmt in ('treat','jerky','dry_kibble') then 'other_crunchy' else 'other_soft' end grp,
       count(*) feedings,
       count(*) filter (where exists (select 1 from events v where v.deleted_at is null and v.event_type='vomit'
         and v.pet_id=feeds.pet_id and v.occurred_at>=feeds.fts and v.occurred_at < feeds.fts + interval '15 minutes')) followed_15m
from feeds group by 1;   -- Temptations 3/96, other_crunchy 2/191, other_soft 0/49

-- The soft-delete ratio (§3 / Finding 4): live vs deleted by event type
select event_type::text,
       count(*) filter (where deleted_at is null) live,
       count(*) filter (where deleted_at is not null) soft_deleted
from events where pet_id = :pet group by 1 order by 2 desc;   -- vomit: 21 live / 43 deleted
```

## Appendix B — Panel method

Five specialist subagents (general-purpose, model Opus 4.8, isolated context), each handed the same computed evidence-pack file, the specialty mandate, the two safety invariants verbatim, and a fixed output contract (headline / ranked differentials / shows-vs-cannot-rule-out / **falsification of own hypothesis** / blind spots / next action / product-safety). The chair (this brief) reconciled. Full mandates are reconstructable from the §4 lens descriptions; the differentiator held constant was *specialty*, with model fixed — the inverse of the Opus/Fable single-lens/varied-model design.

---

*Append-only. If the engine architecture changes or another deep-dive is run on fresh data, write a new brief; do not overwrite this one.*
