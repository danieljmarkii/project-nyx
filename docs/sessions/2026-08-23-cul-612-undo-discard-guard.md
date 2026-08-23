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

## The review passes, and what they broke

Three isolated reviewers ran against the first commit. **All three returned findings, and five defects were real enough to fix in-session.** The value was concentrated in exactly the place isolation is supposed to help: every one of them was a *second consumer* the build conversation had stopped thinking about.

### 1. An orphaned hide timer killed the *next* card (adversarial)

The worst of the six, and invisible without a probe. `undo()` armed its removal dwell with a bare `setTimeout` and did not clear first — so a chip tap landing during the write left two live timers. The earlier fired, ran `hideTimer = null`, and thereby dropped the module's only handle on the later one; `present()`'s `clearTimers()` then found null and could not cancel it. A stray hide from the dead card killed a **brand-new** card about a second after the owner logged it. And because the orphan was a raw `setTimeout`, it bypassed the `MEDICATION_FLAGGED_DURATION_MS` floor — so the card it killed could be one carrying an unread double-dose note.

Fixed structurally with `armHide()`, now the only way this module schedules a hide: clears first, and nulls the handle only if it is still its own. The file's own comment at the `rescheduleHide` floor was written to close this defect class in a different shape; the new path reopened it.

### 2. The Profile compliance tally kept counting a removed dose (adversarial)

Two taps, one screen, no race. "Log a dose" bumps the tally optimistically, the card opens over the same Profile, Undo removes the dose — and nothing decrements, because `loadMedications` is focus-driven and the owner never blurs the tab. Offline, never. A compliance claim the record no longer supports, in the reassuring direction, which contradicts this PR's own invariant that removing a dose can only reduce what the record claims. True of the record; was false of that surface. `removeFromToday` was the right instinct — the regimen tally was the second consumer nobody told.

### 3. The trial heads-up ledger was spent by a feeding that Undo reversed (adversarial)

Rule 3 gives each food one heads-up per trial, written at render time so a suppressed panel cannot consume a budget it never spent. Undo opened the mirror image — and not as an edge case. **The amber "Off the trial list" panel is itself the cue that prompts the Undo**: the owner reads it, realises they tapped the wrong tile, reverses. The food was then marked spoken-for on a feeding that never happened, and the real feeding on day 20 of a 56-day elimination trial would meet silence. New `forgetFlaggedFoodInTrial` gives it back. The commit had guarded the flag arriving *after* Undo and missed the far more common before case.

### 4. Undo and Change time had overlapping touch targets (code review)

8pt gap, symmetric 12pt `hitSlop` — the expanded rectangles crossed and z-order picked the winner. Tolerable between two corrections; not here, because Undo has no confirming dialog, so a mistouch aimed at Change time silently removed the log. Fixed with **asymmetric** `hitSlop`: each control keeps its vertical and outward reach (which is what carries the 44pt floor alongside `minHeight`) and yields only the edge facing its neighbour. No layout width spent, which matters on the meal card.

### 5. `undo()` deleted the store's *current* payload (access-control red-team)

Not the eventId the card rendered — the only unguarded action in a store where `patchTrialFlag` and `patchDoubleDose` both carry an id for exactly this reason. `present()` swaps the payload in place, so a second log completing between the paint and the touch-up would have deleted the row that replaced it. Narrow window, irreversible action. It now takes the id and refuses a stale one.

### What held, and on what check

The red-team confirmed the boundaries the feature actually rests on: a cross-account upsert is denied because `events_owner`'s `USING` doubles as its `WITH CHECK`; queue-then-switch holds because the reversal targets an id minted at insert; 20+ read paths — including `generate-report`, `analyze-*`, `ask`, the widget snapshot and the direct `/event/[id]` route — all filter the parent's `deleted_at`; an offline undo survives a pull via the `synced = 1` backstop. The adversarial pass confirmed the B-156 G1 fail-safe holds **structurally rather than incidentally** — no adherence write exists anywhere in the reversal — and that both directions of the paired-dose join behave.

### One finding that did not survive checking

Code review suggested pruning `lib/completionCard.test.ts`'s supabase/sync mocks as vestigial. They are not: `completionCard` imports `weight`, which imports `supabase`. Reverted after watching the suite fail — worth recording, because a plausible cleanup that a reviewer asserts is safe is exactly the kind of thing that gets applied without checking.

## Filed rather than folded in

Four more findings were real but out of scope, each with the evidence and a named fix shape:

- **CUL-639** — a retracted health photo still uploads to Storage *after* the removal and is never deleted (`lib/simpleEvent.ts`'s detached IIFE; `syncPendingAttachments` has no parent join). Pre-existing on all three delete paths; Undo makes the window the common case rather than a rarity. Retention, not a leak — the object stays owner-scoped and unrendered, and `delete-account` still purges it.
- **CUL-640** — a quarantined tombstone leaves the event live server-side, and the SyncBanner tells the owner to recover it "from History", where a soft-deleted row is filtered out.
- **CUL-641** — undoing a weight leaves `pets.weight_kg` on the deleted reading, so the Profile chip and the next weigh-in's pre-fill keep offering the number the owner just retracted. Same mechanism as History Remove, but Undo is the affordance the spec built to catch a fat-fingered weight. Carries a three-way decision brief; deliberately not fixed per-path.
- **CUL-642** — no delete path invalidates the Signal cache, and the 5s regen debounce is the same number as the card's dwell, so the two race.

And one **design decision routed to the PM** rather than taken: **CUL-645** — Undo is now the only destructive action in the app without a Cancel, and the same photo the discard guard protects with a dialog thirty seconds earlier can be destroyed by one unconfirmed tap once it is attached to a committed event. The reviewer was explicit that this is a Designer/PM call; the brief carries four options with B (conditional confirm when an attachment is present) recommended.

## Verification

`tsc --noEmit` clean. 255 suites / 5643 tests green, including all three non-UTC CI timezones (UTC+14, UTC+12:45, UTC−10). No schema, no Edge Function, no flag — client-only, and the track's §8 rule says chrome/typography replaces surfaces outright rather than shipping behind the B-712 two-gate ceremony.

The Profile tally rollback is the one piece of new logic without a test: `app/(tabs)/profile.tsx` has no suite, and standing one up for a screen that pulls supabase, storage and five stores is out of proportion to ten lines of wiring. The store-side signal it reads (`removed` + `payload.eventId`) is fully covered. `tests: N/A — screen wiring; the store signal it reads is tested` (Engineer exemption).

Merged `origin/main` before shipping — three sibling sessions landed while this ran (CUL-599 glyph guards, **CUL-613 capture paths**, CUL-600 Home header). No file overlap, but CUL-613 is PR 4 of this same chain and added `guards/completionCard.test.ts` over the surface this PR rewrote; it passes against these changes. Post-merge: 259 suites / 5728 tests green.

**One rule was promoted to CLAUDE.md** (Tier 1, § Code Conventions) because it generalises past this surface: *adjacent controls must not share hit area.* The 44pt floor and `hitSlop` solve reachability; neither solves ambiguity, and an overlap is invisible in a screenshot — so it is asserted in a test, and where the gap is tight the fix is asymmetric `hitSlop` rather than a wider row.

One coupling cost worth recording: `momentStore` now reaches `lib/sync` → `lib/supabase` transitively, which throws at import time without env. Only `store/momentStore.test.ts` was affected (the three card suites already mock `lib/sync`); it mocks `lib/undoLog` at the module boundary, which is also what makes the reversal assertable.
