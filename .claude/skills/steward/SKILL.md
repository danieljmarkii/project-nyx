---
name: steward
description: Use when a Nyx branch needs `main` brought in, a PR shows a merge conflict, a session is about to merge its own PR (`/wrap and merge`), or a project is being split into PRs that will run as parallel sessions. Loads the repo's branch rules: update a branch only when it conflicts; merge `main` in and never rebase a pushed branch; resolve each kind of conflict by its rule (lists keep both, lockfiles regenerate, two real edits to the same logic stop for the PM); prove the result with `scripts/steward/merge-check.sh`, which also catches a resolution that drops lines main added; merge only on the PM's word, through one sequence; and keep shared files out of parallel lanes. Cloud sessions that own a PR read this file before working its CI and review events.
---

# Steward: branches, conflicts and merges

## Why this exists

Every part of a project is its own branch off `main`, and sessions end with `/wrap and merge`. Until CUL-1497 the "and merge" half was improvised. A replay of every base merge across 858 session branches (2026-09-25) found 417 merges of `main` into a branch, 242 with a real conflict, and one session (2026-08-23) that caught a stale branch whose merge would have reverted two PRs already on `main`. Clean merges were never the risk: `main`'s CI passed 97 of 100 September merges, and a PR merged one commit behind changed nothing. The resolution is the risk, so this file makes it a procedure and the script makes it checkable. Full account: `docs/engineering-lessons.md` §P-15.

## 1. The model

