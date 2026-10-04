# Noticed: the Patterns pairing held out of v1 (CUL-914)

**Date:** 2026-10-04
**One thing:** D4 L1 — A test is proven by breaking the code it guards · check: pending

BUILD session from the CUL-914 issue prompt. The PM had ruled (c) on 2026-10-03 (CUL-1520 docket item 2): the Noticed same-day pairing does not ship in v1. Shipped via #1041.

## What shipped

- `lib/lookPairing.ts`: `LOOK_PAIRING_ON_PATTERNS = false`, with the ruling and the measurement that drove it in the header. The switch lives here, not in `lib/lookPatterns.ts`, because `jest.doMock` can replace an import but never a module's own constant. That is what lets the card's suite keep driving the pairing with the hold lifted without widening `buildNoticedCard`'s input.
- `lib/lookPatterns.ts`: the card's pairing is `null` below the floor **or** while the switch is off. Nothing else on the card moved.
- `app/insights/index.tsx`: the eight-week vomit-day read is skipped while the pairing is held. The PM asked for this mid-session after the adversarial reviewer flagged it. The pairing was the read's only consumer, and the read sat inside the card's `Promise.all`, so a failure in it would have blanked the whole Noticed card.
- Tests:
  - `lib/lookPatterns.test.ts` asserts the hold on a fixture shown to earn a pairing, from `cardPairing` and from the lifted card.
  - The pairing's card suites, the withheld-drops-it test and the greyscale test run against the module re-loaded with the switch on. Under the hold they would otherwise pass over nothing.
  - `app/insights/noticed.test.tsx` proves the read is not made while the hold is on, and that the card renders even when the read would reject. With the hold lifted, the eight-week read is still pinned.
- `STATUS.md`: CUL-914 off the Home v2 row's PM list.

## What broke and how

- **First attempt at the screen test's switch: a getter on the mocked module.** The screen read it as `undefined`. Spreading `jest.requireActual` drops the module's non-enumerable `__esModule` flag. Babel's interop then copied every export once at import time, and that ran before the test file's `let` had executed.
- **Fix:** a plain mocked value with `__esModule: true` restored, which the test writes through `jest.requireMock`. Both the screen and `lib/lookPatterns` then read the switch live off the same object. The comment in the test says why the flag is load-bearing.

## Falsification

Mutations run by this session, each red, each restored:
- the gate check dropped (1 red)
- the switch flipped on (2)
- a pairing leaked into the withheld branch (1)
- the vomit read made regardless of the hold (1)
- the vomit read never made, with the hold lifted (1)
- the greyscale fixture emptied of vomit days (1)

`adversarial-reviewer` (isolated): **PASS.**
- **A remaining path to a pairing → held.** `cardPairing` has one caller, nothing under `supabase/functions` imports `lookPairing`, `ask` has no look tool, and the report's strip ranks no word (`render.ts:4864ff`).
- **A lost protection → held.** The *N vomit days not answered* clause only ever printed inside a pairing that had already cleared its floors, so it guarded no other line.
- **The harness → held.** It added two more mutations: defeating the mock (5 red) and dropping `belowFloor` while the hold is lifted (1 red).

Both of its follow-ups are fixed here: the greyscale non-vacuity assertion and the vomit read.

## Residuals

- The Tier-2 spec note was confirmed by the PM in session ("write it") and written into `docs/nyx-daily-look-requirements.md` v1.4: the header, the §0.2 L-17 row, §6.11 and §7, each marked **⚠ HELD 2026-10-03**.
- `components/dashboard/WhatYouNoticedCard.test.tsx` still feeds a pairing string through a hand-built model to prove the renderer cannot split the fraction from its disclosure. This is deliberate: it guards the renderer for the day the hold lifts, and production cannot reach it while the switch is off.
- Lifting the hold is a PM ruling that has to answer CUL-914's null-rate table, not a cleanup.
