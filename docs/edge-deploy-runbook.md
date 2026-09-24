# Edge-Function & Migration Deploy Runbook

How server code reaches the live project. **Edge Functions deploy on merge**, from
GitHub Actions (CUL-1147). **Schema migrations** are applied from the cloud session
via the connected Supabase MCP. Neither needs a PM command.

This is the backend companion to `docs/dev-handoff-runbook.md` (which is about
getting JS onto the PM's *phone*).

> **Project ref:** `aigchluqluzuhtbfllgh`.

---

## TL;DR

| Task | Path |
|---|---|
| Ship an Edge Function change | **Merge the PR.** `.github/workflows/edge-deploy.yml` deploys it, checks it, records it |
| Keep a merged change from going live | Add a `holds` entry to `supabase/functions/deploy-manifest.json` **in the same PR** (§ Holds) |
| Release a hold | Delete the entry in a PR; that merge deploys the function |
| Redeploy a function | Actions → **Deploy Edge Functions** → Run workflow → the function, ref `main` |
| Roll a function back | The same, ref = the commit to go back to (a failed run's summary prints it); then § Rollback |
| See what is live | The latest Deploy Edge Functions run's summary; repo → Deployments → `edge-functions`; MCP `list_edge_functions` |
| Apply a schema migration | MCP `apply_migration` → `get_advisors` → verify (Part 2) |
| Actions is down and a fix can't wait | § Break glass |
| First-time setup, or checking it | § One-time setup |

**The rules.** A session never deploys an Edge Function and never hands the PM a
deploy command. A server change that must wait for an app build, or any other gate,
is marked `hold` in the same PR. A function change never merges before the
migration it needs is applied, because merging deploys it.

---

## Part 1 — Edge Functions deploy on merge

### What a merge does

Every push to `main` runs **Deploy Edge Functions**: one job, in the `production`
environment, the only place `SUPABASE_ACCESS_TOKEN` exists.

1. **Plan.** Fingerprints every function's shipping closure (the walker in
   `scripts/edge-deploy/fingerprint.ts`: `index.ts` plus every local file it
   inlines, `../../../lib/*` and `../_shared/*` included), reads each function's
   last verified deploy record, and decides per function: **deploy** (its closure
   changed since that deploy, or it has none on record), **unchanged**, or **held**.
   The run summary shows the table, and every hold with its issue and reason.
2. **Deploy**, only when something is to deploy. For each planned function, in
   order, it runs `scripts/deploy-edge.sh <fn> --deploy` (the function's `deno test`
   suite, the esbuild bundle, `node --check`, the upload), then the checks below,
   then the signed record. The first failure records itself, skips the rest, and
   fails the job red.

A change to a shared file redeploys every function that inlines it. That fan-out is
correct: their shipping code changed. A comment-only change redeploys too (the
fingerprint is over source, not bytes); that costs a no-op deploy, never the reverse.

**Bootstrap.** Until one deploy is on record, a push run deploys nothing and prints
what it would do. The first deploy is a manual run (§ Manual runs); after it,
merges deploy on their own. If the records are ever lost, or the token is rotated
(below), the workflow falls back to this state rather than deploying blind, and the
run carries a warning saying so: run `all-changed` to re-record everything.

### The checks

After each upload, all of these must hold or the job fails:

- The Management API (`GET /v1/projects/{ref}/functions/{slug}`) lists a **higher
  version** than before, **`ACTIVE`**, and **`verify_jwt: true`**.
- A **POST with no JWT** gets **401 from the gateway**. If the function's own
  `{"error": …}` answers instead, the gateway let an unauthenticated call through,
  and that fails even though it is a 401.
- A **POST of `{}` with the public anon key** gets a **4xx carrying the function's
  own `{"error": …}` body**. Every function validates its body or its caller before
  doing anything, so this touches no data and calls no model. `WORKER_ERROR`,
  `BOOT_ERROR` or `WORKER_LIMIT` anywhere fails at once.

Why the body matters, measured against production on 2026-09-24:

| Call | Status | Body | Who answered |
|---|---|---|---|
| no JWT | 401 | `{"code":"UNAUTHORIZED_NO_AUTH_HEADER",…}` | gateway |
| malformed JWT | 401 | `{"code":"UNAUTHORIZED_INVALID_JWT_FORMAT",…}` | gateway |
| a function that isn't there | 404 | `{"code":"NOT_FOUND",…}` | gateway |
| `{}` with the anon key | 400 | `{"error":"medication_item_id required"}` | the function |

"Any 4xx" would pass a deploy that never created the function, because the
gateway's own 404 is a 4xx. The check requires the function's shape. A gateway
502/503/504 while the new version starts is retried twice, with backoff.

The checks prove the function **booted and ran its own code**. They do not prove
it is **right**: a report change still gets its `vet-report-cold-read`, a clinical
change its adversarial pass, as follow-up issues after the merge.

### Records

Each deploy (success or failure) is recorded as a **GitHub deployment** in the
`edge-functions` environment, task `deploy:<function>`, on the commit that went
live, with a link to the run. The deploying job writes it seconds after its
checks, so it cannot lag a merge the way hand-kept records did (`generate-report`
v16 to v18 went live while the ledger said `pending`; the analyze pair's record
sat in an unmerged draft for eight days). Only records created by the workflow's
own token count.

The payload carries the live commit and its closure fingerprint, `main`'s commit
and fingerprint at that moment, the version and the bundle sha256. The planner
redeploys a function when `main`'s fingerprint moves past the one on its last
successful record.

**Records are signed.** Every workflow in this repo runs as the same
`github-actions[bot]`, so a workflow pushed on any branch could post a well-formed
"success" record and make an owed deploy look done. So each payload carries an
HMAC keyed from `SUPABASE_ACCESS_TOKEN`, which only the `production` environment
holds, and the planner ignores any record whose signature does not verify. A
forged record is therefore just ignored, and the function deploys. **Rotating the
token invalidates every record**: the next push is a bootstrap dry run with a
warning, and one `all-changed` run re-records everything.

The `edge-functions` environment holds **no secrets and no rules**; it is only the
history. Never add a secret to it.

### Holds

`supabase/functions/deploy-manifest.json` keeps only what a person decides:

```json
{
  "order": ["analyze-vomit", "analyze-stool", "ask"],
  "holds": {
    "delete-account": {
      "ref": "CUL-215",
      "since": "2026-08-20",
      "reason": "What it waits for, and what going live early would break.",
      "fingerprint": "sha256:…"
    }
  }
}
```

- **Add a hold in the same PR as the change it holds**, whenever going live on
  merge would hurt: the change needs an app build that isn't live yet (the
  `delete-account` case: it rejects deletions from clients that don't send a
  password), a clinical gate hasn't cleared, or a migration isn't applied. `ref`
  names the gating issue; `fingerprint` is the current closure, which
  `npx jest guards/edgeFunctionDeploy.test.ts` prints.
