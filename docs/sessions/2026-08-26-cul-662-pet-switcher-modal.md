# CUL-662 — the pet switcher wedged the beta log sheet (Modal-over-Modal on iOS)

**Date:** 2026-08-26

Shipped via #724 (draft). Fix + tests, no schema, no flag change.

## The defect

PM on-device, 2026-08-24: on the beta log sheet (`log_picker_v2`), tapping **"Log for {pet} ▾"**
on a multi-pet account made the sheet lose its dim and stop responding to taps. Nothing recovered
it short of backgrounding or killing the app. This was the first named defect behind the PM
deliberately holding `log_picker_v2` in beta, and it broke multi-pet capture on the new sheet
outright.

## Mechanism — the issue's hypothesis, confirmed from the code

`components/log/EventTypeSheet.tsx` presents its own `<Modal>`, and rendered `PetSwitcherSheet` —
itself a `<Modal>` — as a **sibling**. Presenting a second RN Modal while one is already presented
from the same presenter is the classic unreliable iOS case: the switcher either fails to present or
presents detached, so `switcherVisible` sticks `true` with nothing on screen, and the sheet's scrim
— deliberately unmounted while the switcher is up — never comes back. Wedged invisible layer,
missing scrim, nothing tappable.

The precedent the code copied does not hold, and the comment said so without noticing:

> Drop the scrim while the nested switcher is up (Android bleed-through guard, **matching the FAB**).

The FAB's menu is an in-tree `Animated.View`, not a Modal, so the FAB's switcher presents from the
root with nothing already up. Same for `HomeHeader`. **`EventTypeSheet` was the only Modal-inside-
Modal site in the app** — the one place where the borrowed guard was borrowed across a difference
that mattered.

## The fix

The issue offered three directions and delegated the pick to the build. Took **direction 1**: it
removes the class rather than making it likelier to work, and it needs no spec or mock edit —
direction 2 (`visible={visible && !switcherVisible}`) is a dismiss-and-present in the same frame
with the sheet visibly vanishing mid-switch, and direction 3 (a fourth stage in the sheet body) is a
*visual* change to a design-locked surface, which would owe a mock round first.

`components/pet/PetSwitcherSheet.tsx` splits in two:

- **`PetSwitcherPanel`** — the content (scrim + sheet), with no presentation of its own.
- **`PetSwitcherSheet`** — a thin `<Modal>` wrapper around it. `HomeHeader` and the `FAB` keep this,
  behaviour unchanged; they present from the root, where a Modal is correct.

`EventTypeSheet` renders the *panel* as the top layer of its own Modal. One Modal, always.

## Three things the restructure carried, each a defect if left out

**1. The navigating rows had to dismiss the host.** "Add a pet" and "Archived pets" `router.push`,
and a pushed screen renders *behind* an RN Modal. Today those rows are unreachable because the
switcher never presents at all — **making it present is what exposes them**. So the panel gained
`onNavigateAway`, fired alongside `onClose`, and `EventTypeSheet` wires it to close the whole sheet.
Without it the fix would have traded a wedged sheet for a tap that visibly does nothing.

**2. Android back had to peel the top layer.** The sheet's Modal is now the only `onRequestClose`
there is; unrouted, back would close the whole sheet out from under an open switcher.

**3. Assistive-tech containment was implicit and became explicit.** iOS makes a presented modal's
siblings inert for VoiceOver; a *layer* gets none of that. The panel now declares
`accessibilityViewIsModal` (iOS) and the sheet sets `importantForAccessibility="no-hide-descendants"`
while the switcher is up (Android — that half has to come from outside the panel). Without both, a
screen reader walks the event grid behind the scrim and can log for **the pet being switched away
from**: the wrong-pet class (CUL-574) arriving through the accessibility tree rather than through a
name lookup.

Motion: the panel animates in only when it has no Modal to animate it (~200ms rise + fade), and
collapses to the static frame under reduce-motion (B-284 §1.5). Dismissal is deliberately instant —
the panel unmounts on the same tick as the tap, which keeps "the switcher closed" a *synchronous*
fact rather than one waiting on a frame callback, and reveals the retitled sheet underneath at once
instead of behind a fade.

## What the tests can and cannot prove — and the guard that closes the class

The issue called this out and it is worth keeping: **jest/RTL renders both Modals perfectly
happily.** Native modal presentation is exactly the class a component test cannot see, which is how
this shipped past an already well-covered component. A test written against the *symptom* here would
be a test that cannot fail.

So the tests pin the **structure** that made presentation the deciding factor:

> `presents exactly ONE Modal — with the switcher open and closed`

That assertion was **run against the pre-fix tree first and confirmed red (2 visible Modals)** before
being trusted green — the CUL-613 rule, which earned its place again here. `PetSwitcherSheet.test.tsx`
(new) pins the split from both sides, because each half has a property the other must not acquire:
the panel must render **no** Modal, the wrapper must still render **one**. A tidy-up that collapsed
either back into the other would reintroduce the wedge and nothing else in the suite would notice.

Also pinned: in-place switching retitles the sheet without closing it, the back-button ordering,
"Add a pet" dismissing before it pushes, the a11y containment, and the reduce-motion static frame.

One test was caught being **vacuous** mid-build and removed rather than kept: an "Archived pets"
case in `EventTypeSheet.test` guarded with `if (!row) return`, which passed only because no auth
user was seeded so the row never rendered. It moved to `PetSwitcherSheet.test`, where supabase and
auth are seeded and the row actually exists.

**The device sweep (CUL-663) remains the real proof that it presents.** This diff makes the bad
structure impossible; it cannot make a claim about UIKit.

## Verification

`tsc --noEmit` clean · `jest` 269 suites / 5897 tests green. The pre-existing `useReducedMotion`
act-warning noise in `TrialCompletionSheet` / `NamedCompletionCard` was checked against `main`
(20 occurrences both ways) and is not from this change.

## Follow-on

Unblocks **CUL-663** (the `log_picker_v2` pre-GA QA pass) → the GA call → `event_types_v2` W1 GA
(taxonomy spec v1.1 D12).
