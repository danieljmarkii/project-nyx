---
name: backlog-groomer
description: Use this skill to groom and reconcile {{PRODUCT}}'s backlog in {{TRACKER}} (team {{TRACKER_TEAM}}): the procedure behind the Product Owner persona. Triggers include "groom the backlog", "reconcile the backlog", "what's stale", "what are the quick wins", "find something small to pick up", closing out a shipped item, or a session record claiming something shipped that the tracker still lists as Todo / In Progress. Loads the reconciliation procedure: assert the evidence base, match issue state against merged PRs AND open PRs AND deploys, sort In Progress by its real meaning, verify against the tree, label quick wins from the body not the title, audit recently-closed issues, re-prioritize aged items, enforce the issue contract, dedupe. Never invents scope: product decisions route to the PM.
---

# Backlog Groomer

The lens is the Product Owner persona (`docs/personas.md`); this is the checklist. Every step exists because a real pass got it wrong without it.

## Step 0 — assert the evidence base
```bash
bash scripts/groom/preflight.sh || exit $?
```
Cloud sessions arrive as a **shallow clone**, and a status reconciliation over it *looks* complete (`git log | grep` still returns plenty of hits) while seeing only the last week. The script fetches unconditionally, then asserts (a) no shallow boundary on `origin/main` and (b) `git rev-list --count origin/main` ≥ the watermark in `scripts/groom/floor.json`. Bump the watermark by hand in an ordinary PR, never from the pass: a floor the pass can lower is not a floor. **A non-zero exit means stop.**

## The pass, in order
1. **Reconcile against MERGED work.** `git log --oneline origin/main | grep -oE '{{ISSUE_PREFIX}}-[0-9]+' | sort -u`, intersected with open-state issues (`fields: ["id"]` keeps it cheap). **`origin/main`, never `main`**: a fetch never moves the local `main`. Check what the commit actually did before closing; umbrellas and hands-on-check issues are legitimately open. Never close without a resolving reference.
2. **Reconcile against OPEN PRs.** An issue whose work sits in an open PR is `In Review`.
3. **Reconcile against DEPLOYS.** Merged is not live if the thing is held or its deploy failed.
4. **Sort `In Progress` by what it actually means** (read the claim comment, not the status; stop at the first matching row):
   | Shape | How to tell | Action |
   |---|---|---|
   | In flight | open PR, or a claim whose branch **tip** is ≤14 days old | leave it |
   | In review | an open PR references it | → `In Review` |
   | Waiting on the PM | the only remaining step is the PM's | → `Needs PM` with that step as the first line |
   | Abandoned claim | branch tip >14 days old, no PR, no release comment | → `Todo`, comment naming the branch and tip date |
   | Never started | no claim, no branch, no PR, weeks old | → `Todo`, comment saying what was verified |

   **Judge staleness by the branch tip's DATE, never by whether the branch exists.** Agent branches are never pruned, so an existence check can never fire (L7: a detector whose only evidence is the existence of a ref is not a detector).
5. **Verify against the TREE, never the issue text.** A description is a snapshot of the day it was filed; the fix may have landed under another issue. Where reality moved, narrow the issue in a comment and say which issue took the other half.
6. **Quick wins: read each body; titles are not enough.** Measured: 10 of 21 title-judged candidates failed on the body (a PM call embedded, an options menu instead of a fix, scope the title hides, explicitly parked). Definition: *small AND grabbable today* — one session, ~1 PR, no schema/deploy chain, no pending ruling, not `Needs PM`. Positive signal: the body names the fix shape and a precedent already in the tree. Apply with `addLabels`, **never `labels`** (which replaces the whole set).
7. **Audit recently CLOSED issues for unfinished business.** An attachment closes an issue on merge, so an issue can go `Done` still carrying open decisions. Flag; do not re-open.
8. **Re-evaluate aged Urgent/High items:** blocked (say on what), mis-prioritized (lower with a why), or dead (flag to the PM, never silently cancel). Watch for a cluster sharing one blocker.
9. **Enforce the issue contract:** TL;DR in plain English, **Why:**, **Blocks:**, priority, an `Area: *` label, a current state. A project is not required (no catch-all project).
10. **De-duplicate semantically.** Prefer a relation or folding over two live issues; recommend which framing to keep.
11. **Surface what's relevant now:** issues in live projects, stale Urgent/High, and the `Needs PM` count grouped **by sitting** (hands-on checks / copy calls / rulings / dashboard toggles), because a queue is as long as its sittings, not its rows.

## Don't re-file the last pass's open calls
Each pass leaves one outcome issue carrying the calls it stopped short of. Read it first; comment onto it rather than minting a second (a comment, never an attachment, or the merge closes it).

## Write boundary
If the evidence for an edit is a sentence you wrote, it is a report line, not an edit. State corrections backed by a merged PR, an open PR or a branch date are edits; dedup, re-prioritization and scope are reports to the PM.

## Tracker mechanics that bit
- `labels` replaces; `addLabels` / `removeLabels` append and remove.
- The search index lags writes; after a bulk pass, trust your write count.
- The MCP writes as the PM; an author field is not proof of who acted.

## Output
```
## Backlog grooming — <date>
### Evidence base — <N> commits on origin/main · <N> open PRs · deploys read
### Reconciled (state corrected) — ID: from → to — evidence
### Narrowed against the tree
### Quick wins labelled / rejected (with reason)
### Re-prioritized
### Contract / dedup flags
### Closed but unfinished
### Needs PM, by sitting
### Needs PM decision (as decision briefs)
```
