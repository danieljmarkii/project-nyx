# FAB PR-29: the day each pet's fan first offered Normal stool (migration 091)

**Date:** 2026-10-09
**One thing:** T4 L1 — RLS: the database answers "not yours" and "does not exist" the same way, so a stranger learns nothing · check: pending

Dispatched session (`/dispatch`, FAB round 2, Wave 3), CUL-1656, a sub-issue of CUL-1655 (PM ruling D6). Plan-gated: the plan went on the issue, and the PM typed the go in this session. Shipped via #1126, left open for the PM to apply 091. This session does not merge it.

## What shipped

- **Migration 091, `capture_changes`.** One row per pet per capture change. Its columns are `id`, `pet_id`, `change_key` and `first_seen_at`, plus a server-stamped `created_at`. `UNIQUE (pet_id, change_key)`, and rows cascade from pets.
  - Append-only by RLS alone, the 082 shape: a read policy and an insert policy by pet ownership, column-level INSERT, and no UPDATE, DELETE or TRUNCATE for any role, service_role included.
  - The first key is `fab_stool_split`. The next capture changes (CUL-439, CUL-288) add their own keys to the same table.
- **Local mirror, wipe and push.**
  - The mirror lives in `BASE_SCHEMA_SQL`, insert-only, with a local UNIQUE so PR-29b can `INSERT OR IGNORE`.
  - The table is in `LOCAL_WIPE_TABLES`.
  - `syncPendingCaptureChanges` reuses `insertQueuedRows` and counts a 23505 as landed. It is registered as an insert-only queue and wired into `pushAllQueues`.
- **`lib/captureChanges.ts`.** `CAPTURE_CHANGE_KEYS`, pinned by a test to 091's CHECK so PR-29b cannot write a key the server refuses.

## Decisions (in the plan the PM approved)

- **No trigger.** The only link is the pet, and RLS WITH CHECK runs before the FK. A foreign pet and a missing pet therefore get the same 42501, which leaves no membership oracle to close. C-31 does not apply. The privacy reviewer measured this on Postgres 16, including with a bad key and a NULL date.
- **Per pet, not per account (Data Scientist).** The report is per pet, and RLS, the cascade and deletion all key on the pet. The account-wide fact is carried by the writer, PR-29b, which writes one row for every pet on the fan's first showing. A pet created later needs no row.
- **Two clocks.** `first_seen_at` is the phone's clock and `created_at` the server's. PR-29c discloses `LEAST(first_seen_at, created_at)`, so any error lands early, never late. There is no CHECK on the date, because a terminal 23514 would lose the disclosure.
- **UNIQUE kept, first to arrive wins.** Two offline phones would keep the earlier *arrival*, not the earlier clock. The error is bounded at days and the cost is stated in the header. The alternative, dropping the UNIQUE and reading MIN, was offered in the plan and not taken.

## Reviews

- **rls-privacy-reviewer: PASS.** It ran 091 on a local Postgres 16 copy of the Supabase roles. Every attack held: cross-account read and write, anon access, UPDATE, DELETE, TRUNCATE, a merge upsert, a `created_at` write, and moving a pet to another account. The cascades worked despite the revokes.
  - One LOW finding, carried to PR-29b as a contract: the push treats any 23505 as landed. So the writer must mint a fresh id for every row and write only for pets already on the server.
- **code-reviewer: no bugs.** Mutation runs proved that the sign-out, 23505 and wipe tests each go red when their behaviour is broken.
- **CI:** all five checks green on `bd1b56d`.

## Residuals

- 091 is **not applied**. The PM types `apply 091` in a session, then runs the VERIFY block, `get_advisors`, and one live probe from a second account.
- The PR merges only after that, and it is not this session's to merge.

## Teach

### One thing — RLS: "not yours" and "does not exist" get the same answer (T4, L1)
Row level security means the database checks every row against "does this belong to the person asking?" before it does anything else. Today's table relies on that. When someone tries to file a row against a pet that isn't theirs, the database refuses with exactly the same error it gives for a pet that doesn't exist at all. Because the two answers are identical, a stranger who guesses an id learns nothing about whether it is real.

**Like:** a building's front desk that says "I can't help you with that unit" whether the unit is someone else's flat or a number that doesn't exist. A desk that said "that's Mrs. Lee's flat, you can't go up" would leak who lives there.

**In today's work:** `supabase/migrations/091_capture_changes.sql`, the insert policy
`WITH CHECK (pet_id IN (SELECT id FROM public.pets WHERE user_id = (SELECT auth.uid())))`: only accept the row if its pet is one of the asker's own pets. This runs before the check that the pet exists, so both kinds of wrong pet stop here, with the same message.

**Why it matters to you as PM:** it is why this table needed no extra safety trigger. Migration 082 needed one because its rows point at events and visits as well as pets.

**Check:** if someone added a rule that first checked "does this pet exist?" and gave its own error message, before the ownership check, what could a stranger learn by trying random ids?
