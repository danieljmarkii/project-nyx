# FAB PR-11 — the recent foods are read before the fan runs

**Date:** 2026-10-07
**One thing:** none — dispatched session, not this round's teach row

Dispatched build of CUL-1634 (The FAB, round 2), shipped via #1098.

## What shipped

`components/log/FAB.tsx` read the active pet's recent foods only once the menu opened. The fan is a bottom-anchored column, so on a cold start or a pet switch three food rows landed after the fan had run and pushed every pill about 160pt up under the thumb. The read now runs on mount, on a pet change, after each close and when today's record gains a row (`todayEvents[0]?.id`, `useDaySummary`'s signal). While the menu is open no read starts and none lands over held rows; CUL-723's pet flip inside the open menu still loads the new pet's foods, and a tap that beats the mount read lets that read land rather than starting a second.

The stale-answer guard moved from effect cancellation to a check against the pet the read was for: with `open` in the effect's deps, a cleanup-cancel would have killed the mount read on every fast first tap.

## Proof

Three tests in a new CUL-1634 block of `components/log/FAB.test.tsx`. The cold-open test (food rows present on the press's own render, the open issues no read) and the close-refresh test both red against the pre-fix tree; the third (no second read for a tap that beats the mount read) reds when the in-flight check is removed. `tsc --noEmit` clean; `jest components/log guards` 1325/1325.

## Residuals

- The jump itself is a phone check (the issue's `Gate: device`), left to the TestFlight cut's device sitting; the steps are in the PR body.
- A reopen within the few ms of a close's read keeps the held rows until the next close: a stale label for one open, chosen over rows that move.
