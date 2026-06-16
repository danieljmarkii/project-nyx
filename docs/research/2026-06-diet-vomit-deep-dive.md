# Nyx's Diet & Vomiting — A Deep Dive, with an Opus 4.8 Re-run Against the Signal Engine

**Date:** 2026-06-16
**Prepared for:** Nyx product team
**Lenses:** Sr. Data Scientist (lead), Veterinarian — Dr. Alex Chen, Dir. of Engineering, Sr. Product Designer, Trust & Safety / Privacy
**Scope:** A thorough read of one pet's **diet** and **vomiting** as they exist in the production database on 2026-06-16 — and the third head-to-head in the dogfood lineage ([Opus 4.8, 2026-06-08](./2026-06-opus-signal-engine-poc.md); [Fable 5, 2026-06-10](./2026-06-fable-signal-engine-rerun.md)), re-run with Opus 4.8 on six-days-fresher data. Unlike the prior two, this run is **diet-and-vomit-first** (the data is the subject; the engine comparison is the supporting frame) and lands on a **natural experiment**: between the Fable run and this one the owner acted on the prior brief's next-action and *simplified the diet*. A methodology + evidence capture. **Not a product decision.**
**Status:** Point-in-time snapshot. Counts will drift with continued logging. The product questions it sharpens (§11) are routed to Open Questions / backlog per the research-folder contract — they are **not** resolved here.

> **Data note.** This analyses **real dogfood data** — the PM's own cat, "Nyx" (`pets.id = bf7b196e-6db1-4a34-af34-f1759d380042`, project `aigchluqluzuhtbfllgh`) — at the PM's explicit request, captured into the PM's own private repo. All extraction filters `deleted_at IS NULL` and is pet-scoped. Times are **America/Chicago** (the owner's profile timezone, and the timezone the engine itself uses for this pet) unless stated otherwise — this matters: every "3–7am"-type claim is local time, and the prior briefs' UTC-ish framing was an hour off. See §10 — the method still does not transfer to other users' data unchanged.

---

## 1. Trigger

The PM asked for a deep, thorough read of Nyx's **diet** and **incident-style events (vomiting)** — both to understand the animal and to inform how an AI insight layer might sit *alongside* the deterministic statistics engine. This is the recorded answer, run agentically against the live database, with the engine comparison kept as the supporting frame the prior two briefs established.

Two things make this run different from its predecessors:
1. **The engine has shipped three new detectors** since the Fable run (④ `symptom_worsening`, ⑤ `postprandial_timing`, ⑥ `timeofday_clustering`). The "empty-state on the worst week" failure Fable caught is no longer what the surface does — so the head-to-head is against a materially stronger engine.
2. **The owner intervened.** Acting on Fable's next-action ("hold the diet still"), the PM simplified the diet after 06-10. That turns the log into a within-subject before/after — the most useful thing that could have happened to this dataset, and the spine of §5.4.

---

## 2. What changed since the 06-10 (Fable) run

| | 2026-06-10 (Fable) | 2026-06-16 (this run) |
|---|---|---|
| Live vomit events / episodes | 15 / 14 | **17 / 16** |
| Most recent vomit | 06-10 | **06-15 (chronic, ongoing)** |
| Engine detectors live | ①②③ (+④ just shipping) | **①②③④⑤⑥** (descriptive lane live) |
| Live Signal surface | onboarding empty state, `findings:[]` | **⑥ time-of-day cluster + ③ flat reflection** |
| Diet | treat-dominated, 9+ proteins, meal collapse | **owner-simplified: protein variety narrowed, treats unchanged** |
| Standing free-choice bowl | duck (06-09→10) noted | **Royal Canin "Weight" open since 05-16, never closed** (under-weighted before) |

The headline clinical fact: **vomiting did not stop.** Two more episodes (06-11, 06-15), the most recent the day before this run. Whatever the diet change accomplished, it did not end the vomiting — see §5.4.

### Dataset snapshot (pet-scoped, 2026-06-16)

| event_type | Live | Soft-deleted |
|---|---|---|
| meal | 265 | 63 |
| vomit | 17 (16 episodes) | 42 |
| diarrhea | 0 | 8 |
| itch / lethargy | 0 | 2 |
| stool / weight_check / medication | **0** | 0 |

