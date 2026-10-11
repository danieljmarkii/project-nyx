# Workflow retro 4: dispatch found more work than it finished

**Date:** 2026-10-11 · **Issue:** CUL-1858 · **Status:** 🧊 dated record (correct it additively, never in place)
**Covers:** Engines v3 from dispatch v1 (9/28) to the re-scope (10/10), and the workflow around dispatch as it stands on 10/11.
**Evidence:**
- All 202 issues ever in Engines v3 or v3.1, each classified by origin, with its filer rebuilt from the session records (Linear attributes every agent write to the PM's account).
- 146 `/dispatch run` status updates, 57 launches resolved to their rows, and 74 merged Engines PRs since 9/28.
- 68 Engines v3 session records (55 of them dispatched children), read for what each filed and why.
- Four follow-up rows traced end to end through the dispatcher's own updates.
- A repo-wide process audit: sizes, churn, ceremony, duplication.
- A web research pass. Every source quoted here was re-opened on 10/11 and the quote checked against the page.

Prior retros: `docs/workflow-retro-2026-07.md`, `docs/workflow-retro-2026-09.md` (its laws L1 to L7 are cited below), `docs/dispatch-retro-2026-10.md` (retro 3, CUL-1606).

## TL;DR

**Dispatch did what its spec says, and its spec turns every finding into work.**
- The run order had 47 rows when dispatch started on 9/28. It has 85 now. 29 of the 38 rows added since came from follow-ups that sessions filed mid-build.
- From 9/28 to 10/3, 29 of 34 Engines merges were planned rows. From 10/5 to 10/9, 19 of 24 were follow-up rows.
- 28 follow-up rows shipped. Six were on the path to v3.0, and five of those six were scope PR-27 had deferred, not new findings.
- In 13 days, 151 issues were born and 92 closed. Open issues went from 40 to 99.

**The scarce resource was your decisions, not session slots.**
- A traced follow-up row asked you for 3 to 7 typed decisions: a ruling, `add`, `go`, a plan go, `apply`, `merge`.
- Follow-ups filled the "waiting on you" sub-limit (3 or 4 of 3 in 8 of 10 readings on 10/8 and 10/9) while the rulings that held the core aged: W3 to W7 since 9/28, D1 to D8 since 9/24.
- Retro 3 raised the cap from 3 to 6 on 10/6. The core was held on your rulings, so the new slots went to follow-ups.

**You had built the valve; dispatch never read it.** "Follow-ups go to Wave 7 by default" (10/9) lived only as prose on the Engines page. No child prompt carried it, and dispatch's offer of new issues reads page text, never milestones. Retro 2's L1 and L2 again: a mandated add with no mandated remove, and a rule enforced by prose.

**The triage ran backwards.** CUL-1438, a live false-reassurance defect in the shipped Signal, has sat in Wave 7 since 9/30: an "improving" card when an owner stops logging vomits but keeps logging meals. Over the same days, 22 off-path follow-up rows shipped, most of them in code no owner can reach yet.

**The fix is one door, not another queue.** Keep flagging everything. A finding becomes a row only through a `Live harm` label or a `blocks` relation to a row on the goal's path. Everything else parks, is counted, and asks you nothing until it is pulled. Section 5 has the design, section 8 the decisions, and section 9 four things to do today.

---

## 1. What happened

| Measure | Value | Source |
|---|---|---|
| Run-order rows | 47 on 9/28 (11 with a letter) → 85 on 10/11, +81% (46 with a letter; 27a to 27p alone is 16) | the page; the dispatch v1 dry run |
| Rows added mid-flight | 38. 29 from follow-ups, 7 planned splits or go-live rows, 2 older issues pulled in. You approved 35 through dispatch (26 `add`, 9 `fix`) | status updates |
| Skips | 19, in one reply on 10/9 | status update, 10/9 |
| Issues born and closed, 9/28 to 10/10 | 151 born, 92 closed; open went from 40 to 99 (peak 102 on 10/9) | Linear |
| Where the 151 came from | 97 follow-ups (80 new findings, 17 deferred scope) · 33 carrying rows · 19 asking you · 2 other | Linear, classified by hand |
| Who filed them | dispatched children 84 · the dispatcher 12 · hand-launched sessions 52 · unknown 3 | rebuilt from session records |
| New issues per merged PR | 2.04 overall; 1.31 follow-ups | Linear × GitHub |
| Merge mix | 9/28 to 10/3: 29 of 34 planned rows. 10/5 to 10/9: 19 of 24 follow-up rows | GitHub |
| Follow-up rows shipped | 28. Six on the v3.0 path (27m, 27n, 27o, 27p and 30a were deferred PR-27 scope; 30c was the one new finding) | page × Linear |
| Where the 97 follow-ups are now | 33 done, 2 duplicates, 2 open in v3, 60 open in v3.1 (43 in Wave 7). The 62 open include 15 High or Urgent and 5 `Gate: clinical`; 86 of the 97 carry no label | Linear |
| Dispatcher activity | 13 status updates from 9/28 to 10/4; 137 from 10/5 to 10/10 (38 on 10/8 alone) | Linear |
| Dispatcher context at hand-off | about 459K, 728K and 679K tokens, and one found idle at 474K. The rule: ~400K, lowered to ~150K on 10/8 | status updates |
| Your queue | 87 open `Waiting on PM` on 10/11 (78 `Todo`, 6 started, 3 `Backlog`) against a cap of 30; 10 from Engines | Linear |

**Per session, a hand-launched session filed about as much as a dispatched child** (23 issues over 12 hand-launched records against 87 over 55 dispatched ones). The source is the rule to file every leftover; dispatch multiplied the number of sessions it ran under.

## 2. Why it happened: seven mechanisms

**M1 · The child prompt mandates the add, and nothing offers "later".** Every child is told: "New work you find is filed as an issue (in this project, its parent or description naming <CUL-NNN>)" (`dispatch.md` step 5). Step 1 then offers each issue with no row as a candidate, every run, "until it is added or skipped". Your verbs were `add` and `skip`, and `skip` reads as dropping a real defect. You approved 35 additions one at a time and skipped 19 in a single batch, once, on 10/9. This is retro 2's L1 rebuilt inside the run order.

**M2 · The valve you built was prose, so it never fired.** On 10/7 you made the milestone *Wave 7 · Found along the way*. On 10/9 you ruled: "Follow-ups go to Wave 7 by default ... It joins the run order only if it blocks a core row ... or a key's go-live." Both live only on the Engines page. Nothing in `dispatch.md`, `wrap.md`, CLAUDE.md, the groomer or `scripts/dispatch/` mentions either. A child receives only its own row's build note, so the sessions doing the filing never saw the rule, and step 1's offer reads page text and `Skipped` comments, never milestones. Retro 2's L2: prose fires approximately never.

**M3 · New slots went to whatever was ready, and only follow-ups were.** On 10/5 the slot line read "3 − … = 0. PR-27b and PR-23a ready, over the cap". From 10/7 it read "6 − …". The core rows were held on your rulings, so the extra capacity went to follow-ups: 27 launches from 10/8 to 10/10, 24 of them letter rows. Retro 3 measured that ready rows waited 69% of the time with a slot free; the cap was never the constraint, so raising it added work in progress rather than progress.

**M4 · Each follow-up row spends your decisions, so findings competed with the core for the one scarce thing.** Traced through the dispatcher's own updates:

| Row | What it asked of you | What it filed next |
|---|---|---|
| PR-27g (CUL-1668), 10/8 | a ruling ("yes") · `add` · `go 27g` · a plan go (migration) · `apply 088` · `merge #1115` | CUL-1671, ruled and added as 27h 12 minutes after the merge |
| PR-23g (CUL-1663), 10/8 | two conflicting rulings recorded 8 seconds apart, then `expire` confirmed · `add` · `go` · a plan go (clinical) · a Bash permission prompt that stalled it for 9 hours | CUL-1667, added as 23h |
| PR-27i (CUL-1680), 10/8 | `add` · `go` · a plan go (clinical) | CUL-1682, added as 27j 8 minutes after the merge |
| PR-30s (CUL-1725), 10/9 | `add` · `go` · a plan go (clinical, though the script read the row as routine) · a ruling (I5 = A) | nothing |

The children's records count about 100 in-session asks across 55 sessions: 16 migration applies, 17 plan approvals, about 31 rulings mid-build, about 10 merges. The dispatcher's `add`, `go` and ruling turns come on top. Meanwhile W3 to W7 (CUL-1390) waited from 9/28 and D1 to D8 with E-4 (CUL-1146) from 9/24, and both moved to v3.1 unruled.

**M5 · Features that store a decision were discovered one stale path per PR.** `may_wait` began as a fork. CUL-1611's own brief offered option B, keeping the louder "call an emergency clinic" line, which "closes this issue", against option A, a server-side `may_wait` fact, forecast as "a migration and a server change, each in its own PR", plus the client render. A was ruled at 23:47Z on 10/6. It took nine rows (27c, 27e, 27f, 27g, 27h, 27i, 27j, 27l, with 27b upstream) and six migration files in three days, about a quarter of the children's in-session asks. Each child found the next way a stored "may wait" could go stale and filed it; the next row found the one after. The EN-9 raised-again latch did the same (23b, 23c, 23g, 23h). Of the 17 letters born from reviews, 12 came from these two features. None of the `may_wait` rows is named in PR-41's After list, the v3.0 go-live. The repo already has the lesson for code (C-38: "ask of any relational guard: what else can move?"); nothing applies it to filing, and nobody re-posed the fork when the fourth row appeared.

**M6 · Code no owner can reach got live-code rigor.** The PR-23 summary cascade (23a, 23d, 23e, 23f) hardened a path its own record called "Inert today", until you ruled safety summaries template-only. `pr27i`: "Latent today. Nothing reads may_wait yet." The latch cascade worked on EN-9 code whose go-live was already held by the harness (0.93 against a 5% cap). The two-pass cap you set on 10/10 limits passes per PR; it does not decide which PRs run, and its rule "file the rest" turns review time into issue count unless intake changes too.

**M7 · Done means absorbed the findings.** The pre-re-scope Done means included "Wave 7 drained", so every finding moved the finish line. The progress block's "<merged> of <rows>" hid it, because the denominator grew with the numerator. The 10/10 re-scope fixed the symptom by moving 95 issues to v3.1; it left the mechanism in place for the next project.

## 3. What the findings were worth

Keep the flagging. It found real things:
- **CUL-1746:** `main` went red when two parallel merges crossed (27p and 30a), blocking every merge.
- **CUL-1739 (PR-30c):** a "Call your vet now" read on Home kept saying "now" for 14 days.
- **CUL-1408:** a stool-consistency edit never re-checked the vomiting call, which loses a warning.
- **CUL-1440:** a zero shown beside a masking drug or a recent visit reads as reassurance the record cannot support.
- **CUL-1438:** the live "improving" card above, still open.

What sessions file is healthy in kind. **They never filed their own bugs or copy fixes; they fixed those inside the PR.** Of the 87 issues the dispatched children filed, the triggers were the last review pass's leftover (24), an older defect found next door (17), deferred scope or a second-order guard (14), a question for you (14), process and splits (14), and another reviewer's finding (4). Measured against v3.0's goal (a judgment, made per issue): 6 blocked it, 24 gate a later key's go-live, 52 were deferrable, and 5 were the PR's own sub-issue.

**The problem is the routing, not the flagging.** Two of the findings above sat in the wrong place: CUL-1438 is live and waits in Wave 7, while 22 off-path rows on mostly dark code shipped ahead of it.

Parallel sessions also filed duplicates: three issues for one red `main` in 25 minutes (CUL-1742, CUL-1743, CUL-1746); the meals same-pet guard twice (CUL-1650, CUL-1679); and the same `call_said_at` stamp twice, ten minutes apart, once deferred by your re-scope into v3.1 (CUL-1752) and once built that afternoon (CUL-1754, #1163, #1166).

## 4. What still works (keep it)

- **Dispatch's mechanics held.** 74 Engines PRs merged in 13 days. The one red `main` in the window (CUL-1746, two parallel merges crossing) was caught and fixed the same day by #1155.
- **The adversarial passes caught real breaks before they shipped** (section 3).
- **Your batch skip.** When you triaged 19 issues in one reply on 10/9, it took one reply. The design below makes that the default shape instead of the exception.
- **The 10/10 re-scope.** One interactive session cut v3.0 to a four-step path. That is the move the triage design makes routine.

## 5. The triage design: flag everything, schedule only what blocks

Five rules. Each is a field or a relation a script reads, because the prose version of rule 1 already existed and never fired (M2).

**Rule 1 · One door into the run order.** A finding becomes a row only when one of these is true:
- **It harms owners today.** The defect is on `main`, reaches owners now (not behind a flag that is off for them), and can drop, soften or delay a warning, misstate the record, or expose data. The child labels it `Live harm`. It ships as its own fix, launched with `--row` the way Wave 0's fixes did, and never waits on a run order.
- **It blocks the goal.** It carries a `blocks` relation to the issue of a row on the project's current Done means path, and its description says in one sentence what an owner would see if it shipped unfixed.

Everything else lands in the project's *Found along the way* milestone, state `Backlog` (not `Todo`), with no `Waiting on PM` label. Dispatch counts it in one digest line and never offers it one by one. A residual that only errs loud is always in this group. A finding in code behind a flag that is off for owners also gets a `blocks` relation to that flag's go-live issue, so the go-live row lists it ("en9 for every account: 6 gates") and nothing reaches owners past it unseen.

The classification is mechanical where the review already is: an `adversarial-reviewer` break tagged LOUD (P-16) on code owners can reach is `Live harm` by definition. This is your 10/9 rule made mechanical, and it reuses a principle you already ruled: gates are relations, not sentences (CUL-1617).

**Rule 2 · A ruling travels with its work.** A parked finding asks you nothing until it is pulled into a run order. If it needs a clinical or privacy ruling, the question comes beside the proposed row, with the row's cost. Never-list findings still never expire (Pets > $): they leave the board by being fixed or by your ruling, and each one attached to a flag is listed beside that flag's go-live row.

**Rule 3 · File the class, not the instance; a forecast is a budget.** The child prompt gains one line: before filing, check whether the finding is one instance of a class (another write path, another surface, another state that can move the same fact); if it is, file the class once, listing every instance found. The script adds two alarms. Either one stops dispatch proposing new rows under it and re-poses the decision with its real cost:
- **A ruled feature passes its forecast.** A decision brief that commits to building states its forecast in rows. When the rows under that root reach forecast + 1, the fork comes back: "CUL-1611 forecast 3 rows. A fourth was just filed (CUL-1668, a migration of its own). Continue A at this cost, or take B, the louder line?"
- **One row collects its third follow-up in seven days** (for work with no forecast): "PR-23 has three follow-ups since 10/3 (23a, 23b, 23c). Is the latch's design right before a fourth?"

**Rule 4 · Free slots stay free, and every row shows its price.** A row off the goal path never launches `auto` or from the queue. Each proposed row shows "asks you ≈ N", computed from the gate predicate dispatch already reads (a pick, a plan go, an `apply` per migration, a production `merge`, a pending ruling). When only off-path rows are ready, the brief leads with the holds on the core instead of offering them.

**Rule 5 · Done means is fixed at kickoff.** A project's Done means names its rows by PR number, changes only by your re-scope, and never includes a findings milestone. The progress block gains a scope line, so growth shows instead of hiding in the denominator: `Scope: 47 planned · 85 now (+24 added this week)`.

**What you see instead of today's offers.** One line per round:

```
Found since last run: 7 · 1 live fix (CUL-1746, main red) · 1 blocks PR-41 (proposed below) · 5 parked (4 err loud, 1 polish)
```

And, weekly or at a milestone boundary, one sitting on the parked pile (L6: a queue has the length of its sittings, not its rows). At most ten items, sorted loud before quiet and live surface before dark, each with a recommendation: promote, keep, or propose close. The groomer's existing steps handle the long tail: 13c moves a closed project's leftovers, 13b's staleness decay prunes what nobody pulls, and the never-list exempts safety items from both.

**What this would have done on Engines v3** (a replay by hand, so read it as an estimate):
- 30b (`main` red) and the live findings: unchanged, shipped at once. CUL-1438 would have been labelled `Live harm` on 9/30 and launched as its own fix.
- The deferred EN-3 and EN-5 rows on PR-41's After list (27m to 27p, 30a, 30c, 30m, 30q, 30s): unchanged; they block the go-live.
- The `may_wait` chain: CUL-1668 (filed 10/8 11:13) is the fourth row under a three-row forecast, so CUL-1611 comes back to you before 27g, 27h, 27i, 27j and 27l are built. Option B was on the table the whole time, and it errs loud.
- The PR-23 family: its third follow-up (23c, 10/5) asks about the latch's design before 23d to 23h. Under the Done means you ruled on 10/10, those rows sit in code behind `engines_v3_en9`, which v3.0 never turns on, so they park beside en9's go-live. Under the old Done means they would have qualified as blocking, which is why rule 5 carries as much weight as rule 1.
- Your attention: the holds on the core (W3 to W7, D1 to D8, the evaluation key, the drug list and S1, the device check) lead every brief while nothing on the path is ready, instead of sitting under a stream of follow-up picks.

<!-- SECTION 6 (the wider workflow) is inserted here once the repo-wide audit lands -->

## 7. What others do

Sources were re-opened on 10/11 and each quote checked. The full list, with the pages read and not used, is in this session's record.

| Idea | Source | Verdict |
|---|---|---|
| "If input grows faster than throughput, you have an accumulating failure." The remedy is to "throttle input": backpressure and load shedding | Armin Ronacher, *The Final Bottleneck*, 2026-02-13 | **The diagnosis, in one line.** Rule 1 throttles the inflow at the run order's door |
| "We eliminated the option of sending bugs to the backlog": every bug is fixed within an SLA (48 hours high, 7 days otherwise) or marked won't-fix | Linear, *Zero-bugs policy*, Artman and Roman, 2025-09-24 | **Borrow the forcing function, not the absolutism.** Rule 1 forces the fix-now call at the door; parked items still get a sitting and a decay |
| "A reviewer prompted to find gaps will usually report some, even when the work is sound … Chasing every finding leads to over-engineering." Flag "only gaps that affect correctness or the stated requirements" | Anthropic, Claude Code best practices (live docs) | **Borrow.** It is the generator behind M5 and M6, and why LOUD and QUIET decide the door, not the reviewer's volume |
| Severity tags (Important, Nit, Pre-existing); "after the first review, suppress new nits and post Important findings only" | Anthropic, Code Review docs | **Borrow for the second pass.** P-16 caps passes; this caps what the second pass may raise |
| Triage inbox: accept, decline, mark duplicate, snooze; rules need the Business plan | Linear, Triage docs | **Considered, not recommended** (D1 option B): a second inbox, and every item still asks you something |
| File work "that will take it longer than about 2 minutes", and "whenever I get more than about 200 issues I start thinking about cleaning up, and I rarely let it go beyond 500" | Steve Yegge, *Beads Best Practices*, 2025-11-24 (read through a mirror) | **The counterpoint, and it agrees.** Filing everything works for Yegge because issues are cheap memory he prunes hard. Here each one became a candidate row and a decision of yours |
| "Inactivity turned out to be a poor stand-in for relevance." An agent researches old issues into a close queue maintainers review; anyone may reopen; the clearest cases now close automatically, at most 25 a week | Next.js, Marcos Hernanz, *How we closed 1,500 GitHub issues in one month*, 2026-09-04 | **Borrow** for the weekly sitting; 13b's age decay stays the backstop, not the method |
| A WIP cap derived from throughput × the wait you accept: "The cap only works if it stops dispatch" | Michał Jaskólski, *Running the review queue when agents open the PRs*, 2026-09-26 | **Borrow the principle.** The cap that matters counts your pending decisions, not sessions |
| Keep CLAUDE.md "under 200 lines … Longer files consume more context and reduce adherence"; path-scoped rules load only with matching files | Anthropic, memory docs | Section 6 |
| `omitClaudeMd: true` launches a custom subagent without CLAUDE.md | Anthropic, subagent docs (v2.1.271+) | Section 6 |
| "Multi-agent systems typically consume 3 to 10 times more tokens than single-agent approaches for equivalent tasks." They pay off when context pollution hurts, when tasks can run in parallel, or when specialization helps; "outside these situations, the coordination costs typically exceed the benefits" | Anthropic, *Building multi-agent systems: when and how to use them*, 2026-01-23 | **Context for the cap.** Parallelism pays when work is independent. Engines' chains were sequential by construction: each row filed the next |

## 8. Decisions for you

### D1 · The one door into the run order

- **Deciding:** whether a finding becomes a run-order row by default, or only through a `blocks` relation or a `Live harm` label.
- **Options:**
  - **A, recommended: the one door** (section 5, rules 1, 4 and 5). Live harm ships as its own fix; a `blocks` relation to a row on the Done means path makes a row; a finding in dark code attaches to its flag's go-live; everything else parks in `Backlog` under the project's *Found along the way* milestone, counted in one digest line and reviewed in one weekly sitting. Off-path rows need your typed `go`, never `auto`; each proposed row shows what it will ask of you. *Why:* it is your 10/9 rule, made mechanical; it reuses "gates are relations" (CUL-1617); it adds no queue for you to drain.
  - **B: Linear's Triage inbox.** Turn on the Triage state and file every finding there to accept, decline or snooze. Native and phone-friendly, but it is a second inbox (L1), and every finding still asks you something.
  - **C: keep `add` and `skip`, add a `later` verb.** Cheapest to build; every finding still costs you a decision.
- **Consequence:** A changes `dispatch.md` steps 1, 5, 6 and 8, moves the no-row selection into the tested script (retro 3's D4 put selection there), changes CLAUDE.md's issue shape (findings land in `Backlog`, not `Todo`) and `wrap.md` step 4, and adds a `Done means (rows):` line to the page format. It narrows one clause of the `auto` ruling (CUL-1409 (b), CUL-1508): a row on no critical path could be marked `auto`; under A it cannot.

### D2 · A ruling travels with its work

- **Deciding:** whether a parked finding carries `Waiting on PM` now, or only when it is pulled into a run order.
- **Options:**
  - **A, recommended: only when pulled.** The question comes beside the proposed row, with the row's cost. Never-list findings still cannot expire, and each one attached to a flag is listed on that flag's go-live row. *Why:* the 55 children filed 14 issues asking you to decide and drew about 31 rulings mid-build; a ruling on work that may never be built is spent attention, and it goes stale (CUL-1663 carried two conflicting rulings recorded 8 seconds apart).
  - **B: as today.** Every clinical or privacy finding goes to your queue when it is filed.
- **Consequence:** an edit to `wrap.md` step 4 and to CLAUDE.md § Backlog Protocol; fewer arrivals for the groomer's step 12. It narrows how CUL-1366's queue rules apply and removes nothing from the never-list.

### D3 · A forecast is a budget

- **Deciding:** whether a ruled feature that outgrows its forecast comes back to you before more rows are built.
- **Options:**
  - **A, recommended.** A decision brief that commits to building states its forecast in rows. At forecast + 1, dispatch stops proposing rows under that root and re-poses the fork with the real cost. Work with no forecast trips the same alarm at its third follow-up in seven days. Children file a class once, never an instance at a time. *Why:* `may_wait` was briefed as two PRs plus the render and took nine rows and six migration files, about a quarter of the children's in-session asks of you, while option B, the louder line, stayed available throughout.
  - **B: judgment.** Each new link is weighed on its own merits, as now.
- **Consequence:** a `Forecast:` line in CLAUDE.md's decision-brief shape, a counter in `scripts/dispatch/`, one line in the child prompt.

### D4 · Freeze dispatch once this lands

- **Deciding:** what dispatch work is allowed for the next two weeks.
- **Options:**
  - **A, recommended: bug fixes only until 2026-10-26**, then one short measured review: findings filed per merge, the share of launches on the Done means path, and your typed decisions per merged row. *Why:* `dispatch.md` went from v1.0 to v1.7 in 13 days (15 KB to 72 KB) across more than 30 issues about dispatch and its kit. Each version landed before the last one's effect could be measured, and retro 3's cap raise is part of why this retro exists. The groomer's own kill criterion says the same thing: when the queue does not shrink, the constraint is your time, and the answer is not more process.
  - **B: keep iterating** as issues appear.
- **Consequence:** the open dispatch issues (CUL-1620, CUL-1640, CUL-1653, CUL-1662, CUL-1693, CUL-1750) are sorted once: genuine bugs proceed, the rest wait for the review.

<!-- WORKFLOW DECISIONS (D5+) are inserted here once the repo-wide audit lands -->

## 9. Do today (each needs only your yes)

1. **Pull CUL-1438 as a live fix.** The shipped Signal can show an "improving" card when an owner stops logging vomits but keeps logging meals: 1 in 3 synthetic pets in that scenario, measured on the flag-off engine ("the shipped rate itself is this issue"). It is High, carries no label, and is parked in v3.1's Wave 7. It is a safety invariant (absence is not wellness), so it is yours to rule; the recommendation is to launch it now with `--row`.
2. **Free PR-41 from a parked finding.** CUL-1407 (PR-41, v3.0's last step) is blocked by CUL-1432, which cannot close while CUL-1741, a v3.1 finding that errs loud, is still its child. Every other child of CUL-1432 is Done. Unparent CUL-1741, then close CUL-1432.
3. **Point PR-41 at the real device check.** PR-41's After cell names CUL-1433, which the groomer marked a duplicate of CUL-1482 (the 1.2.0 device sitting) on 10/10. The planner clears an issue only when it is `Done` (`scripts/dispatch/plan.ts:626`), so PR-41 would stay held on CUL-1433 forever. The groomer's note asked "the next /dispatch refresh" to fix the cell, but dispatch never edits After: one more prose instruction that cannot fire. Replace CUL-1433 with CUL-1482 in the cell.
4. **Close CUL-1752 as a duplicate of CUL-1754**, which shipped the same stamp on 10/10.

## 10. The retro ritual's four questions (`docs/personas.md` § Periodic Process Retro)

1. **What did a persona miss?**
   - The Product Owner lens let a valve live only on a page (M2), and retro 3 itself counted "~16 follow-ups filed by children" as healthy work found mid-project without asking where they went.
   - The Dir. of Engineering lens did not ask, of `may_wait` or the latch, "what else can move?" before the first row, though C-38 asks exactly that of code.
   - Dr. Chen and the Data Scientist ran full rigor on dark code while a live reassurance defect (CUL-1438) waited.
2. **What rule prevents that class?** Section 5's one door, as a relation and a label a script reads; "a forecast is a budget"; and "file the class, not the instance".
3. **What is now over-process?** Offering every new issue as a row, one decision at a time (dispatch step 1's no-row offer, replaced by rule 1's digest line). Asking for rulings on work that is not scheduled (D2). See section 6 for the wider list.
4. **What working file is bloating?** `dispatch.md` (15 KB at v1.0 by retro 3's count, 72 KB at v1.7 thirteen days later, plus a second full copy in `operating-kit/`), the Engines plan page (~96K characters raw), the dispatchers' context (459K to 728K tokens at hand-off), and the `Waiting on PM` label (87 against a cap of 30).

## Appendix: method and caveats

- **Origins are judgments.** Each of the 202 issues was classed by hand from its title, the first 500 characters of its description (where `list_issues` cuts it), its parent, labels and milestone, then checked against the "filed" lines in the session records. Whether a follow-up is a new finding or deferred planned scope is the main judgment; for about 15 issues the filer rests only on timing after a launch.
- **"On the v3.0 path"** means a row PR-41 depends on, directly or through other rows, under the Done means ruled on 10/10. Under the older Done means more rows would count as on the path; M7 and rule 5 are about exactly that difference.
- **Asks of you** come from two partial sources: the session records (about 100 in-session asks) and four end-to-end traces through the dispatcher's updates. Neither sees every dispatcher turn, so the totals are floors.
- **The replay in section 5 is by hand.** It shows what the rules would have routed, not what you would have ruled at each fork.
- **Linear attributes every agent write to the PM's account**, so "who filed" is rebuilt from session records and branch names, never from Linear's creator field.
