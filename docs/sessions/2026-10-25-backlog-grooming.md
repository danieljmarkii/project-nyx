# Session: Backlog grooming (Linear, team Culprit), the 10-25 pass and the PM's rulings on it

**Date:** 2026-10-25
**Mode:** DISCOVERY (Product Owner / Backlog Steward lens), attended: the PM asked for the pass and ruled it in the same session ("as recommended")
**Outcome:** shipped via the session's PR (this record and two recovered research briefs; the pass's writes are in Linear)
**Branch:** `claude/upbeat-albattani-n5ryb4`
**Report:** the standing grooming issue [CUL-1962](https://linear.app/projectnyx/issue/CUL-1962), as a comment. Its `last_pass` and `carry_forward` lines were rewritten.
**Predecessor:** `docs/sessions/2026-10-16-backlog-grooming.md` (the 10-16 pass, with its 10-23 rulings)

---

## What ran

A short pass, two days after the last one. It used the `backlog-groomer` procedure, scoped to what moved since 2026-10-23 12:00 UTC. Steps 1 to 4 (merged work, open PRs, deploys, In Progress), 6's label strip, 12 (the queue), 14 (the veto window), 15 (the count) and 17 (orphans) ran in full. The rest were read only where the window touched them.

| | |
|---|---|
| Git history | `scripts/groom/preflight.sh` PASS: 1,308 commits on `origin/main` against a floor of 837 |
| Board | 1,051 open; 30 opened and 25 closed in the window (net +5) |
| Deploys | Deploy Edge Functions runs #416 to #423 all green; no held function touched |
| Queue | `Waiting on PM` 56 at the start (cap 30, baseline 153; about 46 on 10-23) |

## Findings

1. **Merged-work drift is zero for the fifth pass running.** One open issue appears in a merged commit, [CUL-2141](https://linear.app/projectnyx/issue/CUL-2141). Its stopgap shipped as a sibling issue via #1293; the clinical ruling is what is left, so it was narrowed by comment rather than closed.
2. **Three discovery issues read In Progress while their work sat in open PRs.** They moved to In Review.
3. **The 10-24 stale-PR ruling closed 19 PRs but saved neither research brief it named.** The closes kept the branches, but the briefs on #630 and #631 were never copied to `main`. This session saved them (below).
4. **Two 09-24 prune proposals could not be settled by the veto window.** One carried a privacy label; the other had a session comment after its proposal. Both went to the PM as E1.

## The PM's rulings ("as recommended")

- **D5b (b).** The 46 Engines v3.1 harm findings became 13 classes. Twelve new class issues ([CUL-2204](https://linear.app/projectnyx/issue/CUL-2204) to [CUL-2215](https://linear.app/projectnyx/issue/CUL-2215)), each `Live harm` in the project with no milestone, and 43 instances closed into them as duplicates. Class 13 is a class of one, so [CUL-1738](https://linear.app/projectnyx/issue/CUL-1738) stands as itself. Labels carried up: `Waiting on PM` on class 1 (from CUL-1438) and class 4 (two clinical rulings), and class 5 is `blockedBy` CUL-1002 (from CUL-1430).
- **E1 (a).** CUL-244 → Done (migration 033 removed its premise). CUL-100 kept, its `Propose close` removed.
- **E2 (a).** The 19 closes had already happened on 10-24. Applied now: CUL-530 → Done. The asks: #704, #510, #415 and #360 closed with reasons; CUL-319 re-cut as a v15 row; CUL-146 and CUL-2162 given their folded halves; the staging question filed as [CUL-2203](https://linear.app/projectnyx/issue/CUL-2203). #692 is **held** for one more word (below).
- **E3 (a).** CUL-2165 and CUL-2166 moved into Engines v3.

## Committed in this PR

- `docs/research/2026-08-onboarding-activation-landscape.md`, recovered from the #630 branch, unchanged above a new foot §V.
- `docs/research/2026-08-human-elimination-diet-apps.md`, recovered from the #631 branch, renamed to the folder's `YYYY-MM-` convention, unchanged above a new foot §V.
- Two `docs/research/README.md` index rows.

Each §V says where the brief came from, and that its "B-745" is the branch's own number: on `main`, B-745 is the event-type picker. That is the additive correction a frozen brief allows (`.claude/rules/docs.md`).

## Held for the PM

**#692 (the August household spec), ask 2.** The 10-23 recommendation was to merge it docs only, so its D1 to D8 briefs and red-team findings survive. Two facts since: #1218 (open, the round 2 discovery) adds a v2.0 spec at a sibling path and says it supersedes #692, and #692's title names an issue a merge would close. Merging now would leave two household specs on `main`. The brief is in this session's chat reply.

## Open after this pass

- D1 (held since 10-16).
- Engines v3.1's run order should offer the 12 classes as rows; that is `/dispatch`'s page to write on its next run.
- Queue at the end: 57 open with the label, up from 56. CUL-2203 and two class issues joined, and the closed CUL-244 and the duplicated CUL-1438 left. The never-list items always file, so the cap of 30 does not hold them back.