The soft-delete contract remains **load-bearing and unguarded by a test** (backlog B-071): 42 deleted vs 17 live vomits. An unfiltered read would report ~3.5× the vomiting plus phantom diarrhea/itch/lethargy. The deletions are not uniform — **28 of 42** fall in the week of 05-18 (a bulk re-log/cleanup), so this pet remains the ideal "more-deleted-than-live" adversarial fixture.

---

## 3. Method

Same lineage as the prior two briefs: pull the full structured log from Supabase, expose it to the model, compare against what the deterministic engine actually emits on the same data. The model read inherits Nyx's two safety invariants verbatim (n=1 / absence never reassures; intake is not preference; associations stated as associations; name blind spots; one specific next action). The engine baseline was re-grounded in the **current** `generate-signal/detection.ts` (it has six detectors now, not three; §6), not in the prior briefs' description of it. Engine-behavior claims in §6 were checked against the code by the `adversarial-reviewer` subagent before this brief was finalized.

---

## 4. The data — Nyx's vomiting

### 4.1 The shape of it

**16 episodes across 33 days (2026-05-14 → 06-15)** after collapsing same-type events within 3h (the engine's `symptomEpisodeGapHours`). One duplicate pair logged at the same minute (05-15 07:11, one with a photo read and one without — a double-tap; harmless after collapse). Cadence is **chronic and choppy, not improving**:

| Week (Mon, CT) | Episodes |
|---|---|
| 05-11 | 2 |
| 05-18 | 4 |
| 05-25 | 4 |
| 06-01 | 1 |
| 06-08 | 4 |
| 06-15 (partial, 2 days) | 1 |

Rolling 7-day: **3 this week, 3 last week (flat).** There is no week-over-week improvement trend, and a single-week dip (06-01) was followed by a return to 4. A month-plus of recurrent vomiting in a **young** (2.8 yr) cat is the clinically dominant fact regardless of how any single week reads.

### 4.2 What the photos showed (per-incident AI reads)

24 of the episodes carry `event_ai_analysis` reads. Composite picture:

- **Colour/contents:** mostly brown/tan, partially-to-undigested food, **chunky** consistency. Three episodes were **yellow + bile-positive** (05-20, 06-05, 06-09). No blood ever visible.
- **Foreign material:** one **`worth_a_call` flag (05-18)** — a small blue spherical object "consistent with a toy ball" on the mat beside the vomit, plus a similar object on the food bowl. Logged `suspected_foreign_material`. **This pica / foreign-body risk is still standing and still unresolved** five weeks later, in a cat who also gulps (§5.3).
- **Recommendations:** mostly `monitor`; two `worth_a_call` (05-18 foreign material; 05-30 `repeated_vomiting`); two `not_enough_to_say` (degraded honestly on unreadable/oversized photos).

Per the n=1 invariant, the per-incident reads can **escalate** on a red flag (they did, twice) but never **reassure** on a benign-looking one — a "monitor" photo is not a well cat.

### 4.3 Two timing patterns sit in the data — only one is the same phenomenon twice

**(a) An early-morning clock cluster (3–7am).** Of the 8 episodes with a *witnessed* onset, **5 fall in the 3:00–6:59am Chicago band** (05-14, 05-25, 05-30, 06-08, 06-10). This is what the engine surfaces today (§6, ⑥).

**(b) A rapid post-prandial cluster.** **4 episodes vomited ≤30 min after the nearest logged feeding** — 05-19 (2 min), 05-25 (1 min), 06-09 (14 min), 06-10 (3 min) — and **all four followed dry, crunchy treats eaten in full** (Temptations Catnip ×2, Temptations Birthday, Party Mix California Crunch). This is the "scarf-and-bring-it-back-up" picture.

The two clusters **overlap**: 05-25 and 06-10 are *both* early-morning *and* rapid-post-treat. So part of the 3–7am pattern is not a mysterious empty-stomach clock — it is **Nyx eating a dry treat in the small hours and vomiting it back within minutes** (she is fed treats around the clock; §5.1). Crucially, the **bile-positive** episodes (05-20, 06-05, 06-09) are *not* in the early-morning band and mostly *not* rapid — so a clean "bilious empty-stomach syndrome" mechanism is **not** supported by the data, however tempting the 3–7am headline makes it. The honest statement is two associational timing patterns, one of which is partly a feeding artifact; mechanism unproven (§7.3).

---

## 5. The data — Nyx's diet

### 5.1 The real base diet is not "all treats" — it's a free-choice bowl plus around-the-clock treats

The prior briefs framed the diet as "almost entirely treats." That is incomplete. `feeding_arrangements` carries a **standing `free_choice` bowl of Royal Canin "Weight"** dry food, **`active_from` 2026-05-16, `active_until` NULL** — i.e. open the entire logging period and never closed. (A second, finite free-choice duck bowl ran 06-09→06-10.)

So Nyx's actual diet is: **unlimited weight-management kibble available 24/7 (unmeasured, because free-choice isn't event-logged) + 5–11 logged treats/day + a sparse 0–3 wet "meals"/day.** Two consequences:

