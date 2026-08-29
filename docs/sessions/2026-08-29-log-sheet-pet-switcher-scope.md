# The pet switcher says what switching a pet actually does (CUL-680)

**Date:** 2026-08-29

Shipped via #752. One-file copy change plus tests; no schema, no migration, no deploy.

## The problem

The log sheet frames its pet switcher in **scoped** language and the switch is not scoped.

- `components/log/EventTypeSheet.tsx:218` — the sheet's title is `Log for {pet}`, and it is the switcher's tap target.
- `components/log/FAB.tsx:221` — the shipped FAB menu chip is `Logging for {pet}`, same control, same framing.
- `components/pet/PetSwitcherSheet.tsx` — `handleSelect` calls `selectPet`, which writes the choice to disk via `persistActivePetId` (`store/petStore.ts:45`, AsyncStorage) and re-points Home, Signal, Today, Trend, History and the Pet tab until it is changed again.

So the panel that opens under a title reading "Log for Nyx" was headed `Your pets` — generic, saying nothing about scope — and one tap moved the whole app, persistently. Sam logs one hairball for Miso and lands back on **Miso's** Home without having asked to go there; switching *to* the other cat is one tap, switching back is something she has to remember unprompted.

Pre-existing app-wide framing, not introduced by CUL-662 — but CUL-662 is what made cross-pet switching a routine part of the log flow (before it, the switcher wedged the sheet on iOS), so the asymmetry started being paid for now.

## The ruling

**PM ruled A1 — copy only** (2026-08-29), from the issue's decision brief:

- Keep the switch **global**. That is what multi-pet §1.5 / §3.3 ratified: the flip *is* the app's pet, made before logging.
- Stop implying otherwise: name the app-wide effect at the moment of decision.
- The optional "switch back to {previous pet}" affordance on the completion beat (option A2) was **not** taken this session.

Option B (a genuinely per-log pet) was declined. Two findings from the verification pass fed that:

1. **B is less novel than the brief implied** — the sheet *already* carries a per-log pet snapshot from grid→confirm→beat (`SimpleEventConfirm` takes `petId`/`petName` captured at grid→confirm; the completion payloads carry `petId` for the same queue-then-switch reason). B would extend that snapshot backwards to the grid stage rather than invent a new concept.
2. **B as stated would cost trial hygiene on the picker, which is what it was meant to buy.** `components/log/FoodPicker.tsx:282` already guards the divergence — `if (activePetId !== petId) return []` drops the pinned trial section, because marking pet A's allowed foods on pet B's log screen is the cross-pet leak D7 forbids. Under B that divergence becomes the *normal* state for every cross-pet log, so the pinned "On the trial list" section would silently never render on exactly the cross-pet meals Jordan cares about — unless all 33 `activePet` reads across the five log-flow files (plus `useTrialAllowedSet`, which resolves the active pet internally) were re-pointed at the sheet's pet.

## What shipped

`components/pet/PetSwitcherSheet.tsx` — one line under the `Your pets` header, on capture hosts only:

> Switching changes the whole app to that pet, not just this log.

It rides **`captureSurface`**, the prop CUL-678 added the day before, so both capture hosts (the log sheet's panel and the FAB menu's sheet wrapper) are covered by the one change and a future capture host inherits it by declaring what it is. The prop's docstring now names both consequences rather than only the dropped management rows.

Three deliberate calls:

- **Capture hosts only.** On the Home header and the Pet tab the scope is self-evident — the screen being read changes under the tap — and neither ever framed the switch as being about one log. A blanket disclaimer there would be noise on surfaces that never mis-stated anything.
- **It names the contrast, not a list of surfaces.** nyx-voice Pattern 2 pushes toward specificity, and the specific version is wrong here: the tabs are Home / History / Foods / Pet, and **Trend is a zone on Home, not a tab**. A caption reading "Home, Trend and History" would ship a surface name the app does not have, and any such list dates the moment the tabs move. "The whole app … not just this log" is the fact that matters and stays true.
- **The header pulls in** (`headerTight`) so the caption sits with the line it belongs to instead of floating between header and list. Net height cost on capture hosts ≈ 24pt; the list's `maxHeight: 320` scroll cap is unchanged.

## Tests

`components/pet/PetSwitcherSheet.test.tsx`, split by required direction per CUL-613:

- Two **guards** (must be red pre-fix): the caption renders on a capture host, and it reaches the panel through the `PetSwitcherSheet` wrapper for the FAB menu.
- One **preservation** test (must be green both sides): it stays off the management hosts.

Proven by mutation, not by inspection — the source change was stashed and the suite run against the pre-fix tree: exactly the two guards went red, the preservation test stayed green. Restored: 15/15 green, no `act()` warnings.

One test-hygiene note found while doing that. The negative test first used the file's `settled()` helper, which is `waitFor(getByText('Archived pets'))` — a 1s timeout on a condition an absence assertion has no stake in. Switched to `flush()`. This matters because a `--clearCache` cold run *does* red this suite: `renders NO Modal of its own` took 5949 ms and failed. That one is **pre-existing and untouched** — first-compile cost attributed to the first test in the file, not a defect in it, and not this session's to fix — but it is why the new test should not have been coupled to a timeout either.

## Not folded in

- **The "switch back" affordance (A2).** Not ruled. Costing it honestly: `SheetLogBeat` is a controls-free 1800 ms dwell that closes the sheet on completion, so it would need a control, a dwell pause and a hold (the CUL-645 lesson — a dialog over a self-dismissing surface must hold it open, or the owner's tap lands on a card that has already gone), plus its own CUL-612 hit-area review against the existing controls. That is a build, not a copy pass.
- **`app/log.tsx:1155`** also reads `Log for {pet}`, and is deliberately left alone: that full-screen header is a label with **no switcher on the screen**, so there is no control whose scope could be mis-stated.
