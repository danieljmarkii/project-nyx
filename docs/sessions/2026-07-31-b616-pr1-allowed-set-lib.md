# B-616 PR 1 — the allowed-set read hook + the mid-trial add

**Date:** 2026-07-31

Shipped via **#526**. Spec: `docs/nyx-food-library-trial-awareness-requirements.md` §6 (PR 1). Gate PR 0 landed earlier the same day via #523, so `narrowTrialFoodRole` was already the single narrower this read had to call. No UI, per the kickoff.

## What shipped

- **`lib/trialAllowedSet.ts`** — resolves the pet's running trial and its dated `diet_trial_foods` rows from the local mirror, and exposes the three lookups the four upcoming surfaces need: `trialListMembership` (role + `allowed_from` + which identity arm matched), `isOnTrialList`, and `trialListFoodsOn` (the rows in force on a day, for the strip's count and the picker's pinned section).
- **`hooks/useTrialAllowedSet`** — the thin hook, scoped to the active pet (D7) and re-read on `hydrationTick`.
- **`addTrialFood`** (`lib/dietTrialSetup.ts`) — FR-12's one write.
- **`allowedMembershipOn`** (`lib/dietTrial.ts`) — rung 1, extracted and exported. See below; this is the load-bearing part.

## One predicate, made structural rather than stated

D3 says every membership render calls `matchAllowed`. `matchAllowed` was module-private, so honouring that literally meant every surface re-typing rung 1's two lines: filter the allowed set by date (`allowedFoodsOn`), then match on id-then-key. Both halves are silent when omitted, and each has a known cost already paid once in this codebase:

- drop the **date gate** and a mid-trial add renders as though the food had always been on the list — the retroactive rewrite `membershipOn`'s docstring exists to prevent;
- drop the **key arm** and a re-photographed bag of the prescribed diet shows unmarked in the owner's own library while the classifier permits its every meal (§5.4).

So rung 1 itself is now one exported call, `allowedMembershipOn`, and `classifyFeeding` was re-based onto it. The library and the classifier cannot disagree because there is only one function that answers. What it deliberately does **not** fold in is the window check: membership is a fact about the list on a day, and `isInTrialWindow` is the record's separate question — merging them would make the §2.2 screen unable to render the dated history it exists to render.

## The convergence property, and the decoy that gives it teeth

§6 AC 3 asks for a property test asserting the hook never disagrees with `classifyFeeding`. Written as a sweep over 10 foods × 10 days — the prescribed diet, a re-photographed bag, a mid-trial add, an unhydrated row (no brand/product, id is the only identity), a dated removal, an unreadable role, two off-list foods, a no-identity feeding and a blank-named one, across days before the trial, either side of the add, either side of the removal, and past the target end.

The biconditional is stated with its one carve-out rather than assumed: `verdict === 'permitted'` ⟺ `isInTrialWindow && onList`. When both agree it is permitted they must also agree on the *role* and on *which arm matched* — the chip's word and the vet report's attribution are one value.

A property test over a shared call can pass while proving nothing, so the suite also asserts the naive re-derivation **fails** the same sweep: `set.foods.some(f => f.foodItemId === id)` — id-only, undated, exactly what a surface writes when it filters the list for itself. It misses the re-photographed bag on every in-window day and gets the add and the removal wrong on their boundary days, and the test names those three cases explicitly. If a future change makes the sweep vacuous, that assertion goes red first.

## `unknown` is not `no_trial`, and an empty allowed set is neither

The hook has three states, and the third one is the whole R2 contract: **render nothing**. The case worth writing down is a live trial whose `diet_trial_foods` rows have not hydrated. `startDietTrial` writes the trial and its allowed set in ONE transaction, so a running trial with zero rows is never "a trial with nothing permitted" — it is `diet_trials` having arrived before its children on a fresh install or a re-login. Returning `ready` with an empty set there would un-mark the prescribed diet on the Foods tab while the owner is standing in front of it, and print *"0 foods on the trial list"* under the header: a claim about the record rather than an absence of one. So it is `unknown`. Same shape as `dietTrialFacts`' null-not-empty rule one layer down, and the same reasoning drives the hook's error path — a failed re-read drops to `unknown` rather than keeping the previous answer, because a wrong mark is worse than no mark (R1).

Belief is gated by **`isTrialRunning`**, never raw `status` (B-422): `status = 'active'` is the steady state of a stale trial, and a chip reading "Trial diet" on a trial that ended in March is a false present-tense claim. This is squarely the belief side of B-422's split — nothing here bounds evidence, and a returned row's `allowedFrom` is its own column, untouched.

## The add never rewrites history

