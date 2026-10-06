# The workflow audit: merge-check catches shared migration numbers and a red main (CUL-1522)

**Date:** 2026-10-06
**One thing:** G5 L1 — Protection: a required check can look across PRs, which a PR's own tests never do · check: pending

Shipped via #1081. Dispatched session, BUILD.

## What shipped
- `scripts/steward/merge-check.sh` gains three findings, each REVIEW:
  - **Resurrected lines** (`back`): a line the landing adds that was in the file at the fork point and that `main` deleted afterwards. This mirrors the existing lost-lines check and uses the same matching (exact text, within its file, letters or digits only).
  - **Migration numbers shared with an open PR**: for every branch on the command line, the migrations it adds (by name, netted against the base) against this branch's. Same number in a different file is a clash; the same file name is not, which covers a stacked PR.
  - **A red `main`**: the latest decisive ci.yml push run on the base branch, read with `gh api`. Cancelled and skipped runs are stepped over, since main's concurrency cancels superseded pushes. Red is REVIEW, naming the run and the files changed since main was last green. The exception: the branch touches one of those files and its own CI passed, so it reads as the fix. An unreadable CI is REVIEW, never CLEAN.
- `.github/workflows/migration-numbers.yml` + `scripts/steward/migration-numbers.sh`: the `migration-numbers` job. It lists every open PR with the workflow token and fails a PR when an earlier open PR or the base branch holds its number, or when it adds a number twice. It lives in its own workflow file (the PM's scope change on the issue), so ci.yml's read-only permissions floor stays intact.
- `guards/mergeCheck.test.ts` (4 new cases) and the new `guards/migrationNumbers.test.ts` (6 cases). Both fake GitHub with a stub `gh` under the fixture root.
- `.claude/skills/steward/SKILL.md` §4, §5 and §7 step 2 read the new findings. A PR that adds a migration passes every open PR's branch to the check.

## Decisions
- **Who holds a number in CI: the PR opened first.** Under a symmetric rule both PRs go red, and nothing re-runs either one after the other renumbers. So the job fails only the later PR and notes the clash in the earlier one's log; the base branch outranks every PR. In merge-check the clash is REVIEW on both sides, because a session reads it and clears it in writing.
- **The "fix" exception is judged by file.** A branch touching a file changed between main's last green run and its red one, with its own CI passed, is the fix. A fix in a file no commit changed (the 10/3 date-pinned test) is not recognized, and that REVIEW is cleared in writing. This is stated in the script's blind spots.

## Proof
- **The 10/5 pair, replayed on the real refs.** `--base` = main just before #1074 merged (6d6263a), `--head` = #1074's head (0b58874), other = #1064's branch. Result: REVIEW naming both 084 files. The same head with the file renamed to 085 → CLEAN. A stub `gh` read main's CI as green, because a historical base has no run of its own.
- **Mutation.** merge-check: 14 new mutants, all killed. migration-numbers: 9, all killed. The first runs left three survivors, each a real gap in a case: a resurrection that was never the only finding, another PR carrying a migration main already had, and an edited migration opened after the PR under test. Each case was tightened, then re-run.
- **Calibration of resurrected lines** on 41 real conflict resolutions (2026-08-23 to 09-25, every `claude/*` merge of main whose parents conflict): 5 flagged, 13 lines. One is a genuine revert: on 08-23 a resolution on `claude/foods-tab-geist-sweep-ouragk` (ce9e6a3f) put four raw `<Text>`s back where main had just switched them to `ThemedText`. The rest are deploy-manifest rows main had pruned, an `export {};` placeholder and one comment, all lines main really deleted. §P-15 counts 34 resolutions; my replay filtered by commit date across all branches and found 41.
- **The CI job, live.** On today's open PRs, #1064 fails (084 is on main as `084_vet_call_cover.sql`) and #1078 passes. On this PR: a probe commit planting `084_merge_check_probe_do_not_merge.sql` made the job fail, and its revert passed (run links in the PR).

## Residuals
- **PM action:** add `migration-numbers` to the `main` ruleset's required checks.
- #1064 (parked) now fails `migration-numbers` on its next push. 084 is on main, so #1064 renumbers.
- A stale PR holds its number for as long as it stays open; the oldest open PRs date from July. Today none of them adds a migration, so nothing is blocked.

## Teach
### One thing — Protection: a required check can look across PRs (G5, L1)
Every PR runs its own tests against its own changes, so two PRs can each pass and still clash once both land. On 10/5 two PRs each added a database change numbered 084; each one alone was fine, and nothing compared them. A required check is a test GitHub refuses to merge without, and the new one reads every open PR at once, so the second PR to claim a number goes red before it can land.

**Like:** two people booking the same meeting room from different calendars. Each booking is valid on its own; only a shared room calendar sees the double booking.

**In today's work:** `scripts/steward/migration-numbers.sh`
`if [ "$other" -lt "$pr" ]; then` — when another open PR with a lower number (opened earlier) adds the same migration number, this PR is the one that fails.

**Why it matters to you as PM:** the check works only once it is on the required list, and adding it there is your one action from this PR.

**Check:** If the earlier PR renumbers its file instead of the later one, does the later PR's red check turn green on its own?
