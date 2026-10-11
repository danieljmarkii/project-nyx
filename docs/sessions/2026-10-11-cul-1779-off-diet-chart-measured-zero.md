# CUL-1779: the vet report's off-diet chart stops printing a measured 0 it cannot support

**Date:** 2026-10-11
**One thing:** D3 L1 — Reading a test: it proves the case it was handed, not the cases it wasn't · check: pending

Shipped via #1185 (draft). BUILD, `Gate: clinical`. One `generate-report` render path and its snapshot field; no schema.

## The defect

The weekly "Off-diet protein exposure over time" chart drew a solid nub and a printed **0** for any week with one logged meal and no off-diet feeding. A 56-day record logged one day a week printed seven clean weeks, while page one's coverage tile, over the same record, said "Not established". The report contradicted itself, and the reassuring half was the one drawn as data. This is diet-trial spec §5.2's banned sentence ("no off-diet foods logged"), said in a number.

## What shipped (five commits, one PR)

1. **A per-week floor.** `OFF_DIET_ZERO_MIN_MEAL_DAYS = ceil(COVERAGE_FLOOR × 7)` = 4, mirrored from page one's 50% floor and held absolute. A zero-feeding week prints a measured 0 only at 4 or more meal-days; otherwise it gets the hollow not-observed marker. Because the floor is absolute, a 1–3 day trailing part-week can never print a 0 (the same class as CUL-748 item 4). A treat-only day stopped counting as diet observation, matching the tile's `foodType !== 'treat'`.
2. **Review residuals, PM ruling (A)**, all pre-existing in the same chart:
   - **The chart's scope is its numerator's scope.** On a trial report the off-diet set exists only over the trial's evidence range, so weeks before or after it printed measured 0s over logged jerky. Those columns now read *pre-trial* / *post-trial*, carry no marker and no count, and the caption counts the trial days in the window.
   - **The clean-record withhold.** When the trial module withholds the clean-record statement (`mayStateRecordClean` false: a refused diet, sub-floor coverage, an unavailable allowed set), no week prints a 0.
   - **Day counts.** Every in-scope column prints "meal-days/scope-days d", so a 4/7 zero no longer looks like a 7/7 zero. On windows past 14 weeks the counts thin to the date labels' stride.
3. **Cold-read wording.**
   - The note's key draws the dashed box rather than a bare dash.
   - The note covers a fully logged part-week shorter than the floor.
   - The span is named "the trial days this report covers", never "the trial (dates)", which read as a trial that had ended.
   - Only the out-of-trial labels actually drawn are explained.
   - The appendix B pointer says the count covers the whole window.

One classifier, `offDietWeek` (`outside | bar | zero | unread`), drives the bars, the alt text and the notes, so they cannot drift.

## Reviews

- **Adversarial, pass 1:** HOLDS WITH RESIDUALS.
  - The floor held: one meal-day a week, a 3-day tail, a treat-only day, and 4/7 coverage consistent with the tile.
  - Two QUIET pre-existing breaks: weeks outside the trial span printing 0s, and a refused diet printing 0s.
  - Two loud residuals: no density on a thin bar, and 4/7 looking like 7/7.
  - All four were fixed under ruling A.
- **Adversarial, pass 2 (the cap):** HOLDS WITH RESIDUALS, none that can drop or soften a warning. Ships at the cap.
  - Cases that held: a straddle week at 3/3, a completed trial followed by four weeks of jerky, treats either side of local midnight at UTC+14, an unavailable allowed set, a refusal in an overrun tail, and five mutants each reddening the suite.
  - Residuals: day-count collisions on long windows (fixed), the appendix B pointer overstating (fixed), and the meal-day predicate being the shared tile's (left as is: fix it in `lib/dietTrial.ts` if ever).
- **Vet-report cold read:**
  - r1: NOT READY. The 0 had no denominator.
  - r2: NOT READY. Pre-trial columns were blank against Appendix B's 15 treats, "over 8 weeks" overstated the span, and a 3/3 stub contradicted the note.
  - r3: NOT READY on one string ("the trial (May 8 – Jun 14)" read as a finished trial), fixed in the last commit; Dr. Chen called it clinic-ready once that string changed. No fourth read was run.
- **Mutation proofs:** the floor, the treat exclusion, the scope clip, the withhold (both halves) and the stride each turn their tests red.

## Decisions

- **Floor (option A over a denominator-only option B)**, PM go.
- **Ruling (A)**: fix the three review residuals in this PR rather than file them, PM. This re-ruling unseated the first "floor only" pick.
- **The threshold stays at 4/7.** Dr. Chen would prefer 5/7 but accepts 4/7 with the denominator printed. 4 mirrors `COVERAGE_FLOOR`, so a change belongs there.

## Filed

- CUL-1823: trial wording outside the chart ("(21 of 21)", "27 of 38 days of this report's window", meal-day halves vs coverage).
- CUL-1824: split Appendix B's treat count by trial span; reconcile page-one vs Appendix C protein provenance.

## Residuals

- The meal-day predicate is the coverage tile's (`foodType !== 'treat'`), so a mistyped permitted chew can buy a meal-day on both surfaces.
- On very long windows (>21 weeks) the date labels already crowd; the counts follow them.
