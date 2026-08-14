# Post-Prandial Timing Receipt — Real-Time Distribution (Option A)
**Status:** 🌱 v1.0 BUILD-READY · **Last Updated:** 2026-08-14 · Extends B-721 (Signal/Home receipts, SR-1)

Design authority: **`docs/culprit-postprandial-receipt-mockups.html`** (the build-ready lock).
Decision record: **`docs/culprit-dot-lane-semantics-mockups.html`** (the C/A/B option comparison).

---

## §0 — Decision record

The Home Signal "post-prandial timing" receipt (the "scarf and barf" card) draws one dot per timeable vomiting episode on a lane labelled `ate → 30m → 2h+`. **As shipped, the dots are spaced evenly by index within each zone — the position is not real timing** (`lib/signalCopy.ts` → `dotLaneModel` → `spreadInIntervals`). The detector computes each episode's true `minutesSince` and discards all but the median (`generate-signal/detection.ts`).

The PM raised that the strip *looks like* a timing distribution it isn't plotting. Three options were mocked (C = keep even-spread; A = plot real times; B = drop the axis, honest split). **Ruling: Option A**, PM-approved 2026-08-14 after a Jordan/Sam owner sync.

- **D1 — Plot real per-episode times.** The distribution shape (a cluster at ~9 min vs. a 30-min spread) is genuinely new information the sentence can't carry. Owners are assumed data-savvy (PM design assumption, recorded).
- **D2 — Expanded-early scale.** The first 30 min takes 60% of the lane so the informative cluster is legible instead of crushed into a linear sliver. This also fixes the shipped card's "30m" label floating at mid-lane.
- **D3 — Three conditions make A safe** (the owner sync's output; Sam opposes an ungated A, Dr. Chen constrains it):
  1. **Gate the noisy case** — where timing is unreliable (grazing / free-fed / uncertain attribution), fall back to the honest split, never a confident cluster.
  2. **Honest precision** — soft, jittered dots; never imply minute-level accuracy the logs don't have.
  3. **Anamnesis copy** — the plot shows timing; copy never names a cause, mechanism, or eating-speed (§9.2).

**Persona conflict, resolved by the gate (not a veto):** Data Scientist (A is most informative) vs. Sam + Designer (A manufactures false precision for a grazing, multi-cat home). The gate renders the split for exactly Sam's case, so A ships for the clean case and never fabricates a distribution over noise.

---

## §1 — Scope

Applies to the **`postprandial_timing`** finding only (the after-eating vomiting-timing card). The sibling **`timeofday_clustering`** finding also renders a dot lane but on a 24h clock; its real-position treatment is **out of scope for v1** (it keeps the current even-spread) and tracked as a follow-up (§9). No other finding type renders a card-face dot lane.

Everything ships **behind `signal_design_v2`** (the existing SR-1 allowlist flag) and is **byte-identical to today when the flag is off** (FR-FLAG-2) and **when the real-timing payload is absent** (old cache / pre-deploy → the current even-spread fallback).

---

## §2 — State machine

The receipt renders in one of four states. Selection lives at the call site (`InsightCard.tsx` → `CardFaceReceipt`); the geometry lives in `lib/signalCopy.ts`.

| State | When | Renders |
|---|---|---|
| **Distribution** (default) | real timings present **and** timing reliable **and** ≤ `DOT_LANE_MAX` (12) timeable | the real-position beeswarm (§3) |
| **Gated split** | real timings present **and** timing **not** reliable | the two-count split (`StackedCompare`) + honesty caveat line |
| **Compare** | > `DOT_LANE_MAX` timeable | the two-count `StackedCompare` (existing degrade) |
| **Fallback** | real timings **absent** (old cache / pre-deploy) | the current even-spread `dotLaneModel` — unchanged |

**Precedence: gate wins over count.** A noisy 20-episode finding renders the *gated split*, not the compare — an unreliable finding must never present as a countable pattern. Order the checks: `unreliable → split`, then `degrades → compare`, then `real → distribution`, else `fallback`.

**Fail-safe direction:** if reliability is unknown when real timings are present, treat as **not reliable** (render the split). Never default an un-vetted finding into the confident cluster (§6).

---

## §3 — Geometry (the distribution state)

Pure, in `lib/signalCopy.ts`, unit-tested off-device.

**Expanded-early scale.** A deliberate non-linear scale so the clinically-relevant window is legible:
```
EARLY_MIN = 30, EARLY_FRAC = 0.60, MAXMIN = 120
posOf(min):
  min ≤ 30  →  (min / 30) * 0.60                              // first 30 min → 0–60% of lane
  min > 30  →  0.60 + ((min − 30) / (120 − 30)) * 0.40        // 30–120 min → 60–100%
```
- **Band** (the 30-min window): `[0, 0.60]`, dashed right edge = the 30-min boundary. The "30m" axis label sits **on** the edge (60%), fixing the shipped mid-lane mislabel.
- **Dots:** one per timeable (eligible) episode at `posOf(minutesSince)`; rose (`colorEventSymptom`) when `minutesSince ≤ rapidWindowMinutes`, grey (`colorTextDisabled`) otherwise. Minutes are clamped to `[0, 120]` for display; the count is unaffected.
- **Jitter:** a deterministic vertical offset deconflicts near-ties (dots within one dot-width on x). Deterministic (no RNG) so tests pin it and renders are stable.
- **Median tick:** a rose tick at `posOf(medianMinutesSinceFeeding)`. Label lives in the meta line, never on the lane.
- **Axis ticks** (positioned, honest): `ate` (0%), `15m` (30%), `30m` (60%), `1h` (73.3%), `2h` (100%). The label bunching after 30m is the visible tell that the tail is compressed.
- **Precision treatment:** dots carry a soft halo and the jitter; the receipt never implies sub-window accuracy. Owner-logged times are approximate — the design says "real, but ± a few minutes," never a clock reading.

**Untimed episodes are never plotted** — disclosed in words only ("N weren't near a logged meal"), same as today.

---

## §4 — Copy pack

| Surface | Copy | Notes |
|---|---|---|
| Card sentence (distribution) | *unchanged* — the shipped `postprandial_timing` phrasing | server-generated; no change |
| Sample line | *unchanged* — "7 of 10 timed episodes within 30 min of eating" | `sampleLine`, existing |
| Meta (distribution) | "Typically about {median} min · {N} more weren't near a logged meal" | median surfaced in the meta line, not the lane |
| Gated caveat line | "Shown as a split, not a timeline — with grazing, ‘minutes since eating’ isn't reliable enough to place each one." | **draft** — through `nyx-voice` + `clinical-guardrails` at build; honest uncertainty, never reassurance, still routes to vet |
| Gated sentence | honest about the count **and** the uncertainty (e.g. "…came within 30 minutes of eating — but {pet} grazes, so the exact timing is hard to read. Still worth mentioning to your vet.") | **draft**; the *approach* is locked (state the count, decline the precise timing, never reassure), the words are not |
| Evidence (tap-expand) | *unchanged* — the existing anamnesis text (timing + honest denominator + vet ask) | already guardrail-clean |

**All copy is anamnesis (§6).** The plot shows timing; no string names a cause, mechanism, regurgitation, or eating-speed.

---

## §5 — Payload contract

Additive-optional fields on `PostprandialTimingFinding` (the `ai_signals.findings` cached JSON, and its `lib/signal.ts` client mirror) — the **SR-4 `medContext` / `density` pattern**:

- `eligibleMinutes?: number[]` — every timed-eligible episode's minutes-since-nearest-feeding (both in- and out-of-window), so the client plots the full distribution. Length equals `eligibleCount`.
- `timingReliable?: boolean` — the detector's judgment that "minutes since feeding" is meaningful for this pet/window (§7).

**Both optional, both set together by the detector.** Absent (old cache within the 24h TTL, or pre-deploy) ⇒ the **Fallback** state (current even-spread), byte-identical to today. No migration — this is a JSON payload, not a column.

**Deploy coordination:** emitting these is a `generate-signal` Edge Function change + redeploy. The client ships **first** (fallback-safe), the payload **second**, so no ordering can surface a half-built state. Confirm the `generate-signal` deploy state before the payload PR.

---

## §6 — Guardrails

- **Anamnesis only (§9.2).** Timing is not a regurgitation-vs-vomiting differentiator. Copy implying regurgitation / eating-speed / cause is a `validatePhrasing` failure. The plot may show a fast cluster; the app never narrates why.
- **No confident cluster on unreliable timing.** The gate (§7) is non-negotiable — a grazing/uncertain finding renders the split.
- **Never reassures.** The gated card states the count and points to the vet; "hard to read" is honest uncertainty, never an all-clear. Absence is never wellness (the empty-band lesson, B-494).
- **Honest precision.** Soft, jittered dots; no implied minute-accuracy.
- **Fail toward the split.** Unknown reliability → split, never the cluster.

---

## §7 — The gate predicate (OPEN — validation-gated)

`timingReliable` answers: *is "minutes since the nearest logged feeding" a meaningful quantity for this pet in this window?* The detector already filters eligibility (witnessed, discrete preceding feeding, no logged `free_choice` bowl) — but the free-fed exclusion only fires on an **explicitly-logged** free-feeding arrangement, so a grazing cat whose owner logs discrete meals slips through (surfaced in the owner sync).

**Open — before/with the payload PR (Data Scientist + Dr. Chen):**
- Define the exact `timingReliable` predicate. Candidate inputs: logged `free_choice` arrangements, feeding **frequency/regularity** (many small feedings/day ⇒ unreliable), multi-pet shared-bowl **attribution confidence**.
- Interim conservative default until validated: **`timingReliable = false`** unless positively established (fail toward the split).
- This is the clinically load-bearing piece and requires an **`adversarial-reviewer`** pass (the DoD line for detection logic).

The client trusts the boolean; **how it's computed is validated here**, decoupled so the presentation ships without waiting on the statistics.

---

## §8 — PR plan

| PR | Scope | Review | Notes |
|---|---|---|---|
| **PR 1 — geometry core** *(this session)* | `posOf`/expanded scale, the real-position distribution model (+ jitter, median, positioned axis), the `timingUnreliable` predicate, the optional type fields. Pure + unit-tested. Renderer untouched. | code-reviewer | Fallback-safe; zero visual change (no live payload yet) |
| **PR 2 — renderer** | `SignalReceipts.DotLane` adopts real positions + soft/jitter/median/positioned axis; `InsightCard.CardFaceReceipt` adds the gated-split branch | code-reviewer + Designer | Behind `signal_design_v2`; component tests |
| **PR 3 — payload + detector** | `detection.ts` emits `eligibleMinutes[]` + `timingReliable`; `generate-signal` redeploy | **adversarial-reviewer** + deno tests | Rides the `generate-signal` deploy coordination |
| **PR 4 — gate validation** | Lock the `timingReliable` predicate (§7) | **adversarial-reviewer** + Dr. Chen | Gates PR 3's reliability value; can precede or merge with PR 3 |
| **PR 5 — copy** | Gated sentence + caveat finalised | `nyx-voice` + `clinical-guardrails` | The §4 drafts |

---

## §9 — Open items / dependencies

- **Gate predicate** (§7) — Data Scientist + Dr. Chen validation. Load-bearing.
- **`generate-signal` deploy coordination** (§5) — confirm state before PR 3.
- **`timeofday_clustering` parity** — a real-position (clock) treatment is a follow-up, not v1.
- **Backlog** — file this track under a `B-###` extending B-721.

---

## §10 — Tests

- **PR 1:** `posOf` (boundaries 0/30/120, monotonic, clamp); the distribution model (positions match `posOf(minutes)`, in/out split by `rapidWindowMinutes`, deterministic jitter, median position, axis tick positions); `timingUnreliable` (true only on `timingReliable === false`); the fallback (absent `eligibleMinutes` ⇒ the existing even-spread model, existing tests stay green).
- **Property:** every plotted dot's `pos ∈ [0,1]`; dot count = `eligibleCount`; in-window dot count = `rapidCount`.
- **PR 2:** render with a real-minutes fixture; the fallback fixture renders byte-identical to today (snapshot).
- **Timezone-honest fixtures** (B-514) where any day/really-instant math is involved (none expected here — minutes are relative).