- The "meal-type collapse" the prior briefs flagged is partly an **artifact of where the staple lives** — the caloric base is a standing arrangement, not a logged `meal` event, so the event log under-counts real food intake and over-weights treats.
- The standing free-fed bowl is a **permanent confounder** for the correlation engine (§6, ①) — and, it turns out, structurally disables the post-prandial detector for this pet (§6, ⑤).

The feeding *clock* confirms the grazing: treats are logged in **every hour of the day**, including overnight (hours 00, 01, 02, 04 in CT all carry treat feedings). Meals concentrate at ~6am and ~5–9pm. A cat eating dry treats at 2–4am who vomits at 3–7am is not a coincidence the data can call empty-stomach.

### 5.2 Protein ubiquity — why no food can ever be implicated *or* cleared

Across the log Nyx has eaten **9+ proteins** (chicken, tuna, turkey, ocean whitefish, lobster, duck, rabbit, beef, lamb). But one protein is everywhere:

- **Chicken was fed on 31 of 32 logged days** and appears in **14 of 17 vomit windows** (the 3 misses predate the start of diet logging). Every vomit's 24h window contained **4–9 treats and 2–6 distinct proteins**.

A near-constant exposure has **no contrast** — there is no chicken-free stretch to compare against, so a case-crossover design *structurally cannot* implicate or exonerate chicken. This is the engine's ① behaving exactly as designed (a staple is supposed to wash out), and it is also the ceiling on what *any* analysis — model or engine — can conclude about diet→symptom linkage from this log.

### 5.3 Intake is selective, not declining — and that is its own signal

| | refused | picked | some | most | all | unrated |
|---|---|---|---|---|---|---|
| **Treats** | 6 | 6 | 8 | 6 | **169** | 33 |
| **Meals** | 2 | 2 | 7 | 5 | 1 | 19 |

Nyx eats **treats with gusto** (169 finished in full) but **picks at meals** — she finished most-or-all of only **6 of ~17 rated meals**. This is not global inappetence (she is plainly hungry); it is **selective eating skewed toward treats** — classic treat-spoiling, *and* a recognised confounder, because a cat filling up on palatable treats and refusing balanced meals is a pattern that can also accompany nausea. The intake-is-not-preference invariant says: do not file this under "picky" and move on. But note the asymmetry — the safety detector ② is silent on it (treats are excluded from the baseline, and the *meal*-side intake shows no recent decline; §6), so this selective-eating skew reaches no surface at all.

One honest caveat that cuts against alarm without reassuring: in the **most recent** days (06-11→15) her meal intake actually *improved* — daily means of 2.5–3.0 (mostly "most"/"all") as the diet narrowed, up from a sub-2 stretch in late May. The treat-over-meal skew is a whole-period **structural** pattern, not a current meal refusal — and it is in no way reassurance about the vomiting, which continued across that same window.

### 5.4 The diet "simplification" as a natural experiment — what actually changed, and what it tells us

The owner simplified the diet after 06-10. The data shows **what that did and did not mean**:

**What changed:** daily protein *variety* narrowed (late May ran 4–7 distinct proteins/day; 06-11→16 runs 1–3). The treat stream converged onto **chicken** (Delectables, Wellness Kittles, Temptations Tasty Chicken, Tiki Cat, Blue Buffalo) and the meal stream onto **turkey** (Instinct Limited Ingredient, 5 feedings) plus a little chicken pâté. One thing genuinely *did* improve: **meal acceptance** — she eats the Instinct turkey LID "most"/"all", and recent meal-day intake means rose to 2.5–3.0 from a sub-2 baseline (§5.3). The simplification helped *how well she eats her meals*. It did not help the vomiting.

