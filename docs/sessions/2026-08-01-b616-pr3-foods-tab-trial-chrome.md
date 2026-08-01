# B-616 PR 3 — the Foods-tab trial strip + the food-detail membership row

**Date:** 2026-08-01

Shipped via **#—**. Spec: `docs/nyx-food-library-trial-awareness-requirements.md` §2.1 + §2.4 (§6's PR 3, FR-1→FR-4 and FR-13→FR-15). Design authority: mock **screens A and D** in `docs/culprit-food-library-trial-mockups.html`. Built over PR 1's lib layer (#526) and reusing PR 2's confirm sheet (#527) rather than a second one. Copy pack is spec §4, verbatim.

## What shipped

- **`lib/trialLibraryChrome.ts`** (new, pure) — every string and model these two surfaces render: `trialChipLabel`, `buildFoodsTrialStrip`, `trialMembershipLine`, `addToTrialListLabel`.
- **`components/foods/FoodsTrialStrip.tsx`** — FR-1. `Diet trial — day 12 of 28` / `3 foods on the trial list`, tinted accent, opening `/trial-foods`. Names the pet only on a multi-pet account (D7).
- **`components/foods/FoodRow.tsx`** — FR-2. A `TRIAL DIET` / `ALSO ALLOWED` eyebrow chip at the head of the text column.
- **`components/food/TrialMembershipRow.tsx`** + **`app/food/[id].tsx`** — FR-13/FR-14. One slot, two states, never a third.
- **`app/(tabs)/foods.tsx`** — the strip, and one chip resolver threaded to the favorites shelf and the type groups.
- **`hooks/useTrialAllowedSet.ts`** — the D7 gap fix (below), the one PR-1 file this PR reopened.

## R1 is carried by the type signatures, not by discipline

Every describing function returns `string | null`. There is no `{ onList: boolean }` anywhere for a caller to render the false branch of, no negative string exists in the module, and both components render *nothing* — not a grey chip, not a disabled row — when handed null.

