# The Trend zone outranks the Signal's safety gates — B-067 / CUL-372

**Date:** 2026-08-22

**Shipped via #695.**

**Mode:** BUILD. Ran in two halves: an investigation that reframed the issue and stopped at
the PM decision gate with a mock round, then — once ruled — the build itself. The sections
below are in that order, so the first half's "no app code changed" is a snapshot of the
gate, not the session's outcome.

**Issue:** CUL-372 (B-067) — "AI Signal reflection (③) duplicates the Trend zone for symptom counts".
Filed 2026-06-07, labelled `Quick Win` / `Area: Correctness`, priority High. No comments on the
issue, so the description was the whole spec.

## What the investigation found

B-067 was filed as a **redundancy** item: ③'s hero sentence says what the Trend card one row
below already says, with strictly less (no sparkline). That framing is now out of date.

Since June 2026 detector ③ grew four gates — the global **worsening** gate (④), the global
**chronicity** gate (⑦), the SR-4 **density-comparability** gate (B-721 §3.3), and the
**absence** guard. `components/home/TrendZone.tsx` computes its own week-over-week verdict from
local SQLite via `hooks/useTrend.ts` and has **none of them**. So the overlap is no longer
duplication — the Trend card is a **bypass** of the Signal's safety architecture.

Four cases reproduced by replaying one event set through both code paths (harness:
`detectReflections` / `detectChronicity` / `templateReflection` / `templateChronicity` from the
shipped Edge Function, against `useTrend`'s arithmetic transcribed line-for-line):

| Case | Signal says | Trend says | What breaks |
|---|---|---|---|
| **A** chronicity | ③ silent; ⑦ escalates ("across 6 of the last 8 weeks — 21 episodes… worth a word with your vet") | "↓ from 4 last week — **improving**" in `colorAccent` | The global chronicity gate is defeated. Reassurance on a chronically ill pet — the vet council's named top mis-action risk. |
| **B** density | "We've logged 2 episodes of vomiting for Nyx this week." (comparison withheld; logging fell 6d → 4d) | "↓ from 5 last week — improving" | The deliberately-withheld clause is printed verbatim one card below, uncaveated. §3.3's fail-toward-escalation is reversed. |
| **C** episodes | "…2 episodes this week, down from 5 last week." | "5 this week · Same as last week (5)" | Different counting units (3h episode collapse vs raw rows). Two numbers, two directions, one screen. |
| **D** subject | "…2 episodes of vomiting…" | "Lethargy · 4 this week" | `lethargy` is charted by Trend but absent from `CORRELATION_SYMPTOM_TYPES`, so ③ can never speak about it. |

**Correction to the issue's item (2).** B-067 predicted a window-boundary mismatch and proposed
a shared window helper. The boundaries **already agree** — both surfaces use a rolling
`[now−7d, now)` / `[now−14d, now−7d)`. A shared window helper fixes none of the four rows. The
divergence is in the counting unit, the symptom set, the subject selection, and gate coverage.
Flagged to the PM rather than silently re-scoped.

## Falsification attempted

The claim under test was "the Trend card can render reassurance the Signal deliberately
suppressed." Attempt to break it: build a chronic course whose gates *should* all engage, give
both windows equal logging density so the density gate cannot be what fires, and confirm ③ is
blanked by chronicity specifically rather than by the floor or the eligibility guard.
`detectReflections` returned `[]` while `detectChronicity` returned one finding
(span 40d, 21 episodes, 6 active weeks, tier `standard`) — so ③'s silence is the gate, not the
floor — and the same events drove `useTrend` to `delta = 3 − 4 = −1`, rendering
`↓ from 4 last week — improving` through `styles.chartSubLabelImproving` (`colorAccent`).
The claim **held**. It also held under case B, where density is the sole gate and the Trend
line reprints the exact withheld comparison.

## What is NOT claimed

Signal-cache staleness was considered as a fifth divergence and **dropped** — `useSignal` runs a
debounced regen on write, so a hard skew is not demonstrable and asserting one would overclaim.

## Deliverable

- `docs/culprit-trend-zone-mockups.html` — mock round 1, the decision surface. §01 the two cards
  side by side on the same pet, §02 the four cases, §03 the three options rendered side by side
  on the chronic cat, §04 the two decision briefs. Published as an Artifact (same-URL republish
  on any later round, per the house convention).

## Open — awaiting PM

1. **Which shape.** A (drop Trend's comparison line + the "improving" verdict; keep chart and
   bare count) — recommended · B (Trend inherits the gates by reading the Signal's findings —
   fails open when the cache is absent) · C (suppress ③ — inverts the safety property; the
   issue's own leading option, aged into the wrong answer).
2. **Does the count fix follow in the same PR** (rows C/D — coherence, not safety), or split,
   given CUL-383 may rewrite this card anyway. Recommended: split.
3. **Re-rate.** `Quick Win` no longer fits; the verdict half reads as `Now`.

---

## PM rulings (2026-08-22)

- **D1 — shape:** deferred to the product team → **Option A** (drop the Trend card's comparison line and the "improving" verdict; keep chart + bare count).
- **D2 — count fix:** **rides along** in the same PR, overriding the team's split recommendation.
- **D3 — re-rate:** applied under the Product Owner lens — `Quick Win` removed, priority **Urgent**.

## What was built

**Safety half.** `TrendZone.SymptomChart` renders no week-over-week verdict — no comparison clause, no arrow, no accent. Chart + bare count remain. Same fallback `templateReflection` already uses when its own density gate fires.

**Coherence half.** Episode counting moved onto one predicate and out of the hook:
- `lib/symptomEpisodes.ts` — ms-only adapter, and `detection.ts`'s `toEpisodeOnsets` + `toConfidenceEpisodes` re-based onto it.
- `lib/trendSummary.ts` — the card's window/subject arithmetic, extracted so it is unit-testable.
- `lib/symptomEpisodes.guard.test.ts` — fails the build on a second implementation or on the verdict copy returning.

**Kept `lethargy` on the chart**, against the brief's warning: aligning the selection *rule* rather than the symptom *set* closes the contradiction, and `CORRELATION_SYMPTOM_TYPES` scopes food→symptom correlation, not what belongs on a symptom chart.

## What the reviews broke — and the corrections

Both mandated reviews ran and **both returned negative verdicts on the first cut**. Recorded in full because the corrections are the substance of this session.

**`adversarial-reviewer` — FAIL.** Two of its findings were regressions I had introduced, both from the same decision (bucketing the bars by episode *onset*):
1. **`hasEnoughData` reads those buckets.** A day whose symptoms merely *continue* a chain begun the night before scored 0, so six logged vomits on a pet with no meals logged rendered as *"A few more days of logs and we'll be able to show Nyx's pattern."* Before the change it rendered the chart.
2. **The worst days went blank.** The morning after a chained overnight bout drew an empty column, pixel-identical to a symptom-free day — reassurance-by-absence on the one artifact the fix keeps *because* the Signal cannot draw it.

**Fix: the bars are back to raw events.** They are an intensity plot, not a decomposition of the head's episode count — the head names one symptom type while the bars total all of them, so the two were never arithmetically related. The interim comment claiming otherwise was wrong and is gone.

It also found the module's central claim was false: **`lib/mealTiming.ts` already carried `collapseEpisodes`**, the same chaining rule generic over the event shape. `lib/symptomEpisodes.ts` now *delegates* to it rather than copying it, so "one implementation" is true rather than aspirational.

**`code-reviewer` — fix-before-merge.** Three concrete defects, all in code with no test coverage:
1. **DST boundary bug (mine).** The SQL fetch bound used calendar arithmetic while the window bounds used fixed-offset epoch arithmetic. They agree except across a DST transition, where an event in the diverging sliver was never *fetched* — vanishing from the prior window rather than being visibly filtered. Both now derive from `trendLookbackStartMs`.
2. **Tie-break order.** Selection iterated alphabetically; the engine iterates `CORRELATION_SYMPTOM_TYPES` in declared order. On a genuine tie the two cards named different symptoms — while a comment claimed parity. `TREND_SYMPTOM_TYPES` now carries the engine's order.
3. **No absence floor.** A symptom silent this week could still be selected, rendering *"0 episodes this week"* — reassurance-by-absence with the word "improving" removed. The floor is now shared with `detectReflections`, and the card renders no count line at zero.

**Both reviewers, independently:** the behaviour-neutrality claim rested on a one-off fuzz recorded only in prose. It is now `lib/symptomEpisodes.differential.test.ts` — 40,000 fuzzed inputs against the pre-refactor bodies transcribed verbatim, asserting the fuzz actually reaches duplicate instants and multi-episode splits, plus the overnight-bout case and the one documented divergence (non-finite instants, unreachable — all seven engine call sites pre-filter).

**The guard test needed three rounds of its own.** Its first draft fired on `MS_PER_DAY = 24 * 60 * 60 * 1000`; broadened to a directory scan it fired on `lib/medications.ts`'s double-dose proximity check. It now keys on the algorithm's *shape* — a gap threshold **and** a chaining cursor — and carries tests for its own true and false positives. A guard that cries wolf is one someone eventually deletes.

## A claim I made that was wrong

The original brief dropped Signal-cache staleness as a source of contradiction, reasoning that `useSignal` regenerates on write. **That reasoning is wrong** — the drift is between the last regen's `input.now` and the client's `Date.now()` at render, bounded only by the 24h TTL, and needs no write at all. Filed as **CUL-570**. Aligning the unit removed the larger cause but made the residual sharper, since both cards now print the word *episodes*.

## Verification

- `tsc --noEmit` clean; **245 suites / 5407 jest tests** green, including the non-UTC timezone legs.
- **1369 deno tests** green, run locally on the CI-pinned Deno 2.9.4 (installed for this purpose rather than deferring to CI). Caught a real failure CI would otherwise have found: the intra-`lib` import needed an explicit `.ts` extension, matching `lib/dietTrial.ts` / `lib/trialResponseCounts.ts`.
- Deploy ledger records both drifted closures as behaviour-neutral, now citing the committed test. **`generate-report`'s B-494 hold is unchanged and no redeploy is owed.**

## Filed, not folded in

- **CUL-568** (High) — the *feeding* chart still renders "Every day this week" in the good-news accent over meal-**logging** days. A cat refusing every bowl reads as a green week, and detector ② is structurally silent on a diet refused from day 1. Raised from Medium on the adversarial reviewer's argument that this lands on *intake is not preference*.
- **CUL-570** (Medium) — the cache-vs-live window drift above.
- **CUL-571** (High) — `lib/metricDetail.ts`'s Week tab still states an ungated week-over-week symptom direction, two taps from the card just fixed.
