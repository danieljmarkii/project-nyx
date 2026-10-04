# A refused meal keeps counting after its food goes free-choice (CUL-1237, PR-31)

**Date:** 2026-10-03
**One thing:** none — dispatched session, not this round's teach row

Dispatched as PR-31 of *Out of beta — Noticed, Design v2, History v2, the trial screen*. Shipped via #1032.

## What shipped

The intake lens sets aside a free-fed bowl's rating (§11 #6). Several surfaces decided "free-fed" from **today's** bowls (`getActiveArrangementsForPet`, `active_until IS NULL`) and applied that to every past meal. A kibble refused Sep 10–12 and left down from Sep 20 therefore lost all three refusals from:

- History's day header ("N meals not finished") and the week strip's broken line (`lib/historyQueries.ts` → `lib/historyDays.ts`);
- the Patterns month's left-some mark (`lib/monthReads.ts`);
- the finished-rate card and its prior window, the top foods / proteins finished-rate, and the Meals calendar (`lib/analytics.ts`).

Each of these now reads `readFreeFedIntakeSpans`: the CUL-1086 by-instant spans (toggle-on to toggle-off) that the intake-decline detector and the daily look already read. That read is now exported from `lib/analytics.ts` as the one source. `FreeFedExclusion` is **spans only**. The `ReadonlySet<string>` arm is deleted, so a food-id set is now a type error at every intake predicate. `DayFactsInput.freeFedFoodIds` became `freeFedSpans`, and the option fields became `freeFed`.

`lib/lookWithheld.ts` is unchanged: it already read spans through `getQualifyingIntakeMeals`.

**Before/after on the live record:** 215 rated non-treat meals; 0 excluded by food before and 0 by date after. No current account has a free-choice bowl touching a rated meal, so the change is preventive and moves no number today.

## Tests and proof

- New: History and the month each get a "bowl set down after the unfinished meal never excuses it" test and a "bowl since taken up excuses only its own span" test. Both run against the production DDL, with bowl rows written the way the app writes them (`created_at` = toggle-on, `ended_at` = toggle-off). The `getIntakeRate` and `getIntakeRateWithPrior` wiring tests now route the arrangement read by SQL. The prior window holds a May refusal of a food whose bowl went down in June, and it counts.
- Mutation: a time-blind predicate reds all six new tests. The adversarial reviewer's independent mutant (the old "active rows only" read) reds seven.
- `tsc --noEmit` is clean; the full jest suite passes (614 suites).

## Falsification (Dr. Chen + Data Scientist, `adversarial-reviewer`): HOLDS

Tried:
- a refusal at 08:00 with the bowl down at 09:00 the same day (stays counted);
- a toggle off and back on (the gap counts);
- a pre-076 ended row with no `ended_at`, and a NULL `created_at` (each fallback errs toward counting);
- History's slack window against the unbounded span read;
- `lookWithheld` and the UTC decline calendar (both unchanged).

## Residuals (filed, not this PR)

- **CUL-1392**: the server half. The `generate-signal` summary finished-rate and Ask's intake tools still exclude by today's set. The summary errs in the reassurance direction for the CUL-1237 cat, so the comment there recommends raising its Low priority.
- **CUL-1551**: the favourites shelf (`lib/foodFavorites.ts` → `selectReliableFavorites`) still uses today's set. It is preference-direction only, so Low.
