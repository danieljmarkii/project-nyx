# CI failure emails: what they were, and the CoverageDoor flake

**Date:** 2026-10-08
**One thing:** none — short interactive session

Interactive session. The PM asked why GitHub CI failure emails kept arriving and how to stop them. Investigation, then a BUILD of CUL-1661, shipped via #1099.

## What the 23 emails (2026-09-24 → 2026-10-07) were

- **~17 PR-run failures**: CI catching a problem before merge, then fixed on the branch. Working as intended; GitHub emails the repo owner for each.
- **Main went red from a semantic conflict (2026-10-03, 72918c0):** one PR removed `ownerAnswers` from `CareRecord`; another, branched earlier, added `findingIdentity.engine.test.ts` cases that still passed it. Each PR was green against the `main` it last ran on. The Deno type check failed on `main`, and Deploy Edge Functions refused `generate-signal` twice (nothing broken went live; its pre-deploy `deno test` held). The 2026-10-02 `main` failure was a single `VomitAnalysisSection` test timeout; cause not established.
- **The non-UTC timezone job flaking:** the latest instance is `CoverageDoor.test.tsx:129` under Kiritimati only (CUL-1661, below).
- **Guards doing their job:** the weekly Clock skew job (2026-09-28, a date-pinned `EventRow.look` fixture; fixed by 2026-10-05) and the Migration numbers job on its own introducing PR (CUL-1522).

`main` has been green on every run since 2026-10-04.

## What shipped

- `components/designV2/home/CoverageDoor.test.tsx`: the focus re-read case no longer ends on `waitFor(... toBeNull())`. The focus fire and both mocked reads resolve inside an async `act`, and the test asserts the line that replaces "the record starts today" (`logged 0 of N days`, or `the month starts today` on the 1st). No wall-clock window is left in that step.

## Falsification

- Mutation: dropping `focusTick` from the component effect's deps reds the case (1 failed, 6 passed). Restored.
- Green 7/7 under Kiritimati, Chatham, Honolulu and UTC.
- **Not reproduced:** the old test passed 6/6 under Kiritimati with the CPU saturated (3× `nproc` busy loops). The fix removes the timing dependency structurally; it is not proven against a local repro of the CI failure. If the job flakes on this file again, the cause is elsewhere.

## Residuals / PM decisions

- **Merge queue for `main`** (prevents the 2026-10-03 class). Recommended over "require branches up to date", which churns every open PR with this many parallel sessions. A settings toggle only the PM can flip; presented in-session as a decision brief, not filed.
- CUL-586 (make the non-UTC job required) is unblocked once this merges and the job stays green; CUL-425 is the same settings page.
