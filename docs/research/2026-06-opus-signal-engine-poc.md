# Opus 4.8 vs. the Deterministic Signal Engine — A Dogfood PoC

**Date:** June 2026
**Prepared for:** Nyx product team
**Lenses:** Sr. Data Scientist (lead), Veterinarian — Dr. Alex Chen, Dir. of Engineering, Trust & Safety / Privacy
**Scope:** What a frontier general model (Opus 4.8) produces when handed one pet's *full structured log*, compared head-to-head against the deterministic `generate-signal/detection.ts` engine on the **same data**. A methodology capture, not a model bake-off.
**Status:** Point-in-time capture of a proof-of-concept run. **Not a product decision.** The architecture idea it surfaces is logged as an Open Question / backlog item, not adopted here.

> **Data note.** This brief analyses **real dogfood data** — the PM's own cat, "Nyx" — as it existed in the production database on 2026-06-08. Counts are a point-in-time snapshot and will have drifted with continued logging. This is identifiable pet-health data in the PM's own private repo, captured with the PM's explicit request. See §7 (Trust & Safety) for why this method does **not** transfer to other users' data unchanged.

---

## 1. Trigger

The PM asked, in essence: *our Signal standard is rigorous and statistics-based — if we ran the same data through Opus 4.8, would it tell us something different, or more informative?* This brief is the recorded answer to that question, run as a four-step PoC: (1) develop a prompt, (2) pull the data from Supabase, (3) expose it to Opus 4.8, (4) compare against what the deterministic engine actually emitted.

---

## 2. The baseline being compared against

`supabase/functions/generate-signal/detection.ts` is a **pure, deterministic** detection engine. It is genuinely rigorous:

- A **symptom-anchored case-crossover** design — each symptom episode is a "case" compared against a time-of-day-matched control window from a symptom-free day for the same pet.
- An **exact McNemar test** on the discordant matched pairs (the statistically correct test for this matched design; a pooled Fisher would be biased).
- **Bonferroni correction** over the family of (protein × symptom) comparisons.
- **Evidence tiers** (Early / Established) with sample-size floors, an effect-size floor (risk difference), and a discordant-pair coincidence guard.
- **Attribution capping** — a shared/free-fed bowl in a multi-pet home degrades a finding to Early, never Established.
- Hard **clinical guardrails**: intake decline is never softened to "picky"; a single sample may escalate on a red flag but never reassures on its absence; absence of symptoms is never wellness.

Three detectors run independently and a ranking layer composes them: ① food→symptom correlation, ② intake-decline safety flag, ③ symptom-count reflection (descriptive, flat-or-improving only).

**This brief is not a criticism of that engine.** Within each detector, it behaved correctly on this data. The finding is about what the *architecture* — independent detectors + a calm ranking layer — can and cannot see.

---

## 3. Method

### 3.1 The prompt developed for the Opus read

A system prompt that mirrors the engine's job but exploits what an LLM can do that a per-detector pipeline cannot — read the *whole animal at once, across signal types* — while inheriting Nyx's two safety invariants verbatim so it cannot drift into reassurance:

> You are a feline/canine health-pattern reviewer for Nyx. You receive one pet's full structured log (species, age, conditions, every meal with protein + intake rating, every symptom with timestamp, and any per-incident photo reads). Produce a clinical-grade *gestalt* read for the owner and a vet-facing summary. **Two non-negotiable rules:** (1) **n=1 / absence never reassures** — escalate on the presence of a red flag, never reassure on its absence; a quiet week is not wellness. (2) **Intake is not preference** — declining/refusing food is a disease signal, never "picky." State associations as associations, never causation. Separate what the data *shows* from what it *cannot rule out*. Name your own blind spots. End with one specific next action.

### 3.2 Data pulled, and the soft-delete contract

All extraction filtered `deleted_at IS NULL` on the `events` table. This is **load-bearing**, and the PoC accidentally produced the cleanest demonstration of why (see §6.2): on this pet, **41 of 54 vomit events were soft-deleted**, along with all diarrhea/itch/lethargy. An unfiltered read would have reported ~4× the vomiting plus three phantom symptom types. The soft-delete flag lives on `events`, not `meals`, so meal/intake extraction joined `meals → events` and filtered on the event.

### 3.3 Dataset snapshot (live rows, as of 2026-06-08)

| | Live | Soft-deleted |
|---|---|---|
| meal events | ~200 | 57 |
| vomit events | ~13 | 41 |
| diarrhea / itch / lethargy | 0 | 9 |