**What did *not* change — and why this isn't a diagnostic trial:**
- **Treats were not reduced** (still 5–9/day) and the **free-choice Royal Canin bowl stayed open**. The "diet" is still treat-grazing on a kibble base.
- **New foods kept being introduced** *during* the simplification (Tiki Cat 06-13, Blue Buffalo treat 06-13, Instinct chicken pâté 06-14, Temptations Tasty Chicken 06-15) — the opposite of holding still.
- It **consolidated onto chicken — the incumbent staple** (§5.2). For elimination logic this is the worst possible choice: chicken exposure was never interrupted, so contrast did not improve, it *worsened*. The one trial-like element (turkey LID meals) is **swamped 1–2 meals/day against 5–9 chicken treats**.
- It is **not a novel-protein diet** (`is_novel_protein` is false on every food), there is **no vet oversight** (`vet_visits` = 0, `diet_trials` = 0), and it has run **~5 days**.

**What happened to the vomiting:** it **continued through the change** (06-11, 06-15). Episode rate was 3.53/week before 06-11 (14 episodes) and 2.53/week after (2 episodes in 6 days). That apparent drop is **2 episodes over 6 days** — well within noise, and the engine's own reflection reads the period **flat**. Per the n=1 / absence-never-reassures invariant, **this is not evidence of improvement.** The clinically load-bearing reading runs the other way: *a month of vomiting that continued through an owner-initiated diet change is more concerning, not less* — it makes simple dietary indiscretion a less complete explanation and raises the value of a real workup.

---

## 6. What the deterministic engine says now — and why, detector by detector

Live `ai_signals` row, generated **2026-06-16 17:23** (the home reads cache only). Two findings:

> **(lead, ⑥)** *"5 of Nyx's 8 timed vomiting episodes happened between 3am and 7am — a timing pattern worth mentioning to your vet."*
> **(2nd, ③)** *"We've logged 3 episodes of vomiting for Nyx this week — about the same as last week."*

The engine is **no longer at the empty state** Fable caught; the descriptive lane carries a real, honest, associational pattern. Per-detector, on this pet:

| Detector (class) | State | Why |
|---|---|---|
| **① food↔symptom correlation** (insight) | silent | No dietary contrast: chicken is on 31/32 days, so it is *concordant* across matched case/control windows and its discordant-case count `b` never clears the floor (`earlyMinDiscordantCaseOnly` = 2). The standing free-fed Royal Canin bowl compounds it — free-fed proteins are dropped from candidacy, and any standing exposure caps a surviving finding at Early. Correctly silent. |
| **② intake decline** (safety) | silent | Treats (where most refusals sit) are excluded from the intake baseline by design. On the meal side there is simply **no recent decline to detect**: the rated-meal baseline is a low ~2.06/4, and her most recent meal-days (06-11→15) sit *at or above* it (means 2.5–3.0) — meal acceptance actually *improved* as the diet narrowed. The cat single-day gate (a recent day ≤ `singleDayConcernCeiling` = 2 **and** ≥ 1 point below baseline) is never met. Correctly silent. |
| **③ reflection** (insight) | **fires, flat** | 3 episodes this week = 3 last week; symptom-days 3 = 3. Not worsening → reflection is permitted, and reports flat. |
| **④ symptom worsening** (safety) | silent | Shares ③'s `isWorsening` predicate; fires only if `currentCount > priorCount` **or** `currentDays > priorDays`. Neither rose (count 3 = 3, days 3 = 3) — and the fact that ③ rendered at all *proves* the day-arm is flat. (Had the prior week's 3 episodes been bunched onto ≤ 2 days, the day-arm would trip: ④ would fire `more_days` and ③ would suppress — the one-way-valve gap Fable found, now closed.) |
| **⑤ postprandial timing** (insight) | silent | Silent at its **eligibility denominator floor**. ⑤ excludes episodes under active free-feeding, and the open-ended Royal Canin bowl (`active_until` NULL → indefinite) makes **every episode from 05-16 on ineligible** — leaving only the 2 *pre-bowl* witnessed episodes (05-14, 05-15), far below `minEligibleEpisodes` = 6, so the detector returns empty *before* the rapid-count threshold is ever evaluated. The witnessed-only gate *compounds* this (it would independently drop 2 of the 4 rapid episodes — `estimated`/`window`), but the standing bowl is the dominant cause. The detector purpose-built for §4.3(b) never gets to look. |
| **⑥ time-of-day clustering** (insight) | **fires** | Witnessed-only, no free-feeding gate. 8 witnessed episodes, 5 in a 4h band starting 3am (5 ≥ `minClusterEpisodes` 5; 5/8 = 0.63 ≥ `minClusterFraction` 0.6; 8 ≥ `minEligibleEpisodes` 6). Since ⑤ is silent, ⑥ is not suppressed by the mutual-exclusion rule. |
| **coverage diagnostics (B-053)** | **don't run** | Coverage only populates on the *empty-findings* path; this pet **has** findings (⑥, ③), so `coverage` is `[]` (confirmed in the live row). Even the diet-structure diagnostics that would fit this household (`meal_type_collapse`, `diet_churn`) are structurally unreachable whenever any finding fires — see §9.4. |

