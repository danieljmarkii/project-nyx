# Medication history — team discussion, round-1 mock, build plan (B-140 extended)
**Date:** 2026-08-04 · **shipped via #581**

## What happened

PM-initiated brainstorm from lived use ("my cat is ending a round of meds — in a vet office, how do I answer *what meds has she been on?*"). The team discussion found the need already half-recognised and the gap structural: **three shipped surfaces — the profile med card, the A6 vet-visit rundown, and the report's medication machinery — all filter to `status='active'`**, so a course vanishes everywhere except History's raw dose stream the moment it ends. History's Medication lens exists but answers the wrong grain (events, not courses). B-140 (filed 2026-06-21) was the standing row; the infrastructure that makes it cheap (dose attribution, B-618's predicates, the rundown, the report's orphan-dose pass) all shipped after it was filed.

## Shipped

1. **Round-1 exploratory mock** — `docs/culprit-med-history-mockups.html`, published as an Artifact (house convention). Four surfaces off one course model: profile "Past medications", course detail, rundown block, report lifetime table. Drawn on the PM's real situation (active diet trial, Motozol at dose 26 of 28, ad-hoc Zyrtec).
2. **Build contract** — `docs/nyx-med-history-requirements.md` v1.0, after the PM greenlit the track. PR plan: **PR 1** `lib/medicationHistory.ts` derivation (the gate; adversarial-mandatory; Deno-compatible so `generate-report` imports it directly, the `lib/dietTrial.ts` pattern) → **PRs 2/3/4** profile section / detail past-course facts / rundown block (mutually parallel-safe, disjoint files) → **PR 5** report lifetime table (D2-gated; rides the B-494 redeploy, never its own deploy).
3. **Backlog**: B-140 extended to the track row; **B-688** filed (per-med History lens — *filed as B-686, renumbered at this wrap's merge*; a sibling session's caveat-dedup row took B-686 on `main` first via #582; first-lands-keeps per B-435). **CLAUDE.md**: Read-These row for the spec + Open Questions row for D2/D3.

## Decisions

- **D1 RATIFIED (PM)** — courses are **dose-derived, regimens enrich**. A regimen-only view renders near-empty for real accounts (B-394's finding); same logic as the med strip's D2.
- **D2 OPEN** — lifetime medication listing on the vet report (Tier-2 edit to `nyx-vet-report-requirements.md` §3.8/App-D). Gates PR 5 only.
- **D3 PROVISIONAL** — rundown window: 12 months shown + earlier courses folded behind a count. PM confirms at PR 4's handoff.
- **D4 RESOLVED** — standalone track now (PM commissioned the plan, superseding the fold-into-B-394 recommendation). The course model's tenses split cleanly: B-614 = present, B-394 = future, this = past; all read the same predicates.

## The invariants worth re-reading before building (spec §5)

**H1** never "Completed" from silence — an ending renders only from an owner action (the B-422 stale-active lesson, applied to meds); **H2** counted facts, never an adherence percentage/grade; **H3** no owner-scored outcomes (diet-trial C5 stands); **H4** no third course predicate — the derivation *reads* `dosesTowardTarget`/`attributeDosesToRegimens`.

## Persona flags

One genuine tension surfaced and was routed rather than resolved silently: **Dr. Chen wants "did it help?" on past courses; the C5 precedent forbids owner-scored outcomes.** Recorded in the spec as H3 — response context, if ever rendered, is the computed symptom trend across course dates, never a question to the owner.

## Residuals / notes

- The dup-ID race (B-435's exact scenario) hit live at wrap: B-686 collided with a sibling's row minted the same day. Renumbered here to B-688 with the provenance note; no other IDs affected.
- No app code, no schema, no deploy. Adversarial review deferred to PR 1 by design (nothing load-bearing was implemented this session).