- **Each part branches off `main` and merges back on its own**, one PR per session. No project branch: unfinished work ships dark behind its flag (the flag-off guards make that safe), Edge Functions deploy on merge, and migrations apply live, so `main` has to stay the truth.
- **Squash merge.** A branch's own history is discarded at merge, so there is nothing on it to keep tidy.
- **Don't stack** (part 2 cut from part 1's branch). Most PRs merge the day they open, so waiting for part 1 is cheaper. If part 2 truly cannot wait: open it against part 1's branch, and once part 1 squash merges, run `git rebase --onto origin/main <part 1's last commit> <your branch>` and `git push --force-with-lease`. That is the one rebase this repo does, and only on a branch you created.

## 2. When to update a branch

**Only when it conflicts with `main`, or when it needs code that landed there.** Behind is fine. An update with nothing to resolve costs a CI run and a session turn and buys nothing; 8 of the 21 updates between 2026-09-12 and 09-25 were exactly that.

To know, run `scripts/steward/merge-check.sh`. It fetches, then reads: no working tree, index or branch is touched.

## 3. How to update

```bash
git fetch origin main && git merge origin/main
```

A merge commit, never a rebase of a pushed branch (that rewrites history other clones hold and needs a force push). The merge commit's message names what conflicted and how each file was resolved.

## 4. Resolving, by kind

| What conflicted | Resolution |
|---|---|
| Both sides added entries to one list: a guard's registry (`SURFACES`, `REGISTERED`, `ALWAYS_SCANNED`, an allow set), an index file's exports, `app/settings/beta.tsx`, a flag key set, an import block | Keep both, in the list's own order, then run the guard or test that owns the list. |
| `CLAUDE.md` | Keep both sides' rules and merge on meaning, never two versions of one rule. Then `npx jest guards/claudeMdBudget.test.ts`; over budget, compact your own addition, never the other side's. |
| `STATUS.md` | Re-read both sides and merge on meaning; never keep both (`/wrap` step 3c). |
| A living doc's header version and its changelog row (both sides bumped the spec to the same number) | The number goes to the side that landed first. Yours takes the next one, with its own changelog row; both rows stay, and the header's status sentence names both changes. |
| `supabase/functions/deploy-manifest.json` | Every hold either side has stays: a hold is a person's decision. Then `npx jest guards/edgeFunctionDeploy.test.ts` and update any fingerprint it names. |
| A lockfile (`package-lock.json`, `deno.lock`) | Take `main`'s file and regenerate with the tool that writes it (`npm install` for the npm lock). Never hand merge a lockfile. |
| A session record (`docs/sessions/*.md`) | One file per session cannot conflict, so someone edited another session's record. Restore `main`'s version. |
| Code where the two intents combine (one side renamed, the other added a branch) | Combine them by hand, then run the tests for that file from both PRs. |
| Code where the two intents compete (both changed one rule, threshold, string or query, differently) | **Stop.** No merge: a decision brief to the PM naming both PRs (CLAUDE.md § Presenting decisions). |
| Clinically or statistically load-bearing code (`generate-signal/`, `analyze-*`, `generate-report/`, `lib/dietTrial*.ts`, anything feeding the vet report) | Never mechanical. Rerun that code's whole suite, and if both sides changed logic, stop as above. |

**Never resolve a file both sides changed by taking one side wholesale** (`git checkout --ours` / `--theirs`, or "accept current" over a whole file). That is how a fix reverts merged work, and it also throws away every non-conflicting hunk `main` had in that file.

Two new migrations with the same number never conflict as text, and git says nothing; the script reports it. Renumber the file that lands second. The live database keys a migration by its apply timestamp and name (`list_migrations`), never by the file's number, so renaming an unmerged file is safe even after `apply_migration` ran.

## 5. The check, and how to read it

Run `scripts/steward/merge-check.sh` again after resolving, and before any merge. The last line is the verdict:

- **`CLEAN`**: proceed.
- **`CONFLICT`**: resolve (§3, §4), then run it again.
- **`REVIEW`**: expected after any conflict resolution. It lists every line `main` added after your fork point that the result no longer has, outright deletions first:
  - `deleted` (nothing stands in its place): restore it, unless you moved it to another file on purpose.
  - `replaced` (your resolution rewrote it): confirm `main`'s intent survived in the replacement. Read the line itself, never the tag: reverting `main`'s value to your branch's old one is also a replacement.
  - A duplicate migration number: renumber as in §4.

  Clear a `REVIEW` in writing: the merge commit message or the PR body says which lines were rewritten or moved on purpose, one line each or one per group. Calibration, so the verdict is read honestly: across the 34 real resolutions from 2026-08-23 to 09-25, 32 deleted nothing outright and 2 deleted one line each, both deliberate; a careless replay of one of them deleted 10 outright.

## 6. Proving it before the push

`npx tsc --noEmit` and the tests for every file in the conflict set plus your own changes; the pre-push hook runs the type check and the whole jest suite anyway. For a `supabase/functions/` file in the conflict set, run that function's Deno suite (the command is in `.github/workflows/ci.yml`).

## 7. Merging your own PR (`/wrap and merge`)

**Only when the PM said so in this session.** This file never authorizes a merge; the PM's word does. Then, in order:

1. Everything is committed, the wrap's session record included, and pushed.
2. Run `scripts/steward/merge-check.sh` with the head branches of the other open PRs updated in the last 7 days (`list_pull_requests`). `CONFLICT` sends you through §3 to §6 and back here; a `REVIEW` is cleared in writing (§5).
3. **Required checks green on the final head commit.** If the repository allows auto merge, enable it with the squash method and stop waiting. Otherwise wait for the checks: in a cloud session, subscribe to the PR's activity and end the turn, and the CI result wakes you; elsewhere, watch the check runs with a Monitor until-loop. Never a bare sleep, never an empty commit to retrigger CI.
4. Mark the PR ready (a draft cannot merge) and squash merge it, title unchanged.
5. **Report.** Run the script again with `--head origin/main` and the same branch list, and give the PM one line naming each open PR that now conflicts with `main`. Its own session resolves it at its own wrap.
6. `/wrap` step 4's read-back of every issue the PR named.

If any step fails (a red check, a competing edit, a `REVIEW` you cannot clear), do not merge, and say so as the first line of the summary.

## 8. Planning parallel parts

When a project's run order splits work into PRs that run as parallel sessions, **the files more than one PR touches decide what can run side by side.** Every merge between 2026-09-12 and 09-25 that conflicted in real code hit at least one of these shapes:

- an index file that re-exports a namespace (`components/designV2/index.ts`)
- the beta shelf, `app/settings/beta.tsx`
- a guard's registry (`guards/designV2FlagOff.test.tsx`, `guards/haptics.test.ts`)
- one big render file and its tests (`supabase/functions/generate-report/render.ts`)
- a screen several parts edit (`app/(tabs)/history.tsx`)
- the shared sync module (`lib/sync.ts`)

The project's own spec is the one shared file that stays parallel. Each part writes its rulings into it, so two parts bump the header to the same version and add a changelog row at the same spot (History v2, twice on 2026-09-25); that conflict is mechanical (§4), so expect it and resolve it by the rule rather than serializing the lanes.

`/dispatch` keeps the files in the list one at a time, beside migrations, `CLAUDE.md`, `STATUS.md` and guard registries. When writing the run order, either give every shared file to part 0 (it adds each later part's entry up front, so the later parts touch only their own files), or put the parts that share a file in strict order. The record behind this rule: Design v2's four parallel PRs (2026-09-21) shared four files and conflicted three times in one evening. History v2's five (2026-09-25) partitioned the code down to one shared file that merged clean, and still conflicted twice, both times on the spec they all wrote rulings into; 5 of their 7 updates from `main` had nothing to resolve.

## Never

- Rebase or force-push a branch someone else created, or rebase any branch after pushing it. Cleaning up a stack on your own branch (§1) is the one exception.
- Take one side of a file wholesale when both sides changed it.
- Update a branch only to make it current.
- Merge without the PM's word in this session.
- Skip, disable or quarantine a test, push an empty commit, or close and reopen a PR to get green.
