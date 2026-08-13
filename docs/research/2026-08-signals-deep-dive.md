# The signals engine vs. its own record — an August 2026 deep-dive

**Date:** 2026-08-13
**Status:** 🧊 Frozen point-in-time evidence capture (research brief — see `docs/research/README.md`)
**Method:** Three lanes run in one session: (1) a full code-level map of `generate-signal` as built (every detector, floor, and composition rule, verified against source at commit time); (2) a SQL audit of the live production record — the PM's two real pets plus the demo/test pets — run against the same tables the engine reads; (3) four independent web-research sweeps (statistical prior art, veterinary clinical literature, human-space analog products, pet competitive landscape), each executed by an isolated research agent and integrated here. Fourth entry in the dogfood series (Opus PoC → Fable rerun → vet council → this), but the first to combine a *verified engine map* with a *phenotype-level audit of the live data* rather than a model's gestalt read.

**This brief carries evidence, not decisions.** Candidate capabilities are laid out in §7 with the evidence for and against each; every product call they imply is an Open Question for the PM, not a recommendation ratified here. Per the folder convention, this file is append-only after merge.

---

## §0 Why now, and what question this answers

Step 10 (`generate-signal`) is live: seven deterministic detectors, a reflection layer, coverage diagnostics, and per-incident red-flag surfacing, all behind clinically-conservative floors, with the Haiku layer phrasing only. The Signal/Home design uplift (B-721) is build-ready, which makes *what the cards can say* the next frontier — and three prior research briefs (2026-06 Opus PoC, Fable rerun, vet council) each found the same shape of gap: the engine is rigorous per-lane but blind across lanes, and the strongest clinical signals in the dogfood record were the ones no detector owned. Two of those (worsening ④, time-of-day ⑥) have since shipped; chronicity ⑦ shipped and is now the top live card.

The question this brief answers: **with the engine as-built and three more months of live record, where does the evidence say the next unit of engineering effort buys the most honest clinical signal?** Answered from four directions: what the engine can already say (§1), what the live record contains that it cannot yet say (§2), what methods exist that stay honest at this data scale (§3–§4), and what everyone else does (§5–§6).

---

## §1 The engine as-built (verified against source, 2026-08-13)

Seven detectors plus three auxiliary layers, composed in `detectSignals` (`supabase/functions/generate-signal/detection.ts`, ~4,700 lines; 829 Deno test cases enforced in CI). All floors below are the shipped `DEFAULT_CONFIG` values.

