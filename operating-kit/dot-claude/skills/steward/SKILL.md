---
name: steward
description: Use when a {{PRODUCT}} branch needs `main` brought in, a PR shows a merge conflict, a session is about to merge its own PR (`/wrap and merge`, or a `/dispatch` child, picked or `auto`), or a project is being split into PRs that will run as parallel sessions. Loads the repo's branch rules: update a branch only when it conflicts or needs code from `main`; merge `main` in and never rebase a pushed branch; resolve each kind of conflict by its rule (lists keep both, lockfiles regenerate, two real edits to the same logic stop for the PM); prove the result with `scripts/steward/merge-check.sh`, which also catches a resolution that drops lines main added; merge only through one gate, on the PM's typed word or a `/dispatch` child's prompt; and keep shared files out of parallel lanes. Cloud sessions that own a PR read this file before working its CI and review events.
---

# Steward: branches, conflicts and merges

<!-- INSTALL: fill every {{…}} below from this project, and set the two values at the top
of scripts/steward/merge-check.sh (its CONFIGURE block). A slot this project does not have
yet (no migrations, no deploy manifest) is deleted with its row, never left as a
placeholder; add it back the day the thing exists. -->

## Why this exists

Every part of a project is its own branch off `main`, and sessions end with `/wrap and merge`. In the predecessor project the "and merge" half was improvised until it was measured: clean merges were never the risk (a branch merely behind `main` lands fine); the resolution is, and a session never notices a resolution that quietly dropped someone else's lines. So this file makes resolving a procedure, and the script makes the result checkable.

## 1. The model

