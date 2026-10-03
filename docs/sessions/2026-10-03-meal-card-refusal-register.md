# The meal completion card stops celebrating a refusal (CUL-894)

**Date:** 2026-10-03
**One thing:** none — dispatched session, not this round's teach row

Dispatched as PR-10 of *Out of beta — Noticed, Design v2, History v2, the trial screen*. Spec: CUL-894 plus the PM's ruling of (a) + (b) on 2026-10-03 (CUL-1520 docket item 3).

## What shipped

- `store/momentStore.ts`: `playCommitHaptic` sends a meal revealed `refused` or `picked` to `commitSymptom` (the soft tap) instead of the success double-tap. The haptic is read at the reveal only; a chip tapped later is a correction and plays nothing. One exported predicate, `isIntakeDecline`, serves the haptic and the card.
- `components/ui/MealCompletionCard.tsx`:
  - The title names the record: "Refused · {food}" and "Picked at · {food}". The phrase is read from the drill-in's map (`unfinishedIntakePhrase`). The nameless fallback is "Food refused" / "Food picked at" / "Food logged".
  - The warm gold halo is split into `checkBadgeCelebrate` (the named card's shape) and is dropped over a decline. The mint check stays, because the record did land.
  - On the intake door's card, the intake row's label reads "You said · tap another to change" instead of re-asking "How much did {pet} eat?". It asks again if she clears the rating.
- The title and halo follow the live rating, so a correction re-titles the card and VoiceOver hears the new title. The haptic does not follow it.

## Reviews

- `nyx-voice`: passed. The phrases are plain, in the drill-in's vocabulary, second person, with no exclamation and no reassurance.
- `code-reviewer`: ship-ready. All its findings were applied: the phrases are derived rather than retyped, the nameless fallback is tested for every arm, the label asks again after a clear, and the re-announcement is now asserted.
- Mutation proofs: removing the haptic branch reds two store tests; rendering the halo unconditionally reds the halo test; dropping the live-rating condition on the label reds the clear test.

## Definition of Done

- The acceptance criteria pass: (a) the soft haptic and no gold beat on a refused or picked-at reveal; (b) the title names the record; the re-asked question is fixed.
- No anti-pattern introduced: theme tokens only, `ThemedText`, no `!`, and the live region is paired.
- `tsc --noEmit` is clean. The touched suites pass (158) and `guards/` passes (737). Tests were added for the store and the card.
- No new secret, no schema change, no migration.
- Personas: Designer ✓ (Principle 4: acknowledge, never congratulate; the named card's calm tone reused). Dr. Chen ✓ (a refusal is never softened, and the title says "Refused" plainly). Engineer ✓ (one predicate shared by sound and picture). Data N/A.
- Adversarial review: N/A. This is a presentation change, and no detection, escalation or report logic is touched. Falsification was still tried: a correction to Refused after an eaten reveal plays no second haptic, and that is pinned by a test.
- Future self: the halo split mirrors `NamedCompletionCard`, which is an existing pattern and not a new one.
- PM actions: none.

## Outcome

Shipped via #1018.
