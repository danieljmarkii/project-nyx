# Vet visit reminders PR-02: the vet_visit notification category (migration 121)

**Date:** 2026-11-13
**One thing:** T3 L1 — A CHECK is the database's own list of allowed values, and a migration is how that list grows · check: pending

Shipped via #1525, for [CUL-2726](https://linear.app/projectnyx/issue/CUL-2726) (PR-02 of the *Vet visit reminders* project, parent CUL-253). BUILD mode, plan posted and approved before writing.

## What shipped

`supabase/migrations/121_notification_preferences_vet_visit_category.sql` widens `notification_preferences.category`'s CHECK from `'daily_summary'` alone to `'daily_summary', 'vet_visit'`, re-adding it under the same name (`notification_preferences_category_check`) so CUL-1598's later widening finds it where 050 left it. The column comment was refreshed. No app code changed.

Applied to production on the PM's typed `apply 121` (2026-11-13, recorded as version `20261113202451`). The VERIFY queries read back the two-value CHECK, the refreshed comment, and the one existing `daily_summary` row untouched. Security and performance advisors show no finding on `notification_preferences`; every listed lint predates this change.

## How it was proven before apply

A throwaway local Postgres 16: the migration applied, a `vet_visit` row inserted, an unknown category was refused by the same named constraint, the existing row survived; then the file header's rollback ran and returned the CHECK to its 050 form with the `daily_summary` row intact.

## Decisions

- **No local-mirror change.** Spec §6 says the local mirror's DDL moves with the CHECK, but `lib/notificationPreferences.ts` declares `category TEXT NOT NULL` with no CHECK, so it already stores any value. A one-line Tier 2 correction to the spec is proposed, not written.
- **`NotificationCategory` in `lib/notifications.ts` stays `'daily_summary'`.** It types the daily registry, which assumes one repeating daily trigger; the reminder gets its own module in PR-03 (spec §3.5). Widening it here would also have bundled app code into a schema PR.

## Residuals

None for this PR. PR-03 ([CUL-2727](https://linear.app/projectnyx/issue/CUL-2727)) is now unblocked on the schema side.
