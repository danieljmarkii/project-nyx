# Retro 4 PR-D: one write-up per dispatched PR

**Date:** 2026-10-12
**One thing:** none — a prose change to the workflow files; no new engineering concept beyond retro 4's own

[CUL-1873](https://linear.app/projectnyx/issue/CUL-1873), shipped via #1197. The workflow audit project, retro 4's D7.

## What shipped

- `.claude/commands/wrap.md` § Dispatched sessions: the PR body is the record, with a five-line DoD (acceptance criteria, CI, the adversarial verdict at its commit, the QA script, PM actions filed). A session record only for a DISCOVERY or `Teach: yes` row. The outcome comment is the `**Released**` line, the PR link and the residual. Naming the mode, hand-setting `In Review` and the steward §7 step 5 conflict report are dropped for the child; the read-back stays.
- `.claude/commands/dispatch.md` v1.10: step 5's close-out paragraph and ritual line match.

## Decisions

- The outcome comment reuses the exact `**Released** — branch …, <UTC>` shape `/dispatch` step 1 already writes for died rows, so the dispatcher's claim read keeps working without a script change.
- A non-teach DISCOVERY record still writes the `**One thing:** none — …` ledger line; a non-teach BUILD row writes no record and no line.

## Residuals

- `operating-kit/` keeps the old wording until its hand port or generator (retro § 6, contradiction 5).
- `wrap.md` is a gate path, so the merge is the PM's.
