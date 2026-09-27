# TS-5: Home's trial strip becomes the door, with this week's lane

**Date:** 2026-09-27

Shipped via #948. Linear: CUL-1301 (TS-5), CUL-1343, CUL-1344, all in the project **Diet trial — its own screen**, step 3.

## The kickoff

The PM asked to kick off step 3, which is four parallel lanes. This session took TS-5 and started three cloud sessions for the rest, each with its issue's kickoff prompt: TS-6 (CUL-1302), TS-7 (CUL-1303) and TS-8 (CUL-1304). TS-6 had been gated on CUL-1339 #2. The PM ruled option (a) in the same exchange (*Manage the trial* goes on the intake-decline face), and that model change was handed to the TS-6 session. TS-6 and TS-7 both edit the refusal/decline face in `lib/trialScreenModel.ts` and `components/trialScreen/TrialScreen.tsx`, so both prompts and the TS-6 issue name that collision.

## What shipped

**The door.** Behind `trial_screen`, `components/home/TrialStrip.tsx` holds the gate and delegates the drawing to the new `components/trialScreen/TrialStripDoor.tsx`:
- It uses the Signal row's grammar: the header as a headline, the chevron in a round well in the headline row (round 2's frame), the whole box one ≥ 44pt Pressable, and no rail.
- A tap pushes `/trial/{pet}` for the pet the strip's input was loaded for. `useDietTrial` now exposes `loadedPetId`, so during a pet switch the tap opens the trial the strip is showing.
- Flag off, the strip is the shipped JSX and issues no ledger read, because the facts are read inside the namespace component.
- Home joined the flag-off guard's SURFACES, proven by mutation: ungating the door reds it.

**This week's lane.** `lib/trialStripDoor.ts` `trialStripLane` composes the gates:
- `thisWeekLane`'s withholding refusal;
- the card input fresh for the strip's pet;
- `useTrialFacts` ready for that pet;
- no safety concern live in the Signal for that pet.

The last gate comes from a new `SignalZone` prop, `onSafetyLive`, which reports `{ petId, live }`. `live` is null until both the cache read and the watching read (`useWatchingRowsRead`, a sibling hook with an `answered` flag) have answered, and the lane fails closed on null. It is reported from a layout effect, so a safety card and the lane never share a painted frame. Inside the door the lane is hidden from assistive tech, because the door's label already speaks the lane's sentence.

## Decisions

- **The safety set is the whole class** (PM, better-than-the-rule brief). It is any `priorityClass === 'safety'` card, not only the two cards §5.1 named. Written inline in the spec.
- **The escalate-only gap row hides the lane** (PM confirmed). The adversarial pass found it: "gaps between vomiting episodes are getting shorter" carries no `priorityClass`, so the lane drew under it.
- **CUL-1343 (a):** the lane names what it counts, *Week 4 · meals logged 1 of 2 so far*. VoiceOver says *Week 4 of the trial: meals logged on 1 of 2 days so far.* The screen's ledger rows keep their bare counts beside their legend. The round-2 mock was republished to the same URL, built on the live version, which already carried TS-8's Get ready frames.
- **CUL-1344 call 1 (a), then confirmed as the whole ledger.** A rated, unfinished bowl of the refusal lane's population in the current trial week withholds the ledger, and so the lane, below the refusal floor.
  - `TrialFacts.unfinishedDayIndices` exposes the refusal counters' own `rangeDays`: one predicate (`feedingWasFinished`) and one population (B-530).
  - It withholds the whole ledger rather than only the row, because a grid missing its row breaks S5 and the rows' partition of the caption (C-3).
  - `lib/dietTrial.ts` is in the Edge Function closure, so its importers redeploy on merge with no behaviour change.
- **CUL-1344 call 2 (a):** the untracked head keeps withholding the lane for the whole trial. No change.

## Reviews and what they found

- **`code-reviewer`: ship-ready.** The one nit, a `loadedPetId` assertion across a pet switch, was added.
- **`adversarial-reviewer` on the lane: FAIL, two findings, both fixed.**
  - The gap row (f68482a).
  - The day-1 cat with 2 of 2 rated bowls refused, below every floor, drew *1 of 1 so far*. Fixed in 067dc09 after the CUL-1344 ruling.
  - Everything else held: the §12 finding-1 cat, a stood-down range refusal, the untracked head, a pet switch in both load orders, a throwing Signal read, B-789 suppression, a folded safety card, design_v2, and S7.
- **`pm-feature-review`:** door and gating SHIP-SHAPED; lane comprehension NEEDS-WORK.
  - Fixed: the chevron placement, the double TalkBack stop, and the noun (CUL-1343).
  - Filed: CUL-1345 (a refusal register on Home's strip, High) and CUL-1346 (the lane's late arrival above the med strip's confirm, plus a pressed state).
  - Its device checks went to CUL-1306.
- **A second `adversarial-reviewer` pass on 067dc09** ran at wrap. Its result is on CUL-1344.

Every gate clause was proven by mutation, including:
- the zone's `answered` gate and its two new clauses;
- the ledger gate itself (removing it reds 4 tests);
- its week boundary (an off-by-one reds 2).

## What broke along the way

The non-UTC CI job went red twice on this PR, neither time in its code. Both are ported fixes here, and both are written up under C-29 in `docs/engineering-lessons.md`:
- `hooks/useEvents.test.ts` dated a dose "a minute ago" off the real clock and failed in the first minute after local midnight (10:00 UTC, Honolulu). Pinned `Date` to local noon.
- `dayKeyDaysAgo` in the trial-window tests subtracted `n × 24h`. On 2026-09-27, the day Chatham springs forward, that landed a date early just after local midnight, so a fixture meaning day 53 read 54. It now steps local calendar days with `setDate`. The failure was reproduced live under Chatham, and the fix was proven across four zones.

## Residuals

- CUL-1345 (High): a refusing cat's strip goes quieter, not louder. It needs a mock round alongside CUL-380 and CUL-335.
- CUL-1346: the lane arrives asynchronously directly above `MedStrip`'s one-tap write. Check on device first.
- The off-diet dot's meaning on Home, the 16pt legibility of hollow vs faint squares, and how often the lane draws on a real trial all go to the device pass (CUL-1306).
- CUL-1339 #1, #3 and #4 remain open.
