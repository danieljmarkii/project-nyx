# CUL-1292: the widget's trial taps open the widget's pet, on its trial card

**Date:** 2026-09-26

Shipped via #943. Project **Diet trial — its own screen**, milestone A · Foundations. One of four parallel step-1 sessions (TS-0 CUL-1296, TS-1 CUL-1297, TS-2 CUL-1298, this one).

## The bug

The Home Screen widget's trial dot band and trial fact tile link to `nyx:///profile?pet=<id>&src=widget` (frozen, H-7: no `focus`, no `ts`). The Pet tab read neither `pet` nor `src`, so in a two-pet household Mochi's widget opened **Pixel's** profile, at the top of the page. When Pixel has no trial, that is the empty "Start a diet trial" card for the wrong animal (C-9).

## What shipped

- `app/(tabs)/profile.tsx` calls `useWidgetPetLink(params.pet, params.ts)` above the focus effect, in the order `useHistoryDoor` uses, so the switch lands first in the same flush.
- `lib/profileFocus.ts` → `profileFocusFromParams`. An explicit `focus` wins, which covers every in-app door. Otherwise `src=widget` plus a pet is read as a trial tap on that pet.
- The pending focus request (still a ref, C-22) carries the pet it names. A named request behaves as follows:
  - It **waits** while the pet list loads (cold start).
  - It is **dropped** when the pet is not on the account, rather than landing on the active pet's card.
  - It is **dropped** when the owner has switched away since the tap, and never lands late.
  - It **waits** for that pet's trial read (`useDietTrial().inputIsForPet`, B-789).
  - It **waits** for a trial-card position reported while that pet was on screen (`trialAnchorPetId`).
- `app/(tabs)/profile.widgetLink.test.tsx`: the real `useWidgetPetLink` over the real pet store, two pets, driven by the widget's exact URL. A sender test reads `CulpritWidget.tsx`, so CUL-1302 re-pointing it reds this suite.

## What the build found

- **An unnamed race.** Right after the switch, the screen's "settled" flags still describe the previous pet's content for a render. The stored trial y is also still the previous pet's measurement, and the first test run caught the scroll landing at Pixel's position. The last two gates above exist for that.
- **A gate removed for being unprovable.** The plan added per-pet "loaded for" markers on conditions and medications. No mutation could turn them red. The trial's own marker already closes the window, because both loaders flip to loading in the switch's own commit, before the trial read can answer. So they came out (C-38).
- **Mutation proof.** Each gate was removed one at a time, and each turned at least one test red: the hook call, the pet gate, the settled-for gate, the trial marker, the anchor tag, the switched-away drop, the cold-start wait, the widget-focus branch. The first pass left three survivors (the anchor tag masked them). Two scenarios were added to reach them: a Mochi-tagged position before Mochi's read, and switching away and back.
- **One test withdrawn.** A test pinned a y that only exists because the stub draws the card while its own read is out. The real card is not drawn then, so the test was trimmed to what the gate owns.
- **Merge with TS-1 (#942).** `useDietTrial` now takes a pet id and renamed `inputIsForActivePet` to `inputIsForPet`, with the same meaning for the active pet. The conflict was resolved on meaning and the trial-marker mutation was re-proven on the merged tree.

## Residuals

- **Once per mount (C-41, stated in code).** The widget's profile link has no nonce and the Pet tab stays mounted. If you tap Mochi's widget, switch to Pixel, then tap the same drawing again, nothing re-applies. The fix is CUL-1177 (commented there). CUL-1302 re-points this sender at the trial screen.
- **An unreadable trial read.** If the widget pet's trial read throws, `inputIsForPet` stays false and the door does not scroll: the tab opens on the right pet, at the top. That is honest and fail-closed.
- **Inherited from CUL-170.** At settle, the scroll uses the latest measured position, and a layout event can land a frame later. That is the in-app door's behaviour too. Not widened here.

## Not done here

- Nothing checked on a device. The Manual QA in #943 needs a two-pet account with the widget on Mochi.
