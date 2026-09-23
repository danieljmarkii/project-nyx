---
name: backlog-groomer
description: Use this skill to groom and reconcile Nyx's backlog in **Linear** (team Culprit, `linear.app/projectnyx`) — the operational procedure behind the Product Owner persona. Triggers include the PM asking to "groom the backlog", "reconcile the backlog", "clean up the backlog", "what's stale", "what are the quick wins", "find something small to pick up", or any session scan that needs to check Linear against reality; closing out a shipped item; or whenever a session record claims something shipped that Linear still lists as `Todo` / `In Progress`. Loads the reconciliation procedure: match issue status against merged PRs/commits AND open PRs AND the deploy ledger, fix stale statuses, clear abandoned claims, report aged high-priority items for re-prioritization, triage and label quick wins, audit recently-closed issues for unfinished business, and report near-duplicates for dedup — bounded by § What an unattended pass may WRITE, which lists the only field edits an unattended run may make and sends everything else to the report. Never invents scope (new product scope is a PM decision, routed to Open Questions, never a silent Linear edit). For the lens/judgment behind this procedure see the Product Owner persona in `docs/personas.md`; this skill is the how. Note: `docs/backlog.md` is frozen (migrated to Linear 2026-08-15) — this skill operates on Linear, not that file.
---

# Backlog Groomer (Linear)

The backlog lives in **Linear** (team **Culprit** — `linear.app/projectnyx`); `docs/backlog.md` is a frozen historical record (migrated 2026-08-15 — see CLAUDE.md § Backlog Protocol). This skill is the *procedure* the Product Owner runs to keep the Linear board honest. The lens is the Product Owner persona (`docs/personas.md`); this is the checklist. Use the Linear MCP tools throughout — `list_issues`, `get_issue`, `list_comments`, `save_issue`, `save_comment`. **`create_attachment` is not one of them:** an attachment is a commitment that merging a PR finishes an issue (CLAUDE.md § Git Workflow), it is clause 1's evidence, and a pass that mints its own evidence is measuring itself.

## Why this exists

The backlog drifts from reality in a specific, recurring way: an item ships in the codebase and gets narrated as "done" in a session record, but its issue in Linear stays `Todo` / `In Progress`. The native GitHub↔Linear integration closes this automatically **when a PR references the issue** (CLAUDE.md § Git Workflow → "Merge → Linear status") — but agent sessions run on `claude/<slug>` branches that don't reference the issue, so their merges can leave the status stale. Grooming closes that gap.

**That original drift is now largely solved, and the drift has moved.** Measured 2026-09-06 over the 26 PRs merged since the previous pass: every issue named in them was already `Done`. The claim protocol (CUL-624) plus `/wrap` step 4 are holding. What drifts *now* is `In Progress` (which means three different things), work that merged but was never deployed, and issues that closed carrying unfinished business. Steps 0–8 are ordered accordingly.

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

Everything below follows from that one sentence, and it is checkable **from the pass's own output** without opening Linear: every line under **Applied this pass** carries its artifact — a PR number, a branch name and its tip date, a state category. A written line with no artifact beside it is a visible protocol violation.

This table binds an **unattended** run — a scheduled Routine, `scripts/groom/apply.*`, any pass with no PM in the conversation. A pass run *with* the PM may go further, but it asks in that conversation and the answer is the authorisation. **The PM having scheduled the Routine is not that answer** — scheduling authorises the pass to run, and this table is what it authorises the pass to do.

**A comment is not a write.** The boundary governs *field* edits — `state`, `priority`, labels, `duplicateOf`, `parentId`, the description. Comments are how a pass reports, and every permitted write still carries its own one-line audit comment naming the artifact. Report-only findings go in the pass's report on the standing issue (§ Don't re-file the last pass's open calls) — not sprayed one comment per issue across the board.

