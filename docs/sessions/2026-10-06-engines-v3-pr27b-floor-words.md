# Engines v3 PR-27b: the floor's words on the record

**Date:** 2026-10-06
**One thing:** T5 L1 — Edge Functions: a decision belongs where all its evidence lives · check: pending

Dispatched session (PR-27b, CUL-1510). Shipped via #1077.

## What shipped

- **The watch-for list** (`lib/incidentFloorWords.ts`). It sits under a new-rule "Keep an eye out" or "Not enough to say yet" vomit read the floor wrote (`engines_v3_en4` in the stamp). There is one clause per built floor row:
  - T1/T2, call now: two more vomits by {onset + 4 h}, more than half an hour apart.
  - T3, call now: low on energy by {+24 h}.
  - T6/T7, call today: vomits again by {+24 h}.
  - T8, call today: the days a three-day run still lacks, counting what is logged, and never across a DST change.

  Dogs also get the static bloat line. Deadlines are named hours on a minute clock, and a closed window is dropped. Each clause's trigger is driven through the real floor (`lib/incidentFloor.ts`) at the clause's own deadline. T8 is a property test over every day of 2026, plus a test on the zone's own DST days. Every deadline rule and the DST guard were proven by mutation.

  A photoless vomit now draws "Not enough to say yet" with its list, and no retry.
- **What to tell them** (both sections). Under a new-rule call, it gives:
  - the time, and the vomits logged within a day either side;
  - only the findings present in enum fields;
  - the courses on board (`lib/incidentFloorFacts.ts`, `onBoardAt`).

  It never reads model free text.
- **Call today's action line** is the fixed "Call your vet today. If they're closed, call an emergency clinic." It gives no leave to wait.

## The decision: leave to wait moved to the server

The spec's late-day line gives leave to wait ("first thing tomorrow, or an emergency clinic tonight if {signs}"). It was built on the phone and taken apart over four adversarial passes, each of which broke the last fix:

1. A lethargy flag or an already-met sign, the model's own call, and blood colours.
2. A call-now sign met on a neighbouring record, a frozen payload after an owner edit, and a rescue over an unread photo.
3. A neighbour's photo finding, a burst more than 24 h from the event, and stale facts.
4. A removed photo's blood call, a photoless neighbour's intake flag, and a back-dated lethargy.

Every break was the same shape: the evidence that says "waiting is safe" lives in other reads' flags and payloads, and the phone does not hold them. So the line ships louder than the spec, never calmer than "Worth a call". The late-day resolution is CUL-1611, built server-side, where every read is visible. CUL-1611 also records the Designer and Dr. Chen conflict for the PM. CUL-1610, the intake allow-list question, is folded into it.

## Falsification attempts (DoD)

- **Biostatistician.** Tried each of these and it held:
  - T2 with the anchor absorbed by an earlier witnessed log;
  - every T3/T6/T7 boundary;
  - T8 across fall-back and spring-forward in New York, Lord Howe and Chatham;
  - T8 when a vomit was already logged the day before.
- **Dr. Chen.** Tried the four passes' cases against leave to wait; it broke every time, and was removed.
- **Pass 5, on the shipped diff.** All four claims held:
  - No path renders leave to wait or anything calmer than "Worth a call".
  - About 85k clause triggers were driven through the real floor across four zones, DST included.
  - No wellness claim and no model free text.
  - Earlier-rule rows are unchanged.

  One wording fix: T2 now says the half-hour gap counts from this vomit ("each more than half an hour after the vomit before it").

## Residuals

- CUL-1609: the blood and meal clauses aren't in the list, because their rows aren't on the floor. The cat meal clause is High.
- CUL-1611: the late-day "first thing tomorrow" (server, PM decision first).
- Stated limit: another device's unsynced rows are invisible to the list and to "What to tell them".

## Teach

### One thing — Edge Functions: a decision belongs where all its evidence lives (T5, L1)
Some code runs on the phone, and some runs on our server (an "Edge Function"). The phone only knows what has reached it. The server sees every read the app has made, including the ones from other photos and other days. When a rule needs all of that to be safe, it has to run on the server, however convenient the phone is.

**Like:** a nurse at the front desk can tell you your appointment time. Only the doctor holding your full chart can tell you it's fine to wait until morning.

**In today's work:** `lib/incidentTierWords.ts:111`
`action: "Call your vet today. If they're closed, call an emergency clinic.",`
This is the line the phone now shows. The friendlier "first thing tomorrow" version needed facts the phone can't see, such as a blood photo on yesterday's vomit that was since removed. So that version moved to the server.

**Why it matters to you as PM:** when a spec rule depends on the whole record, ask where it runs before you ask how it reads. The answer decides whether it's one PR or three.

**Check:** if the server-side version ships and the owner opens the record with no signal, what should the line say, and why?
