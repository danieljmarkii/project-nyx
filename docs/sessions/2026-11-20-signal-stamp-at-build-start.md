# Vet contacts: a Signal rebuild is stamped when it starts reading (CUL-2844)

**Date:** 2026-11-20
**One thing:** D3 L1 — Reading a test: a race is only tested by a fixture slower than its margin · check: pending

Dispatched BUILD row, plan-gated (Gate: clinical); the PM typed the go in this session. Shipped via #1578.

## What changed

- `generate-signal` stamped each `ai_signals` row with the column's `NOW()` at the insert, the END of the build. Home's backstops (`landedReadRebuildKey` / `readNearBuild`, `visitMovedNearBuild`, `petHasOpenWarning`) call a change at or after that stamp unseen, with 120 s of slack before it. A build slower than the slack let an early-landing read or visit correction sort as seen. The insert now writes `nowMs`, which the handler takes before any database call and which the engine already counts at.
- Adversarial pass 1 broke the fix in a place nobody named: EN-9's §3.2 lapse read the prior row's stamp as its write time, so an answer given during the build that dropped its concern would have survived. The lapse now measures against the stamp plus a ten-minute ceiling (`PRIOR_ROW_WRITE_CEILING_MS`), which errs toward asking the owner again.
- Pass 2 (the cap) found nothing QUIET introduced. Its LOUD residuals are parked on CUL-2844. Two QUIET findings that predate this PR are filed: CUL-2846 (a slow phone clock against the server stamp) and CUL-2847 (an offline "my vet knows" timed at sync).

## Teach

### One thing: a race is only tested by a fixture slower than its margin

**The concept.** A test is a small story: set up a world, do one thing, check one fact. What it proves is exactly the world it set up. If the bug only happens when something is slow, a test where everything is quick proves nothing about the bug, however green it is.

**An everyday version.** You leave a note saying "back in 2 minutes" and a parcel arrives while you're out. The courier sees the note and assumes you're in or out depending on the time on it. Testing that with a 30-second errand never shows the problem; you have to be gone longer than the note says.

**One real line from today's diff** (`lib/vetContacts.test.ts`):

```ts
const buildMs = LANDED_READ_RACE_MS + 180_000;
```

The build in this test runs three minutes longer than the 120-second slack the backstop allows. That is the whole point of the test. The existing tests all used builds a few seconds long, inside the slack, so they passed with the bug in place. This one also checks the old stamp and expects it to miss the change, which records why the fix exists. It reads the slack from the shipped constant instead of typing 120 seconds, so if someone changes the constant, the test still runs past it.

**What it cannot prove.** It uses one clock. It says nothing about a phone whose clock runs slow, which is why CUL-2846 is filed separately.

**Check question:** the old tests passed with the bug in place. What one number in their setup would you have changed to make one of them fail?
