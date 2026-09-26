# CUL-1274 — the vet report counts every meal logged, and says which intake was recorded

**Date:** 2026-09-26

Shipped via #937. `generate-report` redeploys on merge (no hold in `deploy-manifest.json`).

## Why this session existed

The Engines v3 critique (CUL-1268, BRK-9) found page 1 of the vet report printing the RATED meal count as the number of meals fed: "Also fed as meals: the wet diet (4 meals … 0 of 4 fully eaten)" over 60 logged, and no clause at all when nothing was rated. Rating has collapsed on the dogfood record (CUL-1118: 3 positive ratings in 209 meals since mid August, the rest selectively negative), so the selectively rated record is the common one.

## What was decided

- **Scope, PM option A at the plan gate:** the rated-only population was upstream of page 1. `diet.mealItems` grouped rated meals only, and it also fed appendix B's "Meals logged" row, appendix B's protein panel and appendix E. So a food fed only in unrated meals was missing from the protein-overlap scan, and fixing page 1 alone would have printed "60 meals logged" beside an appendix saying "4 logged meals" (C-3). The fix groups every logged discrete meal (`foodType === 'meal'`); `mealCompletion` stays the rated subset.
- **One meal predicate kept.** A format-treat food typed `meal` is counted as both a meal and a treat. `foodType === 'meal'` stays the report's one meal predicate, because the intake log, Noticed's `mealLeftByDay` and the previous-diet row read it too (moving one surface is the C-4 disagreement). The copy stopped claiming what it cannot; the precedence question is CUL-1322 item 8. The adversarial reviewer agreed with the trade.
- **CUL-1118 unruled, so the ratio stays** wherever one food carries the ratings.
- **A twin's rating fills a gap only when the twins agree.** `dedupeEvents` now fills a missing intake rating from same-food twins logged within the minute when they all carry the same rating; where they conflict, the representative's own rating stands, rated or not, as before this PR. Every choice between conflicting ratings had an unsafe side (see adversarial 5 and 6). Whether a conflicting pair should collapse at all is CUL-1328.

## What the page says now

Page 1's meal clause takes one of four shapes, decided once for both Feeding branches (`mealIntakeShape`, render.ts):

- **legacy**: every meal rated and all one food, the one shape pooled figures cannot misattribute. The long-standing wording, unchanged ("12 meals, typically "ate it all" — 9 of 12 fully eaten" / "10 of 12 rated meals fully eaten (owner-observed)").
- **single**: nothing rated, or one food carries every rating. The unknown leads, the food is named with its own denominator, and the day intake was last recorded is said when meals went on being logged after it: "66 meals logged, intake not recorded for 62; recorded for 4 of the 60 meals of Tiki Cat Chicken Mousse, intake last recorded Jun 28: "picked at it" ×1 · "refused" ×3, 0 of 4 fully eaten". Never "typically" over a partly rated record, in either direction, down to one meal.
- **byFood**: ratings on two or more foods. Each food's own ratings with its own denominator and recency, foods with a rating below "ate most" named first, then by ratings carried; three named, the rest pooled as "N other foods" with every rating kept; no pooled ratio. "Farmer Pumpkin Topper (4 of 4): "refused" ×4; Vetdiet HydroChick (7 of 60, intake last recorded Jun 8): "ate it all" ×7".
- **none**: no meal logged.

Recency is judged against the record's last logged meal, not the food's own, so ratings that stopped because the food stopped are dated too. Appendix E rows add "Not recorded ×N"; its caption states the recorded subset; its intro says an unrecorded meal's intake is unknown, neither eaten nor refused, names the treat / human-food overlap and points free-fed food to appendix B. "Treats + free-fed excluded" is said only of what exists.

## What the reviews found, and what changed because of them

Six rounds of `adversarial-reviewer`, four of `vet-report-cold-read`, one `code-reviewer`. Each round's findings were fixed, pinned by a test proven by mutation, and handed back.