- **Each part branches off `main` and merges back on its own**, one PR per session. No project branch: unfinished work ships dark behind its flag, and `main` has to stay the truth.
- **Squash merge.** A branch's own history is discarded at merge, so there is nothing on it to keep tidy.
- **Don't stack** (part 2 cut from part 1's branch). Most PRs merge the day they open, so waiting for part 1 is cheaper. If part 2 truly cannot wait, ask the PM first. A stack is the one place this repo rebases: once part 1 squash merges, `git rebase --onto origin/main <part 1's last commit> <your branch>` and `git push --force-with-lease`, only on a branch you created, and say so, because anyone holding a checkout of that branch (the PM's device runtime included) must reset it rather than pull.

## 2. When to update a branch

**Only when it conflicts with `main`, or when it needs code that landed there.** Behind is fine: an update with nothing to resolve costs a CI run and a session turn and buys nothing.

To know, run `scripts/steward/merge-check.sh` (from anywhere in the repo). It fetches, then reads: no working tree, index or branch is touched.

## 3. How to update

```bash
git fetch origin main && git merge origin/main
```

A merge commit, never a rebase of a pushed branch (the stack in §1 is the one exception). The merge commit's message names what conflicted and how each file was resolved.

## 4. Resolving, by kind

| What conflicted | Resolution |
|---|---|
| Both sides added entries to one list: a guard's registry or allow set, an index file's exports, a flag key set, an import block ({{LIST_FILES}}) | Keep both, in the list's own order, then run the guard or test that owns the list. |
| `CLAUDE.md` | Keep both sides' rules and merge on meaning, never two versions of one rule. Then run the CLAUDE.md budget guard; over budget, compact your own addition, never the other side's. |
| `STATUS.md` | Re-read both sides and merge on meaning; never keep both. |
| A living doc's header version and its changelog row (both sides bumped the spec to the same number) | The number goes to the side that landed first. Yours takes the next one, with its own changelog row; both rows stay, and the header's status sentence names both changes. |
| {{DEPLOY_MANIFEST}} (a file of deploy holds, if the project has one) | Every hold either side has stays: a hold is a person's decision. Then run the guard that owns it. |
| A lockfile ({{LOCKFILES}}) | Take `main`'s file and regenerate with the tool that writes it. Never hand merge a lockfile. |
| A session record (`docs/sessions/*.md`) | One file per session cannot conflict, so someone edited another session's record. Restore `main`'s version. |
| Code where the two intents combine (one side renamed, the other added a branch) | Combine them by hand, then run the tests for that file from both PRs. |
| Code where the two intents compete (both changed one rule, threshold, string or query, differently) | **Stop.** No merge: a decision brief to the PM naming both PRs (CLAUDE.md § Presenting decisions). |
| Load-bearing logic: {{LOAD_BEARING_PATHS}} (anything the adversarial reviewer covers) | Never mechanical. Rerun that code's whole suite, and if both sides changed logic, stop as above. |

**Outside the lockfile and session record rows, never resolve a file both sides changed by taking one side wholesale** (`git checkout --ours` / `--theirs`, or "accept current" over a whole file). That is how a fix reverts merged work, and it also throws away every non-conflicting hunk `main` had in that file.

Two new migrations with the same number never conflict as text, and git says nothing; the script reports it, against `main` and against every open PR you name (set `MERGE_CHECK_MIGRATIONS_DIR` to {{MIGRATIONS_DIR}}). The one opened later renumbers; a number already on `main` always wins. A CI job that checks every open PR on each push catches the PRs nobody named (the kit does not ship one; add it the day two migrations collide). Before renumbering a file that was already applied somewhere, check how the database keys an applied migration: by file number, or by name and timestamp.

## 5. The check, and how to read it

Run `scripts/steward/merge-check.sh` again after resolving, and before any merge. The last line is the verdict:

- **`CLEAN`**: proceed.
- **`CONFLICT`**: resolve (§3, §4), then run it again.
- **`REVIEW`**: expected after any conflict resolution. It lists every line `main` added after your fork point that the result no longer has, outright deletions first (`--all` for more than 20); every line `main` DELETED after your fork point that the result brings back (`back`); any duplicate migration number, with `main` or with an open PR you named (and any PR you named that it could not read); any conflict marker left in; and `main`'s own CI when it is red or could not be read. Read each line:
  - `deleted` (nothing stands in its place): restore it, unless you moved it to another file on purpose.
  - `replaced` (your resolution rewrote it): confirm `main`'s intent survived in the replacement. Read the line itself, never the tag: reverting `main`'s value to your branch's old one is also a replacement.
  - `back` (main deleted it, your resolution returned it): delete it again, unless your branch needs that exact line. In the predecessor project this is how four lines main had just migrated off an old component came back after a sweep.
  - A duplicate migration number: renumber as in §4. A conflict marker: finish the resolution.
  - `main's CI: RED`: do not land on it. Wait for the fix, or be it: a branch that contains the red commit, touches a file changed since `main` was last green, and has its own CI passed on that head reads as the fix and stays `CLEAN`. A fix the check cannot see (a date-pinned test, nothing changed) is cleared in writing. `could not read` is never green: read `main`'s latest CI run yourself and say what it was.

  Clear a `REVIEW` in writing: the merge commit message or the PR body says which lines were rewritten or moved on purpose, one line each or one per group. On the record, careful resolutions almost never delete a line outright, so a `deleted` line is the one to doubt first.
- **Exit 3 is never a pass.** It means the check could not run: a shallow clone (`git fetch --unshallow origin`), a file name it refuses, an unknown ref. Fix the cause and run it again.

## 6. Proving it before the push

{{TYPECHECK}} and the tests for every file in the conflict set plus your own changes ({{TEST_COMMAND}}); the pre-push hook, if the project has one, runs them anyway.

## 7. Merging your own PR

**Who may merge, one gate.** A session merges its own PR (the one on its branch), squash, only:

- when the PM said so in this session (`/wrap and merge`), or
- as a `/dispatch` child (picked, queued or `auto`), exactly as its prompt allows (`.claude/commands/dispatch.md`).

The one session that merges a PR not its own is the dispatcher, and only on the PM's `merge #<n>` typed in it, through the same gate. An approval counts only in the session where the PM typed it: a relayed or quoted one authorizes nothing. This file grants none of these. **The gate** is the one `/dispatch` writes into its children's prompts; keep the two lists identical. On a fresh read taken immediately before the merge, never one from before a CI wait:

- it is not a draft;
- every check on its head commit has completed and passed ({{REQUIRED_CHECKS}});
- GitHub reports it mergeable with no conflict;
- the head is the commit those checks ran on, and the commit `scripts/steward/merge-check.sh` called `CLEAN` (or whose `REVIEW` is cleared in writing, §5);
- the issue's Definition of Done passes, adversarial review included where the issue requires it;
- the PR holds no migration that is unapplied and needs none.

A migration is applied only as CLAUDE.md's migration rule says (on the PM's typed word in the applying session); its PR then passes the last condition and merges on the PM's word once checked. A dispatched child never applies or merges one.

