# More events / event-type picker — research + round-1 mocks (B-745)

**Date:** 2026-08-12

**Shipped via #629** (docs-only: mock round 1 + backlog rows + this record + STATUS). PM kicked off a research/redesign session on the FAB → "More events" destination — the "Log for {pet}" event-type grid in `app/log.tsx` — with the read that its icons and buttons are janky and likely drifted from the design system. Both reads were right, and measurably so.

## What the research found

**No one has ever touched or critiqued this screen.** A very-thorough docs sweep found zero backlog rows, session docs, or requirements docs about the type grid's design. It shipped at Step 4 and every visual system the app grew afterward passed it by. The concrete drift:

1. **Tap targets that don't read as buttons.** `#FAFAFA` tiles on a `#FFFFFF` ground, no border — 1.02:1. Every button-like surface shipped since carries a border or a real fill (the house card rule is bordered-default, 1px).
2. **Monochrome glyphs in a colour-coded app.** The grid pre-dates the category language (rose symptom / teal meal / slate medication washes + tinted glyphs in 32px circles) now shipped on Today rows, History, and the calendar drill-in. The picker is the only event surface still colour-blind.
3. **Three aged glyphs.** Stool's bare `Circle` reads as a failed image (named in `eventTypes.ts` itself as the weakest Lucide match); Lethargy's `Moon` now collides with the Culprit brand crescent post-rebrand; "Other"'s `Plus` collides with the FAB, the FAB menu's add rows, and sits adjacent to "Attach photo" — two "add something" metaphors for different actions.
4. **Off-system construction.** Five hand-rolled headers in `app/log.tsx` with text-glyph `✕`/`←` and 8pt hitSlop, pre-dating the shared `Header` (B-075); `fontSize: 15` literal; `colorNeutralDark` label; the pre-gap `width:'47%'` + `space-between` layout hack; the grid lives inline in a 1,681-line screen file when house rule says quick-log components belong in `components/log/`.
5. **Nine cells, no hierarchy.** Eight types at equal weight + the "Attach photo" action as an orphan ninth cell. (Its dashed border is a *documented* design-system exception — "additive / not real yet" — so the redesign keeps the dashed treatment, in a full-width utility row instead of a grid cell.)

**Constraints that bind any redesign** (all honoured in the mock): "Event types visible as **large tap targets, not a list**" (design principles §Quick-Log — doctrinal, so list shapes are out); the daylight register (brand spec §1.2 names the quick-log as staying on the light system); category colour = identity, never verdict; the B-113 precedent (the sibling food picker litigated tiles-vs-rows; PM kept 2-up); the filter-UX ban on h-scrolling a closed option set; glyphs keep resolving through `EVENT_TYPES` → `EventIcon` (one swap point, custom-family-ready); no flow changes (same steps, writes, sub-steps — nothing feeds detection/reports/sync).

## What was produced

**`docs/culprit-more-events-mockups.html` — round 1** (artifact 🗂️, republish-over-same-URL convention): the audit, the constraint set, **three shapes side by side** against a faithful current-state frame —

- **A — Refined grid:** current shape brought into the system (bordered tiles, 44px tinted circles, hints). Tallest; borderline-scrolls on an SE.
- **B — Compact button grid** (*team recommendation*): horizontal 2-up tiles ~62pt; the whole set above the fold on every device, targets still half-screen-width, hints fit under labels.
- **C — Grouped grid:** B's tiles under Symptoms / Food & care / Body & more eyebrows, symptoms first. Structure the 8-item set doesn't need yet; relevant if skin/scratch join.

— plus the glyph-decision strip (Circle→CircleDot swap; Plus→Ellipsis swap; Moon→BatteryLow/Bed/keep as **R2**; PawPrint kept-and-flagged for the custom family; UtensilsCrossed/Droplet/Droplets/Pill/Scale hold up once tinted) and the ride-along system repairs (Header migration, token cleanup, `components/log/EventTypePicker` extraction, stool sub-step restyle, design-system README icon-section correction — it still claims emoji).

## Decisions open for the PM (briefs in the mock §06)

- **R1 — shape:** A / **B (rec)** / C. Locks round 2 + the build PR's component shape.
- **R2 — lethargy glyph:** **BatteryLow (rec)** / Bed / keep Moon (accept the brand-crescent collision until the custom family).
- **R3 — scope:** **ship now as one UI PR (rec)** / wait for the icon-family commission.

## Backlog

- **B-745** (Now) — the track row; blocks on R1–R3.
- **B-746** (Later) — commission the custom event-type icon family; the README's standing "replace Lucide everywhere" flag had never been filed as a row (gap found this session). B-410's doctrine noted: the widget's abstract geometry does not adopt the family.

## Round 2 (same session) — rulings + the array

