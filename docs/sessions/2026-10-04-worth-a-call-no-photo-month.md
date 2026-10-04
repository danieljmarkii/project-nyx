# PR-35 — a worth-a-call with no photo reaches the month (CUL-1200)

**Date:** 2026-10-04
**One thing:** D3 L1 — Reading a test: a test proves only what it asserts · check: pending

Dispatched session (Out of beta — Noticed, Design v2, History v2, the trial screen · PR-35). Shipped via #1059, left open for the PM: the §5.4 / AC 22 spec edit waits on their confirmation, as the plan required.

## What shipped

The PM ruled (b) on CUL-1200 (2026-10-03, CUL-1520 item 8). The read can escalate with no photo (feline reduced intake, repeated loose stool), and the Patterns month and the Signal gallery never showed it, because both asked only about photographed incidents and the month's mark lived behind the Photos layer.

- **The month.** `lib/monthReads.ts` asks the phone's read copy about every surviving non-look event in the range, through the shared `isWorthACall`, in one batch. `lib/monthModel.ts` gains `MonthDay.call`. `MonthInstrument.tsx` / `DayMark.tsx` draw the call diamond whatever the layer toggles say; the legend's call rows lose "photo" and appear only when a day carries one (never a "0 days" row); the day's label says "read as worth a call" without claiming a photo; the spoken month leads with the calls, each rule apart (EN-3). `carryMonthRoses` carries a photoless call through a failed look, on the event's current day, and drops one whose event left the month.
- **The gallery.** `lib/signalScreen.ts` reads every episode's bout. The gallery stays photos; the count line adds "…, one read as worth a call with no photo", per rule, and nothing when there are none. `carryTileRoses` keeps the clause through a failed look while every row of the episode's old bout is still in its bout.
- **Mock first.** §14 on the History v2 page, republished to the same URL (version 13), as built beside as ruled; ledger row added.

## Decisions

- Decided on the fly, logged on CUL-1200 for the PM to reverse: the diamond shows on every lens, not only under Vomiting. Presence escalates.
- The Tier-2 spec edit (§5.4 ⚠ RULED line, AC 22 rewording, v1.13 row) is proposed in the PR body and asked on CUL-1200. Not written.

## Falsification

`adversarial-reviewer`: PASS over 18 counterexamples (a photoless call beside a photographed calm read; a look; the slack days; a day ahead; a re-dated and a deleted event under a failed look; a mixed-rule month; a bout photographed on its re-log row; a photoless call outside the drawn weeks). It found one MEDIUM: the gallery carry's G5 check survived deletion with every test green. Fixed with a test, mutation-proven, and the carry now survives a bout that grew (a LOW it also found). Two LOWs left as is (with Photos on, "photographed, read as worth a call" on a day whose call came from a photoless row; a call on a future-dated event is invisible, as photos are).

Mutation proofs of my own: reverting the month read to photographed-only, the loader to tiles-only, and gating the diamond on Photos each red a test. The last one did not at first: the render mutation survived the suite, which is how the grid test was found missing.

## Residuals

- `lib/signalScreen.ts` was touched by PR-27c (#1055), already merged; no collision.
- CI had not started on the draft at wrap; the pre-push hook ran typecheck and the full jest suite green.

## Teach

### One thing — Reading a test: a test proves only what it asserts (D3, L1)
A test sets something up, does one thing, then checks a few facts. It proves those facts and nothing else. A suite can be all green while the one behaviour you care about is untested, because no test ever looked at it. The way to find out is to break the behaviour on purpose and see whether anything turns red.

**Like:** a smoke alarm that is wired up and passes its self-test, but is mounted in the garage. It works. It just is not watching the kitchen.

**In today's work:** `components/designV2/patterns/MonthInstrument.test.tsx:260`
`expect(v.getAllByTestId('daymark-layer-photo-worth_a_call')).toHaveLength(1);`
"With Photos off, exactly one call diamond is on the grid." Before this line existed, I hid the diamond behind the Photos toggle on purpose and all 30 month tests stayed green. The legend tests checked the words; none looked at the grid.

**Why it matters to you as PM:** "tests pass" tells you the checks that exist passed; when a review says a change was "proven by mutation", it means someone broke the behaviour and watched a test catch it, which is the stronger claim.

**Check:** If someone later changes the month so the diamond only shows when Photos is on, which test goes red, and what would happen if this line had never been written?
