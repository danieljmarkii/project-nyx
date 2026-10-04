# History v2 — a failed record read says so on the sheets (PR-39b, CUL-1238)

**Date:** 2026-10-04
**One thing:** T1 L1 — History reads the phone's own copy, so a failed read is rare and must never pass for an empty one · check: pending

Dispatched session (Out of beta — Noticed, Design v2, History v2, the trial screen, PR-39b). Shipped via #1062.

## What shipped

- **The gap (CUL-1238).** When the record read behind History v2 failed, the list said *Couldn't load history*, but the pinned row's two sheets shrank in silence: the window sheet dropped *Since the trial started* and *Since the last vet visit*, and the type sheet lost every count and every medicine course. An owner could read the missing trial row as "there is no trial", which is the exact misreading the read throws to prevent.
- **Mock first.** §15 on `docs/culprit-history-v2-mockups.html`, beside §14 (as built vs current, both sheets) plus a ledger row; republished to the same artifact URL (version 14).
- **`components/ui/ScopeMenu.tsx`** gains an optional `notice` slot: one line and one action, under the sheet label in the caption's place. Absent, the sheet is byte-for-byte the old one. The action is a button at the 44pt floor by its box, no slop into the first row (C-5).
- **`lib/historyControls.ts`** carries the copy in §3.12's voice. Neither line claims a trial or a visit exists, since the read that would know is the one that failed.
- **`PinnedRow`** hands both sheets the notice on `useHistoryRecordFacts()`'s `error` state (a required prop, no default: C-37). *Try again* calls the list store's `load` for the pet, scope and day on screen with a fresh record read, which is the one shared read CUL-1228 built (#1049), so the list behind and both pills recover in the same store update. The sheet stays open and fills in. A read merely in flight says nothing.

## Proof

- `PinnedRow.test.tsx` § *a failed read is said on the sheets*: both sheets' lines, loading silent, and the retry calling one shared load with `reuseRecord` unset, after which the sheet is still open, the line gone and the trial row back. The stand-in hook now re-reads when the stand-in load runs, so "fills in" is driven, not asserted.
- `ScopeMenu.test.tsx` § notice: drawn in the caption's place, action runs without closing or selecting, 44pt with no slop, absent = old sheet.
- Mutation: forcing `failed = false` reds two tests; passing `reuseRecord: true` reds the retry test.
- `tsc --noEmit` clean; touched suites 240/240; guards + stores 1,197/1,197; pre-push full suite green.

## Decisions (team calls, logged on CUL-1238)

- Loading draws no notice: a wait is not a failure, and the notice would flash on every first open.
- On a failed read with a search open, the notice wins over search's caption: the failure is the bigger fact.
- The retry keeps the sheet open rather than closing it, so the owner sees the rows arrive where they asked.

## Residuals

- §3.12 of the spec has no row for the sheets' failed state; a one-line Tier-2 addition is proposed on CUL-1238.
- The notice reappearing after a second failure is not announced to VoiceOver (the sheet's content changes under focus). Acceptable for a rare path; noted on the issue.

## Teach

The History screen does not ask the internet for Nyx's record. It reads the copy that already lives on the phone, in a small database the app keeps (this is what "local-first" means: the phone's copy is the one the screen trusts, and syncing to the cloud happens behind it). That is why History works in airplane mode, and why a failed read is rare: it is not a dropped connection, it is something like the database being briefly locked by another part of the app. Rare is not never, so the screen has to tell three answers apart: *still reading*, *read and found nothing*, and *could not read*. Today's change fixed a place where the third one looked like the second: the date menu quietly lost its trial row, which reads as "there is no trial". Now it says it could not read the record and offers Try again.

Check: if an owner opens History with the phone in airplane mode, should they see *Couldn't load history*? Why or why not?
