# Mixed meals and food transitions: requirements convening

**Date:** 2026-10-19
**Type:** Discovery (PM-requested), [CUL-2039](https://linear.app/projectnyx/issue/CUL-2039). No app code changed. Produced `docs/nyx-mixed-meals-requirements.md` v0.1.

## The PM's report

The PM's cat is coming off a diet trial and being introduced to a new food. This morning's bowl was about ¼ can of chicken mixed into ½ can of rabbit. The record cannot say that: a meal holds exactly one food (`meals.event_id` UNIQUE, one `food_item_id`), so a mixed bowl is two meals, the trial counts it twice, and the ratio exists nowhere. The PM asked for a feature that lets the record show a feeding was a mixture, suggested modelling it on the add-medicine pattern, and asked for competitive research.

## Grounding

- A code map of the meal model, the log surfaces, the medication pattern (`paired_event_id`, migration 023, is the only existing "two things in one feeding" link), the diet trial (`transition_started_at` exists but is never written) and the ~15 readers that assume one food per meal (`first(r.meals)`).
- A competitive sweep: no pet app found logs one meal as a ratio of two foods. Ollie and The Farmer's Dog publish 25/50/75/100 transitions; Cronometer models a recipe as ingredients with amounts; the Tufts vet worksheet and the Zoetis owner brochure both date the trial from after the transition.
- Linear: CUL-229 (protein dose invisible) and CUL-1997 (report cannot show the trial food was fed before Day 1).

## PM rulings, in session

1. Transitions first; toppers stay two logs for now.
2. Common ratios easy, custom ratios possible, design for the common case.
3. Schema 2+, UI 2.
4. Do not prescribe a transition; allow it and record it.
5. Requirements this round, mocks next.
6. Carry two directions to the team: one event with component rows, and a "Mixed with…" path modelled on pairing a med with a meal.

## The convening

Three isolated lens groups, each handed the same brief: owner UX (Designer, Motion & IA, Jordan, Sam), data and engineering (Dir. of Engineering, Data Scientist), clinical (Dr. Chen, QA). Then an isolated adversarial pass over the clinical sections.

Where they converged is spec §0.3 (T1–T9). The notable calls:

- **25/50/75 cannot record the PM's own bowl.** ¼ can + ½ can is 1:2; the Designer's five fraction stops (¾·¼ through ¼·¾) can. Became P-2.
- **A ratio does not unblock CUL-229.** The initial proposal said it would; the Data Scientist and Dr. Chen both broke that: share is a proportion of a bowl of unknown size, not a dose. The spec says so in §5.3, and CUL-229 stays blocked on portion capture.
- **The dominant-food back-compat column is for display only.** The Engineer's own counterexample (a 50/50 rabbit + chicken bowl on a rabbit trial reads permitted through the dominant food) held only once every clinical reader became mix-aware first. Hence readers before the writer (T9).
- **The transition is derived, never stored or steered.** First fed, and the first day of an unbroken run of trial-only logged days, computed at read. This closes CUL-1997 without the app moving anyone's Day 1.
- **The adversarial pass broke 10 things**, all in the clinical readers, all folded into the spec and marked "pass 1". The two that changed the shape: a cat refusing every mixed trial bowl fell out of the trial refusal lane, and a cached dominant food let an older build on a second household phone say "all matched" over a bowl with chicken in it. The fix for the second: a mix stores `food_item_id = NULL`, so old builds disclose it as unclassifiable. A second pass has not run; the build's reader PR carries the mandatory one.
- **The persona conflict (P-4):** Dr. Chen wants a one-time heads-up when the old food appears in days 1–14 ("If the switch is still under way, you can move Day 1"). The Designer and Jordan read that as the app steering the transition (ruling 4) and note it needs a schema column. Escalated with no recommendation.

## Outcome

Spec v0.1 with six PM decisions (P-1 to P-6), a 5-row build forecast, the migration 103 sketch with its pre-flight, the consumer table, acceptance criteria, and the 15 frames the mock round must draw.

**Not done this session:** the PR. The session had read access to `project-nyx` only; the doc and this record are committed on a local branch `claude/mixed-meal-transitions` and need a session with push access to open the PR.

**Proposed Tier 1 edit, awaiting PM:** add a Read-These row to `CLAUDE.md`: "`docs/nyx-mixed-meals-requirements.md` 🌱 | Any meal with more than one food, `meal_components`, the ratio, a transition read". The CLAUDE.md budget guard means the row is paid for by a deletion; not written here.

## Later in the session: rulings and mock round 1

The PM ruled **P-2** (five fraction stops) and **P-3** (punt "Not sure" from v1: "what the heck does that even mean"). The custom path now takes one unit for both foods, so every v1 mix has a share. For P-1, P-5 and P-6 the PM asked to see it before ruling, and P-4 needed a plain-words restatement; spec v0.2 records both rulings and points the rest at the mock.

Mock round 1 is `docs/culprit-mixed-meals-mockups.html`, published at https://claude.ai/artifact/JsaLnSwdqeuyQZAXqgEWFY. One story throughout (Pixel, chicken to rabbit, ¼ can + ½ can on day one). Sections: the first mix (P-1, with the picker-switch option beside it), the days after (FAB pill, stepper, History runs, editing), a mix during a trial at the card's worst-case density, P-4 side by side with a plain-words box, P-5 side by side, and the vet report page 1 plus appendix rows (P-6, with the setup-suggestion option). Reaction prompts R-1 to R-5 close the page.

