# Engines v3 PR-27i: a photo changed on the edit screen gets its read

**Date:** 2026-10-08
**One thing:** T2 L1 — The sync queue: work hung on the online moment is skipped when the queue delivers later · check: pending

Dispatched build of CUL-1680, shipped via #1123. Plan-gated as a clinical surface. The plan was posted on the issue, and the PM typed "go" in this session. Option (a) only: client side, no migration.

**What shipped.**
- `app/edit-event.tsx`: a photo added or swapped on the edit screen of a vomit or stool now gets its per-incident read. The read chain is the one the detail screen's photo add already runs (`app/event/[id].tsx` ~620–680):
  - the chain claim is taken before `router.back()`, so the detail section waits for this read instead of firing a second one (CUL-801);
  - the read is asked for only once the attachment row has landed;
  - a claim held by another chain is awaited, then the new photo is read anyway;
  - the claim is settled on every exit;
  - the Signal refreshes after the read, not before.
- The immediate Signal refresh no longer counts a photo on a readable type. Every other moved input keeps it.
- `app/editEvent.photoRead.test.tsx`, 8 cases. Five were red against the pre-fix screen. The two no-read cases are refactor safety and stay green either way. The review-hardening case (no refresh after a failed invoke) was proved by mutation: dropping `readInvoked` from the refresh gate reds it.

**Why it matters.** The new read stamps the new `photo_set_key` and decides `may_wait` again for the row. The server's `revalidateNeighbours` then lowers any neighbour whose TRUE no longer holds. Before this change, a stored "first thing tomorrow" could stand over a photo nobody had read.

**Reviews.**
- **`adversarial-reviewer`: PASS.** Each case below was tried:
  - **A TRUE under a replaced photo:** the read fires after the upsert, and the server re-decides the row and its neighbours.
  - **A held chain:** it is awaited, then the read runs.
  - **A read of the old photo set landing last (Ask A8, another device):** the self re-check against the current set lowers the TRUE.
  - **The remote detach losing the race to the invoke:** a partial or mixed set leaves the row unsettled, and the TRUE goes to NULL.
  - **The cap reached, or a 500:** the server lowers the TRUE and re-checks the neighbours.
  - **Residuals,** both pre-existing on both screens and filed: a photo landed by the retry queue gets no read (CUL-1682, now blocking CUL-1629, the reader); the server's hold exit skips the neighbour re-check (CUL-1692, low).
  - **Latent today.** Nothing reads `may_wait` yet.
- **`code-reviewer`: ship-ready.** Its optional test gaps are closed in the second commit: the claim is asserted before `router.back`, a rejected upload settles the claim false, and a failed invoke refreshes nothing. The duplicated predicate is hoisted into one `isReadable`.

**Rulings.** "go" on the plan (the PM, typed in this session).

## Teach

### One thing — The sync queue (T2, L1)
Culprit saves everything on the phone first, then a queue sends it to the server when the network allows. The catch: anything you attach to the moment of sending only happens if the send goes through right then. When the phone is offline, the queue delivers the photo later, by a different road, and the follow-up step that was hung on the first attempt never runs.

**Like:** asking a courier to "also ring the doctor once the parcel arrives." If the courier is sick and the post office delivers the parcel next week instead, the parcel arrives, but nobody rings the doctor.

**In today's work:** `app/edit-event.tsx`, inside the save's upload chain
```
if (error) { console.warn('[edit-event] attachment upsert failed:', error.message); return; }
```
If the photo fails to reach the server, this line stops the chain. The read that follows a few lines later never runs, and the photo waits in the queue (`lib/sync.ts`, `drainEventAttachmentsQueue`), which uploads it later and asks for no read. That gap is CUL-1682.

**Why it matters to you as PM:** "it works" in an online test says nothing about the offline path. A spec that promises something happens after a save has to say what happens when the save lands late.

**Check:** An owner on a plane edits a vomit, swaps in a photo showing blood, and lands three hours later. With today's fix but not CUL-1682, does the server ever read that photo on its own, and what would make it?
