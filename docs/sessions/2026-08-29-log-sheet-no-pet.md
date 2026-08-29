# The log sheet says why it cannot log, instead of vanishing

**Date:** 2026-08-29

Shipped via **#753** (CUL-681). Event Taxonomy Expansion project — a defect on the B-745 `log_picker_v2` sheet, filed by `pm-feature-review` off the CUL-662 session. No schema, no migration, no Edge Function.

## The defect

`handleSelect` in `components/log/EventTypeSheet.tsx`:

```ts
const pet = usePetStore.getState().activePet;
if (!pet) { onClose(); return; } // no pet to write for — nothing to confirm
```

The sheet vanished, nothing was written, and nothing was said. That is CUL-575's rule — *a failed write is always said*; **"the row reappearing under the owner's finger with no message is the app looking broken at the moment it is being careful"** — applied to a write that never **starts**.

The issue named the fork itself: *"either a line of copy or a grid that does not accept taps at all, never a vanish."* PM ruled **replace the grid**, which is both.

## Two findings the issue did not have

**1. The state is reachable for a real window, not near-zero.** The issue's reachability argument was about the *store's* invariants (`pets` non-empty on every normal path; every mutator keeps `activePet` a member of `pets` — the CUL-574 proof). Both hold. But they are invariants about a store that **has been filled**, and the filling is asynchronous:

- `app/(tabs)/_layout.tsx:43` mounts the FAB unconditionally, inside the tabs.
- The tabs are reached the moment the session lands (`app/_layout.tsx` — *"writing the store is the routing"*), which is before any pet read.
- Pets hydrate from a **network** read — `hooks/usePet.ts:78`, `supabase.from('pets')` — not from local SQLite.
- On a failed double-read that hook deliberately `return`s and leaves the store as-is, so a later refresh recovers rather than false-onboarding.

So **every cold start has a no-pet window**, brief on wifi and open-ended offline. What genuinely *is* near-unreachable is the other cause — a signed-in account with zero pets — because archiving a last pet is blocked (`archiveBlockedCopy`: *"Pixel is your only pet here"*).

This matters beyond priority: it decided the copy. See below.

**2. One gate closes a half the issue's guard could never reach.** `handleSelect` has two branches, and the issue only saw the second:

```ts
if (routesOut(type)) { onClose(); router.push(`/log?type=${type}`); return; }
```

Meal / Medication / Weight **never reach the `!pet` guard at all**. They close the sheet and push `/log`, whose pickers are themselves gated on `activePet` (`app/log.tsx:1175`, `:1226`) — so with no pet the owner lands on an empty screen under a *"What did your pet eat?"* header. A fix scoped to the guard would have left that half silent. Gating the **grid** closes both, because neither tile exists.

## What shipped

The `stage === 'grid'` block splits on `activePet`. Without one, a designed `EmptyState` renders in the grid's place — nothing tappable, no title row (`Log for your pet` above copy saying there is no pet reads as a contradiction).

The branch is **reactive**, which is most of why this shape is right: the grid replaces the copy the moment the rows land — no reopen — and returns if the store is wiped under an open sheet. Both directions are pinned.

Three things deliberately *not* done:

- **No action button.** CUL-678 (three days old) keeps management rows off a capture surface, and a push from inside a Modal renders *behind* it (CUL-662), so a door offered here would appear to do nothing. The copy names the Pet tab instead of trying to be it.
- **`handleSelect`'s residual guard stays silent** — a `console.warn` and `return`, no alert. It is unreachable from the UI now, and if the store empties between a render and a tap, the surface itself changes under the owner's finger. That *is* the message CUL-575 asks for.
- **No fallback title.** `const petName = activePet?.name ?? 'your pet'` is deleted. The grid can no longer render without a pet, so the placeholder asserted a state that cannot reach it — and the avatar's own `activePet &&` guard (CUL-679, whose comment explained it existed *because* of that fallback) becomes the branch's narrowing.

## The copy, and the lens that caught the first draft

Shipped:

> **No pet to log for yet**
> Your pets load a moment after the app opens. If they don't, check your connection — or add a pet from the Pet tab.

The first draft ended *"If this stays put, add a pet from the Pet tab."* The **pet-owner lens (Sam)** falsified it against finding 1: the dominant real cause is a pets read that has not landed, so the owner reading this line most often **already has a pet** — and the app's one instruction to them is to add another. Correct-sounding, wrong on the common path.

The rewrite orders the clauses by likelihood rather than by drama: the hydration read first, a failed one second, adding a pet last. `check your connection` is the app's shipped idiom, not a new phrasing (`lib/authErrors.ts:152`, `ArchivePetSheet`, `OwnerNameRow`, `DeleteAccountSheet`).

*The generalisable bit: an empty state that can be arrived at by more than one route has to be honest for all of them, and the clause order is the fix — the least likely cause makes a bad headline even when it is the only actionable one.*

## Tests — CUL-613 applied, including to a test that failed it

Six new cases, all **run against the pre-fix tree first and confirmed red** (tiles present and tappable, no copy, the placeholder title rendering). They are guards, so red-before / green-after is the required direction.

One first draft did **not** discriminate and was replaced:

```ts
expect(getByText('No pet to log for yet')).not.toContain('!');
```

That asserts `.toContain` on a *React test node*, not a string — it would pass over an exclamation mark forever. It also duplicated a rule already enforced app-wide by `guards/ownerFacingCopy.test.ts`. Replaced with the claim only this test can make: the state offers **no way out of the sheet** (`Add a pet` / `Archived pets` absent, `router.push` never called) — the CUL-678 / CUL-662 pair.

The residual write-time guard is honestly **untested**: the render gate and the handler read the same store, so they cannot disagree inside a component test without mocking `getState` away from the hook, which would test the mock. It is defense-in-depth behind an unreachable branch, and the comment says so rather than a test implying otherwise.

## Out of scope, filed not folded

**CUL-717** — `components/log/FAB.tsx` carries the same class of silence one layer up: `handleQuickMeal` returns with no feedback at all (not even its spinner), and the `Vomit` / `Loose stool` / `Log food` rows push into the same dead `/log` screen. Same reachability, same precedent for the shape.

## DoD

| Check | |
|---|---|
| AC from `technical-spec.md` | N/A — defect fix, not a build step. Judged against the issue's bar, CUL-575, Principle 5, CUL-678/662. |
| Anti-patterns | None introduced. Theme tokens only; `EmptyState` reused rather than hand-rolled (B-165's whole point). |
| `tsc --noEmit` | ✓ clean |
| Tests | ✓ 282 suites / 6164 cases. 6 added, mutation-proved red-then-green. |
| Secrets Register | N/A |
| Persona sign-off | Designer ✓ (Principles 1, 5; clause order) — Engineer ✓ (one reactive gate, no new state, dead fallback removed) — QA ✓ (guards red-then-green; one non-discriminating assertion caught and replaced) — Pet Owner/Sam ✓ (**falsified the first copy draft**) — Data N/A — Dr. Chen N/A |
| Adversarial review | Not owed — no clinical or statistical logic, nothing feeds the vet report. |
| Future-self | Not a new pattern; it applies CUL-575's rule and CUL-678's capture-surface rule to a surface that predated both. |
| Dev Handoff | ✓ Runtime B (below in the PR/session summary) |
| PM Action Items | CUL-681 (on-device pass, in the PR checklist) · CUL-717 (new, triage) |
