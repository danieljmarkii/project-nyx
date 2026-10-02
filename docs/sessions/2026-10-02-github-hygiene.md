# GitHub hygiene: the audit and the files a session could fix

**Date:** 2026-10-02 · **Branch:** `claude/elegant-planck-llx0c2` · shipped via #1003 · CUL-1490 · scope: repo health, no app code, no schema, no deploy.
**One thing:** G5 L1 — Protection: required checks are why `main` cannot go red silently · check: pending

## The ask

The PM noticed the repo had no real README and asked what else was missing, with a low lift plan to close the gaps.

## What the audit found

1. **The repo is public**, with no recorded decision. A secret scan found nothing live (no Supabase PAT, Anthropic, Resend or service role key; the anon key in `eas.json` is public by design), but the attorney brief, strategy and financial docs, session records narrating security findings, and the PM's email are world readable. Going private on a free plan likely disables the `main` ruleset and caps Actions minutes; GitHub Pro avoids both. A PM call.
2. README was one line.
3. ~958 remote branches: merged head branches are never deleted.
4. 48 open PRs, 46 drafts, back to 2026-06-12.
5. No Dependabot, while CI's actions are SHA-pinned and bumped by hand; `npm audit` shows 29 advisories (1 critical, transitive).
6. The DoD says "lint is clean" and no linter exists.
7. GitHub Issues, Wiki and Projects enabled and unused (Linear owns tracking).
8. Root `dev-handoff.sh` taught `git pull origin $BRANCH` without a checkout, the anti-pattern CLAUDE.md names as its one non-negotiable git rule.
9. No local Node pin (CI uses 22).

## What shipped (this PR)

| Change | Why |
|---|---|
| `README.md` rewritten | What Culprit is, stack, setup, tests and CI, deploys, repo map, where the rules and the work live, a proprietary notice |
| `.github/dependabot.yml` | Actions monthly in one group; npm security updates only (`open-pull-requests-limit: 0` disables version updates) so Expo SDK bumps stay deliberate |
| `.nvmrc` + `engines` | Matches CI's Node 22. The lockfile change is the root `engines` metadata only, no dependency moved |
| `dev-handoff.sh` deleted | Unreferenced, wrong, superseded by `docs/dev-handoff-runbook.md` |
| `scripts/repo-hygiene/prune-merged-branches.sh` | Dry run by default. Deletes only a branch with no open PR whose head equals a merged PR's head; closed unmerged PRs only with `--include-closed`. Proved on a local bare remote: merged deleted; open, closed, pushed after merge and no PR kept; an empty `gh` answer exits 1 |

## Deliberately not done

- **`npm audit fix`.** The 1.2.0 native cut is next and release QA (#1000) leaned on the lockfile being unchanged since the 08-29 build. Dependabot security PRs land those one at a time through CI.
- **Deleting branches and closing PRs.** Both are writes to other branches and PRs; the script and the triage issue hand them to the PM.
- **`SECURITY.md` / `LICENSE` file.** Depends on the visibility ruling.

## Filed

Follow-ups live in Linear and are linked from CUL-1490 rather than named here, so the merge closes only CUL-1490: the PM's half (visibility ruling, settings toggles, the branch prune run, the stale PR round) and the lint job.

## Verification

Local pre-push: `tsc` and the full jest suite (601 suites, 13,348 tests) green. CI on #1003: all three required checks green. The prune script was driven against a local bare remote covering every category (merged, merged-then-pushed, closed unmerged, open, no PR, `main`), plus an empty `gh` answer.

## Residuals

- The `Waiting on PM` queue is far over its cap of 30. The PM's half of this audit was still filed as one issue, because only the repo owner can change these settings and the visibility ruling is on the never-list (privacy).
- `scripts/repo-hygiene/prune-merged-branches.sh` has no automated test; it is an operator script run once by hand, and its proof is the fixture run above.

