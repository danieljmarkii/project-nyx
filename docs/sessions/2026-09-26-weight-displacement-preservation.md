# CUL-694 — keep the profile weight a write displaces (migration 072)

**Date:** 2026-09-26

Shipped via #925. Migration 072 is **applied to production** (two `apply_migration` records: `pet_weight_displacements` and `pet_weight_displacements_client_select_only`, both folded into the one repo file).

## Why this session existed

The Engines v3 critique (CUL-1268, BRK-11 / TD-1) raised CUL-694 from Low polish to High. `pets.weight_kg` is overwritten in place by every weigh-in re-point and by Edit profile, so every account's first logged weigh-in destroys its earlier profile weight. That is how Nyx's June 4.4 kg vanished under the 9/16 clinic 3.73 kg, the number the engines deep dive calls its most important fact. The critique's newest comment re-scoped the issue: stop the loss now, from both writers, into a place nothing reads, never as a `weight_checks` row.

## What was decided

- **Scope (PM, option (a)):** preservation only. The issue's original goal, restoring the value on a History Remove, is deferred to EN-8 (CUL-1135) or a follow-up, because a restore has to tell an owner-typed profile weight from a copied reading or an Undo leftover, and that is a reader's job.
- **Shape: a server trigger, not a client write, and not the issue's `weight_checks.displaced_snapshot_kg` column.** An `AFTER UPDATE OF weight_kg` trigger on `pets` writes each displaced non-NULL value into a new `pet_weight_displacements` table. It covers every writer (the weigh-in, Edit profile, the edit and delete reconciles, the CUL-293 retry), protects installed builds on apply with no client release, and needs no local mirror because `pets` has none. The column covered only the weigh-in writer.
- **What a row carries:** `weight_kg`, `replaced_by_kg`, `source = 'profile'` (taken *from* the field, not "typed by the owner"), and `held_since_earliest / _latest`, the window in which the value went on file. Exact when the previous displacement set it (checked through `replaced_by_kg`, so a NULL gap cannot fake a match) or the pet row was never edited; otherwise bounded by creation or the previous displacement and the row's last update.
- **The trigger can never refuse the write it watches.** AFTER (so its `RETURN NULL` is ignored; flipped to BEFORE it silently cancels every weight write, measured on PG16), and the insert is wrapped so a failure is `RAISE LOG`'d with the pet id and SQLSTATE only (C-31).
- **Clients read their own rows and write none:** owner SELECT policy, `REVOKE ALL` + `GRANT SELECT` to `authenticated`, nothing to `anon`, the identity sequence revoked, the DEFINER function not RPC-callable, `search_path = pg_catalog, pg_temp`.
- **Nothing reads it yet**, and `guards/weightDisplacements.test.ts` makes that empty reader set the assertion (C-32). EN-8 registers as the first reader.

## What the reviews found, and what changed because of them

- **rls-privacy-reviewer** held every PostgREST boundary and found two raw-SQL-only holes, both reproduced and closed:
  - Under the house `search_path = ''`, Postgres searches the session's temp schema *first* for type names. A client with TEMP created `pg_temp.timestamptz` as a domain whose CHECK called its own function, and the DEFINER trigger's `TIMESTAMPTZ` declarations resolved to it: 6 forged rows on another account's pet. `pg_catalog, pg_temp` (pg_temp last, the Postgres docs' recommendation) makes it 0. The repo-wide pass over the other `''`-pinned DEFINER functions is **CUL-1281**.
  - A client `setval` on the identity sequence made the next insert collide, and the trigger's swallow-and-log silently dropped another account's preserved weight. The sequence is now revoked from clients.
- **code-reviewer** could not reproduce the `search_path` hole. Its test listed `pg_temp` explicitly, which puts the implicit `pg_catalog` first; the vulnerable form is `''`. Re-run directly against the first draft (6) and the fix (0), and recorded on CUL-1281 so the dissent does not resurface as doubt later.
- **code-reviewer's real catch:** the migration header claimed an untouched Edit profile save writes no row. False: `EditPetModal` re-saves the weight through a 0.1 lb round trip, and 7,016 of 9,000 stored values (78%) come back different (3.73 → 8.2 lb → 3.72 kg). A name edit moves the pet's reference weight. Pre-existing and client-side, so filed as **CUL-1283** (High) rather than bundled into a schema PR; the header now says so and tells EN-8 to treat a rounding-step displacement as noise until it ships.
- The guard's naive `--` stripper was replaced by `lib/functionHardening.test.ts`'s string- and dollar-quote-aware lexer, moved to `guards/sqlComments.ts` so both share it.
- **The production apply found one more:** PG17 grants `authenticated` the new MAINTAIN privilege by default (it allows `LOCK TABLE`), which the named-privilege REVOKE list missed because PG16 has no such privilege. Applied a follow-up `REVOKE ALL` + `GRANT SELECT` and folded that version-agnostic form into the file; the guard asserts SELECT is the only grant.

## Proof

- Local PG16 replay with a Supabase stub: every writer shape, the chain, two displacements in one transaction, the NULL gap, no row on an unchanged save or a NULL start, every client write refused, cross-account read 0, an injected failure still lets the owner's write land, the user delete cascade leaves 0 rows.
- Production, inside a transaction forced to roll back: a weigh-in (4.40 → 3.73) and the next reading (3.73 → 3.80) kept, a same-value save wrote nothing, the other account's pet untouched and invisible, INSERT / DELETE / `setval` / `LOCK` all denied; nothing persisted. `get_advisors` shows nothing new.
- Mutation, one red test each: AFTER → BEFORE, drop DEFINER, drop the exception handler, add a FOR ALL policy, plant a reader (a `.ts` and a `.sql`), drop the WHEN clause, revert `search_path` to `''`, drop the sequence revoke, grant INSERT, drop the `REVOKE ALL`.

## Residuals

- It cannot recover values destroyed before apply. **Nyx's 4.4 kg needs re-entering as a back-dated weigh-in** (the critique's TD-1 note to the PM).
- A row may duplicate a weigh-in copy or an Undo leftover, and until CUL-1283 ships, rounding noise from Edit profile. EN-8 discriminates at read.
- Bulk writes that disable user triggers (the 052 shape) bypass it; named in the header.
- Export (B-041) must enumerate this table when it exists.
