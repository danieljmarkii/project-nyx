# Engines v3 PR-14: a refusal can only withdraw evidence for the food she refused (CUL-1190)

**Date:** 2026-09-28

Shipped via #964 (draft). Live on merge, not behind the Engines flag (PM ruling on CUL-1190, 2026-09-26). No schema change. `generate-signal` and `generate-report` both redeploy on merge (the report re-runs the same engine).

## The defect

Detector ① (the food → symptom case-crossover in `supabase/functions/generate-signal/detection.ts`) never read the intake rating. A bowl rated Refused counted FOR its food exactly like one she finished: tuna offered only on eight bad days and refused every time came out "tuna, established, 8/8 exposed cases vs 0 controls", and the vet report printed the same line.

## Three designs, three adversarial passes

The fix took three cuts. Each was broken or corrected by an isolated `adversarial-reviewer` pass, and the final design is the one that survived.

1. **Refused = absent** (window stays eligible, like a medication vehicle). Fixed the tuna repro, then broke three ways, all because a refusal is driven by the illness itself (a pet refuses while nauseous before a vomit, or recovering after one):
   - one refused staple bowl the day after a vomiting cluster (the day the matcher picks as every case's control) made "chicken, established, 8/0";
   - a dog refusing everything on sick days turned those cases against its real culprit, and beef fell Established → Early, which the report drops;
   - a rating on a [venison, rabbit] food merged rabbit into [duck, rabbit], shrank the Bonferroni family and promoted an unrelated beef finding.

   The staple-washout count was also measured over eaten feedings in this cut, and the pass showed it printed a false "chicken is in most of what Pixel is offered" at 37.5% of offered. Reverted: the report's copy says "offered", so the count stays over offered.
2. **Refused = unknown, skip the pair per protein.** Fixed all of cut 1's fixtures, then broke on selection: a control-side refusal can only cull pairs that argue AGAINST a food (a pair that argues for it has no food on the control side to refuse). In a 1,500-record null simulation false Established findings rose from 19 to 106–292. The skipped-pair clustering symbol also split a joint "chicken and duck" into two separately certified antigens and could still merge secondaries.
3. **A refusal can only withdraw evidence for the refused food** (shipped). The rating is read in one place: a case exposure counts for a cluster only if some member went in. A control-side refusal reads as before (offered); the matched set, clusters, family, attribution floor and medication pass are the ratings-blind engine's. The third pass held the invariant (6,000 wide-generator records across all lanes, joint clusters of 3–4, free-fed bowls, medication spans and vehicles: no finding new or stronger than the ratings-blind engine; the report never stronger than Home through its twin dedupe) and found one gap: the risk-difference gate computed `caseExposed/n − controlExposed/n`, so a withdrawn case kept its control's count and dropped a b = 6, c = 0 culprit. The gate is now `(b − c)/n` from integers, which equals the old form on any ratings-blind record and removes a float wobble at exactly 0.2.

## The invariant, and how it is held

Every finding the engine makes with ratings is one it makes with the ratings stripped, over the same family and matched set, with the same c, b no higher, at the same tier or lower. `detection.test.ts` holds it as a seeded property test over adversarial generated records (refusals concentrated around vomit runs), and that test fails both earlier designs when their `detection.ts` is swapped in. Fifteen CUL-1190 tests in all; eight mutants of the final design (withdraw nothing, count against, skip the pair, withdraw on any member, floor on eaten only, unrated as refused, Picked as refused, a later refusal erasing an earlier meal) and the old gate each red at least one.

## Rulings stated (the issue asked for them)

- Picked at is eating (a few bites is enough for a food reaction), matching CUL-1122's timing rule. One predicate: `feedingIsEatingAnchor` in `lib/mealTiming.ts`, now documented as having two readers.
- Unrated is eating (ratings are exception-only, CUL-1118).
- A refused treat is withdrawn like a refused meal; the rule reads the rating, never the food type.

## Reviews

- `code-reviewer` (cut 1): no bugs; comment claims verified against code.
- `adversarial-reviewer` ×3 (above).
- `vet-report-cold-read` on a rendered report of the tuna case: the false tuna line is gone and no food is named as a cause, but **NOT READY** because the report's own off-diet exposure layer (page-1 chart, tally, Appendix C) still counts the eight refused treats as exposures and never says she refused them. That layer is unchanged by this PR (the before/after text diff is the one sentence) and is filed as CUL-1386. The final render is byte-identical to the one the cold read saw.

## Residuals and follow-ups filed

- CUL-1386: the report's exposure layer counts refused treats and withholds the refusal (Tier-2 report spec edit likely).
- CUL-1381: Home's staple copy says "eats" over an offered count.
- CUL-1382: a medication vehicle still reads as absent on the control side (the refused pill-pocket repro is on the issue).
- CUL-1383: check whether ten straight refusals can fold into the intake baseline.
- CUL-1387: Home and the report can disagree when a meal is logged twice with different ratings (the report is the weaker, never the stronger).
- A PM / Dr. Chen ruling on the power trade-off (CUL-1388): withdrawing refused case exposures loses some real culprits whose cause lies outside the 12h window (Established 88 → 32 of 800 in the worst simulated row), in exchange for removing false findings (sick-day refusal null row 191 → 1).
- Printed counts: `caseExposed` now means eaten while `controlExposed` still means offered, so the report's "N/M exposed cases vs K controls" can understate an association; it never overstates. Noted on CUL-1386.
- The ratings-blind engine's own null rate (a food offered on half the days yields a false Early card in about 13% of records) is pre-existing and untouched.
