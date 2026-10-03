# Out of beta PR-18: the looks same-pet guard stops leaking a date through its error code (CUL-1457)

**Date:** 2026-10-03
**One thing:** T3 L1 — A migration is code until someone applies it · check: pending

Dispatched session (`/dispatch`, PR-18), BUILD. Shipped via #1029, holding migration 083. The dispatch prompt left the apply and the merge to the PM. The PM then ruled in this session ("apply 083 and merge"). 083 was already live when that ruling arrived, recorded as `looks_guard_caller_check` at 21:06 UTC, so it was verified rather than applied again (see After the apply).

## What shipped

- `supabase/migrations/083_looks_guard_caller_check.sql`, in two halves, both copied from 082:
  - **§1, the caller arm.** CREATE OR REPLACE `enforce_look_paired_event_same_pet` so a signed-in caller's write is checked for "is this pet yours?" before the parent `check_in` is read. Another account's pet now always gets 23514 and the same message.
  - **§2, `REVOKE ALL ON TABLE public.looks FROM anon`.** See below for why the arm alone was not enough.
- `guards/looksSamePetGuard.test.ts`: pins the last definition in filename order. It checks that `me := auth.uid()` is bound, that the only `public.events` read sits inside the arm, that there is one RAISE naming only `NEW.*`, and the DEFINER / `search_path = ''` posture. It also checks that the last anon grant statement on `looks` is the revoke. Six mutations each red it:
  - dropping the arm,
  - adding a lookup above it,
  - putting `parent_day` in the RAISE,
  - deleting the revoke,
  - appending a re-grant,
  - deleting 083.

## The probe

The probe ran on a local PG16 replay. It used the real function text from 064 and 083 and Supabase's live `auth.uid()` definition, confirmed by a read-only live query that also showed the deployed body equals 064's. The victim's `check_in` sits at 2026-09-20 15:00 UTC, and the caller swept `local_day` across it.

**Zero-pet JWT.** Before 083: 42501 on 09-19, 09-20 and 09-21, 23514 on every other day, so the date is recoverable. After: 23514 on all eleven days.

**anon key.** Before: the same band. After: a constant 42501.

**Unchanged:** the owner's own write (accepted on the day, 23514 two days off) and the service role.

## What broke and how

The first cut was the caller arm alone. `rls-privacy-reviewer` returned **FAIL**: the arm trusts every request with no user, the anon key carries none, and anon still held Supabase's default verbs on `looks`. A read-only live check confirmed anon holds INSERT/UPDATE/SELECT there today. So an anon-key POST read the parent, and RLS answered 42501 inside the band: the same oracle, now with no account.

082 is safe with the same arm only because it revokes its tables from anon. 083 now does the same. Nothing reads or writes `looks` as anon: the client syncs signed in, and `generate-report` reads under the caller's JWT.

The reviewer's other attacks all held:
- the owner's UPDATE moving `pet_id`, `event_id` or the day,
- an attacker's UPDATE/DELETE (0 rows),
- ON CONFLICT upserts (the client's path),
- the service role with and without a sub,
- a non-uuid sub,
- the posture and the trigger binding.

Three header claims were corrected:
- the row-id oracle over upsert is 42501, not 23505;
- the rollback must not re-run 064's `CREATE TRIGGER`;
- "no user" is not the same as "service role".

## Residuals

- **The class.** Other DEFINER same-pet guards (023 / 041 / 045 / 066 / 067) sit on tables where anon still holds INSERT, so their disclosed membership oracle is reachable without an account. That is recorded on CUL-1059, whose broad anon revoke is the fix, not folded in here.

## After the apply

083 was already recorded live when the PM said "apply and merge", so this session did not run it a second time. The live database was read instead:
- The deployed function body is 083's (the caller arm before the events read).
- DEFINER, `search_path = ''`, and no anon/authenticated EXECUTE.
- `trg_looks_same_pet` is bound and enabled.
- anon holds no INSERT, UPDATE or SELECT on `looks`; authenticated keeps INSERT.
- The applied statements include the anon revoke.

**The live after-probe** ran in one DO block that RAISEs at the end, so it rolled back. It used the newest real `check_in`, days −3 to +3:
- a zero-pet JWT got 23514 on all seven days;
- anon got 42501 on all seven days;
- no message held the parent's date.

**`get_advisors`:** security shows the same two existing findings (`record_ai_usage` kept on purpose, and leaked-password protection). Performance is unchanged: `auth_rls_initplan` 27, unindexed FKs 9.

## Teach

### One thing: a migration is code until someone applies it (T3, L1)

The app's cloud database has a shape: its tables, its rules, its guard functions. That shape changes only when a migration is applied. A migration is a numbered script in the repo, and writing it and merging it changes nothing in the live database. Someone has to run it against the real database. Until then the repo describes a database that does not exist yet.

**Like:** an architect's revised blueprint. Filing it at city hall does not move a wall; a builder has to show up.

**In today's work:** `supabase/migrations/083_looks_guard_caller_check.sql:148`
```
REVOKE ALL ON TABLE public.looks FROM anon;   -- take every permission on looks away from the not-signed-in role
```
When this was written, the live database still let anon write to `looks`. That line fixed it only when 083 was applied, not when the PR was written or merged.

**Why it matters to you as PM:** "the fix merged" and "the fix is live" are two separate events with two separate approvals. This PR deliberately waits for your apply, so the merge cannot claim a protection the database does not have yet.

**Check:** if #1029 had merged before 083 was applied, could an anon caller still have read the date through the error code, and why?
