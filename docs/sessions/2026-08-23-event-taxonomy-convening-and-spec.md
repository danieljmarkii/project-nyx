# Event-taxonomy expansion — convening, rulings, and the v0.9 spec

**Date:** 2026-08-23 → 2026-08-24 (one session, three rounds of PM rulings + the spec build)
**Track:** B-756 / CUL-509 (project Signals v2 — the record, decomposed) · **Mode:** DISCOVERY (scoping only — D5)
**Shipped via** the session's draft PR (spec + evidence pack + this record; no app code, no schema).

## What this was

The PM re-opened the event-taxonomy expansion from the feature-opportunities thread ("get the product team together… discuss what it would look like and what the plan would be to broaden and maybe even deepen our event tracking"). The session ran in three rounds:

1. **Convening + orientation** — pulled the research (deep-dive F3/C2/§4/§8; the C2 study summary on CUL-509), audited what changed since 8/14 (B-745 picker built dark; Signals v2 GA'd; the polish register), and put five decision briefs to the PM (D1–D5). Found and named a process fact: **the original C2 taxonomy study was an agent brief never committed** — only its summary survives (CUL-509 + the frozen B-756 row).
2. **Rulings + the three questions** — PM ruled D1–D5 (see below); answered the vet-report, signals-engine, and implementation-shape questions with code-verified facts (`generate-report` fetches all types and renders only `REPORT_SYMPTOM_TYPES`; `other` is already report-invisible; `scratch`/`skin_reaction` are dormant enum values already in the engine's correlation list).
3. **The spec session, run in-place** (PM chose here over a fresh session — rulings-fidelity beats context freshness for synthesis; isolation is for reviews): three parallel isolated research sweeps → the scored leaf matrix → `docs/nyx-event-taxonomy-requirements.md` v0.9.

## Rulings (all recorded on CUL-509 as comments; §0 of the spec)

- **D1** — cough + sneeze definitely; spec goes beyond them via a **quantitative selection framework** (the PM's ask). Dr. Chen dissent (safety trio sooner) recorded; wave plan sequences the trio next.
- **D2** — **flat leaves on the existing `event_type` enum; families are presentation metadata, never schema.** Consequence: the stale stool-consolidation Open Question **closed as won't-do** (row moved to `docs/decisions-archive.md`).
- **D3** — `other` stays the permanent catch-all; existing rows move by **reviewed per-row SQL script** (owner-approved, notes/timestamps untouched, sync-quiescent). Product re-type flow = later call.
- **D4** — safety-leaf escalation register **open**; both registers (capture-time calm-urgent vs Signal-only) render side by side at the mock round. Genuine Dr. Chen × Designer conflict, surfaced per protocol, not resolved silently.
- **D5** — **scoping only**; every build wave is its own future PM greenlight.
- **D6** — the event detail screen joins the track three ways: per-leaf content contract (spec §7, mandatory), redesign frames (mock round), build separable. Absorbs Legacy **B-003**. Trigger: the PM's screenshot of an `other`/Sneezing detail (empty photo zone leading a never-photographed event; Edit-over-Remove destructive adjacency).
- **D7** — selection inputs broadened: the three sweeps + the PM's real-vet question sheet (spec §15, async) + vet-council §9 + fresh own-record queries at scoring refreshes.

## What was built (docs only)

- **`docs/research/2026-08-event-taxonomy-evidence.md`** 🧊 — the three sweeps committed verbatim-adjacent the same session they ran (the anti-lost-study rule). A: claims rankings + full VetCompass top-20s (dog/cat) + presenting-sign studies → a 19-row sign-category ranking. B: 14-app capture-menu teardown → the whitespace list (nobody structures vomit, meal outcome, med outcome, respiratory events, manual itch, witnessed-vs-found, species-conditional menus). C: full instrument inventories → **CIBDAI fully derivable from logged events**; the home-RRR literature (four owner-collected studies, <30/min, Cardalis precedent); licensing cautions.
- **`docs/nyx-event-taxonomy-requirements.md` v0.9 (draft for PM ratification)** — the spine (D2), the five-axis scoring framework (§4), the **23-leaf scored matrix** (§5: cough ranks #1 — the framework validated against the known-right answer; the urinary cluster + safety trio are the top unratified territory; two dormant enum values are the cheapest wins; mouth/dental honestly demoted by owner-report evidence), capture + detail contracts (§6–§7), the read-surface degradation audit (§8), engine/report membership models (§9–§10), the swap script (§11), the `event_types_v2` flag plan (§12, carries the B-747 fix), the wave plan + 10-step per-leaf checklist (§13), the mock-round brief (§14), the vet question sheet (§15), open questions + research debt (§16–§17).
- CLAUDE.md: Read-These row for the spec; stool-consolidation OQ row moved to the archive. Research README indexed the evidence pack.

## Persona flags raised

- **Dr. Chen × Designer — D4** (safety escalation register): formally surfaced, deliberately unresolved, mock-gated. The one live conflict.
- **Dr. Chen dissent on D1** (safety trio timing): recorded inside the ruling, not erased.
- **T&S:** the D3 script cleared for the dogfood era only (approver = owner); cohort-scale notes-mining needs its own ruling (§16 Q5); RRR stays a manual counter (camera-based = D8-class).
- **Data Scientist:** one-predicate discipline per membership list; derived indices are never "the validated instrument" (§16 Q4); demo pets stay out of calibration.
- **PO:** B-747 rides PR 0; B-746 (glyphs) load-bearing by W3; B-757 stays archived unless the PM restores (§16 Q3).

## Known issues / research debt

- The evidence pack's **adversarial fact-check pass has not run** (spec §17) — required before any W2 threshold or in-app copy cites a sweep number.
- The **fresh own-record query is pending** — the live-SQL call hit an MCP approval gate this session; the spec uses the 2026-08-13 audit numbers labeled as such (plus the 2026-08-23 sneeze-row screenshot).
- Sweep B is text-sourced (no installs); Everkin sub-claims are vendor-marketing-grade.

## DoD (discovery session)

- AC: N/A — no build step advanced; no app code, no schema.
- Tests: N/A — docs only (pre-push hook runs the suite regardless).
- Secrets: none. Anti-patterns: none introduced.
- Sign-off: PM ✓ (D1–D7 ruled in-thread) — Dr. Chen ✓ (dissent + D4 position recorded; §9 traps carried into the spec) — Designer ✓ (register rules §6–§7; D4 position recorded) — Data ✓ (membership models, §16 Q4/Q5) — T&S ✓ (D3 shape, Q5) — Engineer ✓ (D2 spine, §8 audit, §12 flag) — QA ✓ (per-leaf checklist §13, AC-CHIP inheritance).

## Next Session Kickoff

**Recommended first prompt (after the PM reads the spec):**
> Read `docs/nyx-event-taxonomy-requirements.md` v0.9 and react: ratify to v1.0 (or mark edits), then run the mock round per §14 — the grouped sheet at W1–W3 density, the cough/sneeze confirm, the D4 escalation registers side by side, the RRR counter, and the detail-screen redesign frames (photo leaf + non-photo leaf). Same-URL artifact discipline.

**Alternates:**
- Pay the §17 research debt first: adversarially re-verify the evidence pack's load-bearing claims (RRR <30 studies, FLUTD sign lists, VetCompass tables, competitor pricing) before the mock round leans on them.
- Run the §11 swap script tee-up: the candidate-row read query + reviewed id list for cough/sneeze (needs the approved Supabase call; W1-gated for the actual swap).

**Parallel / efficiencies:**
- The fact-check pass and the mock round are disjoint sessions and can run concurrently; both precede any W1 greenlight.
- The PM's §15 vet question sheet is fully async — take it to the next visit; answers fold into v1.x whenever they arrive.
- No file collisions expected with the App Store / Design Polish tracks (this track is docs-only until a wave is greenlit).

---

## Addendum — ratification rounds (same session, 2026-08-24, pre-merge)

The PM read the deliverables in-thread and the session continued through ratification (this addendum was written before the session's PR merged — the record is still this session's own, single file):

- **The N1–N5 brief set** was put to the PM ("the decisions you need to make now, with context"): N1 the scoring framework · N2 the wave cuts (carrying Dr. Chen's dissent) · N3 mock grid density · N4 the label veto pass · N5 the licensing fence.
- **Rulings (recorded as D8/D9 in the spec's §0):** N1 ratified ("skimmed all the matrix and agree"); N2-A — waves as proposed, the dissent resolved to W2, recorded not erased; N3-A — both densities; N4 labels stand per the stated silence rule; N5 **provisionally adopted** (no PM objection; explicit one-line confirmation outstanding — conservative in the safe direction, governs the mock + waves now).
- **The PM's implementation question answered in-spec:** each greenlit wave ships as its own numbered PR chain — **§13a** now carries W1's five PRs (flag seed+B-747 / enum migration / capture / engine+redeploy / swap script), one PR per session; later waves get chains at their own greenlights.
- **Spec bumped v0.9 → v1.0 RATIFIED**; CLAUDE.md Read-These row updated to match. Scoping phase complete; next step = the §14 mock round, its own session; D4 rules there from frames.
- Wrap + merge PM-directed same session; `origin/main` merged in cleanly first (five sibling Design Polish PRs #713–#717 had landed; zero conflicts — the per-session-file convention held).
