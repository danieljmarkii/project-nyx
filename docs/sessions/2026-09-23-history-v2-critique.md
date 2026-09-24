# History v2: the design critique of the round-3 proposal

**Date:** 2026-09-23 (ran into 2026-09-24 UTC) · **Issue:** CUL-1108 (filed under *Design v2, the whole day*; now in *History v2 · the record you can read*) · **Mode:** DISCOVERY · **Shipped via #898** (`claude/cool-brahmagupta-qs96p3`)

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

## Round 5, the requirements and the project (2026-09-24, same session)

The PM reacted to round 4 ("I LOVE LOVE LOVE where we landed"): ruled H-1 (a), H-2 (a) with the header's word in neutral grey, H-6 (a), H-8 (a) and H-9 (no count; a small link to Patterns), loved H-3 and the quiet states, and handed H-3's variant, H-4b, H-7, H-10 and H-11 to the team. Then: finalize the requirements, put them in a Linear project, and plan the build one session per issue, saying what can share a session and what can run in parallel.

- **Round 5** (`docs/culprit-history-v2-mockups.html`, same URL): one ruled proposal with a ledger of every reaction. The team's calls, with dissents recorded: H-3 (b); H-4b the grey *Photo not read* only where a read was expected and never landed, nothing when the owner turned reading off (Trust and Safety would rather the list add nothing); H-7 (a); H-10 (a); H-11 the latest visit strictly before today, the report's bound (the Data Scientist and the Designer dissent).
- **The spec:** `docs/nyx-history-v2-requirements.md` v1.0, BUILD-READY. An Explore pass mapped the code first and changed the plan twice: the timing lane cannot say which meal it measured from and `generate-signal` imports it, so CUL-1122's fix and the meal id land in one session (HV-2); and no local copy of the read's verdict exists (offline, Home's spine shows no verdict and the month draws every photographed day as seen), so HV-5 builds one. It also found the vet report's scope line without a year is the app's report screen, not the server.
- **The project:** *History v2 · the record you can read* (P-CUL-18): HV-1 → HV-15 (CUL-1158 → CUL-1171, CUL-1175) over six steps, five sessions at once in step 1 and four in step 2, plus three gated follow-ups (CUL-1172 → CUL-1174). CUL-1073, CUL-1119, CUL-1120, CUL-1122, CUL-1124, CUL-1125, CUL-1126, CUL-1127 moved in as step 0 bundles or built-in scope; CUL-1123 stays in Design v2 and now blocks HV-10. Every issue carries its kickoff prompt; the bundle prompts are in the project description. CUL-1108 moved into the project, off `Waiting on PM`.
- **CLAUDE.md:** a Read-These row for the spec, paid for by compacting C-36's mechanics (verbatim in the lessons file) and repointing C-36 and C-41 from the deleted `vetVisitsFlagOff` guard to the live `designV2FlagOff` one: 136,575 B → 136,490 B.

## PM actions

1. Merge #898 (it carries the spec, round 5 and the critique); the build sessions read the spec from `main`.
2. Start step 1 and step 0 together: CUL-1158, CUL-1159, CUL-1160, CUL-1161, CUL-1162, and Bundles A (CUL-1073 + CUL-1119) and B (CUL-1123 + CUL-1125) from the project description.
3. Later, on the issues that ask: the allowlist "go" and the device pass (CUL-1171), the GA "go" (CUL-1175).
