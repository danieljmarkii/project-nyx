# Signals v2 mock round 2 (CUL-18) — the ruled directions at build fidelity

**Date:** 2026-08-15

Round 2 of `docs/culprit-signals-v2-mockups.html` (B-755), re-published over the **same artifact URL**
(`.../artifact/8c19fbb5-…`; round-1 was there, title unchanged so the PM's tab/bookmark still resolves).
This round is not new directions — it re-renders the directions the PM ruled on 2026-08-14 (mock round 1)
at **build fidelity**: real copy traced to source, real geometry, the deviations the shipped spec forced,
and every live decision drawn as side-by-side options (the mock-what-you-change rule). No app code, no
schema — a design/docs deliverable that feeds PRs 5/6/7's Designer gates.

## Why now / what changed since round 1

The key fact that reshaped this round: **PR 5 (CUL-12, the A2 timing card) shipped and merged this same
day (#646)**. So the A2 frames are no longer sketches — they're the card *as it renders*, quoted verbatim
from the merged `lib/signalCopy.ts` / `phrasing.ts` / `InsightCard.tsx`. Round 1's A2 frame was drawn
before D10 (`longGapHours` = 6h) and before the build's time-ordering; round 2 corrects both, and puts the
three open calls PR 5's `pm-feature-review` surfaced in front of the PM at real fidelity.

PR 6 (CUL-13, trial surfaces) and PR 7 (CUL-14, watching system) are still Backlog — those frames are
their Designer gates, drawn from the shipped detector payloads (PR 3 #644, PR 8 #647) and the §4.4 register.

## What the round renders (7 sections, 7 phone frames, 7 decision briefs)

- **§01 — what build fidelity changed.** The five refinements now baked into every frame, each a shipped-spec
  fact, not a new decision: **6h+ not 4h+** (D10); **time-ordered bands** not concern-grouped; **proportional
  compare bars** (S2 — `StackedCompare` scales to the max count, round-1's equal-width bars were schematic);
  **mechanism-free owner copy** (`MECHANISM_RE` bars "empty stomach"); **no "%" on a Signal card**
  (`SIGNAL_PERCENT_RE`, B-733 — so trial treat-share renders in words). Slim data table + a source-trace note.
- **§02 — the A2 card, as built (#646).** Face + full expand, verbatim. Face = server two-count lead
  (`templateTimingStory`) + the three-band time-ordered compare (rose ends / muted middle) + sample line +
  badge. Expand (A3's mechanics) = the four shipped `EvidenceBox`es: "When they happen" (meal lane + clock
  lane), "What we couldn't time" (the honest remainder, S2), the §5.4 med line, "What the photos showed" (L3
  present-only, G4), "For your vet" (leads with the clustering, S10). A callout names the one thing the expand
  does NOT yet carry — the two-sided base-rate control the round-1 A3 sketch drew (needs a payload field CUL-7
  doesn't emit; filed B-76x).
- **§03 — three open calls on the A2 face, side-by-side.** From PR 5's `pm-feature-review`: **R2-1 band
  order** (time-ordered as-built vs concern-grouped), **R2-2 coloring** (one-hue-both-ends vs two-hue
  rose-rapid/slate-long — the "reads as pattern vs severity" question the DoD flagged for a device
  screenshot), **R2-3 lead framing** (as-built two-count list vs restored "two kinds of time", a PR-10
  server-template change). Each drawn both ways.
- **§04 — the trial surfaces, side-by-side (the wedge).** Three interlocking decisions drawn together:
  the **standing trial-card line** (one line added to the shipped `TrialStrip` — a description, not a
  control, §4.2 intact); the **event-driven Signal trial card** (pooled compare in the server sentence +
  phenotype count rows + the RTM/confound expand verbatim); and the **D2 fork** (count-row lead vs the
  absence-shaped sentence lead, identical rows beneath). Plus the **interlock callout**: the Signal trial
  card is event-driven, Nyx's trial is a *fewer* case, so under PR-3's escalate-only option her improving
  trial mints NO Signal card (standing line + Patterns carry it), and the D2 hero sentence needs *two* yeses
  (D2 = allow AND fewer ships).
- **§05 — the watching system, verbatim (PR 7 / G8).** The building headline (shipped) + the three new
  per-lane real-count rows ("Timing — 4 of the 6 timed episodes a pattern needs" / "Change, week to week —
  needs 2 full weeks…" / "Gaps between vomiting episodes — 6 days, then 3, then 2") + the verbatim safety
  floor. Beside it, the G8 register rules as build constraints (transparency-not-solicitation; no
  streak/unlock; no "a card is coming" promise; gap row escalate-only).
- **§06 — Patterns (PR 9, carried from round 1).** The full-density decomposition, relabelled to the 6h
  axis + two-hue coloring. Kept because it's where the trial story lives *regardless* of the fewer-direction
  ruling — if the Signal stays quiet under escalate-only, Patterns still renders it.
- **§07 — React.** Seven decision briefs in the house format (Deciding / Options+recommendation /
  Consequence): R2-1…R2-7. Gated briefs (needs Dr. Chen or a device screenshot) tagged amber.

## Decisions surfaced (the PM/Dr. Chen calls this round tees up)

None resolved this session — a mock round's job is to render, not rule. The briefs:

- **R2-1 band order** — rec: keep time-ordered (as-built). Client-only either way.
- **R2-2 coloring** — team lean: two-hue (rose rapid / slate long) reads as "two kinds," matches the expand
  + Patterns; **needs a device screenshot** (DoD, PR 5). Designer owns the pixels.
- **R2-3 lead** — rec: restore "two kinds of time" at PR 10 (server-template change, PM-vetoable).
- **R2-4 = D2 (Dr. Chen, CUL-17, open)** — the absence-shaped sentence lead. No team rec; his screen is the
  gate. Count-row form ships unconditionally regardless.
- **R2-5 = D3** — both-surfaces (standing line + event-driven Signal), PM-vetoable at the rendered frames.
  Rec: both, split by register.
- **R2-6 = the PR-3 fewer-direction** — rec: engineering lean *escalate-only v1*. Interlocked with R2-4:
  under escalate-only, Nyx's fewer never reaches the Signal, so the D2 hero is moot for her. Should be ruled
  *with* R2-4.
- **R2-7 watching copy** — G8 verbatim strings sign-off before PR 7 locks.

## Guardrails honored in the frames

Every string is guardrail-clean by construction (traced to the shipped screens): timing-only owner copy
(no "empty stomach"/"bilious"), no "%" on a Signal card, two-sided count rows (a zero is "0 · was 7", never
an inverted "no empty-stomach vomiting"), L3 present-only (hair never as a count-of-zero — G4), the trial
copy count-anchored / never-verdicted, the watching floor line verbatim. The two-sided base-rate control is
correctly ABSENT (the payload can't back it yet) rather than faked.

## House-rule compliance

- **Same artifact URL** — re-published over round 1's (`Artifact({action:'list'})` found it; title stable
  "Culprit Signals v2 Mocks"; round named inside the page; favicon 🌀 set — **keep it stable on round 3**).
- **Round-1 rulings band kept** on the page (A1 marked dead, struck through, not re-drawn — R-1).
- **Committed file is source of truth**; the artifact is how the PM views it.

## DoD

- [x] Deliverable is a mock (HTML) + this record + STATUS.md. No app code, no schema, no tests to run.
- [x] Every rendered string traced to source (`lib/signalCopy.ts`, `phrasing.ts`, `lib/dietTrialCard.ts`) or
  drawn from the §4.4 register; build-fidelity deviations from round 1 named in §01 + captions.
- [x] Theme-aware (light/dark tokens, three-state), responsive (overflow-x on the table, flex/grid wrap),
  structural balance verified (7 sections, 191/191 divs).
- [x] Persona sign-off: **Designer** ✓ (faithful to the round-2.1 design authority; side-by-side per
  mock-what-you-change) — **Dr. Chen** N/A here but his gate (R2-4) is surfaced as a brief, not pre-resolved —
  **Engineer** ✓ (copy traced to merged code; no fabricated payloads) — **Data** ✓ (S2 both-sides, G4
  present-only, no faked base-rate control).
- [x] No new secret.

## PR

Shipped via the CUL-18 branch `claude/cul-18-mock-round-2-m3zaw3` (draft). One commit: the round-2 mock +
this record + STATUS.md.

## Follow-ups

- The seven briefs above go to the PM (R2-1/3/5/7 + the two gated Dr. Chen/screenshot ones R2-2/4/6). R2-4
  (D2) and R2-6 (fewer-direction) should be ruled **together** — the interlock is drawn in §04.
- B-76x (base-rate control payload) + B-76x (jittered dense lane) already filed from PR 5; the A2 expand's
  "What we couldn't time" box is the honest interim until the first lands.
