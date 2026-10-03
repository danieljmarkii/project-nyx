# Branches and merges: the steward skill, a merge check, and `/wrap and merge` as one sequence

**Date:** 2026-10-03 (analysis 2026-09-25; build 2026-10-02 to 10-03)
**One thing:** G4 L1 — Why "divergent branches" (and a merge conflict) happens · check: pending
**One thing (re-ask):** G3 L1 — A squash merge flattens a PR into one commit · check: pending

A workflow session. The PM asked whether branching every part of a project off `main` and merging each back was right, or whether parts should branch off one shared branch, and whether a command, skill or artifact could take the conflict fixing off their plate. Outcome: the model stays, the merge half of `/wrap and merge` becomes a defined sequence, and a script checks the one thing a session would never notice going wrong. Shipped via #1008 (CUL-1497).

## What the record said

Measured before answering (2026-09-25), by replaying both parents of every merge commit on all 858 `claude/*` branches through `git merge-tree`:

- 417 times a branch pulled `main` back in; 242 with a real conflict.
- 78% of conflicted files were four bookkeeping files (`STATUS.md` 139, `docs/backlog.md` 112, `CLAUDE.md` 19, the deploy manifest 8). All four had already been fixed where the conflicts started, the last of them (the manifest's ledger, CUL-1147) the day before.
- After 2026-09-12: 13 conflicting merges, 9 in real code, each two parallel parts of one project editing one shared file (Design v2 on the beta shelf, the namespace index and two guard registries; the vet report and trial window on `generate-report/render.ts`; History on `history.tsx`).
- `main`'s CI passed 97 of 100 September merges. The one failure was a date-pinned test, not two PRs colliding. A PR merged one commit behind `main` broke nothing, so updating a branch that does not conflict buys nothing; 8 of the 21 updates after 09-12 had nothing to resolve.

The answer given: keep branching each part off `main` (a project branch saves every conflict for one big merge and fights the flags, deploy on merge and live migrations); update a branch only when it conflicts; merge `main` in and never rebase, since squash merge discards a branch's history anyway; avoid stacking. The PM then said their real habit is `/wrap and merge`, confirmed in six session records, so the proposed `/merge-plan` command was dropped: sessions merge themselves, and the check across PRs moved into the merge step.

## What shipped (#1008)

- `scripts/steward/merge-check.sh`: lands clean or not; which lines `main` added after the fork point landing would drop, each tagged `deleted` or `replaced` by its diff hunk; new duplicate migration numbers; collisions with other open PRs, including which ones landing would cause. Read only.
- `guards/mergeCheck.test.ts`: twelve cases on throwaway repos with a real bare origin. Twenty-three mutants run against the script, all killed.
- `.claude/skills/steward/SKILL.md`: the procedure, at the path cloud sessions already read before working a PR's CI and review events.
- `/wrap` step 3d (the check on every wrap; `/wrap and merge` runs the sequence) and the replaced "stop on any conflict" rule; `/dispatch`'s hotspot rule gains the measured shared files; one `CLAUDE.md` rule line (net +116 bytes, paid for in the same section); `docs/engineering-lessons.md` §P-15.

## How the detector was tested against the record

- **A real careless resolution is caught.** Replaying the Design v2 conflict of 2026-09-21 with `git checkout --ours` on every conflicted file: 54 lost lines, 10 of them deleted outright, including an import and the constant it fed. The session's actual resolution of the same conflict: 23 lost lines, all comments it had deliberately rewritten.
- **The noise was measured, then shaped.** On all 34 real resolutions from 08-23 to 09-25, 28 came back `REVIEW`. Every one inspected was a deliberate rewrite (a reset line extended by one setter, a comment updated to name a third lane, an assertion rewritten for a new structure). Tagging by hunk separated them: 32 of the 34 deleted nothing outright, and the 2 that did were a capped table row and a line moved into a sibling component. `REVIEW` stays the verdict for both tags, because a revert of `main`'s value to the branch's old one is also a replacement.
- **Two of my own claims failed verification and were fixed before commit.** A comment said the careless replay deleted 33 lines outright; re-running gave 10. The blind spot list said a line moved to another file is not reported; the second real outright deletion proved it is.

## A correction to the advice

The first answer held up the five History v2 PRs (opened together on 09-25) as the way to split a project. Their code was partitioned well, but after the analysis they conflicted twice, both times on their own spec: two parts each bumped it to version 1.2 (and later 1.3) and added a changelog row at the same spot. That is `/wrap` step 3's header bump rule run by two lanes at once. The skill now carries the mechanical resolution, and keeps the spec parallel rather than serialized in `/dispatch`, since nearly every part writes rulings into its spec. Five of those PRs' seven updates from `main` also had nothing to resolve.

## The isolated code review

The `code-reviewer` subagent (scratch copies only, 74 tool calls) returned **fix before merge**, so the first `/wrap and merge` stopped at its own gate, which is the sequence working as written. Its findings, all fixed in this PR:

- **Five ways the script printed CLEAN without having looked:** run from a subdirectory (cwd-relative pathspecs); a clone shallow enough to lose the fork point but not the merge base ("skipped" fell through to CLEAN); stderr read as merge-tree's tree id (`GIT_TRACE=1` turned a REVIEW into CLEAN); a C-quoted non-ASCII file name matching nothing; a resolution committed with its conflict markers in. Now: the script runs from the root with literal pathspecs and `core.quotePath` off, a missing fork point is exit 3, merge-tree's stderr is kept apart and its tree id verified, a name git still quotes stops the check, and committed markers are REVIEW.
- **The landing was simulated as a two-parent merge;** this repo squashes, and only the squash shape shows a stacked PR the conflict it will meet.
- **Smaller:** `status` took the index lock (now `--no-optional-locks`, and the guard asserts the index is untouched); a tab in a lost line truncated it; the list stopped at 20 (now `--all`); `mktemp` was unchecked; post-merge output claimed "shares nothing" for a PR whose files had just landed.
- **Two procedure gaps:** `/dispatch` already gives its children a self-merge path with a stricter gate (the DoD, no unapplied migration, a fresh read), so the skill's §7 now takes that gate whole under two authorizations and `CLAUDE.md` names both; and `/wrap and merge` would have merged before step 7 wrote the learning line into this record, so with a merge the line is written at step 3a.
- **Wording:** the rebase exception now sits where the rule is stated; "never take one side wholesale" names its two exceptions; a check-in rationale that dispatch's standing yes had made false was replaced.

The reviewer's 900-history fuzz against an independent reference agreed with the script everywhere except the tab truncation. Its stated blind spots that remain are in the script's header: lines main deleted that a resolution brings back, migration numbers between open PRs, and other hand-numbered lists.

One loose end: the first push of this record was stopped by the pre-push hook, and its output was filtered past the failing line. The full suite passed on the next two runs (602 of 602 suites), so the cause is unknown; the next push captures the hook's whole output.

## Decisions

- PM, in session: build the steward skill plus a defined `/wrap and merge` sequence in one PR; `/merge-plan` dropped.
- Team: `REVIEW` is cleared in writing, one line per deliberate rewrite; the spec is the one shared file that stays parallel.
- Team, from the review: a self-merge has two authorizations (the PM's word, or `/dispatch`'s standing yes) and one gate, dispatch's; a check that could not run is never a pass.

## Residuals

- `REVIEW` fires after essentially every conflict resolution, by design. If sessions start rubber stamping it, the next step is a similarity check on `replaced` lines, not a looser verdict.
- A line moved to another file is reported as `deleted`; a dropped second copy of a duplicated line is not reported at all. Both are stated in the script's header.
- GitHub's automatic merge setting is off on this repo; with it on, `/wrap and merge` can queue the merge instead of waiting out CI. Optional, the PM's call, logged on CUL-1497.
