# PetAvatar loading + failed states — the initial becomes the floor (CUL-617)

**Date:** 2026-08-29

Shipped via **#740** (draft). Aug. 2026 Design Polish, defect wave. Client-only:
no schema, no Edge Function, no flag.

## The defect

`components/pet/PetAvatar.tsx` branched: a photo path returned a bare `<Image>`;
no path returned the tinted initial chip. So the chip was the **no-path**
fallback and there was no answer at all for **loading** or **failed** — first
launch offline, a slow cold start, or a storage object that 404s rendered an
empty circle. No `onError`, no `defaultSource`, no background on the round style.

Pre-existing, and made load-bearing by CUL-599: that disc is now the Pet tab's
identity anchor on every screen, so compounded with a long name (which falls back
to the literal word `Pet`) it is a blank circle labelled "Pet".

## What was built

**The chip stops being a rival branch and becomes the floor.** It always renders;
the photo layers over it via `StyleSheet.absoluteFill` inside a clipping disc. RN
paints nothing for an image in flight, so the initial *is* the loading state —
no opacity juggling, no `loaded` flag, no flash — and `onError` drops the photo
layer, so the initial is also the failed state.

**Retry.** A failed photo has to be able to come back: the tab bar mounts once per
session, so without one, "launched offline" strands every disc until relaunch.
The failure is remembered against the **attempt** (`uri#epoch`) rather than as a
bare boolean, so both triggers — a new photo path, or an offline→online
transition — fall out of the derivation with no reset effect, and keying the
`<Image>` on it is what makes RN actually re-fetch. One module-level network
listener serves every mounted avatar (the switcher and archived list render one
disc per pet, so a `useIsOnline()` per instance would open a native listener per
disc); it is opened lazily by the first avatar and released by the last.

**Eight surfaces inherit it with no call-site changes:** tab bar, Home header,
switcher sheet, FAB, `AlwaysAvailableCard`, `CrossPetSafetyBanner`,
archived-pets list.

## Decision — the PM ruled option A

Loading and failed get the **same** answer, the pet's initial. Presented as a
three-option brief; A ruled.

The argument: this disc's whole job is identity, and "B" says *who this is* where
a shimmer would only say *something is coming* — and at 22pt in the tab bar a
shimmer and a blank disc are indistinguishable anyway. A skeleton was rejected on
its own tier rule (§Loading-indicators reserves skeletons for *content-shaped*
waits; a disc is not content-shaped). A distinct failed treatment was rejected
because an owner cannot act on "the CDN 404'd" from chrome — a broken-photo mark
there erodes trust in the app rather than in the photo.

Principle 5 in its exact form: **the designed empty state already existed; the
bug was that it was not the floor.**

## Three things the build found

**1. The connectivity baseline must come from a real read.** My first cut seeded
`wasOnline = true` optimistically and advanced the epoch only on an offline→online
*edge*. But the listener reports **changes**, so an app launched already-offline
may never see an offline event — and the single online event that follows would
find `wasOnline` still true, read as "no edge", and never retry. That is
*precisely* the launched-offline case the mechanism exists for. Seeded from
`getNetworkStateAsync()` on first subscribe instead.

Worth writing down because it inverts a shipped precedent: `hooks/useIsOnline`
seeds optimistically `true` **on purpose**, because it *guards an action* and a
wrong optimistic read costs a blocked user. Here a wrong optimistic read costs a
missed retry, so the safe default is the other way. *The safe default of a
connectivity read is a property of what the read is FOR, not of connectivity.*

**2. The fix creates an accessibility regression unless the disc is contained.**
The initial is now mounted for pets that **have** a photo, where before it reached
the a11y tree only for photoless ones. Left exposed, VoiceOver would newly read
"B, Biscuit" on every switcher row. The disc is decoration — every consumer
already names the pet on its own touchable — so it takes the `Skeleton`
convention (`accessibilityElementsHidden` + `importantForAccessibility`).

This then surfaced a nice property: **RTL's queries skip an accessibility-hidden
subtree exactly as VoiceOver does**, so every query into the disc must opt in with
`includeHiddenElements`. That opt-in doubles as a standing proof the containment
is real — delete the containment and those queries start passing on their own.

**3. A consumer test asserted the rule this change reverses, and went silently
green.** `NyxTabBar.test.tsx` held `// The initial is the fallback, not a
companion to the photo` with `expect(queryByText('B')).toBeNull()` — i.e. it
encoded the old design as intentional. Post-fix it *passed*, because the query now
skips the hidden subtree. Rewritten to assert the new rule outright.

The generalisable bit: **a test that keeps passing across a deliberate reversal of
the rule it was written for is not a test any more.** It was only findable because
the change also moved the node's visibility; a reversal that left visibility alone
would have left it green and unexamined.

## Test infrastructure — `jest.setup.js` (new)

jest-expo mocks `addNetworkStateListener` as returning a bare `{}`, but the real
API returns an `EventSubscription`. So any unmount that cleans up a listener
throws `remove is not a function` from inside React's commit — pointing at the
component rather than at the missing mock. It took the affected consumer suites
from 27 passing to 64 failing in one step.

This is a **latent landmine `hooks/useIsOnline` already carried**; nothing had
tripped it only because no test yet rendered a screen that uses it.

Patched once centrally rather than per-file, and the reason is the fan-out: the
affected leaf renders on eight surfaces, so a per-file mock would make every
future test that happens to render a Home header, a tab bar, a FAB, a switcher, a
food card, a safety banner or the archived list remember a rule about a module it
never imports. Only the broken function is replaced; a test that needs to *drive*
network state still declares its own mock, which wins over the global one.

## Guard discipline (CUL-613)

Every new assertion was run against the tree it was written for **before** being
trusted. The first pass went 5-red / 3-green against the pre-fix component, and
the reds were for the defect (no initial under a photo; the image surviving an
`onError`), not for a missing testID — temporary testIDs were added to the
pre-fix file so the red-check could not pass for a trivial reason. Re-run after
the test file was finalised: same 5 red. The launched-offline seed was
red-checked separately by removing the seed and confirming that one test alone
went red.

## Verification

- `tsc --noEmit` clean.
- `npx jest --ci` — 278 suites / **6085 tests**, all green.
- Consumer suites updated for real consequences, not worked around:
  `NyxTabBar` (the reversed rule, above), `HomeHeader` (the size assertion moved
  from the `<Image>` to the disc that now clips it; the row's whole-text-set
  assertion gained `'B'` — that test's own comment asked for exactly this
  deliberate edit), `EventTypeSheet` (its a11y test counted *every* node carrying
  `no-hide-descendants`; it now counts the sheet's own stand-down, so it stops
  drifting with each new avatar on screen).
- **Not verified:** actual paint timing on device. The static pass cannot cover
  it; the PR carries the manual script.

## Filed, not folded in

**CUL-705** — the Pet profile hero (`app/(tabs)/profile.tsx:910`) is a hand-rolled
`<Image>` with the identical missing-`onError` defect. Kept out of this PR because
it needs a *different* designed answer: `Change photo` sits directly beneath it,
so a failed load there **is** actionable — which is the exact affordance this
session argued chrome should not carry. Its open question is whether the failure
is named there; everything else follows CUL-617.
