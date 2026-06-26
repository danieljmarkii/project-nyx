# Nyx — Chronicity / Persistence Signal Lane Requirements (Detector ⑦)

**Status:** Build-ready spec, pending PM greenlight to promote to active build.
**Backlog:** B-182 (Next). **Build step:** Step 10 evolution — the deterministic Signal engine (`supabase/functions/generate-signal/detection.ts`).
**Origin:** `docs/research/2026-06-vet-council-nyx-deep-dive.md` §9 #1, Findings 2/3, Consensus §5.1 #3.
**Author:** Data Scientist + Dr. Chen lenses, this session. **Reviewers required before merge:** `adversarial-reviewer` (MANDATORY — clinically load-bearing, never-reassure), `code-reviewer`.

---

## 1. Purpose & origin

The 2026-06-25 specialist-panel deep-dive reached a unanimous, five-lens conclusion: **the single strongest true signal in the data — chronicity — is the one the engine never states.** Six weeks of unresolved, roughly every-other-day vomiting reaches the owner as detector ④'s *"3 this week, up from 2 — worth a word with your vet"* (a week-over-week bump) or detector ③'s calm *"3 episodes this week, same as last week"* (a flat reflection). Neither says the true and important sentence: **"this has been going on for six weeks and is not resolving."**

The brief's two load-bearing findings:

- **Finding 2 — the highest-value engine gap is deterministically computable, not AI-shaped.** "Chronic vomiting, unresolved, ~1/2 days for 6 weeks" needs only an episode **span** + **count** under the existing honesty floors — the same shape as detector ④, built from the Fable brief. **No LLM.** The most important sentence about this pet requires no model.
- **Finding 3 — chronicity ≠ week-over-week worsening.** Detector ④ fires on a 2→3 weekly bump; it is **silent on a flat-but-relentless six-week course**. A pet can be "not worsening" and still profoundly abnormal. The Fable brief closed the *worsening* valve (④); a **persistence/chronicity valve is still open.**

This spec defines **detector ⑦ `symptom_chronicity`** — a safety-class lane that fires on **duration + sustained burden + still-ongoing**, orthogonal to ④'s **delta** axis. It is the symptom-axis statement "this is not a passing thing," escalating toward a vet, never causal, **and — the cardinal requirement — it must never let a flat or improving-looking chronic course read as reassurance.**

### 1.1 Why a new detector and not a tweak to ④

④'s firing predicate is `isWorsening` — a strict **rise** (`currentCount > priorCount OR currentDays > priorDays`) over a 7-day window vs the prior 7. A steady course has no rise, so ④ is silent by construction. Chronicity is a fundamentally different measurement (a long-span persistence test, not a two-window delta) and needs its own windowing helper and its own floors. It **couples to** ④'s episode-collapsing and honesty-floor philosophy (§2), it does **not** extend ④'s predicate.

---

## 2. Shared rules (inherited from ③/④, restated for the load-bearing ones)

The chronicity lane is the third consumer of the engine's symptom-episode substrate and inherits every rule the worsening lane (④) already obeys:

- **Episode collapsing.** Rapid re-logs of one bout collapse via the engine's `symptomEpisodeGapHours` (3h) — a bout logged five times is one episode, never five. (Reuses `toEpisodeOnsets`.)
- **Soft-delete contract.** The caller (`generate-signal/index.ts`) passes only `deleted_at IS NULL` rows. The pure module has no notion of deletion. *(The clinically-load-bearing soft-delete under-count framing from the brief Finding 4 / Conflict B is **out of scope** here — it is its own open question; B-071. Chronicity reads the live log at face value, like every other detector.)*
- **UTC storage, derived local only where needed.** Timestamps are stored UTC. Chronicity is a *duration/recency* measure (span in days, days-since-last) — it is timezone-independent and does **not** take the `timezone` input (unlike ⑥). Day-bucketing uses UTC day floors, exactly as ③/④ do.
- **Template-only phrasing — NO LLM.** Like ③/④/⑤/⑥, the owner-facing sentence is rendered deterministically (`templateForFinding` in `phrasing.ts`, `metricText`/`evidenceText` in `lib/signalCopy.ts`). The model never phrases a safety finding — this is itself a structural never-reassure guarantee (`validatePhrasing` is defense-in-depth, not the primary defense).
- **Descriptive, never causal.** Chronicity names *duration and frequency*, never a food/protein/mechanism/diagnosis. `associationalOnly`-class copy; `CAUSAL_RE` / `REASSURANCE_RE` in `validatePhrasing` must reject any drift.
- **Safety class; absence is silence, not wellness.** ⑦ is `priorityClass: 'safety'`. Its **absence is never an all-clear** — a quiet stretch produces silence (the no_pattern/building state), never "resolved" or "improving" copy (§4.7).

