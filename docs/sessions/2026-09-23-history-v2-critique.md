# History v2: the design critique of the round-3 proposal

**Date:** 2026-09-23 (ran into 2026-09-24 UTC) · **Issue:** CUL-1108 (project *Design v2, the whole day*) · **Mode:** DISCOVERY · **Shipped via #898** (`claude/cool-brahmagupta-qs96p3`)

**PM prompt:** claim CUL-1108 and run the design critique of the History v2 round-3 proposal: read the artifact and `docs/culprit-history-v2-mockups.html` (merged in #885), take §07 for what is settled, overruled and open; convene the lenses in isolation (Designer, Motion, Mobile IA, Data, Dr. Chen, Jordan and Sam, Trust and Safety, Engineering) against the seven principles and the Design v2 language; report in the QA-note taxonomy; end with the changes that gate the requirements, as decision briefs where the PM rules. Do not redraw and do not build.

## What shipped

`docs/history-v2-round3-critique-2026-09.md` (🧊 dated review): the verdict by lens, eleven decision briefs (H-1 to H-11, the first five change frames), six team defaults the PM can veto, four rules the requirements carry without a ruling (R-1 to R-4), the sequencing, the five carried items, and the 88-item critique in the taxonomy (19 broken, 3 works but confusing, 30 design gaps, 10 missing follow-up, 19 PM decisions, 7 backlog), with what held, what was refuted, and the method. The critique and the briefs are also posted on CUL-1108.

## The verdict

Ready with conditions, from every lens. The shape holds (days as cards, one door per row, every meal named, the rose only, the note on the row, the strip on top). What fails is the page's claim that it reuses what ships: the row, the meal runs, the timing line, the read, the coverage line and the strip's marks each differ from Home or the month, and several counts go wrong under a filter, a search, a pet switch, a new pet, or a day with nothing logged. The page's own "5 meals" opens to four (the mock caps the box at 160px), which is how the open-in-place rule got caught.

## How it ran

Nine isolated lens reads (Designer; Motion; Mobile IA; Data Scientist with the Data Visualization Designer; Dr. Chen; Jordan; Sam; Trust and Safety; Dir. of Engineering with QA), each told to carry §07 rather than re-argue it and to challenge a settled ruling only with new evidence, as a better-than-the-rule brief. One adversarial verifier per lens (118 confirmed, 12 plausible, 13 mock artifacts, 2 refuted), a synthesis, a completeness critic (six gaps), six follow-up reads (60 more findings), a final synthesis: 27 agents, one workflow. The page was rendered in headless Chromium first (both phones at the fold, the whole list a viewport at a time, every demo pressed, the sheets, with and without Reduce Motion; zero page errors) so every lens critiqued the same pixels. Audit after the run: the agents only read Linear and wrote only to the scratchpad.

## What the session lead added

- Spot-checked every claim that became an issue, and the load-bearing shipped-code claims, in the code. All held.
- Cross-checked against issues other sessions filed the same night, which the lenses could not see: **CUL-1118** (meal rating may become exception-only) sequences H-2's intake mark; **CUL-1107 / CUL-1111** (the flag review's "No"; hide hides words only) turn H-4a from a Data vs Dr. Chen conflict into a recommendation both positions accept, stated with the original conflict beside it; **CUL-552**'s acceptance rule ("analysis off" never reads as "no flags found") is set beside H-4b's conflict as a fact, not a tiebreak; **CUL-1078** is absorbed by day pages.
- Curated the synthesis's ten rulings into eleven briefs ordered by what changes frames, and moved five small calls to team defaults the PM can veto.

## Filed

CUL-1119 (widget pet link re-selects after a later switch, High), CUL-1120 (History load race across a pet switch), CUL-1121 (Home's spine folds a refused meal, High, blocks CUL-1071), CUL-1122 (timing lane counts a refused bowl as eating, High, adversarial review mandatory), CUL-1123 (Reduce Motion first render; unconditional animated scrolls), CUL-1124 (dose row chip and regimen naming), CUL-1125 (Remove confirm ignores an event note), CUL-1126 (year-less dates on four surfaces), CUL-1127 (four small defects), CUL-1128 (app switcher privacy cover), CUL-1129 (hairball as Other). Comments on CUL-1073 (`?date=` by sender) and CUL-1071 (two Tier-2 edits for Principles v2.0).

## Persona sign-off

Designer ✓ (principles 1, 3, 5, 8 on every frame; voice on the quiet states and the noun table) · Motion Designer ✓ (the eight gestures mapped to the six; Reduce Motion beyond content) · Mobile IA ✓ (fold measured at 44pt rows; FAB inset; pet-switch scope) · Data Scientist ✓ (every number given a population and a counterexample; C-3, C-19, C-42) · Dr. Chen ✓ (exam-room questions walked; rule 7's wording would have silenced CUL-812's escalation) · Jordan, Sam ✓ (owner tasks; a refusing, grazing cat reads as routine one level above the rows) · Trust and Safety ✓ (no widened access; note fields and search scope specified; CUL-848 gates the note line) · Engineering, QA ✓ (buildable on managed Expo, no new dependency; day pages, fixtures, guards) · adversarial review: every clinical and count finding carries the counterexample it was tested with, and a verifier tried to refute each.

## Round 4, the critique drawn (2026-09-24, same session)

The PM asked for a new mockup from the critique. `docs/culprit-history-v2-mockups.html` is now round 4, republished over the same artifact URL: every team recommendation is a current frame (H-1 a, H-2 a, H-3 b, H-4a, H-5 a, H-6 a, H-7 a, H-8 a, H-10 a), every open alternative sits beside its frame in a gold option box, the three genuine conflicts (H-4b, H-9, H-11) are drawn both or all ways with no current frame, and a ledger at the top maps each brief to what moved. R-1 to R-4 and the team defaults are drawn throughout; §08 draws the quiet states round 3 never did (new account, 7:05 AM, loading, failed read, search miss, the record's first day).

- **New proposals on the page, for the PM to see:** the "left some" mark is a broken line rather than the month's paler one (1.2:1 on white fails the critique's 3:1 rule, so the month changes too); a vet visit is a small square and a course start a short bar, never the hollow bead Home uses for a look; under a medication filter the broken line marks a dose not given in full; All types marks vomit days in the strip, as the month does.
- **Data refresh.** Rows for May 14 – 15, Jun 7 – 21 and Sep 4 – 21 plus per-day and per-course counts, read with the same owner-scoped query shape. It found the round-3 fixture wrong on doses (every dose is named), photos (40 read, 4 not) and Sep 21 (eight rows); corrected additively in the critique's §V with inline pointers, and noted on CUL-1124.
- **Checked before publishing:** every demo pressed twice with and without Reduce Motion (zero page errors; one real bug found and fixed, "Tap History again" threw before it re-rendered the strip), every strip's visible week checked against its label, both widths (1280 and 390, no horizontal scroll), dark-mode chrome.

## PM actions

On CUL-1108 (`Waiting on PM`): rule H-1 to H-11 (H-1 to H-5 first), or accept the team defaults as listed. Then the next session runs a short mock pass on the frames the rulings move, and the requirements are written.
