# Vet report v2 PR-26: the smoke bake-off's re-run after PR-35 fails

**Date:** 2026-11-05
**One thing:** none — dispatched session, not this round's teach row

Dispatched DISCOVERY row for CUL-2306. Shipped via the PR opened from `claude/vet-report-v2-pr26-11051930`, which names no issue because the run failed.

**What ran.** This is PR-35's re-run, under `docs/vet-report-v3-discovery/bakeoff/rerun/PREREGISTRATION.md` as written. It used the shipped pipeline on `main` `3171cd4` with the real models: 35 runs on the round's seven fixtures, the thin pair, and set v2's 110 items through `checkerDecision(verdict, { table, draft })`. Two blind model-persona judges read the result. The harness, the outputs, the judge sheets and a byte-reproducible `score.json` are in `rerun/2026-11-05-run/`.

**What it found.** FAIL. Stop (1) fires: on `nyx-v2`, the record with six live flags, three printed leads named only the burden flag. They left out about 15% weight loss and a possible foreign body. Both judges scored H7 material. The checker model scored it clean with no omissions. The order rule passed it because the burden flag is printed band item 1. This is exactly the case [CUL-2484](https://linear.app/projectnyx/issue/CUL-2484) ruling (a) left to the checker and this stop rule, and the net did not hold. The print floor fails too (5 of 35 against 12), and so do §12 (2) to (4). The adversarial set held: no hazard item passed the checker, and no refuse item passed the verifier. On the four band-order items the checker model now rejects without the code half's help.

**Filed.** CUL-2563 (QUIET, Live harm, Gate: clinical, Waiting on PM, blocks CUL-2388) re-asks CUL-2484's ruling. The recommendation is no lead on any record with 2+ live flags.

**Residual.** The summary cannot both print often enough (the floor) and stay silent on multi-flag records (CUL-2563 (b)) as configured. Whether it ships at all is the PM's next call, through CUL-2563 and CUL-2550.
