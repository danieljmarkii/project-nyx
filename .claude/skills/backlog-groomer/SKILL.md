---
name: backlog-groomer
description: Use this skill to groom and reconcile Nyx's backlog in **Linear** (team Culprit, `linear.app/projectnyx`) — the operational procedure behind the Product Owner persona. Triggers include the PM asking to "groom the backlog", "reconcile the backlog", "clean up the backlog", "what's stale", "what are the quick wins", "find something small to pick up", or any session scan that needs to check Linear against reality; closing out a shipped item; or whenever a session record claims something shipped that Linear still lists as `Todo` / `In Progress`. Loads the reconciliation procedure: match issue status against merged PRs/commits AND open PRs AND the deploy runs and holds, fix stale statuses, clear abandoned claims, report aged high-priority items for re-prioritization, triage and label quick wins, audit recently-closed issues for unfinished business, report near-duplicates for dedup, drain the `Waiting on PM` queue through six lanes, a 72-hour default window and a never-list, and prune what no longer belongs (retired surfaces, stale low-priority issues, closed-project leftovers) through a `Propose close` label and a 7-day veto window — bounded by § What an unattended pass may WRITE, which lists the only field edits an unattended run may make and sends everything else to the report. Never invents scope (new product scope is a PM decision, routed to Open Questions, never a silent Linear edit). For the lens/judgment behind this procedure see the Product Owner persona in `docs/personas.md`; this skill is the how. Note: `docs/backlog.md` is frozen (migrated to Linear 2026-08-15) — this skill operates on Linear, not that file.
---

# Backlog Groomer (Linear)

The backlog lives in **Linear** (team **Culprit** — `linear.app/projectnyx`); `docs/backlog.md` is a frozen historical record (migrated 2026-08-15 — see CLAUDE.md § Backlog Protocol). This skill is the *procedure* the Product Owner runs to keep the Linear board honest. The lens is the Product Owner persona (`docs/personas.md`); this is the checklist. Use the Linear MCP tools throughout — `list_issues`, `get_issue`, `list_comments`, `save_issue`, `save_comment`. **`create_attachment` is not one of them:** an attachment is a commitment that merging a PR finishes an issue (CLAUDE.md § Git Workflow), it is clause 1's evidence, and a pass that mints its own evidence is measuring itself.

## Why this exists

The backlog drifts from reality in a specific, recurring way: an item ships in the codebase and gets narrated as "done" in a session record, but its issue in Linear stays `Todo` / `In Progress`. The native GitHub↔Linear integration closes this automatically **when a PR references the issue** (CLAUDE.md § Git Workflow → "Merge → Linear status") — but agent sessions run on `claude/<slug>` branches that don't reference the issue, so their merges can leave the status stale. Grooming closes that gap.

**That original drift is now largely solved, and the drift has moved.** Measured 2026-09-06 over the 26 PRs merged since the previous pass: every issue named in them was already `Done`. The claim protocol (CUL-624) plus `/wrap` step 4 are holding. What drifts *now* is `In Progress` (which means three different things), work that merged but was never deployed, and issues that closed carrying unfinished business. Steps 0–8 are ordered accordingly.

**And the board only grew.** Until 2026-10-02 no step removed an issue: obsolete work stayed open because nothing asked whether its surface still existed, and 51 `Propose close` labels waited a week on a hand bulk cancel. Steps 13–15 prune, with a 7-day veto window as the safety net, and count the board so a pass can tell whether it shrank. Step 12 drains the `Waiting on PM` queue the same way: six lanes, the Sep 27 decision rights, a 72-hour default window, and a never-list that keeps every high-risk call with the PM.

## Step 0 — assert the evidence base, before anything else

```bash
bash scripts/groom/preflight.sh || exit $?
```

**The repo arrives as a shallow clone.** Measured 2026-09-12: 50 commits reachable; full history is 837 (834 earlier the same day — the number moves with every merge, which is why the watermark below is a FLOOR and not an equality). A status reconciliation over the shallow clone can only ever see the last week or so of shipping evidence, and — worse — it *looks* complete, because `git log | grep CUL-` returns plenty of hits. Nothing else in this procedure is trustworthy until this passes.

**This step used to be two lines, and one of them was `test -f .git/shallow && git fetch --unshallow` — which exits 1 whenever the clone is already complete, i.e. the success case** (CUL-921; retro §2 F3). Measured in both states: exit 0 while shallow, **exit 1 once healthy**. An unattended run that checked `$?` aborted precisely when nothing was wrong. It also ran no fetch at all on a complete clone, because `--unshallow` was the only fetch in it — so `origin/main` stayed as stale as the previous session left it.

`preflight.sh` fetches unconditionally, then **asserts** two things and prints the value that failed: (a) no shallow boundary lies on `origin/main`'s history; (b) `git rev-list --count origin/main` ≥ the committed watermark in `scripts/groom/floor.json`. History only grows, so a static number catches every shallow, stale and partial clone. **Bump the watermark by hand in an ordinary PR; never from the pass** — a floor the pass can lower is not a floor.

Exit codes, so an unattended caller can say *which* assertion failed: `0` sound · `2` no `origin/main` · `3` floor.json missing or unparseable · `4` `origin/main` truncated · `5` below the watermark. Proven by mutation in `guards/groomPreflight.test.ts`, including against the old two-line construct.

## What an unattended pass may WRITE

**The governing rule:** *an unattended pass writes only where a named artifact determines the write. If the evidence is a sentence you wrote, it is a report line.*

Everything below follows from that one sentence, and it is checkable **from the pass's own output** without opening Linear: every line under **Applied this pass** carries its artifact — a PR number, a branch name and its tip date, a state category, a proposal's or default's timestamp. A written line with no artifact beside it is a visible protocol violation.

