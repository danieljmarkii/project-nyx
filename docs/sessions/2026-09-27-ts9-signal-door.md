# TS-9 — the trial screen's door to the Signal's trial finding

**Date:** 2026-09-27

Step 4 of the Linear project **Diet trial — its own screen** (CUL-1305). Shipped via #955.

## What shipped

- **The door.** Under the trial screen's facts card, a row that opens the Signal screen of a live `trial_response` finding for the route's pet (spec §3.7, T-1). `lib/trialSignalDoor.ts` decides it with Home's own predicate, `visibleFindings`, fed Home's not-eating register from the screen's model (`TrialScreenTrial.notEating`), so the door exists exactly when Home draws the card: no door for a falling vomit pair over a pet that may not be eating, a door for a rising pair on the safety face too (S7 both ways). `hooks/useTrialSignalDoor.ts` holds the `design_v2` gate and the read: with the gate off the Signal cache is never read; it re-reads on `signalTick` and on focus, as `useSignal` does. The hook joins the design_v2 guard's pinned consumers with a `DRAWS_ELSEWHERE_OK` entry (it decides a door and draws nothing of the redesign).
- **The door's text (PM ruling, option (a)).** Head = `signalTitle` over the same trial window the Signal screen titles with; sub = *Vomiting, from the Signal*. Since CUL-1270 the trial finding's title ("Rabbit trial, day 23 of 56") is one punctuation mark from the trial screen's own title, so a head alone read as a door to the screen already open. Recorded inline in spec §3.7 and §11; the mock's §05 frame was redrawn and republished to the same URL (the old frame still carried the pre-CUL-1270 title).
- **The Signal screen answers only for a finding Home would draw.** `loadSignalScreen` returns the reason: `withheld` (a falling vomit pair Home withholds, with its own copy), a throw when the not-eating register has not answered (the screen's failed state with Try again, re-run once the pet list loads), and `missing` only for a stood-down line's expiry or a pet the loaded list doesn't hold. A load that settles to anything but the finding abandons a chart flown in from Home.

## The adversarial record

Three rounds, each counterexample executed in a scratch copy.

1. **FAIL.** The door read the cache once; a regen that flipped `more_during_trial` to `fewer_during_trial` left it standing, and the Signal screen draws the server's sentence whole (`SignalScreen.tsx`, `model.sentence`) for any cached finding. So the door opened onto "1 episode during 23 days of the trial, 11 in the 49 days before" over a refusing cat: B-789 / diet trial §5.2 exactly. The everyday path: Home kicks off a regen on the first open of the day, the owner taps the strip within seconds, the door holds the expired row. Fixed at both ends: the loader gate (every entry path, not just this door) and the re-read on `signalTick`.
2. **The gate held; two follow-ons.** `missing` ("This signal isn't in {pet}'s picture any more") answered all three causes, and over a withheld vomiting pair it can read as "it stopped"; a cold-start deep link or a failed trial read got a permanent-sounding "gone" with no retry (C-37: return the reason). And the flown chart stayed painted over the answer. Both fixed.
3. **HOLDS.** The withheld copy's "fewer vomits" and "may not be eating" are both backed (only falling vomit pairs reach it; only a positive register does). One edge fixed: an archived pet's deep link threw forever, a dead Try again.

Every new behaviour was proved by mutation (the gate, the register, the regen re-read, the loader gate, the unanswered throw, the pets re-run, the flight abort, the archived-pet answer).

## Decisions

- PM: the door's text is option (a).
- Team: the root fix lives in the Signal loader rather than only in the door, because the destination was reachable without Home's stack in between. The withheld copy ("This one is set aside while {pet} may not be eating. Fewer vomits from an empty stomach isn't a sign of getting better." then the shipped backstop "If you're worried about {pet}, your vet is the best call.") went through a nyx-voice pass; the reviewer's note that "isn't a sign" is absolute was kept, as it errs in the safe direction.

## Residuals

- **CUL-1360 (filed):** a replaced trial's cached `trial_response` is titled with the new trial's name and day on Home's row, the Signal screen and now the door. Pre-existing, one shared predicate owed.
- The Signal screen's new withheld state has no mock frame (it belongs to the Design v2 mock); reachable only through a stale path.
- Optional code-review nits left as is: the hook's fetch shape repeats `useNextAppointment`'s (lift on a third copy); the hook reads on non-trial states of the screen, a few wasted reads.
- TS-DP (CUL-1306) is the PM's device pass; the product read beside it was posted earlier today.
