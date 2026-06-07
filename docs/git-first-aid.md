# Git First Aid

A symptom → exact-command guide for the git messes that actually happen in this project. Keyed by the error you see on screen, so you don't have to know *why* — just match the message and run the fix.

## The one mental model that explains 90% of it

You consume the `claude/…` branches **read-only**. Claude is the only thing that commits to them; you only ever *pull* them to get code onto your phone. So almost every git mess here is one of two things:

1. **You're on the wrong branch.** → `git checkout <the branch named in the handoff>` and retry.
2. **You have local changes you didn't mean to make.** → throw them away (you weren't supposed to be editing anyway).

If you remember nothing else: the fix is almost never "merge vs rebase." It's "get onto the right branch" or "discard the stray edit."

## One-time setup — do this once per Codespace and most of this never happens

```bash
git config --global pull.ff only
```
Kills the `divergent branches` prompt for good: from now on a `git pull` either fast-forwards cleanly or fails loudly, instead of dropping you into the merge-vs-rebase chooser. (As of this writing it was **not** set — run it once.)

---

## Symptom → fix

### `fatal: Need to specify how to reconcile divergent branches`
You ran a bare `git pull` (or `git pull origin <branch>`) while sitting on a *different* branch than the one you're pulling. Git is trying to merge them.

**Fix — do NOT pick merge or rebase:**
```bash
git checkout <branch-from-the-handoff>
git pull --ff-only
```
Switch onto the branch first, then pull. (If you ran the one-time `pull.ff only` config above, you'll never see this prompt again — it'll just fast-forward or fail fast.)

### `error: Your local changes to the following files would be overwritten by checkout`
You have uncommitted edits (often accidental — an autosave, a stray keystroke) and they block switching branches. Since you edit these branches read-only, you almost always just want to throw the edits away:
```bash
git checkout -- .        # discard ALL uncommitted changes, then retry your checkout
```
If you think an edit might be worth keeping, park it instead of deleting it:
```bash
git stash                # tuck changes aside; restore later with `git stash pop`
```

### `git pull --ff-only` fails right after a PR was merged
Expected. When a PR **squash-merges**, `main` gets one brand-new commit that doesn't share history with your feature branch, so the branch can't fast-forward — it looks "diverged." The branch has done its job; don't try to reconcile it. Get back onto a clean `main`:
```bash
git checkout main
git pull --ff-only
```
Then, optionally, tidy up the merged branch locally:
```bash
git branch -D <merged-branch>            # delete the local copy (it's merged; safe)
```
The next session's handoff will name a fresh `claude/…` branch to check out — you don't reuse the merged one.

### `You are in 'detached HEAD' state`
You checked out a commit or tag instead of a branch. Nothing is broken; you're just not *on* a branch. Reattach:
```bash
git checkout <branch-from-the-handoff>
```

### You accidentally committed on `main` (or on the wrong branch)
You weren't meant to commit at all, so the goal is to make `main` match the remote again. **This discards the local commit(s)** — that's what you want here:
```bash
git checkout main
git fetch origin
git reset --hard origin/main
```

### "I just want a clean slate that matches the remote"
The nuclear reset. Throws away **all** local commits and edits on the current branch and makes it identical to the remote. Use when you're lost and just want the known-good code:
```bash
git fetch origin
git reset --hard origin/<branch-name>
git clean -fd          # also delete untracked files/folders — omit if unsure
```

### `fatal: not a git repository`
You're not in the project folder. `cd` back in:
```bash
cd ~/project-nyx       # or wherever your Codespace cloned it
```

---

## What to never do (in this repo)

- **Don't `git push --force`** to a `claude/…` branch while a session might be working on it — you'll clobber commits Claude just made. If you think a branch is wrong, say so in the session instead.
- **Don't resolve a "divergent branches" prompt by choosing merge or rebase.** The honest answer is always "wrong branch" — back out and `git checkout` the right one.
- **Don't commit directly to `main`.** Everything lands via squash-merged PR (see CLAUDE.md → Git Workflow).

## When in doubt

Paste the exact error into the session and ask. Describing the mess in plain English ("I pulled and it says divergent branches") is enough — match-the-message is the whole skill here.
