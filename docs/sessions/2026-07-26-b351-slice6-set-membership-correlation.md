# B-351 slice 6 — set-membership correlation + collinearity clustering (Phase B)

**Date:** 2026-07-26

Shipped via **#458**. The last slice of the multi-protein track's correlation half, and the one the spec marked `adversarial-reviewer`-MANDATORY and deploy-gated.

## The gap this closed

`detectCorrelations` had always keyed each meal to **one** protein — `food_items.primary_protein`. Slice 1 gave every food a captured `proteins` set and yesterday's B-416 backfill took the library from **1 multi-protein row to 34** (max set size 5). None of it reached the engine. The canonical example is in the backfill's own report: `Tiki Cat after DARK Rabbit & Chicken Liver` → `["rabbit","duck","chicken"]`, a *rabbit novel-protein* food that the correlation engine still read as clean rabbit. The single most common way a home elimination trial fails silently was structurally invisible to the flagship wedge surface.

## The two halves, built as two halves

Spec §2's whole argument is that `primary_protein` conflates two different jobs. The build follows that split literally.

**Exposure (Job 1) — a pure widening.** Every feeding contributes its whole set, read through `readProteinSet` — Class-A key only, owner-designated primary hoisted to position 0. That function choice is not incidental: it is the rule slice 5's adversarial pass paid for (*a read path uses ONE keying function*), and using the write-path `deriveProteinSet` here would have re-created the same bug one layer down. Free-fed bowls now exclude **every** protein they carry rather than just the front of the pack — otherwise the engine would happily build a chicken→symptom case out of an exposure that was standing all along. A medication vehicle drops its **whole** set (B-156 PR C1's reasoning generalises: every protein in the carrier is collinear with the drug for that exposure). A row with no captured set degrades to `[primary_protein]`, and that is asserted by a test that runs the legacy and explicit shapes through the engine and compares outputs, not by a comment.

**Attribution (Job 2) — the guardrail.** Proteins whose exposure **indicator vectors over a symptom's matched set are exactly identical** are clustered into one joint candidate, named together and credited to none.

## Why exact identity, and not a threshold

§13 left open: *"how 'always together' is collinear-enough to force a joint candidate — 100% co-occurrence vs. a fraction?"*, and flagged it as a parameter to sweep like B-070's dominance fraction. This slice answers **exact identity, with no parameter at all**, and the argument is not a preference:

Every statistic detector ① computes — `caseExposed`, `controlExposed`, `b`, `c`, and therefore `riskDifference` and the exact McNemar `p` — is a *pure function of that vector*. Two proteins with identical vectors produce a bit-identical test result. The data does not make separation hard; it makes it **impossible**. Splitting them would emit two cards asserting different things about indistinguishable evidence. Clustering is recognising a degeneracy, not applying a tolerance.

A fraction would do real harm in the other direction: it would merge proteins the matched set genuinely *can* separate, throwing away attribution the owner earned by varying the diet — and it would add a knob whose only defensible setting is the one that changes nothing. Near-collinearity is instead left to the floors that already exist: a protein differing in one window still has to clear `earlyMinDiscordantCaseOnly` and `earlyMinRiskDifference` on its own, and one that falls short simply produces no card, which is silence and never an all-clear.

It also self-resolves with nothing to re-tune. The first time the owner feeds one without the other, one window differs, the vectors diverge, and the cluster splits into separately-attributable candidates — which is precisely the action the joint card asks for. There is a test for exactly that, because a claim that a design "resolves itself" is worth nothing unresolved.

## The consequences, each with a test

- **Bonferroni family** is sized by *discriminating clusters*. A 4-protein bag costs **one** comparison, not four — the Data Scientist's "4–5 proteins bloat the family" objection, closed by construction rather than by argument. `suppressedFamilyCount` (B-117 PR 9's tier-inflation guard) counts clusters too, or a medication-suppressed symptom would over-count.
- **Zero-vector proteins stay singletons.** A protein exposed in no analysed window has an all-zero vector and is trivially "identical" to every other such protein. Merging them would shrink the family and **loosen** `correctedAlpha` for unrelated real findings — the exact anti-conservative direction B-117 PR 9 exists to prevent. They carry no evidence either way, so the tiebreaker is conservatism.
- **A cluster inherits its weakest member's attribution floor.** Two proteins can share an exposure vector while only one ever rode a low-confidence shared bowl; since the members cannot be separated, claiming the clean one drove it is the same false credit the cluster exists to prevent. So a joint candidate can never be certified Established on a clean member's behalf.
- **Free-fed exclusion runs before clustering.** A standing bowl sits in nearly every window, so clustering it in would drag a genuinely-omnipresent *discrete* protein into a joint candidate with a protein that is not a candidate at all — manufacturing a card out of an exclusion.