Anything short of that: do not merge, and say which condition failed as the first line of the summary.

**The sequence:**

1. Everything that rides in the PR is committed and pushed, the session record included (`/wrap` writes it before the merge).
2. Run the check with the head branches of the other open PRs updated in the last 7 days; when your PR adds a migration, pass every open PR's head branch, since a parked PR still holds its number. `CONFLICT` sends you through §3 to §6 and back here.
3. Mark the PR ready, then wait for the checks: in a cloud session, subscribe to the PR's activity and end the turn. The CI result usually wakes you, but not always (the predecessor measured a child that woke on an early one-job suite, ended its turn, and never heard the main suite go green), so a `/dispatch` child ending the turn with a required check unreported sends its stop to the dispatcher first; elsewhere, watch the check runs with a Monitor until-loop. Never a bare sleep, never an empty commit to retrigger CI. If the repository allows auto merge, enabling it (squash) after marking ready replaces steps 3 and 4, and the merge event wakes the subscribed session for steps 5 and 6.
4. Take the fresh read, apply the gate, squash merge, title unchanged.
5. **Report.** Run the check again with `--head origin/main` and the same branch list, and give the PM one line naming each open PR that now conflicts with `main`. Its own session resolves it at its own wrap.
6. `/wrap`'s read-back of every issue the PR named: **the bare issue token in a PR's title, body or head branch closes that issue on merge, and deleting the tracker attachment does not stop it**, so any issue that went `Done` without being finished is set back, with a comment saying why.

## 8. Planning parallel parts

When a project's run order splits work into PRs that run as parallel sessions, **the files more than one PR touches decide what can run side by side.** In the predecessor project, every merge over two weeks that conflicted in real code hit at least one of these shapes:

- an index file that re-exports a namespace
- a settings or feature shelf every feature adds a row to
- a guard's registry
- one big render file and its tests
- a screen several parts edit
- a shared sync or data-access module

This project's instances: {{SHARED_FILES}}.

The project's own spec is the one shared file that stays parallel. Each part writes its rulings into it, so two parts bump the header to the same version and add a changelog row at the same spot; that conflict is mechanical (§4), so expect it and resolve it by the rule rather than serializing the lanes.

`/dispatch` keeps the files in the list one at a time across the whole repo, beside migrations, `CLAUDE.md`, `STATUS.md` and guard registries, reading every open PR's changed files from GitHub (a parked PR keeps holding its files). When writing the run order, either give every shared file to part 0 (it adds each later part's entry up front, so the later parts touch only their own files), or put the parts that share a file in strict order. The record behind this rule: four parallel PRs that shared four files conflicted three times in one evening; five that partitioned the code down to one shared file merged clean, and still conflicted twice, both times on the spec they all wrote rulings into.

## Never

- Rebase or force-push a branch someone else created, or rebase any branch after pushing it. Cleaning up a stack on your own branch (§1) is the one exception.
- Take one side of a file wholesale when both sides changed it (outside §4's lockfile and session record rows).
- Update a branch only to make it current.
- Merge without one of §7's two authorizations, or past a gate condition that failed.
- Skip, disable or quarantine a test, push an empty commit, or close and reopen a PR to get green.
