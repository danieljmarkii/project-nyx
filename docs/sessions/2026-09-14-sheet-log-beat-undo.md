# The sheet's completion beat gains Undo — and stops being the one register that owns its own clock

**Date:** 2026-09-14

Shipped via #848. CUL-964, one PR, Design Polish DP-4. PM-ruled at the plan gate: build it, before the 1.2.0 cut (CUL-559), and keep the dwell at 1800ms — a ruling the sibling CUL-960 session recorded independently the same hour (*"Before the cut — already in flight"*, #847), from the other side of the GA plan.

## What the defect actually was

`components/log/SheetLogBeat.tsx` was the R2 register — the mint check that lands inside the log sheet after a symptom, stool or Other commit — and it carried no way back. `BEAT_MS = 1800`, then `onDone`, then the sheet closed. The R1 named card has carried Undo since CUL-612 and states the rule in its own header: *"Undo renders UNCONDITIONALLY … an affordance that disappears on the records that need it most is not a safety net."*

The reason this was worth doing before the store build rather than after is the word **default**. Flag-off, a symptom goes through the full-screen `/log` flow and lands on the named card, which has Undo. At GA (CUL-960 / CUL-962) the sheet becomes the path every owner takes, so the app was about to lose the affordance on the one flow that matters most — and `app/edit-event.tsx` cannot change a row's `event_type`, so a mis-tapped split-Stool segment (Normal where Loose was meant — the clinical distinction `EventTypePicker` spends fifteen lines of hit-area reasoning to protect) was not editable at all. It was Remove-and-re-log, through History, on the row you had to find first.

This was a design gap the polish spec's own rule exposed rather than a regression: §5 specified R2 as *"inherits the sentence"*, and Undo was written into R1's line only. The `pm-feature-review` GA read found it on 2026-09-13.

## What shipped

**The beat is a presentation of `momentStore` now, and that is the whole change.** Everything else follows from it.

The tempting fix is to give the component a soft-delete and a button. It is wrong for a reason the codebase already had a name for: `momentStore.undo()` is the single route to `reverseLoggedEvent` (C-20, enforced by `guards/reversePath.test.ts`), and it refuses on `!payload` — so reaching the one shared reversal means *being* a presentation of that store, not a component that reimplements one. The precedent was three weeks old: `showLook` (CUL-871) is a payload that no root card paints, with `LookCard` rendering off `payload` + `removed`, and C-33 states the rule it established — *a completion beat painted IN a surface still routes through the register; what varies is who paints it, never who owns the reversal.*

