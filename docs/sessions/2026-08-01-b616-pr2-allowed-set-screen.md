# B-616 PR 2 — "What {pet} can eat" + the mid-trial add

**Date:** 2026-08-01

Spec: `docs/nyx-food-library-trial-awareness-requirements.md` §2.2–§2.3 (§6's PR 2). Design authority: mock screens B and C in `docs/culprit-food-library-trial-mockups.html`. Built over PR 1's lib layer (#526); copy pack is spec §4, verbatim. Closes the **first half of B-458** — the second half (the exposures screen) is PR 4.

## What shipped

- **`app/trial-foods.tsx`** — the allowed-set screen. Role-grouped rows (`Trial diet` / `Also allowed`), each a dated membership fact, the designed empty-extras state, `Add a food to the list`, and the C6 disclosure verbatim at the foot.
- **`lib/trialFoodsScreen.ts`** (new, pure) — every string both surfaces render, plus the two things worth pinning: which day of the trial a row's `allowed_from` falls on, and the FR-11 sheet's exact three facts.
- **`components/profile/AddTrialFoodSheet.tsx`** — the confirm sheet. Three facts, two actions, no third path.
- **`lib/dietTrialCard.ts` + `app/(tabs)/profile.tsx`** — the `view_allowed_foods` action and its handler.
- **`lib/trialAllowedSet.ts`** — the B-624 fix (below).
- **`lib/utils.ts` / `lib/feedingArrangements.ts`** — `formatCalendarDate` moved to its actual siblings (`toLocalDayKey`, `dayKeyToLocalDate`, `formatUtcDayShort`) and re-exported, so no call site changed.

## "No card change" was half-true, and the half that wasn't is worth recording

B-458's row says each screen "lands by adding one handler, with no card change", and FR-5 repeats it. That is exactly right for the exposures screen: `view_exposures` is already a declared action, and `DietTrialCard` draws an action **only** when the surface passes a handler for its id, so PR 4 really is handler-only.

It is not right for this screen. The model declared no allowed-set action at all, so a handler alone would have drawn nothing and the screen would have been unreachable. `DietTrialCard.tsx` — the view, which is what the round-5 design lock governs — is untouched; `lib/dietTrialCard.ts` gained `view_allowed_foods` and emits it as a quiet `link` on the running states in the ordinary register. Deliberately **not** on the two safety-replacement states (decline, refusal) or the milestone/overrun/terminal cards: §5.2 makes those compositions structural, and their action rows are single-purpose by design.

One existing assertion had to move with it — `expect(model.actions).toEqual([])` on the mid-trial clean card. It was rewritten to name the permitted set rather than assert emptiness, because what §4.2 actually forbids is a **write** path ("logging is the FAB; a second door to the same room is not a feature"), not an action count. The `not.toMatch(/log a meal/i)` guard beside it is the one that encodes the rule, and it is untouched. This is the same register test the B-614 med-strip session landed on from the other direction: *a control that opens a form is a second door; a control that reads or confirms is not.*

## B-624, fixed in two halves and narrowed rather than closed

The kickoff asked for the dated fact to render through `allowedMembershipOn` rather than off the first row of `trialListFoodsOn`. Doing that surfaced a second, worse bug in the same three lines.

**The grouping key was `foodKey ?? foodItemId`**, which skips the `isUsableFoodKey` test `matchAllowed` applies. `foodIntakeKey('','')` is the bare separator — a key that names nothing — so two blank-named rows are two distinct foods to the predicate and collapsed into one in the list. A food the owner was told their vet sanctioned simply vanished from the screen whose entire job is to be the re-readable rule. The identity is now `isUsableFoodKey(f.foodKey) ? f.foodKey : f.foodItemId`, and `isUsableFoodKey` is exported rather than re-typed, for the reason the whole track exists: a second copy of that test is a second answer to "are these two rows the same food".

**And the representative was positional.** PR 1's comment said keeping the first row "matches `matchAllowed`'s own `find`"; it is not the same thing, and the difference is a *date* — which is load-bearing copy here, because D5 renders it as "Added Jul 12, day 12" and the no-amnesty promise rests on it. Every surviving row is now resolved through `allowedMembershipOn` and the list renders what rung 1 returns. The regression test is written in its general form — *for every listed row, asking rung 1 about that row's own identity returns that row* — because a positional pick can satisfy a specific example by coincidence.

**What is left is genuinely the predicate's, not the list's.** With two rows carrying the same key and different `food_item_id`, `matchAllowed` resolves id-before-key, so food detail queried by id B still reports row B's date while the list names its representative's. Closing that means ruling how the predicate should order an id/key conflict — a change every consumer reads, out of scope for a screen PR. B-624 stays `Later`, narrowed, with the remaining case written down.

## The three states, and the one that is easy to get wrong

`ready` renders. `no_trial` is a fact the app actually knows, so it says so and says what the screen is for (Principle 5 — the only way an owner lands here is a trial ending while they are standing on it). `unknown` renders a spinner and **not** an empty list: an empty allowed-set screen is the strongest "nothing is permitted" claim in the app, and R2 forbids drawing a read that could not answer as an answer.

R2 is also enforced one layer earlier, at the entry rather than inside the screen: `profile.tsx` reads `useTrialAllowedSet` and passes the `view_allowed_foods` handler **only** on a hydrated set, so an unresolved read draws no link at all instead of a link into a screen with nothing to say.

## Copy

Every owner-facing string is spec §4 verbatim, with one glyph-level deviation applied throughout: apostrophes are typographic (`’`), the app's standing convention in every shipped string. The spec's markdown carries straight quotes because markdown does.

Two strings the copy pack does not cover, written to the same register and pinned by test:

- the **no-trial** state, which the `nyx-voice` pass caught as a Principle-5 dead-end on the first draft ("Biscuit isn't on a diet trial right now.") and now points forward: *"…When one is running, the foods it allows show up here."*
- the **write-failed** line. A sheet that closed over a failed insert would leave the owner believing a food is permitted while the record — and the vet report built from it — says it is not, which is precisely the screen/record disagreement this track exists to prevent. So the failure renders in place, the sheet stays, and the button stays live.

The register is asserted as a block rather than per-string: nothing on either surface marks a food off-diet or warns (R1/D2), renders coverage/adherence/a score/a streak (§6.9), says anything about the owner, or carries an exclamation mark.

## Verification

`tsc --noEmit` clean; **3694 jest across 164 suites** green (28 new, in 2 new suites). Deno was not runnable in this container (not installed) — the only change under the Edge Functions' import graph is one added `export` keyword in `lib/dietTrial.ts`, which cannot change behaviour; CI's `deno test` job covers it.

Acceptance criteria (spec §6, PR 2):

1. sheet shows exactly the three FR-11 facts and two actions, no role question, no wisdom-check — **pass** (asserted at the model AND in the rendered tree; the model test also asserts exactly one question mark in the whole sheet);
2. an add renders with `Added {date}, day N`, and N equals the card's counter — **pass** (asserted against `getDietTrialProgress` itself over four dates, not against a literal);
3. a pre-add feeding keeps its off-diet classification — **pass** (`classifyFeeding` on the jerky before its `allowed_from` is `off_diet_unrecognised`, after it is `permitted`);
4. empty extras group renders the §4 empty state — **pass**;
5. C6 line renders verbatim, this screen only — **pass**.

**DoD gaps, stated rather than papered over.** The `code-reviewer` and `pm-feature-review` gates did **not** run — this environment instructs against dispatching subagents unprompted, which conflicts with CLAUDE.md's DoD. Both are unchecked boxes; `pm-feature-review` (as Jordan) is the one that would earn its keep here, since this is the track's first owner-facing surface. `nyx-voice` **did** run (it is a skill, not a subagent) and changed the no-trial copy. No `adversarial-reviewer` line, per §6 — this PR renders the shipped predicate's answers and computes no membership of its own; the one thing that could have voided that exemption, the B-624 dedupe, was fixed by asking `allowedMembershipOn` rather than by growing a second rule.

`app/trial-foods.tsx` itself has no test file, in line with the repo's existing state (there are none under `app/`). The exemption is narrow rather than blanket: every judgement the screen makes is in a tested module — the copy and layout in `lib/trialFoodsScreen.ts`, the already-on-list guard in `isOnTrialList`, the sheet in its own component test. What is genuinely uncovered is the wiring between them.

## Falsification attempts (the DoD's adversarial line)

1. **Can the screen and the classifier disagree about a date?** Every rendered row is resolved through `allowedMembershipOn`, and the test asserts it in the general form. **Held** — except for the narrowed B-624 case above, which is stated rather than claimed fixed.
2. **Can a food fall off the list silently?** It could, before this PR: two blank-named rows collapsed. Now they do not. **Fixed, and tested.**
3. **Can the add read as an amnesty?** The "Earlier feedings" row is unconditional — asserted on day 1, day 12 and day 51 — and the pre-add classification test proves the sentence is true rather than merely printed. **Held.**
4. **Can a double-tap on a slow write put two rows in the set a vet is shown?** `addTrialFood` deliberately does not de-duplicate (the caller filters), so this was the live path. Both sheet actions block while saving; asserted. **Held.**
5. **Can an owner leave believing a food was added when it was not?** Only if the sheet closed on failure. It does not, and it says why. **Held.**
6. **Can the picker's add flow write a duplicate?** The guard uses the full identity (`isOnTrialList`, which includes the key arm), so a re-photographed bag of an already-listed food is caught even though the picker's own selected-state marking is id-only. **Held** — and the id-only marking is the reason the guard is not the same check as the marking.
7. **Does trial chrome leak across pets?** The hook is scoped to the active pet; the screen holds no pet id of its own. **Held by construction** (D7).

**Residual → B-625.** `food-capture` ends in `router.dismissAll()`, which unwinds this screen too: the owner who taps "Add new" mid-flow lands back on the tab with the food captured but not on the list. A papercut, not B-535's class — nothing was promised and no half-written state is lost, because the confirm sheet has not opened yet. Filed rather than smuggled in: a return-aware exit touches a shared route.
