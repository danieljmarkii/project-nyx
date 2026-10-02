---
name: backlog-groomer
description: Use this skill to groom and reconcile Nyx's backlog in **Linear** (team Culprit, `linear.app/projectnyx`) — the operational procedure behind the Product Owner persona. Triggers include the PM asking to "groom the backlog", "reconcile the backlog", "clean up the backlog", "what's stale", "what are the quick wins", "find something small to pick up", or any session scan that needs to check Linear against reality; closing out a shipped item; or whenever a session record claims something shipped that Linear still lists as `Todo` / `In Progress`. Loads the reconciliation procedure: match issue status against merged PRs/commits AND open PRs AND the deploy runs and holds, fix stale statuses, clear abandoned claims, re-prioritize aged high-priority items, triage and label quick wins, audit recently-closed issues for unfinished business, dedupe near-duplicate issues, and prune what no longer belongs (retired surfaces, stale low-priority issues, closed-project leftovers) through a `Propose close` label and a 7-day veto window, and drain the `Waiting on PM` queue through six lanes (team calls under the PM's decision rights, a 72-hour default window, the device sitting, the clinical and product dockets) — without inventing scope (new product scope is a PM decision, routed to Open Questions, never a silent Linear edit). For the lens/judgment behind this procedure see the Product Owner persona in `docs/personas.md`; this skill is the how. Note: `docs/backlog.md` is frozen (migrated to Linear 2026-08-15) — this skill operates on Linear, not that file.
---

# Backlog Groomer (Linear)

The backlog lives in **Linear** (team **Culprit** — `linear.app/projectnyx`); `docs/backlog.md` is a frozen historical record (migrated 2026-08-15 — see CLAUDE.md § Backlog Protocol). This skill is the *procedure* the Product Owner runs to keep the Linear board honest. The lens is the Product Owner persona (`docs/personas.md`); this is the checklist. Use the Linear MCP tools throughout — `list_issues`, `get_issue`, `save_issue`, `save_comment`, `create_attachment`.

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

## The grooming pass — run in order

1. **Reconcile status against MERGED work.** Build the evidence base once and intersect it, rather than eyeballing:

   ```bash
   git log --oneline origin/main | grep -oE 'CUL-[0-9]+' | sort -u
   ```

   **`origin/main`, never `main`.** Nothing moves the local `main` branch — a fetch updates `origin/main` and leaves `main` frozen where the clone dropped it, and un-shallowing makes it *deeper*, not *newer*. Measured 2026-09-12, both refs after step 0: `main` 806 commits / `origin/main` 834 → **26 `CUL` ids invisible**, including CUL-871 / CUL-873 and the whole `vet_visits` track. Silent, as ever: `git log main | grep CUL-` still returns 151 ids, so the pass reads complete. **The fetch this block used to carry is gone because step 0 now does it unconditionally** (CUL-921) — so step 0 is not optional, and a non-zero exit from it means stop rather than continue on a stale ref.

   Intersect that set against the open-state issues (`list_issues` with `state` `unstarted`, `backlog`, `started` — `fields: ["id"]` keeps it cheap). Anything in both is a candidate. Move a genuinely-shipped issue to `Done` (`save_issue` `state`), attach the PR if it isn't linked, and post a one-line outcome comment naming the PR. **Never close without a resolving reference.** Expect most hits to be legitimately open — a track umbrella, a device-QA pass, a watch item — so check what the commit actually did before closing anything.

2. **Reconcile against OPEN PRs too.** A merged-PR scan cannot see work that exists only in an unmerged branch, and this repo has a deep open-PR queue (30 as of 2026-09-06, oldest from July). `list_pull_requests` with `state: open`, then match each PR's `CUL-NNN` to its issue: an issue whose work is sitting in an open PR is **`In Review`**, not `In Progress` and not `Todo`. Two issues were mis-stated this way on 2026-09-06 (CUL-319 → #704, CUL-530 → #668).

3. **Reconcile against DEPLOYS.** Since CUL-1147, merged is live unless the function is held or its deploy failed. Read the holds off the same ref as step 1 (`git show origin/main:supabase/functions/deploy-manifest.json` — the working tree is your own branch, not the record), and the latest **Deploy Edge Functions** runs on `main` (GitHub MCP `actions_list` → `list_workflow_runs`, resource `edge-deploy.yml`): a red run means a function is owed, and its summary names which. An issue whose fix merged into a **held** function is **not done** until the hold lifts. A "redeploy X" or "PM deploys from the Codespace" issue filed before 2026-09-24 is usually discharged by the first run after its merge: close it with that run as the reference.

