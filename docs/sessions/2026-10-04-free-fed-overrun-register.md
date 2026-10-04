# A free-fed trial past its window keeps the bowl's wording (CUL-1554, PR-43b)

**Date:** 2026-10-04
**One thing:** D5 L1 — What a reviewer looks for: a review is someone trying to break your change · check: pending

Shipped via #1048. BUILD mode; plan posted to the issue and approved by the PM ("go, a").

## The defect

`stateFor` resolves `overrun` above `free_fed`, which is right for the decision: past the window the card's job is "tell Culprit what's next". But `registerFor` sent `overrun` to `recordRegisterFor`, so the record region of a topped-up bowl at day 57+ spoke the ordinary record register:

- "Meals logged on 56 of 56 days.", the coverage ratio §5.6 says a bowl in force has no denominator for;
- no watch line ("The bowl also can't tell you if {pet} stops eating. That part is yours to watch.", CUL-1339 #3);
- and on Get ready, which routed the bowl lead under *Is she eating the trial diet?* by `state === 'free_fed'`, the ratio landed under the by-mouth question and the eating question vanished.

## What shipped

- **`lib/dietTrialCard.ts`**
  - `registerFor`: `overrun` returns `free_fed` when `input.freeFed` is set. The state keeps its day line, clamped bar, note and action; only the record region follows the bowl.
  - The overrun body skips the teach line under the bowl (a top-up has no portion to rate; the `free_fed` state never drew it).
  - The `free_fed` body (now serving two states) says the feedings that name no food (CUL-1338's `unclassifiableLine`). It withholds the "0 … logged so far" zero when they are the whole record, and carries §5.2's "not a total" suffix under the same can't-match predicate as the record register.
- **`lib/trialScreenModel.ts`**: `freeFed` on the trial model, from `planTrialCard` over the same projected input the card is resolved over (`screenCardInput`, extracted so the two cannot drift).
- **`lib/trialRecheck.ts`**: the bowl lead routes under *eating* on `screen.freeFed`, so the route belongs to the register, not the state.
- Tests on all three surfaces, plus an `everyState` row for the second state that reaches `free_fed`.

## Proven by mutation

| Mutation | Red |
|---|---|
| Revert `dietTrialCard.ts` to `main` | 7 (card ×5, screen ×1, recheck ×1) |
| Drop the teach-line skip only | 1 |
| Recheck keyed back on `state === 'free_fed'` | 1 |
| Revert the `free_fed` body change only | 3 |

Full suite: 615 suites, 13,924 passed.

## Reviews

- **`code-reviewer`:** ship-ready, no bugs. One nit declined: the fixture comment's "22 of 23" is exactly what the old code printed for that fixture.
- **`adversarial-reviewer`:** BROKEN (narrowly) on the first commit, because the fix introduced a regression.
  - Routing the overrun through the `free_fed` body took away the record register's unnamed-feedings disclosure. With every feeding unnamed, the card printed "0 bowl top-ups and wet meals logged so far." over 20 logged feedings.
  - The floor's "not a total" suffix was lost the same way.
  - Both holes already existed on the `free_fed` state. The fix to that body (second commit) closes them on both states.
  - Held: §5.2's floor inline; refusal and decline still outrank the free-fed overrun (real loader); the S7 projection, where `screen.freeFed` matches the card; Get ready can misroute no other lead; the ledger stays null; no consumer elsewhere keys on the state.

## Filed (not folded in)

- **CUL-1571**: the watch line names no call-the-vet threshold (Dr. Chen; the 48-hour feline window). PM ruled (a): its own copy issue.
- **CUL-1572** (High): a bowl removed after the window ends brings back "56 of 56 days" over all-bowl days, on the card and on the Home strip with no caveat.
- **CUL-1573**: the widget caption "N of M trial days logged" prints over a bowl.
- **CUL-1574**: the milestone day drops the watch line and Get ready's eating question (a PM call); also notes the unprompted wet-meal rating gap.

## Residual

The milestone (day = target) still carries no bowl line, by the §4.3 ruling; CUL-1574 asks whether it should.
