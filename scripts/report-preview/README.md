# Report preview: the shipped vet report on a real record, read-only (CUL-2308)

Renders the vet report the deployed `generate-report` would produce for one pet, without deploying anything and without writing to the database. For `vet-report-cold-read` on real renders, the AI lead's real-record bake-off (CUL-2306) and mock-round fixtures.

| File | What it does |
|---|---|
| `export.sql` | One read-only statement for the Supabase MCP `execute_sql`. One row per read the report makes: the rows in the shape PostgREST returns for the loader's select, their count, and an `md5` taken in SQL. The `meta` row carries the statement's `now()`, the run's fixed cutoff. |
| `reads.ts` | The reads the stand-in serves: table, the exact select string, the order, the filters export.sql already applied. |
| `snapshot.ts` | Loads the result, re-takes every md5 on disk, and refuses: a mismatch, a short body, a pet off the subject list, a CTE that matched no pet, a missing or unknown read, a household or pet row owned by someone else, an output path inside the repo. |
| `standInClient.ts` | The supabase-js builder subset the loader calls. Pages, caps at `max-rows` and returns `count` like the server, and refuses any select, order or filter it was not dumped for. |
| `run.deno.ts` | Runs the unchanged `generateReportForPet` (imported, never copied) through the stand-in at the cutoff. Writes `report.html` and `report.json` to `--out`. |
| `fixture.ts`, `e2e.deno.ts`, `*.test.ts` | A synthetic export (an invented cat) and the tests: end to end in CI, the loader's refusals, and the query pin. |

## Whose pet

Only evaluation subjects (PMD-12): the pets in `scripts/engine-replay/evaluationSubjects.ts`, today the PM's own, until the in-app opt in exists (CUL-1825). The CTE matches only those ids and pairs the id with the owner's email (C-27); the loader refuses any other pet. The query is pinned (`exportPin.test.ts`): a change Postgres would execute reds the build until the `rls-privacy-reviewer` reads it. **This binds a session that runs `export.sql` unchanged, and nothing more**: `execute_sql` runs whatever it is sent, and the loader's checks run after the rows reached the session. The rule is followed, never enforced.

## Run it

1. Replace the two literals in the CTE (pet id, owner email) and run `export.sql` through `execute_sql`. Keep the result in the session scratchpad: the MCP writes an oversized result to its tool-results file; a small one, write out as returned.
2. `deno run --allow-read --allow-write=<out> scripts/report-preview/run.deno.ts --export <result file> --out <out>` (add `--owner` for the owner's arm, notes off).
3. It exits non-zero, writing nothing, on a refused export, a refused query, a short read, or a non-200.

## What leaves the database, and what does not

Leaves, into the session: a superset of the rows the report reads. Events and looks come out as the pet's whole history, every event note included; the stand-in applies production's lookback and look cap, so the render matches production's. Also the owner's display name (the report prints it), and the trial window's provenance (its one sanctioned reader is the report). Stays: look notes (returned null; neither audience the harness renders prints them), photo paths and bytes (paths withheld, Storage never read, photos render as placeholders), and every other account's id (flag allowlists cut to the owner).

**Outputs never enter git, Linear, a session record or an artifact without the PM's word.** A real render is health data about a named pet.

## Limits, stated so they do not read as coverage

- A photo placeholder sorts by its withheld path, so two photos on one incident with the same `sort_order` may render in a different order from production.
- No caller JWT: a profile with no display name renders "Owner: not recorded" where production falls back to the account email.
- The run uses the stored profile time zone; production prefers the device's (B-443).
- Timestamps serialise as Postgres `json` does, which is what PostgREST returns; a different session `TimeZone` changes the offset printed, never the instant.