4. **Fix stale in-flight issues — `In Progress` means three different things.** Sort every `In Progress` issue into one of these, and treat them differently:

   | Shape | How to tell | Action |
   |---|---|---|
   | Genuinely in flight | An open PR, **or** a claim comment whose branch tip is ≤14 days old | Leave it |
   | Work in review | An open PR referencing it | → `In Review` (step 2) |
   | Abandoned claim | Claim comment names a branch whose **tip commit is >14 days old**; no open or merged PR references the issue; no later comment releases the claim | → `Todo`, with a comment naming the branch **and its tip date** |
   | Blocked on the PM | Carries `Waiting on PM`, or the title/body says the remainder is a device pass, a dashboard toggle, a ruling | → `Todo`, keeping (or adding) `Waiting on PM`, with a comment saying the label now carries the wait — see below |
   | Never claimed, never started | No claim comment, no branch, no PR, weeks old | → `Todo`, with a comment saying what was verified |

   **Read the claim comment, not the status** (`/kickoff` step 0 — `**Claimed** — branch …`): it names the branch and the UTC time. Status alone names no branch and cannot distinguish any of these.

   **The abandoned-claim row used to test whether the branch still EXISTED, and so could never fire** (CUL-921; retro §2 F2). Measured 2026-09-12: **790 of 800 remote heads are `origin/claude/*`** — claim branches are never pruned, so `git ls-remote origin <branch>` always finds something and the row returned "not abandoned" for every issue on the board, indistinguishable from a clean one. This is the audit's most generalizable law: **a detector whose only evidence is the existence of a ref, a file or a label is not a detector.**

   So judge the branch's **tip date**, which requires no fetch:

   ```bash
   git ls-remote origin "refs/heads/<branch>" | cut -f1     # the tip SHA, or empty
   ```

   Then read that SHA's committer date with `mcp__github__get_commit` — an API read, so it leaves the object store alone. The git-only fallback is `git fetch --depth=1 origin <branch> && git log -1 --format=%cI FETCH_HEAD`, and note the side effect: **a `--depth=1` fetch writes a new root into `.git/shallow`** while leaving `origin/main` whole, which is exactly why step 0's assertion (a) asks whether the boundary is on `origin/main` rather than whether `.git/shallow` exists.

   **A missing ref is now the rarer signal, not the rule** — if `ls-remote` does come back empty, the branch was deleted by hand, which is still abandonment; say which of the two you found.

   **Three rows, one population — read them in table order and stop at the first match.** The rows below "work in review" are not mutually exclusive on their face, and the wrong order sweeps a PM-blocked issue to `Todo`: CUL-425 has no claim comment and is weeks old (the *never claimed* row) and its own newest comment says "leaving **In Progress**, blocked on the PM UI action" (the *blocked-on-the-PM* row, which wins). Likewise CUL-847 carries a claim comment **and** a later comment releasing that claim while the issue waits on rulings — a released claim is not an abandoned one.

   The **blocked-on-the-PM** row used to be a convention collision: CUL-624 made `In Progress` mean *a session has claimed this*, and issues used it to mean *waiting on you*. **Ruled 2026-10-02 (PM, CUL-1448): "waiting on the PM" stays a LABEL, not a workflow state** (CUL-923's `Needs PM` state was declined). So the two questions ride two fields: the status says whether a session holds the issue, the label says whether you owe it something. A live claim blocked mid-build keeps `In Progress` *and* gets the label (row 1 catches it first); a PM-blocked issue with no live claim is `Todo` plus the label.

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

   Apply with **`addLabels: ["Quick Win"]`** — never `labels`, which replaces the whole set and would silently strip `Waiting on PM` / `Legacy` / `Area: *` across the board.

7. **Audit recently-CLOSED issues for unfinished business.** Grooming has always looked only at open issues, which misses a failure mode the tracker creates: every `CUL-NNN` a PR names goes `Done` when it merges (CLAUDE.md § Merge → Linear status, CUL-1397), so an issue can go `Done` still carrying open decisions. Scan issues closed since the last pass for a title or body naming something unresolved, and check whether a successor issue actually carries it. CUL-810 closed `Done` while its own title named four unruled decisions (D1 / D6 / DB-3 / DB-4) that neither successor mentions. **Flag; do not re-open and do not file a replacement** — whether they still need a home is the PM's call.

8. **Re-evaluate aged priorities.** Any Urgent/High issue open across multiple sessions without progress is one of: (a) genuinely blocked — state the blocker in a comment; (b) mis-prioritized — lower its `priority` with a one-line why; (c) effectively dead — `Propose close` with a reason (step 13), so the veto window decides; never cancel it outright. Watch for a cluster that shares **one** blocker: most of the Urgent tier waits on the single Dr. Chen sitting CUL-583 exists to schedule.

9. **Enforce the issue contract.** Every issue needs: a title, a plain-English `TL;DR` opener (PM directive 2026-08-26), a description that leads with **Why:** and names **Blocks:** (or `—`), a `priority`, an `Area: *` label, and a current `state`. Flag any issue missing the *why*.

   **A project is NOT part of the contract** (PM, 2026-09-26, CUL-1284). An issue joins a live project only when it extends that project's work; a standalone issue takes no project, and that is correct, not a gap. Requiring one is what turned Legacy Backlog into a dumping ground: 153 issues filed natively after the cutover landed there because it was the only "neutral" home. The `Area: *` label is what keeps a project-less issue findable, so that is the field to enforce.

   **Strip dead queue labels.** `Waiting on PM` and `Quick Win` each say what someone should *do next*, so both go false when the issue closes, and a label does not leave by itself (the reason CUL-923 wanted a state). Every pass lists issues in a completed, canceled or duplicate state carrying either one and removes it with `removeLabels`. Exactly those two: every other label says what an issue *is* and stays, and `Propose close` stays on a pruned issue on purpose (step 14).

   **Legacy Backlog is closed to new issues.** It holds the rows migrated from `docs/backlog.md` (CUL-28 → CUL-514, label `Legacy`) and nothing else. Every pass lists open issues in that project created after 2026-08-16 (`list_issues` with `project: "Legacy Backlog"` and `createdAt: "2026-08-16"`) and moves each to the live project it extends, or to no project with an `Area: *` label. Closed ones stay where they are. A non-empty list means a session broke the rule, so name the issues in the report.

10. **De-duplicate.** Linear assigns IDs server-side, so there are no duplicate IDs to chase — the pass is *semantic*. If an issue restates an existing one, prefer linking them (`relatedTo`) or folding one into the other over leaving two live. Flag near-duplicates to the PM with a recommendation on which framing to keep; mark a true duplicate with the `Duplicate` state (or `duplicateOf`). Two deploy issues asking for the identical command is the common shape here.

11. **Surface what's relevant now.** List any issue whose project is a live build-track (`list_projects`, or `STATUS.md`'s Current phase table), plus any stale Urgent/High issues, at the top of your report.

