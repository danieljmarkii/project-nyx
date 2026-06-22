# Edge-Function & Migration Deploy Runbook (cloud env)

How to deploy a Supabase **Edge Function** and apply a **schema migration** to the
live project from the cloud dev environment, repeatably, via the **connected
Supabase MCP** — no Supabase CLI and no access token required.

This is the backend-deploy companion to `docs/dev-handoff-runbook.md` (which is
about getting JS onto the PM's *phone*). Audience here is the agent/dev working in
the cloud session, not the PM's device. Codifies B-082.

> **Project ref:** `aigchluqluzuhtbfllgh` — pass as `project_id` to every Supabase
> MCP call. The MCP is scoped to this one project.

---

## TL;DR

| Task | Path |
|---|---|
| Deploy an Edge Function | `scripts/deploy-edge.sh <name>` → agent calls MCP `deploy_edge_function` with the bundle → verify |
| Apply a schema migration | agent calls MCP `apply_migration` with the migration SQL → `get_advisors` → verify |
| Check what's live | MCP `list_edge_functions` / `list_migrations` / `list_tables` |
| Debug a deploy | MCP `get_logs` + `get_advisors` before changing anything |

**The dashboard SQL-Editor-paste and dashboard-function-paste workflows are
superseded by the MCP path.** They remain a manual fallback only if the MCP is
ever unavailable in a session.

---

## Why this runbook exists (the cloud-env reality)

- **No Supabase CLI, no access token in-container** — `supabase functions deploy`
  and `supabase db push` from disk don't work here.
- **`deno bundle` is removed/unstable** in modern Deno — the old "deno-bundled
  artifact" path is dead.
- **The Supabase MCP _is_ connected** and reaches the project (verified each
  session with `list_migrations` + `list_edge_functions`). It can apply DDL
  (`apply_migration`) and deploy functions (`deploy_edge_function`) directly.

So the repeatable path is **MCP-driven**, and the one hard part it leaves —
producing a single self-contained file for a function that imports a shared module
from outside its own directory — is what `scripts/deploy-edge.sh` solves.

---

## Part 1 — Deploy an Edge Function

### Step 1: bundle + verify (`scripts/deploy-edge.sh`)

```bash
scripts/deploy-edge.sh <function-name>
```

What it does (see the header comment in the script for detail):

1. **Provisions `esbuild` + `deno`** on demand, in a **single** `npm install
   --no-save esbuild deno`. ⚠️ They MUST be installed together — a second
   `npm install --no-save X` prunes the first (npm removes anything not in the
   lockfile). This bit us during B-082 validation.
2. **Verifies** by running `deno test <func-dir>/`. Env caveat: suites that import
   remote deps (`https://deno.land/std/...`) need network, which the sandbox
   blocks — those time out and the script **warns** (verify them in a networked
   env). `generate-signal`'s suite uses `node:assert` and runs **fully offline**,
   so the clinically load-bearing function is always verified here. Real test
   *failures* hard-fail the script.
3. **Bundles** `index.ts` → `.edge-build/<name>/index.ts` — one self-contained ESM
   file. Runtime imports (`https://`, `jsr:`, `npm:`, `node:`) stay **external**
   (Deno resolves them natively); only the function's own relative `.ts` files are
   inlined — including the cross-package `../../../lib/protein.ts` that
   `generate-signal` re-exports, which is the whole reason bundling is needed.
4. **Syntax-checks** the bundle offline (`node --check`) and asserts no escaping
   `../` import survived (which would mean a dep wasn't inlined).
5. Prints the bundle **path + sha256** and the deploy instructions below.

Defaults are deliberate: **un-minified** (readable in the dashboard, byte-clean
read-back) and **`--charset=utf8`** (non-ASCII verbatim, no `\uXXXX`). Use
`--minify` only if you need a smaller artifact.

> **Bundling vs. multi-file upload.** MCP `deploy_edge_function` accepts multiple
> files, so a function whose deps are all *local* (e.g. `delete-account` +
> `plan.ts`) could be uploaded file-by-file without bundling. We bundle uniformly
> anyway because (a) `generate-signal` genuinely needs it (the `lib/protein.ts`
> escape), and (b) one path for all functions is less error-prone. Bundling a
> simple single-file function is a near-identity transform — harmless.

### Step 2: deploy (Supabase MCP — recommended, no token)

Have the agent call `deploy_edge_function`:

```
deploy_edge_function(
  project_id = "aigchluqluzuhtbfllgh",
  name       = "<function-name>",
  entrypoint_path = "index.ts",
  verify_jwt = true,        # PRESERVE the function's existing setting — all of
                            # ours require a JWT; never silently flip it
  files = [{ name: "index.ts", content: <contents of .edge-build/<name>/index.ts> }]
)
```

`verify_jwt` must match what the function already had (all current functions:
`true`). Check first with `list_edge_functions` if unsure.

### Step 3: verify the deploy

1. **`list_edge_functions`** → the function shows a **bumped `version`** and
   `status: "ACTIVE"`.
2. **Read-back fidelity** — `get_edge_function` and confirm the deployed source
   matches the bundle. Strongest check: `sha256` of the deployed `index.ts` ==
   the sha the script printed. (Cosmetic encoding diffs are possible if you used
   `--minify`; the un-minified utf8 default avoids them.)
3. **Live boot smoke-test** — a JWT'd call with a bogus pet id must return a clean
   4xx (the function booted and ran the pipeline), NOT a `WORKER_ERROR` (a boot
   crash). For `generate-signal`:

   ```bash
   ANON="<anon key — MCP get_publishable_keys, or EXPO_PUBLIC_SUPABASE_ANON_KEY>"
   URL="https://aigchluqluzuhtbfllgh.supabase.co/functions/v1/generate-signal"
   curl -s -w '\nHTTP %{http_code}\n' -X POST "$URL" \
     -H "Authorization: Bearer $ANON" -H "apikey: $ANON" \
     -H "Content-Type: application/json" \
     --data '{"petId":"00000000-0000-0000-0000-000000000000"}'
   # expect: {"error":"Pet not found"}  HTTP 404
   # no-auth call -> HTTP 401 (proves verify_jwt is enforced)
   ```

4. If anything looks off, **`get_logs(service: "edge-function")`** before
   re-deploying.

### Deploy ordering vs. merge

Per house precedent, a function may be deployed from the work branch *ahead of*
merge when the deployed bytes are provably the branch source (read-back + tests)
and the change is inert without its trigger — then re-deployed authoritatively
from merged `main`. State which you did in the session summary.

---

## Part 2 — Apply a schema migration

> **Process rules are UNCHANGED by this tooling.** `apply_migration` makes
> *applying* a migration a single call; it does **not** relax any of the
> migration discipline:
> - **Schema-PR isolation** — a migration still ships in its **own PR**, never
>   bundled with UI/logic work.
> - **Migration Safety Pre-flight** (CLAUDE.md) — the PR description still needs
>   **Rollback plan**, **Destructive y/n**, **Backfill**, and (if destructive)
>   the affected tables + a row-count check.
> - **`apply_migration` is a LIVE write.** It hits the production database the
>   moment it's called. Apply additive migrations as part of the schema PR; for a
>   migration a code change depends on, apply it **before** deploying that code
>   (the migrate-before-deploy gate).

### Flow

1. Author the migration as usual: `supabase/migrations/NNN_description.sql`.
2. Complete the Migration Safety Pre-flight in the PR description.
3. Apply it:

   ```
   apply_migration(
     project_id = "aigchluqluzuhtbfllgh",
     name  = "NNN_description",   # snake_case, matches the file
     query = "<the migration SQL>"
   )
   ```

4. **`get_advisors(type: "security")`** and **`get_advisors(type: "performance")`**
   immediately after — this catches a missing RLS policy on a new table, an
   unindexed FK, etc. Address anything it flags (a new `pet_id` table with no RLS
   is a hard stop — see the RLS rules in CLAUDE.md / the `supabase-sync` skill).
5. Verify with **`list_tables`** / **`list_migrations`** (the new row appears in
   history — see the drift note below) or a targeted `execute_sql` SELECT.

`execute_sql` is for **read-only verification** (SELECTs). Use `apply_migration`
for all DDL so it's recorded in migration history.

---

## Drift snapshot (verified this session, 2026-06-20)

Diff of live state (MCP) vs. `supabase/{migrations,functions}/` on disk:

- **Edge Functions — in sync.** All 5 on-disk functions are deployed + `ACTIVE`
  (`generate-signal` v19, `extract-food-from-photo` v9, `extract-medication-from-photo`
  v1, `analyze-vomit` v4, `delete-account` v3).
- **Migrations — history table is sparse, and that's expected.**
  `list_migrations` returns only **5** rows, but **22** migration files exist on
  disk. This is **not** 17 unapplied migrations — STATUS.md documents every one as
  applied + verified live. It's the legacy of the **dashboard-SQL-Editor-paste**
  workflow: pasting SQL into the dashboard applies the DDL but does **not** write a
  row to `supabase_migrations.schema_migrations`. Only migrations applied via a
  *tracked* path (recently, MCP `apply_migration` — e.g. `medication_logging`,
  `021_medication_photos_rls`) are recorded.

  **Takeaway:** `apply_migration` is strictly better than dashboard-paste because
  it both **applies and records** — so going forward the history table becomes
  honest on its own. The historical gap is cosmetic (the schema is live). Whether
  to backfill the 17 older rows is a deferred PM call (logged as a backlog item),
  **not** done here — this PR ships no schema/data change.

---

## Security — no standing deploy token

This path needs **no Supabase access token**: the MCP authenticates the session.
That is the recommended posture — there is no long-lived deploy credential to leak.

- **Never commit a token.** Not in source, not in `eas.json`, not in a script.
- The `nyx-cli-deploy` personal access token (`sbp_…`, created 2026-06-07 for a
  one-off CLI deploy) is **obsolete** under this path and is flagged for
  **revocation** (account-level → Supabase dashboard → Account → Access Tokens;
  it can't be revoked via the MCP). See the PM Action Item in STATUS.md.
- *Optional future convenience:* if the PM ever wants `supabase functions deploy`
  straight from disk, provision a Supabase access token as an **env secret** in
  the cloud env (never in the repo) and the CLI path lights up. Weigh that standing
  credential against the MCP path, which needs none. Default: MCP.
