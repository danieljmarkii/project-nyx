# History v2 — discovery round 2: the reactions applied, two checks, one proposal

**Date:** 2026-09-23 · **Issue:** CUL-1076 (project *Design v2 — the whole day*) · **Mode:** DISCOVERY · **Shipped via #885** (the same draft PR as round 1; `claude/design-v2-history-tab-ikxfm4`) · **Artifact:** the round-1 URL, republished (https://claude.ai/artifact/RNvdtUG6FX5utWmzGqBNa6, version 2)

**PM prompt:** a reaction to every frame and decision on the round-1 page, then "let's continue to refine before we converge on requirements yet". Two bars named: make History non-boring and informative; make it delightful to use. Nothing to be filed as build issues yet.

## What the reactions ruled

Kept: the day cards, the gap lines, the compaction with its open-in-place, the lens showing more (the count since the trial), the third pill, search. Ruled: rose only (Decision 1, Option B); a snippet of the note on the row (Decision 2, Option B); the order inside a day deferred to the team on consistency (Decision 3); the week strip ruled in with one question, "what happens when I select last 30" (Decision 4). The one negative: "A LOT of data. Visually noisy", with the right-justified, wrapping day header named as an instance. The arrival moment: "LOVE", and the bar for the rest.

## The process

The 2026-09-09 directive applied: **one proposal, republished over the same URL**, with a **ledger at the top** mapping each reaction to what it ruled and what moved; the retired options left the page (git keeps them at `99da7c0`); the two alternatives still worth a decision sit in labelled option boxes beside the frame they compete with.

Before drawing, the round-2 rules (A to J: the diet in force stated once; compaction across wet and dry with the counts spoken; the header cut to the non-routine kinds; no chevron on a single row; no cross-link lines; the rose only; the snippet; morning to night; the strip bounded by the date lens; the motion inventory) went to **two isolated checks** with the shipped code and the specs: the Data Scientist with Dr. Chen, and the Motion Designer with the Mobile IA. Each was asked to break the rules, not bless them.

**Seven attempts broke, four fixed on the page, three carried as briefs:** a foodless meal wore the unnamed trial-food shape (fixed: "no food recorded"); a day header dropped `other` (fixed: every non-routine kind is enumerated); a dismissed worth-a-call was rose on History and the month and absent on Home, three surfaces with three predicates (brief R2-5); a cut note flipped its meaning (fixed as far as a cut can be: at a word, the ellipsis inside the quotes); under the Vomit lens a day with meals and no vomit rendered the same as a day with nothing (fixed: three marks on a strip cell); the month-style grid under a long window was refused for the fold it costs (kept as an option, brief R2-2); the first-paint draw-in was ruled in against round 1's rule 8 on the condition Home's spine gets it in the same PR (a better-than-the-rule brief, R2-3). Held: a refused bowl before a vomit stays its own row; the 6 AM found vomit keys to one day; "Last 7 days" on a Monday is two live cells and honest.

Then the build: the round-1 renderer patched rather than replaced (the same fixture, the same node language), the per-day counts Jun 20 – Sep 21 pulled as counts only (a service-role read scoped to the owner's email and Nyx's id in one CTE, C-27) so the strip walks real weeks, the sections rewritten, 75 harness probes (every demo pressed twice, a computed style sampled mid-transition, reduced motion, zero page errors, two widths), one look at the renders, then the publish.

## What shipped

`docs/culprit-history-v2-mockups.html`, round 2: the masthead ledger (14 rows); §00 as built, folded; §01 the job; §02 the refined proposal on the real fortnight (the standing facts pinned, the reads sentence once, the strip, rose only, the snippets; demos: the first paint, a calm read resolving, open in place, the route, a removal folding a row out and the day re-speaking its count, the landed day); §03 the noise cut, the same day before and after, and rules A to G with the fact each is forbidden to hide; §04 the strip under "Last 30 days" (bounded, the arrow disabling with its reason at the edge, the outside days absent) with the window grid in an option box; §05 the delight inventory (seven gestures, each with the rule that keeps it from becoming a loop, and the refused list) with the two-way arrival specimen; §06 the row vocabulary redrawn; §07 the filters and the doorway contract, folded; §08 the AI and notes tables, folded, the ruled cells marked; §09 the two checks and three conflicts; §10 the five-column check over every number and the nineteen rules; §11 seven briefs (R2-1 the noise cut; R2-2 the strip under a long window; R2-3 the first paint as a better-than-the-rule brief; R2-4 a calm read arriving; R2-5 the dismissed escalation, one predicate for three surfaces; R2-6 Home's meals under the diet rule; R2-7 converge or another round); §12 what a go would file, re-sequenced (the strip its own PR; the read predicate its own PR because Home and the month depend on it; the snippet gated on CUL-848's cue).

## What the one look caught

Nothing structural this round; the harness caught the rest before the look: a noted row with no illustrative text on the page fell back to the retired glyph (given text); the round-1 header's word order in two captions; a probe that read a cross-origin stylesheet. The `.drail` stub under a closed compact row is round 1's "opens here" hint and stays.

## Persona sign-off

Designer ✓ (the ledger and the option boxes per the 09-09 directive; principles 1, 3, 5 on every frame; the voice pass on the new strings, including the reads sentence) — Data Scientist ✓ (isolated check: five breaks named with the counterexample, each fixed or briefed; the three-mark strip; the header's enumeration; the sort key) — Dr. Chen ✓ (isolated check: the timing line's reference meal as its own row; the dismissed escalation carried as R2-5 rather than settled; "unnamed only from a positive match") — Motion Designer · Mobile IA ✓ (isolated check: the first paint ruled in under conditions; the grid refused; the calm arrival; the labelled edge) — Trust & Safety ✓ (the snippet's condition became a build order on CUL-848; the look's note as a named sink; note text never read) — Engineer ✓ (the harness: 75/75, zero page errors, both widths) — QA ✓ (every demo twice; reduced motion; the fixtures listed in §12).

## PM actions

All on CUL-1076 (`Waiting on PM`): rule R2-1 to R2-6; answer R2-7 (converge on requirements, one more round, or park). Nothing filed; nothing built.