- **Subject:** "Nyx" — ♀ American Shorthair, ~2.75 yr, 4.4 kg. No recorded conditions, no active diet trial.
- **Symptom picture:** vomiting only — **~13 episodes over 26 days (2026-05-14 → 06-08)**, roughly every other day. 24 per-incident photo reads.
- **Diet:** **treat-dominated and extremely varied** — 9+ distinct proteins (chicken, tuna, lobster, turkey, ocean whitefish, duck, rabbit, beef, lamb). Each 24h window before a vomit contained 5–9 treats but only 0–3 actual `food_type='meal'` rows.
- **Intake variance:** 5 `refused`, 4 `picked`, 11 `some` — but mostly on **treats**, which detector ② excludes by design.

---

## 4. What each system said about the same cat

### 4.1 The deterministic engine's entire live output

A single card — the gentlest of the three layers:

> *"We've logged 1 episode of vomiting for Nyx this week, down from 4 last week."* — a `reflection`, `direction: improving`.

Correlation (①) was silent and intake-decline (②) was silent. **Both silences were correct given the architecture:**

- **① washed out** because chicken appears before nearly every vomit *and* on nearly every calm day — there is no clean dietary contrast anywhere in the log, so a case-crossover structurally cannot implicate any protein. (This is the design working: a constant staple is *supposed* to wash out.)
- **② stayed silent** because the refusals were almost all on `treat`-type rows, which the intake baseline excludes so a logging gap can't masquerade as anorexia.

### 4.2 Opus 4.8's read

- **Headline:** chronic recurrent vomiting in a *young* cat — ~13 episodes in 26 days — against an extraordinarily chaotic, treat-heavy diet that is itself a leading plausible driver and a confound for any single-ingredient logic.
- **Cross-signal synthesis the engine's independent detectors couldn't make:** the 2026-05-30 double-vomit (`repeated_vomiting`, *worth a call*) co-occurred with an intake collapse across 05-27→05-31 (refusals + picking on both meals and treats). *Going off food and vomiting in the same window* — the intake-is-not-preference invariant firing in real life, invisible to ② because the refusals were on treats.
- **A standing risk pulled from a photo read:** 2026-05-18 flagged suspected **foreign material** (toy-ball-like objects) → pica / foreign-body risk in a cat who is also vomiting.
- **Honest about its own blind spot:** it *also* found no single culprit protein, but said *why* (no dietary contrast) and what would fix it (simplify the diet), rather than going silent.
- **Refused the reassuring frame:** "improving" buries the clinically dominant fact (chronic q2-day vomiting). As of 2026-06-08 the "calm week" had already broken with a fresh same-day episode.

---

## 5. Head-to-head

| | Deterministic `detection.ts` | Opus 4.8 free-read |
|---|---|---|
| Headline surfaced | "Vomiting down 4→1, improving" | "Chronic q2-day vomiting in a young cat — see a vet" |
| Food→symptom correlation | Silent (chicken washes out — *correct*) | Silent too, **but explains why and what to change** |
| Intake decline | Silent (refusals were on `treat` rows) | Caught the 05-27→31 intake collapse beside the double-vomit |
| Foreign-body / pica | Not modelled | Surfaced from the 05-18 photo read |
| Diet chaos as a driver | Not representable | Named as the leading hypothesis |
| Cross-signal synthesis | None (detectors independent) | The core of the read |
| Statistical discipline | **High** — McNemar, Bonferroni, tiers, washout | **Low** — narrative pattern-matching, no correction, not reproducible |
| Reproducibility / calibration | Deterministic, testable | Non-deterministic, can hallucinate causality |

---

## 6. Findings

### 6.1 The two systems are blind in *opposite* directions

- **`detection.ts` is rigorous but myopic.** Each detector is statistically honest in isolation, but nothing in the architecture says *"step back — this whole animal looks wrong."* A month of recurrent vomiting in a young cat reached the owner as the word **"improving,"** because the composition layer surfaced the calmest true statement available. No individual detector was wrong; the *gestalt* was missing.
- **Opus is holistic but undisciplined.** It reads the whole picture and the cross-signal story, but it has no Bonferroni, no McNemar, no reproducibility, and it pattern-matches toward narrative — exactly how a confident wrong causal story or an over-escalation gets produced. You would **not** want it inventing "it's the duck" from this data.

