---
description: Start-of-session brief — query Linear for the live tracks, what's in flight and what's waiting on the PM, cross-read STATUS.md + the last session records, and produce a clean "where we are / what's first" summary. The mirror image of /wrap.
---

# /kickoff — Start-of-session brief

Produce a tight, skimmable orientation so a returning session (or the PM) can start working immediately without re-reading the whole operating manual. This is the mirror of `/wrap`: `/wrap` records where we landed; `/kickoff` reads it back.

## Steps

0. **Claim the issue before anything else.** If this session was started from a specific `CUL-NNN`, do this *first* — before `STATUS.md`, before the specs, before planning. If it wasn't (a general orientation brief), do it the moment a task is picked, at the end of this brief. `get_issue CUL-NNN`, then:

   - **Unclaimed** → set `state: "In Progress"` (`save_issue`) **and** post the claim comment (`save_comment`). First line is the marker, verbatim shape:

     > **Claimed** — branch `claude/<slug>`, `<ISO-8601 UTC>`, mode BUILD|DISCOVERY.
     > A different session reading this: stop and surface rather than starting. Released by this session's `/wrap` outcome comment.

   - **Another branch's claim, recent, no merged PR** → **stop and surface.** Don't orient, don't plan, don't code. Name the branch and the claim time, and ask the PM whether to take it over or pick something else. This case is the entire point of the step.
   - **Another branch's claim >24h old with no open PR** → stale. Say so in one line, post a fresh claim naming the stale one, continue.
   - **An open PR already references the issue** → that is work in review, not a claim. Surface it before touching anything.

   **Do not key this check on status.** `In Progress` is set by the launch path at session start, so it tells you someone started and never who — and the someone is usually you. A status-only rule would have stopped the session that wrote this step (CUL-624; measured against CUL-726 / CUL-691 / CUL-624 `stateHistory`). The **branch name in the comment** is what discriminates; the status is what makes the issue visible in the step-2 sweep. Both, or the guard doesn't work.

1. **Query Linear first — it is the state.** (Team **Culprit**, `linear.app/projectnyx`.) `STATUS.md` is a ~60-line pointer card, not a state store: it tells you which tracks are live and which two deploys are held, and it is deliberately silent on everything Linear owns. Read it for orientation, then get the actual state from Linear (step 2). Then read the **2–3 most recent session records** for what actually shipped last: `ls docs/sessions/ | sort -r | head -3`, and read those files. (`STATUS.md` carries no session list and no PM checklist — both moved; see `docs/sessions/README.md` and the `Waiting on PM` label.)

2. **Pull the four views that make up "where are we?"** — `docs/backlog.md` is frozen, so don't grep it. Use the Linear MCP (not the whole team — a kickoff needs a handful of issues):
   - **The live tracks:** `list_projects` (team Culprit). Each project carries its own status and summary; that is the parallel-track answer, and it is the one `STATUS.md` used to hold.
   - **In-flight:** `list_issues` `state: "In Progress"` (and `"In Review"`) — what is actively landing, possibly from a sibling session. For any issue this session might touch, read its **claim comment** (step 0) before assuming it is free: status names no branch, so it cannot tell a live sibling from a stale claim from your own launch.
   - **Waiting on the PM:** `list_issues` `label: "Waiting on PM"` — engineering-complete work with one named PM/device/decision step left. If the session's obvious next task is sitting behind one of these, say so in the brief rather than starting it.
   - **High-priority ready work:** `Todo` at `priority` Urgent/High — the Linear equivalent of the old `| Now |` scan.

   Scope to the current track's **project** where you can (`project:` filter) — a phase-wide sweep returns hundreds of issues and buries the answer.

   (For a fuller reconcile, the `backlog-groomer` skill is the on-demand Linear-hygiene procedure.)

3. **Check for blocking Open Questions** (CLAUDE.md § Open Questions → Open, cross-referenced from STATUS.md) that gate the current Phase. If one is blocking and unanswered, the recommended first action is "resolve open question X," not "build."

4. **Read the relevant docs for the confirmed step** (the CLAUDE.md "Read These Before Writing Any Code" table tells you which). Don't write code before this.

5. **Sanity-check for doc drift.** The specific failure this catches is an orientation doc that has stopped tracking reality — it is how the repo ended up leading every session with "Step 10 — AI Signal" months after that stopped being true. One-line check, not a full audit: does `STATUS.md`'s Current phase still name the tracks Linear actually shows as live? If not, fix it in this session (it is a pointer card; correcting it is cheap) rather than working around it.

## Output

Emit, in this order:

- **Claim** — the `CUL-NNN` claimed at start, or (for a general brief) a note that the claim goes on whatever the recommended task turns out to be. If a claim was contested or stale, say which and what you did about it.
- **Where we are** — phase + in-flight work, in 2–3 lines, from the Linear projects and the `In Progress` issues.
- **Last shipped** — one line, with PR number(s), from the newest files in `docs/sessions/`.
- **Blocked on / waiting on PM** — any blocking Open Question, plus anything on the `Waiting on PM` label that gates the recommended task. Name the `CUL-NNN`. If none, say "nothing blocking."
- **Recommended first task** — the single concrete next step, naming the file/doc to open first and the build step it advances. If a PM Action Item is a prerequisite, say so.
- **Alternates** — 1–2 other live tracks the PM could pick instead (parallel food track, a ready-to-decide open question).

If running interactively with the PM present, end by asking the three Session Start questions from CLAUDE.md (build step? / decisions since last session? / scope change?). If non-interactive, skip the questions and proceed on what Linear says.

$ARGUMENTS
