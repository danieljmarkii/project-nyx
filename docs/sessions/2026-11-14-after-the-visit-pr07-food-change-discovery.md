# 2026-11-14 · After the visit PR-07: a vet's food change that isn't a trial (discovery)

**Date:** 2026-11-14
**One thing:** none — dispatched session, not this round's teach row

**Issue:** [CUL-2761](https://linear.app/projectnyx/issue/CUL-2761) (DISCOVERY) · **Branch:** `claude/after-the-visit-pr07-11142312` · **Outcome:** brief posted on the issue; this record shipped via #1536

## What happened

- Started from mock frame R8·4 (`docs/culprit-vet-visits-mockups.html:464`): the vet switched the food, it is not a trial, and today *Add the food* leaves no trace on the visit.
- Confirmed in code: *Add the food* pushes `/food-capture?returnTo=back` and writes only a `food_items` row. The one dated pet↔food fact outside `diet_trials` is `feeding_arrangements`, the free-fed bowl. Every engine reader and 13 of 15 client readers filter it to `free_choice`. It has no visit link.
- Read the intake lane. The baseline is pet-wide (`intakeBaselineReadings`), so a dip after a switch already fires `consecutive_low` (a single day on a cat), and `sustained_refusal` covers a record with no good meals. `refused_normal_food` needs prior ratings of the food, so it cannot fire on a new food. That is honest, and the pet-wide lane covers it. **No warning is missing today.** What is missing is the switch date as context, for the finding and for the vet report.
- **Recommendation A:** a new `diet_changes` table holding the pet, the food, `starts_on`, `vet_visit_id` with a same-pet guard, and `diet_trial_id` for *Make it a trial*. It carries no transition field and no end date. It is context only: it never resets a baseline and never quiets a finding, and a guard pins that rule. Rejected: reusing `feeding_arrangements` (B), deriving the date from the first meal (C), and deferring (D).
- **Forecast: 5 rows:** the migration; the mirror, sync and write helper; the R8·4 row; the intake context line plus its guard; the report line plus a History marker.
- Verified through the Data Scientist and Dr. Chen lenses. The counterexamples are on the issue. The QUIET design the brief forbids is a baseline reset at the switch.

## Rulings needed (PM)

- A, B, C or D on [CUL-2761](https://linear.app/projectnyx/issue/CUL-2761). A carries a migration, which is applied only on your typed `apply <NNN>`, and an export and deletion check.

## Files

- `docs/sessions/2026-11-14-after-the-visit-pr07-food-change-discovery.md` (this record)
