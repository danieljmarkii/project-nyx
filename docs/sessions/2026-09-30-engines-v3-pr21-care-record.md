# Engines v3 PR-21: the care record (migration 082)

**Date:** 2026-09-29 → 2026-09-30

Shipped via #988 (CUL-1415, CUL-1416). Migration 082 was applied to the live database this session, on the PM's instruction ("apply the migration via MCP"), as live version 20260930001048 `care_record`.

## What shipped

- **`supabase/migrations/082_care_record.sql`** creates three tables in the vet-visit family.
  - `care_acknowledgements` holds the owner's "my vet knows" facts, one sign per row, each with its source and anchor date.
  - `vet_calls` is "I've called", with an owner-only note.
  - `vet_call_follow_ups` is the ledger behind "What did the vet say?".
- **Append-only by RLS alone.** Each table has a SELECT policy and an INSERT policy. UPDATE, DELETE and TRUNCATE are revoked from the client roles and from `service_role`. There is no DELETE trigger. The client INSERT grant is per column and leaves out `created_at`.
- **Cascades.** Every table cascades from pets, and every other FK cascades or sets NULL.
- **Same-pet guard.** One SECURITY DEFINER `BEFORE INSERT` trigger checks every link: event, visit, trial, course, retracts, supersedes and the ledger's call. It raises one message naming only `NEW.pet_id` (C-31).
- **Ownership arm, stricter than 066/067/074.** For a signed-in caller, the row's pet must also be the caller's. That closes the 047-class 42501-vs-23514 membership oracle; the earlier migrations disclosed it.
- **Build calls that depart from spec §8's draft DDL** (posted on CUL-1415):
  - `vet_calls.withdrawn` added, so an Undo is distinguishable from an edited note.
  - `vet_call_id` is nullable for `sampled` rows.
  - The one-owed rule is enforced per call record, not per `(pet_id, event_id)`, so Undo followed by a re-call works.
  - The sign CHECK is pinned to chronicity ∪ worsening.
- **`guards/careRecord.test.ts`** covers:
  - The note rule over `supabase/functions/`, with an empty allow-set and statement scope, including rows swept into JSON.
  - Explicit column lists on every server read.
  - Replay pins over every migration from 082 on: RLS never disabled; policies pinned by verb and predicate; no forbidden grant, including schema-wide and quoted forms; `created_at` never granted; triggers only BEFORE INSERT and never dropped; the latest guard definition keeps its ownership arm; no view or other function over the tables.
  - The sign set.
- **Registry edits:**
  - `guards/visitReaders.test.ts` now scans the three tables.
  - `lib/functionHardening.test.ts` registers the guard function.
  - The membership walk gains the SQL sign list (25 rows).
- **CLAUDE.md** gains the care-state Read-These row, paid for by compacting the daily-look row. The old row is kept verbatim in `docs/engineering-lessons.md` §R-13.

## How it was checked

**Local PG16 replay** with a Supabase-shaped stub, each probe in a rolled-back transaction:
- Positive controls land.
- Every cross-tenant link is refused.
- A real pair and a fake pair naming another account's pet return identical errors. The mutant without the ownership clause returns 42501 versus 23514, so that clause is what closes the oracle.
- UPDATE, DELETE, TRUNCATE, merge upserts and a client-set `created_at` are refused, including for `service_role`.
- Deleting the account leaves 0 / 0 / 0 rows.
- Hard-deleting a visit SET NULLs cleanly; deleting a trial or an event cascades.

**rls-privacy-reviewer: PASS.** No boundary broke. It raised three residuals, all taken:
1. A row-id existence oracle through primary-key collision. It is platform-generic, needs an unguessable UUID, and is now disclosed in the migration header and the guard.
2. The guard's variable-table and database-side blind spots. The first is now stated in the guard. The second is closed by the view and function pins, for migrations from 082 on.
3. Push ordering for PR-35/36: the parent event must sync first, because the guard answers before the FK does. This is in the header and on the issues.

**code-reviewer: fix-before-merge.** The guard's replay passed real undoings: a DISABLE of RLS, a second `created_at` grant, `CREATE OR REPLACE TRIGGER`, an `AS PERMISSIVE` policy, and a later redefinition of the function. The note window also missed a long column list. All were fixed.
- **Proof:** each of the reviewer's mutants, plus six more, was planted as a real `083` file or function file, and each reds the guard; both controls stay green.

**Rejected finding.** The reviewer suggested a partial unique index on `vet_calls (pet_id, event_id) WHERE supersedes IS NULL` to stop a double tap from owing two questions. It would also refuse the re-call after an Undo, because that row too has no `supersedes`. An append-only table cannot express "one live call" with an index. Deduplication stays with the writer (PR-36), recorded on CUL-1416.

**Live apply:**
- The VERIFY block matched: six policies; `authenticated` holds SELECT plus INSERT per column; `service_role` holds INSERT, REFERENCES, SELECT and TRIGGER; three enabled triggers; the function is DEFINER, pinned, and owned by `postgres`.
- `get_advisors` shows nothing new on these tables beyond "unused index" INFO on the fresh indexes.
- A rolled-back live probe gave: a foreign-pet insert returns 23514, an UPDATE returns 42501, and a client-set `created_at` returns 42501.

## Residual / next

- **The local mirror** (the SQLite tables, `LOCAL_WIPE_TABLES`, and cancelling the `follow_ups` notifications in `wipeLocalSession`) ships with the first client writer, PR-35/36. `hydration.test.ts` enforces the wipe half.
- **Ledger precedence.** Which status wins when "answered" meets a later "expired" or "withdrawn" row is the reader's rule, decided at PR-36.
