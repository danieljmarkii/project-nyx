# 2026-11-13 · Vet instructions discovery: a vet's "call me if", held and shown on its date

**Issue:** [CUL-2731](https://linear.app/projectnyx/issue/CUL-2731) (DISCOVERY) · **Branch:** `claude/happy-feynman-va9g6b` · **Outcome:** shipped via #1524 · **Project created:** Vet instructions (P-CUL-38), rows [CUL-2740](https://linear.app/projectnyx/issue/CUL-2740) to [CUL-2748](https://linear.app/projectnyx/issue/CUL-2748)

## What happened

The PM picked §2.1 from the round 3 deep dive's product improvements page (brief 1 on [CUL-2724](https://linear.app/projectnyx/issue/CUL-2724)). They asked for the product team to be gathered and for competitive research before any building.

- **Competitive research** built on the September vet visit evidence brief rather than redoing it.
  - No product found stores a vet's conditional instruction as data and brings it back beside the owner's log.
  - The closest human concept is UK primary care's safety netting.
  - Owners agreed with the clinician on only 35.8% of "residual clinical signs" at discharge (Flegel 2024).
  - The largest RCT of automated post discharge texting was null, so the feature is sold as memory, not outcomes.
- **Three isolated persona panels** (clinical and data; owners and design; engineering, privacy, QA and backlog) re-forecast the feature at 5 rows, not 2. They found that `vet_calls` cannot hold the answer (`event_id NOT NULL`).
- **Mock round 1** drew the flow and decisions 2, 4 and 5. The PM ruled: not gated behind 1.2.0, a notification in v1, open ended entry, and Vet visits as the instruction's home. They deferred the booking ask pause to [CUL-2732](https://linear.app/projectnyx/issue/CUL-2732).
- **A light `/design-critique`** (4 lenses, 1 verifier) ran on round 2.
  - Its six conditions were applied: a safety line on every instruction, count honesty, a Home line not a card, one lifecycle, wayfinding drawn, and typed text never inside a template.
  - The record is `docs/vet-instructions-critique-2026-11.md`.
- **The PM asked for an owner walk A to Z and a vet and owner sync on the field size.**
  - Jordan, Sam and Dr. Chen ran isolated.
  - They fixed a read-the-typed-text defect, a self-contradicting example, and a risky "It's stopped" on a straining cat.
  - They settled "Decide later" (re-ask once) and the notification title (keep "Vet visit follow up").
  - The field size went to the PM as a persona conflict.
- **PM, final:** "Go with your recommendations. Wrap all this in a feature toggle and add to beta. Save this project in Linear with a dispatch plan."
  - The project page carries the rulings R1 to R8, the run order (8 rows), the critical path, Done means, the never-at-the-same-time lines and the build notes.
  - The page parses cleanly through `scripts/dispatch/page.ts`.

## Rulings (PM, 2026-11-13)

Recorded on CUL-2731 and as R1 to R8 on the project page:

- the beta flag `vet_instructions_enabled`;
- the open field = the owners' growing box with Dr. Chen's safeguards (Dr. Chen's dissent on length recorded);
- the "Vet visit follow up" notification;
- Vet visits as the home;
- course end = A + no early close;
- "Decide later" re-asks once, and the shipped call follow up matches it (PR-08);
- the out-of-v1 list.

## Files

- `docs/culprit-vet-instructions-mockups.html`: mock rounds 1 to 3, published at https://claude.ai/artifact/WjzHH6PM1xNP9EHmomrhyK
- `docs/vet-instructions-critique-2026-11.md`: the frozen critique record

## Open

- Nothing blocks PR-01.
- [CUL-2748](https://linear.app/projectnyx/issue/CUL-2748) is the PM's allowlist and dogfood step after PR-06.
- PR-02 must not run at the same time as Vet reminders PR-02 ([CUL-2726](https://linear.app/projectnyx/issue/CUL-2726)) or [CUL-1598](https://linear.app/projectnyx/issue/CUL-1598)'s migration.

Persona sign-off: Designer ✓ (critique, principles 1, 3, 4, 5) · Dr. Chen ✓ (field size dissent recorded; the typed path read-the-text defect fixed) · Jordan ✓ · Sam ✓ · Data ✓ (count and coverage rules carried into PR-03) · T&S ✓ (typed text never read; `rls-privacy-reviewer` on PR-02) · Engineer N/A (no code).
