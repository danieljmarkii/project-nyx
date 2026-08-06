# Vet Files — populated-state design pass (round-3 mock)

**Date:** 2026-08-06
**Track:** B-478 Vet Files (shipped v1) → **B-712** (this design pass)
**Persona lead:** Sr. Product Designer
**Outcome:** Mock round 3 published (same artifact URL) → PM ratified the recommendation same session → **built and shipped in the same PR (#602).** The filter trigger is "≥2 types present."

---

## Trigger

PM, with two on-device screenshots: *"We recently released Vet Files… It's underwhelming. Let's get the product designer to take a pass at improving this UX."* The screenshots: the pet-profile **Vet Files card** (one document — a lonely thumbnail beside a wide gutter) and the **library list** at one document (a full "All types" filter over a single row, then a screen of blank).

## The critique — what's actually wrong

The feature is sound. Capture, detail, share, soft-delete all work and passed their reviews. The underwhelm is **not** a build defect — it's that **the states nobody drew are the ones every new owner meets first.** The round-1/2 mocks validated the *populated* card at 3 thumbnails + "+3" and the library at 5 documents across several types. Nobody mocked **n = 1**, and n = 1 is day one for everyone.

Two specific misses, confirmed against the code:

1. **Profile card, `components/vetfiles/VetFilesCard.tsx` + `buildVetFilesCardModel`.** `stripPaths = rows.slice(0, 3)`. At one document the "strip" is a single 34×44 tile stranded in a wide card with an empty gutter — it reads as a thumbnail that *failed to load*, on the card whose whole job is to make the feature feel worth opening. The one element meant to give the card "a pulse" (per its own source comment) deadens it at the most common count.

2. **Library, `app/vet-files.tsx`.** The kind `ScopeMenu` renders unconditionally. At one document (one type) the lens can only ever offer "All types" — it's machinery over a set you can't filter, and it sits above a mostly-blank screen. The filter *amplifies* the emptiness instead of doing work.

Against the principles: Principle 3 ("data is not the product; understanding is") — the card shows a grey rectangle where it could show the record. Principle 5 (empty states are features) — never extended to the *near*-empty populated state, so a one-row library is an accidental void rather than a designed one. The filter-UX rule (a lens earns its place when filtering would change the result) — violated by rendering a single-option lens.

## The redesign (round 3, `docs/culprit-vet-files-mockups.html`)

Before/after phone frames, real content throughout (Nyx, the prescription PDF, Jul 30 — the PM's own screen).

**R3a · the card.** Replace the decorative strip with a **latest-document preview** — thumb · name · type · date — inside the card. It carries real information at n=1 (the actual filing, not a glyph) and scales cleanly: at N documents the preview shows the most recent with a "+N more" tail; when the newest doc is untitled (the D11 steady state) it falls back to "Document — Jul 30" in a quieter weight, never a blank. **Hierarchy untouched:** same secondary/outline button, same calm type — Vet Files stays the quieter sibling of the Vet report. Lifted with *information*, never a louder button.

**R3b · the library.** Two changes about the same emptiness:
- The kind lens **renders only once the library spans ≥2 types.** Its absence over a homogeneous set is honest, not a missing control — there is nothing to lens. When a second type exists it reappears (the round-2 5-document frame is exactly that state; still current).
- A **low-count footer** replaces the void beneath a short list: a quiet, tertiary, forward-looking line naming what else belongs here ("Vaccine certificates, lab results and clinic emails all live here too — whatever a future vet might ask for") plus a soft "Add another document." Not the E1 empty state (there *is* a document) — the designed state *between one and many* that nothing covered. It invites; it doesn't nag (Principle 4).

The round-1/2 sections are kept below the round-3 pass as the record, with the two superseded frames (A1-r2, L-real) marked so a reader scrolling back knows the n=1 case moved.

## The one PM decision

**Filter trigger.** Recommended: render the kind lens only when **≥2 types are present** (semantic — a lens earns its place when filtering would change the result). Alternative: always show it for consistency. One-line condition either way; it's the only open call in this round. (Tagged amber in the mock.)

## Build (shipped this session, PR #602)

The PM ratified the recommendation ("go with your recommendation… /wrap and merge") the same session, so the three changes were built against the "≥2 types present" trigger:

1. **Card model** — `buildVetFilesCardModel` now returns a `preview` (the latest document's title / kind / date / thumb path / untitled flag) plus a `moreLabel` ("+N more"), in place of `stripPaths`/`overflowLabel`. `VetFilesCard.tsx` renders the preview row; `app/(tabs)/profile.tsx` signs only the latest document's path (down from three).
2. **Filter render-condition** — new pure predicate `shouldShowKindLens(rows)` (`≥2 distinct kinds`); `app/vet-files.tsx` renders the `ScopeMenu` only when true and ignores any stale selection while hidden, so a library dropping back to one type can't strand a filtered view.
3. **Low-count footer** — new pure predicate `isYoungLibrary(rows)` (`1–2 documents`) gates a new calm component `components/vetfiles/VetFilesLowCountNote.tsx`; copy ran through `nyx-voice` (specific record types, forward-looking, no exclamation, clear action).

**Tests:** `lib/vetDocumentLibrary.test.ts` updated for the new model + new describes for both predicates (58 pass); 317 pass across the vetfiles/profile suites; `tsc --noEmit` clean. **Owed:** `pm-feature-review` + the on-device pass against the built screens (a device test, not a static read) — flagged in STATUS.

## Persona sign-off

Designer ✓ (Principles 3, 5, 4; filter-UX lens rule; "substrate never louder than the artifact" held) — Engineer ✓ (three changes scoped; the model + both predicates are pure and unit-tested; the footer is pure presentational) — `nyx-voice` ✓ on the one new string. Data / Dr. Chen N/A (no clinical or statistical logic — presentation only, so no adversarial pass required). Access control unchanged (the signed-URL path is untouched; the card signs *fewer* paths), so no `rls-privacy-reviewer` pass.

## Why mock-first, then build in the same PR

This was a design-locked, shipped surface, so the redesign went out as a mock round for the PM to *see* first (mock → ruling → build is the repo discipline) — round 3 re-published to the round-2 artifact URL so the PM's existing link resolved to it. The PM ruled and asked to ship in the same breath, so the build landed in the same PR (one PR per session).

**Artifact:** https://claude.ai/code/artifact/0d5e5f7b-1bf9-449d-805a-6c13d9bba7ed
