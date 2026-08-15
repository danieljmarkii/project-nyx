# DR-5 (CUL-22) — notification_preferences.use_pet_name migration

**Date:** 2026-08-15

Shipped **migration 058** (`supabase/migrations/058_notification_preferences_use_pet_name.sql`), the schema half of the Daily Recap warmth opt-in (B-671 / spec §6, R-8). One additive column:

```sql
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS use_pet_name BOOLEAN NOT NULL DEFAULT false;
```

Shipped via **#653** (draft). Unblocks **DR-6 (CUL-24)** — the named body (settings row + scheduled-body swap + wipe/reconcile).

## What this is (and deliberately is not)

When DR-6 ships, `use_pet_name = true` makes a single-pet account's daily-summary notification use the pet's name (`Biscuit's day is ready to read.` / title `Biscuit's day`); `false` keeps the body neutral. This PR is the **migration only** — the local SQLite mirror (`lib/notificationPreferences.ts`), the settings row, the body swap, and the sign-out wipe/reconcile are all DR-6's scope. Shipping the server column first and separately is the schema-isolation rule doing its job: DR-6 becomes pure code with no migration, and DR-5 is reviewable as a clean one-file diff.

Two things the DB deliberately does **not** enforce, recorded so DR-6 doesn't try to:

- **Single-pet-only is a DR-6 client rule, not a DB constraint.** The column may hold `true` on any account; DR-6 only ever *shows* the settings row and *renders* a named body when exactly one pet exists (multi-pet stays neutral by construction — D3). Baking "single-pet" into the schema would encode a fluid account fact (pet count) as a constraint.
- **`use_pet_name` is inert body warmth** — it changes only notification *text*, never delivery, routing, or which pets a notification concerns. Every scheduling/clamp/routing path is byte-identical for both values.

## Why `NOT NULL DEFAULT false`

`false` = neutral is the T&S-mandated default (spec §6): a pet name on a lock screen is an *involuntarily-public* tradeoff, so it must be the owner's explicit opt-in, never on by default — also foundation guardrail G6 (notifications default off). Unlike migration 053's `target_protein` (nullable, because NULL carried three product meanings there), `false` here is an unambiguous "not opted in", so there is no NULL tri-state and every reader (DR-6, and Part 2's server push) stays free of a null branch. The §6 T&S *review* gate itself lands at DR-6, where a name actually reaches a body; this migration's only contribution to that gate is the `DEFAULT false` that keeps the neutral body the default.

## Applied to the live DB this session

As the issue directed (apply before the dependent code deploys), via the Supabase MCP:

- `apply_migration` → `{success: true}`.
- **Verified:** column is `boolean NOT NULL DEFAULT false`; the 1 existing enabled `daily_summary` row (account-wide, `pet_id` NULL) read back `false`, 0 NULLs — the constant default filled it with the honest neutral value (`ADD COLUMN` with a constant default is O(1) in PG 11+; no table rewrite).
- `get_advisors` (security + performance): **no new lint.** The column inherits migration 050's owner-only-by-`user_id` RLS (no new policy needed), adds no index/FK/policy, and `notification_preferences` doesn't even appear in the `auth_rls_initplan` list (050 already uses the optimized `(select auth.uid())`). Every advisory returned is pre-existing and unrelated.

## Migration Safety Pre-flight

- **Destructive:** `n` (purely additive).
- **Backfill:** N/A — the constant `DEFAULT false` fills the existing row.
- **Rollback:** reversible, one statement — `ALTER TABLE public.notification_preferences DROP COLUMN IF EXISTS use_pet_name;`

## Gates

- CI green on the head commit: `App (typecheck + jest)`, `App (jest, non-UTC timezones)`, `Edge Functions (deno test)` all ✅. Pre-push hook ran `tsc` + full jest (225 suites / 5065 tests) locally before push.
- `tests: N/A — schema-only migration, no TS/Deno logic changed` (Engineer sign-off on the exemption).
- Data ✓ (account-scoped, inherits 050's RLS, rides the `auth.users` cascade) — Trust & Safety ✓ for the column (default-neutral preserves the neutral body; the feature-level T&S gate is DR-6's) — Engineer ✓ (additive, O(1), no rewrite). Adversarial review N/A (no clinical/statistical logic — an inert boolean preference).

## Backlog touched

- **B-671** (the opt-in setting) — In progress: DR-5 migration shipped via #653; DR-6/CUL-24 feature remains.
- **B-762** (Daily Recap umbrella) — build under way: DR-0 (#651) + DR-5 (#653) shipped.
