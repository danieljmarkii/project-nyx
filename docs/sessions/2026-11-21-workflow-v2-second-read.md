# 2026-11-21 · Workflow v2, a second read before the build starts

**Date:** 2026-11-21
**One thing:** P2 L2 — Reversibility moves the check: a change you can undo in one step is checked after it lands, and only the changes you cannot undo are worth a gate before · check: pending

**Mode:** DISCOVERY · **Issue:** [CUL-2854](https://linear.app/projectnyx/issue/CUL-2854) (retro 5) · **Outcome:** the Workflow v2 project amended in Linear; no code. Shipped via #1585.

## What was asked

The PM asked for a critical second lens on *Workflow v2: free the decider* before any row launched, and named the assumptions to challenge: no self merge on deploys, plan approvals that are rubber stamps, whether sweep gathers or makes decisions, whether dispatch's findings are worth their cost, and how close dispatch can get to running a small or medium project alone.

## What was read

Three isolated research passes, all read only, plus retro 5 (`docs/workflow-retro-2026-11.md`) and the project page.

1. **Outside practice.** Vercel, Ona and Rootly gate agent merges by a fixed deny list of paths, classified by a step that is not the authoring agent, with unsure counting as protected. No high volume team read (Stripe, OpenAI, Spotify) approves a plan per task. Next.js lets a weekly agent close stale issues only when a second agent arguing to keep them agrees, capped at 25 a week. Industry telemetry (DORA, Faros) shows instability rising with throughput.
2. **The machinery as it stands.** Routine dispatch rows already merge themselves; what waits on the PM is any merge that deploys (21 of 27 sampled). Sweep drops `Waiting on PM` items and decides nothing. The grooming pass's 72 hour default lane has never applied a default. The never-list is defined in at least six places that disagree, and "irreversible" has no test. Dispatch's `auto` test excludes any row whose text contains `copy`, `string`, `label`, `mock` or `frame`.
3. **The PM's own rulings.** 304 rulings paired with their recommendations from the session records. A keyword sample, about 75% from batch rulings, plus or minus 5 points.

| Class | Paired | Taken as recommended |
|---|---|---|
| Engineering, tooling, CI | 9 | 100% |
| Copy and voice | 8 | 100% |
| Privacy and RLS | 16 | 100% |
| Clinical | 101 | 96% |
| Workflow | 23 | 91% |
| Design and mock reactions | 109 | 90% (84% without two "take all" batches) |
| Product scope | 17 | 76% |

No plan was rejected or rewritten in 99 records that mention a plan gate. The PM diverges on taste (motion, density, wordiness) and scope (bigger and more systemic than proposed), never on an engineering call. One caution: 40 clinical rows were ruled in 17 minutes, and one on a card whose recommendation had just been superseded.

## Rulings (PM, typed in session)

- This project runs ahead of 1.2.0.
- 28 rows is too many; prioritize by milestone.
- "Let's go wide self merge w the opportunity to rollback."
- "Design and scope stay w me."
- Engineering calls are decided by the team at once and logged in a weekly digest, with no veto window.

## What changed in Linear

- **Milestones regrouped in priority order:** 1 Merges without a word · 2 Decisions at the source · 3 A project runs itself · 4 Fewer findings, one sitting · 5 Eyes on the app · Later, on evidence.
- **Five new rows:** PR-29 rollback in one step ([CUL-2885](https://linear.app/projectnyx/issue/CUL-2885)), PR-30 the kept list ([CUL-2886](https://linear.app/projectnyx/issue/CUL-2886)), PR-31 post and proceed ([CUL-2887](https://linear.app/projectnyx/issue/CUL-2887)), PR-32 project go ([CUL-2888](https://linear.app/projectnyx/issue/CUL-2888)), PR-33 the pilot ([CUL-2889](https://linear.app/projectnyx/issue/CUL-2889)).
- **PR-08 rewritten** ([CUL-2874](https://linear.app/projectnyx/issue/CUL-2874)): wide self merge on a deny list with no size cap, proven by a replay over 30 days of merges, in place of a 50 line stage one.
- **Amended in place:** PR-03, PR-09, PR-16, PR-17, PR-21, PR-23, PR-26.
- **Parked off the run order, each with its return condition:** 06, 09, 12, 13, 24, 25, 26, 28.
- **The run order:** 25 rows, 12 on the path to done.

## Still open for the PM

1. Post and proceed in place of plan approval off the kept list ([CUL-2887](https://linear.app/projectnyx/issue/CUL-2887)). Recommended.
2. Deleting the 72 hour default lane and the over cap apply rule (brief on [CUL-2886](https://linear.app/projectnyx/issue/CUL-2886)). Recommended.
3. The `main` ruleset click ([CUL-1491](https://linear.app/projectnyx/issue/CUL-1491)), which the whole first milestone waits on.

## How close to a project that runs itself

An estimate until PR-33 measures it: one kickoff sitting on the preflight list, most rows merged with no input, a small number of stops, and one phone check. What stays human is the kept list, each `apply`, and how the app feels in the hand.

## Persona sign-off

Dir. of Engineering ✓ (the deny list is paths and labels, never a session's own judgment of its risk; rollback before wide self merge) · Product Owner ✓ (25 rows on the run order, every parked row has a return condition) · Trust & Safety ✓ (nothing on the stakes list moves; `apply` stays typed) · Dr. Chen N/A · Designer N/A · tests: N/A, no code.
