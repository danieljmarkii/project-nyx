---
name: backlog-groomer
description: Use this skill to groom and reconcile Nyx's backlog in **Linear** (team Culprit, `linear.app/projectnyx`) — the operational procedure behind the Product Owner persona. Triggers include the PM asking to "groom the backlog", "reconcile the backlog", "clean up the backlog", "what's stale", "what are the quick wins", "find something small to pick up", or any session scan that needs to check Linear against reality; closing out a shipped item; or whenever a session record claims something shipped that Linear still lists as `Todo` / `In Progress`. Loads the reconciliation procedure: match issue status against merged PRs/commits AND open PRs AND the deploy ledger, fix stale statuses, clear abandoned claims, re-prioritize aged high-priority items, triage and label quick wins, audit recently-closed issues for unfinished business, and dedupe near-duplicate issues — without inventing scope (new product scope is a PM decision, routed to Open Questions, never a silent Linear edit). For the lens/judgment behind this procedure see the Product Owner persona in `docs/personas.md`; this skill is the how. Note: `docs/backlog.md` is frozen (migrated to Linear 2026-08-15) — this skill operates on Linear, not that file.
---

# Backlog Groomer (Linear)

The backlog lives in **Linear** (team **Culprit** — `linear.app/projectnyx`); `docs/backlog.md` is a frozen historical record (migrated 2026-08-15 — see CLAUDE.md § Backlog Protocol). This skill is the *procedure* the Product Owner runs to keep the Linear board honest. The lens is the Product Owner persona (`docs/personas.md`); this is the checklist. Use the Linear MCP tools throughout — `list_issues`, `get_issue`, `save_issue`, `save_comment`, `create_attachment`.

## Why this exists

The backlog drifts from reality in a specific, recurring way: an item ships in the codebase and gets narrated as "done" in a session record, but its issue in Linear stays `Todo` / `In Progress`. The native GitHub↔Linear integration closes this automatically **when a PR references the issue** (CLAUDE.md § Git Workflow → "Merge → Linear status") — but agent sessions run on `claude/<slug>` branches that don't reference the issue, so their merges can leave the status stale. Grooming closes that gap.

**That original drift is now largely solved, and the drift has moved.** Measured 2026-09-06 over the 26 PRs merged since the previous pass: every issue named in them was already `Done`. The claim protocol (CUL-624) plus `/wrap` step 4 are holding. What drifts *now* is `In Progress` (which means three different things), work that merged but was never deployed, and issues that closed carrying unfinished business. Steps 0–8 are ordered accordingly.

## Step 0 — un-shallow the clone, before anything else

```bash
test -f .git/shallow && git fetch --unshallow
git rev-list --count HEAD    # sanity: should be in the hundreds, not ~50
```

**The repo arrives as a shallow clone.** Measured 2026-09-07: 51 commits reachable, bottoming out eight days back. Full history is 810. A status reconciliation over the shallow clone can only ever see the last week or so of shipping evidence, and — worse — it *looks* complete, because `git log | grep CUL-` returns plenty of hits. Nothing else in this procedure is trustworthy until this is done.

## The grooming pass — run in order

1. **Reconcile status against MERGED work.** Build the evidence base once and intersect it, rather than eyeballing:

   ```bash
   git fetch origin main
   git log --oneline origin/main | grep -oE 'CUL-[0-9]+' | sort -u
   ```

   **`origin/main`, never `main`.** Nothing moves the local `main` branch — a fetch updates `origin/main` and leaves `main` frozen where the clone dropped it, and step 0's `--unshallow` makes it *deeper*, not *newer*. Measured 2026-09-12, both refs after step 0: `main` 806 commits / `origin/main` 834 → **26 `CUL` ids invisible**, including CUL-871 / CUL-873 and the whole `vet_visits` track. Silent, as ever: `git log main | grep CUL-` still returns 151 ids, so the pass reads complete. The fetch is load-bearing for the same reason — `origin/main` is only as fresh as the last one, and step 0 runs none on a clone that is already complete. _(Stopgap: CUL-921's `scripts/groom/preflight.sh` fetches unconditionally; drop the line when it lands.)_

   Intersect that set against the open-state issues (`list_issues` with `state` `unstarted`, `backlog`, `started` — `fields: ["id"]` keeps it cheap). Anything in both is a candidate. Move a genuinely-shipped issue to `Done` (`save_issue` `state`), attach the PR if it isn't linked, and post a one-line outcome comment naming the PR. **Never close without a resolving reference.** Expect most hits to be legitimately open — a track umbrella, a device-QA pass, a watch item — so check what the commit actually did before closing anything.

