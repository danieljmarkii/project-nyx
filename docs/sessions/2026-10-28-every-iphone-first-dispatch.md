# Every iPhone's first dispatch, and the planner counting one gate twice

**Date:** 2026-10-28

Shipped via #1344. Finishes CUL-2249.

## The dispatch run

`/dispatch Every iPhone, the Duo included` (P-CUL-33), its first run. The first pass launched nothing: all eleven rows sat behind CUL-559, the 1.2.0 production build (ruling R5), which is itself held by 25 open issues in App Store 1.2.0.

**R5 re-ruled (PM, 2026-10-28):** "let's not block this project on that task": the family dogfoods on more phones, and the PM's wife uses the Duo, front screen and open. CUL-559 left both After cells and both `blocks` relations; R5's row on the page keeps the old wording beside the new; PR-01's merge note now says what merging before the cut does (the App Store build ships on SDK 58 as 1.3.0, and CUL-1857's move to 1.2.1 has to follow). The index CUL-2248 closed with nothing held.

**Launched:** PR-02 (CUL-2237, routine, the teach row) at 17:05Z, picked on the PM's answer; PR-01 (CUL-2236, plan-gated as a Tier-2 doc edit, merge-gated) at 17:09Z on the PM's "launch PR-01 now too", which lifted the first dispatch's one slot. Armed: one check-in and the weekday 07:45 CT progress update (no Gmail connector here, so it posts and prints only).

The team-wide harm read was not run in full: about 30 open `Live harm` issues, nearly all owned by other projects' dispatchers, none offered from here. One planner gap noticed, not filed: the Board has no notion of a queued row, so a row the PM queued reads "Needs you: a pick".

## The bug (CUL-2249)

The planner's first output said `CUL-559 (frees 0, holds 2)`. Ruling CUL-559 frees both rows. Since CUL-1621 a gate is written twice on purpose: in the row's After cell and as a Linear `blocks` relation. `planDispatch` turned the After item into a hold and a reason, then turned the `blockedBy` into a second reason, and the tally credits `freesOutright` only when a row has exactly one reason. Every well-formed page therefore under-reported what its rulings free, and the holds ranked wrong.

**Fix:** the `blockedBy` loop skips a blocker that a hold already names (`scripts/dispatch/plan.ts`). A blocker After does not name still holds the row.

**Proof:** two cases in `plan.test.ts` (one red before the fix, for a blocker with and without `Waiting on PM`; one green before and after, the refactor-safety direction), two new mutants in `mutants.ts` (154 of 154 killed), the real facts file replayed (`frees 2`), typecheck clean, the full suite green (763 suites).

The Board written before the fix already showed `frees 2`: the run fed the planner its facts without the duplicate relation and said so.
