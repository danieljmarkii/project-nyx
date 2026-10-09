# Engines v3 PR-27f: the record says "first thing tomorrow" only on the stored fact

**Date:** 2026-10-09
**One thing:** T2 L1 — The sync queue: a server's answer only covers the rows it has been sent · check: pending

Shipped via #1133 (CUL-1629; dispatched, plan-gated; PM go with D1 = a, D2 = a, D3 = a). This is the last of the three PRs under CUL-1611's ruling A.

## What shipped

The vomit and stool records' call-today action line now resolves against the device's clock. Day (6 AM), evening (6 PM) and small hours (midnight) each get their own line, and it applies only when the server's stored `may_wait` is TRUE **and** every gate the phone can check holds. Everything else keeps "If they're closed, call an emergency clinic." The phone can only take the leave away, never grant it. Home and History keep the louder line.

- **`lib/mayWaitLine.ts`** (pure): the gates, each a named refusal. The gates are row, facts, photos, unsynced, floor, lethargy, intake, expired, dst, fresh and stale. It also holds the words and the mirrors of the server's intake rule (parity-tested against `incidentMayWait.ts`).
- **`lib/mayWaitFacts.ts`**: the phone's read. It covers local SQLite, unsynced and deleted rows included, plus a fresh read of the event's attachment ids from the server.
- **`hooks/useMayWaitFacts.ts`**: the read runs every minute, on each committed log, and when the row moves. Reads never cancel each other; the newest one started wins.
- **Both sections:** they re-read the stored row on the same cadence, and the line stands only while the server's copy agrees with the one on screen.

## The falsification record

Three `adversarial-reviewer` passes; each broke the previous fix.

- **Pass 1 found four defects:**
  1. Hide/Show moves `updated_at` and opened a second night. Fixed: the night now ends at the first 6 AM after the *earlier* of the decision and the incident.
  2. An open record never re-read its row, so a take-back the server wrote for a neighbour's finding never reached it. Fixed: the `fresh` gate.
  3. The floor's T2 clause said "twice more by 1 AM", one vomit too many, because it missed an earlier onset. Fixed: the signs are now count-free, "{pet} vomits again or is low on energy".
  4. A log made on this phone took up to 5 minutes to refuse. Fixed: every committed log re-reads. The DST check moved to `getTimezoneOffset`, so it no longer depends on Hermes' Intl support.
- **Pass 2 found F1:** cancelling the previous read on every tick starved every answer on a network slower than the tick. Fixed: no read is cancelled, every answer carries `readAt`, and the `stale` gate refuses answers older than 2 minutes or older than the newest log.
- **Pass 3 passed the logic but found five unpinned mutants in the section wiring.** Section tests now drive a hanging read, a log after the read, a foreground after a still minute clock, and out-of-order landing; M2–M5 go red. M1 (the scope reset) is defense in depth: removing it only ever makes the line louder, and a comment says so.

## Decisions

- **D1–D3 ruled a** by the PM in-session.
- **Two departures from the approved plan, both louder, left for the PM to confirm** (PR left unmerged for this):
  - (i) the vomit's exception names "vomits again or is low on energy", not the floor's own clauses;
  - (ii) the night is bounded by the incident's time as well as the decision's.

## Residuals

- CUL-1707 (filed): a server-stamped `may_wait_decided_at`, so the night can run from the real decision.
- Stated blind spots: another phone's unsynced rows; a backwards clock correction holds the louder line for the size of the skew.

## Teach

### One thing — The sync queue: a server's answer only covers the rows it has been sent (T2, L1)
When you log something, the phone saves it at once and sends it to the server a little later, from a waiting list called the sync queue. Until it goes out, the server has never heard of it. So anything the server decides is only as current as the rows that have already reached it. This PR's safety line had to account for that gap: the server said waiting overnight was fine, but the phone may hold a vomit the server hasn't seen yet.

**Like:** a doctor reviewing your chart in the morning. Her "you can go home" is right about the chart she read, not about the symptom you told the nurse ten minutes ago that hasn't been typed in yet.

**In today's work:** `lib/mayWaitFacts.ts`
`rows.some((r) => r.synced === 0 || ...)` asks: is any nearby log still waiting in the queue? If one is, the record ignores the server's "you may wait" and shows the louder line until that log arrives.

**Why it matters to you as PM:** any time a spec says "the server decides", ask what the screen should say while the phone knows something the server doesn't.

**Check:** an owner logs lethargy with no signal at 10 PM, then opens yesterday's vomit record. Which line do they see, and what makes it change?
