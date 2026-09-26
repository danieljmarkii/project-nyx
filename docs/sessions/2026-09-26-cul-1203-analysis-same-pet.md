# CUL-1203 — a per-incident read can only sit on an incident of its own pet (migration 073 + the analyze-* write-back)

**Date:** 2026-09-26
**Mode:** BUILD · **Issue:** CUL-1203 (Engines v3 · Wave 0 · Live fixes) · **Also touched:** CUL-882, CUL-881, CUL-736 (comments), CUL-1325 (filed)
**Outcome:** shipped via #939. Migration 073 is **applied to production** (version `20260926212721`). The Edge Function half deploys `analyze-vomit` and `analyze-stool` on merge (`ask` only mentions the shared module in comments and is not in the closure).
**`STATUS.md`: untouched.** No track started or ended, no standing hold changed, no pointer went stale. This is a Wave 0 fix inside a live project.

---

## The hole, proven live before touching it

`event_ai_analysis` had one policy, `FOR ALL USING (pet_id IN <the caller's pets>)`, and nothing tied `event_id` to `pet_id`. The `events(id)` FK is checked without RLS, and `UNIQUE (event_id)` lets the first row win. Any signed-in account holding another account's event id could insert `{victim's event, own pet, edited_at}`. When the victim's read ran, the `analyze-*` write-back took its humanEdited branch and updated **by `event_id` alone**. The victim pet's read, which names the pet and carries the `worth_a_call`, landed in the attacker's row, and the owner never saw it. Re-pointing an owned row's `event_id` did the same.

One probe, a DO block that creates three synthetic accounts and RAISEs at the end so everything rolls back, ran against production before the fix. It returned **22/22 as predicted**, including the plant, the re-point, and case E1, where the attacker account read back the victim's read after an unkeyed service-role write-back. Rollback was verified: 0 probe users or pets remained, and the table was still at 116 rows.

## What shipped

1. **Migration 073.** `enforce_event_ai_analysis_same_pet()`, `BEFORE INSERT OR UPDATE`:
   - INSERT requires the event to be an event of the row's pet.
   - UPDATE freezes `event_id` and `pet_id`.
   - `SECURITY DEFINER`, `search_path = pg_catalog, pg_temp`, EXECUTE revoked from all three client roles, one RAISE naming only `NEW.*` (C-31). Registered in `lib/functionHardening.test.ts`.
   - `REVOKE INSERT` from `anon` / `authenticated`.
   - §3, an at-rest assertion (below).
2. **`supabase/functions/_shared/incident-analysis.ts`.**
   - Step 3b reads `pet_id` and refuses a row filed under another pet with a 409, before the usage counter and any write.
   - Every UPDATE goes through `updateAnalysisRow`: keyed on `event_id` and the event's `pet_id`, with a zero-row check (C-39).
   - The catch's re-read asks the same whose-row question before its recommendation may steer the failure write.
3. **Tests.**
   - Deno unit tests over an in-memory table that applies the `.eq` filters, so the plant is driven end to end and the assertion is on what the row holds.
   - A static scan: every `event_ai_analysis` update under `supabase/functions` keys on `pet_id`. Blind spots are stated in the file.
   - A wiring pin: step 3b reads `pet_id`, refuses, and returns a 409.

## Two PM rulings this session

- **Option A: one PR for both halves.** The issue said "Migration in its own PR". The rule's purpose is to keep schema changes out of UI work, and it holds when the only other half is server-side and closes the same hole (067 precedent). Recorded as a flagged conflict, ruled by the PM.
- **Freeze, not re-check, on UPDATE (a better-than-the-rule brief).** The issue and the CUL-1268 comment specified C-38's shape: re-run the lookup when either column changes. That shape brings back the membership oracle 047, 064 and 067 each disclosed. **Measured** on a PG16 replay: the re-check variant answers 42501 for a real victim pair and 23514 for a fake one. The freeze answers 23514 for both. Nothing legitimate moves either column; the client edits name neither, and the server upsert re-sends the same values.

One more departure, taken without a ruling because it is the newest house form rather than a design choice: `search_path = pg_catalog, pg_temp`, not the comment's `''`. 072 (same day) found that `''` still searches `pg_temp` first for types. That is noted in the header.

## Verification

- **Local PG16 stub** (roles, Supabase's explicit default grants, `auth.uid()` from claims, the live `pets` / `events` policies, then 013 verbatim): pre 22/22, post 22/22.
- **Mutations on the migration:**
  - Dropping the freeze reds 6 cases.
  - Dropping the INSERT revoke reds 4. It also showed the trigger alone still refuses the plant, so each layer holds independently.
  - Dropping the INSERT check reds 1.
  - Switching the function to INVOKER survives the probe, as predicted: clients cannot insert and the service role bypasses RLS. `lib/functionHardening.test.ts` reds it (proven).
  - Dropping only the `authenticated` REVOKE survives the hardening guard. That is the known CUL-881; commented there as a second instance.
- **Mutations on the server:**
  - Dropping the pet filter reds 3.
  - Dropping the zero-row check reds 2.
  - Fail-open on a missing pet reds 1.
  - An unkeyed failure write reds 1.
  - Dropping `pet_id` from the 3b select reds at type-check (TS2345, for the right reason).
  - Disabling the refusal reds 1.
  - A log-only refusal and an adjacent laundering query both red after the review fixes; before them they survived (below).
- **Suites:** Deno 1857/1857, `deno check` over every function clean, `tsc` clean, jest 11,950 passed.
- **Production after apply:** the probe returned 22/22 on the post phase. Posture:
  - client grants are SELECT / UPDATE / DELETE only, with no INSERT and 0 column ACLs;
  - the guard is DEFINER with `pg_catalog, pg_temp`, ACL `{postgres, service_role}`;
  - both triggers are present;
  - 116 rows, 0 mismatched.
- **Advisors:** security unchanged (the two standing findings). Performance unchanged (`auth_rls_initplan` 27, unindexed FKs 9).

## The reviews

**`rls-privacy-reviewer`: PASS, no blocking findings, four hardening items, all taken.**

- **Every cross-account attack held:**
  - every client INSERT and upsert shape returns 42501 whatever ids it names, so the pre-fix FK (23503) and unique (23505) oracles are gone too;
  - every re-point returns one identical 23514;
  - zero-pet, no-sub and anon JWTs are refused;
  - a temp `events` table plus a temp `=` operator still gets 23514;
  - the guard cannot be called over RPC;
  - a service upsert over a planted row is refused;
  - Realtime INSERT/UPDATE held, traced rather than run.
- **H1.** A row planted before the apply would outlive the trigger and, under the new 409, **permanently suppress that victim's read, including the deterministic "Worth a call"**. Fixed with 073 §3, which counts mismatches after `CREATE TRIGGER` so the table lock closes the gap. Proven: applied over a planted row, the whole migration rolled back (no trigger, INSERT still granted).
- **H2.** A log-only refusal survived the wiring test. It now asserts the branch returns a 409.
- **H3.** An unrelated `.eq('pet_id')` on the next line laundered an unkeyed update past the scan. The chain now ends at the next statement or `.from(`.
- **H4.** A moved event's read can no longer refresh: the freeze removed the upsert's self-heal. Same account only; recorded in the header and on **CUL-882**.
- Informational: O1 (anon/authenticated keep TRUNCATE / REFERENCES / TRIGGER; unreachable through PostgREST); O2 (filed as CUL-1325, below); O3 (the service role's EXECUTE is by design); O4 (the export script's `event_id` join, now sound because of 073, noted on CUL-736); O5 (`ask` is not in the redeploy closure, which corrected my plan).

**`code-reviewer`: fix-before-merge on one item, all three taken.**

- **#1.** The catch's re-read was the one read of the table not asking whose row it was, so a stranger's recommendation could steer the failure write. It now folds a foreign row into "could not read", and the failure write then writes nothing.
- **#2.** A `;` inside a comment could end a scanned chain early and drop an update from the scan unseen, while the floor only asserted `>= 1`. Comments are now blanked in one string-aware pass, and the floor requires the helper's own chain.
- **#3.** A comment claimed `applyAnalysisWriteBack` was the only write; narrowed to what it actually covers.

## Filed and routed

- **CUL-1325** (Low): Realtime delivers every account's `event_ai_analysis` DELETEs to any subscriber. Only a row id and timing, not health data; pre-existing (059).
- **CUL-882** comment: `event_ai_analysis` joins the child list, and the freeze's self-heal cost.
- **CUL-881** comment: a second instance of the PUBLIC-revoke shortcut failing open.
- **CUL-736** comment: this table's `event_id` join is now sound at the schema.
- `docs/engineering-lessons.md` §C-38 addendum: freeze beats re-check when nothing moves; a write guard does not judge rows at rest; a scan's boundary is part of the guard.

## Residuals

- A moved event's read cannot refresh until its stale row is deleted, and there is no UI for that. Same account only; no app path moves an event. Tracked on CUL-882.
- The scan's chain boundary is still a text heuristic, and the comment blanker does not parse regex literals. Both are stated in the test file. The invariant itself is the trigger.
