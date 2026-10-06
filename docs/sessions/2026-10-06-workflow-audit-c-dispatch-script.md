# The workflow audit C: a tested script does dispatch's deterministic half

**Date:** 2026-10-06 · **Issue:** CUL-1615 (of CUL-1612) · shipped via #1083
**One thing:** D3 L1 — Reading a test: a fixture copied from a real day can catch what an invented one cannot · check: pending

## What happened

Dispatched ad hoc (BUILD) to build D4 of the dispatch retro: move the bookkeeping `/dispatch` re-derives from prose on every wake into a pure, tested script, check the dispatcher's memory against GitHub, and hand off before ~400K tokens.

**Shipped in `scripts/dispatch/`:**
- `page.ts`: reads a plan page from the raw Linear description. Rows, After items classified, order rules (chains, one-at-a-time lists, bare ids after arrows, `then` as order), critical paths with labelled sub-chains, build notes with `Hotspot:` and `Merge gate:`. The Board is never read back as plan.
- `plan.ts`: `planDispatch`, pure. Ready and held rows with reasons in words, repo-wide slots under D1 with the three sub-limits, parked PRs, the reservation map, migration clashes, `gateOf` / `autoEligible`, the rank, the holds on the PM.
- `board.ts`: the Board in `table` and `digest` shapes, and `validateBoard`.
- `status.ts`: closing lines from facts, `validateStatusUpdate`, `memoryCheck`, the hand-off threshold, and `prSafe`.
- `cli.ts`: the I/O shell, zero writes by construction. `mutants.ts`: the mutation runner.
- `.claude/commands/dispatch.md`: steps 3, 4 and 8 call the script; step 7 validates before posting; step 9 gains the memory check (9.6) and the hand-off (9.7). 65,025 → 62,695 bytes.

**The fixtures are 10/5, read back, not invented.** Both live pages, every merged PR a row names (numbers and merge times from GitHub), the sessions' launches and buckets. Where a fact was never recorded (Out of beta PR-60's launch), it came from the dispatch claim on the row's issue. The tests reproduce:
- the Engines v3 21:10Z line, exactly, at the old cap of 3 (`= 0`, PR-23a and PR-27b over the cap), and its v1.4 form at 6 (`= 3`);
- the 084 clash as a held PR-36a, with the lower PR keeping the number and main outranking both once it carries one;
- the Out of beta Board without the malformed row 12, without PR-61 "waiting on PR-53", and with ✓ on the whole path to GA. The Board the prose actually wrote that day is refused by the parse for each of the three.

**Proof.** 62 tests; 36 mutants, 36 killed. An isolated code-reviewer pass found three real bugs, all fixed with a test and a mutant each:
- in-flight dedup ran through a shared parent issue and under-counted the slots;
- a combined row (`05 + 06`) escaped the order rules;
- a non-row line rendered a cell the validator then refused.

**The live dry run** (Out of beta, 14:30:46Z) matched a hand check. Its memory check found two kinds of real drift in Out of beta's last status update: PR-60's launch was never recorded, and five merged rows were still on `Auto:`.

**One correction to the brief.** The facts comment framed the PR-body hazard as closing words ("close", "fixes"). CLAUDE.md's measured rule is wider: any issue id in a PR body closes on merge. So `prSafe` breaks every id except the ones the PR finishes.

## Open

- **D4's Board question is unanswered** (the Board on the page, or the digests). Both shapes ship; `table` stays the default until the PM rules.

## Teach

**Reading a test: a fixture copied from a real day can catch what an invented one cannot.** A test is only as honest as the data it runs on. Invent the data and you test your own memory of how things work, so the test agrees with the code you wrote. Copy a real day and the test has to agree with what actually happened. The analogy is a flight simulator: one flown on a recorded storm shows you more than one flown on weather you imagined.

One real line from today's diff (`scripts/dispatch/plan.test.ts`):

```ts
expect(old.arithmetic).toBe('3 − PR-36 (#1072) − PR-36a (#1074) − PR-23c (claim, claude/engines-v3-pr23b-10051806) = 0');
```

This asserts the exact sentence the Engines v3 dispatcher wrote at 21:10Z on 10/5, computed from that day's PRs, claims and sessions. The real day also caught something no invented fixture would have. Out of beta PR-60's last commit was 23 hours 54 minutes old at that moment, six minutes short of the 24-hour rule. Its session record decides that it is parked, not its age.

**Check:** if the 21:10Z test had been written against invented PRs instead, what could it no longer tell you?
