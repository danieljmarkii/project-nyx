# PR-24b — worth-a-call on the month, whatever layer or lens (CUL-1373 item 3)

**Date:** 2026-10-04
**One thing:** D3 L1 — Reading a test: a test proves only what it asserts · check: pending

Dispatched session (Out of beta — Noticed, Design v2, History v2, the trial screen · PR-24b). Shipped via the PR this record rides in.

## The check

The dispatcher asked first whether `main` already satisfies item 3 ("a day that carried a worth-a-call read is always marked, whatever layer is selected") with a test proving it by mutation. Items 1, 2 and 4 shipped in PR-24 (#1037, sub-issue CUL-1553).

- **Behaviour: yes.** PR-35 (#1059) draws the diamond off `day.call` with no layer gate (`components/designV2/patterns/MonthInstrument.tsx`, the `call={day.call}` prop in the grid cell), hands the model every call on every lens (`callReads: facts.callReads` in the model memo), and `DayMark` draws it on any non-ahead day (`photo={!ahead && call ? call : photo}`).
- **Guard: no.** The CUL-1200 test flips Meals and Photos only. Two mutants survived the whole suite: gating `call` on `layers.vomit`, and passing `callReads` only under the vomit lens.

## What shipped

One test in `MonthInstrument.test.tsx` (the care-surfaces describe): an itchy trial dog's month with a photoless call, asserted under the itching lens, with the symptom layer off, Meals and Medication flipped, under the vomiting lens, and with that layer off. Each step asserts one diamond and the legend's call row.

Mutation proofs: the two surviving mutants above, and gating the legend's call row on the symptom layer, each red the new test. No production code changed.

## Decisions

None. The test pins PR-35's every-lens ruling as built.

## Reviews

No owner-facing copy, count or rule changed, so `nyx-voice`, `adversarial-reviewer` and `pm-feature-review` have nothing new to read; PR-35's adversarial pass (18 counterexamples) covers the behaviour this test pins.
