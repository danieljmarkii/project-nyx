---
name: backlog-groomer
description: Use this skill to groom and reconcile Nyx's backlog in **Linear** (team Culprit, `linear.app/projectnyx`) — the operational procedure behind the Product Owner persona. Triggers include the PM asking to "groom the backlog", "reconcile the backlog", "clean up the backlog", "what's stale", or any session scan that needs to check Linear against reality; closing out a shipped item; or whenever a session record claims something shipped that Linear still lists as `Todo` / `In Progress`. Loads the reconciliation procedure: match issue status against merged PRs/commits, fix stale statuses, re-prioritize aged high-priority items, flag stale `In Progress`, surface phase-blockers, and dedupe near-duplicate issues — without inventing scope (new product scope is a PM decision, routed to Open Questions, never a silent Linear edit). For the lens/judgment behind this procedure see the Product Owner persona in `docs/personas.md`; this skill is the how. Note: `docs/backlog.md` is frozen (migrated to Linear 2026-08-15) — this skill operates on Linear, not that file.
---

# Backlog Groomer (Linear)

The backlog lives in **Linear** (team **Culprit** — `linear.app/projectnyx`); `docs/backlog.md` is a frozen historical record (migrated 2026-08-15 — see CLAUDE.md § Backlog Protocol). This skill is the *procedure* the Product Owner runs to keep the Linear board honest. The lens is the Product Owner persona (`docs/personas.md`); this is the checklist. Use the Linear MCP tools throughout — `list_issues`, `get_issue`, `save_issue`, `save_comment`, `create_attachment`.

## Why this exists

The backlog drifts from reality in a specific, recurring way: an item ships in the codebase and gets narrated as "done" in STATUS.md or a session record, but its issue in Linear stays `Todo` / `In Progress`. The native GitHub↔Linear integration closes this automatically **when a PR references the issue** (CLAUDE.md § Git Workflow → "Merge → Linear status") — but agent sessions run on `claude/<slug>` branches that don't reference the issue, so their merges can leave the status stale. Grooming closes that gap. (Pre-migration this same drift showed up as `docs/backlog.md` rows reading `Open` after their PR had merged — B-022 via #59, B-045 via #72–75, caught 2026-05-31.)

## The grooming pass — run in order

1. **Reconcile status against reality.** For each `In Progress` / `Todo` issue that looks done, check whether it actually shipped: `git log --oneline | grep -iE 'CUL-[0-9]+'`, the merged-PR list, and the `docs/sessions/` records. If it merged, move the issue to `Done` (`save_issue` `state`), attach the PR if it isn't linked (`create_attachment`), and post a one-line outcome comment (`save_comment`) with the PR number if the trail is bare. Never close without a resolving reference.
2. **Fix stale in-flight issues.** An issue reading `In Progress` whose PR has merged is `Done`. An issue whose plan has since been executed is `Done` or partially done — if a defined slice remains, keep it open and note the remaining slice in a comment. Flag any issue that has sat in `In Progress` across multiple sessions with no linked PR: it's either genuinely blocked (say why in a comment), abandoned, or actually done and never moved.
3. **Re-evaluate aged priorities.** Any Urgent/High issue that's been open across multiple sessions without progress is one of: (a) genuinely blocked — state the blocker in a comment; (b) mis-prioritized — lower its `priority` with a one-line why; (c) effectively dead — flag to the PM, don't silently cancel. Mirror CLAUDE.md's stale-Open-Question triage, applied to priority.
4. **Enforce the issue contract.** Every issue needs: a title, a description that leads with **Why:** and names **Blocks:** (or `—`), a `priority`, a `project`, and a current `state`. Flag any issue missing the _why_. (Linear owns the ID and the status head, so the `B-ID` allocation + structured-Status-head enforcement the old markdown file needed is gone — Linear's native fields replace it.)
5. **De-duplicate.** Linear assigns `CUL-NNN` IDs server-side, so there are **no duplicate IDs to chase** — the old `grep … uniq -d` check retired with the markdown file. The remaining pass is *semantic*: if an issue restates an existing one, prefer linking them (a Linear "relates to" relation) or folding one into the other over leaving two live. Flag near-duplicates to the PM; mark a true duplicate with the `Duplicate` state (or `duplicateOf`).
6. **Surface what's relevant now.** List any issue whose project is a live build-track (`list_projects`, or `STATUS.md`'s Current phase table), plus any stale Urgent/High issues, at the top of your report.

## Hard rules

- **Do not invent scope.** Grooming reconciles and re-orders existing issues; it never adds new product scope. If grooming reveals a real decision (e.g. "do we anonymize or hard-delete on account deletion?"), that belongs in CLAUDE.md → Open Questions, surfaced to the PM — NOT resolved by a status edit. (Filing a genuinely-new *deferral* as a new Linear issue is still proactive and fine — that's the Backlog Protocol; it's *scope decisions* that route to the PM.)
- **Do not re-prioritize against the PM's explicit ordering** without surfacing it as a question first.
- **Closing keeps the issue.** Move it to `Done` with a resolving PR/session reference; Linear keeps the record. Never cancel an item just to clear the board.

## Output format

```
## Backlog grooming (Linear) — <date>

### Reconciled (status corrected)
- CUL-NNN <title>: In Progress → Done — <date> (PR #N) — <evidence>

### Re-prioritized
- CUL-NNN: Urgent → Medium — <why>

### Contract / dedup flags
- CUL-NNN — <missing why | duplicate of CUL-MMM | stale In Progress, no PR | …>

### Blocks the Current Phase (<phase>)
- CUL-NNN <title> — <why it's relevant now>

### Needs PM decision
- <anything that's actually an Open Question, not a deferral>
```

Apply the status / priority / dedup edits directly in Linear via the MCP (`save_issue`) — reversible and cheap. Route anything in "Needs PM decision" to the PM and to CLAUDE.md → Open Questions.
