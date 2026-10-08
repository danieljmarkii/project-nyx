# Engines v3 PR-23h: a missing prior Signal row beside an answer is continuity unknown

**Date:** 2026-10-08
**One thing:** none — dispatched session, not this round's teach row

Dispatched build of CUL-1667 (PM ruling A, 2026-10-08), plan-gated. The PM typed the go in session. Shipped via #1114.

**The defect.** `generate-signal` replaces its `ai_signals` row with a delete and then an insert. If the insert fails, the next run reads cleanly and finds no row. EN-9's care step treated that as a first run and lapsed nothing. So a "my vet knows" answer from before a stand-down stayed live and quieted a returning concern: R1 answer A, then R2 deletes and loses its insert, then R3 has the concern back and A is still live.

**What shipped.** `careState.ts` folds CUL-1663's failed-read branch into one *continuity unknown* predicate. Any of these lapses every answer about the sign written before the run, carried like any other lapse:
- the read failed;
- the row is missing, or its `findings` is not a list (the case folded into the issue);
- the row's generation time is null or non-finite.

A first run with no answers lapses nothing. Flag off, the step never runs.

**Premise verified first.** The only `ai_signals` delete in the repo is the shell's own (the pet cascade aside), and the client only reads. Every place an answer is written is driven by a concern in the cache row, so an answer implies a row was written.

**Tests.** Fixtures had modelled "answers, no row" as normal, which is the lost-write case. Both changes below keep the old tests testing what they tested:
- The careState helper now defaults to the row that held the concern.
- The pipeline corpus cases that answer their concerns now carry that row.

New tests:
- the R1→R2→R3 chain, plus R4 carrying the lapse;
- a missing row and an unreadable row giving equal outputs across the whole corpus;
- a first run unchanged;
- malformed rows;
- only this sign's answers, written before the run;
- flag off.

Mutation: every disjunct reds its own test, and the pre-fix predicate reds all three CUL-1667 tests. The full Deno suite passed (2561) and `deno check` was clean.

**Adversarial review: HOLDS.** It tried the required R1→R4 chain, other-sign answers, answers at or after the run instant, malformed rows, the re-raise latch with no row, how the new branch combines with D4, and flag off. Two non-safety findings came back:
1. A NaN generation time passed straight into the step silenced both lapse branches. No production caller can do this. Hardened anyway with `Number.isFinite`, mutation-proven.
2. Two concurrent regens can also yield a missing row, so an answer lapses for nothing, in the louder direction only. The code comment now names the race. The atomic replace that fixes it is on CUL-1673.

**Filed.** CUL-1673 covers the lower-severity half that ruling A left out: the prior read sorts by `expires_at`, the delete's error is unchecked, and the concurrency race is added there.

**Residual.** With no prior row, a re-raised concern reads `raised`, not `raised_again`. It still asks, but loses its "Back because…" sentence, the same as the CUL-1663 failed-read path.