| # | Detector | Core mechanism | Key floors (shipped values) |
|---|---|---|---|
| ① | Food↔symptom correlation | Case/control matched-pair design per protein; per-symptom attribution windows (vomit 12h, diarrhea 24h, itch/scratch/skin 72h); episodes collapse at 3h gaps | Early: ≥3 matched pairs, ≥2 case-only discordant, risk difference ≥0.2. Established: ≥5 pairs + familywise α=0.05 (Bonferroni across the candidate family) |
| ② | Intake decline | Per-food rated-meal baseline → consecutive-days-below | ≥4 rated meals for baseline over 14d; 2 consecutive days below (cats: 1 day at concern ceiling); refusal recency 2d |
| ③ | Reflection (descriptive trend) | Week-over-week episode counts, `improving`/`flat` only | ≥3 episodes in the busier window; ≥3 actively-logged days in BOTH windows (a logging gap can't masquerade as improvement); worsening NEVER stated here (suppressed → owned by ④) |
| ④ | Worsening (safety) | Fires on the exact predicate ③ suppresses (shared `isWorsening` — the "one-way valve into silence" fix from the Fable brief) | worseningMinEpisodes 2; firm tier at symptoms on ≥4 of 7 days (density-anchored, not raw count) |
| ⑤ | Post-prandial timing | Fraction of confidence-eligible vomit episodes ≤30 min after a feeding, with a grazing guard (observed rapid must be ≥2× chance-expected given the pet's feeding rate) | ≥3 rapid, ≥6 eligible, fraction ≥0.25, recency ≤14d, 60d window. Vomit only |
| ⑥ | Time-of-day clustering | 4h sliding clock window over episode onsets; calibrated against the 24-position multiple-comparison problem | ≥6 eligible, ≥5 in cluster, fraction ≥0.6 (calibrated up from spec's 4/0.5, which fired at ~21.6% on uniform-random onsets; shipped floors ≈3.3% pooled) |
| ⑦ | Chronicity (safety) | Span + sustained burden + distribution + still-ongoing, orthogonal to ④'s week-over-week delta | 56d window; span ≥21d; ≥6 episodes (raised from spec's 4 after a ~9.9% noise-gate failure; 6 → ~1.3%); ≥3 active weekly buckets; episode within 14d. Firm tier at span ≥42d |

Auxiliary layers: **coverage diagnostics** (B-053: explanation-only cards for reduced engine power — sparse logging, single-protein diets; fully suppressed on trial pets); **per-incident red flags** (deterministic surfacing of `event_ai_analysis` blood/foreign-material findings — the only place the engine touches the photo-AI's structured output); **priority classes** (safety > insight > reflection; safety findings never dropped for layout).

Composition rules that matter for §2:
- **⑤ suppresses ⑥ for the same symptom** (`suppressTimeOfDayWhenPostprandial`, §4.4) — rationale: a pet fed on a schedule that vomits post-prandially clusters by clock trivially, so the clock card would restate the meal-adjacency card.
- **⑦ suppresses ④ same-symptom with tier inheritance** (chronicity owns the course; worsening owns the delta).
- **Medication confounding is identity-agnostic by design** (`detection.ts:335`): ANY drug on board during a symptom's matched pairs suppresses (case-enriched) or Early-caps (balanced) that correlation. `medication_item_id` is carried for audit only; route is not read.
- **Trial pets:** correlations lead (band 1) and staple washout is disabled for the trial staple; coverage diagnostics fully suppressed.
- **Soft-deleted rows are invisible** to every query (`.is('deleted_at', null)`, enforced by `detectionSoftDelete.test.ts` reading the function source in CI — B-071's contract).

Everything phrases as counts; the Haiku layer rephrases but cannot add claims; templates are the no-API-key fallback. The n=1/no-reassurance invariants hold at every layer (verified in the G2 "two-sided rule" form: no negative claims about the record at any coverage).

---

## §2 The live record (production SQL audit, 2026-08-13)

Four pets. Two are real and current: **Nyx** (cat, the dogfood subject of all three prior briefs) and **Cooper** (dog, added 2026-07-22 — the first real *typical-density* logger in the record). Demo/test pets excluded from findings except where named. All queries filtered `deleted_at IS NULL` exactly as the engine does, except F6 which audits the deletions themselves. Owner timezone `America/Chicago` (all local-time claims below use it).

**The headline numbers (Nyx, live rows):** 831 events — 731 meals, 37 medication doses, 36 vomits, 23 `other`, 3 itch, 1 lethargy. Zero stool events, zero weight checks. Meal density 60–80/week through 2026-07-20, halving to 29–40/week after (see F5). Intake ratings: 431 `all` / 28 `most` / 36 `some` / 21 `picked` / 11 `refused` / 204 unrated (72% rated). Active elimination trial: Royal Canin Selected Protein PR (rabbit), started 2026-07-26, 56-day target; trial-era adherence 87 rabbit meals vs 2 chicken. **Cooper:** 62 events over 3 weeks (48 meals, 4 vomits, 2 stool, 2 weight checks); active venison trial started 2026-07-24.

What the engine currently shows for Nyx (cache read 2026-08-13): two cards — ⑦ chronicity, firm tier ("vomiting across 6 of the last 8 weeks — 18 episodes since June… worth booking a vet visit") and ⑤ post-prandial ("7 of the 10 vomiting episodes we could time happened within 30 minutes of eating, including the last two"; median 5 minutes). No correlation card (chicken staple washes out pre-trial; single-protein diet in-trial), no coverage diagnostics (trial suppression).

### F1 — The vomit record decomposes into two phenotypes, and the engine can only speak about one of them

All 36 live vomits, bucketed by time-since-last-meal (24h lookback, raw rows — note this denominator differs from ⑤'s confidence-filtered episode set):

| Phenotype | n | Local-time shape | Photo-AI content (completed reads) |
|---|---|---|---|
| Rapid post-prandial (≤30 min) | 14 | Any hour | Undigested/partially-digested food; hair in several; one bile+liquid |
| Mid (30 min–4h) | 9 | Mixed | Mixed, incl. hair, foam |
| **Empty-stomach (≥4h since food)** | **10** | **Almost all 2–8am** | **Bile + partially-digested food — i.e. food still present ≥4–7h post-meal** |
| No meal logged within 24h | 3 | Early morning | Sparse |

17 of 36 vomits (47%) fall in the 2–8am band — a quarter of the clock. The empty-stomach cluster is the classic bilious/overnight phenotype the vet-council brief hypothesized from 21 episodes; at 36 it is unambiguous, and the photo-AI reads corroborate it (bile present, and — notable in its own right — *partially-digested food retained ≥4h after the last meal*, a gastric-emptying observation).

The engine's composition hides this: **⑤ fired, so ⑥ is suppressed for vomit** (`suppressTimeOfDayWhenPostprandial`). The suppression rationale assumes the clock cluster *restates* the meal-adjacency cluster — true for a schedule-fed pet with one phenotype, false here, where the 2–8am cluster is composed of *different episodes* than the ≤30-min set. A mixed-phenotype pet loses its second signal exactly when having two phenotypes is the clinically-interesting fact (the vet council: bile-timing ≠ overnight-timing → ≥2 overlapping processes). The suppression is phenotype-blind where it needs to be episode-set-aware.

Corollary: no detector reads *time-since-last-meal* as a first-class dimension. ⑤ computes it and then keeps only the ≤30-min tail. The ≥4h tail — the empty-stomach signature — is computed, then discarded.

### F2 — The recent era is a phenotype shift the engine has no lane for

Since 2026-07-09, 9 of 10 vomits are ≤10 minutes post-meal (the tenth: 257 min). Before July, the record mixes both phenotypes roughly evenly. The dominant phenotype *changed* mid-record — from mixed/empty-stomach toward almost-pure rapid — and ⑤'s 60-day pooled fraction (7/10) understates what the last five weeks look like (9/10). Nothing in the engine states composition change over time; ④ would catch a *count* worsening, not a *character* shift at flat counts.

### F3 — A six-week respiratory course is invisible because it lives in `other` notes

Nyx's 23 `other` events + 3 itch events decode (from their free-text notes) as: **coughing ×14 (2026-07-01 → 2026-08-13, ongoing as of the audit date)**, sneezing ×7, ear-specific itching ×3 (concurrent with a treated ear infection, otic med 07-16 → 08-09), "not as playful" ×1. The owner adapted to a missing event type by typing into the note field — consistently enough that the course is fully reconstructible.

Checked against ⑦'s shipped floors as if `cough` were a detectable symptom type: span 43d ≥ 42 (firm), 14 episodes ≥ 6, 7 active weekly buckets ≥ 3, last episode = audit day. **It would fire the firm chronicity tier today.** It fires nothing, because `other` events are not fetched by the engine (`DETECTION_SYMPTOM_TYPES` = vomit/diarrhea/itch/scratch/skin_reaction) and free text is not a detection input under the current (correct) reading of the LLM boundary. A six-week ongoing cough in a cat is exactly the class of finding the chronicity lane was built to escalate — and in a cat, chronic cough is never-normal in the same register as the vomiting-frequency literature the lane already leans on (see §4).

The capture-taxonomy reading: detection scope is bounded by the event enum, the enum is bounded by what the log screen offers, and the highest-signal missing types are now *empirically named by the owner's own workaround* — cough and sneeze first among them.

### F4 — Cooper is the typical-density user, and every floor is correctly above him

Cooper's three weeks: 4 vomits (07-26, 07-30, 08-03, 08-08 — one every 4–5 days), 48 meals, 2 stool, 2 weight checks, mid venison-trial. Detector arithmetic: ⑦ needs 6 episodes + 21d span (has 4 + 13d); ④/③ need ≥3 episodes in a 7d window (max is 2); ⑤/⑥ need 6 eligible (has 4); ① has effectively one protein in-trial (nothing to pair). **Every lane is silent, each correctly by its own floor** — and the floors are right to be where they are; this is not a tuning bug. But the product consequence is real: a dog vomiting every 4–5 days, three weeks into an elimination trial, gets *no* engine output at all — during the exact weeks the wedge owner is most attentive. If the q4–5d cadence continues, ⑦'s floors clear around week 5–6. The gap between "the record is already clinically interesting" and "the first card appears" is ~3 weeks at Cooper's density, and nothing in the product names that state honestly (the B-735 sparse-logger dissonance item is the same observation from the widget side).

### F5 — Both real pets are mid-trial, and the engine's trial awareness stops at exposure detection

Nyx: day 18 of 56, adherence near-total (87/89 trial-era meals rabbit; the 2 chicken exposures are the off-diet detection's job and it sees them). Vomit rate through the trial: ~2/week pre-trial → 4 episodes in the 18 trial days (~1.6/week) — flat, all rapid-phenotype. Cooper: day 20 of 42, 4 vomits spread across trial weeks 1–3. Neither pet's Signal says anything trial-relative: ① leads for trial pets but has nothing to correlate on a single-protein diet (structurally: an adherent elimination trial *removes* ①'s second protein, so the detector the trial band promotes is the one the trial itself silences); no lane reads `diet_trials` timeline against symptom trajectory. The GI-trial literature's response-assessment points (§4: most food-responsive cases improve within 1–2 weeks; ACVIM assessment at ~4) pass unmarked. Meanwhile Nyx's meal *logging* halved when the trial started (60–80/wk → 29–40/wk; no recorded feeding-arrangement change) — most plausibly a shift toward free-feeding trial kibble, which the coverage diagnostics would normally name but are trial-suppressed.

### F6 — The soft-delete under-count is real but historical, not ongoing

47 vomits soft-deleted vs 36 live — but 35 of the 47 deletions date to May 2026 (the import/duplicate cleanup era the Opus brief caught), 8 to June, 4 to July. The recent record is clean. B-071's "deleted ≠ never happened" concern survives as an *era caveat* (any lane reading before ~June 2026 under-counts) rather than an ongoing behavioral pattern. The engine's hard `deleted_at IS NULL` contract remains correct; what the era argues for is nothing more than honesty in any surface that renders pre-June history.

### F7 — Structured photo-AI content and event timing are two rich sources that never compose

31 of 36 live vomits carry completed `event_ai_analysis` reads with structured fields (contents[], colour, bile/blood/foreign tristates, hair). The engine reads exactly two bits of this (blood, foreign material → red flags). Unread today: **bile presence** (corroborates F1's empty-stomach phenotype from a second, independent source), **hair** (the "hairballs" folk-attribution the vomiting-frequency literature warns against — countable, and cross-tabulable against timing), **undigested vs digested content × time-since-meal** (the retention/regurgitation axis — undigested food at ≥4h is a different clinical object than digested food at 4h, and the vomit-vs-regurgitation capture gap was a named vet-council finding). All deterministic joins over rows that already exist.

### F8 — Medication data is course-shaped and route-annotated, but confounding is route-blind

Nyx's otic (topical ear) medication course (07-16 → 08-09) overlapped five weeks of the vomit record. Under the identity-agnostic v1 rule any on-board drug caps food→vomit correlations at Early — including a topical ear drop with negligible GI plausibility. The `route` column exists on `medications` and the diet-trial work already ruled route-awareness in scope for trial contamination (C3: oral-route detection, zero new schema). The same distinction — *systemic/oral confounds GI; topical/otic does not* — is sitting unread in the confounder path. (The med-response direction — "did symptom rate change after the course started" — is a §7 candidate with its own literature in §3/§4.)

---

## §3 Statistical prior art & methods (research lane 1)

_Pending integration — agent running at time of drafting._

## §4 Veterinary clinical literature (research lane 2)

_Pending integration — agent running at time of drafting._

## §5 Human-space analog products (research lane 3)

_Pending integration — agent running at time of drafting._

## §6 Pet competitive landscape (research lane 4)

_Pending integration — agent running at time of drafting._

## §7 The candidate space

_Pending — synthesized after §3–§6 land._

## §8 Open questions this brief raises

_Pending._

## §9 Verification notes & research debt

_Pending._
