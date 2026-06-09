# Research Briefs

Point-in-time evidence captures that inform Nyx product decisions. Each brief is a snapshot of what the literature (academic, clinical, or industry) said at the date of writing. Briefs are **append-only** — once written, they are not edited. If the evidence base shifts materially, write a new brief; do not overwrite an old one.

## How research briefs differ from `/docs/` artifacts

- **`/docs/nyx-*-v*.md`** — canonical, versioned product artifacts (spec, schema, design principles). Edited under the Tier-2 protocol in `CLAUDE.md`.
- **`/docs/backlog.md`** — resolved deferrals. Things we know to do later.
- **`/docs/research/`** (this folder) — *evidence*, not decisions. Briefs document what was known at the time so future product calls can be made from a shared base.

A brief should not contain product recommendations. Those belong in the canonical specs or backlog. Briefs answer "what does the evidence say?"; specs answer "what are we going to do about it?"

## Naming convention

`YYYY-MM-<kebab-topic>.md` — date prefix so the folder sorts chronologically; topic clear from the filename alone.

## Index

| Date | Title | Summary | Informs |
|---|---|---|---|
| 2026-05 | [Feeding windows and partial eating](./2026-05-feeding-windows-and-partial-eating.md) | Clinical evidence on grazing, GI transit times, partial eating, and the offered-vs-consumed timestamp gap. Establishes the science base for any future change to meal-event modelling or the correlation engine. | Future schema decisions on meal consumption modelling; correlation engine design (Step 10); vet report copy on timestamp semantics (Step 9); potential cat-owner persona split. |
| 2026-05 | [Event timestamp uncertainty — witnessed vs discovered incidents](./2026-05-event-timestamp-uncertainty.md) | Evidence base for the witnessed-vs-discovered timestamp problem. PM-reported real-world incidents, persona-estimated prevalence (~35% witnessed average), literature corroboration (bilious vomiting overnight, feline private vomiting, vet history-taking limits), three modelling options with trade-offs. Disproves the prior 80%-witnessed working assumption. | Schema decision for `occurred_at` precision / windowing; quick-log UX redesign for "found" vs "saw" events; vet report timestamp rendering (Step 9); correlation engine weighting of windowed events (Step 10). |
| 2026-06 | [Opus 4.8 vs. the deterministic signal engine — a dogfood PoC](./2026-06-opus-signal-engine-poc.md) | Head-to-head on the *same* pet data: the rigorous case-crossover `detection.ts` engine surfaced only a calm "vomiting improving" reflection, while an Opus 4.8 free-read caught the gestalt the independent-detector architecture is blind to (chronic q2-day vomiting in a young cat, treat-heavy chaotic diet, a foreign-body photo flag, an intake collapse beside a double-vomit). Two systems blind in opposite directions: rigorous-but-myopic vs. holistic-but-undisciplined. Also demonstrates the load-bearing `deleted_at IS NULL` contract (41 of 54 vomits soft-deleted, surfacing backlog B-071) and that context-window size is not the quality lever for per-pet analysis. *Note: carries Open Questions, not decisions — see §8.* | A possible bounded "gestalt reviewer" stage for `generate-signal` (Open Question); privacy model for any LLM-over-raw-logs feature; an adversarial "more-deleted-than-live" test fixture for the detection input contract. |
