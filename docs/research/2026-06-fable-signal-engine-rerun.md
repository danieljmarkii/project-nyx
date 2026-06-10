# Fable 5 vs. the Deterministic Signal Engine — Re-run of the Opus PoC on Fresh Data

**Date:** 2026-06-10
**Prepared for:** Nyx product team
**Lenses:** Sr. Data Scientist (lead), Veterinarian — Dr. Alex Chen, Dir. of Engineering, Trust & Safety / Privacy
**Scope:** Re-run of the [2026-06 Opus 4.8 PoC](./2026-06-opus-signal-engine-poc.md) with **Fable 5** (`claude-fable-5`, released June 2026) on the same pet's data as of **2026-06-10** — two days and two new vomit episodes after the Opus snapshot. Same §3.1 prompt, same `deleted_at IS NULL` contract, same head-to-head framing against the live `generate-signal` output. A methodology capture, not a model bake-off and **not a product decision**.
**Status:** Point-in-time capture. The product question it sharpens (an "emerging signals" tier) is live PM/product-team debate — this brief is evidence for that debate, not a resolution of it.

> **Data note.** Same boundary as the Opus brief: this analyses the PM's own cat ("Nyx", `pets.id = bf7b196e-6db1-4a34-af34-f1759d380042`) in the PM's own database, at the PM's explicit request, captured into the PM's private repo. See §8 — the method still does not transfer to other users' data unchanged.

---

## 1. Trigger

The PM asked for a re-run of the Opus PoC with the newly released Fable 5, on fresh data, with two questions behind it: (a) does a new frontier model surface anything different or better, and (b) does the re-run say anything about the PM's "emerging signals" product idea — surfacing AI-detected, *not-yet-statistically-rigorous* patterns on the Signal surface — which the product team currently disagrees with the PM about.

## 2. What changed since the Opus snapshot (2026-06-08 → 2026-06-10)

The engine code is unchanged. The data moved, a lot, in two days:

