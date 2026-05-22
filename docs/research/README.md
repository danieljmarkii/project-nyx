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
| 2026-05 | [AI correlation confidence thresholds — food→symptom and refusal-pattern detection](./2026-05-ai-correlation-confidence-thresholds.md) | Statistical methodology for sparse owner-logged food→symptom association (lift / Fisher's exact / multiple-comparison correction); latency windows by symptom class (Olivry & Mueller 2020 — 50% of food-allergic dogs flare by day 5, 90% by day 14; only 9% same-day); clinical elimination-diet gold standard (WSAVA 8 weeks strict); adjacent app copy patterns (mySymptoms "correlation, not causation"); IBS inter-rater study (Krippendorff's α=0.07) as the most damning analogue for journal-based trigger ID; false-positive cost asymmetry (cat hepatic lipidosis at 36-hour fasting); refusal-pattern as early-warning signal (feline CKD detectable up to 3 years pre-diagnosis). | Step 10 AI Signal prompt design, confidence thresholds, and copy register; B-013 per-event AI insight guardrails; refusal-pattern detection as a future product surface; AI cost & rate-limit strategy (B-001). |
| 2026-05 | [Vision on stool and vomit imagery — VLM limits, clinical scales, disclaimer patterns](./2026-05-vision-on-stool-and-vomit.md) | What general-purpose VLMs (Claude, GPT-4V, Gemini) can and cannot reliably extract from stool / vomit / accident imagery; clinical reference scales (Bristol Stool Chart, Purina Fecal Scoring System, WALTHAM, hairball-vs-vomit distinction); vision-model error modes on biological imagery (dermatology AI as the most-studied adjacent); owner-reported vs photo-evidence in clinical history (vet telemedicine literature); disclaimer / scope-language patterns from clinical-adjacent consumer apps (SkinVision, Ada, K Health, Pawp, Petriage); descriptive-vs-diagnostic language boundaries (FDA wellness-vs-device, SOAP-note conventions). Largest evidence gap: no published evaluation of any general-purpose VLM on pet stool / vomit / accident photographs — an internal eval would be required before B-013 ships. | B-013 per-event AI insight prompt design and guardrails; B-013 feature shape (standalone blurb vs narrowed Home AI Signal); AI cost & rate-limit strategy (B-001). |
