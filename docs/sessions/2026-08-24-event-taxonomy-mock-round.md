# 2026-08-24 — Event-taxonomy mock round 1 (CUL-509)

**Outcome:** the §14 mock round for the ratified event-taxonomy spec, shipped via #721 (draft). One deliverable: `docs/culprit-event-taxonomy-mockups.html` (round 1) + its published Artifact — a **new URL for this track** (`https://claude.ai/code/artifact/07e289b5-6b06-4627-b5fb-f96288477848`); later rounds re-publish there, committed HTML is source of truth. Design session only — no build wave committed (D5 stands).

## What the page renders

1. **The grouped picker at both densities** (D8 N3-A): W1–W3 (16 tiles) and the full-spine stress test (28 cat / 26 dog), cat and dog grids. Families as groups in owner language; species conditionality doing membership work (Scooting dog-only; Overgrooming/Hiding/Pooped-outside cat-only) and label work ("Litter box"/"Peeing", "Peed outside the box"/"Pee accident"). All symptom families keep the one rose tint (§6's `SYMPTOM_TYPES` predicate); a per-family rainbow was considered and argued against in-page.
2. **Cough/sneeze confirm** — deliberately boring B-745 inheritance with two per-leaf absences annotated: no photo row, no Saw it / Found it. Plus the labored-breathing confirm showing the §6 optional attribute chips (the cat's "Mouth open" mark).
3. **The D4 frames** — the straining cluster rendered capture-time (option A: post-save plain band, rose rail, no haptic, "What to tell the vet" script) and Signal-only (option B: the S1-register safety card), side by side, with the shared precondition frame: the optional **"Did any pee come out?"** chip that feeds the deterministic rule — unanswered never counts as "No" (the B-027 absence-of-log guard applied before the rule exists). Copy conditions on `pets.sex` with an `unknown` fallback.
4. **The breath counter** (start → counting → landed at 26 and at 36), calm measurement register, neutral tint. 26 gets the descriptive reference + trend line and no reassurance; 36 gets escalation-with-honest-uncertainty (recount ask, "worth a call" register); a single count never fires the safety lane (§9 sustained rule). The threshold copy is flagged as riding the D4 ruling.
5. **The §7 detail redesign** — vomit (photo leaf: facts → photo → AI read → observations → note) and cough (honestly short: facts → note), Edit demoted to a quiet row, Remove separated at the bottom (CUL-612 class), identity always named, never a bare "OTHER" kicker.
6. **The "frequent for this pet" row** — one additive row above a never-reordering grid, rendered at the density that would justify it, with its cost stated.

## Decisions teed (React section, decision-brief format)

- **R1 = D4** — the ruling this round exists for. Rec: **A** (capture-time band + Signal card), team + Dr. Chen; bounded structurally to the time-critical class (strain cluster, open-mouth cat); Designer's dissent recorded in the brief, not erased. B's hidden cost named: it needs new Signal-freshness work to be safe.
- **R2** — grid-scale confirmation + the two visible regroups (Symptoms→Tummy with Lethargy to Energy & behavior; Itch/Scratch→Skin & coat as "Scratching" at W3 — which enum value that tile writes stays a W3 build call, flagged not made).
- **R3** — per-leaf confidence affordance: artifact leaves keep Saw it / Found it; witnessed-by-construction leaves (sounds/behaviors) drop the pair and write `witnessed`. Rec: adopt.
- **R4** — frequent row: rec **park until a pet's grid scrolls** (W3+), including by its proposer.
- **R5** — the outstanding Q4 one-line confirmation (licensing fence). The page complies by construction: no numeric itch scale anywhere; the future itch context flags stay word chips.
- Labels ledger in-page for the D8 silence rule (all §5 labels + group names rendered, veto-able at a glance).

## Persona notes

- **Designer** drew the frequent row (§06) and recommends against shipping it before the grid earns it; carries the D4 dissent in R1.
- **Dr. Chen + clinical-guardrails**: all escalation copy escalates on presence only, states marked counts/times + a general clinical fact, never diagnoses this pet, never reassures (the 26-count frame is the never-reassure case made visible). `nyx-voice` pass on every frame string (no `!`, pet named, app first person, no jargon — "Straining in the litter box," never "stranguria").
- **Glyph debt made visible on purpose**: the full-spine grids repeat stand-ins (two paws, two swirls) — the §13 prediction that B-746 is load-bearing by W3, now a frame anyone can point at.

## Next

- PM reads the artifact, rules **R1/D4** (gates W2 design), confirms R2/R3/R4/R5, vetoes labels.
- If frames change on reaction: republish to the same artifact URL, same session-file discipline.
- W1 (cough + sneeze) remains its own greenlight (Q2); its PR chain is written in §13a.