| Step | Unattended | The artifact that determines it |
|---|---|---|
| 1 · merged work | → `Done` — attachment **plus** a second signal (clause 1, below) | the PR number, and which second signal |
| 2 · open PRs | → `In Review` | the PR number |
| 3 · deploy ledger | **report** | — "merged but not live, so not done" is a conclusion, not a field |
| 4 · abandoned claim | → `Todo` | the branch name **and its tip commit date**, plus no PR |
| 4 · never claimed · blocked on the PM | **report** | — absence of evidence is not evidence (L7); and a convention collision is a ruling |
| 5 · narrowed against the tree | **report** | — |
| 6 · `Quick Win` **add** | **report** | — the definition is *grabbable today*, and grabbability is a judgment that decays |
| 6 · dead-label **strip** | remove `Quick Win` / `Waiting on PM` — that set only | the issue's state category, `completed` or `canceled` |
| 7 · closed but unfinished | **report** | — whether it still needs a home is the PM's call |
| 8 · priority | **report** | — the aging is a fact; the re-rank is the PM's ordering |
| 9 · contract | **report** | — |
| 10 · dedup | **report** | — "these two are the same issue" is a sentence you wrote |
| 11 · what's relevant now | **report** | — |

**Clause 1 — why an attachment, and why an attachment alone is not enough.** The attachment is the artifact because it is what the integration acts on: on #806's merge the two issues carrying one moved to `Done`, while the four named in the body without one held their state and were never linked at all (CUL-803). **A bare mention is not evidence.** But an attachment is not proof of *intent*: a `CUL` **range** in a PR title creates an attachment on **both endpoints**, and #829's title read `… (CUL-919 … CUL-928)` — the integration attached and assigned both, and merging would have marked two issues `Done` with neither fix made (retro §2 F6, found live on the audit's own PR, after this rule was first drafted). So the clause is the attachment **and** a second signal of intent — and the second signal must tie the issue to **that PR**: a closing keyword naming the issue in that PR's title or body, **or** the issue's own claim comment naming that PR's head branch. The retro's draft said "or the issue already in a started state", and that is defeated by F6's own shape — a range title attaches an unrelated issue, and a session that claimed and died leaves it `In Progress` indefinitely, so ambient state plus a stray attachment closes it. A started state is ambient; a branch name and a keyword are artifacts. **And the pass may never mint the attachment it then reads as its own evidence** — attaching is `/wrap`'s job and a human's commitment (CLAUDE.md § Git Workflow); a detector that can author its own evidence is measuring itself.

**Expected yield of clause 1: approximately zero, and that is correct.** An attachment present at merge is exactly what makes the integration close the issue itself, so `{still open} ∩ {merged PR} ∩ {attachment}` is nearly empty by construction. Clause 1 is a **boundary**, not a detector — it exists to forbid closing on a bare mention. Written here up front so no later session widens it to make a pass look productive. Two consecutive passes (08-29, 09-06) already found zero status drift; that is the fixture working, not a pass underperforming.