12. **Drain the PM queue** (PM rulings 2026-09-27 and 2026-10-02, CUL-1366). The queue is the **`Waiting on PM` label**, not a workflow state (CUL-923's `Needs PM` was declined). It went 10 → 97 → 153 between Aug 20 and Sep 27, and a measured read of every item found most of it was not waiting on a decision. Steps 1–11 fix what the board *says*, and this step is what makes the queue *shorter*. It never authors a recommendation and never rules a real product call. It sorts, quotes and prepares.

    List every open issue carrying the label (`list_issues` `label: "Waiting on PM"`, `fields: ["id", "title", "labels", "updatedAt"]`). Then **read each description and its newest comments**. Step 6's measurement holds here too: the title does not tell you which lane an item is in.

    **The never-list, which is absolute.** Clinical · a safety invariant (intake is not preference, n=1 never reassures) · privacy / RLS / Storage / deletion / export / share links · money or Pets > $ (a gate, a cap, a paywall, an entitlement) · schema · App Store · anything irreversible. An item is on it when it carries `Gate: clinical`, `Gate: privacy` or `Area: Privacy/RLS`, **or** when its body touches any of these. **Uncertain counts as on the list.** A never-list item cannot enter the team call or the default lane, whatever else it is.

    **Sort each item into the first lane that matches, read in this order:**

    | Lane | Test | Action |
    |---|---|---|
    | **Not the PM's** | An artifact shows it is moot (the PR that shipped it, the deploy run that discharged it, the issue it duplicates), **or** its own body says nothing is left for the PM | Moot → close it with the artifact on the comment's first line (`Done` or `Duplicate`, per steps 1, 3 and 10). Work with no PM step → `removeLabels: ["Waiting on PM"]`, leave it in `Todo`, and comment what the remaining work is. **Only suspected moot → a report line, not a close.** |
    | **Device** | The remainder is an on-device check, or a console task only the PM can do (a dashboard toggle, an App Store Connect form, a secret) | Leave it. List it on the sitting for the **next TestFlight cut**, grouped by build: device checks first, console tasks after them. Ruling 3 is one device sitting per cut, so an item whose PR is not in a TestFlight build yet waits for the next cut. |
    | **Clinical** | On the never-list as clinical or a safety invariant, and asking for a ruling | Leave it. List it on the clinical docket. The session that prepares the docket runs **one `adversarial-reviewer` pass per item** and posts its verdict on the issue before the sitting (ruling 4), not on every pass. CUL-583's batch is folded into this docket, so it gets no separate sitting. |
    | **Team call** | Off the never-list, no persona conflict, and the call is one of ruling 1's three: **(a)** copy that stays inside `nyx-voice` · **(b)** UX detail inside a spec or mock round the PM already ratified (cite the section or round) · **(c)** a doc edit that only matches shipped code (cite the PR) | The owning persona makes the call (the Designer with `nyx-voice` loaded for (a) and (b), the Engineer for (c)). Comment it in the shape below, `removeLabels: ["Waiting on PM"]`, and leave the issue `Todo` if carrying it out is work, or `Done` if the call was the whole ask. **Not granted:** "a written rule already settles it". A persona conflict stays on the docket even when a principle answers it. |
    | **Default** | Off the never-list, low risk, and **the issue already carries a team recommendation** that the pass can quote | Post the default comment below and keep the label. The window is **72 hours** from that comment (ruling 2). |
    | **Docket** | Everything else: high risk, no recommendation, a persona conflict, a scope decision | Leave it. Prepare a decision brief (CLAUDE.md § Presenting decisions to the PM) and rank it by **what it unblocks**: issues that list it as a blocker, then tracks that name it, with ties broken by age. |

    The two comment shapes, each signed so step 14's rule can tell a pass from a person:

    > **Team call (Designer), under the 2026-09-27 decision rights (a).** The empty state reads "Nothing logged yet today". It stays inside nyx-voice and the copy pack has the same register. The PM can reverse this any time by replying here. — Product Owner lens, grooming pass 2026-10-09

    > **Default, applies 2026-10-12.** The team's recommendation in the description: keep the chip order as shipped. Low risk under ruling 2, and on no line of the never-list. Reply here to veto or change it; otherwise the first grooming pass on or after 2026-10-12 applies it, and it stays reversible after that. — Product Owner lens, grooming pass 2026-10-09

    **Running the default window.** This works like step 14's veto window, and the same evidence decides it. On the first pass on or after the apply date: if the label is still on, no comment other than a grooming pass's own has landed since, and no never-list label has been added, then **apply it**. Comment `**Default applied** (posted <date>, no reply). <the call>. Reverse any time.`, remove the label, and set `Todo` or `Done` as for a team call. Any other comment → do not apply; the item moves to the docket with that comment's first line. 72 hours is a floor, not a schedule: a weekly pass applies on its next run.

    **21 days untouched.** When an item's newest comment from anyone other than a grooming pass is older than **21 days** (comments, not `updatedAt`, which bulk label passes bump), the report carries one proposal for it: apply the default (when the default lane is open to it), close it (with the lane's evidence), or escalate it (to the top of the docket). Whichever lane it sits in, it does not sit silently.

    **Cadence (ruling 3).** Two 30-minute docket sessions a week, plus one device sitting per TestFlight cut. The pass that falls before a session prepares that session's docket in advance: the clinical items with their reviewer verdicts, then the docket briefs in rank order, as many as fit 30 minutes. The rest carry forward in rank order.

    **The write boundary.** Closing an item on its artifact and applying a default after its window both rest on artifacts (a PR, a run, a comment's timestamp, the absence of a later comment). When CUL-922's write table lands, they go in its writable half on those grounds. The lane sort, a team call and posting a default are judgments, and they follow the table's rule for judgments.

13. **Prune what no longer belongs on the board** (PM ruling 2026-10-02, CUL-1448). Steps 1–12 keep the board *true*; this step keeps it *small*. Nothing else in the procedure removes an issue, and a board with a mandated add and no mandated remove only grows (retro 2026-09, L1). Every prune goes through one door: the `Propose close` label plus a reason comment, then step 14's veto window. **A pass never cancels an issue on the day it proposes it.**

    **13a. Retirement sweep.** List what retired since the last pass: a flag retired (its GA issue `Done`, its key gone from `origin/main`), a project moved to Completed or Canceled, a spec marked 🧊 or superseded in CLAUDE.md's Read-These table, a component or screen file deleted. Search open issues for each retired surface by every name it goes by: the flag key, the file and component names, and the spoken name (*Home v1*, *the Trend card*, *the Today strip*). Then sort each hit:

    | Verdict | Test | Action |
    |---|---|---|
    | Dies with the surface | Everything it asks for lives only on the retired surface; the file or symbol it names is gone from `origin/main` (check, per step 5) | `Propose close`, reason `obsolete`, naming the PR that retired it |
    | The idea carries over | The ask is a data, copy, clinical, accessibility or sync rule that the successor surface also has to honour, not a pixel on the old one | **Not a prune.** Comment restating it against the successor, and move it to the successor's project if that project is live |
    | Unclear | Neither test settles it | `Propose close`, reason `obsolete`, the comment naming what would keep it, so the veto is an easy call |

    **Before the retirement lands, mark; don't propose.** While an old surface still ships to anyone (a flag-off cohort, the build in the App Store or TestFlight), its bugs are live bugs. Comment `Dies at CUL-NNN` (the issue that retires it) and add it as `relatedTo`; the first pass that finds that issue `Done` and its PR merged proposes the whole batch. Worked example: `design_v2` retires at D2-8 (CUL-1071). Until that merges, every account outside the beta sees Home v1, so CUL-1185 (v1's Today strip can show the previous pet's day under the new pet's name) is a live correctness bug, not a prune.

    **13b. Staleness decay.** An open issue that is **all** of: not Urgent or High; in no live project (none, Legacy Backlog, or a Completed or Canceled project); not updated in **60 days** (`updatedAt`) → `Propose close`, reason `stale`. Bulk label passes bump `updatedAt`, which makes this test fail toward keeping, never toward cancelling; that is the right direction. The comment says in one line what the issue asked for, so the PM can veto from the comment alone.

    **13c. Closed project leftovers.** When a project goes Completed or Canceled, sort each of its open issues: move it to the live project it extends, or to no project with an `Area: *` label (step 9), or `Propose close` (reason `obsolete` or `stale`). No open issue stays in a closed project.

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

    The cancel is the only write in this step, and every input to it is an artifact: the label, the proposal comment's timestamp, and the absence of a later comment. When CUL-922's write table lands, it belongs in the table's writable half on those grounds; the label *add* in step 13 is a judgment and follows the table's rule for judgments.

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
- **A convention collision is a PM ruling, not a sweep.** When two rules give one field two meanings (step 4), report it with a recommendation and leave the board alone.

