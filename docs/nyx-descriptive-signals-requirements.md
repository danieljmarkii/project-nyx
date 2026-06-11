# Nyx — Descriptive Timing & Diet-Structure Signals Requirements

**Status:** rev 2 — Phases 1–2 BUILD-READY (PM decisions §9.1/§9.2 made 2026-06-11); Phase 3 placement open pending mockup (§9.3)
**Owner build step:** Step 10 evolution (AI Signal — descriptive lane)
**Created:** 2026-06-11 · **Revised:** 2026-06-11 (rev 2 — PM review + literature check)
**Extends:** `docs/nyx-ai-signal-requirements.md` (the §-references below are to that doc unless noted)

> Output of the 2026-06-11 product-team reflection on the Fable 5 re-run brief
> (`docs/research/2026-06-fable-signal-engine-rerun.md` §4/§6.4). Read alongside the
> parent requirements doc, the re-run brief, and the clinical-guardrails skill.

---

## 1. Purpose & origin

The Fable 5 re-run surfaced three patterns on real data that the live engine could not
represent — and all three are **deterministically computable**. No model, no inference:
every input is a per-event observed fact, and every claim is a count with its
denominator attached.

1. **Rapid post-prandial timing** — 4 of 14 vomit episodes ≤15 min after eating,
   including the last two (brief §4.1/§6.4a). Clinically useful as **anamnesis, not
   diagnosis**: timing-to-meal is a standard GI-history item a vet will ask about, and
   regurgitation classically presents "soon after eating" (Merck Vet Manual,
   megaesophagus/esophagitis) — but per Clinician's Brief, timing relative to feeding
   is *not* by itself a regurgitation-vs-vomiting differentiator (mechanism, retching,
   bile and food state are). The card therefore reports the pattern and routes it to
   the vet conversation; it never implies a mechanism. (Literature check 2026-06-11,
   sources in §9.2.)
2. **Time-of-day clustering** — episodes concentrated in one band of the day (the
   adjacent pattern the team ranked third; classic example is early-morning
   empty-stomach/bilious vomiting — a feeding-schedule conversation).
3. **Diet-structure observations** — the June meal-type collapse: 6 of the last 10 days
   with zero meal-type food against 5–10 treats/day (brief §2/§6.4c).

This spec defines the **deterministic descriptive lane**: two new detectors —
**⑤ `postprandial_timing`** and **⑥ `timeofday_clustering`** — plus a
**diet-structure observation** card, all under the same architecture-B contract as
①–④: pure detection in `detection.ts`, structured findings, template-only copy,
honesty floors, adversarial review mandatory.

**What this spec is not.** It does not touch — and does not resolve — the open
emerging-signals question. The boundary is bright: everything here is a *descriptive
count of observed facts about timing and structure*. Anything asserting a
*food→symptom relationship* below detector ①'s floors (e.g. the Temptations 3/52 vs
2/162 pattern, brief §4.3) stays out, full stop. That remains the live PM ↔ team
disagreement in CLAUDE.md's Open Questions.

### 1.1 The lane's inclusion rule (governs future candidates too)

A finding qualifies for the descriptive lane iff **all five** hold:

- **(a)** every input is a per-event observed fact — no inference, no model;
- **(b)** the aggregate is a count or ratio **with its denominator attached**;
- **(c)** Dr. Chen confirms it changes a triage conversation;
- **(d)** copy is descriptive/associational, escalates or observes, **never reassures,
  never claims cause**;
- **(e)** it is robust to the log's known honesty gaps — timestamp confidence (B-010),
  free-feeding (B-040), soft deletes, logging gaps.

(e) is where naive versions of these detectors die; §3–§5 are mostly about (e).

---

## 2. Shared rules (all three)

- **Pure detection, registry entries.** Each is a `Detector` in `DETECTOR_REGISTRY`;
  findings ride the existing `ai_signals.findings` jsonb. **No schema migration.**
- **Template-only phrasing — the LLM is never in the loop.** Same rationale as ③/④
  (B-051 adversarial review): these are count statements; the model adds little warmth
  and real drift risk. `templateForFinding` + `validatePhrasing` branches per type;
  `validatePhrasing` blocks causal and reassuring language on all three.
- **No evidence-tier badge.** Per §6 of the parent doc, a deterministic fact doesn't
  wear a confidence tag — it shows its sample size. Counts and denominators appear in
  the card copy and the tap-to-expand evidence.
