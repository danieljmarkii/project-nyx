# The workflow audit B: /dispatch v1.4, the spec

**Date:** 2026-10-06
**One thing:** none — dispatched session, not this round's teach row

Dispatched session (CUL-1614, part of CUL-1612; also finishes CUL-1546). Shipped via #1082.

## What shipped

- **`.claude/commands/dispatch.md` → v1.4**, against the PM's 2026-10-06 rulings D1–D3 (CUL-1606 retro):
  - **The wake (CUL-1546).** No `opened` message. A child sends `stopped: <reason>` once, the first time it waits on anyone, and always a terminal `merged #<n>` or `done: <reason>` as its last act, so a stopped child that later merges still reports it. A merge-gated PR is a stop, not a `done`. Every `stopped` wake arms one check-in.
  - **The cap (D1).** `slots = 6 − in flight across the repo`: every project's dispatch rows, open `claude/*` PRs with a commit in 24h (except parked ones), and every live claim on an In Progress Culprit issue. Sub-limits: waiting on the PM 3, writes production 3, migrations 1. Parked PRs (any merge-gated PR with no working session, launched by dispatch or not) take no slot, keep their files and migration number reserved, are never archived, and get a `/dispatch note` when their gate clears.
  - **Reservations.** Hotspots are checked against every recent open PR's changed files from GitHub. `generate-signal/pipeline.ts` joins the list. A merge wake re-reads siblings' mergeability and puts new conflicts in the digest.
  - **The plan gate (D2) and `auto` (F7)** share one gate predicate, read at proposal and again at launch. Routine rows build from the build note; migration, RLS / Storage / deletion / export, clinical and Tier-2 rows wait for a go typed in their own session.
  - **§ Authority (D3).** `/dispatch note` facts only; approvals count where typed; the dispatcher's `merge #<n>` and `apply <NNN>`; a production write's confirmation named (the PM's typed number, the PM's pick on a brief showing the deploy flag, or CUL-1616's dialog where present).
  - **The PM's words.** `go`, `go <row>` (queues an over-cap row), rows by number, `add` any issue, follow-ups filed elsewhere, a project alias, `Dismissed:` only on change.
- **`wrap.md` § Dispatched sessions**, **steward §7/§8**: the same wake and merge rules; both gate lists now carry one migration bullet.
- **CLAUDE.md**: the migration rule (apply only on the PM's typed number), the dispatch exception to the BUILD plan gate, and a re-ruling's Consequence naming what it unseats. Net −1 byte.
- **Runbooks** (`dev-handoff-runbook.md`, `edge-deploy-runbook.md`) match the apply rule.

## Review

- `code-reviewer` (isolated): no blocker. Fixed from its list: parked PRs counted in the 24h bullet, `stopped` sent more than once, the two gate lists' migration bullets disagreeing, export and Storage missing from the plan gate, the deploy confirmation unstated, the runbook contradicting the apply rule, and a deleted scope clause in the decision-brief section (restored short).
- Zero-write `--dry-run` against Engines v3 and Out of beta (output in the PR body): both projects compute 3 slots and nothing ready. Its fixes: the Board no longer counts as coverage, parked is defined for any merge-gated PR, archive spares a claim-holding session, PR file reads are bounded to 14 days, follow-ups only for unmerged rows, the `✓ #<n>` tag parse. The rest is filed as CUL-1620.
- `operating-kit/dot-claude/commands/dispatch.md` is the kit's frozen extract and was left as is.

## Residual

- Out of beta's PR-60 (#1064) is parked with its session gone and a duplicate migration number (084 is on `main`); the dry-run put it in *Needs you*.
