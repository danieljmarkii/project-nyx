# 2026-08-22 — B-067 / CUL-372: the Trend zone outranks the Signal's safety gates

**Mode:** BUILD, held at the decision gate. Deliverable this session is the reproduction +
the decision brief + mock round 1. No app code changed.

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