- **Never reassure.** Absence of a timing cluster, a clean diet structure, or a
  below-floor result is **silence**, never an all-clear (§9). No detector here may emit
  a "looks normal" variant.
- **Insight class, cap-subject.** All three are `priorityClass: 'insight'` — none is
  time-urgent the way intake-decline/worsening are; they enrich the vet conversation.
  They rank in band 2 (after safety and the context-lead), ordered ⑤ → ⑥ →
  diet-structure, all above reflection ③. They count against the §3.2 visible-card cap.
- **One card per detector** (the most recent/strongest instance) — calm surface over
  completeness, matching ③/④.
- **Vet report (Step 9 consumer).** All three findings are vet-report-grade in exactly
  the form Fable's §4.2 vet summary used them ("4/14 episodes post-prandial ≤15 min";
  "meal-type feeding sparse in June"). The structured payloads are designed so Step 9
  can render them without recomputation. Out of scope here; noted as the contract.
- **Timestamp-confidence eligibility (B-010), the load-bearing gate:**
  - A **symptom episode** is *timed-eligible* only when its onset event carries
    `occurred_at_confidence = 'witnessed'`. `estimated`/`window`/`NULL` are ineligible —
    a windowed `occurred_at` is the **latest edge**, not an observation, and legacy NULL
    deliberately means *unknown* (B-010 resolution: no blanket backfill). A discovered
    vomit can never be "12 minutes after eating."
  - A **feeding** is *timed-eligible* when its confidence is `'witnessed'` **or NULL**.
    Meals are inherently witnessed and every entry point now writes `'witnessed'`
    (`lib/meals.ts`); legacy NULL meal rows carry the same semantics. This mirrors the
    existing `attributionConfidence` absent→`'high'` precedent.
- **Free-feeding (B-040):** while an active `free_choice` arrangement overlaps an
  episode, the pet may have eaten at any moment — "minutes since last *logged* feeding"
  is fiction. Such episodes are **ineligible** for ⑤ (excluded from numerator *and*
  denominator). ⑥ and diet-structure interactions are in their own sections.
- **Episode collapsing:** all episode counting reuses `toEpisodeOnsets`
  (`symptomEpisodeGapHours`, 3h) — re-logs of one bout never inflate a count. The
  onset event's confidence is the episode's confidence.

### 2.1 Engine input changes (additive, shared)

```ts
// detection.ts — additive optional fields; absent ⇒ today's behavior unchanged
SymptomEvent.occurredAtConfidence?: 'witnessed' | 'estimated' | 'window' | null
MealEvent.occurredAtConfidence?:    'witnessed' | 'estimated' | 'window' | null
DetectionInput.timezone?: string    // IANA, e.g. 'America/New_York' — Phase 2 (⑥) only
```

`index.ts` adds `occurred_at_confidence` to both event selects, and (Phase 2) fetches
`user_profiles.timezone` for the caller (RLS-scoped, own row). Detectors ①–④ ignore
the new fields — their behavior is byte-identical.

---

## 3. Detector ⑤ — `postprandial_timing` (Phase 1)

### 3.1 Claim shape

> "4 of the 12 vomiting episodes we could time happened within 30 minutes of eating —
> including the last two. That timing is worth mentioning to your vet."

Strictly descriptive: each episode's minutes-since-last-feeding is an observed fact;
the aggregate is a count over the **timed-eligible** denominator (never the raw episode
count — "4 of 12 we could time" is honest where Fable's free-prose "4 of 14" was not
quite). Exact strings resolved at build via the nyx-voice pass; the *facts* available
to the template are fixed by the payload (§3.4).

### 3.2 Definitions

- **Eligible episode:** witnessed onset (§2) · no active free-feeding overlap (§2) ·
  within `windowDays` of now · has ≥1 timed-eligible discrete feeding (any `foodType` —
  treats are exactly the relevant feedings) logged in the preceding 24h (else
  "time since feeding" is undefined and the episode leaves the denominator).
- **Rapid episode:** eligible, and the **nearest preceding** timed-eligible feeding is
  ≤ `rapidWindowMinutes` before onset. Nearest-preceding is the *correct* semantics for
  a timing claim — the May "nearest-preceding meal" attribution bug was about blaming a
  *food identity*, which this claim deliberately does not do (§9 decision 1).

