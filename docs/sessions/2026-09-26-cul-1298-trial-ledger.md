# CUL-1298 — the trial's day ledger and this week's lane (TS-2)

**Date:** 2026-09-26

Shipped via #945. Step 1 of the Linear project **Diet trial — its own screen**, in parallel with TS-0, TS-1 and CUL-1292. Nothing an owner sees: no host renders these files until TS-4 (the screen) and TS-5 (Home's strip).

## What was built

- `lib/trialLedger.ts`: `buildTrialLedger({ input, facts })` turns `TrialFacts` into trial-week rows, and `thisWeekLane(ledger, input)` returns the ledger's current row, the same object.
- `components/trialScreen/TrialLedger.tsx` and `ThisWeekLane.tsx` draw them. `LedgerCell` is shared between the two, so the lane uses the ledger's own cell vocabulary.
- Tests in `lib/trialLedger.test.ts` and `components/trialScreen/TrialLedger.test.tsx`.

## What was decided

- **Two inputs, one record.** The card input (`loadDietTrialFacts`) flattens away `coveredDayIndices`, `range` and `exposures.items`, so the ledger takes the facts (`loadTrialPredicateFacts`) as well. Because those are two reads, it refuses to draw unless both give the same coverage.
- **PM ruling 1:** an extended trial past its designed window has no ledger. Coverage is frozen at the designed window (CUL-1038), so the extension weeks have no fact to paint from. The drawn version is **CUL-1317**.
- **PM ruling 2:** a trial ended after its target keeps its counted days. Rows run to the later of the target end and the coverage end, and the end line stays at the target. The issue's acceptance criteria wording was amended to match.
- The accessible sentence names off-diet days by **date** and never counts them. The mock said "one off-diet feeding"; the dots never speak a count (§12, held).
- Days after an ended trial's end draw as *not reached*.

## What the reviews found

- **adversarial-reviewer, first pass: FAIL.**
  - A trial completed today drew a "so far" row and a live lane (reachable).
  - A window shortened below its designed length drew counted rows under "the end you set" (latent: `changeTrialWindow` refuses a backward move).
  - The lane left §5.1's withholding gate entirely to its future host, and failed open on an untracked head and on a below-floor record.
- **The fixes:**
  - no current row and no "so far" on an ended trial;
  - the shortened mirror of ruling 1 is absent;
  - `thisWeekLane` withholds on any `withholdingReasons(input)`.
  - The freshness gate and the safety-card gate stay with TS-5, because only the host can see them.
- **Re-review: PASS.** Its two optional follow-ups were applied:
  - `ended` keys on status alone, so a stray `ended_at` on an active row can't reopen the shortened hole;
  - an ended trial's last day never draws as *today, open*.
- **code-reviewer: ship-ready.** A docblock was missing one gate (C-38), and the one-accessible-element test can't prove VoiceOver merging (limit noted in the test, `accessible` pinned). Both addressed.

## Proof

- Both real loaders run over one stubbed database. A 400-seed sweep checks parity, contiguity, the head, the dot set, the lane identity, and ended and running trials. Non-vacuity floors confirm it reached every shape: head, gap, dots, ended late, overrun, partial row, ended today, moved window, lane.
- Day keys at 00:30 and 23:30 local in Honolulu, Chatham and Kiritimati. The suite also passes with the process run under each of those zones.
- Mutation, each one red: head days counted, rows stopped at the target, today dropped from the count, dots only on meal days, the unusable-set gate removed, then each gate removed in turn (not eating, milestone, extension, shortened, parity check, lane withholding, current row on an ended trial, "so far" on an ended trial, `ended` from `endedAt`, today open on an ended trial).
- Full suite: 11,975 passed. Guards: 525 passed.
- Re-run after merging `main` at wrap. By then TS-0 (#941), TS-1 (#942) and CUL-1292 (#943) had landed, and TS-1 changed the trial reads the tests drive. The result: 12,041 passed, types clean, and TS-0's flag-off guard green over the new `components/trialScreen/` files.

## For the hosts

- **TS-4:** renders the caption (the card's coverage sentence) and the blind-spot qualifier once, at the foot of the card the ledger shares with the facts. The component draws neither.
- **TS-5:** a non-null `thisWeekLane` is necessary, not sufficient. The host still gates on `trialFactsFresh` for the strip's pet and on no live safety-class Signal card above the strip.