### 2.1 Engine input changes

**None.** ⑦ reads the existing `DetectionInput.symptomEvents` and `now`. No new caller wiring, no new DB query, no migration. (This is the "computable today" point of Finding 2 — every field already flows into the engine.)

---

## 3. The gap, precisely — what ⑦ catches that ③/④ miss

| Pet's real state | ③ reflection | ④ worsening | ⑦ chronicity (this spec) |
|---|---|---|---|
| Steady ~3 vomits/wk for 6 wks, ongoing | **renders calm** "same as last week" ⚠️ | silent (no rise) | **fires** "ongoing ~6 weeks" ✅ |
| Slowly worsening (2→3→4/wk) | suppressed (worsening gate) | **fires** "up from N" ✅ | **fires** (also chronic) — §5 composition |
| One bad week (5 in 7 days), then nothing | silent (zero current) | fired that week, then silent | silent (span/active-weeks floor) ✅ |
| Improving tail of a chronic course (4→3→1/wk), still recent | would render "improving — down from 4" ⚠️ | silent | **fires + suppresses ③** ✅ (§4.4) |
| Two isolated bouts 5 wks apart, nothing between | silent | silent | silent (episode/active-week floor) ✅ |

The two ⚠️ rows are the false-reassurance cases the council named. **Closing them is the point of the detector** — and closing the second row (the "improving tail") is *only* achieved by ⑦ suppressing ③ (§4.4), which is therefore load-bearing, not cosmetic.

---

## 4. Detector ⑦ — `symptom_chronicity`

### 4.1 Claim shape

> *"We've logged {symptom} for {pet} across {activeWeeks} of the last {windowWeeks} weeks — {episodeCount} episodes since {month}. A symptom that keeps recurring over weeks is worth {a word with your vet | booking a vet visit}. A read of your logs, not a diagnosis."*

- Names **duration + recurrence + count**. Never a cause, food, mechanism, or severity verdict.
- The honest denominator is **active weeks over the lookback** ("3 of the last 8 weeks"), never an implied continuity the data can't support.
- "since {month}" anchors the first logged onset — concrete, trust-building, non-clinical.

### 4.2 Definitions