### 3.3 Floors — all must pass

| Floor | Default | Why |
|---|---|---|
| `minRapidEpisodes` | 3 | mirrors the §7 ≥3-episode philosophy; 2 is an anecdote |
| `minEligibleEpisodes` — **the denominator floor** | 6 | "N of M" needs a real M. Added by the B-078 adversarial review (see below): the grazing guard scales with `eligibleCount`, so at a tiny denominator it collapses to `minRapidEpisodes` and a grazer's few coincidental rapid vomits fire. Matches detector ⑥'s `minEligibleEpisodes` ("below this any cluster is a coin run"). |
| `minRapidFraction` | 0.25 | 3 rapid out of 30 timed episodes is noise, not a pattern |
| `recencyDays` (≥1 rapid episode within) | 14 | a stale cluster shouldn't lead today's surface |
| `minObservedToExpectedRatio` — **the grazing guard** | 2 | see below |
| `rapidWindowMinutes` | 30 | **science-anchored, not data-anchored** (PM directive §9.2): operationalizes the literature's "soon/shortly after eating" band (minutes to ~1h); deliberately NOT tuned to the dogfood cat's observed ≤15-min episodes |
| `windowDays` (analysis window) | 60 | bounds the denominator to the current era of the pet's life |

Because the window is a *descriptive bucket*, not a clinical threshold (none exists in
the literature — §9.2), the payload always carries `medianMinutesSinceFeeding` so the
evidence expansion and the vet report show the **actual** observed timings, never just
the bucket membership.

**The grazing guard (Data Scientist, load-bearing).** A frequently-fed pet is "within
15 minutes of eating" much of the day by chance. Deterministic correction, no
hypothesis test: compute `feedingRatePerDay` = timed-eligible discrete feedings ÷
distinct logged days (in-window), then

```
expectedRapid = eligibleEpisodes × min(1, feedingRatePerDay × rapidWindowMinutes / 1440)
fire only if rapidCount ≥ max(minRapidEpisodes, minObservedToExpectedRatio × expectedRapid)
```

Calibration on the brief's real data at the 30-min window: ~8 feedings/day → chance ≈
16.7%, expected ≈ 2.0 of 12, threshold = max(3, 4.0) = 4 → observed 4 **fires** (at
exactly the bar — the guard is doing real work). An extreme 20-treat/day grazer with the
brief's shape (4 rapid of 14): chance ≈ 42%, expected ≈ 5.8 of 14, threshold ≈ 12 → 4
observed **does not fire**.

