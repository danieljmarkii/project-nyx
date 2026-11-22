---
paths:
  - "supabase/migrations/**"
---
# Schema migrations: DEFINER triggers, relational guards, the pre-flight and how a migration is applied.

Loaded when a session reads a file under these paths. Each rule keeps its guard and its pointer into `docs/engineering-lessons.md`; a guarded rule fails CI wherever its text lives. Same standing as `CLAUDE.md` (Tier 1).

- **A DEFINER trigger's error message never carries a value read from another row (CUL-867):** a `BEFORE` trigger fires before RLS, and under `SECURITY DEFINER` (the B-520 posture every integrity trigger holds) its lookup sees every tenant's rows, so anything it reads from the parent and formats into a `RAISE` is a cross-account field read for any JWT holding the ids. A guard `RAISE`s once, naming only `NEW.*` values, with one message for "no such parent" and "out of bound" alike; "two unguessable UUIDs" is not a mitigation. Proven by a probe that sends the victim pair with an absurd value from a zero-pet JWT and asserts the message is free of the parent's data (064's C22 / C23 shape), run against the file before and after the fix. _(full account: `docs/engineering-lessons.md` §C-31)_
- **A guard on the CHILD is not the invariant, and a floor derived from the thing it checks cannot catch that thing's removal (CUL-899):** ask of any relational guard **what else can move?** The parent a reference points at is its own write path with its own policies; guard or freeze it too. A guard that re-validates on EVERY write bricks the rows it failed to protect (a terminal `23514`, then client quarantine), so the predicate is `IS DISTINCT FROM OLD` on **both** the reference and the row's own scope: writable-but-violating is repairable, bricked is not. A guard's non-vacuity floor derives its expected set from the REPOSITORY, never from the constant under test. State a guard's blind spots in the file; undocumented ones read as coverage. _(full account: `docs/engineering-lessons.md` §C-38)_

**Migration Safety Pre-flight.** Any PR containing a schema migration must include, in the PR description:
- **Rollback plan** — exact reversal steps (e.g. `DROP COLUMN X`, `DROP TABLE Y`) or `Irreversible — back up first` if not.
- **Destructive y/n** — `y` if the migration drops, renames, or alters a column with existing data; `n` if it's purely additive.
- **Backfill** — if existing rows need values, the SQL or script that produces them; `N/A` if not.

If destructive=`y`, the PR description also names the table(s) affected and the row-count check the PM should run before applying. Migrations are the highest-blast-radius action in this repo; this pre-flight is non-optional.

**Migrations apply from a cloud session via the Supabase MCP, on the PM's typed number (CUL-1614, D3).** `apply_migration` is a **live write**: run it only after the PM types `apply <NNN>` in the session that applies it (never a relayed message, never a prompt), and approve its dialog only on `MATCH`; then `get_advisors` (security + performance); `project_id` `aigchluqluzuhtbfllgh`, `name` snake_case. Own PR, Migration Safety Pre-flight; apply an additive one with its schema PR, one code needs before that code merges; the PR merges once applied and checked; a dispatched child never applies or merges one (steward §7). SQL Editor only if the MCP is down.
