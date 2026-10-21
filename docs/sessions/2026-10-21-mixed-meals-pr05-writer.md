# Mixed meals row 5: log a mix

**Date:** 2026-10-21 · **Issue:** [CUL-2054](https://linear.app/projectnyx/issue/CUL-2054), with [CUL-2086](https://linear.app/projectnyx/issue/CUL-2086) and [CUL-2084](https://linear.app/projectnyx/issue/CUL-2084) · **Branch:** `claude/mixed-meals-pr05-10211944` · shipped via #1273

## What shipped

The first writer of a mixed bowl, on for every account, behind the PM's on-device check:

- **The meal card.** "+ Mixed with another food" on a meal, a bowl title read the way History reads it, and the two-way stepper in the same slot once the meal is a mix.
- **The mix route.** `app/mix.tsx` holds the picker, with the first food locked and meal foods only, and then the split. The split chip is the save, and the step holds while the bar draws.
- **The FAB.** The MIX pill writes the meal and its foods in one transaction.
- **Event detail.** A MIXED BOWL section and the after-the-fact line.
- **Edit-event.** A bowl editor whose changes are held until Save. A bowl with a food that is gone, or whose read failed, opens read-only.

## Decided

- **PM go, 2026-10-21.** No §3.2 amendment: a probe showed the card and the FAB mount outside Home's import closure. "Add to the trial list" is hidden on the past-target bowl heads-up.
- **"+ End the trial" opens the completion sheet's outcome step, not the decision step.** G1 (`guards/trialWindow.test.ts`) reserves the decision step, which offers "Keep going", for the milestone action.
- **The mix flow is its own route, not a mode of `app/log.tsx`.** The single-food log path stays untouched by construction.

## What broke and held

Adversarial pass 1 on CUL-2086 found four quiet races:

- two quick edits;
- an edit landing during Undo;
- ledger writes racing each other;
- a food taken out away from the card.

The fixes were to serialize ledger writes, record which meal spent each warning, add an `undoing` guard, and let only the newest edit act and only on a flag that is still on screen.

Pass 2 HOLDS on the diff. Its one quiet finding predates this row and is filed as CUL-2087. pm-feature-review led to the MIX tag fix and to backing out of the picker returning the card. The rest is filed as CUL-2088 (Live harm, PM ruling), CUL-2089 and CUL-2090.

**One thing:** T1 L1 — Local first: several rows land as one write, or none · check: pending
**One thing (re-ask):** D3 L1 — Reading a test: a test proves only the world it builds (from 2026-10-21, row 2: the pretend server lets every upload succeed; name one real failure it could never catch) · check: pending

## Teach

### One thing: Local first, where several rows land as one write (T1, L1)

A tap on the phone saves to the phone's own small database first, before any network. A mixed bowl is more than one row: the meal itself, plus one row for each food in it. If the app saved those one after another and the phone died in between, the meal would exist with only its first food. The app would then believe the pet ate chicken alone, and the rabbit would vanish from the trial record. A **transaction** wraps the rows into one save that either lands whole or not at all.

**Like:** a bank transfer. Money leaves one account and arrives in the other as one act. A bank never leaves it gone from the first account and missing from the second.

**In today's work:** `lib/meals.ts:125`
```
if (mix) await writeMealComponentsTx(db, eventId, mix, new Date(now));
```
This line runs inside the same `withTransactionAsync` block (line 100) that writes the meal. If writing a food fails, the meal it belongs to is undone with it. A test makes that failure happen on purpose and checks that nothing was left behind.

**Why it matters to you as PM:** "one press logs the mix" is only a safe promise because the press is one save. Split it into two saves and the most common failure becomes a quiet record error rather than a visible one.

**Check:** if the FAB pill had saved the meal first and its two foods a moment later, what would the trial card say about a chicken-and-rabbit bowl whose second save failed?
