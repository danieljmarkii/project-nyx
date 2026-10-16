# Production gate: stop asking about reads of .claude (CUL-1963)

**Date:** 2026-10-16
**One thing:** D5 L1 — A reviewer attacks the boundary, not the happy path: an allowlist that trusts a whole command loses to the one flag nobody listed · check: pending

Shipped via #1232.

## Why

The PM shared a screenshot of two "Bash wants to run" dialogs in a grooming session and asked how to get fewer of them. Neither came from a missing allow rule. Both came from the production gate's self-guard (`.claude/hooks/productionGate.ts`, CUL-1670), which asks on any shell command naming `.claude` unless it is one plain read. A hook that answers `ask` overrides both allow rules and Auto mode, so no settings change could help.

## Measured, then built

A subagent read every permission request in four recent sessions (grooming, docs optimization, two dispatch builds): **82 dialogs, every one Bash, none a production write.**

- 22 (27%) read the harness's saved tool results under `~/.claude/projects/`.
- 56 (68%) were read-only commands over `.claude`: `git grep`, `git ls-tree`, `find`, `ls`, `sed -n`, grep piped to head.
- 4 were Claude Code's own check on `cp` out of the transcript folder, which no repo setting changes.

The PM approved the transcript fix first, then both follow-ups after seeing the numbers:

1. `projects/` and `rules/` joined the safe directories.
2. `.claude/hooks/shellRead.ts` proves a chain only reads: allowlisted readers, no flag that writes or runs (abbreviated long flags included), no expansion, subshell or here-document, output only to the pipe or `/dev/null`, and no glob reaching a reader whose flags write. Built on the same allowlist idea as `sqlRead.ts`.

Expected effect: about 60 of the 82 dialogs go away. Loops, `xargs`, `find -exec` and Python still ask, on purpose.

## The red team

Two `rls-privacy-reviewer` passes, the DoD cap.

- **Pass 1 failed it** with two critical bypasses, both of which would have switched the gate off with no dialog. `cat evil | uniq - .claude/settings.json` wrote the settings file, because `-` was counted as a flag rather than an operand. `rg --hostname-bin=./evil --hyperlink-format=default` ran an arbitrary program, and the old single plain-read path on `main` had the same hole. Fixed by counting `uniq`'s operands correctly and removing `rg` from both read paths rather than banning one more flag. Before the pass I had already closed GNU and git flag abbreviation (`--outp` is `--output`).
- **Pass 2 passed the boundary**: nothing the gate leaves alone can write `.claude/settings*.json` or `.claude/hooks/`. It found two low leaks, `file -C` (writes a `.mgc`, also on `main`) and `diff -l` (runs `pr`). Both commands were dropped.

Residuals, all erring toward a dialog or already documented in the gate's blind-spot list: a command can write inside the safe directories without a dialog, which the Edit and Write tools could already do; paths assembled in the shell, PATH-resolved readers and repo-local git diff drivers.

## Tests

About 40 new rows in `guards/productionGate.test.ts`, each new rule with a mutant that must flip a row of its own: 392 gate tests, all 1,294 guard tests, tsc clean, CI green on every push.

## Lesson for the next gate change

Each of the four holes was a reader the allowlist trusted wholesale (`uniq`, `rg`, `file`, `diff`). The fix that held every time was to stop trusting the command, not to add the flag to a list.
