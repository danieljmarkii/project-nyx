# Dispatch retro 3: raise the cap, but count it across the whole repo; the trouble was never the number

**Date:** 2026-10-05 · **Issue:** CUL-1606 · shipped via #1075
**One thing:** G5 L1 — Protection: each PR's green check tests that PR alone, so two green PRs can still turn `main` red · check: pending

## What happened

The PM asked for a retro on `/dispatch` after Engines v3 and Out of beta, with four questions:
- should the cap of 3 sessions go up;
- what is breaking that the PM can't see;
- what the product-team personas think;
- what to borrow from others who run parallel coding agents.

This was a DISCOVERY session. The deliverable is `docs/dispatch-retro-2026-10.md`; nothing about dispatch was rebuilt.

**Evidence**, gathered first and frozen into one pack:
- 63 `/dispatch run` status updates.
- 82 PRs, with every branch fetched and every merge replayed with `git merge-tree`.
- Slot occupancy computed minute by minute.
- 20 session transcripts read end to end by two isolated readers: 5 dispatchers, 13 children and 2 hand launches (26,938 events).
- CI and deploy runs.
- A web research pass. Two of its claims were re-verified here: the Claude Code Projects docs and Linear's magic words.

**Review.** Seven persona lenses read the pack in isolation: Dir. of Engineering, QA, Product Owner, Trust & Safety, Data Scientist, Designer, and Dr. Chen with Jordan and Sam. Every finding that moved a recommendation was then re-checked against its primary source.

## What it found

- **Dispatch works.**
  - 65 dispatched PRs merged, a median of 47 minutes from launch to merge.
  - 0 textual conflicts among its children; both of the repo's 2 real conflicts in the window were hand launches.
  - 0 reverts, and every launched child reported in.
- **The cap binds in bursts, not on average.**
  - Ready rows waited 69% of the time with a slot free, and 31% behind a full cap.
  - The PM went around it twice by hand, reaching 10 sessions at once.
  - The cap raise the PM asked for on 10/3, #1024, never merged.
- **What actually cost something:**
  - **Children that stopped and then merged had no wake left** (6 of 10). The worst left 14 ready rows idle for 2h10m.
  - **The dispatcher's only memory is its status updates, and they drifted.** Merged rows came back on `Auto:`, six launches went unrecorded, timestamps were composed rather than read from the clock, and page writes failed 16% of the time. This happened with compaction and without it (law L2).
  - **Collision rules stop at the project edge.** Two dispatchers each numbered a migration 084. Two projects edited `pipeline.ts`, and `main` went red for an hour.
  - **Approvals drifted from the spec.**
    - The plan gate held in 2 of 13 children.
    - Dispatchers relay approvals through a channel the platform labels "NOT USER INPUT".
    - 23 of 24 replies in children were one-tap suggestions, including a production migration apply.
    - One child grew a second track outside every rule.
- **Two findings outside dispatch,** both put on their issues with a decision brief:
  - The trial outcome sheet can still say "No symptoms are on the record" after a vomit is logged (CUL-1560). It was a `GA gate`, and the graduation passed it unseen.
  - The device sitting was skipped on the premise that every feature kept its off switch. A ruling two hours later removed the switches, and the remaining device check (CUL-1482) covers none of the safety states.

## Decisions surfaced (none ruled yet)

D1 to D6 in the retro's section 7:
- **D1:** 6 sessions across the repo, with at most 3 waiting on the PM and at most 3 writing production.
- **D2:** retire the plan gate for routine rows; keep written-in stops for gated rows.
- **D3:** authority never travels; production writes need a confirmation no agent can produce.
- **D4:** script the deterministic half of dispatch.
- **D5:** a faster pre-push hook.
- **D6:** two safety items before the 1.2.0 cut.

They are filed for the PM as one issue (see the outcome comment on CUL-1606). The fixes that need no decision are listed in section 8, grouped into three themes: know what's true, count the whole repo, ask only what matters.

## Filed or commented this session

- **CUL-1606:** this retro.
- **CUL-1607:** the deploy summary says "Nothing changed in production" when four functions in the same run deployed.
- **Comment on CUL-1560:** its gate was passed and the defect is still on `main`.
- **Comment on CUL-1482:** the proposed safety slice.

## Corrections the review forced

- **#994 was a hand launch carrying dispatch tags.** Removing it changed the median from 48 to 47 minutes and Engines v3's mean from 204 to 141.
- **Status-update drift is not only a compaction effect.** QA found it in a dispatcher that never compacted.
- **"Clinical functions deployed from a broken `main`" is half true.** The deploy's per-function test refused the broken function twice; four unaffected functions deployed (verified in the run log).
- **"0 conflicts" grades the planner on its own picks** (the Data Scientist's interval).

## Residuals

- **The `main` ruleset may be inactive.** Two lenses read GitHub's rules API and saw no active rule on `main`. The PM can confirm under Settings → Rules.
- **The permission dialog in D3 may not prompt.** Whether a hook's `ask` still prompts in Auto mode is untested; test it before relying on it.
- **Two questions for the PM, both in the retro:**
  - Does the PM read the Board or the digests? This decides how small the Board gets.
  - How should a re-ruling surface the earlier rulings it unseats?

## Persona sign-off

Every lens was run as an isolated reviewer; their verdicts are in the retro's section 4.
- **Product Owner ✓:** issues filed, findings on their issues.
- **Dir. of Engineering ✓:** no code changed; the pre-push hook passed on each push.
- **Data Scientist ✓:** the numbers were re-derived, and its corrections were applied.
- **Trust & Safety ✓:** no access-control change.
- **Designer:** N/A (no owner surface).
- **Dr. Chen:** N/A to the diff, but the two safety findings are surfaced as D6.
- **Adversarial review:** N/A, no clinical or statistical logic changed.

## Teach

### One thing — two green checks can still make a red `main` (G5, L1)

Every pull request runs the tests on its own, against the `main` it started from. If two PRs change things that only clash when they meet, each one passes alone. `main` then breaks the moment both are in, and nothing warned anyone first.

On 10/3 that happened: four PRs merged in six minutes, and `main`'s own test run was cancelled each time a newer merge arrived. The first run that finished was red, and it stayed red for an hour.

**Like:** two cooks each taste their own pot and say it's fine. Nobody tastes the stew after both pots are poured into it.

**In today's work:** `.github/workflows/ci.yml:22–24`
```yaml
concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```
This says: if a newer push to the same branch arrives, stop the run in progress. On a PR branch that saves time. On `main`, it means a burst of merges gets only one verdict, and that verdict comes after the damage.

**Why it matters to you as PM:** "every check was green" describes each PR, not `main`. Raising the cap means more merges close together, so `main` needs its own verdict on every merge (retro section 8, item 6).

**Check:** If three PRs merge two minutes apart and `main`'s run takes nine minutes, how many of those merges does `main` actually get a test verdict on today?
