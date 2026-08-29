# 2026-08-29 — Signal freshness discovery: The Living Signal (CUL-695)

**Date:** 2026-08-29
**Mode:** DISCOVERY · **Outcome:** brief + mock round 1 + rulings teed up on CUL-695 (draft PR carries this record + the mock) · **Track:** new — filed into *Signals v2 — the record, decomposed*

## What this was

PM-raised, verbatim: *"Every time I open the app I see the attached… I've opened it for weeks
and see the same. This is very valuable real estate. Let's do something with it in proportion
to its value."* Plus three seed ideas (collapse-with-persistence; patterns dash on Home; a
qualitative "how is your pet doing" prompt, possibly Ask-mediated) and an explicit ask to
convene discovery rather than jump to solutions.

The session convened the product team, queried the live production record, and read the
adjacent shipped specs (B-721 Signal/Home uplift, B-755 Signals v2, B-762 Daily Recap) before
proposing anything.

## The evidence — why the surface is static

1. **The cache is fresh; the content is standing.** `ai_signals` regenerates on a 24h TTL
   (Nyx's row regenerated 2026-08-28) and re-derives the same two findings that have led since
   ~Jul 20: `symptom_chronicity` (rank 0, `firstOnsetIso 2026-07-05`) + `postprandial_timing`
   (rank 1, 8/8 rapid). Both correct. Both standing truths that don't move day to day.

2. **The record moved and the surface couldn't say so.** Weekly vomit counts for Nyx:
   4·6·8·4·4·4·4 (weeks of Jun 15–Jul 27) → **2·0·1·1** (Aug 3–24). Log-day density held
   (28 of the last 28 days have logs; 29 of the prior 28), so the shipped `densityComparable`
   gate would *pass* a falling comparison. The improvement is expressible under the ratified
   Change Contract — count-anchored, time-ordered, "down from" mirroring the shipped "up from"
   grammar — but no rendered slot can carry it: chronicity is deliberately barred from
   week-pair framing (B-721 §3.2, correct), and the **reflection card is displaced by the
   insight cap whenever the timing story renders** (named in the B-755 §5 B-777 amendment).
   The pets with the strongest standing patterns are exactly the pets whose change can never
   get a card.

3. **Two framings that generalize.** The staleness is a *success artifact* — the engine's job
   is to establish patterns, and an established pattern is stable by definition, so every
   successful account converges on this state. And habituation is a *safety cost*, not a taste
   issue — a static hero trains the eye off the zone, and the next new safety finding inherits
   the blindness. (This framing is what put the Designer and Dr. Chen on the same side of the
   freshness question; their residual disagreement narrowed to D1 below.)

4. **The adjacent machinery already exists, unassembled.** The weekly review was parked at the
   B-721 ruling as *"first in queue post-build"* (SD-1/SD-9) and the build GA'd 2026-08-20 —
   so its queue position is now by that ruling's own terms. Engine prior-set memory (what makes
   `New` chips possible for timing findings) is a registered B-721 v2 gap. A "changed
   materially" trigger concept already exists for the v2 trial Signal card (B-755 §4.2/§8 Q5).
   CUL-629 ("something new" has no carrier for the 2nd..Nth finding) is this same question
   asked from the polish track. Freshness bugs sit adjacent: CUL-642 (deletes don't invalidate
   the cache), CUL-570 (cache vs Trend drift).

## The reframe

The Signal conflates two jobs. **Standing truth** ("this pattern holds") wants a persistent,
compact register that never silently disappears. **Movement** ("what changed since you last
looked") is what a daily-open surface is opened for — and it currently has no carrier. Every
direction in the round is an allocation of the hero canvas between those two jobs; none touch
detection, thresholds, safety ranking, or S1's plain safety faces.

## The five directions (mock round 1)

Mock: `docs/culprit-signal-freshness-mockups.html` — artifact
`https://claude.ai/code/artifact/e89c8cde-3b81-4ab1-8885-a5b1ac957e8c` (round 1, exploratory;
the shipped surface's design authority remains `culprit-signal-home-mockups.html` round 2.1).
All frames drawn on Nyx's real record.

- **F2 — Let change through.** Safety lead untouched; slot 2 becomes the change register
  (2-vs-12, density-disclosed); standing benign findings compress to one-line strips. Engine
  composition/ranking below the safety lane + one template. Open question: the change window
  should answer the standing card's own span (4-week halves), not just week-over-week — its
  own Change-Contract row + adversarial pass.
- **F3 — Seen & fold** (PM idea #1 with guardrails): persistent one-line strips, state
  survives sessions, auto-re-expand on material-change fingerprint. Fold is "seen," never
  "resolved" (§3.5 veto stands). Safety-fold eligibility is D1.
- **F4 — The care thread.** The chronicity card's ask becomes state it can see
  (Booked / We've been / Not yet); booked → prep register with the shipped Ask vet-visit
  rundown as its doorway. Acknowledgment becomes record data. Own schema + own scoping round.
- **F5 — The weekly review, un-parked.** Monday "week, read back" — guaranteed-new weekly,
  quiet labeled not silent (S6), the one register where a calm week is sayable safely.
- **F6 — The daily check-in, as capture** (PM idea #3 reframed): a one-tap demeanor
  observation *event* feeding the engine — taxonomy tracked-events lane, never a wellness
  score, never a reassurance streak. Routed by D3 to its own discovery.

**Considered and dropped:** benign-card rotation (fails S10 — novelty without information);
Ask-collects-data (LLM writing to the health record = D2-class T&S + spec change; horizon-2);
any detection/threshold change; night grounds; badges. The patterns-dash-on-Home idea (PM #2)
resolved into F5 + doorway strips rather than a dashboard zone (Principle 3: intelligence
surface, not dashboard).

## Decisions teed up (on CUL-695, `Waiting on PM`)

- **D1 — may a safety card fold?** (a) never · **(b) only via a stated owner action —
  recommended** · (c) fold-on-seen with a sticky strip. Carries the round's one genuine
  persona conflict (Designer: habituation is itself a safety cost ↔ Dr. Chen: an unacted-on
  escalation must never quietly shrink) — surfaced per protocol, not resolved.
- **D2 — what builds first?** **(a) F2 + benign fold + the freshness bug set (CUL-642,
  CUL-570) — recommended** · (b) F5 first · (c) finding-set memory first.
- **D3 — check-in:** **(a) own discovery with Dr. Chen + taxonomy — recommended.**
- **D4 — care thread:** **(a) scoping round next — recommended.**

## Deliverables

- **CUL-695** — the issue (TL;DR-first description, D1–D4 briefs, links) + the convening
  record as a comment; cross-link comment on CUL-629.
- **Mock round 1** — committed + published (same-URL republish discipline applies from here).
- This session record. All committed on `claude/signals-section-redesign-o2p5o1`, draft PR
  referencing CUL-695.

## Notes for the next session

- A code-mechanics sweep (client fetch cadence, seen-state inventory, chronicity recency
  config, Patterns entry points) was dispatched during this session; anything it adds beyond
  the spec-sourced mechanics above lands as a CUL-695 comment and informs the rung-1 kickoff.
- Rung-1 build question flagged by Eng: beta-flag the composition change (B-712 shape) or
  iterate directly on the GA'd surface — decide at the rung-1 PR, not blocking D1–D4.
- No CLAUDE.md or STATUS.md changes: no ruling landed this session; the track boundary is new
  but lives in Linear (CUL-695) per the pointer-card discipline.
