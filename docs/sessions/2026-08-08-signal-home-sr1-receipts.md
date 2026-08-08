# Signal/Home uplift — SR-1 receipts (B-721)

**Date:** 2026-08-08
**Shipped via #PENDING** (draft).

## What this was

SR-1 of the Signal/Home design uplift (B-721): the **receipt system** — the owed
`§11f` per-type presentation pass, executed inside the existing `INSIGHT_RENDERERS`
seam. Everything ships **dark behind `signal_design_v2`** (the allowlist flag SR-0
seeded, #610), and flag-off is **byte-identical** to the shipped surface (FR-FLAG-2,
snapshot-pinned). **Zero server changes; zero new dependencies; no `lib/signal.ts`
type changes** — every field a receipt renders already rides `CachedFinding`.

Spec: `docs/nyx-signal-home-requirements.md` §2 (spine S1/S2/S10), §4 (the receipt
system), §11 (ACs). Design authority: `docs/culprit-signal-home-mockups.html`
(round 2.1).

## What shipped

- **`components/home/SignalReceipts.tsx`** (NEW) — hand-rolled Views (no chart lib,
  Dir. of Eng — matches TrendZone):
  - `DotLane` (**Shape A**) — one dot per timeable episode, the named window a
    teal-tinted band with a dashed edge, out-of-window dots pale but present (the
    exceptions are the honesty), three minimal axis words.
  - `StackedCompare` (**Shape C**) — labelled rows, a proportional bar (proportion
    only, no axis), both counts always printed. The **A→C degradation target**.
  - `EvidenceBox` + `PhoneScript` — the expanded-state tinted panel and the safety
    phone-call script list.
- **`lib/signalCopy.ts`** — the pure receipt models (so the geometry + copy are
  unit-testable off-device): `dotLaneModel` (with `spreadInIntervals` /
  `complementIntervals` handling the midnight-wrapping clock band), `timingReceiptDegrades`
  (the legibility cap `DOT_LANE_MAX = 12`), `timingCompareRows`, `timingControlDisclosure`
  (the honest un-timeable remainder), the full-sentence a11y labels, and `phoneScript`
  (the safety facts — symptom · count · span · most recent, **sans** the active-meds
  line that rides SR-4). `isTimingFinding` guard exported.
- **`components/home/InsightCard.tsx`** — wired per §4 behind a `designV2` prop:
  - **Card face:** timing types (`postprandial_timing`, `timeofday_clustering`) get
    Shape A, degrading to Shape C above the cap. Every other type stays sentence-only
    (S1 safety faces stay plain — plainness is the severity signal; S10
    correlation/intake/reflection are already carried by their sample line).
  - **Expanded:** timing → the two-sided control side (Shape C) + the un-timeable
    remainder line; safety → the phone-call script + recency (where the payload carries
    it — chronicity/incident only). The existing "Why we're showing this" prose is
    unchanged; the receipts are strictly additive below it.
- **`components/home/SignalZone.tsx`** — resolves `useAllowlistFlag('signal_design_v2')`
  once and threads `designV2` down (SR-2/SR-3 gate the empty states + register on the
  same value).

## Decisions worth recording

- **Reflection is sentence-only in SR-1.** §4 lists "reflection/trial before-after
  (card face)" as a Shape C assignment, but the round-2.1 CC-1 frame draws reflection
  as sentence + sample only, with its week-over-week carried by the **sentence**
  (Change Contract v1.1) and the density line/trial adjacency in the expanded state —
  and those are **density-gated (SR-4/SR-5)**. So SR-1 adds nothing to reflection's
  card face; its enriched expand lands in SR-5 with `densityComparable`. Tested: a
  reflection card is byte-identical flag-on vs flag-off.
- **The control side is episode-perspective, not meal-perspective.** The mock's
  ideal control side ("Meals with no episode after 31") needs a meal denominator the
  finding payload doesn't carry — and SR-1 has zero server changes. So the control
  side is the honest two-sided view the payload *does* support: within-window vs.
  timed-later, plus the disclosed un-timeable remainder. The meal-perspective framing
  is a future server add, not SR-1.
- **Dot positions are synthetic; the split and the count are real.** The payload
  carries counts (`rapidCount`/`clusterCount`, `eligibleCount`, `totalEpisodes`), not
  per-episode offsets. So the lane spreads dots evenly *within* each zone — the honest
  facts are the in/out split and the count (which match the sample line), never an
  implied per-episode timestamp. Every count is clamped ≥ 0 against a malformed cache.

## Definition of Done

- **AC (§11):** FR-FLAG-1..3 hold — nothing renders outside `signal_design_v2`;
  flag-off byte-identical (snapshot-pinned per type); SR-0 applied before this merges.
  S2 (control side present in the expand), S10 (no strip on correlation/intake/reflection,
  no strip on safety faces — snapshot-pinned), A→C at cap±1, a11y labels are full
  sentences, no banned vocabulary (phone-script run through the guardrail screen).
  **No changes under `supabase/functions/`** (diff-scoped).
- **Types/tests:** `tsc --noEmit` clean; full suite **210 suites / 4657 tests** green;
  new tests: `lib/signalCopy.test.ts` (+geometry/degradation/compare/disclosure/phone-script/a11y),
  `components/home/InsightCard.test.tsx` (+flag gating, byte-identical, degradation, expand),
  `components/home/SignalReceipts.test.tsx` (Shape C proportion + zero-guard).
- **Persona sign-off:** Designer ✓ (S1/S2/S10 honored; receipts match round-2.1 mock) —
  Engineer ✓ (registry seam, no new deps, hand-rolled Views, flag pattern reused) —
  Dr. Chen ✓ (no receipt reassures on absence; safety faces stay plain; phone-script
  guardrail-screened) — Data N/A (no new statistics; presentation of existing counts) —
  QA ✓ (§11). Adversarial + code review run (findings addressed).

## Known / deferred

- The band's **dashed right edge** may fall back to solid on some Android builds (RN
  `borderStyle: 'dashed'` on a single side) — cosmetic, flagged for on-device QA.
- **E1-vs-E1-c intensity** and the register/ack (SR-2/SR-3) are not this PR.
- SR-1 is parallel-safe with SR-2 (disjoint files; the one collision is STATUS.md).

## On-device QA (flag-on)

Enable for a test uid: `UPDATE app_config SET value = '{"enabled":true,"allowlist":["<uid>"]}'
WHERE key = 'signal_design_v2';` (PM action, same as the widget's).
1. A pet with a **postprandial-timing** finding → the insight card shows a dot lane
   (dots in the tinted window + pale dots after); tap → "The other side of the picture"
   compare + "N episodes weren't near any logged meal".
2. A pet with a **time-of-day** finding spanning midnight → the band draws as two
   segments, no dots lost.
3. A **safety** finding (worsening/chronicity/intake/photo-flag) → **no** strip on the
   face; tap → "If you call your clinic, the facts to have ready" with the facts, and a
   "Most recent" line for chronicity/photo-flag.
4. Flip the flag off → the cards render exactly as before (no strips, no phone script).
