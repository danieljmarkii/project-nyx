# Vet contacts PR-02: migration 122, the channel and time on vet_visits

**Date:** 2026-11-19
**One thing:** T3 L2 — Adding a column with a fixed default changes the table's shape without copying a single row · check: pending

Shipped via #1567 ([CUL-2764](https://linear.app/projectnyx/issue/CUL-2764)). A dispatched row, plan-gated because it holds a migration.

## What shipped

One additive migration, `supabase/migrations/122_vet_visits_channel.sql` (spec §3):

- `vet_visits.channel`: how the owner heard from the vet. One of `in_clinic`, `phone`, `text`, `email`, and `in_clinic` by default, so every visit logged before today still reads as the exam it was.
- `vet_visits.contacted_at`: the optional time of a contact. Empty means the owner gave the day only.
- `app_config` row `vet_contacts_enabled`, off, with an empty allowlist. Nothing an owner sees changes.

There are no policy, grant, trigger or app code changes. PR-03 makes every reader say whether it means an exam or any contact.

## How it went

- The plan was posted on the issue and the PM said go in the session.
- The `rls-privacy-reviewer` light pass came back **PASS**. A second account's JWT is refused by the existing row policy. Account deletion still cascades from `pets`, and that has been unchanged since 001. There are no column grants, and the allowlist is empty.
- The migration was applied on the PM's typed `apply 122` as `20261119161229 vet_visits_channel`. Before applying, I checked that neither column nor the flag existed. After applying, all 4 live rows read `in_clinic`, the flag reads off, and the policies are unchanged. The advisors showed nothing new.
- The PM merged it with `/wrap and merge`.

## Residual

Account export (B-041) is not built yet. When it is, it must carry both new columns. This is parked on CUL-2764.

## Teach

Most changes to a table's shape are cheap, but some quietly rewrite every row. When Postgres adds a column whose default is a fixed value (`'in_clinic'`), it notes that value once in its catalogue. Every existing row then reads the default on the fly, and the table is not copied. That is why migration 122 took effect instantly on a live table. If the default is computed per row, such as the current time or a fresh random id, Postgres has to write the value into every row. That rewrite holds a lock that blocks reads and writes for as long as the copy takes. On a big table, that is an outage.

Check: if `channel` had defaulted to the current time instead of `'in_clinic'`, would adding it have rewritten `vet_visits`?
