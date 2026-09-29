# Engines v3 PR-21a: signal_shown_log is written by the server only

**Date:** 2026-09-29

Shipped via #982 (CUL-1384). Migration 080, applied to the live database this session with the PM's approval.

## What shipped

- `supabase/migrations/080_signal_shown_log_server_only.sql`. It drops 075 §5's `signal_shown_log_insert_own` policy and revokes INSERT from `authenticated` (and `anon`). A table-level REVOKE also removes 075's column-level INSERT grants. SELECT and the owner-read policy stay. The table comment now says the table is server-written. The header carries the Migration Safety Pre-flight (non-destructive, no backfill, a rollback that restores 075 §5 exactly) and a read-only VERIFY block.
- Why: PR-11a (CUL-1267) moved the log's only writer to `generate-signal`'s service-role client. The client door was unused, but while it existed any account could append rows to its own pet's log. EN-9, EN-14 and evaluation need every row to be server-written.

## How it was checked

- **Precondition:** the server write was live before the policy was dropped. The log held 20 rows from 5 runs, from 2026-09-28 17:10Z to 2026-09-29 11:17Z, and `generate-signal` carries no deploy hold. No app or function code inserts as `authenticated`.
- **Local probe (PGlite; 075 §5 run verbatim, then 080):**
  - Before 080, a client insert lands, so the baseline is real.
  - After 080, authenticated and anon inserts are refused, a service_role insert lands, the owner's SELECT still returns their rows, and UPDATE is refused.
  - Mutation check: with only the policy dropped, or only the grant revoked, a client insert is still refused. Each wall holds on its own.
- **Process lesson:** the first probe run was vacuous. Its slice of 075 stopped at a comment that mentions `GRANT INSERT`, so the "before" baseline was refused too. I caught that only because the baseline existed to be checked. A probe needs a positive control.
- **rls-privacy-reviewer: HOLDS.** It found no client write path left: no leftover column grant, no PUBLIC or default privilege, no view, RPC or trigger. The confused-deputy attempt (user B's JWT with pet A's id) gets a 404, because the service-role write uses the pet id from the caller's RLS-scoped `pets` read. The server writer is unaffected.
- **Live apply:** the VERIFY block passed. Only the read policy remains, `authenticated` holds SELECT only, the INSERT privilege checks are false for both client roles and true for `service_role`, and the row count is unchanged at 20. The advisors show nothing new on this table.
- CI was green on the head: typecheck + jest, non-UTC jest, and the Edge Function tests.

## Residual

A post-migration server write has not been observed yet. The log still reads 20 rows because no Signal run has happened since the apply. The next run (any app open of Home) should add rows, and `SELECT count(*), max(recorded_at) FROM signal_shown_log;` confirms it. The same move for `ai_signals`, plus the HMAC of `text_hash`, stays on CUL-1378.
