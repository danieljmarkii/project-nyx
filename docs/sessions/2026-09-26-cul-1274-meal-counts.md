# CUL-1274 — the vet report counts every meal logged, and says which intake was recorded

**Date:** 2026-09-26

Shipped via #937. `generate-report` redeploys on merge (no hold in `deploy-manifest.json`).

## Why this session existed

The Engines v3 critique (CUL-1268, BRK-9) found page 1 of the vet report printing the RATED meal count as the number of meals fed: "Also fed as meals: the wet diet (4 meals … 0 of 4 fully eaten)" over 60 logged, and no clause at all when nothing was rated. Rating has collapsed on the dogfood record (CUL-1118: 3 positive ratings in 209 meals since mid August, the rest selectively negative), so the selectively rated record is the common one.

## What was decided

- **Scope, PM option A at the plan gate:** the rated-only population was upstream of page 1. `diet.mealItems` grouped rated meals only, and it also fed appendix B's "Meals logged" row, appendix B's protein panel and appendix E. So a food fed only in unrated meals was missing from the protein-overlap scan, and fixing page 1 alone would have printed "60 meals logged" beside an appendix saying "4 logged meals" (C-3). The fix groups every logged discrete meal (`foodType === 'meal'`); `mealCompletion` stays the rated subset.
- **One meal predicate kept.** The adversarial pass found a format-treat food typed `meal` counted as both a meal and a treat. `foodType === 'meal'` stays the report's one meal predicate, because the intake log, Noticed's `mealLeftByDay` and the previous-diet row read it too (moving one surface is the C-4 disagreement); the copy stopped claiming what it cannot, and the precedence question went to CUL-1322 item 8. The adversarial reviewer agreed with the trade.
- **CUL-1118 unruled, so the ratio stays** wherever one food carries the ratings.

## What the page says now

Page 1's meal clause takes one of four shapes, decided once for both Feeding branches (`mealIntakeShape`, render.ts):

- **legacy**: every meal rated and all one food. The long-standing wording, unchanged ("12 meals, typically "ate it all" — 9 of 12 fully eaten" / "10 of 12 rated meals fully eaten (owner-observed)").
- **single**: nothing rated, or one food carries every rating. The unknown leads: "66 meals logged, intake not recorded for 62; recorded for 4 meals of Tiki Cat Chicken Mousse: "picked at it" ×1 · "refused" ×3, 0 of 4 fully eaten". Never "typically" over a partly rated record, in either direction, down to one meal.
- **byFood**: ratings on two or more foods. Each food's own ratings, ordered by ratings carried, three named, the rest pooled as "N other foods" with every rating kept; no pooled ratio.
- **none**: no meal logged.

Appendix E rows add "Not recorded ×N"; its caption states the recorded subset; its intro says an unrecorded meal's intake is unknown, neither eaten nor refused, and names the treat / human-food overlap. "Treats + free-fed excluded" is said only of what exists.

## What the reviews found, and what changed because of them

Three rounds of `adversarial-reviewer` and `vet-report-cold-read`, one `code-reviewer`.

- **Cold read 1 (NOT READY):** page 1 never called the 62 unrated meals unknown, so "66 logged; 4 rated … 0 of 4" scanned as a cat who eats fine; "rated" is the app's word; "(treats + free-fed excluded)" on a dog with neither read as if he had both. Fixed: the unknown leads, in "intake recorded / not recorded".
- **Adversarial 1 (FAIL):** (1) the trial diet's own meal row skipped the kin-absorbing protein rule, so a hydrolysed-chicken diet was starred as contaminated by its own chicken in appendix E, with a dangling footnote under appendix B. Pre-existing, but it needed a rated trial meal; with every logged meal grouped it would have fired on nearly every trial report. Fixed with one shared trial-food predicate. (2) The names beside "Also fed as meals" ranked by meals logged while the ratings pooled across foods, so a topper's ratings read as the staples'. (3) Four surviving mutants.
- **Cold read 2:** Luna and Bo READY; **Remy NOT READY.** The scored branch pooled a topper's four refusals with the trial diet's seven "ate it all" into "of the 11 recorded, 7 fully eaten", directly under the Trial diet row: a vet read the diet as left a third of the time. Pre-existing pooling, on the line this PR rewrote.
- **Adversarial 2 (BREAKS, narrowed):** the same pooling on the scored branch; three or more rated foods still misattributed; an unlabeled rated food dropped silently; the trial rule's two paths unpinned (mutant N1 applied the rule to every food and hid an intact-chicken contaminant, and passed all 802 tests).
- **Fix, round 2:** the per-food shape, the unnamed food, conditional exclusion, appendix E's intro, and tests for both trial-rule paths.
- **Code review:** ship-ready; one comment nit taken ("eaten" → "fed").

## Proof

- 805 Deno tests in `generate-report`, type check clean; jest guards 525 green.
- Mutation, each red: grouping over rated only; the rated count printed as meals; "typically" over a partial record; no "Not recorded" cell; the scored branch dropping the logged count; an unrated meal pushed as a rating; rated drawn from the window (a rated treat); the dates of unrated meals; the trial rule on every food (N1); the label path dropped (N4); per-food unsorted; the cap; the pooled tail dropped; the legacy form pooling across foods; the per-food threshold; the unnamed food dropped; the exclusion always printed; the single food's finished count.
- Rendered fixtures (scratchpad, not committed): a grazing cat with 66 meals and 4 rated, a dog with 60 unrated meals, a dog on a hydrolysed trial with a refused topper.

## Residuals

- **CUL-1322** holds everything pre-existing the reviews found, fourteen items less the two fixed here: page 1 never names a non-free-fed pet's food, stool "Normal ×0", "rated" vs "recorded" left in the safety band and appendix E's second table, "most recent" vs "every", the format-treat double classification, and more.
- The trial tile "Meals fully eaten (rated meals only)" keeps its rated-only figure with no logged count; it is labelled rated-only and appears only on a trial report without coverage.
- If CUL-1118 rules exception-only capture, the "F of R fully eaten" ratio goes and the clause states what was captured.
