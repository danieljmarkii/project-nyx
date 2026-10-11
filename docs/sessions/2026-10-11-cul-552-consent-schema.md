# AI consent PR 1 — the ai_consent state and history tables (CUL-552 → CUL-1789)

**Date:** 2026-10-11
**One thing:** T4 L1 — RLS: the database itself refuses rows that are not yours, and a permission it never checks (TRUNCATE) is a door RLS does not guard · check: pending

Shipped via #1180 (draft; the migration waits on the PM's `apply 100`).

## What shipped

`supabase/migrations/100_ai_consent.sql` and `guards/aiConsent.test.ts`, schema only, PR 1 of three for the App Review 5.1.2(i) consent gate.

- **`ai_consent`**: the owner's current answer, one row per (account, scope), updated in place. `granted` has no default (a "no" is a row, never an absence); a missing row is "never asked" and PR 2's gate reads it as declined. `decided_at` is stamped by a BEFORE trigger on every write; the same trigger refuses any change to `user_id` or `scope`.
- **`ai_consent_events`**: every answer ever written, appended by an AFTER trigger whose `SECURITY DEFINER` function is the table's only writer. Clients read their own history by column, without the global `id`.
- **Grants**: clients `REVOKE ALL`, then SELECT and column-list INSERT / UPDATE on the state, SELECT-by-column on the history. `service_role` loses every write on the history and DELETE / TRUNCATE on the state. `copy_version` is capped at 64.
- **The guard** pins four rules over every migration numbered 100 and up (grants, exact policy sets, both trigger functions and trigger statements, both CREATE TABLE statements plus no later ALTER TABLE), each proved by an in-memory mutant: 55 tests.

PR 1 got its own sub-issue, CUL-1789, because every issue a PR names goes Done on merge (CUL-1397). The launch prompt said to name CUL-552 in the PR; that would have closed the whole consent track with PRs 2–3 unbuilt, so the repo rule won and the conflict was flagged.

## Decided

- **D10 → whole boundary** (PM, in session). A "no" closes every Anthropic call. The scope CHECK admits `'ai_boundary'` alone (team call, logged on CUL-552: a value with no reader is a gate-confusion hazard).
- **Withdrawal history → option (a)** (PM, in session). yes → no → yes is now on record; before, 032's primary key and the overwritten state row could never show a withdrawal.
- **Key columns granted for UPDATE, frozen by trigger.** The first draft granted UPDATE on the answer columns only. Proven on PG16: a PostgREST upsert writes back every payload column, keys included, so the narrow grant fails every PR 3 consent write with 42501. Granting the keys and refusing a real change (`IS DISTINCT FROM`) keeps the upsert working and the key fixed (C-38).
- **No FORCE ROW LEVEL SECURITY.** On Supabase the owner has BYPASSRLS, so it would do nothing there and break the logger on any owner without it.

## What broke, and how the reviews found it

Three review passes, each falsification-first.

1. **rls-privacy-reviewer, pass 1.** Tried an existence oracle (B upserting A's id over present vs absent rows): identical 42501, no signal. **Broke:** the narrow `REVOKE INSERT, UPDATE, DELETE` left Supabase's default TRUNCATE / TRIGGER / REFERENCES with `authenticated`; one `TRUNCATE` as user B erased every account's answer, because TRUNCATE ignores RLS and fires no row trigger. Fixed (`REVOKE ALL` + re-grant). Also found the lost withdrawal history (→ PM ruling (a)) and set three rules for PRs 2–3 (one scope read, decline wins; remote-first write so a stale queued yes never overrides a no; gate keyed on the JWT uid).
2. **code-reviewer.** The guard could be walked past: matches spanning statements and string literals, tagged `$f$` bodies, `ON ALL TABLES IN SCHEMA`, `ALTER DEFAULT PRIVILEGES`, quoted identifiers, a disabled RLS, a later permissive policy, a trigger re-made `FOR EACH STATEMENT` / `UPDATE OF` / `WHEN`, and a lexical filename filter (`1000_x` < `100_a`). Rebuilt to parse literal-blanked statements and pin by equality. Two of my own test bugs surfaced on the way: a regex backreference off by one (group 3 for group 2) left the function pin reading `null`, and the `$f$` mutant was green over that null; it now asserts the tagged body is actually read.
3. **rls-privacy-reviewer, pass 2 (on the history).** The DEFINER logger held against a pg_temp shadow table, a cross-user upsert, and a crafted-NEW trigger. **Broke:** `service_role` could forge a backdated yes, flip a recorded no, delete history, and delete or truncate state with nothing logged; `copy_version` was uncapped (5 MB per write); history ids counted every account's writes. All three fixed; the cascade still runs when `service_role` deletes an account (referential actions run as the owner), proven on replay.

Every claim above was replayed on a scratch Postgres 16 with Supabase's default privileges stubbed and a non-superuser, NOBYPASSRLS owner running the migration. Two mutants confirmed the triggers are load-bearing: without the key-freeze arm a scope relabel goes through; with the logger made INVOKER the consent write itself is refused, so state can never move without history.

## Residuals

- **Consent history after account deletion** is a PM / legal call (CUL-1794). The cascade deletes it, matching 032 and the published policy; the trade is no withdrawal record for a dispute after deletion.
- **CUL-1788**: the same TRUNCATE gap on `legal_acceptances` (032) and `notification_preferences` (050), by reading; not replayed.
- PR 3 must read the history by naming columns (`select('*')` is refused: `id` is not granted), and B-041's export, when built, includes both tables plus `legal_acceptances`.
- The guard reads files; a grant changed in the dashboard is the B-505 class, covered only by the post-apply privilege and owner checks in the PR body.
