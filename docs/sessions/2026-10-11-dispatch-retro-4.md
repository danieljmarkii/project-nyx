# Dispatch retro 4: the findings outran the core track

**Date:** 2026-10-11
**One thing:** P6 L1 — Deciding to decide: an open ruling is a cost, and the gap it leaves fills with easy decisions · check: pending
**One thing (re-ask):** P3 L1 — Sequencing: the sheet puts first the rulings that free the most work (from 2026-10-11, the ruling sheet) · check: pending

Shipped via #1190 ([CUL-1858](https://linear.app/projectnyx/issue/CUL-1858)). Interactive DISCOVERY session, branch `claude/dispatch-retro-4`. The PM asked for a retrospective on `/dispatch` after Engines v3 ("it felt like dispatch was creating more issues than we could actually even keep up with") and a broader review of the workflow, using what the Claude Code community recommends. The write-up is `docs/workflow-retro-2026-10.md`; its phone page, `docs/workflow-retro-2026-10.html`, is published at https://claude.ai/artifact/1vDqBVCKAx9JSX2eKjGPLa.

## How it ran

- **This session:** read `dispatch.md` v1.7, retros 2 and 3, the Engines v3 page (96K characters) and its 146 dispatch status updates. Traced four follow-up rows end to end, and verified the two holds on PR-41 and `main`'s missing ruleset at their source.
- **Four agents in parallel:**
  - Linear issue-flow forensics: 202 issues classed by origin.
  - Dispatched-session forensics: 68 records.
  - A repo-wide process audit.
  - An online research pass. Every quoted source was re-opened and checked.
- **Two `adversarial-reviewer` passes** on the proposed triage rule, the cap.

## What it found

- The run order grew from 47 rows (9/28) to 85, and 29 of the 38 added rows came from follow-ups.
- The merge mix flipped:
  - 9/28 to 10/3: 29 of 34 merges were planned rows.
  - 10/5 to 10/9: 19 of 24 were follow-up rows.
  - 6 of the 28 follow-up rows that shipped were on the v3.0 path.
- **The constraint was the PM's typed decisions, not slots.**
  - A traced follow-up row cost 3 to 7 of them.
  - Follow-ups filled the "waiting on the PM" sub-limit.
  - W3 to W7 aged 13 days and D1 to D8 aged 17.
