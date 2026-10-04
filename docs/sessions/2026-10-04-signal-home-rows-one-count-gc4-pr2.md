# Home's Signal rows state the screen's counts (GC-4 PR 2)

**Date:** 2026-10-04
**One thing:** D5 L1 — What a reviewer looks for: three rounds, each one breaking the last fix · check: pending

Shipped via #1053. A BUILD session dispatched by `/dispatch` (row PR-27b) on CUL-1569, the second of GC-4's three PRs (CUL-1568 merged as #1050; CUL-1570 is next).

## What shipped

- **One read, the screen's own.** A Home row the Signal screen restates from the record (chronicity, worsening, reflection, the trial card) calls `loadSignalRowScreen` (`lib/signalLead.ts`). That calls `loadSignalScreen`, the loader the door opens, for the same pet, identity and clock.
  - The row's headline is the screen's `title`.
  - Its count line is `countedHomeCount` over the counts the screen's sentence used (`model.composed`, new on the screen model).
  - A reflection's pair reads `countedHomePair`.
  - #1050's escalate-only gate (`countsMayCompose`) and the masking and withhold rules are therefore the row's by construction, not by a second count.
- **The trial card** prints the strip's sentence wherever the screen's *Why* prints it (`model.trialLineShown`), and only on the trial card.
- **Three answers, three behaviours** (`SignalRowScreen`):
  - `ready`: the screen's words.
  - `set_aside`, a masking span beside a compared window: no count and no pair. A trial that rose over a masked zero keeps its trial count, as the screen does.
  - `unanswered`, a failed read or no matching screen: a safety row keeps the finding's words and its ask. An insight row holds its count and pair, because the masking rule fails closed. A rising trial card keeps its trial-so-far count.
- **The read is keyed to the pet, identity and `generatedAt` it answers.** A re-ranked row never shows the previous finding's numbers. It re-reads on the sync and signal ticks, as the lead card does.
- **Chronicity's fallback line** drops "since <month>" and reads "N episodes in those weeks". The engine's onset month is the first onset inside its 56-day lookback, so it undercounted a safety row.

## Decisions (team calls, logged on CUL-1569)

- **Parity by calling the screen's loader, not by a second count.** The cost is one screen load per counted row on Home. Deduping the shared reads is filed as CUL-1581.
- **An insight row holds its count while its read is in flight.** A safety row never does, because the ask never waits.

## Falsification

`adversarial-reviewer`: four passes. The first three each failed on a new path the previous fix exposed or left open; every fix is pinned and mutation-proven.

1. **First pass: FAIL.**
   - A screen that sets the finding aside (an antiemetic course beside a falling reflection or a falling trial pair) left Home drawing the engine's falling pair.
   - A stale falling pair survived offline logs that made the record rise.
   - A vomiting reflection on a trial took the strip's sentence.
   - A new comment claimed the set-aside case could not happen.

   Fixed with the `set_aside` answer, the tick re-reads, and the trial-only strip line. The false comment was replaced.
2. **Second pass: FAIL.** A failed read fell back to the engine's falling pair beside a masking span: the masking rule fails closed, the row failed open. A trial that rose over a masked zero lost the count its screen keeps. Fixed with the `unanswered` answer (insight rows quiet) and `keptLine`.
3. **Third pass: FAIL (Low).** A rising trial card on a failed read showed a bare "day 14 of 56", hiding the accusing count the masking rule would keep (C-37). Fixed with `trialSoFarClause`. Every earlier counterexample held:
   - a safety worsening on a failed read never prints a falling pair (the tier and trigger guarantee current above prior);
   - a set-aside safety headline carries no count;
   - the tick and key race never pairs old numbers with a new finding.

4. **Fourth pass: PASS.** The fix holds, and mutating it out turns its test red. A falling card in the same state stays quiet. A rising card from an older trial names one day in its headline and its count. A zero pooled count is unreachable, because the rate gate never passes 0 against 2. The new import reaches no Edge Function and forms no cycle. Two non-blocking notes were applied: a test now pins the in-flight hold, and a comment that overstated "the masking rule keeps a rise over any record" was corrected.

`code-reviewer` found:
- a one-frame stale answer across an identity change, fixed by the keyed answer;
- the per-row read fan-out, filed as CUL-1581;
- the untested loader, now covered in `lib/signalLead.test.ts`.

Mutation proofs (all red):
- the base headline restored;
- the reflection or worsening prior printed regardless of `priorStated`;
- the strip line dropped;
- the engine's chronicity count used;
- the answer unkeyed;
- set-aside ignored;
- ticks dropped;
- the strip line on every row;
- an unanswered read failing open;
- the kept line dropped;
- the rising-trial clause dropped.

Parity property test: 500 engine-shaped records through the real builder, with non-vacuity floors on both branches and on a stated prior. The full jest suite runs green in the pre-push hook.

## Residuals

- CUL-1581: one screen load per counted row (perf).
- When Home's cache and the screen's cache are a regen apart, the row can briefly show the newer generation's numbers under the older ask. The ask is never quieted.
- On a failed read, a worsening keeps the engine's "none the week before" beside a possibly masked prior. This predates the PR, and it is the escalation direction.
- CUL-1570 carries the script labels, Get ready and the spec edits.

## Teach

### One thing — What a reviewer looks for: a review is someone trying to break your change (D5, L1)
A review is not someone reading the change and nodding. It is someone hunting for one concrete case where the change does the wrong thing. When they find one, the fix gets the same treatment, because a fix is a new change with new edges. Done means a round that found nothing, not a round that ran.

**Like:** a locksmith testing a new lock. After you fix the first way in, they don't sign off. They try the window you just put a new latch on.

**In today's work:** `components/designV2/signal/SignalRow.tsx`, the line that decides when a row stays quiet:
`const quietInsight = readsScreen && (screen === undefined || screen.kind === 'unanswered') && finding.priorityClass !== 'safety';`
- Round 1 broke the first version: a masked screen still showed a falling pair, so `set_aside` was added.
- Round 2 broke that fix: a *failed* read still showed the pair, so `'unanswered'` joined this line.
- Round 3 broke the second fix: a rising trial went silent too, so the trial's rising count was carved back out a few lines below.

**Why it matters to you as PM:** "reviewed ✓" on a safety surface means a named counterexample was tried and held. Each of today's three rounds found a real way Home could show a calmer number than its own screen.

**Check:** Today's second fix made a row go quiet whenever its read fails. Before reading round 3, what kind of row would you have expected that fix to hurt, and why?
