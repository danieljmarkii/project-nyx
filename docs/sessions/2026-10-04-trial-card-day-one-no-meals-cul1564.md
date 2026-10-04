# Trial card, day 1: "No meals logged yet today." (CUL-1564)

**Date:** 2026-10-04
**One thing:** D3 L1 — Reading a test: a "never says X" test goes green when X is reworded · check: pending

Shipped via #1045. BUILD, one PR, no schema change. Out of beta run order row PR-43c (the trial screen lane).

## What shipped

On a trial's first day the card said *Nothing logged yet today.* whenever no meal, treat or unnamed feeding was logged. Every input to that gate is a feeding count, so the sentence claimed the whole day over a record the card cannot see: a daily look, a vomit, a weight. The daily-look spec rules "nothing logged" false beside a look (T-9), and it is just as false beside a symptom.

- `lib/dietTrialCard.ts`: the line now reads *No meals logged yet today.*, held once as `DAY_ONE_NO_MEALS_LINE`. The gate is unchanged on purpose: a logged treat still keeps the line off the card beside the exposure count (the B-533 gate 2 contradiction), and an unnamed feeding still keeps it off (CUL-1338).
- Tests: the existing day-1 assertions moved to the new string; the two negative guards (treats only, unnamed feeding) now match any `logged yet today` form, so a revert to the old wording reds them rather than passing over it; a new `CUL-1564` block pins the constant and asserts the day-1 card never says "nothing logged". Proven by mutation: restoring the old string reds 4 tests.

## Decisions

- **Wording: "No meals logged yet today."** A team call (Designer, `nyx-voice`) under the 2026-09-27 decision rights: copy inside the voice, no clinical or privacy weight, the dispatcher's build note named this form, and the daily-look mock already uses the same register for the same reason (*No meals logged yet*). §5.2 of the diet-trial spec does not pin the line. "No meals or treats logged yet today." was considered and dropped: it repeats the forward line directly beneath (*every meal and treat you log*), and the narrower word is still true whenever the line renders, since a treat suppresses it.
- **No new read.** Hiding the line when any other row exists would need the card to read non-feeding rows; scoping the words fixes the falsehood without that.

## Review

- Falsification attempts (Engineer + Data lenses, no subagent: the gate and every count are unchanged, so no clinical or statistical logic moved): a refused meal logged on day 1 counts as a meal offered, so coverage is 1 and the line is absent; a treat only, absent; an unnamed feeding only, absent; a look, vomit or weight only, the line renders and is true. The sentence states an absence of logged meals, never of eating, so it cannot read as reassurance about intake.

## Residuals

- **CUL-1567** (filed): state 4's *Nothing is on the record for this trial yet.* is the same class, keyed on feedings and claiming the trial's whole record. `exposureLine`'s *Nothing logged against the trial yet.* is named there to decide in the same pass.
