# The suite's two slowest tests — jest's assertion machinery, not the code they test

**Date:** 2026-09-24

Shipped via #903 (CUL-1155). Follow-ups filed: CUL-1156, CUL-1157.

## The ask

Find the slowest test in the suite, explain why it is slow, and propose a fix before editing anything. Both proposed fixes were then approved and built.

## How it was found

Measured, not read. The full jest suite ran twice with per-case durations (`--json`): cold, the way CI always runs it (119.6 s), and warm (81.1 s); all 453 suites green both times. Cold per-file numbers mislead — whichever large files each worker runs first absorb jest-expo transforming React Native on first render (`LookCard` 16.0 s cold / 5.6 s warm, `EventTypeSheet` 15.1 / 5.1) — but the per-case leader was the same in both runs. The leader was re-timed alone, CPU-profiled in-band (`node --cpu-prof`), and then the whole suite was profiled in-band to see whether its cause recurs anywhere else.

## What was slow, and why

**`MonthInstrument.test.tsx` › "the day opens in place under its row, one at a time, and closes" — 5.5 s, the slowest case.** Its comment put the waits down to the real-timer close choreography (~0.5 s); the profile was 99% CPU with 55 ms idle. Three `waitFor` polls wait for elements to *leave*, so they fail by design until the close lands, and every failing matcher eagerly builds its message by formatting the received value — a `ReactTestInstance`, whose `_fiber` reaches the whole React tree. `jest-matcher-utils`' `stringify` prints it ten levels deep, overflows its 10,000-character cap and halves the depth until it fits (708 characters), and `waitFor` throws the message away. Four failed polls at 0.8–1.6 s each were ~4.8 s of the 5.5 s, and each blocked the event loop, so the choreography's own timers stalled behind the formatting. Across the whole suite this file was 3,935 of the 3,952 ms jest spends formatting matcher failure messages — an isolated case, not a pattern.

**`symptomEpisodes.differential.test.ts` › "agrees on 40,000 fuzzed inputs" — 4.9 s, the runner-up.** 80,000 `expect().toEqual()` calls in a loop. Each `expect()` builds every matcher with its `.not` / `.resolves` / `.rejects` variants and a `JestAssertionError` with a captured stack; ~4.2 s of the 4.9 s was that, the code under test negligible. `lib/protein.test.ts` has the same shape (CUL-1156).

## What changed

- The three MonthInstrument polls assert on `.length`, so a failed poll formats a number. 5,513 → 679 ms in the full suite; the file 8.1 → 4.5 s.
- The fuzz compares each trial with `samePlain` (arrays by index, records by own keys, leaves by `Object.is`, `toEqual`'s rule for primitives), collects mismatches (first five whole, all counted) and asserts once. 4,912 → 764 ms. The frozen reference bodies are untouched.
- Full suite, warm, 3 workers: 81.1 → 76.7 s.

## Decisions

- **The case's `20_000` timeout stays — a reversal of the proposal, on evidence.** The proposal was to drop it back to jest's 5 s default now that the case passes in under a second. With the re-tap close deliberately broken, the failure landed at 4.77 s: under the default it still reported its assertion, but ~230 ms from losing the race, and the later waits would lose it outright — a bare "Exceeded timeout" in place of "Expected: 0, Received: 1". A comment at the bound now says why it is there.
- **No convention or guard for the waitFor pattern.** The suite profile puts 99.6% of the cost in this one file; a rule would cost more than it saves.
- **A local comparator, not `@jest/expect-utils`' `equals`.** That package is only a transitive dependency and nothing in the repo imports it.

## Verification

- Mutations, each reverted with `git checkout`: a closing slot that never unmounts (`components/motion/openInPlaceMotion.ts`) reds the first `day-slot` count, "Expected: 1, Received: 2" (the original test catches it too, in 6.0 s); a re-tap that no longer closes (`MonthInstrument.tsx`) reds the `day-detail` count; a final close that leaves its slot reds the last `day-slot` count; an inclusive episode gap (`lib/mealTiming.ts`) reds the fuzz with 3,919 mismatches, first trials named.
- `samePlain` against `toEqual` over 45,488 pairs from real fuzz outputs and perturbed copies (32,324 unequal: 1 ms shifts, dropped or added onsets, flipped confidence, an extra or a missing field, reordering): zero disagreements.
- Full suite green (453 suites, 9,801 passed, 3 skipped, unchanged); `tsc --noEmit` clean; both files green under Kiritimati, Chatham and Honolulu and under the +180-day clock skew.

## Residuals

- CUL-1156 — `lib/protein.test.ts`, the same assertion-in-a-loop shape (~1.5 s of `expect()` construction).
- CUL-1157 — CI runs jest cold every time (~38 s per cold run), with the CUL-716 trade-off (a warm cache can hide a cold-only failure) to decide rather than skip.
- The slowest case is now `ProteinSetPicker` › "PROPERTY: no interaction sequence can invent a protein key" (2.6 s). Not profiled; its cause is unknown.
