# Migration-history backfill (B-162, B-142 merged in)

**Date:** 2026-07-26

PM ruled the long-deferred call: backfill `supabase_migrations.schema_migrations` rather than keep tracking forward from a sparse history. Done, with three files deliberately left unrecorded and one finding that was worth more than the backfill itself.

## What was done

Reconciled `supabase/migrations/` (44 files) against `list_migrations` (25 rows), verified each unrecorded file's objects against the live database, then recorded **18** of them as applied.

The write was the **repair path** — a plain `INSERT` into the tracking table via `execute_sql`. Never `apply_migration`: that re-executes the SQL (several of these carry bare `CREATE TYPE` / `CREATE TABLE` that would error or partially apply) *and* would have recorded itself as a migration.

Three deliberate choices in the row shape:

- **`version` = the filename's numeric prefix** (`001`…`029`). That is what the CLI derives from an on-disk file, so it is the only value that could ever make a `db push` skip the file. It is also safe under either plausible CLI filename regex — if the CLI required 14 digits it would ignore these files entirely rather than re-run them.
- **`statements` = NULL.** These were dashboard-pasted, so the repo file is not provably byte-identical to what actually ran — B-142's own stated risk. The row asserts "this version is applied", not "this exact SQL ran".
- **`created_by` = NULL**, which visually marks a backfilled row against the 26 tool-applied rows that carry the PM's email.

History went 25 → 43 rows (44 including a `vet_documents` migration a sibling session landed mid-session).

## Verified before recording, not assumed

Every recorded file was checked live — tables, enums, columns, constraints, triggers, policies. Four checks came back negative and each was chased down rather than waved through:

- **004 / 006 / 008** — objects absent because later migrations superseded them (033 dropped the `food_items` policies by name; 025 and 043 replaced the broad Storage policies). Recording these is *actively protective*: a re-run would re-create the permissive bucket-wide policies that 025/033/043 deliberately removed.
- **003** — `food_items.photo_path` is genuinely absent. B-044 already ruled that column dead (superseded by `007 photo_paths TEXT[]`; no code reads it). Recorded `003` as applied with the divergence documented, rather than adding a dead column to make history tidy.

## The finding: migration 036 was never applied

`036_nyx_food_photos_owner_insert.sql` is **not live**. `storage.objects` still carries `nyx-food-photos: authenticated insert` with `WITH CHECK (bucket_id = 'nyx-food-photos')` — the permissive 033 form — and `nyx-food-photos: owner insert` does not exist.

Both B-358 and B-354 record it as shipped ("migration 036 live"). B-358's own row explains how: it was **deploy-gated** on the reordered client reaching devices, and the gate was never lifted. The precondition is now met — `runUploadAndExtract` is verified insert-then-upload — so it can simply be applied.

Not applied here on purpose: a live RLS change is its own PR under schema-isolation, and this session was a history repair, not a deploy. Filed as **B-505** (`Now`). Exposure is the bounded one `rls-privacy-reviewer` already signed off on at B-358: an attacker holding a pre-036 food UUID can plant an object but cannot read it back, overwrite, or delete it. Same class as B-178, migrations instead of Edge Functions.

## Not recorded, on purpose

- **`036`** — not applied (above). Recording it would have been the one genuinely dangerous write available this session.
- **the two `018_` files** — `018_ai_signals_summary.sql` and `018_feeding_arrangements.sql` both derive version `018`, which is the PK. Both are verified applied; only one could be recorded. Picking one would have been a guess, and git can't break the tie (shallow clone, one synthetic commit). Filed as **B-506** for a rename decision.

## What the backfill did *not* close

B-162 framed this as removing the `db push` footgun. It removes less than half of it. The 26 pre-existing rows are 14-digit timestamps that match **no** on-disk filename, so `db push` would still re-run those 26 files. Matched files went 0/44 → 18/44, and every new `apply_migration` adds another mismatch — a sibling session's `vet_documents` did exactly that during this session.

Filed as **B-507** with four options. Worth noting that "accept it" is defensible — the documented deploy path is the MCP, not `db push` — but it should be a decision rather than an accident, and if chosen, the runbook should warn against `db push` explicitly.

## Note on IDs

The three follow-ups were filed as **B-492/B-493/B-494** and **renumbered to B-505/B-506/B-507** at wrap: merging `main` before the duplicate-ID check showed a sibling session had taken that exact block first, so first-lands-keeps applied and these three moved. Each row carries an inline provenance note.

## Scope

Shipped via **#480**. Live tracking-table write + docs only. No app code, no schema change, no Edge Function deploy. `B-142` merged into `B-162` as the duplicate row it was; both opened independently off the same B-044 finding a day apart.