## Output format

```
## Backlog grooming (Linear) — <date>

### Evidence base
- full history: <N> commits (un-shallowed) · <N> open PRs · deploy runs + holds read

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

### Prune
- proposed: CUL-NNN (obsolete, #N) · CUL-NNN (stale) · …
- marked to die later: CUL-NNN → dies at CUL-MMM
- cancelled after the window: CUL-NNN (proposed <date>, <reason>)
- waiting: CUL-NNN cancels on <date> · engaged, not cancelled: CUL-NNN (<comment's first line>)

### Board count
- opened <N> · closed <N> (Done <N> / Canceled <N> / Duplicate <N>) · net <±N> · open total <N>
- prune: proposed <N> · cancelled <N> · kept by PM <N> · reopened after cancel <N>
- queue: Waiting on PM <N> (cap 30 · baseline 153) · team calls <N> · defaults posted <N> / applied <N> · reversed <N>

### PM queue
- not the PM's: closed CUL-NNN (<artifact>) · label removed CUL-NNN (<the work left>) · suspected moot CUL-NNN (<why>)
- team calls: CUL-NNN (<persona>, <a|b|c>): <the call>
- defaults: posted CUL-NNN applies <date> · applied CUL-NNN · replied to, now docket CUL-NNN
- device sitting (next TestFlight cut): CUL-NNN <the check> · console: CUL-NNN <the task>
- clinical docket: CUL-NNN <the ruling asked> (reviewer verdict: <pending | posted>)
- docket, ranked: 1. CUL-NNN unblocks <N> (<what>) · 2. …
- 21 days untouched: CUL-NNN → <apply the default | close | escalate>

### Blocks the Current Phase (<phase>)
- CUL-NNN <title> — <why it's relevant now>

### Needs PM decision
- <anything that's actually an Open Question, not a deferral>
```

Apply the status / label / dedup edits directly in Linear via the MCP (`save_issue`) — reversible and cheap. Route anything in "Needs PM decision" to the PM and to CLAUDE.md → Open Questions.
