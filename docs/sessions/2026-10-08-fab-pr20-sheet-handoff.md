# FAB PR-20: the hand-off to the log sheet, one veil, one physics, one name (CUL-1642)

**Date:** 2026-10-08
**One thing:** none — dispatched session, not this round's teach row

Shipped via #1108. Dispatched by `/dispatch` (The FAB, round 2, Wave 3), branch `claude/fab-pr20-10080146`.

## What shipped

- `components/motion/sheetMotion.ts` (new, C-30): `useSheetMotion`, the rise and the way out for a bottom sheet inside an RN Modal presented with `animationType="none"`. The rise is `FLIGHT_SPRING` (the fold's ζ 0.7, 2 % settle at 370ms) with `overshootClamping`, because a bottom-anchored sheet that overshoots upward bares the screen edge beneath its foot. The way out is the fold's `leaveMs`, eased in. Reduce Motion is a crossfade both ways, nothing travels (CUL-1178, for this sheet). Nothing moves before the Modal's `onShow`; a 400ms fallback starts it for a Modal that never reports. A blur finishes. `onExited` fires a commit after the Modal's `visible` has gone false.
- `components/log/EventTypeSheet.tsx`: the Modal goes `none`; the scrim and the sheet are Animated views on the hook. The scrim is hidden, not unmounted, while the switcher layer is up (a native animation started on an unmounted node threw in the test, which is the device crash it stands for). No touch during the exit. Title: a "Logging for" eyebrow over the pet's name, which wraps and never truncates; labels "Logging for {name}" / "… — switch pet" (nyx-voice pass: names the pet, no exclamation, the chip's words).
- `components/log/LogSheetHost.tsx`: the exiting phase. A new open waits for the old sheet's `onExited` before the key moves, so one Modal goes down before the next is presented and never in the same commit (C-14; closes CUL-1472's race by construction).
- `components/log/FAB.tsx`: the veil is its own Animated value, apart from the Reduce Motion fade. More events and the two symptom pills hand off: the store open carries `veil: 'handed'`, the fan retracts beneath a veil that stays at full, and the veil drops when the store says the sheet has its own (`logSheetVeilTaken`) or the sheet went down first. A refused open (a sheet already up) gets the plain close.
- `store/uiStore.ts`: `LogSheetRequest.veil`, `openLogSheet` returns whether it opened, `logSheetVeilTaken` / `takeLogSheetVeil`.
- `constants/theme.ts`: `colorScrimNight` deleted; the fan wears `colorScrim` (D2). The contrast row for the disc over its scrim now reads `colorScrim`.

## Decisions

- **Clamped spring.** The issue asked for the app's settle; the settle's 4 % overshoot on a ~500pt sheet lifts its foot ~20pt off the screen bottom. Clamping keeps the curve up to the first arrival and drops the bounce. Motion & IA lens; reversible in one line if the device read wants the settle back with a hidden extension under the sheet.
- **The veil swap happens on `onShow`, not at mount.** At mount the sheet's window may not be up yet, so dropping the fan's veil then would show Home undimmed for a frame.
- **A new open waits rather than fast-forwarding the exit.** The wait is at most 180ms (150ms under Reduce Motion), and the fan's veil stays up across it.

## Verification

- `tsc --noEmit` clean; full jest suite green (612 suites) after updating the assertions the new request shape and title changed (`app/ask.test.tsx`, `app/day-summary.test.tsx`, `lib/session.test.ts`, the sheet's title tests).
- Mutations: `retract(true)` → `retract(false)` in the hand-off reds four FAB tests; dropping the host's wait reds the CUL-1472 guard.
- C-14: exactly one Modal open and closed, switcher up or down (`EventTypeSheet.test.tsx`). Reduce Motion crossfade pinned in `sheetMotion.test.ts` and `EventTypeSheet.test.tsx`.
- `code-reviewer`: ship-ready. Two device-pass items: an `onShow` later than 400ms on a cold first open could drop the fan's veil a frame early, and a sheet closed before it was shown cuts the fan's veil rather than fading it.
- No clinical or statistical logic changed: adversarial review N/A.

## Residuals

- The phone read (does the hand-off read as one surface, with Reduce Motion on too) is the issue's `Gate: device`, for the next TestFlight sitting.
- The other twenty-one sheets on CUL-1178 can adopt `useSheetMotion`; noted on CUL-1178.
