# /dispatch retro, and v1.2: a branch name never closes the wrong issue, rows stop dying on paperwork

**Date:** 2026-10-03
**One thing:** G2 L1 — A branch is a movable label, and its name is read by other tools · check: pending

Shipped via #1010 (CUL-1508). The PM asked for a retro on `/dispatch`; the session gathered the evidence, recommended four changes, and on "I'll defer to your recommendation" built all of them.

## The retro

Evidence: ten `**/dispatch run**` status updates on Engines v3 (9/28 to 10/2), the 18 child sessions they launched, nine dispatcher transcripts (read by a subagent), and the merge history.

**Going well.** 18 of 18 launched rows merged. The median time from launch to merge was about 75 minutes, with 16 of 18 inside 3.5 hours; letting a child merge its own green PR was the biggest speedup. Proposals took 2 to 7 minutes against an hour by hand. There were no collisions or duplicate work. The issue-comment read correctly held PR-22 and PR-28 when the page said ready. Every checked child sat on its assigned branch.

**Not going well, by cost to the PM:**

1. **Rows held by paperwork only a human fixes.**
   - The 9/29 run found zero ready rows while five could start.
   - On 10/2, two of three slots sat empty.
   - The 10/2 review called the project stalled.
   - Causes: follow-ups the children filed with no row (28a, 28b); release gates written in After; a semantic cycle on PR-23; stale `blockedBy`.
2. **The branch name closed issues.** v1.1 fixed the PR text but built branches as `claude/cul-<issue>-…`. PR-28's branch used the parent CUL-1134 instead of its sub-issue CUL-1435, so #992 closed CUL-1134; #995 closed CUL-583 the same way.
3. **Line-anchored page writes are brittle.** Linear rewrites `#NNN` and `CUL-NNN` into link tags. Writes failed or retried in 4 of 6 runs, and one run deleted a pointer the PM had written.
4. **The standing-yes text test missed both ways.** It missed copy on PR-22 and PR-28 and blocked PR-22a over a benign "deploy". It launched 3 of 18 rows.
5. **Nothing starts the next wave.** The longest idle stretch was about 41 hours.
6. **Hand launches bypassed the log.** CUL-583 and CUL-1440 never reached step 0 or the cap.
7. **Small, every run:** the bare name lookup failed 8 of 8 times, timestamps were guessed into the future, tags were inconsistent, finished children were never archived, and the operating-kit copy had drifted.

## What shipped

**`.claude/commands/dispatch.md` v1.2**, built from the four recommendations (1A Unblock proposals, 2A a generated Board, 3A an explicit `auto` marker, 4A a `--watch` check) plus the mechanical set:

- **Issue-free branches.** Branches are `claude/<slug>-pr<nn>-<mmdd>`, every launch is checked, and the child stops if it lands on a branch that names an issue.
- **Lookup and timestamps.** The project is resolved with `list_projects` and its status updates are read by id. Every timestamp comes from `date -u`.
- **Step 0.** It reads every run update from the last 14 days, archives completed children of merged rows, and counts live outside claims toward the cap.
- **5b Unblock.** Numbered page fixes the PM applies with `fix U<n>` or `drop U<n>`. The kinds are: add or relink a row; move a gate out of After into `Merge gate:` or `GA gate:`; page and Linear disagree; a cycle; propose `auto`; a gate already ruled.
- **The Board.** Dispatch owns exactly one `## Board` section, replaced whole and verified by parse. A one-time U0 converts a v1.1 page with a single range replace, since the 62-line table exceeds the patch limit of 50 ops.
- **`auto`.** The PM's explicit marker replaces the text test. It launches only after a run's first confirmation; the old test is now a proposal that also excludes `Gate: clinical` rows.
- **`--row CUL-NNN`.** Ad hoc launches go through the claim, the cap, step 3 and the log.
- **`--watch`.** A zero-write check whose single message carries ready rows, free slots and the page fixes that would free more.

**`CLAUDE.md` § Merge → Linear status.** The old advice to prefer Linear's `gitBranchName` "so the link fires off the branch too" was the CUL-1134 mechanism. It is replaced by the rule that a branch closes every issue it names. The edit shrank the file by 86 B, and the budget guard passes.

**`operating-kit/dot-claude/commands/dispatch.md`** got the portable fixes only.

## How it was checked

- **A cold adversarial review** found five severe gaps, all fixed:
  - a `fix` could launch an `auto` row with no `go`;
  - the release comment was a write under `--watch`;
  - only the newest run update was read, so the cap could pass 3;
  - U0's range could delete PM text;
  - `--row` skipped step 3.
  It also caught the CLAUDE.md contradiction.
- **A real zero-write dry run of v1.2 against Engines v3** took about 4 minutes and 37 tool calls. It produced U lines that free PR-19 (a GA gate in After), PR-13b (a merge gate), and new rows 28a and 28b. It also logged 23 friction points; all but cosmetic ones are folded in:
  - `get_status_updates` by name silently returns nothing;
  - `search_pull_requests` omits the head branch;
  - `list_issues` has no open filter;
  - a hand session on CUL-1509 was invisible to the cap;
  - kind *e* would have proposed `auto` for clinically gated rows;
  - `--watch`'s "nothing" line hid the page fixes, repeating the original failure.
- The pre-push hook passed: typecheck and the full jest suite.

## Decisions

- **PM, 2026-10-02:** "I'll defer to your recommendation", which ratifies 1A, 2A, 3A and 4A as briefed.
- **Team call:** U0 runs on the PM's `fix U0` in the first v1.2 run rather than in this session. Converting the page before merge would break any v1.1 run in between.
- **Team call:** kind *e* never proposes `auto` for a `Gate: clinical` row or one needing `adversarial-reviewer`.

## Residuals

- **The watch routine is a PM action (CUL-1518).** A session-created routine stores no connectors, and the `connectors` parameter is unavailable for this org. One created this session was deleted for that reason. The issue carries the exact settings and prompt; the prompt does nothing until v1.2 is on `main`.
- **Unblock judgment is still judgment.** Kinds *a* (relations and description dependencies) and *f* (a comment saying a gate is ruled) read text. Each fix is applied only on the PM's `fix`, and the U line quotes its evidence.
- **The Board moves state out of the table.** The PM reads status in the Board, not beside each row. This is the cost of 2A, accepted in the brief.
- **The PM-row gate on PR-23 ("PR-16 shows the re-raise tolerance holds") fits no kind.** It stays held until the PM edits it or a comment rules it (kind *f*).

## Persona sign-off

Product Owner ✓ (the board-hygiene failures are now proposals the PM can apply in one reply). Dir. Eng ✓ (no line anchors; a single range replace under the patch limit; the pre-push suite passed). Trust & Safety ✓ (`--watch` writes nothing; page text stays inside the fence; `auto` needs the PM's own marker). Designer N/A. Data N/A. Dr. Chen N/A, though kind *e* now refuses clinically gated rows.
