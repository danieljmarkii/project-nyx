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
