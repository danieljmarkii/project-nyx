# Out of beta, step 5: one door, one confirm

**Date:** 2026-09-23 · **Issues:** CUL-503 (the bare `/log` doors), CUL-504 (the FAB quick taps) · shipped via #892
**Project:** Out of beta — the log sheet, more event types, vet visits (P-CUL-16), milestone 1

---

## What this was

Step 5 of the *Out of beta* run order, the "one door, one confirm" follow-up that CUL-960 brief 3 ruled into its own PR before the 1.2.0 cut. It became buildable when CUL-962 merged as #891 (`69220bd`) at 00:29 UTC, so no flag branch was left and every door could simply open the sheet. Both issues ran in one BUILD session and one PR because they share `FAB.tsx` and `EventTypeSheet.tsx` and need the same new machinery (a way for any screen to open the sheet, and a way to open it at a given type).

The plan went to CUL-503 as a plan-gate comment and the PM said "go".

## The re-verified door map

The issue said four doors at `:124`, `:180`, `:106` and `after.tsx:695`. A grep on `main` found:

- **Three real "open the picker" doors:** the Home nudge (`TodayZone.tsx:124`), Ask's empty record (`ask.tsx:180`) and the day summary's zero-log CTA (`day-summary.tsx:106`).
- **The fourth was not a picker door.** `app/vet-visits/after.tsx:800` (it had drifted from `:695`) is the *Log a meal for {pet}* button inside `StartTrialModal`, and its twin on the Pet tab (`profile.tsx:1859`) has always pushed `/log?type=meal`. Sending it to the sheet would have landed an owner who asked to log a meal on a grid of every event type, and would have presented a Modal while `StartTrialModal` was still dismissing (the CUL-662 class). **PM ruling (kickoff, 2026-09-23): (a), route it to the meal logger.**
- **A fifth door the issue did not know about:** the Home Screen widget's log chip deep-links `nyx:///log?pet=…`. A deep link needs a route to land on, so it stays on the full-screen picker. Filed as **CUL-1095**. It also means nothing in `app/log.tsx` is dead yet.
- **The FAB quick taps** were at `FAB.tsx:361` / `:369`, having drifted from `:399` / `:407`.

## What shipped

- **One sheet, one mount.** `EventTypeSheet` moved out of `FAB.tsx` into `components/log/LogSheetHost.tsx`, mounted once in `app/_layout.tsx` beside `IntakeDoorHost`. Doors open it through `useUiStore().openLogSheet(initialType?)`, following the `IntakeDoorRequest` precedent already in `store/uiStore.ts` rather than the issue's suggested "tiny logSheetStore". There were two reasons for the root mount and the request:
  - **Presentation:** Ask and the day summary are root stack screens pushed over the tabs.
  - **Home's import closure:** `TodayZone` must never import a component that writes rows, and `guards/homeWrites.test.ts` enforces it.
- **`initialType`** on the sheet, typed `LogSheetConfirmType` (every in-sheet type, excluding meal / medication / weight_check / check_in). The FAB's Vomit and Loose stool open straight at their confirm. Back goes to the grid, which matches the old `/log?type=vomit` flow's back.
- **The four doors re-pointed.** More events, the nudge, Ask and the day summary call `openLogSheet()`. The quick taps call `openLogSheet('vomit' | 'diarrhea')`. The vet visit button pushes `/log?type=meal`.

## What broke, and the shape that replaced it

The first build applied `initialType` as a setState during render on the open's rising edge (the React "adjust state on prop change" pattern). Every direct render test passed. The integration test through the real host failed: the sheet opened at the grid.

Traced by instrumenting `setStage`:
- The sheet is mounted closed first.
- Its reset effect runs at mount and calls `setStage('grid')` and friends with the values they already hold.
- React eagerly bails those out, but still enqueues them, in another lane.
- When the store opens the sheet (a sync-lane render via `useSyncExternalStore`), the render-phase `setStage('confirm')` applies first. The deferred `'grid'` is then replayed after it, and `'grid'` wins.

`wasVisible` survived because nothing had queued an earlier update on that hook. So the owner who tapped Vomit would have landed on the grid in the real app. The direct renders could not see it, because a sheet mounted open never runs the reset effect's queued no-ops.

**The fix removes update ordering altogether:**
- `initialType` is read in the state **initialisers**.
- The host **keys the sheet on an open count** (`logSheetOpens`), so every open mounts a fresh instance.
- A close keeps the instance, so the Modal still slides out.

`LogSheetHost.test.tsx` pins both halves of that lifecycle.

## Verification

- `tsc --noEmit` is clean.
- Full `jest --ci`: 443 suites, 9,685 tests (+2 suites, +19 tests on #891).
- The touched suites are green under `Pacific/Kiritimati`, `Pacific/Chatham` and `Pacific/Honolulu`.
- The named guards (`homeWrites`, `completionCard`, `haptics`, `geistRollout`, `recordPetName`, `symptomLists`, `reversePath`) are green and untouched.

**Mutation proofs** (each run, red, then restored)
- **Doors:** each of the seven, put back to its old push, reds its own test (TodayZone, day summary, Ask, the vet visit door, FAB Vomit / Loose stool / More events).
- **Sheet:** the stage decided in an effect instead of the initialisers reds the grid-render counter (three tests). The counter is a pass-through wrapper around the real `GroupedEventGrid`, because "the grid never rendered" cannot be read off the tree after the fact.
- **Host:** no per-open key reds three tests; a key that also moves on close reds two.
- **Home guard:** `TodayZone` importing the sheet reds `homeWrites`.

**Reviews**
- **`code-reviewer`: ship-ready**, with no bugs and no anti-patterns. It independently reproduced the render-phase race on a scratch copy. Three nits:
  - A stray blank line in `FAB.tsx`: fixed.
  - A `trial-foods.tsx` comment that says the FAB "owns" the log room: left as is, because it is still true in the sense it means and is outside the diff.
  - A historical CUL-717 paragraph in `FAB.tsx`: checked and fine.
- **Adversarial: N/A.** There is no detection, threshold or escalation logic, and the same `SimpleEventConfirm` → `insertSimpleEvent` writes the same row from every door.
- **The one thing jest cannot prove:** that the root-mounted Modal presents over the pushed Ask and day summary screens on iOS. It is in the PR's Runtime B steps, and on CUL-556 for the GA build sitting.

## Residuals

- **CUL-1095 (Low).** The widget's log chip still opens the full-screen picker. When it moves, `app/log.tsx`'s `type` and `simple` steps become deletable.
- **Home's meal nudge.** *No meals logged yet — did {pet} eat?* opens the sheet like the general nudge. Raised to the PM as a one-line change if wanted, not changed.
- **A convention candidate, not written into CLAUDE.md.** "A component whose starting state depends on how it was opened reads it at mount, and its host keys it per open; never a setState during render off a prop edge." It is proposed in the session summary; CLAUDE.md is under a byte ratchet, so a new rule there costs a deletion.
