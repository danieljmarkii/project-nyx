# The workflow audit A2: a CI verdict per merge, and a cloud pre-push that runs only the related tests

**Date:** 2026-10-06
**One thing:** none — dispatched session, not this round's teach row

Dispatched session (CUL-1613, part of CUL-1612). Shipped via #1080.

## What shipped

- **`main` gets its own CI run per merge** (`.github/workflows/ci.yml`). The concurrency group is `ci-<workflow>-<sha on main, ref elsewhere>`. On `main` every commit has its own group, so `cancel-in-progress` never cancels a merge's run; on a PR a re-push still cancels its stale run. This is the 2026-10-03 failure: four merges in six minutes, each cancelling the run before, and `main` red for an hour with no run naming the breaking commit. The header comment no longer says CI runs "the same two commands the hook runs".
- **A guard that evaluates the expression** (`guards/ciConcurrency.test.ts`). It parses the group and evaluates it for two `main` commits (two groups), two pushes to one PR (one group), two PRs (two groups), and checks `cancel-in-progress` stays on and the group names `github.sha`. Mutation: the live `ci.yml` reverted to the shared `${{ github.ref }}` group reds it; restored, green. The evaluator knows a small expression subset and throws on anything else, so an unfamiliar spelling fails loudly instead of passing.
- **The cloud pre-push** (`.githooks/pre-push`). With `CLAUDE_CODE_REMOTE` set: `docs/**` only runs nothing; other non-code files run the test files naming them by repo path; code runs `tsc`, `jest --findRelatedTests` over the changed code, and `guards/`. The base is the remote tip, or the merge-base with `origin/main` for a new branch; with no base it falls back to the full suite. Off the cloud nothing changed.

## Measured

| Push | Time |
|---|---|
| docs-only (this record's real push) | 2.1s end to end (hook 0.01s) |
| `CLAUDE.md` only | 12s (16 suites name it) |
| this PR's code push (real) | 82s total (tsc ~50s, 44 suites) |

The old hook ran the full suite on every push: 3.5 to 12 minutes.

## Decisions, team calls

- **Docs-only skips the type check too.** The issue said "nothing beyond the type check", but tsc alone is 50 to 64s here, which breaks the under-30s done-when, and a push that changes no file tsc reads cannot change its verdict. Engineer call, logged on the issue.
- **Code pushes also run `guards/`** (~40s). The guards read the source tree through the filesystem, so `--findRelatedTests` (an import-graph walk) never selects them, and a red guard is the likeliest CI failure on a code push. The full jest suite stays CI's required check.

## Residual

- The "two merges within a minute each get a completed run" check needs real merges; it waits for the next pair to land close together, to be confirmed in the Actions list.

## Review

`code-reviewer` found no blocker; the CI expression and the guard were confirmed correct. It found two real holes in the hook, both fixed before merge:
- A push that only deleted a code file ran nothing, so a dangling import reached CI. Deleted code paths now force tsc (they stay out of `--findRelatedTests`, which cannot resolve a missing file). Proven: deleting `lib/haptics.ts` alone now blocks the push on the two TS2307s.
- A non-ASCII path came back quoted (`core.quotePath`), missed every case arm and skipped its checks. The diff now runs with `core.quotePath=false`.
