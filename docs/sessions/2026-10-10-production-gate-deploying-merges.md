# Production-write gate, round 1: merges that deploy wait for the PM

**Date:** 2026-10-10
**One thing:** G5 L1 — Protection: the ruleset keeps a red merge off `main`; the merge check keeps an unasked deploying merge off it · check: pending

Shipped via #1173 (CUL-1763, a sub-issue of CUL-1654). CUL-1654 stays open on brief 2.

## What was ruled

The PM ruled CUL-1654's two briefs (a) and (a).

- **Brief 1 (built):** a self-merge that deploys an Edge Function, or edits the gate's own files, waits for the PM's typed `merge`.
- **Brief 2 (not built):** dispatched children run with the Supabase connector read-only, or without it. Two checks showed (a) cannot do what it was ruled to do:
  - Supabase's `read_only=true` runs queries as a read-only Postgres user. That user still SELECTs every table, `auth.users` included, so read-only stops writes (which the CUL-1616 gate already asks about) and not reads.
  - Connectors are account-level, and `create_session` takes no connector argument.

  A round-2 brief went on CUL-1654. The recommendation is (a′): a child environment carrying `NYX_SESSION_ROLE=child`, a gate that denies Supabase project tools there, and a launch hook that refuses any other environment.

## What shipped

`scripts/steward/merge-check.sh` gained a fifth question and a `production:` line. A REVIEW from that line is never cleared in writing. It fires when landing the branch:

- **deploys a function** (`scripts/steward/deploys.ts` + `deploys-cli.ts`, which run the deploy workflow's own fingerprint walk over the base tree and the landed tree, with holds honoured);
- **follows a failed, manual or unreadable deploy run on main**, because the workflow deploys against its last *recorded* deploy, not the diff;
- **edits a gate file:** the hooks, the settings, the deploy path, the check, the steward skill, `dispatch.md` and `wrap.md`.

The steward skill §5/§7, `dispatch.md` (v1.7, flag *waits for your merge*), `wrap.md` and the CLAUDE.md merge rule say so. Tests: 21 new cases in `guards/mergeCheck.test.ts` and `scripts/steward/deploys.test.ts`. 15 mutants were run against the real script, and every one was killed.

## What broke, and how it was found

The isolated `code-reviewer` found three problems:

1. **A false CLEAN.** A helper killed by a signal prints nothing on stderr, and the first draft keyed "could not tell" on stderr. The fix keys on the exit status, and a stub `node` exiting 137 pins it.
2. **The record-vs-diff gap.** A merge after a failed or rolled-back deploy redeploys main whatever its diff touches.
3. **Timing.** A `/wrap and merge` typed before the list existed would have covered a production write.

Each fix has a test and a killed mutant.

## Residuals

- A function whose deploy record is wrong while main's last deploy run passed on a push still goes out unreported. This is stated in the script's blind spots.
- A branch that edits the check runs its own copy.
- No hook stops a child that skips the check and merges anyway. Option (b), a dialog on every merge, was declined.
- `operating-kit/dot-claude/commands/dispatch.md` (the extracted template) still carries the old flag text.
