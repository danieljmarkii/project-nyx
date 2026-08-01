# Symptom-chart render fixes — B-498, B-496, B-497 (+ B-445 closed)

**Date:** 2026-08-01 · **Branch:** `claude/symptom-chart-render-fixes-5mo80f` · **Outcome:** shipped via #548 · CI green · **`generate-report` NOT redeployed (B-494 hold)**

## What this was

Four `vet-report-cold-read` findings against the vet-report chart renderer (`supabase/functions/generate-report/render.ts`), all pure-function, all merge-only — the Edge Function stays on its held version behind B-494, so this only changes what the report *will* render once the deploy hold lifts.

The first thing the session found: **two of the four were already fixed** by B-532/B-600 (#516/#517), and the task framing predated that work. Genuinely open: B-498, B-496, and the off-diet-chart residual of B-497.

## What shipped

- **B-498 — mid gridline mislabelled on odd maxima.** The mid gridline is drawn at the plot's geometric midpoint (value `yMax/2`) but was labelled `Math.round(yMax/2)`, so on an odd max the `2.5` line printed as `3` and a bar of 3 topped visibly above its own labelled line. New shared `evenAxisMax()` rounds the axis max up to even in both `symptomChart` and `proteinTimelineChart`; the mid label is now `yMax/2` (a whole number sitting exactly on its line).
- **B-496 — marker over-promises day precision.** The dashed intervention marker is week-granular (bucket centre) but the legend promised the start *day*, and the old `markedBuckets` de-dup silently dropped a second start in the same week. Markers are now grouped per bucket; a multi-start week renders "*N starts · {earliest date}*"; the legend reads "marks the **week** … each is named with its exact date in Reading the trend". Took the caption+count fix, **not** day-granular geometry — that changes chart geometry and wants its own PNG cold read a merge-only PR can't supply.
- **B-497 — unlogged weeks rendered as a measured `0` (reassurance-on-absence).** The symptom-chart half was already fixed by B-532; the residual was the **off-diet protein chart**, which drew nothing for any zero week — so a clean logged week was pixel-identical to an unlogged one (three charts on one page, two meanings for empty). It now distinguishes them via a new `ProteinTimeline.mealDaysByBucket`: a week with the diet observed and no off-diet food draws a baseline nub + `0`; a week the diet was not observed draws a dashed hatch + `–`, the aria names it "not logged", and an HTML note distinguishes it from a week without off-diet food.
- **B-445 — trend arrows split the window unequally.** No code change: already resolved by B-532's equal-length `trendHalves` partition (+ B-600's middle-day handling). Row formally closed citing #516.

## What broke and how it was fixed

**The `adversarial-reviewer` FAILED my first cut of B-497, and was right.** The initial "was this a clean week?" test reused the symptom chart's *any-log* signal (`loggedDaysByBucket`). But a logged **vomit** is not diet observation — so a diet-trial owner who logs symptoms but not meals got a clean `0` (visually AND in the aria-label) over a week the diet was never watched. That is reassurance-on-absence at the report layer, the same class as the B-494 gate, landing on the primary wedge user. The reviewer named the fix: gate on **meal-observed-per-bucket**, cheaply derivable from the pre-existing `windowMeals`.

Fixed by replacing the field with `ProteinTimeline.mealDaysByBucket` (distinct local days with a meal-type event). The proxy is sound because **treats/human food are themselves off-diet feedings**, so on a zero-total week the only meal-type events left are on-diet meals — the right denominator. The reviewer's counterexample is now a producer-level regression test (`report.test.ts` — a lone-vomit week has `mealDaysByBucket 0` while the any-log signal fires). Re-review returned **HELD**.

`code-reviewer` independently reproduced the same bug before my fix landed and confirmed the fix, verdict **ship-ready**; I took its two nits — extracted a shared `proteinWeekTotal()` helper (removing a duplicated inline formula) and documented the deliberate HTML-vs-in-SVG choice for the no-data note (the protein SVG viewBox has no room for a legend line, and growing it would change chart geometry).

## Falsification attempts (DoD adversarial line)

- Biostatistician (adversarial-reviewer): symptom-logged-but-no-meal week end-to-end → `mealDaysByBucket[1]===0`, chart draws a dash and aria says "not logged" while the old any-log signal still fires on the vomit → the clean-`0` reassurance-on-absence is **gone** ✓. A genuine observed-clean week still reads a measured `0` ✓ (no over-correction). Treat/human-food are off-diet feedings, so a zero-total week's only meal-type events are on-diet meals ✓. B-498 even-axis and B-496 grouped-markers HELD ✓. 392/392 green.

## Tests

`+6` cases: 5 in `render.test.ts` (B-498 even axis, B-496 count + single-marker, B-497 clean-vs-unobserved ×2), 1 producer regression in `report.test.ts`. Full `generate-report` deno suite **392 passed**; `deno check` clean; app suite unaffected (pre-push `tsc` + jest 3921). CI green on all three checks incl. the non-UTC timezone leg (`fmtDay` is lexical; the producer test passes an explicit `timezone`, so nothing depends on the runner clock).

## Residuals

None new. B-496's better fix (day-granular marker x + de-collide, with its own cold read) left as possible future polish. The `generate-report` redeploy stays gated on B-494's neighbourhood — this PR does not touch that gate.
