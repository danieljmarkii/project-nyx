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

## What the reviews caught

Two subagent passes ran against the diff. Both found things the build conversation was too
anchored to see, which is the point of running them in isolation.

**`code-reviewer` — one real bug, and it was mine.** The entry animation had a **re-open flash**.
`PetSwitcherPanel` stays *mounted* between opens (the host renders it unconditionally and gates on
`visible`), so `anim` survived a close still holding `1`. A passive effect runs **after** paint, so
the second open painted one frame at the *end* state before the effect snapped it back to replay —
a visible jump on every open after the first, and **none on the first**, which is exactly what hid
it. Fixed by resetting on the way out, so the value at rest while hidden is always the entrance's
start frame. The regression test was run against the unfixed effect first and confirmed red
(`Number of calls: 0`) — same rule that was applied to the Modal guard.

Three house-rule finds, all applied: a bare `200` where the theme has `durationFast/Medium/Slow`
(now `theme.durationFast`, matching `SheetLogBeat` — the other layer that arrives inside a sheet);
a bare `24` rise (now `theme.space3`); and `switcherVisible` missing from the sheet's reset block,
which is symmetry rather than a live fix but belongs beside the four resets it sits next to.

The reviewer independently reproduced the Modal guard's red-before-fix result by checking the
pre-fix commit into a worktree and running the new test file against it, rather than taking the
claim on trust. Verdict: fix-before-merge on the flash; no adversarial pass owed (presentation
structure, not correlation/detection/escalation logic).

**`pm-feature-review` — SHIP-SHAPED on three of four flows**, and it confirmed the wrong-pet class
is closed *at the mechanism*: the switch and the retitle land on the same tick, the pet is captured
at grid→confirm and never re-read, the confirm header names it, and the beat names it from the
captured value. It also ruled the instant dismissal **correct menu behaviour — keep it**, on the
grounds that an exit animation would delay exactly the fact the owner needs.

Flow 2 came back **NEEDS-WORK**, and it is the finding this fix *creates* rather than merely finds
near: with the switcher working, "Add a pet" is reachable, and `app/add-pet.tsx` calls
`addPet(data, { select: true })` — so one mis-tap inside a log flow loses the log intent **and**
silently changes which pet the whole app is about. Both halves verified in the code. The structural
half is handled here (`onNavigateAway`); whether those management rows belong in a capture surface
at all is a product call with three defensible options, so it was filed with a decision brief rather
than decided in this PR.

Six issues filed, all into the **M0 — Host gate** milestone beside CUL-663 so the pre-GA sweep meets
them: **CUL-678** (Add-a-pet in a capture surface — High, `Waiting on PM`), **CUL-679** (pet avatar
in the title row — High; after a switch the only thing that changes is one word, ~300pt from the
finger and under it, on the app's one pet-identity affordance without an avatar), **CUL-680**
(scoped-vs-global switch semantics — Medium, `Waiting on PM`), **CUL-681** (zero-pet tile tap closes
silently), **CUL-682** (three device-look nits), **CUL-683** (CUL-612's back-chevron exemption no
longer covers all its traffic). Nothing was folded into this PR — CUL-679 in particular is a design
change to a mock-locked surface and owes a mock round.

## Verification

`tsc --noEmit` clean · `jest` 269 suites / 5898 tests green · CI green on all three jobs
(including the non-UTC timezone suite). The pre-existing `useReducedMotion`
act-warning noise in `TrialCompletionSheet` / `NamedCompletionCard` was checked against `main`
(20 occurrences both ways) and is not from this change.

## Follow-on

Unblocks **CUL-663** (the `log_picker_v2` pre-GA QA pass) → the GA call → `event_types_v2` W1 GA
(taxonomy spec v1.1 D12).
