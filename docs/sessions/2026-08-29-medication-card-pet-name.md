# CUL-626 — the medication completion card names the dose's pet, not the active one

**Date:** 2026-08-29

Shipped via [#745](https://github.com/danieljmarkii/project-nyx/pull/745) (draft). BUILD mode, one issue, one card, one predicate.

## The defect

`components/ui/MedicationCompletionCard.tsx` resolved its `petName` from `usePetStore().activePet`. The card is queued against the pet captured at write time and then survives a pet switch for its 5s dwell — so the sequence "log a dose for Mochi → switch to Biscuit → read the card" produced a clinical prompt asking whether **Biscuit** still got it, over a record that is Mochi's.

Three strings interpolate that name, and all three are the register where a wrong name is worst:

- `doseAdherencePrompt` — the B-172 confirm-to-correct restatement (`"Mochi took it — tap to change."`)
- `doseAdherencePrompt` again, in-doubt — the B-156 PR B3 sharpening (`"Did Mochi still get it?"`), which fires exactly when an unconfirmed dose rode in a refused vehicle
- `comboInDoubtReason` — the faint reason under it (`"Mochi didn't finish the food."`)

The card already carried `payload.petId` (it needs it for the §6.4 double-dose recheck), so the fix was the one-line lookup the issue named.

## What shipped

`resolveRecordPetName(pets, payload.petId)` — the CUL-574 predicate that `MealCompletionCard` and `app/event/[id].tsx` already use. Plus two things past the literal one-liner, both deliberate:

- **The removal line's `?? activePet?.name` rung is gone.** CUL-612 resolved that line from the payload but kept an active-pet fallback under it. `pets` holds only non-archived pets, so the rung is reachable only when the dose's pet is *not* in the list — which entails it is not the active pet either. It was wrong 100% of the times it was taken, and `resolveRecordPetName` refuses it by construction.
- **`activePet` dropped from the destructure.** Nothing else on the card read it. Before this, the card could name two different cats at once — the removal line said the dose's pet while the prompt two lines above said the active one.

No copy changed. No new predicate; the hand-rolled `pets.find(...)` this card carried is the exact six-finds-three-ladders problem CUL-574's helper exists to end.

## The test discipline, and what it caught

Five cases in a new `one card, one pet (CUL-626)` block, mirroring the shipped meal-card precedent. Per the CUL-613 rule they were written and run **against the pre-fix tree first**, and the split came out as required: **4 red** (the defect guards — prompt, restatement, the in-doubt pair, the archived-pet fall-through) and **1 green** (the removal-line pin, whose required direction is pass-before-and-after, because its job is to prove the rebase is a no-op for a line that was already correct).

That split is the point of running them early. Without the pre-fix run, the removal-line pin and the four guards are indistinguishable in a green suite, and there is no evidence the guards discriminate.

The archived-pet case is the one worth keeping: it is the only path where the deleted fallback rung fired, and it must land on the anonymous form (`"Did your pet take it?"`), never on the active pet's name.

## Sweep

`grep` for `activePet?.name` across `app/` + `components/` + `lib/`. Every hit is an active-pet-scoped surface where the active pet genuinely is the subject (Home, the capture screens, onboarding, the tab bar) — **except two**, both record-scoped, both left alone rather than folded in:

- `NamedCompletionCard.tsx:267` — already filed as **CUL-659**.
- `app/log.tsx:624` — the retroactive combo-confirm sheet's `comboPetName`, same rung, same argument, on the same clinical "did it still get in?" ask. Filed this session as **CUL-711**, and it is a natural rider on CUL-659 so the class closes in one PR.

With those two, the CUL-574 class is fully enumerated at three sites.

## Verification

- `npx tsc --noEmit` — clean
- `npx jest --ci` — **280 suites / 6121 tests green**, 5 snapshots
- Guards specifically re-run: `guards/` (12 suites), `MealCompletionCard`, `NamedCompletionCard`, `petStore`, `momentStore` — all green

## Persona sign-off

Data Scientist ✓ (multi-pet attribution — the failing sequence reproduced in a test before the fix, and the archived-pet path proved to land anonymous rather than on the active pet) — Engineer ✓ (one predicate, no new lookup, `activePet` removed rather than left dangling) — Designer ✓ (no copy change; the anonymous form is the shipped `ANONYMOUS_PET_NAME`) — Dr. Chen N/A (no clinical logic changed — the same prompt fires on the same conditions; only the name in it moved) — QA ✓ (pre-fix red/green split recorded above).

Adversarial review: **N/A** — the diff touches no detection engine, AI read, escalation threshold, or vet-report input. It changes which of two strings a display name resolves from. The falsification that mattered here is the pre-fix test run, and it is recorded.