**Limitation — the guard is a relative check with a small-sample residual (B-078
adversarial review, accepted by PM 2026-06-11).** The `2× expected` rule scales with
`eligibleCount`, so at a *small* denominator it collapses to the `minRapidEpisodes` count
floor. A grazer with only ~3 witnessed vomits that all happen to land near a graze
therefore fires on a ~7% base-rate coincidence — and the §7 golden ("4 of 12") is itself
only a ~6% pattern, so **no fixed threshold can fire the golden while suppressing a
same-strength grazer** (a proper binomial tail confirms they are statistically
indistinguishable). The earlier claim that "Sam's grazing cat *cannot* trip this by base
rate" was therefore only true at large `eligibleCount`. **The residual is not eliminated
by the floor, only its smallest-N tail.** A re-review sweep of the regime *above* the
floor found the worst firing coincidence is **~13–17%**, not ~7%: a *normal* 8–12
feeds/day cat (not an extreme grazer) with 3 rapid of 6–8 timed episodes by chance still
fires (e.g. eligible=8 at 8 feeds/day ≈ 13.5%; eligible=6 at 12 feeds/day ≈ 17%). At ~20
feeds/day the multiplicative guard re-asserts and the firing coincidence drops back to
1–5%. A future tuner should anchor to the ~13–17% worst case, **not** the ~7% break figure.
Two mitigations, not a cure: (1) the `minEligibleEpisodes` denominator floor (above)
removes the smallest-N cases the review broke on; (2) the residual above the floor is
**accepted** for v1 because the card is descriptive ("worth mentioning to your vet"),
never reassures, and never claims a cause or mechanism — its worst case is a mildly noisy
timing card routed to a vet conversation, not a false all-clear or a missed safety flag. The thresholds (`minEligibleEpisodes`,
`minObservedToExpectedRatio`, `rapidWindowMinutes`) are **tuned on real data per §7 +
B-081**, where the live false-positive rate can be measured — a tighter separation test
(e.g. a binomial-tail bar like detector ①'s McNemar, with a recalibrated golden) is the
documented next step if the residual proves too noisy.

### 3.4 Finding payload

```ts
interface PostprandialTimingFinding extends FindingBase {
  type: 'postprandial_timing'
  priorityClass: 'insight'
  symptomType: SymptomType
  rapidCount: number          // episodes ≤ rapidWindowMinutes after a feeding
  eligibleCount: number       // the honest denominator (timed-eligible episodes)
  totalEpisodes: number       // all episodes in-window, so evidence can say "of 14 total, 12 could be timed"
  rapidWindowMinutes: number
  lastTwoEligibleRapid: boolean  // powers "including the last two" — recency salience
  medianMinutesSinceFeeding: number // of the rapid episodes; evidence/vet-report detail
  feedingFormsInEvidence: string[]  // e.g. ['dry treat'] — EVIDENCE/vet-report ONLY in v1, never the claim (§9.1)
  associationalOnly: true
  windowDays: number
}
```

### 3.5 Guardrails specific to ⑤

- The owner-facing claim names **timing only** — never a food, brand, protein, or
  (v1, provisional §9.1) form. Food labels/forms ride `feedingFormsInEvidence` for
  tap-to-expand and the vet report, where Dr. Chen's regurgitation-differential context
  lives.
- Never causal ("happened within 15 minutes of eating", never "eating causes") and
  never diagnostic ("regurgitation" is the vet's word, not the card's).
- Never inverted: no "episodes don't seem meal-related" on a below-floor result.

---

## 4. Detector ⑥ — `timeofday_clustering` (Phase 2)

### 4.1 Claim shape

> "5 of Nyx's 8 vomiting episodes have happened between 4 and 7 in the morning —
> a pattern worth mentioning to your vet."

### 4.2 Local time is the whole point — and a new dependency

Timestamps are stored UTC (hard constraint); "4–7am" only means something in the pet's
local day. `DetectionInput.timezone` (IANA, from `user_profiles.timezone`) converts
onset instants to local hour-of-day via `Intl.DateTimeFormat` (portable: Deno Edge +
Node test runner, no new dependency). **Absent/invalid timezone ⇒ detector ⑥ is
silent** — never guess UTC. DST is absorbed by per-instant conversion; the residual
(an owner who logged across a relocation) is accepted and documented.

### 4.3 Method — deterministic windowed scan, not circular statistics

Over witnessed-eligible episode onsets in `windowDays`: slide a `clusterWindowHours`
window around the 24h circle in 1h steps (24 positions, wrap-around); take the
max-count window. Fire when **all** pass:

| Floor | Default | Why |
|---|---|---|
| `minEligibleEpisodes` | 6 | below this, any "cluster" is a coin run |
| `minClusterEpisodes` | 4 | the cluster itself needs real mass |
| `minClusterFraction` | 0.5 | half of all episodes in a 4h window ≈ 3× the 16.7% uniform base rate |
| `clusterWindowHours` | 4 | wide enough to be robust to ±1h logging slop, narrow enough to mean something |
| `windowDays` | 60 | same era-bounding as ⑤ |

The fraction floor is the chance guard, but 24 window positions are an implicit
multiple-comparison; the floors are deliberately conservative and **the property test
in §7 is a required, not optional, part of the build**: ≥1,000 uniform-random fixtures
at n=6..10 must fire ≪5%.

### 4.4 Interaction with ⑤ — mutual exclusion, ⑤ wins

A post-prandial vomiter on a fixed feeding schedule clusters by clock trivially — ⑥
would re-state ⑤'s pattern as a clock pattern. **Curation rule: if ⑤ fires for a
symptom type, ⑥ is suppressed for that type.** ⑥'s clinical value is highest exactly
when episodes are *not* meal-adjacent (the empty-stomach early-morning case). Residual
accepted: a schedule-fed pet whose feedings are timestamp-ineligible could still
surface a true-but-mechanistically-ambiguous clock cluster; the claim asserts only the
clock facts, so it survives (the claim is honest even when the mechanism is unknown).

### 4.5 Payload

```ts
interface TimeOfDayClusteringFinding extends FindingBase {
  type: 'timeofday_clustering'
  priorityClass: 'insight'
  symptomType: SymptomType
  clusterStartLocalHour: number  // 0–23, pet-local
  clusterWindowHours: number
  clusterCount: number
  eligibleCount: number          // honest denominator (witnessed, in-window)
  totalEpisodes: number
  timezone: string               // the IANA zone the claim was computed in
  associationalOnly: true
  windowDays: number
}
```

Copy renders the band in plain local words ("between 4 and 7 in the morning"), counts
attached, never causal, never a "bilious" or any mechanism word.

---

## 5. Diet-structure observations (Phase 3)

### 5.1 What and where — placement OPEN pending mockup (§9.3)

Two observations, **one card max** (`diet_structure` finding, band 2 after ⑥):

- **(a) Meal-type collapse:** "On 6 of the last 10 days, no meal was logged for Nyx —
  just treats. If that matches what she actually ate, it's a diet picture worth
  sharing with your vet."
- **(b) Diet churn:** "3 new foods first appeared this week while Nyx's symptoms are
  active — every new food makes patterns harder to spot."

The team's 2026-06-11 session flagged the lane question (Signal card vs B-053
coverage lane) and a voice risk: these describe the **owner's feeding/logging
behavior**, not the pet, and must never read as judgment. **Placement is an open PM
decision pending a mockup** (§9.3) — this section is written placement-agnostic
(detector, floors, suppression and payload are identical in either lane). Whichever
lane wins, the Designer + nyx-voice pass on the final strings is a **blocking** DoD
item for Phase 3: if the strings can't be made observational-and-warm, they don't ship
in either lane.

