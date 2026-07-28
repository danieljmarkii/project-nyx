# B-417 Bucket-A PR 2 — the refusal lane survives an identity miss, and reaches the safety band

**Date:** 2026-07-28 · shipped via **#503**

Bucket A of the `generate-report` redeploy gate (`docs/diet-trial-preship-review-2026-07.md` §2), second PR of the train: **B-530** + **B-531**, carrying **B-494**'s lane. B-529 (protein identity) is still unbuilt, and this PR is deliberately written to be *identity-agnostic* rather than to wait on it.

## The mechanism, which turned out to be one thing wearing three ticket numbers

The pre-ship review filed B-530 and B-494 separately. They are the same failure at two altitudes.

`trialDietRefusal` and `rangeRefusal` counted **only** feedings that `classifyFeeding` returned with `role === 'primary_diet'`. That population is produced by rung 1, so it exists **only when food identity resolves** — and when identity misses it does not degrade, it *empties*. The adversarial chair executed the consequence: a 21-day all-refused cat behind a re-photographed bag (new UUID, `"z/d"` → `"z/d Feline Food"`) produced a null refusal fact, `mayClaimAllMatched` true, and her 42 refused bowls of the **prescribed** diet re-rendered as owner-blamed off-diet exposures.

Then B-494's half: because the fact was null, nothing reached `snapshot.safetyFlags` either — and `detectIntakeDecline` is structurally blind here (a diet refused from day 1 is uniformly low, not *declining*), so the flag zone was empty on the canonical feline-anorexia record. The report *teaches* the reader to scan that zone, so its silence reads as a negative result. That is what the 2026-07-26 ruling called reassurance-on-absence at the report layer, and it is what made B-494 the redeploy gate.

So: one animal, one photograph, and two independent safety surfaces went quiet.

## What was built

**The lane no longer depends on the match.** The repair is explicitly *not* a better matcher — a matcher can always miss, and B-529 owns making it miss less. `computeTrialFacts` now accumulates a second, **wide** population (every in-range non-treat feeding) in the same pass as the narrow one, through a shared `tallyRefusal` helper so the two can never drift into different definitions of "not eaten". When the module has already concluded it cannot identify the diet (`allowedSetUnavailable`, both disjuncts), the same ratified floors are measured over the meal record and the fact is tagged `population: 'meal_record'`.

Two properties hold by construction, and both are asserted:

- **R1a is untouched.** Both populations count *rated* feedings only, so an owner who never taps intake still cannot be told her cat isn't eating.
- **The fallback can only add disclosure.** It is reachable exclusively from the state where the narrow population is empty, so there is no record that fired before and is quiet now.

**The population travels on the fact**, rather than being re-derived per surface. That is the same lesson `mayStateRecordClean` learned the hard way: a rule re-derived in three places is a rule that holds in two. The card headline, the card note, `render.ts`'s exposure sentences and the new safety-band row all widen their noun off the one field and disclose the attribution gap, instead of asserting an identity the module just failed to establish. On a vet's artifact that would be a fabricated attribution, not a copy rounding.

**The refusal sentence was hoisted out of branch 2 of `exposureSentences` into both branches.** The `allowedSetUnavailable` branch returned *early*, so the record that cannot resolve its own diet was precisely the one whose trial block never mentioned that the animal wasn't eating.

**`weightDuringTrial` is decoupled** (`render.ts:1706`). It was pushed from *inside* the refusal branch, so every identity miss silenced the weight line too, and the two failures compounded into the quietest possible page over the sickest patient. It renders on every branch now, and yields to the safety band when that carried it — composed once, never twice.

**B-494's flag** is a new `trial_diet_refusal` `SafetyFlag`, built from the trial block's `rangeRefusal ?? trialDietRefusal` (the *range* fact — a report is a history, and the 14-day recency bound would drop the flag on a cat whose ratings went quiet) or from an owner-declared `stopped_reason='refused'` with no counts invented. It composes the trial-scoped weight delta **on the flag itself**, because the cold read's finding was never that a fact was missing: refusal, weight delta, typical intake and the free-fed bowl were all on the page, distributed across four sections and never put together. The legend now names the lane, so the zone the report teaches the reader to scan matches what actually watches it.

**B-531** — with a trial in-window and a dark permit set, all three count branches suppress themselves and the page fell through to the banned negative claim three ways. The code's own unreachability comment omitted that sub-state; **the comment was the defect, not the guard**. The page-1 row, appendix C's empty row and its caption now branch on *whether there is a trial*, not on whether its permit set hydrated. R2's rename landed with it: a no-trial report drops "off-diet" vocabulary for what it actually lists, including the At-a-glance tile still labelled *"Off-diet load"*.

One thing fixed in passing: the report said *"logged as refused"* over a not-finished predicate (`refused`/`picked`/`some`), reporting a rating the record does not contain about every `some` bowl. The card's headline had been corrected for exactly this in #502; the report had the same defect and nobody had looked.

## Dr. Chen's falsification attempts, executed

Not asserted — run against the real predicate, and one of them broke.

- **The picking cat behind a broken bag** (42 bowls rated `some`, identity missed) → **fires**, `meal_record`, 42/42 across 21 days. Partial anorexia is the presentation an owner does not call about, and it survives the miss. Held.
- **The substituting owner at the floor** (21 refused hydrolysate + 21 eaten chicken) → share exactly 0.50, **fires**. Held at the boundary.
- **Silence cancelling an alarm through the wide door** (the same record with 42 eaten chicken meals) → **goes quiet**, where the identical record with intact identity fires 21/21. **Broke** — but not as a regression: the shipped behaviour there is also silence.
- **Fabricating an alarm from absence** (the canonical record with every rating stripped) → no fact, no flag, no copy. Held.

## The two residuals, named rather than assumed away

Filed as **B-576**, pinned as `KNOWN LIMIT` tests that are *expected to flip* when B-529 lands. Both are under-fire, and neither is a regression — the shipped behaviour in both is silence, so the fallback is still strictly more disclosure than before.

1. **The partial miss.** A real trial is often a wet *and* a dry of the same diet (§4.1), so re-photographing only the dry leaves `narrow.feedings > 0`, `allowedSetUnavailable` false, and the narrow population speaking — seeing only the wet. A cat eating the wet and refusing the dry reads as eating. Widening the unavailable test to catch it ("any `primary_diet` row matched zero feedings") would fire on every legitimate trial whose owner feeds one of the two.
2. **Dilution.** The wide population is a *share* over every non-treat feeding, so an owner who substitutes when the prescription is refused pushes it back under `REFUSAL_SHARE`. That is the canonical diet-trial failure mode. The repair is a **duration** criterion rather than a share — which is a clinical number, and already Dr. Chen's open call in **B-575**. Inventing it inside a wiring PR is exactly the move this repo has a rule against.

Pinning them as tests rather than leaving them as prose is deliberate: the failure mode of a documented limit is that a later reader assumes coverage.

## Verification

`tsc --noEmit` clean · **3,302 jest** · **1,012 deno** · `adversarial-reviewer` + `code-reviewer` run on the diff.

## What this does NOT do

**It does not lift the `generate-report` redeploy hold.** Bucket A still owes **B-529** (protein derived-from relation + primary↔set consistency + the antigen silence rule) and **B-532** (render honesty), and then a fresh `vet-report-cold-read` on re-rendered artifacts. B-494's ruling set the bar for this lane; it did not waive the gates.
