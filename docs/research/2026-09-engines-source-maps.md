# Engines deep dive: the source maps and the prior-work ledger

**Date:** 2026-09-24
**Status:** 🧊 Frozen point-in-time capture. File and line references are to `main` at 892eb88 (2026-09-23) and will drift; the brief states which claims were re-verified. Correct additively (a dated §V at the foot), never in place.
**What this is:** the three code-and-history lanes behind `docs/research/2026-09-engines-step-change.md`, committed so the build issues in the *Engines v3* project can cite them. Each lane was an isolated agent reading the repo (and, for Lane C, Linear) read-only, with no database access; the text is kept as written, headings demoted one level.

- **Lane A** — `generate-signal` as built: every lane, floor, composition rule, input and runtime fact; what validates it today and what is absent.
- **Lane B** — every path from one logged vomit to an owner-facing escalation: the model call (system prompt and tool schema verbatim), the floor, the read templates, the twelve surfaces an escalation reaches, owner feedback, over-escalation hypotheses.
- **Lane C** — the fate of every recommendation in the four prior dogfood briefs, the recurring themes, and the research debt.

Where these lanes and the brief disagree, the brief wins: it carries the replay results and the adversarial pass that post-date the lanes.

---

## Lane A — The Signal generation engine, source-verified map (2026-09-24)

Scope: `supabase/functions/generate-signal/` at HEAD of `claude/lucid-mccarthy-q2wkb4` (repo shallow; history read from a bare clone in scratchpad), the shared `lib/` primitives it imports, the specs, and Linear (read-only). No DB queried, no repo file edited. All line numbers are `detection.ts` unless another file is named.

Deployed state: **live = generate-signal v33 (2026-08-29)**, which carries everything through W1-PR-3b (cough). **Merged but not deployed**: CUL-778 (adjacency copy), CUL-787 (chronicity 4-week compare), CUL-786 (labeled stand-down). The deploy is gated on a client build (CUL-794). Source: `supabase/functions/deploy-manifest.json` → `generate-signal.reason`.

---

### 0. DELTA since the 2026-08-13 brief (`docs/research/2026-08-signals-deep-dive.md` §1)

Commits touching `generate-signal/` since 2026-08-13 (from `git log`):

| Date | PR | What changed in the engine |
|---|---|---|
| 08-14 | #642 (CUL-7) | **L1 `empty_stomach_timing`** (≥6h since eating) + **episode-set-aware ⑤/L1→⑥ suppression** + **`timing_story`** merge of same-symptom ⑤+L1. ⑤ rewired onto `lib/mealTiming.ts`. Poisson-binomial base-rate guard (3 adversarial rounds, "~250k seeded null trials"). |
| 08-14 | #643 (CUL-9) | **L3 photo composition**: evidence fields (retained food / hair / bile), not a finding. Post-detection decoration. |
| 08-14 | #644 (CUL-8) | **L2 `trial_response`**: trial era vs 49d baseline, logged-day exposure, C-test gate, symmetric density gate, vomit-only pooling. |
| 08-15 | #647 (CUL-10) | **L4 `gap_shortening`**: strictly shortening 4-gap run, escalate-only, band 4. |
| 08-15 | #650, #659, #662 | Trial surfaces (client). B-777 per-account server gate on the v2 composition. Redeploy gates settled. |
| 08-20 | #691 (CUL-550) | GA-3: B-777 gate removed. v2 composition is the only path. v32 deployed. |
| 08-18 | CUL-226, #674 | `lib/vomitContents.ts` shared leaves. 30s Anthropic fetch timeout (`_shared/http.ts:18`). |
| 08-21 | #694 (CUL-564) | `composeV2:false` report fork deleted. The report renders L1/`timing_story` and drops L2/L4. |
| 08-22 | #695 (CUL-372) | One shared episode collapse (`lib/symptomEpisodes.ts`). Behaviour-neutral (40k-case differential, `lib/symptomEpisodes.differential.test.ts:86`). |
| 08-28 | #731/#732 (CUL-676) | **Per-lane symptom membership** (`SYMPTOM_TYPE_UNIVERSE` / `CORRELATION_SYMPTOM_TYPES` / `LANE_SYMPTOM_TYPES`, :148–203). **Cough joins the fetch and ⑦ only.** **Per-type and per-species chronicity floors** (cough: dog 5 / cat 4 episodes, recency 28d, firm 28d). **⑦ now emits every chronic course** (R4, one card per symptom). **R3 denominator rule**: comparability gates read the lane cell, coverage reads the fetch union (:205–259). **Cough↔vomit adjacency flag** (:6723). Deployed as v33. |
| 09-01 | #790 (CUL-778) | Adjacency copy. Pending deploy. |
| 09-03 | #797 (CUL-787) | `computeChronicityCompare` decoration: two 28-day halves inside the ⑦ card (:4060). Pending deploy. |
| 09-03 | #798 (CUL-786) | `standDown.ts`: a labeled `stood_down` marker when ⑦ goes silent **only** because of its recency floor. Minted in the I/O shell, not the engine. Pending deploy. |

Three corrections to the brief's §1:
- **Coverage diagnostics are not fully suppressed on trial pets.** `staple_washout`, `meal_type_collapse` and `diet_churn` are suppressed. `rate_meals` is not (`detectRateMeals` has no trial check, :5721–5740).
- **Haiku phrases only two finding types**: single-protein `food_symptom_correlation` and `intake_decline` (`index.ts:151–186`). Everything else, including the summary, is template-only.
- **"829 Deno tests"**: `generate-signal/*.test.ts` now holds about 600 top-level `Deno.test` declarations (detection 259, phrasing 93, laneMembership 44, summary 36, standDown 34, trialResponse 23, medContext 23, gapShortening 21, photoComposition 19, index 15, protein 13, softDelete 12, demoStory 5). Commit messages cite 1,414 Deno tests repo-wide.

Status of the brief's §7 candidates:
- **Built**: C1 (L1), C2 cough (sneeze is typed but not fetched), C3 (L2, vomit-only), C4 (L3, evidence only), C5a (L4) and C5b (the watching system, computed client-side in `lib/signalWatching.ts`).
- **Not built**: C6 weight (`lib/weight.ts:14–16`: "no weight lane"), C7a route-aware confounding (rejected, spec D8), C7b med-response contrast.
- **Not done**: C8, the Maclure / self-controlled case series citation retrofit. `detection.ts` has no Maclure citation, although spec §3 said the ① header would gain one.

---

### 1. Every detector and lane

#### 1.0 Shared structure
- **Symptom sets** (:148–203):
  - Universe: `vomit, diarrhea, itch, scratch, skin_reaction, cough, sneeze`.
  - Fetch (`CORRELATION_SYMPTOM_TYPES`): the same list minus `sneeze`.
  - Lane cells:
    - `correlation`, `symptomDelta` (③/④), `gapShortening` and `diagnosticsFloor` = the five pre-taxonomy types.
    - `chronicity` = those five + `cough`.
  - ⑤, ⑥, L1 and L2 are hard-coded to `'vomit'` (:4638, :4820, :5012, :5258).
- **Episode collapse**: same-type events within `symptomEpisodeGapHours = 3` (`SYMPTOM_EPISODE_GAP_HOURS`, :2329) chain into one episode. Implemented once, in `lib/symptomEpisodes.ts` / `lib/mealTiming.collapseEpisodes`.
- **Registry**: `DETECTOR_REGISTRY` (:6352–6390) has 11 detectors. Registry order does not decide output order; ranking does.

#### 1.1 Lane table

Class meanings: S = safety (band 0). I = insight. R = reflection (band 3). D = descriptive. W = watching / quiet (band 4).

| # | Finding type | Question | Method | Floors (`DEFAULT_CONFIG`) | Window | Symptoms | Class |
|---|---|---|---|---|---|---|---|
| ① | `food_symptom_correlation` (:3056–3567) | Does protein X appear more often before episodes of symptom Y than at the same time on a symptom-free day? | Symptom-anchored, bidirectional case-crossover. 1:1 control = the nearest meal-logged day that is not a symptom day and sits ≥ window away, at the same UTC time of day (:3299–3323). One-sided exact McNemar on discordant pairs (:2756). Collinear proteins clustered (:3019). Bonferroni over (cluster × symptom) + withdrawn-by-medication + primary-only family floor (:3240, :3484). | Windows (:2317–2326): vomit 12h, diarrhea 24h, itch/scratch/skin 72h. **Early**: pairs ≥3, case-only discordant `b` ≥2, risk difference ≥0.2, b>c. **No significance test for Early** (:3502–3504). **Established**: pairs ≥5 AND p ≤ 0.05/family AND not joint AND attribution 'high' AND no free-fed standing confounder AND no medication present (:3525–3533). Needs ≥2 distinct proteins (:3105). | Whole 180d fetch; no lane window | correlation cell (5) | I. Band 2; band 1 on a diet-trial pet (:6421) |
| ② | `intake_decline` (:3620–3759) | Is the pet eating less than its own normal, or refusing a normally-eaten food? | Heuristic mean-score deltas on the WSAVA 0–4 scale. Rated `meal`-type rows only. UTC days. | Trigger A: ≥4 rated meals in a 14d baseline; the last N days each below baseline; delta ≥1.0. Dog N=2. Cat N=1 and that day's mean ≤2. Trigger B: a food with ≥3 prior ratings, prior mean ≥3, latest rating = refused within 2d, prior excludes the latest UTC day (:2337–2349). | 14d | meals only | S |
| ③ | `reflection` (:3911–3984) | Is a symptom flat or falling week over week? | Raw episode and symptom-day counts. No statistical test. Global valves: silent if any symptom `isWorsening` (:3925) or any `isChronic` (:3950). | Windows 7+7d. ≥3 episodes in the busier window. ≥3 logged days in each window (comparison-gate cell + meals). Current count ≥1. Count and days both ≤ prior. One card. Plus the density-comparability decoration (`DENSITY_COMPARABLE_MIN_RATIO` 0.7, :4005). | 14d | symptomDelta cell | R (band 3) |
| ④ | `symptom_worsening` (:4151–4194) | Is a symptom happening more often, or on more days, this week than last? | `isWorsening` (:3904): current ≥2 AND (count up OR days up). The same predicate silences ③. No statistical test. | `worseningMinEpisodes` 2. Firm tier at ≥4 symptom days out of 7 (:2360–2364). Both windows ≥3 logged days. One card. | 7+7d | symptomDelta cell | S |
| ⑦ | `symptom_chronicity` (:4467–4534) | Has this symptom recurred for weeks and is it still going? | Conjunction of span, episode count, distribution (greedy ≥7-day packing, :4272) and recency. Both halves of the span must have ≥3 logged days (:4350–4353). | Global: 56d window, span ≥21d, ≥6 episodes, ≥3 active weeks, last episode ≤14d ago, firm at span ≥42d (:2395–2401). Cough: 5 episodes (cat 4), recency 28d, firm 28d (:2425–2486). One card per chronic symptom (R4). | 56d | chronicity cell (6, incl. cough) | S |
| ⑤ | `postprandial_timing` (:4720–4783) | Of the vomits that can be timed, how many came ≤30 min after eating? | Shared `classifyEpisodeSet` bands (`lib/mealTiming.ts`). Grazing guard: rapid count ≥ max(3, 2 × expected), where expected = eligible × min(1, feeds/day × 30/1440) (:4744–4752). Deterministic; no test. | ≥3 rapid, ≥6 eligible, fraction ≥0.25, a rapid episode within 14d, 24h feeding lookback (:2516–2525). | 60d | vomit only | I/D |
| L1 | `empty_stomach_timing` (:5096–5192) | Of the timed vomits, are more ≥6h after eating than the feeding schedule would produce by chance? | Per-episode local base rate from the pet's own feeding interval (:5034). Exact Poisson-binomial upper tail (:5071). Clock band carried as evidence only. | ≥3 long, ≥6 eligible, fraction ≥0.6, tail p < 0.05, a long episode within 14d, `longGapHours` 6 (:2529–2579). | 60d | vomit | I/D |
| ⑥ | `timeofday_clustering` (:4881–4961) | Do witnessed vomits cluster in one 4h band of the owner's local day? | Max-count over 24 sliding 4h windows. Floors calibrated empirically for the scan multiplicity. Silent with no valid timezone. | ≥6 eligible, cluster ≥5, fraction ≥0.6 (:2622–2635). | 60d | vomit | I/D |
| L2 | `trial_response` (:5268–5507) | During a running diet trial, has the vomit rate per logged day changed versus the pre-trial baseline? | Exact conditional-binomial C-test (`lib/rateContrast.ts`), two-sided, logged-day exposure. `changedMaterially` = gate AND (more OR (fewer AND density comparable)) (:5418). Density is symmetric over logging fractions (:5406–5411). Local-day index windows. | Baseline 49d. ≥7 logged days per window. α = 0.05 (:2584–2596). Gated on `isTrialRunning`. | Trial era + 49d | vomit (pooled); phenotype rows via mealTiming | I (band 1) |
| L4 | `gap_shortening` (:5575–5669) | Are the gaps between episodes getting shorter? | Last 4 gaps strictly decreasing AND latest ≤0.5 × median gap AND time since last episode ≤2 × latest gap. Escalate-only. One row. | `minGaps` 3 (the watching floor), `runLength` 4 (effective firing floor 5 episodes), ratio 0.5, grace factor 2 (:2681–2698). | Whole 180d fetch | gapShortening cell (5) | W (band 4) |
| RF | `incident_red_flag` (:6239–6334) | Did a recent photographed vomit or stool show blood or foreign material? | Present-only derivation from owner-editable structured AI fields (:6162). 60s re-log dedup to match the report. One card per family. | 14d window (:2640). Fires on a single incident; no corroboration. | 14d | vomit + stool families | S (top of the safety band) |
| — | `timing_story` (:6610) | Composition only: a same-symptom ⑤+L1 pair merged into one card. | — | — | 60d | vomit | I |
| — | `stood_down` marker (`standDown.ts`) | Shell only: ⑦ fell silent only because of its recency floor, and logging held across the gap. | Re-runs `detectChronicity` with the recency gate held open. | 7-day TTL (`standDown.ts:67`). | — | chronicity types | insight, never leads |

#### 1.2 Not findings
- **Coverage diagnostics** (:5709–6030). Computed only when there are zero findings (`index.ts:1073`).
  - `rate_meals` (action): fewer than 4 rated meals.
  - `staple_washout`: protein ≥80% of feedings, ≥4 feedings, ≥3 symptom episodes.
  - `meal_type_collapse`: ≥5 treats-only days out of the last 10, ≥2 treats per such day, ≥80% of feedings classified.
  - `diet_churn`: ≥3 new foods and ≥2 episodes within 14d.
  - The last three are trial-suppressed. Ranked `rate_meals` > collapse > churn > staple.
- **Decorations**, attached after detection:
  - med-on-board context (`medContext.ts`, 60d window anchored at now, :42)
  - reflection density (:4021)
  - L3 photo composition (`photoComposition.ts`: tristate, present-only, "answered" denominators)
  - ⑦ compare (:4060)
- **Dead code**:
  - `computeHumanFoodProvenance` (:6099) has no production caller (grep: only a comment at `index.ts:327`).
  - `fisherExactRightTail` (:2730) has no caller.

---

### 2. Composition, ranking, caps, storage, and where an LLM touches the pipeline

