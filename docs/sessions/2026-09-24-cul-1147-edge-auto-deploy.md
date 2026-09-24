# CUL-1147 — Edge Functions deploy on merge

**Date:** 2026-09-24 · **Branch:** `claude/great-volta-yxw6zj` · shipped via #901 · mode BUILD (plan posted, PM said go) · reviewed by `rls-privacy-reviewer` and `code-reviewer`, all findings fixed or filed

## Outcome

A merge to `main` now deploys every Edge Function whose shipping closure changed since its last recorded deploy, checks it, and records it: `.github/workflows/edge-deploy.yml` plus `scripts/edge-deploy/`. The ledger keeps only `holds` and `order` (41.8 KB → 1.9 KB). The Codespace deploy step and the hand-kept `deployed`/`pending` statuses are retired. The first real run happens after merge, because the token only works on `main` (CUL-1152).

| Piece | What it does | Proof |
|---|---|---|
| Plan (in `production`, main only) | Fingerprints each closure with the guard's walker (moved to `scripts/edge-deploy/fingerprint.ts`), reads each function's last verified record, and marks it deploy / unchanged / held. Bootstrap: no records anywhere → nothing deploys, and the run warns | Dry runs on this repo. No records: bootstrap table. One record: six deploys in the declared order, `delete-account` held. All recorded: nothing to deploy |
| Deploy (same job, only when planned) | `deploy-edge.sh <fn> --deploy`. Then version bumped + ACTIVE + verify_jwt (Management API), a no-JWT 401 from the gateway, and an anon `{}` 4xx in the function's own shape. Stops at the first failure | The real judgment code run against all eight live functions: all pass. A missing function fails, because the gateway's own 404 is a 4xx that "any 4xx" would pass |
| Records | One GitHub deployment per deploy in `edge-functions`, **HMAC-signed** with a key derived from the token. Unsigned or edited records are ignored. A rollback stays live until main changes that function | Unit tests: forged, re-keyed, made-up and edited signatures rejected; paging order-independent |
| Manual runs | `all-changed`, a redeploy, or a rollback to a commit already on main. Held functions refused | Planner tests |
| Guard | Holds are reasoned and current (`HELD-DRIFT`), names exist, the dropdown lists every function. For a new function, the message says merging deploys it | Mutations: a dropdown line removed, the held function touched, a stale order entry. Each reds the real-repo scan |
| `deploy-edge.sh` | `--provision-only`; esbuild 0.28.2, Supabase CLI 2.117.0 and the fallback deno pinned; `--deploy` makes a non-passing test run fatal; tests run against `deno.lock` | `--provision-only` and a full build of `extract-medication-from-photo` (68 tests) locally; `shellcheck` clean |

Mutations on the new logic, each caught: holds ignored; comparing against the live fingerprint instead of `mainFingerprint`; no bootstrap; accepting the gateway's shape; accepting any 4xx; continuing after a failure; any record creator; no signature check; reading one page. `actionlint` is clean on both workflows, and `tsc` is clean.

## Decisions

- **Records are GitHub deployments**, not the ledger via an auto-merged PR (PM go, 2026-09-24). A PR opened by the workflow's own token never triggers CI, and a record that waits on a merge is how #852 went stale.
- **Records are signed, and planning moved into `production`** (from review). The author check alone was not a boundary: every workflow in the repo runs as `github-actions[bot]`, so a branch workflow could forge a "success" record and make an owed deploy look done. The planner now verifies an HMAC only the `production` environment can produce. Rotating the token invalidates the records, so the runbook says to run `all-changed` after rotating.
- **Bootstrap, then prove on one small function, then `all-changed`** (PM go).
- **New CLAUDE.md rule:** a server change that must wait for an app build is marked `hold` in the same PR, and a function change never merges before its migration.

## Found on the way

- Live `generate-report` is **v18** (deployed ~01:00 UTC today) while `main`'s ledger said `pending`: the third unrecorded deploy this month.
- Supabase now offers **scoped tokens** (project + Edge Functions read-write). The setup recommends one.
- The production gateway's own replies (`{"code":…}` for no JWT, a bad JWT, a missing function) are distinguishable from every function's `{"error":…}`. That is what makes a boot check possible without a token.

## Reviews

- **`rls-privacy-reviewer`:** token confidentiality HELD in code, on every path it tried: fork PR, branch-modified workflow, dispatch on a branch, injection through inputs, unreviewed code in the rollback worktree, cache poisoning, public logs. It is contingent on the environment's branch rule, a setting, now with a check in the runbook's One-time setup.
  - **FAIL on record integrity:** forged records. Fixed by signing, as above.
  - `deno test` without `--lock`: fixed.
  - API error bodies in public logs: fixed.
  - `main`'s protection named as the deploy gate: done.
  - Tools pinned by version, not hash: filed as CUL-1153.
- **`code-reviewer`:** no correctness bug in the planner, the loop or the checks.
  - Record lookup trusted an undocumented list order (one page of 30): fixed by reading every page.
  - A new function got no hold prompt: fixed in the guard's message and the runbook.
  - The `ref` input text didn't match the code, the docs lacked the branch-rule click, and the fallback deno install was unpinned: all fixed.

## Still owed (post-merge, CUL-1152)

1. PM: the `production` and `edge-functions` environments and the token, then the runbook's check.
2. Merge; the push run is a bootstrap dry run.
3. Run workflow → `extract-medication-from-photo` (the proof).
4. Run workflow → `all-changed` (the baseline).
5. Delete the Codespace secret; revoke its token.
6. Propose closing CUL-700 and CUL-48; fold CUL-795's deploy step.
