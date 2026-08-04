# Trial protein capture (B-704) — D6 re-opened, spec v1.0 + mock rounds 1–2

**Date:** 2026-08-04
**Outcome:** shipped via #579 (docs/design only — no app code, no schema)

## What happened

The PM opened a discussion: "I don't think we capture what protein the diet trial is focused on — my cat is on a rabbit-only trial." The session ran the full arc from listening-check to ratified build contract:

1. **Grounding.** Established the shipped reality: the start-a-trial sheet (B-417 PR 3) captures foods only; the sanctioned protein set is the union of the `primary_diet` foods' `proteins` arrays, and the target protein is derived from the trial food's own main protein (`resolveTargetProtein`, `lib/trialProtein.ts`). Explicit protein capture was **D6** in the multi-protein spec — "RATIFIED, deferred." Key correction to the PM's model along the way: only trial-diet foods define the protein comparator; "Also allowed" extras permit foods, never proteins (§5.5 D-A), and it's a lookup of stored label data, not an analysis.

2. **The shape.** Proposed confirm-not-ask: a pre-filled "Trial protein: Rabbit" row derived from the picked foods — Principle 2, not a Principle-1 violation. The strongest argument surfaced: with owner intent stored separately from the food, a **wrong-primary trial food becomes detectable at day 0** (today the food defines its own target, so it can never contradict it). Honest team read given on request: unanimous on the shape and the never-permits invariant; Designer reservation on the sheet's 15-second budget; Product Owner skeptical on sequencing only.

3. **Mock round 1** (`docs/culprit-trial-protein-mockups.html`, published as an Artifact): baseline vs proposed sheet, the picker, the day-0 mismatch heads-up, the two empty-state variants, downstream payoffs, open calls Q1–Q4.

4. **The PM ratified the build** ("we're doing this now") and named the gap round 1 missed: **the protein must be visible and selectable during the active trial** — every round-1 frame was setup-time. Decision tee-up TP-1–TP-4 followed; the PM ruled three:
   - **TP-2 — heads-up, never blocking**, conditional on prominence. The condition became the spec's §6 testable contract (inline against the offending food row, amber, same-viewport, persists, has a mid-trial home) rather than a vibe.
   - **TP-3 — correction semantics** (team rec): a mid-trial protein edit applies whole-trial. The never-rewrites-history rule protects *evidence and counts*; the protein touches neither — it changes what the record *calls* things. Disclosed via `target_protein_set_at`, never versioned; the confirm sheet states the whole-trial effect (frame H).
   - **TP-4 — both, split by role**: surfaces that *name* the trial show it (card + `TrialStrip`, zero new controls, §4.2 untouched); the allowed-set screen *edits* it. One editor, two-plus viewers.
   - **TP-1 — skipped by the PM → PROVISIONAL E2** (hide at setup when nothing derives). TP-4's mid-trial home tipped the round-1 E1 lean: hiding no longer orphans the affordance, and "Not set" is the wrong register for a hydrolyzed patient (inapplicable, not incomplete). Flagged as a PM action item; PR 3 builds E2 unless overridden.

5. **Convened the build contract:** `docs/nyx-trial-protein-requirements.md` v1.0 — decision record, the TG-1–TG-5 invariant spine (**TG-1 the protein never permits** — `classifyFeeding` invariant under every `target_protein` value; **TG-5 an edit never moves a number** — both property-tested in PR 2), schema (nullable `target_protein` + `target_protein_set_at`; "no single protein/hydrolyzed" stores null deliberately), the stored-first `trialTargetProtein` predicate with provenance (`resolveTargetProtein` demoted to fallback arm — a direct import after PR 2 is a review-blocking finding), copy pack, and the PR 1–5 plan (3 ∥ 4 after 2; **PR 5 merges on its own tests but production reach rides the B-494 redeploy — it does not jump that queue**).

6. **Mock round 2** re-published over the same artifact URL (house convention): rulings strip, mid-trial frames F–H (card identity line, allowed-set editor with the standing mismatch note, the correction confirm), round-1 Q-table resolved.

## The renumbering

Filed as **B-651**; at wrap, merging `main` surfaced the collision — B-651 was already taken on `main` by the Vet Files name-sheet row (2026-08-01, #550-adjacent), and a sibling session had *itself* renumbered B-651→B-653 the same day. First-lands-keeps: this track renumbered to **B-704** (next free after the sibling batch reached B-703), provenance note in the row, cross-references fixed by attribution in the spec + mock (the two files this session authored; the 2026-08-01 session records' B-651 references mean the Vet Files row and were left alone).

## Falsification / review posture

No load-bearing logic changed (docs only), so no adversarial run this session — but the spec pre-registers where they're mandatory (PR 2 and PR 5) and writes the counterexample surface into the invariants: TG-1's test *is* the falsification attempt ("find a `target_protein` value that changes a verdict"), TG-5's is "find a number an edit moves."

## Residuals

- **TP-1** provisional E2 — PM confirmation owed (STATUS.md action item).
- **A-1** dual-novel-protein target deferred (allowed set already handles the permits; only naming is single).
- **A-3** mid-trial food adds get the standing note, not a setup-style inline heads-up — revisit if too quiet.
- Copy is draft; each build PR runs `nyx-voice` on its strings.
