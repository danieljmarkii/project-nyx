# CUL-683 — the back chevron's discard exemption, ruled (A): leave it, sharpen the watch

**Date:** 2026-08-30

A DISCOVERY session. No app code changed; the deliverable was a decision brief, the PM's
ruling on it, and the one edit that ruling implied. Shipped via #757.

## The question

CUL-612 deliberately exempted the log sheet's back chevron from the discard guard, on the
grounds that it is a labelled in-flow control meaning *"wrong type, take me back to the
grid"* — a deliberate choice, not a slip, and a dialog on a deliberate choice is friction.
CUL-683 (filed by `pm-feature-review` off the CUL-662 fix) observed that the exemption's
stated case no longer covers all its traffic: because there is deliberately no switcher at
the confirm stage, back is *also* the only route for "right type, wrong pet" — which is not
the owner abandoning their work, and by then a photo may be attached.

Three options were on the table: **(A)** leave it and watch, **(B)** guard back when the
draft holds a photo, **(C)** add pet correction in-confirm.

## What the code walk found

The description was accurate as filed. Back (`SimpleEventConfirm.tsx:397` →
`EventTypeSheet.tsx:370`) unmounts the confirm and clears `draft`; `photo` is local
`useState`, so it goes with it, silently. Every *other* exit — backdrop, grabber, Android
back — routes through `requestClose()` and is guarded. Four things were not in the
description, and two of them change what the options cost:

1. **The photo is worse than "un-retakeable."** `runPicker` calls `launchCameraAsync` with
   no media-library save, so a camera photo lives only in the app cache and never reaches
   the owner's camera roll. On vomit/stool it is also the payload the per-incident AI read
   runs on (`PHOTO_READ_TYPES`).

2. **(B) buys disclosure, not recovery.** `updateEvent` takes no `pet_id` and no surface in
   the app offers pet reassignment, so "log it to the wrong pet and fix it later" does not
   exist; delete-and-relog loses the photo too, since it is bound to the deleted event. An
   owner who spots the wrong pet at the confirm has exactly two outcomes: lose the photo, or
   put the record permanently on the wrong pet. A dialog on back names the loss and still
   leaves both. That makes (B) the weakest option, not merely the most contradictory — which
   is not how the issue framed it.

3. **(C) is not "architecturally cheap."** The "nothing can switch it mid-confirm" invariant
   is load-bearing in a *third* place beyond the two files the issue names:
   `handleLogIt`'s optimistic `prependEvent` (`SimpleEventConfirm.tsx:341`) writes into
   `todayEvents`, which is one global list scoped to whoever was active when it loaded. An
   in-confirm switch that does not re-point `activePet` prepends pet B's event into pet A's
   Today — the CUL-574 wrong-pet class. One that *does* call `selectPet` re-points the whole
   app mid-log, which is exactly what CUL-680's just-shipped disclosure exists to warn about.
   Whoever costs (C) later should start from this, not from "the switcher is a layer now."

4. **The frequency bound got stronger after filing, and the watch had not started.** Three
   naming surfaces now precede the confirm rather than the two the issue counted — the FAB's
   "Logging for {pet}" chip, the grid title row (which gained the pet's avatar in CUL-679,
   2026-08-29), and the confirm header. Live state at ruling time: `app_config.log_picker_v2`
   carries exactly one allowlisted account, and of three accounts in the database one is
   multi-pet. The population that can reach this defect today is a single household.

## The ruling

**(A)** — PM, same session. Leave the exemption and its test intact; defer to evidence.

The one thing (A) needed to be real: **CUL-663 step 2 was amended.** Its mid-flow switch
path read *"pick type for pet A → back → switch to B → confirm shows B"* — which exercises
the navigation and never the loss, so the sweep this issue is parked on would have returned
nothing either way, in both directions. It now attaches a photo before going back, and says
why it is there.

CUL-683 moved back to `Todo` (parked pending CUL-663) rather than closed — the watch it
depends on has not run. It closes as won't-do if the sweep and the beta produce no report.

## Note on the finding that generalises

Finding 2 is the durable one. *An exemption is only as good as the correction path that
exists beside it* — CUL-612's reasoning was sound while back meant "wrong type", because a
type mistake costs one tap to redo. It stopped being complete when back silently acquired a
second meaning whose mistake is not re-doable at any price. That is not an argument for
guarding back; it is an argument that the missing thing is a correction, and a guard is not
one. Which is why (B) reads as a fix and is not.