**What the label strip is, and what it is not.** Stripping a needs-attention label from closed and cancelled issues is the highest-yield safe write on the board — ~70 dead `Quick Win` and ~5 dead `Waiting on PM` on pass one — and it fixes exactly one thing: *the board does not match reality*. **It does essentially nothing for queue length.** A first pass reports an impressive write count; that count is not a drain and must never be reported as one. (CUL-923's `Needs PM` state makes the `Waiting on PM` half of it unrepresentable rather than swept — which is the real fix, and the reason this sweep is not the win.)

## The grooming pass — run in order

Every step below is bounded by the table above. Where a step's prose and the table disagree, **the table wins.**

1. **Reconcile status against MERGED work.** Build the evidence base once and intersect it, rather than eyeballing:

   ```bash
   git log --oneline origin/main | grep -oE 'CUL-[0-9]+' | sort -u
   ```

   **`origin/main`, never `main`.** Nothing moves the local `main` branch — a fetch updates `origin/main` and leaves `main` frozen where the clone dropped it, and un-shallowing makes it *deeper*, not *newer*. Measured 2026-09-12, both refs after step 0: `main` 806 commits / `origin/main` 834 → **26 `CUL` ids invisible**, including CUL-871 / CUL-873 and the whole `vet_visits` track. Silent, as ever: `git log main | grep CUL-` still returns 151 ids, so the pass reads complete. **The fetch this block used to carry is gone because step 0 now does it unconditionally** (CUL-921) — so step 0 is not optional, and a non-zero exit from it means stop rather than continue on a stale ref.

   Intersect that set against the open-state issues (`list_issues` with `state` `unstarted`, `backlog`, `started` — `fields: ["id"]` keeps it cheap). Anything in both is a candidate. Move a genuinely-shipped issue to `Done` (`save_issue` `state`) **only where clause 1 of the boundary holds** — a Linear attachment from the merged PR *plus* a second signal of intent — and post a one-line outcome comment naming the PR and which second signal you found. **Never close without a resolving reference, and never create the attachment yourself in order to satisfy the clause.** A commit naming a `CUL` id with no attachment behind it is a **report** line, not a close. Expect most hits to be legitimately open — a track umbrella, a device-QA pass, a watch item — so check what the commit actually did before closing anything.

2. **Reconcile against OPEN PRs too.** A merged-PR scan cannot see work that exists only in an unmerged branch, and this repo has a deep open-PR queue (30 as of 2026-09-06, oldest from July). `list_pull_requests` with `state: open`, then match each PR's `CUL-NNN` to its issue: an issue whose work is sitting in an open PR is **`In Review`**, not `In Progress` and not `Todo`. Two issues were mis-stated this way on 2026-09-06 (CUL-319 → #704, CUL-530 → #668).

3. **Reconcile against the DEPLOY LEDGER.** Merged is not live. `git show origin/main:supabase/functions/deploy-manifest.json` — read it off the same ref as step 1, since the working tree is your own branch, not the record — says which Edge Functions are `deployed` versus `pending`, and both standing holds (CUL-19 `generate-report`, CUL-557 the per-incident chain) gate real user-visible work. An issue whose fix merged but whose function is `pending` is **not done** — and a cluster of separate "redeploy X" issues usually means one command discharges several of them (CUL-780 ↔ CUL-795 on 2026-09-06). Note the ledger guard cannot see a stale `status`, only a changed fingerprint (CUL-700), so read it rather than trusting CI's silence.

4. **Fix stale in-flight issues — `In Progress` means three different things.** Sort every `In Progress` issue into one of these, and treat them differently:

   | Shape | How to tell | Action |
   |---|---|---|
   | Genuinely in flight | An open PR, **or** a claim comment whose branch tip is ≤14 days old | Leave it |
   | Work in review | An open PR referencing it | → `In Review` (step 2) |
   | Abandoned claim | Claim comment names a branch whose **tip commit is >14 days old**; no open or merged PR references the issue; no later comment releases the claim **or says the issue is waiting on the PM** | → `Todo`, with a comment naming the branch **and its tip date**. The one write in this step |
   | Blocked on the PM | Title/label says the remainder is a device pass, a dashboard toggle, a ruling | **Surface, don't sweep** — see below |
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

   The **blocked-on-the-PM** row is a live convention collision, not a bug to fix silently: CUL-624 made `In Progress` mean *a session has claimed this*, and thirteen issues use it to mean *waiting on you*. Report it; let the PM rule. (CUL-923's `Needs PM` state is the structural fix.)

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

   **The strip is the write.** `removeLabels` **`Quick Win` or `Waiting on PM`** — that is the whole set, not an example of one — from every issue whose state category is `completed` or `canceled`. Never `Area: *`, never `Legacy`, never any other label: those describe what an issue *is* and stay true after it closes, while these two describe what someone should *do next* and cannot. The state category is the artifact and nothing is judged, which is what makes this the one label edit an unattended pass may make. Before reporting the count, read what the boundary section says it is worth: it is board accuracy, not a drain.

7. **Audit recently-CLOSED issues for unfinished business.** Grooming has always looked only at open issues, which misses a failure mode the tracker creates: per CLAUDE.md v1.32, a `create_attachment` closes its issue on merge, so an issue can go `Done` still carrying open decisions. Scan issues closed since the last pass for a title or body naming something unresolved, and check whether a successor issue actually carries it. CUL-810 closed `Done` while its own title named four unruled decisions (D1 / D6 / DB-3 / DB-4) that neither successor mentions. **Flag; do not re-open and do not file a replacement** — whether they still need a home is the PM's call.

8. **Re-evaluate aged priorities — report, never write.** Any Urgent/High issue open across multiple sessions without progress is one of: (a) genuinely blocked — state the blocker in a comment; (b) mis-prioritized — **recommend** the lower priority with a one-line why, and leave the field alone; (c) effectively dead — flag to the PM, don't silently cancel. Priority is the PM's ordering and no artifact determines it: the aging is a fact, the re-rank is a judgment. (This step used to instruct the write while Hard rules forbade it — the contradiction CUL-922 removed.) Watch for a cluster that shares **one** blocker: most of the Urgent tier waits on the single Dr. Chen sitting CUL-583 exists to schedule.

9. **Enforce the issue contract.** Every issue needs: a title, a plain-English `TL;DR` opener (PM directive 2026-08-26), a description that leads with **Why:** and names **Blocks:** (or `—`), a `priority`, a `project`, and a current `state`. Flag any issue missing the *why*.

10. **De-duplicate — report, never write.** Linear assigns IDs server-side, so there are no duplicate IDs to chase — the pass is *semantic*, and "these two are the same issue" is a sentence you wrote, not an artifact. Report near-duplicates with a recommendation on which framing to keep and why. **An unattended pass never sets `Duplicate` or `duplicateOf`, never folds one issue into another, and never adds `relatedTo`** — that is the PM's call, or an attended pass's on the PM's word. Two deploy issues asking for the identical command is the common shape here.

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
- **The write boundary is the whole licence, not a default.** § What an unattended pass may WRITE lists every field edit an unattended run may make; anything absent from that table is a report line, *including anything elsewhere in this file phrased as an instruction*. Where a step and the table disagree, the table wins. A contradiction between the two is what CUL-922 was filed to end, so fix the step rather than following it.

## Output format

Two halves, and the split is the point: **Applied this pass** is the write log and every line in it ends in an artifact; **Reported, not applied** is everything else. A reviewer checks the boundary by reading the first half, without opening Linear.

```
## Backlog grooming (Linear) — <date>

### Evidence base
- preflight: PASS (<N> commits on origin/main, floor <N>) · <N> open PRs · deploy ledger read at <sha>

### Applied this pass
- CUL-NNN: In Progress → Done — PR #N, attachment + <closing keyword | claim comment names PR head branch>
- CUL-NNN: Todo → In Review — PR #N
- CUL-NNN: In Progress → Todo — abandoned claim, branch `claude/<slug>`, tip <ISO date>, no PR
- labels stripped: <N> Quick Win, <N> Waiting on PM — all on issues in state category completed/canceled
(board accuracy, not a drain — see the boundary section before quoting the count)

### Reported, not applied
**Quick win candidates** — <N> bodies read, <N> recommended: CUL-NNN, … · rejected: CUL-NNN (<PM call in body | options menu | scope | parked>)
**Merged but not deployed** — CUL-NNN: `<function>` still `pending` (hold: CUL-19 | CUL-557)
**Narrowed against the tree** — CUL-NNN: <what shipped elsewhere, what remains, at file:line>
**Priority, aged** — CUL-NNN: Urgent since <date>, no progress — recommend <Medium> because <why>
**Possible duplicates** — CUL-NNN ↔ CUL-MMM: <which framing to keep, and why>
**Contract** — CUL-NNN: <missing why | no project | …>
**Closed but unfinished** — CUL-NNN: <what it closed still carrying, and whether a successor holds it>
**In Progress, not swept** — CUL-NNN: <never claimed | blocked on the PM — which, and how you told>
**Blocks the Current Phase (<phase>)** — CUL-NNN <title>: <why it's relevant now>

### Needs PM decision
- <anything that's actually an Open Question, not a deferral>
```

Apply only what § What an unattended pass may WRITE permits — via `save_issue` / `removeLabels` — and log each one under **Applied this pass** with its artifact beside it. Everything else is a report line; route anything under "Needs PM decision" to the PM and to CLAUDE.md → Open Questions. The old justification for writing more broadly than this was *reversible and cheap*, and it is not one: the cost of a wrong write is the PM's trust in the board, not the API call.
