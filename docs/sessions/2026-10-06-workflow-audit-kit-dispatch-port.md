# The workflow audit: /dispatch v1.4 ported into the operating kit

**Date:** 2026-10-06
**One thing:** none — dispatched session, not this round's teach row

Dispatched by `/dispatch` (adhoc row, CUL-1517), branch `claude/the-workflow-audit-adhoc-10062353`; shipped via #1087.

## What shipped

- `operating-kit/dot-claude/commands/dispatch.md` is now the repo's v1.4 (it was v1, #974), with every project value a placeholder: the tracker, team, issue prefix, repo, the PM's time zone, the install date that bounds "issues with no row", the repo-wide session cap, the production paths, the hotspot files, the migrations directory, and the domain word for a plan-gating safety surface. Issue citations in the rationale were dropped or reworded as "measured in the predecessor". Linear-project examples became a fictitious *Payments v2*. The `Waiting on PM` label became the kit's `Needs PM` state.
- A kit-only `§ Without the script` says how steps 3–4, the Board and the status lines run by hand until a project ports `scripts/dispatch/`.
- `operating-kit/dot-claude/commands/wrap.md` gained the `--dispatched` section (step numbers adapted to the kit's shorter wrap; the One thing block made conditional on a learning skill), a merge-authorization rule, and a corrected step 4: every issue a PR's title, body or branch names closes on merge, one sub-issue per PR, and the post-merge read-back the dispatched order depends on.
- `operating-kit/README.md`: the dispatch row updated and a new `§ What /dispatch needs` (MCP servers, the steward skill and merge check, the optional script, states and reviewers, the placeholder list).

## Decisions

- **Prose only, no `scripts/dispatch/`.** The script is ~1,600 lines whose tests replay this repo's own plan pages (Engines v3, Out of beta) and fixtures full of CUL ids; making it generic means new synthetic fixtures and a test runner the kit does not have. The kit's code files carry `.template` and run nowhere. Shipping the prose with an honest hand path, and naming the script as the upgrade, keeps the kit truthful. Filed as an option on CUL-1631.
- **The port is a script, kept in the session scratchpad**, not in the kit: its replacement table is full of the very ids the kit must not contain. Every replacement asserts it matched once, so the re-port after CUL-1623 and CUL-1624 shows exactly which upstream lines moved.

## Found and filed

- CUL-1631: the kit lacks the steward skill and `merge-check.sh` (which the ported command depends on), and six kit files still teach that only an attachment closes an issue. Only `wrap.md` was corrected here.

## Residuals

- The merge gate: this PR waits for #1085 (CUL-1623) and CUL-1624's PR to merge, then main comes in and their deltas are re-ported.
