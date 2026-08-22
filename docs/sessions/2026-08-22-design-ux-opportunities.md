# 2026-08-22 — Design/UX session: the audit, three mock rounds, and the Aug. 2026 Design Polish track

**PM prompt:** "turn the product designer loose on the current state of the app — low-hanging fruit and bigger swings, stakeholder personas for feedback, opportunities first, then mockups."

**Outcome:** a four-lens app-wide audit → an opportunity slate → **three same-day mock rounds, every decision PM-ruled** → `docs/nyx-app-polish-requirements.md` v1.0 (BUILD-READY) → the Linear project **Aug. 2026 Design Polish**, issues born ruled. Six defects filed from the audit fallout. All via PR **#697** (draft).

## The audit (four parallel isolated lenses)

- **Jordan capture pass** — tap ledger (repeat meal = 2 taps ✓; med dose = 1 tap from Home, flattest feedback), 22 friction findings (F1 FAB rows ~36pt · F5 split-brain confirm surfaces · F10 no Undo anywhere · F11 capture screens skip the completion cards · F18 symptom time stamped at screen-open), 6 delight gaps (D1 six completion registers for one act, incl. the 2am full-white takeover; D3 zero haptics in the product).
- **Sam multi-pet pass** — pet context absent from History/Foods/report chrome; **wrong-pet AI captions on event detail** (bug, → CUL-574); shared-bowl attribution chain fully built server-side but dark (`is_shared` never set); grazing renders three ways; multi-med Home stack uncapped.
- **Designer periphery pass** — tokens + night register excellent (zero drift); drift is in component adoption: 4 header systems, ~10 hand-rolled empty states, History/Foods tabs with **no loading state** and silent failures, `vet-visit.tsx` pre-design-system (emoji icon), Geist stopped at 8 screens, Badge AA fails the theme's own comments document.
- **PO Linear scan** — 374 open issues mapped; the dead-end-tap cluster, the half-landed brand system (CUL-140/364/39), and capture-ergonomics themes already filed; caution flags on the three design-locked tracks.

## Rulings (all PM, same day — full record in the spec §0 + on CUL-580)

D1 bar = B+C hybrid (pet as the Pet tab) · D2 fallback ladder ratified · D3 **header H2a — the pet's photo leads, crescent leaves Home** ("when my wife saw Nyx's photo she was delighted") · D4 the header "new" dot deleted + **no looping chrome motion ever** (ring-train OQ closed by removal) · D5 arrival moment adopted ("perfect, love the spec") · D6 completion adopted whole · D7 haptics adopted ("LOVE LOVE LOVE") · D8 Trend graphic exploration killed — verbiage only, Dr. Chen-gated · D9 Geist via ThemedText wrapper (B-061 OQ closed).

## Shipped this session (all docs; no app code)

- `docs/culprit-app-polish-mockups.html` / `-round2-` / `-round3-` — three artifacts (separate URL per round, PM directive; rounds 1–2 banner'd as deliberation records, round 3 = final).
- `docs/nyx-app-polish-requirements.md` v1.0 — the build contract (D1–D9, per-issue specs incl. the arrival spec + haptic vocabulary + Undo semantics, guardrails, the Linear map, §10 Tier-2 flags).
- CLAUDE.md: Read-These row added; ring-train + B-061 Open Question rows resolved → moved to `docs/decisions-archive.md`. STATUS.md: track section added.
- **Linear:** defects CUL-574–579 filed mid-session (wrong-pet captions · History silent failures · occurred_at stamp · camera permission · AA inks · sub-44pt taps); CUL-580 tracked the rounds (ruling comments per round); project **Aug. 2026 Design Polish** created + populated — DP singles (bar, header, arrival, trend verbiage) + two parents with ordered sub-issues (completion ×5 PRs incl. haptics; CUL-364 Geist ×6 PRs), blocking relations set, PR plans on the parents.

## Deliberately held (round-1 appendix, next selection)

Capture-convergence endgame (B-745 GA + door unification) · Sam's household (pet chrome, found-it "who?", `is_shared` activation) · The First Week arc · detail-screen shell · multi-med grouped strip (amends B-614 D3 — PM decision only).

## Tier-2 edits flagged, not written (spec §10)

1. `docs/culprit-in-app-brand-requirements.md` §3 — the CulpritMark pulse contract (Home placement + `live` state retire).
2. `docs/nyx-design-principles-v1_0.md` §Motion — the "no looping chrome motion" line.

## Process notes

Mock-round velocity: three rounds in one day worked because each round carried only the open calls; the PM's "separate artifact per round" preference is now this track's convention (the current-vs-archive split from 2026-08-15, applied from round 1). The persona-agent audit (isolated Jordan/Sam/Designer/PO reads) surfaced two genuine bugs a build-anchored read would have missed — worth repeating for future design sessions.
