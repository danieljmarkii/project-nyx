# The PM queue drain: a groomer step and the inflow rules

**Date:** 2026-10-02
**One thing:** G3 L1 — A squash merge flattens a PR into one commit · check: pending

Built CUL-1366's queue drain on top of #997, per the issue's 2026-10-02 comment: the queue stays the `Waiting on PM` label, and the drain is its own groomer step rather than part of the prune PR.

Shipped via #999 (CUL-1466, a sub-issue of CUL-1366, so the merge leaves the parent open for plan steps 2, 3 and 5):

- `.claude/skills/backlog-groomer/SKILL.md`: new step 12, **Drain the PM queue**. Six lanes in a fixed reading order (not the PM's → device → clinical → team call → default → docket), the never-list as an absolute bar on team calls and defaults, the 72-hour default window run on step 14's evidence rules, the 21-day untouched rule, the docket cadence, and the write boundary for CUL-922. Prune moved to steps 13–15. The count step gained a queue line (cap 30, baseline 153), a 10% reversal check, and the audit's kill criterion.
- `CLAUDE.md` § Backlog Protocol: the inflow rules (decision rights, one issue per review round, device checks per TestFlight cut, the WIP cap of 30 on the label). DISCOVERY PRs merge rather than park as drafts. Paid for by trimming the backlog migration history, the "102 bullets" line and the stale `docs/backlog.md` pointer in *Stale question triage*: 135,722 → 135,461 B, under the ceiling, no ratchet change.
- `/kickoff` prints the label total against the cap; `/wrap` applies the inflow rules before filing.
- `operating-kit/README.md`: one line noting this repo kept the label; the kit still teaches the state for new teams.

**Decisions (PM, in session, on the plan's three briefs):** the WIP count lives in `/kickoff` and the groomer via the MCP, because the SessionStart hook has no Linear credential (CUL-925 keeps the hook half). The never-list also bars lane 2 team calls, which reads ruling 1 more strictly than its text. The kit keeps the `Needs PM` state.

**Not done here, by scope:** the one-time clear of the 151 (plan steps 2–3) and the draft PR sweep (plan step 5) are a grooming pass, not a build. The kit's own groomer copy carries neither #997's prune nor this drain, which matches #997's precedent.

**Residual:** the branch commit's subject names CUL-1366. A history rewrite to fix it was refused by the permission system, so the squash used the PR title (naming CUL-1466) as its subject; the parent was read back after the merge.
