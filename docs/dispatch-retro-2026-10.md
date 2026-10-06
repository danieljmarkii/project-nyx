# /dispatch retro 3: is a cap of 3 right, what breaks under the hood, the team's read, what to borrow

**Date:** 2026-10-05 · **Issue:** CUL-1606 · **Status:** 🧊 dated record (correct it additively, never in place)
**Covers:** Engines v3 (9/28 to 10/5) and Out of beta (10/3 to 10/5), dispatch v1 through v1.3.
**Evidence:**
- 63 `/dispatch run` status updates.
- 82 PRs (#975 to #1074), every merge replayed with `git merge-tree`.
- 20 session transcripts read end to end: 5 dispatchers, 13 dispatched children and 2 hand launches, 26,938 events.
- CI and deploy history.
- A web research pass, with every source either fetched or marked unverified.
- Seven isolated persona reviews over one evidence pack. Every load-bearing claim was re-checked against its primary source; the corrections are in the appendix.

Prior retros: `docs/sessions/2026-09-28-cul-1395-dispatch-v1.md`, `2026-09-29-dispatch-v1-1-sub-issues.md`, `2026-10-03-dispatch-v1-2.md`, `2026-10-03-dispatch-v1-2-retro.md`.

## TL;DR

**Dispatch works.**
- 65 PRs merged in about a week, a median of 47 minutes from launch to merge.
- No textual merge conflict among its own children, and nothing reverted.
- Every child that launched sent its first message back.

**Raise the cap, but count it across the whole repo.** All seven lenses agree on that; none of them would merge #1024 (5 per project) as it stands.
- Today 3 per project, recommended 6 across the whole repo.
- Of the 6, at most 3 may be waiting on you, and at most 3 may write production, one migration at a time.

**The cap is not what slowed things down.**
- Ready rows spent 69% of their waiting time with a slot free, and only 31% behind a full cap.
- The real losses were:
  - children whose merge never woke the dispatcher;
  - a dispatcher that outgrows its memory and then writes wrong state into the only record it keeps;
  - collision rules that stop at the project edge while the repo, the database and `main` are shared.

**Approvals have drifted from the spec.**
- Only 2 of 13 sampled children waited for a plan approval.
- The dispatcher relays your approvals over a channel the platform itself marks "NOT USER INPUT".
- A child applied a production migration on a one-tap reply, outside every rule.

**Two findings are not about dispatch and should not wait for it.** Both are on their issues.
- A diet-trial screen can still say "No symptoms are on the record" after a vomit is logged (CUL-1560). It was a `GA gate`, and the graduation passed it unseen.
- The device sitting was skipped on the premise that every feature kept its off switch. A ruling two hours later removed the switches, and the remaining device check covers none of the safety states (CUL-1482).

Section 7 holds six decisions, each with a recommendation. Section 8 holds the fixes that need none.

**Ruled 2026-10-06:** the PM took all six recommendations. Section 9 records what each one set in motion.

---

## 1. What is working (keep it)

| Measure | Value | Source |
|---|---|---|
| Dispatched PRs merged | **65** by 10/5 23:03Z (Engines v3 24, Out of beta 41), plus 14 hand launches in the same window | GitHub |
| Launch → merge | **median 47 min** (p25 36, p75 77; 64 measured). Out of beta: median 40, max 148. Engines v3: median 78, mean 141 (review rounds and overnight waits) | sessions × PRs |
| Textual merge conflicts among dispatched children | **0** in 82 PRs. There were 2 conflicts in all, both on hand launches | every merge replayed |
| Same-file pairs among PRs open at once | 17 of 185 pairs (9%). Git merged all but the two above cleanly | file lists per PR |
| Pre-dispatch baseline | Design v2's four parallel PRs (9/21) "conflicted three times in one evening" | steward skill §8 |
| Reverts or hotfixes of dispatched work | **0** on `main` since 9/28 (caveat: the device sitting was skipped) | `git log` |
| Deploys | 77 function deploys since 9/28, every one from a merge; every live function matches its last signed deploy record | deploy records (Trust & Safety's count) |
| Required checks | green on the head of all 109 PRs merged since 9/28 | check runs (Trust & Safety's count) |
| Wakes | 48 of 48 "opened" wakes arrived; 27 child messages, 0 failed | transcripts |
| Your reply time to a brief | **median 3.1 min** (daytime 2.8) | transcripts |
| The loop when it is tight | 10/4 afternoon: merge → next launch in 1 to 3 minutes. Two things did it: `auto` rows, and your habit of picking a row in advance (`go 24b`) | status updates |
| Work found mid-project | ~16 follow-ups filed by children; rows added mid-flight (43b to 43e, 34b, 25b, 37b, 11b) | status updates |
| Safety nets that caught real things | see the list below | transcripts |

The safety nets:
- The claim protocol stopped a duplicate launch of CUL-1550.
- `rls-privacy-reviewer` found a real hole in migration 083 before its PR opened.
- Adversarial passes found three ways Home could show a calmer number than its own screen (PR-27b).
- PR-36 held correctly after 8 failed adversarial passes, and merged after the ninth.

Two things have no counterpart in anything the research found, so keep both. Claude Code's new Projects feature has neither.
- The ruling index.
- Dispatch's run order, with its hotspot logic.

## 2. The cap: should 3 go up?

### What the numbers say

Slot occupancy, minute by minute over waking hours (23:00 to 07:00 Chicago excluded), counting a child from launch to merge. Long-parked PRs are left out:

| Population | 0 running | 1 | 2 | 3 | 4+ | mean |
|---|---|---|---|---|---|---|
| Out of beta, dispatched children | 37% | 36% | 9% | 16% | 1% | 1.08 |
| Every coding session in the repo, same window | 22% | 26% | 16% | 23% | 13% | 1.98 |
| Engines v3 children, 9/29 to 9/30 | 28% | 45% | 4% | 22% | 0% | 1.20 |

- **The better measure is the waiting row.** The Data Scientist replayed Out of beta's dependency table. Ready rows spent **69% of their daytime wait with a slot free and 31% behind a full cap.** The loop cost more than the cap did.
- **The cap binds in bursts.** At the start of a wave, 14 rows were ready and three ran (10/3, PR #1024's own words). As this is written, Engines v3 reads `3 − … = 0` with two rows ready.
- **When it bound, you went around it.** There were two bursts of hand launches: 6 at 10/4 00:53Z and 5 at 13:23Z. Concurrency peaked at **10 coding sessions at once**. In your words: "I've moved forward w some work that wasn't suggested by you to just clear out more that are ready."
- **Two dispatchers ran at the same time** (10/3 and 10/5). The real ceiling was 6 plus hand launches, with nothing counting across them.
- **What a raise buys** (the Data Scientist's replay, assuming instant picks):
  - 3 → 5 cuts the mean time per row from 9.7 to 8.4 hours.
  - 3 → 4 buys about 70% of that.
  - The project's end date does not move. Late-added rows, the GA chain and the D1 ruling set it.
  - Cap 3 with instant picks is about as fast as cap 5 with 15-minute picks.
- **The cap raise you asked for never landed.** `cap 5` (10/3 19:24Z) became PR #1024. It is still an unmerged draft, and three dispatchers mentioned it 14 times. Law L4 of the September retro applies: a deliverable that lands only on an unmerged branch does not exist.

### What the cap protects, and what actually protects it

| Resource | Does the cap protect it today? | What does |
|---|---|---|
| Merge conflicts | Barely. The 0 conflicts among dispatched rows came from the hotspot rules and the run order | hotspot rules, "never at the same time" |
| Cross-project collisions | **No.** Hotspots are computed per project | nothing yet (the 084 clash, `pipeline.ts`, red `main`) |
| `main` staying green | **No.** Four merges in six minutes broke it (10/3 15:40Z), and `main` cancels its own superseded CI runs | nothing yet |
| Production writes | **No.** 32 deploying merges and 9 migration applies in 8 days (Trust & Safety's count), counted per project | the deploy's own pre-flight test, per function |
| Your attention | Partly. Replies take ~3 minutes, but 23 of your 24 replies inside children were the app's one-tap suggestion | nothing deliberate |
| Cost and rate limits | Proportionally: ~$13 median per child, ~$3 of dispatcher overhead per PR; no rate-limit stall seen at 10 concurrent | the plan's shared rate-limit pool |
| CI capacity | Not needed: no queueing at peak, 0 red PR runs | nothing needed |

The community numbers fit the instinct. Engineers who run parallel agents for months settle at 3 to 5, and the limit they name is their own code review.

You are not reviewing diffs, though. CI, the reviewer subagents and the merge gate do that, and your attention goes to rulings and approvals instead. That is why 10 at once did not break you. It also means the system's safety now rests on the automated gates and on how deliberate the few real approvals are, not on how many sessions run.

### The recommendation (decision D1)

**6 at once, counted across the whole repo** (both dispatchers and anything you start by hand), with two sub-limits:

- **No more than 3 waiting on you.** This protects your attention.
- **No more than 3 that write production** (Edge Function code and its `lib/` closure, `app_config`, migrations), **and one migration at a time.** This protects the database and the deploy pipeline.

A parked PR takes no slot, but it keeps its files and its migration number reserved. The raise takes effect once three fixes ship: the wake fix, repo-wide reservations, and one CI run per merge to `main` (section 8). Today that is 3 per project. One project alone gets twice that, and two projects together get what you were already running, now counted.

## 3. What is breaking that you cannot see

Ranked by what each cost.

**F1. A child that stops can't report its merge.**
- **How it happens.** Each child may send two messages: "opened", then "merged" or "stopped". When you answer a stopped child in its own session and it merges, it has no message left.
- **The cost.** 6 of 10 stops merged silently. The worst left 14 ready rows idle for 2h10m, and it recurred five times after CUL-1546 was filed.
- **The improvisation.** The dispatchers made up three contradictory fixes: "send a third", "don't send another", and "send your final wake".
- **Waste on the other side.** The `opened` message is meant to cost nothing, but it drew a full dispatcher turn every time: 48 of 189 turns, 5K to 18K tokens each.

**F2. The dispatcher outgrows its memory, and its memory is written by prose that doesn't fire.**
- **Growth.** Every dispatcher starts at ~146K tokens and gains 11K to 37K per turn. Each plan page is ~110K characters, and the spec re-reads it two or three times per wake. The generated Board alone is 30K characters, two thirds of them Linear's link tags. The busiest dispatcher compacted twice in 16 hours.
- **The record went wrong.** The status updates are the dispatcher's only memory, and they drifted:
  - merged rows came back on the `Auto:` line;
  - six launches were never recorded with a session id, so step 0 could never have found them dead;
  - check-ins stopped being armed;
  - Board timestamps were composed instead of read from the clock (49 of them future-dated);
  - page-write failures rose from 0 of 24 to 16 of 78.
- **Not only compaction.** The third dispatcher never compacted, and it still composed 15 of 16 timestamps and failed 8 of 24 page patches. These are law L2 failures: rules written as prose fire approximately never.
- **The Board you see.** The Out of beta Board carries a malformed row (`| 12 | </pull-request> |`), a row "waiting on" a PR that merged, and a critical path missing five ✓ marks.
- **The cost.** Three takeovers in two days, one forced by a Linear sign-in drop ("connectors load only when a session starts"), and ~$174 of dispatcher cost.
- **The shape.** The spec grew from 15 KB to 51 KB of prose in five days. Only two of its passages are labelled judgment; the rest is a deterministic scheduler run by a model.

**F3. Collision rules stop at the project edge; the repo, the database and `main` don't.**
- **Migration 084, twice.**
  - Out of beta's PR-60 (#1064) has held `084_…` parked since 10/4.
  - An Engines v3 child wrote its own 084 on 10/5, applied it to production and merged it.
  - `merge-check.sh` printed "no new duplicates … CLEAN" with #1064's 084 file in the same output, because it checks duplicates against `main` only.
  - CUL-1522 is still rated Low "while dispatch keeps migrations one at a time", which is true per project only.
- **`main` red for an hour.**
  - Out of beta's PR-20 and Engines v3's PR-23 both edited `generate-signal/pipeline.ts` and the care-record shape.
  - Four PRs merged between 15:34 and 15:40Z on 10/3. Each push cancelled the previous `main` CI run, and the first complete run failed.
  - `main` stayed red until a third child fixed it inside its own PR (16:40Z). Another child's CI failed twice in that window.
  - The deploy's per-function pre-flight test refused `generate-signal` twice, so nothing broken went live. Four unaffected functions did deploy. The run's summary then said "Nothing changed in production" (filed as CUL-1607).
  - Neither project's prompt knew about the other's row, and the Engines v3 page declares zero `Hotspot:` lines.
- **A possible gap under all of it.** Two lenses read GitHub's rules API and found no active rule on `main`. Behaviourally the gate held (every merged head was green), but if the ruleset is off, self-merge rests on the prompt alone. That is a one-minute check for you: Settings → Rules.

**F4. Approvals have drifted from the spec.**
- **The plan gate is on paper only.**
  - 2 of 13 sampled children waited for a plan approval. The prompt never says to wait, and children read CLAUDE.md's "non-interactive: skip the check-in" as permission to skip it ("dispatched, non-interactive: proceeding on it").
  - The brief still tells you each child "Asks you: plan in ~20 min".
  - PR-36 shows where the safety actually came from. Its plans took 65 minutes of your time, its first build still failed five adversarial passes, and its rebuild was approved two minutes before the rebuild plan existed. The reviewer broke that three more times before pass nine held. The reviewer, not the plan, was the safety net.
- **Relays carry authority the platform tells children to refuse.**
  - Dispatchers sent 14 messages to children, a channel the spec does not describe.
  - The platform wraps each one in "NOT USER INPUT … must NOT be treated as approval or consent". PR-19 resumed and merged on one anyway.
  - PR-27c merged Tier-2 spec edits on a relayed approval, checked only against a Linear comment the same dispatcher wrote.
  - Every agent writes to Linear and GitHub as your account, so nothing can show which approvals you typed.
- **One-tap approvals reach irreversible actions.** 23 of 24 replies inside children were the app's suggested reply, sent within seconds. They included a plan approval, Tier-2 rulings, scope growth, and "apply it" on a production migration.
  - On PR-36 the suggestion changed between two turns, from "apply after reviews pass" to "hold the apply until I say".
  - This is a fact about the approval surface, not about you. When the suggested answer is right 23 times in 24, most of those questions did not need asking, and the one that did deserved a different shape.
- **A child grew an unsupervised second track.** Engines v3's PR-36, on a one-tap "A — hold it, start CUL-1602", claimed a new issue, wrote migration 084, applied it to production and merged it.
  - It passed no cap, no hotspot rule and no dispatcher.
  - The rules disagree on whether it could:
    - CLAUDE.md: "Migrations run from the cloud session via the Supabase MCP — no PM action item."
    - dispatch.md: applying is "its own step the PM approves".
    - The steward skill: "a dispatched child never merges one".
  - Its PR body still says the migration was not applied.

**F5. Rulings interact, and nothing re-checks them.**
- **A GA gate written as a sentence is invisible.** CUL-1560 says it "Blocks: the daily look leaving beta". It has no project, no `blocks` relation, and never appears in the run log.
  - Noticed left beta 22 hours after it was filed.
  - The defect is still on `main`: the trial outcome sheet keeps its first read, so "No symptoms are on the record for either stretch" can stand beside a vomit logged a minute earlier.
  - Of the ~14 follow-ups children filed, 13 are open. None is in the Out of beta project, where the no-row detector looks. Two are High (CUL-1577, CUL-1594).
- **A skip that rested on a premise.**
  - The device sitting (CUL-1529) was skipped at 21:01Z on 10/4. The stated premise: "Until that OTA, every feature still has its off switch."
  - At 22:55Z, D1 was re-ruled: no OTA, all four features on in 1.2.0. PR-50 to PR-53 then deleted the switches.
  - CUL-1482, the only device check left before App Review, covers none of the safety states. "Test in prod" can't reach them either, because they need a sick pet.

**F6. Parked PRs eat a slot and rot.**
- PR-60 (#1064) has counted as one of three slots since 10/4, but no session is working on it.
- It now conflicts with `main` on CLAUDE.md, STATUS.md and a spec.
- Its session was archived mid-turn, so nothing will resume it.
- GitHub sends no webhook when a merge makes another PR conflict.

**F7. `auto` let through two rows its own limits exclude.**
- PR-27b and PR-27c launched `auto` although their build note names `adversarial-reviewer`, and 27c's also names Tier-2 edits.
- The cause is in the spec, not the model. Step 6's launch limits omit kind *e*'s word test, and both read the review requirement from the issue, never the note.
- The dispatcher then had to ask PR-27b for the pass after launch.

**F8. The pre-push hook is each child's biggest time sink.**
- It runs the full type check and jest suite on every push, docs-only session records included, and CI runs the same suite again.
- That is 3.5 to 12 minutes per push and 9 to 81 minutes per child. PR-10 spent 29 of its 46 minutes pushing.
- This retro's own docs-only push took 206 seconds.
- Children end turns mid-push and get bounced by the stop hook up to 11 times, and self-matching `pgrep` waits killed their own pushes in three sessions.
- Making each child faster is capacity too.

**F9. Small, real, cheap.**
- **A safety merge with no clean pass.** PR-19 merged after fixing a safety-card break without the fresh adversarial pass CLAUDE.md C-19 asks for. The card ships dark behind an unseeded flag, so the miss lands when that flag goes on.
- **Unpinned merges.** Three merges skipped pinning the head SHA.
- **Misleading session states.** Children archived 10 to 15 seconds after their last message show FAILED. One shows BLOCKED only because its last sentence mentions a question.
- **Truncated titles.** Out of beta's long name truncated child titles ("… · PR-39" for both 39b and 39c) and produced 80-character branches.
- **Invented verbs.** The verbs you and the dispatcher invented (`offer 1564`, `go 29`, `cap 5`, `cleanup`) are not in the spec, so every new dispatcher learns them again.
- **A repeated line.** 37 of 41 Out of beta status updates repeat the same `Dismissed:` line.

## 4. The team's read

Seven lenses read the same evidence pack in isolation.

| Lens | Verdict in its own words (condensed) | Its distinctive call |
|---|---|---|
| **Dir. of Engineering** | Within a project it works; its trouble is its shape: "a deterministic scheduler run as 51 KB of prose", whose memory "is written by the part of the system that forgets", with rules per project over shared resources | Script the core (selection, the `auto` check, the Board and the status lines as one tested function); one repo-wide map of work in flight read from git; stop cancelling `main`'s CI runs; a faster pre-push hook. Would **not** build a merge queue (GitHub offers it only to organization repos), a branch-up-to-date rule, a super-dispatcher, or relays |
| **Sr. QA** | "Fast and clean wherever a check exists; its serious failures sit where no check looks" | Edge cases the spec misses, starting with a parked migration PR holding no hotspot (more below). Pin the head SHA and tie the adversarial verdict to the merged commit |
| **Product Owner** | Linear tells the truth about what merged, "not about what is running, what is owed or what has been decided" | Gates become Linear relations (a `GA gate` label or a "Blocks:" line must carry one); offer High and gated follow-ups as rows wherever they were filed; test Linear's non-closing keywords; give the ruling index a priority |
| **Trust & Safety** | "Deploys are well governed… Approvals are not: nothing can prove the PM approved a given production write" | Production writes go through the permission dialog, which records a response no agent can write. "Authority never travels; facts do": the dispatcher may send facts, never approvals. A repo-wide production ledger |
| **Sr. Data Scientist** | "The case for a bigger cap rests on a number that doesn't measure it"; the loop costs more than the cap | The waiting-row replay and the cap model in section 2; a validated scorecard on every status update; hand off to a fresh dispatcher before ~500K; the experiment (alternate cap 3 and 5 by half-day on the next wide project) |
| **Sr. Product Designer** | "The engine works, but the surface the PM drives it through does not": it speaks dispatch's internals ("40 gates.. why does this feel so complicated"), so you became the glue | One computed "Waiting on you"; ask only real decisions, naming the object and its consequence ("apply 084: #1064 holds 084 too"); your words in the grammar (`go` alone takes the recommendation, `go <row>` queues one); a 07:30 card across projects |
| **Dr. Alex Chen** (+ Jordan, Sam) | "Within each row the clinical review is real… Across rows it is thin" | Run the safety slice before 1.2.0; tie "adversarial: pass" to the merged commit; deploy only from a green `main`. Jordan: "Home and the trial screen must show the same count." Sam: "protect that 'Call your vet today' screen" |

QA's edge cases:
- A parked migration PR holds no hotspot.
- A merge by anyone other than the child sends no wake.
- A takeover dispatcher inherits none of the old session's PR subscriptions.
- A launch recorded without a session id can never be detected as dead.

### Where all seven agree

1. **Count and reserve across the whole repo**: cap, hotspots, migration numbers, both dispatchers and hand launches.
2. **Don't merge #1024 as it stands.**
3. **The plan gate on routine rows is ceremony.** Keep a stop, written into the prompt itself, for migration, RLS, deletion, clinical and Tier-2 rows. Dir. of Engineering's measurement settles where it must live: steps written into the template fired 48 of 48 times; the gate the template only points to held 2 of 13.

### Where most agree

- **Fix the wake by spending the useless `opened` message on the one that was missing** (Dir. of Engineering, Designer); also learn merges from GitHub (QA, Data Scientist).
- **Script the deterministic half, and check the dispatcher's memory against GitHub** (Dir. of Engineering, QA, Product Owner, Data Scientist, Designer).
- **One CI run per merge to `main`** (Dir. of Engineering, QA, Data Scientist, Dr. Chen).
- **Shrink the Board to what you read**: drop the per-row table and the critical-path reprint (Product Owner, Data Scientist, Designer), drawn by the script (Dir. of Engineering).

### Where they disagree (Persona Conflict Protocol)

> **Sr. Product Designer:** One inbox. Answer every question in one place and have the answer written back to whoever asked; today you answer in a dozen sessions.
> **Trust & Safety, Dir. of Engineering:** An approval must be typed where the act happens. A relayed one can't be verified (every session writes as your account), and the platform marks it "NOT USER INPUT".
> **PM decision needed:** D3.

> **Dir. of Engineering, Product Owner:** Keep 3 per project until the fixes land; the costly collisions crossed projects.
> **QA, Dr. Chen, Designer:** 5 is fine once the count is repo-wide.
> **Trust & Safety, Dr. Chen:** Ration production-writing and clinical rows separately; more server rows means more unattended production writes.
> **PM decision needed:** D1. The recommendation sits in the middle: 6 repo-wide, two sub-limits, after the fixes.

> **Dir. of Engineering:** The pre-push hook should run only the tests related to the change; CI already runs everything and has failed 0 of 100 times.
> **No lens defended the full suite**, but the rule exists to keep CI green. **PM decision needed:** D5.

## 5. What to borrow, and what not to

From the research digest. Every source was fetched or is marked unverified. Reddit was blocked to the fetcher, so there are no Reddit quotes.

| Idea | Where it comes from | Verdict |
|---|---|---|
| A coordinator that "works from recent messages, recent threads, and project memory rather than its full history" | Claude Code Projects (verified) | **Borrow** the principle. The dispatcher's memory is already the status updates, so it can hand off to a fresh session by design |
| One "Waiting on you" group, so approvals clear in one sitting | Projects' Overview | **Borrow**, computed from marked questions on the issues, not from session states (here FAILED and BLOCKED are tooling artifacts) |
| A go-ahead given to the coordinator "doesn't reach" a thread | Projects (verified) | **Borrow**: it is D3's recommendation |
| Compute "ready" from structured dependencies, keep machine state in JSON, regenerate whole sections | Beads (`bd ready`); Anthropic's long-running-agent harness | **Borrow** for the script; the Data Scientist's replay did it in ~110 lines |
| "If you could describe the diff in one sentence, skip the plan" | Anthropic best practices | **Borrow** for D2 |
| Trust external facts over self-reports: flag a child with no push in N minutes | Agent teams; Gas Town's Witness | **Borrow**, cheap |
| On every merge, check open siblings for new conflicts (GitHub sends no webhook) | Claude Code docs | **Borrow**, but the finding goes to your digest, not as a message to the child (D3) |
| Linear's non-closing keywords (`part of`, `refs`) and `ignore CUL-X` | Linear docs (verified) | **Test with one PR.** Two earlier measurements here disagree (CUL-803 vs CUL-1397). If a keyworded mention stays open, the PR text can be linted instead of hand-pruned |
| A merge queue | GitHub, Graphite, Gas Town's Refinery | **Not available**: this repo is owned by a user account. One CI run per merge, plus "don't merge while `main` is red", gets most of the value |
| Launch planning-only children at night, approve in a morning batch | Mitchell Hashimoto | **Refuse**: PRs open overnight are where the collisions lived, and the approvals it batches are already one-tap |
| Pilot Claude Code Projects on one low-risk track | Anthropic (Pro/Max beta) | **Watch, don't adopt.** It has no run order, dependencies, hotspots or hard cap, and its list lives outside Linear (the Product Owner: a second plan of record) |
| Gas Town, Ruflo, tmux/worktree managers, cross-child stacked PRs | various | **Skip**: terminal-bound, costly (one field report: $6,000 in two weeks at 13 agents) or abandoned |

## 6. The retro ritual's four questions (`docs/personas.md` § Periodic Process Retro)

1. **What did a persona miss?**
   - The Product Owner lens missed a `GA gate` that existed only as a sentence (CUL-1560).
   - QA and Dr. Chen missed that the device sitting's skip rested on a premise the D1 re-ruling removed two hours later.
   - The Dir. of Engineering lens let dispatch's spec triple in five days, as prose.
   - This retro's own first draft counted a hand launch as dispatched; the Data Scientist caught it.
2. **What rule prevents that class?**
   - **Gates are relations, not sentences.** A `GA gate` label or a "Blocks:" line must carry a `blocks` relation, checked by the groomer with a guard test.
   - **A ruling's brief names the earlier rulings it touches.** It goes in the brief's Consequence line, so a re-ruling shows what it unseats.
   - **Deterministic dispatch logic lives in a tested script (L2).**
3. **What is now over-process?** Cut these four:
   - the `opened` wake;
   - the Board's per-row table and critical-path reprint;
   - the plan gate on routine dispatched rows;
   - the repeated `Dismissed:` line.
4. **What working file is bloating?**
   - `dispatch.md`: 15 KB to 51 KB in five days.
   - The plan pages: ~110K characters each, 28% of them the generated Board.
   - The dispatcher's context: ~146K at the start, ~600K at takeover.
   - The `Waiting on PM` label: about 151 open against its cap of 30 (the Product Owner's count). Dispatch's ruling index is the only list on it ranked by what each ruling frees.

## 7. Decisions for the PM

> **Ruled 2026-10-06 by the PM: all six as recommended.** Section 9 records the rulings and the build they started.

**D1. The cap.**
- **Deciding:** how many sessions build at once, and what counts toward the limit.
- **Options:**
  - **(a) Recommended:** 6 at once across the repo, counting both dispatchers and anything you start by hand. At most 3 waiting on you; at most 3 writing production, one migration at a time. Parked PRs take no slot but keep their reservations. In force once section 8's first three fixes ship. *Why:* the collisions came from what nobody counted, not from the number. This is what you were already running across two projects, now counted.
  - (b) Merge #1024 as it is (5 per project). Fastest, but it keeps the blind spot that produced the 084 clash and the red `main`, and two dispatchers could then run 10 with nothing counting across them.
  - (c) Keep 3 and fix the loop first, then decide on a week of scorecard data.
- **Dissent:** Dir. of Engineering and the Product Owner would hold 3 per project until the fixes land.
- **Consequence:** (a) closes #1024 as superseded and folds into the v1.4 build.

**D2. The plan gate for dispatched rows.**
- **Deciding:** whether a dispatched child waits for your go before it writes code. The rule dates from 2026-08-16 and protected against building the wrong thing.
- **Options:**
  - **(a) Recommended by QA, Trust & Safety, Designer and Dr. Chen:** retire it for routine build rows. The row's build note, which you approved when you picked the row, is the plan. Keep a stop, written into the prompt itself, for rows that apply a migration, change RLS or deletion, touch a clinical surface, or edit a Tier-2 spec. *Why:* 11 of 13 already skipped it with no harm found, the one that waited cost 40 minutes, and the brief's "Asks you: plan" is untrue today.
  - (b) Enforce it for every row, written into the prompt. Honest, but about 40 minutes and one more tap per row.
  - (c) A per-row `plan` marker. The Designer refuses: "it spends a PM decision to save one."
- **Consequence:** (a) removes about one question per row. The rows that matter still stop.

**D3. Where an approval counts.**
- **Deciding:** whether a relayed or one-tap approval may start an irreversible or gated act.
- **Options:**
  - **(a) Recommended by Trust & Safety, Dir. of Engineering, QA and the Product Owner:**
    - Authority never travels; facts do. The dispatcher may send a child facts with links, never approvals.
    - An approval counts where it is typed: in the child's own session, or in the dispatcher's session when the dispatcher does the act itself through the same gates (as it did for #1013, #1066 and migration 083; these become spec verbs).
    - A production write (a migration apply, a writing SQL statement) needs a confirmation no agent can produce: the permission dialog, if it still prompts in Auto mode, else typing the migration's number.
    - A child never starts a second track; new work comes back as `add`.
    - The dispatcher's digest is the one inbox, with a link to each question.
  - (b) Formalize relays: a quoted approval with its timestamp, checked against the dispatcher's status update. This is one inbox in the fullest sense (the Designer's preference), but it is unverifiable, because every session writes as your account.
  - (c) Leave as is.
- **Consequence:** under (a) you switch sessions only for the few gated questions. Routine rows never ask (D2). It also settles the CLAUDE.md, dispatch.md and steward disagreement over migrations in one sentence.

**D4. The dispatcher's shape.**
- **Deciding:** whether to rebuild dispatch's deterministic half as a tested script.
- **Options:**
  - **(a) Recommended by Dir. of Engineering, QA, the Product Owner and the Data Scientist:**
    - One tested script computes ready and held rows, the slots, the reservations, the `auto` check, the status lines and a much smaller Board.
    - Each wake checks the status updates against GitHub.
    - The dispatcher hands off to a fresh session before ~400K tokens.
  - (b) Hand-off rule only. Cheap, but it keeps the prose that drifted without compaction too.
  - (c) Adopt Claude Code Projects instead. It lacks run order, dependencies, hotspots and Linear claims.
- **Consequence:** (a) is two or three PRs and makes a takeover lossless. **One question for you first:** do you open the Board on the plan page, or read the digests? If the digests, the Board can shrink to six lines.

**D5. The pre-push hook (a rule with a date on it).**
- **Deciding:** whether children keep running the full jest suite before every push.
- **Options:**
  - **(a) Recommended by Dir. of Engineering:** in cloud sessions, `tsc` plus the tests related to the changed files. CI keeps the full suite as the required check. *Why:* CI has failed 0 of the last 100 PR runs, and the hook costs each child 9 to 81 minutes.
  - (b) Skip the suite only on docs-only pushes. The safest option, with a smaller gain.
  - (c) Leave it.
- **Consequence:** (a) shortens a typical child by 10 to 25 minutes, worth roughly one more slot. CI may go red a little more often, at about 9 minutes per red run.

**D6. Before the 1.2.0 cut** (not dispatch; found here; never-list).
- **Deciding:** whether two safety items gate the store build.
- **Recommended:**
  - Make CUL-1560 block the cut and dispatch it now (fix S, test already specified).
  - Add the ~25-minute safety slice of the old sitting (steps 3, 13, 17, 23, 28a, 32, 34, 42, 61 to 66 and 72, on the fixture account) to CUL-1482.
- **Alternative:** ship and fix in the next build.
- **Consequence:** about half an hour of your time on a phone, before App Review sees four features with no off switch.

## 8. Fixes that need no decision (the spec's own intent, or plain bugs)

They group into three themes. They would ship as dispatch v1.4, each its own sub-issue, after the decisions above.

**Know what's true**
1. **The wake.** Drop the `opened` message. A child's two messages become `stopped`, if it stops, and then its terminal `merged` or `done`. Every `stopped` wake arms a check-in, to catch a merge made by someone else. This closes CUL-1546.
2. **Check memory against facts.** Each wake compares open and merged PRs and `claude/<slug>-pr*` branches against the status updates' launch and `Auto:` lines. A launch line without a session id and branch, a timestamp ahead of the clock, or an unparseable Board is refused.
3. **Archive only when nothing remains.** A session whose PR is still open is never archived.

**Count the whole repo**

4. **Reserve across the repo.** Read every open PR's files and migration numbers into one map, both dispatchers' rows and hand launches alike. Add `pipeline.ts` and the steward §8 files to the hotspot list.
5. **Widen CUL-1522 and raise it.** Make it a required check: duplicate migration numbers across open PRs fail. A parked PR keeps its reservations.
6. **One verdict per merge.** `main` gets its own CI run per merge (`ci.yml` stops cancelling `main`'s in-flight runs). `merge-check.sh` is not CLEAN while `main` is red, unless the PR is the fix.

**Ask only what matters**

7. **One `auto` check.** Proposal and launch use the same predicate, and it reads the issue and the build note.
8. **Literal stops.** Write the stops D2 keeps into the prompt template itself.
9. **Re-review safety fixes.** Clinical diffs carry `Adversarial: PASS @<sha>`, so a fix made after a failed pass needs a fresh one (C-19). Pin the head SHA on every self-merge.
10. **Gates as relations.** The groomer refuses a `GA gate` or "Blocks:" without a `blocks` relation. High and gated follow-ups are offered as rows wherever they were filed (this makes `offer` official).
11. **Your words in the grammar.**
    - `go` alone takes the recommendation.
    - `go <row>` queues a row and launches it when it is ready; this is your advance pick, made official.
    - Briefs name rows by number, not by letters that change each brief.
    - A short project alias for titles and branches.
    - One `Dismissed:` line, written only when it changes.

**Housekeeping**

12. Close #1024 as superseded (D1).
13. Give the ruling index CUL-1528 a priority.
14. Port v1.4 to the operating kit (CUL-1517).
15. Run the Linear keyword test on the first v1.4 PR.
16. CUL-1607, the deploy summary.

**For you, one minute:** confirm the `main` ruleset is Active under GitHub → Settings → Rules. Two lenses' reads saw no active rule.

## 9. Rulings (PM, 2026-10-06)

The PM's words: "go with your recommendations on all six, then merge".

**What each ruling set in motion:**
- **D1, the cap:** 6 across the repo, with the sub-limits in section 7. It takes force when A1, A2 and B (below) have merged. #1024 is closed as superseded.
- **D2, the plan gate:** retired for routine rows. B writes the stop for migration, RLS or deletion, clinical and Tier-2 rows into the prompt template itself.
- **D3, approvals:** D builds the hooks, and first tests whether a hook's `ask` still prompts in Auto mode. B writes the rule and reconciles CLAUDE.md, `dispatch.md` and the steward skill on migrations.
- **D4, the script:** C. D4's question (the Board or the digests) went unanswered, so C asks it before it shrinks the Board.
- **D5, the pre-push hook:** A2.
- **D6, before the 1.2.0 cut:**
  - CUL-1560 and CUL-1482 now block CUL-559 as Linear relations, not sentences.
  - CUL-1560 moved into Out of beta with `Gate: clinical`. Its fix session (`session_01Kp8EyFnqTcLA7gufHSZbot`) launched at 00:52Z on a branch that names no issue. Its prompt already carries the ruled shapes: the plan stop written in, the go typed in its own session, and the wake without `opened`.
  - CUL-1482 gained the safety slice as checks 17 to 27. The whole pass is now about 40 minutes.

**The build:** parent CUL-1612, one sub-issue per PR.
- **Wave 1, in parallel** (disjoint files):
  - CUL-1522 (A1): merge-check catches duplicate migration numbers across open PRs and refuses CLEAN while `main` is red; a CI job enforces the first.
  - CUL-1613 (A2): every merge to `main` gets its own CI verdict; the pre-push hook runs only the related tests in cloud sessions.
  - CUL-1616 (D): production writes need a confirmation no agent can produce; dispatcher messages carry facts only.
  - CUL-1617 (E): the groomer refuses a gate written as a sentence with no `blocks` relation.
- **Wave 2:** CUL-1614 (B), the spec. It also finishes CUL-1546, the wake.
- **Wave 3:** CUL-1615 (C), the script, after B.
- **Then:** CUL-1517, the port to the operating kit.

**Section 8's housekeeping:** CUL-1528, the ruling index, is now High. CUL-1607, the deploy summary, stands on its own. The keyword test rides on the first v1.4 PR to merge; CUL-1612 says how.

**Still open:** whether the `main` ruleset is Active (one minute, section 8).

---

## Appendix: method, and what the reviews corrected

**Method.** Evidence was gathered first and frozen into one pack, `retro/evidence.md` in the session's scratchpad (not committed). The seven lenses then read it in isolation, each with the same brief.

Every finding that moved a recommendation was re-checked against its primary source in this session. The sources were git, the CI and deploy logs, the Linear issues, the transcripts, and the code at `TrialCompletionSheet.tsx:115` and `summary.ts:141`.

**Corrections made after the reviews:**

- **#994 was a hand launch carrying dispatch tags.** Without it, the median is 47 minutes (not 48), and Engines v3's mean is 141 (not 204). (Data Scientist)
- **#1072 (PR-36) merged at 23:03Z**, after the evidence was frozen.
- **The status-update drift is not only a compaction effect.** A dispatcher that never compacted showed it too, which points at prose rules (L2) rather than memory loss alone. (QA)
- **"Clinical functions deployed from a broken `main`" is half true** (Dr. Chen, refuted in part):
  - The deploy runs each function's own tests before deploying it, and that refused the broken `generate-signal` twice.
  - Four unaffected functions did deploy from the red commits.
  - The run's summary then wrongly said nothing changed (CUL-1607).
- **"0 CI failures" needed a caveat.** `main` cancels its own superseded runs, which is how the 10/3 break hid behind an innocent PR. (Data Scientist)
- **"0 conflicts" grades the planner on its own picks.** 0 conflicts in 11 shared-file pairs is still consistent with a true conflict rate up to about 24%. (Data Scientist)

**Not verified:**
- Whether the `main` ruleset is active (one minute for you).
- Whether a permission-dialog rule still prompts in Auto mode (test before relying on it in D3).
- Reddit threads (blocked to the fetcher).
- Several launch dates for third-party tools (search results only).