- **Two new vomit episodes** — 06-09 16:00 and 06-10 11:40 — making **three consecutive days with vomiting** (06-08, 06-09, 06-10) and **14 distinct episodes over 28 days** (3h episode-gap collapse, matching the engine's `symptomEpisodeGapHours`).
- **A free-feeding arrangement appeared** (B-040 in the wild for the first time on real data): a `free_choice` bowl of Blue Buffalo Wilderness **duck** dry, active 06-09 → 06-10 — a new standing exposure introduced mid-worsening-run.
- **A novel-protein LID meal appeared**: Instinct Limited Ingredient **rabbit**, offered 06-10 00:58, eaten `some` — ~11 hours before the 06-10 vomit.
- The 06-10 vomit's photo was **unreadable (oversized)**, so the per-incident read degraded honestly (`not_enough_to_say`).

### Dataset snapshot (live rows, 2026-06-10)

| | Live | Soft-deleted |
|---|---|---|
| meal events | 214 | 60 |
| vomit events | 15 (14 episodes) | 42 |
| diarrhea / itch / lethargy | 0 | 9 |
| stool events of any kind | **0** | — |

Diet remains treat-dominated and varied: 9+ proteins; chicken in 125/214 feedings (25/25 logged days). **Meal-type feeding has nearly collapsed in June** — six of the last ten days (06-01, 02, 03, 06, 08, 09) have *zero* `food_type='meal'` rows against 5–10 treats/day, with treats logged around the clock (00:29–04:18 runs).

## 3. What the live engine showed at the moment of the 15th vomit

This is the sharpest observation of the re-run, and it is an observed fact, not a simulation: the `ai_signals` cache row regenerated at **2026-06-10 11:41 — one minute after the 15th vomit was logged** — contains `findings: []` and the **onboarding empty state**:

> *"We're still getting to know Nyx — keep logging and the first patterns will start to surface."*

On the worst three-day stretch since mid-May, the Signal surface regressed from the Opus-era *"improving"* card to *nothing at all*. Layer by layer, each silence is individually by-design:

- **① Correlation** — silent, correctly: chicken is a constant staple (washes out); lobster reached only one case window (below every floor); and the new free-fed duck arrangement is a standing confounder that would cap anything else at Early.
- **② Intake decline** — silent, but for a *newly visible* reason: the cat single-day path compares today against a 14-day baseline of rated meals, and this pet's baseline **already contains refusals and picking** (05-27 `refused`/`picked`, 05-28 `picked`, …, mean ≈ 1.9 on the 0–4 scale). Today's `some` (2) is not *below* a baseline that chaotic. The detector's notion of "decline" presumes a healthy, stable baseline this grazing, treat-fed cat never established — **a pet that has never been well-fed in-log can never decline**.
- **③ Reflection** — silent **by the worsening gate**: 4 episodes this week vs 2 last week is a rising trend, and the reflection layer correctly refuses to narrate worsening as a neutral reflection ("worsening is owned by the safety lane"). But **no safety detector owns symptom-frequency worsening** — ② watches intake, ① watches food linkage, nothing watches the vomit count itself. The gate suppresses and nothing fires in its place: **a one-way valve into silence, with the valve opening exactly when the pet is getting worse.**
- **Coverage diagnostics (B-053)** — also silent, structurally: `staple_washout` requires *exactly one* protein (this pet has 9+), `rate_meals` requires too-few rated meals (this pet has enough). The layer built to explain silence has no diagnosis for the **average multi-treat household** — which is precisely the PM's "I'm a fairly average cat owner" archetype.

None of these is a bug. Together they reproduce — and sharpen — the Opus brief's §6.1 finding: the architecture has no organ that says *"step back, this whole animal looks wrong."* Two days ago the gestalt gap rendered as a misleadingly calm card; today it renders as an empty state.

## 4. The Fable 5 read

Same §3.1 prompt as the Opus run, inherited verbatim (n=1/absence never reassures; intake is not preference; associations never causation; name blind spots; one specific next action). Run agentically against the live database rather than a static dump.

### 4.1 Owner-facing gestalt read

> Nyx has been vomiting for four weeks now — 14 separate episodes since May 14, including each of the last three days. The week-to-week count is going the wrong direction (4 this week, 2 last week), and a month of recurring vomiting in a young cat is, on its own, worth a vet visit now — not because any single episode looked alarming, but because the duration and the trend do. Bring the report; the 05-18 photo that may have shown toy material matters to that conversation, and so does the diet picture below.
>
> Two patterns in the log are worth your vet's attention, stated as associations, not causes. First, four episodes — including both of the last two — happened **within 15 minutes of eating** (May 19, May 25, June 9, June 10), all after dry, crunchy treats. Throwing up minutes after eating looks different to a vet than vomiting hours later; it can point at eating speed or regurgitation rather than the stomach itself. Second, Nyx's diet is now almost entirely treats — on six of the last ten days, no meal-type food was logged at all, against five to ten treats a day, fed around the clock. I can't tell from the log whether unlogged meals exist; if they don't, the treat-grazing cycle is itself a plausible driver of both the vomiting and the hunger-driven gulping.
>
> What I can't see: no stool has ever been logged, there's no weight trend, and chicken is in so many feedings (125 of 214) that no analysis — mine or the engine's — can ever tell whether it's involved. A quiet day in this log is not evidence Nyx is well.
>
> You've already started changing things — the rabbit limited-ingredient food and the free-choice duck bowl both appeared this week. One specific next action: hold the diet still rather than adding more new foods. Pick one consistent meal-type food, log every feeding including refusals, and book the vet visit with the report. A simplified, fully-logged diet is what gives the next four weeks a chance of an answer the last four couldn't produce.

### 4.2 Vet-facing summary

> ♀ American Shorthair, 2.75 yr, 4.4 kg, no recorded conditions. Chronic intermittent vomiting ×4 weeks: 14 episodes/28 d, current cadence daily ×3 d (06-08→06-10); prior peak similar (05-18→05-20). 4/14 episodes post-prandial ≤15 min, all after dry treats; remainder 1–7.5 h post-feeding, several bilious in photos. One episode (05-18) with suspected foreign material (toy-like objects) on photo — pica/foreign-body risk unresolved. Diet: treat-dominated (≥9 proteins; chicken ubiquitous → no dietary contrast for elimination inference), meal-type feeding sparse in June; owner self-initiated novel-protein LID (rabbit) and free-choice dry (duck) this week. Intake: chronically irregular rather than acutely declined; isolated treat refusals; no weight, stool, water, or litter-box data logged. No diarrhea, lethargy, or derm signs in live log (absence of logging ≠ absence of signs).

### 4.3 Falsification attempts run against this read (adversarial pass, in-line)

- *"It's the lobster"* — the tempting story (novel protein 06-03→06-08, overlapping the worsening week) **fails**: the 06-09 and 06-10 episodes have no lobster in any window, and 4 of 6 lobster days were vomit-free. Correctly not claimed.
- *"Temptations cause the rapid vomits"* — checked against the denominator: 3/52 Temptations feedings followed by a vomit ≤30 min vs 2/162 for all other foods (5.8% vs 1.2%). Suggestive, not significant at these counts; stated only as a timing pattern with the brand named in evidence, not in the claim.
- *"Vomiting is accelerating"* — **partially fails**: 05-18→05-20 was also a 3-consecutive-day run (4 episodes). The honest claim is *chronic and unresolved, currently at its densest since mid-May, with a rising week-over-week count* — not monotonic acceleration. The read above says exactly that and no more.

## 5. Head-to-head (Fable 5 vs Opus 4.8 vs live engine, same cat)

| | Live engine (2026-06-10) | Opus 4.8 (2026-06-08) | Fable 5 (2026-06-10) |
|---|---|---|---|
| Headline | Onboarding empty state, `findings: []` | "Chronic q2-day vomiting in a young cat — see a vet" | Same escalation + *trend is rising and the calm-week claim is dead* |
| Worsening trend | Structurally invisible (one-way valve, §3) | Noted the "improving" frame buried the headline | Quantified: 4 vs 2 wk/wk; gate-suppression mechanism identified |
| Rapid post-prandial cluster | Not modelled | Not surfaced | **New finding**: 4/14 episodes ≤15 min post-feeding, incl. last two; denominator-checked |
| Diet structure | Not representable | "Treat-heavy chaotic diet, leading hypothesis" | Sharpened: June meal-type collapse (6/10 days zero meals), around-the-clock grazing |
| Owner's own interventions | Invisible (arrangement only caps tiers) | n/a (pre-dated them) | Read as unstructured diet-trial behavior; next-action redirects it |
| Foreign-body risk | Per-incident read only, never re-surfaced | Pulled into the gestalt | Same, still standing |
| Statistical discipline | High | Low (narrative) | Low-to-medium: denominators and falsification attempts run, but still no correction, still not reproducible |

The Opus brief's core finding **replicates**: the two systems remain blind in opposite directions, and the deterministic restraint is still a feature. What Fable 5 adds over Opus is less a different gestalt than a more *checked* one — each claim in §4 was attacked with a counter-query before being kept (§4.3), which is exactly the behavior you'd want from any future bounded reviewer stage. What it cannot add, identically to Opus: reproducibility, calibration, or a defensible p-value.

## 6. Findings

1. **The gestalt gap got worse, and it now has a precise mechanism.** The reflection layer's worsening gate assumes the safety lane owns worsening, but no detector owns *symptom-frequency* worsening — so a deteriorating pet gets less surfaced than a stable one. This specific gap is **deterministic-shaped, not AI-shaped**: "4 episodes this week, up from 2 — worth a call" is computable today with the engine's own episode logic, under the same honesty floors as reflections. Whatever happens to the "emerging signals" idea, this hole is independent of it.
2. **The B-053 coverage layer has a blind spot the size of the average owner.** Both diagnostics target degenerate logs (single staple, unrated meals). A varied, treat-heavy, well-logged diet — the PM's self-described average case — produces silence with no explanation. "Your diet is too varied for any single food to be assessable" is a true, computable, non-reassuring statement the layer cannot currently make.
3. **Detector ②'s baseline dilutes itself on chronically-irregular eaters.** Refusals inside the 14-day baseline lower the bar that "decline" is measured against. A cat that has always eaten erratically in-log can never trip the flag. (Observed, not adjudicated — whether this is acceptable conservatism or a gap needs the Biostatistician + Dr. Chen, not this brief.)
4. **The "emerging signals" debate now has concrete artifacts.** From this one re-run, the candidates an emerging tier would have carried: (a) the rapid post-prandial cluster (n=4, last two consecutive days); (b) the Temptations ≤30-min timing pattern (3/52 vs 2/162); (c) the June meal-type collapse as a structural observation. Each is honest only with its counts attached and an explicit *not-established* label — and (a)–(c) are exactly the class of finding the deterministic engine can never emit and Dr. Chen would never sign as Established. That is the trade the PM and the product team are actually debating.
5. **Free-feeding (B-040) behaved as designed on first real contact** — the duck arrangement confounds rather than correlates — but it also illustrates the cost: the owner's most natural response to a sick pet (put food down, try new foods) structurally *reduces* what the engine can ever conclude. Nothing in the product currently tells the owner this.
6. **Model-version delta (Opus 4.8 High → Fable 5) is real but second-order.** The reads agree on every load-bearing conclusion. The deltas — denominator checking, self-falsification, sharper mechanism analysis of the engine's silence — are improvements in *discipline*, not in pattern detection. Data freshness (two extra days) contributed as much new substance as the model change. Per §6.3 of the Opus brief, capability and grounding remain the levers; nothing here justifies re-litigating the Haiku phrasing decision (B-001) or the deterministic floor.

## 7. What this brief deliberately does not do

It does not recommend shipping an emerging-signals tier, a gestalt reviewer, or a worsening detector. Per the research-folder contract those are decisions; the evidence is above. It also does not treat my own read as ground truth — a vet has not seen this cat; the read is a pattern summary of an owner's log, nothing more.

## 8. Trust & Safety / Privacy

Unchanged from the Opus brief §7, and it bears repeating since this is now the *second* full-log frontier-model read: appropriate as PM-requested dogfooding on the PM's own data; **not** a shippable pattern. Any productized version requires consent, data minimisation (computed findings + counts, never raw logs/notes/photos), retention review, and a decision on photo reads crossing the boundary. The §4 read in this brief is itself identifiable pet-health narrative and lives only in this private repo.

## 9. Open questions this raises (routed, not decided here)

1. **Emerging-signals tier on the Signal surface** — the live PM ↔ product-team disagreement this brief feeds. Evidence: §6.4 artifacts, §5 trade table. → PM decision; Open Questions table.
2. **Deterministic worsening lane** (the one-way-valve gap, §6.1) — independent of the AI debate; computable under existing floors. → PM decision on whether to spec it.
3. **Coverage diagnostic for the varied-diet case** ("too varied to assess", §6.2). → PM decision; natural B-053 extension.
4. **Detector ② baseline dilution on chronically-irregular eaters** (§6.3). → Biostatistician + Dr. Chen review before any threshold change.
5. **B-071 (adversarial more-deleted-than-live fixture)** — still open, still demonstrated by this pet (42 soft-deleted vs 15 live vomits).

---

## Appendix A — Reproducibility

Same subject and project as the Opus brief. All queries filter `deleted_at IS NULL` and `pet_id = 'bf7b196e-6db1-4a34-af34-f1759d380042'`. The §2/§3 queries are unchanged from Opus Appendix A. New queries for this brief's findings:

```sql
-- Nearest preceding feeding before each vomit (rapid post-prandial cluster, §4)
with v as (select occurred_at vts from events
           where deleted_at is null and event_type='vomit' and pet_id = :pet),
     m as (select e.occurred_at mts, f.brand, f.product_name, f.food_type
           from events e join meals mm on mm.event_id = e.id
           left join food_items f on f.id = mm.food_item_id
           where e.deleted_at is null and e.event_type='meal' and e.pet_id = :pet)
select v.vts, round(extract(epoch from (v.vts - p.mts))/60) mins_since_feeding,
       p.brand, p.product_name
from v left join lateral
  (select * from m where m.mts <= v.vts order by m.mts desc limit 1) p on true
order by v.vts;

-- Denominator check for the treat-timing pattern (§4.3)
select case when f.brand ilike 'Temptations%' then 'temptations' else 'other' end grp,
       count(*) feedings,
       count(*) filter (where exists (
         select 1 from events v
         where v.deleted_at is null and v.event_type='vomit' and v.pet_id = e.pet_id
           and v.occurred_at >= e.occurred_at
           and v.occurred_at <  e.occurred_at + interval '30 minutes')) followed_30m
from events e join meals mm on mm.event_id = e.id
left join food_items f on f.id = mm.food_item_id
where e.deleted_at is null and e.event_type='meal' and e.pet_id = :pet
group by 1;

-- June meal-type collapse (§2): meals vs treats per day, last 21 days
select date_trunc('day', e.occurred_at)::date day,
       count(*) filter (where f.food_type='meal')  meals,
       count(*) filter (where f.food_type='treat') treats
from events e join meals mm on mm.event_id = e.id
left join food_items f on f.id = mm.food_item_id
where e.deleted_at is null and e.event_type='meal' and e.pet_id = :pet
  and e.occurred_at >= now() - interval '21 days'
group by 1 order by 1;
```

The live-engine observation in §3 is the `ai_signals` row for the pet (`generated_at = 2026-06-10 11:41:19+00`, `findings = []`).

---

*Append-only. If the engine architecture changes or another re-run is done on fresh data, write a new brief; do not overwrite this one.*
