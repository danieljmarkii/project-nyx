# Name the record's pet, not the active one (CUL-574)

**Date:** 2026-08-24

Shipped via **#719** (draft). Aug. 2026 Design Polish, the 2026-08-22 audit's defect fallout. Client-only: no schema, no Edge Function, no flag, no migration.

## The defect

`app/event/[id].tsx` captioned three owner-facing strings with `activePet?.name`:

- the vomit AI read's cap line (`VomitAnalysisSection`),
- the stool AI read's cap line (`StoolAnalysisSection`),
- the in-doubt combo dose note (`doseInDoubtNote`).

But that screen is reached **by id**. The multi-pet day-summary spine pushes `/event/[id]` for every pet's rows; deep links and notifications do the same. The active pet is simply not an answer to the question the screen is answering.

So in a two-cat household, tapping Juniper's vomit while Pixel is active rendered Juniper's read as:

> If **Pixel** keeps vomiting or seems off, don't wait for the read — check in with your vet.

That is the wrong animal named on the highest-stakes copy in the app, and the harm is not cosmetic: the sentence is an *instruction to watch a specific cat*, and it named the one that isn't sick.

`MealCompletionCard` had the same class one surface over, and more embarrassingly — it builds `mealPetName` from `payload.petId` *specifically* to avoid this, with a comment saying so, then used the plain active-pet `petName` two hundred lines down in the intake question and the combo row's screen-reader label. One card could name two cats: "Biscuit's meal was taken out of the record" over "How much did Mochi eat?".

## What shipped

`store/petStore.ts` gains **`resolveRecordPetName(pets, petId)`**, and the five sites route through it.

This is the pattern `app/vet-document/[id].tsx:492-501` already documents at length — written by the `rls-privacy-reviewer` during VF-6, when the same bug would have put one cat's name on a file containing the other's bloodwork. There were **six** hand-rolled versions of that `find` in the tree carrying **three different fallback ladders**; this is the diet-trial §5.3 "one predicate" habit applied before a fourth ladder appeared.

Two properties of the helper are load-bearing, and both are inherited from that comment rather than invented here:

**No `activePet` rung.** `pets` holds only non-archived pets (a store invariant with its own comment), so archiving the record's pet while its screen is on the stack makes the `find` miss. An `?? activePet?.name` fallback then names whichever pet is *currently* active — which is the exact mis-attribution the lookup exists to prevent. A miss falls straight through to `'your pet'`: an unnamed sentence is recoverable, a confidently wrong name is not.

**A blank name counts as a miss.** Callers interpolate the result straight into a sentence, so `''` renders "How much did  eat?" — a hole, not a name, and harder to catch in review than a wrong one. `vomitCapCopy` / `stoolCapCopy` had already made this call locally (`petName?.trim() || 'your pet'`); making it in the helper means no caller has to remember.

## The finding worth keeping: the removed rung had no correct case

`MealCompletionCard`'s `mealPetName` used to end `?? petName`, where `petName` was the active pet. Re-basing it onto the helper drops that rung, which reads like a behaviour change to argue about. It isn't one, and the reason is a store invariant:

> Every `petStore` mutator keeps `activePet` a member of `pets` — `resolveActivePet` picks from `pets`, `selectPet` refuses an id not in `pets`, `removePet` re-resolves through `resolveActivePet`, `addPet` inserts before selecting.

So the rung could only fire when `payload.petId ∉ pets`. And since `activePet ∈ pets`, that condition *entails* `activePet.id ≠ payload.petId`. **Every time that fallback fired, it named the wrong animal.** It was not a graceful degradation with a rare bad case; it was a branch that was wrong 100% of the times it was taken.

That is the generalisable shape, and it is why the helper's no-rung rule is stated as a rule rather than a preference: **a fallback to "the current selection" on a surface scoped to a record is never a fallback — it is a different, confidently-stated answer to a question that was already asked correctly.**

## Falsification attempts

The DoD's adversarial line wants the counterexample, not a ✓. Four were tried; the interesting one is the third.

1. **Archived pet, screen on the stack.** Archive the event's pet with its detail open → helper misses → "If your pet keeps vomiting…". Honest, no wrong name, and — the part that matters for `clinical-guardrails` — no reassurance is added by the degradation. **Held.**
2. **First render, before the row loads.** `event` is null, so `event?.pet_id` is `undefined`. But the analysis sections mount only past the `if (!event)` early return, which TypeScript already proves (`event.event_type` is dereferenced unguarded below it). They never render against a null event. **Held.**
3. **Navigate event A → event B and look for a stale-name window.** This is where a mirror-into-`useState` implementation would have failed: `loadAll` resets seven pieces of per-event state precisely because "navigating from event A → event B doesn't briefly flash A's food label" (its own comment), and a `petName` state would have needed an eighth reset — which is exactly the kind of line that gets forgotten. `eventPetName` is **derived** from `event` in the render body, so it cannot drift out of step with the row it captions, and it deliberately does *not* appear in the reset block. There is no window. **Held.**
4. **Could the fix ever be worse than the bug** — produce `'your pet'` where the old code produced a correct name? That needs the record's pet to be outside `pets` while being the active pet, which the invariant above forbids. **No such case.**

## Residuals, filed not folded

- **CUL-626** (pre-existing) — `MedicationCompletionCard` names the active pet, not the dose's. `resolveRecordPetName` is now there for it.
- **CUL-659** (new) — `NamedCompletionCard:194` resolves from the record but keeps the `?? activePet?.name` rung. One line, and by the argument above it has no correct case either.
- **CUL-660** (new) — `app/event/[id].tsx` names the pet **nowhere**: the header reads just "Vomit". This is B-550 one surface over, and CUL-574 does not touch it — correct-but-anonymous is better than confidently wrong, and still not right. Design call first (where the name goes in a header that already carries the event type), so it is not defect fallout.

A **guard file was considered and rejected.** The derivable scan set — `app/**/[id].tsx`, id-routed by construction — does not survive contact: `app/food/[id].tsx` reads `activePet` legitimately (a food is not a pet record, and "add to this pet's trial" means the active one), and `app/medication/[id].tsx` uses it to *scope a query* rather than to caption. A guard riddled with exemptions is worse than none, so the coverage is the helper's unit tests plus card-level regression tests instead.

## Tests

The helper's ladder in `store/petStore.test.ts` (7 cases: the hit, the not-active proof, the archived miss, null/undefined/empty, blank-and-whitespace, padding), and three regression tests on `MealCompletionCard` itself — because the helper being right does not prove the card calls it.

All three card tests were **run against the pre-fix file and confirmed red** before being trusted. That check is CUL-613's lesson, and it was worth repeating: that guard's first version passed on the very defect it existed for because an unrelated `showMealTimePicker` variable satisfied a substring test. A guard that has only ever been green has not been tested.

`tsc --noEmit` clean. Full suite green post-merge: **267 suites / 5861 tests**, including the `guards/geistRollout.test.ts` that landed on `main` mid-session.