The test sweeps a **whole pantry** rather than one off-list food, including two blank-named rows, because a single off-list assertion would also pass on a function that marked the complement of a smaller set. Beside it is a banned-vocabulary assertion over every string the module can emit (`not on`, `off-diet`, `avoid`, `safe`, `warning`, `!`, plus §6.9's `coverage`, `adherence`, `streak`, `score`, `%`).

## The strip renders nothing rather than "0 foods on the trial list"

A count of zero is a claim about the record, not an absence of one — the same rule `loadTrialAllowedSet` applies one layer down when it answers `unknown` for a hydrating set. What makes it worth stating here is that it is reachable **without any hydration problem at all**: a live trial whose rows are all date-gated out (a future `allowed_from`, a passed `allowed_until`) leaves a legitimately empty set for today. The honest rendering of "the list permits nothing today" is no strip; the trial card still carries the trial.

## The D7 gap `code-reviewer` found, which was this PR's own AC 3

The hook resolved the allowed set asynchronously and only reset on `petId` becoming *falsy*, so switching the active pet left the previous pet's answer in state until SQLite came back. On a per-account food library that is exactly the leak D7 forbids — pet A's trial marking foods while pet B is selected — and it was invisible while one surface consumed the hook. PR 3 put three behind it.

Clearing in an effect does not fix it: an effect runs *after* the render that already drew the stale chrome. So the pet is now stored alongside its answer and the mismatch is resolved during render — the instant `activePet` changes, the hook reports `unknown`, which the track already defines as render-nothing.

Two things pin it. The new guard asserts what the hook reports **while the read is in flight** (a promise that never resolves), and it fails without the fix; the pre-existing "re-resolves against the newly selected pet" test passes either way, which was the reviewer's actual point — a destination-only assertion is happy while the gap is wide open. The counterpart test asserts the hook does **not** blank on a `hydrationTick` bump, which is why the fix is a render-time pairing rather than a blanket reset: the tick fires every sync cycle and a reset would flash the strip and every chip off and back on while nothing changed.

## Two mock deviations `pm-feature-review` caught, and the width math behind the fix

The first draft shipped the chip as a **sentence-case trailing pill** beside the chevron. The mock styles it as an **uppercase, tracked eyebrow with a leading accent dot** — deliberately, because that treatment reads as a *category label* where a sentence-case green pill reads as an *approval badge*, and this chip names the trial's list rather than blessing the food. The row-vs-tile layout justified moving the chip; it did not justify changing the case or dropping the dot.

Restoring the treatment forced the position too, and the arithmetic is why. `ALSO ALLOWED` at `textXS` with `trackingWidest` plus its padding and dot is ~117pt. A row has already spent ~150pt on the thumbnail, gaps and chevron, so on a 320pt device the food's own name would have been left about 37pt. Even the sentence-case version left ~50pt. So the chip moved into the **text column as its first element** — the mock's actual position (top-left of the tile, above the brand), where the full column width is available and it sits with the `BRAND · FORMAT` eyebrow it now shares a treatment with. `textTransform: 'uppercase'` is asserted by test: the regression is silent, since the words do not change.

The second: mock D renders the add action as a **ghost button**, and the build had shipped a bare accent text link. That mattered more than fidelity. The block sits at the head of a column of labelled `TextInput`s above a sticky **Save** bar, and the reviewer's cold read was *"if I tap this, do I also have to Save?"* (you do not — it opens a sheet and the sheet writes). A filled, full-width control is unmistakably an action.

## What was deliberately not fixed

- **Vet framing on the add flow (B-628).** The reviewer is right that nothing in food detail → action → sheet says *whose* call an addition is, and equally clear this is not a request for a wisdom-check — D5 and Dr. Chen's mock-C note forbid "are you sure this fits the trial?", because second-guessing the vet judges the owner for following them. But the fix is a copy-pack edit to a §4-locked surface shared with PR 2, so it is a PM call.
- **A persistent `Biscuit's library` subtitle (B-626).** In mock A, and it would fix multi-pet legibility — but §2.1's FRs cover the strip and the chips only, and a permanent header subtitle changes the Foods tab for every owner including those on no trial.
- **The favorites-shelf adjacency (B-629).** `Finished 9 of 11 meals` beside `TRIAL DIET` can be read as an adherence score §6.9 forbids. Both obvious fixes are worse than the risk: suppressing the chip on shelf rows would mark the same food in one place and not another, which breaks G2's two-sidedness far more sharply than the adjacency does; suppressing the denominator would delete the visible rate intake-is-not-preference requires. The fix is visual separation, and it wants the device screenshot the reviewer asked for.
- **Strip/detail disagreement at an empty in-force set (B-631).** Both readings are individually defensible, and it is unreachable until D8 ships removal.

One thing that *was* changed on the reviewer's flag: the strip now also renders in the error and empty branches of the Foods tab. The trial read is independent of the library read, so a failed catalog load — or a fresh install where `diet_trial_foods` hydrated before `food_items_cache` — leaves an owner with no library and a live trial. That is the owner who most needs the list, and the strip is a working path to it.

## Copy

Spec §4 verbatim, with the track's standing typographic apostrophes. `nyx-voice` pass: pet-named with the `your pet` second-person fallback, specific over generic (a day counter, a count, a date), no exclamation marks, no jargon, nothing asserting wellness. `Also allowed` names the vet's list, not a safety judgement. The add's failure reuses PR 2's `ADD_TRIAL_FOOD_ERROR` — plain cause, concrete action, sheet stays open.

## Verification

`tsc --noEmit` clean; **3742 jest across 167 suites** green (33 new lib cases, component suites for all three surfaces, 2 new hook guards). Nothing under `supabase/functions`, so the Deno job is untouched by this diff.

Acceptance criteria (spec §6, PR 3):

1. chips render only on on-list tiles, zero marking of any other tile — **pass** (the pantry sweep + the banned-vocabulary assertion + component tests on both null and undefined);
2. strip renders only while `isTrialRunning`, disappears cleanly at trial end — **pass** (`loadTrialAllowedSet` applies `isTrialRunning`, so an ended or stale trial arrives as `no_trial` and both the builder and the component return null);
3. pet B's context shows no trial chrome for pet A's trial — **pass**, and only after the hook fix above; the in-flight window is now asserted, not just the destination;
4. archived on-list food: tile stays hidden, PR 2's list still names it — **pass** by construction (the chip resolver runs over library rows `getLibraryFoods` has already filtered; nothing in this PR reads or renders archived rows, and §2.2 names the food from `food_label`);
5. detail row absent — not "Not on the list" — for off-list foods — **pass**;
6. the B-351 contaminant note co-renders untouched — **pass** (not modified; deliberately placed far from the membership block so the two cannot read as one verdict, C2).

Two review verdicts: `code-reviewer` **ship-ready**; `pm-feature-review` SHIP-SHAPED on the strip, the membership fact and the non-trial tab, NEEDS-WORK on the add flow's vet framing (→ B-628) and multi-pet legibility (→ B-626), and **INSUFFICIENT pending a device screenshot** on two visual calls: whether the chip reads as identity rather than approval among unchipped rows, and whether the food-detail block reads as an action rather than a form field. Both were addressed by the mock-fidelity fixes above, but neither is *settled* without the picture — that is the on-device pass, and the manual QA script asks for it.