**Order inside `detectSignals`** (:6797–6823):
1. Run every registered detector.
2. `suppressTimeOfDayWhenPostprandial` (:6559). ⑥ is dropped only when ≥50% of its cluster onsets are in the ⑤-rapid ∪ L1-long onset set. If ⑤ lacks its onsets, suppression is unconditional.
3. `composeTimingStory` (:6610).
4. `suppressWorseningWhenChronic` (:6684). ⑦ drops the same-symptom ④ and inherits `firm` tier from it.
5. `discloseCoughVomitAdjacency` (:6723). Marks the leading cough-or-vomit ⑦ card.
6. `rankFindings` (:6474).

**Suppression valves (one shared predicate, two consumers)**:
- ③ is silent if any symptom satisfies `isWorsening` (④ fires on exactly that set).
- ③ is silent if any symptom satisfies `isChronic` (⑦'s predicate). This is pet-wide: a chronic cough blanks every reflection card (:3940–3948).

**Ranking** (`priorityBand`, :6406):
- Band 0: safety. Order within it (:6462): red flag > intake decline (refusal before consecutive-low) > chronicity (longest span, then most episodes, then cell order) > worsening.
- Band 1: `trial_response`, and correlation on a trial pet.
- Band 2: correlation (Established before Early, then risk difference, then p), then timing (⑤ / L1 / story), then ⑥ (`INSIGHT_TYPE_ORDER`, :6431).
- Band 3: reflection.
- Band 4: `gap_shortening`.

**Cap**: `curateFindings` (`phrasing.ts:677`) keeps every safety finding plus at most 4 insights (`VISIBLE_CARD_CAP`, :40).

**What gets stored** (`index.ts:1124–1133`): one `ai_signals` row per pet, written as delete-then-insert.
- `findings`: `[{rank, text, finding}]` plus any stand-down marker.
- `signal_text`: the lead card's sentence, or the building text.
- `is_building`: true when there are no findings.
- `coverage`: diagnostics, only when building.
- `summary`: `{text, source, evidence, hasSafety, quiet}` from `summary.ts`. The 30-day window narrates safety clauses verbatim, else the reflection, else a symptom count, then the intake story (top protein, finished rate).
- `expires_at` defaults to NOW() + 24h (`migrations/005_ai_signals.sql:16`).
- **No history is kept.** Each regen erases the prior row. The prior row is read only to mint stand-downs.

**Where an LLM touches the pipeline**:
1. **Phrasing** (`index.ts:136–232`). Claude Haiku 4.5 (`:124`), max 200 tokens, 30s timeout, forced tool call.
   - Only single-protein correlation and intake decline are phrased by the model. The other ten types and joint correlations are template-only (`:151–186`).
   - The payload contains the finding only, never the raw log (`phrasing.ts:693`).
   - `validatePhrasing` (`phrasing.ts:558`) runs regex screens for reassurance, dismissal, cause, mechanism, food names, trial verdicts, glyphs and percentages, and enforces 8–320 characters. On failure or any error, the template is used.
   - `app_config.ai_signal_phrasing_enabled` = false forces templates everywhere.
2. **Summary**: model phrasing is off (`SUMMARY_MODEL_PHRASING_ENABLED = false`, `summary.ts:560`). Safety and quiet summaries are never model-eligible (`:571`).
3. **Upstream inputs, not in generate-signal itself**:
   - `event_ai_analysis` structured fields come from Claude Sonnet vision reads (`analyze-vomit` / `analyze-stool`). The red-flag lane and L3 consume them. The fields are owner-editable.
   - `food_items.proteins` / `primary_protein` can be model-extracted from package photos (`extract-food-from-photo`). These are ①'s exposure keys.
4. **Downstream**: Ask (Sonnet) relays the cached `ai_signals.findings` (`ask/index.ts:626`, `ask/tools.ts:1638`).
5. **What the LLM never does**: decide whether a finding exists, choose a floor, rank, or read raw events.

**Other consumers**:
- `generate-report` re-runs `detectSignals` itself (`report.ts:3110–3119`). The report shows Established-only correlations and drops L2 and L4.
- Client mirrors recompute sub-floor watching rows and trial counts locally:
  - `lib/signalWatching.ts`
  - `lib/trialResponseCounts.ts` (parity-tested against `detectTrialResponse`)
  - `lib/patternsTiming.ts`

---

### 3. Input contract (`index.ts:790–976`)

#### Reads
All use the caller's JWT, so reads are RLS-scoped. `LOOKBACK_DAYS` = 180 (`:117`).

| Source | Columns | Filter |
|---|---|---|
| `pets` | `name, species` | — |
| `events` (symptoms) | `id, event_type, occurred_at, occurred_at_confidence, severity` | `event_type IN (vomit, diarrhea, itch, scratch, skin_reaction, cough)`, `deleted_at IS NULL`, ≥ lookback |
| `events` (meals) ⋈ `meals` ⋈ `food_items` | `occurred_at_confidence`; `meals.food_item_id, intake_rating`; `food_items.primary_protein, proteins, food_type, format, brand, product_name` | `deleted_at IS NULL`, ≥ lookback |
| `diet_trials` | `id, started_at, target_duration_days` | `status = 'active'`, limit 1 (a unique partial index guarantees at most one). Then `isTrialRunning` (`:934–941`). |
| `feeding_arrangements` ⋈ `food_items` | `is_shared, active_from, active_until`, proteins | `method = 'free_choice'`, not deleted, no lookback |
| `user_profiles` | `timezone` | — |
| `medications` | `id, drug_name, medication_item_id, started_at, ended_at` | All time, no status filter. The table has no `deleted_at`. |
| `events` (medication) ⋈ `medication_administrations` | `medication_id, medication_item_id, adherence, paired_event_id, medication_items(...)` | Not deleted, ≥ lookback |
| `event_ai_analysis` ⋈ `events!inner` | `incident_type, status, blood_present, stool_blood_present, foreign_material_present, contents, bile_present` | `incident_type IN (vomit, stool_normal, diarrhea)`, event not deleted, ≥ lookback |
| `app_config` | phrasing flag, `ai_caps` | — |
| `record_ai_usage` RPC | per-pet usage counter | — |

#### Ignored
- **Event types not fetched**: `sneeze` (typed, deliberately not read), `lethargy`, `stool_normal` as an event (only its AI analysis is read), `other`, `weight_check`, `check_in` (the daily look).
- **Tables not read**: `looks` ("never enters the engine", T-5, `lib/looks.ts:186`), `weight_checks` (no lane), `vet_visits`, `vet_appointments`, `conditions`.
- **`diet_trials` columns not read**: `outcome` (owner-reported improved / no_change / worse / unsure), `transition_started_at`, target protein (migration 053). `diet_trial_foods` (the allowed set) is not read either.
- **`medications` columns not read**: `route`, `indication`, `dose_amount`, `doses_per_day`.
- **Free text not read**: `events.notes`, `meals.notes`, `meals.quantity`, `is_full_portion`.
- **Provenance not read**: `events.source`, `logged_via`.
- **`event_ai_analysis` fields not read**: `dismissed_at`, `edited_at`, the free-text read, `recommendation`, `visual_flags`.
- **`severity`** is fetched and carried (:344) but no detector reads it.
- **`occurred_at_earliest` / `occurred_at_latest`** (the window bounds) are ignored. Window weighting is described as "a future refinement" (:342).

#### Uncertain timestamps
- `occurred_at` of a `window` event is the latest edge of the window.
- ①, ②, ③, ④, ⑦, L4 and L2's pooled counts treat every event as a point at `occurred_at`, whatever its confidence.
- The timing lanes (⑤, L1, ⑥, and L2's phenotype rows) accept only strict `'witnessed'` onsets. NULL, `estimated` and `window` are excluded from numerator and denominator (`lib/mealTiming.ts:102`).
- Feedings are eligible when `witnessed` or NULL (`:94`). Meals and doses were backfilled to witnessed (`migrations/052`).
- Migration 052 notes that about 65% of adverse incidents are discovered, not witnessed. The timing lanes therefore see a minority of vomits.
- Spec L1 says "witnessed/estimated", but the code is witnessed-only. The spec is wrong.

#### Deletion
- Every `events` pull filters `.is('deleted_at', null)`. The AI analysis pull filters through `events.deleted_at` on the inner join.
- `detectionSoftDelete.test.ts` enforces this statically over `index.ts` and differentially (the harm when unfiltered).
- `detection.ts` has no notion of deletion by design.

#### Day frames (mixed)
- UTC days: ①, ②, ③, ④, ⑦, the coverage diagnostics and the summary. Known residual B-084 (:5886, :6062).
- Owner-local days: ⑥ (clock) and L2 (day index).

#### Input-integrity defects (verified in code and Linear)
- **CUL-1099 (High, Todo, filed 2026-09-23).**
  - The dose query at `index.ts:851–859` embeds `medication_administrations(...)` with no FK hint. Since migration 023 (2026-06-23) there are two FKs to `events`, so the query fails on the live API with PGRST201.
  - The error is never read, so `doseRows = []` on every run for every account.
  - Consequences:
    - The medication confounder sees regimen spans only. No dose points.
    - Vehicle attribution (B-156) never runs.
    - The B-174 in-doubt-dose logic never runs.
    - The med-on-board context is always empty.
  - These dose lanes have effectively never run on production data.
- **No query error is checked anywhere** in `index.ts:879–955` (only `pet == null` is). A failed symptom or meal read silently becomes an empty record, which is written as a building state with a fresh 24h TTL.
- **CUL-989 (Urgent, Todo).**
  - Every pull is a bare select with no order, limit or range. PostgREST `max-rows` keeps the oldest rows in physical order and drops the newest.
  - The report half (CUL-975) was fixed with `fetchAll`. generate-signal was not (`docs/engineering-lessons.md` §C-42).
  - `max-rows` was raised from 1,000 to 5,000 on 2026-09-15. That buys headroom; the cliff is still there.
- **CUL-772 (Medium).** A regen whose queue push failed still recomputes and renews the 24h TTL over the stale record. `ai_signals` is never reaped server-side.

---

### 4. Evaluation apparatus

#### 4.1 Seeded null-model ("property sweep") tests in CI
All are false-positive-rate measurements.

| Lane | Test | Null model | Trials, seed | Asserted bound | Measured |
|---|---|---|---|---|---|
| ⑦ vomit | `detection.test.ts:2098` | Daily meal logged. Each day P(vomit) = 2/56, at a random hour, over 56d. | 20k, LCG 0xc0ffee | < 2% | ~1.3%. At `minEpisodes` 4 it was ~9.9%, which drove the floor to 6. |
| ⑦ cough | `:2151` | The same null with cough, per species | 20k × 2 | dog < 7%, cat < 12%, dog < cat | dog ~4.7%, cat ~11.1%. The comment says the null itself is disputed, so this is "not a false-positive rate" if cough has no benign base rate. |
| ⑥ | `:2961` | n ∈ 6–10 witnessed vomits on distinct days, uniform time of day | 4k per n, mulberry32 0x9e3779b9 | pooled < 4.5%; each n < 5%, except n=8 < 10% | pooled ~3.3–3.6%, n=8 ~7.4%. The spec's floors gave ~21.6%. |
| L1 | `:3279` | 12 schedules: once/twice/thrice daily, grazing, Poisson, regime changes, logging fatigue, mixed history with an outlier | 2k per n, n = 6–14 (or 6–10) | pooled < 3.5%, per-n < 6.5% | ~0–2% pooled, peak ~4.67% at n=13. Exact, so it approaches α. |
| L2 | `trialResponse.test.ts:465` | Same daily vomit probability in both windows, full logging | 4k, 0xc0ffee | < 8% | Not printed. |
| L2 | `:494` | Sparse symptom-only baseline logging, dense trial logging | 3k, 0x5eed | false "fewer" < 3% | Round 1 of adversarial review measured 24–94% before the fix. |
| L4 | `gapShortening.test.ts:338` | Constant-rate gaps: Poisson 2/5/10d, uniform, periodic ±40%, heavy-tail lognormal; n ∈ {5, 6, 8, 12, 20} | 2k per cell | pooled < 3%, worst < 5% | ~2.0% pooled, worst ~3.55% |
| L4 | `:410` | Autocorrelated: Cox AR(1) at 80× and 36× swings, 2-state flare/quiet | 4k per cell | worst in (4%, 7%), pooled < 6.5% | 4.3–5.8% (a disclosed residual) |
| L4 | `:422`, `:430` | Calibration locks | — | `runLength` 5 worst < 2.5%; `runLength` 3 pooled > 5% | — |

- `lib/rateContrast.test.ts` has symmetry, monotonicity and degenerate-case property tests for the C-test.
- `detection.test.ts:3260` checks the Poisson-binomial against textbook values.

#### 4.2 Sensitivity and power
There are no power curves, no time-to-detection measurement and no miss-rate measurement anywhere. What exists is a handful of hand-built "RECALL" golden fixtures:
- L1: 2 fixtures (once-daily 12/12, thrice-daily 7/10) (`:3345`).
- L2: 2 fixtures (`trialResponse.test.ts:524`).
- L4: 4 runs (`gapShortening.test.ts:440`).
- Cough: 2 courses per species (`:2204–2231`).
- Other lanes: per-lane positive fixtures ("golden" 5 of 8, 4 of 12, the council's 6-week course).

Sensitivity numbers appear only in comments or in adversarial scratch runs that were not committed:
- "Cough 6 costs ~13 points of recall" (:2438–2439).
- "Once-daily L1 needs ~11 all-long episodes to speak" (:5006–5009).
- CUL-179: ⑦ at 6 episodes silences once-weekly ×5 and q2wk ×4 courses.

#### 4.3 Lanes with no null sweep at all
- **① correlation**, including the **Early tier, which fires with no significance gate**. For example, 3 pairs with b=2 and c=0 gives McNemar p = 0.25, and Early would still fire. The Early rate across a 5-symptom × multi-protein family has never been measured.
- ② intake decline.
- ③ reflection and ④ worsening. ④ is a raw "current ≥2 and up" rule.
- ⑤ postprandial. It has only the grazer regression fixtures (`:2464`, `:2576`).
- The coverage diagnostics.
- **The whole engine.** Nothing runs `detectSignals` on a null record to measure P(any card) per pet. Nothing measures the alarm rate across repeated regens: the engine re-runs after every log and at every 24h expiry, so this is sequential testing and inflates the per-pet false-alarm rate. The per-pet-month false-alarm rate is unknown.

#### 4.4 Other test classes (behavioural correctness, not accuracy)
- Refactor differentials:
  - 40k cases (`lib/symptomEpisodes.differential.test.ts:86`).
  - 6,000-case old-vs-new for CUL-676.
  - 5k and 12k fuzz for GA-3 and B-777 (commit messages; not all committed).
- `laneMembership.test.ts`: 44 membership pins.
- `detectionSoftDelete.test.ts`.
- `demoStory.detection.test.ts`: proves the synthetic App Review demo seed fires ① Early and ② honestly across 24 UTC seed hours. This tests the seed, not accuracy.
- Client parity tests: engine vs `trialResponseCounts`.

#### 4.5 Backtesting against real data
- **No backtest harness exists.**
- The one-off SQL audit of Nyx in the 2026-08-13 brief is the only look at real data.
- G6 (spec D7) forbids tuning to Nyx. G7 forbids demo and test pets in evaluation. The effective real corpus is one cat.
- B-758 / CUL-508, "intentional synthetic-data corpus with known ground truth", is Todo at Low priority.

#### 4.6 Outcome and feedback capture: none
- `ai_signals` is overwritten on every regen, so there is no log of what fired and when.
- The fold store ("Keep it compact") is device-local AsyncStorage, never synced (`lib/signalFold.ts:566`).
- There is no helpful / not-helpful control, no dismissal telemetry and no vet-confirmation capture.
- B-047 / CUL-255 (instrumentation: time-to-first-insight and retention) is Todo, Medium, unowned.
- Candidate weak labels exist in the schema but nothing reads them:
  - `diet_trials.outcome` (owner-reported)
  - `conditions` (`condition_name`, `diagnosed_at`)
  - `vet_visits.reason` / `notes`
  - `event_ai_analysis.edited_at` / `dismissed_at` (owner overrides of per-incident reads)
  - the daily look
- Clinical calibration rulings are made by the "Dr. Chen" persona lens run in isolation (`:2404–2409`). There is no external clinical ground truth.
- The spec's time-to-first-insight target of about 3–5 days (`docs/nyx-ai-signal-requirements.md` §7) has never been measured.

---

### 5. Architectural shape

- **Independent detectors with per-lane floors.** A registry of pure functions, each with its own statistic and thresholds, composed by hand-written rules (valves, suppressions, merges) and a fixed-priority sort. There is no shared probabilistic model, no joint likelihood, no evidence pooling across lanes, and no finding-level confidence other than ①'s Early/Established tier.
- **Shared primitives** (the "one predicate" rule G9 applies to code reuse, not to a statistical model):
  - episode collapse (`lib/symptomEpisodes.ts`, `lib/mealTiming.collapseEpisodes`)
  - the meal-relative band classifier (`lib/mealTiming.ts`: ⑤, L1, L2 rows, L3 join, client Patterns)
  - `loggingDaysInWindow` + `DENSITY_COMPARABLE_MIN_RATIO` 0.7 (③ density, ⑦ compare, and L2's symmetric variant)
  - `clockConcentration` (⑥ and L1 evidence)
  - exact McNemar (① and the medication confounder)
  - valve predicates `isWorsening` (③/④) and `isChronic` (③/⑦)
- **The rate primitive.** `lib/rateContrast.ts` (the exact conditional-binomial C-test) is used by **L2 only** (grep: `detection.ts` is the sole importer). ③/④'s week-over-week comparison and ⑦'s compare do not use it; they are raw count comparisons.
- **Bayesian machinery: none.** No posterior, prior, shrinkage, hierarchy or empirical Bayes. A grep of `generate-signal` and `lib` for Bayes, posterior, shrinkage, hierarchical, CUSUM, EWMA or SPRT finds only g-chart comments.
- **Per-pet baselines: implicit and ephemeral only.**
  - ②: 14d mean intake score, and each food's prior mean.
  - ③/④: the prior week.
  - L2: the 49d pre-trial window.
  - L4: the record's median gap.
  - L1: per-episode local base rate from the pet's own feeding intervals.
  - ⑤: the pet's feeding rate, for the grazing guard.
  - Nothing is persisted, learned or updated. Each regen recomputes from 180 days of raw rows.
- **Population prior: none**, by decision. Brief §7 lists it as a negative result; spec §1 excludes "population comparisons".
- **Multiple comparisons.**
  - ①: Bonferroni within its own family, with anti-shrink padding. Early bypasses it entirely.
  - ⑥: the 24-position scan is handled by empirical calibration of the floors.
  - L1 and L2: each is a single exact test at α = 0.05.
  - L4 and ⑦: controlled by sweep-calibrated floors.
  - **Nothing across lanes**: no global FWER or FDR over the roughly 11 lanes × symptom types.
  - **Nothing across time**: no sequential or alpha-spending control over daily and per-log re-runs.
  - Each lane is individually tuned to about 1–5% null fire. The union is uncontrolled and unmeasured.
- **Tiering.** Only ① has an evidence tier. The safety lanes have copy-urgency tiers (④ firm / standard / soft by day density; ⑦ firm by span, or inherited from ④). Tiers come from thresholds, not probabilities. p-values never surface (`rateContrast` returns a boolean; spec §3).

---

### 6. Known limitations, TODOs and open decisions

#### Engine comments (accepted or disclosed residuals)
- B-010 window-weighting is not implemented (:342). Discovered events use the latest edge of the window.
- B-049: 1:M control matching deferred (:3271). Controls can be reused across cases (no uniqueness tracking in the :3310 loop).
- `is_shared` / low-attribution bowls deferred (:487; `index.ts:376`).
- B-138: a long-acting, regimen-unlinked drug is invisible to the point model (:513–518).
- B-174: in-doubt combo-dose residual (:636).
- B-376: a photoless incident is under-counted versus the report (:1709).
- ⑦: intrinsic residual; six unrelated vomits fire (:2388–2394). **CUL-686 (High, Waiting on PM)**: cough is silent for its first 21 days however dense it is; a density OR-arm was priced at 0/200k null (:2500–2507).
- ⑥: n=8 slice at 7.4% (:2612).
- ③/④: the logged-days floor is coarse; meals can mask a symptom-logging gap (:3848–3855, :4016–4019).
- ④: absolute burden in week 1 (no prior week) is out of scope (:4129).
- L1: three named limits (:4990–5009): circadian vs schedule; an unlogged meal flips post-prandial episodes to empty-stomach; once-daily feeders have a sensitivity floor.
- L2:
  - vomit-only, so derm- and diarrhoea-led trials are silent (:5216–5221)
  - a phenotype-only shift is invisible
  - **symptom-logging attrition produces a false "fewer" 14–35% of the time at realistic attrition** (:5236–5244; the density gate cannot see it)
- L4: autocorrelated residual 5–6%; the `runLength` 4-vs-5 decision is open (:2285, :5538).
- Staple diagnostics: add-protein and sparse-protein cases deferred (:5702).
- B-084: UTC-day residual (:5886, :6062).
- B-361: red-flag recency is anchored on `occurred_at`, so a back-dated flag never leads (:6277).
- B-788: same-millisecond tie-break flipped in ⑤ (:4576–4590; CUL-88).
- The med context window is anchored at now, not the finding's span (`medContext.ts:31–41`).
- Stand-down detects abandonment, not attention (ledger).
- Summary model re-enable is gated on B-096.

#### Open decisions and backlog (Linear, read 2026-09-24)
- **CUL-583 (Urgent, Waiting on PM)**: the batched clinical sitting. It includes ⑦ `minEpisodes` 6-vs-5 (CUL-179).
- CUL-17: D2 absence-shaped trial sentence (spec §8.1).
- CUL-205 (B-764): confound copy for the MORE direction.
- CUL-247 (B-754): `timingReliable` predicate.
- CUL-116 (B-760): base-rate control on the timing card.
- CUL-78 (B-772): intake watching lane.
- CUL-80 (B-773): gap row beyond vomit.
- CUL-684: W2 respiratory lanes blocked.
- CUL-508 (B-758): synthetic corpus.
- CUL-255 (B-047): instrumentation.
- CUL-989: truncation.
- CUL-1099: dose query.
- CUL-772: stale TTL.

#### CLAUDE.md Open Questions still open
- Emerging-signals (sub-floor associational) tier.
- LLM "gestalt reviewer" over computed findings: escalate / re-rank / veto only.
- An owner-facing council-style report.
- Critical-drug missed-dose escalation.

#### Spec drift
Spec §2 says L1 uses witnessed/estimated onsets with `minLongGapFraction` 0.25. The shipped code uses witnessed-only onsets and 0.6.

---

### 7. Latency, cost and runtime

- **Triggers are all client-side; there is no server cron.**
  - Debounced 5s after a meal, symptom, dose or simple-event log, or a delete or undo (`lib/signal.ts` `triggerSignalRegenDebounced`, `REGEN_DEBOUNCE_MS` 5000).
  - Home open when the cache is missing or expired (`hooks/useSignal.ts:196–198`; `isSignalCacheStale`, `lib/signal.ts:647`).
  - Every active pet is refreshed for the cross-pet banner (`readSignalsAndRefresh`).
  - Logging a weight or a daily look deliberately does **not** trigger a regen (`lib/weight.ts:14–16`, `lib/looks.ts:186`).
- **Concurrency**: one regen per pet with a single trailing run, bounded by a 15s ceiling. The pending sync queue is flushed first; flush errors are swallowed (CUL-772).
- **Window**:
  - Events: 180 days.
  - Regimens and free-feeding arrangements: all time.
  - Lane windows: 7+7d, 14d, 49d, 56d and 60d as listed above. ① and L4 use all 180 days.
- **Expiry**: `expires_at` = NOW() + 24h. Rows are replaced on each regen and never reaped.
- **Cost controls**:
  - Per-pet cap of 12 per day and 240 per month through `record_ai_usage`; fails open (`index.ts:635–724`).
  - Haiku is called only for model-phrased types: at most the 4 insight cards plus any `intake_decline` cards, run in parallel.
  - The summary makes no model call.
  - Detection is pure in-memory TypeScript; its cost is dominated by the reads: 9 parallel PostgREST queries, plus `app_config`, the usage RPC and the prior `ai_signals` row.
- **Deploy**:
  - `generate-signal` is past the inline MCP ceiling and deploys from the Codespace.
  - Live version: v33.
  - A pending bundle carries CUL-778, CUL-787 and CUL-786 behind client build gate CUL-794.
  - CUL-1099's fix will change live output for any pet with dose logs; its issue requires an adversarial review before deploy.

---

## Lane B: the per-incident vomit analysis engine, and where its red flags come from

Written 2026-09-24. Read-only pass over `main` @ 892eb88 (a shallow clone; commit history came from the GitHub API) plus the Linear issues it cites. I ran no database queries and edited no repo files.

**PM report:** "Vomit analysis has raised more red flags for me than it's worth. None truly screamed problematic."
**Working hypothesis:** the escalation path fires too often (alarm fatigue).

**Short answer.** The engine has two firing populations, and they reach different surfaces.

- **Visual flags.** The model reports blood or foreign material in the photo. These are the only per-incident findings that reach Home, the cross-pet banner, the vet-visit "Get ready" list and the vet report. So one false positive gets shown about six times, for 14 days.
- **Contextual flags.** Repeated vomiting, feline reduced intake and concurrent lethargy. These produce "Worth a call" on the incident screen and on the per-read design-v2 surfaces, but never on the Home Signal.

The PM's own evidence points at the first population:
- 2026-07-13: a toy elsewhere in the frame and the seasoning on deli meat were both read as foreign material (CUL-403).
- 2026-09-23 (CUL-1101): "fired 3-4 times and each time I haven't necessarily agreed w/ the warning … (ex.. blood in vomit yes to no)".

Several mechanisms in the code make the contextual population noisier than it needs to be. Below the firing layer sit two more problems:
- The verdict is a single bit. Two piles in one bout and coffee-ground blood both get "Worth a call".
- Every read, including the calm ones, ends by telling the owner to call the vet.

---

### 1. The model call

#### 1.1 Parameters

| Item | Value | Citation |
|---|---|---|
| Model | `claude-sonnet-4-6` (stool is the same) | `supabase/functions/analyze-vomit/index.ts:577` |
| Endpoint / API version | `https://api.anthropic.com/v1/messages`, `anthropic-version: 2023-06-01` | `_shared/incident-analysis.ts:651-657` |
| `max_tokens` | 1024 | `_shared/incident-analysis.ts:470` |
| **Temperature** | **Not set, so the API default (1.0) applies.** Every call, including every "Re-run analysis", is a fresh stochastic sample. | `_shared/incident-analysis.ts:658-670` (no `temperature` key) |
| Tool forcing | `tools: [descriptor.tool]`, `tool_choice: { type: 'any' }` (single tool, so structured output is forced) | `:662-663` |
| User message | Up to 3 image blocks, then the text `'Analyse this photo of pet vomit.'` | `:664-668`, `analyze-vomit/index.ts:580` |
| Photos per call | `MAX_PHOTOS_PER_ANALYSIS = 3` (the first 3 by `sort_order`). **All frames go into one call, and a flag from any frame escalates the event.** | `:468`, `:924-928` |
| Image size | Raw object ≤ `floor(5_242_880/4)*3` ≈ 3.93 MB is sent as-is. Larger objects are re-fetched through the imgproxy transform at 1568px `contain`; if that still fails, `photoUnreadable`. | `:451-470`, `:544-570` |
| Media type | Sniffed from magic bytes (JPEG, PNG, GIF, WebP). Anything else is declared jpeg, so HEIC returns a Claude 400, which becomes `photoUnreadable`. | `:479-491`, `:945-950` |
| Ask live reads | `transform_only: true` sends every photo through the EXIF-stripping transform | `:683-689`, `:716`, `:544-557` |
| Timeout | 30s AbortController. A timeout is transient: it throws and writes a `failed` row, never a degraded read. | `_shared/http.ts:18-45` |
| **Retries** | **None server-side.** A non-400 error goes to the outer catch, which writes `failed` and a client "Try again". A 400 degrades to `photoUnreadable`. | `_shared/incident-analysis.ts:935-951`, `:1056-1110` |
| Model-emitted confidence | Stored in `ai_confidence` (JSONB). **No code anywhere reads it**: not the floor, the Signal, the report or Ask. | `analyze-vomit/index.ts:271,450`; grep of `generate-*`, `ask`, `components/event`, `lib/analysis.ts` finds no consumer |
| Model or prompt version on the row | **Not stored.** `event_ai_analysis` has no model or prompt-version column. | `supabase/migrations/013_*.sql:145-206` |

#### 1.2 Caps and gates

- **Caps:** `CAPS = { daily: 10, monthly: 200 }`, `FUNCTION_KEY = 'analyze_vomit'`, `FLAG_KEY = 'ai_vomit_read_enabled'` (`analyze-vomit/index.ts:564-566`). They are the same on every tier (D-M2). `app_config.ai_caps` can override them (`_shared/incident-analysis.ts:396-425`).
- **Counting:** `record_ai_usage` is post-increment, and a call is blocked when `count > cap`, so exactly 10 model reads run per UTC day (`:380-390`, `:429-441`). Both an RPC error and a config-read error fail open (`:416`, `:423`, `:435-437`).
- **What the gate covers:** only the model call, and only when a photo exists (`:820-825`). Contextual flags are computed before the gate (`:788`), so a capped or flag-off incident still escalates on context (`:831-906`).
- **Ask:** live reads count against the same cap (`ask/index.ts:515-545`).
- **Cap copy:** "Today's photo reads are used up, so this read will run tomorrow. Everything you logged is saved. If {pet} keeps vomiting or seems off, don't wait for the read — check in with your vet." (`constants/monetizationCopy.ts:40-44`)
  - Nothing re-runs a capped read. `start()` returns early on any non-`pending` row (`VomitAnalysisSection.tsx:179-182`), and the capped card has no retry button (`:337-345`). "will run tomorrow" is therefore not true.

#### 1.3 The system prompt, verbatim

From `analyze-vomit/index.ts:199-213`, concatenated:

> You are a veterinary triage assistant analysing a single photo of pet vomit, logged by a pet owner. You produce two things from this one photo: (1) factual structured fields describing what is visible, and (2) a brief, calm owner-facing read of this single instance. Hard rules: (1) You are looking at ONE instance. You never diagnose, never name a disease or condition, never suggest treatment, medication, or dosing. (2) You may flag the PRESENCE of something visibly concerning — visible blood (fresh red or coffee-ground/digested), or material that does not look like food — and when present, recommend the owner call their vet. You phrase this calmly, without alarm. (3) You NEVER reassure based on the absence of a visible problem — absence of a visible red flag does not mean the pet is well, and is never an all-clear. When you see no red flag, do NOT comment on that absence at all: do not say a photo looks fine/normal/okay, that there is nothing concerning or alarming, or that there is nothing to worry about. Instead, describe plainly what IS visible in this one photo, then give a single calm, forward-looking line — what to keep an eye on (e.g. if it happens again, or the pet seems unwell or off their food), and that the vet is the best call if the owner is worried. Never say or imply the pet is "fine", "okay", "healthy", or "normal". (4) For any structured field not clearly visible, return "unsure" — never guess. Set confidence to reflect legibility. (5) If the photo does not appear to show vomit, set appears_to_show_vomit=false, leave fields "unsure", and recommend not_enough_to_say. (6) Plain owner language, not clinical jargon ("blood" not "haematemesis", "something that is not food" not "foreign body"). No exclamation marks. Call the analyze_vomit tool with your findings.

**Notes on the prompt:**
- It carries three separate anti-reassurance instructions and no precision guidance at all. Nothing like "flag blood only when clearly visible" appears.
- There is no list of common mimics: red or brown kibble, dyes, treats, tomato or beet, partly digested dark kibble that looks like coffee grounds, warm indoor light, a red or patterned rug.
- Nothing restricts findings to material *in* the vomit as opposed to objects elsewhere in the frame. The CUL-403 toy case is exactly this.
- The only precision lever is rule (4), "unsure, never guess". It applies to structured fields, but the `visual_flags` array is not tied to it (see §1.4).

#### 1.4 The tool schema, verbatim

From `analyze-vomit/index.ts:131-197`.

- **Tool** `analyze_vomit`: "Record structured observations and a single-instance owner-facing read for one photo of pet vomit. Return \"unsure\" for any field not clearly visible — never guess."
- `required: ['appears_to_show_vomit', 'recommendation']`

| Field | Type / enum | Description (verbatim) |
|---|---|---|
| `appears_to_show_vomit` | boolean | "True only if the photo plausibly shows pet vomit. False if it shows something else (the pet, food, stool, an empty floor, etc.)." |
| `colour` | `clear, white, yellow, green, brown, tan, pink_red, dark_red, black_coffee_ground, mixed, unsure` (`:83`) | "Dominant colour of the vomit." |
| `contents` | array of `undigested_food, partially_digested_food, bile, foam, liquid_only, grass_or_plant, hair, unsure` (`:84`) | "Visible material in the vomit (may be several). Do NOT include blood or foreign material here — those have dedicated fields." |
| `consistency` | `watery, foamy, mucoid_slimy, soft_formed, chunky, unsure` (`:85`) | "Overall consistency." |
| `blood_present` | `none_visible, fresh_red, coffee_ground, unsure` (`:86`) | "fresh_red = bright/red blood; coffee_ground = dark, granular digested blood; none_visible = no blood seen; unsure if not legible." |
| `bile_present` | `yes, no, unsure` | "Yellow/green bile visible?" |
| `foreign_material_present` | `yes, no, unsure` | "Anything that is not food/bile/foam — fabric, plastic, string, bone, **plant matter that looks non-dietary**?" |
| `foreign_material_note` | string | "Short plain description of the suspected foreign material, only if foreign_material_present = yes." (CUL-240 found this is also populated on `unsure`.) |
| `description` | string | "One or two calm, plain-language sentences describing what is visible. Owner-facing. No jargon, no diagnosis, no exclamation marks." |
| `visual_flags` | array of `blood, suspected_foreign_material` (`:88`) | "Set \"blood\" if blood_present is fresh_red or coffee_ground; set \"suspected_foreign_material\" if foreign_material_present is yes." |
| `recommendation` | `worth_a_call, monitor, not_enough_to_say` | "worth_a_call = a visible red flag is present (blood or foreign material); monitor = this photo shows nothing obviously concerning ON ITS OWN; not_enough_to_say = the photo is unclear or does not appear to show vomit. NEVER choose a value that reassures the owner the pet is well." |
| `read_text` | string | "One or two sentences, owner-facing, matching the recommendation. For worth_a_call, name the visible concern plainly and calmly suggest a vet call. For monitor, do NOT comment on the absence of red flags (never \"nothing concerning/alarming\", \"looks fine/normal\", or \"all clear\"): instead state plainly what IS visible in this one photo, then one calm forward-looking line — what to keep an eye on and that the vet is the best call if the owner is worried or it recurs. No diagnosis, no treatment, no exclamation marks; never say or imply the pet is fine/okay/healthy/normal." |
| `confidence` | object with 0–1 values for colour, contents, consistency, blood_present, bile_present, foreign_material_present | "Per-field legibility confidence 0.0–1.0." (never read downstream) |

**Schema observations:**
- "bone" and "plant matter that looks non-dietary" sit inside the foreign-material definition. Grass is common and usually benign in dog vomit, and it already has its own `contents` value (`grass_or_plant`), so the model has two places to put it, and one of them escalates.
- Bone fragments from raw feeding or chews also land in the escalating field.
- Hair, a hairball or a dental chew can look like "string" or "not food".

#### 1.5 How the result is parsed

`parseAnalysisToolResult`, `analyze-vomit/index.ts:219-273`:
- Invalid enum values become null. A missing recommendation becomes `not_enough_to_say`.
- `visual_flags` = `sanitizeEnumArray(input.visual_flags, VISUAL_FLAGS)`: **the model's array only** (`:225`).
- `read_text` and `description` are nulled unless the model itself chose `worth_a_call` (Pattern 10 layer 1, `:245-247`).

**Stool does this differently.** analyze-stool derives visual flags from its structured fields and unions them with the model's array (`analyze-stool/index.ts:279-283`). Vomit does not; CUL-534 (Todo, Medium) covers bringing vomit into line. Consequences:
- The model can set `blood_present='coffee_ground'` without adding `blood` to `visual_flags`. The incident card then says **Keep an eye out**, while Home derives from `blood_present` and shows **"showed possible blood — worth a call to your vet"**.
- The model can put `blood` in `visual_flags` with `blood_present='unsure'`. The incident card then says **Worth a call** ("I can see what looks like blood…") and Home shows nothing.
- The skill's Pattern 9 "canonical example" says the floor derives from structured fields. For vomit that is not true today.

---

### 2. The escalation floor

#### 2.1 The decision function

From `_shared/incident-analysis.ts:102-115`:

```ts
if (params.contextualFlags.length > 0) return 'worth_a_call'
if (params.visualFlags.length > 0) return 'worth_a_call'
if (!params.hasPhoto) return 'not_enough_to_say'
if (!params.appearsToShowSubject) return 'not_enough_to_say'
if (params.modelRecommendation === 'worth_a_call') return 'worth_a_call'
return 'monitor'
```

So a vomit gets `worth_a_call` on any one of these:
- **(a)** any contextual flag;
- **(b)** any model visual flag;
- **(c)** the model's own `worth_a_call`, provided the photo shows vomit. This path needs no flag at all: the model can escalate on anything it likes.

After the floor, `shouldCollapsePartialRead` (`:135-142`, applied at `:977-981`) drops a non-escalating read to `not_enough_to_say` when only some of the photos could be read. An escalation is never collapsed.

`status` is `'uncertain'` when the result is `not_enough_to_say`, and `'completed'` otherwise (`:1014`).

#### 2.2 Contextual flags

`computeContextualFlags` (`analyze-vomit/index.ts:291-314`) runs over `assembleContext` (`:491-554`) before the vision call.

| Flag | Exact rule | Window anchor | Guards | Citations |
|---|---|---|---|---|
| `repeated_vomiting` | Count of vomit events with \|t − this.occurred_at\| ≤ 4h is **≥ 2**, **or** the count with \|t − this\| ≤ 24h is **≥ 3**. The count **includes this event** (pushed in if the read raced the write). | SQL fetch: vomit events with `occurred_at >= now − 24h`, no upper bound. `within()` uses **absolute** `hoursBetween`, so vomits *after* this one count too, on a re-analysis. | Soft-deleted rows excluded. **No episode collapse and no dedup**, so re-logs, multiple piles from one bout, and hairballs or regurgitation logged as vomit (there is no separate leaf; W2b is not buildable) all count. | constants `:67-70`; count `:294-301`; fetch `:504-510`; race push `:529-531`; `hoursBetween` is `Math.abs` at `_shared/incident-analysis.ts:92-94` |
| `feline_reduced_intake` | `species === 'cat'` **and** `tracksIntake` **and** `!hasRecentPositiveIntake` | `tracksIntake` = any `meal` event in the last **7 days (from now)** whose `meals.intake_rating` is non-null, of **any** value. `hasRecentPositiveIntake` = any meal in the last **24h (from now)** rated `most` or `all`. | Pattern 6 guard, but weak (see H5). Unrated meals in the last 24h count as absence. `some` and `picked` count as absence. Free-feeding arrangements are ignored. Treats logged as meals count as positive. The window is anchored on now, not the vomit. The comparison is a lexical string compare (`m.occurred_at >= felineWindowAgo`), the C-40 hazard; its effect at the boundary second is negligible. | `:74`, `:80`, `:499-500`, `:519-526`, `:541-544`, `:305-307` |
| `concurrent_lethargy` | Any non-deleted `lethargy` event with `occurred_at >= now − 24h` | **Now**, not the vomit's time. No upper bound. | **None**: no tracking guard and no severity (lethargy has `hasSeverity: false`, `constants/eventTypes.ts:103`). | `:75`, `:501`, `:511-518`, `:533`, `:309-311` |

**Correction to CUL-131 (B-361).** That issue says the now-versus-occurred_at anchoring "never wrongly alarms, only wrongly stays silent". That holds for `repeated_vomiting` only. The two presence flags have no `within()` gate and are anchored to **now**. So any late analysis of an older vomit reads today's lethargy and today's intake as if they were concurrent. Late analyses happen when:
- a photoless vomit is first opened from History (the section triggers on mount, `VomitAnalysisSection.tsx:174-212`);
- the owner taps "Re-run analysis" (`:443-451`);
- a photo is added later (`app/event/[id].tsx:~655-690`);
- Ask runs a live read (`ask/index.ts:515-556`).

In each case the result is written and persists.

#### 2.3 Visual flags

- `visual_flags` holds only what the model emitted in its array (`analyze-vomit/index.ts:225`). It is not derived from `blood_present` or `foreign_material_present` (CUL-534).
- **Every frame counts.** Up to 3 frames go in one call, so a finding on any frame flags the whole event.
- **No confidence threshold is applied.** `ai_confidence` is never read.
- The floor treats `blood` and `suspected_foreign_material` identically: either one gives `worth_a_call`.
- `blood_present='unsure'` does **not** escalate (the B-042 request to treat it as a soft trigger was not built). `foreign_material_present='unsure'` together with a note surfaces a deterministic "Possible — not identified" row on a `monitor` card (CUL-240, `VomitAnalysisSection.tsx:494-507`). That is visibility only.

#### 2.4 Which read text is chosen

`selectReadText`, `_shared/incident-analysis.ts:171-196`, picks the first rule that matches:

1. Any contextual flag: the contextual template, highest priority first.
2. Photo unreadable: the unreadable template.
3. `worth_a_call`: the model's `read_text` if it survived the parse gate (the model itself escalated), otherwise the visual-flag template.
4. `monitor`: the monitor template.
5. Otherwise: the no-flag template.

`description` is gated the same way after the floor (`selectDescription`, `:214-225`, applied at `:1005-1012`).

#### 2.5 Read-text templates, verbatim

From `analyze-vomit/index.ts:341-407`. `{p}` is the pet name, falling back to "Your pet" or "your pet".

**Contextual.** When several flags fire, the highest-acuity one is used, in this order: intake, then repeat, then lethargy.
- `feline_reduced_intake`: "{p} has been vomiting and hasn't eaten a full meal recently. In cats that combination is worth a call to your vet sooner rather than later."
  - Note: this states as fact that the cat hasn't eaten, based only on an absence of rated logs.
- `repeated_vomiting`: "{p} has thrown up more than once in a short window. Repeated vomiting like that is worth a call to your vet."
- `concurrent_lethargy`: "{p} has also been low on energy around this. Together, that's worth a quick call to your vet."

**Visual-flag fallback** (a `worth_a_call` with no surviving model text): "I can see {what looks like blood | something that doesn't look like food | what looks like blood, and something that doesn't look like food, | something worth a closer look} in this photo. That's worth a call to your vet about {p}."

**Model's own `read_text`.** Surfaced only on a non-contextual, readable `worth_a_call` that the model itself chose.

**Monitor:** "A single photo on its own can't tell you how {p} is doing. Keep an eye on {p} — if it happens again, or {p} seems unwell or goes off food, your vet is the best call."

**Not enough to say:**
- With a photo: "There's not much I can read from this one on its own. If you're worried about {p}, your vet is the best call."
- Without a photo: "Without a photo there's not much I can read from this one on its own. If you're worried about {p}, your vet is the best call."

**Photo unreadable:** "I couldn't read this photo — it may be too large or in a format I can't open. Try replacing it with a fresh shot and I'll take another look. If you're worried about {p}, your vet is the best call."

**Every card carries a disclaimer:** "This is a quick read of a single moment, not a diagnosis." (`components/event/IncidentReadCard.tsx:32`)

**Labels** (`lib/incidentReadState.ts:41-45`): `Worth a call` / `Keep an eye out` / `Not enough to say yet`. `worth_a_call` gets a rose rail, the `colorEventSymptomLight` ground and the ink label (`IncidentReadCard.tsx:114,182-222`).

**Observation.** Every branch, the cap copy included, ends by naming the vet. No read ever leaves the vet out. And the verdict carries a single bit: two piles in four hours and coffee-ground blood produce the same label, the same rose rail and the same "call your vet".

#### 2.6 Stool's contextual flags, where a vomit crosses over

From `analyze-stool/index.ts:83-89`, `:346-364` and `:573-620`:
- `concurrent_vomiting` fires when any vomit event has `occurred_at >= now − 24h`. The limit is 1 row. **Nothing checks the stool's type**, so it fires on `stool_normal` (formed) as well as on `diarrhea`.
- The copy it gets: "{p} has been vomiting around the same time as this. Vomiting and loose stool together can run a pet down quickly, so it's worth a call to your vet."
  - On a normal, formed stool that sentence says "loose stool", which is factually wrong for that event.
- So **one vomit makes every stool read in the following 24h `worth_a_call`.** That includes photographed stools, which are routed to the incident screen after logging.

---

### 3. Every surface where one vomit can become an escalation

**Where analysis runs.** There are five triggers:
1. The log path, only when a photo was attached (`lib/simpleEvent.ts:117-118,143-222`).
2. The incident screen on mount, when no row exists. This runs **whether or not there is a photo** (`VomitAnalysisSection.tsx:174-221`; the comment at `:355-357` says so).
3. Retry and "Re-run analysis", which is always visible on a read (`:223-241`, `:443-451`).
4. Adding or replacing a photo (`app/event/[id].tsx` around `:655-690`).
5. Ask live reads (`ask/index.ts:515-556`).

**Routing.** Since CUL-800/802 (2026-09-05), a vomit or stool logged **with a photo** lands the owner on `/event/[id]`, where the read "arrives" with motion (`docs/nyx-incident-screen-requirements.md` §0 D1-D4). Before that, the read could only be reached through History. So from 5 September on, every photographed read has been put in front of the owner.

| # | Surface | What triggers an escalation there | How long it persists | Does it fire again on the next vomit? Dedup, cooldown, acknowledgement? |
|---|---|---|---|---|
| 1 | **Incident screen read card** (`VomitAnalysisSection.tsx:381-452`, `IncidentReadCard`) | `recommendation === 'worth_a_call'` from any branch in §2.1: contextual, visual, or the model's own. A `failed` row that still holds `worth_a_call` is also shown (`:303`, `escalationSurvivesFailure`). | Permanent on that event. It is **frozen when computed** and never recomputed unless re-run. Deleting the vomit that caused a `repeated_vomiting` flag does not lower the flag on the remaining event. | Each new vomit is evaluated on its own. With no dedup or cooldown, a 3rd vomit in 24h, or a 2nd within 4h, gets its own `worth_a_call`. **Hide** sets `dismissed_at` (`:243-256`) for this card only. |
| 2 | **Home Signal `incident_red_flag` card** (`generate-signal/detection.ts:6149-6337`; template `phrasing.ts:218-237`) | **Visual only**, and derived from the **structured fields**: `blood_present ∈ {fresh_red, coffee_ground}` or `foreign_material_present === 'yes'` (`:6162-6181`). Status is not filtered and `dismissed_at` is not read (`generate-signal/index.ts:866-876`). **Contextual flags never reach Home** (B-340 was scoped to visual only, decisions-archive row 69). | **14 days** from the incident's `occurred_at` (`detection.ts:2636-2641`). Ranked **first in the safety band**, above intake decline (`:6449-6467`). | One card per family, pooling the last 14 days. A new flagged photo raises the count and moves "most recently", and that re-opens a fold. The fold ("Keep it compact") is device-local and permitted (`lib/signalFold.ts:85-90,257-263`). **Hide on the incident card does not clear it.** Only editing the structured field does, and only at the next Signal regen. Nothing regenerates the Signal when a read lands or an edit is saved (CUL-1105). |
| 3 | **Cross-pet safety banner** (`lib/signalCopy.ts` `bannerRest`, ~`:2084-2095`) | The same `incident_red_flag`, but on a *different* pet's Home. Highest banner priority. Copy: "{pet} has a logged photo showing possible blood — worth a look." | For as long as that pet's cached finding exists (14 days). | Same as row 2. |
| 4 | **Signal card expanded evidence** (`signalCopy.ts:756-773`, `:2084-2090`) | Same | Same | Same. Copy: "…an automated read of a single photo, not a confirmed finding and not a diagnosis. It's still worth a call to your vet…" |
| 5 | **Vet visits "Get ready" / Worth raising** (`lib/getReady.ts`, CUL-903) | Quotes Signal safety findings word for word. **Safety rows are never capped away** (`:78-80`, `:212`). | While the finding is cached and an appointment is in the five-day window | Same as row 2. |
| 6 | **Vet report page-1 safety band and appendix** (`generate-report/report.ts:2848-2867` `unionPresentFlags`; `render.ts:1875-2000`) | Present-only blood (fresh or coffee-ground) or foreign material `yes`, from the structured fields. Unioned across re-log duplicates regardless of status. Line: "N vomiting incident(s) (dates) — possible [coffee-ground (digested)] blood on automated photo analysis. [AI] Shown because it is present; a photo cannot exclude bleeding." Thumbnails are included. **The recommendation, read text and contextual flags never reach the report** (`report.ts:1628-1632`). | Every report whose window includes the incident | Deduplicated within 60s (B-368). `dismissed_at` is ignored. An owner's "Unclear" clears the line (CUL-1104). |
| 7 | **Ask** (`ask/tools.ts:880-910`, `ask/answer.ts:670-700`) | Only on an owner question that recalls or reads the event. The deterministic `buildReadLine` repeats the stored `read_text` (so the contextual template is repeated too) plus derived present flags. | Per question | `dismissed_at` hides `read_text`, but the flags still come through. |
| 8 | **Home spine node** (design v2; `lib/spineNode.ts:195-232`, `TodayCard`) | `recommendation === 'worth_a_call'` on today's symptom rows, shown in rose ink. This **includes a photoless vomit that has a row**: the comment "a row exists only for a photographed incident" is wrong for vomit. | Today only | **Respects `dismissed_at`** (`:209`). |
| 9 | **Patterns month calendar photo layer** (design v2; `lib/monthReads.ts:185-227`, `monthModel.ts:432`) | Any photographed event whose row says `worth_a_call`, whether visual or contextual | **Permanent**; the day is painted rose | **Ignores `dismissed_at`** (it selects only `event_id, recommendation`). The accessible label reads "…N read as worth a call." |
| 10 | **Signal screen EpisodeGallery** (design v2; `lib/signalScreen.ts:606-640`, `EpisodeGallery.tsx`) | The recommendation for each photographed episode tile | As long as the finding is shown | **Ignores `dismissed_at`.** For a chronic vomiter's card, this is a gallery of rose "Worth a call" tiles, one per `repeated_vomiting` read. |
| 11 | **Stool incident screen** (cross-type, §2.6) | Any vomit in the last 24h makes every stool read `worth_a_call` | Permanent on the stool event | Fires again for every stool in the window, normal or loose. |
| 12 | **Notifications** | **None.** No notification code reads `event_ai_analysis` or `incident_red_flag` (grep over `lib/notifications*.ts`). | — | — |

**Other things a vomit feeds** (from the vomit event itself, not its analysis): Signal lanes ⑦ chronicity, ④ worsening, ⑤/L1 timing, and the report's frequency tiles. They have their own floors and are out of scope here, but they add to the total count of "vomit warnings" the owner sees.

**Overall pattern:**
- **Visual flags** fan out widely and last 14 days. A single false positive can appear on the incident card, Home #1, the cross-pet banner, Get ready, the report and the month calendar.
- **Contextual flags** appear on fewer surfaces but fire more often. They land on the incident card and then permanently on the per-read design-v2 surfaces.
- **Nothing coordinates across vomits.** There is no "you've already been told", no cooldown, and no link to a vet visit that has been booked or completed. A search of `generate-signal` and `analyze-*` for `vet_visits` or `vet_appointments` finds nothing.

---

### 4. Owner feedback

| Mechanism | What it does | What it doesn't do |
|---|---|---|
| **Edit structured fields** (B-028; `lib/analysis.ts:334-478`, `VomitFieldsEditor`) | Writes colour, consistency, contents, blood, foreign material, note and description, plus `edited_at`. Home, the report and Ask derive from these fields, so setting blood to "None visible" clears Home (at the next regen) and the report line. A re-analysis never overwrites edits (`buildAnalysisWriteBack`, `_shared:252-275`). | **Does not update the incident card.** `recommendation`, `read_text` and `visual_flags` are not editable (`:447-459`), so the card keeps saying "Worth a call — I can see what looks like blood" after the owner says there is none (CUL-409 / B-339). **"Unclear" works like "No"**: it clears the Home card and the report line (CUL-1104, High). No regen after an edit (CUL-1105). After any edit, a replaced photo's new findings never reach Home or the report (CUL-1110, High). The path is hard to find: open the incident, tap Edit, change a chip. |
| **Hide (`dismissed_at`)** (`VomitAnalysisSection.tsx:243-256`) | Hides this card behind "AI note hidden · Show". The spine and Ask's `read_text` respect it. | The Home Signal, banner, report, month calendar and EpisodeGallery all ignore it. No reason is recorded. |
| **Signal fold** (`lib/signalFold.ts`) | Compresses the Home card on this device only. It re-opens on a new flagged photo. | Not synced. Doesn't clear anything. Carries no outcome. |
| **Re-run analysis** | Draws a fresh sample at temperature 1.0 and recomputes context as of now. The latest successful write wins. | Not a correction; it is a re-roll. It can flip `monitor` to `worth_a_call`, or the reverse (CUL-827 covers the reverse). |
| **Learning** | None. Edits leave the model's original in `ai_raw_payload`, so each edited row is a latent (AI value, owner value) pair. | Nothing reads that pair to tune the prompt or thresholds. `ai_confidence` is unused. No model or prompt version is stamped. |
| **Outcome capture after "Worth a call"** | None. Nothing asks whether the owner called or what the vet said. The Vet Visits companion (out of beta 2026-09-23, CUL-905) records visits, but nothing links a visit to the flag that prompted it, and flags are not suppressed while a visit is booked. | CUL-1101/1107 propose: FR-4 "stand until *I've talked to my vet* or a vet visit is logged"; FR-2 a "No" stands the ask down but keeps both views; FR-7 stamp model and photo version. **The sanity check recommends building only S1**, which makes today's correction honest, **plus a report line**, and parking the yes/no question. Waiting on PM (CUL-1107). |

**History of the 2026-07-13 ruling.** B-340 moved red flags onto Home on the premise that *"false positives are cheap to course-correct: the owner already edits the AI analysis"* (decisions-archive row 69). The persona dissent at the time was: *"two false positives already, so the trust cost of crying wolf"*. Three problems now undercut that premise:
- the correction path is undiscoverable;
- it is leaky (CUL-1104, CUL-1105, CUL-1110);
- it leaves the incident card unchanged (CUL-409).

---

### 5. Why it over-escalates: hypotheses, most likely first

**H1. The model reports blood or foreign material that isn't there, and each false positive shows up about six times over 14 days.** *Most likely to explain the PM's experience.*
- Evidence: the PM's own record. CUL-403: a toy elsewhere in the frame, and deli-meat seasoning read as a "stick". CUL-1101: "fired 3-4 times… blood in vomit yes to no".
- How the code produces it:
  - the prompt has no guidance on precision or mimics (§1.3);
  - the foreign-material definition invites bone and plant matter, and grass already has a `contents` slot (§1.4);
  - the "coffee_ground = dark, granular" definition matches partly digested brown kibble;
  - the model is deliberately given **no diet context** (Pattern 3 forbids multi-sample context, and that rule also keeps "she ate a red dental chew" out);
  - temperature 1.0;
  - up to 3 frames are read together, and any one of them escalates;
  - `visual_flags` is trusted with no confidence threshold, and `ai_confidence` is never read;
  - the model can also escalate on its own with no flag (floor rule 5).
- Why it hurts more than the firing rate suggests: visual flags are the only escalation that reaches Home (#1 for 14 days), the banner, Get ready and the report. Hide doesn't clear any of them.
- The CUL-534 split (the card uses the model's array, Home uses the structured field) can also make Home warn about an incident whose own card says "Keep an eye out".

**H2. The verdict is one bit, and every read tells the owner to call the vet.**
- Two piles in 4h, a lethargy log, and coffee-ground blood all render as the same rose "Worth a call" with a vet-call line (§2.5).
- The monitor, not-enough, unreadable and cap texts all end with "your vet is the best call" or "check in with your vet".
- The cross-incident worsening lane has three registers (firm, standard, soft; decisions-archive row 44). The per-incident floor has one.
- This fits the PM's "none truly screamed problematic": even correct fires are mostly low-acuity, and they look identical to the rare high-acuity one.

**H3. `repeated_vomiting` counts raw rows, not episodes.**
- The rule is ≥2 within 4h or ≥3 within 24h, counting this event, with **no collapse** (§2.2).
- The engine's own episode definition treats vomits within 3h as **one episode** (`lib/mealTiming.ts:160-176`, `symptomEpisodes.ts:51`). So a cat that brings up two piles in one bout, or an owner who photographs two spots or double-logs, gets "thrown up more than once in a short window". The Signal engine counts that as one episode.
- Hairballs and regurgitation are logged as vomit, since there is no separate leaf.
- For a chronic vomiter, how often this fires depends on how its vomiting is bunched into bouts rather than on severity. There is no memory: every qualifying vomit fires again.
- The flag is frozen. Undoing the duplicate that triggered it does not lower it.
- Absolute `hoursBetween` lets later vomits count on a re-analysis.

**H4. Presence flags are anchored on now, so a late analysis picks up context that isn't concurrent** (§2.2). A photoless vomit opened days later from History, a Re-run, an added photo, or an Ask live read each evaluate "lethargy in the last 24h" and "no most/all meal in the last 24h" against today. The result is written permanently and paints the month calendar. CUL-131's claim that this never wrongly alarms is wrong for these two flags.

**H5. `feline_reduced_intake` has a weak guard.** Cats only. Common cases that fire it:
- the owner rated any meal once this week, but the last 24h of meals are unrated (the one-tap default is `intakeRating: null`, `lib/meals.ts:70`);
- a grazer (Sam's cat) normally rated `some` or `picked`;
- a free-fed arrangement, which this flag ignores although the engine and report honour it;
- a once-a-day logger whose vomit comes just over 24h after the last rated meal.

Its text asserts **"hasn't eaten a full meal recently"**, which the owner can see is false. That is a trust cost on every such fire. Being ranked highest among contextual flags, it also wins the read text whenever it co-fires.

**H6. `concurrent_lethargy` has no guard.** One lethargy log in the 24h before *now* escalates every vomit, and every stool, in that window. It has no severity and no tracking baseline, so a senior pet whose low energy the owner logs as a routine flags every GI event.

**H7. One vomit spills into stool reads** (§2.6). Every stool read in the next 24h, **including a normal formed stool**, becomes `worth_a_call`, with text that says "loose stool".

**H8. No suppression, acknowledgement or outcome state.** Nothing knows that the owner already called, booked or saw the vet, or already acknowledged the concern. Each new vomit fires again, and each Home card stands for 14 days. (CUL-1107 FR-4 would address this.)

**H9. Re-roll noise.** "Re-run analysis" is always offered. At temperature 1.0 a borderline photo can flip between verdicts on each run, which teaches the owner that the verdict is arbitrary.

**H10. Wider exposure since 2026-09-05** (CUL-800). This is a perception factor rather than a firing-rate one: every photographed read now lands in front of the owner with an arrival animation. The PM's complaint follows the change that made every read visible.

**Lower likelihood.** These paths do not produce `worth_a_call` unless a contextual flag is also present: the cap path, the flag-off path, partial-read collapse, and unreadable photos.

**How to check, without guessing** (for the lead to run; I did not). Using `event_ai_analysis` for the PM's pets:
- group by `contextual_flags` and `visual_flags` against `recommendation`;
- count rows where `edited_at` is set and `ai_raw_payload->>'blood_present'` differs from `blood_present` (owner disagreement);
- count rows with `dismissed_at` set;
- count `worth_a_call` rows where `visual_flags = '{}'` and `contextual_flags = '{}'` (the model escalating on its own, floor rule 5).

That split tells us whether the fatigue comes from H1, from H3/H5/H6, or from the model's own escalations.

---

### 6. What the output feeds downstream: triage or data?

**The structured fields are the long-lived value.**
- Vet report:
  - the per-incident "Photo:" phenotype line (`render.ts:6889-6937`);
  - the contents-category mix over the assessed set (§5.10);
  - the colour aggregation (CUL-981);
  - the present-only blood and foreign-material safety band with EXIF-stripped thumbnails (§5.9);
  - photo embedding for the vet.
- Signals v2 L3 photo composition: counts of retained food, hair and bile that decorate a timing finding (`generate-signal/photoComposition.ts`), present-only, with a denominator of reads that could answer.
- The Home red-flag lane (visual only).
- Ask recall.

**The triage verdict is short-lived and mostly duplicated.**
- `recommendation`, `read_text` and `contextual_flags` are never read by the report or the Signal engine (the report deliberately excludes the n=1 read, `report.ts:1628-1632`). They live only on the per-read surfaces (incident card, spine, month, gallery, Ask).
- The contextual half largely repeats, less rigorously, what the cross-incident lanes already compute with floors, episode collapse and tiers: ⑦ chronicity, ④ worsening, intake_decline (which honours free-feeding).
- The one contextual job with no engine equivalent is acute repetition within 4h.
- The triage value that is unique and clinically significant is concentrated in **true visual findings**. The vet council called a dropped foreign-body read the "highest-consequence" miss (CUL-208). These findings are rare, and they are the class H1 floods with false positives.

**Net.** The engine is more valuable as a **data layer**: vet-facing phenotype, the photo record, L3 composition. As an owner-facing triage layer it is weaker: a one-bit verdict, noisy contextual flags, and visual false positives multiplied across six surfaces.

---

### Appendix: open issues this map touches

| Issue | Status | What it is |
|---|---|---|
| CUL-534 | Todo, Medium | Vomit floor should derive flags from structured fields. Would *raise* sensitivity. |
| CUL-403 | Todo, Medium | Scene objects read as vomit contents. The false-positive class. |
| CUL-1101 / CUL-1107 | In Review / Waiting on PM | Flag review. Sanity check recommends S1 plus the report line. |
| CUL-1104 | High | "Unclear" clears the flag. |
| CUL-1105 | High | No Signal regen after a read or an edit. |
| CUL-1110 | High | After an edit, a replaced photo's findings never reach Home or the report. |
| CUL-409 | — | Stale `visual_flags` / recommendation after an edit. |
| CUL-208 | Todo | Standing flag for `worth_a_call`. |
| CUL-131 | Todo, Low | now-vs-occurred_at anchoring. Its "never over-alarms" claim is wrong for the presence flags; see §2.2. |
| CUL-827 | High | Re-run takes an escalation off the screen. |
| CUL-815 / CUL-819 | — | Failed runs and rescued escalations. |
| CUL-531 | Backlog | "Blood: none visible" shown under a contextual escalation after a partial read. |
| CUL-240 | Done | Surfaces an "unsure" foreign-material fragment as a display row only. |
| CUL-119 | Low | `assembleContext` swallows read errors, which fail silent (under-fire). |

**Commit history.** Every change to `analyze-vomit` and `_shared/incident-analysis.ts` since B-027 (#55, 2026-05-26) has either hardened the pipeline in the escalate direction or fixed reliability: #220 B-028, #238 B-060, #255, #349 T2-3, #382, #669 CUL-298, #674, CUL-152, #681 CUL-240, #804 CUL-812. **The thresholds (4h/2, 24h/3, 24h feline, 24h lethargy, 7-day tracking) and the prompt's escalation criteria are unchanged since 2026-05-24.** No commit has ever tuned in the precision direction.

---

## Lane C: prior-work ledger for the signals engine and the per-incident vomit read

**Compiled:** 2026-09-24 · **Mode:** read-only (repo on `main` @ 892eb88 plus Linear team Culprit plus one unmerged PR read through GitHub, #896). No database queries.

**Sources read in full:** `docs/research/2026-06-opus-signal-engine-poc.md`, `2026-06-fable-signal-engine-rerun.md`, `2026-06-vet-council-nyx-deep-dive.md`, `2026-08-signals-deep-dive.md` (all sections). `docs/nyx-signals-v2-requirements.md` v1.1 (the build contract that turned the Aug brief into code). `docs/nyx-descriptive-signals-requirements.md` §9. `docs/decisions-archive.md` rows 44, 46, 69, 99. The CLAUDE.md Open Questions table. `docs/backlog.md` (frozen) rows B-013/027/028/034/042/046/047/049/053/070/071/077–081/138/164/182–188/339/340/757–761/771–773. `.claude/skills/clinical-guardrails/SKILL.md` (outline and ambiguities).

**Skimmed:** the 2026-08 taxonomy evidence brief (GI rows and §V), the two 2026-05 briefs (implications and open questions), and these sessions: 2026-08-13 deep-dive, Signals v2 PR2/PR3/PR4/PR8/PR10, redeploy-gates, CUL-240, CUL-152, reanalysis-escalation, incident routing, analyze-pair deploy.

**From PR #896 (draft, not merged):** `docs/research/2026-09-owner-answers-to-automated-reads.md` and `docs/sessions/2026-09-23-flag-review-discovery.md`.

**Linear issues read:** CUL-1101, 1107, 403, 208, 189, 197, 249, 508, 255, 116, 179, 17, 19, 989, 1099 and 934, plus keyword sweeps. The sweep terms were signal, vomit, gestalt, emerging, false positive, red flag, calibration, weight, weigh-in, regurgitation, hairball, B-071, intake decline, association, indication, demo pet, phenotype, telemetry, weekly review, outcome and logging gap.

---

### 0. The one-paragraph answer

Four dogfood briefs have been run on the same cat: Opus 4.8 (Jun 8), Fable 5 (Jun 10), the vet council of simulated specialists (Jun 25) and the Aug signals deep-dive (Aug 13–14). Each one found that the strongest clinical fact in the record was one no detector owned. Each time the fix was another deterministic lane:
- worsening ④ (Fable)
- timing ⑤ and ⑥ (Fable)
- chronicity ⑦ (council)
- empty-stomach L1, trial-response L2, photo-composition L3 and gap-shortening L4 (Aug)
- the photo red flag card (B-340, from the PM's first vet send)

Almost every *deterministic* recommendation has now shipped. Signals v2 went GA on 2026-08-20 and cough/sneeze went GA around 2026-09-22.

Three kinds of work were never built:
- **The organ that reconciles lanes against the whole animal.** The "bounded gestalt reviewer" is still an Open Question, with no Linear issue.
- **Any way to know whether a lane is right.** There is no instrumentation (B-047), no synthetic ground-truth corpus (B-758), no outcome capture from vets, no evaluation of the vomit read's visual accuracy (deferred at B-034 and never done), and no model or prompt version stamped on reads.
- **The capture streams the vets said matter most.** A weight lane, a regurgitation/retch field and a meal-only refusal lane are all missing.

Separately, three live correctness defects silently degrade the engine today:
- **CUL-1099:** medication doses have read as empty since 2026-06-23.
- **CUL-989:** the event pulls are unpaginated.
- **CUL-1109:** the daily cap freezes safety cards.

These are table stakes before any "step-level" claim.

---

### 1. Ledger: every recommendation, and what happened to it

Legend: **SHIPPED** (with ref) · **PARTIAL** · **IN FLIGHT** · **FILED** (Todo/Backlog, not started) · **OPEN-Q** (in CLAUDE.md Open Questions, no build issue) · **PARKED/REJECTED** (with reason) · **ORPHANED** (never filed anywhere).

#### 1a. Opus 4.8 PoC (2026-06-08)

| # | Idea | Fate | Evidence |
|---|---|---|---|
| O1 | Bounded "gestalt reviewer" stage: an LLM reads computed findings and counts only, and may re-rank or veto a too-calm frame (it never invents a finding) | **OPEN-Q** | CLAUDE.md OQ "AI Signals card — scope of any LLM-over-findings surface". Referenced as the "rung 2" of the LLM ladder in `nyx-ask-requirements.md:31,57`. The 2026-09-05 Home v2 divergent round recommended the Weekly Review ship deterministic and "reserve the model for … the bounded gestalt reviewer". **No Linear issue exists** (a search for "gestalt" returns only CUL-271). |
| O2 | Privacy model for any LLM-over-raw-logs feature (consent, data minimisation) | **PARTIAL / superseded** | Ask D2 ratified an *expanded* boundary on 2026-07-18: the full record, notes and photos go in, transform-only (decisions-archive row 67). Any reviewer rung inherits Ask §6. Photo-AI consent for App Review is CUL-552 (Urgent, Todo). |
| O3 | Adversarial fixture for a pet with more deleted than live events (B-071) | **SHIPPED** | #476, `generate-signal/detectionSoftDelete.test.ts` (12 tests, differential plus static query scan). |
| O-finding | "Improving" on a chronic q2-day vomiter: the calm frame beat the dominant fact | **SHIPPED via later lanes** | ⑦ chronicity and ④ worsening. The reflection ③ can no longer lead over a chronic course (⑦→③ valve). |
| O-finding | An intake collapse beside the double vomit was missed because the refusals were on treats | **PARTIAL** | See F4 / council Q2 below (B-183 still Todo). |
| O-finding | The foreign-body photo read never re-surfaced | **PARTIAL** | B-340 red flag card (14-day window, shipped v25). A standing flag (CUL-208) is still Todo. |

#### 1b. Fable 5 rerun (2026-06-10)

| # | Idea | Fate | Evidence |
|---|---|---|---|
| F-Q1 | Emerging-signals tier: sub-floor associational patterns on the Signal surface | **OPEN-Q (narrowed); FILED as B-046** | CLAUDE.md OQ "Emerging-signals tier", narrowed 2026-06-11 to *associational* only, with the vet report settled as Established-only (2026-06-22). CUL-249 (B-046, "Patterns we're watching" opt-in pull view) is Low/Todo and blocked on B-047 plus a proven copy contract. The Signals v2 "watching" system (D5, CUL-14) is **not** this: it shows progress toward floors, not weak associations. |
| F-Q2 | A deterministic worsening lane to close the "one-way valve into silence" | **SHIPPED** | Detector ④ `symptom_worsening`, B-077 PR #130, deployed v12, 2026-06-11 (decisions-archive row 44). |
| F-Q3 | A coverage diagnostic for the varied-diet case ("too varied to assess") | **PARTIAL** | B-070 (#211, v20) moved `staple_washout` to ≥80% dominance. B-080 `diet_churn` ("every new food makes patterns harder to spot", #138). A "no single protein can be assessed because the diet is too varied" diagnostic was **never built and never filed**. |
| F-Q4 | Detector ②'s baseline dilutes itself on chronically irregular eaters ("a pet never well-fed in-log can never decline") | **FILED / PARTIAL** | B-183 / CUL-189, a meal-only finished-rate lane (Todo; blocked on a Biostatistician and Dr. Chen). Trial-diet refusal is handled: B-789 / CUL-525 added a server refusal gate, and B-494 added the report safety band. Still open are CUL-1084 (rank a multi-day decline above a single refusal), CUL-1086 (server and phone decline detectors disagree on free-fed meals), CUL-797, B-530/CUL-50 (Urgent; the refusal lane must survive food-identity misses) and B-575/CUL-57 (Urgent; the refusal register keys on a share when the feline clock is a duration). |
| F-Q5 | B-071 fixture still owed | **SHIPPED** | #476. |
| F-§6.4a | Rapid post-prandial cluster | **SHIPPED** | ⑤ `postprandial_timing`, B-078 #135, v13. Timing-only copy (PM ruling, descriptive spec §9.1). |
| F-§6.4b | Temptations ≤30-min pattern (3/52 vs 2/162) | **PARKED under OQ** | This is exactly the "emerging associational" class. Never built. The council later called it the biggest mis-action risk. |
| F-§6.4c | June collapse of meal-type feeding | **SHIPPED** | B-080 `meal_type_collapse` coverage diagnostic, #138, v15 (placed in the coverage lane, not a card, per §9.3). |
| F-§6.5 | Owner's own diet changes (free-fed bowl, new foods) reduce engine power, and nothing tells the owner | **SHIPPED (partly)** | The B-080 `diet_churn` copy. Also, the free-fed confounder caps at Early. |
| F-§6.2 | Time-of-day clustering (adjacent pattern) | **SHIPPED** | ⑥ `timeofday_clustering`, B-079 #137, v14. Floors calibrated to 5/0.6 (3.3% pooled null FPR). The n=8 chance residual is tracked as B-083. |

#### 1c. Vet council deep-dive (2026-06-25): five *simulated* specialist lenses, all Opus 4.8, none a real vet

| # | Idea | Fate | Evidence |
|---|---|---|---|
| V-Q1 | A deterministic chronicity/persistence lane | **SHIPPED; one ratification open** | ⑦ `symptom_chronicity`, B-182 PRs #246/#247 plus PR 3, live since v32. CUL-179 is In Progress with `Waiting on PM`. The **D2 minEpisodes 6-vs-5 sensitivity ruling** is still owed (the adversarial review showed that 6 misses a once-weekly ×5 course). Follow-ups: the CUL-786 stand-down and CUL-787 4-week compare are Done, with deploys CUL-794/795 still open. CUL-689 (⑦ ordering has no recency term), CUL-730 (the "First logged" date is lookback-bounded) and CUL-793 (the density-gate constant) are Todo. |
| V-Q2 | Meal-specific finished-rate / refusal lane | **FILED** | B-183 / CUL-189, Todo/Medium. It has never been scheduled. |
| V-Q3 | Surface the soft-delete under-count ("this view may under-count") | **REJECTED by evidence** | Aug F6: 35 of 47 deletions date to the May import cleanup, so this is an era artifact and not ongoing behaviour. The input-contract test shipped (#476). The surface was never built, deliberately. |
| V-Q4 | "AI Signals card" scope: bounded gestalt reviewer first | **OPEN-Q** | Same as O1. |
| V-Q5 | Emerging tier (Temptations worked example) | **OPEN-Q** | Same as F-Q1. |
| V-Q6 | Ratify "the reliability threshold is per-claim-type (escalate low / describe with floors / never reassure / attribute-cause high)" as a design principle | **ORPHANED** | Not in the design principles, specs or Linear. It is implicitly how the engine behaves, but never ratified. |
| V-Q7 | A vomiting-vs-regurgitation capture field ("was there an active retch?") | **FILED + PARTIAL** | B-184 / CUL-197, Low/Todo. The *descriptor* half shipped: L3's report descriptor bundle went live 2026-09-15 with `generate-report` v15 (CUL-19 is still In Progress, gated on a cold read). The label is never emitted, by rule. |
| V-Q8 | A standing / re-surfacing flag for per-incident `worth_a_call` | **PARTIAL + FILED** | B-340 (visual flags only) raises a Home safety card for 14 days. CUL-208 (B-185, "until acknowledged") is Todo. Flag-review FR-4 proposes "until an action", and that ruling is pending on CUL-1107. **Contextual** `worth_a_call` reads (repeated vomiting, reduced intake, lethargy), which were 9 of the PM's 12, never reach Home as a red flag. They are only covered indirectly by ④/⑦. |
| V-cons4 | Weight is the highest-value missing datum | **PARTIAL** | B-186 v1 is display-only (capture, trend and history; #244–#249). **There is no weight lane in `generate-signal`**: `detection.ts` has no weight input, and a grep shows no `weight_check` read. The loss flag was left to a separate spec (B-190 input) that was never written. Weight appears on the vet report (B-494 band, R-15's missing-weight escalation). |
| V-cons (B-187) | Treat-load observation ("treats are most of what you log") | **FILED** | B-187 / CUL-218, Low/Todo. |
| V-Conflict A | Trust in the 3–7am clock: is it physiology or a discovered-timestamp artifact? | **ADDRESSED BY CONSTRUCTION, never ruled** | ⑥ and L1 count only witnessed or estimated onsets. No explicit calibration caveat was added. |
| V-Conflict B | What the 43-deleted vs 21-live ratio means | **RESOLVED by evidence** | Aug F6: an era artifact. |
| V-method | Specialty diversity as a lever | **Reused** | The panel method is now a standing tool (`docs/vet-specialist-panel.md`) and is used in later discoveries (the flag-review interviews, the vet-visits interviews). |

#### 1d. Aug 2026 signals deep-dive, C1–C8 (built as Signals v2, B-755, Linear project "Signals v2 — the record, decomposed")

| # | Idea | Fate | Evidence |
|---|---|---|---|
| C1 | Empty-stomach timing lane plus episode-set-aware ⑤→⑥ suppression | **SHIPPED** | L1 `empty_stomach_timing` (CUL-7), `longGapHours`=6h (CUL-16, Dr. Chen, gastric-emptying anchor), `timing_story` A2 card (CUL-12), GA 2026-08-20. The guard went through three adversarial rounds; v3 uses a per-episode Poisson-binomial with about 4.4% worst per-n. **Residuals:** B-760 / CUL-116 (the base-rate counterbalance "41 of 47 mornings with no episode" was never emitted; Todo) and B-761 (dense-lane jitter). |
| C2 | Cough and sneeze become event types; ⑦ extends over them | **SHIPPED** | B-756 / CUL-509 W1 (CUL-666), cough floors ruled (CUL-687), the §11 `other`-row swap script (CUL-677), GA (CUL-960/961, ~2026-09-22). W2a/W2b (strain, labored breathing, RRR) are **not greenlit** (CUL-684, CUL-667). The cough↔vomit adjacency clause shipped (CUL-778); CUL-779 is Todo. |
| C3 | Trial-response lane | **SHIPPED** | L2 `trial_response` (CUL-8) plus trial surfaces (CUL-13) plus the Patterns "trial so far" panel (CUL-11). It went through three adversarial rounds and pools **vomit-only** (a resolving itch masked a rising vomit). **FEWER direction ruled ship-as-merged** (redeploy-gates session, #662) with a named **~14–35% false-"fewer" residual from symptom-logging attrition**. D2's absence-shaped sentence (CUL-17) is in Backlog, unruled; count rows ship. A multi-indication lane (GI/derm axes) was registered as a follow-up in the PR3 session and is **ORPHANED** (no issue found). |
| C4 | Content × timing composition over the photo-AI fields (retained food at ≥6h, hair, bile) | **SHIPPED** | L3 (CUL-9): `retainedFoodCount` / `hairCount` / `bileCount` with an analyzed-photo denominator, in the expand and the report. `lib/vomitContents.ts` is the shared predicate (CUL-226). The report side went live 2026-09-15 (v15), and its cold read is owed (CUL-19). The PM's C4 scope-stretch (regurgitation *descriptors*) shipped as the report bundle; the label stays with the vet. |
| C5a | Inter-event gap lane (g-chart shape), escalate-only | **SHIPPED** | L4 `gap_shortening` (CUL-10). The property sweep **raised runLength to 4** (monotone-3 fires 1/6 by chance). **Disclosed residual ~5–6% on autocorrelated waxing/waning nulls**; runLength=5 (<2%) is a documented one-constant lever. |
| C5b | "Building register": what the engine is watching | **SHIPPED** | Watching system (CUL-14, PM overrode the team's deferral, D5). Follow-ups: B-771 (the "Early" badge), B-772 (intake watching lane for Sam), B-773 (gap row beyond vomit), B-736. All Todo/Low. |
| C6 | Weight capture: gentle weigh-in cadence, ≥2–3 readings before any trend, never reassure | **ORPHANED as an engine/capture item** | The PM said "in, shaped by capture-friction", but it is not in the Signals v2 spec, there is no issue for a weigh-in schedule through the notification foundation, and there is no weight lane. CUL-288 (weight buried under More events) is Low. |
| C7a | Route-aware medication confounding (topical doesn't confound GI) | **REJECTED by PM** | D8: "a med on board is also a marker of concurrent illness". Identity-agnostic stays; only a copy question survives (the med-on-board line shipped in B-721 SR-4/5, #621). **But see CUL-1099: the engine has read zero doses since 2026-06-23**, so med confounding and dose↔meal vehicle pairing have not actually been running in production. |
| C7b | Med-response level contrast ("6 itch-days before the med, 2 after") | **ORPHANED** | Never filed as an engine lane. CUL-300 (B-307, a descriptive dose-vs-symptom-peak overlap on the report) is Low. |
| C8 | Citation retrofit (Maclure case-crossover and SCCS on ①, WWC, EARS; methods note on the report) | **PARTIAL** | `lib/rateContrast.ts` cites Krishnamoorthy & Thomson. **No** Maclure/SCCS citation exists in `detection.ts` (grep finds only the house phrase "SYMPTOM-ANCHORED case-crossover (B-050)"), and there is no methods note in `generate-report`. Never filed. |
| §3 methods | EARS C1–C3, Poisson CUSUM/EWMA, Tau-U + WWC phase floors, Kulldorff scan | **ORPHANED** | None implemented (a grep for cusum/ewma/EARS/kulldorff/tau-u returns nothing). Only the C-test (`rateContrast`) and a g-chart-shaped monotone run (L4) were built. |
| §3 MNAR | "Run surveillance on the logging stream itself" (the record went quiet as a descriptive event) | **ORPHANED** | Only density *disclosure* was built (C5 rule, trial density gate). Nothing detects or says "logging went quiet". |
| F2 | Phenotype/character shift over time at flat counts (outside a trial) | **ORPHANED** | L2's per-phenotype rows cover it *inside* a trial only. |
| §9 | `is_demo` flag or exclusion constant for demo pets | **ORPHANED as code** | G7 is a process rule ("exclude by pet id"). There is no `is_demo` column or constant in the repo. |
| B-757 | Video capture / analysis | **FILED** | CUL-507, restored, Low/Todo. |
| B-758 | Clinically authored synthetic corpus with known ground truth | **FILED, never started** | CUL-508, Low/Todo, "blocks any C1–C8 build wave". C1–C8 shipped without it. |

#### 1e. Aug §8 open questions

| Q | Status |
|---|---|
| Q1 episode-set suppression / overlap fraction | Ratified in the build (`suppressionOverlapFraction`, adversarial-gated). |
| Q2 cough types plus re-typing `other` rows | Ruled D3: `other` stays; a reviewed per-row SQL swap for the dogfood era (CUL-677 Done). A product re-type flow was deferred. |
| Q3 trial-lane phrasing vs G2, and surface | D3 Signal-resident plus trial card. **D2 (absence sentence) still open** (CUL-17, Dr. Chen). |
| Q4 the no-association collision ("no pattern met the bar in N exposures", N1-Headache style) | **Never answered.** No session, spec or issue picks it up. The nearest item is CUL-495 (B-489: the report's negative correlation line has no denominator or power statement). |
| Q5 route-exemption scope | Moot (C7 demoted). |
| Q6 building register copy | Built (G8 copy round). |
| Q7 weight capture scoping | **Never answered** (see C6). |

#### 1f. The two 2026-05 foundational briefs

| Idea | Fate |
|---|---|
| Witnessed vs discovered timestamps (Option C) | **SHIPPED** (B-010, Option C enum plus window). Timing lanes count only witnessed/estimated onsets. |
| Measure the real witnessed ratio with a survey (N≥30) | **ORPHANED**. The persona estimate of ~35% witnessed was fabricated, and no survey was ever run. |
| How the engine should weight windowed events | **Deferred** (B-032 / CUL-178 Low; the engine uses the point, and timing lanes exclude windows). |
| The 5-point intake ordinal as the validated instrument; "no intake" must be first-class | Shipped as the WSAVA scale (CUL-381, "explain the scale in-app", is Urgent/Todo). |
| Symptom-class-specific latency windows | Shipped per symptom (vomit 12h, diarrhea 24h, itch/skin 72h). |

#### 1g. Post-Aug additions that bear on this work

| Item | Status |
|---|---|
| B-340 photo red flag raised to Home (derived from owner-editable fields, never the cached `visual_flags`) | SHIPPED v25 (2026-07-18). |
| Signal fold (fold/strip/stand-down) | SHIPPED. Safety strips (CUL-785); the provisional calls await ratification (CUL-796). |
| Flag review (owner confirm/dispute of photo flags) | DISCOVERY done (CUL-1101 In Review; PR #896 draft). The **eight-lens sanity check recommends S1 only** (make today's correction honest) plus a report provenance line. The question is parked; **FR-0 is waiting on the PM** (CUL-1107). |

---

### 2. Open questions still open, and who they wait on

| Question | Where | Waits on |
|---|---|---|
| Bounded gestalt reviewer (LLM over computed findings; escalate / re-rank / veto a calm frame; never reassure or attribute) | CLAUDE.md OQ | PM (scope). There is no issue. The Ask §6 boundary is its inherited substrate. |
| Emerging-signals tier (sub-floor associational patterns, Signal surface only) | CLAUDE.md OQ; CUL-249 | PM. The product team and Dr. Chen lean against (Dr. Chen's veto on Home push stands). CUL-249 is blocked on B-047 data and a copy contract. |
| A council-style multi-perspective report to owners (Rung 1→3) | CLAUDE.md OQ | PM north-star call. Hard gates: data minimisation, escalate-only, Pets > $. |
| ⑦ D2 minEpisodes 6-vs-5 | CLAUDE.md OQ; CUL-179 `Waiting on PM` | Dr. Chen plus PM (owned by the B-755 floor contract). |
| D2 absence-shaped trial sentence | CUL-17 (Backlog) | Dr. Chen. |
| Flag review FR-0 (S1 plus report line; park the question) | CUL-1107 `Waiting on PM` | PM. |
| Signal fold PR 2 provisional calls (intake-decline hold, worsening ask, intake verb) | CUL-796 | PM plus Tier-2 edits. |
| Standing duration for a per-incident flag (CUL-208 ⇄ FR-4) | CUL-208 / CUL-1107 | PM. |
| Critical-drug escalation on a missed dose | CLAUDE.md OQ (med completion card) | PM / Dr. Chen. |
| What an *incomplete* event pull may produce in `generate-signal` (never reassure or resolve) | CUL-989 step 3 | PM plus clinical-guardrails. |
| Whether to add usage telemetry at all (time-to-first-insight, retention) | CUL-255 (B-047); CUL-187 (B-723) | PM plus T&S (PII). |
| Whether to build the synthetic corpus | CUL-508 | PM ("I need to be convinced the synthetic set was put together with intention"). |
| B-183 meal-only refusal lane | CUL-189 | Biostatistician plus Dr. Chen, then PM. |
| B-184 retch field | CUL-197 | Designer plus Dr. Chen. |
| The no-association collision (Aug §8 Q4) | nowhere | Unowned. PM plus Dr. Chen plus T&S. |
| Weight capture cadence (Aug §8 Q7 / C6) | nowhere | Unowned. |
| §15 real-vet question sheet (Q4 sets RRR priority) | CUL-672 | Real vet answers, still outstanding. |
| Real-vet R1: send the report to the PM's own GP | CUL-598 | PM. **No real veterinarian has reviewed any signal output.** |

---

### 3. Recurring themes, and what was out of scope or never tried

#### 3a. The gap each brief rediscovers

1. **The whole-animal gap.** Opus: "improving" on a chronic vomiter. Fable: an empty state at the 15th vomit. Council: chronicity unstated. Aug: the pooled chronicity card says "book a vet visit" while the decomposed record shows one phenotype stopped and the owner feels better.
   - Every brief says: *rigorous per lane, blind across lanes; the most important true sentence is one no lane owns.*
   - Every time, the response was **one more deterministic lane**, which closes that brief's example and leaves the architecture unchanged.
   - The composition layer is still hand-written suppression rules between lanes (⑤→⑥, ⑦→④, ⑦→③, collapse→churn, and ⑤ plus L1 merged into `timing_story`). That is 10+ detectors with no general reconciliation.
   - The "organ" (gestalt reviewer, or any systematic whole-record rule) has been an Open Question since June 8. It is the single most rediscovered gap.
2. **Capture bounds detection.** Each brief found the key missing fact in a stream the app doesn't capture well:
   - intake truth (free-fed bowls, refusals on excluded treat rows)
   - weight (zero weigh-ins on a weight-managed cat, in all four briefs)
   - stool (zero)
   - regurgitation vs vomit (no retch field)
   - cough typed into notes (fixed by C2)
   - discovered vs witnessed times
   Weight is named the highest-value missing datum by every brief and the literature, and it still has no engine lane and no capture cadence.
3. **The intake-decline baseline problem.** Fable §6.3, council F5, Aug §6 (the B-494 "uniformly bad from day 1" refusal case) and the vet-report cold reads (CUL-980, "never says the cat refused food") all hit the same wall. A *relative* decline detector cannot see a pet that was never eating well in the log. B-183, CUL-1084, CUL-1086, B-530 and B-575 are all still open.
4. **Photo-read findings drop on the floor.** Opus (the 05-18 foreign body), council consensus 5, Aug F7 (2 of ~10 structured fields read) and the flag review (a flag the owner disputes erases evidence, while a replaced photo's findings never arrive). This is partly fixed (B-340, L3). The standing flag, the contextual `worth_a_call` escalations and honest correction are still open.
5. **"Tune on real data" deferrals that can never be discharged.**
   - B-081 (⑤ grazing guard), B-083 (⑥ n=8), B-077 follow-ups, B-138 (med confounder) and B-049 (correlation rigor) all say "revisit with live FP data (B-047)".
   - B-047 has never been built, and there is **no analytics pipeline** (`nyx-beta-features-requirements.md` "ground truth").
   - Every floor is calibrated only against **seeded null models** (false-positive rate). Recall is tested only on hand-authored fixtures.
6. **The n=1 trap.** All four briefs are one cat, the PM's. The Aug brief misread the App Store demo dog as a real user and was caught by the PM. G6/D7 (never tune to Nyx) came out of this.
   - There is still no second real record, no ground-truth corpus (B-758) and no demo-pet code guard.
   - The council's "board-certified specialists" were **Opus 4.8 personas**, not vets.
   - The one real-vet contact (CUL-598) has not happened.
7. **Phenotype and temporal decomposition beats pooled rates.** Fable (rapid cluster), council (bile timing ≠ overnight timing), Aug F1/F2/F5, and the human-analogue literature ("the diary is a floor, not a census; prefer temporal structure over rates"). This theme was acted on most successfully (⑤, ⑥, L1, `timing_story`, L2 phenotype rows). The remaining hole is character shift over time outside a trial.
8. **Treat load and diet structure as the dominant confound.** Opus, Fable, council and Aug F5. B-080 shipped; B-187 treat-load is Todo. The trial era showed treats falling from 80% to 4.5% at the same time as the protein change, so attribution is impossible by construction.

#### 3b. Out of scope, rejected, or never tried (named explicitly)

- **Population priors ("cats like yours").** Aug §7 records a *negative result*: no in-house data, and Nationwide HealthZone shows the appetite but not the fusion. Signals v2 §1 marks "population comparisons" out of scope. Never tried.
- **Bayesian or hierarchical models, shrinkage, pooled priors.** Never mentioned in any brief or spec; a grep for "bayes" across docs and the engine returns nothing. The engine's statistics are frequentist and exact: McNemar, Bonferroni, conditional-binomial C-test, Poisson-binomial tail, seeded property sweeps.
- **Farrington-flexible, randomization tests, segmented-regression slopes.** Rejected as negative results in Aug §7: they need years of baseline, phases are unrandomized, and the data is below the floors.
- **Syndrome naming (BVS, asthma), management suggestions (bedtime snack), diagnosis-probability language.** Rejected (G3).
- **Lowering floors to fix sub-floor silence.** Rejected (Aug §7; Whistle's ~92% of alerts producing no visit is the fatigue base rate).
- **Route-aware medication confounding.** Rejected (D8).
- **Owner feedback on signals** ("was this right or helpful?"). Never tried for Signal cards. For photo flags, the flag-review discovery (09-23) designed Yes / No / Not sure and then **parked it** in the sanity check.
  - The research lane found selective-feedback bias (Dal Pozzolo: labels collected only on alerted items make a biased training set that reweighting does not fix) and automation bias (RR 1.26).
  - FR-7 recommends **Tier 0: nothing trains on answers**, plus stamping photo and model version on every read. The stamping is **not done**: `event_ai_analysis` has no model or prompt version column.
- **Outcome capture.** The owner-reported trial outcome exists (`diet_trial_outcome`: improved / no_change / worse / unsure). There is **no vet-diagnosis capture** in the vet-visits track, nothing links a Signal finding to what happened next, and there is no PPV or sensitivity measurement anywhere.
- **An evaluation harness on labelled records.** Never built. Only the null-model sweeps, fixtures and the Ask eval-fixture plan (`nyx-ask-requirements.md:290`) exist. B-758 is the only proposal and has not started. The implicit label pairs already in the database (`ai_raw_payload` vs owner-edited structured fields plus `edited_at`) have never been treated as an eval set.
- **A realistic generative simulator.** The only simulation is property sweeps on null processes (uniform or Poisson onsets, AR(1) Cox, Markov flare/quiet, grazing), plus a few "recall" fixtures. There is no clinically authored record generator.
- **Surveillance methods** (EARS, CUSUM/EWMA, Kulldorff, Tau-U): proposed in Aug §3 and never built.
- **Passive capture hardware** (litter box, feeder, scale APIs). B-294 / CUL-210 was **Canceled**.

---

### 4. The per-incident vomit read: accuracy, false positives, owner edits, value

**Architecture, unchanged since B-027 (2026-05-29):**
- `analyze-vomit` runs Sonnet 4.6 vision (`claude-sonnet-4-6`, `index.ts:577`) through `_shared/incident-analysis.ts`.
- The recommendation enum is `worth_a_call` / `monitor` / `not_enough_to_say`, with no reassuring value.
- A deterministic floor forces `worth_a_call` on visual flags (blood `fresh_red`/`coffee_ground`, foreign material `yes`) and on contextual flags:
  - repeated vomiting: ≥2 in 4h or ≥3 in 24h
  - feline reduced intake (gated on tracking)
  - concurrent lethargy
- The model never sees multi-sample context (Pattern 3).
- Free text (`read_text`, `description`) surfaces only on a self-escalated final `worth_a_call` (Pattern 10, CUL-152). A denylist was tried and missed ~86%.
- The Home red flag derives from the **owner-editable structured fields**, never the cached `visual_flags` (Pattern 9, B-339/B-340).

**Everything known about accuracy (all n=1, all the PM's household):**

| Date | Finding | Source |
|---|---|---|
| 2026-05-29 | A persona review (Dr. Chen, simulated) of 22 stored reads: escalate/never-reassure held, with **two under-escalations** (bile plus an unidentified non-food piece; blood and foreign both `unsure`, both `monitor`). **"Real-photo visual-accuracy check deferred per PM."** Never done since. | B-034 / B-027 backlog rows |
| 2026-06-08/10 | The 06-10 photo was unreadable (oversized) and degraded honestly to `not_enough_to_say`. B-203 fixed a mixed multi-photo event dropping the oversized photo. | Fable §2; CUL-298 |
| 2026-06-25 | 19 of 21 vomits carried reads: food-dominant, bile 4 (all yellow), foam 1, no blood, **1 foreign-material flag** (05-18, blue toy ball, `worth_a_call`); 2 `worth_a_call`, 13 `monitor`. | Council §3 |
| 2026-07-13 | **Two foreign-material false positives**: a toy ball *elsewhere in the frame*, and turkey deli-meat seasoning read as a "stick". This is a scene-object segmentation class plus a fine-grained vision limit. The PM's direction constraint: not a licence to detune (B-042 pushes the other way). CUL-403 (B-338) is Todo. | CUL-403 |
| 2026-07-13 | Red flag raised to Home despite the persona conflict. Designer/Jordan/Sam: "two false positives already, the trust cost of crying wolf". Resolved toward Dr. Chen because "false positives are cheap to course-correct" through the owner edit (B-028). | decisions-archive row 69 |
| 2026-08-13 | 31 of 36 live vomits had completed reads. The engine read only blood and foreign material; L3 then added food/hair/bile/retained food with a "photographed and analyzed" denominator. Hair never de-escalates (Cannon). Retained food at ≥6h is the delayed-emptying observation. | Aug F7, C4 |
| 2026-08-19 | A production aggregate found **8 of 17 `foreign='unsure'` rows carry a non-empty note** (and 4 `no` rows also carry notes). `unsure` is the model's default for unclear photos, so escalating on it would mean alarm fatigue. The PM ruled **visibility-only** (show the fragment row, floor unchanged). | CUL-240 session |
| 2026-09-05 | A failed re-analysis overwrote an earned `worth_a_call` with an error state (reads as "nothing found"). Fixed (CUL-812/539). Residual CUL-532: a degrading re-analysis can still erase prior red flags on a non-edited row (Backlog). | reanalysis-escalation session |
| **2026-09-23** | **PM dogfood: "fired 3–4 times and each time I haven't necessarily agreed."** The owner-scoped count shows **47 readable photo reads since May 14, 4 photo flags, 3 cleared by the owner, 1 case where the owner added blood the read missed; 9 of the household's 12 `worth_a_call` verdicts are contextual, not visual.** A typical owner meets a flag "a few times a year". | CUL-1107 comment; flag-review session record |

**Implied numbers (n=1, indicative only).** 3 of 4 visual flags were disputed by the owner (the PPV of a visual flag, *as judged by the owner*, is ~1/4). There was one owner-caught false negative on blood. About 75% of escalations come from deterministic context rather than the photo. No independent ground truth exists (no vet adjudication), so "owner disputed" ≠ "false".

**Owner-edit semantics and live defects (flag-review sanity check, 2026-09-23):**
- CUL-1104 (High): setting a flagged field to **Unclear** clears the Home warning and the report line, exactly as "None visible" does.
- CUL-1105 (High): nothing regenerates the Signal when a read lands, so the flag reaches Home only at the next rebuild (up to 24h).
- CUL-1110 (High): after any owner edit, a **replaced photo's** new findings never reach Home or the report. This fails toward reassurance.
- CUL-409 (B-339): the stale cached `visual_flags`/`recommendation` contradicts the correction on the record screen.
- CUL-1111: hiding the AI note also hides Edit.
- CUL-1112: no "See the photo" door from the Home card.
- CUL-1113: the report should print disputed flags with both views.
- CUL-1102: the report never prints stool foreign material.
- CUL-543: `unsure` fragments are omitted from the report.
- CUL-1025: vomit colour on a collapsed duplicate is lost.
- CUL-531: a partial read that escalates via context still shows "Blood: none visible".
- CUL-83 (B-164): an edited row whose re-analysis fails hides the corrections.
- CUL-534: vomit's `visual_flags` are not derived from structured fields the way stool's are.
- CUL-983: an app-UI screenshot was embedded in the report as a clinical photo.
- CUL-552 (Urgent, App Store): AI photo-analysis consent.

**On the value of the read.**
- The vet lenses called the one real foreign-body read "the lowest-probability, highest-consequence item".
- The PM's routing ruling (D1–D3, 2026-09-05) keeps the photo as the hero because "I want the pet owner to be able to pull up a vomit and show it to a vet". The read's value is framed as **evidence for the vet**, not diagnosis.
- The flag-review research brief found **no pet stool/vomit product with a documented owner dispute control**. Mars Poopscan claims "90% accuracy-in-range" against a 10-expert panel. Nothing comparable has been measured for Culprit's read.
- Sanity-check verdict (8/8 lenses): "At this volume, the question makes dismissing a flag cheaper faster than it adds care" (Dr. Chen); "When a false alarm is the safe error, dismissing a warning should not be the fastest path on the screen" (Designer).
- Meta-lesson recorded: *asked "how", the team designed a nine-PR feature; asked "whether", it converged on four to five sessions of fixes.*

**Evaluation data already sitting in the schema, unused:**
- `event_ai_analysis.ai_raw_payload` (what the model said) vs the live structured columns plus `edited_at` (what the owner changed) is an implicit disagreement label set.
- There is no model or prompt version column, so reads cannot be stratified by prompt version. FR-7 recommends adding the stamp "now".

---

### 5. Research debt (claims flagged unverified, nuanced or refuted)

**Refuted or corrected (keep the corrected form):**
- Norsworthy 2015: **96% histology** (288/300), not 83% (83% is the ultrasound rate). Healthy-cat counter-study: Marsilio et al. **jvim.15455**, not 15524 (which is Norsworthy's rebuttal).
- "≥4-week chronic cough": **no veterinary source** (human paediatric guidance; the vet convention is ~2 months). Any cough floor is an owned product/Dr. Chen calibration.
- Freeman ">5% weight loss" is a **cachexia definition**, not an evaluate-at recommendation.
- ACVIM CIE consensus does **not** say CIBDAI/CCECAI is owner-scored. Use the "owner-observable core" framing.
- Olivry cat derm timelines: 50/80/90% at 4/6/8 weeks.
- The hairball-confusion citation was Cornell and is **corrected to VCA** (CUL-671, taxonomy §V.1d). The PetHealthNetwork hairball article is dead.
- Stella 2011 per-behaviour RRs **do not survive** as stated (taxonomy §V.3).
- The Aug brief's v1 "flat trial-era" read was **overturned** by the Nyx-only re-run. The v1 Cooper claims were **withdrawn** (demo data).

**Downgraded strength:**
- Curelator 11.5% (conference/press grade)
- Peris 85% unique (conditioned on ≥1 association)
- Zia 73% (8 of 11, tiny pilot)
- Whistle OR 1.63 (before/after, no concurrent control; no sensitivity or specificity)
- Norsworthy ">2/month" (disputed expert opinion)
- BVS (one retrospective dog series, 3 reclassified; no feline series)

**Unverified or owed:**
- **B-034 visual-accuracy check of `analyze-vomit` on real photos: deferred 2026-05-29, never done.**
- Witnessed-vs-discovered ratio: persona estimates only (fabricated); the survey was never run.
- Validity of the 5-point intake ordinal at home; grazing-cat symptom-meal kinetics (2026-05 brief §7).
- The §15 real-vet question sheet (CUL-672) is outstanding. No real vet has read any Signal output (CUL-598). The council's "board-certified" lenses were LLM personas.
- The `vet-report-cold-read` of the 2026-09-15 report deploy (six weeks of render change, including the L3 descriptor bundle) has **not run** (CUL-19).
- Flag-review research debt: Apple's fall follow-up wording and label use, toggle defaults, whether relabels in Petivity or Litter-Robot change health insights, any consent norm for photo-bearing feedback, and **any study of sensitivity drift driven by user dismissals**.
- Competitor claims must be re-verified at use (3 of 6 had moved within a week, per taxonomy §V.4). Tend & Mend: Cat (launched 2026-04-10, zero ratings) is a new wedge-overlap entrant flagged in CUL-934.

**Accepted statistical residuals (measured, disclosed, never validated on real outcomes):**

| Lane | Residual |
|---|---|
| ⑥ time-of-day | ~3.3% pooled null FPR; n=8 residual (B-083) |
| ⑤ post-prandial | grazing guard ~7% coincidence, worst 13–17% (B-081) |
| L1 empty-stomach | worst per-n ~4.4% (asserted ≤6.5%) |
| L4 gap-shortening | ~5–6% on autocorrelated waxing/waning nulls |
| ⑦ chronicity | ~1.3% noise FPR at minEpisodes 6; **misses once-weekly ×5** |
| L2 trial "fewer" | **~14–35% false "fewer" under symptom-logging attrition** |
| Med confounder | dose-as-point under-detection plus incidental-drug over-suppression (B-138) |

- **Sibling-surface warning:** CUL-914 (Urgent) found the Noticed L-17 pairing prints on **22–77% of pure-noise records**, which shows the calibration discipline is not uniformly applied.

**Live correctness defects in the engine itself (any new work sits on top of these):**
- **CUL-1099 (High):** `generate-signal` (and `ask`) have read **zero medication doses since 2026-06-23**. An ambiguous PostgREST embed (PGRST201) is swallowed as `[]`, so med-confounding and the dose↔meal vehicle pairing are inert in production. Fixing it changes live output and needs an adversarial pass first.
- **CUL-989 (Urgent):** the event pulls are unordered and unpaginated. Under `max-rows` they keep the *oldest* rows, so a detector asking "is it still happening?" could read a record that stops before today. max-rows=5,000 gives headroom today; the heaviest account is ~1,057 events.
- **CUL-1109 (High):** past 12 rebuilds a day the cap skips detection, and safety cards freeze until the next day.
- **CUL-1105 / CUL-1110 / CUL-1104:** see §4.
- **CUL-1087:** rating a meal after the fact never refreshes the Signal.
- **CUL-264:** a stale `America/New_York` default misleads the background engine.
- **Deploy currency:** the flag-review session (09-23) found `generate-signal` v34 equals `main`, but CUL-794/795 (deploy the stand-down and the 4-week compare) are still open. Reconcile before assuming what is live.

---

### 6. What this means for "blaze a new path"

Already done (do not redo):
- the per-lane deterministic detectors for worsening, chronicity, meal timing (both phenotypes), trial response, gap shortening, cough chronicity and the photo red flag
- the watching / building register
- the Patterns timing and trial panels
- the one-predicate shared libs (`lib/mealTiming`, `lib/rateContrast`, `lib/dietTrial`, `lib/vomitContents`)
- the no-reassure structural gates on the vomit read

Rediscovered repeatedly and still unbuilt:
- a whole-record reconciliation layer (deterministic or bounded-LLM)
- any measure of whether a finding is right: an eval harness, a ground-truth corpus, outcome capture, version-stamped reads
- weight as a signal
- a meal-only refusal lane
- honest owner correction of photo flags (S1)

Never tried at all, and therefore the real "new path" candidates:
- Bayesian or hierarchical modelling and priors (population, breed or age); explicitly never considered, and "population priors" were ruled out only for lack of data
- a clinically authored generative simulator for evaluating recall and PPV
- using the existing `ai_raw_payload` vs owner-edit pairs as a free disagreement dataset
- surveillance-method lanes (EARS, CUSUM)
- the logging stream as a signal (MNAR)
- any real veterinarian in the loop

Prerequisite hygiene: fix CUL-1099, CUL-989, CUL-1109, CUL-1105 and CUL-1110 before any claim that the engine's output improved. Otherwise a comparison measures plumbing, not method.