## Safe degradation, and why `protein` became a label

`CorrelationFinding.protein` is now the joint **label** ("chicken and duck"), not a representative member. This was the deliberate choice and it is worth recording the reasoning, because the alternative looks tidier: had `protein` stayed a representative, every reader that predates clusters — the shipped client's evidence text, the vet report's `timingLine`, any `ai_signals` row cached before the deploy — would have silently credited **one** collinear protein and **exonerated its twin by omission**. That is the exact false attribution §7 #2 exists to prevent, leaking through a field nobody thought to update. As a label, the worst an un-updated surface can do is name both without the caveat. `proteins: string[]` carries the machine-readable form; both it and `jointCandidate` are optional on the client mirror, because `ai_signals` has a 24h TTL and pre-deploy rows will be read for at least a day.

## Surfaces

- **Home** — a linked-pair row (chips + `always fed together`) matching mock §3. It wraps rather than scrolls and is never truncated, at any cluster size: dropping a member to keep the row tidy would be a false exoneration wearing a layout's clothes. The sentence carries the resolving action; the row carries the caveat.
- **Phrasing** — joint findings are **template-only**, joining ③/④/⑤/⑥/⑦ and the red-flag lane. `validatePhrasing` can catch a causal verb; it structurally cannot notice that a paraphrase dropped a cluster member. (The `PHRASING_SYSTEM` rule and the payload's `proteins` array were added anyway, so a future routing change cannot lose a member quietly.)
- **Vet report** — the lead line now states the association **cannot be attributed to either protein individually**, and that separating them would be informative. Without it a vet reads a joint candidate as two independently-implicated antigens and may drop both — removing the one manipulation that would have told them which.
- **Patterns → Top protein** — counts sets, so the dashboard and the engine cannot disagree about what the pet ate (the drift `lib/protein.ts`'s header warns about). Shares stop summing to 1; each bar is now "the share of servings that *contained* it", and the definition copy says so rather than leaving a pie-chart reading standing.
- **Staple washout (B-070)** — now catches a staple hiding as a *secondary* (the chicken in every "duck" bowl), which is the case the diagnostic most needed to see. Its old "a tie for the top is impossible at ≥80%" uniqueness argument is **false** under set membership — two proteins really can both be in 100% of feedings — so selection got an explicit count-desc-then-key-ascending tiebreak instead of relying on a property that no longer holds.

## Behaviour change the spec did not anticipate → B-464

The guardrail also fires for two always-co-fed **single-protein foods**. The spec framed collinearity entirely around multi-protein foods; it is actually a property of the exposure vectors, and a 9am wet + 10am treat routine produces identical ones. The pre-existing `multi-implication` fixture — the PM's own 9am/10am/11am case — flipped from two cards to one joint candidate.

This is defensible on the merits: both proteins are still named (multi-implication holds, winner-take-all stays dead), one indistinguishable piece of evidence stops being presented as two independent findings, the family stops double-counting it, and the owner gets an action. But §7 #6 predicted a *rare* card — "a mono-food cat or a strict single-food trial dog" — and a fixed feeding routine is neither rare nor unusual. The open question is **frequency**, and it is a dogfood observation, not a code change. If joint cards turn out common, the fix is a surfacing rule (D5 already gates Home on the single-culprit floor), never a loosening of the clustering.

## Left out on purpose → B-463

§11 names `lib/analytics.ts` in slice 6 and it is here. But two *further* copies of the same descriptive ranking still key on `primary_protein` alone and are now inconsistent with the engine: `ask/tools.ts` `topProteins` and `generate-signal/summary.ts` `topMealProtein`. They under-count exposure — a sensitivity gap, never a false claim. Deferred so the adversarial pass reviewed statistics rather than copy churn, and because `topMealProtein` feeds a clinically-reviewed AI-summary clause whose own header explicitly forbids silent "alignment"; widening it needs a nod, not a mechanical edit.

## Deploy gate

**`generate-signal` must NOT be redeployed until #458 merges.** Per the B-182 lesson the engine cannot emit a shape the client can't render — but here the client renderer ships in the *same* PR, so the gate is a merge rather than a PR chain. After merge, redeploy via the Supabase MCP and regenerate for a pet whose library carries a multi-protein food.

## Verification

`tsc --noEmit` clean; **2214** jest (128 suites) and **893** deno; CI green on both jobs. No schema, no migration, no Edge Function deploy.
