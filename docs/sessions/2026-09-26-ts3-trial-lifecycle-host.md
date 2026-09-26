# TS-3: the trial's lifecycle host leaves the Pet tab

**Date:** 2026-09-26

Shipped via #PR (CUL-1299). Step 1b of the Linear project **Diet trial — its own screen**, after TS-1 (#942). Blocks TS-4 (CUL-1300).

## The ask

Move the trial card's lifecycle wiring out of `app/(tabs)/profile.tsx` so the trial's own screen can carry the same buttons (spec `docs/nyx-trial-screen-requirements.md` §2 S6 / S8, §3.9, §7 "The lifecycle host"), byte-identical. The plan was posted in session and the PM said go.

## What changed

- **`hooks/useTrialLifecycle.ts`** (new). The Keep going write (`extendTrial`), the window write (`changeTrialWindow`), both `TrialWindowRefused` branches, the completion and Manage state, the derived `sheetTrial` / `sheetDayCounter` / `windowSheetTrial`, and the Replace one-shot ref (C-22). Moved with their comments, not rewritten. It takes `{ petId, input, reload }`: the host's own `useDietTrial` result, because that hook keeps per-instance state and calling it again would be a second loader (B-421). The pet is resolved from `petId` (C-9), so on the trial screen the refusal line and the sheets name the route's pet; on the Pet tab that is the active pet, as before.
- **`components/trial/TrialLifecycleSheets.tsx`** (new). Draws `TrialCompletionSheet` and `TrialManageSheet` from the hook. Replace is the host's call (`onReplaceTrial`, run once the door has dismissed), because `StartTrialModal` stays on the Pet tab (B-535's resume; `food-capture` exits with `router.dismissAll()`).
- **`app/(tabs)/profile.tsx`**: about 260 lines out, the hook and the host in. The params block, the focus and anchor code and `StartTrialModal` are untouched.
- **Guards that followed the code.** `guards/trialWindow.test.ts` half (c), "the decision sheet is reachable from exactly one place", scanned the Pet tab alone; the state now lives in the hook, so a Pet-tab-only scan would stay green when TS-4 grows a second opener. It now scans every non-test source under `app/`, `components/`, `hooks/` and `lib/` (derived from the repo, C-38) for either spelling of the literal open, and still requires exactly one, on the card's `milestone:` line; the variable-argument blind spot is stated. `guards/dietTrialProvenance.test.ts`: the `vetDirected` pass-through moved, so the registry entry moved from `profile.tsx` to the hook (the "not a parking space" test would have failed on the stale one).

## Proofs

- **Refactor safety.** `app/(tabs)/profile.trialLifecycle.test.tsx` (18 tests) was written against the inline code, run green there, and is green after the move: Keep going (the write, busy state and double-tap, refusal re-reads with no alert, a real failure alerts), the three completion entries over the card's own trial, Stopped early's re-read and close, the decision sheet's Keep going, the Manage door from both entry points, the window save (`vetDirected: false` stays false), a trial ended elsewhere (`not_running`: re-read, sheet stays open, *Mochi’s trial has ended, so its window cannot change.*), a real window failure, Replace armed then presented only on dismissal and only once, and one Modal at a time with each sheet open and with both closed (C-14). The sheets are the real components under a prop spy, so the Modal count is over real Modals.
- **The tree unchanged.** The Pet tab's `toJSON()` was captured before the move in six states (closed, each completion entry, Manage open, after a save) and compared after: byte-identical in all six. The states differ from one another, so the comparison is not vacuous, and a mutation (a changed pet name in the host) makes it differ. A one-time proof, not a committed `.snap` (C-36).
- **C-9.** `hooks/useTrialLifecycle.test.ts`, a two-pet fixture with Luna active and Mochi's trial handed in: the sheets and the refusal line name Mochi; a pet the account does not hold draws nothing. Mutating the hook to read `activePet` reds all three.
- **Guard mutation.** A second `openCompletion('decision')` planted in the host reds half (c).

## Found, filed, not folded in

**CUL-1329.** `endActiveTrial` has no `status = 'active'` predicate and no `changes === 0` check, so *This trial is done* or *Stopped early* tapped on a stale card rewrites the ending of a trial another device already ended. The extend and window writes refuse in that case since CUL-1039; the ending path never got the clamp. TS-3 keeps the ending path byte-identical; better landed before TS-4 puts these buttons on a second surface.

## Checks

`tsc --noEmit` clean; full `jest` 536 suites / 12,062 tests green; the three touched suites green under `Pacific/Kiritimati`, `Pacific/Chatham` and `Pacific/Honolulu`.

## Next

TS-4 (CUL-1300) mounts `useTrialLifecycle` + `TrialLifecycleSheets` on `/trial/[pet]` with the route's pet, and supplies its own `onReplaceTrial`: navigate to the Pet tab with a one-shot request (C-22) that opens the start form there (§3.9). Its milestone opener reds `guards/trialWindow.test.ts` half (c) by design, and it has to say there what it did about the window. It should also gate the host on `inputIsForPet` / the loaded status, which the Pet tab never needed.
