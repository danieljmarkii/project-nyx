# CUL-612 — Undo on the completion cards, and the sheet's discard guard

**Date:** 2026-08-23

PR 3 of the CUL-603 completion chain (`docs/nyx-app-polish-requirements.md` §5, DP-4), shipped via **#710**. Unblocked by CUL-606 (the named card, #703); parallel-safe with CUL-613 and CUL-614, which were not touched.

---

## The scope call, made by the PM at the top of the session

The issue's own text was ambiguous about reach: *"**Undo** on the named card soft-deletes the just-written event"* reads as one card, but the very next sentence — *"a paired dose already logged against an **undone meal** keeps its own row"* — only means anything if meals can be undone too, and §5's R1 bullet names "symptom, weight, capture-path meals/doses" as one register.

Presented as a decision brief rather than resolved silently. **PM ruled option A: all three R1 cards** (named / meal / medication). The reasoning that carried it: the issue's *Why* is "no log path **anywhere** can be reversed in place", and nothing later in the chain would have added the meal/dose half — PR 4 is capture routing, PR 5 is the R2 beats. B would have shipped Undo everywhere except the app's most-used log path.

The cost of A, which was stated up front and then paid: the meal and medication cards are dense (intake chips, two trial registers, the combo line, adherence + vehicle rows), so Undo went into their header row beside Change time rather than getting a footer row of its own.

## What was built

### Undo lives in the store

`momentStore.undo()`, not three copies in three components. Same can't-forget reasoning that put the commit haptic inside `present()` (CUL-604) and the flagged dwell inside `showMeal()`: **a future log path inherits Undo by virtue of showing a card at all**, and the invariants get stated once instead of three times and drifting.

`lib/undoLog.ts` is the reversal itself, and it is deliberately one call — `softDeleteEvent` plus a queued tombstone. The children ride along for free: `meals`, `weight_checks`, `medication_administrations` and `event_attachments` all key on `events(id)` and carry no `deleted_at` of their own, and every read path already filters the parent's. So this is **the same reversal History's Remove performs**, reached from a different surface — not a second delete path with its own semantics. A divergence there would mean a row removed from the card and a row removed from History were different kinds of gone, and only one of them could stay right. Two guard tests pin the negative: the module's executable body may not name a hard delete or a child table, and its import list is asserted verbatim.

### The five rules the card layer had to hold

1. **Undo renders where Change time does not** — a weight check, a two-sided window, a combo dose. Those are precisely the records `canChangeTime` withholds the picker from, i.e. the ones with no other in-place way back. An affordance that disappears on the records that need it most is not a safety net.
2. **The removal line replaces the body, it does not sit beside it.** Intake chips, both trial registers, the combo line, the adherence chips and a standing double-dose note all go with it. Each is a claim about — or an offer to add to — a row that is no longer in the record. The adherence row is the sharpest case: it is the B-156 G1 fail-safe surface, and leaving it live over a removed dose would invite an adherence write against nothing.
3. **No patch lands on a removed card.** `patchTrialFlag` and `patchDoubleDose` arrive on their own from an async read and cannot be stopped by unmounting a control. Without the guard, a trial heads-up resolving just after an Undo would decorate a meal that no longer exists *and* burn that food's one-per-trial ledger budget on a card nobody could act on. The remaining patches are guarded too — an invariant with exceptions is one nobody can check.
4. **A failed write keeps the card intact.** Showing the word "Removed" over a row that is still in the record is the one unrecoverable lie this surface can tell, so the reversal is awaited *before* the UI flips, and a throw restores the dwell and surfaces an alert naming the other way in (History). The synchronous re-entry latch exists precisely because `removed` cannot be set early enough to double as one.
5. **`'ignored'` is not `'failed'`.** A second tap, or a tap on a card already gone, returns a third state that never alerts. An error for a tap that did nothing wrong teaches the owner that Undo is unreliable.

The B-156 G1 fail-safe is untouched throughout: there is no adherence write anywhere in the reversal, so **Undo can only ever reduce what the record claims**. An unanswered card still lands `unconfirmed`.

### The discard guard, and the bug that reshaped it

A backdrop tap on a half-filled confirm sheet destroyed an attached health photo without a word — a photo often taken of the thing itself, at 2am, that exists nowhere else.

The first cut derived dirtiness by comparing **raw inputs** against a baseline captured at mount. That over-fires: `handleModeChange` seeds `foundLatest` on the way through "Found it", so an owner who tapped Found it and then Saw it — changing their mind and changing it back — got a discard dialog over a byte-identical row. Caught by its own test.

The fix reframes the question. Dirty is not "did any input move", it is **"would this write a different row than it would have when the sheet opened?"** — so the comparison is against `tf`, the single derivation that already feeds both the summary pill and the insert. That also buys the property a hand-set flag can't have: six setters is six chances to miss one, and the seventh picker someone adds next year would ship un-guarded and silently discard the window it edits. Comparing the *output* covers any future control for free.

**The back chevron stays unguarded**, deliberately. "Wrong type, take me back to the grid" is a labelled in-flow choice; the guard is for gestures that are easy to hit by accident (backdrop, Android hardware back). Named in the code and pinned by a test rather than left as an omission someone would later read as a miss.

## Copy

Ran through the `nyx-voice` skill. The removal line is a deliberate **mirror** of what it replaces — `Saved to {pet}'s record` → `Removed` / `Taken out of {pet}'s record` — so the owner reads the undo as the exact inverse of the thing they just saw, not as a new kind of message.

Two things it will not say, both tested: it never claims *nothing was written* (a dose logged through the meal card's combo line keeps its own row when the meal is undone, so "nothing was saved" would be false on the one path where it matters most — a medication), and it never congratulates or reassures. Removing a symptom log is a correction, not good news.

The discard alert names what is at stake rather than saying "your changes" — `The photo won't be saved.` / `The photo, the time you set and the note won't be saved.` Specific-over-generic, and here it does real work: an owner who tapped the backdrop by accident needs to know in one glance whether the photo is the thing about to go.

## A small visual change, stated rather than slipped in

`styles.action` drops from `textMD` to `textSM` on the meal and medication cards. At `textMD` the two-button cluster left a long food name roughly 110pt to render in, which truncated the one thing the card exists to name. It also brings those two into line with the named card's action scale, so the R1 presentations now agree: the sentence leads, the controls sit under it.

## Found and filed, not folded in

**CUL-626** — `MedicationCompletionCard` resolves `petName` from the *active* pet, not the dose's, unlike its two siblings. Log a dose for one pet, switch before the 5s card dismisses, and the card asks whether the other pet still got it. Same class as CUL-574. The new removal line resolves the payload's pet correctly; the rest was left alone rather than widened into this PR, and the scoping is noted inline on the card so the inconsistency reads as deliberate.

## Verification

`tsc --noEmit` clean. 255 suites / 5643 tests green, including all three non-UTC CI timezones (UTC+14, UTC+12:45, UTC−10). No schema, no Edge Function, no flag — client-only, and the track's §8 rule says chrome/typography replaces surfaces outright rather than shipping behind the B-712 two-gate ceremony.

One coupling cost worth recording: `momentStore` now reaches `lib/sync` → `lib/supabase` transitively, which throws at import time without env. Only `store/momentStore.test.ts` was affected (the three card suites already mock `lib/sync`); it mocks `lib/undoLog` at the module boundary, which is also what makes the reversal assertable.
