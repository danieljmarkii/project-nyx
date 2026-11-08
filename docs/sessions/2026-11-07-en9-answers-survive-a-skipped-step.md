# EN-9: why Nyx's "My vet knows" answers vanished, and the carry that keeps them

**Date:** 2026-11-07
**One thing:** D4 L1 — A test is proven by breaking the code it guards: two of today's survived, and each one named a missing test · check: pending

Shipped via #1477 (draft). Finishes CUL-2662; the investigation was CUL-2653 (closed, no PR); the pre-existing hole the adversarial pass found is filed as CUL-2673.

## The investigation (CUL-2653, DISCOVERY)

Nyx's three Oct 11 answers (vomit `my_vet_knows`, vomit `vet_started_trial`, cough `my_vet_knows`) sat on the cache row's lapse lists while both concerns stayed on Home every day, so the stand-down lapse could not be the cause. The cache row keeps only the current state, so the lapse had to be dated from `signal_shown_log`, which keeps a SHA-256 of every card's text per generation.

The key fact: a `with_vet` card's text is template-only (`careStateText` bypasses the model), so it is reproducible. A script regenerated every possible `with_vet` sentence (head, source line, and all four since-line forms over N days, K episodes, L logged days) and matched them against the logged hashes. Every vomit and cough hash from Oct 11 22:39 to Oct 28 12:02 matched exactly; nothing after did. The flip came at `2026-10-28 16:44:09Z`, on both signs at once.

The hashes at 16:44:09 and 22:40:58 matched the chronicity template's CUL-989 floor arm ("across at least 6 of the last 8 weeks — at least 17 episodes"), which only prints over an incomplete read. The pipeline skips the care step over one, so those rows held both concerns with no care fact. The next full read, `22:41:07.457Z`, hit the D4 re-check (`careState.ts`, prior row holds the concern without a care fact) and lapsed every answer older than that row. Same deploy fingerprint and flags throughout, and no run within seconds before it, which ruled out CUL-1663, CUL-1667 and a deploy. Floor-then-full pairs recur on Nov 1, 5 and 6; the nine-second gap at 22:40:58 → 22:41:07 looks like unsent phone entries landing (CUL-1984), so the void was routine, not rare.

## The ruling and the build (CUL-2662, BUILD)

PM ruled option A: a skipped run carries the answer state forward. Built in `careState.ts` (`priorCareCarry`, the carry read in `readPriorCare`), `pipeline.ts` (the stamp beside CUL-1600's latch, and the strip in `carryPriorSafety`) and `ask/tools.ts` (the relay strip). The carry vouches only for what its own prior vouched for, and only on cards the partial read detected, so every unknown still lapses (louder).

Proof by mutation, six mutants. The first run had two survivors:
- Stripping the carry from carried cards changed nothing, because no carried card in the test had ever held one. The fix was a second skip that re-detects nothing.
- Dropping the read-failed gate changed nothing, because the test's unreadable case also passed no row, which returned early on its own.

A third survivor appeared once those were fixed: stamping an unvouched sign changed nothing, because no corpus case has two watched signs, so a vouch for one sign beside none for another was never set up. The fix was a planted second sign in the prior row. All six now red.

## Adversarial pass (1 of 2)

The pass tried leave-and-return across a skip, a leave during the skip, lapses from before it, unreadable, missing and unbounded rows mid-chain, back-to-back skips, split lanes, the latch, retractions and scope ends, the skipped row's own display, and whether an incomplete read can detect a concern a full read would not. Everything held. Two findings:
- **X4** is folded in: `readPriorCare` now requires a safety concern.
- **X1** predates this PR and is filed as CUL-2673. A full run over a failed care-record read writes no lapses, so the next run can revive an answer that should have expired. QUIET, High.

## Residuals

The carry makes a skipped run equivalent to "no run happened then". It does not prove the concern stayed between rows; full-to-full rows never did either. CUL-2673 is the one QUIET hole left in this machinery.
