# PR-20: the first day's Signal, mocked (CUL-1837)

**Date:** 2026-10-14

**Mode:** DISCOVERY. Shipped via #1217 (the mock page only, no app code). Round 3 of `docs/culprit-signal-home-mockups.html`, published to the Signal mock's existing artifact (https://claude.ai/artifact/3BUW5uQqA5dhukVnarkKmp).

## What the round draws

- **Day 0.** A pet with no events routes to `stale` today (`deriveDisplayState`: no recent activity), so a new owner's first read is "Not enough recent data to show a pattern". Proposed: zero events, whether a fresh install or looks only, never routes to `stale`. It gets the first week card: a see line ("Culprit sees only what you log… A quiet card isn't an all-clear."), three call cues with a door to the existing "When to call the vet" sheet, and the ghost receipts.
- **Sam's case** (one clear foam vomit at 11 pm, no photo, no meal; nothing can fire). The shipped card is the *watching* branch, not the ghost list: the change row qualifies for every pet before day 14 (`lib/signalWatching.ts`), so the ghost receipts only ever render for zero events. Its floor line "If something needs attention sooner, it won't wait for the week" is retired from every branch.
- **The gap warning through stale** (CUL-1468). The gap row leads, the stale line is rewritten ("Nothing logged for Pixel since Tuesday, so this read ends at the last vomit you logged."), and the cues stay.
- **Looks only** (CUL-1484). This is the same first week card as day 0. The change row is dropped, and a see line explains why the card isn't moving.
- **E2.** The floor line retires here too, replaced by a door line.

## Decisions put to the PM (on CUL-1838)

D1: where the cues sit (recommend under the see line). D2: the cue list against Dr. Chen's signed sheet, which lacks blood and a cat repeat vomiting row (clinical; recommend the sheet learns both, Dr. Chen signs first). D3: the floor after week one (recommend retire). D4: the cue head's tier (recommend tierless, tiers on the sheet). D5: how long the gap warning stays up while nothing is logged (clinical; recommend counting only logged time).

## The clinical passes

Two adversarial passes, the PR cap. Pass 1 failed seven quiet residuals; all were taken (the time limited "until then", "hasn't eaten" against picked meals, no lethargy cue, call-now cues collapsing to "today", blood with no collapse, the scoped E2 floor, the floor surviving in the watching branch). Pass 2 failed on build rules rather than frames. One finding changed the frames: the cues vanished at stale, so they now stay. The rest are written on the page (R3 · 08) as binding on PR-21: collapse through the real `incidentFloor` on raw rows, honouring `floorOn`; mixed rows print the louder tier; blood reads present-only values over 14 days; T3 collapses across its own window; a failed facts read shows the door alone; and a look must never move the gap row's anchor. Each could drop, soften or delay a warning, so none is a follow-up.

## Next

The PM rules D1 to D5 and approves the frames on CUL-1838; PR-21 starts on that approval with its own adversarial review, beginning from R3 · 08.