- **A held function never deploys**, from a merge or a manual run.
- **Touching a held function's code** fails the guard (`HELD-DRIFT`) until you
  update `fingerprint`. That is the acknowledgment that your change waits behind
  the hold rather than going live. If it should go live, lift the hold instead.
- **Release a hold** by deleting the entry. The merge that deletes it deploys the
  function from `main` as it is then.

`order` lists functions that must deploy in sequence when several change at once
(`ask`'s live photo reads route through the two analyze functions). Everything
else deploys after them, alphabetically.

The guard also checks that the workflow's manual-run dropdown lists every function,
so a **new function** needs one line there, and the guard's message says what the
merge will do: **a new function deploys on the merge that adds it.** If it must not
go live yet (no client calls it, a secret is not set), hold it in the same PR.

### Manual runs: redeploy and rollback

Actions → **Deploy Edge Functions** → **Run workflow** (branch `main`):

- **function** `all-changed`, the default: deploy everything `main` has changed
  since its last recorded deploy. Use it after a failed run, or to deploy without
  waiting for the next merge.
- **function** one name, **ref** `main`: redeploy that function from `main`.
- **function** one name, **ref** an older commit: **rollback**. The commit must be
  on `main`'s history (checked before any of its code runs, so only reviewed code
  can deploy). It deploys that commit's source with today's tools.

A held function is refused either way: lift the hold first.

### Rollback

A rollback stays live until **that function's code changes on `main`**. It is not
undone by the next unrelated merge. So, after rolling back, **merge the fix, the
revert, or a hold next**: the first merge that touches the function's closure
deploys `main` over the rollback, and if `main` still carries the bad change, that
merge puts it back. Every run's summary flags a live rollback until then.

### When a deploy fails

The run is red and its summary says which function failed, at which stage
(`prepare`, `deploy`, `verify`, `record`), and whether the new code may be live.
When it may be, the summary prints the exact manual run that restores the previous
version. A failed deploy is not retried within the run; the function stays owed, so
the next merge (or an `all-changed` run) tries again.

### Security

