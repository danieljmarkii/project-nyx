# Vet visit reminders PR-05: the finish pass and its fixes

**Date:** 2026-11-14
**One thing:** D3 L1 — Reading a test: a test proves the path it walks, and the cold start was a path no test walked · check: pending

[CUL-2729](https://linear.app/projectnyx/issue/CUL-2729), PR-05 of *Vet visit reminders*. Shipped via #1530 (draft). BUILD: the spec's row 05 is a product read, a voice pass and an acceptance sweep, and the read found work.

## What the pass found

**Acceptance sweep (spec §7).** Criteria 1 to 9 each trace to code and a named test. Criterion 10's device pass is the PM's and is open.

**`pm-feature-review`**, seven flows walked as Jordan, Sam and a two-pet home. Ship-shaped: single-pet booking, the denied state, the Notification Center row, the schedule under edit, cancel and log. Needs work: the primer, the line on a booking that gets no reminder, and the two-pet path end to end. Every claim was re-checked against source before it was acted on; one was dropped (the primer's *6:00 PM* is the primer component's own convention, not a format fail).

**Voice pass.** Nothing forbidden in any string: no exclamation mark, no medication wording, no reason, clinic, vet, question or count. The fails were accuracy fails.

## Rulings (PM, 2026-11-14), all four recommendations taken

- **D1 (a), spec R9.** A collapsed reminder whose visits share one instant takes the single visit's copy with the names joined. "Also for" books every pet at one time, so this is the common two-pet case, and it had been losing the time, the *weigh, log or call ahead* ask and the report line.
- **D2 (a), spec R10.** A collapsed tap lands on that day's visits for every pet. Split out as its own row (CUL-2750), with frames first.
- **D3 (a), spec R11.** A booking too close for any reminder says so. Unseats round 2's *Reminders are on.* caption.
- **D4 (a), spec R12.** R4's name-always stands; the lock screen promise says the name shows.

## What shipped

- `lib/vetReminders.ts`: `visitCopy` serves one visit or a same-instant group; `DAY_OF_BODY_EACH`; every planned reminder carries `appointmentIds`.
- `lib/notificationRouting.ts`: a single-visit tap carries its validated pet.
- `app/rundown.tsx`: a reminder tapped after its visit stopped being booked opens that pet's Vet visits list with *That visit isn't booked any more.*, on the first answered load only. Later loads keep F4's fallback, so Back after logging a visit from this screen is not mistaken for a stale reminder.
- `lib/vetReminderNotifications.ts`: `withdrawDeliveredReminders` dismisses a delivered reminder once none of its visits is live, and all of ours when the switch is off; the primer's visit row lost its invented time.
- `components/vetvisits/RemindMeRow.tsx`: the too-soon lines; *for every visit you book* in a one-pet account.
- Copy: the failed-write snackbar names the in-app path; the promise line.
- Spec v1.4 (R9 to R12, §3.4, §4, §5, row 06) and the mock, five frames moved in place with a ledger row each.

## What the code review caught

`code-reviewer` returned fix-before-merge.

1. **The stale-tap one-shot was spent too early.** The ref was cleared before the load knew whether it could answer. On a cold start from the notification, the case the fix exists for, the pet list has not loaded: the first load spent the ref and fell through, and the load the hydrated pet triggered took the old fallback to the active pet's rundown. A superseded load could spend it the same way. Now the ref is spent only by a current load, and only once the appointment is live or the pet list has answered. An owner who backed out during the read is never navigated.
2. **A collapsed reminder could never be withdrawn**, because it carried no visit id. Reminders now carry every visit they stand for and go when none is live.
3. The header's "a failed read changes nothing" was about the appointments read; reworded. The promise line read oddly for two pets; reworded.

**Mutation proof.** Five guards, each failing its test with the fix removed: the same-instant collapse, the live-visit check on withdrawal, the one-shot's disarm, the cold-start wait, the unmount guard.

## Residuals

- The PM device pass (AC 10): the script is in the PR body. It carries PR-04's residual (a warm two-pet tap while Vet visits is open on the other pet) and the cold-start tap.
- A reminder scheduled by an older build carries no visit list; a collapsed one of those is left in Notification Center.
- The primer's visit row renders an empty time cell; alignment is a device check.
- A switch read that fails reads as off, which now also withdraws delivered reminders. The schedule already followed that rule.
- No `adversarial-reviewer`: no clinical or statistical logic changed.

## Filed

- CUL-2750: the two-pet landing (D2), `Todo`, a sub-issue of the project's parent.
- CUL-2751: sign-out leaves delivered notifications in Notification Center, every category. Privacy, so filed and not fixed in passing. `Backlog`.
- CUL-2752: the product read's smaller findings as one class issue. `Backlog`.

### One thing: Reading a test, a test proves the path it walks (D3, L1)

The stale-tap fix had three passing tests when the review read it. All three started the same way: the app already open, the pet list already loaded. The bug was on the other road, the one where the phone is locked, the owner taps the notification, and the app starts from nothing. On that road the pet list arrives a moment late, and the code had already used up its one chance to redirect.

Think of a smoke alarm tested by pressing its button. The button proves the siren works. It says nothing about whether the alarm hears smoke, because the button never sends any.

The line that fixed it, from `app/rundown.tsx`:

```ts
} else if (petsLoaded) {   // only decide once the pet list has answered
  staleTapArmed.current = false;
```

Before, the second line ran with no condition above it. The new test starts with the pet list not loaded, checks nothing happens, then loads it and checks the redirect fires.

**Check:** the new cold-start test passes. Does that tell us the redirect works when the owner taps the notification while the app is already open on another screen?
