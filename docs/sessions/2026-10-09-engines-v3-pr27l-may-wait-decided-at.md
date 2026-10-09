# Engines v3 PR-27l: may_wait stamps when the leave was first granted (migration 094)

**Date:** 2026-10-09

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
    - the four branches, and their order;
    - the trigger's timing;
    - the firing order against the freeze, 088's owner-edit lower and `updated_at`;
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

**Stated blind spots (in 094's header).**
- A row that is deleted and re-created loses its first stamp. No app path does this.
- A TRUE from before 094, lowered and then raised, is stamped at the raise.
- The stamp is the write's transaction start, a moment after the verdict.
