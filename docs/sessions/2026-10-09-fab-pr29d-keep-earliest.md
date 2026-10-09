# FAB PR-29d: capture_changes keeps the earlier date when two phones collide

**Date:** 2026-10-09
**One thing:** none — dispatched session, not this round's teach row

Dispatched session (`/dispatch`, FAB round 2), CUL-1701, ruled option A by the PM on 2026-10-09. The row was plan-gated (a migration and a function-security change): the plan was posted on the issue and the PM typed the go in this session. Shipped via #1131. The PM typed `apply 093` in this session and it was applied (live version 20261009194024); this session does not merge the PR.

## What shipped

- **Migration 093** (`supabase/migrations/093_capture_changes_keep_earliest.sql`) adds `public.record_capture_change`, a `SECURITY DEFINER` function with `search_path = ''`.
  - It refuses with one constant 42501 unless the pet is the caller's.
  - On a `(pet_id, change_key)` conflict it only ever lowers `first_seen_at`, and it never touches `created_at`.
  - EXECUTE is granted to `authenticated` only.
- **The push** (`lib/sync.ts`, `drainCaptureChangesQueue`) calls the function instead of a plain insert.
  - A 23505 is no longer counted as landed: under the function it is an id collision, so it is terminal and the row quarantines.
  - PGRST202 (093 not yet applied) is transient, so rows wait with their attempts unspent.
- **091's header** is corrected, comment only: one unsynced phone is enough, and the error has no upper bound.

## Decisions

- **DEFINER over INVOKER.** INVOKER needs an UPDATE grant plus an UPDATE policy, which would let every client issue direct UPDATEs on an append-only table. DEFINER keeps "no role holds UPDATE" true and confines the one write that may lower a date to the function body.
- **091's column INSERT grant stays**, so builds already on phones keep their plain insert, with today's first-wins behaviour.

## Reviews

- **Probe** (local PG16, 091 + 093 over Supabase-style roles and default privileges):
  - Day 2 lands first, then day 1 arrives: the row moves to day 1 and `created_at` is unchanged.
  - A later date is a no-op, and a replay is a no-op success.
  - Account B on A's pet, and on a pet that doesn't exist, both get the same 42501. A's row is unchanged.
  - anon and service_role cannot execute the function, and a token with no `sub` gets 42501.
  - A direct UPDATE is still `permission denied`.
- **rls-privacy-reviewer: PASS**, every boundary HELD. The row-id 23505 oracle is never wider than under 091's plain insert.
  - N1 (DEFINER keeps DETAIL lines) and N3 (verify the owners) went into 093 as comments.
  - N2 (a 1970 phone clock now lowers the date for good) was filed as CUL-1706, a floor in the report's reader.

## Tests

- `lib/captureChanges.test.ts`: the push suite now runs on the RPC. It pins the parameter list against 093, the 23505 quarantine, the PGRST202 wait, and that one refused row does not hold back the next.
- `tsc` is clean. `jest lib/sync lib/captureChanges guards` passed 1363 on three runs. One earlier run showed a single failure that was not captured and did not reproduce.

## Residuals

- **Applied** on the PM's typed `apply 093`, live version 20261009194024. The VERIFY block passed live. A live probe from an account with no pets got the constant 42501 on a real pet and on a pet that does not exist; anon got permission denied; no row was written. `get_advisors`: security raised 0029 (a DEFINER function signed-in users can run), which is intended and shared with `record_ai_usage`; performance raised nothing on this table or function.
- Still open: one live call with a real user token on that user's own pet (expect 204). Making it writes a real row, so it is the PM's call. The first build carrying this client exercises it anyway.
- The PR merges once CI is green on its head; this session does not merge it.
- CUL-1706: a floor in the reader for an implausibly early date (a Data Scientist call).