Honesty device, non-negotiable (Dr. Chen + Trust): the collapse copy must acknowledge
the log-only view ("if that matches what she actually ate") — the engine cannot know
whether unlogged meals exist, and must not imply it does.

### 5.2 Definitions & floors

**(a) Meal-type collapse** — over `windowDays: 10`:
- A **gap day** = ≥`minTreatsPerGapDay: 2` treat-type feedings AND 0 meal-type
  feedings. A day with **no logging at all is NOT a gap day** — "didn't log" must never
  masquerade as "fed only treats" (the ④ fake-rise guard's sibling).
- Fire at ≥`minGapDays: 5` gap days, AND classification coverage ≥`minClassifiedFraction:
  0.8` of in-window feedings carrying non-null `foodType` (else the meal/treat split
  itself is unreliable — composes with B-070's treats-vs-meals modeling).
- **Suppressed while a diet trial is active** (the trial dictates the diet's structure;
  same rationale as staple-washout). Never co-rendered with a `staple_washout`
  diagnostic (overlapping diet-shaped messages = nagging).

**(b) Diet churn** — over `churnWindowDays: 14`:
- Fire at ≥`minNovelFoods: 3` distinct `food_item_id` *first-ever* exposures in-window
  AND ≥`minSymptomEpisodes: 2` episodes (any correlation type) in the same window —
  without active symptoms, "hold the diet steady" is unsolicited diet advice.
- **Suppressed on diet-trial pets** (a vet-directed novel-protein switch *is* new food;
  the card would contradict the vet). Suppressed if (a) fired (one structure card max;
  collapse outranks churn).
- This is the productization of brief §6.5: the owner's most natural sick-pet response
  (try new foods) structurally reduces what the engine can ever conclude, and nothing
  in the product says so today.

### 5.3 Payload

```ts
interface DietStructureFinding extends FindingBase {
  type: 'diet_structure'
  priorityClass: 'insight'
  observation: 'meal_type_collapse' | 'diet_churn'
  windowDays: number
  // meal_type_collapse
  gapDays: number | null
  loggedDays: number | null        // honest denominator: days with any logging
  treatsPerDayMedian: number | null
  // diet_churn
  novelFoodCount: number | null
  symptomEpisodesInWindow: number | null
}
```

---

## 6. Ranking & curation changes

`priorityBand` additions (band numbers unchanged for ①–④):

- `postprandial_timing`, `timeofday_clustering`, `diet_structure` → **band 2**, ordered
  within-band: correlations (tier → effect) → ⑤ → ⑥ → diet-structure. Reflection ③
  stays band 3 (last).
- Curation: ⑤ suppresses ⑥ per symptom type (§4.4); collapse suppresses churn (§5.2);
  all three are cap-subject (insight class). Safety findings are untouched.

---

## 7. Acceptance criteria & required fixtures (QA + adversarial review)

Per phase: `tsc`/`deno check` clean, unit tests green, **and a mandatory
`adversarial-reviewer` falsification pass naming the counterexamples tried** (DoD —
this is exactly the load-bearing class the 2026-05-30 rule exists for).

**⑤ must pass:**
1. Golden fixture (the brief's shape): ~12 timed episodes, 4 rapid incl. last two,
   ~8 feedings/day → fires; payload counts exact.
2. Discovered vomit (`estimated`/`window`/NULL confidence) → excluded from numerator
   AND denominator.
3. Episode overlapping an active `free_choice` arrangement → ineligible.
4. 20-treat/day grazer, 4 rapid of 14 → **silent** (grazing guard). NOTE: this only
   exercises the guard at *large* `eligibleCount`; the small-N case is fixture 9.
5. 3 rapid episodes all >30 days old → silent (recency).
6. Legacy NULL-confidence *meal* → still a valid feeding (witnessed semantics).
7. Re-logged single bout (3 rows in 2h) → one episode.
8. `validatePhrasing` rejects causal/reassuring/food-naming/**mechanism** sentences for the type.
9. **(adversarial regression, B-078)** Grazer with only 3 witnessed vomits all near a
   graze → **silent** via the `minEligibleEpisodes` denominator floor (the §3.3 guard
   alone fires here — see the §3.3 limitation note). Plus the floor boundary: 5 timeable
   episodes → silent, 6 → fires.

**⑥ must pass:**
1. Golden fixture: 8 witnessed episodes, 5 in a 4h local band → fires with correct
   local hours for a non-UTC timezone (e.g. `America/New_York`, including a DST-crossing
   set).
2. Property test: ≥1,000 uniform-random onset fixtures (n = 6..10) → fire rate ≪5%.
3. Missing/invalid timezone → silent.
4. ⑤ fires for the same symptom type → ⑥ suppressed.
5. Wrap-around cluster (23:00–03:00) detected correctly.

**Diet-structure must pass:**
1. Golden collapse fixture (6 of 10 days treats-only, logging present) → fires.
2. Dark days (no logging) → never counted as gap days; 6 dark + 4 mixed days → silent.
3. Unclassified foods >20% → silent (classification floor).
4. Active diet trial → both observations silent.
5. Churn without symptoms in-window → silent.
6. Collapse + churn both true → one card (collapse).
7. Copy fixture: collapse string contains the log-only acknowledgement.

---

## 8. Build plan — three gated PRs, in PM-stated order

| Phase | PR contents | Notes |
|---|---|---|
| **1 — ⑤ post-prandial timing** | `detection.ts` (detector + config + types), confidence plumbing (`index.ts` selects, input mapping), `phrasing.ts` templates + validation, client mirror (`lib/signal.ts`, `lib/signalCopy.ts`, `InsightCard`), tests | No migration. Deploy = redeploy `generate-signal`. |
| **2 — ⑥ time-of-day clustering** | detector + `timezone` plumbing (`user_profiles` fetch), templates, tests incl. property test | Depends on Phase 1's confidence plumbing only. |
| **3 — diet-structure** | detector + templates + tests; **Designer/nyx-voice ship-gate on final strings** | **Prerequisite: §9.3 placement decision (mockup → PM call).** Composes with B-070 (treats-vs-meals denominator) — reconcile if B-070 lands first. |

Each phase is independently shippable and independently valuable; nothing in 2/3
blocks 1.

---

## 9. Decisions

### PM-decided (2026-06-11, rev 1 review)

1. **RATIFIED — ⑤ owner-copy names timing only; food form rides evidence/vet report.**
   The session's one genuine conflict: Data Scientist (timing-only claim; with 5–10
   treats/day the nearest feeding is a treat by base rate — naming form re-enters the
   attribution trap) vs Dr. Chen (dry-vs-wet form matters to the esophageal-vs-gastric
   conversation). PM ratified **timing-only on the card**; `feedingFormsInEvidence`
   carries form into tap-to-expand + the vet report. The 2026-06-11 literature check
   (below) retroactively strengthens this: timing isn't a differentiator either, so the
   card claims neither timing-as-diagnosis nor form-as-diagnosis — it reports a pattern
   for the vet to interpret.
2. **`rapidWindowMinutes` = 30 — science-anchored, not data-anchored (PM directive).**
   The PM explicitly declined to set the window from their own cat's observed ≤15-min
   episodes ("I don't want to anchor the app just on my cat's data"). Literature check
   2026-06-11: no canonical minute cutoff exists; regurgitation classically presents
   "soon after eating" with owner-facing sources converging on **minutes to ~1 hour**
   ([Merck Vet Manual — esophageal disorders](https://www.merckvetmanual.com/dog-owners/digestive-disorders-of-dogs/disorders-of-the-esophagus-in-dogs),
   [VIN Veterinary Partner](https://veterinarypartner.vin.com/default.aspx?pid=19239&id=4952781)),
   and per [Clinician's Brief](https://www.cliniciansbrief.com/article/regurgitation-or-vomiting)
   *"timing of the episodes in relation to feeding … [is] not [a] distinguishing
   factor"* between regurgitation and vomiting. Consequences: (a) 30 min
   operationalizes the literature band's conservative end without Nyx-anchoring;
   (b) the window is a descriptive bucket, so the payload always carries the actual
   median minutes (§3.3); (c) the claim's clinical rationale is anamnesis ("a timing
   pattern the vet will want to know"), never mechanism (§1.1) — copy implying
   "regurgitation" or "eating speed" is a `validatePhrasing` failure. §7's
   tune-on-real-data rule still applies to the number itself.

### Open (PM, before Phase 3 only — Phases 1–2 are unblocked)

3. **Diet-structure surface placement — pending a mockup.** PM (2026-06-11): "I need
   more information on this one. Potentially a mockup to better understand." Action:
   produce a Signal-surface mockup showing the diet-structure card in the band-2 stack
   vs the coverage-lane alternative (precedent: the free-feeding HTML/PNG mockups in
   `docs/mockups/`), then decide. §5 is written to be placement-agnostic: the detector,
   floors, suppression rules and payload are identical in either lane; only the
   renderer differs. The Designer/nyx-voice ship-gate applies in both.

### Decided by this spec (team-internal, no PM input needed)

- Template-only phrasing for all three (no LLM) — extends the ③/④ precedent.
- No evidence-tier badges; counts/denominators always shown (§6 parent-doc rule).
- Witnessed-confidence gates exactly as §2 (symptom strict, feeding NULL-tolerant).
- ⑤-suppresses-⑥ mutual exclusion; collapse-suppresses-churn.
- Band-2 insight ranking for all three; never above safety, never below reflection.

---

## 10. Persona sign-off (2026-06-11 session)

- **Data Scientist ✓** — every claim is a count over an explicit eligible denominator;
  the grazing guard and the ⑥ property test are the falsification work pre-built in.
- **Dr. Chen ✓ (conditional)** — descriptive timing/structure facts I'd put in a
  referral note; conditional on: vet report carries `feedingFormsInEvidence` (§9.1),
  no mechanism words in owner copy, collapse copy keeps the log-only acknowledgement.
- **Dir. of Engineering ✓** — pure additive detectors on the existing registry; no
  migration; no new runtime dependency (`Intl` is built in); LLM untouched.
- **Designer ✓ (conditional)** — band-2 cards fit the curated-stack model; holds the
  Phase 3 ship-gate on diet-structure strings; ⑤'s two-idea copy gets the "why this
  matters" detail behind tap-to-expand, not on the card.
- **QA ✓** — fixtures in §7 enumerated before build; AC pasted at each phase kickoff.
- **Trust & Safety ✓** — computed counts only, no new data classes, no raw-log AI
  reads; cleaner than the emerging-signals proposal this grew out of.
- **Jordan ✓** — "4 of 12 right after eating" is something I'd literally repeat to the
  vet; **Sam ✓ (conditional, revised 2026-06-11)** — the grazing guard + the
  `minEligibleEpisodes` denominator floor mean Pixel's all-day nibbling can't trip a card
  on a *handful* of coincidental vomits; the small-sample residual above the floor (§3.3
  limitation) is accepted for v1 and tuned on real data (B-081), because the card is a
  descriptive "mention to your vet", never a scary all-clear or a causal claim.

---

*Tier-2 doc: versioned product artifact. Edits require PM confirmation; tuning the §3/§4/§5
config defaults against real data does not (parent doc §7 / decision (b)).*