PM reacted to round 1 in-session: **R1 = C** (grouped compact grid), **R2 = BatteryLow**, and a new ruling **R4 — the photo-first entry is removed** (everyone starts from the event; audit confirmed zero capability loss — `renderPhotoAttachRow()` inside the detail steps is untouched, and `attachmentUri` had no source other than the grid tile, so the "which event is this for?" banner path retires as dead code). R3 was superseded by the round-2 ask: **the array** — three ambition rungs.

Round 2 republished over the same artifact URL:
- **§02 GI glyphs, honestly** (answers the PM's "not sure why we're getting fancy" point): the droplet/circle abstractions were the deliberate clinical-calm call, but they fail the iconography rule's own "no metaphor that requires explanation" test. Proposed: two **custom line-drawn glyphs** (faceless poop swirl for stool, splat-over-puddle for vomit — 1.75 stroke, house style, drawn in-house via react-native-svg which already ships under Lucide). This quietly starts B-746 with its two hardest glyphs. The emoji-rhyme caveat is stated in the mock; fallback = round 1's abstractions. **G1 open.**
- **§03 The array:** Rung 1 "C, settled" (the ruled build spec — one UI PR) · Rung 2 "The sheet" (bottom-sheet presentation over the current screen + stool split tile that deletes the sub-step + quiet record context lines — effectively B-007's destination half) · Rung 3 "The dial" (press-and-hold FAB fans a thumb-reachable arc; absorbs B-007; prototype-behind-a-flag track, with Rung 1 as the a11y/reduced-motion fallback).
- **§05 briefs:** **A1** (rec: Rung 1 now, Rung 2 as the B-007 session) + **G1** (rec: adopt the customs).

## Round 3 (same session) — swirl adopted, dial withdrawn, both stretch rungs rebuilt

PM reacted to round 2: **G1a = the stool swirl is adopted** (CircleDot dead; loose stool's sibling drawn in the same pass); the vomit splat did not land (**G1b re-opened** — wants poop-level recognizability); **Rung 1 confirmed** as the ship shape ("it just works"); Rung 2 sent back as under-scoped ("an achievable stretch should be at least a PR or two"); **Rung 3's dial killed** — the PM's challenge ("where have we seen this in best-of-class apps?") was correct: radial FAB fans are a Path-era (2012) pattern no benchmark app ships.

Round 3 republished over the same artifact URL:
- **§02 vomit glyph** — the honest constraint stated (poop's universality comes from culture standardizing one silhouette; vomit's emoji is a *face*, so facelessness has a recognizability ceiling) + three candidates rendered plain/tinted/16px: **V1 splat** (blob + flecks — energetic, subject-less at small sizes), **V2 spew** (arcs into a puddle — the event's motion; *team lean, by elimination with conviction*), **V3 profile** (face + stream — the emoji's recognizability at the cost of the product's first face; Dr. Chen + voice register pushback recorded). Fallback = the shipped Droplet.
- **§03 Rung 2 v2 — "the one-surface log":** the sheet now changes the *flow*, not the presentation — a simple event completes entirely in the sheet (tap Vomit → the picker morphs in place to time/Saw-it-Found-it/photo/note/Save; completion moment lands there; Home never leaves). Two-stage frames drawn. Calibrated as 2 PRs (sheet+picker / step-machine rework). Round 2's context lines dropped — they were the "just adding data" part. Meal/med/weight still route to their own screens.
- **§04 Rung 3 v2 — "the capture bar":** the dial's replacement, grounded in named best-of-class precedent — Linear's Cmd-K three layers (suggested → browsable → typed), Fantastical's parse-confirm, Things' quick-entry sheet. Record-derived suggestion chips (B-614 confirmability gate; pull-only so no Principle-4 issue), the compressed type row, and natural-language capture ("threw up after breakfast" → structured event, confirmed before write, never a silent guess). Parsing deterministic-first; any LLM assist explicitly an AI-boundary D2-class call, not assumed.
- **§05 briefs:** **G1b** (vomit glyph — rec V2), **A2** (rung-2 v2 as the committed B-007-destination track — rec yes), **A3** (capture bar — rec park as north star until Rung 2 ships).

## Deliberately not touched

B-007 (FAB experience revamp — the parent seam), B-201 (Weight promotion into the FAB), B-139 (Medication FAB entry): all remain open exactly as they were; the mock's scope fence says nothing here forecloses them. No code changed this session.

## Persona sign-off

Designer ✓ (principles 1, 5; 10-second test framing; B-113 precedent honoured) — Jordan/Sam ✓ (3am findability argument recorded in the mock's ordering callout) — Engineer ✓ (one-render-path constraint, no new deps, extraction plan) — Dr. Chen ✓ (R2 register note: lethargy as deficit state; no clinical logic touched) — Data N/A — QA N/A (no code).
