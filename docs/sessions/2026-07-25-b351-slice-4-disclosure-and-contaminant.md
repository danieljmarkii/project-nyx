# B-351 Phase A slice 4 — Tier-1 protein disclosure + the Tier-2 trial-contaminant flag

**Date:** 2026-07-25

The deterministic wedge win ships. Spec §3 called this "the highest-value slice… deterministic, not statistical": for a pet on a declared diet trial, a food whose captured protein set contains a protein the trial diet does not is a contaminant, and the answer is a set difference the moment the data exists. No correlation to accumulate, no attribution ambiguity, no Bonferroni.

Shipped via #NNN.

---

## What was built

**Tier 1 — disclosure, for every owner, always (D7 / §8.5).** Two shapes over one gate:

- a **compact summary line** on the Foods-tab library row and the capture-confirm step — `Duck · also contains chicken` / `Duck · nothing else on the label` / `Duck · ingredient list not read`;
- a **provenance line** under the D8 picker on the two edit surfaces. The chips already show the set there, so the only thing left to disclose is whether it is the *whole* set — which is precisely what D10 forbids leaving implied.

Both are informational and never nudge (Principle 4). Neither renders on the quick-log picker grid: that is the moment of event, and a protein line on every tile buys education at the cost of the 10-second test (recorded as **B-439** so it reads as a decision, not an omission).

**Tier 2 — the trial-contaminant flag (D2 / §8), in three registers.** `lib/trialContaminant.ts` owns the predicate; the surfaces differ because D2 ruled that they must:

| Surface | Register | Why |
|---|---|---|
| Add to library | **Soft confirm** — `TrialContaminantSheet`, "Not now / Add anyway" | Not the moment of event; the owner is deciding what to feed, so a choice costs them nothing |
| Log a meal | **Passive line on the completion card** — no tap, no gate | Principle 1. The meal is already saved; the copy reports rather than asks |
| Food detail + diet-trial card | **Standing note** — `TrialContaminantNote` | A property of a thing, not a report of an event |

**The D10 completeness gate** landed in `lib/protein.ts` (`proteinSetCompleteness`), not in a component — because slice 5's `generate-report` must answer the same question identically, and two implementations would let the app and the vet report disagree about which foods are trustworthy. `food_items_cache` gained the two arms it needs (`ingredients_notes`, `ai_extraction_confidence`) via the existing ALTER-upgrade pattern, mirrored by `refreshFoodCache` and selected by `LIBRARY_FOODS_QUERY`.

No migration. No Edge Function change.

---

## The four rules that keep it honest

Three of these are rulings rather than taste, and two of them changed the design materially.

**1. Presence-only — never an all-clear.** An empty or unread protein set yields silence. There is no negative form of any string in the module; a "no conflicts found" state does not exist to be rendered, because the commonest reason a set looks clean is that nobody read the label. A test asserts that no `trialDietNote` state emits a reassuring phrase in any input.

**2. The trial diet's own contamination is a trial-level standing fact, never a per-feeding verdict.** B-417's C2, PM-ratified the same day. A per-feeding flag on the *prescribed* food fires 100+ times across a 56-day trial — alarm fatigue inverted onto the one food the owner cannot stop feeding, which trains them to ignore the flag that matters on day 22. `foodContaminantFlag` excludes the trial food by construction; the fact still surfaces on the diet-trial card and the food's own detail screen.

**3. One heads-up per food per trial.** C2's reasoning generalizes: a chicken treat fed daily during a duck trial is not new information on day two. A non-trial food flags the first time it is fed inside the trial window (`isFirstMealOfFoodInTrial` — a local count, no new state) and stays quiet after. The standing note on the food's detail screen is what makes that affordable rather than a silent drop.

**4. The trial target comes from the trial food's owner-designated `primary_protein`, never `proteins[0]`.** This is the slice-3 hazard STATUS.md flagged for slices 4/5, and it is not cosmetic. Slice 3 writes a NULL primary when the owner *clears* the main protein and demotes it into the tail — so `proteins[0]` is then a protein the owner explicitly un-designated. Reading the target from it would resurrect the cleared designation and **invert the whole check**: every other protein, including the real trial protein, would be reported as the contaminant. A null target disables every check in the module.

