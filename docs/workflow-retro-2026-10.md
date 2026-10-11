# Workflow retro 4: dispatch found more work than it finished

**Date:** 2026-10-11 · **Issue:** [CUL-1858](https://linear.app/projectnyx/issue/CUL-1858) · **Status:** 🧊 dated record (correct it additively, never in place)
**Covers:** Engines v3 from dispatch v1 (9/28) to the re-scope (10/10), and the workflow around dispatch as it stands on 10/11.
**Evidence:**
- All 202 issues ever in Engines v3 or v3.1, each classified by origin, with its filer rebuilt from the session records (Linear attributes every agent write to the PM's account).
- 146 `/dispatch run` status updates, 57 launches resolved to their rows, and 74 merged Engines PRs since 9/28.
- 68 Engines v3 session records (55 of them dispatched children), read for what each filed and why.
- Four follow-up rows traced end to end through the dispatcher's own updates.
- A repo-wide process audit: sizes, churn, ceremony, duplication, and the 49 issues already in *The workflow audit* project.
- A web research pass. Every source quoted here was re-opened on 10/11 and the quote checked against the page.
- Two `adversarial-reviewer` passes on the triage design itself, the most the two-pass cap allows.

Prior retros: `docs/workflow-retro-2026-07.md`, `docs/workflow-retro-2026-09.md` (its laws L1 to L7 are cited below), `docs/dispatch-retro-2026-10.md` (retro 3, [CUL-1606](https://linear.app/projectnyx/issue/CUL-1606)).

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

**The triage ran backwards.** [CUL-1438](https://linear.app/projectnyx/issue/CUL-1438), a live false-reassurance defect in the shipped Signal, has sat in Wave 7 since 9/30: an "improving" card when an owner stops logging vomits but keeps logging meals. Over the same days, 22 off-path follow-up rows shipped, most of them in code no owner can reach yet.

**The wider workflow pays a fixed tax on every session.** A dispatched child loads about 37K tokens before it writes code (about 67K if it follows the ritual), and about 3.5% of that is its own row. All six review subagents load the full CLAUDE.md, the cold reader included, and each change is written up four times. Separately, `main` has no branch protection, though CLAUDE.md says a ruleset blocks red merges.

**The fix is a sort, not another queue.** Keep flagging everything, and sort each finding by what it can do. Anything that could quiet a warning, leak data or lose data is fixed now, or, if the dispatcher proves its code dark, gates that feature's go-live. A finding that blocks the goal becomes a row. Everything else parks, counted, and asks you nothing until it is pulled. Section 5 has the design (two adversarial passes; the second found six holes, all closed), section 6 the wider workflow, section 8 seven decisions, and section 9 five things to do today.

**Ruled 2026-10-11:** you took all seven. D1 to D3 and D5 to D7 were taken as written. D4 was taken in a tuned form: one week, and friction counts as a bug. Section 11 records what each ruling set in motion.

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
| PR-27g ([CUL-1668](https://linear.app/projectnyx/issue/CUL-1668)), 10/8 | a ruling ("yes") · `add` · `go 27g` · a plan go (migration) · `apply 088` · `merge #1115` | [CUL-1671](https://linear.app/projectnyx/issue/CUL-1671), ruled and added as 27h 12 minutes after the merge |
| PR-23g ([CUL-1663](https://linear.app/projectnyx/issue/CUL-1663)), 10/8 | two conflicting rulings recorded 8 seconds apart, then `expire` confirmed · `add` · `go` · a plan go (clinical) · a Bash permission prompt that stalled it for 9 hours | [CUL-1667](https://linear.app/projectnyx/issue/CUL-1667), added as 23h |
| PR-27i ([CUL-1680](https://linear.app/projectnyx/issue/CUL-1680)), 10/8 | `add` · `go` · a plan go (clinical) | [CUL-1682](https://linear.app/projectnyx/issue/CUL-1682), added as 27j 8 minutes after the merge |
| PR-30s ([CUL-1725](https://linear.app/projectnyx/issue/CUL-1725)), 10/9 | `add` · `go` · a plan go (clinical, though the script read the row as routine) · a ruling (I5 = A) | nothing |

The children's records count about 100 in-session asks across 55 sessions: 16 migration applies, 17 plan approvals, about 31 rulings mid-build, about 10 merges. The dispatcher's `add`, `go` and ruling turns come on top. Meanwhile W3 to W7 ([CUL-1390](https://linear.app/projectnyx/issue/CUL-1390)) waited from 9/28 and D1 to D8 with E-4 ([CUL-1146](https://linear.app/projectnyx/issue/CUL-1146)) from 9/24, and both moved to v3.1 unruled.

**M5 · Features that store a decision were discovered one stale path per PR.** `may_wait` began as a fork. [CUL-1611](https://linear.app/projectnyx/issue/CUL-1611)'s own brief offered option B, keeping the louder "call an emergency clinic" line, which "closes this issue", against option A, a server-side `may_wait` fact, forecast as "a migration and a server change, each in its own PR", plus the client render. A was ruled at 23:47Z on 10/6. It took nine rows (27c, 27e, 27f, 27g, 27h, 27i, 27j, 27l, with 27b upstream) and six migration files in three days, about a quarter of the children's in-session asks. Each child found the next way a stored "may wait" could go stale and filed it; the next row found the one after. The EN-9 raised-again latch did the same (23b, 23c, 23g, 23h). Of the 17 letters born from reviews, 12 came from these two features. None of the `may_wait` rows is named in PR-41's After list, the v3.0 go-live. The repo already has the lesson for code (C-38: "ask of any relational guard: what else can move?"); nothing applies it to filing, and nobody re-posed the fork when the fourth row appeared.

**M6 · Code no owner can reach got live-code rigor.** The PR-23 summary cascade (23a, 23d, 23e, 23f) hardened a path its own record called "Inert today", until you ruled safety summaries template-only. `pr27i`: "Latent today. Nothing reads may_wait yet." The latch cascade worked on EN-9 code whose go-live was already held by the harness (0.93 against a 5% cap). The two-pass cap you set on 10/10 limits passes per PR; it does not decide which PRs run, and its rule "file the rest" turns review time into issue count unless intake changes too.

**M7 · Done means absorbed the findings.** The pre-re-scope Done means included "Wave 7 drained", so every finding moved the finish line. The progress block's "<merged> of <rows>" hid it, because the denominator grew with the numerator. The 10/10 re-scope fixed the symptom by moving 95 issues to v3.1; it left the mechanism in place for the next project.

## 3. What the findings were worth

Keep the flagging. It found real things:
- **[CUL-1746](https://linear.app/projectnyx/issue/CUL-1746):** `main` went red when two parallel merges crossed (27p and 30a), blocking every merge.
- **[CUL-1739](https://linear.app/projectnyx/issue/CUL-1739) (PR-30c):** a "Call your vet now" read on Home kept saying "now" for 14 days.
- **[CUL-1408](https://linear.app/projectnyx/issue/CUL-1408):** a stool-consistency edit never re-checked the vomiting call, which loses a warning.
- **[CUL-1440](https://linear.app/projectnyx/issue/CUL-1440):** a zero shown beside a masking drug or a recent visit reads as reassurance the record cannot support.
- **[CUL-1438](https://linear.app/projectnyx/issue/CUL-1438):** the live "improving" card above, still open.

What sessions file is healthy in kind. **They never filed their own bugs or copy fixes; they fixed those inside the PR.** Of the 87 issues the dispatched children filed, the triggers were the last review pass's leftover (24), an older defect found next door (17), deferred scope or a second-order guard (14), a question for you (14), process and splits (14), and another reviewer's finding (4). Measured against v3.0's goal (a judgment, made per issue): 6 blocked it, 24 gate a later key's go-live, 52 were deferrable, and 5 were the PR's own sub-issue.

**The problem is the routing, not the flagging.** Two of the findings above sat in the wrong place: [CUL-1438](https://linear.app/projectnyx/issue/CUL-1438) is live and waits in Wave 7, while 22 off-path rows on mostly dark code shipped ahead of it.

Parallel sessions also filed duplicates: three issues for one red `main` in 25 minutes ([CUL-1742](https://linear.app/projectnyx/issue/CUL-1742), [CUL-1743](https://linear.app/projectnyx/issue/CUL-1743), [CUL-1746](https://linear.app/projectnyx/issue/CUL-1746)); the meals same-pet guard twice ([CUL-1650](https://linear.app/projectnyx/issue/CUL-1650), [CUL-1679](https://linear.app/projectnyx/issue/CUL-1679)); and the same `call_said_at` stamp twice, ten minutes apart, once deferred by your re-scope into v3.1 ([CUL-1752](https://linear.app/projectnyx/issue/CUL-1752)) and once built that afternoon ([CUL-1754](https://linear.app/projectnyx/issue/CUL-1754), #1163, #1166).

## 4. What still works (keep it)

- **Dispatch's mechanics held.** 74 Engines PRs merged in 13 days. The one red `main` in the window ([CUL-1746](https://linear.app/projectnyx/issue/CUL-1746), two parallel merges crossing) was caught and fixed the same day by #1155.
- **The adversarial passes caught real breaks before they shipped** (section 3).
- **Your batch skip.** When you triaged 19 issues in one reply on 10/9, it took one reply. The design below makes that the default shape instead of the exception.
- **The 10/10 re-scope.** One interactive session cut v3.0 to a four-step path. That is the move the triage design makes routine.

## 5. The triage design: flag everything, schedule only what blocks

Five rules. Each is a field or a relation a script reads, because the prose version of rule 1 already existed and never fired (M2).

**Rule 1 · Sort each finding by what it can do. Only the harmless kinds wait.** The child tags every finding with its direction, in the review's own words (P-16): QUIET if it can drop, soften or delay a warning; LOUD if it errs toward an extra, earlier or louder warning; or neither. A finding with no tag counts as QUIET. Then it goes through one of four doors:

| What the finding can do | Where it goes |
|---|---|
| **Harm, live.** It is QUIET, or it can expose data, lose data or corrupt what a live reader shows, in code that runs for any account: a deployed function; an applied migration, trigger, RLS or Storage policy; data a live reader reads; a key with any account on its allowlist, yours included; or unflagged code waiting for the next cut. Code counts as live until the dispatcher proves it dark from production `app_config`. | **`Live harm`, fixed now.** Its own fix, launched with `--row` from any project. If the fix needs a ruling, a stopgap ships first: the quieter output, or the leaking path, switched off. A clinical or privacy question goes to you at once under `Waiting on PM`, and so does any `Live harm` left unclaimed for 24 hours. |
| **Harm, proven dark.** The same, but the dispatcher has read every key it sits behind and found the allowlist empty in production, and no applied migration, trigger or policy is involved. | **A gate on every go-live it sits behind:** a `blocks` relation to each, plus its `Gate:` label so no prune can close it. It names the repair of any rows already written. You decide it at the go-live, by fixing it or cutting the feature. The dispatcher re-reads it every run; an allowlist addition makes it `Live harm`. |
| **It blocks the goal.** It stops a row on the Done means path from being correct. | **A proposed row,** through a `blocks` relation to that row's issue and one sentence on what an owner would see. It waits for your typed `go` the first time. |
| **Anything else.** LOUD-only (even when false: P-16 already lets it ship), polish, a hypothetical, a second-order guard, a process idea. | **Parked:** `Backlog` in the project's *Found along the way* milestone, `relatedTo` its source and never a sub-issue of a row's issue, counted in one digest line and never offered one by one. |

A class goes by its worst instance, and one live instance splits out of it. This is your 10/9 rule made mechanical, with the burden of proof the safe way round: a finding that could quiet a warning, leak or lose data never waits on a guess that the code is dark. It reuses a principle you already ruled: gates are relations, not sentences ([CUL-1617](https://linear.app/projectnyx/issue/CUL-1617)).

**Rule 2 · A ruling travels with its work.** A parked finding asks you nothing until it is pulled into a run order; its question then comes beside the proposed row, with the row's cost. Rulings on live harm are asked at once (rule 1), and rulings on a dark gate at its go-live. Never-list findings never expire: they leave the board by being fixed or by your ruling (Pets > $).

**Rule 3 · File the class, not the instance; a forecast is a budget.** The child prompt gains one line: before filing, check whether the finding is one instance of a class (another write path, another surface, another state that can move the same fact); if it is, file the class once, listing every instance found. The script adds two alarms. Either one stops dispatch proposing new rows under it and re-poses the decision with its real cost:
- **A ruled feature passes its forecast.** A decision brief that commits to building states its forecast in rows. When the rows under that root reach forecast + 1, the fork comes back: "[CUL-1611](https://linear.app/projectnyx/issue/CUL-1611) forecast 3 rows. A fourth was just filed ([CUL-1668](https://linear.app/projectnyx/issue/CUL-1668), a migration of its own). Continue A at this cost, or take B, the louder line?"
- **One row collects its third follow-up in seven days** (for work with no forecast): "PR-23 has three follow-ups since 10/3 (23a, 23b, 23c). Is the latch's design right before a fourth?"

No alarm holds a `Live harm` fix or a dark gate. While a fork is re-posed, the feature's quieter output is switched off wherever it is on, so the louder behavior holds until you rule.

**Rule 4 · Free slots stay free, and every row shows its price.** A row off the goal path never launches `auto` or from the queue. Each proposed row shows "asks you ≈ N", computed from the gate predicate dispatch already reads (a pick, a plan go, an `apply` per migration, a production `merge`, a pending ruling). When only off-path rows are ready, the brief leads with the holds on the core instead of offering them.

**Rule 5 · Done means is fixed at kickoff.** A project's Done means names its rows by PR number, changes only by your re-scope, and never includes a findings milestone. The progress block gains a scope line, so growth shows instead of hiding in the denominator: `Scope: 47 planned · 85 now (+24 added this week)`.

**What you see instead of today's offers.** One line per round:

```
Found since last run: 7 · 1 live fix (CUL-1746, main red) · 1 blocks PR-41 (proposed below) · 1 gate on en9's go-live · 4 parked (3 err loud, 1 polish)
```

And, weekly or at a milestone boundary, one sitting on the parked pile (L6: a queue has the length of its sittings, not its rows). At most ten items, each with a recommendation: promote, keep, or propose close. Nothing that could quiet a warning is ever in this pile; rule 1 routes it elsewhere. The groomer's existing steps handle the long tail: 13c moves a closed project's leftovers, 13b's staleness decay prunes what nobody pulls, and the never-list exempts safety items from both.

**What this would have done on Engines v3** (a replay by hand, so read it as an estimate):
- 30b (`main` red): unchanged, shipped at once.
- [CUL-1438](https://linear.app/projectnyx/issue/CUL-1438): QUIET, on the shipped engine, so `Live harm` on 9/30. Its stopgap (no "improving" card while the drop could be a logging gap) ships while you rule, instead of waiting in Wave 7.
- The deferred EN-3 and EN-5 rows on PR-41's After list (27m to 27p, 30a, 30c, 30m, 30q, 30s): unchanged; they block the go-live.
- The `may_wait` chain: each stale-path finding is QUIET but dark (nothing read `may_wait` before en3), so it gates en3's go-live instead of becoming a row, and [CUL-1668](https://linear.app/projectnyx/issue/CUL-1668) (filed 10/8 11:13) is the fourth row under a three-row forecast, so [CUL-1611](https://linear.app/projectnyx/issue/CUL-1611) comes back to you before 27g to 27l are built. Option B was on the table the whole time, and it errs loud.
- The PR-23 family: its third follow-up (23c, 10/5) asks about the latch's design before 23d to 23h, and the latch findings, dark behind `engines_v3_en9`, gate en9's go-live rather than launching. Under the old Done means, which included every key going live, they would have qualified as blocking; that is why rule 5 carries as much weight as rule 1.
- [CUL-1741](https://linear.app/projectnyx/issue/CUL-1741): LOUD-only, so parked, related to its source rather than filed as a sub-issue of [CUL-1432](https://linear.app/projectnyx/issue/CUL-1432). PR-41 is never held by it (today it is: section 9, item 2).
- Your attention: the holds on the core (W3 to W7, D1 to D8, the evaluation key, the drug list and S1, the device check) lead every brief while nothing on the path is ready, instead of sitting under a stream of follow-up picks.

## 6. The wider workflow: what every session pays

Measured by a separate read-only audit of the process files, the git history since 9/20, and the 49 issues in *The workflow audit* project, so nothing below re-proposes something already ruled.

**What a session carries before it writes code.**
- A dispatched child loads about 147 KB (~37K tokens) at minimum: CLAUDE.md (135.7 KB), its prompt (~7.5 KB) and its issue. Following the ritual's "every session" reads (`STATUS.md`, `docs/personas.md`, the tech spec, a track spec, a skill) takes it to about 267 KB (~67K tokens), and the close-out files to about 303 KB. The build note the row actually executes has a median size of 270 bytes: about 3.5% of what the session loads is about its own row.
- CLAUDE.md is 593 lines. Anthropic's guidance is to "target under 200 lines per CLAUDE.md file. Longer files consume more context and reduce adherence." Its Code Conventions (45 KB, 57 bullets) and Read-These table (24 KB) matter only when a session touches the surface they cover, and path-scoped rules exist to load exactly then.
- All six review subagents load the full CLAUDE.md, because none sets `omitClaudeMd`. That includes `vet-report-cold-read`, whose definition says its reader has zero knowledge of how the report was built. Adversarial review appears in 90 of the 181 October session records.
- The CLAUDE.md byte guard ([CUL-920](https://linear.app/projectnyx/issue/CUL-920)) has held that one file flat since 9/15, while about 190 KB of rules grew in the files beside it: `dispatch.md` 14.9 → 72.2 KB, the groomer 18.5 → 61.5 KB, the lessons file +64 KB. Retro 2's L3 again: a budget without a structural fix only buys time, and this one moved the growth next door.

**The same story, four times.** Each change is written up in the PR body (median 3.9 KB), a session record (median 4.2 KB), the Linear outcome comment and the dispatch return block. Since 9/20, 13 of 295 session records are cited by name anywhere else in the repo, and 74 of the 181 October records say `One thing: none`.

**Steps machinery already does.** Naming the mode (the prompt sets it); the DoD's types and tests lines (required CI checks them); setting `In Review` by hand (the Linear integration does); the post-merge sibling check (the child and the dispatcher both run it); the read-back (likewise).

**Process share.** Since 9/20, 34 of 302 merged PRs (11%) changed only workflow files, and about 58 of ~786 new issues (7%) were about the workflow itself. `dispatch.md` went through eight versions in 13 days, plus a hand port of each into `operating-kit/` (402 KB, 49 files).

**Contradictions to settle with rulings you already made** (no new decision; filed as one cleanup issue):
1. **Polling:** CLAUDE.md never polls under about 90 minutes; dispatch arms 20-minute check-ins while CI runs.
2. **Drafts:** `/wrap` opens a draft PR; CLAUDE.md says a discovery PR never parks as a draft. On 10/11, 52 of 55 open PRs are drafts, the oldest from 6/12.
3. **Device testing:** the Git Workflow and Dev Handoff sections say test on a device after every push; the PM-queue rules say device checks file once per TestFlight cut.
4. **Tier-2 doc edits:** one line says they wait for you; [CUL-1366](https://linear.app/projectnyx/issue/CUL-1366) ruled that a doc edit which only matches shipped code is a team call. #843, which reconciles them, has been a draft since 9/12.
5. **The kit:** `operating-kit/` is ported by hand after each change ([CUL-1517](https://linear.app/projectnyx/issue/CUL-1517), [CUL-1631](https://linear.app/projectnyx/issue/CUL-1631), [CUL-1639](https://linear.app/projectnyx/issue/CUL-1639), [CUL-1660](https://linear.app/projectnyx/issue/CUL-1660)); generate it from the live files instead.

**One finding that is not about efficiency: `main` has no branch protection.** CLAUDE.md says the required checks sit "on an Active `main` ruleset with an empty bypass list ... so a red check blocks the merge". Asked on 10/11 with an admin token, GitHub returns no rulesets, no rules for `main`, and `protected: false`; the repo is public, where rulesets work on the free plan. Every self-merge's "every check passed" rests on the session's own read. Retro 3 asked you to check this on 10/5. It is a minute in Settings → Rules (section 9, item 5).

**Keep:** the 55 guards and merge-check (CI green in about ten minutes); the claim, one sub-issue per PR and the read-back; adversarial review under the two-pass cap, the most load-bearing ceremony there is; the production-write hook; and dispatch's scripted core (median 47 minutes from launch to merge in retro 3's window, no reverts).


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

> **Ruled 2026-10-11 by the PM:** all seven, A. D4 was taken in the tuned form recorded in section 11.

### D1 · Sort findings by what they can do

- **Deciding:** whether every finding is offered as run-order work, or is sorted by what it can do, so only findings that could hurt an owner or that block the goal ask for your attention now.
- **Options:**
  - **A, recommended: the sort** (section 5, rules 1, 4 and 5). A finding that could quiet a warning, leak or lose data is fixed now if its code is live, and gates every go-live it sits behind if the dispatcher proves it dark; a `blocks` relation to a row on the Done means path makes a row; everything else (loud-only, polish, hypotheticals) parks in `Backlog` under the project's *Found along the way* milestone, counted in one digest line and reviewed in one weekly sitting. Off-path rows need your typed `go`, never `auto`; each proposed row shows what it will ask of you. *Why:* it is your 10/9 rule, made mechanical; it reuses "gates are relations" ([CUL-1617](https://linear.app/projectnyx/issue/CUL-1617)); it adds no queue for you to drain.
  - **B: Linear's Triage inbox.** Turn on the Triage state and file every finding there to accept, decline or snooze. Native and phone-friendly, but it is a second inbox (L1), and every finding still asks you something.
  - **C: keep `add` and `skip`, add a `later` verb.** Cheapest to build; every finding still costs you a decision.
- **Consequence:** A changes `dispatch.md` steps 1, 5, 6 and 8, moves the no-row selection into the tested script (retro 3's D4 put selection there), changes CLAUDE.md's issue shape (findings land in `Backlog`, not `Todo`) and `wrap.md` step 4, and adds a `Done means (rows):` line to the page format. It narrows one clause of the `auto` ruling ([CUL-1409](https://linear.app/projectnyx/issue/CUL-1409) (b), [CUL-1508](https://linear.app/projectnyx/issue/CUL-1508)): a row on no critical path could be marked `auto`; under A it cannot.

### D2 · A ruling travels with its work

- **Deciding:** whether a parked finding carries `Waiting on PM` now, or only when it is pulled into a run order.
- **Options:**
  - **A, recommended: only when pulled.** The question comes beside the proposed row, with the row's cost. Never-list findings still cannot expire, and each one attached to a flag is listed on that flag's go-live row. *Why:* the 55 children filed 14 issues asking you to decide and drew about 31 rulings mid-build; a ruling on work that may never be built is spent attention, and it goes stale ([CUL-1663](https://linear.app/projectnyx/issue/CUL-1663) carried two conflicting rulings recorded 8 seconds apart).
  - **B: as today.** Every clinical or privacy finding goes to your queue when it is filed.
- **Consequence:** an edit to `wrap.md` step 4 and to CLAUDE.md § Backlog Protocol; fewer arrivals for the groomer's step 12. It narrows how [CUL-1366](https://linear.app/projectnyx/issue/CUL-1366)'s queue rules apply and removes nothing from the never-list.

### D3 · A forecast is a budget

- **Deciding:** whether a ruled feature that outgrows its forecast comes back to you before more rows are built.
- **Options:**
  - **A, recommended.** A decision brief that commits to building states its forecast in rows. At forecast + 1, dispatch stops proposing rows under that root and re-poses the fork with the real cost. Work with no forecast trips the same alarm at its third follow-up in seven days. Children file a class once, never an instance at a time. *Why:* `may_wait` was briefed as two PRs plus the render and took nine rows and six migration files, about a quarter of the children's in-session asks of you, while option B, the louder line, stayed available throughout.
  - **B: judgment.** Each new link is weighed on its own merits, as now.
- **Consequence:** a `Forecast:` line in CLAUDE.md's decision-brief shape, a counter in `scripts/dispatch/`, one line in the child prompt.

### D4 · Pause changes to the tools once this lands (ruled A, tuned)

- **Deciding:** whether to pause changes to the workflow tools themselves (dispatch, `/wrap`, the steward, the groomer) after this retro's build merges. Using them is never paused: the work they run keeps going.
- **Options as first written:** A, bug fixes only for two weeks, a measured review, then weekly batches · B, pause dispatch only · C, keep iterating.
- **Ruled: A, tuned in the session** after the PM asked for "an optimal dispatch experience":
  - **One week, not two.** It starts the day the last of the five build PRs merges.
  - **Friction counts as a bug.** Anything that costs you an extra decision, stalls a row, or makes a brief confusing is fixed during the week; only new features wait.
  - **Then a readout** on three numbers: issues filed per merge, the share of launches on the Done means path, and your decisions per merged row.
  - **After that,** tool changes ship as one PR a week.
  - **Exempt:** safety fixes, and CLAUDE.md updates from rulings.
- *Why:* `dispatch.md` went from v1.0 to v1.7 and from 15 KB to 72 KB in 13 days, and 11% of merged PRs since 9/20 changed only workflow files. Each version landed before the last one's effect could be measured, and retro 3's cap raise is part of why this retro exists.
- **Consequence:** the open dispatch issues ([CUL-1620](https://linear.app/projectnyx/issue/CUL-1620), [CUL-1640](https://linear.app/projectnyx/issue/CUL-1640), [CUL-1653](https://linear.app/projectnyx/issue/CUL-1653), [CUL-1662](https://linear.app/projectnyx/issue/CUL-1662), [CUL-1693](https://linear.app/projectnyx/issue/CUL-1693), [CUL-1750](https://linear.app/projectnyx/issue/CUL-1750)) are sorted once: friction and bugs proceed, the rest wait for the readout.

### D5 · Split CLAUDE.md by when it is needed

- **Deciding:** whether CLAUDE.md stays the always-loaded home of every rule, or keeps only what every session needs while each convention moves next to the code it governs. This revisits a dated rule: Tier 1's "the rule and its enforcement live here in CLAUDE.md" (2026-09-12, [CUL-920](https://linear.app/projectnyx/issue/CUL-920)), which protected rules from being lost. Path-scoped rules still load every time a session touches their files, and the guards still fail the build, so that protection holds.
- **Options:**
  - **A, recommended.** A core of about 45 KB that every session needs: the hard constraints, the safety invariants, the never-list, the commands and the pointers. Conventions move into path-scoped `.claude/rules/` files that load when a session touches matching files, each keeping its guard. The Read-These table shrinks to one line per row. Secrets, Open Questions and Dev Handoff move into the files whose commands read them. Dispatched rows skip the "every session" reads, since the build note is their plan. The byte ratchet extends from CLAUDE.md to CLAUDE.md plus `.claude/**/*.md`, so growth cannot move next door again. *Why:* about 90 KB (~22K tokens) less at every session start and every reviewer call, and Anthropic's own guidance.
  - **B: as today,** with the ratchet extended to `.claude/**/*.md` only.
- **Consequence:** one build session, its own PR. The risk is an unguarded convention not loading when needed; the 15 guarded ones still fail CI.

### D6 · Reviewers start cold

- **Deciding:** whether the review subagents load the full CLAUDE.md.
- **Options:**
  - **A, recommended.** Set `omitClaudeMd: true` on `vet-report-cold-read` (its definition requires zero build context), `pm-feature-review` and `adversarial-reviewer`, with the two safety invariants and P-16's LOUD and QUIET written into their own files. `code-reviewer` and `rls-privacy-reviewer` keep CLAUDE.md, because the house rules are what they check. *Why:* about 34K tokens less per call, and the cold read becomes cold.
  - **B: as today.**
- **Consequence:** three agent-file edits, after confirming the installed CLI supports the field (v2.1.271 or later).

### D7 · One write-up per PR

- **Deciding:** how many places a dispatched child writes its story.
- **Options:**
  - **A, recommended.** Under `/wrap --dispatched` the PR body is the record, with a five-line DoD (acceptance criteria, CI, the adversarial verdict at its commit, the QA script, PM actions filed). The Linear outcome comment becomes the claim release, a link and the residual. A session record is written only for a teach row or a discovery row. The steps machinery already does are dropped. *Why:* four write-ups of one change; 13 of 295 records cited anywhere; 74 of 181 October records teach nothing.
  - **B: as today.**
- **Consequence:** narrows [CUL-1505](https://linear.app/projectnyx/issue/CUL-1505)'s `/wrap --dispatched`. The learning ledger is unaffected, because a teach row still writes its record, and `docs/sessions/` stays the archive for interactive and discovery sessions.


## 9. Do today (each needs only your yes, or a minute)

1. **Pull [CUL-1438](https://linear.app/projectnyx/issue/CUL-1438) as a live fix.** The shipped Signal can show an "improving" card when an owner stops logging vomits but keeps logging meals: 1 in 3 synthetic pets in that scenario, measured on the flag-off engine ("the shipped rate itself is this issue"). It is High, carries no label, and is parked in v3.1's Wave 7. It is a safety invariant (absence is not wellness), so it is yours to rule; the recommendation is to launch it now with `--row`.
2. **Free PR-41 from a parked finding.** [CUL-1407](https://linear.app/projectnyx/issue/CUL-1407) (PR-41, v3.0's last step) is blocked by [CUL-1432](https://linear.app/projectnyx/issue/CUL-1432), which cannot close while [CUL-1741](https://linear.app/projectnyx/issue/CUL-1741), a v3.1 finding that errs loud, is still its child. Every other child of [CUL-1432](https://linear.app/projectnyx/issue/CUL-1432) is Done. Unparent [CUL-1741](https://linear.app/projectnyx/issue/CUL-1741), then close [CUL-1432](https://linear.app/projectnyx/issue/CUL-1432).
3. **Point PR-41 at the real device check.** PR-41's After cell names [CUL-1433](https://linear.app/projectnyx/issue/CUL-1433), which the groomer marked a duplicate of [CUL-1482](https://linear.app/projectnyx/issue/CUL-1482) (the 1.2.0 device sitting) on 10/10. The planner clears an issue only when it is `Done` (`scripts/dispatch/plan.ts:626`), so PR-41 would stay held on [CUL-1433](https://linear.app/projectnyx/issue/CUL-1433) forever. The groomer's note asked "the next /dispatch refresh" to fix the cell, but dispatch never edits After: one more prose instruction that cannot fire. Replace [CUL-1433](https://linear.app/projectnyx/issue/CUL-1433) with [CUL-1482](https://linear.app/projectnyx/issue/CUL-1482) in the cell.
4. **Close [CUL-1752](https://linear.app/projectnyx/issue/CUL-1752) as a duplicate of [CUL-1754](https://linear.app/projectnyx/issue/CUL-1754)**, which shipped the same stamp on 10/10.
5. **Turn on a ruleset for `main`.** GitHub has none (section 6). In Settings → Rules: require a pull request and the two required checks, `App (typecheck + jest)` and `Edge Functions (deno test)`, block force pushes and deletion, and leave the bypass list empty. Then CLAUDE.md's line describing it becomes true.

## 10. The retro ritual's four questions (`docs/personas.md` § Periodic Process Retro)

1. **What did a persona miss?**
   - The Product Owner lens let a valve live only on a page (M2), and retro 3 itself counted "~16 follow-ups filed by children" as healthy work found mid-project without asking where they went.
   - The Dir. of Engineering lens did not ask, of `may_wait` or the latch, "what else can move?" before the first row, though C-38 asks exactly that of code.
   - Dr. Chen and the Data Scientist ran full rigor on dark code while a live reassurance defect ([CUL-1438](https://linear.app/projectnyx/issue/CUL-1438)) waited.
2. **What rule prevents that class?** Section 5's sort, enforced by tags, relations and a production read a script checks, with the burden of proof on "dark"; "a forecast is a budget"; and "file the class, not the instance".
3. **What is now over-process?** Offering every new issue as a row, one decision at a time (replaced by rule 1's digest line); asking for rulings on work that is not scheduled (D2); a session record for every dispatched row (D7); five steps machinery already does (section 6); and the "every session" reads for a row whose build note is its plan (D5).
4. **What working file is bloating?** CLAUDE.md (593 lines against a target under 200), `dispatch.md` (15 KB at v1.0 by retro 3's count, 72 KB at v1.7 thirteen days later, plus a second full copy in `operating-kit/`), the groomer (61 KB), the Engines plan page (~96K characters raw), the dispatchers' context (459K to 728K tokens at hand-off), and the `Waiting on PM` label (87 against a cap of 30).

## 11. Rulings (PM, 2026-10-11)

The PM typed `Retro 4 rulings: D1 A · D2 A · D3 A · D4 I don't really understand this one · D5 A · D6 A · D7 A` in this session. Then, after D4 was restated in plain words ("I want an optimal dispatch experience") and offered in a tuned form, the PM typed `A`.

- **D1, D2, D3 (A):** the sort, rulings that travel with their work, and the forecast budget. Built as two PRs: the rules ([CUL-1870](https://linear.app/projectnyx/issue/CUL-1870)) and then the script ([CUL-1872](https://linear.app/projectnyx/issue/CUL-1872)), which carries the nine adversarial cases as named tests.
- **D5 (A):** CLAUDE.md split by when it is needed ([CUL-1874](https://linear.app/projectnyx/issue/CUL-1874)), after the rules PR, because both edit CLAUDE.md.
- **D6 (A):** cold reviewers ([CUL-1871](https://linear.app/projectnyx/issue/CUL-1871)). It can run beside anything.
- **D7 (A):** one write-up per PR ([CUL-1873](https://linear.app/projectnyx/issue/CUL-1873)), after the rules PR, because both edit `dispatch.md`.
- **D4 (A, tuned).** It pauses changing the tools, never using them. When the build's last PR merges, there is one week of bug and friction fixes only. Then the readout runs ([CUL-1876](https://linear.app/projectnyx/issue/CUL-1876), blocked by all five build PRs, with this retro's baselines). After that, changes ship weekly. [CUL-1870](https://linear.app/projectnyx/issue/CUL-1870) writes the pause into CLAUDE.md and `dispatch.md`.
- **Applied under D2 the same day:** [CUL-1438](https://linear.app/projectnyx/issue/CUL-1438) is live and touches a safety invariant, so it now carries `Waiting on PM` and `Gate: clinical`.

The build is one parent, [CUL-1869](https://linear.app/projectnyx/issue/CUL-1869), with one sub-issue per PR. The parent is never named in a PR.

## Appendix: method and caveats

- **Origins are judgments.** Each of the 202 issues was classed by hand from its title, the first 500 characters of its description (where `list_issues` cuts it), its parent, labels and milestone, then checked against the "filed" lines in the session records. Whether a follow-up is a new finding or deferred planned scope is the main judgment; for about 15 issues the filer rests only on timing after a launch.
- **"On the v3.0 path"** means a row PR-41 depends on, directly or through other rows, under the Done means ruled on 10/10. Under the older Done means more rows would count as on the path; M7 and rule 5 are about exactly that difference.
- **Asks of you** come from two partial sources: the session records (about 100 in-session asks) and four end-to-end traces through the dispatcher's updates. Neither sees every dispatcher turn, so the totals are floors.
- **The replay in section 5 is by hand.** It shows what the rules would have routed, not what you would have ruled at each fork.
- **Linear attributes every agent write to the PM's account**, so "who filed" is rebuilt from session records and branch names, never from Linear's creator field.
- **The triage design had two adversarial passes, the cap.** Pass 1 failed it: the draft had inverted P-16's LOUD and QUIET, treated live database code behind a "dark" feature as dark, and let a loud-only finding hold a go-live. Pass 2 confirmed those fixes and found six more QUIET holes: dark decided from git when allowlists live only in production; a live finding outside the project with no launcher; no louder fix for a leak; a class spanning two flags; an alarm that cannot switch off output already on; an unlabelled gate a prune could close. Each is closed by the amendment pass 2 proposed, and section 5 states the result. No third pass ran. The build that implements D1 is clinical and plan-gated, carries those nine cases as named tests, and gets its own review on the code.