This table binds an **unattended** run — a scheduled Routine, `scripts/groom/apply.*`, any pass with no PM in the conversation. A pass run *with* the PM may go further, but it asks in that conversation and the answer is the authorisation. **The PM having scheduled the Routine is not that answer** — scheduling authorises the pass to run, and this table is what it authorises the pass to do.

**A comment is not a write.** The boundary governs *field* edits — `state`, `priority`, labels, `duplicateOf`, `parentId`, the description. Comments are how a pass reports, and every permitted write still carries its own one-line audit comment naming the artifact. Report-only findings go in the pass's report on the standing issue (§ Don't re-file the last pass's open calls) — not sprayed one comment per issue across the board.

| Step | Unattended | The artifact that determines it |
|---|---|---|
| 1 · merged work | → `Done` — attachment **plus** a second signal (clause 1, below) | the PR number, and which second signal |
| 2 · open PRs | → `In Review` | the PR number |
| 3 · deploy runs + holds | **report** | — "merged but not live, so not done" is a conclusion, not a field |
| 4 · abandoned claim | → `Todo` | the branch name **and its tip commit date**, plus no PR |
| 4 · never claimed · blocked on the PM | **report** | — absence of evidence is not evidence (L7); and a convention collision is a ruling |
| 5 · narrowed against the tree | **report** | — |
| 6 · `Quick Win` **add** | **report** | — the definition is *grabbable today*, and grabbability is a judgment that decays |
| 6 · dead-label **strip** | remove `Quick Win` / `Waiting on PM` — that set only | the issue's state category, `completed`, `canceled` or `duplicate` |
| 7 · closed but unfinished | **report** | — whether it still needs a home is the PM's call |
| 8 · priority | **report** | — the aging is a fact; the re-rank is the PM's ordering |
| 9 · contract | **report** | — |
| 10 · dedup | **report** | — "these two are the same issue" is a sentence you wrote |
| 11 · what's relevant now | **report** | — |
| 12 · lane sort, docket, device sitting, clinical docket, 21-day proposals | **report** | — the lane is a judgment; the sittings are the PM's |
| 12 · *Not the PM's*, moot | only what another row already permits: `→ Done` under step 1's clause 1. A deploy run (step 3) or a duplicate (step 10) is **report** | the PR number and its second signal, as row 1 — the queue is not a second, weaker path to `Done` |
| 12 · *Not the PM's*, no PM step left | **report** | — "nothing is left for the PM" is a sentence you wrote |
| 12 · team call | **post it as a default** (a comment, no field edit); never applied on the day | — an attended pass applies it at once |
| 12 · default posted | comment only, no field edit; the label stays | — |
| 12 · default applied after its window | remove `Waiting on PM`, set the state the default comment named (`Todo` or `Done`) | the default comment's timestamp, no later comment except a pass's own, and no never-list label added since |
| 13 · `Propose close` **add**, from 13a / 13b / 13c only, reason `obsolete` or `stale` | add the label, plus the signed proposal comment with its cancel date | the triggering event: the PR that retired the surface (13a), the `updatedAt` date (13b), the project's Completed or Canceled state (13c). **A judgment, admitted as a proposal** — see *The one proposal*, below |
| 13 · `superseded by` · `won't do` | **report** | — no event triggers either; both are sentences you wrote |
| 13 · project moves, `relatedTo` for *Dies at* | **report** | — which project an idea belongs to is a judgment, and it takes effect the moment it is written |
| 14 · cancel after the window | → `Canceled` | the label, the proposal comment's timestamp, and no later comment except a pass's own |
| 14 · engaged proposals | **report** | — a person spoke; that is a PM decision |
| 15 · board count | **report** | — |

**Clause 1 — why an attachment, and why an attachment alone is not enough.** The attachment is the artifact because it is what the integration acts on: on #806's merge the two issues carrying one moved to `Done`, while the four named in the body without one held their state and were never linked at all (CUL-803). **A bare mention is not evidence.** But an attachment is not proof of *intent*: a `CUL` **range** in a PR title creates an attachment on **both endpoints**, and #829's title read `… (CUL-919 … CUL-928)` — the integration attached and assigned both, and merging would have marked two issues `Done` with neither fix made (retro §2 F6, found live on the audit's own PR, after this rule was first drafted). So the clause is the attachment **and** a second signal of intent — and the second signal must tie the issue to **that PR**: a closing keyword naming the issue in that PR's title or body, **or** the issue's own claim comment naming that PR's head branch. The retro's draft said "or the issue already in a started state", and that is defeated by F6's own shape — a range title attaches an unrelated issue, and a session that claimed and died leaves it `In Progress` indefinitely, so ambient state plus a stray attachment closes it. A started state is ambient; a branch name and a keyword are artifacts. **And the pass may never mint the attachment it then reads as its own evidence** — attaching is `/wrap`'s job and a human's commitment (CLAUDE.md § Git Workflow); a detector that can author its own evidence is measuring itself.

**Expected yield of clause 1: approximately zero, and that is correct.** An attachment present at merge is exactly what makes the integration close the issue itself, so `{still open} ∩ {merged PR} ∩ {attachment}` is nearly empty by construction. Clause 1 is a **boundary**, not a detector — it exists to forbid closing on a bare mention. Written here up front so no later session widens it to make a pass look productive. Two consecutive passes (08-29, 09-06) already found zero status drift; that is the fixture working, not a pass underperforming.

