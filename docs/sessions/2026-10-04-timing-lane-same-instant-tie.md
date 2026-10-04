# Timing lane: a same-instant seen + found vomit opens on the found one (CUL-1230)

**Date:** 2026-10-04
**One thing:** D1 L1 — Reading a diff: files, hunks, and where to look first · check: pending

Shipped via #1042. BUILD session on CUL-1230 (History v2, GA gate, `Gate: clinical`).

## What shipped

- `compareOnsets` (`lib/mealTiming.ts`) is the one order every episode collapse sorts on. It sorts on the instant, then least certain first (`window` < `estimated` < unclassified < `witnessed`, with an unknown string counted as unclassified), then row id (absent first). `collapseEpisodes` sorts with it.
- The engine's time-of-day lane ⑥ (`toConfidenceEpisodes`) now calls `collapseEpisodes` directly, so ⑤ and ⑥ share one opener.
- Home's `onsetsInStableOrder` is gone, because the collapse orders the tie itself.
- The Signal screen carries `confidence` into the collapse, and `boutMembers` sorts with the same comparator, so a tied bout cannot split and lose a photo.

## The decision

The issue proposed **witnessed first**: the more certain onset opens the episode. The orientation read found that a "found it" window row stores its **latest** edge (`deriveOccurredAt`, "no later than"). So a tie shows the found vomit happened at or before the seen one, and one millisecond earlier it already opens the episode today.

The pre-build `adversarial-reviewer` broke witnessed-first with one case. An owner sees a vomit at 18:12 after an 18:00 meal, then finds an older puddle and logs it "no later than 18:12". Witnessed-first prints "12 min after eating" for a bout that began earlier. A decision brief went to the PM (options A witnessed first, B least certain first, C arrival order made deterministic), and **the PM ruled B**.

## Falsification

- **Pre-build pass:** rule A FAIL (the case above); rule B PASS. Under B, a duplicate Saw it + Found it log loses one timed point from numerator and denominator, the total stays and the untimed count discloses it. Episode totals are tie-invariant, since splits depend on instants alone.
- **Post-build pass:** PASS. The reviewer tried every `collapseEpisodes` caller, Home's prior-day onsets, three-row `boutMembers` ties, ⑤ against ⑥, and counts.
  - Ran in a scratch copy: an ms-only mutant reds 11 tests, a most-certain-first mutant reds 8, and the `boutMembers` mutant reds 1.
  - One surviving mutant (the Signal screen's confidence wiring) is now covered by a `readSignalEpisodes` test, and was proven red against it.
- **Mutation proofs this session:** an ms-only sort in `collapseEpisodes` reds the mealTiming, Home and ⑥ tests. `boutMembers` and the `readSignalEpisodes` wiring each red their test. Deno was installed at CI's pinned 2.9.4 to run the ⑥ test.
- **`code-reviewer`:** no bugs. Its cleanups were applied: ⑥ delegates outright, the comments are exact, and the stale docblock was fixed.

## Residuals

- **Timed counts move by design.** ⑤'s rapid count, L1, ⑥, the trial band rows, Watching and Patterns can each lose an episode that was timed only because the seen row arrived first. A ⑤ finding can newly go quiet or fire on such a record. Only an exact-millisecond tie reaches this, which realistically means both times were set by hand to the same minute.
- **A degenerate earliest-only window** stores its earliest edge, so a tie there proves nothing about order. B still fails toward untimed, so the cost is one lost point.
- **CUL-1555 (filed):** the incident floor's onset count (`lib/incidentFloor.ts:129`) depends on input order at a tie. It is a raise-only safety rung, so B must not be copied there.
- **Deploys on merge:** `generate-signal` (intended) and `generate-report` (whose output cannot change, since its collapse uses instants only).
