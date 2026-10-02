# PM learning loop: One thing per session, monthly /coach

**Date:** 2026-10-02
**One thing:** G1 L1 — A commit is a saved snapshot · check: pending

The PM asked how Claude could help them grow as an engineer and as a strategic PM, on the 70/20/10 model. Claude proposed six mechanisms. Asked for an engineering baseline, the PM said Claude should be able to define it from the repo, so the baseline was assessed from evidence: SQL and deploy commands run by the PM, the attribution bug they caught, the usage-burn diagnosis, git-first-aid, the "too technical" directive. The verdict: a technical operator with strong systems instincts who does not read code yet, so the curriculum teaches the map before the syntax.

Shipped via #998 (CUL-1450):

- `docs/learning/curriculum.md`: baseline, L1–L3 ladder, tracks G / T / S / D / C / P, timed readings, ledger format.
- `.claude/skills/learning/SKILL.md`: procedure and block format.
- `.claude/agents/pm-coach.md` + `.claude/commands/coach.md`: the monthly read.
- `/wrap` step 7 and `/handoff` step 5 emit the One thing block; `docs/sessions/README.md` names the ledger line.

**Decisions:** the ledger is a per-session line, not a shared file, because a shared ledger would reintroduce the merge-conflict surface `docs/sessions/` exists to remove. For the same reason, a re-asked check is graded in the new record, never by editing the old one. `/coach` is run by hand, never on a schedule. Its habit is a suggestion, not a CLAUDE.md rule.

**Residual:** the pre-push hook failed once with a transient test failure; the full suite was green on rerun (582 suites) and the second push passed. Nothing to file.
