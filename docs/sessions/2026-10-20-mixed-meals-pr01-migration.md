# Mixed meals row 1: migration 105, meal_components (CUL-2050)

**Date:** 2026-10-20
**One thing:** T2 L1 — The sync queue: a re-send arrives as a fresh "add this", so every first-write check runs again on every retry · check: pending

Shipped via #1266. Dispatched row, `Teach: yes`. Not applied: the PM applies it with `apply 105`.

## What it is

The schema that lets one meal hold two or more foods, each with its share of the bowl (spec `docs/nyx-mixed-meals-requirements.md` §3). One new table, `meal_components`, and one new column, `meals.component_count`. Nothing reads or writes either yet; row 2 adds the helper, the phone's copy and sync, and the writer ships last. Numbered 105 because 103 is held by the parked photo-bucket PR (#1253) and 104 is on main.

## What review changed

Two isolated reviewers ran the file against a scratch Postgres.

- `rls-privacy-reviewer` held every cross-account boundary: another account's food is refused by insert, update and upsert alike, a made-up food id gets the same answer (no way to probe), and another pet's meal gets one message carrying only the caller's own ids.
- It also found the guard's safety claim false. The phone sends rows as an upsert ("add this, or update it if it exists"), and Postgres runs the "first write" check on every upsert before it notices the row exists. So if a meal's type ever changed after its first send, every later ratio edit would be refused for good. Fixed: the first-write check also passes a row already stored with the same identity, behind the same ownership check. Mutation-proven: the old file refuses the probe, the new one passes it. The same flaw sits in live migration 097, filed as CUL-2064.
- `food_label`, the one free-text column, is now 1 to 300 characters: it is headed for the vet report and model context in row 3.

## Teach

### One thing — the sync queue: a retry is a fresh "add this" (T2, L1)
When your phone sends a record to the server, it does not say "update row 7". It says "here is row 7: add it, or if you already have it, update it". That one instruction is safe to repeat, which is why a flaky connection never creates duplicates. The catch: the database treats every such send as an *attempted add first*, so any check written for "a brand new row" runs again on every resend, months later, against whatever the world looks like now.

**Like:** a club bouncer who checks your ID at the door every time you step back in from the smoking area. Fine, until the club changes its age rule; now a member already inside can never get back in.

**In today's work:** `lib/sync.ts:875`
```
.upsert(rows.map(toRemote), { onConflict: 'id' })   // "add these rows; where the id already exists, update instead"
```
and the fix at `supabase/migrations/105_meal_components.sql:255`, the second way through the door: `OR EXISTS (… mc.id = NEW.id …)` means "or this exact row is already stored here".

**Why it matters to you as PM:** "the check only runs on new rows" is a claim worth doubting in any review of this repo, because to the database almost every phone write looks new.

**Check:** Your cat's dinner was logged as a meal and synced. A week later a future feature lets you re-label that event as "treat", and you then adjust the bowl's ratio on your phone. Under the first draft of this migration, what happens to that ratio edit, and why?
