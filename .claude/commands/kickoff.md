---
description: Start-of-session brief — read STATUS.md + query Linear for any issue blocking the current phase and produce a clean "where we are / what's first" summary. The mirror image of /wrap.
---

# /kickoff — Start-of-session brief

Produce a tight, skimmable orientation so a returning session (or the PM) can start working immediately without re-reading the whole operating manual. This is the mirror of `/wrap`: `/wrap` records where we landed; `/kickoff` reads it back.

## Steps

1. **Read `STATUS.md`** (repo root) — the canonical "where are we?": Current Phase, Parallel Track, Blocking Open Questions, Open PM Action Items, Runtime in Use. This is the high-churn state file; CLAUDE.md is the stable manual and usually doesn't need re-reading at kickoff. Then read the **2–3 most recent session records** for what actually shipped last: `ls docs/sessions/ | sort -r | head -3`, and read those files. (`STATUS.md` deliberately carries no session list — see `docs/sessions/README.md`.)

2. **Query Linear for what's in flight and what blocks the current Phase** (team **Culprit**, `linear.app/projectnyx`) — `docs/backlog.md` is frozen, so don't grep it; the answer lives in Linear. Use the Linear MCP `list_issues` (not the whole team — a kickoff needs a handful of issues):
   - **In-flight:** `state: "In Progress"` (and `"In Review"`) on team Culprit — what's actively landing, possibly from a sibling session.
   - **Phase-relevant:** issues whose **project** is the current build-track (e.g. *Signals v2 — the record, decomposed*, *The Daily Recap*) or whose title/description names the current Phase — pass `project`, or `query` the Phase name. These may pre-empt the obvious next step.
   - **High-priority ready work:** `Todo` issues at `priority` Urgent/High — the Linear equivalent of the old `| Now |` scan (Now → Urgent/High).

   (For a fuller reconcile, the `backlog-groomer` skill is the on-demand Linear-hygiene procedure.)

3. **Check for blocking Open Questions** (CLAUDE.md § Open Questions → Open, cross-referenced from STATUS.md) that gate the current Phase. If one is blocking and unanswered, the recommended first action is "resolve open question X," not "build."

4. **Read the relevant docs for the confirmed step** (the CLAUDE.md "Read These Before Writing Any Code" table tells you which). Don't write code before this.

5. **Sanity-check for doc drift.** Confirm `STATUS.md → Runtime in Use` still agrees with the runbook/CLAUDE.md handoff default. If they disagree (e.g. STATUS.md says TestFlight is live but the handoff docs still call it "blocked"), flag it — a stale handoff means the PM gets the wrong on-device commands. This is a one-line check, not a full audit.

## Output

Emit, in this order:

- **Where we are** — Phase + in-flight work, in 2–3 lines.
- **Last shipped** — one line, with PR number(s), from the newest files in `docs/sessions/`.
- **Blocked on / waiting on PM** — any blocking Open Question or PM Action Item that gates progress. If none, say "nothing blocking."
- **Recommended first task** — the single concrete next step, naming the file/doc to open first and the build step it advances. If a PM Action Item is a prerequisite, say so.
- **Alternates** — 1–2 other live tracks the PM could pick instead (parallel food track, a ready-to-decide open question).

If running interactively with the PM present, end by asking the three Session Start questions from CLAUDE.md (build step? / decisions since last session? / scope change?). If non-interactive, skip the questions and proceed on STATUS.md.

$ARGUMENTS