`addTrialFood` writes `allowed_from` = **today**, not the trial's start day, and that single field is the whole safety property of D5. `buildTrialRows` correctly opens membership at `started_at` (a back-dated trial must not render its own prescribed diet as un-permitted); doing the same on a mid-trial add would silently re-score every prior feeding of that food as permitted, drop the exposure count, flip the card to clean and empty the report's appendix — with nothing on any page saying so. FR-11's confirm sheet promises the owner this in plain words; this is the half that makes the sentence true. Insert-only, never an UPDATE of an in-force row, which is the same rewrite by another route.

Two things the write path cannot do, deliberately: it cannot ask for a role (Principle 1 — inferred from `food_type` via `permittedRoleForFood`), and it cannot write **`primary_diet`**. A mid-trial add is a vet-sanctioned extra; letting this path mint a diet-defining row would widen the sanctioned protein comparator from a screen whose entire copy is *"your vet said this is OK"* — §5.5 D-A's self-granted loophole, opened by the front door. Pinned by test.

The row shape is shared rather than parallel: `buildTrialFoodRow` and one `TRIAL_FOOD_INSERT_SQL` now serve both write paths, and AC 4 is asserted as a literal param-array match against a `buildTrialRows` row for the same food. The fields that would have drifted are the two that matter — `food_label` (denormalized at write time because the row outlives the food) and `role`.

`trialListFoodsOn` dedupes by the identity `matchAllowed` would resolve, first row wins. That is not tidiness: the caller filters foods already on the list, and a caller that does not is a UI bug — but without the dedupe it would become a data-shaped one, double-rendering a food in the list a vet is told about and inflating "K foods on the trial list".

## Verification

`tsc --noEmit` clean; **3649 jest across 162 suites** green (21 new). The Edge Function half could not be run locally — `deno` is not installed in this container this session — but the only change under its import graph is additive plus one internal delegation in `classifyFeeding`, and CI's `deno test` job covers it.

**DoD gap, stated rather than papered over:** the spec's `code-reviewer` gate did **not** run — this environment instructs against dispatching subagents unprompted, which conflicts with CLAUDE.md's DoD. It is the one unchecked box on this PR. Worth a second pair of eyes for the same reason PR 0 needed one: that session's drift guard was verified against its author's own decoy, passed, and `code-reviewer` then broke it with an arrow-function variant on the first try.

No `adversarial-reviewer` line, per §6 — this track computes nothing, it renders the shipped predicate's answers. That exemption is now doing real work rather than being an assumption: `allowedMembershipOn` is the mechanism that keeps it true, and if any later PR grows its own membership logic the exemption dies with it.

## Falsification attempts (the DoD's adversarial line)

Stated rather than ticked. Six attempts to break the layer, and what happened:

1. **Can the library disagree with the classifier anywhere?** Swept 100 (food, day) pairs — the re-photographed bag, an unhydrated row whose id is its only identity, a dated removal on both sides of its boundary, an unreadable role, a no-identity feeding, a blank-named one, days before the start and past the target end. Zero disagreements; role and matched-arm agree on every permitted pair. **Held.**
2. **Can that property be vacuous?** Planted the naive re-derivation (id-only, undated) and asserted it *fails* the same sweep. It does, on the three case classes the test names. So the sweep discriminates rather than comparing a function to itself. **Held.**
3. **Can an un-hydrated set produce a reassuring render?** A live trial with zero rows returns `unknown`, so nothing renders. Ready-and-empty would have un-marked the prescribed diet on the Foods tab and printed "0 foods on the trial list". **Held by construction, and tested.**
4. **Can `addTrialFood` retroactively permit a past exposure?** `allowed_from` = today, asserted at the bind; a pre-add feeding still classifies off-diet because `membershipOn` gates on the day. **Held.**
5. **Can the add widen the sanctioned protein comparator?** `permittedRoleForFood`'s codomain is `{permitted_treat, permitted_other}` — `primary_diet` is unreachable from this path. Asserted. **Held.**
6. **Does a stale `status = 'active'` trial keep marking foods forever?** A January trial with a 28-day target reads `no_trial` in July despite the column. **Held.**

**One residual the attempts produced → B-624.** `trialListFoodsOn` dedupes by `foodKey ?? foodItemId` keeping the first row, while `matchAllowed` resolves id *before* key — so two rows for one brand+product with different ids make the §2.2 list and the food-detail row disagree about the *date* (both still say the food is on the list). Local double-adds are already prevented by the key arm in PR 2's filter, so the live path is a duplicate arriving from another device. Filed rather than patched: the fix belongs with the screen that renders the date.

**Limits worth stating.** The sweep is a fixed cross-product, not a fuzzer — it covers the case classes the spec names, not arbitrary input. And the Edge Function half was verified in CI rather than locally (`deno` is not installed in this container).