The engine's composed message to the owner is therefore: *"vomiting clusters 3–7am (mention to your vet); about the same as last week."* Truthful, useful, and — for a five-week run of vomiting in a young cat that just continued through a diet change — **still missing the gestalt**: the chronicity, the failed diet experiment, the standing pica flag, and the selective-eating/treat-grazing structure are each invisible to it, individually by design.

---

## 7. The Opus 4.8 read (same data, same §3 prompt)

### 7.1 Owner-facing gestalt read

> Nyx has been vomiting for about five weeks now — 16 separate episodes since May 14, including one yesterday. The week-to-week count is holding steady rather than fading (3 this week, 3 last week), and a month-plus of recurring vomiting in a cat this young is, on its own, a reason to see the vet now — not because any single episode looked dangerous, but because it has gone on this long and just continued straight through the diet change you made. That it kept happening after you simplified things is itself useful information for the vet: it makes "something she ate once" a less complete explanation, and it's worth bringing the report so they can see the whole month at once. The photo from May 18 that may have shown a small toy-like object near the vomit belongs in that conversation too — a cat who throws up this often and may be mouthing toys is one you want checked for the things a log can't see.
>
> Two patterns are worth showing your vet, both as timing only, not causes. First, most of the episodes the app can time precisely happen in the early morning, roughly 3 to 7am. Second — and the app can't currently show you this one — four episodes came within a few minutes of eating, every one of them right after a dry, crunchy treat she gulped down whole. Some of those early-morning episodes *are* the gulping ones (she gets treats around the clock, including overnight), so part of the "3–7am" story may simply be a fast-eaten treat coming back up. I can't tell you which from the log alone, and I'm not going to guess at a mechanism.
>
> What I can't see matters as much as what I can. Nyx grazes all day on treats and a bowl of weight-management kibble that's always out, and she eats treats eagerly while only picking at her actual meals — she finished all of just 6 of her 17 meals this month. That's worth a mention: a cat filling up on treats and leaving meals can be a spoiled eater, or it can be a cat who feels off, and the log can't separate those. There's no weight tracked, no stool ever logged, and chicken is in nearly every single thing she eats — so no analysis, mine or the app's, can say whether any one food is involved. A quiet day here is not evidence she's well.
>
> You did the right instinct by simplifying — but it landed on chicken, which was already in everything, and the treats and the always-available bowl stayed. So it wasn't quite the clean test it could be. One specific next step: **book the vet visit now and bring the report**, and ask them whether a proper controlled food trial — one vet-chosen food, treats paused, the free bowl put away, every feeding logged — is the right next move. The informal version this month didn't settle it, and five weeks is long enough to stop guessing.

### 7.2 Vet-facing summary

> ♀ American Shorthair, 2.8 yr, 4.4 kg, no recorded conditions. **Chronic intermittent vomiting ×5 weeks**: 16 episodes / 33 d (2026-05-14 → 06-15), current cadence ~3/wk, non-remitting; **continued through an owner-initiated dietary change (~06-11)**. Vomitus mostly partially-digested food, chunky; 3 episodes bilious (05-20, 06-05, 06-09); no haematemesis. **One episode (05-18) with suspected foreign material (toy-like object) on photo — pica/foreign-body risk unresolved.** Timing: of witnessed-onset episodes, 5/8 cluster 03:00–07:00; separately, 4 episodes ≤30 min post-ingestion, all after dry treats eaten in full (rapid-ingestion/regurgitation vs. true vomiting not distinguishable from log). Diet: free-choice weight-management dry available 24/7 + heavy treat grazing around the clock (≥9 proteins; chicken near-ubiquitous → no contrast for elimination inference); meal-type intake sparse and selective (finished most/all of 6/17 meals) against eager treat intake. No weight, stool, water, or litter-box data logged; no diarrhoea/lethargy/derm signs in the live log (absence of logging ≠ absence of signs). Suggested: physical exam + minimum database (CBC/chem/T4, given age T4 mainly to exclude), consider abdominal imaging in light of the foreign-material flag and pica behaviour, and a vet-directed controlled diet trial (single defined diet, treats and free-choice withdrawn).

