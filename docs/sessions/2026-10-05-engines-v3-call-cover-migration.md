# CUL-1602 part 1: migration 084, a call's cover stored on the call

**Date:** 2026-10-05
**One thing:** none — continuation of the PR-36 session, no new teach row

The same session as `2026-10-05-engines-v3-pr36-call-record.md`, after the PM ruled A on CUL-1604: hold PR-36 (#1072), store the cover on the server, and rebuild the client on it. BUILD on CUL-1605 (a sub-issue of CUL-1602). Shipped via #1074, **not applied**: the PM applies it on his word.

## What it is

Two columns on `vet_calls`, set on the root call only:
- `covers_rank`: 1 for call today, 2 for call now.
- `covers_from`: the bout's start, as shown at the tap.

One `CHECK` holds both directions: a root carries the whole cover, and a note edit or an Undo carries none. The client's `INSERT` column grant is extended; there is still no table-level grant, so `created_at` stays the server's. Nothing else changes: no table, policy, trigger, function or secret.

## Why

All five adversarial passes on PR-36 broke on one thing: a call's coverage was recomputed from per-incident tiers that keep moving, and a second phone had no rank to read. Storing the cover once, at the tap, makes it a fact every phone reads the same way.

## Proof

- **Replay.** 082 then 084 on a local PG16 with stubbed parents and `auth.uid()`. Every probe was run as an owner:
  - A root with its cover lands.
  - A root with no cover, or half a cover, is refused.
  - Rank 3 is refused.
  - An Undo with no cover lands.
  - A note edit carrying a cover is refused.
  - An `UPDATE` of the cover is refused (no grant), and so is a client-written `created_at`.
  - Another account's write is refused by 082's guard with its one message.
  - The `pets` cascade still empties the table.
- **Non-empty table.** On a table already holding a row, 084 fails as a whole. Found on the way: as two statements, the columns landed before the CHECK failed. It is now one `ALTER TABLE`, measured to leave nothing behind.
- **Production row count:** 0 rows in `vet_calls` and `vet_call_follow_ups` (read-only count, 2026-10-05).
- **Guard:** `guards/careRecord.test.ts` reads every migration from 082 on. A mutation that grants `UPDATE` in 084 reds it.

## Next

- PR-36 (CUL-1419) rebuilds the client on these columns:
  - write the cover at the tap;
  - push and pull both columns;
  - coverage reads only the stored cover;
  - then a fresh adversarial pass.
- PR-36 must not merge before 084 is applied.