- `SUPABASE_ACCESS_TOKEN` is an **environment secret in `production`**, whose
  deployment branches are limited to `main`. A workflow run on any other branch
  cannot reach the environment, so no PR branch or agent session can read the
  token. It is not a repository secret and not in Codespaces. **This is a setting,
  not code**: § One-time setup has the clicks and the check that proves them.
- **`main`'s protection is the deploy gate.** Merging deploys, so the ruleset that
  requires a PR and has an empty bypass list is what stands between a branch and
  production. Weakening it (a bypass entry, direct pushes) opens a deploy path.
- Prefer a **scoped token**: this project only, Edge Functions read-write, nothing
  else, where Supabase offers scoping.
- The workflow has no `pull_request`, `pull_request_target` or `workflow_run`
  trigger. Manual inputs reach the scripts only as environment variables, and a
  rollback ref must already be on `main`.
- **Only the Plan step (as the record-signing key) and the Deploy step see the
  token**, and both run only `main`'s reviewed code. Every tool is installed in a
  step without it: the lockfile's packages with install scripts off, then esbuild
  and the Supabase CLI at the exact versions pinned in `scripts/deploy-edge.sh`.
  Actions are pinned by commit SHA, as in `ci.yml`. The `deno test` run inside the
  script runs against `deno.lock` with read access to `supabase/functions` and
  nothing else: no environment, no network.
- **The repo is public, so run logs and summaries are too.** They carry function
  names, versions, commits, hashes and the function's one-line error string from
  the smoke call. GitHub masks the token regardless.
- **Rotate** by minting a new token (dashboard → Account → Access Tokens),
  replacing the environment secret, revoking the old token, and then running the
  workflow with `all-changed` (rotation invalidates the record signatures).
- The Supabase MCP's `deploy_edge_function` still works from a session. It is
  break glass only (below), never the normal path.

### One-time setup

In GitHub, repo → **Settings** → **Environments**:

1. **New environment** `production` → **Configure environment**.
2. **Deployment branches and tags**: change "No restriction" to **Selected branches
   and tags** → **Add deployment branch or tag rule** → Ref type **Branch**, name
   pattern `main` → **Add rule**. Exactly one rule, no wildcards.
3. Leave **Required reviewers** and **Wait timer** off (either would turn every
   merge into a click).
4. **Environment secrets** → **Add environment secret** → `SUPABASE_ACCESS_TOKEN`.
   Mint it at supabase.com/dashboard/account/tokens. Where the form offers scoping,
   choose this project only and **Edge Functions: Read-write**, nothing else.
5. **New environment** `edge-functions`, and leave it empty: no secrets, no rules.
   It only holds the deploy history.

**Then check it**, because the whole boundary rests on it:

- Settings → Secrets and variables → Actions: `SUPABASE_ACCESS_TOKEN` must **not**
  appear under Repository secrets. A repository secret reaches every branch.
- Once the workflow is on `main` (Run workflow only lists workflows that are),
  create any branch from `main`, then Actions → Deploy Edge Functions → Run
  workflow → **Use workflow from** that branch. The job must fail before its first
  step with
  *"Branch … is not allowed to deploy to production due to environment protection
  rules"*. If it starts instead, the branch rule is missing: fix step 2 before
  anything else.

### Break glass

Only when Actions itself is unavailable and a fix cannot wait:

1. **Small function:** build with `scripts/deploy-edge.sh <fn>` (no `--deploy`), then
   deploy the bundle with the Supabase MCP `deploy_edge_function` (`verify_jwt:
   true`), read it back with `get_edge_function`, and compare sha256. The inline
   parameter is unsafe past a few tens of KB (`generate-report` is ~560 KB).
2. **Large function:** the PM runs `scripts/deploy-edge.sh <fn> --deploy` with a token
   in their own shell.

Either way, **as soon as Actions is back, run the workflow for that function**
(ref `main`), so the record matches what is live. An out-of-band deploy is invisible
to the records until then.

### The deploy script

`scripts/deploy-edge.sh <fn>` without `--deploy` builds and verifies locally: the
function's `deno test` suite (plus `_shared`'s when it imports `_shared`), an esbuild
bundle into `.edge-build/<fn>/index.ts` with every runtime specifier (`https:`,
`npm:`, `node:`, `jsr:`) left external, a `node --check` syntax gate, and the bundle
sha256. It is the same script the workflow runs, so a local build shows what would
ship. With `--deploy`, a test run that does not pass is a hard failure. esbuild,
the Supabase CLI and the fallback `deno` are pinned at the top of the script; bump
them there.

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
>   migration a code change depends on, apply it **before merging** that code
>   (the migrate-before-deploy gate: merging deploys, CUL-1147).

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
