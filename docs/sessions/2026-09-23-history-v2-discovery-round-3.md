# History v2 — discovery round 3: the proposal, clean, for a design critique

**Date:** 2026-09-23 · **Issue:** CUL-1076 (project *Design v2 — the whole day*) · **Mode:** DISCOVERY · **Shipped via #885** (the same draft PR as rounds 1 and 2; `claude/design-v2-history-tab-ikxfm4`) · **Artifact:** the round-1 URL, republished (https://claude.ai/artifact/RNvdtUG6FX5utWmzGqBNa6, version 3)

**PM prompt:** a reaction to round 2, then "produce a third iteration artifact. Make it clean, in that it only shows the v3 proposal. Commit that design and then kick off a design critique in a new session."

## What the round-2 reactions ruled

- The standing sentence about reads ("a photo's read can raise a flag, never clear one"): **punted**. The Data Scientist and Dr. Chen's condition on the rose only (the contrast hazard beside a rose row) is recorded as overruled.
- The standing facts line ("Selected Protein PR · trial day 58 of 84 · Prednisone since Sep 21"): **gone**; the strip stands at the top instead, under the count line. Consequence stated on the page: the line was what anchored rule A (a meal of the diet in force unnamed on its row), so rule A retires and every meal names its food again, once per run ("5 meals · Selected Protein PR · 1 wet · 4 dry"). This also settles Home's consistency question (Home names every meal today).
- The count line ("All time · 1,091 logged since May 14"): **kept**, first under the pills, following the lens.
- The week strip: **liked**, and given a **horizontal scroll**: a paged scroller that snaps to the week, one week per swipe, bounded by the date lens, the arrows kept. The Motion check's round-2 refusal of swipe paging is overruled by the PM's ask; its conditions are kept (paged and snapping, never a rolling seven, the long jump in the date sheet).
- The count in the cell corner: **gone** ("clutter without much information"). A cell is the day number and a mark (hollow · plain · a rose dot); the count lives in the day header the tap lands on and in the cell's spoken label.
- The noise cut: **loved**, kept in full except rule A.
- The stub under a compact row: **gone** at rest ("looks abandoned; nothing says it expands"). The compact row ends in a down chevron that turns when open; the rail appears only with the open box.
- The month grid: **retired**. No one on the team made the case; the Data Visualization lens noted the month lives on Patterns with a door into History (CUL-1073).

## What shipped

`docs/culprit-history-v2-mockups.html`, round 3, republished over the same URL: a ten-row ledger mapping each round-2 reaction to what moved; §01 the screen (the count line, the strip, the days; demos: the first paint, a calm read resolving, open in place with the rail appearing and the chevron turning, the route, a removal folding a row out, the landed day by the arrow); §02 the strip under a window (a paged scroller, the arrows disabling at the window's edge with the reason, Last 7 / Last 30 / All time); §03 the row vocabulary; §04 the motion inventory (eight gestures, the refused list); §05 the nineteen rules a spec would carry (rule A retired, rule K added: every meal names its food); §06 the filters and the doorway contract, folded; §07 a hand-off for the critique (settled · overruled dissents · open items · where the deliberation lives). Round 1 stays at `99da7c0`, round 2 at `06be7bd`.

## What the harness caught

The paged scroller drifted to a random week during a beyond-viewport screenshot: Chromium re-snaps a paged scroller when the viewport resizes, and the strip's scroll listener adopted the drift as if the owner had swiped. Two fixes: a page changes only on a gesture (pointer, touch, wheel) or an arrow, and any other scroll is put back on its page; a `ResizeObserver` re-syncs after a resize. This is the same event a window resize or a split view causes, so it is a page fix, not a harness one. The harness then takes its shots inside a viewport already tall enough. 71 probes, every demo pressed twice, reduced motion, both widths, zero page errors.

## Persona sign-off

Designer ✓ (one proposal, no options, per the PM's ask; the ledger per the 09-09 directive; the chevron as the one opens-here affordance) — Motion Designer ✓ (the paged scroller keeps the round-2 conditions; the drift fix) — Data Scientist · Dr. Chen ✓ (the sentence's removal recorded as an overruled condition; every meal named answers "of what?"; the count in the spoken label) — Trust & Safety ✓ (unchanged: note text never read; CUL-848's cue ahead of the snippet) — Engineer ✓ (71/71, zero errors) — QA ✓ (every demo twice; a put-back probe for the drift).

## PM actions

CUL-1076 (`Waiting on PM`): open the critique session with the kickoff prompt in the wrap-up. Nothing filed; nothing built.
