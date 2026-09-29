---
description: Start-of-session brief. Claim the issue, query the tracker for live tracks / in-flight / Needs PM, read the newest session records, and produce a clean "where we are / what's first" summary. The mirror of /wrap.
---

# /kickoff — Start-of-session brief

Produce a tight orientation so a session (or the PM) can start working immediately without re-reading the whole manual. `/wrap` records where we landed; `/kickoff` reads it back.

## Steps

0. **Claim the issue before anything else.** If this session was started from a specific `{{ISSUE_PREFIX}}-NNN`, do this first: before `STATUS.md`, before specs, before planning. `get_issue`, then:
   - **Unclaimed** → set `In Progress` **and** post the claim comment. First line is the marker, verbatim shape:
     > **Claimed** — branch `<branch>`, `<ISO-8601 UTC>`, mode BUILD|DISCOVERY.
     > A different session reading this: stop and surface rather than starting. Released by this session's `/wrap` outcome comment.
   - **Another branch's claim, recent, no merged PR** → **stop and surface.** Name the branch and claim time; ask the PM whether to take over or pick something else. This case is the whole point of the step.
   - **Another branch's claim >24h old, no open PR** → stale. Say so in one line, post a fresh claim naming the stale one, continue.
   - **An open PR already references the issue** → work in review, not a claim. Surface it before touching anything.

   **Do not key this on status.** The launch path often sets `In Progress` seconds before your first tool call, so status tells you someone started, never who. The **branch name in the comment** discriminates. Both, or the guard does not work.

1. **Read the pointer card, then the state.** `STATUS.md` is a ~60-line pointer card, not a state store. Read it for routing, then get the state from the tracker (step 2). Read the **2–3 newest session records**: `ls docs/sessions/ | sort -r | head -3`. (The SessionStart hook already printed their names, the Needs PM count, and whether a retro is due.)

2. **Pull the four views that make up "where are we?"** Scope to the current project where you can; a team-wide sweep buries the answer.
   - **Live tracks:** `list_projects`.
   - **In flight:** `In Progress` and `In Review`. For any issue you might touch, read its claim comment first.
   - **Needs PM:** the `Needs PM` state. If the obvious next task sits behind one, say so rather than starting it.
   - **High-priority ready work:** `Todo` at Urgent / High.

3. **Check for blocking Open Questions** (CLAUDE.md § Open Questions). If one gates the current track, the recommended first action is "resolve open question X", not "build".

4. **Read the docs for the confirmed task** (CLAUDE.md § Read These). No code before this.

5. **Retro due?** If the hook printed `RETRO DUE`, the recommended first task is `/retro` unless the PM says otherwise. Prose triggers never fire; this one is computed.

## Output
- **Claim** — the issue claimed, or a note that the claim lands on whatever task is picked. Contested or stale claims named.
- **Where we are** — 2–3 lines from the live projects and in-flight issues.
- **Last shipped** — one line with PR numbers, from the newest session records.
- **Blocked on / Needs PM** — blocking Open Questions and any Needs PM item gating the recommended task. "Nothing blocking" if none.
- **Recommended first task** — one concrete step, naming the file to open first and the issue it advances.
- **Alternates** — 1–2 other live tracks.

Interactive with the PM present → end with the three Session Start questions from CLAUDE.md. Non-interactive → skip them and proceed on what the tracker says.

$ARGUMENTS