The restraint in the deterministic engine (washout, treat exclusion, never-reassure-on-absence) is a **feature**, not a gap. The gap is the absence of an organ that reconciles the detectors against the whole animal.

### 6.2 The soft-delete contract is real, load-bearing, and currently unguarded by a test

This pet — more deleted than live symptom events — is the ideal adversarial fixture. If `generate-signal` ever reads an event row without the `deleted_at IS NULL` guard, Nyx flips from ~13 vomits to 54 vomits plus phantom diarrhea/itch/lethargy. The guarantee is currently upheld by the Edge Function's query, not by a test on the detection input contract. (Logged to backlog — see §8.)

### 6.3 Context-window size is not the quality lever here

Nyx's *entire live history* serializes to ~53K characters (~13K tokens) — ~7% of the standard 200K window, ~1.3% of a 1M window. A larger context window raises quality only when input is being truncated, which it is not for per-pet analysis. The levers that produced the quality were **model capability**, **structured input over raw dumps**, **agentic iterative querying**, and **grounding in the engine code + guardrails** — none of which is context size. A 1M window is a *fleet/cohort-scale* tool, not a per-pet one.

---

## 7. Trust & Safety / Privacy

This run was appropriate: the PM's own data, own database, staying in-session, captured at the PM's request into the PM's own private repo. **It does not transfer unchanged to a production feature.** "Pipe a user's full event log to a frontier model per request" means sending identifiable pet-health records to an external service. Before any such feature ships to other users it needs: explicit consent, **data minimisation** (send computed findings + structured counts, *not* raw logs and free-text notes), retention/processing review, and a decision on whether per-incident photo reads may leave the boundary. Logged as an Open Question (§8).

---

## 8. Open questions this raises (decisions, not made here)

These belong in the spec/backlog, not in this brief (per the research-folder contract). Captured here only so they are not lost:

1. **Should the engine gain a bounded "gestalt reviewer" stage?** Idea: keep deterministic detection as the load-bearing floor (it remains the sole decider of whether a *correlation exists*), and add a capability model as a **bounded reviewer** fed only the already-computed findings + structured counts — allowed to do one thing the engine can't: **re-rank / suppress a reassuring frame when the whole-animal picture contradicts a calm card** (here: veto "improving," surface "chronic vomiting"). Never invents a finding; only vetoes a framing. This would be genuine *reasoning*, so — unlike the Haiku phrasing layer (B-001) — it is the one place a more capable, more expensive model could earn its cost. → Open Question for the spec.
2. **Privacy model for any LLM-over-raw-logs feature** (§7). → Trust & Safety Open Question.
3. **Adversarial test fixture: "more deleted than live" pet** against the detection input contract (§6.2). → backlog **B-071**.

---

## Appendix A — Reproducibility

**Subject pet:** `pets.id = bf7b196e-6db1-4a34-af34-f1759d380042` (project `aigchluqluzuhtbfllgh`).

Representative extraction queries (all filter `deleted_at IS NULL`):

```sql
-- Live vs soft-deleted, by event type (the §6.2 demonstration)
select event_type::text,
       count(*) filter (where deleted_at is null)     as live,
       count(*) filter (where deleted_at is not null) as soft_deleted
from events group by event_type order by count(*) desc;

-- Proteins eaten in the 24h before each vomit (case-window reconstruction)
with v as (select occurred_at vts from events
           where deleted_at is null and event_type='vomit'),
     m as (select e.occurred_at mts,
                  lower(regexp_replace(coalesce(f.primary_protein,'(none)'),
                        '\s*(by-product\s*)?meal$','','i')) protein,
                  f.food_type::text ftype, mm.intake_rating::text intake
           from events e join meals mm on mm.event_id=e.id
           left join food_items f on f.id=mm.food_item_id
           where e.deleted_at is null and e.event_type='meal')
select to_char(v.vts,'YYYY-MM-DD HH24:MI') vomit_at,
       string_agg(distinct m.protein, ', ' order by m.protein) proteins_24h_before,
       count(*) filter (where m.ftype='meal')  meals_24h,
       count(*) filter (where m.ftype='treat') treats_24h
from v left join m on m.mts <= v.vts and m.mts > v.vts - interval '24 hours'
group by v.vts order by v.vts;
```

The full prompt is in §3.1.

---

*Append-only. If the engine architecture changes or a re-run is done on fresh data, write a new brief; do not overwrite this one.*
