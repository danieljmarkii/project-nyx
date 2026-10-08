# Engines v3 PR-28b — EN-4's phone half: every vomit reaches the floor

**Date:** 2026-10-08
**One thing:** T2 L1 — The sync queue: the promise is written in the same breath as the record · check: pending

Shipped via #1122 (CUL-1436). Dispatched by `/dispatch`. The row was plan-gated: the plan was posted on CUL-1436, and the PM's go was typed in session ("go, refloor for a new vomit, one PR").

## What shipped

Everything is dark behind `engines_v3_en4` **and** `engines_v3_en3`, the two keys the server's floor needs. Both are now read on the phone through `hooks/useFloorOn` and `floorOnNow`.

- **The durable re-check marker (spec §8.4).** A local `incident_floor_queue` row is written in the same transaction as the write that owes it:
  - a vomit, lethargy or meal insert;
  - a meal rating;
  - an edit or soft delete of any of those.

  The drain (`syncPendingIncidentFloors`, through `serializeQueuePush`) sends `analyze-vomit {event_id, mode:'refloor'}` once per event. It waits until the event, and a meal's rating row, have landed. A new vomit sends `refloor` too, which is the PM's ruling. A begin refused for an open transaction falls back to the plain write plus the marker (`runOwingCheck`).
- **The offline preview (§8.5).**
  - The phone runs `lib/incidentFloor.ts` over its own rows and shows call tiers only, on the completion card and the record, with "Worked out on this phone…".
  - It never stands over a stored call, a Re-run's pending one included.
  - The card's preview is bounded at 300 ms.
  - The device claim rides the marker; the server ignores it until CUL-1437.
- **One arrival per bout (§8.7).**
  - The local `incident_tier_shown` record is raise-only.
  - One read is announced per bout: the most recent among those raised to the loudest tier.
  - A stored tier is announced only above what the phone showed.
  - A tier is recorded as shown only when a card shows it.
  - A card is never lowered.
  - The record's arrival and its announcement are suppressed on a landing that says nothing new.
- **PMD-14 = A.** A photoless vomit whose own floor is call now routes to its record, from both `/log` and the sheet. A later raise is said once on the raising log's card, which holds for 8 s.
- **The Noticed door.** With the keys on, "Subdued and vomiting" moves to call now (T3), matched to the floor by a test at the door's widest separation. With the keys off, the page is unchanged.

## Reviews

- **adversarial-reviewer: FAIL on the first pass**, then **PASS on the re-pass** of `ca04eea`. The first pass found:
  1. a pending row ranked quiet, so a call-today preview stood over a stored call now during a Re-run;
  2. `patchFloorLine` could lower a card from call now to call today;
  3. the preview recorded tiers as shown before any card showed them, which silenced later arrivals;
  4. a wrong-pet delete leaves the local shown tier stuck (handed to CUL-1437);
  5. the door move was ungated (now gated on the keys).

  Items 1–3 and 5 are fixed, each with a test that goes red when the fix is removed.
- **rls-privacy-reviewer.** Two low findings. A sign-out between two triggers could send the next trigger's id; it is now fenced before each invoke. Shown rows could be half-written across a wipe; they are now one statement. RLS held throughout.
- **code-reviewer.** Four findings:
  - a nested or concurrent transaction (now the fallback);
  - the preview on the commit's critical path (now bounded);
  - the shown-tier write timing (the same fix as adversarial item 3);
  - import placement.

  All four are fixed.

Mutation proofs:
- the pending-row rank;
- the card never-lower check;
- the meal gate;
- the transaction fallback;
- the door's flag gate;
- the sign-out fence before invoke (its first test survived the mutation, so a second test was added).

## Residuals

- **The device claim can name a tier no card showed.** This happens when the preview missed its budget or the card was superseded. It is harmless until CUL-1437 adopts the claim, and is noted there.
- **A slow device can lose the photoless call-now routing.** If the preview misses 300 ms, that log's routing and card line are lost. The server's re-check and the record still say it.
- **The door can read call today for a frame** before the config loads, then rise to call now.
- **Home's band per bout** is PR-30's work, because the Signal builds Home's band server-side.

## Teach

### T2 L1 — The sync queue: the promise is written in the same breath as the record

When you log a vomit, the phone saves it first and talks to the server later. That gap is where things get lost. If the app is killed in between, anything the phone "meant to do" after the save is gone. So the to-do note ("ask the server to re-check this pet's vomits") is written as a row in the same save as the vomit itself. Either both land or neither does, and the note sits there until a later sync sends it.

**Like:** writing the vet's phone number on the same sticky note as the symptom. You cannot lose one without the other, and you can call later when you have signal.

**In today's work:** `lib/simpleEvent.ts:129`
`await runOwingCheck(db, writeEvent, () => insertFloorMarker(db, eventId, params.petId));`
This saves the vomit (`writeEvent`) and the re-check note (`insertFloorMarker`) together, as one all-or-nothing step.

**Why it matters to you as PM:** "every vomit reaches the floor" is only true because of this line. Without it, an owner who logs at 2 AM with no signal and then closes the app never gets the louder read.

**Check:** An owner logs lethargy in airplane mode, force-quits the app, and opens it on Wi-Fi the next morning. Does the server re-check her earlier vomit, and what decides when?