2. **Reconcile against OPEN PRs too.** A merged-PR scan cannot see work that exists only in an unmerged branch, and this repo has a deep open-PR queue (30 as of 2026-09-06, oldest from July). `list_pull_requests` with `state: open`, then match each PR's `CUL-NNN` to its issue: an issue whose work is sitting in an open PR is **`In Review`**, not `In Progress` and not `Todo`. Two issues were mis-stated this way on 2026-09-06 (CUL-319 → #704, CUL-530 → #668).

3. **Reconcile against the DEPLOY LEDGER.** Merged is not live. `git show origin/main:supabase/functions/deploy-manifest.json` — read it off the same ref as step 1, since the working tree is your own branch, not the record — says which Edge Functions are `deployed` versus `pending`, and both standing holds (CUL-19 `generate-report`, CUL-557 the per-incident chain) gate real user-visible work. An issue whose fix merged but whose function is `pending` is **not done** — and a cluster of separate "redeploy X" issues usually means one command discharges several of them (CUL-780 ↔ CUL-795 on 2026-09-06). Note the ledger guard cannot see a stale `status`, only a changed fingerprint (CUL-700), so read it rather than trusting CI's silence.

4. **Fix stale in-flight issues — `In Progress` means three different things.** Sort every `In Progress` issue into one of these, and treat them differently:

   | Shape | How to tell | Action |
   |---|---|---|
   | Genuinely in flight | A claim comment whose branch is on `origin`, or an open PR | Leave it |
   | Work in review | An open PR referencing it | → `In Review` (step 2) |
   | Abandoned claim | Claim comment names a branch; `git ls-remote origin <branch>` finds nothing; no PR | → `Todo`, with a comment naming the dead branch |
   | Blocked on the PM | Title/label says the remainder is a device pass, a dashboard toggle, a ruling | **Surface, don't sweep** — see below |
   | Never claimed, never started | No claim comment, no branch, no PR, weeks old | → `Todo`, with a comment saying what was verified |

   **Read the claim comment, not the status** (`/kickoff` step 0 — `**Claimed** — branch …`): it names the branch and the UTC time, so `git ls-remote origin <branch>` plus the PR list settles it. Status alone names no branch and cannot distinguish any of these.

   The **blocked-on-the-PM** row is a live convention collision, not a bug to fix silently: CUL-624 made `In Progress` mean *a session has claimed this*, and thirteen issues use it to mean *waiting on you*. Report it; let the PM rule.

5. **Verify against the TREE, never the issue text.** An issue's description is a snapshot of the day it was filed, and the fix may have landed under a different issue since. Before acting on any issue whose body names a file, symbol, or string, go read it:

   - CUL-83 claimed a whole defect; CUL-812 had shipped half of it (`escalationSurvivesFailure`), leaving a narrower one.
   - CUL-239 claimed three broken surfaces; two were already fixed, and only the server sentence remained (`phrasing.ts:166`).

   Where reality has moved, **narrow the issue in a comment** rather than closing or leaving it — and say which issue took the other half.

6. **Triage and label quick wins.** The `Quick Win` label is what the PM sorts by to find something grabbable; it goes stale as soon as new issues are filed, so re-derive it every pass over everything created since the last one.

   **The definition (canonical, set 2026-08-29 — do not invent a second one):** *small **AND** grabbable today.* One focused session, ~1 PR, no schema/deploy chain, no pending PM/design/clinical ruling, not on either standing deploy hold, not a device/App-Store-Connect chore, not carrying `Waiting on PM`, and genuinely worth doing now.

   **You must read each candidate's description. Titles are not sufficient, and this is measured, not cautionary.** On 2026-09-07, 21 candidates were judged from their titles and then verified against their bodies: **10 of 21 failed** — and every disqualifier was invisible from the title. The recurring shapes:

   - a **PM call embedded in the body** ("the product call inside it…", "needs one small call, which is why this isn't mechanical") — CUL-820, CUL-765, CUL-770;
   - an **options menu instead of a fix** ("Options, none obviously right", "not a recommendation, a menu") — CUL-830, CUL-700;
   - **scope the title hides** — CUL-743 reads as one timeout and touches twelve queues, naming its own "single highest-risk detail";
   - **explicitly parked** — CUL-702 blocks only an Android build we do not ship.

   A good positive signal is a body that names the fix shape *and* a precedent already in the tree ("the `pending` sibling of `escalationSurvivesFailure`", "as shipped for the sibling in #806"). Those are the ones that really are one session.

   Apply with **`addLabels: ["Quick Win"]`** — never `labels`, which replaces the whole set and would silently strip `Waiting on PM` / `Legacy` / `Area: *` across the board.