**The one proposal — why step 13's label add is a write.** Strictly applied, the governing rule forbids it: in 13a's *Unclear* row the verdict is a judgment, and a judgment is a report line. Ruled 2026-10-02 (PM, CUL-922): it is a permitted write, because it is **announced and vetoable rather than terminal**, and the table now carries that distinction. A write qualifies as a proposal only when all five hold:

1. **It changes nothing but its own label.** No state, priority, project or relation moves; the issue stays open and everyone's view of it is unchanged.
2. **It is announced in the same breath.** A signed comment names the reason, the cancel date and the one gesture that vetoes it.
3. **The veto is one gesture, and it sticks.** Removing the label keeps the issue, and step 14 never re-proposes it for the same reason.
4. **Nothing acts on it until the window closes.** The terminal write is step 14's cancel, and that write is artifact-determined: the label, a timestamp, the absence of a later comment.
5. **It still names an artifact.** The judgment is only whether an issue fits an event; the event itself (a retiring PR, an `updatedAt` date, a project's state) goes on the *Applied* line, so the output check still works.

Step 13's exemption list still binds, ahead of all five.

**Step 12's defaults are the same shape, and a team call is made into one** (ruled 2026-10-02, PM, CUL-922). A default changes no field at all when it is posted: it is a comment that names the call, the state it lands in and the date it applies, and the `Waiting on PM` label stays on. The apply after 72 hours is artifact-determined, as step 14's cancel is. A team call written unattended would be a judgment taking effect the moment it was written, so an unattended pass posts it as a default instead and it rides the same window; an attended pass makes it at once. The never-list binds ahead of both.

**Nothing else in this skill is a proposal.** A `Quick Win` takes effect the moment the PM sorts by it, a `Duplicate` closes the issue, a priority reorders the queue, and a project move changes where it is read: none of them has a window between the write and its effect, which is the whole difference.

**What the label strip is, and what it is not.** Stripping a needs-attention label from closed and cancelled issues is the highest-yield safe write on the board — ~70 dead `Quick Win` and ~5 dead `Waiting on PM` on pass one — and it fixes exactly one thing: *the board does not match reality*. **It does essentially nothing for queue length.** A first pass reports an impressive write count; that count is not a drain and must never be reported as one. (CUL-923 proposed a `Needs PM` state to make the `Waiting on PM` half unrepresentable; CUL-1448 declined it on 2026-10-02, so the label stays the wait, and this strip is standing hygiene rather than a stopgap. It is still not the win.)

## The grooming pass — run in order

Every step below is bounded by the table above. Where a step's prose and the table disagree, **the table wins.**

1. **Reconcile status against MERGED work.** Build the evidence base once and intersect it, rather than eyeballing:

   ```bash
   git log --oneline origin/main | grep -oE 'CUL-[0-9]+' | sort -u
   ```

   **`origin/main`, never `main`.** Nothing moves the local `main` branch — a fetch updates `origin/main` and leaves `main` frozen where the clone dropped it, and un-shallowing makes it *deeper*, not *newer*. Measured 2026-09-12, both refs after step 0: `main` 806 commits / `origin/main` 834 → **26 `CUL` ids invisible**, including CUL-871 / CUL-873 and the whole `vet_visits` track. Silent, as ever: `git log main | grep CUL-` still returns 151 ids, so the pass reads complete. **The fetch this block used to carry is gone because step 0 now does it unconditionally** (CUL-921) — so step 0 is not optional, and a non-zero exit from it means stop rather than continue on a stale ref.

   Intersect that set against the open-state issues (`list_issues` with `state` `unstarted`, `backlog`, `started` — `fields: ["id"]` keeps it cheap). Anything in both is a candidate. Move a genuinely-shipped issue to `Done` (`save_issue` `state`) **only where clause 1 of the boundary holds** — a Linear attachment from the merged PR *plus* a second signal of intent — and post a one-line outcome comment naming the PR and which second signal you found. **Never close without a resolving reference, and never create the attachment yourself in order to satisfy the clause.** A commit naming a `CUL` id with no attachment behind it is a **report** line, not a close. Expect most hits to be legitimately open — a track umbrella, a device-QA pass, a watch item — so check what the commit actually did before closing anything.

2. **Reconcile against OPEN PRs too.** A merged-PR scan cannot see work that exists only in an unmerged branch, and this repo has a deep open-PR queue (30 as of 2026-09-06, oldest from July). `list_pull_requests` with `state: open`, then match each PR's `CUL-NNN` to its issue: an issue whose work is sitting in an open PR is **`In Review`**, not `In Progress` and not `Todo`. Two issues were mis-stated this way on 2026-09-06 (CUL-319 → #704, CUL-530 → #668).

3. **Reconcile against DEPLOYS.** Since CUL-1147, merged is live unless the function is held or its deploy failed. Read the holds off the same ref as step 1 (`git show origin/main:supabase/functions/deploy-manifest.json` — the working tree is your own branch, not the record), and the latest **Deploy Edge Functions** runs on `main` (GitHub MCP `actions_list` → `list_workflow_runs`, resource `edge-deploy.yml`): a red run means a function is owed, and its summary names which. An issue whose fix merged into a **held** function is **not done** until the hold lifts. A "redeploy X" or "PM deploys from the Codespace" issue filed before 2026-09-24 is usually discharged by the first run after its merge: close it with that run as the reference.

4. **Fix stale in-flight issues — `In Progress` means three different things.** Sort every `In Progress` issue into one of these, and treat them differently:

   | Shape | How to tell | Action |
   |---|---|---|
   | Genuinely in flight | An open PR, **or** a claim comment whose branch tip is ≤14 days old | Leave it |
   | Work in review | An open PR referencing it | → `In Review` (step 2) |
   | Abandoned claim | Claim comment names a branch whose **tip commit is >14 days old**; no open or merged PR references the issue; no later comment releases the claim **or says the issue is waiting on the PM** | → `Todo`, with a comment naming the branch **and its tip date**. The one write in this step |
   | Blocked on the PM | Carries `Waiting on PM`, or the title/body says the remainder is a device pass, a dashboard toggle, a ruling | **Report.** An attended pass moves it to `Todo`, keeping (or adding) `Waiting on PM`, with a comment saying the label now carries the wait — see below |
   | Never claimed, never started | No claim comment, no branch, no PR, weeks old | **Report.** Its whole evidence is four absences, and L7 is that absence is not a detector — this row and *blocked on the PM* above it are told apart only by reading the issue, which is why CUL-425 would have been swept. An attended pass moves it to `Todo`, with a comment saying what was verified |

   **Read the claim comment, not the status** (`/kickoff` step 0 — `**Claimed** — branch …`): it names the branch and the UTC time. Status alone names no branch and cannot distinguish any of these.

   **The abandoned-claim row used to test whether the branch still EXISTED, and so could never fire** (CUL-921; retro §2 F2). Measured 2026-09-12: **790 of 800 remote heads are `origin/claude/*`** — claim branches are never pruned, so `git ls-remote origin <branch>` always finds something and the row returned "not abandoned" for every issue on the board, indistinguishable from a clean one. This is the audit's most generalizable law: **a detector whose only evidence is the existence of a ref, a file or a label is not a detector.**

   So judge the branch's **tip date**, which requires no fetch:

   ```bash
   git ls-remote origin "refs/heads/<branch>" | cut -f1     # the tip SHA, or empty
   ```

   Then read that SHA's committer date with `mcp__github__get_commit` — an API read, so it leaves the object store alone. The git-only fallback is `git fetch --depth=1 origin <branch> && git log -1 --format=%cI FETCH_HEAD`, and note the side effect: **a `--depth=1` fetch writes a new root into `.git/shallow`** while leaving `origin/main` whole, which is exactly why step 0's assertion (a) asks whether the boundary is on `origin/main` rather than whether `.git/shallow` exists.

   **A missing ref is now the rarer signal, not the rule** — if `ls-remote` does come back empty, the branch was deleted by hand, which is still abandonment; say which of the two you found.

   **Three rows, one population — read them in table order and stop at the first match.** The rows below "work in review" are not mutually exclusive on their face, and the wrong order sweeps a PM-blocked issue to `Todo`: CUL-425 has no claim comment and is weeks old (the *never claimed* row) and its own newest comment says "leaving **In Progress**, blocked on the PM UI action" (the *blocked-on-the-PM* row, which wins). Likewise CUL-847 carries a claim comment **and** a later comment releasing that claim while the issue waits on rulings — a released claim is not an abandoned one.

   The **blocked-on-the-PM** row used to be a convention collision: CUL-624 made `In Progress` mean *a session has claimed this*, and issues used it to mean *waiting on you*. **Ruled 2026-10-02 (PM, CUL-1448): "waiting on the PM" stays a LABEL, not a workflow state** (CUL-923's `Needs PM` state was declined). So the two questions ride two fields: the status says whether a session holds the issue, the label says whether you owe it something. A live claim blocked mid-build keeps `In Progress` *and* gets the label (row 1 catches it first); a PM-blocked issue with no live claim is `Todo` plus the label. **That ruling settles what the row's write would be, not who may make it:** telling this row from *never claimed* still means reading the issue, so an unattended pass reports both and an attended pass applies the seating above.

   **Codifying these as typed predicates with their own mutation suite is CUL-926**, which also owns the general detector-liveness clause — *every detector must be shown to fire at least once against a real-board fixture*. This step is the corrected rule; that issue is where it stops being prose.

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

   **Adding the label is a recommendation, not a write.** Grabbability is the half 8 of those 10 failures turned on, it is a judgment, and it decays — so an unattended pass lists its candidates with the body-read verdict beside each and applies none of them. An attended pass applies them with **`addLabels: ["Quick Win"]`** — never `labels`, which replaces the whole set and would silently strip `Waiting on PM` / `Legacy` / `Area: *` across the board.

   **The strip is the write.** `removeLabels` **`Quick Win` or `Waiting on PM`** — that is the whole set, not an example of one — from every issue whose state category is `completed`, `canceled` or `duplicate` (Linear gives `Duplicate` its own category, so a pass that checks only the first two misses it). Never `Area: *`, never `Legacy`, never any other label: those describe what an issue *is* and stay true after it closes, while these two describe what someone should *do next* and cannot. `Propose close` is not in the set either: it stays on a pruned issue on purpose, because step 14 counts how an issue left by it. The state category is the artifact and nothing is judged, which is what makes this the one label edit an unattended pass may make. Before reporting the count, read what the boundary section says it is worth: it is board accuracy, not a drain.

7. **Audit recently-CLOSED issues for unfinished business.** Grooming has always looked only at open issues, which misses a failure mode the tracker creates: every `CUL-NNN` a PR names goes `Done` when it merges (CLAUDE.md § Merge → Linear status, CUL-1397), so an issue can go `Done` still carrying open decisions. Scan issues closed since the last pass for a title or body naming something unresolved, and check whether a successor issue actually carries it. CUL-810 closed `Done` while its own title named four unruled decisions (D1 / D6 / DB-3 / DB-4) that neither successor mentions. **Flag; do not re-open and do not file a replacement** — whether they still need a home is the PM's call.

8. **Re-evaluate aged priorities — report, never write.** Any Urgent/High issue open across multiple sessions without progress is one of: (a) genuinely blocked — state the blocker in a comment; (b) mis-prioritized — **recommend** the lower priority with a one-line why, and leave the field alone; (c) effectively dead — **recommend** `Propose close` with a reason; never cancel it outright. Step 13's own branches cannot reach it (13b excludes Urgent and High), and the proposal write in the boundary table is scoped to those branches, so an attended pass applies the label on the PM's word and the veto window still decides. Priority is the PM's ordering and no artifact determines it: the aging is a fact, the re-rank is a judgment. (This step used to instruct the write while Hard rules forbade it — the contradiction CUL-922 removed.) Watch for a cluster that shares **one** blocker: most of the Urgent tier waits on the single Dr. Chen sitting CUL-583 exists to schedule.

9. **Enforce the issue contract.** Every issue needs: a title, a plain-English `TL;DR` opener (PM directive 2026-08-26), a description that leads with **Why:** and names **Blocks:** (or `—`), a `priority`, an `Area: *` label, and a current `state`. Flag any issue missing the *why*.

   **A project is NOT part of the contract** (PM, 2026-09-26, CUL-1284). An issue joins a live project only when it extends that project's work; a standalone issue takes no project, and that is correct, not a gap. Requiring one is what turned Legacy Backlog into a dumping ground: 153 issues filed natively after the cutover landed there because it was the only "neutral" home. The `Area: *` label is what keeps a project-less issue findable, so that is the field to enforce.

   **Legacy Backlog is closed to new issues.** It holds the rows migrated from `docs/backlog.md` (CUL-28 → CUL-514, label `Legacy`) and nothing else. Every pass lists open issues in that project created after 2026-08-16 (`list_issues` with `project: "Legacy Backlog"` and `createdAt: "2026-08-16"`) and names, for each, the live project it extends or no project with an `Area: *` label; an attended pass makes the move. Closed ones stay where they are. A non-empty list means a session broke the rule, so name the issues in the report.

10. **De-duplicate — report, never write.** Linear assigns IDs server-side, so there are no duplicate IDs to chase — the pass is *semantic*, and "these two are the same issue" is a sentence you wrote, not an artifact. Report near-duplicates with a recommendation on which framing to keep and why. **An unattended pass never sets `Duplicate` or `duplicateOf`, never folds one issue into another, and never adds `relatedTo`** — that is the PM's call, or an attended pass's on the PM's word. Two deploy issues asking for the identical command is the common shape here.

11. **Surface what's relevant now.** List any issue whose project is a live build-track (`list_projects`, or `STATUS.md`'s Current phase table), plus any stale Urgent/High issues, at the top of your report.

12. **Drain the PM queue** (PM rulings 2026-09-27 and 2026-10-02, CUL-1366). The queue is the **`Waiting on PM` label**, not a workflow state (CUL-923's `Needs PM` was declined). It went 10 → 97 → 153 between Aug 20 and Sep 27, and a measured read of every item found most of it was not waiting on a decision. Steps 1–11 fix what the board *says*, and this step is what makes the queue *shorter*. It never authors a recommendation and never rules a real product call. It sorts, quotes and prepares.

    List every open issue carrying the label (`list_issues` `label: "Waiting on PM"`, `fields: ["id", "title", "labels", "updatedAt"]`). Then **read each description and its newest comments**. Step 6's measurement holds here too: the title does not tell you which lane an item is in.

    **The never-list, which is absolute.** Clinical · a safety invariant (intake is not preference, n=1 never reassures) · privacy / RLS / Storage / deletion / export / share links · money or Pets > $ (a gate, a cap, a paywall, an entitlement) · schema · App Store · anything irreversible. An item is on it when it carries `Gate: clinical`, `Gate: privacy` or `Area: Privacy/RLS`, **or** when its body touches any of these. **Uncertain counts as on the list.** A never-list item cannot enter the team call or the default lane, whatever else it is.

    **Sort each item into the first lane that matches, read in this order:**

    | Lane | Test | Action |
    |---|---|---|
    | **Not the PM's** | An artifact shows it is moot (the PR that shipped it, the deploy run that discharged it, the issue it duplicates), **or** its own body says nothing is left for the PM | Moot → close it with the artifact on the comment's first line (`Done` or `Duplicate`, per steps 1, 3 and 10). Work with no PM step → `removeLabels: ["Waiting on PM"]`, leave it in `Todo`, and comment what the remaining work is. **Only suspected moot → a report line, not a close.** **Unattended, the boundary table narrows this:** only a `Done` that step 1's clause 1 already permits is written; the rest are report lines an attended pass applies. |
    | **Device** | The remainder is an on-device check, or a console task only the PM can do (a dashboard toggle, an App Store Connect form, a secret) | Leave it. List it on the sitting for the **next TestFlight cut**, grouped by build: device checks first, console tasks after them. Ruling 3 is one device sitting per cut, so an item whose PR is not in a TestFlight build yet waits for the next cut. |
    | **Clinical** | On the never-list as clinical or a safety invariant, and asking for a ruling | Leave it. List it on the clinical docket. The session that prepares the docket runs **one `adversarial-reviewer` pass per item** and posts its verdict on the issue before the sitting (ruling 4), not on every pass. CUL-583's batch is folded into this docket, so it gets no separate sitting. |
    | **Team call** | Off the never-list, no persona conflict, and the call is one of ruling 1's three: **(a)** copy that stays inside `nyx-voice` · **(b)** UX detail inside a spec or mock round the PM already ratified (cite the section or round) · **(c)** a doc edit that only matches shipped code (cite the PR) | The owning persona makes the call (the Designer with `nyx-voice` loaded for (a) and (b), the Engineer for (c)). Comment it in the shape below, `removeLabels: ["Waiting on PM"]`, and leave the issue `Todo` if carrying it out is work, or `Done` if the call was the whole ask. **Unattended, a team call is posted as a default instead** (the default shape, naming the persona and the decision right), and applies only after its window. **Not granted:** "a written rule already settles it". A persona conflict stays on the docket even when a principle answers it. |
    | **Default** | Off the never-list, low risk, and **the issue already carries a team recommendation** that the pass can quote | Post the default comment below and keep the label. The window is **72 hours** from that comment (ruling 2). |
    | **Docket** | Everything else: high risk, no recommendation, a persona conflict, a scope decision | Leave it. Prepare a decision brief (CLAUDE.md § Presenting decisions to the PM) and rank it by **what it unblocks**: issues that list it as a blocker, then tracks that name it, with ties broken by age. |

    The two comment shapes, each signed so step 14's rule can tell a pass from a person:

    > **Team call (Designer), under the 2026-09-27 decision rights (a).** The empty state reads "Nothing logged yet today". It stays inside nyx-voice and the copy pack has the same register. The PM can reverse this any time by replying here. — Product Owner lens, grooming pass 2026-10-09

    > **Default, applies 2026-10-12, lands in `Done`.** The team's recommendation in the description: keep the chip order as shipped. Low risk under ruling 2, and on no line of the never-list. Reply here to veto or change it; otherwise the first grooming pass on or after 2026-10-12 applies it, and it stays reversible after that. — Product Owner lens, grooming pass 2026-10-09

    **Running the default window.** This works like step 14's veto window, and the same evidence decides it. On the first pass on or after the apply date: if the label is still on, no comment other than a grooming pass's own has landed since, and no never-list label has been added, then **apply it**. Comment `**Default applied** (posted <date>, no reply). <the call>. Reverse any time.`, remove the label, and set the state the default comment named, `Todo` or `Done`; a default that named neither lands in `Todo`. Any other comment → do not apply; the item moves to the docket with that comment's first line. 72 hours is a floor, not a schedule: a weekly pass applies on its next run.

    **21 days untouched.** When an item's newest comment from anyone other than a grooming pass is older than **21 days** (comments, not `updatedAt`, which bulk label passes bump), the report carries one proposal for it: apply the default (when the default lane is open to it), close it (with the lane's evidence), or escalate it (to the top of the docket). Whichever lane it sits in, it does not sit silently.

    **Cadence (ruling 3).** Two 30-minute docket sessions a week, plus one device sitting per TestFlight cut. The pass that falls before a session prepares that session's docket in advance: the clinical items with their reviewer verdicts, then the docket briefs in rank order, as many as fit 30 minutes. The rest carry forward in rank order.

    **The write boundary.** § *What an unattended pass may WRITE* has a row for each lane. In short: applying a default after its window is a write, because its inputs are artifacts; a moot close is written only where step 1's clause 1 already permits it; a team call is posted as a default rather than applied; and the lane sort, the dockets and posting a default write no field at all.

13. **Prune what no longer belongs on the board** (PM ruling 2026-10-02, CUL-1448). Steps 1–12 keep the board *true*; this step keeps it *small*. Nothing else in the procedure removes an issue, and a board with a mandated add and no mandated remove only grows (retro 2026-09, L1). Every prune goes through one door: the `Propose close` label plus a reason comment, then step 14's veto window. **A pass never cancels an issue on the day it proposes it.**

    **13a. Retirement sweep.** List what retired since the last pass: a flag retired (its GA issue `Done`, its key gone from `origin/main`), a project moved to Completed or Canceled, a spec marked 🧊 or superseded in CLAUDE.md's Read-These table, a component or screen file deleted. Search open issues for each retired surface by every name it goes by: the flag key, the file and component names, and the spoken name (*Home v1*, *the Trend card*, *the Today strip*). Then sort each hit:

    | Verdict | Test | Action |
    |---|---|---|
    | Dies with the surface | Everything it asks for lives only on the retired surface; the file or symbol it names is gone from `origin/main` (check, per step 5) | `Propose close`, reason `obsolete`, naming the PR that retired it |
    | The idea carries over | The ask is a data, copy, clinical, accessibility or sync rule that the successor surface also has to honour, not a pixel on the old one | **Not a prune.** Comment restating it against the successor, and report the successor's project if that project is live; an attended pass makes the move |
    | Unclear | Neither test settles it | `Propose close`, reason `obsolete`, the comment naming what would keep it, so the veto is an easy call |

    **Before the retirement lands, mark; don't propose.** While an old surface still ships to anyone (a flag-off cohort, the build in the App Store or TestFlight), its bugs are live bugs. Comment `Dies at CUL-NNN` (the issue that retires it), and report the `relatedTo` for an attended pass to add (step 10: an unattended pass adds no relation); the first pass that finds that issue `Done` and its PR merged proposes the whole batch. Worked example: `design_v2` retires at D2-8 (CUL-1071). Until that merges, every account outside the beta sees Home v1, so CUL-1185 (v1's Today strip can show the previous pet's day under the new pet's name) is a live correctness bug, not a prune.

    **13b. Staleness decay.** An open issue that is **all** of: not Urgent or High; in no live project (none, Legacy Backlog, or a Completed or Canceled project); not updated in **60 days** (`updatedAt`) → `Propose close`, reason `stale`. Bulk label passes bump `updatedAt`, which makes this test fail toward keeping, never toward cancelling; that is the right direction. The comment says in one line what the issue asked for, so the PM can veto from the comment alone.

    **13c. Closed project leftovers.** When a project goes Completed or Canceled, sort each of its open issues: the live project it extends, or no project with an `Area: *` label (step 9), or `Propose close` (reason `obsolete` or `stale`). The moves are report lines an attended pass applies; the proposal is the write. No open issue stays in a closed project.

    **Never proposed, by any branch of this step:** `Gate: clinical` · `Gate: privacy` · `Area: Privacy/RLS` · a `Bug` or `Area: Correctness` issue on a surface still shipped to users · anything carrying `Waiting on PM` (it is a question, and step 12 drains it) · anything with a comment in the last **14 days**. Pets > $: a safety or data integrity issue leaves the board by being fixed or by a PM ruling, never by expiry.

    **The reason is one of four, on the comment's first line:** `obsolete` (the surface is retired; cite the PR) · `superseded by CUL-NNN` (another issue carries the work; if it merely restates it, use step 10's `Duplicate` instead) · `won't do` (conflicts with a principle or a ruling; cite it) · `stale` (13b). A fixed vocabulary is what lets step 15 count which kind of prune comes back.

    The comment, in this shape:

    > **Propose close — obsolete.** The Trend card leaves Home at D2-8 (#NNN); the Design v2 Home has none. Remove the `Propose close` label to keep this; otherwise the first grooming pass on or after **2026-10-09** cancels it, and it can be reopened any time. — Product Owner lens, grooming pass 2026-10-02

    Apply with `addLabels: ["Propose close"]`, never `labels` (see *Linear mechanics*). **Sign every comment** `— Product Owner lens, grooming pass <date>`: the MCP posts as the PM's own account, so the signature is the only thing that tells step 14 a pass's comment from a person's.

14. **Run the veto window.** List open issues labelled `Propose close`. For each, find its newest proposal comment (first line `**Propose close —`) and decide:

    | Found | Action |
    |---|---|
    | The window (**7 days** from the proposal comment) has passed, the label is still on, no comment after the proposal other than a grooming pass's own, and no exempt label from step 13 | → `Canceled`. Keep the label (it marks *how* the issue left, for step 15), and comment: `Canceled after the veto window (proposed <date>, reason <reason>). Reopen any time.` |
    | Any comment after the proposal by someone other than a grooming pass, or an exempt label added since | **Do not cancel.** Someone engaged, or the issue became a safety one; list it under *Needs PM decision* with the comment's first line or the label |
    | Window not yet passed | Leave it; list it with its cancel date |
    | The label is gone but a proposal comment exists | The PM kept it. **Never re-propose for the same reason.** Only a new retirement event (13a) reopens the question, and the new comment names that event |

    **Proposals made before this rule** (the 51 labelled from 2026-09-24 onward, whose reason sits in the newest comment) did not carry a cancel date when they were made. Their clock starts at the first pass that runs under this step: that pass posts one dated comment on each in the shape above (the reason copied from the old comment) and lists them all under *Prune* with their cancel date. Nobody's issue is cancelled on a clock they were never shown.

    The cancel is the only write in this step, and every input to it is an artifact: the label, the proposal comment's timestamp, and the absence of a later comment. That is why it sits in the boundary table's writable half. The label *add* in step 13 sits there too, on narrower grounds: it is the one judgment the table lets an unattended pass write, because it is a proposal (§ *What an unattended pass may WRITE*, *The one proposal*). Step 12's default apply is the same shape and sits there for the same reasons..

15. **Count the board.** Report, since the last pass: issues opened, issues closed (`Done` · `Canceled` · `Duplicate`), the net, and the open total. Then the prune line: proposed this pass, cancelled after the window, kept by the PM (label removed), and **reopened after a cancel** (an open issue carrying a `Canceled after the veto window` comment). The reopened count is the step's own check: if reopens pass **10%** of cancels over the trailing four passes, 13b is too aggressive. Raise the 60 days, and say so in the report rather than quietly. A pass that closes 20 while 60 arrive has not shrunk anything, and the count is what keeps a long *Applied* list from reading as progress.

    Then the **queue line**: the `Waiting on PM` total against the **cap of 30** and the **2026-09-27 baseline of 153**, the count in each of step 12's lanes, team calls made, defaults posted and applied, and **reversals** (a PM reply under a team call or an applied default that undoes it). That is step 12's own check: if reversals pass **10%** of team calls plus applied defaults over the trailing four passes, the lanes are too wide, so narrow them and say so in the report. **The kill criterion (CUL-1366, carried from the audit §7):** if the label total is not below the baseline six weeks after the first pass that runs step 12, the constraint is PM time, not process. Say that plainly, and do not add more process.

## Don't re-file the last pass's open calls

Each grooming pass leaves an outcome issue carrying the calls it deliberately stopped short of (CUL-719 is the 2026-08-29 one). **Read it first.** If its calls are still unruled, comment the new pass's outcome onto that issue rather than minting a second one — two grooming records competing for the same rulings is the drift this skill is supposed to remove.

## Linear mechanics that have bitten a pass before

- **`labels` REPLACES the whole label set; `addLabels` appends.** Always `addLabels` / `removeLabels`.
- **Linear's search index lags writes.** After a bulk pass, trust your write count, not a search that returns fewer.
- **`fields: ["id"]` on `list_issues`** makes a full-board sweep cheap enough to do properly; fetch descriptions only for the candidates you are actually judging.

## Hard rules

- **Do not invent scope.** Grooming reconciles and re-orders existing issues; it never adds new product scope. If grooming reveals a real decision, that belongs in CLAUDE.md → Open Questions, surfaced to the PM — NOT resolved by a status edit. (Filing a genuinely-new *deferral* as a new Linear issue is still proactive and fine — that's the Backlog Protocol; it's *scope decisions* that route to the PM.)
- **Do not re-prioritize against the PM's explicit ordering** without surfacing it as a question first.
- **Closing keeps the issue.** Move it to `Done` with a resolving PR/session reference; Linear keeps the record.
- **A cancel only ever follows an unvetoed `Propose close`** (steps 13–14). Never cancel on the day you propose, never past an exemption in step 13, and never to make the board count look better. Superseded the 2026-08 rule "never cancel an item just to clear the board" (PM, 2026-10-02, CUL-1448): pruning is now a step, and the veto window is its safety net.
- **The never-list is absolute** (step 12). A clinical, safety invariant, privacy, money, schema, App Store or irreversible item never gets a team call or a default, and an uncertain item counts as on the list. A pass quotes a team recommendation and never writes one.
- **A proposal is the only judgment a pass may write, and only in the shape the boundary table names.** `Propose close` from step 13's branches, reason `obsolete` or `stale`, announced with its cancel date; and a step 12 team call, posted as a default and applied only after its window. Never extend the exception by analogy: a `Quick Win`, a `Duplicate`, a priority, a project move or a team call applied on the day has no window between the write and its effect.
- **A convention collision is a PM ruling, not a sweep.** When two rules give one field two meanings (step 4), report it with a recommendation and leave the board alone.
- **The write boundary is the whole licence, not a default.** § What an unattended pass may WRITE lists every field edit an unattended run may make; anything absent from that table is a report line, *including anything elsewhere in this file phrased as an instruction*. Where a step and the table disagree, the table wins. A contradiction between the two is what CUL-922 was filed to end, so fix the step rather than following it.

## Output format

Two halves, and the split is the point: **Applied this pass** is the write log and every line in it ends in an artifact; **Reported, not applied** is everything else. A reviewer checks the boundary by reading the first half, without opening Linear.

```
## Backlog grooming (Linear) — <date>

### Evidence base
- preflight: PASS (<N> commits on origin/main, floor <N>) · <N> open PRs · deploy runs + holds read at <sha>

### Applied this pass
- CUL-NNN: In Progress → Done — PR #N, attachment + <closing keyword | claim comment names PR head branch>
- CUL-NNN: Todo → In Review — PR #N
- CUL-NNN: In Progress → Todo — abandoned claim, branch `claude/<slug>`, tip <ISO date>, no PR
- labels stripped: <N> Quick Win, <N> Waiting on PM — all on issues in state category completed/canceled/duplicate
(board accuracy, not a drain — see the boundary section before quoting the count)
- CUL-NNN: Propose close — <obsolete, #N | stale, updated <date> | obsolete, project <name> Completed>, cancels on <date>
- CUL-NNN: → Canceled — veto window closed, proposed <date>, reason <reason>, no later comment
- CUL-NNN: default applied → <Todo | Done>, Waiting on PM removed — posted <date>, no later comment, no never-list label

### Reported, not applied
**Quick win candidates** — <N> bodies read, <N> recommended: CUL-NNN, … · rejected: CUL-NNN (<PM call in body | options menu | scope | parked>)
**Merged but not deployed** — CUL-NNN: `<function>` still `pending` (hold: CUL-19 | CUL-557)
**Narrowed against the tree** — CUL-NNN: <what shipped elsewhere, what remains, at file:line>
**Priority, aged** — CUL-NNN: Urgent since <date>, no progress — recommend <Medium> because <why>
**Possible duplicates** — CUL-NNN ↔ CUL-MMM: <which framing to keep, and why>
**Contract** — CUL-NNN: <missing why | no project | …>
**Prune, not applied** — marked to die later: CUL-NNN → dies at CUL-MMM · waiting: CUL-NNN cancels on <date> · engaged, not cancelled: CUL-NNN (<comment's first line>) · recommended (superseded / won't do / Urgent-High dead): CUL-NNN (<reason>)
**Board count** — opened <N> · closed <N> (Done <N> / Canceled <N> / Duplicate <N>) · net <±N> · open total <N> · prune: proposed <N> · cancelled <N> · kept by PM <N> · reopened after cancel <N> · queue: Waiting on PM <N> (cap 30 · baseline 153) · team calls posted as defaults <N> · defaults applied <N> · reversed <N>
**PM queue** — not the PM's: suspected moot CUL-NNN (<artifact, and which step's row it would need>) · no PM step left CUL-NNN (<the work left>) · team calls posted as defaults: CUL-NNN (<persona>, <a|b|c>) applies <date> · defaults posted: CUL-NNN applies <date> · replied to, now docket: CUL-NNN · device sitting (next TestFlight cut): CUL-NNN <the check> · console: CUL-NNN <the task> · clinical docket: CUL-NNN <the ruling asked> (reviewer verdict: <pending | posted>) · docket, ranked: 1. CUL-NNN unblocks <N> (<what>) · 21 days untouched: CUL-NNN → <apply the default | close | escalate>
**Closed but unfinished** — CUL-NNN: <what it closed still carrying, and whether a successor holds it>
**In Progress, not swept** — CUL-NNN: <never claimed | blocked on the PM — which, and how you told>
**Blocks the Current Phase (<phase>)** — CUL-NNN <title>: <why it's relevant now>

### Needs PM decision
- <anything that's actually an Open Question, not a deferral>
```

Apply only what § What an unattended pass may WRITE permits — via `save_issue` / `removeLabels` / `addLabels: ["Propose close"]` — and log each one under **Applied this pass** with its artifact beside it. Everything else is a report line; route anything under "Needs PM decision" to the PM and to CLAUDE.md → Open Questions. The old justification for writing more broadly than this was *reversible and cheap*, and it is not one: the cost of a wrong write is the PM's trust in the board, not the API call.
