# The FAB menu says why it cannot log, instead of going quiet

**Date:** 2026-08-29

Shipped via **#755** (CUL-717). Event Taxonomy Expansion project — the sibling defect CUL-681 filed rather than folded in, one layer up from the log sheet. No schema, no migration, no Edge Function.

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

The body is unchanged from what CUL-681 shipped. The **title changed after the review**, PM-ruled the same session:

> **No pet loaded yet**
> Your pets load a moment after the app opens. If they don't, check your connection — or add a pet from the Pet tab.

`pm-feature-review` caught that the ordering principle had been applied to the body and then undone one line above it. *"No pet to log for yet"*, read cold at 2am, is *the app lost my dog* — an assertion about the **account**, which is the third arrival, the one the body is deliberately ordered to put last. Title said drama, body said likelihood.

A **load-state** title is the only framing true of all three arrivals (nothing has loaded yet, whether the read is in flight, failed, or answered empty), and it borrows the body's own verb so the second line now explains the first instead of walking it back. The plural *"your pets"* stays deliberately: in this state the app does not know the count, so a singular would assert one more thing it cannot see.

*The generalisable bit: a copy rule applied to the body is not applied to the surface. The title is read first and is the part that gets quoted back.*

Two capture surfaces now express one state, so the string moved to a helper (`noPetToLogForCopy`) rather than being written twice. That is the `archiveBlockedCopy` shape, and what is being protected is the **clause order**: the dominant cause is a pets read that has not answered, so the owner reading this usually already *has* a pet, and a draft leading with "add a pet" told them to add another. Its test pins the ordering rather than the sentence, so a later copy edit has to argue with it instead of quietly re-ordering it.

**It did not go in `lib/utils.ts`, which was the first instinct** — that is where `archiveBlockedCopy` lives and this is the same shape. The deploy-ledger guard rejected it: `ask`, `generate-report` and `generate-signal` all import `lib/utils` for its date helpers, so the whole **file** is in their shipping closure, and one appended string constant drifted three Edge Function fingerprints — two of them under standing deploy holds (CUL-19, CUL-557) and one deployed at v33 that morning. Owner-facing copy that no Edge Function reads should not be able to make a held function look un-deployed. It lives in `lib/logCopy.ts`, which is client-only and is already this surface's copy module.

*The generalisable bit: a shared module's boundary is not what its name suggests, it is what imports it — and on this repo the ledger guard is the thing that knows.*

## Tests — CUL-613 applied, and two labels it corrected

Six added (five on the menu, one on the copy). Every one was run against the pre-fix tree first, and the run **moved two of them**:

- **`leaves no door open` passed pre-fix**, so it discriminated nothing. Its first draft asserted the switcher chip was absent and `router.push` uncalled — both already true for other reasons (the chip self-suppressed; a test that presses nothing cannot route). Replaced with the structural claim: with no pet the menu holds **exactly one touchable, the FAB** — which was 5 pre-fix, and which survives a row being added to this menu later by someone who never reads this file.
- **`still opens on the FAB` failed pre-fix**, which meant it was mislabelled: it asserted both the opening (preserved behaviour) and the copy (new behaviour). CLAUDE.md's rule is that a test has one required direction — a guard red-then-green, a regression-safety test green-then-green — and a mixed one cannot tell a preserved behaviour from a changed one. The copy assertion came out; it is test 1's claim anyway.

Final: four guards red-then-green, one regression guard green-then-green, one copy test.

## The two reviews, and what they moved

`code-reviewer` returned **ship-ready** — no correctness bugs. It independently mutation-tested all six new tests against `cb685d7` and confirmed the split, and it verified the gate against the store's own invariant rather than taking it on trust: `resolveActivePet` (`store/petStore.ts:99-102`) makes `activePet` null **iff** `pets` is empty, so `!activePet` is equivalent to `pets.length === 0` and there is no reachable state where pets exist but the gate hides the rows. Two nits: a preface comment in the test file miscounted the regression guards (fixed here — it was written before the run corrected two labels and not updated after), and `recentFoods` never clears on a pet A→B flip, which is pre-existing and now **CUL-723**.

`pm-feature-review` returned SHIP-SHAPED on the three shape calls — the gate itself, dropping `More events`, and leaving the FAB ungated (*"I would push back on any proposal to change it"*). It returned **NEEDS-WORK on the copy's recovery advice**, and both halves survived my own check of the source:

- **`check your connection` recovers nothing.** `usePet`'s effect keys on `[user]` and retries once at 600ms, then leaves the store as-is. No focus effect, no reconnect listener, no foreground refetch, and nothing else in the app calls the pets read. The state holds until a token refresh or a force-quit. The in-code comment at `hooks/usePet.ts:88` claims *"a later auth refresh / screen focus re-fetch recovers"* — **the screen-focus refetch it names does not exist.**
- **`add a pet from the Pet tab` lands on a Pet tab with no add-a-pet control.** `app/(tabs)/profile.tsx:847` returns early on `!activePet` with an actionless `EmptyState`; the real button is at `:1370`, below the return. `HomeHeader` returns null too, taking the switcher — *"the only 'Add a pet' door"* by its own comment — with it.

The copy is CUL-681's, shipped, and reused here **verbatim and deliberately**: the fix is to make the advice true, not to soften the words to match broken behaviour. Filed as **CUL-722**.

It also surfaced the root cause, which is worth stating plainly: **pets are the only network-only entity in an offline-first app.** Events, meals, medications, weights, foods and attachments all live in local SQLite; the one fact required before any of them can be written is fetched over the network every launch. That is why the no-pet window exists at all, and why an offline one holds open. **CUL-721**, High.

Two findings it raised that I deliberately did **not** act on:

- **The reactive swap lands one-tap write rows under a resting finger** — CUL-612's hit-area reasoning rotated into the time dimension. Real in principle; I cannot judge its likelihood from source, and the obvious mitigation (delay the swap) would undermine the reactive property that is most of why this shape is right. Needs a device recording before anyone changes it.
- **The title asserted the least likely cause** — raised as a decision brief, **ruled the same session (PM: load-state framing)**, and applied. See below.

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
| Persona sign-off | Designer ✓ (Principles 1, 5) — Engineer ✓ (`code-reviewer`: ship-ready; gate verified against `resolveActivePet`'s own invariant) — QA ✓ (six tests mutation-proved; two labels corrected by the run) — Pet Owner/Sam ✓ (`pm-feature-review`: SHIP-SHAPED on all three shape calls, NEEDS-WORK on the inherited copy → CUL-722) — Data N/A — Dr. Chen N/A |
| Dev Handoff | ✓ Runtime B — see the PR |
| PM Action Items | CUL-717 (on-device pass) · CUL-720 (`/log` ungated, + the widget's three deep links) · CUL-721 (pet-roster cache) · CUL-722 (the copy's advice is not actionable) · CUL-723 (stale recent foods on a pet flip) · CUL-724 (FAB menu a11y) · one open PM decision: the shared title's framing |