- **Cold read 1 (NOT READY):** page 1 never called the 62 unrated meals unknown, so "66 logged; 4 rated … 0 of 4" scanned as a cat who eats fine; "rated" is the app's word; "(treats + free-fed excluded)" on a dog with neither read as if he had both. Fixed: the unknown leads, in "intake recorded / not recorded".
- **Adversarial 1 (FAIL):** the trial diet's own meal row skipped the kin-absorbing protein rule, so a hydrolysed-chicken diet was starred as contaminated by its own chicken in appendix E, with a dangling footnote under appendix B. Pre-existing, but it needed a rated trial meal; with every logged meal grouped it would have fired on nearly every trial report. Fixed with one shared trial-food predicate (`isReportTrialFood`). Also: ratings pooled beside names ranked by meals logged, and four surviving mutants.
- **Cold read 2 (Remy NOT READY):** the scored branch pooled a topper's four refusals with the trial diet's seven "ate it all" into "of the 11 recorded, 7 fully eaten", directly under the Trial diet row. Pre-existing pooling, on the line this PR rewrote. Fixed by the per-food shape.
- **Adversarial 2:** three or more rated foods still misattributed; an unlabeled rated food dropped; the trial rule's two paths unpinned (a mutant applying the rule to every food hid an intact-chicken contaminant and passed every test).
- **Cold read 3 (READY, one condition):** seven "ate it all" from the trial's first week read as current intake. Fixed with the per-food denominator and `mealItems[].lastRatedDate`.
- **Adversarial 3:** two refusal-deleting mutants survived (a named food's lower ratings, a pooled food's second rating); a refusing food could land in the anonymous tail; "treats excluded" still false for a format-treat meal. All fixed.
- **Cold read 4 (READY, all three):** "the last on Jun 8" read as the diet's last feeding. Worded "intake last recorded Jun 8".
- **Adversarial 4:** recency judged against the food's own last meal missed a food switch; `dedupeEvents` dropped a re-logged "refused" twin, and the new date then named an earlier day. Fixed: recency against the record; the dedupe merged the twin's rating.
- **Adversarial 5:** keeping the LOWER of two conflicting twin ratings lowered the relative detector's baseline, and a dog's refusal of its usual kibble stopped flagging on the report while Home flagged it. Fixed: the merge only fills a gap. Filed CUL-1328.
- **Adversarial 6:** filling from the FIRST rating of an unrated log's twins turned "unrated, then 'ate it all', then 'refused'" into "ate it all", and a cat three days off full meals went quiet; filling from the last would do the mirror. Fixed: fill only when the twins agree, both orders pinned.
- **Code review:** ship-ready; one comment nit taken ("eaten" → "fed").

## Proof

- 810 Deno tests in `generate-report`, type check clean; the jest guards (525) and the pre-push suite green on every push; the `lib/sameMinuteDuplicates` parity test green (clustering unchanged).
- Mutation, each red (≈40 across five rounds): the population (grouping over rated only, rated drawn from the window), every page-1 shape and its threshold, "typically" over a partial record, the per-food order, cap, pooled tail and each food's second rating, the unnamed food, the exclusion clause, the trial rule on every food and the label path dropped, recency on the report and render sides (creation, update, per-food vs record, pooled tail, `<` vs `<=`), and the twin merge (no fill, first fills, last fills, lower wins).
- Rendered fixtures (scratchpad, not committed): a grazing cat with 66 meals and 4 rated, a dog with 60 unrated meals, a dog on a hydrolysed trial with a refused topper.

## Residuals

- **CUL-1322** holds what the reviews found that predates this PR (page 1 never names a non-free-fed pet's food, stool "Normal ×0", "rated" vs "recorded" left in the safety band and appendix E's second table, "most recent" vs "every", the format-treat double classification, and more); items 3 and 5 were fixed here.
- **CUL-1328:** a conflicting pair of twin ratings still collapses to the earlier one (Home counts both).
- Two library rows sharing a label print as two per-food entries with the same name (the B-009/B-018 duplicate track), mirroring appendix E.
- The trial tile "Meals fully eaten (rated meals only)" keeps its pooled rated-only figure; it is labelled rated-only and appears only on a trial report without coverage.
- If CUL-1118 rules exception-only capture, the "F of R fully eaten" ratio goes and the clause states what was captured.