### 7.3 Falsification attempts run against this read (adversarial pass, in-line)

- *"The diet simplification is working."* **Fails.** Vomiting continued (06-11, 06-15); the 3.53→2.53/wk change is 2 episodes over 6 days, within noise; the engine reads it flat. No improvement is claimable, and per the safety invariant a quiet stretch could not reassure even if it existed.
- *"It's the chicken / it's a food allergy."* **Cannot be claimed or excluded.** Chicken is on 31/32 days with no contrast; the simplification *increased* chicken's ubiquity. Stated as a blind spot, not a finding.
- *"It's a post-prandial gulping problem."* **Suggestive, not established.** 4/16 episodes ≤30 min post-treat, all dry treats eaten whole — but the denominator is confounded (treats are fed constantly, so the nearest-preceding feeding is *always* a treat), n is small, and 2 of the 4 have imprecise timestamps. Kept as a timing association only; no mechanism asserted.
- *"3–7am = bilious empty-stomach vomiting."* **Fails as a mechanism.** The bile-positive episodes are *not* in the early-morning band, and overnight grazing means 3–7am is not a fasted window. The clock cluster is real; the empty-stomach story is not supported. (Matches the engine's own guardrail against naming a mechanism on ⑥.)
- *"Vomiting is accelerating."* **Fails.** It is chronic and flat-to-choppy, not monotonically rising. The read says "steady, not fading," which is what the data supports.

---

## 8. Head-to-head (same cat, four readings)

| | Live engine (06-16) | Opus (06-08) | Fable (06-10) | Opus (06-16, this run) |
|---|---|---|---|---|
| Headline | "3–7am cluster; flat vs last week" | "Chronic q2-day vomiting — see a vet" | Same + "trend rising, calm-week claim dead" | Same escalation + **"continued through the diet change → more concerning, not less"** |
| Worsening trend | Flat reflection (③), ④ silent (correctly) | "improving" frame buries it | Quantified rising; one-way-valve gap identified | Flat *and chronic* — chronicity is the point, not the weekly delta |
| Early-morning cluster | **Surfaced (⑥)** | not surfaced | not surfaced | Surfaced **and partly de-mystified** as overnight treat-gulping |
| Post-prandial cluster | **Silent (⑤ doubly blocked)** | not surfaced | New finding (4/14) | Refreshed (4/16) **+ explains why the engine can't fire ⑤** |
| Diet structure | not representable | "treat-heavy chaotic diet" | June meal collapse, grazing | **Standing free-choice bowl surfaced; "simplification" dissected as a failed/mis-designed trial** |
| Selective eating | Silent (no acute decline) | n/a | n/a | **Whole-period treat-over-meal skew named — and why ② correctly doesn't fire** |
| Foreign-body / pica | per-incident read only | pulled into gestalt | still standing | Still standing, tied to gulping |
| Statistical discipline | **High** (McNemar/Bonferroni/floors) | Low (narrative) | Low–med (denominators) | Low–med (denominators + this falsification pass) |
| Reproducibility | Deterministic, testable | Non-deterministic | Non-deterministic | Non-deterministic |

The Opus brief's core finding **replicates a third time, but the gap has narrowed from the engine's side.** The descriptive lane (⑥) now carries a real associational pattern, and the worsening one-way-valve is closed (④). What the engine still cannot assemble is the **gestalt**: chronicity-as-the-headline, the *failed diet experiment*, selective eating, the standing pica flag, and the free-choice-bowl reframing — each invisible to an independent-detector architecture, each caught by a whole-animal read. And the new wrinkle this run adds: a real pattern (post-prandial) that the engine has a *purpose-built detector for* (⑤) is still silenced — not by architecture this time, but by **real-world logging messiness** (a 24/7 free bowl + imprecise timestamps). The model is unbothered by that messiness; the deterministic detector is correctly paralysed by it.

---

## 9. Findings

1. **The deterministic lane has materially closed the gap the prior briefs identified — deterministically, as their open questions proposed.** ⑥ surfaces an honest associational timing pattern; ④ closed the worsening one-way valve. The engine is no longer mute on this pet's worst weeks. This is the strongest argument *against* rushing an AI tier: two of the prior briefs' three gestalt complaints were answerable in pure, testable code.
2. **But the residual gap is exactly the gestalt — and it is now sharper.** The single most important fact (five weeks of vomiting that *continued through an owner's diet change*) is composed of true statements no single detector owns: chronicity (③ only does week-over-week), the failed intervention (the engine can't see that a diet change happened, let alone that it failed), selective eating (② blind), and the standing pica flag (per-incident only). A whole-animal read assembles these; independent detectors cannot.
3. **A purpose-built detector can be silenced by ordinary real-world logging.** ⑤ exists precisely for the rapid-post-eating pattern in §4.3(b), yet it never even reaches its rapid-count test here: the standing free-choice bowl makes every episode logged after it opened ineligible, and the eligible set bottoms out below the 6-episode denominator floor (the `estimated`/`window` timestamps would compound it). This is not a bug — each guard is individually correct — but it means the detector's real-world hit rate on grazing, casually-logged households (i.e. most of them) is lower than its design suggests. The model surfaced the same pattern the detector couldn't.
4. **The diet-structure observations are real but structurally unreachable for this pet.** "Almost all treats, and several brand-new foods introduced while symptoms were active" is true, computable, and non-reassuring, and the `meal_type_collapse` / `diet_churn` diagnostics are built to say exactly that. But coverage runs *only* on the empty-findings path — so the moment ⑥ (or ③) fires, those observations can never reach the owner. A pet can have a real diet-structure problem *and* a firing finding at once (this one does), and the architecture forces a choice between them. Worth deciding whether diet-structure observations belong in the findings lane rather than the coverage lane.
5. **Free-choice feeding is a quiet, compounding blind spot.** The standing Royal Canin bowl (a) confounds ①, (b) disables ⑤, and (c) hides the caloric base from the meal log so the diet *looks* like pure treats. None of this is surfaced to the owner, and the owner's most natural response to a sick pet (leave food out, try new foods) makes it worse. The product has no way to tell the owner "the always-available bowl is limiting what we can learn."
6. **The treat-over-meal skew reaches no surface — but it's a structural pattern, not an acute decline.** Eager treats + historically picked meals is both a plausible behavioural artifact (treat-spoiling) and a possible illness sign. ② is *correctly* silent (recent meal intake actually improved; §6), but that is the point: the engine watches only for acute decline, so the *chronic structural* skew — a treat-dominated intake balance, and the intake-is-not-preference question it raises — has no home in the product at all.
7. **Model-version is second-order; data freshness and the intervention are first-order.** As with Opus→Fable, the load-bearing conclusions don't hinge on which frontier model read the log. What made this run informative was six more days of data containing an *owner intervention* — substance the model surfaced and the engine structurally cannot represent.

---

## 10. Trust & Safety / Privacy

Unchanged from the prior two briefs, and now said for the third time: appropriate as PM-requested dogfooding on the PM's own data; **not** a shippable pattern as-is. Piping a full event log to a frontier model means sending identifiable pet-health records (and free-text notes, and photo reads) to an external service. Any productised version needs explicit consent, **data minimisation** (send computed findings + structured counts, never raw logs/notes/photos), a retention/processing review, and an explicit decision on whether per-incident photo reads may cross the boundary. The §7 read is itself identifiable pet-health narrative and lives only in this private repo. The free-choice-bowl and selective-eating observations are *computable on-device* (§9.4–9.6) and do not require the model boundary at all — a relevant point for the §11 debate.

---

## 11. Open questions this raises (routed, not decided here)

Per the research-folder contract these are decisions for the spec/backlog, captured so they aren't lost:

1. **Bounded "gestalt reviewer" stage** — still the central open question (Opus brief §8.1, Fable §9.1). This run sharpens the trade: the deterministic lane closed *part* of the gap (⑥, ④), so the reviewer's remaining job is narrower and more defensible — re-rank/suppress a calm composition when whole-animal facts (chronicity + a failed intervention + a standing flag) contradict it, fed only computed findings + counts, never inventing a finding. → Open Questions table / PM.
2. **A free-feeding-aware coverage diagnostic** (new, from §5.1/§9.5). "An always-available bowl is limiting what Nyx's log can show" is true, computable, non-reassuring, and currently unsaid. → candidate B-053 extension.
3. **⑤'s real-world reachability on grazing/free-fed pets** (§9.3) — a standing free-choice bowl alone makes every episode logged after it opened ineligible, which (with the 6-episode floor) can zero out the detector for an entire household; is that acceptable conservatism or a coverage hole? → Biostatistician + Dr. Chen review, not a unilateral threshold change.
4. **Surfacing selective intake (eager treats / picked meals)** that ② structurally cannot catch (§5.3/§9.6). → Data Scientist + Dr. Chen; relates to the intake-is-not-preference invariant.
5. **Whether the descriptive diet-structure diagnostics (`meal_type_collapse`, `diet_churn`) are reachable for the free-choice + treat-grazing shape** (§9.4). → engineering check against `detection.ts`.
6. **Emerging-signals tier** — the live PM ↔ team debate (Fable §9.1) now has a counter-data-point: the deterministic lane absorbed two of the three prior artifacts, which argues the bar for an *un-signable* tier is higher than it looked. → PM decision.
7. **B-071** (adversarial more-deleted-than-live fixture) — still open, still demonstrated (42 deleted vs 17 live; 28 in one week).

---

## Appendix A — Reproducibility

Subject `pets.id = bf7b196e-6db1-4a34-af34-f1759d380042`, project `aigchluqluzuhtbfllgh`. All queries filter `deleted_at IS NULL` and pet-scope; times bucketed in `America/Chicago`. Representative queries (the §2/§4 vomit-timeline and §5.2 washout shown; full set in session log):

```sql
-- §5.1 the standing free-choice bowl (the reframing)
select method, active_from, active_until, f.brand, f.product_name
from feeding_arrangements fa left join food_items f on f.id = fa.food_item_id
where fa.pet_id = :pet and fa.deleted_at is null order by active_from;

-- §5.2 chicken washout: no contrast anywhere
with vom as (select occurred_at vts from events
             where deleted_at is null and event_type='vomit' and pet_id = :pet),
     feed as (select e.occurred_at fts, lower(f.primary_protein) protein
              from events e join meals mm on mm.event_id=e.id
              left join food_items f on f.id=mm.food_item_id
              where e.deleted_at is null and e.event_type='meal' and e.pet_id = :pet)
select count(distinct (fts at time zone 'America/Chicago')::date)
         filter (where protein like 'chicken%')                      as chicken_days,
       count(distinct (fts at time zone 'America/Chicago')::date)      as total_days,
       (select count(*) from vom v where exists (
          select 1 from feed f where f.protein like 'chicken%'
            and f.fts <= v.vts and f.fts > v.vts - interval '24 hours')) as vomit_windows_with_chicken,
       (select count(*) from vom)                                      as vomit_windows;

-- §4.3 nearest preceding feeding before each vomit (post-prandial timing + confidence gate)
with v as (select occurred_at vts, occurred_at_confidence conf from events
           where deleted_at is null and event_type='vomit' and pet_id = :pet),
     m as (select e.occurred_at mts, f.food_type, f.brand, f.product_name
           from events e join meals mm on mm.event_id=e.id
           left join food_items f on f.id=mm.food_item_id
           where e.deleted_at is null and e.event_type='meal' and e.pet_id = :pet)
select v.vts at time zone 'America/Chicago' vomit_ct, v.conf,
       round(extract(epoch from (v.vts - p.mts))/60) mins_since_eat, p.food_type, p.brand
from v left join lateral
  (select * from m where m.mts <= v.vts order by m.mts desc limit 1) p on true
order by v.vts;

-- §5.3 / §6② daily meal-intake mean (WSAVA 0–4); recent days sit at/above the low ~2.06 baseline
select (e.occurred_at at time zone 'America/Chicago')::date d, count(*) rated_meals,
       round(avg(case mm.intake_rating when 'refused' then 0 when 'picked' then 1
                  when 'some' then 2 when 'most' then 3 when 'all' then 4 end), 2) mean_score
from events e join meals mm on mm.event_id = e.id
left join food_items f on f.id = mm.food_item_id
where e.pet_id = :pet and e.event_type='meal' and e.deleted_at is null
  and f.food_type='meal' and mm.intake_rating is not null
group by 1 order by 1;
```

The live-engine observation in §6 is the `ai_signals` row (`generated_at = 2026-06-16 17:23`, findings ⑥ + ③). Engine-behavior claims in §6 were verified against `supabase/functions/generate-signal/detection.ts` via the `adversarial-reviewer` subagent, and §6's explanations were corrected per its findings — notably ⑤'s denominator-floor mechanism (not "two independent locks") and ②'s no-recent-decline reason (not "baseline dilution").

---

*Append-only. If the engine architecture changes or another re-run is done on fresh data, write a new brief; do not overwrite this one.*
