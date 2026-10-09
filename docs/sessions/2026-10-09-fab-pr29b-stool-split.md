# FAB PR-29b: the stool pill splits into Normal and Loose, and keeps the day it first showed

**Date:** 2026-10-09
**One thing:** T1 L1 — Local first: the write lands on the phone before any network · check: pending

Dispatched session (`/dispatch`, FAB round 2, Wave 3), CUL-1657, a sub-issue of CUL-1655 (PM ruling D6, 2026-10-07). It was built from the plan excerpt with no plan gate, because there is no migration, RLS, deletion or clinical surface. Shipped via #1129.

## What shipped

- **The split stool pill** (`components/log/FAB.tsx`, `StoolSplitPill`). The fan's Loose stool row becomes one Stool pill. The glyph and "Stool" are identity, and two segments are the controls:
  - **Normal** opens `openLogSheet('stool_normal')` and **Loose** opens `openLogSheet('diarrhea')`, the same confirm the sheet already uses.
  - Each segment is a 44 by 44pt `Pressable` with no hitSlop. The pill around them is a plain `View`, so nothing between the two segments can take a press.
  - The labels are the sheet tile's own words, "Log normal stool" and "Log loose stool".
  - The pill keeps the row's key and slot, so the order and the eight slots are unchanged.
  - At the largest text sizes the pill wraps instead of squeezing "Stool". The fan budget plans the row as `Stool Normal Loose`, because that is everything it draws.
- **The writer** (`lib/captureChanges.ts`, `recordCaptureChange`). It writes the first rows into PR-29's `capture_changes`, then fires and forgets the push. It meets every point of the contract PR-29 posted on the issue:
  - a fresh id per row;
  - only pets in the store, which are written remote-first;
  - `INSERT OR IGNORE`;
  - `first_seen_at` is the phone's ISO clock.
- **The record's timing.** The pill's mount effect takes the date synchronously and writes it for every pet of the account that lacks a row. React flushes a mount's passive effects before it handles the next touch, so no Normal tap can predate the date. Later opens write nothing. A pet that joins later gets its own row the first time the fan shows it.

## Decisions

- **No chevron on the split pill.** The ruled §04 frame draws it without one, and a chevron at the end would sit on Loose alone. This is a team call under CUL-1644's rule, logged in the PR and put on the device sitting's list.
- **Per pet "lacking one", not "the account's first showing only".** A pet created later, or brought back from archive, gets a row dated the first time its fan shows Normal. That is a true fact about that pet, and it is never later than its first possible tap.

## Reviews

- **code-reviewer: ship-ready.** Every point of the contract was checked: fresh ids, pets on the server, INSERT OR IGNORE, the phone's clock. So were C-5, C-7, C-26 and the import cycle. Two nits, both left as they are:
  - A sign-out wipe between the SELECT and the INSERT. The window is tiny, and the result is a quarantined row.
  - The `join` and `split` round trip.
- **adversarial-reviewer: FAIL (low, bounded).** Three breaks, and one path that held only narrowly:
  - **A mount write that throws, then a Normal tap.** Fixed here: each segment asks `recordCaptureChange` again as it is tapped. That is a no-op normally, and it dates the row at the tap after a failed mount write. Proven red by mutation.
  - **Events landing before the capture row.** The path held, but narrowly: if a push was cut off between the two, the events landed first. Fixed here: `pushAllQueues` sends `capture_changes` first, so a phone's change date leaves before any event logged after it.
  - **Two phones, where the first to show the pill is unsynced when the second's row lands.** The server's UNIQUE keeps the later date, and the push counts the earlier phone's 23505 as landed. 091's header understates this: it says "both offline" and "days at most", but one unsynced phone is enough and the span has no upper bound. The fix needs a migration (keep the earlier date on conflict, or read the MIN) and a PM ruling. It was filed, not built.
  - **A quarantined row never reaches the server, and the writer never rewrites it.** PR-29c's reader must treat a missing row as unknown, never as "no change". This was passed to PR-29c with the other reader notes: backdated logs, no disclosure without earlier data, one day boundary, and saying the mix moved, not only the normal count.

## Tests

- `lib/captureChanges.test.ts` runs the writer against a real node:sqlite database. It covers one row per pet with distinct ids, the first date standing, an empty or duplicated pet list, and the push.
- `components/log/FAB.test.tsx` adds the segments' routes and veil hand-off, C-5 (each segment its own responder, no slop, the floor, nothing touchable around them), C-7 labels, the order, and the record. The record test checks it is asked for on the first frame Normal exists, for every pet, dated inside the open; that a pet joining later is recorded; and that no pet means no record.
- Mutation-proven: dropping the writer's call reds both record tests, and a wrong label reds C-7.

## Residuals

- Reduce Motion and the phone check ride the device sitting (CUL-1287).
- The two-phone date race in 091 is a filed follow-up, waiting on the PM.

## Teach

### One thing — Local first: the write lands on the phone before any network (T1, L1)
When the fan first shows the split pill, the app writes down the date on the phone itself, in a small database that lives on the device. Only after that does it try to send the row to the server. If the phone is offline, or the server is slow, nothing is lost: the row waits on the phone, marked "not sent yet", and the next sync sends it.

**Like:** writing a cheque stub in your own chequebook first, then posting the cheque. If the post is late, the stub already says the date you wrote it.

**In today's work:** `lib/captureChanges.ts`, the line inside `recordCaptureChange`
`INSERT OR IGNORE INTO capture_changes (id, pet_id, change_key, first_seen_at) VALUES (?, ?, ?, ?)`: save the row on the phone, with today's date, unless this pet already has one. The push to the server comes after it and is allowed to fail.

**Why it matters to you as PM:** the date the vet report shows is the moment the owner's phone first offered Normal, not the moment a flaky connection let the row through, which is what keeps the disclosure honest.

**Check:** an owner opens the fan for the first time on a plane with no signal, logs a normal stool, and lands two days later. Which date does the vet report disclose: the flight, or the landing?