---

## B-411, read before the predicate was written

As the kickoff instructed. Its two deliberate non-resolutions — `poultry` stays `poultry` (it may be chicken or turkey), `chicken fat` stays its own key (merging it would invent a protein exposure from a near-protein-free ingredient) — turn out **not** to open a hole here, because this check is *"everything but the target"* rather than *"everything on an excluded list"*. An unresolved term is off-trial by default: a `poultry by-product meal` food fed during a **duck** trial does flag. What B-411 costs on this surface is precision in the copy — the owner is told the food lists `poultry`, not that it lists chicken, which is exactly as much as we know.

The gap B-411 names does still stand and slice 4 does not change it: a **chicken**-elimination trial cannot flag a `poultry` food as chicken contamination, because it would have to guess. A regression test now pins both terms as distinct so a future tidy-up of the alias table cannot silently close the gap with a guess.

---

## One deliberate deviation from the PM-reviewed mock

The add-time sheet says **"trial diet"** where the mock said **"elimination trial"**.

`diet_trials` carries no indication column — D6 ratified deferring that schema change, and v1 keys off the trial food's own designated protein. So the app genuinely does not know whether a trial is an elimination trial, a GI trial, or a hydrolysed one. Asserting a trial *type* we were never told is a fabricated clinical detail on copy an owner may repeat to their vet. The rest of the mock's copy is used as written, including the log-time card's `"{Pet}'s duck trial should skip chicken. The meal's saved — just worth knowing, and maybe a note for your vet."` A test pins the absence of the type claim.

**PM call wanted:** ratify the substitution, or add the indication column and say the specific thing.

---

## Design notes worth carrying

**The completion card gained a fourth *block* but not a fourth *affordance*.** That file carries a standing warning — *"Before proposing a FOURTH affordance: stop"* — and it was honoured rather than waived. The heads-up is passive prose: no target, no state, no write, zero added taps on any path including its own. It also extends the card's dwell 5s → 7s when a flag is present, applied in `momentStore.showMeal` rather than at each call site, so a future meal-entry path cannot ship a flagged card that flashes past.

**The evaluation loses the race by default.** It runs *after* the meal is committed (Principle 1 is satisfied by ordering, not by speed), and is capped at 1200ms — warm it is local-only and sub-millisecond, but a cold evaluation makes one Supabase call and a flaky connection can hang `fetch` for many seconds. The completion card is the owner's confirmation that the tap worked; it must never wait on strictly-additive information.

**`diet_trials` has no local mirror.** It is Supabase-only, the same posture as `hooks/useTrend`, the profile card and `lib/widgetSnapshot`. So the trial row is a TTL-cached best-effort read and offline degrades to silence — which is the correct degradation under rule 1, since a missing context can only ever *suppress* a heads-up. The memoized context is wiped on sign-out alongside the App Group container: it is account data living in JS memory, which `clearLocalData` never touches.

**The module is deliberately not named `dietTrial.ts`.** B-417's C1 route has its PR 5 own one shared off-diet predicate there, with B-351's flag as a *consumer*. That module does not exist yet and B-417's own engineering note says slice 4 is not blocked on it — so this ships as the **protein** arm (does this food's set contain a protein the trial diet does not), which is a different question from B-417's **food** arm (is this food on the trial diet at all). Reconciliation is **B-438**; the point is that it must not become a fourth contradictory definition alongside `report.ts:2246`.

---

## Found in test, not in review

`"Ingredients:"` is itself exactly 12 characters — the panel-text length floor — so the bare heading cleared the gate on its own and would have licensed a completeness claim over an empty panel. `hasCapturedPanelText` now strips a leading panel label before measuring. The same shape of finding as B-414: the assertion that caught it was a case nobody would have written into an example list.

---

## Deferred, recorded

- **B-437** — an explicit protein-set provenance column (D10's own named upgrade). The derived predicate under-claims for an owner who types the full panel *and* curates the full set by hand; under-claiming is the safe direction, so this is polish. Do **not** fix by lowering the confidence floor.
- **B-438** — reconcile with B-417 PR 5's `lib/dietTrial.ts`.
- **B-439** — no protein line on the quick-log tile. A Principle-1 call, not an omission.
