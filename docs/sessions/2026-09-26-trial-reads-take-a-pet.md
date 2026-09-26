# TS-1 — the trial reads take a pet (CUL-1297, CUL-400)

**Date:** 2026-09-26

Step 1 of the Linear project **Diet trial — its own screen**, one of four parallel step-1 sessions (TS-0 CUL-1296, TS-2 CUL-1298, CUL-1292). Shipped via #PR (draft). Nothing an owner sees changes except CUL-400's line.

## What shipped

- **The three trial hooks take a `petId`** (`useDietTrial`, `useTrialFacts`, `useTrialAllowedSet`) and resolve that pet from `pets`, never `activePet` (spec §2 S1, C-9). One loader, keyed by pet (B-421). Every existing caller passes the active pet's id: Home, the Pet tab (the call-site argument only, to stay clear of CUL-1292), Insights, the Foods tab, `FoodPicker`, food detail.
- **`useDietTrial` gains a `status`**: `loading` · `unreadable` · `loaded` · `no_pet` (C-12, S9). A failed cold read is `unreadable`, never a loaded "no trial"; a failed RE-read of a pet that already answered keeps the last good input and stays `loaded`. Backed by an opt-in `rethrowUnreadable` on `loadDietTrialFacts` (the rundown keeps its trial-less fallback).
- **`inputIsForActivePet` → `inputIsForPet`** (PM ruled the rename). B-789's fail-closed semantics are unchanged on Home and Insights, which name the active pet.
- **`/trial-foods` and `/trial-exposures` take `?pet=`** through `hooks/useTrialRoutePet.ts`, falling back to the active pet only when the param is absent. A param naming a pet the account no longer holds reads nothing and renders the spec §4 line (*This pet isn't in your account any more.*), never another pet's trial. The allowed-set screen's writes, its picker, its standing note (now gated on `inputIsForPet`) and its exposures door all take the route's pet.
- **CUL-400, fixed:** `loadTrialAllowedSet` answers a thrown read with a new `unreadable` arm instead of `unknown`, so `/trial-foods` says it couldn't read the list instead of spinning forever. `unknown` stays the hydration lag that resolves on its own.

## Review

`code-reviewer` found one real regression: `decideIntakePrefill` (`lib/intakeFirstMeal.ts`) special-cased `unknown` by name, so the new `unreadable` arm would have fallen through to the recent-meal pre-fill — a topper pre-filled as a trial pet's meal on a failed read. Fixed by switching on the two KNOWN answers (`ready`, `no_trial`) so any future arm fails closed; regression test added and proven by mutation. Two stale comments (rundown, FoodPicker) corrected.

## Verification

- `tsc --noEmit` clean; full jest suite green before the review fix (529 suites); touched suites green after.
- Mutation-checked: the `unreadable` status collapsing to `loading`, the allowed-set hook reading a fixed pet, the loader's throw going back to `unknown`, the route ignoring `?pet=`, the `rethrowUnreadable` opt-in removed, and the intake pre-fill reverting to its `unknown`-only check — each reds at least one test.

## For the next sessions

- **TS-3 (CUL-1299)** is unblocked on merge. `profile.tsx` carries only the two argument edits, so a merge with CUL-1292 is small.
- **TS-4** owns the `no_pet` copy on the trial screen itself, and the *Try again* button (the list screens match the exposures screen: a line, no button).
- **TS-8** may move Get ready's trial read onto `useDietTrial(appointment.pet_id)` now that the hook takes a pet (the rundown comment says so).
