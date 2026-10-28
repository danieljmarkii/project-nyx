# Every iPhone's first dispatch, and the planner counting one gate twice

**Date:** 2026-10-28

Shipped via #1344. Finishes CUL-2249.

## The dispatch run

`/dispatch Every iPhone, the Duo included` (P-CUL-33), its first run. Nothing launched: all eleven rows sit behind CUL-559, the 1.2.0 production build (ruling R5), which is itself held by 25 open issues in App Store 1.2.0. PR-01 and PR-02 start the moment it closes; everything else follows from those two.

Written: the Board and the project summary (nothing running, nothing ready), and the ruling index CUL-2248 (`Waiting on PM`, one hold). Not written: no `**/dispatch run**` status update, no check-in and no weekday progress trigger, since nothing is in flight or ready (step 9.8, round over). The team-wide harm read was not run in full: about 30 open `Live harm` issues, nearly all owned by other projects' dispatchers, none offered from here.

## The bug (CUL-2249)

The planner's first output said `CUL-559 (frees 0, holds 2)`. Ruling CUL-559 frees both rows. Since CUL-1621 a gate is written twice on purpose: in the row's After cell and as a Linear `blocks` relation. `planDispatch` turned the After item into a hold and a reason, then turned the `blockedBy` into a second reason, and the tally credits `freesOutright` only when a row has exactly one reason. Every well-formed page therefore under-reported what its rulings free, and the holds ranked wrong.

**Fix:** the `blockedBy` loop skips a blocker that a hold already names (`scripts/dispatch/plan.ts`). A blocker After does not name still holds the row.

**Proof:** two cases in `plan.test.ts` (one red before the fix, for a blocker with and without `Waiting on PM`; one green before and after, the refactor-safety direction), two new mutants in `mutants.ts` (154 of 154 killed), the real facts file replayed (`frees 2`), typecheck clean, the full suite green (763 suites).

The Board written before the fix already showed `frees 2`: the run fed the planner its facts without the duplicate relation and said so.
