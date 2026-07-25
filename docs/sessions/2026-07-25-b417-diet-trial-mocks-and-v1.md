# B-417 diet trial — four mock rounds, and the spec to v1.0

**Date:** 2026-07-25

Design session. Built `docs/nyx-diet-trial-mockups.html` (also published as an artifact), ran it through four PM rounds and a `pm-feature-review` pass as Jordan, then codified every ruling into `docs/nyx-diet-trial-requirements.md` **v0.97 → v1.0 (BUILD-READY)**.

## What the rounds produced

**Round 1** drew the three surfaces the spec had only sketched — the start-a-trial modal, the trial card in every state, the completion milestone — plus §7's trial block in the two variants **C4** was deliberately deferred to. Two states had never been drawn anywhere: *below the coverage floor* and *the day after a slip*, which between them decide whether an owner finishes six weeks.

**Round 1b — `pm-feature-review` as Jordan, and it earned the round three times over:**

- **§7 rendered "168 permitted feedings" inside a total of 84 logged feedings** — in *both* C4 variants, i.e. in the artifact the PM was being asked to rule on, on the one surface whose whole job is credibility.
- **State 7b rendered the clean-trial statement over a pet that refused the diet.** A breach of PR 5's AC that a refused trial renders no clean-trial statement *anywhere*, and the fix was a **rule change, not a copy change**: §5.2's composition rule had been written as a *live-flag* replacement only, so it never reached the terminal states.
- Two end dates for one trial in the start flow — the strings PR 3's fixtures get lifted from.

It also found three surfaces missing entirely: the **allowed-set read-back** (D3 was ratified partly on the set being *"a re-readable rule list"* and nothing rendered it — worse, the only way to add a permitted food was to feed it and get flagged first), the **off-diet list**, and **§5.6's multi-pet caveat**.

**Round 2** answered the PM's two structural notes. *"Where would I access this from?"* and *"where does this card actually live?"* — round 1 had drawn the card without ever drawing the screen it sits on. And *"slightly concerned it's VERY complex"*, which the deck had oversold by drawing every data case as its own picture: the honest count is **six screens**, the eleven states are one card with one line that changes, and the real complexity is the invisible shared predicate no UI change can reduce.

**Round 3** put a running trial on **Home** (a compact strip below Signal, above Today — safety still leads), made the symptom chart **additive rather than replaced**, and rebuilt the completion sheet to **lead with the symptom counts** before asking the owner's read. Cut A-3, removed the card's redundant "Log a meal" (logging is the FAB), and narrowed the multi-pet caveat to household pet count after finding `feeding_arrangements.is_shared` ships **INERT** — so a shared bowl was never knowable and the copy had implied it was.

**Round 4** answered *"do the trial calcs use secondary proteins?"* against the code rather than the spec. `food_items.proteins` ships and the extraction path writes it, but **nothing computes with it** — `detection.ts` still keys on the singular `m.protein` and `lib/dietTrial.ts` does not exist yet.

## The finding worth carrying

The PM's worry was a FAB-logged unsanctioned rabbit food with hidden chicken flying under the radar. Traced end to end, **it doesn't**: the chain is closed-world, so it fails rung 1 and is recorded whatever its protein data says. What the protein arm supplies is the **antigen**, not the catch — and on a novel-protein trial *"4 poultry exposures"* is the finding a dermatologist reads, where *"4 off-diet feedings"* isn't. A dark rung 2 costs **attribution, not detection**, which is also why sequencing it after PRs 1–4 was safe.

Tracing it surfaced a real hole one step over. §5.3 rung 1 returns `permitted` and **stops**, and §5.5 computed the contamination standing fact from `role='primary_diet'` rows **only** — so **a vet-approved treat with a hidden protein was permitted, counted, and never protein-checked**. The same failure the PM described, displaced onto the sanctioned food, where it is likelier to persist because nobody is looking. Ruled as **D-A** (the standing fact extends to permitted extras) and **D-B** (a permitted feeding keeps its verdict *and* records its antigen — compliance stays about the owner, antigen exposure stays about the animal).

## Decisions ruled this session

Rebrand to **Culprit** on every string · entry point is the **Pet tab**, with a **Home strip** while a trial runs · Home's symptom chart is **additive** · the trial diet takes **multiple `primary_diet` foods** · §7 is **two-element** (C4), so **`diet_class` stays out of migration 040 and PR 1 ships as specified** · **A-3 cut** · **no `paused` state** (A-2) · the completion sheet **leads with the data** · **D-A** and **D-B** · the sanctioned protein set is the **union of every protein of every trial food**, with rung 2 flagging any unsanctioned member of the fed food's array · `diet_trials.food_item_id` is **display-only legacy** · both **LOCKED** strings were wrong and are rewritten.

## Provisional, pending Dr. Chen

Per the PM's instruction to roll remaining decisions into the PRs rather than hold the spec: **P-1** the four-cell duration table (only cat·gut 42d is a new number) consumed at PR 3, and **P-2** the no-paused ruling, consumed at PR 1 by omission. Neither blocks a build; both are flagged at their PR.

## Residuals

The **coverage floor still has no number** — three defensible definitions read 100% / 84% / 19% over the same live 70 days, so PR 5 pins the metric and then sets the floor. It gates only §7.2's interpretability sentence. And **an undeclared protein can never be in the array** (33–83% mislabeling in exactly these products), which is what §5.5's standing fact discloses rather than detects. The **vet report reorder** on the Pet tab is filed separately rather than bundled into a diet-trial PR.

Docs only — no app code, no schema, no deploy. Shipped via #443.
