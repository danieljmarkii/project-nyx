# Session — Post-prandial timing receipt (Option A): decision → requirements → geometry core
**Date:** 2026-08-14 · **PR:** #636 · **Branch:** `claude/signals-barf-dots-timing-hgha9v`

## Build phase
Signal surface (Step 10 / B-721 receipts extension). New feature track **B-753**; PR 1 of a multi-PR plan.

## What happened
Started as a PM question — "what do the dots on the scarf-and-barf card actually represent?" — and became a full decision → design → build arc.

1. **Investigation.** The post-prandial timing receipt (`lib/signalCopy.ts` → `dotLaneModel` → `spreadInIntervals`) spaces dots **evenly by index within each zone**; position is not real timing. The detector computes each episode's `minutesSince` and keeps only the median. Confirmed the PM's read: the strip looks like a distribution it isn't plotting.
2. **Decision mock** — `docs/culprit-dot-lane-semantics-mockups.html` (C even-spread / A real times / B honest split) on one fixed finding, C reproducing the shipped geometry exactly.
3. **Owner sync** (`pm-feature-review`, un-anchored). Jordan: A is real, actionable info for a discrete-meal dog. **Sam opposes an ungated A** — for a grazing multi-cat home "minutes since eating" is noise, and A makes a shaky finding look authoritative (false precision → false alarm). Dr. Chen (§9.2): timing is anamnesis, not a mechanism. Data Scientist: pro-A but precision must stay honest. The read also surfaced that the card is far more a Jordan feature than a Sam feature by construction (the free-fed exclusion only fires on explicitly-logged free-feeding).
4. **PM decision: Option A**, with three conditions (gate the noisy case → split; honest precision; anamnesis copy). Expanded-early scale added to make the cluster legible + fix the 30m mislabel.
5. **Build-ready mock** — `docs/culprit-postprandial-receipt-mockups.html` (Option A locked: distribution / gated split / high-count degrade / anamnesis evidence / build rules).
6. **Requirements** — `docs/nyx-postprandial-receipt-requirements.md` (v1.0 build-ready).
7. **PR 1 code** — the pure geometry + gate model, fallback-safe.

## What shipped (PR 1, #636)
- `lib/signal.ts` — additive-optional `eligibleMinutes?[]` + `timingReliable?` on `PostprandialTimingFinding` (SR-4 `medContext` pattern).
- `lib/signalCopy.ts` — `postprandialPos` (expanded-early scale; 30m on the window edge), `postprandialDistributionModel` (real positions + median + honest axis + deterministic jitter; non-finite-guarded), `hasRealTimings`, `timingUnreliable` (**fail-safe**: unknown reliability ⇒ split).
- `lib/signalCopy.test.ts` — scale/positions/split/median/jitter/predicate tests + a §10 property sweep. `dotLaneModel` untouched (fallback byte-identical).
- Docs: the requirements + both mocks (decision record + design lock).

## Decisions made
- **Option A** (real per-episode times), PM-approved.
- **Expanded-early scale** (0–30 min → 0–60% of the lane) — fixes the mislabel and makes the cluster legible.
- **Three conditions** (gate / honest precision / anamnesis copy); the gate resolves the Data-Scientist-vs-Sam conflict without a veto.
- **Client ships first, fallback-safe; payload second** (no ordering surfaces a half-built state).

## Persona flags
- **Data Scientist ⚔ Sam/Designer** — "most informative" vs. "false precision for the grazing case." Resolved by the gate (A renders the split for the noisy case).
- Fail-safe gate direction (unknown ⇒ split) verified by `code-reviewer`'s truth table.

## Open questions / PM action items
- **B-754 — define the `timingReliable` predicate** (Data Scientist + Dr. Chen + `adversarial-reviewer`). Load-bearing; gates PR 3/PR 4. The client trusts the boolean; the detector's computation is validated separately.
- **`generate-signal` deploy coordination** before PR 3 (the payload).

## DoD
- AC (technical-spec build phases): N/A — Signal-surface feature extension.
- Types: ✓ `tsc --noEmit` clean. Tests: ✓ 199 signalCopy; full suite 4857 green.
- Anti-patterns: none (pure lib; no theme/RLS/sync/multi-pet). `code-reviewer` **ship-ready**, 3 polish items folded in.
- Adversarial review: N/A for PR 1 (no detection/statistical logic shipped); **mandatory for PR 3/PR 4** (the gate predicate) — flagged.
- Persona sign-off: Data Scientist ✓ (fail-safe gate, honest scale) — Engineer ✓ (additive-optional, no schema, fallback-safe) — Designer N/A (no rendered surface yet; the visual is the approved mock) — QA ✓ (tests).
- Future-self: the expanded-scale distribution model is cleanly separated, tested, documented; one named risk (axis coupled to the 30-min bucket — documented).

## Next
- **PR 2 (renderer)** — `SignalReceipts.DotLane` adopts real positions + soft/jitter/median/positioned axis; `InsightCard.CardFaceReceipt` adds the gated-split branch. Can proceed in parallel with B-754 (renderer needs only the boolean). On-device QA attaches here.
- **B-754 (gate validation)** — Data Scientist + Dr. Chen. Gates PR 3.
- **PR 3 (payload + detector)** — `detection.ts` emits `eligibleMinutes[]` + `timingReliable`; `adversarial-reviewer`; rides the deploy coordination.
- **PR 5 (copy)** — the gated sentence + caveat through `nyx-voice` + `clinical-guardrails`.