7. **Audit recently-CLOSED issues for unfinished business.** Grooming has always looked only at open issues, which misses a failure mode the tracker creates: per CLAUDE.md v1.32, a `create_attachment` closes its issue on merge, so an issue can go `Done` still carrying open decisions. Scan issues closed since the last pass for a title or body naming something unresolved, and check whether a successor issue actually carries it. CUL-810 closed `Done` while its own title named four unruled decisions (D1 / D6 / DB-3 / DB-4) that neither successor mentions. **Flag; do not re-open and do not file a replacement** — whether they still need a home is the PM's call.

8. **Re-evaluate aged priorities.** Any Urgent/High issue open across multiple sessions without progress is one of: (a) genuinely blocked — state the blocker in a comment; (b) mis-prioritized — lower its `priority` with a one-line why; (c) effectively dead — flag to the PM, don't silently cancel. Watch for a cluster that shares **one** blocker: most of the Urgent tier waits on the single Dr. Chen sitting CUL-583 exists to schedule.

9. **Enforce the issue contract.** Every issue needs: a title, a plain-English `TL;DR` opener (PM directive 2026-08-26), a description that leads with **Why:** and names **Blocks:** (or `—`), a `priority`, a `project`, and a current `state`. Flag any issue missing the *why*.

10. **De-duplicate.** Linear assigns IDs server-side, so there are no duplicate IDs to chase — the pass is *semantic*. If an issue restates an existing one, prefer linking them (`relatedTo`) or folding one into the other over leaving two live. Flag near-duplicates to the PM with a recommendation on which framing to keep; mark a true duplicate with the `Duplicate` state (or `duplicateOf`). Two deploy issues asking for the identical command is the common shape here.

11. **Surface what's relevant now.** List any issue whose project is a live build-track (`list_projects`, or `STATUS.md`'s Current phase table), plus any stale Urgent/High issues, at the top of your report.

## Don't re-file the last pass's open calls

Each grooming pass leaves an outcome issue carrying the calls it deliberately stopped short of (CUL-719 is the 2026-08-29 one). **Read it first.** If its calls are still unruled, comment the new pass's outcome onto that issue rather than minting a second one — two grooming records competing for the same rulings is the drift this skill is supposed to remove.

## Linear mechanics that have bitten a pass before

- **`labels` REPLACES the whole label set; `addLabels` appends.** Always `addLabels` / `removeLabels`.
- **Linear's search index lags writes.** After a bulk pass, trust your write count, not a search that returns fewer.
- **`fields: ["id"]` on `list_issues`** makes a full-board sweep cheap enough to do properly; fetch descriptions only for the candidates you are actually judging.

## Hard rules

- **Do not invent scope.** Grooming reconciles and re-orders existing issues; it never adds new product scope. If grooming reveals a real decision, that belongs in CLAUDE.md → Open Questions, surfaced to the PM — NOT resolved by a status edit. (Filing a genuinely-new *deferral* as a new Linear issue is still proactive and fine — that's the Backlog Protocol; it's *scope decisions* that route to the PM.)
- **Do not re-prioritize against the PM's explicit ordering** without surfacing it as a question first.
- **Closing keeps the issue.** Move it to `Done` with a resolving PR/session reference; Linear keeps the record. Never cancel an item just to clear the board.
- **A convention collision is a PM ruling, not a sweep.** When two rules give one field two meanings (step 4), report it with a recommendation and leave the board alone.

## Output format

```
## Backlog grooming (Linear) — <date>

### Evidence base
- full history: <N> commits (un-shallowed) · <N> open PRs · deploy ledger read

### Reconciled (status corrected)
- CUL-NNN <title>: In Progress → Done — <date> (PR #N) — <evidence>

### Narrowed against the tree
- CUL-NNN — <what shipped elsewhere, what remains, at file:line>

### Quick wins labelled
- <N> labelled / <N> candidates read — CUL-NNN, CUL-NNN, …
- rejected with reason: CUL-NNN (<PM call in body | options menu | scope | parked>)

### Re-prioritized
- CUL-NNN: Urgent → Medium — <why>

### Contract / dedup flags
- CUL-NNN — <missing why | duplicate of CUL-MMM | abandoned claim, branch <name> | …>

### Closed but unfinished
- CUL-NNN — <what it closed still carrying, and whether a successor holds it>

### Blocks the Current Phase (<phase>)
- CUL-NNN <title> — <why it's relevant now>

### Needs PM decision
- <anything that's actually an Open Question, not a deferral>
```

Apply the status / label / dedup edits directly in Linear via the MCP (`save_issue`) — reversible and cheap. Route anything in "Needs PM decision" to the PM and to CLAUDE.md → Open Questions.