- **The PM's own valve was prose.** The 10/9 rule, "follow-ups go to Wave 7 by default", lived only on the page; no prompt and no script read it. That is L1 and L2 again.
- **[CUL-1438](https://linear.app/projectnyx/issue/CUL-1438) is live false reassurance in the shipped Signal,** parked in Wave 7 since 9/30.
- **The `may_wait` fork ([CUL-1611](https://linear.app/projectnyx/issue/CUL-1611))** was briefed as two PRs plus the render, with a louder option B available. It took nine rows.
- **Wider workflow:**
  - A dispatched child loads ~37K tokens before code, and about 3.5% of that is its own row.
  - All six review subagents load the full CLAUDE.md.
  - Each change is written up four times.
  - `main` has no ruleset, though CLAUDE.md says it does.

## Decisions put to the PM

D1 sort findings by what they can do · D2 a ruling travels with its work · D3 a forecast is a budget · D4 freeze the process once this lands · D5 split CLAUDE.md by when it is needed · D6 reviewers start cold · D7 one write-up per PR. Each has a recommendation in § 8 of the write-up.

## Rulings (PM, in this session)

D1 A · D2 A · D3 A · D5 A · D6 A · D7 A, then D4 A in a tuned form. D4 first drew "I don't really understand this one", then "Does d4 propose pausing using dispatch" (no: it pauses changing the tools, never using them). Then came "I want an optimal dispatch experience", answered with the tuned version: one week, friction counts as a bug, a readout ([CUL-1876](https://linear.app/projectnyx/issue/CUL-1876)), then weekly batches. The PM typed "A". The build is [CUL-1869](https://linear.app/projectnyx/issue/CUL-1869): [CUL-1871](https://linear.app/projectnyx/issue/CUL-1871) (D6), [CUL-1870](https://linear.app/projectnyx/issue/CUL-1870) (D1 to D3, the rules), [CUL-1872](https://linear.app/projectnyx/issue/CUL-1872) (the script), [CUL-1873](https://linear.app/projectnyx/issue/CUL-1873) (D7) and [CUL-1874](https://linear.app/projectnyx/issue/CUL-1874) (D5). C, D and E are blocked by the rules PR. Under D2, [CUL-1438](https://linear.app/projectnyx/issue/CUL-1438) now carries `Waiting on PM` and `Gate: clinical`.

## Do today (the PM's yes, or a minute)

1. Pull [CUL-1438](https://linear.app/projectnyx/issue/CUL-1438) as a live fix.
2. Unparent [CUL-1741](https://linear.app/projectnyx/issue/CUL-1741), then close [CUL-1432](https://linear.app/projectnyx/issue/CUL-1432), so PR-41 is free.
3. Replace [CUL-1433](https://linear.app/projectnyx/issue/CUL-1433) with [CUL-1482](https://linear.app/projectnyx/issue/CUL-1482) in PR-41's After cell.
4. Close [CUL-1752](https://linear.app/projectnyx/issue/CUL-1752) as a duplicate of [CUL-1754](https://linear.app/projectnyx/issue/CUL-1754).
5. Turn on a ruleset for `main`.

## Filed or commented

- [CUL-1858](https://linear.app/projectnyx/issue/CUL-1858): the claim, both adversarial verdicts, and the outcome.
- [CUL-1866](https://linear.app/projectnyx/issue/CUL-1866): five contradictions that existing rulings settle, the draft sweep, #843, and the dispatcher-context check.
- Comments on [CUL-1438](https://linear.app/projectnyx/issue/CUL-1438) (live reassurance parked in Wave 7) and [CUL-1407](https://linear.app/projectnyx/issue/CUL-1407) (PR-41's two structural holds).

## Mistakes caught in session

- **The first draft of the triage rule inverted P-16's LOUD and QUIET.** It made an escalating break the live-harm trigger and sorted the sitting loud-first. Adversarial pass 1 caught it before the rule was presented. Pass 2 then found six more holes, all closed with its own amendments.
- **My first count of skips was about 2.** The dispatcher's 10/9 update records 19 skipped in one reply.
- **The draft said none of retro 3's collision classes recurred.** [CUL-1746](https://linear.app/projectnyx/issue/CUL-1746)'s red `main` was one.
- **The first plan size came from the page's "about 40 PRs".** The dispatch v1 dry run counts 47 rows on 9/28.

## After the merge

- **Applied at the wrap:** [CUL-1752](https://linear.app/projectnyx/issue/CUL-1752) closed as a duplicate of [CUL-1754](https://linear.app/projectnyx/issue/CUL-1754), which had already shipped the stamp (#1163, #1166). The `Waiting on PM` label held 90 open against a cap of 30, and the queue rule over the cap is to apply a low-risk call and log it.
- **The PM then asked for do-today item 5, the `main` ruleset ([CUL-1491](https://linear.app/projectnyx/issue/CUL-1491)).** It could not be done from here. `POST /repos/danieljmarkii/project-nyx/rulesets` returned HTTP 403 from the session's proxy: "Write access to this GitHub API path is not permitted through this proxy." Reads work; repository administration writes do not. The wrap had said a session could create it. That was wrong, and the comment on CUL-1491 was corrected and now carries the click path.
- **The visibility brief rested on a stale premise.** It said private with Pro keeps "enough Actions minutes". Measured from the Actions API for 9/27 to 10/11:
  - 1,088 CI runs at 12 to 16 billable minutes each, 304 of them cancelled and still billing 6 to 18 minutes;
  - about 30,000 to 40,000 minutes a month if private, against Pro's 3,000;
  - about $170 to $230 a month at $0.006 a minute.

  The volume that made private expensive is the same dispatch volume this retro measured. The PM ruled to stay public.
- **Shipped via #1192 ([CUL-1878](https://linear.app/projectnyx/issue/CUL-1878), a child of CUL-1491, so the parent stays open):**
  - `LICENSE`: all rights reserved, under "© 2026 Culprit" as in the website footer;
  - `SECURITY.md`: private reports to support@getculprit.app.
- **Still the PM's:** create the ruleset. After that, a session reads it back and makes CLAUDE.md's required-check line match.

## Teach

Re-ask (P3, from this morning's ruling-sheet session; its question was not recorded, so it is asked fresh): if you could rule only one Engines question this week, which would free the most rows, and what would ruling it second instead cost?

### One thing — Deciding to decide (P6, L1)
An open question is not a neutral state. While it waits, the work behind it waits too, and the attention it would have taken goes to whatever is easiest to decide instead. A ruling's cost is the work it holds plus the smaller decisions that crowd in around it.

**Like:** A stalled truck on a one-lane bridge. Traffic doesn't stop; it takes the side streets, and soon the side streets jam while the truck is still sitting there.

**In today's work:** `docs/workflow-retro-2026-10.md`, § 2, M4
> Meanwhile W3 to W7 (CUL-1390) waited from 9/28 and D1 to D8 with E-4 (CUL-1146) from 9/24, and both moved to v3.1 unruled.

Two rulings held the core for 13 and 17 days. In the same days, each follow-up row asked you for 3 to 7 typed decisions. Those were the side streets.

**Why it matters to you as PM:** The fastest way to move Engines v3.1 is probably not a tool change. It is ruling W3 to W7 and D1 to D8, the two oldest questions holding its core rows.

**Check:** Suppose you rule W3 to W7 tomorrow and leave D1 to D8 open for two more weeks. Which core row can start, and under today's dispatch rules, what do you predict fills the rest of the free slots?