For each `SymptomType` in `CORRELATION_SYMPTOM_TYPES` (⑦ runs on **all** correlation symptoms — chronic diarrhea / chronic pruritus are as real as chronic vomiting; this differs from ⑤'s vomit-only scope and matches ③/④), over a lookback of `chronicity.windowDays` trailing from `now`:

- **Episode onsets** — same 3h-collapsed onsets as ③/④ (`toEpisodeOnsets`), filtered to the lookback.
- **`episodeCount`** — number of collapsed episodes in the lookback.
- **`firstOnsetMs` / `lastOnsetMs`** — earliest / latest episode onset in the lookback.
- **`spanDays`** — `(lastOnsetMs − firstOnsetMs)` in days. The first→last duration of the course.
- **`activeWeeks`** — count of **distinct now-anchored 7-day buckets** that contain ≥1 episode: `bucket = floor((nowMs − onsetMs) / 7d)`, buckets `0..floor(windowDays/7)−1`. Measures *distribution* — not two endpoints, not one cluster.
- **`symptomDays`** — distinct UTC days with ≥1 episode (evidence/density detail).
- **`daysSinceLastEpisode`** — `(nowMs − lastOnsetMs)` in days. The recency / "still ongoing" measure.

### 4.3 Floors — ALL must pass to fire

| Floor | Default | What it guarantees / which break it closes |
|---|---|---|
| `spanDays ≥ minSpanDays` | **21** (3 weeks) | The course has genuine **duration**. 3 weeks is the standard small-animal "chronic" threshold for GI signs (Dr. Chen). Closes: a one-bad-week cluster (span < 21). |
| `episodeCount ≥ minEpisodes` | **6** _(build-calibrated from 4 — §9 D2)_ | A real sustained **burden**, not two endpoints. Closes: two isolated bouts weeks apart (Break 5), and — at 6 — the §7 #14 noise gate (4 leaked ~9.9% on occasional noise with meals logged). |
| `activeWeeks ≥ minActiveWeeks` | **3** | The symptom is **distributed** across the span, not concentrated. Closes: a log-gap that leaves two endpoints reading as "ongoing for N weeks" (Break 3) — the chronicity analog of ④'s fake-rise guard. |
| `daysSinceLastEpisode ≤ ongoingRecencyDays` | **14** | The course is **still ongoing / unresolved**. A course whose last episode is older than this may have resolved → ⑦ is **SILENT** (never "resolved" — §4.7). Closes: nagging about a settled problem, AND the "is this still happening?" honesty of the word *ongoing*. |
| **logging-eligibility** (both halves of the lookback clear the coarse logging-days floor) | reuse `reflection.minLoggingDaysPerWindow` semantics over the span | A wholly-dark stretch cannot manufacture span/distribution. Same coarse "was the app used at all" floor ④ uses; see the accepted residual in §4.7. |

A symptom that clears **all** floors is a chronicity candidate. The engine surfaces **at most ONE** chronicity card (the most chronic symptom — §4.5 tie-break) so the safety surface stays calm.

**Anti-cluster / anti-gap interplay (why three floors, not one).** `spanDays` alone is fooled by two distant endpoints; `episodeCount` alone is fooled by one acute multi-bout day (collapsing helps, but a genuinely-bad single day can still reach 3–4 episodes); `activeWeeks` alone could fire on 3 sparse single-vomit weeks. The three together require *sustained, distributed, durable* presence. Each floor closes a distinct break; the adversarial pass (§10) verifies the conjunction.

### 4.4 The ③ suppression coupling — THE VALVE (load-bearing)

This is the never-reassure heart of the lane, mirroring how ④ already gates ③.

Today `detectReflections` stays globally silent if **any** symptom `isWorsening`. ⑦ **extends that global gate**: the reflection layer also stays silent if **any** symptom `isChronic` (the §4.3 conjunction). Concretely:

```
// detectReflections global gate (extended):
if (stats.some(s => isWorsening(s, cfg)) ||
    chronicityStats.some(s => isChronic(s, cfg.chronicity))) return []
```

`isChronic` is a **single shared predicate** consumed by BOTH ③'s suppression gate AND ⑦'s firing — exactly the one-predicate-two-consumers architecture that makes ④'s valve "closed by construction." So **"③ goes silent ⟺ ⑦ speaks" holds by construction** and cannot drift.

Why this is load-bearing and not cosmetic: without it, the **improving tail of a chronic course** (4→3→1 episodes/wk, last episode recent) renders ③'s *"improving — down from 4 the week before"* — a soothing card on a pet that has been sick for six weeks and is still vomiting. That is precisely the "false-reassurance by framing" the council's most cautious lenses (skeptic, criticalist) named the single biggest mis-action risk. ⑦ fires (span long, recent, distributed) and suppresses ③ → the owner sees "ongoing for weeks," not "improving." **This row of §3's table is closed only by this coupling.**

### 4.5 Interaction with ④ (same-symptom) — PM/Dr. Chen decision, recommended default

A pet that is **both** worsening (week-over-week rise) **and** chronic will trip both ④ and ⑦ for the same symptom. Two same-symptom safety cards — *"ongoing for 6 weeks"* + *"3 up from 2"* — is redundant and dilutes the calm surface (Principle 3). Options:

- **(Recommended) ⑦ suppresses ④ for the same symptom type**, in the composition layer (sibling of `suppressTimeOfDayWhenPostprandial`). Rationale: chronicity is the **more complete** clinical statement and the council ranked it **above** the week-over-week bump (Consensus #3). To never lose urgency, ⑦ **inherits the firm tier** when the suppressed ④ would have been a worsening rise (`resolveChronicityTier` checks "is this symptom also worsening?"). Different symptoms both keep (the two-signal gestalt the brief found missing — e.g. chronic vomiting + worsening itch → two cards).
- **(Alternative) Co-fire, rank ⑦ above ④.** Simpler, never drops a signal, but accepts the same-symptom redundancy.

**This is the one clinically load-bearing composition call this spec does not decide unilaterally** — it routes to PM + Dr. Chen (§9 Open). The recommendation is suppress-④-same-symptom-with-tier-inheritance.

### 4.6 Copy-urgency tier

Anchored on **duration** (chronicity's natural urgency axis), not the week-over-week delta (that is ④'s axis). Resolved in the deterministic engine (`resolveChronicityTier`), like `WorseningTier` — copy only renders the already-decided tier.

| Tier | Condition | Register |
|---|---|---|
| `firm` | `spanDays ≥ firmSpanDays` (≥6 weeks) **OR** the same symptom is also worsening (§4.5 inheritance) | "...worth **booking a vet visit**." |
| `standard` | otherwise (span in [3 weeks, 6 weeks)) | "...worth **a word with your vet**." |

No `soft` register: a symptom present and recurring for ≥3 weeks always points at the vet — the gentlest chronicity register still does. (This is intentionally one tier fewer than ④, which has a `soft` spread-only arm that has no chronicity analog.)

### 4.7 Guardrails specific to ⑦ (the never-reassure asymmetry, made concrete)

1. **Silence is never "resolved."** When `daysSinceLastEpisode > ongoingRecencyDays`, ⑦ does **not** fire — and produces **no copy at all**. It never emits "the {symptom} seems to have settled" or any resolution language. A recently-settled 6-week course → ⑦ silent, ④ silent (no rise), ③ silent (zero current count → absence rule) → the pet falls to the honest no_pattern/building state ("no current signal"), which is **not** an all-clear. This is the exact mirror of ④'s "absence is silence, not wellness," applied to the recency gate. **Required fixture (§7).**
2. **Never inverted.** A below-floor result (short span, sparse, few episodes) is **silence**, never "the {symptom} doesn't seem to be a lasting problem." (Mirrors ⑤/⑥ §3.5/§4.5.)
3. **Never causal, never mechanism, never severity.** "keeps recurring over weeks" is a frequency/duration statement. No food, no protein, no "chronic enteropathy," no "this is getting serious." `validatePhrasing` (`CAUSAL_RE`, `REASSURANCE_RE`, and the mechanism screens) must reject drift; the template is the structural guarantee.
4. **Global cross-symptom suppression of ③** (§4.4) — a chronic vomiting course must not let a soothing "itch is improving" reflection surface alongside it. The gate is global (any chronic symptom blanks the whole ③ layer), exactly as ④'s worsening gate is.
5. **Logging-gap residual (accepted, safe-direction).** If the owner logged the symptom in weeks 1, 3, 5 but logged *nothing at all* in weeks 2, 4, `activeWeeks` counts 3 and ⑦ may fire "across 3 of the last 5 weeks." The claim is **true** (the symptom did occur in those 3 weeks) and asserts nothing about the dark weeks; the direction of any error is **escalation toward a vet, never reassurance**. Documented and accepted, sibling of ④'s under-logging residual. The logging-eligibility floor still blocks a *wholly*-dark span.

### 4.8 Finding payload

```ts
export interface SymptomChronicityFinding extends FindingBase {
  type: 'symptom_chronicity'
  priorityClass: 'safety'
  symptomType: SymptomType
  /** Collapsed episodes in the lookback. ≥ minEpisodes. */
  episodeCount: number
  /** First→last onset span, in days. ≥ minSpanDays. */
  spanDays: number
  /** Distinct now-anchored 7-day buckets carrying an episode. ≥ minActiveWeeks. */
  activeWeeks: number
  /** Distinct UTC symptom-days (density/evidence detail). */
  symptomDays: number
  /** Days since the most-recent episode. ≤ ongoingRecencyDays (the "ongoing" gate). */
  daysSinceLastEpisode: number
  /** ISO-8601 UTC of the first logged onset in the lookback — powers "since {month}" copy. */
  firstOnsetIso: string
  /** Resolved urgency tier (duration-anchored; firm-inherited if also worsening — §4.5/§4.6). */
  tier: ChronicityTier
  /** The lookback in days (the "{windowWeeks} weeks" denominator). */
  windowDays: number
  /** Hard marker for phrasing + reviewers: duration/frequency only, never causal. */
  associationalOnly: true
}

export type ChronicityTier = 'standard' | 'firm'
```

Add `'symptom_chronicity'` to `InsightType` and to the `Finding` union.

---

## 5. Ranking & composition changes

- **Priority band.** `priorityBand` returns `0` (safety) for `symptom_chronicity` — leads every insight, always visible.
- **Within the safety band.** Update `SAFETY_TYPE_ORDER`:
  ```
  { intake_decline: 0, symptom_chronicity: 1, symptom_worsening: 2 }
  ```
  Rationale: intake-decline stays first (anorexia / the feline 48h hepatic-lipidosis window is the **fastest-killing** emergency, unchanged). Chronicity outranks the week-over-week worsening bump because the council ranked sustained chronicity above the bump as the more clinically established concern (Consensus #3). All three lead every insight; co-firing across different axes is intentional (the multi-signal gestalt the brief found missing).
- **Composition / mutual exclusion.** If §4.5's recommended option is taken: add `suppressWorseningWhenChronic(findings)` (sibling of `suppressTimeOfDayWhenPostprandial`), run in `detectSignals` before `rankFindings` — drop any ④ finding whose symptom type already has a ⑦ finding. Keep this in the composition layer so each detector stays pure and independently unit-testable.
- **Calm surface.** ⑦ surfaces at most one card. Combined with the ≤~4 visible-card cap (§3.2 of the AI Signal spec), safety still leads and is never dropped to honor the cap (Principle 3).

---

## 6. Config defaults

Add a `chronicity` block to `DetectionConfig` and `DEFAULT_CONFIG`. **All values are v1 starting points — tune on real data, not a re-decision** (parent §7 philosophy).

```ts
chronicity: {
  /** Lookback in days (8 weeks = exactly 8 now-anchored weekly buckets; covers the council's 6-week case + headroom). */
  windowDays: 56,
  /** First→last span floor — the clinical "chronic" threshold for GI signs (≥3 weeks). */
  minSpanDays: 21,
  /** Sustained-burden floor — not two endpoints. (BUILD: raised 4→6 to pass the §7 #14
   *  noise gate; see §9 D2. Dr. Chen ratifies 6-vs-5.) */
  minEpisodes: 6,
  /** Distribution floor — distinct now-anchored weekly buckets with an episode (anti-cluster / anti-gap). */
  minActiveWeeks: 3,
  /** "Still ongoing" floor — an episode within this many days, else SILENT (never "resolved"). */
  ongoingRecencyDays: 14,
  /** Duration-anchored 'firm' register floor (≥6 weeks → "book a vet visit"). */
  firmSpanDays: 42,
}
```

Reuse `reflection.minLoggingDaysPerWindow` (or its span-scaled equivalent) for the logging-eligibility floor rather than adding a second knob — a diagnostic should mirror the floor of the layer it couples to.

**Calibration note for the build (do NOT skip — mirrors the ⑥ lesson).** The §4.3 floors must be validated with a **property test on noise**: random sparse onsets (a pet with occasional, unrelated single vomits) must **not** trip ⑦ at a meaningful rate. If the conjunction fires too readily on noise, raise `minEpisodes`/`minActiveWeeks` (errs toward silence — the safe direction for a never-reassure lane), exactly as ⑥'s `minClusterEpisodes`/`minClusterFraction` were calibrated up to pass its property test. The property test is a **required** acceptance gate (§7), not optional.

---

## 7. Acceptance criteria & required fixtures (QA + adversarial review)

A unit fixture for each must exist (`detection.test.ts`); the ⚠️/silence cases are the never-reassure gates.

**Fires correctly:**
1. **The council case (golden).** ~20 vomit episodes over 42 days, ~q2-day, most recent today → fires `firm`, `spanDays≈42`, `activeWeeks 6`, `episodeCount≈20`. The motivating case must produce a chronicity card.
2. **The flat-relentless case (the whole point).** Steady 3 vomit episodes/week for 6 weeks, ongoing → ④ silent (no rise), **⑦ fires**, **③ suppressed** (no "same as last week"). 
3. **Standard tier.** Distributed vomiting over exactly 3–4 weeks, recent → fires `standard` ("a word with your vet").
4. **Intermittent-but-chronic.** Episodes in weeks 1, 3, 5 (gap weeks logged, pet just didn't vomit), recent → `activeWeeks 3` → fires (recurrent chronic is real).
5. **Non-vomit symptom.** Chronic diarrhea over 5 weeks → fires (⑦ is symptom-agnostic).

**Stays silent (never-reassure / honesty gates):**
6. **Recently resolved.** 6-week course whose last episode was 20 days ago → `daysSinceLastEpisode 20 > 14` → **silent, no resolution copy**, and ③ also silent (zero current count). The pet falls to no_pattern, **never an all-clear** (§4.7 #1).
7. **One bad week.** 5 episodes in a single 7-day span, then nothing → `spanDays < 21` → silent.
8. **Two distant bouts.** Vomit on day −40 and day −2, nothing between → `episodeCount 2 < 4` AND `activeWeeks 2 < 3` → silent.
9. **Acute multi-bout single day.** 6 vomits in one afternoon → collapse to ~2 episodes, `spanDays ≈ 0` → silent.
10. **Wholly-dark prior span.** No logging at all for the first 5 weeks of the lookback, vomiting only in the last week → logging-eligibility floor blocks a manufactured span → silent (or fires only if the *recent* week alone is a genuine acute case, which is ④'s/per-incident's job, not ⑦'s).

**Composition / ranking:**
11. **Chronic + worsening same symptom** → §4.5 recommended: one card (⑦, firm-inherited), ④ suppressed.
12. **Chronic vomiting + improving itch** → ⑦ vomiting card; ③'s "itch improving" reflection is **suppressed** by the global gate (§4.4 / §4.7 #4).
13. **Rank order.** intake_decline (if co-firing) leads chronicity leads worsening.

**Property test (required gate):**
14. Random sparse onsets (noise) fire ⑦ at ≪ a small target rate; report the measured rate (the §6 calibration note).

**Phrasing:**
15. `validatePhrasing` rejects a chronicity sentence containing any `CAUSAL_RE` / `REASSURANCE_RE` / mechanism term; template output passes.

---

## 8. Build plan — gated PRs

In dependency order. The detector is pure and additive; nothing here touches a migration or the caller's query.

1. **PR 1 — the detector + payload + config (engine-only).** `SymptomChronicityFinding`, `InsightType`/`Finding` union, `chronicity` config block, `computeChronicityStats`, `isChronic`, `resolveChronicityTier`, `detectChronicity`, registry entry. Fixtures 1–10, 14. **`adversarial-reviewer` MANDATORY** (the never-reassure asymmetry + the silence-not-resolved gate + the noise property test are exactly its job — this is the lens that should have caught the "nearest-preceding meal" bug). 
2. **PR 2 — composition & ranking.** Extend `detectReflections`' global gate with `isChronic` (the valve, §4.4); `SAFETY_TYPE_ORDER`; `suppressWorseningWhenChronic` (pending the §4.5 PM/Dr. Chen call). Fixtures 11–13. **`adversarial-reviewer` MANDATORY** (the ③ valve is the load-bearing never-reassure coupling).
3. **PR 3 — copy.** `templateChronicity` in `phrasing.ts` (template-only, `templateForFinding` case), `metricText`/`evidenceText` in `lib/signalCopy.ts`, `validatePhrasing` coverage (fixture 15). `nyx-voice` + `clinical-guardrails` skills apply. Designer + Dr. Chen sign-off on copy.

Each PR carries the DoD checklist; PRs 1–2 carry the **mandatory adversarial-review line** (a named counterexample tried + why it held, per CLAUDE.md DoD).

---

## 9. Decisions

### Decided by this spec (team-internal, no PM input needed)
- ⑦ runs on **all** `CORRELATION_SYMPTOM_TYPES`, not vomit-only (chronic diarrhea/pruritus are real; differs from ⑤, matches ③/④).
- Chronicity is **timezone-independent** (duration/recency) → no `timezone` input.
- **Template-only phrasing**, no LLM (like ③/④/⑤/⑥).
- Two tiers only (`standard`/`firm`), duration-anchored; no `soft`.
- The `isChronic` predicate is **shared** between ③'s suppression gate and ⑦'s firing (valve closed by construction).

### Routed to PM / Dr. Chen — provisionally decided 2026-06-26 (PR 1 build session, recommend-and-proceed; awaiting ratification)

The PR-1 kickoff directed the build session to take D1/D2/D3. Per CLAUDE.md recommend-and-proceed, the spec recommendations were adopted so the build could proceed; **all three remain flagged for PM/Dr. Chen ratification**, and D2 carries an empirical revision the property test forced.

- **D1 (§4.5) — same-symptom ④↔⑦ interaction. → ADOPTED: ⑦ suppresses ④ same-symptom, with firm-tier inheritance when also worsening** (the recommended option; chronicity is the more complete statement and the council ranked it above the week-over-week bump). **Build scoping:** this is a COMPOSITION-layer change (sibling of `suppressTimeOfDayWhenPostprandial`) and lands in **PR 2** with the §4.4 ③-suppression valve, NOT PR 1 — so PR 1's `resolveChronicityTier` is span-only and ships no untested inheritance path. The inheritance arm is built where the suppression that activates it is built.
- **D2 — floor values (§6). → ADOPTED with one EMPIRICAL REVISION: `minEpisodes` raised 4 → 6.** The other floors are unchanged (`minSpanDays 21 / minActiveWeeks 3 / ongoingRecencyDays 14 / firmSpanDays 42 / windowDays 56`). **Why 6, not the table's 4:** the §7 #14 noise property test — the REQUIRED gate "before these lock" — FAILS at 4. On the realistic engaged-owner regime (meals logged daily ⇒ the span-halves logging floor is trivially met ⇒ `minEpisodes` is the binding floor), an *occasional* vomiter (~2 unrelated vomits / 8 weeks) trips ⑦ **~9.9%** of the time at `minEpisodes 4`, because the binomial tail of even sparse vomiting reaches 4 scattered episodes that clear span/active-weeks/recency. At **6** the rate falls to **~1.3%** (20k-trial deno sweep) while every clinical fixture still fires (the classic once-a-week-for-6-weeks course = 6 episodes). `minActiveWeeks` stays 3 — raising it to 4 barely moves the rate (~1.26%) and would kill the §7 #4 intermittent-across-3-weeks case. This mirrors ⑥'s calibration (its §4.3 table defaults also failed its own required property test and were raised). **The 6-vs-5 choice is the live D2 clinical call for Dr. Chen** — a sensitivity/specificity trade: 6 favors specificity (keeps the safety surface credible — Principle 3); 5 favors sensitivity (catches a 5-episode course) and is defensible *because* the safe error direction for a SAFETY lane is toward firing, not silence (a conservative "worth a word with your vet" on a genuinely-recurring pet is never a false all-clear). See the §6 ACCEPTED RESIDUAL below.
- **D3 — greenlight to build. → TAKEN; PR 1 built** (`detection.ts` detector + payload + config + registry; `phrasing.ts` placeholder template; `index.ts` template-only entry; `detection.test.ts` fixtures 1–10 + 14). 249/249 generate-signal tests green; `adversarial-reviewer` pass run. Promotion of the full PR1→3 chain to a deploy is still the PM call (the engine is registered but DEPLOY-GATED on the client renderer — PR 3).

**Calibration residual (new, §6).** The count floor cannot separate "6 vomits of one chronic course" from "6 unrelated vomits over 8 weeks" — the engine has only count/span/distribution/recency. A denser coincidental pattern (≥6 episodes, distributed, recent) still fires. For a SAFETY lane this is the SAFE error (a conservative vet nudge, never a false all-clear) — the opposite safe-direction from descriptive lanes ⑤/⑥, and exactly why ⑦ is safety-class. Intrinsic, sibling of ⑤'s grazing-guard / ⑥'s n=8 residuals; tune on real data, don't re-decide.

---

## 10. Adversarial review — pre-staged falsification (the mandatory DoD pass)

The CLAUDE.md DoD requires the relevant expert to **name the concrete counterexample they tried and why the logic held** — a bare ✓ is not sign-off. The real `adversarial-reviewer` runs against the *built code* (§8 PRs 1–2). This table pre-stages the breaks the build must survive, so the design is reviewable now and the build pass has a target list.

| # | Falsification attempt (Data Scientist / Dr. Chen) | Why the design holds |
|---|---|---|
| 1 | **Flat-relentless reads as "same as last week."** Steady 3/wk for 6 wks → does ③ reassure? | ⑦ fires (span 42 ≥ 21, episodes 18 ≥ 4, activeWeeks 6 ≥ 3, recency 0 ≤ 14) AND the shared `isChronic` gate **blanks ③**. The calm reflection is replaced by an escalating card. **Held — the core requirement.** |
| 2 | **Improving tail reassures.** 4→3→1/wk, last vomit 5 days ago → ③ renders "improving — down from 4." | ⑦ fires (span long, recent, distributed) → ③ suppressed (§4.4). Owner sees "ongoing for weeks," not "improving." **Held — closed *only* by the ⑦→③ valve.** |
| 3 | **Recently-resolved course reassures.** 6-wk course, last episode 20 days ago. | `daysSinceLastEpisode 20 > 14` → ⑦ silent **and emits no resolution copy**; ③ silent (zero current count); ④ silent. Surface = honest no_pattern, **not** an all-clear. **Held — silence ≠ wellness, the §4.7 mirror of ④.** |
| 4 | **Log-gap manufactures chronicity.** Heavy logging wk 1, app unused wks 2–4, vomiting wk 5 → "ongoing 5 weeks"? | `activeWeeks` = 2 (wk1, wk5) < 3 AND logging-eligibility floor flags the dark span → **silent**. **Held — the distribution floor is the fake-rise analog.** |
| 5 | **One bad day padded.** 6 vomits in an afternoon → 6 "episodes"? | 3h collapse → ~2 episodes, `spanDays ≈ 0 < 21` → silent. **Held.** |
| 6 | **Two endpoints, weeks apart.** Vomit day −40 + day −2 → span 38, looks chronic? | `episodeCount 2 < 4` AND `activeWeeks 2 < 3` → silent. **Held — "twice in 6 weeks" is not ongoing.** |
| 7 | **Cross-symptom soothing.** Chronic vomiting + improving itch → "itch is down" card alongside? | ③'s global gate blanks the **whole** reflection layer when any symptom `isChronic`. No soothing itch card. **Held.** |
| 8 | **Noise sparse vomits fire it.** Occasional unrelated single vomits across 8 weeks. | The §4.3 conjunction (≥4 episodes AND ≥3 active weeks AND ≥21-day span AND recent) is hard to satisfy by sparse noise; the §7 #14 property test is a required gate that *measures* the noise fire rate and forces floors up if it's not ≪ small. **Held by construction + verified empirically.** |
| 9 | **Under-logged prior week inflates nothing it shouldn't.** Symptom logged wks 1,3,5; dark wks 2,4. | Fires "across 3 of 5 weeks" — claim is TRUE (symptom did occur those weeks), asserts nothing about dark weeks, errs only toward escalation. **Accepted safe-direction residual (§4.7 #5), never reassurance.** |

If the build's `adversarial-reviewer` cannot name a fresh break beyond these, the lane is reviewed; if it finds one, it routes back before merge.

---

## 11. Persona sign-off (spec stage)

- **Data Scientist** — tried to break it with the log-gap-two-endpoints case (#4) and the noise-sparse case (#8); the `activeWeeks` distribution floor + the required noise property test hold both. The `isChronic`-shared-with-③ valve is the same provably-closed architecture as ④. ✓ (pending the §6 calibration on real data).
- **Dr. Chen** — tried the recently-resolved-6-week-course (#3): ⑦ stays silent and emits no resolution language, ③ can't reassure on zero current count → no path to a false all-clear. Confirmed 3 weeks as the clinical chronic floor and that chronicity outranks the week-over-week bump clinically. ✓
- **Designer** — copy names duration + recurrence + a vet ask, no decoration, ≤1 card, safety-leads (Principles 3, 6). Owner-facing register reviewed against `nyx-voice` at PR 3. ✓ (copy finalized in PR 3).
- **PM decisions needed** — D1 (④↔⑦ same-symptom interaction), D2 (floor ratification), D3 (greenlight to build). §9.

---

*Append-only in spirit: tune the §6 defaults on real dogfood data rather than re-deciding the design. If the engine architecture changes materially, supersede this spec with a new revision rather than overwriting the rationale.*
