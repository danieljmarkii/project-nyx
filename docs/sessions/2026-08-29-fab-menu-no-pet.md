# The FAB menu says why it cannot log, instead of going quiet

**Date:** 2026-08-29

CUL-717. Event Taxonomy Expansion project — the sibling defect CUL-681 filed rather than folded in, one layer up from the log sheet. No schema, no migration, no Edge Function.

## The defect

`components/log/FAB.tsx`, with no `activePet`, offered three paths and all three failed silently:

```ts
const pet = usePetStore.getState().activePet;
if (logging || !pet) return;   // handleQuickMeal
```

A recent-food tile tap wrote nothing and said nothing — and did not even show its own spinner, because the guard sits above `setLogging`. `Log food` and the `Vomit` / `Loose stool` rows called `closeMenu()` and pushed `/log`, which is itself gated on the pet it does not have. Meanwhile the `Logging for {pet}` chip already self-suppressed on `pets.length > 1 && activePet`, so the menu was silently pet-less rather than saying so.

The ruled shape is CUL-681's, and the issue named it: the rows do not render at all, and a designed `EmptyState` says why in their place. One gate closes all three paths, because none of the rows exist to tap.

## What the issue did not have, and it is the reason to fix it

The issue describes the symptom rows as landing the owner "on an empty screen under a *What did {pet} eat?* header". That is exactly right for **`Log food`** — `/log?type=meal` → the `food` step, whose `FoodPicker` is gated on `activePet` (`app/log.tsx:1175`).

**Vomit and Loose stool go somewhere worse.** `/log?type=vomit` routes to the `simple` step (`:1385`), which is **not** gated on a pet. It renders the entire form — the photo attach row, the notes input, the time affordance. The owner photographs the vomit, writes a note, taps **Log vomit**, and `handleConfirm` hits `if (!pet) return null` (`:846`) and returns. No alert, no navigation, no state change. The form just sits there.

So this is not a lost tap. It is lost work, of the one kind the app elsewhere goes out of its way to protect: CUL-645 gates the completion card's Undo behind a confirm *specifically* because a photo "is of the thing itself and cannot be taken again", and CUL-612's discard guard draws the same line one step earlier in this very flow. Both of those protect the photo from the owner's own mistouch; nothing was protecting it from the app.

That half is out of scope for a fix in `FAB.tsx` and is filed as **CUL-720** — `/log` still has no guard of its own, and `TodayZone` on Home reaches it through the same hydration window.

## What shipped

The menu body splits on `activePet`. Without one, the rows — recent foods, `Log food`, the symptom pair, `More events` — do not render, and the shared no-pet copy stands where they were. The branch is reactive, so the rows fill in the moment the pets land; no need to close and reopen the menu.

Three calls inside that shape:

- **`More events` goes with the rest**, though the issue noted it could stay. Flag-on it opens the sheet, which now says the same thing for itself — a second surface repeating the message — and flag-off it pushes bare `/log`, the same dead end. The menu gets one answer.
- **The FAB button itself stays ungated.** A missing FAB is the app looking broken in a different way; the menu that opens is the thing that explains itself (Principle 5).
- **`handleQuickMeal`'s residual guard stays, split in two.** `logging` and `!pet` are different states and only one of them wants a warning, so conflating them made the log inaccurate. The no-pet branch is deliberately silent: it is unreachable from the UI now, and if the store empties between a render and a tap, the menu changes under the owner's finger — which *is* the message CUL-575 asks for.

The chip's own `activePet &&` drops, narrowed by the branch above it, the way CUL-681 let the sheet's avatar drop its own guard.

## The copy, and where it ended up

Unchanged from what CUL-681 shipped — same state, same words:

> **No pet to log for yet**
> Your pets load a moment after the app opens. If they don't, check your connection — or add a pet from the Pet tab.

Two capture surfaces now express one state, so the string moved to a helper (`noPetToLogForCopy`) rather than being written twice. That is the `archiveBlockedCopy` shape, and what is being protected is the **clause order**: the dominant cause is a pets read that has not answered, so the owner reading this usually already *has* a pet, and a draft leading with "add a pet" told them to add another. Its test pins the ordering rather than the sentence, so a later copy edit has to argue with it instead of quietly re-ordering it.

**It did not go in `lib/utils.ts`, which was the first instinct** — that is where `archiveBlockedCopy` lives and this is the same shape. The deploy-ledger guard rejected it: `ask`, `generate-report` and `generate-signal` all import `lib/utils` for its date helpers, so the whole **file** is in their shipping closure, and one appended string constant drifted three Edge Function fingerprints — two of them under standing deploy holds (CUL-19, CUL-557) and one deployed at v33 that morning. Owner-facing copy that no Edge Function reads should not be able to make a held function look un-deployed. It lives in `lib/logCopy.ts`, which is client-only and is already this surface's copy module.

*The generalisable bit: a shared module's boundary is not what its name suggests, it is what imports it — and on this repo the ledger guard is the thing that knows.*

## Tests — CUL-613 applied, and two labels it corrected

Six added (five on the menu, one on the copy). Every one was run against the pre-fix tree first, and the run **moved two of them**:

- **`leaves no door open` passed pre-fix**, so it discriminated nothing. Its first draft asserted the switcher chip was absent and `router.push` uncalled — both already true for other reasons (the chip self-suppressed; a test that presses nothing cannot route). Replaced with the structural claim: with no pet the menu holds **exactly one touchable, the FAB** — which was 5 pre-fix, and which survives a row being added to this menu later by someone who never reads this file.
- **`still opens on the FAB` failed pre-fix**, which meant it was mislabelled: it asserted both the opening (preserved behaviour) and the copy (new behaviour). CLAUDE.md's rule is that a test has one required direction — a guard red-then-green, a regression-safety test green-then-green — and a mixed one cannot tell a preserved behaviour from a changed one. The copy assertion came out; it is test 1's claim anyway.

Final: four guards red-then-green, one regression guard green-then-green, one copy test.

## DoD

| Check | |
|---|---|
| AC from `technical-spec.md` | N/A — defect fix, not a build step. Judged against the issue's bar, CUL-681's ruling, CUL-575, Principle 5. |
| Anti-patterns | None introduced. Theme tokens only; `EmptyState` + `ThemedText` reused rather than hand-rolled. |
| `tsc --noEmit` | ✓ clean |
| Tests | ✓ 282 suites / 6170 cases green. 6 added, mutation-proved in their required direction. |
| Secrets Register | N/A |
| Adversarial review | Not owed — no clinical or statistical logic, nothing feeds the vet report. |
| Future-self | Not a new pattern; applies CUL-681's ruling to the surface above it. The copy-module placement is new and carries its reason in place. |
