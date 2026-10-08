# Engines v3 PR-23g: an unreadable prior Signal row lapses every answer written before the run

**Date:** 2026-10-08
**One thing:** none — dispatched session, not this round's teach row

Dispatched build of CUL-1663, shipped via #1107. The PM ruled **expire** (dispatcher comment 01:24:30Z, which supersedes "rebuild from the record"). Plan posted on the issue; PM go typed in this session.

**The gap.** EN-9's D4 rule lapses an owner's answer when its concern leaves the set. The only record of that is the previous `ai_signals` row. When the read of that row failed, `prior` was null and the step lapsed nothing, so an answer from before a stand-down could stay live and quiet a concern that had come back.

**What shipped.**
- `index.ts` sets `priorReadFailed` in both failure branches of the prior read (the error and the throw). A missing row leaves it false.
- `pipeline.ts`: `SignalPipelineInput.priorReadFailed` is required (C-37: a default on a safety decision is that decision) and goes only to the care step, which runs only under `engines_v3_en9`.
- `careState.ts`: when the flag is set, every answer about the sign written before `nowMs` joins `lapsed`. The list is written to the row and carried. The header's known-gaps line is updated.
- Tests: a unit test (the stand-down case, a fresh answer, an answer at the run instant, another sign, read-ok); a corpus test (lapses on every watched concern; flag-off output deep-equal with the flag true or false across every EN-9-off state); a wiring scan. Six mutants, all red.

**Adversarial review.** The failed-read case held: concern → answer → stand-down → return with the read erroring; the answer lapses and the lapse is carried. A failed read combined with an incomplete read is caught the next night by the existing D4 re-check. Flag-off is unchanged. The reviewer also broke an **adjacent** path that this diff does not touch. The cache write is a delete then an insert. A lost insert leaves no row, the next run reads "no row yet", and nothing lapses. A failed delete combined with ordering by `expires_at` can also serve a stale row. Filed as CUL-1667 with a decision brief (A: treat no row while answers exist as continuity unknown; B: make the write atomic). A non-array `findings` in an owner-written row is the same class, noted there.

**Cost, as ruled.** An answer written seconds before a run whose read fails lapses too. A persistent read failure keeps the concern asking.
