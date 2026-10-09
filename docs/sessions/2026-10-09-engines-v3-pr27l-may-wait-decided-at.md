# Engines v3 PR-27l: may_wait stamps when the leave was first granted (migration 094)

**Date:** 2026-10-09
**One thing:** none — dispatched session, not this round's teach row

Dispatched build of CUL-1707, shipped via #1135.

**094 is unapplied.** Applying it takes the PM's typed `apply 094`. This PR merges only after that, because the phone selects the new column. No Edge Function changes, so merging deploys nothing.

PM rulings:
- **Go A:** one PR, not a schema-only split.
- **Ruling A** on the re-read residual: the stamp is set once, by a database trigger.

**The gap (CUL-1629, PR-27f's adversarial finding 1).** "First thing tomorrow" covers one night, ending at the first local 6 AM after the decision. The phone had no decision time. `updated_at` moves on every write, a Hide or a Show included. So PR-27f bounded the night by min(`updated_at`, the incident's time). That bound is safe, but it ends a late read of an older vomit before its night has run.

**First draft, and why it changed.** The first draft stamped the time of every server write that carried `may_wait`, through a writer helper at the five write sites. Both reviews returned HOLDS on its invariant (no stamp newer than its TRUE). Both also found the same residual: the server's predicate never reads an incident's age, so a second read of an old call-today vomit re-stamped it and started a fresh night that PR-27f's bound used to refuse. The PM ruled A, and the helper and its scans were reverted.

**What shipped.**
- **Migration 094.**
  - Adds `event_ai_analysis.may_wait_decided_at timestamptz`: nullable, no default, no backfill.
  - Adds the trigger `trg_event_ai_analysis_stamps_may_wait_once`. It fires BEFORE INSERT OR UPDATE and runs INVOKER, with `search_path` pinned and client EXECUTE revoked.
    - It stamps `now()` on the first transition to TRUE.
    - It keeps any stamp it finds, against every role.
    - It never stamps a TRUE that already stood before the migration.
  - The freeze is 088's body plus one line. It fires before the stamp trigger (name order), so a client's attempt to move the stamp is refused loudly (42501).
- **Phone** (`lib/mayWaitLine.ts`, `leaveDecidedAt`).
  - With a stamp, the night starts at min(stamp, `updated_at`).
  - With no stamp, PR-27f's bound applies.
  - A stamp that won't parse refuses the wait.
  - The column joins the analysis sections' one select.
- **Guards.**
  - `guards/mayWaitDecidedAt.test.ts` (new) pins:
    - the function's whole body, by equality;
    - that the trigger is live, enabled and BEFORE INSERT OR UPDATE (the replay drops it on a `DROP FUNCTION`, `DROP TRIGGER`, `DISABLE TRIGGER` or rename);
    - the firing order, read off the replay's own triggers;
    - that no Edge Function names the column.
  - `incidentReadFreeze.test.ts` adds the column to `SERVER_OWNED`.

**Proofs.**
- **Scratch Postgres 16**, 094 applied over 088's freeze and 075's `updated_at`. Nine cases held:
  - an insert of TRUE stamps; an insert of NULL does not;
  - a writer that names the column is overridden;
  - a re-read that keeps TRUE leaves the stamp unmoved;
  - lowering and then raising again keeps the first stamp;
  - NULL → TRUE stamps, never later than `updated_at`;
  - a TRUE written before 094 is never stamped, by a Hide or by a TRUE → TRUE write;
  - FALSE stays unstamped;
  - a client moving the stamp forward or to NULL gets 42501, while a client Hide or lower passes with the stamp kept;
  - the posture checks out (INVOKER, pinned, no client EXECUTE).
- **Mutants.** Dropping the "keep" branch turns P3 and P4 red. Dropping the transition condition turns P6 red. Each guard was also proven by mutation.
- **Phone.** The re-read test ("next evening keeps the first grant") passes. `lib/mayWaitLine` passes in Kiritimati, Chatham, Honolulu and New York. `tsc` is clean.

**A test race found on the way.** The "stored TRUE at 10 PM" tests, vomit and stool, asserted the wait line synchronously after an unrelated `findByText`. That raced the async fresh re-read, and the run failed 2 of 5 times under the added guard's load. Both now `await findByText` the line itself.

**The second adversarial pass** ran on Postgres 16 with the real 075, 088 and 094 bodies, and returned HOLDS for the invariant:
- a re-read upsert carrying a +1-day stamp: the first stamp is kept;
- lower, then raise: the stamp stays the first one;
- a client moving the stamp: 42501;
- a TRUE from before 094, re-read: stays unstamped;
- a conflicting insert: stamped once;
- an event moved between pets: the stamp is kept.

The guard did not hold the first time:
- An extra re-stamp arm, `DROP FUNCTION … CASCADE` and `DISABLE TRIGGER` all left it green.
- Its order test sorted constants restated in the test.

All fixed. The body is pinned by equality, and the replay models drops, disables and renames. Six mutants now fail (extra arm, no keep, drop function, disable, rename, the freeze firing after the stamp) and the clean tree passes. 094's first blind spot also understated its cost: a photoless call isn't capped, so re-creating one costs only a hand-made DELETE.

**Stated blind spots (in 094's header).**
- A row that is deleted and re-created loses its first stamp. No app path does this; by hand, a photoless call costs no cap.
- A TRUE from before 094, lowered and then raised, is stamped at the raise.
- The stamp is the write's transaction start, a moment after the verdict.

**Close-out.** CI is green on `fffc42a`. The PM typed `apply 094` in this session, but a dispatched session never runs `apply_migration`, so 094 waits for a non-dispatched session to apply it, then the merge. The PR is left for the PM.
