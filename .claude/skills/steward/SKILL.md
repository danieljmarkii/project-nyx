---
name: steward
description: Use when a Nyx branch needs `main` brought in, a PR shows a merge conflict, a session is about to merge its own PR (`/wrap`, or a `/dispatch` child, picked or `auto`), or a project is being split into PRs that will run as parallel sessions. Loads the repo's branch rules: update a branch only when it conflicts or needs code from `main`; merge `main` in and never rebase a pushed branch; resolve each kind of conflict by its rule (lists keep both, lockfiles regenerate, two real edits to the same logic stop for the PM); prove the result with `scripts/steward/merge-check.sh`, which also catches a resolution that drops lines main added; merge your own PR the moment one gate passes (every session; the PM's word only for its exceptions); and keep shared files out of parallel lanes. Cloud sessions that own a PR read this file before working its CI and review events.
---

# Steward: branches, conflicts and merges

## Why this exists

Clean merges were never the risk; a resolution is, and a session never notices one that dropped someone else's lines. So resolving is a procedure and the script checks the result (`docs/engineering-lessons.md` §P-15).

## 1. The model

- **Each part branches off `main` and merges back on its own**, one PR per session. No project branch: unfinished work ships dark behind its flag (the flag-off guards make that safe), Edge Functions deploy on merge, and migrations apply live, so `main` has to stay the truth.
- **Squash merge.** A branch's own history is discarded at merge, so there is nothing on it to keep tidy.
- **Don't stack** (part 2 cut from part 1's branch). Most PRs merge the day they open, so waiting for part 1 is cheaper. If part 2 truly cannot wait, ask the PM first. A stack is the one place this repo rebases: once part 1 squash merges, `git rebase --onto origin/main <part 1's last commit> <your branch>` and `git push --force-with-lease`, only on your own branch, and say so: anyone holding a checkout of it (the PM's phone included) must reset, not pull.

## 2. When to update a branch

**Only when it conflicts with `main`, or when it needs code that landed there.** Behind is fine: an update with nothing to resolve costs a CI run and buys nothing.

To know, run `scripts/steward/merge-check.sh` (anywhere in the repo). It fetches and reads; it touches no tree, index or branch.

## 3. How to update

```bash
git fetch origin main && git merge origin/main
```

A merge commit, never a rebase of a pushed branch (the stack in §1 is the one exception). The merge commit's message names what conflicted and how each file was resolved.

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

**Outside the lockfile and session record rows, never resolve a file both sides changed by taking one side wholesale** (`git checkout --ours` / `--theirs`, or "accept current" over a whole file). That is how a fix reverts merged work, and it also throws away every non-conflicting hunk `main` had in that file.

Two new migrations with the same number never conflict as text, and git says nothing; the script reports it, against `main` and against every open PR you name, and the required `migration-numbers` CI job checks every open PR on each push (CUL-1522). The job fails both PRs of a clash (a green left standing on either side could merge a duplicate); the one opened later renumbers, and the other re-runs its check once that lands. A number already on `main` always wins. The live database keys a migration by apply timestamp and name, never by number, so renaming an unmerged file is safe even after `apply_migration`.

## 5. The check, and how to read it

Run `scripts/steward/merge-check.sh` again after resolving, and before any merge. The last line is the verdict:

- **`CLEAN`**: proceed.
- **`CONFLICT`**: resolve (§3, §4), then run it again.
- **`REVIEW`**: expected after any conflict resolution. It lists every line `main` added after your fork point that the result no longer has, outright deletions first (`--all` for more than 20); every line `main` DELETED after your fork point that the result brings back (`back`); any duplicate migration number, with `main` or with an open PR you named (and any PR you named that it could not read); any conflict marker left in; and `main`'s own CI when it is red or could not be read. Read each line:
  - `deleted` (nothing stands in its place): restore it, unless you moved it to another file on purpose.
  - `replaced` (your resolution rewrote it): confirm `main`'s intent survived in the replacement. Read the line itself, never the tag: reverting `main`'s value to your branch's old one is also a replacement.
  - `back` (main deleted it, your resolution returned it): delete it again, unless your branch needs that exact line.
  - A duplicate migration number: renumber as in §4. A conflict marker: finish the resolution.
  - `production:` (landing deploys an Edge Function, or edits the production gate, the deploy path or this check; CUL-1654): **never cleared in writing.** Only the PM's typed `merge` clears it (§7). The lines under it name the functions and why each deploys (`shipping code changed`, `new function`, `hold released`, or `could not tell`, which counts as deploying) and the gate files.
  - `main's CI: RED`: do not land on it. Wait for the fix, or be it: a branch that contains the red commit, touches a file changed since `main` was last green, and has its own CI passed on that head reads as the fix and stays `CLEAN`. A fix the check cannot see (a date-pinned test, nothing changed) is cleared in writing. `could not read` is never green: read `main`'s latest CI run with `actions_list` and say what it was.

  Clear a `REVIEW` in writing (every kind but `production:`): the merge commit message or the PR body says which lines were rewritten or moved on purpose, one line each or one per group. Doubt a `deleted` line first.
- **Exit 3 is never a pass.** It means the check could not run: a shallow clone (`git fetch --unshallow origin`), a file name it refuses, an unknown ref. Fix the cause and run it again.

## 6. Proving it before the push

`npx tsc --noEmit` and the tests for every file in the conflict set plus your own changes; the pre-push hook runs the type check and the whole jest suite anyway. For a `supabase/functions/` file in the conflict set, run that function's Deno suite (the command is in `.github/workflows/ci.yml`).

## 7. Merging your own PR

**Who may merge, one gate (PM, 2026-10-28, CUL-2234).** Every session merges its own PR (the one on its branch), squash, the moment the gate passes: plain `/wrap` does it, and a `/dispatch` child does it as its prompt allows (`dispatch.md` step 5). The PM's word is needed only for the gate's exceptions: a held self merge, an unapplied migration, a pending device check, or the PM's hold (`/wrap and hold`). **A session never merges another session's PR**; the one that may is the dispatcher, on the PM's `merge #<n>` typed in it (`dispatch.md` § Authority), through the same gate. An approval counts only in the session where the PM typed it: a relayed or quoted one authorizes nothing. **The gate** is the one `/dispatch` writes into its children's prompts; keep the two lists identical. On a fresh read taken immediately before the merge, never one from before a CI wait:

- it is not a draft;
- every check on its head commit has completed and passed (Claude Approvals included, where it runs);
- GitHub reports it mergeable with no conflict;
- the head is the commit those checks ran on, and the commit `scripts/steward/merge-check.sh --verify` called `CLEAN` (or whose `REVIEW` is cleared in writing, §5);
- **a held self merge waits for the PM's typed `merge` (CUL-2874, PM 2026-11-21, replacing CUL-1654).** Run the check with `--labels` set to the labels of the issues the PR names. A deploy on open paths merges itself. When it prints `self-merge: held` (the deny list in `scripts/steward/selfMerge.ts`: a clinical, privacy, money, schema or gate path, a held label, a deploy past the 1.2.0 checkpoint), show the PM its lines and merge only on a `merge` typed AFTER seeing them, in the session that merges (`merge #<n>` in the dispatcher). An earlier word, a pick or `auto` never covers it; a push changing the head or the list needs it again;
- the issue's Definition of Done passes, adversarial review included where the issue requires it;
- the PR holds no migration that is unapplied and needs none;
- no device check the issue's QA names is pending, and the PM has not said hold.

A migration is applied only as CLAUDE.md's migration rule says (after the PM types `apply <NNN>` in the applying session). Once `list_migrations` shows it, the check with `--applied <NNN>` opens a PR that is that migration alone, and it merges on that `apply` with no second word. A dispatched child never applies or merges one.

Anything short of that: do not merge, and say which condition failed as the first line of the summary.

**The sequence:**

1. Everything that rides in the PR is committed and pushed, the session record included with its learning line (`/wrap` writes both before the merge).
2. At the first push, run the check with the head branches of the other open PRs updated in the last 7 days (`list_pull_requests`); when your PR adds a migration, pass every open PR's head branch, since a parked PR still holds its number. `CONFLICT` sends you through §3 to §6 and back here.
3. Mark the PR ready, then wait for the checks: in a cloud session, subscribe to the PR's activity and end the turn; elsewhere, a Monitor until-loop on the check runs. A wake can be one suite finishing, never the whole PR (CUL-1623), so read every check run on each wake, and **if the main suite has not reported 20 minutes after ready, read the runs yourself**. A `/dispatch` child's missed wake is the dispatcher's stalled-child note (`dispatch.md` step 9.9). Never a bare sleep, an empty commit to retrigger CI, or auto merge (it skips step 4).
4. **Immediately before the merge, run the check again with `--verify`**: when `main` moved since CI ran, it type checks the simulated landing (`tsc`, and CI's `deno check` steps at CI's pinned Deno), the conflict git cannot see (72918c0, 2026-10-03). A broken landing is `CONFLICT` (§3); exit 3 is never a pass. Then the fresh read, the gate, the squash merge, title unchanged.
5. **Report.** Run the check again with `--head origin/main` and the same branch list, and give the PM one line naming each open PR that now conflicts with `main`. Its own session resolves it at its own wrap.
6. `/wrap` step 4's read-back of every issue the PR named.

## 8. Planning parallel parts

When a project's run order splits work into PRs that run as parallel sessions, **the files more than one PR touches decide what can run side by side.** Real-code conflicts (2026-09-12 to 09-25) hit these shapes:

- an index file that re-exports a namespace (`components/designV2/index.ts`)
- the beta shelf, `app/settings/beta.tsx`
- a guard's registry (`guards/designV2FlagOff.test.tsx`, `guards/haptics.test.ts`)
- one big render file and its tests (`supabase/functions/generate-report/render.ts`)
- a screen several parts edit (`app/(tabs)/history.tsx`)
- the shared sync module (`lib/sync.ts`)

The project's own spec stays parallel: two parts bumping its header and changelog is a mechanical conflict (§4), resolved by the rule, never by serializing the lanes.

`/dispatch` keeps the files in the list one at a time across the whole repo, beside migrations, `CLAUDE.md`, `STATUS.md`, guard registries and `supabase/functions/generate-signal/pipeline.ts`, reading every open PR's changed files from GitHub (a parked PR keeps holding its files). When writing the run order, either give every shared file to part 0 (it adds each later part's entry up front, so the later parts touch only their own files), or put the parts that share a file in strict order.

## 9. Rollback (CUL-2885)

`rollback #<n>`: on a fresh branch at `origin/main`, `scripts/steward/rollback-cli.ts apply <n> --why "<what failed>" --labels '<#n's issue labels>|none'`, then its PR and §7; no typed word, and merging redeploys the old code. `REFUSED` goes to the PM. Make every write a `REQUIRED` block prints (a deny listed fix's issues reopen, CUL-2910) before it merges, and name none of them in its PR. After a self merged deploy, pipe `edge-deploy.yml`'s `actions_list` into `rollback-cli.ts deployed <sha> --merged-at <iso>`: `FAIL`: roll back, post its `Needs you` line; the PR body carries the digest.

## Never

- Rebase or force-push a branch someone else created, or rebase any branch after pushing it. Cleaning up a stack on your own branch (§1) is the one exception.
- Take one side of a file wholesale when both sides changed it (outside §4's lockfile and session record rows).
- Update a branch only to make it current.
- Merge another session's PR (the dispatcher's `merge #<n>` excepted), or past a gate condition that failed.
- Skip, disable or quarantine a test, push an empty commit, or close and reopen a PR to get green.