So `SheetBeatPayload` is the fifth payload kind, `showSheetBeat` the fifth presentation, and no root card gates on it (they cannot: every card in `components/ui/` mounts at the app root, which renders *under* the sheet's `<Modal>` — the original reason this beat exists as a separate component at all).

What that bought, beyond the Undo:

- **The dwell clock.** The component's own `setTimeout` is deleted. The register arms `SHEET_BEAT_DWELL_MS`, and the beat's only relationship with time is telling its host when the register dismissed it. Two timers for one surface is the exact bug `armHide`'s header documents at length.
- **The touch pause.** §5's dwell rule now applies here for free — the clock stops while a finger is on the beat, and the release hands back a full interactive window. This is what makes 1800ms defensible with a control on the surface (below).
- **The staleness guard.** `undo()` refuses an id that is no longer the payload on screen.
- **The §5.6 commit haptic.** The beat used to play its own tone split in a mount effect. Its own test file's header called that out as the risk — *"a duplicated safety rule with a test on only one of its two implementations is how the two drift"* — and the fix was to delete the second implementation, not to test it harder. `playCommitHaptic` now covers both tone-bearing payloads.

**The dwell stayed at 1800ms, and that was a decision, not an omission.** The three bottom cards run 5s because their scrim is `pointerEvents="none"` and Home stays live underneath: the dwell is sized by what there is to do. This beat is inside a Modal — it holds the owner's screen — so it keeps the ≤2s earned-moment cap, and an owner who wants longer *touches it*, which is what the pause is for. The escape was already there and is what makes the trade honest: a scrim tap closes the sheet at any point during the beat. Recorded as the §5 dwell exception rather than left as a number someone will later "fix" for consistency.

**The confirm gate is shared now.** `undoGateCopy` moved out of `NamedCompletionCard` into `lib/completionCard`, where the removal line it leads to already lives. Two registers raising the same dialog meant two copies of a safety string to keep in step. It also turned up a real gap: the sheet confirm is the **one path in the app that can produce both a photo and a note on the same screen**, which is precisely the composed-not-branched case CUL-869 wrote the composition for and no shipped surface had yet exercised. `SimpleEventConfirm` now reports `hasNote` up alongside `hasAttachment`, on the same `notes.trim()` the write used — a gate that named a note the row does not hold teaches the owner to distrust the dialog, and one that missed a real note destroys her sentence without a word.

**G5 travels with the dismissal.** CUL-802 lands a photographed vomit/stool on its own record after the beat. An owner who reverses that log would have been handed the record of a row she just removed, with a per-incident read arriving over it. `onDone` now reports whether the reversal happened, rather than the host re-reading a register that has already moved on.

## Four things the build got wrong first

**The staleness test was measuring the wrong guard.** The 15-mutant pass caught 14. The survivor was dropping the event-id half of the component's `mine` check — and it survived because the test that was supposed to cover it pressed Undo and asserted no reversal, which is true either way: the *store's* guard rejects the stale id, so the component's copy was never load-bearing in that scenario. The defect the component's half actually prevents is different and worse: `removed` is a flag on the register, not on a payload, so a beat reading it without checking whose removal it describes paints the removal line over a log that is still saved — the one unrecoverable lie a completion surface can tell. Retargeted at that, the mutant dies. The generalisable bit: **when two layers guard the same thing, a test that passes through both is proving the outer one.** Name the consequence only the inner one has.

**The pause and the dialog fought, and the pause lost.** Wiring the touch pause at the root is right, and adding a confirm dialog is right, and this beat is the first surface in the app to have both — which turned out to matter. The owner's finger lifts the instant the dialog appears, so `onTouchEnd → resumeDwell` handed back a full 5s window and the beat would dismiss out from under a dialog she was still reading; `undo()` then refuses on `!visible`, returns `'ignored'`, and the log survives a removal she explicitly authorised. That is precisely the failure `pauseDwell` was added to the gate to prevent, walked back in through the door the pause itself opened. The release is conditional now: while the dialog is up the gesture is not over, and the buttons own the release. The named card never had to say this because it never wired the touch pause at all — **a rule two components each satisfy can still fail in the component that is the first to hold both.**

A mutant on that fix survived the first pass, too, and its shape is the useful part: making `releaseGate` skip clearing its flag left the "Keep it" test green, because cancelling re-arms the clock directly. The stale flag is invisible until the *next* gesture, where it swallows the release. A test for a flag has to outlive the branch that sets it.

**The `armed` latch had no test, and the `code-reviewer` proved it by deleting the line.** All 21 tests stayed green without it — because every one of them went through a helper that shows the payload *before* rendering, which is the host's ordering and therefore the only ordering the suite ever produced. The latch exists for the opposite ordering, where the dismissal watcher cannot tell "the register is done with me" from "the register never took me" and fires `onDone` on the first frame, closing the sheet before a word is read. A test driven the wrong way round kills it, and a second mutant (setting the latch unconditionally) kills the condition too. **A helper that encodes the happy path makes every test in the file blind to the same thing** — the C-35 fixture lesson, arriving through a helper instead of a fixture.

The same review flagged that `handleBeatDone` lacked the liveness guard its sibling `handleLogged` carries. It is masked today by React's batching — the dismissal unmounts the beat in the commit that resets the sheet — but "masked by scheduler behaviour nobody asserts" is not a guarantee, and the cost of being wrong is a `router.push` landing after the owner has left. Guard added, with its blind spot stated in the file rather than left to read as coverage (C-41).

**The suite left a live timer.** Committing now arms a real dwell in `EventTypeSheet.test.tsx`, and the first cleanup hook was scoped to the first `describe` — while the taxonomy-expansion block commits too. Jest said so ("did not exit"), and the check that made it obvious was running the suite at HEAD first to confirm the warning was mine. A file-scoped hook, not a describe-scoped one.

The `code-reviewer` pass is what caught the first two of those four, and the shape is worth keeping: both were **invariants with no coverage rather than broken code**. Nothing it found was failing — the handshake traces correctly on every reachable path today — which is exactly the class a build conversation is too anchored to see, and exactly what the mutation bar is for.

## Not in scope, and stated

Change time on the beat (the R1 picker is a second decision) and the FAB quick-tap routing (CUL-504). Neither was folded in.

No CLAUDE.md change: C-33 already carries this rule verbatim, and this PR is the second thing to obey it rather than a new convention.

## Verification

- 8,238 tests, 381 suites, green. `tsc --noEmit` clean. All 21 guards green with no new exemption — in particular `guards/reversePath.test.ts` (the reversal has one route), `guards/completionCard.test.ts`, `guards/homeWrites.test.ts` (no new write reaches Home's closure — the reversal's existing `home-write-ok` marker in the store covers it and nothing else moved), `guards/geistRollout.test.ts`, `guards/haptics.test.ts`.
- **19 mutants, 19 caught**, listed on the PR: the control deleted, the register bypassed, the gate removed, the touch handlers dropped, the haptic re-added, Undo left live over the removal line, the id check dropped, the removed-flag flattened, the host's G5 skip removed, the commit not handed to the register, the register not handed back on dismiss, the dwell raised to 5s, the tone split narrowed, both halves of the note trim, the dialog's pause released by the finger lift, the gate flag left stuck, the `armed` latch deleted, and the latch set unconditionally.
