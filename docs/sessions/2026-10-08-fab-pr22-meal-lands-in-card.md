# FAB PR-22: the meal lands in its card

**Date:** 2026-10-08
**One thing:** none — dispatched session, not this round's teach row

Dispatched build of CUL-1643 (PM ruling D3 of CUL-1625), shipped via #1116.

**What shipped.**
- A one-tap food no longer plays the cancel. `retract` takes the chosen slot, which sits out the stagger and fades on its own `exit` (120ms hold, then a 200ms fade, the mock's §04 numbers).
- The pill's 28pt meal disc flies into the meal card's 32pt check on `flightMotion.ts`, the Signal chart's flight, lifted (C-30). It uses the same store, spring and host, and the meal's event id is the identity.
- While the mark flies the card crossfades in place, with its check and words held. The check fades up and settles at the release, and "Logged · …" follows 120ms later.
- `FlightHost` moved after the completion cards and above them by zIndex and elevation.
- Reduce Motion measures and flies nothing.

**The dwell (C-21).** The card still shows at the write, so Undo and the intake chips are live exactly as before. The dwell restarts when the mark lands (`MEAL_CARD_DWELL_MS`, a named mirror of the store's unexported 5s, pinned against the store by driving it). The trial heads-up waits on the new `whenFlightDone`, so the amber panel lands after the mark. `store/momentStore.ts` is untouched.

**Review.** The code review found three real gaps in the first cut:
- A card dismissed mid-flight left the clone flying, because only the Undo path aborted.
- An aborted arrival left the check and the words at opacity 0 for the next meal shown in place.
- A card re-shown with an unchanged layout fires no `onLayout`, so the second quick meal never landed.

All three are fixed: one `endArrival`, plus a target asked a frame after the reveal. A tap that beats the open's springs now flies nothing. Each fix has a test proven by mutation, and the dismiss path is guarded twice (both guards removed reds the test).

**Test harness note.** Native-driver values never paint back in the test renderer, so the retract and the landing are asserted from the animations they start (a count of the cancel's item timings, 5 of 6 against the cancel's 6). Only render-time switches are asserted from styles.

**Residual.** The device check: does the white pill hand to the dark card as one object? The clone is measured while the pill is held at 0.97, so it may start a few points off the glyph.
