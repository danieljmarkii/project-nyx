# Completion card PR-01: the daylight paint

**Date:** 2026-10-09
**One thing:** D2 L1 — Types: deleting an option makes every leftover use a compile error, so a deletion can be checked rather than hoped · check: pending

Dispatched session (/dispatch, Completion card: daylight and motion, PR-01), CUL-1711 under CUL-1691. Plan posted on the issue and in session; the PM typed the go. Shipped via #1139.

## What shipped

Per `docs/nyx-completion-card-requirements.md` v1.1 §1 and §3 item 1:

- **The four surfaces.** `MealCompletionCard`, `NamedCompletionCard`, `MedicationCompletionCard` and `Snackbar` moved off `colorNeutralDark` onto `colorSurface` with `shadows.lg` and no outline. Every on-dark ink took its daylight sibling, including Undo, Change time and the Snackbar's message and action. The action is now `colorAccentInk`, and its `accent-on-dark-ok` marker is gone.
- **`CompletionMark`.** A `colorAccentGlyph` disc, with the check stroked in `COMPLETION_GROUND`. That is a new exported constant the three cards also paint their ground with, so the knock-out cannot drift from the ground it sits on. The halo is transparent out to offset 0.692 (r18), peaks at 0.70, and fades out by r26.
- **Chips.** The rows' `onDark` prop and its dark branches are deleted, and so is FilterChip's `onDark` variant and `'onDark'` in `ChipGroup` / `MultiChipGroup`. The adherence selected fill is now `adherenceActiveFill`, which returns `colorAccentInk` / `colorEventSymptomInk` for every caller. That repaints the dose record and edit-event too, on purpose.
- **Trial panel.** It takes `colorAttentionLight`, `colorAttentionInk` and the new `colorAttentionRail` `#B7791F` (3.30:1 on the wash; the old bright gold measures 1.51:1). `colorMomentGlowFillOnDark` is deleted.
- **`FloorRaiseLine`.** Light is its only ground now: the `ground` prop is deleted, and `SheetLogBeat`'s `ground="light"` went with it. The plan excerpt said "takes `ground="light"`"; spec v1.1 §1 says delete the prop, so the spec won. The plan comment said so before the go.
- **Polish spec §5 R1.** Reworded to D1's wording verbatim, pointing at the completion card spec (v1.3).
- **CLAUDE.md.** Not touched. The Read-These row moved to PR-04 because #1064 holds the file.

## Tests, and how each was proven

- **Opaque ground under the shadow.** `testUtils/tree.ts` gained `shadowedGrounds` / `OPAQUE_HEX`, used by the three card suites and the new `Snackbar.test.tsx`. The named card's "paints no white ground" test was rewritten to "white only on the shadowed card, opaque, never a full-screen takeover". Proof: a `card` ground of `rgba(255,255,255,0.98)` reds all four suites, and so does moving `...shadows.lg` from `card` onto the wrapper.
- **No on-dark ink left.** New `guards/completionCardDaylight.test.ts` scans the four files with comments blanked. Proof: one `colorTextOnDark` planted in each of the four files reds it.
- **Adherence fills.** All four states pin their fill and border. Proof: reverting the fill to the bright colours reds four tests.
- **`CompletionMark`.** The check's ground, the disc teal and the halo stops are pinned. Proof: a hardcoded `colorNeutralDark` check reds it, and so does moving the gap offset.
- **Contrast.** `theme.contrast.test.ts` gained every §1 pair, plus the replaced fills and rail as failing pairs. The `colorNeutralDark` row was relabelled "the dark-button ground", and "five keeps" became four night-ground keeps.
- **`accentOnLight` pin.** It re-anchored from the Snackbar to `DailyRecapOffer.tsx` (6.57:1). The header gained "(4 since CUL-1691 PR 1 …)". A review nit at :47 ("the completion cards' checks on dark") is fixed as history.

Typecheck is clean, and the full jest run passed: 632 suites, 14,823 tests. `code-reviewer` read the diff and returned ship-ready with one nit, fixed in the second commit. No clinical or statistical logic changed, so the adversarial line is N/A.

## Residuals

- `colorFillOnDark` in `constants/theme.ts:128` still says "(the check badge)" and has no consumer. It was orphaned by the earlier grain fix, not this PR, and sits inside the theme history block §1 says to keep. It is left for a later theme sweep.
- Device QA §4 P1 to P6 is the PM's (in the PR body).

## Teach

### Deleting an option makes every leftover use a compile error (D2, L1)
TypeScript checks the code against the types it declares before anything runs. Once an option is removed from a type, any code still asking for it stops compiling. A deletion can then be checked by the compiler instead of hoped about: the type checker lists every place that still needs the removed option, and the build stays red until each one is gone.

**Like:** a hotel retiring a room number. Once 412 comes off the register, every key card still programmed for 412 fails at the front desk, so nobody spends a night looking for a room that no longer exists.

**In today's work:** `components/ui/FilterChip.test.tsx:93`
```ts
function activePair(variant: 'default' | 'filled') {
```
The test helper used to accept `'default' | 'filled' | 'onDark'`. With `'onDark'` deleted from the chip's own type, the old test case `activePair('onDark')` would no longer type-check, so the dark variant could not quietly linger in a test after it left the app.

**Why it matters to you as PM:** when a spec says "delete the dark branch, don't park it", the compiler is what makes that deletion provably complete, not a reviewer's memory of every caller.

**Check:** if a session deleted `'onDark'` from the chip's type but forgot one screen that still passed `variant="onDark"`, what would happen the next time anyone pushed: would the app ship with a broken chip, or would something stop it first?
