# Vet report v2: the team reviews round 4, the PM rules the rest, the requirements and the run order (CUL-2275)

**Date:** 2026-10-31
**One thing:** A safeguard that can never fire: round 4's "worsening always leads" read well and protected nothing, because the engine folds a worsening into chronicity before the report sees it; a mutation test is how you find that out before a patient does · check: pending

DISCOVERY session on [CUL-2275](https://linear.app/projectnyx/issue/CUL-2275), stacked on danieljmarkii/project-nyx#1361 (the round 4 mock and working papers, still a draft). No app or Edge Function code. Shipped via the session's draft PR, which names only CUL-2275.

## The ask

Convene the product team to review the round 4 mock and its rulings before implementation; run `/design-critique` at full depth, with motion and design delight as lenses; get the PM to rule R-5b, R-8, R-12 and the persona conflicts R-9 to R-11; draft `docs/nyx-vet-report-v2-requirements.md` with the edits to spec §5 and Principle 6; and write the Vet report v2 project's run order.

## How it ran

1. **Render.** `scripts/design-critique/render.mjs` over the mock: the page at 390 and 1280, 26 sheet frames, and a second pass for the 35 flow frames (`--frames .fx-fr`), which the default selector missed.
2. **The critique, full depth.** Nine isolated lenses: Designer; Design Craft and Delight (custom, for the PM's delight ask); Motion; Mobile IA; Data Scientist (as `adversarial-reviewer`); Dr. Chen (as `vet-report-cold-read`, renders only); Jordan and Sam (custom); Trust & Safety (as `rls-privacy-reviewer`); Engineering and QA. A verifier per lens, a synthesis, a completeness critic, six follow-ups, a final synthesis. 26 agents, 150 findings, 128 confirmed, 0 refuted, 104 minutes.
3. **The lead's pass.** Four shipped defects reproduced in code (the `vet_reports` policy, delete-account's tolerated read and unscoped purge, silence measured to the window end, weights at 1 dp). Deduped against Linear (CUL-283, CUL-2125, CUL-90).
4. **Rulings** in two rounds of questions (below), recorded on CUL-2275.
5. **Write-down.** The frozen critique, the v2 spec, the Tier-2 edits, the project with 26 row issues, blocking relations and the run-order page.

## What the critique found (the headline)

- **The flow previews the retired round-3 sheet**, not the Front Page that is sent; the 390pt chart is the print chart shrunk to 5 to 7pt, out of reach of any text setting.
- **Two safety rules could not work as written:** R-11's "worsening always leads" can never fire on the shipped engine; the AI lead R-3 ruled (trimmed after checking) is not the configuration the bake-off tested.
- **v2 never said where v1's back pages go**, so the present-only rule, labelled AI reads and "no flag is not an all-clear" had nowhere to print.
- **Mark grammar:** hatch carried two meanings; refusal drawn as counts made Mira's worst week read as easing.
- **Pets > $ was unwritten** for the new surfaces, and B-265's "first vet report shared" paywall moment landed on the send confirmation.
- **No motion was drawn**; every motion/Reduce Motion pair was byte-identical.
- What held: the arithmetic, absence never drawn as wellness, intake never as preference, no upsell anywhere, and v2 can branch over one pure snapshot.

## Rulings (PM, 2026-10-31)

R-11 exempt (Dr. Chen) under five conditions · R-9 no deletion disclosure ("why clutter a report w deletions") · R-10 excludable, disclosed (T&S) · R-5b print up to 3 gap lines · R-8 no per-send choice, short id only on paper · R-12 code template, quote-only, no owner words to a model · R-3 re-specified with a smoke bake-off · weight in three classes (answers W3 on [CUL-1390](https://linear.app/projectnyx/issue/CUL-1390)) · a thin-record scope line · B-265's report trigger retired ([CUL-90](https://linear.app/projectnyx/issue/CUL-90)) · forecast of 26 rows accepted · Tier-2 edits applied in this PR.

## What shipped (this PR)

- `docs/vet-report-v2-round4-critique-2026-10.md` (🧊 frozen).
- `docs/nyx-vet-report-v2-requirements.md` v1.0: rulings, architecture, sheet 1 rules, the back-sheet must-carry table, Dynamic Type, the AI lead contract, the flow, saved reports, Pets > $, a motion table, residuals, run order, 15 acceptance criteria.
- **Tier-2, on the PM's word:** design principles v2.3 (Principle 6 rewritten); the vet report spec's v3.0 amendments (§5 AI lead exception, rule 3 thin record, rule 9 no mark for an absent sign, §7.1 skin-trial exemption). CLAUDE.md's and `docs/personas.md`'s one-line Principle 6 summaries follow (the budget guard passes).

## Linear

- Project **Vet report v2** (P-CUL-34), 26 rows: [CUL-2282](https://linear.app/projectnyx/issue/CUL-2282) to [CUL-2306](https://linear.app/projectnyx/issue/CUL-2306) plus [CUL-283](https://linear.app/projectnyx/issue/CUL-283) (widened and moved in), blocking relations set, a *Found along the way* milestone.
- Three standalone safety fixes lead: [CUL-2282](https://linear.app/projectnyx/issue/CUL-2282) (delete account), [CUL-2283](https://linear.app/projectnyx/issue/CUL-2283) (silence to the report date), [CUL-2284](https://linear.app/projectnyx/issue/CUL-2284) (weights at 2 dp).
- Comments: rulings on CUL-2275; W3 on CUL-1390; the retired trigger on CUL-90; the wider tail on CUL-2125.

## Residuals stated

- R-9: a deletion that would have fired a flag leaves no trace on the report (ruled; recorded in the spec §15).
- The build-ready mock (row 04) gates every render and flow row; the round 4 frames are not build-ready.
- The pre-GA AI bake-off on real records remains a GA gate.
