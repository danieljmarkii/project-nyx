# Operating kit: the steward skill, merge-check and the measured close-on-merge rule

**Date:** 2026-10-07
**One thing:** none — dispatched session, not this round's teach row

Dispatched (adhoc) build of CUL-1631, shipped via #1090. Mode BUILD.

## What shipped

- **The steward skill in the kit** (`operating-kit/dot-claude/skills/steward/SKILL.md`), ported from `.claude/skills/steward/SKILL.md` with every project value a placeholder: the list files, deploy manifest, lockfiles, load-bearing paths, migrations directory, type check, test command, required checks and the shared-file instances. §8 keeps the six shared-file *shapes* generic and adds a `{{SHARED_FILES}}` slot; §7 step 6 states the close-on-merge rule as measured.
- **`merge-check.sh` in the kit** (`operating-kit/scripts/steward/`), with two configured values replacing hard-coded ones: `MERGE_CHECK_MIGRATIONS_DIR` (empty turns the migration-number checks off, and the output says "not checked" rather than "no new duplicates") and `MERGE_CHECK_CI_WORKFLOW`.
- **Its guard** (`operating-kit/guards/mergeCheck.test.ts.template`): the repo's 16 cases on a neutral `db/migrations` fixture plus one for the unset directory. Installed into a scratch repo at the kit's install paths and run under Jest with only a TypeScript transform: 17 of 17 pass.
- **The close-on-merge rule, as measured**, in `CLAUDE.template.md`, `docs/operating-model.md`, the PR template, `backlog-groomer` step 7 and its outcome-issue line, `BOOTSTRAP.md` §3's prompt, and the README's fourth built-in item.

## Falsification

Mutations of the new configuration branch, each killed: the "not checked" branch forced off; the empty-base-listing guard forced on with no directory; the environment override ignored. One mutant survived and was understood rather than chased: dropping `mig_names`' early `return 0` changes nothing, because an empty path lists nothing either way. The line stays as a guard against git's handling of `/`, and the PR says it is not load-bearing.

## Residuals

- `operating-kit/dot-claude/commands/wrap.md` on `main` still says only an attachment closes an issue. #1087 owns that file and its version is clean, so the Done-criterion grep is empty only once both PRs are on `main`.
- The README's index does not yet list the new files, and #1087's § What `/dispatch` needs will say they are missing. Filed as CUL-1639.
- Item 3 (a generic `scripts/dispatch/`) not built, per the dispatch prompt. Recommendation in the issue's outcome comment: not yet.
